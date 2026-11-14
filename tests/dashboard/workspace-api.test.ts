import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { Readable } from 'node:stream';
import { Script } from 'node:vm';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { getBrainBus } from '../../src/brain/brain-bus.js';
import { handleWorkspaceRequest } from '../../src/dashboard/workspace-api.js';
import { WORKSPACE_HTML } from '../../src/dashboard/workspace-html.js';
import { MCPServer } from '../../src/brain/mcp-server.js';

let dir: string;
let brain: GlobalBrain;
let settings: FeatureSettingsStore;
let server: http.Server;
let url: string;
beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-workspace-'));
  brain = GlobalBrain.getInstance({ dbPath: path.join(dir, 'global.json'), syncIntervalMs: 60000 });
  settings = new FeatureSettingsStore({ filePath: path.join(dir, 'feature-settings.json') });
  await brain.init();
  for (const [projectId, content] of [['alpha', 'Checkout retries need an idempotency key.'], ['alpha', '<img src=x onerror=alert(1)> keep notes as text'], ['beta', 'Checkout retries for another project must stay separate.']]) {
    brain.writeSync({ projectId, projectName: projectId, agentTool: 'codex', category: 'lesson', content, importance: 0.7, metadata: { sources: [content.startsWith('<img') ? 'docs/notes.md' : 'docs/checkout.md'] } });
  }
  await brain.sync();
  server = http.createServer((req, res) => { void handleWorkspaceRequest(req, res, { brain, settings }); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  url = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/api/workspace/';
});
afterEach(async () => {
  vi.restoreAllMocks();
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await brain.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
});
const post = (route: string, input: unknown) => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });

describe('workspace API and guidance integration', () => {
  it('compares profiles on one read view, exposes scoped attention, and never commits staged memory on read', async () => {
    const before = fs.readFileSync(brain.dbPath, 'utf8');
    brain.writeSync({ projectId: 'alpha', projectName: 'alpha', agentTool: 'codex', category: 'lesson', content: 'Checkout stage stays pending.', importance: 0.8, metadata: {} });
    const refresh = vi.spyOn(brain, 'refresh');
    const result = await (await post('context-compare', { projectId: 'alpha', query: 'checkout', tokenBudget: 1000 })).json();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.adaptive.retrieval.profile).toBe('adaptive');
    expect(result.adaptive.entries.every((entry: any) => entry.projectId === 'alpha')).toBe(true);
    expect(result.legacy.retrieval).toBeUndefined();
    expect(result.delta.sharedIds.length).toBeGreaterThan(0);
    const health = await (await fetch(url + 'memory-health?project=alpha&limit=1')).json();
    expect(health.counts.total).toBe(3);
    expect(health.queue).toHaveLength(1);
    expect(health.queue[0].projectId).toBe('alpha');
    expect(fs.readFileSync(brain.dbPath, 'utf8')).toBe(before);
    for (const input of [{ profile: ['adaptive'] }, { expandRelated: 'false' }, { profile: 'automatic' }]) {
      expect((await post('context', { projectId: 'alpha', ...input })).status).toBe(400);
    }
  });

  it('returns real inventory, scoped recall and explicit graph relationships', async () => {
    const overview = await (await fetch(url + 'overview')).json();
    expect(overview.totals).toMatchObject({ memories: 3, projects: 2, agents: 1 });
    const memories = await (await fetch(url + 'memories?project=alpha&q=checkout')).json();
    expect(memories.items).toHaveLength(1);
    expect(memories.items[0]).toMatchObject({ project: 'alpha', sources: ['docs/checkout.md'] });
    expect(memories.items[0].reasons.join(' ')).toContain('checkout');
    const graph = await (await fetch(url + 'graph?project=alpha')).json();
    expect(graph.nodes.filter((node: any) => node.kind === 'memory')).toHaveLength(2);
    expect(graph.nodes.some((node: any) => node.project === 'beta')).toBe(false);
    expect(new Set(graph.edges.map((edge: any) => edge.kind))).toEqual(new Set(['belongs-to', 'recorded-by']));
    expect((await fetch(url + 'memories?limit=-1')).status).toBe(400);
  });

  it('persists real gates, rejects stale revisions and keeps cross-project context opt-in', async () => {
    const initial = await (await fetch(url + 'features')).json();
    const changed = await post('features', { patch: { crossProjectContext: true }, expectedRevision: initial.revision });
    expect(changed.status).toBe(200);
    expect((await new FeatureSettingsStore({ filePath: settings.filePath }).get()).features.crossProjectContext).toBe(true);
    expect((await post('features', { patch: { contextAssembly: false }, expectedRevision: initial.revision })).status).toBe(409);
    const scoped = await (await post('context', { projectId: 'alpha', query: 'checkout', tokenBudget: 1000 })).json();
    expect(scoped.entries.every((entry: any) => entry.projectId === 'alpha')).toBe(true);
    const broad = await (await post('context', { projectId: 'alpha', query: 'checkout', tokenBudget: 1000, includeCrossProject: true })).json();
    expect(broad.entries.some((entry: any) => entry.projectId === 'beta')).toBe(true);
    expect((await post('features', { patch: { liveActivity: 'false' } })).status).toBe(400);
    expect((await post('context', { projectId: 'alpha', tokenBudget: '500' })).status).toBe(400);
  });

  it('returns a disabled context result without initializing or refreshing memory', async () => {
    await settings.update({ contextAssembly: false });
    const init = vi.spyOn(brain, 'init');
    const sync = vi.spyOn(brain, 'sync');
    const response = await post('context', { projectId: 'alpha', query: 'checkout' });
    expect(response.status).toBe(200);
    expect((await response.json()).enabled).toBe(false);
    expect(init).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();
  });

  it('suppresses both activity and overview feed when activity is disabled', async () => {
    getBrainBus().publish({ type: 'fixture', source: 'codex', detail: 'Synthetic event' });
    expect((await (await fetch(url + 'activity')).json()).activity.length).toBeGreaterThan(0);
    await settings.update({ liveActivity: false });
    expect(await (await fetch(url + 'activity')).json()).toEqual({ enabled: false, activity: [] });
    expect((await (await fetch(url + 'overview')).json()).activity).toEqual([]);
  });

  it('decodes UTF-8 split across body chunks once and preserves meaningful query text', async () => {
    const payload = Buffer.from(JSON.stringify({ projectId: 'alpha', query: 'café' }));
    const split = payload.indexOf(Buffer.from('é')) + 1;
    const req = Readable.from([payload.subarray(0, split), payload.subarray(split)]) as unknown as http.IncomingMessage;
    Object.assign(req, { url: '/api/workspace/context', method: 'POST', headers: { 'content-type': 'application/json' } });
    let status = 0;
    let output = '';
    const res = { writeHead(code: number) { status = code; }, end(text: string) { output = text; } } as unknown as http.ServerResponse;
    await handleWorkspaceRequest(req, res, { brain, settings });
    expect(status).toBe(200);
    expect(JSON.parse(output).queryKeywords).toContain('café');
  });

  it('exposes context and flag inspection through MCP and parses the shipped inline scripts', async () => {
    const mcp = new MCPServer({}, { authToken: '' });
    const reply: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'context_pack', arguments: { projectId: 'alpha', query: 'checkout', tokenBudget: 1000 } } });
    const pack = JSON.parse(reply.result.content[0].text);
    expect(pack.entries).toHaveLength(1);
    expect(pack.entries[0].projectId).toBe('alpha');
    const flags: any = await mcp.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'feature_flags', arguments: {} } });
    const featureFlags = JSON.parse(flags.result.content[0].text);
    expect(featureFlags.definitions).toHaveLength(6);
    expect(featureFlags.features.projectFileActivity).toBe(false);
    const scripts = [...WORKSPACE_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, script] of scripts) expect(() => new Script(script)).not.toThrow();
  });
});
