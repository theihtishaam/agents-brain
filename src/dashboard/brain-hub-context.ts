export const BRAIN_HUB_CONTEXT = String.raw`
const contextProfiles=[['adaptive','Adaptive'],['legacy','Legacy']];
const contextOmissionReasons={
  budget:'Would exceed the context budget',limit:'Reached the memory limit',duplicate:'Combined with a matching memory',
  empty:'No usable text',lookback:'Outside the time window',archived:'Archived',contested:'Marked contested',
  superseded:'Replaced by a newer memory','candidate-limit':'Outside the candidate limit'
};
function memoryActions(id){return '<div class="actions">'+action('open-memory','Inspect memory','','data-memory="'+esc(id)+'"')+(local?action('source-evidence','Original source','','data-memory="'+esc(id)+'"'):'')+'</div>';}
function contextBytes(pack){
  return Number.isFinite(pack.budget.usedBytes)?pack.budget.usedBytes:new TextEncoder().encode(pack.markdown).byteLength;
}
function contextBudget(pack,input){
  const {budget}=pack;
  const bytes=contextBytes(pack);
  const entryLimit=pack.policy?.effectiveMaxEntries??input.maxEntries??12;
  const tokenBudget=fmt(budget.tokenBudget)+(Number.isFinite(input.tokenBudget)&&input.tokenBudget!==budget.tokenBudget?' of '+fmt(input.tokenBudget)+' requested':'');
  const memoryLimit=fmt(entryLimit)+(Number.isFinite(input.maxEntries)&&input.maxEntries!==entryLimit?' of '+fmt(input.maxEntries)+' requested':'');
  const estimator=budget.estimator==='unicode-code-heuristic'?'Unicode and code heuristic':'One token per four UTF-16 units, rounded up';
  const percent=budget.tokenBudget>0?Math.min(100,Math.max(0,100*budget.estimatedTokens/budget.tokenBudget)):0;
  return '<div class="stack"><div class="row"><strong>'+fmt(budget.estimatedTokens)+' estimated tokens</strong><span class="small muted">'+fmt(budget.tokenBudget)+' allowed</span></div>'+
    '<div class="meter" aria-hidden="true"><i style="width:'+percent+'%"></i></div>'+
    '<details id="context-budget" data-keep-open><summary>Size and limits</summary><dl class="facts">'+fact('Effective token budget',tokenBudget)+
    fact('Effective memory limit',memoryLimit)+fact('Exact UTF-8 size',fmt(bytes)+' bytes')+
    fact('Text length / hard cap',fmt(budget.usedChars)+' / '+fmt(budget.maxChars)+' UTF-16 units')+
    fact('Token estimator',estimator)+'</dl></details></div>';
}
function contextRank(candidate,group){
  if(!candidate)return '';
  const terms=arr(candidate.matchedTerms),fields=arr(candidate.matchedFields);
  const signals=arr(candidate.signals).map(signal=>fact(signal.label,Number(signal.value).toFixed(3))).join('');
  const paths=arr(candidate.paths).map(path=>'<p class="small preserve">'+esc(path.relationType+' from '+path.seedId)+'</p>').join('');
  return '<details id="context-'+group+'-rank-'+esc(candidate.id)+'" data-keep-open><summary>Rank '+fmt(candidate.rank)+' · Ranking details</summary>'+
    '<dl class="facts">'+fact('Matched terms',terms.length?terms.join(', '):'None')+fact('Matched fields',fields.length?fields.join(', '):'None')+
    signals+(candidate.feedback?fact('Feedback adjustment',candidate.feedback.adjustment):'')+'</dl>'+paths+
    '<p class="small muted">These signals explain retrieval order.</p></details>';
}
function contextDiagnostics(pack){
  const retrieval=pack.retrieval;
  const ranked=new Map(arr(retrieval?.candidates).map(candidate=>[candidate.id,candidate]));
  const omitted=new Map();
  for(const entry of arr(pack.excluded)){
    if(!omitted.has(entry.reason))omitted.set(entry.reason,[]);
    omitted.get(entry.reason).push(entry);
  }
  const stages=retrieval?'<div class="panel-body stack"><details id="context-retrieval-stages" data-keep-open><summary>Retrieval stages</summary>'+
    '<dl class="facts">'+arr(retrieval.stages).map(stage=>fact(stage.label,fmt(stage.count))).join('')+fact('Task classification',retrieval.taskType)+
    fact('Candidate limit',fmt(retrieval.candidateLimit))+fact('Bounded diagnostics',retrieval.truncated?'Yes':'No')+'</dl></details></div>':'';
  const groups=[...omitted].map(([reason,entries])=>'<details class="panel-body" id="context-omitted-'+esc(reason)+'" data-keep-open><summary>'+
    esc(contextOmissionReasons[reason]??reason)+' · '+fmt(entries.length)+'</summary>'+
    list(entries.map(entry=>'<li class="item"><strong>'+esc(entry.title??entry.id)+'</strong>'+
      contextRank(ranked.get(entry.id),'omitted')+memoryActions(entry.id)+'</li>').join(''))+'</details>').join('');
  const keywords=arr(pack.queryKeywords);
  return panel('Retrieval details','<div class="panel-body stack"><dl class="facts">'+fact('Search terms',keywords.length?keywords.join(', '):'General briefing')+
    fact('Recorded omissions',fmt(arr(pack.excluded).length))+fact('Withheld by sharing controls',pack.policy?fmt(pack.policy.hiddenMemories):'Unavailable')+
    '</dl></div>'+stages+groups);
}
function useContextProfile(profile){
  if(state.pending||!state.comparison||!contextProfiles.some(([value])=>value===profile))return;
  state.context=state.comparison[profile];
  render(true);
  $('context-preview-summary')?.focus();
  status((profile==='adaptive'?'Adaptive':'Legacy')+' context is ready to inspect and copy.');
}
function contextComparison(){
  const compare=state.comparison;
  if(!compare)return '';
  const legacy=new Map(arr(compare.legacy.entries).map(entry=>[entry.id,entry]));
  const adaptive=new Map(arr(compare.adaptive.entries).map(entry=>[entry.id,entry]));
  const table='<div class="table-wrap" role="region" aria-label="Retrieval profile comparison" tabindex="0"><table><thead><tr><th scope="col">Profile</th><th scope="col">Memories</th><th scope="col">Estimated tokens</th><th scope="col">Exact UTF-8 bytes</th><th scope="col">Preview</th></tr></thead><tbody>'+
    contextProfiles.map(([profile,label])=>{
      const pack=compare[profile];
      return '<tr><th scope="row">'+label+'</th><td>'+fmt(arr(pack.entries).length)+'</td><td>'+fmt(pack.budget.estimatedTokens)+'</td>'+
        '<td>'+fmt(contextBytes(pack))+'</td><td>'+(pack===state.context?chip('Selected','cyan'):action('context-use-profile','Preview '+label,'','data-profile="'+profile+'"'))+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  const groups=[
    [arr(compare.delta?.addedIds),'Only in Adaptive',adaptive],
    [arr(compare.delta?.removedIds),'Only in Legacy',legacy],
    [arr(compare.delta?.sharedIds),'Selected by both',adaptive]
  ].map(([ids,label,entries],index)=>'<details id="context-compare-group-'+index+'" data-keep-open><summary>'+label+' · '+fmt(ids.length)+'</summary>'+
    (ids.length?list(ids.map(id=>{
      const excerpt=entries.get(id)?.excerpt??id;
      const legacyExcerpt=legacy.get(id)?.excerpt;
      return '<li class="item">'+(index===2&&legacyExcerpt!==excerpt?'<p class="small muted">Adaptive excerpt</p><p class="preserve">'+esc(excerpt)+'</p><p class="small muted">Legacy excerpt</p><p class="preserve">'+esc(legacyExcerpt)+'</p>':'<p class="preserve">'+esc(excerpt)+'</p>')+memoryActions(id)+'</li>';
    }).join('')):'<p class="small muted">No memories in this group.</p>')+'</details>').join('');
  return panel('Profile comparison',table+'<div class="panel-body stack"><p class="small muted">Each profile uses its own estimator. Use the UTF-8 size for a direct comparison of the output, and review the excerpts for relevance.</p>'+groups+'</div>');
}
function contextEfficiencyPanel(pack){
  const result=pack?.efficiency;if(!result)return '';
  const difference=result.signedTokenDifference;
  const label=difference===0?'Same estimated size':fmt(Math.abs(difference))+(difference<0?' more':' fewer')+' estimated context tokens';
  const percent=result.referenceEstimatedTokens?Math.abs(difference)/result.referenceEstimatedTokens*100:null;
  const change=percent===null?'Empty reference':difference===0?'No size change':percent.toFixed(1)+(difference<0?'% larger':'% smaller');
  return panel('Context size comparison','<div class="panel-body stack"><div class="row"><strong>'+label+'</strong>'+chip(change,difference<0?'amber':'cyan')+
    '</div><dl class="facts">'+fact('Reference pack',fmt(result.referenceEstimatedTokens)+' estimated tokens')+
    fact('Selected pack',fmt(result.focusedEstimatedTokens)+' estimated tokens')+
    fact('Reference / selected memories',fmt(result.referenceMemoryCount)+' / '+fmt(result.focusedMemoryCount))+
    fact('Measured assembly time',fmt(result.assemblyMs)+' ms')+fact('Reference assembly time',fmt(result.referenceComparisonMs)+' ms')+
    '</dl><p class="small muted">The reference uses the same task and retrieval profile, capped at '+fmt(result.referenceTokenBudget)+' estimated tokens and '+
    fmt(result.referenceEntryLimit)+' memories.'+(result.referenceLimited?' The reference reached a scan or pack limit.':'')+
    '</p><p class="small muted">These estimates describe the assembled text. See Usage for reported model counts.</p></div>',chip('Estimate'));
}
function contextPreview(pack,input){
  const entries=arr(pack.entries);
  const profile=pack.retrieval?.profile??'legacy';
  const ranked=new Map(arr(pack.retrieval?.candidates).filter(candidate=>candidate.decision==='selected').map(candidate=>[candidate.id,candidate]));
  const warnings=arr(pack.warnings).map(warning=>'<p class="small amber">'+esc(warning)+'</p>').join('');
  const selected=entries.length?list(entries.map(entry=>'<li class="item"><p class="preserve">'+esc(entry.excerpt)+'</p>'+
    (entry.excerptTruncated?'<small class="amber">Excerpt shortened</small>':'')+
    (arr(entry.reasons).length?'<small class="muted preserve">'+esc(entry.reasons.join(' · '))+'</small>':'')+
    (arr(entry.sources).length?'<small class="mono cyan preserve">'+esc(entry.sources.join(' · '))+'</small>':'')+
    contextRank(ranked.get(entry.id),'selected')+memoryActions(entry.id)+'</li>').join('')):
    '<p class="small muted">'+(pack.enabled===false?'Enable context assembly in Setup to build a pack.':arr(pack.excluded).some(item=>item.reason==='budget')?'Increase the token budget to fit a matching memory.':'Try a different query or add a relevant project memory.')+'</p>';
  return '<div class="panel-body stack"><div class="row"><h3 id="context-preview-summary" tabindex="-1">'+fmt(entries.length)+' selected '+(entries.length===1?'memory':'memories')+
    '</h3>'+chip(contextProfiles.find(([value])=>value===profile)?.[1]??profile)+'</div>'+contextBudget(pack,input)+warnings+
    (pack.markdown?'<div class="actions">'+action('copy-pack','Copy context','primary')+view('learning','Review usefulness')+
      '</div><details id="context-exact" data-keep-open><summary>Exact text available to copy</summary><pre>'+esc(pack.markdown)+'</pre></details>':'')+
    selected+'</div>';
}
function contextPage(){
  const input=state.contextInput??{};
  const enabled=state.features?.features?.contextAssembly!==false;
  const controls=state.policy?.policy;
  const form='<div class="panel-body"><form class="form" data-form="context"><label>What are you working on?<textarea name="query" rows="4" maxlength="4096" placeholder="Describe your next task">'+
    esc(input.query)+'</textarea></label><div class="form-grid"><label>Estimated token budget<input name="tokenBudget" type="number" min="0" max="12000" value="'+
    esc(input.tokenBudget??2000)+'" required></label><label>Memory limit<input name="maxEntries" type="number" min="1" max="30" value="'+esc(input.maxEntries??12)+
    '" required></label></div><label>Retrieval profile<select name="profile">'+contextProfiles.map(([id,label])=>'<option value="'+id+'" '+(input.profile===id?'selected':'')+'>'+label+'</option>').join('')+
    '</select></label><label class="check"><input name="expandRelated" type="checkbox" '+(input.expandRelated?'checked':'')+'> Include recorded related memories with Adaptive</label><div class="actions">'+
    (state.project&&enabled?submit('Build context pack')+'<button class="btn" type="submit" name="compare" value="yes">Compare profiles</button>':
      chip(state.project?'Context packs disabled':'Select a project','amber'))+'</div></form></div>';
  const pack=state.context;
  const output=pack?contextPreview(pack,input):empty('Build a pack for your next task','Review the selected passages, sources, and exact text before copying.');
  const limits=pack?.policy??controls?.context;
  const ceiling=limits?'<p class="panel-body small muted">Project limits allow up to '+fmt(limits.maxTokens)+' estimated tokens and '+
    fmt(limits.maxEntries)+' memories'+(pack?.policy?' under sharing policy revision '+fmt(pack.policy.revision):'')+'.</p>':'';
  return heading('Context for your next task','Assemble a project-scoped memory pack and inspect every included passage.',view('knowledge','Add knowledge'))+
    '<div class="two">'+panel('Your task',form+ceiling,chip(scopeName()))+panel('Context preview',output)+'</div>'+
    contextComparison()+contextEfficiencyPanel(pack)+(pack?contextDiagnostics(pack):'');
}
`;
