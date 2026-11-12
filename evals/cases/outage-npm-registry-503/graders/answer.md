---
type: llm
---

PASS if the response identifies the npm registry returning 503 as a likely registry-side outage, recommends checking npm's status (status.npmjs.org) and waiting/retrying, and advises against deleting the lockfile or changing dependencies. FAIL otherwise.
