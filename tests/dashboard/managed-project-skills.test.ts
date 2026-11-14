import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { listManagedProjectSkills, previewManagedProjectSkill, applyManagedProjectSkill } from '../../src/brain/managed-project-skills.js';
import { applyProjectSkill, planProjectSkill, PROJECT_SKILL_RECEIPT_DIR } from '../../src/brain/project-kit.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

let root: string;
const hash = (input: Buffer | string) => createHash('sha256').update(input).digest('hex');
const params = { requirement: 'Check generated skill lifecycle.', name: 'fixture-skill', target: 'codex' } as const;
const relativePath = '.agents/skills/fixture-skill/SKILL.md';
const id = hash(relativePath);
const disabledPath = '.shadow-brain/disabled-project-skills/' + id + '.md';
const receiptPath = PROJECT_SKILL_RECEIPT_DIR + '/' + id + '.json';
const operationPath = PROJECT_SKILL_RECEIPT_DIR + '/' + id + '.lifecycle.json';
const full = (file: string) => path.join(root, file);

beforeEach(() => { root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-managed-skill-'))); });
afterEach(() => {
  if (path.dirname(root) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(root).startsWith('sb-managed-skill-')) throw new Error('Unexpected fixture path.');
  fs.rmSync(root, { recursive: true, force: true });
});

async function generate() {
  const preview = planProjectSkill(root, params);
  await applyProjectSkill(root, params, preview.planHash);
  return fs.readFileSync(full(relativePath));
}

function perform(action: 'disable' | 'enable' | 'remove') {
  const preview = previewManagedProjectSkill(root, { id, action });
  expect(preview.conflicts).toEqual([]);
  return applyManagedProjectSkill(root, { id, action, planHash: preview.planHash });
}

it('inventories receipts without creating files and preserves exact bytes, sibling support, and unowned skills throughout', async () => {
  expect(listManagedProjectSkills(root)).toMatchObject({ skills: [], invalidReceipts: 0 });
  expect(fs.readdirSync(root)).toEqual([]);
  const bytes = await generate();
  const other = full('.agents/skills/unowned/SKILL.md'), sibling = full('.agents/skills/fixture-skill/support.md');
  fs.mkdirSync(path.dirname(other));
  fs.writeFileSync(other, 'Unowned skill');
  fs.writeFileSync(sibling, 'Supporting documentation');
  const receiptBytes = fs.readFileSync(full(receiptPath));
  expect(listManagedProjectSkills(root).skills).toEqual([expect.objectContaining({ id, name: params.name,
    targets: ['codex', 'portable'], state: 'enabled', ownershipVerified: true, sha256: hash(bytes) })]);
  expect(perform('disable')).toMatchObject({ finalState: 'disabled', changedPaths: [relativePath, disabledPath], preservedPaths: [receiptPath] });
  expect(fs.existsSync(full(relativePath))).toBe(false);
  expect(fs.readFileSync(full(disabledPath))).toEqual(bytes);
  expect(listManagedProjectSkills(root).skills[0]).toMatchObject({ state: 'disabled', ownershipVerified: true });
  expect(fs.readFileSync(full(receiptPath))).toEqual(receiptBytes);
  expect(perform('enable').finalState).toBe('enabled');
  expect(fs.readFileSync(full(relativePath))).toEqual(bytes);
  expect(fs.existsSync(full(disabledPath))).toBe(false);
  expect(perform('remove').finalState).toBe('removed');
  expect(listManagedProjectSkills(root).skills).toEqual([]);
  expect(fs.existsSync(full(relativePath))).toBe(false);
  expect(fs.existsSync(full(receiptPath))).toBe(false);
  expect(fs.readFileSync(sibling, 'utf8')).toBe('Supporting documentation');
  expect(fs.readFileSync(other, 'utf8')).toBe('Unowned skill');
  expect(await generate()).toEqual(bytes);
  perform('disable');
  expect(perform('remove').finalState).toBe('removed');
  expect(fs.existsSync(full(disabledPath))).toBe(false);
});

it('rejects a stale preview, edited buffers, destination collisions and a shared lock without changing user bytes', async () => {
  const bytes = await generate();
  const preview = previewManagedProjectSkill(root, { id, action: 'disable' });
  fs.writeFileSync(full(relativePath), 'User edited file');
  expect(() => applyManagedProjectSkill(root, { id, action: 'disable', planHash: preview.planHash })).toThrow(/changed|differ/u);
  expect(listManagedProjectSkills(root).skills[0]).toMatchObject({ state: 'edited', ownershipVerified: false });
  expect(fs.readFileSync(full(relativePath), 'utf8')).toBe('User edited file');
  fs.writeFileSync(full(relativePath), bytes);
  const lock = full(PROJECT_SKILL_RECEIPT_DIR + '/write.lock');
  fs.writeFileSync(lock, 'concurrent writer');
  expect(() => applyManagedProjectSkill(root, { id, action: 'disable', planHash: preview.planHash })).toThrow(/in progress/u);
  expect(fs.readFileSync(lock, 'utf8')).toBe('concurrent writer');
  fs.unlinkSync(lock);
  perform('disable');
  fs.writeFileSync(full(relativePath), 'Intervening unmanaged file');
  const enable = previewManagedProjectSkill(root, { id, action: 'enable' });
  expect(enable.conflicts).toHaveLength(1);
  expect(() => applyManagedProjectSkill(root, { id, action: 'enable', planHash: enable.planHash })).toThrow(/both exist/u);
  expect(fs.readFileSync(full(relativePath), 'utf8')).toBe('Intervening unmanaged file');
  expect(fs.readFileSync(full(disabledPath))).toEqual(bytes);
});

it('rejects unsafe paths and invalid or forged project receipts before reading unowned destinations', async () => {
  const bytes = await generate();
  const owned = JSON.parse(fs.readFileSync(full(receiptPath), 'utf8'));
  const target = full('non-skill.md');
  fs.writeFileSync(target, 'Unowned evidence');
  const forgedPath = 'non-skill.md';
  const forgedId = hash(forgedPath);
  fs.writeFileSync(full(`${PROJECT_SKILL_RECEIPT_DIR}/${forgedId}.json`), JSON.stringify({ ...owned, relativePath: forgedPath, sha256: hash('Unowned evidence') }));
  expect(() => previewManagedProjectSkill(root, { id: forgedId, action: 'remove' })).toThrow(/supported Project Kit/u);
  fs.writeFileSync(full(receiptPath), JSON.stringify({ ...owned, projectId: 'other-project' }));
  expect(listManagedProjectSkills(root)).toMatchObject({ skills: [], invalidReceipts: 2 });
  fs.writeFileSync(full(receiptPath), JSON.stringify(owned));
  fs.unlinkSync(full(relativePath));
  const linkTarget = full('outside-discovery.md');
  fs.writeFileSync(linkTarget, bytes);
  fs.linkSync(linkTarget, full(relativePath));
  expect(previewManagedProjectSkill(root, { id, action: 'remove' }).conflicts).toHaveLength(1);
  expect(fs.readFileSync(linkTarget)).toEqual(bytes);
  expect(fs.readFileSync(target, 'utf8')).toBe('Unowned evidence');
});

it('recovers interrupted verified moves and removal using the ownership-bound operation journal', async () => {
  const bytes = await generate();
  const receiptHash = hash(fs.readFileSync(full(receiptPath)));
  fs.mkdirSync(path.dirname(full(disabledPath)));
  fs.writeFileSync(full(disabledPath), bytes);
  fs.writeFileSync(full(operationPath), JSON.stringify({ action: 'disable', sha256: receiptHash }));
  const lock = full(PROJECT_SKILL_RECEIPT_DIR + '/write.lock');
  fs.writeFileSync(lock, JSON.stringify({ kind: 'project-kit-lock', pid: 0x7fffffff }));
  expect(listManagedProjectSkills(root).skills[0]).toMatchObject({ pendingAction: 'disable', state: 'conflict' });
  expect(planProjectSkill(root, params).files[0].status).toBe('conflict');
  expect(perform('disable').finalState).toBe('disabled');
  expect(fs.existsSync(lock)).toBe(false);
  expect(fs.existsSync(full(relativePath))).toBe(false);
  expect(fs.readFileSync(full(disabledPath))).toEqual(bytes);
  fs.writeFileSync(full(operationPath), JSON.stringify({ action: 'remove', sha256: receiptHash }));
  fs.unlinkSync(full(disabledPath));
  expect(listManagedProjectSkills(root).skills[0]).toMatchObject({ pendingAction: 'remove', state: 'missing' });
  expect(perform('remove').finalState).toBe('removed');
  expect(fs.existsSync(full(operationPath))).toBe(false);
});

it('requires an origin-safe current plan over the real portal and persists a disabled skill across restart', async () => {
  let portal = await startProjectWorkspace(root);
  const request = (suffix = '', input?: object, headers: Record<string, string> = {}) =>
    fetch(portal.url + '/api/workspace/managed-skills' + suffix, input ? { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(input) } : undefined);
  try {
    const original = await generate();
    expect((await request('/preview', { id, action: 'disable' }, { origin: 'https://foreign.invalid' })).status).toBe(403);
    const preview = await (await request('/preview', { id, action: 'disable' })).json();
    expect(preview).toMatchObject({ expectedHashes: { installed: hash(original) }, conflicts: [] });
    const change = await request('/apply', { id, action: 'disable', planHash: preview.planHash });
    expect(change.status).toBe(200);
    await portal.close();
    portal = await startProjectWorkspace(root);
    expect(await (await request()).json()).toMatchObject({ skills: [{ state: 'disabled' }] });
    expect((await request('/apply', { id, action: 'disable', planHash: preview.planHash })).status).toBe(409);
    const restore = await (await request('/preview', { id, action: 'enable' })).json();
    expect((await request('/apply', { id, action: 'enable', planHash: restore.planHash })).status).toBe(200);
    expect(fs.readFileSync(full(relativePath))).toEqual(original);
  } finally { await portal.close(); }
});
