/* MontClip inside Cindy — the plugin's Node worker (JSON-RPC over stdio, one message per line).

   It runs the MontClip engine itself, in this process: app/server.js (the editor's HTTP server on 127.0.0.1,
   which the plugin's task view frames) and app/mcp-server.js's fablecut_* tools, called in-process. Nothing
   here re-implements editing: every change goes through the engine's own tools and its one project /
   revision / undo chain. app/ is a copy of the repository root made by build.cjs; never edit it.

   stdout carries protocol messages only, so console output goes to stderr before the engine loads. */
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const { fillWindowsEnv, newToken, createBinder, flatten, ffmpegSpec, installFfmpeg, unpackCode, zipUnpackedBytes, freeBytes, spaceNeeded,
  exportFiles, deliverFiles, openFolder, rememberFolder, folderOfJob, aboutMbFrom, asrModelMb } = require("./lib.cjs");

for (const k of ["log", "info", "debug", "warn", "error"]) console[k] = (...a) => process.stderr.write(a.map(String).join(" ") + "\n");

const APP = path.resolve(process.env.MONTCLIP_CINDY_APP || path.join(__dirname, "app"));
// the plugin's work lives in the user's home, never inside the plugin (an update replaces the plugin folder)
const DATA = path.resolve(process.env.MONTCLIP_CINDY_DATA || path.join(os.homedir(), "MontClip-Cindy"));
const FOLDERS_FILE = path.join(DATA, "cindy-export-folders.json");   // which folder each export went into (打开文件夹)
const RESULTS_FILE = path.join(DATA, "cindy-export-results.json");
// Last 200 completed results survive the engine's one-hour in-memory job retention.
function savedResults() {
  try { const data = JSON.parse(fs.readFileSync(RESULTS_FILE, "utf8")); return Array.isArray(data) ? data : []; }
  catch (e) { if (e.code !== "ENOENT") note({event:"export-results-unreadable", code:e.code || "INVALID_JSON"}); return []; }
}
function keepResult(job) {
  if (job.status !== "done" || !job.id) return;
  const entries = savedResults().filter(x => x && x.id !== job.id);
  entries.push(job);
  const temp = RESULTS_FILE + "." + newToken() + ".part";
  try { fs.writeFileSync(temp, JSON.stringify(entries.slice(-200)), {flag:"wx"}); fs.renameSync(temp, RESULTS_FILE); }
  finally { fs.rmSync(temp, {force:true}); }
}
async function exportJob(id) {
  const r = await api("GET", "/api/export/job?id=" + encodeURIComponent(String(id || "")));
  if (r.status === 200) {
    if (r.body.status === "done") try { keepResult(r.body); } catch (e) { note({event:"export-result-not-kept",id:r.body.id,code:e.code}); }
    return r.body;
  }
  if (r.status === 404) {
    const saved = savedResults().find(x => x && x.id === id && x.status === "done");
    if (saved) return saved;
    throw Object.assign(new Error("no such export job"), {code:"NO_JOB"});
  }
  throw Object.assign(new Error("could not read export job"), {code:"NODE_REQUEST_FAILED"});
}
const endedNoted = new Set();   // export jobs whose end without a file is already in the log
const PLATFORM = `${process.platform}-${process.arch}`;
const FFMPEG_DIR = path.join(DATA, "ffmpeg", PLATFORM);
/* On-device transcription (P8): the engine (sherpa-onnx-node and its native part for this system) and the VAD go in
   DATA/asr, the speech models in DATA/asr-models — the data folder, which a plugin update never replaces. The plugin
   does not fetch them; until they are there the engine says so (ASR_ENGINE_MISSING / ASR_MODEL_MISSING). */
const ASR_DIR = path.join(DATA, "asr"), ASR_MODELS_DIR = path.join(DATA, "asr-models");
const ASR_NATIVE = "sherpa-onnx-" + (process.platform === "win32" ? "win" : process.platform) + "-" + process.arch;
// the Windows app's own pinned-build manifest and installer (build.cjs copies them in)
const fetchFfmpeg = () => require(path.join(APP, "desktop", "fetch-ffmpeg.cjs"));
const ffmpegManifest = () => require(path.join(APP, "desktop", "ffmpeg-manifest.json"));
/** "downloaded" (the pinned build, unchanged since it was installed) · "changed" · "missing" */
function ffmpegState() {
  if (!fs.existsSync(FFMPEG_DIR)) return "missing";
  const spec = ffmpegSpec(ffmpegManifest(), PLATFORM);
  if (!spec.supported) return "missing";
  return fetchFfmpeg().upToDate(FFMPEG_DIR, spec, { win: process.platform === "win32" }).ok ? "downloaded" : "changed";
}

const reply = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const note = (entry) => process.stderr.write("[montclip] " + JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");


let started = null, starting = null;   // the running engine: {origin, port, token, tools, callTool, …}
function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(started.origin + urlPath, { method, headers: { "Content-Type": "application/json", "X-MontClip-Session": started.token } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { data += d; });
      res.on("end", () => { let j = null; try { j = JSON.parse(data); } catch { j = { raw: data }; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("the MontClip engine did not answer")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function boot() {
  fs.mkdirSync(DATA, { recursive: true });
  const envFilled = fillWindowsEnv(process.env);
  const port = 0;
  const token = newToken();
  Object.assign(process.env, {
    PORT: String(port), FABLECUT_PORT: String(port), HOST: "127.0.0.1",
    FABLECUT_DATA_DIR: DATA,
    MONTCLIP_HOST: "cindy", MONTCLIP_EMBED_TOKEN: token, MONTCLIP_SHELL: "cindy",
    FABLECUT_NO_AUTOSTART: "1",   // the engine is this process: mcp-server must never spawn a second one
    // only the pinned LGPL build fetched into the data folder (montclip_install_ffmpeg); never one from PATH
    MONTCLIP_FFMPEG_PACKAGED: "1", MONTCLIP_FFMPEG_DIR: FFMPEG_DIR,
    MONTCLIP_FFMPEG_REMEDY: "In Cindy, install it from the MontClip editor tab's banner, or ask the chat to run montclip_install_ffmpeg.",
    MONTCLIP_ASR_DIR: ASR_DIR, MONTCLIP_ASR_MODELS_DIR: ASR_MODELS_DIR,
  });
  const ready = await new Promise((resolve, reject) => {
    const onReady = (message) => { clearTimeout(timer); resolve(message); };
    const timer = setTimeout(() => { process.removeListener("montclip-ready", onReady); reject(new Error("the MontClip engine did not report readiness")); }, 10000);
    process.once("montclip-ready", onReady);
    try { require(path.join(APP, "server.js")); }
    catch (e) { clearTimeout(timer); process.removeListener("montclip-ready", onReady); reject(e); }
  });
  const endpoint = new URL(ready.origin);
  if (endpoint.protocol !== "http:" || endpoint.hostname !== "127.0.0.1" || !Number(endpoint.port)) throw new Error("invalid engine readiness origin");
  process.env.FABLECUT_PORT = endpoint.port;
  started = { origin: ready.origin, port: Number(endpoint.port), token };
  const mcp = require(path.join(APP, "mcp-server.js"));
  const browser = require(path.join(APP, "export-jobs.js")).findBrowser() || null;
  Object.assign(started, { tools: mcp.TOOLS, callTool: mcp.callTool, envFilled, browser, ffmpeg: ffmpegState() });
  // names only, never values
  note({ event: "engine-started", origin: started.origin, node: process.version, envFilled, browser: !!browser, ffmpeg: started.ffmpeg });
  return started;
}
function start() {
  if (started && started.tools) return Promise.resolve(started);
  if (!starting) starting = boot().catch((e) => { starting = null; started = null; throw e; });
  return starting;
}

const binder = createBinder({ file: path.join(DATA, "sessions.json"), api: (...a) => api(...a) });

const METHODS = {
  async "montclip/start"() {
    const s = await start();
    return { origin: s.origin, url: `${s.origin}/?host=cindy&token=${s.token}`, ffmpeg: s.ffmpeg, node: process.version,
      dataDir: DATA, browser: !!s.browser, envFilled: s.envFilled };
  },
  async "montclip/tools"() {
    const s = await start();
    return { tools: s.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  },
  async "montclip/call"(p) {
    const s = await start();
    const name = String(p.name || "");
    if (!s.tools.some((t) => t.name === name)) throw Object.assign(new Error("no such MontClip tool: " + name), { code: -32602 });
    const t0 = Date.now();
    const out = await s.callTool(name, p.arguments && typeof p.arguments === "object" ? p.arguments : {});
    note({ event: "tool", name, ms: Date.now() - t0 });
    return flatten(out, path.join(DATA, "frames"));
  },
  /* undo / redo / seek / state run in the open editor tab (POST /api/ui/command) */
  async "montclip/ui"(p) {
    await start();
    if (!["undo", "redo", "seek", "state"].includes(p.cmd)) throw Object.assign(new Error("cmd must be undo, redo, seek or state"), { code: -32602 });
    const r = await api("POST", "/api/ui/command", { cmd: p.cmd, t: p.t, session: p.session, project: p.project });
    return { status: r.status, ...r.body };
  },
  /* Whether transcription can run here: the engine (with its native part for this system and the VAD) and the speech
     model, as the engine sees them, and where they go. */
  async "montclip/asr-status"() {
    await start();
    const r = await api("GET", "/api/asr/status");
    const b = r.status === 200 && r.body ? r.body : {};
    const ready = (x) => !!(x && x.ready);
    const native = fs.existsSync(path.join(ASR_DIR, "engine", "node_modules", ASR_NATIVE, "package.json"));
    // the speech model's size, for the card's 「约 … MB」: the Paraformer files' bytes in the engine's desktop/asr-manifest.json,
    // through the engine's own aboutMb (lib.cjs aboutMbFrom)
    let modelMb = null;
    try { modelMb = asrModelMb(JSON.parse(fs.readFileSync(path.join(APP, "desktop", "asr-manifest.json"), "utf8")), aboutMbFrom(APP)); } catch { }
    return { engine: ready(b.engine) && ready(b.vad) && native, model: ready(b.asr), punct: ready(b.punct), native: ASR_NATIVE, modelMb,
      engineDir: ASR_DIR, modelsDir: ASR_MODELS_DIR, missing: (b.asr && b.asr.missing) || [] };
  },
  /* ffmpeg for export and noise reduction: what to fetch (main.js downloads it with cindy.downloads) … */
  async "montclip/ffmpeg-spec"() {
    const spec = ffmpegSpec(ffmpegManifest(), PLATFORM);
    return { ...spec, state: ffmpegState(), running: started ? started.ffmpeg : null };
  },
  /* … and installing what was downloaded: params.downloads.archive is the host's file, read before this request
     ends. The engine read its ffmpeg when it loaded, so a running one restarts (the next request starts it again;
     the editor tab follows the new address and keeps its undo history). */
  async "montclip/ffmpeg-install"(p) {
    const spec = ffmpegSpec(ffmpegManifest(), PLATFORM);
    if (!spec.supported) throw Object.assign(new Error("there is no pinned ffmpeg build for " + PLATFORM), { code: "UNSUPPORTED_PLATFORM" });
    const F = fetchFfmpeg();
    const tar = process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "/usr/bin/tar";
    const archive = p.downloads && p.downloads.archive;
    let out;
    try {
      out = installFfmpeg({
      archive, spec, dest: FFMPEG_DIR, win: process.platform === "win32", tmpDir: os.tmpdir(),
      sha256: F.sha256, installTree: F.installTree, check: F.checkLgpl, manifest: ffmpegManifest(),
      extract: (archive, dir) => {
        const t = spawnSync(tar, ["-xf", archive, "-C", dir], { encoding: "utf8", windowsHide: true });
        if (t.status !== 0) throw Object.assign(new Error("unpacking failed: " + (t.stderr || t.error)), { code: unpackCode(t.stderr || String(t.error)) });
      },
      });
    } catch (e) {
      // 磁盘空间不够: how much to free, on the drive that ran out (a copy names it; tar unpacks into the temp folder)
      if (e && e.code === "ENOSPC") {
        let archiveBytes = 0; try { archiveBytes = fs.statSync(archive).size; } catch { }
        e.need = spaceNeeded({ archiveBytes, unpackedBytes: zipUnpackedBytes(archive), free: freeBytes(e.dest || e.path ? path.dirname(e.dest || e.path) : os.tmpdir()) });
      }
      throw e;
    }
    note({ event: "ffmpeg-installed", version: out.version });
    const restarting = !!started;
    if (restarting) setTimeout(stopEngine, 300);
    return { ...out, state: ffmpegState(), restarting };
  },
  /* Export (main.js montclip_export): start a job in the engine (the open editor tab, else headless), report it, and
     copy what it made into the folder the user picked. */
  async "montclip/export-start"(p) {
    await start();
    // Another task's editor cannot take this ticket. Auto falls back to headless when ours is absent.
    if (p.session && (!p.where || p.where === "auto")) {
      const editor = await api("POST", "/api/ui/command", { cmd:"state", session:p.session, project:p.project });
      p.where = editor.status === 200 ? "tab" : "headless";
    }
    const body = { project: p.project, session: p.session, range: p.range, preset: p.preset, profile: p.profile, delivery: p.delivery, outputs: p.outputs, where: p.where || "auto" };
    const r = await api("POST", "/api/export/request", body);
    if (r.status !== 200) throw Object.assign(new Error((r.body && r.body.error) || `export request failed (${r.status})`), { code: (r.body && r.body.code) || "EXPORT_REFUSED" });
    if (p.dir) try { rememberFolder(FOLDERS_FILE, String(r.body.id), String(p.dir)); } catch (e) { note({event:"folders-not-kept",code:e.code}); }
    return r.body;
  },
  async "montclip/export-job"(p) {
    await start();
    const r = {body: await exportJob(String(p.id || ""))};
    // why an export ended without its file goes to Cindy's log once (P11: the reason was nowhere to be found afterwards)
    if ((r.body.status === "failed" || r.body.status === "cancelled") && !endedNoted.has(r.body.id)) {
      endedNoted.add(r.body.id);
      note({ event: "export-" + r.body.status, id: r.body.id, via: r.body.via, progress: r.body.progress,
        error: String(r.body.error || "").split(os.homedir()).join("~").slice(0, 300) });
    }
    return r.body;
  },
  async "montclip/export-cancel"(p) {
    await start();
    const r = await api("POST", "/api/export/job/cancel?id=" + encodeURIComponent(String(p.id || "")));
    if (r.status !== 200) throw Object.assign(new Error((r.body && r.body.error) || "no such export job"), { code: "NO_JOB" });
    return r.body;
  },
  async "montclip/export-deliver"(p) {
    await start();
    const r = {body: await exportJob(String(p.id || ""))};
    if (r.body.status !== "done") throw Object.assign(new Error("the export is not finished"), {code:"NOT_DONE"});
    const files = exportFiles(r.body, path.join(DATA, "exports"));
    if (!files.length) throw Object.assign(new Error("the export made no file"), { code: "NO_FILE" });
    let sent = 0, last = 0;
    const out = await deliverFiles(files, String(p.dir || ""), (n) => {
      sent += n;
      if (Date.now() - last > 1000) { last = Date.now(); note({ event: "export-copy", bytes: sent }); }   // activity keeps the request alive
    });
    note({ event: "export-delivered", files: out.length });
    try { rememberFolder(FOLDERS_FILE, String(p.id), String(p.dir)); } catch (e) { note({ event: "folders-not-kept", error: String(e.message) }); }
    return { files: out };
  },
  /* The main view's overview, across tasks: every project (and the task it belongs to), and what was exported. */
  async "montclip/overview"() {
    await start();
    const list = (await api("GET", "/api/projects")).body || {};
    const byProject = {};
    for (const [session, id] of Object.entries(binder.map())) byProject[id] = session;
    const projects = (list.projects || []).map((x) => ({ id: x.id, name: x.name, active: !!x.active, modified: x.modified || null,
      duration: x.duration ?? null, clips: x.clips ?? null, task: byProject[x.id] || null }));
    const dir = path.join(DATA, "exports");
    let exports = [];
    try {
      exports = fs.readdirSync(dir).filter((f) => !f.startsWith(".") && !f.endsWith(".part")).map((f) => {
        const st = fs.statSync(path.join(dir, f));
        return st.isFile() ? { name: f, bytes: st.size, modified: st.mtime.toISOString() } : null;
      }).filter(Boolean).sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 50);
    } catch { }
    return { projects, exports, ffmpeg: started.ffmpeg, dataDir: DATA };
  },
  /* 打开文件夹 / 打开导出文件夹: {folder:"exports"} opens MontClip's exports folder, {job} the folder that export went
     into. The allow-list is those two folders and nothing else: no request can name a path. */
  async "montclip/open-folder"(p) {
    const exportsDir = path.join(DATA, "exports");
    fs.mkdirSync(exportsDir, { recursive: true });
    const picked = p.job != null ? folderOfJob(FOLDERS_FILE, p.job) : null;
    const target = p.folder === "exports" && p.job == null ? exportsDir : picked;
    if (!target) throw Object.assign(new Error("only the exports folder or the folder an export went into can be opened"), { code: "FOLDER_NOT_ALLOWED" });
    return openFolder(target, { allowed: [exportsDir, ...(picked ? [picked] : [])], spawn });
  },
  async "montclip/bind"(p) {
    await start();
    const b = await binder.bind(p.session);
    const proj = (await api("GET", "/api/project")).body || {};
    const out = { ...b, name: proj.name, revision: proj.revision, clips: (proj.clips || []).length };
    note({ event: "bind", ...out });
    return out;
  },
};

// Bind and operate in one queue: async readline listeners otherwise interleave at every await.
let taskOperations = Promise.resolve();
function dispatch(method, params) {
  const run = async () => {
    const p = { ...params };
    if (p.session && ['montclip/call', 'montclip/ui', 'montclip/export-start'].includes(method)) {
      await start();
      if (method === 'montclip/export-start' && p.expectedProject) {
        const active = (await api('GET', '/api/projects')).body.active;
        if (binder.map()[p.session] !== p.expectedProject || active !== p.expectedProject)
          throw Object.assign(new Error('The task project changed while choosing a folder.'), { code:'EXPORT_PROJECT_CHANGED' });
      }
      p.project = (await binder.bind(p.session)).project;
    }
    return METHODS[method](p);
  };
  if (!['montclip/bind', 'montclip/call', 'montclip/ui', 'montclip/export-start'].includes(method)) return run();
  const result = taskOperations.then(run);
  taskOperations = result.catch(() => {});
  return result;
}

/* Leaving (Cindy closed our stdin, or ffmpeg was just installed): the engine's own shutdown runs first — it stops the
   ffmpeg each running export spawned (stdin closed, then killed by its handle) and deletes the half-finished files,
   then exits within ~4 s (server.js shutdown). P11: an export's ffmpeg must never outlive the worker. */
let leaving = false;
function stopEngine() {
  if (leaving) return;
  leaving = true;
  note({ event: "worker-stopping", engine: !!started });
  if (started) process.emit("SIGTERM");   // server.js listens: shutdown() → stopSessions → process.exit
  else process.exit(0);
}

readline.createInterface({ input: process.stdin }).on("close", stopEngine).on("line", async (line) => {
  let req;
  try { req = JSON.parse(line); } catch { reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (req.id === undefined || req.id === null) return;   // a notification: nothing to answer
  const fn = Object.hasOwn(METHODS, req.method) ? METHODS[req.method] : null;
  if (!fn) { reply({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }); return; }
  try { reply({ jsonrpc: "2.0", id: req.id, result: await dispatch(req.method, req.params || {}) }); }
  catch (e) {
    note({ event: "error", method: req.method, message: String(e && e.message) });
    reply({ jsonrpc: "2.0", id: req.id, error: { code: typeof e.code === "number" ? e.code : -32000, message: String((e && e.message) || e), data: typeof e.code === "string" ? { code: e.code, ...(Number.isFinite(e.need) ? { need: e.need } : {}) } : undefined } });
  }
});
