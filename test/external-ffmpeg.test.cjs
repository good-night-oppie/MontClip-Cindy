"use strict";
// Deja (2026-11-07): the engine's "your own FFmpeg with libx264" (external-ffmpeg.js) was never wired in the plugin,
// so Europa's external-ffmpeg.json was ignored and H.264 export failed. The worker now points the engine at
// <data>/external-ffmpeg.json; without that file the engine behaves exactly as before (external: none).
// Stand-in programs (shell scripts) answer -version / -encoders, so this runs on Linux and macOS, not Windows.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const DIST = path.resolve(__dirname, "..", "dist", "montclip");
const skip = process.platform === "win32" && "stand-in ffmpeg programs are shell scripts";

function fakeFfmpeg(file, encoders) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `#!/bin/sh
case "$*" in
  *-version*) echo "ffmpeg version stand-in"; exit 0;;
  *-encoders*) echo "Encoders:"; printf '%s\\n' ${encoders.map((e) => `" V....D ${e}  stand-in"`).join(" ")}; exit 0;;
esac
exit 0
`);
  fs.chmodSync(file, 0o755);
}

async function h264With(setup) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ext-ffmpeg-"));
  const platform = `${process.platform}-${process.arch}`;
  for (const n of ["ffmpeg", "ffprobe"]) fakeFfmpeg(path.join(data, "ffmpeg", platform, n), ["libvpx-vp9"]);
  setup(data);
  const env = { ...process.env, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" };
  delete env.MONTCLIP_CINDY_APP; delete env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS;
  const worker = spawn(process.execPath, [path.join(DIST, "node", "worker.cjs")], { env, stdio: ["pipe", "pipe", "pipe"] });
  worker.stderr.resume();
  let buf = "";
  const started = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("worker did not start")), 20000);
    worker.stdout.on("data", (c) => {
      buf += c;
      const end = buf.indexOf("\n");
      if (end >= 0) { clearTimeout(timer); const m = JSON.parse(buf.slice(0, end)); m.error ? reject(new Error(m.error.message)) : resolve(m.result); }
    });
  });
  worker.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "montclip/start", params: {} }) + "\n");
  try {
    const start = await started;
    const headers = { "X-MontClip-Session": new URL(start.url).searchParams.get("token") };
    const res = await fetch(start.origin + "/api/export/h264", { headers });
    assert.equal(res.status, 200);
    return await res.json();
  } finally {
    await new Promise((resolve) => { worker.once("exit", resolve); worker.kill(); });
    fs.rmSync(data, { recursive: true, force: true });
  }
}

test("the worker points the engine at <data>/external-ffmpeg.json: the user's FFmpeg with libx264 is used for H.264", { skip, timeout: 60000 }, async () => {
  const h = await h264With((data) => {
    const ext = path.join(data, "my-ffmpeg", "ffmpeg");
    fakeFfmpeg(ext, ["libx264", "libvpx-vp9"]);
    fs.writeFileSync(path.join(data, "external-ffmpeg.json"), JSON.stringify({ version: 1, path: ext }));
  });
  assert.deepEqual(h.external, { ok: true });
  assert.ok(h.encoders.includes("libx264"), JSON.stringify(h));
});

test("no external-ffmpeg.json: exactly as before (external none, no libx264)", { skip, timeout: 60000 }, async () => {
  const h = await h264With(() => {});
  assert.deepEqual(h.external, { ok: false, code: "none" });
  assert.ok(!h.encoders.includes("libx264"), JSON.stringify(h));
});
