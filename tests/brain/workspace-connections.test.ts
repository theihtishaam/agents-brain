import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { WorkspaceConnections, type WorkspaceConnectionId } from '../../src/brain/workspace-connections.js';

let root: string;
let manager: WorkspaceConnections;
const projectId = 'fixture-project';
beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(tmpdir(), 'asb-connector-fixture-')));
  manager = new WorkspaceConnections(root, projectId);
});
afterEach(() => {
  const canonical = fs.realpathSync.native(root);
  if (path.dirname(canonical) !== fs.realpathSync.native(tmpdir()) || !path.basename(canonical).startsWith('asb-connector-fixture-')) {
    throw new Error('Refusing to remove an unexpected fixture path.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});
const connector = (id: WorkspaceConnectionId) => manager.read().connectors.find(row => row.id === id)!;
const configure = (id: WorkspaceConnectionId) => manager.apply({ kind: 'configure', id, expectedRevision: manager.read().revision });
const remove = (id: WorkspaceConnectionId) => manager.apply({ kind: 'remove', id, expectedRevision: manager.read().revision });

it('reports eight documented options without creating files or reading host profiles', () => {
  const { revision, automatic, connectors } = manager.read();
  expect({ revision, automatic }).toEqual({ revision: 0, automatic: false });
  expect(connectors).toHaveLength(8);
  expect(connectors.filter(row => row.status === 'manual').map(row => row.id)).toEqual(['cline', 'openclaw', 'deepseek-harness']);
  const kilo = JSON.parse(connector('kilo-code').recipe.content).mcp.shadow_brain;
  const opencode = JSON.parse(connector('opencode').recipe.content).mcp.servers.shadow_brain;
  for (const [id, config] of [['kilo-code', kilo], ['opencode', opencode]] as const) {
    expect(config.type).toBe('local');
    expect(config.command[0]).toBe(process.execPath);
    expect(config.command.slice(2)).toEqual(['mcp', root, '--stdio', '--db',
      path.join(root, '.shadow-brain', 'project-memory.json'), '--project-id', projectId, '--client-id', id]);
  }
  expect(connector('codex').recipe.content).toContain('[mcp_servers.shadow_brain]');
  expect(connector('vscode').recipe.content).toEqual(connector('claude-code').recipe.content);
  expect(connector('vscode').recipe.content).not.toContain('--client-id');
  expect(connector('deepseek-harness').recipe.content).toContain('@deepseek-ai/dsh-mcp-client');
  expect(connector('openclaw').recipe.content).toContain('"servers"');
  expect(manager.allows('mcp-client')).toBe(true);
  expect(fs.readdirSync(root)).toEqual([]);
});

it('publishes one shared configuration and removes it only after the last configured owner disconnects', () => {
  const first = configure('claude-code');
  const command = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')).mcpServers.shadow_brain;
  expect(command).toMatchObject({ type: 'stdio', command: process.execPath, tools: ['*'] });
  configure('vscode');
  expect(connector('vscode')).toMatchObject({ status: 'configured', allowed: true });
  expect(connector('claude-code')).toMatchObject({ status: 'configured', allowed: true });
  expect(() => manager.apply({ kind: 'remove', id: 'vscode', expectedRevision: first.revision })).toThrow(expect.objectContaining({ status: 409 }));
  remove('claude-code');
  expect(manager.allows('claude-code')).toBe(false);
  expect(manager.allows('vscode')).toBe(true);
  expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(true);
  remove('vscode');
  expect(fs.existsSync(path.join(root, '.mcp.json'))).toBe(false);
  expect(manager.allows('vscode')).toBe(false);
});

it('preserves unowned, modified and alternate configurations while persisting a disconnect', () => {
  const existing = path.join(root, '.mcp.json');
  const fixture = 'synthetic-current-config\n';
  fs.writeFileSync(existing, fixture);
  expect(connector('vscode').status).toBe('conflict');
  expect(() => configure('vscode')).toThrow(expect.objectContaining({ status: 409 }));
  remove('vscode');
  expect(manager.allows('vscode')).toBe(false);
  expect(fs.readFileSync(existing, 'utf8')).toBe(fixture);

  fs.mkdirSync(path.join(root, '.opencode'));
  fs.writeFileSync(path.join(root, '.opencode', 'opencode.jsonc'), fixture);
  expect(connector('opencode').status).toBe('conflict');
  expect(() => configure('opencode')).toThrow(expect.objectContaining({ status: 409 }));
  expect(fs.existsSync(path.join(root, 'opencode.json'))).toBe(false);

  configure('kilo-code');
  const claimed = path.join(root, 'kilo.json');
  fs.writeFileSync(claimed, fixture);
  expect(connector('kilo-code').status).toBe('modified');
  remove('kilo-code');
  expect(new WorkspaceConnections(root, projectId).allows('kilo-code')).toBe(false);
  expect(fs.readFileSync(claimed, 'utf8')).toBe(fixture);
});

it('preserves replacements and blocks linked config parents', () => {
  configure('kilo-code');
  const original = path.join(root, 'kilo.json');
  const moved = path.join(root, 'moved.json');
  fs.renameSync(original, moved);
  fs.copyFileSync(moved, original);
  expect(connector('kilo-code').status).toBe('modified');
  remove('kilo-code');
  expect(fs.existsSync(original)).toBe(true);

  const linked = path.join(root, 'other-workspace');
  fs.mkdirSync(linked);
  fs.symlinkSync(linked, path.join(root, '.codex'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(connector('codex').status).toBe('conflict');
  expect(() => configure('codex')).toThrow(expect.objectContaining({ status: 409 }));
  expect(fs.readdirSync(linked)).toEqual([]);
});

it('reconciles only detected supported clients after opt-in and honors existing exclusions', () => {
  manager.reconcile(['codex']);
  expect(fs.readdirSync(root)).toEqual([]);
  const optIn = manager.apply({ kind: 'set-automatic', enabled: true, expectedRevision: 0 });
  manager.apply({ kind: 'set-allowed', id: 'opencode', enabled: false, expectedRevision: optIn.revision });
  manager.reconcile(['codex', 'cline', 'opencode']);
  expect(connector('codex').status).toBe('configured');
  expect(connector('cline').status).toBe('manual');
  expect(connector('kilo-code').status).toBe('available');
  expect(connector('opencode')).toMatchObject({ status: 'available', allowed: false });
  configure('opencode');
  expect(connector('opencode')).toMatchObject({ status: 'configured', allowed: true });
  remove('codex');
  manager.reconcile(['codex']);
  expect(connector('codex')).toMatchObject({ status: 'available', allowed: false });
});

it('fails closed on corrupt or foreign internal state', () => {
  configure('opencode');
  expect(() => new WorkspaceConnections(root, 'foreign').allows('opencode')).toThrow(expect.objectContaining({ status: 503 }));
  const db = new DatabaseSync(path.join(root, '.shadow-brain', 'workspace-connections.sqlite'));
  try { db.exec("UPDATE connection_state SET state='invalid fixture'"); } finally { db.close(); }
  expect(() => manager.allows('codex')).toThrow(expect.objectContaining({ status: 503 }));
  expect(() => manager.read()).toThrow(expect.objectContaining({ status: 503 }));
});
