# Bánh Mì Chợ POS — CI hardening audit and acceptance

**Date:** 2026-11-13. **Status:** PARTIAL IMPLEMENTATION, NOT VERIFIED, NOT A PRODUCTION RELEASE.
**Baseline `main`:** `c425f25fd8d737ca61bba7193973a64d8095260e`.

## Project boundaries

Store Hub (NestJS/Fastify + SQLite WAL) owns cash, order commits, receipt queue, immutable ledger, restart/restore and outbox. Cloud API (NestJS + PostgreSQL) handles replica/sync/remote operations. Web POS and Owner use Vite/React; Staff uses Expo/React Native. Shared API contracts affect all clients. Do not mistake smoke checks, virtual printer outputs, JS bundle generation or loopback HTTP tests for real printer, mobile, LAN or bank-provider acceptance.

## Preserved workflow matrix

| Workflow | Critical evidence | Current trigger / caveat |
|---|---|---|
| app-ci | contracts/store hub/frontend build, domain/integration, bundle budget, HTTP smoke (150) | PR paths-filtered, main push |
| backup-restore-windows | Windows native SQLite backup/restore | Windows-specific, keep separate |
| cloud-ci | PostgreSQL and cloud synchronization/SePay test suite | PR paths-filtered; previously omitted paths for some tests it runs |
| docs-ci | planning pack validation | docs-only not production gate |
| e2e-ci | real Hub API and browser E2E + concurrency | includes process-boundary behaviors |
| hub-perf | 1,500 order burst for default PR/main; manual smoke/burst input | not equivalent to 150-order smoke |
| mobile-bundle-ci | Metro Android + iOS JS asset export | not a native APK/IPA/device test |
| ui-ci | Playwright Chromium full UI + Firefox/WebKit smoke | preserve responsive and accessibility assertions |

## First changes

- Introduce workflow-scoped PR cancellation on all eight workflows; a new revision to the same PR may supersede only previous attempts of that workflow. Pushes to `main` are not automatically cancelled, and manual performance runs are preserved.
- Include `tests/sepay.test.mjs`, `tests/remote-product-commands.test.mjs`, `tests/cloud-projection-order.test.mjs` and `tests/owner-analytics-cloud.test.mjs` in `cloud-ci.yml` path filters because that workflow invokes them. This prevents a PR from changing those tests while missing the cloud workflow.
- No test script or performance profile was removed or made non-blocking.

## Confirmed blockers and proposed next steps

1. **Missing dependency lockfile**: the repo has `package.json`/npm workspaces but no committed `package-lock.json` or pnpm lockfile. `npm install` in CI may resolve different dependency versions. Regenerate a full lockfile with a supported npm version, check in, prove clean install and only then replace with `npm ci` and cache keyed to the lockfile. Do not create a synthetic lockfile by hand.
2. **Trigger completeness**: audit all other path-filtered workflows against actual executed imports/tests; shared `package.json`, contracts and runtime config must trigger dependent checks. Unknown/missing paths fail closed.
3. **Performance fidelity**: retain 150-order quick smoke and 1,500-order burst as separate profiles. Measure their runtime and interpret loopback measurements as synthetic, not field LAN/device SLA evidence.
4. **Cross-platform fidelity**: Windows restore smoke, Chromium/Firefox/WebKit, Expo production JS exports and cloud Postgres suite remain mandatory where applicable.
5. **Account-level Actions failure**: recent runs fail before steps; no new CI pass/runner minute data may be asserted until runner allocation is restored. Compare the exact PR/head commit and preserve historical evidence separately.

## Required acceptance

All tests retained; trigger matrix tested with PR fixtures; no false skipped=passed; no `continue-on-error` masking; same-SHA clean installs, build, unit/integration, domain/payment/print, E2E, Windows, mobile, UI and performance checks; measured runner-minutes and critical path; documented rollback. Existing physical hardware/vendor blockers stay open until real evidence exists.

## CI trigger regression guard

The always-on `docs-ci.yml` now runs `node --test tests/ci-workflow-triggers.test.mjs` using only Node's built-in test runner. It validates direct `node --test` file paths in Cloud CI against its PR path filter and checks shared contracts/manifests. This is a narrow, explicit regression check for the current YAML layout; it is **not** a general GitHub Actions workflow parser and does not replace functional cloud/SePay/PostgreSQL tests. If the workflow structure changes, update the guard with reviewed parsing rather than silently skipping its checks. The guard cannot validate execution until Actions allocation is restored.
