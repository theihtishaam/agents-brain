import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmdirSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectSessions } from '../../src/brain/project-sessions.js';
import { validateNativeSnapshot } from '../../src/brain/native-session-import.js';
import { NativeCodexConnection, NativeCodexStdioRpc, type NativeCodexRpc } from '../../src/brain/native-codex.js';
import { createNativeCodexApi } from '../../src/dashboard/native-codex-api.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';
import { ProjectPolicyStore } from '../../src/brain/project-policy.js';
import { MCPServer } from '../../src/brain/mcp-server.js';
import { SESSION_OPERATOR } from '../../src/brain/project-session-contract.js';

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
  itemPage?: { data: unknown[]; nextCursor: string | null };
  historyPages?: Map<string | null, { data: unknown[]; nextCursor: string | null }>;
  updated = 1760000001;
  constructor(readonly root: string) {}
  async request(method: string, params: any): Promise<unknown> {
    this.calls.push({ method, params });
    const thread = { id: 'thread-1', sessionId: 'group-1', parentThreadId: 'parent-1', name: 'Exact native title', cwd: this.foreign ? join(this.root, 'elsewhere') : this.root,
      createdAt: 1760000000, updatedAt: this.updated, status: { type: this.status, activeFlags: ['waitingOnUserInput'] }, preview: 'DO_NOT_RELAY_PREVIEW', modelProvider: 'fixture-provider', agentNickname: 'Archivist', agentRole: 'worker', path: 'DO_NOT_RELAY_PATH' };
    if (method === 'initialize') return { userAgent: 'synthetic' };
    if (method === 'thread/list') return { data: [thread], nextCursor: 'next-page' };
    if (method === 'thread/read') return { thread };
    if (method === 'thread/items/list') return this.historyPages?.get(params.cursor) ?? this.itemPage ?? { data: [
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
  expect(list.threads[0]).toMatchObject({ provider: 'fixture-provider', agentNickname: 'Archivist', agentRole: 'worker' });
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

it('follows a reviewed synthetic chat from the server, appends across pages once and stops safely on a gap', async () => {
  vi.useFakeTimers();
  try {
    const { root, brain } = fixture(), rpc = new FakeRpc(root);
    let api = createNativeCodexApi(() => rpc);
    cleanups.push(() => api.close(root));
    const local = projectStorage(root);
    const settings = new FeatureSettingsStore({ filePath: local.settingsPath });
    const route = (method: string, suffix: string, body: Record<string, unknown> = {}, projectId = local.projectId) => {
      const name = 'sessions/codex/' + suffix;
      const req = { method, headers: { host: 'localhost', 'x-shadow-brain-project': projectId }, socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage;
      return api.request(req, name, new URL('http://localhost/api/workspace/' + name), root, brain, async () => body) as Promise<any>;
    };
    await route('POST', 'connect');
    await route('GET', 'threads');
    const preview = await route('GET', 'threads/thread-1');
    await expect(route('POST', 'threads/thread-1/follow', { sha256: preview.sha256 })).rejects.toMatchObject({ code: 'CODEX_ARCHIVE_CAPTURE_OFF' });
    await expect(route('POST', 'threads/thread-1/follow', { sha256: preview.sha256 }, 'foreign-project')).rejects.toMatchObject({ code: 'CODEX_ARCHIVE_SCOPE' });
    await settings.update({ exactConversationCapture: true });
    await expect(route('POST', 'threads/thread-1/follow', { sha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'CODEX_ARCHIVE_CHANGED' });
    expect(new ProjectSessions(root, brain).list().sessions).toEqual([]);
    const followed = await route('POST', 'threads/thread-1/follow', { sha256: preview.sha256 });
    expect(followed).toMatchObject({ active: true, result: { sections: 2, revision: 0, olderHistoryOutsideArchive: true } });
    const archiveId = followed.result.archiveId;
    const read = () => new ProjectSessions(root, brain).read(archiveId);
    const initial = read();
    expect(initial.session.native).toMatchObject({ format: 'codex-app-server-follow-v1', titleExact: 'Exact native title' });
    expect(initial.messages.map(message => [message.role, message.text])).toEqual([['user', ' Exact user text. '], ['assistant', 'Approved native answer.']]);
    expect(JSON.stringify(initial)).not.toContain('DO_NOT_RELAY');
    rpc.updated++;
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await route('GET', 'follow')).result).toMatchObject({ added: 0, revision: 0 });
    expect(read()).toEqual(initial);

    const nextUser = { item: { id: 'next-user', type: 'userMessage', content: [{ type: 'text', text: '  Another user note.\n' }] } };
    const nextAnswer = { item: { id: 'next-answer', type: 'agentMessage', text: ' Another exact answer. ' } };
    rpc.historyPages = new Map([
      [null, { data: [nextAnswer, nextUser], nextCursor: 'fresh-cursor' }],
      ['fresh-cursor', { data: [{ item: { id: 'agent-1', type: 'agentMessage', text: rpc.answer } }], nextCursor: null }],
    ]);
    rpc.updated++;
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await route('GET', 'follow')).result).toMatchObject({ archiveId, added: 2, revision: 1, sections: 4 });
    expect(read().messages.map(message => [message.native?.id, message.text])).toEqual([
      ['user-1:0', ' Exact user text. '], ['agent-1', 'Approved native answer.'], ['next-user:0', '  Another user note.\n'], ['next-answer', ' Another exact answer. '],
    ]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await route('GET', 'follow')).result).toMatchObject({ added: 0, revision: 1, sections: 4 });

    rpc.historyPages = new Map([[null, { data: [nextUser], nextCursor: null }]]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await route('GET', 'follow')).toMatchObject({ active: false, issue: expect.stringMatching(/boundary/u) });
    expect(read().messages).toHaveLength(4);
    const nativeCalls = rpc.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(rpc.calls).toHaveLength(nativeCalls);
    expect(new ProjectSessions(root, brain).list().sessions).toHaveLength(1);
    expect(rpc.calls.filter(call => call.method.startsWith('thread/')).every(call => ['thread/list', 'thread/read', 'thread/items/list'].includes(call.method))).toBe(true);

    api.close(root);
    const restarted = new FakeRpc(root);
    restarted.itemPage = { data: [
      { item: { id: 'opaque', type: 'agentMessage', phase: 'analysis', text: 'DO_NOT_RELAY_PHASE' } },
      { item: { id: 'late-answer', type: 'agentMessage', text: 'Saved after reconnect.' } }, nextAnswer, nextUser,
    ], nextCursor: null };
    api = createNativeCodexApi(() => restarted);
    await route('POST', 'connect');
    await route('GET', 'threads');
    const latest = await route('GET', 'threads/thread-1');
    expect(await route('GET', 'follow')).toMatchObject({ active: false });
    expect((await route('POST', 'threads/thread-1/follow', { sha256: latest.sha256 })).result)
      .toMatchObject({ archiveId, added: 1, sections: 5, revision: 2 });
    expect(read().messages.at(-1)?.text).toBe('Saved after reconnect.');
    expect(JSON.stringify(read())).not.toContain('DO_NOT_RELAY_PHASE');
    expect(await route('POST', 'follow/stop')).toMatchObject({ active: false, result: { archiveId, sections: 5 } });
    const afterStop = restarted.calls.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(restarted.calls).toHaveLength(afterStop);
  } finally { vi.useRealTimers(); }
});

it('stops native follow on revocation and withholds saved text and derived checkpoints from another agent', async () => {
  vi.useFakeTimers();
  try {
    const { root, brain } = fixture(), rpc = new FakeRpc(root), api = createNativeCodexApi(() => rpc);
    cleanups.push(() => api.close(root));
    const local = projectStorage(root);
    const settings = new FeatureSettingsStore({ filePath: local.settingsPath });
    const policy = new ProjectPolicyStore(root, local.projectId);
    const route = (method: string, suffix: string, body: Record<string, unknown> = {}) => {
      const name = 'sessions/codex/' + suffix;
      const req = { method, headers: { host: 'localhost', 'x-shadow-brain-project': local.projectId }, socket: { remoteAddress: '127.0.0.1' } } as IncomingMessage;
      return api.request(req, name, new URL('http://localhost/api/workspace/' + name), root, brain, async () => body) as Promise<any>;
    };
    await settings.update({ exactConversationCapture: true, activityRecording: false });
    await route('POST', 'connect');
    await route('GET', 'threads');
    const preview = await route('GET', 'threads/thread-1');
    const { result } = await route('POST', 'threads/thread-1/follow', { sha256: preview.sha256 });
    const archiveId = result.archiveId;
    const sessions = new ProjectSessions(root, brain);
    const checkpoint = sessions.record(archiveId, { kind: 'checkpoint', summary: 'Synthetic private follow checkpoint', nextSteps: ['Verify synthetic follow checkpoint'], key: randomUUID() }, SESSION_OPERATOR).checkpoints[0];
    const derived = sessions.resume(archiveId, { checkpointId: checkpoint.id, sha256: checkpoint.sha256, key: randomUUID() }, SESSION_OPERATOR).session.id;
    const server = new MCPServer(null, { toolProfile: 'memory', authToken: '' }, { localProject: true, projectDir: root,
      projectId: local.projectId, brain, settings, clientId: 'opencode' });
    cleanups.push(() => server.finishMemorySession());
    await server.handleRequest({ jsonrpc: '2.0', id: 7, method: 'initialize', params: { protocolVersion: '2025-11-25',
      clientInfo: { name: 'OpenCode fixture', version: '1' }, capabilities: {} } });
    const call = (name: string, args: object) => server.handleRequest({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name, arguments: args } });
    expect(JSON.stringify(await call('session_read', { sessionId: archiveId }))).toContain('Approved native answer.');
    expect(JSON.stringify(await call('session_read', { sessionId: derived }))).toContain('Synthetic private follow checkpoint');
    const deny = async (code = 'SESSION_SHARING_OFF') => {
      for (const [name, args] of [
        ['session_read', { sessionId: archiveId }], ['session_read', { sessionId: derived }],
        ['session_checkpoint_read', { sessionId: archiveId, checkpointId: checkpoint.id }],
        ['session_recover', { sessionId: archiveId, key: randomUUID(), expectedRevision: sessions.read(archiveId).session.revision }],
      ] as const) {
        const response = await call(name, args);
        expect(JSON.stringify(response)).not.toMatch(/Approved native answer|Synthetic private follow checkpoint/u);
        expect(code === 'PROJECT_DISABLED' ? response.error?.code : JSON.stringify(response.result)).toEqual(
          code === 'PROJECT_DISABLED' ? -32003 : expect.stringContaining(code));
      }
      const handoffs = await call('session_handoffs', { query: 'synthetic private follow' });
      expect(JSON.stringify(handoffs)).not.toMatch(/Synthetic private follow checkpoint|Verify synthetic follow checkpoint/u);
    };
    await settings.update({ exactConversationCapture: false });
    await deny();
    const nativeCalls = rpc.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rpc.calls).toHaveLength(nativeCalls);
    expect(await route('GET', 'follow')).toMatchObject({ active: false, issue: expect.stringMatching(/feature controls/u) });
    await settings.update({ exactConversationCapture: true });
    await policy.update({ kind: 'set-tool-participation', tool: 'codex', enabled: false, expectedRevision: 0 });
    await deny();
    await policy.update({ kind: 'set-tool-participation', tool: 'codex', enabled: true, expectedRevision: 1 });
    await policy.update({ kind: 'set-chat-sharing', shareContext: false, sessionId: archiveId, expectedRevision: 2 }, sessions.read(archiveId).session);
    await deny();
    await policy.update({ kind: 'set-project-participation', enabled: false, expectedRevision: 3 });
    await deny('PROJECT_DISABLED');
    expect(sessions.read(archiveId).messages).toHaveLength(2);
  } finally { vi.useRealTimers(); }
});

it('retains long native text exactly in stable source ranges, including Unicode and blank continuations', async () => {
  const { root } = fixture(), rpc = new FakeRpc(root), service = new NativeCodexConnection(root, () => rpc);
  cleanups.push(() => service.close());
  const longUser = 'x'.repeat(7999) + '🧪' + ' '.repeat(16_000) + '\nend ';
  const longAssistant = ' answer '.repeat(1001);
  rpc.itemPage = { data: [
    { item: { id: 'after', type: 'agentMessage', text: 'Last ordinary message.' } },
    { item: { id: 'answer', type: 'agentMessage', text: longAssistant, phase: 'final_answer' } },
    { item: { id: 'question', type: 'userMessage', content: [{ type: 'text', text: longUser }, { type: 'text', text: 'before answer' }] } },
    { item: { id: 'first', type: 'agentMessage', text: 'a'.repeat(8000) } },
  ], nextCursor: null };
  await service.connect();
  await service.list();
  const page = await service.read('thread-1');
  const user = page.messages.filter(row => row.locator.startsWith('/items/question/content/0#'));
  const assistant = page.messages.filter(row => row.locator.startsWith('/items/answer#'));
  expect(user.map(row => row.text).join('')).toBe(longUser);
  expect(assistant.map(row => row.text).join('')).toBe(longAssistant);
  expect(user.map(row => row.locator)).toEqual([0, 7999, 15999, 23999].map((start, index) => `/items/question/content/0#utf16=${start},${[7999, 15999, 23999, longUser.length][index]}`));
  expect(user[1].text.startsWith('🧪')).toBe(true);
  expect(user[2].text).toBe(' '.repeat(8000));
  expect(assistant.map(row => row.phase)).toEqual(['final_answer', 'final_answer']);
  expect(page.messages.filter(row => !row.locator.includes('#')).map(row => row.id)).toEqual(['first', 'question:1', 'after']);
  expect(page.pageCoverage).toMatchObject({ hasEarlier: false, hasLater: false, omittedInPage: 0 });
  expect(new Set(page.messages.map(row => row.id)).size).toBe(page.messages.length);
  const { snapshot } = await service.snapshot('thread-1');
  expect(snapshot.sha256).toBe(page.sha256);
  expect(validateNativeSnapshot(snapshot, root).messages.filter(row => row.locator.startsWith('/items/question/content/0#')).map(row => row.text).join('')).toBe(longUser);
  const changed = { ...snapshot, messages: snapshot.messages.map(row => row.locator === user[2].locator ? { ...row, text: ' ' } : row) };
  expect(() => validateNativeSnapshot(changed, root)).toThrow(/text range/u);
});

it('preserves ordinary messages and reports partial coverage when continuations exceed page capacity', async () => {
  const { root, brain } = fixture(), rpc = new FakeRpc(root), api = createNativeCodexApi(() => rpc);
  cleanups.push(() => api.close(root));
  const normal = Array.from({ length: 199 }, (_, i) => ({ type: 'text', text: 'Ordinary part ' + i }));
  rpc.itemPage = { data: [
    { item: { id: 'short', type: 'userMessage', content: normal } },
    { item: { id: 'long', type: 'agentMessage', text: 'x'.repeat(16_001) } },
  ], nextCursor: null };
  const request = (method: string, route: string, body: Record<string, unknown> = {}) => api.request({ method, headers: { host: 'localhost' } } as IncomingMessage, route, new URL('http://localhost/api/workspace/' + route), root, brain, async () => body);
  await request('POST', 'sessions/codex/connect');
  await request('GET', 'sessions/codex/threads');
  const preview: any = await request('GET', 'sessions/codex/threads/thread-1');
  expect(preview.messages).toHaveLength(200);
  expect(preview.messages.slice(1).map((row: { text: string }) => row.text)).toEqual(normal.map(row => row.text));
  expect(preview.messages[0]).toMatchObject({ locator: '/items/long#utf16=0,8000', text: 'x'.repeat(8000) });
  expect(preview).toMatchObject({ nextCursor: null, omitted: 2, pageCoverage: { hasEarlier: false, hasLater: false, omittedInPage: 2, capacityOmittedInPage: 2 } });
  const saved: any = await request('POST', 'sessions/codex/threads/thread-1/import', { key: randomUUID(), sha256: preview.sha256 });
  expect(saved).toMatchObject({ partial: true, session: { native: { pageCoverage: preview.pageCoverage } } });
  expect(new ProjectSessions(root, brain).read(saved.session.id).session.native?.pageCoverage).toEqual(preview.pageCoverage);
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

it('rejects an existing foreign root and a directory link even if it points at the project', async () => {
  const { root } = fixture(), foreign = fixture();
  const mismatch = new NativeCodexConnection(root, () => new FakeRpc(foreign.root));
  await mismatch.connect(); await expect(mismatch.list()).rejects.toThrow(/project/u); mismatch.close();
  const alias = join(root, 'linked-project');
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const linked = new NativeCodexConnection(root, () => new FakeRpc(alias));
    await linked.connect(); await expect(linked.list()).rejects.toThrow(/project/u); linked.close();
  } finally { unlinkSync(alias); }
});

it.skipIf(process.platform !== 'win32')('accepts an equivalent Windows short spelling without relaxing project scope', async context => {
  const { root, brain } = fixture();
  const canonical = projectStorage(root).root;
  const query = spawnSync('cmd.exe', ['/d', '/c', 'for %I in ("%ASB_NATIVE_ALIAS_FIXTURE%") do @echo %~sI'], {
    env: { ...process.env, ASB_NATIVE_ALIAS_FIXTURE: canonical }, encoding: 'utf8', windowsHide: true, windowsVerbatimArguments: true, timeout: 5000,
  });
  expect(query.status, query.stderr).toBe(0);
  const alias = query.stdout.trim();
  if (alias.toLowerCase() === canonical.toLowerCase()) context.skip('The fixture volume does not provide an 8.3 short path.');
  expect(realpathSync.native(alias).toLowerCase()).toBe(canonical.toLowerCase());
  const rpc = new FakeRpc(alias), service = new NativeCodexConnection(canonical, () => rpc);
  try {
    await service.connect();
    expect((await service.list()).threads[0].cwd.toLowerCase()).toBe(canonical.toLowerCase());
    expect((await service.read('thread-1')).thread.cwd.toLowerCase()).toBe(canonical.toLowerCase());
  } finally { service.close(); }
  const requestFor = (api: ReturnType<typeof createNativeCodexApi>, directory: string) => api.request(
    { method: 'POST', headers: { host: 'localhost' } } as IncomingMessage, 'sessions/codex/connect',
    new URL('http://localhost/api/workspace/sessions/codex/connect'), directory, brain, async () => ({}));
  const shortRpc = new FakeRpc(alias), first = createNativeCodexApi(() => shortRpc);
  await requestFor(first, alias); first.close(canonical); expect(shortRpc.open).toBe(false);
  const longRpc = new FakeRpc(canonical), second = createNativeCodexApi(() => longRpc);
  await requestFor(second, canonical); second.close(alias); expect(longRpc.open).toBe(false);
});

it('closes a known connection after its project directory has been removed', async () => {
  const { root, brain } = fixture(), foreign = fixture(), rpc = new FakeRpc(root), api = createNativeCodexApi(() => rpc);
  await api.request({ method: 'POST', headers: { host: 'localhost' } } as IncomingMessage, 'sessions/codex/connect',
    new URL('http://localhost/api/workspace/sessions/codex/connect'), root, brain, async () => ({}));
  api.close(foreign.root); expect(rpc.open).toBe(true);
  rmdirSync(root); // The isolated fixture is empty; no project files or links are removed.
  api.close(root); expect(rpc.open).toBe(false);
});
