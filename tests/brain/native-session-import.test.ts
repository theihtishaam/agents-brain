import * as path from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { parseNativeSession } from '../../src/brain/native-session-import.js';

const workspace = path.resolve('synthetic-workspace');
const lines = (...records: object[]) => Buffer.from(records.map(record => JSON.stringify(record)).join('\n') + '\n');
const json = (record: object) => Buffer.from(JSON.stringify(record));
const now = '2026-11-14T00:00:00.000Z';
const visible = (text: string) => [{ type: 'text', text }];

function zipped(entries: Array<{ name: string; data: Buffer }>): Buffer {
  let offset = 0;
  const locals: Buffer[] = [], directory: Buffer[] = [];
  for (const { name, data } of entries) {
    const label = Buffer.from(name), result = deflateRawSync(data), crc = crc32(data);
    const local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(result.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(label.length, 26);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(result.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(label.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, label, result); directory.push(central, label); offset += local.length + label.length + result.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.reduce((total, item) => total + item.length, 0), 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directory, end]);
}

describe('explicit native session exports', () => {
  it('keeps Codex names from the matching index and omits hidden rollout payloads', () => {
    const metadata = { type: 'session_meta', timestamp: now, payload: { id: 'thread-one', cwd: workspace } };
    const event = (role: string, type: string, text: string) => ({ type: 'response_item', timestamp: now, payload: { type: 'message', role, content: [{ type, text }] } });
    const rollout = lines(metadata, event('user', 'input_text', '  Keep exact words.  '), event('user', 'input_text', '<environment_context>non-chat private sentinel'),
      { type: 'response_item', payload: { type: 'reasoning', content: 'private reasoning sentinel' } }, event('assistant', 'output_text', 'Visible response.'));
    const raw = parseNativeSession('codex', 'rollout.jsonl', rollout, workspace);
    expect(raw).toMatchObject({ sessionId: 'thread-one', titleExact: null, titleOrigin: 'unavailable', omitted: 2,
      messages: [{ role: 'user', locator: 'line:2', text: '  Keep exact words.  ' }, { role: 'assistant', locator: 'line:5', text: 'Visible response.' }] });
    const bundle = json({ format: 'codex-rollout-v1', rollout: rollout.toString(), sessionIndex: [
      { id: 'thread-one', thread_name: 'Previous name' }, { id: 'other-thread', thread_name: 'Wrong title sentinel' },
      { id: 'thread-one', thread_name: ' An exact renamed title ', updated_at: now },
    ] });
    const named = parseNativeSession('codex', 'export.json', bundle, workspace);
    expect(named).toMatchObject({ titleExact: ' An exact renamed title ', titleOrigin: 'host-name', workspaceRoot: workspace });
    expect(JSON.stringify(named)).not.toMatch(/sentinel/u);
  });

  it('keeps Claude main-chain roles and exact custom names, without branch or compacted prompt text', () => {
    const seed = { sessionId: 'claude-session', cwd: workspace, timestamp: now };
    const event = (type: string, uuid: string, parentUuid: string | null, text: string, other = {}) => ({ ...seed, type, uuid, parentUuid, message: { content: visible(text) }, ...other });
    const source = lines(event('user', 'uuid-1', null, 'Prompt'), event('assistant', 'uuid-2', 'uuid-1', 'Abandoned branch sentinel'),
      event('assistant', 'uuid-3', 'uuid-1', 'Main answer'), event('assistant', 'uuid-4', 'uuid-1', 'Sidechain sentinel', { isSidechain: true }),
      { ...seed, type: 'custom-title', customTitle: 'Claude exact name' });
    const selected = parseNativeSession('claude-code', 'session.jsonl', source, workspace);
    expect(selected).toMatchObject({ titleExact: 'Claude exact name', omitted: 3, messages: [
      { id: 'uuid-1', text: 'Prompt' }, { id: 'uuid-3', text: 'Main answer' },
    ] });
    const sdk = json({ format: 'claude-agent-sdk-v1', session: { sessionId: 'session-id', cwd: workspace, summary: 'Do not use summary' }, messages: [
      { type: 'assistant', uuid: 'uuid-1', session_id: 'session-id', message: { content: [...visible('answer'), { type: 'thinking', thinking: 'reasoning sentinel' }] } },
    ] });
    expect(parseNativeSession('claude-code', 'sdk.json', sdk, workspace)).toMatchObject({ titleExact: null, messages: [{ text: 'answer' }] });
  });

  it('accepts OpenCode V1 and V2 exports and removes tool and reasoning content', () => {
    const info = { id: 'ses-fixture', projectID: 'project-fixture', location: { directory: workspace }, title: 'OpenCode title', parentID: 'ses-parent', time: {} };
    const source = json({ info, messages: [{ id: 'm1', type: 'user', text: 'Hi', files: [{ path: 'attachment sentinel' }] },
      { id: 'm2', type: 'assistant', content: [{ type: 'reasoning', text: 'reasoning sentinel' }, ...visible('Answer')] },
      { id: 'm3', type: 'system', text: 'system sentinel' }] });
    const selected = parseNativeSession('opencode', 'opencode.json', source, workspace);
    expect(selected).toMatchObject({ titleExact: 'OpenCode title', parentNativeId: 'ses-parent', omitted: 1, messages: [{ text: 'Hi' }, { text: 'Answer' }] });
    expect(JSON.stringify(selected)).not.toContain('sentinel');
    expect(() => parseNativeSession('opencode', 'bad.json', json({ info, messages: [{ id: 'm', type: 'user', text: 'Duplicated' },
      { id: 'm', type: 'user', text: 'Conflict' }] }), workspace)).toThrow(/repeats/u);
    expect(() => parseNativeSession('opencode', 'old.json', json({ info: { ...info, location: undefined }, messages: [] }), workspace)).toThrow(/supported/u);
    const v1 = json({ info: { ...info, location: undefined, directory: workspace }, messages: [{ info: { id: 'm1', sessionID: info.id, role: 'assistant' },
      parts: [...visible('V1 answer'), { type: 'text', text: 'synthetic sentinel', synthetic: true }, { type: 'reasoning', text: 'hidden sentinel' }] }] });
    expect(parseNativeSession('opencode', 'old.json', v1, workspace)).toMatchObject({ format: 'opencode-session-v1', messages: [{ text: 'V1 answer' }] });
  });

  it('extracts only the root DeepSeek V4 log and rejects malformed archives', () => {
    const transcript = lines({ type: 'session', version: 4, id: 'deepseek-thread', cwd: workspace, createdAt: now },
      { type: 'session/title', data: { title: 'DeepSeek native name' } },
      { type: 'user/message', surfaceOp: 'append', data: { source: { kind: 'user' }, content: visible('Selected prompt') } },
      { type: 'user/message', surfaceOp: 'append', data: { source: { kind: 'system' }, content: visible('injected sentinel') } },
      { type: 'assistant/message', surfaceOp: 'append', data: { message: { content: [...visible('Selected reply'), { type: 'reasoning', text: 'reasoning sentinel' }] } } });
    const name = 'session.v4.jsonl';
    const selected = parseNativeSession('deepseek-harness', 'conversation.zip', zipped([{ name, data: transcript },
      { name: '../private.txt', data: Buffer.from('attachment sentinel') }]), workspace);
    expect(selected).toMatchObject({ titleExact: 'DeepSeek native name', omitted: 2, messages: [{ text: 'Selected prompt' }, { text: 'Selected reply' }] });
    expect(JSON.stringify(selected)).not.toContain('sentinel');
    expect(() => parseNativeSession('deepseek-harness', 'conversation.zip', zipped([{ name, data: transcript }, { name, data: transcript }]), workspace)).toThrow(/one bounded root/u);
    expect(() => parseNativeSession('deepseek-harness', 'conversation.zip', zipped([{ name: '../session.v4.jsonl', data: transcript }]), workspace)).toThrow(/one bounded root/u);
    expect(() => parseNativeSession('deepseek-harness', 'conversation.zip', zipped([{ name, data: Buffer.alloc(2 * 1024 * 1024 + 1) }]), workspace)).toThrow(/one bounded root/u);
  });
});
