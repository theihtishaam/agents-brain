import { vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Install before application imports: default stores must never use a developer's home.
// Each test file receives its own module context and temporary directory.
const testHome = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-brain-suite-')));
process.env.SHADOW_BRAIN_DIRECTORY_HOME = path.join(testHome, 'workspace-directory');
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return { ...actual, homedir: () => testHome };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => testHome };
});
