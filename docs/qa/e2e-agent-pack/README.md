# Bánh Mì Chợ POS — Senior E2E QA Agent Pack

This pack is QA tooling and documentation, not proof of passing E2E or production readiness.

## Start here
1. Give the Agent AGENT_PROMPT.md and require it to follow Phase 0 onward. It must read governing repository docs and local skills before code changes or seeding.
2. Reconcile TEST_MATRIX.md against the current API contract/source; it is an initial acceptance inventory, not a substitute for source audit.
3. Review the four .env.sample files. Generate unique local QA secrets; never commit actual .env files or placeholders as passwords.
4. Review seed-e2e.mjs before running. It requires four distinct PINs >=12 characters, explicit seed guards, loopback Hub and empty history. One-shot, fresh disposable DB only.

## Contents
- AGENT_PROMPT.md — read-docs-first, audit-then-execute instructions.
- TEST_MATRIX.md — P0/P1 acceptance cases.
- seed-e2e.mjs — API seed; business records are created through real Hub endpoints.
- store-hub.env.sample — isolated local Store Hub.
- cloud-api.env.sample — optional isolated Cloud/PostgreSQL.
- mobile-staff.env.sample — development-only mobile sample.
- e2e-seed.env.sample — seed safety flags and local inputs.

## Safe local outline
1. Prove the SQLite path is disposable; create a new empty DB in a QA-only directory.
2. Build packages and verify actual env loading. dotenv/config may not find apps/store-hub/.env when launched from monorepo root; use an explicit Node --env-file path if needed.
3. Start Hub on 127.0.0.1:4400 and verify /v1/health.
4. Export unique BOOTSTRAP_OWNER_PIN, BOOTSTRAP_CASHIER_PIN, BOOTSTRAP_STAFF_PIN, E2E_EXTRA_STAFF_PIN, E2E_ALLOW_SEED=YES, E2E_ISOLATED_DB_MARKER=BMC_E2E_DISPOSABLE and E2E_SEED_ORDERS=340.
5. Run node seed-e2e.mjs and keep e2e-seed-report.json local. Reconcile it against API and read-only SQL.
6. Never configure real bank credentials, SePay, production Cloud, customer data, shop DB or physical printer in the default automated run. Stop if isolation cannot be proved.
