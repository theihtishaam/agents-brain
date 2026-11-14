import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';
import { ActivityJournal } from '../../src/brain/activity-journal.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';

type Portal = Awaited<ReturnType<typeof startProjectWorkspace>>;
type Message = { id: string; event: string; data: Record<string, unknown> };
const cleanup: Array<() => Promise<unknown>> = [];

async function portal() {
  const temporary = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(temporary, 'sb-live-test-'));
  cleanup.push(async () => {
    const canonical = await fs.realpath(root);
    if (path.dirname(canonical) !== temporary || !path.basename(canonical).startsWith('sb-live-test-')) {
      throw new Error('Unexpected stream fixture cleanup path.');
    }
    await fs.rm(canonical, { recursive: true, force: true });
  });
  const workspace = await startProjectWorkspace(root);
  cleanup.push(workspace.close);
  return workspace;
}

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function connect(workspace: Portal, options: { cursor?: string; headers?: Record<string, string> } = {}) {
  const abort = new AbortController();
  const response = await fetch(workspace.url + '/api/workspace/stream' +
    (options.cursor ? '?cursor=' + encodeURIComponent(options.cursor) : ''), { signal: abort.signal, headers: options.headers });
  const reader = response.body!.getReader();
  cleanup.push(async () => { abort.abort(); await reader.cancel().catch(() => undefined); });
  let pending = '';
  const decoder = new TextDecoder();
  const next = async (): Promise<Message | undefined> => {
    while (true) {
      const end = pending.indexOf('\n\n');
      if (end !== -1) {
        const lines = pending.slice(0, end).split('\n');
        pending = pending.slice(end + 2);
        const event = lines.find(line => line.startsWith('event: '))?.slice(7);
        if (!event) continue;
        return { id: lines.find(line => line.startsWith('id: '))!.slice(4), event,
          data: JSON.parse(lines.find(line => line.startsWith('data: '))!.slice(6)) };
      }
      const chunk = await reader.read();
      if (chunk.done) return undefined;
      pending += decoder.decode(chunk.value, { stream: true });
    }
  };
  const wait = async (match: (message: Message) => boolean): Promise<Message> => {
    const timeout = setTimeout(() => abort.abort('Timed out waiting for stream notification.'), 3500);
    try {
      while (true) {
        const event = await next();
        if (!event) throw new Error('Stream closed before expected notification.');
        if (match(event)) return event;
      }
    } finally { clearTimeout(timeout); }
  };
  return { response, wait, next, abort: () => abort.abort() };
}

const is = (kind: string) => (event: Message) => event.event === kind;

describe('project live notification stream', () => {
  it('sends journal invalidation, replays retained sequence, and resets a foreign instance cursor', async () => {
    const workspace = await portal();
    const primary = await connect(workspace);
    const ready = await primary.wait(is('ready'));
    expect(primary.response.headers.get('content-type')).toContain('text/event-stream');
    const writer = new ActivityJournal({ filePath: workspace.journalPath });
    await writer.append({ kind: 'phase', source: 'reported', transport: 'host', projectId: workspace.projectId,
      sessionId: randomUUID(), agent: 'fixture-client', phase: 'work' });
    const change = await primary.wait(is('change'));
    expect(change.data).toMatchObject({ kind: 'change', areas: ['telemetry'], serverInstanceId: ready.data.serverInstanceId });
    expect(change.data).not.toHaveProperty('phase');
    const replay = await connect(workspace, { headers: { 'Last-Event-ID': ready.id } });
    expect(await replay.wait(is('change'))).toEqual(change);
    expect((await replay.wait(is('ready'))).id).toBe(change.id);
    const foreign = await connect(workspace, { cursor: randomUUID() + ':0' });
    expect((await foreign.wait(is('reset'))).data.serverInstanceId).toBe(ready.data.serverInstanceId);
    for (const headers of [{ Origin: 'https://invalid.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
      expect((await fetch(workspace.url + '/api/workspace/stream', { headers })).status).toBe(403);
    }
  });

  it('reports bounded file metadata only and stops watching when recording or display is disabled', async () => {
    const workspace = await portal();
    const settings = new FeatureSettingsStore({ filePath: workspace.settingsPath });
    await fs.mkdir(path.join(workspace.root, 'src'));
    for (const directory of ['node_modules', '.codex', 'private']) await fs.mkdir(path.join(workspace.root, directory));
    await fs.writeFile(path.join(workspace.root, 'src', 'ready.txt'), 'initial file body');
    await settings.update({ projectFileActivity: true });
    const stream = await connect(workspace);
    await stream.wait(message => message.event === 'watch' && (message.data.watch as { status: string }).status === 'watching');
    const getFiles = () => fetch(workspace.url + '/api/workspace/project-files').then(response => response.json());
    const snapshot = await getFiles();
    expect(snapshot.items.map((item: { path: string }) => item.path)).toEqual(expect.arrayContaining(['src', 'src/ready.txt']));
    expect(JSON.stringify(snapshot)).not.toMatch(/initial file body|node_modules|\.codex|private/u);
    await fs.writeFile(path.join(workspace.root, '.env.test'), 'synthetic exclusion');
    await fs.writeFile(path.join(workspace.root, 'synthetic-credentials.json'), 'synthetic exclusion');
    await fs.writeFile(path.join(workspace.root, 'node_modules', 'module.js'), 'synthetic exclusion');
    await fs.writeFile(path.join(workspace.root, 'private', 'note.md'), 'synthetic exclusion');
    await fs.symlink(os.tmpdir(), path.join(workspace.root, 'allowed-link'), process.platform === 'win32' ? 'junction' : 'dir');
    const target = path.join(workspace.root, 'src', 'changed.txt');
    await fs.writeFile(target, 'synthetic marker should never appear');
    await fs.appendFile(target, 'write two');
    const file = await stream.wait(message => message.event === 'file' && message.data.path === 'src/changed.txt');
    expect(file.data).toMatchObject({ path: 'src/changed.txt', exists: true, entry: 'file' });
    expect(JSON.stringify(file)).not.toContain('synthetic marker');
    await fs.unlink(target);
    expect((await stream.wait(message => message.event === 'file' && message.data.path === 'src/changed.txt' && message.data.exists === false)).data.path).toBe('src/changed.txt');
    expect(JSON.stringify(await getFiles())).not.toMatch(/\.env|node_modules|synthetic-credentials|private|allowed-link/u);
    await settings.update({ activityRecording: false });
    expect((await stream.wait(is('watch'))).data.watch).toMatchObject({ status: 'off', directories: 0 });
    expect((await getFiles()).events).toEqual([]);
    await settings.update({ liveActivity: false });
    await stream.wait(is('disabled'));
    expect(await stream.next()).toBeUndefined();
  });

  it('bounds open subscriptions and marks an exhausted watch scope as limited', async () => {
    const workspace = await portal();
    const settings = new FeatureSettingsStore({ filePath: workspace.settingsPath });
    await Promise.all(Array.from({ length: 72 }, (_, index) => fs.mkdir(path.join(workspace.root, 'fixture-' + index))));
    await settings.update({ projectFileActivity: true });
    const streams = [];
    for (let n = 0; n < 8; n++) {
      const stream = await connect(workspace);
      await stream.wait(is('ready'));
      streams.push(stream);
    }
    expect((await fetch(workspace.url + '/api/workspace/stream')).status).toBe(429);
    await streams[0].wait(message => message.event === 'watch' && (message.data.watch as { status: string }).status === 'limited');
    const data = await fetch(workspace.url + '/api/workspace/project-files').then(response => response.json());
    expect(data.watch).toMatchObject({ status: 'limited', directories: 64 });
    await workspace.close();
    await expect(streams[1].wait(() => false)).rejects.toThrow();
  });
});
