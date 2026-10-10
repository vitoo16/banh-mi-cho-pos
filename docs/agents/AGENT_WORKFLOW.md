# AGENT WORKFLOW — contract-first, parallel delivery, independent audit

**Status: policy for future agents, not an executed session.** Apply whether implementation runs in Codex, Claude Code, Cursor or another AI IDE.

## 0. Agent roles (no self-certification)
- **Architect / planner:** own ADRs, contract boundaries, sequence tasks and decide if a change respects spec v1.2. Can stop implementation on unresolved policy.
- **Backend implementer:** owns Nest cloud/hub, DB, payments, printing, sync and unit/integration evidence.
- **Web implementer:** owns React/Vite POS and Owner, UI tests and accessibility evidence.
- **Mobile implementer:** owns RN/Expo staff, LAN pairing tests and native builds.
- **Auditor:** independently reads diff, requirements and actual test logs; cannot assume implementer's written claims are true.
- **Business acceptance:** cashier/operator validates printer, drawer, money-count and order speed at the actual store.

If user assigns models (Astra reviewer, Sol builder or others) map models to **roles**, not authorities. No model can bypass real-device acceptance or claim test results from documentation only.

## 1. Mandatory skill loading matrix

At the start of every task:
1. Read root `AGENTS.md` and baseline spec/architecture/API.
2. Locate project skill files below and READ the full relevant `SKILL.md` before implementation. List loaded skills in PR.
3. For **web work**, additionally load [Vercel React Best Practices](https://github.com/vercel-labs/agent-skills) after trusted installation/review.
4. For **mobile work**, additionally load [Expo official skills](https://github.com/expo/skills) (`expo-overview`, relevant project/router/native skills) and Vercel React Native guidance.
5. For backend, follow official NestJS Fastify/OpenAPI docs + project-local backend/payment/DB skills. Do not blindly install arbitrary third-party skills.

| Task category | Required local skills | External skills (review before install) |
|---|---|---|
| BE Nest API/domain | `nest-backend`, `financial-ledger`, `contract-first`, `security-review` | NestJS official docs / OWASP cheat sheets |
| DB migrations/performance | `database-postgres-sqlite`, `financial-ledger` | PostgreSQL docs / SQLite WAL docs |
| POS printing | `printer-escpos`, `financial-ledger`, `offline-lan` | Printer manufacturer SDK for purchased model |
| Bank integration | `payments-reconciliation`, `financial-ledger`, `security-review` | Official bank/provider webhook docs only |
| Vite cashier/owner | `vite-react-frontend`, `contract-first`, `performance-qa` | Vercel `react-best-practices` |
| RN staff | `expo-react-native`, `offline-lan`, `contract-first`, `performance-qa` | Expo official `expo-overview`, project/router; Vercel `react-native-skills` |
| Offline/sync | `offline-lan`, `database-postgres-sqlite`, `security-review` | Expo native network docs |
| Audit/release | `security-review`, `performance-qa`, plus all touched domain skills | Independent source/evidence review |

**Trusted install examples for local developer (choose your own agent, inspect upstream commit before install):**

```bash
npx skills@latest add expo/skills --skill 'expo-overview'
npx skills@latest add expo/skills --skill 'expo-project-structure'
npx skills@latest add vercel-labs/agent-skills --skill 'react-best-practices'
npx skills@latest add vercel-labs/agent-skills --skill 'react-native-skills'
```

Versions are **not pinned by these examples**; for reproducible development choose an audited commit/registry version and record in a lock document before team installation. If the CLI rejects a skill name because upstream renamed it, follow current official manifest and document equivalent — never invent success.

## 2. Strict per-task workflow

**Intake -> inspect code -> load skills -> plan -> tests -> implement -> verify -> independent audit -> PR -> integration -> acceptance -> merge.**

### Step A: source reconnaissance
- Find current branch/commit, inspect touched files/migrations/tests/PRs; check open blockers and previous milestone evidence.
- Identify task ID and precise input/output contracts. If codebase absent, mark as planning/scaffold; no synthetic tests.
- Identify business invariant and which local skills apply, open exact skill files.

### Step B: implementation plan
- Write short change plan: files, schema/API affected, migration, security, offline behavior, printer/money hazards, tests, rollback.
- Contract changes get separate `contract/*` PR before BE/FE start depending on them.
- If requirements conflict with v1.2, stop, propose ADR and owner approval. Never re-add stock/KDS/workflow from v1.

### Step C: execute smallest vertical slice
- Unit tests for pure money/domain, integration tests for write transactions/idempotency, mocked clients FE tests; avoid adding unrelated abstractions.
- Validate FE with generated types and MSW; verify BE Postgres+SQLite migrations, event shapes and serialized values.
- Ensure external payment adapters disabled-by-default and test only sandbox/fixtures before provider access.

### Step D: auditable evidence
- Report **commands actually run**, exit status, test count, screenshots where needed, load histogram, migrations, warnings, untested scenarios.
- Never say test passed when only written, skipped or blocked by missing Windows printer/native phone.
- Audit money invariants, authz, replay, reprint, pair/revoke, backup/restore and stale cloud dashboard.
- Evidence points to CI run logs and reproducible steps; reviewer investigates failures and regression changes.

### Step E: independent source audit and release
- Auditor produces findings ranked BLOCKER/HIGH/MEDIUM/LOW with file paths, reproduction, remediation and resulting gate status.
- HIGH/BLOCKER stops merge; unresolved MEDIUM requires explicit risk acceptance from owner and task status remains NOT CLOSED where gates require it.
- Real hardware acceptance performed by human/operator, not inferred from screenshot of browser mock.
- Merge only after green required checks, conflict resolution, branch up-to-date, reviewed PR and no secret spill.

## 3. Parallel collaboration guardrails

- **One schema owner at a time:** API/DTO changes on `contract/*`; share generated clients; no silent manual FE patch.
- BE, Web, RN implement in independent workspaces/branches after contract freeze; integration waves INT-01, INT-02, INT-03 (see `PARALLEL_EXECUTION.md`).
- QA's golden fixture tests act as cross-lane semaphores: build cannot pass until server and client agree on snapshots/status.
- Feature gates: `MOMO` and `MIXED` hidden server/client until owner + merchant conditions approved.
- Hard code freeze on money state machine before cashier pilot, exceptions handled by compensation events not post-hoc mutation.

## 4. Prompts usable with engineering agents

### Planning/architecture agent
```text
Read AGENTS.md and docs/spec/MVP-v1.2.md, ARCHITECTURE.md, API_CONTRACT.md,
MASTER_PLAN.md, PARALLEL_EXECUTION.md and all task-relevant .agents/skills.
Audit repo state and current changes before planning. Confirm tasks do not introduce
inventory, KDS, prep stages or extra printers. Produce a dependency ordered plan
with one owner per contract, exact files, tests, offline cases, and gate blockers.
Do not change financial policy on your own and do not mark any untested gate CLOSED.
```

### Backend implementation agent
```text
Act as Backend Implementer. Inspect current repository state, read mandatory docs
and .agents/skills/nest-backend, financial-ledger, contract-first,
database-postgres-sqlite, security-review; add printer/offline/payment skills if touched.
Implement ONLY the assigned BE task following frozen OpenAPI. Use VND integers,
authoritative DB commits before ACK, idempotency and audit for money paths.
Write negative integration tests and show actual command results. Make a small PR;
if real printer/provider/phone is required but unavailable, mark hardware gate BLOCKED.
```

### Web implementation agent
```text
Act as Web Implementer for Vite React POS/Owner. Read AGENTS.md, spec v1.2,
contracts and .agents/skills/vite-react-frontend, contract-first, performance-qa
plus reviewed Vercel react-best-practices. Use generated types and MSW fixtures.
Never let staff/requested method imply PAID; never trigger payments/printing on render.
Implement task-scoped UI and Vitest/Playwright cases. Report bundle and UX evidence.
```

### Mobile implementation agent
```text
Act as React Native + Expo Implementer. Read AGENTS.md, spec v1.2,
contracts, .agents/skills/expo-react-native, offline-lan, contract-first,
performance-qa plus current official Expo and Vercel React Native skills.
Build name+price/qty/note/requested method with CASH default; do not add stock
or prep tracking. Save is confirmed only after Hub durable ACK. Test actual
Expo development build LAN pairing, WAN outage and duplicate tap before claiming done.
```

### Independent audit agent
```text
Act as independent audit. Do not trust implementer summaries. Read spec v1.2,
AGENTS.md, touched skill files, changed sources, tests and CI logs.
Find financial, sync, print, device auth, replay, concurrency and UX regressions.
Report exact evidence, blocker rank, reproducible steps and required corrections.
Do not merge or mark milestone CLOSED if applicable source, native device, physical
printer, bank sandbox, restore or cashier signoff evidence is missing.
```

## UI task specialization (2026-10-10)

UI work MUST additionally load `docs/ui/AGENT_UI_WORKFLOW.md`, `docs/ui/SCREEN_SPECS.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/UI_QA_MATRIX.md`, and `.agents/skills/mobile-first-operational-ui/SKILL.md`. The visual review agent loads `.agents/skills/ui-visual-audit/SKILL.md`. Vercel Web Interface/React/RN guidelines and Taste skill must be inspected and applied only where compatible with the approved operational UX and payment boundaries. Work is split into RN Staff and Web POS P0 in parallel after contract mocks, followed by Owner P1. One scoped implementation/review loop is expected; full-audit repetitions are not default.
