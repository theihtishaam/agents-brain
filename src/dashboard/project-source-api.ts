import type { IncomingMessage } from 'node:http';
import { ProjectSourceIntake } from '../brain/project-source-intake.js';
import type { GlobalBrain } from '../brain/global-brain.js';

export function isSourceRoute(route: string) { return route === 'sources' || route.startsWith('sources/') || route === 'memory-evidence'; }
async function bytes(request: IncomingMessage, maximum: number) {
  const length = request.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > maximum)) { request.resume(); throw new RangeError('Upload exceeds the size limit.'); }
  const chunks: Buffer[] = []; let size = 0;
  for await (const part of request.iterator({ destroyOnReturn: false })) {
    const chunk = Buffer.isBuffer(part) ? part : Buffer.from(part); size += chunk.length;
    if (size > maximum) { request.resume(); throw new RangeError('Upload exceeds the size limit.'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
export async function sourceRequest(req: IncomingMessage, url: URL, directory: string, brain: GlobalBrain) {
  const service = new ProjectSourceIntake(directory, brain);
  try {
    const route = url.pathname.slice('/api/workspace/'.length);
    if (req.method === 'POST') {
      if ((req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') throw new TypeError('Cross-origin changes are not accepted.');
      const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (route === 'sources/remember') {
        if (type !== 'text/plain') throw new TypeError('Send plain text for a note.');
        const text = new TextDecoder('utf-8', { fatal: true }).decode(await bytes(req, 24 * 1024));
        return { source: await service.rememberText(text) };
      }
      if (route === 'sources') {
        if (!['application/json', 'text/plain', 'text/markdown'].includes(type ?? '')) throw new TypeError('Choose a text, Markdown or JSON file.');
        return { source: service.previewImport(url.searchParams.get('name') ?? (type === 'application/json' ? 'knowledge.json' : 'notes.txt'), await bytes(req, 1024 * 1024)) };
      }
      const match = /^sources\/([a-zA-Z0-9-]+)\/review$/.exec(route);
      if (match) {
        if (type !== 'application/json') throw new TypeError('Send application/json.');
        const input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bytes(req, 64 * 1024)));
        if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.itemId !== 'string') throw new TypeError('Choose an item to review.');
        const { itemId, ...review } = input;
        return { source: await service.reviewImportItem(match[1], itemId, review) };
      }
    } else if (req.method === 'GET') {
      if (route === 'sources') return { sources: service.listImportSummaries() };
      if (route === 'memory-evidence') return service.resolveMemoryEvidence(url.searchParams.get('memoryId') ?? '');
      const match = /^sources\/([a-zA-Z0-9-]+)$/.exec(route);
      if (match) return { source: service.getImport(match[1]) };
    }
    throw new TypeError('Unsupported source operation.');
  } finally { service.close(); }
}
