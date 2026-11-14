import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GlobalBrain } from '../../src/brain/global-brain.js';
import { describe, expect, it } from 'vitest';
import { assembleContextWithEfficiency } from '../../src/brain/context-efficiency.js';

describe('bounded context reduction', () => {
  it('compares the same scoped request with a larger bounded reference without changing stored memory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sb-efficiency-'));
    const brain = GlobalBrain.createIsolated({ dbPath: join(root, 'memory.json') });
    try {
      await brain.init();
      for (let i = 0; i < 8; i++) brain.writeSync({ projectId:'fixture', projectName:'Fixture', agentTool:'codex', category:'knowledge',
        content:'Checksum procedure '+i+': '+('Validate the checksum before accepting this independent artifact. '.repeat(8)), importance:0.7, metadata:{} });
      brain.writeSync({projectId:'other',projectName:'Other',agentTool:'codex',category:'knowledge',content:'Checksum OTHER_PROJECT_PRIVATE',importance:1,metadata:{}});
      const result = assembleContextWithEfficiency(brain,{projectId:'fixture',query:'checksum',profile:'adaptive',tokenBudget:300,maxEntries:2});
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.efficiency.referenceEstimatedTokens).toBeGreaterThan(result.budget.estimatedTokens);
      expect(result.efficiency.estimatedTokensAvoided).toBe(result.efficiency.referenceEstimatedTokens-result.budget.estimatedTokens);
      expect(result.efficiency.reductionPercent).toBeGreaterThan(0);
      expect(result.markdown).not.toContain('OTHER_PROJECT_PRIVATE');
      expect(result.efficiency.referenceMemoryCount).toBeGreaterThan(result.entries.length);
      expect(brain.getStats().totalEntries).toBe(9);
    } finally { await brain.shutdown(); rmSync(root,{recursive:true,force:true}); }
  });
  it('keeps empty-reference ratios unknown and measures actual assembly separately', () => {
    const result = assembleContextWithEfficiency({ recallScored: () => [] } as any, { projectId: 'project-fixture', query: 'checksum', profile: 'legacy' });
    expect(result.efficiency).toMatchObject({ referenceEstimatedTokens: 0, focusedEstimatedTokens: 0, estimatedTokensAvoided: 0, reductionPercent: null });
    expect(result.efficiency.assemblyMs).toBeGreaterThanOrEqual(0);
    expect(result.efficiency.referenceComparisonMs).toBeGreaterThanOrEqual(0);
    expect(result.efficiency.note).toContain('not measured model token savings');
  });
});

