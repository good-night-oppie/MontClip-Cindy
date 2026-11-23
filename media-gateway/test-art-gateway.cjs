// Test an unpacked Forge artifact. The optional third argument is the verified vendor exe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const [dir, original, vendor] = process.argv.slice(2);
const read = (root,name) => fs.readFileSync(path.join(root,name),'utf8').replace(/^\uFEFF/,'');
const manifest = JSON.parse(read(dir,'ghost.json'));
assert.deepEqual(manifest.tools.slice(0,4), JSON.parse(read(original,'ghost.json')).tools);
function host(root, worker) {
  let listener;
  let done;
  const cindy = {ping:async()=>{},onHostMessage:fn=>listener=fn,
    kv:{get:async()=>({})},node:{request:worker},send:async message=>done(JSON.parse(JSON.stringify(message)))};
  vm.runInNewContext(read(root,'main.js'),{cindy,console});
  return (tool,args) => new Promise(resolve=>{done=resolve;listener({type:'tool-call',callId:'test',tool,args})});
}
async function verify() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'gateway-test-'));
  function worker(request) {
    const r = spawnSync(process.execPath,[path.join(dir,'worker.cjs')],{encoding:'utf8',
      input:JSON.stringify({jsonrpc:'2.0',id:1,...request})+'\n',
      env:{...process.env,USERPROFILE:profile,HOME:profile},timeout:20000});
    assert.equal(r.status,0);
    return {ok:true,result:JSON.parse(r.stdout).result};
  }
  const call = host(dir,worker), baseline = host(original);
  for (const tool of manifest.tools.slice(0,4)) {
    for (const args of [{},{prompt:'test',model:'test-image'}]) {
      assert.deepEqual(await call(tool.name,args),await baseline(tool.name,args));
    }
  }
  for (const provider of ['flow','capcut','dreamina']) {
    const caps = (await call(provider+'_capabilities',{})).result;
    assert.deepEqual([caps.provider, caps.code, caps.operations.ledger], [provider, 'OK', 'wired']);
    assert.equal(JSON.stringify(caps).includes(profile), false);
    for (const operation of ['submit','quote','fetch']) {
      const result = (await call(provider+'_operation',{operation, requestId:'shot-0001-take1', quoteId:'x'})).result;
      if (provider !== 'dreamina') { assert.equal(result.code,'OFFICIAL_AGENT_INTERFACE_UNVERIFIED'); assert.ok(result.message); }
    }
    assert.equal((await call(provider+'_operation',{operation:'nonsense'})).result.code,'UNSUPPORTED_OPERATION');
    assert.deepEqual((await call(provider+'_operation',{operation:'ledger'})).result.jobs, []);
  }
  const d = async args => (await call('dreamina_operation',args)).result;
  assert.equal((await d({operation:'submit',requestId:'shot-0001-take1',quoteId:'x'})).code,'SPENDING_DISABLED');
  assert.equal((await d({operation:'quote',requestId:'shot-0001-take1',projectId:'00000000-0000-4000-8000-000000000000',nodeId:'n1'})).code,'QUOTE_UNAVAILABLE');
  assert.equal((await d({operation:'fetch',requestId:'shot-0001-take1'})).code,'UNSUPPORTED_OPERATION');
  assert.equal((await d({operation:'cancel'})).code,'CANCEL_UNAVAILABLE');
  assert.equal((await call('flow_capabilities',{})).result.adapterApproved,false);
  // CapCut draft through the real entry -> worker path, from a synthetic clip.
  const clip = path.join(profile,'clip.mp4');
  fs.writeFileSync(clip, Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftypisom'),Buffer.alloc(512,1)]));
  const draft = (await call('capcut_operation',{operation:'draft',name:'gateway test',clips:[{path:clip,mediaType:'video',durationMs:4000,width:1280,height:720}]})).result;
  assert.deepEqual([draft.code,draft.generated,draft.installedInCapCutStore,draft.durationMs],['OK',false,false,4000]);
  assert.ok(draft.folder.startsWith(path.join(profile,'.cindy-media-gateway-dev','capcut-drafts')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(draft.folder,'draft_content.json'),'utf8')).tracks[0].segments.length,1);
  const firstDoc = fs.readFileSync(path.join(draft.folder,'draft_content.json'));
  const draftArgs = {operation:'draft',name:'gateway test',clips:[{path:clip,mediaType:'video',durationMs:4000,width:1280,height:720}]};
  const dup = (await call('capcut_operation',draftArgs)).result;
  assert.deepEqual([dup.code,dup.name,dup.renamed,dup.requestedName],['OK','gateway test (2)',true,'gateway test']);
  assert.equal(dup.folder, path.join(profile,'.cindy-media-gateway-dev','capcut-drafts','gateway test (2)'));
  assert.ok(fs.existsSync(path.join(dup.folder,'draft_content.json')));
  assert.ok(fs.readFileSync(path.join(draft.folder,'draft_content.json')).equals(firstDoc));
  // Two worker processes asked for the same name together.
  const {spawn} = require('node:child_process');
  const pair = await Promise.all([1,2].map(() => new Promise(resolve => {
    const child = spawn(process.execPath,[path.join(dir,'worker.cjs')],{env:{...process.env,USERPROFILE:profile,HOME:profile}});
    let out=''; child.stdout.on('data',d=>{out+=d; if(out.includes(String.fromCharCode(10))){child.kill(); resolve(JSON.parse(out).result);}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'operation',params:{provider:'capcut',...draftArgs}})+String.fromCharCode(10));
  })));
  assert.deepEqual(pair.map(r=>r.name).sort(),['gateway test (3)','gateway test (4)']);
  assert.ok(fs.readFileSync(path.join(draft.folder,'draft_content.json')).equals(firstDoc));
  assert.deepEqual(fs.readdirSync(path.dirname(draft.folder)).sort(),['gateway test','gateway test (2)','gateway test (3)','gateway test (4)']);
  assert.equal((await call('flow_operation',{operation:'draft',name:'x',clips:[]})).result.code,'UNSUPPORTED_OPERATION');
  const op = async args => (await call('dreamina_operation',args)).result;
  assert.equal((await op({operation:'query',projectId:'--help'})).code,'INVALID_REFERENCE');
  assert.equal((await op({operation:'version'})).code,'CLI_NOT_INSTALLED');
  const bin = path.join(profile,'bin','dreamina-canvas.exe');
  fs.mkdirSync(path.dirname(bin));
  fs.writeFileSync(bin,'invalid executable');
  assert.equal((await op({operation:'version'})).code,'UNVERIFIED_CLI_BUILD');
  if (vendor) {
    fs.copyFileSync(vendor,bin);
    assert.equal((await op({operation:'version'})).version,'1.4.0');
    assert.deepEqual(await op({operation:'connection'}),{provider:'dreamina',code:'OK',connected:false});
    fs.unlinkSync(bin);
  }
  console.log('PASS: four legacy schemas and eight dispatch comparisons; three provider entries with live capabilities and stable codes; spend guard; CapCut draft via entry and worker, same name saved under a new name (repeat, and two workers at once), original kept; reference validation; missing and mismatched CLI'+(vendor?'; actual CLI version and isolated signed-out profile':''));
}
verify().catch(error=>{console.error(error);process.exitCode=1});
