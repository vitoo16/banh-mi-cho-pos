# Pilot UAT sign-off — Bánh Mì Chợ POS

**Status:** NOT SIGNED / NOT PRODUCTION READY  
**Prepared:** 2026-11-02  
**Code under review:** PR #76 (`design/taste-be-vietnam-pro-foundation`); pin tested Git SHA before any run.  
**Scope:** One store; 4–8 order-taking phones; one cashier, one drawer, one 80mm printer. No kitchen/KDS/inventory workflow.

This is an **operator execution sheet**, not proof that any scenario has been run. CI's mock-browser, HTTP, Expo JS bundle and Windows backup/restore checks are separate evidence; they do not imply hardware, bank-provider, or visual acceptance.

## Test preconditions — do not use real money until signed

- [ ] Record tested SHA, versions, date, cashier, owner, tester, Windows/browser zoom and OS scaling, device models, Android/iOS versions, printer model and interface, Wi-Fi/LAN topology. Never write PINs, access tokens, customer data, bank credentials or actual private account identifiers here.
- [ ] Use a **dedicated demo store, synthetic orders and test credentials**. Confirm the Store Hub is running with durable SQLite on the store Windows machine, not on ephemeral cloud hosting.
- [ ] Capture a **verified backup and isolated restore rehearsal** first. Verify directory permissions, checksum/manifest, and backup freshness. Retain the original DB unchanged.
- [ ] Confirm shift permissions and employee PIN/device pairing by role. Staff must not have any payment-settlement or refund privileges.
- [ ] BANK provider/webhook may only be tested in an approved provider sandbox. Otherwise mark its verification row **BLOCKED**; no screenshot or unverified transfer may ever mark PAID.
- [ ] Have a rollback/stop-sale procedure: shut off unsafe feature, preserve Hub DB and logs, switch to documented manual operational procedure; never delete settled rows to reset a test.

## Evidence ledger — record actual outcomes

For each row: mark **PASS**, **FAIL**, **BLOCKED** or **NOT RUN**, and attach a private evidence reference (safe screenshot, sanitized event log, reconciled count, signed paper inspection). **PASS** needs observed behavior and result; missing equipment/provider access is BLOCKED, not PASS. Use fresh test orders; do not re-run a cash capture to test printer retry.

| ID | Operator exercise | Explicit pass criterion | Outcome / evidence |
|---|---|---|---|
| UAT-01 | Owner at 320/390/768/1366 CSS px; browser navigation, product editor, search, unsaved close/back, keyboard; browser 200% zoom | No clipped actions/totals, focus visible and not obscured, no silent draft loss; semantic links support open-in-new-tab | NOT RUN |
| UAT-02 | Cashier at 1024×768, 1280×720, 1366×768, 1920×1080; Windows 125% and 150% display scale, 200% browser zoom | Tender, change and primary cash action remain reachable; no horizontal page overflow; long Vietnamese names and large VND amounts remain legible | NOT RUN |
| UAT-03 | Staff on physical Android and iPhone (320–430dp equivalents), keyboard open, safe-area, 200% text, screen reader | Product names, quantity controls, notes, cart and Save remain reachable; 44–48dp targets and spoken labels are usable | NOT RUN |
| UAT-04 | Pair 4–8 employee devices; simultaneous creation and deliberate double-tap Save | One durable order per idempotency key, exactly one code and correct server-computed integer VND totals; no staff payment capture | NOT RUN |
| UAT-05 | Staff CASH request; cashier creates shift, accepts exact tender and overpayment (e.g. 100,000 for 90,000 VND) | Confirmed once; 10,000 VND change shown; ledger net 90,000; shift totals match verified capture | NOT RUN |
| UAT-06 | After cashier submits CASH, disconnect LAN/kill/restart Hub before HTTP ACK, then recover | Operator sees uncertain state, same idempotency key reuses original result; **never** a second financial capture | NOT RUN |
| UAT-07 | Disable Internet/cloud while keeping store LAN alive, then restore cloud | Local CASH remains available; pending sync resumes without duplicate order/cash; stale cloud status visibly distinguishable | NOT RUN |
| UAT-08 | Disconnect the Store Hub LAN before initial POS read, during shift action, and during BANK intent | No false connected/empty-queue claim; unsafe shift/bank actions disabled; visible reason and recovery action | NOT RUN |
| UAT-09 | Staff requests BANK with no verified payment, then provider sandbox callback (only when approved) | BANK remains PENDING until authenticated provider confirmation; no paid receipt/revenue on unverified request; authenticated unique provider event reconciles once | BLOCKED — provider approval/evidence required |
| UAT-10 | Print a settled CASH order: CUSTOMER + STORE copies; simulate paper-out, cable disconnect between copies, and restart | Both copy jobs tracked; UNKNOWN visible if physical output uncertain; reprint requires explicit reason and auditable action; **never** another cash capture | NOT RUN |
| UAT-11 | Check keyboard-only and screen reader paths for paid, PARTIAL and PARTIALLY_REFUNDED orders, receipt UNKNOWN and manual reprint | Correct verbal/visual state; partial/refunded orders cannot reopen cash capture; warning retains focus and next action | NOT RUN |
| UAT-12 | End shift, count physical cash including documented movements, verify print/audit history | Opening float + verified cash captures − refunds ± cash movements equals expected drawer; discrepancy clearly visible and recorded | NOT RUN |
| UAT-13 | Run 150 orders/hour burst with 8 sessions and inspect high-volume owner periods | No lost or double orders; measure p95, error rate and render responsiveness, distinguish CI synthetic throughput from actual LAN measurements | NOT RUN |
| UAT-14 | Verify owner day/week/month/quarter/year production quantities and actual daily order count across local date boundary | Counts by product and period correct for Asia/Ho_Chi_Minh; quantity is not capped at 300/day; money reports include only verified settlements | NOT RUN |
| UAT-15 | Restart Windows Hub with WAL activity; verify backup manifest; restore a copy on clean test host | No DB corruption, expected ledger/receipts and idempotency entries survive; original store DB unchanged | NOT RUN |
| UAT-16 | Browser-specific run in real Firefox, Safari on macOS/iOS, Chromium; slow network, offline QR fallback | No blocked money action, inaccessible modal or fabricated paid state; QR may fail offline but readable transfer details remain | NOT RUN |

## Operator screenshot approval

Review screenshots **side by side with actual devices**, not CI mocks only. Cover: Staff 320/390dp with long names, open keyboard and large text; Owner 320/390/768/1366; POS 1024/1280/1366/1920, at Windows 125%/150%, plus print UNKNOWN and BANK PENDING. Record actual issues as links to bugs/PRs; do not approve by silence.

| Sign-off | Name / date / evidence reference | Decision |
|---|---|---|
| Owner: brand, labels, readable reports | — | PENDING |
| Cashier: checkout, error recovery, physical two-copy print | — | PENDING |
| Staff: physical Android/iOS ordering and accessibility | — | PENDING |
| Engineering: exact SHA, all required checks, restore/security | — | PENDING |
| Bank integration owner: approved sandbox and verification | — | BLOCKED |

**Release rule:** No production sign-off until all required safety-critical scenarios PASS with evidence. Any FAIL or BLOCKED safety gate keeps the feature disabled and the release pending. Merge of code for review is not equivalent to approval for real transactions.

## Follow-up workflow

1. Record the tested SHA and device inventory; never replace this with an old green CI SHA.
2. Execute UAT-01 through UAT-16 and append evidence to a controlled, non-public UAT record (no personal/financial secrets).
3. For every FAIL: open one reproducible issue with expected/actual behavior, sanitized evidence, test device, severity, owner and retest SHA; add a regression test before fixing code where reproducible in software.
4. Re-run affected UAT on new SHA and obtain operator signatures. Publish a release decision only after blocking gates are resolved.

**Related references:** [acceptance matrix](../qa/ACCEPTANCE.md), [UI QA matrix](UI_QA_MATRIX.md), [frontend remediation status](FRONTEND_REMEDIATION_STATUS.md), [free-test deployment](../manual/DEPLOYMENT_FREE_TEST.md).
