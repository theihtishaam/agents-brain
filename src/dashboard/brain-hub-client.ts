export const BRAIN_HUB_CLIENT = String.raw`
const $ = id => document.getElementById(id);
const arr = value => Array.isArray(value) ? value : [];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const fmt = value => Number.isFinite(value) ? value.toLocaleString() : 'Unavailable';
const clock = new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',second:'2-digit'});
const time = value => value && Number.isFinite(new Date(value).getTime()) ? clock.format(new Date(value)) : '—';
const isoTime = value => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : 'Unavailable';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const local = document.documentElement.dataset.projectLocal === 'true';
const projectFeatureLimits={crossProjectContext:'Project memory stays scoped to this project.',automaticBriefing:'Automatic briefing requires a legacy analysis session.'};
const featureLimit = id => local ? projectFeatureLimits[id] : undefined;
const nav = {overview:'Brain overview',knowledge:'Knowledge',room:'Collaboration',context:'Context',models:'Models',usage:'Usage',learning:'Learning',setup:'Setup'};
const labels = {codex:'Codex','claude-code':'Claude Code',opencode:'OpenCode','deepseek-harness':'DeepSeek Harness',user:'Operator'};
const hostName = value => labels[value] ?? value ?? 'Unknown host';
const state = {view:'overview',project:'',overview:null,server:null,connection:'connecting',errors:{},graph:null,features:null,integrations:null,
  profile:null,feedback:null,hub:null,documents:null,docPage:1,room:null,context:null,contextInput:null,comparison:null,skill:null,skillInput:null,
  picked:null,memory:null,focus:false,inspector:'record',graphMode:'graph',listing:false,events:[],cursor:undefined,journalId:undefined,
  live:false,recording:false,journalGap:false,replayId:null,motionPaused:false,motionStarted:0,pulseIds:[],pending:false,message:'',messageError:false,
  dataEpoch:0,viewEpoch:0,search:null,lessonFrom:null};
let timer, polling=false, pollAgain=false, failures=0, polls=0;
let controller;
const list = (content,attributes='',classes='') => '<ul class="list '+classes+'" '+attributes+'>'+content+'</ul>';
const chip = (text,tone='') => '<span class="chip '+tone+'">'+esc(text)+'</span>';
const btn = (text, attrs='', kind='') => '<button type="button" class="btn '+kind+'" '+attrs+'>'+esc(text)+'</button>';
const submit = (text, kind='primary') => '<button type="submit" class="btn '+kind+'" '+(state.pending?'disabled':'')+'>'+esc(text)+'</button>';
const panel = (title, content, meta='', cls='') => '<section class="panel '+cls+'"><div class="panel-head"><h2>'+esc(title)+'</h2>'+meta+'</div>'+content+'</section>';
const heading = (title, body, actions='') => '<div class="page-head"><div><h1 id="title" tabindex="-1">'+esc(title)+'</h1><p class="small muted">'+esc(body)+'</p></div><div class="actions">'+actions+'</div></div>';
const empty = (title, detail, action='') => '<div class="empty"><strong>'+esc(title)+'</strong><p class="small">'+esc(detail)+'</p>'+(action?'<div class="actions">'+action+'</div>':'')+'</div>';
const fact = (label,value) => '<div><dt>'+esc(label)+'</dt><dd>'+esc(value ?? 'Unavailable')+'</dd></div>';
const error = (key, fallback) => state.errors[key] ? empty('Could not load '+fallback,state.errors[key],btn('Retry','data-action="refresh"')) : '';
const action = (id,text,kind='',extra='') => btn(text,'data-action="'+id+'" '+extra,kind);
const view = (id,text=nav[id]) => btn(text,'data-view="'+id+'"','quiet');
const json = body => ({method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});
const retryKeys=new Map();
async function hubWrite(route,input){
  const id=route+'\n'+JSON.stringify(input);
  if(!retryKeys.has(id)){
    if(retryKeys.size>=40)retryKeys.delete(retryKeys.keys().next().value);
    retryKeys.set(id,crypto.randomUUID());
  }
  try{
    const result=await api(route,json({...input,key:retryKeys.get(id)}));
    retryKeys.delete(id);return result;
  }catch(failure){
    if(failure.status&&failure.status<500)retryKeys.delete(id);
    throw failure;
  }
}
function status(message='',isError=false){
  state.message=message;state.messageError=isError;
  const target=$('view-status');
  if(target){target.textContent=message;target.dataset.error=String(isError);}
}
function projectQuery(extra={}){
  return '?'+new URLSearchParams({...extra,...(state.project?{project:state.project}:{})});
}
async function api(route,options={}){
  const {timeoutMs=6500,...request}=options;
  const timeout=AbortSignal.timeout(timeoutMs);
  const signal=request.signal ? AbortSignal.any([request.signal,timeout]) : timeout;
  const pinned=local&&(state.server?.project?.id??state.overview?.projectKit?.projectId);
  const headers={Accept:'application/json',...request.headers,...(pinned&&request.method==='POST'?{'X-Shadow-Brain-Project':pinned}:{})};
  const response=await fetch('/api/workspace/'+route,{...request,signal,cache:'no-store',headers});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data){
    const failure=new Error(data?.error ?? 'Workspace request returned HTTP '+response.status+'.');
    failure.status=response.status;failure.code=data?.code;throw failure;
  }
  return data;
}
function validStatus(data){
  return data&&typeof data.version==='string'&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(data.version)&&
    typeof data.serverInstanceId==='string'&&data.serverInstanceId.length>0&&['project','shared','demo'].includes(data.mode)&&
    (data.mode!=='project'||typeof data.project?.id==='string'&&typeof data.project.name==='string')&&
    ['ready','error','initializing'].includes(data.storage?.status)&&data.capabilities?.memory===true;
}
function validOverview(data){return data&&typeof data.version==='string'&&Array.isArray(data.projects)&&data.totals&&data.projectKit;}
function scopeName(){return state.overview?.projectKit?.projectName ?? arr(state.overview?.projects).find(project=>project.id===state.project)?.name ?? (state.project||'All projects');}
function renderChrome(){
  const selector=$('project');
  const projects=arr(state.overview?.projects);
  const fixed=state.overview?.projectKit?.projectId;
  const options=(fixed?'':'<option value="">All projects</option>')+projects.map(project=>'<option value="'+esc(project.id)+'">'+esc(project.name)+'</option>').join('');
  if(selector.dataset.options!==options){selector.innerHTML=options||'<option value="">Loading…</option>';selector.dataset.options=options;}
  selector.disabled=!!fixed||!state.overview||state.pending;
  selector.value=state.project;
  const connection=$('connection');
  const connected=state.connection==='reachable';
  const isDemo=state.overview?.demo===true||state.server?.mode==='demo';
  connection.className='chip '+(connected?'green':state.connection==='connecting'?'':'amber');
  connection.innerHTML='<i class="dot" aria-hidden="true"></i> '+(connected?(isDemo?'Demo workspace · Example data':'Workspace reachable'):state.connection==='connecting'?'Connecting to workspace':'Workspace unavailable');
  const notice=$('notice');
  notice.textContent=state.connection==='offline'?'The local workspace did not respond. Keep this tab open while the launcher restarts the server, or refresh to retry. '+(state.overview?'Showing the last loaded snapshot.':''):
    state.errors.overview||state.server?.storage?.status==='error'?'The server responded, but the memory store is unavailable. '+(state.errors.overview||state.server.storage.error||''):
    state.journalGap?'Some activity expired before this page could read it. The timeline shows retained records.':'';
  $('scope-note').textContent=state.overview?(fixed?'Project-local workspace · ':'Global workspace · ')+scopeName()+(state.overview.version?' · v'+state.overview.version:''):'';
  const buttons=Object.entries(nav).map(([id,label])=>'<button type="button" data-view="'+id+'" '+(id===state.view?'aria-current="page"':'')+'>'+label+'</button>').join('');
  if($('nav').dataset.buttons!==buttons){$('nav').innerHTML=buttons;$('nav').dataset.buttons=buttons;}
}
function resetScope(){
  state.dataEpoch++;state.viewEpoch++;state.graph=null;state.picked=null;state.memory=null;state.focus=false;state.context=null;
  state.comparison=null;state.contextInput=null;state.hub=null;state.documents=null;state.room=null;state.profile=null;state.feedback=null;
  state.skill=null;state.skillInput=null;state.search=null;state.events=[];state.cursor=undefined;state.journalId=undefined;state.lessonFrom=null;
  state.replayId=null;state.journalGap=false;state.pulseIds=[];state.motionStarted=0;
}
function updateOverview(value){
  const fixed=value.projectKit?.projectId;
  const next=fixed ?? (arr(value.projects).some(project=>project.id===state.project)?state.project:'');
  if(next!==state.project){state.project=next;resetScope();}
  state.overview=value;
}
function installTelemetry(page){
  if(!page.liveEnabled){
    state.events=[];state.cursor=undefined;state.journalId=undefined;state.live=false;state.recording=page.recordingEnabled;state.replayId=null;state.pulseIds=[];
    return;
  }
  state.live=true;state.recording=page.recordingEnabled;
  if(page.gap||page.reset||(state.journalId&&state.journalId!==page.journalId)){
    state.events=[];state.replayId=null;state.journalGap=!!page.gap;state.pulseIds=[];
  }
  const hasHistory=state.cursor!==undefined;
  const unique=new Map(state.events.map(event=>[event.id,event]));
  const added=arr(page.events).filter(event=>!unique.has(event.id));
  for(const event of added)unique.set(event.id,event);
  state.events=[...unique.values()].sort((a,b)=>a.sequence-b.sequence).slice(-200);
  state.cursor=page.cursor;
  state.journalId=page.journalId;
  if(state.replayId&&!unique.has(state.replayId))state.replayId=null;
  if(hasHistory&&!page.gap&&!page.reset&&!page.hasMore&&state.view==='overview'&&state.graphMode==='graph'&&!state.focus&&!state.replayId&&!state.motionPaused&&!reduced.matches){
    const now=Date.now();
    const fresh=added.filter(event=>{
      const age=now-Date.parse(event.timestamp);
      return age>=0&&age<=6500;
    });
    if(fresh.length){state.pulseIds=fresh.slice(-4).map(event=>event.id);state.motionStarted=performance.now();}
  }
}
async function refresh(manual=false){
  if(document.hidden&&!manual)return;
  clearTimeout(timer);
  if(polling){pollAgain ||= manual;return;}
  polling=true;
  controller=new AbortController();
  const signal=controller.signal;
  const options={signal};
  try{
    const [health,summary]=await Promise.allSettled([api('status',options),api('overview',options)]);
    if(signal.aborted)return;
    const old=state.server?.serverInstanceId;
    const healthOk=health.status==='fulfilled'&&validStatus(health.value);
    const summaryOk=summary.status==='fulfilled'&&validOverview(summary.value);
    if(healthOk){
      const next=health.value;
      if(old&&next.serverInstanceId&&old!==next.serverInstanceId){resetScope();state.features=null;state.integrations=null;}
      state.server=next;
    }
    const reachable=healthOk||summaryOk;
    state.connection=reachable?'reachable':'offline';
    if(summaryOk){updateOverview(summary.value);delete state.errors.overview;}
    else if(reachable)state.errors.overview=summary.reason?.message??'The workspace returned an invalid overview.';
    renderChrome();
    if(!reachable){failures++;state.pulseIds=[];drawGraph();if(!$('title'))render();return;}
    failures=0;
    polls++;
    const epoch=state.dataEpoch;
    const params=new URLSearchParams(projectQuery({limit:'200'}).slice(1));
    if(state.cursor!==undefined)params.set('cursor',state.cursor);
    if(state.journalId)params.set('journalId',state.journalId);
    const jobs=[['telemetry',api('telemetry?'+params,options)]];
    if(!state.graph||manual||(state.view==='overview'&&(polls%3===0||state.graph.totalMemories!==state.overview?.quality?.total)))jobs.push(['graph',api('graph'+projectQuery({limit:'140',...(state.picked?.startsWith('memory:')?{memory:state.picked.slice(7)}:{})}),options)]);
    if(!state.features||manual||state.view==='setup')jobs.push(['features',api('features',options)]);
    if(local&&state.server?.capabilities?.hub!==false&&!state.pending&&(!state.hub||manual||['room','knowledge','learning'].includes(state.view)))jobs.push(['hub',api('hub',options)]);
    if(local&&!state.pending&&state.view==='room'&&state.room)jobs.push(['room',api('hub/rooms/'+encodeURIComponent(state.room.room.id),options)]);
    const results=await Promise.allSettled(jobs.map(([,job])=>job));
    if(signal.aborted||epoch!==state.dataEpoch)return;
    let needsRender=false;
    results.forEach((result,index)=>{
      const name=jobs[index][0];
      if(result.status==='rejected'){state.errors[name]=result.reason.message;return;}
      delete state.errors[name];
      if(name==='telemetry'){installTelemetry(result.value);if(result.value.hasMore)pollAgain=true;}
      else if(name==='graph'&&JSON.stringify(state.graph)!==JSON.stringify(result.value)){state.graph=result.value;needsRender ||= state.view==='overview';}
      else if(name==='features'&&(!state.features||result.value.revision>=state.features.revision)){
        needsRender ||= state.view==='setup'&&state.features?.revision!==result.value.revision;
        state.features=result.value;
      }else if(name==='hub'&&(!state.hub||result.value.revision>=state.hub.revision)){
        needsRender ||= ['room','knowledge','learning'].includes(state.view)&&state.hub?.revision!==result.value.revision;
        state.hub=result.value;
      }else if(name==='room'&&state.room?.room?.id===result.value.room.id&&result.value.revision>=state.room.revision){
        needsRender ||= state.view==='room'&&state.room.revision!==result.value.revision;
        state.room=result.value;
      }
    });
    renderChrome();
    if(state.view==='overview'){
      if(manual||!$('brain-stage')||needsRender)render();
      else updateOverviewLive();
    }else if(manual||!$('title')||needsRender)render(true);
    if(manual)await loadView();
  } finally {
    polling=false;controller=undefined;
    if(!document.hidden){
      const delay=pollAgain?20:failures?Math.min(15000,1800*2**Math.min(3,failures-1)):2600;
      pollAgain=false;timer=setTimeout(()=>void refresh(),delay);
    }
  }
}
async function loadView(){
  const epoch=++state.viewEpoch;
  const current=state.view;
  const jobs=[];
  if(current==='setup')jobs.push(['integrations','integrations']);
  if(current==='knowledge'||current==='room'||current==='learning'){
    if(local&&!state.hub)jobs.push(['hub','hub']);
    if(local&&current==='knowledge'&&!state.profile)jobs.push(['profile','project-profile']);
    if(local&&current==='learning'&&!state.feedback)jobs.push(['feedback','project-feedback']);
  }
  if(current==='models')jobs.push(['integrations','integrations']);
  const results=await Promise.allSettled(jobs.map(([,url])=>api(url)));
  if(epoch!==state.viewEpoch||current!==state.view)return;
  results.forEach((result,index)=>{
    const name=jobs[index][0];
    if(result.status==='fulfilled'){state[name]=result.value;delete state.errors[name];}
    else state.errors[name]=result.reason.message;
  });
  if(jobs.length)render(true);
}
function openView(next){
  if(!Object.hasOwn(nav,next))return;
  state.view=next;state.message='';state.messageError=false;state.pulseIds=[];
  render();window.scrollTo(0,0);$('title')?.focus({preventScroll:true});void loadView();
}
function render(restore=false){
  const formValues=restore?[...$('main').querySelectorAll('form[data-form]')].map(form=>{
    const fields=[...form.elements].filter(node=>node.name&&node.type!=='submit'&&node.type!=='button');
    return {kind:form.dataset.form,id:form.dataset.id,fields:fields.map(node=>({name:node.name,value:node.value,checked:node.checked,
      file:node.type==='file'?node:null,active:node===document.activeElement,start:node.selectionStart,end:node.selectionEnd}))};
  }):[];
  unmountGraph();
  renderChrome();
  const viewBody=views[state.view]();
  $('main').innerHTML=viewBody+'<p class="status small" id="view-status" role="status"></p>';
  status(state.message,state.messageError);
  if(state.view==='overview')mountGraph();
  for(const form of $('main').querySelectorAll('form[data-form]')){
    const saved=formValues.find(item=>item.kind===form.dataset.form&&item.id===form.dataset.id);
    if(!saved)continue;
    for(const field of saved.fields){
      let node=form.elements.namedItem(field.name);
      if(!node)continue;
      if(field.file?.files?.length){node.replaceWith(field.file);node=field.file;}
      else if(node.type!=='file'&&(node.tagName!=='SELECT'||[...node.options].some(option=>option.value===field.value)))node.value=field.value;
      if(node.type==='checkbox')node.checked=field.checked;
      if(field.active){node.closest('details')?.setAttribute('open','');node.focus({preventScroll:true});if(field.start!==null)node.setSelectionRange?.(field.start,field.end);}
    }
  }
}
async function chooseMemory(id){
  const item=arr(state.graph?.nodes).find(node=>node.id===id);
  if(!item)return;
  state.picked=id;state.memory=null;state.focus=true;state.inspector='record';state.pulseIds=[];
  renderInspector();drawGraph();
  if(item.kind!=='memory')return;
  const epoch=state.dataEpoch;
  try{
    const detail=await api('memory?'+new URLSearchParams({id:item.memoryId,project:item.project}));
    if(epoch!==state.dataEpoch||state.picked!==id)return;
    state.memory=detail;renderInspector();
  }catch(failure){if(epoch===state.dataEpoch&&state.picked===id)status(failure.message,true);}
}
async function loadDocuments(id){state.documents=await api('hub/documents/'+encodeURIComponent(id));state.docPage=arr(state.documents.pages)[0]?.page??1;}
async function loadRoom(id){state.room=await api('hub/rooms/'+encodeURIComponent(id));}
async function refreshHub(){state.hub=await api('hub');delete state.errors.hub;}
async function refreshGraph(){state.graph=await api('graph'+projectQuery({limit:'140'}));delete state.errors.graph;}
function field(form,name){return String(form.get(name)??'').trim();}
async function clipboard(text){
  if(!text)throw new Error('There is no text to copy.');
  await navigator.clipboard.writeText(text);
  status('Copied to clipboard.');
}
async function mutation(operation,source,success='Saved.'){
  if(state.pending)return;
  state.pending=true;
  const submissionView=state.view;
  if(source)source.disabled=true;
  renderChrome();
  status('Working…');
  try{
    const message=await operation();
    state.pending=false;status(typeof message==='string'?message:success);render(state.view!==submissionView);
    if(source?.dataset.feature)[...$('main').querySelectorAll('[data-feature]')].find(node=>node.dataset.feature===source.dataset.feature)?.focus({preventScroll:true});
  }
  catch(failure){
    if(failure.status===409){
      if(source?.dataset.feature){try{state.features=await api('features');render(true);}catch{}}
      else if(source?.dataset.roomAction&&state.room){try{await loadRoom(state.room.room.id);render(true);}catch{}}
    }
    status(failure.message||'The workspace request failed.',true);
  }finally{
    state.pending=false;
    if(source)source.disabled=false;
    $('main').querySelectorAll('button[type=submit]').forEach(node=>node.disabled=false);
    renderChrome();
  }
}
async function afterSave(...refreshers){
  const results=await Promise.allSettled(refreshers.map(refresh=>refresh()));
  return results.some(result=>result.status==='rejected')?'Saved. Refresh the workspace to reload related records.':undefined;
}
function setReplay(index){
  const event=state.events[index];
  if(!event)return;
  state.replayId=event.id;state.pulseIds=[];state.inspector='event';state.focus=false;
  updateOverviewLive();renderInspector();drawGraph();
}
function start(){
  render();
  $('reload').addEventListener('click',()=>void refresh(true));
  $('project').addEventListener('change',event=>{
    state.project=event.target.value;resetScope();render();void refresh(true);
  });
  $('main').addEventListener('input',event=>{if(event.target.id==='replay')setReplay(Number(event.target.value));});
  document.addEventListener('visibilitychange',()=>{
    clearTimeout(timer);state.pulseIds=[];drawGraph();
    if(document.hidden)controller?.abort();else void refresh(true);
  });
  reduced.addEventListener('change',()=>{state.pulseIds=[];updateOverviewLive();});
  window.addEventListener('online',()=>void refresh(true));
  document.addEventListener('click',handleClick);
  document.addEventListener('submit',handleSubmit);
  void refresh(true);
}
`;
