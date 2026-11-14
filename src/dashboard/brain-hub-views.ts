import { BRAIN_HUB_SESSIONS } from './brain-hub-sessions.js';
import { BRAIN_HUB_CONTROLS } from './brain-hub-controls.js';
import { BRAIN_HUB_MANAGED_SKILLS } from './brain-hub-managed-skills.js';
import { BRAIN_HUB_CONTEXT } from './brain-hub-context.js';
import { BRAIN_HUB_USAGE } from './brain-hub-usage.js';
import { BRAIN_HUB_PROJECT_VIEWS } from './brain-hub-project-views.js';
import { BRAIN_HUB_ACTIONS } from './brain-hub-actions.js';

export const BRAIN_HUB_VIEWS = String.raw`
function eventLabel(event){
  if(event.tool)return event.tool+' · '+(event.outcome??(event.kind==='tool-start'?'started':'returned'));
  if(event.phase)return 'Phase · '+event.phase;
  return event.kind.replaceAll('-',' ');
}
function eventTone(event){return event.source==='measured'?'cyan':'amber';}
function evidence(event){return event.source==='measured'?'Measured '+(event.transport==='mcp'?'MCP':'tool'):'Reported';}
function timelineMarkup(trace=false){
  const events=state.events;
  if(!events.length)return empty(state.errors.telemetry?'Activity unavailable':state.live?'No recorded activity':'Activity display is off',state.errors.telemetry||
    (state.live?'A tool exchange or reported phase will appear here when activity recording is enabled.':'Enable live dashboard activity in Setup.'),view('setup','Open setup'));
  return list([...events].reverse().map(event=>'<li><button class="entry event" type="button" data-event="'+esc(event.id)+'" aria-pressed="'+(state.replayId===event.id)+'"><time class="mono" datetime="'+esc(event.timestamp)+'">'+esc(time(event.timestamp))+'</time><span>'+esc(eventLabel(event))+' <span class="muted">· '+esc(hostName(event.agent))+'</span></span>'+chip(evidence(event),eventTone(event))+'</button></li>').join(''),trace?'aria-label="Recorded tool trace"':'aria-label="Recorded activity"');
}
function trace(values){
  if(values.length<2)return '';
  const max=Math.max(...values,1);
  const points=values.map((value,index)=>(2+index*62/(values.length-1))+','+(22-value*19/max));
  return '<svg class="metric-trace cyan" viewBox="0 0 66 26" aria-hidden="true"><path d="M'+points.join(' L')+'" fill="none" stroke="currentColor" stroke-width="1.25"/></svg>';
}
function telemetryStrip(){
  const measured=state.events.filter(event=>event.source==='measured'&&event.kind==='tool-end');
  const durations=measured.map(event=>event.durationMs).filter(Number.isFinite);
  const observed=new Set(state.events.filter(event=>event.agent&&event.agent!=='user'&&event.agent!=='portal').map(event=>event.agent));
  const memories=state.graph?.totalMemories??state.overview?.quality?.total;
  const pack=state.context?.budget;
  return '<dl class="strip"><div class="metric"><dt>Stored memories in scope</dt><dd class="mono cyan">'+fmt(memories)+'</dd><small>'+esc(scopeName())+'</small></div><div class="metric">'+trace(durations.slice(-16))+'<dt>Measured tool returns</dt><dd class="mono">'+(state.live?fmt(measured.length):'Unavailable')+'</dd><small>'+esc(state.errors.telemetry?'Activity unavailable':state.live?fmt(observed.size)+' client labels in retained activity':'Activity display off')+'</small></div><div class="metric"><dt>Model usage receipts</dt><dd class="mono">'+(state.usage?fmt(arr(state.usage.receipts).length):'Not loaded')+'</dd><small>'+(state.usage?'Host-reported · retained window':'Open Usage to inspect host reports')+'</small></div><div class="metric"><dt>Latest context pack estimate</dt><dd class="mono pink">'+(pack?fmt(pack.estimatedTokens)+' / '+fmt(pack.tokenBudget):'No pack built')+'</dd><small>'+esc(pack?arr(state.context.entries).length+' selected memories':'Assemble a scoped pack in Context')+'</small></div></dl>';
}
function rail(){
  const graph=arr(state.graph?.nodes);
  const projects=arr(state.overview?.projects).filter(project=>!state.project||project.id===state.project);
  const memories=graph.filter(node=>node.kind==='memory').slice(0,6);
  const projectsMarkup=projects.length?list(projects.slice(0,7).map(project=>'<li><button type="button" class="rail-entry" data-project="'+esc(project.id)+'" aria-pressed="'+(state.project===project.id)+'"><strong>'+esc(project.name)+'</strong><small>'+fmt(project.memories)+' memories</small></button></li>').join('')):empty('No projects with memories','Open a project workspace to add project-local knowledge.',view('setup','See setup'));
  return '<aside class="panel rail" aria-label="Projects and recent records"><div class="rail-title row"><h2>Projects</h2>'+chip(projects.length)+'</div>'+projectsMarkup+'<div class="rail-title row"><h2>Recent records</h2>'+chip(memories.length)+'</div>'+(memories.length?list(memories.map(node=>'<li><button type="button" class="rail-entry" data-node="'+esc(node.id)+'"><strong>'+esc(node.label)+'</strong><small>'+esc(node.category)+' · '+esc(hostName(node.agent))+'</small></button></li>').join('')):empty('No memory records','Add project knowledge or connect a host.',view('knowledge','Open knowledge')) )+'</aside>';
}
function graphMarkup(){
  const nodes=arr(state.graph?.nodes),nodeIds=new Set(nodes.map(node=>node.id));
  const edges=arr(state.graph?.edges).filter(edge=>nodeIds.has(edge.source)&&nodeIds.has(edge.target));
  const traceMode=state.graphMode==='trace';
  const filters=[['all','All links',''],['project','Project membership','blue'],['author','Recorded author','pink'],['typed','Recorded relation','cyan']];
  const legend=filters.map(([id,label,tone])=>'<button class="legend-filter" type="button" data-graph-filter="'+id+'" aria-pressed="'+(state.graphFilter===id)+'">'+
    (tone?'<i class="'+tone+'" aria-hidden="true"></i>':'')+esc(label)+'</button>').join('');
  const graphTools=traceMode?'':action('node-list','Find node','','aria-expanded="'+state.listing+'" aria-controls="node-list"')+
    action('clear-focus','Clear focus','quiet','id="clear-focus" '+(state.focus?'':'hidden'));
  return '<section class="panel graph-panel'+(state.graph&&!nodes.length&&!traceMode?' graph-panel-empty':'')+'"><div class="panel-head"><div><h2>'+(traceMode?'Recorded trace':'Memory graph')+'</h2><span class="small mono muted">'+fmt(nodes.length)+' records / '+fmt(edges.length)+' relationships'+(state.graph?.truncated?' · limited view':'')+'</span></div><div class="actions">'+
    action('graph','Graph','','aria-pressed="'+!traceMode+'"')+action('trace','Trace','','aria-pressed="'+traceMode+'"')+graphTools+'</div></div>'+
    '<div class="graph-stage" id="brain-stage"><canvas id="brain-canvas" aria-hidden="true" '+(traceMode?'hidden':'')+'></canvas><div class="graph-meta" aria-hidden="true"><span>Project memory</span><span>Recorded authors</span></div>'+
    (!nodes.length&&!traceMode?'<div class="graph-empty"><strong>'+esc(state.errors.graph?'Memory graph unavailable':state.graph?'No stored graph records':'Loading memory graph')+'</strong><p class="small muted">'+esc(state.errors.graph??(state.graph?'Save knowledge or use a connected host to create your first record.':'Reading the selected workspace.'))+'</p><div class="actions">'+(state.errors.graph?action('refresh','Retry'):view('knowledge','Open knowledge')+view('setup','Connect a host'))+'</div></div>':'')+
    graphFinderMarkup(!state.listing||traceMode)+'<div id="trace-list" class="trace-list" '+(traceMode?'':'hidden')+'>'+(traceMode?timelineMarkup(true):'')+'</div>'+
    '<span class="live-path-label" id="graph-event" aria-hidden="true" hidden></span><div id="node-caption" class="focus-label" hidden></div></div>'+
    (!traceMode?'<div class="graph-foot"><div class="legend" aria-label="Graph relationship filters">'+legend+'</div><div class="graph-camera" aria-label="Graph zoom controls">'+
      action('graph-zoom-out','−','','id="graph-zoom-out" aria-label="Zoom out"')+'<output class="mono" id="graph-zoom">100%</output>'+
      action('graph-zoom-in','+','','id="graph-zoom-in" aria-label="Zoom in"')+action('graph-fit','Fit','','aria-label="Reset graph to fit"')+'</div></div>':'')+
    '<div class="graph-exchanges" id="graph-exchanges">'+exchangeMarkup()+'</div>'+
    '<p class="small graph-foot" id="project-file-pulse" hidden></p></section>';
}
function inspectorBody(){
  const item=arr(state.graph?.nodes).find(node=>node.id===state.picked);
  const memory=state.memory?.memory;
  const event=displayEvent();
  const tabs=[['record','Record'],['sources','Sources'],['relations','Links'],['event','Event']].map(([id,label])=>btn(label,'data-inspect="'+id+'" aria-pressed="'+(state.inspector===id)+'"')).join('');
  let details;
  if(state.inspector==='event'){
    details=event?'<div class="panel-body stack"><div class="row"><h3>'+esc(eventLabel(event))+'</h3>'+chip(evidence(event),eventTone(event))+'</div><dl class="facts">'+fact('Host',hostName(event.agent))+fact('Time',isoTime(event.timestamp))+fact('Transport',event.transport)+fact('Session',event.sessionId)+fact('Outcome',event.outcome)+fact('Duration',Number.isFinite(event.durationMs)?event.durationMs+' ms':undefined)+'</dl>'+pairedExchangeMarkup(event)+action('copy-event','Copy event receipt')+'</div>':empty(state.replayExpired?'Replay record expired':'No activity selected',state.replayExpired?'Choose another journal record or return to Latest.':'Select a recorded journal event to inspect its source and outcome.');
  }else if(!item){
    details=empty('Select a graph record','Choose a node, a recent record, or a journal event to inspect its evidence.',state.events.length?action('inspect-latest','Inspect latest event'):'');
  }else if(state.inspector==='sources'){
    const sources=arr(memory?.sources??item.sources);
    details='<div class="panel-body stack"><h3>'+esc(item.label)+'</h3>'+(sources.length?list(sources.map(source=>'<li class="item mono small">'+esc(source)+'</li>').join('')):empty('No source attached','This record has no persisted source reference.'))+(local&&item.memoryId?action('source-evidence','Verify original source','','data-memory="'+esc(item.memoryId)+'"'):'')+'</div>';
  }else if(state.inspector==='relations'){
    const edges=arr(state.graph?.edges).filter(edge=>edge.source===item.id||edge.target===item.id);
    details='<div class="panel-body stack"><h3>'+esc(item.label)+'</h3>'+(edges.length?list(edges.map(edge=>{
      const id=edge.source===item.id?edge.target:edge.source;
      const node=arr(state.graph?.nodes).find(point=>point.id===id);
      return '<li><button type="button" class="entry" data-node="'+esc(id)+'"><strong>'+esc(node?.label??id)+'</strong><small>'+esc(edge.kind)+'</small></button></li>';
    }).join('')):empty('No graph relationships','There are no visible relationships for this record.'))+'</div>';
  }else{
    details='<div class="panel-body stack"><div class="row"><h3>'+esc(item.kind==='agent'?hostName(item.label):item.label)+'</h3>'+chip(item.kind)+'</div><dl class="facts">'+fact('Project',item.project)+fact('Recorded by',item.agent&&hostName(item.agent))+fact('State',memory?.effectiveState??item.effectiveState)+fact('Updated',item.updatedAt&&isoTime(item.updatedAt))+'</dl>'+(item.kind==='memory'?'<pre>'+esc(memory?.content??item.snippet)+'</pre>'+action('copy-memory','Copy record'):'')+'</div>';
  }
  return '<div class="panel-head"><h2>Record inspector</h2>'+(item?chip(item.category??item.kind):'')+'</div><div class="tabs" aria-label="Inspector tabs">'+tabs+'</div>'+details;
}
function renderInspector(){
  const target=$('inspector');
  if(target){
    const tab=target.querySelector('[data-inspect]:focus')?.dataset.inspect;
    target.innerHTML=inspectorBody();
    if(tab)[...target.querySelectorAll('[data-inspect]')].find(button=>button.dataset.inspect===tab)?.focus({preventScroll:true});
  }
  syncGraphControls();
}
function overviewPage(){
  const event=displayEvent();
  const pack=state.context?.budget;
  const compare=state.comparison;
  const contextBody=pack?'<div class="panel-body stack"><div class="row"><span class="muted">Estimated pack tokens</span><strong class="mono">'+fmt(pack.estimatedTokens)+' / '+fmt(pack.tokenBudget)+'</strong></div><div class="meter"><i style="width:'+Math.min(100,Math.round(100*pack.estimatedTokens/Math.max(1,pack.tokenBudget)))+'%"></i></div>'+(compare?'<p class="small muted">Legacy '+fmt(compare.legacy.budget.estimatedTokens)+' · Adaptive '+fmt(compare.adaptive.budget.estimatedTokens)+' estimated tokens</p>':'')+(state.context?.efficiency?'<p><strong>'+(state.context.efficiency.signedTokenDifference<0?fmt(-state.context.efficiency.signedTokenDifference)+' more estimated tokens':fmt(state.context.efficiency.estimatedTokensAvoided)+' estimated tokens avoided')+'</strong></p><p class="small muted">Compared with the same task using the largest pack permitted by project controls. '+state.context.efficiency.assemblyMs+' ms assembly. Not measured billing savings.</p>':'')+view('context','Open context pack')+'</div>':empty('No context pack for this session','Assemble a pack to inspect estimated tokens and selection reasons.',view('context','Build context pack'));
  return heading('Brain control room','Explore stored memories, inspect tool exchanges, and connect your project.',action('pause',state.motionPaused?'Resume motion':'Pause motion','','id="pause-motion" '+(reduced.matches?'disabled':''))+view('setup','Connection setup'))+
    telemetryStrip()+'<div class="control-grid">'+rail()+graphMarkup()+'<section class="panel inspect" id="inspector">'+inspectorBody()+'</section></div><div class="lower">'+panel('Context efficiency',contextBody,chip('Estimates','pink'))+
    panel('Activity journal','<div class="replay"><label for="replay" class="small muted">Seek record</label><input id="replay" type="range" min="0" max="'+Math.max(0,state.events.length-1)+'" value="'+Math.max(0,state.events.indexOf(event))+'" '+(state.events.length?'':'disabled')+'><output class="mono small" id="event-time">'+esc(event?time(event.timestamp):state.replayExpired?'Expired':'—')+'</output>'+action('live','Latest','','id="return-live" '+(state.replayId?'':'hidden'))+'</div><div class="timeline" id="timeline">'+timelineMarkup()+'</div>', '<span id="journal-state">'+chip(state.replayId?(state.replayExpired?'Replay expired':'Replay'):state.live?'Recorded activity':'Activity unavailable',state.replayId?'amber':'cyan')+'</span>')+'</div>';
}
function updateOverviewLive(){
  const timeline=$('timeline'),range=$('replay');
  if(!timeline||!range)return;
  const event=displayEvent();
  const markup=timelineMarkup(),previous=timeline.querySelector('[data-event]:focus')?.dataset.event;
  if(timeline.dataset.markup!==markup){
    timeline.innerHTML=markup;timeline.dataset.markup=markup;
    if(previous)[...timeline.querySelectorAll('[data-event]')].find(node=>node.dataset.event===previous)?.focus({preventScroll:true});
  }
  const traceList=$('trace-list');
  if(traceList&&!traceList.hidden){
    const trace=timelineMarkup(true),previous=traceList.querySelector('[data-event]:focus')?.dataset.event;
    if(traceList.dataset.markup!==trace){
      traceList.innerHTML=trace;traceList.dataset.markup=trace;
      if(previous)[...traceList.querySelectorAll('[data-event]')].find(node=>node.dataset.event===previous)?.focus({preventScroll:true});
    }
  }
  range.max=String(Math.max(0,state.events.length-1));range.value=String(Math.max(0,state.events.indexOf(event)));range.disabled=!state.events.length;
  if(event)range.setAttribute('aria-valuetext',time(event.timestamp)+' · '+eventLabel(event));
  else range.removeAttribute('aria-valuetext');
  $('event-time').textContent=event?time(event.timestamp):state.replayExpired?'Expired':'—';
  $('return-live').hidden=!state.replayId;
  $('journal-state').innerHTML=chip(state.replayId?(state.replayExpired?'Replay expired':'Replay'):state.live?'Recorded activity':'Activity unavailable',state.replayId?'amber':'cyan');
  const strip=$('main').querySelector('.strip');if(strip)strip.outerHTML=telemetryStrip();
  if(state.inspector==='event'&&!$('inspector').matches(':focus-within'))renderInspector();
  const pause=$('pause-motion');pause.textContent=state.motionPaused?'Resume motion':'Pause motion';pause.disabled=reduced.matches;
  updateExchanges();drawGraph();
}
${BRAIN_HUB_CONTEXT}
${BRAIN_HUB_USAGE}
${BRAIN_HUB_SESSIONS}
${BRAIN_HUB_CONTROLS}
${BRAIN_HUB_MANAGED_SKILLS}
function setupPage(){
  const features=state.features;
  const flags=features?list(arr(features.definitions).map(item=>{
    const reason=featureLimit(item.id),on=!reason&&features.features[item.id];
    return '<li class="item"><div class="row"><strong>'+esc(item.label)+'</strong>'+btn(reason?'Unavailable':on?'On':'Off','data-feature="'+esc(item.id)+'" role="switch" aria-checked="'+!!on+'" aria-label="'+esc(item.label)+'" '+(state.pending||reason?'disabled':''))+'</div><p class="small muted">'+esc(reason??item.description)+'</p></li>';
  }).join('')):error('features','feature settings')||empty('Loading feature settings','The server supplies the current switches and their descriptions.');
  const hosts=arr(state.integrations?.agents);
  const recipes=hosts.length?list(hosts.map(host=>'<li class="item"><div class="row"><h3>'+esc(host.label)+'</h3>'+chip(host.installation)+'</div><p class="small muted">'+esc(host.detail)+'</p><details><summary>Connection recipe</summary><div class="stack"><pre>'+esc(host.config?.content)+'</pre>'+arr(host.config?.notes).map(note=>'<p class="small muted">'+esc(note)+'</p>').join('')+'<div class="actions">'+action('copy-host','Copy configuration','','data-host="'+esc(host.id)+'"')+action('copy-command','Copy skill command','','data-host="'+esc(host.id)+'"')+'</div></div></details></li>').join('')):error('integrations','host recipes')||empty('Loading host recipes','Configuration recipes are generated locally.');
  const checks=arr(state.integrations?.checks);
  return heading('Workspace setup','Configure host access and manage the workspace’s real feature switches.',action('refresh','Refresh checks'))+projectControls()+managedSkillControls()+'<div class="two">'+panel('Features',flags,features?chip('Revision '+features.revision):'')+panel('Client configuration',recipes,chip('Local recipes','cyan'))+'</div>'+panel('Local checks',checks.length?list(checks.map(check=>'<li class="item"><div class="row"><strong>'+esc(check.label)+'</strong>'+chip(check.status,check.status==='pass'?'green':check.status==='error'?'red':'')+'</div><p class="small muted">'+esc(check.detail)+'</p></li>').join('')):empty('No checks loaded','Refresh to retry host and storage checks.'),checks.length?action('copy-diagnostics','Copy diagnostics'):'');
}
const views={overview:overviewPage,sessions:sessionsPage,context:contextPage,models:modelsPage,usage:usagePage,setup:setupPage,knowledge:knowledgePage,room:roomPage,learning:learningPage};
` + BRAIN_HUB_PROJECT_VIEWS + BRAIN_HUB_ACTIONS;
