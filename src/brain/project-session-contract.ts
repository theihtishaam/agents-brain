import { z } from 'zod';
import { hubId } from './project-hub-contract.js';
import type { NativeSessionSnapshot } from './native-session-import.js';

export const SESSION_LIMITS = Object.freeze({ sessions: 150, messages: 200, page: 25, messagePageBytes: 32 * 1024, checkpoints: 40, operations: 20_000, recentMs: 5 * 60_000 });
const controls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const text = (maximum: number) => z.string().trim().min(1).max(maximum).refine(value => !controls.test(value), 'Use ordinary text.');
const label = (maximum: number) => text(maximum).refine(value => !/[\r\n\t]/u.test(value), 'Use a single line.');
const key = z.string().regex(/^[A-Za-z0-9_-]{12,100}$/u);
export const sessionOperationKey = key;
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
const title = label(160);
const goal = text(1200);
const hostSessionId = label(128);
const sessionOptions = { hostSessionId: hostSessionId.optional(), parentSessionId: hubId.optional() };
const expectedRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
const status = z.enum(['working', 'waiting', 'completed']);
const role = z.enum(['user', 'assistant', 'note']);
const messageText = z.string().min(1).max(8000).refine(value => value.trim().length > 0 && !controls.test(value), 'Use ordinary text.');

export const openSessionInput = z.strictObject({ key, title, goal, ...sessionOptions });
export const sessionMessageWindow = z.strictObject({ before: hubId.optional(), limit: z.number().int().min(1).max(SESSION_LIMITS.page).default(SESSION_LIMITS.page) });
export const recordSessionInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('status'), key, status, expectedRevision }),
  z.strictObject({ kind: z.literal('message'), key, role, text: messageText, expectedRevision }),
  z.strictObject({ kind: z.literal('checkpoint'), key, summary: text(4000), decisions: z.array(text(600)).max(8).default([]),
    completed: z.array(text(600)).max(8).default([]), nextSteps: z.array(text(600)).max(8).default([]),
    evidence: z.array(label(240)).max(8).default([]), expectedRevision }).refine(value => Buffer.byteLength(JSON.stringify(value)) <= 16 * 1024,
      'Keep the checkpoint within 16 KiB.'),
]);
export const resumeSessionFields = { key, checkpointId: hubId, sha256: digest, title: title.optional(), ...sessionOptions };
export const resumeSessionInput = z.strictObject(resumeSessionFields);
export const importSessionInput = z.strictObject({ key, sourceId: hubId, title: title.optional(), goal: goal.optional() });
export const transcriptInput = z.strictObject({ id: hubId, name: label(240), items: z.array(z.strictObject({
  id: label(240), locator: label(240), role, originalRole: label(40), text: messageText,
})).min(1).max(SESSION_LIMITS.messages) });
export const sessionActorInput = z.strictObject({ id: label(160), kind: z.enum(['user', 'agent']), tool: label(64) });
export const SESSION_OPERATOR = Object.freeze({ id: 'Operator', kind: 'user', tool: 'portal' } as const);

export class ProjectSessionError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ProjectSessionError';
  }
}

export function sessionInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const path = parsed.error.issues[0].path.join('.');
  throw new ProjectSessionError('SESSION_INVALID_INPUT', path ? 'Check the ' + path + ' field.' : 'Send a valid project session request.', 400);
}

export type SessionActor = z.infer<typeof sessionActorInput>;
export interface SessionRecord {
  id: string;
  title: string;
  goal: string;
  actor: SessionActor;
  hostSessionId: string | null;
  reportedStatus: z.infer<typeof status>;
  statusReportedBy: SessionActor;
  createdAt: string;
  updatedAt: string;
  lastReportedAt: string;
  revision: number;
  parentSessionId: string | null;
  resumedFrom: { sessionId: string; checkpointId: string } | null;
  latestCheckpointId: string | null;
  sourceId: string | null;
  native?: Omit<NativeSessionSnapshot, 'messages'> & { previousSnapshotId: string | null };
}

export interface SessionMessage {
  id: string;
  role: z.infer<typeof role>;
  actor: SessionActor;
  text: string;
  createdAt: string;
  source?: { sourceId: string; itemId: string; locator: string; originalRole: string };
  native?: { id: string; locator: string; sha256: string; createdAt: string | null };
}

export interface SessionCheckpoint {
  id: string;
  sessionId: string;
  revision: number;
  actor: SessionActor;
  summary: string;
  decisions: string[];
  completed: string[];
  nextSteps: string[];
  evidence: string[];
  createdAt: string;
  sha256: string;
}

export type SessionPresence = 'recent' | 'stale' | 'completed';
export type SessionSummary = SessionRecord & { presence: SessionPresence };
