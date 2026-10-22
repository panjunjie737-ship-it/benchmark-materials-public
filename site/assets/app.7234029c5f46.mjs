import {DEFAULT_FILTERS,paginateRecords,selectRecords,validatePublicManifest} from './catalog.22c4d6cab96c.mjs';
import {renderClosed,renderPage} from './views.604cd8f79c62.mjs';

export const ROUTES=Object.freeze(['#/materials','#/today','#/brief','#/accounts','#/observations']);
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
function bind(state){
  const draw=(filters=DEFAULT_FILTERS,page=1)=>{const route=normalizeRoute(location.hash);const selected=selectRecords(state.manifest.datasets[datasetName(route)],filters),pagination=paginateRecords(selected,page);document.getElementById('app').innerHTML=renderPage({route,manifest:state.manifest,records:pagination.items,totalRecords:pagination.total,pagination,filters});bindEvents(state,filters,pagination.page);};
  const bindEvents=(loaded,filters,page)=>{
    document.querySelectorAll('[data-pool]').forEach(button=>button.addEventListener('click',()=>draw({...filters,pool:button.dataset.pool},1)));
    document.getElementById('filters')?.addEventListener('submit',event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));draw({...filters,...values});});
    document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>{draw(filters,Number(button.dataset.page));scrollTo({top:0,behavior:'smooth'});}));
    document.querySelectorAll('[data-media-url]').forEach(button=>button.addEventListener('click',()=>{const dialog=document.getElementById('media-dialog'),video=dialog.querySelector('video'),download=dialog.querySelector('.download');video.src=button.dataset.mediaUrl;download.href=button.dataset.mediaUrl;download.download='';document.getElementById('media-label').textContent=button.dataset.mediaLabel;dialog.showModal();}));
    document.querySelector('[data-dialog-close]')?.addEventListener('click',()=>{const dialog=document.getElementById('media-dialog'),video=dialog.querySelector('video');video.pause();video.removeAttribute('src');dialog.close();});
  };
  window.addEventListener('hashchange',()=>draw(DEFAULT_FILTERS),{once:false});draw();
}
export async function startBrowserApp(){const target=document.getElementById('app');const result=await loadPublicApp({statusUrl:meta('public-status-url'),manifestUrl:meta('public-manifest-url')||'./manifest.json',visitUrl:meta('public-visit-url'),visitorId:visitorId(),page:normalizeRoute(location.hash)});if(result.state!=='ready'){target.innerHTML=renderClosed();return;}bind(result);}
if(typeof document!=='undefined')startBrowserApp();
