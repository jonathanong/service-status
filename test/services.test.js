import { describe, expect, it } from "vitest";
import {
  matchServices,
  serviceMentioner,
  statusUrl,
} from "../plugins/service-status-hook/hooks/lib/services.js";

const services = [
  { id: "github", hosts: ["github.com", "*.githubusercontent.com"], commands: ["git", "gh"] },
  { id: "npm", hosts: ["registry.npmjs.org"], commands: ["npm", "pnpm"] },
  { id: "bare" },
];

describe("matchServices", () => {
  it("prefers hosts in the output over the command", () => {
    const ids = matchServices(
      services,
      "pnpm install",
      "GET https://codeload.github.com/x 503",
    ).map((s) => s.id);
    expect(ids).toEqual(["github"]);
  });

  it("matches wildcard hosts", () => {
    const ids = matchServices(services, "curl", "https://raw.githubusercontent.com/a 502").map(
      (s) => s.id,
    );
    expect(ids).toEqual(["github"]);
  });

  it("does not match a host inside a longer hostname", () => {
    expect(matchServices(services, "curl x", "https://notgithub.com.evil 503")).toEqual([]);
  });

  it("falls back to the command name", () => {
    expect(matchServices(services, "cd x && pnpm add y", "ECONNRESET").map((s) => s.id)).toEqual([
      "npm",
    ]);
  });

  it("returns nothing when neither matches", () => {
    expect(matchServices(services, "docker pull", "timeout")).toEqual([]);
  });
});

describe("statusUrl", () => {
  it.each([
    [{ endpoints: { status: "s", summary: "x" } }, "s"],
    [{ endpoints: { summary: "x" } }, "x"],
    [{ endpoints: { unresolved: "u" } }, "u"],
    [{ endpoints: { atom: "a" } }, "a"],
    [{ endpoints: { rss: "r" } }, "r"],
    [{ statusPage: "p" }, "p"],
  ])("%j", (svc, expected) => {
    expect(statusUrl(svc)).toBe(expected);
  });
});

describe("serviceMentioner", () => {
  const mentions = serviceMentioner([
    { name: "GitHub", hosts: ["github.com"], commands: ["gh"] },
    { name: "Render", hosts: ["render.com"] },
    { name: "Bare Co" },
  ]);

  it.each([
    ["GitHub GraphQL request failed: 502", true],
    ["> gh: Server Error (HTTP 502)", true],
    ["GET https://api.github.com/x", true],
    ["Bare Co returned 503", true],
    ["Render error in component", false],
    ["https://api.render.com 503", true],
    ["nothing here", false],
  ])("%s → %s", (text, expected) => {
    expect(mentions(text)).toBe(expected);
  });
});
