import type { IncomingMessage } from 'node:http';
import * as path from 'node:path';
import type { GlobalBrain } from '../brain/global-brain.js';
import { requireProjectStore } from '../brain/project-memory.js';
import { projectRoot } from '../brain/project-kit-paths.js';
import { NativeCodexConnection, NativeCodexError, type NativeCodexFactory } from '../brain/native-codex.js';
import { nativeChatKey, ProjectPolicyStore, toolParticipates } from '../brain/project-policy.js';
import { WorkspaceConnections } from '../brain/workspace-connections.js';
import { ProjectSessions } from '../brain/project-sessions.js';
import { NativeCodexArchive } from '../brain/native-codex-archive.js';
import { FeatureSettingsStore } from '../brain/feature-settings.js';

export function isNativeCodexRoute(route: string): boolean { return route === 'sessions/codex' || route.startsWith('sessions/codex/'); }
export const isNativeCodexFollowRoute = (route: string) => route === 'sessions/codex/follow' ||
  route === 'sessions/codex/follow/stop' || /^sessions\/codex\/threads\/[A-Za-z0-9_-]{1,128}\/follow$/u.test(route);
const followIntervalMs = 10_000;
const followDeadlineMs = 20_000;
type Follow = { threadId: string; active: boolean; busy: boolean; timer?: NodeJS.Timeout; issue?: string;
  result?: Awaited<ReturnType<NativeCodexArchive['sync']>> };
export function createNativeCodexApi(factory?: NativeCodexFactory) {
  const connections = new Map<string, NativeCodexConnection>();
  const follows = new Map<string, Follow>();
  function stop(key: string, issue?: string) {
    const watch = follows.get(key);
    if (!watch) return;
    watch.active = false;
    clearTimeout(watch.timer);
    watch.timer = undefined;
    watch.issue = issue;
  }
  function followStatus(key: string) {
    const watch = follows.get(key);
    return watch ? { active: watch.active, threadId: watch.threadId, result: watch.result ?? null, issue: watch.issue ?? null } : { active: false };
  }
  // Remember only spellings already validated for this project. This also permits
  // shutdown after a project directory has been removed, without guessing paths.
  const aliases = new Map<string, string>();
  const pathKey = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  function service(directory: string, brain: GlobalBrain) {
    const local = requireProjectStore(directory, brain);
    const key = pathKey(local.root);
    let connection = connections.get(key);
    if (!connection) { connection = new NativeCodexConnection(local.root, factory); connections.set(key, connection); }
    aliases.set(key, key);
    aliases.set(pathKey(directory), key);
    return { local, connection, key };
  }
  async function request(req: IncomingMessage, route: string, url: URL, directory: string, brain: GlobalBrain,
    readBody: () => Promise<Record<string, unknown>>, requestSignal?: AbortSignal) {
    if ((req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') throw new NativeCodexError('CODEX_ORIGIN', 'Cross-origin connector requests are not accepted.', 403);
    const { local, connection, key } = service(directory, brain);
    const fail = () => { throw new NativeCodexError('CODEX_ROUTE', 'Unsupported Codex connector request.', 404); };
    const match = /^sessions\/codex\/threads\/([A-Za-z0-9_-]{1,128})(?:\/(import|follow))?$/u.exec(route);
    const policyStore = new ProjectPolicyStore(local.root, local.projectId);
    function policyForIndex(thread?: string) {
      const policy = policyStore.get();
      if (!toolParticipates(policy, 'codex') || !new WorkspaceConnections(local.root, local.projectId).allows('codex')) {
        stop(key, 'Codex participation is paused for this project.'); connection.close();
        throw new NativeCodexError('CODEX_PAUSED', 'Codex participation is paused for this project.', 403);
      }
      if (thread && policy.chats.some(chat => !chat.shareContext && chat.key === nativeChatKey('codex', thread))) {
        throw new NativeCodexError('CODEX_CHAT_PRIVATE', 'This chat is excluded by project sharing controls.', 403);
      }
      return policy;
    }
    if (isNativeCodexFollowRoute(route)) {
      if (req.headers['x-shadow-brain-project'] !== local.projectId || req.headers['sec-fetch-site'] === 'same-site' ||
          !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '')) {
        throw new NativeCodexError('CODEX_ARCHIVE_SCOPE', 'Use the local project portal to control native capture.', 403);
      }
      if (route === 'sessions/codex/follow' && req.method === 'GET') return followStatus(key);
      if (req.method !== 'POST') return fail();
      const input = await readBody();
      if (route === 'sessions/codex/follow/stop') {
        if (Object.keys(input).length) throw new NativeCodexError('CODEX_INVALID', 'Stop accepts no arguments.');
        stop(key); return followStatus(key);
      }
      if (!match || Object.keys(input).length !== 1 || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sha256)) {
        throw new NativeCodexError('CODEX_ARCHIVE_REVIEW', 'Review the latest page and confirm its fingerprint to enable capture.', 400);
      }
      const existing = follows.get(key);
      if (existing?.active || existing?.busy) throw new NativeCodexError('CODEX_ARCHIVE_BUSY', 'One native chat is already being followed in this project.', 409);
      const threadId = match[1];
      const settings = new FeatureSettingsStore({ filePath: local.settingsPath });
      const checkAllowed = () => {
        if (!settings.get().features.exactConversationCapture) {
          throw new NativeCodexError('CODEX_ARCHIVE_CAPTURE_OFF', 'Exact conversation capture is off in feature controls.', 403);
        }
        policyForIndex(threadId);
      };
      checkAllowed();
      const watch: Follow = { threadId, active: true, busy: false };
      follows.set(key, watch);
      const capture = async (fingerprint?: string) => {
        const timeout = AbortSignal.timeout(followDeadlineMs);
        const guard = () => {
          if (timeout.aborted || (fingerprint && requestSignal?.aborted) || follows.get(key) !== watch || !watch.active || !connection.status().connected) {
            throw new NativeCodexError('CODEX_ARCHIVE_STOPPED', 'Capture has stopped. Review the latest page to follow this chat again.', 409);
          }
          checkAllowed();
        };
        watch.busy = true;
        try { watch.result = await new NativeCodexArchive(local.root, local.projectId).sync(connection, threadId, guard, fingerprint); }
        finally { watch.busy = false; }
      };
      const schedule = () => {
        if (!watch.active || follows.get(key) !== watch) return;
        watch.timer = setTimeout(() => {
          void capture().then(schedule).catch(error => {
            if (follows.get(key) === watch && watch.active) stop(key, error instanceof NativeCodexError ? error.message : 'Capture stopped because the archive could not be updated.');
          });
        }, followIntervalMs);
        watch.timer.unref();
      };
      try {
        await capture(input.sha256);
        schedule();
        return followStatus(key);
      } catch (error) {
        if (follows.get(key) === watch && watch.active) stop(key, error instanceof NativeCodexError ? error.message : 'Capture could not start.');
        throw error;
      }
    }
    if (req.method === 'GET') {
      if (route === 'sessions/codex/status') return connection.status();
      if (route === 'sessions/codex/threads') {
        const archived = url.searchParams.get('archived') ?? 'false';
        if (!['true', 'false'].includes(archived)) throw new NativeCodexError('CODEX_INVALID', 'Choose current or archived threads.');
        policyForIndex();
        const page = await connection.list(archived === 'true', url.searchParams.get('cursor'));
        const hidden = new Set(policyForIndex().chats.filter(chat => !chat.shareContext).map(chat => chat.key));
        return { ...page, threads: page.threads.filter(thread => !hidden.has(nativeChatKey('codex', thread.id))) };
      }
      if (match && !match[2]) {
        policyForIndex(match[1]);
        const page = await connection.read(match[1], url.searchParams.get('cursor'));
        policyForIndex(match[1]);
        return page;
      }
      return fail();
    }
    if (req.method !== 'POST') return fail();
    const body = await readBody();
    if (route === 'sessions/codex/connect') { if (Object.keys(body).length) throw new NativeCodexError('CODEX_INVALID', 'Connect accepts no arguments.'); policyForIndex(); const result = await connection.connect(); policyForIndex(); return result; }
    if (route === 'sessions/codex/disconnect') { if (Object.keys(body).length) throw new NativeCodexError('CODEX_INVALID', 'Disconnect accepts no arguments.'); stop(key); connection.close(); return connection.status(); }
    if (match?.[2] === 'import') {
      if (Object.keys(body).some(key => !['key', 'cursor', 'sha256'].includes(key)) || typeof body.key !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/u.test(body.key) || typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(body.sha256) || (body.cursor !== undefined && typeof body.cursor !== 'string')) throw new NativeCodexError('CODEX_INVALID', 'Use the reviewed page fingerprint, an operation key and an optional page cursor.');
      policyForIndex(match[1]);
      const { snapshot, nextCursor } = await connection.snapshot(match[1], body.cursor as string | undefined ?? null);
      policyForIndex(match[1]);
      if (snapshot.sha256 !== body.sha256) throw new NativeCodexError('CODEX_PAGE_CHANGED', 'This conversation page changed. Review it again before importing.', 409);
      return { ...new ProjectSessions(local.root, brain).importNative(snapshot, body.key), nextCursor, partial: !!nextCursor || !!body.cursor || snapshot.omitted > 0 };
    }
    return fail();
  }
  return { request, close(directory: string) {
    let key = aliases.get(pathKey(directory));
    if (!key) {
      try { key = aliases.get(pathKey(projectRoot(directory))); } catch { /* An unknown or removed path cannot be resolved safely. */ }
    }
    if (!key) return;
    stop(key); follows.delete(key); connections.get(key)?.close(); connections.delete(key);
    for (const [alias, target] of aliases) if (target === key) aliases.delete(alias);
  } };

}
const api = createNativeCodexApi();
export const nativeCodexRequest = api.request;
export const closeNativeCodex = api.close;
