#!/usr/bin/env node
// Usage: node scripts/eval-summary.js <result.json> [--cases 'agentic-*']
import { readFileSync } from "node:fs";
import { formatTable, summarize } from "./lib/eval-summary.js";

const args = process.argv.slice(2);
const casesAt = args.indexOf("--cases");
const cases = casesAt >= 0 ? args.splice(casesAt, 2)[1] : undefined;
if (args.length !== 1) {
  console.error("usage: eval-summary <result.json> [--cases <glob>]");
  process.exit(2);
}
const result = JSON.parse(readFileSync(args[0], "utf8"));
console.log(formatTable(summarize(result, { cases })));
