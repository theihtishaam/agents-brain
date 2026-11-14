import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { MCPServer } from '../../src/brain/mcp-server.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { memoryAnnotationsFor } from '../../src/brain/memory-annotations.js';
import { ProjectPolicyStore, projectChatKey } from '../../src/brain/project-policy.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { SESSION_OPERATOR } from '../../src/brain/project-session-contract.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

const cleanup: Array<() => unknown> = [];
const key = () => ({ key: randomUUID() });

async function fixture() {
  const temporary = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporary, 'sb-policy-test-'));
  cleanup.push(() => {
    const canonical = fs.realpathSync.native(root);
    if (path.dirname(canonical) !== temporary || !path.basename(canonical).startsWith('sb-policy-test-')) throw new Error('Unexpected fixture cleanup path.');
    fs.rmSync(canonical, { recursive: true, force: true });
  });
  const store = projectStorage(root);
  const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
  await brain.init();
  cleanup.push(() => brain.shutdown());
  return { root, brain, policy: new ProjectPolicyStore(root, store.projectId),
    settings: new FeatureSettingsStore({ filePath: store.settingsPath }), sessions: new ProjectSessions(root, brain), store };
}

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

it('uses bounded defaults, rejects stale and foreign storage, and preserves bytes on read errors', async () => {
  const { root, store, policy } = await fixture();
  expect(policy.get()).toMatchObject({ revision: 0, context: { maxTokens: 12000, maxEntries: 30 } });
  const file = path.join(root, '.shadow-brain', 'project-policy.json');
  expect(fs.existsSync(file)).toBe(false);
  const input = { kind: 'set-context-limits', expectedRevision: 0, context: { maxTokens: 400, maxEntries: 2 } } as const;
  expect(await policy.update(input)).toMatchObject({ revision: 1, context: input.context });
  await expect(policy.update(input)).rejects.toMatchObject({ code: 'PROJECT_POLICY_CONFLICT' });
  await expect(policy.update({ ...input, expectedRevision: 1, context: { maxTokens: 199, maxEntries: 2 } }))
    .rejects.toMatchObject({ code: 'PROJECT_POLICY_INVALID' });
  expect(await policy.update({ ...input, expectedRevision: 1 })).toMatchObject({ revision: 1 });
  const foreign = JSON.stringify({ ...policy.get(), projectId: store.projectId === '0123456789abcdef' ? 'fedcba9876543210' : '0123456789abcdef' });
  fs.writeFileSync(file, foreign);
  expect(() => policy.get()).toThrow(expect.objectContaining({ code: 'PROJECT_POLICY_UNAVAILABLE' }));
  expect(fs.readFileSync(file, 'utf8')).toBe(foreign);
});

it('reclaims a dead policy writer while preserving active and unfamiliar locks', async () => {
  const { root, policy } = await fixture();
  const folder = path.join(root, '.shadow-brain');
  fs.mkdirSync(folder, { recursive: true });
  const lock = path.join(folder, 'project-policy.lock');
  const marker = 'project-policy-lock';
  const deadPid = 0x7fffffff;
  fs.writeFileSync(lock, JSON.stringify({ kind: marker, pid: deadPid }));
  const command = { kind: 'set-context-limits', expectedRevision: 0, context: { maxTokens: 450, maxEntries: 3 } } as const;
  await expect(policy.update(command)).resolves.toMatchObject({ revision: 1, context: command.context });
  expect(fs.existsSync(lock)).toBe(false);
  const next = { ...command, expectedRevision: 1, context: { maxTokens: 600, maxEntries: 5 } };
  for (const value of [JSON.stringify({ kind: marker, pid: process.pid }), '', '{"kind":"unknown","pid":2147483647}', '{"kind":']) {
    fs.writeFileSync(lock, value);
    await expect(policy.update(next)).rejects.toMatchObject({ code: 'PROJECT_POLICY_CONFLICT' });
    expect(fs.readFileSync(lock, 'utf8')).toBe(value);
    expect(policy.get().revision).toBe(1);
  }
}, 10_000);

it('enforces sharing, lineage, and context ceilings across a warm MCP client and portal preview', async () => {
  const { root, brain, policy, settings, sessions, store } = await fixture();
  const portal = await startProjectWorkspace(root);
  cleanup.push(portal.close);
  const id = store.projectId;
  const parent = sessions.open({ title: 'HiddenPolicySession', goal: 'Fixture goal', ...key() }, SESSION_OPERATOR).session;
  const checkpoint = sessions.record(parent.id, { kind: 'checkpoint', summary: 'HiddenPolicyCheckpoint', ...key() }, SESSION_OPERATOR).checkpoints[0];
  const child = sessions.resume(parent.id, { checkpointId: checkpoint.id, sha256: checkpoint.sha256, ...key() }, SESSION_OPERATOR).session;
  const sourceId = randomUUID();
  const imported = sessions.importTranscript({ sourceId, ...key() }, () => ({ id: sourceId, name: 'Reviewed transcript',
    items: [{ id: 'item-1', locator: '/messages/0', role: 'user', originalRole: 'user', text: 'HiddenPolicySource' }] }), SESSION_OPERATOR).session;
  expect(projectChatKey(imported)).toBe('source:' + sourceId);
  const write = (content: string, metadata = {}) => brain.writeSync({
    projectId: id, projectName: store.projectName, agentTool: 'user', category: 'decision', content, metadata, importance: 0.8,
  });
  const allowed = write('policyneedle shared implementation', { source: 'docs/public.md' });
  const reusedText = write('policyneedle shared implementation', { source: 'HiddenPolicyDuplicate', originSessionId: child.id });
  const privateMemory = write('policyneedle HiddenPolicyMemory', { originSessionId: parent.id });
  const importedMemory = write('policyneedle HiddenPolicySource', { origin: 'project-source-import', sourceId });
  await brain.sync();
  await memoryAnnotationsFor(brain).update({ kind: 'link', projectId: id, fromId: allowed, toId: privateMemory, type: 'related', note: 'HiddenPolicyLink' });
  const server = new MCPServer(null, { toolProfile: 'memory', authToken: '' }, { brain, settings, projectDir: root, projectId: id, localProject: true });
  cleanup.push(() => server.finishMemorySession());
  let sequence = 0;
  const rpc = (method: string, params: Record<string, unknown>) => server.handleRequest({ jsonrpc: '2.0', id: ++sequence, method, params });
  await rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Codex', version: '1' } });
  const call = (name: string, args: Record<string, unknown> = {}) => rpc('tools/call', { name, arguments: args });
  const result = (response: Awaited<ReturnType<typeof call>>) => JSON.stringify(response.result ?? response.error);
  expect(result(await call('memory_inspect', { memoryId: privateMemory }))).toContain('HiddenPolicyMemory');

  const set = async (command: Record<string, unknown>) => {
    const response = await fetch(portal.url + '/api/workspace/project-policy', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...command, expectedRevision: policy.get().revision }) });
    expect(response.status).toBe(200);
    return response.json();
  };
  await set({ kind: 'set-chat-sharing', sessionId: parent.id, shareContext: false });
  const controls = await set({ kind: 'set-chat-sharing', sessionId: imported.id, shareContext: false });
  expect(controls.chats.find((row: { id: string }) => row.id === child.id)).toMatchObject({ inheritedBlocked: true });
  await set({ kind: 'set-context-limits', context: { maxTokens: 330, maxEntries: 1 } });
  await set({ kind: 'set-session-role', sessionId: child.id, role: 'observer' });
  for (const name of ['global_recall', 'global_recall_scored', 'global_timeline', 'memory_health']) {
    expect(result(await call(name))).not.toMatch(/HiddenPolicy/u);
  }
  for (const memoryId of [privateMemory, reusedText, importedMemory]) {
    expect(result(await call('memory_inspect', { memoryId }))).toContain('"found":false');
    expect(result(await call('memory_evidence', { memoryId }))).toContain('"found":false');
    expect((await rpc('resources/read', { uri: `shadow-brain://projects/${id}/memories/${memoryId}` })).error).toBeDefined();
  }
  expect(result(await call('memory_inspect', { memoryId: allowed }))).not.toContain('HiddenPolicyLink');
  expect(result(await call('session_list'))).not.toMatch(/HiddenPolicy|Reviewed transcript/u);
  expect(result(await call('session_read', { sessionId: child.id }))).toContain('SESSION_SHARING_OFF');
  expect(result(await call('session_checkpoint_read', { sessionId: parent.id, checkpointId: checkpoint.id }))).toContain('SESSION_SHARING_OFF');
  expect(result(await call('session_resume', { sessionId: parent.id, checkpointId: checkpoint.id, sha256: checkpoint.sha256, ...key() }))).toContain('SESSION_SHARING_OFF');
  expect(sessions.read(parent.id).checkpoints).toHaveLength(1);
  const options = { projectId: id, query: 'policyneedle', profile: 'adaptive', tokenBudget: 12000, maxEntries: 30 };
  const pack = (await call('context_pack', options)).result?.structuredContent;
  expect(pack).toMatchObject({ budget: { tokenBudget: 330 }, policy: { revision: 4, effectiveMaxEntries: 1, hiddenMemories: 3 },
    entries: [{ id: allowed, sourceReferences: [{ memoryId: allowed, source: 'docs/public.md' }] }] });
  expect(JSON.stringify(pack)).not.toMatch(/HiddenPolicy/u);
  const prompt = await rpc('prompts/get', { name: 'shadow-task', arguments: { projectId: id, request: 'policyneedle' } });
  expect(result(prompt)).toContain('330 estimated tokens, limit 1 entries');
  expect(result(prompt)).not.toMatch(/HiddenPolicy/u);
  const preview = await fetch(portal.url + '/api/workspace/context-compare', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options) }).then(response => response.json());
  expect(preview.adaptive).toMatchObject({ efficiency: { referenceEntryLimit: 1, referenceTokenBudget: 330 } });
  expect(JSON.stringify(preview)).not.toMatch(/HiddenPolicy/u);
  await set({ kind: 'set-tool-participation', tool: 'codex', enabled: false });
  expect(result(await call('project_policy'))).toContain('"enabled":false');
  expect((await call('context_pack', options)).error?.code).toBe(-32003);
  expect((await rpc('resources/read', { uri: 'shadow-brain://guide' })).error?.code).toBe(-32003);
  expect((await rpc('prompts/get', { name: 'shadow-task', arguments: { projectId: id, request: 'policyneedle' } })).error?.code).toBe(-32003);
  await set({ kind: 'set-tool-participation', tool: 'codex', enabled: true });
  expect((await call('context_pack', options)).error).toBeUndefined();
  fs.writeFileSync(path.join(root, '.shadow-brain', 'project-policy.json'), 'corrupt');
  expect((await call('global_recall')).error?.code).toBe(-32003);
  expect((await fetch(portal.url + '/api/workspace/project-policy')).status).toBe(503);
  expect((await fetch(portal.url + '/api/workspace/sessions/' + parent.id)).status).toBe(200);
});
