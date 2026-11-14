import type { IncomingMessage } from 'node:http';
import type { GlobalBrain } from '../brain/global-brain.js';
import { ProjectSessionError, SESSION_OPERATOR, sessionInput, sessionMessageWindow } from '../brain/project-session-contract.js';
import { ProjectSessions } from '../brain/project-sessions.js';
import { ProjectSourceIntake } from '../brain/project-source-intake.js';
import { NATIVE_SESSION_BYTES, parseNativeSession } from '../brain/native-session-import.js';

export function isProjectSessionRoute(route: string): boolean { return route === 'sessions' || route.startsWith('sessions/'); }

async function readNative(req: IncomingMessage): Promise<Buffer> {
  const type = req.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (!type || !['application/json', 'application/jsonl', 'application/x-ndjson', 'text/plain', 'application/octet-stream', 'application/zip', 'application/x-zip-compressed'].includes(type)) {
    throw new ProjectSessionError('NATIVE_SESSION_CONTENT_TYPE', 'Choose a JSON, JSONL or DeepSeek ZIP export.', 415);
  }
  const oversized = () => new ProjectSessionError('NATIVE_SESSION_LIMIT', 'The selected export exceeds 2 MiB.', 413);
  const length = req.headers['content-length'];
  if (length && (!/^\d+$/u.test(length) || Number(length) > NATIVE_SESSION_BYTES)) { req.resume(); throw oversized(); }
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const value of req.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    count += chunk.length;
    if (count > NATIVE_SESSION_BYTES) { req.resume(); throw oversized(); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, count);
}

export async function projectSessionRequest(req: IncomingMessage, route: string, url: URL, directory: string, brain: GlobalBrain,
  readBody: () => Promise<Record<string, unknown>>) {
  const sessions = new ProjectSessions(directory, brain);
  const [, id, action, target, ...rest] = route.split('/');
  const notFound = () => new ProjectSessionError('SESSION_ROUTE_NOT_FOUND', 'Project session route was not found.', 404);
  if (rest.length || id === '' || action === '' || target === '') throw notFound();
  if (req.method === 'GET') {
    if (!id) return sessions.list();
    if (!action && id !== 'import' && id !== 'native') {
      const limit = url.searchParams.get('limit');
      const { before, limit: size } = sessionInput(sessionMessageWindow, {
        before: url.searchParams.get('before') ?? undefined, limit: limit === null ? undefined : /^\d+$/u.test(limit) ? Number(limit) : NaN,
      });
      return sessions.read(id, size, before);
    }
    if (action === 'checkpoints' && target) return sessions.readCheckpoint(id, target);
    throw notFound();
  }
  if (req.method !== 'POST') throw new ProjectSessionError('SESSION_METHOD_NOT_ALLOWED', 'Use GET or POST for project sessions.', 405);
  if (target) throw notFound();
  const origin = req.headers.origin;
  if (origin && origin !== 'http://' + req.headers.host && origin !== 'https://' + req.headers.host) {
    throw new ProjectSessionError('SESSION_ORIGIN', 'Cross-origin changes are not accepted.', 403);
  }
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new ProjectSessionError('SESSION_ORIGIN', 'Cross-origin changes are not accepted.', 403);
  if (!id) return sessions.open(await readBody(), SESSION_OPERATOR);
  if (id === 'native' && !action) {
    const snapshot = parseNativeSession(url.searchParams.get('tool'), url.searchParams.get('name') ?? url.searchParams.get('filename'), await readNative(req), directory);
    return sessions.importNative(snapshot, url.searchParams.get('key') ?? '');
  }
  if (id === 'import' && !action) {
    const input = await readBody();
    return sessions.importTranscript(input, sourceId => {
      const source = new ProjectSourceIntake(directory, brain);
      try { return source.sessionTranscript(sourceId); }
      finally { source.close(); }
    }, SESSION_OPERATOR);
  }
  if (action === 'actions') return sessions.record(id, await readBody(), SESSION_OPERATOR);
  if (action === 'resume') return sessions.resume(id, await readBody(), SESSION_OPERATOR);
  throw notFound();
}
