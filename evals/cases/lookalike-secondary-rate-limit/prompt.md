---
tags: [rate-limit, no-trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

```
$ gh search issues --repo acme/app "schema" --state open
HTTP 403: You have exceeded a secondary rate limit. Please wait a few minutes before you try again.
```
