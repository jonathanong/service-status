// Re-scores a `claude plugin eval --json` result, excluding runs where the agent
// recognised an agentic fixture as a stand-in. The eval runner has no "inconclusive"
// verdict, so those runs would otherwise count as failures. Exclusions are always
// reported per arm, because dropping runs unevenly can bias the comparison.

export const FIXTURE_DETECTED = new RegExp(
  [
    String.raw`\bstub\b`,
    String.raw`\bstand-?in\b`,
    String.raw`\b(?:is|are|looks|seems) (?:a |an |entirely |completely )?fake\b`,
    String.raw`\bfake \W?(?:cli|binary|yarn|pr-sync|client|tool|release|registry|error|response|50\d)`,
    String.raw`\bhard-?coded\b`,
    String.raw`\bsimulated\b`,
    String.raw`\bnever (?:makes|sends|contacts) (?:a |any )?(?:network |real )?(?:request|call)s?\b`,
    String.raw`\b(?:makes|sends) no (?:network |real )?requests?\b`,
    String.raw`\bdoes(?:n'?t| not) (?:actually )?(?:make|send) (?:a |any )?(?:network |real )?requests?\b`,
  ].join("|"),
  "i",
);

const ARMS = ["with", "without"];

export function globToRegExp(glob) {
  const body = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${body}$`);
}

export function runText(run) {
  return (run.graders ?? [])
    .map((g) => g.evidence)
    .filter((e) => typeof e === "string")
    .join("\n");
}

export function fixtureDetected(run, pattern = FIXTURE_DETECTED) {
  return pattern.test(runText(run));
}

function armStats(runs, exclude, pattern) {
  const kept = runs.filter((r) => !(exclude && fixtureDetected(r, pattern)));
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    total: runs.length,
    kept: kept.length,
    excluded: runs.length - kept.length,
    score: mean(kept.map((r) => r.score)),
    passRate: mean(kept.map((r) => (r.passed ? 1 : 0))),
  };
}

export function summarize(result, { cases = "agentic-*", pattern = FIXTURE_DETECTED } = {}) {
  const matcher = globToRegExp(cases);
  return result.cases.map((c) => {
    const exclude = matcher.test(c.name);
    const arms = {};
    for (const arm of ARMS) {
      if (c.arms?.[arm]) arms[arm] = armStats(c.arms[arm], exclude, pattern);
    }
    const w = arms.with?.score;
    const wo = arms.without?.score;
    const delta = w != null && wo != null ? w - wo : null;
    return { name: c.name, exclusionApplied: exclude, arms, delta };
  });
}

const fmt = (n) => (n == null ? "–" : n.toFixed(2));
const cell = (a) => (a ? `${fmt(a.score)} (${a.kept}/${a.total} kept)` : "–");

export function formatTable(rows) {
  const lines = [
    "| case | with | without | Δ |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.name}${r.exclusionApplied ? "" : " (no exclusion)"} | ${cell(r.arms.with)} | ${cell(r.arms.without)} | ${fmt(r.delta)} |`,
    ),
  ];
  const excluded = (arm) => rows.reduce((n, r) => n + (r.arms[arm]?.excluded ?? 0), 0);
  lines.push(
    "",
    `Excluded as fixture-detected: with=${excluded("with")}, without=${excluded("without")}.`,
  );
  return lines.join("\n");
}
