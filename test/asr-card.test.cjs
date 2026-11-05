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
  assert.equal(Math.round(b / 1048576 / 10) * 10, 230);
  assert.equal(asrLine({ engine: true, model: true, modelBytes: b }), "已装好");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }), "还没装听写模型（约 230 MB）");
  assert.equal(asrLine({ engine: false, model: false, modelBytes: b }), "这台电脑上还没有听写程序");
  assert.equal(asrLine({ engine: true, model: true, modelBytes: b }, "en"), "Installed");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: b }, "en"), "Speech model not installed yet (about 230 MB)");
  assert.equal(asrLine({ engine: false, model: false, modelBytes: b }, "en"), "No transcription program on this computer yet");
});

test("the size follows the manifest's bytes, never a number written in the card", () => {
  const { asrLine } = load();
  assert.equal(asrLine({ engine: true, model: false, modelBytes: 300 * 1048576 }), "还没装听写模型（约 300 MB）");
  assert.equal(asrLine({ engine: true, model: false, modelBytes: 300 * 1048576 }, "en"), "Speech model not installed yet (about 300 MB)");
  assert.doesNotMatch(MAIN, /约 230 MB|about 230 MB/, "no size written by hand in main.js");
});

test("the worker reports the model's bytes from the engine's manifest", () => {
  const w = fs.readFileSync(path.join(ROOT, "node", "worker.cjs"), "utf8");
  assert.match(w, /modelBytes/);
  assert.match(w, /asr-manifest\.json/);
});
