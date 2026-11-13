import type { IncomingMessage, ServerResponse } from 'node:http';
import { HUB_LIMITS, HUB_OPERATOR, ProjectHubError } from '../brain/project-hub-contract.js';
import { ProjectKitError } from '../brain/project-kit-paths.js';
import type { ProjectHubService } from '../brain/project-hub.js';

const prefix = '/api/workspace/hub';
const jsonLimit = 64 * 1024;
let uploadsInFlight = 0;

async function readBody(request: IncomingMessage, type: string, maximum: number): Promise<Buffer> {
  if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== type) {
    throw new ProjectHubError('HUB_CONTENT_TYPE', 'Send ' + type + ' content.', 415);
  }
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/u.test(length) || Number(length) > maximum)) {
    request.resume();
    throw new ProjectHubError('HUB_BODY_LIMIT', 'Request body exceeds the byte limit.', 413);
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maximum) {
      request.resume();
      throw new ProjectHubError('HUB_BODY_LIMIT', 'Request body exceeds the byte limit.', 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks, bytes);
}

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, 'application/json', jsonLimit);
  try { return JSON.parse(body.toString('utf8')) as unknown; }
  catch { throw new ProjectHubError('HUB_INVALID_JSON', 'Send a valid JSON object.', 400); }
}

function originCheck(request: IncomingMessage): void {
  const { origin, host } = request.headers;
  if ((origin && origin !== 'http://' + host && origin !== 'https://' + host) || request.headers['sec-fetch-site'] === 'cross-site') {
    throw new ProjectHubError('HUB_ORIGIN', 'Cross-origin changes are not accepted.', 403);
  }
}

export function isProjectHubRoute(pathname: string): boolean { return pathname === prefix || pathname.startsWith(prefix + '/'); }

export async function handleProjectHubRequest(request: IncomingMessage, response: ServerResponse, hub: ProjectHubService | undefined, url: URL): Promise<void> {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  const send = (data: unknown, status = 200) => {
    response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  };
  try {
    if (!hub) throw new ProjectHubError('HUB_LOCAL_PROJECT_REQUIRED', 'Open a project-local workspace to use the Brain Hub.', 409);
    const method = request.method ?? 'GET';
    if (method !== 'GET' && method !== 'POST') throw new ProjectHubError('HUB_METHOD', 'Method not allowed.', 405);
    if (method === 'POST') originCheck(request);
    const segments = url.pathname.slice(prefix.length).split('/').slice(1);
    const [section, id, action, target] = segments;
    if (method === 'GET') {
      if (!segments.length) return send(hub.overview());
      if (section === 'documents' && segments.length === 2) return send(hub.document(id));
      if (section === 'rooms' && segments.length === 2) {
        const after = url.searchParams.get('after') ?? '0';
        if (!/^\d+$/u.test(after)) throw new ProjectHubError('HUB_INVALID_CURSOR', 'Use a nonnegative event cursor.', 400);
        return send(hub.room(id, Number(after)));
      }
      if (section === 'rooms' && action === 'artifacts' && segments.length === 4) {
        const { artifact, bytes } = hub.artifact(id, target);
        const name = artifact.path.split('/').at(-1)!;
        response.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length,
          'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(name).replace(/['()*]/gu, char => '%' + char.charCodeAt(0).toString(16)),
          'Content-Security-Policy': 'sandbox', 'X-Artifact-SHA256': artifact.sha256 });
        response.end(bytes);
        return;
      }
    } else {
      if (section === 'documents' && segments.length === 1) {
        if (uploadsInFlight >= 2) { request.resume(); throw new ProjectHubError('HUB_UPLOAD_BUSY', 'PDF intake is busy. Retry after the active upload finishes.', 409); }
        uploadsInFlight++;
        try {
          const data = await readBody(request, 'application/pdf', HUB_LIMITS.pdfBytes);
          return send(await hub.upload(url.searchParams.get('name') ?? '', data));
        } finally { uploadsInFlight--; }
      }
      if (section === 'documents' && action === 'review' && segments.length === 3) return send(await hub.reviewDocument(id, await jsonBody(request)));
      if (section === 'rooms' && segments.length === 1) return send(hub.createRoom(await jsonBody(request), HUB_OPERATOR));
      if (section === 'rooms' && action === 'actions' && segments.length === 3) return send(hub.roomAction(id, await jsonBody(request), HUB_OPERATOR));
      if (section === 'lessons' && segments.length === 1) return send(hub.createLesson(await jsonBody(request), HUB_OPERATOR));
      if (section === 'lessons' && action === 'actions' && segments.length === 3) return send(await hub.lessonAction(id, await jsonBody(request), HUB_OPERATOR));
    }
    throw new ProjectHubError('HUB_NOT_FOUND', 'Project hub route was not found.', 404);
  } catch (error) {
    if (response.destroyed || response.writableEnded) return;
    if (error instanceof ProjectHubError) return send({ error: error.message, code: error.code }, error.status);
    if (error instanceof ProjectKitError) return send({ error: error.message, code: error.code }, 400);
    if (error instanceof TypeError) return send({ error: 'Invalid project hub request.', code: 'HUB_INVALID_INPUT' }, 400);
    return send({ error: 'The project hub operation could not be completed. Retry with the same operation key.', code: 'HUB_OPERATION_FAILED' }, 503);
  }
}
