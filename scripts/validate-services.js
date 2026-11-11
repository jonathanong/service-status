#!/usr/bin/env node
// Usage: node scripts/validate-services.js [--skip-ping]
import { readFileSync } from "node:fs";
import { validate } from "./lib/validate.js";

const dir = new URL("../plugins/service-status/skills/service-status/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const data = read("services.json");
const errors = await validate(data, read("services.schema.json"), {
  skipPing: process.argv.includes("--skip-ping"),
});
for (const e of errors) console.error(e);
console.log(
  errors.length === 0 ? `ok: ${data.services.length} services` : `${errors.length} problem(s)`,
);
process.exitCode = errors.length === 0 ? 0 : 1;
