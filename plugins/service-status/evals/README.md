# Evals

These are `claude plugin eval` cases for the `service-status` skill and hook. The failures come from real agent sessions, rewritten as minimal reproductions.

| Group                                     | Cases                                                                                                                    | Graders                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `outage-*` (tag `trigger`)                | GitHub GraphQL/API 502 and 504, release-download 504, `git push` 500, npm registry 503, Anthropic 529, "is OpenAI down?" | skill loads; an LLM judge checks that the answer attributes the failure to the provider and doesn't "fix" code |
| `lookalike-*` (tag `no-trigger`)          | sandbox proxy 502, 401 bad credentials, mocked 500 in a test, secondary rate limit, merge conflict                       | skill must not load; the judge checks that the answer finds the real cause                                     |
| `agentic-*` (tag `agentic`, experimental) | a script whose vendored CLI fails like an outage mid-task                                                                | no `Edit`/`Write`; skill loads; judge                                                                          |

Cases tagged `holdout` were written after the skill description and weren't used to tune it.

```sh
cd plugins/service-status
claude plugin eval . --allow-tools Bash --trust-plugin                                   # outage + lookalike cases, with a no-plugin baseline
claude plugin eval . --tag agentic --scaffold --allow-tools Bash Edit Write --trust-plugin
claude plugin eval . --runs 1 --ablation none --case 'outage-*' --allow-tools Bash      # cheap iteration
```

## Limits

- **The eval sandbox has no network access**, so agents can't actually fetch status pages. The judges accept "checked, or told the user exactly how to check".
- **The baseline is strong on direct questions.** When the prompt pastes the error and asks "what now?", the model without the plugin usually answers correctly too, so Δ is close to 0. The plugin's value is earlier in the task, when the agent hasn't been asked about the failure.
- **Agentic cases are confounded.** A real outage can't be simulated without network access, so each scaffold uses a stand-in CLI. Capable agents sometimes open the stand-in, see that it never makes a request, and report it as a fake. That is the correct conclusion for the fixture, but it means the run doesn't measure what the case is meant to measure. Read these cases' results by hand.
