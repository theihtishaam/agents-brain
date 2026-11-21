import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_ACTIONS } from '../../src/dashboard/brain-hub-actions.js';
import { BRAIN_HUB_HANDOFF } from '../../src/dashboard/brain-hub-handoff.js';
import { BRAIN_HUB_SESSIONS } from '../../src/dashboard/brain-hub-sessions.js';

const fixture = BRAIN_HUB_SESSIONS + BRAIN_HUB_ACTIONS + BRAIN_HUB_HANDOFF + `
  const arr=value=>Array.isArray(value)?value:[];
  const esc=value=>String(value).replaceAll('<','&lt;');
  const fmt=String,hostName=String,isoTime=String;
  const btn=(label,attrs)=>'<button '+attrs+'>'+label+'</button>';
  const action=(id,label,kind,attrs='')=>btn(label,'data-action="'+id+'" '+attrs);
  const list=(body,attrs="")=>'<ul '+attrs+'>'+body+'</ul>';
  const source={id:'shared#session',revision:3,title:'Shared fixture',goal:'Keep checkout consistent.',latestCheckpointId:null};
  const update={id:'note',role:'note',createdAt:'2026-01-01T12:01:00Z'};
  const detail={session:source,messages:[update],messageCount:1,checkpoints:[]};
  const state={session:detail,sessionBefore:'page-one',sessionCheckpoint:{id:'prior'},dataEpoch:1,
    policy:{chats:[{id:source.id,shareContext:true}]},errors:{}};
  const checkpoint={id:'cp',sessionId:source.id,summary:'Recovery summary',createdAt:'2026-01-01T12:00:00Z',
    sha256:'a'.repeat(64),recovery:{sourceRevision:3,totalMessages:2,messages:[{id:'note',role:'note',excerpt:'Quoted <update>\\nPreserve the second line.',truncated:true}]}};
  const next={session:{...source,id:'child',resumedFrom:{sessionId:source.id,checkpointId:checkpoint.id}},handoff:checkpoint};
`;

it('offers recovery only for an allowed conversation with known shared updates', () => {
  const result = runInNewContext(fixture + `
    const empty=sessionCanRecover({...detail,messages:[],messageCount:0});
    const fromMessages=sessionCanRecover(detail);
    const afterCheckpoint={...detail,session:{...source,latestCheckpointId:checkpoint.id},checkpoints:[checkpoint]};
    const newer=sessionCanRecover(afterCheckpoint);
    const older=sessionCanRecover({...afterCheckpoint,messages:[{...update,createdAt:'2026-01-01T11:00:00Z'}]});
    const allowed=sessionHandoffAllowed(source.id);
    state.policy.chats[0].shareContext=false;
    ({empty,fromMessages,newer,older,allowed,blocked:!sessionHandoffAllowed(source.id)});
  `, {});
  expect(result).toEqual({ empty: false, fromMessages: true, newer: true, older: false, allowed: true, blocked: true });
});

it('opens the returned child using the source revision and leaves unsupported results out of another scope', async () => {
  const result = await runInNewContext(fixture + `
    let changeScope=false;
    const requests=[];
    const hubWrite=async (route,input)=>{
      requests.push([route,input]);
      if(changeScope)state.dataEpoch++;
      return next;
    };
    const afterSave=async ()=>{};
    (async()=>{
      await recoverSharedSession();
      const opened=state.session;
      const reset=state.sessionBefore===null&&state.sessionCheckpoint===null;
      state.session=detail;changeScope=true;
      await recoverSharedSession();
      return {requests,opened:opened.session.id,reset,crossScope:state.session.session.id};
    })();
  `, {});
  expect(result).toEqual({
    requests: [['sessions/shared%23session/recover', { expectedRevision: 3 }],
      ['sessions/shared%23session/recover', { expectedRevision: 3 }]],
    opened: 'child',
    reset: true,
    crossScope: 'shared#session',
  });
});

it('quotes bounded excerpts and preserves source identity in the inherited and portable handoffs', () => {
  const result = runInNewContext(fixture + `
    ({html:inheritedSessionHandoff(next),
      copied:portableHandoffText(source,checkpoint,{id:'fixture',name:'Fixture'},'retry-key')})
  `, {}) as { html: string; copied: string };
  expect(result.html).toContain('Original goal');
  expect(result.html).toContain('Keep checkout consistent.');
  expect(result.html).toContain('Original session ID shared#session');
  expect(result.html).toContain('1 of 2 shared messages included');
  expect(result.html).toContain('<blockquote class="preserve">Quoted &lt;update>');
  expect(result.html).toContain('data-session="shared#session"');
  expect(result.copied).toContain('Original session ID shared#session');
  expect(result.copied).toContain('> Quoted <update>\n> Preserve the second line.');
});

it('recovers an exact-only session without loading its messages and points the handoff to its own source', () => {
  const result = runInNewContext(fixture + `
    state.features={features:{exactConversationCapture:true}};
    state.connection='reachable';
    const exact={totalMessages:5,totalBytes:50};
    const exactSource={...source,actor:{tool:'opencode'},exactTranscript:exact};
    const empty={...detail,session:exactSource,messages:[],messageCount:0};
    const ready=sessionCanRecover(empty);
    state.features.features.exactConversationCapture=false;
    const disabled=sessionCanRecover(empty);
    checkpoint.recovery={sourceRevision:3,totalMessages:0,exactTranscript:exact,messages:[]};
    ({ready,disabled,html:inheritedSessionHandoff(next),copy:portableHandoffText(source,checkpoint,{id:'fixture',name:'Fixture'},'retry-key')});
  `, {}) as { ready: boolean; disabled: boolean; html: string; copy: string };
  expect(result).toMatchObject({ ready: true, disabled: false });
  expect(result.html).toContain('5 original messages recorded. Open the source session');
  expect(result.html).toContain('data-session="shared#session"');
  expect(result.copy).toContain('session_transcript_read with {"sessionId":"shared#session"}');
});

it('reads and replaces only the requested project transcript page and clears it on a denied read', async () => {
  const result = await runInNewContext(fixture + `
    state.project='fixture';state.view='sessions';state.viewEpoch=1;state.connection='reachable';
    state.features={features:{exactConversationCapture:true}};
    source.actor={tool:'opencode'};
    source.exactTranscript={totalMessages:2,totalBytes:30};
    const requests=[];
    let redirected=false;
    const api=async (route,{headers})=>{
      requests.push([route,headers['X-Shadow-Brain-Project']]);
      if(redirected)state.viewEpoch++;
      return {projectId:'fixture',sessionId:source.id,totalMessages:2,nextBefore:route.includes('?')?null:'earlier',
        messages:[{role:'user',text:route.includes('?')?'Old & <tag>':'New & <tag>'}]};
    };
    const render=()=>{};
    (async()=>{
      const unopened=exactSessionHistory(source);
      await readSessionExact();
      const latest=exactSessionHistory(source);
      await readSessionExact('earlier');
      const older=exactSessionHistory(source);
      state.policy.chats[0].shareContext=false;
      let denied=false;
      try{await readSessionExact();}catch{denied=true;}
      const hidden=exactSessionHistory(source);
      state.policy.chats[0].shareContext=true;redirected=true;
      await readSessionExact();
      return {requests,unopened,latest,older,denied,hidden,stale:state.sessionExact};
    })();
  `, { URLSearchParams }) as { requests: unknown; unopened: string; latest: string; older: string; denied: boolean; hidden: string; stale: unknown };
  expect(result.requests).toEqual([
    ['sessions/shared%23session/transcript', 'fixture'], ['sessions/shared%23session/transcript?before=earlier', 'fixture'],
    ['sessions/shared%23session/transcript', 'fixture'],
  ]);
  expect(result.unopened).toContain('Read original messages');
  expect(result.unopened).not.toContain('New &');
  expect(result.latest).toContain('New & &lt;tag>');
  expect(result.latest).toContain('Earlier original messages');
  expect(result.older).toContain('Old & &lt;tag>');
  expect(result.older).not.toContain('New &');
  expect(result.hidden).not.toContain('Old &');
  expect(result).toMatchObject({ denied: true, stale: null });
});
