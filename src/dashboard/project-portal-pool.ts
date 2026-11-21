import { GlobalBrain } from '../brain/global-brain.js';
import { ProjectPolicyStore } from '../brain/project-policy.js';
import { WorkspaceDirectory, verifiedWorkspaceRoot } from '../brain/workspace-directory.js';

type Portal = { url: string; close(): Promise<void> };
type Entry = { portal: Promise<Portal>; used: number };
const maxChildren = 8;
const inactiveMs = 90_000;
const problem = (message: string, status: number) => Object.assign(new Error(message), { status });

/** Each project gets its own listener and pinned store, even when several tabs are open. */
export class ProjectPortalPool {
  private children = new Map<string, Entry>();
  private owner?: { id: string; url: string };
  private stopped = false;

  constructor(private readonly launch: (root: string) => Promise<Portal>) {}
  bindOwner(id: string, url: string) { this.owner = { id, url }; }
  touch(id: string) { const child = this.children.get(id); if (child) child.used = Date.now(); }

  private resolve(id: string): string {
    if (this.stopped) throw problem('The project portal is closing.', 503);
    const item = new WorkspaceDirectory().list().projects.find(row => row.projectId === id);
    if (!item) throw problem('This project is no longer registered.', 404);
    const root = verifiedWorkspaceRoot(item.root);
    if (GlobalBrain.projectIdFor(root) !== id) throw problem('The registered project directory has changed.', 409);
    if (new ProjectPolicyStore(root, id).get().participationEnabled === false) throw problem('This project has paused sharing.', 403);
    return root;
  }

  async open(input: Record<string, unknown>) {
    if (Object.keys(input).length !== 1 || typeof input.projectId !== 'string' || !/^[0-9a-f]{16}$/u.test(input.projectId)) throw new TypeError('Choose a registered project.');
    const id = input.projectId, root = this.resolve(id);
    if (id === this.owner?.id) return { projectId: id, url: this.owner.url + '/hub' };
    let entry = this.children.get(id);
    if (!entry) {
      if (this.children.size >= maxChildren) {
        const idle = [...this.children].find(([, item]) => Date.now() - item.used > inactiveMs);
        if (!idle) throw problem('Eight other project portals are open. Close an unused tab and retry after 90 seconds.', 429);
        this.children.delete(idle[0]);
        void idle[1].portal.then(portal => portal.close()).catch(() => {});
      }
      entry = { used: Date.now(), portal: this.launch(root) };
      this.children.set(id, entry);
    }
    entry.used = Date.now();
    try {
      const portal = await entry.portal;
      if (this.resolve(id) !== root) throw problem('Refresh the directory before opening this project.', 409);
      return { projectId: id, url: portal.url + '/hub' };
    } catch (error) {
      if (this.children.get(id) === entry) {
        this.children.delete(id);
        await entry.portal.then(portal => portal.close()).catch(() => {});
      }
      throw error;
    }
  }

  async close() {
    this.stopped = true;
    const entries = [...this.children.values()];
    this.children.clear();
    await Promise.allSettled(entries.map(entry => entry.portal.then(portal => portal.close())));
  }
}
