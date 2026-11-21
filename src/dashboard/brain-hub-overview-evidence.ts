export const BRAIN_HUB_OVERVIEW_EVIDENCE = String.raw`
const overviewEvidence={projectId:null,tree:null,hosts:null,errors:{},request:null,refreshOnResume:false};
const overviewIndexHosts={
  codex:{label:'Codex',allowed:'codexIndexAllowed',items:'threads'},
  opencode:{label:'OpenCode',allowed:'opencodeIndexAllowed',items:'sessions'},
};
const overviewIndexes=new Map(Object.keys(overviewIndexHosts).map(key=>[key,{request:null,error:null,timer:0,lastCheck:0,snapshot:null}]));
function overviewProjectId(){
  return state.server?.project?.id??state.overview?.projectKit?.projectId??null;
}
function overviewProject(){
  const id=overviewProjectId();
  return id?arr(state.directory?.workspaces).find(row=>row.projectId===id):null;
}
function overviewNativeIndex(host='codex'){
  const project=overviewProject();
  if(!project)return null;
  if(host==='codex')return shownNativeIndex(project);
  if(project[overviewIndexHosts[host].allowed]!==true||state.connection!=='reachable'||state.errors.directory)return null;
  const localSnapshot=overviewIndexes.get(host).snapshot;
  const cached=typeof shownOpenCodeIndex==='function'?shownOpenCodeIndex(project.projectId):null;
  const snapshot=Date.parse(cached?.observedAt??'')>(Date.parse(localSnapshot?.observedAt??'')||0)?cached:localSnapshot;
  return snapshot?.projectId===project.projectId&&snapshot.policyRevision===project.policyRevision&&Date.parse(snapshot.expiresAt)>Date.now()?snapshot:null;
}
function overviewObserving(id,host='codex'){
  if(!id)return false;
  try {return localStorage.getItem('shadow-brain:overview-'+host+':'+id)==='on';}
  catch{return false;}
}
function setOverviewObserving(id,enabled,host='codex'){
  if(!id)return false;
  try {
    const key='shadow-brain:overview-'+host+':'+id;
    if(enabled)localStorage.setItem(key,'on');else localStorage.removeItem(key);
    return true;
  }catch{return false;}
}
function stopOverviewEvidence(){
  for(const index of overviewIndexes.values()){
    clearTimeout(index.timer);index.timer=0;
    index.request?.abort();index.request=null;
  }
  overviewEvidence.request?.abort();overviewEvidence.request=null;
  overviewEvidence.refreshOnResume=true;
}
function resetOverviewEvidence(){
  stopOverviewEvidence();
  Object.assign(overviewEvidence,{projectId:null,tree:null,hosts:null,errors:{},refreshOnResume:false});
  for(const index of overviewIndexes.values())Object.assign(index,{error:null,lastCheck:0,snapshot:null});
}
function overviewEvidenceActive(id){
  return !!id&&local&&state.view==='overview'&&!document.hidden&&state.connection==='reachable'&&overviewProjectId()===id;
}
async function refreshOverviewEvidence(force=false){
  const id=overviewProjectId();
  if(!overviewEvidenceActive(id))return;
  if(overviewEvidence.projectId!==id){resetOverviewEvidence();overviewEvidence.projectId=id;}
  force ||= overviewEvidence.refreshOnResume;
  if(overviewEvidence.request||!force&&(overviewEvidence.tree||overviewEvidence.errors.tree)&&(overviewEvidence.hosts||overviewEvidence.errors.hosts||state.connections?.projectId===id))return;
  overviewEvidence.refreshOnResume=false;
  const controller=new AbortController();overviewEvidence.request=controller;
  const options={signal:controller.signal,headers:{'X-Shadow-Brain-Project':id}};
  const jobs=[['tree',api('files?path=&offset=0',options)]];
  if(force||state.connections?.projectId!==id)jobs.push(['hosts',api('connections',options)]);
  if(force)jobs.push(['directory',api(directoryRoute(id,false),options)]);
  const results=await Promise.allSettled(jobs.map(([,job])=>job));
  if(overviewEvidence.request!==controller)return;
  overviewEvidence.request=null;
  if(!overviewEvidenceActive(id))return;
  results.forEach((result,index)=>{
    const field=jobs[index][0];
    if(result.status==='fulfilled'){
      if(field==='directory'){
        delete overviewEvidence.errors.directory;
        if(installDirectory(result.value)){updateWorkspaceNav();updateAgentDock();}
        return;
      }
      overviewEvidence[field]=result.value;delete overviewEvidence.errors[field];
      if(field==='hosts'&&result.value.projectId===id)state.connections=result.value;
    }
    else overviewEvidence.errors[field]=result.reason.message;
  });
  updateOverviewEvidence(false);
}
async function readOverviewIndex(host){
  const id=overviewProjectId(),project=overviewProject(),type=overviewIndexHosts[host],index=overviewIndexes.get(host);
  if(!overviewEvidenceActive(id)||project?.[type.allowed]!==true||index.request)return;
  const controller=new AbortController(),epoch=state.dataEpoch;
  index.request=controller;index.lastCheck=Date.now();index.error=null;
  updateOverviewEvidence(false);
  try{
    const result=await api('directory/'+host,{...json({projectId:id}),signal:controller.signal,timeoutMs:16000});
    const latest=overviewProject();
    if(!overviewEvidenceActive(id)||controller.signal.aborted||epoch!==state.dataEpoch||result.projectId!==id||
      latest?.[type.allowed]!==true||result.policyRevision!==latest.policyRevision)return;
    if(host==='codex')portfolio.nativeChecks.set(id,result);
    else index.snapshot=result;
  }catch(failure){
    if(!controller.signal.aborted&&epoch===state.dataEpoch&&overviewEvidenceActive(id))index.error=failure.message;
  }finally{
    if(index.request===controller){
      index.request=null;
      if(overviewEvidenceActive(id)){updateOverviewEvidence(false);updateAgentDock();}
    }
  }
}
function scheduleOverviewIndex(host){
  const index=overviewIndexes.get(host);
  clearTimeout(index.timer);index.timer=0;
  const project=overviewProject(),id=overviewProjectId();
  if(!overviewEvidenceActive(id)||project?.[overviewIndexHosts[host].allowed]!==true)return;
  const snapshot=overviewNativeIndex(host);
  const expires=Date.parse(snapshot?.expiresAt??'')+10;
  const next=overviewObserving(id,host)&&!index.request?
    Math.max(index.lastCheck+60000,Date.parse(snapshot?.observedAt??'')+60000||0):Infinity;
  const when=Number.isFinite(expires)?Math.min(expires,next):next;
  if(!Number.isFinite(when))return;
  index.timer=setTimeout(()=>{
    if(next<=expires||!Number.isFinite(expires))void readOverviewIndex(host);
    else {updateOverviewEvidence(false);updateAgentDock();}
  },Math.max(40,when-Date.now()));
}
function overviewNativeRows(host='codex'){
  return arr(overviewNativeIndex(host)?.[overviewIndexHosts[host].items]).filter(thread=>typeof thread.name==='string'&&thread.name.trim());
}
function overviewNativePanel(host,project,id,isOnline){
  const type=overviewIndexHosts[host],index=overviewIndexes.get(host),snapshot=overviewNativeIndex(host);
  const rows=overviewNativeRows(host),named=rows.slice(0,4);
  const allowed=project?.[type.allowed]===true,enabled=overviewObserving(id,host);
  if(!allowed&&!enabled)return '';
  const disabled=!isOnline?' disabled':' aria-disabled="'+!!index.request+'"';
  return (named.length?list(named.map(row=>'<li><strong>'+esc(row.name)+'</strong><small>'+esc(type.label)+
    ' index'+(row.status==='active'?' · App-server active':'')+'</small></li>').join(''),
    'aria-label="'+type.label+' indexed titles"','overview-plain-list'):
    snapshot&&!snapshot.issue?'<span class="small muted">No named '+type.label+' chats found in this project.</span>':'')+
    (index.error||snapshot?.issue?'<p class="small amber" role="status">'+esc(index.error??snapshot.issue)+'</p>':'')+
    (index.request?'<span class="small muted" role="status">Checking the local '+type.label+' index…</span>':'')+
    (snapshot?.observedAt?'<small class="muted">'+type.label+' index checked '+esc(isoTime(snapshot.observedAt))+'</small>':'')+
    '<div class="actions overview-index-buttons">'+
      (allowed?btn('Check '+type.label+' index','id="overview-index-'+host+'-check" data-overview-host="'+host+'" data-overview-index="check"'+disabled,'quiet'):'')+
      btn(enabled?'Stop observing':'Observe '+type.label+' titles','id="overview-index-'+host+'-observe" data-overview-host="'+host+'" data-overview-index="observe"'+
        ' role="switch" aria-checked="'+enabled+'" aria-label="Observe '+type.label+' title updates"'+(!enabled&&(!allowed||!isOnline)?' disabled':''),'quiet')+
      (rows.length>named.length||snapshot?.nextPageToken?btn('More '+type.label+' titles','data-open-workspace="'+esc(id)+'"','quiet'):'')+'</div>';
}
function overviewEvidenceBody(){
  const id=overviewProjectId(),project=overviewProject();
  const shared=arr(project?.sessions).filter(row=>typeof row.title==='string'&&row.title.trim());
  const visibleChatter=shared.slice(0,4);
  const isOnline=state.connection==='reachable';
  const pinnedName=project?.projectName??scopeName();
  const titleRows=rows=>list(rows.map(row=>'<li><strong>'+esc(row.title)+'</strong><small>'+esc(hostName(row.host))+
    ' · Shared report</small></li>').join(''),'aria-label="Shared chat reports"','overview-plain-list');
  const chats='<div class="overview-evidence-column"><div class="row"><h3>Chat titles</h3>'+view('sessions','Sessions')+'</div>'+
    (visibleChatter.length?titleRows(visibleChatter):'<span class="small muted">'+(Array.isArray(project?.sessions)?'No shared chat reports':'Shared chat reports unavailable')+'</span>')+
    Object.keys(overviewIndexHosts).map(host=>overviewNativePanel(host,project,id,isOnline)).join('')+'</div>';
  const tree=overviewEvidence.projectId===id?overviewEvidence.tree:null;
  const items=arr(tree?.items);
  const fileRows=items.slice(0,7).map((entry,index)=>{
    const folder=entry.kind==='directory',attrs='id="overview-file-'+index+'" data-overview-file="'+esc(entry.path)+'" data-overview-kind="'+(folder?'folder':'file')+'"';
    return '<li><span class="overview-file-type" aria-hidden="true">'+(folder?'›':'–')+'</span>'+
      (folder&&!entry.navigable?'<span class="mono">'+esc(entry.name)+'</span>':btn(entry.name,attrs,'quiet mono'))+'</li>';
  }).join('');
  const files='<div class="overview-evidence-column"><div class="row"><h3>Project files</h3>'+view('files','Files')+'</div>'+
    (overviewEvidence.errors.tree?'<span class="small amber">Root listing unavailable</span>':fileRows?
      list(fileRows,'aria-label="Entries at project root"','overview-root-list'):'<span class="small muted">'+(tree?'No eligible entries at project root':'Reading project root…')+'</span>')+'</div>';
  const snapshot=state.connections?.projectId===id?state.connections:overviewEvidence.hosts?.projectId===id?overviewEvidence.hosts:null;
  const detected=arr(snapshot?.hosts).filter(host=>host.installation==='detected');
  const ready=shared.filter(row=>row.hasCheckpoint).slice(0,3);
  const resume=ready.length?list(ready.map(row=>'<li>'+btn(row.title,'data-overview-resume="'+esc(row.id)+'"','quiet')+'</li>').join(''),'aria-label="Saved project handoffs"','overview-plain-list'):
    '<p class="small muted">A saved checkpoint will appear here when a conversation has work to hand over.</p>';
  const tools='<div class="overview-evidence-column"><div class="row"><h3>Continue work</h3>'+view('sessions','All sessions')+'</div>'+resume+
    '<div class="actions">'+view('knowledge','Save a note')+view('setup',detected.length?'Detected locally · '+fmt(detected.length):'Tool setup')+'</div></div>';
  return '<div class="overview-evidence-head"><div><h2>Project preview</h2><p class="small muted">'+esc(pinnedName)+
    (id&&!isOnline?' · Previously loaded':'')+'</p></div>'+btn('Refresh preview','id="overview-refresh-preview" data-overview-refresh="true"'+(!isOnline?' disabled':''),'quiet')+'</div>'+
    (overviewEvidence.errors.directory?'<p class="panel-body small amber" role="status">Could not refresh chat reports.</p>':'')+
    '<div class="overview-evidence-grid">'+chats+files+tools+'</div>';
}
function overviewEvidencePanel(){
  return local?'<section class="panel overview-evidence" id="overview-evidence" aria-label="Project preview">'+overviewEvidenceBody()+'</section>':'';
}
function updateOverviewEvidence(load=true){
  const box=$('overview-evidence');if(!box||state.view!=='overview')return;
  const markup=overviewEvidenceBody(),active=box.contains(document.activeElement)?document.activeElement:null;
  if(box.dataset.markup!==markup){
    const id=active?.id,file=active?.dataset.overviewFile;
    box.dataset.markup=markup;box.innerHTML=markup;
    if(id)$(id)?.focus({preventScroll:true});
    else if(file)[...box.querySelectorAll('[data-overview-file]')].find(item=>item.dataset.overviewFile===file)?.focus({preventScroll:true});
  }
  if(load)void refreshOverviewEvidence();
  for(const host of overviewIndexes.keys())scheduleOverviewIndex(host);
}
function handleOverviewEvidence(button){
  const data=button.dataset;
  if(data.overviewResume){
    const id=overviewProjectId(),epoch=state.dataEpoch,sessionId=data.overviewResume;
    void mutation(async()=>{
      if(!id||!arr(overviewProject()?.sessions).some(row=>row.id===sessionId))throw new Error('Refresh the project handoff list.');
      const detail=await api('sessions/'+encodeURIComponent(sessionId));
      const cpId=detail?.session?.latestCheckpointId;
      if(detail?.projectId!==id||detail.session?.id!==sessionId||!cpId)throw new Error('Refresh the saved conversation.');
      const {checkpoint}=await api('sessions/'+encodeURIComponent(sessionId)+'/checkpoints/'+encodeURIComponent(cpId));
      if(state.dataEpoch!==epoch||overviewProjectId()!==id||state.view!=='overview')return;
      if(checkpoint?.id!==cpId||checkpoint.sessionId!==sessionId)throw new Error('Refresh the saved checkpoint.');
      state.sessionBefore=null;state.session=detail;state.sessionCheckpoint=checkpoint;openView('sessions');
    },button,'Saved handoff opened.');return true;
  }
  if(data.overviewRefresh){void refreshOverviewEvidence(true);return true;}
  const host=data.overviewHost,index=overviewIndexes.get(host);
  if(index&&data.overviewIndex==='check'){void readOverviewIndex(host);return true;}
  if(index&&data.overviewIndex==='observe'){
    const id=overviewProjectId(),enabled=overviewObserving(id,host);
    if(!setOverviewObserving(id,!enabled,host)){index.error='This browser could not save the observation preference.';updateOverviewEvidence(false);return true;}
    if(enabled){index.request?.abort();index.request=null;index.lastCheck=0;}
    updateOverviewEvidence(false);
    if(!enabled)void readOverviewIndex(host);
    return true;
  }
  if(data.overviewFile){
    openView('files');
    void openProjectFiles(data.overviewKind==='folder'?data.overviewFile:'').then(()=>{
      if(state.view==='files'&&data.overviewKind==='file')selectProjectFile(data.overviewFile);
    });
    return true;
  }
  return false;
}
`;

export const BRAIN_HUB_OVERVIEW_EVIDENCE_CSS = String.raw`
.overview-evidence{margin-bottom:10px}
.overview-evidence-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--border)}
.overview-evidence-head p{margin-top:2px}
.overview-evidence-grid{display:grid;grid-template-columns:1.35fr .95fr 1fr}
.overview-evidence-column{padding:9px 12px;min-width:0;display:grid;gap:5px;align-content:start}
.overview-evidence-column+.overview-evidence-column{border-left:1px solid var(--border)}
.overview-evidence-column .btn{min-height:28px;padding-block:3px;font-size:.75rem}
.overview-plain-list,.overview-root-list{display:grid;gap:2px}
.overview-plain-list li,.overview-root-list li{display:flex;gap:6px;align-items:baseline;justify-content:flex-start;min-width:0;padding-block:3px}
.overview-plain-list strong{font-size:.78rem;overflow-wrap:anywhere}
.overview-plain-list small{color:var(--muted);font-size:.69rem;flex:none}
.overview-root-list li{padding:0;align-items:center}
.overview-root-list .btn{justify-content:flex-start;text-align:left;overflow-wrap:anywhere}
.overview-file-type{font-family:var(--mono);color:var(--muted);flex:none}
.overview-index-buttons{margin-top:3px}
.overview-index-buttons .btn[aria-disabled=true]{opacity:.58;cursor:wait}
@media(max-width:780px){
  .overview-evidence-grid{grid-template-columns:minmax(0,1fr)}
  .overview-evidence-column+.overview-evidence-column{border-left:0;border-top:1px solid var(--border)}
  .overview-evidence-column .btn{min-height:39px}
}
`;
