'use strict';
// Run against an extracted Forge package, never a user instance. Synthetic inputs only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {fork,spawn,execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const {serverLease,pipeClient,verifyBrowserArguments}=require('../engine/real-tests/privacy-runtime.cjs');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
if(fs.existsSync(out))throw Error('Evidence directory must be new');fs.mkdirSync(out,{recursive:true});
const app=path.join(root,'node/app'),FF=require(path.join(app,'ffmpeg-path.js'));
const ff=FF.path('ffmpeg'),probe=FF.path('ffprobe');
const trialRoot=fs.mkdtempSync(path.join(process.platform==='linux'?'/tmp':os.tmpdir(),'mct-'));fs.chmodSync(trialRoot,0o700);fs.writeFileSync(path.join(trialRoot,'candidate-identity.json'),JSON.stringify({id:'montclip-candidate'}));
const session='candidate-proof',data=path.join(trialRoot,'tasks',crypto.createHash('sha256').update(session).digest('hex'));fs.mkdirSync(data,{recursive:true,mode:0o700});
const binaries=path.join(data,'runtime/ffmpeg',process.platform+'-'+process.arch);fs.mkdirSync(binaries,{recursive:true});
for(const task of ['candidate-proof','other-task']){const dir=path.join(trialRoot,'tasks',crypto.createHash('sha256').update(task).digest('hex'),'runtime/ffmpeg',process.platform+'-'+process.arch);fs.mkdirSync(dir,{recursive:true});for(const [name,file] of Object.entries({ffmpeg:ff,ffprobe:probe}))fs.linkSync(fs.realpathSync(file),path.join(dir,name+(process.platform==='win32'?'.exe':'')));}
for(const d of ['media','home','xdg','profile','tmp'])fs.mkdirSync(path.join(data,d),{mode:0o700});
const env={...process.env,TMPDIR:path.join(data,'tmp'),TMP:path.join(data,'tmp'),TEMP:path.join(data,'tmp'),XDG_CONFIG_HOME:path.join(data,'xdg'),XDG_CACHE_HOME:path.join(data,'xdg'),MONTCLIP_FFMPEG:ff,MONTCLIP_FFPROBE:probe,FABLECUT_DATA_DIR:data,FABLECUT_NO_FS_WATCH:'1'};
const run=(args)=>execFileSync(ff,['-v','error',...args],{windowsHide:true,timeout:30000,maxBuffer:32*1024*1024});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let srv,browser,pipe,hardTimedOut=false,closing=null;const ownedEnginePids=new Set();
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function closeOwned(){if(closing)return closing;return closing=(async()=>{let closeTimer;try{await Promise.race([pipe?.send("Browser.close"),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error("browser close deadline")),2000);})]);}catch{}finally{clearTimeout(closeTimer);}pipe?.close();await stop(browser);if(srv&&srv.exitCode===null&&!srv.signalCode){const exited=new Promise(r=>srv.once("exit",r));srv.stdin.end();const deadline=setTimeout(()=>{for(const pid of ownedEnginePids)if(alive(pid))process.kill(pid);srv.kill();},8000);await exited;clearTimeout(deadline);}for(let i=0;i<30&&[...ownedEnginePids].some(alive);i++)await new Promise(r=>setTimeout(r,100));})();}
const stop=child=>new Promise(resolve=>{if(!child||child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);child.kill();});
const hard=setTimeout(()=>{hardTimedOut=true;pipe?.close();browser?.kill();for(const pid of ownedEnginePids)if(alive(pid)){try{process.kill(pid);}catch{}}srv?.kill();},180000);
async function workflow(format) {
  const file=path.join(out,'synthetic.'+format);
  run(['-y','-f','lavfi','-i','color=black:s=320x180:r=30:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable=gte(t\\,1)','-f','lavfi','-i','aevalsrc=if(gte(t\\,1)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=2',...(process.argv.includes('--hevc')?['-c:v','libx265','-tag:v','hvc1']:['-c:v','libx264']),'-pix_fmt','yuv420p','-c:a','aac','-shortest',file]);
  return {format,bytes:fs.readFileSync(file).toString('base64')};
}
async function pageRun(input) {
  const bytes=Uint8Array.from(atob(input.bytes),c=>c.charCodeAt(0));
  const media=await importFiles([new File([bytes],'synthetic.'+input.format,{type:input.format==='flv'?'video/x-flv':'video/mp4'})]);
  if(media.length!==1||media[0].transient)throw Error('persistent import failed');
  const m=media[0];
  if(input.format==='flv'&&(!m.originalSrc||/\.flv$/i.test(m.src)))throw Error('FLV was not prepared to a browser-readable proxy');
  const c=addClipFromMedia(m,'V1',0);if(!c)throw Error('timeline insertion failed');
  await new Promise(r=>setTimeout(r,500));
  loadSourceFromMedia(m,{time:1.5});await seekFrame(runtime.sourceEl,1.5);const probeCanvas=document.createElement('canvas');probeCanvas.width=320;probeCanvas.height=180;const pc=probeCanvas.getContext('2d');pc.drawImage(runtime.sourceEl,0,0,320,180);const sourcePixel=[...pc.getImageData(160,90,1,1).data];setMonitorMode('program');await seekFrame(getClipEl(c),1.5);runtime.sampling=true;state.selId=null;els.preview.width=320;els.preview.height=180;drawFrame(1.5);const programPixel=[...ctx2d.getImageData(160,90,1,1).data];runtime.sampling=false;
  const before=project.clips.find(x=>x.id===c.id).props.x;
  pushUndo();if(!setAnimProp(c,'x',37))throw Error('property change refused');scheduleSave();
  const changed=project.clips.find(x=>x.id===c.id).props.x;
  undo();const restored=project.clips.find(x=>x.id===c.id).props.x;
  if(changed!==37||restored!==before)throw Error('undo did not restore position');
  if(!await flushSave())throw Error('save failed');await fetchEncodeProfiles();

  return {sourcePixel,programPixel,imported:{src:m.src,originalSrc:m.originalSrc,preparation:m.preparation},clipCount:project.clips.length,before,changed,restored,project:projectJSON()};
}
(async()=>{const receipt={source:JSON.parse(fs.readFileSync(path.join(root,'SOURCE.json'))),platform:process.platform,node:process.version,hevcSource:process.argv.includes("--hevc"),cases:[]};
 try {
  fs.writeFileSync(path.join(data,'project.json'),JSON.stringify({name:'Synthetic candidate',width:320,height:180,fps:30,media:[],clips:[]}));
  const proof=crypto.randomBytes(32).toString('hex'),proofPath='/media/proof.txt';fs.writeFileSync(path.join(data,'media/proof.txt'),proof);
  srv=spawn(process.execPath,[path.join(root,'node/worker.cjs')],{env:{...env,MONTCLIP_CANDIDATE_DATA:trialRoot,MONTCLIP_CINDY_DATA:undefined,MONTCLIP_CINDY_APP:undefined},stdio:['pipe','pipe','pipe'],windowsHide:true});
  srv.stderr.on('data',x=>fs.appendFileSync(path.join(out,'server.log'),x));let rpcId=0,buffer='';const pending=new Map();
  srv.stdout.on('data',b=>{buffer+=b;let n;while((n=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);pending.get(m.id)?.(m);pending.delete(m.id);}});
  const rpc=(method,params={})=>new Promise((resolve,reject)=>{const id=++rpcId,timer=setTimeout(()=>reject(Error('router RPC timeout')),20000);pending.set(id,m=>{clearTimeout(timer);m.error?reject(Error(m.error.message)):resolve(m.result)});srv.stdin.write(JSON.stringify({id,method,params})+'\n');});
  const started=await rpc('montclip/start',{session});ownedEnginePids.add(started.enginePid);assert.equal(started.dataDir,data);assert.equal(started.pluginId,'montclip-candidate');receipt.router={...started};delete receipt.router.url;
  const token=new URL(started.url).searchParams.get('token');
  const life=require('../engine/real-tests/privacy-runtime.cjs').lifetime(srv);const lease={...life,origin:started.origin};
  assert.equal(await(await fetch(lease.origin+proofPath,{headers:{'X-MontClip-Session':token}})).text(),proof);
  const browserPath=require(path.join(app,'export-jobs.js')).findBrowser();if(!browserPath)throw Error('No existing browser');
  const profile=path.join(data,'profile');
  browser=spawn(browserPath,['--headless=new','--enable-automation','--remote-debugging-pipe','--user-data-dir='+profile,'--no-first-run','about:blank'],{env,stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
  pipe=pipeClient(browser,{timeoutMs:90000});lease.onFailure(()=>pipe.close());
  verifyBrowserArguments((await pipe.send('Browser.getBrowserCommandLine')).arguments,profile);
  receipt.browser=await pipe.send('Browser.getVersion');receipt.tools={};
  for(const [name,file]of Object.entries({ffmpeg:ff,ffprobe:probe}))receipt.tools[name]={file,sha256:hash(file),version:execFileSync(file,['-version'],{encoding:'utf8',windowsHide:true,timeout:10000}).split(/\r?\n/)[0]};
  const {targetId}=await pipe.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await pipe.send('Target.attachToTarget',{targetId,flatten:true});
  const send=(method,params={})=>{lease.assertAlive();return pipe.send(method,params,sessionId);};
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  pipe.onEvent(m=>{if(m.sessionId!==sessionId||m.method!=='Fetch.requestPaused')return;const {requestId,request}=m.params;const allowed=new URL(request.url).origin===lease.origin;send(allowed?'Fetch.continueRequest':'Fetch.failRequest',allowed?{requestId}:{requestId,errorReason:'BlockedByClient'}).catch(()=>pipe.close());});
  await send('Network.enable');await send('Network.setExtraHTTPHeaders',{headers:{'X-MontClip-Session':token}});await send('Fetch.enable',{patterns:[{urlPattern:'http*',requestStage:'Request'}]});
  await send('Page.navigate',{url:lease.origin});
  let ready=false;for(let i=0;i<150;i++){try{ready=await ev('state.connected && !!project');if(ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'editor readiness');
  for(const item of (process.argv.includes('--hevc')?[{format:'mp4'}]:[{format:'mp4'},{format:'flv'},{format:'mp4',other:true}])) {
   const {format}=item,label=format+(item.other?'-other':'');let activeData=data;
   if(item.other){const sibling=await rpc('montclip/start',{session:'other-task'});ownedEnginePids.add(sibling.enginePid);activeData=sibling.dataDir;lease.origin=sibling.origin;await send('Network.setExtraHTTPHeaders',{headers:{'X-MontClip-Session':new URL(sibling.url).searchParams.get('token')}});await send('Page.navigate',{url:sibling.url});let loaded=false;for(let i=0;i<100;i++){try{loaded=await ev('location.origin === '+JSON.stringify(sibling.origin)+' && state.connected');if(loaded)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(loaded);}
   // Clear the previous case through the real project API, retaining only synthetic media.
   if(format==='flv')await ev("applyProject({...projectJSON(),media:[],clips:[]});scheduleSave();flushSave()");
   const input=await workflow(format),result=await ev('('+pageRun.toString()+')('+JSON.stringify(input)+')');
   const other=await rpc('montclip/start',{session:'other-task'});ownedEnginePids.add(other.enginePid);if(!item.other)assert.notEqual(other.origin,lease.origin);assert.notEqual(other.dataDir,data);
   const oldTimeOrigin=await ev('performance.timeOrigin');await send('Page.reload');let reopened=false;for(let i=0;i<100;i++){try{reopened=await ev('performance.timeOrigin !== '+oldTimeOrigin+' && state.connected && project.clips.length>=2');if(reopened)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(reopened,'saved task project reopened');
   result.reopened=await ev('({name:project.name,clips:project.clips.map(c=>({kind:c.kind,x:c.props.x,pan:c.props.pan}))})');
   result.result=await ev("(async()=>{await fetchEncodeProfiles();return fastExport({silent:true,delivery:normalizeDelivery({preset:'custom',width:320,height:180,fps:30,video:{codec:'h264',encoder:'libx264'},audio:{codec:'aac'}}).spec});})()");assert.ok(result.result.outputs?.[0]?.ok,JSON.stringify(result.result));
   const src=result.result.outputs[0].src,file=path.join(activeData,decodeURIComponent(src).replace(/^\//,''));
   const target=path.join(out,label+'-export.mp4');fs.copyFileSync(file,target);
   const metadata=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-show_format','-of','json',target],{encoding:'utf8',windowsHide:true,timeout:10000}));
   assert.ok(metadata.streams.some(s=>s.codec_name==='h264'));assert.ok(metadata.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(+metadata.format.duration-2)<0.2);
   const onset=file=>{const pixels=run(['-i',file,'-vf','scale=1:1,format=gray','-f','rawvideo','-']);const pcm=run(['-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','-']);const frame=pixels.findIndex(v=>v>128);let sample=-1;for(let i=0;i<pcm.length/4;i++)if(Math.abs(pcm.readFloatLE(i*4))>0.05){sample=i;break;}assert.ok(frame>=0&&sample>=0);return{frame,sample,offset:sample/48000-frame/30};};
   const sourceSync=onset(path.join(out,'synthetic.'+format)),outputSync=onset(target),deltaMs=1000*(outputSync.offset-sourceSync.offset);assert.ok(Math.abs(deltaMs)<=40);
   const levels={};for(const channel of [0,1]){const pcm=run(['-i',target,'-af','pan=mono|c0=c'+channel,'-f','f32le','-']);let sum=0;for(let i=0;i<pcm.length;i+=4)sum+=pcm.readFloatLE(i)**2;levels[channel]=20*Math.log10(Math.sqrt(sum/(pcm.length/4)));}assert.ok(levels[0]>-40&&levels[1]>-40&&Math.abs(levels[0]-levels[1])<1,'mono must reach both channels '+JSON.stringify(levels));
   receipt.cases.push({format,task:item.other?"other-task":session,levels,...result,output:target,sha256:hash(target),bytes:fs.statSync(target).size,duration:metadata.format.duration,sourceSync,outputSync,deltaMs});
   fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(label+' import/edit/undo/export passed');
  }
  receipt.ok=true;
 }catch(e){receipt.error=String(e.stack||e);process.exitCode=1;console.error(receipt.error);}
 finally{clearTimeout(hard);await closeOwned();receipt.enginePids=[...ownedEnginePids];receipt.hardTimedOut=hardTimedOut;receipt.childrenStopped=![...ownedEnginePids].some(alive)&&(!browser||browser.exitCode!==null||!!browser.signalCode)&&(!srv||srv.exitCode!==null||!!srv.signalCode);receipt.data=data;if(!receipt.childrenStopped){receipt.ok=false;process.exitCode=1;}fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));}
})();
