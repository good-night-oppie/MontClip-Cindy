"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
test("worker logs allow only metadata, including for JSON secrets and arbitrary POSIX roots",()=>{
 const log=require("../node/safe-log.cjs");
 const secret="/workspace/SecretOwner/clip.mp4 /home/Synthetic Owner/private token=synthetic-secret";
 const output=log.event({event:"error",code:"FAILED",message:secret,path:secret,token:"synthetic-secret",ms:3})+log.consoleLine("warn",secret);
 assert.doesNotMatch(output,/SecretOwner|Synthetic|synthetic-secret|private/);assert.match(output,/FAILED/);assert.match(output,/"ms":3/);
});
test("download failures cannot return raw host messages and downloaded retry refreshes",async()=>{
 for(const downloaded of [false,true]){
  let listener;const sent=[],calls=[];
  const cindy={onHostMessage:f=>listener=f,send:async m=>{sent.push(m);return{ok:true}},downloads:{start:async()=>({ok:false,message:"/workspace/SecretOwner/archive token=synthetic-secret"})},node:{request:async r=>{calls.push(r.method);return {ok:true,result:r.method==="montclip/ffmpeg-spec"?{supported:true,state:downloaded?"downloaded":"missing"}:{engine:{state:"ready"}}}}}};
  vm.runInNewContext(fs.readFileSync(path.join(root,"main.js"),"utf8"),{cindy,BroadcastChannel:class{postMessage(m){sent.push(m);}},console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
  await listener({type:"tool-call",tool:"montclip_candidate_install_ffmpeg",callId:"download",args:{session_context:{session_id:"synthetic"}}});
  assert.doesNotMatch(JSON.stringify(sent),/SecretOwner|synthetic-secret/);
  assert.equal(calls.includes("montclip/ffmpeg-refresh"),downloaded);
 }
});
test("console problem detail does not expose synthetic path or token",()=>{
 const P=require("../problem-details.js");
 const line=P.logLine({code:"FAILED",error:"cannot open C:\\Users\\SyntheticOwner\\private\\clip.mp4 token=synthetic-secret"});
 assert.doesNotMatch(line,/SyntheticOwner|synthetic-secret/);
});
test("tool exception does not send raw private error to the model",async()=>{
 let listener;const sent=[];
 const cindy={onHostMessage:f=>listener=f,send:async m=>{sent.push(m);return{ok:true}},node:{request:async()=>{throw Error("C:\\Users\\SyntheticOwner\\private\\clip.mp4 token=synthetic-secret")}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,"main.js"),"utf8"),{cindy,BroadcastChannel:class{postMessage(){}},console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
 await listener({type:"tool-call",tool:"montclip_candidate_status",callId:"private-error",args:{session_context:{session_id:"synthetic"}}});
 const result=sent.find(m=>m.callId==="private-error");
 assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/SyntheticOwner|synthetic-secret/);
});
test("packed agent UI includes exact upstream licenses and notices",()=>{
 for(const f of ["upstream/LICENSE","upstream/NOTICE","cindy-43001ea/LICENSE","cindy-43001ea/NOTICE","THIRD-PARTY-NOTICES.txt","BUNDLED-LICENSES.json","BUNDLED-PACKAGES.json","SOURCES.json","licenses/react-remove-scroll-bar.LICENSE"]){
  const rel=path.join("agent-ui",f);
  assert.deepEqual(fs.readFileSync(path.join(root,"dist/montclip/node/app",rel)),fs.readFileSync(path.join(root,"engine",rel)),rel);
 }
});
