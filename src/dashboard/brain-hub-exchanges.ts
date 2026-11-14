export const BRAIN_HUB_EXCHANGES = String.raw`
function exchangeKey(event){
  if(event?.source!=='measured'||event.transport!=='mcp'||!['tool-start','tool-end'].includes(event.kind)||
    !event.projectId||!event.sessionId||!event.agent||!event.tool||!event.correlationId)return null;
  return JSON.stringify([event.projectId,event.sessionId,event.agent,event.tool,event.correlationId]);
}
function exchangeClientKey(event){return JSON.stringify([event.projectId,event.agent,event.sessionId]);}
let exchangeCache={events:null,pairs:new Map(),clients:[]};
function observedExchanges(){
  if(exchangeCache.events===state.events)return exchangeCache;
  const exchanges=new Map(),clients=new Map(),pairs=new Map();
  for(const event of state.events){
    const key=exchangeKey(event);
    if(!key)continue;
    const pair=exchanges.get(key)??{requests:[],results:[]};
    if(event.kind==='tool-start')pair.requests.push(event);
    else pair.results.push(event);
    exchanges.set(key,pair);
    const client=exchangeClientKey(event);
    clients.delete(client);
    clients.set(client,event);
  }
  for(const pair of exchanges.values()){
    const request=pair.requests[0],result=pair.results[0];
    if(pair.requests.length!==1||pair.results.length!==1||request.sequence>=result.sequence)continue;
    pairs.set(request.id,result);
    pairs.set(result.id,request);
  }
  exchangeCache={events:state.events,pairs,clients:[...clients.values()].reverse()};
  return exchangeCache;
}
function exchangeLabel(event){
  return event.kind==='tool-start'?'Request observed':event.outcome==='success'?'Result ready':
    event.outcome==='cancelled'?'Tool cancelled':'Tool error';
}
function exchangeDirection(event){
  return event.kind==='tool-start'?'Client → Workspace':'Workspace → Client';
}
function exchangeProject(event){
  return arr(state.overview?.projects).find(project=>project.id===event.projectId)?.name??event.projectId;
}
function exchangeMarkup(){
  const {clients}=observedExchanges();
  const selected=state.replayId?displayEvent():null;
  const events=state.replayId?(exchangeKey(selected)?[selected]:[]):clients.slice(0,3);
  const mode=state.replayId?'Replay':state.errors.telemetry||state.connection==='offline'?'Last loaded':'Latest';
  const label=state.replayId?mode:mode+(clients.length?' · '+(clients.length>3?'3 of ':'')+clients.length+' client sessions':'');
  const rows=events.map(event=>{
    const incoming=event.kind==='tool-start';
    const isError=!incoming&&event.outcome!=='success';
    const host=hostName(event.agent),project=exchangeProject(event);
    const client='<span>'+esc(host)+' <small class="muted mono" aria-label="Session suffix '+esc(event.sessionId.slice(-6))+'">'+esc(event.sessionId.slice(-6))+'</small></span>';
    const workspace='<span class="exchange-workspace">Workspace</span>',arrow='<span class="exchange-arrow" aria-hidden="true"></span><span class="sr-only"> to </span>';
    const route='<span class="exchange-route" title="'+esc(exchangeDirection(event)+' · '+project)+'">'+(incoming?client+arrow+workspace:workspace+arrow+client)+'</span>';
    return '<li><button class="exchange-row" type="button" data-event="'+esc(event.id)+'" aria-pressed="'+(state.replayId===event.id)+'" title="'+esc(project+' · '+event.sessionId)+'">'+route+
      '<span class="exchange-summary"><strong>'+esc(event.tool)+'</strong><span class="'+(isError?'red':incoming?'blue':'cyan')+'">'+exchangeLabel(event)+'</span></span><time class="mono muted" datetime="'+esc(event.timestamp)+'">'+esc(time(event.timestamp))+'</time></button></li>';
  }).join('');
  const message=state.replayExpired?'The selected replay record is outside the loaded history.':selected?'This event does not have a measured MCP request or result direction.':state.errors.telemetry?'The activity journal is unavailable.':
    state.connection==='offline'?'The workspace is offline.':!state.live?'Live activity is off.':'Awaiting a measured MCP tool exchange.';
  return '<div class="exchange-head"><h3>MCP exchanges</h3><span class="small muted">'+esc(label)+'</span></div>'+
    (rows?list(rows,'aria-label="Observed MCP client sessions"','exchange-list'):'<p class="exchange-empty small muted">'+esc(message)+'</p>');
}
function updateExchanges(){
  const container=$('graph-exchanges');
  if(!container)return;
  const markup=exchangeMarkup();
  if(container.dataset.markup===markup)return;
  const active=container.querySelector('[data-event]:focus')?.dataset.event;
  container.innerHTML=markup;container.dataset.markup=markup;
  if(active)[...container.querySelectorAll('[data-event]')].find(row=>row.dataset.event===active)?.focus({preventScroll:true});
}
function pairedExchangeMarkup(event){
  if(!exchangeKey(event))return '';
  const other=observedExchanges().pairs.get(event.id);
  const isRequest=event.kind==='tool-start';
  return '<dl class="facts">'+fact('Boundary',exchangeDirection(event))+fact('Observation',exchangeLabel(event))+fact('Project',exchangeProject(event))+'</dl>'+
    (other?'<button class="btn quiet" type="button" data-event="'+esc(other.id)+'">'+(isRequest?'Inspect paired result':'Inspect paired request')+'</button>':
    '<p class="small muted">'+(isRequest?'A matching result is absent from loaded records.':'A matching request is absent from loaded records.')+'</p>')+
    '<p class="small muted">The journal records the tool boundary. Model consumption is unobserved.</p>';
}
`;
