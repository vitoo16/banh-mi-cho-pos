---
name: offline-lan
description: Use for local networking, Store Hub sync/outbox, offline conflicts and recovery.
---

# LAN-first offline and event sync

**Trigger:** Use for local networking, Store Hub sync/outbox, offline conflicts and recovery.

## Mandatory task instructions

1. Local hub authority only for local order/cash/receipt; cloud authority for verified bank/provider event. Document which data can be stale.
2. Durable local transaction with outbox event then ACK. Cloud processing idempotent by event_id and aggregate version; inbox replay guaranteed and observable.
3. Bank remains pending if provider verification unreachable. Never mark PAID offline based on screenshot, amount heuristic or client's state.
4. Test WAN disconnected 30 min while LAN connected; RN dev build and web POS still able to save cash orders and print.
5. Show owner dashboard last-sync-age; fail closed on missing keys or disk corruption; restore drill with actual machine.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
