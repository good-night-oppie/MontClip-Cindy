"use strict";
/* The worker installs ffmpeg only from an archive of the pinned byte count, then the pinned SHA-256 (Rea on
   MontClip#150). This does not lean on cindy.downloads having checked the size: the archive is measured here. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const { installFfmpeg } = require("../node/lib.cjs");

function world(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-install-ffmpeg-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, "ffmpeg.tar.xz");
  fs.writeFileSync(archive, body);
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  const calls = [];
  const opts = (spec) => ({ archive, spec, dest: path.join(dir, "dest"), win: false, tmpDir: dir, manifest: {},
    sha256: (f) => { calls.push("sha256"); return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex"); },
    extract: (a, w) => { calls.push("extract"); const bin = path.join(w, "root", "bin"); fs.mkdirSync(bin, { recursive: true });
      for (const n of ["ffmpeg", "ffprobe"]) fs.writeFileSync(path.join(bin, n), n); },
    installTree: () => { calls.push("install"); return "ffmpeg version test"; }, check: () => null });
  return { sha, calls, opts, size: Buffer.byteLength(body) };
}

test("an archive whose size is not the pinned byte count is refused before its SHA-256 or unpacking", (t) => {
  const w = world(t, "an archive");
  for (const bytes of [w.size + 1, w.size - 1]) {
    assert.throws(() => installFfmpeg(w.opts({ sha256: w.sha, bytes, root: "root" })),
      (e) => e.code === "SIZE_MISMATCH" && new RegExp(`got ${w.size} bytes, pinned ${bytes}`).test(e.message));
  }
  assert.deepEqual(w.calls, []);
});

test("a spec with no pinned byte count is refused, never installed unchecked", (t) => {
  const w = world(t, "an archive");
  for (const bytes of [undefined, 0, -3, 2.5, "11"])
    assert.throws(() => installFfmpeg(w.opts({ sha256: w.sha, bytes, root: "root" })), (e) => e.code === "NO_PINNED_BYTES", String(bytes));
  assert.deepEqual(w.calls, []);
});

test("the pinned size with another SHA-256 is still refused; size and SHA-256 both right installs", (t) => {
  const w = world(t, "an archive");
  assert.throws(() => installFfmpeg(w.opts({ sha256: "0".repeat(64), bytes: w.size, root: "root" })), (e) => e.code === "SHA256_MISMATCH");
  w.calls.length = 0;
  const out = installFfmpeg(w.opts({ sha256: w.sha, bytes: w.size, root: "root" }));
  assert.equal(out.installed, true);
  assert.deepEqual(w.calls, ["sha256", "extract", "install"]);
});

test("a wrong size shows as the banner's 文件不完整 (checksum), like a wrong SHA-256", () => {
  const B = require("../ffmpeg-banner.js");
  assert.equal(B.reasonOf("SIZE_MISMATCH"), "checksum");
  assert.equal(B.reasonOf("SHA256_MISMATCH"), "checksum");
});
