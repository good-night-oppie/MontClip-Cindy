"use strict";
/* MontClip-Cindy#41 (JJ's spec 6717056123, PG adopt 6717183506): when ffmpeg's download or install fails, the agent gets
   only a whitelisted code and a fixed sentence, and no ffmpeg-progress message carries the raw error. Each of the five
   failure points (the download, the install, and the worker's extract · installTree · mkdtempSync) and a throw nobody
   expected is given an error naming a made-up home folder; neither the whole tool result nor any progress message may
   show it. main.js runs here against a fake host; the worker's errors come from node/lib.cjs itself. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), vm = require("node:vm"), crypto = require("node:crypto");
const { installFfmpeg: libInstall } = require("../node/lib.cjs");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

// made-up people and folders only
const WIN_HOME = "C:\\Users\\SecretName测试用户\\AppData\\Local\\MontClip";
const POSIX_HOME = "/home/SecretName测试用户/.local/share/montclip";
const NAMES = ["SecretName", "测试用户"];
const FORBIDDEN = ["C:\\", "\\Users\\", "/home/", "/Users/", "AppData", ...NAMES, "EPERM", "ENOENT", "EACCES", "ENOSPC", "EBUSY"];
// JJ's final sentences, word for word (#41 spec 6717056123, #45 6717292486 and 6718419281)
const CHECK = { zh: "下载下来的文件和预期的不一致，为了安全没有安装。请再下载一次；还不行，点「复制问题信息」发给我们。",
  en: "The downloaded file doesn't match what was expected, so it wasn't installed, to be safe. Download it again; if it still doesn't work, use \"Copy problem details\" and send it to us." };
const JJ = {
  DOWNLOAD_FAILED: { zh: "FFmpeg 没有下载成功，请检查网络后再试一次；还不行，点「复制问题信息」发给我们。",
    en: "FFmpeg couldn't be downloaded. Check your network and try again; if it still doesn't work, use \"Copy problem details\" and send it to us." },
  DISK_FULL: { zh: "磁盘空间不够，清理一些空间后再试一次。",
    en: "There isn't enough disk space. Free up some space and try again." },
  INSTALL_FAILED: { zh: "FFmpeg 没有装成功，可能是文件被占用或被杀毒软件拦住了。关掉相关程序后再试一次；还不行，点「复制问题信息」发给我们。",
    en: "FFmpeg wasn't installed. A file may be in use, or antivirus software may have blocked it. Close any related programs and try again; if it still doesn't work, use \"Copy problem details\" and send it to us." },
  CANCELLED: { zh: "你取消了下载，没有安装。需要的话，可以再点一次下载。",
    en: "The download was cancelled and nothing was installed. If you need it, you can start the download again." },
  SIZE_MISMATCH: CHECK, SHA256_MISMATCH: CHECK, BAD_ARCHIVE: CHECK,
  UNPACK_FAILED: { zh: "下载好了，但解压没成功，没有安装。关掉相关程序后再试一次；还不行，点「复制问题信息」发给我们。",
    en: "The download finished, but unpacking didn't work, so nothing was installed. Close any related programs and try again; if it still doesn't work, use \"Copy problem details\" and send it to us." },
  UNSUPPORTED_PLATFORM: { zh: "这台电脑的系统暂时没有可以直接下载的 FFmpeg，这里没法帮你装好。点「复制问题信息」发给我们。",
    en: "This computer's system doesn't have an FFmpeg we can download directly, so we can't install it for you here. Use \"Copy problem details\" and send it to us." },
  HOST_TOO_OLD: { zh: "你的 Cindy 版本太旧，装不了 FFmpeg。先把 Cindy 更新到最新，再回来点下载。",
    en: "Your Cindy is too old to install FFmpeg. Update Cindy to the latest version, then come back and click download." },
};
const WHITELIST = ["DOWNLOAD_FAILED", "DISK_FULL", "INSTALL_FAILED", "CANCELLED", "SIZE_MISMATCH", "SHA256_MISMATCH", "BAD_ARCHIVE",
  "UNPACK_FAILED", "UNSUPPORTED_PLATFORM", "HOST_TOO_OLD"];

function assertClean(what, value) {
  const s = JSON.stringify(value);
  for (const f of FORBIDDEN) assert.ok(!s.includes(f) && !s.includes(JSON.stringify(f).slice(1, -1)), what + " shows " + JSON.stringify(f) + ": " + s);
  // anything shaped like a path: a drive letter, or two or more /segments
  assert.doesNotMatch(s, /[A-Za-z]:\\\\|(?:\/[\w.\u4e00-\u9fff-]+){2,}/, what + " has a path: " + s);
}

/* the worker's JSON-RPC error for an Error thrown in montclip/ffmpeg-install (nodeRuntimeBroker: message + data.code) */
const rpcError = (e) => ({ ok: false, errorCode: "PROTOCOL_ERROR", message: String(e.message || e),
  data: { ...(typeof e.code === "string" ? { code: e.code } : {}), ...(Number.isFinite(e.need) ? { need: e.need } : {}) } });

function host({ spec, download, install, noDownloads }) {
  let listener = null;
  const progress = [];
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async () => ({ ok: true }),
    downloads: noDownloads ? undefined : { start: download || (async (p) => ({ ok: true, token: "t", bytes: p.bytes, sha256: p.sha256 })) },
    node: {
      async request(r) {
        if (r.method === "montclip/ffmpeg-spec") {
          if (spec) return spec();
          return { ok: true, result: { supported: true, platform: "linux-x64", url: "https://github.com/x/ff.tar.xz", sha256: "a".repeat(64), bytes: 10, state: "missing" } };
        }
        if (r.method === "montclip/ffmpeg-install") return install();
        return { ok: false, errorCode: "NO", message: r.method };
      },
    },
  };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage(m) { progress.push(JSON.parse(JSON.stringify(m))); } }
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel, console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  const run = () => new Promise((resolve) => {
    cindy.send = async (m) => { if (m.type === "tool-result" && m.callId === "c1") resolve(m); return { ok: true }; };
    listener({ type: "tool-call", tool: "montclip_install_ffmpeg", callId: "c1", args: {} });
  });
  return { progress, run };
}

async function expectSafe(h, code) {
  const sent = await h.run();
  assertClean("the tool result", sent);
  assert.equal(sent.ok, true, JSON.stringify(sent));
  assert.ok(WHITELIST.includes(sent.result.code), "code " + sent.result.code);
  assert.equal(sent.result.code, code);
  assert.equal(sent.result.error, JJ[code].zh, code + " zh");
  assert.equal(sent.result.errorEn, JJ[code].en === null ? undefined : JJ[code].en, code + " en");
  assert.deepEqual(Object.keys(sent.result).filter((k) => !["error", "errorEn", "code", "need"].includes(k)), [], JSON.stringify(sent.result));
  const failed = h.progress.filter((m) => m.type === "ffmpeg-progress" && m.phase === "failed");
  // once anything was said (queued), how it ended is said once, with the same code
  if (h.progress.some((m) => m.phase === "queued")) { assert.equal(failed.length, 1, "one failed progress message"); assert.equal(failed[0].code, code); }
  else assert.equal(failed.length, 0);
  for (const m of h.progress) assertClean("progress " + m.phase, m);
  return sent.result;
}

/* the worker's own install (node/lib.cjs) with one step failing: the Error it really throws */
function libError(t, { extract, installTree, tmpDir }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-41-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const archive = path.join(dir, "ffmpeg.tar.xz"), body = "an archive";
  fs.writeFileSync(archive, body);
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  try {
    libInstall({ archive, spec: { sha256: sha, bytes: Buffer.byteLength(body), root: "root" }, dest: path.join(dir, "dest"), win: false,
      tmpDir: tmpDir || dir, manifest: {}, sha256: () => sha, check: () => null,
      extract: extract || ((a, w) => { const bin = path.join(w, "root", "bin"); fs.mkdirSync(bin, { recursive: true });
        for (const n of ["ffmpeg", "ffprobe"]) fs.writeFileSync(path.join(bin, n), n); }),
      installTree: installTree || (() => "ffmpeg version test") });
  } catch (e) { return e; }
  assert.fail("the install did not fail");
}
const nodeError = (code, message, extra) => Object.assign(new Error(message), { code, ...extra });

for (const [home, label] of [[WIN_HOME, "Windows"], [POSIX_HOME, "POSIX"]]) {
  test(`1 download failure (${label}): the host's own message and an unknown host code never reach the agent`, async () => {
    const h = host({ download: async () => ({ ok: false, errorCode: "ERR " + home, message: "EACCES: permission denied, open '" + home + "\\cache\\ffmpeg.part'" }) });
    await expectSafe(h, "DOWNLOAD_FAILED");
    const h2 = host({ download: async () => ({ ok: false, message: "ENOENT: no such file or directory, open '" + home + "/ffmpeg.part'" }) });
    await expectSafe(h2, "DOWNLOAD_FAILED");
  });

  test(`2 install failure (${label}): the worker's raw message is replaced; unknown codes are INSTALL_FAILED`, async () => {
    const e = nodeError("EPERM", "EPERM: operation not permitted, rename '" + home + "\\ffmpeg.staged' -> '" + home + "\\ffmpeg'", { path: home });
    await expectSafe(host({ install: () => rpcError(e) }), "INSTALL_FAILED");
    // no code at all, only words
    await expectSafe(host({ install: () => ({ ok: false, errorCode: "", message: "failed under " + home }) }), "INSTALL_FAILED");
  });

  test(`3 extract (${label}): tar's EPERM with a path, thrown inside node/lib.cjs, comes back as INSTALL_FAILED`, async (t) => {
    const e = libError(t, { extract: () => { throw nodeError("EPERM", "EPERM: operation not permitted, rename '" + home + "\\x' -> '" + home + "\\y'"); } });
    assert.ok(String(e.message).includes("SecretName"), "the worker's own error has the path");
    await expectSafe(host({ install: () => rpcError(e) }), "INSTALL_FAILED");
  });

  test(`4 installTree (${label}): ENOSPC with a path is DISK_FULL with how much to free, and no path`, async (t) => {
    const e = libError(t, { installTree: () => { throw nodeError("ENOSPC", "ENOSPC: no space left on device, copyfile '" + home + "\\a' -> '" + home + "\\b'", { path: home }); } });
    assert.ok(String(e.message).includes("SecretName"));
    e.need = 123456789;   // the worker works this out (worker.cjs) and passes it in the error's data
    const r = await expectSafe(host({ install: () => rpcError(e) }), "DISK_FULL");
    assert.equal(r.need, 123456789);
    const busy = libError(t, { installTree: () => { throw nodeError("EBUSY", "EBUSY: resource busy or locked, rmdir '" + home + "\\ffmpeg'"); } });
    await expectSafe(host({ install: () => rpcError(busy) }), "INSTALL_FAILED");
  });
}

test("5 mkdtempSync: Node's real ENOENT for a temp folder under a made-up home comes back as INSTALL_FAILED", async (t) => {
  const missing = process.platform === "win32" ? "C:\\Users\\SecretName测试用户\\AppData\\Local\\Temp\\nope" : "/home/SecretName测试用户/tmp/nope";
  const e = libError(t, { tmpDir: missing });
  assert.equal(e.code, "ENOENT");
  assert.ok(String(e.message).includes("SecretName"), "Node's own error names the folder: " + e.message);
  await expectSafe(host({ install: () => rpcError(e) }), "INSTALL_FAILED");
});

test("fallback: a throw nobody expected, before or during the download, is INSTALL_FAILED with no path", async () => {
  await expectSafe(host({ spec: () => { throw nodeError("EPERM", "EPERM: operation not permitted, open '" + WIN_HOME + "\\data.lock'"); } }), "INSTALL_FAILED");
  await expectSafe(host({ download: async () => { throw new Error("TypeError at " + POSIX_HOME + "/main.js:1"); } }), "INSTALL_FAILED");
  // the spec's own failure (the engine's error, with a path) is not handed on either
  await expectSafe(host({ spec: () => ({ ok: false, errorCode: "WORKER_EXITED", message: "worker died in " + WIN_HOME }) }), "INSTALL_FAILED");
});

test("fallback: any path-shaped words in a code are never handed on as the code", async () => {
  for (const code of [WIN_HOME, POSIX_HOME, "EPERM", "ENOENT", "NO_ARCHIVE", "NO_PINNED_BYTES", "constructor", "__proto__"]) {
    const e = nodeError(code, "failed: " + POSIX_HOME);
    const r = await expectSafe(host({ install: () => rpcError(e) }), "INSTALL_FAILED");
    assert.equal(r.error, JJ.INSTALL_FAILED.zh);
  }
});

test("codes the banner and retry rely on stay, each with a fixed sentence and no raw words", async () => {
  for (const code of ["SIZE_MISMATCH", "SHA256_MISMATCH", "BAD_ARCHIVE", "UNPACK_FAILED"]) {
    const e = nodeError(code, "check failed for " + WIN_HOME);
    const r = await expectSafe(host({ install: () => rpcError(e) }), code);
    assert.ok(r.error && !r.error.includes("check failed"), r.error);
  }
  const unsupported = await expectSafe(host({ spec: () => ({ ok: true, result: { supported: false, platform: "linux-x64" } }) }), "UNSUPPORTED_PLATFORM");
  assert.ok(!unsupported.error.includes("linux-x64"));
  await expectSafe(host({ download: async () => ({ ok: false, errorCode: "CANCELLED" }) }), "CANCELLED");
  // a Cindy that cannot download for plugins
  await expectSafe(host({ noDownloads: true }), "HOST_TOO_OLD");
});

test("every whitelisted code has JJ's sentence word for word, and nothing else is in the list", () => {
  const ctx = { cindy: { onHostMessage() {} }, BroadcastChannel: class { postMessage() {} }, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;globalThis.__E = FFMPEG_ERRORS;", ctx);
  assert.deepEqual(Object.keys(ctx.__E).sort(), [...WHITELIST].sort());
  for (const code of WHITELIST) {
    assert.equal(ctx.__E[code].zh, JJ[code].zh, code + " zh");
    assert.ok(JJ[code].en, code + " has JJ English");
    assert.equal(ctx.__E[code].en, JJ[code].en === null ? undefined : JJ[code].en, code + " en");
  }
});

test("the banner still reads DISK_FULL as 磁盘空间不够", () => {
  const B = require("../ffmpeg-banner.js");
  assert.equal(B.reasonOf("DISK_FULL"), "disk");
});
