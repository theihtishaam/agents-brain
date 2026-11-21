import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { NativeCodexStdioRpc, type NativeCodexRpc } from './native-codex.js';
import { projectRoot } from './project-kit-paths.js';

const DEADLINE_MS = 12_000;
const SESSION_PAGE_LIMIT = 100;
const sessionId = /^[A-Za-z0-9_-]{1,128}$/u;
const controls = /[\u0000-\u001f\u007f]/u;

export class NativeOpenCodeError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); }
}
const unavailable = () => new NativeOpenCodeError('OPENCODE_INDEX_UNAVAILABLE', 'The local OpenCode ACP session index is unavailable.', 503);
const invalid = () => new NativeOpenCodeError('OPENCODE_INDEX_SCOPE', 'OpenCode returned invalid or out-of-scope session metadata.', 409);
const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function openCodeBinary() {
  const locations = ['/usr/local/bin/opencode', '/usr/bin/opencode', '/opt/homebrew/bin/opencode'];
  if (process.platform === 'win32') {
    const base = process.env.APPDATA;
    if (!base || !isAbsolute(base) || !['x64', 'arm64'].includes(process.arch)) throw unavailable();
    const packages = ['opencode-windows-' + process.arch, 'opencode-windows-' + process.arch + '-baseline'];
    locations.splice(0, locations.length, ...packages.map(pkg =>
      join(base, 'npm', 'node_modules', 'opencode-ai', 'node_modules', pkg, 'bin', 'opencode.exe')));
  }
  for (const filename of locations) {
    const info = lstatSync(filename, { throwIfNoEntry: false });
    if (info?.isFile() || (process.platform !== 'win32' && info?.isSymbolicLink())) return filename;
  }
  throw new NativeOpenCodeError('OPENCODE_INDEX_NOT_INSTALLED', 'A supported local OpenCode executable was not found.', 503);
}

type OpenCodeFactory = (root: string) => NativeCodexRpc;
const createClient: OpenCodeFactory = root => new NativeCodexStdioRpc(() => spawn(openCodeBinary(),
  ['acp', '--pure', '--cwd', root, '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: root, stdio: 'pipe', shell: false, windowsHide: true,
  }), DEADLINE_MS, true);
const comparablePath = (root: string) => process.platform === 'win32' ? root.toLowerCase() : root;

/** Query two metadata-only ACP methods. No loading, resuming, exporting, or prompt execution. */
export async function readOpenCodeIndex(root: string, cursor: string | undefined, factory: OpenCodeFactory = createClient, requestSignal?: AbortSignal) {
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const signal = requestSignal ? AbortSignal.any([deadline, requestSignal]) : deadline;
  if (signal.aborted) throw unavailable();
  const rpc = factory(root);
  const cancel = () => rpc.close();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const initialization = obj(await rpc.request('initialize', { protocolVersion: 1, clientCapabilities: {},
      clientInfo: { name: 'agent-shadow-brain', title: 'Agent Shadow Brain', version: '7.25.0' } }));
    const capabilities = obj(obj(initialization.agentCapabilities).sessionCapabilities);
    if (signal.aborted) throw unavailable();
    if (initialization.protocolVersion !== 1 || !Object.hasOwn(capabilities, 'list') || !capabilities.list || typeof capabilities.list !== 'object') {
      throw new NativeOpenCodeError('OPENCODE_INDEX_UNSUPPORTED', 'This OpenCode ACP agent did not advertise session listing.', 409);
    }
    const page = obj(await rpc.request('session/list', { cwd: root, ...(cursor ? { cursor } : {}) }));
    if (signal.aborted) throw unavailable();
    if (!Array.isArray(page.sessions) || page.sessions.length > SESSION_PAGE_LIMIT ||
        (page.nextCursor != null && (typeof page.nextCursor !== 'string' || !page.nextCursor.length ||
          page.nextCursor.length > 1000 || controls.test(page.nextCursor)))) throw invalid();
    const sessions = page.sessions.map(item => {
      const row = obj(item);
      if (typeof row.sessionId !== 'string' || !sessionId.test(row.sessionId) ||
          typeof row.cwd !== 'string' || row.cwd.length > 2048 || !isAbsolute(row.cwd)) throw invalid();
      if (comparablePath(row.cwd) !== comparablePath(root) && comparablePath(projectRoot(row.cwd)) !== comparablePath(root)) throw invalid();
      if (row.title != null && (typeof row.title !== 'string' || row.title.length > 512 || controls.test(row.title))) throw invalid();
      const updated = typeof row.updatedAt === 'string' ? Date.parse(row.updatedAt) : NaN;
      return { id: row.sessionId, title: typeof row.title === 'string' ? row.title : null,
        updatedAt: Number.isFinite(updated) ? new Date(updated).toISOString() : null };
    });
    return { sessions, nextCursor: (page.nextCursor as string | undefined) ?? null, observedAt: new Date().toISOString() };
  } catch (error) {
    throw error instanceof NativeOpenCodeError ? error : unavailable();
  } finally {
    signal.removeEventListener('abort', cancel);
    rpc.close();
  }
}
