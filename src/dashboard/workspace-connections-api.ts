import { z } from 'zod';
import { discoverAgentHosts, isDiscoverableHost, reportedHost } from '../brain/host-discovery.js';
import { MCPPresenceStore } from '../brain/mcp-presence.js';
import { ProjectPolicyStore, toolParticipates } from '../brain/project-policy.js';
import { WorkspaceConnections, WorkspaceConnectionsError } from '../brain/workspace-connections.js';

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1);
const base = { expectedRevision: revision, expectedPolicyRevision: revision };
const host = z.string().refine(isDiscoverableHost);
const command = z.discriminatedUnion('action', [
  z.strictObject({ ...base, action: z.literal('automatic'), enabled: z.boolean() }),
  z.strictObject({ ...base, action: z.literal('participation'), enabled: z.boolean() }),
  z.strictObject({ ...base, action: z.literal('admission'), host, enabled: z.boolean() }),
  z.strictObject({ ...base, action: z.literal('connect'), host }),
  z.strictObject({ ...base, action: z.literal('disconnect'), host }),
]);
const conflict = () => new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_CONFLICT', 'Project controls changed. Refresh and try again.', 409);
const scanInterval = 60_000;

export class WorkspaceConnectionsApi {
  private readonly manager: WorkspaceConnections;
  private readonly policy: ProjectPolicyStore;
  private readonly presence: MCPPresenceStore;
  private scan?: { at: number; result: ReturnType<typeof discoverAgentHosts> };
  private timer?: NodeJS.Timeout;
  private refreshIssue?: string;

  constructor(root: string, private readonly projectId: string, private readonly recording: () => boolean,
    private readonly discover: typeof discoverAgentHosts = discoverAgentHosts) {
    this.manager = new WorkspaceConnections(root, projectId, () => this.discovery().hosts.find(host => host.id === 'opencode')?.openCodeMajor);
    this.policy = new ProjectPolicyStore(root, projectId);
    this.presence = new MCPPresenceStore(root, projectId);
  }

  start() {
    // A portal may have been started after another process enabled automatic setup.
    const tick = () => {
      try {
        if (this.manager.automaticEnabled()) this.reconcile();
        this.refreshIssue = undefined;
      } catch { this.refreshIssue = 'Automatic setup could not finish. Review project configuration and refresh.'; }
    };
    tick();
    this.timer = setInterval(tick, scanInterval).unref();
  }

  close() { clearInterval(this.timer); }

  private discovery() {
    if (!this.scan || performance.now() - this.scan.at >= scanInterval) {
      this.scan = { at: performance.now(), result: this.discover() };
    }
    return this.scan.result;
  }

  private reconcile() {
    const policy = this.policy.get();
    if (policy.participationEnabled === false) return;
    const ids = this.discovery().hosts.filter(host => host.status === 'detected' && toolParticipates(policy, host.id) &&
      (host.id !== 'opencode' || host.openCodeMajor !== undefined)).map(host => host.id);
    this.manager.reconcile(ids);
  }

  read() {
    const settings = this.manager.read();
    const policy = this.policy.get();
    const detection = this.discovery();
    const presence = this.presence.read(this.recording());
    return { projectId: this.projectId, revision: settings.revision, policyRevision: policy.revision,
      autoConnect: settings.automatic, participationEnabled: policy.participationEnabled !== false,
      detectionLimited: detection.limited, refreshIssue: this.refreshIssue,
      hosts: settings.connectors.map(connector => {
        const found = detection.hosts.find(item => item.id === connector.id);
        const conflict = connector.status === 'modified' || connector.status === 'conflict';
        const unknownOpenCode = connector.id === 'opencode' && connector.status === 'available' && found?.openCodeMajor === undefined;
        const shared = connector.status === 'configured' && !connector.ownsConfiguration;
        const evidence = found?.evidence.map(entry => (entry.kind === 'path-command' ? 'Command: ' : entry.kind === 'installed-launcher' ? 'Installed: ' : 'Extension: ') + entry.value) ?? [];
        if (found?.openCodeMajor) evidence.push('OpenCode V' + found.openCodeMajor + ' setup');
        return { id: connector.id, label: connector.label, installation: found?.status ?? 'unknown',
          evidence: evidence.join(' · '),
          mode: connector.configurationPath && !unknownOpenCode ? 'workspace' : 'manual', configurationPath: connector.configurationPath,
          configuration: conflict ? 'conflict' : shared ? 'shared' : connector.status === 'configured' ? 'managed' : unknownOpenCode ? 'manual' : connector.status,
          locallyAllowed: connector.allowed,
          enabled: connector.allowed && toolParticipates(policy, connector.id),
          connected: presence.enabled ? presence.connections.filter(item => reportedHost(item.tool) === connector.id).length : null,
          notes: [...(conflict ? ['Existing or changed configuration requires manual review.'] : []),
            ...(unknownOpenCode ? ['Confirm the installed generation with opencode --version. The recipe below uses V2. For V1, move the shadow_brain entry directly under mcp.'] : []),
            ...(shared ? ['This project file is managed through the other host that shares .mcp.json.'] : []), ...connector.recipe.notes].join(' '),
          docs: connector.docs, recipe: connector.recipe.content };
      }) };
  }

  async change(input: unknown) {
    const parsed = command.safeParse(input);
    if (!parsed.success) throw new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_INVALID', 'Send a valid connection control and both current revisions.', 400);
    const entry = parsed.data;
    const settings = this.manager.read(), policy = this.policy.get();
    if (settings.revision !== entry.expectedRevision || policy.revision !== entry.expectedPolicyRevision) throw conflict();
    if (entry.action === 'participation') {
      await this.policy.update({ kind: 'set-project-participation', enabled: entry.enabled, expectedRevision: policy.revision });
      if (entry.enabled && settings.automatic) this.reconcile();
    } else if (entry.action === 'automatic') {
      this.manager.apply({ kind: 'set-automatic', enabled: entry.enabled, expectedRevision: settings.revision });
      if (entry.enabled) this.reconcile();
    } else if (entry.action === 'admission') {
      // If both controls deny a host, clearing the local exclusion first keeps policy denial in force until the revision check succeeds.
      this.manager.apply({ kind: 'set-allowed', id: entry.host, enabled: entry.enabled, expectedRevision: settings.revision });
      if (entry.enabled && policy.tools.some(item => item.tool === entry.host && !item.enabled)) {
        await this.policy.update({ kind: 'set-tool-participation', tool: entry.host, enabled: true, expectedRevision: policy.revision });
      }
    } else {
      if (entry.action === 'connect' && entry.host === 'opencode' &&
          this.discovery().hosts.find(host => host.id === 'opencode')?.openCodeMajor === undefined &&
          settings.connectors.find(host => host.id === 'opencode')?.status !== 'configured') {
        throw new WorkspaceConnectionsError('WORKSPACE_CONNECTIONS_VERSION_UNKNOWN', 'Confirm the OpenCode generation and use its setup guide.', 409);
      }
      this.manager.apply({ kind: entry.action === 'connect' ? 'configure' : 'remove', id: entry.host, expectedRevision: settings.revision });
    }
    return this.read();
  }
}
