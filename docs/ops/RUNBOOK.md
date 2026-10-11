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

`npm run backup:store -- /secure/backup.sqlite` uses `VACUUM INTO` for a **self-contained SQLite WAL snapshot** and creates a *paired* `backup.sqlite.manifest.json` (format version 1, creation timestamp, filename, byte length, SHA-256, SQLite schema user_version, row counts for orders/payments/receipts/outbox/idempotency/audit/shifts/cash movements). Both files are required. A backup or manifest that already exists is never overwritten. A newly written manifest is published only after the database is fsynced, inspected and hashed.

`npm run verify:backup -- /secure/backup.sqlite` now **fails closed** if the manifest is missing, malformed, for a different filename, or has incorrect file size, SHA-256, schema version, or financial row counts. It also checks SQLite integrity, foreign keys, and required tables. Existing backup files created before the manifest feature must be treated as *legacy / unverified*, preserved for forensic recovery, and must **not** be silently upgraded or switched into production.

`npm run restore:copy -- /secure/backup.sqlite /isolated-restore/pos.sqlite` first verifies the **source manifest and source SQLite**, before creating any destination. It then copies into a new filename only, writes a new matching sidecar for the restored copy with original snapshot time and source filename, and verifies the result. Both destination file and sidecar must not exist. Refusing overwrite is deliberate. The tests check changed database bytes, metadata tampering, missing manifests, restore attempts against corrupted inputs, full WAL order/cash/receipt snapshot recovery, same-key replay and the explicit post-snapshot RPO boundary.

**A SHA-256 sidecar is corruption detection, not authenticity or encryption.** Anyone who can rewrite both SQLite and its plain JSON sidecar can forge matching checksums. Real backups must be protected through encrypted off-host storage with separate restricted access, trustworthy signed/audited backup metadata or storage versioning, Windows ACL controls, and retention/rotation. The script intentionally does not implement encrypted storage, key management, signatures, in-place restore or scheduled backups. Copy **both** files together; never distribute the plain SQLite or manifest through public channels. Once the restored database is opened for live writes, its snapshot manifest becomes archival provenance and is no longer a checksum of the now-changing active ledger.

**Disaster cutover remains supervised:** stop the Windows Store Hub service, preserve the original live `.sqlite`, `-wal` and `-shm` files, take a forensic copy, rehearse restore on a separate directory/machine, and reconcile any accepted transactions after snapshot against cloud/bank/provider and receipt logs. Only then should an authorized operator select the new database path. This tool intentionally has NO in-place restore command. Backup and restored files are plaintext and require encrypted storage/off-host rotation/Windows ACL policies; this tool does not itself encrypt. RPO/RTO targets require separate real drills.
