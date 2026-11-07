"use strict";
/* MontClip-Cindy#19 (follow-up of #9): the sentence for an export that stopped partway — its renderer went away, it
   stopped reporting progress, or it failed after making progress — is JJ's final wording (2026-11-07, no change to the
   P11 draft), word for word in both languages, and no longer marked as a draft in main.js. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const MAIN = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

const JJ = {
  zh: "导出到一半停了，这次没导完。原片没有改动，可以再导一次：点〔重试〕。",
  en: "The export stopped partway and didn't finish. The original is unchanged; you can export again: click Retry.",
};

function load() {
  const cindy = { onHostMessage: () => { }, send: async () => ({ ok: true }), node: { request: async () => ({ ok: false }) } };
  class BroadcastChannel { constructor() { this.onmessage = null; } postMessage() { } }
  const ctx = { cindy, BroadcastChannel, console: { warn() { }, log() { }, error() { } }, setTimeout, clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL };
  vm.runInNewContext(MAIN + "\n;this.EXPORT_TEXT = EXPORT_TEXT; this.plainFailure = plainFailure;", ctx);
  return ctx;
}

test("the stopped sentence is JJ's final wording, Chinese and English, word for word", () => {
  const { EXPORT_TEXT } = load();
  assert.equal(EXPORT_TEXT.zh.failedWhy.stopped, JJ.zh);
  assert.equal(EXPORT_TEXT.en.failedWhy.stopped, JJ.en);
});

test("a renderer that went away halfway reads the stopped sentence", () => {
  const { plainFailure } = load();
  const r = plainFailure({ phase: "failed", stage: "job", progress: 0.4, reason: "the headless browser exited before the export finished" });
  assert.ok(r.error.startsWith(JJ.zh), r.error);
});

test("main.js no longer marks the stopped sentence as a draft waiting for JJ", () => {
  const lines = MAIN.split(/\r?\n/).filter((l) => /\bstopped\b/.test(l) || /P11 draft/.test(l));
  for (const l of lines) assert.doesNotMatch(l, /P11 draft|待 JJ 定稿|waiting for JJ/, l.trim().slice(0, 80));
});
