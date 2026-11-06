'use strict';
const test=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const RUNTIME=process.env.MONTCLIP_TEST_PACKAGE?path.resolve(process.env.MONTCLIP_TEST_PACKAGE):ROOT;
const APP=process.env.MONTCLIP_TEST_PACKAGE?path.join(RUNTIME,'node/app'):path.join(ROOT,'engine');
const ZH='现在没法确认这里的项目是不是正在被其他窗口使用，所以 MontClip 先不打开。请别反复重开，也别删除项目文件；把这段提示发给给你这个包的人，让他们检查。';
const EN="MontClip can't tell whether your projects are being used by another window, so it won't open them right now. Don't keep reopening MontClip or delete any files. Send this message to the person who gave you this package so they can check.";
for(const scope of ['root','task'])for(const kind of ['unverified','invalid-pid','active'])test(scope+' '+kind+' lock error reaches actual frame display',{timeout:10000},async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'mcc-lock-visible-')),root=path.join(home,'synthetic-private-root');fs.mkdirSync(root);fs.writeFileSync(path.join(root,'candidate-identity.json'),JSON.stringify({id:'montclip-candidate'}));
 const lockDir=scope==='root'?root:path.join(root,'tasks',require('node:crypto').createHash('sha256').update('synthetic').digest('hex'));fs.mkdirSync(lockDir,{recursive:true});
 const content=kind==='unverified'?'{bad json':JSON.stringify({pid:kind==='invalid-pid'?0:process.pid,shell:'server'});fs.writeFileSync(path.join(lockDir,'.montclip-writer.lock'),content);
 const child=spawn(process.execPath,[path.join(RUNTIME,'node/worker.cjs')],{env:{...process.env,MONTCLIP_CANDIDATE_DATA:root,MONTCLIP_CINDY_DATA:'',MONTCLIP_CINDY_APP:APP,HOME:home,USERPROFILE:home},stdio:['pipe','pipe','pipe'],windowsHide:true});child.stderr.resume();
 t.after(async()=>{if(child.exitCode===null&&!child.signalCode){const exited=new Promise(r=>child.once('exit',r));child.stdin.end();await exited;}a.equal(path.dirname(home),path.resolve(os.tmpdir()));fs.rmSync(home,{recursive:true,force:true});});
 const response=new Promise(resolve=>{let b='';child.stdout.on('data',c=>{b+=c;const n=b.indexOf('\n');if(n>=0)resolve(JSON.parse(b.slice(0,n)));});});child.stdin.write(JSON.stringify({id:1,method:'montclip/start',params:{session:'synthetic'}})+'\n');const rpc=await response;
 a.equal(fs.readFileSync(path.join(lockDir,'.montclip-writer.lock'),'utf8'),content);
 let channel;const messages=[];const cindy={onHostMessage(){},send:async()=>({ok:true}),node:{request:async()=>({ok:false,message:rpc.error.message,data:rpc.error.data})}};
 vm.runInNewContext(fs.readFileSync(path.join(RUNTIME,'main.js'),'utf8'),{cindy,BroadcastChannel:class{constructor(){channel=this;}postMessage(m){messages.push(m);}},console,setTimeout,clearTimeout,setInterval,clearInterval,URL});await channel.onmessage({data:{reqId:'probe',type:'bind',session:'synthetic'}});const answer=messages[0];
 const f=fs.readFileSync(path.join(RUNTIME,'frame.js'),'utf8'),start=f.indexOf('  const show ='),end=f.indexOf('\n  function ask(',start),bs=f.indexOf('  async function bind()'),be=f.indexOf('\n  document.addEventListener',bs);
 let retries=0;const status={appendChild(){retries++;}};const bind=vm.runInNewContext(f.slice(start,end)+f.slice(bs,be)+';bind',{status,view:'task',session:'synthetic',ask:async()=>answer,document:{createElement:()=>({addEventListener(){}})},location:{reload(){}},copyButton(){},failureText(){throw Error('unexpected generic route');}});await bind();
 const result={kind,scope,rpcCode:rpc.error.data.code,reason:rpc.error.data.reason||null,visible:status.textContent,exposesRoot:status.textContent.includes(root),lockUnchanged:true};fs.writeFileSync(path.join(ROOT,'dist','trial7-lock-'+scope+'-'+kind+'-evidence.json'),JSON.stringify(result,null,2));t.diagnostic(JSON.stringify(result));
 a.equal(answer.code,'DATA_DIR_IN_USE');a.equal(result.exposesRoot,false,'raw directory must not reach visible status');
 if(kind!=='active'){a.equal(rpc.error.data.reason,'LOCK_OWNER_UNVERIFIED');a.equal(answer.reason,'LOCK_OWNER_UNVERIFIED');a.equal(status.textContent,ZH);a.equal(answer.errorEn,EN);a.equal(retries,0);a.equal(JSON.stringify(rpc.error).includes(root),false);a.doesNotMatch(require(path.join(RUNTIME,'problem-details.js')).copyLine({code:answer.code,error:answer.error}),/synthetic-private-root|Writer lock/);}
 else{a.equal(rpc.error.data.reason,undefined);a.notEqual(status.textContent,ZH);a.equal(retries,1);}
});
