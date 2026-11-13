import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { matchesFileIdentity } from './file-identity.js';

export const MEMORY_ANNOTATIONS_FILENAME = 'memory-annotations.json';
export const MEMORY_ANNOTATION_LIMITS = Object.freeze({
  reviews: 5000, links: 5000, history: 500, note: 1000, bytes: 16 * 1024 * 1024,
});
export const MEMORY_REVIEW_STATES = ['active', 'archived', 'contested'] as const;
export const MEMORY_RELATION_TYPES = ['related', 'supports', 'contradicts', 'supersedes'] as const;

export type MemoryReviewState = typeof MEMORY_REVIEW_STATES[number];
export type MemoryRelationType = typeof MEMORY_RELATION_TYPES[number];
export type EffectiveMemoryState = MemoryReviewState | 'superseded';

export interface MemoryReview {
  projectId: string;
  state: MemoryReviewState;
  note: string;
  updatedAt: string;
}

export interface MemoryRelation {
  id: string;
  projectId: string;
  fromId: string;
  toId: string;
  type: MemoryRelationType;
  note: string;
  createdAt: string;
}

export type MemoryAnnotationCommand =
  | { kind: 'review'; projectId: string; memoryId: string; state: MemoryReviewState; note?: string }
  | { kind: 'link'; projectId: string; fromId: string; toId: string; type: MemoryRelationType; note?: string }
  | { kind: 'unlink'; linkId: string };

export interface MemoryAnnotationEvent {
  revision: number;
  at: string;
  projectId: string;
  command: MemoryAnnotationCommand;
  relationId?: string;
  relation?: MemoryRelation;
  previousReview?: MemoryReview;
}

export interface MemoryAnnotationSnapshot {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  reviews: Record<string, MemoryReview>;
  links: MemoryRelation[];
  history: MemoryAnnotationEvent[];
}

type MemoryIdentity = { id: string; projectId: string };

export interface MemoryAnnotationsOptions {
  filePath?: string;
  lockTimeoutMs?: number;
  resolveMemory: (id: string) => MemoryIdentity | undefined;
}

export class MemoryAnnotationsError extends Error {
  constructor(
    readonly code: 'ANNOTATIONS_INVALID_COMMAND' | 'ANNOTATIONS_INVALID_STORE' | 'ANNOTATIONS_CONFLICT' |
      'ANNOTATIONS_NOT_FOUND' | 'ANNOTATIONS_LOCK_TIMEOUT' | 'ANNOTATIONS_LOCK_FAILED' |
      'ANNOTATIONS_READ_FAILED' | 'ANNOTATIONS_WRITE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'MemoryAnnotationsError';
  }
}

const LOCK_TIMEOUT = 3000;
const LOCK_POLL = 20;
const MAX_IDENTIFIER = 256;
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

function errno(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTIFIER &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && !FORBIDDEN_IDS.has(value);
}

function note(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MEMORY_ANNOTATION_LIMITS.note;
}

function instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function reviewState(value: unknown): value is MemoryReviewState {
  return MEMORY_REVIEW_STATES.some(state => state === value);
}

function relationType(value: unknown): value is MemoryRelationType {
  return MEMORY_RELATION_TYPES.some(type => type === value);
}

function keysOnly(input: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(input).every(key => allowed.includes(key));
}

function parseCommand(value: unknown): MemoryAnnotationCommand | undefined {
  if (!record(value)) return undefined;
  const raw = { ...value };
  if (raw.kind === 'unlink' && identifier(raw.linkId) && keysOnly(raw, ['kind', 'linkId'])) {
    return { kind: 'unlink', linkId: raw.linkId };
  }
  if (!identifier(raw.projectId) || (raw.note !== undefined && !note(raw.note))) return undefined;
  const reviewNote = typeof raw.note === 'string' ? raw.note.trim() : '';
  if (raw.kind === 'review' && identifier(raw.memoryId) && reviewState(raw.state) &&
      keysOnly(raw, ['kind', 'projectId', 'memoryId', 'state', 'note'])) {
    return { kind: 'review', projectId: raw.projectId, memoryId: raw.memoryId, state: raw.state, note: reviewNote };
  }
  if (raw.kind === 'link' && identifier(raw.fromId) && identifier(raw.toId) && relationType(raw.type) &&
      raw.fromId !== raw.toId && keysOnly(raw, ['kind', 'projectId', 'fromId', 'toId', 'type', 'note'])) {
    return {
      kind: 'link', projectId: raw.projectId, fromId: raw.fromId, toId: raw.toId,
      type: raw.type, note: reviewNote,
    };
  }
  return undefined;
}

function key(projectId: string, id: string): string {
  return JSON.stringify([projectId, id]);
}

function relationKey(link: Pick<MemoryRelation, 'projectId' | 'fromId' | 'toId' | 'type'>): string {
  const symmetric = link.type === 'related' || link.type === 'contradicts';
  const endpoints = symmetric ? [link.fromId, link.toId].sort() : [link.fromId, link.toId];
  return JSON.stringify([link.projectId, link.type, ...endpoints]);
}

function graphProblem(links: readonly MemoryRelation[]): string | undefined {
  const ids = new Set<string>();
  const relationKeys = new Set<string>();
  const replacementOf = new Map<string, string>();
  for (const link of links) {
    const relation = relationKey(link);
    if (ids.has(link.id) || relationKeys.has(relation)) return 'This memory relation already exists.';
    ids.add(link.id);
    relationKeys.add(relation);
    if (link.type !== 'supersedes') continue;
    const target = key(link.projectId, link.toId);
    if (replacementOf.has(target)) return 'This memory already has a replacement. Remove that relation first.';
    replacementOf.set(target, key(link.projectId, link.fromId));
  }
  const complete = new Set<string>();
  for (const start of replacementOf.keys()) {
    const seen = new Set<string>();
    for (let current: string | undefined = start; current !== undefined && !complete.has(current); current = replacementOf.get(current)) {
      if (seen.has(current)) return 'A supersession chain cannot contain a cycle.';
      seen.add(current);
    }
    for (const id of seen) complete.add(id);
  }
  return undefined;
}

function validReview(value: unknown): value is MemoryReview {
  return record(value) && keysOnly(value, ['projectId', 'state', 'note', 'updatedAt']) &&
    identifier(value.projectId) && reviewState(value.state) && note(value.note) && instant(value.updatedAt);
}

function validLink(value: unknown): value is MemoryRelation {
  return record(value) && keysOnly(value, ['id', 'projectId', 'fromId', 'toId', 'type', 'note', 'createdAt']) &&
    identifier(value.id) && identifier(value.projectId) &&
    identifier(value.fromId) && identifier(value.toId) && value.fromId !== value.toId &&
    relationType(value.type) && note(value.note) && instant(value.createdAt);
}

function validHistory(history: unknown, revision: number): history is MemoryAnnotationEvent[] {
  if (!Array.isArray(history) || history.length !== Math.min(revision, MEMORY_ANNOTATION_LIMITS.history)) return false;
  const first = revision - history.length + 1;
  return history.every((event, index) => {
    if (!record(event) || !keysOnly(event, ['revision', 'at', 'projectId', 'command', 'relationId', 'relation', 'previousReview']) ||
        event.revision !== first + index || !instant(event.at) || !identifier(event.projectId)) return false;
    const command = parseCommand(event.command);
    if (!command) return false;
    if (command.kind === 'review') {
      return command.projectId === event.projectId && event.relationId === undefined && event.relation === undefined &&
        (event.previousReview === undefined || (validReview(event.previousReview) && event.previousReview.projectId === event.projectId));
    }
    if (event.previousReview !== undefined || !validLink(event.relation) ||
        event.relation.id !== event.relationId || event.relation.projectId !== event.projectId) return false;
    if (command.kind === 'unlink') return event.relationId === command.linkId;
    return command.projectId === event.projectId && command.type === event.relation.type &&
      command.fromId === event.relation.fromId && command.toId === event.relation.toId;
  });
}

function emptySnapshot(): MemoryAnnotationSnapshot {
  return { schemaVersion: 1, revision: 0, updatedAt: null, reviews: {}, links: [], history: [] };
}

function parseSnapshot(raw: string): MemoryAnnotationSnapshot {
  try {
    const data: unknown = JSON.parse(raw);
    if (record(data) && keysOnly(data, ['schemaVersion', 'revision', 'updatedAt', 'reviews', 'links', 'history']) &&
        data.schemaVersion === 1 && typeof data.revision === 'number' &&
        Number.isSafeInteger(data.revision) && data.revision >= 1 && instant(data.updatedAt) &&
        record(data.reviews) && Object.keys(data.reviews).length <= MEMORY_ANNOTATION_LIMITS.reviews &&
        Object.entries(data.reviews).every(([id, review]) => identifier(id) && validReview(review)) &&
        Array.isArray(data.links) && data.links.length <= MEMORY_ANNOTATION_LIMITS.links &&
        data.links.every(validLink) && !graphProblem(data.links) && validHistory(data.history, data.revision) &&
        data.history[data.history.length - 1].at === data.updatedAt) {
      return {
        schemaVersion: 1, revision: data.revision, updatedAt: data.updatedAt,
        reviews: data.reviews as Record<string, MemoryReview>, links: data.links, history: data.history,
      };
    }
  } catch { /* Preserve store bytes and report the schema error without content. */ }
  throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_STORE', 'Memory annotations are malformed or use an unsupported schema.');
}

/** Use the latest review and replacement relation for the supplied project and memory. */
export function memoryState(snapshot: MemoryAnnotationSnapshot, projectId: string, memoryId: string): EffectiveMemoryState {
  if (snapshot.links.some(link => link.type === 'supersedes' && link.projectId === projectId && link.toId === memoryId)) {
    return 'superseded';
  }
  const review = snapshot.reviews[memoryId];
  return review?.projectId === projectId ? review.state : 'active';
}

/** Independent local curation state. The original memory store remains schema version 1. */
export class MemoryAnnotationsStore {
  readonly filePath: string;
  private readonly resolveMemory: MemoryAnnotationsOptions['resolveMemory'];
  private readonly lockTimeout: number;

  constructor(options: MemoryAnnotationsOptions) {
    this.filePath = path.resolve(options.filePath ?? path.join(os.homedir(), '.shadow-brain', MEMORY_ANNOTATIONS_FILENAME));
    this.resolveMemory = options.resolveMemory;
    this.lockTimeout = typeof options.lockTimeoutMs === 'number' && Number.isFinite(options.lockTimeoutMs)
      ? Math.max(0, Math.min(60_000, options.lockTimeoutMs))
      : LOCK_TIMEOUT;
  }

  get(): MemoryAnnotationSnapshot {
    let raw: string;
    try {
      const stat = fs.lstatSync(this.filePath, { throwIfNoEntry: false });
      if (!stat) return emptySnapshot();
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_STORE', 'Memory annotations must be a regular local file.');
      }
      if (stat.size > MEMORY_ANNOTATION_LIMITS.bytes) {
        throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_STORE', 'Memory annotation file exceeds its size limit.');
      }
      const fd = fs.openSync(this.filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        const current = fs.fstatSync(fd);
        if (!current.isFile() || current.nlink !== 1 || current.size > MEMORY_ANNOTATION_LIMITS.bytes) {
          throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_STORE', 'Memory annotation file changed or exceeds its size limit.');
        }
        raw = fs.readFileSync(fd, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      if (error instanceof MemoryAnnotationsError) throw error;
      throw new MemoryAnnotationsError('ANNOTATIONS_READ_FAILED', 'Could not read memory annotations.');
    }
    return parseSnapshot(raw);
  }

  async update(raw: unknown, expectedRevision?: number): Promise<MemoryAnnotationSnapshot> {
    const command = parseCommand(raw);
    if (!command || (expectedRevision !== undefined &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))) {
      throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_COMMAND', 'Invalid memory annotation command or revision.');
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {
      throw new MemoryAnnotationsError('ANNOTATIONS_WRITE_FAILED', 'Could not open the memory annotation directory.');
    }
    const release = await this.acquireLock();
    try {
      const snapshot = this.get();
      if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) {
        throw new MemoryAnnotationsError('ANNOTATIONS_CONFLICT', 'Memory annotations changed. Refresh and retry the update.');
      }
      if (snapshot.revision === Number.MAX_SAFE_INTEGER) {
        throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_STORE', 'Memory annotation revision has reached its limit.');
      }
      const at = new Date().toISOString();
      const revision = snapshot.revision + 1;
      const event = this.apply(snapshot, command, revision, at);
      snapshot.revision = revision;
      snapshot.updatedAt = at;
      snapshot.history = [...snapshot.history, event].slice(-MEMORY_ANNOTATION_LIMITS.history);
      this.replace(snapshot);
      return snapshot;
    } finally {
      release();
    }
  }

  private requireMemory(id: string, projectId: string): void {
    const memory = this.resolveMemory(id);
    if (memory?.id !== id || memory.projectId !== projectId) {
      throw new MemoryAnnotationsError('ANNOTATIONS_NOT_FOUND', 'Memory was not found in the selected project.');
    }
  }

  private apply(snapshot: MemoryAnnotationSnapshot, command: MemoryAnnotationCommand, revision: number, at: string): MemoryAnnotationEvent {
    if (command.kind === 'unlink') {
      const index = snapshot.links.findIndex(link => link.id === command.linkId);
      if (index < 0) throw new MemoryAnnotationsError('ANNOTATIONS_NOT_FOUND', 'Memory relation was not found.');
      const [removed] = snapshot.links.splice(index, 1);
      return { command, revision, at, projectId: removed.projectId, relationId: removed.id, relation: removed };
    }
    const { projectId } = command;
    if (command.kind === 'review') {
      this.requireMemory(command.memoryId, projectId);
      const previous = snapshot.reviews[command.memoryId];
      if (previous && previous.projectId !== projectId) {
        throw new MemoryAnnotationsError('ANNOTATIONS_CONFLICT', 'Memory identity no longer matches its recorded project.');
      }
      if (!previous && Object.keys(snapshot.reviews).length >= MEMORY_ANNOTATION_LIMITS.reviews) {
        throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_COMMAND', 'Memory review storage limit reached.');
      }
      snapshot.reviews[command.memoryId] = { projectId, state: command.state, note: command.note ?? '', updatedAt: at };
      return { command, revision, at, projectId, ...(previous ? { previousReview: previous } : {}) };
    }

    this.requireMemory(command.fromId, projectId);
    this.requireMemory(command.toId, projectId);
    if (snapshot.links.length >= MEMORY_ANNOTATION_LIMITS.links) {
      throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_COMMAND', 'Memory relation storage limit reached.');
    }
    const relation: MemoryRelation = {
      id: randomUUID(), projectId, fromId: command.fromId, toId: command.toId,
      type: command.type, note: command.note ?? '', createdAt: at,
    };
    snapshot.links.push(relation);
    const problem = graphProblem(snapshot.links);
    if (problem) throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_COMMAND', problem);
    return { command, revision, at, projectId, relationId: relation.id, relation };
  }

  private async acquireLock(): Promise<() => void> {
    const lock = this.filePath + '.lock';
    const deadline = performance.now() + this.lockTimeout;
    for (;;) {
      let fd: number;
      try {
        fd = fs.openSync(lock, 'wx', 0o600);
      } catch (error) {
        if (errno(error) !== 'EEXIST') throw new MemoryAnnotationsError('ANNOTATIONS_LOCK_FAILED', 'Could not acquire the memory annotation lock.');
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        await delay(Math.min(remaining, LOCK_POLL));
        if (performance.now() >= deadline) break;
        continue;
      }

      let owner: fs.BigIntStats | undefined;
      try {
        owner = fs.fstatSync(fd, { bigint: true });
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() }));
        fs.closeSync(fd);
      } catch {
        try { fs.closeSync(fd); } catch { /* retain the original lock failure */ }
        try { if (owner) this.unlinkOwnedLock(lock, owner); } catch { /* preserve an unfamiliar lock */ }
        throw new MemoryAnnotationsError('ANNOTATIONS_LOCK_FAILED', 'Could not initialize the memory annotation lock.');
      }
      const owned = owner;
      return () => this.unlinkOwnedLock(lock, owned);
    }
    throw new MemoryAnnotationsError('ANNOTATIONS_LOCK_TIMEOUT', 'Timed out waiting for the memory annotation lock.');
  }

  private unlinkOwnedLock(lock: string, owner: fs.BigIntStats): void {
    try {
      const current = fs.lstatSync(lock, { bigint: true, throwIfNoEntry: false });
      if (!matchesFileIdentity(lock, owner, current)) throw new Error('Lock ownership changed.');
      fs.unlinkSync(lock);
    } catch {
      throw new MemoryAnnotationsError('ANNOTATIONS_LOCK_FAILED', 'Could not release the memory annotation lock.');
    }
  }

  private replace(snapshot: MemoryAnnotationSnapshot): void {
    const payload = JSON.stringify(snapshot, null, 2) + '\n';
    if (Buffer.byteLength(payload) > MEMORY_ANNOTATION_LIMITS.bytes) {
      throw new MemoryAnnotationsError('ANNOTATIONS_INVALID_COMMAND', 'Memory annotation storage limit reached.');
    }
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    let created = false;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      created = true;
      try {
        fs.writeFileSync(fd, payload);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, this.filePath);
      created = false;
    } catch {
      throw new MemoryAnnotationsError('ANNOTATIONS_WRITE_FAILED', 'Could not save memory annotations.');
    } finally {
      if (created) {
        try { fs.unlinkSync(temporary); } catch { /* retain the original write failure */ }
      }
    }
  }
}

export function memoryAnnotationsFor(brain: { dbPath: string; getEntry(id: string): MemoryIdentity | undefined }): MemoryAnnotationsStore {
  return new MemoryAnnotationsStore({
    filePath: path.join(path.dirname(brain.dbPath), MEMORY_ANNOTATIONS_FILENAME),
    resolveMemory: id => brain.getEntry(id),
  });
}
