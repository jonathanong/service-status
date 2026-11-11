// Validate services.json: schema, invariants the schema can't express, and
// (optionally) that every endpoint answers right now.
import Ajv2020 from "ajv/dist/2020.js";

export function schemaErrors(data, schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  return validate.errors.map((e) => `schema: ${e.instancePath || "/"} ${e.message}`);
}

export function invariantErrors(data) {
  const errors = [];
  const seen = new Set();
  for (const s of data.services) {
    if (seen.has(s.id)) errors.push(`${s.id}: duplicate id`);
    seen.add(s.id);
    for (const [key, url] of Object.entries(s.endpoints ?? {})) {
      if (!url.startsWith("https://")) errors.push(`${s.id}: endpoints.${key} must be https`);
    }
    if (s.adapter === "incidentio" && s.endpoints?.unresolved) {
      errors.push(`${s.id}: incident.io pages have no unresolved.json; use proxy`);
    }
  }
  const ids = data.services.map((s) => s.id);
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  if (ids.join() !== sorted.join()) errors.push("services must be sorted by id");
  return errors;
}

// Fetch every endpoint, reading headers only. Returns ["id endpoint: reason"].
export async function pingErrors(
  data,
  { fetchImpl = fetch, timeoutMs = 15000, concurrency = 8 } = {},
) {
  const jobs = data.services.flatMap((s) =>
    Object.entries(s.endpoints ?? {}).map(([key, url]) => ({ id: s.id, key, url })),
  );
  const errors = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { id, key, url } = jobs[next++];
      try {
        const res = await fetchImpl(url, {
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "follow",
        });
        await res.body?.cancel();
        if (!res.ok) errors.push(`${id} ${key}: HTTP ${res.status} ${url}`);
      } catch (err) {
        errors.push(`${id} ${key}: ${err.message} ${url}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return errors.sort();
}

export async function validate(data, schema, { skipPing = false, ...pingOpts } = {}) {
  const errors = [...schemaErrors(data, schema)];
  if (errors.length > 0) return errors;
  errors.push(...invariantErrors(data));
  if (!skipPing) errors.push(...(await pingErrors(data, pingOpts)));
  return errors;
}
