import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { WorkspaceDirectory, WORKSPACE_DIRECTORY_LIMITS } from '../../src/brain/workspace-directory.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';

let root: string;
let home: string;
let project: string;
let projectB: string;

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'sb-workspace-directory-')));
  home = join(root, 'metadata');
  project = join(root, 'Atlas Release');
  projectB = join(root, 'Cinder Build');
  fs.mkdirSync(project);
  fs.mkdirSync(projectB);
  vi.stubEnv('SHADOW_BRAIN_DIRECTORY_HOME', home);
});

afterEach(() => {
  vi.unstubAllEnvs();
  const canonical = fs.realpathSync.native(root);
  if (canonical !== root || dirname(canonical) !== fs.realpathSync.native(tmpdir()) || !basename(canonical).startsWith('sb-workspace-directory-')) {
    throw new Error('Refusing to remove an unexpected workspace directory fixture.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});

it('uses an explicit per-user metadata index with read-only lookup and metadata-only manual Add', async () => {
  const index = new WorkspaceDirectory();
  expect(index.list()).toMatchObject({ revision: 0, projects: [], forgotten: [] });
  expect(fs.existsSync(home)).toBe(false);
  expect(fs.readdirSync(project)).toEqual([]);
  const created = await index.register(project, 'operator', { expectedRevision: 0, projectName: 'Atlas QA' });
  expect(created).toMatchObject({ revision: 1, projects: [
    { projectId: GlobalBrain.projectIdFor(project), projectName: 'Atlas QA', root: project, lastSource: 'operator' },
  ] });
  expect(fs.readdirSync(project)).toEqual([]);
  expect(fs.readdirSync(home)).toEqual(['workspace-directory.json']);
  expect(new WorkspaceDirectory().list()).toEqual(created);
  const updated = await new WorkspaceDirectory().register(project, 'mcp');
  expect(updated.projects).toMatchObject([{ projectName: 'Atlas QA', lastSource: 'mcp' }]);
});

it('durably forgets the path and title and honors explicit reenable in one revisioned registration', async () => {
  const index = new WorkspaceDirectory();
  const first = await index.register(project, 'portal');
  const id = first.projects[0].projectId;
  const forgotten = await index.forget(id, first.revision);
  expect(forgotten).toMatchObject({ revision: first.revision + 1, projects: [], forgotten: [{ projectId: id }] });
  const raw = fs.readFileSync(join(home, 'workspace-directory.json'), 'utf8');
  expect(raw).not.toContain(basename(project));
  expect(await new WorkspaceDirectory().register(project, 'portal')).toEqual(forgotten);
  expect(await new WorkspaceDirectory().register(project, 'mcp')).toEqual(forgotten);
  expect(await new WorkspaceDirectory().register(project, 'operator')).toEqual(forgotten);
  await expect(index.register(project, 'operator', { reenable: true, expectedRevision: first.revision })).rejects.toMatchObject({ status: 409 });
  const reenabled = await new WorkspaceDirectory().register(project, 'operator', { reenable: true, expectedRevision: forgotten.revision });
  expect(reenabled).toMatchObject({ projects: [{ projectId: id, root: project }], forgotten: [] });
  const reforgotten = await index.forget(id, reenabled.revision);
  expect(await index.reenable(id, reforgotten.revision)).toMatchObject({ projects: [], forgotten: [] });
  expect((await index.register(project, 'portal')).projects).toMatchObject([{ projectId: id }]);
});

it('rejects protected project trees, secret-shaped names and linked stores without altering the targets', async () => {
  const privateRoot = join(root, 'Chrome', 'Default');
  fs.mkdirSync(privateRoot, { recursive: true });
  const index = new WorkspaceDirectory();
  await expect(index.register(privateRoot, 'operator')).rejects.toMatchObject({ status: 400 });
  await expect(index.register(project, 'operator', { projectName: 'ghp_syntheticFictionalNeverARealToken' })).rejects.toMatchObject({ status: 400 });
  const alias = join(root, 'alias');
  fs.symlinkSync(project, alias, 'junction');
  await expect(index.register(alias, 'operator')).rejects.toMatchObject({ status: 400 });
  const linkedHome = join(root, 'linked-metadata');
  fs.symlinkSync(project, linkedHome, 'junction');
  expect(() => new WorkspaceDirectory({ directory: linkedHome }).list()).toThrow(/could not be read/);
  await expect(new WorkspaceDirectory({ directory: linkedHome }).register(projectB, 'mcp')).rejects.toMatchObject({ status: 503 });
  expect(fs.readdirSync(project)).toEqual([]);
  fs.mkdirSync(home);
  const target = join(root, 'unchanged-test-file.txt');
  fs.writeFileSync(target, 'synthetic sentinel');
  fs.linkSync(target, join(home, 'workspace-directory.json'));
  expect(() => index.list()).toThrow(/could not be read/);
  await expect(index.register(project, 'portal')).rejects.toMatchObject({ status: 503 });
  expect(fs.readFileSync(target, 'utf8')).toBe('synthetic sentinel');
});

it('keeps the latest bounded project rows without pruning forgotten preferences', async () => {
  const index = new WorkspaceDirectory();
  fs.mkdirSync(home);
  const date = '2026-01-02T00:00:00.000Z';
  const prior = Array.from({ length: WORKSPACE_DIRECTORY_LIMITS.projects }, (_, number) => {
    const folder = join(root, 'prior-' + number);
    return { projectId: GlobalBrain.projectIdFor(folder), projectName: basename(folder), root: folder, lastOpenedAt: date, lastSource: 'portal' };
  });
  const forgotten = [{ projectId: '0011223344556677', forgottenAt: date }];
  fs.writeFileSync(join(home, 'workspace-directory.json'), JSON.stringify({ schemaVersion: 1, revision: 3, projects: prior, forgotten }));
  const next = await index.register(project, 'operator');
  expect(next.projects).toHaveLength(WORKSPACE_DIRECTORY_LIMITS.projects);
  expect(next.projects[0].root).toBe(project);
  expect(next.projects.some(item => item.projectId === prior.at(-1)!.projectId)).toBe(false);
  expect(next.forgotten).toEqual(forgotten);
});

it('registers real portal and initialized project stdio opens in a shared index without merging stores', async () => {
  const portal = await startProjectWorkspace(project);
  try {
    const memory = projectStorage(projectB);
    const input = [
      { jsonrpc: '2.0', method: 'initialize', id: 1, params: { protocolVersion: '2025-11-25', clientInfo: { name: 'codex', version: '1' }, capabilities: {} } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', method: 'tools/list', id: 2 },
    ].map(message => JSON.stringify(message)).join('\n') + '\n';
    const child = spawnSync(process.execPath, [resolve('dist/cli.js'), 'mcp', projectB, '--stdio', '--db', memory.storagePath], {
      cwd: projectB, encoding: 'utf8', input, windowsHide: true, timeout: 15000,
    });
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout.trim().split(/\r?\n/u).map(line => JSON.parse(line).id)).toEqual([1, 2]);
    const directory = new WorkspaceDirectory();
    expect(directory.list().projects).toMatchObject([{ root: projectB, lastSource: 'mcp' }, { root: project, lastSource: 'portal' }]);
    expect(portal.storagePath).not.toBe(memory.storagePath);
    await directory.forget(portal.projectId);
  } finally { await portal.close(); }
  const reopened = await startProjectWorkspace(project);
  try { expect(new WorkspaceDirectory().list().projects.map(item => item.root)).toEqual([projectB]); }
  finally { await reopened.close(); }
}, 20_000);

it('preserves both independent registrations when processes contend for the index', async () => {
  const moduleUrl = pathToFileURL(resolve('dist/brain/workspace-directory.js')).href;
  const script = `import { WorkspaceDirectory } from ${JSON.stringify(moduleUrl)};
    await new WorkspaceDirectory().register(process.argv[1], 'operator');`;
  await Promise.all([project, projectB].map(folder => new Promise<void>((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, folder], { windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', text => { stderr += text; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolvePromise() : reject(new Error(stderr || 'Fixture process exited ' + code)));
  })));
  expect(new WorkspaceDirectory().list()).toMatchObject({ revision: 2, projects: expect.arrayContaining([{ projectId: GlobalBrain.projectIdFor(project),
    projectName: basename(project), root: project, lastSource: 'operator', lastOpenedAt: expect.any(String) }, { projectId: GlobalBrain.projectIdFor(projectB),
    projectName: basename(projectB), root: projectB, lastSource: 'operator', lastOpenedAt: expect.any(String) }]) });
}, 20_000);
