import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_AGENT_DOCK } from '../../src/dashboard/brain-hub-agent-dock.js';
import { BRAIN_HUB_EXCHANGES } from '../../src/dashboard/brain-hub-exchanges.js';
import { BRAIN_HUB_TOPOLOGY } from '../../src/dashboard/brain-hub-topology.js';

const browser = BRAIN_HUB_EXCHANGES + BRAIN_HUB_AGENT_DOCK + BRAIN_HUB_TOPOLOGY + `
  const now=globalThis.Date.parse('2026-01-01T00:00:05.000Z');
  let elapsed=5000;
  const Date=class extends globalThis.Date{static now(){return now;}};
  const performance={now:()=>elapsed};
  const document={hidden:false};
  const reduced={matches:false},local=true;
  const clearTimeout=()=>{};
  const arr=value=>Array.isArray(value)?value:[];
  const esc=value=>String(value??'').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const fmt=String,time=value=>value.slice(11,19),hostName=value=>value;
  const scopeName=()=>'Fixture Workspace';
  const list=(contents,attributes,classes)=>'<ul class="'+classes+'" '+attributes+'>'+contents+'</ul>';
  const displayEvent=()=>state.events.find(event=>event.id===state.replayId);
  const state={project:'project-a',view:'overview',live:true,recording:true,connection:'reachable',events:[],errors:{}};
  const measured={projectId:'project-a',sessionId:'mcp-lease-a',agent:'mcp-client',tool:'brain_search',
    source:'measured',transport:'mcp',kind:'tool-start',correlationId:'exchange-a',timestamp:'2026-01-01T00:00:04.500Z'};
`;

it('admits only fresh measured MCP directions within scope and stops when live motion is unavailable', () => {
  const activity = runInNewContext(browser + `
    noteTopologyActivity([
      {...measured,id:'request'},
      {...measured,id:'result',kind:'tool-end',outcome:'success'},
      {...measured,id:'wrong-project',projectId:'project-b'},
      {...measured,id:'reported',source:'reported'},
      {...measured,id:'not-mcp',transport:'portal'},
      {...measured,id:'phase',kind:'phase'},
      {...measured,id:'uncorrelated',correlationId:null},
      {...measured,id:'stale',timestamp:'2025-12-31T23:59:57.000Z'},
      {...measured,id:'future',timestamp:'2026-01-01T00:00:06.000Z'},
    ]);
    noteTopologyActivity([{...measured,id:'request'}]);
    const accepted=[...topologyActivity.keys()];
    clearTopologyActivity();
    const blocked=[];
    for(const [key,values] of [
      ['view',['sessions','overview']],['connection',['offline','reachable']],
      ['recording',[false,true]],['replayId',['request',null]],['motionPaused',[true,false]],
      ['errors',[{telemetry:'failed'},{}]],['features',[{features:{liveActivity:false}},null]]
    ]){
      state[key]=values[0];noteTopologyActivity([{...measured,id:key}]);blocked.push(topologyActivity.size);state[key]=values[1];
    }
    reduced.matches=true;noteTopologyActivity([{...measured,id:'reduced'}]);blocked.push(topologyActivity.size);
    reduced.matches=false;document.hidden=true;noteTopologyActivity([{...measured,id:'hidden'}]);blocked.push(topologyActivity.size);
    ({accepted,blocked});
  `, {});
  expect(activity).toEqual({ accepted: ['request', 'result'], blocked: Array(9).fill(0) });
});

it('projects a lease and retained MCP history into distinct states and shows recorded exchanges in replay', () => {
  const result = runInNewContext(browser + `
    state.events=[{...measured,id:'request',sequence:1},{...measured,id:'result',sequence:2,kind:'tool-end',outcome:'error'}];
    installDockPresence({projectId:'project-a',enabled:true,checkedAt:'2026-01-01T00:00:05Z',connections:[
      {id:'mcp-lease-a',tool:'codex',expiresAt:'2026-01-01T00:00:30Z'},
      {id:'mcp-lease-b',tool:'claude-code',expiresAt:'2026-01-01T00:01:00Z'}
    ]});
    const initial=topologyMarkup(rosterState());
    elapsed+=25000;
    const expired=topologyMarkup(rosterState());
    state.replayId='request';
    const replay=topologyMarkup(rosterState());
    ({initial,expired,replay});
  `, {});
  expect(result.initial).toContain('2 connected via MCP');
  expect(result.initial).toContain('data-dock-tool="codex"');
  expect(result.initial).toContain('data-dock-tool="claude-code"');
  expect(result.initial).toContain('MCP connected');
  expect(result.initial).toContain('Latest recorded exchange');
  expect(result.initial).toContain('Last operation');
  expect(result.initial).toContain('Workspace tools');
  expect(result.initial).toContain('brain_search · Tool error');
  expect(result.initial).toContain('codex <span aria-hidden="true">←');
  expect(result.expired).toContain('1 connected via MCP');
  expect(result.expired).not.toContain('data-dock-tool="codex"');
  expect(result.expired).toContain('Recorded MCP activity');
  expect(result.replay).toContain('Journal replay');
  expect(result.replay).toContain('Selected exchange');
  expect(result.replay).toContain('Selected operation');
  expect(result.replay).toContain('brain_search · Request observed');
  expect(result.replay).toContain('<span aria-hidden="true">→');
});

it('moves the request toward the brain and the result toward the tool on both sides', () => {
  const routes = runInNewContext(browser + `
    topologySlots([['codex',[]],['claude-code',[]]]).map(slot=>
      ['request','result'].map(direction=>topologyRoute(slot,direction).split(' ').filter(token=>Number.isFinite(Number(token))).map(Number))
    );
  `, {}) as number[][][];
  expect(routes[0][0][0]).toBeLessThan(routes[0][0].at(-2)!);
  expect(routes[0][1][0]).toBeGreaterThan(routes[0][1].at(-2)!);
  expect(routes[1][0][0]).toBeGreaterThan(routes[1][0].at(-2)!);
  expect(routes[1][1][0]).toBeLessThan(routes[1][1].at(-2)!);
});

it('renders each measured direction once, then removes travelling signals and temporary tool labels', () => {
  const result = runInNewContext(browser + `
    const setTimeout=()=>1;
    const label={textContent:'',hidden:true};
    const tool={dataset:{dockTool:'codex'},querySelector:()=>label,toggleAttribute(){}};
    const travel={dataset:{},children:[],replaceChildren(...items){this.children=items;}};
    let signal=false;
    const regions=['retrieval','knowledge','sessions','workspace'].map(operation=>({
      dataset:{operation},active:false,toggleAttribute(key,value){this.active=value;}
    }));
    const core={toggleAttribute(key,value){signal=value;},querySelectorAll:()=>regions};
    const visibleRegions=()=>regions.filter(region=>region.active).map(region=>region.dataset.operation);
    const $=id=>id==='topology-travel'?travel:id==='topology-core'?core:{querySelectorAll:()=>[tool]};
    document.createElementNS=()=>({attributes:{},style:{},setAttribute(key,value){this.attributes[key]=value;}});
    state.events=[{...measured,tool:'project_brief',id:'request',sequence:1},
      {...measured,tool:'project_knowledge',id:'result',sequence:2,kind:'tool-end',outcome:'error'}];
    installDockPresence({projectId:'project-a',enabled:true,checkedAt:'2026-01-01T00:00:05Z',connections:[
      {id:'mcp-lease-a',tool:'codex',expiresAt:'2026-01-01T00:00:30Z'}
    ]});
    const roster=rosterState();
    updateTopologyActivity(roster);
    const initialCount=travel.children.length;
    const initialRegions=visibleRegions();
    noteTopologyActivity(state.events);
    updateTopologyActivity(roster);
    const pulses=travel.children;
    updateTopologyActivity(roster);
    const unchanged=pulses===travel.children,traffic=label.textContent,signalled=signal;
    const shownRegions=visibleRegions();
    elapsed+=topologyLifetimeMs+1;
    updateTopologyActivity(roster);
    ({initialCount,initialRegions,shownRegions,finalRegions:visibleRegions(),classes:pulses.map(pulse=>pulse.attributes.class),
      unchanged,traffic,signalled,signal,afterCount:travel.children.length,hidden:label.hidden});
  `, {});
  expect(result).toEqual({
    initialCount: 0,
    initialRegions: [],
    shownRegions: ['retrieval', 'knowledge'],
    finalRegions: [],
    classes: ['topology-pulse topology-request', 'topology-pulse topology-result topology-error'],
    unchanged: true,
    traffic: 'Sent request · Received tool error',
    signalled: true,
    signal: false,
    afterCount: 0,
    hidden: true,
  });
});
