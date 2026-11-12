---
tags: [github, wrapper, trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

I'm replying to review threads on a PR. This just failed:

```
$ pr-shepherd apply review https://github.com/acme/app/pull/123 --reply-thread-ids A,B,C --message "Fixed"
Errors:
A: GitHub GraphQL request failed: 502 <html>
<head><title>502 Bad Gateway</title></head>
```

What should I do next?
