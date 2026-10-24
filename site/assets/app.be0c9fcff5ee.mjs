import {DEFAULT_FILTERS,paginateRecords,selectRecords,validatePublicManifest} from './catalog.27cffffbed86.mjs';
import {renderClosed,renderPage,renderSubmissionPage} from './views.486a3a9ad2d8.mjs';

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
function receiptStore(){const key='benchmark-public-submissions-v1';try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value.filter(item=>item&&typeof item.receipt==='string').slice(0,20):[];}catch{return [];}}
function saveReceipts(rows){localStorage.setItem('benchmark-public-submissions-v1',JSON.stringify(rows.slice(0,20)));}
function bind(state){
  const defaultsFor=route=>({...DEFAULT_FILTERS,sort:route==='#/accounts'?'followers':route==='#/brief'?'view_delta':route==='#/observations'?'checked':'views'});
  const drawSubmission=async(message='',error='')=>{const rows=receiptStore(),endpoint=meta('public-submission-url');const results=await Promise.all(rows.map(async item=>{try{return {...item,...await loadSubmissionStatus({submissionUrl:endpoint,receipt:item.receipt})};}catch{return item;}}));document.getElementById('app').innerHTML=renderSubmissionPage({receipts:results,message,error});bindSubmission(endpoint,results);};
  const draw=(filters,page=1)=>{const route=normalizeRoute(location.hash);if(route==='#/submit'){drawSubmission();return;}const active=filters||defaultsFor(route),dataset=state.manifest.datasets[datasetName(route)],summaryRecord=dataset.find(item=>item.kind==='daily_summary')||null,allRecords=dataset.filter(item=>item.kind!=='daily_summary'),selected=selectRecords(allRecords,active),pagination=paginateRecords(selected,page);document.getElementById('app').innerHTML=renderPage({route,manifest:state.manifest,allRecords,records:pagination.items,totalRecords:pagination.total,pagination,filters:active,summaryRecord});bindEvents(state,active,pagination.page);};
  const bindSubmission=(endpoint,rows)=>{document.getElementById('account-submission-form')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]');button.disabled=true;try{if(!endpoint)throw new Error('unavailable');const fields=Object.fromEntries(new FormData(form)),result=await submitAccount({submissionUrl:endpoint,visitorId:visitorId(),fields});saveReceipts([{receipt:result.receipt,status:result.status,username:String(fields.account||'').replace(/^@/,'')},...rows]);await drawSubmission('提交成功，正在等待管理员审核。','');}catch(error){const messages={duplicate:'该账号已经提交或正在审核。',daily_limit:'今日提交数量已达上限，请明天再试。',unavailable:'提交服务暂时不可用，请稍后重试。'};await drawSubmission('',messages[error.message]||messages.unavailable);}});};
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
