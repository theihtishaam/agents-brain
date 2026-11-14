import { watch, type FSWatcher } from 'node:fs';
import { lstat, opendir } from 'node:fs/promises';
import { join } from 'node:path';

const LIMITS = { directories: 64, entries: 1600, inventory: 180, queued: 96, pathBytes: 320, depth: 8, debounceMs: 140 };
const ignored = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', 'out', 'coverage', 'cache', 'caches', 'temp', 'tmp',
  'appdata', 'programdata', 'library', 'applications', 'windows', 'system32', 'system volume information', 'downloads',
  'config', 'configs', 'configuration', 'settings', 'secrets', 'private', 'profiles', 'browser', 'browsers', 'logs',
  'application support', 'keychains', 'certificates', 'credentials', 'program files', 'program files (x86)']);
const safeName = (name: string) => !!name && !name.startsWith('.') && !ignored.has(name.toLowerCase()) &&
  !/[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(name) && !/(?:credential|password|passwd|secret|cookie|history|keychain|token|session|wallet|vault|config|settings|profile|auth|api[-_]?key|private[-_]?key|ssh[-_]?key)/iu.test(name) &&
  !/\.(?:pem|key|pfx|p12|crt|cer|kdbx|env|sqlite[23]?|db|log|lock|swp|tmp|bak)$/iu.test(name);

export interface ObservedProjectFile {
  path: string;
  operation: 'changed' | 'entry';
  count: number;
  exists: boolean;
  entry: 'file' | 'directory' | 'unknown';
}
export interface ProjectWatchSummary {
  status: 'off' | 'scanning' | 'watching' | 'limited';
  directories: number;
  inventoryCount: number;
  inventoryLimited: boolean;
}

export class ProjectFileWatch {
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly known = new Map<string, 'file' | 'directory'>();
  private readonly pending = new Map<string, { operation: ObservedProjectFile['operation']; count: number }>();
  private timer?: NodeJS.Timeout;
  private active = false;
  private scanning = false;
  private limited = false;
  private inventoryLimited = false;
  private generation = 0;
  private scanned = 0;
  private processing = false;

  constructor(private readonly root: string, private readonly report: (event: ObservedProjectFile) => void,
    private readonly changed: () => void) {}

  summary(): ProjectWatchSummary {
    return { status: !this.active ? 'off' : this.scanning ? 'scanning' : this.limited ? 'limited' : 'watching',
      directories: this.watchers.size, inventoryCount: this.known.size, inventoryLimited: this.inventoryLimited };
  }

  inventory() {
    return [...this.known.entries()].slice(0, LIMITS.inventory).map(([path, entry]) => ({ path, entry }));
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.scanning = true;
    const generation = ++this.generation;
    void this.discover('', 0, generation).finally(() => {
      if (generation !== this.generation) return;
      this.scanning = false;
      this.changed();
    });
  }

  stop(): void {
    this.generation++;
    this.active = false;
    this.scanning = false;
    this.limited = false;
    this.inventoryLimited = false;
    this.scanned = 0;
    this.processing = false;
    clearTimeout(this.timer); this.timer = undefined;
    for (const handle of this.watchers.values()) handle.close();
    this.watchers.clear(); this.pending.clear(); this.known.clear();
  }

  private limit() {
    if (this.limited) return;
    this.limited = true;
    if (!this.scanning) this.changed();
  }

  private validPath(path: string) {
    return Buffer.byteLength(path) <= LIMITS.pathBytes && path.split('/').every(safeName);
  }

  private async actual(directory: string) {
    let absolute = this.root;
    const root = await lstat(absolute).catch(() => undefined);
    if (!root?.isDirectory()) return undefined;
    for (const component of directory ? directory.split('/') : []) {
      absolute = join(absolute, component);
      const entry = await lstat(absolute).catch(() => undefined);
      if (!entry?.isDirectory()) return undefined;
    }
    return absolute;
  }

  private async discover(directory: string, depth: number, generation: number): Promise<void> {
    if (!this.active || generation !== this.generation || this.watchers.has(directory)) return;
    if (depth > LIMITS.depth || this.watchers.size >= LIMITS.directories || this.scanned >= LIMITS.entries) { this.limit(); return; }
    const absolute = await this.actual(directory);
    if (!absolute || !this.active || generation !== this.generation || this.watchers.has(directory)) return;
    if (this.watchers.size >= LIMITS.directories) { this.limit(); return; }
    try {
      const handle = watch(absolute, { persistent: false }, (operation, name) => {
        if (!name || generation !== this.generation || !safeName(name)) return;
        const path = directory ? directory + '/' + name : name;
        if (!this.validPath(path)) return;
        const prior = this.pending.get(path);
        if (!prior && this.pending.size >= LIMITS.queued) { this.limit(); return; }
        this.pending.set(path, { operation: operation === 'rename' || prior?.operation === 'entry' ? 'entry' : 'changed',
          count: Math.min(9999, (prior?.count ?? 0) + 1) });
        this.schedule(generation);
      });
      handle.on('error', () => {
        if (generation !== this.generation) return;
        handle.close(); this.watchers.delete(directory); this.limit();
      });
      this.watchers.set(directory, handle);
      const entries = await opendir(absolute);
      for await (const entry of entries) {
        if (generation !== this.generation) break;
        if (++this.scanned > LIMITS.entries) { this.limit(); break; }
        if (!safeName(entry.name) || entry.isSymbolicLink()) continue;
        const path = directory ? directory + '/' + entry.name : entry.name;
        if (!this.validPath(path)) continue;
        if (entry.isDirectory()) {
          this.remember(path, 'directory');
          await this.discover(path, depth + 1, generation);
        } else if (entry.isFile()) {
          const metadata = await lstat(join(this.root, path)).catch(() => undefined);
          if (generation === this.generation && metadata?.isFile() && metadata.nlink === 1) this.remember(path, 'file');
        }
      }
    } catch { if (generation === this.generation) this.limit(); }
  }

  private remember(path: string, type: 'file' | 'directory') {
    if (this.known.has(path) || this.known.size < LIMITS.entries) this.known.set(path, type);
    else this.limit();
    if (this.known.size > LIMITS.inventory) this.inventoryLimited = true;
  }

  private schedule(generation: number) {
    if (this.timer || this.processing) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.processing = true;
      void this.flush(generation).finally(() => {
        if (generation !== this.generation) return;
        this.processing = false;
        if (this.pending.size) this.schedule(generation);
      });
    }, LIMITS.debounceMs).unref();
  }

  private async flush(generation: number) {
    const batch = [...this.pending];
    this.pending.clear();
    for (const [item, event] of batch) {
      if (generation !== this.generation) return;
      const parents = item.split('/');
      const parent = parents.slice(0, -1).join('/');
      const canonical = await this.actual(parent);
      if (!canonical || generation !== this.generation) continue;
      const metadata = await lstat(join(this.root, item)).catch(() => undefined);
      if (generation !== this.generation) return;
      if (metadata?.isSymbolicLink() || (metadata?.isFile() && metadata.nlink !== 1)) {
        this.forget(item);
        this.changed();
        continue;
      }
      const existing = this.known.get(item);
      const type = metadata?.isDirectory() ? 'directory' : metadata?.isFile() ? 'file' : undefined;
      // A vanished name is reported only when it was previously observed as an allowed item.
      if (!type && !existing) continue;
      if (type) this.remember(item, type);
      else this.forget(item);
      this.report({ path: item, ...event, exists: !!type, entry: type ?? existing ?? 'unknown' });
      if (type === 'directory') void this.discover(item, parents.length, generation);
    }
  }

  private forget(item: string) {
    for (const known of this.known.keys()) if (known === item || known.startsWith(item + '/')) this.known.delete(known);
    for (const [directory, handle] of this.watchers) if (directory === item || directory.startsWith(item + '/')) {
      handle.close(); this.watchers.delete(directory);
    }
  }
}
