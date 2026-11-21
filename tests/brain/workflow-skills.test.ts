import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applySkillInstall, getBundledSkill, listBundledSkills, listWorkflowTargets, planSkillInstall,
  type WorkflowTarget,
} from '../../src/brain/workflow-skills.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, renameSync: vi.fn(actual.renameSync), linkSync: vi.fn(actual.linkSync) };
});

const CORE = '.agents/skills/shadow-workflow/SKILL.md';
const DEBUG = '.agents/skills/shadow-debug/SKILL.md';
const MANIFEST = '.shadow-brain/workflow-skills.json';
const START = '<!-- agent-shadow-brain:workflow:start -->';
const END = '<!-- agent-shadow-brain:workflow:end -->';
let fixture: string;
let projectDir: string;

beforeEach(() => {
  // Windows runners may expose an 8.3 TEMP alias; the installer returns native
  // canonical paths, so use the same filesystem spelling for assertions.
  fixture = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-workflow-')));
  projectDir = path.join(fixture, 'project');
  fs.mkdirSync(projectDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function projectFile(relative: string): string {
  return path.join(projectDir, relative);
}

function write(relative: string, contents: string | Buffer): void {
  const dest = projectFile(relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, contents);
}

function text(relative: string): string {
  return fs.readFileSync(projectFile(relative), 'utf8');
}

function preview(skills?: string[], targets: WorkflowTarget[] = ['codex']) {
  return planSkillInstall({ projectDir, targets, skills });
}

describe('project workflow skills installer', () => {
  it('lists and installs exactly the selected catalog files into all supported layouts', () => {
    const catalog = listBundledSkills();
    expect(catalog).toHaveLength(6);
    expect(new Set(catalog.map(skill => skill.name)).size).toBe(6);
    expect(catalog.every(skill => skill.description && getBundledSkill(skill.name).content.startsWith('---'))).toBe(true);
    const targets = listWorkflowTargets().map(({ target }) => target);
    expect(targets).toEqual(['codex', 'claude-code', 'opencode', 'deepseek-harness', 'portable']);

    const plan = preview(['shadow-debug'], targets);
    const paths = plan.files.map(file => file.relativePath);
    expect(paths).toEqual([
      DEBUG,
      '.claude/skills/shadow-debug/SKILL.md',
      '.opencode/skills/shadow-debug/SKILL.md',
      '.dsh/skills/shadow-debug/SKILL.md',
      'AGENTS.md', 'CLAUDE.md', MANIFEST,
    ]);
    expect(plan.warnings).toHaveLength(2);
    expect(plan.files.every(file => file.action === 'create' && file.beforeSha256 === null && !!file.afterSha256)).toBe(true);
    expect(fs.readdirSync(projectDir)).toEqual([]);

    const result = applySkillInstall(plan);
    expect(result.created).toHaveLength(7);
    expect(result.updated).toEqual([]);
    expect(result.backupDir).toBeNull();
    for (const relative of paths.slice(0, 4)) {
      expect(text(relative)).toBe(getBundledSkill('shadow-debug').content);
    }
    expect(text('AGENTS.md')).toContain('shadow-debug');
    expect(text('AGENTS.md')).not.toContain('shadow-workflow');
    expect(text('CLAUDE.md')).toContain('.claude/skills');
    expect(text('CLAUDE.md')).not.toContain('.agents/skills');
    for (const instructions of [text('AGENTS.md'), text('CLAUDE.md')]) {
      expect(instructions).toContain('start each substantive task or continuation with one `project_brief` call');
      expect(instructions).toContain('work is authorized for project sharing');
      expect(instructions).toContain('before an authorized handoff or subagent transition');
      expect(instructions).toContain('Respect project and chat sharing controls');
    }
    expect(fs.existsSync(projectFile(CORE))).toBe(false);
    expect(fs.existsSync(projectFile('.claude/settings.json'))).toBe(false);
    expect(fs.existsSync(projectFile('.dsh/config.json'))).toBe(false);
    expect(fs.readdirSync(projectFile('.shadow-brain'))).toEqual(['workflow-skills.json']);

    const unchanged = preview(['shadow-debug'], targets);
    expect(unchanged.files.every(file => file.action === 'unchanged')).toBe(true);
    const again = applySkillInstall(unchanged);
    expect(again).toMatchObject({ created: [], updated: [], backupDir: null });
    expect(again.unchanged).toHaveLength(7);
  });

  it('preserves Unicode, CRLF, and bytes outside the managed block when applying and updating', () => {
    const userPrefix = '\uFEFF# Existing project rules\r\n\r\nRésumé 🧪\r\n';
    const userSuffix = '\r\n## Later user section\r\nPreserve this whitespace.  \r\n';
    write('AGENTS.md', userPrefix);
    const initial = preview(['shadow-workflow']);
    expect(text('AGENTS.md')).toBe(userPrefix);
    expect(fs.readdirSync(projectDir)).toEqual(['AGENTS.md']);
    const installed = applySkillInstall(initial);
    expect(fs.readFileSync(path.join(installed.backupDir!, 'AGENTS.md'))).toEqual(Buffer.from(userPrefix));
    expect(text('AGENTS.md')).toMatch(/^﻿?# Existing project rules/);
    expect(text('AGENTS.md').replace(/\r\n/g, '')).not.toContain('\n');
    write('AGENTS.md', text('AGENTS.md') + userSuffix);

    const result = applySkillInstall(preview(['shadow-debug']));
    const instructions = text('AGENTS.md');
    expect(instructions.startsWith(userPrefix)).toBe(true);
    expect(instructions.endsWith(userSuffix)).toBe(true);
    expect(instructions.split(START)).toHaveLength(2);
    expect(instructions).toContain('shadow-debug');
    expect(fs.existsSync(projectFile(CORE))).toBe(true);
    expect(result.updated).toContain(projectFile('AGENTS.md'));
    expect(fs.readFileSync(path.join(result.backupDir!, 'AGENTS.md'), 'utf8').endsWith(userSuffix)).toBe(true);
  });

  it('preflights every destination and preserves a differing unowned skill', () => {
    write(DEBUG, '# User skill\n');
    const plan = preview(['shadow-workflow', 'shadow-debug']);
    expect(plan.files.find(file => file.relativePath === DEBUG)).toMatchObject({
      action: 'conflict', beforeSha256: expect.any(String), afterSha256: expect.any(String),
    });
    expect(() => applySkillInstall(plan)).toThrow(/conflicts/);
    expect(text(DEBUG)).toBe('# User skill\n');
    expect(fs.existsSync(projectFile(CORE))).toBe(false);
    expect(fs.existsSync(projectFile('AGENTS.md'))).toBe(false);
    expect(fs.existsSync(projectFile(MANIFEST))).toBe(false);
  });

  it('does not adopt an identical skill written by the user', () => {
    const bundled = getBundledSkill('shadow-debug').content;
    write(DEBUG, bundled);
    const plan = preview(['shadow-debug']);
    expect(plan.files.find(file => file.relativePath === DEBUG)?.action).toBe('unchanged');
    applySkillInstall(plan);
    expect(JSON.parse(text(MANIFEST)).skills).toEqual({});
    expect(text(DEBUG)).toBe(bundled);
  });

  it('updates an old owned skill and retains its original bytes as a backup', () => {
    applySkillInstall(preview(['shadow-debug']));
    const old = '# Synthetic older installed skill\r\n';
    write(DEBUG, old);
    const manifest = JSON.parse(text(MANIFEST));
    manifest.skills[DEBUG] = createHash('sha256').update(old).digest('hex');
    write(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

    const plan = preview(['shadow-debug']);
    expect(plan.files.find(file => file.relativePath === DEBUG)?.action).toBe('update');
    const result = applySkillInstall(plan);
    expect(text(DEBUG)).toBe(getBundledSkill('shadow-debug').content);
    expect(fs.readFileSync(path.join(result.backupDir!, DEBUG), 'utf8')).toBe(old);
    expect(preview(['shadow-debug']).files.every(file => file.action === 'unchanged')).toBe(true);
  });

  it('upgrades the owned task-start instructions and workflow skill without changing project rules', () => {
    applySkillInstall(preview(['shadow-workflow']));
    const oldText = text('AGENTS.md').split('\n').filter(line => !line.includes('`project_brief`') &&
      !line.includes('`session_open`') && !line.includes('`session_record`') && !line.includes('`session_append_turn`')).join('\n');
    const current = 'Existing project rules.\n\n' + oldText;
    write('AGENTS.md', current);
    const oldSkill = '# Older workflow skill\n';
    write(CORE, oldSkill);
    const manifest = JSON.parse(text(MANIFEST));
    manifest.blocks['AGENTS.md'] = createHash('sha256').update(oldText.trimEnd()).digest('hex');
    manifest.skills[CORE] = createHash('sha256').update(oldSkill).digest('hex');
    write(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

    const upgraded = applySkillInstall(preview(['shadow-workflow']));
    expect(upgraded.updated).toEqual(expect.arrayContaining([projectFile(CORE), projectFile('AGENTS.md')]));
    expect(text('AGENTS.md')).toMatch(/^Existing project rules\.\n\n/);
    expect(text('AGENTS.md')).toContain('`project_brief`');
    expect(text('AGENTS.md')).toContain('operator enables Exact shared conversation history');
    expect(text('AGENTS.md')).toContain('`session_append_turn`');
    expect(text(CORE)).toContain('before an authorized handoff or subagent transition');
    expect(text(CORE)).toContain('the stable `hostMessageId`');
    expect(text(CORE)).toContain('`session_transcript_read`');
    expect(fs.readFileSync(path.join(upgraded.backupDir!, 'AGENTS.md'), 'utf8')).toBe(current);
    expect(preview(['shadow-workflow']).files.every(file => file.action === 'unchanged')).toBe(true);
  });

  it('preserves a user edit to a previously managed skill or instruction block', () => {
    applySkillInstall(preview(['shadow-debug']));
    const modifiedSkill = text(DEBUG) + '\nUser notes.\n';
    const modifiedInstructions = text('AGENTS.md').replace('Handle simple tasks directly', 'User changed this block');
    write(DEBUG, modifiedSkill);
    write('AGENTS.md', modifiedInstructions);
    const plan = preview(['shadow-debug', 'shadow-workflow']);
    expect(plan.files.filter(file => file.action === 'conflict').map(file => file.relativePath))
      .toEqual([DEBUG, 'AGENTS.md']);
    expect(() => applySkillInstall(plan)).toThrow(/conflicts/);
    expect(text(DEBUG)).toBe(modifiedSkill);
    expect(text('AGENTS.md')).toBe(modifiedInstructions);
    expect(fs.existsSync(projectFile(CORE))).toBe(false);
  });

  it.each([START, END + '\n' + START, START + '\n' + END + '\n' + START + '\n' + END])(
    'refuses malformed or duplicate instruction markers without changing user bytes', markers => {
      write('AGENTS.md', 'before\r\n' + markers + '\r\nafter');
      const original = text('AGENTS.md');
      const plan = preview(['shadow-workflow']);
      expect(plan.files.find(file => file.relativePath === 'AGENTS.md')?.action).toBe('conflict');
      expect(() => applySkillInstall(plan)).toThrow(/conflicts/);
      expect(text('AGENTS.md')).toBe(original);
      expect(fs.existsSync(projectFile(CORE))).toBe(false);
    },
  );

  it('rejects stale previews and tampered destinations or contents before creating new files', () => {
    const initial = preview(['shadow-debug']);
    const outside = path.join(fixture, 'outside.md');
    const modifiedPath = structuredClone(initial);
    modifiedPath.files[0].path = outside;
    expect(() => applySkillInstall(modifiedPath)).toThrow(/stale or modified/);
    const modifiedContent = structuredClone(initial);
    modifiedContent.files[0].content = 'Different content';
    expect(() => applySkillInstall(modifiedContent)).toThrow(/stale or modified/);
    expect(fs.existsSync(outside)).toBe(false);
    expect(fs.readdirSync(projectDir)).toEqual([]);

    write('AGENTS.md', 'User wrote this after preview.\n');
    expect(() => applySkillInstall(initial)).toThrow(/stale or modified/);
    expect(text('AGENTS.md')).toBe('User wrote this after preview.\n');
    expect(fs.existsSync(projectFile(DEBUG))).toBe(false);
  });

  it('rejects unknown/traversal selectors, link ancestors, and link files', () => {
    expect(() => preview(['../../outside'])).toThrow(/Unknown/);
    expect(() => preview(['shadow-debug'], ['../../outside' as WorkflowTarget])).toThrow(/Unknown/);
    expect(() => preview(['shadow-debug'], ['constructor' as WorkflowTarget])).toThrow(/Unknown/);
    expect(() => planSkillInstall({ projectDir: os.homedir(), targets: ['codex'] })).toThrow(/outside global/);

    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(outside);
    const alias = path.join(fixture, 'project-alias');
    fs.symlinkSync(projectDir, alias, 'junction');
    expect(() => planSkillInstall({ projectDir: alias, targets: ['codex'] })).toThrow(/symbolic-link/);

    fs.symlinkSync(outside, projectFile('.agents'), 'junction');
    const linked = preview(['shadow-debug']);
    expect(linked.files.find(file => file.relativePath === DEBUG)).toMatchObject({ action: 'conflict' });
    expect(() => applySkillInstall(linked)).toThrow(/conflicts/);
    expect(fs.readdirSync(outside)).toEqual([]);

    const original = path.join(outside, 'user-note.md');
    fs.writeFileSync(original, 'Outside project file.');
    fs.linkSync(original, projectFile('AGENTS.md'));
    expect(preview(['shadow-debug'], ['opencode']).files.find(file => file.relativePath === 'AGENTS.md'))
      .toMatchObject({ action: 'conflict' });
    expect(fs.readFileSync(original, 'utf8')).toBe('Outside project file.');
  });

  it('refuses an invalid ownership receipt without starting a partial installation', () => {
    write(MANIFEST, '{"schemaVersion":9}');
    const plan = preview(['shadow-debug']);
    expect(plan.files.find(file => file.relativePath === MANIFEST)).toMatchObject({ action: 'conflict' });
    expect(() => applySkillInstall(plan)).toThrow(/conflicts/);
    expect(text(MANIFEST)).toBe('{"schemaVersion":9}');
    expect(fs.existsSync(projectFile(DEBUG))).toBe(false);
  });

  it('uses exclusive creation and leaves a file that appeared just before installation', () => {
    const initial = preview(['shadow-debug']);
    const link = fs.linkSync;
    vi.mocked(link).mockImplementationOnce((temporary, destination) => {
      fs.writeFileSync(destination, 'A new file from the user.');
      throw Object.assign(new Error('destination now exists'), { code: 'EEXIST' });
    });
    expect(() => applySkillInstall(initial)).toThrow(/destination now exists/);
    expect(text(DEBUG)).toBe('A new file from the user.');
    expect(fs.existsSync(projectFile('AGENTS.md'))).toBe(false);
    expect(fs.existsSync(projectFile(MANIFEST))).toBe(false);
  });

  it.each([false, true])('rolls back a failed install without discarding newer user edits (%s)', async keepNewEdit => {
    applySkillInstall(preview(['shadow-workflow']));
    const oldAgents = text('AGENTS.md');
    const oldManifest = text(MANIFEST);
    const initial = preview(['shadow-debug']);
    const { renameSync: realRename } = await vi.importActual<typeof import('node:fs')>('node:fs');
    vi.mocked(fs.renameSync).mockImplementationOnce(realRename).mockImplementationOnce(() => {
      if (keepNewEdit) fs.appendFileSync(projectFile('AGENTS.md'), '\nUser edited during install.');
      throw Object.assign(new Error('simulated rename failure'), { code: 'EPERM' });
    });
    expect(() => applySkillInstall(initial)).toThrow(keepNewEdit ? /AGENTS\.md \(changed after installation\)/ : /simulated rename failure/);
    expect(text(MANIFEST)).toBe(oldManifest);
    expect(fs.existsSync(projectFile(DEBUG))).toBe(false);
    expect(text('AGENTS.md')).toBe(keepNewEdit ? initial.files.find(file => file.relativePath === 'AGENTS.md')?.content +
      '\nUser edited during install.' : oldAgents);
    expect(fs.existsSync(projectFile('.shadow-brain/workflow-skills.lock'))).toBe(false);
    expect(fs.readdirSync(projectDir).some(name => name.endsWith('.tmp'))).toBe(false);
  });
});
