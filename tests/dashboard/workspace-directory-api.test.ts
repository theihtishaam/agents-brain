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
import { HubStore } from '../../src/brain/project-hub-store.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectPolicyStore } from '../../src/brain/project-policy.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { WorkspaceConnections } from '../../src/brain/workspace-connections.js';
import { WorkspaceDirectory } from '../../src/brain/workspace-directory.js';
import { portfolioSnapshot, workspaceDirectoryRequest } from '../../src/dashboard/workspace-directory-api.js';
import { directoryCodexIndex } from '../../src/dashboard/workspace-directory-codex.js';

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
