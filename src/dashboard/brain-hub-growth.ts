export const BRAIN_HUB_GROWTH = String.raw`
let growthDay=null;
function growthContent(){
  const record=state.growth;
  const head='<div class="growth-heading"><h2>Project knowledge</h2>'+view('knowledge','Add knowledge')+'</div>';
  if(state.errors.growth||!record?.memory)return head+empty(state.errors.growth?'Knowledge unavailable':'Reading project memory',state.errors.growth??'Loading saved records.');
  const memories=record.memory,days=arr(memories.days),peak=Math.max(1,...days.map(day=>day.retained));
  const sum=days.reduce((total,day)=>total+day.retained,0);
  const focus=days.find(day=>day.date===growthDay);
  const dayLabel=value=>new Intl.DateTimeFormat(undefined,{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(value+'T12:00:00Z'));
  const bars=days.map(day=>{
    const name=dayLabel(day.date)+' UTC · '+fmt(day.retained)+' retained';
    return '<button type="button" class="growth-day" style="--amount:'+Math.round(100*day.retained/peak)+'%" data-growth-day="'+esc(day.date)+
      '" aria-pressed="'+(focus?.date===day.date)+'" aria-label="'+esc(name)+'" title="'+esc(name)+'"><i></i></button>';
  }).join('');
  const lessons=record.learning,cap=record.context;
  const step=(name,count)=>'<div><dt>'+name+'</dt><dd class="mono">'+(count==null?'—':fmt(count))+'</dd></div>';
  return head+'<div class="growth-section"><span class="small muted">Saved memories</span><div class="growth-total">'+fmt(memories.retained)+'</div>'+
    '<div class="growth-bar-head"><strong>Saved in 14 days</strong><span class="mono">'+fmt(sum)+'</span></div>'+
    '<div class="growth-chart" role="group" aria-label="Retained memories by UTC date saved">'+bars+'</div>'+
    '<div class="growth-axis">'+(days.length?'<span>'+esc(dayLabel(days[0].date))+'</span><span>'+esc(dayLabel(days.at(-1).date))+' UTC</span>':'')+'</div>'+
    '<p class="small muted">'+(focus?esc(dayLabel(focus.date))+' UTC · '+fmt(focus.retained)+' retained':fmt(memories.beforeWindow)+' retained from earlier dates')+
       (memories.undated?' · '+fmt(memories.undated)+' undated':'')+(memories.futureDated?' · '+fmt(memories.futureDated)+' future dated':'')+'</p></div>'+
    '<div class="growth-section"><div class="growth-heading"><h3>Learning</h3>'+view('learning','Review lessons')+'</div>'+
    '<dl class="growth-steps">'+step('Proposed',lessons?.proposed)+step('Evaluated',lessons?.evaluated)+step('Promoted',lessons?.promoted)+'</dl>'+
    (lessons?.rolledBack?'<p class="small muted">'+fmt(lessons.rolledBack)+' rolled back</p>':'')+'</div>'+
    '<div class="growth-section"><h3>Context limit per request</h3><p class="growth-cap mono">'+(cap?fmt(cap.maxTokens)+' <small>est. tokens</small>':'Unavailable')+'</p>'+
    (cap?'<small class="muted">Up to '+fmt(cap.maxEntries)+' entries per request</small>':'')+'</div>';
}
function growthSide(){
  return '<aside class="panel growth-side" id="knowledge-growth" aria-label="Project knowledge growth">'+growthContent()+'</aside>';
}
function updateGrowth(){
  const box=$('knowledge-growth');if(!box)return;
  const markup=growthContent();if(box.dataset.markup===markup)return;
  const day=box.contains(document.activeElement)?document.activeElement?.dataset.growthDay:null;
  box.dataset.markup=markup;box.innerHTML=markup;
  if(day)[...box.querySelectorAll('[data-growth-day]')].find(button=>button.dataset.growthDay===day)?.focus({preventScroll:true});
}
`;
export const BRAIN_HUB_GROWTH_CSS = String.raw`
.observatory{display:grid;grid-template-columns:minmax(0,1fr) clamp(230px,21vw,305px);gap:10px;align-items:stretch;margin-bottom:10px}
.observatory .topology-dock{margin-bottom:0}
.growth-side{display:flex;flex-direction:column;min-width:0;overflow:hidden}
.growth-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}
.growth-side>.growth-heading,.growth-section{padding:14px 16px}
.growth-side>.growth-heading,.growth-section+.growth-section{border-bottom:0;border-top:1px solid var(--border)}
.growth-side>.growth-heading{border-top:0;border-bottom:1px solid var(--border)}
.growth-heading .btn{min-height:26px;padding:3px 7px;font-size:.74rem}
.growth-section{flex:1;align-content:center}
.growth-total{font-size:clamp(2.2rem,3vw,3rem);line-height:1.1;margin:3px 0 9px;color:var(--cyan);font-variant-numeric:tabular-nums;font-weight:730;letter-spacing:-.04em}
.growth-bar-head,.growth-axis{display:flex;justify-content:space-between;align-items:center}
.growth-bar-head{font-size:.78rem}.growth-axis{font-size:.68rem;color:var(--muted);margin:3px 0 5px}
.growth-chart{height:52px;display:flex;gap:2px;align-items:stretch;background:repeating-linear-gradient(0deg,transparent 0 16px,var(--border) 16px 17px)}
.growth-day{height:100%;display:flex;align-items:flex-end;flex:1;min-width:0;padding:0;border:0;border-bottom:1px solid var(--strong);background:transparent;cursor:pointer}
.growth-day i{width:100%;height:var(--amount);background:linear-gradient(0deg,var(--cyan),var(--blue));border-radius:2px 2px 0 0}
.growth-day:is(:hover,:focus-visible,[aria-pressed=true]){outline:1px solid var(--strong);outline-offset:-1px}
.growth-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:10px 0 0}
.growth-steps>div{padding-left:6px;border-left:2px solid var(--strong)}
.growth-steps>div:nth-child(2){border-color:var(--blue)}.growth-steps>div:nth-child(3){border-color:var(--cyan)}
.growth-steps dt,.growth-cap small{font-size:.72rem;color:var(--muted)}.growth-steps dd{font-size:1.12rem;margin:4px 0 0}
.growth-cap{font-size:1.2rem;margin:6px 0 3px}
@media(max-width:1149px){.observatory{grid-template-columns:minmax(0,1fr)}.growth-side{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.growth-side>.growth-heading{grid-column:1/-1}.growth-section+.growth-section{border-top:0;border-left:1px solid var(--border)}}
@media(max-width:640px){.growth-side{display:block}.growth-section+.growth-section{border-left:0;border-top:1px solid var(--border)}}
`;
