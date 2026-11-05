"use strict";
/* Transcription in the plugin (Deja's decision on P8, 2026-11-05): the speech engine (sherpa-onnx-node and its native
   part for this system), the silero VAD and the Paraformer zh model are downloaded the first time, never shipped in
   the package. Only from MontClip's own GitHub release (node/asr-runtime.json: url, sha256 and exact bytes, pinned),
   only after the user agreed in the host's own confirm box (source, size, licences), each file measured again by the
   worker, installed whole or not at all. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto"), vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const RUNTIME = path.join(ROOT, "node", "asr-runtime.json");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

test("the runtime list: MontClip's own GitHub release only, every file pinned, each with its licence", () => {
  const rt = JSON.parse(fs.readFileSync(RUNTIME, "utf8"));
  const engine = JSON.parse(fs.readFileSync(path.join(ROOT, "engine", "desktop", "asr-manifest.json"), "utf8"));
  assert.match(rt.release, /^asr-runtime-[\w.-]+$/);
  for (const it of rt.items) {
    const u = new URL(rt.base + it.name);
    assert.equal(u.protocol, "https:"); assert.equal(u.hostname, "github.com", it.name);
    assert.ok(u.pathname.startsWith("/good-night-oppie/MontClip/releases/download/" + rt.release + "/"), it.name);
    assert.ok(Number.isSafeInteger(it.bytes) && it.bytes > 0, it.name); assert.match(it.sha256, /^[0-9a-f]{64}$/, it.name);
    assert.ok(it.license && it.licenseFiles.length, it.name);
    for (const f of it.licenseFiles) assert.ok(fs.existsSync(path.join(ROOT, "engine", f)), f);
    assert.ok(it.origin, it.name + ": where the file was taken from");
  }
  for (const platform of ["linux-x64", "win32-x64"]) {
    const into = rt.items.filter((i) => i.platforms.includes(platform)).map((i) => i.into);
    assert.deepEqual(into.sort(), ["asr-models/asr/model.int8.onnx", "asr-models/asr/tokens.txt", "asr/engine/node_modules/sherpa-onnx-node",
      "asr/engine/node_modules/sherpa-onnx-" + (platform === "win32-x64" ? "win" : "linux") + "-x64", "asr/silero_vad.onnx"].sort(), platform);
  }
  // the same model and VAD the engine checks (desktop/asr-manifest.json)
  const by = (n) => rt.items.find((i) => i.into === n);
  for (const [n, f] of [["asr-models/asr/model.int8.onnx", engine.models.asr.files["model.int8.onnx"]], ["asr-models/asr/tokens.txt", engine.models.asr.files["tokens.txt"]], ["asr/silero_vad.onnx", engine.engine.vad]]) {
    assert.equal(by(n).bytes, f.size, n); assert.equal(by(n).sha256, f.sha256, n);
  }
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, "ghost.json"), "utf8"));
  assert.ok(!g.network.hosts.some((h) => /npmjs|npmmirror|hf-mirror|huggingface/.test(h)), "no other download hosts");
  assert.equal(g.confirm, true, "the host's confirm box is declared");
  assert.ok(g.tools.some((t) => t.name === "montclip_install_asr"));
});

/* A small runtime: an npm-style tarball (package/…), a VAD and two model files, made here. */
function world(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-install-asr-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pkg = path.join(dir, "src", "package"); fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(pkg, "package.json"), '{"name":"sherpa-onnx-node"}'); fs.writeFileSync(path.join(pkg, "addon.js"), "x");
  const tgz = path.join(dir, "node.tgz");
  execFileSync(process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar", ["-czf", tgz, "-C", path.join(dir, "src"), "package"]);
  const files = { "node.tgz": fs.readFileSync(tgz), "vad.onnx": Buffer.from("vad"), "model.onnx": Buffer.from("model"), "tokens.txt": Buffer.from("tokens") };
  const items = [
    { name: "node.tgz", kind: "npm", into: "asr/engine/node_modules/sherpa-onnx-node", platforms: ["linux-x64"] },
    { name: "vad.onnx", kind: "file", into: "asr/silero_vad.onnx", platforms: ["linux-x64"] },
    { name: "model.onnx", kind: "file", into: "asr-models/asr/model.int8.onnx", platforms: ["linux-x64"] },
    { name: "tokens.txt", kind: "file", into: "asr-models/asr/tokens.txt", platforms: ["linux-x64"] },
  ].map((i) => ({ ...i, bytes: files[i.name].length, sha256: sha(files[i.name]) }));
  const runtime = { release: "asr-runtime-test", base: "https://github.com/good-night-oppie/MontClip/releases/download/asr-runtime-test/", items };
  const handed = {};
  for (const [n, b] of Object.entries(files)) { handed[n] = path.join(dir, "host-" + n); fs.writeFileSync(handed[n], b); }
  const data = path.join(dir, "data"); fs.mkdirSync(data);
  return { dir, data, runtime, handed, files };
}

test("plan: what this system still needs, and nothing once it is installed", (t) => {
  const { planAsr, installAsr } = require("../node/asr-install.cjs");
  const w = world(t);
  const p = planAsr(w.runtime, "linux-x64", w.data);
  assert.deepEqual(p.missing.map((i) => i.name), ["node.tgz", "vad.onnx", "model.onnx", "tokens.txt"]);
  assert.equal(p.bytes, Object.values(w.files).reduce((n, b) => n + b.length, 0));
  assert.equal(planAsr(w.runtime, "darwin-arm64", w.data).supported, false);
  installAsr({ runtime: w.runtime, platform: "linux-x64", data: w.data, files: w.handed, tmpDir: w.dir });
  assert.equal(fs.readFileSync(path.join(w.data, "asr", "engine", "node_modules", "sherpa-onnx-node", "addon.js"), "utf8"), "x");
  assert.equal(fs.readFileSync(path.join(w.data, "asr-models", "asr", "model.int8.onnx"), "utf8"), "model");
  assert.deepEqual(planAsr(w.runtime, "linux-x64", w.data).missing, []);
});

test("a file that is not the pinned one: nothing is installed, no half-written file is left", (t) => {
  const { installAsr } = require("../node/asr-install.cjs");
  for (const [bad, code] of [["model.onnx", "SHA256_MISMATCH"], ["tokens.txt", "SIZE_MISMATCH"]]) {
    const w = world(t);
    fs.writeFileSync(w.handed[bad], code === "SIZE_MISMATCH" ? "tokens!" : "MODEL");
    assert.throws(() => installAsr({ runtime: w.runtime, platform: "linux-x64", data: w.data, files: w.handed, tmpDir: w.dir }), (e) => e.code === code && e.file === bad);
    assert.deepEqual(fs.readdirSync(w.data), [], "nothing in the data folder");
    assert.deepEqual(fs.readdirSync(w.dir).filter((n) => n.startsWith("montclip-asr-")), [], "no staging folder left");
  }
  const w = world(t);
  const missing = { ...w.handed }; delete missing["vad.onnx"];
  assert.throws(() => installAsr({ runtime: w.runtime, platform: "linux-x64", data: w.data, files: missing, tmpDir: w.dir }), (e) => e.code === "NO_FILE");
  assert.deepEqual(fs.readdirSync(w.data), []);
});

/* main.js against a fake host: the confirm box first; downloads only after a yes. */
function host({ answer = true, confirm = true, missing } = {}) {
  const rt = JSON.parse(fs.readFileSync(RUNTIME, "utf8"));
  const items = missing || rt.items.filter((i) => i.platforms.includes("linux-x64"));
  const asked = [], starts = [], installs = [];
  let listener = null;
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async () => ({ ok: true }),
    downloads: { async start(p) { starts.push(p); return { ok: true, token: "tok-" + p.id, bytes: p.bytes, sha256: p.sha256, fromCache: false }; } },
    node: {
      async request(r) {
        if (r.method === "montclip/asr-spec")
          return { ok: true, result: { supported: true, platform: "linux-x64", release: rt.release, missing: items.map((i) => ({ ...i, url: rt.base + i.name })),
            bytes: items.reduce((n, i) => n + i.bytes, 0), mb: require("../node/lib.cjs").aboutMbFrom(path.join(ROOT, "engine"))(items.reduce((n, i) => n + i.bytes, 0)) } };
        if (r.method === "montclip/asr-install") { installs.push(r); return { ok: true, result: { installed: r.params.names } }; }
        return { ok: false, errorCode: "NO", message: r.method };
      },
    },
  };
  if (confirm) cindy.confirm = async (p) => { asked.push(p); return { ok: true, confirmed: answer }; };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() {} }
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  const install = () => new Promise((resolve) => {
    const callId = "c1";
    cindy.send = async (m) => { if (m.type === "tool-result" && m.callId === callId) resolve(m.result); return { ok: true }; };
    listener({ type: "tool-call", tool: "montclip_install_asr", callId, args: {} });
  });
  return { asked, starts, installs, install, rt, items };
}

test("the confirm box comes first and says where from, how big and under which licences; no means nothing is fetched", async () => {
  const h = host({ answer: false });
  const r = await h.install();
  assert.equal(r.declined, true);
  assert.equal(h.starts.length, 0, "nothing downloaded"); assert.equal(h.installs.length, 0);
  assert.equal(h.asked.length, 1);
  const body = h.asked[0].body;
  assert.ok(body.length <= 300, "the host keeps at most 300 characters: " + body.length);
  for (const s of ["github.com", "MB", "sherpa-onnx", "Apache-2.0", "MIT", "Paraformer", "silero"]) assert.ok(body.includes(s), s + " in: " + body);
  // the size of what this system needs, on the cards' one rule (DD on #7): MB of 1,000,000 bytes, to the nearest 10
  const total = h.items.reduce((n, i) => n + i.bytes, 0);
  assert.ok(body.includes("一共约 " + Math.round(total / 1e6 / 10) * 10 + " MB"), total + " bytes: " + body);
});

test("yes: each missing file is downloaded with its pinned url, sha256 and bytes, then handed to the worker", async () => {
  const h = host({ answer: true });
  const r = await h.install();
  assert.ok(!r.error, JSON.stringify(r));
  assert.deepEqual(h.starts.map((s) => s.url), h.items.map((i) => h.rt.base + i.name));
  assert.deepEqual(h.starts.map((s) => [s.sha256, s.bytes]), h.items.map((i) => [i.sha256, i.bytes]));
  for (const s of h.starts) assert.match(s.id, /^[\w-]{1,100}$/, "Cindy's download id rule");
  assert.equal(h.installs.length, 1);
  assert.deepEqual(h.installs[0].params.names, h.items.map((i) => i.name));
  assert.deepEqual(Object.values(h.installs[0].downloadTokens), h.starts.map((s) => "tok-" + s.id));
});

test("a Cindy without the confirm box: nothing is fetched, and it says to update Cindy", async () => {
  const h = host({ confirm: false });
  const r = await h.install();
  assert.equal(r.code, "HOST_TOO_OLD");
  assert.equal(h.starts.length, 0);
});

/* JJ's four points for the confirm box (Deja, 2026-11-05): which site, how big in all, under which licences, and
   whether anything else is sent while downloading. And a way back after 〔先不用〕: the box itself, the reply and the
   card all say where to open the download again — the button on the status card's 「听写」 line. */
const AGAIN = "下载听写程序和模型";
test("the box says the site, the total size, the licences, and that nothing else is sent; 〔下载〕〔先不用〕", async () => {
  const h = host({ answer: false });
  await h.install();
  const { body, confirmText, cancelText } = h.asked[0];
  assert.equal(confirmText, "下载"); assert.equal(cancelText, "先不用");
  assert.match(body, /github\.com/);
  assert.match(body, /一共约 \d+ MB/);
  assert.match(body, /许可/);
  assert.match(body, /不会(顺带)?发出/);
  assert.ok(body.includes("〔" + AGAIN + "〕") && body.includes("状态卡"), "where to open it again: " + body);
  assert.ok(body.length <= 300, body.length);
});

test("after 〔先不用〕 the reply says where to open the download again, and asks for nothing", async () => {
  const h = host({ answer: false });
  const r = await h.install();
  assert.equal(r.declined, true);
  assert.ok(r.note.includes("〔" + AGAIN + "〕"), r.note);
  assert.match(r.note, /montclip_install_asr/);
  assert.match(r.note, /do not ask again/i);
});

test("the button sits on the status card's 「听写」 line while something is missing", () => {
  const ctx = {};
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  vm.runInNewContext(MAIN, Object.assign(ctx, { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL }));
  const card = (asr) => ctx.statusCard({ ffmpeg: "downloaded", project: "p", asr }, true);
  const line = (html) => html.split('<div style="display:flex').find((d) => /title="把说的话转成文字">听写</.test(d)) || "";
  const missing = line(card({ engine: false, model: false, modelBytes: 243446974 }));
  assert.ok(missing.includes('data-ghost-action="install-asr"') && missing.includes(AGAIN), missing);
  assert.ok(!card({ engine: true, model: true, modelBytes: 1 }).includes('data-ghost-action="install-asr"'), "no button once installed");
});

/* QQ's points for this PR (2026-11-05): bytes are compared before SHA-256 is computed; and the download goes only into
   the plugin's own folders — data/asr and data/asr-models — never into a folder the server writes, the same list as
   #146's (media, library, .uploads, analysis with proxies and frames, exports, projects), even through a link. */
test("bytes first: a file of the wrong size is refused before its SHA-256 is computed", (t) => {
  const { installAsr } = require("../node/asr-install.cjs");
  const w = world(t);
  fs.writeFileSync(w.handed["tokens.txt"], "tokens!");
  const hashed = [];
  const hash = (f) => { hashed.push(path.basename(f)); return sha(fs.readFileSync(f)); };
  assert.throws(() => installAsr({ runtime: w.runtime, platform: "linux-x64", data: w.data, files: w.handed, tmpDir: w.dir, hash }), (e) => e.code === "SIZE_MISMATCH");
  assert.ok(!hashed.includes("host-tokens.txt"), "the wrong-size file was never hashed: " + hashed);
  const w2 = world(t), order = [];
  installAsr({ runtime: w2.runtime, platform: "linux-x64", data: w2.data, files: w2.handed, tmpDir: w2.dir,
    hash: (f) => { order.push("hash:" + path.basename(f)); return sha(fs.readFileSync(f)); }, size: (f) => { order.push("size:" + path.basename(f)); return fs.statSync(f).size; } });
  for (const n of Object.keys(w2.handed)) assert.ok(order.indexOf("size:host-" + n) < order.indexOf("hash:host-" + n), "size before hash for " + n + ": " + order);
});

test("the download folders: only data/asr and data/asr-models, never a folder the server writes, even through a link", (t) => {
  const { placesOk, DENY, installAsr } = require("../node/asr-install.cjs");
  assert.deepEqual([...DENY].sort(), ["media", "library", ".uploads", "analysis", "exports", "projects"].sort(), "#146's list (proxies and frames are inside analysis)");
  const w = world(t);
  assert.deepEqual(placesOk(w.runtime, "linux-x64", w.data), { ok: true });
  // data/asr is a link into data/media: refused, nothing is written
  fs.mkdirSync(path.join(w.data, "media", "x"), { recursive: true });
  fs.symlinkSync(path.join(w.data, "media", "x"), path.join(w.data, "asr"), "junction");
  const r = placesOk(w.runtime, "linux-x64", w.data);
  assert.equal(r.ok, false); assert.equal(r.code, "ASR_DIR_REFUSED");
  assert.throws(() => installAsr({ runtime: w.runtime, platform: "linux-x64", data: w.data, files: w.handed, tmpDir: w.dir }), (e) => e.code === "ASR_DIR_REFUSED");
  assert.deepEqual(fs.readdirSync(path.join(w.data, "media", "x")), [], "nothing written through the link");
  // an item that would go anywhere else is refused too
  const bad = { ...w.runtime, items: w.runtime.items.map((i, k) => (k ? i : { ...i, into: "media/sherpa-onnx-node" })) };
  assert.equal(placesOk(bad, "linux-x64", fs.mkdtempSync(path.join(w.dir, "d-"))).code, "ASR_DIR_REFUSED");
});
