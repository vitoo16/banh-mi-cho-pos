# Taste Redesign — review checklist and evidence ledger

**Branch:** `design/taste-be-vietnam-pro-foundation` · **PR:** #76 · **Status:** draft, visual/physical sign-off pending.

## Scope completed in code (not equivalent to sign-off)

| App | Implemented visual slice | Business invariants retained |
|---|---|---|
| Owner Web | Be Vietnam Pro offline, neutral shell, today's orders as main KPI, read-only catalog search/availability filters, clearer status and staff form labels, finance panel hierarchy | Catalog commands still need Hub ACK; dynamic report periods; revenue only when verified |
| Cashier Web | Be Vietnam Pro offline, quieter queue, explicit selected state, tab semantics, legible tender/change | Cash request persisted before sending; bank pending and printer UNKNOWN distinguishable |
| Staff RN | Be Vietnam Pro offline with fallback, 320dp/large-font stacked menu, keyboard-scrollable login, adaptive header and checkout footer, per-product quantity accessibility labels | Staff cannot mark PAID; save still requires durable Hub ACK; unknown ACK preserves key |

No API schema, SQLite schema, payment capture, receipt sequencing or inventory logic changed.

## Automated evidence to record per head SHA

Run `npm install --no-audit --no-fund`, `npm run check`, `npm run build`, `npm run test:bundle`, `npm run test:domain`, `npm run test:integration`, and `npm run test:ui` on the PR commit.
- UI regression: catalog search ignores accents, active/hidden filters preserve edit affordances and never write, 320/1366 have no horizontal page overflow or axe violations.
- Native bundle: Expo Android + iOS production JS exports; **not** a physical device accessibility or typing test.
- Pay attention to older baseline tests that still use exactly named `Sửa` buttons; keep accessible name stable, attach product context via accessible description.

## Physical and visual acceptance — not yet executed

Capture evidence per scenario with *actual device/viewport* and build SHA. Do not infer PASS from a green browser suite.

1. **Owner 320x568 + 390x844**, normal and 200% text: open Sản phẩm, search `banh mi`, filter hidden, edit a long-name product; modal and Save visible with keyboard; navigation scrolls inside its rail, not document. Compare 768 and 1366.
2. **Owner finance:** open real reports on disconnected Cloud, confirm sync freshness copy is factual. Validate no wording implies bank pending is captured; count of daily orders never capped at 300.
3. **Cashier 1024x768 (OS 125%) + 1366x768**, simulate long name and 12.345.678đ: queue remains legible, amount and change never clipped, one primary capture action. Test offline LAN-only cash and bank pending; printer WAITING/SENT/UNKNOWN can't be mistaken for confirmed paper.
4. **Staff Android 320dp + 390dp, iOS representative**, font scaling 100% and 200%: open PIN keyboard while login fields and button remain scroll-reachable; menu quantity controls announce specific product names with TalkBack/VoiceOver; selected names/prices wrap; review/payment intent/Save reachable with open keyboard; safe-area CTA never occluded.
5. **Recovery drill:** save an order with ACK lost and inspect persistent pending record; use exactly the prior idempotency key to reconcile. On cashier interrupt capture after local staging and verify no double capture.
6. **Operator taste audit:** screen should resemble a calm counter tool, not a dashboard template: no ornamental hero tiles, decorative gradients, modal-over-modal, hover-only actions, unlabeled icons or mixed icon families.

## Unresolved blocker

Human visual review, phone hardware, OS text scaling and real printer/payment verification are **not** provided by automated GitHub checks. Do not promote Draft PR #76 until those have their own recorded evidence. No claimed visual-perfect baselines without screenshot artifacts.
