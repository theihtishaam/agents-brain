import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, it } from 'vitest';
import { startDemoWorkspace } from '../../src/dashboard/demo-workspace.js';

it('serves an isolated marked demo with real protocol telemetry, scoped context, gates, and complete teardown', async () => {
  const demo = await startDemoWorkspace({ activity: false });
  try {
    expect(path.basename(demo.directory)).toMatch(/^shadow-brain-demo-/);
    const workspace = await (await fetch(demo.url + '/workspace')).text();
    const live = await (await fetch(demo.url + '/live')).text();
    expect(workspace).toContain('data-demo="true"');
    expect(live).toContain('data-demo="true"');
    const overview = await (await fetch(demo.url + '/api/workspace/overview')).json();
    expect(overview).toMatchObject({ version: '7.21.0', demo: true, totals: { memories: 20, projects: 2 } });
    const telemetry = await (await fetch(demo.url + '/api/workspace/telemetry')).json();
    expect(telemetry.demo).toBe(true);
    expect(telemetry.events.some((event: any) => event.kind === 'tool-end' && event.source === 'measured' && event.tool === 'context_pack')).toBe(true);
    expect(telemetry.events.some((event: any) => event.source === 'reported' && event.agent.startsWith('demo-worker-'))).toBe(true);
    const result = await (await fetch(demo.url + '/api/workspace/context', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'demo-checkout', query: 'retry', profile: 'adaptive' }) })).json();
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.every((entry: any) => entry.projectId === 'demo-checkout')).toBe(true);
    expect(result.excluded.some((entry: any) => entry.reason === 'contested')).toBe(true);
    const integrations = await (await fetch(demo.url + '/api/workspace/integrations')).json();
    expect(integrations.agents.every((agent: any) => agent.installation === 'not-checked')).toBe(true);
    expect((await fetch(demo.url + '/api/workspace/features', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://example.invalid' }, body: JSON.stringify({ patch: { contextAssembly: false } }) })).status).toBe(400);
    expect((await fetch(demo.url + '/missing')).status).toBe(404);
    const flags = await (await fetch(demo.url + '/api/workspace/features')).json();
    const changed = await fetch(demo.url + '/api/workspace/features', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch: { contextAssembly: false }, expectedRevision: flags.revision }) });
    expect(changed.status).toBe(200);
    expect((await changed.json()).features.contextAssembly).toBe(false);
    const files = fs.readdirSync(demo.directory);
    expect(files).toEqual(expect.arrayContaining(['global.json', 'feature-settings.json', 'activity-journal.json', 'memory-annotations.json']));
    expect(files).not.toContain('config.json');
  } finally { await demo.close(); }
  await demo.close();
  expect(fs.existsSync(demo.directory)).toBe(false);
  await expect(fetch(demo.url)).rejects.toThrow();
});

it('rejects an invalid port before creating a demo or opening a store', async () => {
  await expect(startDemoWorkspace({ port: -1 })).rejects.toThrow(/port/);
  await expect(startDemoWorkspace({ port: NaN })).rejects.toThrow(/port/);
});
