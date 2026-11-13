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
  return list([...events].reverse().map(event=>'<li><button class="entry event" type="button" data-event="'+esc(event.id)+'" aria-pressed="'+(state.replayId===event.id)+'"><time class="mono">'+esc(time(event.timestamp))+'</time><span>'+esc(eventLabel(event))+' <span class="muted">· '+esc(hostName(event.agent))+'</span></span>'+chip(evidence(event),eventTone(event))+'</button></li>').join(''),trace?'aria-label="Recorded tool trace"':'aria-label="Recorded activity"');
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
  const observed=new Set(state.events.map(event=>event.agent).filter(Boolean));
  const memories=state.graph?.totalMemories??state.overview?.quality?.total;
  const pack=state.context?.budget;
  return '<dl class="strip"><div class="metric"><dt>Stored memories in scope</dt><dd class="mono cyan">'+fmt(memories)+'</dd><small>'+esc(scopeName())+'</small></div><div class="metric">'+trace(durations.slice(-16))+'<dt>Measured tool returns</dt><dd class="mono">'+(state.live?fmt(measured.length):'Unavailable')+'</dd><small>'+esc(state.errors.telemetry?'Activity unavailable':state.live?fmt(observed.size)+' hosts in retained activity':'Activity display off')+'</small></div><div class="metric"><dt>Model input and output</dt><dd class="mono">Unavailable</dd><small>Model usage receipts are unavailable</small></div><div class="metric"><dt>Latest context pack estimate</dt><dd class="mono pink">'+(pack?fmt(pack.estimatedTokens)+' / '+fmt(pack.tokenBudget):'No pack built')+'</dd><small>'+esc(pack?arr(state.context.entries).length+' selected memories':'Assemble a scoped pack in Context')+'</small></div></dl>';
}
function rail(){
  const graph=arr(state.graph?.nodes);
  const projects=arr(state.overview?.projects).filter(project=>!state.project||project.id===state.project);
  const memories=graph.filter(node=>node.kind==='memory').slice(0,6);
  const projectsMarkup=projects.length?list(projects.slice(0,7).map(project=>'<li><button type="button" class="rail-entry" data-project="'+esc(project.id)+'" aria-pressed="'+(state.project===project.id)+'"><strong>'+esc(project.name)+'</strong><small>'+fmt(project.memories)+' memories</small></button></li>').join('')):empty('No projects with memories','Open a project workspace to add project-local knowledge.',view('setup','See setup'));
  return '<aside class="panel rail" aria-label="Projects and recent records"><div class="rail-title row"><h2>Projects</h2>'+chip(projects.length)+'</div>'+projectsMarkup+'<div class="rail-title row"><h2>Recent records</h2>'+chip(memories.length)+'</div>'+(memories.length?list(memories.map(node=>'<li><button type="button" class="rail-entry" data-node="'+esc(node.id)+'"><strong>'+esc(node.label)+'</strong><small>'+esc(node.category)+' · '+esc(hostName(node.agent))+'</small></button></li>').join('')):empty('No memory records','Add project knowledge or connect a host.',view('knowledge','Open knowledge')) )+'</aside>';
}
function graphMarkup(){
  const nodes=arr(state.graph?.nodes),edges=arr(state.graph?.edges);
  const traceMode=state.graphMode==='trace';
  const listNodes=list(nodes.map(node=>'<li><button class="entry" type="button" data-node="'+esc(node.id)+'" aria-pressed="'+(state.focus&&state.picked===node.id)+'"><strong>'+esc(node.kind==='agent'?hostName(node.label):node.label)+'</strong><small class="muted">'+esc(node.kind+(node.category?' · '+node.category:''))+'</small></button></li>').join(''),'id="node-list" aria-label="Stored graph nodes" '+(state.listing&&!traceMode?'':'hidden'),'node-list');
  return '<section class="panel graph-panel"><div class="panel-head"><div><h2>'+(traceMode?'Recorded trace':'Memory topology')+'</h2><span class="small mono muted">'+fmt(nodes.length)+' records / '+fmt(edges.length)+' relationships</span></div><div class="actions">'+action('clear-focus','Clear focus','quiet','id="clear-focus" '+(state.focus?'':'hidden'))+action('graph','Graph','','aria-pressed="'+!traceMode+'"')+action('trace','Trace','','aria-pressed="'+traceMode+'"')+action('node-list','Node list','','aria-expanded="'+state.listing+'" aria-controls="node-list" '+(traceMode||!nodes.length?'hidden':''))+'</div></div>'+
    '<div class="graph-stage" id="brain-stage"><canvas id="brain-canvas" aria-hidden="true" '+(traceMode?'hidden':'')+'></canvas><div class="graph-meta" aria-hidden="true"><span>PROJECT MEMORY</span><span>HOST EVIDENCE</span></div>'+
    (!nodes.length&&!traceMode?'<div class="graph-empty"><strong>'+esc(state.errors.graph?'Memory graph unavailable':state.graph?'No stored graph records':'Loading memory graph')+'</strong><p class="small muted">'+esc(state.errors.graph??(state.graph?'Save knowledge or use a connected host to create your first record.':'Reading the selected workspace.'))+'</p><div class="actions">'+(state.errors.graph?action('refresh','Retry'):view('knowledge','Open knowledge')+view('setup','Connect a host'))+'</div></div>':'')+
    listNodes+'<div id="trace-list" class="trace-list" '+(traceMode?'':'hidden')+'>'+(traceMode?timelineMarkup(true):'')+'</div><div id="node-caption" class="focus-label" hidden></div></div>'+
    '<div class="graph-foot"><div class="legend"><span class="cyan"><i></i> Project relation</span><span class="pink"><i></i> Recorded by</span><span class="amber"><i></i> Typed link / reported event</span></div><span class="mono" id="graph-event"></span><span class="mono">Illustrative lattice</span></div></section>';
}
function inspectorBody(){
  const item=arr(state.graph?.nodes).find(node=>node.id===state.picked);
  const memory=state.memory?.memory;
  const event=displayEvent();
  const tabs=[['record','Record'],['sources','Sources'],['relations','Links'],['event','Event']].map(([id,label])=>btn(label,'data-inspect="'+id+'" aria-pressed="'+(state.inspector===id)+'"')).join('');
  let details;
  if(state.inspector==='event'){
    details=event?'<div class="panel-body stack"><div class="row"><h3>'+esc(eventLabel(event))+'</h3>'+chip(evidence(event),eventTone(event))+'</div><dl class="facts">'+fact('Host',hostName(event.agent))+fact('Time',isoTime(event.timestamp))+fact('Transport',event.transport)+fact('Session',event.sessionId)+fact('Outcome',event.outcome)+fact('Duration',Number.isFinite(event.durationMs)?event.durationMs+' ms':undefined)+'</dl>'+action('copy-event','Copy event receipt')+'</div>':empty('No activity selected','Select a recorded journal event to inspect its source and outcome.');
  }else if(!item){
    details=empty('Select a graph record','Choose a node, a recent record, or a journal event to inspect its evidence.',state.events.length?action('inspect-latest','Inspect latest event'):'');
  }else if(state.inspector==='sources'){
    const sources=arr(memory?.sources??item.sources);
    details='<div class="panel-body stack"><h3>'+esc(item.label)+'</h3>'+(sources.length?list(sources.map(source=>'<li class="item mono small">'+esc(source)+'</li>').join('')):empty('No source attached','This record has no persisted source reference.'))+'</div>';
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
function renderInspector(){const target=$('inspector');if(target)target.innerHTML=inspectorBody();syncGraphControls();}
function overviewPage(){
  const event=displayEvent();
  const pack=state.context?.budget;
  const compare=state.comparison;
  const contextBody=pack?'<div class="panel-body stack"><div class="row"><span class="muted">Estimated pack tokens</span><strong class="mono">'+fmt(pack.estimatedTokens)+' / '+fmt(pack.tokenBudget)+'</strong></div><div class="meter"><i style="width:'+Math.min(100,Math.round(100*pack.estimatedTokens/Math.max(1,pack.tokenBudget)))+'%"></i></div>'+(compare?'<p class="small muted">Legacy '+fmt(compare.legacy.budget.estimatedTokens)+' · Adaptive '+fmt(compare.adaptive.budget.estimatedTokens)+' estimated tokens</p>':'')+view('context','Open context pack')+'</div>':empty('No context pack for this session','Assemble a pack to inspect estimated tokens and selection reasons.',view('context','Build context pack'));
  return heading('Brain control room','Explore stored memories, inspect tool exchanges, and connect your project.',action('pause',state.motionPaused?'Resume motion':'Pause motion','','id="pause-motion" '+(reduced.matches?'disabled':''))+view('setup','Connection setup'))+
    telemetryStrip()+'<div class="control-grid">'+rail()+graphMarkup()+'<section class="panel inspect" id="inspector">'+inspectorBody()+'</section></div><div class="lower">'+panel('Context efficiency',contextBody,chip('Estimates','pink'))+
    panel('Activity journal','<div class="replay"><label for="replay" class="small muted">Seek record</label><input id="replay" type="range" min="0" max="'+Math.max(0,state.events.length-1)+'" value="'+Math.max(0,state.events.indexOf(event))+'" '+(state.events.length?'':'disabled')+'><output class="mono small" id="event-time">'+esc(event?time(event.timestamp):'—')+'</output>'+action('live','Latest','','id="return-live" '+(state.replayId?'':'hidden'))+'</div><div class="timeline" id="timeline">'+timelineMarkup()+'</div>', '<span id="journal-state">'+chip(state.replayId?'Replay':state.live?'Recorded activity':'Activity unavailable',state.replayId?'amber':'cyan')+'</span>')+'</div>';
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
  $('event-time').textContent=event?time(event.timestamp):'—';
  $('return-live').hidden=!state.replayId;
  $('journal-state').innerHTML=chip(state.replayId?'Replay':state.live?'Recorded activity':'Activity unavailable',state.replayId?'amber':'cyan');
  const strip=$('main').querySelector('.strip');if(strip)strip.outerHTML=telemetryStrip();
  if(state.inspector==='event'&&!$('inspector').matches(':focus-within'))renderInspector();
  const pause=$('pause-motion');pause.textContent=state.motionPaused?'Resume motion':'Pause motion';pause.disabled=reduced.matches;
  drawGraph();
}
function contextPage(){
  const input=state.contextInput??{};
  const enabled=state.features?.features?.contextAssembly!==false;
  const form='<div class="panel-body"><form class="form" data-form="context"><label>Task or keywords<textarea name="query" rows="3" maxlength="4096" placeholder="Describe the work this context pack supports">'+esc(input.query)+'</textarea></label><div class="form-grid"><label>Token budget<input name="tokenBudget" type="number" min="0" max="12000" value="'+esc(input.tokenBudget??2000)+'" required></label><label>Retrieval profile<select name="profile"><option value="adaptive">Adaptive</option><option value="legacy" '+(input.profile==='legacy'?'selected':'')+'>Legacy</option></select></label></div><label class="check"><input name="expandRelated" type="checkbox" '+(input.expandRelated?'checked':'')+'> Expand related memories</label><div class="actions">'+(state.project&&enabled?submit('Build pack')+'<button class="btn" type="submit" name="compare" value="yes">Compare profiles</button>':chip(state.project?'Context packs disabled':'Select a project','amber'))+'</div></form></div>';
  const pack=state.context;
  const output=pack?'<div class="panel-body stack"><div class="row"><strong>'+fmt(arr(pack.entries).length)+' selected memories</strong>'+chip(fmt(pack.budget.estimatedTokens)+' estimated tokens','pink')+'</div>'+arr(pack.warnings).map(warning=>'<p class="small amber">'+esc(warning)+'</p>').join('')+
    (state.comparison?'<dl class="facts">'+fact('Legacy estimate',fmt(state.comparison.legacy.budget.estimatedTokens)+' tokens')+fact('Adaptive estimate',fmt(state.comparison.adaptive.budget.estimatedTokens)+' tokens')+'</dl>':'')+
    (arr(pack.entries).length?list(pack.entries.map(entry=>'<li class="item"><strong>'+esc(entry.excerpt)+'</strong><small class="muted">'+esc(arr(entry.reasons).join(' · '))+'</small><small class="mono cyan">'+esc(arr(entry.sources).join(' · '))+'</small></li>').join('')):empty('No memories fit this pack','Check the project, keywords and budget.'))+'<div class="actions">'+action('copy-pack','Copy pack','primary')+'</div><details><summary>Rendered pack</summary><pre>'+esc(pack.markdown)+'</pre></details></div>':empty('Build a scoped context pack','The result shows the actual selected records, source references, and estimated token budget.');
  return heading('Context packs','Assemble and copy project memory for a task.',view('usage','Usage evidence'))+'<div class="two">'+panel('Pack request',form,chip(scopeName()))+panel('Pack result',output)+'</div>';
}
function modelsPage(){
  const hosts=arr(state.integrations?.agents);
  const body=hosts.length?'<div class="table-wrap"><table><thead><tr><th>Host</th><th>Project files</th><th>Observed activity</th><th>Model</th><th>Usage</th></tr></thead><tbody>'+hosts.map(host=>{
    const events=state.events.filter(event=>event.agent===host.id),latest=events.at(-1);
    return '<tr><td><strong>'+esc(host.label)+'</strong></td><td>'+esc(host.installation)+'</td><td>'+esc(latest?'Recorded '+eventLabel(latest)+' · '+isoTime(latest.timestamp):'No activity observed')+'</td><td>Unavailable</td><td>Unavailable</td></tr>';
  }).join('')+'</tbody></table></div>':error('integrations','host checks')||empty('Reading integration evidence','Host status appears when project file checks finish.');
  return heading('Connections and models','Inspect project file presence and observed exchanges for each host.',view('setup','Configure hosts'))+panel('Host evidence',body);
}
function usagePage(){
  const measured=state.events.filter(event=>event.source==='measured'&&event.kind==='tool-end');
  const reported=state.events.filter(event=>event.source==='reported');
  const duration=measured.map(event=>event.durationMs).filter(Number.isFinite).sort((a,b)=>a-b);
  const total=duration.length?duration.reduce((sum,item)=>sum+item,0):null;
  return heading('Usage and timing','Inspect recorded tool activity separately from model usage and context estimates.')+telemetryStrip()+'<div class="two">'+panel('Tool activity','<div class="panel-body stack"><dl class="facts">'+fact('Measured tool returns',state.live?fmt(measured.length):undefined)+fact('Reported activity records',state.live?fmt(reported.length):undefined)+fact('Measured tool duration',total!==null?fmt(total)+' ms':undefined)+fact('Duration coverage',state.live?duration.length+' of '+measured.length+' measured tool returns':undefined)+'</dl><p class="small muted">Counts describe the retained records loaded for this workspace.</p></div>')+panel('Model usage',empty('Model usage unavailable','This workspace does not receive input, output, cached-token or cost receipts from model providers.',view('context','Inspect context estimates')) )+'</div>';
}
function setupPage(){
  const features=state.features;
  const flags=features?list(arr(features.definitions).map(item=>'<li class="item"><div class="row"><strong>'+esc(item.label)+'</strong>'+btn(features.features[item.id]?'On':'Off','data-feature="'+esc(item.id)+'" role="switch" aria-checked="'+!!features.features[item.id]+'" aria-label="'+esc(item.label)+'" '+(state.pending?'disabled':''))+'</div><p class="small muted">'+esc(item.description)+'</p></li>').join('')):error('features','feature settings')||empty('Loading feature settings','The server supplies the current switches and their descriptions.');
  const hosts=arr(state.integrations?.agents);
  const recipes=hosts.length?list(hosts.map(host=>'<li class="item"><div class="row"><h3>'+esc(host.label)+'</h3>'+chip(host.installation)+'</div><p class="small muted">'+esc(host.detail)+'</p><details><summary>Connection recipe</summary><div class="stack"><pre>'+esc(host.config?.content)+'</pre>'+arr(host.config?.notes).map(note=>'<p class="small muted">'+esc(note)+'</p>').join('')+'<div class="actions">'+action('copy-host','Copy configuration','','data-host="'+esc(host.id)+'"')+action('copy-command','Copy skill command','','data-host="'+esc(host.id)+'"')+'</div></div></details></li>').join('')):error('integrations','host recipes')||empty('Loading host recipes','Configuration recipes are generated locally.');
  const checks=arr(state.integrations?.checks);
  return heading('Workspace setup','Configure host access and manage the workspace’s real feature switches.',action('refresh','Refresh checks'))+'<div class="two">'+panel('Features',flags,features?chip('Revision '+features.revision):'')+panel('Client configuration',recipes,chip('Local recipes','cyan'))+'</div>'+panel('Local checks',checks.length?list(checks.map(check=>'<li class="item"><div class="row"><strong>'+esc(check.label)+'</strong>'+chip(check.status,check.status==='pass'?'green':check.status==='error'?'red':'')+'</div><p class="small muted">'+esc(check.detail)+'</p></li>').join('')):empty('No checks loaded','Refresh to retry host and storage checks.'),checks.length?action('copy-diagnostics','Copy diagnostics'):'');
}
const views={overview:overviewPage,context:contextPage,models:modelsPage,usage:usagePage,setup:setupPage,knowledge:knowledgePage,room:roomPage,learning:learningPage};
` + BRAIN_HUB_PROJECT_VIEWS + BRAIN_HUB_ACTIONS;
