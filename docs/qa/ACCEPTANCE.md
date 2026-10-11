# QA, performance & release acceptance

**Status:** Targets to test; no result claimed. Do not declare readiness until real hardware tests are signed.

## Baseline
1 shop, 4–8 staff order entry phones, >300 daily orders, 1 cashier, 1 cash drawer, 1 printer with CUSTOMER and STORE copy per fully paid transaction. No inventory, no KDS/kitchen printers, no prep statuses. Bank only after verified provider integration.

## Test matrix

| ID | Fixture / action | Pass criterion / evidence |
|---|---|---|
| Q-01 | 8 clients concurrently create 150 orders in 1h | All unique, amounts correct, 0 lost/duplicate committed orders; captures p95 & errors |
| Q-02 | RN tap Save twice then retry after lost ACK | Exactly 1 persisted order and consistent display code |
| Q-03 | Staff selects BANK, no transfer | Remains UNPAID, no PAID receipt |
| Q-04 | Cash 100,000 - order 90,000 | Change 10,000; net cash 90,000; ledger legs correct |
| Q-05 | Staff changes requested CASH to BANK, cashier collects CASH | Actual payment report only counts CASH, audit method change |
| Q-06 | Bank callback duplicated/reordered | Single verified capture, 0 duplicate revenue |
| Q-07 | Wrong bank account/reference/amount/signature | Exception/pending, 0 fraudulent settlement |
| Q-08 | One confirmed settlement + print success | One batch, two intended copies with matching order ID, copy kind visibly distinct |
| Q-09 | Paper runs out after copy 1 | Copy 2 flagged UNKNOWN/FAILED, explicit authorized `REPRINT`, no payment duplication |
| Q-10 | Internet unplugged, LAN alive 30 minutes | RN->Hub orders, local CASH, printing and close-shift still work; bank cannot be falsely confirmed |
| Q-11 | Hub killed after DB commit/before ACK | Recover order and outbox, stable retry/idempotency response |
| Q-12 | Windows reboot, restore backed-up SQLite | No committed money/order lost past tested RPO; no double-settlement on replay |
| Q-13 | Cash opening + additions + tender/change + withdrawals | expected count correct; variance=actual-expected; closed shift immutable |
| Q-14 | Owner updates price mid-day | Future orders new price, already committed old snapshot unchanged |
| Q-15 | Staff tries price/edit payment/owner endpoint | 403 (server-enforced); sensitive audit logs safe |
| Q-16 | Mobile iOS/Android LAN auth pairing/revoke | Connect only paired devices, unsupported network config caught |
| Q-17 | Cloud outbox sync delayed and callback arrives first | Durable unmatched bank correlation, accurate capture once reconciled |
| Q-18 | Owner dashboard cloud data stale | Prominent last_sync_at, no silent claim of live data |

## Proposed measurable performance budgets
- **LAN order commit p95 ≤ 400ms**, p99 ≤ 1s during normal 8-device load, excluding actual mobile radio outages; goal, verify on target Windows POS device.
- POS order screen interaction input-to-feedback ≤ 150ms for local UI; cashier search p95 ≤ 300ms with ≥100k historical rows and indexed cursor pagination.
- Web POS initial core JS compressed budget **≤250KB** (target, measure and revise with documented evidence), separate owner charts chunk; Lighthouse accessibility score ≥90 (not sole accessibility pass).
- RN routine one-item order ≤15 seconds and ~6 taps (usability target, not a measured SLA); no frame drops noticeable on supported low-end device.
- Printer start dispatch ≤500ms after paid event (excluding mechanical printer latency); no lost print intent. **Physical exactly-once is not provable on most printers**, operators can initiate audited reprint.
- Cloud confirmed payment event to connected hub UI p95 ≤3 seconds **after provider callback arrives** under healthy WAN (provider latency excluded). Pending remains if callback delayed.
- Cloud dashboard reports 100% matched actual settled allocations to event ledger; stale sync timestamp always displayed.

## Metrics and observability
- `orders_committed`, `duplicate_order_idempotency_hits`, `cash_capture_errors`, `cash_variance_vnd`, `payment_reconciliation_exceptions`, `provider_callback_lag_seconds`, `sync_outbox_depth`, `receipt_copy_unknown`, `print_queue_wait_ms`.
- Logs: operation ID, order UUID, store ID (non-sensitive internal), payment intent ref redacted where required, cashier role ID; no sensitive account details/PINs.
- Alert on unprocessed webhooks, sync backlog growth, print UNKNOWN backlog, repeated payment error, backup failures and shift variance exceeding store policy.

## Automated gates and hardware gates
- Static docs/contract audit (now), then lint/typecheck, unit, DB integration, OpenAPI client sync, Playwright (web), RN native smoke, payment adapter sandbox, receipt driver E2E.
- k6/Artillery load with realistic think time, jitter and duplicate retries; hard failure if any duplicate settled revenue regardless of p95.
- Required *human* evidence: cashier counter-count signoff, paper two-copy visual proof, bank sandbox transaction IDs with redacted account identifiers, Windows reboot & restore drill, RN LAN after WAN disconnect.
- Security review: staff bypass, MITM/rogue device pairing, webhook forgery/replay, partial transfer fraud, lost device, hard-coded key scan, dependency audit.
- Go-live requires accountant/invoice compliance check if applicable, operator fallback SOP, production secret rotation/recovery procedure, owner sign-off after pilot.

## Large cashier queue regression (2026-10-11)

In a shop seeded with 340+ orders and 200+ payment captures, every actionable UNPAID/PARTIAL order remains on the cashier snapshot even if outside the most recent 200 overall. The bounded history window and STAFF user scope remain correct. REFUNDED/VOIDED must not be counted as waiting or render active payment controls. This is an automated SQLite + browser regression gate only; real-device load and p95 stay unverified.

## Actual-payment receipt text regression (2026-10-11)

The CUSTOMER and STORE receipt copies must show the tender **recorded in settled `payments.method`**, not Staff's requested method. CASH STORE copy may show `tendered_vnd` and `change_vnd`; BANK prints verified transfer amount and must never fabricate `Khách đưa 0đ / Tiền thối 0đ`. Missing/mismatched payment rows are flagged UNKNOWN instead of printing an unverified settlement statement. `tests/receipt-content.test.mjs` verifies this as pure content logic; existing virtual ESC/POS tests verify two distinct raster jobs and printer UNKNOWN/reprint handling. Actual Vietnamese font clarity/roll paper and drawer remain physical acceptance gates.

## Owner remote product price command gate (2026-10-11)

- Cloud POST/PATCH with Owner auth queues but does not change price; signed Hub poll is required. No cash/finance endpoints available through this channel.
- Same Owner idempotency key and payload returns the same command; changed payload returns 409. Wrong HMAC, store ID or timestamp rejects command list and ACK.
- Hub must atomically compare `expected_price_vnd` against the **live** product price; local edit wins and cloud edit moves to CONFLICT, not silent overwrite. New order uses updated catalog; existing orders retain original price snapshot.
- After a lost Cloud acknowledgement, repeated signed poll replays the original Hub idempotency key, with only one product update and one audit. Cloud shows APPLIED only after signed Hub result; mirror may remain stale until outbound sync.
- UI must show PENDING/CONFLICT/APPLIED, responsive at 320px and no false optimistic success. Physical network outage/reconnect test remains a separate acceptance gate.

## Staff app lost-ACK classification gate (2026-10-11)

A 409 HTTP status is NOT sufficient evidence an order was never committed: `IDEMPOTENCY_LEGACY_REVIEW` and `IDEMPOTENCY_PAYLOAD_MISMATCH` require preserving the durable original request and stable key for manual reconciliation. Only known pre-commit `CATALOG_CHANGED` / `PRODUCT_UNAVAILABLE` refresh prices, and explicit validation errors allow edited review. Unknown error codes, network aborts and server errors keep the staged request immutable and route to Recovery, not to a fresh order. The device SQLite pending row must never be overwritten with a changed body even if a caller reuses the key. Native phone kill/restart POC remains a required acceptance step.

## Remote create-product acceptance (2026-10-11)

- Remote Owner POST only queues PENDING, does not insert into `mirror_products` or expose Staff catalog immediately; Hub controls insertion.
- Cloud-generated UUID and command ID remain stable under identical key retries, changed payload returns 409, HMAC/store verification required to poll and ACK.
- Hub inserts exactly once even if signed ACK is lost; catalog version increments once, product audit is once, outbox mirror eventually delivers product to Owner Cloud.
- Disabled new products remain hidden from Staff catalog while appearing in local/Cloud Owner catalog; local Owner create respects unchecked `is_active` as well.
- Older order price snapshots are preserved. Real phone refresh and WAN outage/reconnect are still deployment acceptance gates.

## Owner catalog lost-response retry (2026-10-11)

A timed-out remote or local Owner product CREATE/UPDATE may already be committed. Owner Web now writes its immutable command payload and idempotency key into sessionStorage BEFORE HTTP, reuses the exact key/body after error and even after a reload, and only clears it after a positive ACK or clearly rejected 400/404/422. On next login it restores the pending catalog form; attempting a different edit while an uncertain mutation remains triggers a clear blocking error. Playwright simulates a successful server-side create with HTTP 503 response loss, reloads, retries, and confirms identical keys and one server-side mutation. This does not substitute for real WAN-down testing or a merchant/hardware acceptance.
