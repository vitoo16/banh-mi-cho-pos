# Cloud sync and Owner remote deployment

Status: code is implemented; NOT validated for production hardware, remote security or bank-provider compliance.

Architecture: Store Hub retains the authoritative SQLite WAL order/cash/receipt ledger. SQLite triggers write a transactional outbox. An outbound-only Hub worker signs JSON event batches with CLOUD_SYNC_SECRET and posts them over HTTPS to the NestJS Cloud API. PostgreSQL deduplicates by (store_id,event_id), mirrors orders/payments/products/shifts/refunds/cash movement/bank exceptions and drives read-only Owner remote reporting.

Configuration:
- Cloud: DATABASE_URL, CLOUD_STORE_ID, CLOUD_SYNC_SECRET (32+ random chars), CLOUD_OWNER_LOGIN_SECRET (16+ random chars), CLOUD_ALLOWED_ORIGIN (specific HTTPS Owner frontend origin), CLOUD_TLS_TERMINATED=1 only behind a trusted HTTPS ingress.
- Local Store Hub: CLOUD_SYNC_URL=https://your-cloud-host, CLOUD_STORE_ID and exactly the same CLOUD_SYNC_SECRET. Keep all secrets server-side.
- Web Owner: VITE_CLOUD_API_URL=https://your-cloud-host. The remote Owner UI is READ ONLY; price/employees remain editable using local Owner UI.

Commands: npm install; npm run build; npm run dev:cloud (with a cloud .env configuration); npm run dev:hub; npm run dev:owner. PostgreSQL integration CI is under .github/workflows/cloud-ci.yml.

Security: NEVER expose DB password, bank-bridge key, cloud sync key or Owner password in Vite/Expo bundles. Public bind must have configured reverse proxy TLS, strong secrets, rate limiting, monitoring and revocation before launch.

Acceptance still required: 30-minute WAN outage, initial backfill for an established shop, Postgres restore, signed cloud command inbox for remote edits, real printer/cash drawer, bank provider merchant/webhook evidence and end-to-end device-pairing TLS.

## Upgrading an existing local store

With `CLOUD_SYNC_URL`, `CLOUD_STORE_ID` and `CLOUD_SYNC_SECRET` configured, Store Hub performs one transactional history snapshot per store ID before starting outbound synchronization. Existing orders, payment records, refunds, products, shifts, drawer movements and bank-event exceptions are queued even if originally written before cloud sync existed. Backfill marker and events commit atomically; restart is safe. Never change `CLOUD_STORE_ID` on an already paired store without a separately audited migration.

## Remote Owner sessions

Owner login requires a strong 16+ character cloud password, per-origin-address PostgreSQL login attempt lockout (5 failures within 15 minutes), persistent hashed/revocable 8-hour sessions, and logout that invalidates the server session. Restarting Cloud API does not invalidate valid sessions. Rotating `CLOUD_OWNER_LOGIN_SECRET` invalidates previous session tokens. Use a trusted proxy configuration for accurate client IPs and enforce edge rate limits as defense in depth. Remote Owner remains read-only.

## Operational remaining acceptance

Automated backfill and auth tests do **not** certify restored database, performance across 8 phones, actual thermal printing, or bank settlement provider. Test those on deployment infrastructure. Confirm remote report freshness before accounting decisions.

## SePay verified settlement inbox (gated)

When the SePay cloud adapter and merchant-linked bank account have passed testing, set `ENABLE_VERIFIED_BANK_INBOX=1` on Store Hub, alongside HTTPS `CLOUD_SYNC_URL`, `CLOUD_SYNC_SECRET`, `BANK_BRIDGE_SECRET`, and identical `CLOUD_STORE_ID`. The outbound worker polls signed settlement envelopes, validates signature/store ID/cursor/amount/reference and submits each event through the Hub's idempotent bank-verification transaction. Cursor moves forward only after local processing, so retries do not create second captures.

Hub never trusts a screenshot or an unauthenticated cloud response, and it never needs an inbound public webhook port. Bank provider verification stays cloud-authoritative. Confirmed-but-late transfers after a cashier CASH capture become explicit exception events, not a second local receipt batch.

## SePay HMAC webhook adapter (provider-specific)

Official reference: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc and https://developer.sepay.vn/vi/sepay-webhooks/tich-hop-webhook

The cloud endpoint `POST /v1/providers/sepay/webhook` requires HMAC-SHA256 with `X-SePay-Signature: sha256=<hex>` over the **original raw body** and `X-SePay-Timestamp` (Unix seconds, ±5 min). It cannot be tested by stringifying a parsed JSON body and expecting the same signature. Enable Nest Fastify `rawBody:true` and configure `SEPAY_WEBHOOK_SECRET` (32+ chars), `SEPAY_ACCOUNT_NUMBER` and `SEPAY_BANK_GATEWAY`. The Store Hub `BANK_CODE` must match the SePay webhook `gateway` identifier; `BANK_ACCOUNT_NUMBER` must match merchant receiving account. `BANK_BRIDGE_SECRET` must be configured independently from the cloud sync signing key.

SePay transaction IDs have a unique constraint; mismatched amount, direction, receiver, missing reference and duplicate order capture remain exceptions. Only exact verified credits produce a durable cloud settlement. `GET /v1/sync/settlements?after=...` requires HMAC-authenticated Hub polling and returns a signed envelope. Store Hub validates it again, applies its existing idempotent bankEvent transaction and commits its cursor AFTER each recorded provider transaction; a replay cannot duplicate receipts/revenue. Keep `ENABLE_VERIFIED_BANK_INBOX` disabled until a real sandbox and controlled test transfer pass.

**Bank-provider sandbox and account registration are external acceptance requirements.** Cloud HMAC + CI simulated transfer tests do not substitute for verification that SePay can observe the shop's actual linked bank account. No MoMo merchant integration is claimed.

### WAN-offline delayed bank reference

An authenticated SePay credit arriving before the corresponding Hub bank intent has synced remains `UNMATCHED_REFERENCE` and is **not** marked paid. Once the locally committed intent reaches Cloud, the SePay reconciliation service rechecks original destination, amount and still-unpaid order status and settles only if all checks match; otherwise it remains an Owner-visible exception. Covered by the SePay integration test.
