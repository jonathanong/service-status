---
name: service-status
description: Check whether a failure is a third-party outage (GitHub, npm, PyPI, Docker Hub, Anthropic, OpenAI, AWS, GCP, Cloudflare, Vercel and ~130 more) by reading the provider's status page with a minimal fetch, before changing code or retrying. Use proactively, without being asked, as soon as a git, gh, package-manager, CLI, CI or API call fails with a 5xx, Bad Gateway, Service Unavailable, Gateway Timeout, 529 Overloaded, RPC failed, early EOF, ECONNRESET, ETIMEDOUT, TLS handshake timeout, "Could not resolve host" for a public host, or a release/asset download failure — and whenever a hook message mentions service-status.
when_to_use: 'Triggers: "HTTP 502: Bad Gateway (https://api.github.com/graphql)", "error: RPC failed; HTTP 500", "GitHub GraphQL request failed: 502", "Download failed: 504 Gateway Time-out for https://github.com/.../releases/download/...", "ERR_PNPM_META_FETCH_FAIL ... Service Unavailable", "overloaded_error", flaky CI that fails in setup/download steps, or the user asking "is GitHub/npm/X down?". Not for: sandbox denials (Operation not permitted, sandbox_violations, "sandbox proxy"), 401/403 auth, 404, rate limits (429, secondary rate limit), localhost/docker.sock errors, or tests asserting on mocked 500s.'
---

# service-status

Decide, in one or two cheap fetches, whether a failure is the provider's fault. If it is, stop changing code and tell the user. Agents otherwise spend turns "fixing" outages: retrying in loops, splitting queries, rewriting working code.

## 1. Rule out local causes first (no fetch needed)

Not an outage, whatever the status page says:

- **Sandbox**: `Operation not permitted`, `<sandbox_violations>`, `sandbox proxy: …: 502`, `CONNECT tunnel failed, response 403`. Ask for the host to be allowed instead.
- **Auth**: 401, `Bad credentials`, `Permission denied (publickey)`, `gh auth login`.
- **Missing thing**: 404, `Repository not found`, `workflow … not found`.
- **Your own volume**: 429, `secondary rate limit`, `rate limit exceeded`. Back off; don't check status.
- **Local services**: `localhost`, `127.0.0.1`, `docker.sock`, a test asserting `expected 200, got 500`.

## 2. Find the service

`services.json` sits next to this file (the skill's base directory). Use the bundled copy: the canonical one lives on GitHub, which may be the thing that's down. Match on the host in the error, then the CLI, then the name:

```sh
D=<skill base dir>/services.json
jq -c --arg h "api.github.com" '.services[] | select(any(.hosts[]?; . as $p | $h | test("(^|\\.)" + ($p | sub("^\\*\\."; "") | gsub("\\."; "\\.")) + "$"))) | {id, adapter, endpoints, components, notes}' "$D"
jq -c --arg c "pnpm" '.services[] | select(any(.commands[]?; . == $c)) | {id, adapter, endpoints}' "$D"
jq -c --arg n "openai" '.services[] | select((.id + " " + .name) | ascii_downcase | contains($n)) | {id, adapter, endpoints}' "$D"
```

A failure can belong to a different service than the command: `pnpm install` failing on `codeload.github.com` is GitHub, and a CI step downloading from `github.com/…/releases/download/…` is GitHub, not your CI provider. Read the `notes` field; it carries per-service caveats such as "umbrella page hides product incidents".

## 3. Fetch only what answers the question

Never download a whole feed or `summary.json` just to learn "is it up?". Pick by `adapter`:

| adapter      | is anything wrong? (≈bytes)                                                                                | which incident?                                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `statuspage` | `curl -s $status \| jq -r .status.indicator` (≈215)                                                        | `curl -s $unresolved \| jq -r '.incidents[] \| [.impact,.status,.name,([.components[]?.name]\|join(","))] \| @tsv'`                                 |
| `incidentio` | `curl -s $status \| jq -c .status` (≈200)                                                                  | `curl -s --compressed $proxy \| jq -r '.summary.ongoing_incidents[] \| [.status,.name] \| @tsv'` — never call `unresolved.json` here (404 + 296 KB) |
| `statusio`   | `curl -s --compressed $status \| jq -c .result.status_overall` (100 = ok)                                  | same doc: `.result.status[] \| select(.status_code != 100) \| .name`                                                                                |
| `gcp`        | `curl -s -r 0-3999 $atom \| grep -oE '<title>[^<]*' \| head -3`                                            | `curl -s --compressed $events \| jq -c '[.[] \| select(.end == null) \| {service_name, severity}]'`                                                 |
| `aws`        | `curl -s https://status.aws.amazon.com/rss/<service>-<region>.rss \| grep -c '<item>'` (≈719; 0 = healthy) | `curl -s --compressed $events \| iconv -f UTF-16 -t UTF-8 \| jq -r '.[] \| select(.status != "0") \| [.service, .summary] \| @tsv'`                 |
| `feed-only`  | `curl -s --compressed $atom \| head -c 3000 \| grep -oE '<(updated\|title)>[^<]*' \| head -4`              | read the newest entry's body for "Resolved"                                                                                                         |

Other adapters (`instatus`, `betterstack`, `azure`, `azure-devops`, `slack`, `heroku`, `apple`) and the measured sizes are in [references/adapters.md](references/adapters.md).

Rules:

- **Status first, details only if not `none`/`operational`.** Most checks end after one ~200-byte request.
- **Filter to your component.** Use the entry's `components` list: `git push` → GitHub "Git Operations", `gh` and GraphQL → "API Requests", workflow runs → "Actions", release assets and `ghcr.io` → "Packages". Cloudflare's ~66 data-centre rows are routine maintenance noise; judge by named products and incident impact.
- **Heads, not whole feeds.** Use `curl -r 0-3999` on Atom where Range works (Statuspage, Google), otherwise `--compressed | head -c`.
- **Sandboxed?** Status hosts may need to be allowed (for example the Bash tool's `allowed_domains`). A sandbox refusal of the status host says nothing about the vendor.

No entry? Try `https://status.<vendor-domain>/api/v2/status.json` (Atlassian Statuspage and incident.io both serve it), then search for "<vendor> status". Then propose adding it (see the repo's CONTRIBUTING.md).

## 4. Decide and act

| What you see                                                                                | Do this                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incident on the matching component, or indicator `minor`+ that plausibly covers the failure | **Stop.** Don't edit code, split requests or loop retries. Tell the user: service, incident title, status page link, and what you'll do (wait and retry once later, or continue other work). |
| Page is green, but the same 5xx/timeout repeats across different requests                   | Treat it as a **probable unannounced incident**. Pages lag 10–30 minutes. Retry once after a short wait, then report it to the user. Don't rewrite code.                                     |
| Page is green, and the error happened once                                                  | Retry once. If it passes, mention the blip briefly and move on.                                                                                                                              |
| Step 1 matched (sandbox, auth, 404, rate limit, local)                                      | Not an outage. Fix the real cause.                                                                                                                                                           |

When you report, be specific and short: "GitHub API is returning 502s (`gh pr list`). githubstatus.com shows 'Incident with Pull Requests' (minor, investigating). I haven't changed any code; I'll retry in ~10 minutes." Never claim an outage the page doesn't show. Say "probable, unconfirmed" when that's all you have.

## Examples

Worked scenarios (GitHub GraphQL 502 from a wrapper CLI, release-download 504 in CI, npm registry timeouts, Anthropic 529, and lookalikes such as sandbox proxy 502s and mocked 500s) are in [references/scenarios.md](references/scenarios.md).
