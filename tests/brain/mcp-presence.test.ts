import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MCP_PRESENCE_FILE, MCP_PRESENCE_LIMITS, MCPPresenceStore, startMCPPresence } from '../../src/brain/mcp-presence.js';
import { serveMCPStdio } from '../../src/brain/mcp-stdio.js';

const identity = (tool = 'codex') => ({ id: 'mcp-' + randomUUID(), tool });
let root: string, filename: string, clock: number, store: MCPPresenceStore;
beforeEach(() => {
  root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'sb-presence-')));
  filename = path.join(root, '.shadow-brain', MCP_PRESENCE_FILE);
  clock = Date.parse('2026-11-14T00:00:00.000Z');
  store = new MCPPresenceStore(root, 'synthetic-project', () => clock);
});
afterEach(() => {
  vi.useRealTimers();
  if (path.dirname(root) !== fs.realpathSync.native(os.tmpdir()) || !path.basename(root).startsWith('sb-presence-')) throw new Error('Unexpected fixture path.');
  fs.rmSync(root, { recursive: true, force: true });
});

it('reads without creating storage and exposes exact connection expiry', () => {
  expect(store.read(true)).toMatchObject({ enabled: true, count: 0, connections: [] });
  expect(store.read(false)).toMatchObject({ enabled: false, count: null, connections: [] });
  expect(fs.readdirSync(root)).toEqual([]);
  const first = identity(), second = identity('opencode');
  store.report(first);
  clock += 1000;
  store.report(second);
  const page = store.read(true);
  expect(page.tools).toEqual([{ tool: 'codex', count: 1 }, { tool: 'opencode', count: 1 }]);
  expect(page.connections[0]).toMatchObject({ ...first, ageMs: 1000, expiresAt: '2026-11-14T00:00:30.000Z' });
  const bytes = fs.readFileSync(filename);
  clock += MCP_PRESENCE_LIMITS.ttlMs - 1000;
  expect(store.read(true).connections.map(row => row.id)).toEqual([second.id]);
  expect(fs.readFileSync(filename)).toEqual(bytes);
  store.remove(second.id);
  expect(store.read(true).count).toBe(0);
});

it('renews connection rows, removes them on a recording pause, and never renews after stop', () => {
  vi.useFakeTimers();
  let enabled = true;
  const connection = identity();
  const stop = startMCPPresence(store, connection, () => enabled);
  expect(store.read(true).count).toBe(1);
  clock += MCP_PRESENCE_LIMITS.renewMs;
  vi.advanceTimersByTime(MCP_PRESENCE_LIMITS.renewMs);
  expect(store.read(true).connections[0]).toMatchObject({ ageMs: 0, startedAt: '2026-11-14T00:00:00.000Z' });
  enabled = false;
  vi.advanceTimersByTime(MCP_PRESENCE_LIMITS.renewMs);
  expect(store.read(true).count).toBe(0);
  enabled = true;
  vi.advanceTimersByTime(MCP_PRESENCE_LIMITS.renewMs);
  expect(store.read(true).count).toBe(1);
  stop();
  vi.advanceTimersByTime(100_000);
  expect(store.read(true).count).toBe(0);
});

it('caps the store at 128 rows and prunes expired entries before admitting another connection', () => {
  for (let index = 0; index < MCP_PRESENCE_LIMITS.connections; index++) store.report(identity());
  expect(store.read(true).count).toBe(128);
  const extra = identity();
  expect(() => store.report(extra)).toThrow(expect.objectContaining({ code: 'MCP_PRESENCE_LIMIT' }));
  clock += MCP_PRESENCE_LIMITS.ttlMs;
  store.report(extra);
  expect(store.read(true).connections.map(row => row.id)).toEqual([extra.id]);
});

it('fails without changing invalid storage, foreign data, or a hard-linked file', () => {
  fs.mkdirSync(path.dirname(filename));
  const invalid = Buffer.from('invalid synthetic presence store');
  fs.writeFileSync(filename, invalid);
  expect(() => store.read(true)).toThrow(expect.objectContaining({ code: 'MCP_PRESENCE_UNAVAILABLE' }));
  expect(() => store.report(identity())).toThrow(expect.objectContaining({ code: 'MCP_PRESENCE_UNAVAILABLE' }));
  expect(fs.readFileSync(filename)).toEqual(invalid);
  fs.unlinkSync(filename);
  store.report(identity());
  const actual = fs.readFileSync(filename);
  expect(() => new MCPPresenceStore(root, 'another-project', () => clock).read(true)).toThrow(/could not be read/u);
  fs.linkSync(filename, path.join(root, 'unsafe-link.sqlite'));
  expect(() => store.read(true)).toThrow(/could not be read/u);
  expect(fs.readFileSync(filename)).toEqual(actual);
});

it('starts only after a successful stdio handshake and stops on output close with input still idle', async () => {
  const input = new PassThrough(), write = vi.fn((_chunk, _encoding, done) => done());
  const output = new Writable({ write });
  const stop = vi.fn(), begin = vi.fn(() => stop);
  const task = serveMCPStdio({ startStdioPresence: begin, handleRequest: async request => ({ jsonrpc: '2.0', id: request.id, result: {} }) }, input, output);
  const notify = () => input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  notify();
  input.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25',
    clientInfo: { name: 'fixture', version: '1' }, capabilities: {} } }) + '\n');
  await expect.poll(() => write.mock.calls.length).toBe(1);
  expect(begin).not.toHaveBeenCalled();
  notify(); notify();
  await expect.poll(() => begin.mock.calls.length).toBe(1);
  output.destroy();
  await expect.poll(() => stop.mock.calls.length).toBe(1);
  input.end();
  await task;
  expect(stop).toHaveBeenCalledTimes(1);
});
