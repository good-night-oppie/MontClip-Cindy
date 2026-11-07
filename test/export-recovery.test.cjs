'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process');
test('an expired delivery retry is terminal with an exports-folder action',async()=>{
 const cards=[];let listener;const cindy={onHostMessage:f=>listener=f,send:async m=>{cards.push(m);return {ok:true};},node:{request:async()=>({ok:false,errorCode:'NO_JOB',message:'no job'})}};
 class BroadcastChannel {postMessage(){}}
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 vm.runInNewContext(source+"\nsendCard('old',{phase:'still',job:'x_old',folder:'Videos'});",{cindy,BroadcastChannel,console:{warn(){}},setTimeout,clearTimeout,setInterval,clearInterval,URL});
 await listener({type:'event',name:'card-action',actionId:'retry-delivery',callId:'old'});
 const card=cards.at(-1);assert.equal(card.state,'done');assert.match(card.html,/记录已失效/);assert.match(card.html,/open-folder:exports/);assert.doesNotMatch(card.html,/retry-delivery|还在导出/);
});
test('completed export can be delivered after engine expiry and worker restart',{timeout:15000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-recovery-')),app=path.join(dir,'app'),data=path.join(dir,'data'),out=path.join(dir,'out');
 t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});
 for(const d of [app,path.join(data,'exports'),out])fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(data,'exports','clip.mp4'),'synthetic result');
 fs.writeFileSync(path.join(app,'server.js'),`const fs=require('fs'),path=require('path');const s=require('http').createServer((q,r)=>{r.setHeader('content-type','application/json');if(!q.url.startsWith('/api/export/job'))r.end('{}');else if(fs.existsSync(path.join(process.env.FABLECUT_DATA_DIR,'expired'))){r.writeHead(404);r.end('{}');}else r.end(JSON.stringify({id:'x_saved',session:'task-a',status:'done',src:'/exports/clip.mp4'}));}).listen(+process.env.PORT,'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`);
 fs.writeFileSync(path.join(app,'mcp-server.js'),'module.exports={TOOLS:[],callTool:async()=>({})}');fs.writeFileSync(path.join(app,'export-jobs.js'),'module.exports={findBrowser:()=>null}');
 async function worker(){const p=spawn(process.execPath,[path.join(__dirname,'../node/worker.cjs')],{env:{...process.env,MONTCLIP_CINDY_APP:app,MONTCLIP_CINDY_DATA:data},stdio:['pipe','pipe','pipe'],windowsHide:true});p.stderr.resume();let id=0,buf='';const pending=new Map();p.stdout.on('data',c=>{buf+=c;let end;while((end=buf.indexOf('\n'))>=0){const m=JSON.parse(buf.slice(0,end));buf=buf.slice(end+1);pending.get(m.id)?.(m);pending.delete(m.id);}});const stop=async()=>{if(p.exitCode!==null||p.signalCode!==null)return;await new Promise(r=>{p.once('exit',r);p.stdin.end();});};t.after(stop);return {stop,rpc:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error('RPC timeout')),5000);pending.set(n,m=>{clearTimeout(timer);m.error?reject(Object.assign(Error(m.error.message),{code:m.error.data?.code})):resolve(m.result);});p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params:{session:'task-a',...params}})+'\n');})};}
 const first=await worker();
 const archive=path.join(data,'cindy-export-results.json');fs.mkdirSync(archive);
 assert.equal((await first.rpc('montclip/export-job',{id:'x_saved'})).status,'done','archive failure must not hide a finished export');
 fs.rmdirSync(archive);
 assert.equal((await first.rpc('montclip/export-job',{id:'x_saved'})).status,'done');await first.stop();fs.writeFileSync(path.join(data,'expired'),'1');
 const next=await worker();await assert.rejects(next.rpc('montclip/export-job',{id:'x_saved',session:'task-b'}),{code:'EXPORT_TASK_MISMATCH'});await assert.rejects(next.rpc('montclip/export-deliver',{id:'x_saved',dir:out,session:'task-b'}),{code:'EXPORT_TASK_MISMATCH'});const result=await next.rpc('montclip/export-deliver',{id:'x_saved',dir:out});assert.equal(result.files[0].name,'clip.mp4');assert.equal(fs.readFileSync(path.join(out,'clip.mp4'),'utf8'),'synthetic result');await assert.rejects(next.rpc('montclip/export-job',{id:'unknown'}),{code:'NO_JOB'});
});
// JJ's final NO_JOB wording (MontClip-Cindy#24, comment 6699941339), locked word for word, Chinese and English; the
// button stays 〔打开导出文件夹〕 → open-folder:exports.
const NO_JOB_ZH='这次导出的记录已失效，查不到了。请先打开导出文件夹，看成片在不在；不在的话，重新导出一次。你的剪辑都还在，没有丢。';
const NO_JOB_EN="This export's record is no longer available. Open the export folder to see if the finished file is there; if it isn't, export again. Your edits are all still there.";
function loadMain(request){
 const sent=[],box={cindy:{onHostMessage:f=>box.listener=f,send:async m=>{sent.push(m);return {ok:true};},node:{request}},BroadcastChannel:class{postMessage(){}},console:{warn(){}},setTimeout,clearTimeout,setInterval,clearInterval,URL};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8')+"\nthis.plainFailure=plainFailure;this.exportCard=exportCard;this.sendCard=sendCard;",box);
 return Object.assign(box,{sent});
}
test('NO_JOB: JJ\'s final sentence, Chinese and English, word for word; the button is unchanged',()=>{
 const m=loadMain(async()=>({ok:true,result:{}})),c={phase:'failed',code:'NO_JOB',job:'x_old'};
 assert.equal(m.plainFailure(c).error,NO_JOB_ZH);
 const zh=m.exportCard(c,'zh'),en=m.exportCard(c,'en');
 assert.ok(zh.includes('<p>'+NO_JOB_ZH+'</p>'),zh);assert.ok(en.includes('<p>'+NO_JOB_EN+'</p>'),en);
 assert.match(zh,/data-ghost-action="open-folder:exports"[^>]*>打开导出文件夹<\/button>/);
 assert.match(en,/data-ghost-action="open-folder:exports"[^>]*>Open the export folder<\/button>/);
 for(const h of [zh,en])assert.equal((h.match(/data-ghost-action=/g)||[]).length,1);
});
// The streamer never picked a folder: 〔打开导出文件夹〕 on the NO_JOB card asks the worker for {folder:'exports'} (no job,
// no path), and the worker opens <data folder>/exports, making it first if it is not there yet — never a missing folder.
test('NO_JOB 〔打开导出文件夹〕 asks for the exports folder only, by name, never a path or a job',async()=>{
 const asks=[],m=loadMain(async r=>{asks.push(r);return {ok:true,result:{opened:'x'}};});
 m.sendCard('gone',{phase:'failed',code:'NO_JOB',job:'x_old'});
 await m.listener({type:'event',name:'card-action',actionId:'open-folder:exports',callId:'gone'});
 assert.deepEqual(asks.map(r=>[r.method,JSON.stringify(r.params)]),[['montclip/open-folder','{"folder":"exports"}']]);
});
test('worker: with no folder ever picked, the exports folder is <data folder>/exports, made if it is missing',{timeout:20000},async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mc-open-')),app=path.join(dir,'app'),data=path.join(dir,'data'),seen=path.join(dir,'opened.json'),pre=path.join(dir,'no-opener.cjs');
 t.after(()=>{assert.equal(path.dirname(dir),os.tmpdir());fs.rmSync(dir,{recursive:true,force:true});});
 for(const d of [app,data])fs.mkdirSync(d,{recursive:true});
 fs.writeFileSync(path.join(app,'server.js'),'');fs.writeFileSync(path.join(app,'mcp-server.js'),'module.exports={TOOLS:[],callTool:async()=>({})}');fs.writeFileSync(path.join(app,'export-jobs.js'),'module.exports={findBrowser:()=>null}');
 // no file manager is started: a preload writes down what explorer.exe / open / xdg-open would have been given instead
 fs.writeFileSync(pre,`const cp=require('child_process'),fs=require('fs'),path=require('path'),real=cp.spawn;cp.spawn=function(cmd,args,o){if(/^(explorer\.exe|open|xdg-open)$/i.test(path.basename(String(cmd)))){fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify({cmd:path.basename(String(cmd)),args}));return {on(){},unref(){}};}return real.apply(this,arguments);};`);
 const p=spawn(process.execPath,['-r',pre,path.join(__dirname,'../node/worker.cjs')],{env:{...process.env,MONTCLIP_CINDY_APP:app,MONTCLIP_CINDY_DATA:data},stdio:['pipe','pipe','pipe'],windowsHide:true});
 let err='';p.stderr.on('data',c=>{err+=c;});
 t.after(()=>new Promise(r=>{if(p.exitCode!==null||p.signalCode!==null)return r();p.once('exit',r);p.stdin.end();}));
 const reply=new Promise((resolve,reject)=>{let buf='';const timer=setTimeout(()=>reject(Error('RPC timeout; worker stderr: '+err.slice(-2000))),15000);p.stdout.on('data',c=>{buf+=c;const end=buf.indexOf('\n');if(end<0)return;clearTimeout(timer);const m=JSON.parse(buf.slice(0,end));m.error?reject(Object.assign(Error(m.error.message),{code:m.error.data?.code})):resolve(m.result);});});
 assert.equal(fs.existsSync(path.join(data,'exports')),false,'nothing made the folder before the click');
 p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'montclip/open-folder',params:{folder:'exports'}})+'\n');
 const r=await reply,exportsDir=fs.realpathSync.native(path.join(data,'exports'));
 assert.equal(r.opened,exportsDir);
 assert.ok(fs.statSync(exportsDir).isDirectory());
 assert.deepEqual(JSON.parse(fs.readFileSync(seen,'utf8')).args,[exportsDir],'the file manager is given that folder and nothing else');
});
