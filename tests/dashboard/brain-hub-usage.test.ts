import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_ACTIONS } from '../../src/dashboard/brain-hub-actions.js';
import { BRAIN_HUB_USAGE } from '../../src/dashboard/brain-hub-usage.js';

function exerciseUsage(script: string, fixtures: Record<string, unknown> = {}) {
  return runInNewContext(BRAIN_HUB_USAGE + BRAIN_HUB_ACTIONS + script, { ...fixtures });
}

it('keeps zero, omitted and paired token reports distinct', () => {
  const totals = exerciseUsage('usageTotals(receipts)', { receipts: [
    { inputTokens: 0 },
    { outputTokens: 9, reasoningOutputTokens: 3, cacheReadInputTokens: 6 },
    { inputTokens: 25, outputTokens: 0, cacheReadInputTokens: 5 },
    {},
  ] });
  expect(totals).toEqual({
    inputTokens: { total: 25, known: 2, receipts: 4 },
    outputTokens: { total: 9, known: 2, receipts: 4 },
    cacheReadInputTokens: { total: 11, known: 2, receipts: 4 },
    cacheWriteInputTokens: { total: null, known: 0, receipts: 4 },
    reasoningOutputTokens: { total: 3, known: 1, receipts: 4 },
    pairedTokens: { total: 25, known: 1, receipts: 4 },
  });
  expect(exerciseUsage('usageValue({ total:0,known:1,receipts:4 })', { fmt: String })).toBe('0 · 1 / 4 reports');
  expect(exerciseUsage('usageValue({ total:null,known:0,receipts:4 })', { fmt: String })).toBe('Not reported');
});

it('combines period, exact host, either model label, and outcome filters', () => {
  const now = Date.parse('2026-11-20T14:30:00.000Z');
  const recent = { recordedAt: '2026-11-20T12:00:00.000Z', agent: 'codex', outcome: 'success' };
  const receipts = [
    { ...recent, id: 'requested', requestModel: 'fixture', responseModel: 'other' },
    { ...recent, id: 'response', responseModel: 'fixture' },
    { ...recent, id: 'unknown-model' },
    { ...recent, id: 'unknown-outcome', responseModel: 'fixture', outcome: undefined },
    { ...recent, id: 'wrong-host', responseModel: 'fixture', agent: 'test-host' },
    { ...recent, id: 'old', responseModel: 'fixture', recordedAt: '2026-11-19T12:00:00.000Z' },
  ];
  const actual = exerciseUsage(
    "const ids=filters=>usageMatches(receipts,{period:'day',agent:'codex',...filters},now).map(row=>row.id);" +
    "[ids({model:'model:fixture',outcome:'success'}),ids({model:'unknown'}),ids({outcome:'unknown'})];",
    { now, receipts },
  );
  expect(actual).toEqual([['requested', 'response'], ['unknown-model'], ['unknown-outcome']]);
});

it('applies and clears filters and routes older reports without changing the PDF page', () => {
  const state = { docPage: 7, usageFilters: null, usagePage: 5 };
  const focused: string[] = [];
  const form = new FormData();
  form.set('agent', 'codex');
  form.set('period', 'week');
  const fixture = {
    state, FormData: function () { return form; }, field: (data: FormData, key: string) => String(data.get(key) ?? ''),
    render: () => {}, $: (id: string) => ({ focus: () => focused.push(id) }), handleAgentDock: () => false,
  };
  const apply = "handleSubmit({target:{dataset:{form:'usage-filter'}},preventDefault(){}});";
  exerciseUsage(apply, fixture);
  expect(state).toEqual({ docPage: 7, usageFilters: { agent: 'codex', period: 'week', model: '', outcome: '' }, usagePage: 0 });
  exerciseUsage("handleClick({target:{closest:()=>({dataset:{action:'usage-page',usagePage:'1'}})}});", fixture);
  expect(state).toMatchObject({ docPage: 7, usagePage: 1 });
  form.set('clear', 'yes');
  exerciseUsage(apply, fixture);
  expect(state).toEqual({ docPage: 7, usageFilters: null, usagePage: 0 });
  expect(focused).toEqual(['apply-usage-filters', 'usage-reports-page', 'apply-usage-filters']);
});
