import * as fs from 'node:fs';
import * as path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { HubStore } from '../../src/brain/project-hub-store.js';
import { readProjectGrowth, retainedMemoryHistory } from '../../src/brain/project-growth.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectPolicyStore, PROJECT_CONTEXT_LIMITS } from '../../src/brain/project-policy.js';

let root: string;
beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(tmpdir(), 'asb-growth-fixture-')));
});
afterEach(() => {
  const canonical = fs.realpathSync.native(root);
  if (path.dirname(canonical) !== fs.realpathSync.native(tmpdir()) || !path.basename(canonical).startsWith('asb-growth-fixture-')) {
    throw new Error('Refusing to remove an unexpected growth fixture path.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});

it('uses 14 UTC calendar buckets and accounts for older, undated and future retained records', () => {
  const now = Date.parse('2026-11-20T03:00:00.000Z');
  const times = [
    '2026-11-06T23:59:59.900Z',
    '2026-11-07T00:00:00.000Z',
    '2026-11-19T23:59:59.900Z',
    '2026-11-19T19:40:00.000-08:00',
    '2026-11-20T03:00:00.000Z',
    '2026-11-20T03:00:00.001Z',
    'invalid',
  ].map(Date.parse);
  const result = retainedMemoryHistory([...times, 0], now);
  expect(result.days).toHaveLength(14);
  expect(result.days[0]).toEqual({ date: '2026-11-07', retained: 1 });
  expect(result.days.at(-2)).toEqual({ date: '2026-11-19', retained: 1 });
  expect(result.days.at(-1)).toEqual({ date: '2026-11-20', retained: 1 });
  expect(result).toMatchObject({ retained: 8, beforeWindow: 1, undated: 2, futureDated: 2 });
});

it('reads all durable project memories without a Hub or inventory-sampling cap', async () => {
  const { projectId, storagePath } = projectStorage(root);
  const brain = GlobalBrain.createIsolated({ dbPath: storagePath });
  try {
    const blank = readProjectGrowth(root, projectId, brain);
    expect(blank).toMatchObject({ memory: { retained: 0 }, learning: { proposed: 0, evaluated: 0, promoted: 0, rolledBack: 0 },
      context: PROJECT_CONTEXT_LIMITS });
    expect(fs.readdirSync(root)).toEqual([]);
    await brain.init();
    const entries = Array.from({ length: 2501 }, (_, index) => ({
      id: 'fixture-' + index, projectId, projectName: 'Fixture', agentTool: 'codex', category: 'knowledge',
      content: 'Local retained fixture', createdAt: '2024-11-08T00:00:00.000Z',
    }));
    fs.writeFileSync(storagePath, JSON.stringify({ schemaVersion: 1, projects: [], agents: [],
      entries: [...entries, { ...entries[0], id: 'foreign', projectId: 'other-project' }] }));
    brain.refresh();
    brain.writeSync({ projectId, projectName: 'Fixture', agentTool: 'codex', category: 'knowledge',
      importance: 0.9, content: 'Staged local memory', metadata: {} });
    const staged = readProjectGrowth(root, projectId, brain);
    expect(staged.memory).toMatchObject({ retained: 2501, beforeWindow: 2501 });
    await brain.sync();
    const saved = readProjectGrowth(root, projectId, brain);
    expect(saved.memory).toMatchObject({ retained: 2502, beforeWindow: 2501 });
    expect(saved.memory.days.reduce((sum, day) => sum + day.retained, 0)).toBe(1);
  } finally {
    await brain.shutdown();
  }
});

it('separates current lesson states from per-pack limits and leaves unreadable sections unknown', async () => {
  const { projectId, storagePath } = projectStorage(root);
  const brain = GlobalBrain.createIsolated({ dbPath: storagePath });
  const store = new HubStore(root, projectId);
  try {
    store.transaction(() => {
      for (const [id, status] of ['candidate', 'candidate', 'evaluated', 'promoted', 'rolled-back'].entries()) {
        store.put('lessons', { id: 'fixture-' + id, status, text: 'Synthetic lesson scope marker' });
      }
    });
    const policy = new ProjectPolicyStore(root, projectId);
    await policy.update({ kind: 'set-context-limits', context: { maxTokens: 600, maxEntries: 4 }, expectedRevision: 0 });
    const snapshot = readProjectGrowth(root, projectId, brain);
    expect(snapshot).toMatchObject({ projectId, memory: { retained: 0 },
      learning: { proposed: 2, evaluated: 1, promoted: 1, rolledBack: 1 }, context: { maxTokens: 600, maxEntries: 4 } });
    expect(JSON.stringify(snapshot)).not.toContain('Synthetic lesson scope marker');
    store.transaction(() => store.put('lessons', { id: 'invalid', status: 'unknown' }));
    fs.writeFileSync(path.join(root, '.shadow-brain', 'project-policy.json'), 'invalid synthetic policy');
    expect(readProjectGrowth(root, projectId, brain)).toMatchObject({ memory: { retained: 0 }, learning: null, context: null });
  } finally {
    store.close();
  }
});
