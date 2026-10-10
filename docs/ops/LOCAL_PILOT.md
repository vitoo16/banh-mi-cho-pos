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
