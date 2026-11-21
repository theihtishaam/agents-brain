import { adaptiveQueryKeywords } from './context-retrieval.js';
import { randomUUID } from 'node:crypto';
import type { GlobalBrain } from './global-brain.js';
import { ProjectHubError, hubId } from './project-hub-contract.js';
import { digest, HubStore } from './project-hub-store.js';
import { requireProjectStore } from './project-memory.js';
import { validateNativeSnapshot, type NativeSessionSnapshot } from './native-session-import.js';
import { FeatureSettingsStore } from './feature-settings.js';
import { ProjectPolicyStore, hiddenChatSessions, nativeChatKey, toolParticipates, toolPolicyLabel, type ProjectPolicy } from './project-policy.js';
import { WorkspaceConnections } from './workspace-connections.js';
import {
  SESSION_LIMITS, SESSION_TRANSCRIPT_LIMITS, ProjectSessionError, appendExactTurnInput, exactTranscriptWindow, handoffSearchInput, importSessionInput,
  openSessionInput, recordSessionInput, recoverSessionInput, resumeSessionInput,
  sessionActorInput, sessionInput, sessionOperationKey, SESSION_OPERATOR, transcriptInput,
  type ExactTranscriptMessage, type SessionActor, type SessionCheckpoint, type SessionMessage, type SessionRecord, type SessionSummary,
} from './project-session-contract.js';

type SessionOrigin = SessionRecord['resumedFrom'];
type SessionOptions = { title: string; goal: string; hostSessionId?: string; parentSessionId?: string; exactTranscript?: boolean };
// These words identify the action the user requested, not the subject of the task.
const continuationWords = new Set(['please', 'resume', 'continue', 'latest', 'current', 'previous', 'session', 'task', 'work', 'project', 'agent', 'handoff', 'checkpoint', 'next', 'step', 'where', 'left', 'off', 'my', 'our']);
const notFound = (item: string): never => { throw new ProjectSessionError('SESSION_NOT_FOUND', item + ' was not found in this project.', 404); };
const conflict = (message: string): never => { throw new ProjectSessionError('SESSION_CONFLICT', message, 409); };
const capped = (message: string): never => { throw new ProjectSessionError('SESSION_LIMIT', message, 422); };
const sharingOff = (): never => { throw new ProjectSessionError('SESSION_SHARING_OFF', 'This conversation is unavailable for agent delivery in project controls.', 403); };
const captureDisabled = (): never => { throw new ProjectSessionError('SESSION_CAPTURE_DISABLED', 'Enable Exact conversation capture in this project before using shared transcript tools.', 403); };
const captureOwner = (): never => { throw new ProjectSessionError('SESSION_OWNER_REQUIRED', 'Only the original owning connection can append new exact messages. Open a linked session to continue.', 403); };
function assertExactMessage(message: ExactTranscriptMessage): void {
  if (Buffer.byteLength(message.text, 'utf8') !== message.bytes || digest(message.text) !== message.sha256) {
    throw new ProjectSessionError('SESSION_TRANSCRIPT_CORRUPT', 'A stored message no longer matches its recorded fingerprint.', 409);
  }
}

/** Persist reports from cooperating hosts and the local project operator. */
export class ProjectSessions {
  private readonly projectId: string;
  private readonly root: string;
  private readonly db: HubStore;
  private readonly settingsPath: string;

  constructor(directory: string, brain: GlobalBrain, private readonly now = Date.now, private readonly policy?: ProjectPolicy) {
    const { root, projectId, settingsPath } = requireProjectStore(directory, brain);
    this.root = root;
    this.projectId = projectId;
    this.settingsPath = settingsPath;
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

  private hiddenSessions(policy = this.policy, rows?: SessionRecord[], allowsTranscript?: (tool: string) => boolean): Set<string> {
    if (!policy) return new Set();
    rows ??= this.db.list<SessionRecord>('sessions');
    if (!allowsTranscript && rows.some(row => row.exactTranscript || row.native?.format === 'codex-app-server-follow-v1')) {
      allowsTranscript = this.transcriptPolicy(policy)?.allows ?? (() => false);
    }
    return hiddenChatSessions(policy, rows, allowsTranscript);
  }

  private assertShared(id: string, policy = this.policy, allowsTranscript?: (tool: string) => boolean) {
    if (this.hiddenSessions(policy, undefined, allowsTranscript).has(id)) sharingOff();
  }

  private transcriptPolicy(existingPolicy?: ProjectPolicy) {
    if (!new FeatureSettingsStore({ filePath: this.settingsPath }).get().features.exactConversationCapture) return undefined;
    const policy = existingPolicy ?? new ProjectPolicyStore(this.root, this.projectId).get();
    const excluded = new Set<string>(new WorkspaceConnections(this.root, this.projectId).excludedHosts());
    return { policy, allows: (tool: string) => toolParticipates(policy, tool) && !excluded.has(toolPolicyLabel(tool)) };
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
      ...(row.exactTranscript ? { exactTranscript: { tool: 'session_transcript_read' as const, sessionId: row.id, ...row.exactTranscript } } : {}),
      checkpoints: this.db.sessionCheckpointSummaries(id), handoff };
  }

  list() {
    return this.run(() => this.db.read(() => {
      const now = this.now();
      const rows = this.db.list<SessionRecord>('sessions'), hidden = this.hiddenSessions(this.policy, rows);
      const sessions = rows.filter(row => !hidden.has(row.id)).map(row => this.summary(row, now))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      return { projectId: this.projectId, sessions, limits: SESSION_LIMITS };
    }) ?? { projectId: this.projectId, sessions: [], limits: SESSION_LIMITS });
  }

  handoffs(raw: unknown) {
    const { query, limit } = sessionInput(handoffSearchInput, raw);
    return this.findHandoffs([...new Set(query?.toLowerCase().split(/\s+/u) ?? [])], limit, false);
  }

  relatedHandoff(terms: string[]) {
    const topics = terms.filter(term => !continuationWords.has(term));
    return topics.length ? this.findHandoffs(topics, 1, true).handoffs[0] : undefined;
  }

  private findHandoffs(terms: string[], limit: number, ranked: boolean) {
    return this.run(() => this.db.read(() => {
      const rows = this.db.list<SessionRecord>('sessions');
      const hidden = this.hiddenSessions(this.policy, rows);
      const matches = rows.flatMap(row => {
        if (hidden.has(row.id) || !row.latestCheckpointId) return [];
        const cp = this.checkpoint(row.id, row.latestCheckpointId);
        const searchable = [row.title, row.goal, cp.summary, cp.approach, ...(cp.constraints ?? []), ...cp.decisions, ...cp.nextSteps].join(' ').toLowerCase();
        const needles = ranked ? new Set([...(searchable.match(/[\p{L}\p{N}_./:-]+/gu) ?? []), ...(searchable.match(/[\p{L}\p{N}]+/gu) ?? [])]) : undefined;
        const hits = terms.filter(term => needles ? needles.has(term) : searchable.includes(term));
        if (hits.length < (ranked ? Math.min(terms.length, Math.max(2, Math.ceil(terms.length / 2))) : terms.length)) return [];
        const titleTerms = ranked ? adaptiveQueryKeywords(row.title + ' ' + row.goal) : [];
        const rank = ranked ? hits.length + hits.filter(term => titleTerms.includes(term)).length : 0;
        return [{ rank, title: row.title, goal: row.goal, sessionId: row.id, checkpointId: cp.id, sha256: cp.sha256,
          savedAt: cp.createdAt, sourceTool: cp.actor.tool, nextStep: cp.nextSteps[0] ?? null }];
      }).sort((a, b) => b.rank - a.rank || b.savedAt.localeCompare(a.savedAt) || a.sessionId.localeCompare(b.sessionId));
      const ambiguous = ranked && matches.length > 1 && matches.some(item => item.rank === matches[0].rank && item.goal !== matches[0].goal);
      return { projectId: this.projectId, total: matches.length, handoffs: (ambiguous ? [] : matches).slice(0, limit).map(({ rank: _rank, ...handoff }) => handoff) };
    }) ?? { projectId: this.projectId, total: 0, handoffs: [] });
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

  readExactTranscript(raw: unknown, by: SessionActor) {
    const { sessionId, before, limit } = sessionInput(exactTranscriptWindow, raw), actor = sessionInput(sessionActorInput, by);
    return this.run(() => this.db.read(() => {
      const access = this.transcriptPolicy() ?? captureDisabled();
      this.assertShared(sessionId, access.policy, access.allows);
      const source = this.row(sessionId);
      if (!access.allows(source.actor.tool) || !access.allows(actor.tool)) sharingOff();
      if (!source.exactTranscript || !source.hostSessionId) notFound('Exact transcript');
      const page = this.db.page<ExactTranscriptMessage>('session-transcript', sessionId, limit, SESSION_TRANSCRIPT_LIMITS.pageBytes, before) ?? notFound('Transcript cursor');
      page.rows.forEach(assertExactMessage);
      return { projectId: this.projectId, sessionId, source: { tool: source.actor.tool, hostSessionId: source.hostSessionId, provenance: 'host-report' as const },
        ...source.exactTranscript!, messages: page.rows, nextBefore: page.more ? page.rows[0].id : null };
    }) ?? notFound('Session'));
  }

  appendExactTurn(raw: unknown, by: SessionActor) {
    const { sessionId, ...input } = sessionInput(appendExactTurnInput, raw), actor = sessionInput(sessionActorInput, by);
    return this.run(() => this.db.transaction(() => {
      const access = this.transcriptPolicy() ?? captureDisabled();
      this.assertShared(sessionId, access.policy, access.allows);
      const source = this.row(sessionId);
      if (!access.allows(source.actor.tool) || !access.allows(actor.tool)) sharingOff();
      const ownHost = actor.kind === 'agent' && source.actor.kind === 'agent' && toolPolicyLabel(actor.tool) === toolPolicyLabel(source.actor.tool);
      if (!ownHost) captureOwner();
      const counts = source.exactTranscript;
      if (!counts || !source.hostSessionId) throw new ProjectSessionError('SESSION_CAPTURE_NOT_ENROLLED', 'Open a session with exact transcript capture explicitly enabled.', 409);

      const key = digest(JSON.stringify([sessionId, input.role, input.hostMessageId]));
      const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-${key.slice(12, 16)}-${key.slice(16, 20)}-${key.slice(20, 32)}`;
      const prior = this.db.get<ExactTranscriptMessage>('session-transcript', id, sessionId);
      const owner = source.actor.id === actor.id;
      if (prior && prior.role === input.role && prior.hostMessageId === input.hostMessageId && prior.text === input.text && prior.model === input.model) {
        assertExactMessage(prior);
        return { sessionId, messageId: id, sha256: prior.sha256, bytes: prior.bytes, replay: true };
      }
      if (!owner) captureOwner();
      if (prior) conflict('This host message ID and role already have different recorded text or model metadata.');
      if (source.reportedStatus === 'completed') conflict('This session is complete. Open a linked session to continue.');
      const bytes = Buffer.byteLength(input.text, 'utf8');
      if (counts.totalMessages >= SESSION_TRANSCRIPT_LIMITS.sessionMessages || counts.totalBytes + bytes > SESSION_TRANSCRIPT_LIMITS.sessionBytes) {
        capped('This session reached its exact transcript limit. Its existing messages remain available. Open a linked session to continue.');
      }
      if (this.db.transcriptBytes() + bytes > SESSION_TRANSCRIPT_LIMITS.projectBytes) {
        capped('This project reached its exact transcript limit. The new message was not recorded.');
      }
      const message: ExactTranscriptMessage = { ...input, id, bytes, sha256: digest(input.text), createdAt: this.timestamp() };
      this.db.put('session-transcript', message, sessionId);
      this.db.put('sessions', { ...source, exactTranscript: { totalMessages: counts.totalMessages + 1, totalBytes: counts.totalBytes + bytes },
        updatedAt: message.createdAt, lastReportedAt: message.createdAt, revision: source.revision + 1 });
      return { sessionId, messageId: id, sha256: message.sha256, bytes, replay: false };
    }));
  }

  private insert(actor: SessionActor, input: SessionOptions, origin: SessionOrigin = null, sourceId: string | null = null,
    native?: SessionRecord['native']): SessionRecord {
    if (input.parentSessionId) { this.assertShared(input.parentSessionId); this.row(input.parentSessionId); }
    if (input.exactTranscript) {
      const access = this.transcriptPolicy() ?? captureDisabled();
      if (actor.kind !== 'agent' || !input.hostSessionId) {
        throw new ProjectSessionError('SESSION_CAPTURE_HOST_REQUIRED', 'Exact transcript enrollment needs a cooperating host and its conversation ID.', 400);
      }
      if (!access.allows(actor.tool) || access.policy.chats.some(chat => !chat.shareContext && chat.key === nativeChatKey(actor.tool, input.hostSessionId!))) sharingOff();
      if (input.parentSessionId) this.assertShared(input.parentSessionId, access.policy, access.allows);
    }
    if (this.db.count('sessions') >= SESSION_LIMITS.sessions) capped('This project reached its retained session limit.');
    const timestamp = this.timestamp();
    const session: SessionRecord = { id: randomUUID(), title: input.title, goal: input.goal, actor, hostSessionId: input.hostSessionId ?? null,
      reportedStatus: sourceId || native ? 'completed' : 'working', statusReportedBy: actor, createdAt: timestamp, updatedAt: timestamp, lastReportedAt: timestamp,
      revision: 0, parentSessionId: input.parentSessionId ?? null, resumedFrom: origin, latestCheckpointId: null, sourceId,
      ...(native ? { native } : {}), ...(input.exactTranscript ? { exactTranscript: { totalMessages: 0, totalBytes: 0 } } : {}) };
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
        const previous = current.latestCheckpointId ? this.checkpoint(id, current.latestCheckpointId) :
          current.resumedFrom ? this.checkpoint(current.resumedFrom.sessionId, current.resumedFrom.checkpointId) : null;
        const approach = input.approach ?? previous?.approach;
        const constraints = input.constraints ?? previous?.constraints;
        const checkpoint = { ...(approach ? { approach } : {}), ...(constraints ? { constraints } : {}), id: randomUUID(), sessionId: id, revision: updated.revision, actor, summary, decisions, completed, nextSteps, evidence, createdAt };
        this.db.put('session-checkpoints', { ...checkpoint, sha256: digest(JSON.stringify(checkpoint)) }, id);
        updated.latestCheckpointId = checkpoint.id;
      }
      this.db.put('sessions', updated, current.native ? this.nativeScope(current.native) : current.sourceId ?? '');
      return id;
    });
  }

  recover(rawId: unknown, raw: unknown, by: SessionActor) {
    const id = sessionInput(hubId, rawId), input = sessionInput(recoverSessionInput, raw);
    const actor = sessionInput(sessionActorInput, by);
    return this.change(actor, 'recover:' + id, input, () => {
      this.assertShared(id);
      const source = this.row(id);
      let cp = source.latestCheckpointId ? this.checkpoint(id, source.latestCheckpointId) : null;
      const sameRecovery = cp?.revision === source.revision && cp.recovery?.sourceRevision === input.expectedRevision;
      if (source.revision !== input.expectedRevision && !sameRecovery) conflict('The shared conversation changed. Read the latest revision before continuing.');
      if (cp?.revision !== source.revision) {
        const messageCount = this.db.count('session-messages', id);
        const rows = this.db.page<SessionMessage>('session-messages', id, 3, SESSION_LIMITS.messagePageBytes)?.rows ?? [];
        const inherited = cp ?? (source.resumedFrom ? this.checkpoint(source.resumedFrom.sessionId, source.resumedFrom.checkpointId) : null);
        const transcriptAccess = source.exactTranscript?.totalMessages ? this.transcriptPolicy() : undefined;
        const exact = transcriptAccess?.allows(source.actor.tool) && transcriptAccess.allows(actor.tool) ? source.exactTranscript : undefined;
        if (exact) this.assertShared(id, transcriptAccess!.policy, transcriptAccess!.allows);
        if (!rows.length && !inherited && !exact) conflict('This conversation has no shared messages or checkpoint to recover.');
        if (this.db.count('session-checkpoints', id) >= SESSION_LIMITS.checkpoints) capped('This session reached its retained checkpoint limit. Choose an existing checkpoint to continue.');
        const createdAt = this.timestamp();
        const revision = source.revision + 1;
        const recovery = { sourceRevision: source.revision, totalMessages: messageCount,
          ...(exact ? { exactTranscript: exact } : {}), messages: rows.map(message => {
          const excerpt = Array.from(message.text).slice(0, 360).join('');
          return { id: message.id, role: message.role, excerpt, truncated: excerpt.length < message.text.length };
        }) };
        const record = { id: randomUUID(), sessionId: id, revision, createdAt, actor, recovery,
          summary: inherited?.summary ?? 'Recovered from the latest shared conversation updates.',
          ...(inherited?.approach ? { approach: inherited.approach } : {}), ...(inherited?.constraints ? { constraints: inherited.constraints } : {}),
          decisions: inherited?.decisions ?? [], completed: inherited?.completed ?? [], nextSteps: inherited?.nextSteps ?? [], evidence: inherited?.evidence ?? [] };
        cp = { ...record, sha256: digest(JSON.stringify(record)) };
        this.db.put('session-checkpoints', cp, id);
        this.db.put('sessions', { ...source, latestCheckpointId: cp.id, updatedAt: createdAt, revision },
          source.native ? this.nativeScope(source.native) : source.sourceId ?? '');
      }
      return this.insert(actor, { ...input, title: source.title, goal: source.goal, parentSessionId: id }, { sessionId: id, checkpointId: cp.id }).id;
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
