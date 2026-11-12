// Decide whether a failed shell command looks like a third-party outage.
// Pure functions only: no I/O, so every branch is unit-tested.

// Errors that are almost always the remote side (or the network path to it).
export const OUTAGE_PATTERNS = [
  {
    id: "http-5xx",
    re: /\b(?:HTTP(?:\/[\d.]+)?:?\s+|status(?: code)?:?\s*|error:?\s*|failed:?\s*|returned\s+(?:error:\s*)?)(50[0234]|52[0-4]|529)\b/i,
  },
  {
    id: "http-5xx-text",
    re: /\b(?:Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out)\b/i,
  },
  {
    id: "git-rpc",
    re: /\bRPC failed\b|remote end hung up unexpectedly|\bearly EOF\b|unexpected disconnect while reading/i,
  },
  { id: "overloaded", re: /\boverloaded_error\b|\bOverloaded\b.*\b529\b|\b529\b.*\boverloaded\b/i },
  { id: "conn-reset", re: /\bECONNRESET\b|\bsocket hang up\b|connection reset by peer/i },
  {
    id: "timeout",
    re: /\bETIMEDOUT\b|\bESOCKETTIMEDOUT\b|TLS handshake timeout|\bi\/o timeout\b|Operation timed out after|Gateway Timeout|request canceled while waiting for connection/i,
  },
  {
    id: "temporarily-unavailable",
    re: /temporarily unavailable|please try again later|try again in a few minutes/i,
  },
  { id: "dns", re: /Could not resolve host|\bEAI_AGAIN\b|getaddrinfo ENOTFOUND|no such host/i },
];

// Look like outages but are not: the local sandbox, auth, missing resources,
// or the caller's own rate limit. Any of these suppresses the nudge.
export const NOT_OUTAGE_PATTERNS = [
  {
    id: "sandbox",
    re: /Operation not permitted|sandbox proxy|sandbox_violations|sandbox-exec|blocked by (?:the )?(?:sandbox|network allowlist|proxy)|denied by (?:the )?(?:sandbox|proxy)|Network access (?:is )?(?:denied|blocked)/i,
  },
  {
    id: "proxy-refusal",
    re: /CONNECT tunnel failed, response 403|Proxy CONNECT aborted|Received HTTP code 403 from proxy/i,
  },
  {
    id: "auth",
    re: /\b(?:401|403)\b[^\n]*(?:Unauthorized|Forbidden|Bad credentials|Authentication)|Bad credentials|authentication failed|Permission denied \(publickey\)|gh auth login|not logged in|requires authentication/i,
  },
  {
    id: "not-found",
    re: /\b404\b[^\n]*Not Found|Repository not found|could not read Username|E404\b/i,
  },
  {
    id: "test-assertion",
    re: /\bexpected \d{3}\b[^\n]*\bgot \d{3}\b|\bAssertionError\b|Server error responses during this test/i,
  },
  {
    id: "local-daemon",
    re: /docker\.sock|Cannot connect to the Docker daemon|\blocalhost(?::\d+)?\b|127\.0\.0\.1/i,
  },
  { id: "rate-limit", re: /rate limit exceeded|secondary rate limit|\b429\b|Too Many Requests/i },
];

// CLIs that talk to remote services. A local failure (tsc, vitest) that merely
// prints "timeout" should not trigger.
const NETWORK_COMMANDS =
  /(?:^|[\s;&|(])(?:git\b[^;&|\n]*?\s(?:push|pull|fetch|clone|ls-remote|submodule|remote\s+update)|gh|(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|ci|update|up|upgrade|publish|view|info|dlx|fetch|outdated|audit|login|whoami|x)|bunx|pip|pip3|uv|poetry|cargo|go\s+(?:get|mod|install)|docker|podman|brew|curl|wget|aws|gcloud|az|terraform|tofu|gem|bundle|composer|dotnet\s+restore|mvn|gradle|deno|jsr|claude|codex|vercel|wrangler|flyctl|fly|heroku|kubectl|helm|nix|apt-get|apt)(?=$|[\s;&|)])/;

// Commands that only read or test local things. Their output can quote old
// errors (grep over logs) or simulate them (HTTP mocks in tests).
const LOCAL_ONLY_SEGMENT =
  /^\s*(?:\w+=\S*\s+)*(?:cd|ls|cat|head|tail|grep|rg|sed|awk|jq|cut|sort|uniq|wc|diff|find|echo|printf|less|python3?|sleep|true|vitest|jest|pytest|tsc|(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|(?:pnpm|npm)\s+exec\s+(?:vitest|jest)|npx\s+(?:vitest|jest)|cargo\s+test|go\s+test|git\s+(?:grep|show|log|diff|status))\b/;

export function isNetworkCommand(command) {
  return NETWORK_COMMANDS.test(command);
}

// Judged by the first real program (after any `cd`): `sed ... | grep` reads a
// log, `cd app && pnpm install` does not. Quoted pipes make full parsing moot.
export function isLocalOnlyCommand(command) {
  const first = command
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .find((seg) => seg && !/^\s*cd(?:\s|$)/.test(seg));
  return first !== undefined && LOCAL_ONLY_SEGMENT.test(first);
}

export function firstMatch(patterns, text) {
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (m) return { id: p.id, line: lineAround(text, m.index) };
  }
  return null;
}

function lineAround(text, index) {
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index);
  const line = text.slice(start, end === -1 ? undefined : end).trim();
  return line.length > 200 ? `${line.slice(0, 197)}...` : line;
}

// Returns { outage: false, reason } or { outage: true, signal, evidence }.
// `mentionsService(text)` reports whether the text names a known public service
// or host; it lets wrapper CLIs and scripts count, not just git/gh/npm.
export function classify(command, output, mentionsService = () => false) {
  if (!output) return { outage: false, reason: "no-output" };
  const blocker = firstMatch(NOT_OUTAGE_PATTERNS, output);
  if (blocker) return { outage: false, reason: blocker.id };
  const hit = firstMatch(OUTAGE_PATTERNS, output);
  if (!hit) return { outage: false, reason: "no-signal" };
  const network = isNetworkCommand(command);
  if (!network && isLocalOnlyCommand(command)) return { outage: false, reason: "local-command" };
  if (!network && !mentionsService(`${command}\n${output}`)) {
    return { outage: false, reason: "unknown-service" };
  }
  return { outage: true, signal: hit.id, evidence: hit.line };
}
