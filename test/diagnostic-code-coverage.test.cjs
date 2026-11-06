"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const P=require("../problem-details.js"),at=new Date("2026-11-06T06:00:00Z");
const confirmed=["EXPORT_FAILED","UNPACK_FAILED","TASK_LIMIT","FOLDER_NOT_ALLOWED","NO_FOLDER","NO_ARCHIVE","NO_PINNED_BYTES"];
for(const code of confirmed)test("reachable plugin diagnostic preserves "+code,()=>{
 assert.equal(P.copyLine({code,error:"private synthetic detail"},at),"[MontClip] 2026-11-06T06:00:00.000Z "+code+": Operation failed.");
});
// Test-only bounded scan. Never used to populate the production allowlist.
// It intentionally covers this plugin's literal error producers, not engine internals,
// OS errno values, external host codes, or arbitrary dynamic expressions.
test("new literal codes at plugin diagnostic producers require explicit classification",()=>{
 const root=path.resolve(__dirname,".."),found=new Set();
 const read=f=>fs.readFileSync(path.join(root,f),"utf8");
 for(const f of ["main.js","node/worker.cjs","node/engine-worker.cjs","node/lib.cjs"])
  for(const m of read(f).matchAll(/\bcode\s*:\s*["']([A-Z][A-Z0-9_]*)["']/g))found.add(m[1]);
 const region=(s,start,end)=>{const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a);return s.slice(a,b);};
 for(const s of [
  region(read("main.js"),"function plainFailure(","/** Why an export"),
  region(read("main.js"),"function openEditorFailed(","/* 听写"),
  region(read("main.js"),"const shown = { session:","pendingProblems.set")
 ])for(const m of s.matchAll(/["']([A-Z][A-Z0-9_]*)["']/g))found.add(m[1]);
 for(const m of region(read("node/lib.cjs"),"function unpackCode(","\n}").matchAll(/return\s+["']([A-Z][A-Z0-9_]*)["']/g))found.add(m[1]);
 const excluded={
  COPY_FAILED:"plainFailure tool-result fallback only; copy-problem uses EXPORT_FAILED when c.code is absent",
  TASK_VIEW_FAILED:"openEditorFailed logs with main.logProblem; not passed to MontClipProblem"
 };
 for(const code of found){
  if(excluded[code])continue;
  assert.ok(P.copyLine({code},at).includes(" "+code+": "),"classify production literal "+code);
 }
 for(const code of Object.keys(excluded)){assert.ok(found.has(code));assert.ok(P.copyLine({code},at).includes(" UNKNOWN: "));}
 assert.match(read("node/engine-worker.cjs"),/throw Error\('CANDIDATE_CONFIG_REQUIRED'\)/);
 assert.ok(P.copyLine({code:"CANDIDATE_CONFIG_REQUIRED"},at).includes(" UNKNOWN: "),"early raw message is not a structured code");
});
