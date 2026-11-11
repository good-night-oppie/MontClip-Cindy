"use strict";
// Issue #17: the packed engine must keep the task identity used by worker.cjs
// when polling/cancelling/delivering an export. No browser or user data needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createExportJobs } = require("../dist/montclip/node/app/server/export-jobs.js");

for (const surface of ["job", "ticket"]) {
  test(`packed engine preserves project/session on export ${surface}`, (t) => {
    const jobs = createExportJobs({ editors: () => 1, broadcast() {} });
    t.after(() => jobs.shutdown());
    const identity = { project: "synthetic-project-A", session: "synthetic-task-A" };
    const job = jobs.request({ where: "tab", ...identity });
    const result = surface === "job" ? job : jobs.ticket(job.id);
    assert.deepEqual({ project: result.project, session: result.session }, identity,
      "The worker rejects missing session as EXPORT_TASK_MISMATCH; the editor also needs project/task routing.");
  });
}
