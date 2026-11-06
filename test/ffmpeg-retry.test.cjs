"use strict";
/* Retrying the ffmpeg download after the archive failed its check (Rea on MontClip-Cindy#5). Cindy's plugin manual
   (§4.12) has no call to drop a cached download or force a fresh one, and the host keys its cache by the download id,
   so a retry after a failed check asks under a new id. A retry after a plain download failure keeps the id, so the
   host can resume its partial file. main.js runs here against a fake host. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
test('editor banner reads only its task tool installation state',async()=>{
 let channel;const calls=[];
 class BroadcastChannel{constructor(){channel=this;}postMessage(){}}
 const cindy={onHostMessage(){},send:async()=>({ok:true}),node:{request:async r=>{calls.push(r);return{ok:true,result:{state:'downloaded'}};}}};
 vm.runInNewContext(MAIN,{cindy,BroadcastChannel,console,setTimeout,clearTimeout,setInterval,clearInterval,URL});
 await channel.onmessage({data:{reqId:'state-a',type:'ffmpeg-state',session:'task-a'}});
 assert.equal(calls[0].method,'montclip/ffmpeg-spec');assert.equal(calls[0].params.session,'task-a');
});

function host({ firstFails }) {
  const messages=[]; const starts = [], files = new Map();   // download id → the file the host keeps for it (a cache that never changes)
  let listener = null;
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async () => ({ ok: true }),
    downloads: {
      async start(p) {
        starts.push(p.id);
        if (firstFails === "network" && starts.length === 1) return { ok: false, message: "connection reset" };
        if (!files.has(p.id)) files.set(p.id, files.size === 0 && firstFails === "check" ? "bad" : "good");
        return { ok: true, token: files.get(p.id), bytes: p.bytes, sha256: p.sha256, fromCache: starts.length > 1 };
      },
    },
    node: {
      async request(r) {
        if (r.method === "montclip/ffmpeg-spec")
          return { ok: true, result: { supported: true, platform: "linux-x64", url: "https://github.com/x/ff.tar.xz", sha256: "a".repeat(64), bytes: 10, state: "missing" } };
        if (r.method === "montclip/ffmpeg-install") {
          if (r.downloadTokens.archive === "bad")
            return { ok: false, errorCode: "PROTOCOL_ERROR", message: "archive size mismatch: got 9 bytes, pinned 10", data: { code: "SIZE_MISMATCH" } };
          return { ok: true, result: { installed: true, version: "ffmpeg version test", state: "downloaded" } };
        }
        return { ok: false, errorCode: "NO", message: r.method };
      },
    },
  };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage(m) {messages.push(m);} }
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  let n = 0;
  const install = () => new Promise((resolve) => {
    const callId = "c" + (++n);
    cindy.send = async (m) => { if (m.type === "tool-result" && m.callId === callId) resolve(m); return { ok: true }; };
    listener({ type: "tool-call", tool: "montclip_candidate_install_ffmpeg", callId, args: {session_context:{session_id:"download-task"}} });
  });
  return { starts, install, messages };
}

test("after the archive fails its check, the retry downloads under a new id and gets a new file", async () => {
  const h = host({ firstFails: "check" });
  const first = await h.install();
  assert.equal(first.result.code, "SIZE_MISMATCH");
  const again = await h.install();
  assert.equal(again.result.install.installed, true, JSON.stringify(again.result));
  assert.equal(h.starts.length, 2);
  assert.notEqual(h.starts[1], h.starts[0], "the same id would get the same cached file back");
  for (const id of h.starts) assert.match(id, /^ffmpeg-linux-x64(-r\d+-[a-z0-9]+)?$/);
  for (const id of h.starts) assert.match(id, /^[\w-]{1,100}$/, "Cindy's download id rule");
});

test("after a plain download failure, the retry keeps the id so Cindy can resume its partial file", async () => {
  const h = host({ firstFails: "network" });
  assert.equal((await h.install()).result.code, "DOWNLOAD_FAILED");
  assert.equal((await h.install()).result.install.installed, true);
  assert.deepEqual(h.starts, ["ffmpeg-linux-x64", "ffmpeg-linux-x64"]);
});

test('every installer progress event is scoped to its originating task',async()=>{const h=host({firstFails:'check'});await h.install();await h.install();const events=h.messages.filter(x=>x.type==='ffmpeg-progress');assert.ok(events.some(x=>x.phase==='installed'));assert.ok(events.some(x=>x.phase==='failed'));for(const e of events)assert.equal(e.session,'download-task');});
