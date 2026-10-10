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

## Secure staff phone enrollment over LAN HTTPS

**Development**: `ALLOW_INSECURE_LAN_DEV=1` may be used only on isolated dummy-data Wi-Fi. **Real operations** require `HUB_BIND_HOST=0.0.0.0` and direct TLS certificate/key via `LOCAL_TLS_CERT_PATH` and `LOCAL_TLS_KEY_PATH`. The certificate must cover LAN IP/hostname in SAN, and the issuing CA must be trusted by every Android/iOS staff handset. Never disable OS TLS verification to "fix" certificate errors. A front proxy mapping remote phones to localhost is not supported.

At localhost Owner → **Nhân viên** → **Điện thoại được ghép nối**, generate an eight-character code. On the Staff Expo development build configure `EXPO_PUBLIC_HUB_URL=https://<LAN-IP-or-host>:4400`, enter code + name. Successful pairing stores only the device token in SecureStore. Then employee logs in with their individual staff ID/PIN. Owner may revoke a phone immediately in the same screen; revoke invalidates any remaining session request for that device. Cashier/POS remain local-only for financial actions.

Security checks: TLS missing rejects remote bind, invalid/expired/replayed code denied, unpaired phone denied, revoked phone denied, mobile cashier/Owner access denied. Network integration and native certificate trust require real devices/Windows POC; Node integration tests only exercise domain logic, not actual Android trust store.
