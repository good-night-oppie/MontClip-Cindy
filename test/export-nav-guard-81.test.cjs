'use strict';
/* MontClip-Cindy#81: an export running must not be killed silently by navigation.
   A: the chat tool refuses to switch projects unless the streamer confirmed the interrupt.
   B: the task page does not reload (project switch / engine address) while an export runs; no auto switch after it ends.
   C: after a proven engine restart with an export running, one plain sentence is shown once.
   These tests run main.js/frame.js against a fake host/DOM and a real worker RPC; they are not a Win11 real-window check. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const MAIN = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
const FRAME = fs.readFileSync(path.join(ROOT, 'frame.js'), 'utf8');
const WORDS = {
  ask: '现在正在导出视频，这时候换项目会把导出中断。要等导出完成再换，还是现在中断导出、马上换？',
  note: 'A video export is running on this computer, so the project was NOT switched. Do not tell the streamer the export will keep running after a switch. Ask her whether to wait for the export to finish, or to stop it and switch now. Only if she says to stop it, call again with the confirmation option named in this tool\'s description.',
  switched: '已经中断导出并换了项目。刚才那次导出没有完成，需要的话请重新导出。',
  prompt: '正在导出视频，这时候切换会把导出中断。',
  wait: '等导出结束', interrupt: '中断导出并切换', waiting: '正在等导出结束…',
  ended: '导出已经结束。', now: '现在切换',
  restarted: '刚才 MontClip 重新启动了一下，正在导出的视频没有导完。需要的话请再点一次导出。',
};
const tick = () => new Promise(r => setImmediate(r));
async function until(fn, what) { for (let i = 0; i < 400; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } assert.fail('timed out: ' + what); }

/* main.js against a fake Cindy host: the engine's active export count is what the test says. */
function mainHost(opts = {}) {
  let active = opts.active == null ? 0 : opts.active, known = opts.known !== false, restarted = !!opts.restarted;
  const calls = [], sent = [];
  let listener = null, bc = null;
  const cindy = {
    onHostMessage: fn => { listener = fn; },
    send: async m => { sent.push(m); return { ok: true }; },
    pick: async () => ({ ok: true, path: 'C:/Users/streamer/Videos', name: 'Videos' }),
    taskView: async () => ({ ok: true }),
    node: { async request(r) {
      calls.push({ method: r.method, params: r.params });
      const ok = result => ({ ok: true, result });
      switch (r.method) {
        case 'montclip/tools': return ok({ tools: [{ name: 'fablecut_projects', inputSchema: { type: 'object' } }] });
        case 'montclip/export-active': {
          const a = { known, active, restartedWithExport: restarted }; restarted = false; return ok(a);
        }
        case 'montclip/call': return ok({ content: [{ type: 'text', text: '{"projectSwitched":"p_2"}' }], projectSwitched: 'p_2' });
        case 'montclip/bind': return ok({ project: 'p_1', name: 'demo' });
        default: return { ok: false, errorCode: 'NO_SUCH_METHOD', message: r.method };
      }
    } },
  };
  class BC { constructor() { bc = this; this.sent = []; } postMessage(m) { this.sent.push(m); } }
  vm.runInNewContext(MAIN, { cindy, BroadcastChannel: BC, console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn, ms, ...a) => setTimeout(fn, Math.min(ms, 2), ...a), clearTimeout, setInterval, clearInterval, Date, Promise, JSON, Math, URL });
  let n = 0;
  const call = (tool, args) => new Promise(resolve => {
    const callId = 'c' + (++n);
    cindy.send = async m => {
      if (m.type === 'tool-result' && m.callId === callId) resolve(m);
      return { ok: true };
    };
    listener({ type: 'tool-call', tool, callId, args: { ...args, session_context: { session_id: 'task-1' } } });
  });
  return { call, calls, bc: () => bc, sent, setActive: v => { active = v; }, setKnown: v => { known = v; } };
}

test('#81 A: switching projects while an export runs is refused; the tool says wait or interrupt', async () => {
  const h = mainHost({ active: 1 });
  const r = await h.call('call_tool', { name: 'fablecut_projects', args: { action: 'open', id: 'p_2' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.code, 'EXPORT_RUNNING');
  assert.equal(r.result.sayToStreamer, WORDS.ask);
  assert.equal(r.result.note, WORDS.note);
  assert.match(String(r.result.tools), /fablecut_projects/);
  assert.equal(h.calls.filter(c => c.method === 'montclip/call').length, 0, 'the engine must not be asked to switch');
});

test('#81 A: only an explicit confirmation switches, and it is not forwarded to the engine', async () => {
  const h = mainHost({ active: 1 });
  const r = await h.call('call_tool', { name: 'fablecut_projects', args: { action: 'open', id: 'p_2', interruptExport: true } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.sayToStreamer, WORDS.switched, JSON.stringify(r));
  const call = h.calls.filter(c => c.method === 'montclip/call').at(-1);
  assert.ok(call, 'the engine is called once confirmed');
  assert.equal(call.params.arguments.interruptExport, undefined, 'the plugin-only option never reaches the engine');
  assert.equal(call.params.arguments.id, 'p_2');
  assert.ok(h.bc().sent.some(m => m.type === 'task-project-switched' && m.project === 'p_2' && m.confirmed === true));
});

test('#81 A: no export running → the switch goes through as before', async () => {
  const h = mainHost({ active: 0 });
  const r = await h.call('call_tool', { name: 'fablecut_projects', args: { action: 'open', id: 'p_2' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.result.code, undefined);
  assert.equal(h.calls.filter(c => c.method === 'montclip/call').length, 1);
});

test('#81 A: when the active count cannot be read, the switch is not blocked (fail-open, no claim either way)', async () => {
  const h = mainHost({ known: false });
  const r = await h.call('call_tool', { name: 'fablecut_projects', args: { action: 'open', id: 'p_2' } });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(h.calls.filter(c => c.method === 'montclip/call').length, 1, 'fail-open: the switch is allowed');
  assert.doesNotMatch(JSON.stringify(r.result), /没有导出|no export/i);
});

test('#81 C: a proven restart with an export surfaces the plain sentence once', async () => {
  const h = mainHost({ active: 0, restarted: true });
  const bc = h.bc();
  bc.onmessage({ data: { reqId: 'r1', type: 'export-active', session: 'task-1' } });
  await until(() => bc.sent.some(m => m.reqId === 'r1' && m.answer), 'the first answer');
  assert.equal(bc.sent.find(m => m.reqId === 'r1').restartedWithExport, true);
  bc.onmessage({ data: { reqId: 'r2', type: 'export-active', session: 'task-1' } });
  await until(() => bc.sent.some(m => m.reqId === 'r2' && m.answer), 'the second answer');
  assert.equal(bc.sent.find(m => m.reqId === 'r2').restartedWithExport, false);
});

/* frame.js in a DOM adapter: the page's asks are answered locally; an iframe load is one navigation. */
function framePage(opts = {}) {
  const loads = [], timers = new Map(), listeners = [], errors = [];
  let active = opts.active == null ? 0 : opts.active, known = opts.known !== false, restarted = !!opts.restarted, boundProject = 'p_1', editorUrl = 'http://127.0.0.1:4321/', iframe = null;
  const status = element('status');
  const note = element('div'); note.hidden = true;
  const noteText = element('span'); noteText.id = 'exportNoteText'; note.appendChild(noteText);
  const noteClose = element('button'); noteClose.id = 'exportNoteClose'; note.appendChild(noteClose);
  function element(tag) {
    const el = { tagName: tag, children: [], text: '', hidden: false, className: '', style: {}, handlers: {}, inert: false,
      set textContent(v) { el.text = String(v); el.children = []; },
      get textContent() { return el.text + el.children.map(c => c.textContent).join(''); },
      appendChild(c) { c.parentNode = el; el.children.push(c); return c; },
      append(...cs) { cs.forEach(c => el.appendChild(c)); },
      addEventListener(type, fn) { (el.handlers[type] ||= []).push(fn); },
      focus() {}, click() { (el.handlers.click || []).forEach(fn => fn({})); },
    };
    return el;
  }
  const answers = {
    bind: () => ({ project: boundProject }),
    editor: () => ({ url: editorUrl }),
    'editor-ticket': () => ({ ticket: 't' + loads.length, project: 'p_1' }),
    'export-active': () => ({ known, active, restartedWithExport: restarted }),
    'ffmpeg-state': () => ({ supported: false }),
    problem: () => ({ shown: null }),
  };
  const document = {
    visibilityState: 'visible', documentElement: {}, body: { dataset: { view: 'task' }, children: [], appendChild(n) { this.children.push(n); n.parentNode = this; } },
    getElementById: id => (id === 'status' ? status : id === 'exportNote' ? note : id === 'exportNoteText' ? noteText : id === 'exportNoteClose' ? noteClose : null),
    addEventListener() {},
    createElement(tag) {
      if (tag !== 'iframe') return element(tag);
      const events = {};
      const node = { parentNode: null, contentWindow: { postMessage() {} },
        addEventListener(type, fn) { events[type] = fn; },
        remove() { node.removed = true; }, inert: false,
        set src(url) { node.loadedUrl = url; loads.push({ url }); queueMicrotask(() => events.load && events.load()); },
        get src() { return node.loadedUrl; } };
      iframe = node; return node;
    },
  };
  class Channel {
    addEventListener(_, fn) { listeners.push(fn); }
    removeEventListener(_, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }
    postMessage(m) {
      const make = answers[m.type];
      const a = Object.assign({}, typeof make === 'function' ? make() : {}, { reqId: m.reqId, answer: true });
      queueMicrotask(() => listeners.slice().forEach(fn => fn({ data: a })));
    }
  }
  vm.runInNewContext(FRAME, {
    document, location: { search: '?session=task-1' }, BroadcastChannel: Channel,
    window: { addEventListener() {} }, URL, URLSearchParams,
    getComputedStyle: () => ({ colorScheme: 'light' }), matchMedia: () => ({ addEventListener() {} }),
    fetch: async () => ({}), localStorage: { getItem: () => '1' }, console: { warn: x => errors.push(x) },
    setInterval: fn => { const id = Symbol(); timers.set(id, fn); return id; },
    clearInterval: id => timers.delete(id), setTimeout, clearTimeout, queueMicrotask,
  });
  const buttons = () => status.children.filter(c => c.tagName === 'button');
  const press = text => { const b = buttons().find(x => x.textContent === text); assert.ok(b, 'button ' + text + ' in: ' + status.textContent); b.click(); };
  const poll = () => { for (const fn of [...timers.values()]) fn(); };
  const notify = m => listeners.slice().forEach(fn => fn({ data: m }));
  return { status, note, noteClose, loads, errors, press, poll, buttons, setActive: v => { active = v; },
    setRestarted: v => { restarted = v; }, setEditorUrl: v => { editorUrl = v; },
    setKnown: v => { known = v; }, setBoundProject: v => { boundProject = v; }, notify };
}

test('#81 B: reloading the page while an export runs is held; the notice says wait or interrupt', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setActive(1); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => /正在导出视频/.test(p.status.textContent), 'the notice');
  assert.equal(p.status.hidden, false);
  assert.ok(p.status.textContent.includes(WORDS.prompt));
  assert.deepEqual(p.buttons().map(b => b.textContent), [WORDS.wait, WORDS.interrupt]);
  assert.equal(p.loads.length, 1, 'the old page stays while exporting');
});

test('#81 B: waiting shows the ended sentence and a 现在切换 button, and never switches by itself', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setActive(1); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.buttons().length === 2, 'the two buttons');
  p.press(WORDS.wait);
  await until(() => p.status.textContent.includes(WORDS.waiting), 'the waiting sentence');
  assert.ok(p.buttons().some(b => b.textContent === WORDS.interrupt), 'the way out stays while waiting');
  p.setActive(0); p.poll();
  await until(() => p.status.textContent.includes(WORDS.ended), 'the ended sentence');
  assert.ok(p.buttons().some(b => b.textContent === WORDS.now));
  assert.equal(p.loads.length, 1, 'nothing reloads until she clicks');
  p.press(WORDS.now);
  await until(() => p.loads.length === 2, 'the page to load after the click');
});

test('#81 B: 中断导出并切换 reloads at once, without a second confirmation', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setActive(1); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.buttons().length === 2, 'the two buttons');
  p.press(WORDS.interrupt);
  await until(() => p.loads.length === 2, 'the page to load');
  assert.equal(p.loads.length, 2);
});

test('#81 B: no export running → the page reloads as before and shows no notice', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setActive(0); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.loads.length === 2, 'the reload');
  assert.ok(!/正在导出视频/.test(p.status.textContent));
});


test('#81 C: after a proven restart the page shows the restart sentence once', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setRestarted(true); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.note.hidden === false && p.note.textContent.includes(WORDS.restarted), 'the restart sentence');
  assert.equal(p.loads.length, 2, 'the page still reloads');
});

test('#81 worker: the active-export query answers known:false before the engine is started, without booting it', async t => {
  const dir = fs.mkdtempSync(path.join(ROOT, '.issue81-test-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'node/worker.cjs')], {
    env: { ...process.env, MONTCLIP_CINDY_APP: path.join(ROOT, 'engine'), MONTCLIP_CINDY_DATA: dir,
      MONTCLIP_CINDY_CONFIG: path.join(dir, 'config'), MONTCLIP_CINDY_PORT: '0', FABLECUT_NO_FS_WATCH: '1' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let buffer = ''; const pending = new Map();
  child.stdout.on('data', x => { buffer += x; let at; while ((at = buffer.indexOf('\n')) >= 0) { const m = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1); pending.get(m.id)?.(m); } });
  let stderr = ''; child.stderr.on('data', x => { stderr += x; });
  t.after(async () => {
    if (child.exitCode === null) await new Promise(r => { const timer = setTimeout(() => child.kill(), 5000); child.once('exit', () => { clearTimeout(timer); r(); }); child.stdin.end(); });
    assert.equal(path.dirname(dir), ROOT); assert.ok(path.basename(dir).startsWith('.issue81-test-'));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error('rpc timeout ' + method + ' ' + stderr)), 5000);
    pending.set(id, m => { clearTimeout(timer); m.error ? reject(new Error(m.error.message)) : resolve(m.result); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  const a1 = await rpc('montclip/export-active');
  assert.equal(a1.known, false, 'the engine is not up: nothing is claimed');
  assert.equal(a1.active, null);
});
test('#81 C: 知道了 closes only the restart note; the page and the editor notice stay as they are', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setRestarted(true); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.note.hidden === false, 'the restart note');
  assert.equal(p.status.hidden, true, 'the editor page is showing under the note');
  p.noteClose.click();
  assert.equal(p.note.hidden, true, '知道了 closes the note');
  assert.equal(p.status.hidden, true, 'and does not open or hide the page status');
  assert.equal(p.loads.length, 2, 'and does not reload anything');
  assert.ok(!/正在导出视频|导出已经结束/.test(p.status.textContent));
});

test('#81 B: a count that cannot be read while waiting releases the page (fail-open)', async () => {
  const p = framePage({ active: 0 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setActive(1); p.setEditorUrl('http://127.0.0.1:5001/'); p.poll();
  await until(() => p.buttons().length === 2, 'the two buttons');
  p.press(WORDS.wait);
  await until(() => p.status.textContent.includes(WORDS.waiting), 'the waiting sentence');
  p.setKnown(false); p.poll();
  await until(() => p.loads.length === 2, 'the page to load when the count cannot be read');
  assert.ok(!/没有导出|no export/i.test(p.status.textContent));
});

test('#81 B: a confirmed switch from the chat is not asked again on this reload', async () => {
  const p = framePage({ active: 1 });
  await until(() => p.loads.length === 1, 'the first load');
  p.setBoundProject('p_2');
  p.notify({ type: 'task-project-switched', session: 'task-1', project: 'p_2', confirmed: true });
  await until(() => p.loads.length === 2, 'the confirmed reload');
  assert.ok(!/正在导出视频/.test(p.status.textContent));
});
