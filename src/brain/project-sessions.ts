import { randomUUID } from 'node:crypto';
import type { GlobalBrain } from './global-brain.js';
import { ProjectHubError, hubId } from './project-hub-contract.js';
import { digest, HubStore } from './project-hub-store.js';
import { requireProjectStore } from './project-memory.js';
import { validateNativeSnapshot, type NativeSessionSnapshot } from './native-session-import.js';
import { hiddenChatSessions, type ProjectPolicy } from './project-policy.js';
import {
  SESSION_LIMITS, ProjectSessionError, importSessionInput, openSessionInput, recordSessionInput, resumeSessionInput,
  sessionActorInput, sessionInput, sessionOperationKey, SESSION_OPERATOR, transcriptInput,
  type SessionActor, type SessionCheckpoint, type SessionMessage, type SessionRecord, type SessionSummary,
} from './project-session-contract.js';

type SessionOrigin = SessionRecord['resumedFrom'];
type SessionOptions = { title: string; goal: string; hostSessionId?: string; parentSessionId?: string };
const notFound = (item: string): never => { throw new ProjectSessionError('SESSION_NOT_FOUND', item + ' was not found in this project.', 404); };
const conflict = (message: string): never => { throw new ProjectSessionError('SESSION_CONFLICT', message, 409); };
const capped = (message: string): never => { throw new ProjectSessionError('SESSION_LIMIT', message, 422); };

/** Persist reports from cooperating hosts and the local project operator. */
export class ProjectSessions {
  private readonly projectId: string;
  private readonly root: string;
  private readonly db: HubStore;

  constructor(directory: string, brain: GlobalBrain, private readonly now = Date.now, private readonly policy?: ProjectPolicy) {
    const { root, projectId } = requireProjectStore(directory, brain);
    this.root = root;
    this.projectId = projectId;
    this.db = new HubStore(root, projectId);
  }

  private run<T>(action: () => T): T {
    try { return action(); }
    catch (error) {
      if (error instanceof ProjectSessionError) throw error;
      if (error instanceof ProjectHubError && error.code.startsWith('SOURCE_')) throw error;
      if (error instanceof ProjectHubError && error.code === 'HUB_CONFLICT') conflict(error.message);
      if (error instanceof ProjectHubError && error.code === 'HUB_LIMIT') capped('This project reached its session operation limit.');
      throw new ProjectSessionError('SESSION_STORAGE_UNAVAILABLE', 'Project session storage could not be opened. Check the project store and retry.', 503);
    } finally { this.db.close(); }
  }

  private timestamp(): string { return new Date(this.now()).toISOString(); }

  private row(id: string): SessionRecord {
    return this.db.get<SessionRecord>('sessions', id) ?? notFound('Session');
  }

  private hiddenSessions(): Set<string> {
    return this.policy?.chats.some(item => !item.shareContext)
      ? hiddenChatSessions(this.policy, this.db.list<SessionRecord>('sessions')) : new Set();
  }

  private assertShared(id: string) {
    if (this.hiddenSessions().has(id)) {
      throw new ProjectSessionError('SESSION_SHARING_OFF', 'This conversation is unavailable for agent delivery in project controls.', 403);
    }
  }

  private checkpoint(sessionId: string, id: string): SessionCheckpoint {
    const entry = this.db.get<SessionCheckpoint>('session-checkpoints', id, sessionId) ?? notFound('Checkpoint');
    const { sha256, ...fields } = entry;
    if (sha256 !== digest(JSON.stringify(fields))) throw new ProjectSessionError('SESSION_CHECKPOINT_CORRUPT', 'The checkpoint no longer matches its stored digest.', 409);
    return entry;
  }

  private summary(session: SessionRecord, now: number): SessionSummary {
    const age = now - Date.parse(session.lastReportedAt);
    return { ...session, presence: session.reportedStatus === 'completed' ? 'completed' :
      (Number.isFinite(age) && age >= 0 && age <= SESSION_LIMITS.recentMs) ? 'recent' : 'stale' };
  }

  private detail(id: string, limit: number = SESSION_LIMITS.page, before?: string) {
    this.assertShared(id);
    const row = this.row(id);
    const handoff = row.resumedFrom ? this.checkpoint(row.resumedFrom.sessionId, row.resumedFrom.checkpointId) : null;
    const page = this.db.page<SessionMessage>('session-messages', id, limit, SESSION_LIMITS.messagePageBytes, before) ?? notFound('Message cursor');
    return { projectId: this.projectId, session: this.summary(row, this.now()),
      messages: page.rows, messageCount: this.db.count('session-messages', id), nextBefore: page.more ? page.rows[0].id : null,
      checkpoints: this.db.sessionCheckpointSummaries(id), handoff };
  }

  list() {
    return this.run(() => this.db.read(() => {
      const now = this.now();
      const rows = this.db.list<SessionRecord>('sessions'), hidden = this.policy ? hiddenChatSessions(this.policy, rows) : new Set();
      const sessions = rows.filter(row => !hidden.has(row.id)).map(row => this.summary(row, now))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      return { projectId: this.projectId, sessions, limits: SESSION_LIMITS };
    }) ?? { projectId: this.projectId, sessions: [], limits: SESSION_LIMITS });
  }

  read(rawId: unknown, limit: number = SESSION_LIMITS.page, before?: string) {
    const id = sessionInput(hubId, rawId);
    if (!Number.isInteger(limit) || limit < 1 || limit > SESSION_LIMITS.page) throw new ProjectSessionError('SESSION_INVALID_INPUT', 'Invalid session page limit.', 400);
    return this.run(() => this.db.read(() => this.detail(id, limit, before)) ?? notFound('Session'));
  }

  readCheckpoint(rawId: unknown, checkpointId: unknown) {
    const id = sessionInput(hubId, rawId), checkpoint = sessionInput(hubId, checkpointId);
    return this.run(() => this.db.read(() => {
      this.assertShared(id);
      this.row(id);
      return { projectId: this.projectId, checkpoint: this.checkpoint(id, checkpoint) };
    }) ?? notFound('Session'));
  }

  private insert(actor: SessionActor, input: SessionOptions, origin: SessionOrigin = null, sourceId: string | null = null,
    native?: SessionRecord['native']): SessionRecord {
    if (input.parentSessionId) { this.assertShared(input.parentSessionId); this.row(input.parentSessionId); }
    if (this.db.count('sessions') >= SESSION_LIMITS.sessions) capped('This project reached its retained session limit.');
    const timestamp = this.timestamp();
    const session: SessionRecord = { id: randomUUID(), title: input.title, goal: input.goal, actor, hostSessionId: input.hostSessionId ?? null,
      reportedStatus: sourceId || native ? 'completed' : 'working', statusReportedBy: actor, createdAt: timestamp, updatedAt: timestamp, lastReportedAt: timestamp,
      revision: 0, parentSessionId: input.parentSessionId ?? null, resumedFrom: origin, latestCheckpointId: null, sourceId,
      ...(native ? { native } : {}) };
    return this.db.put('sessions', session, native ? this.nativeScope(native) : sourceId ?? '');
  }

  private change(actor: SessionActor, scope: string, input: { key: string }, apply: () => string) {
    return this.run(() => this.db.transaction(() => {
      const operation = 'session:' + digest(JSON.stringify([actor.id, actor.kind, input.key]));
      const id = this.db.operation(operation, { scope, input }, apply, SESSION_LIMITS.operations);
      return this.detail(id);
    }));
  }

  open(raw: unknown, by: SessionActor) {
    const input = sessionInput(openSessionInput, raw);
    const actor = sessionInput(sessionActorInput, by);
    return this.change(actor, 'open', input, () => this.insert(actor, input).id);
  }

  record(rawId: unknown, raw: unknown, by: SessionActor) {
    const id = sessionInput(hubId, rawId);
    const input = sessionInput(recordSessionInput, raw);
    const actor = sessionInput(sessionActorInput, by);
    return this.change(actor, 'record:' + id, input, () => {
      this.assertShared(id);
      const current = this.row(id);
      if (actor.kind !== 'user' && current.actor.id !== actor.id) {
        throw new ProjectSessionError('SESSION_OWNER_REQUIRED', 'Resume this session in your own agent connection before posting to it.', 403);
      }
      if (input.expectedRevision !== undefined && input.expectedRevision !== current.revision) conflict('The session changed. Reload it before posting.');
      if (current.reportedStatus === 'completed' && !(input.kind === 'checkpoint' && actor.kind === 'user')) {
        conflict('This session is completed. Resume from its recorded checkpoint to continue.');
      }
      const createdAt = this.timestamp();
      const updated = { ...current, updatedAt: createdAt, lastReportedAt: actor.id === current.actor.id ? createdAt : current.lastReportedAt,
        revision: current.revision + 1 };
      if (input.kind === 'status') {
        updated.reportedStatus = input.status;
        updated.statusReportedBy = actor;
      }
      else if (input.kind === 'message') {
        if (this.db.count('session-messages', id) >= SESSION_LIMITS.messages) capped('This session reached its retained message limit.');
        this.db.put('session-messages', { id: randomUUID(), actor, role: input.role, text: input.text, createdAt }, id);
      } else {
        if (this.db.count('session-checkpoints', id) >= SESSION_LIMITS.checkpoints) capped('This session reached its retained checkpoint limit.');
        const { summary, decisions, completed, nextSteps, evidence } = input;
        const checkpoint = { id: randomUUID(), sessionId: id, revision: updated.revision, actor, summary, decisions, completed, nextSteps, evidence, createdAt };
        this.db.put('session-checkpoints', { ...checkpoint, sha256: digest(JSON.stringify(checkpoint)) }, id);
        updated.latestCheckpointId = checkpoint.id;
      }
      this.db.put('sessions', updated, current.native ? this.nativeScope(current.native) : current.sourceId ?? '');
      return id;
    });
  }

  resume(rawId: unknown, raw: unknown, by: SessionActor) {
    const id = sessionInput(hubId, rawId);
    const input = sessionInput(resumeSessionInput, raw);
    const actor = sessionInput(sessionActorInput, by);
    return this.change(actor, 'resume:' + id, input, () => {
      this.assertShared(id);
      const original = this.row(id);
      const checkpoint = this.checkpoint(id, input.checkpointId);
      if (input.sha256 !== checkpoint.sha256) conflict('The supplied digest does not match the saved checkpoint.');
      return this.insert(actor, { ...input, title: input.title ?? original.title, goal: original.goal,
        parentSessionId: input.parentSessionId ?? id }, { sessionId: id, checkpointId: checkpoint.id }).id;
    });
  }

  importTranscript(raw: unknown, resolve: (sourceId: string) => unknown, by: SessionActor) {
    const input = sessionInput(importSessionInput, raw);
    const actor = sessionInput(sessionActorInput, by);
    if (actor.kind !== 'user') throw new ProjectSessionError('SESSION_OPERATOR_REQUIRED', 'Import a reviewed transcript from the project workspace.', 403);
    return this.change(actor, 'import', input, () => {
      const existing = this.db.findByScope<SessionRecord>('sessions', input.sourceId);
      if (existing) return existing.id;
      const source = sessionInput(transcriptInput, resolve(input.sourceId));
      if (source.id !== input.sourceId) throw new ProjectSessionError('SESSION_SOURCE_MISMATCH', 'The transcript belongs to a different source.', 409);
      const row = this.insert(actor, { title: input.title ?? source.name.slice(0, 160), goal: input.goal ?? 'Reviewed transcript' }, null, source.id);
      for (const item of source.items) {
        this.db.put('session-messages', { id: randomUUID(), actor, role: item.role, text: item.text, createdAt: row.createdAt,
          source: { sourceId: source.id, itemId: item.id, locator: item.locator, originalRole: item.originalRole } }, row.id);
      }
      return row.id;
    });
  }

  private nativeScope(metadata: Pick<NativeSessionSnapshot, 'tool' | 'sessionId' | 'sha256'>): string {
    return 'native:' + digest(JSON.stringify([metadata.tool, metadata.sessionId, metadata.sha256]));
  }

  /** Save a user-selected export or a selected thread returned by a project connector. */
  importNative(raw: NativeSessionSnapshot, rawKey: string) {
    const key = sessionInput(sessionOperationKey, rawKey);
    const snapshot = validateNativeSnapshot(raw, this.root);
    const { messages, ...metadata } = snapshot;
    const exactScope = this.nativeScope(metadata);
    const operation = { key, fingerprint: exactScope };
    return this.change(SESSION_OPERATOR, 'native-import', operation, () => {
      const exact = this.db.findByScope<SessionRecord>('sessions', exactScope);
      if (exact) return exact.id;
      const previous = this.db.latestSessionNative(metadata.tool, metadata.sessionId);
      const parent = metadata.parentNativeId ? this.db.latestSessionNative(metadata.tool, metadata.parentNativeId) : undefined;
      const record = this.insert(SESSION_OPERATOR, { title: metadata.titleExact ?? 'Native chat title unavailable',
        goal: 'Selected native conversation snapshot', hostSessionId: metadata.sessionId, parentSessionId: parent?.id },
        null, null, { ...metadata, previousSnapshotId: previous?.id ?? null });
      for (const message of messages) {
        this.db.put('session-messages', { id: randomUUID(), actor: SESSION_OPERATOR, role: message.role, text: message.text,
          createdAt: message.createdAt ?? record.createdAt, native: { id: message.id, locator: message.locator,
            sha256: digest(message.text), createdAt: message.createdAt } }, record.id);
      }
      return record.id;
    });
  }
}
