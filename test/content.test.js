import { describe, expect, it } from "vitest";
import { classify, isContentReader } from "../plugins/service-status/hooks/lib/classify.js";
import { DEFAULT_SERVICES } from "../plugins/service-status/hooks/lib/nudge.js";
import {
  loadServices,
  serviceCommandMatcher,
  serviceMentioner,
} from "../plugins/service-status/hooks/lib/services.js";

const services = loadServices(DEFAULT_SERVICES);
const run = (command, output) =>
  classify(command, output, serviceMentioner(services), serviceCommandMatcher(services));

describe("isContentReader", () => {
  it.each([
    "gh issue view 3 --json body",
    "gh pr view 5 --comments",
    "gh pr diff 5",
    "gh search issues timeout",
    "gh api --paginate repos/acme/app/issues/3/comments --jq '.[].body'",
    "gh api repos/acme/app/contents/README.md",
    "git --no-pager diff",
    "git -C app log -3",
    "git show HEAD",
    "pnpm test; git diff",
  ])("yes: %s", (c) => {
    expect(isContentReader(c)).toBe(true);
  });

  it.each([
    "gh pr checks",
    "gh run view 123 --log-failed",
    "gh api repos/acme/app/actions/jobs/123/logs",
    "git push",
    "git fetch origin main",
    "pnpm install",
  ])("no: %s", (c) => {
    expect(isContentReader(c)).toBe(false);
  });
});

describe("content readers", () => {
  it.each([
    [
      "gh issue view 3 --json title,body 2>&1",
      '{"body":"## Problem\\n\\nclassify(\\"m365 status\\", \\"Error: connect ETIMEDOUT\\")","title":"Hook"}',
    ],
    [
      "gh issue view 12",
      "title:\tPush fails\nstate:\tOPEN\n--\nWe saw this:\nHTTP 502: Bad Gateway (https://api.github.com/graphql)",
    ],
    [
      "gh pr view 5 --comments",
      "title:\tRetry\n--\nfatal: unable to access 'https://github.com/a/b/': Could not resolve host: github.com",
    ],
    [
      "gh api repos/acme/app/issues/3/comments --jq '.[].body'",
      "Seeing this again\nerror: RPC failed; HTTP 503 curl 22",
    ],
    ["git show HEAD", "commit abc\n\n    Retry on error\n\n    error: RPC failed; HTTP 503"],
    ["git log -1", "commit abc\nAuthor: a\n\n    fatal: early EOF on clone"],
    [
      "pnpm test 2>&1 | tail -3; git diff",
      'Tests 3 passed\ndiff --git a/t.js b/t.js\n+  expect(classify("gh api x", "gh: HTTP 503")).toBe(1);\n fatal: early EOF',
    ],
    ["gh pr diff 5", '+    ["stripe listen", "Error: 502 Bad Gateway"],'],
  ])("does not flag %s", (command, output) => {
    expect(run(command, output)).toEqual({ outage: false, reason: "quoted-content" });
  });

  it.each([
    ["gh issue view 3", "HTTP 502: Bad Gateway (https://api.github.com/graphql)"],
    [
      "gh pr view 5 --json body",
      'Exit code 1\n\nPost "https://api.github.com/graphql": net/http: TLS handshake timeout',
    ],
    ["gh pr diff 5", "gh: Server Error (HTTP 502)"],
    ["git fetch && git log origin/main", "fatal: the remote end hung up unexpectedly"],
  ])("flags %s when the CLI's own error comes first", (command, output) => {
    expect(run(command, output)).toMatchObject({
      outage: true,
      evidence: output.split("\n").at(-1),
    });
  });

  it("still needs a network command or a known service", () => {
    expect(classify("git log", "fatal: early EOF")).toEqual({
      outage: false,
      reason: "local-command",
    });
  });
});
