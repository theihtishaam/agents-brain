export const BRAIN_HUB_GRAPH = String.raw`
const tones={project:'124,233,232',memory:'172,199,255',agent:'234,172,249',measured:'124,233,232',reported:'250,208,140'};
let graphSurface=null;
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function hash(id){let value=2166136261;for(const char of id)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;}
function mountGraph(){
  const canvas=$('brain-canvas'),stage=$('brain-stage');
  if(!canvas||canvas.hidden||!stage)return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const surface={canvas,stage,ctx,width:0,height:0,raf:0,observer:null,points:new Map(),edges:[],snapshot:undefined,counts:{}};
  graphSurface=surface;
  surface.observer=new ResizeObserver(()=>resizeGraph(surface));
  surface.observer.observe(stage);
  resizeGraph(surface);
  function hit(event){
    const box=canvas.getBoundingClientRect();
    const x=event.clientX-box.left,y=event.clientY-box.top;
    let best=null,distance=16;
    for(const point of surface.points.values()){
      const d=Math.hypot(x-point.x,y-point.y);
      if(d<distance){best=point;distance=d;}
    }
    return best;
  }
  canvas.addEventListener('pointermove',event=>{
    const point=hit(event);
    canvas.style.cursor=point?'pointer':'default';
    const caption=$('node-caption');
    if(caption&&point){caption.hidden=false;caption.textContent=point.kind==='agent'?hostName(point.label):point.label;}
    else syncGraphControls();
  });
  canvas.addEventListener('pointerleave',syncGraphControls);
  canvas.addEventListener('click',event=>{const point=hit(event);if(point)void chooseMemory(point.id);});
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
  surface.width=size.width;surface.height=size.height;surface.snapshot=undefined;
  canvas.width=Math.round(size.width*dpr);
  canvas.height=Math.round(size.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawGraph();
}
function brainFrame(width,height){return {x:width*.50,y:height*.51,rx:Math.min(width*.318,height*.76),ry:height*.42};}
function drawOutline(ctx,{x,y,rx,ry}){
  ctx.save();ctx.translate(x,y);ctx.rotate(-.19);ctx.scale(rx,ry);
  ctx.beginPath();ctx.moveTo(0,-.82);
  ctx.bezierCurveTo(-.26,-1.12,-.68,-.95,-.78,-.65);ctx.bezierCurveTo(-1.07,-.56,-1.14,-.11,-.97,.09);
  ctx.bezierCurveTo(-1.09,.45,-.80,.80,-.57,.80);ctx.bezierCurveTo(-.39,1.03,-.11,.96,0,.83);
  ctx.bezierCurveTo(.14,.97,.42,.94,.56,.76);ctx.bezierCurveTo(.89,.77,1.10,.48,.99,.16);
  ctx.bezierCurveTo(1.15,-.09,1.07,-.44,.85,-.57);ctx.bezierCurveTo(.76,-.87,.31,-1.06,0,-.82);ctx.closePath();
  ctx.restore();stroke(ctx,'119,157,206',.19,1);
}
function graphPoints(width,height){
  const nodes=arr(state.graph?.nodes),anchors=nodes.filter(node=>node.kind!=='memory');
  const memories=nodes.filter(node=>node.kind==='memory').sort((a,b)=>hash(a.id)-hash(b.id));
  const {x:cx,y:cy,rx,ry}=brainFrame(width,height);
  const points=new Map();
  function point(node,x,y,depth=1){points.set(node.id,{...node,x,y,depth});}
  for(const kind of ['project','agent']){
    const subset=anchors.filter(node=>node.kind===kind);
    subset.forEach((node,i)=>{
      const t=(i+1)/(subset.length+1),sign=kind==='project'?-1:1;
      point(node,cx+sign*(rx*1.01+8*Math.sin(i*2.4)),height*.12+height*.75*t);
    });
  }
  const golden=Math.PI*(3-Math.sqrt(5));
  memories.forEach((node,i)=>{
    const random=rand(hash(node.id)),side=i%2===0?-1:1;
    const count=Math.ceil((memories.length-(i%2))/2),ordinal=Math.floor(i/2);
    const angle=ordinal*golden+(side<0?.55:1.71)+(random()-.5)*.10;
    const r=Math.sqrt((ordinal+.55)/count);
    const x=side*.47+Math.cos(angle)*r*.45,y=Math.sin(angle)*r*.88;
    const projectedX=x*.982+y*.19,projectedY=y*.982-x*.19;
    point(node,cx+projectedX*rx,cy+projectedY*ry,.56+random()*.44);
  });
  return points;
}
function displayEvent(){return state.events.find(event=>event.id===state.replayId)??state.events.at(-1);}
function graphEventPath(event,surface){
  const {width,height,points}=surface;
  const from=points.get('project:'+event.projectId),end=points.get('agent:'+event.agent);
  if(!from||!end)return null;
  const reverse=event.kind==='tool-start'||event.kind==='session-start';
  return reverse?[end,{x:width*.51,y:height*.18},{x:width*.52,y:height*.69},from]:
    [from,{x:width*.47,y:height*.73},{x:width*.49,y:height*.18},end];
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
  }
  const {points,edges}=surface;
  const current=state.focus?state.picked:null;
  const connected=new Set(current?[current]:[]);
  if(current)for(const edge of edges){
    if(edge.source===current)connected.add(edge.target);
    if(edge.target===current)connected.add(edge.source);
  }
  ctx.clearRect(0,0,width,height);
  if(points.size)drawOutline(ctx,brainFrame(width,height));
  for(const edge of edges){
    const a=points.get(edge.source),b=points.get(edge.target);
    const active=current&&(edge.source===current||edge.target===current);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+(a.x-b.x)*.15,b.x,b.y);
    const color=edge.kind==='belongs-to'?tones.project:edge.kind==='recorded-by'?tones.agent:'241,200,138';
    if(active){stroke(ctx,color,.22,4.5);stroke(ctx,color,.96,1.45);}
    else stroke(ctx,color,current?.08:edge.kind==='recorded-by'?.46:.52,.84);
  }
  for(const point of points.values()){
    const active=point.id===current,color=tones[point.kind]??tones.memory;
    const alpha=(current&&!connected.has(point.id)?.31:1)*point.depth;
    const r=point.kind==='memory'?(points.size>70?2.8:4.1):5.2;
    dot(ctx,point.x,point.y,active?15:r+5,color,.13*alpha);
    dot(ctx,point.x,point.y,active?4.5:r,color,.92*alpha);
    if(active||point.kind!=='memory'){
      ctx.beginPath();ctx.arc(point.x,point.y,active?10:8,0,Math.PI*2);stroke(ctx,color,.68*alpha,.9);
    }
    if(point.kind!=='memory'&&width>510&&(active||surface.counts[point.kind]<=11))labelPoint(ctx,point,point.kind==='agent'?hostName(point.label):point.label,point.kind==='project'?-1:1,color,width,alpha);
  }
  const age=performance.now()-state.motionStarted;
  const animate=!document.hidden&&!reduced.matches&&!state.motionPaused&&!state.replayId&&state.live&&state.connection==='reachable'&&state.pulseIds.length&&age<1500;
  const traceEvents=current?[]:animate?state.events.filter(event=>state.pulseIds.includes(event.id)):
    state.replayId?[displayEvent()].filter(Boolean):[];
  const routes=traceEvents.map(event=>({event,path:graphEventPath(event,surface)})).filter(route=>route.path);
  routes.forEach(({event,path},index)=>{
    const [a,b,c,d]=path,color=tones[event.source]??tones.reported;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(b.x,b.y,c.x,c.y,d.x,d.y);
    stroke(ctx,color,.19,4.2);stroke(ctx,color,.81,1.25);
    const t=animate?Math.max(0,Math.min(1,age/1310-index*.055)):.58,u=1-t;
    const x=u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*d.x;
    const y=u**3*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t**3*d.y;
    dot(ctx,x,y,8,color,.19);dot(ctx,x,y,4,color,.52);dot(ctx,x,y,1.9,'237,255,255',1);
  });
  const graphEvent=$('graph-event');
  if(graphEvent){
    const event=traceEvents.at(-1),text=event?evidence(event)+' · '+hostName(event.agent)+(routes.length?'':' · journal only'):'';
    if(graphEvent.textContent!==text)graphEvent.textContent=text;
  }
  canvas.dataset.nodes=String(points.size);canvas.dataset.edges=String(edges.length);
  canvas.dataset.pulses=String(routes.length);canvas.dataset.frame=animate&&routes.length?String(Math.round(age)):'static';
  if(animate&&routes.length)surface.raf=requestAnimationFrame(drawGraph);
}
function syncGraphControls(){
  const label=$('node-caption'),point=arr(state.graph?.nodes).find(node=>node.id===state.picked);
  if(label){label.hidden=!state.focus||!point||state.listing;label.textContent=point?.label??'';}
  const clear=$('clear-focus');if(clear)clear.hidden=!state.focus;
  $('brain-stage')?.querySelectorAll('[data-node]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.node===state.picked&&state.focus)));
}
`;
