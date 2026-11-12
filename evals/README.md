# Evals

These are `claude plugin eval` cases for the `service-status` skill and hook. The failures come from real agent sessions, rewritten as minimal reproductions.

| Group                                     | Cases                                                                                                                    | Graders                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `outage-*` (tag `trigger`)                | GitHub GraphQL/API 502 and 504, release-download 504, `git push` 500, npm registry 503, Anthropic 529, "is OpenAI down?" | skill loads; an LLM judge checks that the answer attributes the failure to the provider and doesn't "fix" code |
| `lookalike-*` (tag `no-trigger`)          | sandbox proxy 502, 401 bad credentials, mocked 500 in a test, secondary rate limit, merge conflict                       | skill must not load; the judge checks that the answer finds the real cause                                     |
| `agentic-*` (tag `agentic`, experimental) | a script whose vendored CLI fails like an outage mid-task                                                                | no `Edit`/`Write`; skill loads; judge                                                                          |

Cases tagged `holdout` were written after the skill description and weren't used to tune it.

```sh
pnpm eval:prepare     # from the repo root: copies the skill and hook into evals/ (gitignored)
cd evals
claude plugin eval . --allow-tools Bash --trust-plugin                                   # outage + lookalike cases, with a no-plugin baseline
claude plugin eval . --tag agentic --scaffold --allow-tools Bash Edit Write --trust-plugin
claude plugin eval . --runs 1 --ablation none --case 'outage-*' --allow-tools Bash      # cheap iteration
```

## Limits

- **The eval sandbox has no network access**, so agents can't actually fetch status pages. The judges accept "checked, or told the user exactly how to check".
- **The baseline is strong on direct questions.** When the prompt pastes the error and asks "what now?", the model without the plugin usually answers correctly too, so Δ is close to 0. The plugin's value is earlier in the task, when the agent hasn't been asked about the failure.
- **Agentic cases use stand-in CLIs.** A real outage can't be simulated without network access, so each scaffold installs a stand-in: a 2.5 MB vendored Yarn release, and a `pr-sync` package with a realistic lockfile. Each one waits a few seconds and then fails the way the provider does. The stand-ins look like real bundles, and their error text is encoded rather than stored as plain text. Even so, an agent that reads them closely can tell they're fake. That conclusion is correct, but the run then no longer measures the reaction to an outage. The runner has no "inconclusive" verdict, so those runs count as failures.

  To exclude them, re-score the `--json` output:

  ```sh
  node ../scripts/eval-summary.js cases/results/<run>.json        # from evals/
  ```

  For `agentic-*` cases, this drops runs whose final answer calls the tool a stub or fake, says it's hard-coded, or says it never makes a request. Then it recomputes each arm's score. It always prints how many runs it dropped from each arm. Agents with and without the skill investigate differently, so uneven exclusion can bias Δ. Read the counts alongside the scores.
