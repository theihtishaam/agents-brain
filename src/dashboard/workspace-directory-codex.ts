import { NativeCodexConnection, NativeCodexError, type NativeCodexFactory } from '../brain/native-codex.js';
import { WorkspaceDirectory, verifiedWorkspaceRoot } from '../brain/workspace-directory.js';
import { ProjectPolicyStore, nativeChatKey, toolParticipates } from '../brain/project-policy.js';
import { WorkspaceConnections } from '../brain/workspace-connections.js';

let running = 0;
const INDEX_DEADLINE_MS = 12_000;
const INDEX_VISIBLE_MS = 75_000;
const interrupted = () => new NativeCodexError('DIRECTORY_INDEX_INTERRUPTED', 'The Codex index check did not finish. Try again shortly.', 503);

/** On-demand native index for one registered root. Only thread metadata leaves the connector. */
export async function directoryCodexIndex(input: Record<string, unknown>, directory = new WorkspaceDirectory(), factory?: NativeCodexFactory,
  requestSignal?: AbortSignal) {
  if (Object.keys(input).length !== 1 || typeof input.projectId !== 'string' || !/^[0-9a-f]{16}$/u.test(input.projectId)) {
    throw new TypeError('Choose a project from the local workspace directory.');
  }
  const id = input.projectId;
  const resolve = () => {
    const row = directory.list().projects.find(item => item.projectId === id);
    if (!row) throw new NativeCodexError('DIRECTORY_NOT_REGISTERED', 'This workspace is no longer listed.', 404);
    const root = verifiedWorkspaceRoot(row.root);
    const policy = new ProjectPolicyStore(root, id).get();
    if (!toolParticipates(policy, 'codex') || !new WorkspaceConnections(root, id).allows('codex')) {
      throw new NativeCodexError('DIRECTORY_SHARING_OFF', 'This workspace has paused participation for Codex.', 403);
    }
    return { root, policy };
  };
  const { root } = resolve();
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
    const page = await connection.list();
    if (signal.aborted) throw interrupted();
    const current = resolve();
    if (current.root !== root) throw new NativeCodexError('DIRECTORY_PROJECT_CHANGED', 'The project directory changed. Refresh and retry.', 409);
    const hidden = new Set(current.policy.chats.filter(chat => !chat.shareContext).map(chat => chat.key));
    const threads = page.threads.filter(thread => !hidden.has(nativeChatKey('codex', thread.id))).slice(0, 8)
      .map(thread => ({ name: thread.name, updatedAt: thread.updatedAt, status: thread.status.type }));
    return { projectId: id, observedAt: page.observedAt, expiresAt: new Date(Date.parse(page.observedAt) + INDEX_VISIBLE_MS).toISOString(),
      policyRevision: current.policy.revision, threads, source: 'codex-app-server' };
  } catch (error) {
    if (signal.aborted) throw interrupted();
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    try { connection.close(); } finally { running--; }
  }
}
