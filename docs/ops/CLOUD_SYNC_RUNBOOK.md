# Cloud sync and Owner remote deployment

Status: code is implemented; NOT validated for production hardware, remote security or bank-provider compliance.

Architecture: Store Hub retains the authoritative SQLite WAL order/cash/receipt ledger. SQLite triggers write a transactional outbox. An outbound-only Hub worker signs JSON event batches with CLOUD_SYNC_SECRET and posts them over HTTPS to the NestJS Cloud API. PostgreSQL deduplicates by (store_id,event_id), mirrors orders/payments/products/shifts/refunds/cash movement/bank exceptions and drives read-only Owner remote reporting.

Configuration:
- Cloud: DATABASE_URL, CLOUD_STORE_ID, CLOUD_SYNC_SECRET (32+ random chars), CLOUD_OWNER_LOGIN_SECRET (12+ random chars), CLOUD_ALLOWED_ORIGIN (specific HTTPS Owner frontend origin), CLOUD_TLS_TERMINATED=1 only behind a trusted HTTPS ingress.
- Local Store Hub: CLOUD_SYNC_URL=https://your-cloud-host, CLOUD_STORE_ID and exactly the same CLOUD_SYNC_SECRET. Keep all secrets server-side.
- Web Owner: VITE_CLOUD_API_URL=https://your-cloud-host. The remote Owner UI is READ ONLY; price/employees remain editable using local Owner UI.

Commands: npm install; npm run build; npm run dev:cloud (with a cloud .env configuration); npm run dev:hub; npm run dev:owner. PostgreSQL integration CI is under .github/workflows/cloud-ci.yml.

Security: NEVER expose DB password, bank-bridge key, cloud sync key or Owner password in Vite/Expo bundles. Public bind must have configured reverse proxy TLS, strong secrets, rate limiting, monitoring and revocation before launch.

Acceptance still required: 30-minute WAN outage, initial backfill for an established shop, Postgres restore, signed cloud command inbox for remote edits, real printer/cash drawer, bank provider merchant/webhook evidence and end-to-end device-pairing TLS.
