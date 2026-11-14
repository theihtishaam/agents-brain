import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AgentTool,
  BrainTimelineEvent,
  GlobalBrainConfig,
  GlobalBrainStats,
  GlobalBrainStorageHealth,
  GlobalEntry,
  RecallConfidence,
  ScoredGlobalEntry,
} from '../types.js';
import { getBrainBus } from './brain-bus.js';
import { contextSearchMemory, type ContextSearchMemory } from './context-retrieval.js';
import { matchesFileIdentity } from './file-identity.js';

const DEFAULT_DB_PATH = path.join(os.homedir(), '.shadow-brain', 'global.json');
const LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const BYTES_PER_MB = 1024 * 1024;
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'for', 'from', 'in', 'into', 'is', 'of', 'on',
  'or', 'the', 'to', 'with', 'ww2br',
]);

const DEFAULT_CONFIG: GlobalBrainConfig = {
  dbPath: DEFAULT_DB_PATH,
  walMode: true,
  writeQueueSize: 1000,
  autoVacuumMB: 500,
  autoPruneMB: 1000,
  syncIntervalMs: 5000,
};

type EntryInput = Omit<GlobalEntry, 'id' | 'createdAt' | 'lastAccessed' | 'accessCount'>;
type StoredEntry = Omit<GlobalEntry, 'createdAt' | 'lastAccessed' | 'importance' | 'accessCount' | 'metadata'> & {
  createdAt?: unknown;
  lastAccessed?: unknown;
  importance?: unknown;
  accessCount?: unknown;
  metadata?: unknown;
};

interface ProjectRegistration {
  id: string;
  name: string;
  rootDir: string;
  firstSeen: number;
  lastSeen: number;
}

interface AgentRegistration {
  tool: AgentTool;
  firstSeen: number;
  lastSeen: number;
  sessionCount: number;
}

interface PersistShape {
  schemaVersion: 1;
  entries: StoredEntry[];
  projects: ProjectRegistration[];
  agents: AgentRegistration[];
}

interface Snapshot {
  data: PersistShape;
  sizeMB: number;
}

interface Addition {
  kind: 'add';
  entry: StoredEntry;
  queued: boolean;
  settle?: (success: boolean) => void;
}

type PendingOperation =
  | Addition
  | { kind: 'touch'; id: string; at: number }
  | { kind: 'project'; project: ProjectRegistration }
  | { kind: 'agent'; tool: AgentTool; at: number };

interface RecallOptions {
  projectId?: string;
  agentTool?: AgentTool;
  category?: string;
  keywords?: string[];
  limit?: number;
  minImportance?: number;
  /** Exclude curated memories before matching, corroboration, and candidate limits. */
  excludeIds?: ReadonlySet<string>;
}

interface RecallMatch {
  entry: GlobalEntry;
  relevance: number;
  matchedKeywords: string[];
}

class StorageError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'GlobalBrainStorageError';
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUniqueKeys(rows: unknown[], key: string, required: string[]): boolean {
  const keys = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || required.some(field => typeof row[field] !== 'string')) return false;
    const id = row[key];
    if (typeof id !== 'string' || !id || keys.has(id)) return false;
    keys.add(id);
  }
  return true;
}

function validateSnapshot(value: unknown): asserts value is PersistShape {
  if (!isRecord(value) || !Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1) {
    throw new StorageError('STORE_INVALID_SCHEMA', 'The global brain store has an invalid schema.');
  }
  if (value.schemaVersion !== 1) {
    throw new StorageError('STORE_UNSUPPORTED_SCHEMA', 'The global brain store uses an unsupported schema version.');
  }
  if (
    !Array.isArray(value.entries) ||
    !hasUniqueKeys(value.entries, 'id', ['projectId', 'projectName', 'agentTool', 'category', 'content']) ||
    !Array.isArray(value.projects) ||
    !hasUniqueKeys(value.projects, 'id', ['name', 'rootDir']) ||
    !Array.isArray(value.agents) ||
    !hasUniqueKeys(value.agents, 'tool', [])
  ) {
    throw new StorageError('STORE_INVALID_SCHEMA', 'The global brain store has an invalid schema.');
  }
}

function boundedSignal(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(value, 1)) : 0;
}

function nonNegativeInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER))
    : fallback;
}

function dateTime(value: unknown): number {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : 0;
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
}

function hydrateEntry(entry: StoredEntry): GlobalEntry {
  return {
    ...entry,
    importance: boundedSignal(entry.importance),
    accessCount: nonNegativeInt(entry.accessCount),
    createdAt: new Date(dateTime(entry.createdAt)),
    lastAccessed: new Date(dateTime(entry.lastAccessed)),
    metadata: isRecord(entry.metadata) ? entry.metadata : {},
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function normalizeRecallKeywords(keywords: unknown): string[] {
  if (!Array.isArray(keywords)) return [];
  const unique = new Set<string>();
  for (const value of keywords) {
    if (typeof value !== 'string') continue;
    const keyword = normalizeText(value);
    if (keyword.length > 2 && !STOP_WORDS.has(keyword)) unique.add(keyword);
  }
  return [...unique];
}

function searchableMetadata(metadata: GlobalEntry['metadata']): string {
  try {
    return normalizeText(JSON.stringify(metadata));
  } catch {
    return '';
  }
}

function evidenceKey(entry: GlobalEntry): string {
  return JSON.stringify([entry.projectId, entry.category, normalizeText(entry.content)]);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Local JSON store shared by cooperating Global Brain processes. */
export class GlobalBrain {
  private static instance: GlobalBrain | null = null;
  private readonly config: GlobalBrainConfig;
  private entries = new Map<string, GlobalEntry>();
  private readonly pendingOperations: PendingOperation[] = [];
  private syncTimer: NodeJS.Timeout | null = null;
  private syncInFlight: Promise<void> | null = null;
  private readonly stats: GlobalBrainStats;
  private readonly startedAt = Date.now();
  private initialized = false;
  private shuttingDown = false;
  private lastSuccessfulSync: string | null = null;
  private lastError: GlobalBrainStorageHealth['lastError'] = null;

  private constructor(config: Partial<GlobalBrainConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, dbPath: path.resolve(config.dbPath ?? DEFAULT_DB_PATH) };
    this.stats = {
      totalProjects: 0,
      totalAgents: 0,
      totalEntries: 0,
      totalSizeMB: 0,
      pendingWrites: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      lastSync: new Date(),
      lastVacuum: null,
      lastPrune: null,
      uptime: 0,
    };
  }

  static getInstance(config?: Partial<GlobalBrainConfig>): GlobalBrain {
    GlobalBrain.instance ??= new GlobalBrain(config);
    return GlobalBrain.instance;
  }

  /** Explicit independent store. Does not replace or consult the global singleton. */
  static createIsolated(config: Partial<GlobalBrainConfig> & { dbPath: string }): GlobalBrain {
    if (typeof config.dbPath !== 'string' || !config.dbPath.trim()) throw new TypeError('An explicit memory-store path is required.');
    return new GlobalBrain(config);
  }

  async init(): Promise<void> {
    this.initialize();
  }

  private initialize(): void {
    if (this.initialized) return;
    try {
      try {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      } catch (error) {
        throw new StorageError('STORE_READ_FAILED', `Could not open the global brain store directory (${errorCode(error) ?? 'I/O error'}).`);
      }
      const { data, sizeMB } = this.readLatestSnapshot();
      this.adoptSnapshot(data, sizeMB, this.hydrateEntries(data));
      this.initialized = true;
      this.lastError = null;
      this.syncTimer = setInterval(() => {
        if (!this.syncInFlight) void this.sync().catch(() => { /* available through getStorageHealth() */ });
      }, this.config.syncIntervalMs);
    } catch (error) {
      throw this.recordError(error);
    }
  }

  /** Generate a stable project ID from absolute path. */
  static projectIdFor(rootDir: string): string {
    const abs = path.resolve(rootDir);
    return crypto.createHash('sha1').update(abs).digest('hex').slice(0, 16);
  }

  registerProject(rootDir: string, name?: string): string {
    this.requireWritable();
    if (name !== undefined && typeof name !== 'string') throw new TypeError('Project name must be a string');
    const id = GlobalBrain.projectIdFor(rootDir);
    const now = Date.now();
    this.pendingOperations.push({
      kind: 'project',
      project: { id, name: name || path.basename(rootDir), rootDir: path.resolve(rootDir), firstSeen: now, lastSeen: now },
    });
    return id;
  }

  registerAgent(agent: AgentTool): void {
    if (!this.initialized || this.shuttingDown) return;
    if (typeof agent !== 'string' || !agent) throw new TypeError('Agent tool must be a nonempty string');
    this.pendingOperations.push({ kind: 'agent', tool: agent, at: Date.now() });
  }

  /** Queue a write. A failed attempt resolves false and retains the entry for a later sync. */
  async write(entry: EntryInput): Promise<boolean> {
    if (this.shuttingDown) return false;
    this.initialize();
    if (this.pendingWriteCount() >= this.config.writeQueueSize) return false;

    const stored = this.prepareEntry(entry);
    return new Promise<boolean>(settle => {
      this.pendingOperations.push({ kind: 'add', entry: stored, queued: true, settle });
    });
  }

  /** Stage an entry for later sync and return its ID immediately. */
  writeSync(entry: EntryInput, id?: string): string {
    this.requireWritable();
    if (id !== undefined && (typeof id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(id))) {
      throw new TypeError('An explicit memory ID must be a UUID.');
    }
    const stored = this.prepareEntry(entry, id);
    const existing = this.entries.get(stored.id);
    if (existing) {
      this.requireSameExplicitEntry(existing, stored);
      return stored.id;
    }
    this.pendingOperations.push({ kind: 'add', entry: stored, queued: false });
    this.entries.set(stored.id, hydrateEntry(structuredClone(stored)));
    return stored.id;
  }

  private requireWritable(): void {
    if (!this.initialized) throw new Error('GlobalBrain not initialized — call init() first');
    if (this.shuttingDown) throw new Error('GlobalBrain is shutting down');
  }

  private prepareEntry(entry: EntryInput, id: string = crypto.randomUUID()): StoredEntry {
    const now = new Date();
    // Snapshot caller input now so later mutations or serialization errors cannot block a commit.
    try {
      const data: unknown = JSON.parse(JSON.stringify({
        ...entry, id, createdAt: now, lastAccessed: now, accessCount: 0,
      }));
      if (hasUniqueKeys([data], 'id', ['projectId', 'projectName', 'agentTool', 'category', 'content'])) {
        return data as StoredEntry;
      }
    } catch { /* Report an invalid input without exposing its contents. */ }
    throw new StorageError('STORE_INVALID_ENTRY', 'The memory entry cannot be stored as JSON.');
  }

  private requireSameExplicitEntry(previous: GlobalEntry | StoredEntry, next: StoredEntry): void {
    const stable = ({ createdAt, lastAccessed, accessCount, ...entry }: GlobalEntry | StoredEntry) => ({
      ...entry, importance: boundedSignal(entry.importance), metadata: isRecord(entry.metadata) ? entry.metadata : {},
    });
    if (!isDeepStrictEqual(stable(previous), stable(next))) {
      throw new StorageError('STORE_INVALID_ENTRY', 'This memory ID is already assigned to a different record.');
    }
  }

  private publishWrite(entry: StoredEntry): void {
    try {
      getBrainBus().publish({
        id: `memory-write:${entry.id}`,
        ts: dateTime(entry.createdAt),
        type: 'memory-write',
        source: entry.agentTool,
        detail: `[${entry.category}] ${entry.content.slice(0, 220)}`,
        meta: {
          category: entry.category,
          importance: boundedSignal(entry.importance),
          projectName: entry.projectName,
          projectId: entry.projectId,
        },
      });
    } catch { /* Activity subscribers cannot affect the outcome of a commit. */ }
  }

  /** Recall matching entries across projects and agents. */
  recall(opts: RecallOptions = {}): GlobalEntry[] {
    if (!this.initialized) return [];
    const keywords = normalizeRecallKeywords(opts.keywords);
    const result = this.findMatches(opts, keywords)
      .sort((a, b) => b.relevance - a.relevance || this.compareEntries(a.entry, b.entry))
      .slice(0, nonNegativeInt(opts.limit, 20))
      .map(match => match.entry);
    this.recordRecall(result.length);
    return result;
  }

  /** Recall entries with heuristic ranking signals and an explanation of the match. */
  recallScored(opts: RecallOptions & { minConfidence?: number } = {}): ScoredGlobalEntry[] {
    if (!this.initialized) return [];
    const keywords = normalizeRecallKeywords(opts.keywords);
    const candidates = this.findMatches(opts, keywords);
    const evidence = new Map<string, Set<AgentTool>>();
    for (const { entry } of candidates) {
      if (normalizeText(entry.content)) evidence.set(evidenceKey(entry), new Set());
    }
    for (const entry of this.entries.values()) {
      if (opts.excludeIds?.has(entry.id)) continue;
      evidence.get(evidenceKey(entry))?.add(entry.agentTool);
    }

    const now = Date.now();
    const minConfidence = boundedSignal(opts.minConfidence);
    const result = candidates
      .map(match => {
        const entry = match.entry;
        const peers = [...(evidence.get(evidenceKey(entry)) ?? [])]
          .filter(tool => tool !== entry.agentTool)
          .sort(compareIds);
        return { ...entry, confidence: this.computeConfidence(match, keywords.length, peers, now) };
      })
      .filter(entry => entry.confidence.score >= minConfidence)
      .sort((a, b) => b.confidence.score - a.confidence.score || this.compareEntries(a, b))
      .slice(0, nonNegativeInt(opts.limit, 20));
    this.recordRecall(result.length);
    return result;
  }

  /** Read the scoped fields used by context ranking without exposing mutable memory records. */
  *contextEntries(opts: Pick<RecallOptions, 'projectId' | 'minImportance' | 'excludeIds'>): IterableIterator<ContextSearchMemory> {
    if (!this.initialized) return;
    const minImportance = boundedSignal(opts.minImportance);
    for (const entry of this.entries.values()) {
      if (opts.projectId && entry.projectId !== opts.projectId) continue;
      if (opts.excludeIds?.has(entry.id) || entry.importance < minImportance) continue;
      yield contextSearchMemory(entry);
    }
  }

  private findMatches(opts: RecallOptions, keywords: string[]): RecallMatch[] {
    const minImportance = boundedSignal(opts.minImportance);
    const matches: RecallMatch[] = [];
    for (const entry of this.entries.values()) {
      if (opts.excludeIds?.has(entry.id)) continue;
      if (opts.projectId && entry.projectId !== opts.projectId) continue;
      if (opts.agentTool && entry.agentTool !== opts.agentTool) continue;
      if (opts.category && entry.category !== opts.category) continue;
      if (boundedSignal(entry.importance) < minImportance) continue;
      if (!keywords.length) {
        matches.push({ entry, relevance: 0.5, matchedKeywords: [] });
        continue;
      }
      const content = normalizeText(entry.content);
      const category = normalizeText(entry.category);
      const metadata = searchableMetadata(entry.metadata);
      const project = normalizeText(entry.projectName);
      const tool = normalizeText(entry.agentTool);
      const matchedKeywords: string[] = [];
      let weight = 0;
      for (const term of keywords) {
        if (content.includes(term)) weight += 1;
        else if (category.includes(term)) weight += 0.9;
        else if (metadata.includes(term)) weight += 0.55;
        else if (project.includes(term) || tool.includes(term)) weight += 0.25;
        else continue;
        matchedKeywords.push(term);
      }
      if (matchedKeywords.length) matches.push({ entry, relevance: weight / keywords.length, matchedKeywords });
    }
    return matches;
  }

  private compareEntries(a: GlobalEntry, b: GlobalEntry): number {
    return boundedSignal(b.importance) - boundedSignal(a.importance) ||
      dateTime(b.lastAccessed) - dateTime(a.lastAccessed) ||
      compareIds(a.id, b.id);
  }

  private recordRecall(count: number): void {
    if (count > 0) this.stats.hits++;
    else this.stats.misses++;
  }

  private computeConfidence(match: RecallMatch, totalKeywords: number, peers: AgentTool[], now: number): RecallConfidence {
    const createdAt = dateTime(match.entry.createdAt);
    const recency = createdAt > 0 && createdAt <= now ? Math.pow(0.5, (now - createdAt) / (30 * DAY_MS)) : 0;
    const importance = boundedSignal(match.entry.importance);
    const corroboration = Math.min(1, peers.length / 2);
    const usage = Math.min(1, Math.log10(nonNegativeInt(match.entry.accessCount) + 1) / Math.log10(21));
    const round = (value: number) => Math.round(boundedSignal(value) * 1000) / 1000;
    const score = round(match.relevance * 0.30 + importance * 0.25 + recency * 0.20 + usage * 0.15 + corroboration * 0.10);
    return {
      score,
      level: score >= 0.66 ? 'high' : score >= 0.33 ? 'medium' : 'low',
      signals: {
        relevance: round(match.relevance),
        recency: round(recency),
        importance: round(importance),
        corroboration: round(corroboration),
        usage: round(usage),
      },
      explanation: { matchedKeywords: match.matchedKeywords, totalKeywords, corroboratingAgents: peers },
    };
  }

  /** Bump an entry's access count without replacing its persisted snapshot. */
  touch(id: string): void {
    if (!this.initialized || this.shuttingDown) return;
    const entry = this.entries.get(id);
    if (!entry) return;
    const now = Date.now();
    entry.accessCount = nonNegativeInt(nonNegativeInt(entry.accessCount) + 1);
    entry.lastAccessed = new Date(Math.max(dateTime(entry.lastAccessed), now));
    this.pendingOperations.push({ kind: 'touch', id, at: now });
  }

  recallByIds(ids: string[]): GlobalEntry[] {
    const out: GlobalEntry[] = [];
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (entry) out.push(entry);
    }
    return out;
  }

  /** Read one memory without exposing mutable in-memory state or recording a recall. */
  getEntry(id: string): GlobalEntry | undefined {
    const entry = this.entries.get(id);
    return entry ? structuredClone(entry) : undefined;
  }

  /** Hash the actual read view, including staged entries, without committing or recording access. */
  readFingerprint(projectId?: string): string {
    const hash = crypto.createHash('sha256');
    for (const entry of this.entries.values()) {
      if (projectId !== undefined && entry.projectId !== projectId) continue;
      hash.update(JSON.stringify(entry));
      hash.update('\n');
    }
    return hash.digest('hex');
  }

  /** Refresh the local read view without acknowledging or committing pending operations. */
  refresh(): void {
    this.initialize();
    this.refreshSnapshot();
  }

  /** Chronological memory stream for dashboards and handoffs. */
  timeline(opts: Pick<RecallOptions, 'projectId' | 'agentTool' | 'category' | 'limit' | 'excludeIds'> = {}): BrainTimelineEvent[] {
    if (!this.initialized) return [];
    return Array.from(this.entries.values())
      .filter(entry => !opts.projectId || entry.projectId === opts.projectId)
      .filter(entry => !opts.agentTool || entry.agentTool === opts.agentTool)
      .filter(entry => !opts.category || entry.category === opts.category)
      .filter(entry => !opts.excludeIds?.has(entry.id))
      .sort((a, b) => dateTime(b.createdAt) - dateTime(a.createdAt) || compareIds(a.id, b.id))
      .slice(0, nonNegativeInt(opts.limit, 50))
      .map(({ id, projectId, projectName, agentTool, category, content, importance, createdAt, lastAccessed, metadata }) => ({
        id, projectId, projectName, agentTool, category, content, importance, createdAt, lastAccessed, metadata,
      }));
  }

  getStats(): GlobalBrainStats {
    const checks = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      totalEntries: this.entries.size,
      pendingWrites: this.pendingWriteCount(),
      hitRate: checks ? this.stats.hits / checks : 0,
      uptime: Date.now() - this.startedAt,
    };
  }

  private pendingWriteCount(): number {
    return this.pendingOperations.filter(operation => operation.kind === 'add' && operation.queued).length;
  }

  /** Absolute path to the on-disk brain store. */
  get dbPath(): string {
    return this.config.dbPath;
  }

  getStorageHealth(): GlobalBrainStorageHealth {
    return {
      status: this.lastError ? 'error' : this.pendingOperations.length ? 'pending' : 'healthy',
      dbPath: this.dbPath,
      initialized: this.initialized,
      pendingOperations: this.pendingOperations.length,
      lastSuccessfulSync: this.lastSuccessfulSync,
      lastError: this.lastError ? { ...this.lastError } : null,
    };
  }

  /** Flush pending operations as one atomic commit against the latest snapshot. */
  async sync(): Promise<void> {
    if (this.syncInFlight) {
      await this.syncInFlight;
      return this.sync();
    }
    if (!this.initialized) return;
    if (!this.pendingOperations.length) {
      this.refreshSnapshot();
      return;
    }

    this.syncInFlight = this.commitPending();
    try {
      await this.syncInFlight;
    } finally {
      this.syncInFlight = null;
    }
  }

  private async commitPending(): Promise<void> {
    let releaseLock: (() => void) | undefined;
    let committed: Addition[] | undefined;
    try {
      releaseLock = await this.acquireLock();
      // Capture operations after acquiring the lock. No async work follows inside the merge.
      const operations = this.pendingOperations;
      const additions = operations.filter((operation): operation is Addition => operation.kind === 'add');
      const data = this.mergeOperations(this.readLatestSnapshot().data, operations);
      const { payload, pruned } = this.serializeSnapshot(data, additions);
      const entries = this.hydrateEntries(data);
      const sizeMB = Buffer.byteLength(payload) / BYTES_PER_MB;
      this.replaceSnapshot(payload);

      this.adoptSnapshot(data, sizeMB, entries);
      const now = new Date();
      this.stats.lastSync = now;
      if (pruned) this.stats.lastPrune = now;
      this.lastSuccessfulSync = now.toISOString();
      this.lastError = null;
      committed = additions;
      operations.length = 0;
    } catch (error) {
      const failure = this.recordError(error);
      for (const operation of this.pendingOperations) {
        if (operation.kind === 'add') {
          operation.settle?.(false);
          operation.settle = undefined;
        }
      }
      throw failure;
    } finally {
      try {
        releaseLock?.();
      } catch (error) {
        // Lock cleanup cannot reverse a successful replacement or make its operations retryable.
        if (committed) this.recordError(error);
      }
    }

    for (const operation of committed) {
      operation.settle?.(true);
      this.publishWrite(operation.entry);
    }
  }

  private recordError(error: unknown): StorageError {
    const failure = error instanceof StorageError
      ? error
      : new StorageError('STORE_WRITE_FAILED', 'Could not commit the global brain store.');
    this.lastError = { code: failure.code, message: failure.message, at: new Date().toISOString() };
    return failure;
  }

  private readLatestSnapshot(): Snapshot {
    let raw: string;
    try {
      raw = fs.readFileSync(this.dbPath, 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return { data: { schemaVersion: 1, entries: [], projects: [], agents: [] }, sizeMB: 0 };
      }
      throw new StorageError('STORE_READ_FAILED', `Could not read the global brain store (${errorCode(error) ?? 'I/O error'}).`);
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new StorageError('STORE_INVALID_JSON', 'The global brain store contains invalid JSON.');
    }
    validateSnapshot(data);
    return { data, sizeMB: Buffer.byteLength(raw) / BYTES_PER_MB };
  }

  private hydrateEntries(data: PersistShape): Map<string, GlobalEntry> {
    return new Map(data.entries.map(entry => [entry.id, hydrateEntry(entry)]));
  }

  private adoptSnapshot(data: PersistShape, sizeMB: number, entries: Map<string, GlobalEntry>): void {
    this.entries = entries;
    this.stats.totalProjects = data.projects.length;
    this.stats.totalAgents = data.agents.length;
    this.stats.totalSizeMB = sizeMB;
  }

  private refreshSnapshot(): void {
    try {
      const { data, sizeMB } = this.readLatestSnapshot();
      const view = this.pendingOperations.length ? this.mergeOperations(data, this.pendingOperations) : data;
      this.adoptSnapshot(view, sizeMB, this.hydrateEntries(view));
      if (this.lastError?.code !== 'STORE_LOCK_FAILED') this.lastError = null;
    } catch (error) {
      throw this.recordError(error);
    }
  }

  private mergeOperations(data: PersistShape, operations: readonly PendingOperation[]): PersistShape {
    const entries = new Map(data.entries.map(entry => [entry.id, entry]));
    const projects = new Map(data.projects.map(project => [project.id, project]));
    const agents = new Map(data.agents.map(agent => [agent.tool, agent]));

    for (const operation of operations) {
      switch (operation.kind) {
        case 'add': {
          const previous = entries.get(operation.entry.id);
          if (previous) this.requireSameExplicitEntry(previous, operation.entry);
          else entries.set(operation.entry.id, operation.entry);
          break;
        }
        case 'touch': {
          const entry = entries.get(operation.id);
          if (entry) {
            entries.set(operation.id, {
              ...entry,
              accessCount: nonNegativeInt(nonNegativeInt(entry.accessCount) + 1),
              lastAccessed: new Date(Math.max(dateTime(entry.lastAccessed), operation.at)),
            });
          }
          break;
        }
        case 'project': {
          const { project } = operation;
          const existing = projects.get(project.id);
          const lastSeen = nonNegativeInt(existing?.lastSeen);
          const latest = existing && lastSeen > project.lastSeen ? existing : project;
          projects.set(project.id, {
            ...existing,
            ...latest,
            firstSeen: Math.min(nonNegativeInt(existing?.firstSeen) || project.firstSeen, project.firstSeen),
            lastSeen: Math.max(lastSeen, project.lastSeen),
          });
          break;
        }
        case 'agent': {
          const existing = agents.get(operation.tool);
          agents.set(operation.tool, {
            ...existing,
            tool: operation.tool,
            firstSeen: Math.min(nonNegativeInt(existing?.firstSeen) || operation.at, operation.at),
            lastSeen: Math.max(nonNegativeInt(existing?.lastSeen), operation.at),
            sessionCount: nonNegativeInt(nonNegativeInt(existing?.sessionCount) + 1),
          });
          break;
        }
      }
    }
    return { ...data, entries: [...entries.values()], projects: [...projects.values()], agents: [...agents.values()] };
  }

  private serializeSnapshot(data: PersistShape, additions: Addition[]): { payload: string; pruned: boolean } {
    const payload = JSON.stringify(data);
    if (Buffer.byteLength(payload) / BYTES_PER_MB <= this.config.autoPruneMB) return { payload, pruned: false };

    const cutoff = Date.now() - 90 * DAY_MS;
    const addedIds = new Set(additions.map(({ entry }) => entry.id));
    const retained = data.entries.filter(entry => {
      const lastAccess = dateTime(entry.lastAccessed);
      return addedIds.has(entry.id) || !lastAccess || lastAccess >= cutoff ||
        boundedSignal(entry.importance) >= 0.3 || nonNegativeInt(entry.accessCount) >= 2;
    });
    if (retained.length === data.entries.length) return { payload, pruned: false };
    data.entries = retained;
    return { payload: JSON.stringify(data), pruned: true };
  }

  private async acquireLock(): Promise<() => void> {
    const lockPath = `${this.dbPath}.lock`;
    const token = JSON.stringify({ pid: process.pid, id: crypto.randomUUID(), acquiredAt: new Date().toISOString() });
    const deadline = performance.now() + nonNegativeInt(this.config.lockTimeoutMs, LOCK_TIMEOUT_MS);

    for (;;) {
      let fd: number;
      try {
        fd = fs.openSync(lockPath, 'wx', 0o600);
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          throw new StorageError('STORE_LOCK_FAILED', `Could not acquire the global brain store lock (${errorCode(error) ?? 'I/O error'}).`);
        }
        const remaining = deadline - performance.now();
        if (remaining <= 0) break;
        await delay(Math.min(remaining, LOCK_POLL_MS));
        if (performance.now() >= deadline) break;
        continue;
      }

      let identity: fs.BigIntStats | undefined;
      try {
        identity = fs.fstatSync(fd, { bigint: true });
        fs.writeFileSync(fd, token, 'utf8');
        fs.closeSync(fd);
      } catch {
        try { fs.closeSync(fd); } catch { /* preserve the lock initialization error */ }
        // A failed token write can leave partial bytes. Check the exclusive file's identity.
        try {
          const current = fs.lstatSync(lockPath, { bigint: true });
          if (identity && matchesFileIdentity(lockPath, identity, current)) fs.unlinkSync(lockPath);
        } catch { /* report the lock initialization error */ }
        throw new StorageError('STORE_LOCK_FAILED', 'Could not initialize the global brain store lock.');
      }

      return () => {
        try {
          if (fs.readFileSync(lockPath, 'utf8') === token) {
            fs.unlinkSync(lockPath);
            return;
          }
        } catch {
          throw new StorageError('STORE_LOCK_FAILED', 'Could not release the global brain store lock.');
        }
        throw new StorageError('STORE_LOCK_FAILED', 'Global brain store lock ownership changed before release.');
      };
    }

    throw new StorageError('STORE_LOCK_TIMEOUT', 'Timed out waiting for the global brain store lock.');
  }

  private replaceSnapshot(payload: string): void {
    const tmp = `${this.dbPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    let fd: number | undefined;
    let ownsTemp = false;
    try {
      fd = fs.openSync(tmp, 'wx', 0o600);
      ownsTemp = true;
      fs.writeFileSync(fd, payload, 'utf8');
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(tmp, this.dbPath);
      ownsTemp = false;
    } catch (error) {
      throw new StorageError('STORE_WRITE_FAILED', `Could not replace the global brain store (${errorCode(error) ?? 'I/O error'}).`);
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* preserve the original write error */ }
      }
      if (ownsTemp) {
        try { fs.unlinkSync(tmp); } catch { /* preserve the original write error */ }
      }
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    try {
      if (this.pendingOperations.length || this.syncInFlight) await this.sync();
      this.initialized = false;
      if (GlobalBrain.instance === this) GlobalBrain.instance = null;
    } finally {
      this.shuttingDown = false;
    }
  }
}

export function getGlobalBrain(config?: Partial<GlobalBrainConfig>): GlobalBrain {
  return GlobalBrain.getInstance(config);
}
