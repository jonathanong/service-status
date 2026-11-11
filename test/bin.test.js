import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bin = new URL("../plugins/service-status/hooks/outage-nudge.js", import.meta.url).pathname;
const exec = (input) =>
  execFileSync(process.execPath, [bin], {
    input,
    env: { ...process.env, TMPDIR: mkdtempSync(join(tmpdir(), "ss-bin-")) },
  }).toString();

describe("outage-nudge.js", () => {
  it("prints hook JSON for an outage-shaped failure", () => {
    const out = exec(
      JSON.stringify({
        hook_event_name: "PostToolUseFailure",
        session_id: `b-${Date.now()}`,
        tool_input: { command: "git push" },
        error: "Exit code 128\nerror: RPC failed; HTTP 503",
      }),
    );
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain("service-status skill");
  });

  it("prints nothing otherwise", () => {
    expect(
      exec(JSON.stringify({ tool_input: { command: "pnpm test" }, error: "Exit code 1" })),
    ).toBe("");
  });
});
