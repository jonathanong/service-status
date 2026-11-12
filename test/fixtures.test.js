// Mined from real agent sessions (rewritten as minimal reproductions). Cases
// marked "hook": "miss" are outages the hook can't see or can't safely claim;
// the skill's description covers them instead.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify } from "../plugins/service-status-hook/hooks/lib/classify.js";
import {
  loadServices,
  serviceMentioner,
} from "../plugins/service-status-hook/hooks/lib/services.js";

const cases = JSON.parse(
  readFileSync(new URL("./fixtures/mined-cases.json", import.meta.url), "utf8"),
);
const mention = serviceMentioner(
  loadServices(
    new URL("../plugins/service-status/skills/service-status/services.json", import.meta.url),
  ),
);

describe("mined cases", () => {
  it.each(cases.map((c) => [c.label, c.category, c]))("%s: %s", (_label, _category, c) => {
    const expected = c.label === "outage" && c.hook !== "miss";
    expect(classify(c.command, c.output, mention).outage).toBe(expected);
  });

  it("keeps a balanced, non-trivial set", () => {
    const outages = cases.filter((c) => c.label === "outage");
    expect(outages.length).toBeGreaterThanOrEqual(20);
    expect(cases.length - outages.length).toBeGreaterThanOrEqual(25);
  });
});
