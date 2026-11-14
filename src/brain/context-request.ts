import type { ContextAssemblyOptions } from './context-assembly.js';
import { requireMemoryIdentifier } from './memory-inspection.js';

/** Shared boundary validation for HTTP, MCP, and CLI context requests. */
export function parseContextRequest(input: Record<string, unknown>): Pick<ContextAssemblyOptions,
  'projectId' | 'query' | 'tokenBudget' | 'maxEntries' | 'includeCrossProject' | 'profile' | 'expandRelated'> {
  if (Object.keys(input).some(key => !['projectId', 'query', 'tokenBudget', 'maxEntries', 'includeCrossProject', 'profile', 'expandRelated'].includes(key))) {
    throw new TypeError('Unknown context request field.');
  }
  requireMemoryIdentifier(input.projectId);
  if (input.query !== undefined && (typeof input.query !== 'string' || input.query.length > 4096)) throw new TypeError('Query must be text of at most 4096 characters.');
  if (input.tokenBudget !== undefined && (!Number.isSafeInteger(input.tokenBudget) || Number(input.tokenBudget) < 0 || Number(input.tokenBudget) > 12000)) throw new TypeError('Token budget must be an integer from 0 to 12000.');
  if (input.maxEntries !== undefined && (!Number.isSafeInteger(input.maxEntries) || Number(input.maxEntries) < 1 || Number(input.maxEntries) > 30)) throw new TypeError('Memory limit must be an integer from 1 to 30.');
  for (const key of ['includeCrossProject', 'expandRelated']) {
    if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new TypeError(key + ' must be boolean.');
  }
  if (input.profile !== undefined && (typeof input.profile !== 'string' || !['legacy', 'adaptive'].includes(input.profile))) throw new TypeError('Profile must be legacy or adaptive.');
  return { projectId: input.projectId, query: input.query as string | undefined, tokenBudget: input.tokenBudget as number | undefined, maxEntries: input.maxEntries as number | undefined,
    includeCrossProject: input.includeCrossProject as boolean | undefined,
    profile: input.profile as 'legacy' | 'adaptive' | undefined, expandRelated: input.expandRelated as boolean | undefined };
}
