# MASTER IMPLEMENTATION PLAN — Bánh Mì Chợ POS

**Planning baseline:** spec v1.2, approved 2026-10-10. **Status: PILOT CODE IN MAIN — NOT PRODUCTION READY.** PR #2 merged initial typed API/client, NestJS Store Hub, React Native Staff, Vite POS + Owner, SQLite money ledger and receipt spool driver. No release milestones CLOSED.

**2026-10-11 progress note:** M1 contracts partially implemented (typed shared SDK + expanded OpenAPI, full generated SDK/runtime schema hardening pending); M2 local order path implemented with integration tests; M3 cash/shift and two receipt intents implemented and tested in CI, physical printer acceptance pending; M4 bank adapter + cloud remote dashboard/sync NOT IMPLEMENTED; M5 device pairing/TLS, real 8-phone performance, crash/restore NOT VERIFIED; M6 pilot rollout NOT STARTED. Refer to Issues [#3](https://github.com/vitoo16/banh-mi-cho-pos/issues/3), [#4](https://github.com/vitoo16/banh-mi-cho-pos/issues/4), [#5](https://github.com/vitoo16/banh-mi-cho-pos/issues/5) and `docs/ops/LOCAL_PILOT.md`. Existing milestone rows below are **original exit requirements**, not claims of closure.

## Outcome
A single cashier can record exact cash tender/change, reliably reconcile shift cash, confirm bank payments, print exactly *two intended receipt copies*, while 4–8 RN staff clients rapidly enter orders over local Wi-Fi; owner can configure catalog and monitor confirmed amounts, with freshness indicators.

## Team / tracks
- Architecture & contract owner (Astra-style reviewer): independent API schema, money invariants, architecture and source audits.
- Backend/domain (Sol lane BE): Store Hub, Cloud API, DB, ledger, payment integration, print interface.
- Web lane (Sol lane FE-W): Vite POS web and Owner dashboard.
- Mobile lane (Sol lane FE-M): Expo React Native staff app.
- QA/security lane: test automation, acceptance evidence, fault injection, performance, runbook.
- Release gate owner: business stakeholder approves workflow and shift reconciliation on actual hardware.

## Milestones

| Milestone | Scope | Entry dependency | Exit evidence | State |
|---|---|---|---|---|
| M0 — POC & evidence | Real LAN Expo builds, 80mm two-copy print, RJ drawer, SQLite crash/restart, bank provider sandbox feasibility | Spec v1.2 | POC matrix + photos/logs + hardware compatibility + unresolved blockers | NOT STARTED |
| M1 — Contract + domain core | Domain status enums, ledger invariants, API OpenAPI, typed clients, shared fixtures, migrations, ADRs | M0 viability and architecture review | Contract review; golden fixtures passing for both BE and FE mocks | NOT STARTED |
| M2 — Order vertical slice | Owner catalog -> RN order -> local hub -> POS order queue | M1 frozen schemas | 8 clients concurrent, snapshots, no duplicate on retry, no kitchen workflow | NOT STARTED |
| M3 — Cash + receipts | Cash shift opening, cash tender/change, ledger, receipt queue 2 copies, reprint/UNKNOWN | M2 | Full cash sale to 2 receipts; close-shift math and print failure cases pass | NOT STARTED |
| M4 — Bank & Owner | QR intent, verified webhook, exception queue, sync, Owner dashboard + RBAC | M2, M3 financial contract | Bank sandbox replay/mismatch/latency tests; stale/offline indicator | NOT STARTED |
| M5 — Offline, E2E, security | LAN outage mode, crash/restart, restore, rate limits, auth, recon, automation | M3+M4 | Full acceptance and restore logs; no critical findings | NOT STARTED |
| M6 — Pilot & rollout | Shadow/dual-run with old method then staged cutover and operator training | M5, legal/invoice decision | Owner sign-off of shift cash variance, prints, missed payment count, fallback drills | NOT STARTED |
| M7 — After MVP | Cost/recipe/expenses for actual profits, MoMo merchant, mixed payment if enabled | M6 | Separate scope/contract/revenue accounting gates | OUT OF SCOPE |

**Never infer timelines from this table** — depend on bank access, hardware and staff availability. Owner/bank decision D-01, hardware D-02, e-invoice D-05 are outstanding.

## Detailed milestones/task dependencies (RACI-like)

### M0 — platform feasibility, BEFORE parallel implementation
- `POC-01` Architect/QA: test Node LTS, Vite Windows POS kiosk; startup after Windows reboot, LAN reachability.
- `POC-02` Mobile/QA: Android+available iOS Expo dev builds connect local hub via allowed private TLS/network setup; pair/revoke devices; unplug WAN for 30 minutes; log results.
- `POC-03` BE/QA: spool 2 receipts sequentially, logo/Vietnamese diacritics, distinct headers, cut, out-of-paper after copy #1; confirm explicit UNKNOWN states and reprint.
- `POC-04` BE: transactional SQLite WAL, recover after kill/power loss (simulated), verify outbox replay.
- `POC-05` Payment: check **actual bank** support with provider, webhook signature, sandbox transaction, fee model. Never wire live bank credentials into testing data.
- `POC-06` Business: observe actual queue placement, cashier lookup flow, print physical layout; verify number/type of phones.
- `POC-07` Architect: ADR sign-off; if Store Hub approach fails, write alternative ADR before implementing app code.

### M1 — contract and foundational quality
- `C-01` Domain BE: shared money math, state machine, immutable ledger legs and golden cash/partial/refund fixtures.
- `C-02` Architect: agree OpenAPI v1 schemas/errors/pagination/idempotency headers/requested_method vs captured_method.
- `C-03` BE: PostgreSQL and SQLite migration naming, indexes, constraints, actor and event schemas; plan versioning.
- `C-04` FE leads: generated TypeScript clients + contract mock handlers + consistent fixture seeds; UI contracts signed off.
- `C-05` Security/QA: threat model (cash fraud, QR spoofing, LAN spoofing, malicious staff, replay); CI guardrails and branch protection proposal.
- `C-06` Full team: final wireframes and business-language labels reviewed on low-end devices.

### M2 — first end-to-end order
- `BE-01` Device pairing/local auth, staff scoped login, cashier session/shift authentication.
- `BE-02` Catalog versions/owner price command with history + hub download cache.
- `BE-03` Idempotent order create/read/edit-before-payment; unique display code; item snapshot and audit.
- `BE-04` Local WebSocket ordered order feed, reconnect and event cursors; deterministic retry.
- `FW-01` Web POS search/list and order detail with payment intent displayed but no fake captures.
- `FW-02` Owner React/Vite product catalog editor/role-gated changes.
- `FM-01` RN staff login, menu name+price, qty+/−, notes, requested payment picker (CASH default, BANK, feature-flag MOMO/MIXED).
- `FM-02` React Native optimistic UI explicitly separates `Saving...`, `Saved`, `Retry`; don't speak to prep before durable ACK; order history.
- `INT-01` Integrated order path and 8-device simulated stress, contract/persistence evidence.

### M3 — cash and printing
- `BE-05` Cash drawer/shift opening (float), bounded integer money, cash tender/change atomic capture, server-side authorization.
- `BE-06` Cash movements add/withdraw/expense/refund, close count + variance and immutable close event.
- `BE-07` Paid event -> 1 batch/2 copy jobs + spool adapter, UNKNOWN/reprint watermark; fail after first copy.
- `FW-03` Cashier checkout large numbers, denomination shortcuts, error/prevent double submission, method override audit.
- `FW-04` Open/close shift, drawer movements, reconciliation; print queue UI/alerts.
- `INT-02` Full sale -> two physical receipts -> counted shift variance; cash ledger vs owner snapshots.

### M4 — bank & cloud
- `BE-08` Cloud verified bank webhook adapter, unique provider tx ID; intent/ref QR; provider-specific signature and replay protection.
- `BE-09` Hub/cloud outbox/inbox stable event IDs, missed callback recovery poll, suspense mismatches, idempotent conflict resolution.
- `BE-10` Owner reports from verified payment allocations and catalog audit; stale-data marker.
- `FW-05` Bank QR pending/confirmed/exception UI; cashier cannot override verification with screenshot.
- `FW-06` Owner dashboard revenue and cash-vs-bank, reconciliation exception queue, sync freshness + export.
- `INT-03` Bank sandbox end-to-end, duplicate webhook, mismatch, overpay, pending while cloud offline.

### M5/6 — hardening and cutover
- `QA-01` Unit, contract, integration, real printer faults, RN disconnect/retry, web refresh, cloud failure, anti-double settlement.
- `QA-02` Security review, authz bypass tests, webhook replay, stale price, device theft and PIN lockout.
- `QA-03` k6/Artillery test 150 orders/hour target with 8 active clients, latency/throughput recorded; instrument p95 and queue latency, compare budgets.
- `OPS-01` Installer/autostart/service restart, backup/restore, audit/event retention, operations runbook and incident drill.
- `OPS-02` Configured cloud, secure secrets, environment isolation, monitoring and alerts.
- `PILOT-01` Dual-run at shop, compare daily cash + bank settlements and paper bills, train staff; require owner written sign-off.

## Definition of Done per task
- Scope + tests + traceability to spec + negative cases + concise PR are complete.
- Affected financial invariant covered by unit/integration test.
- Cross-FE/BE contract validated and generated types updated together.
- Logs and audit neither lose events nor leak secrets.
- All touched skill files read; evidence listed in PR, independent review has no unresolved blocker.
- Milestone status changed only after its own exit evidence exists.

## Prioritization
P0: correctness/durability/security (no false paid, no missing cash, no double receipts from retry, no duplicate order, no untracked refunds). P1: 2–3 taps order capture and payment UX. P2: advanced owner reports, batching and micro-optimizations. No scope creep to stock/kitchen flows.

## UI sequencing refinement (2026-10-10)

See `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md` for P0 RN Staff + POS touch UI and P1 Owner UI, `docs/ui/SCREEN_SPECS.md` for each screen, and `docs/ui/AGENT_UI_WORKFLOW.md` for Vercel Web Interface Guidelines + Taste skill routing. Shared API fixture freeze (M1) comes before parallel RN/Web implementation. UI validation must include the narrow 320dp phone, 1024px POS, keyboard, safe-area, no horizontal overflow, user-visible payment authority and printer-UNKNOWN recovery.
