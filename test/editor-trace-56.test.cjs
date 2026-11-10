"use strict";
/* MontClip-Cindy#56 / #2: when the editor is not open in a task, say which step never happened. The worker counts
   the task tickets it handed out per session (count and time only, never the ticket), and montclip_status reports
   one of three reasons. No user data; synthetic sessions only. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
// CRLF checkouts: the handler regex below needs LF
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const { createEditorTrace } = require("../node/lib.cjs");

test("no ticket was ever asked for: the page never loaded in this task", () => {
  const trace = createEditorTrace({ now: () => 1000 });
  assert.deepEqual(trace.why("task-a"), { code: "NO_TICKET_REQUESTED", ticketsIssued: 0, lastTicketAt: null, ticketsRefused: 0 });
});

test("tickets were handed out but no editor is bound: count and time, per session", () => {
  let t = Date.parse("2026-11-10T01:00:00Z");
  const trace = createEditorTrace({ now: () => t });
  trace.issued("task-a"); t += 5000; trace.issued("task-a");
  assert.deepEqual(trace.why("task-a"), { code: "TICKET_ISSUED_NOT_BOUND", ticketsIssued: 2, lastTicketAt: "2026-11-10T01:00:05.000Z", ticketsRefused: 0 });
  assert.equal(trace.why("task-b").code, "NO_TICKET_REQUESTED", "another task's tickets are not this task's");
});

test("the engine refused the ticket: said separately, with the engine's code only", () => {
  const trace = createEditorTrace({ now: () => 0 });
  trace.refused("task-a", "TASK_TICKET_REFUSED");
  const why = trace.why("task-a");
  assert.equal(why.code, "TICKET_REFUSED_BY_ENGINE");
  assert.equal(why.ticketsRefused, 1);
  assert.equal(why.lastRefusal, "TASK_TICKET_REFUSED");
});

test("nothing that looks like a ticket or a path can get into the trace", () => {
  const trace = createEditorTrace({ now: () => 0 });
  trace.refused("task-a", "C:\\Users\\someone\\secret " + "a".repeat(64));
  assert.equal(trace.why("task-a").lastRefusal, "UNKNOWN", "only short upper-case codes are kept");
  trace.issued("bad session id with spaces");
  assert.equal(trace.why("bad session id with spaces").ticketsIssued, 0, "odd session ids are not recorded");
  assert.ok(!JSON.stringify(trace.why("task-a")).includes("a".repeat(64)));
});

test("the trace is bounded", () => {
  const trace = createEditorTrace({ now: () => 0, max: 3 });
  for (const s of ["s1", "s2", "s3", "s4"]) trace.issued(s);
  assert.equal(trace.why("s1").ticketsIssued, 0, "the oldest session is dropped");
  assert.equal(trace.why("s4").ticketsIssued, 1);
});

test("source: the worker records without logging, and status says why", () => {
  const worker = read("node/worker.cjs"), main = read("main.js");
  const handler = worker.match(/async "montclip\/editor-ticket"[\s\S]*?\n  \},\n/)?.[0] || "";
  assert.match(handler, /editorTrace\.issued\(session\)/, "a handed-out ticket is counted");
  assert.match(handler, /editorTrace\.refused\(session,/, "a refused one is counted");
  assert.doesNotMatch(handler, /note\(/, "the ticket is still never logged");
  assert.match(worker, /"montclip\/editor-trace"/, "the worker answers with the trace");
  assert.match(main, /montclip\/editor-trace/, "montclip_status asks for it");
  assert.match(main, /why:/, "and reports it when the editor is not open");
});
