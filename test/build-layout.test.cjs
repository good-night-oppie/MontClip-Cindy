"use strict";
// MontClip #281 A1.6: build.cjs copies the engine by file extension from its root and from a few directories, and
// silently copies nothing when the code has moved somewhere it does not look. With the engine\x27s server code in
// server/ (MontClip #298) the old flat-only list reached 0 .js files: the package would have shipped an app that
// cannot start, and the build would still have printed success. An engine with no code must now stop the build.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync, execFileSync } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const commitAll = (cwd, message) => {
  git(cwd, "init", "-q");
  git(cwd, "add", "-A");
  git(cwd, "-c", "user.email=build@example.com", "-c", "user.name=build", "commit", "-qm", message);
  return git(cwd, "rev-parse", "HEAD");
};

test("an engine with no code stops the build instead of shipping an empty app", { timeout: 180000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cindy-empty-engine-"));
  try {
    // the plugin files build.cjs reads before it reaches the engine copy
    for (const f of fs.readdirSync(ROOT, { withFileTypes: true })) {
      if (f.isFile() && (f.name === "ghost.json" || f.name === "LICENSE" || /\.(js|cjs|html|css)$/.test(f.name)))
        fs.copyFileSync(path.join(ROOT, f.name), path.join(dir, f.name));
    }
    for (const d of ["tools", "node", "assets", "embed"]) if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dir, d), { recursive: true });
    fs.copyFileSync(path.join(ROOT, "asr-download.json"), path.join(dir, "asr-download.json"));
    // an engine whose only tracked files are pages and licences: no .js at all
    const engine = path.join(dir, "engine");
    fs.mkdirSync(engine, { recursive: true });
    fs.writeFileSync(path.join(engine, "README.md"), "# empty engine\n");
    fs.writeFileSync(path.join(engine, "LICENSE"), "MIT\n");
    fs.writeFileSync(path.join(engine, "LICENSES.md"), "# licences\n");
    const sha = commitAll(engine, "empty engine");
    fs.writeFileSync(path.join(dir, "engine-lock.json"), JSON.stringify({ repository: "https://github.com/good-night-oppie/MontClip.git", commit: sha }, null, 2) + "\n");
    commitAll(dir, "empty engine fixture");

    const r = spawnSync(process.execPath, ["build.cjs"], { cwd: dir, encoding: "utf8" });
    assert.notEqual(r.status, 0, "the build must fail, not print success");
    assert.match(String(r.stderr), /no \.js files/, "the failure must say the copy reached no code: " + String(r.stderr).slice(0, 400));
    const staged = path.join(dir, "dist", "montclip", "node", "app");
    const stray = fs.existsSync(staged) ? fs.readdirSync(staged).filter((n) => /\.js$/.test(n)) : [];
    assert.deepEqual(stray, [], "no half-made app code is left behind");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the real engine copy keeps the server code (#298 layout)", () => {
  const app = path.join(ROOT, "dist", "montclip", "node", "app");
  if (!fs.existsSync(app)) return; // build.cjs runs before the tests in `npm test`; a bare `node --test` may not have it
  for (const f of ["server/server.js", "server/mcp-server.js", "server/export-jobs.js", "server/tool-tasks.js", "server/paths.js"])
    assert.ok(fs.existsSync(path.join(app, f)), f + " is in the package");
  assert.equal(fs.existsSync(path.join(app, "server", "cli.js")), false, "the npm bin is not shipped");
});
