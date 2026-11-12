import { describe, expect, it } from "vitest";
import {
  classify,
  firstMatch,
  isNetworkCommand,
} from "../plugins/service-status-hook/hooks/lib/classify.js";

describe("classify", () => {
  it.each([
    [
      "git push origin main",
      "error: RPC failed; HTTP 503 curl 22 The requested URL returned error: 503",
      "http-5xx",
    ],
    ["git fetch", "fatal: the remote end hung up unexpectedly\nfatal: early EOF", "git-rpc"],
    ["gh pr view 123", "HTTP 502: Bad Gateway (https://api.github.com/graphql)", "http-5xx"],
    [
      "pnpm install",
      "ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/vitest: Service Unavailable",
      "http-5xx-text",
    ],
    ["npm install", "npm error code ECONNRESET\nnpm error network aborted", "conn-reset"],
    [
      "docker pull node:24",
      'Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: TLS handshake timeout',
      "timeout",
    ],
    [
      "curl -s https://api.anthropic.com/v1/messages",
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      "overloaded",
    ],
    [
      "git clone https://github.com/acme/app",
      "fatal: unable to access 'https://github.com/acme/app/': Could not resolve host: github.com",
      "dns",
    ],
    [
      "cargo build",
      "warning: spurious network error: the service is temporarily unavailable",
      "temporarily-unavailable",
    ],
  ])("flags %s", (command, output, signal) => {
    const r = classify(command, output);
    expect(r).toMatchObject({ outage: true, signal });
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it.each([
    [
      "git push",
      "fatal: unable to access: Could not resolve host: github.com (Operation not permitted)",
      "sandbox",
    ],
    ["curl https://x.io", "curl: (56) CONNECT tunnel failed, response 403", "proxy-refusal"],
    ["gh api user", "HTTP 401: Bad credentials (https://api.github.com/user)", "auth"],
    ["git push", "remote: Repository not found.\nfatal: repository not found", "not-found"],
    ["gh api search/code", "HTTP 403: API rate limit exceeded for user", "rate-limit"],
    ["npm install", "", "no-output"],
    ["pnpm test", "AssertionError: expected 1 to equal 2", "test-assertion"],
    ["pnpm vitest", "Error: Test timed out in 5000ms. ECONNRESET in fixture", "unknown-service"],
    [
      "npm test",
      "FetchError: request to http://localhost:3000 failed, reason: socket hang up",
      "local-daemon",
    ],
    ["node server.js", "Error: read ECONNRESET", "unknown-service"],
  ])("does not flag %s (%s)", (command, output, reason) => {
    expect(classify(command, output)).toEqual({ outage: false, reason });
  });

  it("truncates long evidence lines", () => {
    const r = classify("gh api x", `HTTP 503 ${"x".repeat(400)}`);
    expect(r.evidence).toHaveLength(200);
    expect(r.evidence.endsWith("...")).toBe(true);
  });

  it("returns the matched line, not the whole output", () => {
    expect(firstMatch([{ id: "a", re: /boom/ }], "one\ntwo boom\nthree")).toEqual({
      id: "a",
      line: "two boom",
    });
    expect(firstMatch([{ id: "a", re: /boom/ }], "boom")).toEqual({ id: "a", line: "boom" });
  });
});

describe("isNetworkCommand", () => {
  it.each(["git push", "cd app && pnpm install", "(gh pr list)", "aws s3 ls", "go mod download"])(
    "yes: %s",
    (c) => {
      expect(isNetworkCommand(c)).toBe(true);
    },
  );
  it.each(["git status", "pnpm-lint", "pnpm test", "npx vitest", "node build.js", "tsc -p ."])(
    "no: %s",
    (c) => {
      expect(isNetworkCommand(c)).toBe(false);
    },
  );
});

describe("gating", () => {
  it("ignores log readers and test runners", () => {
    expect(classify("tail -30 ci.log", "HTTP 503 from upstream")).toEqual({
      outage: false,
      reason: "local-command",
    });
    expect(classify("cd app && sed -n 1,9p x.log | grep 503", "error: 503")).toEqual({
      outage: false,
      reason: "local-command",
    });
  });

  it("lets a wrapper CLI count when the text names a known service", () => {
    expect(
      classify("my-tool sync", "GitHub GraphQL request failed: 502", () => true),
    ).toMatchObject({ outage: true });
  });

  it("prefers a network command over a leading reader", () => {
    expect(classify("cat a.log; gh api x", "gh: HTTP 503")).toMatchObject({ outage: true });
  });
});
