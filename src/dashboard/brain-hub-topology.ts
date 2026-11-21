import { BRAIN_HUB_CORTEX_DEPTH } from './brain-hub-cortex.js';

export const BRAIN_HUB_TOPOLOGY = 'const topologyCortexDepth = '+JSON.stringify(BRAIN_HUB_CORTEX_DEPTH)+';\n'+String.raw`
const topologyCapacity=8,topologyFreshMs=6500,topologyTravelMs=1150,topologyLifetimeMs=2700;
const topologyActivity=new Map();
let topologyTimer=0;
function topologyMotionAllowed(){
  return state.view==='overview'&&state.live&&state.recording!==false&&state.connection==='reachable'&&!state.errors.telemetry&&
    state.features?.features?.liveActivity!==false&&!state.replayId&&!state.motionPaused&&!document.hidden&&!reduced.matches;
}
function noteTopologyActivity(events){
  if(!topologyMotionAllowed())return;
  const observedAt=performance.now(),now=Date.now();
  for(const event of events){
    const age=now-Date.parse(event.timestamp);
    if(exchangeKey(event)&&rosterTool(event.agent)&&(!state.project||event.projectId===state.project)&&
      age>=0&&age<=topologyFreshMs&&!topologyActivity.has(event.id))topologyActivity.set(event.id,{event,observedAt});
  }
  while(topologyActivity.size>24)topologyActivity.delete(topologyActivity.keys().next().value);
}
function clearTopologyActivity(){
  topologyActivity.clear();
  clearTimeout(topologyTimer);
  topologyTimer=0;
}
function topologySlots(tools){
  const leftCount=Math.ceil(tools.length/2),rightCount=Math.floor(tools.length/2);
  return tools.map(([tool,records],index)=>{
    const left=index%2===0,count=left?leftCount:rightCount;
    const row=Math.floor(index/2);
    const y=(left?190:210)+(row-(count-1)/2)*(count>2?83:151);
    const x=(left?155:825)+(row%2)*(left?27:24);
    return {tool,records,left,x,y};
  });
}
function topologyRankedTools(tools){
  return [...tools].sort((a,b)=>Number(b[1].some(record=>record.presence))-Number(a[1].some(record=>record.presence)));
}
function topologyRoute(slot,direction){
  const offset=slot.left?1:-1;
  const toolX=slot.x+62*offset,toolY=slot.y;
  const brainX=500-offset*(56+Math.round(Math.abs(toolY-186)/11));
  const brainY=174+Math.round((toolY-200)*.39);
  const firstX=toolX+Math.round(Math.abs(brainX-toolX)*.46)*offset,firstY=toolY+(slot.left?10:-6);
  const secondX=brainX-Math.round(Math.abs(brainX-toolX)*.40)*offset,secondY=brainY-Math.round((toolY-brainY)*.18);
  const points=[[toolX,toolY],[firstX,firstY],[secondX,secondY],[brainX,brainY]];
  if(direction==='result')points.reverse();
  return 'M '+points[0].join(' ')+' C '+points.slice(1).flat().join(' ');
}
function topologyState(){
  if(state.replayId)return ['review','Journal replay'];
  if(state.connection==='offline')return ['unavailable','Workspace offline'];
  if(state.errors.telemetry)return ['unavailable','Activity unavailable'];
  if(state.features?.features?.liveActivity===false)return ['review','Live updates off'];
  if(state.connection!=='reachable'||!state.live)return ['review','Waiting for activity'];
  if(state.recording===false)return ['review','Recording off'];
  if(state.motionPaused||reduced.matches)return ['review','Motion off'];
  return ['ready','Observing MCP traffic'];
}
const topologyOperations=[
  {key:'retrieval',label:'Retrieval',tools:['project_brief','context_pack','recall','global_recall','global_recall_scored','memory_inspect','memory_evidence','live_brain_brief']},
  {key:'knowledge',label:'Knowledge write',tools:['project_knowledge']},
  {key:'sessions',label:'Sessions & handoffs',tools:['session_list','session_read','session_checkpoint_read','session_open','session_record','session_resume','agent_handoff']},
];
const topologyOtherOperation={key:'workspace',label:'Workspace tools'};
function topologyOperation(tool){
  return topologyOperations.find(item=>item.tools.includes(tool))??topologyOtherOperation;
}
const topologyMemoryLimit=36,topologyMemorySlots=[];
for(let row=0;row<8;row++){
  const y=18+row*9;
  for(let x=12+(row%2)*4.5;x<=89;x+=9){
    const lobe=x<50?32:68;
    if(Math.abs(x-50)>5&&((x-lobe)/24)**2+((y-50)/39)**2<.95)topologyMemorySlots.push([x,y]);
  }
}
const topologyPlacedMemories=new Map();
let topologyMemoryScope;
const topologyMemoryKey=(project,id)=>JSON.stringify([project,id]);
function topologyMemoryHash(key){
  let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return hash>>>0;
}
function topologyMemoryPoints(){
  if(topologyMemoryScope!==state.project){topologyMemoryScope=state.project;topologyPlacedMemories.clear();}
  const eligible=arr(state.graph?.nodes).filter(node=>node.kind==='memory'&&node.memoryId&&(!state.project||node.project===state.project));
  const byKey=new Map(eligible.map(node=>[topologyMemoryKey(node.project,node.memoryId),node]));
  const current=topologyFreshDeliveries();
  const returned=([key,node])=>topologyDeliveryMatches(node.updatedAt,current.get(key));
  const entries=[...byKey.entries()].sort((a,b)=>Number(returned(b))-Number(returned(a))).slice(0,Math.min(topologyMemoryLimit,topologyMemorySlots.length));
  const visible=new Set(entries.map(([key])=>key));
  for(const key of topologyPlacedMemories.keys())if(!visible.has(key))topologyPlacedMemories.delete(key);
  const used=new Set(topologyPlacedMemories.values());
  for(const key of [...visible].sort())if(!topologyPlacedMemories.has(key)){
    let slot=topologyMemoryHash(key)%topologyMemorySlots.length;
    while(used.has(slot))slot=(slot+1)%topologyMemorySlots.length;
    used.add(slot);topologyPlacedMemories.set(key,slot);
  }
  return entries.map(([key,node])=>({key,node,position:topologyMemorySlots[topologyPlacedMemories.get(key)]}));
}
function topologyDelivered(event){
  return exchangeKey(event)&&event.kind==='tool-end'&&event.outcome==='success'?arr(event.contextMemoryIds):[];
}
function topologyFreshDeliveries(){
  const deliveries=new Map();
  if(!topologyMotionAllowed())return deliveries;
  const now=performance.now();
  for(const {event,observedAt} of topologyActivity.values())if(now-observedAt<topologyLifetimeMs){
    for(const id of topologyDelivered(event))deliveries.set(topologyMemoryKey(event.projectId,id),Date.parse(event.timestamp));
  }
  return deliveries;
}
function topologyDeliveryMatches(savedAt,receiptTime){
  const saved=Date.parse(savedAt);
  return Number.isFinite(receiptTime)&&(!Number.isFinite(saved)||saved<=receiptTime);
}
function topologyDeliveryReceipts(){
  const deliveries=new Map();
  const through=state.replayId?displayEvent()?.sequence??-1:Infinity;
  for(const event of state.events)if(event.sequence<=through){
    for(const id of topologyDelivered(event))deliveries.set(topologyMemoryKey(event.projectId,id),event);
  }
  return deliveries;
}
function topologyMemoryExcerpt(node,title){
  let excerpt=String(node.snippet??'').trim();
  for(let copy=0;copy<2&&excerpt.startsWith(title)&&/\s/.test(excerpt[title.length]??'');copy++){
    excerpt=excerpt.slice(title.length).trimStart();
  }
  return excerpt.length>153?excerpt.slice(0,150).trimEnd()+'…':excerpt;
}
function topologyMemoryMarker({key,node,position},delivery,identities){
  const [x,y]=position,title=node.label||'Stored memory',source=arr(node.sources)[0]??node.source;
  const excerpt=topologyMemoryExcerpt(node,title);
  const sourceLabel=String(source??'').replace(/\s*·\s*sha256:[0-9a-f]{64}/i,'').replace(/\blines:(\d+)(?:-(\d+))?/,
    (value,start,end)=>end?'lines '+start+'–'+end:'line '+start).slice(0,95);
  const id='topology-memory-'+node.id, tip=id+'-tip';
  const delivered=delivery?'<span class="topology-tip-delivery">Last returned to '+esc(topologyToolName(dockEventTool(delivery,identities)))+
    ' · '+esc(isoTime(delivery.timestamp))+'</span>':'';
  return '<span class="topology-memory-pin" data-side="'+(x>50?'right':'left')+'" style="--point-x:'+((x+14)/1.28).toFixed(1)+'%;--point-y:'+((y+14)/1.28).toFixed(1)+'%">'+
    '<button class="topology-memory-point" type="button" data-topology-memory data-memory-key="'+esc(key)+'" data-memory-saved-at="'+esc(node.updatedAt)+
      '" data-node="'+esc(node.id)+'" id="'+esc(id)+
      '" aria-label="Inspect '+esc(title)+'" aria-describedby="'+esc(tip)+'"></button>'+
    '<span class="topology-memory-tip" id="'+esc(tip)+'" role="tooltip"><strong>'+esc(title)+'</strong>'+
      (excerpt?'<span class="topology-tip-excerpt">'+esc(excerpt)+'</span>':'')+
      (sourceLabel?'<span title="'+esc(source)+'">Source · '+esc(sourceLabel)+'</span>':'')+
      (node.updatedAt?'<span>Saved · '+esc(isoTime(node.updatedAt))+'</span>':'')+delivered+'</span></span>';
}
function topologyCortex(){
  return '<svg class="topology-core-mark" viewBox="-14 -14 128 128" aria-hidden="true" focusable="false">'+
    '<circle class="cortex-orbit-outer" cx="50" cy="50" r="57"/><circle class="cortex-orbit-inner" cx="50" cy="50" r="54"/>'+
    '<image class="cortex-depth" href="'+topologyCortexDepth+'" width="100" height="100" transform="matrix(1 .035 0 .93 0 1.75)"/></svg>';
}
function topologyCore(exchange,identities=new Map()){
  const operation=exchangeKey(exchange)?topologyOperation(exchange.tool):null;
  const memories=topologyMemoryPoints(), deliveries=topologyDeliveryReceipts();
  const total=Number.isSafeInteger(state.graph?.totalMemories)?Math.max(memories.length,state.graph.totalMemories):memories.length;
  const memoryLabel=memories.length?'<small class="topology-memory-label" title="Select a point to inspect its saved memory.">'+
    fmt(memories.length)+(total>memories.length?' of '+fmt(total):'')+' '+(total===1?'memory':'memories')+' shown</small>':'';
  const find=total?'<button class="btn quiet topology-memory-search" type="button" id="topology-memory-search" data-action="topology-find-memory">Find memories</button>':'';
  const detail=operation?'<span class="topology-core-last" title="Category of the observed MCP tool call">'+
    (state.replayId?'Selected operation':'Last operation')+' <strong><i class="topology-operation-dot" data-operation="'+operation.key+'" aria-hidden="true"></i>'+esc(operation.label)+'</strong></span>':'';
  return '<div class="topology-core" id="topology-core"><span class="topology-core-art">'+
    topologyCortex()+
    '<svg class="topology-operation-overlay" viewBox="-14 -14 128 128" focusable="false" aria-hidden="true">'+
      '<g data-operation="retrieval"><path d="M21 36c7-10 15-15 24-15M26 39c6-6 11-9 17-10"/></g>'+
      '<g data-operation="knowledge"><path d="M57 68c8-5 17-6 23-13M60 73c8-4 17-7 22-13"/></g>'+
      '<g data-operation="sessions"><path d="M56 23c9-1 18 2 24 8M60 30c6 0 13 2 18 6"/></g>'+
      '<g data-operation="workspace"><path d="M25 68c7-7 14-8 22-7M29 74c6-5 13-7 18-6"/></g>'+
    '</svg>'+memories.map(memory=>topologyMemoryMarker(memory,deliveries.get(memory.key),identities)).join('')+
    '</span><strong>Shadow Brain</strong><small>'+esc(scopeName())+'</small>'+
    '<div class="topology-core-details">'+detail+memoryLabel+find+'</div></div>';
}
const topologyToolName=tool=>tool==='mcp-client'?'MCP client':hostName(tool);
function topologyTool(slot,extra=false){
  const {tool,records}=slot;
  const connected=records.filter(record=>record.presence).length;
  const text=connected?(connected===1?'MCP connected':fmt(connected)+' MCP connections'):
    records.some(record=>record.kind==='connection'&&record.event)?'Recorded MCP activity':
    records.some(record=>record.session)?'Recorded session':'Reported activity';
  const latest=records.reduce((prior,record)=>record.event&&(!prior||record.event.sequence>prior.sequence)?record.event:prior,null);
  const operation=latest?exchangeKey(latest)?latest.tool+' · '+exchangeLabel(latest):eventLabel(latest)+' · '+evidence(latest):null;
  const recorded=operation?'<span class="topology-recorded" title="'+esc(operation+' · '+time(latest.timestamp))+'">'+esc(operation)+'</span>':'';
  const name=esc(topologyToolName(tool));
  return '<li class="topology-node"'+(extra?'':' data-side="'+(slot.left?'left':'right')+'" style="--node-x:'+(slot.x/10)+'%;--node-y:'+(slot.y/4)+'%"')+'>'+
    '<button class="topology-tool" type="button" data-topology-tool data-connected="'+!!connected+'" data-dock-tool="'+esc(tool)+'" aria-expanded="'+(tool===dockTool)+'" aria-controls="tool-dock-details">'+
    toolMark(tool)+'<span class="topology-node-text"><strong title="'+name+'">'+name+'</strong><small><i class="topology-state-dot" aria-hidden="true"></i>'+
    esc(text)+'</small>'+recorded+'</span><span class="topology-traffic" hidden></span></button></li>';
}
function topologyMarkup({tools,connections:identities}){
  // Keep an attached transport visible even when many tools have historical evidence.
  const ranked=topologyRankedTools(tools);
  const slots=topologySlots(ranked.slice(0,topologyCapacity)),[status,statusLabel]=topologyState();
  const connections=tools.reduce((total,[,records])=>total+records.filter(record=>record.presence).length,0);
  const presence=state.errors.presence||state.connection==='offline'?'MCP presence unavailable':
    state.presence?.enabled===false?'MCP presence off':!state.presence?(local?'Checking MCP presence…':'Current MCP presence unavailable'):
    fmt(connections)+' connected via MCP';
  const paths=slots.map(slot=>{
    const connected=slot.records.some(record=>record.presence);
    return '<path class="topology-strand" data-strand-tool="'+esc(slot.tool)+'" data-connected="'+connected+'" data-selected="'+(slot.tool===dockTool)+
      '" d="'+topologyRoute(slot,'request')+'"/>';
  }).join('');
  const extra=ranked.slice(topologyCapacity);
  const exchange=state.replayId?displayEvent():[...state.events].reverse().find(event=>exchangeKey(event)&&(!state.project||event.projectId===state.project));
  const latest=exchangeKey(exchange)?'<button class="topology-latest btn quiet" type="button" data-event="'+esc(exchange.id)+'">'+
    '<span class="topology-latest-label">'+(state.replayId?'Selected exchange':'Latest recorded exchange')+'</span><strong>'+esc(topologyToolName(dockEventTool(exchange,identities)))+
    ' <span aria-hidden="true">'+(exchange.kind==='tool-start'?'→':'←')+'</span><span class="sr-only">'+(exchange.kind==='tool-start'?' to ':' from ')+'</span> Brain</strong>'+
    '<span>'+esc(exchange.tool)+' · '+esc(exchangeLabel(exchange))+'</span><time class="mono" datetime="'+esc(exchange.timestamp)+'">'+esc(time(exchange.timestamp))+'</time></button>':
    '<p class="topology-empty muted">'+(state.replayId?'No measured MCP exchange at this point in the journal.':'Measured tool requests and results appear here.')+'</p>';
  return '<div class="topology-head"><div><h2>Agent connections</h2><p class="muted small">'+esc(presence)+' · '+fmt(tools.length)+' '+(tools.length===1?'tool':'tools')+' with evidence</p></div>'+
    '<span class="topology-status" data-status="'+status+'"><i class="topology-state-dot" aria-hidden="true"></i>'+esc(statusLabel)+'</span></div>'+
    '<div class="topology-stage"><svg class="topology-wires" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden="true">'+
    '<defs><linearGradient id="topology-strand-light"><stop stop-color="#447a9e"/><stop offset=".44" stop-color="#8ee6e2"/><stop offset="1" stop-color="#487d9e"/></linearGradient></defs>'+
    '<g class="topology-paths">'+paths+'</g><g id="topology-travel"></g></svg>'+topologyCore(exchange,identities)+
    (slots.length?list(slots.map(slot=>topologyTool(slot)).join(''),'aria-label="Tools with project evidence"','topology-nodes'):'')+'</div>'+
    (extra.length?'<details id="topology-more" class="topology-more"><summary>'+extra.length+' more '+(extra.length===1?'tool':'tools')+'</summary>'+
    list(extra.map(([tool,records])=>topologyTool({tool,records},true)).join(''),'','topology-extra')+'</details>':'')+
    '<div class="topology-foot"><div class="topology-legend" aria-label="Traffic directions">'+
    '<span class="topology-request"><span aria-hidden="true">→</span> Request to Brain</span><span class="topology-result"><span aria-hidden="true">←</span> Result to tool</span></div>'+
    latest+'</div>';
}
function updateTopologyActivity(roster){
  clearTimeout(topologyTimer);
  topologyTimer=0;
  const travel=$('topology-travel');
  if(!travel||!topologyMotionAllowed()){
    clearTopologyActivity();
    if(travel){
      travel.replaceChildren();
      delete travel.dataset.pulses;
      setTopologyTraffic(new Map());
    }
    return;
  }
  const now=performance.now(),active=new Map();
  for(const [id,entry] of topologyActivity){
    if(now-entry.observedAt>=topologyLifetimeMs){topologyActivity.delete(id);continue;}
    const tool=dockEventTool(entry.event,roster.connections),direction=entry.event.kind==='tool-start'?'request':'result';
    active.set(JSON.stringify([tool,direction]),{...entry,tool,direction});
  }
  const ranked=topologyRankedTools(roster.tools);
  const slots=new Map(topologySlots(ranked.slice(0,topologyCapacity)).map(slot=>[slot.tool,slot]));
  const pulses=[...active.values()].filter(entry=>slots.has(entry.tool)&&now-entry.observedAt<topologyTravelMs);
  const signature=JSON.stringify(pulses.map(entry=>[entry.event.id,topologyRoute(slots.get(entry.tool),entry.direction)]));
  if(travel.dataset.pulses!==signature){
    travel.dataset.pulses=signature;
    travel.replaceChildren(...pulses.map(entry=>{
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',topologyRoute(slots.get(entry.tool),entry.direction));
      path.setAttribute('pathLength','1');
      path.setAttribute('class','topology-pulse topology-'+entry.direction+(entry.event.outcome==='error'?' topology-error':''));
      path.style.animationDelay='-'+Math.max(0,now-entry.observedAt)+'ms';
      return path;
    }));
  }
  const byTool=new Map();
  for(const entry of active.values()){
    const entries=byTool.get(entry.tool)??[];
    entries.push(entry);
    byTool.set(entry.tool,entries);
  }
  setTopologyTraffic(byTool);
  if(topologyActivity.size)topologyTimer=setTimeout(()=>updateAgentDock(),Math.max(30,
    Math.min(...[...topologyActivity.values()].map(entry=>entry.observedAt+topologyLifetimeMs))-now+25));
}
function setTopologyTraffic(byTool){
  const core=$('topology-core');
  if(core){
    core.toggleAttribute('data-signalling',byTool.size>0);
    const current=[...byTool.values()].flat();
    const signals=new Set(current.map(entry=>topologyOperation(entry.event.tool).key));
    for(const region of core.querySelectorAll('.topology-operation-overlay [data-operation]')){
      region.toggleAttribute('data-active',signals.has(region.dataset.operation));
    }
    const delivered=topologyFreshDeliveries();
    for(const marker of core.querySelectorAll('[data-topology-memory]')){
      marker.toggleAttribute('data-fresh',topologyDeliveryMatches(marker.dataset.memorySavedAt,delivered.get(marker.dataset.memoryKey)));
    }
  }
  for(const button of $('tool-dock').querySelectorAll('[data-topology-tool]')){
    const entries=byTool.get(button.dataset.dockTool)??[];
    const fresh=entries.map(entry=>entry.direction==='request'?'Sent request':entry.event.outcome==='error'?'Received tool error':
      entry.event.outcome==='cancelled'?'Tool cancelled':'Received result').join(' · ');
    const label=button.querySelector('.topology-traffic');
    if(label.textContent!==fresh)label.textContent=fresh;
    label.hidden=!fresh;
    button.toggleAttribute('data-traffic',!!fresh);
  }
}
`;

export const BRAIN_HUB_TOPOLOGY_CSS = String.raw`
.topology-dock{--topology-request:#a7d6ff;--topology-result:#ffcf8f;margin-bottom:12px;background:var(--surface)}
.topology-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 16px;padding:13px 16px;border-bottom:1px solid var(--border)}
.topology-head h2{font-size:1.16rem;margin-bottom:2px}
.topology-status,.topology-state-dot{display:inline-flex;align-items:center;gap:6px}
.topology-status{color:var(--muted);font-size:.77rem;font-weight:650}
.topology-status[data-status=ready]{color:var(--cyan)}
.topology-status[data-status=unavailable]{color:var(--amber)}
.topology-state-dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.topology-stage{position:relative;isolation:isolate;height:clamp(350px,32vw,442px);overflow:hidden;background:
  radial-gradient(ellipse at 50% 42%,#19345266 0%,#0d203759 38%,transparent 67%),
  linear-gradient(158deg,#101b2c,#080f1a 50%,#0b1422)}
.topology-wires{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.topology-wires path{fill:none;vector-effect:non-scaling-stroke}
.topology-strand{stroke:#58718a;stroke-width:1.08;stroke-dasharray:2 5;stroke-linecap:round}
.topology-strand[data-connected=true]{stroke:url(#topology-strand-light);stroke-width:1.56;stroke-dasharray:none;filter:drop-shadow(0 0 3.7px #53cdf65d)}
.topology-strand[data-selected=true]{stroke:var(--cyan);stroke-width:1.85}
.topology-core{position:absolute;left:50%;top:46%;transform:translate(-50%,-44%);width:clamp(174px,27vw,315px);
  display:grid;justify-items:center;align-content:center;gap:1px;text-align:center;z-index:1;pointer-events:none}
.topology-core::before{content:"";position:absolute;z-index:-1;inset:-10% -19% 7%;border-radius:50%;
  background:radial-gradient(ellipse,#2361a362 2%,#16477a54 29%,#19467225 51%,transparent 70%);opacity:.75;transition:opacity .25s ease-out}
.topology-core-art{position:relative;display:block;width:100%;margin-bottom:-3px}
.topology-core-mark{display:block;width:100%;height:auto;overflow:visible;filter:drop-shadow(0 0 12px #4da2ed36)}
.topology-core[data-signalling]::before{opacity:1}
.cortex-depth{opacity:.84;filter:saturate(.76) contrast(1.13) brightness(.86) blur(.19px)}
.cortex-orbit-outer,.cortex-orbit-inner{fill:none;stroke:#7196bb;stroke-width:.22}
.cortex-orbit-outer{stroke-opacity:.23}
.cortex-orbit-inner{stroke-opacity:.34}
.topology-memory-pin{position:absolute;inset:0;pointer-events:none}
.topology-memory-pin:has(.topology-memory-point:is(:hover,:focus),.topology-memory-tip:hover){z-index:2}
.topology-memory-point{position:absolute;left:var(--point-x);top:var(--point-y);transform:translate(-50%,-50%);pointer-events:auto;
  width:19px;height:19px;border:0;border-radius:50%;padding:0;background:transparent;color:#fff0c8}
.topology-memory-point::before{content:"";position:absolute;inset:6px;border-radius:50%;background:currentColor;
  box-shadow:0 0 0 1px #6c4924,0 0 6px #ffd28f91}
.topology-memory-point[data-fresh]{color:#ffc264}
.topology-memory-point[data-fresh]::before{inset:4px;box-shadow:0 0 0 2px #f9ba6566,0 0 12px #ffc264}
.topology-memory-point:is(:hover,:focus-visible){outline:1px solid #fff0ca;outline-offset:0}
.topology-memory-tip{display:grid;visibility:hidden;position:absolute;top:clamp(10px,calc(var(--point-y) - 18px),calc(100% - 132px));left:calc(var(--point-x) + 8px);
  width:236px;max-width:calc(100vw - 40px);padding:9px 10px;gap:4px;border:1px solid var(--strong);border-radius:6px;
  text-align:left;color:var(--muted);background:var(--surface);box-shadow:0 4px 13px #03091970;font-size:.73rem;line-height:1.3;overflow-wrap:anywhere}
.topology-memory-pin[data-side=right] .topology-memory-tip{left:auto;right:calc(100% - var(--point-x) + 8px)}
.topology-memory-pin:not(.topology-tip-dismissed):is(:has(.topology-memory-point:is(:hover,:focus)),:has(.topology-memory-tip:hover)) .topology-memory-tip{
  visibility:visible;pointer-events:auto}
.topology-memory-tip strong{color:var(--ink);font-size:.86rem}
.topology-tip-excerpt{color:var(--ink)}
.topology-tip-delivery{color:var(--amber)}
.topology-core>strong{font-size:1.35rem;color:var(--ink);font-weight:730;letter-spacing:-.02em}
.topology-core small{color:var(--muted);font-size:.78rem;line-height:1.25;max-width:100%;overflow-wrap:anywhere}
.topology-core-details{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:3px 10px;margin-top:4px}
.topology-core-last{display:flex;align-items:center;flex-wrap:wrap;justify-content:center;gap:3px 7px;margin-top:4px;padding:3px 8px;border-radius:4px;
  background:var(--surface);color:var(--muted);font-size:.69rem;line-height:1.2}
.topology-core-last strong{display:inline-flex;align-items:center;gap:4px;color:var(--ink)}
.topology-core .topology-memory-label{display:flex;align-items:center;gap:4px;margin-top:4px;font-size:.68rem}
.topology-memory-search{pointer-events:auto;min-height:25px;padding:3px 5px;font-size:.68rem;margin-top:4px}
.topology-operation-dot{background:currentColor;border-radius:50%;width:5px;height:5px;flex:none}
.topology-operation-overlay{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.topology-operation-overlay [data-operation]{opacity:0;fill:none;stroke:currentColor;stroke-width:.65;stroke-linecap:round}
.topology-operation-overlay [data-active]{opacity:1;filter:drop-shadow(0 0 2.5px currentColor)}
.topology-core [data-operation=retrieval]{color:#a5fff4}
.topology-core [data-operation=knowledge]{color:#ffd299}
.topology-core [data-operation=sessions]{color:#eac3ff}
.topology-core [data-operation=workspace]{color:#d0e1ff}
:root[data-hub-theme=daylight] .topology-operation-dot[data-operation=retrieval]{color:var(--cyan)}
:root[data-hub-theme=daylight] .topology-operation-dot[data-operation=knowledge]{color:var(--amber)}
:root[data-hub-theme=daylight] .topology-operation-dot[data-operation=sessions]{color:var(--pink)}
:root[data-hub-theme=daylight] .topology-operation-dot[data-operation=workspace]{color:var(--blue)}
.topology-nodes{position:absolute;inset:0;pointer-events:none;list-style:none;padding:0}
.topology-nodes .topology-node{position:absolute;left:var(--node-x);top:var(--node-y);transform:translate(-50%,-50%);width:min(21%,230px);pointer-events:auto}
.topology-node{min-width:0}
.topology-nodes>li+li,.topology-extra>li+li{border:0}
.topology-tool{position:relative;display:flex;align-items:center;gap:10px;width:100%;min-height:61px;padding:8px 11px;
  color:var(--ink);text-align:left;border:1px solid #36516b;border-radius:7px;background:linear-gradient(140deg,#142237,#101b2a)}
.topology-tool[data-connected=true]{border-color:#4a7c87}
.topology-nodes .topology-tool::before{content:"";position:absolute;top:50%;width:6px;height:6px;border-radius:50%;transform:translateY(-50%);
  background:#5c7992;border:1px solid #a8b9cc}
.topology-nodes [data-side=left] .topology-tool::before{right:-4px}
.topology-nodes [data-side=right] .topology-tool::before{left:-4px}
.topology-nodes .topology-tool[data-connected=true]::before{background:#bcfbeb;border-color:#bcfbeb;box-shadow:0 0 5px #91fff0ab}
.topology-tool[data-connected=true] .topology-node-text small{color:var(--green)}
.topology-tool:hover,.topology-tool[aria-expanded=true]{border-color:#80bdcf;background:#192f44}
.topology-tool:focus-visible{outline-offset:3px}
.topology-tool .tool-mark{flex:none;width:29px;height:29px}
.topology-node-text{display:grid;gap:2px;min-width:0}
.topology-node-text strong{font-size:.94rem;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.topology-node-text small{display:flex;align-items:center;gap:6px;color:#b5c8d9;font-size:.72rem;line-height:1.18}
.topology-recorded{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted);font:.64rem/1.22 var(--mono)}
.topology-tool[data-traffic]{border-color:var(--cyan)}
.topology-traffic{position:absolute;top:calc(100% + 1px);right:2px;
  color:var(--cyan);background:var(--ground);border-radius:3px;max-width:calc(100% - 4px);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
  padding:0 4px;font:600 .65rem/1.35 var(--mono);pointer-events:none}
.topology-more{padding:8px 16px;border-top:1px solid var(--border)}
.topology-extra{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:7px;padding:0}
.topology-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px 14px;min-height:47px;padding:6px 14px;border-top:1px solid var(--border)}
.topology-legend{display:flex;flex-wrap:wrap;gap:5px 13px;font-size:.75rem;color:var(--muted)}
.topology-legend span>span{display:inline-block;margin-right:3px;font-size:.93rem;font-weight:760}
.topology-request{color:var(--topology-request)}
.topology-result{color:var(--topology-result)}
.topology-error{color:var(--red)}
.topology-latest{gap:4px 10px;justify-content:flex-start;text-align:left;flex-wrap:wrap;color:var(--muted)!important}
.topology-latest strong{color:var(--ink)}
.topology-latest-label{font-weight:400}
.topology-empty{font-size:.78rem}
.topology-pulse{stroke:currentColor;stroke-width:2.8;stroke-linecap:round;stroke-dasharray:.022 .018 .037 .018 .058 1.847;stroke-dashoffset:.17;
  filter:drop-shadow(0 0 5px currentColor);animation:topology-traverse 1.15s linear both}
.topology-pulse.topology-result{stroke-width:3.2}
@keyframes topology-traverse{0%{stroke-dashoffset:.17;opacity:0}12%{opacity:1}81%{opacity:1}100%{stroke-dashoffset:-1;opacity:0}}
:root[data-hub-theme=daylight] .topology-stage{
  background:radial-gradient(ellipse at center,#cae4ec9e,transparent 72%),#edf3f8
}
:root[data-hub-theme=daylight] .topology-dock{--topology-request:#225caa;--topology-result:#a34d0c}
:root[data-hub-theme=daylight] .topology-strand{stroke:#8197aa}
:root[data-hub-theme=daylight] .topology-strand[data-connected=true]{stroke:#397385;filter:none}
:root[data-hub-theme=daylight] .cortex-depth{opacity:.73;filter:saturate(.63) contrast(.99)}
:root[data-hub-theme=daylight] .topology-memory-point{color:#fff1cc}
:root[data-hub-theme=daylight] .topology-memory-point:is(:hover,:focus-visible){outline-color:#8c4319}
:root[data-hub-theme=daylight] .topology-tool{border-color:var(--border);background:var(--surface)}
:root[data-hub-theme=daylight] .topology-node-text small{color:var(--muted)}
:root[data-hub-theme=daylight] .topology-tool[data-connected=true]{border-color:#638d7d}
:root[data-hub-theme=daylight] .topology-tool[data-connected=true] .topology-node-text small{color:var(--green)}
:root[data-hub-theme=daylight] .topology-tool:is(:hover,[aria-expanded=true],[data-traffic]){border-color:#427b84;background:#e6f3f6}
:root[data-hub-theme=contrast] .topology-stage{background:var(--ground)}
:root[data-hub-theme=contrast] .topology-tool{border-color:var(--strong)}
:root[data-hub-theme=contrast] .topology-node-text small{color:var(--muted)}
:root[data-hub-theme=contrast] .topology-tool[data-connected=true] .topology-node-text small{color:var(--green)}
:root[data-hub-theme=contrast] .topology-tool:is(:hover,[aria-expanded=true],[data-traffic]){border-color:var(--cyan)}
@media(max-width:720px){
  .topology-stage{height:auto;min-height:176px;display:grid;gap:14px;padding:14px 10px}
  .topology-wires{display:none}
  .topology-core{position:static;transform:none;justify-self:center;width:min(228px,100%);padding:2px 4px}
  .topology-core-art{width:min(216px,100%);margin-bottom:0}
  .topology-memory-point{width:15px;height:15px}
  .topology-memory-point::before{inset:4px}
  .topology-memory-point[data-fresh]::before{inset:2px}
  .topology-memory-pin[data-side] .topology-memory-tip{top:95%;left:50%;right:auto;transform:translateX(-50%)}
  .topology-nodes .topology-tool::before{display:none}
  .topology-nodes{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 8px}
  .topology-nodes .topology-node{position:static;transform:none;width:auto}
  .topology-tool{gap:7px;min-height:50px;padding-inline:7px}
  .topology-tool .tool-mark{width:22px;height:22px}
  .topology-tool[data-traffic]{padding-bottom:16px}
  .topology-traffic{top:auto;right:5px;bottom:1px;background:none;font-size:.6rem}
}
@media(prefers-reduced-motion:reduce){.topology-pulse{display:none}}
`;
