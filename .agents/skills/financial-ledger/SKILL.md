---
name: financial-ledger
description: Use whenever implementing prices, cash tender/change, payment status, refunds, shifts or reporting.
---

# Exact VND money & cash ledger

**Trigger:** Use whenever implementing prices, cash tender/change, payment status, refunds, shifts or reporting.

## Mandatory task instructions

1. Read ADR-002 and spec cash sections. All money VND int in JS safe range; do not float, parse price from client, or let user flip PAID.
2. Separate requested payment intent from actual confirmed capture allocations. Only successful bank provider evidence/authorized cashier capture settles.
3. Keep append-only cash in/out events, opening float, close expected and counted variance. No database edit to fix cash difference.
4. Mixed payments behind server flag; no double count when MoMo app pays into bank using VietQR.
5. Test double-click, idempotency replay, wrong shift, refund, partial/over/underpayment, mutation of old order snapshots; block merge if invariant fails.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
