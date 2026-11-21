export const BRAIN_HUB_USAGE = String.raw`
const usageCounters=[
  ['inputTokens','Input tokens'],
  ['outputTokens','Output tokens'],
  ['cacheReadInputTokens','Cache read (input subset)'],
  ['cacheWriteInputTokens','Cache write (input subset)'],
  ['reasoningOutputTokens','Reasoning tokens (output subset)']
];
const usageOutcomes=[['success','Success'],['error','Error'],['cancelled','Cancelled'],['unknown','Not reported']];
const usagePeriods=[['all','All retained reports'],['day','Last 24 hours'],['week','Last 7 days'],['month','Last 30 days']];
const usagePageSize=25;
const usageModelLimit=24;
function usageValue(stat){
  if(!stat?.known)return 'Not reported';
  return fmt(stat.total)+' · '+fmt(stat.known)+' / '+fmt(stat.receipts)+' reports';
}
function usageTotals(rows){
  const totals=Object.fromEntries([...usageCounters.map(([key])=>key),'pairedTokens'].map(key=>[key,{total:null,known:0,receipts:rows.length}]));
  for(const row of rows){
    for(const [key] of usageCounters){
      if(!Number.isSafeInteger(row[key]))continue;
      const stat=totals[key];stat.total=(stat.total??0)+row[key];stat.known++;
    }
    if(Number.isSafeInteger(row.inputTokens)&&Number.isSafeInteger(row.outputTokens)){
      const stat=totals.pairedTokens;stat.total=(stat.total??0)+row.inputTokens+row.outputTokens;stat.known++;
    }
  }
  return totals;
}
function usageMatches(rows,filters={},now=Date.now()){
  const days={day:1,week:7,month:30}[filters.period];
  const cutoff=days?now-days*86400000:-Infinity;
  return rows.filter(row=>(!days||Date.parse(row.recordedAt)>=cutoff)&&(!filters.agent||row.agent===filters.agent)&&
    (!filters.model||(filters.model==='unknown'?!(row.requestModel||row.responseModel):[row.requestModel,row.responseModel].some(model=>model&&'model:'+model===filters.model)))&&
    (!filters.outcome||(row.outcome??'unknown')===filters.outcome));
}
function usageBreakdown(receipts){
  const models=new Map();
  for(const receipt of receipts){
    const key=JSON.stringify([receipt.agent,receipt.provider??null,receipt.requestModel??null,receipt.responseModel??null]);
    if(!models.has(key))models.set(key,[]);
    models.get(key).push(receipt);
  }
  const rows=[...models.values()].sort((a,b)=>b.length-a.length||b[0].recordedAt.localeCompare(a[0].recordedAt));
  const visible=rows.slice(0,usageModelLimit);
  return '<div class="table-wrap" role="region" aria-label="Model report groups" tabindex="0"><table><thead><tr><th scope="col">Host / provider</th><th scope="col">Requested model</th><th scope="col">Response model</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Reports</th></tr></thead><tbody>'+
    visible.map(group=>{
      const [row]=group,totals=usageTotals(group);
      return '<tr><td><strong>'+esc(hostName(row.agent))+'</strong><br><span class="small muted">'+esc(row.provider??'Provider not reported')+'</span></td><td>'+esc(row.requestModel??'Not reported')+'</td><td>'+esc(row.responseModel??'Not reported')+'</td><td>'+esc(usageValue(totals.inputTokens))+'</td><td>'+esc(usageValue(totals.outputTokens))+'</td><td>'+fmt(group.length)+'</td></tr>';
    }).join('')+'</tbody></table></div>'+
    (rows.length>visible.length?'<p class="panel-body small muted">Showing '+fmt(visible.length)+' of '+fmt(rows.length)+' model groups by report count. Filter by host or model to find other groups.</p>':'');
}
function usageOrder(receipts){
  return [...receipts].reverse().sort((a,b)=>b.recordedAt.localeCompare(a.recordedAt));
}
function usageStale(){
  return state.errors.usage?'<p class="notice" role="status">Usage refresh failed. Showing the last loaded reports. '+esc(state.errors.usage)+'</p>':'';
}
function modelReceipts(){
  if(!local)return empty('Project workspace required','Model reports belong to an explicit project.');
  const receipts=usageOrder(arr(state.usage?.receipts));
  if(!state.usage)return error('usage','model usage')||empty('Loading usage reports','Reading project-local host reports.');
  return usageStale()+(receipts.length?usageBreakdown(receipts)+
    '<div class="panel-body stack"><p class="small muted">Requested and response model labels come from the reporting host. Provider identity is unverified.</p>'+view('usage','Filter reports in Usage')+'</div>':
    empty('No model usage reported yet','A cooperating host can send model and token metadata with usage_report.'));
}
function modelsPage(){
  const hosts=arr(state.integrations?.agents);
  const body=hosts.length?'<div class="table-wrap"><table><thead><tr><th scope="col">Client recipe</th><th scope="col">Project skill files</th><th scope="col">Retained exchanges</th><th scope="col">Usage reports</th></tr></thead><tbody>'+hosts.map(host=>{
    const events=state.events.filter(event=>event.agent===host.id),latest=events.at(-1),reports=arr(state.usage?.receipts).filter(receipt=>receipt.agent===host.id);
    return '<tr><td><strong>'+esc(host.label)+'</strong></td><td>'+esc(host.installation)+'</td><td>'+esc(latest?evidence(latest)+' · '+eventLabel(latest)+' · '+isoTime(latest.timestamp):state.live?'No exchange for this label':'Activity display is off')+'</td><td>'+esc(reports.length?fmt(reports.length)+' retained':state.usage?'Not reported':'Unavailable')+'</td></tr>';
  }).join('')+'</tbody></table></div><p class="panel-body small muted">The table matches records to the exact client label. Usage includes every reporting label for this project.</p>':error('integrations','client checks')||empty('Reading integration evidence','Client skill-file checks are loading.');
  return heading('Connections and models','Review installed recipes, observed exchanges, and model reports.',view('setup','Configure hosts'))+panel('Client readiness',body)+panel('Reported models',modelReceipts(),chip('Host-reported','amber'));
}
function usageSelect(name,label,options,selected=''){
  const choices=selected&&!options.some(([value])=>value===selected)?[...options,[selected,selected.replace(/^model:/,'')]]:options;
  return '<label>'+label+'<select name="'+name+'">'+choices.map(([value,text])=>'<option value="'+esc(value)+'" '+(selected===value?'selected':'')+'>'+esc(text)+'</option>').join('')+'</select></label>';
}
function usageFilterForm(receipts,filters,matched){
  const agents=[...new Set(receipts.map(row=>row.agent))].sort((a,b)=>hostName(a).localeCompare(hostName(b)));
  const models=[...new Set(receipts.flatMap(row=>[row.requestModel,row.responseModel]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const missingModel=receipts.some(row=>!(row.requestModel||row.responseModel));
  return '<div class="panel-body"><form class="form" data-form="usage-filter"><div class="form-grid">'+
    usageSelect('period','Report time',usagePeriods,filters.period??'all')+
    usageSelect('agent','Reporting host',[['','All hosts'],...agents.map(agent=>[agent,hostName(agent)])],filters.agent)+
    usageSelect('model','Requested or response model',[['','All models'],...(missingModel?[['unknown','Model not reported']]:[]),...models.map(name=>['model:'+name,name])],filters.model)+
    usageSelect('outcome','Outcome',[['','All outcomes'],...usageOutcomes],filters.outcome)+
    '</div><div class="actions"><button type="submit" class="btn primary" id="apply-usage-filters">Apply filters</button><button type="submit" class="btn quiet" name="clear" value="yes">Clear filters</button></div></form>'+
    '<p class="small muted" id="usage-count" role="status" tabindex="-1">'+fmt(matched)+' of '+fmt(receipts.length)+' retained reports</p></div>';
}
function applyUsageFilters(form){
  state.usageFilters=form.get('clear')==='yes'?null:Object.fromEntries(['period','agent','model','outcome'].map(key=>[key,field(form,key)]));
  state.usagePage=0;render();$('apply-usage-filters')?.focus({preventScroll:true});
}
function moveUsagePage(page){
  if(!Number.isSafeInteger(page)||page<0)return;
  state.usagePage=page;render();$('usage-reports-page')?.focus();
}
function usageReportList(receipts){
  const pages=Math.ceil(receipts.length/usagePageSize);
  const page=Math.min(pages-1,state.usagePage??0),offset=page*usagePageSize;
  const entries=receipts.slice(offset,offset+usagePageSize);
  return '<div class="panel-body stack"><p class="small muted" id="usage-reports-page" role="status" tabindex="-1">Showing '+fmt(offset+1)+'–'+fmt(offset+entries.length)+' of '+fmt(receipts.length)+' matching reports, newest first</p>'+
    list(entries.map(row=>{
      const outcome=usageOutcomes.find(([value])=>value===row.outcome)?.[1]??'Not reported';
      const counts=usageCounters.map(([key,label])=>fact(label,Number.isSafeInteger(row[key])?fmt(row[key]):'Not reported')).join('');
      return '<li class="item"><details id="usage-receipt-'+esc(row.id)+'" data-keep-open><summary><strong>'+esc(hostName(row.agent))+'</strong> · '+esc(row.responseModel??row.requestModel??'Model not reported')+' · '+esc(isoTime(row.recordedAt))+'</summary><dl class="facts">'+
        fact('Host session',row.sessionId)+fact('Operation',row.operationId)+fact('Provider',row.provider??'Not reported')+
        fact('Requested model',row.requestModel??'Not reported')+fact('Response model',row.responseModel??'Not reported')+
        fact('Reported effort label',row.reasoningEffort??'Not reported')+fact('Outcome',outcome)+counts+'</dl></details></li>';
    }).join(''))+
    (pages>1?'<div class="actions">'+
      (page>0?action('usage-page','Newer reports','','data-usage-page="'+(page-1)+'"'):'')+
      (page+1<pages?action('usage-page','Older reports','','data-usage-page="'+(page+1)+'"'):'')+
      '</div>':'')+'</div>';
}
function usagePage(){
  const measured=state.events.filter(event=>event.source==='measured'&&event.kind==='tool-end');
  const durations=measured.map(event=>event.durationMs).filter(Number.isFinite);
  const context=state.context;
  const toolBody='<div class="panel-body stack"><dl class="facts">'+fact('Measured tool returns',state.live?fmt(measured.length):'Activity display off')+
    fact('Measured tool duration',durations.length?fmt(durations.reduce((sum,item)=>sum+item,0))+' ms':'Unavailable')+
    fact('Returns with timing',state.live?fmt(durations.length)+' / '+fmt(measured.length):'Unavailable')+
    fact('Last context pack',context?fmt(context.budget.estimatedTokens)+' estimated tokens':'No pack built')+
    '</dl><p class="small muted">Timing covers measured workspace handlers in the loaded activity journal. The context estimate describes the assembled text.</p>'+view('context','Inspect context selection')+'</div>';
  const tools=panel('Tool timing and context',toolBody);
  const pageHeading=heading('Usage and timing','Inspect token counts from reports supplied by your connected hosts.');
  if(!local||!state.usage)return pageHeading+'<div class="two">'+panel('Model reports',modelReceipts())+tools+'</div>';
  const usage=state.usage,receipts=usageOrder(arr(usage.receipts));
  const filters=state.usageFilters??{},rows=usageMatches(receipts,filters);
  const retention='<div class="panel-body stack"><dl class="facts">'+fact('Retained reports',fmt(receipts.length)+' / '+fmt(usage.retentionLimit))+
    fact('Older reports expired',fmt(usage.dropped))+fact('Earliest retained report',receipts.length?isoTime(receipts.at(-1).recordedAt):'No reports')+
    fact('Latest retained report',receipts.length?isoTime(receipts[0].recordedAt):'No reports')+
    fact('Recording',usage.recording?'On':'Off')+'</dl>'+(usage.recording?'':'<p class="small muted">Enable activity recording in Setup to accept new reports.</p>'+view('setup','Open Setup'))+'</div>';
  const totals=usageTotals(rows);
  const summary=rows.length?'<div class="panel-body stack"><dl class="facts">'+
    usageCounters.slice(0,2).map(([key,label])=>fact(label,usageValue(totals[key]))).join('')+
    fact('Input + output (paired reports)',usageValue(totals.pairedTokens))+
    usageCounters.slice(2).map(([key,label])=>fact(label,usageValue(totals[key]))).join('')+
    '</dl><p class="small muted">Coverage counts reports with each field. The paired total uses reports that supplied both input and output. Cache and reasoning counts are already part of their parent counters.</p></div>':
    receipts.length?empty('No reports match these filters','Clear or broaden the filters to see more reports.') :
    empty('No model usage reported yet','A cooperating host can call usage_report with model labels and token counts it already knows.');
  return pageHeading+usageStale()+(receipts.length?panel('Filter model reports',usageFilterForm(receipts,filters,rows.length)):'')+
    '<div class="two">'+panel('Reported model tokens',summary,chip('Host-reported','amber'))+'<div class="stack">'+panel('Report retention',retention)+tools+'</div></div>'+
    (rows.length?panel('Model breakdown',usageBreakdown(rows))+panel('Individual reports',usageReportList(rows)):'');
}
`;
