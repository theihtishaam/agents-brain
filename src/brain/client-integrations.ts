import * as fs from 'node:fs';
import * as path from 'node:path';
import { WORKFLOW_TARGETS, listBundledSkills, type WorkflowTarget } from './workflow-skills.js';
import type { GlobalBrain } from './global-brain.js';
import { buildClientConfig } from './client-config.js';
import { projectRoot } from './project-kit-paths.js';

export const CLIENT_CAPABILITIES = Object.freeze([
  { id: 'codex', label: 'Codex', target: 'codex', docs: 'https://developers.openai.com/codex/mcp/' },
  { id: 'claude-code', label: 'Claude Code', target: 'claude-code', docs: 'https://code.claude.com/docs/en/mcp' },
  { id: 'opencode', label: 'OpenCode', target: 'opencode', docs: 'https://opencode.ai/docs/mcp-servers/' },
  { id: 'deepseek-harness', label: 'DeepSeek Harness', target: 'deepseek-harness', docs: 'https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md' },
  { id: 'portable', label: 'Other compatible clients', target: 'portable', docs: 'https://modelcontextprotocol.io/specification/2025-06-18/basic/transports' },
] as const);

/** Inspect only explicitly selected project skill files, never client profiles or credentials. */
function safeProject(projectDir: string): string {
  return projectRoot(projectDir);
}

function inspectSkill(root: string, relativePath: string): 'present' | 'missing' | 'blocked' {
  const parts = relativePath.split('/');
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat: fs.Stats | undefined;
    try { stat = fs.lstatSync(current, { throwIfNoEntry: false }); }
    catch { return 'blocked'; }
    if (!stat) return 'missing';
    if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) return 'blocked';
  }
  return 'present';
}

export function inspectClientIntegrations(options: { projectDir?: string; brain?: GlobalBrain; localProjectId?: string } = {}) {
  let root: string | undefined;
  let projectError: string | undefined;
  if (options.projectDir) {
    try { root = safeProject(options.projectDir); }
    catch (error) { projectError = error instanceof Error ? error.message : 'Project inspection failed.'; }
  }
  const skills = listBundledSkills().map(skill => skill.name);
  const agents = CLIENT_CAPABILITIES.map(client => {
    const skillRoot = WORKFLOW_TARGETS[client.target as WorkflowTarget].skillRoot;
    const checks = root ? skills.map(name => inspectSkill(root!, skillRoot + '/' + name + '/SKILL.md')) : [];
    const present = checks.filter(state => state === 'present').length;
    const blocked = checks.includes('blocked');
    const installation = projectError || blocked ? 'blocked' : !root ? 'not-checked' : present === skills.length ? 'complete' : present ? 'partial' : 'missing';
    return {
      id: client.id, label: client.label, installation, presentSkills: present, totalSkills: skills.length,
      capabilities: ['Project workflow skills', 'MCP stdio when configured', 'Scoped context packs'],
      detail: projectError || (blocked ? 'A skill path is linked or not a regular file. It was not read.' : root
        ? present + ' of ' + skills.length + ' skill files found. Host loading and live connections are not checked.'
        : 'Choose a project to check skill-file presence. No client profile is inspected.'),
      command: 'shadow-brain skills install . --target ' + client.target + ' --apply', docs: client.docs,
      config: buildClientConfig(client.id, root, options.localProjectId ? { dbPath: options.brain?.dbPath, projectId: options.localProjectId } : {}),
      ...(client.id === 'deepseek-harness' ? { note: 'Enable the filesystem-skill and MCP client plugins in the host; no MCP server is enabled by default.' } : {}),
    };
  });
  const [major, minor] = process.versions.node.split('.').map(Number);
  const supported = (major === 22 && minor >= 13) || major === 24 || major >= 26;
  const health = options.brain?.getStorageHealth();
  const checks = [
    { id: 'node', label: 'Node.js runtime', status: supported ? 'pass' : 'error', detail: process.versions.node },
    { id: 'project', label: 'Selected project', status: projectError ? 'error' : root ? 'pass' : 'unknown', detail: projectError || (root ? 'Project skill paths checked without reading client profiles.' : 'No project selected.') },
    { id: 'storage', label: 'Memory storage', status: health?.lastError ? 'error' : health?.initialized ? 'pass' : 'unknown',
      detail: health?.lastError ? 'Storage reports ' + health.lastError.code + '.' : health?.initialized ? 'Store initialized; ' + health.pendingOperations + ' pending operations.' : 'Not initialized in this process. No read success is claimed.' },
    { id: 'stdio', label: 'MCP transport', status: 'pass', detail: 'Standalone memory/workflow stdio service is included. This is capability information, not a connected-client claim.', command: 'shadow-brain mcp --stdio' },
  ];
  const result = { checkedAt: new Date().toISOString(), version: '7.1.4', checks, agents };
  return { ...result, diagnostics: JSON.stringify({ version: result.version, checkedAt: result.checkedAt, node: process.versions.node,
    checks, agents: agents.map(({ id, installation, presentSkills, totalSkills }) => ({ id, installation, presentSkills, totalSkills })) }, null, 2) };
}
