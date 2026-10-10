# Backup and restore drill — Bánh Mì Chợ POS

**Operator requirement:** backup and restore must be tested on the exact Windows POS hardware. The scripts below create verified backup artifacts; **they do not overwrite the live store database**.

## Local Hub SQLite

Under a service account with private filesystem permissions:

```bash
export STORE_DB_PATH=./store-data/bmc.sqlite
export BMC_BACKUP_DIR=./backups
npm run backup:store
node scripts/verify-restore.mjs ./backups/bmc-<timestamp>.sqlite
```

- `backup-store.mjs` uses SQLite's online backup API; it writes a partial file, verifies `PRAGMA integrity_check` and necessary tables, renames after integrity passes, records SHA-256 and byte length in a manifest.
- `verify-restore.mjs` checks checksum and integrity on a disposable **copy**. No live restore is attempted.
- Backup encryption and offsite transfer/storage are **deployment prerequisites** (BitLocker encrypted volume / protected backup provider). Do NOT upload plaintext customer/financial DB into public repository or untrusted cloud drive.
- Schedule daily and before every DB migration, retain several generations and monitor missed runs. Choose and document explicit RPO/RTO after physical restore drill.
- **Actual restore:** stop Windows Hub service and all POS clients, make immutable copy of existing DB including WAL/SHM under approved runbook, restore previously verified `.sqlite` file into configured DB path under restrictive ACL, restart service, run `PRAGMA integrity_check` and match sample order/payment/shift counts, then allow cashier to resume. Never replace an open SQLite DB file.
- Cloud PostgreSQL backup/restore uses managed provider snapshots + authenticated `pg_dump` and point-in-time recovery where supported, with separate regular restore rehearsals.

Based on Node.js 24 `sqlite.backup()` documentation: https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
