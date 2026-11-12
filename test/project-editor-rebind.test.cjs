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
    function element(tagName) {
      return { tagName, children: [], text: '', hidden: false,
        set textContent(value) { this.text = value; this.children = []; },
        get textContent() { return this.text + this.children.map(x => x.textContent).join(''); },
        get firstChild() { return this.text ? { textContent: this.text } : this.children[0]; },
        append(...nodes) { this.children.push(...nodes); }, addEventListener() {}, focus() {},
      };
    }
    const status = element('status'), messages = [];
    let iframe, blocked = false, release, muted = false;
    const send = m => listeners.forEach(fn => fn({ data: m }));
    class Channel {
      addEventListener(_, fn) { listeners.push(fn); }
      removeEventListener(_, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }
      async postMessage(m) {
        let result;
        if (m.type === 'bind') result = p.failBind ? { error: 'synthetic bind refusal', code: 'BIND_FAILED' } : await rpc('montclip/bind', { session });
        else if (m.type === 'editor') result = p.editorSuffix ? { ...start, url: start.url + p.editorSuffix } : start;
        else if (m.type === 'editor-ticket') {
          result = await rpc('montclip/editor-ticket', { session }); tickets.push(result.ticket);
          if (blocked) { blocked = false; await new Promise(r => { release = r; }); }
          if (p.ticketProject) result.project = p.ticketProject;
          if (p.omitTicketProject) delete result.project;
          if (p.failTicket) result = { error: 'synthetic ticket refusal', code: 'TASK_TICKET_REFUSED' };
        } else result = { supported: false };
        send({ ...result, reqId: m.reqId, answer: true });
      }
    }
    const document = {
      visibilityState: 'visible', documentElement: {}, body: { dataset: { view }, children: [], appendChild(node) { this.children.push(node); node.parentNode = this; } },
      getElementById: id => id === 'status' ? status : null,
      addEventListener: (type, fn) => { if (type === 'visibilitychange') visibility.push(fn); },
      createElement: tag => {
        if (tag !== 'iframe') return element(tag);
        const events = {};
        const node = { removed: false, replies: [], contentWindow: { postMessage: m => node.replies.push(m) },
          addEventListener(type, fn) { events[type] = fn; },
          remove() { node.removed = true; node.conn?.controller.abort(); if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(x => x !== node); node.parentNode = null; },
          set src(url) {
            const load = { url }; loads.push(load);
            connect(url).then(conn => { load.conn = node.conn = conn; events.load?.(); }, e => errors.push(e));
          },
        }; iframe = node; return node;
      },
    };
    const p = { session, loads, errors, status, failTicket: false, failBind: false,
      frame: () => iframe, mounted: () => document.body.children,
      needTicket: node => Promise.all(messages.map(fn => fn({ source: node.contentWindow, origin: start.origin, data: { type: 'montclip-need-ticket' } }))),
      notify: m => { if (!muted) send(m); }, mute: x => { muted = x; },
      visible: () => visibility.forEach(fn => fn()), block: () => { blocked = true; },
      release: () => release?.(), waiting: () => !!release,
      timerCount: () => timers.size, poll: () => Promise.all([...timers.values()].map(fn => fn())),
    };
    pages.push(p);
    vm.runInNewContext(source('frame.js'), {
      document, location: { search: '?session=' + session }, BroadcastChannel: Channel,
      window: { addEventListener: (type, fn) => { if (type === 'message') messages.push(fn); } }, URL, URLSearchParams,
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
  a.equal(p.status.firstChild.textContent, 'MontClip 没能连接这个任务的剪辑器。');
  a.ok(p.status.children.some(x => x.textContent === '复制问题信息'));
  a.ok(!p.status.textContent.includes('关掉这个页签'));
});

for (const failure of ['failTicket', 'failBind']) test('#43 ' + failure + ' preserves old frame and switching back recovers without reload', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p);
  const oldProject = (await f.rpc('montclip/bind', { session: 'taskA' })).project, oldFrame = p.frame();
  p[failure] = true; await f.call({ action: 'new' }); await until(() => p.status.className === 'error');
  a.equal(oldFrame.removed, false); a.equal(p.mounted().includes(oldFrame), true); a.equal(oldFrame.inert, true);
  const n = f.tickets.length; p[failure] = false; await p.needTicket(oldFrame); await tick();
  a.equal(f.tickets.length, n); a.equal(oldFrame.replies.filter(m => m.type === 'montclip-host-ticket').length, 0);
  p.errors.length = 0; await f.call({ action: 'open', id: oldProject });
  await until(() => p.status.hidden); await f.ready(p);
  a.equal(p.loads.length, 1); a.equal(p.frame(), oldFrame); a.equal(oldFrame.inert, false); a.deepEqual(p.mounted(), [oldFrame]);
  await until(() => oldFrame.replies.filter(m => m.type === 'montclip-host-ticket').length === 1);
  a.equal((await f.rpc('montclip/ui', { session: 'taskA', cmd: 'undo' })).status, 200);
});

test('#43 pending replacement and mismatched ticket cannot feed the old window', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p);
  const old = p.frame(); p.block(); await f.call({ action: 'new' }); await until(p.waiting);
  const n = f.tickets.length; await p.needTicket(old); await tick();
  a.equal(f.tickets.length, n); a.equal(old.replies.filter(m => m.type === 'montclip-host-ticket').length, 0);
  p.release(); await until(() => p.loads.length === 2); await f.ready(p);
  const current = p.frame(); p.ticketProject = 'p_wrong_project'; await p.needTicket(current);
  await until(() => f.tickets.length > n); await tick(); a.equal(current.replies.filter(m => m.type === 'montclip-host-ticket').length, 0);
  p.ticketProject = null; p.omitTicketProject = true; await p.needTicket(current);
  a.equal(current.replies.filter(m => m.type === 'montclip-host-ticket').length, 0);
});

test('#43 an in-flight reconnect cannot reply after replacement failure suspends its window', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p);
  const oldProject = (await f.rpc('montclip/bind', { session: 'taskA' })).project;
  const old = p.frame(); p.block(); const reconnect = p.needTicket(old); await until(p.waiting);
  p.failTicket = true; await f.call({ action: 'new' }); await until(() => p.status.className === 'error');
  p.failTicket = false; p.release(); await reconnect;
  a.equal(old.replies.filter(m => m.type === 'montclip-host-ticket').length, 0);
  await f.call({ action: 'open', id: oldProject });
  await until(() => old.replies.filter(m => m.type === 'montclip-host-ticket').length === 1);
  a.equal(p.loads.length, 1); a.equal(p.frame(), old);
});

test('#43 initial ticket failure does not mount an unbound iframe', async t => {
  const f = await setup(t), p = f.page('taskA'); p.failTicket = true;
  await until(() => p.status.className === 'error');
  a.equal(p.frame(), undefined); a.equal(p.loads.length, 0);
  a.equal(p.status.firstChild.textContent, 'MontClip 没能连接这个任务的剪辑器。');
  a.ok(p.status.children.some(x => x.textContent === '复制问题信息'));
});

// Browser-only observations supplement the worker/SSE tests above.
{
'use strict';
// Real browser DOM/focus/CSS with the actual frame source; only host replies and
// iframe navigation are fixtures. This is not a Cindy real-window acceptance run.
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const browser = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium',
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')]
  .find(p => p && fs.existsSync(p));

test('#43 ticket failure retains inert editor and moves focus; recovery keeps the same document',
  { skip: !browser && 'Chrome/Edge unavailable' }, t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc43-frame-failure-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
    const source = fs.readFileSync(path.join(root, 'frame.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'frame.css'), 'utf8');
    const fixture = `
      let project='P1', refuse=false, channel, navigations=0;
      window.fetch=async()=>({});
      window.BroadcastChannel=class {
        constructor(){channel=this;this.listeners=[];}
        addEventListener(_,fn){this.listeners.push(fn);}
        removeEventListener(_,fn){this.listeners=this.listeners.filter(x=>x!==fn);}
        emit(data){[...this.listeners].forEach(fn=>fn({data}));}
        postMessage(m){const r=m.type==='bind'?{project}:m.type==='editor'?{url:'http://127.0.0.1/'}:
          m.type==='editor-ticket'?(refuse?{error:'synthetic refusal',code:'TASK_TICKET_REFUSED'}:{ticket:'fixture',project}):{supported:false};
          queueMicrotask(()=>this.emit({...r,answer:true,reqId:m.reqId}));}
      };
      Object.defineProperty(HTMLIFrameElement.prototype,'src',{set(value){navigations++;
        this.srcdoc='<button>synthetic editor '+project+'</button>';}});
      const result={};
      const until=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('fixture timeout');};
      async function check(){try{
        const status=document.getElementById('status');
        await until(()=>document.querySelector('iframe')&&status.hidden);
        const frame=document.querySelector('iframe'); frame.focus();
        result.focusBefore=document.activeElement===frame;
        project='P2';refuse=true;channel.emit({type:'task-project-switched',session:'taskA',project});
        await until(()=>status.className==='error');
        result.failed={retained:frame.isConnected,inert:frame.inert,active:document.activeElement.id,
          text:status.firstChild.textContent,copy:!!status.querySelector('button.copy'),navigations};
        frame.focus(); result.failed.focusRefused=document.activeElement!==frame;
        frame.dispatchEvent(new Event('load'));
        result.lateLoadKeepsError=!status.hidden;
        result.unchangedError=failureText('MontClip 没能启动。','synthetic','TEST').text;
        result.backgrounds=['#f7f7f5','#202020'].map(bg=>{document.documentElement.style.setProperty('--panel-bg',bg);return {status:getComputedStyle(status).backgroundColor,body:getComputedStyle(document.body).backgroundColor,z:getComputedStyle(status).zIndex};});
        project='P1';refuse=false;channel.emit({type:'task-project-switched',session:'taskA',project});
        await until(()=>status.hidden);
        result.recovered=document.querySelector('iframe')===frame && !frame.inert && navigations===1;
      }catch(e){result.error=String(e);}document.body.setAttribute('data-result',JSON.stringify(result));}
      setTimeout(check,0);
    `;
    const page = path.join(dir, 'fixture.html');
    fs.writeFileSync(page, '<!doctype html><meta charset="utf-8"><style>'+css+'</style><body data-view="task"><div id="status"></div><script>'+fixture+'</script><script>'+source+'</script>');
    const out = execFileSync(browser, ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--no-default-browser-check', '--user-data-dir='+path.join(dir,'profile'), '--virtual-time-budget=5000',
      '--dump-dom', 'file:///'+page.replace(/\\/g,'/')+'?session=taskA'], {encoding:'utf8',timeout:30000,windowsHide:true});
    const match=/data-result="([^"]*)"/.exec(out); a.ok(match, 'browser returned observations');
    const r=JSON.parse(match[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
    a.equal(r.error,undefined); a.equal(r.focusBefore,true);
    a.equal(r.failed.text,'MontClip 没能连接这个任务的剪辑器。');
    a.equal(r.failed.copy,true); a.equal(r.failed.navigations,1);
    a.equal(r.failed.retained,true); a.equal(r.failed.inert,true); a.equal(r.failed.focusRefused,true); a.equal(r.failed.active,'status');
    for(const bg of r.backgrounds){a.equal(bg.status,bg.body);a.equal(bg.z,'2');}
    a.equal(r.lateLoadKeepsError,true); a.equal(r.recovered,true);
    a.equal(r.unchangedError,'MontClip 没能启动。关掉这个页签再打开试试；还不行，点「复制问题信息」发给我们。');
  });

}


test('#76 same-project ticket failure resumes retained document and pending reconnect', async t => {
  const f = await setup(t), p = f.page('taskA'); await f.ready(p); const old = p.frame();
  p.failTicket = true; p.editorSuffix = '&test=address-change'; await p.poll();
  await until(() => p.status.className === 'error');
  const n = f.tickets.length; await p.needTicket(old); a.equal(f.tickets.length, n);
  p.failTicket = false; p.visible();
  await until(() => old.replies.filter(m => m.type === 'montclip-host-ticket').length === 1);
  a.equal(p.status.hidden, true); a.equal(p.loads.length, 1); a.equal(p.frame(), old);
});
