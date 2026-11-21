import { randomUUID } from 'node:crypto';
import { NativeCodexError, type NativeCodexConnection, type NativeCodexMessage } from './native-codex.js';
import { NATIVE_SESSION_BYTES } from './native-session-import.js';
import { digest, HubStore } from './project-hub-store.js';
import { SESSION_LIMITS, SESSION_OPERATOR, type SessionMessage, type SessionRecord } from './project-session-contract.js';

export const CODEX_ARCHIVE_LIMITS = Object.freeze({ pagesPerCheck: 4, textSections: SESSION_LIMITS.messages, bytes: NATIVE_SESSION_BYTES });
type Page = Awaited<ReturnType<NativeCodexConnection['read']>>;
type ArchiveRecord = SessionRecord & { native: NonNullable<SessionRecord['native']> & {
  archive: { initialTitle: string | null; olderHistoryOutsideArchive: boolean; sections: number; bytes: number };
} };
type ArchiveText = Pick<NativeCodexMessage, 'id' | 'locator' | 'role' | 'text'>;
const gap = () => new NativeCodexError('CODEX_ARCHIVE_GAP', 'Capture stopped because the saved text boundary was changed or could not be verified. Previously saved text is intact.', 409);
const capacity = () => new NativeCodexError('CODEX_ARCHIVE_LIMIT', 'The conversation archive reached its retention limit. Previously saved text is intact.', 422);
const changed = () => new NativeCodexError('CODEX_ARCHIVE_CHANGED', 'The native conversation changed during the check. Review the latest page before resuming capture.', 409);
const scope = (threadId: string) => 'native-follow:' + digest(threadId);

function checkPage(page: Page) {
  if (page.thread.archived || !page.thread.updatedAt) {
    throw new NativeCodexError('CODEX_ARCHIVE_SOURCE', 'Capture requires a current Codex conversation with indexed update metadata.', 409);
  }
  if (page.invalidText > 0 || page.pageCoverage.capacityOmittedInPage) {
    throw new NativeCodexError('CODEX_ARCHIVE_PARTIAL', 'This native history page has visible text the connector could not retain exactly.', 422);
  }
  if (new Set(page.messages.map(message => message.id)).size !== page.messages.length ||
      new Set(page.messages.map(message => message.locator)).size !== page.messages.length) throw gap();
}

/** Append an explicitly selected native chat into one ordinary paged project session. */
export class NativeCodexArchive {
  private readonly db: HubStore;
  constructor(root: string, projectId: string) { this.db = new HubStore(root, projectId); }

  private record(threadId: string) { return this.db.findByScope<ArchiveRecord>('sessions', scope(threadId)); }

  private stored(threadId: string) {
    return this.db.read(() => {
      const row = this.record(threadId);
      if (!row) return undefined;
      const messages = this.db.list<SessionMessage>('session-messages', row.id).map(message => ({ role: message.role, ...message.native }));
      if (messages.length !== row.native.archive.sections || messages.length < 1 || messages.length > CODEX_ARCHIVE_LIMITS.textSections ||
          messages.some(message => !message.id || !message.locator || !message.sha256)) throw gap();
      return { row, messages };
    });
  }

  private describe(row: ArchiveRecord, added: number) {
    const { olderHistoryOutsideArchive, sections, bytes } = row.native.archive;
    return { archiveId: row.id, revision: row.revision, olderHistoryOutsideArchive, sections, bytes,
      added, lastSavedAt: row.updatedAt, limits: CODEX_ARCHIVE_LIMITS };
  }

  private commit(head: Page, before: ArchiveRecord | undefined, delta: readonly ArchiveText[], guard: () => void) {
    try {
      return this.db.transaction(() => {
        guard();
        const current = this.record(head.thread.id);
        if (current?.id !== before?.id || current?.revision !== before?.revision) throw changed();
        if (!current && this.db.count('sessions') >= SESSION_LIMITS.sessions) throw capacity();
        const bytes = (before?.native.archive.bytes ?? 0) + delta.reduce((total, message) => total + Buffer.byteLength(message.text), 0);
        const sections = (before?.native.archive.sections ?? 0) + delta.length;
        if (bytes > CODEX_ARCHIVE_LIMITS.bytes || sections > CODEX_ARCHIVE_LIMITS.textSections) throw capacity();
        const at = head.observedAt;
        const { id: threadId, name, cwd, sessionId, createdAt, updatedAt, parentThreadId } = head.thread;
        const actor = SESSION_OPERATOR;
        const id = before?.id ?? randomUUID();
        const archive = { initialTitle: before ? before.native.archive.initialTitle : name,
          olderHistoryOutsideArchive: before?.native.archive.olderHistoryOutsideArchive ?? !!head.nextCursor, sections, bytes };
        const messageRefs = delta.map(message => [message.id, message.locator, message.role, digest(message.text)] as const);
        const native = { tool: 'codex' as const, format: 'codex-app-server-follow-v1', filename: 'codex-app-server.json',
          sha256: digest(JSON.stringify([before?.native.sha256 ?? null, threadId, name, messageRefs])), sessionId: threadId,
          groupSessionId: sessionId, titleExact: name, titleOrigin: name ? 'host-name' as const : 'unavailable' as const,
          workspaceRoot: cwd, createdAt, updatedAt, parentNativeId: parentThreadId, omitted: 0, previousSnapshotId: null, archive };
        const row: ArchiveRecord = { ...(before ?? { id, actor, goal: 'Selected Codex conversation archive', reportedStatus: 'completed',
          statusReportedBy: actor, createdAt: at, parentSessionId: null, resumedFrom: null, latestCheckpointId: null, sourceId: null,
          hostSessionId: threadId }), title: name ?? 'Native chat title unavailable', updatedAt: at, lastReportedAt: at,
          revision: before ? before.revision + 1 : 0, native };
        this.db.put('sessions', row, scope(threadId));
        for (const [index, message] of delta.entries()) {
          this.db.put('session-messages', { id: randomUUID(), role: message.role, actor, text: message.text, createdAt: at,
            native: { id: message.id, locator: message.locator, sha256: messageRefs[index][3], createdAt: null } } satisfies SessionMessage, id);
        }
        return this.describe(row, delta.length);
      });
    } finally { this.db.close(); }
  }

  async sync(connection: NativeCodexConnection, threadId: string, guard: () => void, reviewedSha256?: string) {
    guard();
    const prior = this.stored(threadId);
    const read = async (cursor: string | null) => {
      const page = await connection.read(threadId, cursor, guard);
      checkPage(page);
      return page;
    };
    const head = await read(null);
    if (reviewedSha256 !== undefined && head.sha256 !== reviewedSha256) throw changed();
    if (!prior) {
      if (reviewedSha256 === undefined || !head.messages.length) {
        throw new NativeCodexError('CODEX_ARCHIVE_REVIEW', 'Review the latest page with visible text before enabling capture.', 409);
      }
      return this.commit(head, undefined, head.messages, guard);
    }

    const anchor = prior.messages.at(-1)!;
    const pages = [head];
    const cursors = new Set<string>();
    while (!pages.at(-1)!.messages.some(message => message.id === anchor.id)) {
      const cursor = pages.at(-1)!.nextCursor;
      if (!cursor || cursors.has(cursor) || pages.length >= CODEX_ARCHIVE_LIMITS.pagesPerCheck) throw gap();
      cursors.add(cursor);
      const older = await read(cursor);
      if (older.thread.updatedAt !== head.thread.updatedAt || older.thread.name !== head.thread.name) throw changed();
      pages.push(older);
    }
    const observed = pages.reverse().flatMap(page => page.messages);
    if (new Set(observed.map(message => message.id)).size !== observed.length) throw gap();
    const saved = new Map(prior.messages.map(message => [message.id, message]));
    const start = observed.findIndex(message => saved.has(message.id));
    const end = observed.findIndex(message => message.id === anchor.id);
    const overlap = observed.slice(start, end + 1);
    const expected = prior.messages.slice(-overlap.length);
    if (expected.length !== overlap.length || overlap.some((message, index) => {
      const old = expected[index];
      return message.id !== old.id || message.locator !== old.locator || message.role !== old.role || digest(message.text) !== old.sha256;
    })) throw gap();
    const delta = observed.slice(end + 1);
    if (delta.some(message => saved.has(message.id))) throw gap();
    guard();
    if (!delta.length && head.thread.name === prior.row.native.titleExact) return this.describe(prior.row, 0);
    if ((await read(null)).sha256 !== head.sha256) throw changed();
    return this.commit(head, prior.row, delta, guard);
  }
}
