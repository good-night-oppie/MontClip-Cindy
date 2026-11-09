# Issue 17 / PR 48: pin to E1–E5 main, task tickets and panel channel

Owner: Cindy. Same Draft PR, append-only. This replaces the ccb789f2 candidate, which lacked
E3/E5 and could not be used by the unchanged worker (job/ticket without project/session).

## Pin

- Engine: ccb789f2f72bec8b084eadffe97022cd82848400 -> de6640df37a5b0f6e6f2d1591b4b1d768cc3083c
  (MontClip#260 merge, 2026-11-08T21:43:34Z; E1–E5 all in main, MontClip#215 closed).
- Waited for main CI on de6640df: run 42526630944, all six jobs success (Syntax, Release
  readiness, Tests Node 18/20/22, Windows Node 22). The #260 branch head CI (42525218160)
  was already green, so the pin moved only after two green rounds.
- The worker's EXPORT_TASK_MISMATCH check is NOT deleted. At this pin the engine carries
  {project, session} on export jobs and tickets (engine test export-task-scope), so the
  check is enforceable: test/engine-task-contract.test.cjs went from 0/2 to 2/2 without
  touching the worker check.

## Plugin changes in the same pin (MontClip#251 items 1-7, MontClip#260 items 1-5)

- node/worker.cjs: new montclip/editor-ticket — binds the task, registers a one-time ticket
  with POST /api/embed/ticket under the worker's own session header, returns
  {ticket, expiresInMs}. The ticket is never passed to note().
- main.js: forwards the pages' editor-ticket asks to the worker.
- frame.js: no cindySession in any address. Every placement asks for a fresh ticket first
  and loads host=cindy&…&ticket=… (editor) or the panel page with its own ticket. A
  montclip-need-ticket message is answered only when it comes from the framed window at
  the engine origin, with a fresh ticket as montclip-host-ticket.
- embed/panel.js (the /cindy/panel.html page): trades its first-address ticket at
  POST /api/embed/channel, opens BroadcastChannel("montclip-editor:" + channel) only on
  success, asks the framing page for a fresh ticket when it has none or was refused.
  No projectId is read from editor-state. A click with no live channel only shows the
  existing "editor not open" line — the old unscoped POST /api/ui/command fallback is
  gone, so one task's panel cannot move another task's editor.
- test-tools/panel-play-e2e.cjs: binds a synthetic task, a fresh ticket per framed page,
  channel name with suffix.

## Tests

- New test/embed-ticket.test.cjs (2): source wiring (no cindySession anywhere, ticket
  never logged, suffix-less channel never opened, EXPORT_TASK_MISMATCH still present);
  packed worker — tickets are 64 hex / 60000 ms / fresh per ask / absent from the worker
  log, channel trade is one-time (second trade 403), and montclip/ui for a task with no
  ticket-bound editor answers 409.
- Full local suite at the new head (Windows, this checkout): 104 tests, 101 pass,
  0 fail, 3 skipped. The 3 skips are the pre-existing Windows platform skips in
  external-ffmpeg.test.cjs (stand-in shell scripts). Before this pin the same suite was
  102 tests with 3 failures (2 task-identity + 1 H.264 source adaptation, since fixed).

## Remaining acceptance (SOP v4 item 13, recorded on the PR)

Win11, Cindy, synthetic media, normal integrity (.cmd via explorer.exe): ticket
length/expiry, one reconnect; in a real browser on one engine, tasks A and B open at
once — A's panel seek moves only A, B's state does not enter A's panel; one audible
export. Results go on PR #48 as RSI-EVIDENCE bound to the new head. The package must not
be installed for acceptance until QQ reviews this head.

