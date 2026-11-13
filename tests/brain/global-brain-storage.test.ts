import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { getBrainBus } from '../../src/brain/brain-bus.js';
import type { GlobalBrainConfig } from '../../src/types.js';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

// Production entry points share a singleton. Test two separately loaded snapshots in-process.
const Brain = GlobalBrain as unknown as new (config: Partial<GlobalBrainConfig>) => GlobalBrain;
const example = {
  projectId: 'test-project',
  projectName: 'test project',
  agentTool: 'codex' as const,
  category: 'lesson',
  content: 'Synthetic storage test entry',
  importance: 0.5,
  metadata: {},
};

let dir: string;
let dbPath: string;
let instances: GlobalBrain[];

function makeBrain(config: Partial<GlobalBrainConfig> = {}): GlobalBrain {
  const instance = new Brain({ dbPath, syncIntervalMs: 60_000, lockTimeoutMs: 120, ...config });
  instances.push(instance);
  return instance;
}

function readDisk() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-storage-'));
  dbPath = path.join(dir, 'global.json');
  instances = [];
  getBrainBus().reset();
});

afterEach(async () => {
  for (const brain of instances) await brain.shutdown().catch(() => {});
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GlobalBrain storage', () => {
  it('refreshes external commits while preserving queued operations without flushing or acknowledging them', async () => {
    const first = makeBrain();
    const second = makeBrain();
    await first.init();
    const original = first.writeSync(example);
    await first.sync();
    await second.init();
    first.touch(original);
    const staged = first.writeSync({ ...example, content: 'staged locally' });
    let acknowledged = false;
    const queued = first.write({ ...example, content: 'waiting for commit' }).then(ok => { acknowledged = ok; return ok; });
    const external = second.writeSync({ ...example, content: 'committed elsewhere' });
    await second.sync();
    const before = fs.readFileSync(dbPath);
    first.refresh();
    expect(fs.readFileSync(dbPath)).toEqual(before);
    expect(acknowledged).toBe(false);
    expect(first.getEntry(staged)?.content).toBe('staged locally');
    expect(first.getEntry(external)?.content).toBe('committed elsewhere');
    expect(first.getEntry(original)?.accessCount).toBe(1);
    expect(first.getStorageHealth().pendingOperations).toBe(3);
    await first.sync();
    expect(await queued).toBe(true);
    expect(readDisk().entries).toHaveLength(4);
  });

  it.each([false, true])('merges two stale writers in either order (%s)', async (reverse) => {
    const first = makeBrain();
    const second = makeBrain();
    await first.init();
    await second.init();

    const firstId = first.writeSync({ ...example, content: 'first addition' });
    const secondId = second.writeSync({ ...example, content: 'second addition' });
    const projectId = first.registerProject(path.join(dir, 'project'), 'registered project');
    first.registerAgent('codex');
    second.registerAgent('codex');
    for (const writer of reverse ? [second, first] : [first, second]) await writer.sync();

    const reader = makeBrain();
    await reader.init();
    expect(new Set(reader.recall().map(entry => entry.id))).toEqual(new Set([firstId, secondId]));
    expect(readDisk().projects).toEqual([expect.objectContaining({ id: projectId, name: 'registered project' })]);
    expect(readDisk().agents).toEqual([expect.objectContaining({ tool: 'codex', sessionCount: 2 })]);
  });

  it('refreshes a stale reader on read-only sync without modifying disk bytes', async () => {
    const reader = makeBrain({ autoPruneMB: 0 });
    const writer = makeBrain();
    await reader.init();
    await writer.init();
    const id = writer.writeSync(example);
    await writer.sync();
    const before = fs.readFileSync(dbPath);
    const beforeStat = fs.statSync(dbPath);
    expect(reader.recallByIds([id])).toEqual([]);
    await reader.sync();
    expect(reader.recallByIds([id])).toHaveLength(1);
    expect(reader.getStorageHealth().lastSuccessfulSync).toBeNull();
    await reader.shutdown();
    expect(fs.readFileSync(dbPath)).toEqual(before);
    expect(fs.statSync(dbPath).mtimeMs).toBe(beforeStat.mtimeMs);
  });

  it('combines touch deltas and preserves the latest access and registration timestamps', async () => {
    const first = makeBrain();
    const second = makeBrain();
    await first.init();
    const id = first.writeSync(example);
    await first.sync();
    await second.init();

    const originalNow = Date.now();
    const clock = vi.spyOn(Date, 'now');
    clock.mockReturnValue(originalNow + 2_000);
    first.touch(id);
    const project = path.join(dir, 'registered-project');
    first.registerProject(project, 'latest name');
    first.registerAgent('codex');

    clock.mockReturnValue(originalNow + 1_000);
    second.touch(id);
    second.touch(id);
    second.registerProject(project, 'earlier name');
    second.registerAgent('codex');
    clock.mockRestore();
    await first.sync();
    await second.sync();

    const disk = readDisk();
    expect(disk.entries[0]).toMatchObject({ id, accessCount: 3, lastAccessed: new Date(originalNow + 2_000).toISOString() });
    expect(disk.projects[0]).toMatchObject({
      name: 'latest name', firstSeen: originalNow + 1_000, lastSeen: originalNow + 2_000,
    });
    expect(disk.agents[0]).toMatchObject({
      tool: 'codex', sessionCount: 2, firstSeen: originalNow + 1_000, lastSeen: originalNow + 2_000,
    });
  });

  it('keeps a pruned entry deleted when a stale writer touches it and adds a memory', async () => {
    const pruner = makeBrain({ autoPruneMB: 0 });
    const stale = makeBrain();
    const oldDate = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(dbPath, JSON.stringify({
      schemaVersion: 1,
      entries: [{ ...example, id: 'old', importance: 0.1, accessCount: 0, createdAt: oldDate, lastAccessed: oldDate }],
      projects: [],
      agents: [],
      extraField: { preserve: true },
    }));

    await pruner.init();
    await stale.init();
    stale.touch('old');
    pruner.registerAgent('codex');
    await pruner.sync();
    expect(readDisk().entries).toEqual([]);
    expect(pruner.getStats().lastPrune).toBeInstanceOf(Date);
    const newId = stale.writeSync({ ...example, metadata: { synthetic: true } });
    await stale.sync();
    expect(readDisk()).toMatchObject({
      entries: [expect.objectContaining({ id: newId })],
      extraField: { preserve: true },
    });
    expect(stale.recallByIds(['old'])).toEqual([]);
  });

  it('acknowledges a queued write only after atomic replacement and retains a failed write for one retry', async () => {
    const brain = makeBrain();
    await brain.init();
    const existingId = brain.writeSync(example);
    await brain.sync();
    const original = fs.readFileSync(dbPath);
    const originalLastSync = brain.getStorageHealth().lastSuccessfulSync;
    const queued = brain.write({ ...example, content: 'retryable queued entry' });
    expect(brain.getStorageHealth()).toMatchObject({ status: 'pending', pendingOperations: 1 });
    expect(brain.recall({ keywords: ['retryable'] })).toEqual([]);
    expect(getBrainBus().recent()).toHaveLength(1);

    vi.mocked(fs.renameSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('injected synthetic error'), { code: 'EPERM' });
    });
    await expect(brain.sync()).rejects.toMatchObject({ code: 'STORE_WRITE_FAILED' });
    await expect(queued).resolves.toBe(false);
    expect(fs.readFileSync(dbPath)).toEqual(original);
    expect(fs.readdirSync(dir)).toEqual(['global.json']);
    expect(getBrainBus().recent()).toHaveLength(1);
    const health = brain.getStorageHealth();
    expect(health).toMatchObject({
      status: 'error', initialized: true, pendingOperations: 1, lastSuccessfulSync: originalLastSync,
      lastError: { code: 'STORE_WRITE_FAILED', message: expect.stringContaining('EPERM'), at: expect.any(String) },
    });
    health.lastError!.message = 'caller mutation';
    expect(brain.getStorageHealth().lastError?.message).toContain('EPERM');

    await brain.sync();
    await brain.sync();
    expect(brain.getStorageHealth()).toMatchObject({ status: 'healthy', pendingOperations: 0, lastError: null });
    expect(readDisk().entries).toEqual([
      expect.objectContaining({ id: existingId }),
      expect.objectContaining({ content: 'retryable queued entry' }),
    ]);
    expect(getBrainBus().recent()).toHaveLength(2);

    const afterRetry = brain.write({ ...example, content: 'successfully acknowledged entry' });
    const verified = afterRetry.then(success => {
      expect(success).toBe(true);
      expect(readDisk().entries).toContainEqual(expect.objectContaining({ content: 'successfully acknowledged entry' }));
    });
    await brain.sync();
    await verified;
  });

  it('times out without stealing an old live lock or removing another writer temporary file', async () => {
    const brain = makeBrain({ lockTimeoutMs: 70 });
    await brain.init();
    const lockPath = dbPath + '.lock';
    const lockContents = JSON.stringify({ pid: process.pid, id: 'different-owner', acquiredAt: '2000-01-01T00:00:00.000Z' });
    const tempPath = dbPath + '.different-owner.tmp';
    fs.writeFileSync(lockPath, lockContents, { flag: 'wx' });
    fs.writeFileSync(tempPath, 'different writer contents', { flag: 'wx' });
    const oldDate = new Date('2000-01-01T00:00:00.000Z');
    fs.utimesSync(lockPath, oldDate, oldDate);

    const queued = brain.write(example);
    const begin = performance.now();
    await expect(brain.sync()).rejects.toMatchObject({ code: 'STORE_LOCK_TIMEOUT' });
    expect(performance.now() - begin).toBeGreaterThanOrEqual(65);
    expect(performance.now() - begin).toBeLessThan(3_000);
    await expect(queued).resolves.toBe(false);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(lockContents);
    expect(fs.readFileSync(tempPath, 'utf8')).toBe('different writer contents');
    expect(fs.existsSync(dbPath)).toBe(false);

    fs.unlinkSync(lockPath);
    await brain.sync();
    expect(readDisk().entries).toHaveLength(1);
    expect(fs.existsSync(tempPath)).toBe(true);
  });

  it('includes local operations staged while a commit waits for the interprocess lock', async () => {
    const brain = makeBrain();
    await brain.init();
    const lockPath = dbPath + '.lock';
    fs.writeFileSync(lockPath, 'other owner', { flag: 'wx' });
    const first = brain.write({ ...example, content: 'first pending' });
    const flush = brain.sync();
    const second = brain.write({ ...example, content: 'staged while waiting' });
    fs.unlinkSync(lockPath);

    await flush;
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(readDisk().entries.map((entry: { content: string }) => entry.content)).toEqual([
      'first pending', 'staged while waiting',
    ]);
  });

  it.each([
    ['{"schemaVersion":1,"entries":[broken', 'STORE_INVALID_JSON'],
    ['{"schemaVersion":1,"entries":[{}],"projects":[],"agents":[]}', 'STORE_INVALID_SCHEMA'],
    ['{"schemaVersion":999,"entries":[],"projects":[],"agents":[]}', 'STORE_UNSUPPORTED_SCHEMA'],
  ])('refuses an invalid or unsupported store and leaves its bytes intact (%s)', async (contents, code) => {
    fs.writeFileSync(dbPath, contents);
    const brain = makeBrain();
    await expect(brain.init()).rejects.toMatchObject({ code });
    expect(brain.getStorageHealth()).toMatchObject({
      status: 'error', initialized: false, pendingOperations: 0, lastError: { code },
    });
    await expect(brain.write(example)).rejects.toMatchObject({ code });
    expect(fs.readFileSync(dbPath, 'utf8')).toBe(contents);
    expect(fs.readdirSync(dir)).toEqual(['global.json']);
  });

  it('reports an unreadable store separately from missing or corrupt JSON', async () => {
    fs.mkdirSync(dbPath);
    const marker = path.join(dbPath, 'untouched');
    fs.writeFileSync(marker, 'synthetic');
    const brain = makeBrain();
    await expect(brain.init()).rejects.toMatchObject({ code: 'STORE_READ_FAILED' });
    expect(fs.readFileSync(marker, 'utf8')).toBe('synthetic');
  });

  it('never overwrites a corrupt latest snapshot from an initialized stale writer', async () => {
    const brain = makeBrain();
    await brain.init();
    brain.writeSync(example);
    await brain.sync();
    const valid = fs.readFileSync(dbPath);
    fs.writeFileSync(dbPath, 'invalid latest contents');
    const queued = brain.write({ ...example, content: 'pending on corrupt store' });

    await expect(brain.sync()).rejects.toMatchObject({ code: 'STORE_INVALID_JSON' });
    await expect(queued).resolves.toBe(false);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('invalid latest contents');
    expect(brain.getStorageHealth()).toMatchObject({ pendingOperations: 1 });
    fs.writeFileSync(dbPath, valid);
    await brain.sync();
    expect(readDisk().entries).toHaveLength(2);
  });

  it('clears the timer on failed shutdown and allows an explicit retry', async () => {
    const brain = makeBrain({ lockTimeoutMs: 0 });
    await brain.init();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const lockPath = dbPath + '.lock';
    fs.writeFileSync(lockPath, 'other owner', { flag: 'wx' });
    const queued = brain.write(example);
    await expect(brain.shutdown()).rejects.toMatchObject({ code: 'STORE_LOCK_TIMEOUT' });
    expect(clear).toHaveBeenCalledTimes(1);
    await expect(queued).resolves.toBe(false);
    expect(brain.getStorageHealth()).toMatchObject({ initialized: true, status: 'error', pendingOperations: 1 });

    fs.unlinkSync(lockPath);
    await brain.shutdown();
    expect(readDisk().entries).toHaveLength(1);
    expect(brain.getStorageHealth()).toMatchObject({ initialized: false, status: 'healthy', pendingOperations: 0 });
  });

  it('retains every acknowledged ID from cooperating Node processes', async () => {
    // Compile this module independently so npm test exercises current source without a prior dist build.
    const compiledDir = path.join(dir, 'compiled');
    fs.mkdirSync(compiledDir);
    fs.writeFileSync(path.join(compiledDir, 'package.json'), '{"type":"module"}');
    for (const filename of ['global-brain', 'brain-bus', 'context-retrieval', 'memory-sources', 'task-workflow', 'file-identity']) {
      const source = fs.readFileSync(new URL(`../../src/brain/${filename}.ts`, import.meta.url), 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      });
      fs.writeFileSync(path.join(compiledDir, `${filename}.js`), outputText);
    }

    const workerPath = fileURLToPath(new URL('../fixtures/global-brain-writer.mjs', import.meta.url));
    const moduleUrl = pathToFileURL(path.join(compiledDir, 'global-brain.js')).href;
    const workers: ChildProcess[] = [];
    try {
      const ready = Array.from({ length: 4 }, (_, index) => {
        const worker = fork(workerPath, [moduleUrl, dbPath, `writer-${index}`], {
          execArgv: [],
          stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        });
        workers.push(worker);
        return nextMessage(worker);
      });
      expect(await Promise.all(ready)).toEqual(workers.map(() => ({ ready: true })));

      const results = workers.map(worker => nextMessage(worker) as Promise<{ ids: string[] }>);
      for (const worker of workers) worker.send('write');
      const acknowledgedIds = (await Promise.all(results)).flatMap(({ ids }) => ids);
      expect(acknowledgedIds).toHaveLength(40);
      expect(new Set(acknowledgedIds).size).toBe(40);
      expect(readDisk().entries.map((entry: { id: string }) => entry.id).sort()).toEqual(acknowledgedIds.sort());
      expect(readDisk().agents).toEqual([expect.objectContaining({ tool: 'codex', sessionCount: 4 })]);

      const reopened = makeBrain();
      await reopened.init();
      expect(reopened.recall({ limit: 100 }).map(entry => entry.id).sort()).toEqual(acknowledgedIds);
      expect(fs.readdirSync(dir).sort()).toEqual(['compiled', 'global.json']);
    } finally {
      await Promise.all(workers.map(async worker => {
        if (worker.exitCode !== null || worker.signalCode !== null) return;
        const exited = once(worker, 'exit');
        worker.kill();
        await exited;
      }));
    }
  }, 20_000);
});

async function nextMessage(worker: ChildProcess): Promise<unknown> {
  return Promise.race([
    once(worker, 'message').then(([message]) => message),
    once(worker, 'exit').then(([code]) => { throw new Error(`Writer exited before reporting its result (${code})`); }),
  ]);
}

