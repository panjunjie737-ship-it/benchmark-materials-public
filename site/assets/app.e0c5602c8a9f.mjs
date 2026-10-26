import {DEFAULT_FILTERS,paginateRecords,selectRecords,validatePublicManifest,validateCatalogIndex,validateDatasetChunk} from './catalog.c5d5e89d01b0.mjs';
import {renderClosed,renderPage,renderSubmissionPage,renderRouteState,qualityLabel} from './views.373748bdfc11.mjs';
import {bindCoverStatus} from './cover-status.0948bcd0b1a8.mjs';

export const ROUTES=Object.freeze(['#/materials','#/today','#/brief','#/accounts','#/observations','#/submit']);
export function normalizeRoute(hash){return ROUTES.includes(hash)?hash:'#/materials';}
async function request({fetchImpl=fetch,url,options={},read='json',timeoutMs=15000}){
  const controller=new AbortController();let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('REQUEST_TIMEOUT'));},timeoutMs);});
  try{return await Promise.race([timeout,(async()=>{
    const response=await fetchImpl(url,{...options,signal:controller.signal});
    if(read==='response')return response;
    if(read==='jsonResponse')return {ok:response?.ok,status:response?.status,data:response?.ok?await response.json():null};
    if(!response?.ok)throw new Error(`HTTP_${response?.status||0}`);
    return read==='text'?response.text():response.json();
  })()]);}finally{clearTimeout(timer);}
}
function routeDataset(route){return normalizeRoute(route)==='#/submit'?'accounts':datasetName(route);}
export function createRecordSelector({selectImpl=selectRecords}={}){
  const cache=new WeakMap();
  return (records,filters,page=1)=>{
    const key=JSON.stringify(Object.entries({...DEFAULT_FILTERS,...filters}).sort(([a],[b])=>a.localeCompare(b)));
    let entry=cache.get(records);
    if(!entry||entry.key!==key){entry={key,selected:selectImpl(records,filters)};cache.set(records,entry);}
    return paginateRecords(entry.selected,page);
  };
}
export function defaultFiltersForRoute(route,records=[]){
  const sort=route==='#/accounts'?(records.some(row=>Number.isFinite(row.metrics?.followers))?'followers':'material_count'):route==='#/observations'?'checked':route==='#/brief'&&records.some(row=>Number.isFinite(row.view_delta))?'view_delta':'views';
  return {...DEFAULT_FILTERS,sort};
}
export function readFilterForm(form,filters={}){
  if(!form)return {...filters};
  const entries=[...new FormData(form)],values=Object.fromEntries(entries.filter(([name])=>name!=='accounts'));
  if(form.querySelector?.('[data-account-picker]')){
    values.accounts=entries.filter(([name])=>name==='accounts').map(([,value])=>value);
    values.account='';
  }
  if(values.date_status==='unknown'){values.date_from='';values.date_to='';}
  return {...filters,...values};
}
export function bindAccountFilter(form){
  const picker=form?.querySelector('[data-account-picker]');if(!picker)return;
  const search=picker.querySelector('[data-account-search]'),count=picker.querySelector('[data-account-count]'),status=picker.querySelector('[data-account-status]');
  const select=picker.querySelector('[data-account-select-matches]'),clear=picker.querySelector('[data-account-clear]'),empty=picker.querySelector('[data-account-empty]');
  const options=[...picker.querySelectorAll('[data-account-option]')].map(row=>({row,input:row.querySelector('input')}));
  const refresh=()=>{
    const query=search.value.trim().toLocaleLowerCase();let visible=0,selected=0,outside=0;
    for(const {row,input} of options){
      const inScope=row.dataset.accountInScope==='true';
      row.hidden=!inScope||!row.dataset.accountSearch.includes(query);
      if(!row.hidden)visible++;
      if(input.checked){selected++;if(!inScope)outside++;}
    }
    count.textContent=`已选 ${selected} 个账号`;
    status.textContent=`当前搜索 ${visible} 个账号${outside?`；已选中 ${outside} 个不在当前范围，切换范围后生效`:''}。勾选后点击“应用账号筛选”。`;
    empty.hidden=visible>0;select.disabled=visible===0;clear.disabled=selected===0;
  };
  search.addEventListener('input',refresh);
  search.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
  options.forEach(({input})=>input.addEventListener('change',refresh));
  select.addEventListener('click',()=>{for(const {row,input} of options)if(!row.hidden)input.checked=true;refresh();});
  clear.addEventListener('click',()=>{for(const {input} of options)input.checked=false;refresh();});
  refresh();
}
export function bindFilterForm(form,filters,applyFilters,{resetFilters=DEFAULT_FILTERS}={}){
  if(!form)return;
  const error=form.querySelector?.('[data-filter-error]'),dateTo=form.querySelector?.('[name="date_to"]');
  const clearError=()=>{dateTo?.setCustomValidity?.('');if(error){error.textContent='';error.hidden=true;}};
  const apply=()=>{
    clearError();const next=readFilterForm(form,filters);
    if(next.date_from&&next.date_to&&next.date_from>next.date_to){
      const message='开始日期不能晚于结束日期，请调整日期范围。';
      if(error){error.textContent=message;error.hidden=false;}
      dateTo?.setCustomValidity?.(message);dateTo?.reportValidity?.();return;
    }
    applyFilters(next,1);
  };
  form.addEventListener('submit',event=>{event.preventDefault();apply();});
  form.querySelectorAll('select[name="sort"], select[name="direction"]').forEach(control=>control.addEventListener('change',apply));
  form.querySelectorAll('input[name="date_from"], input[name="date_to"]').forEach(control=>control.addEventListener('input',clearError));
  const dateStatus=form.querySelector?.('[name="date_status"]');
  if(dateStatus){
    const syncDates=()=>{for(const control of form.querySelectorAll('input[name="date_from"], input[name="date_to"]')){control.disabled=dateStatus.value==='unknown';if(control.disabled)control.value='';}clearError();};
    dateStatus.addEventListener('change',()=>{syncDates();apply();});syncDates();
  }
  form.querySelector?.('[data-reset-filters]')?.addEventListener('click',()=>applyFilters({...resetFilters,pool:filters.pool||'company',accounts:[]},1));
}
export function bindVideoDialog(root){
  const dialog=root.getElementById('media-dialog');if(!dialog)return;
  const video=dialog.querySelector('video'),download=dialog.querySelector('.download'),open=dialog.querySelector('.open-media');
  const status=root.getElementById('media-status'),label=root.getElementById('media-label');
  let generation=0,active=false,failed=false;
  const clear=()=>{
    active=false;generation++;video.onloadeddata=null;video.onerror=null;
    video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();status.textContent='';
  };
  root.querySelectorAll('[data-media-url]').forEach(button=>button.addEventListener('click',()=>{
    clear();active=true;failed=false;const current=++generation;
    const isCurrent=()=>active&&current===generation;
    video.src=button.dataset.mediaUrl;video.poster=button.dataset.mediaPoster||'';
    download.href=button.dataset.mediaUrl;download.download='';open.href=button.dataset.mediaUrl;label.textContent=button.dataset.mediaLabel;
    status.textContent='正在加载视频…';
    video.onloadeddata=()=>{if(isCurrent()&&!failed)status.textContent='视频已就绪，可以播放或下载。';};
    video.onerror=()=>{if(isCurrent()){failed=true;status.textContent='当前网络未能加载视频，请使用“在新窗口打开”重试。';}};
    dialog.showModal();video.load();
    video.play().catch(error=>{
      if(!isCurrent()||failed)return;
      if(error?.name==='NotAllowedError')status.textContent='浏览器未自动播放，请点击播放。';
      else if(error?.name!=='AbortError'){failed=true;status.textContent='当前网络未能加载视频，请使用“在新窗口打开”重试。';}
    });
  }));
  dialog.addEventListener('cancel',clear);dialog.addEventListener('close',clear);
  dialog.querySelector('[data-dialog-close]').addEventListener('click',()=>dialog.close());
}
export function bindGalleryDialog(root,manifest){
  const dialog=root.getElementById('gallery-dialog');
  if(!dialog)return;
  const image=root.getElementById('gallery-image'),previous=root.getElementById('gallery-previous'),next=root.getElementById('gallery-next');
  const position=root.getElementById('gallery-position'),label=root.getElementById('gallery-label'),status=root.getElementById('gallery-status');
  const download=root.getElementById('gallery-download'),open=root.getElementById('gallery-open');
  let pages=[],index=0,generation=0,active=false;
  const clear=()=>{active=false;generation++;image.onload=null;image.onerror=null;image.removeAttribute('src');status.textContent='';pages=[];};
  const show=page=>{
    if(!active||!pages.length)return;
    index=Math.max(0,Math.min(page,pages.length-1));
    const item=pages[index],current=++generation;
    position.textContent=`${index+1} / ${pages.length}`;
    label.textContent=qualityLabel(item);
    previous.disabled=index===0;next.disabled=index===pages.length-1;
    status.textContent='正在加载当前图片…';
    image.alt=`图集第 ${index+1} 张，共 ${pages.length} 张`;
    image.onload=()=>{if(active&&current===generation)status.textContent='当前图片已就绪，可以查看或下载。';};
    image.onerror=()=>{if(active&&current===generation)status.textContent='当前网络未能加载图片，请使用“在新窗口打开”查看。';};
    image.src=item.url;
    download.href=item.url;download.download=`${item.id}${item.extension}`;
    open.href=item.url;
  };
  root.querySelectorAll('[data-gallery-ids]').forEach(button=>button.addEventListener('click',()=>{
    pages=button.dataset.galleryIds.split(',').map(id=>manifest.media instanceof Map?manifest.media.get(id):manifest.media?.[id])
      .filter(item=>item?.kind==='image'&&item.content_type.startsWith('image/')&&item.url);
    if(!pages.length)return;
    active=true;show(0);dialog.showModal();
  }));
  previous.addEventListener('click',()=>show(index-1));next.addEventListener('click',()=>show(index+1));
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();show(index+(event.key==='ArrowLeft'?-1:1));}});
  root.getElementById('gallery-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',clear);
}
export async function loadPublicApp({fetchImpl=fetch,statusUrl,manifestUrl,visitUrl,visitorId='',page='#/materials',requestTimeoutMs=15000,telemetryTimeoutMs=5000,onProgress=()=>{}}){
  let status;
  try{status=await request({fetchImpl,url:statusUrl,options:{cache:'no-store'},timeoutMs:requestTimeoutMs});}catch{return {state:'closed',reason:'status_unavailable'};}
  if(status?.enabled!==true)return {state:'closed',reason:'disabled'};
  let catalog,manifest;
  try{
    const raw=await request({fetchImpl,url:manifestUrl,options:{cache:'no-store'},timeoutMs:requestTimeoutMs});
    if(raw.schema_version===2)catalog=validateCatalogIndex(raw);else manifest=validatePublicManifest(raw);
  }catch{return {state:'closed',reason:'manifest_unavailable'};}
  if(status.version&&status.version!==(catalog||manifest).version)return {state:'closed',reason:'version_mismatch'};
  const loaded=new Map(),failedDatasets=new Set();
  if(catalog)manifest={schema_version:1,version:catalog.version,generated_at:catalog.generated_at,datasets:Object.fromEntries(Object.keys(catalog.datasets).map(name=>[name,[]])),media:new Map()};
  const result={state:'ready',status,manifest,visit_failed:false,catalogIndex:catalog||null};
  result.checkAccess=async()=>{
    const latest=await request({fetchImpl,url:statusUrl,options:{cache:'no-store'},timeoutMs:requestTimeoutMs});
    if(latest?.enabled!==true)throw new Error('ACCESS_DISABLED');
    if(latest.version&&latest.version!==manifest.version)throw new Error('VERSION_CHANGED');
    return latest;
  };
  result.loadDataset=name=>{
    if(!Object.hasOwn(manifest.datasets,name))return Promise.reject(new Error('UNKNOWN_DATASET'));
    if(!catalog)return Promise.resolve(manifest);
    if(loaded.has(name))return loaded.get(name);
    const pending=(async()=>{
      const descriptor=catalog.datasets[name];
      const base=new URL(manifestUrl,globalThis.location?.href||'https://public.invalid/');
      const url=new URL(descriptor.url,base).href;
      const text=await request({fetchImpl,url,options:{cache:failedDatasets.has(name)?'reload':'force-cache'},read:'text',timeoutMs:requestTimeoutMs});
      const bytes=new TextEncoder().encode(text);
      if(bytes.byteLength!==descriptor.bytes)throw new Error('DATASET_SIZE_MISMATCH');
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      const actual=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
      if(actual!==descriptor.sha256)throw new Error('DATASET_HASH_MISMATCH');
      const chunk=validateDatasetChunk(JSON.parse(text),catalog,name);
      manifest.datasets[name]=chunk.datasets[name];
      for(const [id,media] of chunk.media)manifest.media.set(id,media);
      failedDatasets.delete(name);
      return chunk;
    })();
    loaded.set(name,pending);
    pending.catch(()=>{if(loaded.get(name)===pending){loaded.delete(name);failedDatasets.add(name);}});
    return pending;
  };
  const initialName=routeDataset(page);
  onProgress({state:'loading',route:normalizeRoute(page)});
  try{await result.loadDataset(initialName);}catch(error){result.initialLoadError={name:initialName,message:error.message};}
  result.telemetry=visitUrl?request({fetchImpl,url:visitUrl,options:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor_id:visitorId,page})},read:'response',timeoutMs:telemetryTimeoutMs}).then(response=>{if(!response?.ok)throw new Error('VISIT_FAILED');return false;}).catch(()=>{result.visit_failed=true;return true;}):Promise.resolve(false);
  return result;
}
export function createVisitorId({getStorage=()=>globalThis.localStorage,randomId=()=>{const bytes=crypto.getRandomValues(new Uint8Array(18));return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g,'').slice(0,32);}}={}){
  let cached='';
  return ()=>{
    if(cached)return cached;
    const key='benchmark-public-visitor-v1';let storage,value;
    try{storage=getStorage();value=storage?.getItem(key);}catch{}
    if(/^[A-Za-z0-9_-]{20,80}$/u.test(value||''))return cached=value;
    cached=randomId();
    try{storage?.setItem(key,cached);}catch{}
    return cached;
  };
}
const visitorId=createVisitorId();
function meta(name){return document.querySelector(`meta[name="${name}"]`)?.content||'';}
function datasetName(route){return normalizeRoute(route).slice(2);}
export async function submitAccount({fetchImpl=fetch,submissionUrl,visitorId,fields,timeoutMs=15000}){
  let response;
  try{response=await request({fetchImpl,url:submissionUrl,options:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,visitor_id:visitorId})},read:'jsonResponse',timeoutMs});}catch{throw new Error('unavailable');}
  if(response.ok){if(typeof response.data?.receipt!=='string'||!response.data.receipt.trim())throw new Error('unavailable');return response.data;}
  throw new Error(response.status===409?'duplicate':response.status===429?'daily_limit':'unavailable');
}
export async function loadSubmissionStatus({fetchImpl=fetch,submissionUrl,receipt,timeoutMs=10000}){try{return await request({fetchImpl,url:`${submissionUrl}?receipt=${encodeURIComponent(receipt)}`,options:{cache:'no-store'},timeoutMs});}catch(error){throw new Error(error.message==='HTTP_404'?'not_found':'unavailable');}}
export async function refreshSubmissionReceipts({receipts,submissionUrl,fetchImpl=fetch}){
  let failed=0;
  const updates=await Promise.all(receipts.map(async item=>{
    try{return {...item,...await loadSubmissionStatus({fetchImpl,submissionUrl,receipt:item.receipt})};}catch{failed++;return item;}
  }));
  return {receipts:updates,failed};
}
export function validateAccountFile(file){if(file.size>5*1024*1024)throw new Error('文件不能超过 5 MB，请拆分后再导入。');}
export async function submitAccountTable({batch,fetchImpl=fetch,submissionUrl,visitorId,enabled=false,onReceipt=()=>{},onChange=()=>{}}){
  if(!batch||batch.submitting||enabled!==true||!submissionUrl)return;
  batch.submitting=true;
  onChange();
  try{
    for(const row of batch.rows){
      if(row.status!=='ready'||['submitted','duplicate'].includes(row.submission_state))continue;
      row.submission_state='sending';
      row.submission_message='正在提交';
      onChange();
      let result;
      try{
        result=await submitAccount({fetchImpl,submissionUrl,visitorId,fields:row.payload});
      }catch(error){
        if(error.message==='duplicate'){
          row.submission_state='duplicate';
          row.submission_message='已提交或正在审核，不重复提交';
          onChange();
          continue;
        }
        row.submission_state=error.message==='daily_limit'?'rate_limited':'failed';
        row.submission_message=error.message==='daily_limit'?'今日额度不足；本行及后续未提交行已保留，可明天重试':'提交未确认；本行及后续未提交行已保留，可稍后重试';
        onChange();
        break;
      }
      // Mark an accepted row before saving a browser receipt, so a storage error
      // can never turn an accepted account into a retryable submission.
      row.submission_state='submitted';
      row.submission_message='提交成功，等待管理员审核';
      row.receipt=result.receipt;
      onReceipt({receipt:result.receipt,status:result.status,username:row.account});
      onChange();
    }
  }finally{
    batch.submitting=false;
    onChange();
  }
}
function receiptStore(){const key='benchmark-public-submissions-v1';try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.receipt==='string').slice(0,20):[];}catch{return [];}}
function saveReceipts(rows){localStorage.setItem('benchmark-public-submissions-v1',JSON.stringify(rows.slice(0,20)));}
function bind(state){
  const prepared=new Map(),selectPage=createRecordSelector();
  const errors=new Map(state.initialLoadError?[[state.initialLoadError.name,state.initialLoadError.message]]:[]);
  let drawGeneration=0,lastRoute=normalizeRoute(location.hash),readyRoute='',accessCheck=null,accessRevoked=false;
  const submission={batch:null,parsing:false,receipts:receiptStore(),message:'',error:'',refreshing:false};
  const endpoint=meta('public-submission-url');
  const submissionsEnabled=()=>state.status.submissions_enabled===true&&Boolean(endpoint);
  const diagnostics=(route,start,renderStart)=>{
    const attrs=document.documentElement.dataset;
    attrs.appState='ready';attrs.activeRoute=route;attrs.routeLoadMs=(renderStart-start).toFixed(2);attrs.routeRenderMs=(performance.now()-renderStart).toFixed(2);
    if(!attrs.appReadyMs)attrs.appReadyMs=performance.now().toFixed(2);
  };
  const drawSubmission=()=>{
    if(normalizeRoute(location.hash)!=='#/submit'||readyRoute!=='#/submit'||accessRevoked)return;
    document.getElementById('app').innerHTML=renderSubmissionPage({...submission,enabled:submissionsEnabled()});
    bindSubmission();
  };
  const refreshReceipts=async()=>{
    if(submission.refreshing||submission.batch?.submitting||!submission.receipts.length||!endpoint)return;
    submission.refreshing=true;
    drawSubmission();
    const result=await refreshSubmissionReceipts({receipts:submission.receipts,submissionUrl:endpoint});
    const byReceipt=new Map(result.receipts.map(item=>[item.receipt,item]));
    submission.receipts=submission.receipts.map(item=>byReceipt.get(item.receipt)||item);
    submission.error=result.failed?`${result.failed} 条审核结果暂时查询失败，仍显示上次记录；请稍后刷新。`:'';
    try{saveReceipts(submission.receipts);}catch{submission.error||='审核结果已更新，但浏览器未能保存；刷新页面后可能仍显示旧记录。';}
    submission.refreshing=false;
    drawSubmission();
  };
  const recheckAccess=()=>{
    if(accessCheck||accessRevoked)return;
    accessCheck=state.checkAccess().then(latest=>{
      state.status=latest;
      if(readyRoute==='#/submit')drawSubmission();
    }).catch(error=>{
      accessRevoked=true;drawGeneration++;readyRoute='';
      document.documentElement.dataset.appState=error.message==='ACCESS_DISABLED'?'closed':'error';
      document.getElementById('app').innerHTML=error.message==='ACCESS_DISABLED'?renderClosed():renderRouteState({route:normalizeRoute(location.hash),error:true});
      document.getElementById('retry-route')?.addEventListener('click',()=>location.reload());
    }).finally(()=>{accessCheck=null;});
  };
  const draw=async(filters,page=1,retry=false)=>{
    if(accessRevoked)return;
    const route=normalizeRoute(location.hash),name=routeDataset(route),generation=++drawGeneration,start=performance.now();
    readyRoute='';
    if(lastRoute!==route){lastRoute=route;recheckAccess();}
    const current=()=>generation===drawGeneration&&normalizeRoute(location.hash)===route;
    const showFailure=(error)=>{
      if(!current())return;
      document.documentElement.dataset.appState='error';
      document.getElementById('app').innerHTML=error?.message==='ACCESS_DISABLED'?renderClosed():renderRouteState({route,error:true});
      document.getElementById('retry-route')?.addEventListener('click',()=>{
        if(error?.message==='VERSION_CHANGED'){location.reload();return;}
        draw(filters,page,true);
      });
    };
    if(errors.has(name)&&!retry){showFailure(new Error(errors.get(name)));return;}
    if(!prepared.has(name)||retry){
      document.documentElement.dataset.appState='loading';
      document.getElementById('app').innerHTML=renderRouteState({route});
    }
    try{
      await state.loadDataset(name);
      if(!current())return;
      errors.delete(name);
      const renderStart=performance.now();
      if(route==='#/submit'){
        prepared.set(name,prepared.get(name)||{});
        readyRoute=route;
        drawSubmission();diagnostics(route,start,renderStart);refreshReceipts();return;
      }
      let content=prepared.get(name);
      if(!content?.records){const dataset=state.manifest.datasets[name];content={summaryRecord:dataset.find(item=>item.kind==='daily_summary')||null,records:dataset.filter(item=>item.kind!=='daily_summary')};prepared.set(name,content);}
      const active=filters||defaultFiltersForRoute(route,content.records),pagination=selectPage(content.records,active,page);
      document.getElementById('app').innerHTML=renderPage({route,manifest:state.manifest,allRecords:content.records,records:pagination.items,totalRecords:pagination.total,pagination,filters:active,summaryRecord:content.summaryRecord});
      readyRoute=route;
      bindEvents(state,active,pagination.page);diagnostics(route,start,renderStart);
    }catch(error){if(current()){errors.set(name,error.message);showFailure(error);}}
  };
  const bindSubmission=()=>{
    document.getElementById('account-table-file')?.addEventListener('change',async event=>{
      if(submission.batch?.submitting)return;
      const file=event.currentTarget.files?.[0];
      submission.batch=null;
      submission.error='';
      submission.message=file?'正在本机解析表格，尚未提交任何账号。':'';
      if(!file){drawSubmission();return;}
      submission.parsing=true;
      drawSubmission();
      try{
        validateAccountFile(file);
        const {previewAccountTable}=await import('./table-import.38c9cae99c4c.mjs');
        submission.batch=await previewAccountTable(await file.arrayBuffer(),file.name,state.manifest.datasets.accounts);
        submission.message='预检完成。确认下方内容后，再提交可导入的账号。';
      }catch(error){
        submission.error=error.message||'表格解析失败，请检查文件格式与五列表头。';
        submission.message='';
      }finally{
        submission.parsing=false;
        drawSubmission();
      }
    });
    document.getElementById('table-submit')?.addEventListener('click',async()=>{
      if(submission.parsing||submission.batch?.submitting||!submissionsEnabled())return;
      submission.error='';
      submission.message='正在逐个提交账号，请等待结果；已成功的账号不会重复提交。';
      try{
        await submitAccountTable({batch:submission.batch,submissionUrl:endpoint,visitorId:visitorId(),enabled:submissionsEnabled(),onChange:drawSubmission,onReceipt:item=>{
          submission.receipts=[item,...submission.receipts].slice(0,20);
          try{saveReceipts(submission.receipts);}catch{submission.error='账号已提交，但浏览器未能保存回执；请暂勿清除此页面。';}
        }});
        submission.message=submission.batch?.rows.some(row=>row.submission_state==='failed'||row.submission_state==='rate_limited')?'本批次已暂停，已成功的账号已保留。请查看各行状态后重试剩余账号。':'本批次处理完成，请查看各行状态。';
      }catch{
        submission.error='提交过程已暂停，已成功的账号不会重发。请稍后重试剩余账号。';
      }
      drawSubmission();
    });
    document.getElementById('refresh-submission-receipts')?.addEventListener('click',refreshReceipts);
  };
  const bindEvents=(loaded,filters,page)=>{
    bindCoverStatus(document);
    bindGalleryDialog(document,loaded.manifest);
    bindVideoDialog(document);
    const form=document.getElementById('filters');
    bindAccountFilter(form);
    document.querySelectorAll('[data-pool]').forEach(button=>button.addEventListener('click',()=>draw({...readFilterForm(form,filters),pool:button.dataset.pool},1)));
    bindFilterForm(form,filters,draw,{resetFilters:defaultFiltersForRoute(normalizeRoute(location.hash),loaded.manifest.datasets[routeDataset(location.hash)])});
    document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{draw(filters,Number(button.dataset.page));scrollTo({top:0,behavior:'smooth'});}));
    document.querySelectorAll('[data-copy-url]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copyUrl);button.textContent='已复制';}catch{button.textContent='复制失败';}}));
  };
  window.addEventListener('hashchange',()=>draw(),{once:false});draw();
}
export async function startBrowserApp(){
  const target=document.getElementById('app');document.documentElement.dataset.appState='loading';
  try{
  const result=await loadPublicApp({statusUrl:meta('public-status-url'),manifestUrl:meta('public-manifest-url')||'./manifest.json',visitUrl:meta('public-visit-url'),visitorId:visitorId(),page:normalizeRoute(location.hash),onProgress:()=>{target.innerHTML=renderRouteState({route:normalizeRoute(location.hash)});}});
  if(result.state!=='ready'){
    document.documentElement.dataset.appState=result.reason==='disabled'?'closed':'error';
    target.innerHTML=result.reason==='disabled'?renderClosed():renderRouteState({route:normalizeRoute(location.hash),error:true});
    document.getElementById('retry-route')?.addEventListener('click',()=>location.reload());
    return;
  }
  bind(result);
  }catch{
    document.documentElement.dataset.appState='error';
    target.innerHTML=renderRouteState({route:normalizeRoute(location.hash),error:true});
    document.getElementById('retry-route')?.addEventListener('click',()=>location.reload());
  }
}
if(typeof document!=='undefined')startBrowserApp();
