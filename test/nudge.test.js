import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMessage,
  extractOutput,
  run,
  shouldNotify,
} from "../plugins/service-status-hook/hooks/lib/nudge.js";

const tmp = () => mkdtempSync(join(tmpdir(), "ss-test-"));

function servicesFile(dir) {
  const p = join(dir, "services.json");
  writeFileSync(
    p,
    JSON.stringify({
      services: [
        {
          id: "github",
          name: "GitHub",
          statusPage: "https://www.githubstatus.com",
          endpoints: { status: "https://www.githubstatus.com/api/v2/status.json" },
          hosts: ["github.com", "api.github.com"],
          commands: ["git", "gh"],
        },
        {
          id: "npm",
          name: "npm",
          statusPage: "https://status.npmjs.org",
          hosts: ["registry.npmjs.org"],
          commands: ["npm", "pnpm"],
        },
      ],
    }),
  );
  return p;
}

const failure = (command, error, extra = {}) =>
  JSON.stringify({
    hook_event_name: "PostToolUseFailure",
    session_id: "s1",
    tool_name: "Bash",
    tool_input: { command },
    error,
    ...extra,
  });

describe("run", () => {
  it("nudges with the matched service on a Claude Code failure", () => {
    const dir = tmp();
    const out = JSON.parse(
      run(
        failure(
          "git push",
          "Exit code 128\nerror: RPC failed; HTTP 503\nfatal: unable to access 'https://github.com/acme/app/'",
        ),
        { servicesPath: servicesFile(dir), stateDir: dir },
      ),
    );
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure");
    expect(out.hookSpecificOutput.additionalContext).toContain(
      "GitHub (https://www.githubstatus.com/api/v2/status.json)",
    );
    expect(out.hookSpecificOutput.additionalContext).toContain("service-status skill");
  });

  it("handles Codex PostToolUse with an object tool_response", () => {
    const dir = tmp();
    const raw = JSON.stringify({
      session_id: "c1",
      tool_input: { command: "pnpm install" },
      tool_response: { stdout: "", stderr: "GET https://registry.npmjs.org/x: 502 Bad Gateway" },
    });
    const out = JSON.parse(run(raw, { servicesPath: servicesFile(dir), stateDir: dir }));
    expect(out.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(out.hookSpecificOutput.additionalContext).toContain("npm (https://status.npmjs.org)");
  });

  it("dedupes repeat nudges for the same service within the quiet window", () => {
    const dir = tmp();
    const opts = { servicesPath: servicesFile(dir), stateDir: dir, now: 1_000_000 };
    const raw = failure("gh pr list", "HTTP 502: Bad Gateway (https://api.github.com/graphql)");
    expect(run(raw, opts)).not.toBe("");
    expect(run(raw, { ...opts, now: 1_000_000 + 60_000 })).toBe("");
    expect(run(raw, { ...opts, now: 1_000_000 + 11 * 60_000 })).not.toBe("");
  });

  it("still nudges without a service when the directory is unreadable", () => {
    const dir = tmp();
    const out = JSON.parse(
      run(
        failure(
          "curl https://example.com",
          "curl: (28) Operation timed out after 10001 milliseconds",
        ),
        { servicesPath: join(dir, "missing.json"), stateDir: dir },
      ),
    );
    expect(out.hookSpecificOutput.additionalContext).not.toContain("Likely service");
  });

  it.each([
    ["invalid json", "{"],
    ["interrupts", failure("git push", "HTTP 503", { is_interrupt: true })],
    ["non-outage failures", failure("pnpm test", "Exit code 1\nexpected 1 to equal 2")],
    ["missing command and session", JSON.stringify({ error: "HTTP 503" })],
  ])("is silent for %s", (_name, raw) => {
    const dir = tmp();
    expect(run(raw, { servicesPath: servicesFile(dir), stateDir: dir })).toBe("");
  });

  it("works without a session id", () => {
    const dir = tmp();
    const raw = JSON.stringify({ tool_input: { command: "git fetch" }, error: "fatal: early EOF" });
    expect(run(raw, { servicesPath: servicesFile(dir), stateDir: dir })).toContain("GitHub");
  });

  it("uses the default directory and state dir when none are given", () => {
    const out = run(failure("git fetch", "fatal: the remote end hung up unexpectedly"), {
      now: Date.now() + Math.random() * 1e9,
    });
    expect(typeof out).toBe("string");
  });
});

describe("extractOutput", () => {
  it.each([
    [{ error: "boom" }, "boom"],
    [{ tool_response: "plain" }, "plain"],
    [{ tool_response: { stdout: "a", stderr: "b", exit_code: 1 } }, "a\nb"],
    [{ tool_response: null }, ""],
    [{}, ""],
  ])("%j", (input, expected) => {
    expect(extractOutput(input)).toBe(expected);
  });
});

describe("shouldNotify", () => {
  it("notifies even when state cannot be written", () => {
    const dir = tmp();
    const file = join(dir, "not-a-dir");
    writeFileSync(file, "x");
    expect(shouldNotify(file, "s", "k", 1)).toBe(true);
  });

  it("recovers from corrupt state", () => {
    const dir = tmp();
    writeFileSync(join(dir, "s.json"), "{");
    expect(shouldNotify(dir, "s", "k", 1)).toBe(true);
  });
});

describe("buildMessage", () => {
  it("falls back to the human status page", () => {
    const msg = buildMessage({ evidence: "HTTP 503" }, [
      { name: "X", statusPage: "https://status.x.io" },
    ]);
    expect(msg).toContain("X (https://status.x.io)");
  });
});
