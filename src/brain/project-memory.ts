import * as path from 'node:path';
import * as fs from 'node:fs';
import { GlobalBrain } from './global-brain.js';
import { projectRoot, projectLocalPath } from './project-kit.js';

export interface ProjectKnowledgeInput { title: string; content: string; category?: string; source?: string }

/** Explicit project-local paths only; never consults the default global store. */
export function projectStorage(directory: string) {
  const root = projectRoot(directory);
  const storagePath = projectLocalPath(root, '.shadow-brain/project-memory.json');
  const settingsPath = projectLocalPath(root, '.shadow-brain/feature-settings.json');
  const annotationsPath = projectLocalPath(root, '.shadow-brain/memory-annotations.json');
  const journalPath = projectLocalPath(root, '.shadow-brain/activity-journal.json');
  const feedbackPath = projectLocalPath(root, '.shadow-brain/memory-feedback.json');
  for (const filename of [storagePath, settingsPath, annotationsPath, journalPath, feedbackPath]) {
    const stat = fs.lstatSync(filename, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.nlink !== 1)) throw new Error('Project storage paths must be ordinary unlinked files.');
  }
  return { root, projectId: GlobalBrain.projectIdFor(root), projectName: path.basename(root), storagePath, settingsPath, annotationsPath, journalPath, feedbackPath };
}

/** Identify an explicit project store even when Windows launch paths use different spellings. */
export function resolveProjectStore(directory: string, dbPath: string | undefined): ReturnType<typeof projectStorage> | undefined {
  if (!dbPath) return undefined;
  const absolute = path.resolve(dbPath);
  const parent = path.dirname(absolute);
  if (path.relative(path.join(parent, 'project-memory.json'), absolute) ||
      path.relative(path.join(path.dirname(parent), '.shadow-brain'), parent)) return undefined;
  // Validate the supplied project ancestor before using its canonical spelling. The store and its directory can be absent.
  const requestedRoot = projectRoot(path.dirname(parent));
  const local = projectStorage(directory);
  if (path.relative(local.root, requestedRoot)) throw new TypeError('The explicit project store must belong to the selected project.');
  return local;
}

export function requireProjectStore(directory: string, brain: GlobalBrain) {
  const store = projectStorage(directory);
  if (path.resolve(brain.dbPath) !== store.storagePath) throw new Error('Project Kit requires its project-local store. Start shadow-brain project workspace in this project, or use its generated MCP recipe.');
  return store;
}

export function parseProjectKnowledge(input: unknown): ProjectKnowledgeInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Knowledge must be an object.');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !['title', 'content', 'category', 'source'].includes(key))) throw new TypeError('Unknown knowledge field.');
  const title = value.title;
  const content = value.content;
  if (typeof title !== 'string' || !title.trim() || title.length > 160 || /[\u0000-\u001f\u007f]/.test(title)) throw new TypeError('Use a single-line title from 1 to 160 characters.');
  if (typeof content !== 'string' || !content.trim() || content.length > 8000 || content.includes('\0')) throw new TypeError('Knowledge content must contain 1 to 8000 characters without null bytes.');
  if (value.category !== undefined && (typeof value.category !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(value.category.trim()))) throw new TypeError('Use a category from 1 to 64 plain characters.');
  if (value.source !== undefined && (typeof value.source !== 'string' || value.source.length > 500 || /[\u0000-\u001f\u007f]/.test(value.source))) throw new TypeError('A source reference must be at most 500 characters without control characters.');
  return { title: title.trim(), content, ...(value.category ? { category: (value.category as string).trim() } : {}),
    ...(value.source && (value.source as string).trim() ? { source: (value.source as string).trim() } : {}) };
}

/** Only explicit user knowledge. Source references are labels and are never opened. */
export async function addProjectKnowledge(directory: string, brain: GlobalBrain, input: unknown) {
  const knowledge = parseProjectKnowledge(input);
  const store = requireProjectStore(directory, brain);
  await brain.init();
  brain.refresh();
  if (brain.getStorageHealth().lastError) throw new Error('Project memory could not be read; no knowledge was added.');
  const memoryId = brain.writeSync({ projectId: store.projectId, projectName: store.projectName,
    agentTool: 'user', category: knowledge.category ?? 'knowledge', content: knowledge.title + '\n' + knowledge.content,
    importance: 0.7, metadata: { origin: 'project-kit-user', inputKind: 'explicit-knowledge', title: knowledge.title,
      ...(knowledge.source ? { sources: [knowledge.source] } : {}) } });
  await brain.sync();
  return { ok: true as const, memoryId, projectId: store.projectId };
}
