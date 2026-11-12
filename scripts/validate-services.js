#!/usr/bin/env node
// Usage: node scripts/validate-services.js [--skip-ping] [--sync]
// The skill's services.json is canonical. The hook plugin ships a byte-identical copy,
// because each plugin is installed on its own; --sync rewrites that copy.
import { readFileSync, writeFileSync } from "node:fs";
import { validate } from "./lib/validate.js";

const skillDir = new URL("../plugins/service-status/skills/service-status/", import.meta.url);
const hookCopy = new URL("../plugins/service-status-hook/hooks/services.json", import.meta.url);
const text = (url) => readFileSync(url, "utf8");
const canonical = text(new URL("services.json", skillDir));

if (process.argv.includes("--sync")) writeFileSync(hookCopy, canonical);

const data = JSON.parse(canonical);
const errors = await validate(data, JSON.parse(text(new URL("services.schema.json", skillDir))), {
  skipPing: process.argv.includes("--skip-ping"),
});
if (text(hookCopy) !== canonical) {
  errors.push(
    "plugins/service-status-hook/hooks/services.json differs from the skill's copy; run `pnpm sync`",
  );
}
for (const e of errors) console.error(e);
console.log(
  errors.length === 0 ? `ok: ${data.services.length} services` : `${errors.length} problem(s)`,
);
process.exitCode = errors.length === 0 ? 0 : 1;
