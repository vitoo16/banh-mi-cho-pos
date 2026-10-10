# Bánh Mì Chợ POS — UI accessibility, overflow & operation QA matrix

**All criteria are prospective**. A design mock or unit test does not count as physical printer/bank confirmation.

## Viewport matrix

| UI | Size | Must inspect |
|---|---|---|
| RN | 320×568 dp | Long name + numeric input + open keyboard + footer safe area |
| RN | 360×640 dp | 4 categories, note expansion, cart summary and method options |
| RN | 390×844 dp | Routine ordering speed, tap targets, larger font |
| RN | 430×932 dp | Wider list alignment and phone safe-area |
| RN | 320–430 dp at 200% system font | Labels wrap, no clipped amount/action; may scroll vertically |
| POS | 1024×768 CSS px | Queue or checkout single pane if split cannot fit; no X scrollbar |
| POS | 1280×720 CSS px | Cash amount + change + confirm visible at 125% OS scaling |
| POS | 1366×768 CSS px | Queue + checkout, printed state and shift details |
| POS | 1920×1080 CSS px | Max container widths prevent unreadably stretched content |
| Owner | 320×568 / 390×844 CSS px | KPI, cash/bank breakdown and finance records as cards |
| Owner | 768×1024 / 1366×768 CSS px | Responsive nav, role edit, catalog form and tables |

## Automated tests

- RN unit + component: default CASH, bank selection, hidden MoMo until flag enabled, zero quantity, long name, stepper at 0, optional item/order note, backend price mismatch, double-tap key reuse, unknown ACK recovery, logged-out session. Test accessible labels and no `PAID` mutation from staff.
- Web component: typed money in VND integer, insufficient cash, exact/over tender change, bank pending vs paid, invalid QR/expired, print retry, cash shift difference signed. Validate async state transitions against mocked API (MSW).
- Playwright per breakpoint: screenshot + computed `document.documentElement.scrollWidth <= window.innerWidth` (allow < 1px tolerance for rounding); no clipped focus, fixed footer not obscuring important controls, keyboard-only cashier flow, reduced motion. Assert no visual-only confirmation for paid.
- Contract fixtures: cash settle, bank pending -> verified, late bank event, duplicate webhook, stale requested method, refund, canceled before payment, post-capture printer failure, store sync stale, offline LAN-only success.
- Accessibility: web axe accessibility smoke/critical routes; RN TalkBack/VoiceOver manual checks, labels/names and screen reader order. Contrast verify design tokens in both requested states. Do not assume `aria` tags alone equal accessibility.

## Real operator usability run (minimum)

- 2–3 staff participants perform each: 1 bread cash, 2 breads plus item note, 1 bread bank, wrong quantity corrected, save unknown retry. Start timer from menu open; target routine 1–2-product order <= 15s after brief training; record attempts, taps, error rate and causes. Measure; don't invent successful outcome.
- Cashier: 5 orders in rapid queue (mix cash/bank), customer changes method, 100k tender 35k due -> 65k change, bank pending while other orders continue, paper-out after one copy, close shift with -20k difference. Operator must accurately identify which orders are *actually* paid.
- Owner: in phone viewport find yesterday's confirmed bank total and a pending reconciliation, locate product price config, distinguish revenue from profit. Check content works at 200% text size.

## Release blockers (P0) vs follow-up

**P0 blocker:** clipped/covered save or confirm; accidental duplicate order/capture; showing unpaid as paid; inability to resume after unknown ACK; false print-success; blocked cashier checkout on normal offline cash route; keyboard inaccessible cashier critical path; unreadable amount and required labels; lack of sufficient amount due/change clarity; X-scroll on critical screen.

**P1 fix in follow-up if time-bounded:** inconsistent low-salience spacing, decorative polish, microtransition differences, minor non-critical secondary copy when route remains usable. Never postpone accessibility defects that block transaction.

## Performance capture

- Collect device model/OS, network/LAN, build SHA, warm vs cold, scenario, P50/P95, UI/JS FPS, web long tasks and first interaction. Include screenshots of extreme text, amount and error states.
- Reference measures: staff menu cached load P95 target < 2s, tap response <100ms, LAN save after ACK P95 <1s, POS queue update <1s. If target fails, record measured result and decide mitigation; do not silently lower acceptance.
- Test 8 staff devices concurrently, bank pending and receipt processing without freezing queue UI; ensure no unexpected list jump when new orders arrive.

## Completion evidence template

```text
Task / commit SHA:
Screens and breakpoints validated:
Skill files actually read:
Automated commands / outcomes:
Real device models tested:
Counterexample / negative case evidence:
Overflow audit screenshot refs:
Unverified hardware/cloud dependencies:
P0/P1 findings and fix PR:
```