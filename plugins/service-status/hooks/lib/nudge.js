// PostToolUse / PostToolUseFailure hook for Bash. When a network command fails
// with an error that looks like a third-party outage, add one line of context
// pointing the agent at the service-status skill. No network calls.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "./classify.js";
import { loadServices, matchServices, serviceMentioner, statusUrl } from "./services.js";

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SERVICES = join(here, "..", "..", "skills", "service-status", "services.json");
const QUIET_MS = 10 * 60 * 1000;

// Claude Code sends failures as PostToolUseFailure with `error`; Codex sends
// PostToolUse with `tool_response`, whose shape varies by version.
export function extractOutput(input) {
  if (typeof input.error === "string") return input.error;
  const r = input.tool_response;
  if (typeof r === "string") return r;
  if (r && typeof r === "object") {
    return [r.stdout, r.stderr, r.output, r.error].filter((v) => typeof v === "string").join("\n");
  }
  return "";
}

export function buildMessage(result, matched) {
  const names = matched.map((s) => `${s.name} (${statusUrl(s)})`).join(", ");
  const who = names ? ` Likely service: ${names}.` : "";
  return (
    `[service-status] This failure looks like a third-party outage or flaky network, not a code problem: "${result.evidence}".${who} ` +
    "Before changing code or retrying repeatedly, use the service-status skill to check the provider's status page. " +
    "If an incident is confirmed, stop and tell the user instead of working around it."
  );
}

// Suppress repeat nudges for the same session and service for QUIET_MS.
export function shouldNotify(stateDir, sessionId, key, now) {
  const file = join(stateDir, `${String(sessionId).replace(/[^\w-]/g, "_")}.json`);
  let seen = {};
  try {
    seen = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    // first nudge in this session, or unreadable state: notify
  }
  if (seen[key] !== undefined && now - seen[key] < QUIET_MS) return false;
  seen[key] = now;
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(file, JSON.stringify(seen));
  } catch {
    // can't persist: still notify, we just may repeat later
  }
  return true;
}

export function run(raw, { servicesPath = DEFAULT_SERVICES, stateDir, now = Date.now() } = {}) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return "";
  }
  if (input.is_interrupt) return "";
  const command = input.tool_input?.command ?? "";
  const output = extractOutput(input).slice(0, 20000);
  let services = [];
  try {
    services = loadServices(servicesPath);
  } catch {
    // missing or malformed directory: still classify, without service names
  }
  const result = classify(command, output, serviceMentioner(services));
  if (!result.outage) return "";
  const matched = matchServices(services, command, output);
  const key = matched.map((s) => s.id).join(",") || result.signal;
  const dir = stateDir ?? join(tmpdir(), "service-status-hook");
  if (!shouldNotify(dir, input.session_id ?? "unknown", key, now)) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name ?? "PostToolUse",
      additionalContext: buildMessage(result, matched),
    },
  });
}
