"use strict";
/* MontClip#229 C1/C2 via MontClip-Cindy#48: the plugin maps the engine's new export codes to JJ's sentences.
   EXPORT_AUDIO_FAILED says the engine's own sentence (already JJ's words), EXPORT_CLIP_SILENT and
   EXPORT_CLIP_UNCHECKED are rebuilt from {n, t} here, word for word. main.js is loaded the way
   test/stopped-copy.test.cjs loads it. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.plainFailure = plainFailure; this.exportReportText = exportReportText; this.exportCard = exportCard;", ctx);
  return ctx;
}

test("EXPORT_AUDIO_FAILED: the card says the engine's sentence, not the generic fallback", () => {
  const { plainFailure } = load();
  const engine = "第 3 段（时间线 1:12 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。";
  const r = plainFailure({ phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: engine });
  assert.equal(r.error, engine);
  assert.equal(r.code, "EXPORT_AUDIO_FAILED");
  // no engine sentence to say: the generic fallback stays
  const bare = plainFailure({ phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: "" });
  assert.match(bare.error, /没预料到的问题/);
});

test("EXPORT_AUDIO_FAILED: the 导出没有完成 card the streamer sees says it too (MontClip#229 C2, real run 6728853323)", () => {
  const { exportCard } = load();
  const engine = "第 3 段（时间线 1:12 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。";
  const card = exportCard({ phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: engine }, "zh");
  assert.ok(card.includes(engine), card);
  assert.doesNotMatch(card, /没预料到的问题/);
  assert.match(card, /data-ghost-action="retry"/, "it can still be retried");
  // no engine sentence: the generic words stay, as in the agent's answer
  assert.match(exportCard({ phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: "" }, "zh"), /没预料到的问题/);
});

test("EXPORT_CLIP_SILENT in a report: JJ's sentence by number and time, or by time only", () => {
  const { exportReportText } = load();
  const line = exportReportText({ line: "⚠ clip 1 (at 0:00) is silent — check that it is meant to be", checks: [
    { ok: true, text: "-14.0 LUFS" },
    { ok: false, code: "EXPORT_CLIP_SILENT", n: 1, t: 0, text: "clip 1 (at 0:00) is silent — check that it is meant to be" },
    { ok: false, code: "EXPORT_CLIP_SILENT", n: null, t: 4332, text: "the sound at 1:12:12 is silent — check that it is meant to be" },
  ] });
  assert.equal(line, "-14.0 LUFS\n第 1 段（时间线 0:00 处）是无声的，请确认是不是你想要的。\n时间线 72:12 处的声音是无声的，请确认是不是你想要的。");
  // the summary's own items stay on one line; only warnings break (VV, #48; real run 6730067542)
  assert.equal(exportReportText({ checks: [{ ok: true, text: "640×360" }, { ok: true, text: "30 fps" }, { ok: true, text: "-14.0 LUFS" }] }), "640×360 · 30 fps · -14.0 LUFS");
});

test("EXPORT_CLIP_UNCHECKED in a report: JJ's unchecked sentence, word for word", () => {
  const { exportReportText } = load();
  const line = exportReportText({ checks: [{ ok: false, code: "EXPORT_CLIP_UNCHECKED", n: 2, t: 72, text: "clip 2 unchecked" }] });
  assert.equal(line, "第 2 段（时间线 1:12 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。");
});

test("a report with no checks keeps its line; a missing report says nothing", () => {
  const { exportReportText } = load();
  assert.equal(exportReportText({ line: "-14.0 LUFS" }), "-14.0 LUFS");
  assert.equal(exportReportText(null), "");
});

