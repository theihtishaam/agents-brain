import { randomUUID } from 'node:crypto';
import type { GlobalBrain } from './global-brain.js';
import { requireProjectStore } from './project-memory.js';
import { memoryAnnotationsFor, memoryState } from './memory-annotations.js';
import { readProjectFile } from './project-kit-paths.js';
import { extractHubPdf, PDF_PARSER } from './project-hub-pdf-worker.js';
import { capped, conflict, digest, HubStore, missing } from './project-hub-store.js';
import {
  HUB_LIMITS, HUB_OPERATOR, ProjectHubError, hubActor, hubId, hubInput, lessonActionInput, lessonInput, reviewInput, roomActionInput, roomInput,
  type HubAck, type HubActor, type HubArtifact, type HubDocument, type HubLesson, type HubMessage, type HubOutcome,
  type HubPage, type HubRoom, type HubTask,
} from './project-hub-contract.js';

type DocumentRecord = HubDocument & { pages: HubPage[]; extraction: { id: string; until: number } | null };
type RoomAction = ReturnType<typeof roomActionInput.parse>;
type LessonAction = ReturnType<typeof lessonActionInput.parse>;
const sameActor = (a: HubActor | null, b: HubActor) => a?.id === b.id && a.kind === b.kind;
const artifactFile = /\.(?:txt|md|csv|diff|patch|log|html|css|js|mjs|cjs|jsx|ts|tsx|py|rs|go|java|cs|sh|ps1|pdf|png|jpe?g|webp|json)$/iu;
const privatePath = /(?:credential|secret|password|passwd|passkey|private[-_ ]?key|session[-_ ]?token|auth[-_ ]?(?:token|data|profile)|cookie|browser[-_ ]?history|keystore|node_modules|appdata)/iu;
const privateComponent = /^(?:auth|authorization|token|tokens|account|accounts|session|sessions|login|logins|logindata|history|web data|local state|preferences)(?:\.|$)/iu;

export class ProjectHubService {
  private readonly project: ReturnType<typeof requireProjectStore>;
  private readonly db: HubStore;

  constructor(directory: string, private readonly brain: GlobalBrain, private readonly now = Date.now) {
    this.project = requireProjectStore(directory, brain);
    this.db = new HubStore(this.project.root, this.project.projectId);
  }

  close(): void { this.db.close(); }

  private time(): string { return new Date(this.now()).toISOString(); }
  private row<T>(kind: Parameters<HubStore['get']>[0], id: string, scope?: string): T {
    return this.db.get<T>(kind, id, scope) ?? missing(kind === 'acknowledgements' ? 'Acknowledgement' : kind.slice(0, -1));
  }

  private run<T>(scope: string, actor: HubActor, input: { key: string }, apply: () => T): T {
    return this.db.transaction(() => this.db.operation(input.key, { scope, actor, input }, apply));
  }

  private operator(actor: HubActor): void {
    if (actor.kind !== 'user') throw new ProjectHubError('HUB_REVIEW_REQUIRED', 'This operation requires an explicit operator review.', 403);
  }

  private documentSummary({ pages, extraction, ...document }: DocumentRecord): HubDocument { return document; }

  overview() {
    return this.db.transaction(() => {
      const documents = this.db.list<DocumentRecord>('documents');
      for (const document of documents) {
        if (document.status === 'extracting' && document.extraction!.until <= this.now()) {
          document.status = 'failed';
          document.error = 'PDF extraction was interrupted. Upload the same file again to resume.';
          document.failures = [...(document.failures ?? []), { error: document.error, at: this.time() }].slice(-8);
          document.extraction = null;
          this.db.put('documents', document);
        }
      }
      return { schemaVersion: 1 as const, projectId: this.project.projectId, projectName: this.project.projectName, revision: this.db.revision(),
        documents: documents.map(document => this.documentSummary(document)).reverse(),
        rooms: this.db.list<HubRoom>('rooms').reverse(), lessons: this.db.list<HubLesson>('lessons').reverse(),
        ocr: 'unavailable' as const, limits: HUB_LIMITS };
    });
  }

  document(id: string): { document: HubDocument; pages: HubPage[] } {
    const record = this.row<DocumentRecord>('documents', hubInput(hubId, id));
    return { document: this.documentSummary(record), pages: record.pages };
  }

  async upload(name: string, data: Uint8Array) {
    if (!/^[^\\/:*?"<>|\u0000-\u001f\u007f]{1,110}\.pdf$/iu.test(name) || name.startsWith('.') || name !== name.trim()) {
      throw new ProjectHubError('HUB_INVALID_FILENAME', 'Use a PDF filename without any path components.', 400);
    }
    if (!data.length || data.length > HUB_LIMITS.pdfBytes) throw new ProjectHubError('HUB_UPLOAD_LIMIT', 'PDF upload exceeds the byte limit.', 413);
    const sha256 = digest(data);
    const extraction = this.db.transaction(() => {
      const documents = this.db.list<DocumentRecord>('documents');
      const existing = documents.find(document => document.sha256 === sha256);
      const now = this.now();
      if (existing && (existing.status === 'ready' || existing.status === 'needs-ocr' ||
          (existing.status === 'extracting' && existing.extraction!.until > now))) return { id: existing.id };
      if (documents.some(document => document.status === 'extracting' && document.extraction!.until > now)) {
        conflict('A PDF is already being extracted in this project. Retry once it finishes.');
      }
      if (!existing && documents.length >= HUB_LIMITS.documents) capped('This project has reached its PDF count limit.');
      const lease = { id: randomUUID(), until: now + HUB_LIMITS.extractionMs + 5000 };
      const failures = existing?.failures ?? [];
      if (existing?.status === 'extracting') failures.push({ error: 'PDF extraction was interrupted.', at: this.time() });
      const document: DocumentRecord = { id: existing?.id ?? randomUUID(), name: existing?.name ?? name, sha256,
        status: 'extracting', pageCount: 0, parser: PDF_PARSER, error: null, bytes: data.length,
        createdAt: existing?.createdAt ?? this.time(), pages: [], extraction: lease,
        attempts: (existing?.attempts ?? 0) + 1, failures: failures.slice(-8) };
      this.db.saveBlob('pdf:' + sha256, data);
      this.db.put('documents', document);
      return { id: document.id, leaseId: lease.id };
    });
    if (!extraction.leaseId) return this.document(extraction.id);
    const result = Buffer.from(data.subarray(0, 5)).toString('ascii') === '%PDF-'
      ? await extractHubPdf(data).catch(() => ({ error: 'The PDF extraction worker could not be started.' }))
      : { error: 'This file does not have a valid PDF header.' };
    this.db.transaction(() => {
      const document = this.row<DocumentRecord>('documents', extraction.id);
      if (document.extraction?.id !== extraction.leaseId) return;
      const pages: HubPage[] = 'pages' in result ? result.pages.map(page => ({ ...page, memoryId: null,
        status: page.text ? 'pending' : 'needs-ocr', citation: `${document.name} · sha256:${sha256} · p. ${page.page}` })) : [];
      this.db.put('documents', { ...document, extraction: null, pages, pageCount: pages.length,
        status: 'error' in result ? 'failed' : pages.some(page => page.text) ? 'ready' : 'needs-ocr',
        failures: 'error' in result ? [...document.failures, { error: result.error, at: this.time() }].slice(-8) : document.failures,
        error: 'error' in result ? result.error : null });
    });
    return this.document(extraction.id);
  }

  async reviewDocument(id: string, raw: unknown) {
    id = hubInput(hubId, id);
    const input = hubInput(reviewInput, raw);
    const pending = this.run('document:' + id, HUB_OPERATOR, input, () => {
      const document = this.row<DocumentRecord>('documents', id);
      const page = document.pages[input.page - 1] ?? missing('Page');
      if (page.status === 'needs-ocr') conflict('This page has no extracted text. Local OCR is unavailable.');
      if (input.decision === 'reject') {
        if (page.memoryId || page.status === 'approved') conflict('The page already has an approval. Archive its memory through memory review.');
        page.status = 'rejected';
      } else {
        if (page.status === 'rejected') conflict('This page was rejected. Upload a revised PDF for another review.');
        page.memoryId ??= randomUUID();
      }
      this.db.put('documents', document);
      return { name: document.name, sha256: document.sha256, page };
    });
    if (input.decision === 'approve') {
      const { page } = pending;
      await this.writeMemory(page.memoryId!, 'document-evidence', `${pending.name} · p. ${page.page}`, page.text,
        { origin: 'project-hub-document', untrustedEvidence: true, documentId: id, documentSha256: pending.sha256,
          page: page.page, sources: [page.citation] });
      this.db.transaction(() => {
        const document = this.row<DocumentRecord>('documents', id);
        document.pages[input.page - 1].status = 'approved';
        this.db.put('documents', document);
      });
    }
    return this.document(id);
  }

  private async writeMemory(id: string, category: string, title: string, content: string, metadata: Record<string, unknown>) {
    await this.brain.init();
    this.brain.refresh();
    if (this.brain.getStorageHealth().lastError) throw new ProjectHubError('HUB_MEMORY_UNAVAILABLE', 'Project memory is unavailable. Retry with the same operation key.', 503);
    this.brain.writeSync({ projectId: this.project.projectId, projectName: this.project.projectName, category,
      agentTool: 'user', content: title + '\n' + content, importance: 0.7, metadata: { ...metadata, title } }, id);
    await this.brain.sync();
  }

  private roomSnapshot(id: string, after: number) {
    return { room: this.row<HubRoom>('rooms', id), revision: this.db.revision(), tasks: this.db.list<HubTask>('tasks', id),
      messages: this.db.list<HubMessage>('messages', id), artifacts: this.db.list<HubArtifact>('artifacts', id),
      outcomes: this.db.list<HubOutcome>('outcomes', id), acknowledgements: this.db.list<HubAck>('acknowledgements', id),
      ...this.db.events(id, after) };
  }

  private expireLeases(id: string) {
    this.row<HubRoom>('rooms', id);
    const now = this.time();
    for (const task of this.db.list<HubTask>('tasks', id)) {
      if (task.status !== 'claimed' || !task.leaseUntil || task.leaseUntil > now) continue;
      const previous = task.owner!;
      this.reopen(task);
      this.db.event(id, 'task-lease-expired', task.id, previous, now);
    }
  }

  private reopen(task: HubTask) {
    this.db.put('tasks', { ...task, status: 'open', revision: task.revision + 1, owner: null, leaseUntil: null, artifactId: null }, task.roomId);
  }

  room(id: string, after = 0) {
    id = hubInput(hubId, id);
    if (!Number.isSafeInteger(after) || after < 0) throw new ProjectHubError('HUB_INVALID_CURSOR', 'Use a nonnegative event cursor.', 400);
    return this.db.transaction(() => { this.expireLeases(id); return this.roomSnapshot(id, after); });
  }

  createRoom(raw: unknown, by: HubActor) {
    const actor = hubInput(hubActor, by), input = hubInput(roomInput, raw);
    const id = this.run('room-create', actor, input, () => {
      if (this.db.count('rooms') >= HUB_LIMITS.rooms) capped('This project has reached its room limit.');
      const room = this.db.put('rooms', { id: randomUUID(), goal: input.goal, createdAt: this.time(), createdBy: actor });
      this.db.event(room.id, 'room-created', room.id, actor, room.createdAt);
      return room.id;
    });
    return this.room(id);
  }

  roomAction(id: string, raw: unknown, by: HubActor) {
    const applied = this.applyRoomCommand(id, raw, by);
    return { ...this.room(id), applied };
  }

  applyRoomCommand(id: string, raw: unknown, by: HubActor) {
    id = hubInput(hubId, id);
    const input = hubInput(roomActionInput, raw), actor = hubInput(hubActor, by);
    // Keep lease expiry committed even if the caller's subsequent revision check conflicts.
    this.db.transaction(() => this.expireLeases(id));
    return this.run('room:' + id, actor, input, () => this.applyRoomAction(id, input, actor));
  }

  roomFeed(id: string, after = 0) {
    id = hubInput(hubId, id);
    if (!Number.isSafeInteger(after) || after < 0) throw new ProjectHubError('HUB_INVALID_CURSOR', 'Use a nonnegative event cursor.', 400);
    return this.db.transaction(() => {
      this.expireLeases(id);
      const feed = this.db.events(id, after, 16);
      const targets = [...new Set(feed.events.map(event => event.targetId))];
      const rows = <T,>(kind: Parameters<HubStore['get']>[0]) => targets.flatMap(target => {
        const row = this.db.get<T>(kind, target, id);
        return row ? [row] : [];
      });
      return { room: this.row<HubRoom>('rooms', id), revision: this.db.revision(), tasks: rows<HubTask>('tasks'),
        messages: rows<HubMessage>('messages'), artifacts: rows<HubArtifact>('artifacts'), outcomes: rows<HubOutcome>('outcomes'),
        acknowledgements: rows<HubAck>('acknowledgements'), ...feed };
    });
  }

  private capacity(kind: Parameters<HubStore['count']>[0], id: string) {
    if (this.db.count(kind, id) >= HUB_LIMITS.roomRecords) capped('This room reached its retained ' + kind + ' limit.');
  }

  private applyRoomAction(id: string, input: RoomAction, actor: HubActor) {
    const createdAt = this.time();
    const publish = (kind: string, targetId: string, revision?: number) => {
      this.db.event(id, kind, targetId, actor, createdAt);
      return { kind, targetId, ...(revision !== undefined ? { revision } : {}) };
    };
    switch (input.kind) {
      case 'task': {
        this.capacity('tasks', id);
        const task: HubTask = { id: randomUUID(), roomId: id, title: input.title, status: 'open', revision: 0, owner: null, leaseUntil: null, artifactId: null };
        this.db.put('tasks', task, id);
        return publish('task-created', task.id, task.revision);
      }
      case 'claim':
      case 'renew':
      case 'release': {
        const task = this.row<HubTask>('tasks', input.taskId, id);
        if (task.revision !== input.revision) conflict('This task changed. Refresh to see its current revision and owner.');
        const active = task.status === 'claimed' && task.leaseUntil! > createdAt;
        if (input.kind === 'claim' ? task.status !== 'open' : !active || !sameActor(task.owner, actor)) {
          conflict('This task is unavailable or its lease belongs to another participant.');
        }
        if (input.kind === 'release') this.reopen(task);
        else this.db.put('tasks', { ...task, status: 'claimed', owner: actor, revision: task.revision + 1,
          leaseUntil: new Date(this.now() + HUB_LIMITS.leaseMs).toISOString() }, id);
        return publish({ claim: 'task-claimed', renew: 'task-renewed', release: 'task-released' }[input.kind], task.id, task.revision + 1);
      }
      case 'message': {
        this.capacity('messages', id);
        if (input.replyTo) this.row<HubMessage>('messages', input.replyTo, id);
        const message: HubMessage = { id: randomUUID(), roomId: id, type: input.type, text: input.text,
          replyTo: input.replyTo ?? null, author: actor, createdAt };
        this.db.put('messages', message, id);
        return publish('message-posted', message.id);
      }
      case 'artifact': {
        const task = this.row<HubTask>('tasks', input.taskId, id);
        this.capacity('artifacts', id);
        const path = input.path.replace(/\\/gu, '/');
        if (!artifactFile.test(path) || privatePath.test(path) || path.split('/').some(part => part.startsWith('.') || privateComponent.test(part))) {
          throw new ProjectHubError('HUB_UNSAFE_ARTIFACT', 'Choose an ordinary project source, report, or evidence file.', 400);
        }
        const data = readProjectFile(this.project.root, path, HUB_LIMITS.artifactBytes) ?? missing('Artifact file');
        const validOwner = task.status === 'claimed' && task.leaseUntil! > createdAt && task.revision === input.revision && sameActor(task.owner, actor);
        const versions = this.db.list<HubArtifact>('artifacts', id).filter(artifact => artifact.taskId === task.id);
        const artifact: HubArtifact = { id: randomUUID(), roomId: id, taskId: task.id, path, sha256: digest(data), bytes: data.length,
          version: versions.length + 1, status: validOwner ? 'submitted' : 'proposal', author: actor, createdAt };
        this.db.saveBlob('artifact:' + artifact.sha256, data);
        this.db.put('artifacts', artifact, id);
        if (validOwner) this.db.put('tasks', { ...task, artifactId: artifact.id, revision: task.revision + 1 }, id);
        return publish(validOwner ? 'artifact-submitted' : 'artifact-proposed', artifact.id, validOwner ? task.revision + 1 : undefined);
      }
      case 'accept': {
        this.operator(actor);
        const artifact = this.row<HubArtifact>('artifacts', input.artifactId, id);
        const task = this.row<HubTask>('tasks', artifact.taskId, id);
        if (artifact.status === 'accepted') return { kind: 'artifact-accepted', targetId: artifact.id, revision: task.revision };
        if (artifact.status !== 'submitted' || task.artifactId !== artifact.id || task.status !== 'claimed' || task.leaseUntil! <= createdAt) {
          conflict('Only the active task owner’s latest submitted artifact can be accepted.');
        }
        this.db.put('artifacts', { ...artifact, status: 'accepted' }, id);
        this.db.put('tasks', { ...task, status: 'completed', leaseUntil: null, revision: task.revision + 1 }, id);
        return publish('artifact-accepted', artifact.id, task.revision + 1);
      }
      case 'ack': {
        this.capacity('acknowledgements', id);
        const target = input.targetType === 'artifact' ? this.row<HubArtifact>('artifacts', input.targetId, id) : this.row<HubMessage>('messages', input.targetId, id);
        const sha256 = 'sha256' in target ? target.sha256 : null;
        if (input.sha256 !== undefined && input.sha256 !== sha256) conflict('The reported digest differs from the attached artifact.');
        if (sameActor(target.author, actor)) conflict('Acknowledge a message or artifact from another participant.');
        const prior = this.db.list<HubAck>('acknowledgements', id).find(ack => ack.targetId === target.id && sameActor(ack.author, actor));
        if (prior) return { kind: 'acknowledged', targetId: prior.id };
        const ack: HubAck = { id: randomUUID(), roomId: id, targetType: input.targetType, targetId: input.targetId,
          sha256, author: actor, createdAt };
        this.db.put('acknowledgements', ack, id);
        return publish('acknowledged', ack.id);
      }
      case 'outcome': {
        const task = this.row<HubTask>('tasks', input.taskId, id);
        this.capacity('outcomes', id);
        const artifact = input.artifactId ? this.row<HubArtifact>('artifacts', input.artifactId, id) : null;
        if (artifact && artifact.taskId !== task.id) conflict('This artifact belongs to a different task.');
        const outcome: HubOutcome = { id: randomUUID(), roomId: id, taskId: task.id, artifactId: artifact?.id ?? null,
          result: input.result, check: input.check, evidence: input.evidence, provenance: actor.kind === 'agent' ? 'agent-report' : 'user-report', author: actor, createdAt };
        this.db.put('outcomes', outcome, id);
        return publish('outcome-reported', outcome.id);
      }
    }
  }

  artifact(roomId: string, artifactId: string) {
    const artifact = this.row<HubArtifact>('artifacts', hubInput(hubId, artifactId), hubInput(hubId, roomId));
    const bytes = this.db.blob('artifact:' + artifact.sha256) ?? missing('Artifact bytes');
    if (digest(bytes) !== artifact.sha256) throw new ProjectHubError('HUB_ARTIFACT_CORRUPT', 'Artifact bytes do not match their recorded digest.', 409);
    return { artifact, bytes };
  }

  createLesson(raw: unknown, by: HubActor) {
    const input = hubInput(lessonInput, raw), actor = hubInput(hubActor, by);
    const id = this.run('lesson-create', actor, input, () => {
      const outcome = this.row<HubOutcome>('outcomes', input.outcomeId);
      if (this.db.count('lessons') >= HUB_LIMITS.lessons) capped('This project has reached its lesson limit.');
      const lesson: HubLesson = { id: randomUUID(), outcomeId: outcome.id, title: input.title, text: input.text,
        status: 'candidate', evaluation: null, memoryId: null, createdAt: this.time(), author: actor };
      return this.db.put('lessons', lesson).id;
    });
    return { lesson: this.row<HubLesson>('lessons', id) };
  }

  async lessonAction(id: string, raw: unknown, by: HubActor) {
    id = hubInput(hubId, id);
    const input: LessonAction = hubInput(lessonActionInput, raw), actor = hubInput(hubActor, by);
    this.operator(actor);
    const pending = this.run('lesson:' + id, actor, input, () => {
      const lesson = this.row<HubLesson>('lessons', id);
      if (input.kind === 'evaluate') {
        if (lesson.memoryId) conflict('A lesson whose promotion has started cannot be reevaluated. Create another candidate.');
        lesson.status = 'evaluated';
        lesson.evaluation = { baseline: input.baseline, candidate: input.candidate, control: input.control,
          evidence: input.evidence, provenance: 'user-report', method: 'operator-reported-comparison', createdAt: this.time() };
      } else if (input.kind === 'promote') {
        const evaluation = lesson.evaluation;
        if (!evaluation || evaluation.baseline || !evaluation.candidate || !evaluation.control || lesson.status === 'rolled-back') {
          conflict('Promotion requires a reviewed baseline failure, candidate success, and passing control comparison.');
        }
        lesson.memoryId ??= randomUUID();
      } else if (lesson.status !== 'promoted' && lesson.status !== 'rolled-back') {
        conflict('Only a promoted lesson can be rolled back.');
      }
      this.db.put('lessons', lesson);
      return lesson;
    });
    if (input.kind === 'promote' && this.row<HubLesson>('lessons', id).status !== 'rolled-back') {
      await this.writeMemory(pending.memoryId!, 'reviewed-lesson', pending.title, pending.text,
        { origin: 'project-hub-lesson', lessonId: id, outcomeId: pending.outcomeId,
          evaluationMethod: 'operator-reported-comparison', sources: ['Project hub lesson ' + id, 'Reported outcome ' + pending.outcomeId] });
      this.db.transaction(() => {
        const lesson = this.row<HubLesson>('lessons', id);
        if (lesson.status === 'evaluated') this.db.put('lessons', { ...lesson, status: 'promoted' });
      });
    }
    if (input.kind === 'rollback' && this.row<HubLesson>('lessons', id).status !== 'rolled-back') {
      await this.brain.init();
      this.brain.refresh();
      const annotations = memoryAnnotationsFor(this.brain);
      if (memoryState(annotations.get(), this.project.projectId, pending.memoryId!) !== 'archived') {
        await annotations.update({ kind: 'review', projectId: this.project.projectId, memoryId: pending.memoryId!,
          state: 'archived', note: 'Project hub lesson promotion rolled back.' });
      }
      this.db.transaction(() => this.db.put('lessons', { ...this.row<HubLesson>('lessons', id), status: 'rolled-back' }));
    }
    return { lesson: this.row<HubLesson>('lessons', id) };
  }
}
