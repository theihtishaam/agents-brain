import { normalizeRecallKeywords, type GlobalBrain } from './global-brain.js';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from './feature-settings.js';
import type { MemoryAnnotationSnapshot, MemoryRelationType } from './memory-annotations.js';
import { normalizeMemorySources } from './memory-sources.js';
import {
  adaptiveExcerpt, adaptiveQueryKeywords, contextTextLine as textLine, estimateAdaptiveTokens, linkedCandidate, rankAdaptiveContext,
  type AdaptiveCandidate, type ContextRetrievalCandidate, type ContextRetrievalPath, type ContextRetrievalProfile,
  type ContextRetrievalReport, type ContextSearchMemory,
} from './context-retrieval.js';
import type { AgentTool, ScoredGlobalEntry } from '../types.js';
import { projectFeedbackInfluence, type ProjectFeedbackSnapshot } from './project-feedback.js';

export type { ContextRetrievalCandidate, ContextRetrievalProfile, ContextRetrievalReport } from './context-retrieval.js';

export interface ContextAssemblyOptions {
  projectId: string;
  query?: string;
  profile?: ContextRetrievalProfile;
  expandRelated?: boolean;
  maxEntries?: number;
  tokenBudget?: number;
  maxChars?: number;
  includeCrossProject?: boolean;
  features?: Pick<FeatureFlags, 'contextAssembly' | 'crossProjectContext'>;
  minImportance?: number;
  lookbackHours?: number;
  alwaysInclude?: readonly string[];
  annotations?: MemoryAnnotationSnapshot;
  feedback?: ProjectFeedbackSnapshot;
  excludeIds?: ReadonlySet<string>;
  policy?: { revision: number; maxTokens: number; maxEntries: number; hiddenMemories: number };
}

export interface ContextMemoryRelation {
  id: string;
  type: MemoryRelationType;
  memoryId: string;
  otherMemoryId: string;
  title?: string;
  direction: 'incoming' | 'outgoing';
}

export interface ContextPackEntry {
  id: string;
  projectId: string;
  projectName: string;
  agentTool: AgentTool;
  category: string;
  excerpt: string;
  excerptTruncated: boolean;
  score: number;
  createdAt: string | null;
  matchedKeywords: string[];
  sources: string[];
  sourceReferences: Array<{ source: string; memoryId: string }>;
  duplicateIds: string[];
  reasons: string[];
  state: 'active';
  related: ContextMemoryRelation[];
}

type InactiveReason = 'archived' | 'contested' | 'superseded';
type ContextExclusion = {
  id: string;
  projectId?: string;
  title?: string;
  reason: 'duplicate' | 'budget' | 'limit' | 'empty' | 'lookback' | InactiveReason;
};

export interface ContextPack {
  enabled: boolean;
  projectId: string;
  scope: 'project' | 'cross-project';
  queryKeywords: string[];
  entries: ContextPackEntry[];
  excluded: ContextExclusion[];
  budget: {
    tokenBudget: number; maxChars: number; usedChars: number; estimatedTokens: number;
    estimator?: 'unicode-code-heuristic'; usedBytes?: number;
  };
  warnings: string[];
  markdown: string;
  retrieval?: ContextRetrievalReport;
  policy?: NonNullable<ContextAssemblyOptions['policy']> & { effectiveMaxEntries: number };
}

const MAX_CANDIDATES = 200;
const MAX_ENTRIES = 30;
const DEFAULT_ENTRIES = 12;
const DEFAULT_TOKEN_BUDGET = 2000;
const MAX_CHARS = 48_000;
const MAX_EXCERPT_CHARS = 800;
const MAX_QUERY_CHARS = 4096;
const MAX_QUERY_TERMS = 16;
const MAX_SOURCE_REFS = 4;
const MAX_SOURCE_CHARS = 180;
const MAX_CONTEXT_RELATIONS = 8;
const MAX_HIDDEN_REPORT = 200;
const MAX_TITLE_CHARS = 130;
const HOUR_MS = 60 * 60 * 1000;
const MAX_EXPANDED = 16;
const MAX_EXPANSIONS_PER_SEED = 2;
const MIN_ADAPTIVE_EXCERPT_CHARS = 80;
const CONTRADICTION_REASON = 'Review the recorded contradiction before relying on this memory.';

type RecallSource = Pick<GlobalBrain, 'recallScored'> & Partial<Pick<GlobalBrain, 'getEntry' | 'contextEntries'>>;
type ScopedMemoryDetails = (id: string, origin: string) => { projectId: string; title?: string } | undefined;

interface Curation {
  hidden: Map<string, ContextExclusion & { projectId: string }>;
  related: Map<string, ContextMemoryRelation[]>;
  orphanedReplacements: number;
}

function boundedInteger(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(max, Math.trunc(value)))
    : fallback;
}

function clip(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars - 1).replace(/[\ud800-\udbff]$/, '').trimEnd() + '…';
}

function safeMarkdown(value: string): string {
  return value.replace(/[\\\x60*_{}\[\]()<>#!|~]/g, '\\$&');
}

function scopedMemoryDetails(brain: RecallSource, projectId: string, broaden: boolean): ScopedMemoryDetails {
  const cache = new Map<string, ReturnType<ScopedMemoryDetails>>();
  return (id, origin) => {
    if ((!broaden && origin !== projectId) || !brain.getEntry) return undefined;
    const key = JSON.stringify([origin, id]);
    if (!cache.has(key)) {
      const memory = brain.getEntry(id);
      if (memory?.id !== id || memory.projectId !== origin) {
        cache.set(key, undefined);
      } else {
        const title = clip(textLine(memory.content.trimStart().split(/\r\n?|\n/, 1)[0]), MAX_TITLE_CHARS);
        cache.set(key, { projectId: origin, ...(title ? { title } : {}) });
      }
    }
    return cache.get(key);
  };
}

/** Share query cleanup with explained recall and limit the number of searched terms. */
export function contextQueryKeywords(query: string | undefined): string[] {
  if (query === undefined) return [];
  if (typeof query !== 'string') throw new TypeError('Context query must be text.');
  const words = query.slice(0, MAX_QUERY_CHARS).match(/[\p{L}\p{N}_]+/gu) ?? [];
  return normalizeRecallKeywords(words).slice(0, MAX_QUERY_TERMS);
}

function timestamp(date: Date): number {
  const value = date.getTime();
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sourceRefs(memory: ScoredGlobalEntry): string[] {
  return normalizeMemorySources(memory.metadata, { limit: MAX_SOURCE_REFS, maxChars: MAX_SOURCE_CHARS });
}

function describeMemory(
  memory: ScoredGlobalEntry,
  content: string,
  queryKeywords: string[],
  related: ContextMemoryRelation[],
): ContextPackEntry {
  const createdAt = timestamp(memory.createdAt);
  const matchedKeywords = memory.confidence.explanation?.matchedKeywords ?? [];
  const sources = sourceRefs(memory);
  const reasons = [
    queryKeywords.length
      ? 'Matches ' + matchedKeywords.length + ' of ' + queryKeywords.length + ' query terms.'
      : 'Ranked by stored recall signals.',
  ];
  if (sources.length) reasons.push('Includes recorded source references.');
  if (!createdAt) reasons.push('Creation date is unavailable.');
  if (related.some(relation => relation.type === 'contradicts')) reasons.push(CONTRADICTION_REASON);
  return {
    id: memory.id,
    projectId: memory.projectId,
    projectName: memory.projectName,
    agentTool: memory.agentTool,
    category: memory.category,
    excerpt: clip(content, MAX_EXCERPT_CHARS),
    excerptTruncated: content.length > MAX_EXCERPT_CHARS,
    score: memory.confidence.score,
    createdAt: createdAt ? new Date(createdAt).toISOString() : null,
    matchedKeywords: [...matchedKeywords],
    sources,
    sourceReferences: sources.map(source => ({ source, memoryId: memory.id })),
    duplicateIds: [],
    reasons,
    state: 'active',
    related,
  };
}

function readCuration(
  brain: RecallSource,
  annotations: MemoryAnnotationSnapshot | undefined,
  projectId: string,
  broaden: boolean,
  details: ScopedMemoryDetails,
): Curation {
  const hidden: Curation['hidden'] = new Map();
  const related: Curation['related'] = new Map();
  let orphanedReplacements = 0;
  if (!annotations) return { hidden, related, orphanedReplacements };

  const inScope = (origin: string) => broaden || origin === projectId;
  const exists = (origin: string, id: string) => !brain.getEntry || !!details(id, origin);
  const attach = (id: string, relation: ContextMemoryRelation) => {
    const existing = related.get(id);
    if (existing) existing.push(relation);
    else related.set(id, [relation]);
  };

  for (const [id, review] of Object.entries(annotations.reviews)) {
    if (review.state !== 'active' && inScope(review.projectId) && exists(review.projectId, id)) {
      hidden.set(id, { id, projectId: review.projectId, reason: review.state, ...details(id, review.projectId) });
    }
  }
  for (const link of annotations.links) {
    if (!inScope(link.projectId)) continue;
    const fromExists = exists(link.projectId, link.fromId);
    const toExists = exists(link.projectId, link.toId);
    if (link.type === 'supersedes' && toExists) {
      hidden.set(link.toId, {
        id: link.toId, projectId: link.projectId, reason: 'superseded', ...details(link.toId, link.projectId),
      });
      if (!fromExists) orphanedReplacements++;
    }
    if (!fromExists || !toExists) continue;
    const fromTitle = details(link.fromId, link.projectId)?.title;
    const toTitle = details(link.toId, link.projectId)?.title;
    attach(link.fromId, {
      id: link.id, type: link.type, memoryId: link.fromId, otherMemoryId: link.toId, direction: 'outgoing',
      ...(toTitle ? { title: toTitle } : {}),
    });
    attach(link.toId, {
      id: link.id, type: link.type, memoryId: link.toId, otherMemoryId: link.fromId, direction: 'incoming',
      ...(fromTitle ? { title: fromTitle } : {}),
    });
  }
  return { hidden, related, orphanedReplacements };
}

function limitedRelations(relations: ContextMemoryRelation[] = []): ContextMemoryRelation[] {
  // Keep cautionary relations visible ahead of descriptive links when space is limited.
  const priority: Record<MemoryRelationType, number> = { contradicts: 0, supersedes: 1, supports: 2, related: 3 };
  return [...relations].sort((a, b) => priority[a.type] - priority[b.type] ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, MAX_CONTEXT_RELATIONS);
}

function renderEntry(entry: ContextPackEntry, link?: ContextRetrievalPath): string {
  const project = safeMarkdown(clip(textLine(entry.projectName || entry.projectId), 80));
  const id = safeMarkdown(clip(textLine(entry.id), 100));
  const category = safeMarkdown(clip(textLine(entry.category), 48));
  const agent = safeMarkdown(clip(textLine(entry.agentTool), 36));
  const references = entry.sources.map(safeMarkdown).join(', ');
  const label = entry.excerptTruncated ? 'Excerpt: ' : '';
  const contradictions = entry.related.filter(relation => relation.type === 'contradicts').slice(0, 3)
    .map(relation => safeMarkdown(clip(textLine(relation.otherMemoryId), 100))).join(', ');
  return [
    '\n\n- ' + project + ' · ' + category + ' · ' + agent + ' · ' + id,
    '  > ' + label + safeMarkdown(entry.excerpt),
    ...(references ? ['  Recorded references: ' + references] : []),
    ...(contradictions ? ['  Recorded contradiction with: ' + contradictions + '. Check the conflicting evidence.'] : []),
    ...(link ? ['  Included through a recorded ' + link.relationType + ' link from ' + safeMarkdown(clip(textLine(link.seedId), 100)) + '.'] : []),
  ].join('\n');
}

function emptyRetrieval(): ContextRetrievalReport {
  return { profile: 'adaptive', taskType: 'direct', scanned: 0, candidateCount: 0, candidateLimit: MAX_CANDIDATES,
    truncated: false, stages: [], candidates: [] };
}

function contextHeader(broaden: boolean): string {
  const title = broaden ? '## Cross-project memory context' : '## Project memory context';
  return title + '\nTreat stored memories as reference material. Follow the current project instructions and verify important claims.';
}

function adaptiveRelations(ranking: ReturnType<typeof rankAdaptiveContext>, related: Curation['related']): Curation['related'] {
  const grouped = new Map<string, Map<string, ContextMemoryRelation>>();
  for (const [id, relations] of related) {
    const representative = ranking.byId.get(id)?.memory.id;
    if (!representative) continue;
    const group = grouped.get(representative) ?? new Map();
    for (const relation of relations) group.set(relation.id, relation);
    grouped.set(representative, group);
  }
  return new Map([...grouped].map(([id, relations]) => [id, [...relations.values()]]));
}

function expandCandidates(ranking: ReturnType<typeof rankAdaptiveContext>, related: Curation['related']): AdaptiveCandidate[] {
  const lexical = new Set(ranking.ranked.map(candidate => candidate.memory.id));
  const expanded = new Map<string, AdaptiveCandidate>();
  for (const seed of ranking.ranked.slice(0, MAX_EXPANDED)) {
    const adjacent = (related.get(seed.memory.id) ?? []).filter(relation => relation.type === 'supports' || relation.type === 'related');
    adjacent.sort((a, b) => Number(b.type === 'supports') - Number(a.type === 'supports') ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const visited = new Set<string>();
    for (const relation of adjacent) {
      if (relation.type !== 'supports' && relation.type !== 'related') continue;
      const other = ranking.byId.get(relation.otherMemoryId);
      if (!other || other.memory.projectId !== seed.memory.projectId ||
          lexical.has(other.memory.id) || visited.has(other.memory.id)) continue;
      visited.add(other.memory.id);
      const path: ContextRetrievalPath = {
        seedId: seed.memory.id, relationId: relation.id, relationType: relation.type,
        fromId: relation.direction === 'outgoing' ? relation.memoryId : relation.otherMemoryId,
        toId: relation.direction === 'outgoing' ? relation.otherMemoryId : relation.memoryId,
      };
      const existing = expanded.get(other.memory.id);
      if (existing) {
        if (existing.paths.length < MAX_EXPANSIONS_PER_SEED && !existing.paths.some(item => item.relationId === path.relationId)) {
          existing.paths.push(path);
        }
      } else if (expanded.size < MAX_EXPANDED) {
        expanded.set(other.memory.id, linkedCandidate(other, seed, path));
      }
      if (visited.size >= MAX_EXPANSIONS_PER_SEED) break;
    }
  }
  return [...expanded.values()].sort((a, b) => b.score - a.score ||
    (a.memory.id < b.memory.id ? -1 : a.memory.id > b.memory.id ? 1 : 0));
}

function describeAdaptive(candidate: AdaptiveCandidate, related: Curation['related'], queryKeywords: string[]): ContextPackEntry {
  const { memory, matchedTerms, paths } = candidate;
  const excerpt = adaptiveExcerpt(candidate.content, candidate.anchor, MAX_EXCERPT_CHARS);
  const relations = limitedRelations(related.get(memory.id));
  const reasons = paths.length ? ['Included through a recorded ' + paths[0].relationType + ' relationship.'] :
    queryKeywords.length ? ['Matches ' + matchedTerms.length + ' of ' + queryKeywords.length + ' query terms in ' +
      candidate.matchedFields.join(', ') + '.'] : ['Ranked by task category, importance, freshness, and recorded references.'];
  if (candidate.sources.length) reasons.push('Includes recorded source references.');
  if (candidate.feedback) reasons.push('Reported outcomes for similar project tasks adjusted the ranking.');
  if (candidate.anchor > MAX_EXCERPT_CHARS / 3) reasons.push('Shows the passage around a matched term.');
  if (!(memory.createdAt > 0)) reasons.push('Creation date is unavailable.');
  if (relations.some(relation => relation.type === 'contradicts')) reasons.push(CONTRADICTION_REASON);
  return {
    id: memory.id, projectId: memory.projectId, projectName: memory.projectName, agentTool: memory.agentTool, category: memory.category,
    excerpt, excerptTruncated: candidate.content.length > MAX_EXCERPT_CHARS, score: candidate.score,
    createdAt: memory.createdAt > 0 ? new Date(memory.createdAt).toISOString() : null,
    matchedKeywords: matchedTerms, sources: candidate.sources.map(ref => ref.source), sourceReferences: candidate.sources,
    duplicateIds: candidate.duplicates.map(duplicate => duplicate.id), reasons, state: 'active', related: relations,
  };
}

function fitAdaptive(
  entry: ContextPackEntry, candidate: AdaptiveCandidate, markdown: string, budget: ContextPack['budget'],
): { entry: ContextPackEntry; rendered: string } | undefined {
  const render = (item: ContextPackEntry) => renderEntry(item, candidate.paths[0]);
  const fits = (value: string) => markdown.length + value.length <= budget.maxChars &&
    estimateAdaptiveTokens(markdown + value) <= budget.tokenBudget;
  const full = render(entry);
  if (fits(full)) return { entry, rendered: full };

  let lower = MIN_ADAPTIVE_EXCERPT_CHARS;
  let upper = Math.min(candidate.content.length, MAX_EXCERPT_CHARS) - 1;
  let best: { entry: ContextPackEntry; rendered: string } | undefined;
  while (lower <= upper) {
    const width = Math.floor((lower + upper) / 2);
    const shorter = { ...entry, excerpt: adaptiveExcerpt(candidate.content, candidate.anchor, width), excerptTruncated: true };
    const rendered = render(shorter);
    if (fits(rendered)) {
      best = { entry: shorter, rendered };
      lower = width + 1;
    } else {
      upper = width - 1;
    }
  }
  return best;
}

function* scopedAdaptiveEntries(
  memories: Iterable<ContextSearchMemory>, options: ContextAssemblyOptions, pack: ContextPack, curation: Curation, cutoff: number,
): IterableIterator<ContextSearchMemory> {
  for (const memory of memories) {
    if (pack.scope === 'project' && memory.projectId !== pack.projectId) continue;
    if (options.excludeIds?.has(memory.id)) continue;
    if (curation.hidden.get(memory.id)?.projectId === memory.projectId) continue;
    if (cutoff && !options.alwaysInclude?.includes(memory.category) &&
        Math.max(memory.createdAt, memory.lastAccessed) < cutoff) continue;
    yield memory;
  }
}

function assembleAdaptive(
  brain: RecallSource, options: ContextAssemblyOptions, pack: ContextPack,
  curation: Curation, maxEntries: number, cutoff: number,
): ContextPack {
  if (!brain.contextEntries) throw new TypeError('Adaptive retrieval requires a scoped context source.');
  const broaden = pack.scope === 'cross-project';
  const report = pack.retrieval!;
  const memories = brain.contextEntries({
    ...(broaden ? {} : { projectId: pack.projectId }),
    minImportance: options.minImportance,
    excludeIds: new Set([...curation.hidden.keys(), ...options.excludeIds ?? []]),
  });
  const ranking = rankAdaptiveContext(scopedAdaptiveEntries(memories, options, pack, curation, cutoff), options.query ?? '', pack.queryKeywords,
    broaden || !options.feedback ? undefined : representativeFor => projectFeedbackInfluence(options.feedback, pack.projectId, pack.queryKeywords, representativeFor));
  const related = adaptiveRelations(ranking, curation.related);
  const expanded = options.expandRelated !== false && pack.queryKeywords.length
    ? expandCandidates(ranking, related) : [];
  // A bounded linked tail does not displace directly matched records.
  const selectedForReview = [...ranking.ranked.slice(0, MAX_CANDIDATES), ...expanded].slice(0, MAX_CANDIDATES);
  const describe = (memory: ContextSearchMemory, rank: number, candidate?: AdaptiveCandidate): ContextRetrievalCandidate => ({
    id: memory.id, projectId: memory.projectId, title: clip(textLine(memory.content.trimStart().split(/\r\n?|\n/, 1)[0]), MAX_TITLE_CHARS),
    rank, score: candidate?.score ?? 0, signals: candidate?.signals ?? [], matchedTerms: candidate?.matchedTerms ?? [],
    matchedFields: candidate?.matchedFields ?? [], decision: 'excluded', reason: candidate ? 'limit' : 'duplicate',
    sources: candidate ? candidate.sources.map(ref => ref.source) : memory.sources, paths: candidate?.paths ?? [],
    ...(candidate?.feedback ? { feedback: candidate.feedback } : {}),
  });
  let markdown = contextHeader(broaden);
  const duplicates: ContextRetrievalCandidate[] = [];
  for (const [index, candidate] of selectedForReview.entries()) {
    const diagnostic = describe(candidate.memory, index + 1, candidate);
    const entry = describeAdaptive(candidate, related, pack.queryKeywords);
    for (const duplicate of candidate.duplicates) {
      if (duplicates.length >= MAX_CANDIDATES - selectedForReview.length) break;
      const item = describe(duplicate, diagnostic.rank);
      duplicates.push(item);
      pack.excluded.push({ id: item.id, projectId: item.projectId, ...(item.title ? { title: item.title } : {}), reason: 'duplicate' });
    }
    if (pack.entries.length < maxEntries) {
      const fit = fitAdaptive(entry, candidate, markdown, pack.budget);
      if (fit) {
        pack.entries.push(fit.entry);
        markdown += fit.rendered;
        diagnostic.decision = 'selected';
        diagnostic.reason = 'selected';
      } else {
        diagnostic.reason = 'budget';
      }
    }
    if (diagnostic.decision === 'excluded') {
      pack.excluded.push({ id: entry.id, projectId: entry.projectId, ...(diagnostic.title ? { title: diagnostic.title } : {}),
        reason: diagnostic.reason === 'budget' ? 'budget' : 'limit' });
    }
    report.candidates.push(diagnostic);
  }
  report.candidates.push(...duplicates);
  report.taskType = ranking.taskType;
  report.scanned = ranking.scanned;
  report.candidateCount = ranking.ranked.length + expanded.length;
  const matchedDuplicates = [...ranking.ranked, ...expanded].reduce((total, candidate) => total + candidate.duplicateTotal, 0);
  const limitedDiagnostics = report.candidateCount + matchedDuplicates > report.candidates.length;
  const limitedMatching = pack.queryKeywords.length > 0 && ranking.boundedSearch;
  report.truncated = limitedDiagnostics || limitedMatching;
  report.stages = [
    { id: 'scanned', label: 'Eligible memories scanned', count: ranking.scanned },
    { id: 'unique', label: 'Distinct memories', count: ranking.uniqueCount },
    { id: 'duplicates', label: 'Duplicate records combined', count: ranking.duplicateCount },
    { id: 'matched', label: 'Direct candidates', count: ranking.ranked.length },
    { id: 'linked', label: 'Linked candidates', count: expanded.length },
    { id: 'selected', label: 'Included in context', count: pack.entries.length },
  ];
  if (!selectedForReview.length) pack.warnings.push('No eligible memories matched this context request.');
  else if (!pack.entries.length && report.candidates.some(candidate => candidate.reason === 'budget')) {
    pack.warnings.push('The selected context budget is too small for the matching memories.');
  }
  if (report.candidateCount > MAX_CANDIDATES) pack.warnings.push('Context considered up to ' + MAX_CANDIDATES + ' distinct candidates.');
  else if (limitedDiagnostics) pack.warnings.push('Candidate diagnostics show a bounded sample of duplicate records.');
  if (limitedMatching) pack.warnings.push('Adaptive matching searched the first 128,000 characters of exceptionally long memories.');
  if (pack.entries.some(entry => entry.related.some(relation => relation.type === 'contradicts'))) {
    pack.warnings.push('Selected memories have recorded contradictions. Check the conflicting evidence.');
  }
  pack.markdown = pack.entries.length ? markdown : '';
  pack.budget.usedChars = pack.markdown.length;
  pack.budget.usedBytes = Buffer.byteLength(pack.markdown, 'utf8');
  pack.budget.estimatedTokens = estimateAdaptiveTokens(pack.markdown);
  return pack;
}

/** Assemble bounded reference context from explained recall without reading files or writing memories. */
export function assembleContext(brain: RecallSource, options: ContextAssemblyOptions): ContextPack {
  if (typeof options.projectId !== 'string' || !options.projectId.trim()) {
    throw new TypeError('A nonempty project ID is required for context assembly.');
  }
  if (options.includeCrossProject !== undefined && typeof options.includeCrossProject !== 'boolean') {
    throw new TypeError('Cross-project context opt-in must be a boolean.');
  }
  if (options.profile !== undefined && options.profile !== 'legacy' && options.profile !== 'adaptive') {
    throw new TypeError('Unknown context retrieval profile.');
  }
  if (options.expandRelated !== undefined && typeof options.expandRelated !== 'boolean') {
    throw new TypeError('Related-memory expansion must be a boolean.');
  }
  const projectId = options.projectId.trim();
  const adaptive = options.profile === 'adaptive';
  if (options.query !== undefined && typeof options.query !== 'string') throw new TypeError('Context query must be text.');
  const queryKeywords = adaptive ? adaptiveQueryKeywords(options.query ?? '') : contextQueryKeywords(options.query);
  const features = options.features ?? DEFAULT_FEATURE_FLAGS;
  const broaden = features.crossProjectContext === true && options.includeCrossProject === true;
  const maxEntries = boundedInteger(options.maxEntries, DEFAULT_ENTRIES, MAX_ENTRIES);
  const tokenBudget = boundedInteger(options.tokenBudget, DEFAULT_TOKEN_BUDGET, MAX_CHARS / 4);
  const maxChars = Math.min(boundedInteger(options.maxChars, tokenBudget * 4, MAX_CHARS), tokenBudget * 4);
  const pack: ContextPack = {
    enabled: features.contextAssembly === true,
    projectId,
    scope: broaden ? 'cross-project' : 'project',
    queryKeywords,
    entries: [],
    excluded: [],
    budget: { tokenBudget, maxChars, usedChars: 0, estimatedTokens: 0,
      ...(adaptive ? { estimator: 'unicode-code-heuristic' as const, usedBytes: 0 } : {}) },
    warnings: [],
    markdown: '',
    ...(options.policy ? { policy: { ...options.policy, effectiveMaxEntries: maxEntries } } : {}),
    ...(adaptive ? { retrieval: emptyRetrieval() } : {}),
  };
  if (!pack.enabled) {
    pack.warnings.push('Context assembly is disabled.');
    return pack;
  }
  if (options.includeCrossProject && !broaden) pack.warnings.push('Cross-project context is disabled in feature settings.');
  if (adaptive && options.query?.trim() && !queryKeywords.length) {
    pack.warnings.push('No searchable terms in this query. Use a project term or leave the query blank for general context.');
    return pack;
  }

  const memoryDetails = scopedMemoryDetails(brain, projectId, broaden);
  const details: ScopedMemoryDetails = (id, origin) => options.excludeIds?.has(id) ? undefined : memoryDetails(id, origin);
  const curation = readCuration(brain, options.annotations, projectId, broaden, details);
  const { hidden, related, orphanedReplacements } = curation;
  if (options.policy?.hiddenMemories) pack.warnings.push(options.policy.hiddenMemories + ' memories linked to unshared chats were omitted.');
  const exclude = (id: string, origin: string, reason: ContextExclusion['reason']) => {
    pack.excluded.push({ id, reason, ...details(id, origin) });
  };
  if (hidden.size) {
    pack.excluded.push(...[...hidden.values()].slice(0, MAX_HIDDEN_REPORT));
    pack.warnings.push('Context hid ' + hidden.size + ' archived, contested, or superseded memories in scope before ranking.');
    if (hidden.size > MAX_HIDDEN_REPORT) pack.warnings.push('The excluded list shows the first ' + MAX_HIDDEN_REPORT + ' hidden memories.');
  }
  if (orphanedReplacements) {
    pack.warnings.push(orphanedReplacements + ' superseded memories remain hidden after their replacements became unavailable.');
  }
  // A task query can match an older lesson. The lookback is for the general recent briefing.
  const cutoff = !queryKeywords.length && typeof options.lookbackHours === 'number' && Number.isFinite(options.lookbackHours)
    ? Date.now() - Math.max(0, options.lookbackHours) * HOUR_MS
    : 0;
  if (adaptive) return assembleAdaptive(brain, options, pack, curation, maxEntries, cutoff);

  const ranked = brain.recallScored({
    ...(broaden ? {} : { projectId }),
    keywords: queryKeywords,
    limit: MAX_CANDIDATES + 1,
    minImportance: options.minImportance,
    excludeIds: new Set([...hidden.keys(), ...options.excludeIds ?? []]),
  });
  const scoped = ranked.filter(memory => (broaden || memory.projectId === projectId) &&
    hidden.get(memory.id)?.projectId !== memory.projectId && !options.excludeIds?.has(memory.id));
  if (scoped.length > MAX_CANDIDATES) {
    pack.warnings.push('Context considered the highest-ranked ' + MAX_CANDIDATES + ' matching memories.');
  }
  const groups = new Map<string, ContextPackEntry>();
  for (const memory of scoped.slice(0, MAX_CANDIDATES)) {
    if (cutoff && !options.alwaysInclude?.includes(memory.category) &&
        Math.max(timestamp(memory.createdAt), timestamp(memory.lastAccessed)) < cutoff) {
      exclude(memory.id, memory.projectId, 'lookback');
      continue;
    }
    const content = textLine(memory.content);
    if (!content) {
      exclude(memory.id, memory.projectId, 'empty');
      continue;
    }
    const key = JSON.stringify([memory.projectId, content.toLowerCase()]);
    const duplicate = groups.get(key);
    if (duplicate) {
      duplicate.duplicateIds.push(memory.id);
      const hadSources = duplicate.sources.length > 0;
      for (const source of sourceRefs(memory)) {
        if (duplicate.sources.length >= MAX_SOURCE_REFS) break;
        if (duplicate.sources.includes(source)) continue;
        duplicate.sources.push(source);
        duplicate.sourceReferences.push({ source, memoryId: memory.id });
      }
      if (!hadSources && duplicate.sources.length) duplicate.reasons.push('Includes recorded source references from matching memories.');
      const incident = related.get(memory.id);
      if (incident?.length) {
        const recorded = new Map([...duplicate.related, ...incident].map(relation => [relation.id, relation]));
        duplicate.related = limitedRelations([...recorded.values()]);
        if (duplicate.related.some(relation => relation.type === 'contradicts') && !duplicate.reasons.includes(CONTRADICTION_REASON)) {
          duplicate.reasons.push(CONTRADICTION_REASON);
        }
      }
      exclude(memory.id, memory.projectId, 'duplicate');
      continue;
    }
    groups.set(key, describeMemory(memory, content, queryKeywords, limitedRelations(related.get(memory.id))));
  }

  let markdown = contextHeader(broaden);
  for (const entry of groups.values()) {
    if (pack.entries.length >= maxEntries) {
      exclude(entry.id, entry.projectId, 'limit');
      continue;
    }
    const rendered = renderEntry(entry);
    if (markdown.length + rendered.length > maxChars) {
      exclude(entry.id, entry.projectId, 'budget');
      continue;
    }
    markdown += rendered;
    pack.entries.push(entry);
  }

  if (!groups.size) {
    pack.warnings.push(broaden ? 'No memories matched the context request.' : 'No memories matched this project and context request.');
  } else if (!pack.entries.length && pack.excluded.some(item => item.reason === 'budget')) {
    pack.warnings.push('The selected context budget is too small for the matching memories.');
  }
  if (pack.entries.some(entry => entry.related.some(relation => relation.type === 'contradicts'))) {
    pack.warnings.push('Selected memories have recorded contradictions. Check the conflicting evidence.');
  }
  pack.markdown = pack.entries.length ? markdown : '';
  pack.budget.usedChars = pack.markdown.length;
  pack.budget.estimatedTokens = Math.ceil(pack.budget.usedChars / 4);
  return pack;
}
