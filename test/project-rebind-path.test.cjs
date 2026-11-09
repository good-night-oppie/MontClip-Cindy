'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createBinder } = require('../node/lib.cjs');

function setup(t) {
  const root = path.resolve(__dirname, '..');
  const dir = fs.mkdtempSync(path.join(root, '.issue43-test-'));
  t.after(() => {
    a.equal(path.dirname(dir), root);
    a.ok(path.basename(dir).startsWith('.issue43-test-'));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const state = { active: 'p_old', projects: ['p_old'], failRollback: false, failWrite: false };
  const api = async (method, url, args) => {
    if (method === 'GET') return { status: 200, body: { active: state.active, projects: state.projects.map(id => ({ id })) } };
    if (args.action === 'new') {
      const id = 'p_new' + state.projects.length;
      state.projects.push(id);
      if (args.open !== false) state.active = id;
      if (state.failWrite) fs.mkdirSync(path.join(dir, 'sessions.json.tmp'));
      return { status: 200, body: { id, project: { name: args.name, clips: 0, media: 0 } } };
    }
    if (state.failRollback) return { status: 500, body: { error: 'injected rollback failure' } };
    state.active = args.id;
    return { status: 200, body: { id: args.id, project: {} } };
  };
  return { state, api, dir, binder: createBinder({ file: path.join(dir, 'sessions.json'), api }) };
}

test('#43 worker passes the new binding to read, edit, undo and export after another task runs', async t => {
  const { binder, api } = setup(t);
  await binder.bind('video');
  const b = await binder.bind('dd');
  const source = fs.readFileSync(path.join(__dirname, '../node/worker.cjs'), 'utf8');
  const calls = [];
  const record = async p => { calls.push(p); return p; };
  const context = { Promise, JSON, Math, Number, binder, api, start: async () => ({}),
    METHODS: { 'montclip/call': record, 'montclip/ui': record, 'montclip/export-start': record } };
  vm.createContext(context);
  const switchCode = source.slice(source.indexOf('async function taskProjects('), source.indexOf('const METHODS ='));
  const dispatchCode = source.slice(source.indexOf('let taskOperations ='), source.indexOf('/* Leaving'));
  vm.runInContext(switchCode + dispatchCode + '\nthis.dispatch = dispatch;', context);
  await context.dispatch('montclip/call', { session: 'video', name: 'fablecut_projects', arguments: { action: 'new', name: 'new' } });
  const target = binder.map().video;
  for (const [method, extra] of [
    ['montclip/call', { name: 'fablecut_get_project' }],
    ['montclip/call', { name: 'fablecut_patch_project' }],
    ['montclip/ui', { cmd: 'undo' }],
    ['montclip/export-start', {}],
  ]) {
    await context.dispatch('montclip/call', { session: 'dd', name: 'fablecut_get_project' });
    a.equal(calls.at(-1).project, b.project);
    await context.dispatch(method, { session: 'video', ...extra });
    a.equal(calls.at(-1).project, target, method + ' must select new task binding');
  }
  // This verifies request routing only, not successful UI/encoder execution.
});

test('#43 rollback failure is explicit and never changes the stored binding', async t => {
  const { binder, state } = setup(t);
  await binder.bind('video');
  const before = binder.map();
  state.failWrite = true; state.failRollback = true;
  await a.rejects(binder.projects('video', { action: 'new', name: 'residue' }),
    error => error.code === 'PROJECT_ROLLBACK_FAILED' && /rollback failed/.test(error.message));
  a.deepEqual(binder.map(), before);
  a.notEqual(state.active, before.video, 'failed rollback must not be advertised as restored');
});

test('#43 unreadable bindings fail closed instead of adopting another task project', async t => {
  const { binder, dir, state } = setup(t);
  await binder.bind('video');
  fs.writeFileSync(path.join(dir, 'sessions.json'), '{broken');
  await a.rejects(binder.projects('video', { action: 'new' }));
  a.deepEqual(state.projects, ['p_old']);
});

test('#43 invalid open values are rejected before any binding or engine mutation', async t => {
  const { binder, state } = setup(t);
  for (const open of [null, 0, 'false']) {
    await a.rejects(binder.projects('video', { action: 'new', open }), /boolean/);
    a.deepEqual(binder.map(), {});
    a.deepEqual(state.projects, ['p_old']);
    a.equal(state.active, 'p_old');
  }
});
