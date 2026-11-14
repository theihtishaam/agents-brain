import { performance } from 'node:perf_hooks';
import { assembleContext, type ContextAssemblyOptions, type ContextPack } from './context-assembly.js';

/** A bounded same-query reference, not a counterfactual provider bill. */
export function assembleContextWithEfficiency(brain: Parameters<typeof assembleContext>[0], options: ContextAssemblyOptions) {
  const start = performance.now();
  const focused = assembleContext(brain, options);
  const assembled = performance.now();
  const referenceTokenBudget = options.policy?.maxTokens ?? 12000;
  const referenceEntryLimit = options.policy?.maxEntries ?? 30;
  const reference = assembleContext(brain, { ...options, tokenBudget: referenceTokenBudget, maxChars: referenceTokenBudget * 4,
    maxEntries: referenceEntryLimit });
  const completed = performance.now();
  const difference = reference.budget.estimatedTokens - focused.budget.estimatedTokens;
  return { ...focused, efficiency: {
    kind: 'estimated-context-reduction' as const,
    baseline: 'Same task, project and retrieval method with the largest permitted pack',
    referenceTokenBudget, referenceEntryLimit,
    referenceEstimatedTokens: reference.budget.estimatedTokens,
    focusedEstimatedTokens: focused.budget.estimatedTokens,
    estimatedTokensAvoided: Math.max(0, difference),
    signedTokenDifference: difference,
    reductionPercent: reference.budget.estimatedTokens ? Math.max(0, difference) / reference.budget.estimatedTokens * 100 : null,
    referenceMemoryCount: reference.entries.length, focusedMemoryCount: focused.entries.length,
    omittedFromReference: reference.entries.filter(entry => !focused.entries.some(selected => selected.id === entry.id)).map(entry => entry.id),
    assemblyMs: Math.round((assembled - start) * 1000) / 1000,
    referenceComparisonMs: Math.round((completed - assembled) * 1000) / 1000,
    referenceLimited: isLimited(reference),
    note: 'Estimated context reduction only. This is not measured model token savings, faster model execution, or a billing discount.',
  } };
}
function isLimited(pack: ContextPack) {
  return !!pack.retrieval?.truncated || pack.excluded.some(item => ['budget', 'limit'].includes(item.reason));
}
