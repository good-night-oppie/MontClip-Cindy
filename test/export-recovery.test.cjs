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
 fs.writeFileSync(path.join(app,'server.js'),`const fs=require('fs'),path=require('path');const s=require('http').createServer((q,r)=>{if(fs.existsSync(path.join(process.env.FABLECUT_DATA_DIR,'expired'))){r.writeHead(404);r.end('{}');}else {r.setHeader('content-type','application/json');r.end(JSON.stringify({id:'x_saved',status:'done',src:'/exports/clip.mp4'}));}}).listen(0,'127.0.0.1',()=>process.emit('montclip-ready',{origin:'http://127.0.0.1:'+s.address().port}));process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`);
 fs.writeFileSync(path.join(app,'mcp-server.js'),'module.exports={TOOLS:[],callTool:async()=>({})}');fs.writeFileSync(path.join(app,'export-jobs.js'),'module.exports={findBrowser:()=>null}');
 async function worker(){const p=spawn(process.execPath,[path.join(__dirname,'../node/worker.cjs')],{env:{...process.env,MONTCLIP_CINDY_APP:app,MONTCLIP_CINDY_DATA:data},stdio:['pipe','pipe','pipe'],windowsHide:true});p.stderr.resume();let id=0,buf='';const pending=new Map();p.stdout.on('data',c=>{buf+=c;let end;while((end=buf.indexOf('\n'))>=0){const m=JSON.parse(buf.slice(0,end));buf=buf.slice(end+1);pending.get(m.id)?.(m);pending.delete(m.id);}});const stop=async()=>{if(p.exitCode!==null||p.signalCode!==null)return;await new Promise(r=>{p.once('exit',r);p.stdin.end();});};t.after(stop);return {stop,rpc:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error('RPC timeout')),5000);pending.set(n,m=>{clearTimeout(timer);m.error?reject(Object.assign(Error(m.error.message),{code:m.error.data?.code})):resolve(m.result);});p.stdin.write(JSON.stringify({jsonrpc:'2.0',id:n,method,params})+'\n');})};}
 const first=await worker();assert.equal((await first.rpc('montclip/export-job',{id:'x_saved'})).status,'done');await first.stop();fs.writeFileSync(path.join(data,'expired'),'1');
 const next=await worker();const result=await next.rpc('montclip/export-deliver',{id:'x_saved',dir:out});assert.equal(result.files[0].name,'clip.mp4');assert.equal(fs.readFileSync(path.join(out,'clip.mp4'),'utf8'),'synthetic result');await assert.rejects(next.rpc('montclip/export-job',{id:'unknown'}),{code:'NO_JOB'});
});
