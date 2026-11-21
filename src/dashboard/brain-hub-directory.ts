export const BRAIN_HUB_DIRECTORY = String.raw`
const portfolio={selected:null,epoch:0,timer:0,reading:false,nativeWatch:false,nativeChecks:new Map(),watchEpoch:0,nextIndexCheck:0,watchRequest:null};
const directoryLabels={'available':'Project reports available','awaiting-host':'Awaiting project data','unavailable':'Unavailable','private':'Sharing paused','not-inspected':'Summary on demand'};
function directoryHeader(){return {'X-Shadow-Brain-Project':state.server?.project?.id??state.project};}
function directoryRoute(selected,summary=state.view==='workspaces'){
  const params=new URLSearchParams();
  if(summary)params.set('summary','1');
  if(selected)params.set('project',selected);
  return 'directory'+(params.size?'?'+params:'');
}
const readDirectory=(selected)=>api(directoryRoute(selected),{headers:directoryHeader()});
function installDirectory(snapshot){
  if(snapshot?.currentProjectId!==(state.server?.project?.id??state.project)||snapshot.revision<(state.directory?.revision??0))return false;
  let changed=JSON.stringify(snapshot)!==JSON.stringify(state.directory)||!!state.errors.directory;
  state.directory=snapshot;delete state.errors.directory;
  for(const [id,index] of portfolio.nativeChecks){
    const row=arr(snapshot.workspaces).find(project=>project.projectId===id);
    if(row?.codexIndexAllowed!==true||index.policyRevision!==row.policyRevision||Date.parse(index.expiresAt)<=Date.now()){
      portfolio.nativeChecks.delete(id);
      changed=true;
    }
  }
  return changed;
}
function selectedDirectory(rows=arr(state.directory?.workspaces)){
  return rows.find(row=>row.projectId===portfolio.selected)??rows.find(row=>row.projectId===state.project)??rows[0];
}
function workspaceCounts(project){
  const hosts=arr(project.hosts),known=Array.isArray(project.hosts)&&state.connection==='reachable';
  return {live:known?hosts.reduce((n,h)=>n+(Number.isFinite(h.connections)?h.connections:0),0):null,
    active:known?hosts.filter(h=>h.connections>0):[]};
}
function workspaceNav(){
  const data=state.directory,rows=arr(data?.workspaces);
  return '<div class="portfolio-nav"><div><strong>Workspaces</strong><span class="muted small"> '+(data?fmt(data.total)+' registered':'Local project directory')+'</span></div>'+
    '<div class="portfolio-chips">'+rows.slice(0,6).map(r=>{const {live}=workspaceCounts(r);return '<button type="button" data-open-workspace="'+esc(r.projectId)+'">'+
    '<i class="'+(live?'current':'')+'" aria-hidden="true"></i>'+esc(r.projectName)+'</button>';}).join('')+'</div>'+view('workspaces','All workspaces')+'</div>';
}
function projectProgress(progress){
  if(!Number.isInteger(progress?.total)||progress.total<=0||!Number.isInteger(progress.completed)||
      progress.completed<0||progress.completed>progress.total)return '<span class="muted small">Unreported</span>';
  const raw=100*progress.completed/progress.total;
  const percent=raw>0&&raw<0.1?'&lt;0.1%':raw===100?'100%':fmt(Math.min(99.9,Math.round(raw*10)/10))+'%';
  return '<span class="portfolio-progress"><span><b>'+percent+'</b> · '+fmt(progress.completed)+' of '+fmt(progress.total)+' recorded tasks</span>'+
    '<progress value="'+progress.completed+'" max="'+progress.total+'" aria-label="Recorded tasks complete"></progress></span>';
}
function shownNativeIndex(project){
  if(project.codexIndexAllowed!==true||state.connection!=='reachable'||state.errors.directory)return null;
  const index=portfolio.nativeChecks.get(project.projectId);
  return index&&index.policyRevision===project.policyRevision&&Date.parse(index.expiresAt)>Date.now()?index:null;
}
function outcomeLabel(receipt){
  return receipt?esc({pass:'Passed',fail:'Failed',partial:'Partial'}[receipt.result]??'Unknown')+
    '<small class="muted"> '+esc(isoTime(receipt.recordedAt))+'</small>':'<span class="muted small">Unreported</span>';
}
function portfolioFact(name,content){
  return '<div><dt>'+name+'</dt><dd>'+content+'</dd></div>';
}
function projectCard(project,selected){
  const id=esc(project.projectId),{live,active}=workspaceCounts(project);
  const hosts=active.map(host=>host.label??hostName(host.id)).join(', ');
  const index=shownNativeIndex(project);
  const nativeThread=arr(index?.threads).find(thread=>thread.status==='active')??arr(index?.threads)[0];
  const shared=arr(project.sessions)[0];
  const chat=shared?.title??nativeThread?.name;
  const chatLabel=chat?esc(chat)+(shared?'':'<small class="muted"> · '+(nativeThread.status==='active'?'Active in app-server':'Codex index')+'</small>'):'<span class="muted small">Unreported</span>';
  return '<li class="portfolio-card"><button type="button" class="portfolio-card-select" id="workspace-card-'+id+'" data-open-workspace="'+id+'" aria-pressed="'+selected+'">'+
    '<span class="portfolio-name"><i class="'+(live?'current':'')+'" aria-hidden="true"></i><strong>'+esc(project.projectName)+'</strong></span></button>'+
    '<p class="small muted">'+esc(directoryLabels[project.status]??'Awaiting status')+'</p><dl class="portfolio-summary">'+
    portfolioFact('MCP hosts',hosts?esc(hosts)+' <small class="muted">· '+fmt(live)+' '+(live===1?'connection':'connections')+'</small>':
      '<span class="muted small">'+(live===null?'Unavailable':'No current connections')+'</span>')+
    portfolioFact('Chat',chatLabel)+portfolioFact('Latest outcome',outcomeLabel(project.latestOutcome))+
    portfolioFact('Task progress',projectProgress(project.progress))+'</dl></li>';
}
function directoryDetail(project){
  if(!project)return '';
  const id=esc(project.projectId),{live,active}=workspaceCounts(project),sessions=arr(project.sessions);
  const hosts=active.map(h=>chip((h.label??hostName(h.id))+' · '+fmt(h.connections),'cyan')).join(' ');
  const receipt=project.latestOutcome,native=shownNativeIndex(project);
  const table=sessions.length?'<div class="table-wrap" role="region" aria-label="Shared chats" tabindex="0"><table><thead><tr><th scope="col">Chat</th><th scope="col">Host</th><th scope="col">Reported work</th><th scope="col">Model</th><th scope="col">Last report</th></tr></thead><tbody>'+
    sessions.map(s=>'<tr><td>'+esc(s.title??'Untitled session')+'</td><td>'+esc(hostName(s.host))+'</td><td>'+esc(s.phase??s.reportedStatus??'Unavailable')+'</td><td>'+
    esc(s.responseModel??s.requestModel??'Unreported')+(s.reasoningEffort?' · '+esc(s.reasoningEffort):'')+'</td><td>'+esc(isoTime(s.phaseReportedAt??s.lastReportedAt))+'</td></tr>').join('')+
    '</tbody></table></div>':'<p class="small muted">'+(Array.isArray(project.sessions)?'No shared chat reports':'Chat reports unavailable')+'</p>';
  const nativePanel=native?.issue?'<p class="small muted">'+esc(native.issue)+'</p>':native?'<div class="stack portfolio-native"><strong>Codex index · '+esc(isoTime(native.observedAt))+'</strong>'+
    (arr(native.threads).length?list(native.threads.map(t=>'<li class="item"><div class="row"><strong>'+esc(t.name??'Untitled chat')+'</strong>'+chip(t.status==='active'?'Active in app-server':t.status==='notLoaded'?'Indexed':t.status)+'</div><small class="muted">'+esc(isoTime(t.updatedAt))+'</small></li>').join('')):'<span class="small muted">No visible indexed chats on this page.</span>')+'</div>':'';
  return '<section class="panel portfolio-detail"><div class="panel-head"><h2>'+esc(project.projectName)+'</h2>'+chip(directoryLabels[project.status]??project.status)+'</div>'+
    '<div class="panel-body stack"><details id="workspace-folder-'+id+'" data-keep-open><summary>Project folder</summary><p class="mono small muted">'+esc(project.root)+'</p></details><dl class="portfolio-facts">'+
    portfolioFact('MCP connections',live===null?'Unavailable':hosts||'No current connections')+
    portfolioFact('Latest outcome',outcomeLabel(receipt)+(receipt?'<small class="muted"> · '+esc(receipt.provenance)+'</small>':''))+
    portfolioFact('Task progress',projectProgress(project.progress))+'</dl><h3>Shared chats</h3>'+table+
    '<div class="actions">'+(project.codexIndexAllowed===true?btn('Check Codex chat index','id="directory-native-'+id+'" data-directory-native="'+id+'"','quiet'):'')+
    btn('Stop listing project','id="directory-forget-'+id+'" data-directory-forget="'+id+'"','quiet')+'</div>'+nativePanel+'</div></section>';
}
function workspacesPage(){
  const data=state.directory,rows=arr(data?.workspaces),selected=selectedDirectory(rows);
  const listing=rows.length?'<ul class="portfolio-list">'+rows.map(row=>projectCard(row,selected?.projectId===row.projectId)).join('')+'</ul>':
    empty(data?'No registered projects':'Loading workspace directory',data?'Open a project portal, connect its MCP service, or add the folder below.':'Reading registered project metadata.');
  return heading('Workspaces','See current MCP connections, reported chats, and progress on recorded tasks.',action('refresh','Refresh'))+
    '<div class="stack" id="workspace-portfolio"><div class="portfolio-nav"><span>Codex project indexes <small class="muted"> · up to six workspaces, checked once per minute in this view</small></span>'+
    btn(portfolio.nativeWatch?'Stop observing':'Observe Codex indexes','id="directory-watch" data-directory-watch="true" role="switch" aria-checked="'+portfolio.nativeWatch+'"','quiet')+'</div>'+
    (state.errors.directory?'<div class="panel-body red" role="status">'+esc(state.errors.directory)+'</div>':'')+
    '<section class="panel"><div class="panel-head"><h2>Local directory</h2>'+chip(data?fmt(data.total):'Loading')+'</div>'+listing+'</section>'+
    directoryDetail(selected)+'<details class="panel panel-body" id="directory-add" data-keep-open><summary>Add a workspace</summary>'+
    '<form class="form" data-form="directory-add"><div class="form-grid"><label>Project folder<input id="directory-add-root" name="root" placeholder="Absolute project path" required></label>'+
    '<label>Display name (optional)<input id="directory-add-name" name="name" maxlength="120"></label></div><div class="actions"><button type="submit" class="btn primary" id="directory-add-submit" '+(state.pending?'disabled':'')+'>Add workspace</button>'+
    '</div></form></details></div>';
}
async function selectDirectory(id){
  portfolio.selected=id;
  const epoch=++portfolio.epoch;
  if(state.view!=='workspaces'){openView('workspaces');return;}
  render(true);
  try{
    const snapshot=await readDirectory(id);
    if(state.view==='workspaces'&&epoch===portfolio.epoch){installDirectory(snapshot);render(true);}
  }catch(e){if(epoch===portfolio.epoch&&state.view==='workspaces')status(e.message,true);}
}
function cancelDirectoryIndexChecks(){
  portfolio.watchEpoch++;portfolio.watchRequest?.abort();portfolio.watchRequest=null;
}
async function directoryWrite(command){
  portfolio.epoch++;cancelDirectoryIndexChecks();portfolio.nativeChecks.clear();
  const expectedRevision=state.directory?.revision??0;
  try {installDirectory(await api(directoryRoute(portfolio.selected,true),json({...command,expectedRevision})));}
  catch(e){
    if(e.status===409){try{installDirectory(await readDirectory(portfolio.selected));}catch{}}
    throw e;
  }
}
function stopDirectoryWatch(){
  portfolio.nativeWatch=false;cancelDirectoryIndexChecks();portfolio.nativeChecks.clear();portfolio.nextIndexCheck=0;
}
async function checkDirectoryIndex(id,options={}){
  const epoch=portfolio.watchEpoch,row=arr(state.directory?.workspaces).find(project=>project.projectId===id);
  if(row?.codexIndexAllowed!==true)return;
  const snapshot=await api('directory/codex',{...json({projectId:id}),timeoutMs:16000,...options});
  const latest=arr(state.directory?.workspaces).find(project=>project.projectId===id);
  if(epoch===portfolio.watchEpoch&&state.view==='workspaces'&&!document.hidden&&
      latest?.codexIndexAllowed===true&&latest.policyRevision===snapshot.policyRevision){
    portfolio.nativeChecks.set(id,snapshot);
  }
}
async function checkDirectoryIndexes(){
  if(!portfolio.nativeWatch||portfolio.watchRequest||Date.now()<portfolio.nextIndexCheck||document.hidden||state.view!=='workspaces')return;
  const candidates=arr(state.directory?.workspaces).filter(row=>row.codexIndexAllowed===true).slice(0,6);
  if(!candidates.length)return;
  const controller=new AbortController();portfolio.watchRequest=controller;portfolio.nextIndexCheck=Date.now()+60000;
  const epoch=portfolio.watchEpoch;
  try{
    for(const project of candidates){
      if(controller.signal.aborted||document.hidden||state.view!=='workspaces')break;
      try{await checkDirectoryIndex(project.projectId,{signal:controller.signal});}
      catch(e){
        if(controller.signal.aborted||document.hidden||state.view!=='workspaces')break;
        portfolio.nativeChecks.set(project.projectId,{issue:e.message,policyRevision:project.policyRevision,expiresAt:new Date(Date.now()+60000).toISOString()});
      }
      if(epoch===portfolio.watchEpoch&&!state.pending&&!document.hidden&&state.view==='workspaces')render(true);
    }
  }finally{if(portfolio.watchRequest===controller)portfolio.watchRequest=null;}
}
function directoryPoll(){
  clearTimeout(portfolio.timer);portfolio.timer=0;
  if(!local||document.hidden||!['workspaces','overview'].includes(state.view))return;
  portfolio.timer=setTimeout(async()=>{
    if(document.hidden||!['workspaces','overview'].includes(state.view))return;
    if(state.pending||portfolio.reading){directoryPoll();return;}
    const epoch=portfolio.epoch,view=state.view;
    portfolio.reading=true;
    try{
      const next=await readDirectory(view==='workspaces'?portfolio.selected:null);
      if(epoch===portfolio.epoch&&view===state.view&&!state.pending){
        const changed=installDirectory(next);
        if(view==='workspaces'){if(changed)render(true);if(portfolio.nativeWatch)void checkDirectoryIndexes();}
        else if(changed)updateWorkspaceNav();
      }
    }catch(failure){if(epoch===portfolio.epoch&&view===state.view){state.errors.directory=failure.message;if(view==='overview')updateWorkspaceNav();else render(true);}}
    finally{portfolio.reading=false;directoryPoll();}
  },state.view==='workspaces'?10000:18000);
}
function updateWorkspaceNav(){
  const target=$('workspace-nav');if(!target)return;
  const html=workspaceNav();if(target.dataset.html!==html){target.dataset.html=html;target.innerHTML=html;}
}
`;
export const BRAIN_HUB_DIRECTORY_CSS = String.raw`
.portfolio-nav,.portfolio-chips,.portfolio-name{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.portfolio-nav{margin-bottom:10px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--surface);justify-content:space-between}
#workspace-portfolio .portfolio-nav{margin-bottom:0}
.portfolio-chips{flex:1;gap:6px}.portfolio-chips button,.portfolio-card-select{background:var(--ground);color:var(--ink);border:1px solid var(--border);border-radius:5px;text-align:left;cursor:pointer}
.portfolio-chips button{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;font:inherit;font-size:.76rem}
.portfolio-chips button:hover,.portfolio-card-select:hover,.portfolio-card-select[aria-pressed=true]{border-color:var(--cyan)}
.portfolio-name i,.portfolio-chips i{display:inline-block;width:6px;height:6px;flex:none;border-radius:50%;background:var(--muted)}
.portfolio-nav i.current,.portfolio-name i.current{background:var(--cyan)}
.portfolio-list{list-style:none;padding:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.portfolio-card{display:grid;align-content:start;gap:7px;min-width:0;padding:10px;border:1px solid var(--border);border-radius:5px}
.portfolio-card-select{min-width:0;padding:7px 8px;width:100%;font:inherit}
.portfolio-name{flex-wrap:nowrap}.portfolio-card strong,.portfolio-detail p,.portfolio-detail dd,.portfolio-summary dd{overflow-wrap:anywhere}
.portfolio-summary{display:grid;gap:3px;margin:0}.portfolio-summary>div{padding:5px 0;border-top:1px solid var(--border)}
.portfolio-summary dt{font-size:.75rem;color:var(--muted)}.portfolio-summary dd{margin:0;font-size:.83rem}
.portfolio-detail{min-width:0}.portfolio-facts{display:grid;gap:8px;margin:0}
.portfolio-facts>div{display:grid;grid-template-columns:minmax(110px,1fr) minmax(0,3fr);padding:7px 0;border-bottom:1px solid var(--border);gap:8px}
.portfolio-facts dt{color:var(--muted)}.portfolio-facts dd{margin:0}
.portfolio-progress{display:grid;gap:3px}.portfolio-progress progress{width:min(100%,300px);height:6px;accent-color:var(--cyan)}
.portfolio-native{border-top:1px solid var(--border);padding-top:10px}
@media(max-width:960px){.portfolio-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.portfolio-list,.portfolio-facts>div{grid-template-columns:minmax(0,1fr)}}
`;
