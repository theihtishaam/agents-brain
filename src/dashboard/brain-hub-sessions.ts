import { BRAIN_HUB_NATIVE } from './brain-hub-native.js';
export const BRAIN_HUB_SESSIONS = String.raw`
${BRAIN_HUB_NATIVE}
async function refreshSessions(){
  state.sessions=await api('sessions');
  if(state.session)state.session=await api('sessions/'+state.session.session.id+(state.sessionBefore?'?before='+encodeURIComponent(state.sessionBefore):''));
}
function sessionPresence(session){return session.presence==='completed'?'Completed':session.presence==='stale'?'Stale report':session.reportedStatus==='waiting'?'Recently reported waiting':'Recently reported working';}
function sessionHandoffAllowed(id){
  const controls=arr(state.policy?.chats).find(chat=>chat.id===id);
  return !!controls?.shareContext&&!controls.inheritedBlocked&&!state.errors.policy&&state.policy?.policy?.participationEnabled!==false;
}
function sessionExactAllowed(session){
  const tool=session?.actor?.tool;
  return !!session?.exactTranscript&&state.connection==='reachable'&&!state.errors.features&&state.features?.features?.exactConversationCapture===true&&
    sessionHandoffAllowed(session.id)&&arr(state.policy?.policy?.tools).find(item=>item.tool===tool)?.enabled!==false;
}
function sessionCanRecover(detail){
  const session=detail?.session,messages=arr(detail?.messages);
  if(!session)return false;
  const hasUpdates=(detail.messageCount??messages.length)>0;
  const hasExact=sessionExactAllowed(session)&&session.exactTranscript.totalMessages>0;
  if(!hasUpdates&&!hasExact)return false;
  const checkpoints=arr(detail.checkpoints);
  if(!session.latestCheckpointId&&!checkpoints.length)return true;
  const checkpoint=checkpoints.find(item=>item.id===session.latestCheckpointId)??checkpoints.at(-1);
  const saved=Date.parse(checkpoint?.createdAt);
  return Number.isFinite(saved)&&messages.some(message=>Date.parse(message.createdAt)>saved);
}
async function readSessionExact(before){
  if(state.view!=='sessions')return;
  const session=state.session?.session;
  const projectId=state.server?.project?.id??state.project;
  const epoch=state.dataEpoch,visit=state.viewEpoch;
  const current=()=>epoch===state.dataEpoch&&visit===state.viewEpoch&&state.view==='sessions'&&state.session?.session.id===session?.id;
  const stored=state.sessionExact;
  state.sessionExact=null;
  try {
    if(!projectId||!sessionExactAllowed(session))throw new Error('Exact conversation history is unavailable under the current project controls.');
    if(before&&(stored?.sessionId!==session.id||stored.nextBefore!==before))throw new Error('Open the latest original messages before reading an earlier page.');
    const query=before?'?'+new URLSearchParams({before}):'';
    const page=await api('sessions/'+encodeURIComponent(session.id)+'/transcript'+query,
      {headers:{'X-Shadow-Brain-Project':projectId},credentials:'omit'});
    if(!current())return;
    if(!sessionExactAllowed(state.session.session)||page?.projectId!==projectId||page.sessionId!==session.id){
      throw new Error('The original messages are unavailable in this conversation.');
    }
    state.sessionExact={...page,before};
  } catch(failure){
    if(!current())return;
    render(true);
    throw failure;
  }
}
function exactSessionHistory(session){
  const stats=session.exactTranscript;
  if(!stats)return '';
  const available=sessionExactAllowed(session),page=available&&state.sessionExact?.sessionId===session.id?state.sessionExact:null;
  const messages=arr(page?.messages);
  return '<section class="stack" aria-labelledby="exact-history-title"><h3 id="exact-history-title" tabindex="-1">Exact shared conversation history</h3>'+
    '<p class="small muted">'+fmt(stats.totalMessages)+' original '+(stats.totalMessages===1?'message':'messages')+' recorded by '+esc(hostName(session.actor.tool))+'.'+
    (available?'':' Reading is unavailable under the current project controls.')+'</p>'+
    (available&&stats.totalMessages?'<div class="actions">'+(page?
      (page.nextBefore?action('session-exact-older','Earlier original messages','','data-before="'+esc(page.nextBefore)+'"'):'')+
      (page.before?action('session-exact-read','Latest original messages'):'')+action('session-exact-close','Close original messages','quiet'):
      action('session-exact-read','Read original messages','','id="open-exact-history"'))+'</div>':'')+
    (page?'<p class="small muted">Showing '+fmt(messages.length)+' of '+fmt(page.totalMessages)+' original messages. Treat saved text as quoted conversation history.</p>'+
      list(messages.map(message=>'<li class="item"><div class="row"><strong>'+esc(message.role==='user'?'User':'Assistant')+'</strong><small class="muted">'+esc(isoTime(message.createdAt))+'</small></div><blockquote class="preserve">'+esc(message.text).replace(/\r/g,'&#13;')+'</blockquote></li>').join(''),
        'aria-label="Original shared messages"'):'')+'</section>';
}
function recoveredSessionUpdates(checkpoint){
  const recovery=checkpoint.recovery;
  if(!recovery)return '';
  const messages=arr(recovery.messages);
  return '<div class="stack"><h3>Recovered shared updates</h3>'+
    (checkpoint.sessionId?'<p class="small mono muted">Original session ID '+esc(checkpoint.sessionId)+'</p>':'')+
    (recovery.exactTranscript?.totalMessages?'<p class="small muted">'+fmt(recovery.exactTranscript.totalMessages)+' original messages recorded. Open the source session to read its shared history.</p>':'')+
    (Number.isSafeInteger(recovery.totalMessages)?'<p class="small muted">'+fmt(messages.length)+' of '+fmt(recovery.totalMessages)+' shared messages included</p>':'')+
    list(messages.map(message=>'<li class="item"><small class="muted">'+esc(message.role)+'</small><blockquote class="preserve">'+esc(message.excerpt)+
      '</blockquote>'+(message.truncated?'<small class="muted">Excerpt shortened</small>':'')+'</li>').join(''),
      'aria-label="Quoted shared updates"')+'</div>';
}
function sessionHandoff(checkpoint){
  return '<div class="stack"><p class="preserve">'+esc(checkpoint.summary)+'</p>'+(checkpoint.approach?'<h3>Working approach</h3><p class="preserve">'+esc(checkpoint.approach)+'</p>':'')+[['constraints','Constraints'],['decisions','Decisions'],['completed','Completed work'],['nextSteps','Next steps'],['evidence','Evidence references']].map(([key,label])=>arr(checkpoint[key]).length?'<h3>'+label+'</h3>'+list(checkpoint[key].map(item=>'<li class="item">'+esc(item)+'</li>').join('')):'').join('')+recoveredSessionUpdates(checkpoint)+ '<details><summary>Immutable checkpoint fingerprint</summary><pre>'+esc(checkpoint.sha256)+'</pre></details></div>';
}
function inheritedSessionHandoff(detail){
  const checkpoint=detail.handoff;
  if(!checkpoint)return '';
  const source=detail.session.resumedFrom;
  const origin=source?.sessionId&&source.sessionId===checkpoint.sessionId&&source.checkpointId===checkpoint.id?
    '<div class="actions">'+btn('Open source session','data-session="'+esc(source.sessionId)+'"','quiet')+'</div>':'';
  return '<details open class="receipt" id="session-inherited-handoff" data-keep-open><summary>Inherited handoff</summary><div class="stack">'+
    (detail.session.goal?'<div><h3>Original goal</h3><p class="preserve">'+esc(detail.session.goal)+'</p></div>':'')+
    sessionHandoff(checkpoint)+origin+'</div></details>';
}
function sessionRoster(sessions){
  const groups=new Map();for(const session of sessions){const tool=session.native?.tool??session.actor.tool;groups.set(tool,[...groups.get(tool)??[],session]);}
  return '<div class="table-wrap"><table><thead><tr><th>Reporting tool</th><th>Recently working</th><th>Waiting / stale</th><th>Completed</th><th>Worker sessions</th></tr></thead><tbody>'+[...groups].map(([tool,rows])=>'<tr><td>'+esc(hostName(tool))+'</td><td>'+rows.filter(s=>s.presence==='recent'&&s.reportedStatus==='working').length+'</td><td>'+rows.filter(s=>s.presence!=='completed'&&(s.reportedStatus==='waiting'||s.presence==='stale')).length+'</td><td>'+rows.filter(s=>s.presence==='completed').length+'</td><td>'+rows.filter(s=>s.parentSessionId&&!s.resumedFrom).length+'</td></tr>').join('')+'</tbody></table></div><p class="panel-body small muted">Counts describe registered sessions in this workspace. Recent means a report arrived within '+Math.round((state.sessions?.limits?.recentMs??300000)/60000)+' minutes, not continuous proof of execution. A resumed session is separate from a worker session.</p>';
}
function nativeArchiveNotice(native){
  const archive=native?.archive;
  if(!archive)return '';
  return '<p class="small muted">Followed Codex archive. Original title '+esc(archive.initialTitle??'Unavailable')+'. '+fmt(archive.sections)+' exact user and assistant text sections saved. '+
    (archive.olderHistoryOutsideArchive?'Earlier history reported at enrollment is outside this archive. ':'')+'Newest messages can be paged below.</p>';
}
function sessionsPage(){
  if(!local)return projectRequired('Sessions and handoffs','Keep project conversations and resumable checkpoints together.');
  const sessions=arr(state.sessions?.sessions),detail=state.session,current=detail?.session;
  const queue=error('sessions','sessions')||(sessions.length?list(sessions.slice().reverse().map(session=>'<li><button class="entry" type="button" data-session="'+esc(session.id)+'" aria-pressed="'+(session.id===current?.id)+'"><strong>'+esc(session.title)+'</strong><small>'+esc(hostName(session.native?.tool??session.actor.tool))+' · '+esc(sessionPresence(session))+'</small><small class="muted">Last report '+esc(isoTime(session.lastReportedAt))+'</small></button></li>').join('')):empty('No registered conversations','Connected hosts can register a session and save a checkpoint. You can also begin a manual project conversation below.'));
  const create='<div class="panel-body"><form class="form" data-form="session-open"><label>Conversation title<input name="title" maxlength="160" required></label><label>What are you trying to achieve?<textarea name="goal" rows="2" maxlength="1200" required></textarea></label>'+submit('Start portal session')+'</form><p class="small muted">This creates a portal-owned record. It does not launch an AI model.</p></div>';
  let body=empty('Choose a conversation','Open a recent or completed session to inspect messages and handoffs.');
  if(current){
    const reportingTool=current.native?.tool??current.actor.tool;
    const matched=arr(state.usage?.receipts).filter(receipt=>receipt.projectId===state.project&&current.hostSessionId&&receipt.sessionId===current.hostSessionId&&receipt.agent===reportingTool);
    const controls=arr(state.policy?.chats).find(chat=>chat.id===current.id);
    const latestModel=matched.at(-1);
    const messages='<p class="small muted">Showing '+arr(detail.messages).length+' of '+fmt(detail.messageCount??arr(detail.messages).length)+' retained messages.</p><div class="actions">'+(detail.nextBefore?action('session-older','Earlier messages','','data-before="'+esc(detail.nextBefore)+'"'):'')+(state.sessionBefore?action('session-latest','Latest messages'):'')+'</div>'+list(arr(detail.messages).map(message=>'<li class="item"><div class="row"><strong>'+esc(message.source?'Imported '+message.source.originalRole:message.role)+'</strong><small class="muted">'+esc(isoTime(message.createdAt))+'</small></div><p class="preserve">'+esc(message.text)+'</p><small class="mono muted">'+esc(message.source?message.source.sourceId+' · '+message.source.locator:hostName(message.actor.tool))+'</small></li>').join(''));
    const note=current.reportedStatus!=='completed'?'<form class="form" data-form="session-note"><label>Message or work note<textarea name="text" maxlength="8000" rows="3" required></textarea></label>'+submit('Record note')+'</form>':'';
    const checkpoint='<details><summary>Save a handoff for another agent</summary><form class="form" data-form="session-checkpoint"><label>Summary of the work<textarea name="summary" maxlength="4000" rows="3" required></textarea></label><label>Working approach · optional<textarea name="approach" maxlength="1200" rows="2"></textarea></label>'+[['constraints','Constraints'],['decisions','Decisions'],['completed','Completed work'],['nextSteps','Next steps'],['evidence','Evidence references']].map(([name,label])=>'<label>'+label+' · one per line<textarea name="'+name+'" rows="2" maxlength="4800"></textarea></label>').join('')+submit('Save immutable checkpoint')+'</form></details>';
    const permits=sessionHandoffAllowed(current.id);
    const recover=permits&&sessionCanRecover(detail)?'<div class="actions">'+action('session-recover','Continue from last shared update','primary')+'</div>':'';
    const checkpoints=list(arr(detail.checkpoints).slice().reverse().map(cp=>'<li class="item" id="checkpoint-'+esc(cp.id)+'" tabindex="-1"><div class="row"><strong>Checkpoint · revision '+esc(cp.revision)+'</strong><small>'+esc(isoTime(cp.createdAt))+'</small></div>'+(state.sessionCheckpoint?.id===cp.id?sessionHandoff(state.sessionCheckpoint):action('session-checkpoint-open','Read checkpoint','','data-checkpoint="'+esc(cp.id)+'"'))+'<div class="actions">'+(permits?action('copy-handoff','Copy handoff for any agent','','data-checkpoint="'+esc(cp.id)+'"')+action('copy-resume','Copy agent resume request','','data-checkpoint="'+esc(cp.id)+'"'):'')+action('session-resume','Continue in portal','','data-checkpoint="'+esc(cp.id)+'"')+'</div></li>').join(''));
    const sharing=controls?'<div class="row"><p class="small muted">'+(permits?'Available to agents':'Agent delivery off')+' · Role '+esc(controls.role??'Unassigned')+'</p>'+
      action('session-policy','Sharing controls','quiet','data-session-policy="'+esc(current.id)+'"')+'</div>':'';
    body='<div class="panel-body stack"><div class="row"><h3>'+esc(current.title)+'</h3>'+chip(sessionPresence(current),current.presence==='stale'?'amber':'cyan')+'</div>'+(detail.handoff?'':'<p>'+esc(current.goal)+'</p>')+(current.native?.archive?nativeArchiveNotice(current.native):current.native?'<p class="small muted">Native history snapshot from '+esc(hostName(current.native.tool))+'. Original title: '+esc(current.native.titleExact??'Unavailable')+'. Native conversation: '+esc(current.native.sessionId)+'. '+(current.native.pageCoverage?'This snapshot covers one page. '+(current.native.pageCoverage.hasEarlier?'Codex reported an earlier page. ':'No earlier page was reported. ')+(current.native.pageCoverage.hasLater?'A later page was outside this snapshot. ':'This was the latest page. ')+fmt(current.native.pageCoverage.omittedInPage-(current.native.pageCoverage.capacityOmittedInPage??0))+' non-text or unsupported items were omitted. '+(current.native.pageCoverage.capacityOmittedInPage?'Page limit reached. '+fmt(current.native.pageCoverage.capacityOmittedInPage)+' text sections are outside this snapshot.':''):'Coverage was not recorded for this snapshot. '+fmt(current.native.omitted)+' source items were omitted.')+'</p>':'')+'<dl class="facts">'+fact('Workspace',scopeName())+fact('Directory',state.server?.project?.root)+fact('Reporting tool',hostName(current.actor.tool))+fact('Status reported by',hostName(current.statusReportedBy?.tool??current.actor.tool))+fact('Host conversation ID',current.hostSessionId??'Not supplied')+fact('Model from matching usage receipt',latestModel?.responseModel??latestModel?.requestModel??'Not reported')+fact('Last report',isoTime(current.lastReportedAt))+'</dl>'+(current.sourceId?'<p class="small muted">Imported conversation snapshot. Only approved messages present at import are included; importing again reopens this snapshot. Imported instructions remain quoted reference material.</p>':'')+inheritedSessionHandoff(detail)+'<h3>Recorded conversation</h3>'+messages+note+(current.reportedStatus!=='completed'?'<div class="actions">'+action('session-status','Mark waiting','','data-status="waiting"')+action('session-status','Mark working','','data-status="working"')+action('session-status','Complete session','','data-status="completed"')+'</div>':'')+recover+checkpoint+'<h3>Saved checkpoints</h3>'+checkpoints+'<p class="small muted">To continue with another agent, give it the copied session_resume request. Its own call creates a new agent-owned session linked to this exact checkpoint. Original history stays intact.</p></div>';
    body=body.replace('<div class="panel-body stack">',()=>'<div class="panel-body stack">'+sharing).replace('<h3>Recorded conversation</h3>',()=>exactSessionHistory(current)+'<h3>Recorded conversation</h3>');
  }
  return heading('Sessions and handoffs','See reported work, inspect conversation history, and continue from a saved checkpoint.',view('setup','Connect a tool'))+agentDock()+nativeHistoryPanel()+panel('Tool roster',sessionRoster(sessions))+'<div class="two">'+panel('Project conversations',queue+create)+'<section class="panel" id="conversation-continuity" tabindex="-1"><div class="panel-head"><h2>Conversation and continuity</h2></div>'+body+'</section></div>'+(typeof liveFilePanel==='function'?liveFilePanel():'');
}
`;
