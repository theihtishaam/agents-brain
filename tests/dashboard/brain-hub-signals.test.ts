import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_SIGNALS } from '../../src/dashboard/brain-hub-signals.js';

it('keeps measured zeroes and omits unpaired, unmeasured, cross-project and future records from replay', () => {
  const result = (id: string, sequence: number, props = {}) => ({ id, sequence, source: 'measured', transport: 'mcp',
    kind: 'tool-end', projectId: 'atlas', resultTextBytes: 0, ...props });
  const events = [result('a', 1), result('missing', 2), result('legacy', 3, { resultTextBytes: undefined }),
    result('foreign', 4, { projectId: 'elsewhere' }), result('phase', 5, { kind: 'phase', source: 'reported', phase: 'verify' }),
    result('future', 6), result('future-phase', 7, { source: 'reported', kind: 'phase', phase: 'work' })];
  const pairs = new Map(events.filter(item => item.id !== 'missing').map(item => [item.id, { argumentBytes: 2 }]));
  const series = runInNewContext(BRAIN_HUB_SIGNALS + "signalData(events,pairs,'atlas',5)", { events, pairs });
  expect(series.batches).toEqual([{ event: events[0], input: 2, output: 0 }]);
  expect(series.phase.id).toBe('phase');
});
