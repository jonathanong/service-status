# Contributing

The most useful contributions are to the directory: [`services.json`](plugins/service-status/skills/service-status/services.json).

## Add or fix a service

1. Find the provider's status page. Then find its machine-readable endpoints:
   - **Atlassian Statuspage**: `/api/v2/status.json` returns `{"status":{"indicator":...}}`, and the response has an `x-statuspage-version` header. Use `adapter: "statuspage"` and add `unresolved`, `summary`, `atom` and `rss` if they respond.
   - **incident.io**: `/api/v2/status.json` works, but `/api/v2/incidents/unresolved.json` returns 404. Use `adapter: "incidentio"` with `status` and `proxy` (`{statusPage}/proxy/{host}`).
   - Otherwise, check [`references/adapters.md`](plugins/service-status/skills/service-status/references/adapters.md) for the other formats. If only an Atom or RSS feed exists, use `feed-only`.
2. Add an entry, keeping `services` sorted by `id`. Fill in:
   - `hosts`: the hostnames that appear in that service's **error messages** (API, registry, CDN or asset hosts). These are how the hook and skill match a failure to a service. A host also matches its subdomains.
   - `commands`: CLIs whose failures usually mean this service (optional).
   - `components`: the component names agents care about, spelled exactly as the page spells them (optional).
   - `notes`: anything that would mislead an agent, for example "umbrella page; use product pages" or "lists data-centre maintenance as non-operational".
3. Run:

   ```sh
   pnpm install
   pnpm validate        # schema, invariants, and a live fetch of every endpoint
   ```

   CI runs the same live check on every PR that changes `services.json`.

Rules:

- Only use URLs you have fetched successfully with plain `curl` (no `-L`, no custom headers). Never add a URL from memory.
- Don't add pages that block non-browser clients, and never work around a 403 with a fake browser User-Agent.
- Don't add stale pages. If the newest incident is years old, the vendor has probably moved.

## Hook and skill changes

- The hook (`plugins/service-status/hooks/`) must stay dependency-free, network-free and fast. It runs after every Bash call.
- Precision matters more than recall. Every new pattern needs a case in `test/fixtures/mined-cases.json` or `test/classify.test.js`, and lookalikes (sandbox, auth, 404, rate limits, mocked 500s) must stay quiet.
- `pnpm check` must pass with 100% coverage.
- For skill wording changes, run the evals (see [`plugins/service-status/evals/README.md`](plugins/service-status/evals/README.md)).
