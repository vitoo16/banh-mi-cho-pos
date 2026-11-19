# QA follow-up — SEC-01 and UI-02 regression (2026-11-04)

## Repository state and scope

- PR #77 was found **already merged** on 2026-11-03T16:41:02Z, merge commit `29a605613ddf8cff3ffdd21770e7b37ed91df1b6`, despite the original QA-only instruction. This follow-up did not perform that merge.
- This is a **fresh test-only branch** created from the then-current `main`: `qa/independent-regressions-20261104`.
- Do **not** merge this branch without an independent review and explicit authorization. Never conflate CI success with real-hardware or commercial release approval.
- No production DB, real bank provider, cloud target, printer or hardware is touched. Real-process tests use temporary SQLite and loopback only.

## Work to be verified by CI

| ID | Test source | Checks | Status |
|---|---|---|---|
| SEC-01 | `tests/e2e/real-hub-api.test.mjs` | CORS allowlist; unauthorized finance reads 401; staff finance 403; sensitive details not echoed in error response; no real external integrations | **PASS — GitHub Actions** |
| UI-02 | `tests/e2e/web-real-hub.spec.ts` | Real Chromium POS + real Hub; inject GET orders 503; display disconnected state and actionable error; disable cash capture; restore queue; unchanged UNPAID order | **PENDING CI** |
| LOAD-02 | New isolated synthetic 100k history benchmark | SQL index/query plus pagination, response latency, memory, field POS UI | **NOT STARTED** |

Do not infer full SEC-01 from these tests alone: server-side log redaction, external attack surface, TLS trust, dependency scanning and actual LAN firewall remain separate verification tasks.

## Skills and governing sources reviewed

- `AGENTS.md`, `docs/spec/MVP-v1.2.md`, `docs/architecture/ARCHITECTURE.md`, `docs/contracts/API_CONTRACT.md`, `docs/plans/MASTER_PLAN.md`, `docs/plans/PARALLEL_EXECUTION.md`, `docs/plans/BACKEND_PLAN.md`, `docs/plans/WEB_PLAN.md`, `docs/qa/ACCEPTANCE.md`, `docs/agents/AGENT_WORKFLOW.md`.
- UI plans: `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md`, `docs/ui/SCREEN_SPECS.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/UI_QA_MATRIX.md`, `docs/ui/AGENT_UI_WORKFLOW.md`.
- Project skills: `security-review`, `performance-qa`, `vite-react-frontend`, `contract-first`, `offline-lan`, `mobile-first-operational-ui`, `ui-visual-audit`.

## Quality gates and risk notes

- Run CI `npm run check`, `npm run build`, `npm run test:e2e`. Report GitHub Action IDs and actual PASS/FAIL counts only after completion.
- Keep CORS fixture explicit and fail closed; reject unknown origins with no `Access-Control-Allow-Origin`. This is one defense layer, **not** a substitute for authentication or CSRF mitigation.
- Fault injection is limited to a browser-side HTTP 503 on the orders queue; no payment is sent. Successful error handling does not prove WAN-down native mobile recovery.
- No change to money rules, prices, ledger, auth business logic or DB schema. Rollback: revert the test-only commits.
- Physical printer, RJ11 drawer, Android/iOS native devices, real SePay merchant and Windows in-store restore remain **BLOCKED** for commercial release.

## Evidence ledger

CI evidence at code commit `13ff20a2446f20d24a168150ca4afc5202abb8d6`:
- [Senior E2E Test Suite — run 41709713613](https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/41709713613): **11/11 Node real-Hub API and burst tests PASS; 4/4 Chromium Playwright real-Hub tests PASS**, 0 FAIL. Both new `SEC-01` and `UI-02` cases were executed and passed. GitHub PR workflows may use the synthesized PR merge checkout.
- [App typecheck and build — run 41709713561](https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/41709713561): `check`, `build` successful; domain 9/9, bundle 2/2, integration 29/29, HTTP perf smoke 2/2 PASS.
- [Documentation validation — run 41709713686](https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/41709713686): PASS; presence/keyword checks, **not** full contract equivalence.
- Performance caveat: the unpaced 150-request E2E burst showed p95 **926.52 ms** (p50 **872.63 ms**, p99 **930.71 ms**) on shared Linux CI runner. The separate paced 8-client HTTP perf smoke showed p95 **24.14 ms**. **Neither is the required Windows/8-phone shop LAN measurement**; this PR does not pass the real-device 400ms p95 acceptance gate.
- The audited browser test injects a 503 only into GET queue and does not claim native WAN-outage acceptance. The SEC-01 test inspects HTTP bodies, not centralized production log pipelines; further production security audit remains open.

Latest documentation-only edits after this run should not be misrepresented as new code tests. Confirm workflow and SHA again before final independent PR approval.
