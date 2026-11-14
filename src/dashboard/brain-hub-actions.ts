export const BRAIN_HUB_ACTIONS = String.raw`
async function roomWrite(input){
  if(!state.room)throw new Error('Select a room first.');
  state.room=await hubWrite('hub/rooms/'+encodeURIComponent(state.room.room.id)+'/actions',input);
}
async function lessonWrite(id,input){
  const {lesson}=await hubWrite('hub/lessons/'+encodeURIComponent(id)+'/actions',input);
  if(lesson)state.hub={...state.hub,lessons:arr(state.hub?.lessons).map(item=>item.id===id?lesson:item)};
  return afterSave(refreshHub,...(input.kind!=='evaluate'?[refreshGraph]:[]));
}
async function inspectApprovedMemory(id){
  state.graph=await api('graph'+projectQuery({limit:graphMemoryLimit,memory:id}));
  openView('overview');
  await chooseMemory('memory:'+id);
}
function handleClick(event){
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const data=button.dataset;
  if(data.policyTool){void mutation(()=>saveProjectPolicy({kind:'set-tool-participation',tool:data.policyTool,enabled:data.enabled==='true'}),button,'Tool participation saved.');return;}
  if(data.policyChat){void mutation(()=>saveProjectPolicy({kind:'set-chat-sharing',sessionId:data.policyChat,shareContext:data.enabled==='true'}),button,'Conversation sharing saved.');return;}
  if(data.view){openView(data.view);return;}
  if(data.project){
    if(!state.pending&&data.project!==state.project){state.project=data.project;resetScope();render();void refresh(true);}
    return;
  }
  if(data.node){void chooseMemory(data.node);return;}
  if(data.graphMemory){void focusGraphMemory(data.graphMemory,data.graphProject);return;}
  if(data.graphFilter){filterGraph(data.graphFilter);return;}
  if(data.inspect){state.inspector=data.inspect;renderInspector();$('inspector').querySelector('[data-inspect="'+data.inspect+'"]')?.focus({preventScroll:true});return;}
  if(data.event){
    setReplay(state.events.findIndex(item=>item.id===data.event));
    const replacement=[...(button.closest('#graph-exchanges')?$('graph-exchanges'):button.closest('#timeline')?$('timeline'):button.closest('#trace-list')?$('trace-list'):$('inspector'))?.querySelectorAll('[data-event]')??[]]
      .find(item=>item.dataset.event===data.event);
    (replacement??$('inspector')?.querySelector('[data-inspect=event]'))?.focus({preventScroll:true});
    return;
  }
  if(data.nativeThread){void mutation(async()=>{invalidateNativeRequest();state.nativeThreadCursor=null;state.nativeThread=await api('sessions/codex/threads/'+encodeURIComponent(data.nativeThread),{timeoutMs:15000});nativeTimer=setTimeout(()=>void refreshNativeChats(),10000);},button,'Original history page opened.');return;}
  if(data.session){void mutation(async()=>{state.sessionBefore=null;state.sessionCheckpoint=null;state.session=await api('sessions/'+data.session);},button,'Conversation opened.');return;}
  if(data.source){void mutation(async()=>{state.source=(await api('sources/'+encodeURIComponent(data.source))).source;},button,'Source opened.');return;}
  if(data.document){void mutation(()=>loadDocuments(data.document),button,'Document opened.');return;}
  if(data.page){state.docPage=Number(data.page);render();return;}
  if(data.room){void mutation(()=>loadRoom(data.room),button,'Room opened.');return;}
  if(data.feature){
    if(!state.features||featureLimit(data.feature))return;
    const feature=data.feature;
    void mutation(async()=>{
      state.features=await api('features',json({patch:{[feature]:!state.features.features[feature]},expectedRevision:state.features.revision}));
      if(feature==='liveActivity'||feature==='activityRecording'){
        if(!state.features.features.liveActivity){state.live=false;state.events=[];state.replayId=null;state.replayExpired=false;state.cursor=undefined;state.journalId=undefined;}
        else state.live=true;
        void refresh();
      }
    },button,'Feature setting saved.');return;
  }
  if(data.roomAction){
    const kind=data.roomAction;
    const payload=kind==='ack-message'||kind==='ack-artifact'?{kind:'ack',targetType:kind.slice(4),targetId:data.id,...(data.sha256?{sha256:data.sha256}:{})}:
      kind==='accept'?{kind,artifactId:data.id}:{kind,taskId:data.id,revision:Number(data.revision)};
    void mutation(()=>roomWrite(payload),button);return;
  }
  if(data.lessonAction){void mutation(()=>lessonWrite(data.id,{kind:data.lessonAction}),button);return;}
  if(data.lessonFrom){state.lessonFrom=data.lessonFrom;openView('learning');return;}
  if(!data.action)return;
  if(data.action.startsWith('copy-')){
    if(data.action==='copy-pack'&&local){
      const pack=state.context;
      if(!pack?.markdown)return;
      void api('project-policy').then(result=>{
        installPolicy(result);
        if(state.context!==pack){render(true);status('Project controls changed. Build a fresh context pack.',true);return;}
        return clipboard(pack.markdown);
      }).catch(failure=>status(failure.message,true));
      return;
    }
    const host=arr(state.integrations?.agents).find(item=>item.id===data.host);
    const current=displayEvent();
    const checkpoint=arr(state.session?.checkpoints).find(item=>item.id===data.checkpoint);
    const copies={
      'copy-resume':checkpoint?JSON.stringify({tool:'session_resume',arguments:{sessionId:state.session.session.id,checkpointId:checkpoint.id,sha256:checkpoint.sha256,key:crypto.randomUUID()}},null,2):null,
      'copy-host':host?.config?.content,'copy-command':host?.command,'copy-diagnostics':state.integrations?.diagnostics,
      'copy-project-command':'shadow-brain project workspace .','copy-pack':state.context?.markdown,
      'copy-memory':state.memory?.memory?.content??arr(state.graph?.nodes).find(node=>node.id===state.picked)?.snippet,
      'copy-event':current?JSON.stringify(current,null,2):null,
    };
    void clipboard(copies[data.action]).catch(failure=>status(failure.message,true));return;
  }
  switch(data.action){
    case 'managed-skill-preview':void mutation(async()=>{state.managedSkillPlan=await api('managed-skills/preview',json({id:data.id,action:data.kind}));},button,'Review the exact skill paths before applying.');break;
    case 'managed-skill-cancel':state.managedSkillPlan=null;render(true);break;
    case 'managed-skill-apply':void mutation(async()=>{const plan=state.managedSkillPlan;if(!plan||arr(plan.conflicts).length)return;
      const result=await api('managed-skills/apply',json({id:plan.skill.id,action:plan.action,planHash:plan.planHash}));
      state.managedSkillPlan=null;state.managedSkills=await api('managed-skills');delete state.errors.managedSkills;
      return 'Managed skill '+result.finalState+'. '+result.hostRefreshNote;},button);break;
    case 'download-example':{
      const examples={
        knowledge:{schemaVersion:1,kind:'knowledge',title:'Project notes',records:[{title:'Build command',content:'Run the build before release.',source:'README.md'}]},
        transcript:{schemaVersion:1,kind:'transcript',title:'Review discussion',messages:[{role:'user',content:'Preserve Unicode.'},{role:'assistant',content:'The proposed constraint is to preserve Unicode.'}]},
        simple:{messages:[{role:'user',content:'Preserve Unicode.'}]}
      };
      if(!Object.hasOwn(examples,data.example))break;
      const url=URL.createObjectURL(new Blob([JSON.stringify(examples[data.example],null,2)+'\n'],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='shadow-brain-'+data.example+'-example.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;
    }
    case 'native-connect':void mutation(async()=>{invalidateNativeRequest();state.nativeConnection=await api('sessions/codex/connect',{...json({}),timeoutMs:30000});await refreshNativeChats(true);},button,'Read-only native connection opened.');break;
    case 'native-disconnect':void mutation(async()=>{invalidateNativeRequest();nativeReload=false;state.nativeConnection=await api('sessions/codex/disconnect',json({}));state.nativeThreads=null;state.nativeThread=null;state.nativeListCursor=null;state.nativeThreadCursor=null;},button,'Native connection closed.');break;
    case 'native-refresh':void refreshNativeChats(true);break;
    case 'native-archive':invalidateNativeRequest();state.nativeArchived=!state.nativeArchived;state.nativeListCursor=null;state.nativeThreads=null;state.nativeThread=null;state.nativeThreadCursor=null;void refreshNativeChats(true);break;
    case 'native-next':invalidateNativeRequest();state.nativeListCursor=data.cursor;state.nativeThread=null;state.nativeThreadCursor=null;void refreshNativeChats(true);break;
    case 'native-first':invalidateNativeRequest();state.nativeListCursor=null;state.nativeThread=null;state.nativeThreadCursor=null;void refreshNativeChats(true);break;
    case 'native-earlier':void mutation(async()=>{invalidateNativeRequest();state.nativeThreadCursor=data.cursor;state.nativeThread=await api('sessions/codex/threads/'+encodeURIComponent(state.nativeThread.thread.id)+'?cursor='+encodeURIComponent(data.cursor),{timeoutMs:15000});nativeTimer=setTimeout(()=>void refreshNativeChats(),10000);},button,'Earlier original history opened.');break;
    case 'native-import':void mutation(async()=>{const result=await hubWrite('sessions/codex/threads/'+encodeURIComponent(state.nativeThread.thread.id)+'/import',{sha256:state.nativeThread.sha256,...(state.nativeThreadCursor?{cursor:state.nativeThreadCursor}:{})});state.session=result;state.sessionBefore=null;state.sessionCheckpoint=null;await refreshSessions();},button,'Original history page saved as a project snapshot.');break;
    case 'session-checkpoint-open':void mutation(async()=>{state.sessionCheckpoint=(await api('sessions/'+state.session.session.id+'/checkpoints/'+data.checkpoint)).checkpoint;},button,'Checkpoint opened.');break;
    case 'session-policy':state.policySelection=data.sessionPolicy;openView('setup');break;
    case 'session-older':void mutation(async()=>{state.sessionBefore=data.before;await refreshSessions();},button,'Earlier messages loaded.');break;
    case 'session-latest':void mutation(async()=>{state.sessionBefore=null;await refreshSessions();},button,'Latest messages loaded.');break;
    case 'session-status':void mutation(async()=>{state.session=await hubWrite('sessions/'+state.session.session.id+'/actions',{kind:'status',status:data.status,expectedRevision:state.session.session.revision});await refreshSessions();},button,'Reported status saved.');break;
    case 'session-resume':void mutation(async()=>{const cp=arr(state.session.checkpoints).find(item=>item.id===data.checkpoint);if(!cp)throw new Error('Choose a saved checkpoint.');state.sessionBefore=null;state.sessionCheckpoint=null;state.session=await hubWrite('sessions/'+state.session.session.id+'/resume',{checkpointId:cp.id,sha256:cp.sha256});await refreshSessions();},button,'New portal session created from this checkpoint.');break;
    case 'import-session':void mutation(async()=>{if(!state.source)throw new Error('Choose a reviewed transcript.');state.session=await hubWrite('sessions/import',{sourceId:state.source.id});openView('sessions');await refreshSessions();},button,'Reviewed conversation snapshot opened.');break;
    case 'source-evidence':void mutation(async()=>{state.evidence=await api('memory-evidence?'+new URLSearchParams({memoryId:data.memory}));if(state.view!=='knowledge')openView('knowledge');},button,'Source checked.');break;
    case 'close-evidence':state.evidence=null;render(true);break;
    case 'toggle-feedback':void mutation(async()=>{state.feedback=await api('project-feedback',json({kind:'toggle',enabled:!state.feedback.enabled,expectedRevision:state.feedback.revision}));},button,'Learning preference saved.');break;
    case 'remove-feedback':void mutation(async()=>{state.feedback=await api('project-feedback',json({kind:'remove',id:data.feedback,expectedRevision:state.feedback.revision}));},button,'Feedback removed.');break;
    case 'refresh':void refresh(true);break;
    case 'refresh-room':void mutation(async()=>{await refreshHub();if(state.room)await loadRoom(state.room.room.id);},button,'Room refreshed.');break;
    case 'graph':case 'trace':
      state.graphMode=data.action;state.listing=false;state.pulseIds=[];render();$('main').querySelector('[data-action="'+data.action+'"]')?.focus();break;
    case 'node-list':{
      state.listing=!state.listing;button.setAttribute('aria-expanded',String(state.listing));
      const target=$('node-list');target.hidden=!state.listing;syncGraphControls();drawGraph();if(state.listing)$('graph-search')?.focus();break;
    }
    case 'clear-graph-search':void findGraphMemories('');$('graph-search')?.focus();break;
    case 'graph-zoom-in':if(button.getAttribute('aria-disabled')!=='true')zoomGraph(1);break;
    case 'graph-zoom-out':if(button.getAttribute('aria-disabled')!=='true')zoomGraph(-1);break;
    case 'graph-fit':zoomGraph('fit');break;
    case 'clear-focus':state.focus=false;renderInspector();drawGraph();$('main').querySelector('[data-action=graph]')?.focus({preventScroll:true});break;
    case 'pause':state.motionPaused=!state.motionPaused;state.pulseIds=[];updateOverviewLive();break;
    case 'inspect-latest':state.inspector='event';renderInspector();break;
    case 'live':state.replayId=null;state.replayExpired=false;renderChrome();updateOverviewLive();$('replay')?.focus({preventScroll:true});break;
    case 'open-memory':void inspectApprovedMemory(data.memory).catch(failure=>status(failure.message,true));break;
    case 'apply-skill':void mutation(async()=>{
      if(!state.skill?.planHash||!state.skillInput)throw new Error('Preview a project skill before applying it.');
      state.skill={...await api('project-skill-apply',json({...state.skillInput,expectedPlanHash:state.skill.planHash})),applied:true};
    },button,'Reviewed project skill applied.');break;
    case 'review-page':void mutation(async()=>{
      const id=state.documents?.document?.id;
      if(!id)throw new Error('Choose a document page first.');
      state.documents=await hubWrite('hub/documents/'+encodeURIComponent(id)+'/review',{page:state.docPage,decision:data.decision});
      return afterSave(refreshHub,refreshGraph);
    },button,data.decision==='approve'?'Page approved and added to project memory.':'Page rejected.');break;
  }
}
function handleSubmit(event){
  const target=event.target;
  if(target.id==='graph-find-form'){
    event.preventDefault();
    void findGraphMemories(field(new FormData(target),'query'));return;
  }
  const kind=target.dataset.form;
  if(!kind)return;
  event.preventDefault();
  const form=new FormData(target,event.submitter),button=event.submitter;
  const tasks={
    'policy-context':()=>saveProjectPolicy({kind:'set-context-limits',context:{maxTokens:Number(form.get('maxTokens')),maxEntries:Number(form.get('maxEntries'))}}),
    'policy-role':()=>saveProjectPolicy({kind:'set-session-role',sessionId:target.dataset.id,role:field(form,'role')||null}),
    'native-export':async()=>{const file=form.get('export');if(!(file instanceof File)||!file.size)throw new Error('Choose a native export.');if(file.size>2*1024*1024)throw new Error('Choose an export smaller than 2 MiB.');const query=new URLSearchParams({tool:field(form,'tool'),name:file.name,key:crypto.randomUUID()});state.session=await api('sessions/native?'+query,{method:'POST',body:file,headers:{'Content-Type':file.name.endsWith('.zip')?'application/zip':'application/octet-stream'},timeoutMs:15000});state.sessionBefore=null;state.sessionCheckpoint=null;await refreshSessions();},
    'session-open':async()=>{state.sessionBefore=null;state.sessionCheckpoint=null;state.session=await hubWrite('sessions',{title:field(form,'title'),goal:field(form,'goal')});await refreshSessions();},
    'session-note':async()=>{state.session=await hubWrite('sessions/'+state.session.session.id+'/actions',{kind:'message',role:'note',text:field(form,'text'),expectedRevision:state.session.session.revision});await refreshSessions();},
    'session-checkpoint':async()=>{const input={kind:'checkpoint',summary:field(form,'summary'),expectedRevision:state.session.session.revision};for(const name of ['decisions','completed','nextSteps','evidence'])input[name]=field(form,name).split(/\r?\n/).map(item=>item.trim()).filter(Boolean);state.session=await hubWrite('sessions/'+state.session.session.id+'/actions',input);await refreshSessions();},
    teach:async()=>{
      state.teachDraft=field(form,'text');
      const save=form.get('mode')==='save';
      state.source=(await api(save?'sources/remember':'sources?name=My-notes.txt',{method:'POST',body:state.teachDraft,headers:{'Content-Type':'text/plain'},timeoutMs:30000})).source;
      await afterSave(async()=>{state.sources=await api('sources');},...(save?[refreshGraph]:[]));
    },
    'source-upload':async()=>{
      const file=form.get('source');if(!(file instanceof File)||!file.size)throw new Error('Choose a text, Markdown or JSON file.');
      if(file.size>1024*1024)throw new Error('Choose a file smaller than 1 MiB.');
      state.source=(await api('sources?'+new URLSearchParams({name:file.name}),{method:'POST',body:file,headers:{'Content-Type':file.name.toLowerCase().endsWith('.json')?'application/json':'text/plain'}})).source;
      state.sources=await api('sources');
    },
    'source-review':async()=>{
      if(!state.source)throw new Error('Choose a source first.');
      const decision=field(form,'decision');
      const input={itemId:target.dataset.item,decision,...(decision==='approve'?{title:field(form,'title'),text:field(form,'text'),category:field(form,'category')}: {})};
      state.source=(await hubWrite('sources/'+state.source.id+'/review',input)).source;
      return afterSave(async()=>{state.sources=await api('sources');},refreshGraph);
    },
    feedback:async()=>{
      state.feedback=await api('project-feedback',json({kind:'upsert',memoryId:field(form,'memoryId'),task:field(form,'task'),rating:field(form,'rating'),reason:field(form,'reason'),expectedRevision:state.feedback.revision}));
    },
    context:async()=>{
      const input={projectId:state.project,query:field(form,'query'),tokenBudget:Number(form.get('tokenBudget')),profile:field(form,'profile'),expandRelated:form.has('expandRelated')};
      state.contextInput=input;
      if(form.get('compare')==='yes'){state.comparison=await api('context-compare',json(input));state.context=state.comparison[input.profile];}
      else {state.context=await api('context',json(input));state.comparison=null;}
    },
    upload:async()=>{
      const pdf=form.get('pdf');
      if(!(pdf instanceof File)||!pdf.size)throw new Error('Choose a PDF to upload.');
      if(state.hub?.limits?.pdfBytes&&pdf.size>state.hub.limits.pdfBytes)throw new Error('The PDF exceeds this workspace’s upload limit.');
      state.documents=await api('hub/documents?'+new URLSearchParams({name:pdf.name}),{method:'POST',body:pdf,headers:{'Content-Type':'application/pdf'},timeoutMs:30000});
      state.docPage=arr(state.documents.pages)[0]?.page??1;
      return afterSave(refreshHub);
    },
    knowledge:async()=>{
      const input={title:field(form,'title'),content:field(form,'content')};
      const source=field(form,'source');if(source)input.source=source;
      await api('project-knowledge',json(input));return afterSave(refreshGraph);
    },
    skill:async()=>{
      const input={requirement:field(form,'requirement'),target:field(form,'target')};
      const name=field(form,'name'),knowledge=field(form,'knowledge');
      if(name)input.name=name;if(knowledge)input.knowledge=knowledge;
      state.skill=await api('project-skill-preview',json(input));state.skillInput=input;
    },
    room:async()=>{state.room=await hubWrite('hub/rooms',{goal:field(form,'goal')});return afterSave(refreshHub);},
    message:async()=>{const replyTo=field(form,'replyTo');await roomWrite({kind:'message',type:field(form,'type'),text:field(form,'text'),...(replyTo?{replyTo}:{})});},
    task:()=>roomWrite({kind:'task',title:field(form,'title')}),
    artifact:async()=>{
      const taskId=field(form,'taskId'),task=arr(state.room?.tasks).find(item=>item.id===taskId);
      if(!task)throw new Error('Choose a claimed task.');
      await roomWrite({kind:'artifact',taskId,revision:task.revision,path:field(form,'path')});
    },
    outcome:()=>{const artifactId=field(form,'artifactId');return roomWrite({kind:'outcome',taskId:field(form,'taskId'),result:field(form,'result'),check:field(form,'check'),evidence:field(form,'evidence'),...(artifactId?{artifactId}:{})});},
    lesson:async()=>{const {lesson}=await hubWrite('hub/lessons',{outcomeId:field(form,'outcomeId'),title:field(form,'title'),text:field(form,'text')});if(lesson)state.hub={...state.hub,lessons:[...arr(state.hub?.lessons),lesson]};state.lessonFrom=null;return afterSave(refreshHub);},
    evaluate:()=>lessonWrite(target.dataset.id,{kind:'evaluate',baseline:form.has('baseline'),candidate:form.has('candidate'),control:form.has('control'),evidence:field(form,'evidence')}),
  };
  const operation=tasks[kind];
  if(operation)void mutation(operation,button,kind==='teach'?(form.get('mode')==='save'?'Added to project memory. Try a related question in Context.':'Notes organized. Review each part before saving.'):kind==='source-upload'?'Source ready for review.':kind==='source-review'?'Review saved.':kind==='upload'?'PDF intake recorded.':kind==='context'?'Context pack assembled.':'Saved.');
}
`;
