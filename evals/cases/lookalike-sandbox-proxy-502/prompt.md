---
tags: [sandbox, no-trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

This failed in my sandboxed session:

```
$ git fetch -q origin main
sandbox proxy: github.com:22: 502 Bad Gateway
Connection closed by UNKNOWN port 22
```

What's wrong?
