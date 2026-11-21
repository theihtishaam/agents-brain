export const BRAIN_HUB_FILES = String.raw`
const projectFiles={listing:null,selected:null,request:null,failed:null};

function resetProjectFiles(){
  projectFiles.request?.controller.abort();
  Object.assign(projectFiles,{listing:null,selected:null,request:null,failed:null});
}

async function openProjectFiles(path,offset=0){
  if(!local||state.view!=='files')return;
  const explicit=path!==undefined;
  if(!explicit&&(projectFiles.listing||projectFiles.request||projectFiles.failed))return;
  const requested={path:path??'',offset,controller:new AbortController()};
  projectFiles.request?.controller.abort();
  projectFiles.request=requested;
  projectFiles.failed=null;
  render(true);
  try{
    const pinned=state.server?.project?.id??state.overview?.projectKit?.projectId;
    const query=new URLSearchParams({path:requested.path,offset:String(offset)});
    const listing=await api('files?'+query,{signal:requested.controller.signal,
      headers:pinned?{'X-Shadow-Brain-Project':pinned}:{}});
    if(projectFiles.request!==requested)return;
    if(listing.path!==projectFiles.listing?.path||!arr(listing.items).some(item=>item.path===projectFiles.selected))projectFiles.selected=null;
    projectFiles.listing=listing;
  }catch(failure){
    if(projectFiles.request===requested)projectFiles.failed={path:requested.path,offset,message:failure.message};
  }finally{
    if(projectFiles.request===requested){
      projectFiles.request=null;
      if(state.view==='files'){
        render(true);
        if(explicit)$('files-breadcrumbs')?.focus({preventScroll:true});
      }
    }
  }
}

function selectProjectFile(path){
  if(state.view!=='files'||!arr(projectFiles.listing?.items).some(item=>item.kind==='file'&&item.path===path))return;
  projectFiles.selected=projectFiles.selected===path?null:path;
  render(true);
  if(projectFiles.selected)$('file-context-button')?.focus();
  else [...document.querySelectorAll('[data-file-select]')].find(button=>button.dataset.fileSelect===path)?.focus();
}

function fileNavAttributes(path,offset=0){
  return 'data-file-path="'+esc(path)+'" data-file-offset="'+esc(offset)+'"';
}

function fileBytes(bytes){return Number.isFinite(bytes)?fmt(bytes)+' bytes':'Unavailable';}

function filesPage(){
  if(!local)return projectRequired('Files','Browse the files in a project workspace.');
  const {listing,selected,request,failed}=projectFiles;
  const items=arr(listing?.items);
  const folderPath=listing?.path??'';
  const refresh=btn('Refresh folder',fileNavAttributes(folderPath,listing?.offset??0));
  const breadcrumbs=arr(listing?.breadcrumbs);
  const location='<nav class="panel-body actions" id="files-breadcrumbs" tabindex="-1" aria-label="File location">'+(breadcrumbs.length?breadcrumbs.map((crumb,index)=>
    index===breadcrumbs.length-1?'<span class="mono" style="overflow-wrap:anywhere" aria-current="location">'+esc(crumb.name)+'</span>':btn(crumb.name,fileNavAttributes(crumb.path),'quiet')
  ).join('<span class="muted" aria-hidden="true">/</span>'):'<span class="mono" aria-current="location">Project root</span>')+'</nav>';
  const trouble=failed?empty('Could not read folder',failed.message,btn('Retry folder',fileNavAttributes(failed.path,failed.offset))):'';
  const progress=request?'<p class="panel-body small muted" role="status">Reading folder…</p>':'';
  const limit=listing?.truncated?'<p class="panel-body small amber">This folder exceeds the '+fmt(listing.scanLimit)+'-entry scan limit. Pages show the eligible entries from that scan.</p>':'';
  const table=items.length?'<div class="table-wrap" style="max-height:min(64vh,680px)" tabindex="0" role="region" aria-label="Directory listing"><table aria-label="Project directory entries"><thead style="position:sticky;top:0;background:var(--surface)"><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Size</th><th scope="col">Modified</th></tr></thead><tbody>'+items.map(entry=>{
    const folder=entry.kind==='directory';
    const expanded=entry.path===selected;
    const target=folder?(entry.navigable?fileNavAttributes(entry.path):'disabled title="Directory depth limit reached"'):
      'data-file-select="'+esc(entry.path)+'" aria-expanded="'+expanded+'"';
    const detail=expanded?'<tr><td colspan="4"><div class="receipt row"><p class="mono">'+esc(entry.path)+'</p>'+btn('Look up in Context','id="file-context-button" data-file-context="'+esc(entry.path)+'"','primary')+(/\.(?:md|markdown|txt)$/iu.test(entry.name)?btn('Review for memory','data-review-document="'+esc(entry.path)+'"','quiet'):'')+'</div></td></tr>':'';
    return '<tr><td><button class="entry mono" type="button" '+target+'>'+esc(entry.name)+'</button></td><td>'+(folder?'Folder':'File')+'</td><td class="mono">'+(folder?'—':fileBytes(entry.bytes))+'</td><td>'+esc(isoTime(entry.modifiedAt))+'</td></tr>'+detail;
  }).join('')+'</tbody></table></div>':listing?empty('No browsable entries','Choose another folder or refresh this one.'):'';
  const pages=listing&&(listing.previousOffset!==null||listing.nextOffset!==null)?'<div class="panel-body row"><p class="small muted">'+fmt(listing.offset+1)+'–'+fmt(listing.offset+items.length)+' of '+fmt(listing.total)+'</p><div class="actions">'+btn('Previous page',listing.previousOffset===null?'disabled':fileNavAttributes(folderPath,listing.previousOffset))+btn('Next page',listing.nextOffset===null?'disabled':fileNavAttributes(folderPath,listing.nextOffset))+'</div></div>':'';
  return heading('Files','Browse project folders and inspect file metadata.',refresh)+'<section class="panel" aria-labelledby="title">'+location+progress+trouble+limit+table+pages+'</section>';
}
`;
