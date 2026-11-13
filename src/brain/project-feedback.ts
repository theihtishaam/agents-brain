import * as fs from 'node:fs';
import { matchesFileIdentity } from './file-identity.js';
import { randomUUID } from 'node:crypto';
import { GlobalBrain } from './global-brain.js';
import { adaptiveQueryKeywords } from './context-retrieval.js';
import { requireMemoryIdentifier } from './memory-inspection.js';
import { ensureProjectDirectory, projectLocalPath, projectRoot, readProjectFile } from './project-kit-paths.js';

export type FeedbackReporter = 'user' | 'agent';
export type ProjectFeedbackRating = 'useful' | 'not-useful' | 'incorrect';
export interface ProjectFeedbackRecord {
  id: string;
  projectId: string;
  memoryId: string;
  task: string;
  rating: ProjectFeedbackRating;
  reason: string;
  evidence: string[];
  reporter: FeedbackReporter;
  createdAt: string;
  updatedAt: string;
}
export interface ProjectFeedbackSnapshot {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  enabled: boolean;
  records: ProjectFeedbackRecord[];
}
export type ProjectFeedbackCommand =
  | { kind: 'upsert'; memoryId: string; task: string; rating: ProjectFeedbackRating; reason: string; evidence?: string[] }
  | { kind: 'remove'; id: string }
  | { kind: 'toggle'; enabled: boolean };
export interface ProjectFeedbackInfluence {
  adjustment: number;
  recordIds: string[];
  reporterKinds: FeedbackReporter[];
}
type FeedbackCode = 'PROJECT_FEEDBACK_CONFLICT' | 'PROJECT_FEEDBACK_NOT_FOUND' | 'PROJECT_FEEDBACK_INVALID_STORE' | 'PROJECT_FEEDBACK_WRITE_FAILED';

export class ProjectFeedbackError extends Error {
  constructor(readonly code: FeedbackCode, message: string) {
    super(message);
    this.name = 'ProjectFeedbackError';
  }
}

const FILENAME = '.shadow-brain/memory-feedback.json';
const LOCKFILE = '.shadow-brain/memory-feedback.lock';
const MAX_RECORDS = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_TASK = 1000;
const MAX_REASON = 600;
const MAX_EVIDENCE = 3;
const MAX_EVIDENCE_CHARS = 180;
const RATINGS: Record<ProjectFeedbackRating, number> = { useful: 0.08, 'not-useful': -0.04, incorrect: -0.12 };
const GENERIC_TASK_TERMS = new Set([
  'add', 'analyze', 'build', 'check', 'debug', 'edit', 'explain', 'find', 'fix', 'implement', 'inspect',
  'investigate', 'look', 'make', 'modify', 'please', 'repair', 'research', 'review', 'show', 'test', 'trace',
  'understand', 'update', 'verify', 'work',
]);

function isReporter(value: unknown): value is FeedbackReporter {
  return value === 'user' || value === 'agent';
}

function rating(value: unknown): value is ProjectFeedbackRating {
  return typeof value === 'string' && Object.hasOwn(RATINGS, value);
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new TypeError(label + ' must be nonempty text of at most ' + max + ' characters.');
  }
  const normalized = value.replace(/\s+/gu, ' ').trim();
  if (!normalized) throw new TypeError(label + ' must be nonempty text.');
  return normalized;
}

function references(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_EVIDENCE) throw new TypeError('Provide up to three evidence references.');
  return [...new Set(value.map(item => text(item, MAX_EVIDENCE_CHARS, 'Evidence reference')))];
}

function normalizedTask(task: string): string {
  return task.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLowerCase();
}

function recordKey(memoryId: string, task: string, reporter: FeedbackReporter): string {
  return JSON.stringify([memoryId, normalizedTask(task), reporter]);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Feedback must be an object.');
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new TypeError('Unknown feedback field.');
}

function parseRecord(input: unknown, projectId: string): ProjectFeedbackRecord {
  const entry = object(input);
  fields(entry, ['id', 'projectId', 'memoryId', 'task', 'rating', 'reason', 'evidence', 'reporter', 'createdAt', 'updatedAt']);
  requireMemoryIdentifier(entry.id, 'feedback id');
  requireMemoryIdentifier(entry.memoryId, 'memoryId');
  if (entry.projectId !== projectId || !rating(entry.rating) || !isReporter(entry.reporter) ||
      !isDate(entry.createdAt) || !isDate(entry.updatedAt) || entry.createdAt > entry.updatedAt || !Array.isArray(entry.evidence)) {
    throw new TypeError('Invalid project feedback record.');
  }
  return {
    id: entry.id, projectId, memoryId: entry.memoryId, task: text(entry.task, MAX_TASK, 'Task'), rating: entry.rating,
    reason: text(entry.reason, MAX_REASON, 'Reason'), evidence: references(entry.evidence), reporter: entry.reporter,
    createdAt: entry.createdAt, updatedAt: entry.updatedAt,
  };
}

function parseSnapshot(bytes: Buffer, projectId: string): ProjectFeedbackSnapshot {
  const snapshot = object(JSON.parse(bytes.toString('utf8')));
  fields(snapshot, ['schemaVersion', 'revision', 'updatedAt', 'enabled', 'records']);
  if (snapshot.schemaVersion !== 1 || typeof snapshot.revision !== 'number' || !Number.isSafeInteger(snapshot.revision) ||
      snapshot.revision < 1 || !isDate(snapshot.updatedAt) || typeof snapshot.enabled !== 'boolean' ||
      !Array.isArray(snapshot.records) || snapshot.records.length > MAX_RECORDS) throw new TypeError('Invalid project feedback snapshot.');
  const records = snapshot.records.map(record => parseRecord(record, projectId));
  const ids = new Set(records.map(record => record.id));
  const keys = new Set(records.map(record => recordKey(record.memoryId, record.task, record.reporter)));
  if (ids.size !== records.length || keys.size !== records.length || records.some(record => record.updatedAt > (snapshot.updatedAt as string))) {
    throw new TypeError('Invalid project feedback record sequence.');
  }
  return { schemaVersion: 1, revision: snapshot.revision, updatedAt: snapshot.updatedAt, enabled: snapshot.enabled, records };
}

function parseCommand(input: unknown, reporter: FeedbackReporter): ProjectFeedbackCommand {
  const command = object(input);
  if (!isReporter(reporter)) throw new TypeError('Feedback reporter must be assigned by the caller.');
  if (command.kind === 'upsert') {
    fields(command, ['kind', 'memoryId', 'task', 'rating', 'reason', 'evidence']);
    requireMemoryIdentifier(command.memoryId, 'memoryId');
    if (!rating(command.rating)) throw new TypeError('Choose useful, not-useful, or incorrect.');
    return { kind: 'upsert', memoryId: command.memoryId, task: text(command.task, MAX_TASK, 'Task'),
      rating: command.rating, reason: text(command.reason, MAX_REASON, 'Reason'), evidence: references(command.evidence) };
  }
  if (reporter !== 'user') throw new TypeError('Agent feedback can only add or update an observed outcome.');
  if (command.kind === 'remove') {
    fields(command, ['kind', 'id']);
    requireMemoryIdentifier(command.id, 'feedback id');
    return { kind: 'remove', id: command.id };
  }
  if (command.kind === 'toggle') {
    fields(command, ['kind', 'enabled']);
    if (typeof command.enabled !== 'boolean') throw new TypeError('Feedback enabled must be a boolean.');
    return { kind: 'toggle', enabled: command.enabled };
  }
  throw new TypeError('Unknown feedback operation.');
}

/** Small, project-local sidecar for reported memory outcomes. */
export class ProjectFeedbackStore {
  readonly root: string;
  readonly projectId: string;
  readonly filePath: string;

  constructor(root: string, private readonly brain: Pick<GlobalBrain, 'getEntry'>) {
    this.root = projectRoot(root);
    this.projectId = GlobalBrain.projectIdFor(this.root);
    this.filePath = projectLocalPath(this.root, FILENAME);
  }

  get(): ProjectFeedbackSnapshot {
    try {
      const bytes = readProjectFile(this.root, FILENAME, MAX_BYTES);
      return bytes ? parseSnapshot(bytes, this.projectId) : { schemaVersion: 1, revision: 0, updatedAt: null, enabled: true, records: [] };
    } catch {
      throw new ProjectFeedbackError('PROJECT_FEEDBACK_INVALID_STORE', 'Project feedback must be a regular, bounded schema-1 file for this project.');
    }
  }

  private checkRevision(snapshot: ProjectFeedbackSnapshot, expected: number): void {
    if (snapshot.revision !== expected) throw new ProjectFeedbackError('PROJECT_FEEDBACK_CONFLICT', 'Project feedback changed. Refresh and retry.');
    if (snapshot.revision === Number.MAX_SAFE_INTEGER) throw new ProjectFeedbackError('PROJECT_FEEDBACK_INVALID_STORE', 'Feedback revision reached its limit.');
  }

  private checkMemory(command: ProjectFeedbackCommand): void {
    if (command.kind === 'upsert' && this.brain.getEntry(command.memoryId)?.projectId !== this.projectId) {
      throw new ProjectFeedbackError('PROJECT_FEEDBACK_NOT_FOUND', 'Memory was not found in the selected project.');
    }
  }

  async update(command: ProjectFeedbackCommand, expectedRevision: number, reporter: FeedbackReporter): Promise<ProjectFeedbackSnapshot> {
    const input = parseCommand(command, reporter);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new TypeError('A current feedback revision is required.');
    this.checkMemory(input);
    this.checkRevision(this.get(), expectedRevision);
    ensureProjectDirectory(this.root, '.shadow-brain');
    const lock = projectLocalPath(this.root, LOCKFILE);
    let fd: number;
    try { fd = fs.openSync(lock, 'wx', 0o600); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ProjectFeedbackError('PROJECT_FEEDBACK_CONFLICT', 'A project feedback write is in progress.');
      throw new ProjectFeedbackError('PROJECT_FEEDBACK_WRITE_FAILED', 'Could not acquire the project feedback lock.');
    }
    const owner = fs.fstatSync(fd, { bigint: true });
    try {
      const snapshot = this.get();
      this.checkRevision(snapshot, expectedRevision);
      this.checkMemory(input);
      if (input.kind === 'toggle' && snapshot.enabled === input.enabled) return snapshot;
      const now = new Date().toISOString();
      const at = snapshot.updatedAt && snapshot.updatedAt > now ? snapshot.updatedAt : now;
      if (input.kind === 'toggle') snapshot.enabled = input.enabled;
      else if (input.kind === 'remove') {
        const index = snapshot.records.findIndex(record => record.id === input.id);
        if (index < 0) throw new ProjectFeedbackError('PROJECT_FEEDBACK_NOT_FOUND', 'Feedback record was not found in the selected project.');
        snapshot.records.splice(index, 1);
      } else {
        const { memoryId, task, rating: outcome, reason, evidence = [] } = input;
        const key = recordKey(memoryId, task, reporter);
        const index = snapshot.records.findIndex(record => recordKey(record.memoryId, record.task, record.reporter) === key);
        if (index < 0 && snapshot.records.length >= MAX_RECORDS) {
          throw new ProjectFeedbackError('PROJECT_FEEDBACK_CONFLICT', 'Feedback has reached 500 records. Remove a record before adding another task outcome.');
        }
        const previous = index < 0 ? undefined : snapshot.records.splice(index, 1)[0];
        snapshot.records.push({ id: previous?.id ?? randomUUID(), projectId: this.projectId, memoryId, task, rating: outcome, reason, evidence,
          reporter, createdAt: previous?.createdAt ?? at, updatedAt: at });
      }
      snapshot.updatedAt = at;
      snapshot.revision++;
      this.replace(snapshot);
      return snapshot;
    } finally {
      fs.closeSync(fd);
      const current = fs.lstatSync(lock, { throwIfNoEntry: false, bigint: true });
      if (matchesFileIdentity(lock, owner, current)) fs.unlinkSync(lock);
    }
  }

  private replace(snapshot: ProjectFeedbackSnapshot): void {
    const payload = JSON.stringify(snapshot) + '\n';
    if (Buffer.byteLength(payload) > MAX_BYTES) throw new ProjectFeedbackError('PROJECT_FEEDBACK_WRITE_FAILED', 'Project feedback exceeds its file limit.');
    const filename = projectLocalPath(this.root, FILENAME);
    const temporary = filename + '.' + randomUUID() + '.tmp';
    let created = false;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      created = true;
      try { fs.writeFileSync(fd, payload); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      projectLocalPath(this.root, FILENAME);
      if (snapshot.revision === 1) fs.linkSync(temporary, filename);
      else fs.renameSync(temporary, filename);
    } catch {
      throw new ProjectFeedbackError('PROJECT_FEEDBACK_WRITE_FAILED', 'Could not save project feedback.');
    } finally {
      if (created) {
        try { fs.unlinkSync(temporary); } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }
}

function substantiveTerms(terms: readonly string[]): Set<string> {
  return new Set(terms.filter(term => !GENERIC_TASK_TERMS.has(term)));
}

function similarity(left: Set<string>, right: Set<string>): number {
  const overlap = [...left].filter(term => right.has(term)).length;
  return overlap / (left.size + right.size - overlap);
}

/** Compute task-local signals. Retrieval applies them only to already matched, eligible candidates. */
export function projectFeedbackInfluence(
  snapshot: ProjectFeedbackSnapshot | undefined, projectId: string, queryTerms: readonly string[],
): ReadonlyMap<string, ProjectFeedbackInfluence> {
  const influences = new Map<string, ProjectFeedbackInfluence>();
  const query = substantiveTerms(queryTerms);
  if (snapshot?.enabled !== true || !query.size) return influences;
  const eligible = new Map<string, Array<{ task: string; record: ProjectFeedbackRecord; similarity: number }>>();
  const recent = [...snapshot.records].reverse().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter(record => record.projectId === projectId && rating(record.rating) && isReporter(record.reporter));
  const userReports = new Map(recent.filter(record => record.reporter === 'user')
    .map(record => [JSON.stringify([record.memoryId, normalizedTask(record.task)]), record]));
  for (const record of recent) {
    const group = eligible.get(record.memoryId) ?? [];
    if (group.length >= 3) continue;
    const task = normalizedTask(record.task);
    if (group.some(item => item.task === task)) continue;
    const match = similarity(query, substantiveTerms(adaptiveQueryKeywords(record.task)));
    if (match < 0.34) continue;
    const userReport = userReports.get(JSON.stringify([record.memoryId, task]));
    group.push({ task, record: userReport ?? record, similarity: match });
    eligible.set(record.memoryId, group);
  }
  for (const [memoryId, group] of eligible) {
    const mean = group.reduce((sum, item) => sum + RATINGS[item.record.rating] * item.similarity * (item.record.reporter === 'agent' ? 0.5 : 1), 0) / group.length;
    influences.set(memoryId, { adjustment: Math.round(Math.max(-0.12, Math.min(0.08, mean)) * 1000) / 1000,
      recordIds: group.map(item => item.record.id), reporterKinds: [...new Set(group.map(item => item.record.reporter))] });
  }
  return influences;
}
