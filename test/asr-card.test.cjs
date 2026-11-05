"use strict";
/* The status card's 「听写（语音转文字）」 line: JJ's final words (2026-11-05, through Deja), word for word, in both
   languages. The model's size is not written by hand: the worker reads it from the engine's
   desktop/asr-manifest.json (the Paraformer files' bytes) and the card rounds it as JJ writes it. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN, ctx);
  return ctx;
}
const modelBytes = () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "engine", "desktop", "asr-manifest.json"), "utf8")).models.asr;
  return Object.values(m.files).reduce((n, f) => n + f.size, 0);
};

test("JJ's three lines, Chinese and English, word for word", () => {
  const { asrLine } = load();
  const b = modelBytes();
  assert.equal(Math.round(b / 1e6 / 10) * 10, 240, "MB of 1,000,000 bytes, to the nearest 10 (DD on #7)");
  assert.equal(asrLine({ engine: true, model: true, modelBytes: b }), "已装好");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }), "还没装听写模型（约 240 MB）");
  assert.equal(asrLine({ engine: false, model: false, modelBytes: b }), "这台电脑上还没有听写程序");
  assert.equal(asrLine({ engine: true, model: true, modelBytes: b }, "en"), "Installed");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }, "en"), "Speech model not installed yet (about 240 MB)");
  assert.equal(asrLine({ engine: false, model: false, modelBytes: b }, "en"), "No transcription program on this computer yet");
});

test("the size follows the manifest's bytes, never a number written in the card", () => {
  const { asrLine } = load();
  assert.equal(asrLine({ engine: true, model: false, modelBytes: 300e6 }), "还没装听写模型（约 300 MB）");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: 300e6 }, "en"), "Speech model not installed yet (about 300 MB)");
  assert.doesNotMatch(MAIN, /约 2[34]0 MB|about 2[34]0 MB/, "no size written by hand in main.js");
});

test("the worker reports the model's bytes from the engine's manifest", () => {
  const w = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");
  assert.match(w, /modelBytes/);
  assert.match(w, /asr-manifest\.json/);
});

/* DD on #7 (review 5781528697): 「约 230 MB」 was wrong — the model is 243,371,218 bytes (+ tokens.txt 75,756), which
   the card's rule writes as 「约 240 MB」: MB of 1,000,000 bytes, to the nearest 10. And the 听写 label, longer than
   min-width 8.5em, pushed its value out of the column; at 280 px it wrapped to two lines and the button sat a few
   pixels from the card's bottom. Every label now has one width (9.5em, not shrinking), and the card's height is
   estimated from its rows, not written in. */
test("the size is the manifest's bytes in MB of 1,000,000, to the nearest 10: 约 240 MB", () => {
  const { asrLine, aboutMb } = load();
  const b = modelBytes();
  assert.equal(b, 243371218 + 75756, "the manifest's two Paraformer files");
  assert.equal(aboutMb(b), Math.round(b / 1e6 / 10) * 10);
  assert.equal(aboutMb(b), 240);
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }), "还没装听写模型（约 " + aboutMb(b) + " MB）");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }, "en"), "Speech model not installed yet (about " + aboutMb(b) + " MB)");
});

test("the card's height is estimated from its rows, never one number for every card", () => {
  const { statusCardHeight } = load();
  assert.equal(typeof statusCardHeight, "function");
  const open = statusCardHeight({ asr: null }, true), closed = statusCardHeight({ asr: null }, false);
  assert.ok(closed > open, "the open-editor button makes it taller");
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
  const os = require("node:os"), { execFileSync } = require("node:child_process");
  const ctx = load(), b = modelBytes();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-card-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  const cases = [["nothing installed", { engine: false, model: false, modelBytes: b }], ["no model", { engine: true, model: false, modelBytes: b }], ["not known", null]];
  for (const width of [280, 360]) for (const [what, asr] of cases) {
    const card = ctx.statusCard({ ffmpeg: "missing", project: "演示任务的项目", asr }, false);
    const page = path.join(dir, `card-${width}-${cases.findIndex((c) => c[0] === what)}.html`);
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${width}px;font:13px system-ui,sans-serif">${card}` +
      `<script>const root=document.body.firstElementChild, rows=[...root.querySelectorAll('div[style*="display:flex"]')];` +
      `const btn=root.querySelector('button'), r=root.getBoundingClientRect(), b=btn?btn.getBoundingClientRect():null;` +
      `document.body.setAttribute('data-m', JSON.stringify({values: rows.map(x=>x.children[1].getBoundingClientRect().left), labelLines: rows.map(x=>Math.round(x.children[0].getBoundingClientRect().height)), bottomGap: b ? r.bottom-b.bottom : null, height: r.height}));</script></body>`);
    const out = execFileSync(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(dir, "profile")}`,
      `--window-size=${width},800`, "--dump-dom", "file:///" + page.replace(/\\/g, "/")], { encoding: "utf8", timeout: 60000 });
    const m = JSON.parse(/data-m="([^"]*)"/.exec(out)[1].replace(/&quot;/g, '"'));
    assert.equal(m.values.length, 4, what);
    assert.ok(Math.max(...m.values) - Math.min(...m.values) < 1, `${width} px, ${what}: values start at ${m.values.map(Math.round)}`);
    assert.ok(m.labelLines.every((h) => h < 30), `${width} px, ${what}: every label on one line (${m.labelLines})`);
    assert.ok(m.bottomGap >= 8, `${width} px, ${what}: the button is ${m.bottomGap} px from the bottom`);
    const est = ctx.statusCardHeight({ asr }, false);
    assert.ok(est >= m.height - 4, `${width} px, ${what}: estimated ${est} px for a card ${Math.round(m.height)} px tall`);
  }
});
