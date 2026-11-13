import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVITY_JOURNAL_LIMITS, ActivityJournal, activityJournalFor, type ActivityJournalSnapshot,
} from '../../src/brain/activity-journal.js';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), openSync: vi.fn(actual.openSync) };
});

const session = { kind: 'session-start', source: 'measured', transport: 'mcp', agent: 'codex', sessionId: 'local-session' } as const;
const tool = { source: 'measured', transport: 'mcp', tool: 'context_pack', correlationId: 'call-1', sessionId: 'local-session' } as const;
const reported = { kind: 'phase', source: 'reported', transport: 'host', phase: 'verify', sessionId: 'local-session' } as const;
const at = '2026-01-01T00:00:00.000Z';
let dir: string;
let filePath: string;
let journal: ActivityJournal;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-journal-'));
  filePath = path.join(dir, 'sidecar', 'activity-journal.json');
  journal = new ActivityJournal({ filePath, lockTimeoutMs: 1000 });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

function fixture(count: number, journalId = randomUUID()): ActivityJournalSnapshot {
  return {
    schemaVersion: 1, journalId, revision: count, nextSequence: count + 1,
    events: Array.from({ length: count }, (_, index) => ({
      ...session, projectId: index % 2 ? 'alpha' : 'beta', id: randomUUID(), sequence: index + 1, timestamp: at,
    })),
  };
}

function writeFixture(contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function sequences(events: Array<{ sequence: number }>): number[] {
  return events.map(event => event.sequence);
}

describe('durable local activity journal', () => {
  it('keeps an empty read side-effect free and uses the selected memory-store directory', () => {
    const scoped = activityJournalFor({ dbPath: path.join(dir, 'sidecar', 'global.json') });
    expect(scoped.filePath).toBe(filePath);
    expect(scoped.get()).toEqual({ schemaVersion: 1, journalId: null, revision: 0, nextSequence: 1, events: [] });
    expect(scoped.read()).toEqual({
      journalId: null, revision: 0, oldestSequence: null, latestSequence: 0, nextAfterSequence: 0,
      hasMore: false, gap: false, reset: false, retainedCount: 0, droppedCount: 0, events: [],
    });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('durably distinguishes measured tool execution from explicitly reported phases', async () => {
    await journal.append({ ...session, projectId: 'alpha' });
    const began = await journal.append({ ...tool, kind: 'tool-start', projectId: 'alpha' });
    const ended = await journal.append({ ...tool, kind: 'tool-end', projectId: 'alpha', outcome: 'success', durationMs: 17.25 });
    const phase = await journal.append({ ...reported, projectId: 'alpha' });
    const externalTool = await journal.append({
      ...tool, source: 'reported', transport: 'host', kind: 'tool-end', tool: 'read_file',
      correlationId: 'host-call-1', outcome: 'success', durationMs: 42,
    });
    const reopened = new ActivityJournal({ filePath }).get();
    expect(sequences(reopened.events)).toEqual([1, 2, 3, 4, 5]);
    expect(reopened.revision).toBe(5);
    expect(reopened.nextSequence).toBe(6);
    expect(new Set(reopened.events.map(event => event.id)).size).toBe(5);
    expect(new Date(ended.timestamp).toISOString()).toBe(ended.timestamp);
    expect(ended.correlationId).toBe(began.correlationId);
    expect(reopened.events.filter(event => event.source === 'measured' && event.kind === 'tool-end'))
      .toMatchObject([{ durationMs: 17.25, outcome: 'success', transport: 'mcp' }]);
    expect(phase).toMatchObject({ source: 'reported', transport: 'host', phase: 'verify' });
    expect(phase).not.toHaveProperty('durationMs');
    expect(externalTool).toMatchObject({ source: 'reported', transport: 'host', durationMs: 42 });
    expect(new ActivityJournal({ filePath }).read().journalId).toBe(reopened.journalId);
  });

  it('rejects unbounded, misclassified, or extra metadata and leaves no journal artifacts', async () => {
    const invalid = [
      { ...session, arguments: { query: 'fixture input' } },
      { ...session, content: 'fixture memory' },
      { ...session, error: 'fixture stack trace' },
      { ...session, path: '/synthetic/project' },
      { ...session, projectId: 'project/name' },
      { ...session, sessionId: 'x'.repeat(129) },
      { ...session, agent: 'spaces are not labels' },
      { ...session, sequence: 100 },
      { ...reported, source: 'measured', transport: 'mcp' },
      { ...reported, phase: 'thinking' },
      { ...tool, kind: 'tool-start', transport: 'host' },
      { ...tool, kind: 'tool-start', source: 'reported', transport: 'host', arguments: ['fixture'] },
      { ...tool, kind: 'tool-start', outcome: 'success' },
      { ...tool, kind: 'tool-end', durationMs: -1, outcome: 'error' },
      { ...tool, kind: 'tool-end', durationMs: Infinity, outcome: 'error' },
      { ...tool, kind: 'tool-end', outcome: 'error' },
      { ...tool, kind: 'tool-start', correlationId: undefined },
    ];
    for (const event of invalid) {
      await expect(journal.append(event)).rejects.toMatchObject({ code: 'ACTIVITY_JOURNAL_INVALID_EVENT' });
    }
    for (const input of [{ afterSequence: -1 }, { limit: 201 }, { journalId: 'not-a-uuid' }, { projectId: '../other' }]) {
      expect(() => journal.read(input)).toThrow(expect.objectContaining({ code: 'ACTIVITY_JOURNAL_INVALID_CURSOR' }));
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('keeps the latest 500 and reports initial windows, pagination, retention gaps and filtered advancement', async () => {
    const initial = fixture(ACTIVITY_JOURNAL_LIMITS.retained);
    writeFixture(JSON.stringify(initial));
    await journal.append({ ...session, projectId: 'alpha' });
    await journal.append({ ...session, projectId: 'beta' });
    expect(journal.get()).toMatchObject({ journalId: initial.journalId, revision: 502, nextSequence: 503 });

    const newest = journal.read({ limit: 3 });
    expect(sequences(newest.events)).toEqual([500, 501, 502]);
    expect(newest).toMatchObject({
      oldestSequence: 3, latestSequence: 502, nextAfterSequence: 502, retainedCount: 500,
      droppedCount: 2, hasMore: false, gap: false, reset: false,
    });

    const paged = journal.read({ journalId: initial.journalId!, afterSequence: 0, limit: 2 });
    expect(sequences(paged.events)).toEqual([3, 4]);
    expect(paged).toMatchObject({ gap: true, hasMore: true, nextAfterSequence: 4 });
    const following = journal.read({ journalId: initial.journalId!, afterSequence: paged.nextAfterSequence, limit: 2 });
    expect(sequences(following.events)).toEqual([5, 6]);
    expect(following.gap).toBe(false);

    const filtered = journal.read({ journalId: initial.journalId!, afterSequence: 498, limit: 1, projectId: 'alpha' });
    expect(sequences(filtered.events)).toEqual([500]);
    expect(filtered).toMatchObject({ hasMore: true, nextAfterSequence: 500 });
    const filteredNext = journal.read({ journalId: initial.journalId!, afterSequence: filtered.nextAfterSequence, limit: 1, projectId: 'alpha' });
    expect(sequences(filteredNext.events)).toEqual([501]);
    expect(filteredNext).toMatchObject({ hasMore: false, nextAfterSequence: 502 });
    expect(journal.read({ afterSequence: 502, projectId: 'alpha' }).events).toEqual([]);
  });

  it('resets a cursor when journal identity changes even when sequence numbers overlap', () => {
    const old = fixture(5);
    writeFixture(JSON.stringify(old));
    const cursor = journal.read({ limit: 1 });
    const replacement = fixture(7);
    fs.writeFileSync(filePath, JSON.stringify(replacement));
    const reset = journal.read({ journalId: cursor.journalId!, afterSequence: cursor.nextAfterSequence, limit: 2 });
    expect(reset).toMatchObject({ journalId: replacement.journalId, reset: true, gap: false, nextAfterSequence: 7 });
    expect(sequences(reset.events)).toEqual([6, 7]);
    expect(journal.read({ journalId: replacement.journalId!, afterSequence: 99, limit: 1 }).reset).toBe(true);
    fs.unlinkSync(filePath);
    expect(journal.read({ journalId: replacement.journalId!, afterSequence: 7 })).toMatchObject({ journalId: null, reset: true, nextAfterSequence: 0 });
  });

  it.each(['invalid JSON', '{"schemaVersion":2}'])('does not replace corrupt or unsupported journal bytes', async raw => {
    writeFixture(raw);
    expect(() => journal.read()).toThrow(expect.objectContaining({ code: 'ACTIVITY_JOURNAL_INVALID_STORE' }));
    await expect(journal.append(session)).rejects.toMatchObject({ code: 'ACTIVITY_JOURNAL_INVALID_STORE' });
    expect(fs.readFileSync(filePath, 'utf8')).toBe(raw);
    expect(fs.readdirSync(path.dirname(filePath))).toEqual(['activity-journal.json']);
  });

  it('rejects stored sequence gaps, duplicated event identities, and files beyond its read bound', () => {
    const invalid = fixture(2);
    invalid.events[1].sequence = 3;
    writeFixture(JSON.stringify(invalid));
    expect(() => journal.get()).toThrow(/malformed/);
    invalid.events[1].sequence = 2;
    invalid.events[1].id = invalid.events[0].id;
    fs.writeFileSync(filePath, JSON.stringify(invalid));
    expect(() => journal.get()).toThrow(/malformed/);
    fs.truncateSync(filePath, ACTIVITY_JOURNAL_LIMITS.bytes + 1);
    expect(() => journal.get()).toThrow(/size limit/);
  });

  it('preserves the previous commit on failed replacement and leaves another writer artifacts alone', async () => {
    const initial = await journal.append(session);
    const before = fs.readFileSync(filePath);
    const foreignTemp = filePath + '.foreign.tmp';
    fs.writeFileSync(foreignTemp, 'separate fixture');
    vi.mocked(fs.renameSync).mockImplementationOnce(() => { throw new Error('injected rename failure'); });
    await expect(journal.append(reported)).rejects.toMatchObject({ code: 'ACTIVITY_JOURNAL_WRITE_FAILED' });
    expect(fs.readFileSync(filePath)).toEqual(before);
    expect(fs.readFileSync(foreignTemp, 'utf8')).toBe('separate fixture');
    expect(fs.readdirSync(path.dirname(filePath)).sort()).toEqual(['activity-journal.json', 'activity-journal.json.foreign.tmp']);

    const next = await journal.append(reported);
    expect(next.sequence).toBe(initial.sequence + 1);
    expect(sequences(journal.get().events)).toEqual([1, 2]);
  });

  it('bounds lock contention and preserves an old lock held by another writer', async () => {
    fs.mkdirSync(path.dirname(filePath));
    const lockPath = filePath + '.lock';
    fs.writeFileSync(lockPath, 'separate lock owner');
    const old = new Date('2000-01-01T00:00:00.000Z');
    fs.utimesSync(lockPath, old, old);
    const waiting = new ActivityJournal({ filePath, lockTimeoutMs: 50 });
    const start = performance.now();
    await expect(waiting.append(session)).rejects.toMatchObject({ code: 'ACTIVITY_JOURNAL_LOCK_TIMEOUT' });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('separate lock owner');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('recovers from a transient exclusive-create sharing error and reports persistent permission denial', async () => {
    const real = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(fs.openSync).mockImplementationOnce((filename, flags, mode) => {
      expect(filename).toBe(filePath + '.lock');
      expect(flags).toBe('wx');
      throw Object.assign(new Error('injected pending lock removal'), { code: 'EPERM' });
    });
    expect((await journal.append(session)).sequence).toBe(1);
    const before = fs.readFileSync(filePath);
    vi.mocked(fs.openSync).mockImplementation((filename, flags, mode) => {
      if (filename === filePath + '.lock' && flags === 'wx') {
        throw Object.assign(new Error('injected persistent access denial'), { code: 'EACCES' });
      }
      return real.openSync(filename, flags, mode);
    });
    try {
      await expect(new ActivityJournal({ filePath, lockTimeoutMs: 40 }).append(reported))
        .rejects.toMatchObject({ code: 'ACTIVITY_JOURNAL_LOCK_FAILED', message: expect.stringContaining('EACCES') });
      expect(fs.readFileSync(filePath)).toEqual(before);
    } finally {
      vi.mocked(fs.openSync).mockImplementation(real.openSync);
    }
  });

  it('persists exact event identities and contiguous sequences across separate writer processes', async () => {
    const compiledDir = path.join(dir, 'compiled');
    fs.mkdirSync(compiledDir);
    fs.writeFileSync(path.join(compiledDir, 'package.json'), '{"type":"module"}');
    for (const filename of ['activity-journal', 'file-identity']) {
      const source = fs.readFileSync(new URL(`../../src/brain/${filename}.ts`, import.meta.url), 'utf8');
      const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } });
      fs.writeFileSync(path.join(compiledDir, filename + '.js'), outputText);
    }
    const compiled = path.join(compiledDir, 'activity-journal.js');
    const workerPath = fileURLToPath(new URL('../fixtures/activity-journal-writer.mjs', import.meta.url));
    const workers: ChildProcess[] = [];
    try {
      const ready = Array.from({ length: 4 }, (_, index) => {
        const worker = fork(workerPath, [pathToFileURL(compiled).href, filePath, 'fixture-' + index], {
          execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        });
        workers.push(worker);
        return nextMessage(worker);
      });
      expect(await Promise.all(ready)).toEqual(workers.map(() => ({ ready: true })));
      const result = workers.map(worker => nextMessage(worker) as Promise<{ ids: string[] }>);
      for (const worker of workers) worker.send('write');
      const ids = (await Promise.all(result)).flatMap(value => value.ids);
      const reopened = new ActivityJournal({ filePath }).get();
      expect(reopened).toMatchObject({ revision: 40, nextSequence: 41 });
      expect(new Set(ids).size).toBe(40);
      expect(new Set(reopened.events.map(event => event.id))).toEqual(new Set(ids));
      expect(sequences(reopened.events)).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
      expect(fs.readdirSync(path.dirname(filePath))).toEqual(['activity-journal.json']);
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
    once(worker, 'exit').then(([code]) => { throw new Error('Journal writer exited before reporting its result (' + code + ').'); }),
  ]);
}
