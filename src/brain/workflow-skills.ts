import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { matchesFileIdentity } from './file-identity.js';

const SKILL_NAMES = [
  'shadow-workflow', 'shadow-implement', 'shadow-debug', 'shadow-review', 'shadow-research', 'shadow-release',
] as const;
const BUNDLE_ROOT = fileURLToPath(new URL('../../skills/', import.meta.url));
const MANIFEST_PATH = '.shadow-brain/workflow-skills.json';
const LOCK_PATH = '.shadow-brain/workflow-skills.lock';
const BACKUP_ROOT = '.shadow-brain/workflow-backups';
const MANAGED_BY = 'agent-shadow-brain';
const BLOCK_PREFIX = '<!-- agent-shadow-brain:workflow:';
const BLOCK_START = BLOCK_PREFIX + 'start -->';
const BLOCK_END = BLOCK_PREFIX + 'end -->';

export const WORKFLOW_TARGETS = Object.freeze({
  codex: Object.freeze({ skillRoot: '.agents/skills', instructionFile: 'AGENTS.md' }),
  'claude-code': Object.freeze({ skillRoot: '.claude/skills', instructionFile: 'CLAUDE.md' }),
  opencode: Object.freeze({ skillRoot: '.opencode/skills', instructionFile: 'AGENTS.md' }),
  'deepseek-harness': Object.freeze({ skillRoot: '.dsh/skills', instructionFile: 'AGENTS.md' }),
  portable: Object.freeze({ skillRoot: '.agents/skills', instructionFile: 'AGENTS.md' }),
} as const);

export type WorkflowTarget = keyof typeof WORKFLOW_TARGETS;

export interface BundledWorkflowSkill {
  name: string;
  description: string;
}

export interface SkillInstallOptions {
  projectDir: string;
  targets: WorkflowTarget[];
  skills?: string[];
}

export interface SkillInstallFile {
  path: string;
  relativePath: string;
  kind: 'skill' | 'instructions' | 'manifest';
  action: 'create' | 'update' | 'unchanged' | 'conflict';
  beforeSha256: string | null;
  afterSha256: string | null;
  content: string;
  reason?: string;
}

export interface SkillInstallPlan {
  projectDir: string;
  targets: WorkflowTarget[];
  skills: string[];
  files: SkillInstallFile[];
  warnings: string[];
}

export interface SkillInstallResult {
  projectDir: string;
  created: string[];
  updated: string[];
  unchanged: string[];
  backupDir: string | null;
}

interface FileState {
  bytes: Buffer;
  sha256: string;
  mode: number;
}

interface Manifest {
  schemaVersion: 1;
  managedBy: 'agent-shadow-brain';
  skills: Record<string, string>;
  blocks: Record<string, string>;
}

interface PreparedFile {
  file: SkillInstallFile;
  before: FileState | null;
  temporary: string;
}

class UnsafePathError extends Error {}

export function listWorkflowTargets() {
  return (Object.keys(WORKFLOW_TARGETS) as WorkflowTarget[]).map(target => ({ target, ...WORKFLOW_TARGETS[target] }));
}

export function getBundledSkill(name: string): BundledWorkflowSkill & { content: string } {
  if (!SKILL_NAMES.some(skill => skill === name)) throw new TypeError('Unknown bundled workflow skill.');
  const content = fs.readFileSync(path.join(BUNDLE_ROOT, name, 'SKILL.md'), 'utf8');
  const metadata = /^---\r?\nname:\s*([a-z0-9-]+)\r?\ndescription:[ \t]*(.+?)\r?\n---\r?\n/.exec(content);
  if (!metadata || metadata[1] !== name || !metadata[2].trim()) {
    throw new Error('Bundled workflow skill has invalid frontmatter: ' + name);
  }
  return { name, description: metadata[2].trim(), content };
}

export function listBundledSkills(): BundledWorkflowSkill[] {
  return SKILL_NAMES.map(name => {
    const { description } = getBundledSkill(name);
    return { name, description };
  });
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return !!relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function canonicalRoot(projectDir: string): string {
  if (typeof projectDir !== 'string' || !projectDir.trim()) throw new TypeError('An existing project directory is required.');
  const resolved = path.resolve(projectDir);
  const root = path.parse(resolved).root;
  const home = path.resolve(os.homedir());
  const homeRelative = path.relative(home, resolved);
  const firstHomeSegment = homeRelative.split(path.sep)[0].toLowerCase();
  const globalDirs = new Set(['.agents', '.claude', '.codex', '.config', '.dsh', '.opencode', '.shadow-brain', '.ssh']);
  if (resolved === root || !homeRelative || (isInside(home, resolved) && globalDirs.has(firstHomeSegment))) {
    throw new UnsafePathError('Select a project directory outside global agent and home configuration roots.');
  }

  let current = root;
  const segments = resolved.slice(root.length).split(path.sep);
  for (const part of segments) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new UnsafePathError('Project directory must exist without symbolic-link ancestors.');
    }
  }
  return fs.realpathSync.native(resolved);
}

function destination(root: string, relative: string): string {
  const absolute = path.resolve(root, relative);
  if (!isInside(root, absolute)) throw new UnsafePathError('Workflow skill destination escapes the selected project.');
  return absolute;
}

function inspectParent(root: string, relative: string, created?: string[]): boolean {
  const directory = path.dirname(destination(root, relative));
  let current = root;
  const fromRoot = path.relative(root, directory);
  if (!fromRoot) return true;
  for (const part of fromRoot.split(path.sep)) {
    current = path.join(current, part);
    let stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && created) {
      try {
        fs.mkdirSync(current);
        created.push(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      stat = fs.lstatSync(current, { throwIfNoEntry: false });
    }
    if (!stat) return false;
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new UnsafePathError('A destination ancestor is a symbolic link or is not a directory.');
    }
  }
  return true;
}

function readState(root: string, relative: string): FileState | null {
  if (!inspectParent(root, relative)) return null;
  const filename = destination(root, relative);
  const stat = fs.lstatSync(filename, { throwIfNoEntry: false, bigint: true });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) {
    throw new UnsafePathError('Destination must be a regular file with one filesystem link.');
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const actual = fs.fstatSync(fd, { bigint: true });
    if (!matchesFileIdentity(filename, actual, stat)) {
      throw new UnsafePathError('Destination changed while it was being inspected.');
    }
    const bytes = fs.readFileSync(fd);
    return { bytes, sha256: sha256(bytes), mode: Number(actual.mode) & 0o777 };
  } finally {
    fs.closeSync(fd);
  }
}

function decodeUtf8(state: FileState | null): string {
  const bytes = state?.bytes ?? Buffer.alloc(0);
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new UnsafePathError('Existing file is not valid UTF-8.');
  return text;
}

function readManifest(state: FileState | null): Manifest {
  if (!state) return { schemaVersion: 1, managedBy: MANAGED_BY, skills: {}, blocks: {} };
  try {
    const parsed = JSON.parse(decodeUtf8(state)) as Partial<Manifest>;
    if (parsed.schemaVersion === 1 && parsed.managedBy === MANAGED_BY &&
        validHashes(parsed.skills, managedSkillPaths) && validHashes(parsed.blocks, instructionPaths)) {
      return parsed as Manifest;
    }
  } catch { /* Treat an unreadable receipt as a conflict. */ }
  throw new UnsafePathError('Existing workflow ownership receipt is invalid or unsupported.');
}

function validHashes(records: unknown, allowlist: Set<string>): boolean {
  return !!records && typeof records === 'object' && !Array.isArray(records) &&
    Object.entries(records).every(([key, value]) => allowlist.has(key) && typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));
}

const managedSkillPaths = new Set(Object.values(WORKFLOW_TARGETS).flatMap(({ skillRoot }) =>
  SKILL_NAMES.map(name => skillRoot + '/' + name + '/SKILL.md')));
const instructionPaths = new Set<string>(Object.values(WORKFLOW_TARGETS).map(({ instructionFile }) => instructionFile));

function makeFile(
  root: string,
  relativePath: string,
  kind: SkillInstallFile['kind'],
  state: FileState | null,
  content: string,
  conflict?: string,
): SkillInstallFile {
  const beforeSha256 = state?.sha256 ?? null;
  const afterSha256 = sha256(content);
  const action = conflict ? 'conflict' : beforeSha256 === afterSha256 ? 'unchanged' : state ? 'update' : 'create';
  return {
    path: destination(root, relativePath), relativePath, kind, action, beforeSha256, afterSha256, content,
    ...(conflict ? { reason: conflict } : {}),
  };
}

function checkedState(root: string, relative: string): { state: FileState | null; conflict?: string } {
  try {
    return { state: readState(root, relative) };
  } catch (error) {
    if (error instanceof UnsafePathError) return { state: null, conflict: error.message };
    throw error;
  }
}

function instructionBlock(names: string[], roots: string[], eol: string): string {
  const displayed = names.map(name => '`' + name + '`').join(', ');
  const locations = roots.map(root => '`' + root + '`').join(', ');
  return [
    BLOCK_START,
    '## Agent Shadow Brain workflow',
    'For substantive tasks, use the relevant installed skill: ' + displayed + '.',
    'Skill bundles are in ' + locations + '.',
    'Follow the user’s request and project rules. Handle simple tasks directly, plan when useful, carry out authorized work, and verify the requested result.',
    BLOCK_END,
  ].join(eol);
}

function replaceInstructionBlock(original: string, names: string[], roots: string[], owned?: string) {
  const eol = original.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const block = instructionBlock(names, roots, eol);
  const start = original.indexOf(BLOCK_START);
  const end = original.indexOf(BLOCK_END);
  const markerCount = original.split(BLOCK_PREFIX).length - 1;
  if (!markerCount) {
    if (owned) throw new UnsafePathError('The previously managed instruction block is missing.');
    const gap = !original || original === '\uFEFF' ? '' : /[\r\n]$/.test(original) ? eol : eol + eol;
    return { text: original + gap + block + eol, hash: sha256(block), managed: true };
  }

  const endAfter = end + BLOCK_END.length;
  const startsLine = (index: number) => index === 0 ||
    (index === 1 && original[0] === '\uFEFF') || /[\r\n]/.test(original[index - 1] ?? '');
  const endsLine = (index: number) => index === original.length || /[\r\n]/.test(original[index] ?? '');
  if (
    markerCount !== 2 || start < 0 || end <= start ||
    !startsLine(start) || !endsLine(start + BLOCK_START.length) || !startsLine(end) || !endsLine(endAfter)
  ) {
    throw new UnsafePathError('Existing workflow instruction markers are malformed or duplicated.');
  }

  const existing = original.slice(start, endAfter);
  const existingHash = sha256(existing);
  if (owned && existingHash !== owned) {
    throw new UnsafePathError('Previously managed workflow instructions were edited locally.');
  }
  if (!owned && existing !== block) {
    throw new UnsafePathError('Existing workflow instructions are not owned by this installer.');
  }
  return { text: original.slice(0, start) + block + original.slice(endAfter), hash: sha256(block), managed: !!owned };
}

function selectedTargets(value: WorkflowTarget[]): WorkflowTarget[] {
  if (!Array.isArray(value) || !value.length) throw new TypeError('Select at least one workflow target.');
  for (const target of value) {
    if (typeof target !== 'string' || !Object.prototype.hasOwnProperty.call(WORKFLOW_TARGETS, target)) throw new TypeError('Unknown workflow target.');
  }
  return listWorkflowTargets().map(({ target }) => target).filter(target => value.includes(target));
}

function selectedSkills(value: string[] | undefined): string[] {
  if (value === undefined) return [...SKILL_NAMES];
  if (!Array.isArray(value) || !value.length) throw new TypeError('Select at least one bundled workflow skill.');
  for (const name of value) {
    if (!SKILL_NAMES.some(skill => skill === name)) throw new TypeError('Unknown bundled workflow skill.');
  }
  return SKILL_NAMES.filter(name => value.includes(name));
}

/** Inspect the requested project and compute a preview without making filesystem changes. */
export function planSkillInstall(options: SkillInstallOptions): SkillInstallPlan {
  const targets = selectedTargets(options.targets);
  const skills = selectedSkills(options.skills);
  const projectDir = canonicalRoot(options.projectDir);
  const warnings: string[] = [];
  if (targets.includes('deepseek-harness')) {
    const git = fs.lstatSync(path.join(projectDir, '.git'), { throwIfNoEntry: false });
    if (!(git?.isFile() || git?.isDirectory())) {
      warnings.push('Select the repository root for DeepSeek Harness discovery. This directory has no .git marker.');
    }
    warnings.push('DeepSeek Harness needs its filesystem skill provider and skill tools enabled.');
  }

  const files: SkillInstallFile[] = [];
  const receipt = checkedState(projectDir, MANIFEST_PATH);
  let receiptConflict = receipt.conflict;
  let ownership = readManifest(null);
  if (!receiptConflict) {
    try {
      ownership = readManifest(receipt.state);
    } catch (error) {
      if (!(error instanceof UnsafePathError)) throw error;
      receiptConflict = error.message;
    }
  }
  const newOwnership: Manifest = { ...ownership, skills: { ...ownership.skills }, blocks: { ...ownership.blocks } };
  const bundles = skills.map(getBundledSkill);
  const roots = new Set(targets.map(target => WORKFLOW_TARGETS[target].skillRoot));
  for (const root of roots) {
    for (const bundle of bundles) {
      const relative = root + '/' + bundle.name + '/SKILL.md';
      const existing = checkedState(projectDir, relative);
      const unchanged = existing.state?.sha256 === sha256(bundle.content);
      const owned = existing.state?.sha256 === ownership.skills[relative] && !!existing.state;
      const conflict = existing.conflict ??
        (existing.state && !unchanged && !owned ? 'Existing skill differs from the bundle or was edited locally.' : undefined);
      const file = makeFile(projectDir, relative, 'skill', existing.state, bundle.content, conflict);
      files.push(file);
      if (!conflict && (!existing.state || owned)) newOwnership.skills[relative] = file.afterSha256!;
    }
  }

  for (const instruction of instructionPaths) {
    const matching = targets.filter(target => WORKFLOW_TARGETS[target].instructionFile === instruction);
    if (!matching.length) continue;
    const installedRoots = [...new Set(matching.map(target => WORKFLOW_TARGETS[target].skillRoot))];
    const { state, conflict } = checkedState(projectDir, instruction);
    let file: SkillInstallFile;
    try {
      if (conflict) throw new UnsafePathError(conflict);
      const block = replaceInstructionBlock(decodeUtf8(state), skills, installedRoots, ownership.blocks[instruction]);
      file = makeFile(projectDir, instruction, 'instructions', state, block.text);
      if (block.managed) newOwnership.blocks[instruction] = block.hash;
    } catch (error) {
      if (!(error instanceof UnsafePathError)) throw error;
      file = makeFile(projectDir, instruction, 'instructions', state, '', error.message);
      file.afterSha256 = null;
    }
    files.push(file);
  }

  const managed = Object.keys(newOwnership.skills).length || Object.keys(newOwnership.blocks).length;
  if (receipt.state || managed || receiptConflict) {
    const content = JSON.stringify(newOwnership, null, 2) + '\n';
    files.push(makeFile(projectDir, MANIFEST_PATH, 'manifest', receipt.state, content, receiptConflict));
  }
  return { projectDir, targets, skills, files, warnings };
}

function verifyPlan(plan: SkillInstallPlan): SkillInstallPlan {
  if (!plan || !Array.isArray(plan.files)) throw new TypeError('A workflow installation preview is required.');
  const fresh = planSkillInstall({ projectDir: plan.projectDir, targets: plan.targets, skills: plan.skills });
  const same = plan.projectDir === fresh.projectDir &&
    plan.files.length === fresh.files.length &&
    plan.files.every((prior, index) => {
      const current = fresh.files[index];
      return prior && prior.path === current.path && prior.relativePath === current.relativePath &&
        prior.kind === current.kind && prior.action === current.action && prior.beforeSha256 === current.beforeSha256 &&
        prior.afterSha256 === current.afterSha256 && prior.content === current.content;
    });
  if (!same) throw new Error('The workflow installation preview is stale or modified. Generate a new preview.');
  const conflicts = fresh.files.filter(file => file.action === 'conflict');
  if (conflicts.length) {
    const details = conflicts.map(file => file.relativePath + ' (' + file.reason + ')');
    throw new Error('Workflow installation has conflicts: ' + details.join(', '));
  }
  return fresh;
}

function captureBefore(root: string, file: SkillInstallFile): FileState | null {
  const current = readState(root, file.relativePath);
  if ((current?.sha256 ?? null) !== file.beforeSha256) {
    throw new Error('Workflow destination changed since preview: ' + file.relativePath);
  }
  return current;
}

function prepareTemporary(filename: string, bytes: string | Buffer, mode: number): string {
  const temporary = filename + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', mode);
  try {
    try {
      fs.writeFileSync(fd, bytes);
    } finally {
      fs.closeSync(fd);
    }
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* retain the original write failure */ }
    throw error;
  }
  return temporary;
}

function removeTemporary(temporary: string): void {
  try {
    fs.unlinkSync(temporary);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

function openInstallLock(root: string, createdDirs: string[]): () => void {
  inspectParent(root, LOCK_PATH, createdDirs);
  const filename = destination(root, LOCK_PATH);
  let fd: number;
  try {
    fd = fs.openSync(filename, 'wx', 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Another workflow installation holds the project lock.');
    }
    throw error;
  }
  const owned = fs.fstatSync(fd, { bigint: true });
  return () => {
    fs.closeSync(fd);
    const current = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (matchesFileIdentity(filename, owned, current)) fs.unlinkSync(filename);
  };
}

function installBackup(projectDir: string, files: PreparedFile[], createdDirs: string[]): string | null {
  if (!files.some(({ before }) => before)) return null;
  const prefix = BACKUP_ROOT + '/install-';
  inspectParent(projectDir, prefix, createdDirs);
  const backup = fs.mkdtempSync(destination(projectDir, prefix));
  for (const { file, before } of files) {
    if (!before) continue;
    const copy = destination(backup, file.relativePath);
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.writeFileSync(copy, before.bytes, { flag: 'wx', mode: 0o600 });
  }
  return backup;
}

function rollback(root: string, applied: PreparedFile[]): string[] {
  const remaining: string[] = [];
  for (const { file, before } of [...applied].reverse()) {
    try {
      const current = readState(root, file.relativePath);
      if ((current?.sha256 ?? null) !== file.afterSha256) {
        remaining.push(file.relativePath + ' (changed after installation)');
        continue;
      }
      if (!before) {
        fs.unlinkSync(file.path);
        continue;
      }
      const temporary = prepareTemporary(file.path, before.bytes, before.mode);
      try {
        const latest = readState(root, file.relativePath);
        if (latest?.sha256 !== file.afterSha256) {
          remaining.push(file.relativePath + ' (changed after installation)');
          continue;
        }
        fs.renameSync(temporary, file.path);
      } finally {
        removeTemporary(temporary);
      }
    } catch {
      remaining.push(file.relativePath + ' (could not restore)');
    }
  }
  return remaining;
}

function removeEmptyDirectories(createdDirs: string[]): void {
  for (const directory of [...createdDirs].reverse()) {
    try { fs.rmdirSync(directory); } catch { /* only remove empty directories created by this apply */ }
  }
}

/** Apply a still-current preview. Existing edited or unowned files are preserved. */
export function applySkillInstall(plan: SkillInstallPlan): SkillInstallResult {
  const initial = verifyPlan(plan);
  const result: SkillInstallResult = {
    projectDir: initial.projectDir, created: [], updated: [],
    unchanged: initial.files.filter(file => file.action === 'unchanged').map(file => file.path),
    backupDir: null,
  };
  if (result.unchanged.length === initial.files.length) return result;

  const projectDir = initial.projectDir;
  const createdDirs: string[] = [];
  const prepared: PreparedFile[] = [];
  const applied: PreparedFile[] = [];
  let releaseLock: (() => void) | undefined;
  let completed = false;
  try {
    releaseLock = openInstallLock(projectDir, createdDirs);
    const fresh = verifyPlan(plan);
    const changes = fresh.files.filter(file => file.action === 'create' || file.action === 'update');
    const captured = changes.map(file => ({ file, before: captureBefore(projectDir, file) }));
    for (const { file, before } of captured) {
      inspectParent(projectDir, file.relativePath, createdDirs);
      const temporary = prepareTemporary(file.path, file.content, before?.mode ?? 0o644);
      prepared.push({ file, before, temporary });
    }
    result.backupDir = installBackup(projectDir, prepared, createdDirs);

    for (const item of prepared) {
      const { file, temporary } = item;
      captureBefore(projectDir, file);
      if (file.action === 'create') {
        fs.linkSync(temporary, file.path);
        applied.push(item);
        removeTemporary(temporary);
        result.created.push(file.path);
      } else {
        fs.renameSync(temporary, file.path);
        applied.push(item);
        result.updated.push(file.path);
      }
    }
    completed = true;
    return result;
  } catch (error) {
    for (const item of prepared) {
      try { removeTemporary(item.temporary); } catch { /* keep the original failure */ }
    }
    const remaining = rollback(projectDir, applied);
    const failure = error instanceof Error ? error.message : String(error);
    const recovery = remaining.length ? ' Paths requiring review: ' + remaining.join(', ') + '.' : '';
    const backup = result.backupDir ? ' Backups: ' + result.backupDir + '.' : '';
    throw new Error('Workflow installation failed. ' + failure + recovery + backup, { cause: error });
  } finally {
    try {
      releaseLock?.();
    } finally {
      if (!completed) removeEmptyDirectories(createdDirs);
    }
  }
}
