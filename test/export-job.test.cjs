"use strict";
/* P11 (europa, 2026-11-05): Cindy gives a plugin tool call at most 330 s, and an export took longer, so the first
   montclip_export call timed out while the export carried on. Exports now follow JJ's P2 rule: the tool answers at once
   with the job, the same tool reports it, and it is done only when the file is finished and in its folder.
   main.js runs here against a fake host whose engine job moves only when the test says so. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function host() {
  const calls = [], cards = [];
  const job = { id: "x_job1", status: "pending", progress: 0 };
  let deliver = null;   // the copy into the chosen folder, held until the test lets it finish
  let listener = null;
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async () => ({ ok: true }),
    pick: async () => ({ ok: true, path: "/home/someone/Videos", name: "Videos" }),
    node: {
      async request(r) {
        calls.push({ method: r.method, params: r.params });
        const ok = (result) => ({ ok: true, result });
        switch (r.method) {
          case "montclip/bind": return ok({ project: "p_1", name: "demo" });
          case "montclip/tools": return ok({ tools: [{ name: "fablecut_export", inputSchema: {} }, { name: "fablecut_status", inputSchema: {} }] });
          case "montclip/call": return ok({ content: [{ type: "text", text: "called" }] });
          case "montclip/export-start": return ok({ id: job.id, status: "pending", progress: 0, via: "headless" });
          case "montclip/export-job": return ok({ ...job });
          case "montclip/export-cancel": job.status = "cancelled"; return ok({ ...job });
          case "montclip/export-deliver": return new Promise((resolve) => { deliver = () => resolve(ok({ files: [{ name: "demo.mp4", bytes: 10 }] })); });
          default: return { ok: false, errorCode: "NO", message: r.method };
        }
      },
    },
  };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() {} }
  // sleep() in main.js: 1 ms here, so the follower polls fast
  const fastTimeout = (fn, ms, ...a) => setTimeout(fn, Math.min(ms, 1), ...a);
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel, console: { warn() {}, log() {}, error() {} }, setTimeout: fastTimeout, clearTimeout,
    setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  let n = 0;
  const call = (tool, args) => new Promise((resolve) => {
    const callId = "c" + (++n);
    cindy.send = async (m) => {
      if (m.type === "card-update") cards.push({ callId: m.callId, state: m.state, html: m.html });
      if (m.type === "tool-result" && m.callId === callId) resolve(m);
      return { ok: true };
    };
    listener({ type: "tool-call", tool, callId, args: { ...args, session_context: { session_id: "task-1" } } });
  });
  const until = async (pred, what) => {
    for (let i = 0; i < 400; i++) { if (pred()) return; await new Promise((r) => setTimeout(r, 2)); }
    assert.fail("timed out waiting for " + what);
  };
  return { job, calls, cards, call, until, deliver: () => deliver && deliver(), delivering: () => !!deliver };
}
const methods = (h, m) => h.calls.filter((c) => c.method === m);

test("montclip_export answers with the job while the export is still running", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  h.job.status = "running"; h.job.progress = 0.1;
  const r = await h.call("montclip_export", {});
  assert.equal(r.ok, true);
  assert.equal(r.result.job, "x_job1", JSON.stringify(r.result));
  assert.equal(r.result.status, "running");
  assert.match(r.result.hint, /montclip_export \{job:"x_job1"\}/);
  // the card keeps showing it: still 'working' after the result
  await h.until(() => h.cards.some((c) => c.callId === "c1" && c.state === "working" && /正在导出 10%/.test(c.html)), "a progress card");
});

test("{job} is not done until the engine has finished the file and it is copied into the folder", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  h.job.status = "running"; h.job.progress = 0.99;
  await h.call("montclip_export", {});
  let s = (await h.call("montclip_export", { job: "x_job1" })).result;
  assert.equal(s.status, "running");
  // the engine says done only after the .part file is renamed into place (server.js /api/export/end); the copy follows
  Object.assign(h.job, { status: "done", progress: 1, src: "/exports/demo.mp4", result: { outputs: [{ file: "demo.mp4", ok: true, report: { line: "ok" } }] } });
  await h.until(() => h.delivering(), "the copy to start");
  s = (await h.call("montclip_export", { job: "x_job1" })).result;
  assert.equal(s.status, "running", "copying into the folder is not done yet");
  assert.equal(s.phase, "copy");
  h.deliver();
  await h.until(() => h.cards.some((c) => c.state === "done" && /导出完成/.test(c.html)), "the done card");
  s = (await h.call("montclip_export", { job: "x_job1" })).result;
  assert.equal(s.status, "done");
  assert.deepEqual(s.files, ["demo.mp4"]);
});

test("asked again while this task's export runs, it answers with the same job and starts no second one", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  h.job.status = "running";
  await h.call("montclip_export", {});
  const again = (await h.call("montclip_export", {})).result;
  assert.equal(again.job, "x_job1");
  assert.equal(again.already, true);
  assert.equal(methods(h, "montclip/export-start").length, 1);
});

test("an export whose renderer was killed halfway reports failed, in plain words", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  h.job.status = "running"; h.job.progress = 0.4;
  await h.call("montclip_export", {});
  Object.assign(h.job, { status: "failed", error: "the headless browser exited before the export finished" });
  await h.until(() => h.cards.some((c) => c.state === "done" && /导出没有完成/.test(c.html)), "the failed card");
  const s = (await h.call("montclip_export", { job: "x_job1" })).result;
  assert.equal(s.status, "failed");
  assert.match(s.error, /导出到一半停了.*可以再导一次/);
  assert.doesNotMatch(s.error, /headless|browser/i, "never the raw error");
});

test("{cancel} stops the export in the engine", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  h.job.status = "running";
  await h.call("montclip_export", {});
  const r = (await h.call("montclip_export", { cancel: "x_job1" })).result;
  assert.equal(r.cancelling, true);
  assert.deepEqual(methods(h, "montclip/export-cancel").map((c) => c.params.id), ["x_job1"]);
  await h.until(() => h.cards.some((c) => c.state === "done" && /没有导出/.test(c.html)), "the cancelled card");
});

test("call_tool fablecut_export answers at once (wait:false); a {job} check passes through as asked", { timeout: 10000 }, async (t) => {
  const h = host();
  t.after(() => { if (h.job.status === "running" || h.job.status === "pending") h.job.status = "cancelled"; });
  await h.call("call_tool", { name: "fablecut_export", args: { preset: "youtube" } });
  await h.call("call_tool", { name: "fablecut_export", args: { job: "x_9" } });
  const sent = methods(h, "montclip/call").map((c) => JSON.stringify(c.params.arguments));
  assert.deepEqual(sent, [JSON.stringify({ preset: "youtube", wait: false }), JSON.stringify({ job: "x_9" })]);
});
