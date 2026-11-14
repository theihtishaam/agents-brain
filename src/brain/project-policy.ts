import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { SessionRecord } from './project-session-contract.js';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';
import { matchesFileIdentity } from './file-identity.js';

const filename = '.shadow-brain/project-policy.json';
const lockKind = 'project-policy-lock';
const lockOwner = z.strictObject({ kind: z.literal(lockKind), pid: z.number().int().min(1).max(0x7fffffff) });
const maximumBytes = 128 * 1024;
const maximumOverrides = 512;
export const PROJECT_CONTEXT_LIMITS = Object.freeze({ maxTokens: 12_000, maxEntries: 30 });
const context = z.strictObject({ maxTokens: z.number().int().min(200).max(PROJECT_CONTEXT_LIMITS.maxTokens),
  maxEntries: z.number().int().min(1).max(PROJECT_CONTEXT_LIMITS.maxEntries) });
const label = z.string().regex(/^[a-z0-9][a-z0-9_. -]{0,63}$/u).refine(value => value.trim() === value);
const id = z.string().uuid();
const role = z.enum(['lead', 'worker', 'observer']);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const key = z.string().regex(/^(?:session|source|native):[0-9a-f-]{36,64}$/u);
const policy = z.strictObject({
  schemaVersion: z.literal(1), projectId: z.string().regex(/^[a-f0-9]{16}$/u), revision,
  updatedAt: z.iso.datetime().nullable(), context,
  tools: z.array(z.strictObject({ tool: label, enabled: z.boolean() })).max(maximumOverrides),
  chats: z.array(z.strictObject({ key, shareContext: z.boolean() })).max(maximumOverrides),
  roles: z.array(z.strictObject({ sessionId: id, role })).max(maximumOverrides),
});
const base = { expectedRevision: revision };
export const projectPolicyCommand = z.discriminatedUnion('kind', [
  z.strictObject({ ...base, kind: z.literal('set-context-limits'), context }),
  z.strictObject({ ...base, kind: z.literal('set-tool-participation'), tool: label, enabled: z.boolean() }),
  z.strictObject({ ...base, kind: z.literal('set-chat-sharing'), sessionId: id, shareContext: z.boolean() }),
  z.strictObject({ ...base, kind: z.literal('set-session-role'), sessionId: id, role: role.nullable() }),
]);
export type ProjectPolicy = z.infer<typeof policy>;
export type ProjectPolicyCommand = z.infer<typeof projectPolicyCommand>;
export type ProjectSessionRole = z.infer<typeof role>;
export class ProjectPolicyError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
const unavailable = () => new ProjectPolicyError('PROJECT_POLICY_UNAVAILABLE', 'Project controls are unreadable. Check the project policy file before continuing.', 503);
const conflict = () => new ProjectPolicyError('PROJECT_POLICY_CONFLICT', 'Project controls changed. Reload them and retry.', 409);
const duplicate = <T>(items: T[], identity: (entry: T) => string) => new Set(items.map(identity)).size !== items.length;

function reclaimAbandonedLock(filename: string): boolean {
  let fd: number | undefined;
  try {
    const before = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (!before?.isFile() || before.nlink !== 1n || before.size === 0n || before.size > 128n) return false;
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const owner = fs.fstatSync(fd, { bigint: true });
    if (!matchesFileIdentity(filename, owner, before)) return false;
    const bytes = Buffer.alloc(129);
    const count = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (BigInt(count) !== owner.size || count > 128) return false;
    const info = lockOwner.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count))));
    if (!info.success) return false;
    try { process.kill(info.data.pid, 0); return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return false; }
    fs.closeSync(fd);
    fd = undefined;
    const current = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    if (!matchesFileIdentity(filename, owner, current) || current?.mtimeNs !== owner.mtimeNs || current?.size !== owner.size) return false;
    fs.unlinkSync(filename);
    return true;
  } catch { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

export const toolPolicyLabel = (tool: string) => tool.toLowerCase().trim();
export function toolParticipates(snapshot: ProjectPolicy, tool: string): boolean {
  return snapshot.tools.find(item => item.tool === toolPolicyLabel(tool))?.enabled !== false;
}
export function nativeChatKey(tool: string, sessionId: string): string {
  return 'native:' + createHash('sha256').update(JSON.stringify([toolPolicyLabel(tool), sessionId])).digest('hex');
}
type SessionIdentity = Pick<SessionRecord, 'id' | 'native' | 'sourceId' | 'resumedFrom' | 'parentSessionId'>;
export function projectChatKey(session: SessionIdentity): string {
  if (session.native) return nativeChatKey(session.native.tool, session.native.sessionId);
  if (session.sourceId) return 'source:' + session.sourceId;
  return 'session:' + session.id;
}
export function disabledChatKeys(snapshot: ProjectPolicy): Set<string> {
  return new Set(snapshot.chats.filter(item => !item.shareContext).map(item => item.key));
}
export function hiddenChatSessions(snapshot: ProjectPolicy, sessions: readonly SessionIdentity[]): Set<string> {
  const keys = disabledChatKeys(snapshot);
  if (!keys.size) return new Set();
  const hidden = new Set(sessions.filter(item => keys.has(projectChatKey(item))).map(item => item.id));
  // A resumed child includes an ancestor checkpoint. Worker links without a handoff do not copy text.
  for (let changed = true; changed;) {
    changed = false;
    for (const item of sessions) if (item.resumedFrom && hidden.has(item.resumedFrom.sessionId) && !hidden.has(item.id)) {
      hidden.add(item.id);
      changed = true;
    }
  }
  return hidden;
}

export class ProjectPolicyStore {
  constructor(private readonly root: string, private readonly projectId: string) {}

  get(): ProjectPolicy {
    try {
      const file = projectLocalPath(this.root, filename);
      const info = fs.lstatSync(file, { bigint: true, throwIfNoEntry: false });
      if (!info) return { schemaVersion: 1, projectId: this.projectId, revision: 0, updatedAt: null,
        context: { ...PROJECT_CONTEXT_LIMITS }, tools: [], chats: [], roles: [] };
      if (!info.isFile() || info.nlink !== 1n || info.size > maximumBytes) throw unavailable();
      const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      let content: Buffer;
      try {
        const opened = fs.fstatSync(fd, { bigint: true });
        const latest = fs.lstatSync(file, { bigint: true, throwIfNoEntry: false });
        if (!opened.isFile() || opened.nlink !== 1n || opened.size > maximumBytes ||
            !matchesFileIdentity(file, opened, latest) || !matchesFileIdentity(file, info, latest)) throw unavailable();
        const expected = Number(opened.size);
        const buffer = Buffer.alloc(expected + 1);
        let length = 0;
        while (length < buffer.length) {
          const read = fs.readSync(fd, buffer, length, buffer.length - length, length);
          if (!read) break;
          length += read;
        }
        if (length !== expected) throw unavailable();
        content = buffer.subarray(0, expected);
      } finally { fs.closeSync(fd); }
      const data = policy.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)));
      if (data.projectId !== this.projectId || data.revision < 1 || !data.updatedAt ||
          duplicate(data.tools, item => item.tool) || duplicate(data.chats, item => item.key) ||
          duplicate(data.roles, item => item.sessionId)) throw unavailable();
      return data;
    } catch (error) {
      if (error instanceof ProjectPolicyError) throw error;
      throw unavailable();
    }
  }

  async update(input: ProjectPolicyCommand, session?: SessionIdentity): Promise<ProjectPolicy> {
    const parsed = projectPolicyCommand.safeParse(input);
    if (!parsed.success) throw new ProjectPolicyError('PROJECT_POLICY_INVALID', 'Send a valid project control change and current revision.', 400);
    const command = parsed.data;
    if ('sessionId' in command && session?.id !== command.sessionId) {
      throw new ProjectPolicyError('PROJECT_POLICY_SESSION_NOT_FOUND', 'Select a known project session.', 404);
    }
    const parent = ensureProjectDirectory(this.root, '.shadow-brain');
    const filename = projectLocalPath(this.root, '.shadow-brain/project-policy.json');
    const lock = projectLocalPath(this.root, '.shadow-brain/project-policy.lock');
    const deadline = performance.now() + 1200;
    let fd: number;
    for (;;) {
      try { fd = fs.openSync(lock, 'wx', 0o600); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw unavailable();
        if (performance.now() >= deadline) throw conflict();
        if (reclaimAbandonedLock(lock)) continue;
        await delay(20);
      }
    }
    let owner: fs.BigIntStats | undefined;
    let temporary: string | undefined;
    try {
      owner = fs.fstatSync(fd, { bigint: true });
      fs.writeFileSync(fd, JSON.stringify({ kind: lockKind, pid: process.pid }));
      fs.fsyncSync(fd);
      const current = this.get();
      if (command.expectedRevision !== current.revision) throw conflict();
      let next: ProjectPolicy = { ...current };
      if (command.kind === 'set-context-limits') next.context = command.context;
      else if (command.kind === 'set-tool-participation') next.tools = [
        ...current.tools.filter(item => item.tool !== command.tool), ...(!command.enabled ? [{ tool: command.tool, enabled: false }] : []),
      ].sort((a, b) => a.tool.localeCompare(b.tool));
      else if (command.kind === 'set-chat-sharing') {
        const key = projectChatKey(session!);
        next.chats = [...current.chats.filter(item => item.key !== key), ...(!command.shareContext ? [{ key, shareContext: false }] : [])]
          .sort((a, b) => a.key.localeCompare(b.key));
      } else next.roles = [...current.roles.filter(item => item.sessionId !== command.sessionId),
        ...(command.role ? [{ sessionId: command.sessionId, role: command.role }] : [])].sort((a, b) => a.sessionId.localeCompare(b.sessionId));
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      if (current.revision >= Number.MAX_SAFE_INTEGER - 1) throw conflict();
      const result = policy.safeParse({ ...next, revision: current.revision + 1, updatedAt: new Date().toISOString() });
      if (!result.success) throw new ProjectPolicyError('PROJECT_POLICY_LIMIT', 'This project reached its control limit.', 422);
      next = result.data;
      const payload = JSON.stringify(next);
      if (Buffer.byteLength(payload) + 1 > maximumBytes) throw new ProjectPolicyError('PROJECT_POLICY_LIMIT', 'This project reached its control limit.', 422);
      temporary = join(parent, 'project-policy.' + randomUUID() + '.tmp');
      const output = fs.openSync(temporary, 'wx', 0o600);
      try { fs.writeFileSync(output, payload + '\n'); fs.fsyncSync(output); } finally { fs.closeSync(output); }
      fs.renameSync(temporary, filename); temporary = undefined;
      return next;
    } catch (error) {
      if (error instanceof ProjectPolicyError) throw error;
      throw unavailable();
    } finally {
      try { if (temporary) fs.unlinkSync(temporary); } catch { /* Preserve the transaction failure. */ }
      fs.closeSync(fd);
      try {
        const latest = fs.lstatSync(lock, { bigint: true, throwIfNoEntry: false });
        if (owner && matchesFileIdentity(lock, owner, latest)) fs.unlinkSync(lock);
      } catch { /* Never remove a replacement lock. */ }
    }
  }
}
