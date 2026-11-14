import type { GlobalBrain } from './global-brain.js';
import type { ContextAssemblyOptions } from './context-assembly.js';
import type { MemoryAnnotationSnapshot } from './memory-annotations.js';
import { ProjectSessions } from './project-sessions.js';
import { disabledChatKeys, hiddenChatSessions, nativeChatKey, type ProjectPolicy } from './project-policy.js';

export function hiddenProjectMemories(root: string, brain: GlobalBrain, projectId: string, policy: ProjectPolicy): ReadonlySet<string> {
  const keys = disabledChatKeys(policy);
  if (!keys.size) return new Set();
  const sessions = new ProjectSessions(root, brain).list().sessions;
  const hiddenSessions = hiddenChatSessions(policy, sessions);
  const hidden = new Set<string>();
  for (const memory of brain.contextEntries({ projectId })) {
    const meta = brain.getEntry(memory.id)?.metadata;
    if (!meta) continue;
    const source = typeof meta.sourceId === 'string' && keys.has('source:' + meta.sourceId);
    const session = [meta.originSessionId, meta.sessionId].some(value => typeof value === 'string' &&
      (keys.has('session:' + value) || hiddenSessions.has(value)));
    const native = typeof meta.nativeTool === 'string' && typeof meta.nativeSessionId === 'string' &&
      keys.has(nativeChatKey(meta.nativeTool, meta.nativeSessionId));
    if (source || session || native) hidden.add(memory.id);
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
  return { ...options, tokenBudget: Math.min(options.tokenBudget ?? 2000, policy.context.maxTokens),
    maxEntries: Math.min(options.maxEntries ?? 12, policy.context.maxEntries), includeCrossProject: false,
    excludeIds: hidden, policy: { revision: policy.revision, ...policy.context, hiddenMemories: hidden.size } };
}
