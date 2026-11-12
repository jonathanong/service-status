# service-status

[![CI](https://github.com/jonathanong/service-status/actions/workflows/ci.yml/badge.svg)](https://github.com/jonathanong/service-status/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/jonathanong/service-status/graph/badge.svg)](https://codecov.io/gh/jonathanong/service-status)

When a `git push`, `gh`, `pnpm install` or API call fails because GitHub, npm or Anthropic is having an incident, coding agents usually treat it as their own bug. They retry in loops, split queries, delete lockfiles and rewrite working code. These plugins help them recognize the outage, check the provider's status page with one ~200-byte request, and stop.

There are three parts, and none needs a server:

- **A skill**, in the `service-status` plugin. It triggers on outage-shaped failures (5xx, `RPC failed`, `ECONNRESET`, 529 overloaded, release-download timeouts) and stays out of lookalikes (sandbox denials, 401/404, rate limits, mocked 500s in tests). It contains minimal-fetch recipes for every status-page format and [worked scenarios](plugins/service-status/skills/service-status/references/scenarios.md) drawn from real agent sessions.
- **A hook**, in the optional `service-status-hook` plugin (`PostToolUse` / `PostToolUseFailure` on Bash). It makes no network calls. When a network command fails like an outage, it adds one line telling the agent which service is likely affected and to use the skill before changing code. It repeats at most once per service every 10 minutes.
- **An open directory** of status endpoints: **[`services.json`](plugins/service-status/skills/service-status/services.json)**. It has 134 services, and every URL is checked live. PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Install

```sh
# Claude Code
/plugin marketplace add jonathanong/service-status
/plugin install service-status@service-status
/plugin install service-status-hook@service-status     # optional

# Codex
codex plugin marketplace add jonathanong/service-status
codex plugin add service-status@service-status
codex plugin add service-status-hook@service-status    # optional
```

The skill works on its own: the agent loads it when it sees an outage-shaped error or when you ask "is GitHub down?". Add the hook if you also want a nudge on failed commands that the agent might otherwise retry or work around without stopping to think.

The skill uses `curl` and `jq`. The hook needs Node 24+ and carries its own copy of the directory. In a sandboxed session, allow the status host for the check. For example, list it in the Bash tool's `allowed_domains`. A sandbox refusal of a status host says nothing about the vendor.

## What the agent sees

```
$ pr-shepherd apply review https://github.com/acme/app/pull/123 --reply-thread-ids A,B,C
A: GitHub GraphQL request failed: 502 <html>

[service-status] This failure looks like a third-party outage or flaky network, not a code problem:
"A: GitHub GraphQL request failed: 502 <html>". Likely service: GitHub
(https://www.githubstatus.com/api/v2/status.json). Before changing code or retrying repeatedly, use the
service-status skill to check the provider's status page. If an incident is confirmed, stop and tell the
user instead of working around it.
```

Then one request answers the question:

```sh
curl -s https://www.githubstatus.com/api/v2/status.json | jq -r .status.indicator    # none | minor | major | critical
```

## The directory

[`services.json`](plugins/service-status/skills/service-status/services.json) maps each service to its status endpoints, the hosts and CLIs that appear in its error messages, the component names agents care about, and caveats. Its format is defined by [`services.schema.json`](plugins/service-status/skills/service-status/services.schema.json):

```json
{
  "id": "github",
  "name": "GitHub",
  "category": "source-control",
  "statusPage": "https://www.githubstatus.com",
  "adapter": "statuspage",
  "endpoints": {
    "status": "https://www.githubstatus.com/api/v2/status.json",
    "unresolved": "https://www.githubstatus.com/api/v2/incidents/unresolved.json"
  },
  "hosts": ["github.com", "api.github.com", "*.githubusercontent.com", "ghcr.io"],
  "commands": ["git", "gh"],
  "components": ["Git Operations", "API Requests", "Actions", "Packages", "Pull Requests"]
}
```

`adapter` tells you how to read the endpoints. There are 13 adapters: Atlassian Statuspage, incident.io, status.io, instatus, Better Stack, AWS, Google Cloud, Azure, Azure DevOps, Slack, Heroku, Apple, and feed-only. [`references/adapters.md`](plugins/service-status/skills/service-status/references/adapters.md) has a tested cheapest-possible query for each, with measured response sizes. For example, use `status.json` (215 bytes) instead of `summary.json` (227 KB on Cloudflare). Never call `unresolved.json` on incident.io pages: it returns a 404 plus 296 KB of HTML. Use HTTP Range to read the head of an Atom feed.

The data is plain JSON, so anything can use it, not just this plugin.

## Accuracy

These numbers come from sessions mined from real Claude Code and Codex use, rewritten as minimal reproductions in [`test/fixtures/mined-cases.json`](test/fixtures/mined-cases.json):

|                                                  | outage-shaped                                                                                                                                        | lookalikes                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Hook                                             | flags 17 of 21 (the 4 misses carry no outage signal in the tool result, such as an API error in the agent's own turn or a bare `504` from `curl -w`) | 0 false positives across 32 cases, plus 0 on a larger, noisier set of 266 mined tool failures |
| Skill trigger (`claude plugin eval`, 1 run each) | loaded in 7 of 7 cases                                                                                                                               | stayed out in 5 of 5 cases                                                                    |

Answer quality on prompts that paste the error and ask about it is already good without the plugin. The difference shows up mid-task. In two agentic cases, the agent is asked to get a script passing, and a vendored CLI fails partway through with a GitHub 502 or an npm registry 503. Each case ran 5 times with the plugin and 5 times without:

| Case                                  | With plugin                               | Without                                                          |
| ------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Yarn install hits an npm registry 503 | 5/5 attribute it to the registry and stop | 0/5: all blamed the eval sandbox's network block instead         |
| Sync script hits a GitHub GraphQL 502 | 5/5 identify a GitHub-side 502 and stop   | 0/3 (2 excluded): all 3 ran out of turns digging through the CLI |

No run in either arm edited code. The skill loaded in all 10 runs with the plugin. The 2 excluded runs are ones where the agent noticed the CLI was a test stand-in. See [evals/README.md](evals/README.md) for how exclusion works and the suite's limits.

## Development

```sh
pnpm install
pnpm check                 # oxlint, oxfmt, offline directory validation, tests (100% coverage)
pnpm validate              # also fetches every endpoint in services.json
pnpm sync                  # copy services.json into the hook plugin after editing it
pnpm eval:prepare && claude plugin eval evals --allow-tools Bash --trust-plugin    # model evals; costs API credits
```

## Related

- [devops-status-mcp-server](https://github.com/cyanheads/devops-status-mcp-server) and [StatusCraft](https://github.com/jabbawocky/statuscraft) are MCP servers that read status pages on request. They're useful when you want to ask; this plugin targets the case where nobody thinks to ask.

## License

MIT
