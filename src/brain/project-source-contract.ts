export const SOURCE_LIMITS = Object.freeze({ bytes: 1024 * 1024, items: 500, itemChars: 6000, extractedChars: 180000, sources: 200, operations: 20000 });
export type SourceKind = 'knowledge-json' | 'transcript-json' | 'text' | 'markdown';
export type SourceRole = 'user' | 'assistant' | 'system' | 'developer' | 'tool';
export interface SourceItem {
  id: string; title: string; text: string; category: string; role?: SourceRole; source?: string;
  status: 'pending' | 'approved' | 'rejected'; memoryId: string | null;
  approved?: { title: string; text: string; category: string };
}
export interface SourceImport {
  id: string; projectId: string; kind: SourceKind; name: string; sha256: string; bytes: number;
  parser: string; createdAt: string; title: string; items: SourceItem[];
}
export type SourceImportPreview = SourceImport;
export interface MemoryEvidenceResult {
  memoryId: string; projectId: string; state: 'resolved' | 'reference-only' | 'missing' | 'mismatch';
  evidence?: { kind: 'pdf-page' | 'json-item' | 'transcript-message' | 'text-section' | 'lesson-outcome'; title: string; text: string;
    truncated: boolean; sourceId: string; sha256?: string; page?: number; locator?: string; role?: string;
    roomId?: string; outcomeId?: string; artifactId?: string; artifactSha256?: string; reported?: boolean;
    approvedText?: string; approvedTitle?: string; category?: string;
    outcome?: { result: 'pass' | 'fail' | 'partial'; check: string; evidence: string; provenance: 'agent-report' | 'user-report' };
    evaluation?: { baseline: boolean; candidate: boolean; control: boolean; evidence: string; provenance: 'user-report'; method: 'operator-reported-comparison' } };
  references: string[];
}
export interface SourceReviewInput { decision: 'approve' | 'reject'; key: string; title?: string; text?: string; category?: string }

export interface ReviewedSessionTranscript { id: string; name: string; items: Array<{ id: string; locator: string; role: 'user' | 'assistant' | 'note'; originalRole: SourceRole; text: string }> }

export interface SourceImportSummary { id: string; name: string; title: string; kind: SourceKind; sha256: string; bytes: number; createdAt: string; itemCount: number; approvedCount: number; pendingCount: number; rejectedCount: number }
