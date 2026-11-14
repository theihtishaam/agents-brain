import { BRAIN_HUB_BRAND_ICONS } from './brain-hub-brand-icons.js';

export const BRAIN_HUB_AGENT_DOCK = 'const brainBrandMarks = ' + JSON.stringify(BRAIN_HUB_BRAND_ICONS) + ';\n' + String.raw`
const observedPulses=new Map();
let dockTool=null,dockSession=null,dockPinned=false;
let dockPresenceTimer=0,dockPresenceReceived=0;
const dockVisible=scope=>scope==='overview'||scope==='sessions';
const rosterTool=label=>typeof label==='string'&&label&&label!=='user'&&label!=='portal';
const toolKey=value=>JSON.stringify([value.projectId,value.tool,value.kind,value.identity]);
const toolOrder=['codex','claude-code','deepseek-harness','opencode'];
const presenceClock=()=>Date.parse(state.presence?.checkedAt)+(performance.now()-dockPresenceReceived);
function currentDockConnections(){
  if(!state.presence?.enabled||state.errors?.presence||state.connection!=='reachable')return [];
  const now=presenceClock();
  return arr(state.presence.connections).filter(item=>Date.parse(item.expiresAt)>now);
}
function noteAgentActivity(events){
  if(document.hidden||reduced.matches||state.motionPaused||state.replayId||!dockVisible(state.view))return;
  const now=Date.now();
  for(const event of events)if(rosterTool(event.agent)&&event.projectId&&event.sessionId){
    const age=now-Date.parse(event.timestamp);
    if(age>=0&&age<6500)observedPulses.set(event.id,{until:now+1300});
  }
  for(const [id,pulse] of observedPulses)if(pulse.until<now)observedPulses.delete(id);
}
function rosterState(){
  const groups=new Map();
  const scope=state.project;
  const accepts=(projectId,tool)=>projectId&&(!scope||scope===projectId)&&rosterTool(tool);
  function group(projectId,tool,kind,identity){
    const key=toolKey({projectId,tool,kind,identity});
    let record=groups.get(key);
    if(!record){record={key,projectId,tool,kind,identity,session:null,event:null,receipt:null};groups.set(key,record);}
    return record;
  }
  const connections=new Map(),hostChats=new Map();
  const connectionKey=(projectId,connectionId)=>JSON.stringify([projectId,connectionId]);
  for(const session of arr(state.sessions?.sessions)){
    const projectId=state.sessions.projectId,tool=session.native?.tool??session.actor?.tool;
    const hostId=session.hostSessionId,connection=session.actor?.kind==='agent'&&session.actor?.id?.startsWith(tool+':mcp-')
      ?session.actor.id.slice(tool.length+1):null;
    if(!accepts(projectId,tool))continue;
    const record=group(projectId,tool,'project-session',session.id);
    record.session=session;record.connection=connection;
    if(hostId){
      const key=JSON.stringify([projectId,tool,hostId]);
      const list=hostChats.get(key)??[];
      list.push(record);hostChats.set(key,list);
    }
    if(connection){
      const key=connectionKey(projectId,connection);
      connections.set(key,connections.has(key)&&connections.get(key)!==tool?null:tool);
    }
  }
  for(const connection of currentDockConnections()){
    const projectId=state.presence.projectId;
    if(!accepts(projectId,connection.tool))continue;
    connections.set(connectionKey(projectId,connection.id),connection.tool);
    group(projectId,connection.tool,'connection',connection.id).presence=connection;
  }
  for(const event of state.events){
    if(!event.sessionId||!accepts(event.projectId,event.agent))continue;
    const measured=event.source==='measured'&&event.transport==='mcp';
    const tool=measured&&event.agent==='mcp-client'?connections.get(connectionKey(event.projectId,event.sessionId))??event.agent:event.agent;
    const record=group(event.projectId,tool,measured?'connection':'report',event.sessionId);
    if(!record.event||event.sequence>record.event.sequence)record.event=event;
  }
  const models=new Set();
  for(const receipt of arr(state.usage?.receipts)){
    if(!receipt.sessionId||!accepts(receipt.projectId,receipt.agent))continue;
    const matches=hostChats.get(JSON.stringify([receipt.projectId,receipt.agent,receipt.sessionId]))??[];
    const record=matches.length===1?matches[0]:group(receipt.projectId,receipt.agent,'conversation',receipt.sessionId);
    if(matches.length>1)record.sharedReceipt=true;
    if(!record.receipt||receipt.recordedAt>=record.receipt.recordedAt)record.receipt=receipt;
    const model=receipt.responseModel??receipt.requestModel;
    if(model)models.add(JSON.stringify([receipt.provider??null,model]));
  }
  const tools=new Map();
  for(const record of groups.values()){
    const latest=[record.event?.timestamp,record.receipt?.recordedAt,record.session?.lastReportedAt,record.presence?.lastSeenAt].filter(Boolean).sort().at(-1);
    record.latest=latest;
    if(!tools.has(record.tool))tools.set(record.tool,[]);
    tools.get(record.tool).push(record);
  }
  for(const rows of tools.values())rows.sort((a,b)=>String(b.latest??'').localeCompare(String(a.latest??'')));
  const order=tool=>toolOrder.includes(tool)?toolOrder.indexOf(tool):toolOrder.length;
  const sorted=[...tools].sort((a,b)=>order(a[0])-order(b[0])||a[0].localeCompare(b[0]));
  return {tools:sorted,groups,models:models.size};
}
function toolMark(tool){
  const icon=Object.hasOwn(brainBrandMarks,tool)?brainBrandMarks[tool]:'<span>'+esc(hostName(tool).slice(0,2).toUpperCase())+'</span>';
  return '<span class="tool-mark" aria-hidden="true">'+icon+'</span>';
}
function toolEnabled(tool){
  if(!local||!state.policy||state.errors.policy)return null;
  return arr(state.policy.policy.tools).find(item=>item.tool===tool.toLowerCase().trim())?.enabled!==false;
}
function dockAction(record){
  const {event,receipt,session}=record;
  if(record.kind==='connection'&&event)return [eventLabel(event),evidence(event)];
  if(event&&event.timestamp===record.latest)return [eventLabel(event),evidence(event)];
  if(receipt&&receipt.recordedAt===record.latest)return ['Model usage receipt','Host-reported'];
  if(session)return [session.native||session.sourceId?'Conversation snapshot':session.reportedStatus==='completed'?'Reported completed':
    session.reportedStatus==='waiting'?'Reported waiting':'Reported working','Recorded session'];
  return record.presence?['No recorded action','Transport heartbeat'] : ['Unavailable','No evidence'];
}
function toolDockInspector(record,records){
  const {event,receipt,session}=record;
  const [actionLabel,provenance]=dockAction(record);
  const actualTitle=session?.native?session.native.titleExact??'Unavailable':session?.title??'Not reported';
  const role=arr(state.policy?.chats).find(chat=>chat.id===session?.id)?.role??'Unassigned';
  const workspace=arr(state.overview?.projects).find(project=>project.id===record.projectId)?.name??record.projectId;
  const counter=value=>Number.isFinite(value)?fmt(value):'Not reported';
  const availability=toolEnabled(record.tool);
  const labelFor=item=>item.session?(item.session.native?item.session.native.titleExact??'Untitled native snapshot':item.session.title):
    (item.kind==='connection'?'MCP connection ':item.kind==='report'?'Host report ':item.sharedReceipt?'Shared chat usage ':'Usage receipt ')+item.identity;
  const chooser=records.length>1?list(records.map(item=>{
    const model=item.receipt?.responseModel??item.receipt?.requestModel;
    return '<li><button class="tool-dock-record" type="button" data-dock-record="'+esc(item.key)+'" aria-pressed="'+(item.key===record.key)+'"><strong>'+
      esc(labelFor(item))+'</strong>'+(model?'<small class="muted">'+esc(model)+'</small>':'')+'</button></li>';
  }).join(''),'aria-label="Chats and connection evidence"','tool-dock-record-list'):'';
  const idLabel=record.kind==='connection'?'MCP connection ID':record.kind==='report'?'Reported session ID':record.kind==='project-session'?'Project session ID':'Host chat ID';
  return '<section class="tool-dock-details" id="tool-dock-details" aria-label="'+esc(hostName(record.tool))+' activity details">'+
    '<div class="row"><h3>'+esc(hostName(record.tool))+'</h3><div class="actions">'+
    (session?btn('Open session','data-dock-open="'+esc(session.id)+'"','quiet'):'')+
    btn('Close details','data-dock-close','quiet')+'</div></div>'+chooser+
    '<div class="tool-evidence-grid"><dl class="facts">'+fact('Workspace',workspace)+fact('Conversation',actualTitle)+
    fact(idLabel,record.identity)+(session?.hostSessionId?fact('Host chat ID',session.hostSessionId):'')+
    (record.connection?fact('Reporting MCP connection',record.connection):'')+
    fact('Coordination role',role)+fact('Participation',availability===null?'Unavailable':availability?'Enabled':'Disabled')+'</dl>'+
    '<dl class="facts">'+fact('Latest recorded action',actionLabel)+fact('Evidence',provenance)+fact('Last seen',isoTime(record.latest))+
    (record.presence?fact('MCP heartbeat',isoTime(record.presence.lastSeenAt)): '')+
    fact('Latest tool duration',Number.isFinite(event?.durationMs)?fmt(event.durationMs)+' ms · '+evidence(event):'Not recorded')+'</dl>'+
    '<dl class="facts">'+fact('Model',receipt?.responseModel??receipt?.requestModel??'Not reported')+fact('Provider',receipt?.provider??'Not reported')+
    fact('Host-reported effort',receipt?.reasoningEffort??'Not reported')+fact('Reported input tokens',counter(receipt?.inputTokens))+
    fact('Reported output tokens',counter(receipt?.outputTokens))+(receipt?fact('Usage receipt time',isoTime(receipt.recordedAt)):'')+
    (record.sharedReceipt?fact('Attribution','Shared chat receipt · individual session unavailable'):'')+'</dl></div></section>';
}
function pickDockRecord(){
  if(!dockTool)return;
  const records=rosterState().tools.find(([tool])=>tool===dockTool)?.[1]??[];
  dockSession=(records.find(item=>item.session)??records[0])?.key??null;
}
function agentDockMarkup(){
  const {tools,groups,models}=rosterState();
  const visible=tools.slice(0,12);
  if(dockTool&&!visible.some(([tool])=>tool===dockTool)){dockTool=null;dockSession=null;dockPinned=false;}
  const controls=visible.map(([tool,records])=>{
    const availability=toolEnabled(tool);
    const latestEvent=records.map(item=>item.event).filter(Boolean).sort((a,b)=>b.sequence-a.sequence)[0];
    const chats=new Set(records.filter(item=>item.session).map(item=>JSON.stringify([item.projectId,item.session.hostSessionId??item.identity]))).size;
    const workers=records.filter(item=>item.session&&arr(state.policy?.chats).some(chat=>chat.id===item.session.id&&chat.role==='worker')).length;
    const reporting=records.filter(item=>item.presence).length;
    const description=availability===false?'Participation off':chats?chats+' chat'+(chats===1?'':'s')+(workers?' · '+workers+' worker'+(workers===1?'':'s'):''):
      reporting?reporting+' reporting':latestEvent?'Observed '+time(latestEvent.timestamp):'Reported usage';
    return '<li><button class="tool-dock-button" type="button" data-dock-tool="'+esc(tool)+'" aria-label="Inspect '+esc(hostName(tool))+'" aria-expanded="'+(tool===dockTool)+'" aria-controls="tool-dock-details">'+
      toolMark(tool)+'<span class="tool-dock-text"><strong>'+esc(hostName(tool))+'</strong><small>'+esc(description)+
      '</small></span><span class="tool-dock-indicator" data-observed="'+esc(latestEvent?.id)+'" title="'+esc(reporting?reporting+' reporting MCP connections':'No current transport heartbeat')+'" aria-hidden="true"></span></button></li>';
  }).join('');
  const selection=tools.find(([tool])=>tool===dockTool)?.[1]??[];
  const row=selection.find(item=>item.key===dockSession)??selection.find(item=>item.session)??selection[0];
  const conversations=new Set([...groups.values()].filter(item=>item.session).map(item=>JSON.stringify([item.projectId,item.tool,item.session.hostSessionId??item.identity]))).size;
  const agents=[...groups.values()].filter(item=>item.session?.actor?.kind==='agent').length;
  const connections=[...groups.values()].filter(item=>item.kind==='connection').length;
  const presence=state.errors.presence||local&&state.connection==='offline'?'Reporting MCP connections unavailable':
    state.presence?.enabled===false?'MCP presence recording off':state.presence?fmt(currentDockConnections().length)+' reporting MCP connections':
      local?'MCP presence loading':fmt(connections)+' observed MCP connections';
  const sourceState=!state.live&&state.features?.features?.liveActivity===false?'Journal display off':
    state.errors.telemetry||state.connection==='offline'?'Previously loaded activity':'Recorded activity';
  return '<div class="tool-dock-head"><h2>Tool activity</h2><p class="small muted">'+
    fmt(tools.length)+' tools <span aria-hidden="true">·</span> '+fmt(agents)+' agent sessions <span aria-hidden="true">·</span> '+fmt(conversations)+' registered chats <span aria-hidden="true">·</span> '+esc(presence)+' <span aria-hidden="true">·</span> '+fmt(models)+' reported models'+
    (tools.length>visible.length?' · '+visible.length+' shown':'')+'</p></div>'+
    (controls?list(controls,'aria-label="Tools with project evidence"','tool-dock-list'):'<p class="tool-dock-empty small muted">Tool records appear after a measured exchange or explicit host report.</p>')+
    (row?toolDockInspector(row,selection):'<div id="tool-dock-details" hidden></div>')+'<p class="tool-dock-caption small muted">'+esc(sourceState)+
    ' · Retained evidence'+(state.presence?.enabled&&!state.errors.presence?' · MCP heartbeat window '+Math.round(state.presence.expiresAfterMs/1000)+'s':'')+
    (state.errors.sessions?' · Sessions unavailable':'')+(state.errors.usage?' · Usage unavailable':'')+(state.errors.policy?' · Controls unavailable':'')+'</p>';
}
function installDockPresence(value){
  state.presence=value;dockPresenceReceived=performance.now();
}
function scheduleDockExpiry(){
  clearTimeout(dockPresenceTimer);
  if(document.hidden||!dockVisible(state.view)||!state.presence?.enabled||state.errors.presence)return;
  const now=presenceClock();
  const dates=arr(state.presence.connections).map(item=>Date.parse(item.expiresAt)).filter(time=>Number.isFinite(time));
  if(!dates.length||!Number.isFinite(now))return;
  dockPresenceTimer=setTimeout(()=>{updateAgentDock();queueLive(['presence']);},Math.max(150,Math.min(...dates)-now+100));
}
function agentDock(){return '<section class="panel tool-dock" id="tool-dock" aria-label="Tool activity">'+agentDockMarkup()+'</section>';}
function updateAgentDock(){
  const dock=$('tool-dock');
  if(!dock)return;
  const focus=document.activeElement;
  const key=dock.contains(focus)?focus?.dataset.dockTool:null;
  const recordKey=dock.contains(focus)?focus?.dataset.dockRecord:null;
  const focused=dock.contains(focus);
  const id=focused?focus?.id:null;
  const markup=agentDockMarkup();
  if(dock.dataset.markup!==markup){
    dock.innerHTML=markup;dock.dataset.markup=markup;
    if(key)focusDockTool(key);
    else if(recordKey)[...dock.querySelectorAll('[data-dock-record]')].find(button=>button.dataset.dockRecord===recordKey)?.focus({preventScroll:true});
    else if(id)$(id)?.focus({preventScroll:true});
    else if(focused)focusDockTool(dockTool);
  }
  const now=Date.now();
  if(document.hidden||reduced.matches||state.motionPaused||state.replayId||state.connection!=='reachable'||!state.live){
    observedPulses.clear();
    for(const mark of dock.querySelectorAll('.tool-activity-pulse'))mark.classList.remove('tool-activity-pulse');
    return;
  }
  for(const button of dock.querySelectorAll('[data-dock-tool]')){
    const dot=button.querySelector('.tool-dock-indicator');
    const id=dot.dataset.observed,pulse=observedPulses.get(id);
    if(pulse&&pulse.until>now){
      if(dot.dataset.event===id)continue;
      dot.dataset.event=id;
      dot.classList.remove('tool-activity-pulse');
      void dot.offsetWidth;
      dot.classList.add('tool-activity-pulse');
    }
  }
}
let dockFocusRestore=false;
function focusDockTool(tool){
  dockFocusRestore=true;
  [...$('tool-dock')?.querySelectorAll('[data-dock-tool]')??[]].find(button=>button.dataset.dockTool===tool)?.focus({preventScroll:true});
  dockFocusRestore=false;
}
function previewDockTool(target){
  const tool=target.closest?.('[data-dock-tool]')?.dataset.dockTool;
  if(!tool||dockPinned||dockFocusRestore||tool===dockTool)return;
  dockTool=tool;pickDockRecord();updateAgentDock();
}
function handleAgentDock(button){
  const data=button.dataset;
  if(data.dockTool){
    if(dockPinned&&dockTool===data.dockTool){dockTool=null;dockSession=null;dockPinned=false;updateAgentDock();focusDockTool(data.dockTool);return true;}
    dockPinned=true;dockTool=data.dockTool;dockSession=null;
    pickDockRecord();
    updateAgentDock();focusDockTool(data.dockTool);return true;
  }
  if(Object.hasOwn(data,'dockClose')){
    const prior=dockTool;dockTool=null;dockSession=null;dockPinned=false;updateAgentDock();focusDockTool(prior);return true;
  }
  if(data.dockRecord){dockSession=data.dockRecord;dockPinned=true;updateAgentDock();return true;}
  if(data.dockOpen){
    openView('sessions');
    void mutation(async()=>{state.sessionBefore=null;state.sessionCheckpoint=null;state.session=await api('sessions/'+encodeURIComponent(data.dockOpen));},button,'Session opened.')
      .then(()=>$('conversation-continuity')?.focus({preventScroll:true}));
    return true;
  }
  return false;
}
`;
