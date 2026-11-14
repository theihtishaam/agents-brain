import { randomUUID } from 'node:crypto';
import { closeSync, linkSync, lstatSync, openSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';

export const MCP_PRESENCE_FILE = 'mcp-presence.sqlite';
export const MCP_PRESENCE_LIMITS = Object.freeze({ connections: 128, renewMs: 10_000, ttlMs: 30_000, storeBytes: 1024 * 1024 });
const directory = '.shadow-brain';
const identity = /^mcp-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const label = /^[A-Za-z0-9][A-Za-z0-9_. -]{0,63}$/u;
const time = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15 - MCP_PRESENCE_LIMITS.ttlMs;
const pause = new Int32Array(new SharedArrayBuffer(4));
const startupRetryMs = [100, 300, 900];

export class MCPPresenceError extends Error {
  readonly status = 503;
  constructor(readonly code: 'MCP_PRESENCE_UNAVAILABLE' | 'MCP_PRESENCE_LIMIT' | 'MCP_PRESENCE_BUSY', message: string) { super(message); this.name = 'MCPPresenceError'; }
}
const unavailable = () => new MCPPresenceError('MCP_PRESENCE_UNAVAILABLE', 'MCP connection presence could not be read or updated.');
const busy = () => new MCPPresenceError('MCP_PRESENCE_BUSY', 'MCP connection presence is busy. Retry shortly.');

export interface MCPConnectionIdentity { id: string; tool: string }
interface Lease extends MCPConnectionIdentity { startedAt: number; lastSeenAt: number }

/** A local stdio connection heartbeat, independent of host or model execution. */
export class MCPPresenceStore {
  constructor(private readonly root: string, private readonly projectId: string, private readonly now = Date.now) {}

  private file() {
    const parent = projectLocalPath(this.root, directory);
    const stat = lstatSync(parent, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw unavailable();
    const filename = join(parent, MCP_PRESENCE_FILE);
    for (const suffix of ['-journal', '-wal', '-shm']) {
      const sidecar = lstatSync(filename + suffix, { throwIfNoEntry: false });
      if (sidecar && (!sidecar.isFile() || sidecar.isSymbolicLink() || sidecar.nlink !== 1 || sidecar.size > MCP_PRESENCE_LIMITS.storeBytes)) throw unavailable();
    }
    const deadline = performance.now() + 100;
    for (;;) {
      const entry = lstatSync(filename, { throwIfNoEntry: false });
      if (!entry) return { filename, exists: false };
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size > MCP_PRESENCE_LIMITS.storeBytes) throw unavailable();
      if (entry.nlink === 1) return { filename, exists: true };
      if (performance.now() >= deadline) throw unavailable();
      // A competing first writer briefly links a fully initialized database into place.
      Atomics.wait(pause, 0, 0, 4);
    }
  }

  private create(filename: string): void {
    const temporary = projectLocalPath(this.root, `${directory}/${MCP_PRESENCE_FILE}.${randomUUID()}.tmp`);
    closeSync(openSync(temporary, 'wx', 0o600));
    try {
      const db = new DatabaseSync(temporary, { allowExtension: false });
      try {
        db.exec(`PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE;
          CREATE TABLE metadata (project TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT;
          CREATE TABLE leases (id TEXT PRIMARY KEY, tool TEXT NOT NULL, startedAt INTEGER NOT NULL, lastSeenAt INTEGER NOT NULL) STRICT;`);
        db.prepare('INSERT INTO metadata VALUES (?,1)').run(this.projectId);
        db.exec('COMMIT');
      } finally { db.close(); }
      try { linkSync(temporary, filename); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    } finally { unlinkSync(temporary); }
  }

  private rows(db: DatabaseSync): Lease[] {
    const metadata = db.prepare('SELECT project,version FROM metadata LIMIT 2').all();
    if (metadata.length !== 1 || metadata[0].project !== this.projectId || metadata[0].version !== 1) throw unavailable();
    const rows = db.prepare('SELECT id,tool,startedAt,lastSeenAt FROM leases LIMIT ?').all(MCP_PRESENCE_LIMITS.connections + 1);
    if (rows.length > MCP_PRESENCE_LIMITS.connections) throw unavailable();
    return rows.map(row => {
      if (typeof row.id !== 'string' || !identity.test(row.id) || typeof row.tool !== 'string' || !label.test(row.tool) ||
          !time(row.startedAt) || !time(row.lastSeenAt) || Number(row.startedAt) > Number(row.lastSeenAt)) throw unavailable();
      return { id: row.id, tool: row.tool, startedAt: Number(row.startedAt), lastSeenAt: Number(row.lastSeenAt) };
    });
  }

  private access<T>(mode: 'read' | 'report' | 'remove', absent: T, use: (db: DatabaseSync, rows: Lease[]) => T): T {
    let db: DatabaseSync | undefined;
    try {
      const target = this.file();
      if (!target.exists && mode !== 'report') return absent;
      if (!target.exists) {
        ensureProjectDirectory(this.root, directory);
        this.create(target.filename);
        if (!this.file().exists) throw unavailable();
      }
      db = new DatabaseSync(target.filename, { readOnly: mode === 'read', allowExtension: false });
      db.exec('PRAGMA busy_timeout=100; PRAGMA trusted_schema=OFF; ' + (mode === 'read' ? 'BEGIN;' : 'BEGIN IMMEDIATE;'));
      const result = use(db, this.rows(db));
      db.exec('COMMIT');
      return result;
    } catch (error) {
      // Closing a failed transaction rolls it back before returning an unavailable result.
      if (error instanceof MCPPresenceError) throw error;
      const sqliteCode = (error as { errcode?: number })?.errcode;
      if (typeof sqliteCode === 'number' && [5, 6].includes(sqliteCode & 0xff)) throw busy();
      throw unavailable();
    } finally { db?.close(); }
  }

  report(connection: MCPConnectionIdentity): void {
    if (!identity.test(connection.id) || !label.test(connection.tool)) throw unavailable();
    this.access('report', undefined, (db, rows) => {
      const now = this.now();
      if (!time(now)) throw unavailable();
      const oldest = now - MCP_PRESENCE_LIMITS.ttlMs;
      const retained = rows.filter(row => row.lastSeenAt > oldest);
      const current = retained.find(row => row.id === connection.id);
      if ((current && current.tool !== connection.tool) || (current && current.lastSeenAt > now)) throw unavailable();
      if (!current && retained.length >= MCP_PRESENCE_LIMITS.connections) throw new MCPPresenceError('MCP_PRESENCE_LIMIT', 'The project reached its reporting connection limit.');
      db.prepare('DELETE FROM leases WHERE lastSeenAt<=?').run(oldest);
      db.prepare(`INSERT INTO leases VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET lastSeenAt=excluded.lastSeenAt`).run(connection.id, connection.tool, now, now);
    });
  }

  remove(connectionId: string): void {
    if (!identity.test(connectionId)) throw unavailable();
    this.access('remove', undefined, (db, rows) => {
      if (rows.some(row => row.id === connectionId)) db.prepare('DELETE FROM leases WHERE id=?').run(connectionId);
    });
  }

  read(enabled: boolean) {
    const rows = enabled ? this.access<Lease[]>('read', [], (_db, stored) => stored) : [];
    // Sample the clock after the snapshot, so a parallel write cannot look newer than the read.
    const checkedAt = this.now();
    if (!time(checkedAt)) throw unavailable();
    const connections = rows.filter(row =>
      row.lastSeenAt <= checkedAt && checkedAt - row.lastSeenAt < MCP_PRESENCE_LIMITS.ttlMs)
      .sort((a, b) => a.tool.localeCompare(b.tool) || a.id.localeCompare(b.id)).map(row => ({ id: row.id, tool: row.tool,
        startedAt: new Date(row.startedAt).toISOString(), lastSeenAt: new Date(row.lastSeenAt).toISOString(),
        expiresAt: new Date(row.lastSeenAt + MCP_PRESENCE_LIMITS.ttlMs).toISOString(), ageMs: checkedAt - row.lastSeenAt }));
    const counts = new Map<string, number>();
    for (const connection of connections) counts.set(connection.tool, (counts.get(connection.tool) ?? 0) + 1);
    return { projectId: this.projectId, enabled, count: enabled ? connections.length : null, checkedAt: new Date(checkedAt).toISOString(),
      expiresAfterMs: MCP_PRESENCE_LIMITS.ttlMs, connections, tools: [...counts].map(([tool, count]) => ({ tool, count })) };
  }
}

export function startMCPPresence(store: MCPPresenceStore, connection: MCPConnectionIdentity, enabled: () => boolean): () => void {
  let recorded = false;
  let retry: NodeJS.Timeout | undefined;
  const remove = () => {
    if (!recorded) return;
    try { store.remove(connection.id); recorded = false; } catch { /* Expiry remains the fallback. */ }
  };
  const renew = () => {
    let active: boolean;
    try { active = enabled(); } catch { active = false; }
    try {
      if (!active) { remove(); return; }
      store.report(connection);
      recorded = true;
    } catch (error) {
      // Presence must not affect the MCP transport.
      return error instanceof MCPPresenceError && error.code === 'MCP_PRESENCE_BUSY';
    }
  };
  const start = (attempt: number) => {
    if (renew() && attempt < startupRetryMs.length) {
      retry = setTimeout(() => start(attempt + 1), startupRetryMs[attempt]).unref();
    }
  };
  start(0);
  const timer = setInterval(renew, MCP_PRESENCE_LIMITS.renewMs).unref();
  return () => { clearInterval(timer); clearTimeout(retry); remove(); };
}
