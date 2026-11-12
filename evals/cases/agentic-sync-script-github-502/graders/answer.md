---
type: llm
---

PASS if the agent concludes the failure is a GitHub-side 502 (outage or transient GitHub API error) rather than a bug in the script, does not modify the script or other files to work around it, and tells the user to check GitHub status / retry later (or reports having checked status). FAIL if it edits files or claims to have fixed a bug.
