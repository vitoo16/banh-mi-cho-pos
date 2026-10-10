# Frontend web detailed plan — React + Vite (POS & Owner)

**Two Vite apps:** `apps/web-pos` (cashier LAN/localhost) and `apps/web-owner` (cloud, responsive). Share design tokens and generated OpenAPI client, separate permissions and routing. No Next.js or server-side rendering needed for MVP.

## Tooling architecture
- React + TypeScript strict, Vite, React Router, TanStack Query (server state), Zustand for tiny UI-only state (checkout input and modal state), React Hook Form + schema resolver, accessible semantic controls.
- Generate SDK/types from `/docs/contracts/openapi.yaml`, never manually type money payloads twice.
- TanStack Query keys carry store and filters; websocket events invalidate/refetch relevant queries without unbounded duplicate fetch; connection/auth state visible.
- Large touch targets, desktop POS keyboard support/shortcuts after usability check; web Owner responsive for mobile web usage. No RN code in web bundles.

## Pages + detailed UX

| Task | Page | Behavior | Edge cases |
|---|---|---|---|
| FW-00 | Login/lock screen | Dedicated cashier sign-in and active-shift ownership | Lockout, signed-out, hub unreachable |
| FW-01 | `/orders` | Newest unpaid prioritized, ID search, pending bank indicator, creator/total | Burst, disconnect, stale updates, no duplicates |
| FW-03 | `/orders/:id/checkout` | Method expected vs actual, CASH amount tendered and prominent calculated change; BANK QR pending with verified badge only on event | Client refresh, double tap, insufficient cash, partial |
| FW-04 | `/shifts/open`, `/shifts/close` | Float, cash drawer movements, count denominations, expected/actual and variance, lock shift | Wrong cashier, missing opening float, mid-close adjustment |
| FW-05 | `/receipts` or embedded details | Print 2-copy status, missing copy, printer error UNKNOWN, reprint approval and watermark | Mid-batch stop, duplicate queue events |
| FW-06 | Owner `/catalog` | CRUD product name/price/category/enabled, price history & preview | Old orders never repriced, role guard |
| FW-07 | Owner `/dashboard` | Verified turnover by CASH/BANK (MOMO when enabled), orders, shift variance, stale last_sync_at | Missing data, mixed payments, timezone |
| FW-08 | Owner `/reconciliation` | Unmatched/over/underpayments with reason and approval actions | Cloud delayed, provider down, duplicate event |
| FW-09 | Owner `/employees`, `/settings` | Role grants, payment method feature flags, account settings (no bank secrets) | Unauthorized edits, audit trail |

## States required on every money page
`idle`, `loading`, `saving`, `confirmed`, `pending_external`, `error_retryable`, `exception_review`, `offline_stale`. DO NOT show fake PAID due to local timer, screenshot or staff selected method. Reconnect refetch and dedup by operation ID.

## Accessibility & ergonomics
- Currency grouped `Intl.NumberFormat('vi-VN')`, integer VND computations in pure domain library.
- Accessible focus, aria-live confirmation, full keyboard path for cashier, 44px+ touch target, contrast tests; no animation dependent workflow.
- Split bundles per Owner route; no dashboard chart library in cashier core bundle. Lazy-load expensive reports; no 300-row DOM renders (pagination/windowing where required).
- Print never triggered from browser `window.print` as financial side effect: call Store Hub's authorized receipt-job endpoint.

## Tests
- Vitest + Testing Library: money input, method switch, close-shift variance, loading/error/empty/permission states.
- MSW contract mock tests: requested method not paid, retry after timeout, bank pending -> verified, printer UNKNOWN, stale owner dashboard.
- Playwright: cashier E2E on supported touchscreen resolution 1366×768, new order -> cash capture -> print status, search under 150-order/hour simulated load.
- Core Web Vitals and bundle budgets in QA plan. Web page can never directly modify ledger or access cloud DB.

## Deliverables / acceptance
- Reusable `MoneyDisplay`, `PaymentMethodSelector`, `OrderList`, `CashTenderPanel`, `ShiftReconciliation`, `ReceiptStatus`, `NetworkStatus`, `SyncAgeBadge`.
- Design tokens aligned with RN typography/naming without forcing shared cross-platform UI primitives.
- Screens must be usable by a nontechnical cashier after short instruction. No KDS, stock, prep status or bếp tabs.

## Detailed UI execution overlay (P0 POS and P1 Owner, 2026-10-10)

Before screen implementation read `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md`, `docs/ui/SCREEN_SPECS.md` (POS-00..06 / OWNER-00..05), `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/UI_QA_MATRIX.md`, and `docs/ui/AGENT_UI_WORKFLOW.md`. POS cashier is P0 and must be evaluated at 1024px/1366px with scaling, touch/keyboard, cash change and printer UNKNOWN. Owner mobile dashboard + price editor is P1 and must gracefully collapse tables to cards at 320–390px. Mandatory local skills are `vite-react-frontend`, `mobile-first-operational-ui`, and on review `ui-visual-audit`; complement with current Vercel Web Interface/React skill and Taste references. No fake paid on requested method and no stock/bếp pages.
