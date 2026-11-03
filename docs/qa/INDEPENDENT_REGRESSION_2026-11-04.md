# QA follow-up — SEC-01 and UI-02 regression (2026-11-04)

## Repository state and scope

- PR #77 was found **already merged** on 2026-11-03T16:41:02Z, merge commit `29a605613ddf8cff3ffdd21770e7b37ed91df1b6`, despite the original QA-only instruction. This follow-up did not perform that merge.
- This is a **fresh test-only branch** created from the then-current `main`: `qa/independent-regressions-20261104`.
- Do **not** merge this branch without an independent review and explicit authorization. Never conflate CI success with real-hardware or commercial release approval.
- No production DB, real bank provider, cloud target, printer or hardware is touched. Real-process tests use temporary SQLite and loopback only.

## Work to be verified by CI

| ID | Test source | Checks | Status |
|---|---|---|---|
| SEC-01 | `tests/e2e/real-hub-api.test.mjs` | CORS allowlist; unauthorized finance reads 401; staff finance 403; sensitive details not echoed in error response; no real external integrations | **PENDING CI** |
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

CI status: **PENDING**, do not change this field to PASS until matching run and SHA are recorded.
