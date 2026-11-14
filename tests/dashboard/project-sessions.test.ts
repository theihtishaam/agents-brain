import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { SESSION_LIMITS, SESSION_OPERATOR } from '../../src/brain/project-session-contract.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

const key = () => ({ key: randomUUID() });
const agent = { id: 'fixture-connection-a', kind: 'agent', tool: 'fixture-agent' } as const;
let root: string;
let brain: GlobalBrain;
let store: ProjectSessions;
let current: number;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-shared-sessions-'));
  brain = GlobalBrain.createIsolated({ dbPath: projectStorage(root).storagePath });
  current = Date.parse('2026-11-14T00:00:00.000Z');
  store = new ProjectSessions(root, brain, () => current);
});

afterEach(async () => {
  await brain.shutdown();
  const canonical = fs.realpathSync.native(root);
  if (path.dirname(canonical) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(canonical).startsWith('sb-shared-sessions-')) {
    throw new Error('Unexpected fixture path.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});

it('distinguishes stale reports from recent host reports without creating storage on reads', () => {
  expect(store.list().sessions).toEqual([]);
  expect(() => store.read(randomUUID())).toThrow(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
  expect(fs.readdirSync(root)).toEqual([]);
  const open = { title: 'Working on a fixture', goal: 'Record verified progress', ...key() };
  const initial = store.open(open, agent).session;
  expect(initial.presence).toBe('recent');
  current += SESSION_LIMITS.recentMs + 1;
  expect(store.list().sessions[0]).toMatchObject({ id: initial.id, reportedStatus: 'working', presence: 'stale' });
  const operatorCheckpoint = store.record(initial.id, { kind: 'checkpoint', summary: 'Operator checked the fixture', ...key() }, SESSION_OPERATOR);
  expect(operatorCheckpoint.session).toMatchObject({ presence: 'stale', lastReportedAt: initial.lastReportedAt });
  expect(store.open(open, agent).session).toMatchObject({ presence: 'stale', lastReportedAt: initial.lastReportedAt });
  expect(store.record(initial.id, { kind: 'status', status: 'waiting', ...key() }, agent).session).toMatchObject({
    presence: 'recent', reportedStatus: 'waiting', lastReportedAt: new Date(current).toISOString(),
  });
});

it('pages older messages without overlap and keeps terminal history immutable except explicit checkpoints', () => {
  const { id } = store.open({ title: 'Page history', goal: 'Read the older messages', ...key() }, agent).session;
  for (let index = 1; index <= 4; index++) store.record(id, { kind: 'message', role: 'note', text: `Message ${index}`, ...key() }, agent);
  const recent = store.read(id, 2);
  expect(recent).toMatchObject({ messageCount: 4, messages: [{ text: 'Message 3' }, { text: 'Message 4' }], nextBefore: recent.messages[0].id });
  expect(store.read(id, 2, recent.nextBefore!)).toMatchObject({ messageCount: 4, messages: [{ text: 'Message 1' }, { text: 'Message 2' }], nextBefore: null });
  expect(() => store.read(id, 2, randomUUID())).toThrow(expect.objectContaining({ code: 'SESSION_NOT_FOUND' }));
  const stopped = store.record(id, { kind: 'status', status: 'completed', ...key() }, agent).session;
  expect(stopped.presence).toBe('completed');
  expect(() => store.record(id, { kind: 'message', role: 'note', text: 'Rejected edit', ...key() }, SESSION_OPERATOR))
    .toThrow(expect.objectContaining({ code: 'SESSION_CONFLICT' }));
  const checkpoint = store.record(id, { kind: 'checkpoint', summary: 'Explicit historical handoff', ...key() }, SESSION_OPERATOR);
  expect(checkpoint.session).toMatchObject({ presence: 'completed', reportedStatus: 'completed', revision: stopped.revision + 1 });
  expect(checkpoint.messages).toHaveLength(4);
  expect(checkpoint.checkpoints[0]).not.toHaveProperty('summary');
  expect(store.readCheckpoint(id, checkpoint.checkpoints[0].id).checkpoint).toMatchObject({ summary: 'Explicit historical handoff', actor: SESSION_OPERATOR });
});

it('requires same-origin portal writes and persists hierarchy and handoffs on restart', async () => {
  let portal = await startProjectWorkspace(root);
  try {
    const post = (route: string, body: object, headers: Record<string, string> = {}) => fetch(portal.url + '/api/workspace/' + route, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
    });
    const input = { title: 'Portal fixture session', goal: 'Check global boundaries', ...key() };
    expect((await post('sessions', input, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post('sessions', input, { 'x-shadow-brain-project': 'foreign-project' })).status).toBe(409);
    expect((await post('sessions', { ...input, actor: agent })).status).toBe(400);
    expect((await post('sessions', { ...input, parentSessionId: randomUUID() })).status).toBe(404);
    expect(fs.existsSync(path.join(root, '.shadow-brain', 'project-hub.sqlite'))).toBe(true);
    const first = await post('sessions', input);
    expect(first.status).toBe(200);
    const origin = (await first.json()).session;
    const checkpointRef = (await (await post('sessions/' + origin.id + '/actions', { kind: 'checkpoint', summary: 'Decisions kept', ...key() })).json()).checkpoints[0];
    const checkpointResponse = await fetch(portal.url + '/api/workspace/sessions/' + origin.id + '/checkpoints/' + checkpointRef.id);
    expect(checkpointResponse.status).toBe(200);
    const checkpoint = (await checkpointResponse.json()).checkpoint;
    expect(checkpoint).toMatchObject({ summary: 'Decisions kept', sha256: checkpointRef.sha256 });
    expect((await post('sessions/' + origin.id + '/resume', { checkpointId: checkpoint.id, ...key() })).status).toBe(400);
    const next = await post('sessions/' + origin.id + '/resume', { checkpointId: checkpoint.id, sha256: checkpoint.sha256, ...key() });
    expect(next.status).toBe(200);
    const child = (await next.json()).session;
    await portal.close();
    portal = await startProjectWorkspace(root);
    const retained = await fetch(portal.url + '/api/workspace/sessions/' + child.id);
    expect(retained.status).toBe(200);
    expect(await retained.json()).toMatchObject({ session: { id: child.id, parentSessionId: origin.id }, handoff: checkpoint });
  } finally { await portal.close(); }
});

it('bounds checkpoint summaries and the encoded message page under worst-case retained history', () => {
  const { id } = store.open({ title: 'Bounded payload fixture', goal: 'Keep history paging stable', ...key() }, agent).session;
  for (let index = 0; index < SESSION_LIMITS.checkpoints; index++) {
    store.record(id, { kind: 'checkpoint', summary: 'x'.repeat(4000), decisions: Array(8).fill('d'.repeat(600)),
      completed: Array(8).fill('c'.repeat(600)), ...key() }, agent);
  }
  for (let index = 0; index < SESSION_LIMITS.messages; index++) {
    store.record(id, { kind: 'message', role: 'note', text: `${index} ${'☕'.repeat(7900)}`, ...key() }, agent);
  }
  const actual: number[] = [];
  let before: string | undefined;
  do {
    const page = store.read(id, 25, before);
    expect(page.checkpoints).toHaveLength(40);
    expect(page.checkpoints.every(row => !Object.hasOwn(row, 'summary'))).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(page.messages))).toBeLessThanOrEqual(SESSION_LIMITS.messagePageBytes);
    expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(48 * 1024);
    expect(page.messageCount).toBe(200);
    actual.push(...page.messages.slice().reverse().map(message => Number(message.text.split(' ')[0])));
    before = page.nextBefore ?? undefined;
  } while (before);
  expect(actual).toEqual(Array.from({ length: 200 }, (_, index) => 199 - index));
}, 30_000);

it('imports a selected native snapshot exactly, rejects other workspaces, and keeps older snapshots intact', async () => {
  const portal = await startProjectWorkspace(root);
  try {
    const input = (suffix: string, workspace = portal.root) => ({
      info: { id: 'native-conversation', projectID: 'native-project', title: 'Exact title ' + suffix,
        location: { directory: workspace }, time: { created: current, updated: current } },
      messages: [{ id: 'native-message', type: 'user', text: '  exact message ' + suffix + '  ' },
        { id: 'native-hidden', type: 'system', text: 'private synthetic hidden marker' }],
    });
    const upload = (value: ReturnType<typeof input>, operationKey = randomUUID()) => fetch(portal.url +
      '/api/workspace/sessions/native?' + new URLSearchParams({ tool: 'opencode', name: 'export.json', key: operationKey }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
      });
    expect((await upload(input('mismatch', path.join(portal.root, 'different-project')))).status).toBe(409);
    const uploadKey = randomUUID();
    const saved = await upload(input('original'), uploadKey);
    expect(saved.status).toBe(200);
    const detail = await saved.json();
    expect(detail).toMatchObject({ session: { title: 'Exact title original', hostSessionId: 'native-conversation', presence: 'completed',
      native: { tool: 'opencode', titleExact: 'Exact title original', previousSnapshotId: null, omitted: 1 } },
      messages: [{ text: '  exact message original  ', native: { id: 'native-message', locator: '/messages/0', sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) } }] });
    expect(JSON.stringify(detail)).not.toContain('private synthetic hidden marker');
    expect((await (await upload(input('original'), uploadKey)).json()).session.id).toBe(detail.session.id);
    expect((await upload(input('changed'), uploadKey)).status).toBe(409);
    const checkpoint = await fetch(portal.url + '/api/workspace/sessions/' + detail.session.id + '/actions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'checkpoint', summary: 'Reviewed specific source material', ...key() }),
    });
    expect(checkpoint.ok).toBe(true);
    expect((await (await upload(input('original'))).json()).session.id).toBe(detail.session.id);
    const changed = await (await upload(input('changed'))).json();
    expect(changed.session).toMatchObject({ title: 'Exact title changed', native: { previousSnapshotId: detail.session.id } });
    expect(changed.session.id).not.toBe(detail.session.id);
    expect((await (await fetch(portal.url + '/api/workspace/sessions/' + detail.session.id)).json()).messages).toEqual(detail.messages);
    const knowledge = await (await fetch(portal.url + '/api/workspace/memories')).json();
    expect(knowledge.items).toEqual([]);
  } finally { await portal.close(); }
});
