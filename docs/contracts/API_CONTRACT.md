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

## Implemented pilot API mapping (2026-10-11)

The shared TypeScript contract in `packages/contracts/src/index.ts` and HubClient is consumed by both Vite apps and React Native Staff. The NestJS Store Hub implements the following routes:
- Public: `POST /v1/auth/login`; `GET /v1/health`.
- Staff/Cashier: `GET /v1/catalog`, `GET|POST /v1/orders`, `GET /v1/orders/:id`.
- Cashier: `GET /v1/cash-shifts/current`, `POST /v1/cash-shifts/open`, `POST /v1/cash-shifts/:id/movements`, `POST /v1/cash-shifts/:id/close`, `POST /v1/orders/:id/payments/cash`, `GET /v1/orders/:id/receipts`, `POST /v1/receipt-copies/:id/reprint`.
- Owner: `GET /v1/owner/dashboard`, `GET|POST /v1/owner/products`, `PATCH /v1/owner/products/:id`, `GET|POST /v1/owner/employees`, `PATCH /v1/owner/employees/:id`.
- Bank: `POST /v1/orders/:id/payments/bank-intent` currently **returns 503** — no real payment intent or webhook in local pilot. Requested BANK still UNPAID.

**Known contract follow-up:** OpenAPI was extended for route discoverability but generated clients and schema runtime validation remain to be hardened in M1. Do not label fully contract-frozen or production-ready.
## Signed bank bridge internal contract

A trusted bridge validates a real provider event before sending signed JSON to `POST /v1/internal/bank-events`; the Hub independently checks HMAC timestamp window, bank destination, transfer reference, exact amount and unique provider transaction ID in one SQLite transaction. Confirmed bank captures create exactly one BANK payment and two receipt intents. Exceptions are retained for owner review; mismatches never mark paid. This protocol is **not a SePay/payOS/MoMo implementation**; no bank provider may be marked connected until its signed callback adapter and controlled real transfer acceptance exist.

## Cash refund and signed-bank bridge extensions

- `POST /v1/orders/:orderId/refunds/cash`: cashier-scoped, `Idempotency-Key`, body `{shift_id,reason}`. Only fully paid CASH orders; journal `cash_refunds` and negative drawer movement, set `REFUNDED`. Refunded orders excluded from paid-revenue total. Does **not** simulate a bank refund.
- `POST /v1/orders/:orderId/payments/bank-intent`: cashier-scoped, generates unique transfer reference and exact destination when BANK_* environment is configured, **not** proof of payment or QR-provider integration.
- `POST /v1/internal/bank-events`: *trusted bank bridge only*, `x-bmc-timestamp` Unix milliseconds within ±5 min, HMAC-SHA256(secret, timestamp + '.' + compact JSON body), `x-bmc-signature` hex. Events must contain `provider_tx_id`, `reference`, `bank_code`, `account_number`, `amount_vnd`, `direction: CREDIT`. Server validates exact reference/destination/amount and paid state transactionally before posting BANK capture and two receipt intents. Duplicate provider tx id returns original classification. This is **not** a direct bank-provider adapter.
- `GET /v1/owner/bank-exceptions`: owner-scoped unmatched and mismatched transfers for human reconciliation.

## Cloud history/backfill and privileged authentication

Store Hub `prepareCloudBackfill(storeId)` is invoked when an outbound HTTPS sync config is enabled. The first run atomically queues a complete snapshot of local orders, payment captures, refunds, products, shifts, cash drawer movements and bank events and writes a store-bound marker in SQLite. Cloud entity IDs and versions prevent logical duplicates. This is a one-way mirror, **not** a cloud-authorized cashier/order mutation path.

Cloud Owner `POST /v1/auth/login` is server-rate-limited per remote address and returns an opaque session token; only its SHA-256 hash, secret fingerprint and expiry are stored in PostgreSQL. `POST /v1/auth/logout` revokes the session. All cloud Owner endpoints authorize the token asynchronously against PostgreSQL, so sessions survive API restarts and are invalidated by password rotation. Owner cloud never accepts a staff cashier capture command.

## SePay cloud to Hub confirmation contract

- `POST /v1/providers/sepay/webhook` — SePay-originated HMAC SHA-256 request, timestamp **seconds**, signature `sha256=<hex>`, body raw JSON. Server accepts only exact `accountNumber`, `gateway`, full `code`/reference token and integer `transferAmount` matched against a committed cloud mirror of the Hub payment intent. Respond `{success:true}` after transaction is stored or classified exception; failures return 401/400.
- `GET /v1/sync/settlements?after=<seq>` — Store Hub only: `x-bmc-store`, `x-bmc-timestamp` (milliseconds), and HMAC-SHA256 hex over `timestamp+'.GET:'+storeId+':'+after`. Returns `{timestamp,payload:{store_id,settlements},signature}` signed on `timestamp+'.'+JSON.stringify(payload)`.
- Hub validates signed response, submits `provider_tx_id='sepay:'+id`, reference, receiver, exact amount through the existing HMAC-protected bankEvent local transaction, then persists the cursor. Client/UI is not allowed to set PAID.
- `bank_intent` cloud outbox entity has `order_id`, `reference`, `account_number`, `bank_code`, `amount_vnd`, `status`. Existing intents are backfilled under a separate migration marker. Provider payload ingestion must only happen on Cloud, never from the staff app.

## Protected Store LAN staff devices

- Owner at the **local POS** calls `POST /v1/owner/device-pairing-codes` with Owner session (8-character code, 5-minute expiry, hashed in SQLite and single-use).
- Staff native RN calls `POST /v1/auth/device/pair` with `{code,device_name}` **over trusted LAN HTTPS** to obtain an opaque 256-bit `device_token`, stored in Expo SecureStore. Subsequent mobile calls include `X-Device-Token`.
- Hub's direct TLS Fastify onRequest gateway checks socket IP, non-revoked device token and authenticated **STAFF** role on all remote order/catalog endpoints. Only `GET /v1/health`, `POST /v1/auth/device/pair` and a *paired* `POST /v1/auth/login` are pre-login exceptions. LAN phones cannot call cashier, Owner, bank, print, shift or refund routes even if they know credentials.
- Local Owner can query `GET /v1/owner/devices` and revoke by `POST /v1/owner/devices/:deviceId/revoke`; revoked tokens stop working immediately. Signed-in staff must authenticate individually with PIN after device pairing.
- TLS must be terminated **directly at the Store Hub** to keep socket peer IP authoritative. Only loopback routes bypass device gateway; do not deploy a reverse proxy that causes remote devices to appear as loopback. The temporary insecure LAN development flag is **not production safe**. Mobile devices must trust the LAN server certificate matching its IP/DNS SAN.
