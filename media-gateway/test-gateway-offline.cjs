// Offline checks for the ledger and the CapCut draft writer. Uses stand-in drivers and synthetic
// files only: no provider process, no network, no account. Usage: node test-gateway-offline.cjs <pluginDir>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = path.resolve(process.argv[2]);
const { createGateway } = require(path.join(dir, 'gateway-core.cjs'));
const { createDraft } = require(path.join(dir, 'capcut-draft.cjs'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-offline-'));
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(2048, 7)]);
const SECRET = 'FAKE-TOKEN-7f3a9c-do-not-leak';
const results = [];
const check = (name, fn) => fn().then(() => results.push('PASS ' + name), e => { results.push('FAIL ' + name + ': ' + e.message); process.exitCode = 1; });

// A stand-in provider that counts calls and can lose a reply, change price or break a download.
function standIn(mode = {}) {
  const calls = { quote: 0, submit: 0, query: 0, fetch: 0 };
  return { calls, mode,
    async quote() { calls.quote++; if (mode.noQuote) throw new Error('boom ' + SECRET); return { credits: mode.price ?? 40, basis: 'stand-in' }; },
    async submit() { calls.submit++; if (mode.loseReply) throw new Error('timeout ' + SECRET); return { providerJobId: 'job_' + calls.submit, token: SECRET }; },
    async query() { calls.query++; return { state: mode.fail ? 'failed' : 'succeeded', reason: 'policy', settledCredits: mode.settled, debug: SECRET }; },
    async fetch({ destination }) { calls.fetch++;
      if (mode.truncate) { fs.writeFileSync(destination, MP4.subarray(0, 100)); return { bytes: MP4.length }; }
      if (mode.empty) { fs.writeFileSync(destination, ''); return { bytes: 0 }; }
      if (mode.wrongType) { fs.writeFileSync(destination, Buffer.from('<html>signed-url-expired</html>')); return {}; }
      fs.writeFileSync(destination, MP4); return { bytes: MP4.length, url: 'https://cdn.example/x?sig=' + SECRET }; } };
}
const open = (name, driver) => { const dataDir = path.join(root, name); return { dataDir, g: createGateway({ dataDir, drivers: { p: driver } }) }; };
const R = 'shot-0001-take1';

(async () => {
  await check('no quote -> nothing submitted', async () => {
    const d = standIn({ noQuote: true }); const { g } = open('a', d);
    assert.equal((await g.quote('p', { requestId: R, mediaType: 'video', content: { n: 1 } })).code, 'QUOTE_UNAVAILABLE');
    assert.equal((await g.submit('p', { requestId: R, quoteId: 'x' })).code, 'QUOTE_REQUIRED');
    assert.equal(d.calls.submit, 0);
  });
  await check('submit needs the confirmed quote id', async () => {
    const d = standIn(); const { g } = open('b', d); g.setBudget('p', 100);
    await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    assert.equal((await g.submit('p', { requestId: R })).code, 'CONFIRMATION_REQUIRED');
    assert.equal((await g.submit('p', { requestId: R, quoteId: 'stale' })).code, 'CONFIRMATION_REQUIRED');
    assert.equal(d.calls.submit, 0);
  });
  await check('over budget is refused with the excess', async () => {
    const d = standIn({ price: 40 }); const { g } = open('c', d);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    let r = await g.submit('p', { requestId: R, quoteId: q.quote.quoteId });
    assert.deepEqual([r.code, r.overByCredits], ['OVER_BUDGET', 40]); // default budget is 0
    g.setBudget('p', 50);
    assert.equal((await g.submit('p', { requestId: R, quoteId: q.quote.quoteId })).code, 'OK');
    const q2 = await g.quote('p', { requestId: 'shot-0002-take1', mediaType: 'video', content: {} });
    r = await g.submit('p', { requestId: 'shot-0002-take1', quoteId: q2.quote.quoteId });
    assert.deepEqual([r.code, r.overByCredits], ['OVER_BUDGET', 30]);
    assert.equal(d.calls.submit, 1);
  });
  await check('price change voids the old confirmation', async () => {
    const d = standIn({ price: 40 }); const { g } = open('d', d); g.setBudget('p', 500);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    d.mode.price = 60;
    assert.equal((await g.submit('p', { requestId: R, quoteId: q.quote.quoteId })).code, 'QUOTE_CHANGED');
    assert.equal((await g.submit('p', { requestId: R, quoteId: q.quote.quoteId })).code, 'QUOTE_REQUIRED');
    assert.equal(d.calls.submit, 0);
  });
  await check('repeat and restart query the original job: one submit only', async () => {
    const d = standIn({ settled: 38 }); const { g, dataDir } = open('e', d); g.setBudget('p', 100);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    const first = await g.submit('p', { requestId: R, quoteId: q.quote.quoteId });
    const again = await g.submit('p', { requestId: R, quoteId: q.quote.quoteId });
    const restarted = createGateway({ dataDir, drivers: { p: d } }); // new process, same ledger
    const third = await restarted.submit('p', { requestId: R, quoteId: q.quote.quoteId });
    assert.deepEqual([first.deduplicated, again.deduplicated, third.deduplicated], [false, true, true]);
    assert.equal(third.providerJobId, first.providerJobId);
    assert.equal((await restarted.quote('p', { requestId: R, mediaType: 'video', content: {} })).code, 'ALREADY_SUBMITTED');
    assert.equal(d.calls.submit, 1);
    const done = await restarted.query('p', { requestId: R });
    assert.deepEqual([done.state, done.settled.credits, done.settled.cash], ['ready', 38, null]);
    const f1 = await restarted.fetch('p', { requestId: R });
    const f2 = await createGateway({ dataDir, drivers: { p: d } }).fetch('p', { requestId: R });
    assert.deepEqual([f1.fromCache, f2.fromCache, f1.file.sha256 === f2.file.sha256, f1.file.bytes], [false, true, true, MP4.length]);
    assert.deepEqual([d.calls.submit, d.calls.fetch], [1, 1]);
  });
  await check('lost submit reply stops at pending reconcile', async () => {
    const d = standIn({ loseReply: true }); const { g, dataDir } = open('f', d); g.setBudget('p', 100);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    assert.equal((await g.submit('p', { requestId: R, quoteId: q.quote.quoteId })).code, 'PENDING_RECONCILE');
    d.mode.loseReply = false;
    const retry = await createGateway({ dataDir, drivers: { p: d } }).submit('p', { requestId: R, quoteId: q.quote.quoteId });
    assert.deepEqual([retry.code, retry.resubmitted, d.calls.submit], ['PENDING_RECONCILE', false, 1]);
    assert.equal((await g.query('p', { requestId: R })).code, 'PENDING_RECONCILE');
    assert.equal(g.ledger('p').committedCredits, 40); // the possible charge still counts
    assert.equal(g.reconcile('p', { requestId: R, providerJobId: 'job_found' }).state, 'running');
    assert.equal(d.calls.submit, 1);
  });
  await check('crash between intent and reply is not resubmitted', async () => {
    const d = standIn(); const { g, dataDir } = open('g', d); g.setBudget('p', 100);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    const file = path.join(dataDir, 'ledger.json'); const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    state.jobs[R].state = 'submitting'; state.jobs[R].submittedAt = 'x'; fs.writeFileSync(file, JSON.stringify(state));
    assert.equal((await g.submit('p', { requestId: R, quoteId: q.quote.quoteId })).code, 'PENDING_RECONCILE');
    assert.equal(d.calls.submit, 0);
  });
  for (const [mode, code] of [['truncate', 'DOWNLOAD_INCOMPLETE'], ['empty', 'DOWNLOAD_INCOMPLETE'], ['wrongType', 'MEDIA_TYPE_MISMATCH']]) {
    await check('broken download (' + mode + ') is never shown as done', async () => {
      const d = standIn({ [mode]: true }); const { g, dataDir } = open('h-' + mode, d); g.setBudget('p', 100);
      const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
      await g.submit('p', { requestId: R, quoteId: q.quote.quoteId }); await g.query('p', { requestId: R });
      const r = await g.fetch('p', { requestId: R });
      assert.deepEqual([r.code, r.file, r.state], [code, null, 'ready']);
      assert.deepEqual(fs.readdirSync(path.join(dataDir, 'media')), []);
    });
  }
  await check('existing file is kept, failure is visible', async () => {
    const d = standIn(); const { g, dataDir } = open('i', d); g.setBudget('p', 100);
    fs.writeFileSync(path.join(dataDir, 'media', R + '.mp4'), 'owner material');
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    await g.submit('p', { requestId: R, quoteId: q.quote.quoteId }); await g.query('p', { requestId: R });
    const r = await g.fetch('p', { requestId: R });
    assert.equal(r.file.name, R + '-1.mp4');
    assert.equal(fs.readFileSync(path.join(dataDir, 'media', R + '.mp4'), 'utf8'), 'owner material');
    const d2 = standIn({ fail: true }); const o2 = open('j', d2); o2.g.setBudget('p', 100);
    const q2 = await o2.g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    await o2.g.submit('p', { requestId: R, quoteId: q2.quote.quoteId });
    const failed = await o2.g.query('p', { requestId: R });
    assert.deepEqual([failed.state, failed.failure], ['failed', 'policy']);
    assert.equal((await o2.g.fetch('p', { requestId: R })).code, 'NOT_READY');
  });
  await check('fake credential never reaches ledger, files or replies', async () => {
    let hits = 0, scanned = 0;
    const walk = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f); else { scanned++; if (fs.readFileSync(f).includes(SECRET)) hits++; } } };
    walk(root);
    const d = standIn({ loseReply: true }); const { g } = open('k', d); g.setBudget('p', 100);
    const q = await g.quote('p', { requestId: R, mediaType: 'video', content: {} });
    const replies = JSON.stringify([q, await g.submit('p', { requestId: R, quoteId: q.quote.quoteId }), await g.query('p', { requestId: R }), g.ledger('p')]);
    assert.equal(replies.includes(SECRET), false);
    assert.ok(scanned > 10); assert.equal(hits, 0);
    results.push('     scanned ' + scanned + ' files under the test root, 0 hits');
  });
  await check('CapCut draft: structure, media copy and guards', async () => {
    const src = path.join(root, 'src'); fs.mkdirSync(src);
    const a = path.join(src, 'shot a.mp4'), b = path.join(src, 'b.mp4'), bad = path.join(src, 'bad.mp4');
    fs.writeFileSync(a, MP4); fs.writeFileSync(b, Buffer.concat([MP4, Buffer.from('b')])); fs.writeFileSync(bad, 'not a video');
    const staging = path.join(root, 'drafts');
    const clip = (p, ms) => ({ path: p, mediaType: 'video', durationMs: ms, width: 1280, height: 720 });
    const r = createDraft({ stagingRoot: staging, name: 'MV shot 01', clips: [clip(a, 5000), clip(b, 3000)] });
    assert.equal(r.code, 'OK');
    const c = JSON.parse(fs.readFileSync(path.join(r.folder, 'draft_content.json'), 'utf8'));
    const m = JSON.parse(fs.readFileSync(path.join(r.folder, 'draft_meta_info.json'), 'utf8'));
    assert.equal(fs.readFileSync(path.join(r.folder, 'draft_info.json'), 'utf8'), JSON.stringify(c));
    assert.deepEqual([c.duration, c.tracks.length, c.tracks[0].segments.length, m.tm_duration, m.draft_id], [8000000, 1, 2, 8000000, c.id]);
    const ids = new Set(Object.values(c.materials).flat().map(x => x.id));
    for (const s of c.tracks[0].segments) { assert.ok(ids.has(s.material_id)); assert.equal(s.extra_material_refs.length, 6); s.extra_material_refs.forEach(x => assert.ok(ids.has(x))); }
    assert.deepEqual(c.tracks[0].segments.map(s => s.target_timerange.start), [0, 5000000]);
    const reg = new Set(m.draft_materials[0].value.map(v => v.id));
    for (const v of c.materials.videos) { assert.ok(reg.has(v.local_material_id)); assert.ok(fs.existsSync(v.path)); assert.ok(v.path.startsWith(r.folder.replace(/\\/g, '/'))); }
    assert.deepEqual([c.platform.device_id, c.platform.hard_disk_id, c.platform.mac_address], ['', '', '']);
    const second = createDraft({ stagingRoot: staging, name: 'MV shot 01', clips: [clip(a, 1)] });
    assert.deepEqual([second.code, second.name, second.renamed, second.requestedName], ['OK', 'MV shot 01 (2)', true, 'MV shot 01']);
    fs.rmSync(second.folder, { recursive: true });
    assert.equal(createDraft({ stagingRoot: staging, name: '..\\escape', clips: [clip(a, 1)] }).code, 'INVALID_NAME');
    assert.equal(createDraft({ stagingRoot: staging, name: 'x1', clips: [clip(bad, 1)] }).code, 'MEDIA_TYPE_MISMATCH');
    assert.equal(createDraft({ stagingRoot: staging, name: 'x2', clips: [clip(path.join(src, 'none.mp4'), 1)] }).code, 'MEDIA_NOT_FOUND');
    assert.equal(createDraft({ stagingRoot: staging, name: 'x3', clips: [{ path: 'rel.mp4', mediaType: 'video', durationMs: 1, width: 1, height: 1 }] }).code, 'INVALID_CLIPS');
    assert.deepEqual(fs.readdirSync(staging), ['MV shot 01']);
    assert.deepEqual([fs.readFileSync(a).equals(MP4), fs.readdirSync(src).length], [true, 3]);
  });
  await check('CapCut draft: failed write leaves nothing (CD6), existing draft untouched (CD4), segments map to sources (CD3 offline)', async () => {
    const src = path.join(root, 'src6'); fs.mkdirSync(src);
    const a = path.join(src, 'a.mp4'), b = path.join(src, 'b.mp4');
    fs.writeFileSync(a, MP4); fs.writeFileSync(b, MP4);
    const staging = path.join(root, 'drafts6');
    const clip = (p, ms) => ({ path: p, mediaType: 'video', durationMs: ms, width: 1280, height: 720 });
    // Fault: the second copy fails after the first clip is already written.
    const real = fs.copyFileSync; let n = 0;
    fs.copyFileSync = (...args) => { if (++n === 2) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); return real(...args); };
    let r; try { r = createDraft({ stagingRoot: staging, name: 'broken', clips: [clip(a, 1000), clip(b, 1000)] }); } finally { fs.copyFileSync = real; }
    assert.equal(r.code, 'DRAFT_WRITE_FAILED'); assert.ok(r.message);
    assert.deepEqual(fs.readdirSync(staging), []);
    // Fault: the last JSON write fails.
    const write = fs.writeFileSync;
    fs.writeFileSync = (file, ...rest) => { if (String(file).endsWith('draft_meta_info.json')) throw new Error('io'); return write(file, ...rest); };
    try { r = createDraft({ stagingRoot: staging, name: 'broken', clips: [clip(a, 1000)] }); } finally { fs.writeFileSync = write; }
    assert.equal(r.code, 'DRAFT_WRITE_FAILED'); assert.deepEqual(fs.readdirSync(staging), []);
    // An existing draft with the same name is left byte-for-byte alone.
    const ok = createDraft({ stagingRoot: staging, name: 'kept', clips: [clip(a, 1000)] });
    const before = fs.readFileSync(path.join(ok.folder, 'draft_content.json'));
    const hashOf = require(path.join(dir, 'gateway-core.cjs')).sha256File;
    const tree = d => fs.readdirSync(d, { recursive: true }).sort().map(f => { const p = path.join(d, f); return f + ':' + (fs.statSync(p).isFile() ? hashOf(p) : 'dir'); }).join('|');
    const keptTree = tree(ok.folder);
    // Same name again, three times: each gets its own new folder and the reply carries the real path.
    const again = [1, 2, 3].map(() => createDraft({ stagingRoot: staging, name: 'kept', clips: [clip(b, 2000)] }));
    assert.deepEqual(again.map(x => [x.code, x.name, x.renamed]), [['OK', 'kept (2)', true], ['OK', 'kept (3)', true], ['OK', 'kept (4)', true]]);
    for (const x of again) {
      assert.equal(x.folder, path.join(staging, x.name)); assert.equal(x.requestedName, 'kept');
      const doc = JSON.parse(fs.readFileSync(path.join(x.folder, 'draft_content.json'), 'utf8'));
      const meta = JSON.parse(fs.readFileSync(path.join(x.folder, 'draft_meta_info.json'), 'utf8'));
      assert.equal(meta.draft_name, x.name);
      assert.ok(doc.materials.videos[0].path.startsWith(x.folder.split(path.sep).join('/') + '/')); assert.ok(fs.existsSync(doc.materials.videos[0].path));
    }
    assert.equal(new Set([ok, ...again].map(x => x.draftId)).size, 4);
    assert.equal(tree(ok.folder), keptTree);
    // A failed write under a taken name still leaves the earlier drafts and no leftovers.
    const w2 = fs.writeFileSync;
    fs.writeFileSync = (file, ...rest) => { if (String(file).endsWith('draft_info.json')) throw new Error('io'); return w2(file, ...rest); };
    try { r = createDraft({ stagingRoot: staging, name: 'kept', clips: [clip(a, 1000)] }); } finally { fs.writeFileSync = w2; }
    assert.equal(r.code, 'DRAFT_WRITE_FAILED');
    assert.deepEqual(fs.readdirSync(staging).sort(), ['kept', 'kept (2)', 'kept (3)', 'kept (4)']);
    assert.equal(tree(ok.folder), keptTree);
    assert.ok(fs.readFileSync(path.join(ok.folder, 'draft_content.json')).equals(before));
    // Every segment points at a copied file whose hash equals the source, with matching in, out and start.
    const c = JSON.parse(before); const man = JSON.parse(fs.readFileSync(path.join(ok.folder, 'gateway-manifest.json'), 'utf8'));
    const seg = c.tracks[0].segments[0], mat = c.materials.videos.find(v => v.id === seg.material_id);
    assert.equal(require(path.join(dir, 'gateway-core.cjs')).sha256File(mat.path), man.clips[0].sourceSha256);
    assert.deepEqual([seg.source_timerange.start / 1000, seg.source_timerange.duration / 1000, seg.target_timerange.start / 1000],
      [man.clips[0].inMs, man.clips[0].outMs, man.clips[0].startMs]);
  });
  await check('CapCut draft: 8 processes asking for one name at once get 8 different drafts (CD4 concurrency)', async () => {
    const src = path.join(root, 'src7'); fs.mkdirSync(src);
    const a = path.join(src, 'a.mp4'); fs.writeFileSync(a, MP4);
    const staging = path.join(root, 'drafts7'); fs.mkdirSync(staging);
    const one = { path: a, mediaType: 'video', durationMs: 1000, width: 16, height: 16 };
    const first = createDraft({ stagingRoot: staging, name: 'race', clips: [one] });
    const original = fs.readFileSync(path.join(first.folder, 'draft_content.json'));
    const go = path.join(root, 'go');
    // Each child waits for the same start file, then writes.
    const runner = path.join(root, 'runner.cjs');
    fs.writeFileSync(runner, [
      "const fs = require('fs');",
      "const [lib, staging, clip, go] = process.argv.slice(2);",
      "const { createDraft } = require(lib);",
      "const timer = setInterval(() => {",
      "  if (!fs.existsSync(go)) return;",
      "  clearInterval(timer);",
      "  const r = createDraft({ stagingRoot: staging, name: 'race', clips: [{ path: clip, mediaType: 'video', durationMs: 1000, width: 16, height: 16 }] });",
      "  console.log(JSON.stringify({ code: r.code, name: r.name, folder: r.folder, draftId: r.draftId }));",
      "}, 1);",
    ].join(String.fromCharCode(10)));
    const { spawn } = require('node:child_process');
    const runs = Array.from({ length: 8 }, () => new Promise(resolve => {
      const child = spawn(process.execPath, [runner, path.join(dir, 'capcut-draft.cjs'), staging, a, go]);
      let out = ''; child.stdout.on('data', d => out += d); child.on('close', () => resolve(JSON.parse(out)));
    }));
    await new Promise(resolve => setTimeout(resolve, 1500)); fs.writeFileSync(go, '');
    const done = await Promise.all(runs);
    assert.deepEqual(done.map(x => x.code), Array(8).fill('OK'));
    const names = done.map(x => x.name).sort();
    assert.deepEqual(names, [2, 3, 4, 5, 6, 7, 8, 9].map(n => 'race (' + n + ')'));
    assert.equal(new Set(done.map(x => x.draftId)).size, 8);
    for (const x of done) assert.equal(JSON.parse(fs.readFileSync(path.join(x.folder, 'draft_meta_info.json'), 'utf8')).draft_name, x.name);
    assert.ok(fs.readFileSync(path.join(first.folder, 'draft_content.json')).equals(original));
    assert.deepEqual(fs.readdirSync(staging).sort(), ['race', ...names]);
    results.push('     names taken by the 8 processes: ' + names.join(', '));
  });
  console.log(results.join('\n'));
  fs.rmSync(root, { recursive: true, force: true });
})();
