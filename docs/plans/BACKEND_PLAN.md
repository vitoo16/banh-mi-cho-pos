# Backend detailed implementation plan — NestJS + Fastify

**Apps:** `apps/store-hub` (Windows/local SQLite/receipt engine), `apps/api` (cloud PostgreSQL/payment callbacks), plus shared `packages/domain` + `packages/contracts`. **Not implemented yet.**

## Module boundaries
1. `IdentityModule`: staff/cashier/owner roles, device pairing/revoke, store scope, lockout/rate limiting, offline-limited cashier authorization, cloud auth.
2. `CatalogModule`: owner-owned product CRUD, categories, modifiers optional, price history/effective version; signed hub cache; **no stock fields**.
3. `OrdersModule`: validation against catalog, `order_id` UUID, short display_code, `create_by`, immutable price snapshots, notes, requested method, idempotent create/edit before paid/void.
4. `PaymentsModule`: immutable cash/bank capture allocations, money state derived from actual settlements, refund compensations, split behind flag; no client PAID flag.
5. `CashShiftsModule`: cashier-only open/lock/close, opening_float, tender/change legs, add/withdraw/expense/refund movements, expected/actual variance with evidence.
6. `BankIntegrationsModule` **cloud**: intents QR unique reference; verified provider callback and bank transaction de-dup; expiry/partial/mismatch/overpay suspense; reconciliation polling.
7. `ReceiptsModule` **local**: one batch per fully settled event, copy CUSTOMER/STORE, reliable print queue, retries after UNKNOWN with watermark/audit, 80mm ESC/POS adapter.
8. `SyncModule`: durable local outbox/cloud inbox; per-aggregate version, ordered replay, gap detection, provider events back to hub; not last-write-wins.
9. `ReportingModule` **cloud**: aggregates based on actual confirmed allocated payments, shift cash variance, stale-data freshness, export.
10. `AuditModule`: who/when/old/new/reason/correlation ID; append-only for finance-sensitive events.

## Persistence and transactions

### SQLite local
- WAL, foreign keys ON, transaction after validation, unique `(store_id, device_id, idempotency_key)`; one writer serialized by queue/busy timeout.
- Recommended tables: `orders`, `order_lines`, `payment_capture_events`, `cash_shift`, `cash_movements`, `cash_count`, `receipt_batches`, `receipt_copies`, `print_attempts`, `outbox_events`, `inbox_events`, `catalog_snapshot`, `audit_events`, `device_credentials`.
- An order commit and its `ORDER_COMMITTED` outbox event MUST be one DB transaction. Cash capture + movement(s) + PAID event + receipt intent MUST be atomic. Never ACK before commit.

### PostgreSQL cloud
- `stores/users/roles/catalog/products/product_price_history`, replicated `orders/order_lines/cash_events`, `provider_payment_intents`, `external_transactions`, `payment_allocations`, `exceptions`, `audit_events`, `sync_cursors`.
- Unique `(provider, provider_transaction_id)` and `(store_id, intent_reference)` plus invoice/payment foreign keys. Use check constraints for positive VND amounts, capture <= outstanding rule guarded transactionally, and repeated webhook dedup.
- Index `(store_id, created_at DESC, id DESC)`, `(status, created_at)` for lists, `(cash_shift_id, occurred_at)` and `(provider, reference)` for reconciliation. EXPLAIN query plans on realistic synthetic volumes.
- Do not assume naive replicas stay perfectly current; owner report includes `last_synced_at` and data-source provenance.

## API design
- Follow `docs/contracts/API_CONTRACT.md` and OpenAPI; `POST` financial endpoints require Idempotency-Key, actor+store+shift auth and validated body.
- Every error is `code`, `message`, `details`, `trace_id`; never leak stack/passwords.
- Versioned REST `/v1`; realtime events use event ID and sequence, client resumes after reconnect.
- Typed schemas, request size limits, rate limits, purpose-specific DTO; financial fields `int64 VND` handled consistently in JS safe-integer range, reject unsafe integers.

## Implementation tasks

| Task | Inputs | Output and tests | Dependencies |
|---|---|---|---|
| BE-00 | M0 decisions | Nest/Fastify + health + config + DI + JSON logs | POC-01 |
| BE-01 | Auth spec | Device pairing, actor RBAC guards; 401/403/lockout E2E | C-02 |
| BE-02 | Catalog contract | Catalog version + price history + hub snapshot; stale price tests | BE-01 |
| BE-03 | Order contract | Atomic create/edit/void, UUID/display code/idempotency, total snapshots | BE-02 |
| BE-04 | Realtime & outbox | Subscribe/ack/resume + offline duplicate recovery | BE-03 |
| BE-05 | Cash math fixtures | Open shift, capture tender, change and receipt intent transaction | BE-03 |
| BE-06 | Shift ledger | Owner float/add/withdraw/expense/refund, denomination count, close+variance | BE-05 |
| BE-07 | Printer POC | Spool batches with two copies, retries/UNKNOWN/reprint watermark | BE-05, POC-03 |
| BE-08 | Provider docs | Bank adapter intents/webhook verified signatures + dedup | C-02, D-01 |
| BE-09 | Sync contract | Local->cloud events and cloud bank->hub settlement inbox; replay/gaps | BE-04/08 |
| BE-10 | Report contract | Aggregation + freshness + owner filters, date boundaries Asia/Ho_Chi_Minh | BE-06/09 |
| BE-11 | Refund/void | Compensating ledger, operator approval, auditing, no old-row edits | BE-05/08 |

## Test cases by module
- Orders: 8 simultaneous clients, retry after response timeout, double tap, catalog version changes during checkout, serial display code unique, notes persisted.
- Cash: 100k tender - 35k due = 65k change, double cashier click, unauthorized staff capture, wrong shift, closing variance ±20k, refund reversals, zero/negative/overflow rejected.
- Bank: duplicate/out-of-order callbacks, invalid signature, stale timestamp, wrong account/reference, amount short/over, previously voided order, provider down, callback before order cloud sync.
- Print: paper out after first copy, printer disconnected, process crash before/after spool ACK, distinguish `QUEUED/PRINTED/FAILED/UNKNOWN`, human-confirmed reprint does not create payment.
- Sync: cloud unreachable for 30 min, delayed replay, hub restart, duplicate event ID, version gaps, replay determinism, no lost committed orders.
- Security: cross-store IDs, stale/expired device credentials, cashier scope, OWASP basics, no credentials in logs.

## Definition of Done
Working source + migrations + unit/contract/integration + fault test + OpenAPI artifact + structured logs + recovery notes + measured p95 under the stated load. A BE task is not done if only its happy-path REST endpoint runs.
