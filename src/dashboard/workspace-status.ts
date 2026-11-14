import { randomUUID } from 'node:crypto';
import type { GlobalBrain } from '../brain/global-brain.js';

/** Independent HTTP heartbeat. A storage failure is not a disconnected server. */
export class WorkspaceRuntime {
  readonly serverInstanceId = randomUUID();
  readonly startedAt = new Date().toISOString();
  constructor(readonly mode: 'project' | 'shared' | 'demo', readonly project: { id: string; name: string; root: string } | null = null) {}

  status(brain: GlobalBrain | undefined, hub: boolean, error?: string | null) {
    const storageError = error ?? brain?.getStorageHealth().lastError?.message;
    const projectMode = this.mode === 'project';
    return {
      version: '7.22.0', serverInstanceId: this.serverInstanceId, startedAt: this.startedAt, checkedAt: new Date().toISOString(),
      mode: this.mode, project: this.project,
      capabilities: { memory: true, context: true, curation: true, telemetry: true,
        projectKnowledge: projectMode, projectSkills: projectMode, projectFeedback: projectMode,
        hub, pdf: hub, modelUsage: projectMode, sourceIntake: projectMode, sessions: projectMode, liveStream: projectMode, managedExecution: false },
      storage: storageError ? { status: 'error' as const, error: storageError } : { status: 'ready' as const },
    };
  }
}
