import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';

// Test the packed artifact in a fresh consumer project, without touching user stores.
const root = fileURLToPath(new URL('../', import.meta.url));
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-brain-package-'));
const consumer = path.join(sandbox, 'consumer');
fs.mkdirSync(consumer);
const expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert(process.env.npm_execpath, 'Run with npm run test:package');
const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL']
  .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
const npmUserConfig = path.join(sandbox, 'npm-userconfig');
const npmGlobalConfig = path.join(sandbox, 'npm-globalconfig');
fs.writeFileSync(npmUserConfig, '');
fs.writeFileSync(npmGlobalConfig, '');
const npm = args => {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args,
    '--userconfig', npmUserConfig, '--globalconfig', npmGlobalConfig,
    '--cache', path.join(sandbox, 'npm-cache'), '--registry', 'https://registry.npmjs.org'], {
    cwd: consumer, encoding: 'utf8', timeout: 240_000, env: childEnv,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const packOutput = JSON.parse(npm(['pack', root, '--json', '--ignore-scripts', '--pack-destination', sandbox]));
const pack = Array.isArray(packOutput) ? packOutput[0] : Object.values(packOutput)[0];
const tarball = path.join(sandbox, pack.filename);
assert.equal('sha512-' + createHash('sha512').update(fs.readFileSync(tarball)).digest('base64'), pack.integrity);
assert(pack.files.some(file => file.path === 'dist/brain/global-brain.js'));
for (const file of ['activity-cli', 'curation-cli', 'project-cli', 'brain/activity-journal', 'brain/memory-annotations', 'brain/mcp-stdio',
  'brain/context-retrieval', 'brain/context-request', 'brain/client-config', 'brain/memory-inspection', 'brain/memory-mcp-content',
  'brain/project-kit', 'brain/project-kit-paths', 'brain/project-kit-inspection', 'brain/project-memory', 'brain/project-feedback',
  'brain/project-hub', 'brain/project-hub-contract', 'brain/project-hub-store', 'brain/project-hub-pdf-worker', 'brain/project-hub-mcp', 'brain/file-identity',
  'dashboard/project-workspace', 'dashboard/project-hub-api', 'dashboard/brain-hub-html', 'dashboard/demo-workspace', 'dashboard/project-kit-html', 'dashboard/live-workspace-html']) {
  assert(pack.files.some(entry => entry.path === 'dist/' + file + '.js'), 'missing packaged module ' + file);
  assert(pack.files.some(entry => entry.path === 'dist/' + file + '.d.ts'), 'missing packaged declaration ' + file);
}
assert(pack.files.some(file => file.path === `docs/launch/RELEASE_NOTES_v${expected.version}.md`));
const bundledNames = ['shadow-workflow', 'shadow-implement', 'shadow-debug', 'shadow-review', 'shadow-research', 'shadow-release'];
for (const name of bundledNames) assert(pack.files.some(file => file.path === `skills/${name}/SKILL.md`));
assert(pack.files.some(file => file.path === 'docs/assets/context-flow-v7.2.png'));
assert(pack.files.some(file => file.path === 'docs/WORKSPACE.md'));
assert(!pack.files.some(file => /(^|\/)(tests|node_modules|work|outputs|\.git|\.env|\.npmrc)(\/|$)/.test(file.path)));
assert(!pack.files.some(file => /(^|\/)(global|project-memory|memory-feedback|memory-annotations|feature-settings|activity-journal)\.json$/.test(file.path)));
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
npm(['install', '--prefix', consumer, '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
const installed = path.join(consumer, 'node_modules', '@theihtisham', 'agent-shadow-brain');
const manifest = JSON.parse(fs.readFileSync(path.join(installed, 'package.json'), 'utf8'));
assert.equal(manifest.version, expected.version);
assert.equal(manifest.scripts.postinstall, undefined);

// Redirect default OS home lookups before importing any package code, without
// altering HOME/USERPROFILE or accessing any real provider configuration.
const isolatedHome = path.join(sandbox, 'home');
fs.mkdirSync(isolatedHome);
const preload = path.join(sandbox, 'isolate.mjs');
fs.writeFileSync(preload, `import os from 'node:os';\nimport { syncBuiltinESMExports } from 'node:module';\nos.homedir = () => ${JSON.stringify(isolatedHome)};\nsyncBuiltinESMExports();\n`);
const runNode = (args, status = 0, input, configDir = path.join(sandbox, 'config')) => {
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, ...args], {
    cwd: consumer, encoding: 'utf8', timeout: 30_000, input,
    env: { ...childEnv, SHADOW_BRAIN_CONFIG_DIR: configDir },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, status, result.stderr || result.stdout);
  return result.stdout;
};
const cli = path.join(installed, 'dist', 'cli.js');
assert.match(fs.readFileSync(cli, 'utf8'), /^#!\/usr\/bin\/env node/);
assert.equal(runNode([cli, '--version']).trim(), expected.version);
runNode([cli, 'demo', 'workspace', '--port', '-1'], 1);
assert.match(runNode([cli, '--help']), /storage-health/);
assert(!fs.existsSync(path.join(sandbox, 'config')), 'help/version must not load or create configuration');
const db = path.join(sandbox, 'global.json');
const probe = path.join(consumer, 'probe.mjs');
fs.writeFileSync(probe, `import assert from 'node:assert/strict';
import { getGlobalBrain } from '@theihtisham/agent-shadow-brain';
const brain = getGlobalBrain({ dbPath: ${JSON.stringify(db)}, syncIntervalMs: 60000 });
await brain.init();
brain.writeSync({ projectId: 'fixture', projectName: 'Fixture', agentTool: 'codex', category: 'lesson', content: 'Verify durable storage before publishing', importance: 0.8, metadata: { sourceFile: 'docs/storage.md' } });
brain.writeSync({ projectId: 'fixture', projectName: 'Fixture', agentTool: 'deepseek-harness', category: 'decision', content: 'Keep the replacement procedure under review', importance: 0.6, metadata: {} });
assert.equal(brain.getStorageHealth().status, 'pending');
await brain.sync();
assert.equal(brain.getStorageHealth().status, 'healthy');
await brain.shutdown();
`);
runNode([probe]);
const before = fs.readFileSync(db);
const health = JSON.parse(runNode([cli, 'storage-health', '--db', db, '--json']));
assert.equal(health.status, 'healthy');
assert.deepEqual(fs.readFileSync(db), before, 'health command must preserve store bytes');
const recalls = JSON.parse(runNode([cli, 'recall-explain', 'durable storage', '--db', db]));
assert.equal(recalls.length, 1);
assert(recalls[0].confidence.explanation.matchedKeywords.includes('durable'));
assert.deepEqual(fs.readFileSync(db), before, 'recall must preserve store bytes');
const invalid = path.join(sandbox, 'invalid.json');
fs.writeFileSync(invalid, '{invalid');
const failure = JSON.parse(runNode([cli, 'storage-health', '--db', invalid, '--json'], 1));
assert.equal(failure.status, 'error');
assert.equal(fs.readFileSync(invalid, 'utf8'), '{invalid');
assert(!fs.existsSync(path.join(sandbox, 'config')), 'diagnostics must not load provider configuration');

// Exercise the real packaged CLI from a different cwd and all native layouts.
const project = path.join(sandbox, 'project');
fs.mkdirSync(project);
const originalInstructions = '# Project\r\n\r\nPreserve this user guidance: \u03bb.\r\n';
fs.writeFileSync(path.join(project, 'AGENTS.md'), originalInstructions);
const catalog = JSON.parse(runNode([cli, 'skills', 'list', '--json']));
assert.deepEqual(catalog.map(item => item.name).sort(), [...bundledNames].sort());
assert.match(runNode([cli, 'skills', 'show', 'shadow-debug']), /diagnos/i);
const preview = JSON.parse(runNode([cli, 'skills', 'install', project, '--target', 'all', '--json']));
assert(preview.files.some(file => file.relativePath === '.dsh/skills/shadow-debug/SKILL.md'));
assert.deepEqual(fs.readdirSync(project), ['AGENTS.md'], 'preview must not write directories or metadata');
const install = JSON.parse(runNode([cli, 'skills', 'install', project, '--target', 'all', '--apply', '--json']));
assert(install.created.length >= 24);
assert(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf8').startsWith(originalInstructions));
for (const skillRoot of ['.agents/skills', '.claude/skills', '.opencode/skills', '.dsh/skills']) {
  for (const name of bundledNames) assert.equal(
    fs.readFileSync(path.join(project, skillRoot, name, 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(installed, 'skills', name, 'SKILL.md'), 'utf8'),
  );
}
const second = JSON.parse(runNode([cli, 'skills', 'install', project, '--target', 'all', '--apply', '--json']));
assert.equal(second.created.length + second.updated.length, 0, 'installation must be idempotent');
const customized = path.join(project, '.agents/skills/shadow-debug/SKILL.md');
fs.appendFileSync(customized, '\nLocal user edit.\n');
const changedBytes = fs.readFileSync(customized);
const conflicts = JSON.parse(runNode([cli, 'skills', 'install', project, '--target', 'all', '--json'], 1));
assert(conflicts.files.some(file => file.relativePath === '.agents/skills/shadow-debug/SKILL.md' && file.action === 'conflict'));
assert.deepEqual(fs.readFileSync(customized), changedBytes);
const simple = JSON.parse(runNode([cli, 'workflow', 'analyze', 'Fix the grammar in this sentence: she go home', '--json']));
assert.equal(simple.mode, 'direct');
assert.deepEqual(simple.skills, []);
const planning = JSON.parse(runNode([cli, 'workflow', 'analyze', 'Plan a storage migration; do not edit files', '--json']));
assert.equal(planning.mode, 'plan-only');
assert(!planning.steps.some(step => ['implement', 'fix', 'release'].includes(step.id)));
const requestFile = path.join(sandbox, 'request.txt');
fs.writeFileSync(requestFile, 'Review this change and report findings');
const review = JSON.parse(runNode([cli, 'workflow', 'analyze', '--request-file', requestFile, '--type', 'review', '--json']));
assert.equal(review.taskType, 'review');
assert(!review.steps.some(step => step.id === 'fix'));
const workflowProbe = path.join(consumer, 'workflow-probe.mjs');
fs.writeFileSync(workflowProbe, `import assert from 'node:assert/strict';
import { analyzeTask, listBundledSkills, getBundledSkill, listWorkflowTargets, planSkillInstall } from '@theihtisham/agent-shadow-brain';
assert.equal(listBundledSkills().length, 6);
assert.match(getBundledSkill('shadow-workflow').content, /scope/i);
assert.equal(listWorkflowTargets().find(t => t.target === 'deepseek-harness').skillRoot, '.dsh/skills');
assert.equal(analyzeTask('Explain the result').mode, 'direct');
assert(planSkillInstall({ projectDir: ${JSON.stringify(project)}, targets: ['codex'] }).files.some(f => f.action === 'conflict'));
`);
runNode([workflowProbe]);
const context = JSON.parse(runNode([cli, 'context-pack', 'durable storage', '--project-id', 'fixture', '--db', db, '--token-budget', '250', '--json']));
assert.equal(context.enabled, true);
assert.equal(context.entries.length, 1);
assert.equal(context.entries[0].projectId, 'fixture');
assert(context.budget.usedChars <= context.budget.maxChars);
assert(context.budget.estimatedTokens <= 250);
const featureFile = path.join(sandbox, 'flags.json');
const defaults = JSON.parse(runNode([cli, 'features', 'list', '--settings', featureFile]));
assert.equal(defaults.features.crossProjectContext, false);
assert.equal(defaults.definitions.length, 5);
assert.equal(defaults.features.activityRecording, true);
assert(!fs.existsSync(featureFile), 'listing default settings must not create a file');
const disabled = JSON.parse(runNode([cli, 'features', 'set', 'contextAssembly', 'off', '--settings', featureFile]));
assert.equal(disabled.features.contextAssembly, false);
const noContext = JSON.parse(runNode([cli, 'context-pack', 'durable storage', '--project-id', 'fixture', '--db', invalid, '--settings', featureFile, '--json']));
assert.equal(noContext.enabled, false, 'disabled assembly must bypass the invalid memory store');
const contextProbe = path.join(consumer, 'context-probe.mjs');
fs.writeFileSync(contextProbe, `import assert from 'node:assert/strict';
import { FeatureSettingsStore, assembleContext } from '@theihtisham/agent-shadow-brain';
const features = new FeatureSettingsStore({filePath: ${JSON.stringify(featureFile)}}).get().features;
const pack = assembleContext({recallScored() { throw new Error('Disabled context must not read memories'); }}, {projectId:'fixture', features});
assert.equal(pack.enabled, false);
`);
runNode([contextProbe]);

const memoryId = recalls[0].id;
const replacementId = JSON.parse(before).entries.find(entry => entry.agentTool === 'deepseek-harness').id;
const curationFlags = ['--project-id', 'fixture', '--db', db];
const readContext = () => JSON.parse(runNode([cli, 'context-pack', 'durable storage', ...curationFlags, '--token-budget', '250', '--json']));
const archive = JSON.parse(runNode([cli, 'curate', 'review', memoryId, 'archived', ...curationFlags, '--revision', '0']));
assert.equal(archive.state, 'archived');
assert.equal(archive.revision, 1);
const archivedContext = readContext();
assert.equal(archivedContext.entries.length, 0);
assert(archivedContext.excluded.some(entry => entry.id === memoryId && entry.reason === 'archived' && entry.title.includes('durable storage')));
runNode([cli, 'curate', 'review', memoryId, 'active', ...curationFlags, '--revision', '1']);
const relation = JSON.parse(runNode([cli, 'curate', 'link', replacementId, memoryId, 'supersedes', ...curationFlags, '--revision', '2']));
assert.equal(relation.link.type, 'supersedes');
const detail = JSON.parse(runNode([cli, 'curate', 'show', memoryId, ...curationFlags]));
assert.equal(detail.state, 'superseded');
assert.deepEqual(detail.sources, ['docs/storage.md']);
assert(readContext().excluded.some(entry => entry.id === memoryId && entry.reason === 'superseded'));
runNode([cli, 'curate', 'unlink', relation.link.id, ...curationFlags, '--revision', '3']);
assert.equal(readContext().entries[0].id, memoryId);
assert.deepEqual(fs.readFileSync(db), before, 'curation must preserve raw memory bytes');

const reported = JSON.parse(runNode([cli, 'activity', 'report', 'phase', ...curationFlags,
  '--session', 'package-fixture', '--agent', 'deepseek-harness', '--phase', 'verify']));
assert.equal(reported.recorded, true);
assert.equal(reported.event.source, 'reported');
const firstTail = JSON.parse(runNode([cli, 'activity', 'tail', ...curationFlags]));
assert.equal(firstTail.events.length, 1);
assert.equal(firstTail.events[0].id, reported.event.id);
assert.equal(firstTail.cursor, reported.event.sequence);

const guardConfig = path.join(sandbox, 'stdio-provider-canary');
fs.mkdirSync(guardConfig);
const guardFile = path.join(guardConfig, 'config.json');
fs.writeFileSync(guardFile, 'invalid synthetic provider configuration');
const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
const stdioInput = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-06-18', clientInfo: { name: 'codex', version: '1' }, capabilities: {},
  } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  call(3, 'context_pack', { projectId: 'fixture', query: 'durable storage', tokenBudget: 250 }),
  call(4, 'activity_report', { kind: 'phase', phase: 'work', projectId: 'fixture', sessionId: 'host-fixture', agent: 'deepseek-harness' }),
  call(5, 'activity_report', { kind: 'phase', phase: 'plan', source: 'measured' }),
  call(6, 'auto_config'),
].map(value => JSON.stringify(value)).join('\n') + '\n';
const replies = runNode([cli, 'mcp', '--stdio', '--db', db], 0, stdioInput, guardConfig).trim().split(/\r?\n/).map(line => JSON.parse(line));
assert.deepEqual(replies.map(reply => reply.id), [1, 2, 3, 4, 5, 6]);
assert.equal(replies[0].result.protocolVersion, '2025-06-18');
const tools = replies[1].result.tools;
assert.equal(tools.filter(tool => tool.annotations.readOnlyHint === true).length, 11);
assert.deepEqual(tools.filter(tool => tool.annotations.readOnlyHint === false).map(tool => tool.name), ['activity_report']);
assert.equal(JSON.parse(replies[2].result.content[0].text).entries[0].id, memoryId);
assert.equal(JSON.parse(replies[3].result.content[0].text).event.source, 'reported');
assert.equal(replies[4].error.code, -32602);
assert.equal(replies[5].error.code, -32601);
assert.equal(fs.readFileSync(guardFile, 'utf8'), 'invalid synthetic provider configuration');
const newTail = JSON.parse(runNode([cli, 'activity', 'tail', ...curationFlags,
  '--cursor', String(firstTail.cursor), '--journal-id', firstTail.journalId]));
assert(newTail.events.some(event => event.source === 'measured' && event.kind === 'tool-start' && event.tool === 'context_pack'));
assert(newTail.events.some(event => event.source === 'measured' && event.kind === 'tool-end' && event.tool === 'context_pack' &&
  Number.isFinite(event.durationMs) && event.outcome === 'success'));
assert(newTail.events.some(event => event.source === 'reported' && event.phase === 'work'));
const journalText = fs.readFileSync(path.join(sandbox, 'activity-journal.json'), 'utf8');
assert(!journalText.includes('durable storage'));
assert(!journalText.includes('invalid synthetic provider configuration'));
assert.deepEqual(fs.readFileSync(db), before, 'activity and stdio must preserve raw memory bytes');
const publicProbe = path.join(consumer, 'public-probe.mjs');
fs.writeFileSync(publicProbe, `import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  DashboardServer, ActivityJournal, activityJournalFor, MemoryAnnotationsStore, memoryAnnotationsFor,
  memoryState, normalizeMemorySources, CLIENT_CAPABILITIES, inspectClientIntegrations,
  reportAgentActivity, serveMCPStdio, runMemoryMCPStdio, getGlobalBrain,
} from '@theihtisham/agent-shadow-brain';
const brain = getGlobalBrain({ dbPath: ${JSON.stringify(db)}, syncIntervalMs: 60000 });
const annotations = memoryAnnotationsFor(brain);
assert(annotations instanceof MemoryAnnotationsStore);
assert.equal(annotations.get().revision, 4);
assert.equal(memoryState(annotations.get(), 'fixture', ${JSON.stringify(memoryId)}), 'active');
assert.deepEqual(normalizeMemorySources({ sourceFile: 'docs/storage.md' }), ['docs/storage.md']);
assert(activityJournalFor(brain) instanceof ActivityJournal);
assert(activityJournalFor(brain).get().events.some(event => event.source === 'measured'));
assert(CLIENT_CAPABILITIES.some(client => client.id === 'deepseek-harness'));
const integrations = inspectClientIntegrations({ projectDir: ${JSON.stringify(project)}, brain });
assert.equal(integrations.agents.find(client => client.id === 'deepseek-harness').installation, 'complete');
assert.equal(typeof reportAgentActivity, 'function');
assert.equal(typeof serveMCPStdio, 'function');
assert.equal(typeof runMemoryMCPStdio, 'function');
const projectDir = ${JSON.stringify(project)};
const orchestrator = Object.assign(new EventEmitter(), {
  getStatus: () => ({ projectDir, agents: [] }), getLastHealthScore: () => null, getLastFixes: () => [],
});
const dashboard = new DashboardServer(orchestrator, { host: '127.0.0.1', port: 0 });
try {
  const url = await dashboard.start();
  const live = await fetch(url + '/live');
  assert.equal(live.status, 200);
  assert.match(live.headers.get('content-type'), /^text\\/html/);
  assert.match(await live.text(), /<h1>Live operations<\\/h1>/);
  const telemetry = await fetch(url + '/api/workspace/telemetry?project=fixture');
  assert.equal(telemetry.status, 200);
  const page = await telemetry.json();
  assert(page.events.some(event => event.source === 'measured'));
  assert(page.events.some(event => event.source === 'reported'));
} finally {
  await dashboard.stop();
  await brain.shutdown();
}
`);
runNode([publicProbe]);

// The exact installed artifact must keep project knowledge, skills, feedback,
// client recipes and a fresh MCP process connected to the same local store.
const localProject = path.join(consumer, 'local-project');
fs.mkdirSync(localProject);
fs.writeFileSync(path.join(localProject, 'package.json'), JSON.stringify({ name: 'consumer-fixture', scripts: { test: 'NEVER_EXECUTE_PACKAGE_FIXTURE' }, devDependencies: { vitest: '*' } }));
const observed = JSON.parse(runNode([cli, 'project', 'inspect', localProject]));
assert(observed.stack.includes('Node.js'));
assert(!JSON.stringify(observed).includes('NEVER_EXECUTE_PACKAGE_FIXTURE'));
const known = JSON.parse(runNode([cli, 'project', 'knowledge', localProject, '--title', 'Checkout idempotency', '--content', 'Checkout retries reuse the original idempotency key.', '--source', 'docs/checkout.md']));
const localDb = path.join(localProject, '.shadow-brain', 'project-memory.json');
assert(fs.existsSync(localDb));
const skillArgs = [cli, 'project', 'skill', localProject, '--target', 'codex', '--name', 'checkout-retries', '--requirement', 'Verify checkout retry idempotency'];
const skillPlan = JSON.parse(runNode(skillArgs));
assert.equal(skillPlan.files[0].relativePath, '.agents/skills/checkout-retries/SKILL.md');
assert(!fs.existsSync(path.join(localProject, '.agents')));
runNode([...skillArgs, '--apply', '--expected-plan-hash', skillPlan.planHash]);
assert(fs.readFileSync(path.join(localProject, skillPlan.files[0].relativePath), 'utf8').includes('Verify checkout retry idempotency'));
const learned = JSON.parse(runNode([cli, 'project', 'feedback', 'record', localProject, '--memory', known.memoryId, '--task', 'checkout retry idempotency', '--rating', 'useful', '--reason', 'Synthetic caller-observed fixture outcome.']));
assert.equal(learned.records[0].reporter, 'user');
const localContext = JSON.parse(runNode([cli, 'context-pack', 'checkout retry idempotency', '--project', localProject, '--db', localDb, '--profile', 'adaptive', '--json']));
assert.equal(localContext.entries[0].id, known.memoryId);
assert(localContext.retrieval.candidates[0].signals.some(signal => signal.label === 'Project task feedback' && signal.value > 0));
const recipe = JSON.parse(runNode([cli, 'project', 'config', localProject, '--target', 'claude-code']));
const launch = JSON.parse(recipe.content).mcpServers.shadow_brain;
assert(launch.args.includes(localDb));
assert(launch.args.includes(observed.projectId));
const projectInput = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', clientInfo: { name: 'package-probe', version: '1' }, capabilities: {} } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  call(3, 'context_pack', { projectId: observed.projectId, query: 'checkout retry idempotency', profile: 'adaptive' }),
  call(4, 'project_inspect'),
  { jsonrpc: '2.0', id: 5, method: 'resources/list' },
  { jsonrpc: '2.0', id: 6, method: 'prompts/get', params: { name: 'shadow-task', arguments: { projectId: observed.projectId, request: 'checkout retry idempotency' } } },
  call(7, 'project_feedback'),
  call(8, 'project_feedback', { kind: 'record', expectedRevision: learned.revision, memoryId: known.memoryId, task: 'checkout retry idempotency', rating: 'useful', reason: 'Explicit synthetic host report.' }),
].map(value => JSON.stringify(value)).join('\n') + '\n';
const projectReplies = runNode(launch.args, 0, projectInput, guardConfig).trim().split(/\r?\n/).map(line => JSON.parse(line));
assert(projectReplies.every(reply => !reply.error && !reply.result?.isError), JSON.stringify(projectReplies));
assert(projectReplies[1].result.tools.some(tool => tool.name === 'hub_overview'));
assert.equal(projectReplies[2].result.structuredContent.entries[0].id, known.memoryId);
assert.equal(projectReplies[3].result.structuredContent.projectId, observed.projectId);
assert.equal(projectReplies[4].result.resources.length, 2);
assert(projectReplies[5].result.messages[0].content.text.includes('idempotency'));
assert(projectReplies[7].result.structuredContent.records.some(record => record.reporter === 'agent'));
runNode([cli, 'project', 'feedback', 'set', 'off', '--project', localProject]);
const disabledContext = JSON.parse(runNode([cli, 'context-pack', 'checkout retry idempotency', '--project', localProject, '--db', localDb, '--profile', 'adaptive', '--json']));
assert(!disabledContext.retrieval.candidates[0].signals.some(signal => signal.label === 'Project task feedback'));
const portalProbe = path.join(consumer, 'portal-probe.mjs');
const fixturePhrase = 'The packed recovery threshold is seven transitions.';
const fixtureStream = 'BT /F1 14 Tf 72 730 Td (' + fixturePhrase + ') Tj ET';
const fixtureObjects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${fixtureStream.length} >>\nstream\n${fixtureStream}\nendstream`];
let fixturePdf = '%PDF-1.4\n';
const fixtureOffsets = fixtureObjects.map((object, index) => {
  const offset = fixturePdf.length;
  fixturePdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  return offset;
});
fixturePdf += `xref\n0 6\n0000000000 65535 f \n${fixtureOffsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${fixturePdf.length}\n%%EOF\n`;
fs.writeFileSync(portalProbe, `import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startProjectWorkspace, startDemoWorkspace, ProjectFeedbackStore, inspectProject, GlobalBrain } from '@theihtisham/agent-shadow-brain';
const portal = await startProjectWorkspace(${JSON.stringify(localProject)});
try {
  const overview = await (await fetch(portal.url + '/api/workspace/overview')).json();
  assert.equal(overview.projectKit.projectId, ${JSON.stringify(observed.projectId)});
  assert.equal(overview.totals.memories, 1);
  assert((await (await fetch(portal.url + '/workspace')).text()).includes('data-project-local="true"'));
  assert((await (await fetch(portal.url + '/hub')).text()).includes('brain-canvas'));
  const status = await (await fetch(portal.url + '/api/workspace/status')).json();
  assert.equal(status.capabilities.hub, true);
  assert.equal(status.storage.status, 'ready');
  const room = await fetch(portal.url + '/api/workspace/hub/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shadow-Brain-Project': status.project.id }, body: JSON.stringify({ goal: 'Verify the packed project hub persists a shared room.', key: 'packed-room-operation' }) });
  assert.equal(room.status, 200);
  const roomResult = await room.json();
  assert.equal(roomResult.room.goal, 'Verify the packed project hub persists a shared room.');
  const uploaded = await fetch(portal.url + '/api/workspace/hub/documents?name=packed.pdf', { method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-Shadow-Brain-Project': status.project.id }, body: ${JSON.stringify(fixturePdf)} });
  assert.equal(uploaded.status, 200);
  const source = await uploaded.json();
  assert.equal(source.document.status, 'ready', source.document.error);
  assert.equal(source.pages[0].text, ${JSON.stringify(fixturePhrase)});
  const approved = await fetch(portal.url + '/api/workspace/hub/documents/' + source.document.id + '/review', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shadow-Brain-Project': status.project.id }, body: JSON.stringify({ page: 1, decision: 'approve', key: 'packed-page-approval' }) });
  assert.equal(approved.status, 200);
  const page = (await approved.json()).pages[0];
  assert.equal(page.status, 'approved');
  const scoped = await (await fetch(portal.url + '/api/workspace/memories?project=' + status.project.id)).json();
  assert(JSON.stringify(scoped).includes(page.memoryId));
} finally { await portal.close(); }
assert(fs.existsSync(${JSON.stringify(localDb)}));
const demo = await startDemoWorkspace({ activity: false });
try { assert((await (await fetch(demo.url + '/workspace')).text()).includes('data-demo="true"')); }
finally { await demo.close(); }
assert(!fs.existsSync(demo.directory));
`);
runNode([portalProbe]);

for (const [modulePath, name, marker] of [
  ['workspace-html', 'WORKSPACE_HTML', 'Memory relationships'],
  ['live-workspace-html', 'LIVE_WORKSPACE_HTML', 'Live operations'],
  ['v6-dashboard-html', 'V6_DASHBOARD_HTML', 'Recorded network'],
]) {
  const loaded = await import(pathToFileURL(path.join(installed, 'dist/dashboard', modulePath + '.js')).href);
  const html = loaded[name];
  assert(html.includes(marker));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert(scripts.length > 0);
  for (const [, script] of scripts) new Script(script);
}
const readme = fs.readFileSync(path.join(installed, 'README.md'), 'utf8');
const packedPaths = new Set(pack.files.map(file => file.path));
for (const [, target] of readme.matchAll(/!\[[^\]]*]\((docs\/assets\/[^)]+\.(?:png|gif))\)/g)) {
  assert(packedPaths.has(target), 'README image is missing from tarball: ' + target);
  const png = fs.readFileSync(path.join(installed, target));
  if (target.endsWith('.png')) assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  else assert.match(png.subarray(0, 6).toString(), /^GIF8[79]a$/);
}
assert(!fs.existsSync(path.join(sandbox, 'config')), 'isolated memory, workflow, activity and workspace probes must avoid provider configuration');
console.log(JSON.stringify({
  status: 'PASS', version: manifest.version, tarball, integrity: pack.integrity,
  checks: ['pack allowlist and SHA-512 integrity', 'fresh install', 'public exports and declarations',
    'CLI version/help', 'durable write', 'storage health', 'explained recall', 'corrupt-store preservation',
    'configuration isolation', 'six packaged skills', 'all four client layouts', 'preview without writes',
    'instruction preservation', 'idempotent install', 'local-edit conflict', 'workflow CLI/file/library',
    'scoped context CLI/library', 'persistent feature controls', 'disabled memory-read bypass',
    'curation CLI and context suppression', 'activity CLI and cursor', 'stdio handshake and tool permissions',
    'measured and reported metadata without tool arguments', 'served live workspace and telemetry', 'workspace scripts and README artwork',
    'project inspection without script execution', 'local knowledge and protected skill apply', 'reversible task feedback and reporter attribution',
    'fresh MCP project recipe, resources and prompts', 'persistent project portal and isolated demo teardown', 'packed PDF extraction and approval', 'demo CLI invalid-port validation'],
}, null, 2));
