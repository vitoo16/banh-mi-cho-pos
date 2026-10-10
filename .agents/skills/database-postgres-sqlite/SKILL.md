---
name: database-postgres-sqlite
description: Use for schema, transaction, migrations, indexing, query tuning or backup.
---

# SQLite + PostgreSQL persistence

**Trigger:** Use for schema, transaction, migrations, indexing, query tuning or backup.

## Mandatory task instructions

1. Read ARCHITECTURE.md persistence section; local SQLite owns orders/cash, cloud Postgres owns external captures/reports.
2. SQLite WAL + integrity/foreign-key checks + durable atomic outbox. Bound writer contention and use correct transaction isolation.
3. PostgreSQL unique constraints for provider transaction IDs and allocation, append-only audit, composite indexes for cursors.
4. Check EXPLAIN on realistic generated data, migration up/down behavior and backup restore; never assume row deletion on finance data.
5. If optimizing DB, show baseline and post-change p95/EXPLAIN results, not invented percentages.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
