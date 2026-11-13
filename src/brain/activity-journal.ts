import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { matchesFileIdentity } from './file-identity.js';

export const ACTIVITY_JOURNAL_FILENAME = 'activity-journal.json';
export const ACTIVITY_JOURNAL_LIMITS = Object.freeze({ retained: 500, page: 200, bytes: 1024 * 1024 });

const KINDS = ['session-start', 'phase', 'tool-start', 'tool-end', 'session-end'] as const;
const SOURCES = ['measured', 'reported'] as const;
const TRANSPORTS = ['mcp', 'cli', 'host'] as const;
const PHASES = ['understand', 'plan', 'work', 'verify'] as const;
const OUTCOMES = ['success', 'error', 'cancelled'] as const;

export interface ActivityEventInput {
  kind: typeof KINDS[number];
  source: typeof SOURCES[number];
  transport: typeof TRANSPORTS[number];
  projectId?: string;
  sessionId?: string;
  agent?: string;
  phase?: typeof PHASES[number];
  tool?: string;
  correlationId?: string;
  outcome?: typeof OUTCOMES[number];
  durationMs?: number;
}

export interface ActivityJournalEvent extends ActivityEventInput {
  id: string;
  sequence: number;
  timestamp: string;
}

export interface ActivityJournalSnapshot {
  schemaVersion: 1;
  journalId: string | null;
  revision: number;
  nextSequence: number;
  events: ActivityJournalEvent[];
}

export interface ActivityJournalReadOptions {
  afterSequence?: number;
  journalId?: string;
  limit?: number;
  projectId?: string;
}

export interface ActivityJournalPage {
  journalId: string | null;
  revision: number;
  oldestSequence: number | null;
  latestSequence: number;
  nextAfterSequence: number;
  hasMore: boolean;
  gap: boolean;
  reset: boolean;
  /** Retention counts describe the journal, including when the page filters by project. */
  retainedCount: number;
  droppedCount: number;
  events: ActivityJournalEvent[];
}

export interface ActivityJournalOptions {
  filePath?: string;
  lockTimeoutMs?: number;
}

export class ActivityJournalError extends Error {
  constructor(
    readonly code: 'ACTIVITY_JOURNAL_INVALID_EVENT' | 'ACTIVITY_JOURNAL_INVALID_CURSOR' | 'ACTIVITY_JOURNAL_INVALID_STORE' |
      'ACTIVITY_JOURNAL_READ_FAILED' | 'ACTIVITY_JOURNAL_LOCK_TIMEOUT' | 'ACTIVITY_JOURNAL_LOCK_FAILED' | 'ACTIVITY_JOURNAL_WRITE_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'ActivityJournalError';
  }
}

const INPUT_KEYS = new Set([
  'kind', 'source', 'transport', 'projectId', 'sessionId', 'agent', 'phase', 'tool', 'correlationId', 'outcome', 'durationMs',
]);
const SNAPSHOT_KEYS = new Set(['schemaVersion', 'journalId', 'revision', 'nextSequence', 'events']);
const LOCK_TIMEOUT_MS = 3000;
const LOCK_POLL_MS = 20;
// Windows can report a sharing error while the previous owner removes the
// exclusive lock. A persistent permission error still fails at the deadline.
const RETRYABLE_LOCK_OPEN = new Set(['EEXIST', 'EACCES', 'EPERM', 'EBUSY', 'ENOENT']);
const DEFAULT_PAGE_SIZE = 100;
const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function errno(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function member<T extends string>(values: readonly T[], value: unknown): value is T {
  return values.some(item => item === value);
}

function label(value: unknown, max = 128): value is string {
  return typeof value === 'string' && value.length <= max && SAFE_LABEL.test(value);
}

function instant(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function eventInput(value: unknown): ActivityEventInput | undefined {
  if (!isRecord(value)) return undefined;
  const input = { ...value };
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !INPUT_KEYS.has(key)) ||
      !member(KINDS, input.kind) || !member(SOURCES, input.source) || !member(TRANSPORTS, input.transport) ||
      (input.projectId !== undefined && !label(input.projectId)) ||
      (input.sessionId !== undefined && !label(input.sessionId)) ||
      (input.agent !== undefined && !label(input.agent, 64)) ||
      (input.outcome !== undefined && !member(OUTCOMES, input.outcome))) return undefined;

  const { kind, source, transport, phase, tool, correlationId, outcome, durationMs } = input;
  if ((source === 'reported') !== (transport === 'host')) return undefined;
  if (kind === 'tool-start' || kind === 'tool-end') {
    if (phase !== undefined || !label(tool, 64) || !label(correlationId)) return undefined;
    if (kind === 'tool-start' && (outcome !== undefined || durationMs !== undefined)) return undefined;
    if (kind === 'tool-end' && (outcome === undefined || typeof durationMs !== 'number' ||
        !Number.isFinite(durationMs) || durationMs < 0 || durationMs > Number.MAX_SAFE_INTEGER)) return undefined;
  } else {
    if (tool !== undefined || correlationId !== undefined || durationMs !== undefined ||
        (kind !== 'session-end' && outcome !== undefined)) return undefined;
    if (kind === 'phase' ? source !== 'reported' || !member(PHASES, phase) : phase !== undefined) return undefined;
  }
  return input as unknown as ActivityEventInput;
}

function emptySnapshot(): ActivityJournalSnapshot {
  return { schemaVersion: 1, journalId: null, revision: 0, nextSequence: 1, events: [] };
}

function parseSnapshot(raw: string): ActivityJournalSnapshot {
  try {
    const data: unknown = JSON.parse(raw);
    if (isRecord(data) && Object.keys(data).every(key => SNAPSHOT_KEYS.has(key)) && data.schemaVersion === 1 &&
        typeof data.journalId === 'string' && UUID.test(data.journalId) && typeof data.revision === 'number' &&
        Number.isSafeInteger(data.revision) && data.revision >= 1 && data.revision < Number.MAX_SAFE_INTEGER &&
        data.nextSequence === data.revision + 1 && Array.isArray(data.events) &&
        data.events.length === Math.min(data.revision, ACTIVITY_JOURNAL_LIMITS.retained)) {
      const first = data.revision - data.events.length + 1;
      const ids = new Set<string>();
      const events: ActivityJournalEvent[] = [];
      for (const value of data.events) {
        if (!isRecord(value)) break;
        const { id, sequence, timestamp, ...input } = value;
        const validated = eventInput(input);
        if (typeof id !== 'string' || !UUID.test(id) || ids.has(id) || sequence !== first + events.length ||
            !instant(timestamp) || !validated) break;
        ids.add(id);
        events.push({ ...validated, id, sequence, timestamp });
      }
      if (events.length === data.events.length) {
        return { schemaVersion: 1, journalId: data.journalId, revision: data.revision, nextSequence: data.nextSequence, events };
      }
    }
  } catch { /* Surface invalid storage without echoing its bytes. */ }
  throw new ActivityJournalError('ACTIVITY_JOURNAL_INVALID_STORE', 'Activity journal is malformed or uses an unsupported schema.');
}

/** Local metadata journal shared by cooperating service processes. */
export class ActivityJournal {
  readonly filePath: string;
  private readonly lockTimeoutMs: number;

  constructor(options: ActivityJournalOptions = {}) {
    this.filePath = path.resolve(options.filePath ?? path.join(os.homedir(), '.shadow-brain', ACTIVITY_JOURNAL_FILENAME));
    this.lockTimeoutMs = typeof options.lockTimeoutMs === 'number' && Number.isFinite(options.lockTimeoutMs)
      ? Math.max(0, Math.min(60_000, options.lockTimeoutMs))
      : LOCK_TIMEOUT_MS;
  }

  get(): ActivityJournalSnapshot {
    let raw: string;
    try {
      const stat = fs.lstatSync(this.filePath, { throwIfNoEntry: false });
      if (!stat) return emptySnapshot();
      this.checkFile(stat);
      const fd = fs.openSync(this.filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
      try {
        this.checkFile(fs.fstatSync(fd));
        raw = fs.readFileSync(fd, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (error) {
      if (error instanceof ActivityJournalError) throw error;
      throw new ActivityJournalError('ACTIVITY_JOURNAL_READ_FAILED', 'Could not read the activity journal.');
    }
    return parseSnapshot(raw);
  }

  read(options: ActivityJournalReadOptions = {}): ActivityJournalPage {
    const { afterSequence, journalId, limit = DEFAULT_PAGE_SIZE, projectId } = options;
    if ((afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || afterSequence < 0)) ||
        (journalId !== undefined && (typeof journalId !== 'string' || !UUID.test(journalId))) ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > ACTIVITY_JOURNAL_LIMITS.page ||
        (projectId !== undefined && !label(projectId))) {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_INVALID_CURSOR', 'Invalid activity journal cursor, project, or page size.');
    }
    const snapshot = this.get();
    const oldestSequence = snapshot.events[0]?.sequence ?? null;
    const latestSequence = snapshot.nextSequence - 1;
    const reset = (journalId !== undefined && journalId !== snapshot.journalId) ||
      (afterSequence !== undefined && afterSequence > latestSequence);
    const gap = !reset && afterSequence !== undefined && oldestSequence !== null && afterSequence < oldestSequence - 1;
    const eligible = projectId === undefined ? snapshot.events : snapshot.events.filter(event => event.projectId === projectId);
    const newer = reset || afterSequence === undefined ? null : eligible.filter(event => event.sequence > afterSequence);
    const events = newer ? newer.slice(0, limit) : eligible.slice(-limit);
    const hasMore = !!newer && newer.length > events.length;
    return {
      journalId: snapshot.journalId,
      revision: snapshot.revision,
      oldestSequence,
      latestSequence,
      nextAfterSequence: hasMore ? events[events.length - 1].sequence : latestSequence,
      hasMore,
      gap,
      reset,
      retainedCount: snapshot.events.length,
      droppedCount: latestSequence - snapshot.events.length,
      events,
    };
  }

  async append(raw: unknown): Promise<ActivityJournalEvent> {
    const input = eventInput(raw);
    if (!input) {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_INVALID_EVENT', 'Invalid activity event. Use only defined metadata fields.');
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_WRITE_FAILED', 'Could not open the activity journal directory.');
    }

    const release = await this.acquireLock();
    try {
      const latest = this.get();
      if (latest.nextSequence >= Number.MAX_SAFE_INTEGER) {
        throw new ActivityJournalError('ACTIVITY_JOURNAL_INVALID_STORE', 'Activity journal sequence has reached its limit.');
      }
      const event: ActivityJournalEvent = {
        ...input, id: randomUUID(), sequence: latest.nextSequence, timestamp: new Date().toISOString(),
      };
      this.replace({
        schemaVersion: 1,
        journalId: latest.journalId ?? randomUUID(),
        revision: latest.revision + 1,
        nextSequence: event.sequence + 1,
        events: [...latest.events, event].slice(-ACTIVITY_JOURNAL_LIMITS.retained),
      });
      return event;
    } finally {
      release();
    }
  }

  private checkFile(stat: fs.Stats): void {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > ACTIVITY_JOURNAL_LIMITS.bytes) {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_INVALID_STORE', 'Activity journal must be a regular local file within its size limit.');
    }
  }

  private async acquireLock(): Promise<() => void> {
    const lock = this.filePath + '.lock';
    const deadline = performance.now() + this.lockTimeoutMs;
    let lastCode: string | undefined;
    for (;;) {
      let fd: number;
      try {
        fd = fs.openSync(lock, 'wx', 0o600);
      } catch (error) {
        lastCode = errno(error);
        if (!lastCode || !RETRYABLE_LOCK_OPEN.has(lastCode)) {
          throw new ActivityJournalError('ACTIVITY_JOURNAL_LOCK_FAILED', 'Could not acquire the activity journal lock.');
        }
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        await delay(Math.min(remaining, LOCK_POLL_MS));
        if (performance.now() >= deadline) break;
        continue;
      }

      let owner: fs.BigIntStats | undefined;
      try {
        owner = fs.fstatSync(fd, { bigint: true });
        fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, id: randomUUID(), acquiredAt: new Date().toISOString() }));
        fs.closeSync(fd);
      } catch {
        try { fs.closeSync(fd); } catch { /* Preserve the original lock error. */ }
        try { if (owner) this.releaseLock(lock, owner); } catch { /* Preserve an unfamiliar lock. */ }
        throw new ActivityJournalError('ACTIVITY_JOURNAL_LOCK_FAILED', 'Could not initialize the activity journal lock.');
      }
      const owned = owner;
      return () => this.releaseLock(lock, owned);
    }
    if (lastCode && lastCode !== 'EEXIST') {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_LOCK_FAILED', 'Could not acquire the activity journal lock (' + lastCode + ').');
    }
    throw new ActivityJournalError('ACTIVITY_JOURNAL_LOCK_TIMEOUT', 'Timed out waiting for the activity journal lock.');
  }

  private releaseLock(lock: string, owner: fs.BigIntStats): void {
    try {
      const current = fs.lstatSync(lock, { bigint: true, throwIfNoEntry: false });
      if (!matchesFileIdentity(lock, owner, current)) throw new Error('Lock ownership changed.');
      fs.unlinkSync(lock);
    } catch {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_LOCK_FAILED', 'Could not release the activity journal lock.');
    }
  }

  private replace(snapshot: ActivityJournalSnapshot): void {
    const payload = JSON.stringify(snapshot) + '\n';
    if (Buffer.byteLength(payload) > ACTIVITY_JOURNAL_LIMITS.bytes) {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_WRITE_FAILED', 'Activity journal exceeds its size limit.');
    }
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    let ownsTemp = false;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      ownsTemp = true;
      try {
        fs.writeFileSync(fd, payload);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, this.filePath);
      ownsTemp = false;
    } catch {
      throw new ActivityJournalError('ACTIVITY_JOURNAL_WRITE_FAILED', 'Could not save activity journal.');
    } finally {
      if (ownsTemp) {
        try { fs.unlinkSync(temporary); } catch { /* Preserve the original write error. */ }
      }
    }
  }
}

export function activityJournalFor(brain: { dbPath: string }): ActivityJournal {
  return new ActivityJournal({ filePath: path.join(path.dirname(brain.dbPath), ACTIVITY_JOURNAL_FILENAME) });
}
