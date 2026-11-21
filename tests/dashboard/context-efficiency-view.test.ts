import { expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { BRAIN_HUB_ACTIONS } from '../../src/dashboard/brain-hub-actions.js';
import { BRAIN_HUB_CONTEXT } from '../../src/dashboard/brain-hub-context.js';

it('shows an increase rather than a saving when a focused pack is larger than its reference', () => {
  const render = new Function('panel', 'fmt', 'chip', 'fact', 'esc', BRAIN_HUB_CONTEXT + '; return contextEfficiencyPanel;')(
    (_title: string, body: string) => body, String, String, (key: string, value: string) => key + value, String,
  );
  const html = render({ efficiency: { signedTokenDifference: -40, estimatedTokensAvoided: 0,
    reductionPercent: 0, referenceEstimatedTokens: 100, focusedEstimatedTokens: 140,
    referenceMemoryCount: 1, focusedMemoryCount: 1, assemblyMs: 1, referenceComparisonMs: 1,
    referenceTokenBudget: 200, referenceEntryLimit: 1, baseline: 'Same task', note: 'Estimates only',
  } });
  expect(html).toContain('40 more estimated context tokens');
  expect(html).toContain('40.0% larger');
  expect(html).not.toContain('tokens avoided');
  expect(html).not.toContain('% smaller');
});

it('shows effective limits and UTF-8 bytes for legacy context, with the requested limits beside them', () => {
  const pack = { markdown: 'café 🌍', policy: { effectiveMaxEntries: 3 },
    budget: { maxChars: 1200, usedChars: 7, tokenBudget: 300, estimatedTokens: 2 } };
  const html = runInNewContext(BRAIN_HUB_CONTEXT + ';contextBudget(pack,{tokenBudget:400,maxEntries:10});', {
    pack, TextEncoder, fmt: String, fact: (label: string, value: string) => label + ' = ' + value,
  });
  expect(html).toContain('Effective token budget = 300 of 400 requested');
  expect(html).toContain('Effective memory limit = 3 of 10 requested');
  expect(html).toContain('Exact UTF-8 size = 10 bytes');
  expect(html).toContain('7 / 1200 UTF-16 units');
});

it('shows both excerpts for shared memories when profiles choose different text', () => {
  const legacy = { entries: [{ id: 'shared', excerpt: 'Legacy excerpt fixture' }],
    markdown: 'Legacy excerpt fixture', budget: { estimatedTokens: 6 } };
  const adaptive = { entries: [{ id: 'shared', excerpt: 'Adaptive shortened fixture' }],
    markdown: 'Adaptive shortened fixture', budget: { estimatedTokens: 5, usedBytes: 26 } };
  const state = { context: adaptive, comparison: { legacy, adaptive, delta: { sharedIds: ['shared'] } } };
  const html = runInNewContext(BRAIN_HUB_CONTEXT + ';contextComparison();', {
    state, TextEncoder, local: false, arr: (value: unknown) => Array.isArray(value) ? value : [], fmt: String, esc: String,
    panel: (_title: string, body: string) => body, chip: String, list: String,
    action: (...args: string[]) => args.join(' '),
  });
  expect(html).toContain('Preview Legacy');
  expect(html).toContain('Adaptive shortened fixture');
  expect(html).toContain('Legacy excerpt fixture');
  expect(html).toContain('Exact UTF-8 bytes');
});

it('selects the other profile for copying without replacing the context form draft', () => {
  const legacy = { markdown: 'legacy pack' };
  const adaptive = { markdown: 'adaptive pack' };
  const state = { context: adaptive, comparison: { legacy, adaptive }, contextInput: { profile: 'adaptive' } };
  const renders: boolean[] = [];
  runInNewContext(BRAIN_HUB_CONTEXT + BRAIN_HUB_ACTIONS +
    "handleClick({target:{closest:()=>({dataset:{action:'context-use-profile',profile:'legacy'}})}});", {
    state, render: (restore: boolean) => renders.push(restore), $: () => null, status: () => {}, handleAgentDock: () => false,
  });
  expect(state.context).toBe(legacy);
  expect(state.contextInput.profile).toBe('adaptive');
  expect(renders).toEqual([true]);
});

it('submits the requested memory limit and rejects a pack from a stale sharing policy', async () => {
  const state = { project: 'fixture', context: null, policy: { policy: { revision: 2 } } };
  const form = new FormData();
  for (const [name, value] of Object.entries({ query: 'fixture task', profile: 'adaptive', tokenBudget: '300', maxEntries: '3' })) {
    form.set(name, value);
  }
  const api = vi.fn(async () => ({ policy: { revision: 1 } }));
  const task = runInNewContext(BRAIN_HUB_ACTIONS +
    "let task;function mutation(operation){task=operation();}" +
    "handleSubmit({target:{dataset:{form:'context'}},preventDefault(){}});task;", {
    state, api, json: (value: unknown) => value, field: (data: FormData, name: string) => data.get(name),
    FormData: function () { return form; },
  });
  await expect(task).rejects.toThrow('Project controls changed');
  expect(api).toHaveBeenCalledWith('context', expect.objectContaining({ projectId: 'fixture', tokenBudget: 300, maxEntries: 3 }));
  expect(state.context).toBeNull();
});
