# API / event contract v0.1 (PLANNING DRAFT)

**Contract is not yet frozen.** `docs/contracts/openapi.yaml` is a **starter subset**, not full generated production schema. M1 owners must expand, review and freeze it before FE+BE implementation. Transport clients generated from approved schema; no `any` money payloads.

## Cross-cutting

- Hub origin is LAN-only; cloud origin is TLS. Every request carries authenticated actor/session/device ID and `store_id` from trusted server auth context, not arbitrary client choice.
- Mutating POST: `Idempotency-Key` (UUID-like opaque stable value generated once and reused for retry), shared per actor/device/store + operation and retained within defined TTL. Retries return original effect/result, not create new order/capture.
- `trace_id` for logs; errors `{code,message,details?,trace_id}`. `version` for optimistic concurrency in editing orders/catalog.
- VND integers: `integer`, safe range `0..9007199254740991` (but add lower business-specific caps), never float. Unknown or negative is error. All timestamps ISO8601 UTC; store date/cutover computed for Asia/Ho_Chi_Minh.
- Pagination: `limit <= 100`, opaque `next_cursor` (stable tie breaker id), no paginating deep offsets.
- `requested_payment_method` (CASH/BANK/MOMO/MIXED) is immutable historical intent per revision and **not settled**. Cash payment/verified external capture produces actual tender record(s).
- Optional methods MOMO/MIXED are **rejected** unless server feature flags enabled, regardless of UI.
- Enums: `order_status` COMMITTED/VOIDED; `payment_status` UNPAID/PARTIAL/PAID/PARTIALLY_REFUNDED/REFUNDED; bank intent PENDING/CONFIRMED/EXCEPTION/EXPIRED. `VOIDED` after settlement requires compensating refund and approval, no hard delete.

## APIs — authoritative on Local Hub unless otherwise specified

| Endpoint | Method | Actor | Notes |
|---|---|---|---|
| `/v1/auth/device/pair` | POST | Approved device | Short-lived pairing ceremony; no hardcoded password |
| `/v1/auth/login` | POST | Staff/cashier | Scope auth to location/role |
| `/v1/catalog` | GET | Any authenticated staff | names, price snapshots, enabled methods, version; no stock |
| `/v1/orders` | POST | Staff or cashier | item IDs/qty/note + requested method; hub computes total; idempotent |
| `/v1/orders` | GET | Staff scoped/Cashier | cursor pagination and status filtering |
| `/v1/orders/{orderId}` | GET | Owner/staff scoped | settled capture history read-only for staff |
| `/v1/orders/{orderId}` | PATCH | Authorized before settle | `expected_version`, reprice with selected snapshot, reason audited |
| `/v1/orders/{orderId}/void` | POST | Cashier with authority | Reject paid unapproved; refund via separate flow |
| `/v1/cash-shifts/open` | POST | Cashier | opening float and one drawer exclusive shift lock |
| `/v1/cash-shifts/{shiftId}/movements` | POST | Cashier/manager | ADD/WITHDRAW/EXPENSE/REFUND reason + amount |
| `/v1/cash-shifts/{shiftId}/close` | POST | Cashier + policy | actual count, variance, immutable closure |
| `/v1/orders/{orderId}/payments/cash` | POST | Cashier | tendered total, derived change, shift, idempotency; no client-set PAID |
| `/v1/orders/{orderId}/payments/bank-intent` | POST | Cashier | hub proxies cloud; return QR/ref/pending; requires WAN |
| `/v1/orders/{orderId}/payments` | GET | Cashier or scoped staff | real captures/partial and intent states |
| `/v1/orders/{orderId}/receipts` | GET | Cashier | batch, 2 copy statuses, print attempts |
| `/v1/receipt-copies/{copyId}/reprint` | POST | Cashier, policy | explicit reason, `REPRINT` flag, no new settlement |
| `/v1/events?cursor=...` | WS/SSE | Scoped client | reconnect resume and event de-dup |
| `/v1/owner/products` | GET/POST/PATCH | Owner cloud | CRUD prices/flags, price history; no stock |
| `/v1/owner/dashboard` | GET | Owner cloud | payment actuals + freshness metadata |
| `/v1/owner/reconciliation-exceptions` | GET | Owner cloud | suspense/unmatched/over/under payments |
| `/v1/providers/{provider}/webhook` | POST | Provider cloud | signature/hmac validation; never staff-callable |

## Golden request/response examples

**Create order** (request):

```json
{
  "catalog_version": 17,
  "requested_payment_method": "BANK",
  "items": [
    {"product_id": "p-banh-mi-thit", "qty": 2, "note": "1 ổ không hành"},
    {"product_id": "p-banh-bao", "qty": 1, "note": ""}
  ],
  "note": ""
}
```

**Committed** (server response):

```json
{
  "order_id": "10000000-0000-4000-8000-000000000158",
  "display_code": "B0158",
  "version": 1,
  "status": "COMMITTED",
  "payment_status": "UNPAID",
  "requested_payment_method": "BANK",
  "total_vnd": 90000,
  "items": [
    {"product_id": "p-banh-mi-thit", "name_snapshot": "Bánh mì thịt nguội", "qty": 2, "unit_price_vnd": 35000, "line_total_vnd": 70000, "note": "1 ổ không hành"},
    {"product_id": "p-banh-bao", "name_snapshot": "Bánh bao", "qty": 1, "unit_price_vnd": 20000, "line_total_vnd": 20000, "note": ""}
  ]
}
```

**Cash capture**:

```json
{ "shift_id": "shift_20261010_01", "cash_tendered_vnd": 100000, "expected_order_version": 1 }
```

Authoritative result (only after DB commit): `cash_change_vnd=10000`, `cash_net_vnd=90000`, `payment_status=PAID`, a receipt batch containing `CUSTOMER` & `STORE`. Cashier submits tender, **not amount to change**.

**Bank:** intent returned `PENDING` with cloud-generated unique reference/QR/expiry; `PAID` only from signed provider evidence and downstream sync. For partial, paid = false and copies not generated.

## Events and dedup
`OrderCommittedV1`, `OrderVoidedV1`, `CashCapturedV1`, `BankCaptureVerifiedV1`, `ShiftOpenedV1`, `ShiftClosedV1`, `ReceiptBatchEnqueuedV1`, `ReceiptCopyPrintedV1`, `ReceiptCopyUnknownV1`, `CatalogVersionChangedV1`, `PaymentExceptionOpenedV1`. All events contain `{event_id, aggregate_id, aggregate_version, occurred_at, actor_type, causation_id, payload_version}`. Consumers persist inbox IDs and reject duplicate processing; gap -> fetch snapshot + reconcile. No blind last-write-wins.

## Feature flags
`bank_payment_enabled` only after bank POC; `momo_merchant_enabled` default false; `mixed_payment_enabled` default false; `cashier_manual_bank_override_enabled` default false (must have separate explicit policy/approval if ever considered). Flags are server-controlled and cached signed locally with version/expiry.

## Schema evolution
Additions backward compatible, breaking changes versioned with migrations, contract fixture regeneration in one PR. **Approve v1 before application implementation; v0.1 here is a draft.**
