import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

it('keeps native Codex disconnected on reads and rejects cross-origin connection attempts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-route-'));
  const portal = await startProjectWorkspace(root);
  try {
    const url = portal.url + '/api/workspace/sessions/codex/';
    const initial = await fetch(url + 'status');
    expect(initial.status).toBe(200); expect((await initial.json()).connected).toBe(false);
    expect((await fetch(url + 'threads')).status).toBeGreaterThanOrEqual(400);
    expect((await fetch(url + 'status', { headers: { origin: 'https://other.invalid' } })).status).toBe(403);
    const denied = await fetch(url + 'connect', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.invalid' }, body: '{}' });
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect((await (await fetch(url + 'status')).json()).connected).toBe(false);
  } finally { await portal.close(); rmSync(root, { recursive: true, force: true }); }
});
