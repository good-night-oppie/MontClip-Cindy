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
const watchEnabled=process.argv.includes('--watch');
if(watchEnabled)delete env.FABLECUT_NO_FS_WATCH;
const run=(args)=>execFileSync(ff,['-v','error',...args],{windowsHide:true,timeout:90000,maxBuffer:32*1024*1024});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let srv,browser,pipe,hardTimedOut=false,closing=null;const ownedEnginePids=new Set();
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};
async function closeOwned(){if(closing)return closing;return closing=(async()=>{let closeTimer;try{await Promise.race([pipe?.send("Browser.close"),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error("browser close deadline")),2000);})]);}catch{}finally{clearTimeout(closeTimer);}pipe?.close();await stop(browser);if(srv&&srv.exitCode===null&&!srv.signalCode){const exited=new Promise(r=>srv.once("exit",r));srv.stdin.end();const deadline=setTimeout(()=>{for(const pid of ownedEnginePids)if(alive(pid))process.kill(pid);srv.kill();},8000);await exited;clearTimeout(deadline);}for(let i=0;i<30&&[...ownedEnginePids].some(alive);i++)await new Promise(r=>setTimeout(r,100));})();}
const stop=child=>new Promise(resolve=>{if(!child||child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);child.kill();});
const hard=setTimeout(()=>{hardTimedOut=true;pipe?.close();browser?.kill();for(const pid of ownedEnginePids)if(alive(pid)){try{process.kill(pid);}catch{}}srv?.kill();},180000);
async function makeInputs(){
 const generate=process.argv[4]==='generate',inputDir=generate?out:path.resolve(process.argv[4]);
 return ['hevc','h264'].map(codec=>{
  const file=path.join(inputDir,codec+'.mp4');
  if(generate)run(['-y','-f','lavfi','-i','color=white:s=720x1280:r=30:d=32,drawbox=x=0:y=0:w=iw:h=ih:color=red:t=fill:enable=gte(t\\,9.5),drawbox=x=0:y=0:w=iw:h=ih:color=blue:t=fill:enable=gte(t\\,20)','-f','lavfi','-i','sine=frequency=1000:sample_rate=44100:duration=32','-c:v',codec==='hevc'?'libx265':'libx264','-preset','ultrafast',...(codec==='hevc'?['-tag:v','hvc1','-x265-params','log-level=error:keyint=90:min-keyint=90:scenecut=0:bframes=4']:['-g','90','-bf','4']),'-pix_fmt','yuv420p','-video_track_timescale','90000','-c:a','aac','-ac','1','-shortest',file]);
  return {codec,bytes:fs.readFileSync(file).toString('base64')};
 });
}
async function importInputs(inputs){const media=[];for(const input of inputs){const bytes=Uint8Array.from(atob(input.bytes),c=>c.charCodeAt(0));const got=await importFiles([new File([bytes],input.codec+'.mp4',{type:'video/mp4'})]);if(got.length!==1||got[0].transient)throw Error('import failed '+input.codec);media.push({codec:input.codec,id:got[0].id,src:got[0].src});}project.width=720;project.height=1280;project.fps=30;scheduleSave();await flushSave();return media;}
async function place(mediaId,start,inn,duration){project.clips=[];const c=addClipFromMedia(getMedia(mediaId),'V1',start);for(const x of project.clips){x.in=inn;x.duration=duration;}scheduleSave();await flushSave();await new Promise(r=>setTimeout(r,300));return c.id;}
async function probeUI(mediaId,clipId,sourceTimes,timelineTimes){const m=getMedia(mediaId),cv=document.createElement('canvas');cv.width=720;cv.height=1280;const g=cv.getContext('2d'),result={source:[],program:[]};for(const t of sourceTimes){loadSourceFromMedia(m,{time:t});await seekFrame(runtime.sourceEl,t);await new Promise(r=>setTimeout(r,150));g.drawImage(runtime.sourceEl,0,0,720,1280);result.source.push({t,currentTime:runtime.sourceEl.currentTime,pixel:[...g.getImageData(360,640,1,1).data]});}setMonitorMode('program');for(const t of timelineTimes){setTime(t);await new Promise(r=>setTimeout(r,300));const el=getClipEl(getClip(clipId));runtime.sampling=true;state.selId=null;els.preview.width=720;els.preview.height=1280;drawFrame(t);result.program.push({t,stateTime:state.time,currentTime:el.currentTime,readyState:el.readyState,seeking:el.seeking,pixel:[...ctx2d.getImageData(360,640,1,1).data]});runtime.sampling=false;}return result;}
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
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'mc-frame-browser-'));fs.chmodSync(profile,0o700);receipt.browserProfile=profile;
  browser=spawn(browserPath,['--headless=new','--enable-automation','--remote-debugging-pipe','--user-data-dir='+profile,'--no-first-run','about:blank'],{env:{...env,TMPDIR:profile,TMP:profile,TEMP:profile,XDG_CONFIG_HOME:profile,XDG_CACHE_HOME:profile},stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
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
  const inputs=await makeInputs();const media=await ev('('+importInputs.toString()+')('+JSON.stringify(inputs)+')');receipt.media=media;
  const call=async(name,args)=>rpc('montclip/call',{session,name,arguments:args});
  const frame=async(args)=>{try{return await call('fablecut_frame',{...args,text:true,width:64,timeout:15});}catch(e){return{error:String(e)}}};
  const hm=media.find(m=>m.codec==='hevc'),am=media.find(m=>m.codec==='h264');
  const cid=await ev('('+place.toString()+')('+JSON.stringify(hm.id)+',0,5,10)');
  receipt.baseline=await frame({time:5,where:'tab'});
  await ev("window.frameDiagnostic=[];const originalRun=runExportJob;runExportJob=async function(ticket){frameDiagnostic.push({event:'run-enter',at:Date.now(),ticketRevision:ticket.revision,pageRevision:project.revision});try{return await originalRun(ticket);}finally{frameDiagnostic.push({event:'run-exit',at:Date.now(),pageRevision:project.revision});}};const originalSync=syncFromServer;syncFromServer=async function(force){frameDiagnostic.push({event:'sync-enter',at:Date.now(),force:!!force,pageRevision:project.revision});const result=await originalSync(force);frameDiagnostic.push({event:'sync-exit',at:Date.now(),pageRevision:project.revision,result});return result;};true");
  const snapshot=async()=>({page:await ev('({revision:project.revision,media:project.media.map(m=>({id:m.id,src:m.src})),rendering:state.rendering,pendingSync:runtime.pendingSync})'),disk:JSON.parse(fs.readFileSync(path.join(data,'project.json'),'utf8')).revision});
  receipt.replace=await call('fablecut_patch_project',{ops:[{op:'replaceMedia',id:hm.id,src:am.src,name:'replacement-h264.mp4'}]});await new Promise(r=>setTimeout(r,600));receipt.beforeFrame=await snapshot();
  receipt.samples=[];let inFlight=false;const polling=setInterval(async()=>{if(inFlight)return;inFlight=true;try{receipt.samples.push({at:Date.now(),...await snapshot()});}catch(e){receipt.samples.push({error:String(e)});}finally{inFlight=false;}},1000);
  const startedAt=Date.now();receipt.withWatchDisabled=await frame({time:5,where:'tab'});receipt.withWatchDisabledMs=Date.now()-startedAt;clearInterval(polling);
  receipt.afterTimeout=await snapshot();await ev('syncFromServer(true)');receipt.afterExplicitSync=await snapshot();
  receipt.browserDiagnostic=await ev('frameDiagnostic');
  // A deliberately timed-out render may still unwind. Use a new page context for
  // the positive control, rather than racing that cancelled render or extending its deadline.
  if(!watchEnabled){
   const prior=await ev('performance.timeOrigin');await send('Page.reload');let reopened=false;
   for(let i=0;i<150;i++){try{reopened=await ev('performance.timeOrigin!=='+prior+' && state.connected && !!project && project.revision>='+receipt.afterExplicitSync.disk);if(reopened)break;}catch{}await new Promise(r=>setTimeout(r,100));}
   assert.ok(reopened,'positive control must reopen the saved replacement revision');
  }
  const positiveAt=Date.now();receipt.afterSyncFrame=await frame({time:5,where:'tab'});receipt.afterSyncFrameMs=Date.now()-positiveAt;
  receipt.cases=[{stage:'watch-disabled-revision-delay',before:receipt.beforeFrame,result:receipt.withWatchDisabled},{stage:'saved-revision-control',before:receipt.afterExplicitSync,result:receipt.afterSyncFrame}];
  receipt.watchEnabled=watchEnabled;
  const assertFrame=(result)=>{assert.ok(!result.error,result.error);assert.match(result.text,/Timeline at 5s/);assert.match(result.text,/black 0%/);assert.match(result.text,/colour cast: red/);};
  if(watchEnabled){assertFrame(receipt.withWatchDisabled);}
  else{assert.ok(receipt.beforeFrame.page.revision<receipt.beforeFrame.disk,'negative control must observe stale page');assert.match(receipt.withWatchDisabled.error,/timed out/);}
  assert.equal(receipt.afterExplicitSync.page.revision,receipt.afterExplicitSync.disk);
  assertFrame(receipt.afterSyncFrame);
  if(watchEnabled){
   await ev('('+place.toString()+')('+JSON.stringify(am.id)+',10,22,8)');
   receipt.h264Offset=await frame({time:15,where:'tab'});
   assert.ok(!receipt.h264Offset.error,receipt.h264Offset.error);
   assert.match(receipt.h264Offset.text,/Timeline at 15s/);
   assert.match(receipt.h264Offset.text,/black 0%/);
   const rgb=/mean rgb \[([^\]]+)\]/.exec(receipt.h264Offset.text)?.[1].split(',').map(Number);
   assert.ok(rgb&&rgb[2]>0.9&&rgb[0]<0.1&&rgb[1]<0.1,'timeline15 must measure the blue source frame, independent of descriptive cast label');
  }
  receipt.ok=true;
 }catch(e){receipt.error=String(e.stack||e);process.exitCode=1;console.error(receipt.error);}
 finally{clearTimeout(hard);await closeOwned();receipt.enginePids=[...ownedEnginePids];receipt.hardTimedOut=hardTimedOut;receipt.childrenStopped=![...ownedEnginePids].some(alive)&&(!browser||browser.exitCode!==null||!!browser.signalCode)&&(!srv||srv.exitCode!==null||!!srv.signalCode);receipt.data=data;if(!receipt.childrenStopped){receipt.ok=false;process.exitCode=1;}fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));}
})();
