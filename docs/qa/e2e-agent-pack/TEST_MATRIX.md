# Bánh Mì Chợ POS — Senior E2E acceptance matrix

Target: current checked-out branch, Node >=24, real Store Hub + SQLite and real browser; native app on emulator/device; Cloud only with isolated PostgreSQL. All money is integer VND. P0 is critical for pilot; P1 is broader rollout. Record run ID, branch/SHA, environment, expected/actual, artifacts and PASS/FAIL/BLOCKED/SKIPPED.

## Test oracle
- Fresh QA-only DB; verify demo catalog IDs/prices from runtime, never assume fixtures unchanged.
- Bootstrap owner/cashier/staff plus qa_staff_1..qa_staff_7 using unique PINs.
- Seed creates 340 orders with requested CASH/BANK intent, a mix of PAID/UNPAID/VOIDED/REFUNDED, and one shift with 500,000 VND float.
- Seed report is only an initial oracle; reconcile with API and read-only SQL.
- Fresh DB only. If partial seed, discard only verified disposable DB and use a new file.

| ID | Priority | Scenario | Expected result |
|---|---|---|---|
| ENV-01 | P0 | Missing bootstrap PIN; localhost Hub | Startup rejects missing secrets; no public bind by default |
| ENV-02 | P0 | Fresh DB and restart | Users/catalog not duplicated; WAL, integrity and FK checks pass |
| AUTH-01 | P0 | OWNER/CASHIER/STAFF login, wrong PIN, five failures, logout | Correct roles only; invalid auth 401, rate limit 429, logout invalidates session |
| AUTH-02 | P0 | Staff calls owner/product/analytics/cash/shift/reprint endpoints | Backend returns 403; no financial mutation |
| AUTH-03 | P0 | Owner disables employee with active session | Existing session and new login rejected |
| AUTH-04 | P0 | Pair, reuse, expire and revoke device | Pair code single-use/3-min expiry; revoked device cannot authenticate |
| CAT-01 | P0 | Owner creates/edits/disables product | Active catalog/version updates; disabled item unavailable; old price snapshots unchanged |
| CAT-02 | P0 | Create with stale catalog version | 409 CATALOG_CHANGED; no phantom order |
| ORDER-01 | P0 | Single/multi item, qty, Unicode note | Hub price snapshot and total correct; display code unique |
| ORDER-02 | P0 | Empty, zero/negative/fractional/huge qty, unknown/disabled item, MOMO/MIXED | Validation rejects; no order or ledger mutation |
| ORDER-03 | P0 | Same idempotency key/body twice, concurrent duplicate, lost ACK | Exactly one order; retry returns same ID/code |
| ORDER-04 | P0 | Same key changed payload, legacy key, unknown server error | Conflict/recovery; immutable original request retained |
| ORDER-05 | P0 | 340+ history, cashier actionable queue >200, Staff history | Cursor has no gaps/duplicates; no fixed 300 cap; correct role scope |
| ORDER-06 | P1 | Staff offline Save, kill/restart app, reconnect | Durable pending request and same key; no duplicate; UNKNOWN until confirmed |
| SHIFT-01 | P0 | Cashier opens shift; second cashier attempts another | Single active shift; ownership enforced |
| CASH-01 | P0 | Order 70,000, tender 100,000 | PAID, change 30,000, drawer net +70,000, one payment and two receipt intents |
| CASH-02 | P0 | Insufficient/fractional/negative/overflow tender, wrong shift/cashier | Rejected; no payment, ledger or receipt mutation |
| CASH-03 | P0 | Retry same capture key then new key after paid | Original result replayed; new capture rejected; no duplicate revenue/receipt |
| CASH-04 | P0 | Browser closes during capture, reload/relogin | Exact pending key/body retained; safe reconciliation; no second collection |
| CASH-05 | P0 | Staff requests BANK, cashier takes CASH | Reports use actual payments.method=CASH |
| CASH-06 | P0 | Cash refund with reason; duplicate refund | Exactly one refund; ledger/drawer/report/audit reconcile |
| CASH-07 | P0 | Void unpaid then attempt capture | VOIDED excluded from actionable queue; payment rejected |
| SHIFT-02 | P0 | Add/withdraw cash and close with exact/variance count | Expected cash correct; variance needs reason; closed shift immutable |
| BANK-01 | P0 | BANK intent, QR, no callback, customer screenshot | Remains PENDING/UNPAID; BANK revenue zero; no paid receipt |
| BANK-02 | P0 | Bad HMAC/account/reference/amount/direction, duplicate/reordered event | Rejected/exception; exact verified match settles once |
| BANK-03 | P1 | Cloud outage and delayed callback/sync | Local CASH works; no false BANK settlement; correlation durable |
| PRINT-01 | P0 | Successful settlement with virtual and physical printer | One batch, CUSTOMER/STORE distinct, actual tender; physical proof separately recorded |
| PRINT-02 | P0 | Failure after first copy, unplug, timeout | UNKNOWN visible; no auto repeat; authorized audited reprint; no new capture |
| ANALYTICS-01 | P0 | Compare 340 orders against daily counts | Counts reconcile; no arbitrary cap; statuses classified correctly |
| ANALYTICS-02 | P0 | Product units day/week/month/quarter/year and date boundaries | Units != order count; paid-only definition and local calendar windows correct |
| ANALYTICS-03 | P0 | Dashboard vs ledger, shift and stale Cloud mirror | Actual settled captures only; stale timestamp visible; no false live claim |
| CLOUD-01 | P0 | Hub outbox sync/retry to isolated PostgreSQL | Idempotent mirror; stores isolated; Hub remains authority |
| CLOUD-02 | P0 | Remote product update/create, Hub offline, local conflict | PENDING until signed Hub ACK; conflict explicit; no optimistic price change |
| CLOUD-03 | P0 | Invalid HMAC/store/timestamp/replay and Cloud RBAC | Rejected; no remote cash/employee/device operation |
| RESILIENCE-01 | P0 | Kill Hub after commit before ACK, restart/retry | No lost/duplicate order or settlement; outbox durable |
| RESILIENCE-02 | P0 | Backup WAL, verify, restore to separate location | Integrity/FK/row counts valid; RPO/RTO measured; no live DB overwrite |
| SEC-01 | P0 | CORS, remote gateway, IDOR, invalid bearer, device pairing | Backend denies bypass; no secrets/PII in logs |
| UI-01 | P1 | Chrome/Firefox/WebKit; POS 1024x768; Owner 320/390/768/1440 | No overflow/clipped totals; keyboard, safe areas, Be Vietnam Pro, contrast, axe |
| UI-02 | P1 | Slow API, 500, 401, empty/loading/error/offline | Actionable recovery; no false PAID or unsafe retry |
| LOAD-01 | P0 | Eight independent concurrent clients, >=150 orders/hour, 340+ queue | Zero loss/duplicate; report p50/p95/p99 and errors; compare acceptance targets |
| LOAD-02 | P1 | 100k cursor history, cashier search and bundle budgets | Measured query/UI/bundle performance; no fabricated SLA |
| OPS-01 | P0 | Backup freshness, corrupt backup, cloud outage, print UNKNOWN, low disk | Monitoring or explicit blocker; restore never modifies live DB |

## Readiness
- Any P0 FAIL = NO-GO.
- P0 BLOCKED for real printer, phone/TLS, bank provider, Windows restore or production network = NO production go-live.
- Mocked browser tests are not real cross-process E2E. Virtual printer/fake HMAC are simulations, not physical/provider acceptance.
- Each failure needs exact reproduction, expected/actual, severity, source location, regression test and evidence.
