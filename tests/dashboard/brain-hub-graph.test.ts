import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { BRAIN_HUB_CLIENT } from '../../src/dashboard/brain-hub-client.js';
import { BRAIN_HUB_EXCHANGES } from '../../src/dashboard/brain-hub-exchanges.js';
import { BRAIN_HUB_GRAPH } from '../../src/dashboard/brain-hub-graph.js';

function run<T>(example: string): T {
  return runInNewContext(BRAIN_HUB_CLIENT + BRAIN_HUB_EXCHANGES + BRAIN_HUB_GRAPH + example, {
    document: { documentElement: { dataset: {} } },
    matchMedia: () => ({ matches: true }),
  }) as T;
}

describe('Brain Hub graph and exchanges', () => {
  it('pairs only measured MCP requests and results in the same scope and session', () => {
    const result = run(`
      const request={id:'request',sequence:1,kind:'tool-start',source:'measured',transport:'mcp',
        projectId:'project-a',sessionId:'first',agent:'codex',tool:'context_pack',correlationId:'call-1'};
      const result={...request,id:'result',sequence:2,kind:'tool-end',outcome:'success'};
      state.events=[request,{...result,id:'another-project',projectId:'project-b'},
        {...result,id:'another-session',sessionId:'second'},{...result,id:'another-client',agent:'opencode'},
        {...result,id:'a-report',source:'reported',transport:'host'},result];
      const {pairs}=observedExchanges();
      const surface={width:800,height:400,points:new Map()};
      const incoming=graphEventPath(request,surface);
      const outgoing=graphEventPath(result,surface);
      ({
        paired:[pairs.get(request.id)?.id,pairs.get(result.id)?.id],
        pairCount:pairs.size,
        incoming:incoming[0].x>incoming.at(-1).x,
        outgoing:outgoing[0].x<outgoing.at(-1).x,
        report:graphEventPath(state.events[4],surface)
      });
    `);
    expect(result).toEqual({ paired: ['result', 'request'], pairCount: 2, incoming: true, outgoing: true, report: null });
  });

  it('reports loaded-history eviction without displaying a newer event in replay', () => {
    const result = run(`
      const makeEvent=sequence=>({id:'event-'+sequence,sequence});
      const page={liveEnabled:true,recordingEnabled:true,journalId:'activity'};
      installTelemetry({...page,cursor:200,events:Array.from({length:200},(_,index)=>makeEvent(index+1))});
      state.replayId='event-1';
      installTelemetry({...page,cursor:201,events:[makeEvent(201)]});
      const expired=state.replayExpired;
      const displayed=displayEvent()?.id;
      const history=state.events.length;
      const expiredReceipt=exchangeMarkup().includes('outside the loaded history');
      state.replayId=null;
      ({expired,displayed,history,expiredReceipt,latest:displayEvent().id});
    `);
    expect(result).toEqual({ expired: true, displayed: undefined, history: 200, expiredReceipt: true, latest: 'event-201' });
  });
});
