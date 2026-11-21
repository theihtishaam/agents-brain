export const BRAIN_HUB_CONNECTIONS = String.raw`
const connectionDetection={
  detected:['Detected','green'],
  'not-detected':['Not detected','amber'],
  unknown:['Detection unavailable',''],
};
const connectionConfiguration={
  managed:['Configured for this project','cyan'],
  available:['Not configured',''],
  conflict:['Configuration needs review','amber'],
  manual:['Manual setup',''],
};
function connectionGuide(host){
  const docs=typeof host.docs==='string'&&host.docs.startsWith('https://')?host.docs:null;
  if(!host.notes&&!host.recipe&&!docs)return '';
  const key=esc(host.id);
  return '<details class="host-guide" data-keep-open id="host-guide-'+key+'"><summary>Setup guide</summary>'+
    '<div class="stack">'+(host.notes?'<p class="small muted preserve">'+esc(host.notes)+'</p>':'')+
    (host.configurationPath?'<p class="small muted">Project configuration file <code>'+esc(host.configurationPath)+'</code></p>':'')+
    (host.recipe?'<pre tabindex="0" aria-label="'+esc(host.label)+' setup commands">'+esc(host.recipe)+'</pre>':'')+
    '<div class="actions">'+(host.recipe?btn('Copy setup commands','id="host-copy-'+key+'" data-connection-action="copy" data-host="'+key+'"','quiet'):'')+
    (docs?'<a class="btn quiet" id="host-docs-'+key+'" href="'+esc(docs)+'" target="_blank" rel="noopener noreferrer">Official host documentation</a>':'')+'</div></div></details>';
}
function connectionCard(host,snapshot,disabled){
  const key=esc(host.id),name=esc(host.label);
  const detection=Object.hasOwn(connectionDetection,host.installation)?connectionDetection[host.installation]:connectionDetection.unknown;
  const configuration=Object.hasOwn(connectionConfiguration,host.configuration)?connectionConfiguration[host.configuration]:connectionConfiguration.manual;
  const admitted=snapshot.participationEnabled===false?false:host.enabled;
  const admission=admitted===null||admitted===undefined?'Unavailable':admitted?'Allowed':'Blocked';
  const active=Number.isSafeInteger(host.connected)&&host.connected>=0&&state.connection==='reachable';
  const presence=active?(host.connected?fmt(host.connected)+(host.connected===1?' current connection':' current connections'):'No current connection'):'Unavailable';
  const workspace=host.mode==='workspace',configured=host.configuration==='managed';
  const ready=workspace&&host.installation==='detected'&&host.configuration==='available';
  const management=configured||ready?btn(configured?'Disconnect':'Connect',
    'id="host-manage-'+key+'" data-connection-action="'+(configured?'disconnect':'connect')+'" data-host="'+key+'" aria-label="'+
    (configured?'Disconnect ':'Connect ')+name+'"'+disabled,configured?'':'primary'):'';
  const canToggle=admitted!=null&&snapshot.participationEnabled!==false;
  const control=canToggle?btn(admitted?'Allowed':'Blocked','id="host-admission-'+key+'" data-connection-action="admission" data-host="'+key+'" data-enabled="'+!admitted+
    '" role="switch" aria-checked="'+admitted+'" aria-label="Allow '+name+' to use project tools"'+disabled,'quiet'):'<span>'+admission+'</span>';
  return '<article class="host-connection"><div class="host-card-head"><div class="host-card-name">'+toolMark(host.id)+'<h3>'+name+'</h3></div>'+
    chip(...detection)+'</div>'+(host.evidence?'<p class="muted small">'+esc(host.evidence)+'</p>':'')+
    '<dl class="host-facts"><div><dt>Project setup</dt><dd>'+chip(...configuration)+'</dd></div>'+
    '<div><dt>Tool admission</dt><dd>'+control+'</dd></div><div><dt>MCP presence</dt><dd'+
    (active&&host.connected?' class="green"':'')+'>'+presence+'</dd></div></dl>'+
    (configured&&active&&!host.connected?'<p class="small muted">Reload the host to start its MCP connection.</p>':'')+
    (management?'<div class="actions">'+management+'</div>':'')+connectionGuide(host)+'</article>';
}
function workspaceConnections(){
  if(!local)return '';
  const snapshot=state.connections;
  const heading='<div class="panel-head"><h2>Host connections</h2></div>';
  const retry=btn('Refresh connections','id="refresh-host-connections" data-connection-action="refresh"','quiet');
  if(state.errors.connections)return '<section class="panel host-panel" id="host-connections">'+heading+
    empty('Host connections unavailable',state.errors.connections,retry)+'</section>';
  if(!snapshot)return '<section class="panel host-panel" id="host-connections">'+heading+
    empty('Checking host connections','Reading installation, project setup, and MCP presence.')+'</section>';
  const disabled=state.pending||state.connection!=='reachable'?' disabled':'';
  const toggle=(key,on,description)=>btn(on?'On':'Off','id="host-'+key+'" data-connection-action="'+key+'" data-enabled="'+!on+
    '" role="switch" aria-checked="'+on+'" aria-label="'+description+'"'+disabled);
  const automatic='<div class="host-setting"><div><strong>Automatic connections</strong>'+
    '<p class="muted small">Opt in to project-scoped setup for supported hosts. A host must reload to use updated MCP settings.</p></div>'+
    toggle('automatic',snapshot.autoConnect===true,'Automatic host connections')+'</div>';
  const participation=typeof snapshot.participationEnabled==='boolean'?'<div class="host-setting"><div><strong>Project tool participation</strong>'+
    '<p class="muted small">Allow MCP clients to use this project’s Shadow Brain tools.</p></div>'+
    toggle('participation',snapshot.participationEnabled,'Project tool participation')+'</div>':'';
  const rank=host=>state.connection==='reachable'&&host.connected>0?2:host.installation==='detected'?1:0;
  const hosts=[...arr(snapshot.hosts)].sort((a,b)=>rank(b)-rank(a));
  const issue=snapshot.refreshIssue?'<p class="host-notice small amber" role="status">'+esc(snapshot.refreshIssue)+'</p>':'';
  const limited=snapshot.detectionLimited?'<p class="host-notice small muted">Discovery checks supported local commands and extensions. Some locations could not be checked.</p>':'';
  return '<section class="panel host-panel" id="host-connections">'+
    '<div class="panel-head"><h2>Host connections</h2>'+retry+'</div>'+
    '<div class="host-settings">'+participation+automatic+'</div>'+issue+limited+
    (hosts.length?'<div class="host-grid">'+hosts.map(host=>connectionCard(host,snapshot,disabled)).join('')+'</div>':
      empty('No host results','Refresh connections to check available host setup.'))+'</section>';
}
async function readWorkspaceConnections(){
  const snapshot=await api('connections');
  state.connections=snapshot;
  delete state.errors.connections;
  return snapshot;
}
function handleWorkspaceConnection(button){
  const {connectionAction,host:hostId,enabled}=button.dataset;
  if(!connectionAction)return false;
  if(connectionAction==='refresh'){
    void refresh(true);
    return true;
  }
  const host=arr(state.connections?.hosts).find(item=>item.id===hostId);
  if(connectionAction==='copy'){
    void clipboard(host?.recipe).catch(()=>status('Clipboard unavailable. Select and copy the setup commands from the guide.',true));
    return true;
  }
  const settings=['automatic','participation'].includes(connectionAction);
  if(!settings&&(!['connect','disconnect','admission'].includes(connectionAction)||!host))return true;
  void mutation(async()=>{
    const command={action:connectionAction};
    if(host)command.host=host.id;
    if(settings||connectionAction==='admission')command.enabled=enabled==='true';
    try {
      const {revision,policyRevision}=state.connections;
      const snapshot=await api('connections',json({...command,expectedRevision:revision,expectedPolicyRevision:policyRevision}));
      if(Array.isArray(snapshot?.hosts)){
        state.connections=snapshot;
        delete state.errors.connections;
      }else await readWorkspaceConnections();
    }catch(failure){
      if(failure.status===409){
        try{await readWorkspaceConnections();render(true);}catch{}
      }
      throw failure;
    }
    return connectionAction==='connect'?'Project configuration saved. Reload '+host.label+' and check MCP presence.':
      connectionAction==='disconnect'?'Admission blocked for this project. Reload '+host.label+' to apply configuration changes.':
      connectionAction==='admission'?(enabled==='true'?'Tool admission allowed.':'Tool admission blocked for this project.'):
      connectionAction==='automatic'?'Automatic connection preference saved.':'Project tool participation saved.';
  },button).then(()=>$(button.id)?.focus({preventScroll:true}));
  return true;
}
`;

export const BRAIN_HUB_CONNECTIONS_CSS = String.raw`
.host-panel{margin-bottom:12px}
.host-panel .panel-head{padding-inline:12px}
.host-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr));gap:8px 18px;
  padding:10px 12px;border-bottom:1px solid var(--border)}
.host-setting{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;min-width:0}
.host-setting strong{display:block;margin-bottom:2px}
.host-setting .btn{min-width:48px;flex:none}
.host-notice{padding:7px 12px;border-bottom:1px solid var(--border)}
.host-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,285px),1fr));gap:1px;background:var(--border)}
.host-connection{min-width:0;background:var(--surface);display:grid;align-content:start;gap:8px;padding:12px}
.host-card-head,.host-card-name{display:flex;align-items:center;gap:8px}
.host-card-head{justify-content:space-between;flex-wrap:wrap}
.host-card-name .tool-mark{flex:none}
.host-facts{display:grid;gap:3px;padding-block:3px}
.host-facts>div{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:25px}
.host-facts dt{font-size:.8rem;color:var(--muted)}
.host-facts dd{margin:0;text-align:right;font-size:.8rem}
.host-facts .btn{min-height:25px;padding-block:2px}
.host-guide{padding-top:7px;border-top:1px solid var(--border);font-size:.83rem}
.host-guide pre{max-height:220px}
@media(max-width:640px){
  .host-grid{grid-template-columns:minmax(0,1fr)}
  .host-panel .btn{min-height:40px}
  .host-guide summary{padding-block:6px}
}
`;
