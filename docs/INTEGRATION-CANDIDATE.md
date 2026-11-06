# Integration candidate — 2026-11-05

当前独立 trial.8 的冻结包、上游 #172/#175/#176/#154 覆盖及严格依赖顺序见 [产品覆盖与 Video 剩余验收](TRIAL8-PRODUCT-COVERAGE.md)。下文是 preview.7 历史证据，不代表 trial.8 已包含后续上游产品功能，也不代表当前实装/审批状态。

Status: **Draft / pending review and installation acceptance**. No installation, restart, publication or merge performed. This is a review snapshot, not a recommendation to replace Europa preview.4.

## Reproducible sources

- Version: `0.5.1-preview.7.int20261106`.
- Plugin branch: `integration/review-candidate-20261105`, based on fetched main `85c8183ab60c98e06e03b03fa4e123feb4ca7334` in an isolated worktree.
- Integrated open PR heads: #7 `c97f275bcec6ea27ce20d7c611d9c6aed3f108cd`, #9 `f3312d9f537d46f23128ec2eeddd122439492e56`, #11 `0dfa868686d1faa78d38ceec5230e6bb8d531221`. These PRs are **not merged**. #7/#9 have GoodNightOppie APPROVED reviews at these heads; #11 has no review. Their reviews do not approve this combined candidate.
- Engine: `2866d4d850de88b80315dd83a4eba5d501160ccc`, published on `good-night-oppie/MontClip` branch `integration/cindy-candidate-20261105`. Submodule and engine-lock.json agree.
- Engine ancestry starts at `22f04747f934ca73d5992c7da25dcd22f51ea55e`, preserving #149 (`6d6aba60`), #146 (`cb6e2623` via `c8b17a0b`) and #165 (`e1cea7d8` via `f24e98cc`). Adds #178's four commits (09d5b913/c8d4430f/2e1795cf/fec0cb2e), and #165 refill regression/fix (0c5adfd2/af1ce2b9). Cherry-pick resolution preserves #146's FFmpeg error wording and dynamic binary lookup.
- New integration changes: report the server's actual loopback origin, use PORT=0 plus private IPC in tests and a same-process readiness event in the plugin worker; record plugin commit/dirty state in SOURCE.json. No runtime npm dependencies added.
- #167 gap skipping and #185 website are not candidate dependencies. This is not an engine-main upgrade; do not merge the snapshot into upstream main as a rollback.
- Build: `npm test`; pack **only** `dist/montclip` through Cindy Forge. SOURCE.json records the exact plugin HEAD and engine pin. Candidate must have plugin.dirty=false, a clean engine, and matching pin. The final PR receipt supplies the package SHA256 and local path; generated packages/media are excluded from Git.

## Legacy plugin review mapping — 2026-11-06

Read the live, read-only Review Inbox `/api/pr?key=good-night-oppie%2FMontClip%23N` for #113/#114/#116. The mapped review heads are #116 `0132589557bcc601d06b6059ef9046186b757cf0`, #114 `69a3f12c734502f6778344cbf8385c60d5bba876`, #113 `fb988484ef3a81695cba9ae9100a0dbb3b3dbe6e`. Source before this pass was plugin `389b125a` / engine `0ceb8703`; the issues below were checked against that candidate, not assumed fixed by migration.

| Legacy finding / feature | Candidate before this pass | Independent files and fixing commit | Test evidence |
|---|---|---|---|
| #116 hard-link-only delivery fails on exFAT/FAT32 | Still present in `node/lib.cjs:deliverFiles`, inherited via `ae96b98` | `node/lib.cjs`, `0d5483e`: fall back to `COPYFILE_EXCL`, retry concurrent EEXIST without replacement | `test/export-delivery.test.cjs`: 5 tests first fail, then pass; ENOTSUP/EPERM/EOPNOTSUPP, name race, error cleanup. Actual exFAT/FAT32 disk not tested |
| #116 expired delivery retry stays forever in “still exporting” | Legacy retry path still restores old card; #9 follower avoids the old fixed poll deadline but does not preserve expired results | `main.js`, `node/worker.cjs`, `2112d19` + `2a43017`: terminal NO_JOB wording and exports-folder action; last 200 observed completed results persist across worker restart; selected folder association retained; archive-write failure does not hide finished output | `test/export-recovery.test.cjs`: 2 tests first fail, then pass, including real worker restart and simulated engine 404; storage failure tested. `test/export-job.test.cjs` polling tests retained |
| Persistent recovery must remain task scoped | Found in independent review of the new archive; fixed before packaging | Same files, `546e800`: compare caller session for live/archive reads, delivery/cancel/picked-folder access; block foreign cached main-process follower | Recovery test rejects task-B query/delivery of task-A after restart. Main follower cross-task test first fails, then passes |
| #114 hue/blur/duck and other keyframes show internal keys | Still present in independent `embed/panel-model.js:propName`; inherited common-property labels from `10bc16e` were incomplete | `embed/panel-model.js`, `b2f2268` (with own-property guard in `7c852b6`): names for all current animatable channels and generic unknown fallback | `test/panel-labels.test.cjs`: 2 tests first fail, then pass; enumerates engine ANIMATABLE, checks hue/blur/duck units and unknown identifier suppression |
| #114 main transcript time applied inside a composition | Still present in pinned `engine/app.js:startHostChannel/onUiCommand`; both channel and API paths reproduced | Engine `app.js`, `docs/demo/app.js`, `b1e4235d`: report compOpen and reject both seek paths. Plugin `embed/panel.js`, `embed/panel.html`, pin/lock, `7c852b6`; API fallback regression `0653cf4` | Engine `test/sidebar-context.test.js`: 2 first fail then pass. Plugin `test/panel-context.test.cjs`: 2 pass, including disabled button, no seek, cleared mismatched properties, return-to-main and API fallback message. VM/DOM harness, not Cindy real window |
| #113 embedded task view / frame / worker | Already migrated | Independent shell commit `76317df54cfe56b6efd8591ee1d4457a9a9bdcc7`: `frame.js`, `frame.css`, `task-view.html`, `node/worker.cjs`, `node/lib.cjs`. Panel source `c64ac3b`, copy updates `8140fcb` | `test/packed.test.cjs`: source/build parity, authenticated asset serving, task project isolation. Existing old `test-tools` browser scripts were not rerun because their launch isolation was not audited; current #11 isolated browser check remains separate evidence |
| #113 reload undo/redo snapshot normalization | Already in original candidate engine pin | `engine/app.js:outsideEditStep/snapshotKey/stableJson/restoreUndoStack`; source `9be6b17a018dcbad3972c22b4b0da90c267f0ca6`, ancestor of both old and new pins | Four selected `engine/test/cindy-engine-split.test.js` tests pass: linked-stem reload, disabled group reload, redo preservation, object-key vs array ordering |

No old `plugins/montclip-cindy` file or another worker's branch was changed. Shared composition behavior changed only in this task's published engine integration branch, then its submodule pin was updated. Each defect has its own commit, with failing evidence before the implementation. No unreviewed historical feature PR was swept into the candidate.

Approval facts are separate from code coverage: Inbox #114 and #116 still say `changes_needed` at the old heads; this pass has not changed their review verdicts. #114's cached green CI / approved_head is `c52f662c`, **not** its current `69a3f12c` head. #113 Inbox is `lgtm` and six successful checks at `fb988484`, but its base #112 remains OPEN at `24dae388b27c67fc0bea71c3b40c2a117ced4183` (GitHub currently reports mergeable=false). Formal role approvals remain incomplete. None of these facts authorize merging #112/#113 or this candidate.

Recovery limits: only completed results actually observed by the worker can be archived, and only the most recent 200 are retained. A worker stopped before seeing completion cannot reconstruct an unknown job; it now shows a clear expired-record message and folder action. This does not implement unattended completion recovery or recreate old chat cards after a host restart. On filesystems without hard links, exclusive-copy fallback protects existing files but the final filename can be visible while copying; done is reported only after copying finishes. Genuine write errors remain errors.

New visible wording (pending JJ review): “这次导出的记录已失效。请打开导出文件夹查看已有成片；没有找到的话，可以重新导出。你的剪辑都还在。” / “正在编辑合成。请先返回主时间线，再定位文稿或查看主时间线片段的属性。” Keyframe examples: “色相（度）”“模糊（像素）”“自动压低音量（分贝）”; unknown fields: “其他属性”.

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

Review Inbox SOP was read at jj-agent `727c89e56ad7b4629c562dc6bf1e1c05662fb909`; QQ subsequently corrected the submission wording. For future submissions the first line is plain “QQ 请审” (no @ and no code formatting), and requesting reviewer GoodNightOppie is required. The body marker is for people, not the Inbox intake condition. Existing inline-code markers need not be rewritten.

Draft PRs can already be in the Inbox, but are not automatically agent-reviewed while Draft; explicitly assigned teammate pre-review can proceed. Do not conflate intake, pre-review, formal approval and merge authorization.

Separate configuration limitation: this independent repository was not in the observed Inbox repository configuration. This task has not changed configuration or restarted its service, and does not claim intake based only on a reviewer request. QQ/Rea review, VV/JJ UI/product acceptance, Deja's engineering decision and all required role approvals remain outstanding. Current-head checks and approval gates are unchanged; no self-merge.

## Additional fixes in preview.7 — 2026-11-06

This continues PR #12 and all previous fixes; it does not reset to main. Sources remain open/unapproved dependencies, not merged PR claims.

| Source | Applicable files / integration | Validation and limits |
|---|---|---|
| #190 b2ad3fc65a1b5109f6aaa064c3ccf754c384b63a | f8b7f248 ports full product chain 7e747ba9 → 9dd795af → 17cc2f3e → 6818d271 and e51bfb7c boundary tests: encode-profiles.js, server.js, app.js/demo mirror, four prores tests and ADR | 48 tests: mute, legal -filter:1, -shortest as a value, absent audio, stream maps, real PCM tail, decimal/rational sample edges, REST rejection before session allocation and friendly UI. Existing h264Refusal API retained in the only runtime conflict; 85f26d71 adapts mocks to retained preflight. Historical media/website/report artifacts excluded. Generic failure wording still pending JJ; no new recovery UX claimed |
| #125 8dd7c4050e1f5e8bc97995d879f31c4705409d53 | Original ab1a3357/114bbdd6 already ancestors; only new delta cherry-picked as 5acbf3db: app.js/demo mirror and export-h264-precheck.test.js | Encoder discovery cancellation and stale confirmation protections pass. 85f26d71 removes conflicting duplicate test mock and pins actual test FFmpeg before clearing PATH. Hardware-only no-local-FFmpeg case skipped |
| #186 d9a1842988859f7dac0d6049898c61015f3b7486 | 2866d4d8 ports final CLAUDE.md opaque hard-edge radius:0 recipe, reference/privacy-cover.md, final privacy-runtime/cover/check harness and privacy-runtime tests; build explicitly includes the linked text reference | Ownership, wrong service/profile/session rejection and explicit tool selection tests pass. Actual gated FFmpeg replaces Node executable test doubles; invalid explicit path fails closed. No compositor change. Full blur/cover pixel matrix not rerun; no accepted button or real Cindy workflow claim. Website and historical binary evidence excluded |
| #138 c2865c30a48c7472c86cff35ca55ee276ba70207 | Not applicable: montclipReveal is Electron preload/main/export-downloads only, excluded from plugin build | No plugin runtime inclusion claimed; plugin delivery continues through its own tested delivery/recovery code |
| #140 | Acceptance script, not runtime functionality | Not included; unrelated demonstration assets excluded |

Current Windows evidence: npm test 35 passed / 0 failed / 0 skipped; combined engine suite 132 tests: 131 passed / 0 failed / 1 skipped (hardware encoder with no local FFmpeg unavailable under the test isolation). Reload suite 4/4; task/panel light/dark hit-test cases 4/4 including negative controls. These tests run on the integrated runtime, not upstream CI alone.

New tools/verify-candidate-workflow.cjs runs against an explicitly selected extracted Forge package. It uses synthetic H.264/AAC MP4 and FLV, actual importFiles upload/preparation, addClipFromMedia (video plus linked audio), setAnimProp x=0→37, undo to x=0, flushSave and fastExport. It inspects H.264/audio streams, duration and flash/beep drift. This is real browser application-function execution, not a physical click/Cindy host UI test. Development run passed both formats; final package receipt must record the repeated run after Forge. FLV here is the normal H.264/AAC remux path; other codecs/transcode-consent paths remain untested. The earlier FLV direct-timeline presented frame timeout remains a known failed bypass experiment, not proof that the normal proxy chain fails.

The harness uses exclusive DATA/XDG/profile/temp directories, Linux short /tmp prefix with 0700, PORT=0 + authenticated IPC/proof, private CDP pipe, external request denial, 180-second overall timeout and owned-child cleanup. No existing server/browser is adopted; no sandbox disabling flags. Tested Node v22.15.1, browser Chrome/156.0.8078.80 (installed Edge), system FFmpeg/ffprobe 9.0.1 Gyan full build. No unknown tool downloaded.

**Not completed:** Linux/Europa runtime, real Cindy UI/working cards, actual exFAT/FAT32 and Cindy-downloaded LGPL binaries; full privacy pixel acceptance and non-remux FLV paths. Preview.4 seven-file lyric capability is still absent. No formal seven-item video acceptance, installation, restart, merge or publication is authorized by this receipt. Exact final plugin head, SOURCE clean proof, package SHA256 and local/Europa path are supplied in PR #12's handoff receipt. Transfer only to /home/admin/montclip-review/candidates/<plugin-short-SHA>/, never the installed instance. Draft allows assigned human pre-review, not approval.

Target Europa Cindy version/source commit could not be established from the supplied author copy, so working-card persistence and host integration are unverified. Existing minCindyVersion is preserved; no new host API is introduced. The referenced `.cursor/rules/agentic-coding-steps.mdc` is absent in this checkout; this document records the integration execution and validation evidence instead of claiming that unavailable workflow ran.

Next: review this exact snapshot and package receipt; resolve FLV/real-host/Linux gaps and the isolated lyric branch decision; only DD, after authorization, should use the formal installer with the exact instanceId. This task does not install.
