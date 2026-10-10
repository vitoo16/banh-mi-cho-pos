---
name: expo-react-native
description: Use for mobile screens, Expo Router, native networking, RN performance and mobile E2E.
---

# Expo React Native staff client

**Trigger:** Use for mobile screens, Expo Router, native networking, RN performance and mobile E2E.

## Mandatory task instructions

1. Read MOBILE_PLAN.md and Expo official `expo-overview`/relevant skills before RN changes; use Expo development builds and real-device POC.
2. Menu shows only name+price+qty; optional note; requested CASH default; BANK and feature-gated MOMO/MIXED; no stock or kitchen status.
3. Reuse stable idempotency key on retry; do not announce order saved until Hub durable ACK. Distinguish unknown ACK from confirmed.
4. Test native local network permissions, device pairing/revoke, WAN-down LAN-up, phone sleep/reconnect, repeated tap and delayed order feed.
5. Avoid list rerenders and non-accessible controls, keep good contrast/tap targets; exercise low-end hardware before accepting performance.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
