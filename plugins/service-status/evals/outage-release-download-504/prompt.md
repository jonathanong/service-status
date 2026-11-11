---
tags: [github, ci, holdout, trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

CI is red on my PR. The failing step log says:

```
github-actionlint: Download failed: 504 Gateway Time-out for https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz
[ELIFECYCLE] Command failed with exit code 1.
```

How do I fix the workflow?
