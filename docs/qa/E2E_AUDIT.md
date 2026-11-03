# Bánh Mì Chợ POS — Senior E2E QA Architecture & Source Audit

**Auditor:** Senior SDET / QA Architect  
**Branch:** `qa/senior-e2e-audit-pack`  
**Historical Windows execution SHA:** `42480e8ea6ce19791e9da5bbc000fa4b7dedb47e` (not QA branch HEAD; follow GitHub CI SHA separately)  
**Date:** 2026-11-03  
**Status:** COMPLETE — Real Store Hub & Browser Evidence Recorded

---

## 1. Phase 0 — Safe Context & Execution Environment

### 1.1 Operating Environment
- **Operating System:** Windows 11 (Microsoft Windows NT 10.0.26200.0)
- **Node.js:** v26.7.0 (meets `>=24` engine requirement)
- **npm:** 11.19.0
- **Playwright:** v1.64.1
- **Installed Playwright Browsers:**
  - Chromium (Chrome for Testing 156.0.8078.4 / headless shell v1248)
  - Firefox 157.0 (v1555)
  - WebKit 27.2 (v2370)
- **Native Devices / Emulators:** `adb` is **NOT** present in PATH; no physical Android or iOS device connected. Native Expo mobile tests involving real Wi-Fi radio, TalkBack/VoiceOver, and background kill/restart are marked **BLOCKED**.
- **External Database:** `psql` / PostgreSQL is **NOT** locally provisioned. Cloud tests with isolated PostgreSQL are marked **BLOCKED** locally unless run in CI.
- **Physical Printer / Cash Drawer:** No physical ESC/POS 80mm printer or RJ-11 cash drawer attached. Tests requiring physical paper inspection or cash drawer solenoid kick are marked **BLOCKED** for physical release; automated virtual TCP ESC/POS testing is executed.

### 1.2 Isolation & Safety Guards
- Authoritative local DB used for E2E: `store-data/e2e-disposable/bmc-e2e.sqlite` and temporary OS directories (`os.tmpdir()`), completely isolated from production or pilot stores (`store-data/bmc.sqlite`).
- Seeding strictly guarded by `E2E_ALLOW_SEED=YES`, `E2E_ISOLATED_DB_MARKER=BMC_E2E_DISPOSABLE`, loopback bind `127.0.0.1:4400`, and requirement for 4 distinct PINs `>=12` characters.
- No live SePay webhooks, real bank accounts, production cloud URLs, or customer PII are configured or connected.

---

## 2. Phase 1 — Mandatory Document Reading & Inventory

The reading order defined in `AGENTS.md` and `docs/qa/e2e-agent-pack/AGENT_PROMPT.md` was executed sequentially.

| Path | Purpose | Key Invariants & Rules | Status & Reconciliation Notes |
|---|---|---|---|
| `AGENTS.md` | Core engineering contract & guards | Integer VND only; backend calculates totals; 1 cashier owns drawer; no KDS/inventory; immutable ledger; single receipt batch (2 copies). | Active baseline. |
| `docs/spec/MVP-v1.2.md` | Business scope & user workflows | 1 store, 4-8 concurrent staff; Staff requests payment method (CASH/BANK/MOMO/MIXED); Cashier settles; 2 copies on same printer (CUSTOMER + STORE); no stock tracking. | Reconciled with implementation. |
| `docs/architecture/ARCHITECTURE.md` | High-level topology & authority | Store Hub owns local cash and committed orders; Cloud owns verified bank allocations and remote audit; WAL SQLite; monotonic outbox sync. | Current architecture. |
| `docs/contracts/API_CONTRACT.md` & `openapi.yaml` | API specifications & DTO schemas | Idempotency keys bound to SHA-256 payload hash; 409 on mismatch; cursor pagination (limit<=100); bank intent PENDING until verified HMAC. | Fully implemented in Store Hub. |
| `packages/contracts/src/index.ts` | Shared TypeScript contracts & HubClient | Strong types for `Order`, `PaymentReceipt`, `ReceiptCopy`, `Shift`, `Summary`; `money()` validator; `HubClient` with 12s timeout. | Clean, typecheck green. |
| `docs/plans/MASTER_PLAN.md` & `PARALLEL_EXECUTION.md` | Delivery roadmaps & milestone RACI | Defines M0 (feasibility), M1 (contracts), M2 (order slice), M3 (cash/receipts), M4 (bank/owner), M5 (resilience/E2E). | Milestones tracked. |
| `docs/plans/BACKEND_PLAN.md`, `WEB_PLAN.md`, `MOBILE_PLAN.md` | Lane execution plans | Backend Fastify adapter, Web Vite POS/Owner, RN Staff. | Implemented and aligned. |
| `docs/qa/ACCEPTANCE.md` | QA targets & release criteria | LAN order commit p95 <= 400ms; 8 clients concurrent >= 150 orders/h burst; zero duplicate cash capture; physical printer signed off by operator. | Benchmark targets used. |
| `docs/agents/AGENT_WORKFLOW.md` | Multi-agent protocol & audit rules | Read docs first; load project skills; never self-certify release without hardware proof. | Strictly followed. |
| `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md` & `SCREEN_SPECS.md` | UI specs & layout hierarchy | 320dp staff, 1024px POS, 320/390/768/1440 Owner; no horizontal scrollbar; large touch targets; clear payment statuses. | Verified in UI suites. |
| `docs/ui/DESIGN_SYSTEM.md` & `UI_QA_MATRIX.md` | Token definitions & responsive matrix | WCAG AA contrast; Be Vietnam Pro font bundled locally; safe area insets. | 104 mocked-HTTP UI tests passed in CI, with cross-engine smoke only. |
| `docs/ops/LOCAL_PILOT.md` & `CLOUD_SYNC_RUNBOOK.md` | Operations & disaster recovery | `VACUUM INTO` backups; sidecar SHA-256 manifest; spare-machine restore copy; RPO/RTO validation. | Tested in rehearsal tests. |

### 2.1 Project Skills Loaded
Per `AGENTS.md` and `docs/agents/AGENT_WORKFLOW.md`, the following project-local skills in `.agents/skills/` were consulted and loaded:
1. `contract-first` — API DTOs, OpenAPI synchronization, and typed client guarantees.
2. `database-postgres-sqlite` — SQLite WAL configuration, FK constraints, and atomic transactions.
3. `expo-react-native` — Staff RN architecture, SecureStore, and offline SQLite pending queue.
4. `financial-ledger` — VND integer math, cash drawer movements, shift variance, immutable payments.
5. `mobile-first-operational-ui` — 320dp safe area, tap targets, no viewport overflow, clear statuses.
6. `nest-backend` — Fastify adapter, dependency injection, validation pipes, and route guards.
7. `offline-lan` — Store Hub authority, monotonic outbox sync, and LAN isolation.
8. `payments-reconciliation` — VietQR/bank intent, signed HMAC webhook validation, and idempotency.
9. `performance-qa` — 8-client concurrent burst load, p50/p95/p99 measurement, and fault injection.
10. `printer-escpos` — Sequential two-copy spooling, UNKNOWN status handling, and audited reprint.
11. `security-review` — Role-based authorization, rate limiting, and device pairing token binding.
12. `ui-visual-audit` — Screen contrast, keyboard navigation, and WCAG accessibility compliance.
13. `vite-react-frontend` — React 19 / Vite POS & Owner dashboard architecture and proxy setup.

---

## 3. Phase 2 — Source Code & Architecture Audit

### 3.1 Traceability Matrix
The following matrix connects requirements, source implementations, actor authorization, test IDs, and concrete evidence:

| Req ID | Requirement Description | Source Endpoint / File | Role | State Transition | Test ID | Concrete Evidence |
|---|---|---|---|---|---|---|
| SEC-01 | Rate limit 5 invalid logins | `apps/store-hub/src/service.ts:login` | Any | Anonymous -> 429 TOO_MANY_ATTEMPTS | AUTH-01 | `tests/e2e/real-hub-api.test.mjs` |
| SEC-02 | Staff role barrier (no finance/shift) | `apps/store-hub/src/service.ts:actor` | STAFF | STAFF -> 403 FORBIDDEN | AUTH-02 | `tests/e2e/real-hub-api.test.mjs` |
| SEC-03 | Employee disable invalidates active sessions | `apps/store-hub/src/service.ts:setEmployeeActive` | OWNER | ACTIVE -> INACTIVE -> 401 | AUTH-03 | `tests/e2e/real-hub-api.test.mjs` |
| CAT-01 | Price update advances catalog version | `apps/store-hub/src/service.ts:updateProduct` | OWNER | Version N -> N+1 | CAT-01 | `tests/e2e/real-hub-api.test.mjs` |
| CAT-02 | Stale catalog version rejected | `apps/store-hub/src/service.ts:createOrder` | STAFF | Draft -> 409 CATALOG_CHANGED | CAT-02 | `tests/e2e/real-hub-api.test.mjs` |
| ORD-01 | Server-side total & unique display code | `apps/store-hub/src/service.ts:createOrder` | STAFF | Draft -> COMMITTED (UNPAID) | ORDER-01 | `tests/e2e/real-hub-api.test.mjs` |
| ORD-02 | Idempotency replay with same key & body | `apps/store-hub/src/service.ts:idem` | Any | Key match -> Same JSON response | ORDER-03 | `tests/e2e/real-hub-api.test.mjs` |
| ORD-03 | Idempotency payload mismatch conflict | `apps/store-hub/src/service.ts:idem` | Any | Changed body -> 409 CONFLICT | ORDER-04 | `tests/e2e/real-hub-api.test.mjs` |
| SHF-01 | Cashier opens single exclusive shift | `apps/store-hub/src/service.ts:openShift` | CASHIER | None -> OPEN (500k float) | SHIFT-01 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-01 | Exact cash tender & change calculation | `apps/store-hub/src/service.ts:cash` | CASHIER | UNPAID -> PAID, change recorded | CASH-01 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-02 | Insufficient cash tender rejected | `apps/store-hub/src/service.ts:cash` | CASHIER | Tender < Due -> 422 rejected | CASH-02 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-03 | Cash capture idempotency & double-settle guard | `apps/store-hub/src/service.ts:cash` | CASHIER | Paid -> 409 ORDER_SETTLED on new key | CASH-03 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-05 | Staff BANK intent paid with Cash records CASH | `apps/store-hub/src/service.ts:cash` | CASHIER | Requested BANK -> payments.method=CASH | CASH-05 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-06 | Cash refund exactly once with reason | `apps/store-hub/src/service.ts:refundCash` | CASHIER | PAID -> REFUNDED, drawer -VND | CASH-06 | `tests/e2e/real-hub-api.test.mjs` |
| CSH-07 | Void unpaid order excludes from checkout | `apps/store-hub/src/service.ts:voidOrder` | CASHIER | COMMITTED -> VOIDED | CASH-07 | `tests/e2e/real-hub-api.test.mjs` |
| BNK-01 | Bank intent remains UNPAID until webhook | `apps/store-hub/src/service.ts:bankIntent` | CASHIER | UNPAID -> PENDING bank intent | BANK-01 | `tests/e2e/real-hub-api.test.mjs` |
| BNK-02 | HMAC bridge webhook settles order to PAID | `apps/store-hub/src/service.ts:bankEvent` | BRIDGE | PENDING -> PAID (state=CONFIRMED) | BANK-02 | `tests/e2e/real-hub-api.test.mjs` |
| PRN-01 | Batch enqueues CUSTOMER & STORE copies | `apps/store-hub/src/service.ts:cash` | SYSTEM | Settle -> 2 WAITING_FOR_PRINTER copies | PRINT-01 | `tests/e2e/real-hub-api.test.mjs` |
| PRN-02 | Reprint guard on queued copies | `apps/store-hub/src/service.ts:reprint` | CASHIER | WAITING -> 409 RECEIPT_ALREADY_QUEUED | PRINT-02 | `tests/e2e/real-hub-api.test.mjs` |
| ANL-01 | Owner analytics reconcile integer ledger | `apps/store-hub/src/service.ts:todayOrderCounts` | OWNER | Query -> exact counts & cash ledger | ANALYTICS-01 | `tests/e2e/real-hub-api.test.mjs` |
| LOD-01 | 8 concurrent staff burst 150 orders | `apps/store-hub/dist/main.js` | STAFF | Concurrent HTTP -> 0 dropped/dup | LOAD-01 | `tests/e2e/concurrency-load.e2e.test.mjs` |
| POS-UI | Real browser cashier login, order, & cash | `apps/web-pos/src/main.tsx` | CASHIER | UI live queue -> tender -> PAID | UI-REAL-POS | `tests/e2e/web-real-hub.spec.ts` |
| OWN-UI | Real browser owner login & catalog view | `apps/web-owner/src/main.tsx` | OWNER | Login -> Dashboard -> Catalog | UI-REAL-OWN | `tests/e2e/web-real-hub.spec.ts` |

### 3.2 Mock-vs-Real Test Classification
1. **Mocked UI Tests (`tests/ui/*.spec.ts`):**
   - 104 Playwright specs running against Vite dev servers where HTTP calls to Store Hub are intercepted and mocked using `page.route()` or MSW.
   - Classification: **UI Component, Layout & Accessibility Tests** (proves responsive CSS, keyboard skip links, axe WCAG compliance, Be Vietnam Pro font offline loading). Does **NOT** prove backend database transactions or real process boundaries.
2. **Real Integration Tests (`tests/*.test.mjs`):**
   - 29 Node `--test` cases across the integration file list testing `StoreService`, `StoreDb`, `ReceiptPrinter`, and `CloudSyncWorker` against real SQLite WAL files on disk.
   - Classification: **Domain and In-Process Integration Tests**.
3. **Real Process E2E Tests (`tests/e2e/*.mjs` and `tests/e2e/*.spec.ts`):**
   - Starts Store Hub in an actual Node.js OS process listening on loopback TCP port.
   - Executes real HTTP requests over the network stack, tests genuine fastify routing, preHandler remote gateway filters, real SQLite commits, and Playwright browsers driving Web POS and Web Owner through Vite reverse proxies.
   - Classification: **Authoritative System End-to-End Tests**.

---

## 4. Defects Discovered & Remediated During Audit

### DEF-QA-01 (Severity: P1 — Test Harness Flaw on Windows)
- **Path:** `tests/store.test.mjs`, `tests/printer.test.mjs`, `tests/concurrency.test.mjs`, `tests/sync-backfill.test.mjs`, `tests/order-ack.test.mjs`, `tests/operational-status.test.mjs`, `tests/remote-gateway.test.mjs`, `tests/idempotency-binding.test.mjs`, `tests/cashier-queue.test.mjs`, `tests/owner-analytics-hub.test.mjs`.
- **Symptom:** `Error: EPERM, Permission denied: rmSync(...)` during test teardown.
- **Root Cause:** On Windows (NTFS), active SQLite file handles held open by `node:sqlite` `DatabaseSync` prevent directory unlinking. The tests instantiated `StoreService` inside `try { ... }` blocks and called `rmSync(dir, { recursive: true, force: true })` in `finally` without closing the database handles.
- **Remediation:** Explicitly declared `StoreService` instances in outer scope and invoked `inst?.store?.db?.close()` in `finally` blocks prior to `rmSync`.
- **Verification:** All 29 integration tests now pass on Windows in 7.8s with 0 errors.

### DEF-DEV-01 (Severity: P1 — Environment / Tooling Incompatibility)
- **Path:** `apps/store-hub/package.json` (`"dev": "tsx watch src/main.ts"`).
- **Symptom:** `TypeError: Cannot read properties of undefined (reading 'login')` in `StoreController`.
- **Root Cause:** `tsx` uses esbuild, which strips TypeScript `design:paramtypes` decorator metadata by default. When NestJS resolves `StoreController(private readonly s: StoreService)`, constructor injection fails and `this.s` is `undefined`.
- **Remediation:** Configured E2E Playwright webServer to execute `node apps/store-hub/dist/main.js` (compiled via `tsc`, which preserves decorator metadata).
- **Recommendation for BE lane:** Add esbuild plugin or `tsc --watch` for dev server to ensure `npm run dev:hub` preserves decorator metadata.



---

## 5. Independent audit correction (2026-11-03)

Read the companion `docs/qa/E2E_RUN_REPORT.md §9` before treating any metric as evidence. GitHub PR #77 baseline CI on QA HEAD `7145f726bdd7e62d5ef520b11c915adc0c893818` reported successful quality gates (different GitHub Actions PR merge ref) and **158 test runner cases** across domain, bundle, integration, HTTP perf, mocked browser, real-Hub API/burst and Chromium browser E2E; 36 docs are required planning files, not unit tests. `docs/qa/E2E_CASES.md` contains **42 scenario IDs**, not 37. Since that run, isolated QA harness and documentation were edited again; rerun on the newest PR head is required before new PASS claims.

Critical boundary clarifications:
- `tests/e2e/web-real-hub.spec.ts` proves a successful Chromium cashier transaction and Owner catalog navigation, **not** all browser crash/ACK-loss, 401/500/timeout, 100k-history or Firefox/WebKit real-Hub scenarios.
- Virtual TCP printer does not prove actual paper/cutter. Hardware-specific cash drawer kick is absent in the inspected `apps/store-hub/src/printer.ts` and a documented `scripts/test-printer-hardware.mjs` path is missing; mark this as implementation gap + field blocker rather than hardware-only gate.
- Bank QR and SePay integration have code in `apps/cloud-api/src/sepay.ts` with isolated PG simulated webhook tests. They do not establish that a merchant bank transfer was completed. Avoid mixing Store Hub's `BANK_CODE/BANK_ACCOUNT_NUMBER/BANK_BRIDGE_SECRET` with SePay Cloud's `SEPAY_*` variables.
- `scripts/check-docs.mjs` is a planning-file presence/keyword checker; it does not prove full OpenAPI-schema-to-code equivalence.
- Performance measured on Linux CI loopback is informational and distinct from the 8-phone Windows LAN SLO; `LOAD-02` 100,000 orders is not yet measured in this QA pack.
- Six blocking field categories remain NO-GO for commercial deployment, including physical printer, cash drawer, native phones, provider merchant, staged Cloud/WAN and Windows Ops restore.
