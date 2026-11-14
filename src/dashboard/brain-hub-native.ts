export const BRAIN_HUB_NATIVE = String.raw`
let nativeTimer=0,nativeBusy=false,nativeRequestEpoch=0,nativeReload=false;
function invalidateNativeRequest(){nativeRequestEpoch++;clearTimeout(nativeTimer);}
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
  const listMarkup=threads.length?list(threads.map(thread=>'<li><button class="entry" type="button" data-native-thread="'+esc(thread.id)+'"><strong>'+esc(thread.name??'Original title unavailable')+'</strong><small class="mono muted">'+esc(thread.id)+'</small><small>'+esc(isoTime(thread.updatedAt))+'</small></button></li>').join('')):empty(connection?.connected?'No conversations in this project':'Native history is disconnected',connection?.connected?'This list is scoped to the selected project directory. Check archived conversations if needed.':'Connect explicitly to read names and selected history through the installed Codex app-server.');
  const preview=selected?'<div class="panel-body stack"><h3>'+esc(selected.thread.name??'Original title unavailable')+'</h3><dl class="facts">'+fact('Original conversation ID',selected.thread.id)+fact('Session group ID',selected.thread.sessionId??'Not supplied')+fact('Original workspace',selected.thread.cwd)+fact('History API runtime state',selected.thread.status?.type??'unknown')+fact('Observed',isoTime(selected.observedAt))+'</dl><p class="small muted">This separate app-server’s runtime state does not establish whether a desktop chat is working. Names are supplied by Codex; preview text is never substituted for a missing title.</p>'+list(arr(selected.messages).map(message=>'<li class="item"><strong>'+esc(message.role)+'</strong><p class="preserve">'+esc(message.text)+'</p><small class="mono muted">'+esc(message.locator)+'</small></li>').join(''))+'<p class="small muted">'+arr(selected.messages).length+' visible messages in this page. '+fmt(selected.omitted)+' non-text or unsupported items omitted. '+(selected.nextCursor?'Earlier history is available.':'No earlier page reported.')+'</p><div class="actions">'+action('native-import','Save this history page','primary')+(selected.nextCursor?action('native-earlier','Earlier history','','data-cursor="'+esc(selected.nextCursor)+'"'):'')+'</div><p class="small muted">Saving creates an immutable project snapshot of this page. It does not automatically approve the chat as project knowledge or resume a model.</p></div>':empty('Choose an original conversation','Inspect its exact title and visible history before saving a shared snapshot.');
  const exports='<div class="panel-body"><form class="form" data-form="native-export"><label>Original tool<select name="tool"><option value="codex">Codex rollout / indexed export</option><option value="claude-code">Claude Code SDK / JSONL export</option><option value="opencode">OpenCode session export</option><option value="deepseek-harness">DeepSeek Harness canonical export</option></select></label><label>Native export file<input type="file" name="export" accept=".json,.jsonl,.ndjson,.zip" required></label><p class="small muted">Up to 2 MiB. DeepSeek ZIP imports read only the supported session record, never its attachments. Original names are kept when the export contains them; missing names stay unavailable.</p>'+submit('Import native history')+'</form></div>';
  return panel('Original tool history','<div class="panel-body stack"><div class="actions">'+actions+chip(connection?.connected?'Read-only Codex API':'Explicit connection required',connection?.connected?'green':'amber')+'</div><p class="small muted">Connected lists refresh every 10 seconds while this view is open. History is read on selection or when the selected conversation’s timestamp changes. No model is started. The connection expires after 15 minutes.</p>'+error('native','native history')+(connection?.connected?'<div class="actions">'+action('native-archive',state.nativeArchived?'Show current chats':'Show archived chats')+(state.nativeThreads?.nextCursor?action('native-next','Next conversations','','data-cursor="'+esc(state.nativeThreads.nextCursor)+'"'):'')+(state.nativeListCursor?action('native-first','First conversations'):'')+'</div>':'')+'</div><div class="two"><div>'+listMarkup+'</div>'+preview+'</div><details><summary class="panel-body">Import an export from another supported tool</summary>'+exports+'</details>');
}
`;
