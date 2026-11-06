"use strict";
// Optional real-browser check of built wrapper assets, not a Cindy integration test.
// node tools/verify-frame-hit.cjs <Edge-or-Chromium-executable>
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const browser = process.argv[2];
assert.ok(browser && fs.existsSync(browser), "Supply an Edge or Chromium executable");
const dist = path.resolve(__dirname, "../dist/montclip");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "montclip-frame-hit-"));
const css = fs.readFileSync(path.join(dist, "frame.css"), "utf8");
const results = [];
for (const page of ["task-view.html", "panel.html"]) {
  for (const theme of ["light", "dark"]) {
    const id = `${page}-${theme}`;
    let html = fs.readFileSync(path.join(dist, page), "utf8")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      .replace('<link rel="stylesheet" href="frame.css">', `<style id="styles">${css}</style>`);
    html = html.replace("</body>", `<script>
      document.documentElement.style.colorScheme = ${JSON.stringify(theme)};
      const overlay = document.getElementById('status');
      const frame = document.createElement('iframe');
      frame.className = 'engine';
      document.body.append(frame);
      const hit = () => document.elementFromPoint(innerWidth / 2, innerHeight / 2);
      const shown = () => getComputedStyle(overlay).display === 'flex' && hit() === overlay;
      const loading = shown();
      overlay.hidden = true;
      const hidden = getComputedStyle(overlay).display === 'none' && hit() === frame;
      overlay.className = 'error'; overlay.hidden = false;
      const error = shown();
      overlay.hidden = true;
      const sheet = document.getElementById('styles').sheet;
      // Negative control: remove only the fix and require the old click obstruction.
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        if (sheet.cssRules[i].selectorText === '[hidden]') sheet.deleteRule(i);
      }
      const negative = shown();
      const result = document.createElement('pre'); result.id = 'result';
      result.textContent = JSON.stringify({loading, hidden, error, negative});
      document.body.append(result);
    </script></body>`);
    const fixture = path.join(scratch, `${id}.html`);
    fs.writeFileSync(fixture, html);
    const run = spawnSync(browser, ["--headless", "--disable-gpu", "--no-first-run",
      `--user-data-dir=${path.join(scratch, id + '-profile')}`, "--dump-dom", pathToFileURL(fixture).href],
      { encoding: "utf8", timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    const match = run.stdout.match(/<pre id="result">(.*?)<\/pre>/);
    assert.ok(match, "Browser did not produce the result");
    const result = JSON.parse(match[1]);
    results.push({page, theme, ...result});
    assert.deepEqual(result, {loading:true, hidden:true, error:true, negative:true}, id);
  }
}
console.log(JSON.stringify({results, fixtures: scratch}, null, 2));
