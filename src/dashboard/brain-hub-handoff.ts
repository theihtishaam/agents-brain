export const BRAIN_HUB_HANDOFF = String.raw`
function portableHandoffText(session,checkpoint,project,key){
  const section=(title,text)=>['## '+title,text].join('\n\n');
  const items=values=>arr(values).map(value=>'- '+String(value).replace(/\r?\n/g,'\n  ')).join('\n')||'Unreported.';
  const fence='\x60\x60\x60';
  const request={tool:'session_resume',arguments:{sessionId:session.id,checkpointId:checkpoint.id,sha256:checkpoint.sha256,key}};
  const recovered=checkpoint.recovery?[
    ...(checkpoint.sessionId?['Original session ID '+checkpoint.sessionId]:[]),
    ...(checkpoint.recovery.exactTranscript?.totalMessages&&checkpoint.sessionId?[
      checkpoint.recovery.exactTranscript.totalMessages+' original messages were recorded. To read them if authorized, call session_transcript_read with {"sessionId":'+JSON.stringify(checkpoint.sessionId)+'}.',
    ]:[]),
    ...arr(checkpoint.recovery.messages).map(message=>[String(message.role)+(message.truncated?' · excerpt shortened':''),
      String(message.excerpt).split(/\r?\n/).map(line=>'> '+line).join('\n')].join('\n\n')),
  ]:[];
  return [
    '# Session handoff',
    section('Project scope',project.name+'\n\nProject ID '+project.id+'\n\nConversation '+session.title),
    section('Original goal',session.goal||'Unreported.'),
    section('Checkpoint summary',checkpoint.summary||'Unreported.'),
    section('Constraints',items(checkpoint.constraints)),
    section('Approach',checkpoint.approach||'Unreported.'),
    section('Decisions',items(checkpoint.decisions)),
    section('Completed work',items(checkpoint.completed)),
    section('Next steps',items(checkpoint.nextSteps)),
    section('Source references',items(checkpoint.evidence)),
    ...(recovered.length?[section('Recovered shared updates',recovered.join('\n\n'))]:[]),
    section('Checkpoint SHA-256',checkpoint.sha256),
    section('Resume with Shadow Brain MCP','Use the MCP connection for project '+project.id+' and call session_resume with this request.\n\n'+
      fence+'json\n'+JSON.stringify(request,null,2)+'\n'+fence),
  ].join('\n\n')+'\n';
}
function showPortableHandoff(text,button){
  const dialog=document.createElement('dialog');
  dialog.id='portable-handoff';
  dialog.setAttribute('aria-labelledby','portable-handoff-title');
  dialog.innerHTML='<div class="panel-body stack"><h2 id="portable-handoff-title">Session handoff</h2>'+
    '<p class="small muted">Clipboard access is unavailable. Copy the selected text.</p>'+
    '<textarea aria-label="Portable session handoff" rows="12" readonly></textarea>'+
    '<div class="actions"><button type="button" class="btn quiet">Close</button></div></div>';
  $('portable-handoff')?.close();
  document.body.append(dialog);
  const textarea=dialog.querySelector('textarea');
  textarea.value=text;
  dialog.querySelector('button').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{dialog.remove();if(button.isConnected)button.focus({preventScroll:true});},{once:true});
  dialog.showModal();textarea.focus();textarea.select();textarea.scrollTop=0;
}
async function copyPortableHandoff(checkpointId,button){
  const session=state.session?.session;
  const project={id:state.server?.project?.id??state.project,name:scopeName()};
  const permitted=()=>{
    const chat=arr(state.policy?.chats).find(item=>item.id===session?.id);
    return !!chat?.shareContext&&!chat.inheritedBlocked&&!state.errors.policy&&state.policy?.policy?.participationEnabled!==false;
  };
  if(!session||!project.id||!permitted())return status('This conversation is unavailable for agent handoff.',true);
  const summary=arr(state.session?.checkpoints).find(item=>item.id===checkpointId);
  if(!summary)return status('Choose a saved checkpoint.',true);
  const epoch=state.dataEpoch;
  button.disabled=true;
  try{
    const {checkpoint}=await api('sessions/'+encodeURIComponent(session.id)+'/checkpoints/'+encodeURIComponent(checkpointId));
    if(epoch!==state.dataEpoch||state.view!=='sessions'||state.session?.session.id!==session.id)return;
    if(!permitted())return status('This conversation is unavailable for agent handoff.',true);
    if(checkpoint?.id!==checkpointId||checkpoint.sha256!==summary.sha256)throw new Error('The saved checkpoint changed. Refresh and choose it again.');
    const text=portableHandoffText(session,checkpoint,project,crypto.randomUUID());
    try{await clipboard(text);}
    catch{showPortableHandoff(text,button);}
  }catch(failure){status(failure?.message??'Could not prepare the session handoff.',true);}
  finally{button.disabled=false;}
}
`;

export const BRAIN_HUB_HANDOFF_CSS = String.raw`
#portable-handoff{width:min(37rem,calc(100vw - 2rem));max-height:88dvh;margin:auto;padding:0;overflow:auto;
  color:var(--ink);background:var(--surface);border:1px solid var(--strong);border-radius:8px}
#portable-handoff::backdrop{background:rgb(3 11 22 / .54)}
#portable-handoff textarea{width:100%;min-height:10rem;font:13px/1.5 var(--mono);resize:vertical}
`;
