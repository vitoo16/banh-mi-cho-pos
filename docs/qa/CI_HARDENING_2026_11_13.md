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

## Follow-up implementation — 2026-11-14 (candidate, not accepted)
- All eight workflow files and their job/run commands remain present. PR-only cancellation and Cloud CI trigger regression checks from this branch remain intact.
- Added Playwright browser-payload caching in `e2e-ci.yml` (Chromium) and `ui-ci.yml` (Chromium, Firefox, WebKit), keyed to runner OS, root package manifest and browser configs. Each job continues installing required browsers/system libraries and executing exactly the same existing suites.
- No npm dependency cache or `npm ci` migration was attempted: the repository still lacks a verified committed npm lockfile; `npm install` reproducibility is an existing blocker, not an optimization to hide.
- Keep all payment, cash, printer UNKNOWN/reprint, offline recovery, PostgreSQL, Windows SQLite restore, 150/1,500-order performance, JS mobile export and browser contracts as separately applicable gates.
- **Acceptance remains blocked** on actual hosted-runner allocation and same-SHA cross-platform passes. Verify cached versus cold runs, artifacts and regression matrix before claiming speed or financial savings.
- Rollback: remove only the browser-cache steps without changing existing test stages.

## Follow-up correction — 2026-11-17 (candidate, not accepted)

A design review identified that `cancel-in-progress: false` does **not** protect queued `main` runs when they share the same concurrency group. GitHub's default concurrency queue holds only one pending run per group; a newer queued run replaces the previous pending run. This can silently discard commit-level `main` evidence even without canceling a currently running job. See [GitHub Actions concurrency documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

- Corrected all eight workflows to use the PR number for `pull_request` concurrency groups and unique `github.run_id` for `push` and manual runs. Keep `cancel-in-progress` true only for PR events. PR supersession remains efficient while distinct `main`/manual run checks no longer replace each other's pending slots.
- Added `scripts/check-web-bundles.mjs` to App CI's PR paths; changing the budget-checking script must trigger the `npm run test:bundle` gate.
- Expanded `tests/ci-workflow-triggers.test.mjs` from three to five built-in Node regression tests. The two new tests lock the eight-workflow concurrency invariant and App CI bundle-checker PR path.
- **Supplemental static inspection of the actual PR branch:** all eight workflow concurrency expressions matched, all five Cloud CI directly executed test paths remain covered, and App CI references the bundle-checker script in its PR trigger. This is a static source inspection, **not** a GitHub Actions execution pass.
- **Still blocked:** current Docs/App/Cloud jobs on this PR head continue to have `runner_id=0` and zero executed steps. Do not claim regression tests ran on Node 24 or merge the PR until real CI executes.

**Rollback:** Revert this PR if workflow syntax or required gates regress; do not selectively restore a shared `main` concurrency group, which could once again replace pending `main` evidence. The `scripts/check-web-bundles.mjs` trigger is a correctness fix and should be retained when replacing the broader CI orchestration.
