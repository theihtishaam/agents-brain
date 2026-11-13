import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inspectProject, type ProjectProfile } from './project-kit-inspection.js';
import { ensureProjectDirectory, projectLocalPath, projectRoot, ProjectKitError, readProjectFile } from './project-kit-paths.js';
import { WORKFLOW_TARGETS, type WorkflowTarget } from './workflow-skills.js';
import { matchesFileIdentity } from './file-identity.js';

export { inspectProject, type ProjectProfile } from './project-kit-inspection.js';
export { ensureProjectDirectory, projectLocalPath, projectRoot, ProjectKitError } from './project-kit-paths.js';

export interface ProjectSkillParams {
  requirement: string;
  target: WorkflowTarget;
  name?: string;
  knowledge?: string | string[];
}

export interface ProjectSkillFile {
  relativePath: string;
  content: string;
  status: 'create' | 'update' | 'unchanged' | 'conflict';
  existingHash?: string;
  reason?: string;
}

export interface ProjectSkillPlan {
  projectId: string;
  profile: ProjectProfile;
  requirement: string;
  target: WorkflowTarget;
  name: string;
  files: ProjectSkillFile[];
  planHash: string;
  warnings: string[];
}

export interface ProjectSkillApplyResult {
  projectId: string;
  planHash: string;
  files: Array<{ relativePath: string; status: 'created' | 'updated' | 'unchanged' }>;
  warnings: string[];
}

interface Receipt {
  schemaVersion: 1;
  projectId: string;
  relativePath: string;
  sha256: string;
}

const MAX_INPUT = 8000;
const MAX_SKILL = 64 * 1024;
const RECEIPT_DIR = '.shadow-brain/project-kit-skills';
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

function sha(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function inputText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length > MAX_INPUT || CONTROL.test(value)) {
    throw new TypeError(label + ' must be text of at most 8000 characters without control codes.');
  }
  return value.replace(/\r\n?/g, '\n').trim();
}

function inputs(params: ProjectSkillParams, project: ProjectProfile) {
  if (!params || typeof params !== 'object' || Array.isArray(params) ||
      Object.keys(params).some(key => !['requirement', 'target', 'name', 'knowledge'].includes(key))) {
    throw new TypeError('Provide a requirement, target, and optional name and knowledge.');
  }
  const requirement = inputText(params.requirement, 'Requirement');
  if (!requirement) throw new TypeError('Provide a nonempty requirement.');
  if (typeof params.target !== 'string' || !Object.hasOwn(WORKFLOW_TARGETS, params.target)) throw new TypeError('Choose a supported skill target.');
  const task = requirement.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 46).replace(/-$/g, '') || 'project-task';
  const name = params.name ?? task + '-' + sha(project.projectId + '\0' + requirement).slice(0, 10);
  if (typeof name !== 'string' || name.length > 63 || !NAME_PATTERN.test(name) || RESERVED_NAME.test(name)) {
    throw new TypeError('Skill name must be 1 to 63 lowercase letters, digits, or hyphen-separated words.');
  }
  const raw = params.knowledge ?? '';
  if (Array.isArray(raw) && raw.length > 100) throw new TypeError('Provide at most 100 knowledge notes.');
  const knowledge = Array.isArray(raw) ? raw.map(note => inputText(note, 'Knowledge')).filter(Boolean).join('\n\n') : inputText(raw, 'Knowledge');
  if (knowledge.length > MAX_INPUT) throw new TypeError('Combined knowledge must be at most 8000 characters.');
  return { requirement, target: params.target, name, knowledge };
}

function quote(text: string): string {
  return text.split('\n').map(line => '> ' + line).join('\n');
}

function inline(value: string): string {
  return value.replace(/[\\`*_{}\[\]()<>#!|~]/g, '\\$&');
}

function renderSkill(profile: ProjectProfile, selected: ReturnType<typeof inputs>): string {
  const { requirement, name, knowledge } = selected;
  const trigger = requirement.replace(/\s+/g, ' ').slice(0, 150);
  const rows = [
    '---',
    'name: ' + JSON.stringify(name),
    'description: ' + JSON.stringify('Use for this project task: ' + trigger),
    '---',
    '',
    '# ' + name,
    '',
    'Use this skill within the selected project. Follow current user instructions and applicable project rules first. Recheck saved observations when the project changes.',
    '',
    '## Requirement supplied by the user',
    '',
    quote(requirement),
    ...(knowledge ? ['', '## Project knowledge supplied by the user', '', quote(knowledge)] : []),
    '',
    '## Observed project markers',
    '',
    ...(profile.evidence.length ? profile.evidence.slice(0, 16).map(item =>
      '- ' + inline(item.path) + ' indicates ' + item.signals.map(inline).join(', ') + '.') :
      ['- The bounded inspection found no recognized project markers. Confirm the stack before choosing a verification command.']),
    '',
    '## Work and verify',
    '',
    '1. Confirm the requested result, the affected project files, and any current constraints.',
    '2. Use the supplied requirement and project knowledge as task context. Verify evidence before relying on it.',
    '3. Make the requested change and inspect it through the normal project entry point.',
    '4. Run the relevant declared checks after confirming they still apply and review the actual result.',
    '',
    ...(profile.checks.length ? ['Declared checks observed in project manifests. Use each check from the directory containing its source.',
      ...profile.checks.slice(0, 12).map(item => '- ' + inline(item.label) + ' uses `' + item.command + '` from ' + inline(item.source) + '.')] :
      ['The bounded inspection found no recognized declared checks. Use the project’s current verification procedure.']),
    '',
    'If the project exposes `project_feedback`, report a memory ID and observed outcome only when a check or the user’s feedback supports the rating. Describe the evidence and uncertainty. Retrieval rank and successful tool execution alone do not establish a useful or correct memory.',
    '',
  ];
  return rows.join('\n');
}

function receiptPath(relative: string): string {
  return RECEIPT_DIR + '/' + sha(relative) + '.json';
}

function readReceipt(profile: ProjectProfile, relative: string): { receipt: Receipt; bytes: Buffer } | undefined {
  const bytes = readProjectFile(profile.root, receiptPath(relative), 4096);
  if (!bytes) return undefined;
  try {
    const receipt = JSON.parse(bytes.toString('utf8')) as Receipt;
    if (receipt?.schemaVersion === 1 && receipt.projectId === profile.projectId && receipt.relativePath === relative && HASH_PATTERN.test(receipt.sha256)) {
      return { receipt, bytes };
    }
  } catch { /* Invalid ownership data cannot establish ownership. */ }
  throw new ProjectKitError('PROJECT_KIT_CONFLICT', 'The project skill ownership receipt is invalid.');
}

function destinationState(profile: ProjectProfile, relativePath: string, content: string): ProjectSkillFile {
  const file = { relativePath, content };
  try {
    const filename = projectLocalPath(profile.root, relativePath);
    const existing = fs.lstatSync(filename, { throwIfNoEntry: false });
    const ownership = readReceipt(profile, relativePath);
    if (!existing && !ownership) return { ...file, status: 'create' };
    if (!existing || !ownership) {
      return { ...file, status: 'conflict', reason: existing ? 'An existing file is outside Project Kit ownership.' : 'The previously owned skill file is missing.' };
    }
    const bytes = readProjectFile(profile.root, relativePath, MAX_SKILL);
    if (!bytes) return { ...file, status: 'conflict', reason: 'The skill file changed during preview.' };
    const existingHash = sha(bytes);
    if (existingHash !== ownership.receipt.sha256) return { ...file, existingHash, status: 'conflict', reason: 'The owned skill was edited after its last application.' };
    return { ...file, existingHash, status: existingHash === sha(content) ? 'unchanged' : 'update' };
  } catch (error) {
    if (!(error instanceof ProjectKitError)) throw error;
    return { ...file, status: 'conflict', reason: error.message };
  }
}

/** Produce a read-only, root-bound preview. Existing unowned skill bytes are never read. */
export function planProjectSkill(root: string, params: ProjectSkillParams): ProjectSkillPlan {
  const profile = inspectProject(root);
  const selected = inputs(params, profile);
  const relative = WORKFLOW_TARGETS[selected.target].skillRoot + '/' + selected.name + '/SKILL.md';
  const content = renderSkill(profile, selected);
  const file = destinationState(profile, relative, content);
  const { projectId, root: projectDirectory, stack, packageManagers, evidence, checks } = profile;
  const planHash = sha(JSON.stringify({ schemaVersion: 1, projectId, root: projectDirectory, stack, packageManagers, evidence, checks, ...selected, file }));
  return { projectId: profile.projectId, profile, requirement: selected.requirement, target: selected.target,
    name: selected.name, files: [file], planHash, warnings: [...profile.warnings] };
}

function replaceProjectFile(root: string, relative: string, content: string | Buffer, expectedHash?: string): void {
  const filename = projectLocalPath(root, relative);
  const temporary = filename + '.' + randomUUID() + '.tmp';
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    projectLocalPath(root, relative);
    if (expectedHash) {
      const before = readProjectFile(root, relative, MAX_SKILL);
      if (!before || sha(before) !== expectedHash) throw new ProjectKitError('PROJECT_KIT_STALE_PLAN', 'A managed file changed during application.');
      fs.renameSync(temporary, filename);
    } else {
      // Linking a prepared sibling creates the destination exclusively without clobbering an intervening file.
      fs.linkSync(temporary, filename);
    }
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function assertPlan(plan: ProjectSkillPlan, expectedPlanHash: string): void {
  if (plan.files[0].status === 'conflict') {
    throw new ProjectKitError('PROJECT_KIT_CONFLICT', plan.files[0].reason ?? 'The skill has a destination conflict.');
  }
  if (plan.planHash !== expectedPlanHash) {
    throw new ProjectKitError('PROJECT_KIT_STALE_PLAN', 'The project skill preview changed. Create a new preview before applying.');
  }
}

/** Rebuild the reviewed preview under a project-local write lock, then save only its managed skill and receipt. */
export async function applyProjectSkill(root: string, params: ProjectSkillParams, expectedPlanHash: string): Promise<ProjectSkillApplyResult> {
  if (typeof expectedPlanHash !== 'string' || !HASH_PATTERN.test(expectedPlanHash)) throw new TypeError('A current project skill plan hash is required.');
  const initial = planProjectSkill(root, params);
  assertPlan(initial, expectedPlanHash);
  const canonical = projectRoot(initial.profile.root);
  const result = (status: ProjectSkillApplyResult['files'][number]['status']): ProjectSkillApplyResult => ({
    projectId: initial.projectId, planHash: initial.planHash, files: [{ relativePath: initial.files[0].relativePath, status }], warnings: initial.warnings,
  });
  if (initial.files[0].status === 'unchanged') return result('unchanged');
  const lockDirectory = ensureProjectDirectory(canonical, RECEIPT_DIR);
  const lock = path.join(lockDirectory, 'write.lock');
  let fd: number;
  try { fd = fs.openSync(lock, 'wx', 0o600); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProjectKitError('PROJECT_KIT_CONFLICT', 'Another Project Kit write is in progress.');
    throw new ProjectKitError('PROJECT_KIT_WRITE_FAILED', 'Could not acquire the project skill write lock.');
  }
  const owner = fs.fstatSync(fd, { bigint: true });
  try {
    const plan = planProjectSkill(canonical, params);
    assertPlan(plan, expectedPlanHash);
    const file = plan.files[0];
    ensureProjectDirectory(canonical, path.posix.dirname(file.relativePath));
    const prior = file.existingHash ? readProjectFile(canonical, file.relativePath, MAX_SKILL) : undefined;
    const receipt = readReceipt(plan.profile, file.relativePath);
    if (file.existingHash !== receipt?.receipt.sha256) {
      throw new ProjectKitError('PROJECT_KIT_STALE_PLAN', 'The project skill ownership changed during application.');
    }
    const newHash = sha(file.content);
    const next: Receipt = { schemaVersion: 1, projectId: plan.projectId, relativePath: file.relativePath, sha256: newHash };
    try {
      replaceProjectFile(canonical, file.relativePath, file.content, file.existingHash);
      try {
        replaceProjectFile(canonical, receiptPath(file.relativePath), JSON.stringify(next) + '\n', receipt ? sha(receipt.bytes) : undefined);
      } catch (error) {
        const written = readProjectFile(canonical, file.relativePath, MAX_SKILL);
        if (written && sha(written) === newHash) {
          if (prior) replaceProjectFile(canonical, file.relativePath, prior, newHash);
          else fs.unlinkSync(projectLocalPath(canonical, file.relativePath));
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof ProjectKitError) throw error;
      throw new ProjectKitError('PROJECT_KIT_WRITE_FAILED', 'Could not save the project skill and ownership receipt.');
    }
    return result(file.status === 'create' ? 'created' : 'updated');
  } finally {
    fs.closeSync(fd);
    const current = fs.lstatSync(lock, { throwIfNoEntry: false, bigint: true });
    if (matchesFileIdentity(lock, owner, current)) fs.unlinkSync(lock);
  }
}
