"use strict";
/* P11 (europa, 2026-11-05): an export's ffmpeg must never outlive the plugin worker. When Cindy closes the worker's
   stdin, the worker runs the engine's own shutdown (server.js: stop each export's ffmpeg, delete its half-finished
   file, exit) instead of leaving the engine's HTTP server, and whatever it spawned, running.
   The engine here is a stand-in (MONTCLIP_CINDY_APP): it records that its shutdown ran. That the real shutdown stops
   ffmpeg and deletes the .part is the engine's own test (export-close.test.js, export-p11.test.js). */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");

function fakeEngine(dir) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "server.js"), `
    const http = require("node:http"), fs = require("node:fs"), path = require("node:path");
    const server = http.createServer((req, res) => { res.writeHead(200, { "content-type": "application/json" }); res.end("{}"); })
      .listen(0, "127.0.0.1", () => process.emit("montclip-ready", {type:"montclip-ready", origin:"http://127.0.0.1:"+server.address().port}));
    process.on("SIGTERM", () => { fs.writeFileSync(path.join(process.env.FABLECUT_DATA_DIR, "shutdown-ran"), "1"); process.exit(0); });
  `);
  fs.writeFileSync(path.join(dir, "mcp-server.js"), "module.exports = { TOOLS: [], callTool: async () => ({}) };");
  fs.writeFileSync(path.join(dir, "export-jobs.js"), "module.exports = { findBrowser: () => null };");
}

test("when Cindy closes the worker's stdin, the engine's shutdown runs and the worker exits", { timeout: 30000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-worker-exit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app"), data = path.join(root, "data");
  fakeEngine(app);
  const env = { ...process.env, MONTCLIP_CINDY_APP: app, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0" };
  const worker = spawn(process.execPath, [path.join(__dirname, "..", "node", "worker.cjs")], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => { if (worker.exitCode === null && worker.signalCode === null) worker.kill("SIGKILL"); });
  worker.stderr.resume();
  const started = new Promise((resolve) => {
    let buf = "";
    worker.stdout.on("data", (c) => { buf += c; if (buf.includes('"id":1')) resolve(JSON.parse(buf.split("\n")[0])); });
  });
  worker.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "montclip/start", params: {} }) + "\n");
  const r = await started;
  assert.ok(r.result && r.result.origin, JSON.stringify(r));
  const exited = new Promise((resolve) => worker.once("exit", resolve));
  const t0 = Date.now();
  worker.stdin.end();   // Cindy stops the worker
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("the worker kept running")), 8000))]);
  assert.ok(Date.now() - t0 < 8000);
  assert.equal(fs.existsSync(path.join(data, "shutdown-ran")), true, "the engine's shutdown ran");
});
