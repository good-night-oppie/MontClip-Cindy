# Hidden status overlay: independent plugin package

Base: MontClip-Cindy `85c8183a`; pinned engine remains
`5b312e634ad092b253577f390de98d9c30824fb6`. No version or permission change.

The root `frame.css` is copied to `dist/montclip` by `build.cjs`.
Fixing the old engine repository's plugin directory (MontClip #184) does not
update this package. Both plugin wrapper pages use the root stylesheet.

Decision: honor `hidden` with `display: none !important` so author flex rules
cannot leave hidden overlays in layout or hit testing. Removing `hidden`
still shows loading/error content. This is independently derived from this
repository's HTML/CSS and browser behavior; no external reverse-engineering
materials or SPEC were used. No new dependency or user-facing text.

## Reproduce

```sh
npm test
node tools/verify-frame-hit.cjs "<Edge-or-Chromium-executable>"
```

The optional browser probe uses built wrapper HTML/CSS and a synthetic iframe.
It removes wrapper scripts, so it does not test Cindy's bridge or engine load.
It checks task/panel in light/dark mode: loading visible, hidden overlay absent
with iframe hit, error visible again, and a negative control with the fix removed.
Generated browser profiles and HTML stay in the reported temporary directory.

## Observed on Windows, 2026-11-05

- Test-first run: 9 tests, 8 passed, 1 failed (new packed CSS guard), 0 skipped.
- After fix: 9 passed, 0 failed, 0 skipped. Includes built worker/task isolation.
- Edge headless: all 4 page/theme cases passed all 4 checks, including negative controls.
- Forge packed `dist/montclip/montclip-0.5.1.cindy`; not installed or published.
- ZIP entries `frame.css`, `frame.js`, `task-view.html`, `panel.html` matched
  source content. Package SHA-256:
  `0297cec29ff403d1a8420bb6484260eb0b34c9521433b2621807c25dbc1a7a02`.
- `git diff --check` passed.

Linux local tests, Europa installed-package checks, actual Cindy window clicks,
and the full backup/edit/undo/reopen/export/audio-video acceptance were not run.
The target Europa Cindy build/source was not verified in this CSS-only check;
no new host API compatibility claim is made. This candidate is not a replacement
for Europa's additional platform fixes and is not a base-system approval.
