import type { IncomingMessage } from 'node:http';
import { applyManagedProjectSkill, listManagedProjectSkills, ManagedSkillError, previewManagedProjectSkill } from '../brain/managed-project-skills.js';
import { ProjectKitError } from '../brain/project-kit-paths.js';

export function isManagedSkillsRoute(route: string): boolean { return route === 'managed-skills' || route.startsWith('managed-skills/'); }

export async function managedSkillsRequest(req: IncomingMessage, route: string, root: string, body: () => Promise<Record<string, unknown>>) {
  try {
    if (req.method === 'GET' && route === 'managed-skills') return listManagedProjectSkills(root);
    if (req.method !== 'POST' || (route !== 'managed-skills/preview' && route !== 'managed-skills/apply')) {
      throw new ManagedSkillError('MANAGED_SKILL_ROUTE', 'Use GET for inventory and POST for preview or apply.', 405);
    }
    const origin = req.headers.origin;
    if ((origin && origin !== 'http://' + req.headers.host && origin !== 'https://' + req.headers.host) || req.headers['sec-fetch-site'] === 'cross-site') {
      throw new ManagedSkillError('MANAGED_SKILL_ORIGIN', 'Cross-origin changes are not accepted.', 403);
    }
    const input = await body();
    return route.endsWith('/preview') ? previewManagedProjectSkill(root, input) : applyManagedProjectSkill(root, input);
  } catch (error) {
    if (error instanceof ManagedSkillError || error instanceof TypeError || error instanceof RangeError) throw error;
    if (error instanceof ProjectKitError) throw new ManagedSkillError(error.code, error.message,
      error.code === 'PROJECT_KIT_WRITE_FAILED' ? 503 : 409);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new ManagedSkillError('MANAGED_SKILL_CONFLICT', 'A managed destination appeared during application. Refresh and review it.', 409);
    throw new ManagedSkillError('MANAGED_SKILL_STORAGE', 'Managed skill storage could not be opened. Review the current paths and try again.', 503);
  }
}
