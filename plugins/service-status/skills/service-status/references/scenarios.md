# Scenarios

These are drawn from real agent sessions and rewritten as minimal reproductions. Each scenario shows the failure, the tempting wrong move, and the cheap right one.

## 1. GitHub GraphQL 502 from a wrapper CLI

```
$ pr-shepherd apply review https://github.com/acme/app/pull/123 --reply-thread-ids A,B,C
Errors:
A: GitHub GraphQL request failed: 502 <html>
<head><title>502 Bad Gateway</title></head>
```

- **Wrong:** split one 49-item GraphQL query into five batches, then switch to per-item REST calls. That cost two turns in the original session.
- **Right:** the host and the name say GitHub. Look up the entry, then fetch about 215 bytes:

```sh
curl -s https://www.githubstatus.com/api/v2/status.json | jq -r .status.indicator   # minor
curl -s https://www.githubstatus.com/api/v2/incidents/unresolved.json \
  | jq -r '.incidents[] | [.impact,.status,.name,([.components[]?.name]|join(","))] | @tsv'
# minor  investigating  Incident with API Requests  API Requests
```

- **Report:** "GitHub's API is returning 502s. githubstatus.com shows 'Incident with API Requests' (minor, investigating). I haven't changed anything and will retry the replies once it clears."

## 2. Release-asset download 504 inside CI

```
github-actionlint: Download failed: 504 Gateway Time-out for https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz
[ELIFECYCLE] Command failed with exit code 1.
```

- **Wrong:** blame the workflow, pin a different version, or probe the asset with curl five times.
- **Right:** the asset host is GitHub (`github.com/.../releases/download`, `release-assets.githubusercontent.com`), not your CI provider. Release downloads sit under the "Packages" and "Git Operations" components on githubstatus.com. Check status. If it's green but several runs fail the same way, call it a probable unannounced incident and re-run the job once later, without editing code.

## 3. `git push` rejected with a 500

```
remote: Internal Server Error
 ! [remote rejected] HEAD -> feature (Internal Server Error)
```

- **Right:** check GitHub "Git Operations". `remote rejected (Internal Server Error)` is not a hook rejection or a protected-branch error. Those print a reason. Don't rewrite history or force-push to "fix" it.

## 4. npm registry timeouts during install

```
ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/vitest: Service Unavailable - 503
```

```sh
curl -s https://status.npmjs.org/api/v2/status.json | jq -r .status.indicator
```

- **Wrong:** delete the lockfile, switch registries, or downgrade packages.
- **Right:** if npm reports an incident, wait. If it's green and only one package fails, retry once. A `codeload.github.com` URL in the error means a git dependency, so check GitHub instead.

## 5. Anthropic API 529 overloaded

```
API Error: 529 Overloaded. This is a server-side issue, usually temporary — try again in a moment.
```

```sh
curl -s https://status.claude.com/api/v2/status.json | jq -c .status
```

A 529 is capacity, not your request. Don't change prompts or code to work around it. Tell the user and retry later. The same applies to OpenAI `overloaded_error` and 5xx responses: `status.openai.com` is on incident.io, so after `status.json` use the `proxy` endpoint, never `unresolved.json`.

## 6. Green page, repeated failures

GitHub status says `none`, but `gh pr list`, `gh run view` and `gh api` all return `HTTP 504` within a few minutes.

Status pages often lag by 10 to 30 minutes. Several unrelated requests failing with 5xx or timeouts is evidence of an incident in its own right. Report it as "probable, not yet on the status page", retry once after a short wait, and don't touch code.

## 7. Lookalike: sandbox proxy 502

```
sandbox proxy: github.com:22: 502 Bad Gateway
```

This is not GitHub. The local sandbox refused the connection. Other signs of the same thing are `Operation not permitted`, `<sandbox_violations>` and `CONNECT tunnel failed, response 403`. Ask for the host to be allowed. A status check would just come back green and waste a call.

## 8. Lookalike: mocked 500 in tests

```
Error: expected 200 "OK", got 500 "Internal Server Error"
 ❯ api/request-validation.test.ts:143:70
```

Your own server, under test, returned 500. Debug the code. The same goes for `localhost`, `127.0.0.1` and `docker.sock` errors.

## 9. Lookalike: rate limits and auth

```
HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.
HTTP 401: Bad credentials (https://api.github.com/user)
```

Both are about you, not the provider. Back off or fix the credentials. Don't check status.

## 10. Umbrella pages

A Jira API call fails with 503. `status.atlassian.com` (the umbrella page) is green, but it only lists incidents that span several products. Use the `jira` entry instead. Its `notes` field says so. GitHub is the opposite case: one page covers everything, with Actions, Packages, Pages and Copilot as components.
