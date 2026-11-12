'use strict';
/* QQ final review on #82: the note's close button must not be squeezed into a one-character column, and the guard
   notice must use the primary text colour. Real task-view.html markup, real frame.css and frame.js in headless
   Chromium/Edge; host replies are fixtures; no installed plugin, desktop window or real engine. */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { spawn } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const frame = fs.readFileSync(path.join(ROOT, 'frame.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'frame.css'), 'utf8');
const view = fs.readFileSync(path.join(ROOT, 'task-view.html'), 'utf8');
const browser = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium',
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe')]
  .find(p => p && fs.existsSync(p));

function pageWith(mode) {
  const setup = `
  window.__active = ${mode === 'hold' ? 1 : 0}; window.__restart = ${mode === 'restart' ? 'true' : 'false'}; window.__bound = 'p_1';
  window.BroadcastChannel = class {
    constructor() { window.__ch = this; this.l = []; }
    addEventListener(_, f) { this.l.push(f); }
    removeEventListener(_, f) { this.l = this.l.filter(x => x !== f); }
    postMessage(m) {
      let r = { supported: false };
      if (m.type === 'bind') r = { project: window.__bound };
      else if (m.type === 'editor') r = { url: location.origin + '/editor' };
      else if (m.type === 'editor-ticket') r = { ticket: 't', project: window.__bound };
      else if (m.type === 'export-active') r = { known: true, active: window.__active, restartedWithExport: window.__restart };
      queueMicrotask(() => this.l.slice().forEach(f => f({ data: { ...r, reqId: m.reqId, answer: true } })));
    }
  };
  const wait = async (fn) => { for (let i = 0; i < 300; i++) { if (fn()) return true; await new Promise(r => setTimeout(r, 20)); } return false; };
  addEventListener('load', () => setTimeout(async () => {
    await wait(() => document.querySelector('iframe'));
    if (${mode === 'hold' || mode === 'restart' ? 'true' : 'false'}) {
      window.__bound = 'p_2';
      if (${mode === 'restart' ? 'true' : 'false'}) { window.__active = 0; window.__restart = true; }
      window.__ch.l.slice().forEach(f => f({ data: { type: 'task-project-switched', session: 't1', project: 'p_2' } }));
    }
    await wait(() => ${mode === 'hold' ? "document.getElementById('status').textContent.includes('正在导出视频')" : "!document.getElementById('exportNote').hidden"});
    const st = document.getElementById('status'), note = document.getElementById('exportNote');
    const btn = document.getElementById('exportNoteClose'), b = btn.getBoundingClientRect(), cs = getComputedStyle(btn);
    const obs = { mode: '${mode}', statusText: st.textContent, statusColor: getComputedStyle(st).color,
      buttons: [...st.children].filter(x => x.tagName === 'BUTTON').map(x => x.textContent),
      noteHidden: note.hidden, noteColor: getComputedStyle(note).backgroundColor,
      btnW: b.width, btnH: b.height, btnText: btn.textContent, btnFlex: cs.flexGrow, btnWrap: cs.whiteSpace };
    await fetch('/done', { method: 'POST', body: JSON.stringify(obs) });
  }, 0));
  `;
  let doc = view.replace(/<link[^>]*>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  doc = doc.replace('</head>', '<style>' + css + '</style></head>');
  doc = doc.replace('</body>', '<script>' + setup + '</script><script>' + frame + '</script></body>');
  return doc;
}

function run(t, mode) {
  return new Promise((resolve, reject) => {
    let obs = null, child = null;
    const server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/done') {
        let body = ''; req.on('data', d => { body += d; });
        req.on('end', () => { obs = JSON.parse(body); res.end('ok'); });
        return;
      }
      if (req.url.startsWith('/editor')) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><p>synthetic editor</p>'); return; }
      if (req.url.startsWith('/wake')) { res.end('{}'); return; }
      res.setHeader('Content-Type', 'text/html;charset=utf-8'); res.end(pageWith(mode));
    });
    server.listen(0, '127.0.0.1', () => {
      const url = 'http://127.0.0.1:' + server.address().port + '/task?session=t1';
      child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=420,700', url], { stdio: 'ignore' });
      const timer = setTimeout(() => { child.kill(); server.close(); reject(new Error('headless browser timed out: ' + mode)); }, 30000);
      const poll = setInterval(() => {
        if (!obs) return;
        clearInterval(poll); clearTimeout(timer);
        child.kill(); server.close();
        resolve(obs);
      }, 50);
      t.after(() => { clearInterval(poll); clearTimeout(timer); if (child) child.kill(); server.close(); });
    });
  });
}

test('#81 headless: 知道了 stays one line beside the 43-character note', { skip: !browser && 'Chrome/Edge unavailable', timeout: 45000 }, async t => {
  const o = await run(t, 'restart');
  assert.equal(o.noteHidden, false, JSON.stringify(o));
  assert.equal(o.btnText, '知道了');
  assert.equal(o.btnWrap, 'nowrap', 'the button must not wrap');
  assert.equal(o.btnFlex, '0', 'the button must not shrink');
  assert.ok(o.btnW >= 30 && o.btnH <= 40, 'one line, not a vertical column: ' + JSON.stringify(o));
});

test('#81 headless: the guard notice uses the primary colour and keeps its buttons', { skip: !browser && 'Chrome/Edge unavailable', timeout: 45000 }, async t => {
  const o = await run(t, 'hold');
  assert.ok(o.statusText.includes('这时候切换会把导出中断'), JSON.stringify(o));
  assert.deepEqual(o.buttons, ['等导出结束', '中断导出并切换']);
  assert.equal(o.statusColor, 'rgb(26, 26, 26)', 'primary text, not the secondary grey');
});
