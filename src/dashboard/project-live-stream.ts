import { lstatSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { FeatureFlags, FeatureSettingsStore } from '../brain/feature-settings.js';
import { ProjectFileWatch, type ObservedProjectFile, type ProjectWatchSummary } from './project-file-watch.js';

const LIMITS = { connections: 8, ring: 128, files: 50, queuedBytes: 96 * 1024, checkMs: 250, heartbeatMs: 14_000 };
const STORES = [
  ['project-memory.json', ['graph']],
  ['memory-annotations.json', ['graph']],
  ['activity-journal.json', ['telemetry']],
  ['feature-settings.json', ['features']],
  ['memory-feedback.json', ['feedback']],
  ['project-hub.sqlite', ['hub', 'sessions']],
  ['project-hub.sqlite-wal', ['hub', 'sessions']],
  ['project-sources.sqlite', ['sources']],
  ['project-sources.sqlite-wal', ['sources']],
  ['project-policy.json', ['policy']],
  ['model-usage.sqlite', ['usage']],
  ['model-usage.sqlite-wal', ['usage']],
] as const;
type Area = typeof STORES[number][1][number];
type LiveNotice =
  | { kind: 'change'; areas: Area[] }
  | ({ kind: 'file' } & ObservedProjectFile)
  | { kind: 'watch'; watch: ProjectWatchSummary }
  | { kind: 'ready' | 'reset' | 'disabled'; watch: ProjectWatchSummary };
type StreamEvent = LiveNotice & { serverInstanceId: string; sequence: number; timestamp: string };
type Client = { response: ServerResponse; pending: string[]; queued: number; blocked: boolean };

function metadata(file: string): string {
  try {
    const entry = lstatSync(file, { bigint: true, throwIfNoEntry: false });
    if (!entry?.isFile() || entry.nlink !== 1n) return '';
    return [entry.dev, entry.ino, entry.size, entry.mtimeNs, entry.ctimeNs].join(':');
  } catch { return '?'; }
}

function json(response: ServerResponse, status: number, data: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(data));
}

export class ProjectLiveStream {
  private readonly clients = new Set<Client>();
  private readonly ring: StreamEvent[] = [];
  private readonly files: Array<StreamEvent & { kind: 'file' }> = [];
  private readonly watcher: ProjectFileWatch;
  private readonly changes = new Map<string, string>();
  private flags?: FeatureFlags;
  private baseline = false;
  private sequence = 0;
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private closed = false;

  constructor(private readonly root: string, private readonly serverInstanceId: string, private readonly settings: FeatureSettingsStore) {
    this.watcher = new ProjectFileWatch(root, file => {
      if (!this.flags?.liveActivity || !this.flags.activityRecording || !this.flags.projectFileActivity) return;
      const event = this.emit({ kind: 'file', ...file });
      this.files.push(event);
      if (this.files.length > LIMITS.files) this.files.shift();
    }, () => { if (this.flags?.liveActivity) this.emit({ kind: 'watch', watch: this.watcher.summary() }); });
  }

  static route(path: string): boolean {
    return path === '/api/workspace/stream' || path === '/api/workspace/project-files';
  }

  handle(request: IncomingMessage, response: ServerResponse, url: URL): void {
    if (request.method !== 'GET') return json(response, 405, { error: 'Use GET for the local project stream.' });
    if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host ||
        ['cross-site', 'same-site'].includes(String(request.headers['sec-fetch-site']))) {
      return json(response, 403, { error: 'The project stream accepts same-origin requests.' });
    }
    if (this.closed) return json(response, 503, { error: 'The project stream is closing.' });
    this.check();
    const watch = this.watcher.summary();
    if (url.pathname.endsWith('/project-files')) return json(response, 200, {
      watch, serverInstanceId: this.serverInstanceId, enabled: !!this.flags?.projectFileActivity,
      items: this.flags?.liveActivity ? this.watcher.inventory() : [], events: this.flags?.liveActivity ? this.files : [],
    });
    if (this.clients.size >= LIMITS.connections) return json(response, 429, { error: 'The project stream reached its connection limit.' });
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
      'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no',
    });
    response.flushHeaders();
    const client = { response, pending: [], queued: 0, blocked: false };
    this.clients.add(client);
    response.once('close', () => this.disconnect(client));
    response.on('drain', () => { client.blocked = false; this.flush(client); });
    this.send(client, 'retry: 1800\n\n');
    if (!this.flags?.liveActivity) {
      this.control(client, 'disabled');
      response.end();
      return;
    }
    const header = request.headers['last-event-id'];
    const cursor = typeof header === 'string' ? header : url.searchParams.get('cursor');
    const after = this.parseCursor(cursor);
    if (cursor && after === null) this.control(client, 'reset');
    else if (after !== null) {
      for (const event of this.ring) if (event.sequence > after) this.send(client, this.serialize(event));
    }
    this.control(client, 'ready');
    this.startTimers();
  }

  close(): void {
    this.closed = true;
    for (const client of this.clients) client.response.destroy();
    this.clients.clear();
    this.stopTimers();
    this.watcher.stop();
    this.ring.length = 0;
    this.files.length = 0;
  }

  private startTimers(): void {
    this.timer ??= setInterval(() => this.check(), LIMITS.checkMs).unref();
    this.heartbeat ??= setInterval(() => {
      for (const client of this.clients) this.send(client, ': heartbeat\n\n');
    }, LIMITS.heartbeatMs).unref();
  }

  private stopTimers(): void {
    clearInterval(this.timer);
    clearInterval(this.heartbeat);
    this.timer = this.heartbeat = undefined;
  }

  private check(): void {
    const directory = join(this.root, '.shadow-brain');
    let validDirectory = false, missingDirectory = false;
    try {
      if (lstatSync(this.root, { throwIfNoEntry: false })?.isDirectory()) {
        const entry = lstatSync(directory, { throwIfNoEntry: false });
        missingDirectory = !entry;
        validDirectory = !!entry?.isDirectory();
      }
    } catch { /* An unavailable directory cannot be read safely. */ }
    const changes = new Set<Area>();
    for (const [basename, areas] of STORES) {
      const value = validDirectory ? metadata(join(directory, basename)) : '';
      if (this.baseline && this.changes.get(basename) !== value) for (const area of areas) changes.add(area);
      this.changes.set(basename, value);
    }
    if (!this.baseline || changes.has('features')) {
      try {
        this.flags = validDirectory || missingDirectory ? this.settings.get().features : undefined;
      } catch { this.flags = undefined; }
    }
    this.baseline = true;
    if (!this.flags?.liveActivity) {
      this.watcher.stop();
      this.ring.length = 0;
      this.files.length = 0;
      for (const client of this.clients) {
        this.control(client, 'disabled');
        client.response.end();
      }
      return;
    }
    const observe = this.flags.projectFileActivity && this.flags.activityRecording;
    if (observe && this.clients.size) this.watcher.start();
    else if (!observe && (this.watcher.summary().status !== 'off' || this.files.length)) {
      this.watcher.stop();
      this.files.length = 0;
      this.ring.length = 0;
      this.emit({ kind: 'watch', watch: this.watcher.summary() });
    }
    if (changes.size) this.emit({ kind: 'change', areas: [...changes] });
  }

  private disconnect(client: Client): void {
    this.clients.delete(client);
    if (this.clients.size) return;
    this.stopTimers();
    this.watcher.stop();
    // Reconcile on the next subscriber before replaying recent notifications.
  }

  private parseCursor(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const [instance, cursor, extra] = raw.split(':');
    const sequence = Number(cursor);
    if (extra !== undefined || instance !== this.serverInstanceId || !/^\d+$/.test(cursor ?? '') ||
        !Number.isSafeInteger(sequence) || sequence < (this.ring[0]?.sequence ?? this.sequence + 1) - 1 || sequence > this.sequence) return null;
    return sequence;
  }

  private emit<T extends LiveNotice>(notice: T): T & Omit<StreamEvent, 'kind'> {
    const event = { ...notice, serverInstanceId: this.serverInstanceId, sequence: ++this.sequence, timestamp: new Date().toISOString() };
    this.ring.push(event as StreamEvent);
    if (this.ring.length > LIMITS.ring) this.ring.shift();
    const message = this.serialize(event as StreamEvent);
    for (const client of this.clients) this.send(client, message);
    return event;
  }

  private control(client: Client, kind: 'ready' | 'reset' | 'disabled'): void {
    this.send(client, this.serialize({ kind, watch: this.watcher.summary(), serverInstanceId: this.serverInstanceId,
      sequence: this.sequence, timestamp: new Date().toISOString() }));
  }

  private serialize(event: StreamEvent): string {
    return 'id: ' + event.serverInstanceId + ':' + event.sequence + '\nevent: ' + event.kind + '\ndata: ' + JSON.stringify(event) + '\n\n';
  }

  private send(client: Client, message: string): void {
    if (client.response.destroyed || client.response.writableEnded) return;
    if (client.queued + client.response.writableLength + Buffer.byteLength(message) > LIMITS.queuedBytes) {
      client.response.destroy();
      return;
    }
    client.pending.push(message);
    client.queued += Buffer.byteLength(message);
    this.flush(client);
  }

  private flush(client: Client): void {
    while (!client.blocked && client.pending.length && !client.response.destroyed && !client.response.writableEnded) {
      const message = client.pending.shift()!;
      client.queued -= Buffer.byteLength(message);
      client.blocked = !client.response.write(message);
    }
  }
}
