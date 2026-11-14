import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GlobalBrain } from './global-brain.js';
import { MAX_PROJECT_SKILL_BYTES, PROJECT_SKILL_RECEIPT_DIR, replaceProjectFile, withProjectSkillWriteLock,
  type ProjectSkillReceipt } from './project-kit.js';
import { ensureProjectDirectory, projectLocalPath, projectRoot, readProjectFile } from './project-kit-paths.js';
import { WORKFLOW_TARGETS, type WorkflowTarget } from './workflow-skills.js';

const disabledDirectory = '.shadow-brain/disabled-project-skills';
const hash = /^[a-f0-9]{64}$/u;
const MAX_RECEIPT_BYTES = 4096;
const MAX_RECEIPTS = 500;
const hostRefreshNote = 'Reload or restart the coding client to refresh skill discovery. Existing chats may still contain previously loaded instructions.';
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export type ManagedSkillAction = 'disable' | 'enable' | 'remove';
export type ManagedSkillState = 'enabled' | 'disabled' | 'missing' | 'edited' | 'conflict';
export interface ManagedSkill {
  id: string; name: string; targets: WorkflowTarget[]; relativePath: string; state: ManagedSkillState; ownershipVerified: boolean; sha256: string; reason?: string;
  pendingAction?: ManagedSkillAction;
}
interface ManagedEntry {
  skill: ManagedSkill; receiptPath: string; receiptHash: string; disabledPath: string; bytes?: Buffer;
  installedHash: string | null; disabledHash: string | null; pending: ManagedSkillAction | null;
}
type ManagedRequest = { id: string; action: ManagedSkillAction };

export class ManagedSkillError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); this.name = 'ManagedSkillError'; }
}

const conflict = (message: string): never => { throw new ManagedSkillError('MANAGED_SKILL_CONFLICT', message, 409); };
const invalid = (): never => { throw new ManagedSkillError('MANAGED_SKILL_INVALID', 'Choose a managed skill and a supported action.', 400); };
const receiptPathOf = (id: string) => `${PROJECT_SKILL_RECEIPT_DIR}/${id}.json`;
const disabledPathOf = (id: string) => `${disabledDirectory}/${id}.md`;
const markerPathOf = (id: string) => `${PROJECT_SKILL_RECEIPT_DIR}/${id}.lifecycle.json`;
const markerText = (action: ManagedSkillAction, sha256: string) => JSON.stringify({ action, sha256 });

function parseRequest(raw: Record<string, unknown>, applying: boolean): ManagedRequest & { planHash?: string } {
  const { id, action, planHash } = raw;
  if (Object.keys(raw).some(key => !['id', 'action', ...(applying ? ['planHash'] : [])].includes(key)) ||
      typeof id !== 'string' || !hash.test(id) || (action !== 'disable' && action !== 'enable' && action !== 'remove') ||
      (applying && (typeof planHash !== 'string' || !hash.test(planHash)))) return invalid();
  return { id, action, ...(typeof planHash === 'string' ? { planHash } : {}) };
}

function receipt(raw: Buffer, projectId: string, id: string) {
  let value: ProjectSkillReceipt;
  try { value = JSON.parse(raw.toString('utf8')) as ProjectSkillReceipt; }
  catch { return conflict('The ownership receipt is invalid.'); }
  if (!value || value.schemaVersion !== 1 || value.projectId !== projectId || typeof value.relativePath !== 'string' ||
      typeof value.sha256 !== 'string' || !hash.test(value.sha256) || digest(value.relativePath) !== id) {
    return conflict('The ownership receipt does not match this project and skill.');
  }
  const [file, name] = value.relativePath.split('/').slice(-2).reverse();
  if (file !== 'SKILL.md' || !name || name.length > 63 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(name)) return conflict('The receipt does not point to a supported Project Kit skill path.');
  const targets = (Object.keys(WORKFLOW_TARGETS) as WorkflowTarget[]).filter(target =>
    `${WORKFLOW_TARGETS[target].skillRoot}/${name}/SKILL.md` === value.relativePath);
  if (!targets.length) return conflict('The receipt does not point to a supported Project Kit skill path.');
  return { value, targets, name };
}

function readEntry(root: string, projectId: string, id: string): ManagedEntry {
  const receiptPath = receiptPathOf(id), disabledPath = disabledPathOf(id);
  const raw = readProjectFile(root, receiptPath, MAX_RECEIPT_BYTES);
  if (!raw) throw new ManagedSkillError('MANAGED_SKILL_NOT_FOUND', 'Project Kit did not record ownership of this skill.', 404);
  const { value, targets, name } = receipt(raw, projectId, id);
  const base = { id, name, targets, relativePath: value.relativePath, sha256: value.sha256 };
  const receiptHash = digest(raw);
  try {
    const marker = readProjectFile(root, markerPathOf(id), MAX_RECEIPT_BYTES);
    const operations: ManagedSkillAction[] = ['disable', 'enable', 'remove'];
    const pending = marker ? operations.find(action => markerText(action, receiptHash) === marker.toString('utf8')) ?? null : null;
    if (marker && !pending) return conflict('The pending operation does not match this ownership receipt.');
    const disabled = readProjectFile(root, disabledPath, MAX_PROJECT_SKILL_BYTES);
    const disabledHash = disabled ? digest(disabled) : null;
    const installedPath = projectLocalPath(root, value.relativePath);
    const exists = fs.lstatSync(installedPath, { throwIfNoEntry: false }) !== undefined;
    const install = exists && (!disabled || pending === 'disable' || pending === 'enable') ? readProjectFile(root, value.relativePath, MAX_PROJECT_SKILL_BYTES) : undefined;
    const installedHash = install ? digest(install) : null;
    const expected = value.sha256;
    let state: ManagedSkillState, reason: string | undefined;
    if (disabled && exists) { state = 'conflict'; reason = pending && installedHash === expected && disabledHash === expected ?
      `A verified ${pending} operation is pending. Preview it again to finish.` : 'The disabled copy and its discovery destination both exist. Preserve both and resolve the destination before continuing.'; }
    else if ((installedHash && installedHash !== expected) || (disabledHash && disabledHash !== expected)) { state = 'edited'; reason = 'The skill bytes differ from the ownership receipt.'; }
    else if (disabledHash === expected) state = 'disabled';
    else if (installedHash === expected) state = 'enabled';
    else { state = 'missing'; reason = pending === 'remove' ? 'A verified removal is pending. Preview Remove to finish it.' : 'The managed skill file is missing.'; }
    return { skill: { ...base, state, ownershipVerified: state === 'enabled' || state === 'disabled', ...(reason ? { reason } : {}),
      ...(pending ? { pendingAction: pending } : {}) },
      receiptPath, receiptHash, disabledPath, bytes: install ?? disabled, installedHash, disabledHash, pending };
  } catch {
    return { skill: { ...base, state: 'conflict', ownershipVerified: false, reason: 'A managed path is unsafe or could not be verified.' },
      receiptPath, receiptHash, disabledPath, installedHash: null, disabledHash: null, pending: null };
  }
}

export function listManagedProjectSkills(directory: string) {
  const root = projectRoot(directory), projectId = GlobalBrain.projectIdFor(root);
  const dir = projectLocalPath(root, PROJECT_SKILL_RECEIPT_DIR);
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!stat) return { projectId, skills: [], invalidReceipts: 0 };
  if (!stat.isDirectory()) return conflict('Project Kit receipts require an ordinary directory.');
  const skills: ManagedSkill[] = [];
  let invalidReceipts = 0, seen = 0;
  const handle = fs.opendirSync(dir);
  try {
    for (let item = handle.readSync(); item; item = handle.readSync()) {
      if (++seen > MAX_RECEIPTS * 4) throw new ManagedSkillError('MANAGED_SKILL_LIMIT', 'Project Kit has too many files in its ownership directory.', 422);
      const id = item.name.slice(0, -5);
      if (!item.name.endsWith('.json') || !hash.test(id)) continue;
      if (skills.length + invalidReceipts >= MAX_RECEIPTS) throw new ManagedSkillError('MANAGED_SKILL_LIMIT', 'Project Kit has more than 500 ownership receipts.', 422);
      try { skills.push(readEntry(root, projectId, id).skill); }
      catch { invalidReceipts++; }
    }
  } finally { handle.closeSync(); }
  return { projectId, skills: skills.sort((a, b) => a.relativePath.localeCompare(b.relativePath)), invalidReceipts };
}

function plan(root: string, projectId: string, input: ManagedRequest, entry: ManagedEntry) {
  const { skill, receiptPath, disabledPath, receiptHash, installedHash, disabledHash, pending } = entry;
  const { state, relativePath } = skill;
  const bothVerified = installedHash === skill.sha256 && disabledHash === skill.sha256;
  const ordinary = input.action === 'enable' ? state === 'disabled' : input.action === 'disable' ? state === 'enabled' : skill.ownershipVerified;
  const recovering = pending === input.action && (input.action === 'remove' ? state === 'missing' || skill.ownershipVerified : bothVerified || skill.ownershipVerified);
  const allowed = pending ? recovering : ordinary;
  const conflicts = allowed ? [] : [skill.reason ?? `This skill is ${state}.`];
  const exactPaths = input.action === 'remove' ? [
    ...(installedHash ? [relativePath] : []), ...(disabledHash ? [disabledPath] : []), receiptPath,
  ] : pending && (input.action === 'enable' ? state === 'enabled' : state === 'disabled') ? [] : [relativePath, disabledPath];
  const expectedHashes = { receipt: receiptHash, installed: installedHash, disabled: disabledHash };
  const effects = pending && !exactPaths.length ? ['Finish the verified operation already recorded on disk.'] : input.action === 'disable' ? ['Move the verified skill outside host discovery.'] : input.action === 'enable' ?
    ['Restore the verified skill at its absent discovery path.'] : ['Remove the verified skill and its Project Kit ownership receipt.'];
  const planHash = digest(JSON.stringify({ root, projectId, id: input.id, action: input.action, state, expectedHashes, exactPaths, conflicts, pending }));
  return { projectId, skill, action: input.action, planHash, exactPaths, expectedHashes, conflicts, effects, hostRefreshNote };
}

export function previewManagedProjectSkill(directory: string, raw: Record<string, unknown>) {
  const root = projectRoot(directory), projectId = GlobalBrain.projectIdFor(root), input = parseRequest(raw, false);
  return plan(root, projectId, input, readEntry(root, projectId, input.id));
}

function unlinkVerified(root: string, relative: string, expected: string, limit: number) {
  const value = readProjectFile(root, relative, limit);
  if (!value || digest(value) !== expected) return conflict('A managed file changed before it could be removed.');
  fs.unlinkSync(projectLocalPath(root, relative));
}

export function applyManagedProjectSkill(directory: string, raw: Record<string, unknown>) {
  const root = projectRoot(directory), projectId = GlobalBrain.projectIdFor(root), input = parseRequest(raw, true);
  const initial = readEntry(root, projectId, input.id);
  const initialPlan = plan(root, projectId, input, initial);
  if (initialPlan.planHash !== input.planHash || initialPlan.conflicts.length) return conflict(initialPlan.conflicts[0] ?? 'The skill changed. Create a new preview.');
  return withProjectSkillWriteLock(root, () => {
    const entry = readEntry(root, projectId, input.id);
    const preview = plan(root, projectId, input, entry);
    if (preview.planHash !== input.planHash || preview.conflicts.length) return conflict(preview.conflicts[0] ?? 'The skill changed. Create a new preview.');
    const { relativePath, sha256 } = entry.skill;
    const { receiptPath, disabledPath, receiptHash, pending } = entry;
    const marker = markerPathOf(input.id), record = markerText(input.action, receiptHash);
    if (!pending) replaceProjectFile(root, marker, record);
    if (input.action !== 'remove') {
      const restoring = input.action === 'enable';
      const source = restoring ? disabledPath : relativePath, target = restoring ? relativePath : disabledPath;
      const sourceHash = restoring ? entry.disabledHash : entry.installedHash;
      const targetHash = restoring ? entry.installedHash : entry.disabledHash;
      let copied = false;
      try {
        if (!targetHash) {
          ensureProjectDirectory(root, path.posix.dirname(target));
          replaceProjectFile(root, target, entry.bytes!);
          copied = true;
        }
        if (sourceHash) unlinkVerified(root, source, sha256, MAX_PROJECT_SKILL_BYTES);
      }
      catch (error) {
        try {
          if (copied) unlinkVerified(root, target, sha256, MAX_PROJECT_SKILL_BYTES);
          if (!pending) unlinkVerified(root, marker, digest(record), MAX_RECEIPT_BYTES);
        } catch { /* Preserve changed or recoverable copies. */ }
        throw error;
      }
    } else {
      if (entry.skill.state !== 'missing') unlinkVerified(root, entry.skill.state === 'disabled' ? disabledPath : relativePath, sha256, MAX_PROJECT_SKILL_BYTES);
      // Replace the verified journal with the verified receipt. This atomically removes the active receipt,
      // while keeping evidence of completion outside the inventory if the process stops during cleanup.
      const verified = readProjectFile(root, receiptPath, MAX_RECEIPT_BYTES);
      if (!verified || digest(verified) !== receiptHash) return conflict('The ownership receipt changed before removal.');
      const journal = readProjectFile(root, marker, MAX_RECEIPT_BYTES);
      if (!journal || digest(journal) !== digest(record)) return conflict('The pending removal record changed.');
      fs.renameSync(projectLocalPath(root, receiptPath), projectLocalPath(root, marker));
      try { unlinkVerified(root, marker, receiptHash, MAX_RECEIPT_BYTES); } catch { /* Active receipt removal committed. */ }
    }
    if (input.action !== 'remove') unlinkVerified(root, marker, digest(record), MAX_RECEIPT_BYTES);
    return { projectId, id: input.id, finalState: input.action === 'disable' ? 'disabled' : input.action === 'enable' ? 'enabled' : 'removed',
      changedPaths: preview.exactPaths, preservedPaths: input.action === 'remove' ? [] : [receiptPath], hostRefreshNote };
  });
}
