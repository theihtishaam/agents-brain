import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

it('rejects invalid, oversized and cross-origin source requests before storing material', async () => {
  const root = mkdtempSync(join(tmpdir(), 'source-http-'));
  const portal = await startProjectWorkspace(root);
  const url = portal.url + '/api/workspace/sources';
  try {
    const send = (body: string, headers: Record<string, string>, name = 'fixture.json') => fetch(`${url}?name=${name}`, { method: 'POST', headers, body });
    for (const response of [
      await send('{', { 'content-type': 'application/json' }),
      await send('{"apiKey":"fake"}', { 'content-type': 'application/json' }),
      await send('fixture', { 'content-type': 'text/plain', origin: 'https://outside.invalid' }, 'fixture.txt'),
      await send('x'.repeat(1024 * 1024 + 1), { 'content-type': 'text/plain' }, 'fixture.txt'),
      await send('fixture', { 'content-type': 'application/octet-stream' }, 'fixture.txt'),
      await send('fixture', { 'content-type': 'text/plain' }, encodeURIComponent('../fixture.txt')),
    ]) expect(response.status).toBeGreaterThanOrEqual(400);
    const list = await fetch(url);
    expect(list.status).toBe(200); expect((await list.json()).sources).toEqual([]);
    const valid = await send('{\"messages\":[{\"role\":\"user\",\"content\":\"Synthetic text must not appear in listing.\"}]}', { 'content-type': 'application/json' });
    expect(valid.status).toBe(200);
    const listing = await (await fetch(url)).json();
    expect(listing.sources[0]).toMatchObject({ itemCount: 1, pendingCount: 1, approvedCount: 0 });
    expect(JSON.stringify(listing)).not.toContain('Synthetic text must not appear in listing.');
  } finally { await portal.close(); rmSync(root, { recursive: true, force: true }); }
}, 30000);

it('saves ordinary notes directly with original evidence and idempotent retries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'source-note-http-'));
  const portal = await startProjectWorkspace(root);
  const base = portal.url + '/api/workspace/';
  const save = (text: string, extra: Record<string, string> = {}) => fetch(base + 'sources/remember', {
    method: 'POST', headers: { 'content-type': 'text/plain', ...extra }, body: text,
  });
  try {
    for (const response of [await save(''), await save('x'.repeat(6001)), await save('No write', { origin: 'https://outside.invalid' })]) {
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect((await (await fetch(base + 'sources')).json()).sources).toEqual([]);
    const note = 'The cupboard is black. Keep its brass handles.\n\nThe room faces north.';
    const response = await save(note);
    expect(response.status).toBe(200);
    const first = (await response.json()).source;
    expect(first.items).toHaveLength(2);
    expect(first.items.every((item: any) => item.status === 'approved')).toBe(true);
    const second = (await (await save(note)).json()).source;
    expect(second.items.map((item: any) => item.memoryId)).toEqual(first.items.map((item: any) => item.memoryId));
    const evidence = await (await fetch(base + 'memory-evidence?memoryId=' + first.items[0].memoryId)).json();
    expect(evidence).toMatchObject({ state: 'resolved', evidence: { text: 'The cupboard is black. Keep its brass handles.' } });
    const context = await (await fetch(base + 'context', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: portal.projectId, query: 'What colour is the cupboard?', profile: 'adaptive' }),
    })).json();
    expect(context.entries.some((entry: any) => entry.id === first.items[0].memoryId && entry.excerpt.includes('black'))).toBe(true);
  } finally { await portal.close(); rmSync(root, { recursive: true, force: true }); }
}, 30000);
