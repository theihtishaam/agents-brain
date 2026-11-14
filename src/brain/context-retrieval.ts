import type { GlobalEntry } from '../types.js';
import { normalizeMemorySources } from './memory-sources.js';
import { analyzeTask, type TaskType } from './task-workflow.js';
import type { ProjectFeedbackInfluence } from './project-feedback.js';

export type ContextRetrievalProfile = 'legacy' | 'adaptive';
export type ContextMatchField = 'content' | 'category' | 'source' | 'tag';

export interface ContextRetrievalPath {
  seedId: string;
  relationId: string;
  relationType: 'supports' | 'related';
  fromId: string;
  toId: string;
}

export interface ContextRetrievalCandidate {
  id: string;
  projectId: string;
  title: string;
  rank: number;
  score: number;
  signals: Array<{ label: string; value: number }>;
  matchedTerms: string[];
  matchedFields: ContextMatchField[];
  decision: 'selected' | 'excluded';
  reason: 'selected' | 'budget' | 'limit' | 'duplicate' | 'candidate-limit';
  sources: string[];
  paths: ContextRetrievalPath[];
  feedback?: ProjectFeedbackInfluence;
}

export interface ContextRetrievalReport {
  profile: 'adaptive';
  taskType: TaskType;
  scanned: number;
  candidateCount: number;
  candidateLimit: number;
  truncated: boolean;
  stages: Array<{ id: string; label: string; count: number }>;
  candidates: ContextRetrievalCandidate[];
}

export interface ContextSearchMemory extends Pick<GlobalEntry, 'id' | 'projectId' | 'projectName' | 'agentTool' | 'category' | 'importance' | 'content'> {
  createdAt: number;
  lastAccessed: number;
  sources: string[];
  tags: string[];
}

interface MemoryDocument {
  memory: ContextSearchMemory;
  content: string;
  sources: Array<{ source: string; memoryId: string }>;
  tags: Set<string>;
  duplicates: ContextSearchMemory[];
  duplicateTotal: number;
}

export interface AdaptiveCandidate extends MemoryDocument {
  score: number;
  signals: ContextRetrievalCandidate['signals'];
  matchedTerms: string[];
  matchedFields: ContextMatchField[];
  anchor: number;
  paths: ContextRetrievalPath[];
  feedback?: ProjectFeedbackInfluence;
}

const MAX_QUERY_CHARS = 4096;
const MAX_QUERY_TERMS = 16;
const MAX_SEARCH_CHARS = 128_000;
const MAX_SOURCES = 4;
const MAX_RECORDED_DUPLICATES = 32;
const DAY_MS = 86_400_000;
const IGNORED_TERMS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'for', 'from', 'how', 'in', 'into',
  'is', 'it', 'of', 'on', 'or', 'the', 'this', 'to', 'was', 'we', 'what', 'where', 'with', 'you',
]);
const SHORT_TERMS = new Set(['go', 'js', 'ts', 'py', 'db', 'ui', 'ux', 'id', 'c++', 'c#']);
const FIELD_WEIGHTS: Record<ContextMatchField, number> = { content: 1, category: 0.65, source: 0.95, tag: 0.75 };
const TASK_CATEGORIES: Record<TaskType, readonly string[]> = {
  direct: [],
  implement: ['decision', 'pattern', 'constraint', 'implementation'],
  debug: ['bug', 'fix', 'warning', 'blocker', 'failure', 'incident', 'lesson'],
  review: ['warning', 'constraint', 'review', 'security', 'decision', 'test'],
  research: ['research', 'finding', 'decision', 'reference'],
  release: ['release', 'verification', 'deployment', 'blocker', 'rollback', 'warning'],
};
const SEGMENTED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const COMPOUND_IDENTIFIER = /^[\p{L}\p{N}]+(?:[_-][\p{L}\p{N}]+)+$/u;
const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonical(value: string): string {
  return value.normalize('NFKC').replace(/\\/g, '/').toLowerCase();
}

export function contextTextLine(value: string): string {
  return value.replace(/[\u0000-\u0020\u007f-\u009f\s]+/g, ' ').trim();
}

export function contextSearchMemory(entry: GlobalEntry): ContextSearchMemory {
  const { id, projectId, projectName, agentTool, category, importance, content } = entry;
  const tags = Array.isArray(entry.metadata?.tags)
    ? entry.metadata.tags.slice(0, 32).filter((value): value is string => typeof value === 'string').map(tag => tag.slice(0, 120))
    : [];
  return {
    id, projectId, projectName, agentTool, category, importance, content, tags,
    createdAt: entry.createdAt.getTime(), lastAccessed: entry.lastAccessed.getTime(),
    sources: normalizeMemorySources(entry.metadata, { limit: MAX_SOURCES, maxChars: 180 }),
  };
}

function* tokens(text: string): IterableIterator<{ term: string; at: number }> {
  const pattern = /[\p{L}\p{N}][\p{L}\p{N}\p{M}_]*(?:(?:[./\\:-])[\p{L}\p{N}\p{M}_]+)*(?:\+\+|#)?/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    if (SEGMENTED_SCRIPT.test(raw)) {
      for (const part of wordSegmenter.segment(raw)) {
        if (part.isWordLike) yield { term: canonical(part.segment), at: match.index + part.index };
      }
    } else {
      yield { term: canonical(raw), at: match.index };
    }
  }
}

export function adaptiveQueryKeywords(query: string): string[] {
  const terms = new Set<string>();
  for (const { term } of tokens(query.slice(0, MAX_QUERY_CHARS))) {
    if (!IGNORED_TERMS.has(term) && (term.length >= 3 || SHORT_TERMS.has(term) || SEGMENTED_SCRIPT.test(term))) terms.add(term);
    if (terms.size === MAX_QUERY_TERMS) break;
  }
  return [...terms];
}

function tokenAliases(term: string): string[] {
  if (!/[./:_-]/u.test(term)) return [];
  const aliases = term.split(/[./:_-]+/u).filter(part => part.length >= 2 && part !== term);
  const withoutLine = term.replace(/:\d+(?::\d+)?$/, '');
  if (withoutLine !== term) aliases.push(withoutLine);
  if (withoutLine.includes('/')) {
    const parts = withoutLine.split('/');
    for (let i = 1; i <= Math.min(4, parts.length - 1); i++) aliases.push(parts.slice(-i).join('/'));
  }
  if (COMPOUND_IDENTIFIER.test(term)) aliases.push(term.replace(/[_-]/g, ''));
  return [...new Set(aliases)];
}

interface TermHit {
  frequency: number;
  first: number;
  fields: Set<ContextMatchField>;
  exactPath: boolean;
}

interface DocumentMatch {
  hits: Map<string, TermHit>;
  length: number;
}

function matchDocument(document: MemoryDocument, terms: ReadonlySet<string>, compactQueries: Map<string, string[]>): DocumentMatch {
  const hits = new Map<string, TermHit>();
  let length = 0;
  const record = (term: string, field: ContextMatchField, at: number, exact: boolean) => {
    if (!terms.has(term)) return;
    const hit = hits.get(term) ?? { frequency: 0, first: -1, fields: new Set(), exactPath: false };
    hit.frequency += FIELD_WEIGHTS[field] * (exact ? 1 : 0.65);
    if (field === 'content' && hit.first < 0) hit.first = at;
    hit.fields.add(field);
    if (exact && /[/.]/.test(term)) hit.exactPath = true;
    hits.set(term, hit);
  };
  const scan = (value: string, field: ContextMatchField) => {
    for (const { term, at } of tokens(value)) {
      if (field === 'content') length++;
      record(term, field, at, true);
      const aliases = tokenAliases(term);
      for (const alias of aliases) record(alias, field, at, false);
      const compact = COMPOUND_IDENTIFIER.test(term) ? term.replace(/[_-]/g, '') : term;
      for (const query of compactQueries.get(compact) ?? []) {
        if (query !== term && !aliases.includes(query)) record(query, field, at, false);
      }
    }
  };
  scan(document.content.slice(0, MAX_SEARCH_CHARS), 'content');
  scan(document.memory.category.slice(0, 128), 'category');
  for (const { source } of document.sources) scan(source, 'source');
  for (const tag of document.tags) scan(tag, 'tag');
  return { hits, length: Math.max(1, length) };
}

function compareMemory(a: ContextSearchMemory, b: ContextSearchMemory): number {
  return b.importance - a.importance || b.createdAt - a.createdAt || compareText(a.id, b.id);
}

function addReferences(document: MemoryDocument, memory: ContextSearchMemory): void {
  for (const source of memory.sources) {
    if (document.sources.length >= MAX_SOURCES) break;
    if (!document.sources.some(ref => ref.source === source)) document.sources.push({ source, memoryId: memory.id });
  }
  for (const tag of memory.tags) {
    if (document.tags.size >= 32) break;
    document.tags.add(tag);
  }
}

function memoryDocument(memory: ContextSearchMemory, content: string): MemoryDocument {
  const document: MemoryDocument = { memory, content, sources: [], tags: new Set(), duplicates: [], duplicateTotal: 0 };
  addReferences(document, memory);
  return document;
}

function groupMemories(memories: Iterable<ContextSearchMemory>) {
  const groups = new Map<string, MemoryDocument>();
  const byId = new Map<string, MemoryDocument>();
  let scanned = 0;
  let duplicateCount = 0;
  let boundedSearch = false;
  for (const memory of memories) {
    scanned++;
    const content = contextTextLine(memory.content);
    if (!content) continue;
    if (content.length > MAX_SEARCH_CHARS) boundedSearch = true;
    const key = JSON.stringify([memory.projectId, content.toLowerCase()]);
    const existing = groups.get(key);
    if (existing) {
      duplicateCount++;
      existing.duplicateTotal++;
      if (compareMemory(memory, existing.memory) < 0) {
        if (existing.duplicates.length < MAX_RECORDED_DUPLICATES) existing.duplicates.push(existing.memory);
        existing.memory = memory;
        existing.content = content;
      } else if (existing.duplicates.length < MAX_RECORDED_DUPLICATES) {
        existing.duplicates.push(memory);
      }
      addReferences(existing, memory);
      byId.set(memory.id, existing);
      continue;
    }
    const document = memoryDocument(memory, content);
    groups.set(key, document);
    byId.set(memory.id, document);
  }
  return { documents: [...groups.values()], byId, scanned, duplicateCount, boundedSearch };
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function explain(
  document: MemoryDocument,
  match: DocumentMatch,
  terms: readonly string[],
  documentFrequency: Map<string, number>,
  total: number,
  averageLength: number,
  taskType: TaskType,
  now: number,
  phrase: RegExp | undefined,
  feedback: ProjectFeedbackInfluence | undefined,
): AdaptiveCandidate {
  const matchedFields = new Set<ContextMatchField>();
  const matchedTerms: string[] = [];
  let anchor = -1;
  let anchorStrength = -1;
  let lexical = 0;
  let exactPaths = 0;
  for (const term of terms) {
    const hit = match.hits.get(term);
    if (!hit) continue;
    matchedTerms.push(term);
    for (const field of hit.fields) matchedFields.add(field);
    const count = documentFrequency.get(term) ?? 0;
    const idf = Math.log1p((total - count + 0.5) / (count + 0.5));
    const lengthNormalization = 1.2 * (0.65 + 0.35 * match.length / averageLength);
    const contribution = idf * (hit.frequency * 2.2) / (hit.frequency + lengthNormalization);
    lexical += contribution;
    if (hit.exactPath) exactPaths++;
    if (hit.first >= 0 && (contribution > anchorStrength || (contribution === anchorStrength && hit.first < anchor))) {
      anchorStrength = contribution;
      anchor = hit.first;
    }
  }
  const category = TASK_CATEGORIES[taskType].includes(canonical(document.memory.category)) ? 0.12 : 0;
  const age = now - document.memory.createdAt;
  const freshness = document.memory.createdAt > 0 && age >= 0 ? 0.10 * Math.pow(0.5, age / (90 * DAY_MS)) : 0;
  const signals = [
    { label: 'Lexical relevance', value: lexical },
    { label: 'Query coverage', value: terms.length ? 0.4 * matchedTerms.length / terms.length : 0 },
    { label: 'Exact query phrase', value: phrase?.test(canonical(document.content.slice(0, MAX_SEARCH_CHARS))) ? 0.22 : 0 },
    { label: 'Exact path or filename', value: 0.18 * Math.min(2, exactPaths) },
    { label: 'Task category', value: category },
    { label: 'Recorded references', value: document.sources.length ? 0.08 : 0 },
    { label: 'Importance', value: 0.15 * document.memory.importance },
    { label: 'Freshness', value: freshness },
  ].filter(signal => signal.value > 0).map(signal => ({ ...signal, value: rounded(signal.value) }));
  if (feedback) signals.push({ label: 'Project task feedback', value: feedback.adjustment });
  return {
    ...document, score: rounded(Math.max(0, signals.reduce((total, signal) => total + signal.value, 0))),
    signals, matchedTerms, matchedFields: [...matchedFields], anchor, paths: [],
    ...(feedback ? { feedback } : {}),
  };
}

export function rankAdaptiveContext(
  memories: Iterable<ContextSearchMemory>, query: string, terms: readonly string[],
  resolveFeedback?: (representativeFor: (id: string) => string | undefined) => ReadonlyMap<string, ProjectFeedbackInfluence>,
) {
  const { documents, byId, scanned, duplicateCount, boundedSearch } = groupMemories(memories);
  const feedback = resolveFeedback?.(id => byId.get(id)?.memory.id);
  const taskType = query.trim() ? analyzeTask(query.slice(0, MAX_QUERY_CHARS)).taskType : 'direct';
  const termSet = new Set(terms);
  const compactQueries = new Map<string, string[]>();
  for (const term of terms) {
    if (!COMPOUND_IDENTIFIER.test(term)) continue;
    const compact = term.replace(/[_-]/g, '');
    compactQueries.set(compact, [...compactQueries.get(compact) ?? [], term]);
  }
  const documentFrequency = new Map<string, number>();
  const matched: Array<{ document: MemoryDocument; match: DocumentMatch }> = [];
  let totalLength = 0;
  for (const document of documents) {
    const match = terms.length ? matchDocument(document, termSet, compactQueries) : { hits: new Map<string, TermHit>(), length: 1 };
    totalLength += match.length;
    for (const term of match.hits.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    if (!terms.length || match.hits.size) matched.push({ document, match });
  }
  const averageLength = totalLength / Math.max(1, documents.length);
  const now = Date.now();
  const normalizedPhrase = canonical(contextTextLine(query.slice(0, MAX_QUERY_CHARS)));
  const phrase = terms.length > 1 && normalizedPhrase.length <= 200
    ? new RegExp('(?:^|[^\\p{L}\\p{N}_])' + normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[^\\p{L}\\p{N}_])', 'u')
    : undefined;
  const ranked = matched.map(({ document, match }) =>
    explain(document, match, terms, documentFrequency, documents.length, averageLength, taskType, now, phrase,
      match.hits.size ? feedback?.get(document.memory.id) : undefined))
    .sort((a, b) => b.score - a.score || compareMemory(a.memory, b.memory));
  return { ranked, byId, scanned, duplicateCount, boundedSearch, taskType, uniqueCount: documents.length };
}

export function linkedCandidate(document: MemoryDocument, seed: AdaptiveCandidate, path: ContextRetrievalPath): AdaptiveCandidate {
  const supports = path.relationType === 'supports';
  const score = rounded(Math.min(supports ? 0.30 : 0.18, seed.score * (supports ? 0.18 : 0.10)));
  return {
    ...document, score, signals: [{ label: 'Recorded ' + path.relationType + ' link', value: score }],
    matchedTerms: [], matchedFields: [], anchor: -1, paths: [path],
  };
}

function safeSlice(text: string, start: number, end: number): string {
  return text.slice(start, end).replace(/^[\udc00-\udfff]|[\ud800-\udbff]$/g, '');
}

export function adaptiveExcerpt(content: string, anchor: number, width: number): string {
  if (content.length <= width) return content;
  const start = Math.max(0, Math.min(content.length - width + 1, anchor - Math.floor(width / 3)));
  const limit = start + width - (start > 0 ? 1 : 0);
  const end = limit < content.length ? limit - 1 : content.length;
  return (start > 0 ? '…' : '') + safeSlice(content, start, end).trim() + (end < content.length ? '…' : '');
}

/** Provider-independent estimate for rendered text. The actual count depends on the receiving model. */
export function estimateAdaptiveTokens(text: string): number {
  let quarters = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code > 0xffff) quarters += 8;
    else if (code > 0x7f) quarters += 4;
    else if (/[\da-z\s]/i.test(char)) quarters += 1;
    else quarters += 2;
  }
  return Math.ceil(quarters / 4);
}
