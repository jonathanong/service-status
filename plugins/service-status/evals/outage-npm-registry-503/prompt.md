---
tags: [npm, holdout, trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

`pnpm install` keeps failing:

```
ERR_PNPM_META_FETCH_FAIL  GET https://registry.npmjs.org/vitest: Service Unavailable - 503
```

Should I delete the lockfile and try again?
