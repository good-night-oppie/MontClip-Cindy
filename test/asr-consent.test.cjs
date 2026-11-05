"use strict";
/* JJ's final words for the first-use download (2026-11-05, through Deja), word for word.

   The confirm box (cindy.confirm): JJ's four lines, {N} by aboutMb from what this computer still needs, the real file
   host (a GitHub release download answers 302 to release-assets.githubusercontent.com — measured 2026-11-05 from this
   computer and from europa — the host ghost.json declares). cindy.confirm takes plain text only (no link, no
   expandable part; plugin manual §4.18), so 「详见〔许可详情〕」 goes and the whole licence line of the draft is the last
   line, as JJ said for that case. The host keeps 300 characters of the body and 12 of a button.

   The status card: its button, and what the card says after it — installed, 〔先不下〕, a Cindy too old to ask, a
   failure. A failure's code is for the agent and for the 「给开发者看（不用管）」 line of a later copy, never on the
   card. Button names in the sentences come from the same key as the button. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), os = require("node:os");
const ROOT = path.join(__dirname, "..");
const MAIN = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
const RT = JSON.parse(fs.readFileSync(path.join(ROOT, "node", "asr-runtime.json"), "utf8"));
const about = require("../node/lib.cjs").aboutMbFrom(path.join(ROOT, "engine"));
const itemsFor = (p) => RT.items.filter((i) => i.platforms.includes(p));
const bytesOf = (items) => items.reduce((n, i) => n + i.bytes, 0);
const HOST = "release-assets.githubusercontent.com";

const JJ = {
  zh: {
    body: (n, host) => `要把说的话转成文字，先要下载听写程序和中文听写模型，共约 ${n} MB，只下这一次。\n` +
      `从哪下：GitHub 上 MontClip 的发布页（github.com，下载时会转到 ${host}）。\n` +
      "只下载这些文件，不会发出你的录像、字幕或项目。下载完会逐个核对，对不上就不装。\n" +
      "许可：sherpa-onnx（Apache-2.0，内含 ONNX Runtime，MIT）、silero VAD（MIT）、Paraformer 中文模型（Apache-2.0）。",
    yes: (n) => `下载（约 ${n} MB）`, no: "先不下",
    button: "下载听写程序和模型…",
    installed: "听写程序和模型装好了，现在可以把说的话转成文字。",
    declined: "没有下载。以后要用，再点〔下载听写程序和模型…〕就行。",
    tooOld: "Cindy 版本太旧，没法先问你再下载，所以没有下载。把 Cindy 更新到最新版以后，再点一次。",
    failed: "这次没装上，下了一半的文件已经清掉了。再点一次试试。",
    failedMore: "还不行，点〔复制问题信息〕发给我们。",
    dev: "给开发者看（不用管）",
  },
  en: {
    // JJ's shorter English (2026-11-05), within the host's 300 characters
    body: (n, host) => `Speech-to-text needs a one-time download (program + Chinese model, about ${n} MB).\n` +
      `From: github.com, via ${host}.\n` +
      "Your videos, captions and projects are never sent. Files are checked first.\n" +
      "Licences: sherpa-onnx, ONNX Runtime, silero VAD, Paraformer (Apache-2.0/MIT).",
    yes: (n) => `Download (about ${n} MB)`, no: "Not now",
    button: "Download transcription program and model…",
    installed: "The transcription program and model are installed. You can now turn speech into text.",
    declined: "Nothing was downloaded. To use it later, click “Download transcription program and model…”.",
    tooOld: "This version of Cindy is too old to ask you first, so nothing was downloaded. Update Cindy to the latest version, then click again.",
    failed: "It didn't install this time, and the partly downloaded files were removed. Try again.",
    failedMore: "If it still fails, click “Copy problem details” and send it to us.",
    dev: "For developers (you can ignore this)",
  },
};

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN, ctx);
  return ctx;
}
const GHOST = JSON.parse(fs.readFileSync(path.join(ROOT, "ghost.json"), "utf8"));
const fileHostOf = () => require("../node/lib.cjs").fileHostFrom(GHOST);
const spec = (platform, items = itemsFor(platform), mb = about(bytesOf(items))) => ({ supported: true, platform, release: RT.release, fileHost: fileHostOf(),
  missing: items.map((i) => ({ ...i, url: RT.base + i.name })), bytes: bytesOf(items), mb });
/** Characters as wc -m counts them: Unicode code points, not UTF-16 units. */
const chars = (t) => [...t].length;

test("the real file host: the one ghost.json declares besides github.com — what a release download redirects to — is the one both boxes name", () => {
  assert.deepEqual(GHOST.network.hosts.slice().sort(), ["github.com", HOST].sort(), "measured: github.com/…/releases/download/… → 302 → " + HOST);
  assert.equal(fileHostOf(), HOST, "taken from ghost.json, not written by hand");
  assert.ok(!("fileHost" in RT), "one place for it: ghost.json");
  const w = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");
  assert.match(w, /fileHostFrom\(/, "the worker hands the box ghost.json's host");
});

test("the confirm box: JJ's words with everything missing, Chinese and English; N by aboutMb", () => {
  const { asrConsent } = load();
  for (const platform of ["linux-x64", "win32-x64"]) {
    const s = spec(platform), n = about(s.bytes);
    for (const lang of ["zh", "en"]) {
      const c = asrConsent(s, lang);
      assert.equal(c.body, JJ[lang].body(n, HOST), `${platform} ${lang}`);
      assert.equal(c.confirmText, JJ[lang].yes(n)); assert.equal(c.cancelText, JJ[lang].no);
    }
  }
  assert.equal(about(bytesOf(itemsFor("linux-x64"))), 260); assert.equal(about(bytesOf(itemsFor("win32-x64"))), 250);
});

test("the host's 300 characters: both boxes fit with everything missing, and with N = 9999 (counted as wc -m does)", () => {
  const { asrConsent } = load();
  for (const platform of ["linux-x64", "win32-x64"]) for (const lang of ["zh", "en"]) for (const mb of [about(bytesOf(itemsFor(platform))), 9999]) {
    const c = asrConsent(spec(platform, itemsFor(platform), mb), lang);
    assert.ok(chars(c.body) <= 300, `${platform} ${lang} N=${mb}: ${chars(c.body)} characters`);
  }
});

test("the host's 12 characters for a button: the Chinese buttons fit", () => {
  const { asrConsent } = load();
  for (const platform of ["linux-x64", "win32-x64"]) {
    const c = asrConsent(spec(platform), "zh");
    assert.ok(chars(c.confirmText) <= 12 && chars(c.cancelText) <= 12, `${platform}: ${c.confirmText} / ${c.cancelText}`);
  }
});

test("the host's 12 characters for the English 〔Download (about N MB)〕 (the plugin's pages are Chinese for now)", { todo: "23 characters: JJ to shorten the English button — MontClip-Cindy#8" }, () => {
  const { asrConsent } = load();
  const c = asrConsent(spec("linux-x64"), "en");
  assert.ok(chars(c.confirmText) <= 12, `${chars(c.confirmText)} characters: ${c.confirmText}`);
});

test("the status card's words after its button, and the button's own name from the same key", () => {
  const { ASR_TEXT, asrResultText } = load();
  for (const lang of ["zh", "en"]) {
    const j = JJ[lang], t = ASR_TEXT[lang];
    assert.equal(t.button, j.button);
    assert.equal(asrResultText({ installed: true }, lang), j.installed);
    assert.equal(asrResultText({ declined: true }, lang), j.declined);
    assert.ok(j.declined.includes(t.button), "the sentence names the button by its key");
    assert.equal(asrResultText({ error: "x", code: "HOST_TOO_OLD" }, lang), j.tooOld);
    assert.equal(asrResultText({ error: "x", code: "DOWNLOAD_FAILED" }, lang), j.failed, "no 〔复制问题信息〕 yet: the card has no such button");
    assert.equal(t.failedMore, j.failedMore, "kept apart for when the card has that button");
    assert.equal(t.dev, j.dev);
  }
  const { statusCard } = load();
  assert.ok(statusCard({ ffmpeg: "downloaded", project: "p", asr: { engine: false, model: false, modelMb: 240 } }, true).includes(">" + JJ.zh.button + "</button>"));
});

/* the whole path against a fake host, from the card's button */
function host({ answer = true, confirm = true, failDownloadAt = -1, installCode = null } = {}) {
  const items = itemsFor("linux-x64"), starts = [], installs = [], cards = [], cancelled = [];
  let listener = null;
  const cindy = {
    onHostMessage: (fn) => { listener = fn; },
    send: async (m) => { if (m.type === "card-update") cards.push(m); return { ok: true }; },
    downloads: {
      async start(p) { starts.push(p); if (starts.length - 1 === failDownloadAt) return { ok: false, message: "connection reset" }; return { ok: true, token: "tok-" + p.id, bytes: p.bytes, sha256: p.sha256 }; },
      async cancel(p) { cancelled.push(p.id); return { ok: true }; },
    },
    node: {
      async request(r) {
        if (r.method === "montclip/asr-spec") return { ok: true, result: spec("linux-x64", items) };
        if (r.method === "montclip/asr-install") {
          installs.push(r);
          return installCode ? { ok: false, errorCode: "PROTOCOL_ERROR", message: "C:\\Users\\name\\MontClip-Cindy\\asr: " + installCode, data: { code: installCode } } : { ok: true, result: { installed: r.params.names, missing: [] } };
        }
        return { ok: false, errorCode: "NO", message: r.method };
      },
    },
  };
  if (confirm) cindy.confirm = async () => ({ ok: true, confirmed: answer });
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { ...console, warn: () => { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN, ctx);
  const click = async () => { await listener({ type: "event", name: "card-action", actionId: "install-asr", callId: "k1", sessionId: "s1" }); return cards[cards.length - 1].html; };
  const tool = () => new Promise((resolve) => {
    const prev = cindy.send;
    cindy.send = async (m) => { if (m.type === "tool-result" && m.callId === "t1") resolve(m.result); return prev(m); };
    listener({ type: "tool-call", tool: "montclip_install_asr", callId: "t1", args: {} });
  });
  return { ctx, starts, installs, cancelled, click, tool };
}

test("the card after 〔下载听写程序和模型…〕: installed, 〔先不下〕, too old — JJ's words", async () => {
  assert.ok((await host({ answer: true }).click()).includes(JJ.zh.installed));
  const no = host({ answer: false });
  assert.ok((await no.click()).includes(JJ.zh.declined)); assert.equal(no.starts.length, 0);
  const old = host({ confirm: false });
  assert.ok((await old.click()).includes(JJ.zh.tooOld)); assert.equal(old.starts.length, 0);
});

test("a download that stops half-way: nothing is handed to the worker, the card says so without its code; the agent and the copy line get it", async () => {
  const h = host({ failDownloadAt: 1 });
  const html = await h.click();
  assert.ok(html.includes(JJ.zh.failed), html);
  assert.ok(!/DOWNLOAD_FAILED|connection reset|代码/.test(html), "no code on the card: " + html);
  assert.equal(h.installs.length, 0, "nothing reached the data folder");
  const r = await host({ failDownloadAt: 1 }).tool();
  assert.equal(r.code, "DOWNLOAD_FAILED");
  const copy = h.ctx.asrCopyText(h.ctx.asrLastProblem());
  assert.ok(copy.startsWith(JJ.zh.failed), copy);
  assert.ok(copy.includes(JJ.zh.dev) && copy.includes("DOWNLOAD_FAILED"), copy);
});

test("an install the worker refuses: the card has no code and no path; the code is the agent's", async () => {
  const h = host({ installCode: "SHA256_MISMATCH" });
  const html = await h.click();
  assert.ok(html.includes(JJ.zh.failed) && !/SHA256_MISMATCH|Users|MontClip-Cindy/.test(html), html);
  assert.equal((await host({ installCode: "SHA256_MISMATCH" }).tool()).code, "SHA256_MISMATCH");
});

test("「下了一半的文件已经清掉了」: a half-downloaded file handed to the worker leaves nothing in the data folder or the staging folder", (t) => {
  const { installAsr } = require("../node/asr-install.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-half-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const data = path.join(dir, "data"); fs.mkdirSync(data);
  const body = Buffer.from("a whole file of model bytes");
  const crypto = require("node:crypto");
  const runtime = { release: "t", base: "https://github.com/x/", items: [{ name: "m.onnx", kind: "file", into: "asr-models/asr/model.int8.onnx", platforms: ["linux-x64"], bytes: body.length, sha256: crypto.createHash("sha256").update(body).digest("hex") }] };
  const half = path.join(dir, "half.onnx"); fs.writeFileSync(half, body.subarray(0, body.length >> 1));
  assert.throws(() => installAsr({ runtime, platform: "linux-x64", data, files: { "m.onnx": half }, tmpDir: data }), (e) => e.code === "SIZE_MISMATCH");
  assert.deepEqual(fs.readdirSync(data), [], "nothing in the data folder (it is also the staging folder's parent)");
});
