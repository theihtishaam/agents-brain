import { createHash, randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';
import { HUB_LIMITS, ProjectHubError, type HubActor, type HubEvent } from './project-hub-contract.js';

const relative = '.shadow-brain/project-hub.sqlite';
type Table = 'documents' | 'rooms' | 'tasks' | 'messages' | 'artifacts' | 'outcomes' | 'acknowledgements' | 'lessons';
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

  private db(): DatabaseSync {
    ensureProjectDirectory(this.root, '.shadow-brain');
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const file = projectLocalPath(this.root, relative + suffix);
      const info = lstatSync(file, { throwIfNoEntry: false });
      if (info && (!info.isFile() || info.nlink !== 1)) {
        throw new ProjectHubError('HUB_UNSAFE_STORE', 'The project hub database requires ordinary, unlinked files.', 409);
      }
    }
    if (this.database) return this.database;
    const db = new DatabaseSync(projectLocalPath(this.root, relative), { allowExtension: false });
    try {
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL;');
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
      const metadata = db.prepare('SELECT project_id,version FROM hub_metadata').all();
      if (metadata.length !== 1 || metadata[0].project_id !== this.projectId || metadata[0].version !== 1) {
        throw new ProjectHubError('HUB_STORE_SCOPE', 'This hub database belongs to another project or schema version.', 409);
      }
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

  operation<T>(id: string, input: unknown, apply: () => T): T {
    const db = this.active();
    const fingerprint = digest(JSON.stringify(input));
    const previous = db.prepare('SELECT hash,data FROM hub_operations WHERE operation_id=?').get(id);
    if (previous) {
      if (previous.hash !== fingerprint) conflict('This operation key was already used with a different request.');
      return JSON.parse(previous.data as string) as T;
    }
    if (Number(db.prepare('SELECT count(*) AS count FROM hub_operations').get()?.count) >= HUB_LIMITS.operations) {
      capped('This project has reached its retained hub operation limit.');
    }
    const value = apply();
    db.prepare('INSERT INTO hub_operations VALUES(?,?,?)').run(id, fingerprint, JSON.stringify(value));
    return value;
  }
}
