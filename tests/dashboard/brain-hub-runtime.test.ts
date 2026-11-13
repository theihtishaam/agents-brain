import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

type Portal = Awaited<ReturnType<typeof startProjectWorkspace>>;
const roots: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  const temporary = fs.realpathSync.native(os.tmpdir());
  for (const root of roots.splice(0)) {
    const canonical = fs.realpathSync.native(root);
    if (path.dirname(canonical) !== temporary || !path.basename(canonical).startsWith('sb-hub-runtime-')) {
      throw new Error('Refusing to remove an unexpected runtime fixture path.');
    }
    fs.rmSync(canonical, { recursive: true, force: true });
  }
});

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-hub-runtime-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'synthetic-hub-runtime', private: true }));
  return root;
}

async function launch(root = fixture(), port?: number): Promise<Portal> {
  const portal = await startProjectWorkspace(root, { port });
  cleanup.push(() => portal.close());
  return portal;
}

async function read(portal: Portal, route: string): Promise<Response> {
  // agent:false opens a fresh TCP connection. A Connection:close fetch header
  // alone can still select a stale undici socket after a same-port restart.
  return new Promise((resolve, reject) => {
    const request = httpRequest(portal.url + '/api/workspace/' + route, { agent: false }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.once('error', reject);
      response.once('end', () => resolve(new Response(Buffer.concat(chunks), { status: response.statusCode })));
    });
    request.once('error', reject); request.end();
  });
}

const post = (portal: Portal, route: string, body: unknown, headers = {}) => fetch(portal.url + '/api/workspace/' + route, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});

function untrustedHostStatus(url: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { headers: { Host: 'untrusted.invalid' }, agent: false }, response => {
      response.resume(); response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject); request.end();
  });
}

describe('Brain Hub project runtime', () => {
  it('serves the real hub and retained interfaces with independent instance and capability status', async () => {
    const portal = await launch();
    const statusResponse = await read(portal, 'status');
    expect(statusResponse.status).toBe(200);
    const status = await statusResponse.json();
    expect(status).toMatchObject({ version: '7.1.4', mode: 'project', project: { id: portal.projectId, root: portal.root },
      storage: { status: 'ready' }, capabilities: { hub: true, pdf: true, modelUsage: false, managedExecution: false } });
    expect(status.serverInstanceId).toMatch(/^[0-9a-f-]{36}$/u);
    expect((await (await read(portal, 'status')).json()).serverInstanceId).toBe(status.serverInstanceId);
    for (const route of ['/', '/hub', '/hub?test=route', '/workspace', '/memory-workspace', '/live']) {
      const response = await fetch(portal.url + route);
      expect(response.status, route).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.text()).includes('data-project-local="true"'), route).toBe(true);
    }
    expect((await (await fetch(portal.url + '/hub')).text()).includes('id="brain-canvas"')).toBe(true);
    expect((await fetch(portal.url + '/unavailable-route')).status).toBe(404);
    expect(await untrustedHostStatus(portal.url + '/api/workspace/status')).toBe(403);
    const hubs = await (await read(portal, 'hub')).json();
    expect(hubs).toMatchObject({ projectId: portal.projectId, rooms: [], documents: [], lessons: [], ocr: 'unavailable' });
  });

  it('preserves project state and feature controls across a same-port restart with a new instance', async () => {
    const portal = await launch();
    const originalStatus = await (await read(portal, 'status')).json();
    const saved = await (await post(portal, 'project-knowledge', { title: 'StableRuntimeSentinel', content: 'Use the same operation key after a retry.' })).json();
    const created = await (await post(portal, 'hub/rooms', { goal: 'Check restart persistence', key: randomUUID() })).json();
    const features = await (await read(portal, 'features')).json();
    expect((await post(portal, 'features', { patch: { contextAssembly: false }, expectedRevision: features.revision })).status).toBe(200);
    const disabled = await (await post(portal, 'context', { projectId: portal.projectId, query: 'StableRuntimeSentinel' })).json();
    expect(disabled.entries).toEqual([]);
    const port = Number(new URL(portal.url).port);
    await portal.close();
    await portal.close();
    const restarted = await launch(portal.root, port);
    expect(restarted.url).toBe(portal.url);
    const after = await (await read(restarted, 'status')).json();
    expect(after.serverInstanceId).not.toBe(originalStatus.serverInstanceId);
    expect(after.project.id).toBe(originalStatus.project.id);
    expect((await (await read(restarted, 'hub')).json()).rooms[0].id).toBe(created.room.id);
    expect((await (await read(restarted, 'memories')).json()).items.map((entry: { id: string }) => entry.id)).toContain(saved.memoryId);
    const restoredFeatures = await (await read(restarted, 'features')).json();
    expect(restoredFeatures.features.contextAssembly).toBe(false);
    expect((await post(restarted, 'features', { patch: { contextAssembly: true }, expectedRevision: restoredFeatures.revision })).status).toBe(200);
    const enabled = await (await post(restarted, 'context', { projectId: restarted.projectId, query: 'StableRuntimeSentinel', profile: 'adaptive' })).json();
    expect(enabled.entries.map((entry: { id: string }) => entry.id)).toContain(saved.memoryId);
  });

  it('keeps its UI and heartbeat available for corrupt memory and recovers after the store is repaired', async () => {
    const first = await launch();
    const saved = await (await post(first, 'project-knowledge', { title: 'RecoverySentinel', content: 'A valid fixture is restored after the failure.' })).json();
    await first.close();
    const valid = fs.readFileSync(first.storagePath);
    const invalid = Buffer.from('{invalid-synthetic-memory');
    fs.writeFileSync(first.storagePath, invalid);
    const portal = await launch(first.root);
    const status = await (await read(portal, 'status')).json();
    expect(status.storage.status).toBe('error');
    expect((await fetch(portal.url + '/hub')).status).toBe(200);
    const rejected = await post(portal, 'project-knowledge', { title: 'Do not overwrite', content: 'This must not be committed.' });
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toMatchObject({ code: 'WORKSPACE_STORAGE_UNAVAILABLE' });
    expect(fs.readFileSync(first.storagePath)).toEqual(invalid);
    fs.writeFileSync(first.storagePath, valid);
    const recovered = await (await read(portal, 'status')).json();
    expect(recovered.serverInstanceId).toBe(status.serverInstanceId);
    expect(recovered.storage.status).toBe('ready');
    expect((await (await read(portal, 'memories')).json()).items.map((entry: { id: string }) => entry.id)).toEqual([saved.memoryId]);
    expect((await read(portal, 'hub')).status).toBe(200);
  });

  it('pins search, selected graph nodes, direct detail and context to the local project even in a mixed store', async () => {
    const portal = await launch();
    const writer = GlobalBrain.createIsolated({ dbPath: portal.storagePath });
    cleanup.push(() => writer.shutdown());
    await writer.init();
    const foreignId = writer.writeSync({ projectId: 'foreign-project', projectName: 'FOREIGN_SCOPE_SENTINEL',
      agentTool: 'codex', category: 'knowledge', content: 'FOREIGN_CONTENT_SENTINEL', importance: 1,
      metadata: { sources: ['FOREIGN_SOURCE_SENTINEL'] } });
    await writer.sync();
    for (const route of ['overview', 'memories', 'memories?q=FOREIGN_CONTENT_SENTINEL', 'graph', 'graph?memory=' + foreignId, 'memory-health']) {
      const response = await read(portal, route);
      expect(response.status, route).toBe(200);
      expect(await response.text(), route).not.toMatch(/FOREIGN_\w+_SENTINEL/u);
    }
    expect((await read(portal, 'memories?project=foreign-project')).status).toBe(400);
    expect((await read(portal, 'memory?id=' + foreignId + '&project=' + portal.projectId)).status).toBe(404);
    expect((await post(portal, 'context', { projectId: 'foreign-project', query: 'FOREIGN_CONTENT_SENTINEL' })).status).toBe(400);
    const local = await (await post(portal, 'context', { projectId: portal.projectId, query: 'FOREIGN_CONTENT_SENTINEL', profile: 'adaptive' })).json();
    expect(local.entries).toEqual([]);
  });

  it('does not replace a running listener and rejects cross-origin hub changes without committing work', async () => {
    const portal = await launch();
    const before = await (await read(portal, 'status')).json();
    await expect(startProjectWorkspace(portal.root, { port: Number(new URL(portal.url).port) })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    expect((await (await read(portal, 'status')).json()).serverInstanceId).toBe(before.serverInstanceId);
    const denied = await post(portal, 'hub/rooms', { goal: 'Cross-origin mutation', key: randomUUID() }, { Origin: 'https://untrusted.invalid' });
    expect(denied.status).toBe(403);
    const spoof = await post(portal, 'hub/rooms', { goal: 'Actor override', key: randomUUID(), actor: { id: 'pretend', kind: 'agent' } });
    expect(spoof.status).toBe(400);
    expect((await (await read(portal, 'hub')).json()).rooms).toEqual([]);
  });

  it('rejects a stale browser scope when the same port starts serving another project', async () => {
    const first = await launch();
    const originalProject = first.projectId;
    const port = Number(new URL(first.url).port);
    await first.close();
    const next = await launch(fixture(), port);
    expect(next.url).toBe(first.url);
    expect(next.projectId).not.toBe(originalProject);
    const headers = { 'X-Shadow-Brain-Project': originalProject };
    const rejected = await post(next, 'hub/rooms', { goal: 'Stale browser must not create this', key: randomUUID() }, headers);
    expect(rejected.status).toBe(409);
    expect(await rejected.json()).toMatchObject({ code: 'WORKSPACE_PROJECT_CHANGED' });
    const upload = await fetch(next.url + '/api/workspace/hub/documents?name=stale.pdf', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/pdf' }, body: '%PDF-synthetic-stale',
    });
    expect(upload.status).toBe(409);
    const note = await post(next, 'project-knowledge', { title: 'Stale note', content: 'Do not commit this.' }, headers);
    expect(note.status).toBe(409);
    expect(fs.existsSync(path.join(next.root, '.shadow-brain/project-hub.sqlite'))).toBe(false);
    const fresh = await post(next, 'hub/rooms', { goal: 'Fresh confirmed project scope', key: randomUUID() }, { 'X-Shadow-Brain-Project': next.projectId });
    expect(fresh.status).toBe(200);
    expect((await (await read(next, 'hub')).json()).rooms).toHaveLength(1);
    expect((await (await read(next, 'memories')).json()).items).toEqual([]);
  });
});
