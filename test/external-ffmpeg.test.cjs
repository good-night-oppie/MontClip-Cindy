"use strict";
// The engine's "your own FFmpeg with libx264" (engine external-ffmpeg.js) for H.264 export, wired in the plugin.
// Deja's ruling on #35 (2026-11-07, QQ's review): the settings file lives in the plugin's own settings folder, never
// in the data folder the engine writes to, so no path bug in the engine can plant the setting that names a program.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawn } = require("node:child_process");
const { configDir, externalFfmpegSettings } = require("../node/lib.cjs");
const ROOT = path.resolve(__dirname, ".."), DIST = path.join(ROOT, "dist", "montclip");

const inside = (dir, file) => { const r = path.relative(dir, file); return !!r && !r.startsWith("..") && !path.isAbsolute(r); };

// These run on every system, Windows included.
test("the settings folder is the system's per-user config folder, outside the data folder", () => {
  const home = path.resolve("/home/u");
  assert.equal(configDir({ platform: "linux", env: {}, home }), path.join(home, ".config", "montclip-cindy"));
  assert.equal(configDir({ platform: "linux", env: { XDG_CONFIG_HOME: path.resolve("/cfg") }, home }), path.join(path.resolve("/cfg"), "montclip-cindy"));
  assert.equal(configDir({ platform: "darwin", env: {}, home }), path.join(home, "Library", "Application Support", "MontClip-Cindy"));
  assert.equal(configDir({ platform: "win32", env: { APPDATA: path.resolve("/AppData/Roaming") }, home }), path.join(path.resolve("/AppData/Roaming"), "MontClip-Cindy"));
  // Cindy trims the worker's environment: no APPDATA → the usual Roaming folder under the home folder
  assert.equal(configDir({ platform: "win32", env: {}, home }), path.join(home, "AppData", "Roaming", "MontClip-Cindy"));
  for (const platform of ["linux", "darwin", "win32"]) {
    const data = path.join(home, "MontClip-Cindy"), file = externalFfmpegSettings(data, { platform, env: {}, home });
    assert.equal(path.basename(file), "external-ffmpeg.json", platform);
    assert.ok(!inside(data, file), `${platform}: ${file} is not under ${data}`);
  }
});

test("a settings folder inside the data folder turns the feature off instead of reading it there", () => {
  const data = path.resolve("/home/u/MontClip-Cindy");
  assert.equal(externalFfmpegSettings(data, { platform: "linux", env: { MONTCLIP_CINDY_CONFIG: path.join(data, "cfg") } }), null);
  assert.equal(externalFfmpegSettings(data, { platform: "linux", env: { MONTCLIP_CINDY_CONFIG: data } }), null);
  // Windows paths compare without case
  assert.equal(externalFfmpegSettings(data, { platform: "win32", env: { MONTCLIP_CINDY_CONFIG: data.toUpperCase() + path.sep + "cfg" } }), null);
  // a sibling whose name only starts the same is outside
  assert.ok(externalFfmpegSettings(data, { platform: "linux", env: { MONTCLIP_CINDY_CONFIG: data + "-config" } }));
});

test("the worker takes the setting from the settings folder, never from DATA", () => {
  const w = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");
  assert.match(w, /const extSettings = externalFfmpegSettings\(DATA\);/);
  assert.doesNotMatch(w, /path\.join\(DATA,\s*"external-ffmpeg\.json"\)/);
});

// End to end through the built worker. Stand-in FFmpeg programs answer -version / -encoders. Windows: not run — the
// engine runs FFmpeg with execFile and no shell (on purpose), and since Node's fix for CVE-2024-27980 a .cmd/.bat
// stand-in cannot be started that way; a real .exe stand-in would need a compiler on the CI runner. The parts above
// (where the file lives) do run on Windows.
const skip = process.platform === "win32" && "stand-in FFmpeg programs are shell scripts; .cmd cannot run without a shell (CVE-2024-27980)";

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
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ext-data-"));
  const config = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-ext-config-"));
  const platform = `${process.platform}-${process.arch}`;
  for (const n of ["ffmpeg", "ffprobe"]) fakeFfmpeg(path.join(data, "ffmpeg", platform, n), ["libvpx-vp9"]);
  const userFfmpeg = path.join(config, "my-ffmpeg", "ffmpeg");
  fakeFfmpeg(userFfmpeg, ["libx264", "libvpx-vp9"]);
  setup({ data, config, setting: JSON.stringify({ version: 1, path: userFfmpeg }) });
  const env = { ...process.env, MONTCLIP_CINDY_DATA: data, MONTCLIP_CINDY_CONFIG: config, MONTCLIP_CINDY_PORT: "0", FABLECUT_NO_FS_WATCH: "1" };
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
    fs.rmSync(data, { recursive: true, force: true }); fs.rmSync(config, { recursive: true, force: true });
  }
}

test("settings in the plugin's settings folder: the user's FFmpeg with libx264 is used for H.264", { skip, timeout: 60000 }, async () => {
  const h = await h264With(({ config, setting }) => fs.writeFileSync(path.join(config, "external-ffmpeg.json"), setting));
  assert.deepEqual(h.external, { ok: true });
  assert.ok(h.encoders.includes("libx264"), JSON.stringify(h));
});

test("the same file in DATA (where the engine writes) is ignored", { skip, timeout: 60000 }, async () => {
  const h = await h264With(({ data, setting }) => fs.writeFileSync(path.join(data, "external-ffmpeg.json"), setting));
  assert.deepEqual(h.external, { ok: false, code: "none" });
  assert.ok(!h.encoders.includes("libx264"), JSON.stringify(h));
});

test("no settings file: exactly as before (external none, no libx264)", { skip, timeout: 60000 }, async () => {
  const h = await h264With(() => {});
  assert.deepEqual(h.external, { ok: false, code: "none" });
  assert.ok(!h.encoders.includes("libx264"), JSON.stringify(h));
});
