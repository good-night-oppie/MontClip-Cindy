"use strict";
/* VV's UI review of MontClip-Cindy#48 (issuecomment-6729467270): the 导出完成 card was always 210 px tall, and with two
   warnings and a longer file name it needs 277 px at 280 px and 240 px at 360 px, so 〔打开文件夹〕 — the last step of
   the whole flow — was cut off. The card's height is now estimated from what it holds (exportCardHeight, as
   statusCardHeight does for the status card), and each warning sits on its own line. Here every export card is laid
   out by a real Chrome at the narrowest widths and the estimate must not be shorter than the card. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), os = require("node:os");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.exportCard = exportCard; this.exportCardHeight = exportCardHeight;", ctx);
  return ctx;
}
const SILENT = "第 1 段（时间线 0:00 处）是无声的，请确认是不是你想要的。";
const UNCHECKED = "第 2 段（时间线 1:12 处）在成片里没有声音，软件没能确认原片是不是也没有。成片已经导出，请先自己听一下这一段，再决定要不要发。";
const AUDIO_FAILED = "第 3 段（时间线 1:12 处）的声音没读出来，这次导出已停下，没有生成文件。原片没有改动。";
const LONG = "小梨的直播回放 2026-11-08 晚场 第二段 唱歌合集 最终版 11-08_1080p.mp4";
const CASES = [
  ["done, one file", { phase: "done", folder: "Videos", dir: "C:\\Users\\<user>\\Videos", job: "x_1", files: [{ name: "demo 11-08_360p.mp4", bytes: 1234567 }], note: "−14.4 LUFS" }],
  ["done, one warning", { phase: "done", folder: "Videos", dir: "C:\\Users\\<user>\\Videos", job: "x_1", files: [{ name: "demo 11-08_360p.mp4", bytes: 1234567 }], note: "640×360 · 30 fps · −14.4 LUFS\n" + SILENT }],
  ["done, two warnings, a long name", { phase: "done", folder: "我的切片 2026 年 11 月", dir: "D:\\直播\\切片\\2026-11", job: "x_1", files: [{ name: LONG, bytes: 987654321, renamed: true }], note: "640×360 · 30 fps · 540 frames · 18.00 s · −14.4 LUFS · 2.5 MB\n" + SILENT + "\n" + UNCHECKED }],
  ["done, three files", { phase: "done", folder: "Videos", job: "x_1", files: [{ name: "a 11-08_1080p.mp4", bytes: 1 }, { name: "b 11-08_1080p.mp4", bytes: 2 }, { name: LONG, bytes: 3 }], note: "" }],
  ["failed, #231", { phase: "failed", stage: "job", code: "EXPORT_AUDIO_FAILED", reason: AUDIO_FAILED }],
  ["failed, opened as administrator (MontClip#247)", { phase: "failed", stage: "job", code: "EXPORT_ELEVATED_CINDY", reason: "this program was started with \"Run as administrator\", and the browser an export needs exits at once that way" }],
  ["failed, generic", { phase: "failed", stage: "job", code: "EXPORT_FAILED", reason: "renderer crashed" }],
  ["copy failed", { phase: "copyFailed", code: "ENOSPC", reason: "no space left on device", job: "x_1", folder: "Videos" }],
  ["still", { phase: "still", job: "x_1", folder: "Videos" }],
  ["running", { phase: "running", progress: 0.4, folder: "Videos" }],
  ["no job", { phase: "failed", code: "NO_JOB", job: "x_1" }],
];

test("the summary on one line, each warning on its own line, none joined into one sentence", () => {
  const { exportCard } = load();
  const html = exportCard(CASES[2][1], "zh");
  for (const s of ["640×360 · 30 fps · 540 frames · 18.00 s · −14.4 LUFS · 2.5 MB", SILENT, UNCHECKED]) assert.ok(html.includes(">" + s + "<"), s);
  for (const s of [SILENT, UNCHECKED]) assert.ok(!html.includes(" · " + s), "not joined after another warning: " + s.slice(0, 8));
});

test("the height comes from what the card holds, never one number for every card", () => {
  const { exportCardHeight } = load();
  const h = Object.fromEntries(CASES.map(([k, c]) => [k, exportCardHeight(c)]));
  assert.ok(h["done, two warnings, a long name"] > h["done, one warning"]);
  assert.ok(h["done, one warning"] > h["done, one file"]);
  assert.ok(h["done, three files"] > h["done, one file"]);
});

function findBrowser() {
  const c = [process.env.FABLECUT_CHROME, "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return c.find((p) => p && fs.existsSync(p)) || null;
}
const BROWSER = findBrowser();
test("at 280 px and 360 px every export card fits its estimate, and its last button keeps clear of the bottom", { skip: !BROWSER && "no Chrome / Edge here", timeout: 240000 }, (t) => {
  const { execFileSync } = require("node:child_process");
  const ctx = load();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-export-card-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  for (const width of [280, 360]) CASES.forEach(([what, c], i) => {
    const page = path.join(dir, `card-${width}-${i}.html`);
    fs.writeFileSync(page, `<!doctype html><meta charset="utf-8"><body style="margin:0;width:${width}px;font:13px system-ui,sans-serif">${ctx.exportCard(c, "zh")}` +
      `<script>const root=document.body.firstElementChild, btns=root.querySelectorAll('button'), btn=btns[btns.length-1], r=root.getBoundingClientRect(), b=btn?btn.getBoundingClientRect():null;` +
      `document.body.setAttribute('data-m', JSON.stringify({bottomGap: b ? r.bottom-b.bottom : null, height: r.height}));</script></body>`);
    const out = execFileSync(BROWSER, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${path.join(dir, "profile")}`,
      `--window-size=${width},900`, "--dump-dom", "file:///" + page.replace(/\\/g, "/")], { encoding: "utf8", timeout: 60000 });
    const m = JSON.parse(/data-m="([^"]*)"/.exec(out)[1].replace(/&quot;/g, '"'));
    const est = ctx.exportCardHeight(c);
    assert.ok(est >= m.height, `${width} px, ${what}: estimated ${est} px for a card ${Math.round(m.height)} px tall`);
    assert.ok(est - m.height <= 120, `${width} px, ${what}: estimated ${est} px, the card is ${Math.round(m.height)} px — far too much empty space`);
    if (m.bottomGap !== null) assert.ok(m.bottomGap >= 8, `${width} px, ${what}: the last button is ${m.bottomGap} px from the bottom`);
  });
});
