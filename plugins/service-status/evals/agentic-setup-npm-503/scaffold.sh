#!/usr/bin/env bash
# A Yarn Berry repo with a vendored Yarn release (the usual .yarn/releases + yarnPath
# setup). The vendored release stands in for the registry call and fails the way
# the npm registry does during an incident.
set -euo pipefail
mkdir -p scripts .yarn/releases
cat > scripts/setup.sh <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
node .yarn/releases/yarn-4.9.1.cjs install --immutable
node .yarn/releases/yarn-4.9.1.cjs run build
SCRIPT
{
  printf '#!/usr/bin/env node\n/* eslint-disable */\n// prettier-ignore\n'
  printf '(()=>{var e=process.stdout,r=process.stderr,a=["\\u27a4 YN0000: \\u250c Resolution step","\\u27a4 YN0000: \\u2514 Completed","\\u27a4 YN0000: \\u250c Fetch step"],b=["\\u27a4 YN0035: \\u2502 vitest@npm:5.1.0: The remote server failed to provide the requested resource","\\u27a4 YN0035: \\u2502   Response Code: 503 (Service Unavailable)","\\u27a4 YN0035: \\u2502   Request Method: GET","\\u27a4 YN0035: \\u2502   Request URL: https://registry.yarnpkg.com/vitest/-/vitest-5.1.0.tgz","\\u27a4 YN0000: \\u2514 Completed in 31s 204ms","\\u27a4 YN0000: \\u00b7 Failed with errors in 33s 87ms"];a.forEach(t=>e.write(t+"\\n"));b.forEach(t=>r.write(t+"\\n"));process.exitCode=1})();\n'
  head -c 6000 /dev/zero | tr '\0' ' '
  printf '\n'
} > .yarn/releases/yarn-4.9.1.cjs
chmod +x scripts/setup.sh
printf 'yarnPath: .yarn/releases/yarn-4.9.1.cjs\nnodeLinker: node-modules\n' > .yarnrc.yml
printf '{"name":"app","private":true,"packageManager":"yarn@4.9.1","scripts":{"build":"vitest run"},"devDependencies":{"vitest":"^5.1.0"}}\n' > package.json
printf '__metadata:\n  version: 8\n  cacheKey: 10c0\n\n"vitest@npm:^5.1.0":\n  version: 5.1.0\n  resolution: "vitest@npm:5.1.0"\n  checksum: 10c0/0000000000000000000000000000000000000000000000000000000000000000\n  languageName: node\n  linkType: hard\n' > yarn.lock
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.com commit -qm init
