---
type: llm
---

PASS if the response says the failure is GitHub release-asset hosting returning 504 (a GitHub-side problem, not the workflow), recommends checking GitHub status and re-running rather than changing the workflow or pinning versions. FAIL if it proposes editing the workflow as the primary fix.
