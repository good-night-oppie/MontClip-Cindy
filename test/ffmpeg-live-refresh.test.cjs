"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
// Execute the actual install method. Archive validation has its separate filesystem tests.
// No download, real tools, host instance or user project is involved.
function fixture(response={status:200,body:{state:"ready"}},running=true){
 const source=fs.readFileSync(path.join(__dirname,"../node/engine-worker.cjs"),"utf8");
 const begin=source.indexOf('async "montclip/ffmpeg-refresh"()');
 const end=source.indexOf('  /* Export (',begin);
 const scheduled=[],requests=[],engine=running?{origin:"http://127.0.0.1:1",ffmpeg:"missing"}:null;
 const context={ffmpegSpec:()=>({supported:true}),ffmpegManifest:()=>({}),PLATFORM:"linux-x64",fetchFfmpeg:()=>({}),process:{platform:"linux",env:{}},path,os:{tmpdir:()=>"/synthetic"},installFfmpeg:()=>({installed:true,version:"synthetic"}),FFMPEG_DIR:"/synthetic",note(){},started:engine,ffmpegState:()=>"downloaded",setTimeout:(f,ms)=>scheduled.push(ms),stopEngine(){},api:async(...a)=>{requests.push(a);if(response instanceof Error)throw response;return response;}};
 const methods=vm.runInNewContext("({"+source.slice(begin,end)+"})",context);context.METHODS=methods;const method=methods["montclip/ffmpeg-install"];
 return{run:()=>method({downloads:{archive:"synthetic"}}),scheduled,requests,engine};
}
test("successful tool install refreshes the same engine without stopping pending editor saves",async()=>{
 const f=fixture();const result=await f.run();
 assert.deepEqual(f.scheduled,[],"no 300ms termination may race 400ms saves or deferred undo PUT");
 assert.deepEqual(f.requests,[["POST","/api/ffmpeg/detect"]]);
 assert.equal(result.restarting,false);assert.equal(result.engine.state,"ready");
 assert.equal(f.engine.origin,"http://127.0.0.1:1");assert.equal(f.engine.ffmpeg,"downloaded");
});
for(const response of [{status:500,body:{}},new Error("synthetic timeout")]){
 test("refresh failure reports explicitly and leaves editor alive",async()=>{
  const f=fixture(response);await assert.rejects(f.run(),{code:"FFMPEG_REFRESH_FAILED"});
  assert.deepEqual(f.scheduled,[]);assert.equal(f.engine.ffmpeg,"missing");
 });
}
test("install before engine startup does not start or stop an editor",async()=>{
 const f=fixture(undefined,false);const result=await f.run();
 assert.deepEqual(f.scheduled,[]);assert.deepEqual(f.requests,[]);assert.equal(result.restarting,false);
});
