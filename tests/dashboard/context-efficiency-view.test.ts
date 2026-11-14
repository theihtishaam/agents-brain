import { expect, it } from 'vitest';
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
