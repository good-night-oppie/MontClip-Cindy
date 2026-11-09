"use strict";
/* Cindy accepts one card-update per tool call a second (GHOST_CARD_MIN_INTERVAL_MS = 1000 in the host) and drops a
   faster one without telling the plugin. An export that fails right after a progress update lost its 导出没有完成
   card that way: the streamer saw 「正在导出 0%」 for good (MontClip-Cindy#48 real run 6729014996, MontClip#229 C2).
   sendCard keeps one card's updates at least CARD_GAP_MS apart and, when one comes too soon, sends the newest state
   once the gap is over, so the last state always reaches the chat. main.js is loaded as the other tests do. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function load() {
  let clock = 1_000_000;
  const sent = [], timers = [];
  const cindy = { onHostMessage: () => { }, send: async (m) => { if (m && m.type === "card-update") sent.push({ at: clock, m }); return { ok: true }; },
    node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  class FakeDate extends Date { static now() { return clock; } }
  const setT = (fn, ms) => { timers.push({ at: clock + ms, fn }); return timers.length; };
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout: setT, clearTimeout() { },
    setInterval() { }, clearInterval() { }, Date: FakeDate, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.sendCard = sendCard; this.CARD_GAP_MS = CARD_GAP_MS;", ctx);
  const advance = (ms) => {
    clock += ms;
    for (let due; (due = timers.filter((t) => t.fn && t.at <= clock)).length;) for (const t of due) { const f = t.fn; t.fn = null; f(); }
  };
  return { ...ctx, sent, advance };
}

test("a card's updates go out at least a second apart, and the last one always arrives", () => {
  const h = load();
  assert.ok(h.CARD_GAP_MS > 1000, "more than the host's 1000 ms, not exactly on it");
  h.sendCard("call-1", { phase: "running", progress: 0 });
  assert.equal(h.sent.length, 1);
  h.advance(200);
  h.sendCard("call-1", { phase: "running", progress: 0.5 });
  h.advance(100);
  h.sendCard("call-1", { phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: "第 1 段（时间线 0:00 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。" });
  assert.equal(h.sent.length, 1, "too soon: held, not sent into the host's limit");
  h.advance(h.CARD_GAP_MS);
  assert.equal(h.sent.length, 2, "one send once the gap is over: the newest state, the in-between one is skipped");
  const last = h.sent[1];
  assert.equal(last.m.state, "done");
  assert.ok(last.m.html.includes("的声音没读出来"), "the 导出没有完成 card with the engine's sentence");
  assert.ok(last.at - h.sent[0].at >= h.CARD_GAP_MS);
  h.advance(5 * h.CARD_GAP_MS);
  assert.equal(h.sent.length, 2, "nothing else goes out");
});

test("different cards don't wait for each other; a card that was quiet long enough goes out at once", () => {
  const h = load();
  h.sendCard("call-a", { phase: "running", progress: 0 });
  h.sendCard("call-b", { phase: "running", progress: 0 });
  assert.equal(h.sent.length, 2);
  h.advance(h.CARD_GAP_MS + 1);
  h.sendCard("call-a", { phase: "done", files: [], folder: "" });
  assert.equal(h.sent.length, 3);
});
