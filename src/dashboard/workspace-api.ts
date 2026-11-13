import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { getGlobalBrain, type GlobalBrain } from '../brain/global-brain.js';
import { getBrainBus } from '../brain/brain-bus.js';
import { assembleContext } from '../brain/context-assembly.js';
import { parseContextRequest } from '../brain/context-request.js';
import { inspectMemoryHealth } from '../brain/memory-inspection.js';
import { FEATURE_DEFINITIONS, getFeatureSettings, type FeatureSettingsStore } from '../brain/feature-settings.js';
import { memoryAnnotationsFor, memoryState, type MemoryAnnotationsStore, type MemoryAnnotationSnapshot } from '../brain/memory-annotations.js';
import { normalizeMemorySources } from '../brain/memory-sources.js';
import { inspectClientIntegrations } from '../brain/client-integrations.js';
import { activityJournalFor, type ActivityJournal } from '../brain/activity-journal.js';
import { reportAgentActivity } from '../brain/activity-reporting.js';
import { inspectProject, planProjectSkill, applyProjectSkill, type ProjectSkillParams } from '../brain/project-kit.js';
import { requireProjectStore, addProjectKnowledge } from '../brain/project-memory.js';
import { ProjectFeedbackStore } from '../brain/project-feedback.js';
import type { AgentTool, BrainTimelineEvent, ScoredGlobalEntry } from '../types.js';
import { WorkspaceRuntime } from './workspace-status.js';
import { isProjectHubRoute, handleProjectHubRequest } from './project-hub-api.js';
import type { ProjectHubService } from '../brain/project-hub.js';

const INVENTORY_LIMIT = 2500;
type Memory = BrainTimelineEvent | ScoredGlobalEntry;

export interface WorkspaceDependencies {
  brain?: GlobalBrain;
  settings?: FeatureSettingsStore;
  annotations?: MemoryAnnotationsStore;
  projectDir?: string;
  journal?: ActivityJournal;
  demo?: boolean;
  localProject?: boolean;
  runtime?: WorkspaceRuntime;
  hub?: ProjectHubService;
  prepareStorage?: () => Promise<string | null>;
}

const sharedRuntime = new WorkspaceRuntime('shared');

function sources(entry: Memory): string[] {
  return normalizeMemorySources(entry.metadata, { limit: 8, maxChars: 500 });
}

function date(value: unknown): string | null {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' || typeof value === 'number' ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function summary(entry: Memory, annotations?: MemoryAnnotationSnapshot) {
  const confidence = 'confidence' in entry ? entry.confidence : undefined;
  const matched = confidence?.explanation?.matchedKeywords ?? [];
  const refs = sources(entry);
  return {
    id: entry.id, title: entry.content.split(/\r?\n/, 1)[0].slice(0, 130), snippet: entry.content.slice(0, 1600),
    category: entry.category, agent: entry.agentTool, project: entry.projectId, projectName: entry.projectName,
    source: refs[0] ?? '', sources: refs, updatedAt: date(entry.createdAt), score: confidence?.score,
    reasons: confidence ? [matched.length ? 'Matches: ' + matched.join(', ') : 'Ranked by importance, age, and recorded use.'] : [],
    effectiveState: annotations ? memoryState(annotations, entry.projectId, entry.id) : 'active',
  };
}

function bounded(value: string | null, fallback: number, max: number, min = 1): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new TypeError('Invalid pagination or graph limit.');
  return Number(value);
}

function query(qs: URLSearchParams, name: string): string | undefined {
  const value = qs.get(name)?.trim();
  if (value && value.length > 1000) throw new TypeError('Filter is too long.');
  return value || undefined;
}

function activity(enabled: boolean, limit = 30) {
  return {
    enabled,
    activity: enabled ? getBrainBus().recent(500).sort((a, b) => b.ts - a.ts).slice(0, limit).map(event => ({
      id: event.id, type: event.type, label: event.detail, agent: event.source,
      project: String(event.meta?.projectName ?? event.meta?.projectId ?? ''), timestamp: date(event.ts),
    })) : [],
  };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new TypeError('Send application/json.');
  if (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host && req.headers.origin !== 'https://' + req.headers.host) {
    throw new TypeError('Cross-origin changes are not accepted.');
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > 64 * 1024) throw new TypeError('Request body exceeds 64 KiB.');
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new TypeError('Send valid JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Send a JSON object.');
  return value as Record<string, unknown>;
}

function settingsResponse(store: FeatureSettingsStore) {
  return { ...store.get(), definitions: FEATURE_DEFINITIONS };
}

/** The workspace API reads only the memory store and dedicated feature settings. */
export async function handleWorkspaceRequest(req: IncomingMessage, res: ServerResponse, dependencies: WorkspaceDependencies = {}): Promise<void> {
  const send = (data: unknown, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname.slice('/api/workspace/'.length);
    const method = req.method ?? 'GET';
    const expectedProject = req.headers['x-shadow-brain-project'];
    if (method === 'POST' && expectedProject !== undefined && expectedProject !== dependencies.runtime?.project?.id) {
      return send({ error: 'This port now serves a different project. Reload the portal before making changes.', code: 'WORKSPACE_PROJECT_CHANGED' }, 409);
    }
    const storageError = await dependencies.prepareStorage?.();
    if (route === 'status' && method === 'GET') return send((dependencies.runtime ?? sharedRuntime).status(dependencies.brain, !!dependencies.hub && !storageError, storageError));
    if (storageError) return send({ error: storageError, code: 'WORKSPACE_STORAGE_UNAVAILABLE' }, 503);
    if (isProjectHubRoute(url.pathname)) {
      const settings = dependencies.settings ?? getFeatureSettings();
      const journal = dependencies.journal;
      const correlationId = randomUUID();
      const projectId = dependencies.runtime?.project?.id;
      const tool = 'hub-' + (url.pathname.split('/')[4] || 'overview');
      const record = async (kind: 'tool-start' | 'tool-end') => {
        if (method !== 'POST' || !journal || !settings.get().features.activityRecording) return;
        await journal.append({ kind, source: 'reported', transport: 'host', projectId, agent: 'portal', tool, correlationId,
          ...(kind === 'tool-end' ? { outcome: res.statusCode < 400 ? 'success' as const : 'error' as const } : {}) }).catch(() => {});
      };
      await record('tool-start');
      try { await handleProjectHubRequest(req, res, dependencies.hub, url); }
      finally { await record('tool-end'); }
      return;
    }
    const local = dependencies.localProject && dependencies.projectDir && dependencies.brain
      ? requireProjectStore(dependencies.projectDir, dependencies.brain) : undefined;
    const projectRoutes = ['project-profile', 'project-knowledge', 'project-skill-preview', 'project-skill-apply', 'project-feedback'];
    const writes = ['memory-review', 'memory-link', 'memory-unlink'];
    if (!['GET', 'POST'].includes(method) || (method === 'POST' && !['context', 'context-compare', 'features', 'activity-report', ...writes, ...projectRoutes.slice(1)].includes(route))) return send({ error: 'Method not allowed.' }, 405);
    const settings = dependencies.settings ?? getFeatureSettings();
    const localActivity = () => {
      const enabled = settings.get().features.liveActivity;
      if (!local) return activity(enabled);
      const journal = dependencies.journal ?? activityJournalFor(dependencies.brain!);
      return { enabled, activity: enabled ? journal.read({ projectId: local.projectId, limit: 200 }).events.slice(-30).reverse().map(event => ({
        id: event.id, type: event.kind, label: [event.tool, event.phase, event.outcome].filter(Boolean).join(' · ') || event.kind,
        agent: event.agent ?? '', project: local.projectName, timestamp: event.timestamp,
      })) : [] };
    };
    if (projectRoutes.includes(route)) {
      if (!local) return send({ error: 'Open shadow-brain project workspace for project-local knowledge and skills.' }, 409);
      if (route === 'project-profile') return send(inspectProject(local.root));
      if (route === 'project-feedback') {
        const feedback = new ProjectFeedbackStore(local.root, dependencies.brain!);
        if (method === 'GET') return send(feedback.get());
        const input = await body(req);
        const { expectedRevision, kind, ...params } = input;
        await dependencies.brain!.init(); dependencies.brain!.refresh();
        if (dependencies.brain!.getStorageHealth().lastError) throw new Error('Project memory could not be read; feedback was not changed.');
        const command = { kind: kind === 'record' ? 'upsert' : kind === 'enable' ? 'toggle' : kind, ...params };
        return send(await feedback.update(command as Parameters<ProjectFeedbackStore['update']>[0], expectedRevision as number, 'user'));
      }
      if (method !== 'POST') return send({ error: 'Use POST for project knowledge and skill requests.' }, 405);
      const input = await body(req);
      if (route === 'project-skill-preview') return send(planProjectSkill(local.root, input as unknown as ProjectSkillParams));
      const started = Date.now();
      const correlationId = randomUUID();
      const recordOperation = async (outcome?: 'success' | 'error') => {
        if (!settings.get().features.activityRecording) return;
        try { await (dependencies.journal ?? activityJournalFor(dependencies.brain!)).append({ projectId: local.projectId,
          kind: outcome ? 'tool-end' : 'tool-start', source: 'reported', transport: 'host', agent: 'user', sessionId: 'project-portal',
          tool: route, correlationId, ...(outcome ? { outcome, durationMs: Math.max(0, Date.now() - started) } : {}) }); }
        catch { /* The committed result remains valid when optional activity recording is unavailable. */ }
      };
      await recordOperation();
      let result: unknown;
      try {
        if (route === 'project-knowledge') result = await addProjectKnowledge(local.root, dependencies.brain!, input);
        else {
          const { expectedPlanHash, ...params } = input;
          result = await applyProjectSkill(local.root, params as unknown as ProjectSkillParams, expectedPlanHash as string);
        }
      } catch (error) { await recordOperation('error'); throw error; }
      await recordOperation('success');
      return send(result);
    }
    if (route === 'features') {
      if (method === 'POST') {
        const input = await body(req);
        if (Object.keys(input).some(key => !['patch', 'expectedRevision'].includes(key))) throw new TypeError('Unknown settings request field.');
        if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0)) throw new TypeError('Invalid settings revision.');
        await settings.update(input.patch, input.expectedRevision as number | undefined);
      }
      return send(settingsResponse(settings));
    }
    if (route === 'activity') return send(localActivity());
    if (route === 'telemetry') {
      const flags = settings.get().features;
      const common = { checkedAt: new Date().toISOString(), liveEnabled: flags.liveActivity, recordingEnabled: flags.activityRecording, demo: dependencies.demo === true };
      if (!flags.liveActivity) return send({ ...common, events: [], journalId: null, revision: 0, oldestSequence: null, latestSequence: 0,
        nextAfterSequence: 0, cursor: 0, hasMore: false, gap: false, reset: false, retainedCount: 0, droppedCount: 0 });
      const qs = url.searchParams;
      const cursor = qs.get('cursor');
      const journal = dependencies.journal ?? activityJournalFor(dependencies.brain ?? getGlobalBrain());
      const page = journal.read({ afterSequence: cursor === null ? undefined : bounded(cursor, 0, Number.MAX_SAFE_INTEGER, 0),
        journalId: query(qs, 'journalId'), projectId: local?.projectId ?? query(qs, 'project'), limit: bounded(qs.get('limit'), 200, 200) });
      return send({ ...common, ...page, cursor: page.nextAfterSequence });
    }
    if (route === 'activity-report') {
      if (method !== 'POST') return send({ error: 'Use POST to report activity.' }, 405);
      const input = await body(req);
      if (local && input.projectId !== undefined && input.projectId !== local.projectId) throw new TypeError('This portal is pinned to its local project.');
      if (local) input.projectId = local.projectId;
      return send(await reportAgentActivity(dependencies.brain ?? getGlobalBrain(), settings, input, dependencies.journal));
    }
    if (!['overview', 'memories', 'graph', 'context', 'context-compare', 'memory', 'memory-health', 'integrations', ...writes].includes(route)) return send({ error: 'Not found.' }, 404);
    if (['context', 'context-compare'].includes(route) && method !== 'POST') return send({ error: 'Use POST for context assembly.' }, 405);
    if (writes.includes(route) && method !== 'POST') return send({ error: 'Use POST for memory changes.' }, 405);

    const mutationInput = writes.includes(route) ? await body(req) : undefined;
    if (mutationInput) {
      if (local && mutationInput.projectId !== local.projectId) throw new TypeError('This portal is pinned to its local project.');
      if (!Number.isSafeInteger(mutationInput.expectedRevision) || Number(mutationInput.expectedRevision) < 0) throw new TypeError('A current expectedRevision is required.');
      const allowed = route === 'memory-review' ? ['projectId', 'memoryId', 'state', 'note', 'expectedRevision'] :
        route === 'memory-link' ? ['projectId', 'fromId', 'toId', 'type', 'note', 'expectedRevision'] : ['projectId', 'memoryId', 'linkId', 'expectedRevision'];
      if (Object.keys(mutationInput).some(key => !allowed.includes(key))) throw new TypeError('Unknown memory change field.');
    }

    const brain = dependencies.brain ?? getGlobalBrain();
    if (route === 'integrations') return send(inspectClientIntegrations({ projectDir: dependencies.projectDir, brain, localProjectId: local?.projectId }));
    const annotationStore = dependencies.annotations ?? memoryAnnotationsFor(brain);
    const refresh = async () => {
      await brain.init();
      brain.refresh();
      if (brain.getStorageHealth().lastError) throw new Error('The memory store could not be read. Check storage health.');
    };
    if (route === 'context' || route === 'context-compare') {
      const input = await body(req);
      const options = parseContextRequest(input);
      if (local && (options.projectId !== local.projectId || options.includeCrossProject === true)) throw new TypeError('This portal is pinned to its local project.');
      const flags = settings.get().features;
      if (flags.contextAssembly) await refresh();
      const common = { ...options, features: flags, annotations: flags.contextAssembly ? annotationStore.get() : undefined,
        feedback: flags.contextAssembly && local ? new ProjectFeedbackStore(local.root, brain).get() : undefined };
      if (route === 'context') return send(assembleContext(brain, common));
      const legacy = assembleContext(brain, { ...common, profile: 'legacy' });
      const adaptive = assembleContext(brain, { ...common, profile: 'adaptive' });
      const oldIds = new Set(legacy.entries.map(entry => entry.id));
      const newIds = new Set(adaptive.entries.map(entry => entry.id));
      return send({ legacy, adaptive, delta: { addedIds: [...newIds].filter(id => !oldIds.has(id)),
        removedIds: [...oldIds].filter(id => !newIds.has(id)), sharedIds: [...newIds].filter(id => oldIds.has(id)) },
        warnings: ['Both profiles use the same memory view. Their token estimators differ; selection changes are not proof of higher accuracy.'] });
    }

    await refresh();
    const annotations = annotationStore.get();
    const qs = url.searchParams;
    const requestedProject = local?.projectId ?? query(qs, 'project');
    if (local && query(qs, 'project') && query(qs, 'project') !== local.projectId) throw new TypeError('This portal is pinned to its local project.');
    if (route === 'memory-health') return send(inspectMemoryHealth(brain, annotations,
      { projectId: requestedProject, limit: bounded(qs.get('limit'), 30, 100) }));
    if (route === 'memory') {
      const id = query(qs, 'id');
      if (!id || !requestedProject) throw new TypeError('Memory ID and project are required.');
      const memory = brain.getEntry(id);
      if (!memory || memory.projectId !== requestedProject) return send({ error: 'Memory not found in the selected project.' }, 404);
      const endpoint = (memoryId: string) => {
        const value = brain.getEntry(memoryId);
        return value?.projectId === requestedProject ? value : undefined;
      };
      const links = annotations.links.filter(link => link.projectId === requestedProject && [link.fromId, link.toId].includes(id))
        .map(link => ({ ...link, fromTitle: endpoint(link.fromId)?.content.slice(0, 130) ?? 'Unavailable memory',
          toTitle: endpoint(link.toId)?.content.slice(0, 130) ?? 'Unavailable memory',
          orphaned: !endpoint(link.fromId) || !endpoint(link.toId) }));
      const history = annotations.history.filter(event => event.projectId === requestedProject &&
        ((event.command.kind === 'review' && event.command.memoryId === id) ||
          (event.command.kind === 'link' && [event.command.fromId, event.command.toId].includes(id)) ||
          (event.relation && [event.relation.fromId, event.relation.toId].includes(id))));
      const review = annotations.reviews[id]?.projectId === requestedProject ? annotations.reviews[id] : null;
      return send({ memory: { ...summary(memory, annotations), content: memory.content, importance: memory.importance, createdAt: date(memory.createdAt) },
        review, effectiveState: memoryState(annotations, requestedProject, id), links, revision: annotations.revision, history,
        warnings: links.some(link => link.orphaned) ? ['A linked memory is no longer available. Recorded supersession remains until explicitly removed.'] : [] });
    }
    if (writes.includes(route)) {
      const input = mutationInput!;
      let command: unknown;
      if (route === 'memory-review') command = { kind: 'review', projectId: input.projectId, memoryId: input.memoryId, state: input.state, ...(input.note !== undefined ? { note: input.note } : {}) };
      else if (route === 'memory-link') command = { kind: 'link', projectId: input.projectId, fromId: input.fromId, toId: input.toId, type: input.type, ...(input.note !== undefined ? { note: input.note } : {}) };
      else {
        const memory = typeof input.memoryId === 'string' ? brain.getEntry(input.memoryId) : undefined;
        const link = annotations.links.find(item => item.id === input.linkId && item.projectId === input.projectId && [item.fromId, item.toId].includes(String(input.memoryId)));
        if (!memory || memory.projectId !== input.projectId || !link) return send({ error: 'Relationship not found in the selected memory and project.' }, 404);
        command = { kind: 'unlink', linkId: input.linkId };
      }
      const committed = await annotationStore.update(command, input.expectedRevision as number);
      return send({ revision: committed.revision, updatedAt: committed.updatedAt });
    }
    const recentInventory = brain.timeline({ limit: INVENTORY_LIMIT, ...(local ? { projectId: local.projectId } : {}) });
    const inventory = requestedProject ? brain.timeline({ projectId: requestedProject, limit: INVENTORY_LIMIT }) : recentInventory;
    const projectMap = new Map<string, { id: string; name: string; memories: number; updatedAt: string | null }>();
    if (local) projectMap.set(local.projectId, { id: local.projectId, name: local.projectName, memories: 0, updatedAt: null });
    for (const entry of recentInventory) {
      const project = projectMap.get(entry.projectId) ?? { id: entry.projectId, name: entry.projectName || entry.projectId, memories: 0, updatedAt: date(entry.createdAt) };
      project.memories++;
      projectMap.set(entry.projectId, project);
    }
    if (requestedProject && inventory.length) projectMap.set(requestedProject, {
      id: requestedProject, name: inventory[0].projectName || requestedProject, memories: inventory.length, updatedAt: date(inventory[0].createdAt),
    });
    const projects = [...projectMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    const facets = { projects, categories: [...new Set(inventory.map(entry => entry.category))].sort(), agents: [...new Set(inventory.map(entry => entry.agentTool))].sort() };
    const inventoryTruncated = requestedProject ? brain.timeline({ projectId: requestedProject, limit: INVENTORY_LIMIT + 1 }).length > INVENTORY_LIMIT : brain.getStats().totalEntries > inventory.length;
    if (route === 'overview') {
      const scoped = inventory.filter(entry => !requestedProject || entry.projectId === requestedProject);
      const quality = { total: scoped.length, sourceBacked: 0, active: 0, contested: 0, archived: 0, superseded: 0, reviewed: 0 };
      for (const entry of scoped) {
        quality[memoryState(annotations, entry.projectId, entry.id)]++;
        if (sources(entry).length) quality.sourceBacked++;
        if (annotations.reviews[entry.id]?.projectId === entry.projectId) quality.reviewed++;
      }
      return send({ version: '7.1.4', demo: dependencies.demo === true,
        projectKit: local ? { available: true, projectId: local.projectId, projectName: local.projectName, root: local.root, storagePath: local.storagePath } : { available: false },
        totals: { projects: projects.length, memories: local ? inventory.length : brain.getStats().totalEntries, agents: facets.agents.length },
        projects, ...localActivity(), storageHealth: brain.getStorageHealth(),
        features: settings.get().features, recentMemories: scoped.slice(0, 5).map(entry => summary(entry, annotations)), truncated: inventoryTruncated,
        quality, scope: { projectId: requestedProject ?? null, basis: 'recent-inventory' },
        inventoryLimit: INVENTORY_LIMIT });
    }
    const projectId = requestedProject;
    const category = query(qs, 'category');
    const agentTool = query(qs, 'agent') as AgentTool | undefined;
    const search = query(qs, 'q');
    let entries: Memory[] = search ? brain.recallScored({ projectId, category, agentTool, keywords: search.split(/\s+/), limit: INVENTORY_LIMIT })
      : inventory.filter(entry => (!projectId || entry.projectId === projectId) && (!category || entry.category === category) && (!agentTool || entry.agentTool === agentTool));
    const stateFilter = query(qs, 'state');
    if (stateFilter && stateFilter !== 'all') {
      if (!['active', 'archived', 'contested', 'superseded'].includes(stateFilter)) throw new TypeError('Unknown memory state.');
      entries = entries.filter(entry => memoryState(annotations, entry.projectId, entry.id) === stateFilter);
    }
    if (route === 'memories') {
      const limit = bounded(qs.get('limit'), 30, 100);
      const offset = bounded(qs.get('offset'), 0, INVENTORY_LIMIT, 0);
      return send({ items: entries.slice(offset, offset + limit).map(entry => summary(entry, annotations)), total: entries.length, facets, truncated: inventoryTruncated, inventoryLimit: INVENTORY_LIMIT });
    }
    const limit = bounded(qs.get('limit'), 100, 180);
    const nodes: Array<Record<string, unknown>> = [];
    const edges: Array<{ id?: string; source: string; target: string; kind: string; note?: string }> = [];
    const selectedId = query(qs, 'memory');
    const selected = selectedId ? brain.getEntry(selectedId) : undefined;
    const shown = entries.slice(0, limit);
    if (selected && (!projectId || selected.projectId === projectId) && !shown.some(entry => entry.id === selected.id)) {
      if (shown.length >= limit) shown.pop();
      shown.unshift(selected);
    }
    const usedProjects = new Set<string>();
    const usedAgents = new Set<string>();
    for (const entry of shown) {
      const projectNode = 'project:' + entry.projectId;
      const agentNode = 'agent:' + entry.agentTool;
      const memoryNode = 'memory:' + entry.id;
      if (!usedProjects.has(projectNode)) {
        usedProjects.add(projectNode);
        nodes.push({ id: projectNode, kind: 'project', label: entry.projectName || entry.projectId, project: entry.projectId });
      }
      if (!usedAgents.has(agentNode)) {
        usedAgents.add(agentNode);
        nodes.push({ id: agentNode, kind: 'agent', label: entry.agentTool });
      }
      const detail = summary(entry, annotations);
      nodes.push({ id: memoryNode, kind: 'memory', label: detail.title, project: entry.projectId, category: entry.category,
        memoryId: entry.id, effectiveState: detail.effectiveState, snippet: detail.snippet, source: detail.source, sources: detail.sources, agent: entry.agentTool, updatedAt: detail.updatedAt });
      edges.push({ source: projectNode, target: memoryNode, kind: 'belongs-to' }, { source: agentNode, target: memoryNode, kind: 'recorded-by' });
    }
    const shownById = new Map(shown.map(entry => [entry.id, entry.projectId]));
    for (const link of annotations.links) {
      if (shownById.get(link.fromId) !== link.projectId || shownById.get(link.toId) !== link.projectId) continue;
      edges.push({ id: link.id, source: 'memory:' + link.fromId, target: 'memory:' + link.toId, kind: link.type, note: link.note });
    }
    return send({ nodes, edges, truncated: entries.length > limit || inventoryTruncated, shownMemories: shown.length, totalMemories: entries.length, facets });
  } catch (error) {
    const code = (error as { code?: string }).code;
    send({ error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) },
      code === 'FEATURE_SETTINGS_CONFLICT' || code === 'ANNOTATIONS_CONFLICT' || code?.includes('CONFLICT') || code?.includes('STALE') ? 409 : code === 'ANNOTATIONS_NOT_FOUND' ? 404 :
        code === 'FEATURE_SETTINGS_INVALID_PATCH' || code === 'ANNOTATIONS_INVALID_COMMAND' || code === 'ACTIVITY_JOURNAL_INVALID_EVENT' ||
          code === 'ACTIVITY_JOURNAL_INVALID_CURSOR' || error instanceof TypeError || error instanceof RangeError ? 400 : 500);
  }
}
