# Integration candidate — 2026-11-05

Status: **Draft / pending review and installation acceptance**. No installation, restart, publication or merge performed. This is a review snapshot, not a recommendation to replace Europa preview.4.

## Reproducible sources

- Version: `0.5.1-preview.5-integration.20261105`.
- Plugin branch: `integration/review-candidate-20261105`, based on fetched main `85c8183ab60c98e06e03b03fa4e123feb4ca7334` in an isolated worktree.
- Integrated open PR heads: #7 `c97f275bcec6ea27ce20d7c611d9c6aed3f108cd`, #9 `f3312d9f537d46f23128ec2eeddd122439492e56`, #11 `0dfa868686d1faa78d38ceec5230e6bb8d531221`. These PRs are **not merged**. #7/#9 have GoodNightOppie APPROVED reviews at these heads; #11 has no review. Their reviews do not approve this combined candidate.
- Engine: `0ceb8703d1919cc8dc09fd72685cf03e97f24c88`, published on `good-night-oppie/MontClip` branch `integration/cindy-candidate-20261105`. Submodule and engine-lock.json agree.
- Engine ancestry starts at `22f04747f934ca73d5992c7da25dcd22f51ea55e`, preserving #149 (`6d6aba60`), #146 (`cb6e2623` via `c8b17a0b`) and #165 (`e1cea7d8` via `f24e98cc`). Adds #178's four commits (09d5b913/c8d4430f/2e1795cf/fec0cb2e), and #165 refill regression/fix (0c5adfd2/af1ce2b9). Cherry-pick resolution preserves #146's FFmpeg error wording and dynamic binary lookup.
- New integration changes: report the server's actual loopback origin, use PORT=0 plus private IPC in tests and a same-process readiness event in the plugin worker; record plugin commit/dirty state in SOURCE.json. No runtime npm dependencies added.
- #167 gap skipping and #185 website are not candidate dependencies. This is not an engine-main upgrade; do not merge the snapshot into upstream main as a rollback.
- Build: `npm test`; pack **only** `dist/montclip` through Cindy Forge. SOURCE.json records the exact plugin HEAD and engine pin. Candidate must have plugin.dirty=false, a clean engine, and matching pin. The final PR receipt supplies the package SHA256 and local path; generated packages/media are excluded from Git.

## Capability and validation matrix

All execution below is Windows / Node 22 / Edge. Linux runtime was **not run** on this candidate. Platform tests executed on Windows do not establish Linux native behavior.

| Capability | Source / result | Remaining acceptance |
|---|---|---|
| Task page and sidebar | `montclip_open_task_view`, task-view.html / panel.html; package asset and task isolation tests | Cindy real task UI not run |
| Click hidden layer | #11 root frame.css; Edge task/panel × light/dark, loading/hidden/error and negative control all pass | Cindy real window not run |
| Export job polling/cancel | #9; unit tests check immediate job, duplicate request, copy-before-done, failure and cancellation | Real Cindy working-card lifetime not run |
| Tool exposure | Built worker exposes `fablecut_analyze_reference` via `call_tool`; there is no `analyze-video` tool | Analysis-to-timeline acceptance remains a separate task |
| ASR manifest / missing model | #7; built worker stays alive and reports missing runtime/model; task projects isolated | Real speech model/download not run; #8 downloader intentionally not included |
| Linux H.264 fallback | #146 source retained, fallback/refusal tests and real server MP4 test run on Windows | Linux encoder and package executable permissions not run |
| Long-recording audio windows | #149: 13 tests pass, including synthetic FLV/MP3/MKV/MP4 clocks, 10-minute window, timestamp gap | Real recordings not used |
| ASR clock/refill | #165 clock tests and <3s repeated-refill test pass | Native Linux ASR not run |
| Export cleanup / finish | #178 failure/cancel stops encode and removes partials; done requires renamed file | Linux signal behavior not run |
| Real packaged compositor | `node tools/verify-candidate-export.cjs`: synthetic MP4 → 2s H.264/AAC MP4; flash/beep offset delta 0ms | Uses local FFmpeg 9.0.1 full Gyan build, **not** Cindy-downloaded LGPL binary |
| FLV direct timeline | Optional `--flv` experiment failed `presented frame timeout` | Normal import/proxy workflow and full FLV audiovisual acceptance not run; blocks claiming full video acceptance |

Engine focused suite: 61 pass / 0 fail / 0 skip after correcting test isolation (missing PATH removed the test decode binary) and increasing readiness timeout under parallel FFmpeg load. Refill regression: 1 pass / 0 fail / 0 skip. Plugin suite before provenance assertion: 22 pass / 0 fail / 0 skip; final exact-head count is in the PR receipt. New readiness and provenance regressions were observed failing before implementation. New engine source commits have identical source trees before/after noreply email correction.

No debug TCP port used. Test servers use unique temp data directories, 127.0.0.1 and PORT=0, and child IPC readiness. Browser checks use unique profiles; export runs the engine's own headless compositor. Old #186 launcher is not used. MP4 flash/beep is one synthetic clip; no multi-cut seam acceptance is claimed.

## Europa preview.4 isolation

Read-only Cindy SSH verified the author copy's SOURCE.json and package SHA256 `15a3192fd961f27785484d7b4cb77e34963b601f1d47a0e050b8058b46a2380c`. Running process version remains unknown / STOP_UNCONFIRMED. No process or installation directory was changed, and no real media was accessed or copied.

The seven author files match preview.4 ZIP entries. Removing the identified additions from server.js/mcp-server.js/mcp-tools.js/app.js/CLAUDE.md produces the exact SHA256 of the `22f04747` files:

| File | Difference from engine baseline | Included here |
|---|---|---|
| lyrics-search.cjs | New 4177-byte local fuzzy matching module, 12–3000 normalized characters, 1–10 candidates, playback review required | No |
| server.js | +1006 bytes: whole-recording `/api/lyrics/search`, rejects partial transcripts | No |
| mcp-server.js | +339 bytes: `fablecut_find_lyrics` handler | No |
| mcp-tools.js | +623 bytes: tool schema | No |
| app.js | +4031 bytes: lyric search dialog/button, Source monitor audition then manual insertion | No |
| CLAUDE.md | +664 bytes of lyric search instructions | No |
| README.md | Only 664 bytes of lyric notes; baseline README 2256 bytes not retained in author package | No |

No reviewable lyric commit was found; this comparison does not prove every other preview.4 file is unchanged. Deja must decide the separate lyric source/PR and installation sequence. Candidate is not capability-equivalent to preview.4.

## Review and installation gates

Review Inbox SOP was read at jj-agent `727c89e56ad7b4629c562dc6bf1e1c05662fb909`. Independent repository is not configured for the Inbox; no config/service mutation attempted. Draft PRs are excluded by the SOP anyway. Request GoodNightOppie and mark `@QQ 请审`; this does not mean the PR has entered Inbox or received approval. QQ/Rea review, VV/JJ UI/product acceptance, and Deja decision remain outstanding. All required approvals remain pending; no self-merge.

Target Europa Cindy version/source commit could not be established from the supplied author copy, so working-card persistence and host integration are unverified. Existing minCindyVersion is preserved; no new host API is introduced. The referenced `.cursor/rules/agentic-coding-steps.mdc` is absent in this checkout; this document records the integration execution and validation evidence instead of claiming that unavailable workflow ran.

Next: review this exact snapshot and package receipt; resolve FLV/real-host/Linux gaps and the isolated lyric branch decision; only DD, after authorization, should use the formal installer with the exact instanceId. This task does not install.
