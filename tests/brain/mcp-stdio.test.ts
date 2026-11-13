import { it, expect } from 'vitest';
import { Readable, Writable } from 'node:stream';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { serveMCPStdio } from '../../src/brain/mcp-stdio.js';
import { FeatureSettingsStore } from '../../src/brain/feature-settings.js';

const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2025-06-18', clientInfo: { name: 'synthetic-test', version: '1' }, capabilities: {},
} };
const initialized = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (id: number, name: string, args: object = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });

it('runs the actual CLI handshake and read-only tools with clean stdout and no provider config access', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-stdio-'));
  const dbPath = path.join(root, 'global.json');
  fs.writeFileSync(dbPath, 'invalid synthetic memory store');
  const configDir = path.join(root, 'provider-config-must-not-open');
  fs.mkdirSync(configDir);
  const config = path.join(configDir, 'config.json');
  fs.writeFileSync(config, 'invalid synthetic provider configuration');
  const settings = new FeatureSettingsStore({ filePath: path.join(root, 'feature-settings.json') });
  await settings.update({ contextAssembly: false });
  const input = [initialize, initialized, { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    call(3, 'workflow_analyze', { request: 'Fix this typo' }), call(4, 'context_pack', { projectId: 'demo', query: 'café' }),
    call(5, 'auto_config'), call(6, 'global_recall', { limit: 100000 }), call(7, 'global_recall', { limit: 1 }),
    { jsonrpc: '2.0', id: 8, method: 'ping' }].map(value => JSON.stringify(value)).join('\n') + '\n';
  const result = spawnSync(process.execPath, ['dist/cli.js', 'mcp', '--stdio', '--db', dbPath], {
    cwd: process.cwd(), encoding: 'utf8', input, timeout: 20_000,
    env: { ...process.env, SHADOW_BRAIN_CONFIG_DIR: configDir },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  const messages = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  expect(messages.map(message => message.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(messages[0].result.protocolVersion).toBe('2025-06-18');
  expect(messages[1].result.tools.some((tool: any) => tool.name === 'auto_config')).toBe(false);
  expect(messages[1].result.tools.filter((tool: any) => tool.name !== 'activity_report').every((tool: any) => tool.annotations.readOnlyHint)).toBe(true);
  expect(messages[1].result.tools.find((tool: any) => tool.name === 'activity_report').annotations.readOnlyHint).toBe(false);
  expect(JSON.parse(messages[3].result.content[0].text).enabled).toBe(false);
  expect(messages[4].error.code).toBe(-32601);
  expect(messages[5].error.code).toBe(-32602);
  expect(messages[6].result.isError).toBe(true);
  expect(messages[7].result).toEqual({});
  expect(fs.readFileSync(dbPath, 'utf8')).toBe('invalid synthetic memory store');
  expect(fs.readFileSync(config, 'utf8')).toBe('invalid synthetic provider configuration');
  expect(fs.existsSync(path.join(root, 'memory-annotations.json'))).toBe(false);
  const journal = JSON.parse(fs.readFileSync(path.join(root, 'activity-journal.json'), 'utf8'));
  expect(journal.events.some((event: any) => event.kind === 'tool-end' && event.tool === 'context_pack' && event.source === 'measured')).toBe(true);
  expect(JSON.stringify(journal)).not.toContain('café');
  expect(JSON.stringify(journal)).not.toContain('invalid synthetic memory store');
}, 20_000);

it('rejects malformed initialization, obeys notification silence, and decodes split UTF-8', async () => {
  const seen: any[] = [];
  const server = { handleRequest: async (request: any) => { seen.push(request); return { jsonrpc: '2.0' as const, id: request.id, result: request.params ?? {} }; } };
  const malformed = { ...initialize, params: { protocolVersion: '2025-06-18', clientInfo: 'bad', capabilities: [] } };
  const text = [malformed, call(2, 'workflow_skills'), initialize, initialized, call(3, 'workflow_analyze', { request: 'café' })].map(value => JSON.stringify(value)).join('\n') + '\n';
  const bytes = Buffer.from(text);
  const split = bytes.indexOf(Buffer.from('é')) + 1;
  let output = '';
  await serveMCPStdio(server, Readable.from([bytes.subarray(0, split), bytes.subarray(split)]), new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } }));
  const messages = output.trim().split('\n').map(line => JSON.parse(line));
  expect(messages[0].error.code).toBe(-32602);
  expect(messages[1].error.code).toBe(-32002);
  expect(seen).toHaveLength(2);
  expect(seen[1].params.arguments.request).toBe('café');
  expect(messages).toHaveLength(4);
});

it('honors recording gates, isolates journal failures, and labels explicit host reports', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-mcp-activity-'));
  const dbPath = path.join(root, 'global.json');
  const journalPath = path.join(root, 'activity-journal.json');
  const settings = new FeatureSettingsStore({ filePath: path.join(root, 'feature-settings.json') });
  const run = (requests: object[]) => {
    const result = spawnSync(process.execPath, ['dist/cli.js', 'mcp', '--stdio', '--db', dbPath, '--project-id', 'fixture-project'], {
      encoding: 'utf8', input: [initialize, initialized, ...requests].map(value => JSON.stringify(value)).join('\n') + '\n', timeout: 20_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    return { ...result, messages: result.stdout.trim().split('\n').map(line => JSON.parse(line)) };
  };
  try {
    await settings.update({ activityRecording: false });
    const disabled = run([call(2, 'workflow_skills'), call(3, 'activity_report', { kind: 'phase', phase: 'plan' })]);
    expect(disabled.messages[1].result.isError).toBeUndefined();
    expect(JSON.parse(disabled.messages[2].result.content[0].text).recorded).toBe(false);
    expect(fs.existsSync(journalPath)).toBe(false);
    await settings.update({ activityRecording: true });
    fs.writeFileSync(journalPath, 'synthetic broken journal');
    const corrupt = run([call(2, 'workflow_skills')]);
    expect(corrupt.messages[1].result.isError).toBeUndefined();
    expect(corrupt.stderr.match(/recording is unavailable/g)).toHaveLength(1);
    expect(fs.readFileSync(journalPath, 'utf8')).toBe('synthetic broken journal');
    fs.unlinkSync(journalPath);
    const enabled = run([call(2, 'workflow_skills'), call(3, 'activity_report', { kind: 'phase', phase: 'plan' }),
      call(4, 'activity_report', { kind: 'phase', phase: 'work', source: 'measured' })]);
    expect(enabled.messages[3].error.code).toBe(-32602);
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
    expect(journal.events.map((event: any) => event.kind)).toEqual(['session-start', 'tool-start', 'tool-end', 'phase', 'session-end']);
    const [start, toolStart, toolEnd, phase, end] = journal.events;
    expect(start.projectId).toBe('fixture-project');
    expect(toolEnd).toMatchObject({ source: 'measured', transport: 'mcp', outcome: 'success', correlationId: toolStart.correlationId, sessionId: start.sessionId });
    expect(toolEnd.durationMs).toBeGreaterThanOrEqual(0);
    expect(phase).toMatchObject({ source: 'reported', transport: 'host', phase: 'plan', sessionId: start.sessionId });
    expect(end.sessionId).toBe(start.sessionId);
    expect(fs.existsSync(dbPath)).toBe(false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 20_000);

it('terminates when backpressured output closes, and limits oversized input/results', async () => {
  const server = { handleRequest: async (request: any) => ({ jsonrpc: '2.0' as const, id: request.id, result: {} }) };
  const output = new Writable({ highWaterMark: 1, write() { setImmediate(() => output.destroy()); } });
  await expect(serveMCPStdio(server, Readable.from([JSON.stringify(initialize) + '\n']), output)).rejects.toThrow(/closed/);
  const failingOutput = new Writable({ write(_chunk, _encoding, done) { done(new Error('Synthetic broken pipe')); } });
  await expect(serveMCPStdio(server, Readable.from([JSON.stringify(initialize) + '\n']), failingOutput)).rejects.toThrow('Synthetic broken pipe');
  await expect(serveMCPStdio(server, Readable.from(['x'.repeat(1024 * 1024 + 1)]), new Writable({ write(_c, _e, done) { done(); } }))).rejects.toThrow(/1 MiB/);
  let content = '';
  await serveMCPStdio({ handleRequest: async (request: any) => ({ jsonrpc: '2.0', id: request.id, result: 'x'.repeat(4 * 1024 * 1024) }) },
    Readable.from([JSON.stringify(initialize) + '\n']), new Writable({ write(chunk, _encoding, done) { content += chunk.toString(); done(); } }));
  expect(JSON.parse(content).error.code).toBe(-32001);
});
