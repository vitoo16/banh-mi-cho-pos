---
name: contract-first
description: Use when changing API, mobile/web data contracts, realtime events or DTOs.
---

# Contract-first API & event schema

**Trigger:** Use when changing API, mobile/web data contracts, realtime events or DTOs.

## Mandatory task instructions

1. Read docs/contracts/API_CONTRACT.md and openapi.yaml; update contract and fixtures BEFORE app code; get BE and both FE reviewers.
2. Clearly separate local hub vs cloud authoritative endpoints, actor roles, event version and error enums.
3. Generate TS clients for web/RN after contract is frozen; do not hand-copy untyped DTOs or silently cast unknowns.
4. Include Idempotency-Key header and response behavior, price version, cursor semantics, VND integer fields, requested vs captured method.
5. Run contract tests and report source/consumer compatibility; nonbackward change requires ADR and migration plan.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
