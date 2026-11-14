#!/usr/bin/env node
/* Copy the pinned engine/ checkout and plugin runtime into dist/montclip/.
   This generated directory is the only input to ghost_forge_pack. Run:
     node build.cjs */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const { execFileSync } = require("node:child_process");
const ROOT = path.join(__dirname, "engine");
const DIST = path.join(__dirname, "dist", "montclip");
const OUT = path.join(DIST, "node", "app");
const lock = require("./engine-lock.json");
const engineCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (engineCommit !== lock.commit) throw new Error("Engine differs from engine-lock.json; initialize the pinned submodule.");
execFileSync("git", ["-C", ROOT, "diff", "--exit-code", "HEAD"], { stdio: "pipe" });
const tracked = new Set(execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { encoding: "utf8" }).split("\0"));
// Delete only this build's staging directory; refuse redirected paths.
for (const dir of [path.dirname(DIST), DIST]) {
  if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) throw new Error("Refusing redirected build directory");
}
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const e of fs.readdirSync(__dirname, { withFileTypes: true })) {
  if (e.isFile() && (e.name === "ghost.json" || e.name === "LICENSE" || /\.(js|html|css)$/.test(e.name)))
    fs.copyFileSync(path.join(__dirname, e.name), path.join(DIST, e.name));
}
// One author-controlled switch gates both the visible tool and the logic page. No network probe.
const { applyAsrGate } = require('./tools/asr-build.cjs');
const gated = applyAsrGate(fs.readFileSync(path.join(DIST, 'main.js'), 'utf8'), JSON.parse(fs.readFileSync(path.join(DIST, 'ghost.json'), 'utf8')), require('./asr-download.json'));
fs.writeFileSync(path.join(DIST, 'main.js'), gated.main);
fs.writeFileSync(path.join(DIST, 'ghost.json'), JSON.stringify(gated.manifest, null, 2) + '\n');
for (const d of ["assets", "embed"]) fs.cpSync(path.join(__dirname, d), path.join(DIST, d), { recursive: true });
fs.mkdirSync(path.join(DIST, "node"), { recursive: true });
for (const f of ["worker.cjs", "lib.cjs", "asr-install.cjs", "asr-runtime.json"]) fs.copyFileSync(path.join(__dirname, "node", f), path.join(DIST, "node", f));
// The plugin's own commit too, so an installed package says exactly which MontClip-Cindy build it is (Deja, 2026-11-07:
// Europa's 0.5.1-preview.4 was an uncommitted author copy and its SOURCE.json named only the engine). `dirty` is true when
// tracked plugin files (outside engine/ and dist/) differ from that commit.
const pluginCommit = execFileSync("git", ["-C", __dirname, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const pluginDirty = execFileSync("git", ["-C", __dirname, "status", "--porcelain", "--untracked-files=no", "--", ".", ":(exclude)engine", ":(exclude)dist"], { encoding: "utf8" }).trim() !== "";
const plugin = { repository: "https://github.com/good-night-oppie/MontClip-Cindy.git", commit: pluginCommit, dirty: pluginDirty };
fs.writeFileSync(path.join(DIST, "SOURCE.json"), JSON.stringify({ plugin, engine: lock }, null, 2) + "\n");
// the engine and the editor page; dev tooling, tests, docs and the Electron shell stay out
const SKIP_FILES = new Set(["cli.js", "glama.json", "server.json", "package-lock.json"]);
const FILE_EXT = new Set([".js", ".html", ".css", ".json", ".svg", ".md"]);
const SKIP_MD = new Set(["CHANGELOG.md", "CODE_OF_CONDUCT.md", "CONTRIBUTING.md", "DEVELOPMENT.md", "SECURITY.md", "AGENTS.md", "README.md", "LICENSES.md"]);
const DIRS = ["server", "app", "icons", "library", "licenses"];
// the engine's server code lives in server/ since MontClip #281; its npm bin (cli.js) is not shipped, as before
// the editor page's own scripts live in app/ since MontClip #281 stage 2
const SKIP_TRACKED = new Set(["server/cli.js"]);


fs.mkdirSync(OUT, { recursive: true });
let files = 0, bytes = 0, codeFiles = 0;
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); files++; if (/\.js$/.test(to)) codeFiles++; bytes += fs.statSync(to).size; };
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isFile() || SKIP_FILES.has(e.name) || SKIP_MD.has(e.name) || e.name === "project.json") continue;
  if (!tracked.has(e.name)) continue;
  if (!FILE_EXT.has(path.extname(e.name))) continue;
  copy(path.join(ROOT, e.name), path.join(OUT, e.name));
}
copy(path.join(ROOT, "LICENSE"), path.join(OUT, "LICENSE"));
copy(path.join(ROOT, "LICENSES.md"), path.join(OUT, "LICENSES.md"));
const walk = (rel) => {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r);
    else if (tracked.has(r.replace(/\\/g, "/")) && !SKIP_TRACKED.has(r.replace(/\\/g, "/"))) copy(path.join(ROOT, r), path.join(OUT, r));
  }
};
for (const d of DIRS) walk(d);
// #281 A1.6: the engine used to be flat at its root, so a copy that reaches no code at all must stop the build
// instead of shipping an app that cannot start.
if (!codeFiles) throw new Error("the engine copy holds no .js files — the engine layout moved; build.cjs would ship an app that cannot start");

// the Windows app's pinned LGPL ffmpeg: its manifest and installer (the plugin downloads the same build)
for (const f of ["ffmpeg-manifest.json", "fetch-ffmpeg.cjs"]) copy(path.join(ROOT, "desktop", f), path.join(OUT, "desktop", f));
// the speech engine's manifest (asr-models.js reads it when the engine first answers /api/asr/*; without it that request
// took the whole worker down — P8) and the host's wording for the model download
for (const f of ["asr-manifest.json", "asr-text.js"]) copy(path.join(ROOT, "desktop", f), path.join(OUT, "desktop", f));
// the pages the plugin's own views frame (served by the engine's static route, same origin as the editor)
const EMBED = path.join(__dirname, "embed");
if (fs.existsSync(EMBED)) for (const f of fs.readdirSync(EMBED)) copy(path.join(EMBED, f), path.join(OUT, "cindy", f));
// the notices for the bundled assistant pane (cindy-official.js carries React, Radix and Cindy's Apache-2.0 parts);
// LICENSES.md links these files, so they ship with it. Its sources and build tools stay out.
for (const f of ["upstream/LICENSE", "upstream/NOTICE", "cindy-43001ea/LICENSE", "cindy-43001ea/NOTICE", "THIRD-PARTY-NOTICES.txt", "BUNDLED-LICENSES.json", "BUNDLED-PACKAGES.json", "SOURCES.json"]) {
  const rel = "agent-ui/" + f;
  if (!tracked.has(rel)) throw new Error("the engine does not track " + rel);
  copy(path.join(ROOT, rel), path.join(OUT, rel));
}
walk("agent-ui/licenses");
for (const d of ["media", "exports"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });
console.log(`dist/montclip/node/app: ${files} files, ${(bytes / 1e6).toFixed(1)} MB from ${ROOT}`);
