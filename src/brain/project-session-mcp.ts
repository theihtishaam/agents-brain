import { z } from 'zod';
import type { MCPTool } from '../types.js';
import { hubId } from './project-hub-contract.js';
import { openSessionInput, recordSessionInput, resumeSessionFields, sessionInput, sessionMessageWindow, type SessionActor } from './project-session-contract.js';
import type { ProjectSessions } from './project-sessions.js';

const empty = z.strictObject({});
const sessionIdInput = sessionMessageWindow.extend({ sessionId: hubId });
const checkpointRead = z.strictObject({ sessionId: hubId, checkpointId: hubId });
const update = z.strictObject({ sessionId: hubId, command: recordSessionInput });
const resume = z.strictObject({ sessionId: hubId, ...resumeSessionFields });

export const SESSION_MCP_TOOLS = {
  session_list: {
    description: 'List explicitly reported sessions in this project. Recent reports do not verify a native chat is currently running.',
    input: empty, readOnly: true,
    run: (sessions: ProjectSessions, raw: unknown) => { sessionInput(empty, raw); return sessions.list(); },
  },
  session_read: {
    description: 'Read a reported session, a bounded page of messages, checkpoint summaries, and the inherited handoff if available. Pass nextBefore as before to read older messages.',
    input: sessionIdInput, readOnly: true,
    run: (sessions: ProjectSessions, raw: unknown) => {
      const { sessionId, limit, before } = sessionInput(sessionIdInput, raw);
      return sessions.read(sessionId, limit, before);
    },
  },
  session_checkpoint_read: {
    description: 'Read one immutable checkpoint by session and checkpoint ID. Use its recorded SHA-256 when resuming.',
    input: checkpointRead, readOnly: true,
    run: (sessions: ProjectSessions, raw: unknown) => {
      const { sessionId, checkpointId } = sessionInput(checkpointRead, raw);
      return sessions.readCheckpoint(sessionId, checkpointId);
    },
  },
  session_open: {
    description: 'Open a reported project session for the current connection. Use an optional host chat label and no private transcript or credentials. Keep the operation key for retries.',
    input: openSessionInput, readOnly: false,
    run: (sessions: ProjectSessions, raw: unknown, actor: SessionActor) => sessions.open(raw, actor),
  },
  session_record: {
    description: 'Set status or append an explicitly supplied message or checkpoint to this connection’s session. Include only user-approved handoff material. Keep the operation key for retries.',
    input: update, readOnly: false,
    run: (sessions: ProjectSessions, raw: unknown, actor: SessionActor) => {
      const { sessionId, command } = sessionInput(update, raw);
      return sessions.record(sessionId, command, actor);
    },
  },
  session_resume: {
    description: 'Open a new project session from an immutable saved checkpoint. The original session remains available. Supply the checkpoint ID and its recorded SHA-256.',
    input: resume, readOnly: false,
    run: (sessions: ProjectSessions, raw: unknown, actor: SessionActor) => {
      const { sessionId, ...input } = sessionInput(resume, raw);
      return sessions.resume(sessionId, input, actor);
    },
  },
} as const;

export type SessionMcpTool = keyof typeof SESSION_MCP_TOOLS;
export function isSessionMcpTool(name: string): name is SessionMcpTool { return Object.hasOwn(SESSION_MCP_TOOLS, name); }
export const SESSION_MCP_DEFINITIONS: MCPTool[] = Object.entries(SESSION_MCP_TOOLS).map(([name, tool]) => ({
  name, description: tool.description, inputSchema: z.toJSONSchema(tool.input),
  annotations: { readOnlyHint: tool.readOnly, idempotentHint: true, destructiveHint: false, openWorldHint: false },
}));
