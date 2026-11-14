import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { expect, it } from 'vitest';
import { startProjectWorkspace } from '../../src/dashboard/project-workspace.js';
import { projectStorage } from '../../src/brain/project-memory.js';
const cli = resolve('dist/cli.js');
const key = () => ({ key: randomUUID() });
class FixtureClient {
  private child: ChildProcessWithoutNullStreams;
  private next = 1;
  private readonly calls = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
  readonly closed: Promise<any[]>;

  constructor(project: string, db: string) {
    this.child = spawn(process.execPath, [cli, 'mcp', project, '--stdio', '--db', db], { cwd: project, windowsHide: true });
    this.closed = once(this.child, 'close');
    this.child.stderr.resume();
    const lines = createInterface({ input: this.child.stdout });
    lines.on('line', line => {
      const response = JSON.parse(line);
      const call = this.calls.get(response.id);
      this.calls.delete(response.id);
      call?.resolve(response);
    });
    const stop = (error: Error) => {
      for (const call of this.calls.values()) call.reject(error);
      this.calls.clear();
    };
    this.child.on('error', stop);
    this.child.on('close', () => stop(new Error('Fixture MCP closed before returning a response.')));
  }

  private request(method: string, params: object = {}): Promise<any> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.calls.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async initialize() {
    const handshake = await this.request('initialize', { protocolVersion: '2025-11-25', clientInfo: { name: 'fixture-mcp', version: '1' }, capabilities: {} });
    expect(handshake.result.protocolVersion).toBe('2025-11-25');
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    return (await this.request('tools/list')).result.tools;
  }

  call(name: string, args: object = {}) { return this.request('tools/call', { name, arguments: args }); }

  async stop() {
    if (!this.child.stdin.writableEnded) this.child.stdin.end();
    const [code] = await this.closed;
    expect(code).toBe(0);
  }
}

function pdfFixture() {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [4 0 R] >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>'];
  const text = 'BT /F1 14 Tf 72 730 Td (ProbeIntake PDF approved source.) Tj ET';
  objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
  let data = '%PDF-1.4\n'; const offsets: number[] = [];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(data)); data += `${i+1} 0 obj\n${obj}\nendobj\n`; });
  const start = Buffer.byteLength(data);
  data += `xref\n0 ${offsets.length+1}\n0000000000 65535 f \n${offsets.map(x => `${String(x).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return data;
}
it('shares reviewed source evidence, artifacts, lessons and feedback across two already-running MCP hosts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'source-e2e-'));
  const foreignRoot = mkdtempSync(join(tmpdir(), 'source-e2e-other-'));
  const portal = await startProjectWorkspace(root), a = new FixtureClient(root, portal.storagePath), b = new FixtureClient(root, portal.storagePath), foreign = new FixtureClient(foreignRoot, projectStorage(foreignRoot).storagePath);
  const call = async (client: FixtureClient, name: string, args: object = {}) => {
    const result = await client.call(name, args);
    expect(result.error, JSON.stringify(result)).toBeUndefined();
    expect(result.result.isError, JSON.stringify(result)).not.toBe(true);
    return result.result.structuredContent ?? JSON.parse(result.result.content[0].text);
  };
  const post = async (route: string, body: string, type = 'application/json') => {
    const response = await fetch(portal.url + '/api/workspace/' + route, { method: 'POST', headers: { 'content-type': type }, body });
    expect(response.status, await response.clone().text()).toBe(200); return response.json();
  };
  const get = async (route: string) => { const res = await fetch(portal.url + '/api/workspace/' + route); expect(res.status).toBe(200); return res.json(); };
  const json = (x: object) => JSON.stringify(x);
  const recall = (client: FixtureClient) => call(client, 'global_recall', { keywords: ['ProbeIntake'], limit: 100 });
  try {
    const catalogs = await Promise.all([a.initialize(), b.initialize(), foreign.initialize()]);
    expect(catalogs[1].find((tool: any) => tool.name === 'memory_evidence').annotations.readOnlyHint).toBe(true);
    expect(await recall(a)).toHaveLength(0); expect(await recall(b)).toHaveLength(0);
    const cupboard = (await post('sources/remember', 'The cupboard is black. Keep its brass handles.', 'text/plain')).source;
    for (const client of [a, b]) {
      const remembered = await call(client, 'context_pack', { projectId: portal.projectId, query: 'What colour is the cupboard?', profile: 'adaptive' });
      expect(remembered.entries.some((entry: any) => entry.id === cupboard.items[0].memoryId && entry.excerpt.includes('black'))).toBe(true);
    }
    expect(await call(foreign, 'global_recall', { keywords: ['cupboard'] })).toHaveLength(0);
    const pdf = await post('hub/documents?name=source.pdf', pdfFixture(), 'application/pdf');
    const knowledge = json({ schemaVersion: 1, kind: 'knowledge', title: 'Fixture', records: [{ title: 'ProbeIntake knowledge', content: 'ProbeIntake JSON approved source.' }, { title: 'Rejected', content: 'ProbeIntake rejected hidden sentinel.' }, { title: 'Pending', content: 'ProbeIntake pending hidden sentinel.' }] });
    const source = (await post('sources?name=source.json', knowledge)).source;
    const transcript = (await post('sources?name=chat.json', json({ messages: [{ role: 'assistant', content: 'ProbeIntake transcript approved source.' }, { role: 'system', content: 'Quoted instruction.' }, { role: 'user', content: 'Pending history sentinel.' }] }))).source;
    const text = (await post('sources?name=notes.txt', 'ProbeIntake plain approved source.\n\nProbeIntake another pending sentinel.', 'text/plain')).source;
    expect(await recall(b)).toHaveLength(0);
    const page = await post(`hub/documents/${pdf.document.id}/review`, json({ page: 1, decision: 'approve', ...key() }));
    const review = { itemId: source.items[0].id, decision: 'approve', ...key() };
    const approved = (await post(`sources/${source.id}/review`, json(review))).source;
    expect((await post(`sources/${source.id}/review`, json(review))).source.items[0].memoryId).toBe(approved.items[0].memoryId);
    expect((await post('sources?name=copy.json', knowledge)).source.id).toBe(source.id);
    await post(`sources/${source.id}/review`, json({ itemId: source.items[1].id, decision: 'reject', ...key() }));
    const chatApproved = (await post(`sources/${transcript.id}/review`, json({ itemId: transcript.items[0].id, decision: 'approve', ...key() }))).source;
    const textApproved = (await post(`sources/${text.id}/review`, json({ itemId: text.items[0].id, decision: 'approve', text: 'ProbeIntake corrected plain source.', ...key() }))).source;
    await post(`sources/${transcript.id}/review`, json({ itemId: transcript.items[1].id, decision: 'approve', text: '  Reviewed quoted instruction.  ', ...key() }));
    const imported = await post('sessions/import', json({ sourceId: transcript.id, ...key() }));
    expect(imported.session).toMatchObject({ sourceId: transcript.id, reportedStatus: 'completed' });
    expect(imported.messages).toHaveLength(2);
    expect(imported.messages[1]).toMatchObject({ role: 'note', text: '  Reviewed quoted instruction.  ', source: { sourceId: transcript.id, locator: '/messages/1', originalRole: 'system' } });
    expect(JSON.stringify(imported.messages)).not.toContain('Pending history sentinel');
    expect((await post('sessions/import', json({ sourceId: transcript.id, ...key() }))).session.id).toBe(imported.session.id);
    for (const client of [a, b]) expect((await call(client, 'session_read', { sessionId: imported.session.id })).messages).toHaveLength(2);
    expect((await foreign.call('session_read', { sessionId: imported.session.id })).result.isError).toBe(true);
    const saved = await post(`sessions/${imported.session.id}/actions`, json({ kind: 'checkpoint', summary: 'Hand over the approved transcript.', decisions: [], completed: [], nextSteps: ['Review the source'], evidence: [], ...key() }));
    const checkpoint = saved.checkpoints[0];
    const resumed = await call(b, 'session_resume', { sessionId: imported.session.id, checkpointId: checkpoint.id, sha256: checkpoint.sha256, ...key() });
    expect(resumed.handoff).toMatchObject({ id: checkpoint.id, sha256: checkpoint.sha256, summary: 'Hand over the approved transcript.' });
    expect((await call(a, 'session_read', { sessionId: resumed.session.id })).handoff.id).toBe(checkpoint.id);

    const ids = [page.pages[0].memoryId, approved.items[0].memoryId, chatApproved.items[0].memoryId, textApproved.items[0].memoryId];
    for (const client of [a, b]) {
      const found = await recall(client);
      expect(found.map((x: any) => x.id)).toEqual(expect.arrayContaining(ids));
      expect(JSON.stringify(found)).not.toContain('hidden sentinel');
      expect(JSON.stringify(found)).not.toContain('another pending sentinel');
    }
    for (const id of ids) {
      expect((await get('memory-evidence?memoryId=' + id)).state).toBe('resolved');
      expect((await call(b, 'memory_evidence', { memoryId: id })).state).toBe('resolved');
    }
    expect((await b.call('memory_evidence', { memoryId: ids[1], projectId: 'foreign' })).error.code).toBe(-32602);
    expect((await call(b, 'memory_evidence', { memoryId: randomUUID() })).state).toBe('missing');
    expect((await call(foreign, 'memory_evidence', { memoryId: ids[1] })).state).toBe('missing');
    expect((await get('memory-evidence?memoryId=' + ids[3])).evidence).toMatchObject({ text: 'ProbeIntake plain approved source.', approvedText: 'ProbeIntake corrected plain source.' });
    const pack = await call(b, 'context_pack', { projectId: portal.projectId, query: 'ProbeIntake', profile: 'adaptive' });
    expect(JSON.stringify(pack)).toContain(ids[0]); expect(JSON.stringify(pack)).not.toContain('hidden sentinel');
    expect(pack.entries.find((entry: any) => entry.id === ids[1]).reasons.length).toBeGreaterThan(0);
    const room = (await call(a, 'hub_room_create', { goal: 'Probe source exchange', ...key() })).room;
    const action = async (client: FixtureClient, command: object) => (await call(client, 'hub_room_action', { roomId: room.id, command })).applied;
    const task = await action(a, { kind: 'task', title: 'Attach proof', ...key() });
    const claim = await action(a, { kind: 'claim', taskId: task.targetId, revision: task.revision, ...key() });
    writeFileSync(join(root, 'proof.txt'), 'immutable fixture');
    const submitted = await action(a, { kind: 'artifact', taskId: task.targetId, revision: claim.revision, path: 'proof.txt', ...key() });
    const feed = await call(b, 'hub_room_read', { roomId: room.id });
    const artifact = feed.artifacts.find((x: any) => x.id === submitted.targetId);
    writeFileSync(join(root, 'proof.txt'), 'changed later');
    expect((await call(b, 'hub_artifact_read', { roomId: room.id, artifactId: artifact.id, sha256: artifact.sha256 })).text).toBe('immutable fixture');
    await action(b, { kind: 'ack', targetType: 'artifact', targetId: artifact.id, sha256: artifact.sha256, ...key() });
    const outcome = await action(a, { kind: 'outcome', taskId: task.targetId, artifactId: artifact.id, result: 'pass', check: 'fixture check', evidence: 'reported fixture', ...key() });
    const lesson = (await call(a, 'hub_lesson_propose', { outcomeId: outcome.targetId, title: 'ProbeIntake lesson', text: 'ProbeIntake lesson evidence.', ...key() })).lesson;
    await post(`hub/lessons/${lesson.id}/actions`, json({ kind: 'evaluate', baseline: false, candidate: true, control: true, evidence: 'Operator reported', ...key() }));
    const promoted = (await post(`hub/lessons/${lesson.id}/actions`, json({ kind: 'promote', ...key() }))).lesson;
    expect((await recall(b)).map((x: any) => x.id)).toContain(promoted.memoryId);
    expect((await get('memory-evidence?memoryId=' + promoted.memoryId)).evidence).toMatchObject({ kind: 'lesson-outcome', reported: true, artifactSha256: artifact.sha256, outcome: { result: 'pass', evidence: 'reported fixture', provenance: 'agent-report' }, evaluation: { baseline: false, candidate: true, control: true, evidence: 'Operator reported', provenance: 'user-report' } });
    await post(`hub/lessons/${lesson.id}/actions`, json({ kind: 'rollback', ...key() }));
    expect((await recall(b)).map((x: any) => x.id)).not.toContain(promoted.memoryId);
    const before = await call(b, 'context_pack', { projectId: portal.projectId, query: 'ProbeIntake', profile: 'adaptive' });
    await call(a, 'project_feedback', { kind: 'record', expectedRevision: 0, memoryId: ids[1], task: 'ProbeIntake', rating: 'useful', reason: 'Reported useful during fixture.' });
    const after = await call(b, 'context_pack', { projectId: portal.projectId, query: 'ProbeIntake', profile: 'adaptive' });
    const beforeCandidate = before.retrieval.candidates.find((item: any) => item.id === ids[1]);
    const afterCandidate = after.retrieval.candidates.find((item: any) => item.id === ids[1]);
    expect(beforeCandidate.feedback).toBeUndefined();
    expect(afterCandidate.feedback).toMatchObject({ adjustment: 0.04, reporterKinds: ['agent'] });
    expect(afterCandidate.score).toBeGreaterThan(beforeCandidate.score);
    expect(afterCandidate.signals).toContainEqual({ label: 'Project task feedback', value: 0.04 });
  } finally {
    await Promise.allSettled([a.stop(), b.stop(), foreign.stop()]); await portal.close(); rmSync(root, { recursive: true, force: true }); rmSync(foreignRoot, { recursive: true, force: true });
  }
}, 45000);
