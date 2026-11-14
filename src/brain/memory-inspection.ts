import { createHash } from 'node:crypto';
import type { GlobalBrain } from './global-brain.js';
import { memoryState, type MemoryAnnotationSnapshot, type EffectiveMemoryState } from './memory-annotations.js';
import { normalizeMemorySources } from './memory-sources.js';

const HEALTH_LIMIT = 5000;
const DAY = 86_400_000;
type InspectionSource = Pick<GlobalBrain, 'timeline' | 'getEntry'>;
type IssueKind = 'contested' | 'contradiction' | 'orphaned-link' | 'duplicate' | 'no-source' | 'older-memory';
export interface MemoryAttentionItem {
  id: string; projectId: string; title: string; category: string; state: EffectiveMemoryState;
  sources: string[]; createdAt: string | null;
  issues: Array<{ kind: IssueKind; label: string; severity: 'review' | 'info' }>;
  priority: number;
}
export interface MemoryHealthReport {
  checkedAt: string; projectId: string | null;
  coverage: { scanned: number; limit: number; truncated: boolean };
  counts: { total: number; active: number; archived: number; contested: number; superseded: number;
    sourceBacked: number; withoutSources: number; reviewed: number; olderThan90Days: number;
    duplicateEntries: number; contradictionLinks: number; orphanedLinks: number };
  queue: MemoryAttentionItem[]; queueTotal: number; warnings: string[];
}
export function requireMemoryIdentifier(value: unknown, name = 'projectId'): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 256 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(name + ' must be nonempty text of at most 256 characters.');
  }
}
function instant(value: Date): string | null {
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}
function title(content: string): string {
  return content.split(/\r?\n/, 1)[0].replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 130);
}

/** Inspection never follows source paths, fetches URLs, writes reviews, or records a recall. */
export function inspectMemory(brain: InspectionSource, annotations: MemoryAnnotationSnapshot, projectId: string, memoryId: string) {
  requireMemoryIdentifier(projectId);
  requireMemoryIdentifier(memoryId, 'memoryId');
  const entry = brain.getEntry(memoryId);
  if (!entry || entry.projectId !== projectId) return null;
  const limit = 32_000;
  const content = entry.content.slice(0, limit).replace(/[\ud800-\udbff]$/, '');
  const links = annotations.links.filter(link => link.projectId === projectId && [link.fromId, link.toId].includes(memoryId)).slice(0, 100);
  return {
    id: entry.id, projectId, projectName: entry.projectName, category: entry.category, agentTool: entry.agentTool,
    content, contentTruncated: content.length < entry.content.length, createdAt: instant(entry.createdAt),
    state: memoryState(annotations, projectId, memoryId), sources: normalizeMemorySources(entry.metadata),
    review: annotations.reviews[memoryId]?.projectId === projectId ? annotations.reviews[memoryId] : null,
    links, linksTruncated: annotations.links.filter(link => link.projectId === projectId && [link.fromId, link.toId].includes(memoryId)).length > links.length,
    revision: annotations.revision, sourceVerification: 'references-only',
  };
}

/** Deterministic attention hints over a bounded, project-first snapshot. No truth or accuracy score. */
export function inspectMemoryHealth(brain: InspectionSource, annotations: MemoryAnnotationSnapshot,
  options: { projectId?: string; limit?: number; now?: Date; excludeIds?: ReadonlySet<string> } = {}): MemoryHealthReport {
  if (options.projectId !== undefined) requireMemoryIdentifier(options.projectId);
  const queueLimit = options.limit ?? 30;
  if (!Number.isSafeInteger(queueLimit) || queueLimit < 1 || queueLimit > 100) throw new TypeError('limit must be an integer from 1 to 100.');
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new TypeError('Invalid observation time.');
  const fetched = brain.timeline({ projectId: options.projectId, limit: HEALTH_LIMIT + 1, excludeIds: options.excludeIds });
  const entries = fetched.slice(0, HEALTH_LIMIT);
  const shown = new Map(entries.map(entry => [entry.id, entry.projectId]));
  const superseded = new Set<string>();
  const incident = new Map<string, { contradiction: boolean; orphan: boolean }>();
  const endpointProjects = new Map<string, string | undefined>(shown);
  const endpoint = (id: string) => {
    if (!endpointProjects.has(id)) endpointProjects.set(id, brain.getEntry(id)?.projectId);
    return endpointProjects.get(id);
  };
  let contradictionLinks = 0, orphanedLinks = 0;
  for (const link of annotations.links) {
    if (options.projectId && link.projectId !== options.projectId) continue;
    if (shown.get(link.fromId) !== link.projectId && shown.get(link.toId) !== link.projectId) continue;
    const orphan = endpoint(link.fromId) !== link.projectId || endpoint(link.toId) !== link.projectId;
    if (link.type === 'supersedes') superseded.add(JSON.stringify([link.projectId, link.toId]));
    if (link.type === 'contradicts') contradictionLinks++;
    if (orphan) orphanedLinks++;
    for (const id of [link.fromId, link.toId]) {
      if (shown.get(id) !== link.projectId) continue;
      const flags = incident.get(id) ?? { contradiction: false, orphan: false };
      flags.contradiction ||= link.type === 'contradicts'; flags.orphan ||= orphan;
      incident.set(id, flags);
    }
  }
  const counts: MemoryHealthReport['counts'] = { total: entries.length, active: 0, archived: 0, contested: 0, superseded: 0,
    sourceBacked: 0, withoutSources: 0, reviewed: 0, olderThan90Days: 0, duplicateEntries: 0, contradictionLinks, orphanedLinks };
  const duplicateKeys = new Set<string>();
  const queue: MemoryAttentionItem[] = [];
  for (const entry of entries) {
    const review = annotations.reviews[entry.id]?.projectId === entry.projectId ? annotations.reviews[entry.id] : undefined;
    const state = superseded.has(JSON.stringify([entry.projectId, entry.id])) ? 'superseded' : review?.state ?? 'active';
    counts[state]++;
    if (review) counts.reviewed++;
    const refs = normalizeMemorySources(entry.metadata);
    if (refs.length) counts.sourceBacked++; else counts.withoutSources++;
    const createdAt = instant(entry.createdAt);
    const old = !!createdAt && now.getTime() - entry.createdAt.getTime() >= 90 * DAY;
    if (old) counts.olderThan90Days++;
    const normalized = entry.content.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
    const key = JSON.stringify([entry.projectId, createHash('sha256').update(normalized).digest('hex')]);
    const duplicate = !!normalized && duplicateKeys.has(key);
    if (duplicate) counts.duplicateEntries++;
    if (normalized) duplicateKeys.add(key);
    const issues: MemoryAttentionItem['issues'] = [];
    const add = (kind: IssueKind, label: string, severity: 'review' | 'info') => issues.push({ kind, label, severity });
    if (state === 'contested') add('contested', 'Marked contested; review the evidence.', 'review');
    if (incident.get(entry.id)?.contradiction) add('contradiction', 'Has a recorded contradiction.', 'review');
    if (incident.get(entry.id)?.orphan) add('orphaned-link', 'A recorded relationship endpoint is unavailable in this project.', 'review');
    if (state === 'active' && duplicate) add('duplicate', 'Same normalized text as another memory in this project.', 'info');
    if (state === 'active' && !refs.length) add('no-source', 'No recorded source reference.', 'info');
    if (state === 'active' && old) add('older-memory', 'Recorded at least 90 days ago; check whether it still applies.', 'info');
    if (!issues.length) continue;
    queue.push({ id: entry.id, projectId: entry.projectId, title: title(entry.content), category: entry.category, state,
      sources: refs, createdAt, issues, priority: issues.reduce((value, issue) => value + (issue.severity === 'review' ? 10 : 1), 0) });
  }
  queue.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id, 'en'));
  return { checkedAt: now.toISOString(), projectId: options.projectId ?? null,
    coverage: { scanned: entries.length, limit: HEALTH_LIMIT, truncated: fetched.length > HEALTH_LIMIT }, counts,
    queue: queue.slice(0, queueLimit), queueTotal: queue.length,
    warnings: ['Source references are recorded metadata, not verified evidence. Age is a review hint, not an expiry rule.',
      ...(fetched.length > HEALTH_LIMIT ? ['Counts and attention hints cover only the newest 5000 memories in this scope.'] : [])] };
}
