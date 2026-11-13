import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { HUB_OPERATOR } from '../../src/brain/project-hub-contract.js';
import { ProjectHubService } from '../../src/brain/project-hub.js';
import { projectStorage } from '../../src/brain/project-memory.js';

const cli = resolve('dist/cli.js');
const key = () => ({ key: randomUUID() });

class FixtureClient {
  private child: ChildProcessWithoutNullStreams;
  private next = 1;
  private readonly calls = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  readonly closed: Promise<any[]>;

  constructor(project: string, db: string) {
    this.child = spawn(process.execPath, [cli, 'mcp', project, '--stdio', '--db', db], { cwd: project, windowsHide: true });
    this.closed = once(this.child, 'close');
    this.child.stderr.resume();
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      const response = JSON.parse(line);
      const call = this.calls.get(response.id);
      this.calls.delete(response.id);
      call?.resolve(response);
    });
    const stop = (error: Error) => {
      for (const call of this.calls.values()) call.reject(error);
      this.calls.clear();
    };
    this.child.on('error', stop);
    this.child.on('close', () => stop(new Error('Fixture MCP closed before returning a response.')));
  }

  private request(method: string, params: object = {}): Promise<any> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async initialize() {
    const handshake = await this.request('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'fixture-mcp', version: '1' }, capabilities: {} });
    expect(handshake.result.protocolVersion).toBe('2025-11-25');
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return (await this.request('tools/list')).result.tools;
  }

  call(name: string, args: object = {}) { return this.request('tools/call', { name, arguments: args }); }

  async stop() {
    if (!this.child.stdin.writableEnded) this.child.stdin.end();
    const [code] = await this.closed;
    expect(code).toBe(0);
  }
}

it('shares project-local rooms through two independent stdio clients, persists replay and guards identity', async () => {
  const a = mkdtempSync(join(tmpdir(), 'hub-mcp-a-'));
  const b = mkdtempSync(join(tmpdir(), 'hub-mcp-b-'));
  const pa = projectStorage(a), pb = projectStorage(b);
  const brain = GlobalBrain.createIsolated({ dbPath: pa.storagePath });
  const hub = new ProjectHubService(a, brain);
  const clients = [new FixtureClient(a, pa.storagePath), new FixtureClient(a, pa.storagePath), new FixtureClient(b, pb.storagePath), new FixtureClient(b, join(b, 'separate.json'))];
  const [planner, worker, foreign, unpinned] = clients;
  const action = (client: FixtureClient, roomId: string, command: object) => client.call('hub_room_action', { roomId, command });
  const payload = (response: any) => {
    expect(response.error, JSON.stringify(response)).toBeUndefined();
    expect(response.result.isError, JSON.stringify(response)).toBeUndefined();
    return response.result.structuredContent;
  };
  try {
    const catalogs = await Promise.all(clients.map(client => client.initialize()));
    for (const catalog of catalogs.slice(0, 3)) {
      expect(catalog.filter((tool: any) => tool.name.startsWith('hub_')).map((tool: any) => tool.name)).toEqual([
        'hub_overview', 'hub_room_read', 'hub_room_create', 'hub_room_action', 'hub_lesson_propose',
      ]);
    }
    expect(catalogs[3].some((tool: any) => tool.name.startsWith('hub_'))).toBe(false);
    expect((await unpinned.call('hub_overview')).error.code).toBe(-32601);
    writeFileSync(join(a, 'evidence.txt'), 'Recorded fixture output');
    const created = payload(await planner.call('hub_room_create', { goal: 'Plan and check the fixture.', ...key() }));
    const roomId = created.room.id;
    expect(created.room.createdBy).toMatchObject({ kind: 'agent', id: expect.stringMatching(/^mcp-client:mcp-/u) });
    expect((await foreign.call('hub_room_read', { roomId })).result.structuredContent.code).toBe('HUB_NOT_FOUND');
    expect((await planner.call('hub_room_action', { roomId, command: { kind: 'task', title: 'Bad actor', actor: 'Operator', ...key() } })).error.code).toBe(-32602);
    const proposal = payload(await action(planner, roomId, { kind: 'message', type: 'proposal', text: 'Retain the original operation key.', ...key() })).applied.targetId;
    const seen = payload(await worker.call('hub_room_read', { roomId, after: created.cursor }));
    expect(seen.messages[0]).toMatchObject({ id: proposal, author: created.room.createdBy });
    const critique = payload(await action(worker, roomId, { kind: 'message', type: 'critique', replyTo: proposal, text: 'Also check the later retry.', ...key() })).applied.targetId;
    const task = payload(await action(planner, roomId, { kind: 'task', title: 'Attach the checked fixture', ...key() })).applied;
    const claims = await Promise.all([planner, worker].map(client => action(client, roomId, { kind: 'claim', taskId: task.targetId, revision: task.revision, ...key() })));
    expect(claims.filter(response => response.result?.isError)).toHaveLength(1);
    const winner = claims[0].result.isError ? worker : planner;
    const other = winner === planner ? worker : planner;
    const successful = payload(claims[0].result.isError ? claims[1] : claims[0]).applied;
    const artifact = payload(await action(winner, roomId, { kind: 'artifact', taskId: task.targetId, revision: successful.revision, path: 'evidence.txt', ...key() })).applied;
    expect((await action(winner, roomId, { kind: 'accept', artifactId: artifact.targetId, ...key() })).error.code).toBe(-32602);
    const attachment = hub.artifact(roomId, artifact.targetId).artifact;
    payload(await action(other, roomId, { kind: 'ack', targetType: 'artifact', targetId: artifact.targetId, sha256: attachment.sha256, ...key() }));
    hub.roomAction(roomId, { kind: 'accept', artifactId: artifact.targetId, ...key() }, HUB_OPERATOR);
    const outcome = payload(await action(winner, roomId, { kind: 'outcome', taskId: task.targetId, artifactId: artifact.targetId, result: 'pass', check: 'fixture assertion', evidence: 'see artifact', ...key() })).applied;
    payload(await winner.call('hub_lesson_propose', { outcomeId: outcome.targetId, title: 'Keep the operation key', text: 'Retry using the existing operation key.', ...key() }));
    await worker.stop();
    const resumed = new FixtureClient(a, pa.storagePath);
    clients.push(resumed);
    await resumed.initialize();
    const replay = payload(await resumed.call('hub_room_read', { roomId, after: seen.cursor }));
    expect(replay.messages[0]).toMatchObject({ id: critique, replyTo: proposal });
    expect(replay.messages[0].author.id).not.toBe(created.room.createdBy.id);
    expect(replay.outcomes[0]).toMatchObject({ id: outcome.targetId, provenance: 'agent-report' });
    expect(replay.acknowledgements[0]).toMatchObject({ targetId: artifact.targetId, sha256: attachment.sha256 });
    expect(replay.tasks[0]).toMatchObject({ status: 'completed' });
    expect(payload(await resumed.call('hub_overview')).lessons).toHaveLength(1);
    await Promise.all(clients.map(client => client.stop()));
    const journal = JSON.parse(readFileSync(pa.journalPath, 'utf8'));
    expect(journal.events.some((event: any) => event.kind === 'tool-end' && event.tool === 'hub_room_action' && event.source === 'measured')).toBe(true);
    expect(journal.events.filter((event: any) => event.kind === 'session-end')).toHaveLength(3);
  } finally {
    await Promise.allSettled(clients.map(client => client.stop()));
    hub.close();
    await brain.shutdown();
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}, 30_000);
