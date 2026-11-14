import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { projectStorage } from '../../src/brain/project-memory.js';
import { ProjectSourceIntake } from '../../src/brain/project-source-intake.js';

const program = `
import { GlobalBrain } from ${JSON.stringify(new URL('../../dist/brain/global-brain.js', import.meta.url).href)};
import { projectStorage } from ${JSON.stringify(new URL('../../dist/brain/project-memory.js', import.meta.url).href)};
import { ProjectSourceIntake } from ${JSON.stringify(new URL('../../dist/brain/project-source-intake.js', import.meta.url).href)};
const [root, source, item, key] = process.argv.slice(1);
const brain = GlobalBrain.createIsolated({ dbPath: projectStorage(root).storagePath });
const intake = new ProjectSourceIntake(root, brain);
try { const result = await intake.reviewImportItem(source, item, { decision: 'approve', key }); console.log(JSON.stringify(result.items.find(x => x.id === item))); }
finally { intake.close(); await brain.shutdown(); }
`;
function worker(root: string, source: string, item: string) {
  return new Promise<{ status: number | null; output: string; error: string }>((done, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', program, root, source, item, randomUUID()], { cwd: resolve('.'), windowsHide: true });
    let output = '', error = '';
    child.stdout.on('data', data => output += data.toString()); child.stderr.on('data', data => error += data.toString());
    child.on('error', reject); child.on('close', status => done({ status, output, error }));
  });
}
it('merges concurrent approvals from independent processes without duplicate memory or lost items', async () => {
  const root = mkdtempSync(join(tmpdir(), 'source-parallel-'));
  const brain = GlobalBrain.createIsolated({ dbPath: projectStorage(root).storagePath }), intake = new ProjectSourceIntake(root, brain);
  try {
    const source = intake.previewImport('plan.txt', Buffer.from('One unique item.\n\nAnother unique item.'));
    const workers = await Promise.all([worker(root, source.id, source.items[0].id), worker(root, source.id, source.items[0].id), worker(root, source.id, source.items[1].id)]);
    for (const result of workers) expect(result.status, result.error).toBe(0);
    const items = intake.getImport(source.id).items;
    expect(items.map(item => item.status)).toEqual(['approved', 'approved']);
    expect(JSON.parse(workers[0].output).memoryId).toBe(JSON.parse(workers[1].output).memoryId);
    await brain.init(); brain.refresh();
    for (const item of items) expect(brain.getEntry(item.memoryId!)).toBeDefined();
    expect(new Set(items.map(item => item.memoryId)).size).toBe(2);
    expect(brain.timeline({ projectId: projectStorage(root).projectId, limit: 100 })).toHaveLength(2);
  } finally { intake.close(); await brain.shutdown(); rmSync(root, { recursive: true, force: true }); }
}, 30000);
