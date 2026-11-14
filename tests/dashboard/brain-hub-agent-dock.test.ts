import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_AGENT_DOCK } from '../../src/dashboard/brain-hub-agent-dock.js';

it('keeps MCP connection activity separate from chats and joins usage only by exact project, tool and host ID', () => {
  const actual = runInNewContext(BRAIN_HUB_AGENT_DOCK + `
    const base={actor:{id:'codex:mcp-conn',kind:'agent',tool:'codex'},updatedAt:'2026-01-01T12:00:00Z'};
    const state={
      project:'project-1',
      sessions:{projectId:'project-1',sessions:[
        {...base,id:'session-a',hostSessionId:'host-a',title:'First chat'},
        {...base,id:'session-b',hostSessionId:'host-b',title:'Second chat'},
        {...base,id:'session-c',hostSessionId:'shared-host',title:'Shared chat worker one'},
        {...base,id:'session-d',hostSessionId:'shared-host',title:'Shared chat worker two'},
      ]},
      events:[
        {id:'event-1',projectId:'project-1',agent:'codex',sessionId:'mcp-conn',source:'measured',transport:'mcp',sequence:5},
        {id:'event-2',projectId:'project-2',agent:'codex',sessionId:'mcp-conn',source:'measured',transport:'mcp',sequence:7},
      ],
      usage:{receipts:[
        {projectId:'project-2',agent:'codex',sessionId:'host-a',responseModel:'outside-project'},
        {projectId:'project-1',agent:'claude-code',sessionId:'host-a',responseModel:'other-tool'},
        {projectId:'project-1',agent:'codex',sessionId:'host-a',responseModel:'fixture-model',reasoningEffort:'high'},
        {projectId:'project-1',agent:'codex',sessionId:'host-b',responseModel:'fixture-model-b',reasoningEffort:'medium'},
        {projectId:'project-1',agent:'codex',sessionId:'shared-host',responseModel:'shared-model'},
      ]}
    };
    const arr=value=>Array.isArray(value)?value:[];
    const roster=rosterState();
    [...roster.groups.values()].map(item=>[item.tool,item.kind,item.session?.title,item.event?.id,item.receipt?.responseModel,item.receipt?.reasoningEffort,item.sharedReceipt])
  `, {});
  expect(actual).toEqual([
    ['codex', 'project-session', 'First chat', undefined, 'fixture-model', 'high', undefined],
    ['codex', 'project-session', 'Second chat', undefined, 'fixture-model-b', 'medium', undefined],
    ['codex', 'project-session', 'Shared chat worker one', undefined, undefined, undefined, undefined],
    ['codex', 'project-session', 'Shared chat worker two', undefined, undefined, undefined, undefined],
    ['codex', 'connection', undefined, 'event-1', undefined, undefined, undefined],
    ['claude-code', 'conversation', undefined, undefined, 'other-tool', undefined, undefined],
    ['codex', 'conversation', undefined, undefined, 'shared-model', undefined, true],
  ]);
});

it('drops expired transport leases from the visible roster even without a new response', () => {
  const actual = runInNewContext(BRAIN_HUB_AGENT_DOCK + `
    let elapsed=500;
    const performance={now:()=>elapsed};
    const arr=value=>Array.isArray(value)?value:[];
    const state={connection:'reachable',errors:{}};
    installDockPresence({enabled:true,checkedAt:'2026-01-01T00:00:00Z',connections:[
      {id:'mcp-fixture',tool:'codex',expiresAt:'2026-01-01T00:00:30Z'}
    ]});
    const before=currentDockConnections().length;
    elapsed+=30000;
    const expired=currentDockConnections().length;
    elapsed-=30000;
    state.connection='offline';
    const offline=currentDockConnections().length;
    ({before,expired,offline});
  `, {});
  expect(actual).toEqual({ before: 1, expired: 0, offline: 0 });
});

it('joins a measured generic client to its exact reporting lease without a registered chat', () => {
  const actual = runInNewContext(BRAIN_HUB_AGENT_DOCK + `
    const performance={now:()=>500};
    const arr=value=>Array.isArray(value)?value:[];
    const state={connection:'reachable',errors:{},events:[
      {id:'matched',projectId:'project-1',agent:'mcp-client',sessionId:'mcp-fixture',source:'measured',transport:'mcp',sequence:1},
      {id:'other-project',projectId:'project-2',agent:'mcp-client',sessionId:'mcp-fixture',source:'measured',transport:'mcp',sequence:2},
      {id:'reported',projectId:'project-1',agent:'mcp-client',sessionId:'mcp-fixture',source:'reported',transport:'host',sequence:3}
    ]};
    installDockPresence({projectId:'project-1',enabled:true,checkedAt:'2026-01-01T00:00:00Z',connections:[
      {id:'mcp-fixture',tool:'cursor',expiresAt:'2026-01-01T00:00:30Z'}
    ]});
    [...rosterState().groups.values()].map(row=>[row.projectId,row.tool,row.kind,row.event?.id,row.presence?.id]);
  `, {});
  expect(actual).toEqual([
    ['project-1', 'cursor', 'connection', 'matched', 'mcp-fixture'],
    ['project-2', 'mcp-client', 'connection', 'other-project', undefined],
    ['project-1', 'mcp-client', 'report', 'reported', undefined],
  ]);
});
