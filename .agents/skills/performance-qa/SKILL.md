---
name: performance-qa
description: Use for profiling, load tests, React rerenders, SQL tuning and release gating.
---

# Perf budgets, fault injection and evidence

**Trigger:** Use for profiling, load tests, React rerenders, SQL tuning and release gating.

## Mandatory task instructions

1. Read docs/qa/ACCEPTANCE.md; never claim planned targets were measured. Record device/hardware/environment/test tool/seed.
2. Simulate 8 clients and >=150 orders/hour plus 10x short burst to probe tail latency; 0 duplicate/lost financial events is higher priority than p95.
3. Measure LAN order commit p95, DB queue depth, synced events, printer unknown queue, JS bundle and mobile UI responsiveness.
4. Reproduce outage tests: WAN down, printer mid-copy, app restart, power-loss simulation, cloud callback lag, retry.
5. Independent QA checks real native phones and 80mm physical receipts before signoff. Store raw logs/screenshots redacted in CI artifacts.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
