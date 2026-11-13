import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { HUB_LIMITS } from './project-hub-contract.js';

type WorkerResult = { pages: Array<{ page: number; text: string; truncated: boolean }> } | { error: string };
const pdfModule = pathToFileURL(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs')).href;
export const PDF_PARSER = 'PDF.js 6.5.438';

// The worker only receives bytes and resource limits. It resolves its own parser, with no input URL or path.
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { bytes, pdfModule, limits } = workerData;
async function extract() {
  const { getDocument, VerbosityLevel } = await import(pdfModule);
  const loading = getDocument({ data: bytes, verbosity: VerbosityLevel.ERRORS, stopAtErrors: true,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false, enableXfa: false });
  try {
    const document = await loading.promise;
    if (document.numPages < 1 || document.numPages > limits.pages) {
      return { error: 'PDF must contain between 1 and ' + limits.pages + ' pages.' };
    }
    const pages = [];
    let total = 0;
    for (let page = 1; page <= document.numPages; page++) {
      const source = await document.getPage(page);
      const reader = source.streamTextContent().getReader();
      const limit = Math.min(limits.pageChars, limits.extractedChars - total);
      let text = '';
      let truncated = false;
      try {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          for (const item of next.value.items) {
            if (!('str' in item)) continue;
            const piece = item.str.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '') + (item.hasEOL ? '\n' : ' ');
            if (text.length + piece.length > limit) {
              text += piece.slice(0, Math.max(0, limit - text.length)).replace(/[\ud800-\udbff]$/u, '');
              truncated = true;
              break;
            }
            text += piece;
          }
          if (truncated) { await reader.cancel(); break; }
        }
      } finally {
        reader.releaseLock();
        source.cleanup();
      }
      text = text.trim();
      if (limit === 0) return { error: 'Extracted text exceeds the project PDF text limit.' };
      total += text.length;
      pages.push({ page, text, truncated });
    }
    return { pages };
  } catch (error) {
    return { error: error?.name === 'PasswordException'
      ? 'This PDF is password protected. Upload an unencrypted copy you are authorized to use.'
      : 'PDF text could not be extracted. The file may be malformed or unsupported.' };
  } finally {
    await loading.destroy();
  }
}

void extract().then(result => parentPort.postMessage(result), () => parentPort.postMessage({ error: 'PDF extraction failed.' }));
`;

export async function extractHubPdf(data: Uint8Array): Promise<WorkerResult> {
  const worker = new Worker(workerSource, { eval: true, workerData: { bytes: Uint8Array.from(data), pdfModule, limits: HUB_LIMITS },
    env: {}, execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 24, stackSizeMb: 4 } });
  return new Promise(resolve => {
    let completed = false;
    const finish = (result: WorkerResult) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeout);
      void worker.terminate().then(() => resolve(result), () => resolve(result));
    };
    const timeout = setTimeout(() => finish({ error: 'PDF extraction exceeded the time limit.' }), HUB_LIMITS.extractionMs);
    worker.once('message', finish);
    worker.once('error', () => finish({ error: 'PDF extraction worker could not complete.' }));
    worker.once('exit', () => finish({ error: 'PDF extraction worker stopped before returning pages.' }));
  });
}
