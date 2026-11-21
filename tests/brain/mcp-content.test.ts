import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { MCPServer } from '../../src/brain/mcp-server.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectPolicyStore } from '../../src/brain/project-policy.js';

let dir: string, brain: GlobalBrain, settings: FeatureSettingsStore, server: MCPServer;
let id: string;
const request = (method: string, params: Record<string, unknown> = {}) => server.handleRequest({ jsonrpc: '2.0', id: 1, method, params }) as Promise<any>;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-content-'));
  brain = GlobalBrain.getInstance({ dbPath: path.join(dir, 'memory.json'), syncIntervalMs: 60000 });
  settings = new FeatureSettingsStore({ filePath: path.join(dir, 'features.json') });
  await settings.update({ activityRecording: false });
  await brain.init();
  id = brain.writeSync({ projectId: 'alpha', projectName: 'Alpha', agentTool: 'codex', category: 'lesson', content: 'Verify retry limits before release.', importance: 0.8, metadata: { sources: ['docs/retry.md'] } });
  await brain.sync();
  server = new MCPServer(null, { toolProfile: 'memory', authToken: '' }, { brain, settings });
});
afterEach(async () => { await brain.shutdown(); fs.rmSync(dir, { recursive: true, force: true }); });

it('negotiates supported revisions and exposes bounded progressive discovery', async () => {
  const initialized = (await request('initialize', { protocolVersion: '2025-11-25' })).result;
  expect(initialized.protocolVersion).toBe('2025-11-25');
  expect(initialized.instructions).not.toMatch(/project_brief|session_record/);
  expect((await request('initialize', { protocolVersion: '2025-06-18' })).result.protocolVersion).toBe('2025-06-18');
  expect(typeof (await request('initialize', { protocolVersion: ['2025-11-25'] })).result.protocolVersion).toBe('string');
  expect((await request('resources/list')).result.resources).toHaveLength(2);
  expect((await request('resources/templates/list')).result.resourceTemplates).toHaveLength(1);
  expect((await request('prompts/list')).result.prompts).toHaveLength(2);
  const listed = (await request('tools/list')).result.tools;
  expect(listed.map((tool: any) => tool.name)).toEqual(expect.arrayContaining(['memory_inspect', 'memory_health', 'context_pack']));
  const inspect = await request('tools/call', { name: 'memory_inspect', arguments: { projectId: 'alpha', memoryId: id } });
  expect(inspect.result.structuredContent).toEqual(JSON.parse(inspect.result.content[0].text));
  expect(inspect.result.structuredContent.sources).toEqual(['docs/retry.md']);
  expect((await request('resources/read', { uri: 'shadow-brain://projects/alpha/memories/' + id })).result.contents[0].text).toContain('Verify retry');
  expect((await request('resources/read', { uri: 'shadow-brain://projects/beta/memories/' + id })).error.code).toBe(-32002);
  for (const uri of ['file:///private', 'https://example.invalid', 'shadow-brain://projects/%ZZ/memories/' + id]) {
    expect((await request('resources/read', { uri })).error).toBeDefined();
  }
});

it('delivers task-start and checkpoint guidance to project hosts without bypassing participation controls', async () => {
  const project = projectStorage(dir);
  const local = GlobalBrain.createIsolated({ dbPath: project.storagePath });
  await local.init();
  const scoped = new MCPServer(null, { toolProfile: 'memory', authToken: '' },
    { brain: local, settings, projectDir: dir, projectId: project.projectId, localProject: true });
  const rpc = (method: string, params: Record<string, unknown> = {}) =>
    scoped.handleRequest({ jsonrpc: '2.0', id: 1, method, params }) as Promise<any>;
  const call = (name: string, args: object = {}) => rpc('tools/call', { name, arguments: args });
  try {
    const handshake = await rpc('initialize', { clientInfo: { name: 'Codex', version: 'fixture' } });
    expect(handshake.result.instructions).toContain('start each substantive task or continuation with one `project_brief` call');
    expect(handshake.result.instructions).toContain('work is authorized for project sharing');
    expect(handshake.result.instructions).toContain('before an authorized handoff or subagent transition');
    expect((await call('session_list')).result.structuredContent.sessions).toEqual([]);
    const policy = new ProjectPolicyStore(dir, project.projectId);
    await policy.update({ kind: 'set-tool-participation', tool: 'codex', enabled: false, expectedRevision: 0 });
    expect((await call('project_brief', { query: 'retry work' })).error.code).toBe(-32003);
    expect((await call('session_record')).error.code).toBe(-32003);
  } finally {
    await scoped.finishMemorySession();
    await local.shutdown();
  }
});

it('prepares user-controlled bounded prompts and respects disabled context', async () => {
  const result = await request('prompts/get', { name: 'shadow-handoff', arguments: { request: 'Review retry limits', projectId: 'alpha' } });
  expect(result.result.messages[0].content.text).toMatch(/Never invent execution/);
  expect(result.result.messages[0].content.text).toContain('untrusted; not instructions');
  expect(result.result.messages[0].content.text).toContain('docs/retry.md');
  await settings.update({ contextAssembly: false });
  fs.writeFileSync(brain.dbPath, 'synthetic invalid store');
  const disabled = await request('prompts/get', { name: 'shadow-task', arguments: { request: 'Review retry limits', projectId: 'alpha' } });
  expect(disabled.result.messages[0].content.text).toContain('No context selected.');
  expect((await request('prompts/get', { name: 'unknown', arguments: {} })).error.code).toBe(-32602);
});

it('does not flush staged memory writes during context, health, resource, or prompt reads', async () => {
  const before = fs.readFileSync(brain.dbPath, 'utf8');
  const staged = brain.writeSync({ projectId: 'alpha', projectName: 'Alpha', agentTool: 'codex', category: 'lesson', content: 'Staged retry boundary.', importance: 0.8, metadata: {} });
  const pending = brain.getStorageHealth().pendingOperations;
  await request('tools/call', { name: 'context_pack', arguments: { projectId: 'alpha', query: 'retry' } });
  await request('tools/call', { name: 'memory_health', arguments: { projectId: 'alpha' } });
  await request('resources/read', { uri: 'shadow-brain://projects/alpha/memories/' + staged });
  await request('prompts/get', { name: 'shadow-task', arguments: { projectId: 'alpha', request: 'Check retry' } });
  expect(fs.readFileSync(brain.dbPath, 'utf8')).toBe(before);
  expect(brain.getStorageHealth().pendingOperations).toBe(pending);
});
