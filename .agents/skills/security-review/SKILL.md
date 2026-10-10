---
name: security-review
description: Use for security-sensitive code, authz, CI dependency review and audit.
---

# Auth, payment and operational security

**Trigger:** Use for security-sensitive code, authz, CI dependency review and audit.

## Mandatory task instructions

1. Server role/store scope on all endpoints; staff cannot modify prices, mark payments, operate drawer or view full owner finance.
2. No banking/PIN/secret data in commits or logs; redaction, key rotation and principle of least privilege.
3. Device pairing over LAN with approved origin/cert trust model; revoke stale devices. Never ship an all-powerful shared device secret.
4. Signed/replay-proof provider callback, unique event constraints, manual adjustments require attribution/approval.
5. Verify tests for cross-store access, JWT expiry, CSRF/XSS where applicable, brute force, untrusted note injection into receipt and DoS.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
