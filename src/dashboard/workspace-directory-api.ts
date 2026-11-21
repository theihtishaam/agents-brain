import { lstatSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ActivityJournal } from '../brain/activity-journal.js';
import { FeatureSettingsStore } from '../brain/feature-settings.js';
import { GlobalBrain } from '../brain/global-brain.js';
import { hostDisplayLabel, reportedHost, type DiscoverableHostId } from '../brain/host-discovery.js';
import { MCPPresenceStore, MCP_PRESENCE_FILE } from '../brain/mcp-presence.js';
import { ModelUsageStore } from '../brain/model-usage.js';
import { HubStore } from '../brain/project-hub-store.js';
import { projectLocalPath } from '../brain/project-kit-paths.js';
import { projectStorage } from '../brain/project-memory.js';
import { hiddenChatSessions, ProjectPolicyStore, toolParticipates } from '../brain/project-policy.js';
import type { SessionRecord } from '../brain/project-session-contract.js';
import { ProjectSessions } from '../brain/project-sessions.js';
import { WorkspaceConnections } from '../brain/workspace-connections.js';
import { WorkspaceDirectory } from '../brain/workspace-directory.js';

const projectKey = z.string().regex(/^[0-9a-f]{16}$/u);
const expectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const projectName = z.string().trim().min(1).max(120).refine(name => !/[\u0000-\u001f\u007f]/u.test(name));
const command = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('add'), root: z.string().min(1).max(2048).refine(isAbsolute), projectName: projectName.optional(), expectedRevision }),
  z.strictObject({ kind: z.literal('set-sharing'), projectId: projectKey, enabled: z.boolean(), expectedRevision }),
  z.strictObject({ kind: z.literal('forget'), projectId: projectKey, expectedRevision }),
]);
const MAX_OBSERVED_PROJECTS = 12;
const MAX_SUMMARY_PROJECTS = 6;
const MAX_SESSIONS = 8;
type Index = ReturnType<WorkspaceDirectory['list']>;
type Registration = Index['projects'][number];
type DirectoryPhase = 'understand' | 'plan' | 'work' | 'verify';
type DirectoryHost = { id: DiscoverableHostId; label: string; connections: number };
type DirectorySession = {
  id: string; title: string; hasCheckpoint: boolean; host: DiscoverableHostId | null; reportedStatus: 'working' | 'waiting' | 'completed' | null;
  lastReportedAt: string | null; phase: DirectoryPhase | null; phaseReportedAt: string | null;
  requestModel: string | null; responseModel: string | null; reasoningEffort: string | null; modelReportedAt: string | null;
};
type ProjectStatus = 'available' | 'awaiting-host' | 'unavailable' | 'private' | 'not-inspected';

export class WorkspaceDirectoryRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'WORKSPACE_DIRECTORY_REQUEST') { super(message); }
}

function timestamps(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

const sessionTool = (session: SessionRecord) =>
  session.actor.kind === 'agent' ? session.actor.tool : session.native?.tool ?? session.actor.tool;
const sessionIdentity = (session: SessionRecord) =>
  session.hostSessionId ? JSON.stringify([sessionTool(session), session.hostSessionId]) : null;

function hasProjectEvidence(project: ReturnType<typeof projectStorage>) {
  const local = ['project-hub.sqlite', MCP_PRESENCE_FILE, 'model-usage.sqlite'].map(name =>
    projectLocalPath(project.root, '.shadow-brain/' + name));
  let found = false;
  for (const file of [project.storagePath, project.journalPath, ...local]) {
    const stat = lstatSync(file, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Project evidence is not an ordinary local file.');
    found = true;
  }
  return found;
}

function emptyProject(entry: Registration, status: Exclude<ProjectStatus, 'available'>) {
  return { ...entry, status, hosts: null, sessions: null, latestOutcome: null, progress: null,
    policyRevision: null, codexIndexAllowed: status === 'private' ? false : null, opencodeIndexAllowed: status === 'private' ? false : null };
}

function directoryProject(entry: Registration, inspectReports: boolean, observeCodex: boolean) {
  try {
    const project = projectStorage(entry.root);
    const { root, projectId } = project;
    if (projectId !== entry.projectId) return emptyProject(entry, 'unavailable');
    const policy = new ProjectPolicyStore(root, projectId).get();
    if (policy.participationEnabled === false) return emptyProject(entry, 'private');
    const hasEvidence = hasProjectEvidence(project);
    if (!hasEvidence && !observeCodex) return emptyProject(entry, 'awaiting-host');
    const excluded = new Set(new WorkspaceConnections(root, projectId).excludedHosts());
    const hostAllowed = (raw: string) => {
      const host = reportedHost(raw);
      return toolParticipates(policy, raw) && (!host || (!excluded.has(host) && toolParticipates(policy, host)));
    };
    const nativePermission = { policyRevision: policy.revision, codexIndexAllowed: hostAllowed('codex'), opencodeIndexAllowed: hostAllowed('opencode') };
    if (!hasEvidence) return { ...emptyProject(entry, 'awaiting-host'), ...nativePermission };
    const flags = new FeatureSettingsStore({ filePath: project.settingsPath }).get().features;
    let hosts: DirectoryHost[] | null = null;
    if (flags.activityRecording) {
      try {
        const counts = new Map<DiscoverableHostId, number>();
        for (const item of new MCPPresenceStore(root, projectId).read(true).tools) {
          const id = reportedHost(item.tool);
          if (id && hostAllowed(item.tool)) counts.set(id, (counts.get(id) ?? 0) + item.count);
        }
        hosts = [...counts].map(([id, connections]) => ({ id, label: hostDisplayLabel(id), connections }));
      } catch { /* Missing evidence is represented as unknown. */ }
    }
    if (!inspectReports) return { ...entry, status: 'available' as const, hosts, sessions: null, latestOutcome: null, progress: null, ...nativePermission };
    let sessions: DirectorySession[] | null = null;
    try {
      const brain = GlobalBrain.createIsolated({ dbPath: project.storagePath });
      const all = new ProjectSessions(root, brain).list().sessions;
      const hidden = hiddenChatSessions(policy, all);
      const identities = new Map<string, number>();
      for (const session of all) {
        const identity = sessionIdentity(session);
        if (identity) identities.set(identity, (identities.get(identity) ?? 0) + 1);
      }
      const rows = all.filter(session => !hidden.has(session.id) && hostAllowed(sessionTool(session)) &&
        hostAllowed(session.actor.tool) && hostAllowed(session.statusReportedBy.tool)).slice(0, MAX_SESSIONS);
      let events: ReturnType<ActivityJournal['get']>['events'] = [];
      let reports: ReturnType<ModelUsageStore['read']>['receipts'] = [];
      if (rows.some(session => session.hostSessionId)) {
        if (flags.liveActivity) {
          try { events = new ActivityJournal({ filePath: project.journalPath }).get().events; }
          catch { /* Reported phase is optional. */ }
        }
        try { reports = new ModelUsageStore(root, projectId).read().receipts; }
        catch { /* Reported model and effort are optional. */ }
      }
      sessions = rows.map(session => {
        const tool = sessionTool(session);
        const identity = sessionIdentity(session);
        const matches = (value: { projectId?: string; sessionId?: string; agent?: string }) =>
          identity !== null && identities.get(identity) === 1 && value.projectId === projectId &&
          value.agent === tool && value.sessionId === session.hostSessionId;
        const phase = events.findLast(event => event.kind === 'phase' && event.source === 'reported' && matches(event));
        const model = reports.findLast(report => matches(report) && (report.requestModel || report.responseModel || report.reasoningEffort));
        return { id: session.id, hasCheckpoint: !!session.latestCheckpointId, title: typeof session.title === 'string' ? session.title.slice(0, 120) : 'Untitled session',
          host: reportedHost(tool) ?? null,
          reportedStatus: ['working', 'waiting', 'completed'].includes(session.reportedStatus) ? session.reportedStatus : null,
          lastReportedAt: timestamps(session.lastReportedAt), phase: phase?.phase ?? null, phaseReportedAt: phase?.timestamp ?? null,
          requestModel: model?.requestModel ?? null, responseModel: model?.responseModel ?? null, reasoningEffort: model?.reasoningEffort ?? null,
          modelReportedAt: model?.recordedAt ?? null };
      });
    } catch { /* Unreadable sessions are distinct from no recorded sessions. */ }
    let work: ReturnType<HubStore['directoryWorkSummary']> = { latestOutcome: null, progress: null };
    try {
      work = new HubStore(root, projectId).directoryWorkSummary(actor => hostAllowed(actor.split(':', 1)[0]));
    } catch { /* A failed task/outcome read does not invent progress. */ }
    return { ...entry, status: 'available' as const, hosts, sessions, ...work, ...nativePermission };
  } catch { return emptyProject(entry, 'unavailable'); }
}

export function portfolioSnapshot(index: Index, currentProjectId: string, requestedProject?: string, includeSummaries = false) {
  const visible = [...index.projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt) || a.projectId.localeCompare(b.projectId));
  const reportProject = visible.find(entry => entry.projectId === requestedProject)
    ?? visible.find(entry => entry.projectId === currentProjectId) ?? visible[0];
  const observed = new Set(visible.slice(0, MAX_OBSERVED_PROJECTS).map(entry => entry.projectId));
  observed.add(currentProjectId);
  if (reportProject) observed.add(reportProject.projectId);
  const reports = new Set(includeSummaries ? visible.slice(0, MAX_SUMMARY_PROJECTS).map(entry => entry.projectId) : []);
  if (includeSummaries) reports.add(currentProjectId);
  if (reportProject) reports.add(reportProject.projectId);
  return { revision: index.revision, currentProjectId, total: visible.length,
    workspaces: visible.map(entry => observed.has(entry.projectId) ?
      directoryProject(entry, reports.has(entry.projectId), includeSummaries) : emptyProject(entry, 'not-inspected')),
    forgotten: index.forgotten };
}

export async function workspaceDirectoryRequest(req: IncomingMessage, url: URL, currentProjectId: string,
  readBody: () => Promise<unknown>, directory = new WorkspaceDirectory()) {
  const method = req.method ?? 'GET';
  if (!['GET', 'POST'].includes(method)) throw new WorkspaceDirectoryRequestError('Use GET or POST for the workspace directory.', 405);
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') ||
      (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host) ||
      ['cross-site', 'same-site'].includes(String(req.headers['sec-fetch-site']))) {
    throw new WorkspaceDirectoryRequestError('Use the project portal to open its local workspace directory.', 403);
  }
  if (req.headers['x-shadow-brain-project'] !== currentProjectId) {
    throw new WorkspaceDirectoryRequestError('Reload the portal for this project to open its workspace directory.', 409, 'WORKSPACE_PROJECT_CHANGED');
  }
  const projects = url.searchParams.getAll('project');
  const selected = projects[0];
  if (projects.length > 1 || (selected !== undefined && !projectKey.safeParse(selected).success)) {
    throw new WorkspaceDirectoryRequestError('Choose a registered project identifier.', 400);
  }
  const summary = url.searchParams.getAll('summary');
  if (summary.length > 1 || (summary.length && summary[0] !== '1')) {
    throw new WorkspaceDirectoryRequestError('Use summary=1 to include workspace reports.', 400);
  }
  let index: Index;
  if (method === 'GET') index = directory.list();
  else {
    const parsed = command.safeParse(await readBody());
    if (!parsed.success) throw new WorkspaceDirectoryRequestError('Send a workspace directory change with the current revision.', 400);
    const change = parsed.data;
    if (change.kind === 'add') {
      index = await directory.register(change.root, 'operator', { expectedRevision: change.expectedRevision, reenable: true,
        ...(change.projectName ? { projectName: change.projectName } : {}) });
    } else if (change.kind === 'set-sharing' && change.enabled) index = await directory.reenable(change.projectId, change.expectedRevision);
    else index = await directory.forget(change.projectId, change.expectedRevision);
  }
  return portfolioSnapshot(index, currentProjectId, selected, summary.length === 1);
}
