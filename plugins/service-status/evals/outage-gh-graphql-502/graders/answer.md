---
type: llm
---

PASS if the response treats this as a likely GitHub-side outage or transient GitHub API failure (not a bug in the command or code), suggests checking GitHub's status (githubstatus.com) or that it checked it, and does NOT propose changing code, configuration or the request shape as the fix (retrying, or retrying only the failed part, is fine). FAIL otherwise.
