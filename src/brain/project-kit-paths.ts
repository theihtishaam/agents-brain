import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { matchesFileIdentity } from './file-identity.js';

export type ProjectKitErrorCode = 'PROJECT_KIT_UNSAFE_PATH' | 'PROJECT_KIT_CONFLICT' | 'PROJECT_KIT_STALE_PLAN' | 'PROJECT_KIT_WRITE_FAILED';

export class ProjectKitError extends Error {
  constructor(readonly code: ProjectKitErrorCode, message: string) {
    super(message);
    this.name = 'ProjectKitError';
  }
}

const PROTECTED = new Set([
  '.agents', '.aws', '.azure', '.cache', '.claude', '.codex', '.config', '.docker', '.dsh', '.git', '.gnupg',
  '.kube', '.opencode', '.shadow-brain', '.ssh', 'application support', 'credentials', 'keychains', 'node_modules',
  'program files', 'program files (x86)', 'secrets', 'system32',
]);
const UNSAFE_COMPONENT = /[\u0000-\u001f\u007f<>:"|?*]|[ .]$/u;

function unsafe(message: string): never {
  throw new ProjectKitError('PROJECT_KIT_UNSAFE_PATH', message);
}

function within(ancestor: string, child: string): boolean {
  const relative = path.relative(ancestor, child);
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep);
}

export function projectRoot(value: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError('Select an existing project directory.');
  }
  const resolved = path.resolve(value);
  const inspectAncestors = (directory: string) => {
    const drive = path.parse(directory).root;
    const components = directory.slice(drive.length).split(path.sep);
    if (!path.relative(drive, directory) || drive.startsWith('\\\\') || components.some(part => PROTECTED.has(part.toLowerCase()))) {
      unsafe('Select a project outside filesystem, home, and protected configuration roots.');
    }
    let current = drive;
    for (const component of components) {
      if (UNSAFE_COMPONENT.test(component)) unsafe('Project directory contains an unsupported path component.');
      current = path.join(current, component);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (!stat?.isDirectory() || stat.isSymbolicLink()) unsafe('Project directory and its ancestors must be real directories.');
    }
  };
  inspectAncestors(resolved);
  const original = fs.statSync(resolved, { bigint: true });
  const canonical = fs.realpathSync.native(resolved);
  inspectAncestors(canonical);
  const home = fs.realpathSync.native(os.homedir());
  const temp = fs.realpathSync.native(os.tmpdir());
  const names = canonical.slice(path.parse(canonical).root.length).split(path.sep).map(part => part.toLowerCase());
  if (!path.relative(canonical, temp) || within(canonical, home) || (names.includes('appdata') && !within(temp, canonical))) {
    unsafe('Select a project outside filesystem, home, and protected configuration roots.');
  }
  const physical = fs.statSync(canonical, { bigint: true });
  inspectAncestors(resolved);
  const current = fs.statSync(resolved, { bigint: true });
  if (original.dev !== physical.dev || original.ino !== physical.ino || current.dev !== original.dev || current.ino !== original.ino) {
    unsafe('Project directory changed while its physical identity was checked.');
  }
  return canonical;
}

function componentsOf(relativePath: string): string[] {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) unsafe('Use a project-relative path.');
  const parts = relativePath.split(/[\\/]/u);
  if (parts.some(part => !part || part === '.' || part === '..' || UNSAFE_COMPONENT.test(part))) {
    unsafe('Use a project-relative path with ordinary path components.');
  }
  return parts;
}

function checkedPath(root: string, relativePath: string, makeDirectories: boolean): string {
  const parts = componentsOf(relativePath);
  let current = root;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && makeDirectories) {
      try { fs.mkdirSync(current); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
      stat = fs.lstatSync(current, { throwIfNoEntry: false });
    }
    if (!stat) return path.join(current, ...parts.slice(index + 1));
    const finalFile = !makeDirectories && index === parts.length - 1 && stat.isFile() && stat.nlink === 1;
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !finalFile)) unsafe('Project path contains an unsafe link or file type.');
  }
  return current;
}

/** Check existing project-relative ancestors without creating or opening any files. */
export function projectLocalPath(root: string, relativePath: string): string {
  return checkedPath(projectRoot(root), relativePath, false);
}

/** Create only the requested relative directory, checking each component as it is reached. */
export function ensureProjectDirectory(root: string, relativePath: string): string {
  return checkedPath(projectRoot(root), relativePath, true);
}

export function readProjectFile(root: string, relativePath: string, limit: number): Buffer | undefined {
  const filename = projectLocalPath(root, relativePath);
  const before = fs.lstatSync(filename, { throwIfNoEntry: false, bigint: true });
  if (!before) return undefined;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(limit)) {
    unsafe('Project file must be regular, single-linked, and within the size limit.');
  }
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!matchesFileIdentity(filename, opened, before) || !opened.isFile() || opened.nlink !== 1n || opened.size > BigInt(limit)) {
      unsafe('Project file changed before it could be read.');
    }
    const buffer = Buffer.allocUnsafe(Number(opened.size) + 1);
    let size = 0;
    while (size < buffer.length) {
      const count = fs.readSync(fd, buffer, size, buffer.length - size, null);
      if (!count) break;
      size += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (BigInt(size) !== opened.size || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs || after.nlink !== 1n) {
      unsafe('Project file changed while it was being read.');
    }
    return buffer.subarray(0, size);
  } finally {
    fs.closeSync(fd);
  }
}

export function skipProjectTreeName(name: string): boolean {
  return name.startsWith('.') || UNSAFE_COMPONENT.test(name) || PROTECTED.has(name.toLowerCase()) ||
    ['appdata', 'build', 'coverage', 'dist', 'library', 'target', 'temp', 'vendor'].includes(name.toLowerCase());
}
