# Bánh Mì Chợ POS — UI implementation master plan (Mobile-first)

**Status:** APPROVED-FOR-PLANNING proposal, NOT implemented or device-tested. **Baseline:** `docs/spec/MVP-v1.2.md` (2026-10-10). **Priority:** Staff React Native + POS cashier Vite P0, Owner Vite P1. **Audience:** 4–8 order takers, one cashier, one store, 300+ orders/day.

## 1. Design intent and strict boundaries

**Experience principle:** A production counter instrument, not a marketing site. Crisp, warm, calm, visually restrained, one focal action per screen. Use Taste Skill as a *taste and consistency review*, not as authorization for playful animation or heavy effects on a cashier POS. User speed and legibility override artistic experimentation.

### Hard scope rules

- Staff menu: item name, sell price, quantity (+/−); optional category filter, search, item/order note, payment *requested* method, save. No stock counts, product photos required, kitchen workflow, prep tickets or workstations.
- Staff **never** sets `PAID`, prints receipts, opens drawer, edits product price or sees whole-store revenue. Payment selector defaults to CASH, BANK available, MoMo/MIXED conditional feature flags.
- One cashier / one drawer / one physical printer; printer makes customer and store copies after verified full settlement. Pending bank payment is not successful payment.
- Owner configures menu/prices/employees and sees true settlement, audit, shift and bank reconciliation. Actual profit is not inferred without cost data.
- UX cannot silently override server money math, settlement authority, idempotency or unknown-state handling.
- Optimizations target *time-to-operate* and clarity; decorative hero sections, animated charts in POS, photos in catalog and unnecessary breadcrumbs are prohibited.

## 2. Priority and platform-specific layout

| Track | Platform | Typical viewport (testing matrix) | Purpose | Decision |
|---|---|---|---|---|
| P0-A | RN Android (iOS supported subject to POC) | 320×568, 360×640, 390×844, 430×932 logical dp | 1-hand create order | **Single-column, fixed bottom order CTA, vertical scroll, native keyboard/safe areas** |
| P0-B | Vite Windows touch POS | 1024×768, 1280×720, 1366×768, 1920×1080; 125%/150% OS scale | Clear queue, cash collection, two-copy print | **One-column at narrow widths, split queue/detail above 1024 if truly fits; keyboard shortcuts** |
| P1-C | Vite Owner responsive web | 320×568, 390×844, 768×1024, 1366×768 | Quick mobile read, deeper desktop management | **Mobile-first summaries, filters in sheet, tables transform into rows/cards** |

All dimensions are **design/test targets**, not assumed hardware specifications. On Windows test actual CSS viewport at display scale; do not assume monitor pixels equal CSS pixels.

## 3. Content hierarchy (what must be visible without distraction)

1. **Staff Menu**: (a) connection/status only if meaningful (b) category/search (c) name, price, quantity (d) sticky total + View order CTA. Never put a 6-card dashboard before the menu.
2. **Staff Review**: selected items, notes optional, requested method, server-price check, **Save order** CTA. No cart grand total duplication in every section. After save show order short code in large type and 'Báo miệng cho khu làm bánh'.
3. **POS Queue**: amount, short order code, payment requested, worker/time, actual pay state. *Pending/unpaid* first. Cashier opens one checkout quickly. No prep-progress columns.
4. **POS Cash**: amount due, received amount, **change** in largest numeral, smart denominations, confirm only on sufficient amount; wrong amount is inline feedback, not a toast alone.
5. **POS BANK**: amount/reference and valid QR, server-verified status (pending/confirmed/exception) and explicit manual escalation; visual celebration never implies settlement.
6. **POS Shift**: opening float, physical movements, expected amount, cash counted, difference. Keep monetary actions separate from order selection.
7. **Owner mobile**: paid revenue total, tender breakdown, unmatched transactions, current shift, last sync; product configuration in dedicated screens, never packed into the initial dashboard.

## 4. Navigation model

### Staff RN (no 4-tab bottom nav required)
- Auth/pair -> `Menu` (home) -> `Order review` (sheet/screen, keyboard-safe) -> `Saved receipt code` -> return Menu.
- `My orders` accessible from header compact action; `Network/device` from deliberate status control, not permanent tall banner. Back from review returns full cart; successful save clears cart only after durable ACK.
- Payment method picker stays on Review, NOT a multi-screen wizard; note text area collapsed until tapped. Staff selects *requested* method.

### POS Vite
- Shift lock/login -> Orders queue -> Checkout (`CASH` or `BANK`) -> Receipt status -> back to queue.
- Drawer/shift activity accessible from stable utility nav; only cashier role can operate; `Close shift` never overlaps with active capture flow.
- Narrow POS: list OR checkout full-screen with Back and persistent order summary; wider POS: list ~35% and checkout ~65%, minimum checkout width 500px. 3-column layout only if validated > 1440 CSS px; never force horizontally scrolling tables.

### Owner Vite
- Mobile bottom nav: Overview / Orders / Finance / More; `More` routes to Catalog, Staff and Settings. Desktop sidebar.
- Money-related finance screens provide absolute amount + method labels (do not rely only on pie slices/colors). Defer long tables and filter-heavy UIs to desktop but preserve mobile access via stacked rows.

## 5. Interaction requirements

- **Touch:** ≥44×44 dp mobile minimum; preferred primary 48–56dp high. POS touch ≥48 CSS px for critical controls. Qty `−` disabled at zero and quantity centered; no +/- overlapping name/price at 320dp.
- **Layout:** no horizontal document scroll at minimum supported widths, no clipped totals/long Vietnamese labels, no bottom CTA covered by keyboard or navigation bar; use safe-area insets and keyboard handling. Avoid fixed hardcoded heights on content lists; scroll only middle pane, not action footer.
- **Typography:** VN currency uses `Intl.NumberFormat('vi-VN')` + explicit currency label, tabular numerals; emphasize amount not decimals (VND integer only). `input` font ≥16px on mobile web; system font scaling RN honored to 200% where practical; no unreadable ellipsis for critical prices.
- **Status:** distinguish hub unreachable, weak/stale sync, saving, acknowledged, unknown ACK retry, pending bank, verified paid, print failed/unknown. Use text + icon + consistent semantics (color alone insufficient).
- **Feedback:** 0.1–0.2s restrained press feedback, no parallax/scroll reveal; prefer `prefers-reduced-motion`. Never show success before authoritative ACK. Destructive actions ask confirmation or offer safe undo.
- **Internationalization:** Vietnamese-first copy (đ, ₫), Vietnamese person/product names wrapping up to 2 lines; timezone `Asia/Ho_Chi_Minh`; timestamps contextual, detailed date accessible on demand.
- **Money UI:** display requested method with qualifier 'Khách chọn' separate from 'Đã nhận qua' actual. Explicit pending status. Numeric keypad accepts digits only, formats non-lossily, validates range; no negative/decimal VND inputs.
- **Safe copy:** never imply a bank screenshot is proof of transfer; bank pending's action is `Chờ xác nhận` / `Kiểm tra giao dịch`, not `Đã thu`.
- **Printing:** one receipt batch has copies CUSTOMER & STORE; show each copy's print state; partial physical delivery may be UNKNOWN, reprint shows `IN LẠI` and must not collect payment again.

## 6. Responsive composition (NO horizontal overflow)

Use `min-width:0` on flex/grid children; `overflow-wrap:anywhere` selectively for references; avoid ellipsis on primary product name/amount; keep inputs in width-constrained containers; use `grid-template-columns: minmax(0, ...)` rather than rigid pixels. Sticky footer uses safe-area bottom padding and adequate space reserved in scrolling content. Use `min-height:0` on scroll panels in flex columns. Long order codes should remain selectable/readable, while descriptive notes wrap. Tables only when viewport supports them; mobile uses cards/labeled rows. Never fix overflow by hiding critical content with `overflow:hidden` or shrinking type below legible sizes.

## 7. Vercel + Taste guidelines priority

1. Product invariants + legibility + performance (this project + spec v1.2).
2. Vercel Web Interface Guidelines (keyboard, focus-visible, hit targets, safe-area, responsive coverage, validation, non-blocking UI, reduced motion).
3. Vercel React Best Practices / React Native Skills (minimize rerenders, virtualization when catalog size warrants it, avoid expensive work on render, no unnecessary waterfalls).
4. Taste Skill (`design-taste-frontend`, experimental v2) for restrained consistency; set suggested dials: DESIGN_VARIANCE 2/10 (POS), 3/10 (RN/Owner); MOTION 1/10 (POS), 2/10 (RN); VISUAL_DENSITY 7/10 (POS), 5/10 (RN), 5/10 (Owner). **These are project settings, not official thresholds.**
5. Real-device evidence over screenshots and generic aesthetic scoring.

## 8. Performance budgets (targets, not verified metrics)

- Staff cached-menu launch P95 < 2.0 s on selected low-end reference device; tap-to-qty-change visible P95 < 100 ms, no noticeable lost taps in 8-device stress test.
- Staff create-order clear success after **durable Hub ACK**: P95 < 1.0s on healthy LAN and non-busy Hub; remain responsive during slower ACK, never double-submit.
- POS queue update after new order: P95 < 1.0s on LAN; cashier visible UI response to tap < 100ms; no input blockage while printing.
- Owner initial mobile dashboard usable P95 < 3s on representative 4G; cache/stale label if delayed (not guaranteed live without sync).
- No severe frame drops during scrolling on test devices; benchmark and report RN JS/UI frames, web long tasks, memory, route chunks. Numbers validated after POC, not represented as current measurements.

## 9. Milestone sequencing with parallel implementation

| Gate | Deliverable | Frontend owner | Contract/Backend dependency | Exit evidence |
|---|---|---|---|---|
| UI-00 | User task map, tokens, layout sketches, fixture states | UX + RN + Web | Read spec v1.2 | No stock/kitchen affordances; review 320dp + 1024px mock |
| UI-01 | Staff menu / review / method / ACK / recent | RN | Catalog + create order contract, mock fixtures | RN component tests, 1-hand usability pilot |
| UI-02 | POS order queue + cash + print status | Web-POS | Live orders, capture, receipt contract | Playwright, keyboard/touch, two-copy failure |
| UI-03 | Staff/POS integration | RN + Web-POS | Store Hub LAN, idempotency, re-sync | 8 devices, burst orders, unknown ACK |
| UI-04 | POS bank QR + exception + close shift | Web-POS | Payment webhook/recon + drawer domain | No false paid, denomination and variance tests |
| UI-05 | Owner overview mobile-first + desktop catalogue/finance | Web-Owner | Report and catalog endpoints | Responsive audits and role tests |
| UI-06 | Visual+accessibility+performance audit | Independent reviewer (one pass per vertical slice) | M0 hardware POC/CI | Real screenshots at matrix widths; no overflow; corrective follow-up only for defects |

Parallelization: after shared design tokens and contract fixtures are frozen, RN and Web-POS build simultaneously; Owner starts after core financial DTOs. Avoid sequential all-features-then-audit work; review each bounded vertical slice once, re-review only changed high-risk areas.

## 10. Definition of done (every UI pull request)

1. All screen states exist: loading, empty, success, validation error, server error, offline/reconnect, unknown on timeout where applicable.
2. Correct product/payment role boundaries; no client-set paid state. VND calculation not authoritative in client; totals reconciled to Hub.
3. Test evidence for 320dp phone, small-height phone with keyboard, POS 1024×768 and 1366×768 at 125% zoom/scale, owner 390dp and desktop; zero viewport horizontal scroll.
4. All controls reachable via keyboard on web; visible focus, accessible names, 44dp/48px touch targets as above; focus not hidden under overlays.
5. Screen recordings or measured timings for routine order and cash checkout; outcome checks on real device after POC.
6. No silent retry creating a fresh idempotency key. No printing triggered from React render/effect.
7. Proof of source skills read, tests actually run, measured regressions and known blockers. No fake passing screenshot/tests.

## 11. Integration with existing plans

- `docs/ui/SCREEN_SPECS.md`: precise IA, states, controls and responsive requirements.
- `docs/ui/DESIGN_SYSTEM.md`: design tokens and cross-platform component rules.
- `docs/ui/UI_QA_MATRIX.md`: exhaustive viewport and transaction UX acceptance.
- `docs/ui/AGENT_UI_WORKFLOW.md`: skill routing, install instructions and task ownership.
- This plan refines `WEB_PLAN.md`, `MOBILE_PLAN.md`, `PARALLEL_EXECUTION.md` but **does not replace** business spec v1.2.