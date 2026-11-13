import { randomUUID } from 'node:crypto';
import type { GlobalBrain } from '../brain/global-brain.js';

/** Independent HTTP heartbeat. A storage failure is not a disconnected server. */
export class WorkspaceRuntime {
  readonly serverInstanceId = randomUUID();
  readonly startedAt = new Date().toISOString();
  constructor(readonly mode: 'project' | 'shared' | 'demo', readonly project: { id: string; name: string; root: string } | null = null) {}

  status(brain: GlobalBrain | undefined, hub: boolean, error?: string | null) {
    const storageError = error ?? brain?.getStorageHealth().lastError?.message;
    return {
      version: '7.1.4', serverInstanceId: this.serverInstanceId, startedAt: this.startedAt, checkedAt: new Date().toISOString(),
      mode: this.mode, project: this.project,
      capabilities: { memory: true, context: true, curation: true, telemetry: true,
        projectKnowledge: this.mode === 'project', projectSkills: this.mode === 'project', projectFeedback: this.mode === 'project',
        hub, pdf: hub, modelUsage: false, managedExecution: false },
      storage: storageError ? { status: 'error' as const, error: storageError } : { status: 'ready' as const },
    };
  }
}
