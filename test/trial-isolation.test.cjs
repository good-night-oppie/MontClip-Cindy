'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
function worker(t,root,home,preload){const p=spawn(process.execPath,[...(preload?['--require',preload]:[]),path.resolve(process.env.MONTCLIP_TEST_PACKAGE||'.','node/worker.cjs')],{env:{...process.env,MONTCLIP_CANDIDATE_DATA:root,MONTCLIP_CINDY_DATA:undefined,MONTCLIP_CINDY_APP:path.resolve(process.env.MONTCLIP_TEST_PACKAGE||'dist/montclip','node/app'),USERPROFILE:home,HOME:home},stdio:['pipe','pipe','pipe'],windowsHide:true});let buf='',id=0;const pending=new Map();p.stderr.resume();p.stdout.on('data',c=>{buf+=c;let n;while((n=buf.indexOf('\n'))>=0){const m=JSON.parse(buf.slice(0,n));buf=buf.slice(n+1);pending.get(m.id)?.(m);pending.delete(m.id);}});const stopped=new Promise(r=>p.once('exit',r));const stop=async()=>{if(p.exitCode===null&&!p.signalCode){p.stdin.end();await stopped;}};t.after(stop);return {stop,rpc:(method,params={})=>new Promise((resolve,reject)=>{const n=++id,timer=setTimeout(()=>reject(Error('RPC timeout')),12000);pending.set(n,m=>{clearTimeout(timer);m.error?reject(Object.assign(Error(m.error.message),{code:m.error.data?.code})):resolve(m.result)});p.stdin.write(JSON.stringify({id:n,jsonrpc:'2.0',method,params})+'\n');})};}
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'mc-trial-'));
test('two tasks own different origins; probing B does not switch or write A',{timeout:30000},async t=>{const home=temp(),w=worker(t,path.join(home,'trial'),home);const x=await w.rpc('montclip/start',{session:'A'});await w.rpc('montclip/bind',{session:'A'});const token=new URL(x.url).searchParams.get('token'),headers={'X-MontClip-Session':token};const before=await(await fetch(x.origin+'/api/projects',{headers})).text();const y=await w.rpc('montclip/start',{session:'B'});await w.rpc('montclip/bind',{session:'B'});a.notEqual(x.origin,y.origin);a.notEqual(x.dataDir,y.dataDir);a.equal(await(await fetch(x.origin+'/api/projects',{headers})).text(),before);});
test('candidate refuses known legacy root without modifying it',{timeout:20000},async t=>{const home=temp(),root=path.join(home,'MontClip-Cindy');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'sentinel'),'original');const w=worker(t,root,home);await a.rejects(w.rpc('montclip/start',{session:'A'}),/ROOT_CONFLICT|reserved|legacy/);a.deepEqual(fs.readdirSync(root),['sentinel']);});
module.exports={worker,temp};
test('initialization synchronous exit permits same-task retry',{timeout:20000},async t=>{
 const home=temp(),shim=path.join(home,'retry-host.cjs');
 fs.writeFileSync(shim,"const cp=require('child_process');let count=0;globalThis.__CINDY_NODE__={spawnEntry:async(entry,args)=>{if(count++===0){const handlers={};return{on:(n,f)=>{handlers[n]=f;},stdout:{on(){throw Error('attach failed');}},stdin:{write(){}},kill(){handlers.exit(1);}};}const p=cp.spawn(process.execPath,[require('path').resolve(entry),...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});return{pid:p.pid,on:p.on.bind(p),stdout:{on:p.stdout.on.bind(p.stdout)},stdin:{write(text){p.stdin.write(text);}},kill:()=>p.kill()};}};");
 const w=worker(t,path.join(home,'trial'),home,shim);await a.rejects(w.rpc('montclip/start',{session:'retry'}),/attach failed/);const result=await w.rpc('montclip/start',{session:'retry'});a.ok(result.origin);await w.stop();a.throws(()=>process.kill(result.enginePid,0));
});

test('host stdin without EventEmitter methods can start and exit',{timeout:20000},async t=>{
 const home=temp(),shim=path.join(home,'minimal-host.cjs'),pidFile=path.join(home,'child.pid');
 // Only the missing EventEmitter surface is confirmed by DD. The void write/end
 // behavior here is a test variant, not a claim about the real host contract.
 fs.writeFileSync(shim,"const cp=require('child_process'),fs=require('fs');globalThis.__CINDY_NODE__={spawnEntry:async(entry,args)=>{const p=cp.spawn(process.execPath,[require('path').resolve(entry),...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});fs.writeFileSync("+JSON.stringify(pidFile)+",String(p.pid));return {pid:p.pid,stdin:{write(text){p.stdin.write(text);},end(){p.stdin.end();}},stdout:p.stdout,stderr:p.stderr,on:p.on.bind(p),once:p.once.bind(p),kill:()=>p.kill()};}};");
 const w=worker(t,path.join(home,'trial'),home,shim);
 try{const result=await w.rpc('montclip/start',{session:'host-shape'});a.ok(result.origin);await w.stop();const pid=+fs.readFileSync(pidFile);a.throws(()=>process.kill(pid,0));}
 finally{await w.stop();if(fs.existsSync(pidFile)){const pid=+fs.readFileSync(pidFile);try{process.kill(pid);}catch{}}}
});

test('two candidate roots and tasks write independently and reopen without changing legacy sentinel',{timeout:40000},async t=>{
 const home=temp(),legacy=path.join(home,'MontClip-Cindy');fs.mkdirSync(legacy);fs.writeFileSync(path.join(legacy,'project.json'),'old synthetic project');
 const roots=['one','two'].map(n=>path.join(home,n)),workers=roots.map(r=>worker(t,r,home));const points=[];
 for(let i=0;i<2;i++)for(const session of ['A','B']){const w=workers[i],x=await w.rpc('montclip/start',{session});await w.rpc('montclip/bind',{session});const headers={'X-MontClip-Session':new URL(x.url).searchParams.get('token')};const doc=await(await fetch(x.origin+'/api/project',{headers})).json();doc.name=i+session;doc.revision=(doc.revision||0)+1;a.equal((await fetch(x.origin+'/api/project',{method:'PUT',headers,body:JSON.stringify(doc)})).status,200);points.push({i,session,x,headers});}
 a.equal(new Set(points.map(p=>p.x.origin)).size,4);
 for(const p of points){a.equal((await(await fetch(p.x.origin+'/api/project',{headers:p.headers})).json()).name,p.i+p.session);a.equal((await workers[p.i].rpc('montclip/ui',{session:p.session,cmd:'undo'})).code,'NO_EDITOR');}
 await Promise.all(workers.map(w=>w.stop()));
 for(let i=0;i<2;i++){const w=worker(t,roots[i],home);for(const session of ['A','B']){const x=await w.rpc('montclip/start',{session}),headers={'X-MontClip-Session':new URL(x.url).searchParams.get('token')};a.equal((await(await fetch(x.origin+'/api/project',{headers})).json()).name,i+session);}}
 a.equal(fs.readFileSync(path.join(legacy,'project.json'),'utf8'),'old synthetic project');a.deepEqual(fs.readdirSync(legacy),['project.json']);
});
test('same root concurrent instance and junction aliases are rejected',{timeout:30000},async t=>{
 const home=temp(),root=path.join(home,'trial'),one=worker(t,root,home);await one.rpc('montclip/start',{session:'A'});
 const other=worker(t,root,home);await a.rejects(other.rpc('montclip/start',{session:'B'}),/already editing|DATA_DIR_IN_USE/);
 const alias=path.join(home,'alias');fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
 const linked=worker(t,alias,home);await a.rejects(linked.rpc('montclip/start',{session:'A'}),/ROOT_CONFLICT/);
 const foreign=path.join(home,'external');fs.mkdirSync(foreign);fs.symlinkSync(foreign,path.join(root,'cache-link'),process.platform==='win32'?'junction':'dir');await a.rejects(one.rpc('montclip/start',{session:'A'}),/ROOT_CONFLICT/);a.deepEqual(fs.readdirSync(foreign),[]);
});

test('host-shaped asynchronous spawnEntry drains pending starts on EOF',{timeout:20000},async t=>{
 const home=temp(),shim=path.join(home,'host.cjs'),pidFile=path.join(home,'child.pid');
 fs.writeFileSync(shim,"const cp=require('child_process'),fs=require('fs');globalThis.__CINDY_NODE__={spawnEntry:async(entry,args)=>{await new Promise(r=>setTimeout(r,250));const p=cp.spawn(process.execPath,[require('path').resolve(entry),...args],{stdio:['pipe','pipe','pipe'],windowsHide:true});fs.writeFileSync("+JSON.stringify(pidFile)+",String(p.pid));return {pid:p.pid,stdin:p.stdin,stdout:p.stdout,stderr:p.stderr,on:p.on.bind(p),once:p.once.bind(p),kill:()=>p.kill()};}};");
 const w=worker(t,path.join(home,'trial'),home,shim),request=w.rpc('montclip/start',{session:'A'});const result=request.catch(e=>e);await new Promise(r=>setTimeout(r,100));await w.stop();await result;
 a.ok(fs.existsSync(pidFile),'asynchronous child actually started');const pid=+fs.readFileSync(pidFile);a.throws(()=>process.kill(pid,0));
});
test('candidate status passes its own session to every task-dependent request',async()=>{
 const vm=require('vm'),calls=[];let listener;const cindy={onHostMessage:f=>listener=f,send:async()=>({ok:true}),node:{request:async r=>{calls.push(r);return{ok:true,result:r.method==='montclip/start'?{version:'trial',session:r.params.session}:r.method==='montclip/ui'?{status:409,code:'NO_EDITOR'}:{}};}}};
 class BroadcastChannel{postMessage(){}}
 vm.runInNewContext(fs.readFileSync('main.js','utf8'),{cindy,BroadcastChannel,console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
 await listener({type:'tool-call',tool:'montclip_candidate_status',callId:'s',args:{session_context:{session_id:'A'}}});
 for(const c of calls.filter(c=>['montclip/start','montclip/asr-status','montclip/ui','montclip/bind'].includes(c.method)))a.equal(c.params.session,'A');
});

test('export destinations reject legacy roots, sibling tasks and links',()=>{
 const {exportDestination}=require('../node/trial-paths.cjs'),home=temp(),root=path.join(home,'trial'),ownDir=path.join(root,'tasks/A');fs.mkdirSync(ownDir,{recursive:true});
 for(const dir of [path.join(home,'MontClip-Cindy/exports'),path.join(root,'tasks/B/exports')])a.throws(()=>exportDestination(dir,{home,root,ownDir,env:{}}),/ROOT_CONFLICT/);
 const linked=path.join(home,'linked');fs.symlinkSync(ownDir,linked,process.platform==='win32'?'junction':'dir');a.throws(()=>exportDestination(linked,{home,root,ownDir,env:{}}),/ROOT_CONFLICT/);
 a.equal(exportDestination(path.join(home,'Videos'),{home,root,ownDir,env:{}}),path.join(home,'Videos'));
});
