---
type: llm
---

PASS if the response treats the 504 as a GitHub-side timeout or possible outage (not a problem with the user's query or code) and points to GitHub status (githubstatus.com) or reports having checked it. Failing later for unrelated environment reasons (for example missing gh auth in this sandbox) does not by itself fail the case. FAIL otherwise.
