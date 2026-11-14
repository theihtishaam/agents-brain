export const BRAIN_HUB_CONTROLS = String.raw`
function projectControls(){
  if(!local)return '';
  if(state.errors.policy)return panel('Project sharing',error('policy','project controls'));
  const view=state.policy;
  if(!view)return panel('Project sharing',empty('Loading project controls','Reading sharing and context preferences.'));
  const snapshot=view.policy;
  const disabled=state.pending?' disabled':'';
  const slider=(name,label,min,max,value,suffix)=>'<label><span class="row">'+esc(label)+' <output class="mono cyan" for="policy-'+name+'" data-policy-output="'+name+'">'+fmt(value)+'</output></span>'+
    '<input id="policy-'+name+'" name="'+name+'" type="range" min="'+min+'" max="'+max+'" value="'+value+'" aria-label="'+esc(label)+'" aria-valuetext="'+fmt(value)+' '+suffix+'"'+disabled+'></label>';
  const ceilings='<form class="form" data-form="policy-context">'+slider('maxTokens','Maximum estimated context tokens',200,12000,snapshot.context.maxTokens,'estimated tokens')+
    slider('maxEntries','Maximum context entries',1,30,snapshot.context.maxEntries,'entries')+submit('Save context limits')+'</form>';
  const tools=list(arr(view.tools).map(tool=>{
    const on=arr(snapshot.tools).find(entry=>entry.tool===tool)?.enabled!==false;
    return '<li class="item"><div class="row"><strong>'+esc(hostName(tool))+'</strong>'+btn(on?'Enabled':'Disabled','role="switch" aria-checked="'+on+'" aria-label="Allow '+esc(hostName(tool))+
      ' to use project tools" data-policy-tool="'+esc(tool)+'" data-enabled="'+!on+'"'+disabled)+'</div></li>';
  }).join(''),'aria-label="Project tools"');
  const candidates=arr(view.chats);
  const selected=candidates.find(chat=>chat.id===state.policySelection)??candidates[0];
  const chats=selected?'<div class="stack"><label class="form">Conversation<select id="policy-chat"><option value="" disabled>Select a conversation</option>'+
    candidates.map(chat=>'<option value="'+esc(chat.id)+'" '+(chat.id===selected.id?'selected':'')+'>'+esc(chat.title)+' · '+esc(hostName(chat.tool))+'</option>').join('')+
    '</select></label><div class="row"><span>Share context from this chat</span>'+btn(selected.shareContext?'Sharing':'Private to operator',
      'role="switch" aria-label="Share context from the selected chat" aria-checked="'+!!selected.shareContext+'" data-policy-chat="'+esc(selected.id)+'" data-enabled="'+!selected.shareContext+'"'+disabled)+
    '</div>'+(selected.inheritedBlocked?'<p class="small amber">An earlier handoff in this conversation is unavailable to agents.</p>':'')+
    '<form class="form" data-form="policy-role" data-id="'+esc(selected.id)+'"><label>Coordination role<select name="role">'+
      [['','Unassigned'],['lead','Lead'],['worker','Worker'],['observer','Observer']].map(([value,label])=>'<option value="'+value+'" '+((selected.role??'')===value?'selected':'')+'>'+label+'</option>').join('')+
    '</select></label>'+submit('Save role','')+'</form></div>':empty('No shared conversations yet','Open or import a conversation to set its sharing and role.');
  return panel('Project sharing','<div class="panel-body stack"><div class="two"><section class="stack"><h3>Context limits</h3>'+ceilings+'</section>'+
    '<section class="stack"><h3>Conversation access</h3>'+chats+'</section></div><details id="policy-tools"><summary>Tool participation</summary>'+tools+
    '<p class="small muted">Applies to client labels connected to this project’s Shadow Brain. Role assignments are coordination labels.</p></details></div>',chip('Revision '+snapshot.revision));
}
function installPolicy(value){
  if(state.policy?.policy.revision>value.policy.revision)return false;
  const changed=JSON.stringify(state.policy)!==JSON.stringify(value);
  const prior=state.context?.policy?.revision;
  state.policy=value;
  if(prior!==undefined&&prior!==value.policy.revision){
    state.context=null;state.comparison=null;
    if(state.view==='context')status('Project controls changed. Build a fresh context pack.');
  }
  return changed;
}
async function saveProjectPolicy(command){
  if(!state.policy)return;
  try {
    const result=await api('project-policy',json({...command,expectedRevision:state.policy.policy.revision}));
    installPolicy(result);delete state.errors.policy;
  }catch(failure){
    if(failure.status===409){
      try{installPolicy(await api('project-policy'));render(true);}catch{}
    }
    throw failure;
  }
}
function reflectPolicySlider(target){
  if(!target.id?.startsWith('policy-')||target.type!=='range')return;
  const output=target.parentElement.querySelector('output');
  const text=fmt(Number(target.value));
  if(output)output.textContent=text;
  target.setAttribute('aria-valuetext',text+(target.name==='maxTokens'?' estimated tokens':' entries'));
}
`;
