---
tags: [github, trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

Can you continue triaging open PRs? The last command gave:

```
$ gh pr list --repo acme/app --state open --json number,title
HTTP 504: 504 Gateway Timeout (https://api.github.com/graphql)
```
