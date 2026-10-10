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
