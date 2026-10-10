# Parallel FE/BE execution — mutual dependency plan

## Critical rule
**Design contracts and fixtures first, then two independent execution streams; integrate at pre-planned checkpoints.** No FE branch may invent REST payloads; no BE branch may rename fields without first updating OpenAPI and golden fixtures.

```text
             [M0 POC + ADR] -----------+
                       |                |
          [M1 OpenAPI / fixtures] ------+
               |              |
       [Backend stream]      [Frontend stream]
         hub/cloud             Web POS / Owner + RN Staff
             |                    |
             +---- INT-01 Order --+
             |                    |
             +---- INT-02 Cash ---+
             |                    |
             +---- INT-03 Bank ---+
                       |
            [QA Fault/Perf/Security]
                       |
              [Pilot acceptance]
```

## Interface agreements required at M1

| Topic | Backend deliverable | Frontend parallel deliverable | Integration gate |
|---|---|---|---|
| Identity/auth | Session/RBAC/device pairing schema and errors | Login UI, 401/403/expiry handling from mock | AUTH-01 |
| Catalog | GET versions, change history, signed price snapshot | RN item list/name/price/qty + Owner editor | CAT-01 |
| Orders | Idempotent commit, lines, `requested_payment_method`, pagination/events | RN save/retry and POS list/search | ORD-01 |
| Cash | shift/open/tender/change/ledger API, money ints | Large tender/change checkout and shift screens | CASH-01 |
| Receipt | batch/copies and print/reprint event status | printer error/unknown/reprint UI | PRINT-01 |
| Bank | intent/webhook/settlement/exception, no fake settle | QR pending/timeout/verified UI | BANK-01 |
| Reporting | verified allocation aggregation and freshness timestamp | charts/totals/staleness banners | RPT-01 |

## Branch ownership and coordination

- `feat/be-*`: BE changes; never modify FE UI components without coordination.
- `feat/web-*`: POS/Owner changes; build using generated client + MSW fixtures.
- `feat/mobile-*`: RN changes; use contract fixtures, RN network/permission POC.
- `contract/*`: schemas + type generation + shared mocks **reviewed by BE+both FE leads before merge**.
- `int/*`: glue / integration only after component PRs pass, resolve contract mismatches rather than raw `any`/casts.
- One PR per vertical task, not long-lived branches. Avoid simultaneous writes to contract files from multiple lanes.

## Concrete work order with maximal parallelism

| Wave | Backend | Web POS/Owner | React Native Staff | Shared gate |
|---|---|---|---|---|
| 0 | Verify SQLite/print bank adapter POC | Vite kiosk printer UI mock | Expo dev build LAN pairing POC | M0 no-go if blocked |
| 1 | Domain + migrations + local/cloud API skeleton | Wireframes/design system/routing | Screens/navigation/accessibility skeleton | M1 contract signed |
| 2 | BE-01..04 orders/catalog | FW-01..02 order list/catalog settings | FM-01..02 menu/cart/save/method | INT-01 eight simultaneous saves |
| 3 | BE-05..07 cash/receipt | FW-03..04 cash checkout/shift | Saved state/reconnect polish | INT-02 counts, printer fault |
| 4 | BE-08..10 bank/sync/reports | FW-05..06 bank QR/owner dashboards | Payment result views (read-only) | INT-03 verified captures |
| 5 | Resilience/security fixes | UX/perf fixes | Low-end mobile/perf fixes | M5/M6 full gates |

## No-contract-drift rules
1. OpenAPI is source-of-truth for transport; use generated SDK in both web + RN; domain rules live in shared pure TS tests.
2. Storybook/MSW/mock responses are derived from contract fixture files; mock-paid events must be visibly simulation-only.
3. Breaking schema changes require ADR/contract PR and changelog; make additive changes when possible.
4. Server sets authoritative total and rejects stale catalog where price differs; UI shows refresh not silently overwriting cart price.
5. Integration PR contains proof of same `order_id` lifecycle RN->hub->POS->cloud->owner, plus duplicate/timeout negative case.
6. No manual workarounds (direct DB edits or UI toggling PAID) to make a demo pass.

## Roles when using AI agents
- ARCHITECT plans/specs/contracts and detects cross-stream collisions.
- BE IMPLEMENTER owns order persistence, money, cloud/hub and tests.
- WEB IMPLEMENTER owns Vite POS + Owner workflows.
- MOBILE IMPLEMENTER owns Expo RN staff flows.
- AUDITOR reads actual diffs/results with no self-attestation; QA runs real physical tests.
- RELEASE CONTROLLER merges only green gates with hardware + owner evidence.

## Merge sequencing example
Contract PR -> BE-03, FW-01, FM-01 PRs parallel -> INT-01 PR -> release branch. For cash: ledger contract PR -> BE-05/06/07 and FW-03/04 parallel -> INT-02 PR. Bank QR behind integration flag until bank-specific evidence. Owner app cannot claim LIVE data if sync lagged.
