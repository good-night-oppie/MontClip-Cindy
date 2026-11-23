// Provider-neutral job ledger: quote, single confirmation, deduplicated submit, recovery and fetch.
// Drivers supply the provider calls; this file never spawns a process or opens a socket itself.
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;
const MEDIA_TYPES = ['image', 'video', 'music', 'audio'];
const SIGNATURES = {
  video: [b => b.length > 11 && b.toString('latin1', 4, 8) === 'ftyp', b => b.length > 3 && b.readUInt32BE(0) === 0x1a45dfa3],
  image: [b => b.length > 7 && b.readUInt32BE(0) === 0x89504e47, b => b.length > 2 && b[0] === 0xff && b[1] === 0xd8,
    b => b.length > 11 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
  audio: [b => b.length > 11 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE',
    b => b.length > 2 && b.toString('latin1', 0, 3) === 'ID3', b => b.length > 1 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0,
    b => b.length > 3 && b.toString('latin1', 0, 4) === 'fLaC', b => b.length > 11 && b.toString('latin1', 4, 8) === 'ftyp'],
};
SIGNATURES.music = SIGNATURES.audio;
const EXTENSION = { video: '.mp4', image: '.png', audio: '.wav', music: '.wav' };

function sha256File(file) {
  const hash = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    for (let n; (n = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, n));
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

function matchesType(file, mediaType) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(file, 'r');
  let n;
  try { n = fs.readSync(fd, head, 0, 16, 0); } finally { fs.closeSync(fd); }
  return SIGNATURES[mediaType].some(test => test(head.subarray(0, n)));
}

function createGateway({ dataDir, drivers, now = () => new Date().toISOString() }) {
  const ledgerFile = path.join(dataDir, 'ledger.json');
  const mediaDir = path.join(dataDir, 'media');
  fs.mkdirSync(mediaDir, { recursive: true });

  function load() {
    try { return JSON.parse(fs.readFileSync(ledgerFile, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return { schema: 1, budgets: {}, jobs: {} };
      throw new Error('LEDGER_UNREADABLE');
    }
  }
  // Write-then-rename so a crash never leaves a half-written ledger.
  function save(state) {
    const temporary = ledgerFile + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(state, null, 1));
    fs.renameSync(temporary, ledgerFile);
  }
  const view = job => ({
    requestId: job.requestId, provider: job.provider, mediaType: job.mediaType, state: job.state,
    providerJobId: job.providerJobId || null, quote: job.quote || null, submittedAt: job.submittedAt || null,
    settled: job.settled || { credits: null, cash: null, currency: null, source: 'unknown' },
    file: job.file ? { name: job.file.name, bytes: job.file.bytes, sha256: job.file.sha256 } : null,
  });
  function spent(state, provider) {
    return Object.values(state.jobs).filter(j => j.provider === provider && j.submittedAt)
      .reduce((sum, j) => sum + j.quote.credits, 0);
  }
  function find(state, provider, requestId) {
    if (!REQUEST_ID.test(requestId || '')) return { error: { code: 'INVALID_REFERENCE' } };
    const job = state.jobs[requestId];
    if (!job || job.provider !== provider) return { error: { code: 'UNKNOWN_REQUEST', requestId } };
    return { job };
  }

  return {
    // Only the owner-facing settings path calls this; no Agent tool reaches it.
    setBudget(provider, credits) {
      if (!drivers[provider] || !Number.isSafeInteger(credits) || credits < 0) return { code: 'INVALID_BUDGET' };
      const state = load();
      state.budgets[provider] = credits;
      save(state);
      return { code: 'OK', provider, budgetCredits: credits };
    },

    async quote(provider, { requestId, mediaType, content }) {
      const driver = drivers[provider];
      if (!driver || !driver.quote) return { code: 'UNSUPPORTED_OPERATION' };
      if (!REQUEST_ID.test(requestId || '') || !MEDIA_TYPES.includes(mediaType)) return { code: 'INVALID_REFERENCE' };
      const state = load();
      const existing = state.jobs[requestId];
      if (existing && existing.state !== 'quoted') return { code: 'ALREADY_SUBMITTED', ...view(existing) };
      const contentHash = createHash('sha256').update(JSON.stringify([provider, mediaType, content])).digest('hex');
      let quoted;
      try { quoted = await driver.quote({ mediaType, content }); } catch { quoted = null; }
      if (!quoted || !Number.isSafeInteger(quoted.credits) || quoted.credits < 0)
        return { code: 'QUOTE_UNAVAILABLE', submitted: false };
      state.jobs[requestId] = {
        requestId, provider, mediaType, content, contentHash, state: 'quoted',
        quote: { quoteId: randomUUID(), credits: quoted.credits, cash: null, currency: null,
          cashBasis: 'unknown', basis: String(quoted.basis || 'provider quote').slice(0, 120), quotedAt: now() },
      };
      save(state);
      return { code: 'OK', ...view(state.jobs[requestId]) };
    },

    async submit(provider, { requestId, quoteId }) {
      const driver = drivers[provider];
      if (!driver || !driver.submit) return { code: 'UNSUPPORTED_OPERATION' };
      const state = load();
      const { job, error } = find(state, provider, requestId);
      if (error) return error.code === 'UNKNOWN_REQUEST' ? { code: 'QUOTE_REQUIRED', submitted: false } : error;
      if (job.providerJobId) return { code: 'OK', deduplicated: true, ...view(job) };
      if (job.state === 'submitting' || job.state === 'pending_reconcile') {
        job.state = 'pending_reconcile';
        save(state);
        return { code: 'PENDING_RECONCILE', resubmitted: false, ...view(job) };
      }
      if (!quoteId || quoteId !== job.quote.quoteId) return { code: 'CONFIRMATION_REQUIRED', submitted: false, ...view(job) };
      const budget = state.budgets[provider] || 0;
      const overBy = spent(state, provider) + job.quote.credits - budget;
      if (overBy > 0) return { code: 'OVER_BUDGET', submitted: false, overByCredits: overBy, budgetCredits: budget };
      // A changed price invalidates the confirmation the owner gave.
      let current;
      try { current = await driver.quote({ mediaType: job.mediaType, content: job.content }); } catch { current = null; }
      if (!current || current.credits !== job.quote.credits) {
        delete state.jobs[requestId];
        save(state);
        return { code: 'QUOTE_CHANGED', submitted: false };
      }
      // Record intent before the provider call: an unanswered call must never be repeated.
      job.state = 'submitting';
      job.submittedAt = now();
      save(state);
      let receipt;
      try { receipt = await driver.submit({ requestId, mediaType: job.mediaType, content: job.content }); } catch { receipt = null; }
      const fresh = load();
      const stored = fresh.jobs[requestId];
      if (!receipt || typeof receipt.providerJobId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.providerJobId)) {
        stored.state = 'pending_reconcile';
        save(fresh);
        return { code: 'PENDING_RECONCILE', resubmitted: false, ...view(stored) };
      }
      stored.providerJobId = receipt.providerJobId;
      stored.state = 'running';
      save(fresh);
      return { code: 'OK', deduplicated: false, ...view(stored) };
    },

    // The owner matched the lost submission to a provider job by hand.
    reconcile(provider, { requestId, providerJobId }) {
      const state = load();
      const { job, error } = find(state, provider, requestId);
      if (error) return error;
      if (job.state !== 'pending_reconcile' || !/^[A-Za-z0-9_-]{1,128}$/.test(providerJobId || '')) return { code: 'INVALID_REFERENCE' };
      job.providerJobId = providerJobId;
      job.state = 'running';
      save(state);
      return { code: 'OK', ...view(job) };
    },

    async query(provider, { requestId }) {
      const driver = drivers[provider];
      if (!driver || !driver.query) return { code: 'UNSUPPORTED_OPERATION' };
      const state = load();
      const { job, error } = find(state, provider, requestId);
      if (error) return error;
      if (!job.providerJobId) return { code: job.state === 'quoted' ? 'NOT_SUBMITTED' : 'PENDING_RECONCILE', ...view(job) };
      if (job.state === 'running') {
        let remote;
        try { remote = await driver.query({ providerJobId: job.providerJobId }); } catch { remote = null; }
        if (!remote) return { code: 'PROVIDER_UNREACHABLE', ...view(job) };
        if (remote.state === 'succeeded') job.state = 'ready';
        if (remote.state === 'failed') { job.state = 'failed'; job.failure = String(remote.reason || 'provider reported failure').slice(0, 120); }
        if (Number.isSafeInteger(remote.settledCredits)) job.settled = { credits: remote.settledCredits, cash: null, currency: null, source: 'provider job record' };
        save(state);
      }
      return { code: 'OK', ...view(job), failure: job.failure || null };
    },

    async fetch(provider, { requestId }) {
      const driver = drivers[provider];
      if (!driver || !driver.fetch) return { code: 'UNSUPPORTED_OPERATION' };
      const state = load();
      const { job, error } = find(state, provider, requestId);
      if (error) return error;
      if (job.file) {
        const kept = path.join(mediaDir, job.file.name);
        if (fs.existsSync(kept) && sha256File(kept) === job.file.sha256) return { code: 'OK', fromCache: true, ...view(job), path: kept };
        return { code: 'LOCAL_FILE_CHANGED', ...view(job) };
      }
      if (job.state !== 'ready') return { code: 'NOT_READY', ...view(job) };
      const partial = path.join(mediaDir, requestId + '.part');
      let expected;
      try { expected = await driver.fetch({ providerJobId: job.providerJobId, destination: partial }); } catch { expected = null; }
      const bytes = fs.existsSync(partial) ? fs.statSync(partial).size : 0;
      const complete = expected && bytes > 0 && (expected.bytes == null || expected.bytes === bytes);
      if (!complete || !matchesType(partial, job.mediaType)) {
        fs.rmSync(partial, { force: true });
        return { code: complete ? 'MEDIA_TYPE_MISMATCH' : 'DOWNLOAD_INCOMPLETE', ...view(job) };
      }
      // Never replace an existing file: the name is taken exclusively or a suffix is added.
      let name;
      for (let i = 0; ; i++) {
        name = requestId + (i ? '-' + i : '') + EXTENSION[job.mediaType];
        try { fs.closeSync(fs.openSync(path.join(mediaDir, name), 'wx')); break; }
        catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
      }
      fs.renameSync(partial, path.join(mediaDir, name));
      job.file = { name, bytes, sha256: sha256File(path.join(mediaDir, name)) };
      job.state = 'fetched';
      save(state);
      return { code: 'OK', fromCache: false, ...view(job), path: path.join(mediaDir, name) };
    },

    ledger(provider) {
      const state = load();
      const jobs = Object.values(state.jobs).filter(j => j.provider === provider).map(view);
      const budget = state.budgets[provider] || 0;
      return { code: 'OK', provider, budgetCredits: budget, committedCredits: spent(state, provider), jobs };
    },
  };
}

module.exports = { createGateway, sha256File, matchesType };
