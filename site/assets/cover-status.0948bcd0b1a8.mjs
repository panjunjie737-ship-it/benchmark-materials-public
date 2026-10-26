const bindings=new WeakMap();

function retrySource(source){
  const value=String(source||'');
  if(!value||/^(?:blob|data):/i.test(value))return value;
  const hashAt=value.indexOf('#');
  const base=hashAt>=0?value.slice(0,hashAt):value;
  const hash=hashAt>=0?value.slice(hashAt):'';
  const separator=base.includes('?')?'&':'?';
  return `${base}${separator}_cover_retry=1${hash}`;
}

function isPlayable(frame){
  return frame?.tagName==='BUTTON'&&Boolean(frame.dataset?.mediaUrl||frame.dataset?.galleryIds);
}

function failedMessage(frame,retried=false){
  const prefix=retried?'封面再次加载失败。':'封面加载失败。';
  return isPlayable(frame)?`${prefix}仍可播放或查看作品。`:prefix;
}

function bindImage(image,document){
  const frame=image.closest?.('.media-frame');
  if(!frame||!document?.createElement)return null;

  let status=null;
  let retryUsed=false;
  let destroyed=false;
  const connected=()=>!destroyed&&image.isConnected!==false&&frame.isConnected!==false;

  const removeStatus=()=>{
    status?.remove?.();
    status=null;
  };

  const setStatus=message=>{
    if(!connected())return null;
    if(!status){
      status=document.createElement('div');
      status.dataset.coverStatus='true';
      status.className='cover-status';
      status.setAttribute('role','status');
      status.setAttribute('aria-live','polite');
      frame.after(status);
    }
    status.textContent=message;
    return status;
  };

  const onRetry=event=>{
    event.preventDefault?.();
    event.stopPropagation?.();
    if(retryUsed||!connected())return;
    retryUsed=true;
    event.currentTarget?.remove?.();
    setStatus('正在重新加载封面…');
    const source=image.currentSrc||image.src;
    image.src=retrySource(source);
  };

  const onError=()=>{
    if(!connected())return;
    const current=setStatus(failedMessage(frame,retryUsed));
    if(!current||retryUsed)return;
    const retry=document.createElement('button');
    retry.type='button';
    retry.dataset.coverRetry='true';
    retry.className='cover-retry';
    retry.textContent='重试封面';
    retry.setAttribute('aria-label','重新加载封面');
    retry.addEventListener('click',onRetry,{once:true});
    current.append(retry);
  };

  const onLoad=()=>{
    if(!connected())return;
    if(retryUsed)setStatus('封面已重新加载。');
    else removeStatus();
  };

  image.addEventListener('error',onError);
  image.addEventListener('load',onLoad);
  const cleanup=()=>{
    if(destroyed)return;
    destroyed=true;
    image.removeEventListener('error',onError);
    image.removeEventListener('load',onLoad);
    removeStatus();
    bindings.delete(image);
  };
  bindings.set(image,cleanup);
  return cleanup;
}

export function bindCoverStatus(root=document){
  const document=root?.ownerDocument||root;
  const cleanups=[];
  for(const image of root?.querySelectorAll?.('.media-frame img')||[]){
    if(bindings.has(image))continue;
    const cleanup=bindImage(image,document);
    if(cleanup)cleanups.push(cleanup);
  }
  return ()=>{
    for(const cleanup of cleanups)cleanup();
  };
}
