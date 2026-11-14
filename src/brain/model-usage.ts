import { createHash, randomUUID } from 'node:crypto';
import { closeSync, linkSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';

const directoryName = '.shadow-brain';
const fileName = 'model-usage.sqlite';
const retentionLimit = 1000;
const maximumBytes = 8 * 1024 * 1024;
const initializationWait = new Int32Array(new SharedArrayBuffer(4));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const counters = ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheWriteInputTokens', 'reasoningOutputTokens'] as const;
type Counter = typeof counters[number];
export type UsageInput = { operationId: string; projectId: string; sessionId: string; agent: string;
  provider?: string; requestModel?: string; responseModel?: string; outcome?: 'success' | 'error' | 'cancelled' } & Partial<Record<Counter, number>>;
export type UsageReceipt = UsageInput & { id: string; recordedAt: string; provenance: 'host-reported' };
export class ModelUsageError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); }
}

const unavailable = () => new ModelUsageError('USAGE_STORAGE_UNAVAILABLE', 'Usage storage could not be opened. Check the project store and retry.', 503);
const identityFor = (input: UsageInput) => JSON.stringify([input.projectId, input.agent, input.sessionId, input.operationId]);
const fingerprintFor = (input: UsageInput) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
type StoredReceipt = { identity?: unknown; fingerprint?: unknown; data?: unknown };
export function parseUsageInput(value: unknown, projectId: string): UsageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Send a usage receipt object.');
  const input = value as Record<string, unknown>;
  const labels = ['operationId', 'projectId', 'sessionId', 'agent', 'provider', 'requestModel', 'responseModel'];
  if (Object.keys(input).some(key => ![...labels, ...counters, 'outcome'].includes(key))) throw new TypeError('Usage receipts accept labels and token counters only.');
  const result: Record<string, unknown> = {};
  for (const key of labels) {
    const field = input[key];
    if (field === undefined && ['provider', 'requestModel', 'responseModel'].includes(key)) continue;
    if (typeof field !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(field) || field.includes('://')) throw new TypeError('Use short plain labels for ' + key + '.');
    result[key] = field;
  }
  if (result.projectId !== projectId) throw new ModelUsageError('USAGE_PROJECT_MISMATCH', 'This receipt belongs to another project.', 409);
  for (const key of counters) if (input[key] !== undefined) {
    if (!Number.isSafeInteger(input[key]) || Number(input[key]) < 0 || Number(input[key]) > 1_000_000_000) throw new TypeError(key + ' must be an integer from zero to one billion.');
    result[key] = input[key];
  }
  if (input.outcome !== undefined) {
    if (!['success', 'error', 'cancelled'].includes(input.outcome as string)) throw new TypeError('Invalid inference outcome.');
    result.outcome = input.outcome;
  }
  const receipt = result as UsageInput;
  if (receipt.inputTokens !== undefined && (receipt.cacheReadInputTokens ?? 0) + (receipt.cacheWriteInputTokens ?? 0) > receipt.inputTokens) throw new TypeError('Cached input subsets cannot exceed input tokens.');
  if (receipt.outputTokens !== undefined && (receipt.reasoningOutputTokens ?? 0) > receipt.outputTokens) throw new TypeError('Reasoning tokens cannot exceed output tokens.');
  return receipt;
}

/** Explicit metadata receipts. Never reads providers, sessions, prompts or credentials. */
export class ModelUsageStore {
  constructor(private readonly root: string, private readonly projectId: string, private readonly now = Date.now) {}
  private path(): { filename: string; exists: boolean } {
    const directory = projectLocalPath(this.root, directoryName);
    const directoryInfo = lstatSync(directory, { throwIfNoEntry: false });
    if (directoryInfo && (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink())) throw unavailable();
    const filename = join(directory, fileName);
    for (const suffix of ['-journal', '-wal', '-shm']) {
      const stat = lstatSync(filename + suffix, { throwIfNoEntry: false });
      if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > maximumBytes)) throw unavailable();
    }
    // A cooperating first writer briefly links its complete new database into place.
    // Retry that publication interval before reporting a persistently unsafe path.
    const deadline = performance.now() + 250;
    for (;;) {
      const stat = lstatSync(filename, { throwIfNoEntry: false });
      if (!stat) return { filename, exists: false };
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximumBytes) throw unavailable();
      if (stat.nlink === 1) return { filename, exists: true };
      if (performance.now() >= deadline) throw unavailable();
      Atomics.wait(initializationWait, 0, 0, 4);
    }
  }

  private metadata(db: DatabaseSync): number {
    const rows = db.prepare('SELECT project,version,dropped FROM usage_meta LIMIT 2').all();
    if (rows.length !== 1 || rows[0].project !== this.projectId || rows[0].version !== 1 ||
        !Number.isSafeInteger(rows[0].dropped) || Number(rows[0].dropped) < 0) throw unavailable();
    return Number(rows[0].dropped);
  }

  private create(filename: string): void {
    const temporary = projectLocalPath(this.root, `${directoryName}/${fileName}.${randomUUID()}.tmp`);
    const fd = openSync(temporary, 'wx', 0o600);
    try {
      closeSync(fd);
      const db = new DatabaseSync(temporary, { allowExtension: false });
      try {
        db.exec('PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; BEGIN IMMEDIATE;'
          + 'CREATE TABLE usage_meta(project TEXT PRIMARY KEY,version INTEGER NOT NULL,dropped INTEGER NOT NULL) STRICT;'
          + 'CREATE TABLE receipts(seq INTEGER PRIMARY KEY,identity TEXT UNIQUE NOT NULL,fingerprint TEXT NOT NULL,data TEXT NOT NULL) STRICT;');
        db.prepare('INSERT INTO usage_meta VALUES(?,1,0)').run(this.projectId);
        db.exec('COMMIT');
      } finally { db.close(); }
      try { linkSync(temporary, filename); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally { unlinkSync(temporary); }
  }

  private open(write: boolean): DatabaseSync | undefined {
    if (write) ensureProjectDirectory(this.root, directoryName);
    const { filename, exists } = this.path();
    if (!exists && !write) return undefined;
    if (!exists) {
      this.create(filename);
      if (!this.path().exists) throw unavailable();
    }
    const db = new DatabaseSync(filename, { readOnly: !write, allowExtension: false });
    try {
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF;');
      return db;
    } catch (error) { db.close(); throw error; }
  }

  private receipt(row: StoredReceipt): UsageReceipt {
    try {
      const { id, recordedAt, provenance, ...fields } = JSON.parse(row.data as string);
      const input = parseUsageInput(fields, this.projectId);
      if (typeof id !== 'string' || !uuid.test(id) || typeof recordedAt !== 'string' || !Number.isFinite(Date.parse(recordedAt)) ||
          new Date(recordedAt).toISOString() !== recordedAt || provenance !== 'host-reported' ||
          row.identity !== identityFor(input) || row.fingerprint !== fingerprintFor(input)) throw unavailable();
      return { ...input, id, recordedAt, provenance };
    } catch { throw unavailable(); }
  }

  private receipts(db: DatabaseSync): UsageReceipt[] {
    const rows = db.prepare('SELECT identity,fingerprint,data FROM receipts ORDER BY seq LIMIT ?').all(retentionLimit + 1);
    const receipts = rows.map(row => this.receipt(row));
    if (receipts.length > retentionLimit || new Set(receipts.map(receipt => receipt.id)).size !== receipts.length) throw unavailable();
    return receipts;
  }
  report(value: unknown): UsageReceipt {
    const input = parseUsageInput(value, this.projectId);
    const identity = identityFor(input);
    const fingerprint = fingerprintFor(input);
    let db: DatabaseSync | undefined;
    try {
      db = this.open(true)!;
      db.exec('BEGIN IMMEDIATE');
      const dropped = this.metadata(db);
      const existing = db.prepare('SELECT identity,fingerprint,data FROM receipts WHERE identity=?').get(identity);
      if (existing) {
        const prior = this.receipt(existing);
        if (existing.fingerprint !== fingerprint) throw new ModelUsageError('USAGE_CONFLICT', 'This operation already has a different usage receipt.', 409);
        db.exec('COMMIT');
        return prior;
      }
      const count = Number(db.prepare('SELECT count(*) AS count FROM receipts').get()?.count);
      if (!Number.isSafeInteger(count) || count < 0 || count > retentionLimit) throw unavailable();
      if (count === retentionLimit) {
        if (dropped >= Number.MAX_SAFE_INTEGER - 1) throw unavailable();
        this.receipt(db.prepare('SELECT identity,fingerprint,data FROM receipts ORDER BY seq LIMIT 1').get()!);
        db.exec('DELETE FROM receipts WHERE seq=(SELECT min(seq) FROM receipts); UPDATE usage_meta SET dropped=dropped+1;');
      }
      const receipt: UsageReceipt = { ...input, id: randomUUID(), recordedAt: new Date(this.now()).toISOString(), provenance: 'host-reported' };
      db.prepare('INSERT INTO receipts(identity,fingerprint,data) VALUES(?,?,?)').run(identity, fingerprint, JSON.stringify(receipt));
      db.exec('COMMIT'); return receipt;
    } catch (error) {
      try { db?.exec('ROLLBACK'); } catch { /* Preserve the original failure. */ }
      throw error instanceof ModelUsageError ? error : unavailable();
    } finally { db?.close(); }
  }
  read() {
    let db: DatabaseSync | undefined;
    try {
      db = this.open(false);
      db?.exec('BEGIN');
      const dropped = db ? this.metadata(db) : 0;
      const receipts = db ? this.receipts(db) : [];
      db?.exec('COMMIT');
      const aggregate = (rows: UsageReceipt[]) => Object.fromEntries(counters.map(key => {
        const known = rows.filter(row => row[key] !== undefined);
        return [key, { total: known.length ? known.reduce((sum, row) => sum + row[key]!, 0) : null, known: known.length, receipts: rows.length }];
      })) as Record<Counter, { total: number | null; known: number; receipts: number }>;
      const groups = new Map<string, UsageReceipt[]>();
      for (const receipt of receipts) {
        const key = JSON.stringify([receipt.agent, receipt.provider ?? null, receipt.requestModel ?? null, receipt.responseModel ?? null]);
        const group = groups.get(key);
        if (group) group.push(receipt);
        else groups.set(key, [receipt]);
      }
      return { provenance: 'host-reported' as const, retentionLimit, dropped,
        oldestAt: receipts[0]?.recordedAt ?? null, newestAt: receipts.at(-1)?.recordedAt ?? null,
        receipts, totals: aggregate(receipts), models: [...groups.values()].map(rows => ({ agent: rows[0].agent, provider: rows[0].provider ?? null,
          requestModel: rows[0].requestModel ?? null, responseModel: rows[0].responseModel ?? null, lastAt: rows.at(-1)!.recordedAt, count: rows.length, totals: aggregate(rows) })) };
    } catch { throw unavailable(); }
    finally { db?.close(); }
  }
}
