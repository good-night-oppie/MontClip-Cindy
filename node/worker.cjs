'use strict';
// Trial-only process router. Each task owns one engine, filesystem and loopback listener.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline'),{spawn}=require('node:child_process');
const {resolveRoot,safeTree,exportDestination}=require('./trial-paths.cjs');
const manifest=require('../ghost.json');
const {createChannel}=require('./child-channel.cjs');
const APP=path.resolve(process.env.MONTCLIP_CINDY_APP||path.join(__dirname,'app'));
let root,lock,initError,leaving=false;const children=new Map(),starting=new Map(),owned=new Set();
const reply=m=>process.stdout.write(JSON.stringify(m)+'\n');
function init(){if(initError)throw initError;if(root)return;try{
 const r=resolveRoot();safeTree(r);fs.mkdirSync(r,{recursive:true,mode:0o700});
 lock=require(path.join(APP,'writer-lock.js')).acquire(r,{shell:'montclip-candidate'});
 const marker=path.join(r,'candidate-identity.json');if(!fs.existsSync(marker))fs.writeFileSync(marker,JSON.stringify({id:manifest.id}),{flag:'wx',mode:0o600});
 root=r;
 }catch(e){initError=e;throw e;}}
function taskKey(session){if(session==null||session==='')return 'control';if(!/^[A-Za-z0-9_-]{1,128}$/.test(session))throw Error('invalid task session');return crypto.createHash('sha256').update(session).digest('hex');}
async function engine(session){init();safeTree(root);const key=taskKey(session);if(children.has(key))return children.get(key);if(starting.has(key))return starting.get(key);if(children.size+starting.size>=4)throw Object.assign(Error("候选同时最多打开三个任务及一个管理进程。请完成当前验收后再打开其他任务。"),{code:"TASK_LIMIT"});
 const creating=(async()=>{
 const dir=path.join(root,'tasks',key),tmp=process.platform==='linux'?fs.mkdtempSync('/tmp/mcc-'):path.join(dir,'tmp');
 for(const p of [dir,tmp,path.join(dir,'cache'),path.join(dir,'config'),path.join(dir,'home')])fs.mkdirSync(p,{recursive:true,mode:0o700});fs.chmodSync(tmp,0o700);
 const env={...process.env,MONTCLIP_CINDY_DATA:dir,MONTCLIP_CANDIDATE_TOOLS:path.join(dir,'runtime'),TMPDIR:tmp,TMP:tmp,TEMP:tmp,XDG_CACHE_HOME:path.join(dir,'cache'),XDG_CONFIG_HOME:path.join(dir,'config')};
 // The child owns these explicit settings; no host-provided DATA or port is trusted.
 if(session)fs.writeFileSync(path.join(dir,'candidate-task.json'),JSON.stringify({session,key}),{mode:0o600});
 const settings=JSON.stringify({data:dir,tools:path.join(dir,'runtime'),tmp,cache:path.join(dir,'cache'),config:path.join(dir,'config'),home:path.join(dir,'home')});
 if(globalThis.__CINDY_NODE__&&!globalThis.__CINDY_NODE__.spawnEntry)throw Error('HOST_CAPABILITY_MISSING: candidate needs spawnEntry');
 const child=globalThis.__CINDY_NODE__?.spawnEntry ? await globalThis.__CINDY_NODE__.spawnEntry('node/engine-worker.cjs',['--candidate-paths',settings]) : spawn(process.execPath,[path.join(__dirname,'engine-worker.cjs'),'--candidate-paths',settings],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
 let channel;channel=createChannel(child,{host:!!globalThis.__CINDY_NODE__,onExit:()=>{owned.delete(channel);if(channel&&children.get(key)?.channel===channel)children.delete(key);}});
 if(channel.alive)owned.add(channel);
 const entry={child,dir,session,tmp,channel,request:channel.request};
 try{await channel.ready;}catch(error){if(channel.alive)children.set(key,entry);throw error;}
 if(!channel.alive)throw Error('candidate engine stopped during initialization');
 children.set(key,entry);
 return entry;})();starting.set(key,creating);try{return await creating;}finally{starting.delete(key);}
}
async function dispatch(method,params={}){
 if(leaving)throw Error('candidate is stopping');init();
 const session=params.session||null;
 if(!session&&['montclip/call','montclip/ui','montclip/bind','montclip/export-start','montclip/export-job','montclip/export-cancel','montclip/export-deliver'].includes(method))throw Object.assign(Error('Open the candidate in a Cindy task first'),{code:'TASK_REQUIRED'});
 if(method==='montclip/overview'){
  safeTree(root);const projects=[],exports=[];const tasks=path.join(root,'tasks');
  if(fs.existsSync(tasks))for(const key of fs.readdirSync(tasks)){const dir=path.join(tasks,key);try{const m=JSON.parse(fs.readFileSync(path.join(dir,'candidate-task.json'))),doc=JSON.parse(fs.readFileSync(path.join(dir,'project.json')));projects.push({id:key,task:m.session,name:doc.name,clips:(doc.clips||[]).length,active:children.has(key)});const ex=path.join(dir,'exports');if(fs.existsSync(ex))for(const name of fs.readdirSync(ex)){const stat=fs.statSync(path.join(ex,name));if(stat.isFile()&&!name.includes('.part'))exports.push({name,bytes:stat.size,modified:stat.mtime.toISOString(),task:m.session});}}catch{}}
  return {projects,exports,dataDir:root};
 }
 if(params.dir)exportDestination(params.dir,{root,ownDir:path.join(root,'tasks',taskKey(session))});
 const e=await engine(session);if(leaving)throw Error('candidate is stopping');let result;try{result=await e.request(method,params);}catch(error){if(method==='montclip/start')await e.channel.close();throw error;}
 if(method==='montclip/start')return {...result,source:fs.existsSync(path.join(__dirname,'../SOURCE.json'))?JSON.parse(fs.readFileSync(path.join(__dirname,'../SOURCE.json'))):null,pluginId:manifest.id,version:manifest.version,root,session,enginePid:e.child.pid};
 return result;
}
async function stop(){if(leaving)return;leaving=true;await Promise.allSettled([...starting.values()]);const results=await Promise.allSettled([...owned].map(x=>x.close()));const failure=results.find(x=>x.status==='rejected');if(failure){process.stderr.write('CHILD_EXIT_UNCONFIRMED: '+failure.reason.message+'\\n');process.exit(1);return;}lock?.release();process.exit(0);}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,stop);
readline.createInterface({input:process.stdin}).on('close',stop).on('line',async line=>{let r;try{r=JSON.parse(line);if(r.id==null)return;const result=await dispatch(r.method,r.params);reply({jsonrpc:'2.0',id:r.id,result});}catch(e){reply({jsonrpc:'2.0',id:r?.id??null,error:{code:-32000,message:e.code==='DATA_DIR_IN_USE'&&e.reason==='LOCK_OWNER_UNVERIFIED'?'Writer lock ownership cannot be verified.':String(e.message),data:{code:e.code||'CANDIDATE_FAILED',...(e.code==='DATA_DIR_IN_USE'&&e.reason==='LOCK_OWNER_UNVERIFIED'?{reason:'LOCK_OWNER_UNVERIFIED'}:{})}}});}});
