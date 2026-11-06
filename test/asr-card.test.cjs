"use strict";
/* The status card's 听写 line: JJ's final words (2026-11-05, through Deja), word for word, in both languages — the label
   「听写」 with the hint 「把说的话转成文字」 on hover; 已装好 / 还没装模型（约 N MB）/ 还没装听写程序; and under the last
   two a small line saying what it is for and that editing and exporting still work. N is never written by hand: the
   worker reads the Paraformer files' bytes from the engine's desktop/asr-manifest.json and rounds them with the engine's
   own aboutMb (asr-status.js, MontClip#165) — MB rounded to 10, 243,371,218 → 240. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), os = require("node:os");
const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN, ctx);
  return ctx;
}
const manifest = () => JSON.parse(fs.readFileSync(path.join(ROOT, "engine", "desktop", "asr-manifest.json"), "utf8"));
const JJ = {
  zh: { label: "听写", hint: "把说的话转成文字", ready: "已装好", model: (n) => `还没装模型（约 ${n} MB）`, engine: "还没装听写程序",
    note: "做字幕、按说过的话找位置时要用；剪辑和导出不受影响。" },
  en: { label: "Transcription", hint: "Turns speech into text", ready: "Installed", model: (n) => `Model not installed (about ${n} MB)`,
    engine: "Transcription program not installed", note: "Needed for captions and for finding a moment by what was said. Editing and exporting still work." },
};

test("JJ's words for the 听写 line, Chinese and English, word for word", () => {
  const { asrLine, asrNote, ASR_CARD } = load();
  for (const lang of ["zh", "en"]) {
    const j = JJ[lang];
    assert.equal(ASR_CARD[lang].label, j.label); assert.equal(ASR_CARD[lang].hint, j.hint);
    assert.equal(asrLine({ engine: true, model: true, modelMb: 240 }, lang), j.ready);
    assert.equal(asrLine({ engine: true, model: false, modelMb: 240 }, lang), j.model(240));
    assert.equal(asrLine({ engine: false, model: false, modelMb: 240 }, lang), j.engine);
    assert.equal(asrNote({ engine: true, model: false, modelMb: 240 }, lang), j.note);
    assert.equal(asrNote({ engine: false, model: false, modelMb: 240 }, lang), j.note);
    assert.equal(asrNote({ engine: true, model: true, modelMb: 240 }, lang), "", "no note once installed");
  }
});

test("the card: label 「听写」 with its hint on hover, the note under the value while something is missing", () => {
  const { statusCard } = load();
  const html = statusCard({ ffmpeg: "downloaded", project: "p", asr: { engine: true, model: false, modelMb: 240 } }, true);
  assert.ok(html.includes('title="把说的话转成文字"'), "the hint");
  assert.ok(/>听写</.test(html), "the label");
  assert.ok(!html.includes("听写（语音转文字）"), "the old label is gone");
  assert.ok(html.includes("还没装模型（约 240 MB）") && html.includes(JJ.zh.note));
  assert.ok(!statusCard({ ffmpeg: "downloaded", project: "p", asr: { engine: true, model: true, modelMb: 240 } }, true).includes(JJ.zh.note));
});

test("the size: the manifest's bytes through the engine's aboutMb; a different manifest, a different number", () => {
  const { asrModelMb, aboutMbFrom } = require("../node/lib.cjs");
  const m = manifest();
  const round = (b) => Math.round(b / 1e6 / 10) * 10;
  const about = aboutMbFrom(path.join(ROOT, "engine"));
  assert.equal(about(243371218), 240, "243,371,218 bytes → 240");
  assert.equal(asrModelMb(m, about), 240);
  const bigger = JSON.parse(JSON.stringify(m));
  bigger.models.asr.files["model.int8.onnx"].size = 312000000;
  assert.equal(asrModelMb(bigger, about), round(312000000 + m.models.asr.files["tokens.txt"].size), "follows the bytes");
  assert.equal(asrModelMb({}, about), null, "no manifest, no number");
  // the engine's own function when the engine has it (asr-status.js, MontClip#165)
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-about-"));
  try {
    fs.writeFileSync(path.join(app, "asr-status.js"), "module.exports = { aboutMb: (b) => 7 };");
    assert.equal(aboutMbFrom(app)(243371218), 7, "the engine's aboutMb is the one used");
  } finally { fs.rmSync(app, { recursive: true, force: true }); }
  const w = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");
  assert.match(w, /modelMb/); assert.match(w, /asr-manifest\.json/);
  assert.doesNotMatch(MAIN, /1e6|1048576 \/ 10|约 2[34]0 MB|about 2[34]0 MB/, "main.js rounds nothing and writes no size");
});

test("the card's height is estimated from its rows, never one number for every card", () => {
  const { statusCardHeight } = load();
  assert.equal(typeof statusCardHeight, "function");
  const open = statusCardHeight({ asr: null }, true), closed = statusCardHeight({ asr: null }, false);
  assert.ok(closed > open, "the open-editor button makes it taller");
  assert.ok(statusCardHeight({ asr: { engine: false, model: false, modelMb: 240 } }, true) > statusCardHeight({ asr: { engine: true, model: true, modelMb: 240 } }, true), "the note makes it taller");
  assert.doesNotMatch(MAIN, /height: open \? \d+ : \d+/, "no fixed heights left");
});

/* The card as Chromium lays it out, at the narrowest and a usual chat width. */
function findBrowser() {
  const c = [process.env.FABLECUT_CHROME, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const BROWSER = findBrowser();
test("at 280 px and 360 px every value starts in one column, and the button keeps clear of the card's bottom", { skip: !BROWSER && "no Chrome / Edge here" }, (t) => {
  const { execFileSync } = require("node:child_process");
  const ctx = load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-card-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const cases = [["nothing installed", { engine: false, model: false, modelMb: 240 }], ["no model", { engine: true, model: false, modelMb: 240 }], ["installed", { engine: true, model: true, modelMb: 240 }], ["not known", null]];
  for (const width of [280, 360]) for (const [what, asr] of cases) {
    const s = { ffmpeg: "missing", project: "演示任务的项目", asr };
    const card = ctx.statusCard(s, false);
    const page = path.join(dir, `card-${width}-${cases.findIndex((c) => c[0] === what)}.html`);
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${width}px;font:13px system-ui,sans-serif">${card}` +
      `<script>const root=document.body.firstElementChild, rows=[...root.querySelectorAll('div[style*="display:flex"]')];` +
      `const btn=root.querySelector('button'), r=root.getBoundingClientRect(), b=btn?btn.getBoundingClientRect():null;` +
      `document.body.setAttribute('data-m', JSON.stringify({values: rows.map(x=>x.children[1].getBoundingClientRect().left), labelLines: rows.map(x=>{const g=document.createRange();g.selectNodeContents(x.children[0]);return new Set([...g.getClientRects()].map(q=>Math.round(q.top))).size;}), bottomGap: b ? r.bottom-b.bottom : null, height: r.height}));</script></body>`);
    const out = execFileSync(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(dir, "profile")}`,
      `--window-size=${width},800`, "--dump-dom", "file:///" + page.replace(/\\/g, "/")], { encoding: "utf8", timeout: 60000 });
    const m = JSON.parse(/data-m="([^"]*)"/.exec(out)[1].replace(/&quot;/g, '"'));
    assert.equal(m.values.length, 4, what);
    assert.ok(Math.max(...m.values) - Math.min(...m.values) < 1, `${width} px, ${what}: values start at ${m.values.map(Math.round)}`);
    assert.ok(m.labelLines.every((n) => n === 1), `${width} px, ${what}: every label on one line (lines: ${m.labelLines})`);
    assert.ok(m.bottomGap >= 8, `${width} px, ${what}: the button is ${m.bottomGap} px from the bottom`);
    const est = ctx.statusCardHeight(s, false);
    assert.ok(est >= m.height - 4, `${width} px, ${what}: estimated ${est} px for a card ${Math.round(m.height)} px tall`);
  }
});

// QQ (review of c97f275b): when desktop/asr-manifest.json cannot be read the worker's modelMb stays null, and the card
// read 「还没装模型（约 null MB）」; and a 听写 state the worker could not get showed a bare 「—」. JJ's words (2026-11-06):
// no size, no brackets — its own sentence, the {N} one untouched; a state not known says so.
const JJ_NO_SIZE = { zh: "还没装模型", en: "Model not installed" };
const JJ_UNKNOWN = { zh: "现在查不到", en: "Can't check right now" };
test("no manifest, no size: 「还没装模型」 / \"Model not installed\", its own sentence; with a size the {N} one", () => {
  const { asrLine, ASR_CARD } = load();
  for (const lang of ["zh", "en"]) {
    assert.equal(ASR_CARD[lang].modelNoSize, JJ_NO_SIZE[lang], lang);
    assert.equal(ASR_CARD[lang].model(240), JJ[lang].model(240), lang + ": the {N} sentence is unchanged");
    assert.equal(asrLine({ engine: true, model: false, modelMb: 240 }, lang), JJ[lang].model(240), lang + " with N");
    for (const mb of [null, undefined, NaN, "240", Infinity])
      assert.equal(asrLine({ engine: true, model: false, modelMb: mb }, lang), JJ_NO_SIZE[lang], lang + " without N: " + String(mb));
  }
});

test("a 听写 state that could not be read: 「现在查不到」 / \"Can't check right now\", never a bare dash", () => {
  const { asrLine, asrNote, ASR_CARD, statusCard } = load();
  for (const lang of ["zh", "en"]) {
    assert.equal(ASR_CARD[lang].unknown, JJ_UNKNOWN[lang], lang);
    assert.equal(asrLine(null, lang), JJ_UNKNOWN[lang], lang);
    assert.equal(asrLine(undefined, lang), JJ_UNKNOWN[lang], lang);
    assert.equal(asrNote(null, lang), "", lang + ": no note when the state is not known");
  }
  assert.ok(statusCard({ ffmpeg: "downloaded", project: "p", asr: null }, true).includes(JJ_UNKNOWN.zh), "the card shows it");
});

test("no state of the 听写 line, in either language, ever shows null / undefined / NaN", () => {
  const { asrLine, statusCard } = load();
  const states = [null, undefined];
  for (const engine of [true, false]) for (const model of [true, false]) for (const modelMb of [240, null, undefined, NaN])
    states.push({ engine, model, modelMb });
  for (const a of states) {
    for (const lang of ["zh", "en"]) assert.doesNotMatch(asrLine(a, lang), /null|undefined|NaN/, lang + " " + JSON.stringify(a));
    assert.doesNotMatch(statusCard({ ffmpeg: "downloaded", project: "p", asr: a }, true), /null|undefined|NaN/, "card " + JSON.stringify(a));
  }
});
