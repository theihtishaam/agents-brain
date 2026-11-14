import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ModelUsageStore } from '../../src/brain/model-usage.js';

const projectId = 'fixture-project';
const now = Date.parse('2026-11-12T12:00:00.000Z');
const base = { projectId, operationId: 'operation-1', sessionId: 'session-a', agent: 'agent-one' };
let root: string;
let store: ModelUsageStore;
let filename: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-model-usage-'));
  filename = path.join(root, '.shadow-brain', 'model-usage.sqlite');
  store = new ModelUsageStore(root, projectId, () => now);
});

afterEach(() => {
  const canonical = fs.realpathSync.native(root);
  if (path.dirname(canonical) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(canonical).startsWith('sb-model-usage-')) {
    throw new Error('Unexpected fixture path.');
  }
  fs.rmSync(canonical, { recursive: true, force: true });
});

it('keeps empty reads and rejected reports side-effect free', () => {
  expect(store.read()).toMatchObject({ provenance: 'host-reported', receipts: [], oldestAt: null, newestAt: null, dropped: 0,
    totals: { inputTokens: { total: null, known: 0, receipts: 0 } } });
  for (const fields of [
    { operationId: '' }, { agent: 'a user query' }, { provider: 'https://example.test' }, { outcome: 'unknown' },
    { prompt: 'synthetic-explicitly-forbidden' }, { provenance: 'provider-measured' }, { response: 'text' },
    { reasoningEffort: '' }, { reasoningEffort: 'high with notes' }, { reasoningEffort: 'https://example.test' },
    { reasoningEffort: 'a'.repeat(33) }, { reasoningEffort: 1 }, { reasoningEffort: { level: 'high' } },
    { inputTokens: -1 }, { inputTokens: 1.25 }, { inputTokens: 1_000_000_001 }, { inputTokens: '42' },
    { inputTokens: 4, cacheReadInputTokens: 3, cacheWriteInputTokens: 2 }, { outputTokens: 4, reasoningOutputTokens: 5 },
  ]) expect(() => store.report({ ...base, ...fields })).toThrow(TypeError);
  expect(() => store.report({ ...base, projectId: 'other-project' })).toThrow(expect.objectContaining({ code: 'USAGE_PROJECT_MISMATCH' }));
  expect(fs.readdirSync(root)).toEqual([]);
});

it('distinguishes explicit zero, unknown and partial counters and keeps identical retries idempotent', () => {
  const first = store.report({ ...base, provider: 'host-provider', requestModel: 'requested', responseModel: 'returned', inputTokens: 0 });
  expect(store.report({ inputTokens: 0, requestModel: 'requested', responseModel: 'returned', provider: 'host-provider', ...base })).toEqual(first);
  expect(() => store.report({ ...base, inputTokens: 1 })).toThrow(expect.objectContaining({ code: 'USAGE_CONFLICT' }));
  const second = store.report({ ...base, sessionId: 'session-b', provider: 'host-provider', requestModel: 'requested', responseModel: 'returned',
    outputTokens: 10, reasoningOutputTokens: 4, cacheReadInputTokens: 12 });
  const third = store.report({ ...base, agent: 'agent-two' });
  const snapshot = new ModelUsageStore(root, projectId).read();
  expect(snapshot.receipts).toEqual([first, second, third]);
  expect(snapshot.totals).toEqual({ inputTokens: { total: 0, known: 1, receipts: 3 }, outputTokens: { total: 10, known: 1, receipts: 3 },
    cacheReadInputTokens: { total: 12, known: 1, receipts: 3 }, cacheWriteInputTokens: { total: null, known: 0, receipts: 3 },
    reasoningOutputTokens: { total: 4, known: 1, receipts: 3 } });
  expect(snapshot.models).toMatchObject([
    { agent: 'agent-one', provider: 'host-provider', requestModel: 'requested', responseModel: 'returned', count: 2 },
    { agent: 'agent-two', provider: null, requestModel: null, responseModel: null, count: 1 },
  ]);
});


it('round-trips optional host-reported reasoning effort and preserves legacy retry identities', () => {
  const legacy = store.report(base);
  expect(store.report({ agent: base.agent, sessionId: base.sessionId, operationId: base.operationId, projectId: base.projectId })).toEqual(legacy);
  expect(legacy).not.toHaveProperty('reasoningEffort');
  const expectedLegacyFingerprint = createHash('sha256').update(JSON.stringify({ operationId: 'operation-1', projectId, sessionId: 'session-a', agent: 'agent-one' })).digest('hex');
  const db = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
  try { expect(db.prepare('SELECT fingerprint FROM receipts').get()?.fingerprint).toBe(expectedLegacyFingerprint); } finally { db.close(); }
  const input = { ...base, operationId: 'effort-fixture', provider: 'fixture-provider', requestModel: 'fixture-model', reasoningEffort: 'xhigh', inputTokens: 7 };
  const receipt = store.report(input);
  expect(receipt).toMatchObject({ reasoningEffort: 'xhigh', provenance: 'host-reported' });
  expect(store.report({ reasoningEffort: 'xhigh', inputTokens: 7, requestModel: 'fixture-model', provider: 'fixture-provider', ...base, operationId: 'effort-fixture' })).toEqual(receipt);
  expect(() => store.report({ ...input, reasoningEffort: 'high' })).toThrow(expect.objectContaining({ code: 'USAGE_CONFLICT' }));
  expect(() => store.report({ ...input, reasoningEffort: undefined })).toThrow(expect.objectContaining({ code: 'USAGE_CONFLICT' }));
  expect(new ModelUsageStore(root, projectId).read().receipts).toEqual([legacy, receipt]);
});

it('bounds retention and only counts retries whose identities remain in the retained window', () => {
  const first = store.report(base);
  for (let index = 2; index <= 1001; index++) store.report({ ...base, operationId: `operation-${index}`, inputTokens: 2 });
  const snapshot = store.read();
  expect(snapshot.dropped).toBe(1);
  expect(snapshot.receipts).toHaveLength(snapshot.retentionLimit);
  expect(snapshot.receipts[0].operationId).toBe('operation-2');
  expect(snapshot.receipts.at(-1)?.operationId).toBe('operation-1001');
  expect(snapshot.totals.inputTokens).toEqual({ total: 2000, known: 1000, receipts: 1000 });
  expect(store.report({ ...base, operationId: 'operation-1001', inputTokens: 2 })).toEqual(snapshot.receipts.at(-1));
  expect(store.read().dropped).toBe(1);
  expect(store.report(base).id).not.toBe(first.id);
  expect(store.read().dropped).toBe(2);
// This is a retention test with 1,001 durable SQLite transactions, not a latency benchmark.
// Windows hosted runners can spend over 30 seconds flushing the complete fixture.
}, 90_000);

it('preserves corrupt or foreign databases and rejects unsafe storage links', () => {
  fs.mkdirSync(path.dirname(filename));
  const corrupt = Buffer.from('synthetic invalid SQLite bytes');
  fs.writeFileSync(filename, corrupt);
  expect(() => store.read()).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(() => store.report(base)).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(fs.readFileSync(filename)).toEqual(corrupt);
  fs.unlinkSync(filename);

  store.report(base);
  const foreign = new ModelUsageStore(root, 'foreign-project');
  const original = fs.readFileSync(filename);
  expect(() => foreign.read()).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(() => foreign.report({ ...base, projectId: 'foreign-project' })).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(fs.readFileSync(filename)).toEqual(original);

  const hardLink = path.join(root, 'usage-alias.sqlite');
  fs.linkSync(filename, hardLink);
  expect(() => store.read()).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  fs.unlinkSync(hardLink);
  fs.mkdirSync(filename + '-wal');
  expect(() => store.report(base)).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(fs.readFileSync(filename)).toEqual(original);
});

it('rejects tampered retained receipts on read or retry, preserving the failed record', () => {
  const receipt = store.report({ ...base, inputTokens: 5 });
  const db = new DatabaseSync(filename, { allowExtension: false });
  try { db.prepare('UPDATE receipts SET data=?').run(JSON.stringify({ ...receipt, inputTokens: 11 })); }
  finally { db.close(); }
  const corrupt = fs.readFileSync(filename);
  expect(() => store.read()).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(() => store.report({ ...base, inputTokens: 5 })).toThrow(expect.objectContaining({ code: 'USAGE_STORAGE_UNAVAILABLE' }));
  expect(fs.readFileSync(filename)).toEqual(corrupt);
});
