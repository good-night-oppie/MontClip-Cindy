"use strict";
// ghost.json's releaseNotes must not name an engine commit: the engine is pinned in engine-lock.json and written
// into SOURCE.json at build time, and a hand-written commit goes stale (0.5.1 said 6f537e49 while the lock pinned
// 5b312e63 — Deja, 2026-11-07).
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");

test("releaseNotes names no commit (the engine version lives in engine-lock.json / SOURCE.json)", () => {
  const { releaseNotes = "" } = JSON.parse(fs.readFileSync(path.join(ROOT, "ghost.json"), "utf8"));
  assert.doesNotMatch(releaseNotes, /\b[0-9a-f]{7,40}\b/i, "releaseNotes contains something that looks like a commit");
});
test("the engine commit in the packed SOURCE.json comes from engine-lock.json", () => {
  const lock = require(path.join(ROOT, "engine-lock.json"));
  const src = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "montclip", "SOURCE.json"), "utf8"));
  assert.equal(src.engine.commit, lock.commit);
});
