// Map hosts and commands seen in a failure to directory entries.
import { readFileSync } from "node:fs";

export function loadServices(path) {
  return JSON.parse(readFileSync(path, "utf8")).services;
}

// A host also matches its subdomains: github.com covers codeload.github.com.
function hostPattern(host) {
  const escaped = host.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[\\w.-]+");
  return new RegExp(`(?:^|[^\\w.-])(?:[\\w-]+\\.)*${escaped}(?![\\w-])`, "i");
}

function commandPattern(cmd) {
  return new RegExp(`(?:^|[\\s;&|(])${cmd}(?=$|[\\s;&|)])`);
}

// Hosts in the error text win over the command name: `pnpm install` failing on
// a GitHub tarball is a GitHub problem, not an npm one.
export function matchServices(services, command, output) {
  const text = `${command}\n${output}`;
  const byHost = services.filter((s) => (s.hosts ?? []).some((h) => hostPattern(h).test(text)));
  if (byHost.length > 0) return byHost;
  return services.filter((s) => (s.commands ?? []).some((c) => commandPattern(c).test(command)));
}

export function statusUrl(service) {
  const e = service.endpoints ?? {};
  return e.status ?? e.summary ?? e.unresolved ?? e.atom ?? e.rss ?? service.statusPage;
}

// Build a predicate: does this error line name a known service? Matches hosts,
// the display name as a whole word ("GitHub GraphQL request failed: 502"), or a
// CLI prefix such as "gh: Server Error (HTTP 502)".
// Names that are also everyday words ("Render error", "Modal dialog") only
// count through their hosts.
const AMBIGUOUS_NAMES = new Set([
  "Convex",
  "Depot",
  "Harness",
  "Hex",
  "Linear",
  "Miro",
  "Modal",
  "Neon",
  "Notion",
  "Prisma",
  "Render",
  "Resend",
  "Socket",
  "Square",
]);

export function serviceMentioner(services) {
  const tests = services.flatMap((s) => [
    ...(s.hosts ?? []).map(hostPattern),
    ...(AMBIGUOUS_NAMES.has(s.name)
      ? []
      : [new RegExp(`(?:^|[^\\w.-])${s.name.replace(/[.+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`)]),
    ...(s.commands ?? []).map((c) => new RegExp(`(?:^|[\\s>])${c}:\\s`)),
  ]);
  return (line) => tests.some((re) => re.test(line));
}
