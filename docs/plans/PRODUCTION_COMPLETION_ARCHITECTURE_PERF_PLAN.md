# Bánh Mì Chợ POS — Production Completion, Architecture, UI/UX & Performance Execution Plan

**State:** PROPOSED; source audit, not implementation or production sign-off.
**Baseline:** `main@a4250f5b6b4033fcf892496a0cb3222873b2cbeb`, 2026-10-11.
**Priority order:** Approved `docs/spec/MVP-v1.2.md` > ADR-001/002 > API contracts > implementation plans > UI refinements. Do not silently change an accepted business rule.
**Business shape:** one store, 4–8 Staff phones, one cashier, one cash drawer, one 80mm thermal printer printing CUSTOMER + STORE copies, 300+ orders/day.

## 1. Executive decision and strict scope

**Decision:** The code is generally aligned with the business. Do not rewrite everything. The largest gaps are stale plans/contracts, missing pre-payment order edit, item-sales reporting, frontend/backend monoliths, unmeasured load/performance, real network/hardware/merchant verification and Production operations.

**Must retain:**
- Store Hub commits orders, CASH, shifts and print intents in durable local SQLite; Cloud may settle BANK only using provider-verified evidence.
- Staff's requested payment method is not payment capture. Neither QR creation nor customer screenshot may mark PAID.
- VND as validated safe integers, server-computed price totals, immutable committed order line snapshots, idempotent command keys, append-only cash/refund and receipt audit.
- WAN down / LAN still up: local orders and CASH continue; BANK remains pending until verified. UNKNOWN ACK/print state must be reconciled.
- One 80mm printer, two original copy intents after full capture; socket SEND is not proof physical paper emerged.
- Do **not** add inventory counts, KDS, kitchen printer, prep stages, delivery fulfillment, customer CRM, unsupported profits, multi-branch or speculative extra features. MoMo merchant/MIXED are opt-in after a separate money-contract approval.

## 2. Audit inventory and confidence

Inspected Git tree (180 entries); all 13 local Agent Skills; `AGENTS.md`, architecture/spec/ADRs, Master/Backend/Web/Mobile/Parallel plans, API Contract/OpenAPI, UI specs/design system/QA, ops runbooks, code topology, critical paths in 5 apps, test suite names and CI workflows.

**Evidence distinction:** `CODED` = source exists; `AUTO_TESTED` = matching CI/unit/integration source exists and prior main runs passed; `HARDWARE_BLOCKED` = no real Windows/phone/printer evidence; `PROVIDER_BLOCKED` = no eligible verified merchant live evidence; `NOT_IMPLEMENTED` = missing source-level feature. A CI-green repo cannot be labeled production-ready from code inspection.

## 3. Contract-to-code drift matrix

| ID | Requirement / agent requirement | Actual repository observation | Disposition |
|---|---|---|---|
| D-01 | Up-to-date milestones | `MASTER_PLAN.md` tables still say NOT STARTED, README says planned, Cloud runbook says remote create still local despite merged PR #30, `SCREEN_SPECS` says planned | P0: status rebaseline; correct stale prose and preserve historical acceptance gates |
| D-02 | Canonical generated API client | `packages/contracts/src/index.ts` is handwritten `HubClient` and interfaces; OpenAPI 3.1 remains draft, misses some Cloud command routes | P0: update OpenAPI, generated types+client, boundary validation, consumer parity CI |
| D-03 | Domain-specific Nest modules | Store Hub `service.ts` ~37 KB; Cloud `service.ts` ~16 KB, single large controllers | P1: incremental extraction using characterization tests, not a money rewrite |
| D-04 | Modular frontend + query layer | Staff `App.tsx` ~21 KB; POS and Owner each ~22–25 KB main; Web manual `setInterval` | P1: screen/features/hooks/services; controlled TanStack Query reads, explicit idempotent writes |
| D-05 | Shared domain/UI/config | `packages/domain`, `packages/ui`, `packages/config` currently placeholders | P1: pure money/state logic + semantic tokens + tooling (web/native separate primitives) |
| D-06 | Approved stack governance | ADR-001 specifies pnpm, Expo Router, React Router, lint/Vitest; current repo uses npm workspaces, no router, no visible lint/coverage gate | P1: choose and document one actual approach; avoid migration solely for plan compliance |
| D-07 | Edit order before paying | Spec §1.3 requires customers changing items; Store Hub has create/read/void, no PATCH edit route | **P0 NOT IMPLEMENTED**, task F-01 |
| D-08 | Sold-item aggregates | ACC-11 expects per-item count for 300+ daily orders; dashboard does not expose item sales | P1 NOT IMPLEMENTED, F-02 |
| D-09 | Safe actual payment method change | CASH/BANK actual settlement allowed; exact override audit on mismatch with initial requested method not explicit | P1 contract/owner policy check, F-03 |
| D-10 | Physical drawer/cutter/print acceptance | ESC/POS TCP, Unicode raster, two copy spool and UNKNOWN are coded; physical 80mm and drawer kick not verified | P0 HW gate, F-04 |
| D-11 | Bank merchant | HMAC SePay/raw callback/signed Hub inbox/QR code exist; account eligibility and real callback/settlement not signed off | P0 PROVIDER gate, F-05 |
| D-12 | E-invoicing when required | No verified provider adapter or accountant sign-off | P0 LEGAL gate conditional on verified obligation, F-06 |
| D-13 | Real mobile/UX/a11y evidence | UI Playwright Chromium+mock, no native phone E2E, no axe/visual baseline; muted Owner colors under WCAG AA 4.5:1 | P0 a11y/actual device gate, UI-01 |
| D-14 | Live, performant queue | POS full orders snapshot every 2.5 s; DOM `.map`; uncapped pending (correct for no-loss) + 200 paid; no incremental feed | P0 benchmark & measured optimization, PERF-02 |
| D-15 | Concurrent 8 clients and 150/hour | `tests/concurrency.test.mjs` loops 150 synchronous service creates, **not real concurrent HTTP over Wi-Fi** | P0 real load harness PERF-01 |
| D-16 | Real ops and restore | SQLite backup+restore-copy tests exist; encryption/off-host rotation/Windows autostart/real spare restore not evidenced | P0 OPS gates |
| D-17 | Secret/security release posture | Auth/role/pair/revoke/HMAC present; production pen test, key rotation, permission/migration gates not evidenced; repo public | P0 security gate |
| D-18 | Honest Cloud capability | Cloud `GET /health` returns `cloud_owner_mode:'read_only'`, but signed remote product CREATE/UPDATE is coded | P1 correct capability/status and docs |
| D-19 | DB perf | Store Hub uses Node `DatabaseSync`; eight-client true p95 and event-loop lag not measured | P0 measure; worker-thread only if bottleneck proven |

### Status by product area

- **Staff React Native:** Login/device pairing, catalog, cart, note, CASH/BANK intention, ACK/recovery and recent orders are coded; native LAN TLS/keyboard/200% font not device-approved. MoMo/MIXED correctly disabled until flag/provider.
- **Cashier POS:** Order queue, CASH tender/change, bank pending+QR, printer UNKNOWN, shifts/refunds are coded; pre-payment line edit missing. Real drawer/printer incomplete.
- **Owner:** Local employee/device operations, Cloud remote create/update catalog, dashboard, history and exceptions coded; item-sales aggregate/export missing, remote employees intentionally restricted.
- **Hub/Cloud:** Durable SQLite outbox, HMAC signed Cloud sync, SePay handling, monotonic projections and PostgreSQL command queue coded; real deployment, gap reconciliation under restore and merchant verification need acceptance.
- **CI:** Type/build, SQLite/Postgres integration, browser Chromium mocks and Expo JS bundle; no real device performance/security audit proof.

## 4. Missing-function implementation (business first)

### F-01 — Order edit BEFORE payment — P0 / size L

**Backend:** Introduce `PATCH /v1/orders/{id}` with `Idempotency-Key`, `expected_order_version`, `catalog_version`, items/notes and required reason. Only COMMITTED+UNPAID with no captured payment legs, no unresolved bank capture or terminal void/refund. Hub reads current catalog, recomputes integer totals, stores new line snapshots, increments order version, audit+outbox atomically. Reject client-supplied total. Resolve active bank QR safely: expire/supersede reference before change or block edit until bank reconciliation; never reuse old amount/reference after edit. Document invalidation rule in ADR if decision needed.

**Frontend:** Cashier sees `Sửa đơn` before collection and preview old/new due, safe price-conflict modal. Staff cannot silently mutate another staff member's committed order. A cashier edit must not remove any confirmed bank/cash transaction.

**Tests/exit:** duplicate key replay, stale version 409, edit+cash capture race, bank callback after original QR, wrong totals, price updated after original order, note escaping, VOID/refund guard. No lost capture or historical price rewrite.

### F-02 — Owner item sales/reporting — P1 / size M

Aggregate **paid** order-line quantities and net effects of full refunds per item/category and local-shop date range. Decide and document gross/net/refund mapping; never infer profit, inventory or sold units from unsettled carts. Indexed SQL summary/aggregation with 100k-history seed and EXPLAIN; proper timezone and currency. Owner mobile cards/desktop table, server pagination and CSV with formula-injection-safe output; Cloud freshness label. Exit: item totals + confirmed cash/bank reconciliation with 300+ daily orders and historical price-change fixtures.

### F-03 — Payment operations and exception UX — P0/P1 / size M

Confirm full requirements for actual method override and audit on **captured method differing from Staff intent**, not UI toggles. Provide exception triage status/reason and documented manual escalation; no Owner override that forges BANK PAID. Validate cash refund/reversal and POS close shift conflict under delayed bank settlement. Any bank refund/partial/mixed payment feature requires its own append-only allocations and provider contract, not an unreviewed toggle. Test under/overpayment, double webhook, cash-vs-bank race, after-shift-close and blocked partial receipt.

### F-04 — One printer + drawer physical integration — P0 / external hardware / size L

Select actual ESC/POS 80mm cutter and RJ11 drawer. Add model-specific authorized drawer pulse only for policy-approved CASH flow, not BANK/print replay. Test two distinct copy headings, proper Vietnamese diacritics, long notes, cutting and paper-out after copy #1. UNKNOWN copy requires explicit inspect/reprint watermark, never another settlement. Ship physical photo/log/test matrix, cashier sign-off.

### F-05 — Verified SePay and bank go-live — P0 / merchant dependency / size L

Bank/account eligibility, HMAC webhook provider sandbox, supported transfer direction/currency/account, unique reference, exact integer amount, replay, late/duplicate/missing/out-of-order callback, webhook-before-local-intent, bank-vs-cash race and suspense/exception procedure. Separate staging/prod secrets. Do one controlled low-value transaction with authorized merchant after sandbox success. No screenshot as proof; do not disclose credentials to GitHub. Do not call bank provider VERIFIED until merchant evidence and operator sign-off.

### F-06 — Legal invoice decision / adapter — P0 legal conditional / size M–L

Owner/accountant must determine applicable e-invoice requirements for the actual legal entity, choose provider and process. If applicable, build signed provider issuance queue after actual settlement, issue/reissue/cancel/error identifiers, immutable invoice audit, duplicate-safe retries and reconciliation; test provider sandbox. Thermal receipt is not automatically legal e-invoice. If legally not required, record accountant-backed decision; do not invent a mandate.

### F-07 — Remote Owner UX improvements — P1 / size S–M

Existing Cloud command CREATE/UPDATE is coded; do not redo. Display clear PENDING/APPLIED/CONFLICT + last-sync age; safe retry with stable idempotency key across browser reload; refresh resolved conflict. Keep device pairing/PIN management local until a separate security ADR authorizes cloud writes. Update Cloud health to reflect genuine capability.

**Optional, not in P0 backlog:** MoMo merchant provider and MIXED/partial rail until explicitly enabled, product sold-out manual toggle already covered by `is_active`, cost/profit, inventory, kitchen, delivery, loyalty and multi-store all outside accepted scope.

## 5. Architecture target: a strangler refactor, not big-bang rewrite

    apps/store-hub/src/
      app.module.ts
      modules/auth/ devices/ catalog/ orders/ payments/ cash-shifts/ receipts/ sync/
        controller.ts service.ts repository.ts dto.ts
      infrastructure/sqlite/ printer/ security/
    apps/cloud-api/src/
      modules/owner/ provider-sepay/ reconciliation/ sync/ product-commands/
      infrastructure/postgres/ security/
    apps/web-pos/src/
      app/ features/orders/ checkout/ bank-qr/ receipts/ cash-shifts/
      shared/components/ api/ hooks/ tokens/
    apps/web-owner/src/
      app/ features/dashboard/ orders/ catalog/ employees/ reconciliation/
      shared/components/ api/
    apps/mobile-staff/src/
      app/ features/auth/ catalog/ cart/ review/ recovery/ history/
      data/pending-orders/ ui/components/
    packages/contracts/  # Canonical API schema + generated TS consumers
    packages/domain/     # Pure VND, validation and state-machine logic
    packages/ui/         # Web-only primitives and semantic design tokens
    packages/config/     # TS, lint, formatting presets
    tests/contract/ integration/ ui/ native/ perf/ security/

**ARCH-01 P0: contract freeze/codegen.** Catalog every implemented Hub/Cloud endpoint, add runtime DTO validation and standard error-code registry to canonical OpenAPI, generate typed TS client (avoid copying unknown DTO by hand), maintain backwards compatibility and idempotency. CI verifies declared routes, actual response fixtures and generated artifacts. Agree on a **single** package manager: current npm vs pnpm ADR discrepancy must be resolved with an ADR and reproducible lockfile test, not arbitrary churn.

**ARCH-02 P1: backend modules.** Characterization tests before extraction; isolate pure money rules and repositories, keep one SQLite transaction writer authority, transaction+idempotency+outbox+audit in same commit. Extract one module per PR (catalog, orders, shift, receipt, payment, auth, sync). Leave a compatibility facade temporarily. Version PostgreSQL migrations and test upgrades from prior schema, never just empty DB.

**ARCH-03 P1: Web FE modules.** Separate route and feature component from order/payment command controller. Use TanStack Query for server **reads** with query keys/staleness rules and single-flight refetch; mutation automatic retry disabled or explicitly constrained by stable original idempotency key. Split POS OrderQueue/Checkout/BankPending/ReceiptStatus/ShiftLedger, Owner Dashboard/Catalog/Employees/Reports. Avoid lazy-loading vital POS checkout; consider lazy Owner pages after bundle profiling.

**ARCH-04 P1: Native modules.** Extract Login/Pairing, Menu/Stepper, Cart/Review, Confirmed, Recovery and History. Keep durable Expo SQLite pending mutation outside transient form/query state, stable key/actor/body. Existing FlatList is appropriate; keep/measure memoization. Introduce routing library only when materially useful, not solely to match ADR wording.

**ARCH-05 P1: shared UI/config.** Implement semantically named colors/type/spacing, accessible Dialog/Input/Status/Currency for Web; native equivalent components with matching semantics but distinct implementations. Add ESLint/Prettier, TypeScript strict no-any budget, Vitest/Testing Library/MSW or equivalent; CI gates formatting/contract/test. Do not introduce a large new UI framework without benefit.

## 6. Performance plan — baseline, bottleneck, optimize, compare

**PERF-00 P0 / size M:** create repeatable benchmark script and machine-readable report with SHA, Node/SQLite/Postgres, Windows/phone model, Wi-Fi, dataset, warm/cold, error rate, request sizes, p50/p95/p99, CPU/RAM, event-loop lag, DOM render duration, printer/Cloud outbox backlog. Attach redacted traces. No fabricated faster-by percentages.

**Target budgets already in acceptance docs (not measured):**
- LAN commit P95 ≤ 400ms, P99 ≤ 1s under 8 real devices.
- POS feedback ≤ 150ms; cashier 100k-history indexed search P95 ≤ 300ms.
- Staff cached menu P95 < 2s and qty tap visible <100ms, usual one-item order ≤15s.
- Verified bank provider callback received → live Hub UI P95 ≤3s on healthy WAN (provider delay excluded).
- Backup RPO ≤15 min and RTO ≤2 hours are targets pending actual exercise.

**PERF-01 P0 / size L: REAL concurrent HTTP.** Existing `tests/concurrency.test.mjs` is sequential service calls. Run 8 logged-in HTTP clients in parallel (k6/Artillery/undici), 150 orders/hour with human think-time/jitter, 10× burst, retries with same keys, and 300+ daily seed plus 100k historical + 100/1000 pending. Exercise shift/cash, cloud offline, printer paper-out, lost ACK, 30-minute WAN outage, checkpoint and restore while operational. No lost or duplicate money events allowed regardless of p95.

**PERF-02 P0/P1 / size M–L: queue.** Current cashier polls `GET /v1/orders` each 2.5s, plus shift and operational status, renders tiles with `list.map`. First implement single-flight requests, abort/generation safety against stale responses, keep last-good snapshot + STALE banner, avoid list/selection jumps and only update changed entities. Measure payload/render on 300 and pathological pending cases. If target fails, implement signed/local authenticated ordered SSE or WebSocket delta feed with snapshot-on-reconnect and cursor reconciliation; never rely on ephemeral stream for financial correctness. Virtualize/memoize many DOM rows only when profiler shows benefit. Pending queue must NEVER hide an old unpaid order.

**PERF-03 P1 / size M: RN.** Profile Hermes JS/UI FPS, login keyboard, search/qty latency, FlatList callback/re-render, long names, 200% text, low-end phone and cold start. Tune `FlatList` `renderItem`/batch/window only from measurement; note trade-off between memory and blank areas. Keep offline/ACK recovery database stable.

**PERF-04 P1 / size M–L: SQLite/Cloud.** `DatabaseSync` blocks the Node caller; instrument event-loop lag/SQLite transactions, WAL size/checkpoint, busy timeout, 100k-history EXPLAIN, Cloud query plans/pool, outbox age and bank exceptions. Only move DB into one writer worker thread if measured latency proves necessary. SQLite WAL supports concurrent readers but only one writer; never sacrifice financial durability for a microbenchmark. Monitor print UNKNOWN and unprocessed provider events.

**PERF-05 P1 / size S: Web bundles.** Record JS/CSS gzip, route-to-interactive, Web Vitals INP, long tasks, font offline fallback; chunk Owner charts/routes if heavy. Do not drag dashboard charts into POS critical path; no arbitrary bundle threshold until same-hardware baseline exists.

## 7. UI/UX and accessibility acceptance

**UI-01 P0 / size M:** Contrast WCAG AA ≥4.5:1 normal text; current Owner metadata/nav color combinations need checking. Touch ≥44dp RN and ≥48 CSS px critical cashier actions; 320dp keyboard-safe login/notes, 200% text, long Vietnamese item name and money, logical web tab order, `role=dialog` focus trap/return/Escape, errors associated with inputs, pending BANK/print UNKNOWN explicit. Font/network dependency must not block CASH while WAN down.

**UI-02 P1 / size M:** Screenshot fixtures at Staff 320×568 / 390×844, POS 1024×768 & 1366×768 with 125% scaling, Owner 320/390/768/1366; Playwright axe + visual diff and real Android TalkBack/iOS VoiceOver if applicable. User research with 2–3 staff: routine 1–2-item order, quantity correction, method change, lost ACK, cashier change, bank pending and paper-out. Report observed taps/time/error and accessibility limitations, not subjective “beautiful” only.

## 8. Security, deployment and operational completion

**OPS-01 P0 / size L:** reproducible pinned toolchain/lockfile, Windows POS Hub auto-start + supervision + kiosk, private bind & firewall, TLS cert/trust onboarding native, paired devices and revocation; Cloud HTTPS/domain/Postgres migrations, environment separation, health/readiness and rollback. No insecure dev LAN for customer data.

**OPS-02 P0 / size L:** extend existing safe `VACUUM INTO` + verify + restore-copy tool with encrypted off-host rotation, file ACL, alerts and restore manifest. Rehearse on spare Windows hardware: stop services; forensic copy `.sqlite`, `-wal`, `-shm`; restore separate path, reconcile accepted transactions and Cloud source sequence before cutover. Measure RPO/RTO, never overwrite live financial SQLite or reset sync lineage blindly.

**OPS-03 P0 / size M–L:** threat model device pairing, role bypass, token/PIN brute force, provider raw webhook forgery, replay, note/CSV injection, cash/remote owner privilege, cross-store ID, disk-full/denial-of-service. Dependency/secret scanning, redaction, rotation, least privilege, repo public visibility review, branch protection, review financial code owners.

**OPS-04 P0 external:** merchant controlled-bank test; actual printer+RJ11; 30-minute WAN-down eight-device drill; actual accountant invoice decision; cashier counted cash variance; dual-run and signed owner GO decision. A CI PASS is not hardware or legal approval.

## 9. PR-by-PR execution order and dependencies

| Wave | Ticket (one narrow PR unless marked) | Requires | Agent lane | Size | Acceptance |
|---|---|---|---|---|---|
| W0 | BASE-01: traceability matrix + truthful README/Master/OpenAPI status | none | Architect | S | CODED vs VERIFIED vs BLOCKED accurate |
| W0 | PERF-BASE-01: HTTP concurrency harness and baseline artifacts | none | QA/Perf | M | 8 parallel HTTP, p50/p95/p99, no false proof |
| W0 | SEC-BASE-01: threat model, credential/deployment environment | none | Security/Ops | M | no P0 auth/financial holes |
| W1 | CONTRACT-01: canonical schema, codegen, runtime types, CI parity | BASE-01 | Contract/BE+FE | L | current endpoints/DTO compatible |
| W1 | ORDER-EDIT-01: Hub versioned order edit + bank stale-reference rule | CONTRACT-01 | Backend | M | edit/capture race, webhook, replay green |
| W1 | ORDER-EDIT-02: Cashier editing screen | ORDER-EDIT-01 | Web FE | M | 1024px money UX no false PAID |
| W1 | OWNER-SALES-01: sold-item aggregates, refund policy, export | CONTRACT-01 | Backend+Owner | M | 300/day and 100k-history parity |
| W1 | UI-ACCESS-01: accessibility P0 fixes | BASE-01 | Web/RN UI | M | axe/keyboard/native evidence |
| W2 | ARCH-BE-01: pure domain and transaction facade | CONTRACT-01 | Backend | L | money golden fixtures unchanged |
| W2 | ARCH-BE-02/03: separate catalog/order/shift, then payment/receipt/sync | ARCH-BE-01 | Backend | XL split | role, idempotency and DB parity |
| W2 | ARCH-WEB-01: POS component/state split + read query caching | CONTRACT-01 | Web FE | L | uncertain cash still safe |
| W2 | ARCH-WEB-02: Owner modularization / semantic tokens | CONTRACT-01 | Web FE | L | remote command retry safe |
| W2 | ARCH-RN-01: Staff screen/data modules | CONTRACT-01 | RN | L | recovery row not overwritten |
| W2 | PERF-QUEUE-01: safe polling then incremental feed if measured | PERF-BASE-01 | Backend+FE | L | no missing unpaid, measured better |
| W2 | PERF-DB-01: EXPLAIN, WAL, event-loop tuning | PERF-BASE-01 | DB/QA | M | same-dataset p95/p99 |
| W2 | TOOL-01: package manager ADR, lint/test/coverage/axe | BASE-01 | Tooling | M | deterministic CI |
| W3 | OPS-DEPLOY-01: staging Windows + Cloud and rollback | SEC-BASE-01 | Ops | L | verified restart/health |
| W3 | OPS-BACKUP-01: off-host encrypted restore rehearsal | OPS-DEPLOY-01 | Ops | L | reconciled spare-machine recovery |
| W3 | PRINT-DRAWER-01: physical print/cutter/RJ11 | Hardware D-02 | Hardware/BE/QA | L | 2 copies and UNKNOWN proof |
| W3 | BANK-MERCHANT-01: SePay eligible merchant, exception SOP | Merchant D-01 | BE/QA/Owner | L | controlled signed transfer |
| W3 | E-INVOICE-01: accountant requirement/provider (conditional adapter) | Business D-05 | Biz/BE | M–L | documented legal sign-off |
| W4 | UAT-01: 8 native devices, complete real shift, WAN/print/fault | All P0 W1–W3 | QA/Staff/Cashier | L | evidence and business acceptance |
| W4 | RELEASE-01: dual-run/pilot, rollback & Production decision | UAT-01 | Release owner | M | explicit GO/no-go |

Sizes S/M/L/XL are relative technical scope, **not time guarantees**. W0 tasks can run in parallel; hardware/provider/legal decisions begin immediately rather than waiting for refactoring. Avoid two agents editing the same giant file concurrently.

## 10. Agent skill routing and lean workflow

Read only skills relevant to each ticket, not all 13 every time:
- Contract: `contract-first`, `nest-backend`, `security-review` where applicable.
- Money/order/refund: `financial-ledger`, `database-postgres-sqlite`, `nest-backend`.
- Offline Cloud: `offline-lan`, `database-postgres-sqlite`, `security-review`.
- BANK: `payments-reconciliation`, `financial-ledger`, `security-review`.
- Printer/drawer: `printer-escpos`, `financial-ledger`.
- Expo: `expo-react-native`, `mobile-first-operational-ui`, `contract-first`.
- Vite: `vite-react-frontend`, `mobile-first-operational-ui`, `contract-first`.
- Visual review: `ui-visual-audit` + affected platform skill.
- Performance: `performance-qa` + affected platform/database skill.

**Recommended fast delivery protocol:**
1. Intake one bounded slice → inspect touched source/current contract and load only matching skills.
2. Reproduce bug/write golden negative test, update contract when needed, implement minimal change.
3. Run affected targeted tests and one relevant CI set; P0 financial/auth changes get **one independent changed-source audit**. No broad repeated audit of unrelated unchanged modules.
4. BLOCKER/HIGH money fraud, false PAID, missing order, replay/durability, unauthorized action, corrupt restore stops merge; MEDIUM cosmetic non-critical debt can become tracked follow-up without blocking unrelated implementation.
5. PR template: spec/ADR references, touched API/source, exact tests run/results, evidence artifact, provider/device blockers, rollback/migration and skill list. Never claim p95, screenshots, phone or bank verified when unmeasured.

## 11. Production GO gates (zero averaging)

1. Eight real Staff devices + one cashier place and capture orders over trusted LAN within documented performance thresholds; no duplicate/lost accepted orders.
2. CASH shift ledger, tender/change, refunds and closing counts reconcile under outage, restart and printer failure.
3. BANK merchant/account/webhook verified with controlled transfers and pending/exception procedures **or** owner explicitly approves a staged CASH-only scope change with no BANK promise; banking laws/requirements still met.
4. Actual printer prints both CUSTOMER+STORE, paper/cut/UNKNOWN/reprint tested; RJ11 drawer behavior confirmed.
5. Native pairing/TLS/revoke and UI font scaling/keyboard/a11y pass on the real model inventory.
6. Production Windows/Cloud deploy, secrets, backup encryption/off-host retention and supervised spare restore prove measured RPO/RTO; no high-severity security findings.
7. Accountant/owner approve invoice obligations and solution. Staff, cashier and owner sign UAT plus fallback runbook; rollout has rollback owner.
8. All remaining P0 items are closed with actual proof or a formal scope-reduction ADR — never via optimistic CI status.

## 12. Open decisions before activation

`D-01` bank/account/provider; `D-02` exact POS+printer+drawer; `D-03` Android/iOS and TLS trust; `D-04` actual payment/handoff behavior (no kitchen task); `D-05` accountant/e-invoice; `D-06` optional MoMo/MIXED; `D-07` spare hardware and UPS; `D-08` true baseline.

**Start immediately:** BASE-01 + PERF-BASE-01 + SEC-BASE-01 in parallel. After CONTRACT-01, implement ORDER-EDIT-01/02 and UI-ACCESS-01; launch hardware/bank/legal preparation alongside code. Commit follow-up architecture refactors only with verified safety parity.

## 13. External reference guidance (does not supersede business spec)

- React effects/race: https://react.dev/learn/you-might-not-need-an-effect
- TanStack Query defaults and retry/stale rules: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- React Native FlatList responsiveness: https://reactnative.dev/docs/optimizing-flatlist-configuration
- SQLite WAL one writer/checkpoint: https://www.sqlite.org/wal.html
- INP: https://web.dev/articles/optimize-inp
