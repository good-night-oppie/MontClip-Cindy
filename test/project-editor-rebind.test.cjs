'use strict';
// Real worker + pinned engine HTTP/SSE, actual main handler and frame source in
// a DOM adapter. This proves routing/claim/command delivery, NOT Cindy real-window undo.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const source = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const tick = () => new Promise(r => setImmediate(r));
async function until(fn) { for (let i = 0; i < 500; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 10)); } a.fail('condition timed out'); }

async function setup(t) {
  const dir = fs.mkdtempSync(path.join(ROOT, '.issue43-test-'));
  const child = spawn(process.execPath, [path.join(ROOT, 'node/worker.cjs')], {
    env: { ...process.env, MONTCLIP_CINDY_APP: path.join(ROOT, 'engine'), MONTCLIP_CINDY_DATA: dir,
      MONTCLIP_CINDY_CONFIG: path.join(dir, 'config'), MONTCLIP_CINDY_PORT: '0', FABLECUT_NO_FS_WATCH: '1' },
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let id = 0, buffer = '', stderr = ''; const pending = new Map(), aborts = [];
  child.stderr.on('data', x => { stderr += x; });
  child.stdout.on('data', x => {
    buffer += x; let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const msg = JSON.parse(buffer.slice(0, at)); buffer = buffer.slice(at + 1);
      pending.get(msg.id)?.(msg);
    }
  });
  t.after(async () => {
    await until(() => pending.size === 0); await tick();
    aborts.forEach(x => x.abort());
    if (child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); }); child.stdin.end();
    });
    a.equal(path.dirname(dir), ROOT); a.ok(path.basename(dir).startsWith('.issue43-test-'));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id, timer = setTimeout(() => reject(new Error('RPC timeout: ' + method)), 20000);
    pending.set(n, m => { clearTimeout(timer); pending.delete(n); m.error ? reject(new Error(m.error.message)) : resolve(m.result); });
    child.stdin.write(JSON.stringify({ id: n, method, params }) + '\n');
  });
  const start = await rpc('montclip/start');
  const headers = { 'Content-Type': 'application/json', 'X-MontClip-Session': new URL(start.url).searchParams.get('token') };
  const post = async (url, body) => fetch(start.origin + url, { method: 'POST', headers, body: JSON.stringify(body) });
  const connections = [];
  async function connect(url) {
    const controller = new AbortController(); aborts.push(controller);
    const res = await fetch(start.origin + '/api/events', { headers, signal: controller.signal });
    const conn = { commands: [], claimed: false, controller }; connections.push(conn);
    let buf = '';
    (async () => {
      try {
        for await (const part of res.body) {
          buf += Buffer.from(part).toString(); let at;
          while ((at = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, at); buf = buf.slice(at + 2);
            const event = block.match(/^event: (.*)$/m)?.[1], raw = block.match(/^data: (.*)$/m)?.[1];
            if (event === 'conn') {
              const data = JSON.parse(raw); conn.id = data.conn;
              const claim = await post('/api/embed/claim', { conn: data.conn, ticket: new URL(url).searchParams.get('ticket') });
              conn.claimed = claim.status === 200;
            }
            if (event === 'ui-command') {
              const cmd = JSON.parse(raw); conn.commands.push(cmd.cmd);
              await post('/api/ui/command/result', { id: cmd.id, result: { ok: true, cmd: cmd.cmd } });
            }
          }
        }
      } catch (e) { if (!controller.signal.aborted) conn.error = e; }
    })();
    await until(() => conn.claimed || conn.error); if (conn.error) throw conn.error;
    return conn;
  }
  const pages = [], broadcasts = [], tickets = [];
  function page(session, view = 'task') {
    const listeners = [], visibility = [], loads = [], errors = [], timers = new Map();
    const status = { hidden: false, textContent: '', append() {} };
    let iframe, blocked = false, release, muted = false;
    const send = m => listeners.forEach(fn => fn({ data: m }));
    class Channel {
      addEventListener(_, fn) { listeners.push(fn); }
      removeEventListener(_, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }
      async postMessage(m) {
        let result;
        if (m.type === 'bind') result = await rpc('montclip/bind', { session });
        else if (m.type === 'editor') result = start;
        else if (m.type === 'editor-ticket') {
          result = await rpc('montclip/editor-ticket', { session }); tickets.push(result.ticket);
          if (blocked) { blocked = false; await new Promise(r => { release = r; }); }
          if (p.failTicket) result = { error: 'synthetic ticket refusal', code: 'TASK_TICKET_REFUSED' };
        } else result = { supported: false };
        send({ ...result, reqId: m.reqId, answer: true });
      }
    }
    const document = {
      visibilityState: 'visible', documentElement: {}, body: { dataset: { view }, appendChild() {} },
      getElementById: id => id === 'status' ? status : null,
      addEventListener: (type, fn) => { if (type === 'visibilitychange') visibility.push(fn); },
      createElement: tag => {
        if (tag !== 'iframe') return { addEventListener() {}, append() {} };
        iframe = { contentWindow: { postMessage() {} }, addEventListener() {}, set src(url) {
          const load = { url }; loads.push(load);
          connect(url).then(conn => { load.conn = conn; }, e => errors.push(e));
        } }; return iframe;
      },
    };
    const p = { session, loads, errors, status, failTicket: false,
      notify: m => { if (!muted) send(m); }, mute: x => { muted = x; },
      visible: () => visibility.forEach(fn => fn()), block: () => { blocked = true; },
      release: () => release?.(), waiting: () => !!release,
      timerCount: () => timers.size,
    };
    pages.push(p);
    vm.runInNewContext(source('frame.js'), {
      document, location: { search: '?session=' + session }, BroadcastChannel: Channel,
      window: { addEventListener() {} }, URL, URLSearchParams,
      getComputedStyle: () => ({ colorScheme: 'light' }), matchMedia: () => ({ addEventListener() {} }),
      fetch: async () => ({}), localStorage: { getItem: () => '1' }, console: { warn: x => errors.push(x) },
      setInterval: fn => { const id = Symbol(); timers.set(id, fn); return id; }, clearInterval: id => timers.delete(id),
      setTimeout, clearTimeout,
    });
    return p;
  }
  const main = source('main.js');
  const handler = main.slice(main.indexOf('  async call_tool(args, msg) {'), main.indexOf('  async montclip_undo'));
  const handlers = vm.runInNewContext('({' + handler + '})', {
    engineTools: async () => [{ name: 'fablecut_projects' }], taskOf: msg => msg.session_context.session_id,
    node: rpc, categoryOf: () => 'projects', RULES: {}, channel: { postMessage: m => {
      broadcasts.push(m); pages.forEach(p => p.notify(m));
    } },
  });
  const call = (args, session = 'taskA') => handlers.call_tool({ name: 'fablecut_projects', args }, { session_context: { session_id: session } });
  const ready = async p => { await until(() => p.loads.length && p.loads.at(-1).conn); a.deepEqual(p.errors, []); };
  return { rpc, call, page, ready, broadcasts, connections, tickets, dir, stderr: () => stderr };
}

for (const action of ['new', 'duplicate', 'open']) test(`#43 mechanism2 ${action}: fresh connection receives undo; taskB and panel stay put`, async t => {
  const f = await setup(t), p = f.page('taskA'), b = f.page('taskB'), panel = f.page('taskA', 'panel');
  await Promise.all([p, b, panel].map(f.ready));
  const old = (await f.rpc('montclip/bind', { session: 'taskA' })).project;
  let id = old;
  if (action === 'open') id = (await f.call({ action: 'new', open: false })).text.match(/p_[a-z0-9]+/)[0];
  const result = await f.call({ action, id, open: true, idempotency_key: 'once' });
  await until(() => p.loads.length === 2);
  a.equal(p.loads.length, 2, 'successful tool switch must reload same-task iframe');
  await f.ready(p);
  a.equal(b.loads.length, 1); a.equal(panel.loads.length, 1);
  a.notEqual(p.loads[0].conn.id, p.loads[1].conn.id);
  const undo = await f.rpc('montclip/ui', { session: 'taskA', cmd: 'undo' });
  a.equal(undo.status, 200); a.deepEqual(p.loads[1].conn.commands, ['undo']);
  a.deepEqual(p.loads[0].conn.commands, []);
  a.equal(f.broadcasts.length, 1);
  a.deepEqual(Object.keys(f.broadcasts[0]).sort(), ['project', 'session', 'type']);
  for (const ticket of f.tickets) a.ok(!JSON.stringify([result, f.broadcasts, f.stderr()]).includes(ticket));
  a.ok(!JSON.stringify([result, f.broadcasts, f.stderr()]).includes(f.dir));
  const keyReplay = await f.call({ action, id, open: true, idempotency_key: 'once' });
  await f.call({ taskId: JSON.parse(result.text).taskId });
  a.equal(keyReplay.text, result.text); a.equal(f.broadcasts.length, 1); a.equal(p.loads.length, 2);
});

test('#43 background missed notification: visibility rebind reloads once', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p); p.mute(true);
  await f.call({ action: 'new' }); p.mute(false); p.visible();
  await until(() => p.loads.length === 2); await f.ready(p); p.visible(); await tick();
  a.equal(p.loads.length, 2);
});

test('#43 fast switches cancel stale placement and duplicate notifications do not reload', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p); p.block();
  await f.call({ action: 'new' }); await until(p.waiting);
  await f.call({ action: 'new' }); await until(() => p.loads.length === 2); await f.ready(p);
  p.release(); await tick();
  p.notify(f.broadcasts.at(-1)); p.visible(); await tick();
  a.equal(p.loads.length, 2); a.equal((await f.rpc('montclip/ui', { session: 'taskA', cmd: 'undo' })).status, 200);
});

test('#43 no reload on open:false, failed mutation or failed map write; no ticket for unopened task', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p);
  await f.call({ action: 'new', open: false });
  await f.call({ action: 'open', id: 'p_missing', idempotency_key: 'missing' });
  fs.mkdirSync(path.join(f.dir, 'sessions.json.tmp'));
  await f.call({ action: 'new', idempotency_key: 'map-fail' });
  fs.rmdirSync(path.join(f.dir, 'sessions.json.tmp'));
  a.equal(f.broadcasts.length, 0); a.equal(p.loads.length, 1);
  const n = f.tickets.length; await f.call({ action: 'new' }, 'unopened');
  a.equal(f.tickets.length, n); a.equal(p.loads.length, 1);
});

test('#43 failed replacement ticket shows bounded error without navigating unbound or looping', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p); p.failTicket = true;
  const n = f.tickets.length; await f.call({ action: 'new' }); await until(() => f.tickets.length > n);
  await tick(); p.notify(f.broadcasts.at(-1)); p.visible(); await tick();
  a.equal(p.loads.length, 1); a.equal(f.tickets.length, n + 1); a.equal(p.status.className, 'error');
  a.equal(p.status.textContent, 'MontClip 没能连接这个任务的剪辑器。');
});
