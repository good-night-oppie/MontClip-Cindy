#!/usr/bin/env node
/* Run every test/*.test.cjs with node --test, so a new test file needs no
   package.json edit. A script lists the files because no single argument works
   on all of CI: Node 18 on Windows gets the glob unexpanded and can't read it,
   Node 22 doesn't take a directory, and Node 18 given test/ would also run
   files that aren't tests. Run: node tools/run-tests.cjs */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const dir = path.join(__dirname, "..", "test");
const files = fs.readdirSync(dir).filter((name) => name.endsWith(".test.cjs")).sort()
  .map((name) => path.join("test", name));
if (!files.length) throw new Error("No test/*.test.cjs files found");
const run = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit", cwd: path.join(__dirname, "..") });
process.exit(run.status === null ? 1 : run.status);
