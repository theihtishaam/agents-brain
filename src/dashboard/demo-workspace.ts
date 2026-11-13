import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as http from 'node:http';
import { GlobalBrain } from '../brain/global-brain.js';
import { FeatureSettingsStore } from '../brain/feature-settings.js';
import { memoryAnnotationsFor } from '../brain/memory-annotations.js';
import { ActivityJournal } from '../brain/activity-journal.js';
import { MCPServer } from '../brain/mcp-server.js';
import { handleWorkspaceRequest } from './workspace-api.js';
import { WORKSPACE_HTML } from './workspace-html.js';
import { LIVE_WORKSPACE_HTML } from './live-workspace-html.js';
import { BRAIN_HUB_HTML } from './brain-hub-html.js';
import { WorkspaceRuntime } from './workspace-status.js';
import type { AgentTool } from '../types.js';

export interface DemoWorkspaceOptions { port?: number; activity?: boolean }
const projectId = 'demo-checkout';
const seeds: Array<[string, string, string, string?]> = [
  ['decision', 'Retry only idempotent checkout requests.\nA stable idempotency key keeps a retry from charging twice.', 'docs/checkout/decision.md'],
  ['pattern', 'retryBudgetPolicy limits reconnect attempts.\nUse capped exponential backoff with jitter; retries share a request budget.', 'src/retryBudgetPolicy.ts'],
  ['verification', 'A retry test proves one charge after a connection reset.\nThe synthetic fixture records three attempts and one committed operation.', 'tests/checkout-retry.test.ts'],
  ['warning', 'Do not retry validation failures.\nOnly transient connection failures enter the retry queue.', 'docs/checkout/errors.md'],
  ['lesson', 'The old retry loop reused stale request bodies.', 'docs/checkout/history.md'],
  ['decision', 'A reviewed retry queue preserves the original request identity.', 'docs/checkout/replacement.md'],
  ['lesson', 'A team note proposes retrying all failures.', ''],
  ['research', 'Latency measurements distinguish queue wait from tool execution.', 'docs/telemetry.md'],
  ['pattern', 'Cancellation releases the queue slot before admitting another request.', 'src/cancel-request.ts'],
  ['decision', 'Project context remains scoped unless broader retrieval is explicitly enabled.', 'docs/context-policy.md'],
  ['reference', 'Import replay uses the recorded checksum to deduplicate work.', 'src/import/replay.ts'],
  ['verification', 'A bounded importer rejects duplicate events without changing prior commits.', 'tests/import/replay.test.ts'],
  ['release', 'Release checks include migrations, rollback and retry regression cases.', 'docs/release.md'],
  ['research', 'Java worker interop uses the stable queue protocol.', 'docs/java-worker.md'],
  ['pattern', 'JavaScript UI state is separate from the Java worker protocol.', 'docs/ui-state.md'],
  ['lesson', 'Review the remaining retry assumption with the team.', ''],
  ['lesson', 'Review the remaining retry assumption with the team.', ''],
  ['warning', 'Exception boundaries must preserve the original request identifier.', 'src/errors.ts'],
  ['decision', 'A separate billing worker owns settlement reconciliation.', 'docs/billing.md', 'demo-billing'],
  ['pattern', 'Billing retry limits follow the settlement queue policy.', 'src/billing/retry.ts', 'demo-billing'],
];

/** An isolated loopback tour. Never discovers clients or opens default memory/provider configuration. */
export async function startDemoWorkspace(options: DemoWorkspaceOptions = {}) {
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError('Demo port must be an integer from 0 to 65535.');
  const tempRoot = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(tempRoot, 'shadow-brain-demo-'));
  const dbPath = path.join(directory, 'global.json');
  const brain = GlobalBrain.getInstance({ dbPath, syncIntervalMs: 60_000 });
  if (brain.dbPath !== dbPath) {
    fs.rmdirSync(directory);
    throw new Error('Run demo in a separate CLI process so its memory store stays isolated.');
  }
  const settings = new FeatureSettingsStore({ filePath: path.join(directory, 'feature-settings.json') });
  const journal = new ActivityJournal({ filePath: path.join(directory, 'activity-journal.json') });
  const servers: MCPServer[] = [];
  const runtime = new WorkspaceRuntime('demo');
  let listener: http.Server | undefined;
  let timer: NodeJS.Timeout | undefined;
  let task: Promise<void> | undefined;
  let closing: Promise<void> | undefined;
  let stopped = false;
  const close = () => closing ??= (async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (listener?.listening) {
      listener.closeAllConnections();
      await new Promise<void>((resolve, reject) => listener!.close(error => error ? reject(error) : resolve()));
    }
    if (task) await task.catch(() => {});
    for (const server of servers) await server.finishMemorySession();
    await brain.shutdown();
    const resolved = path.resolve(directory);
    const relative = path.relative(tempRoot, resolved);
    if (!relative.startsWith('shadow-brain-demo-') || relative.includes(path.sep) ||
        fs.lstatSync(resolved).isSymbolicLink() || fs.realpathSync(resolved) !== resolved) throw new Error('Demo cleanup path changed; temporary files were retained.');
    fs.rmSync(resolved, { recursive: true });
  })();
  try {
    await brain.init();
    const ids = seeds.map(([category, content, source, project], index) => brain.writeSync({
      projectId: project ?? projectId, projectName: project ? 'Billing worker · demo' : 'Checkout API · demo',
      category, content, agentTool: (['codex', 'claude-code', 'opencode'] as AgentTool[])[index % 3],
      importance: category === 'warning' ? 0.85 : 0.7, metadata: source ? { source } : {},
    }));
    await brain.sync();
    const annotations = memoryAnnotationsFor(brain);
    for (const [from, to, type] of [[2, 0, 'supports'], [0, 1, 'related'], [3, 6, 'contradicts'], [5, 4, 'supersedes'], [10, 11, 'supports'], [1, 12, 'related']] as const) {
      await annotations.update({ kind: 'link', projectId, fromId: ids[from], toId: ids[to], type, note: 'Synthetic demonstration relationship.' });
    }
    await annotations.update({ kind: 'review', projectId, memoryId: ids[6], state: 'contested', note: 'Synthetic note awaiting evidence.' });
    await settings.update({ activityRecording: true, liveActivity: true });
    for (let i = 0; i < 3; i++) {
      const server = new MCPServer(null, { toolProfile: 'memory', authToken: '' }, { brain, settings, projectDir: directory, projectId });
      servers.push(server);
      await server.handleRequest({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2025-11-25', clientInfo: { name: 'synthetic-demo-' + i, version: '1' }, capabilities: {},
      } });
    }
    let step = 0;
    const tick = async () => {
      const server = servers[step % servers.length];
      const phase = (['understand', 'plan', 'work', 'verify'] as const)[Math.floor(step / servers.length) % 4];
      await server.handleRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: {
        name: 'activity_report', arguments: { kind: 'phase', phase, agent: 'demo-worker-' + (step % servers.length + 1) },
      } });
      const calls = [
        { name: 'context_pack', arguments: { projectId, query: 'Fix checkout retryBudgetPolicy', profile: 'adaptive', tokenBudget: 1800 } },
        { name: 'memory_health', arguments: { projectId, limit: 5 } },
        { name: 'memory_inspect', arguments: { projectId, memoryId: ids[step % 18] } },
      ];
      await server.handleRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: calls[step % calls.length] });
      step++;
    };
    for (let i = 0; i < 9; i++) await tick();
    listener = http.createServer((req, res) => {
      const actualPort = (listener!.address() as { port: number }).port;
      if (!['127.0.0.1:' + actualPort, 'localhost:' + actualPort].includes(req.headers.host ?? '')) {
        res.writeHead(403); res.end('Unsupported host.'); return;
      }
      if (req.url?.startsWith('/api/workspace/')) {
        void handleWorkspaceRequest(req, res, { brain, settings, annotations, journal, demo: true, runtime }); return;
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed.'); return; }
      let pathname: string;
      try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname; }
      catch { res.writeHead(400); res.end('Invalid request URL.'); return; }
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const html = pathname === '/' || pathname === '/hub' ? BRAIN_HUB_HTML : pathname === '/workspace' || pathname === '/memory-workspace' ? WORKSPACE_HTML : pathname === '/live' ? LIVE_WORKSPACE_HTML : null;
      if (!html) { res.writeHead(404); res.end('This demo serves /workspace and /live.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(html.replace('<html ', '<html data-demo="true" '));
    });
    await new Promise<void>((resolve, reject) => {
      listener!.once('error', reject);
      listener!.listen(port, '127.0.0.1', () => { listener!.off('error', reject); resolve(); });
    });
    if (options.activity !== false) {
      const schedule = () => {
        if (stopped) return;
        timer = setTimeout(() => {
          task = tick().catch(() => { console.error('A synthetic demo activity cycle failed; the workspace remains available.'); }).finally(schedule);
        }, 1800);
      };
      schedule();
    }
    return { url: 'http://127.0.0.1:' + (listener.address() as { port: number }).port, directory, close };
  } catch (error) { await close(); throw error; }
}
