import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { assembleContext } from '../../src/brain/context-assembly.js';
import { memoryAnnotationsFor } from '../../src/brain/memory-annotations.js';
import { ProjectHubService } from '../../src/brain/project-hub.js';
import { HUB_LIMITS, HUB_OPERATOR, type HubActor } from '../../src/brain/project-hub-contract.js';
import { projectStorage } from '../../src/brain/project-memory.js';

const cleanups: Array<() => void | Promise<void>> = [];
const planner: HubActor = { id: 'fixture-planner', kind: 'agent' };
const worker: HubActor = { id: 'fixture-worker', kind: 'agent' };
const key = () => ({ key: randomUUID() });

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'asb-hub-'));
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  let now = Date.now();
  const store = projectStorage(root);
  const connect = () => {
    const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
    const hub = new ProjectHubService(root, brain, () => now);
    cleanups.push(async () => { hub.close(); await brain.shutdown(); });
    return { hub, brain };
  };
  return { root, store, connect, advance: (ms: number) => { now += ms; }, ...connect() };
}

function fixturePdf(lines: Array<string | null>, encrypted = false) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${lines.length} /Kids [${lines.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  lines.forEach((line, i) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    const content = line ? `BT /F1 14 Tf 72 730 Td (${line}) Tj ET` : 'q 80 0 0 80 70 700 cm BI /W 1 /H 1 /BPC 8 /CS /RGB ID\n\u00ff\u0000\u0000\nEI Q';
    objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
  });
  if (encrypted) objects.push(`<< /Filter /Standard /V 1 /R 2 /P -4 /O <${'00'.repeat(32)}> /U <${'00'.repeat(32)}> >>`);
  let data = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(data, 'latin1')); data += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(data, 'latin1');
  const encryption = encrypted ? ` /Encrypt ${objects.length} 0 R /ID [<${'11'.repeat(16)}> <${'11'.repeat(16)}>]` : '';
  data += `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R${encryption} >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(data, 'latin1');
}

describe('project hub', () => {
  it('persists a text PDF with immutable page citations, deduplicates bytes, and indexes approved text once', async () => {
    const { hub, brain, store, connect } = workspace();
    const data = fixturePdf(['Checkout requests reuse their original idempotency key.', 'The retry budget is three attempts.', null]);
    const uploaded = await hub.upload('checkout.pdf', data);
    const sha256 = createHash('sha256').update(data).digest('hex');
    expect(uploaded.document, uploaded.document.error ?? undefined).toMatchObject({ status: 'ready', pageCount: 3, sha256, parser: 'PDF.js 6.5.438' });
    expect(uploaded.pages.map(page => page.status)).toEqual(['pending', 'pending', 'needs-ocr']);
    expect(uploaded.pages[1]).toMatchObject({ page: 2, text: 'The retry budget is three attempts.', citation: `checkout.pdf · sha256:${sha256} · p. 2` });
    expect((await hub.upload('copy.pdf', data)).document.id).toBe(uploaded.document.id);
    await brain.init();
    expect(assembleContext(brain, { projectId: store.projectId, query: 'retry budget' }).entries).toHaveLength(0);
    await hub.reviewDocument(uploaded.document.id, { page: 1, decision: 'reject', ...key() });
    await expect(hub.reviewDocument(uploaded.document.id, { page: 3, decision: 'approve', ...key() })).rejects.toMatchObject({ code: 'HUB_CONFLICT' });
    const approve = { page: 2, decision: 'approve', ...key() };
    const approved = await hub.reviewDocument(uploaded.document.id, approve);
    expect(approved.pages[1]).toMatchObject({ status: 'approved', memoryId: expect.any(String) });
    const id = approved.pages[1].memoryId;
    const selected = assembleContext(brain, { projectId: store.projectId, query: 'retry budget' });
    expect(selected.entries.map(entry => entry.id)).toEqual([id]);
    expect(selected.entries[0].sources).toEqual([approved.pages[1].citation]);
    expect(selected.markdown).not.toContain('idempotency key');
    expect(brain.getEntry(id!)?.metadata).toMatchObject({ page: 2, untrustedEvidence: true });
    hub.close();
    const restarted = connect();
    expect((await restarted.hub.reviewDocument(uploaded.document.id, approve)).pages[1].memoryId).toBe(id);
    expect(restarted.brain.timeline({ projectId: store.projectId })).toHaveLength(1);
    await expect(restarted.hub.reviewDocument(uploaded.document.id, { ...approve, page: 1 })).rejects.toMatchObject({ code: 'HUB_CONFLICT' });
    const revised = await restarted.hub.upload('checkout.pdf', fixturePdf(['The retry budget is two attempts.']));
    expect(revised.document.id).not.toBe(uploaded.document.id);
    expect(revised.pages[0].status).toBe('pending');
    expect(workspace().hub.overview().documents).toEqual([]);
    expect(() => workspace().hub.document(uploaded.document.id)).toThrow(/not found in this project/u);
  }, 15_000);

  it('retains failed PDF intake, labels image-only pages, and bounds malformed input', async () => {
    const { hub } = workspace();
    const scan = await hub.upload('image.pdf', fixturePdf([null]));
    expect(scan.document.status, scan.document.error ?? undefined).toBe('needs-ocr');
    expect(scan.pages[0]).toMatchObject({ text: '', status: 'needs-ocr', memoryId: null });
    const corrupt = await hub.upload('broken.pdf', Buffer.from('%PDF-1.7\nmissing catalog'));
    expect(corrupt.document.status).toBe('failed');
    expect(corrupt.pages).toHaveLength(0);
    expect((await hub.upload('broken.pdf', Buffer.from('%PDF-1.7\nmissing catalog'))).document).toMatchObject({ id: corrupt.document.id, attempts: 2, failures: [{ error: expect.any(String), at: expect.any(String) }, { error: expect.any(String), at: expect.any(String) }] });
    const encrypted = await hub.upload('encrypted.pdf', fixturePdf(['Text protected by the fixture encryption dictionary.'], true));
    expect(encrypted.document).toMatchObject({ status: 'failed', error: expect.stringContaining('password protected') });
    expect(encrypted.pages).toEqual([]);
    expect(hub.overview().ocr).toBe('unavailable');
    await expect(hub.upload('../broken.pdf', Buffer.from('%PDF-1.7'))).rejects.toMatchObject({ code: 'HUB_INVALID_FILENAME' });
    await expect(hub.upload('oversize.pdf', Buffer.alloc(HUB_LIMITS.pdfBytes + 1))).rejects.toMatchObject({ status: 413 });
  }, 15_000);

  it('reopens an interrupted extraction and keeps the source and failure history on retry', async () => {
    const { hub, root, connect } = workspace();
    const bytes = fixturePdf(['Retry a successful bounded extraction.']);
    const source = (await hub.upload('resume.pdf', bytes)).document;
    hub.close();
    const db = new DatabaseSync(join(root, '.shadow-brain', 'project-hub.sqlite'));
    const record = JSON.parse(db.prepare('SELECT data FROM hub_rows WHERE kind=? AND id=?').get('documents', source.id)!.data as string);
    Object.assign(record, { status: 'extracting', extraction: { id: randomUUID(), until: 1 }, pages: [], pageCount: 0 });
    db.prepare('UPDATE hub_rows SET data=? WHERE kind=? AND id=?').run(JSON.stringify(record), 'documents', source.id);
    db.close();
    const restarted = connect().hub;
    expect(restarted.overview().documents[0]).toMatchObject({ status: 'failed', error: expect.stringContaining('interrupted') });
    const resumed = await restarted.upload('resume.pdf', bytes);
    expect(resumed.document).toMatchObject({ id: source.id, sha256: source.sha256, status: 'ready', attempts: 2 });
    expect(resumed.document.failures).toHaveLength(1);
    expect(resumed.pages).toHaveLength(1);
  }, 15_000);

  it('retries a page approval after memory was stored and its final hub status commit was interrupted', async () => {
    const { hub, root, connect, store } = workspace();
    const document = await hub.upload('retry.pdf', fixturePdf(['Persistent outbox replay.']));
    const approve = { page: 1, decision: 'approve', ...key() };
    const original = await hub.reviewDocument(document.document.id, approve);
    hub.close();
    const db = new DatabaseSync(join(root, '.shadow-brain', 'project-hub.sqlite'));
    const record = db.prepare('SELECT data FROM hub_rows WHERE kind=? AND id=?').get('documents', document.document.id);
    const pending = JSON.parse(record!.data as string);
    pending.pages[0].status = 'pending';
    db.prepare('UPDATE hub_rows SET data=? WHERE kind=? AND id=?').run(JSON.stringify(pending), 'documents', document.document.id);
    db.close();
    const restarted = connect();
    const restored = await restarted.hub.reviewDocument(document.document.id, approve);
    expect(restored.pages).toEqual(original.pages);
    expect(restarted.brain.timeline({ projectId: store.projectId })).toHaveLength(1);
  });

  it('persists collaboration, rejects stale claims, records lease expiry, and retains late artifacts as proposals', () => {
    const { hub, root, connect, advance } = workspace();
    writeFileSync(join(root, 'report.txt'), 'fixture evidence');
    writeFileSync(join(root, 'second.txt'), 'latest fixture evidence');
    writeFileSync(join(root, '.env'), 'DO_NOT_READ');
    writeFileSync(join(root, 'auth.json'), 'synthetic protected fixture');
    const id = hub.createRoom({ goal: 'Verify a project result', ...key() }, HUB_OPERATOR).room.id;
    const proposal = hub.roomAction(id, { kind: 'message', type: 'proposal', text: 'Check one checkout commit.', ...key() }, planner).messages[0];
    const critique = hub.roomAction(id, { kind: 'message', type: 'critique', text: 'Also verify timeout behavior.', replyTo: proposal.id, ...key() }, worker).messages[1];
    const acknowledged = hub.roomAction(id, { kind: 'ack', targetType: 'message', targetId: critique.id, ...key() }, planner).acknowledgements[0];
    expect(acknowledged).toMatchObject({ author: planner, targetId: critique.id });
    const task = hub.roomAction(id, { kind: 'task', title: 'Produce evidence', ...key() }, planner).tasks[0];
    const claim = { kind: 'claim', taskId: task.id, revision: task.revision, ...key() };
    const won = hub.roomAction(id, claim, worker);
    expect(won.tasks[0]).toMatchObject({ owner: worker, revision: 1 });
    expect(hub.roomAction(id, claim, worker).applied).toEqual(won.applied);
    expect(() => hub.roomAction(id, { ...claim, revision: 1 }, worker)).toThrow(/different request/u);
    const second = connect();
    expect(() => second.hub.roomAction(id, { ...claim, ...key() }, planner)).toThrow(/changed/u);
    expect(() => hub.roomAction(id, { kind: 'artifact', taskId: task.id, revision: 1, path: '.env', ...key() }, worker)).toThrow(/ordinary project/u);
    expect(() => hub.roomAction(id, { kind: 'artifact', taskId: task.id, revision: 1, path: 'auth.json', ...key() }, worker)).toThrow(/ordinary project/u);
    expect(hub.room(id).artifacts).toEqual([]);
    advance(HUB_LIMITS.leaseMs + 1);
    const reopened = second.hub.room(id);
    expect(reopened.tasks[0]).toMatchObject({ status: 'open', revision: 2, owner: null });
    const reassigned = second.hub.roomAction(id, { ...claim, revision: 2, ...key() }, planner);
    expect(reassigned.tasks[0]).toMatchObject({ status: 'claimed', revision: 3, owner: planner });
    const late = hub.roomAction(id, { kind: 'artifact', taskId: task.id, revision: 1, path: 'report.txt', ...key() }, worker);
    expect(late.artifacts[0].status).toBe('proposal');
    expect(late.tasks[0]).toMatchObject({ artifactId: null, owner: planner });
    const attached = second.hub.roomAction(id, { kind: 'artifact', taskId: task.id, revision: 3, path: 'second.txt', ...key() }, planner).artifacts[1];
    expect(attached).toMatchObject({ status: 'submitted', version: 2 });
    writeFileSync(join(root, 'second.txt'), 'changed after attachment');
    expect(Buffer.from(hub.artifact(id, attached.id).bytes).toString()).toBe('latest fixture evidence');
    expect(() => hub.roomAction(id, { kind: 'ack', targetType: 'artifact', targetId: attached.id, sha256: '0'.repeat(64), ...key() }, worker)).toThrow(/differs/u);
    expect(hub.roomAction(id, { kind: 'ack', targetType: 'artifact', targetId: attached.id, sha256: attached.sha256, ...key() }, worker).acknowledgements[1].sha256).toBe(attached.sha256);
    expect(hub.roomAction(id, { kind: 'accept', artifactId: attached.id, ...key() }, HUB_OPERATOR).tasks[0].status).toBe('completed');
    const replay = second.hub.room(id, won.cursor);
    expect(replay.events.every(event => event.cursor > won.cursor)).toBe(true);
    expect(replay.events.filter(event => event.kind === 'task-lease-expired')).toHaveLength(1);
    expect(replay.events.at(-1)?.kind).toBe('artifact-accepted');
    expect(() => workspace().hub.room(id)).toThrow(/not found in this project/u);
  });

  it('keeps outcome and comparison provenance, then archives a rolled-back lesson from retrieval', async () => {
    const { hub, brain, store, connect } = workspace();
    const id = hub.createRoom({ goal: 'Run a lesson fixture', ...key() }, HUB_OPERATOR).room.id;
    const taskId = hub.roomAction(id, { kind: 'task', title: 'Evaluate lesson', ...key() }, HUB_OPERATOR).tasks[0].id;
    const outcome = hub.roomAction(id, { kind: 'outcome', taskId, result: 'pass', check: 'fixture assertion', evidence: 'test report reference', ...key() }, worker).outcomes[0];
    expect(outcome.provenance).toBe('agent-report');
    const { lesson } = hub.createLesson({ outcomeId: outcome.id, title: 'Stable retry keys', text: 'Reuse a stable checkout idempotency key across retries.', ...key() }, worker);
    await expect(hub.lessonAction(lesson.id, { kind: 'promote', ...key() }, HUB_OPERATOR)).rejects.toMatchObject({ status: 409 });
    const comparison = { kind: 'evaluate', baseline: false, candidate: true, control: true, evidence: 'Operator checked the test fixture and unrelated case.', ...key() };
    await expect(hub.lessonAction(lesson.id, comparison, worker)).rejects.toMatchObject({ status: 403 });
    expect((await hub.lessonAction(lesson.id, comparison, HUB_OPERATOR)).lesson.evaluation).toMatchObject({ method: 'operator-reported-comparison', provenance: 'user-report' });
    const promote = { kind: 'promote', ...key() };
    const promoted = (await hub.lessonAction(lesson.id, promote, HUB_OPERATOR)).lesson;
    expect(promoted.status).toBe('promoted');
    expect(assembleContext(brain, { projectId: store.projectId, query: 'stable checkout idempotency' }).entries.map(entry => entry.id)).toContain(promoted.memoryId);
    hub.close();
    const restarted = connect();
    expect((await restarted.hub.lessonAction(lesson.id, promote, HUB_OPERATOR)).lesson.memoryId).toBe(promoted.memoryId);
    const rolledBack = (await restarted.hub.lessonAction(lesson.id, { kind: 'rollback', ...key() }, HUB_OPERATOR)).lesson;
    expect(rolledBack.status).toBe('rolled-back');
    const annotations = memoryAnnotationsFor(restarted.brain).get();
    expect(assembleContext(restarted.brain, { projectId: store.projectId, query: 'stable checkout idempotency', annotations }).entries).toHaveLength(0);
  });

  it('does not open a hub path if a database sidecar is a directory', () => {
    const { hub, root } = workspace();
    mkdirSync(join(root, '.shadow-brain', 'project-hub.sqlite-journal'), { recursive: true });
    expect(() => hub.overview()).toThrow(/ordinary, unlinked files/u);
  });
});

it('writes an explicit GlobalBrain ID idempotently and rejects a distinct payload after restart', async () => {
  const { brain, store, connect } = workspace();
  const id = randomUUID();
  const record = { projectId: store.projectId, projectName: store.projectName, category: 'knowledge', agentTool: 'user' as const, content: 'Fixture memory', importance: 2 };
  await brain.init();
  expect(brain.writeSync(record, id)).toBe(id);
  expect(brain.writeSync(record, id)).toBe(id);
  await brain.sync();
  const { brain: other } = connect();
  await other.init();
  expect(other.writeSync(record, id)).toBe(id);
  expect(() => other.writeSync({ ...record, content: 'A different memory' }, id)).toThrow(/different record/u);
  expect(other.timeline({ projectId: store.projectId })).toHaveLength(1);
});
