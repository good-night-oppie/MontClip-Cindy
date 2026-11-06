"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=process.env.OVERVIEW_TEST_SOURCE_ROOT || path.resolve(__dirname,".."),V=require(path.join(root,"main-view-model.js"));
function host(reply){
 let channel;const opens=[],nodes=[],sent=[];
 const cindy={onHostMessage(){},send:async()=>({ok:true}),taskView:async opts=>{opens.push(opts);if(reply instanceof Error)throw reply;return reply;},node:{request:async r=>{nodes.push(r);throw Error("must not start engine");}}};
 vm.runInNewContext(fs.readFileSync(path.join(root,"main.js"),"utf8"),{cindy,BroadcastChannel:class{constructor(){channel=this;}postMessage(m){sent.push(m);}},console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
 return {opens,nodes,sent,request:m=>channel.onmessage({data:{reqId:"open",type:"open-task",...m}})};
}
async function click(reply){
 const src=fs.readFileSync(path.join(root,"main-view.js"),"utf8"),at=src.indexOf("b.addEventListener('click', async () => {",src.indexOf("if (p.action === 'open-task')"));
 const start=src.indexOf("async () => {",at),end=src.indexOf("\n        });",start);
 const els={status:{dataset:{}},statusCopy:{}},calls=[];let failed;
 const f=vm.runInNewContext("("+src.slice(start,end)+"})",{V,p:{task:"task-A"},b:{},ask:async(type,extra)=>{calls.push({type,extra});return reply;},$:id=>els[id],fail:x=>failed=x});
 await f();return {els,calls,failed};
}
for(const [name,reply,state] of [
 ["missing focus",{ok:true,sessionId:"task-A"},"unconfirmed"],
 ["false focus",{ok:true,sessionId:"task-A",focusRequested:false},"unconfirmed"],
 ["wrong task",{ok:true,sessionId:"task-B",focusRequested:true},"unconfirmed"],
 ["missing task",{ok:true,focusRequested:true},"unconfirmed"],
 ["focus requested",{ok:true,sessionId:"task-A",focusRequested:true},"requested"],
 ["denied",{ok:false,errorCode:"PERMISSION_DENIED",message:"secret@example.invalid /private/test"},"failed"]
])test(name+" is rendered without claiming editor ready",async()=>{
 const actual=await click(reply);assert.equal(actual.els.status.dataset?.openState,state);
 assert.equal(actual.calls.length,1);assert.equal(actual.calls[0].extra.session,"task-A");
 assert.ok(actual.els.status.textContent.length>0);
 assert.doesNotMatch(actual.els.status.textContent,/secret@example|private\/test|已打开|已显示/);
 for(const lang of ["zh","en"]){const result=V.taskOpenResult(reply,"task-A",lang);assert.equal(result.state,state);assert.ok(result.text);}
});
test("invalid task context never asks host or starts engine",async()=>{
 for(const session of [undefined,null,""," ",{},12]){const h=host({ok:true});await h.request({session});assert.equal(h.opens.length,0);assert.equal(h.nodes.length,0);assert.equal(h.sent.at(-1).ok,false);}
});
test("valid target uses public focus call once even on resent request",async()=>{
 const h=host({ok:true,sessionId:"task-A",focusRequested:true});await h.request({session:"task-A"});await h.request({session:"task-A"});
 assert.equal(h.opens.length,1);assert.equal(h.opens[0].sessionId,"task-A");assert.equal(h.opens[0].focus,true);assert.equal(h.nodes.length,0);
});
test("host throws: returned error does not become focus acknowledgement",async()=>{
 const h=host(Error("synthetic failure"));await h.request({session:"task-A"});assert.notEqual(h.sent.at(-1).ok,true);
 assert.equal(V.taskOpenResult(h.sent.at(-1),"task-A").state,"failed");assert.equal(h.nodes.length,0);
});

