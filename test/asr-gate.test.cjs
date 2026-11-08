"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { applyAsrGate } = require("../tools/asr-build.cjs");
const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
const manifest = require("../ghost.json"), config = require("../asr-download.json");
function load(source) {
  let listener; const calls = [], results = [];
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async (m) => { results.push(m); return { ok: true }; },
    node: { request: async () => { calls.push("node"); throw new Error("must not reach worker"); } },
    confirm: async () => { calls.push("confirm"); return { ok:true, confirmed:false }; },
    downloads: { start: async () => { calls.push("download"); } },
  };
  class BroadcastChannel { postMessage() {} }
  const ctx = { cindy, BroadcastChannel, console: { ...console, warn() {} }, setTimeout, clearTimeout, setInterval, clearInterval, URL };
  vm.runInNewContext(source, ctx);
  return { ctx, calls, results, dispatch: (m) => listener(m) };
}
test("default build has no ASR tool or button; stale cards and direct calls cannot reach the worker or network", async () => {
  assert.equal(config.enabled, false);
  assert.ok(!manifest.tools.some((t) => t.name === "montclip_install_asr"));
  const packed = JSON.parse(fs.readFileSync(path.join(root, "dist/montclip/ghost.json"), "utf8"));
  assert.ok(!packed.tools.some((t) => t.name === "montclip_install_asr"));
  const h = load(fs.readFileSync(path.join(root, "dist/montclip/main.js"), "utf8"));
  assert.doesNotMatch(h.ctx.statusCard({ asr: { engine:false, model:false } }, true), /data-ghost-action="install-asr"/);
  await h.dispatch({ type:"tool-call", tool:"montclip_install_asr", callId:"off" });
  assert.equal(h.results.at(-1).errorCode, "TOOL_NOT_FOUND");
  await h.dispatch({ type:"event", name:"card-action", actionId:"install-asr", callId:"stale" });
  assert.equal((await h.ctx.installAsr()).code, "ASR_DOWNLOAD_DISABLED");
  assert.deepEqual(h.calls, []);
});
test("explicit local build switch enables both tool registration and card while cancellation starts no downloads", async () => {
  const on = applyAsrGate(main, manifest, { ...config, enabled:true });
  assert.equal(on.manifest.tools.filter((t) => t.name === "montclip_install_asr").length, 1);
  const h = load(on.main); let asked=0, downloads=0;
  h.ctx.cindy.node.request = async () => ({ ok:true, result: { supported:true, missing:[{name:"paraformer-model"}], mb:230, fileHost:"release-assets.githubusercontent.com" } });
  h.ctx.cindy.confirm = async () => { asked++; return { ok:true, confirmed:false }; };
  h.ctx.cindy.downloads.start = async () => { downloads++; };
  assert.match(h.ctx.statusCard({ asr: { engine:false, model:false } }, true), /data-ghost-action="install-asr"/);
  await h.dispatch({ type:"tool-call", tool:"montclip_install_asr", callId:"on" });
  assert.equal(h.results.at(-1).result.declined, true);
  assert.equal(asked, 1); assert.equal(downloads, 0);
});
test("invalid switch values fail build rather than accidentally enabling download", () => {
  assert.throws(() => applyAsrGate(main, manifest, { ...config, enabled:"false" }));
});
