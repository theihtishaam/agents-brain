import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assembleContext } from '../../src/brain/context-assembly.js';
import { estimateAdaptiveTokens } from '../../src/brain/context-retrieval.js';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import type { MemoryAnnotationSnapshot, MemoryRelationType } from '../../src/brain/memory-annotations.js';
import type { GlobalEntry } from '../../src/types.js';

type EntryInput = Parameters<GlobalBrain['writeSync']>[0];
const options = { projectId: 'alpha', profile: 'adaptive' } as const;
const date = '2026-01-01T00:00:00.000Z';
let dir: string;
let brain: GlobalBrain;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asb-adaptive-'));
  brain = GlobalBrain.getInstance({ dbPath: path.join(dir, 'global.json'), syncIntervalMs: 60_000 });
  await brain.init();
});

afterEach(async () => {
  await brain.shutdown();
  fs.rmSync(dir, { recursive: true, force: true });
});

function add(content: string, entry: Partial<EntryInput> = {}): string {
  return brain.writeSync({ projectId: 'alpha', projectName: 'Alpha', agentTool: 'codex', category: 'lesson',
    content, importance: 0.7, metadata: {}, ...entry });
}

function relation(id: string, fromId: string, toId: string, type: MemoryRelationType): MemoryAnnotationSnapshot['links'][number] {
  return { id, projectId: 'alpha', fromId, toId, type, note: '', createdAt: date };
}

describe('adaptive context retrieval', () => {
  it('keeps an explicitly termless query separate from a blank general briefing', () => {
    const existing = add('Checkout retries use the recorded operation key.');
    const read = vi.spyOn(brain, 'contextEntries');
    for (const query of ['how to do it?', '…?']) {
      const pack = assembleContext(brain, { ...options, query });
      expect(pack).toMatchObject({ entries: [], queryKeywords: [], markdown: '', retrieval: { scanned: 0, candidateCount: 0 } });
      expect(pack.warnings).toEqual([expect.stringContaining('No searchable terms')]);
    }
    expect(read).not.toHaveBeenCalled();
    expect(assembleContext(brain, { ...options, query: '  ' }).entries.map(entry => entry.id)).toEqual([existing]);
  });

  it('matches exact terms and excludes substring and arbitrary metadata hits without committing pending entries', () => {
    const substring = add('JavaScript compiler notes.', { importance: 1 });
    const metadataOnly = add('Compiler notes.', { metadata: { javaFlag: false } });
    const match = add('The build uses Java.', { importance: 0.2 });
    const legacy = assembleContext(brain, { projectId: 'alpha', query: 'java' });
    expect(legacy.entries.map(entry => entry.id)).toContain(substring);
    expect(legacy.entries.map(entry => entry.id)).toContain(metadataOnly);
    expect(legacy.retrieval).toBeUndefined();

    const pack = assembleContext(brain, { ...options, query: 'java' });
    expect(pack.entries.map(entry => entry.id)).toEqual([match]);
    expect(pack.retrieval).toMatchObject({ scanned: 3, candidateCount: 1, truncated: false,
      candidates: [{ id: match, matchedTerms: ['java'], matchedFields: ['content'], decision: 'selected', reason: 'selected' }] });
    expect(pack.retrieval!.candidates[0].signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Lexical relevance', value: expect.any(Number) }),
    ]));
    expect(brain.getStorageHealth().pendingOperations).toBe(3);
    expect(fs.existsSync(brain.dbPath)).toBe(false);
  });

  it('keeps Unicode, filenames, code identifiers and evidence fields searchable', () => {
    const late = add('General boilerplate. '.repeat(65) + 'ParserSealError caused retry exhaustion.');
    const source = add('Review the documented transport fix.', { metadata: { sourceFile: 'docs\\retry-plan.ts' } });
    const absoluteSource = add('Review the rate-limit evidence.', { metadata: { source: 'C:\\repo\\src\\transport\\limiter.ts:42' } });
    const tag = add('Resolve review comments before landing.', { metadata: { tags: ['安全確認'] } });
    const cPlus = add('A C++ template caused the build failure.');
    const snake = add('The deferred_queue_limit setting is intentionally low.');

    const passage = assembleContext(brain, { ...options, query: 'ParserSealError' });
    expect(passage.entries[0]).toMatchObject({ id: late, excerptTruncated: true });
    expect(passage.entries[0].excerpt).toContain('ParserSealError');
    expect(passage.markdown).toContain('retry exhaustion');
    expect(assembleContext(brain, { ...options, query: 'parser_seal_error' }).entries[0]?.id).toBe(late);
    expect(assembleContext(brain, { ...options, query: 'deferredQueueLimit' }).entries[0]?.id).toBe(snake);
    expect(assembleContext(brain, { ...options, query: 'src/transport/limiter.ts' }).entries[0]?.id).toBe(absoluteSource);
    expect(assembleContext(brain, { ...options, query: 'docs/retry-plan.ts' }).retrieval?.candidates[0])
      .toMatchObject({ id: source, matchedFields: ['source'], signals: expect.arrayContaining([
        expect.objectContaining({ label: 'Exact path or filename' }),
      ]) });
    expect(assembleContext(brain, { ...options, query: '安全確認' }).retrieval?.candidates[0])
      .toMatchObject({ id: tag, matchedFields: ['tag'] });
    expect(assembleContext(brain, { ...options, query: 'C++' }).entries[0]?.id).toBe(cPlus);
  });

  it('deduplicates the corpus before the candidate cap and preserves originating references', () => {
    const canonical = add('Checksum duplicate boilerplate.', { importance: 1 });
    const sourceId = add('CHECKSUM DUPLICATE BOILERPLATE. ', { importance: 0.9, metadata: { source: 'docs/checksum.md' } });
    for (let index = 0; index < 202; index++) add('Checksum duplicate boilerplate.', { importance: 0.95 });
    const unique = add('Checksum rotates after signature refresh.', { importance: 0.1 });
    const legacy = assembleContext(brain, { projectId: 'alpha', query: 'checksum' });
    expect(legacy.entries.map(entry => entry.id)).not.toContain(unique);

    const pack = assembleContext(brain, { ...options, query: 'checksum' });
    expect(new Set(pack.entries.map(entry => entry.id))).toEqual(new Set([canonical, unique]));
    expect(pack.entries.find(entry => entry.id === canonical)?.sourceReferences)
      .toEqual([{ source: 'docs/checksum.md', memoryId: sourceId }]);
    expect(pack.retrieval).toMatchObject({ scanned: 205, candidateCount: 2, candidateLimit: 200, truncated: true });
    expect(pack.retrieval?.stages).toContainEqual({ id: 'duplicates', label: 'Duplicate records combined', count: 203 });
    expect(pack.retrieval?.candidates.find(item => item.id === sourceId)?.reason).toBe('duplicate');
  });

  it('expands one hop over eligible recorded links and keeps contradictions as cautions', () => {
    const seed = add('Import retry replay establishes the current path.', { importance: 1 });
    const duplicateSeed = add('IMPORT RETRY REPLAY establishes the current path.', { importance: 0.3 });
    const support = add('A reproduced race starts during cleanup.');
    const related = add('The previous format uses an atomic journal.');
    const inactive = add('Archived replay evidence.');
    const superseded = add('The replaced strategy fails.');
    const replacement = add('A replacement path was independently reviewed.');
    const contradiction = add('The independent trace disputes that ordering.');
    const nextHop = add('An old host used a different transport.');
    const foreign = add('Another project must stay isolated.', { projectId: 'beta' });
    const annotations: MemoryAnnotationSnapshot = {
      schemaVersion: 1, revision: 1, updatedAt: date, history: [],
      reviews: { [inactive]: { projectId: 'alpha', state: 'archived', note: '', updatedAt: date } },
      links: [
        relation('support-edge', support, duplicateSeed, 'supports'),
        relation('related-edge', seed, related, 'related'),
        relation('archived-edge', seed, inactive, 'supports'),
        relation('superseded-edge', seed, superseded, 'supports'),
        relation('replacement-edge', replacement, superseded, 'supersedes'),
        relation('conflict-edge', seed, contradiction, 'contradicts'),
        relation('next-hop-edge', support, nextHop, 'supports'),
        relation('foreign-edge', seed, foreign, 'related'),
      ],
    };
    const pack = assembleContext(brain, { ...options, query: 'import replay', annotations });
    expect(pack.entries.map(entry => entry.id)).toEqual([seed, support, related]);
    expect(pack.retrieval?.candidates.find(candidate => candidate.id === support)?.paths).toEqual([{
      seedId: seed, relationId: 'support-edge', relationType: 'supports', fromId: support, toId: duplicateSeed,
    }]);
    expect(pack.retrieval?.candidates.find(candidate => candidate.id === related)?.paths[0]).toMatchObject({
      seedId: seed, relationId: 'related-edge', relationType: 'related', fromId: seed, toId: related,
    });
    expect(pack.markdown).toContain(contradiction);
    expect(pack.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: inactive, reason: 'archived' }),
      expect.objectContaining({ id: superseded, reason: 'superseded' }),
    ]));
    expect(JSON.stringify(pack)).not.toContain(foreign);
    expect(assembleContext(brain, { ...options, query: 'import replay', annotations, expandRelated: false }).entries.map(entry => entry.id))
      .toEqual([seed]);
  });

  it('applies task and exact phrase signals without admitting zero-match candidates', () => {
    const deployment = add('Checkout timeout caught by deploy.', { category: 'deployment' });
    const fix = add('Checkout timeout caught by replay.', { category: 'fix' });
    add('Retry an unrelated importer.', { category: 'fix', importance: 1 });
    const pack = assembleContext(brain, { ...options, query: 'Debug checkout timeout' });
    expect(pack.retrieval?.taskType).toBe('debug');
    expect(pack.entries.map(entry => entry.id)).toEqual([fix, deployment]);
    expect(pack.retrieval?.candidates[0].signals).toContainEqual({ label: 'Task category', value: 0.12 });
    expect(assembleContext(brain, { ...options, query: 'checkout timeout' }).retrieval?.candidates[0].signals)
      .toContainEqual({ label: 'Exact query phrase', value: 0.22 });
  });

  it('budgets the full escaped render and adjusts excerpt length for Unicode and code punctuation', () => {
    const id = add('Imported output. '.repeat(60) + 'RetrySeal ' + '再試行が失敗しました 🧪 [code]/ '.repeat(45));
    const pack = assembleContext(brain, { ...options, query: 'RetrySeal', tokenBudget: 155 });
    expect(pack.entries[0]).toMatchObject({ id, excerptTruncated: true });
    expect(pack.entries[0].excerpt).toContain('RetrySeal');
    expect(pack.budget).toMatchObject({ estimator: 'unicode-code-heuristic', usedChars: pack.markdown.length,
      usedBytes: Buffer.byteLength(pack.markdown), estimatedTokens: estimateAdaptiveTokens(pack.markdown) });
    expect(pack.budget.estimatedTokens).toBeLessThanOrEqual(155);
    expect(pack.budget.estimatedTokens).toBeGreaterThan(Math.ceil(pack.markdown.length / 4));
    expect(pack.markdown).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u);
    const tiny = assembleContext(brain, { ...options, query: 'RetrySeal', tokenBudget: 15 });
    expect(tiny.markdown).toBe('');
    expect(tiny.retrieval?.candidates[0]).toMatchObject({ id, decision: 'excluded', reason: 'budget' });
  });

  it('bounds diagnostics after ranking and checks scope and enablement before reading candidates', () => {
    for (let i = 0; i < 230; i++) add('Cleanup decision ' + i);
    const foreign = add('Cleanup decision from another project.', { projectId: 'beta' });
    const pack = assembleContext(brain, { ...options, query: 'cleanup', maxEntries: 1 });
    expect(pack.retrieval).toMatchObject({ scanned: 230, candidateCount: 230, truncated: true, candidateLimit: 200 });
    expect(pack.retrieval?.candidates).toHaveLength(200);
    expect(pack.retrieval?.candidates.filter(item => item.decision === 'selected').map(item => item.id)).toEqual(pack.entries.map(entry => entry.id));
    expect(JSON.stringify(pack)).not.toContain(foreign);

    const scopedEntries = vi.fn();
    const source = { recallScored: vi.fn(), contextEntries: scopedEntries };
    const disabled = assembleContext(source, { ...options, features: { contextAssembly: false, crossProjectContext: true } });
    expect(disabled.retrieval).toMatchObject({ profile: 'adaptive', scanned: 0, candidates: [] });
    expect(scopedEntries).not.toHaveBeenCalled();
    expect(() => assembleContext(brain, { ...options, profile: 'unknown' as never })).toThrow(TypeError);
    expect(() => assembleContext(brain, { ...options, expandRelated: 'yes' as never })).toThrow(TypeError);
  });

  it('keeps narrow-scope statistics independent of other projects and exposes detached ranking inputs', () => {
    const id = add('Checkout durability decisions.', { metadata: { tags: ['checkout'], source: 'docs/design.md' } });
    const before = assembleContext(brain, { ...options, query: 'checkout' });
    add('Checkout other project.', { projectId: 'beta' });
    const detached = [...brain.contextEntries({ projectId: 'alpha' })][0];
    detached.content = 'Changed';
    detached.sources.push('other.md');
    detached.tags.length = 0;
    const after = assembleContext(brain, { ...options, query: 'checkout' });
    expect(after).toEqual(before);
    expect(brain.getEntry(id)).toMatchObject({ content: 'Checkout durability decisions.', metadata: { tags: ['checkout'] } } satisfies Partial<GlobalEntry>);
  });

  it('caps one-hop expansions both per seed and overall', () => {
    const links: MemoryAnnotationSnapshot['links'] = [];
    for (let index = 0; index < 10; index++) {
      const seed = add('Replay validation scenario ' + index);
      for (let neighbor = 0; neighbor < 3; neighbor++) {
        const id = add('The independent audit entry ' + index + '-' + neighbor);
        links.push(relation('link-' + index + '-' + neighbor, seed, id, 'related'));
      }
    }
    const annotations: MemoryAnnotationSnapshot = { schemaVersion: 1, revision: 1, updatedAt: date, history: [], reviews: {}, links };
    const pack = assembleContext(brain, { ...options, query: 'replay', annotations, maxEntries: 30, tokenBudget: 4000 });
    const expanded = pack.retrieval?.candidates.filter(candidate => candidate.paths.length);
    expect(expanded).toHaveLength(16);
    const seeds = expanded!.map(candidate => candidate.paths[0].seedId);
    expect([...new Set(seeds)].every(id => seeds.filter(seed => seed === id).length <= 2)).toBe(true);
    expect(pack.entries).toHaveLength(26);
  });

  it('discloses bounded matching on exceptionally long memories', () => {
    add('Ordinary boilerplate. '.repeat(7000) + 'ObscureSuffix');
    const pack = assembleContext(brain, { ...options, query: 'ObscureSuffix' });
    expect(pack.entries).toEqual([]);
    expect(pack.retrieval).toMatchObject({ scanned: 1, candidateCount: 0, truncated: true });
    expect(pack.warnings).toContain('Adaptive matching searched the first 128,000 characters of exceptionally long memories.');
  });
});
