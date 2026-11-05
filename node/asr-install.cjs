"use strict";
/* The speech engine, the VAD and the speech model for on-device transcription (P8, Deja 2026-11-05): what this system
   still needs from node/asr-runtime.json, and installing what main.js downloaded (cindy.downloads, after the user's yes
   in the host's confirm box). Every file is measured here again — exact bytes, then SHA-256 — and all of them are
   unpacked into a staging folder before anything is put in place, so a bad file leaves nothing behind.

     planAsr(runtime, platform, data) → {supported, platform, release, items, missing, bytes}
     installAsr({runtime, platform, data, files: {name: path}, tmpDir}) → {installed: [name…]}
   `data` is the plugin's data folder; each item's `into` is relative to it (asr/…, asr-models/…). */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const MARK = ".montclip-asr.json";   // an unpacked package: which tarball it came from

function sha256File(file) {
  const h = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  try { let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { fs.closeSync(fd); }
  return h.digest("hex");
}
/** A file's SHA-256, remembered while its size and modification time stay the same (the model is 232 MB). */
const seen = new Map();
function hashOf(file) {
  const st = fs.statSync(file), key = file + "|" + st.size + "|" + st.mtimeMs, had = seen.get(key);
  if (had) return had;
  const h = sha256File(file); seen.set(key, h); return h;
}
const forPlatform = (runtime, platform) => runtime.items.filter((i) => i.platforms.includes(platform));

/** Is this item installed as pinned? A package: its marker names the tarball's SHA-256 (or, put there by hand, its
 *  package.json has the name and version of the tarball); a file: exact bytes and SHA-256. */
function have(item, data) {
  const dest = path.join(data, item.into);
  try {
    if (item.kind === "npm") {
      try { if (JSON.parse(fs.readFileSync(path.join(dest, MARK), "utf8")).sha256 === item.sha256) return true; } catch { }
      const pkg = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
      const m = /^(.+)-(\d+\.\d+\.\d+)\.tgz$/.exec(item.name);
      return !!m && pkg.name === m[1] && pkg.version === m[2];
    }
    return fs.statSync(dest).size === item.bytes && hashOf(dest) === item.sha256;
  } catch { return false; }
}

function planAsr(runtime, platform, data) {
  const items = forPlatform(runtime, platform);
  const missing = items.filter((i) => !have(i, data));
  return { supported: items.length > 0, platform, release: runtime.release, items, missing,
    bytes: missing.reduce((n, i) => n + i.bytes, 0) };
}

function extractTgz(archive, into) {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar";
  const t = spawnSync(tar, ["-xzf", archive, "-C", into], { encoding: "utf8", windowsHide: true });
  if (t.status !== 0) throw Object.assign(new Error("unpacking failed: " + (t.stderr || t.error)), { code: "UNPACK_FAILED" });
}
/** rename, or copy and delete when the two are on different drives */
function move(from, to) {
  try { fs.renameSync(from, to); }
  catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.cpSync(from, to, { recursive: true }); fs.rmSync(from, { recursive: true, force: true });
  }
}

function installAsr({ runtime, platform, data, files, tmpDir, extract = extractTgz }) {
  const todo = planAsr(runtime, platform, data).missing;
  // every file first: handed over, the pinned size, the pinned SHA-256 (measured here, not taken on trust)
  for (const it of todo) {
    const f = files && files[it.name];
    if (!f || !fs.existsSync(f)) throw Object.assign(new Error("no downloaded file was handed over for " + it.name), { code: "NO_FILE", file: it.name });
    const size = fs.statSync(f).size;
    if (size !== it.bytes) throw Object.assign(new Error(`${it.name}: size mismatch: got ${size} bytes, pinned ${it.bytes}`), { code: "SIZE_MISMATCH", file: it.name });
    const got = sha256File(f);
    if (got !== it.sha256) throw Object.assign(new Error(`${it.name}: SHA-256 mismatch: got ${got}, pinned ${it.sha256}`), { code: "SHA256_MISMATCH", file: it.name });
  }
  fs.mkdirSync(tmpDir, { recursive: true });
  const work = fs.mkdtempSync(path.join(tmpDir, "montclip-asr-"));
  try {
    // then all of them staged (unpacked / copied) before anything is put in place
    const staged = todo.map((it, k) => {
      const at = path.join(work, String(k));
      if (it.kind === "npm") {
        fs.mkdirSync(at);
        extract(files[it.name], at);
        const pkg = path.join(at, "package");
        if (!fs.existsSync(path.join(pkg, "package.json"))) throw Object.assign(new Error(it.name + " is not an npm package"), { code: "BAD_ARCHIVE", file: it.name });
        fs.writeFileSync(path.join(pkg, MARK), JSON.stringify({ name: it.name, sha256: it.sha256, release: runtime.release }) + "\n");
        return { it, from: pkg };
      }
      fs.copyFileSync(files[it.name], at);
      return { it, from: at };
    });
    for (const { it, from } of staged) {
      const dest = path.join(data, it.into);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const old = dest + ".old-" + process.pid;
      if (fs.existsSync(dest)) fs.renameSync(dest, old);
      try { move(from, dest); } catch (e) { if (fs.existsSync(old)) fs.renameSync(old, dest); throw e; }
      fs.rmSync(old, { recursive: true, force: true });
    }
    return { installed: todo.map((i) => i.name) };
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
}

module.exports = { planAsr, installAsr, sha256File };
