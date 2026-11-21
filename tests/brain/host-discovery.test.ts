import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { discoverAgentHosts } from '../../src/brain/host-discovery.js';

let root: string;
let bin: string;
let extensions: string;
const suffix = process.platform === 'win32' ? '.cmd' : '';

beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'sb-host-discovery-')));
  bin = join(root, 'bin');
  extensions = join(root, '.vscode', 'extensions');
  fs.mkdirSync(bin);
  fs.mkdirSync(extensions, { recursive: true });
});

afterEach(() => {
  const checked = fs.realpathSync.native(root);
  if (checked !== root || dirname(checked) !== fs.realpathSync.native(tmpdir()) || !basename(checked).startsWith('sb-host-discovery-')) {
    throw new Error('Refusing to remove an unexpected host discovery fixture path.');
  }
  fs.rmSync(checked, { recursive: true, force: true });
});

function command(name: string, directory = bin, mode = 0o755) {
  fs.writeFileSync(join(directory, name + suffix), 'synthetic fixture, never execute', { mode });
}

it('returns metadata-only evidence for exact CLI names and official VS Code extension IDs', () => {
  for (const name of ['code', 'cline', 'claude', 'dsh', 'openclaw']) command(name);
  for (const name of ['saoudrizwan.claude-dev-3.2.1', 'kilocode.Kilo-Code-1.2.3', 'openai.chatgpt-2.1.0-win32-x64', 'sst-dev.opencode-v2-1.1.1']) {
    fs.mkdirSync(join(extensions, name));
  }
  const result = discoverAgentHosts({ path: bin, home: root });
  expect(result.limited).toBe(false);
  expect(result.hosts.every(host => host.status === 'detected')).toBe(true);
  expect(result.hosts.map(host => host.id)).toEqual(['vscode', 'cline', 'kilo-code', 'claude-code', 'codex', 'opencode', 'deepseek-harness', 'openclaw']);
  expect(result.hosts.find(host => host.id === 'cline')?.evidence).toEqual([
    { kind: 'path-command', value: 'cline' }, { kind: 'vscode-extension', value: 'saoudrizwan.claude-dev' },
  ]);
  expect(result.hosts.find(host => host.id === 'opencode')?.evidence).toEqual([{ kind: 'vscode-extension', value: 'sst-dev.opencode-v2' }]);
  const json = JSON.stringify(result);
  for (const sentinel of [basename(root), 'win32-x64', 'synthetic fixture']) expect(json).not.toContain(sentinel);
});

it('ignores unrelated names, invalid extension directories, private PATH sections and relative paths', () => {
  const protectedFolder = join(root, 'Chrome', 'Default');
  fs.mkdirSync(protectedFolder, { recursive: true });
  command('codex', protectedFolder);
  command('codex-extra');
  command('openclaw', bin, 0o644);
  fs.mkdirSync(join(bin, 'cline' + suffix));
  fs.mkdirSync(join(extensions, 'kilocode.Kilo-Code-unrelated'));
  fs.mkdirSync(join(extensions, 'example.openclaw-1.2.3'));
  fs.writeFileSync(join(extensions, 'openai.chatgpt-1.2.3'), 'synthetic');
  const result = discoverAgentHosts({ path: [protectedFolder, '.', 'bin', bin].join(delimiter), home: root });
  expect(result.limited).toBe(false);
  for (const host of result.hosts.filter(host => host.id !== 'openclaw' || process.platform !== 'win32')) {
    expect(host).toMatchObject({ status: 'not-detected', evidence: [] });
  }
});

it('supports safe npm-style launch links while excluding protected and linked extension trees', () => {
  const lib = join(root, 'lib');
  fs.mkdirSync(lib);
  command('launcher', lib);
  const secure = join(root, '.codex');
  fs.mkdirSync(secure);
  command('private-launcher', secure);
  const linked = join(extensions, 'saoudrizwan.claude-dev-3.2.1');
  fs.symlinkSync(secure, linked, 'junction');
  if (process.platform !== 'win32') {
    fs.symlinkSync('../lib/launcher', join(bin, 'codex'));
    fs.symlinkSync('../.codex/private-launcher', join(bin, 'openclaw'));
  }
  const result = discoverAgentHosts({ path: bin, home: root });
  expect(result.hosts.find(host => host.id === 'cline')?.evidence).toEqual([]);
  expect(result.hosts.find(host => host.id === 'openclaw')?.evidence).toEqual([]);
  if (process.platform !== 'win32') expect(result.hosts.find(host => host.id === 'codex')?.status).toBe('detected');

  const linkedHome = join(root, 'linked-home');
  fs.mkdirSync(linkedHome);
  fs.symlinkSync(join(root, '.vscode'), join(linkedHome, '.vscode'), 'junction');
  const blocked = discoverAgentHosts({ path: '', home: linkedHome });
  expect(blocked.limited).toBe(true);
  expect(blocked.hosts.find(host => host.id === 'codex')?.status).toBe('unknown');
});

it('marks missing evidence as unknown when the bounded scan is incomplete', () => {
  command('codex');
  const crowdedPath = Array.from({ length: 100 }, (_, index) => join(root, 'missing-' + index));
  const cappedPath = discoverAgentHosts({ path: [...crowdedPath, bin].join(delimiter), home: root });
  expect(cappedPath.limited).toBe(true);
  expect(cappedPath.hosts.find(host => host.id === 'codex')).toMatchObject({ status: 'unknown', evidence: [] });
  for (let index = 0; index < 513; index++) fs.mkdirSync(join(extensions, 'test.extension-' + index));
  const cappedExtensions = discoverAgentHosts({ path: bin, home: root });
  expect(cappedExtensions.limited).toBe(true);
  expect(cappedExtensions.hosts.find(host => host.id === 'codex')?.status).toBe('detected');
  expect(cappedExtensions.hosts.find(host => host.id === 'cline')?.status).toBe('unknown');
  expect(cappedExtensions.hosts.find(host => host.id === 'openclaw')?.status).toBe('not-detected');
});
