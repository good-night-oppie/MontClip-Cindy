'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
test('a slow tool releases the bind queue before its bounded wait', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../node/worker.cjs'), 'utf8');
  const code = source.slice(source.indexOf('let taskOperations ='), source.indexOf('/* Leaving'));
  let release, binds = 0;
  const context = { Promise, Set, JSON, Math, Number, start: async () => ({}),
    binder: { bind: async () => { binds++; return { project: 'p_a' }; } },
    METHODS: { 'montclip/call': async p => {
      if (p.arguments.wait_ms === 0) return { text: JSON.stringify({ status: 'running', taskId: 't_one' }) };
      await new Promise(r => { release = r; }); return { text: '{"status":"complete"}' };
    }, 'montclip/bind': async () => { binds++; return { project: 'p_b' }; } },
  };
  vm.createContext(context); vm.runInContext(code + '\nthis.dispatch = dispatch;', context);
  const slow = context.dispatch('montclip/call', { session: 'a', name: 'fablecut_transcribe', arguments: { wait_ms: 1000 } });
  const bound = context.dispatch('montclip/bind', { session: 'b' });
  let timer;
  try {
    const result = await Promise.race([bound, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('bind occupied by slow call')), 100); })]);
    a.equal(result.project, 'p_b'); a.ok(binds >= 2);
  } finally { clearTimeout(timer); release?.(); }
  await slow;
});

test('candidate worker plus explicitly selected upstream engine: caption replay has one revision', {
  skip: !process.env.MONTCLIP_TEST_ENGINE && 'pending approved engine integration baseline; set MONTCLIP_TEST_ENGINE to test the upstream source explicitly',
}, async t => {
  const os = require('node:os'), { spawn } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'montclip-task-test-'));
  const child = spawn(process.execPath, [path.join(__dirname, '../node/worker.cjs')], {
    env: { ...process.env, MONTCLIP_CINDY_APP: process.env.MONTCLIP_TEST_ENGINE, MONTCLIP_CINDY_DATA: dir, MONTCLIP_CINDY_PORT: '0', FABLECUT_NO_FS_WATCH: '1' },
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  child.stderr.resume();
  let seq = 0, buffer = ''; const pending = new Map();
  child.stdout.on('data', data => {
    buffer += data;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      if (!line) continue;
      const msg = JSON.parse(line); pending.get(msg.id)?.(msg);
    }
  });
  t.after(async () => {
    if (child.exitCode == null) { const exited = new Promise(r => child.once('exit', r)); child.stdin.end(); await exited; }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('worker request timed out')); }, 20000);
    pending.set(id, msg => { clearTimeout(timer); pending.delete(id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const before = await rpc('montclip/bind', { session: 'task-a' });
  const args = { session: 'task-a', name: 'fablecut_captions', arguments: { import: '1\n00:00:00,000 --> 00:00:01,000\nhello', replace: false, idempotency_key: 'caption-once', wait_ms: 1000 } };
  const first = await rpc('montclip/call', args), second = await rpc('montclip/call', args);
  a.equal(JSON.parse(first.text).status, 'complete'); a.deepEqual(second, first);
  const after = await rpc('montclip/bind', { session: 'task-a' });
  a.equal(after.revision, before.revision + 1); a.equal(after.clips, before.clips + 1);
});
