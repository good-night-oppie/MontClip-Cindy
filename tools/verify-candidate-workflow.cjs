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
const data=fs.mkdtempSync(path.join(process.platform==='linux'?'/tmp':os.tmpdir(),'mcw-'));fs.chmodSync(data,0o700);
for(const d of ['media','home','xdg','profile','tmp'])fs.mkdirSync(path.join(data,d),{mode:0o700});
const env={...process.env,TMPDIR:path.join(data,'tmp'),TMP:path.join(data,'tmp'),TEMP:path.join(data,'tmp'),XDG_CONFIG_HOME:path.join(data,'xdg'),XDG_CACHE_HOME:path.join(data,'xdg'),MONTCLIP_FFMPEG:ff,MONTCLIP_FFPROBE:probe,FABLECUT_DATA_DIR:data,FABLECUT_NO_FS_WATCH:'1'};
const run=(args)=>execFileSync(ff,['-v','error',...args],{windowsHide:true,timeout:30000,maxBuffer:32*1024*1024});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
let srv,browser,pipe,hardTimedOut=false;
const stop=child=>new Promise(resolve=>{if(!child||child.exitCode!==null||child.signalCode)return resolve();child.once('exit',resolve);child.kill();});
const hard=setTimeout(()=>{hardTimedOut=true;pipe?.close();browser?.kill();srv?.kill();},180000);
async function workflow(format) {
  const file=path.join(out,'synthetic.'+format);
  run(['-y','-f','lavfi','-i','color=black:s=320x180:r=30:d=2,drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable=gte(t\\,1)','-f','lavfi','-i','aevalsrc=if(gte(t\\,1)\\,0.5*sin(2*PI*1000*t)\\,0):s=48000:d=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',file]);
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
  const before=project.clips.find(x=>x.id===c.id).props.x;
  pushUndo();if(!setAnimProp(c,'x',37))throw Error('property change refused');scheduleSave();
  const changed=project.clips.find(x=>x.id===c.id).props.x;
  undo();const restored=project.clips.find(x=>x.id===c.id).props.x;
  if(changed!==37||restored!==before)throw Error('undo did not restore position');
  if(!await flushSave())throw Error('save failed');await fetchEncodeProfiles();
  const result=await fastExport({silent:true,delivery:normalizeDelivery({preset:'custom',width:320,height:180,fps:30,video:{codec:'h264',encoder:'libx264'},audio:{codec:'aac'}}).spec});
  if(!result?.outputs?.[0]?.ok)throw Error('export failed '+JSON.stringify(result));
  return {imported:{src:m.src,originalSrc:m.originalSrc,preparation:m.preparation},clipCount:project.clips.length,before,changed,restored,result,project:projectJSON()};
}
(async()=>{const receipt={source:JSON.parse(fs.readFileSync(path.join(root,'SOURCE.json'))),platform:process.platform,node:process.version,cases:[]};
 try {
  fs.writeFileSync(path.join(data,'project.json'),JSON.stringify({name:'Synthetic candidate',width:320,height:180,fps:30,media:[],clips:[]}));
  const token=crypto.randomBytes(32).toString('hex'),proof=crypto.randomBytes(32).toString('hex'),proofPath='/media/proof.txt';
  fs.writeFileSync(path.join(data,'media/proof.txt'),proof);
  srv=fork(path.join(app,'server.js'),[],{env:{...env,PORT:'0',HOST:'127.0.0.1',MONTCLIP_DESKTOP:'1',MONTCLIP_SESSION_TOKEN:token},stdio:['ignore','ignore','pipe','ipc'],windowsHide:true});
  srv.stderr.on('data',x=>fs.appendFileSync(path.join(out,'server.log'),x));
  const lease=await serverLease(srv,{token,proofPath,proof});
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
  for(const format of ['mp4','flv']) {
   // Clear the previous case through the real project API, retaining only synthetic media.
   if(format==='flv')await ev("applyProject({...projectJSON(),media:[],clips:[]});scheduleSave();flushSave()");
   const input=await workflow(format),result=await ev('('+pageRun.toString()+')('+JSON.stringify(input)+')');
   const src=result.result.outputs[0].src,file=path.join(data,decodeURIComponent(src).replace(/^\//,''));
   const target=path.join(out,format+'-export.mp4');fs.copyFileSync(file,target);
   const metadata=JSON.parse(execFileSync(probe,['-v','error','-show_streams','-show_format','-of','json',target],{encoding:'utf8',windowsHide:true,timeout:10000}));
   assert.ok(metadata.streams.some(s=>s.codec_name==='h264'));assert.ok(metadata.streams.some(s=>s.codec_type==='audio'));assert.ok(Math.abs(+metadata.format.duration-2)<0.2);
   const onset=file=>{const pixels=run(['-i',file,'-vf','scale=1:1,format=gray','-f','rawvideo','-']);const pcm=run(['-i',file,'-vn','-ac','1','-ar','48000','-f','f32le','-']);const frame=pixels.findIndex(v=>v>128);let sample=-1;for(let i=0;i<pcm.length/4;i++)if(Math.abs(pcm.readFloatLE(i*4))>0.05){sample=i;break;}assert.ok(frame>=0&&sample>=0);return{frame,sample,offset:sample/48000-frame/30};};
   const sourceSync=onset(path.join(out,'synthetic.'+format)),outputSync=onset(target),deltaMs=1000*(outputSync.offset-sourceSync.offset);assert.ok(Math.abs(deltaMs)<=40);
   receipt.cases.push({format,...result,output:target,sha256:hash(target),bytes:fs.statSync(target).size,duration:metadata.format.duration,sourceSync,outputSync,deltaMs});
   fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(format+' import/edit/undo/export passed');
  }
  receipt.ok=true;
 }catch(e){receipt.error=String(e.stack||e);process.exitCode=1;console.error(receipt.error);}
 finally{clearTimeout(hard);pipe?.close();await stop(browser);await stop(srv);receipt.hardTimedOut=hardTimedOut;receipt.childrenStopped=(!browser||browser.exitCode!==null||!!browser.signalCode)&&(!srv||srv.exitCode!==null||!!srv.signalCode);receipt.data=data;fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));}
})();
