export const BRAIN_HUB_GRAPH = String.raw`
const tones={project:'124,233,232',memory:'172,199,255',agent:'234,172,249',measured:'124,233,232',reported:'250,208,140'};
let graphSurface=null;
function rand(seed){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function hash(id){let value=2166136261;for(const char of id)value=Math.imul(value^char.charCodeAt(0),16777619);return value>>>0;}
function backdrop(){
  const random=rand(81079),golden=Math.PI*(3-Math.sqrt(5)),points=[],links=[],fibers=[];
  for(const side of [-1,1]){
    for(let i=0;i<370;i++){
      const y=1-2*(i+.5)/370,theta=i*golden+(random()-.5)*.24;
      const equator=Math.sqrt(1-y*y),radius=i%4===0?.34+.53*random():.78+.22*Math.pow(random(),.55);
      const fold=1+.071*Math.sin(6*theta+3*y)+.04*Math.cos(11*y-theta);
      points.push([side*(.345+.64*Math.cos(theta)*radius*fold)*equator+.055*y,.98*y*radius-.04*side,.76*equator*Math.sin(theta)*radius*fold]);
    }
  }
  const keys=new Set();
  for(let i=0;i<points.length;i++){
    const p=points[i],near=[[-1,Infinity],[-1,Infinity],[-1,Infinity]];
    for(let j=0;j<points.length;j++){
      if(i===j)continue;
      const q=points[j],d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;
      if(d>=near[2][1])continue;
      let k=2;while(k>0&&d<near[k-1][1]){near[k]=near[k-1];k--;}
      near[k]=[j,d];
    }
    if(i%4===0)near.push([Math.floor(random()*points.length),0]);
    for(const [j] of near){
      if(i===j)continue;
      const tag=Math.min(i,j)*points.length+Math.max(i,j);
      if(!keys.has(tag)){keys.add(tag);links.push([i,j]);}
    }
  }
  for(let index=0;index<34;index++){
    const side=index%2?1:-1,angle=index*golden;
    fibers.push(Array.from({length:31},(_,i)=>{
      const t=i/30,y=.99*Math.cos(t*Math.PI),equator=Math.sin(t*Math.PI);
      const theta=angle+Math.sin(t*4.8+index*.7)*.75+t*.72;
      return [side*(.34+.60*Math.cos(theta))*equator+.055*y,y*.98-.04*side,.73*equator*Math.sin(theta)];
    }));
  }
  return {points,links,fibers};
}
const topology=backdrop();
function mountGraph(){
  const canvas=$('brain-canvas'),stage=$('brain-stage');
  if(!canvas||canvas.hidden||!stage)return;
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const surface={canvas,stage,ctx,width:0,height:0,dpr:1,raf:0,observer:null,background:document.createElement('canvas'),points:new Map()};
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
    if(caption&&point){caption.hidden=false;caption.textContent=point.label;}
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
  const {stage,canvas,ctx,background}=surface;
  const size=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,1.75);
  if(!size.width||!size.height)return;
  surface.width=size.width;surface.height=size.height;surface.dpr=dpr;
  canvas.width=background.width=Math.round(size.width*dpr);
  canvas.height=background.height=Math.round(size.height*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawBackdrop(surface);
  drawGraph();
}
function drawBackdrop(surface){
  const {width,height,background,dpr}=surface,ctx=background.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const cx=width*.5,cy=height*.52,rx=Math.min(width*.43,height*.84),ry=height*.44;
  const sy=Math.sin(-.32),co=Math.cos(-.32),sp=Math.sin(.21),cp=Math.cos(.21),sr=Math.sin(-.24),cr=Math.cos(-.24);
  function project([x,y,z]){
    const rxp=x*co+z*sy,rz=z*co-x*sy,ryp=y*cp-rz*sp;
    const depth=y*sp+rz*cp,scale=1+depth*.18;
    return {x:cx+(rxp*cr*rx-ryp*sr*ry)*scale,y:cy+(rxp*sr*rx+ryp*cr*ry)*scale,depth};
  }
  ctx.beginPath();ctx.ellipse(cx,cy,rx*1.02,ry*1.06,-.2,0,Math.PI*2);
  ctx.ellipse(cx,cy,rx*1.10,ry*.42,-.12,0,Math.PI*2);ctx.setLineDash([2,6]);stroke(ctx,'118,162,219',.33,.8);ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(cx-rx-11,cy);ctx.lineTo(cx+rx+11,cy);ctx.moveTo(cx,cy-ry-11);ctx.lineTo(cx,cy+ry+11);stroke(ctx,'113,152,198',.12,.8);
  for(const fiber of topology.fibers){
    const points=fiber.map(project);ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length-1;i++){
      const p=points[i],q=points[i+1];ctx.quadraticCurveTo(p.x,p.y,(p.x+q.x)/2,(p.y+q.y)/2);
    }
    ctx.lineTo(points.at(-1).x,points.at(-1).y);stroke(ctx,'155,202,255',points[15].depth>.14?.32:.12,.63);
  }
  const points=topology.points.map(project);
  for(let band=0;band<4;band++){
    ctx.beginPath();
    for(let index=0;index<topology.links.length;index++){
      const [a,b]=topology.links[index],p=points[a],q=points[b];
      if(Math.min(3,Math.max(0,Math.floor(((p.depth+q.depth)/2+.83)*2.4)))!==band)continue;
      ctx.moveTo(p.x,p.y);
      if(index%3===0)ctx.quadraticCurveTo((p.x+q.x)/2+(q.y-p.y)*.08,(p.y+q.y)/2+(p.x-q.x)*.08,q.x,q.y);
      else ctx.lineTo(q.x,q.y);
    }
    stroke(ctx,band===3?'171,216,255':'147,187,245',[.11,.17,.25,.36][band],.59);
  }
  points.forEach((p,i)=>{
    const bright=p.depth>.16&&i%3===0;
    dot(ctx,p.x,p.y,bright?1.18:.65,bright?'206,238,255':i%11===0?'237,181,245':'146,203,252',bright?.73:.46);
  });
}
function graphPoints(width,height){
  const nodes=arr(state.graph?.nodes),anchors=nodes.filter(node=>node.kind!=='memory');
  const memories=nodes.filter(node=>node.kind==='memory');
  const cx=width*.5,cy=height*.51,rx=Math.min(width*.32,height*.68),ry=height*.35;
  const points=new Map();
  function point(node,x,y){points.set(node.id,{...node,x,y});}
  for(const kind of ['project','agent']){
    const subset=anchors.filter(node=>node.kind===kind);
    subset.forEach((node,i)=>{
      const t=(i+1)/(subset.length+1),sign=kind==='project'?-1:1;
      point(node,cx+sign*(rx*.95+10*Math.sin(i*2.4)),height*.12+height*.75*t);
    });
  }
  memories.forEach(node=>{
    const random=rand(hash(node.id));
    const angle=random()*Math.PI*2,r=.14+.85*Math.sqrt(random());
    point(node,cx+rx*Math.cos(angle)*r,cy+ry*Math.sin(angle)*r);
  });
  return points;
}
function displayEvent(){return state.events.find(event=>event.id===state.replayId)??state.events.at(-1);}
function graphEventPath(event,surface){
  const {width,height,points}=surface;
  const project=points.get('project:'+event.projectId),host=points.get('agent:'+event.agent);
  const from=project??{x:width*.29,y:height*.55};
  const end=host??{x:width*.72,y:height*.38};
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
  const {ctx,width,height,background,canvas}=surface;
  surface.points=graphPoints(width,height);
  const {points}=surface;
  const current=state.focus?state.picked:null;
  const connected=new Set(current?[current]:[]);
  const edges=arr(state.graph?.edges);
  if(current)for(const edge of edges){
    if(edge.source===current)connected.add(edge.target);
    if(edge.target===current)connected.add(edge.source);
  }
  ctx.clearRect(0,0,width,height);ctx.globalAlpha=current?.52:1;ctx.drawImage(background,0,0,width,height);ctx.globalAlpha=1;
  for(const edge of edges){
    const a=points.get(edge.source),b=points.get(edge.target);
    if(!a||!b)continue;
    const active=current&&(edge.source===current||edge.target===current);
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo((a.x+b.x)/2,(a.y+b.y)/2+(a.x-b.x)*.15,b.x,b.y);
    const color=edge.kind==='belongs-to'?tones.project:edge.kind==='recorded-by'?tones.agent:'241,200,138';
    if(active){stroke(ctx,color,.22,4.5);stroke(ctx,color,.96,1.45);}
    else stroke(ctx,color,current?.09:edge.kind==='recorded-by'?.39:.48,.84);
  }
  for(const point of points.values()){
    const active=point.id===current,color=tones[point.kind]??tones.memory;
    const alpha=current&&!connected.has(point.id)?.31:1;
    const r=point.kind==='memory'?3.1:5.2;
    dot(ctx,point.x,point.y,active?15:r+5,color,.13*alpha);
    dot(ctx,point.x,point.y,active?4.5:r,color,.92*alpha);
    if(active||point.kind!=='memory'){
      ctx.beginPath();ctx.arc(point.x,point.y,active?10:8,0,Math.PI*2);stroke(ctx,color,.68*alpha,.9);
    }
    if(point.kind!=='memory'&&width>510)labelPoint(ctx,point,point.kind==='agent'?hostName(point.label):point.label,point.kind==='project'?-1:1,color,width,alpha);
  }
  const age=performance.now()-state.motionStarted;
  const animate=!document.hidden&&!reduced.matches&&!state.motionPaused&&!state.replayId&&state.live&&state.connection==='reachable'&&state.pulseIds.length&&age<1500;
  const traceEvents=animate?state.events.filter(event=>state.pulseIds.includes(event.id)):
    state.replayId?[displayEvent()].filter(Boolean):[];
  if(!current)traceEvents.forEach((event,index)=>{
    const [a,b,c,d]=graphEventPath(event,surface),color=tones[event.source]??tones.reported;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(b.x,b.y,c.x,c.y,d.x,d.y);
    stroke(ctx,color,.19,4.2);stroke(ctx,color,.81,1.25);
    const t=animate?Math.max(0,Math.min(1,age/1310-index*.055)):.58,u=1-t;
    const x=u**3*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t**3*d.x;
    const y=u**3*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t**3*d.y;
    dot(ctx,x,y,8,color,.19);dot(ctx,x,y,4,color,.52);dot(ctx,x,y,1.9,'237,255,255',1);
    if(index===traceEvents.length-1&&!points.has('agent:'+event.agent)&&width>510){
      const host=event.kind==='tool-start'||event.kind==='session-start'?a:d;
      dot(ctx,host.x,host.y,3.5,color,.95);labelPoint(ctx,host,hostName(event.agent),1,color,width,1);
    }
  });
  const graphEvent=$('graph-event');
  if(graphEvent){
    const event=!current&&traceEvents.at(-1),text=event?evidence(event)+' · '+hostName(event.agent):'';
    if(graphEvent.textContent!==text)graphEvent.textContent=text;
  }
  canvas.dataset.nodes=String(points.size);canvas.dataset.edges=String(edges.length);
  canvas.dataset.pulses=String(traceEvents.length);canvas.dataset.frame=animate?String(Math.round(age)):'static';
  if(animate&&!current)surface.raf=requestAnimationFrame(drawGraph);
}
function syncGraphControls(){
  const label=$('node-caption'),point=arr(state.graph?.nodes).find(node=>node.id===state.picked);
  if(label){label.hidden=!state.focus||!point||state.listing;label.textContent=point?.label??'';}
  const clear=$('clear-focus');if(clear)clear.hidden=!state.focus;
  $('brain-stage')?.querySelectorAll('[data-node]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.node===state.picked&&state.focus)));
}
`;
