export const BRAIN_HUB_NATIVE = String.raw`
let nativeTimer=0,nativeBusy=false,nativeRequestEpoch=0,nativeReload=false;
let nativeFollow=null;
function invalidateNativeRequest(){nativeRequestEpoch++;clearTimeout(nativeTimer);}
async function startNativeFollow(){
  const selected=state.nativeThread;
  if(nativeFollow?.active||!selected||state.nativeThreadCursor||selected.thread.archived)return;
  invalidateNativeRequest();
  try{
    nativeFollow=await api('sessions/codex/threads/'+encodeURIComponent(selected.thread.id)+'/follow',
      {...json({sha256:selected.sha256}),timeoutMs:24000});
    await refreshSessions();
  }finally{void refreshNativeChats(true);}
}
async function stopNativeFollow(){
  invalidateNativeRequest();
  try{nativeFollow=await api('sessions/codex/follow/stop',json({}));}
  finally{void refreshNativeChats(true);}
}
function nativeFollowPanel(selected){
  const watch=nativeFollow,detail=watch?.result;
  const enabled=state.features?.features?.exactConversationCapture===true;
  const canStart=selected&&!selected.thread.archived&&!state.nativeThreadCursor&&state.nativeConnection?.connected&&enabled&&!watch?.active;
  const selectedTitle=selected?.thread?.id===watch?.threadId?selected?.thread?.name:null;
  return '<div class="panel-body stack" id="native-follow"><h3>Selected Codex chat archive</h3><p class="small muted">Enable exact conversation capture in Setup, then review and follow one chat. The local portal checks for new persisted user and assistant text while it runs and Codex stays connected.</p>'+
    (watch?.active?'<p class="small muted">Following '+esc(selectedTitle??watch.threadId)+'</p>':'')+
    '<div class="actions">'+(watch?.active?action('native-follow-stop','Stop following'):canStart?action('native-follow-start','Follow and save this chat'):!enabled?view('setup','Open Setup'):'')+
    (detail?action('native-follow-open','Open saved archive','quiet'):'')+'</div>'+
    (detail?'<p class="small muted" role="status">'+fmt(detail.sections)+' saved text sections · revision '+fmt(detail.revision)+'. '+(detail.olderHistoryOutsideArchive?'Earlier pages are outside this archive. ':'')+
      'Up to '+fmt(detail.limits.textSections)+' text sections or 2 MiB.</p>':'')+(watch?.issue?'<p class="small amber" role="status">'+esc(watch.issue)+'</p>':'')+'</div>';
}
async function refreshNativeChats(manual=false){
  if(document.hidden||state.view!=='sessions')return;
  if(nativeBusy){nativeReload ||= manual;return;}
  clearTimeout(nativeTimer);nativeBusy=true;
  const epoch=state.dataEpoch,requestEpoch=nativeRequestEpoch;
  const current=()=>epoch===state.dataEpoch&&requestEpoch===nativeRequestEpoch;
  try{
    const connection=await api('sessions/codex/status');
    if(!current())return;
    state.nativeConnection=connection;
    const previous=nativeFollow?.result;
    const watched=await api('sessions/codex/follow',{headers:directoryHeader()});
    if(!current())return;
    nativeFollow=watched;
    if(watched.result&&(watched.result.archiveId!==previous?.archiveId||watched.result.revision!==previous?.revision))await refreshSessions();
    if(connection.connected){
      const query=new URLSearchParams({archived:String(!!state.nativeArchived),...(state.nativeListCursor?{cursor:state.nativeListCursor}:{})});
      const result=await api('sessions/codex/threads?'+query,{timeoutMs:15000});
      if(!current())return;
      const selected=state.nativeThread?.thread;
      state.nativeThreads=result;
      const latest=arr(result.threads).find(item=>item.id===selected?.id);
      if(selected&&latest&&(manual||latest.updatedAt!==selected.updatedAt)){
        const page=await api('sessions/codex/threads/'+encodeURIComponent(selected.id)+(state.nativeThreadCursor?'?cursor='+encodeURIComponent(state.nativeThreadCursor):''),{timeoutMs:15000});
        if(!current())return;
        state.nativeThread=page;
      }
    }
    delete state.errors.native;
  }catch(failure){if(current())state.errors.native=failure.message;}
  finally{
    nativeBusy=false;
    if(nativeReload){nativeReload=false;void refreshNativeChats(true);}
    else if(current()&&state.view==='sessions'){render(true);if(state.nativeConnection?.connected)nativeTimer=setTimeout(()=>void refreshNativeChats(),10000);}
  }
}
function nativeHistoryPanel(){
  const connection=state.nativeConnection,threads=arr(state.nativeThreads?.threads),selected=state.nativeThread;
  const actions=connection?.connected?action('native-refresh','Refresh original chats')+action('native-disconnect','Disconnect Codex'):action('native-connect','Connect installed Codex','primary');
  const team=threads.filter(thread=>thread.subagentKind);
  const family=team.length?'<div class="panel-body"><h3>Subagents on this page</h3>'+list(team.map(thread=>{
    const parent=threads.find(row=>row.id===thread.parentThreadId);
    return '<li class="item"><strong>'+esc(thread.agentNickname??thread.name??'Subagent')+'</strong><small>'+
      esc([thread.agentRole??thread.subagentKind,thread.provider,thread.status?.type].filter(Boolean).join(' · '))+'</small>'+
      (thread.parentThreadId?'<small>Parent · '+esc(parent?.name??thread.parentThreadId)+'</small>':'')+'</li>';
  }).join(''))+'</div>':'';
  const listMarkup=threads.length?list(threads.map(thread=>'<li><button class="entry" type="button" data-native-thread="'+esc(thread.id)+'"><strong>'+esc(thread.name??'Original title unavailable')+'</strong><small class="mono muted">'+esc(thread.id)+'</small><small>'+esc(isoTime(thread.updatedAt))+'</small>'+(thread.subagentKind?chip(thread.agentRole??thread.subagentKind):'')+'</button></li>').join('')):empty(connection?.connected?'No conversations in this project':'Native history is disconnected',connection?.connected?'This list is scoped to the selected project directory. Check archived conversations if needed.':'Connect explicitly to read names and selected history through the installed Codex app-server.');
  const preview=selected?'<div class="panel-body stack"><h3>'+esc(selected.thread.name??'Original title unavailable')+'</h3><dl class="facts">'+fact('Original conversation ID',selected.thread.id)+fact('Session group ID',selected.thread.sessionId??'Not supplied')+fact('Original workspace',selected.thread.cwd)+
    (selected.thread.agentRole?fact('Role reported by Codex',selected.thread.agentRole):'')+
    (selected.thread.agentNickname?fact('Agent name',selected.thread.agentNickname):'')+
    (selected.thread.parentThreadId?fact('Parent thread',selected.thread.parentThreadId):'')+
    (selected.thread.forkedFromId?fact('Forked from',selected.thread.forkedFromId):'')+
    (selected.thread.provider?fact('Model provider',selected.thread.provider):'')+fact('History API runtime state',selected.thread.status?.type??'unknown')+fact('Observed',isoTime(selected.observedAt))+'</dl><p class="small muted">This separate app-server’s runtime state does not establish whether a desktop chat is working. Names are supplied by Codex; preview text is never substituted for a missing title.</p>'+list(arr(selected.messages).map(message=>'<li class="item"><strong>'+esc(message.role)+'</strong><p class="preserve">'+esc(message.text)+'</p><small class="mono muted">'+esc(message.locator)+'</small></li>').join(''))+'<p class="small muted">'+arr(selected.messages).length+' visible text sections on this page. '+fmt(selected.omitted-(selected.pageCoverage?.capacityOmittedInPage??0))+' non-text or unsupported items omitted. '+(selected.pageCoverage?.capacityOmittedInPage?'Page limit reached. '+fmt(selected.pageCoverage.capacityOmittedInPage)+' text sections are outside this preview. ':'')+(selected.nextCursor?'Earlier history is available.':'No earlier page reported.')+'</p><div class="actions">'+action('native-import','Save this history page','primary')+(selected.nextCursor?action('native-earlier','Earlier history','','data-cursor="'+esc(selected.nextCursor)+'"'):'')+'</div><p class="small muted">Saving creates an immutable project snapshot of this page. It does not automatically approve the chat as project knowledge or resume a model.</p></div>':empty('Choose an original conversation','Inspect its exact title and visible history before saving a shared snapshot.');
  const exports='<div class="panel-body"><form class="form" data-form="native-export"><label>Original tool<select name="tool"><option value="codex">Codex rollout / indexed export</option><option value="claude-code">Claude Code SDK / JSONL export</option><option value="opencode">OpenCode session export</option><option value="deepseek-harness">DeepSeek Harness canonical export</option></select></label><label>Native export file<input type="file" name="export" accept=".json,.jsonl,.ndjson,.zip" required></label><p class="small muted">Up to 2 MiB. DeepSeek ZIP imports read only the supported session record, never its attachments. Original names are kept when the export contains them; missing names stay unavailable.</p>'+submit('Import native history')+'</form></div>';
  return panel('Original tool history','<div class="panel-body stack"><div class="actions">'+actions+chip(connection?.connected?'Read-only Codex API':'Explicit connection required',connection?.connected?'green':'amber')+'</div><p class="small muted">Connected lists refresh every 10 seconds while this view is open. History is read on selection or when the selected conversation’s timestamp changes. The connection expires after 15 minutes.</p>'+error('native','native history')+(connection?.connected?'<div class="actions">'+action('native-archive',state.nativeArchived?'Show current chats':'Show archived chats')+(state.nativeThreads?.nextCursor?action('native-next','Next conversations','','data-cursor="'+esc(state.nativeThreads.nextCursor)+'"'):'')+(state.nativeListCursor?action('native-first','First conversations'):'')+'</div>':'')+'</div>'+nativeFollowPanel(selected)+family+'<div class="two"><div>'+listMarkup+'</div>'+preview+'</div><details><summary class="panel-body">Import an export from another supported tool</summary>'+exports+'</details>');
}
`;
