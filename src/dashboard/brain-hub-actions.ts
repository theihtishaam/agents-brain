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
  state.graph=await api('graph'+projectQuery({limit:'140',memory:id}));
  openView('overview');
  await chooseMemory('memory:'+id);
}
function handleClick(event){
  const button=event.target.closest('button');
  if(!button||button.disabled)return;
  const data=button.dataset;
  if(data.view){openView(data.view);return;}
  if(data.project){
    if(!state.pending&&data.project!==state.project){state.project=data.project;resetScope();render();void refresh(true);}
    return;
  }
  if(data.node){void chooseMemory(data.node);return;}
  if(data.inspect){state.inspector=data.inspect;renderInspector();$('inspector').querySelector('[data-inspect="'+data.inspect+'"]')?.focus({preventScroll:true});return;}
  if(data.event){setReplay(state.events.findIndex(item=>item.id===data.event));return;}
  if(data.document){void mutation(()=>loadDocuments(data.document),button,'Document opened.');return;}
  if(data.page){state.docPage=Number(data.page);render();return;}
  if(data.room){void mutation(()=>loadRoom(data.room),button,'Room opened.');return;}
  if(data.feature){
    if(!state.features)return;
    const feature=data.feature;
    void mutation(async()=>{
      state.features=await api('features',json({patch:{[feature]:!state.features.features[feature]},expectedRevision:state.features.revision}));
      if(feature==='liveActivity'||feature==='activityRecording'){
        if(!state.features.features.liveActivity){state.live=false;state.events=[];state.replayId=null;state.cursor=undefined;state.journalId=undefined;}
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
    const host=arr(state.integrations?.agents).find(item=>item.id===data.host);
    const current=displayEvent();
    const copies={
      'copy-host':host?.config?.content,'copy-command':host?.command,'copy-diagnostics':state.integrations?.diagnostics,
      'copy-project-command':'shadow-brain project workspace .','copy-pack':state.context?.markdown,
      'copy-memory':state.memory?.memory?.content??arr(state.graph?.nodes).find(node=>node.id===state.picked)?.snippet,
      'copy-event':current?JSON.stringify(current,null,2):null,
    };
    void clipboard(copies[data.action]).catch(failure=>status(failure.message,true));return;
  }
  switch(data.action){
    case 'refresh':void refresh(true);break;
    case 'refresh-room':void mutation(async()=>{await refreshHub();if(state.room)await loadRoom(state.room.room.id);},button,'Room refreshed.');break;
    case 'graph':case 'trace':
      state.graphMode=data.action;state.listing=false;render();$('main').querySelector('[data-action="'+data.action+'"]')?.focus();break;
    case 'node-list':{
      state.listing=!state.listing;button.setAttribute('aria-expanded',String(state.listing));
      const target=$('node-list');target.hidden=!state.listing;syncGraphControls();if(state.listing)target.querySelector('button')?.focus();break;
    }
    case 'clear-focus':state.focus=false;renderInspector();drawGraph();$('main').querySelector('[data-action=graph]')?.focus({preventScroll:true});break;
    case 'pause':state.motionPaused=!state.motionPaused;state.pulseIds=[];updateOverviewLive();break;
    case 'inspect-latest':state.inspector='event';renderInspector();break;
    case 'live':state.replayId=null;updateOverviewLive();$('replay')?.focus({preventScroll:true});break;
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
  const kind=target.dataset.form;
  if(!kind)return;
  event.preventDefault();
  const form=new FormData(target,event.submitter),button=event.submitter;
  const tasks={
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
  if(operation)void mutation(operation,button,kind==='upload'?'PDF intake recorded.':kind==='context'?'Context pack assembled.':'Saved.');
}
`;
