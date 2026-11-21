import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import { BRAIN_HUB_CONNECTIONS } from '../../src/dashboard/brain-hub-connections.js';

const fixture = BRAIN_HUB_CONNECTIONS + `
  const hosts=[
    {id:'codex',label:'Codex',installation:'detected',evidence:'Command found',
      mode:'workspace',configuration:'managed',enabled:true,connected:0,notes:'Reload the desktop app.',
      recipe:'demo configure <workspace>',docs:'https://developers.openai.com/codex/mcp'},
    {id:'opencode',label:'OpenCode',installation:'detected',evidence:'Command found',
      mode:'workspace',configuration:'available',enabled:true,connected:0},
    {id:'claude-code',label:'Claude Code',installation:'not-detected',mode:'manual',configuration:'manual',enabled:false,connected:null},
    {id:'deepseek-harness',label:'DeepSeek Harness',installation:'unknown',mode:'manual',configuration:'conflict',
      enabled:true,connected:2,recipe:'deepseek configure'},
  ];
  const state={connections:{hosts,autoConnect:false,participationEnabled:true,revision:7,policyRevision:10},
    policy:{policy:{tools:[]}},connection:'reachable',errors:{}};
  const local=true;
  const escapeMap={'<':'&lt;','>':'&gt;','"':'&quot;','&':'&amp;'};
  const esc=value=>String(value??'').replace(/[<>"&]/g,char=>escapeMap[char]);
  const arr=value=>Array.isArray(value)?value:[];
  const fmt=value=>String(value);
  const btn=(label,attrs,kind)=>'<button class="'+(kind??'')+'" '+attrs+'>'+label+'</button>';
  const chip=(label,tone)=>'<span class="'+tone+'">'+label+'</span>';
  const empty=(label,detail,action='')=>'<p>'+label+' '+esc(detail)+'</p>'+action;
  const toolMark=id=>'<i aria-hidden="true">'+esc(id)+'</i>';
`;

it('displays installation, project setup, tool admission and MCP presence separately', () => {
  const markup = runInNewContext(fixture + 'workspaceConnections()', {}) as string;
  expect(markup).toContain('Automatic host connections"');
  expect(markup).toContain('data-connection-action="automatic" data-enabled="true" role="switch" aria-checked="false"');
  expect(markup).toContain('data-connection-action="participation" data-enabled="false" role="switch" aria-checked="true"');
  expect(markup).toContain('Configured for this project');
  expect(markup).toContain('No current connection');
  expect(markup).toContain('Reload the host to start its MCP connection.');
  expect(markup).toContain('data-connection-action="connect" data-host="opencode"');
  expect(markup).toContain('data-connection-action="disconnect" data-host="codex"');
  expect(markup).not.toContain('data-connection-action="connect" data-host="claude-code"');
  expect(markup).toContain('Configuration needs review');
  expect(markup).toContain('2 current connections');
  expect(markup).toContain('demo configure &lt;workspace&gt;');
  expect(markup).toContain('href="https://developers.openai.com/codex/mcp"');
});

it('blocks per-host admission controls while project access is disabled and removes offline presence claims', () => {
  const markup = runInNewContext(fixture + `
    state.connections.participationEnabled=false;
    state.connection='offline';
    workspaceConnections();
  `, {}) as string;
  expect(markup).toContain('Blocked');
  expect(markup).not.toContain('data-connection-action="admission"');
  expect(markup).not.toContain('2 current connections');
  expect(markup).toContain('data-connection-action="participation" data-enabled="true" role="switch" aria-checked="false" aria-label="Project tool participation" disabled');
});

it('sends the correct typed commands with both revisions and refreshes the snapshot', async () => {
  const result = await runInNewContext(fixture + `
    const requests=[],results=[];
    let pending;
    const $=()=>null;
    const json=value=>value;
    const api=async(route,command)=>{
      requests.push([route,command]);
      return {...state.connections,revision:state.connections.revision+1};
    };
    const mutation=operation=>pending=operation().then(message=>results.push(message));
    (async()=>{
      handleWorkspaceConnection({dataset:{connectionAction:'connect',host:'opencode'}});
      await pending;
      handleWorkspaceConnection({dataset:{connectionAction:'participation',enabled:'false'}});
      await pending;
      handleWorkspaceConnection({dataset:{connectionAction:'admission',host:'claude-code',enabled:'true'}});
      await pending;
      return {requests,results};
    })();
  `, {});
  expect(result.requests).toEqual([
    ['connections', { action: 'connect', host: 'opencode', expectedRevision: 7, expectedPolicyRevision: 10 }],
    ['connections', { action: 'participation', enabled: false, expectedRevision: 8, expectedPolicyRevision: 10 }],
    ['connections', { action: 'admission', host: 'claude-code', enabled: true, expectedRevision: 9, expectedPolicyRevision: 10 }],
  ]);
  expect(result.results[0]).toContain('Reload OpenCode and check MCP presence');
});
