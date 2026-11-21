import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ActivityJournal } from '../dist/brain/activity-journal.js';
import { FeatureSettingsStore } from '../dist/brain/feature-settings.js';
import { GlobalBrain } from '../dist/brain/global-brain.js';
import { MCPServer } from '../dist/brain/mcp-server.js';
import { addProjectKnowledge, projectStorage } from '../dist/brain/project-memory.js';

const facts = [
  { title: 'Retry budget', content: 'The Atlas release checklist allows three attempts in the retry ledger.', source: 'docs/atlas/retry.md' },
  { title: 'Migration approval', content: 'The Atlas release checklist requires a reviewed migration before rollout.', source: 'docs/atlas/migration.md' },
  { title: 'Canary region', content: 'The Atlas release checklist starts the canary in the Toronto region.', source: 'docs/atlas/canary.md' },
  { title: 'Rollback owner', content: 'The Atlas release checklist names the release lead as rollback owner.', source: 'docs/atlas/rollback.md' },
];
const agents = ['codex', 'claude-code', 'opencode', 'deepseek-harness'];
const query = 'What does the Atlas release checklist require?';
const root = fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(), 'sb-brief-measurement-')));

async function run(label, storedFacts, clients) {
  const folder = join(root, label);
  fs.mkdirSync(folder);
  const store = projectStorage(folder);
  const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
  const settings = new FeatureSettingsStore({ filePath: store.settingsPath });
  const journal = new ActivityJournal({ filePath: store.journalPath });
  const receipts = [];
  try {
    const installed = [];
    for (const fact of storedFacts) installed.push({ ...fact, ...await addProjectKnowledge(folder, brain, fact) });
    for (const name of clients) {
      const client = new MCPServer(null, { toolProfile: 'memory', authToken: '' }, {
        brain, settings, projectDir: store.root, projectId: store.projectId, localProject: true,
      });
      try {
        const init = await client.handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize',
          params: { protocolVersion: '2025-11-25', clientInfo: { name, version: '1' }, capabilities: {} } });
        assert.ok(init.result && !init.error);
        const reply = await client.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call',
          params: { name: 'project_brief', arguments: { query } } });
        assert.ok(reply.result && !reply.error && !reply.result.isError);
        const text = reply.result.content[0].text;
        const matches = installed.filter(fact => [fact.content, fact.memoryId, fact.source].every(term => text.includes(term)));
        receipts.push({ client: name, citedFacts: matches.map(fact => fact.source) });
      } finally { await client.finishMemorySession(); }
    }
    const events = journal.read({ projectId: store.projectId, limit: 200 }).events
      .filter(event => event.tool === 'project_brief' && event.source === 'measured' && event.transport === 'mcp');
    const starts = events.filter(event => event.kind === 'tool-start');
    const completed = events.filter(event => event.kind === 'tool-end' && event.outcome === 'success');
    assert.equal(starts.length, clients.length);
    assert.equal(completed.length, clients.length);
    for (const [index, receipt] of receipts.entries()) {
      const start = starts[index];
      const end = completed.find(event => event.correlationId === start.correlationId && event.sessionId === start.sessionId);
      assert.ok(start.agent === receipt.client && end);
      receipt.successfulMeasuredPair = true;
    }
    return receipts;
  } finally { await brain.shutdown(); }
}

try {
  const isolated = [];
  for (const [index, host] of agents.entries()) isolated.push(...await run('isolated-' + index, [facts[index]], [host]));
  const shared = await run('shared', facts, agents);
  const measure = receipts => ({ requests: receipts.length, successfulMeasuredPairs: receipts.filter(record => record.successfulMeasuredPair).length,
    citedFactSlots: receipts.reduce((sum, record) => sum + record.citedFacts.length, 0), possibleFactSlots: receipts.length * facts.length, receipts });
  const result = { fixture: 'Atlas release checklist', query, facts, isolated: measure(isolated), shared: measure(shared) };
  assert.equal(result.isolated.citedFactSlots, 4);
  assert.equal(result.shared.citedFactSlots, 16);
  console.log(JSON.stringify(result, null, 2));
} finally {
  const checked = fs.realpathSync.native(root);
  if (checked !== root || dirname(checked) !== fs.realpathSync.native(tmpdir()) || !basename(checked).startsWith('sb-brief-measurement-')) {
    throw new Error('Refusing to remove an unexpected measurement fixture path.');
  }
  fs.rmSync(checked, { recursive: true, force: true });
}
