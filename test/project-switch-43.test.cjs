'use strict';
// Regression tests for #43. Real local worker + pinned engine;
// no installed plugin, Cindy host, browser, external media, or shared data.
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function fixture(t) {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(root, '.issue43-test-'));
  const launch = () => spawn(process.execPath, [path.join(root, 'node/worker.cjs')], {
    env: { ...process.env, MONTCLIP_CINDY_APP: path.join(root, 'engine'),
      MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_CONFIG: path.join(dir, 'config'),
      MONTCLIP_CINDY_PORT: '0', FABLECUT_NO_FS_WATCH: '1' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  let child = launch();
  let seq = 0, buffer = '', stderr = '';
  const pending = new Map();
  const onData = x => {
    buffer += x;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      if (!line) continue;
      const msg = JSON.parse(line); pending.get(msg.id)?.(msg);
    }
  };
  const attach = () => {
    child.stderr.on('data', x => { stderr = (stderr + x).slice(-8000); });
    child.stdout.on('data', onData);
  };
  attach();
  const restart = async () => {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.stdin.end(); await exited;
    buffer = ''; child = launch(); attach();
  };
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.stdin.end();
      const timer = setTimeout(() => child.kill(), 5000);
      await exited; clearTimeout(timer);
    }
    // Verify the exact generated deletion target stays in this workspace.
    a.equal(path.dirname(dir), root);
    a.ok(path.basename(dir).startsWith('.issue43-test-'));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      pending.delete(id); reject(new Error('local worker timed out: ' + stderr));
    }, 20000);
    pending.set(id, msg => {
      clearTimeout(timer); pending.delete(id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (session, name, args = {}) => (await rpc('montclip/call', { session, name, arguments: args })).text;
  const read = async session => JSON.parse(await call(session, 'fablecut_get_project', { compact: false }));
  const disk = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  return { rpc, call, read, disk, dir, restart };
}

for (const action of ['new', 'duplicate', 'open']) {
  test(`#43 ${action}/open: successful receipt must agree with next task read`, async t => {
    const f = await fixture(t);
    const beforeA = await f.rpc('montclip/bind', { session: 'video' });
    const caption = JSON.parse(await f.call('video', 'fablecut_captions', {
      import: '1\n00:00:00,000 --> 00:00:01,000\nsynthetic A', replace: false, wait_ms: 1000,
    }));
    a.equal(caption.status, 'complete', 'synthetic caption setup must finish');
    const beforeB = await f.rpc('montclip/bind', { session: 'dd' });
    const bDoc = await f.read('dd');
    const name = 'Issue43 synthetic ' + action;
    let target;
    if (action === 'open') {
      const created = await f.call('video', 'fablecut_projects', { action: 'new', name, open: false });
      target = created.match(/p_[a-z0-9]+/)[0];
    }
    const args = { action, name, open: true, idempotency_key: 'switch-' + action,
      ...(action === 'duplicate' ? { id: beforeA.project } : action === 'open' ? { id: target } : {}) };
    const receipt = JSON.parse(await f.call('video', 'fablecut_projects', args));
    a.equal(receipt.status, 'complete');
    target = receipt.result.match(/^Opened (p_[a-z0-9]+)/)[1];
    a.notEqual(target, beforeA.project);
    // Capture before any subsequent bind: the engine really did open the target.
    a.equal(f.disk('projects/index.json').active, target);
    const mapAfterSuccess = f.disk('sessions.json');
    const compact = await f.call('video', 'fablecut_get_project', { compact: true });
    const immediate = await f.read('video'); // fails even with NO concurrent DD call
    // Two simulated tasks submit interleaved reads through the real worker queue.
    const reads = await Promise.all(Array.from({ length: 6 }, (_, i) => f.read(i % 2 ? 'video' : 'dd')));
    for (const i of [0, 2, 4]) {
      a.equal(reads[i].name, bDoc.name);
      a.deepEqual(reads[i].clips, bDoc.clips);
    }
    a.equal(f.disk('sessions.json').dd, beforeB.project);
    const list = await f.call('video', 'fablecut_projects', { action: 'list' });
    const openLine = list.split('\n').find(line => line.includes('(OPEN)'));
    const observed = { binding: mapAfterSuccess.video, nextName: immediate.name,
      compactNamesTarget: compact.includes(name),
      nextClips: immediate.clips.length, interleavedNames: [1, 3, 5].map(i => reads[i].name),
      openProject: openLine.match(/p_[a-z0-9]+/)[0] };
    t.diagnostic(JSON.stringify({ action, old: beforeA.project, target, observed, ddUnchanged: true }));
    a.deepEqual(observed, { binding: target, nextName: name, compactNamesTarget: true, nextClips: action === 'duplicate' ? 1 : 0,
      interleavedNames: [name, name, name], openProject: target });
  });
}

test('#43 control: failed open preserves both task bindings', async t => {
  const f = await fixture(t);
  const first = await f.rpc('montclip/bind', { session: 'video' });
  await f.rpc('montclip/bind', { session: 'dd' });
  const before = f.disk('sessions.json');
  const receipt = JSON.parse(await f.call('video', 'fablecut_projects', {
    action: 'open', id: 'p_missing43', idempotency_key: 'failed-open',
  }));
  a.equal(receipt.status, 'failed');
  a.deepEqual(f.disk('sessions.json'), before);
  a.equal((await f.rpc('montclip/bind', { session: 'video' })).project, first.project);
});

test('#43 defaults and open:false preserve their declared binding semantics', async t => {
  const f = await fixture(t);
  const old = await f.rpc('montclip/bind', { session: 'video' });
  for (const args of [{ action: 'new', open: false }, { action: 'duplicate', id: old.project },
    { action: 'duplicate', id: old.project, open: false }]) {
    await f.call('video', 'fablecut_projects', args);
    a.equal(f.disk('sessions.json').video, old.project);
    a.equal(f.disk('projects/index.json').active, old.project);
  }
  await f.call('video', 'fablecut_projects', { action: 'new', name: 'default open' });
  const first = f.disk('sessions.json').video;
  a.notEqual(first, old.project);
  a.equal((await f.read('video')).name, 'default open');
  await f.call('video', 'fablecut_projects', { action: 'new', name: 'default open' });
  a.notEqual(f.disk('sessions.json').video, first, 'unkeyed identical creates are separate requests');
});

test('#43 occupied target is rejected before binding, without changing active or projects', async t => {
  const f = await fixture(t);
  await f.rpc('montclip/bind', { session: 'video' });
  const b = await f.rpc('montclip/bind', { session: 'dd' });
  const before = { map: f.disk('sessions.json'), active: f.disk('projects/index.json'),
    doc: f.disk('project.json'), projects: fs.readdirSync(path.join(f.dir, 'projects')) };
  const receipt = JSON.parse(await f.call('video', 'fablecut_projects', {
    action: 'open', id: b.project, idempotency_key: 'occupied',
  }));
  a.equal(receipt.status, 'failed');
  a.equal(receipt.code, 'PROJECT_TASK_CONFLICT');
  a.deepEqual({ map: f.disk('sessions.json'), active: f.disk('projects/index.json'),
    doc: f.disk('project.json'), projects: fs.readdirSync(path.join(f.dir, 'projects')) }, before);
});

test('#43 failed binding write rolls active back and a retry never creates another project', async t => {
  const f = await fixture(t);
  const old = await f.rpc('montclip/bind', { session: 'video' });
  const map = f.disk('sessions.json');
  // Block only the binder's staging write; engine and receipt writes still work.
  fs.mkdirSync(path.join(f.dir, 'sessions.json.tmp'));
  const args = { action: 'new', name: 'unbound residue', idempotency_key: 'write-failure' };
  const receipt = JSON.parse(await f.call('video', 'fablecut_projects', args));
  a.equal(receipt.status, 'failed');
  a.equal(receipt.code, 'PROJECT_SWITCH_FAILED');
  a.match(receipt.error, /restored.*may remain/);
  a.equal(receipt.saved.boundProject, old.project);
  a.equal(receipt.saved.restored, true);
  a.notEqual(receipt.saved.project, old.project);
  a.deepEqual(f.disk('sessions.json'), map);
  a.equal(f.disk('projects/index.json').active, old.project);
  const projects = fs.readdirSync(path.join(f.dir, 'projects'));
  a.equal(projects.filter(x => x.startsWith('p_')).length, 2, 'created project remains for inspection');
  a.deepEqual(JSON.parse(await f.call('video', 'fablecut_projects', args)), receipt);
  a.deepEqual(fs.readdirSync(path.join(f.dir, 'projects')), projects);
});

test('#43 keyed replay and old taskId survive rebind without side effects or cross-task access', async t => {
  const f = await fixture(t);
  await f.rpc('montclip/bind', { session: 'video' });
  const args = { action: 'new', name: 'first target', idempotency_key: 'once' };
  const first = JSON.parse(await f.call('video', 'fablecut_projects', args));
  a.equal(first.status, 'complete');
  a.deepEqual(JSON.parse(await f.call('video', 'fablecut_projects', args)), first);
  await f.call('video', 'fablecut_projects', { action: 'new', name: 'later target' });
  const map = f.disk('sessions.json'), active = f.disk('projects/index.json');
  const projects = fs.readdirSync(path.join(f.dir, 'projects'));
  await f.restart();
  a.deepEqual(JSON.parse(await f.call('video', 'fablecut_projects', args)), first);
  a.deepEqual(JSON.parse(await f.call('video', 'fablecut_projects', { taskId: first.taskId })), first);
  await a.rejects(f.call('dd', 'fablecut_projects', { taskId: first.taskId }), /scope/);
  await a.rejects(f.call('video', 'fablecut_projects', { ...args, name: 'different args' }), /different arguments/);
  a.deepEqual(f.disk('sessions.json'), map);
  a.deepEqual(f.disk('projects/index.json'), active);
  a.deepEqual(fs.readdirSync(path.join(f.dir, 'projects')), projects);
  const caption = JSON.parse(await f.call('video', 'fablecut_captions', {
    import: '1\n00:00:00,000 --> 00:00:01,000\nnew target caption', wait_ms: 1000,
  }));
  a.equal(caption.status, 'complete');
  const doc = await f.read('video');
  a.equal(doc.name, 'later target'); a.equal(doc.clips.length, 1);
});

test('#43 concurrent tasks: A switches while B repeatedly reads its own project', async t => {
  const f = await fixture(t);
  await f.rpc('montclip/bind', { session: 'video' });
  const b = await f.rpc('montclip/bind', { session: 'dd' });
  const bDoc = await f.read('dd');
  const [text, ...bReads] = await Promise.all([
    f.call('video', 'fablecut_projects', { action: 'new', name: 'A concurrent target',
      open: true, idempotency_key: 'concurrent-new' }),
    ...Array.from({ length: 6 }, () => f.read('dd')),
  ]);
  const receipt = JSON.parse(text);
  a.equal(receipt.status, 'complete');
  for (const doc of bReads) { a.equal(doc.name, bDoc.name); a.deepEqual(doc.clips, bDoc.clips); }
  a.equal(f.disk('sessions.json').dd, b.project);
  t.diagnostic('All six DD reads and its stored binding are unchanged.');
  a.equal((await f.read('video')).name, 'A concurrent target');
});
