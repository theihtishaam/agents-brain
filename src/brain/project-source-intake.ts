import { randomUUID } from 'node:crypto';
import { lstatSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { GlobalBrain } from './global-brain.js';
import { requireProjectStore } from './project-memory.js';
import { ensureProjectDirectory, projectLocalPath } from './project-kit-paths.js';
import { digest, HubStore } from './project-hub-store.js';
import { ProjectHubError, type HubArtifact, type HubLesson, type HubOutcome, type HubPage } from './project-hub-contract.js';
import { SOURCE_LIMITS, type SourceImport, type SourceItem, type SourceKind, type SourceRole, type SourceReviewInput, type MemoryEvidenceResult, type ReviewedSessionTranscript, type SourceImportSummary } from './project-source-contract.js';

const bad = (message: string, status = 400): never => { throw new ProjectHubError('SOURCE_INVALID', message, status); };
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const forbidden = /^(?:__proto__|prototype|constructor|password|passwd|passkey|api[_-]?key|secret|secrets|credentials?|client[_-]?secret|private[_-]?key|token|id[_-]?token|auth[_-]?token|access[_-]?token|refresh[_-]?token|authorization|cookies?|session[_-]?token)$/iu;
const roles = new Set(['user', 'assistant', 'system', 'developer', 'tool']);
const field = (value: unknown, label: string, max: number, multiline = true): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max || controls.test(value) || (!multiline && /[\r\n\t]/u.test(value))) bad(`${label} must be nonempty, at most ${max} characters, and contain no control characters.`);
  return value as string;
};
function inspect(value: unknown, depth = 0): void {
  if (depth > 12) bad('JSON nesting exceeds 12 levels.');
  if (Array.isArray(value)) { value.forEach(x => inspect(x, depth + 1)); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key)) bad('JSON contains a prohibited credential-shaped or prototype field.');
    inspect(item, depth + 1);
  }
}
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad(`${label} must be an object.`);
  const obj = value as Record<string, unknown>;
  if (Object.keys(obj).some(k => !allowed.includes(k))) bad(`${label} contains unsupported fields.`);
  return obj;
}
function suggest(text: string): { title: string; category: string } {
  const first = text.split(/\r\n|\n|\r/u).find(line => line.trim())?.trim().replace(/^#{1,6}\s+/u, '') ?? 'Source section';
  const category = /\b(?:must|should|requirement|constraint)\b/iu.test(text) ? 'requirement' : /\b(?:plan|step|todo|next)\b/iu.test(text) ? 'plan' : 'knowledge';
  return { title: first.length > 150 ? first.slice(0, 147) + '...' : first, category };
}
function parse(name: string, bytes: Uint8Array): { kind: SourceKind; title: string; items: SourceItem[] } {
  if (!/^[^\\/:*?"<>|\u0000-\u001f\u007f]{1,110}\.(?:json|txt|md|markdown)$/iu.test(name) || name.startsWith('.') || name !== name.trim()) bad('Use an ordinary .json, .txt, .md or .markdown filename without path components.');
  if (!bytes.length || bytes.length > SOURCE_LIMITS.bytes) bad('Source must be between 1 byte and 1 MiB.', 413);
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return bad('Source must be valid UTF-8.'); }
  if (controls.test(content)) bad('Source contains unsupported control characters.');
  let kind: SourceKind, title = name, items: SourceItem[] = [];
  if (/\.json$/iu.test(name)) {
    let value: unknown; try { value = JSON.parse(content); } catch { return bad('Malformed JSON.'); }
    inspect(value);
    let records: unknown[], transcript = false, topLevelArray = false;
    if (Array.isArray(value)) { records = value; transcript = true; topLevelArray = true; }
    else {
      const root = object(value, ['schemaVersion', 'kind', 'title', 'records', 'messages'], 'JSON root');
      if (root.kind === 'knowledge' && root.schemaVersion === 1 && Array.isArray(root.records) && root.messages === undefined) records = root.records;
      else if (root.kind === 'transcript' && root.schemaVersion === 1 && Array.isArray(root.messages) && root.records === undefined) { records = root.messages; transcript = true; }
      else if (Object.keys(root).length === 1 && Array.isArray(root.messages)) { records = root.messages; transcript = true; }
      else return bad('Unsupported JSON shape. Use knowledge JSON or a simple transcript.');
      if (root.title !== undefined) title = field(root.title, 'Title', 150, false);
      else if (root.kind !== undefined) bad('Versioned JSON requires a title.');
    }
    if (!records.length || records.length > SOURCE_LIMITS.items) bad('Source must contain 1 to 500 records.');
    kind = transcript ? 'transcript-json' : 'knowledge-json';
    items = records.map((raw, index) => {
      const row = object(raw, transcript ? ['role', 'content'] : ['title', 'content', 'source'], `Record ${index + 1}`);
      const text = field(row.content, `Record ${index + 1} content`, SOURCE_LIMITS.itemChars);
      const locator = topLevelArray ? `/${index}` : `/${transcript ? 'messages' : 'records'}/${index}`;
      if (transcript) {
        if (typeof row.role !== 'string' || !roles.has(row.role)) bad(`Message ${index + 1} has an unsupported role.`);
        return { id: locator, title: `${row.role} message ${index + 1}`, text, category: 'transcript-evidence', role: row.role as SourceRole, status: 'pending', memoryId: null };
      }
      return { id: locator, title: field(row.title, `Record ${index + 1} title`, 150, false), text, category: 'knowledge',
        ...(row.source === undefined ? {} : { source: field(row.source, 'Source label', 500, false) }), status: 'pending', memoryId: null };
    });
  } else {
    kind = /\.txt$/iu.test(name) ? 'text' : 'markdown';
    // Paragraphs retain their exact nonblank lines and their original line numbers.
    const lines = content.match(/[^\r\n]*(?:\r\n|\r|\n|$)/gu)?.filter(Boolean) ?? [];
    let start = -1, buffer = '';
    const flush = (end: number) => {
      if (start < 0) return;
      const text = buffer.replace(/(?:\r\n|\r|\n)$/u, '');
      field(text, `Lines ${start + 1}-${end}`, SOURCE_LIMITS.itemChars);
      const suggestion = suggest(text);
      items.push({ id: `lines:${start + 1}-${end}`, ...suggestion, text, status: 'pending', memoryId: null });
      start = -1; buffer = '';
    };
    lines.forEach((line, i) => { if (!line.trim()) flush(i); else { if (start < 0) start = i; buffer += line; } });
    flush(lines.length);
    if (!items.length || items.length > SOURCE_LIMITS.items) bad('Text must contain 1 to 500 paragraphs or sections.');
  }
  if (items.reduce((n, item) => n + item.text.length, 0) > SOURCE_LIMITS.extractedChars) bad('Extracted text exceeds 180,000 characters.');
  return { kind, title, items };
}

export class ProjectSourceIntake {
  private readonly project: ReturnType<typeof requireProjectStore>;
  private database?: DatabaseSync;
  constructor(directory: string, private readonly brain: GlobalBrain, private readonly now = Date.now) { this.project = requireProjectStore(directory, brain); }
  close(): void { this.database?.close(); this.database = undefined; }
  private db(): DatabaseSync {
    ensureProjectDirectory(this.project.root, '.shadow-brain');
    const relative = '.shadow-brain/project-sources.sqlite';
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const filename = projectLocalPath(this.project.root, relative + suffix), info = lstatSync(filename, { throwIfNoEntry: false });
      if (info && (!info.isFile() || info.nlink !== 1)) throw new ProjectHubError('SOURCE_UNSAFE_STORE', 'Source storage requires ordinary unlinked files.', 409);
    }
    if (this.database) return this.database;
    // Validate any existing store read-only before issuing schema or write statements.
    const filename = projectLocalPath(this.project.root, relative);
    if (lstatSync(filename, { throwIfNoEntry: false })) this.read(() => undefined, () => undefined);
    const db = new DatabaseSync(filename, { allowExtension: false });
    try {
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS metadata (project_id TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, sha256 TEXT NOT NULL UNIQUE, data TEXT NOT NULL, bytes BLOB NOT NULL) STRICT; CREATE TABLE IF NOT EXISTS operations (key TEXT PRIMARY KEY, hash TEXT NOT NULL) STRICT;');
      db.prepare('INSERT INTO metadata SELECT ?,1 WHERE NOT EXISTS(SELECT 1 FROM metadata)').run(this.project.projectId);
      const rows = db.prepare('SELECT project_id,version FROM metadata LIMIT 2').all();
      if (rows.length !== 1 || rows[0].project_id !== this.project.projectId || rows[0].version !== 1) throw new Error('Source store belongs to another project or version.');
      this.database = db; return db;
    } catch (error) { db.close(); throw error; }
  }
  /** Read existing storage without creating a project directory or modifying a damaged database. */
  private read<T>(fn: (db: DatabaseSync) => T, absent: () => T): T {
    if (this.database) return fn(this.database);
    const relative = '.shadow-brain/project-sources.sqlite';
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      const path = projectLocalPath(this.project.root, relative + suffix);
      const info = lstatSync(path, { throwIfNoEntry: false });
      if (info && (!info.isFile() || info.nlink !== 1)) throw new ProjectHubError('SOURCE_UNSAFE_STORE', 'Source storage requires ordinary unlinked files.', 409);
    }
    const filename = projectLocalPath(this.project.root, relative);
    if (!lstatSync(filename, { throwIfNoEntry: false })) return absent();
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(filename, { readOnly: true, allowExtension: false });
      db.exec('PRAGMA busy_timeout=3000; PRAGMA trusted_schema=OFF;');
      const rows = db.prepare('SELECT project_id,version FROM metadata LIMIT 2').all();
      if (rows.length !== 1 || rows[0].project_id !== this.project.projectId || rows[0].version !== 1) throw new Error('Invalid source store scope.');
      db.prepare('SELECT id,sha256,data,bytes FROM sources LIMIT 0').all();
      db.prepare('SELECT key,hash FROM operations LIMIT 0').all();
      return fn(db);
    } finally { db?.close(); }
  }
  private transaction<T>(fn: (db: DatabaseSync) => T): T {
    const db = this.db(); db.exec('BEGIN IMMEDIATE');
    try { const result = fn(db); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  private row(db: DatabaseSync, id: string): SourceImport {
    const value = db.prepare('SELECT data FROM sources WHERE id=?').get(id)?.data;
    if (typeof value !== 'string') throw new ProjectHubError('SOURCE_NOT_FOUND', 'Source was not found in this project.', 404);
    return JSON.parse(value) as SourceImport;
  }
  previewImport(name: string, bytes: Uint8Array): SourceImport {
    const extracted = parse(name, bytes), sha256 = digest(bytes);
    return this.transaction(db => {
      const existing = db.prepare('SELECT data FROM sources WHERE sha256=?').get(sha256)?.data;
      if (typeof existing === 'string') return JSON.parse(existing) as SourceImport;
      if (Number(db.prepare('SELECT count(*) AS n FROM sources').get()?.n) >= SOURCE_LIMITS.sources) bad('Project source limit reached.', 422);
      const record: SourceImport = { id: randomUUID(), projectId: this.project.projectId, name, sha256, bytes: bytes.length, parser: 'deterministic-source-v1', createdAt: new Date(this.now()).toISOString(), ...extracted };
      db.prepare('INSERT INTO sources VALUES(?,?,?,?)').run(record.id, sha256, JSON.stringify(record), bytes); return record;
    });
  }
  /** The operator explicitly saves a short note. Originals and retry identities stay intact. */
  async rememberText(text: unknown): Promise<SourceImport> {
    const note = field(text, 'Note (use Review first for longer notes)', SOURCE_LIMITS.itemChars);
    const bytes = Buffer.from(note, 'utf8');
    if (parse('My-note.txt', bytes).items.length > 20) bad('Use Review first for notes with more than 20 paragraphs.');
    let source = this.previewImport('My-note.txt', bytes);
    if (!['text', 'markdown'].includes(source.kind)) throw new ProjectHubError('SOURCE_CONFLICT', 'This text was already imported in another format. Open its existing source review.', 409);
    if (source.items.some(item => item.status === 'rejected')) throw new ProjectHubError('SOURCE_CONFLICT', 'These notes contain previously skipped parts. Open the source review to inspect the saved decisions.', 409);
    for (const item of source.items) {
      if (item.status === 'approved') continue;
      source = await this.reviewImportItem(source.id, item.id, {
        decision: 'approve', key: 'remember_' + digest(JSON.stringify([source.sha256, item.id])),
        ...(item.approved ?? {}),
      });
    }
    return source;
  }
  getImport(sourceId: string): SourceImport { return this.read(db => this.row(db, sourceId), () => { throw new ProjectHubError('SOURCE_NOT_FOUND', 'Source was not found in this project.', 404); }); }
  listImports(): SourceImport[] { return this.read(db => db.prepare('SELECT data FROM sources ORDER BY rowid DESC').all().map(row => JSON.parse(row.data as string) as SourceImport), () => []); }
  listImportSummaries(): SourceImportSummary[] {
    return this.read(db => db.prepare(`SELECT id, sha256, json_extract(data, '$.name') AS name,
      json_extract(data, '$.title') AS title, json_extract(data, '$.kind') AS kind,
      json_extract(data, '$.bytes') AS bytes, json_extract(data, '$.createdAt') AS createdAt,
      json_array_length(data, '$.items') AS itemCount,
      (SELECT count(*) FROM json_each(sources.data, '$.items') WHERE json_extract(value, '$.status')='approved') AS approvedCount,
      (SELECT count(*) FROM json_each(sources.data, '$.items') WHERE json_extract(value, '$.status')='pending') AS pendingCount,
      (SELECT count(*) FROM json_each(sources.data, '$.items') WHERE json_extract(value, '$.status')='rejected') AS rejectedCount
      FROM sources ORDER BY rowid DESC LIMIT 200`).all() as unknown as SourceImportSummary[], () => []);
  }

  /** Export only reviewed transcript material for an explicit session-history import. */
  sessionTranscript(sourceId: string): ReviewedSessionTranscript {
    const row = this.read(db => db.prepare('SELECT data,bytes FROM sources WHERE id=?').get(sourceId), () => undefined);
    if (!row) throw new ProjectHubError('SOURCE_NOT_FOUND', 'Source was not found in this project.', 404);
    const record = JSON.parse(row.data as string) as SourceImport, bytes = row.bytes as Uint8Array;
    if (record.projectId !== this.project.projectId || record.id !== sourceId || record.kind !== 'transcript-json') bad('Choose a reviewed transcript source.');
    if (digest(bytes) !== record.sha256) throw new ProjectHubError('SOURCE_MISMATCH', 'Stored source bytes do not match their digest.', 409);
    const original = parse(record.name, bytes);
    if (original.kind !== record.kind) throw new ProjectHubError('SOURCE_MISMATCH', 'Stored transcript does not match its source.', 409);
    const selected = record.items.filter(item => item.status === 'approved');
    if (!selected.length) bad('Approve at least one transcript message before importing.');
    if (!lstatSync(this.project.storagePath, { throwIfNoEntry: false })) throw new ProjectHubError('SOURCE_MEMORY_UNAVAILABLE', 'Project memory is unavailable; reviewed messages cannot be verified.', 503);
    this.brain.refresh();
    if (this.brain.getStorageHealth().lastError) throw new ProjectHubError('SOURCE_MEMORY_UNAVAILABLE', 'Project memory is unavailable; reviewed messages cannot be verified.', 503);
    const originals = new Map(original.items.map(item => [item.id, item]));
    const items = selected.map(item => {
      const source = originals.get(item.id);
      if (!source || !item.approved || !item.memoryId || !item.role || source.role !== item.role || source.text !== item.text || source.title !== item.title) {
        throw new ProjectHubError('SOURCE_MISMATCH', 'Reviewed transcript no longer matches its original source.', 409);
      }
      const memory = this.brain.getEntry(item.memoryId), metadata = memory?.metadata;
      if (!memory || memory.projectId !== this.project.projectId || memory.content !== item.approved.title + '\n' + item.approved.text || metadata?.origin !== 'project-source-import' || metadata.sourceId !== record.id || metadata.sourceSha256 !== record.sha256 || metadata.sourceKind !== record.kind || metadata.sourceLocator !== item.id || metadata.sourceRole !== item.role) {
        throw new ProjectHubError('SOURCE_MISMATCH', 'A reviewed transcript memory could not be verified.', 409);
      }
      return { id: item.id, locator: item.id, role: item.role === 'user' || item.role === 'assistant' ? item.role : 'note' as const,
        originalRole: item.role, text: item.approved.text };
    });
    return { id: record.id, name: record.title, items };
  }
  async reviewImportItem(sourceId: string, itemId: string, input: SourceReviewInput): Promise<SourceImport> {
    if (!input || !['approve', 'reject'].includes(input.decision) || !/^[A-Za-z0-9_-]{12,100}$/u.test(input.key) || Object.keys(input).some(k => !['decision', 'key', 'title', 'text', 'category'].includes(k))) bad('Invalid review decision or operation key.');
    if (input.decision === 'reject' && (input.title !== undefined || input.text !== undefined || input.category !== undefined)) bad('Edits apply only to approval.');
    const pending = this.transaction(db => {
      const hash = digest(JSON.stringify({ sourceId, itemId, input }));
      const previous = db.prepare('SELECT hash FROM operations WHERE key=?').get(input.key);
      if (previous && previous.hash !== hash) throw new ProjectHubError('SOURCE_CONFLICT', 'Operation key already used with another request.', 409);
      const record = this.row(db, sourceId), item = record.items.find(x => x.id === itemId);
      if (!item) throw new ProjectHubError('SOURCE_NOT_FOUND', 'Source item was not found.', 404);
      if (input.decision === 'reject') {
        if (item.memoryId) throw new ProjectHubError('SOURCE_CONFLICT', 'This item already has an approval.', 409);
        item.status = 'rejected';
      } else {
        if (item.status === 'rejected') throw new ProjectHubError('SOURCE_CONFLICT', 'This item was rejected.', 409);
        const approved = { title: field(input.title ?? item.title, 'Approved title', 150, false), text: field(input.text ?? item.text, 'Approved text', SOURCE_LIMITS.itemChars), category: field(input.category ?? item.category, 'Category', 64, false) };
        if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/u.test(approved.category)) bad('Category must use plain letters, numbers, spaces, dots, hyphens or underscores.');
        if (item.approved && JSON.stringify(item.approved) !== JSON.stringify(approved)) throw new ProjectHubError('SOURCE_CONFLICT', 'This item has already been approved with different text.', 409);
        item.memoryId ??= randomUUID(); item.approved = approved;
      }
      if (!previous) {
        if (Number(db.prepare('SELECT count(*) AS n FROM operations').get()?.n) >= SOURCE_LIMITS.operations) bad('Source review operation limit reached.', 422);
        db.prepare('INSERT INTO operations VALUES(?,?)').run(input.key, hash);
      }
      db.prepare('UPDATE sources SET data=? WHERE id=?').run(JSON.stringify(record), sourceId);
      return { record, item };
    });
    if (input.decision === 'approve') {
      const { record, item } = pending, approved = item.approved!;
      await this.brain.init(); this.brain.refresh();
      if (this.brain.getStorageHealth().lastError) throw new ProjectHubError('SOURCE_MEMORY_UNAVAILABLE', 'Project memory unavailable; retry with the same key.', 503);
      this.brain.writeSync({ projectId: this.project.projectId, projectName: this.project.projectName, category: approved.category, agentTool: 'user', content: approved.title + '\n' + approved.text, importance: 0.7,
        metadata: { origin: 'project-source-import', sourceId, sourceSha256: record.sha256, sourceKind: record.kind, sourceLocator: item.id, untrustedEvidence: true, title: approved.title, ...(item.role ? { sourceRole: item.role } : {}), sources: [`${record.name} · sha256:${record.sha256} · ${item.id}`, ...(item.source ? [item.source] : [])] } }, item.memoryId!);
      await this.brain.sync();
      this.transaction(db => { const latest = this.row(db, sourceId), current = latest.items.find(x => x.id === itemId)!; current.status = 'approved'; db.prepare('UPDATE sources SET data=? WHERE id=?').run(JSON.stringify(latest), sourceId); });
    }
    return this.getImport(sourceId);
  }
  resolveMemoryEvidence(memoryId: string): MemoryEvidenceResult {
    const base: MemoryEvidenceResult = { memoryId, projectId: this.project.projectId, state: 'missing', references: [] };
    // A read on a new or removed store must not create it or expose stale in-process entries.
    if (!lstatSync(this.project.storagePath, { throwIfNoEntry: false })) return base;
    this.brain.refresh();
    if (this.brain.getStorageHealth().lastError) throw new ProjectHubError('SOURCE_MEMORY_UNAVAILABLE', 'Project memory is unavailable; source evidence cannot be verified.', 503);
    const memory = this.brain.getEntry(memoryId);
    if (!memory || memory.projectId !== this.project.projectId) return base;
    const meta = memory.metadata ?? {}, references = Array.isArray(meta.sources) ? meta.sources.filter((x): x is string => typeof x === 'string').slice(0, 10).map(x => x.slice(0, 500)) : [];
    base.references = references; base.state = references.length ? 'reference-only' : 'missing';
    const bounded = (text: string) => ({ text: text.slice(0, 8000), truncated: text.length > 8000 });
    if (meta.origin === 'project-source-import') {
      base.state = 'mismatch';
      if (typeof meta.sourceId !== 'string' || typeof meta.sourceLocator !== 'string') return base;
      const row = this.read(db => db.prepare('SELECT data,bytes FROM sources WHERE id=?').get(meta.sourceId as string), () => undefined);
      if (!row) { base.state = 'missing'; return base; }
      const record = JSON.parse(row.data as string) as SourceImport, bytes = row.bytes as Uint8Array;
      if (record.projectId !== this.project.projectId || digest(bytes) !== record.sha256 || meta.sourceSha256 !== record.sha256 || meta.sourceKind !== record.kind) return base;
      const item = record.items.find(x => x.id === meta.sourceLocator);
      if (!item || item.memoryId !== memoryId || item.status !== 'approved' || !item.approved || memory.content !== item.approved.title + '\n' + item.approved.text) return base;
      let original: SourceItem | undefined;
      try { original = parse(record.name, bytes).items.find(x => x.id === item.id); } catch { return base; }
      if (!original || original.text !== item.text || original.title !== item.title || original.role !== item.role) return base;
      base.state = 'resolved'; base.evidence = { kind: record.kind === 'transcript-json' ? 'transcript-message' : record.kind === 'knowledge-json' ? 'json-item' : 'text-section', title: item.title, ...bounded(item.text), sourceId: record.id, sha256: record.sha256, locator: item.id, ...(item.role ? { role: item.role } : {}), approvedText: item.approved.text, approvedTitle: item.approved.title, category: item.approved.category };
      return base;
    }
    if (meta.origin === 'project-hub-document' || meta.origin === 'project-hub-lesson') {
      base.state = 'mismatch';
      const hubPath = projectLocalPath(this.project.root, '.shadow-brain/project-hub.sqlite');
      if (!lstatSync(hubPath, { throwIfNoEntry: false })) { base.state = 'missing'; return base; }
      const hub = new HubStore(this.project.root, this.project.projectId);
      try {
        hub.checkStorage();
        if (meta.origin === 'project-hub-document') {
          if (typeof meta.documentId !== 'string' || typeof meta.page !== 'number') return base;
          const doc = hub.get<{ id: string; name: string; sha256: string; pages: HubPage[] }>('documents', meta.documentId);
          if (!doc) { base.state = 'missing'; return base; }
          const page = doc.pages.find(x => x.page === meta.page), bytes = hub.blob('pdf:' + doc.sha256);
          if (!page || !bytes || digest(bytes) !== doc.sha256 || doc.sha256 !== meta.documentSha256 || page.memoryId !== memoryId || page.status !== 'approved' || memory.content !== `${doc.name} · p. ${page.page}\n${page.text}`) return base;
          base.state = 'resolved'; base.evidence = { kind: 'pdf-page', title: doc.name, ...bounded(page.text), truncated: page.truncated || page.text.length > 8000, sourceId: doc.id, sha256: doc.sha256, page: page.page }; return base;
        }
        if (typeof meta.lessonId !== 'string' || typeof meta.outcomeId !== 'string') return base;
        const lesson = hub.get<HubLesson>('lessons', meta.lessonId), outcome = hub.get<HubOutcome>('outcomes', meta.outcomeId);
        if (!lesson || !outcome) { base.state = 'missing'; return base; }
        if (lesson.memoryId !== memoryId || lesson.outcomeId !== outcome.id || memory.content !== lesson.title + '\n' + lesson.text || !['promoted', 'rolled-back'].includes(lesson.status)) return base;
        let artifact: HubArtifact | undefined;
        if (outcome.artifactId) {
          artifact = hub.get<HubArtifact>('artifacts', outcome.artifactId, outcome.roomId);
          if (!artifact) { base.state = 'missing'; return base; }
          const bytes = hub.blob('artifact:' + artifact.sha256);
          if (!bytes || digest(bytes) !== artifact.sha256 || artifact.taskId !== outcome.taskId) return base;
        }
        base.state = 'resolved'; base.evidence = { kind: 'lesson-outcome', title: lesson.title, ...bounded(lesson.text), sourceId: lesson.id, outcomeId: outcome.id, roomId: outcome.roomId, ...(artifact ? { artifactId: artifact.id, artifactSha256: artifact.sha256 } : {}), reported: true,
          outcome: { result: outcome.result, check: outcome.check.slice(0, 240), evidence: outcome.evidence.slice(0, 3000), provenance: outcome.provenance },
          ...(lesson.evaluation ? { evaluation: { baseline: lesson.evaluation.baseline, candidate: lesson.evaluation.candidate, control: lesson.evaluation.control, evidence: lesson.evaluation.evidence.slice(0, 4000), provenance: lesson.evaluation.provenance, method: lesson.evaluation.method } } : {}) }; return base;
      } finally { hub.close(); }
    }
    return base;
  }
}
