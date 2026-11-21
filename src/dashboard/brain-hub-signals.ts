export const BRAIN_HUB_SIGNALS = String.raw`
function signalData(events,paired,scope,through){
  const batches=[];
  let phase;
  for(const event of events){
    if(scope&&event.projectId!==scope||through!==undefined&&event.sequence>through)continue;
    if(event.kind==='phase'&&event.source==='reported'&&event.phase)phase=event;
    if(event.kind!=='tool-end'||event.transport!=='mcp'||event.source!=='measured')continue;
    const start=paired.get(event.id);
    if(!start||!Number.isSafeInteger(start.argumentBytes)||!Number.isSafeInteger(event.resultTextBytes))continue;
    batches.push({event,input:start.argumentBytes,output:event.resultTextBytes});
  }
  return {batches:batches.slice(-16),phase};
}
function signalBody(){
  const upper=state.replayId?(displayEvent()?.sequence??-1):undefined;
  const {batches,phase}=signalData(state.events,observedExchanges().pairs,state.project,upper);
  const peak=Math.max(1,...batches.flatMap(pair=>[pair.input,pair.output]));
  const last=batches.at(-1);
  const label=state.replayId?'Journal replay':state.connection==='offline'?'Last loaded':state.live?'Retained exchanges':'Activity off';
  const bars=batches.map(({event,input,output})=>{
    const caption=hostName(event.agent)+' · '+event.tool+' · '+fmt(input)+' argument bytes / '+fmt(output)+' result text bytes · '+time(event.timestamp);
    return '<button class="signal-bin" type="button" data-event="'+esc(event.id)+'" title="'+esc(caption)+'" aria-label="'+esc(caption)+'" style="--up:'+
      (100*output/peak).toFixed(2)+'%;--down:'+(100*input/peak).toFixed(2)+'%"><i></i><i></i></button>';
  }).join('');
  const plot=last?'<div class="signal-plot" role="group" aria-label="Payload bytes per completed exchange, oldest to newest">'+bars+'</div>'+
    '<div class="signal-axis"><span>Oldest</span><span>Newest</span></div>':
    '<p class="signal-empty small muted">A completed project tool call with measured sizes will appear here.</p>';
  const measure=(name,value,tone)=>'<div><dt><i class="signal-key '+tone+'"></i>'+name+'</dt><dd class="mono">'+
    (value===undefined?'—':fmt(value)+' B')+'</dd></div>';
  const path=!state.replayId&&state.features?.features?.projectFileActivity&&state.recording!==false&&state.live?
    [...liveStream.seen.values()].sort((a,b)=>b.sequence-a.sequence)[0]:undefined;
  const row=(type,value,detail)=>'<div class="signal-observation"><div><span>'+type+'</span><small class="muted">'+detail+'</small></div>'+value+'</div>';
  const measured=last?'<button type="button" class="signal-link" data-event="'+esc(last.event.id)+'">'+esc(last.event.tool)+'</button>':'<span>Awaiting exchange</span>';
  return '<div class="signal-data"><div class="signal-title"><h2>Payload traffic</h2><small class="muted">'+esc(label)+' · '+batches.length+' measured</small></div>'+
    '<div class="signal-readout"><dl>'+measure('Request arguments',last?.input,'inbound')+measure('Result text',last?.output,'outbound')+'</dl>'+plot+'</div></div>'+
    '<div class="signal-work"><div class="signal-title"><h2>Workspace activity</h2></div>'+
    row('Latest sized exchange',measured,last?esc(hostName(last.event.agent)+' · '+time(last.event.timestamp)):'Measured by Shadow Brain')+
    row('Reported work phase',phase?'<button type="button" class="signal-link" data-event="'+esc(phase.id)+'">'+esc(phase.phase)+'</button>':'<span>Awaiting report</span>',
      phase?esc(hostName(phase.agent)+' · '+time(phase.timestamp)):'Supplied by a host')+
    row('Observed file change',path?'<button type="button" class="signal-link" data-file-context="'+esc(path.path)+'">'+esc(path.path)+'</button>':
      '<span>'+(!state.replayId&&state.features?.features?.projectFileActivity?'Awaiting change':state.replayId?'Outside journal replay':'Watcher off')+'</span>',
      path?esc(time(path.timestamp)+' · actor unknown'):'Project filesystem')+'</div>';
}
function signalMonitor(){
  return local?'<section class="panel signal-monitor" id="signal-monitor" aria-label="Workspace signal monitor">'+signalBody()+'</section>':'';
}
function updateSignalMonitor(){
  const monitor=$('signal-monitor');
  if(!monitor)return;
  const markup=signalBody();
  if(monitor.dataset.markup===markup)return;
  const focused=monitor.contains(document.activeElement)?document.activeElement:null;
  monitor.dataset.markup=markup;monitor.innerHTML=markup;
  if(focused)[...monitor.querySelectorAll('button')].find(item=>item.className===focused.className&&
    item.dataset.event===focused.dataset.event&&item.dataset.fileContext===focused.dataset.fileContext)?.focus({preventScroll:true});
}
`;

export const BRAIN_HUB_SIGNALS_CSS = String.raw`
.signal-monitor{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);margin-bottom:10px}
.signal-data,.signal-work{padding:12px 14px;min-width:0}
.signal-work{border-left:1px solid var(--border)}
.signal-title,.signal-observation,.signal-axis{display:flex;justify-content:space-between;align-items:center;gap:10px}
.signal-readout{display:grid;grid-template-columns:minmax(116px,auto) minmax(0,1fr);gap:0 20px;align-items:stretch;margin-top:10px}
.signal-readout dl{grid-row:span 2;display:grid;align-content:center;gap:8px;margin:0}
.signal-readout dt,.signal-axis,.signal-title small,.signal-observation small{font-size:.7rem;color:var(--muted)}
.signal-readout dd{font-size:1rem;margin:2px 0 0}
.signal-key{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px}
.signal-key.inbound{background:var(--blue)}.signal-key.outbound{background:var(--cyan)}
.signal-plot{display:flex;align-items:stretch;gap:2px;height:72px;position:relative;background:repeating-linear-gradient(0deg,transparent 0 17px,var(--border) 17px 18px);border-bottom:1px solid var(--border)}
.signal-bin{flex:1;min-width:0;background:none;padding:0 1px;border:0;display:grid;grid-template-rows:1fr 1fr;cursor:pointer}
.signal-bin i{display:block;min-width:1px;width:100%}
.signal-bin i:first-child{align-self:end;height:var(--up);background:var(--cyan);border-radius:2px 2px 0 0}
.signal-bin i:last-child{align-self:start;height:var(--down);background:var(--blue);border-radius:0 0 2px 2px}
.signal-bin:hover,.signal-bin:focus-visible{outline:1px solid var(--strong);background:var(--surface)}
.signal-axis{grid-column:2;padding-top:3px}
.signal-empty{margin:auto 0}
.signal-observation{font-size:.78rem;padding:4px 0;border-bottom:1px solid var(--border)}
.signal-observation:last-child{border:0}
.signal-observation div{display:grid;flex:none}
.signal-link{padding:0;border:0;background:none;color:var(--cyan);font:inherit;text-align:right;text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere;cursor:pointer}
@media(max-width:780px){.signal-monitor{grid-template-columns:minmax(0,1fr)}.signal-work{border-left:0;border-top:1px solid var(--border)}}
`;
