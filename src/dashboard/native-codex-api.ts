import type { IncomingMessage } from 'node:http';
import * as path from 'node:path';
import type { GlobalBrain } from '../brain/global-brain.js';
import { requireProjectStore } from '../brain/project-memory.js';
import { projectRoot } from '../brain/project-kit-paths.js';
import { NativeCodexConnection, NativeCodexError, type NativeCodexFactory } from '../brain/native-codex.js';
import { ProjectSessions } from '../brain/project-sessions.js';

export function isNativeCodexRoute(route: string): boolean { return route === 'sessions/codex' || route.startsWith('sessions/codex/'); }
export function createNativeCodexApi(factory?: NativeCodexFactory) {
  const connections = new Map<string, NativeCodexConnection>();
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
    return { local, connection };
  }
  async function request(req: IncomingMessage, route: string, url: URL, directory: string, brain: GlobalBrain, readBody: () => Promise<Record<string, unknown>>) {
    if ((req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') throw new NativeCodexError('CODEX_ORIGIN', 'Cross-origin connector requests are not accepted.', 403);
    const { local, connection } = service(directory, brain);
    const fail = () => { throw new NativeCodexError('CODEX_ROUTE', 'Unsupported Codex connector request.', 404); };
    const match = /^sessions\/codex\/threads\/([A-Za-z0-9_-]{1,128})(?:\/(import))?$/u.exec(route);
    if (req.method === 'GET') {
      if (route === 'sessions/codex/status') return connection.status();
      if (route === 'sessions/codex/threads') {
        const archived = url.searchParams.get('archived') ?? 'false';
        if (!['true', 'false'].includes(archived)) throw new NativeCodexError('CODEX_INVALID', 'Choose current or archived threads.');
        return connection.list(archived === 'true', url.searchParams.get('cursor'));
      }
      if (match && !match[2]) return connection.read(match[1], url.searchParams.get('cursor'));
      return fail();
    }
    if (req.method !== 'POST') return fail();
    const body = await readBody();
    if (route === 'sessions/codex/connect') { if (Object.keys(body).length) throw new NativeCodexError('CODEX_INVALID', 'Connect accepts no arguments.'); return connection.connect(); }
    if (route === 'sessions/codex/disconnect') { if (Object.keys(body).length) throw new NativeCodexError('CODEX_INVALID', 'Disconnect accepts no arguments.'); connection.close(); return connection.status(); }
    if (match?.[2] === 'import') {
      if (Object.keys(body).some(key => !['key', 'cursor', 'sha256'].includes(key)) || typeof body.key !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/u.test(body.key) || typeof body.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(body.sha256) || (body.cursor !== undefined && typeof body.cursor !== 'string')) throw new NativeCodexError('CODEX_INVALID', 'Use the reviewed page fingerprint, an operation key and an optional page cursor.');
      const { snapshot, nextCursor } = await connection.snapshot(match[1], body.cursor as string | undefined ?? null);
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
    connections.get(key)?.close(); connections.delete(key);
    for (const [alias, target] of aliases) if (target === key) aliases.delete(alias);
  } };

}
const api = createNativeCodexApi();
export const nativeCodexRequest = api.request;
export const closeNativeCodex = api.close;
