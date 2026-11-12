---
tags: [github, git, trigger]
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill, Bash]
---

Pushing my branch failed:

```
$ git push -u origin feature
remote: Internal Server Error
remote: Request ID FD49:20FC10:563AD3:689144:6AEAFEE6
 ! [remote rejected] HEAD -> feature (Internal Server Error)
```

Should I force push or rewrite the branch?
