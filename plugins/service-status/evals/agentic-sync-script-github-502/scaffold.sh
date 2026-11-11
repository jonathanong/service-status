#!/usr/bin/env bash
# A repo whose sync script calls a vendored CLI that hits GitHub's GraphQL API.
# The CLI stands in for the network call and fails the way GitHub does during an incident.
set -euo pipefail
mkdir -p scripts node_modules/.bin
cat > scripts/sync-reviews.sh <<'SCRIPT'
#!/usr/bin/env bash
# Mirror review-thread state for open PRs into .cache/reviews.json
set -euo pipefail
mkdir -p .cache
./node_modules/.bin/pr-sync --repo acme/app --state open --out .cache/reviews.json
SCRIPT
cat > node_modules/.bin/pr-sync <<'CLI'
#!/usr/bin/env node
process.stderr.write("pr-sync: fetching review threads for acme/app (12 open PRs)\n");
process.stderr.write("Errors:\n  PR_kwDOAbc123: GitHub GraphQL request failed: 502 <html>\n<head><title>502 Bad Gateway</title></head>\n");
process.exit(1);
CLI
chmod +x scripts/sync-reviews.sh node_modules/.bin/pr-sync
printf '{"name":"app","private":true,"scripts":{"sync":"bash scripts/sync-reviews.sh"}}\n' > package.json
printf 'node_modules/\n.cache/\n' > .gitignore
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm init
