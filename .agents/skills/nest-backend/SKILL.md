---
name: nest-backend
description: Use for NestJS cloud/hub controllers, services, DTO validation, guards and module boundaries.
---

# NestJS backend engineering

**Trigger:** Use for NestJS cloud/hub controllers, services, DTO validation, guards and module boundaries.

## Mandatory task instructions

1. Read ADR-001 and BACKEND_PLAN.md; ensure `@nestjs/platform-fastify` adapter is compatible before enabling.
2. Organize modules by business domain (Orders, Payments, CashShifts, Catalog, Sync, Receipts), not one giant controller or premature microservices.
3. Use typed DTOs and OpenAPI from agreed contract; enforce authz on server for every write, idempotency on financial mutations.
4. Persist cash/order atomically and ACK only after committed DB transaction; publish outbox events in same transaction.
5. Implement integration tests against real SQLite/Postgres adapters; include retries and denied users; never present docs-only checks as backend tests.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
