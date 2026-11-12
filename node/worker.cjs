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
const net = require("node:net");
const http = require("node:http");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const { fillWindowsEnv, newToken, createBinder, createEditorTrace, flatten, ffmpegSpec, installFfmpeg, unpackCode, zipUnpackedBytes, freeBytes, spaceNeeded,
  exportFiles, deliverFiles, openFolder, rememberFolder, folderOfJob, aboutMbFrom, asrModelMb, fileHostFrom, externalFfmpegSettings,
  h264Export, ffmpegVersionFrom, maskHome } = require("./lib.cjs");
const { planAsr, installAsr, placesOk, cleanupStaging } = require("./asr-install.cjs");
const asrRuntime = () => JSON.parse(fs.readFileSync(path.join(__dirname, "asr-runtime.json"), "utf8"));

const APP = path.resolve(process.env.MONTCLIP_CINDY_APP || path.join(__dirname, "app"));
// Never fall back to raw output if the engine redactor or its environment is unavailable.
let redactLog = null;
try {
  const { redactProblem } = require(path.join(APP, "problem-redact.js"));
  if (typeof redactProblem !== "function") throw new Error("missing redactor");
  const options = { home: os.homedir(), platform: process.platform };
  try { options.user = os.userInfo().username; } catch { /* optional */ }
  redactLog = text => redactProblem(text, options);
} catch { /* fixed fallback below */ }
const logFallback = (code, done) => process.stderr.write('[montclip] {"event":"log-redaction-unavailable","code":"' + code + '"}\n', done);
for (const k of ["log", "info", "debug", "warn", "error"]) console[k] = (...args) => {
  if (!redactLog) return logFallback("LOG_REDACTION_UNAVAILABLE");
  try { process.stderr.write(redactLog(args.map(String).join(" ")) + "\n"); }
  catch { logFallback("LOG_REDACTION_FAILED"); }
};
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
function checkExportTask(job, session) {
  if ((job.session || null) !== (session || null)) throw Object.assign(new Error("this export belongs to another task"), {code:"EXPORT_TASK_MISMATCH"});
  return job;
}
async function exportJob(id, session) {
  const r = await api("GET", "/api/export/job?id=" + encodeURIComponent(String(id || "")));
  if (r.status === 200) {
    checkExportTask(r.body, session);
    if (r.body.status === "done") try { keepResult(r.body); } catch (e) { note({event:"export-result-not-kept",id:r.body.id,code:e.code}); }
    return r.body;
  }
  if (r.status === 404) {
    const saved = savedResults().find(x => x && x.id === id && x.status === "done");
    if (saved) return checkExportTask(saved, session);
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
/* The same port each time when it is free, so the editor frame keeps its address across worker restarts. */
const PREFERRED_PORT = process.env.MONTCLIP_CINDY_PORT !== undefined ? Number(process.env.MONTCLIP_CINDY_PORT) : 47777;

const reply = (m) => process.stdout.write(JSON.stringify(m) + "\n");
const note = (entry, done) => {
  if (!redactLog) return logFallback("LOG_REDACTION_UNAVAILABLE", done);
  try {
    const line = redactLog(JSON.stringify({ at: new Date().toISOString(), ...entry }));
    JSON.parse(line); // a malformed redaction must never be written
    process.stderr.write("[montclip] " + line + "\n", done);
  } catch { logFallback("LOG_REDACTION_FAILED", done); }
};

// Node's default fatal handler prints a raw stack directly to stderr. Flush one safe note before exiting.
let fatalInProgress = false;
function fatal(event, error) {
  if (fatalInProgress) return process.exit(1);
  fatalInProgress = true;
  process.exitCode = 1;
  const finish = () => process.exit(1);
  const deadline = setTimeout(finish, 1000);
  deadline.unref();
  try {
    const code = error && typeof error.code === "string" ? error.code : "UNKNOWN";
    const message = error && error.message !== undefined ? String(error.message) : String(error);
    note({event, code, message}, finish);
  } catch {
    try { fs.writeSync(2, '[montclip] {"event":"log-redaction-unavailable","code":"LOG_REDACTION_FAILED"}\n'); } catch { }
    finish();
  }
}
process.on("uncaughtException", error => fatal("uncaughtException", error));
process.on("unhandledRejection", error => fatal("unhandledRejection", error));

function freePort(port) {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", (e) => (port ? freePort(0).then(resolve, reject) : reject(e)));
    s.listen(port, "127.0.0.1", () => { const got = s.address().port; s.close(() => resolve(got)); });
  });
}

let extSettingsFile = null;   // the external-ffmpeg.json the engine was given, or null
let started = null, starting = null;   // the running engine: {origin, port, token, tools, callTool, …}
function api(method, urlPath, body, opts) {
  return new Promise((resolve, reject) => {
    const req = http.request(started.origin + urlPath, { method, headers: { "Content-Type": "application/json", "X-MontClip-Session": started.token } }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (d) => { data += d; });
      res.on("end", () => { let j = null; try { j = JSON.parse(data); } catch { j = { raw: data }; } resolve({ status: res.statusCode, body: j }); });
    });
    req.on("error", reject);
    req.setTimeout((opts && opts.timeoutMs) || 20000, () => req.destroy(new Error("the MontClip engine did not answer")));
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

async function boot() {
  fs.mkdirSync(DATA, { recursive: true });
  const envFilled = fillWindowsEnv(process.env);
  const port = await freePort(PREFERRED_PORT);
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
  // The user's own FFmpeg with libx264, for H.264 export only (engine external-ffmpeg.js, ADR-005): the settings file
  // lives in the plugin's settings folder, never in DATA where the engine writes. No file → none, as before.
  const extSettings = externalFfmpegSettings(DATA);
  if (extSettings) process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS = extSettings;
  else delete process.env.MONTCLIP_EXTERNAL_FFMPEG_SETTINGS;
  extSettingsFile = extSettings || null;
  require(path.join(APP, "server.js"));   // throws DATA_DIR_IN_USE when the Windows app has this data folder
  started = { origin: `http://127.0.0.1:${port}`, port, token };
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await api("GET", "/api/project").then((r) => r.status === 200, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  if (!up) throw new Error("the MontClip engine did not start");
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
const editorTrace = createEditorTrace();   // #56: tickets handed out per task (count and time only)
let projectSwitchTasks;

// Project switches need a stable session scope: the project changes as part of
// the operation itself. Reuse the pinned engine's durable receipt implementation
// in a separate namespace, without changing its per-project editing scopes.
async function taskProjects(p) {
  await start();
  const { taskId, idempotency_key, wait_ms, ...args } = p.arguments || {};
  if (!taskId && idempotency_key == null) return binder.projects(p.session, args);
  let projectSwitched;
  projectSwitchTasks ||= require(path.join(APP, 'tool-tasks.js')).createToolTasks({
    dir: path.join(DATA, 'cindy-project-tasks'), dataDir: DATA,
  });
  const receipt = await projectSwitchTasks.call({ scope: JSON.stringify([p.session, 'projects']),
    name: 'fablecut_projects', args, key: idempotency_key, taskId, wait_ms, waitForCompletion: true },
  async () => {
    const result = await binder.projects(p.session, args);
    projectSwitched = result.projectSwitched;
    return result.text; // only prose is durable; replay must never re-emit a switch
  });
  // A replay/query is historical evidence; it must not switch the task back.
  return { text: JSON.stringify(receipt), ...(projectSwitched ? { projectSwitched } : {}) };
}

const METHODS = {
  async "montclip/start"() {
    const s = await start();
    return { origin: s.origin, url: `${s.origin}/?host=cindy&token=${s.token}`, ffmpeg: s.ffmpeg, node: process.version,
      dataDir: DATA, browser: !!s.browser, envFilled: s.envFilled };
  },
  /* Which FFmpeg encodes an MP4 (H.264) export here: the engine's own answer (GET /api/export/h264, what its export
     dialog reads), plus — only for the program named in the settings file, which the engine has just checked and
     accepted — that program (home folder as ~) and its version line. */
  async "montclip/h264"() {
    await start();
    const r = await api("GET", "/api/export/h264");
    if (r.status !== 200) return null;
    const ext = r.body && r.body.external;
    let program = null, version = null;
    if (r.body && r.body.encoder === "libx264" && ext && ext.ok === true && ext.source === "settings" && extSettingsFile) {
      try {
        const file = JSON.parse(fs.readFileSync(extSettingsFile, "utf8")).path;
        if (typeof file === "string" && path.isAbsolute(file) && fs.statSync(file).isFile()) {
          program = maskHome(file);
          const v = spawnSync(file, ["-hide_banner", "-version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
          version = v.status === 0 ? ffmpegVersionFrom(v.stdout) : null;
        }
      } catch { program = null; version = null; }
    }
    return h264Export(r.body, { program, version });
  },
  async "montclip/tools"() {
    const s = await start();
    return { tools: s.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) };
  },
  async "montclip/call"(p) {
    const s = await start();
    const name = String(p.name || "");
    if (!s.tools.some((t) => t.name === name)) throw Object.assign(new Error("no such MontClip tool: " + name), { code: -32602 });
    if (p.arguments?.wait_ms != null && !s.tools.find(t => t.name === name)?.inputSchema?.properties?.wait_ms)
      throw Object.assign(new Error('This pinned engine does not support durable bounded tasks yet. Integrate the reviewed MC-04/08/12 engine fix before using this candidate.'), { code: 'ENGINE_TASK_PROTOCOL_REQUIRED' });
    const t0 = Date.now();
    const out = await s.callTool(name, p.arguments && typeof p.arguments === "object" ? p.arguments : {}, { session: p.session, project: p.project });
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
  /* The speech engine, VAD and model this system still needs (node/asr-runtime.json): main.js asks the user, downloads
     them with cindy.downloads, and hands them to montclip/asr-install. */
  async "montclip/asr-spec"() {
    const rt = asrRuntime(), where = placesOk(rt, PLATFORM, DATA);
    // nothing is asked or fetched when the folders are not the plugin's own (a link into media/ …)
    if (!where.ok) throw Object.assign(new Error(where.why), { code: where.code });
    // Clean even when all files were installed just before the previous process exited.
    cleanupStaging(DATA);
    const plan = planAsr(rt, PLATFORM, DATA);
    // the file host the confirm box names: the one ghost.json declares besides github.com
    const fileHost = fileHostFrom(JSON.parse(fs.readFileSync(path.join(__dirname, "..", "ghost.json"), "utf8")));
    return { supported: plan.supported, platform: PLATFORM, release: rt.release, fileHost, bytes: plan.bytes, mb: aboutMbFrom(APP)(plan.bytes),
      missing: plan.missing.map((i) => ({ name: i.name, url: rt.base + i.name, bytes: i.bytes, sha256: i.sha256, license: i.license })) };
  },
  /* … and installing them: params.names in order, params.downloads.f0, f1, … the host's files (read before this request
     ends). Each is measured again (bytes, SHA-256); all are staged in the data folder before any is put in place. */
  async "montclip/asr-install"(p) {
    const names = Array.isArray(p.names) ? p.names.map(String) : [];
    const files = {};
    names.forEach((n, k) => { if (p.downloads && p.downloads["f" + k]) files[n] = p.downloads["f" + k]; });
    const out = installAsr({ runtime: asrRuntime(), platform: PLATFORM, data: DATA, files, tmpDir: DATA });
    note({ event: "asr-installed", files: out.installed });
    return { ...out, missing: planAsr(asrRuntime(), PLATFORM, DATA).missing.map((i) => i.name) };
  },
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
    if (restarting) {
      /* #81 C: prove it before stopping the engine, or say nothing afterwards. */
      let active = null;
      try { active = (await api("GET", "/api/export/active", undefined, { timeoutMs: 2000 })).body.active; } catch (e) { }
      noteRestartWithExport(active);
      setTimeout(stopEngine, 300);
    }
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
    const r = {body: await exportJob(String(p.id || ""), p.session)};
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
    await exportJob(String(p.id || ""), p.session);
    const r = await api("POST", "/api/export/job/cancel?id=" + encodeURIComponent(String(p.id || "")));
    if (r.status !== 200) throw Object.assign(new Error((r.body && r.body.error) || "no such export job"), { code: "NO_JOB" });
    return r.body;
  },
  async "montclip/export-deliver"(p) {
    await start();
    const r = {body: await exportJob(String(p.id || ""), p.session)};
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
    if (p.job != null) await exportJob(String(p.job), p.session);
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
  /* A one-time task ticket for this task's editor frame or side panel (MontClip#251 item 1, #260 item 1): the
     worker registers it with the engine under its own session header; the page trades it exactly once (the
     editor for its task binding, the panel for its BroadcastChannel suffix). The ticket itself is never
     written to note() or any other log. */
  async "montclip/editor-ticket"(p) {
    await start();
    const session = String(p.session || "");
    const b = await binder.bind(session);
    const r = await api("POST", "/api/embed/ticket", { project: b.project, session });
    if (r.status !== 200 || !r.body || !r.body.ticket) {
      const code = (r.body && r.body.code) || "TASK_TICKET_REFUSED";
      editorTrace.refused(session, code);
      throw Object.assign(new Error((r.body && r.body.error) || "the engine refused a task ticket"), { code });
    }
    editorTrace.issued(session);
    return { ticket: r.body.ticket, expiresInMs: r.body.expiresInMs, project: b.project };
  },
  /* #81: is a video export running right now? The engine's own count (server.js /api/export/active), read with a
     short deadline. It never starts the engine: with no engine up nothing can be claimed (known:false). PG's decision:
     a failed or slow query must not block navigation, and it is never reported as "no export". */
  async "montclip/export-active"(p) {
    // DD review: a chat query must not consume the one proof the page is waiting for.
    const proof = p && p.takeProof === true ? takeRestartProof() : false;
    if (!started || !started.tools) return { known: false, active: null, restartedWithExport: proof };
    try {
      const r = await api("GET", "/api/export/active", undefined, { timeoutMs: 2000 });
      const n = r && r.status === 200 && r.body && r.body.active;
      if (!Number.isFinite(n)) return { known: false, active: null, restartedWithExport: proof };
      return { known: true, active: n, restartedWithExport: proof };
    } catch (e) {
      return { known: false, active: null, restartedWithExport: proof };
    }
  },
  /* #56: why no editor is bound to this task, as far as the worker can see — whether its page ever asked for a
     ticket. Whether the page then traded it is the engine's to know; it does not say yet. */
  async "montclip/editor-trace"(p) { return editorTrace.why(String(p.session || "")); },
};

// Bind and operate in one queue: async readline listeners otherwise interleave at every await.
let taskOperations = Promise.resolve();
function dispatch(method, params) {
  const long = method === 'montclip/call' && ['fablecut_transcribe', 'fablecut_captions', 'fablecut_songs', 'fablecut_highlights'].includes(params.name);
  let project;
  const run = async () => {
    const p = { ...params };
    if (p.session && method === 'montclip/call' && p.name === 'fablecut_projects' &&
        (p.arguments?.taskId || ['new', 'open', 'duplicate'].includes(p.arguments?.action)))
      return taskProjects(p);
    if (p.session && ['montclip/call', 'montclip/ui', 'montclip/export-start'].includes(method)) {
      await start();
      if (method === 'montclip/export-start' && p.expectedProject) {
        const active = (await api('GET', '/api/projects')).body.active;
        if (binder.map()[p.session] !== p.expectedProject || active !== p.expectedProject)
          throw Object.assign(new Error('The task project changed while choosing a folder.'), { code:'EXPORT_PROJECT_CHANGED' });
      }
      p.project = (await binder.bind(p.session)).project;
    }
    project = p.project;
    if (long) p.arguments = { ...p.arguments, wait_ms: 0 };
    return METHODS[method](p);
  };
  if (!['montclip/bind', 'montclip/call', 'montclip/ui', 'montclip/export-start', 'montclip/editor-ticket'].includes(method)) return run();
  const result = taskOperations.then(run);
  taskOperations = result.catch(() => {});
  if (!long) return result;
  // Only submission/binding holds the queue. Waiting for this same task happens outside it.
  return result.then(async out => {
    const receipt = JSON.parse(out.text);
    if (receipt.status !== 'running') return out;
    const wait_ms = params.arguments?.wait_ms ?? 6000;
    if (wait_ms === 0) return out;
    return METHODS[method]({ ...params, project, arguments: { taskId: receipt.taskId, wait_ms } });
  });
}

/* Leaving (Cindy closed our stdin, or ffmpeg was just installed): the engine's own shutdown runs first — it stops the
   ffmpeg each running export spawned (stdin closed, then killed by its handle) and deletes the half-finished files,
   then exits within ~4 s (server.js shutdown). P11: an export's ffmpeg must never outlive the worker. */
let leaving = false;
/* #81 C: the restarts this code can prove had an export running are the ones it causes itself (installing ffmpeg):
   the count is read just before the engine is stopped, and the fact waits for one page to say once. A crash or an
   outside restart leaves no such proof, so nothing is said then. */
const RESTART_PROOF = path.join(DATA, "export-restart.json");
function noteRestartWithExport(active) {
  if (!(active > 0)) return;
  try { fs.writeFileSync(RESTART_PROOF, JSON.stringify({ at: Date.now(), active })); } catch (e) { }
}
function takeRestartProof() {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(RESTART_PROOF, "utf8")); } catch (e) { return false; }
  try { fs.unlinkSync(RESTART_PROOF); } catch (e) { }
  return !!(m && Number.isFinite(m.at) && Date.now() - m.at < 10 * 60 * 1000 && m.active > 0);
}
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
