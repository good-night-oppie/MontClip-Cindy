"use strict";
/* Which FFmpeg encodes an MP4 (H.264) export, said plainly (europa, 2026-11-08). The FFmpeg MontClip downloads is an
   LGPL build with no software H.264 encoder (--disable-libx264 --disable-libopenh264), only graphics-card ones; on a
   computer with no usable graphics-card encoder every MP4 is encoded by the user's own FFmpeg with libx264 — the one
   chosen in the settings file, or,
   with engine efa1be7a and later, the first one on PATH. montclip_status said only ffmpeg:"downloaded", so an MP4
   made by /usr/bin/ffmpeg 5.1 looked like one made by the download. The status now names the program that will encode
   an MP4, and montclip_export says it when an export starts. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), os = require("node:os");
const { h264Export, ffmpegVersionFrom, maskHome } = require("../node/lib.cjs");
const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const WORKER = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");

/* JJ's final words for the 「MP4 导出」 line and the agent's note (#46, comment 6719719370), punctuation included. */
const NOT = "，不是 MontClip 下载的那份";
const JJ_MP4 = {
  settings: (program, version) => "用设置文件里指定的 " + program + "（版本 " + version + "）" + NOT,
  settingsNoProgram: "用设置文件里指定的 ffmpeg" + NOT,
  env: "用启动时指定的 ffmpeg" + NOT,
  path: "用系统里找到的 ffmpeg（具体是哪一个，这里看不出来）" + NOT,
  own: "用这台电脑自己的 ffmpeg（具体是哪一个，这里看不出来）" + NOT,
  bundled: "用 MontClip 下载的 ffmpeg",
  none: "现在导不了 MP4（没有找到能用的编码工具）",
  unknown: "现在查不到是哪个 ffmpeg",
};
const JJ_PLAIN = "When you tell the streamer, say it in plain words (for example \"MP4 files are made by this computer's own FFmpeg, not the one MontClip downloaded\"); don't read out version strings, environment variable names or folder names.";

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN, ctx);
  return ctx;
}

test("the engine's /api/export/h264 answer becomes where an MP4 is encoded", () => {
  // engine efa1be7a and later: external.source says which of the user's FFmpegs
  for (const source of ["settings", "env", "path"])
    assert.deepEqual(h264Export({ encoder: "libx264", encoders: ["libx264"], external: { ok: true, source } }), { encoder: "libx264", from: source }, source);
  // engine 5b312e63 (main's pin) has no source: still the user's own, not the download
  assert.deepEqual(h264Export({ encoder: "libx264", encoders: ["libx264"], external: { ok: true } }), { encoder: "libx264", from: "own" });
  // a graphics-card encoder in the download goes first: the download encodes it
  assert.deepEqual(h264Export({ encoder: "h264_nvenc", encoders: ["h264_nvenc", "libx264"], external: { ok: true, source: "path" } }), { encoder: "h264_nvenc", from: "bundled" });
  assert.deepEqual(h264Export({ encoder: "h264_nvenc", encoders: ["h264_nvenc"], external: { ok: false, code: "none" } }), { encoder: "h264_nvenc", from: "bundled" });
  // libx264 without the user's FFmpeg (no download at all, development): the program that runs everything
  assert.deepEqual(h264Export({ encoder: "libx264", encoders: ["libx264"], external: { ok: false, code: "none" } }), { encoder: "libx264", from: "bundled" });
  // no H.264 encoder anywhere
  assert.deepEqual(h264Export({ encoder: null, encoders: [], external: { ok: false, code: "none" }, reason: { code: "noH264" } }), { encoder: null, from: "none" });
  // an unknown source is not passed on as if it were one
  assert.deepEqual(h264Export({ encoder: "libx264", external: { ok: true, source: "elsewhere" } }), { encoder: "libx264", from: "own" });
  // nothing to read
  for (const body of [null, undefined, "x", 3]) assert.equal(h264Export(body), null);
});

test("the program and its version are named only for the FFmpeg in the settings file", () => {
  const h = { encoder: "libx264", external: { ok: true, source: "settings" } };
  assert.deepEqual(h264Export(h, { program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" }),
    { encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" });
  assert.deepEqual(h264Export(h, { program: "/usr/bin/ffmpeg" }), { encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg" });
  // from PATH the engine does not say which program: none is guessed
  assert.deepEqual(h264Export({ encoder: "libx264", external: { ok: true, source: "path" } }, { program: "/usr/bin/ffmpeg", version: "5.1" }), { encoder: "libx264", from: "path" });
});

test("the version comes from the first line of ffmpeg -version, and the home folder is ~", () => {
  assert.equal(ffmpegVersionFrom("ffmpeg version 5.1.9-0+deb12u1 Copyright (c) 2000-2026 the FFmpeg developers\nbuilt with gcc 12"), "5.1.9-0+deb12u1");
  assert.equal(ffmpegVersionFrom("ffmpeg version n9.0.2-42-gd7643a0fe3-20261102 Copyright (c) 2000-2026"), "n9.0.2-42-gd7643a0fe3-20261102");
  for (const s of ["", "not ffmpeg", null, undefined]) assert.equal(ffmpegVersionFrom(s), null);
  const home = path.resolve("/home/u");
  assert.equal(maskHome(path.join(home, "bin", "ffmpeg"), home), "~" + path.sep + path.join("bin", "ffmpeg"));
  assert.equal(maskHome("/usr/bin/ffmpeg", home), "/usr/bin/ffmpeg");
  assert.equal(maskHome(home + "-other/ffmpeg", home), home + "-other/ffmpeg", "a sibling that only starts the same is not home");
});

test("the status card's MP4 line names the program, and says when it is not the download", () => {
  const { mp4Line, statusCard } = load();
  assert.equal(typeof mp4Line, "function");
  // JJ's final words (#46, comment 6719719370), word for word: one per source, and the line when nothing could be read
  assert.equal(mp4Line({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" }), JJ_MP4.settings("/usr/bin/ffmpeg", "5.1.9-0+deb12u1"));
  assert.equal(mp4Line({ encoder: "libx264", from: "settings", program: "~\\tools\\ffmpeg.exe", version: "8.0" }), "用设置文件里指定的 ~\\tools\\ffmpeg.exe（版本 8.0），不是 MontClip 下载的那份");
  assert.equal(mp4Line({ encoder: "libx264", from: "settings" }), JJ_MP4.settingsNoProgram);
  assert.equal(mp4Line({ encoder: "libx264", from: "env" }), JJ_MP4.env);
  assert.equal(mp4Line({ encoder: "libx264", from: "path" }), JJ_MP4.path);
  assert.equal(mp4Line({ encoder: "libx264", from: "own" }), JJ_MP4.own);
  assert.equal(mp4Line({ encoder: "h264_nvenc", from: "bundled" }), JJ_MP4.bundled);
  assert.equal(mp4Line({ encoder: null, from: "none" }), JJ_MP4.none);
  assert.equal(mp4Line(null), JJ_MP4.unknown);
  // the settings program without a version line: the same sentence without its bracket
  assert.equal(mp4Line({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg" }), "用设置文件里指定的 /usr/bin/ffmpeg，不是 MontClip 下载的那份");
  const card = statusCard({ ffmpeg: "downloaded", project: "p", asr: null, mp4: { encoder: "libx264", from: "path" } }, true);
  assert.ok(card.includes("MP4 导出"), "the line's label");
  assert.ok(card.includes(JJ_MP4.path), "its value");
});

test("from PATH (or an engine that does not say which) no program is named afterwards, on the card or for the agent", () => {
  // JJ's check on #46: the engine does not say which program it found, and none is guessed after the fact
  const { mp4Line, mp4Export } = load();
  assert.deepEqual(h264Export({ encoder: "libx264", external: { ok: true, source: "path" } }, { program: "/usr/bin/ffmpeg", version: "5.1" }), { encoder: "libx264", from: "path" });
  for (const from of ["path", "own", "env", "bundled", "none"]) {
    const h = { encoder: "libx264", from, program: "/usr/bin/ffmpeg", version: "5.1" };
    assert.doesNotMatch(mp4Line(h), /\/usr\/bin|5\.1/, from + ": the card");
    const out = mp4Export(h);
    assert.equal(out.program, undefined, from + ": no program for the agent");
    assert.equal(out.version, undefined, from + ": no version for the agent");
    assert.doesNotMatch(out.note, /usr\/bin|ffmpeg 5\.1/, from + ": the note");
  }
  assert.equal(mp4Line({ encoder: "libx264", from: "path", program: "/usr/bin/ffmpeg" }), JJ_MP4.path);
  assert.equal(mp4Line({ encoder: "libx264", from: "own", program: "/usr/bin/ffmpeg" }), JJ_MP4.own);
});

test("an agent reads the same in montclip_status and when montclip_export starts", () => {
  const { mp4Note } = load();
  assert.equal(typeof mp4Note, "function");
  const own = mp4Note({ encoder: "libx264", from: "path" });
  assert.match(own, /not the FFmpeg MontClip downloaded/);
  assert.match(own, /libx264/);
  // only the program's file name: the folders it is in stay on this computer (QQ on #46)
  assert.match(mp4Note({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" }), /by ffmpeg 5\.1\.9-0\+deb12u1, named/);
  assert.doesNotMatch(mp4Note({ encoder: "libx264", from: "settings", program: "~\\tools\\ffmpeg.exe" }), /[\\/]/);
  assert.match(mp4Note({ encoder: "h264_nvenc", from: "bundled" }), /the FFmpeg MontClip downloaded/);
  assert.doesNotMatch(mp4Note({ encoder: "h264_nvenc", from: "bundled" }), /not the FFmpeg/);
  assert.match(mp4Note({ encoder: null, from: "none" }), /no H\.264 encoder/);
  assert.match(mp4Note(null), /could not be checked/);
  // JJ's sentence ends every note, so the agent tells the streamer in plain words
  for (const h of [null, { encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1" }, { encoder: "libx264", from: "settings" },
    { encoder: "libx264", from: "env" }, { encoder: "libx264", from: "path" }, { encoder: "libx264", from: "own" },
    { encoder: "h264_nvenc", from: "bundled" }, { encoder: null, from: "none" }])
    assert.ok(mp4Note(h).endsWith(" " + JJ_PLAIN), JSON.stringify(h));
  // both tools put it in their answer
  assert.match(MAIN, /async montclip_status[\s\S]*?mp4Export/);
  assert.match(MAIN, /async montclip_export[\s\S]*?mp4Export/);
  // the worker asks the engine, through the same route the export dialog uses
  assert.match(WORKER, /"montclip\/h264"/);
  assert.match(WORKER, /\/api\/export\/h264/);
});

test("maskHome: a Windows path matches the home folder in any case and with either slash; POSIX as it is", () => {
  // synthetic home folders only (QQ on #46: c:\users\<name>\… or C:/Users/<name>/… left the name on the card)
  const win = "C:\\Users\\someone";
  for (const p of ["C:\\Users\\someone\\tools\\ffmpeg.exe", "c:\\users\\someone\\tools\\ffmpeg.exe", "C:/Users/someone/tools/ffmpeg.exe",
    "c:/USERS/SomeOne/tools/ffmpeg.exe", "C:\\Users/someone\\tools/ffmpeg.exe"])
    assert.equal(maskHome(p, win, "win32"), "~\\tools\\ffmpeg.exe", p);
  assert.equal(maskHome("c:/users/someone", win, "win32"), "~");
  assert.equal(maskHome("C:\\Users\\someone\\tools\\ffmpeg.exe", "c:/users/someone/", "win32"), "~\\tools\\ffmpeg.exe", "a home folder written with / and a trailing slash");
  assert.equal(maskHome("C:\\Users\\someone2\\ffmpeg.exe", win, "win32"), "C:\\Users\\someone2\\ffmpeg.exe", "a sibling that only starts the same is not home");
  assert.equal(maskHome("D:\\tools\\ffmpeg.exe", win, "win32"), "D:\\tools\\ffmpeg.exe");
  // POSIX: /home/<name> and /Users/<name>
  assert.equal(maskHome("/home/someone/bin/ffmpeg", "/home/someone", "linux"), "~/bin/ffmpeg");
  assert.equal(maskHome("/Users/someone/bin/ffmpeg", "/Users/someone", "darwin"), "~/bin/ffmpeg");
  assert.equal(maskHome("/home/someone", "/home/someone", "linux"), "~");
  assert.equal(maskHome("/home/someone2/bin/ffmpeg", "/home/someone", "linux"), "/home/someone2/bin/ffmpeg");
  assert.equal(maskHome("/usr/bin/ffmpeg", "/home/someone", "linux"), "/usr/bin/ffmpeg");
});

/* Runs a tool call through main.js the way Cindy does: what the agent gets back (tool-result) and the cards. */
async function call(tool, args, h264) {
  const sent = [];
  let onMsg = null;
  const answers = {
    "montclip/start": { origin: "http://127.0.0.1:1", ffmpeg: "downloaded", dataDir: "~/.montclip" },
    "montclip/asr-status": { engine: true, model: true, punct: true },
    "montclip/h264": h264, "montclip/export-start": { id: "j1", status: "cancelled", progress: 0 },
  };
  const cindy = { onHostMessage: (f) => { onMsg = f; }, send: async (m) => { sent.push(m); return { ok: true }; },
    node: { request: async ({ method }) => method in answers ? { ok: true, result: answers[method] } : { ok: false, error: "no" } } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  await onMsg({ type: "tool-call", callId: "c1", tool, args });
  return { result: sent.find((m) => m.type === "tool-result").result, cards: sent.filter((m) => m.type === "card-update").map((m) => m.html || "") };
}

test("the agent gets only the program's file name; the full path (home folder as ~) stays on the status card", async () => {
  const settings = (program) => ({ encoder: "libx264", from: "settings", program, version: "5.1.9" });
  for (const [program, name] of [["~\\tools\\ffmpeg\\bin\\ffmpeg.exe", "ffmpeg.exe"], ["~/bin/ffmpeg", "ffmpeg"],
    // even a path the worker did not mask: the name in it does not reach the agent
    ["C:\\Users\\someone\\tools\\ffmpeg.exe", "ffmpeg.exe"], ["/home/someone/bin/ffmpeg", "ffmpeg"]]) {
    for (const [tool, args] of [["montclip_status", {}], ["montclip_export", { folder: "default" }]]) {
      const { result, cards } = await call(tool, args, settings(program));
      assert.equal(result.mp4Export.program, name, tool + " " + program);
      assert.equal(result.mp4Export.from, "settings");
      assert.equal(result.mp4Export.version, "5.1.9");
      for (const [k, v] of Object.entries(result.mp4Export)) assert.doesNotMatch(String(v), /[\\/]/, tool + ": no folder in " + k + ": " + v);
      assert.doesNotMatch(JSON.stringify(result), /someone/, tool + ": no user name");
      if (tool === "montclip_status") assert.ok(cards.some((c) => c.includes(JJ_MP4.settings(program, "5.1.9"))), "the card keeps " + program);
    }
  }
});

test("the card's value column can wrap a path with no break in it (a Windows path: a backslash is no place to break)", () => {
  // VV on #46: ~\tools\…\ffmpeg.exe had no place to break and pushed the card past 280 / 360 px; the real layout is
  // measured in test/asr-card.test.cjs, this holds the style where no browser runs
  const { statusCard } = load();
  const card = statusCard({ ffmpeg: "downloaded", project: "p", asr: null, mp4: { encoder: "libx264", from: "settings", program: "~/scoop/apps/ffmpeg/current/bin/ffmpeg.exe", version: "7.1" } }, true);
  const values = card.match(/<span style="min-width:0;overflow-wrap:anywhere">/g) || [];
  assert.equal(values.length, 5, "every value: 项目, 剪辑器, 导出工具, MP4 导出, 听写");
});

/* DD on #46 (review 5817710337): the download has graphics-card H.264 encoders (h264_nvenc, h264_qsv, h264_amf, …); what
   it lacks is a software one (libx264, openh264). DD's words, for the agent and in montclip_status's description. */
const DD_NOT_DOWNLOAD = " — not the FFmpeg MontClip downloaded, which has no software H.264 encoder (libx264) and no usable graphics-card encoder here.";
const DD_NONE = "(the FFmpeg MontClip downloaded has no software H.264 encoder, and no graphics-card encoder or own FFmpeg with libx264 was found)";
const DD_GHOST = "MontClip 下载的那份没有软件 H.264 编码器（只能用显卡编码），没有能用的显卡编码器时由这台电脑自己的 FFmpeg 编码";
const GHOST = JSON.parse(fs.readFileSync(path.join(ROOT, "ghost.json"), "utf8"));

test("the download lacks a software H.264 encoder, not every one: DD's words for the agent and the tool description", () => {
  const { mp4Note } = load();
  for (const from of ["settings", "env", "path", "own"])
    assert.ok(mp4Note({ encoder: "libx264", from }).includes(DD_NOT_DOWNLOAD), from);
  assert.ok(mp4Note({ encoder: null, from: "none" }).includes(DD_NONE), "none");
  const status = GHOST.tools.find((t) => t.name === "montclip_status");
  assert.ok(status.description.includes(DD_GHOST), "montclip_status's description");
});

test("no text an agent reads says the downloaded FFmpeg has no H.264 encoder without saying software", () => {
  const { mp4Note } = load();
  const texts = [null, { encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1" }, { encoder: "libx264", from: "settings" },
    { encoder: "libx264", from: "env" }, { encoder: "libx264", from: "path" }, { encoder: "libx264", from: "own" },
    { encoder: "h264_nvenc", from: "bundled" }, { encoder: null, from: "none" }].map((h) => mp4Note(h))
    .concat(GHOST.tools.map((t) => t.description));
  for (const t of texts) {
    // "this computer has no H.264 encoder" (none at all, from: none) is true; about the download it must say software
    for (const m of t.matchAll(/\bno (software )?H\.264 encoder/g))
      assert.ok(m[1] || t.slice(0, m.index).endsWith("this computer has "), t);
    assert.doesNotMatch(t, /none of its own|H\.264 encoder of its own/, t);
    assert.doesNotMatch(t, /没有 ?H\.264 ?编码器/, t);
  }
});
