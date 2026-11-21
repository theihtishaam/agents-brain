import type { GlobalBrain } from './global-brain.js';
import { HubStore } from './project-hub-store.js';
import { ProjectPolicyStore } from './project-policy.js';

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Bucket the creation dates of memories still in the durable project snapshot. */
export function retainedMemoryHistory(timestamps: Iterable<number>, now: number) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const first = today - (WINDOW_DAYS - 1) * DAY_MS;
  const days = Array.from({ length: WINDOW_DAYS }, (_, index) => ({
    date: new Date(first + index * DAY_MS).toISOString().slice(0, 10), retained: 0,
  }));
  let retained = 0;
  let beforeWindow = 0;
  let undated = 0;
  let futureDated = 0;
  for (const savedAt of timestamps) {
    retained++;
    if (!Number.isFinite(savedAt) || savedAt <= 0) undated++;
    else if (savedAt > now) futureDated++;
    else if (savedAt < first) beforeWindow++;
    else days[Math.floor((savedAt - first) / DAY_MS)].retained++;
  }
  return { retained, beforeWindow, undated, futureDated, days };
}

export function readProjectGrowth(root: string, projectId: string, brain: Pick<GlobalBrain, 'savedMemoryCreationTimes'>, now = Date.now()) {
  const memory = retainedMemoryHistory(brain.savedMemoryCreationTimes(projectId), now);
  let learning: { proposed: number; evaluated: number; promoted: number; rolledBack: number } | null = null;
  try {
    const counts = new HubStore(root, projectId).countLessonStates();
    learning = { proposed: counts.candidate, evaluated: counts.evaluated, promoted: counts.promoted, rolledBack: counts['rolled-back'] };
  } catch { /* A failed lesson read leaves its counts unknown. */ }
  let context: { maxTokens: number; maxEntries: number } | null = null;
  try { context = new ProjectPolicyStore(root, projectId).get().context; }
  catch { /* A failed policy read leaves the active limits unknown. */ }
  return { projectId, memory, learning, context };
}
