import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectClientIntegrations } from '../../src/brain/client-integrations.js';
import { buildClientConfig } from '../../src/brain/client-config.js';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, lstatSync: vi.fn(actual.lstatSync), readFileSync: vi.fn(actual.readFileSync) };
});

let fixture: string;
let projectDir: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'sb-client-catalog-'));
  projectDir = path.join(fixture, 'project');
  fs.mkdirSync(projectDir);
  vi.mocked(fs.readFileSync).mockClear();
  vi.mocked(fs.lstatSync).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function write(relative: string, content: string) {
  const destination = path.join(projectDir, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
  return destination;
}

function denied(filename: string): NodeJS.ErrnoException {
  return Object.assign(new Error('EACCES: denied synthetic fixture at ' + filename), { code: 'EACCES' });
}

describe('project-only client integration checks', () => {
  it('generates native recipes without reading or writing client settings', () => {
    const before = fs.readdirSync(projectDir);
    const opencode = buildClientConfig('opencode', projectDir);
    const config = JSON.parse(opencode.content);
    expect(config.mcp.servers.shadow_brain.type).toBe('local');
    expect(config.mcp.servers.shadow_brain.command).toContain(projectDir);
    expect(config.mcp.servers.shadow_brain.command.at(-1)).toBe('--stdio');
    expect(buildClientConfig('codex').content).toContain('[mcp_servers.shadow_brain]');
    expect(JSON.parse(buildClientConfig('claude-code').content).mcpServers.shadow_brain.args).toContain('mcp');
    expect(buildClientConfig('deepseek-harness').notes.join(' ')).toContain('prompt templates are unsupported');
    expect(() => buildClientConfig('unknown')).toThrow();
    expect(fs.readdirSync(projectDir)).toEqual(before);
    expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalled();
  });

  it('checks project file presence without reading skill content or inspecting profile-shaped files', () => {
    const skill = write('.dsh/skills/shadow-workflow/SKILL.md', 'Synthetic local skill content.');
    const unrelated = write('.dsh/example-settings.json', 'Synthetic unrelated configuration.');
    const result = inspectClientIntegrations({ projectDir });
    expect(result.agents.find(agent => agent.id === 'deepseek-harness')).toMatchObject({
      installation: 'partial', presentSkills: 1, totalSkills: 6, note: expect.stringContaining('plugins'),
    });
    const stats = vi.mocked(fs.lstatSync).mock.calls.map(([filename]) => filename);
    expect(stats).toContain(skill);
    expect(stats).not.toContain(unrelated);
    expect(vi.mocked(fs.readFileSync).mock.calls.every(([filename]) =>
      typeof filename !== 'string' || !filename.startsWith(projectDir + path.sep))).toBe(true);
    expect(result.diagnostics).not.toContain(projectDir);
    expect(result.diagnostics).not.toContain('Synthetic');
  });

  it('blocks linked skill ancestors and a linked project without reading their targets', () => {
    const outside = path.join(fixture, 'outside');
    const skill = path.join(outside, 'skills', 'shadow-workflow', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, 'Outside fixture.');
    fs.symlinkSync(outside, path.join(projectDir, '.claude'), 'junction');
    const projectAlias = path.join(fixture, 'project-alias');
    fs.symlinkSync(projectDir, projectAlias, 'junction');

    const scoped = inspectClientIntegrations({ projectDir });
    expect(scoped.agents.find(agent => agent.id === 'claude-code')).toMatchObject({ installation: 'blocked', presentSkills: 0 });
    expect(vi.mocked(fs.lstatSync).mock.calls.map(([filename]) => filename)).not.toContain(skill);
    expect(vi.mocked(fs.readFileSync).mock.calls.map(([filename]) => filename)).not.toContain(skill);

    const blocked = inspectClientIntegrations({ projectDir: projectAlias });
    expect(blocked.checks.find(check => check.id === 'project')).toMatchObject({ status: 'error' });
    expect(blocked.agents.every(agent => agent.installation === 'blocked')).toBe(true);
    expect(blocked.diagnostics).not.toContain(projectAlias);
  });

  it('sanitizes native filesystem errors and keeps an unavailable skill scoped to its client', async () => {
    const { lstatSync: realLstat } = await vi.importActual<typeof import('node:fs')>('node:fs');
    const projectError = vi.mocked(fs.lstatSync).mockImplementation(((filename, options) => {
      if (filename === projectDir) throw denied(projectDir);
      return realLstat(filename, options);
    }) as typeof fs.lstatSync);
    try {
      const deniedProject = inspectClientIntegrations({ projectDir });
      expect(deniedProject.checks.find(check => check.id === 'project')).toMatchObject({ status: 'error' });
      expect(deniedProject.diagnostics).not.toContain(projectDir);
      expect(JSON.stringify(deniedProject)).not.toContain('denied synthetic fixture');
    } finally {
      projectError.mockImplementation(realLstat);
    }

    const privateSkill = write('.dsh/skills/shadow-workflow/SKILL.md', 'Synthetic unreadable fixture.');
    const skillError = vi.mocked(fs.lstatSync).mockImplementation(((filename, options) => {
      if (filename === privateSkill) throw denied(privateSkill);
      return realLstat(filename, options);
    }) as typeof fs.lstatSync);
    try {
      const partial = inspectClientIntegrations({ projectDir });
      expect(partial.agents.find(agent => agent.id === 'deepseek-harness')).toMatchObject({ installation: 'blocked' });
      expect(partial.agents.find(agent => agent.id === 'codex')).toMatchObject({ installation: 'missing' });
      expect(partial.diagnostics).not.toContain(projectDir);
      expect(partial.agents.every(agent => !agent.detail.includes(projectDir))).toBe(true);
      // Configuration recipes intentionally contain the explicitly selected root.
      // Compare parsed arguments, not serialized JSON (Windows escapes slashes).
      const recipe = JSON.parse(partial.agents.find(agent => agent.id === 'claude-code')!.config.content);
      expect(recipe.mcpServers.shadow_brain.args).toContain(projectDir);
    } finally {
      skillError.mockImplementation(realLstat);
    }
  });
});
