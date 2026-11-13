import * as http from 'node:http';
import { GlobalBrain } from '../brain/global-brain.js';
import { projectStorage } from '../brain/project-memory.js';
import { FeatureSettingsStore } from '../brain/feature-settings.js';
import { memoryAnnotationsFor } from '../brain/memory-annotations.js';
import { ActivityJournal } from '../brain/activity-journal.js';
import { handleWorkspaceRequest } from './workspace-api.js';
import { WORKSPACE_HTML } from './workspace-html.js';
import { LIVE_WORKSPACE_HTML } from './live-workspace-html.js';
import { BRAIN_HUB_HTML } from './brain-hub-html.js';
import { WorkspaceRuntime } from './workspace-status.js';
import { ProjectHubService } from '../brain/project-hub.js';

/** Persistent, provider-free project portal. Closing never deletes project files. */
export async function startProjectWorkspace(directory: string, options: { port?: number } = {}) {
  const port = options.port ?? 0;
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError('Project port must be an integer from 0 to 65535.');
  const store = projectStorage(directory);
  const brain = GlobalBrain.createIsolated({ dbPath: store.storagePath });
  const settings = new FeatureSettingsStore({ filePath: store.settingsPath });
  const journal = new ActivityJournal({ filePath: store.journalPath });
  const annotations = memoryAnnotationsFor(brain);
  const requests = new Set<Promise<void>>();
  const runtime = new WorkspaceRuntime('project', { id: store.projectId, name: store.projectName, root: store.root });
  let hub: ProjectHubService | undefined;
  const prepareStorage = async (): Promise<string | null> => {
    try {
      await brain.init();
      brain.refresh();
      if (brain.getStorageHealth().lastError) return 'Project memory could not be read. Repair the project store, then retry.';
      hub ??= new ProjectHubService(store.root, brain);
      hub.checkStorage();
      return null;
    } catch { return 'Project storage could not be opened. Check its files and permissions, then retry.'; }
  };
  let listener: http.Server | undefined;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    if (listener?.listening) {
      listener.closeAllConnections();
      await new Promise<void>((resolve, reject) => listener!.close(error => error ? reject(error) : resolve()));
    }
    await Promise.allSettled([...requests]);
    hub?.close();
    await brain.shutdown();
  })();
  try {
    await prepareStorage();
    listener = http.createServer((req, res) => {
      const actualPort = (listener!.address() as { port: number }).port;
      if (!['127.0.0.1:' + actualPort, 'localhost:' + actualPort].includes(req.headers.host ?? '')) {
        res.writeHead(403); res.end('Unsupported host.'); return;
      }
      if (req.url?.startsWith('/api/workspace/')) {
        const task = handleWorkspaceRequest(req, res, { brain, settings, annotations, journal, projectDir: store.root, localProject: true,
          runtime, get hub() { return hub; }, prepareStorage });
        requests.add(task); void task.finally(() => requests.delete(task)); return;
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed.'); return; }
      let pathname: string;
      try { pathname = new URL(req.url ?? '/', 'http://localhost').pathname; }
      catch { res.writeHead(400); res.end('Invalid request URL.'); return; }
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      const html = pathname === '/' || pathname === '/hub' ? BRAIN_HUB_HTML : pathname === '/workspace' || pathname === '/memory-workspace' ? WORKSPACE_HTML : pathname === '/live' ? LIVE_WORKSPACE_HTML : null;
      if (!html) { res.writeHead(404); res.end('This project portal serves /hub, /workspace and /live.'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      res.end(html.replace('<html ', '<html data-project-local="true" '));
    });
    await new Promise<void>((resolve, reject) => {
      listener!.once('error', reject);
      listener!.listen(port, '127.0.0.1', () => { listener!.off('error', reject); resolve(); });
    });
    return { ...store, url: 'http://127.0.0.1:' + (listener.address() as { port: number }).port, close };
  } catch (error) { await close(); throw error; }
}
