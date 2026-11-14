import type { IncomingMessage } from 'node:http';
import type { GlobalBrain } from '../brain/global-brain.js';
import { ProjectPolicyError, ProjectPolicyStore, hiddenChatSessions, projectChatKey, projectPolicyCommand, toolPolicyLabel } from '../brain/project-policy.js';
import { ProjectSessions } from '../brain/project-sessions.js';

export async function projectPolicyRequest(request: IncomingMessage, root: string, projectId: string, brain: GlobalBrain,
  readBody: () => Promise<Record<string, unknown>>) {
  if (request.method !== 'GET' && request.method !== 'POST') throw new ProjectPolicyError('PROJECT_POLICY_METHOD', 'Use GET or POST for project controls.', 405);
  if (request.headers.origin && request.headers.origin !== 'http://' + request.headers.host ||
      ['cross-site', 'same-site'].includes(String(request.headers['sec-fetch-site']))) {
    throw new ProjectPolicyError('PROJECT_POLICY_ORIGIN', 'Project controls accept same-origin requests.', 403);
  }
  const store = new ProjectPolicyStore(root, projectId);
  let policy = store.get();
  const sessions = new ProjectSessions(root, brain).list().sessions;
  if (request.method === 'POST') {
    const command = projectPolicyCommand.safeParse(await readBody());
    if (!command.success) throw new ProjectPolicyError('PROJECT_POLICY_INVALID', 'Send a valid project control change and current revision.', 400);
    const selection = 'sessionId' in command.data ? command.data.sessionId : undefined;
    policy = await store.update(command.data, sessions.find(item => item.id === selection));
  }
  const hidden = hiddenChatSessions(policy, sessions);
  const tools = new Set(['codex', 'claude-code', 'opencode', 'deepseek-harness', 'mcp-client',
    ...sessions.filter(item => item.actor.kind === 'agent').map(item => toolPolicyLabel(item.actor.tool)), ...policy.tools.map(item => item.tool)]);
  return { policy, tools: [...tools].sort(), chats: sessions.map(session => {
    const key = projectChatKey(session);
    const shareContext = policy.chats.find(item => item.key === key)?.shareContext ?? true;
    return { id: session.id, title: session.native?.titleExact ?? session.title, tool: session.native?.tool ?? session.actor.tool,
      key, shareContext, inheritedBlocked: shareContext && hidden.has(session.id),
      role: policy.roles.find(item => item.sessionId === session.id)?.role ?? null };
  }) };
}
