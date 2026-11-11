---
tags: [tests, holdout, no-trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

My test is failing:

```
$ pnpm exec vitest run api/request-validation.test.ts
Error: expected 200 "OK", got 500 "Internal Server Error"
 ❯ api/request-validation.test.ts:143:70
```

Any idea?
