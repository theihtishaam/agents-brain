import * as fs from 'node:fs';

/** Match a regular opened file to its current project or lock path. */
export function matchesFileIdentity(filename: string, handle: fs.BigIntStats, named: fs.BigIntStats | undefined): boolean {
  if (!named?.isFile() || !handle.isFile() || handle.nlink !== 1n || named.nlink !== 1n || handle.ino === 0n || named.ino !== handle.ino) return false;
  if (named.dev === handle.dev) return true;
  // Some Windows Node releases report device zero for path stats, but expose the volume through an open handle.
  if (process.platform !== 'win32' || named.dev !== 0n || handle.dev === 0n) return false;
  let fd: number | undefined;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const reopened = fs.fstatSync(fd, { bigint: true });
    const current = fs.lstatSync(filename, { bigint: true, throwIfNoEntry: false });
    return reopened.isFile() && reopened.nlink === 1n && reopened.dev === handle.dev && reopened.ino === handle.ino &&
      current?.isFile() === true && current.nlink === 1n && current.dev === named.dev && current.ino === named.ino;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
