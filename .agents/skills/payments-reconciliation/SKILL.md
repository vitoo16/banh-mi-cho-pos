---
name: payments-reconciliation
description: Use for VietQR/bank payment intents, provider adapters, callback/security and reconciliation.
---

# Bank QR and webhook settlement

**Trigger:** Use for VietQR/bank payment intents, provider adapters, callback/security and reconciliation.

## Mandatory task instructions

1. No provider adapter is considered production-ready before supported bank/account eligibility, signed webhook docs, fee terms and sandbox evidence.
2. Unique QR reference per intent, bank account/direction/amount/reference verify; provider transaction unique ID and replay protections.
3. Over/underpayments go to exception/suspense, not silent paid state. Duplicate webhook creates one capture only.
4. Provider confirmation authoritative on cloud; never accept mobile screenshot/manual staff PAID. Cloud->Hub inbox correlation supports delayed order sync.
5. Test invalid signature, old timestamp, wrong bank account, unmatched reference, duplicate, callback-before-order, bank timeout, refund and app used to scan VietQR.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
