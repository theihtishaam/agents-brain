import { z } from 'zod';

export const HUB_LIMITS = Object.freeze({ pdfBytes: 8 * 1024 * 1024, pages: 60, pageChars: 8_000,
  extractedChars: 180_000, extractionMs: 20_000, documents: 30, rooms: 100, roomRecords: 500,
  lessons: 200, operations: 20_000, artifactBytes: 1024 * 1024, artifactTextBytes: 32 * 1024, leaseMs: 5 * 60_000 });

export class ProjectHubError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ProjectHubError';
  }
}

const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const line = /[\r\n\t]/u;
const text = (limit: number) => z.string().trim().min(1).max(limit).refine(value => !control.test(value), 'Text contains control characters.');
const singleLine = (limit: number) => text(limit).refine(value => !line.test(value), 'Enter a single line.');
export const hubId = z.string().regex(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u);
const key = z.string().regex(/^[A-Za-z0-9_-]{12,100}$/u);
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const hubActor = z.strictObject({ id: singleLine(100), kind: z.enum(['user', 'agent']) });
export type HubActor = z.infer<typeof hubActor>;
export const HUB_OPERATOR = Object.freeze({ id: 'Operator', kind: 'user' } as const);
export const reviewInput = z.strictObject({ page: z.number().int().min(1).max(HUB_LIMITS.pages), decision: z.enum(['approve', 'reject']), key });
export const roomInput = z.strictObject({ goal: text(4000), key });
const messageType = z.enum(['idea', 'proposal', 'critique', 'question', 'answer', 'decision', 'handoff', 'status']);
const targetType = z.enum(['message', 'artifact']);
const result = z.enum(['pass', 'fail', 'partial']);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
export const artifactReadInput = z.strictObject({ roomId: hubId, artifactId: hubId, sha256 });

const agentRoomActions = [
  z.strictObject({ kind: z.literal('task'), title: singleLine(240), key }),
  z.strictObject({ kind: z.literal('claim'), taskId: hubId, revision, key }),
  z.strictObject({ kind: z.literal('renew'), taskId: hubId, revision, key }),
  z.strictObject({ kind: z.literal('release'), taskId: hubId, revision, key }),
  z.strictObject({ kind: z.literal('message'), type: messageType, text: text(8000), replyTo: hubId.optional(), key }),
  z.strictObject({ kind: z.literal('artifact'), taskId: hubId, revision, path: singleLine(400), key }),
  z.strictObject({ kind: z.literal('ack'), targetType, targetId: hubId, sha256: sha256.optional(), key }),
  z.strictObject({ kind: z.literal('outcome'), taskId: hubId, artifactId: hubId.optional(), result, check: singleLine(240), evidence: text(3000), key }),
] as const;
export const agentRoomActionInput = z.discriminatedUnion('kind', agentRoomActions);
export const roomActionInput = z.discriminatedUnion('kind', [
  ...agentRoomActions, z.strictObject({ kind: z.literal('accept'), artifactId: hubId, key }),
]);

export const lessonInput = z.strictObject({ outcomeId: hubId, title: singleLine(150), text: text(6000), key });
export const lessonActionInput = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('evaluate'), baseline: z.boolean(), candidate: z.boolean(), control: z.boolean(), evidence: text(4000), key }),
  z.strictObject({ kind: z.literal('promote'), key }),
  z.strictObject({ kind: z.literal('rollback'), key }),
]);

export function hubInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue.path.join('.');
  throw new ProjectHubError('HUB_INVALID_INPUT', field ? 'Check the ' + field + ' field. ' + issue.message : 'Invalid project hub request.', 400);
}

export interface HubDocument {
  id: string;
  name: string;
  sha256: string;
  status: 'ready' | 'needs-ocr' | 'failed' | 'extracting';
  pageCount: number;
  parser: string;
  error: string | null;
  bytes: number;
  createdAt: string;
  attempts: number;
  failures: Array<{ error: string; at: string }>;
}
export interface HubPage {
  page: number;
  text: string;
  status: 'pending' | 'needs-ocr' | 'approved' | 'rejected';
  memoryId: string | null;
  citation: string;
  truncated: boolean;
}
export interface HubRoom { id: string; goal: string; createdAt: string; createdBy: HubActor }
export interface HubTask {
  id: string;
  roomId: string;
  title: string;
  status: 'open' | 'claimed' | 'completed';
  revision: number;
  owner: HubActor | null;
  leaseUntil: string | null;
  artifactId: string | null;
}
export interface HubMessage { id: string; roomId: string; type: z.infer<typeof messageType>; text: string; replyTo: string | null; author: HubActor; createdAt: string }
export interface HubArtifact {
  id: string;
  roomId: string;
  taskId: string;
  path: string;
  sha256: string;
  bytes: number;
  version: number;
  status: 'submitted' | 'accepted' | 'proposal';
  author: HubActor;
  createdAt: string;
}
export interface HubOutcome {
  id: string;
  roomId: string;
  taskId: string;
  artifactId: string | null;
  result: z.infer<typeof result>;
  check: string;
  evidence: string;
  provenance: 'user-report' | 'agent-report';
  author: HubActor;
  createdAt: string;
}
export interface HubAck { id: string; roomId: string; targetType: z.infer<typeof targetType>; targetId: string; sha256: string | null; author: HubActor; createdAt: string }
export interface HubEvaluation {
  baseline: boolean;
  candidate: boolean;
  control: boolean;
  evidence: string;
  provenance: 'user-report';
  method: 'operator-reported-comparison';
  createdAt: string;
}
export interface HubLesson {
  id: string;
  outcomeId: string;
  title: string;
  text: string;
  status: 'candidate' | 'evaluated' | 'promoted' | 'rolled-back';
  evaluation: HubEvaluation | null;
  memoryId: string | null;
  createdAt: string;
  author: HubActor;
}
export interface HubEvent { id: string; cursor: number; roomId: string; kind: string; targetId: string; actor: HubActor; createdAt: string }
