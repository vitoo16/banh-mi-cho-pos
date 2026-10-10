# Operations / deployment runbook (DRAFT, no deployment executed)

## Environments
Local dev: mock provider, local SQLite, ephemeral Postgres. Staging: real POS class hardware and printer but test QR/provider sandbox; masked synthetic money. Production: dedicated Windows POS with admin-locked service + cloud TLS/Postgres, approved provider, encrypted backups.

## Start of day
Cashier signs into Store Hub with dedicated role, opens shift, counts opening float; device/hub service health, printer paper, WAN status and bank provider status indicated. Staff pair/auth clients, load catalog version; owner can check sync freshness. No shift opened -> reject cash capture.

## During day
On printer error mark UNKNOWN, inspect physical copy count, authorized reprint with watermark/reason. Do not create duplicate payment. On bank provider outage QR disabled/pending; cash sales continue; bank proof screenshot not sufficient. If POS host fails, stop sales or apply approved manual contingency (contemporaneous records later reconciled) — don't let multiple phones independently allocate the same short code.

## Close day
Close accepting new cash shift payments, settle or separately record pending bank items, count cash by denominations, save actual count and variance, get owner review if variance; report cash vs verified bank, review unmatched intents and receipts with UNKNOWN status. Owner dashboard must flag last sync time. Printing paper totals are *not* ledger authority.

## Backups/recovery
Local encrypted rotating SQLite backups with integrity checks, secure off-host copy; cloud PITR/periodic Postgres backups per hosting support. Restore test on spare hardware before production. Proposed **RPO ≤15 minutes** and **RTO ≤2 hours** are targets subject to backups and hardware drill, not guarantees. Orders acknowledged only after local DB durable commit, but physical POS loss between backups may require outbox reconciliation. Do not overwrite current ledgers with older cloud snapshots. Full forensic and reconciliation review after any disaster restore.

## Incident severity
P0 duplicate money or unauthorized capture -> disable corresponding payment method, preserve logs, follow reconciliation SOP. P1 no print / hub down -> fallback cash log approved by owner and paused digital sale, restore. P2 owner report stale -> label STALE; keep local flow, investigate sync lag.

## Deployment gates
Staging signoffs for signed installer/runtime, autostart, least-privilege Windows service, firewall local-only, printer driver, UPS, bank integration sandbox, rollback path and DB migration backward compatibility. No production deploy/claim before all gates complete.

## Verified SQLite restoration rehearsal (implemented tool)

`npm run backup:store -- /secure/backup.sqlite` creates a **self-contained snapshot** using SQLite `VACUUM INTO`, then runs integrity and foreign-key checks. It refuses to overwrite an existing backup.

`npm run verify:backup -- /secure/backup.sqlite` validates backup integrity and required POS financial tables.

`npm run restore:copy -- /secure/backup.sqlite /isolated-restore/pos.sqlite` creates and validates a **NEW copy only**. This never overwrites the live `STORE_DB_PATH`, uses exclusive creation, verifies file SHA-256 and counts of orders, payments, receipts and outbox. Re-running against an existing destination fails closed. A corrupted source fails without creating a partial restored file. The integration test exercises backup with WAL, restored order + cash + receipts, preserved idempotency and unsent sync-outbox entries.

**Disaster cutover remains supervised:** stop the Windows Store Hub service, preserve the original live `.sqlite`, `-wal` and `-shm` files, take a forensic copy, rehearse restore on a separate directory/machine, and reconcile any accepted transactions after snapshot against cloud/bank/provider and receipt logs. Only then should an authorized operator select the new database path. This tool intentionally has NO in-place restore command. Backup and restored files are plaintext and require encrypted storage/off-host rotation/Windows ACL policies; this tool does not itself encrypt. RPO/RTO targets require separate real drills.
