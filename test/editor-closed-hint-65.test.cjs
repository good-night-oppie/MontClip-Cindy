"use strict";
/* MontClip-Cindy#65: when the editor is not open in a task, say what to do next instead of only an error code.
   JJ's final wording (issuecomment-6758888810): Chinese for the streamer, English for the assistant to relay; the code
   NO_EDITOR stays. PG's decision (6758902002): say "open this task in the Cindy window on the computer", add "don't
   switch to another task while editing", and do NOT promise that nothing was lost. No user data; synthetic sessions. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

const ZH = "剪辑器现在没打开，撤销、预览、定位这些暂时用不了。请在电脑上的 Cindy 窗口里点开这个任务，剪辑器就会连上。剪的时候先别切到别的任务，切走它会断开。";
const EN = "The editor is not open right now, so undo, preview and locate can't run yet. Ask the streamer to open this task in the Cindy window on her computer; the editor connects once it is showing. While editing, she should stay on this task, because switching to another task disconnects it.";
const NO_EDITOR = { status: 409, error: "no editor of this task is open to run it", code: "NO_EDITOR" };

/** main.js in a sandbox with a worker that answers like the real one. `editor` is what montclip/ui returns. */
function load(editor) {
  const sent = [];
  const answers = {
    "montclip/ui": () => editor,
    "montclip/bind": () => ({ name: "合成项目" }),
    "montclip/start": () => ({ ffmpeg: "downloaded", origin: "http://127.0.0.1:1", node: "v0", dataDir: "<data>" }),
    "montclip/editor-trace": () => ({ code: "TICKET_ISSUED_NOT_BOUND", ticketsIssued: 3, lastTicketAt: "2026-11-10T04:15:46.732Z", ticketsRefused: 0 }),
    "montclip/asr-status": () => ({ engine: true, model: true, punct: true }),
    "montclip/h264": () => null,
  };
  const cindy = {
    onHostMessage: () => { }, send: async (m) => { sent.push(m); return { ok: true }; },
    node: { request: async ({ method }) => (answers[method] ? { ok: true, result: answers[method]() } : { ok: false, error: { message: "not in this test: " + method } }) },
  };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.HANDLERS = HANDLERS; this.statusCard = statusCard; this.statusCardHeight = statusCardHeight;", ctx);
  return { ctx, sent };
}
const MSG = { callId: "c1", sessionId: "task-65", session: "task-65" };

test("status, editor not open: the note is JJ's English sentence, word for word, and the code-level reason stays", async () => {
  const { ctx } = load(NO_EDITOR);
  const r = await ctx.HANDLERS.montclip_status({}, MSG);
  assert.equal(r.editorTab.open, false);
  assert.equal(r.editorTab.note, EN);
  assert.equal(r.editorTab.sayToStreamer, ZH);
  assert.equal(r.editorTab.why.code, "TICKET_ISSUED_NOT_BOUND", "the diagnostic reason of #56 is still reported");
  assert.match(r.editorTab.tools, /montclip_open_task_view/, "the assistant still learns which tool opens the editor");
  assert.match(r.editorTab.tools, /fablecut_versions/, "and how to go back without it");
});

for (const [tool, args] of [["montclip_undo", {}], ["montclip_redo", {}], ["montclip_seek", { t: 3 }]]) {
  test(tool + ", editor not open: still NO_EDITOR, now with the sentence", async () => {
    const { ctx } = load(NO_EDITOR);
    const r = await ctx.HANDLERS[tool](args, MSG);
    assert.equal(r.code, "NO_EDITOR", "the code is unchanged");
    assert.equal(r.status, 409);
    assert.equal(r.note, EN);
    assert.equal(r.sayToStreamer, ZH);
  });
}

test("editor open: none of this is added", async () => {
  const open = { status: 200, ok: true, cmd: "undo", time: 0, undo: 1, redo: 0, revision: 7, clips: 2, duration: 4.008 };
  const { ctx } = load(open);
  const u = await ctx.HANDLERS.montclip_undo({}, MSG);
  assert.equal(u.note, undefined);
  assert.equal(u.sayToStreamer, undefined);
  const s = await ctx.HANDLERS.montclip_status({}, MSG);
  assert.equal(s.editorTab.status, 200);
  assert.equal(s.editorTab.note, undefined);
});

test("an answer that is refused for another reason is passed through untouched", async () => {
  const { ctx } = load({ status: 200, ok: false, code: "NOTHING_TO_UNDO", cmd: "undo" });
  const r = await ctx.HANDLERS.montclip_undo({}, MSG);
  assert.equal(r.code, "NOTHING_TO_UNDO");
  assert.equal(r.note, undefined);
});

test("the status card shows the Chinese sentence under 剪辑器 when it is not open, and is tall enough for it", () => {
  const { ctx } = load(NO_EDITOR);
  const s = { ffmpeg: "downloaded", project: "合成项目", asr: { engine: true, model: true, punct: true }, mp4: null };
  const closed = ctx.statusCard(s, false), opened = ctx.statusCard(s, true);
  assert.ok(closed.includes(ZH), "the sentence is on the card");
  assert.ok(!opened.includes(ZH), "and only when the editor is not open");
  assert.ok(closed.includes("在这个任务里打开剪辑器"), "the open button is still there");
  // 12 px note text at 280 px: about 10 Chinese characters a line, 18 px a line
  const extra = ctx.statusCardHeight(s, false) - ctx.statusCardHeight(s, true);
  assert.ok(extra >= 42 + Math.ceil([...ZH].length / 10) * 18, "the estimate grows by the button and the note's lines, got " + extra);
});

test("what must not be said (PG 6758902002, JJ's E2E 4)", async () => {
  const { ctx } = load(NO_EDITOR);
  const s = { ffmpeg: "downloaded", project: "合成项目", asr: null, mp4: null };
  const shown = ctx.statusCard(s, false) + JSON.stringify(await ctx.HANDLERS.montclip_undo({}, MSG));
  for (const no of ["没丢", "不会丢", "nothing is lost", "not lost"]) assert.ok(!shown.includes(no), "no promise that nothing was lost: " + no);
  for (const no of ["票据", "TICKET_", "ticket"]) assert.ok(!ctx.statusCard(s, false).includes(no), "no internal word on the streamer's card: " + no);
});
