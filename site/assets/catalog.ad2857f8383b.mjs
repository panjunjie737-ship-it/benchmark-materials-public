const DATASET_NAMES = ['materials','today','brief','accounts','observations'];
const BLOCKED_KEY = /password|session|token|cookie|source_data|raw_metadata|local_.*path|original_path/i;
const CONTENT_TYPES = new Set(['product_showcase','product_selling','product_talking','creator_selling','ugc_review','comparison','tutorial','story','unboxing','live_clip','brand_ad','unknown','']);
const MEDIA_TYPES = new Map([['.jpg','image/jpeg'],['.jpeg','image/jpeg'],['.png','image/png'],['.webp','image/webp'],['.mp4','video/mp4']]);

export const DEFAULT_FILTERS = Object.freeze({
  pool:'company',query:'',category:'',product:'',account:'',country:'',date_from:'',date_to:'',
  content_type:'',review_status:'',media:'',min_views:'',signal:'',report_day:'',
  classification_scope:'',state:'',sort:'views',direction:'desc'
});

function fail(){throw new Error('INVALID_PUBLIC_MANIFEST');}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function string(value,max,{empty=true}={}){if(typeof value!=='string'||value.length>max||/[\u0000-\u001f\u007f]/u.test(value)||(!empty&&!value.trim()))fail();return value;}
function id(value){return string(value,140,{empty:false})&&(/^[A-Za-z0-9_-]+$/u.test(value)?value:fail());}
function labels(value){if(!Array.isArray(value)||value.length>50)fail();return [...new Set(value.map(item=>string(item,120,{empty:false})))];}
function date(value,nullable=true){if(value===null&&nullable)return null;if(typeof value!=='string'||value.length>40||!/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/u.test(value))fail();const normalized=value.includes(' ')?value.replace(' ','T')+'Z':value;if(!Number.isFinite(Date.parse(normalized)))fail();return value;}
function url(value){if(value===''||value===undefined)return '';if(typeof value!=='string'||value.length>1000)fail();let parsed;try{parsed=new URL(value);}catch{fail();}if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash)fail();return value;}
function number(value){if(value===null)return null;if(!Number.isSafeInteger(value)||value<0)fail();return value;}
function signedNumber(value){if(value===null)return null;if(!Number.isSafeInteger(value))fail();return value;}
function decimal(value){if(value===null)return null;if(typeof value!=='number'||!Number.isFinite(value))fail();return value;}
function scanKeys(value){if(Array.isArray(value)){value.forEach(scanKeys);return;}if(!plain(value))return;for(const [key,child] of Object.entries(value)){if(BLOCKED_KEY.test(key))fail();scanKeys(child);}}

function metrics(value){if(!plain(value))fail();const result={};for(const [key,item] of Object.entries(value)){if(!/^[a-z][a-z0-9_]{0,50}$/u.test(key))fail();result[key]=number(item);}return result;}

function record(raw,mediaIds){
  if(!plain(raw))fail();
  const result={
    id:id(raw.id), pool:['company','market','all'].includes(raw.pool)?raw.pool:fail(),
    account:string(raw.account??'',120), account_display:string(raw.account_display??raw.display_name??'',160),
    description:string(raw.description??'',4000), published_at:date(raw.published_at??null),
    categories:labels(raw.categories??[]), products:labels(raw.products??[]), metrics:metrics(raw.metrics??{}),
    media_ids:Array.isArray(raw.media_ids??[])&&(raw.media_ids??[]).length<=200?(raw.media_ids??[]).map(id):fail(),
  };
  for(const mediaId of result.media_ids)if(!mediaIds.has(mediaId))fail();
  for(const key of ['kind','post_id','username','country','classification_scope','content_kind','content_type','report_day','status','checked_at','report_published_at','review_status','watermark_status','signal_quality','receipt_status','receipt_reason','state','account_status','first_seen_at','updated_at','last_scanned_at','classification_reason','media_status','media_reason']){
    if(raw[key]!==undefined&&raw[key]!==null)result[key]=string(raw[key],160);
  }
  for(const key of ['feature_tags','signal_tags'])if(raw[key]!==undefined)result[key]=labels(raw[key]);
  for(const key of ['has_video','has_media','is_viral','classification_locked'])if(raw[key]!==undefined){if(typeof raw[key]!=='boolean')fail();result[key]=raw[key];}
  for(const key of ['viral_score','classification_confidence'])if(raw[key]!==undefined)result[key]=decimal(raw[key]);
  for(const key of ['view_delta'])if(raw[key]!==undefined)result[key]=signedNumber(raw[key]);
  for(const key of ['previous_views','current_views','priority'])if(raw[key]!==undefined)result[key]=number(raw[key]);
  if(result.content_type!==undefined&&!CONTENT_TYPES.has(result.content_type))fail();
  for(const key of ['source_url','profile_url'])if(raw[key]!==undefined)result[key]=url(raw[key]);
  return result;
}

function mediaEntry(mediaId,raw){
  if(!plain(raw)||!/^[a-f0-9]{64}$/u.test(raw.sha256)||!Number.isSafeInteger(raw.bytes)||raw.bytes<=0||raw.bytes>=2*1024**3)fail();
  const extension=string(raw.extension,8,{empty:false}).toLowerCase();
  if(MEDIA_TYPES.get(extension)!==raw.content_type||!['cover','image','clip','video','full','hd'].includes(raw.kind))fail();
  if(['cover','image'].includes(raw.kind)!==raw.content_type.startsWith('image/'))fail();
  const dimension=value=>value===null?null:(Number.isSafeInteger(value)&&value>0&&value<=16384?value:fail());
  const duration=raw.duration_seconds===null?null:(typeof raw.duration_seconds==='number'&&Number.isFinite(raw.duration_seconds)&&raw.duration_seconds>0&&raw.duration_seconds<=86400?raw.duration_seconds:fail());
  return {id:mediaId,sha256:raw.sha256,bytes:raw.bytes,content_type:raw.content_type,extension,kind:raw.kind,quality:string(raw.quality??'',80),width:dimension(raw.width),height:dimension(raw.height),duration_seconds:duration,url:url(raw.url??'')};
}

export function validatePublicManifest(input){
  if(typeof input==='string'){if(new TextEncoder().encode(input).length>1024**3)fail();try{input=JSON.parse(input);}catch{fail();}}
  if(!plain(input)||input.schema_version!==1)fail();scanKeys(input);
  const version=id(input.version);const generated_at=date(input.generated_at,false);
  if(!plain(input.media))fail();const media=new Map();
  for(const [mediaId,raw] of Object.entries(input.media)){const safeId=id(mediaId);if(media.has(safeId))fail();media.set(safeId,mediaEntry(safeId,raw));}
  if(!plain(input.datasets)||Object.keys(input.datasets).sort().join(',')!==[...DATASET_NAMES].sort().join(','))fail();
  const datasets={};
  for(const name of DATASET_NAMES){const rows=input.datasets[name];if(!Array.isArray(rows)||rows.length>100000)fail();const seen=new Set();datasets[name]=rows.map(raw=>{const item=record(raw,media);if(seen.has(item.id))fail();seen.add(item.id);return item;});}
  for(const rows of Object.values(datasets))for(const item of rows){
    const attached=item.media_ids.map(mediaId=>media.get(mediaId));
    if(attached.some(entry=>entry.content_type.startsWith('video/'))&&!attached.some(entry=>entry.kind==='cover'))fail();
  }
  return {schema_version:1,version,generated_at,datasets,media};
}

export function validateCatalogIndex(input){
  if(!plain(input)||input.schema_version!==2)fail();
  scanKeys(input);
  const version=id(input.version),generated_at=date(input.generated_at,false);
  if(!plain(input.datasets)||Object.keys(input.datasets).sort().join(',')!==[...DATASET_NAMES].sort().join(','))fail();
  const datasets={};
  for(const name of DATASET_NAMES){
    const item=input.datasets[name];
    if(!plain(item)||typeof item.sha256!=='string'||! /^[a-f0-9]{64}$/u.test(item.sha256))fail();
    if(item.url!==`./data/${name}.${item.sha256.slice(0,12)}.json`)fail();
    if(!Number.isSafeInteger(item.bytes)||item.bytes<=0||item.bytes>=1024**3)fail();
    if(!Number.isSafeInteger(item.count)||item.count<0||item.count>100000)fail();
    datasets[name]={url:item.url,sha256:item.sha256,bytes:item.bytes,count:item.count};
  }
  return {schema_version:2,version,generated_at,datasets};
}

export function validateDatasetChunk(input,index,name){
  if(!DATASET_NAMES.includes(name))fail();
  const chunk=validatePublicManifest(input);
  if(chunk.version!==index.version||chunk.generated_at!==index.generated_at)fail();
  if(chunk.datasets[name].length!==index.datasets[name].count)fail();
  for(const other of DATASET_NAMES)if(other!==name&&chunk.datasets[other].length)fail();
  const referenced=new Set(chunk.datasets[name].flatMap(row=>row.media_ids));
  if(referenced.size!==chunk.media.size)fail();
  return chunk;
}

function datePart(value){return value?value.slice(0,10):'';}
function dateValue(value){if(!value)return null;return Date.parse(value.includes('T')?value:value.replace(' ','T')+'Z');}
function sortValue(record,key){
  if(key==='published')return dateValue(record.published_at);
  if(key==='checked')return dateValue(record.checked_at||record.last_scanned_at);
  if(key==='account')return (record.account_display||record.display_name||record.account||record.username||'').toLocaleLowerCase();
  if(key==='viral_score'||key==='view_delta')return record[key]??null;
  return record.metrics?.[key]??null;
}

export function selectRecords(records,filters={}){
  const f={...DEFAULT_FILTERS,...filters};
  const sorts=['views','likes','comments','shares','published','checked','followers','material_count','observation_count','viral_score','view_delta','account'];
  if(!['company','market','all'].includes(f.pool)||!sorts.includes(f.sort)||!['asc','desc'].includes(f.direction))return [];
  const query=String(f.query||'').trim().toLocaleLowerCase();
  const minimum=String(f.min_views||'').trim()===''?null:Number(f.min_views);
  const filtered=records.filter(item=>(f.pool==='all'||item.pool===f.pool||item.pool==='all')
    &&(!query||[item.account,item.account_display,item.display_name,item.username,item.description,item.post_id,...item.categories,...item.products,...(item.feature_tags||[]),...(item.signal_tags||[])].join(' ').toLocaleLowerCase().includes(query))
    &&(!f.category||item.categories.includes(f.category))&&(!f.product||item.products.includes(f.product))
    &&(!f.account||item.account===f.account||item.username===f.account)
    &&(!f.country||item.country===f.country)
    &&(!f.content_type||item.content_type===f.content_type)
    &&(!f.review_status||item.review_status===f.review_status)
    &&(!f.media||f.media==='available'&&(item.has_media??item.has_video)===true||f.media==='playable'&&item.has_video===true||f.media==='missing'&&(item.has_media??item.has_video)!==true)
    &&(minimum===null||Number.isFinite(minimum)&&(item.metrics?.views??-1)>=minimum)
    &&(!f.signal||item.signal_quality===f.signal||(item.signal_tags||[]).includes(f.signal))
    &&(!f.report_day||item.report_day===f.report_day)
    &&(!f.classification_scope||item.classification_scope===f.classification_scope)
    &&(!f.state||item.state===f.state)
    &&(!f.date_from||(datePart(item.published_at)&&datePart(item.published_at)>=f.date_from))
    &&(!f.date_to||(datePart(item.published_at)&&datePart(item.published_at)<=f.date_to)));
  const values=new Map(filtered.map(item=>[item,sortValue(item,f.sort)]));
  return filtered.toSorted((a,b)=>{const av=values.get(a),bv=values.get(b);if(av===null&&bv===null)return a.id.localeCompare(b.id);if(av===null)return 1;if(bv===null)return -1;const order=av===bv?a.id.localeCompare(b.id):(av<bv?-1:1);return f.direction==='asc'?order:-order;});
}

export function paginateRecords(records,page=1,pageSize=24){
  const safeSize=Number.isSafeInteger(pageSize)&&pageSize>0&&pageSize<=100?pageSize:24;
  const total=records.length,totalPages=Math.max(1,Math.ceil(total/safeSize));
  const requested=Number.isSafeInteger(page)&&page>0?page:1,safePage=Math.min(requested,totalPages);
  const start=(safePage-1)*safeSize;
  return {items:records.slice(start,start+safeSize),page:safePage,pageSize:safeSize,total,totalPages};
}
