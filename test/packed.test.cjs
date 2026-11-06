"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), DIST = path.join(ROOT, "dist", "montclip");

test("package contains the pinned engine and plugin, not the source repository", () => {
  for (const f of ["app.js", "server.js", "host-embed.js", "index.html", "style.css", "LICENSE", "LICENSES.md"])
    assert.ok(fs.readFileSync(path.join(ROOT, "engine", f)).equals(fs.readFileSync(path.join(DIST, "node", "app", f))), f);
  for (const f of ["main.js", "ghost.json", "node/worker.cjs", "node/lib.cjs"])
    assert.ok(fs.readFileSync(path.join(ROOT, f)).equals(fs.readFileSync(path.join(DIST, f))), f);
  for (const f of ["engine", ".git", "test", "test-tools", "build.cjs", "package.json"])
    assert.equal(fs.existsSync(path.join(DIST, f)), false, f);
});

test("built worker starts, serves editor assets and isolates task projects", { timeout: 30000 }, async (t) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-repo-smoke-"));
  const env = { ...process.env, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" };
  delete env.MONTCLIP_CINDY_APP;
  const worker = spawn(process.execPath, [path.join(DIST, "node", "worker.cjs")], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0;
  const pending = new Map();
  worker.stderr.resume();
  worker.stdout.on("data", (chunk) => {
    buf += chunk;
    let end;
    while ((end = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, end)); buf = buf.slice(end + 1);
      pending.get(m.id)?.(m); pending.delete(m.id);
    }
  });
  t.after(async () => {
    if (worker.exitCode === null) await new Promise(resolve => { worker.once("exit", resolve); worker.kill(); });
    // mkdtemp returned this exact child of the system temp directory.
    assert.equal(path.dirname(data), path.resolve(os.tmpdir()));
    assert.ok(path.basename(data).startsWith("montclip-repo-smoke-"));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`Timeout: ${method}`)); }, 10000);
    pending.set(n, m => { clearTimeout(timer); m.error ? reject(new Error(`Failed: ${method}`)) : resolve(m.result); });
    worker.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const start = await rpc("montclip/start");
  const headers = { "X-MontClip-Session": new URL(start.url).searchParams.get("token") };
  assert.equal((await fetch(start.origin + "/api/project")).status, 403);
  for (const page of ["/?host=cindy", "/cindy/panel.html"]) {
    const res = await fetch(start.origin + page, { headers }); assert.equal(res.status, 200);
    const html = await res.text();
    for (const [, src] of html.matchAll(/<script[^>]+src="([^"?]+)[^"]*"/g)) {
      assert.equal((await fetch(new URL(src, start.origin + page), { headers })).status, 200, src);
    }
  }
  const tools = await rpc("montclip/tools");
  assert.ok(tools.tools.some(x => x.name === "fablecut_patch_project"));
  const a = await rpc("montclip/bind", { session: "repo-test-A" });
  const b = await rpc("montclip/bind", { session: "repo-test-B" });
  assert.notEqual(a.project, b.project);
  assert.equal((await rpc("montclip/bind", { session: "repo-test-A" })).project, a.project);

  // P8 (europa, 2026-11-05): the first transcription request loaded asr-models.js, which read
  // desktop/asr-manifest.json — not in the package — and the throw took the whole worker down. Now the engine
  // answers that there is no speech engine here, and keeps running.
  const st = await fetch(start.origin + "/api/asr/status", { headers });
  assert.equal(st.status, 200);
  const sj = await st.json();
  assert.equal(sj.engine.ready, false); assert.equal(sj.asr.ready, false);
  assert.equal(sj.model, "paraformer-zh-2023-09-14-int8", "the manifest is in the package");
  const tr = await fetch(start.origin + "/api/asr/transcribe", { method: "POST", headers, body: JSON.stringify({ src: "/media/none.wav" }) });
  assert.equal(tr.status, 404);
  assert.ok((await rpc("montclip/tools")).tools.length, "the worker is still running");
  // where a speech engine and its model go: the plugin's own data folder, never the app folder a plugin update replaces
  const asr = await rpc("montclip/asr-status");
  assert.equal(asr.engineDir, path.join(data, "asr"));
  assert.equal(asr.modelsDir, path.join(data, "asr-models"));
  assert.equal(asr.engine, false); assert.equal(asr.model, false);
  assert.equal(asr.native, "sherpa-onnx-" + (process.platform === "win32" ? "win" : process.platform) + "-" + process.arch);
});

test("the package carries the speech manifest the engine reads (desktop/asr-manifest.json)", () => {
  assert.ok(fs.readFileSync(path.join(ROOT, "engine", "desktop", "asr-manifest.json")).equals(fs.readFileSync(path.join(DIST, "node", "app", "desktop", "asr-manifest.json"))));
});
