import { describe, expect, it } from "vitest";
import {
  fixtureDetected,
  formatTable,
  globToRegExp,
  runText,
  summarize,
} from "../scripts/lib/eval-summary.js";

const run = (score, passed, evidence) => ({
  score,
  passed,
  graders: [{ name: "answer", evidence }, { name: "skill-fired" }],
});

describe("fixtureDetected", () => {
  it.each([
    "`pr-sync` is a 4-line Node stub",
    "The project's Yarn is fake",
    "It's printed by a fake `pr-sync` installed locally.",
    "It prints a hard-coded log",
    "It never makes a network request.",
    "the CLI makes no network requests",
    "it doesn't actually make any requests",
    "This looks like a stand-in",
  ])("flags %j", (text) => expect(fixtureDetected(run(0, false, text))).toBe(true));

  it.each([
    "GitHub's GraphQL API is returning a 502 Bad Gateway.",
    "The npm registry keeps returning 503 Service Unavailable.",
    "I could have made it succeed by writing a fake `.cache/reviews.json`.",
  ])("does not flag %j", (text) => expect(fixtureDetected(run(1, true, text))).toBe(false));

  it("tolerates runs without graders or evidence", () => {
    expect(runText({})).toBe("");
    expect(fixtureDetected({ graders: [{ evidence: 3 }] })).toBe(false);
  });
});

describe("globToRegExp", () => {
  it("matches * and ? and escapes the rest", () => {
    expect(globToRegExp("agentic-*").test("agentic-setup-npm-503")).toBe(true);
    expect(globToRegExp("outage-?").test("outage-a")).toBe(true);
    expect(globToRegExp("a.b").test("axb")).toBe(false);
  });
});

const result = {
  cases: [
    {
      name: "agentic-x",
      arms: {
        with: [run(1, true, "GitHub is down"), run(0.5, false, "pr-sync is a stub")],
        without: [run(0.5, false, "the CLI is fake"), run(0.5, false, "it is fake")],
      },
    },
    {
      name: "outage-y",
      arms: { with: [run(1, true, "a stub")] },
    },
  ],
};

describe("summarize", () => {
  const rows = summarize(result);

  it("excludes detected runs only for matching cases", () => {
    expect(rows[0].arms.with).toEqual({
      total: 2,
      kept: 1,
      excluded: 1,
      score: 1,
      passRate: 1,
    });
    expect(rows[0].arms.without).toMatchObject({ kept: 0, excluded: 2, score: null });
    expect(rows[0].delta).toBeNull();
    expect(rows[1]).toMatchObject({ exclusionApplied: false, delta: null });
    expect(rows[1].arms.with).toMatchObject({ kept: 1, excluded: 0, score: 1 });
  });

  it("computes delta when both arms have kept runs", () => {
    const [row] = summarize(result, { cases: "nothing" });
    expect(row.delta).toBeCloseTo(0.25);
  });

  it("formats a table with exclusion counts", () => {
    const table = formatTable(rows);
    expect(table).toContain("| agentic-x | 1.00 (1/2 kept) | – (0/2 kept) | – |");
    expect(table).toContain("| outage-y (no exclusion) | 1.00 (1/1 kept) | – | – |");
    expect(table).toContain("with=1, without=2");
  });
});
