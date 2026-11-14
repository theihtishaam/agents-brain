export const BRAIN_HUB_LIVE = String.raw`
const liveStream={source:null,status:'connecting',cursor:null,instance:null,replaying:false,ready:false,notice:null,areas:new Set(),
  timer:0,files:null,fileError:null,fileEpoch:0,inventoryTimer:0,seen:new Map(),filePulse:null};
const streamAreas=['telemetry','graph','hub','sources','sessions','usage','features','feedback','policy','presence'];
function streamBadge(){
  const badge=$('stream-health');
  if(!badge||!local)return;
  const state=liveStream.status;
  badge.hidden=false;
  badge.className='chip '+(state==='live'?'green':state==='fallback'?'amber':'');
  badge.textContent=state==='live'?'Live stream':state==='fallback'?'Polling fallback':state==='off'?'Live updates off':'Connecting stream';
}
function queueLive(areas){
  for(const area of areas)if(streamAreas.includes(area))liveStream.areas.add(area);
  if(liveStream.timer||!liveStream.areas.size)return;
  liveStream.timer=setTimeout(()=>{
    liveStream.timer=0;
    if(document.hidden)return;
    if(polling||state.pending){queueLive([]);return;}
    const areas=new Set(liveStream.areas);
    liveStream.areas.clear();
    void refresh(false,areas);
  },55);
}
function clearLiveFiles(){
  liveStream.files=null;liveStream.fileError=null;liveStream.filePulse=null;liveStream.seen.clear();liveStream.fileEpoch++;
  updateLiveFilePanel();updateLiveFilePulse();
}
function stopProjectStream(){
  liveStream.source?.close();liveStream.source=null;
  liveStream.ready=false;liveStream.replaying=false;
  clearTimeout(liveStream.timer);liveStream.timer=0;clearTimeout(liveStream.inventoryTimer);liveStream.inventoryTimer=0;
  liveStream.areas.clear();
}
function syncProjectStream(){
  if(!local||document.hidden||!state.server?.capabilities?.liveStream)return;
  if(state.features?.features?.liveActivity===false){
    stopProjectStream();clearLiveFiles();liveStream.cursor=null;liveStream.status='off';streamBadge();return;
  }
  if(liveStream.source)return;
  if(typeof EventSource!=='function'){liveStream.status='fallback';streamBadge();return;}
  liveStream.status='connecting';streamBadge();
  const previous=liveStream.cursor;
  liveStream.replaying=!!previous;
  const source=new EventSource('/api/workspace/stream'+(previous?'?'+new URLSearchParams({cursor:previous}):''));
  liveStream.source=source;
  function handle(message){
    if(liveStream.source!==source)return;
    let data;
    try{data=JSON.parse(message.data);}catch{return;}
    if(!data||typeof data.serverInstanceId!=='string'||!Number.isSafeInteger(data.sequence)||data.kind!==message.type)return;
    if(liveStream.instance&&liveStream.instance!==data.serverInstanceId)clearLiveFiles();
    liveStream.instance=data.serverInstanceId;
    liveStream.cursor=message.lastEventId;
    if(data.kind==='disabled'){
      stopProjectStream();clearLiveFiles();liveStream.cursor=null;liveStream.status='off';streamBadge();
      void refresh(true);return;
    }
    if(data.kind==='reset'){
      liveStream.notice='Live history changed. The workspace refreshed its current snapshot.';
      clearLiveFiles();return;
    }
    if(data.kind==='ready'){
      const reconnect=liveStream.replaying||liveStream.ready;
      liveStream.status='live';liveStream.ready=true;liveStream.replaying=false;
      if(!pollAgain)clearTimeout(timer);
      streamBadge();
      if(reconnect){state.suppressLivePulse=true;void refresh(true);}
      else queueLive(streamAreas);
      if(data.watch?.status!=='off')void readLiveFiles();
      renderChrome();return;
    }
    if(data.kind==='change'){if(liveStream.ready&&!liveStream.replaying)queueLive(arr(data.areas));return;}
    if(data.kind==='watch'){void readLiveFiles();return;}
    if(data.kind==='file'&&typeof data.path==='string'&&data.path.length<=320){
      if(liveStream.seen.has(data.sequence))return;
      liveStream.seen.set(data.sequence,data);
      if(liveStream.seen.size>50)liveStream.seen.delete(liveStream.seen.keys().next().value);
      if(liveStream.ready&&!liveStream.replaying&&state.view==='overview'){
        liveStream.filePulse=data;updateLiveFilePulse(!reduced.matches&&!state.motionPaused&&!state.replayId);
      }
      updateLiveFilePanel();
      clearTimeout(liveStream.inventoryTimer);
      liveStream.inventoryTimer=setTimeout(()=>void readLiveFiles(),240);
    }
  }
  for(const kind of ['ready','change','file','watch','reset','disabled'])source.addEventListener(kind,handle);
  source.addEventListener('error',()=>{
    if(liveStream.source!==source)return;
    liveStream.status='fallback';liveStream.replaying=true;streamBadge();
    if(!polling)void refresh();
  });
}
async function readLiveFiles(){
  if(!local||document.hidden||state.features?.features?.liveActivity===false)return;
  const id=++liveStream.fileEpoch;
  try{
    const files=await api('project-files');
    if(id!==liveStream.fileEpoch)return;
    if(liveStream.instance&&liveStream.instance!==files.serverInstanceId)liveStream.seen.clear();
    liveStream.files=files;liveStream.fileError=null;
    if(!files.enabled||files.watch?.status==='off'){liveStream.filePulse=null;liveStream.seen.clear();updateLiveFilePulse();}
    for(const event of arr(files.events))if(!liveStream.seen.has(event.sequence))liveStream.seen.set(event.sequence,event);
    const sequences=[...liveStream.seen.keys()].sort((a,b)=>a-b).slice(0,-50);
    for(const sequence of sequences)liveStream.seen.delete(sequence);
  }catch(failure){if(id===liveStream.fileEpoch)liveStream.fileError=failure.message;}
  updateLiveFilePanel();
}
function liveFileBody(){
  const fileFeature=state.features?.features?.projectFileActivity??liveStream.files?.enabled;
  if(!fileFeature)return empty('Project file activity is off','Enable it in Setup to observe safe relative paths in this project.',view('setup','Open Setup'));
  if(liveStream.status==='off')return empty('Live updates are off','Enable live dashboard activity in Setup.',view('setup','Open Setup'));
  if(state.features?.features?.activityRecording===false)return empty('Activity recording is off','Enable activity recording in Setup to observe file changes.',view('setup','Open Setup'));
  const watch=liveStream.files?.watch;
  const known=arr(liveStream.files?.items);
  const summary=watch?.status==='limited'?'Watch coverage is limited. Some paths may be omitted.':
    watch?.status==='watching'?fmt(watch.directories)+' watched directories':watch?.status==='off'?'Waiting for a live subscription.':'Opening the selected project.';
  const received=[...liveStream.seen.values()].sort((a,b)=>b.sequence-a.sequence).slice(0,24);
  const entries=received.map(event=>'<li class="item"><div class="row"><strong class="mono">'+esc(event.path)+'</strong><time class="small mono muted" datetime="'+esc(event.timestamp)+'">'+esc(time(event.timestamp))+'</time></div><small class="muted">'+
    esc(event.operation==='entry'?(event.exists?'Directory entry changed':'Removed or renamed'):'Change notification')+
    ' · Unknown actor'+(event.count>1?' · '+fmt(event.count)+' grouped notifications':'')+'</small></li>').join('');
  const mostRecent=received[0]?' · Last observed '+time(received[0].timestamp):'';
  return '<div class="panel-body stack"><p class="small muted">'+esc(liveStream.fileError??(summary+mostRecent))+'</p>'+
    (entries?list(entries,'aria-label="Observed project file changes"'):'<p class="small muted">No eligible changes have been observed.</p>')+
    (known.length?'<details><summary>Project paths · '+fmt(known.length)+(watch?.inventoryLimited?' shown':'')+'</summary>'+list(known.map(item=>'<li class="item small mono">'+esc(item.path)+(item.entry==='directory'?'/':'')+'</li>').join(''))+'</details>':'')+'</div>';
}
function liveFilePanel(){
  return '<section class="panel" aria-label="Project file activity"><div class="panel-head"><h2>Project file activity</h2></div><div id="project-file-body">'+liveFileBody()+'</div></section>';
}
function updateLiveFilePanel(){
  const region=$('project-file-body');
  if(!region)return;
  const markup=liveFileBody();
  if(region.dataset.markup===markup)return;
  const expanded=region.querySelector('details')?.open;
  const focused=region.querySelector('summary:focus');
  region.dataset.markup=markup;region.innerHTML=markup;
  const details=region.querySelector('details');
  if(details&&expanded)details.open=true;
  if(focused)details?.querySelector('summary')?.focus({preventScroll:true});
}
function updateLiveFilePulse(animate=false){
  const label=$('project-file-pulse');
  if(!label)return;
  label.hidden=!liveStream.filePulse;
  label.textContent=liveStream.filePulse?'Observed file change · '+liveStream.filePulse.path:'';
  label.classList.remove('file-fresh');
  if(animate&&!label.hidden)requestAnimationFrame(()=>{if(label.isConnected)label.classList.add('file-fresh');});
}
`;
