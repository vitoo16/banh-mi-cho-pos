# DEPLOY & RUN FREE-TEST — BÁNH MÌ CHỢ POS

**Checked:** 12/10/2026 | **Scope:** free-tier demo / local CASH pilot **only**, not production.

## 1. Is backend already deployed?

**No verified public deployment URL exists in this repository.** The code includes Store Hub, Cloud API, CI and environment examples, but no checked-in public deployment configuration or proof of a running public backend. Do not mistake CI success or `https://your-cloud.example` for an actual deployment.

There are **two backends**:
- **Store Hub** `apps/store-hub`: authoritative SQLite, orders, CASH ledger, printer jobs, local availability. Runs **on store Windows PC**, $0 external hosting. Never run Hub on ephemeral free PaaS; it needs local LAN, reliable SQLite persistence and direct printer connection.
- **Cloud API** `apps/cloud-api`: optional remote reporting/sync and gated provider webhook. Uses **PostgreSQL**, not the local store SQLite. Can be evaluated on free cloud hosting *for synthetic data only*.

## 2. Recommended no-hosting-cost CASH demo (first)

Use **local Store Hub + POS Web + Owner Web** on one Windows/development PC, and Expo Staff in isolated test Wi-Fi.

From monorepo root with Node **24+**:

```bash
npm install
npm run build -w @bmc/contracts
npm run dev:hub
```

Open separate terminals at the same **repo root**:

```bash
npm run dev:pos
npm run dev:owner
npm run dev:mobile
```

Configure `apps/store-hub/.env` based on `apps/store-hub/.env.example` **before** first Hub boot; explicitly load real environment variables in the start process. Owner/Cashier/Staff PINs are unique test values, `SEED_DEMO_CATALOG=1` is DEMO only. Default Hub host is `127.0.0.1:4400`; POS/Owner at localhost **5173/5174** use Vite proxy `/v1` to that Hub. `localhost` ports are not public URLs.

For a physical Staff device: configure `EXPO_PUBLIC_HUB_URL` for reachable Hub DNS/IP; use trusted HTTPS/TLS and Owner-issued pairing code. The dev-only opt-in `EXPO_PUBLIC_ALLOW_INSECURE_DEV=1` + isolated Wi-Fi is **not** acceptable for live transactions. Pair 4–8 devices only after TLS/firewall policy validation.

## 3. Cloud demo for $0 hosting — optional

As of **12 October 2026**, one practical trial combination is:

- **Render Free web service** for Node/Nest Cloud API. See https://render.com/docs/free . Render spins idle free services down after 15 minutes and they may take about a minute to restart; no persistent local disk. These are *not recommended by Render for production*.
- **Neon Free PostgreSQL** for cloud data. See https://neon.com/pricing . As of October 2026, the free allowance is **1 GB/project** (subject to fair-use and policy changes). Neon is independent of Render.

**DO NOT use Render's Free PostgreSQL for merchant history:** its free databases expire after 30 days and have no included backups. Render also limits free hours and bandwidth; see official free-tier rules. Free infrastructure can sleep, disconnect, rate-limit or change its conditions; treat it as **test-only**.

### Step A — Cloud Postgres

Create a dedicated **test** database on Neon, get its PostgreSQL `DATABASE_URL` from the Neon dashboard (do not paste it into chat, docs, GitHub, Web frontend or Expo). Require encrypted PostgreSQL transport, check provider CA/certificate trust, and ensure credentials are managed in Render environment variables. Do not insert real store/customer data.

### Step B — Create Render Web Service

1. Connect GitHub repository `vitoo16/banh-mi-cho-pos` to Render via the Render dashboard (account connection and deploy are a **user-controlled step**, not performed by committing docs).
2. Choose **Web Service**, **Free**, Node runtime, **repository root** as the build context so npm workspaces resolve correctly.
3. **Build Command:**
   ```bash
   npm install --no-audit --no-fund && npm run build -w @bmc/contracts && npm run build -w @bmc/cloud-api
   ```
4. **Start Command:** `npm run start -w @bmc/cloud-api`
5. Configure Render environment (server-only; values are secrets, not sample placeholders in committed files):

   | Key | Purpose |
   | --- | --- |
   | `DATABASE_URL` | Neon PostgreSQL connection string, TLS-enforced |
   | `CLOUD_STORE_ID` | Stable identifier, must match Hub |
   | `CLOUD_SYNC_SECRET` | Strong random **≥32 characters**, same as Hub outbound sync |
   | `CLOUD_OWNER_LOGIN_SECRET` | Different strong random **≥16 characters**, Cloud Owner auth |
   | `CLOUD_BIND_HOST` | `0.0.0.0` for cloud container only |
   | `CLOUD_PORT` | Match platform HTTP ingress port; e.g. `10000` if Render uses it (check Render setting) |
   | `CLOUD_TLS_TERMINATED` | `1` only behind trusted platform HTTPS ingress |
   | `CLOUD_ALLOWED_ORIGIN` | Exact HTTPS URL of separately deployed Owner Web |
   | `CLOUD_PG_SSL` | `1` only when verified provider CA trust is correct |
   
   Do not set `SEPAY_WEBHOOK_SECRET`, `BANK_BRIDGE_SECRET` or `ENABLE_VERIFIED_BANK_INBOX=1` without verified merchant onboarding/sandbox tests. `CLOUD_ALLOWED_ORIGIN` is not a wildcard.

6. Deploy; check Render logs and a safe Cloud health endpoint (if provided), not just a green build. Use the actual Render-assigned `https://...onrender.com` endpoint only after it has appeared in your dashboard.

**Not yet done:** There is no Render service ID, assigned URL, Neon database ID or successful external request verified by this repository. This guide does **not** claim a deployment succeeded.

### Step C — Owner remote Web

Owner Web is a **separate Vite static build**, not the Cloud API server. For remote mode set the **public** build variable `VITE_CLOUD_API_URL=https://ACTUAL-CLOUD-API-URL` (not a credential), then:

```bash
npm run build -w @bmc/contracts
npm run build -w @bmc/web-owner
```

Publish `apps/web-owner/dist` to a static HTTPS hosting service, with SPA fallback to `index.html` for Owner's `/sales`, `/catalog`, etc. Configure Cloud's `CLOUD_ALLOWED_ORIGIN` to this exact published Owner origin, redeploy/restart Cloud safely. **Do not deploy POS Web as a public cashier page.** POS local uses Hub-proxied `/v1`.

### Step D — Optional outbound Store Hub sync

Only in a supervised test environment, set on Hub: `CLOUD_SYNC_URL=https://ACTUAL-CLOUD-API-URL`, matching `CLOUD_STORE_ID`, matching server-only `CLOUD_SYNC_SECRET`. Hub makes **outbound** HTTPS requests, and PostgreSQL stores a mirror of local activity. Cloud Owner may be stale if disconnected or if Free service sleeps. Verify one synthetic order and Cloud reporting before relying on results. There is no need to expose the SQLite Hub or its cash endpoints to the public Internet.

## 4. What is free / what is still not production-ready?

| Item | Can demo free? | Production condition |
| --- | --- | --- |
| Local Hub + web on existing PC | Yes; no cloud hosting fee | Windows service/restart, UPS/backup, trusted LAN TLS, hardware UAT |
| Staff Expo app | Yes with development build and test LAN | Signed builds, trust chain, revocation, real devices |
| Render Cloud API | Yes within Free quotas | Always-available hosting, HTTPS, capacity, monitoring, backups |
| Neon PostgreSQL | Yes within Free quotas | Database backups, persistence/SLA, secret rotation and restore drill |
| SePay BANK | **No verified merchant integration claimed** | Signed real sandbox/provider events + bank reconciliation |
| Printer 80mm | TCP simulator exists | Real paper-out, 2 copies, character rendering, drawer |
| Public cashier page | **Do not deploy publicly** | Store-bound Hub and strictly controlled trust |

## 5. Go-live blockers before any real payments

Use `docs/qa/ACCEPTANCE.md`, `docs/ops/RUNBOOK.md`, `docs/ops/LOCAL_PILOT.md` and `docs/ops/CLOUD_SYNC_RUNBOOK.md`. Required: authenticated 4–8 Staff devices over real secure LAN, 80mm printer/paper-out, Windows startup and loss/recovery drills, encrypted off-host backups + alerting, bank provider settlement verification, audit/receipt/tax requirements and written owner acceptance.

**Documentation is not deployment.** A successful GitHub CI does not generate Render/Neon resources or make any service public.
