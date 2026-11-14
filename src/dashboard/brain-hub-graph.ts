export const BRAIN_HUB_GRAPH = String.raw`
const tones={project:'124,233,232',memory:'172,199,255',agent:'234,172,249',measured:'124,233,232',reported:'250,208,140'};
const relationColors={supports:'91,209,221',related:'119,165,221',contradicts:'227,175,119',supersedes:'150,154,222'};
const graphMemoryLimit='500';
let graphSurface=null;
const defaultCamera=()=>({scale:1,x:0,y:0});
let graphCamera=defaultCamera();
function graphFinderResults(){
  const search=state.search;
  if(!search)return '<div class="graph-results" id="graph-results">'+list(arr(state.graph?.nodes).map(node=>
    '<li><button class="entry" type="button" data-node="'+esc(node.id)+'" aria-pressed="'+(state.focus&&state.picked===node.id)+'"><strong>'+
    esc(node.kind==='agent'?hostName(node.label):node.label)+'</strong><small class="muted">'+esc(node.kind+(node.category?' · '+node.category:''))+'</small></button></li>').join(''),
    'aria-label="Displayed graph records"')+'</div>';
  const items=arr(search.items);
  return '<div class="graph-results" id="graph-results" aria-busy="'+!!search.loading+'"><p class="small muted graph-search-note" role="status">'+
    esc(search.error??(search.loading?'Searching stored memories…':items.length?fmt(items.length)+' of '+fmt(search.total)+' matches'+(search.truncated?' · bounded inventory':''):'No matching memories in this scope.'))+'</p>'+
    (items.length?list(items.map(item=>'<li><button class="entry" type="button" data-graph-memory="'+esc(item.id)+'" data-graph-project="'+esc(item.project)+
      '"><strong>'+esc(item.title||item.id)+'</strong><small class="muted">'+esc(item.category+' · '+hostName(item.agent)+(item.projectName?' · '+item.projectName:''))+'</small></button></li>').join(''),'aria-label="Stored memory search results"'):'')+'</div>';
}
function graphFinderMarkup(hidden){
  return '<div id="node-list" class="node-list graph-finder" '+(hidden?'hidden':'')+'><form id="graph-find-form" class="graph-find" role="search" aria-label="Find stored memories">'+
    '<label for="graph-search" class="sr-only">Find stored memories in this scope</label><input id="graph-search" name="query" type="search" value="'+esc(state.search?.query)+
    '" placeholder="Search all stored memories" maxlength="180"><button class="btn" type="submit">Search</button>'+action('clear-graph-search','Clear','quiet')+
    '</form>'+graphFinderResults()+'</div>';
}
async function findGraphMemories(query){
  const epoch=state.dataEpoch;
  const search=query?{query,loading:true}:null;
  state.search=search;
  const field=$('graph-search'),results=$('graph-results');
  if(field)field.value=query;
  if(results)results.outerHTML=graphFinderResults();
  if(!search)return;
  try{Object.assign(search,await api('memories'+projectQuery({q:query,limit:'30'})));}
  catch(failure){search.error=failure.message;}
  if(epoch!==state.dataEpoch||state.search!==search)return;
  search.loading=false;
  const result=$('graph-results');
  if(result)result.outerHTML=graphFinderResults();
}
async function focusGraphMemory(id,project){
  const dataEpoch=state.dataEpoch,graphEpoch=++state.graphEpoch;
  const query=projectQuery({limit:graphMemoryLimit,memory:id});
  try{
    const graph=await api('graph'+query);
    if(dataEpoch!==state.dataEpoch||graphEpoch!==state.graphEpoch||state.view!=='overview')return;
    if(!arr(graph.nodes).some(node=>node.memoryId===id&&node.project===project))throw new Error('The memory is no longer available in this scope.');
    state.graphEpoch++;state.graph=graph;state.listing=false;render();
    const details=chooseMemory('memory:'+id);
    $('main').querySelector('[data-inspect=record]')?.focus({preventScroll:true});
    await details;
  }catch(failure){if(dataEpoch===state.dataEpoch&&graphEpoch===state.graphEpoch&&state.view==='overview')status(failure.message,true);}
}
function filterGraph(value){
  if(!['all','project','author','typed'].includes(value))return;
  state.graphFilter=value;
  drawGraph();syncGraphControls();
}
const graphCoordinates=(surface,x,y)=>({x:(x-surface.width/2-graphCamera.x)/graphCamera.scale+surface.width/2,
  y:(y-surface.height/2-graphCamera.y)/graphCamera.scale+surface.height/2});
function boundCamera(surface){
  const dx=(graphCamera.scale-1)*surface.width/2,dy=(graphCamera.scale-1)*surface.height/2;
  graphCamera.x=Math.max(-dx,Math.min(dx,graphCamera.x));
  graphCamera.y=Math.max(-dy,Math.min(dy,graphCamera.y));
}
function zoomGraph(direction){
  if(!graphSurface)return;
  const before=graphCamera.scale;
  const scale=direction==='fit'?1:Math.round(Math.max(1,Math.min(3,before+direction*.5))*10)/10;
  const point=state.focus&&graphSurface.points.get(state.picked);
  if(point){
    const x=point.x-graphSurface.width/2,y=point.y-graphSurface.height/2;
    graphCamera={scale,x:graphCamera.x+x*(before-scale),y:graphCamera.y+y*(before-scale)};
  }else graphCamera.scale=scale;
  boundCamera(graphSurface);drawGraph();syncGraphControls();
}
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function hash(id){let value=2166136261;for(const char of id)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;}
function mountGraph(){
  const canvas=$('brain-canvas'),stage=$('brain-stage');
  if(!canvas||canvas.hidden||!stage)return;
  const ctx=canvas.getContext('2d'),layer=document.createElement('canvas'),layerContext=layer.getContext('2d');
  if(!ctx||!layerContext)return;
  const surface={canvas,stage,ctx,layer,layerContext,width:0,height:0,raf:0,observer:null,
    points:new Map(),edges:[],snapshot:undefined,counts:{},drag:null,layerKey:''};
  graphSurface=surface;
  surface.observer=new ResizeObserver(()=>resizeGraph(surface));
  surface.observer.observe(stage);
  resizeGraph(surface);
  function hit(event){
    const box=canvas.getBoundingClientRect();
    const {x,y}=graphCoordinates(surface,event.clientX-box.left,event.clientY-box.top);
    let best=null,distance=15/graphCamera.scale;
    for(const point of surface.points.values()){
      const d=Math.hypot(x-point.x,y-point.y);
      if(d<distance){best=point;distance=d;}
    }
    return best;
  }
  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.pointerType==='touch'||graphCamera.scale===1)return;
    surface.drag={id:event.pointerId,x:event.clientX,y:event.clientY,
      fromX:graphCamera.x,fromY:graphCamera.y,moved:false};
  });
  canvas.addEventListener('pointermove',event=>{
    const drag=surface.drag;
    if(drag?.id===event.pointerId){
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
      if(drag.moved||Math.hypot(dx,dy)>4){
        if(!drag.moved)canvas.setPointerCapture(event.pointerId);
        drag.moved=true;graphCamera.x=drag.fromX+dx;graphCamera.y=drag.fromY+dy;
        boundCamera(surface);canvas.style.cursor='grabbing';drawGraph();return;
      }
    }
    const point=hit(event);
    canvas.style.cursor=point?'pointer':graphCamera.scale>1?'grab':'default';
    const caption=$('node-caption');
    if(caption&&point){caption.hidden=false;caption.textContent=point.kind==='agent'?hostName(point.label):point.label;}
    else syncGraphControls();
  });
  canvas.addEventListener('pointerleave',()=>{if(!surface.drag?.moved)surface.drag=null;syncGraphControls();});
  canvas.addEventListener('pointercancel',()=>{surface.drag=null;});
  canvas.addEventListener('pointerup',event=>{
    const moved=surface.drag?.moved;surface.drag=null;
    canvas.style.cursor=graphCamera.scale>1?'grab':'default';
    if(moved||event.button!==0)return;
    const point=hit(event);
    if(point)void chooseMemory(point.id);
  });
  syncGraphControls();
}
function unmountGraph(){
  if(!graphSurface)return;
  graphSurface.observer.disconnect();cancelAnimationFrame(graphSurface.raf);graphSurface=null;
}
function stroke(ctx,rgb,alpha,width){ctx.strokeStyle='rgba('+rgb+','+alpha+')';ctx.lineWidth=width;ctx.stroke();}
function dot(ctx,x,y,r,rgb,alpha){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle='rgba('+rgb+','+alpha+')';ctx.fill();}
function resizeGraph(surface){
  if(graphSurface!==surface)return;
  const {stage,canvas,ctx}=surface;
  const size=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.75);
  if(!size.width||!size.height)return;
  surface.width=size.width;surface.height=size.height;surface.snapshot=undefined;boundCamera(surface);
  canvas.width=Math.round(size.width*dpr);
  canvas.height=Math.round(size.height*dpr);
  surface.layer.width=canvas.width;surface.layer.height=canvas.height;
  surface.layerContext.setTransform(dpr,0,0,dpr,0,0);
  surface.layerKey='';
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawGraph();
}
function brainFrame(width,height){return {x:width*.50,y:height*.49,rx:Math.min(width*.34,height*.70),ry:Math.min(height*.42,width*.255)};}
function brainShell(angle){
  const x=Math.cos(angle),y=Math.sin(angle);
  const contour=1+.044*Math.cos(3*angle+.7)+.036*Math.cos(5*angle-.7)+.018*Math.sin(9*angle);
  return {x:x*contour,y:y*contour*(y>0?.91+.12*x:1.02)-.07*x};
}
function brainProjection(frame,x,y,z){
  const tilt=-.16,scale=1+.067*z;
  const across=frame.rx*(x*scale+.10*z),down=frame.ry*(y*scale-.12*z);
  return {x:frame.x+across*Math.cos(tilt)-down*Math.sin(tilt),y:frame.y+across*Math.sin(tilt)+down*Math.cos(tilt)};
}
function shellPath(ctx,frame,depth){
  for(let step=0;step<=112;step++){
    const rim=brainShell(step/112*Math.PI*2);
    const point=brainProjection(frame,rim.x,rim.y,depth);
    if(step===0)ctx.moveTo(point.x,point.y);
    else ctx.lineTo(point.x,point.y);
  }
  ctx.closePath();
}
function drawOutline(ctx,frame){
  const {x,y,rx,ry}=frame;
  const field=ctx.createRadialGradient(x+rx*.22,y-ry*.42,0,x,y,rx*1.1);
  field.addColorStop(0,'rgba(47,123,151,.22)');
  field.addColorStop(.64,'rgba(52,74,132,.13)');
  field.addColorStop(1,'rgba(15,24,47,.06)');
  ctx.beginPath();shellPath(ctx,frame,0);ctx.fillStyle=field;ctx.fill();
  ctx.beginPath();shellPath(ctx,frame,-.74);stroke(ctx,'108,162,215',.19,.7);
  ctx.beginPath();shellPath(ctx,frame,.66);stroke(ctx,'140,193,225',.30,.9);
  // Subtle contour guides give the point volume spatial context.
  ctx.beginPath();
  for(const [angle,depth] of [[-.76,-.22],[.38,.35],[1.24,.57]]){
    const start=brainShell(angle),end=brainShell(angle+Math.PI);
    const a=brainProjection(frame,start.x*.97,start.y*.97,depth);
    const b=brainProjection(frame,-.28,.04,depth);
    const c=brainProjection(frame,.45,-.22,depth);
    const d=brainProjection(frame,end.x*.98,end.y*.98,depth);
    ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(c.x,c.y,b.x,b.y,d.x,d.y);
  }
  stroke(ctx,'135,181,233',.12,.75);
}
function graphPoints(width,height){
  const nodes=arr(state.graph?.nodes),anchors=nodes.filter(node=>node.kind!=='memory');
  const memories=nodes.filter(node=>node.kind==='memory');
  const frame=brainFrame(width,height);
  const points=new Map();
  function point(node,x,y,depth=1){points.set(node.id,{...node,x,y,depth});}
  for(const kind of ['project','agent']){
    const subset=anchors.filter(node=>node.kind===kind);
    subset.forEach((node,i)=>{
      const t=(i+1)/(subset.length+1),sign=kind==='project'?-1:1;
      point(node,frame.x+sign*(frame.rx+Math.max(7,Math.min(32,width*.043))),height*.21+height*.58*t);
    });
  }
  const projected=memories.map(node=>{
    const random=rand(hash(node.id));
    const angle=random()*Math.PI*2,polar=random()*2-1;
    const shell=random()<.40;
    const radius=shell?.87+.13*random():Math.cbrt(random());
    const rim=brainShell(angle),disk=Math.sqrt(1-polar**2)*radius,depth=polar*radius;
    return {node,depth,...brainProjection(frame,rim.x*disk,rim.y*disk,depth)};
  }).sort((left,right)=>left.depth-right.depth);
  for(const node of projected)point(node.node,node.x,node.y,(node.depth+1)/2);
  return points;
}
function displayEvent(){return state.replayId?state.events.find(event=>event.id===state.replayId):state.events.at(-1);}
function graphEventPath(event,surface){
  if(!exchangeKey(event))return null;
  const {width,height}=surface;
  const workspace={x:width*.47,y:height*.67},client={x:width*.92,y:height*.37};
  const controls=[{x:width*.31,y:height*.27},{x:width*.68,y:height*.16}];
  return event.kind==='tool-start'?[client,...controls.reverse(),workspace]:[workspace,...controls,client];
}
function labelPoint(ctx,point,label,side,color,width,alpha){
  ctx.font='600 10.5px system-ui,sans-serif';
  const limit=Math.min(126,width*.20);
  while(ctx.measureText(label).width>limit&&label.length>1)label=label.slice(0,label.endsWith('…')?-2:-1)+'…';
  const pad=6,labelWidth=ctx.measureText(label).width+2*pad;
  const x=Math.max(3,Math.min(width-labelWidth-3,side<0?point.x-12-labelWidth:point.x+12)),y=point.y-9;
  ctx.globalAlpha=alpha;ctx.fillStyle='#111e31';ctx.beginPath();ctx.roundRect(x,y,labelWidth,18,3);ctx.fill();stroke(ctx,color,.43,.7);
  ctx.fillStyle='#ddefff';ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(label,x+pad,y+9);ctx.globalAlpha=1;
}
function drawMemoryLayer(surface,current){
  const {layerContext:ctx,width,height,points,edges}=surface;
  const connected=new Set(current?[current]:[]);
  if(current)for(const edge of edges){
    if(edge.source===current)connected.add(edge.target);
    if(edge.target===current)connected.add(edge.source);
  }
  ctx.clearRect(0,0,width,height);
  ctx.save();ctx.translate(width/2+graphCamera.x,height/2+graphCamera.y);ctx.scale(graphCamera.scale,graphCamera.scale);ctx.translate(-width/2,-height/2);
  if(points.size)drawOutline(ctx,brainFrame(width,height));
  for(const edge of edges){
    const relation=edge.kind==='belongs-to'?'project':edge.kind==='recorded-by'?'author':'typed';
    if(state.graphFilter!=='all'&&relation!==state.graphFilter)continue;
    const a=points.get(edge.source),b=points.get(edge.target);
    const active=current&&(edge.source===current||edge.target===current);
    const isTyped=relation==='typed',depth=(a.depth+b.depth)/2;
    ctx.beginPath();ctx.moveTo(a.x,a.y);
    if(isTyped)ctx.lineTo(b.x,b.y);
    else ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+(a.x-b.x)*.08,b.x,b.y);
    const color=relation==='project'?tones.project:relation==='author'?tones.agent:relationColors[edge.kind]??tones.memory;
    if(active){stroke(ctx,color,.18,4);stroke(ctx,color,.88,1.25);}
    else{
      const alpha=isTyped?.10+depth*.38:state.graphFilter===relation?.16:.022;
      stroke(ctx,color,current?alpha*.12:alpha,isTyped?.38+depth*.46:.57);
    }
  }
  for(const point of points.values()){
    const active=point.id===current,memory=point.kind==='memory';
    const color=memory?(point.depth>.65?'145,230,247':tones.memory):tones[point.kind];
    const alpha=(current&&!connected.has(point.id)?.23:1)*(.35+.65*point.depth);
    const r=memory?(points.size>70?.68+1.12*point.depth:1.7+1.6*point.depth):3.4;
    if(active||point.depth>.68)dot(ctx,point.x,point.y,active?12:r+2.4,color,.15*alpha);
    dot(ctx,point.x,point.y,active?3.5:r,color,.88*alpha);
    if(active||!memory){
      ctx.beginPath();ctx.arc(point.x,point.y,active?8:5.4,0,Math.PI*2);stroke(ctx,color,.62*alpha,.75);
    }
    if(!memory&&width>510&&(active||surface.counts[point.kind]<=11))labelPoint(ctx,point,point.kind==='agent'?hostName(point.label):point.label,point.kind==='project'?-1:1,color,width,alpha);
  }
  ctx.restore();
}
function drawGraph(){
  const surface=graphSurface;
  if(!surface||!surface.width)return;
  if(surface.raf){cancelAnimationFrame(surface.raf);surface.raf=0;}
  const {ctx,width,height,canvas}=surface;
  if(surface.snapshot!==state.graph){
    surface.snapshot=state.graph;
    surface.points=graphPoints(width,height);
    surface.edges=arr(state.graph?.edges).filter(edge=>surface.points.has(edge.source)&&surface.points.has(edge.target));
    surface.counts={};
    for(const point of surface.points.values())surface.counts[point.kind]=(surface.counts[point.kind]??0)+1;
    surface.layerKey='';
  }
  const {points,edges}=surface;
  const current=state.focus?state.picked:null;
  const layerKey=JSON.stringify([current,state.graphFilter,graphCamera]);
  if(surface.layerKey!==layerKey){drawMemoryLayer(surface,current);surface.layerKey=layerKey;}
  ctx.clearRect(0,0,width,height);
  ctx.drawImage(surface.layer,0,0,width,height);
  const age=performance.now()-state.motionStarted;
  const animate=!document.hidden&&!reduced.matches&&!state.motionPaused&&!state.replayId&&state.live&&state.connection==='reachable'&&state.pulseIds.length&&age<1350&&!state.listing;
  const traceEvents=animate?state.events.filter(event=>state.pulseIds.includes(event.id)&&exchangeKey(event)):
    state.replayId?[displayEvent()].filter(Boolean):[];
  // The lower lane represents MCP boundary activity independently of the stored graph.
  const step=animate?age/1350*traceEvents.length:0;
  const currentEvent=traceEvents[Math.floor(step)];
  const path=currentEvent&&graphEventPath(currentEvent,surface);
  if(path){
    const event=currentEvent;
    const [a,b,c,d]=path,color=event.kind==='tool-start'?'104,205,238':event.outcome==='success'?tones.measured:'255,172,182';
    const direction=Math.atan2(d.y-c.y,d.x-c.x);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(b.x,b.y,c.x,c.y,d.x,d.y);
    stroke(ctx,color,.10,7);stroke(ctx,color,.24,3.2);stroke(ctx,color,.88,1.35);
    ctx.save();ctx.translate(d.x,d.y);ctx.rotate(direction);
    ctx.beginPath();ctx.moveTo(-6,-3.1);ctx.lineTo(0,0);ctx.lineTo(-6,3.1);stroke(ctx,color,.92,1.3);ctx.restore();
    const t=animate?step%1:.58,u=1-t;
    const x=u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*d.x;
    const y=u**3*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t**3*d.y;
    dot(ctx,x,y,8,color,.19);dot(ctx,x,y,4,color,.52);dot(ctx,x,y,1.9,'237,255,255',1);
  }
  const graphEvent=$('graph-event');
  if(graphEvent){
    const text=path?exchangeDirection(currentEvent)+' · '+exchangeLabel(currentEvent):'';
    if(graphEvent.textContent!==text)graphEvent.textContent=text;
    graphEvent.hidden=!path||!!current||state.listing;
  }
  canvas.dataset.nodes=String(points.size);canvas.dataset.edges=String(edges.length);
  canvas.dataset.pulses=path?'1':'0';canvas.dataset.frame=animate&&path?String(Math.round(age)):'static';
  if(animate&&path)surface.raf=requestAnimationFrame(drawGraph);
}
function syncGraphControls(){
  const label=$('node-caption'),point=arr(state.graph?.nodes).find(node=>node.id===state.picked);
  if(label){label.hidden=!state.focus||!point||state.listing;label.textContent=point?.label??'';}
  const clear=$('clear-focus');if(clear)clear.hidden=!state.focus;
  const zoom=$('graph-zoom');
  if(zoom)zoom.textContent=Math.round(graphCamera.scale*100)+'%';
  const plus=$('graph-zoom-in'),minus=$('graph-zoom-out');
  // Keep zoom controls focusable at bounds for keyboard continuity.
  plus?.setAttribute('aria-disabled',String(graphCamera.scale>=3));
  minus?.setAttribute('aria-disabled',String(graphCamera.scale<=1));
  $('main').querySelectorAll('[data-graph-filter]').forEach(button=>button.setAttribute('aria-pressed',String(state.graphFilter===button.dataset.graphFilter)));
  $('brain-stage')?.querySelectorAll('[data-node]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.node===state.picked&&state.focus)));
}
`;
