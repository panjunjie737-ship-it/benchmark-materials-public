import {DEFAULT_FILTERS,paginateRecords,selectRecords,validatePublicManifest} from './catalog.27cffffbed86.mjs';
import {renderClosed,renderPage,renderSubmissionPage} from './views.ab7b6152e812.mjs';

export const ROUTES=Object.freeze(['#/materials','#/today','#/brief','#/accounts','#/observations','#/submit']);
export function normalizeRoute(hash){return ROUTES.includes(hash)?hash:'#/materials';}
async function json(response){if(!response?.ok)throw new Error(`HTTP_${response?.status||0}`);return response.json();}
export async function loadPublicApp({fetchImpl=fetch,statusUrl,manifestUrl,visitUrl,visitorId='',page='#/materials'}){
  let status;
  try{status=await json(await fetchImpl(statusUrl,{cache:'no-store'}));}catch{return {state:'closed',reason:'status_unavailable'};}
  if(status.enabled!==true)return {state:'closed',reason:'disabled'};
  let manifest;
  try{manifest=validatePublicManifest(await json(await fetchImpl(manifestUrl,{cache:'no-store'})));}catch{return {state:'closed',reason:'manifest_unavailable'};}
  if(status.version&&status.version!==manifest.version)return {state:'closed',reason:'version_mismatch'};
  let visit_failed=false;
  if(visitUrl)try{const visitResponse=await fetchImpl(visitUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor_id:visitorId,page})});if(!visitResponse?.ok)throw new Error(`HTTP_${visitResponse?.status||0}`);}catch{visit_failed=true;}
  return {state:'ready',status,manifest,visit_failed};
}
function visitorId(){const key='benchmark-public-visitor-v1';let value=localStorage.getItem(key);if(!/^[A-Za-z0-9_-]{20,80}$/u.test(value||'')){const bytes=crypto.getRandomValues(new Uint8Array(18));value=btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g,'').slice(0,32);localStorage.setItem(key,value);}return value;}
function meta(name){return document.querySelector(`meta[name="${name}"]`)?.content||'';}
function datasetName(route){return normalizeRoute(route).slice(2);}
export async function submitAccount({fetchImpl=fetch,submissionUrl,visitorId,fields}){const response=await fetchImpl(submissionUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,visitor_id:visitorId})});if(response?.ok)return response.json();const code=response?.status===409?'duplicate':response?.status===429?'daily_limit':'unavailable';throw new Error(code);}
export async function loadSubmissionStatus({fetchImpl=fetch,submissionUrl,receipt}){const response=await fetchImpl(`${submissionUrl}?receipt=${encodeURIComponent(receipt)}`,{cache:'no-store'});if(!response?.ok)throw new Error(response?.status===404?'not_found':'unavailable');return response.json();}
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
  const defaultsFor=route=>({...DEFAULT_FILTERS,sort:route==='#/accounts'?'followers':route==='#/brief'?'view_delta':route==='#/observations'?'checked':'views'});
  const submission={batch:null,parsing:false,receipts:receiptStore(),message:'',error:'',refreshing:false};
  const endpoint=meta('public-submission-url');
  const submissionsEnabled=state.status.submissions_enabled===true&&Boolean(endpoint);
  const drawSubmission=()=>{
    if(normalizeRoute(location.hash)!=='#/submit')return;
    document.getElementById('app').innerHTML=renderSubmissionPage({...submission,enabled:submissionsEnabled});
    bindSubmission();
  };
  const refreshReceipts=async()=>{
    if(submission.refreshing||submission.batch?.submitting||!submission.receipts.length||!endpoint)return;
    submission.refreshing=true;
    drawSubmission();
    const previous=submission.receipts;
    const updates=await Promise.all(previous.map(async item=>{
      try{return {...item,...await loadSubmissionStatus({submissionUrl:endpoint,receipt:item.receipt})};}catch{return item;}
    }));
    const byReceipt=new Map(updates.map(item=>[item.receipt,item]));
    submission.receipts=submission.receipts.map(item=>byReceipt.get(item.receipt)||item);
    submission.refreshing=false;
    drawSubmission();
  };
  const draw=(filters,page=1)=>{const route=normalizeRoute(location.hash);if(route==='#/submit'){drawSubmission();refreshReceipts();return;}const active=filters||defaultsFor(route),dataset=state.manifest.datasets[datasetName(route)],summaryRecord=dataset.find(item=>item.kind==='daily_summary')||null,allRecords=dataset.filter(item=>item.kind!=='daily_summary'),selected=selectRecords(allRecords,active),pagination=paginateRecords(selected,page);document.getElementById('app').innerHTML=renderPage({route,manifest:state.manifest,allRecords,records:pagination.items,totalRecords:pagination.total,pagination,filters:active,summaryRecord});bindEvents(state,active,pagination.page);};
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
      if(submission.parsing||submission.batch?.submitting||!submissionsEnabled)return;
      submission.error='';
      submission.message='正在逐个提交账号，请等待结果；已成功的账号不会重复提交。';
      try{
        await submitAccountTable({batch:submission.batch,submissionUrl:endpoint,visitorId:visitorId(),enabled:submissionsEnabled,onChange:drawSubmission,onReceipt:item=>{
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
    document.querySelectorAll('[data-pool]').forEach(button=>button.addEventListener('click',()=>draw({...filters,pool:button.dataset.pool},1)));
    document.getElementById('filters')?.addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));draw({...filters,...values});});
    document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{draw(filters,Number(button.dataset.page));scrollTo({top:0,behavior:'smooth'});}));
    document.querySelectorAll('[data-media-url]').forEach(button=>button.addEventListener('click',()=>{const dialog=document.getElementById('media-dialog'),video=dialog.querySelector('video'),download=dialog.querySelector('.download'),open=dialog.querySelector('.open-media'),status=document.getElementById('media-status');video.src=button.dataset.mediaUrl;video.poster=button.dataset.mediaPoster||'';download.href=button.dataset.mediaUrl;download.download='';open.href=button.dataset.mediaUrl;document.getElementById('media-label').textContent=button.dataset.mediaLabel;status.textContent='正在加载视频…';video.onloadeddata=()=>{status.textContent='视频已就绪，可以播放或下载。';};video.onerror=()=>{status.textContent='当前网络未能加载视频，请使用“在新窗口打开”重试。';};dialog.showModal();video.load();video.play().catch(()=>{status.textContent='视频已加载，请点击播放。';});}));
    document.querySelectorAll('[data-copy-url]').forEach(button=>button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(button.dataset.copyUrl);button.textContent='已复制';}catch{button.textContent='复制失败';}}));
    document.querySelector('[data-dialog-close]')?.addEventListener('click',()=>{const dialog=document.getElementById('media-dialog'),video=dialog.querySelector('video');video.pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();dialog.close();});
  };
  window.addEventListener('hashchange',()=>draw(),{once:false});draw();
}
export async function startBrowserApp(){const target=document.getElementById('app');const result=await loadPublicApp({statusUrl:meta('public-status-url'),manifestUrl:meta('public-manifest-url')||'./manifest.json',visitUrl:meta('public-visit-url'),visitorId:visitorId(),page:normalizeRoute(location.hash)});if(result.state!=='ready'){target.innerHTML=renderClosed();return;}bind(result);}
if(typeof document!=='undefined')startBrowserApp();
