import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { MCPServer } from '../../src/brain/mcp-server.js';
import { getBrainBus } from '../../src/brain/brain-bus.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-project-portal-'))); roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'checkout-fixture', scripts: { test: 'DO_NOT_EXECUTE_THIS_FIXTURE' }, devDependencies: { vitest: 'SYNTHETIC_VALUE' } }));
  return root;
}
const post = (url: string, route: string, input: unknown) => fetch(url + '/api/workspace/' + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
});

it('persists user knowledge, previews and protects a local skill, survives restart, and uses the same isolated MCP store', async () => {
  const root = fixture();
  const otherRoot = fixture();
  const foreign = GlobalBrain.getInstance({ dbPath: path.join(otherRoot, 'foreign.json') });
  await foreign.init();
  const portal = await startProjectWorkspace(root);
  let memoryId: string;
  const profileId = portal.projectId;
  try {
    getBrainBus().publish({ source: 'codex', type: 'memory-write', detail: 'FOREIGN_ACTIVITY_SENTINEL', meta: { projectId: profileId } });
    const first = await (await fetch(portal.url + '/api/workspace/overview')).json();
    expect(first.projectKit).toMatchObject({ available: true, projectId: profileId, root, storagePath: portal.storagePath });
    expect(first.projects).toHaveLength(1);
    expect(first.totals.memories).toBe(0);
    expect(JSON.stringify(first)).not.toContain('FOREIGN_ACTIVITY_SENTINEL');
    const inspect = await (await fetch(portal.url + '/api/workspace/project-profile')).json();
    expect(inspect.projectId).toBe(profileId);
    expect(JSON.stringify(inspect)).not.toContain('DO_NOT_EXECUTE_THIS_FIXTURE');
    expect(JSON.stringify(inspect)).not.toContain('SYNTHETIC_VALUE');
    const response = await post(portal.url, 'project-knowledge', { title: 'Checkout retry contract', content: '  Preserve the idempotency key across checkout retries.\n', source: 'docs/checkout.md' });
    expect(response.status).toBe(200);
    const saved = await response.json(); memoryId = saved.memoryId;
    expect(saved).toMatchObject({ ok: true, projectId: profileId });
    expect(fs.existsSync(portal.storagePath)).toBe(true);
    const context = await (await post(portal.url, 'context', { projectId: profileId, query: 'checkout retry idempotency', profile: 'adaptive' })).json();
    expect(context.entries.some((entry: any) => entry.id === memoryId)).toBe(true);
    const detail = await (await fetch(portal.url + '/api/workspace/memory?project=' + profileId + '&id=' + memoryId)).json();
    expect(detail.memory.content).toBe('Checkout retry contract\n  Preserve the idempotency key across checkout retries.\n');
    expect(detail.memory.agent).toBe('user');
    const outcome = await (await post(portal.url, 'project-feedback', { kind: 'record', expectedRevision: 0,
      memoryId, task: 'checkout retry idempotency', rating: 'useful', reason: 'The synthetic retry check preserved one operation.' })).json();
    expect(outcome.records[0].reporter).toBe('user');
    const withFeedback = await (await post(portal.url, 'context', { projectId: profileId, query: 'checkout retry idempotency', profile: 'adaptive' })).json();
    expect(withFeedback.retrieval.candidates[0].signals).toContainEqual({ label: 'Project task feedback', value: 0.08 });
    expect((await post(portal.url, 'project-feedback', { kind: 'enable', expectedRevision: 0, enabled: false })).status).toBe(409);
    const switched = await (await post(portal.url, 'project-feedback', { kind: 'enable', expectedRevision: outcome.revision, enabled: false })).json();
    expect(switched.enabled).toBe(false);
    const withoutFeedback = await (await post(portal.url, 'context', { projectId: profileId, query: 'checkout retry idempotency', profile: 'adaptive' })).json();
    expect(withoutFeedback.retrieval.candidates[0].signals.some((signal: any) => signal.label === 'Project task feedback')).toBe(false);
    const params = { target: 'codex', name: 'checkout-retry', requirement: 'Fix checkout retries and verify the idempotency contract.', knowledge: 'Keep the idempotency key.' };
    const preview = await (await post(portal.url, 'project-skill-preview', params)).json();
    expect(preview.files[0].relativePath).toBe('.agents/skills/checkout-retry/SKILL.md');
    expect(fs.existsSync(path.join(root, preview.files[0].relativePath))).toBe(false);
    const applied = await post(portal.url, 'project-skill-apply', { ...params, expectedPlanHash: preview.planHash });
    expect(applied.status).toBe(200);
    const skillPath = path.join(root, preview.files[0].relativePath);
    expect(fs.readFileSync(skillPath, 'utf8')).toContain(params.requirement);
    fs.appendFileSync(skillPath, '\nHuman revision stays here.');
    const conflict = await post(portal.url, 'project-skill-apply', { ...params, expectedPlanHash: preview.planHash });
    expect(conflict.status).toBe(409);
    expect(fs.readFileSync(skillPath, 'utf8')).toContain('Human revision stays here.');
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
    const integrations = await (await fetch(portal.url + '/api/workspace/integrations')).json();
    const config = JSON.parse(integrations.agents.find((agent: any) => agent.id === 'claude-code').config.content);
    expect(config.mcpServers.shadow_brain.args).toEqual(expect.arrayContaining(['--db', portal.storagePath, '--project-id', profileId]));
    expect((await post(portal.url, 'project-knowledge', { title: 'No path', content: 'Cannot choose another root', root: otherRoot })).status).toBe(400);
    expect((await post(portal.url, 'context', { projectId: 'foreign', query: 'checkout' })).status).toBe(400);
    expect(JSON.stringify(await (await fetch(portal.url + '/api/workspace/activity')).json())).not.toContain('FOREIGN_ACTIVITY_SENTINEL');
    const telemetry = await (await fetch(portal.url + '/api/workspace/telemetry')).json();
    expect(telemetry.events.some((event: any) => event.source === 'reported' && event.tool === 'project-knowledge' && event.kind === 'tool-end' && event.outcome === 'success')).toBe(true);
    expect(GlobalBrain.getInstance()).toBe(foreign);
  } finally { await portal.close(); await foreign.shutdown(); }
  await portal.close();
  expect(fs.existsSync(portal.storagePath)).toBe(true);
  const restarted = await startProjectWorkspace(root);
  const consumer = GlobalBrain.createIsolated({ dbPath: portal.storagePath });
  await consumer.init();
  const foreignId = consumer.writeSync({ projectId: 'foreign-project', projectName: 'FOREIGN_PROJECT_SENTINEL', content: 'FOREIGN_CONTENT_SENTINEL', agentTool: 'codex', category: 'lesson', importance: 1, metadata: { sources: ['FOREIGN_SOURCE_SENTINEL'] } });
  await consumer.sync();
  const mcp = new MCPServer(null, { authToken: '', toolProfile: 'memory' }, {
    brain: consumer, settings: new FeatureSettingsStore({ filePath: portal.settingsPath }), projectDir: root, projectId: profileId, localProject: true,
  });
  try {
    const memories = await (await fetch(restarted.url + '/api/workspace/memories')).json();
    expect(memories.items.some((entry: any) => entry.id === memoryId)).toBe(true);
    const listed: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(listed.result.tools.find((tool: any) => tool.name === 'project_knowledge').annotations.readOnlyHint).toBe(false);
    const recalled: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'context_pack', arguments: { projectId: profileId, query: 'checkout retries', profile: 'adaptive' } } });
    expect(recalled.result.structuredContent.entries.some((entry: any) => entry.id === memoryId)).toBe(true);
    for (const name of ['global_recall', 'global_recall_scored', 'global_timeline', 'global_stats', 'memory_health']) {
      const reply: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name, arguments: {} } });
      expect(reply.error).toBeUndefined();
      expect(JSON.stringify(reply)).not.toMatch(/FOREIGN_.*_SENTINEL/);
    }
    for (const name of ['global_recall', 'global_recall_scored', 'global_timeline', 'context_pack', 'memory_inspect', 'memory_health', 'activity_report']) {
      const reply: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name, arguments: { projectId: 'foreign-project', memoryId: foreignId } } });
      expect(reply.error.code).toBe(-32602);
    }
    const resource: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 5, method: 'resources/read', params: { uri: 'shadow-brain://projects/foreign-project/memories/' + foreignId } });
    expect(resource.error.code).toBe(-32602);
    const prompt: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'shadow-task', arguments: { projectId: 'foreign-project', request: 'FOREIGN_CONTENT_SENTINEL' } } });
    expect(prompt.error.code).toBe(-32602);
    expect(consumer).not.toBe(GlobalBrain.getInstance({ dbPath: path.join(root, 'unused.json') }));
  } finally { await mcp.finishMemorySession(); await consumer.shutdown(); await restarted.close(); await GlobalBrain.getInstance().shutdown(); }
});

it('rejects linked project storage before opening the target or changing any files', async () => {
  const root = fixture(); const external = fixture();
  fs.symlinkSync(external, path.join(root, '.shadow-brain'), 'junction');
  await expect(startProjectWorkspace(root)).rejects.toThrow(/unsafe|link/i);
  expect(fs.readdirSync(external)).toEqual(['package.json']);
});
