import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { z } from 'zod';
import { GlobalBrain } from '../brain/global-brain.js';
import { NativeCodexConnection, NativeCodexError, type NativeCodexFactory } from '../brain/native-codex.js';
import { WorkspaceDirectory, insideWorkspaceParent, verifiedWorkspaceRoot } from '../brain/workspace-directory.js';
import { ProjectPolicyStore, nativeChatKey, toolParticipates } from '../brain/project-policy.js';
import { WorkspaceConnections } from '../brain/workspace-connections.js';

let running = 0;
const INDEX_DEADLINE_MS = 12_000;
const INDEX_VISIBLE_MS = 75_000;
const CURSOR_TTL_MS = 5 * 60_000;
const MAX_HANDLES = 384;
const MAX_DISCOVERED = 128;
const MAX_REMEMBERED_TITLES = 512;
const WATCH_INTERVAL_MS = 60_000;
const WATCH_TTL_MS = 125_000;
const tokenSchema = z.string().uuid();
const projectIdSchema = z.string().regex(/^[0-9a-f]{16}$/u);
const indexInput = z.strictObject({ projectId: projectIdSchema, pageToken: tokenSchema.optional(), archived: z.boolean().optional() });
const discoveryInput = z.strictObject({ kind: z.literal('scan'), pageToken: tokenSchema.optional() });
const addInput = z.strictObject({ kind: z.literal('add'), candidateToken: tokenSchema,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) });
const watchInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('watch-start'), parent: z.string().min(1).max(2048).optional() }),
  z.strictObject({ kind: z.literal('watch-check'), watchToken: tokenSchema }),
  z.strictObject({ kind: z.literal('watch-stop'), watchToken: tokenSchema }),
]);
type DirectoryHandle =
  | { kind: 'titles'; projectId: string; revision: number; archived: boolean; cursor: string; seen: readonly string[] }
  | { kind: 'discovery'; cursor: string; seen: readonly string[] }
  | { kind: 'candidate'; root: string; projectId: string; threadId: string; recentWatch?: { token: string; until: number } }
  | { kind: 'recent'; root: string; parent?: string; enabledAt: number; nextAt: number; expiresAt: number; busy: boolean };
const handles = new Map<string, { scope: string; until: number; value: DirectoryHandle }>();
const interrupted = () => new NativeCodexError('DIRECTORY_INDEX_INTERRUPTED', 'The Codex index check did not finish. Try again shortly.', 503);
const expired = () => new NativeCodexError('DIRECTORY_HANDLE_EXPIRED', 'The index selection expired. Start a fresh check.', 409);

function remember(scope: string, value: DirectoryHandle): string {
  const now = Date.now();
  for (const [id, item] of handles) if (item.until <= now) handles.delete(id);
  if (handles.size >= MAX_HANDLES) handles.delete(handles.keys().next().value!);
  const id = randomUUID();
  handles.set(id, { scope, until: now + CURSOR_TTL_MS, value });
  return id;
}

function retrieve<K extends DirectoryHandle['kind']>(scope: string, id: string, kind: K) {
  const saved = handles.get(id);
  if (!saved || saved.scope !== scope || saved.until <= Date.now() || saved.value.kind !== kind) throw expired();
  return saved.value as Extract<DirectoryHandle, { kind: K }>;
}

function codexPolicy(root: string, projectId: string) {
  const policy = new ProjectPolicyStore(root, projectId).get();
  if (!toolParticipates(policy, 'codex') || !new WorkspaceConnections(root, projectId).allows('codex')) {
    throw new NativeCodexError('DIRECTORY_SHARING_OFF', 'This workspace has paused participation for Codex.', 403);
  }
  return policy;
}

const chatHidden = (policy: ReturnType<typeof codexPolicy>, threadId: string) =>
  policy.chats.some(chat => !chat.shareContext && chat.key === nativeChatKey('codex', threadId));

async function withIndex<T>(root: string, factory: NativeCodexFactory | undefined, requestSignal: AbortSignal | undefined,
  read: (connection: NativeCodexConnection) => Promise<T>): Promise<T> {
  if (running >= 2) throw new NativeCodexError('DIRECTORY_INDEX_BUSY', 'A native index check is in progress. Try again shortly.', 429);
  const timeout = AbortSignal.timeout(INDEX_DEADLINE_MS);
  const signal = requestSignal ? AbortSignal.any([requestSignal, timeout]) : timeout;
  if (signal.aborted) throw interrupted();
  const connection = new NativeCodexConnection(root, factory);
  const cancel = () => connection.close();
  signal.addEventListener('abort', cancel, { once: true });
  running++;
  try {
    await connection.connect();
    if (signal.aborted) throw interrupted();
    const result = await read(connection);
    if (signal.aborted) throw interrupted();
    return result;
  } catch (error) {
    if (signal.aborted) throw interrupted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    try { connection.close(); } finally { running--; }
  }
}

/** On-demand native titles for one registered root. Cursor handles stay bound to this portal and policy. */
export async function directoryCodexIndex(input: Record<string, unknown>, directory = new WorkspaceDirectory(), factory?: NativeCodexFactory,
  requestSignal?: AbortSignal, scope = 'local') {
  const parsed = indexInput.safeParse(input);
  if (!parsed.success) throw new TypeError('Choose a project from the local workspace directory.');
  const { projectId, pageToken, archived = false } = parsed.data;
  const resolve = () => {
    const row = directory.list().projects.find(item => item.projectId === projectId);
    if (!row) throw new NativeCodexError('DIRECTORY_NOT_REGISTERED', 'This workspace is no longer listed.', 404);
    const root = verifiedWorkspaceRoot(row.root);
    if (GlobalBrain.projectIdFor(root) !== projectId) throw expired();
    return { root, policy: codexPolicy(root, projectId) };
  };
  const { root, policy } = resolve();
  const handle = pageToken ? retrieve(scope, pageToken, 'titles') : null;
  if (handle && (handle.projectId !== projectId || handle.archived !== archived || handle.revision !== policy.revision)) throw expired();
  const page = await withIndex(root, factory, requestSignal, connection => connection.directoryPage(handle?.cursor, archived, true));
  const current = resolve();
  if (current.root !== root || (handle && handle.revision !== current.policy.revision)) throw expired();
  const seen = new Set(handle?.seen);
  const threads = page.threads.flatMap(thread => {
    if (seen.has(thread.id) || chatHidden(current.policy, thread.id)) return [];
    seen.add(thread.id);
    return [{ name: thread.name, updatedAt: thread.updatedAt, status: thread.status.type }];
  });
  const nextPageToken = page.nextCursor && page.nextCursor !== handle?.cursor ? remember(scope,
    { kind: 'titles', projectId, revision: current.policy.revision, archived, cursor: page.nextCursor, seen: [...seen].slice(-MAX_REMEMBERED_TITLES) }) : null;
  return { projectId, observedAt: page.observedAt, expiresAt: new Date(Date.parse(page.observedAt) + INDEX_VISIBLE_MS).toISOString(),
    policyRevision: current.policy.revision, archived, threads, nextPageToken, source: 'codex-app-server' };
}

export async function discoverCodexWorkspaces(input: Record<string, unknown>, currentRoot: string, scope: string,
  directory = new WorkspaceDirectory(), factory?: NativeCodexFactory, requestSignal?: AbortSignal) {
  const parsed = discoveryInput.safeParse(input);
  if (!parsed.success) throw new TypeError('Request a page of workspace candidates.');
  const handle = parsed.data.pageToken ? retrieve(scope, parsed.data.pageToken, 'discovery') : null;
  const root = verifiedWorkspaceRoot(currentRoot);
  const currentId = GlobalBrain.projectIdFor(root);
  codexPolicy(root, currentId);
  const page = await withIndex(root, factory, requestSignal, connection => connection.discoverWorkspaceRoots(handle?.cursor));
  codexPolicy(root, currentId);
  const index = directory.list();
  const excluded = new Set([...index.projects, ...index.forgotten].map(item => item.projectId));
  const seen = new Set(handle?.seen);
  const expiresAt = new Date(Date.parse(page.observedAt) + CURSOR_TTL_MS).toISOString();
  const candidates = [];
  for (const item of page.roots) {
    if (seen.size >= MAX_DISCOVERED) break;
    try {
      const candidateRoot = verifiedWorkspaceRoot(item.cwd);
      const projectId = GlobalBrain.projectIdFor(candidateRoot);
      if (projectId === currentId || excluded.has(projectId) || seen.has(projectId) ||
          chatHidden(codexPolicy(candidateRoot, projectId), item.threadId)) continue;
      seen.add(projectId);
      candidates.push({ projectId, projectName: basename(candidateRoot), root: candidateRoot, updatedAt: item.updatedAt, expiresAt,
        candidateToken: remember(scope, { kind: 'candidate', root: candidateRoot, projectId, threadId: item.threadId }) });
    } catch { /* Unusable and private roots stay out of discovery. */ }
  }
  const capped = seen.size >= MAX_DISCOVERED;
  const nextPageToken = !capped && page.nextCursor && page.nextCursor !== handle?.cursor ? remember(scope,
    { kind: 'discovery', seen: [...seen], cursor: page.nextCursor }) : null;
  return { candidates, nextPageToken, capped, observedAt: page.observedAt, expiresAt, source: 'codex-app-server' };
}

/** Add an explicitly selected candidate without lifting a project or chat exclusion. */
export async function addDiscoveredCodexWorkspace(input: Record<string, unknown>, currentRoot: string, scope: string,
  directory = new WorkspaceDirectory()) {
  const parsed = addInput.safeParse(input);
  if (!parsed.success) throw new TypeError('Choose a discovered workspace and the current directory revision.');
  const current = verifiedWorkspaceRoot(currentRoot);
  codexPolicy(current, GlobalBrain.projectIdFor(current));
  const candidate = retrieve(scope, parsed.data.candidateToken, 'candidate');
  if (candidate.recentWatch) {
    const watch = retrieve(scope, candidate.recentWatch.token, 'recent');
    if (watch.root !== current || watch.expiresAt <= Date.now() || candidate.recentWatch.until <= Date.now() ||
        !directory.list().projects.some(row => row.root === current)) throw expired();
  }
  const root = verifiedWorkspaceRoot(candidate.root);
  if (GlobalBrain.projectIdFor(root) !== candidate.projectId ||
      chatHidden(codexPolicy(root, candidate.projectId), candidate.threadId) ||
      directory.list().forgotten.some(row => row.projectId === candidate.projectId)) throw expired();
  const index = await directory.register(root, 'operator', { expectedRevision: parsed.data.expectedRevision });
  if (!index.projects.some(row => row.projectId === candidate.projectId)) throw expired();
  return index;
}

/** A portal-scoped lease. Only an explicitly approved parent permits automatic additions. */
export async function watchCodexWorkspaces(input: Record<string, unknown>, currentRoot: string, scope: string,
  directory = new WorkspaceDirectory(), factory?: NativeCodexFactory, requestSignal?: AbortSignal, now = Date.now) {
  const parsed = watchInput.safeParse(input);
  if (!parsed.success) throw new TypeError('Choose a valid recent workspace check.');
  const change = parsed.data;
  if (change.kind === 'watch-stop') {
    const handle = handles.get(change.watchToken);
    if (handle?.scope === scope && handle.value.kind === 'recent') handles.delete(change.watchToken);
    return { enabled: false };
  }
  const current = verifiedWorkspaceRoot(currentRoot);
  const currentId = GlobalBrain.projectIdFor(current);
  const assertCurrent = () => {
    if (!directory.list().projects.some(row => row.projectId === currentId && row.root === current)) throw expired();
    codexPolicy(current, currentId);
  };
  const assertParent = (parent: string) => {
    if (verifiedWorkspaceRoot(parent) !== parent) throw expired();
    const id = GlobalBrain.projectIdFor(parent);
    if (directory.list().forgotten.some(row => row.projectId === id)) throw expired();
    codexPolicy(parent, id);
  };
  assertCurrent();
  if (change.kind === 'watch-start') {
    const parent = change.parent ? verifiedWorkspaceRoot(change.parent) : undefined;
    if (parent && parent !== current && !insideWorkspaceParent(parent, current) && !insideWorkspaceParent(current, parent)) {
      throw new TypeError('Choose a parent folder containing this workspace, or a folder inside it.');
    }
    if (parent) assertParent(parent);
    const started = now();
    const watchToken = remember(scope, { kind: 'recent', root: current, parent, enabledAt: started,
      nextAt: started, expiresAt: started + WATCH_TTL_MS, busy: false });
    return { enabled: true, watchToken, enabledAt: new Date(started).toISOString() };
  }
  const token = change.watchToken;
  const watch = retrieve(scope, token, 'recent');
  const live = () => !requestSignal?.aborted && watch.root === current && watch.expiresAt > now() && handles.get(token)?.value === watch;
  if (!live()) throw expired();
  if (watch.parent) assertParent(watch.parent);
  if (watch.busy || now() < watch.nextAt) throw new NativeCodexError('DIRECTORY_WATCH_WAIT', 'The recent workspace check runs at most once per minute.', 429);
  watch.busy = true;
  watch.nextAt = now() + WATCH_INTERVAL_MS;
  watch.expiresAt = now() + WATCH_TTL_MS;
  handles.get(token)!.until = Date.now() + WATCH_TTL_MS;
  try {
    const page = await withIndex(current, factory, requestSignal, connection => connection.discoverWorkspaceRoots(null, watch.enabledAt));
    if (!live()) throw expired();
    assertCurrent();
    const allow = (root: string, projectId: string, threadId: string) => !chatHidden(codexPolicy(root, projectId), threadId);
    const readExcluded = () => {
      const { projects, forgotten } = directory.list();
      return new Set([...projects, ...forgotten].map(item => item.projectId));
    };
    const excluded = readExcluded();
    const roots = new Map<string, { root: string; projectId: string; threadId: string; updatedAt: string | null }>();
    for (const { cwd, threadId, updatedAt } of page.roots) {
      try {
        const root = verifiedWorkspaceRoot(cwd), projectId = GlobalBrain.projectIdFor(root);
        if (!excluded.has(projectId) && !roots.has(projectId) && allow(root, projectId, threadId)) roots.set(projectId, { root, projectId, threadId, updatedAt });
      } catch { /* Linked, protected and excluded folders stay out of suggestions. */ }
    }
    let added = 0;
    const parent = watch.parent;
    if (parent) {
      const withinParent = [...roots.values()].filter(row => insideWorkspaceParent(parent, row.root));
      const threads = new Map(withinParent.map(row => [row.projectId, row.threadId]));
      added = await directory.registerObservedCodex(parent, withinParent.map(row => row.root), (root, id) => {
        if (!live()) return false;
        assertCurrent();
        assertParent(parent);
        const threadId = threads.get(id);
        return !!threadId && allow(root, id, threadId);
      });
    }
    if (!live()) throw expired();
    assertCurrent();
    const latestExcluded = readExcluded();
    const expiresAt = new Date(watch.expiresAt).toISOString();
    const candidates = [...roots.values()].flatMap(({ root, projectId, threadId, updatedAt }) => {
      try {
        if (latestExcluded.has(projectId) || !allow(root, projectId, threadId)) return [];
        return [{ projectId, projectName: basename(root), root, updatedAt, expiresAt,
          candidateToken: remember(scope, { kind: 'candidate', root, projectId, threadId, recentWatch: { token, until: watch.expiresAt } }) }];
      } catch { return []; }
    });
    return { enabled: true, added, candidates, observedAt: page.observedAt, expiresAt, limited: !!page.nextCursor };
  } finally { watch.busy = false; }
}
