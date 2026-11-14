import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';
import { HUB_LIMITS, ProjectHubError, type HubActor, type HubEvent } from './project-hub-contract.js';

const relative = '.shadow-brain/project-hub.sqlite';
type Table = 'documents' | 'rooms' | 'tasks' | 'messages' | 'artifacts' | 'outcomes' | 'acknowledgements' | 'lessons' |
  'sessions' | 'session-messages' | 'session-checkpoints';
type Row = { id: string; scope: string; data: string };

export function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function missing(entity: string): never {
  throw new ProjectHubError('HUB_NOT_FOUND', entity + ' was not found in this project.', 404);
}

export function conflict(message: string): never {
  throw new ProjectHubError('HUB_CONFLICT', message, 409);
}

export function capped(message: string): never {
  throw new ProjectHubError('HUB_LIMIT', message, 422);
}

export class HubStore {
  private database?: DatabaseSync;

  constructor(private readonly root: string, private readonly projectId: string) {}

  private checkedPath(): { filename: string; exists: boolean } {
    const filename = projectLocalPath(this.root, relative);
    let exists = false;
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const file = suffix ? projectLocalPath(this.root, relative + suffix) : filename;
      const info = lstatSync(file, { throwIfNoEntry: false });
      if (info && (!info.isFile() || info.nlink !== 1)) {
        throw new ProjectHubError('HUB_UNSAFE_STORE', 'The project hub database requires ordinary, unlinked files.', 409);
      }
      if (!suffix) exists = !!info;
    }
    return { filename, exists };
  }

  private checkProject(db: DatabaseSync): void {
    const metadata = db.prepare('SELECT project_id,version FROM hub_metadata LIMIT 2').all();
    if (metadata.length !== 1 || metadata[0].project_id !== this.projectId || metadata[0].version !== 1) {
      throw new ProjectHubError('HUB_STORE_SCOPE', 'This hub database belongs to another project or schema version.', 409);
    }
  }

  /** Probe an existing database without initializing or changing its contents. */
  checkStorage(): void {
    try {
      const { filename, exists } = this.checkedPath();
      if (!exists) { this.close(); return; }
      const db = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
      try {
        db.exec('PRAGMA busy_timeout=300; PRAGMA trusted_schema=OFF; BEGIN;');
        this.checkProject(db);
        const rows = db.prepare('SELECT singleton,revision FROM hub_revision LIMIT 2').all();
        if (rows.length !== 1 || rows[0].singleton !== 1 || !Number.isSafeInteger(rows[0].revision) || Number(rows[0].revision) < 0) {
          throw new Error('Invalid hub revision.');
        }
        db.prepare('SELECT kind,id,scope,data FROM hub_rows LIMIT 0').all();
        db.prepare('SELECT cursor,room_id,data FROM hub_events LIMIT 0').all();
        db.prepare('SELECT operation_id,hash,data FROM hub_operations LIMIT 0').all();
        db.prepare('SELECT id,data FROM hub_blobs LIMIT 0').all();
        db.exec('COMMIT;');
      } finally { db.close(); }
    } catch {
      this.close();
      throw new ProjectHubError('HUB_STORAGE_UNAVAILABLE', 'Project Hub storage could not be read. Repair the project store, then retry.', 503);
    }
  }

  private db(): DatabaseSync {
    ensureProjectDirectory(this.root, '.shadow-brain');
    const { filename } = this.checkedPath();
    if (this.database) return this.database;
    const db = new DatabaseSync(filename, { allowExtension: false });
    try {
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
      db.exec('BEGIN IMMEDIATE;');
      const metadata = db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='hub_metadata'").get();
      if (metadata) this.checkProject(db);
      else if (db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
        throw new ProjectHubError('HUB_STORE_SCOPE', 'The existing database does not contain project Hub storage.', 409);
      }
      db.exec(`CREATE TABLE IF NOT EXISTS hub_metadata (project_id TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS hub_revision (singleton INTEGER PRIMARY KEY CHECK(singleton=1), revision INTEGER NOT NULL) STRICT;
        INSERT OR IGNORE INTO hub_revision VALUES(1,0);
        CREATE TABLE IF NOT EXISTS hub_rows (kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id)) STRICT;
        CREATE INDEX IF NOT EXISTS hub_rows_scope ON hub_rows(kind,scope);
        CREATE TABLE IF NOT EXISTS hub_events (cursor INTEGER PRIMARY KEY, room_id TEXT NOT NULL, data TEXT NOT NULL) STRICT;
        CREATE INDEX IF NOT EXISTS hub_events_room ON hub_events(room_id,cursor);
        CREATE TABLE IF NOT EXISTS hub_operations (operation_id TEXT PRIMARY KEY, hash TEXT NOT NULL, data TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS hub_blobs (id TEXT PRIMARY KEY, data BLOB NOT NULL) STRICT;`);
      const insert = db.prepare('INSERT INTO hub_metadata SELECT ?, 1 WHERE NOT EXISTS (SELECT 1 FROM hub_metadata)');
      insert.run(this.projectId);
      this.checkProject(db);
      db.exec('COMMIT;');
      this.database = db;
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }

  close(): void {
    this.database?.close();
    this.database = undefined;
  }

  /** Read existing rows in one snapshot. An empty project does not acquire a database just by listing. */
  read<T>(apply: () => T): T | undefined {
    const { filename, exists } = this.checkedPath();
    if (!exists) return undefined;
    if (this.database) throw new Error('Cannot nest a project hub snapshot.');
    const db = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
    try {
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF; BEGIN;');
      this.checkProject(db);
      this.database = db;
      const result = apply();
      db.exec('COMMIT;');
      return result;
    } finally { this.database = undefined; db.close(); }
  }

  transaction<T>(apply: () => T): T {
    const db = this.db();
    try { db.exec('BEGIN IMMEDIATE'); }
    catch (error) {
      if ((error as { errcode?: number }).errcode === 5) conflict('Another project hub operation is writing. Retry with the same operation key.');
      throw error;
    }
    try {
      const result = apply();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  private active() { return this.database ?? this.db(); }

  revision(): number {
    return Number(this.active().prepare('SELECT revision FROM hub_revision WHERE singleton=1').get()?.revision);
  }

  get<T>(kind: Table, id: string, scope?: string): T | undefined {
    const row = this.active().prepare('SELECT id,scope,data FROM hub_rows WHERE kind=? AND id=?').get(kind, id) as Row | undefined;
    return row && (scope === undefined || row.scope === scope) ? JSON.parse(row.data) as T : undefined;
  }

  list<T>(kind: Table, scope?: string): T[] {
    const db = this.active();
    const rows = scope === undefined
      ? db.prepare('SELECT data FROM hub_rows WHERE kind=? ORDER BY rowid').all(kind)
      : db.prepare('SELECT data FROM hub_rows WHERE kind=? AND scope=? ORDER BY rowid').all(kind, scope);
    return rows.map(row => JSON.parse(row.data as string) as T);
  }

  count(kind: Table, scope?: string): number {
    const db = this.active();
    const row = scope === undefined
      ? db.prepare('SELECT count(*) AS count FROM hub_rows WHERE kind=?').get(kind)
      : db.prepare('SELECT count(*) AS count FROM hub_rows WHERE kind=? AND scope=?').get(kind, scope);
    return Number(row?.count);
  }

  put<T extends { id: string }>(kind: Table, value: T, scope = ''): T {
    const db = this.active();
    const result = db.prepare('INSERT INTO hub_rows(kind,id,scope,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data WHERE data<>excluded.data')
      .run(kind, value.id, scope, JSON.stringify(value));
    if (Number(result.changes)) db.exec('UPDATE hub_revision SET revision=revision+1 WHERE singleton=1');
    return value;
  }

  findByScope<T>(kind: Table, scope: string): T | undefined {
    const row = this.active().prepare('SELECT data FROM hub_rows WHERE kind=? AND scope=? LIMIT 1').get(kind, scope);
    return row ? JSON.parse(row.data as string) as T : undefined;
  }

  latestSessionNative(nativeTool: string, nativeId: string): { id: string; sha256: string } | undefined {
    return this.active().prepare(`SELECT id, json_extract(data, '$.native.sha256') AS sha256 FROM hub_rows WHERE kind='sessions'
      AND json_extract(data, '$.native.tool')=? AND json_extract(data, '$.native.sessionId')=? ORDER BY rowid DESC LIMIT 1`)
      .get(nativeTool, nativeId) as { id: string; sha256: string } | undefined;
  }

  page<T>(kind: Table, scope: string, limit: number, byteLimit: number, before?: string): { rows: T[]; more: boolean } | undefined {
    const db = this.active();
    const cursor = before ? db.prepare('SELECT rowid FROM hub_rows WHERE kind=? AND scope=? AND id=?').get(kind, scope, before) : undefined;
    if (before && !cursor) return undefined;
    const rows = cursor
      ? db.prepare('SELECT data FROM hub_rows WHERE kind=? AND scope=? AND rowid<? ORDER BY rowid DESC LIMIT ?').all(kind, scope, cursor.rowid, limit + 1)
      : db.prepare('SELECT data FROM hub_rows WHERE kind=? AND scope=? ORDER BY rowid DESC LIMIT ?').all(kind, scope, limit + 1);
    const page: T[] = [];
    let bytes = 2;
    for (const { data } of rows.slice(0, limit)) {
      const size = Buffer.byteLength(data as string) + (page.length ? 1 : 0);
      if (bytes + size > byteLimit) break;
      page.push(JSON.parse(data as string) as T);
      bytes += size;
    }
    if (!page.length && rows.length) throw new Error('Stored session message exceeds its byte limit.');
    return { rows: page.reverse(), more: rows.length > page.length };
  }

  sessionCheckpointSummaries(sessionId: string) {
    return this.active().prepare(`SELECT json_object('id', id, 'sessionId', scope, 'revision', json_extract(data, '$.revision'),
      'actor', json_extract(data, '$.actor'), 'createdAt', json_extract(data, '$.createdAt'), 'sha256', json_extract(data, '$.sha256')) AS summary
      FROM hub_rows WHERE kind='session-checkpoints' AND scope=? ORDER BY rowid`).all(sessionId)
      .map(row => JSON.parse(row.summary as string));
  }

  blob(id: string): Uint8Array | undefined {
    return this.active().prepare('SELECT data FROM hub_blobs WHERE id=?').get(id)?.data as Uint8Array | undefined;
  }

  saveBlob(id: string, bytes: Uint8Array): void {
    this.active().prepare('INSERT OR IGNORE INTO hub_blobs(id,data) VALUES(?,?)').run(id, bytes);
  }

  event(roomId: string, kind: string, targetId: string, actor: HubActor, createdAt: string): void {
    this.active().prepare('INSERT INTO hub_events(room_id,data) VALUES(?,?)')
      .run(roomId, JSON.stringify({ id: randomUUID(), roomId, kind, targetId, actor, createdAt }));
  }

  events(roomId: string, after: number, limit = 200): { events: HubEvent[]; cursor: number; more: boolean } {
    const rows = this.active().prepare('SELECT cursor,data FROM hub_events WHERE room_id=? AND cursor>? ORDER BY cursor LIMIT ?').all(roomId, after, limit + 1);
    const events = rows.slice(0, limit).map(row => ({ ...JSON.parse(row.data as string), cursor: Number(row.cursor) } as HubEvent));
    return { events, cursor: events.at(-1)?.cursor ?? after, more: rows.length > limit };
  }

  operation<T>(id: string, input: unknown, apply: () => T, maximum = HUB_LIMITS.operations): T {
    const db = this.active();
    const fingerprint = digest(JSON.stringify(input));
    const previous = db.prepare('SELECT hash,data FROM hub_operations WHERE operation_id=?').get(id);
    if (previous) {
      if (previous.hash !== fingerprint) conflict('This operation key was already used with a different request.');
      return JSON.parse(previous.data as string) as T;
    }
    const prefix = id.startsWith('session:') ? 'session:%' : undefined;
    const count = db.prepare(prefix ? 'SELECT count(*) AS count FROM hub_operations WHERE operation_id LIKE ?' :
      "SELECT count(*) AS count FROM hub_operations WHERE operation_id NOT LIKE 'session:%'");
    if (Number((prefix ? count.get(prefix) : count.get())?.count) >= maximum) {
      capped('This project has reached its retained hub operation limit.');
    }
    const value = apply();
    db.prepare('INSERT INTO hub_operations VALUES(?,?,?)').run(id, fingerprint, JSON.stringify(value));
    return value;
  }
}
