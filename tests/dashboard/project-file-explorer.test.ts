import { createServer, type Server } from 'node:http';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectFileExplorer, PROJECT_FILE_LIMITS } from '../../src/dashboard/project-file-explorer.js';
import { ProjectFileWatch } from '../../src/dashboard/project-file-watch.js';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';
import { handleWorkspaceRequest } from '../../src/dashboard/workspace-api.js';

let fixture: string;
let root: string;
let portal: Awaited<ReturnType<typeof startProjectWorkspace>> | undefined;
let shared: Server | undefined;

beforeEach(() => {
  fixture = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'sb-file-tree-')));
  root = join(fixture, 'sample');
  fs.mkdirSync(root);
});

afterEach(async () => {
  await portal?.close();
  portal = undefined;
  if (shared) {
    shared.closeAllConnections();
    await new Promise<void>(resolve => shared!.close(() => resolve()));
    shared = undefined;
  }
  const resolved = fs.realpathSync.native(fixture);
  if (dirname(resolved) !== fs.realpathSync.native(tmpdir()) || !basename(resolved).startsWith('sb-file-tree-') || resolved !== fixture) {
    throw new Error('Refusing to remove an unexpected file explorer fixture path.');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
});

const query = (path = '', offset = 0) => new URLSearchParams({ path, offset: String(offset) });

describe('project file explorer', () => {
  it.skipIf(process.platform !== 'win32')('recognizes canonical projects when Windows reports the temporary directory through an alias', async () => {
    const runner = join(fixture, 'runneradmin');
    const physicalTemp = join(runner, 'AppData', 'Local', 'Temp');
    const project = join(physicalTemp, 'release-fixture');
    const outsideTemp = join(runner, 'AppData', 'Local', 'another-folder');
    const privateTree = join(physicalTemp, 'Chrome', 'Default');
    for (const directory of [project, outsideTemp, privateTree]) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(join(project, 'readme.txt'), 'synthetic');
    const alias = join(fixture, 'RUNNER~1');
    if (!fs.existsSync(alias)) fs.symlinkSync(runner, alias, 'junction');
    const reportedTemp = join(alias, 'AppData', 'Local', 'Temp');
    vi.stubEnv('TEMP', reportedTemp);
    vi.stubEnv('TMP', reportedTemp);
    const watcher = new ProjectFileWatch(project, () => {}, () => {});
    try {
      expect(tmpdir()).toBe(reportedTemp);
      expect(fs.realpathSync.native(reportedTemp)).toBe(physicalTemp);
      expect(new ProjectFileExplorer(project).list(query()).items.map(item => item.path)).toEqual(['readme.txt']);
      expect(() => new ProjectFileExplorer(outsideTemp).list(query())).toThrow(/protected/);
      expect(() => new ProjectFileExplorer(privateTree).list(query())).toThrow(/protected/);
      watcher.start();
      await expect.poll(() => watcher.summary().status).toBe('watching');
      expect(watcher.inventory()).toEqual([{ path: 'readme.txt', entry: 'file' }]);
      vi.stubEnv('TEMP', join(runner, 'AppData'));
      vi.stubEnv('TMP', join(runner, 'AppData'));
      expect(() => new ProjectFileExplorer(outsideTemp).list(query())).toThrow(/protected/);
    } finally { watcher.stop(); vi.unstubAllEnvs(); }
  });

  it('returns one directory and only relative path metadata, with navigable breadcrumbs', () => {
    const src = join(root, 'src');
    fs.mkdirSync(src);
    fs.mkdirSync(join(src, 'nested'));
    const file = join(src, 'Café & notes.md');
    fs.writeFileSync(file, 'SYNTHETIC CONTENT STAYS ON DISK');
    const date = new Date('2026-03-01T12:34:56.000Z');
    fs.utimesSync(file, date, date);
    fs.writeFileSync(join(src, 'nested', 'unlisted-child.txt'), 'fixture');
    const explorer = new ProjectFileExplorer(root);
    expect(explorer.list(query())).toMatchObject({ path: '', breadcrumbs: [{ name: 'Project root', path: '' }], items: [{ name: 'src', kind: 'directory', navigable: true }] });
    const listing = explorer.list(query('src'));
    expect(listing).toMatchObject({ path: 'src', breadcrumbs: [{ name: 'Project root', path: '' }, { name: 'src', path: 'src' }], items: [
      { name: 'nested', path: 'src/nested', kind: 'directory', bytes: null, navigable: true },
      { name: 'Café & notes.md', path: 'src/Café & notes.md', kind: 'file', bytes: 31, modifiedAt: date.toISOString(), navigable: false },
    ] });
    const output = JSON.stringify(listing);
    expect(output).not.toContain(fixture);
    expect(output).not.toContain('SYNTHETIC CONTENT');
    expect(output).not.toContain('unlisted-child.txt');
    expect(() => explorer.list(query('src/Café & notes.md'))).toThrow();
  });

  it('rejects protected roots and paths, traversal, DOS names and links without disclosing their metadata', () => {
    const privateDirectories = ['.git', '.shadow-brain', '.ssh', 'Chrome', 'User Data', 'Default', 'Profiles', 'Ｓｅｃｒｅｔｓ', 'node_modules'];
    const privateFiles = ['.env.test', 'Recovery Codes.txt', 'my-api-key.txt', 'access key.txt', 'file.pem', 'Login Data', 'Cookies', 'History',
      'Local State', 'Browser Session.json', 'Network Persistent State', 'logins.json', 'id_ed25519'];
    for (const name of privateDirectories) {
      fs.mkdirSync(join(root, name));
      fs.writeFileSync(join(root, name, 'protected-child.txt'), 'synthetic');
    }
    for (const name of privateFiles) fs.writeFileSync(join(root, name), 'synthetic');
    const outside = join(fixture, 'other');
    fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, 'outside.txt'), 'synthetic');
    fs.writeFileSync(join(root, 'allowed.txt'), 'synthetic');
    fs.symlinkSync(outside, join(root, 'linked-folder'), 'junction');
    fs.linkSync(join(outside, 'outside.txt'), join(root, 'linked-file.txt'));
    if (process.platform !== 'win32') fs.symlinkSync(join(outside, 'outside.txt'), join(root, 'symbolic-file.txt'));
    const explorer = new ProjectFileExplorer(root);
    expect(explorer.list(query()).items.map(item => item.name)).toEqual(['allowed.txt']);
    for (const path of [...privateDirectories, ...privateFiles, '../other', 'a/../../other', './src', '/other', 'C:/other',
      'C:\\other', '\\other', 'other//x', 'dir/.', 'dir/..', 'dir\\other', 'dir:stream', 'NUL', 'CHROME~1', 'default. ', 'linked-folder', 'linked-folder/outside.txt']) {
      expect(() => explorer.list(query(path))).toThrow(/folder is missing, protected, or unavailable/);
    }
    const profile = join(root, 'Chrome');
    expect(() => new ProjectFileExplorer(profile).list(query())).toThrow(/protected/);
    fs.renameSync(root, join(fixture, 'previous-project'));
    fs.mkdirSync(root);
    fs.writeFileSync(join(root, 'new-project.txt'), 'synthetic');
    expect(() => explorer.list(query())).toThrow(/unavailable/);
  });

  it('supports bounded pagination beyond the first 200 and reports the scan and navigation limits', () => {
    const { scanned, pageSize, depth, pathBytes } = PROJECT_FILE_LIMITS;
    for (let index = 0; index <= scanned; index++) fs.writeFileSync(join(root, 'file-' + String(index).padStart(4, '0') + '.txt'), '');
    const explorer = new ProjectFileExplorer(root);
    const first = explorer.list(query());
    const third = explorer.list(query('', pageSize * 2));
    expect(first).toMatchObject({ offset: 0, previousOffset: null, nextOffset: pageSize, total: scanned, truncated: true, scanLimit: scanned });
    expect(third).toMatchObject({ offset: pageSize * 2, previousOffset: pageSize, nextOffset: pageSize * 3 });
    expect(third.items).toHaveLength(pageSize);
    expect(third.items.some(item => first.items.some(prior => prior.path === item.path))).toBe(false);
    const last = explorer.list(query('', scanned));
    expect(last).toMatchObject({ offset: scanned - pageSize, previousOffset: scanned - pageSize * 2, nextOffset: null });
    expect(() => explorer.list(query('', scanned + 1))).toThrow(/offset/);
    expect(() => explorer.list(query('x'.repeat(pathBytes + 1)))).toThrow(/path limit/);
    const deepest = Array.from({ length: depth }, () => 'd').join('/');
    fs.mkdirSync(join(root, deepest, 'deeper'), { recursive: true });
    const nested = explorer.list(query(deepest));
    expect(nested.breadcrumbs).toHaveLength(depth + 1);
    expect(nested.items).toMatchObject([{ name: 'deeper', kind: 'directory', navigable: false }]);
    expect(() => explorer.list(query(deepest + '/deeper'))).toThrow(/path limit/);
  });

  it('serves the bounded listing only on the pinned project and accepts same-origin GET requests', async () => {
    fs.mkdirSync(join(root, 'docs'));
    fs.writeFileSync(join(root, 'docs', 'release.md'), 'fixture');
    portal = await startProjectWorkspace(root);
    const route = portal.url + '/api/workspace/files';
    const status = await (await fetch(portal.url + '/api/workspace/status')).json();
    expect(status.capabilities.projectFiles).toBe(true);
    const headers = { Origin: portal.url, 'Sec-Fetch-Site': 'same-origin', 'X-Shadow-Brain-Project': portal.projectId };
    const result = await fetch(route + '?' + query('docs'), { headers });
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    expect(await result.json()).toMatchObject({ path: 'docs', items: [{ path: 'docs/release.md', bytes: 7 }], total: 1, truncated: false });
    expect((await fetch(route, { method: 'POST' })).status).toBe(405);
    expect((await fetch(route, { headers: { Origin: 'https://other.test' } })).status).toBe(403);
    for (const site of ['cross-site', 'same-site']) expect((await fetch(route, { headers: { 'Sec-Fetch-Site': site } })).status).toBe(403);
    expect((await fetch(route, { headers: { 'X-Shadow-Brain-Project': 'other-project' } })).status).toBe(409);
    expect((await fetch(route + '?path=docs&path=docs')).status).toBe(400);
    expect((await fetch(route + '?offset=-1')).status).toBe(400);
    expect((await fetch(route + '?path=docs%2F%2E%2E')).status).toBe(404);
    expect((await fetch(route + '?path=foo%00bar')).status).toBe(404);

    shared = createServer((req, res) => { void handleWorkspaceRequest(req, res, { prepareStorage: async () => { throw new Error('Do not read storage'); } }); });
    await new Promise<void>(resolve => shared!.listen(0, '127.0.0.1', resolve));
    const port = (shared.address() as { port: number }).port;
    expect((await fetch('http://127.0.0.1:' + port + '/api/workspace/files')).status).toBe(409);
  });
});
