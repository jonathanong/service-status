#!/usr/bin/env node
// Hook entry point: JSON on stdin, hook JSON (or nothing) on stdout.
import { readFileSync } from "node:fs";
import { run } from "./lib/nudge.js";

const out = run(readFileSync(0, "utf8"));
if (out) process.stdout.write(`${out}\n`);
