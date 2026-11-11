import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invariantErrors, pingErrors, schemaErrors, validate } from "../scripts/lib/validate.js";

const dir = new URL("../plugins/service-status/skills/service-status/", import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, dir), "utf8"));
const schema = read("services.schema.json");
const real = read("services.json");

const svc = (id, extra = {}) => ({
  id,
  name: id,
  category: "other",
  statusPage: `https://status.${id}.example`,
  adapter: "statuspage",
  endpoints: { status: `https://status.${id}.example/api/v2/status.json` },
  ...extra,
});
const doc = (...services) => ({ version: 1, services });

describe("the shipped directory", () => {
  it("passes schema and invariants", async () => {
    expect(await validate(real, schema, { skipPing: true })).toEqual([]);
  });
});

describe("schemaErrors", () => {
  it("rejects unknown fields and bad ids", () => {
    const errors = schemaErrors(doc(svc("Bad_ID", { extra: 1 })), schema);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.every((e) => e.startsWith("schema: "))).toBe(true);
  });

  it("reports the root path", () => {
    expect(schemaErrors({}, schema)[0]).toMatch(/^schema: \/ /);
  });
});

describe("invariantErrors", () => {
  it("flags duplicates, http, incidentio unresolved and ordering", () => {
    const errors = invariantErrors(
      doc(
        svc("b"),
        svc("a", { endpoints: { status: "http://insecure.example" } }),
        svc("a"),
        svc("c", { adapter: "incidentio", endpoints: { unresolved: "https://c.example/u" } }),
        { id: "d" },
      ),
    );
    expect(errors).toEqual([
      "a: endpoints.status must be https",
      "a: duplicate id",
      "c: incident.io pages have no unresolved.json; use proxy",
      "services must be sorted by id",
    ]);
  });
});

describe("pingErrors", () => {
  it("reports non-2xx and network errors, cancelling bodies", async () => {
    let cancelled = 0;
    const fetchImpl = async (url) => {
      if (url.includes("boom")) throw new Error("ECONNRESET");
      const body = { cancel: async () => cancelled++ };
      return url.includes("down")
        ? { ok: false, status: 503, body }
        : { ok: true, status: 200, body: url.includes("nobody") ? null : body };
    };
    const data = doc(svc("up"), svc("down"), svc("boom"), svc("nobody"), { id: "noendpoints" });
    expect(await pingErrors(data, { fetchImpl, concurrency: 2 })).toEqual([
      "boom status: ECONNRESET https://status.boom.example/api/v2/status.json",
      "down status: HTTP 503 https://status.down.example/api/v2/status.json",
    ]);
    expect(cancelled).toBe(2);
  });

  it("handles an empty directory with default options", async () => {
    expect(await pingErrors(doc())).toEqual([]);
  });
});

describe("validate", () => {
  it("stops at schema errors", async () => {
    const errors = await validate({}, schema);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith("schema: "))).toBe(true);
  });

  it("pings when asked", async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, body: null });
    expect(await validate(doc(svc("a")), schema, { fetchImpl })).toEqual([
      "a status: HTTP 500 https://status.a.example/api/v2/status.json",
    ]);
  });
});
