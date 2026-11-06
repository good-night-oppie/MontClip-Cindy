'use strict';
// Browser mode, AI background removal asks first (Deja, 2026-11-04): the real server and a headless Chrome / Edge on it.
// Every request is intercepted over CDP. By default nothing leaves this computer: cdn.jsdelivr.net is answered with a
// stand-in for MediaPipe's script (which then asks for its wasm and model files, as the real one does), anything else
// non-local is failed. Checks: opening a project with a bgRemove clip and getting ready for an export send nothing out
// (export fails with a caller-visible reason); the box names the host; "Not now" sends nothing; an explicit retry
// recovers a failed script download. Synthetic masks remove the left half in preview and exported ProRes pixels;
// a separate where:"headless" job must fail instead of inheriting consent. No speech/audio timing is involved.
// Usage: node tools/verify-bg-assets.cjs <extracted-package/node/app> <new-evidence-dir>
// Synthetic-only: page traffic is intercepted; browser background networking is disabled, not an OS firewall proof.
const { spawn, spawnSync } = require("child_process"), fs = require("fs"), path = require("path"), os = require("os");
const ROOT = path.resolve(process.argv[2]), CHROME = require(path.join(ROOT,"export-jobs.js")).findBrowser();
const {serverLease,pipeClient}=require("../engine/real-tests/privacy-runtime.cjs");
if (!CHROME) { throw Error("No existing browser"); }
const REAL = false; // Synthetic-only, never enable real network/model execution.
let ORIGIN;
const evidence=path.resolve(process.argv[3]);if(fs.existsSync(evidence))throw Error("Evidence directory must be new");fs.mkdirSync(evidence,{recursive:true});process.env.SMOKE_EVIDENCE_DIR=evidence;
const runRoot=fs.mkdtempSync(path.join(os.tmpdir(),"mc-assets-"));fs.chmodSync(runRoot,0o700);
const data=path.join(runRoot,"data");fs.mkdirSync(data);
const testEnv={...process.env,TMP:runRoot,TEMP:runRoot,TMPDIR:runRoot,XDG_CONFIG_HOME:path.join(runRoot,"config"),XDG_CACHE_HOME:path.join(runRoot,"cache")};
fs.mkdirSync(path.join(data, "media"));
// a 64×64 PNG: grey with a darker square (no need for a real person — the point is what goes over the network)
const png = (() => {
  const zlib = require("zlib"), W = 64, H = 64, raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = y * (W * 4 + 1) + 1 + x * 4, v = x > 20 && x < 44 && y > 12 ? 60 : 200; raw[o] = raw[o + 1] = raw[o + 2] = v; raw[o + 3] = 255; }
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, body) => { const len = Buffer.alloc(4); len.writeUInt32BE(body.length); const tb = Buffer.concat([Buffer.from(type), body]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(tb)); return Buffer.concat([len, tb, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
})();
fs.writeFileSync(path.join(data, "media", "still.png"), png);
fs.writeFileSync(path.join(data, "project.json"), JSON.stringify({ name: "bg", width: 640, height: 360, fps: 30, revision: 1, panSchema: 1,
  media: [{ id: "m1", name: "still.png", kind: "image", src: "/media/still.png", width: 64, height: 64 }],
  clips: [{ id: "c1", kind: "image", mediaId: "m1", track: "V1", start: 0, in: 0, duration: 3, props: { bgRemove: true } }] }));
// the stand-in: what MediaPipe's script does that matters here — ask locateFile for its files and fetch them
const FAKE = `window.SelfieSegmentation = class { constructor(o) { this.o = o; for (const f of ["selfie_segmentation_solution_simd_wasm_bin.js", "selfie_segmentation_solution_simd_wasm_bin.wasm", "selfie_segmentation_landscape.tflite", "selfie_segmentation.binarypb"]) fetch(o.locateFile(f)).catch(() => {}); }
  setOptions() {} onResults(f) { this.cb = f; } async send() { const c = document.createElement("canvas"); c.width = c.height = 8; const x=c.getContext('2d'); x.fillStyle='white'; x.fillRect(4,0,4,8); this.cb && this.cb({ segmentationMask: c }); } };`;
// Replace only the inventory in the test page: actual fetch SRI + WebCrypto verify synthetic bytes.
// Never claim these hashes or the fake segmentation are the production model.
const fixtureBytes = Object.fromEntries(Object.keys(require(path.join(ROOT,'bgremove-assets.js')).FILES).map(name =>
  [name, Buffer.from(name === 'selfie_segmentation.js' ? FAKE : 'synthetic fixture: '+name)]));
const fixtureFiles = Object.fromEntries(Object.entries(fixtureBytes).map(([name,bytes]) =>
  [name,{size:bytes.length,sha256:require('crypto').createHash('sha256').update(bytes).digest('base64')}]));
const fixtureModule = fs.readFileSync(path.join(ROOT,'bgremove-assets.js'),'utf8').replace(
  /const FILES = [\s\S]*?\n  const error =/, 'const FILES = Object.freeze('+JSON.stringify(fixtureFiles)+');\n  const error =');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const proof=require('crypto').randomBytes(32).toString('hex');fs.writeFileSync(path.join(data,'media','proof.txt'),proof);
  const srv=spawn(process.execPath,[path.join(ROOT,'server.js')],{env:{...testEnv,PORT:'0',HOST:'127.0.0.1',FABLECUT_DATA_DIR:data,FABLECUT_NO_FS_WATCH:'1'},stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
  srv.stdout.resume();srv.stderr.on('data',b=>fs.appendFileSync(path.join(evidence,'server.log'),b));
  let ch,pipe,eventFailure;const stop=c=>new Promise((resolve,reject)=>{if(!c||c.exitCode!==null||c.signalCode)return resolve();const timer=setTimeout(()=>{c.kill('SIGKILL');reject(Error('Owned child exit unconfirmed: '+c.pid));},3000);c.once('exit',()=>{clearTimeout(timer);resolve();});c.kill();});
  const hard=setTimeout(()=>{ch?.kill();srv.kill();},120000);
  try {
    const lease=await serverLease(srv,{proofPath:'/media/proof.txt',proof});ORIGIN=lease.origin;
    const prof=path.join(runRoot,'profile');
    ch=spawn(CHROME,['--headless=new','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--remote-debugging-pipe','--user-data-dir='+prof,'--no-first-run','about:blank'],{env:testEnv,stdio:['ignore','ignore','ignore','pipe','pipe'],windowsHide:true});
    pipe=pipeClient(ch,{timeoutMs:60000});
    const targets=await pipe.send('Target.getTargets');const target=targets.targetInfos.find(t=>t.type==='page');
    const {sessionId:pageSession}=await pipe.send('Target.attachToTarget',{targetId:target.targetId,flatten:true});
    const send=(method,params={},sessionId=pageSession)=>pipe.send(method,params,sessionId);
    let failScript=true,corruptAsset=true;const external=[];
    const handleEvent=(m)=>{
      // Synthetic entry has no workers; no real third-party code is executed.
      if (m.method === "Fetch.requestPaused") {
        const sid = m.sessionId, { requestId, request } = m.params;
        if (!REAL && request.url === ORIGIN+'/bgremove-assets.js') return send('Fetch.fulfillRequest', {
          requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(fixtureModule).toString('base64')},sid);
        if (request.url.startsWith(ORIGIN) || /^(data|blob):/.test(request.url)) return send("Fetch.continueRequest", { requestId }, sid);
        external.push({ url: request.url, method: request.method, body: request.postData ? request.postData.length : 0 });
        if (new URL(request.url).hostname === "cdn.jsdelivr.net") {
          if (REAL) return send("Fetch.continueRequest", { requestId }, sid);
          const js = /selfie_segmentation\.js$/.test(request.url);
          if (js && failScript) { failScript=false; return send("Fetch.failRequest", { requestId, errorReason: "InternetDisconnected" }, sid); }
          const name=new URL(request.url).pathname.split('/').pop();
          const bytes=Buffer.from(fixtureBytes[name] || 'unlisted asset');
          if(corruptAsset && name==='selfie_segmentation_solution_wasm_bin.wasm')bytes[0]^=1;
          return send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: js ? "text/javascript" : "application/octet-stream" }, { name: "Access-Control-Allow-Origin", value: "*" }], body: bytes.toString("base64") }, sid);
        }
        return send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, sid);
      }
    };
    pipe.onEvent(m=>{Promise.resolve().then(()=>handleEvent(m)).catch(e=>{eventFailure=e;pipe.close();ch.kill();srv.kill();});});
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    await send("Runtime.enable");
    const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
    const toasts = () => ev(`[...document.querySelectorAll(".toast, #toast")].map((e) => e.textContent).join(" | ")`);
    await send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(6000);
    const r = { afterOpen: external.map((x) => x.url) };
    r.toastAfterOpen = await toasts();
    r.preflightError = await ev(`(async()=>{try { noteExportBgRemove(); await prepareFrameAssets(0.5); return null; } catch(e) { return e.message; }})()`);
    r.afterExportPrep = external.map((x) => x.url);
    r.exportToast = await toasts();
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    r.dialogText = await ev(`document.querySelector("dialog.font-consent-dialog")?.textContent || null`);
    r.whileOpen = external.length;
    await ev(`document.querySelector('[data-bg-remove-consent="deny"]').click(), 1`); r.denied = await ev(`window.__rb`);
    await sleep(500);
    r.afterDeny = external.length;
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    await ev(`document.querySelector('[data-bg-remove-consent="allow"]').click(), 1`);
    r.allowed = await ev(`window.__rb`);
    if (!REAL) {
      r.firstDownloadFailed = r.allowed === false;
      r.corruptDownloadRejected = await ev(`requestBgRemove().then(ok=>!ok && !bgSeg.seg && typeof SelfieSegmentation==='undefined')`);
      corruptAsset=false;
      r.allowed = await ev(`requestBgRemove()`);
      r.scriptAttempts = external.filter(x=>/selfie_segmentation\.js$/.test(x.url)).length;
    }
    // a cut-out on the still, as an export frame does (the real library runs its wasm and model here)
    await ev(`prepareFrameAssets(0.5).then(() => 1)`); await sleep(REAL ? 4000 : 800);
    r.maskReady = await ev(`!!bgSeg.masks.get("c1")`);
    r.afterAllow = external.slice();
    if (!REAL && r.allowed) {
      r.preview = await ev(`(async()=>{await renderStillAt(0.5); const x=els.preview.getContext('2d');return {w:els.preview.width,h:els.preview.height,left:[...x.getImageData(220,180,1,1).data],right:[...x.getImageData(420,180,1,1).data]};})()`);
      if(process.env.SMOKE_EVIDENCE_DIR){
        fs.mkdirSync(process.env.SMOKE_EVIDENCE_DIR,{recursive:true});
        const png=await ev(`els.preview.toDataURL('image/png').split(',')[1]`);
        fs.writeFileSync(path.join(process.env.SMOKE_EVIDENCE_DIR,'preview.png'),Buffer.from(png,'base64'));
      }
      r.tabExport = await ev(`fastExport({silent:true,profile:'prores422'})`);
      const src = r.tabExport?.outputs?.[0]?.src;
      if (src) {
        const file=path.join(data,'exports',path.basename(decodeURIComponent(src)));
        const decoded=spawnSync(process.env.MONTCLIP_FFMPEG || 'ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:4*1024*1024,windowsHide:true});
        if(decoded.status!==0)throw Error('decode: '+decoded.stderr);
        r.exportPixels={left:[...decoded.stdout.subarray((180*640+220)*3,(180*640+220)*3+3)],right:[...decoded.stdout.subarray((180*640+420)*3,(180*640+420)*3+3)]};
        if(process.env.SMOKE_EVIDENCE_DIR){
          const frame=spawnSync(process.env.MONTCLIP_FFMPEG || 'ffmpeg',['-v','error','-i',file,'-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'],{maxBuffer:4*1024*1024,windowsHide:true});
          if(frame.status!==0)throw Error('PNG decode: '+frame.stderr);
          fs.writeFileSync(path.join(process.env.SMOKE_EVIDENCE_DIR,'export.png'),frame.stdout);
        }
      }
    }
    // A separate page must not inherit the preview page's consent. The server's actual job receipt is the evidence.
    const req = await (await fetch(ORIGIN+'/api/export/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({where:'headless',profile:'prores422'})})).json();
    const jobId = req.id || req.job?.id;
    if (!jobId) throw Error('export request: '+JSON.stringify(req));
    for(let n=0;n<300;n++) {
      r.headless = await (await fetch(ORIGIN+'/api/export/job?id='+jobId)).json();
      if(['done','failed','cancelled'].includes(r.headless.status))break;
      await sleep(200);
    }
    await ev(`(window.__rb = requestBgRemove(), 1)`); await sleep(300);
    r.askedAgain = await ev(`!!document.querySelector("dialog.font-consent-dialog")`);
    if(process.env.SMOKE_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.SMOKE_EVIDENCE_DIR,'result.json'),JSON.stringify(r,null,2));
    console.log(JSON.stringify(r, null, 1));
    const host = (u) => new URL(u).hostname;
    const checks = [
      ["opening the project sent nothing out", r.afterOpen.length === 0],
      ["the open hint says the clip shows with its background", /AI/.test(r.toastAfterOpen)],
      ["getting an export frame ready sent nothing out", r.afterExportPrep.length === 0],
      ["export refuses unavailable masks", /BG_REMOVE_UNAVAILABLE/.test(r.preflightError)],
      ["the box names the host", !!r.dialogText && /cdn\.jsdelivr\.net/.test(r.dialogText)],
      ["nothing sent while the box is open, or after Not now", r.whileOpen === 0 && r.afterDeny === 0 && r.denied === null],
      ["after Load: only cdn.jsdelivr.net, only GETs with no body", r.allowed === true && r.afterAllow.length > 0 && r.afterAllow.every((x) => host(x.url) === "cdn.jsdelivr.net" && x.method === "GET" && !x.body)],
      ["the cut-out ran", r.maskReady === true],
      ["not asked twice in a session", r.askedAgain === false],
      ["corrupt WASM stops loading before entry JS executes", REAL || r.corruptDownloadRejected===true],
      ["explicit download retry works", REAL || (r.firstDownloadFailed && r.allowed && r.scriptAttempts===3)],
      ["independent headless job fails with actionable error, no output", r.headless.status==='failed' && /BG_REMOVE_UNAVAILABLE/.test(r.headless.error) && !r.headless.src],
      ["synthetic preview and exported frame remove left half and retain right half", REAL || (r.preview?.left[0]<30 && r.preview?.right[0]>150 && r.exportPixels?.left[0]<30 && r.exportPixels?.right[0]>150)],
    ];
    for (const [name, ok] of checks) console.log((ok ? "PASS " : "FAIL ") + name);
    if(eventFailure)throw eventFailure;
    process.exitCode = checks.every(([, ok]) => ok) ? 0 : 1;
  } finally {
    clearTimeout(hard);pipe?.close();const stopped=await Promise.allSettled([stop(ch),stop(srv)]);
    fs.writeFileSync(path.join(evidence,'ownership.json'),JSON.stringify({runRoot,serverPid:srv.pid,browserPid:ch?.pid,serverStopped:srv.exitCode!==null||!!srv.signalCode,browserStopped:!ch||ch.exitCode!==null||!!ch.signalCode}));
    if(stopped.some(r=>r.status==='rejected'))throw Error('Owned child cleanup unconfirmed; retained '+runRoot);
    const resolved=fs.realpathSync(runRoot),base=fs.realpathSync(os.tmpdir());if(path.dirname(resolved)!==base||!path.basename(resolved).startsWith('mc-assets-'))throw Error('Unsafe cleanup path');fs.rmSync(resolved,{recursive:true});

  }
})().catch((e) => { console.error(e); process.exit(1); });
