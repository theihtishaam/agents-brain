import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_ACTIONS } from '../../src/dashboard/brain-hub-actions.js';
import { BRAIN_HUB_AGENT_DOCK } from '../../src/dashboard/brain-hub-agent-dock.js';
import { BRAIN_HUB_OVERVIEW_EVIDENCE } from '../../src/dashboard/brain-hub-overview-evidence.js';

const setup = BRAIN_HUB_OVERVIEW_EVIDENCE + BRAIN_HUB_AGENT_DOCK + `
  const local=true;
  const arr=value=>Array.isArray(value)?value:[];
  const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const fmt=String,isoTime=String,hostName=value=>value==='codex'?'Codex':value;
  const scopeName=()=>state.server.project.id;
  const list=(html,attrs,classes)=>'<ul class="'+classes+'" '+attrs+'>'+html+'</ul>';
  const btn=(title,attrs,classes)=>'<button class="'+classes+'" '+attrs+'>'+esc(title)+'</button>';
  const view=(id,title)=>btn(title,'data-view="'+id+'"','quiet');
  const shownNativeIndex=project=>project.codexIndexAllowed&&portfolio.nativeChecks.get(project.projectId);
  const preferences=new Map();
  const localStorage={getItem:key=>preferences.get(key),setItem:(key,value)=>preferences.set(key,value),removeItem:key=>preferences.delete(key)};
  const document={hidden:false};
  const portfolio={selected:'project-b',nativeChecks:new Map()};
  const state={view:'overview',connection:'reachable',server:{project:{id:'project-a'}},project:'project-a',events:[],errors:{},directory:{workspaces:[
    {projectId:'project-a',projectName:'Atlas proof',codexIndexAllowed:true,opencodeIndexAllowed:true,policyRevision:3,sessions:[{title:'Retain exact <shared> title',host:'codex'}]},
    {projectId:'project-b',projectName:'Foreign proof',codexIndexAllowed:true,policyRevision:1,sessions:[{title:'Other project chat',host:'claude-code'}]},
  ]}};
`;

it('keeps local consent scoped to the active project and never persists title content', () => {
  const actual = runInNewContext(setup + `
    const initial=overviewObserving(overviewProjectId());
    setOverviewObserving('project-a',true);
    setOverviewObserving('project-a',true,'opencode');
    const own=overviewObserving('project-a'),other=overviewObserving('project-b');
    const written=[...preferences.entries()];
    setOverviewObserving('project-a',false);
    setOverviewObserving('project-a',false,'opencode');
    ({initial,own,other,written,empty:preferences.size===0});
  `, {});
  expect(actual).toEqual({
    initial: false,
    own: true,
    other: false,
    written: [['shadow-brain:overview-codex:project-a', 'on'], ['shadow-brain:overview-opencode:project-a', 'on']],
    empty: true,
  });
});

it('previews only the pinned project with independently evidenced files, shared chat, installed tools, and indexed titles', () => {
  const actual = runInNewContext(setup + `
    overviewEvidence.projectId='project-a';
    overviewEvidence.tree={items:[
      {name:'src',path:'src',kind:'directory',navigable:true},{name:'README.md',path:'README.md',kind:'file'},
    ]};
    overviewEvidence.hosts={projectId:'project-a',hosts:[
      {label:'OpenCode',installation:'detected'},{label:'Unknown fixture',installation:'not-detected'},
    ]};
    portfolio.nativeChecks.set('project-a',{observedAt:'2026-01-01T01:00:00Z',threads:[
      {name:'Exact native title <example>',status:'active'},{name:'',status:'active'},
    ]});
    portfolio.nativeChecks.set('project-b',{observedAt:'2026-01-01T01:00:00Z',threads:[{name:'Foreign native title'}]});
    overviewIndexes.get('opencode').snapshot={projectId:'project-a',policyRevision:3,observedAt:'2026-01-01T01:00:00Z',
      expiresAt:new Date(Date.now()+60000).toISOString(),sessions:[{name:'OpenCode exact task title'}]};
    state.directory.workspaces[0].sessions.push({id:'shared-session',title:'Resume this drawing',hasCheckpoint:true,host:'codex'});
    state.directory.workspaces[1].sessions.push({id:'foreign',title:'Hidden resume target',hasCheckpoint:true,host:'codex'});
    const html=overviewEvidenceBody();
    const evidence=rosterState().tools.map(([tool,records])=>[tool,records.map(record=>[record.kind,!!record.presence,record.index?.thread.name])]);
    ({html,evidence});
  `, {}) as { html: string; evidence: unknown };
  expect(actual.html).toContain('Atlas proof');
  expect(actual.html).toContain('Retain exact &lt;shared> title');
  expect(actual.html).toContain('Exact native title &lt;example>');
  expect(actual.html).toContain('App-server active');
  expect(actual.html).toContain('data-overview-file="src" data-overview-kind="folder"');
  expect(actual.html).toContain('README.md');
  expect(actual.html).toContain('OpenCode');
  expect(actual.html).toContain('OpenCode exact task title');
  expect(actual.html).toContain('Detected locally');
  expect(actual.html).toContain('Resume this drawing');
  expect(actual.html).not.toContain('Hidden resume target');
  expect(actual.html).not.toMatch(/Foreign proof|Other project chat|Foreign native title|Unknown fixture/);
  expect(actual.evidence).toEqual([
    ['codex', [['native-index', false, 'Exact native title <example>']]],
    ['opencode', [['native-index', false, 'OpenCode exact task title']]],
  ]);
});

it('opens the saved checkpoint through the overview button click dispatcher', async () => {
  const result = await runInNewContext(setup + BRAIN_HUB_ACTIONS + `
    state.dataEpoch=4;
    state.directory.workspaces[0].sessions[0].id='own-session';
    let task, opened;const routes=[];
    function mutation(op){task=op();}
    function openView(view){opened=view;}
    const api=async route=>{routes.push(route);return route.endsWith('/checkpoints/selected')
      ? {checkpoint:{id:'selected',sessionId:'own-session'}} : {projectId:'project-a',session:{id:'own-session',latestCheckpointId:'selected'}};};
    handleClick({target:{closest:()=>({dataset:{overviewResume:'own-session'}})}});
    (async()=>{await task;return {routes,opened,checkpoint:state.sessionCheckpoint?.id};})();
  `, { handleAgentDock: () => false });
  expect(result).toEqual({ routes: ['sessions/own-session','sessions/own-session/checkpoints/selected'], opened: 'sessions', checkpoint: 'selected' });
});
