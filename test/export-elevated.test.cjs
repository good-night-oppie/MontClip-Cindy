"use strict";
/* MontClip#247 / MontClip#284, QQ review 5900527770 (option A): an export that failed because MontClip's engine was opened
   with 「以管理员身份运行」 ends with EXPORT_ELEVATED_CINDY / _MONTCLIP / _PROGRAM. The engine's job error is English, and
   the card used to say 「出了个我们没预料到的问题…再点〔重试〕」 for it. The card and the agent's answer now say JJ's
   sentence for that code, as EXPORT_AUDIO_FAILED says the engine's sentence (MontClip#229 C2); every other failure keeps
   its own words. main.js is loaded the way test/export-report-text.test.cjs loads it. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.plainFailure = plainFailure; this.exportCard = exportCard;", ctx);
  return ctx;
}
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// JJ's sentences, word for word as MontClip#284 puts them in ui-preferences.js (own.err-export-elevated-*)
const JJ = {
  zh: {
    EXPORT_ELEVATED_CINDY: "Cindy 是用「以管理员身份运行」打开的，导出需要的浏览器在这种方式下没法正常工作，这次导出已停下，没有生成文件。请先关掉 Cindy，不要选「以管理员身份运行」，直接双击打开，再导出一次。",
    EXPORT_ELEVATED_MONTCLIP: "MontClip 是用「以管理员身份运行」打开的，导出需要的浏览器在这种方式下没法正常工作，这次导出已停下，没有生成文件。请先关掉 MontClip，不要选「以管理员身份运行」，直接双击打开，再导出一次。",
    EXPORT_ELEVATED_PROGRAM: "这个程序是用「以管理员身份运行」打开的，导出需要的浏览器在这种方式下没法正常工作，这次导出已停下，没有生成文件。请先关掉这个程序，不要选「以管理员身份运行」，直接双击打开，再导出一次。",
  },
  en: {
    EXPORT_ELEVATED_CINDY: 'Cindy was opened with "Run as administrator", and the browser it needs for exporting can\'t work properly that way, so this export stopped and no file was made. Close Cindy, open it normally (not "Run as administrator"), and export again.',
    EXPORT_ELEVATED_MONTCLIP: 'MontClip was opened with "Run as administrator", and the browser it needs for exporting can\'t work properly that way, so this export stopped and no file was made. Close MontClip, open it normally (not "Run as administrator"), and export again.',
    EXPORT_ELEVATED_PROGRAM: 'This program was opened with "Run as administrator", and the browser it needs for exporting can\'t work properly that way, so this export stopped and no file was made. Close this program, open it normally (not "Run as administrator"), and export again.',
  },
};
// the engine's English job error for these codes (server/export-jobs.js on MontClip#284): never shown on the card
const ENGINE_ERROR = 'this program was started with "Run as administrator", and the browser an export needs exits at once that way; no file was made. Close it, start it normally (not as administrator) and export again';
// a real failed job record read back from the engine on MontClip#284 head 5c28fb94 (agentdex-arena-1, elevation injected
// by a -r hook, the stand-in browser exiting 0 at once); ids and times as recorded, nothing personal in it
const REAL_ELEVATED = { id: "x_0689hgyt", project: null, session: null, kind: "scopes", status: "failed", via: "headless", progress: 0, src: null, error: ENGINE_ERROR, code: "EXPORT_ELEVATED_PROGRAM", created: 1794620235891, updated: 1794620235895 };
const REAL_CRASHED = { id: "x_h2vgv5qh", project: null, session: null, kind: "scopes", status: "failed", via: "headless", progress: 0, src: null, error: "the headless browser exited before the export finished", code: "EXPORT_PAGE_CRASHED", created: 1794620238496, updated: 1794620238500 };
// what the card is drawn from for a failed job (main.js: f.failure for a job that failed)
const fromJob = (job) => ({ phase: "failed", stage: "job", code: job.code, progress: job.progress, reason: job.error || job.status });

test("each EXPORT_ELEVATED_* card says JJ's sentence in one paragraph, never the fallback or the engine's English", () => {
  const { exportCard } = load();
  for (const lang of ["zh", "en"]) for (const [code, sentence] of Object.entries(JJ[lang])) {
    const html = exportCard({ phase: "failed", stage: "job", code, progress: 0, reason: ENGINE_ERROR }, lang);
    assert.ok(html.includes('<p style="margin:8px 0 0">' + esc(sentence) + "</p>"), lang + " " + code + ": " + html);
    assert.doesNotMatch(html, /没预料到的问题|didn't expect|导出到一半停了|stopped partway/, lang + " " + code);
    assert.ok(!html.includes("exits at once"), "the engine's English stays off the card: " + code);
    assert.ok(!html.includes(lang === "en" ? "Your edits are all still there." : "你的剪辑都还在，没有丢。"), "JJ's sentence is said alone, as the engine says it");
    assert.match(html, /data-ghost-action="retry"/, "after reopening normally she can retry from the card");
    assert.match(html, /data-ghost-action="copy-problem"/, "the raw error can still be copied for us");
  }
});

test("the agent's answer (plainFailure) says the same sentence and keeps the code", () => {
  const { plainFailure } = load();
  for (const [code, sentence] of Object.entries(JJ.zh)) {
    const r = plainFailure({ phase: "failed", stage: "job", code, progress: 0, reason: ENGINE_ERROR });
    assert.equal(r.error, sentence);
    assert.equal(r.code, code);
  }
});

test("the real failed job record from MontClip#284 is drawn as JJ's sentence; its plain crash is not", () => {
  const { exportCard, plainFailure } = load();
  const card = exportCard(fromJob(REAL_ELEVATED), "zh");
  assert.ok(card.includes(JJ.zh.EXPORT_ELEVATED_PROGRAM), card);
  assert.match(card, /导出没有完成/, "under the 导出没有完成 head");
  assert.equal(plainFailure(fromJob(REAL_ELEVATED)).error, JJ.zh.EXPORT_ELEVATED_PROGRAM);
  const crashed = exportCard(fromJob(REAL_CRASHED), "zh");
  assert.match(crashed, /导出到一半停了/, "a crashed headless browser still says it stopped partway");
  assert.doesNotMatch(crashed, /以管理员身份运行/);
});

test("ordinary failures keep their own words and are never said as the administrator sentence", () => {
  const { exportCard, plainFailure } = load();
  const cases = [
    [{ phase: "failed", stage: "job", code: "EXPORT_PAGE_CRASHED", progress: 0, reason: "the headless browser exited before the export finished" }, /导出到一半停了/],
    [{ phase: "failed", stage: "job", code: "EXPORT_FAILED", progress: 0, reason: "renderer said no" }, /没预料到的问题/],
    [{ phase: "failed", stage: "job", code: null, progress: 0, reason: "Run as administrator" }, /没预料到的问题/],
    [{ phase: "failed", stage: "job", code: "EXPORT_ELEVATED", progress: 0, reason: ENGINE_ERROR }, /没预料到的问题/],
    [{ phase: "failed", stage: "job", code: "EXPORT_ELEVATED_SOMETHING", progress: 0, reason: ENGINE_ERROR }, /没预料到的问题/],
    [{ phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: "第 3 段（时间线 1:12 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。" }, /第 3 段（时间线 1:12 处）的声音没读出来/],
    [{ phase: "failed", stage: "start", code: "EDITOR_NOT_READY", reason: "The editor is not ready; open it and retry." }, /要剪辑器开着才能做/],
    [{ phase: "failed", stage: "start", code: "FFMPEG_MISSING", reason: "ffmpeg not found" }, /缺一个处理视频的工具/],
  ];
  for (const [c, words] of cases) {
    const html = exportCard(c, "zh");
    assert.match(html, words, String(c.code));
    assert.doesNotMatch(html, /以管理员身份运行/, String(c.code));
    assert.doesNotMatch(plainFailure(c).error, /以管理员身份运行/, String(c.code));
  }
});

// engine/ is the pinned MontClip; when it carries MontClip#284 its own errorText must say what the card says
const UI = path.join(__dirname, "..", "engine", "ui-preferences.js");
const engineHasIt = fs.existsSync(UI) && fs.readFileSync(UI, "utf8").includes("err-export-elevated-cindy");
test("the card's sentences are the engine's errorText, word for word", { skip: !engineHasIt && "the pinned engine (engine-lock.json) predates MontClip#284" }, () => {
  const V = require(UI);
  const { exportCard } = load();
  for (const [lang, ui] of [["zh", "zh-CN"], ["en", "en"]]) for (const code of Object.keys(JJ[lang])) {
    const text = V.errorText(ui, { code }).text;
    assert.equal(text, JJ[lang][code], lang + " " + code);
    assert.ok(exportCard({ phase: "failed", stage: "job", code, reason: ENGINE_ERROR }, lang).includes(esc(text)));
  }
});
