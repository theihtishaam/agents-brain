import type { Readable, Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import * as path from 'node:path';
import { MCPServer } from './mcp-server.js';
import { getGlobalBrain, GlobalBrain } from './global-brain.js';
import { FeatureSettingsStore } from './feature-settings.js';
import { resolveProjectStore } from './project-memory.js';
import type { MCPRequest, MCPResponse } from '../types.js';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Newline-delimited MCP, with bounded input and sequential backpressure. */
export async function serveMCPStdio(
  server: Pick<MCPServer, 'handleRequest'>,
  input: Readable,
  output: Writable,
): Promise<void> {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let initialized = false;
  let ready = false;
  // Node emits a stream error after invoking a failed write callback. Keep a
  // lifetime listener until those queued events settle, even after send rejects.
  const consumeOutputError = () => {};
  output.on('error', consumeOutputError);
  const send = async (message: unknown) => {
    let payload = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(payload) > MAX_RESPONSE_BYTES) {
      payload = JSON.stringify({ jsonrpc: '2.0', id: (message as MCPResponse).id ?? null,
        error: { code: -32001, message: 'Result exceeds 4 MiB. Request fewer memories or a smaller context.' } }) + '\n';
    }
    await new Promise<void>((resolve, reject) => {
      if (output.destroyed || output.writableEnded) return reject(new Error('MCP output is closed.'));
      const timeout = setTimeout(() => finish(new Error('MCP output write timed out.')), 30_000);
      const closed = () => finish(new Error('MCP output closed before delivery.'));
      const finish = (error?: Error | null) => {
        clearTimeout(timeout);
        output.off('close', closed);
        output.off('error', finish);
        error ? reject(error) : resolve();
      };
      output.once('close', closed);
      output.once('error', finish);
      output.write(payload, finish);
    });
  };
  const error = (id: unknown, code: number, message: string) => send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  const dispatch = async (line: string) => {
    if (!line.trim()) return;
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES) throw new Error('MCP message exceeds 1 MiB.');
    let value: unknown;
    try { value = JSON.parse(line); } catch { await error(null, -32700, 'Invalid JSON.'); return; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      await error(null, -32600, 'Expected one JSON-RPC message.'); return;
    }
    const request = value as MCPRequest;
    const valid = request.jsonrpc === '2.0' && typeof request.method === 'string' &&
      (request.id === undefined || typeof request.id === 'string' || (typeof request.id === 'number' && Number.isFinite(request.id))) &&
      (request.params === undefined || (request.params !== null && typeof request.params === 'object' && !Array.isArray(request.params)));
    if (!valid) { await error(null, -32600, 'Invalid JSON-RPC request.'); return; }
    // Notifications never receive responses and never dispatch mutating tool calls.
    if (request.id === undefined) {
      if (request.method === 'notifications/initialized' && initialized) ready = true;
      return;
    }
    if (request.method === 'initialize') {
      if (initialized) { await error(request.id, -32600, 'Already initialized.'); return; }
      if (typeof request.params?.protocolVersion !== 'string' || !record(request.params.clientInfo) || !record(request.params.capabilities) ||
        typeof request.params.clientInfo.name !== 'string' || !request.params.clientInfo.name.trim() ||
        typeof request.params.clientInfo.version !== 'string' || !request.params.clientInfo.version.trim()) {
        await error(request.id, -32602, 'Initialization requires protocolVersion, clientInfo, and capabilities.'); return;
      }
      const response = await server.handleRequest(request);
      if (!response.error) initialized = true;
      await send(response);
      return;
    }
    if (request.method !== 'ping' && !ready) {
      await error(request.id, -32002, 'Initialize and send notifications/initialized before using tools.'); return;
    }
    const response: MCPResponse = await server.handleRequest(request);
    await send(response);
  };
  try {
  for await (const chunk of input) {
    pending += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    let newline: number;
    while ((newline = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, newline);
      pending = pending.slice(newline + 1);
      await dispatch(line);
    }
    if (Buffer.byteLength(pending) > MAX_MESSAGE_BYTES) throw new Error('MCP message exceeds 1 MiB.');
  }
  pending += decoder.end();
  if (pending.trim()) await error(null, -32700, 'Connection ended before the message newline.');
  } finally {
    await new Promise<void>(resolve => setImmediate(resolve));
    output.off('error', consumeOutputError);
  }
}

/** Provider-free entry point: no orchestrator, client-profile scan, or config merge. */
export async function runMemoryMCPStdio(options: { dbPath?: string; settingsPath?: string; projectDir?: string; projectId?: string } = {}): Promise<void> {
  if (options.projectId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(options.projectId)) throw new TypeError('Project ID must be a bounded identifier.');
  const dbPath = options.dbPath ? path.resolve(options.dbPath) : undefined;
  const local = options.projectDir ? resolveProjectStore(options.projectDir, dbPath) : undefined;
  if (local && options.projectId && options.projectId !== local.projectId) throw new TypeError('A project-local MCP service must use its pinned project identifier.');
  const storagePath = local?.storagePath ?? dbPath;
  const brain = storagePath ? GlobalBrain.createIsolated({ dbPath: storagePath }) : getGlobalBrain();
  const settings = new FeatureSettingsStore({ filePath: options.settingsPath ??
    (storagePath ? path.join(path.dirname(storagePath), 'feature-settings.json') : undefined) });
  const server = new MCPServer(null, { authToken: '', toolProfile: 'memory' }, { brain, settings, projectDir: local?.root ?? options.projectDir, projectId: local?.projectId ?? options.projectId, localProject: !!local });
  try { await serveMCPStdio(server, process.stdin, process.stdout); }
  finally { await server.finishMemorySession(); await brain.shutdown(); }
}
