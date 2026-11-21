import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

// All workspace, registry and memory writes in this verification stay in a new temporary directory.
const packageHome = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(packageHome, 'dist', 'cli.js');
const manifest = JSON.parse(await fs.readFile(path.join(packageHome, 'package.json'), 'utf8'));
const temp = await fs.realpath(tmpdir());
const fixture = await fs.mkdtemp(path.join(temp, 'asb-fresh-acceptance-'));
process.env.SHADOW_BRAIN_DIRECTORY_HOME = path.join(fixture, 'workspace-directory-home');
process.env.SHADOW_BRAIN_CONFIG_DIR = path.join(fixture, 'asb-config');
const { startProjectWorkspace } = await import(pathToFileURL(path.join(packageHome, 'dist/dashboard/project-workspace.js')).href);
const activePortals = new Set();
const clients = new Set();
let countClients = 0;

function web(portal, route, action) {
  return new Promise((resolve, reject) => {
    const body = action === undefined ? undefined : JSON.stringify(action);
    const call = request(portal.url + '/api/workspace/' + route, { agent: false, method: body ? 'POST' : 'GET',
      headers: { 'X-Shadow-Brain-Project': portal.projectId, 'Sec-Fetch-Site': 'same-origin',
        ...(body ? { Origin: portal.url, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}) } }, response => {
      let text = '';
      response.setEncoding('utf8').on('data', chunk => { text += chunk; });
      response.once('error', reject);
      response.once('end', () => {
        try {
          assert.equal(response.statusCode, 200, route + ' ' + text);
          resolve(JSON.parse(text));
        } catch (error) { reject(error); }
      });
    });
    call.once('error', reject);
    call.setTimeout(12000, () => call.destroy(new Error('Portal request timed out')));
    call.end(body);
  });
}
const listDirectory = (portal, selected) => web(portal, 'directory?project=' + selected);
async function start(folder, port) {
  const portal = await startProjectWorkspace(folder, port === undefined ? {} : { port });
  activePortals.add(portal);
  return portal;
}
async function stop(portal) { activePortals.delete(portal); await portal.close(); }

async function connect(portal, name) {
  countClients++;
  const child = spawn(process.execPath, [cli, 'mcp', portal.root, '--stdio', '--db', portal.storagePath],
    { cwd: portal.root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const pending = new Map();
  let sequence = 0;
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', part => { stderr = (stderr + part).slice(-2048); });
  const closed = new Promise(resolve => child.once('close', resolve));
  const fail = error => {
    for (const waiting of pending.values()) { clearTimeout(waiting.timer); waiting.reject(error); }
    pending.clear();
  };
  child.stdin.on('error', fail);
  child.on('error', fail);
  child.once('close', code => fail(new Error('MCP process exited ' + code + '. ' + stderr)));
  createInterface({ input: child.stdout }).on('line', line => {
    let reply;
    try { reply = JSON.parse(line); } catch (error) { fail(error); return; }
    const waiting = pending.get(reply.id);
    if (waiting) { pending.delete(reply.id); clearTimeout(waiting.timer); waiting.resolve(reply); }
  });
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP request timed out: ' + method)); }, 15000);
      pending.set(id, { timer, resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  const client = {
    raw: (tool, args = {}) => send('tools/call', { name: tool, arguments: args }),
    async call(tool, args = {}) {
      const reply = await this.raw(tool, args);
      assert.ok(reply.result && !reply.error && !reply.result.isError, tool + ' ' + JSON.stringify(reply));
      return reply.result.structuredContent ?? reply.result.content[0].text;
    },
    async close() {
      if (!clients.delete(this)) return;
      child.stdin.end();
      const force = setTimeout(() => child.kill(), 6000);
      try { assert.equal(await closed, 0, stderr); }
      finally { clearTimeout(force); }
    },
  };
  clients.add(client);
  const initialized = await send('initialize', { protocolVersion: '2025-11-25', clientInfo: { name, version: 'synthetic-1' }, capabilities: {} });
  assert.ok(initialized.result && !initialized.error);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  assert.ok((await send('tools/list')).result.tools.some(tool => tool.name === 'project_brief'));
  return client;
}

const query = 'What colour is the cupboard and which handles should we keep?';
const exactNote = 'The cupboard is black. Keep its brass handles.';
const source = 'docs/cupboard.md';
const projectFolders = ['Cupboard Workshop', 'Copper Workshop', 'Maple Workshop'].map(name => path.join(fixture, name));
const requestBrief = client => client.call('project_brief', { query });
const key = () => randomUUID();
const rowFor = (portfolio, portal) => portfolio.workspaces.find(row => row.projectId === portal.projectId);
const assertMiss = async (client, portal) => {
  const brief = await requestBrief(client);
  assert.doesNotMatch(brief, /brass handles|docs\/cupboard\.md/u);
  const scoped = await client.call('context_pack', { projectId: portal.projectId, query, profile: 'adaptive' });
  assert.equal(scoped.entries.length, 0);
};

try {
  await Promise.all(projectFolders.map(folder => fs.mkdir(folder)));
  await fs.mkdir(path.join(projectFolders[0], 'docs'));
  await fs.writeFile(path.join(projectFolders[0], source), exactNote + '\n');
  let [primary, foreignB, foreignC] = await Promise.all(projectFolders.map(folder => start(folder)));
  const statuses = await Promise.all([primary, foreignB, foreignC].map(portal => web(portal, 'status')));
  assert.equal(new Set(statuses.map(status => status.serverInstanceId)).size, 3);
  assert.equal(new Set(statuses.map(status => status.project.id)).size, 3);
  assert.equal((await listDirectory(foreignB, primary.projectId)).total, 3);
  const [writer, reader, otherB, otherC] = await Promise.all([
    connect(primary, 'codex'), connect(primary, 'claude-code'), connect(foreignB, 'opencode'), connect(foreignC, 'deepseek-harness'),
  ]);
  await Promise.all([assertMiss(reader, primary), assertMiss(otherB, foreignB), assertMiss(otherC, foreignC)]);
  const saved = await writer.call('project_knowledge', { title: 'Confirmed cupboard finish', content: exactNote, source });
  assert.equal(saved.projectId, primary.projectId);
  const delivered = await requestBrief(reader);
  for (const value of [exactNote, source, saved.memoryId]) assert.ok(delivered.includes(value));
  const measured = (await web(primary, 'telemetry?limit=200')).events;
  const deliveredReceipt = measured.find(event => event.tool === 'project_brief' && event.source === 'measured' &&
    event.kind === 'tool-end' && event.outcome === 'success' && event.contextMemoryIds?.includes(saved.memoryId));
  assert.ok(deliveredReceipt);
  assert.deepEqual(deliveredReceipt.contextMemoryIds, [saved.memoryId]);
  const requestReceipt = measured.find(event => event.kind === 'tool-start' && event.correlationId === deliveredReceipt.correlationId);
  assert.equal(requestReceipt.argumentBytes, Buffer.byteLength(JSON.stringify({ query })));
  assert.equal(deliveredReceipt.resultTextBytes, Buffer.byteLength(delivered));
  const evidence = await reader.call('memory_evidence', { memoryId: saved.memoryId });
  assert.equal(evidence.state, 'reference-only');
  assert.deepEqual(evidence.references, [source]);
  const foreignEvidence = await Promise.all([otherB, otherC].map(client => client.call('memory_evidence', { memoryId: saved.memoryId })));
  assert.ok(foreignEvidence.every(item => item.state === 'missing' && item.references.length === 0));
  await Promise.all([assertMiss(otherB, foreignB), assertMiss(otherC, foreignC)]);

  const opened = await writer.call('session_open', { key: key(), title: 'Inspect cupboard finish', goal: 'Verify the synthetic handoff.', hostSessionId: 'fixture-writer' });
  const written = await writer.call('session_record', { sessionId: opened.session.id, command: { kind: 'message', key: key(), role: 'note', text: 'Private fixture message sentinel' } });
  const checkpointSummary = 'Cupboard finish verified. Continue with hardware review.';
  const checkpointRecord = await writer.call('session_record', { sessionId: opened.session.id, command: { kind: 'checkpoint', key: key(),
    summary: checkpointSummary, decisions: ['Keep the brass handles.'], completed: ['Verified the black finish.'], nextSteps: ['Check the hinge plan.'], evidence: [source] } });
  assert.equal(written.messages.length, 1);
  const checkpoint = checkpointRecord.checkpoints[0];
  const continued = await reader.call('session_resume', { key: key(), sessionId: opened.session.id, checkpointId: checkpoint.id, sha256: checkpoint.sha256,
    title: 'Continue hardware review', hostSessionId: 'fixture-reader' });
  assert.equal(continued.handoff.summary, checkpointSummary);
  assert.equal(continued.handoff.sha256, checkpoint.sha256);
  const wrongSession = await otherB.raw('session_read', { sessionId: continued.session.id });
  assert.ok(wrongSession.error || wrongSession.result?.isError);
  await writer.call('activity_report', { projectId: primary.projectId, agent: 'codex', sessionId: 'fixture-writer', kind: 'phase', phase: 'verify' });
  await writer.call('usage_report', { projectId: primary.projectId, agent: 'codex', sessionId: 'fixture-writer', operationId: 'fixture-usage',
    responseModel: 'synthetic-model', reasoningEffort: 'high', inputTokens: 180, outputTokens: 35 });

  const { room } = await web(primary, 'hub/rooms', { key: key(), goal: 'Verify cupboard restoration' });
  const roomRoute = 'hub/rooms/' + room.id;
  const roomAction = action => web(primary, roomRoute + '/actions', { ...action, key: key() });
  await roomAction({ kind: 'task', title: 'Confirm colour evidence' });
  await roomAction({ kind: 'task', title: 'Review hinges' });
  let roomState = await web(primary, roomRoute);
  const taskId = roomState.tasks.find(task => task.title === 'Confirm colour evidence').id;
  await roomAction({ kind: 'claim', taskId, revision: 0 });
  roomState = await web(primary, roomRoute);
  await roomAction({ kind: 'artifact', taskId, revision: roomState.tasks.find(task => task.id === taskId).revision, path: source });
  roomState = await web(primary, roomRoute);
  const artifactId = roomState.artifacts[0].id;
  const fixtureDigest = createHash('sha256').update(exactNote + '\n').digest('hex');
  assert.equal(roomState.artifacts[0].sha256, fixtureDigest);
  await roomAction({ kind: 'accept', artifactId });
  await roomAction({ kind: 'outcome', taskId, artifactId, result: 'pass', check: 'Colour evidence accepted', evidence: 'Private fixture outcome evidence sentinel' });
  const observed = await listDirectory(foreignB, primary.projectId);
  assert.equal(observed.total, 3);
  const active = rowFor(observed, primary);
  assert.deepEqual(active.progress, { completed: 1, total: 2 });
  assert.equal(active.latestOutcome.result, 'pass');
  assert.equal(active.latestOutcome.provenance, 'user-report');
  assert.equal(active.hosts.reduce((sum, host) => sum + host.connections, 0), 2);
  for (const foreign of [foreignB, foreignC]) {
    assert.equal(rowFor(observed, foreign).hosts.reduce((sum, host) => sum + host.connections, 0), 1);
  }
  assert.deepEqual(active.sessions.map(session => session.title).sort(), ['Continue hardware review', 'Inspect cupboard finish']);
  const report = active.sessions.find(session => session.id === opened.session.id);
  assert.equal(report.phase, 'verify');
  assert.equal(report.responseModel, 'synthetic-model');
  assert.equal(report.reasoningEffort, 'high');
  for (const value of ['Private fixture message sentinel', 'Private fixture outcome evidence sentinel', checkpointSummary, exactNote]) {
    assert.ok(!JSON.stringify(observed).includes(value));
  }

  const primaryPort = Number(new URL(primary.url).port);
  await Promise.all([writer.close(), reader.close()]);
  await stop(primary);
  primary = await start(projectFolders[0], primaryPort);
  const restarted = await web(primary, 'status');
  assert.notEqual(restarted.serverInstanceId, statuses[0].serverInstanceId);
  assert.equal(restarted.project.id, statuses[0].project.id);
  const recoveredClient = await connect(primary, 'opencode');
  assert.ok((await requestBrief(recoveredClient)).includes(saved.memoryId));
  assert.equal((await recoveredClient.call('session_read', { sessionId: continued.session.id })).handoff.sha256, checkpoint.sha256);
  const recovered = rowFor(await listDirectory(foreignC, primary.projectId), primary);
  assert.deepEqual(recovered.progress, active.progress);
  assert.equal(recovered.latestOutcome.result, 'pass');

  const policy = (await web(primary, 'project-policy')).policy;
  await web(primary, 'project-policy', { kind: 'set-project-participation', enabled: false, expectedRevision: policy.revision });
  const denied = await recoveredClient.raw('project_brief', { query });
  assert.ok(denied.error || denied.result?.isError);
  const hidden = await listDirectory(foreignC, primary.projectId);
  const privateRow = rowFor(hidden, primary);
  assert.equal(privateRow.status, 'private');
  for (const field of ['hosts', 'sessions', 'progress', 'latestOutcome']) assert.equal(privateRow[field], null);
  const forgotten = await web(foreignC, 'directory?project=' + primary.projectId,
    { kind: 'forget', projectId: primary.projectId, expectedRevision: hidden.revision });
  assert.equal(forgotten.total, 2);
  assert.ok(!rowFor(forgotten, primary));
  assert.equal(forgotten.forgotten.length, 1);
  assert.equal(forgotten.forgotten[0].projectId, primary.projectId);
  assert.ok(!JSON.stringify(forgotten).includes('Cupboard Workshop'));
  await recoveredClient.close();
  await stop(primary);
  primary = await start(projectFolders[0], primaryPort);
  const privatePolicy = (await web(primary, 'project-policy')).policy;
  await web(primary, 'project-policy', { kind: 'set-project-participation', enabled: true, expectedRevision: privatePolicy.revision });
  const localOnly = await connect(primary, 'claude-code');
  assert.ok((await requestBrief(localOnly)).includes(saved.memoryId));
  const afterForget = await listDirectory(foreignB, primary.projectId);
  assert.equal(afterForget.total, 2);
  assert.ok(!rowFor(afterForget, primary));
  assert.equal(afterForget.forgotten.length, 1);
  await Promise.all([assertMiss(otherB, foreignB), assertMiss(otherC, foreignC)]);

  console.log(JSON.stringify({
    passed: true, packageVersion: manifest.version,
    environment: { platform: process.platform, node: process.version,
      portalTransport: 'HTTP loopback', clientTransport: 'MCP stdio', hostIdentities: 'scripted', modelInvocations: 0 },
    workspaceCounts: { freshSimultaneous: 3, independentlyInitializedClients: countClients, simultaneousClients: 4,
      primaryConfirmingBriefs: 3, initialMisses: 3, foreignWorkspacesChecked: 2, foreignMemoryMatches: 0 },
    knowledge: { savedNotes: 1, receivedMatchedText: true, receivedMemoryId: true, referenceState: evidence.state, referenceCount: 1,
      requestArgumentBytes: requestReceipt.argumentBytes, returnedTextBytes: deliveredReceipt.resultTextBytes, returnedMemoryIds: 1 },
    handoff: { savedCheckpoints: 1, resumedByAnotherClient: 1, checkpointDigestMatched: true, foreignReadsDenied: 1, persistedAfterRestart: true },
    portfolio: { visibleBeforeForget: observed.total, observedConnectionsByWorkspace: [2, 1, 1], reportedSessions: active.sessions.length,
      completedTasks: active.progress.completed, totalTasks: active.progress.total, latestOutcome: active.latestOutcome.result,
      acceptedArtifactDigestMatched: true, reportedPhase: report.phase, modelReceiptMatched: true, privateTextFieldsExposed: 0, persistedAfterRestart: true },
    controls: { policyDisableBlockedBrief: true, portfolioDetailsHiddenWhileDisabled: true, visibleAfterForget: afterForget.total,
      forgottenSuppressions: afterForget.forgotten.length, absentAfterPortalAndMcpReopen: true, localMemoryRetained: true },
  }, null, 2));
} finally {
  await Promise.allSettled([...clients].map(client => client.close()));
  await Promise.allSettled([...activePortals].map(portal => stop(portal)));
  const checked = await fs.realpath(fixture);
  assert.equal(path.dirname(checked), temp);
  assert.ok(path.basename(checked).startsWith('asb-fresh-acceptance-'));
  await fs.rm(checked, { recursive: true, force: true });
}
