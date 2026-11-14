import { randomUUID } from 'node:crypto';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { HUB_OPERATOR } from '../../src/brain/project-hub-contract.js';
import { ProjectHubService } from '../../src/brain/project-hub.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { MCPPresenceStore, MCP_PRESENCE_FILE, MCP_PRESENCE_LIMITS } from '../../src/brain/mcp-presence.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

const cli = resolve('dist/cli.js');
const key = () => ({ key: randomUUID() });
const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', clientInfo: { name: 'fixture-mcp', version: '1' }, capabilities: {} } };
const discovery = [init, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]
  .map(value => JSON.stringify(value)).join('\n') + '\n';

function discover(project: string, db: string) {
  return spawnSync(process.execPath, [cli, 'mcp', project, '--stdio', '--db', db], { cwd: project, input: discovery, encoding: 'utf8', timeout: 20_000, windowsHide: true });
}

it.skipIf(process.platform !== 'win32')('uses the same project for MCP and context commands under short and long Windows spellings', context => {
  const created = mkdtempSync(join(tmpdir(), 'asb-mcp-long-project-fixture-'));
  const root = realpathSync.native(created);
  try {
    const query = spawnSync('cmd.exe', ['/d', '/c', 'for %I in ("%ASB_ALIAS_FIXTURE%") do @echo %~sI'], {
      env: { ...process.env, ASB_ALIAS_FIXTURE: root }, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 5000,
    });
    expect(query.status, query.stderr).toBe(0);
    const alias = query.stdout.trim();
    if (alias.toLowerCase() === root.toLowerCase()) context.skip('The fixture volume does not provide an 8.3 short path.');
    expect(realpathSync.native(alias)).toBe(root);
    const local = projectStorage(root);
    expect(existsSync(local.storagePath)).toBe(false);
    const shortDb = join(alias, '.shadow-brain', 'project-memory.json');
    for (const [project, database] of [[alias, local.storagePath], [root, shortDb]]) {
      const response = discover(project, database);
      expect(response.status, response.stderr).toBe(0);
      const catalog = response.stdout.trim().split('\n').map(line => JSON.parse(line)).at(-1);
      expect(catalog.result.tools.some((tool: { name: string }) => tool.name === 'hub_overview')).toBe(true);
    }
    expect(existsSync(local.storagePath)).toBe(false);
    const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 20_000, windowsHide: true });
    const saved = run('project', 'knowledge', root, '--title', 'Retry evidence', '--content', 'Use the original retry key for a durable checkout.');
    expect(saved.status, saved.stderr).toBe(0);
    const memoryId = JSON.parse(saved.stdout).memoryId;
    const brief = run('context-pack', 'durable checkout', '--project', alias, '--db', shortDb, '--profile', 'adaptive', '--json');
    expect(brief.status, brief.stderr).toBe(0);
    expect(JSON.parse(brief.stdout).entries[0]).toMatchObject({ id: memoryId, projectId: local.projectId });
    const health = run('memory-health', '--project', alias, '--db', local.storagePath);
    expect(health.status, health.stderr).toBe(0);
    expect(JSON.parse(health.stdout).projectId).toBe(local.projectId);
    const crossed = run('context-pack', 'durable checkout', '--project', root, '--db', shortDb, '--cross-project');
    expect(crossed.status).toBe(1);
    expect(crossed.stderr).toContain('pinned to its local project');
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30_000);

it('rejects a project store from a different project or through a directory link', () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-mcp-root-'));
  const other = mkdtempSync(join(tmpdir(), 'hub-mcp-other-'));
  const alias = join(root, 'alias');
  try {
    const foreign = discover(root, projectStorage(other).storagePath);
    expect(foreign.status).toBe(1);
    expect(foreign.stderr).toContain('must belong to the selected project');
    symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const linked = discover(root, join(alias, '.shadow-brain', 'project-memory.json'));
    expect(linked.status).toBe(1);
    expect(linked.stderr).toContain('ancestors must be real directories');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
}, 30_000);

class FixtureClient {
  private child: ChildProcessWithoutNullStreams;
  private next = 1;
  private readonly calls = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  readonly closed: Promise<any[]>;

  constructor(project: string, db: string, private readonly clientName = 'fixture-mcp') {
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

  async initialize(ready = true) {
    const handshake = await this.request('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: this.clientName, version: '1' }, capabilities: {} });
    expect(handshake.result.protocolVersion).toBe('2025-11-25');
    if (!ready) return [];
    return this.ready();
  }

  async ready() {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return (await this.request('tools/list')).result.tools;
  }

  call(name: string, args: object = {}) { return this.request('tools/call', { name, arguments: args }); }

  async stop() {
    if (!this.child.stdin.writableEnded) this.child.stdin.end();
    const [code] = await this.closed;
    expect(code).toBe(0);
  }

  async kill() { this.child.kill('SIGKILL'); await this.closed; }
}

it('reports current stdio connections independently of participation, removes on close and expires a killed client', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-mcp-presence-'));
  const portal = await startProjectWorkspace(root);
  const clients = [new FixtureClient(root, portal.storagePath, 'codex-fixture'), new FixtureClient(root, portal.storagePath, 'Claude fixture')];
  const [first, second] = clients;
  const filename = join(root, '.shadow-brain', MCP_PRESENCE_FILE);
  const request = async (suffix: string, input?: object) => {
    const response = await fetch(portal.url + '/api/workspace/' + suffix, input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : undefined);
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  };
  let killed = false;
  try {
    await Promise.all(clients.map(client => client.initialize(false)));
    expect((await request('presence')).count).toBe(0);
    expect(existsSync(filename)).toBe(false);
    await Promise.all(clients.map(client => client.ready()));
    const readPresence = async () => {
      const response = await fetch(portal.url + '/api/workspace/presence');
      const value = await response.json();
      if (response.status === 503 && value.code === 'MCP_PRESENCE_BUSY') return { count: null };
      expect(response.status, JSON.stringify(value)).toBe(200);
      return value;
    };
    const heartbeatPoll = { timeout: MCP_PRESENCE_LIMITS.renewMs + 2_000, interval: 250 };
    let full: Awaited<ReturnType<typeof readPresence>>;
    await expect.poll(async () => (full = await readPresence()).count, heartbeatPoll).toBe(2);
    expect(full).toMatchObject({ projectId: portal.projectId, enabled: true, count: 2,
      tools: [{ tool: 'claude-code', count: 1 }, { tool: 'codex', count: 1 }] });
    expect(new Set(full.connections.map((row: { id: string }) => row.id)).size).toBe(2);
    const foreignRequest = await fetch(portal.url + '/api/workspace/presence', { headers: { origin: 'https://foreign.invalid' } });
    expect(foreignRequest.status).toBe(403);

    const { policy } = await request('project-policy');
    await request('project-policy', { kind: 'set-tool-participation', expectedRevision: policy.revision, tool: 'claude-code', enabled: false });
    expect((await request('presence')).tools).toEqual(full.tools);
    const blocked = await second.call('global_recall', { keywords: ['fixture'] });
    expect(blocked.error).toMatchObject({ code: -32003, message: expect.stringContaining('disabled') });
    const controlled = await second.call('project_policy');
    expect(controlled.result?.structuredContent).toMatchObject({ tool: 'claude-code', enabled: false });
    await request('project-policy', { kind: 'set-tool-participation', expectedRevision: policy.revision + 1, tool: 'claude-code', enabled: true });
    const feature = await request('features');
    await request('features', { expectedRevision: feature.revision, patch: { activityRecording: false } });
    expect(await request('presence')).toMatchObject({ enabled: false, count: null, connections: [] });
    await request('features', { expectedRevision: feature.revision + 1, patch: { activityRecording: true } });
    await expect.poll(async () => (await readPresence()).count, heartbeatPoll).toBe(2);
    await first.stop();
    let remaining: Awaited<ReturnType<typeof readPresence>>;
    await expect.poll(async () => (remaining = await readPresence()).count, heartbeatPoll).toBe(1);
    expect(remaining.tools).toEqual([{ tool: 'claude-code', count: 1 }]);
    await second.kill();
    killed = true;
    const afterKill = await request('presence');
    expect(afterKill.count).toBe(1);
    expect(afterKill.connections[0].id).toBe(remaining.connections[0].id);
    const expiredAt = Date.parse(afterKill.connections[0].lastSeenAt) + MCP_PRESENCE_LIMITS.ttlMs;
    expect(new MCPPresenceStore(portal.root, portal.projectId, () => expiredAt).read(true).count).toBe(0);
    const original = readFileSync(filename);
    writeFileSync(filename, 'invalid fixture bytes');
    const invalid = await fetch(portal.url + '/api/workspace/presence');
    expect(invalid.status).toBe(503);
    expect(await invalid.json()).toMatchObject({ code: 'MCP_PRESENCE_UNAVAILABLE' });
    writeFileSync(filename, original);
  } finally {
    await Promise.allSettled(killed ? [first.stop()] : clients.map(client => client.stop()));
    await portal.close();
    const canonical = realpathSync.native(root);
    if (dirname(canonical) !== realpathSync.native(tmpdir()) || !basename(canonical).startsWith('hub-mcp-presence-')) throw new Error('Unexpected fixture path.');
    rmSync(canonical, { recursive: true, force: true });
  }
}, 60_000);

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
        'hub_overview', 'hub_room_read', 'hub_room_create', 'hub_room_action', 'hub_lesson_propose', 'hub_artifact_read',
      ]);
      expect(catalog.find((tool: any) => tool.name === 'hub_artifact_read').annotations.readOnlyHint).toBe(true);
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
    const artifactRequest = { roomId, artifactId: artifact.targetId, sha256: attachment.sha256 };
    writeFileSync(join(a, 'evidence.txt'), 'Working tree changed after attachment.');
    expect(payload(await other.call('hub_artifact_read', artifactRequest))).toEqual({ artifact: attachment, text: 'Recorded fixture output' });
    expect((await foreign.call('hub_artifact_read', artifactRequest)).result.structuredContent.code).toBe('HUB_NOT_FOUND');
    expect((await other.call('hub_artifact_read', { ...artifactRequest, sha256: '0'.repeat(64) })).result.structuredContent.code).toBe('HUB_CONFLICT');
    expect((await other.call('hub_artifact_read', { ...artifactRequest, roomId: randomUUID() })).result.structuredContent.code).toBe('HUB_NOT_FOUND');
    expect((await other.call('hub_artifact_read', { ...artifactRequest, path: 'evidence.txt' })).error.code).toBe(-32602);
    expect((await other.call('hub_artifact_read', { ...artifactRequest, sha256: 'bad-digest' })).error.code).toBe(-32602);
    for (const [name, bytes, code] of [
      ['malformed.txt', Buffer.from([0xc3, 0x28]), 'HUB_ARTIFACT_NOT_TEXT'],
      ['binary.txt', Buffer.from([0x00, 0x01]), 'HUB_ARTIFACT_NOT_TEXT'],
      ['image.png', Buffer.from('Text bytes in a binary format'), 'HUB_ARTIFACT_NOT_TEXT'],
      ['large.txt', Buffer.alloc(32 * 1024 + 1, 0x61), 'HUB_ARTIFACT_TEXT_LIMIT'],
    ] as const) {
      writeFileSync(join(a, name), bytes);
      const proposal = payload(await action(other, roomId, { kind: 'artifact', taskId: task.targetId, revision: successful.revision,
        path: name, ...key() })).applied;
      const proposed = hub.artifact(roomId, proposal.targetId).artifact;
      const rejected = await winner.call('hub_artifact_read', { roomId, artifactId: proposed.id, sha256: proposed.sha256 });
      expect(rejected.result.structuredContent.code).toBe(code);
    }
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

it('opens, inspects and resumes exact handoff checkpoints across independent client processes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-mcp-session-'));
  const foreignRoot = mkdtempSync(join(tmpdir(), 'hub-mcp-session-'));
  const project = projectStorage(root), foreignProject = projectStorage(foreignRoot);
  const portal = await startProjectWorkspace(root);
  const clients = [new FixtureClient(root, project.storagePath, 'codex-fixture'), new FixtureClient(root, project.storagePath, 'claude-fixture'),
    new FixtureClient(foreignRoot, foreignProject.storagePath), new FixtureClient(root, join(root, 'unscoped.json'))];
  const [first, second, foreign, unpinned] = clients;
  const command = (client: FixtureClient, sessionId: string, input: object) => client.call('session_record', { sessionId, command: input });
  const result = (reply: any) => {
    expect(reply.error, JSON.stringify(reply)).toBeUndefined();
    expect(reply.result.isError, JSON.stringify(reply)).toBeUndefined();
    return reply.result.structuredContent;
  };
  try {
    const tools = await Promise.all(clients.map(client => client.initialize()));
    expect(tools[0].filter((tool: any) => tool.name.startsWith('session_')).map((tool: any) => tool.name)).toEqual([
      'session_list', 'session_read', 'session_checkpoint_read', 'session_open', 'session_record', 'session_resume',
    ]);
    expect(tools[3].some((tool: any) => tool.name.startsWith('session_'))).toBe(false);
    expect((await unpinned.call('session_list')).error.code).toBe(-32601);
    expect(result(await first.call('session_list')).sessions).toEqual([]);
    expect(existsSync(join(root, '.shadow-brain', 'project-hub.sqlite'))).toBe(false);
    const opening = { title: 'Verify retry behavior', goal: 'Check a shared fixture', hostSessionId: 'fixture-chat', ...key() };
    const [opened, parallel] = (await Promise.all([first.call('session_open', opening), second.call('session_open', {
      title: 'Check another part of the fixture', goal: 'Open a separate session concurrently', ...key(),
    })])).map(result);
    expect(opened.session).toMatchObject({ revision: 0, presence: 'recent', reportedStatus: 'working', hostSessionId: 'fixture-chat', actor: { tool: 'codex' } });
    expect(parallel.session).toMatchObject({ revision: 0, actor: { tool: 'claude-code' } });
    expect(result(await first.call('session_list')).sessions.map((row: { id: string }) => row.id).sort()).toEqual([opened.session.id, parallel.session.id].sort());
    expect(result(await first.call('session_open', opening)).session.id).toBe(opened.session.id);
    expect((await first.call('session_open', { ...opening, title: 'Do not reuse the key' })).result.structuredContent.code).toBe('SESSION_CONFLICT');
    expect((await second.call('session_open', { ...opening, ...key(), parentSessionId: randomUUID() })).result.structuredContent.code).toBe('SESSION_NOT_FOUND');
    const id = opened.session.id;
    expect((await command(second, id, { kind: 'status', status: 'completed', ...key() })).result.structuredContent.code).toBe('SESSION_OWNER_REQUIRED');
    expect((await foreign.call('session_read', { sessionId: id })).result.structuredContent.code).toBe('SESSION_NOT_FOUND');
    expect(result(await foreign.call('session_list')).sessions).toEqual([]);
    const firstMessage = { kind: 'message', role: 'assistant', text: '  First captured note.  ', expectedRevision: 0, ...key() };
    expect(result(await command(first, id, firstMessage)).messages[0].text).toBe(firstMessage.text);
    expect(result(await command(first, id, firstMessage)).messages).toHaveLength(1);
    expect((await command(first, id, { ...firstMessage, ...key() })).result.structuredContent.code).toBe('SESSION_CONFLICT');
    const savedRef = result(await command(first, id, { kind: 'checkpoint', summary: 'First verified checkpoint', completed: ['Checked artifacts'],
      nextSteps: ['Run the test fixture'], evidence: ['tests/evidence.md'], ...key() })).checkpoints[0];
    expect(savedRef.summary).toBeUndefined();
    const saved = result(await second.call('session_checkpoint_read', { sessionId: id, checkpointId: savedRef.id })).checkpoint;
    result(await command(first, id, { kind: 'checkpoint', summary: 'Newer checkpoint', ...key() }));
    const page = result(await second.call('session_read', { sessionId: id, limit: 1 }));
    expect(page.checkpoints).toHaveLength(2);
    const handoff = { sessionId: id, checkpointId: saved.id, sha256: saved.sha256, ...key() };
    expect((await second.call('session_resume', { ...handoff, sha256: undefined })).error.code).toBe(-32602);
    expect((await second.call('session_resume', { ...handoff, sha256: '0'.repeat(64) })).result.structuredContent.code).toBe('SESSION_CONFLICT');
    const copy = result(await second.call('session_resume', handoff));
    expect(copy).toMatchObject({ session: { parentSessionId: id, resumedFrom: { sessionId: id, checkpointId: saved.id }, actor: { tool: 'claude-code' } },
      handoff: saved, messageCount: 0, messages: [] });
    expect(copy.session.id).not.toBe(id);
    expect(result(await second.call('session_resume', handoff)).session.id).toBe(copy.session.id);
    result(await command(second, copy.session.id, { kind: 'status', status: 'waiting', ...key() }));
    result(await command(first, id, { kind: 'status', status: 'completed', ...key() }));
    const portalList = await fetch(portal.url + '/api/workspace/sessions');
    expect((await portalList.json()).sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id, presence: 'completed', revision: 4 }),
      expect.objectContaining({ id: copy.session.id, reportedStatus: 'waiting', revision: 1 }),
    ]));
    const portalChild = await fetch(portal.url + '/api/workspace/sessions/' + copy.session.id);
    expect((await portalChild.json()).handoff).toEqual(saved);
  } finally {
    await Promise.allSettled(clients.map(client => client.stop()));
    await portal.close();
    for (const candidate of [root, foreignRoot]) {
      const canonical = realpathSync.native(candidate);
      if (dirname(canonical) !== realpathSync.native(tmpdir()) || !basename(canonical).startsWith('hub-mcp-session-')) throw new Error('Unexpected fixture path.');
      rmSync(canonical, { recursive: true, force: true });
    }
  }
}, 30_000);

it('refreshes both ordinary MCP recalls across processes and respects live project curation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-mcp-recall-'));
  const portal = await startProjectWorkspace(root);
  const writer = new FixtureClient(root, portal.storagePath);
  const reader = new FixtureClient(root, portal.storagePath);
  const callPayload = async (client: FixtureClient, tool: string, args: object) => {
    const result = await client.call(tool, args);
    expect(result.error).toBeUndefined();
    expect(result.result.isError).toBeUndefined();
    return JSON.parse(result.result.content[0].text);
  };
  const post = async (route: string, body: object) => {
    const response = await fetch(portal.url + '/api/workspace/' + route, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect(response.status, await response.clone().text()).toBe(200);
    return response.json();
  };
  const types = ['global_recall', 'global_recall_scored'] as const;
  const recalled = async (tool: typeof types[number], limit = 10) =>
    (await callPayload(reader, tool, { keywords: ['CheckoutProbe'], limit })).map((row: { id: string }) => row.id);
  try {
    await Promise.all([writer.initialize(), reader.initialize()]);
    for (const tool of types) expect(await recalled(tool)).toEqual([]);
    const archived = await post('project-knowledge', { title: 'CheckoutProbe archive', content: 'CheckoutProbe CheckoutProbe Older process learns this from the portal.' });
    const contested = await callPayload(writer, 'project_knowledge', { title: 'CheckoutProbe contest', content: 'A second host records this.' });
    const predecessor = await callPayload(writer, 'project_knowledge', { title: 'CheckoutProbe predecessor', content: 'Replace this evidence.' });
    const active = await callPayload(writer, 'project_knowledge', { title: 'Replacement evidence', content: 'Keep current evidence for CheckoutProbe.' });
    for (const tool of types) expect(await recalled(tool)).toEqual(expect.arrayContaining([archived.memoryId, contested.memoryId, predecessor.memoryId, active.memoryId]));
    const writeScope = { projectId: portal.projectId };
    await post('memory-review', { ...writeScope, memoryId: archived.memoryId, state: 'archived', expectedRevision: 0 });
    await post('memory-review', { ...writeScope, memoryId: contested.memoryId, state: 'contested', expectedRevision: 1 });
    await post('memory-link', { ...writeScope, fromId: active.memoryId, toId: predecessor.memoryId, type: 'supersedes', expectedRevision: 2 });
    for (const tool of types) {
      expect(await recalled(tool, 1)).toEqual([active.memoryId]);
      expect((await reader.call(tool, { projectId: 'foreign-project', keywords: ['CheckoutProbe'] })).error.code).toBe(-32602);
    }
    const timeline = await callPayload(reader, 'global_timeline', {});
    expect(timeline.map((row: { id: string }) => row.id)).toEqual(expect.arrayContaining([archived.memoryId, contested.memoryId, predecessor.memoryId, active.memoryId]));
    expect(await callPayload(reader, 'memory_inspect', { memoryId: archived.memoryId })).toMatchObject({ id: archived.memoryId, state: 'archived' });
  } finally {
    await Promise.allSettled([writer.stop(), reader.stop()]);
    await portal.close();
    const canonical = realpathSync.native(root);
    if (dirname(canonical) !== realpathSync.native(tmpdir()) || !basename(canonical).startsWith('hub-mcp-recall-')) throw new Error('Unexpected fixture path.');
    rmSync(canonical, { recursive: true, force: true });
  }
}, 30_000);

it('records bounded host usage from two independent MCP clients and shares it with the project portal', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-mcp-usage-'));
  const project = projectStorage(root);
  const brain = GlobalBrain.createIsolated({ dbPath: project.storagePath });
  const settings = new FeatureSettingsStore({ filePath: project.settingsPath });
  const clients = [new FixtureClient(root, project.storagePath), new FixtureClient(root, project.storagePath),
    new FixtureClient(root, join(root, 'separate.json'))];
  const [first, second, unpinned] = clients;
  const filename = join(root, '.shadow-brain', 'model-usage.sqlite');
  let portal: Awaited<ReturnType<typeof startProjectWorkspace>> | undefined;
  try {
    const definitions = await Promise.all(clients.map(client => client.initialize()));
    expect(definitions[0].find((tool: any) => tool.name === 'usage_report').annotations.readOnlyHint).toBe(false);
    expect(definitions[0].find((tool: any) => tool.name === 'usage_report').inputSchema.properties.reasoningEffort).toMatchObject({ type: 'string', maxLength: 32 });
    expect(definitions[2].some((tool: any) => tool.name === 'usage_report')).toBe(false);
    const base = { projectId: project.projectId, agent: 'fixture-agent', sessionId: 'fixture-session', requestModel: 'reported-request' };
    expect((await unpinned.call('usage_report', { ...base, operationId: 'unpinned' })).error.code).toBe(-32601);
    await settings.update({ activityRecording: false });
    expect((await first.call('usage_report', { ...base, operationId: 'disabled' })).error.code).toBe(-32602);
    expect(existsSync(filename)).toBe(false);
    await settings.update({ activityRecording: true });
    expect((await first.call('usage_report', { ...base, operationId: 'forged', provenance: 'provider-measured' })).error.code).toBe(-32602);
    expect((await first.call('usage_report', { ...base, operationId: 'negative', inputTokens: -1 })).error.code).toBe(-32602);
    expect((await first.call('usage_report', { ...base, operationId: 'bad-effort', reasoningEffort: 'high with notes' })).error.code).toBe(-32602);
    const foreign = await first.call('usage_report', { ...base, operationId: 'foreign', projectId: 'foreign-project' });
    expect(foreign.result).toMatchObject({ isError: true, structuredContent: { code: 'USAGE_PROJECT_MISMATCH' } });
    expect(existsSync(filename)).toBe(false);
    const one = { ...base, operationId: 'operation-one', inputTokens: 0, reasoningEffort: 'high' };
    const two = { ...base, operationId: 'operation-two', outputTokens: 9, reasoningOutputTokens: 2 };
    const writes = await Promise.all([first.call('usage_report', one), second.call('usage_report', two)]);
    for (const result of writes) {
      expect(result.error).toBeUndefined();
      expect(result.result.isError).toBeUndefined();
      expect(result.result.structuredContent).toMatchObject({ projectId: project.projectId, provenance: 'host-reported' });
    }
    expect(writes[0].result.structuredContent.reasoningEffort).toBe('high');
    expect(writes[1].result.structuredContent.reasoningEffort).toBeUndefined();
    const duplicate = await second.call('usage_report', one);
    expect(duplicate.result.structuredContent).toEqual(writes[0].result.structuredContent);
    const conflicts = await Promise.all([first.call('usage_report', { ...one, reasoningEffort: 'low' }), second.call('usage_report', { ...two, outputTokens: 11 })]);
    for (const reply of conflicts) expect(reply.result).toMatchObject({ isError: true, structuredContent: { code: 'USAGE_CONFLICT' } });
    portal = await startProjectWorkspace(root);
    const usage = await fetch(portal.url + '/api/workspace/usage');
    expect(usage.status).toBe(200);
    expect(await usage.json()).toMatchObject({ dropped: 0, recording: true, totals: {
      inputTokens: { total: 0, known: 1, receipts: 2 }, outputTokens: { total: 9, known: 1, receipts: 2 },
    }, receipts: expect.arrayContaining([writes[0].result.structuredContent, writes[1].result.structuredContent]) });
  } finally {
    await Promise.allSettled(clients.map(client => client.stop()));
    await portal?.close();
    await brain.shutdown();
    const canonical = realpathSync.native(root);
    if (dirname(canonical) !== realpathSync.native(tmpdir()) || !basename(canonical).startsWith('hub-mcp-usage-')) throw new Error('Unexpected fixture path.');
    rmSync(canonical, { recursive: true, force: true });
  }
}, 30_000);
