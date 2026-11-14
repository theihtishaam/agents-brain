import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { lstatSync } from 'node:fs';
import * as path from 'node:path';
import { digest } from './project-hub-store.js';
import { projectRoot } from './project-kit-paths.js';
import type { NativeSessionSnapshot } from './native-session-import.js';

const MAX_REPLY = 2 * 1024 * 1024;
const TIMEOUT = 12_000;
const LIFETIME = 15 * 60_000;
const PAGE_SIZE = 25;
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const identifier = /^[A-Za-z0-9_-]{1,128}$/u;
export class NativeCodexError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400) { super(message); this.name = 'NativeCodexError'; }
}
export interface NativeCodexRpc { request(method: string, params: object): Promise<unknown>; notify(method: string, params: object): void; close(): void; isOpen?(): boolean }
export type NativeCodexFactory = () => NativeCodexRpc;
export type NativeCodexThread = { id: string; sessionId: string | null; parentThreadId: string | null; name: string | null; cwd: string; createdAt: string | null; updatedAt: string | null; status: { type: 'notLoaded' | 'idle' | 'systemError' | 'active' | 'unknown'; activeFlags?: string[] }; archived: boolean };
export type NativeCodexMessage = { id: string; locator: string; role: 'user' | 'assistant'; text: string; phase?: 'commentary' | 'partial_answer' | 'final_answer' };
const invalid = (message: string): never => { throw new NativeCodexError('CODEX_INVALID', message); };
const failed = (): NativeCodexError => new NativeCodexError('CODEX_UNAVAILABLE', 'The Codex connection could not complete the read. Check the local CLI and reconnect.', 503);
const obj = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const stamp = (value: unknown): string | null => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 8640000000000 ? new Date(value * 1000).toISOString() : null;
function rememberCursor(set: Set<string>, value: string, limit: number): void { set.delete(value); set.add(value); if (set.size > limit) set.delete(set.values().next().value!); }
const cursorValue = (value: unknown): string | null => value === null || value === undefined ? null : typeof value === 'string' && value.length > 0 && value.length <= 1000 && !controls.test(value) ? value : invalid('Invalid pagination cursor.');
function sameRoot(a: string, b: string): boolean {
  try {
    // The project helper validates real directory ancestry before resolving physical spelling.
    // This accepts Windows 8.3 aliases while rejecting junctions, symlinks and foreign roots.
    const one = projectRoot(a), two = projectRoot(b);
    return process.platform === 'win32' ? one.toLowerCase() === two.toLowerCase() : one === two;
  } catch { return false; }
}
function normalizeThread(value: unknown, root: string, archived: boolean): NativeCodexThread {
  const t = obj(value), status = obj(t.status);
  if (typeof t.id !== 'string' || !identifier.test(t.id) || typeof t.cwd !== 'string' || !path.isAbsolute(t.cwd) || !sameRoot(t.cwd, root)) invalid('A returned thread did not match this project.');
  if (t.name !== null && t.name !== undefined && (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 512 || /[\u0000-\u001f\u007f]/u.test(t.name))) invalid('A native thread name could not be represented exactly.');
  const group = t.sessionId === null || t.sessionId === undefined ? null : typeof t.sessionId === 'string' && identifier.test(t.sessionId) ? t.sessionId : invalid('Invalid native session identity.');
  const parent = t.parentThreadId ?? t.forkedFromId ?? null;
  if (parent !== null && (typeof parent !== 'string' || !identifier.test(parent))) invalid('Invalid native parent identity.');
  const type = ['notLoaded', 'idle', 'systemError', 'active'].includes(String(status.type)) ? status.type as NativeCodexThread['status']['type'] : 'unknown';
  const flags = Array.isArray(status.activeFlags) ? status.activeFlags.filter((x): x is string => x === 'waitingOnApproval' || x === 'waitingOnUserInput').slice(0, 2) : [];
  return { id: t.id as string, sessionId: group, parentThreadId: parent as string | null, name: (t.name ?? null) as string | null, cwd: root, createdAt: stamp(t.createdAt), updatedAt: stamp(t.updatedAt), status: { type, ...(flags.length ? { activeFlags: flags } : {}) }, archived };
}

/** Locate a fixed, directly executable official npm package binary; never run a shell or accept user arguments. */
function codexBinary(): string {
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA;
    const platform = process.arch === 'x64' ? ['codex-win32-x64', 'x86_64-pc-windows-msvc'] : process.arch === 'arm64' ? ['codex-win32-arm64', 'aarch64-pc-windows-msvc'] : null;
    if (!appdata || !path.isAbsolute(appdata) || !platform) throw failed();
    const file = path.join(appdata, 'npm', 'node_modules', '@openai', 'codex', 'node_modules', '@openai', platform[0], 'vendor', platform[1], 'bin', 'codex.exe');
    const info = lstatSync(file, { throwIfNoEntry: false }); if (!info?.isFile() || info.isSymbolicLink()) throw failed(); return file;
  }
  for (const file of ['/usr/local/bin/codex', '/usr/bin/codex', '/opt/homebrew/bin/codex']) {
    const info = lstatSync(file, { throwIfNoEntry: false }); if (info?.isFile() || info?.isSymbolicLink()) return file;
  }
  throw failed();
}
export class NativeCodexStdioRpc implements NativeCodexRpc {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private next = 0;
  private closed = false;
  private readonly pending = new Map<number, { method: string; resolve(value: unknown): void; reject(error: Error): void; timer: NodeJS.Timeout }>();
  constructor(launch: () => ChildProcessWithoutNullStreams = () => spawn(codexBinary(), ['app-server', '--stdio'], { windowsHide: true, stdio: 'pipe', shell: false }), private readonly timeoutMs = TIMEOUT) {
    this.child = launch();
    this.child.stderr.resume();
    this.child.stdin.on('error', () => this.close());
    this.child.stdout.on('data', (chunk: Buffer) => this.receive(chunk));
    this.child.on('error', () => this.close()); this.child.on('close', () => this.close());
  }
  private receive(chunk: Buffer) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.length > MAX_REPLY) { this.close(); return; }
    let index: number;
    while ((index = this.buffer.indexOf(10)) >= 0) {
      const line = this.buffer.subarray(0, index); this.buffer = this.buffer.subarray(index + 1);
      let value: Record<string, unknown>;
      try { value = obj(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(line))); } catch { this.close(); return; }
      if (typeof value.id !== 'number') continue;
      const pending = this.pending.get(value.id); if (!pending) continue;
      clearTimeout(pending.timer); this.pending.delete(value.id);
      if (value.error !== undefined || !Object.hasOwn(value, 'result')) {
        const error = obj(value.error);
        pending.reject(pending.method === 'thread/items/list' && error.code === -32601
          ? new NativeCodexError('CODEX_PAGING_UNAVAILABLE', 'This Codex app-server does not support bounded conversation paging. Update Codex to use this connector.', 409) : failed());
      } else pending.resolve(value.result);
    }
  }
  request(method: string, params: object): Promise<unknown> {
    if (this.closed || this.pending.size >= 4) return Promise.reject(failed());
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(failed()); this.close(); }, Math.max(1, Math.min(TIMEOUT, this.timeoutMs)));
      this.pending.set(id, { method, resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + '\n', error => { if (error) this.close(); });
    });
  }
  notify(method: string, params: object): void { if (!this.closed) this.child.stdin.write(JSON.stringify({ method, params }) + '\n', error => { if (error) this.close(); }); }
  isOpen(): boolean { return !this.closed; }
  close(): void {
    if (this.closed) return; this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(failed()); } this.pending.clear();
    this.child.stdin.destroy(); this.child.stdout.destroy(); this.child.stderr.destroy(); if (!this.child.killed) this.child.kill();
  }
}

export class NativeCodexConnection {
  private rpc?: NativeCodexRpc;
  private expires?: NodeJS.Timeout;
  private connectedAt: string | null = null;
  private generation = 0;
  private readonly allowed = new Map<string, NativeCodexThread>();
  private readonly itemCursors = new Map<string, Set<string>>();
  private readonly listCursors = new Map<boolean, Set<string>>([[false, new Set()], [true, new Set()]]);
  constructor(private readonly root: string, private readonly factory: NativeCodexFactory = () => new NativeCodexStdioRpc(), private readonly now = Date.now) {}
  status() { if (this.rpc?.isOpen && !this.rpc.isOpen()) this.close(); return { connected: !!this.rpc && !!this.connectedAt, connectedAt: this.connectedAt, expiresAt: this.connectedAt ? new Date(Date.parse(this.connectedAt) + LIFETIME).toISOString() : null, scope: this.root, note: 'Runtime status is observed by this separate app-server and may not describe the desktop client.' }; }
  async connect() {
    if (this.rpc?.isOpen && !this.rpc.isOpen()) this.close();
    if (this.rpc) { if (!this.connectedAt) throw new NativeCodexError('CODEX_CONNECTING', 'The Codex connection is still starting.', 409); return this.status(); }
    const rpc = this.factory(); this.rpc = rpc;
    try {
      await rpc.request('initialize', { clientInfo: { name: 'shadow_brain', title: 'Agent Shadow Brain', version: '7.22.0' }, capabilities: { experimentalApi: true, requestAttestation: false } });
      if (this.rpc !== rpc) throw failed();
      rpc.notify('initialized', {}); this.connectedAt = new Date(this.now()).toISOString();
      this.expires = setTimeout(() => this.close(), LIFETIME); this.expires.unref(); return this.status();
    } catch { if (this.rpc === rpc) this.close(); else rpc.close(); throw failed(); }
  }
  close() { this.generation++; if (this.expires) clearTimeout(this.expires); this.expires = undefined; this.rpc?.close(); this.rpc = undefined; this.connectedAt = null; this.allowed.clear(); this.itemCursors.clear(); this.listCursors.get(false)!.clear(); this.listCursors.get(true)!.clear(); }
  private active() { if (this.rpc?.isOpen && !this.rpc.isOpen()) this.close(); return this.connectedAt && this.rpc ? this.rpc : invalid('Connect Codex before reading project conversations.'); }
  async list(archived = false, cursor: string | null = null) {
    cursor = cursorValue(cursor);
    if (cursor && !this.listCursors.get(archived)!.has(cursor)) invalid('Use a cursor returned by this project connection.');
    const rpc = this.active(), generation = this.generation;
    const response = obj(await rpc.request('thread/list', { cwd: this.root, limit: PAGE_SIZE, cursor, sortKey: 'updated_at', archived, modelProviders: [], useStateDbOnly: true,
      sourceKinds: ['cli', 'vscode', 'exec', 'appServer', 'subAgent', 'subAgentReview', 'subAgentCompact', 'subAgentThreadSpawn', 'subAgentOther', 'unknown'] }));
    if (generation !== this.generation || rpc !== this.rpc) throw failed();
    if (!Array.isArray(response.data) || response.data.length > PAGE_SIZE || !Object.hasOwn(response, 'nextCursor')) throw failed();
    const threads = response.data.map(item => normalizeThread(item, this.root, archived));
    for (const thread of threads) { this.allowed.delete(thread.id); this.allowed.set(thread.id, thread); }
    while (this.allowed.size > 500) { const expired = this.allowed.keys().next().value!; this.allowed.delete(expired); this.itemCursors.delete(expired); }
    const nextCursor = cursorValue(response.nextCursor); if (nextCursor) rememberCursor(this.listCursors.get(archived)!, nextCursor, 50);
    return { connected: true, observedAt: new Date(this.now()).toISOString(), threads, nextCursor };
  }
  async read(threadId: string, cursor: string | null = null) {
    if (!identifier.test(threadId) || !this.allowed.has(threadId)) invalid('Select a thread listed for this project first.');
    cursor = cursorValue(cursor);
    if (cursor && !this.itemCursors.get(threadId)?.has(cursor)) invalid('Use a cursor returned for this thread.');
    const rpc = this.active(), generation = this.generation, previous = this.allowed.get(threadId)!;
    const metadata = obj(await rpc.request('thread/read', { threadId, includeTurns: false }));
    if (generation !== this.generation || rpc !== this.rpc) throw failed();
    const thread = normalizeThread(metadata.thread, this.root, previous.archived);
    if (thread.id !== threadId) throw failed();
    const response = obj(await rpc.request('thread/items/list', { threadId, cursor, limit: PAGE_SIZE, sortDirection: 'desc' }));
    if (generation !== this.generation || rpc !== this.rpc) throw failed();
    if (!Array.isArray(response.data) || response.data.length > PAGE_SIZE || !Object.hasOwn(response, 'nextCursor')) throw failed();
    const messages: NativeCodexMessage[] = []; let omitted = 0;
    for (const raw of [...response.data].reverse()) {
      const entry = obj(raw), item = obj(entry.item), id = typeof item.id === 'string' && identifier.test(item.id) ? item.id : invalid('A native message has an invalid identifier.');
      if (item.type === 'userMessage' && Array.isArray(item.content)) {
        for (const [index, part] of item.content.entries()) {
          const segment = obj(part); if (segment.type !== 'text') { omitted++; continue; }
          const text = segment.text; if (typeof text !== 'string' || !text.trim() || text.length > 8000 || controls.test(text)) invalid('A native message is unsupported or exceeds 8,000 characters.');
          messages.push({ id: id + ':' + index, locator: `/items/${id}/content/${index}`, role: 'user', text: text as string });
        }
      } else if (item.type === 'agentMessage') {
        const text = item.text; if (typeof text !== 'string' || !text.trim() || text.length > 8000 || controls.test(text)) invalid('A native message is unsupported or exceeds 8,000 characters.');
        const phase = item.phase === 'commentary' || item.phase === 'partial_answer' || item.phase === 'final_answer' ? item.phase : undefined;
        messages.push({ id, locator: `/items/${id}`, role: 'assistant', text: text as string, ...(phase ? { phase } : {}) });
      } else omitted++;
    }
    if (messages.length > 200) invalid('This page contains too many message sections.');
    const nextCursor = cursorValue(response.nextCursor); if (nextCursor) { const allowed = this.itemCursors.get(threadId) ?? new Set<string>(); rememberCursor(allowed, nextCursor, 20); this.itemCursors.set(threadId, allowed); }
    this.allowed.set(threadId, thread);
    const { status: _status, ...stableThread } = thread;
    const pageCoverage = { kind: 'page' as const, direction: 'newest-first' as const, hasEarlier: nextCursor !== null, hasLater: cursor !== null, cursorSha256: cursor === null ? null : digest(cursor), omittedInPage: omitted };
    const sha256 = digest(JSON.stringify({ thread: stableThread, messages, pageCoverage }));
    return { thread, messages, omitted, nextCursor, pageCoverage, sha256, observedAt: new Date(this.now()).toISOString() };
  }
  async snapshot(threadId: string, cursor: string | null = null): Promise<{ snapshot: NativeSessionSnapshot; nextCursor: string | null }> {
    const page = await this.read(threadId, cursor);
    const snapshot: NativeSessionSnapshot = { tool: 'codex', format: 'codex-app-server-v1', filename: 'codex-app-server.json', sha256: page.sha256, sessionId: page.thread.id,
      groupSessionId: page.thread.sessionId, titleExact: page.thread.name, titleOrigin: page.thread.name ? 'host-name' : 'unavailable', workspaceRoot: this.root,
      createdAt: page.thread.createdAt, updatedAt: page.thread.updatedAt, parentNativeId: page.thread.parentThreadId, omitted: page.omitted, pageCoverage: page.pageCoverage,
      messages: page.messages.map(({ phase: _phase, ...message }) => ({ ...message, createdAt: null })) };
    return { snapshot, nextCursor: page.nextCursor };
  }
}
