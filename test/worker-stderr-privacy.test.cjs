"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { createRequire } = require("node:module");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."), worker = path.join(root, "node", "worker.cjs");
const source = fs.readFileSync(worker, "utf8").split("function freePort(port)")[0];
const nativeRequire = createRequire(worker);
const redactor = require("../engine/problem-redact.js");

// Exercise the real worker's logging setup without starting the engine or touching user data.
function capture(redact = redactor.redactProblem, home = "D:\\人名\\data") {
  let output = "";
  const fakeProcess = { ...process, platform: "win32", env: { ...process.env, MONTCLIP_CINDY_APP: "synthetic-app" }, stderr: { write: s => { output += s; } } };
  const fakeOs = { ...os, homedir: () => home, userInfo: () => ({ username: "测试用户" }) };
  const requireWorker = name => {
    if (name === "node:os") return fakeOs;
    if (name.endsWith("problem-redact.js")) { if (!redact) throw new Error("secret module path"); return { redactProblem: redact }; }
    return nativeRequire(name);
  };
  const fakeConsole = {};
  const run = new Function("require", "process", "console", "__dirname", source + '\nreturn { note, emit: (...args) => console.error(...args) };');
  const api = run(requireWorker, fakeProcess, fakeConsole, path.dirname(worker));
  return { ...api, output: () => output };
}

const sensitive = "EPERM C:\\Users\\测试用户\\AppData\\ffmpeg.zip c:/users/测试用户/file /home/测试用户/z.tar /Users/测试用户/a D:\\人名\\data\\bin.exe ?token=abc123 Bearer xyz.123";
test("note and console redact paths and secrets while retaining error codes", () => {
  const c = capture();
  c.note({ event: "error", nested: { message: sensitive }, token: "abc123", origin: "http://127.0.0.1:5123" });
  c.emit(sensitive);
  const out = c.output();
  for (const secret of ["测试用户", "人名", "abc123", "xyz.123", "AppData"]) assert.ok(!out.includes(secret), secret);
  assert.match(out, /EPERM/);
  const line = out.split("\n")[0].replace(/^\[montclip\] /, "");
  assert.equal(JSON.parse(line).origin, "http://127.0.0.1:5123");
});
test("missing redactor fails closed for note and console", () => {
  const c = capture(null); c.note({ event: "error", message: sensitive }); c.emit(sensitive);
  assert.doesNotMatch(c.output(), /测试用户|abc123|secret module path/);
  assert.match(c.output(), /LOG_REDACTION_UNAVAILABLE/);
});
test("invalid redacted JSON fails closed", () => {
  const c = capture(() => 'invalid secret abc123'); c.note({ event: "error", message: sensitive });
  assert.doesNotMatch(c.output(), /abc123|测试用户/);
  assert.match(c.output(), /LOG_REDACTION_FAILED/);
});
test("redactor and console conversion exceptions fail closed", () => {
  const c = capture(() => { throw new Error("abc123"); });
  c.note({ event: "error", message: sensitive }); c.emit(sensitive);
  const d = capture(); d.emit({ toString() { throw new Error("abc123"); } });
  assert.doesNotMatch(c.output() + d.output(), /abc123|测试用户/);
  assert.match(c.output(), /LOG_REDACTION_FAILED/);
  assert.match(d.output(), /LOG_REDACTION_FAILED/);
});
test("packed worker redacts an actual method failure", { timeout: 15000 }, async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-stderr-"));
  const preload = path.join(dir, "preload.cjs");
  fs.writeFileSync(preload, `const fs = require('node:fs'); const original = fs.mkdirSync;\nfs.mkdirSync = function(p, ...args) { if (String(p).endsWith('exports')) throw Object.assign(new Error(${JSON.stringify(sensitive)}), {code:'EPERM'}); return original.call(this, p, ...args); };`);
  const child = spawn(process.execPath, ["-r", preload, path.join(root, "dist", "montclip", "node", "worker.cjs")], {
    env: { ...process.env, MONTCLIP_CINDY_DATA: dir }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true
  });
  let stderr = "", stdout = "";
  child.stderr.on("data", c => { stderr += c; }); child.stdout.on("data", c => { stdout += c; });
  t.after(() => { if (child.exitCode === null) child.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "montclip/open-folder", params: { folder: "exports" } }) + "\n");
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("worker timeout")), 10000); child.stdout.on("data", () => { if (stdout.includes("\n")) { clearTimeout(timer); resolve(); } }); });
  child.stdin.end();
  await new Promise(resolve => child.once("exit", resolve));
  const line = stderr.split("\n").find(s => s.includes('"event":"error"'));
  assert.ok(line, stderr);
  assert.match(line, /EPERM/);
  assert.doesNotMatch(line, /测试用户|abc123|xyz\.123|AppData/);
  assert.doesNotThrow(() => JSON.parse(line.replace(/^\[montclip\] /, "")));
});
