import * as path from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';
import { z } from 'zod';
import { digest } from './project-hub-store.js';
import { ProjectSessionError, SESSION_LIMITS } from './project-session-contract.js';

export const NATIVE_SESSION_BYTES = 2 * 1024 * 1024;
const toolSchema = z.enum(['codex', 'claude-code', 'opencode', 'deepseek-harness']);
const controls = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u;
const titleControls = /[\x00-\x1f\x7f]/u;
const label = (limit: number) => z.string().min(1).max(limit).refine(value => value.trim().length > 0 && !titleControls.test(value));
const timestamp = z.string().datetime().nullable();
const sha256 = z.string().regex(/^[0-9a-f]{64}$/u);
const message = z.strictObject({ id: label(128), locator: label(240), role: z.enum(['user', 'assistant']), createdAt: timestamp,
  text: z.string().min(1).max(8000).refine(value => !!value.trim() && !controls.test(value)) });
export const nativeSnapshot = z.strictObject({ tool: toolSchema, format: label(80), filename: label(150), sha256, sessionId: label(128),
  titleExact: label(512).nullable(), titleOrigin: z.enum(['host-name', 'host-generated', 'unavailable']), workspaceRoot: label(1024).nullable(),
  createdAt: timestamp, updatedAt: timestamp, parentNativeId: label(128).nullable(), groupSessionId: label(128).nullable().optional(), omitted: z.number().int().min(0).max(100_000),
  pageCoverage: z.strictObject({ kind: z.literal('page'), direction: z.literal('newest-first'), hasEarlier: z.boolean(), hasLater: z.boolean(), cursorSha256: sha256.nullable(), omittedInPage: z.number().int().min(0).max(100_000) }).optional(),
  messages: z.array(message).max(SESSION_LIMITS.messages),
});
export type NativeSessionSnapshot = z.infer<typeof nativeSnapshot>;
export type NativeSessionTool = z.infer<typeof toolSchema>;
type RecordValue = Record<string, unknown>;
type Message = z.infer<typeof message>;
type Parsed = Omit<NativeSessionSnapshot, 'tool' | 'filename' | 'sha256'>;

const invalid = (message: string): never => { throw new ProjectSessionError('NATIVE_SESSION_INVALID', message, 400); };
const row = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value : null;
const id = (value: unknown) => str(value) ?? invalid('The export is missing its native conversation ID.');
const time = (value: unknown): string | null => {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(numeric) && Math.abs(numeric) <= 8.64e15 ? new Date(numeric).toISOString() : null;
};
const title = (value: unknown): Pick<Parsed, 'titleExact' | 'titleOrigin'> => {
  const exact = str(value);
  return { titleExact: exact, titleOrigin: exact ? 'host-name' : 'unavailable' };
};
const visible = (value: unknown, blockType = 'text') => typeof value === 'string' ? value : array(value).flatMap(raw => {
  const block = row(raw);
  return block.type === blockType && typeof block.text === 'string' ? [block.text] : [];
}).join('');

function messages(records: unknown[], extract: (record: RecordValue, index: number) => Message | undefined) {
  if (records.length > 20_000) invalid('The export exceeds the supported record limit.');
  const retained: Message[] = [];
  let omitted = 0;
  for (const [index, raw] of records.entries()) {
    const item = extract(row(raw), index);
    if (item?.text.trim()) retained.push(item);
    else omitted++;
  }
  return { messages: retained, omitted };
}

function json(text: string): unknown {
  try { return JSON.parse(text) as unknown; }
  catch { return invalid('The selected export is not valid JSON.'); }
}

function jsonl(text: string): Array<{ record: RecordValue; line: number }> {
  const lines = text.split(/\r?\n/u);
  if (lines.length > 20_001) invalid('The export exceeds the supported line count.');
  return lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    if (Buffer.byteLength(line) > 512 * 1024) invalid('An exported record exceeds the supported line size.');
    const record = row(json(line));
    if (!Object.keys(record).length) invalid('Each JSONL record must be an object.');
    return [{ record, line: index + 1 }];
  });
}

function codex(text: string, filename: string): Parsed {
  const envelope = filename.toLowerCase().endsWith('.json') ? row(json(text)) : undefined;
  const rollout = envelope ? str(envelope.rollout) ?? invalid('Use an export containing a Codex rollout string and matching thread metadata.') : text;
  if (envelope && envelope.format !== 'codex-rollout-v1') invalid('Unsupported Codex export format.');
  const lines = jsonl(rollout);
  const header = lines[0]?.record;
  if (header?.type !== 'session_meta') invalid('The Codex rollout must start with session metadata.');
  const meta = row(header.payload), sessionId = id(meta.id);
  const index = array(envelope?.sessionIndex);
  const indexed = index.map(row).filter(item => item.id === sessionId).at(-1);
  if (index.length && !indexed) invalid('The supplied Codex title index does not contain this thread.');
  const latest = lines.at(-1)?.record;
  if (lines.slice(1).some(({ record }) => record.type === 'session_meta')) invalid('Export one Codex thread at a time.');
  return { format: 'codex-rollout-v1', sessionId, ...title(indexed?.thread_name), workspaceRoot: str(meta.cwd),
    createdAt: time(meta.timestamp ?? header.timestamp), updatedAt: time(indexed?.updated_at ?? latest?.timestamp), parentNativeId: str(meta.forked_from_id),
    ...messages(lines.slice(1), entry => {
      const item = row(entry.record), payload = row(item.payload), line = String(entry.line);
      const role = payload.role;
      if (item.type !== 'response_item' || payload.type !== 'message' || (role !== 'user' && role !== 'assistant')) return;
      if (role === 'user' && array(payload.content).some(block => {
        const value = str(row(block).text);
        return value !== null && /^(?:<environment_context>|# AGENTS\.md instructions\b|<user_instructions>)/u.test(value.trimStart());
      })) return;
      return { id: typeof payload.id === 'string' ? payload.id : `line:${line}`, locator: `line:${line}`, role,
        createdAt: time(item.timestamp), text: visible(payload.content, role === 'user' ? 'input_text' : 'output_text') };
    }),
  };
}

function claudeJsonl(text: string): Parsed {
  const lines = jsonl(text);
  const main = lines.filter(({ record }) => !record.isSidechain && !record.teamName);
  const turns = main.filter(({ record }) => str(record.uuid) && ['user', 'assistant', 'system', 'attachment', 'progress'].includes(String(record.type)));
  const byId = new Map(turns.map(entry => [entry.record.uuid, entry]));
  if (!turns.length || byId.size !== turns.length) invalid('Use a Claude conversation export with distinct message IDs.');
  const parents = new Set(turns.map(entry => entry.record.parentUuid).filter(Boolean));
  const leaf = turns.findLast(({ record }) => !record.isMeta && !parents.has(record.uuid) && (record.type === 'user' || record.type === 'assistant')) ??
    turns.findLast(({ record }) => !record.isMeta && (record.type === 'user' || record.type === 'assistant'));
  if (!leaf) return invalid('The Claude export does not identify a main conversation.');
  const sessionId = id(leaf.record.sessionId);
  const chain: typeof turns = [];
  const seen = new Set<unknown>();
  for (let cursor: typeof leaf | undefined = leaf; cursor; cursor = byId.get(cursor.record.parentUuid)) {
    if (seen.has(cursor.record.uuid) || (cursor.record.sessionId && cursor.record.sessionId !== sessionId)) invalid('The Claude export contains an inconsistent conversation chain.');
    seen.add(cursor.record.uuid);
    chain.unshift(cursor);
  }
  const names = main.filter(({ record }) => record.type === 'custom-title' && record.sessionId === sessionId);
  const parsed = messages(chain, entry => {
    const item = row(entry.record), role = item.type;
    if (item.isMeta || item.isCompactSummary || (role !== 'user' && role !== 'assistant')) return;
    return { id: id(item.uuid), locator: `line:${String(entry.line)}`, role, createdAt: time(item.timestamp), text: visible(row(item.message).content) };
  });
  return { format: 'claude-jsonl-v1', sessionId, ...title(names.at(-1)?.record.customTitle), workspaceRoot: str(leaf.record.cwd),
    createdAt: time(chain[0]?.record.timestamp), updatedAt: time(leaf.record.timestamp), parentNativeId: null,
    messages: parsed.messages, omitted: parsed.omitted + lines.length - chain.length };
}

function claude(text: string, filename: string): Parsed {
  if (filename.toLowerCase().endsWith('.jsonl')) return claudeJsonl(text);
  const root = row(json(text)), info = row(root.session);
  if (root.format !== 'claude-agent-sdk-v1' || !Array.isArray(root.messages)) invalid('Use a selected Claude Agent SDK conversation export.');
  const sessionId = id(info.sessionId);
  return { format: 'claude-agent-sdk-v1', sessionId, ...title(info.customTitle), workspaceRoot: str(info.cwd),
    createdAt: time(info.createdAt), updatedAt: time(info.lastModified), parentNativeId: null,
    ...messages(array(root.messages), (item, index) => {
      if (item.session_id !== sessionId) invalid('A Claude message belongs to a different conversation.');
      const role = item.type;
      if (role !== 'user' && role !== 'assistant') return;
      return { id: id(item.uuid), locator: `/messages/${index}`, role, createdAt: time(item.timestamp), text: visible(row(item.message).content) };
    }),
  };
}

/** Read one root canonical log from a selected ZIP, without extracting paths or attachments. */
function deepSeekZip(bytes: Uint8Array): Uint8Array {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fail = () => invalid('The DeepSeek ZIP must contain one bounded root session log.');
  if (zip.length < 22) return fail();
  let end = zip.length - 22;
  const earliest = Math.max(0, end - 0xffff);
  while (end >= earliest && (zip.readUInt32LE(end) !== 0x06054b50 || end + 22 + zip.readUInt16LE(end + 20) !== zip.length)) end--;
  if (end < earliest || zip.readUInt16LE(end + 4) !== 0 || zip.readUInt16LE(end + 6) !== 0) return fail();
  const entries = zip.readUInt16LE(end + 10), start = zip.readUInt32LE(end + 16), directorySize = zip.readUInt32LE(end + 12);
  if (entries < 1 || entries > 500 || entries !== zip.readUInt16LE(end + 8) || start + directorySize !== end) return fail();
  let offset = start;
  let log: Buffer | undefined;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || zip.readUInt32LE(offset) !== 0x02014b50) return fail();
    const flags = zip.readUInt16LE(offset + 8), method = zip.readUInt16LE(offset + 10), checksum = zip.readUInt32LE(offset + 16);
    const compressed = zip.readUInt32LE(offset + 20), expanded = zip.readUInt32LE(offset + 24), nameLength = zip.readUInt16LE(offset + 28);
    const local = zip.readUInt32LE(offset + 42), nameEnd = offset + 46 + nameLength;
    const next = nameEnd + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
    if (next > end) return fail();
    const name = zip.subarray(offset + 46, nameEnd);
    offset = next;
    if (!/^session(?:\.v4)?\.jsonl$/u.test(name.toString('ascii'))) continue;
    if (log || (flags & 0x41) !== 0 || (method !== 0 && method !== 8) || !expanded || expanded > NATIVE_SESSION_BYTES ||
        local + 30 > start || zip.readUInt32LE(local) !== 0x04034b50 || zip.readUInt16LE(local + 6) !== flags || zip.readUInt16LE(local + 8) !== method) return fail();
    const localNameEnd = local + 30 + zip.readUInt16LE(local + 26), data = localNameEnd + zip.readUInt16LE(local + 28);
    if (data + compressed > start || !name.equals(zip.subarray(local + 30, localNameEnd))) return fail();
    const payload = zip.subarray(data, data + compressed);
    try { log = method === 0 ? payload : inflateRawSync(payload, { maxOutputLength: NATIVE_SESSION_BYTES }); }
    catch { return fail(); }
    if (log.length !== expanded || crc32(log) !== checksum) return fail();
  }
  return offset === end && log ? log : fail();
}

function openCode(text: string): Parsed {
  const root = row(json(text)), info = row(root.info), location = row(info.location), times = row(info.time);
  const legacy = !str(location.directory) && !!str(info.directory);
  const workspaceRoot = str(legacy ? info.directory : location.directory);
  if (!Array.isArray(root.messages) || !workspaceRoot || !str(info.projectID)) invalid('Use a supported OpenCode session export.');
  const sessionId = id(info.id);
  return { format: legacy ? 'opencode-session-v1' : 'opencode-session-v2', sessionId, ...title(info.title), workspaceRoot,
    createdAt: time(times.created), updatedAt: time(times.updated), parentNativeId: str(info.parentID),
    ...messages(array(root.messages), (item, index) => {
      if (legacy) {
        const entry = row(item.info), role = entry.role;
        if (!Array.isArray(item.parts) || entry.sessionID !== sessionId) invalid('An OpenCode message belongs to a different conversation or export format.');
        if (role !== 'user' && role !== 'assistant') return;
        const parts = item.parts as unknown[];
        return { id: id(entry.id), locator: `/messages/${index}`, role, createdAt: time(row(entry.time).created),
          text: visible(parts.filter(part => !row(part).synthetic && !row(part).ignored)) };
      }
      if (typeof item.type !== 'string') invalid('An OpenCode V2 message is missing its type.');
      if (item.sessionID !== undefined && item.sessionID !== sessionId) invalid('An OpenCode message belongs to a different conversation.');
      const role = item.type;
      if (role !== 'user' && role !== 'assistant') return;
      return { id: id(item.id), locator: `/messages/${index}`, role, createdAt: time(row(item.time).created),
        text: role === 'user' ? str(item.text) ?? '' : visible(item.content) };
    }),
  };
}

function deepSeek(text: string): Parsed {
  const lines = jsonl(text), header = lines[0]?.record;
  if (!header || header.type !== 'session' || header.version !== 4) return invalid('Use a single DeepSeek Harness canonical version 4 session log.');
  const events = lines.slice(1);
  if (events.some(({ record }) => record.type === 'session')) invalid('Export one DeepSeek session at a time.');
  const renamed = events.findLast(({ record }) => record.type === 'session/title');
  const sessionId = id(header.id), parent = row(header.parentSession);
  return { format: 'deepseek-session-v4', sessionId, ...title(row(renamed?.record.data).title), workspaceRoot: str(header.cwd),
    createdAt: time(header.createdAt), updatedAt: time(events.at(-1)?.record.createdAt), parentNativeId: str(parent.sessionId ?? parent.id ?? header.parentSession),
    ...messages(events, entry => {
      const event = row(entry.record), data = row(event.data);
      if (event.surfaceOp !== 'append') return;
      const role = event.type === 'user/message' && row(data.source).kind === 'user' ? 'user' : event.type === 'assistant/message' ? 'assistant' : null;
      if (!role) return;
      const locator = `line:${String(entry.line)}`;
      return { id: str(event.id) ?? locator, locator, role, createdAt: time(event.createdAt),
        text: visible(role === 'user' ? data.content : row(data.message).content) };
    }),
  };
}

export function validateNativeSnapshot(value: unknown, root: string): NativeSessionSnapshot {
  const parsed = nativeSnapshot.safeParse(value);
  if (!parsed.success) return invalid('The export contains invalid fields or more than 200 visible messages.');
  const snapshot = parsed.data;
  const coverage = snapshot.pageCoverage;
  if (coverage && (snapshot.tool !== 'codex' || snapshot.format !== 'codex-app-server-v1' || coverage.omittedInPage !== snapshot.omitted || coverage.hasLater !== (coverage.cursorSha256 !== null))) {
    invalid('The native history page coverage is inconsistent.');
  }
  if ((snapshot.titleOrigin === 'unavailable') !== (snapshot.titleExact === null) || snapshot.filename.startsWith('.') ||
      !/^[^\\/:*?"<>|\x00-\x1f\x7f]{1,140}\.(?:json|jsonl|zip)$/iu.test(snapshot.filename) ||
      (/\.zip$/iu.test(snapshot.filename) && snapshot.tool !== 'deepseek-harness')) invalid('The export metadata is invalid.');
  if (snapshot.workspaceRoot !== null) {
    const workspace = snapshot.workspaceRoot;
    if (!path.isAbsolute(workspace) || path.relative(root, workspace)) {
      throw new ProjectSessionError('NATIVE_SESSION_SCOPE', 'This export records a different workspace. Open that workspace to import it.', 409);
    }
  }
  if (new Set(snapshot.messages.map(item => item.id)).size !== snapshot.messages.length ||
      new Set(snapshot.messages.map(item => item.locator)).size !== snapshot.messages.length) invalid('The export repeats a native message ID or locator.');
  if (Buffer.byteLength(JSON.stringify(snapshot)) > NATIVE_SESSION_BYTES) invalid('The conversation exceeds the supported export size.');
  return snapshot;
}

export function parseNativeSession(tool: unknown, filename: unknown, bytes: Uint8Array, projectRoot: string): NativeSessionSnapshot {
  const selected = toolSchema.safeParse(tool);
  if (!selected.success || typeof filename !== 'string') return invalid('Choose one supported export and select its originating tool.');
  if (!bytes.length || bytes.length > NATIVE_SESSION_BYTES) invalid('The selected export must be at most 2 MiB.');
  const selectedBytes = selected.data === 'deepseek-harness' && /\.zip$/iu.test(filename) ? deepSeekZip(bytes) : bytes;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(selectedBytes); }
  catch { return invalid('Use a UTF-8 JSON or JSONL export.'); }
  const adapters = { codex, 'claude-code': claude, opencode: openCode, 'deepseek-harness': deepSeek };
  return validateNativeSnapshot({ ...adapters[selected.data](text, filename), tool: selected.data, filename, sha256: digest(bytes) }, projectRoot);
}
