# Architecture — MVP v1.2

## Decision: NestJS (Fastify adapter) instead of raw Express

Choose **NestJS** for module boundaries, explicit DI, validation, guards, OpenAPI, test isolation and multi-team FE/BE coordination. Use **Fastify adapter** at cloud + local hub after POC ensures plugin compatibility. For this store size, correctness, audits and observability outweigh microscopic request overhead. Do **not** split microservices. Two independently deployable Nest apps reuse pure domain code; no dependency on a cloud connection for the local cash sale.

## Topology

```text
Staff RN/Expo dev builds (4–8 phones) -- store Wi-Fi --> local Store Hub at cashier Windows POS
                                                            | SQLite WAL + sync outbox
POS Web (Vite React) -- localhost/private LAN ---------------| single cashier, local cash drawer
                                                            | ESC/POS print adapter -> 80mm printer
                                                            | authenticated sync (outbox/inbox)
                                                            v
Cloud NestJS API -- PostgreSQL -- owner React/Vite Dashboard
             | Payment intent provider + signed provider callbacks
             | payment/reconciliation events back to Store Hub
```

**Authority rules**
- Store Hub owns locally committed orders, cash captures, cash drawer movements, receipt intent/jobs and local pricing snapshot. It acknowledges only after durable SQLite commit.
- Cloud owns verified external bank/MoMo capture evidence, provider ledger, consolidated owner reporting, user/store configuration and remote audit replica.
- Cloud-originated bank settlement is replicated to the hub through authenticated ordered inbox events. A payment is shown paid only after authoritative settlement evidence, never client flags. Reconciliation/duplicates guarded by provider_transaction_id + allocation constraints.
- Remote catalog/role updates originate in cloud; the hub uses last signed/config-versioned snapshot when cloud unavailable. Price changes never rewrite historical order lines.
- Cloud dashboard displays **data freshness (last sync + stale/offline)**, not misleading real-time totals during disconnection.
- Bank intent may be created only when cloud reachable. Offline displays unavailable/pending; do not simulate success by accepting QR proof. Alternate manual exception subject to owner-approved policy only.

## Data flow for CASH
1. RN client builds order using catalog version, sends `Idempotency-Key` & item IDs/qty/note/requested method.
2. Hub validates session + owner price, commits order with UUID, display code, line-price snapshots and outbox event within one SQLite transaction. ACK then employee speaks to prep 1m away.
3. Cashier opens the order, enters cash tendered; backend calculates nonnegative change and atomically records immutable cash event/legs with `shift_id` and idempotency key.
4. A paid event drives receipt print batch + 2 copy jobs. Driver state may become `UNKNOWN` when printer is interrupted; reprint is operator-confirmed with watermark and audit.
5. Sync outbox to cloud asynchronously, replay safe using unique `event_id` and ordered per-aggregate sequence.

## Data flow for BANK
1. Employee marks BANK **requested**, order is still UNPAID.
2. Hub requests cloud bank payment intent with globally unique reference and expected remaining amount.
3. Cloud returns QR to POS; payment intent PENDING.
4. Callback validated using provider-defined signature/auth, timestamp/replay criteria, account, direction, currency/amount, reference; unique provider transaction ID; mismatch -> exception queue.
5. Cloud writes verified capture/allocation event transactionally, syncs to hub. Hub marks paid when sum of actual captured allocations matches due; any overpay stays liability/exception, not revenue.
6. Both receipt copies printed from the hub only once settlement confirmed. Callback arriving before local sync goes to a durable unmatched correlation queue, never silently lost.

## Offline + crash consistency
- Local hub bound to private interface only, paired device authentication, signed/versioned device configuration. No public port forwarding. RN device pairing/revocation and iOS/Android LAN permission behavior proven in M0.
- SQLite WAL + explicit transactions, foreign keys, busy-timeout, single logical write authority, checkpoint and backup verification. Disk full/unrecoverable errors -> read-only/stop sale; never ACK an uncommitted sale.
- Durable outbox with monotonic aggregate version, deterministic reconnect and duplicate suppression. Never last-write-wins for money.
- End-to-end idempotency and audit for retries from RN, POS, webhooks, print, cloud sync. Conflict reconciler cannot replace immutable settled values.
- Cashier device failure is a **single point of failure**. Document restore to spare Windows machine + decrypt/store safely; no claims of HA.
- Backup targets and RPO/RTO are proposed in `docs/ops/RUNBOOK.md`; must be verified on real hardware.

## Security
- Cloud RBAC enforced server-side; staff no price write, finance-wide read or paid write. Login/short-lived tokens, revocation and cashier shift lock.
- TLS cloud, explicit trust model for LAN connections, Windows OS firewall and minimum device secrets encrypted at rest; no fixed shared PIN in app or logs. Reject unknown devices.
- Webhook signature verification per chosen provider docs, payload hashing, replay window; manual reconciliation is four-eyes for material changes.
- Structured logs with `trace_id`, `order_id`, `shift_id` but no bank secrets/PII. Environment-specific credentials only in secret manager.
- Android/iOS backgrounding and LAN discovery/PWA constraints must be POC-tested. Staff React Native choice is final, so POC tests **Expo native development build**, not only Expo Go.

## Non-goals
No stock counts, kitchen workflow, bếp printing, loyalty, automated profits, multi-branch UI, customer profiles, deep accounting ledger or AI prediction in MVP.

## Architecture Decision Records
See `docs/decisions/ADR-001-stack.md`, `ADR-002-money-authority.md`, `OPEN_ITEMS.md`.
