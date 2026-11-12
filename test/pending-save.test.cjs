'use strict';
// Isolated browser lifecycle experiment. Actual pinned save functions and wrapper
// source; host binding replies and document storage HTTP endpoint are fixtures.
// No installed plugin, live DATA, engine changes or Cindy desktop interaction.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process'),vm=require('node:vm'),assert=require('node:assert/strict');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const show=(repo,ref,file)=>cp.execFileSync('git',['-C',repo,'show',ref+':'+file],{encoding:'utf8',maxBuffer:8e6});
const app=fs.readFileSync(path.join(root,'engine/app.js'),'utf8');
function fn(name){const m=new RegExp('^(?:async )?function '+name+'\\(','m').exec(app);assert.ok(m,name);const line=app.slice(m.index,app.indexOf('\n',m.index)).trim();try{new vm.Script('('+line+')');return line;}catch{}const ends=/^}/gm;ends.lastIndex=m.index;for(let end;(end=ends.exec(app));){const s=app.slice(m.index,end.index+1);try{new vm.Script('('+s+')');return s;}catch{}}throw Error(name);}
const names=['scheduleSave','saveNow','flushSave','undoStackUrl','keepPlayheadOnLeave'];
const saveSource=names.map(fn).join('\n');
const browser=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium',path.join(process.env.PROGRAMFILES||'','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']||'','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&fs.existsSync(p));
const evidence=path.join(root,'.artifacts/issue76');fs.mkdirSync(evidence,{recursive:true});
const runRoot=fs.mkdtempSync(path.join(evidence,'save-browser-'));
const testedRef=process.env.C76_BASE_REF||'working-tree';
async function run(label,ref,fail,flush,inflight=false){
 const dir=path.join(runRoot,label);fs.mkdirSync(dir);const durable=path.join(dir,'project.json');fs.writeFileSync(durable,JSON.stringify({revision:1,clips:[]}));const writes=[],leaves=[];
 const wrapper=ref==='working-tree'?fs.readFileSync(path.join(root,'frame.js'),'utf8'):show(root,ref,'frame.js'),css=fs.readFileSync(path.join(root,'frame.css'),'utf8');
 let held=null,release=false;const started=[];const commitHeld=()=>{if(!held||!release)return;const {doc,res,projectId}=held;held=null;fs.writeFileSync(durable,JSON.stringify(doc));writes.push({revision:doc.revision,clips:doc.clips.length,project:projectId});res.end('{}');};
 let complete=false;const images=[];const endImage=res=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg"/>');};
 const server=http.createServer(async(req,res)=>{
  if(req.url==='/hold.svg'){if(complete)endImage(res);else images.push(res);return;}
  if(req.url==='/complete'){complete=true;images.splice(0).forEach(endImage);res.end('ok');return;}
  if(req.url==='/started'){if(held)res.end('ready');else started.push(res);return;}
  if(req.url==='/release'){release=true;commitHeld();res.end('released');return;}
  if(req.url.startsWith('/api/')){let body='';for await(const b of req)body+=b;
   if(req.method==='PUT'&&req.url==='/api/project'){const doc=JSON.parse(body);if(inflight){held={doc,res,projectId:req.headers['x-fablecut-project']};started.splice(0).forEach(r=>r.end('ready'));commitHeld();return;}fs.writeFileSync(durable,JSON.stringify(doc));writes.push({revision:doc.revision,clips:doc.clips.length,project:req.headers['x-fablecut-project']});}
   else leaves.push({url:req.url,method:req.method,body});res.setHeader('Content-Type','application/json');res.end('{}');return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');
  if(req.url.startsWith('/editor')){res.end(`<!doctype html><button>synthetic editor</button><script>
   const project={revision:1,clips:[]},runtime={projectId:'p_1',saveTimer:null,saving:null,saveFailed:false},state={connected:true,time:0,compCtx:null};
   const projectJSON=()=>({...project}),eventLog=()=>({toJSON:()=>({}),settle(){}}),persistUndoSoon=()=>parent.postMessage({saved:true},location.origin),syncFromServer=async()=>false,toast=()=>{};
   ${saveSource}
   window.addEventListener('pagehide',keepPlayheadOnLeave);
   document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')keepPlayheadOnLeave();});
   window.addEventListener('load',()=>setTimeout(async()=>{project.clips.push({id:'synthetic-edit'});scheduleSave();const pending=!!runtime.saveTimer;
    ${inflight?"clearTimeout(runtime.saveTimer);runtime.saveTimer=null;runtime.saving=saveNow();await fetch('/started');":''}
    ${flush?'await flushSave();':''}
    parent.postMessage({edited:true,pendingBefore:pending,pendingAfter:!!runtime.saveTimer,revision:project.revision},location.origin);},0));
   </script>`);return;}
  res.end(`<!doctype html><style>${css}</style><body data-view="task" data-engine-path="/editor"><img hidden src="/hold.svg"><div id="status"></div><script>
   let failed=false,channel,observations={};window.BroadcastChannel=class{constructor(){channel=this;this.listeners=[];}addEventListener(_,f){this.listeners.push(f)}removeEventListener(_,f){this.listeners=this.listeners.filter(x=>x!==f)}postMessage(m){const r=m.type==='bind'?(failed?{error:'synthetic pre-switch bind failure',code:'BIND_FAILED'}:{project:'p_1'}):m.type==='editor'?{url:location.origin+'/editor'}:m.type==='editor-ticket'?{ticket:'synthetic',project:'p_1'}:{supported:false};queueMicrotask(()=>[...this.listeners].forEach(f=>f({data:{...r,reqId:m.reqId,answer:true}})));}};
   window.addEventListener('message',async e=>{if(e.data?.saved){observations.savedAck=true;return;}if(!e.data?.edited)return;observations.edit=e.data;failed=${fail};
    if(failed)document.dispatchEvent(new Event('visibilitychange'));
    ${inflight?"for(let i=0;i<20&&document.getElementById('status').className!=='error';i++)await Promise.resolve();if(document.getElementById('status').className!=='error')throw Error('failure not observed');await fetch('/release');":''}
    setTimeout(()=>{observations.frameConnected=!!document.querySelector('iframe');observations.error=document.getElementById('status').className==='error';document.body.setAttribute('data-result',JSON.stringify(observations));fetch('/complete');},1200);
   });
   </script><script>${wrapper}</script>`);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let out='',err='';try{await new Promise((resolve,reject)=>{const child=cp.spawn(browser,['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--user-data-dir='+path.join(dir,'profile'),'--dump-dom','http://127.0.0.1:'+server.address().port+'/?session=taskA'],{windowsHide:true,stdio:['ignore','pipe','pipe']});const timeout=setTimeout(()=>{child.kill();reject(Error('BROWSER_TIMEOUT'));},20000);child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('BROWSER_EXIT_'+code));});});}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
 fs.writeFileSync(path.join(dir,'browser.html'),out);fs.writeFileSync(path.join(dir,'browser.stderr'),err);
 const m=/data-result="([^"]*)"/.exec(out);assert.ok(m,'observations');const observed=JSON.parse(m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
 const result={label,ref,fail,flush,inflight,observed,durable:JSON.parse(fs.readFileSync(durable)),writes,leaves,projectFile:durable};
 fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(result,null,2));return result;
}

for(const [label,fail,flush,inflight] of [['control',false,false,false],['pending-bind-failure',true,false,false],['inflight-bind-failure',true,false,true]]) {
 test('#76 '+label+' preserves the project document', {skip:!browser&&'Chrome/Edge unavailable'}, async()=>{
  const r=await run(label,testedRef,fail,flush,inflight);
  console.log(JSON.stringify({label,ref:testedRef,pending:r.observed.edit.pendingBefore,frameConnected:r.observed.frameConnected,savedAck:!!r.observed.savedAck,revision:r.durable.revision,clips:r.durable.clips.length,writes:r.writes.length,fixture:'actual browser/source functions; host and HTTP storage fixtures, not Cindy E2E'}));
  assert.equal(r.durable.clips.length,1);assert.equal(r.durable.revision,2);assert.equal(r.writes.length,1);assert.equal(r.writes[0].project,'p_1');
  assert.equal(r.observed.savedAck,true);assert.equal(r.observed.frameConnected,true);
 });
}
