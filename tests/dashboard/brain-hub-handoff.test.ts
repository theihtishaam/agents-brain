import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_HANDOFF } from '../../src/dashboard/brain-hub-handoff.js';

const fixture = BRAIN_HUB_HANDOFF + `
  const arr=value=>Array.isArray(value)?value:[];
  const session={id:'source/session',title:'Verify checkout',goal:'Ship the checkout with controlled retries.'};
  const checkpoint={id:'saved/checkpoint',sha256:'a'.repeat(64),summary:'The retry ledger is in place.',
    constraints:['Never exceed three attempts.'],approach:'Run the integration fixture before UI checks.',
    decisions:['Keep the ledger in the checkout service.'],completed:['Documented request deduplication.'],
    nextSteps:['Run the broken-network test.','Review the release note.'],
    evidence:['src/retry.ts:18','tests/checkout.test.ts:72']};
  const project={id:'0123456789abcdef',name:'Northstar proof'};
  const state={view:'sessions',dataEpoch:0,server:{project},session:{session,checkpoints:[checkpoint]},
    policy:{chats:[{id:session.id,shareContext:true}]},errors:{}};
  const scopeName=()=>project.name;
  const crypto={randomUUID:()=>'fixture-operation-key'};
`;

it('keeps the full saved handoff readable and the resume payload valid and scoped', () => {
  const result = runInNewContext(fixture + `
    const text=portableHandoffText(session,checkpoint,project,'fixture-operation-key');
    const start=text.indexOf('json\\n{');
    ({text,request:JSON.parse(text.slice(start+5,text.lastIndexOf('}'))+'}')});
  `, {}) as { text: string; request: unknown };
  expect(result.text).toContain('Project ID 0123456789abcdef');
  expect(result.text).toContain('Ship the checkout with controlled retries.');
  expect(result.text).toContain('Never exceed three attempts.');
  expect(result.text).toContain('Run the integration fixture before UI checks.');
  expect(result.text).toContain('Keep the ledger in the checkout service.');
  expect(result.text).toContain('Run the broken-network test.');
  expect(result.text).toContain('src/retry.ts:18');
  expect(result.request).toEqual({ tool: 'session_resume', arguments: {
    sessionId: 'source/session', checkpointId: 'saved/checkpoint', sha256: 'a'.repeat(64), key: 'fixture-operation-key',
  } });
});

it('loads the exact checkpoint, checks scope and sharing before writing, and falls back to local text selection', async () => {
  const result = await runInNewContext(fixture + `
    const calls=[],writes=[],fallback=[],messages=[],button={disabled:false};
    let failCopy=false,blockAfterFetch=false,changeScope=false;
    const api=async route=>{
      calls.push(route);
      if(blockAfterFetch)state.policy.chats[0].shareContext=false;
      if(changeScope)state.dataEpoch++;
      return {checkpoint};
    };
    const clipboard=async value=>{if(failCopy)throw new Error('Clipboard unavailable');writes.push(value);};
    const status=(value,error)=>messages.push([value,error]);
    showPortableHandoff=value=>fallback.push(value);
    (async()=>{
      await copyPortableHandoff(checkpoint.id,button);
      failCopy=true;
      await copyPortableHandoff(checkpoint.id,button);
      blockAfterFetch=true;
      await copyPortableHandoff(checkpoint.id,button);
      await copyPortableHandoff(checkpoint.id,button);
      blockAfterFetch=false;
      state.policy.chats[0].shareContext=true;
      changeScope=true;
      await copyPortableHandoff(checkpoint.id,button);
      return {calls,writes:writes.length,fallback:fallback.length,messages,disabled:button.disabled};
    })();
  `, {});
  expect(result).toEqual({
    calls: Array(4).fill('sessions/source%2Fsession/checkpoints/saved%2Fcheckpoint'),
    writes: 1,
    fallback: 1,
    messages: Array(2).fill(['This conversation is unavailable for agent handoff.', true]),
    disabled: false,
  });
});
