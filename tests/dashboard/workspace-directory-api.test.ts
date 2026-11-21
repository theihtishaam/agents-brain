import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ActivityJournal } from '../../src/brain/activity-journal.js';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { MCPPresenceStore } from '../../src/brain/mcp-presence.js';
import { ModelUsageStore } from '../../src/brain/model-usage.js';
import { readOpenCodeIndex } from '../../src/brain/native-opencode-index.js';
import { HubStore } from '../../src/brain/project-hub-store.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectPolicyStore } from '../../src/brain/project-policy.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { WorkspaceConnections } from '../../src/brain/workspace-connections.js';
import { WorkspaceDirectory } from '../../src/brain/workspace-directory.js';
import { portfolioSnapshot, workspaceDirectoryRequest } from '../../src/dashboard/workspace-directory-api.js';
import { addDiscoveredCodexWorkspace, directoryCodexIndex, discoverCodexWorkspaces, watchCodexWorkspaces } from '../../src/dashboard/workspace-directory-codex.js';
import { directoryOpenCodeIndex } from '../../src/dashboard/workspace-directory-opencode.js';

let root: string;
let directory: WorkspaceDirectory;
const url = new URL('http://localhost:61888/api/workspace/directory');
beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(tmpdir(), 'asb-directory-api-fixture-')));
  directory = new WorkspaceDirectory({ directory: path.join(root, 'registered') });
});
afterEach(() => {
  const canonical = fs.realpathSync.native(root);
  if (path.dirname(canonical) !== fs.realpathSync.native(tmpdir()) || !path.basename(canonical).startsWith('asb-directory-api-fixture-')) {
    throw new Error('Refusing to remove an unexpected directory fixture.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});
function testProject(name: string) {
  const folder = path.join(root, name);
  fs.mkdirSync(folder);
  return projectStorage(folder);
}
function request(currentProjectId: string, method = 'GET', headers: Record<string, string> = {}, ip = '127.0.0.1'): IncomingMessage {
  return { method, headers: { host: 'localhost:61888', 'x-shadow-brain-project': currentProjectId, ...headers },
    socket: { remoteAddress: ip } } as IncomingMessage;
}

it('accepts only pinned local operator requests and records metadata-only additions with revisions', async () => {
  const current = testProject('Current');
  const other = testProject('Other');
  const call = (req: IncomingMessage, input?: object) => workspaceDirectoryRequest(req, url, current.projectId, async () => input, directory);
  await expect(call(request(current.projectId, 'GET', { origin: 'https://foreign.invalid' }))).rejects.toMatchObject({ status: 403 });
  await expect(call(request(current.projectId, 'GET', {}, '192.0.2.1'))).rejects.toMatchObject({ status: 403 });
  await expect(call(request(other.projectId))).rejects.toMatchObject({ status: 409 });
  const added = await call(request(current.projectId, 'POST'),
    { kind: 'add', root: other.root, projectName: 'Operator label', expectedRevision: 0 });
  expect(added).toMatchObject({ revision: 1, currentProjectId: current.projectId, total: 1,
    workspaces: [{ projectId: other.projectId, projectName: 'Operator label', lastSource: 'operator',
      status: 'awaiting-host', hosts: null, sessions: null, latestOutcome: null, progress: null }] });
  expect(fs.readdirSync(other.root)).toEqual([]);
  await expect(call(request(current.projectId, 'POST'), { kind: 'forget', projectId: other.projectId, expectedRevision: 0 }))
    .rejects.toMatchObject({ status: 409 });
  const hidden = await call(request(current.projectId, 'POST'), { kind: 'set-sharing', projectId: other.projectId, enabled: false, expectedRevision: 1 });
  expect(hidden.workspaces).toEqual([]);
  expect(hidden.forgotten).toMatchObject([{ projectId: other.projectId }]);
  expect(JSON.stringify(hidden)).not.toContain('Operator label');
  await directory.register(other.root, 'mcp');
  expect((await call(request(current.projectId))).workspaces).toEqual([]);
  const restored = await call(request(current.projectId, 'POST'), { kind: 'add', root: other.root, expectedRevision: hidden.revision });
  expect(restored).toMatchObject({ forgotten: [], workspaces: [{ projectId: other.projectId, status: 'awaiting-host' }] });
});

it('returns summaries for only six recent projects plus the selected and current projects', async () => {
  const projects = Array.from({ length: 9 }, (_, index) => testProject('Project ' + index));
  const index = {
    schemaVersion: 1 as const, revision: 1, forgotten: [],
    projects: projects.map(({ root, projectId, projectName }, position) => ({
      root, projectId, projectName, lastOpenedAt: new Date(Date.UTC(2026, 10, position + 1)).toISOString(), lastSource: 'portal' as const,
    })),
  };
  for (const project of projects) {
    fs.mkdirSync(path.dirname(project.storagePath));
    fs.writeFileSync(project.storagePath, '{"schemaVersion":1,"entries":[],"projects":[],"agents":[]}');
  }
  const current = projects[0].projectId, selected = projects[1].projectId;
  const fullIds = (snapshot: ReturnType<typeof portfolioSnapshot>) =>
    snapshot.workspaces.filter(entry => Array.isArray(entry.sessions)).map(entry => entry.projectId);
  expect(fullIds(portfolioSnapshot(index, current, selected))).toEqual([selected]);
  const summary = portfolioSnapshot(index, current, selected, true);
  const withSummaries = fullIds(summary);
  expect(withSummaries).toHaveLength(8);
  expect(withSummaries).toEqual(expect.arrayContaining([current, selected, ...projects.slice(-6).map(project => project.projectId)]));
  expect(summary.workspaces.find(entry => entry.projectId === selected)).toMatchObject({ policyRevision: 0, codexIndexAllowed: true });
  const invalid = new URL(url.toString());
  invalid.searchParams.append('summary', 'all');
  await expect(workspaceDirectoryRequest(request(current), invalid, current, async () => ({}), directory)).rejects.toMatchObject({ status: 400 });
});

it('limits the Codex index to bounded metadata and rechecks registration after the response', async () => {
  const project = testProject('Native fixture');
  const registered = await directory.register(project.root, 'operator');
  const methods: string[] = [];
  let closed = false;
  const page = { data: [{ id: 'fixture-thread', cwd: project.root, name: 'Fixture thread',
    status: { type: 'active' }, preview: 'Unreturned native content' }], nextCursor: null };
  const makeRpc = (forget = false) => ({
    async request(method: string, params: object) {
      methods.push(method);
      if (method !== 'thread/list') return {};
      expect(params).toMatchObject({ cwd: project.root, useStateDbOnly: true });
      if (forget) await directory.forget(project.projectId, registered.revision);
      return page;
    },
    notify() {},
    close() { closed = true; },
  });
  const listing = await directoryCodexIndex({ projectId: project.projectId }, directory, () => makeRpc());
  expect(listing).toMatchObject({ projectId: project.projectId, policyRevision: 0,
    threads: [{ name: 'Fixture thread', status: 'active' }] });
  expect(new Date(listing.expiresAt).getTime()).toBeGreaterThan(new Date(listing.observedAt).getTime());
  expect(JSON.stringify(listing)).not.toContain('Unreturned native content');
  expect(methods).toEqual(['initialize', 'thread/list']);
  expect(closed).toBe(true);
  closed = false;
  await expect(directoryCodexIndex({ projectId: project.projectId }, directory, () => makeRpc(true)))
    .rejects.toMatchObject({ code: 'DIRECTORY_NOT_REGISTERED', status: 404 });
  expect(closed).toBe(true);
});

it('pages exact active and archived titles behind project- and portal-bound handles', async () => {
  const project = testProject('Paged titles');
  await directory.register(project.root, 'operator');
  const requests: Array<Record<string, unknown>> = [];
  const makeThread = (id: string, name: string) => ({ id, cwd: project.root, name, preview: 'Never returned', status: { type: 'idle' } });
  const later = makeThread('earlier-thread', 'Earlier exact title  ✓');
  const factory = () => ({
    async request(method: string, params: object) {
      if (method !== 'thread/list') return {};
      const fields = params as Record<string, unknown>;
      requests.push(fields);
      if (fields.archived === true) return { data: [makeThread('archived', 'Archived exact title')], nextCursor: null };
      if (fields.cursor) return { data: [makeThread('recent-12', 'Exact  title 12'), later], nextCursor: null };
      return { data: Array.from({ length: 13 }, (_, i) => makeThread('recent-' + i, 'Exact  title ' + i)), nextCursor: 'private-upstream-cursor' };
    },
    notify() {},
    close() {},
  });
  const first = await directoryCodexIndex({ projectId: project.projectId }, directory, factory, undefined, 'portal-one');
  expect(first.threads).toHaveLength(13);
  expect(first.threads[12].name).toBe('Exact  title 12');
  expect(first.nextPageToken).toBeTruthy();
  expect(JSON.stringify(first)).not.toMatch(/private-upstream-cursor|Never returned|recent-12/u);
  const page = { projectId: project.projectId, pageToken: first.nextPageToken };
  await expect(directoryCodexIndex(page, directory, factory, undefined, 'portal-two')).rejects.toMatchObject({ status: 409 });
  await expect(directoryCodexIndex({ ...page, archived: true }, directory, factory, undefined, 'portal-one')).rejects.toMatchObject({ status: 409 });
  const next = await directoryCodexIndex(page, directory, factory, undefined, 'portal-one');
  expect(next).toMatchObject({ threads: [{ name: 'Earlier exact title  ✓' }], nextPageToken: null });
  const archive = await directoryCodexIndex({ projectId: project.projectId, archived: true }, directory, factory, undefined, 'portal-one');
  expect(archive).toMatchObject({ archived: true, threads: [{ name: 'Archived exact title' }] });
  expect(requests[0]).toMatchObject({ useStateDbOnly: true, currentAccountOnly: true, cwd: project.root });
  expect(requests[1]).toMatchObject({ cursor: 'private-upstream-cursor' });
});

it('discovers distinct canonical roots without titles or implicit writes and rechecks exclusions on Add', async () => {
  const [current, fresh, next, optedOut, forgotten, hiddenChat] = [
    'Current discovery', 'Candidate alpha', 'Candidate beta', 'Paused candidate', 'Forgotten candidate', 'Hidden chat candidate',
  ].map(testProject);
  await directory.register(current.root, 'portal');
  const indexed = await directory.register(forgotten.root, 'portal');
  await directory.forget(forgotten.projectId, indexed.revision);
  const paused = new ProjectPolicyStore(optedOut.root, optedOut.projectId);
  await paused.update({ kind: 'set-project-participation', enabled: false, expectedRevision: 0 });
  const privateSession = { id: randomUUID(), native: { tool: 'codex', sessionId: 'secret-thread' } } as Parameters<ProjectPolicyStore['update']>[1];
  await new ProjectPolicyStore(hiddenChat.root, hiddenChat.projectId).update({ kind: 'set-chat-sharing',
    expectedRevision: 0, sessionId: privateSession!.id, shareContext: false }, privateSession);
  const thread = (cwd: string, id: string) => ({ cwd, id, name: 'Private title sentinel', preview: 'Private preview sentinel' });
  const factory = () => ({
    async request(method: string, params: object) {
      if (method !== 'thread/list') return {};
      expect(params).toMatchObject({ useStateDbOnly: true, currentAccountOnly: true });
      expect(params).not.toHaveProperty('cwd');
      return (params as { cursor?: string }).cursor ?
        { data: [thread(fresh.root, 'duplicate-later'), thread(next.root, 'second')], nextCursor: null } :
        { data: [thread(current.root, 'already'), thread(fresh.root, 'first'), thread(fresh.root, 'duplicate'),
          thread(optedOut.root, 'paused'), thread(forgotten.root, 'forgotten'), thread(hiddenChat.root, 'secret-thread')], nextCursor: 'discover-2' };
    },
    notify() {},
    close() {},
  });
  const scan = await discoverCodexWorkspaces({ kind: 'scan' }, current.root, 'portal-one', directory, factory);
  expect(scan.candidates.map(row => row.projectId)).toEqual([fresh.projectId]);
  expect(JSON.stringify(scan)).not.toMatch(/Private (?:title|preview) sentinel|discover-2/u);
  const later = await discoverCodexWorkspaces({ kind: 'scan', pageToken: scan.nextPageToken }, current.root, 'portal-one', directory, factory);
  expect(later.candidates.map(row => row.projectId)).toEqual([next.projectId]);
  expect(fs.readdirSync(fresh.root)).toEqual([]);
  expect(directory.list().projects.map(row => row.projectId)).toEqual([current.projectId]);
  const input = { kind: 'add', candidateToken: scan.candidates[0].candidateToken, expectedRevision: directory.list().revision };
  await expect(addDiscoveredCodexWorkspace(input, current.root, 'portal-two', directory)).rejects.toMatchObject({ status: 409 });
  const registered = await addDiscoveredCodexWorkspace(input, current.root, 'portal-one', directory);
  expect(registered.projects.map(row => row.projectId)).toContain(fresh.projectId);
  expect(fs.readdirSync(fresh.root)).toEqual([]);
  const removed = await directory.forget(fresh.projectId, registered.revision);
  await expect(addDiscoveredCodexWorkspace({ ...input, expectedRevision: removed.revision }, current.root, 'portal-one', directory))
    .rejects.toMatchObject({ status: 409 });
}, 15000);

it('only adds fresh Codex folders under the opted-in parent and keeps all project exclusions', async () => {
  const current = testProject('Current watch');
  const child = (name: string) => testProject(path.join('Current watch', name));
  const [fresh, cold, forgotten, hidden, paused, existing, worker, future] =
    ['Fresh project', 'Cold project', 'Forgotten project', 'Hidden project', 'Paused project', 'Existing project', 'Worker project', 'Future project'].map(child);
  const outside = testProject('Independent project');
  const before = await directory.register(current.root, 'portal');
  await directory.register(forgotten.root, 'operator');
  await directory.forget(forgotten.projectId);
  const registered = await directory.register(existing.root, 'operator', { projectName: 'Preserve this label' });
  const privacy = { id: randomUUID(), native: { tool: 'codex', sessionId: 'hidden-chat' } } as Parameters<ProjectPolicyStore['update']>[1];
  await new ProjectPolicyStore(hidden.root, hidden.projectId).update({ kind: 'set-chat-sharing', expectedRevision: 0,
    sessionId: privacy!.id, shareContext: false }, privacy);
  await new ProjectPolicyStore(paused.root, paused.projectId).update({ kind: 'set-project-participation', expectedRevision: 0, enabled: false });
  const linked = path.join(current.root, 'Linked project');
  fs.symlinkSync(outside.root, linked, process.platform === 'win32' ? 'junction' : 'dir');
  let clock = Date.now() - 30_000;
  const seconds = Math.floor(clock / 1000);
  const thread = (cwd: string, id: string, extras: object = {}) => ({ cwd, id, source: 'appServer', ephemeral: false, parentThreadId: null,
    forkedFromId: null, createdAt: seconds + 10, updatedAt: seconds + 20, name: 'Private title sentinel', preview: 'Private preview sentinel', ...extras });
  const nativeCalls: string[] = [];
  const factory = () => ({
    async request(method: string, params: object) {
      nativeCalls.push(method);
      if (method === 'initialize') return { userAgent: 'shadow_brain/0.169.1 (Windows fixture)' };
      expect(method).toBe('thread/list');
      expect(params).toMatchObject({ useStateDbOnly: true, currentAccountOnly: true, archived: false, cursor: null,
        sourceKinds: ['cli', 'vscode', 'appServer'], sortKey: 'updated_at', limit: 25 });
      return { data: [thread(fresh.root, 'fresh-chat'), thread(outside.root, 'outside-chat'), thread(cold.root, 'cold-chat', { createdAt: seconds - 1 }),
        thread(forgotten.root, 'forgotten-chat'), thread(hidden.root, 'hidden-chat'), thread(paused.root, 'paused-chat'),
        thread(existing.root, 'existing-chat'), thread(linked, 'linked-chat'), thread(worker.root, 'worker-chat', { parentThreadId: 'parent-chat' }),
        thread(future.root, 'future-chat', { updatedAt: seconds + 500 })], nextCursor: 'fixture-next-unread' };
    }, notify() {}, close() {},
  });
  const call = (input: object, scope = 'watch-scope') => watchCodexWorkspaces(input, current.root, scope, directory, factory, undefined, () => clock);
  await expect(call({ kind: 'watch-start', parent: outside.root })).rejects.toThrow(/parent folder/u);
  const { watchToken } = await call({ kind: 'watch-start', parent: current.root });
  expect(nativeCalls).toEqual([]);
  const check = { kind: 'watch-check', watchToken };
  await expect(call(check, 'foreign-scope')).rejects.toMatchObject({ status: 409 });
  const result = await call(check);
  expect(result).toMatchObject({ enabled: true, added: 1, limited: true, candidates: [{ projectId: outside.projectId }] });
  expect(nativeCalls).toEqual(['initialize', 'thread/list']);
  expect(JSON.stringify(result)).not.toMatch(/Private .* sentinel|fixture-next-unread|outside-chat/u);
  expect(directory.list().projects).toEqual([expect.objectContaining({ projectId: fresh.projectId, lastSource: 'codex-index' }),
    registered.projects[0], before.projects[0]]);
  expect(fs.readdirSync(fresh.root)).toEqual([]);
  expect(fs.readdirSync(outside.root)).toEqual([]);
  expect(directory.list().forgotten.map(row => row.projectId)).toEqual([forgotten.projectId]);
  await expect(call(check)).rejects.toMatchObject({ status: 429 });
  clock += 61_000;
  expect(await call(check)).toMatchObject({ added: 0 });
  await call({ kind: 'watch-stop', watchToken });
  await expect(call(check)).rejects.toMatchObject({ status: 409 });
  await expect(addDiscoveredCodexWorkspace({ kind: 'add', candidateToken: result.candidates![0].candidateToken,
    expectedRevision: directory.list().revision }, current.root, 'watch-scope', directory)).rejects.toMatchObject({ status: 409 });
});

it('fails closed on unsupported Codex versions and when current participation changes during a recent check', async () => {
  const current = testProject('Watch gate');
  await directory.register(current.root, 'portal');
  const methods: string[] = [];
  const factory = (version: string) => () => ({
    async request(method: string) {
      methods.push(method);
      if (method === 'initialize') return { userAgent: 'shadow_brain/' + version };
      await new ProjectPolicyStore(current.root, current.projectId).update({ kind: 'set-project-participation', enabled: false, expectedRevision: 0 });
      return { data: [], nextCursor: null };
    }, notify() {}, close() {},
  });
  const begin = () => watchCodexWorkspaces({ kind: 'watch-start' }, current.root, 'watch-gate', directory);
  const check = async (version: string) => {
    const { watchToken } = await begin();
    return watchCodexWorkspaces({ kind: 'watch-check', watchToken }, current.root, 'watch-gate', directory, factory(version));
  };
  await expect(check('0.168.0')).rejects.toMatchObject({ code: 'CODEX_RECENT_INDEX_UNAVAILABLE' });
  expect(methods).toEqual(['initialize']);
  await expect(check('0.169.1')).rejects.toMatchObject({ code: 'DIRECTORY_SHARING_OFF' });
  expect(methods).toEqual(['initialize', 'initialize', 'thread/list']);
  await expect(begin()).rejects.toMatchObject({ code: 'DIRECTORY_SHARING_OFF' });
  expect(directory.list().projects).toHaveLength(1);
});

it('checks the OpenCode ACP capability and sends only a scoped metadata list request', async () => {
  const project = testProject('OpenCode protocol');
  const foreign = testProject('Foreign protocol scope');
  const methods: string[] = [];
  let closed = false;
  const factory = (cwd: string, supportsList = true) => () => ({
    async request(method: string, params: object) {
      methods.push(method);
      if (method === 'initialize') return { protocolVersion: 1, agentCapabilities: { sessionCapabilities: supportsList ? { list: {} } : {} } };
      expect(params).toEqual({ cwd: project.root, cursor: 'fixture-cursor' });
      return { sessions: [{ sessionId: 'fixture-session', cwd, title: 'OpenCode  exact title', updatedAt: '2026-11-20T05:00:00Z',
        additionalDirectories: [foreign.root], messages: ['Fixture ignored'] }], nextCursor: null };
    },
    notify() {},
    close() { closed = true; },
  });
  const result = await readOpenCodeIndex(project.root, 'fixture-cursor', factory(project.root));
  expect(result.sessions).toEqual([{ id: 'fixture-session', title: 'OpenCode  exact title', updatedAt: '2026-11-20T05:00:00.000Z' }]);
  expect(methods).toEqual(['initialize', 'session/list']);
  expect(closed).toBe(true);
  await expect(readOpenCodeIndex(project.root, 'fixture-cursor', factory(foreign.root))).rejects.toMatchObject({ code: 'OPENCODE_INDEX_SCOPE' });
  await expect(readOpenCodeIndex(project.root, 'fixture-cursor', factory(project.root, false))).rejects.toMatchObject({ code: 'OPENCODE_INDEX_UNSUPPORTED' });
  expect(methods.at(-1)).toBe('initialize');
});

it('keeps OpenCode workspace listings scoped, opaque, and subject to chat and host sharing', async () => {
  const project = testProject('OpenCode listing');
  await directory.register(project.root, 'portal');
  const privateSession = { id: randomUUID(), native: { tool: 'opencode', sessionId: 'hidden-session' } } as Parameters<ProjectPolicyStore['update']>[1];
  const policy = new ProjectPolicyStore(project.root, project.projectId);
  const nextPolicy = await policy.update({ kind: 'set-chat-sharing', shareContext: false, expectedRevision: 0,
    sessionId: privateSession!.id }, privateSession);
  const reader = async (root: string, cursor?: string) => {
    expect(root).toBe(project.root);
    return { sessions: cursor ? [{ id: 'older-session', title: 'Another exact title', updatedAt: null }] : [
      { id: 'visible-session', title: 'Visible OpenCode title', updatedAt: null },
      { id: 'hidden-session', title: 'Private OpenCode title', updatedAt: null },
    ], nextCursor: cursor ? null : 'upstream-only', observedAt: new Date().toISOString() };
  };
  const first = await directoryOpenCodeIndex({ projectId: project.projectId }, 'portal-a', directory, reader);
  expect(first).toMatchObject({ source: 'opencode-acp', policyRevision: nextPolicy.revision,
    sessions: [{ name: 'Visible OpenCode title', updatedAt: null }] });
  expect(JSON.stringify(first)).not.toMatch(/Private OpenCode title|visible-session|upstream-only/u);
  const next = { projectId: project.projectId, pageToken: first.nextPageToken };
  await expect(directoryOpenCodeIndex(next, 'portal-b', directory, reader)).rejects.toMatchObject({ status: 409 });
  expect((await directoryOpenCodeIndex(next, 'portal-a', directory, reader)).sessions).toEqual([{ name: 'Another exact title', updatedAt: null }]);
  new WorkspaceConnections(project.root, project.projectId).apply({ kind: 'set-allowed', id: 'opencode', enabled: false, expectedRevision: 0 });
  await expect(directoryOpenCodeIndex({ projectId: project.projectId }, 'portal-a', directory, reader)).rejects.toMatchObject({ status: 403 });
});

it('keeps project metadata bounded, attributes only exact reports, and honors sharing restrictions', async () => {
  const { root: project, projectId, storagePath, journalPath } = testProject('Evidence project');
  await directory.register(project, 'portal');
  const brain = GlobalBrain.createIsolated({ dbPath: storagePath });
  const sessions = new ProjectSessions(project, brain);
  const codex = { id: 'codex:fixture-agent', kind: 'agent', tool: 'codex' } as const;
  const claude = { id: 'claude-code:fixture-agent', kind: 'agent', tool: 'claude-code' } as const;
  const open = (title: string, hostSessionId: string, actor: typeof codex | typeof claude) =>
    sessions.open({ title, hostSessionId, goal: 'Goal content sentinel', key: randomUUID() }, actor).session;
  const visible = open('Visible report', 'exact-host-id', codex);
  const hidden = open('Hidden session title', 'hidden-host-id', codex);
  open('Other tool report', 'exact-host-id', claude);
  open('Shared identity one', 'ambiguous', codex);
  open('Shared identity two', 'ambiguous', codex);
  const journal = new ActivityJournal({ filePath: journalPath });
  await journal.append({ source: 'reported', transport: 'host', kind: 'phase', projectId, agent: 'codex', sessionId: 'exact-host-id', phase: 'verify' });
  await journal.append({ source: 'reported', transport: 'host', kind: 'phase', projectId: 'foreign-project', agent: 'codex', sessionId: 'exact-host-id', phase: 'plan' });
  const usage = new ModelUsageStore(project, projectId);
  usage.report({ projectId, operationId: 'receipt-a', agent: 'codex', sessionId: 'exact-host-id', responseModel: 'fixture-model', reasoningEffort: 'high' });
  usage.report({ projectId, operationId: 'receipt-b', agent: 'claude-code', sessionId: 'exact-host-id', responseModel: 'excluded-model' });
  usage.report({ projectId, operationId: 'receipt-c', agent: 'codex', sessionId: 'ambiguous', responseModel: 'shared-model' });
  const presence = new MCPPresenceStore(project, projectId);
  for (const tool of ['codex', 'claude-code', 'unknown-fixture-host']) presence.report({ id: 'mcp-' + randomUUID(), tool });
  const hub = new HubStore(project, projectId);
  const createdAt = new Date().toISOString();
  try {
    hub.transaction(() => {
      hub.put('tasks', { id: 'public-task', status: 'completed', title: 'Task title sentinel', owner: codex });
      hub.put('tasks', { id: 'open-task', status: 'open', title: 'Task content sentinel', owner: null });
      hub.put('tasks', { id: 'excluded-task', status: 'completed', owner: claude });
      hub.put('outcomes', { id: 'public-outcome', result: 'pass', createdAt, provenance: 'agent-report', author: codex, evidence: 'Evidence sentinel' });
      hub.put('outcomes', { id: 'excluded-outcome', result: 'fail', createdAt, provenance: 'agent-report', author: claude });
    });
  } finally { hub.close(); }
  const policy = new ProjectPolicyStore(project, projectId);
  const changed = await policy.update({ kind: 'set-chat-sharing', sessionId: hidden.id, shareContext: false, expectedRevision: 0 }, hidden);
  const connections = new WorkspaceConnections(project, projectId);
  connections.apply({ kind: 'set-allowed', enabled: false, id: 'claude-code', expectedRevision: 0 });

  const [row] = portfolioSnapshot(directory.list(), projectId).workspaces;
  expect(row).toMatchObject({ status: 'available', hosts: [{ id: 'codex', connections: 1 }],
    latestOutcome: { result: 'pass', recordedAt: createdAt, provenance: 'agent-report' }, progress: { completed: 1, total: 2 } });
  expect(row.sessions?.find(session => session.id === visible.id)).toMatchObject({ host: 'codex', phase: 'verify',
    responseModel: 'fixture-model', reasoningEffort: 'high', requestModel: null });
  expect(row.sessions?.filter(session => session.title.startsWith('Shared identity')).map(session => session.responseModel)).toEqual([null, null]);
  expect(JSON.stringify(row)).not.toMatch(/(?:Goal content|Task title|Evidence) sentinel|Hidden session title|excluded-model|Other tool report|exact-host-id|shared-model|unknown-fixture-host/u);
  await policy.update({ kind: 'set-project-participation', enabled: false, expectedRevision: changed.revision });
  expect(portfolioSnapshot(directory.list(), projectId).workspaces[0]).toMatchObject({ status: 'private', hosts: null, sessions: null,
    progress: null, latestOutcome: null, codexIndexAllowed: false });
}, 15000);
