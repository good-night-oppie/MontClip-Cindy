// Local development derivative of Art. No shell, no credential input, no paid CLI verbs.
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { homedir } = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const { promisify } = require('node:util');
const { createGateway } = require('./gateway-core.cjs');
const { createDraft } = require('./capcut-draft.cjs');

const execute = promisify(execFile);
const binary = path.join(homedir(), 'bin', 'dreamina-canvas.exe');
const expectedHash = '1f764bc64fc7d43d451547b664cd0f6ebd4b1e74013a98fdee8a4acb0ba15876';
const dataDir = path.join(homedir(), '.cindy-media-gateway-dev');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Paid submission is compiled out of this build. Turning it on needs the owner's account,
// a budget and the security review recorded on the ticket.
const SPENDING_ENABLED = false;

// Runs one allow-listed read of the pinned Dreamina CLI and returns only typed fields.
async function dreaminaRead(method, args) {
  let command;
  switch (method) {
    case 'version': command = ['version']; break;
    case 'connection': command = ['auth', 'status']; break;
    case 'quote':
      if (!uuid.test(args.projectId) || !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(args.nodeId || '')) return { code: 'INVALID_REFERENCE' };
      command = ['node', 'quote', '--project-id', args.projectId, '--node-id', args.nodeId];
      break;
    case 'query':
      if (!uuid.test(args.projectId) || !uuid.test(args.submitId)) return { code: 'INVALID_REFERENCE' };
      command = ['operation', 'status', args.submitId, '--project-id', args.projectId];
      break;
    default: return { code: 'UNSUPPORTED_OPERATION' };
  }
  if (process.platform !== 'win32' || process.arch !== 'x64') return { code: 'UNSUPPORTED_PLATFORM' };
  try {
    const hash = createHash('sha256');
    for await (const chunk of fs.createReadStream(binary)) hash.update(chunk);
    if (hash.digest('hex') !== expectedHash) return { code: 'UNVERIFIED_CLI_BUILD' };
  } catch (error) {
    return { code: error.code === 'ENOENT' ? 'CLI_NOT_INSTALLED' : 'CLI_UNREADABLE' };
  }
  try {
    const { stdout } = await execute(binary, ['--format', 'json', '--non-interactive', '--profile', 'cindy-art-gateway-dev', ...command],
      { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024 });
    const { schemaVersion, ok, data } = JSON.parse(stdout);
    if (schemaVersion !== '2' || ok !== true || !data) return { code: 'UNRECOGNIZED_RESPONSE' };
    if (method === 'version' && data.version === '1.4.0' && data.commit === '68e27033')
      return { code: 'OK', version: data.version, build: data.commit };
    if (method === 'connection' && typeof data.loggedIn === 'boolean') return { code: 'OK', connected: data.loggedIn };
    if (method === 'quote' && Number.isSafeInteger(data.totalMaxCredits) && data.totalMaxCredits >= 0)
      return { code: 'OK', maximumCredits: data.totalMaxCredits, cash: null, currency: null, authorizesSpend: false };
    if (method === 'query' && typeof data.state === 'string' && /^[a-z_]{1,40}$/.test(data.state))
      return { code: 'OK', state: data.state, projectId: args.projectId, submitId: args.submitId };
    return { code: 'UNRECOGNIZED_RESPONSE' };
  } catch (error) {
    // Upstream messages can contain signed URLs, diagnostics or user input.
    let providerCode = null;
    try { const n = JSON.parse(error.stdout).error.code; if (Number.isSafeInteger(n)) providerCode = n; } catch {}
    return { code: 'CLI_READ_FAILED', providerCode };
  }
}

// Ledger drivers. Dreamina can quote today; its submit and download verbs are not wired.
const drivers = {
  dreamina: {
    async quote({ content }) {
      const read = await dreaminaRead('quote', content || {});
      return read.code === 'OK' ? { credits: read.maximumCredits, basis: 'Dreamina CLI node quote (credit ceiling)' } : null;
    },
  },
  flow: {},
  capcut: {},
};
const gateway = createGateway({ dataDir, drivers });

// Looks for a file on PATH without running it.
function onPath(names) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of names) if (dir && fs.existsSync(path.join(dir, name))) return true;
  }
  return false;
}

const UNVERIFIED = { code: 'OFFICIAL_AGENT_INTERFACE_UNVERIFIED', message: '目前还没有核实可从 Cindy 调用这项服务的官方方式。' };
const BILLING = { cashQuote: 'unknown', settledChargePerJob: 'unknown' };

async function capabilities(provider) {
  if (provider === 'dreamina') {
    const version = await dreaminaRead('version', {});
    const connection = version.code === 'OK' ? await dreaminaRead('connection', {}) : null;
    return {
      route: 'Dreamina Canvas CLI (official, runs on this computer)', routeKind: 'official_cli',
      cli: version.code === 'OK' ? { version: version.version, build: version.build } : { code: version.code },
      connected: connection && connection.code === 'OK' ? connection.connected : 'unknown',
      accountEntitlements: 'unknown',
      operations: { version: 'wired', connection: 'wired', quote: 'wired', query: 'wired', ledger: 'wired',
        submit: 'disabled_in_this_build', fetch: 'not_wired', cancel: 'not_documented' },
      billing: { ...BILLING, creditQuote: 'credit ceiling for a saved node' },
      openGaps: ['owner account connection', 'paid submit and download verbs', 'per-job charge record'],
    };
  }
  if (provider === 'flow') {
    return {
      route: 'none official; third-party gflow CLI drives a signed-in browser profile', routeKind: 'third_party_browser_automation',
      adapterInstalled: onPath(['gflow.exe', 'gflow.cmd', 'gflow']), adapterApproved: false, connected: 'unknown',
      accountEntitlements: 'unknown',
      operations: { ledger: 'wired', quote: 'blocked', submit: 'blocked', query: 'blocked', fetch: 'blocked', cancel: 'not_available' },
      billing: { ...BILLING, creditQuote: 'no standalone quote; only a per-run credit cap', settledChargePerJob: 'balance only' },
      openGaps: ['owner approval for browser automation of a Google account', 'security review of the third-party CLI',
        'its usage telemetry and update check must be switched off', 'no quote before submit', 'no per-job charge record'],
    };
  }
  return {
    route: 'generation: none verified; editing handoff: local draft files', routeKind: 'local_draft_files',
    connected: 'not_needed_for_drafts', accountEntitlements: 'unknown',
    operations: { draft: 'wired', ledger: 'wired', quote: 'blocked', submit: 'blocked', query: 'blocked', fetch: 'blocked' },
    billing: BILLING, draftTarget: 'CapCut 9.4.0 for Windows',
    openGaps: ['official interface for CapCut generation', 'placing the draft in the CapCut project store', 'opening the draft in CapCut'],
  };
}

async function operation(args = {}) {
  const { provider, operation: op } = args;
  if (!drivers[provider]) return { code: 'UNKNOWN_PROVIDER' };
  if (op === 'capabilities') return { code: 'OK', ...(await capabilities(provider)) };
  if (op === 'ledger') return gateway.ledger(provider);
  if (provider === 'capcut' && op === 'draft')
    return createDraft({ stagingRoot: path.join(dataDir, 'capcut-drafts'), name: args.name, clips: args.clips });
  if (provider !== 'dreamina') {
    return ['version', 'connection', 'quote', 'submit', 'query', 'cancel', 'fetch', 'import'].includes(op) ? UNVERIFIED : { code: 'UNSUPPORTED_OPERATION' };
  }
  switch (op) {
    case 'version': case 'connection': return dreaminaRead(op, args);
    case 'quote':
      if (args.requestId === undefined) return dreaminaRead('quote', args);
      return gateway.quote('dreamina', { requestId: args.requestId, mediaType: args.mediaType || 'video',
        content: { projectId: args.projectId, nodeId: args.nodeId } });
    case 'query':
      return args.requestId === undefined ? dreaminaRead('query', args) : gateway.query('dreamina', { requestId: args.requestId });
    case 'submit':
      if (!SPENDING_ENABLED) return { code: 'SPENDING_DISABLED', submitted: false };
      return gateway.submit('dreamina', { requestId: args.requestId, quoteId: args.quoteId });
    case 'fetch': return gateway.fetch('dreamina', { requestId: args.requestId });
    case 'cancel': return { code: 'CANCEL_UNAVAILABLE', message: '平台没有公开的取消方式；已提交的任务可能照常扣费。' };
    default: return { code: 'UNSUPPORTED_OPERATION' };
  }
}

readline.createInterface({ input: process.stdin }).on('line', async line => {
  let id = null;
  try {
    const request = JSON.parse(line);
    id = request.id;
    const result = request.method === 'operation' ? await operation(request.params) : { code: 'UNSUPPORTED_OPERATION' };
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid request' } }) + '\n');
  }
});
