import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GlobalBrain } from '../brain/global-brain.js';
import { NativeOpenCodeError, readOpenCodeIndex } from '../brain/native-opencode-index.js';
import { ProjectPolicyStore, nativeChatKey, toolParticipates } from '../brain/project-policy.js';
import { WorkspaceConnections } from '../brain/workspace-connections.js';
import { WorkspaceDirectory, verifiedWorkspaceRoot } from '../brain/workspace-directory.js';

const query = z.strictObject({ projectId: z.string().regex(/^[0-9a-f]{16}$/u), pageToken: z.string().uuid().optional() });
const handles = new Map<string, { scope: string; projectId: string; until: number; revision: number; cursor: string }>();
const expired = () => new NativeOpenCodeError('OPENCODE_INDEX_EXPIRED', 'The OpenCode index page expired. Start a fresh check.', 409);
let running = false;

/** Return only approved session titles and timestamps from a registered project. */
export async function directoryOpenCodeIndex(input: Record<string, unknown>, scope: string, directory = new WorkspaceDirectory(),
  reader = readOpenCodeIndex, requestSignal?: AbortSignal) {
  const parsed = query.safeParse(input);
  if (!parsed.success) throw new TypeError('Choose a registered workspace and an optional index page.');
  const { projectId, pageToken } = parsed.data;
  const resolve = () => {
    const entry = directory.list().projects.find(project => project.projectId === projectId);
    if (!entry) throw new NativeOpenCodeError('OPENCODE_INDEX_NOT_REGISTERED', 'This workspace is no longer listed.', 404);
    const root = verifiedWorkspaceRoot(entry.root);
    if (GlobalBrain.projectIdFor(root) !== projectId) throw expired();
    const policy = new ProjectPolicyStore(root, projectId).get();
    if (!toolParticipates(policy, 'opencode') || !new WorkspaceConnections(root, projectId).allows('opencode')) {
      throw new NativeOpenCodeError('OPENCODE_INDEX_SHARING_OFF', 'This workspace has paused participation for OpenCode.', 403);
    }
    return { root, policy };
  };
  const { root, policy } = resolve();
  const handle = pageToken ? handles.get(pageToken) : undefined;
  if (pageToken && (!handle || handle.scope !== scope || handle.projectId !== projectId ||
      handle.until <= Date.now() || handle.revision !== policy.revision)) throw expired();
  if (running) throw new NativeOpenCodeError('OPENCODE_INDEX_BUSY', 'An OpenCode index check is already in progress.', 429);
  running = true;
  try {
    const page = await reader(root, handle?.cursor, undefined, requestSignal);
    const current = resolve();
    if (current.root !== root || (handle && handle.revision !== current.policy.revision)) throw expired();
    const hidden = new Set(current.policy.chats.filter(chat => !chat.shareContext).map(chat => chat.key));
    const seen = new Set<string>();
    const sessions = page.sessions.flatMap(session => {
      if (seen.has(session.id) || hidden.has(nativeChatKey('opencode', session.id))) return [];
      seen.add(session.id);
      return [{ name: session.title, updatedAt: session.updatedAt }];
    });
    let nextPageToken: string | null = null;
    if (page.nextCursor && page.nextCursor !== handle?.cursor) {
      const now = Date.now();
      for (const [id, item] of handles) if (item.until <= now) handles.delete(id);
      if (handles.size >= 64) handles.delete(handles.keys().next().value!);
      nextPageToken = randomUUID();
      handles.set(nextPageToken, { scope, projectId, revision: current.policy.revision, cursor: page.nextCursor, until: now + 5 * 60_000 });
    }
    return { projectId, policyRevision: current.policy.revision, observedAt: page.observedAt,
      expiresAt: new Date(Date.parse(page.observedAt) + 75_000).toISOString(), sessions, nextPageToken, source: 'opencode-acp' };
  } finally { running = false; }
}
