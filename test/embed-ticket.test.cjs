"use strict";
/* MontClip#251 items 1-3 + MontClip#260 items 1-5, on the packed plugin: task tickets are registered by the
   worker only, are one-time and fresh per ask, the frame never puts the session id in the editor address,
   the panel trades its own ticket for a channel suffix and never opens the suffix-less channel, and an
   unbound task's UI command is refused. The worker's EXPORT_TASK_MISMATCH check stays: the engine now
   carries {project, session} on jobs and tickets (test/engine-task-contract.test.cjs), which is what makes
   that check enforceable rather than something to delete. No user data; synthetic sessions only. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const ROOT = path.resolve(__dirname, ".."), DIST = path.join(ROOT, "dist", "montclip");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("source: the ticket flow is wired and the session id is out of the frame address", () => {
  const frame = read("frame.js"), worker = read("node/worker.cjs"), main = read("main.js"), panel = read("embed/panel.js");
  assert.doesNotMatch(frame + main + worker + panel, /cindySession/, "no page puts the session id in an address");
  assert.match(frame, /ask\('editor-ticket', \{ session \}\)/, "the frame asks the worker for a fresh ticket per placement");
  assert.match(frame, /&ticket=' \+ encodeURIComponent\(ticket\)/, "the first load carries the ticket once");
  assert.match(frame, /montclip-need-ticket/, "the frame answers the framed page's reconnect ask");
  assert.match(frame, /e\.source !== frame\.contentWindow/, "only the framed window itself is answered");
  assert.match(frame, /montclip-host-ticket/, "the ticket goes back as montclip-host-ticket");
  assert.match(main, /m\.type === 'editor-ticket'/, "the logic page forwards editor-ticket to the worker");
  assert.match(worker, /"montclip\/editor-ticket"/, "the worker registers task tickets");
  assert.match(worker, /POST", "\/api\/embed\/ticket"/, "registration goes to the engine's worker-only route");
  assert.doesNotMatch(worker.match(/async "montclip\/editor-ticket"[\s\S]*?\n  \},\n/)?.[0] || "", /note\(/, "the ticket is never logged");
  assert.match(panel, /\/api\/embed\/channel/, "the panel trades its ticket for the channel suffix");
  assert.match(panel, /"montclip-editor:" \+ body\.channel/, "the panel channel carries the suffix");
  assert.doesNotMatch(panel, /new BroadcastChannel\("montclip-editor"\)/, "the suffix-less channel is never opened");
  assert.doesNotMatch(panel, /projectId/, "the panel does not read a projectId out of editor-state");
  assert.doesNotMatch(panel, /\/api\/ui\/command/, "the panel never sends an unscoped UI command");
  assert.match(worker, /EXPORT_TASK_MISMATCH/, "the worker's per-task export check stays");
  assert.match(panel, /channelReady/, "the panel knows whether it holds a task channel");
  assert.match(panel, /if \(!channelReady\) \{ showNoTask\(\); return; \}/, "without a channel the panel never reads /api/project");
  assert.match(panel, /showNoTask\(\);\r?\n  load\(\);/, "the panel starts fail-closed, before any ticket answer");
  // JJ's words for a panel that knows no task, one for each page (#48 issuecomment-6729474414), word for word; they
  // promise nothing the panel can't do in this version (VV, 6729467270)
  assert.ok(panel.includes("const NO_TASK_LINES = '这里暂时不显示文稿。请在要剪的任务里打开 MontClip 剪辑器，在剪辑器里看字幕。';"), "文稿 page");
  assert.ok(panel.includes("const NO_TASK_PROPS = '这里暂时不显示片段属性。请在要剪的任务里打开 MontClip 剪辑器，在剪辑器里选中片段查看。';"), "属性 page");
  assert.match(panel, /\$\("linesEmpty"\)\.textContent = NO_TASK_LINES;/);
  assert.match(panel, /\$\("propsEmpty"\)\.textContent = NO_TASK_PROPS;/);
  assert.doesNotMatch(panel, /待 JJ 定稿|就会显示在这里/);
});

test("packed worker: tickets are 64-hex, 60 s, fresh per ask; channel trade is one-time; unbound UI is 409", { timeout: 60000 }, async (t) => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ticket-"));
  const env = { ...process.env, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" };
  delete env.MONTCLIP_CINDY_APP;
  const worker = spawn(process.execPath, [path.join(DIST, "node", "worker.cjs")], { env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  let buf = "", id = 0; const pending = new Map();
  const stderr = [];
  worker.stderr.on("data", (c) => stderr.push(String(c)));
  worker.stdout.on("data", (chunk) => {
    buf += chunk; let end;
    while ((end = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, end)); buf = buf.slice(end + 1); pending.get(m.id)?.(m); pending.delete(m.id); }
  });
  t.after(async () => {
    if (worker.exitCode === null) await new Promise((resolve) => { worker.once("exit", resolve); worker.kill(); });
    assert.equal(path.dirname(data), path.resolve(os.tmpdir()));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error("Timeout: " + method)); }, 15000);
    pending.set(n, (m) => { clearTimeout(timer); m.error ? reject(Object.assign(new Error(method), { rpc: m.error })) : resolve(m.result); });
    worker.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const start = await rpc("montclip/start");
  const token = new URL(start.url).searchParams.get("token");
  const asWorker = { "Content-Type": "application/json", "X-MontClip-Session": token };
  const a = await rpc("montclip/bind", { session: "ticket-test-A" });
  const t1 = await rpc("montclip/editor-ticket", { session: "ticket-test-A" });
  const t2 = await rpc("montclip/editor-ticket", { session: "ticket-test-A" });
  assert.match(t1.ticket, /^[a-f0-9]{64}$/, "a ticket is 256 bits of hex");
  assert.equal(t1.expiresInMs, 60000, "a ticket lives at most 60 s");
  assert.notEqual(t1.ticket, t2.ticket, "every ask registers a fresh ticket");
  assert.ok(!stderr.join("").includes(t1.ticket) && !stderr.join("").includes(t2.ticket), "tickets stay out of the worker log");
  // the panel's trade: one ticket, one channel; the same ticket again is refused
  const ch = await fetch(start.origin + "/api/embed/channel", { method: "POST", headers: asWorker, body: JSON.stringify({ ticket: t1.ticket }) });
  assert.equal(ch.status, 200);
  const { channel } = await ch.json();
  assert.match(channel, /^[a-f0-9]{32}$/, "the channel suffix is 128 bits of hex");
  const again = await fetch(start.origin + "/api/embed/channel", { method: "POST", headers: asWorker, body: JSON.stringify({ ticket: t1.ticket }) });
  assert.equal(again.status, 403, "a used ticket trades for nothing");
  // the editor's claim is what binds a connection; without any ticket-bound editor, a task's UI command is refused
  const ui = await rpc("montclip/ui", { cmd: "state", session: "ticket-test-A", project: a.project });
  assert.equal(ui.status, 409, "no bound editor for this task: 409, not a silent send to every editor");
});

