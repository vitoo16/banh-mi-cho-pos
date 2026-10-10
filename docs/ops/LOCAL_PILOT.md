# Local pilot (implemented code, not production certification)

**Current capability:** Store Hub NestJS/Fastify + SQLite, order, user roles, cash tender/change, shifts, receipts intent (two copies), receipt TCP raster output when configured; Vite cashier, Vite owner (LAN pilot only), Expo staff. **Not implemented:** production bank provider integration, cloud PostgreSQL sync, vetted LAN TLS/device pairing, electronic invoice, verified physical printer/UPS and real stress test. The user can still demo end-to-end CASH locally.

## Prerequisites and setup

Node 24 LTS, npm. Install in repository root:

```bash
npm install
npm run build -w @bmc/contracts
cp apps/store-hub/.env.example apps/store-hub/.env
# Set UNIQUE strong bootstrap PINs in apps/store-hub/.env. Never commit .env.
npm run dev:hub
```

In separate terminals:
```bash
npm run dev:pos
npm run dev:owner
npm run dev:mobile
```

- POS: http://127.0.0.1:5173 (sign in with cashier id and chosen PIN; only PIN field because account id fixed to cashier).
- Owner: http://127.0.0.1:5174 (owner id).
- Staff: configure Expo app's `EXPO_PUBLIC_HUB_URL` to a **test LAN-only** hub IP and use the staff PIN. The hub defaults to loopback for safety; LAN access requires an explicit **temporary** `ALLOW_INSECURE_LAN_DEV=1`, `HUB_BIND_HOST=0.0.0.0` only on isolated test Wi-Fi. It is **not fit for live customer data** until trusted TLS, device pairing and mobile auth hardening are implemented.
- Default catalog empty in production. `SEED_DEMO_CATALOG=1` seeds only **sample prices** for testing, not actual menu values.
- On first launch bootstrapped users created once; changing PIN env after initial run doesn't rotate credentials.
- Owner creates/edit products; Staff logs in, chooses quantities, notes and requested method, saves; POS cashier finds order, opens shift, settles exact cash/change, sees receipt job state. Owner sees paid cash data.

## Printer

`PRINTER_HOST` + `PRINTER_PORT` (default 9100) enable raw ESC/POS network printing; output is rasterized to support Vietnamese, two separate jobs (CUSTOMER and STORE). On network send successful, receipt is `SENT` not **physically confirmed**. On printer timeout/partial send it remains `UNKNOWN`; cashier must check paper, then request explicitly audited reprint (watermark `BẢN IN LẠI`). **Driver, cutter, Vietnamese glyph font, paper width and drawer must pass real hardware POC.** Without printer config jobs remain `WAITING_FOR_PRINTER`, not falsely marked printed.

## Tests

```bash
npm run check
npm run build
npm run test:domain
npm run test:integration
```

Bank selection is an *intent only*. Bank API responds 503 until a signed provider webhook/settlement is implemented and validated. Do not use screenshots to mark paid.

## Security and launch blockers

- Only loopback bind by default. No production LAN yet: authorized devices, mutual trust certificates and rate limits need independent security acceptance.
- Staff session token is in app memory; Web POS/Owner tokens held in sessionStorage in pilot (production calls for hardened session/PKCE or secured desktop token handling).
- Server startup refuses weak/blank initial PIN. Configure secure env and Windows service install before using real funds.
- Cloud remote Owner dashboard, provider reconciliation, compliant e-invoice, full backup/restore, real phone/thermal printer/load acceptance are unfinished. Keep M5/M6 NOT CLOSED.

## Verified bank-bridge handoff (not direct provider)

Bank requests use a unique opaque transfer reference, account number, bank code and exact amount. Configure `BANK_CODE`, `BANK_ACCOUNT_NUMBER`, `BANK_BRIDGE_SECRET` (at least 32 random characters) to expose intent details. A **trusted server-side bank adapter** must verify its *provider-specific* webhook first, then send `POST /v1/internal/bank-events` with `x-bmc-timestamp` (Unix milliseconds), `x-bmc-signature` = lowercase hex HMAC-SHA256(secret, timestamp + '.' + JSON serialized body). Body: `{provider_tx_id,reference,bank_code,account_number,amount_vnd,direction:'CREDIT'}`. Retries of a provider transaction ID are deduplicated. Wrong amount/destination/unmatched/settled orders go to an exception ledger; owner can query `GET /v1/owner/bank-exceptions`. Never expose bridge secret to either frontend and never send bank webhook data directly from a mobile client. **Provider verification and event sender implementation remain pending** and there is no generated bank QR until provider setup is confirmed.

## Staff ↔ POS trusted TLS and device enrollment

Hub serves HTTPS when configured with `HUB_TLS_CERT_PATH` and `HUB_TLS_KEY_PATH`. For store LAN, use `HUB_BIND_HOST=0.0.0.0`, `PAIRING_ENFORCED=1`, a device-trusted certificate with matching IP/DNS SAN, and a restricted firewall. Owner UI **Nhân viên → Thiết bị nhân viên** issues codes valid for three minutes. Each code pairs one staff login/device. Owner can revoke an individual device immediately, which invalidates bound sessions.

The Expo Staff app stores the issued device secret with Expo SecureStore, while keeping the normal login token only in memory. Release builds reject non-HTTPS `EXPO_PUBLIC_HUB_URL`. Isolated development may set `EXPO_PUBLIC_ALLOW_INSECURE_DEV=1` only while the app is in native development mode, never for real transactions. Do not bypass certificate verification. Still required before go-live: actual Android/iOS trusted certificate onboarding, device revocation drill, firewall validation, print hardware and WAN-down recovery test.

## Mobile durable create-order recovery

Expo Staff uses local device SQLite (`expo-sqlite`) to **persist the immutable order payload and idempotency key before sending the request**. Only one unresolved submission is allowed on one device. When the app restarts, the employee reauthenticates and sees a recovery screen; the app retries the exact previous payload and key instead of creating a new order. Different employees cannot resolve one another's pending drafts. A deterministic Hub validation error is cleared; network timeout/5xx/auth expiry remains uncertain and requires the original staff member to retry after restoring connection. After server ACK, the local pending record is deleted. Phone database corruption must never silently drop a possibly committed order; cashier should check POS instead.

The cached record can include food notes; do not enter customers' sensitive identifiers into order notes. SQLite persistence is not a substitute for OS device encryption, managed devices or in-store access control. Verify app-kill mid-request and reconnection tests on real Android/iOS and compare POS order IDs/receipt counts before production.

## ESC/POS network spool fault safety

Receipt jobs are journaled in SQLite `receipt_print_attempts` before contacting the printer. Each completed order still creates only two original receipt intents (CUSTOMER, STORE). An attempt enters `UNKNOWN` *before* network I/O; a successful TCP send changes the attempt to `SENT`, which is **not** proof of physical paper or cut. Failed/partial sends remain UNKNOWN and never auto-retry. Cashiers must inspect paper and explicitly request an audited watermarked reprint. Reprinting an already-queued receipt is rejected with `RECEIPT_ALREADY_QUEUED`. An in-flight send cannot override a subsequent explicit reprint request. Simulation: `npm run test:integration` includes a virtual TCP printer, network refusal and reprint race tests; a specific hardware model and its paper-out/cutter must still be verified in shop.
