# Bánh Mì Chợ POS — Local-first CI/CD

All eight GitHub workflows remain available only as manual fallback after merge. No checks were removed and no production-readiness claim is made.

Windows prerequisites: Git, Node 24, npm, Docker Desktop Linux containers and Compose, Playwright browsers, Expo Metro dependencies. Do not point the local runner at production Store Hub SQLite, Postgres or bank credentials.

    git config core.hooksPath .githooks
    node scripts/local-ci.mjs --profile quick
    node scripts/local-ci.mjs --profile full
    node scripts/local-ci.mjs --profile release

Quick: docs/contract, typecheck, shared contracts/store/web/cloud builds, bundle budget, domain/integration, Hub HTTP smoke.
Full: Quick + Windows SQLite backup/restore, isolated PostgreSQL cloud/sync contract, responsive Chromium/Firefox/WebKit mock UI tests, real Hub API/burst+browser E2E, 10x Hub performance and Android/iOS JS bundle export.
Release: Full + immutable exact-commit local *candidate* copy of POS/Owner/Hub/Cloud build artifacts and Expo JS export. This is NOT signed Android/iOS output, cloud deployment or shop rollout.

Dedicated Postgres is bound to 127.0.0.1:15433 in ci/docker-compose.local-ci.yml and removed with volumes on exit. The local CI runner refuses to treat missing tools or service failures as success. Run evidence and logs appear under ignored .local-ci/runs/. Playwright traces in test-results/; Hub perf in artifacts/perf/.

The optional .githooks/pre-push runs Quick; enable with git config core.hooksPath .githooks. Still require Full on the exact commit before review. GitHub branch protections cannot see local-only tests.

DO NOT mark payment settlement, physical printer receipts, Android/iOS native device behavior, Windows reboot restore, LAN failover, bank sandbox integration or real terminal performance as approved without hardware/manual evidence. The Store Hub remains the money authority and no automated cloud promotion occurs.

Existing package setup currently uses npm install, not npm ci, because no root package-lock.json is committed. Track a reproducible lockfile separately before switching to npm ci; do not silently change the workspace's package manager.
