import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assembleContext } from '../../src/brain/context-assembly.js';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { ProjectFeedbackStore, projectFeedbackInfluence, type ProjectFeedbackCommand, type ProjectFeedbackRecord } from '../../src/brain/project-feedback.js';
import type { MemoryAnnotationSnapshot } from '../../src/brain/memory-annotations.js';

let root: string;
let brain: GlobalBrain;
let store: ProjectFeedbackStore;
const now = '2026-11-12T00:00:00.000Z';

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'asb-project-feedback-'));
  brain = GlobalBrain.createIsolated({ dbPath: path.join(root, 'synthetic-global.json'), syncIntervalMs: 60_000 });
  await brain.init();
  store = new ProjectFeedbackStore(root, brain);
});

afterEach(async () => {
  await brain.shutdown();
  fs.rmSync(root, { recursive: true, force: true });
});

function add(content: string, projectId = store.projectId): string {
  return brain.writeSync({ projectId, projectName: 'Synthetic project', agentTool: 'codex', category: 'lesson', content, importance: 0.5, metadata: {} });
}

function report(memoryId: string, partial: Partial<Extract<ProjectFeedbackCommand, { kind: 'upsert' }>> = {}): ProjectFeedbackCommand {
  return { kind: 'upsert', memoryId, task: 'Debug checkout retry', rating: 'useful',
    reason: 'Observed one commit in the replay fixture.', evidence: ['tests/checkout.md'], ...partial };
}

function fixtureRecord(memoryId: string, id: string, changes: Partial<ProjectFeedbackRecord> = {}): ProjectFeedbackRecord {
  return { id, projectId: store.projectId, memoryId, task: 'Debug checkout retry', rating: 'useful', reason: 'Observed result.',
    evidence: [], reporter: 'user', createdAt: now, updatedAt: now, ...changes };
}

describe('project-local reported feedback', () => {
  it('keeps reads side-effect-free and upserts one outcome for each normalized task and reporter', async () => {
    const id = add('Checkout retry policy uses a shared budget.');
    expect(store.get()).toMatchObject({ revision: 0, updatedAt: null, enabled: true, records: [] });
    expect(fs.existsSync(path.join(root, '.shadow-brain'))).toBe(false);
    const first = await store.update(report(id), 0, 'user');
    const second = await store.update(report(id, { task: ' DEBUG  checkout RETRY ', rating: 'incorrect', reason: 'Observed a mismatched counter.' }), 1, 'user');
    const agent = await store.update(report(id), 2, 'agent');
    expect(second.records).toHaveLength(1);
    expect(second.records[0]).toMatchObject({ id: first.records[0].id, createdAt: first.records[0].createdAt,
      rating: 'incorrect', reporter: 'user' });
    expect(agent.records.map(record => record.reporter)).toEqual(['user', 'agent']);
    expect(agent.revision).toBe(3);
    expect(new ProjectFeedbackStore(root, brain).get()).toEqual(agent);
    expect(path.basename(store.filePath)).toBe('memory-feedback.json');
  });

  it('validates scope, revision, assigned reporter, and required observations before mutating', async () => {
    const foreign = add('Foreign checkout notes.', 'foreign');
    const id = add('Local checkout notes.');
    await expect(store.update(report(foreign), 0, 'user')).rejects.toMatchObject({ code: 'PROJECT_FEEDBACK_NOT_FOUND' });
    await expect(store.update(report(id, { reason: '   ' }), 0, 'agent')).rejects.toThrow(/Reason/);
    await expect(store.update({ kind: 'toggle', enabled: false }, 0, 'agent')).rejects.toThrow(/Agent feedback/);
    expect(fs.existsSync(store.filePath)).toBe(false);
    const saved = await store.update(report(id), 0, 'user');
    const bytes = fs.readFileSync(store.filePath);
    await expect(store.update(report(id), 0, 'user')).rejects.toMatchObject({ code: 'PROJECT_FEEDBACK_CONFLICT' });
    expect(fs.readFileSync(store.filePath)).toEqual(bytes);
    const disabled = await store.update({ kind: 'toggle', enabled: false }, 1, 'user');
    expect(disabled).toMatchObject({ revision: 2, enabled: false, records: saved.records });
    const removed = await store.update({ kind: 'remove', id: saved.records[0].id }, 2, 'user');
    expect(removed).toMatchObject({ revision: 3, enabled: false, records: [] });
  });

  it('preserves malformed sidecar bytes and blocks a linked destination', async () => {
    const id = add('Local checkout notes.');
    fs.mkdirSync(path.dirname(store.filePath));
    fs.writeFileSync(store.filePath, '{"schemaVersion":50}');
    expect(() => store.get()).toThrow(/schema-1/);
    await expect(store.update(report(id), 0, 'user')).rejects.toMatchObject({ code: 'PROJECT_FEEDBACK_INVALID_STORE' });
    expect(fs.readFileSync(store.filePath, 'utf8')).toBe('{"schemaVersion":50}');
    fs.unlinkSync(store.filePath);
    const other = path.join(root, 'other-feedback.json');
    fs.writeFileSync(other, 'unowned fixture');
    fs.linkSync(other, store.filePath);
    expect(() => new ProjectFeedbackStore(root, brain)).toThrow(/unsafe link/);
    expect(fs.readFileSync(other, 'utf8')).toBe('unowned fixture');
  });

  it('preserves the bounded set when new feedback reaches capacity and still allows an existing task update', async () => {
    const id = add('Local checkout notes.');
    const records = Array.from({ length: 500 }, (_, index) => fixtureRecord(id, 'record-' + index, { task: 'Checkout task ' + index }));
    fs.mkdirSync(path.dirname(store.filePath));
    fs.writeFileSync(store.filePath, JSON.stringify({ schemaVersion: 1, revision: 1, updatedAt: now, enabled: true, records }));
    const before = fs.readFileSync(store.filePath);
    await expect(store.update(report(id), 1, 'user')).rejects.toMatchObject({ code: 'PROJECT_FEEDBACK_CONFLICT' });
    expect(fs.readFileSync(store.filePath)).toEqual(before);
    const updated = await store.update(report(id, { task: 'Checkout task 0' }), 1, 'user');
    expect(updated.records).toHaveLength(500);
    expect(updated.records.at(-1)?.id).toBe('record-0');
  });

  it('adjusts eligible lexical order with a signed, attributable and reversible signal', async () => {
    add('Checkout retry uses the shared ledger.');
    add('Checkout retry uses the stable queue.');
    const options = { projectId: store.projectId, query: 'Fix checkout retry', profile: 'adaptive' } as const;
    const baseline = assembleContext(brain, options);
    const id = baseline.entries[1].id;
    const snapshot = await store.update(report(id), 0, 'agent');
    const changed = assembleContext(brain, { ...options, feedback: snapshot });
    expect(changed.entries[0].id).toBe(id);
    expect(changed.retrieval?.candidates[0]).toMatchObject({ id, feedback: { adjustment: 0.04,
      recordIds: [snapshot.records[0].id], reporterKinds: ['agent'] } });
    expect(changed.retrieval?.candidates[0].signals).toContainEqual({ label: 'Project task feedback', value: 0.04 });
    const disabled = await store.update({ kind: 'toggle', enabled: false }, 1, 'user');
    expect(assembleContext(brain, { ...options, feedback: disabled }).entries.map(entry => entry.id)).toEqual(baseline.entries.map(entry => entry.id));
    const negative = await store.update(report(id, { rating: 'incorrect' }), 2, 'user');
    const enabled = await store.update({ kind: 'toggle', enabled: true }, negative.revision, 'user');
    expect(assembleContext(brain, { ...options, feedback: enabled }).retrieval?.candidates.find(candidate => candidate.id === id)?.feedback)
      .toMatchObject({ adjustment: -0.12, reporterKinds: ['user'] });
    const laterAgent = await store.update(report(id), enabled.revision, 'agent');
    expect(assembleContext(brain, { ...options, feedback: laterAgent }).retrieval?.candidates.find(candidate => candidate.id === id)?.feedback)
      .toMatchObject({ adjustment: -0.12, reporterKinds: ['user'] });
  });

  it('never uses outcomes to introduce a match, revive a curated record, or score a graph-only neighbor', () => {
    const active = add('Checkout retry uses the shared ledger.');
    const archived = add('Checkout retry uses the old cache.');
    const linked = add('Audit confirmed durable storage.');
    const unrelated = add('A linter catches repeated imports.');
    const foreign = add('Checkout retry uses a different worker.', 'foreign');
    const feedback = { schemaVersion: 1 as const, revision: 1, updatedAt: now, enabled: true,
      records: [
        fixtureRecord(active, 'foreign-report', { projectId: 'foreign' }),
        fixtureRecord(archived, 'archived-report'), fixtureRecord(linked, 'linked-report'),
        fixtureRecord(unrelated, 'unrelated-report'), fixtureRecord(foreign, 'foreign-memory-report'),
      ] };
    const annotations: MemoryAnnotationSnapshot = {
      schemaVersion: 1, revision: 1, updatedAt: now, history: [],
      reviews: { [archived]: { projectId: store.projectId, state: 'archived', note: '', updatedAt: now } },
      links: [{ id: 'support-link', projectId: store.projectId, fromId: linked, toId: active, type: 'supports', note: '', createdAt: now }],
    };
    const pack = assembleContext(brain, { projectId: store.projectId, query: 'checkout retry', profile: 'adaptive', feedback, annotations });
    expect(pack.entries.map(entry => entry.id)).toEqual([active, linked]);
    expect(pack.retrieval?.candidates.every(candidate => !candidate.feedback)).toBe(true);
    expect(pack.excluded).toContainEqual(expect.objectContaining({ id: archived, reason: 'archived' }));
    expect(JSON.stringify(pack)).not.toContain('foreign-report');
  });

  it('preserves attributable feedback when an eligible exact duplicate becomes the representative', () => {
    const original = add('Checkout retry uses the recorded key.');
    const duplicate = brain.writeSync({ projectId: store.projectId, projectName: 'Synthetic project', agentTool: 'codex',
      category: 'lesson', content: 'CHECKOUT retry uses  the recorded key.', importance: 1, metadata: {} });
    const olderUser = fixtureRecord(original, 'original-review', { rating: 'incorrect' });
    const laterAgent = fixtureRecord(duplicate, 'duplicate-report', { reporter: 'agent' });
    const foreignCopy = add('Checkout retry uses the recorded key.', 'foreign');
    const foreignReport = fixtureRecord(foreignCopy, 'foreign-report');
    const options = { projectId: store.projectId, query: 'Debug checkout retry', profile: 'adaptive' } as const;
    const feedback = { schemaVersion: 1 as const, revision: 1, updatedAt: now, enabled: true, records: [olderUser, laterAgent, foreignReport] };
    const ranked = assembleContext(brain, { ...options, feedback });
    expect(ranked.entries[0]).toMatchObject({ id: duplicate, duplicateIds: [original] });
    expect(ranked.retrieval?.candidates[0]).toMatchObject({ id: duplicate,
      feedback: { adjustment: -0.12, recordIds: ['original-review'], reporterKinds: ['user'] } });
    const newerUser = fixtureRecord(duplicate, 'latest-review');
    const updated = assembleContext(brain, { ...options, feedback: { ...feedback, records: [...feedback.records, newerUser] } });
    expect(updated.retrieval?.candidates[0]?.feedback).toEqual({ adjustment: 0.08, recordIds: ['latest-review'], reporterKinds: ['user'] });
    const curated = assembleContext(brain, { ...options, feedback, annotations: {
      schemaVersion: 1, revision: 1, updatedAt: now, links: [], history: [],
      reviews: { [original]: { projectId: store.projectId, state: 'archived', note: '', updatedAt: now } },
    } });
    expect(curated.retrieval?.candidates[0]?.feedback).toEqual({ adjustment: 0.04, recordIds: ['duplicate-report'], reporterKinds: ['agent'] });
  });

  it('uses at most three newest distinct tasks, excludes generic-only terms, and clamps weighted outcomes', () => {
    const id = add('Checkout retry uses the shared ledger.');
    const feedback = { schemaVersion: 1 as const, revision: 1, updatedAt: now, enabled: true,
      records: [
        fixtureRecord(id, 'old-irrelevant', { task: 'Fix billing cache' }),
        fixtureRecord(id, 'old-fourth', { task: 'Checkout retry settlement', rating: 'incorrect' }),
        fixtureRecord(id, 'older-task', { task: 'Checkout retry ledger', rating: 'incorrect' }),
        fixtureRecord(id, 'older-same-task', { reporter: 'agent' }),
        fixtureRecord(id, 'newer-same-task'),
        fixtureRecord(id, 'newest-task', { task: 'Checkout retry importer', reporter: 'agent' }),
      ] };
    const influence = projectFeedbackInfluence(feedback, store.projectId, ['fix', 'checkout', 'retry']).get(id);
    expect(influence).toEqual({ adjustment: 0.009, recordIds: ['newest-task', 'newer-same-task', 'older-task'],
      reporterKinds: ['agent', 'user'] });
    expect(projectFeedbackInfluence(feedback, store.projectId, ['fix', 'trace']).size).toBe(0);
    expect(projectFeedbackInfluence(feedback, store.projectId, ['checkout', 'purchases', 'cancel', 'search', 'metrics', 'test']).size).toBe(0);
  });
});
