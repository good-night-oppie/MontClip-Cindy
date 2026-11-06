"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"..");
function host(){
 let listener,channel,fail=true;const sent=[],calls=[];
 const cindy={onHostMessage:f=>listener=f,send:async m=>{sent.push(m);return{ok:true}},node:{request:async r=>{
  calls.push(r.method);
  if(r.method==="montclip/ffmpeg-spec")return{ok:true,result:{supported:true,state:"downloaded"}};
  if(fail)return{ok:false,message:"synthetic refresh failed",data:{code:"FFMPEG_REFRESH_FAILED"}};
  return{ok:true,result:{engine:{state:"ready"}}};
 }}};
 vm.runInNewContext(fs.readFileSync(path.join(root,"main.js"),"utf8"),{cindy,BroadcastChannel:class{constructor(){channel=this;}postMessage(m){sent.push(m);}},console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
 return{sent,calls,recover:()=>fail=false,tool:()=>listener({type:"tool-call",tool:"montclip_candidate_install_ffmpeg",callId:"refresh",args:{session_context:{session_id:"synthetic"}}}),page:()=>channel.onmessage({data:{reqId:"page-refresh",type:"ffmpeg-install",session:"synthetic"}})};
}
test("already-downloaded refresh rejection becomes a tool error and releases install state",async()=>{
 const h=host();await assert.doesNotReject(h.tool());
 const result=h.sent.find(m=>m.type==="tool-result");assert.equal(result.ok,false);assert.equal(result.errorCode,"FFMPEG_REFRESH_FAILED");
 h.recover();await h.tool();assert.equal(h.sent.filter(m=>m.type==="tool-result").at(-1).result.already,true);
 assert.deepEqual(h.calls,["montclip/ffmpeg-spec","montclip/ffmpeg-refresh","montclip/ffmpeg-spec","montclip/ffmpeg-refresh"]);
});
test("already-downloaded refresh rejection reaches the real banner click handler's failure state",async()=>{
 const h=host();await assert.doesNotReject(h.page());
 const answer=h.sent.find(m=>m.reqId==="page-refresh");assert.equal(answer.code,"FFMPEG_REFRESH_FAILED");assert.ok(answer.error);
 const source=fs.readFileSync(path.join(root,"frame.js"),"utf8");
 const begin=source.indexOf("document.getElementById('ffmpegGet').addEventListener('click', async () => {");
 const start=source.indexOf("async () => {",begin),end=source.indexOf("\n    });",start);
 const states=[];const click=vm.runInNewContext("("+source.slice(start,end)+"})",{progress:m=>states.push(m),ask:async type=>{assert.equal(type,"ffmpeg-install");return answer;}});
 await assert.doesNotReject(click());assert.equal(states.at(-1).phase,"failed");assert.equal(states.at(-1).code,"FFMPEG_REFRESH_FAILED");
 const progressStart=source.indexOf("  function progress(m) {"),progressEnd=source.indexOf("\n  if (banner) {",progressStart);
 const elements={};let displayed;
 const P=require("../problem-details.js");
 const progress=vm.runInNewContext(source.slice(progressStart,progressEnd)+";progress",{
  banner:{},window:{MontClipFfmpegBanner:require("../ffmpeg-banner.js")},MontClipProblem:P,
  document:{getElementById:id=>elements[id]||(elements[id]={firstElementChild:{style:{}}})},
  bannerText:(text,bad,detail,problem)=>displayed={text,bad,detail,problem},
  console:{warn:line=>assert.doesNotMatch(line,/synthetic refresh failed/)},
 });
 progress(states.at(-1));assert.doesNotMatch(displayed.text,/synthetic refresh failed/);
 assert.equal(elements.ffmpegGet.hidden,false);assert.ok(displayed.problem);
 assert.equal(P.copyLine(displayed.problem,new Date("2026-11-06T06:00:00Z")),"[MontClip] 2026-11-06T06:00:00.000Z FFMPEG_REFRESH_FAILED: Operation failed.");
});
test("unverifiable lock ownership is not translated into a known live window",()=>{
 const source=fs.readFileSync(path.join(root,"main.js"),"utf8"),start=source.indexOf("const DATA_DIR_IN_USE_TEXT"),end=source.indexOf("async function node(",start);
 const translate=vm.runInNewContext(source.slice(start,end)+";engineError");
 const error=translate({message:"Writer lock ownership cannot be verified for /synthetic/candidate.",data:{code:"DATA_DIR_IN_USE"}});
 assert.equal(error.code,"DATA_DIR_IN_USE");assert.match(error.message,/ownership cannot be verified/);assert.doesNotMatch(error.message,/另一个|正在用/);
});
