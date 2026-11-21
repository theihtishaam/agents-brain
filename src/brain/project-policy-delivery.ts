import type { GlobalBrain } from './global-brain.js';
import type { ContextAssemblyOptions } from './context-assembly.js';
import type { MemoryAnnotationSnapshot } from './memory-annotations.js';
import { ProjectSessions } from './project-sessions.js';
import { disabledChatKeys, hiddenChatSessions, nativeChatKey, toolParticipates, type ProjectPolicy } from './project-policy.js';
import { WorkspaceConnections } from './workspace-connections.js';
import { FeatureSettingsStore } from './feature-settings.js';
import { projectStorage } from './project-memory.js';

export function hiddenProjectMemories(root: string, brain: GlobalBrain, projectId: string, policy: ProjectPolicy): ReadonlySet<string> {
  const keys = disabledChatKeys(policy);
  const excluded = new Set<string>(new WorkspaceConnections(root, projectId).excludedHosts());
  const capture = new FeatureSettingsStore({ filePath: projectStorage(root).settingsPath }).get().features.exactConversationCapture;
  if (capture && !keys.size && !excluded.size && policy.participationEnabled !== false && !policy.tools.some(row => !row.enabled)) return new Set();
  const captureAllowed = (tool: string) => capture && toolParticipates(policy, tool) && !excluded.has(tool);
  let hiddenSessions: Set<string> | undefined;
  const hidden = new Set<string>();
  for (const memory of brain.contextEntries({ projectId })) {
    const meta = brain.getEntry(memory.id)?.metadata;
    if (!meta) continue;
    const source = typeof meta.sourceId === 'string' && keys.has('source:' + meta.sourceId);
    const session = [meta.originSessionId, meta.sessionId].some(value => typeof value === 'string' &&
      (keys.has('session:' + value) || (hiddenSessions ??= hiddenChatSessions(policy, new ProjectSessions(root, brain).list().sessions, captureAllowed)).has(value)));
    const native = typeof meta.nativeTool === 'string' && typeof meta.nativeSessionId === 'string' &&
      keys.has(nativeChatKey(meta.nativeTool, meta.nativeSessionId));
    const lesson = typeof meta.lessonOriginTool === 'string' && (!toolParticipates(policy, meta.lessonOriginTool) || excluded.has(meta.lessonOriginTool) ||
      (keys.size > 0 && (typeof meta.originSessionId !== 'string' || (typeof meta.lessonOriginChatKey === 'string' && keys.has(meta.lessonOriginChatKey)))));
    if (source || session || native || lesson) hidden.add(memory.id);
  }
  return hidden;
}

export function withoutHiddenAnnotations(annotations: MemoryAnnotationSnapshot, hidden: ReadonlySet<string>): MemoryAnnotationSnapshot {
  if (!hidden.size) return annotations;
  return { ...annotations,
    reviews: Object.fromEntries(Object.entries(annotations.reviews).filter(([id]) => !hidden.has(id))),
    links: annotations.links.filter(link => !hidden.has(link.fromId) && !hidden.has(link.toId)),
  };
}

export function enforceProjectContext(root: string, brain: GlobalBrain, policy: ProjectPolicy, options: ContextAssemblyOptions): ContextAssemblyOptions {
  const hidden = options.features?.contextAssembly === false ? new Set<string>() : hiddenProjectMemories(root, brain, options.projectId, policy);
  const shareCheckpoints = options.features?.checkpointContext !== false && options.features?.contextAssembly !== false && policy.participationEnabled !== false;
  return { ...options, ...(shareCheckpoints ? { findContinuation: (terms: string[]) => new ProjectSessions(root, brain, undefined, policy).relatedHandoff(terms) } : {}),
    tokenBudget: Math.min(options.tokenBudget ?? 2000, policy.context.maxTokens),
    maxEntries: Math.min(options.maxEntries ?? 12, policy.context.maxEntries), includeCrossProject: false,
    excludeIds: hidden, policy: { revision: policy.revision, ...policy.context, hiddenMemories: hidden.size } };
}
