"use strict";
/* Which FFmpeg encodes an MP4 (H.264) export, said plainly (europa, 2026-11-08). The FFmpeg MontClip downloads is an
   LGPL build with no H.264 encoder of its own (--disable-libx264 --disable-libopenh264); on a computer without a
   graphics card every MP4 is encoded by the user's own FFmpeg with libx264 — the one chosen in the settings file, or,
   with engine efa1be7a and later, the first one on PATH. montclip_status said only ffmpeg:"downloaded", so an MP4
   made by /usr/bin/ffmpeg 5.1 looked like one made by the download. The status now names the program that will encode
   an MP4, and montclip_export says it when an export starts. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), os = require("node:os");
const { h264Export, ffmpegVersionFrom, maskHome } = require("../node/lib.cjs");
const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const WORKER = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");

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
  const NOT = "，不是 MontClip 下载的那份";
  assert.equal(mp4Line({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" }), "用这台电脑上的 /usr/bin/ffmpeg（5.1.9-0+deb12u1）" + NOT);
  assert.equal(mp4Line({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg" }), "用这台电脑上的 /usr/bin/ffmpeg" + NOT);
  assert.equal(mp4Line({ encoder: "libx264", from: "settings" }), "用设置里选的 ffmpeg" + NOT);
  assert.equal(mp4Line({ encoder: "libx264", from: "path" }), "用系统里找到的 ffmpeg" + NOT);
  assert.equal(mp4Line({ encoder: "libx264", from: "env" }), "用启动时指定的 ffmpeg" + NOT);
  assert.equal(mp4Line({ encoder: "libx264", from: "own" }), "用这台电脑上的 ffmpeg" + NOT);
  assert.equal(mp4Line({ encoder: "h264_nvenc", from: "bundled" }), "用 MontClip 下载的 ffmpeg");
  assert.equal(mp4Line({ encoder: null, from: "none" }), "这台电脑导不了 MP4");
  assert.equal(mp4Line(null), "现在查不到");
  const card = statusCard({ ffmpeg: "downloaded", project: "p", asr: null, mp4: { encoder: "libx264", from: "path" } }, true);
  assert.ok(card.includes("MP4 导出"), "the line's label");
  assert.ok(card.includes("用系统里找到的 ffmpeg" + NOT), "its value");
});

test("an agent reads the same in montclip_status and when montclip_export starts", () => {
  const { mp4Note } = load();
  assert.equal(typeof mp4Note, "function");
  const own = mp4Note({ encoder: "libx264", from: "path" });
  assert.match(own, /not the FFmpeg MontClip downloaded/);
  assert.match(own, /libx264/);
  assert.match(mp4Note({ encoder: "libx264", from: "settings", program: "/usr/bin/ffmpeg", version: "5.1.9-0+deb12u1" }), /\/usr\/bin\/ffmpeg 5\.1\.9-0\+deb12u1/);
  assert.match(mp4Note({ encoder: "h264_nvenc", from: "bundled" }), /the FFmpeg MontClip downloaded/);
  assert.doesNotMatch(mp4Note({ encoder: "h264_nvenc", from: "bundled" }), /not the FFmpeg/);
  assert.match(mp4Note({ encoder: null, from: "none" }), /no H\.264 encoder/);
  assert.match(mp4Note(null), /could not be checked/);
  // both tools put it in their answer
  assert.match(MAIN, /async montclip_status[\s\S]*?mp4Export/);
  assert.match(MAIN, /async montclip_export[\s\S]*?mp4Export/);
  // the worker asks the engine, through the same route the export dialog uses
  assert.match(WORKER, /"montclip\/h264"/);
  assert.match(WORKER, /\/api\/export\/h264/);
});
