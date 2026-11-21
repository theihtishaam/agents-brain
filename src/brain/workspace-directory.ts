import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import { homedir } from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { matchesFileIdentity } from './file-identity.js';
import { GlobalBrain } from './global-brain.js';
import { projectRoot } from './project-kit-paths.js';

export const WORKSPACE_DIRECTORY_LIMITS = Object.freeze({ projects: 128, forgotten: 2048, bytes: 1024 * 1024 });
const fileName = 'workspace-directory.json';
const lockName = 'workspace-directory.lock';
const maxPathBytes = 2048;
const maxRevision = Number.MAX_SAFE_INTEGER - 1;
const projectIdSchema = z.string().regex(/^[0-9a-f]{16}$/u);
const revisionSchema = z.number().int().min(0).max(maxRevision);
const sourceSchema = z.enum(['portal', 'mcp', 'operator']);
const tokenPattern = /(?:\b(?:ghp_|github_pat_|sk[-_]|xox[abprs]-)[a-z0-9_-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b)/iu;
const privateName = /^(?:\.(?:agents|aws|azure|claude|cline|codex|config|docker|dsh|env|git|gnupg|kube|mozilla|openclaw|opencode|shadow-brain|ssh)(?:\.|$)|(?:application support|browser|browsers|chrome|chromium|edge|microsoft edge|brave|bravesoftware|firefox|mozilla|opera|opera software|safari|webkit|vivaldi|tor browser|default|user data|userdata|local storage|session storage|profiles?|profile[ _-]+\d+|login data|local state|web data|cookies|history|keychains|credentials|passwords?|secrets?|tokens?|wallets?|vaults?)(?:$|\.(?:json|txt|db|sqlite)))/iu;
const invalidName = /[\\/:*?"<>|\p{Cc}\p{Cf}\uFFFD]|[ .]$|~\d+(?:\.|$)/u;

function safePath(value: unknown, allowOwnedDirectory = false): value is string {
  if (typeof value !== 'string' || !path.isAbsolute(value) || Buffer.byteLength(value) > maxPathBytes || /^[\\/]{2}/u.test(value)) return false;
  const drive = path.parse(value).root;
  if (process.platform === 'win32' && !/^[a-z]:[\\/]$/iu.test(drive)) return false;
  const parts = value.slice(drive.length).split(process.platform === 'win32' ? /[\\/]/u : '/').filter(Boolean);
  return parts.length > 0 && parts.length <= 32 && parts.every(part => {
    const name = part.normalize('NFKC').toLowerCase();
    return !!name && !invalidName.test(name) && !tokenPattern.test(part) &&
      (allowOwnedDirectory && name === '.shadow-brain' || !privateName.test(name));
  });
}

const displayNameSchema = z.string().trim().min(1).max(200).refine(value => !/[\p{Cc}\p{Cf}]/u.test(value) && !tokenPattern.test(value));
const directoryEntrySchema = z.strictObject({ projectId: projectIdSchema, projectName: displayNameSchema,
  root: z.string().refine(value => safePath(value)), lastOpenedAt: z.iso.datetime(), lastSource: sourceSchema });
const forgottenSchema = z.strictObject({ projectId: projectIdSchema, forgottenAt: z.iso.datetime() });
const snapshotSchema = z.strictObject({ schemaVersion: z.literal(1), revision: revisionSchema,
  projects: z.array(directoryEntrySchema).max(WORKSPACE_DIRECTORY_LIMITS.projects),
  forgotten: z.array(forgottenSchema).max(WORKSPACE_DIRECTORY_LIMITS.forgotten) });
const lockSchema = z.strictObject({ kind: z.literal('workspace-directory-lock'), pid: z.number().int().min(1).max(0x7fffffff) });
export type WorkspaceDirectoryEntry = z.infer<typeof directoryEntrySchema>;
export type WorkspaceDirectorySnapshot = z.infer<typeof snapshotSchema>;
export type WorkspaceDirectorySource = z.infer<typeof sourceSchema>;
interface RegisterOptions { expectedRevision?: number; projectName?: string; reenable?: boolean }

export class WorkspaceDirectoryError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}

const invalid = () => new WorkspaceDirectoryError('WORKSPACE_DIRECTORY_INVALID_PROJECT', 'Choose a valid ordinary local project directory.', 400);
const unavailable = () => new WorkspaceDirectoryError('WORKSPACE_DIRECTORY_UNAVAILABLE', 'The workspace directory could not be read or updated.', 503);
const conflict = () => new WorkspaceDirectoryError('WORKSPACE_DIRECTORY_CONFLICT', 'The workspace directory changed. Refresh it and retry.', 409);
const limited = () => new WorkspaceDirectoryError('WORKSPACE_DIRECTORY_LIMIT', 'The workspace directory reached its saved preference limit.', 422);
const errno = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code;

/** Verify an explicitly supplied root without opening its files or following a linked project. */
export function verifiedWorkspaceRoot(value: string): string {
  if (!safePath(value)) throw invalid();
  try {
    const root = projectRoot(value);
    if (safePath(root)) return root;
  } catch { /* Return a diagnostic without the original path. */ }
  throw invalid();
}

function readBounded(filename: string, maxBytes: number): { text: string; stat: fs.BigIntStats } | undefined {
  const before = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
  if (!before) return undefined;
  if (!before.isFile() || before.nlink !== 1n || before.size > BigInt(maxBytes)) throw unavailable();
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    const current = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (!matchesFileIdentity(filename, opened, current) || before.ino !== opened.ino || opened.size > BigInt(maxBytes)) throw unavailable();
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(fd, buffer, offset, buffer.length - offset, offset);
      if (!count) break;
      offset += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (BigInt(offset) !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs || after.nlink !== 1n) throw unavailable();
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, offset)), stat: opened };
  } finally { fs.closeSync(fd); }
}

function recoverLock(filename: string): boolean {
  try {
    const record = readBounded(filename, 128);
    if (!record) return true;
    const { pid } = lockSchema.parse(JSON.parse(record.text));
    try { process.kill(pid, 0); return false; }
    catch (error) { if (errno(error) !== 'ESRCH') return false; }
    const stat = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (!matchesFileIdentity(filename, record.stat, stat) || stat?.mtimeNs !== record.stat.mtimeNs) return false;
    fs.unlinkSync(filename);
    return true;
  } catch { return false; }
}

/** A per-user index of projects explicitly opened or added. Project stores remain independent. */
export class WorkspaceDirectory {
  private readonly directory: string;
  private readonly now: () => number;

  constructor(options: { directory?: string; now?: () => number } = {}) {
    this.directory = options.directory ?? process.env.SHADOW_BRAIN_DIRECTORY_HOME ?? path.join(homedir(), '.shadow-brain');
    this.now = options.now ?? Date.now;
  }

  private checkedDirectory(create: boolean): string | undefined {
    if (!safePath(this.directory, true)) throw unavailable();
    const volume = path.parse(this.directory).root;
    let current = volume;
    for (const part of this.directory.slice(volume.length).split(process.platform === 'win32' ? /[\\/]/u : '/')) {
      current = path.join(current, part);
      let stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (!stat && create) {
        try { fs.mkdirSync(current, { mode: 0o700 }); }
        catch (error) { if (errno(error) !== 'EEXIST') throw error; }
        stat = fs.lstatSync(current, { throwIfNoEntry: false });
      }
      if (!stat && !create) return undefined;
      if (!stat?.isDirectory() || stat.isSymbolicLink()) throw unavailable();
    }
    return current;
  }

  list(): WorkspaceDirectorySnapshot {
    try {
      const directory = this.checkedDirectory(false);
      const record = directory ? readBounded(path.join(directory, fileName), WORKSPACE_DIRECTORY_LIMITS.bytes) : undefined;
      if (!record) return { schemaVersion: 1, revision: 0, projects: [], forgotten: [] };
      const result = snapshotSchema.parse(JSON.parse(record.text));
      const ids = [...result.projects, ...result.forgotten].map(item => item.projectId);
      if (!result.revision || new Set(ids).size !== ids.length || result.projects.some(item => GlobalBrain.projectIdFor(item.root) !== item.projectId)) {
        throw unavailable();
      }
      return result;
    } catch { throw unavailable(); }
  }

  private async update(expectedRevision: number | undefined,
    change: (current: WorkspaceDirectorySnapshot) => WorkspaceDirectorySnapshot): Promise<WorkspaceDirectorySnapshot> {
    if (expectedRevision !== undefined && !revisionSchema.safeParse(expectedRevision).success) throw conflict();
    let lock: string | undefined;
    let fd: number | undefined;
    let owner: fs.BigIntStats | undefined;
    let temporary: string | undefined;
    try {
      const directory = this.checkedDirectory(true)!;
      lock = path.join(directory, lockName);
      const deadline = performance.now() + 1500;
      for (;;) {
        this.checkedDirectory(false);
        try { fd = fs.openSync(lock, 'wx', 0o600); break; }
        catch (error) {
          if (!['EEXIST', 'EACCES', 'EPERM', 'EBUSY'].includes(errno(error) ?? '')) throw unavailable();
          if (performance.now() >= deadline) throw conflict();
          if (errno(error) !== 'EEXIST' || !recoverLock(lock)) await delay(20);
        }
      }
      owner = fs.fstatSync(fd, { bigint: true });
      fs.writeFileSync(fd, JSON.stringify({ kind: 'workspace-directory-lock', pid: process.pid }));
      fs.fsyncSync(fd);
      const current = this.list();
      if (expectedRevision !== undefined && current.revision !== expectedRevision) throw conflict();
      const next = change(current);
      if (next === current) return current;
      if (current.revision >= maxRevision) throw limited();
      next.revision++;
      const result = snapshotSchema.safeParse(next);
      if (!result.success) throw limited();
      const data = JSON.stringify(result.data) + '\n';
      if (Buffer.byteLength(data) > WORKSPACE_DIRECTORY_LIMITS.bytes) throw limited();
      temporary = path.join(directory, 'workspace-directory.' + randomUUID() + '.tmp');
      this.checkedDirectory(false);
      const output = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(output, data); fs.fsyncSync(output); }
      finally { fs.closeSync(output); }
      this.checkedDirectory(false);
      fs.renameSync(temporary, path.join(directory, fileName));
      temporary = undefined;
      return result.data;
    } catch (error) { throw error instanceof WorkspaceDirectoryError ? error : unavailable(); }
    finally {
      if (fd !== undefined) fs.closeSync(fd);
      try {
        if (this.checkedDirectory(false)) {
          if (temporary) fs.unlinkSync(temporary);
          const latest = lock && fs.lstatSync(lock, { bigint: true, throwIfNoEntry: false });
          if (lock && owner && latest && matchesFileIdentity(lock, owner, latest)) fs.unlinkSync(lock);
        }
      } catch { /* Preserve the transaction result and never unlink a replacement lock. */ }
    }
  }

  async register(directory: string, source: WorkspaceDirectorySource, options: RegisterOptions = {}): Promise<WorkspaceDirectorySnapshot> {
    if (!sourceSchema.safeParse(source).success || (options.reenable !== undefined && typeof options.reenable !== 'boolean') ||
        (source !== 'operator' && (options.reenable || options.projectName !== undefined))) throw invalid();
    const root = verifiedWorkspaceRoot(directory);
    const projectId = GlobalBrain.projectIdFor(root);
    const name = displayNameSchema.safeParse(options.projectName ?? path.basename(root));
    if (!name.success) throw invalid();
    return this.update(options.expectedRevision, current => {
      const wasForgotten = current.forgotten.some(item => item.projectId === projectId);
      if (wasForgotten && !options.reenable) return current;
      const prior = current.projects.find(item => item.projectId === projectId);
      const lastOpenedAt = new Date(this.now()).toISOString();
      const projectName = options.projectName === undefined && prior ? prior.projectName : name.data;
      if (prior && prior.projectName === projectName && prior.lastSource === source && prior.lastOpenedAt === lastOpenedAt) return current;
      const projects = [{ projectId, projectName, root, lastOpenedAt, lastSource: source }, ...current.projects.filter(item => item.projectId !== projectId)]
        .slice(0, WORKSPACE_DIRECTORY_LIMITS.projects);
      return { ...current, projects, forgotten: current.forgotten.filter(item => item.projectId !== projectId) };
    });
  }

  async forget(projectId: string, expectedRevision?: number): Promise<WorkspaceDirectorySnapshot> {
    if (!projectIdSchema.safeParse(projectId).success) throw invalid();
    return this.update(expectedRevision, current => {
      if (current.forgotten.some(item => item.projectId === projectId)) return current;
      if (!current.projects.some(item => item.projectId === projectId)) throw new WorkspaceDirectoryError('WORKSPACE_DIRECTORY_NOT_FOUND', 'This project is not in the workspace directory.', 404);
      if (current.forgotten.length >= WORKSPACE_DIRECTORY_LIMITS.forgotten) throw limited();
      return { ...current, projects: current.projects.filter(item => item.projectId !== projectId),
        forgotten: [...current.forgotten, { projectId, forgottenAt: new Date(this.now()).toISOString() }] };
    });
  }

  async reenable(projectId: string, expectedRevision?: number): Promise<WorkspaceDirectorySnapshot> {
    if (!projectIdSchema.safeParse(projectId).success) throw invalid();
    return this.update(expectedRevision, current => {
      const forgotten = current.forgotten.filter(item => item.projectId !== projectId);
      return forgotten.length === current.forgotten.length ? current : { ...current, forgotten };
    });
  }
}
