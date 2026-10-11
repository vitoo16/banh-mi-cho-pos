# OWNER REFACTOR — GOLDEN MASTER, TEST STRATEGY AND IMPLEMENTATION PLAN

**Status:** EXECUTABLE REFACTOR SPEC (no behavioral rewrite authorized by this document).
**Baseline:** `main@499c0fa606d867cbb837bc45f46b297a9c64c1dc` (2026-10-11).
**Priority:** Spec v1.2 and financial/security ADRs > API contract > this plan. See also `docs/plans/PRODUCTION_COMPLETION_ARCHITECTURE_PERF_PLAN.md` in draft PR #34.
**Scope:** Current Owner Web (`apps/web-owner`) + its shared contracts/Hub/Cloud interfaces. Adjacent Staff/POS behavior must not be silently changed. Later POS/Staff/Hub refactors are separate tracks.
**Gate:** A test that passed on baseline but fails after a pure extraction is a regression until explicitly explained with a failing-before / passing-after specification update. Never update screenshots/assertions simply to hide a regression.

## 1. Why now; exact source-grounded risks

Main Owner `src/main.tsx` (~21 KB) mixes authentication, navigation, order cursor, cash summary, bank exceptions, local employees/devices, product form, Cloud remote commands, error/busy flags and app shell in one `App()`. `reload(includeOrders)` sends up to seven requests together and updates many unrelated React states; 10-second `setInterval` exists on legacy routes. Analytics introduced in #35 already uses `QueryClientProvider`, `useQuery`, `select` and independent widgets; legacy routes still use manual fetch.

**Confirmed runtime regression precedent:** #35 initially failed every Owner E2E despite successful TypeScript/build because Vite loaded duplicate React for QueryClientProvider. It was resolved with `resolve.dedupe`. Prevent repeat by browser boot/pageerror tests and a dependency dedupe smoke.
**Existing danger:** Catalog create/update has a durable sessionStorage `bmc_owner_pending_catalog_v1` containing the ORIGINAL payload and Idempotency-Key. A lost ACK must NOT create a second menu mutation; remote commands must remain PENDING until Hub ACK. Avoid replacing this with ordinary React Query mutation retry.
**Existing weak points to characterize:** pagination cursor retention, browser reload/re-login, local vs Cloud write role separation, stale data and 401/403, long-form dialogs/focus, cloud sync freshness, independent KPI observer updates. `React.memo` alone does not guarantee zero re-renders.

## 2. Canonical architecture after refactor (target; gradual migration)

    apps/web-owner/src/
      app/
        App.tsx                 # composition only; no API business implementation
        AppShell.tsx            # sidebar/bottom nav, page title, route fallback
        AuthBoundary.tsx        # login, expired/revoked session, logout+cache purge
        queryClient.ts          # defaults, cache scope/session isolation, typed keys
        router.tsx              # URL sync for reports, back/forward, deep links
      features/
        overview/components/    # dashboard KPI components; existing analytics moves here last
        production/
          components/PeriodFilter.tsx, SalesOverview.tsx, ProductBreakdown.tsx
          queries.ts            # sales period+date query keys, stable selectors
        orders/
          OrderHistoryPage.tsx, OrderSearch.tsx, OrderRow.tsx
          queries.ts            # cursor / infinite query, query-key scoping
        finance/
          FinancePage.tsx, BankExceptions.tsx, ShiftLedger.tsx
          queries.ts
        catalog/
          CatalogPage.tsx, ProductFormDialog.tsx, RemoteCommandLog.tsx
          catalog-retry.ts      # untouched durable key/body payload identity
          mutations.ts         # remote PENDING/CONFLICT, local commit invalidations
          queries.ts
        staff/
          StaffPage.tsx, EmployeeList.tsx, StaffForm.tsx, DevicesPage.tsx
          queries.ts, mutations.ts
      shared/
        api/owner-client.ts    # calls existing HubClient, no manually guessed DTOs
        components/{ErrorState,EmptyState,SyncAgeBadge,ConfirmDialog}/
        utils/{money,date,guards}/
        tokens/
      main.tsx                  # createRoot + providers ONLY
    tests/ui/
      owner-responsive.spec.ts
      owner-refactor-baseline.spec.ts       # golden workflow regression, real Chromium
      owner-cloud-baseline.spec.ts          # real remote Vite build/runtime, browser mocks
    tests/owner-analytics-*.test.mjs       # actual SQLite/Postgres aggregation (keep)
    tests/remote-product-commands.test.mjs # actual Cloud/Hub signed command semantics (keep)

**Do not blindly add Zustand, an event bus, CQRS or Redux.** Feature-local form state + TanStack Query server-state is enough. Use URL paths/search params when users need shareable filters; introduce React Router only in a **separate behavior-tested PR**.

## 3. Contract and money invariants (cannot regress)

1. Owner `summary` totals remain server-authoritative; Cloud freshness clearly shown. Today's **all-created** order count must never be confused with lifetime paid orders.
2. Production quantities are **COMMITTED+PAID**, excluding VOIDED/UNPAID/fully REFUNDED, grouped by product/category and shop-time day/week/month/quarter/year. No fixed 300-order limit, no stock management, no made-up profit or autonomous production quantities.
3. Local Owner can create/update products, issue/revoke paired Staff devices and manage local employees, subject to Hub server authorization. Cloud Owner can queue remote product CREATE/UPDATE and view command statuses but must not gain local-only employee/device writes by UI refactor. No bypass through hiding buttons; server guards remain required.
4. `bmc_owner_pending_catalog_v1` persists original idempotency key AND exact body across ACK loss, page reload and login. If prior command is unresolved, block contradictory edits until resolved. Test key reuse and no duplicate requests.
5. Remote product state `PENDING`, `APPLIED`, `CONFLICT` is reflected faithfully; queuing does NOT mean Hub product is already updated. Existing old-order line price snapshots remain immutable.
6. Never let GET report/React Query set `PAID`, forge bank events, print receipts or mutate financial rows. Owner finance is read-only unless an approved audited API specifically enables operation.
7. On signout/identity change, cancel active queries and clear old-owner cached data; after 401/403 clear/lock the authorized state rather than expose stale protected content (document and implement policy in dedicated auth PR). Session tokens/PINs must never be in console/URL/artifacts.
8. Money = integer VND; timezone = Asia/Ho_Chi_Minh; cursor/order pages must not silently drop, duplicate or reorder existing historical rows.

## 4. Query keys / data ownership / render isolation contract

| Dataset | Query key (minimum) | Subscriber | Refresh | Critical behavior |
|---|---|---|---|---|
| Lifetime financial summary | `['owner',storeIdentity,'summary']` | Revenue, Cash, Payments, Shift | 10s/focus/after relevant mutation | Do not refetch employee/catalog/order history |
| Today's order counts | `['owner',storeIdentity,'orders-today',shopLocalDate]` | Today's KPI | 5–10s/focus/day rollover | Midnight changes query key; independent of lifetime summary |
| Product sales | `['owner',storeIdentity,'product-sales',period,date]` | SalesOverview, category, product table | 10–30s for active period; historical stale longer | One network request shared across subscribers; no client-side history scan |
| Catalog | `['owner',storeIdentity,'catalog']` | Catalog list, edit form | focus / successful mutation | Idempotent uncertain writes keep persisted key |
| Remote commands | `['owner',storeIdentity,'remote-commands']` | Pending log | bounded polling only while pending | No premature APPLIED |
| Orders pages | `['owner',storeIdentity,'orders',filters]` | InfiniteQuery page rows | explicit fetchNextPage / relevant mutations | Deduplicate IDs and preserve stable cursor/selection |
| Local employees | `['owner',storeIdentity,'employees']` | Employee list/form | on demand/post-change | Cloud cannot mutate |
| Local devices | `['owner',storeIdentity,'devices']` | Pair/revoke | on demand/post-change | Pairing secret displayed only when issued |
| Bank exceptions | `['owner',storeIdentity,'bank-exceptions']` | Finance exception list | 10–30s/focus | Never treat exception as confirmed BANK |

**Current #35 baseline keys are shorter** (`['owner','summary']`, `['owner','orders-today']`, `['owner','product-sales',period,date]`). Moving to store/session-scoped keys is a planned atomic migration with tests; do not silently rename and lose cache isolation.

`queryFn` must consume `signal` or discard stale responses after logout/key change. TanStack Query `select` should return primitives/reused immutable structures where possible; structural sharing is enabled, `React.memo` on costly pure children, stable callback props. Refetch when browser becomes visible or mutation completes, not uncontrolled timer overlap; no auto-retry on unsafe POST. Avoid `invalidateQueries(['owner'])` after a catalog mutation if it triggers unrelated financial dashboards. Never claim polling is push-based realtime.

**Render/perf proof is two separate layers:**
- Functional Playwright: unrelated API route request counters do not unexpectedly change, switching period fetches only the new period, DOM content stays correct; compare request traces/cache identity where supported.
- Component render counters using React Profiler and Vitest/Testing Library (add in TOOL-01); force query data changes and assert unchanged sibling component *render/commit count* remains constant, affected child changes exactly as expected. DOM node identity or `memo` presence **is not proof** of no React rerender.
- Capture same-hardware before/after React Profiler commit duration, Chrome INP/Long Tasks, JS bundle gzip and chart/page navigation timing; no fabricated improvement percentages.

## 5. Test pyramid: baseline first; what each test proves

| Tier | Tool | Scenario | Nonnegotiable assertion | CI job |
|---|---|---|---|---|
| G0 | TS/Vite | All app entrypoints | `check`, build, Vite/React Query no duplicate React runtime | app + UI |
| G1 | Playwright browser | Owner PIN success/failure, refresh/relogin/logout | No white screen/pageerror; no old protected session/cache on logout; 401 feedback | UI |
| G2 | Playwright local Owner | Orders cursor page 1→2, dedup, search | Correct 1+2 results, no duplicate records, no paid-state fabrication | UI |
| G3 | Playwright local Owner | Catalog CREATE/UPDATE, hidden product | Exact price, active state, expected idempotency header; old value absent | UI |
| G4 | Playwright local Owner | ACK lost after CREATE/UPDATE → refresh | Original key and payload reused, no second logical change | UI |
| G5 | Playwright local Owner | Add/deactivate employee, pairing/revoke device | Exact role/revocation/guards; no exposed PIN | UI |
| G6 | Playwright Cloud Owner | Queue CREATE/UPDATE and PENDING/CONFLICT/APPLIED | Queue is not live catalog, expected price field, no local-only admin writes | UI remote project |
| G7 | Playwright Owner | Finance exceptions, pending BANK, shift | Cash/Bank totals correct, no fake PAID or profit | UI |
| G8 | Playwright Owner | Period/day/year change, 320/390/768/1366 widths, stale/timeout | No horizontal overflow; data reflects exact selected interval | UI |
| G9 | Playwright requests | Today's KPI update vs revenue update; unrelated queries | Correct network isolation/content, no refetch of 100-order history on dashboard | UI |
| G10 | Vitest/React Testing Library | Isolated widgets, `select`, expensive list rows | **Actual React commit/render counts**, loading/error/empty; URL control | TOOL-01 |
| G11 | SQLite real | item counts and 0, <300, 400+, 1000+ fixtures; two price revisions, refunds, time boundaries | Sum units exact, never client 100/200-row cap | app/integration |
| G12 | PostgreSQL real | identical order/payment truth + out-of-order signed mirror replay, 100k seed EXPLAIN | Cloud equal to Hub after caught-up sync; settlement secure | cloud |
| G13 | Security role tests | staff/cashier unauthorized GET/POST, stale/revoked Owner, CSRF/origin as applicable | Hub/Cloud 401/403 enforced by **backend**, not just hidden UI | app/cloud |
| G14 | Perf baseline | 8 true concurrent HTTP devices, 0–1000+ orders, 100k history, long backlog | p50/p95/p99 + no lost/duplicate accepted transactions | perf nonblocking on laptops; staging gate |
| G15 | Hardware / real device | LAN/native, bank merchant, printer/cash-drawer, backup | Physical evidence / manual UAT signed, never substituted with mock | release gate |

**Fixture rule:** UTC timestamps are fixed or mock clock is explicit; mutate state in a fresh per-test server fixture; deterministic menu and order IDs; no external credentials. For frontend behavior tests use *real Vite Owner build in Chromium with mocked HTTP only*, never pretend this validates Hub authorization. Positive and negative paths get tests; avoid arbitrary sleeps and screenshots as the only assertion. Record signed HMAC integration separately with real Postgres.

## 6. Ordered PR backlog — owner-first, small reversible diffs

| PR ID | Files / boundary | Exact change | Prerequisite | Targeted test gate |
|---|---|---|---|---|
| OR-00 | docs + `tests/ui/owner-refactor-baseline.spec.ts`, remote test runner | Golden current behavior: login, orders, catalog, staff/devices, finance, TanStack pages and Cloud; register browser pageerror | none | Browser G0–G9 baseline GREEN |
| OR-01 | `app/queryClient.ts`, `app/AuthBoundary.tsx`, `shared/api` | Auth/session cache namespace & safe logout/cancellation, 401 behavior | OR-00 | G1, G9, G13 |
| OR-02 | `features/orders/*` | Extract cursor history to `useInfiniteQuery`, search/filter, stable row IDs | OR-01 | G2, cursor race and 100k history query |
| OR-03 | `features/catalog/*` | Extract form, mutation controller, durable retry module, local/Cloud split | OR-01 | G3,G4,G6 + Backend remote commands |
| OR-04 | `features/staff/*` | Extract Employees + Devices with independent queries/commands | OR-01 | G5,G13 |
| OR-05 | `features/finance/*` | Cash shift / bank exceptions / sync-age with independent `useQuery` | OR-01 | G7,G9 + server money tests |
| OR-06 | `features/production/*`, `features/overview/*` | Split existing analytics file, stable selectors, day rollover/URL filter, lazy Owner route | OR-01 | G8,G9,G10, period boundaries |
| OR-07 | `app/AppShell.tsx`, `app/router.tsx`, `main.tsx` | Remove giant page JSX, nav + URL/deep-link behavior | OR-02…06 | Full G0–G9 + browser back/forward |
| OR-08 | `packages/ui`, `styles`, `shared/components` | Semantic tokens/dialog focus/error components; no business logic | OR-07 | a11y axe, keyboard, 320px & 200% |
| OR-09 | `packages/contracts` generated schema and Query common hooks | Replace handwritten DTO/SDK only under contract parity, single packages manager ADR | contract-first PR | API fixture/provider consumer parity |
| OR-10 | React Profiler + bundle/perf CI | Prove rendered subtree isolation / runtime performance, optional SSE invalidation | OR-06 and perf baseline | G10,G14 before/after artifacts |

**Parallel rules:** After OR-01, orders/catalog/staff/finance branches can be parallel only if each owns its own feature subtree and no shared `main.tsx` edits. Merge each extraction's import in a short integration PR. No two agents rewrite the same 21-KB file concurrently. No broad structure change to money/print/store database in these Owner-only refactor slices.

## 7. Failure-mode detail / "avoid small bugs" checklist

- **Browser boot:** protect against React duplicated by Vite/NPM workspaces (the #35 regression). Capture `pageerror`, rejected promises, console errors; no blank page.
- **Mutation IDs:** create/update/employee/device remote command key must be unique for new operations but identical for *same retried operation*. Change BODY with old idempotency key must remain 409 at server.
- **Logout/races:** responses that arrive after logout MUST NOT repopulate old protected UI or Query cache. If new owner logs in, queries must revalidate for that identity/store.
- **Pagination:** cursor tied to sort and filters, stable ID, dedup overlap, no page 1 clobber on `showMore`; no reset when a background summary refreshes.
- **Sales:** selected period & date retained on refetch, Monday week and quarterly boundary, chart/report shows paid units only. 0 orders is an empty state, not API error or `NaN`.
- **Bank/finance:** `PENDING` not `PAID`; Cloud stale banner distinguishes sync lag from actual payment. Double cash + bank must be exception not double revenue.
- **Offline:** stale last-good snapshot + explicit retry; no page flicker to zeros when a read temporarily fails. Avoid auto-retry POST with new key.
- **Accessibility:** screen reader status words, focus trap + Escape + focus return for edit dialog; 320px/390px mobile bottom nav six entries, no cropped submit; tab through PIN/forms.
- **Performance:** filtered query observers must not cause whole App render; avoid unbounded GET floods on tab focus; cleanup intervals/AbortController on unmount. React Profiler before/after check.
- **Test discipline:** one fast local prepush targeted test + CI changed-path suite; a separate independent review only for money/role/security/unknown-ACK behavior. Never wave through failures as flaky without reproducing.

## 8. CI orchestration and Definition of Done

For OR-00: browser fixtures must cover local and remote OWNER modes. Existing UI runner uses Vite dev servers and Playwright; add separate mock-Cloud Owner dev server on another port with `VITE_CLOUD_API_URL` pointing to itself, intercept its `/v1` requests. This is a browser contract test, not a real merchant/backend authorization test.

**Fast PR gate**:
`npm run check` + `npm run build` + `npm run test:ui` + `npm run test:domain` + `npm run test:integration` (affected backend) + `npm run docs:check`.
Run real Postgres suite if Cloud/controller/query modified. Baseline refactor test should not depend on live bank/printer/phone.

**Full Owner refactor DONE:** all OR-00…09 affected golden tests green; app functionality unchanged except approved improvements; no React runtime errors; data scoped by auth, no duplicate writes, 0 false-paid, correct cursor/fixed time boundaries; 320–1366 responsive; G10 actual React Profiler isolation evidence captured; target bundle/INP/rerender metrics before/after, not invented; no new critical a11y defects.

**Not finished merely by plan:** This document and OR-00 tests do not themselves complete OR-01…10 or Production UAT. The current target is to build a regression safety net before structural changes.

## 9. Actual work log / evidence

- Current planning commit: to be filled by PR.
- Agent skills reviewed: `vite-react-frontend`, `performance-qa`, `ui-visual-audit`, `contract-first`, `financial-ledger`; `AGENTS.md` and relevant UI/Web/QA plans.
- PR regression suite result: record GitHub Actions commit and job; do not claim unrun tests.
- Hardware/provider state remains separate and blocked pending real equipment/access.
