import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { matchesFileIdentity } from './file-identity.js';

export const FEATURE_DEFINITIONS = [
  {
    id: 'contextAssembly',
    label: 'Context packs',
    description: 'Assemble project memories into a bounded, explained context pack.',
    defaultEnabled: true,
  },
  {
    id: 'crossProjectContext',
    label: 'Cross-project context',
    description: 'Allow context requests to include memories from other projects when explicitly selected.',
    defaultEnabled: false,
  },
  {
    id: 'automaticBriefing',
    label: 'Session briefings',
    description: 'Generate the automatic project briefing at session start.',
    defaultEnabled: true,
  },
  {
    id: 'liveActivity',
    label: 'Live dashboard activity',
    description: 'Show activity updates and the recent activity feed in the dashboard.',
    defaultEnabled: true,
  },
  {
    id: 'activityRecording',
    label: 'Record agent activity',
    description: 'Record bounded tool timing and explicitly reported session phases. Arguments, memory text, and credentials are not captured.',
    defaultEnabled: true,
  },
] as const;

export type FeatureId = typeof FEATURE_DEFINITIONS[number]['id'];
export type FeatureFlags = Record<FeatureId, boolean>;

export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = Object.freeze({
  contextAssembly: true,
  crossProjectContext: false,
  automaticBriefing: true,
  liveActivity: true,
  activityRecording: true,
});

export const FEATURE_SETTINGS_FILENAME = 'feature-settings.json';

export interface FeatureSettingsSnapshot {
  schemaVersion: 1;
  revision: number;
  updatedAt: string | null;
  features: FeatureFlags;
}

export interface FeatureSettingsOptions {
  filePath?: string;
  lockTimeoutMs?: number;
}

const FEATURE_IDS = new Set<string>(FEATURE_DEFINITIONS.map(({ id }) => id));
const ORIGINAL_FEATURE_IDS = ['contextAssembly', 'crossProjectContext', 'automaticBriefing', 'liveActivity'];
const LOCK_TIMEOUT_MS = 3000;
const LOCK_POLL_MS = 20;

export class FeatureSettingsError extends Error {
  constructor(
    readonly code: 'FEATURE_SETTINGS_INVALID_PATCH' | 'FEATURE_SETTINGS_CONFLICT' |
      'FEATURE_SETTINGS_INVALID_STORE' | 'FEATURE_SETTINGS_READ_FAILED' |
      'FEATURE_SETTINGS_WRITE_FAILED' | 'FEATURE_SETTINGS_LOCK_TIMEOUT' | 'FEATURE_SETTINGS_LOCK_FAILED',
    message: string,
  ) {
    super(message);
    this.name = 'FeatureSettingsError';
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFeatureMap(value: unknown): value is Partial<FeatureFlags> {
  return isRecord(value) && Object.entries(value).every(([key, enabled]) => FEATURE_IDS.has(key) && typeof enabled === 'boolean');
}

function defaultSnapshot(): FeatureSettingsSnapshot {
  return { schemaVersion: 1, revision: 0, updatedAt: null, features: { ...DEFAULT_FEATURE_FLAGS } };
}

function parseSnapshot(raw: string): FeatureSettingsSnapshot {
  try {
    const data: unknown = JSON.parse(raw);
    if (isRecord(data) && data.schemaVersion === 1 && typeof data.revision === 'number' &&
        Number.isSafeInteger(data.revision) && data.revision >= 1 &&
        typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) &&
        isFeatureMap(data.features) && ORIGINAL_FEATURE_IDS.every(id => Object.hasOwn(data.features as object, id)) &&
        [FEATURE_IDS.size - 1, FEATURE_IDS.size].includes(Object.keys(data.features).length)) {
      return {
        schemaVersion: 1, revision: data.revision, updatedAt: data.updatedAt,
        features: { ...DEFAULT_FEATURE_FLAGS, ...data.features },
      };
    }
  } catch { /* Use a safe diagnostic without stored contents. */ }
  throw new FeatureSettingsError('FEATURE_SETTINGS_INVALID_STORE', 'Feature settings are malformed or use an unsupported schema.');
}

/** Read and patch the local feature settings file without accessing provider configuration. */
export class FeatureSettingsStore {
  readonly filePath: string;
  private readonly lockTimeoutMs: number;

  constructor(options: FeatureSettingsOptions = {}) {
    this.filePath = path.resolve(options.filePath ?? path.join(os.homedir(), '.shadow-brain', FEATURE_SETTINGS_FILENAME));
    this.lockTimeoutMs = typeof options.lockTimeoutMs === 'number' && Number.isFinite(options.lockTimeoutMs)
      ? Math.max(0, Math.min(options.lockTimeoutMs, 60_000))
      : LOCK_TIMEOUT_MS;
  }

  get(): FeatureSettingsSnapshot {
    let raw: string;
    try {
      const info = fs.lstatSync(this.filePath, { throwIfNoEntry: false });
      if (!info) return defaultSnapshot();
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
        throw new FeatureSettingsError('FEATURE_SETTINGS_INVALID_STORE', 'Feature settings must be a regular local file.');
      }
      raw = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error instanceof FeatureSettingsError) throw error;
      throw new FeatureSettingsError('FEATURE_SETTINGS_READ_FAILED', 'Could not read feature settings.');
    }
    return parseSnapshot(raw);
  }

  isEnabled(id: FeatureId): boolean {
    if (!FEATURE_IDS.has(id)) {
      throw new FeatureSettingsError('FEATURE_SETTINGS_INVALID_PATCH', 'Unknown feature setting.');
    }
    return this.get().features[id];
  }

  async update(patch: unknown, expectedRevision?: number): Promise<FeatureSettingsSnapshot> {
    if (!isFeatureMap(patch) || (expectedRevision !== undefined &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0))) {
      throw new FeatureSettingsError('FEATURE_SETTINGS_INVALID_PATCH', 'Feature settings accept only known feature IDs and boolean values.');
    }
    const changes = { ...patch };
    if (!Object.keys(changes).length) return this.checkRevision(this.get(), expectedRevision);
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    } catch {
      throw new FeatureSettingsError('FEATURE_SETTINGS_WRITE_FAILED', 'Could not open the feature settings directory.');
    }

    const release = await this.acquireLock();
    try {
      const current = this.checkRevision(this.get(), expectedRevision);
      if ((Object.keys(changes) as FeatureId[]).every(id => changes[id] === current.features[id])) return current;
      if (current.revision === Number.MAX_SAFE_INTEGER) {
        throw new FeatureSettingsError('FEATURE_SETTINGS_INVALID_STORE', 'Feature settings revision has reached its limit.');
      }
      const next: FeatureSettingsSnapshot = {
        schemaVersion: 1,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
        features: { ...current.features, ...changes },
      };
      this.replace(next);
      return next;
    } finally {
      release();
    }
  }

  private checkRevision(snapshot: FeatureSettingsSnapshot, expectedRevision?: number): FeatureSettingsSnapshot {
    if (expectedRevision !== undefined && expectedRevision !== snapshot.revision) {
      throw new FeatureSettingsError('FEATURE_SETTINGS_CONFLICT', 'Feature settings changed. Refresh them and retry the update.');
    }
    return snapshot;
  }

  private async acquireLock(): Promise<() => void> {
    const lock = this.filePath + '.lock';
    const deadline = performance.now() + this.lockTimeoutMs;
    for (;;) {
      let fd: number;
      try {
        fd = fs.openSync(lock, 'wx', 0o600);
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          throw new FeatureSettingsError('FEATURE_SETTINGS_LOCK_FAILED', 'Could not acquire the feature settings lock.');
        }
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        await delay(Math.min(remaining, LOCK_POLL_MS));
        if (performance.now() >= deadline) break;
        continue;
      }
      let owner: fs.BigIntStats;
      try {
        owner = fs.fstatSync(fd, { bigint: true });
      } catch {
        try { fs.closeSync(fd); } catch { /* Preserve the original lock error. */ }
        throw new FeatureSettingsError('FEATURE_SETTINGS_LOCK_FAILED', 'Could not identify the feature settings lock.');
      }
      return () => {
        try {
          fs.closeSync(fd);
          const current = fs.lstatSync(lock, { bigint: true, throwIfNoEntry: false });
          if (!matchesFileIdentity(lock, owner, current)) {
            throw new Error('Lock ownership changed.');
          }
          fs.unlinkSync(lock);
        } catch {
          throw new FeatureSettingsError('FEATURE_SETTINGS_LOCK_FAILED', 'Could not release the feature settings lock.');
        }
      };
    }
    throw new FeatureSettingsError('FEATURE_SETTINGS_LOCK_TIMEOUT', 'Timed out waiting for the feature settings lock.');
  }

  private replace(snapshot: FeatureSettingsSnapshot): void {
    const temporary = this.filePath + '.' + randomUUID() + '.tmp';
    let created = false;
    try {
      const fd = fs.openSync(temporary, 'wx', 0o600);
      created = true;
      try {
        fs.writeFileSync(fd, JSON.stringify(snapshot, null, 2) + '\n');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(temporary, this.filePath);
      created = false;
    } catch {
      throw new FeatureSettingsError('FEATURE_SETTINGS_WRITE_FAILED', 'Could not save feature settings.');
    } finally {
      if (created) {
        try { fs.unlinkSync(temporary); } catch { /* Preserve the original write error. */ }
      }
    }
  }
}

export function getFeatureSettings(): FeatureSettingsStore {
  return new FeatureSettingsStore();
}
