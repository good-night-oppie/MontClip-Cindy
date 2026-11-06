'use strict';
// Host mode uses only spawnEntry's public stdout.on / stdin.write / on(exit) / kill.
function createChannel(child,{host=false,closeMs=6000,requestMs=120000,onExit=()=>{}}={}){
 let alive=true,failed=null,closing=null,buf='',seq=0,writeQueue=Promise.resolve(),resolveExit;
 const exited=new Promise(r=>{resolveExit=r;}),pending=new Map();
 const rejectAll=e=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();};
 const channel={child,get alive(){return alive;},get failed(){return failed;},exited,ready:null,request,close};
 function killed(){try{const r=child.kill();if(r&&typeof r.then==='function')r.catch(()=>{});}catch{/* Exit confirmation remains mandatory. */}}
 function close(){
  if(closing)return closing;
  failed ||= Error('candidate engine is closing');
  closing=(async()=>{if(!alive)return;let timer,escalate;
   try{
    if(host)killed();else{try{child.stdin.end();}catch{killed();}escalate=setTimeout(killed,Math.max(1,closeMs/2));}
    await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('candidate child exit not confirmed'),{code:'CHILD_EXIT_UNCONFIRMED'})),closeMs);})]);
   }finally{clearTimeout(timer);clearTimeout(escalate);}
  })();
  closing.then(()=>rejectAll(failed),e=>rejectAll(e));return closing;
 }
 async function fail(e){failed ||= e;try{await close();}catch(cleanup){rejectAll(cleanup);throw cleanup;}rejectAll(failed);throw failed;}
 function failObserved(e){fail(e).catch(()=>{});}
 function request(method,params){
  if(failed||!alive)return Promise.reject(failed||Error('candidate engine stopped'));
  if(pending.size>=32)return Promise.reject(Error('candidate request queue full'));
  const id=++seq,text=JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n';
  if(Buffer.byteLength(text)>262144)return Promise.reject(Error('candidate request too large'));
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>failObserved(Error('candidate engine timeout')),requestMs);pending.set(id,{resolve,reject,timer});
   writeQueue=writeQueue.then(async()=>{
    if(failed||!alive)return;
    if(host){const result=child.stdin.write(text);const value=result&&typeof result.then==='function'?await result:result;
     if(value===false)throw Object.assign(Error('host write returned unsupported backpressure signal'),{code:'HOST_WRITE_BACKPRESSURE_UNSUPPORTED'});
    }else await new Promise((res,rej)=>child.stdin.write(text,e=>e?rej(e):res()));
   }).catch(failObserved);
  });
 }
 try{
  // Register exit before any other child surface can throw during initialization.
  child.on('exit',()=>{if(!alive)return;alive=false;resolveExit();if(!failed)rejectAll(Error('candidate engine stopped'));onExit();});
  if(!host){child.on('error',failObserved);child.stdin.on('error',failObserved);child.stderr.on('data',b=>process.stderr.write(b));}
  child.stdout.on('data',b=>{if(failed)return;buf+=b;if(buf.length>1048576){failObserved(Error('invalid child protocol: oversized line'));return;}let n;
   while((n=buf.indexOf('\n'))>=0){let m;try{m=JSON.parse(buf.slice(0,n));if(!m||typeof m!=='object'||Array.isArray(m)||!Number.isInteger(m.id)||(!Object.hasOwn(m,'result')&&!Object.hasOwn(m,'error'))||(m.error&&typeof m.error.message!=='string'))throw Error('shape');}catch{failObserved(Error('invalid child protocol'));return;}buf=buf.slice(n+1);const p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Object.assign(Error(m.error.data?.code==='DATA_DIR_IN_USE'&&m.error.data?.reason==='LOCK_OWNER_UNVERIFIED'?'Writer lock ownership cannot be verified.':m.error.message),{code:m.error.data?.code,...(m.error.data?.code==='DATA_DIR_IN_USE'&&m.error.data?.reason==='LOCK_OWNER_UNVERIFIED'?{reason:'LOCK_OWNER_UNVERIFIED'}:{})})):p.resolve(m.result);}
  });
  channel.ready=Promise.resolve();
 }catch(e){channel.ready=fail(e);}
 return channel;
}
module.exports={createChannel};
