"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const P=require("../problem-details.js");
const at=new Date("2026-11-06T06:00:00.000Z");
const raw=[
 "X-MontClip-Session: SYNTHETIC_SESSION_ONLY",
 '{"api_key":"synthetic-json-secret"}',
 "token: synthetic-colon-secret",
 "Authorization: Basic c3ludGhldGljOm9ubHk=",
 "ghp_synthetic_not_a_real_credential",
 "gho_synthetic_not_a_real_credential",
 "github_pat_synthetic_not_a_real_credential",
 "synthetic.person@example.invalid",
 "/workspace/Synthetic Owner/private/clip.mp4",
 "unclassified arbitrary private message",
];
for(const error of raw)test("copy diagnostic excludes raw payload: "+error.split(":")[0],()=>{
 const line=P.copyLine({code:"FFMPEG_REFRESH_FAILED",error,token:error,email:error},at);
 assert.equal(line,"[MontClip] 2026-11-06T06:00:00.000Z FFMPEG_REFRESH_FAILED: Operation failed.");
});
test("untrusted code is not a free text channel, even when uppercase",()=>{
 for(const code of ["/private/SyntheticOwner","SYNTHETIC_SECRET","Authorization: Basic synthetic","FAILED\nsecret",{},null]){
  assert.equal(P.copyLine({code,error:"private"},at),"[MontClip] 2026-11-06T06:00:00.000Z UNKNOWN: Operation failed.");
 }
});
test("copy never reads raw detail and remains bounded",()=>{
 const problem={code:"ENOSPC",get error(){throw Error("raw detail must not be inspected");},metadata:"x".repeat(100000)};
 assert.equal(P.copyLine(problem,at),"[MontClip] 2026-11-06T06:00:00.000Z ENOSPC: Operation failed.");
 assert.equal(P.copyLine(problem,at),P.logLine(problem,at));
});
