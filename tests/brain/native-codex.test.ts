import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { validateNativeSnapshot } from '../../src/brain/native-session-import.js';
import { NativeCodexConnection, NativeCodexStdioRpc, type NativeCodexRpc } from '../../src/brain/native-codex.js';
import { createNativeCodexApi } from '../../src/dashboard/native-codex-api.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'synthetic-codex-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const brain = GlobalBrain.createIsolated({ dbPath: projectStorage(root).storagePath });
  cleanups.push(() => brain.shutdown());
  return { root, brain };
}
class FakeRpc implements NativeCodexRpc {
  calls: Array<{ method: string; params: any }> = []; open = true; foreign = false; status = 'active'; answer = 'Approved native answer.';
  constructor(readonly root: string) {}
  async request(method: string, params: any): Promise<unknown> {
    this.calls.push({ method, params });
    const thread = { id: 'thread-1', sessionId: 'group-1', parentThreadId: 'parent-1', name: 'Exact native title', cwd: this.foreign ? join(this.root, 'elsewhere') : this.root,
      createdAt: 1760000000, updatedAt: 1760000001, status: { type: this.status, activeFlags: ['waitingOnUserInput'] }, preview: 'DO_NOT_RELAY_PREVIEW', modelProvider: 'DO_NOT_RELAY_PROVIDER', path: 'DO_NOT_RELAY_PATH' };
    if (method === 'initialize') return { userAgent: 'synthetic' };
    if (method === 'thread/list') return { data: [thread], nextCursor: 'next-page' };
    if (method === 'thread/read') return { thread };
    if (method === 'thread/items/list') return { data: [
      { turnId: 'turn', item: { id: 'agent-1', type: 'agentMessage', text: this.answer, phase: 'final_answer' } },
      { turnId: 'turn', item: { id: 'tool-1', type: 'commandExecution', output: 'DO_NOT_RELAY_TOOL' } },
      { turnId: 'turn', item: { id: 'user-1', type: 'userMessage', content: [{ type: 'text', text: ' Exact user text. ' }, { type: 'image', url: 'DO_NOT_RELAY_ATTACHMENT' }] } },
    ], nextCursor: params.cursor ? null : 'older-page' };
    throw new Error('Unexpected request.');
  }
  notify(method: string, params: object) { this.calls.push({ method, params }); }
  isOpen() { return this.open; }
  close() { this.open = false; }
}

it('connects only explicitly, limits discovery to the project, and returns only selected visible message text', async () => {
  const { root } = fixture(), rpc = new FakeRpc(root), service = new NativeCodexConnection(root, () => rpc);
  expect(service.status().connected).toBe(false);
  await expect(service.list()).rejects.toThrow(/Connect/u);
  expect(rpc.calls).toEqual([]);
  await service.connect();
  expect(rpc.calls.map(x => x.method)).toEqual(['initialize', 'initialized']);
  const list = await service.list(false);
  expect(list.threads[0]).toMatchObject({ id: 'thread-1', sessionId: 'group-1', parentThreadId: 'parent-1', name: 'Exact native title', status: { type: 'active' } });
  expect(rpc.calls.find(x => x.method === 'thread/list')!.params).toMatchObject({ cwd: root, limit: 25, archived: false, useStateDbOnly: true });
  expect(JSON.stringify(list)).not.toContain('DO_NOT_RELAY');
  await expect(service.read('unlisted')).rejects.toThrow(/listed/u);
  await expect(service.read('thread-1', 'unissued')).rejects.toThrow(/cursor/u);
  const page = await service.read('thread-1');
  expect(page.messages).toMatchObject([{ id: 'user-1:0', role: 'user', text: ' Exact user text. ', locator: '/items/user-1/content/0' }, { id: 'agent-1', role: 'assistant', phase: 'final_answer' }]);
  expect(page.omitted).toBe(2); expect(page.nextCursor).toBe('older-page');
  expect(JSON.stringify(page)).not.toContain('DO_NOT_RELAY');
  const snapshot = await service.snapshot('thread-1');
  expect(snapshot.snapshot).toMatchObject({ sessionId: 'thread-1', groupSessionId: 'group-1', parentNativeId: 'parent-1', titleExact: 'Exact native title', workspaceRoot: root });
  expect(() => validateNativeSnapshot({ ...snapshot.snapshot, pageCoverage: { ...snapshot.snapshot.pageCoverage, omittedInPage: 0 } }, root)).toThrow(/coverage/u);
  expect(() => validateNativeSnapshot({ ...snapshot.snapshot, pageCoverage: { ...snapshot.snapshot.pageCoverage, hasLater: true } }, root)).toThrow(/coverage/u);
  rpc.status = 'idle'; expect((await service.snapshot('thread-1')).snapshot.sha256).toBe(snapshot.snapshot.sha256);
  rpc.foreign = true; await expect(service.read('thread-1')).rejects.toThrow(/project/u);
  service.close(); expect(service.status().connected).toBe(false); expect(rpc.open).toBe(false);
});

it('exposes a project-bound connector with approved explicit imports and idempotent snapshots', async () => {
  const { root, brain } = fixture(), rpc = new FakeRpc(root), api = createNativeCodexApi(() => rpc);
  const request = (method: string, route: string, body: Record<string, unknown> = {}, search = '') => api.request({ method, headers: { host: 'localhost' } } as IncomingMessage, route, new URL('http://localhost/api/workspace/' + route + search), root, brain, async () => body);
  expect((await request('GET', 'sessions/codex/status') as any).connected).toBe(false);
  await request('POST', 'sessions/codex/connect');
  await request('GET', 'sessions/codex/threads');
  const preview: any = await request('GET', 'sessions/codex/threads/thread-1');
  await expect(request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'CODEX_PAGE_CHANGED' });
  rpc.answer = 'The conversation changed after preview.';
  await expect(request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: preview.sha256 })).rejects.toMatchObject({ code: 'CODEX_PAGE_CHANGED' });
  rpc.answer = 'Approved native answer.';
  const first: any = await request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: preview.sha256 });
  expect(first.partial).toBe(true); expect(first.session.native).toMatchObject({ tool: 'codex', sessionId: 'thread-1', groupSessionId: 'group-1', titleExact: 'Exact native title', pageCoverage: { kind: 'page', direction: 'newest-first', hasEarlier: true, hasLater: false, cursorSha256: null, omittedInPage: 2 } });
  const reopened = new ProjectSessions(root, brain).read(first.session.id);
  expect(reopened.session.native?.pageCoverage).toEqual(first.session.native.pageCoverage);
  expect(first.messages).toHaveLength(2);
  const second: any = await request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: preview.sha256 });
  expect(second.session.id).toBe(first.session.id);
  const older: any = await request('GET', 'sessions/codex/threads/thread-1', {}, '?cursor=older-page');
  const olderSaved: any = await request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: older.sha256, cursor: 'older-page' });
  expect(olderSaved.session.native.pageCoverage).toMatchObject({ hasEarlier: false, hasLater: true, cursorSha256: expect.stringMatching(/^[0-9a-f]{64}$/u), omittedInPage: 2 });
  expect(JSON.stringify(olderSaved.session.native)).not.toContain('older-page');
  expect(new ProjectSessions(root, brain).read(olderSaved.session.id).session.native?.pageCoverage).toEqual(olderSaved.session.native.pageCoverage);
  await expect(request('POST', 'sessions/codex/connect', { executable: 'bad' })).rejects.toThrow();
  api.close(root); expect(rpc.open).toBe(false);
});

it('bounds and closes an owned JSONL child process without exposing unexpected output', async () => {
  const script = `import {createInterface} from 'node:readline'; createInterface({input:process.stdin}).on('line',line=>{const input=JSON.parse(line); if(input.id)process.stdout.write(JSON.stringify({id:input.id,result:{ok:true}})+'\\n')});`;
  const rpc = new NativeCodexStdioRpc(() => spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'pipe', windowsHide: true }));
  expect(await rpc.request('initialize', {})).toEqual({ ok: true });
  rpc.close(); expect(rpc.isOpen()).toBe(false);
  const huge = `process.stdin.once('data',()=>process.stdout.write('x'.repeat(2*1024*1024+1)))`;
  const limited = new NativeCodexStdioRpc(() => spawn(process.execPath, ['--input-type=module', '-e', huge], { stdio: 'pipe', windowsHide: true }));
  await expect(limited.request('thread/list', {})).rejects.toThrow(/could not complete/u);
  expect(limited.isOpen()).toBe(false);
  const hanging = new NativeCodexStdioRpc(() => spawn(process.execPath, ['--input-type=module', '-e', 'process.stdin.resume()'], { stdio: 'pipe', windowsHide: true }), 50);
  await expect(hanging.request('thread/list', {})).rejects.toThrow(/could not complete/u);
  expect(hanging.isOpen()).toBe(false);
}, 20000);

it('drives the complete connector against an owned synthetic app-server process', async () => {
  const { root, brain } = fixture();
  const script = `
import {createInterface} from 'node:readline';
const root = process.argv[1];
const thread = {id:'synthetic-thread',sessionId:'synthetic-tree',name:null,cwd:root,createdAt:1760000000,updatedAt:1760000001,status:{type:'notLoaded'}};
createInterface({input:process.stdin}).on('line',line=>{
  const input=JSON.parse(line); if(!input.id)return;
  const result=input.method==='initialize'?{}:input.method==='thread/list'?{data:[thread],nextCursor:null}:input.method==='thread/read'?{thread}:input.method==='thread/items/list'?{data:[{turnId:'turn',item:{id:'message',type:'userMessage',content:[{type:'text',text:'Synthetic history content.'}]}}],nextCursor:'older-items'}:null;
  process.stdout.write(JSON.stringify({id:input.id,result})+'\\n');
});`;
  let transport: NativeCodexStdioRpc | undefined;
  const api = createNativeCodexApi(() => transport = new NativeCodexStdioRpc(() => spawn(process.execPath, ['--input-type=module', '-e', script, root], { stdio: 'pipe', windowsHide: true })));
  const request = (method: string, route: string, body: Record<string, unknown> = {}) => api.request({ method, headers: { host: 'localhost' } } as IncomingMessage, route, new URL('http://localhost/api/workspace/' + route), root, brain, async () => body);
  try {
    await request('POST', 'sessions/codex/connect');
    const page: any = await request('GET', 'sessions/codex/threads');
    expect(page.threads[0]).toMatchObject({ id: 'synthetic-thread', sessionId: 'synthetic-tree', name: null, status: { type: 'notLoaded' } });
    const preview: any = await request('GET', 'sessions/codex/threads/synthetic-thread');
    const saved: any = await request('POST', 'sessions/codex/threads/synthetic-thread/import', { key: randomUUID(), sha256: preview.sha256 });
    expect(saved.session.native).toMatchObject({ titleExact: null, titleOrigin: 'unavailable', sessionId: 'synthetic-thread', groupSessionId: 'synthetic-tree' });
    expect(saved.messages[0]).toMatchObject({ role: 'user', text: 'Synthetic history content.' });
    expect(saved.partial).toBe(true);
    expect(new ProjectSessions(root, brain).read(saved.session.id).session.native?.pageCoverage).toMatchObject({ hasEarlier: true, hasLater: false, omittedInPage: 0 });
  } finally { api.close(root); }
  expect(transport?.isOpen()).toBe(false);
});

it('does not let old initialization or list replies revive or close a newer connection', async () => {
  const { root } = fixture();
  let rejectOld!: (error: Error) => void;
  let resolveList!: (value: unknown) => void;
  class Delayed extends FakeRpc {
    async request(method: string, params: any): Promise<unknown> {
      if (method === 'initialize') return new Promise((_, reject) => { rejectOld = reject; });
      return super.request(method, params);
    }
  }
  const old = new Delayed(root), current = new FakeRpc(root);
  let first = true;
  const service = new NativeCodexConnection(root, () => { if (first) { first = false; return old; } return current; });
  const pending = service.connect(); service.close(); await service.connect();
  rejectOld(new Error('synthetic old failure'));
  await expect(pending).rejects.toThrow();
  expect(service.status().connected).toBe(true); expect(current.open).toBe(true);
  const ordinary = current.request.bind(current);
  current.request = async (method, params) => method === 'thread/list' ? new Promise(resolve => { resolveList = resolve; }) : ordinary(method, params);
  const list = service.list(); service.close();
  resolveList({ data: [{ id:'old-thread', cwd:root, name:null, status:{type:'idle'} }], nextCursor:null });
  await expect(list).rejects.toThrow();
  expect(service.status().connected).toBe(false);
  await expect(service.read('old-thread')).rejects.toThrow(/listed/u);
});


it('does not report page completeness when the server omits pagination metadata', async () => {
  const { root } = fixture();
  class MissingCursor extends FakeRpc {
    async request(method: string, params: any): Promise<unknown> {
      if (method === 'thread/items/list') return { data: [] };
      return super.request(method, params);
    }
  }
  const service = new NativeCodexConnection(root, () => new MissingCursor(root));
  await service.connect(); await service.list();
  await expect(service.read('thread-1')).rejects.toThrow(/could not complete/u);
  service.close();
});
