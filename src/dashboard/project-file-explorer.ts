import { lstatSync, opendirSync, realpathSync, type BigIntStats } from 'node:fs';
import { join, parse, relative, sep } from 'node:path';
import { readProjectFile } from '../brain/project-kit-paths.js';
import { SOURCE_LIMITS } from '../brain/project-source-contract.js';
import { projectFileNameAllowed, projectFileRootAllowed } from './project-file-paths.js';

export const PROJECT_FILE_LIMITS = { scanned: 1000, pageSize: 100, pathBytes: 1024, depth: 24 } as const;

type Directory = { absolute: string; stat: BigIntStats };
type FileItem = { name: string; path: string; kind: 'directory' | 'file'; bytes: number | null; modifiedAt: string | null; navigable: boolean };

class FileExplorerError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function unavailable(): FileExplorerError {
  return new FileExplorerError('The project folder is missing, protected, or unavailable. Choose a project folder from the list.', 404);
}

function sameDirectory(stat: BigIntStats | undefined, expected: BigIntStats): boolean {
  return !!stat?.isDirectory() && stat.dev === expected.dev && stat.ino !== 0n && stat.ino === expected.ino;
}

function directoryStat(absolute: string): BigIntStats {
  const stat = lstatSync(absolute, { bigint: true, throwIfNoEntry: false });
  if (!stat?.isDirectory() || stat.ino === 0n) throw unavailable();
  return stat;
}

function resolveDirectory(root: string, parts: string[], pinned?: BigIntStats): Directory[] {
  const volume = parse(root).root;
  // Check every ancestor for links, including ancestors of a moved or replaced project root.
  const chain: Directory[] = [];
  let absolute = volume;
  for (const part of root.slice(volume.length).split(sep)) {
    absolute = join(absolute, part);
    chain.push({ absolute, stat: directoryStat(absolute) });
  }
  const project = chain[chain.length - 1].stat;
  if (pinned && !sameDirectory(project, pinned)) throw unavailable();
  for (const part of parts) {
    absolute = join(absolute, part);
    const stat = directoryStat(absolute);
    if (stat.dev !== project.dev) throw unavailable();
    chain.push({ absolute, stat });
  }
  if (relative(absolute, realpathSync.native(absolute))) throw unavailable();
  return chain;
}

function checkDirectoryChain(chain: Directory[]): void {
  for (const { absolute, stat } of chain) {
    if (!sameDirectory(lstatSync(absolute, { bigint: true, throwIfNoEntry: false }), stat)) throw unavailable();
  }
}

function parseListing(search: URLSearchParams) {
  if ([...search.keys()].some(key => key !== 'path' && key !== 'offset') ||
      search.getAll('path').length > 1 || search.getAll('offset').length > 1) {
    throw new FileExplorerError('Use one project-relative path and one optional page offset.', 400);
  }
  const path = search.get('path') ?? '';
  const parts = path ? path.split('/') : [];
  if (Buffer.byteLength(path) > PROJECT_FILE_LIMITS.pathBytes || parts.length > PROJECT_FILE_LIMITS.depth) {
    throw new FileExplorerError('The project folder exceeds the explorer path limit.', 400);
  }
  if (parts.some(part => !projectFileNameAllowed(part))) throw unavailable();
  const value = search.get('offset') ?? '0';
  if (!/^\d{1,4}$/.test(value) || Number(value) > PROJECT_FILE_LIMITS.scanned) {
    throw new FileExplorerError('The explorer page offset is out of range.', 400);
  }
  return { path, parts, offset: Number(value) };
}

/** Lists directory entries on demand without opening file contents. */
export class ProjectFileExplorer {
  private readonly rootIdentity?: BigIntStats;

  constructor(private readonly root: string) {
    if (!projectFileRootAllowed(root)) return;
    try { this.rootIdentity = resolveDirectory(root, []).pop()?.stat; }
    catch { /* The file surface stays unavailable if the root cannot be pinned. */ }
  }

  readDocument(input: Record<string, unknown>) {
    if (Object.keys(input).length !== 1 || typeof input.path !== 'string') throw new FileExplorerError('Choose a project document.', 400);
    const { path, parts } = parseListing(new URLSearchParams({ path: input.path }));
    const name = parts.at(-1);
    if (!name || !/\.(?:md|markdown|txt)$/iu.test(name) || !this.rootIdentity) throw unavailable();
    const parents = resolveDirectory(this.root, parts.slice(0, -1), this.rootIdentity);
    const bytes = readProjectFile(this.root, path, SOURCE_LIMITS.bytes);
    checkDirectoryChain(parents);
    if (!bytes) throw unavailable();
    return { path, name, bytes };
  }

  list(search: URLSearchParams) {
    const { path, parts, offset } = parseListing(search);
    const pinned = this.rootIdentity;
    if (!pinned) throw unavailable();
    const items: FileItem[] = [];
    let truncated = false;
    try {
      const chain = resolveDirectory(this.root, parts, pinned);
      const directory = chain[chain.length - 1].absolute;
      const entries = opendirSync(directory);
      try {
        checkDirectoryChain(chain);
        for (let scanned = 0; scanned <= PROJECT_FILE_LIMITS.scanned; scanned++) {
          const entry = entries.readSync();
          if (!entry) break;
          if (scanned === PROJECT_FILE_LIMITS.scanned) { truncated = true; break; }
          if (!projectFileNameAllowed(entry.name) || (!entry.isDirectory() && !entry.isFile())) continue;
          const child = path ? path + '/' + entry.name : entry.name;
          if (Buffer.byteLength(child) > PROJECT_FILE_LIMITS.pathBytes) continue;
          const stat = lstatSync(join(directory, entry.name), { bigint: true, throwIfNoEntry: false });
          if (!stat || stat.dev !== pinned.dev || (entry.isFile() ? !stat.isFile() || stat.nlink !== 1n : !stat.isDirectory())) continue;
          const kind = stat.isDirectory() ? 'directory' : 'file';
          items.push({ name: entry.name, path: child, kind, bytes: kind === 'file' && stat.size <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(stat.size) : null,
            modifiedAt: Number.isFinite(stat.mtime.getTime()) ? stat.mtime.toISOString() : null,
            navigable: kind === 'directory' && parts.length < PROJECT_FILE_LIMITS.depth });
        }
        checkDirectoryChain(chain);
      } finally { entries.closeSync(); }
    } catch {
      // Do not return absolute paths or details from filesystem errors.
      throw unavailable();
    }
    items.sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name) ||
      (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    const start = Math.floor(offset / PROJECT_FILE_LIMITS.pageSize) * PROJECT_FILE_LIMITS.pageSize;
    const last = Math.max(0, Math.ceil(items.length / PROJECT_FILE_LIMITS.pageSize) - 1) * PROJECT_FILE_LIMITS.pageSize;
    const current = Math.min(start, last);
    const end = current + PROJECT_FILE_LIMITS.pageSize;
    return {
      path, breadcrumbs: [{ name: 'Project root', path: '' }, ...parts.map((name, index) => ({ name, path: parts.slice(0, index + 1).join('/') }))],
      items: items.slice(current, end), total: items.length, offset: current,
      previousOffset: current > 0 ? current - PROJECT_FILE_LIMITS.pageSize : null,
      nextOffset: end < items.length ? end : null, truncated, scanLimit: PROJECT_FILE_LIMITS.scanned,
    };
  }
}
