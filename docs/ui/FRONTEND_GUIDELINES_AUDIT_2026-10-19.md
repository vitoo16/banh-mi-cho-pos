# Frontend Guideline Audit — Bánh Mì Chợ POS

**Audit date:** 2026-10-19 · **Reviewed head:** `3b64cf5e96ab4d92f2fecb3b5589b707f6b80b4d` · **Review type:** source + documentation + GitHub CI evidence, **not** a live device or visual-signoff audit.

**Verdict: NOT READY for complete-frontend / visual-quality signoff.** The current PR has passing automated CI, but guideline completion requires fixes and physical/browser evidence below. No numeric completion percentage is claimed: coverage is neither equal-weight nor completely measured.

## Source of truth and scope

- `AGENTS.md`, `docs/spec/MVP-v1.2.md`, `docs/ui/{DESIGN_SYSTEM,UI_IMPLEMENTATION_MASTER_PLAN,UI_QA_MATRIX,SCREEN_SPECS,AGENT_UI_WORKFLOW,PRODUCT_DESIGN_DIRECTION}.md`, `docs/plans/WEB_PLAN.md`.
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- Vercel React Best Practices: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Taste/anti-slop design review: https://www.tasteskill.dev/docs, adapted to POS; decorative GSAP/landing-page patterns are intentionally out of scope.
- Apps: `apps/web-pos`, `apps/web-owner`; Staff RN assessed only where full-FE acceptance depends on hardware/safe area/accessibility.

Statuses: **PASS** = supported by inspected implementation and appropriate existing test; **PARTIAL** = some coverage but known gap or insufficient evidence; **GAP** = clear missing implementation or verification.

## Checklist matrix

| Guideline area | Assessment | Evidence / remaining issue |
|---|---|---|
| Typography/offline dependency | PASS in code; native visual unverified | `packages/ui/src/web-tokens.css` vendored Be Vietnam Pro, `apps/mobile-staff/src/ui/BeVietnamText.tsx`; local asset integrity tests |
| Semantic tokens & reduced motion | PASS for shared base | CSS `:focus-visible`, `prefers-reduced-motion`, VND tabular numerals; manual focus-occlusion still unverified |
| Core role/financial truth | PASS in reviewed slices | Staff is intent-only; POS cash persists request before capture, pending vs paid vs print UNKNOWN separate; extensive domain and browser mocked regression |
| Owner Query isolation | PASS for key panels | `useQuery` selectors, independent KPI components, `useInfiniteQuery` for history, Profiler test |
| POS data isolation & rerender | GAP | `apps/web-pos/src/main.tsx:11-42,99-108,131-155`: all server data and views in one `App`, full `orders()` fetch at 2.5s interval with no cancellation/concurrency guard |
| Screen/component boundaries | PARTIAL | Owner extracted modules, POS monolithic, Staff RN still large `App.tsx`; no POS `OrderQueue`, `CashTenderPanel`, `ReceiptStatus` modularity |
| Navigation semantics & state | PARTIAL | Owner paths + popstate work, sales period/date URL works; `AppShell.tsx:16-18` navigates using buttons, so can't open in new tab; catalog search/filter and POS mode/filter/selected not URL-backed |
| Keyboard & forms | PARTIAL | Login forms and Owner dialog focus trap good; `ProductFormDialog.tsx:54` is button-driven rather than a submit form, strips all non-digits on price input, and disables save before showing validation; POS shift/cash also uses click handlers rather than form submit |
| Unsaved changes | GAP | `ProductFormDialog.tsx:34-37,54` closes with Escape/backdrop without dirty-state confirmation; `apps/web-owner/src/main.tsx:76,94-105` can navigate away from editor without warning |
| Focus, labels & accessible feedback | PARTIAL | Skip links, focus ring, many explicit labels/role alerts and axe smoke; missing evidence for full keyboard journey of BANK, printer exception/reprint, all destructive dialogs and WCAG 2.2 focus-not-obscured |
| Touch targets/zoom/mobile | PARTIAL | Browser suite covers Owner 320/390 and POS 1024/1366 in Chromium, but actual 125–150% Windows OS scaling, browser 200% zoom and mobile Safari not verified |
| Cross-browser + visual baselines | GAP | `playwright.config.ts` configures Chromium only; `screenshot:'only-on-failure'`, no approved golden screenshots/diff thresholds, no real Safari/Firefox |
| Loading/error/empty/recovery | PARTIAL | Critical cash unknown and QR fallback handled; generic `catch` and error banners lack first-invalid-field focus; loading buttons often replace labels, no systematic empty/sparse/dense review |
| Performance measurement | PARTIAL | `scripts/check-web-bundles.mjs` enforces JS/CSS gzip; latest measured POS JS **80.1 KiB**, CSS **4.6 KiB**; Owner JS **91.7 KiB**, CSS **4.8 KiB**, all under budgets. Fonts/images and Core Web Vitals (LCP/INP/CLS), frame responsiveness, interaction latency are **not** covered by those numbers |
| Load/pagination | PARTIAL | Owner history uses cursor pages but flattens all previously loaded rows; POS fetches/filters/sorts entire queue on each refresh; no measured 300+/day DOM/CPU performance |
| Network/remote dependencies | PARTIAL | Fonts local and cash LAN flow intentionally robust; bank QR is a third-party `https://vietqr.app/img` request in `vietQr.ts`, with a textual fallback; do not claim QR works without Internet |
| Timezone/i18n | PARTIAL | Sales windows and today's shop date are explicitly Vietnam-local; several displayed `new Date(...).toLocaleString('vi-VN')` calls omit `timeZone:'Asia/Ho_Chi_Minh'`, so a remote Owner on another OS timezone may see different transaction wall times |
| CI gates | PASS for current verified commit | `3b64cf5` GitHub Actions green (six workflows); these pass mocked Chromium tests, build, Node domain/integration, Expo JS bundle; not bank sandbox/printer/physical UX |
| Documentation alignment | GAP | `docs/ui/PRODUCT_DESIGN_DIRECTION.md` still claims old colors/system-font baseline and 10/16px radii; `UI_IMPLEMENTATION_MASTER_PLAN.md` prescribes 4-item Owner mobile navigation vs six currently implemented |

## Findings with priority, reproduction, and minimal corrective action

**P0 — release evidence blocker (not a demonstrated functional defect):**
- **F-00**: no approved screenshot matrix, 200% real zoom, real Safari/Firefox or physical 320dp/Windows 125–150% scale. `playwright.config.ts:12-24`, `docs/ui/UI_QA_MATRIX.md`. **Fix:** collect actual captures + overflow/focus/primary-money-action assertions in Owner 320/390/768/1366, POS 1024/1280/1366/1920, Staff 320/390 dp 200% text; include print UNKNOWN and bank PENDING. Do not relabel this as an automated pass. Hardware bank verification and printer/customer+store copies are separate release gates under AGENTS.

**P1 — engineering and guideline fixes before calling the frontend finished:**
- **F-01**: POS `main.tsx:35-42,99-108,131-156` polls the full list every 2.5s, without preventing slow-response overlap, and rerenders a monolithic App. **Fix:** extract `useOrdersQuery`/shift/status query slices, cancellation or stale-response handling, bounded/paginated recent history and isolated memoized list/detail/tender/receipt components. Profile first; preserve payment idempotency.
- **F-02**: Owner nav uses button instead of an anchor (`AppShell.tsx:16-18`) although `router.ts` has real paths. **Fix:** semantic links with working Ctrl/Cmd-click, retain SPA client navigation and popstate focus/scroll handling. Route param filters in catalog; do not expose credentials/drafts in URLs.
- **F-03**: `ProductFormDialog.tsx:54` lacks a true `<form onSubmit>`; price filter drops characters silently; no inline per-field validity/first-error focus. **Fix:** proper form, field errors, reasoned validation and user-friendly numeric parsing, while backend keeps integer VND authority.
- **F-04**: editor can be dismissed/navigated with unsaved modifications (`ProductFormDialog.tsx:34-37,54`; `main.tsx:76,94-105`). **Fix:** dirty guard with confirm/continue editing, including overlay close and route transitions; preserve documented idempotent retry policy for an *already submitted* request.
- **F-05**: add real WebKit/Firefox runs, screenshots and assertions for 200% zoom/focus obscured, browser Back/Forward + scroll and extreme long product/money text. **Fix:** extend `playwright.config.ts`, `tests/ui` and CI in focused increments; never ignore failures.
- **F-06**: third-party QR image and displayed transaction timezone. **Fix:** audit external transfer-data disclosure and offline fallback; use explicit Vietnamese timezone for shop-event wall clocks on remote browsers, with tests in non-VN timezone.
- **F-07**: code/design docs drift. **Fix:** align `PRODUCT_DESIGN_DIRECTION.md` and `UI_IMPLEMENTATION_MASTER_PLAN.md` with Be Vietnam Pro, current color/radius, nav and approved UX changes; remove contradictory acceptance text.

**P2 — improvements after P1:**
- **F-08**: font byte budget, preload and Vietnamese-safe subsetting (avoid accidental missing glyphs); bundle check currently excludes font assets.
- **F-09**: Owner page sections imported eagerly at `apps/web-owner/src/main.tsx:6-12` despite route-splitting roadmap; consider lazy-loaded noncritical routes after measuring.
- **F-10**: remove accumulating CSS overrides and arbitrary legacy values in `apps/web-owner/src/styles.css`, `apps/web-pos/src/styles.css`; consolidate semantic layers and delete dead rules after snapshot comparison.
- **F-11**: add Vitest/Testing Library/MSW component-level negative-state tests and real interaction/performance P50/P95, in addition to existing Playwright + Node integration.
- **F-12**: polish accessibility semantics of custom tab/method groups, meaningful input `name`/`autocomplete`, field-level live errors and delayed loading affordances based on operator feedback.

## Evidence from CI (head `3b64cf5`)

- App checks, build, bundle budget, domain and integration: https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/39191827279
- Owner/POS Chromium Playwright/axe: https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/39191827333
- Native Expo production JS export (not on-device acceptance): https://github.com/vitoo16/banh-mi-cho-pos/actions/runs/39191827203
- CI screenshot configuration is failure-only; no successful screenshot baseline is available.

## Suggested closure sequence (small independently verified slices)

1. POS queue/query/component extraction + payment-state regression, keep current payment authority/retry guard.
2. Owner semantic routing/dirty editor/form improvements + existing idempotency tests.
3. Multi-browser and real screenshot QA; keyboard, zoom, extreme text, cash/bank/print exception scenarios.
4. Runtime performance instrumentation and large queue with WAN-down/LAN-up.
5. Harmonize docs/tokens, close P1/P2, have an independent visual/operator review, then mark release ready only with physical gates.

**Audit limitation:** This is a source/CI review, not a manual live browser session on target hardware. PASS means reviewed evidence within that boundary, not a universal accessibility conformance certification. Vercel rules specific to Next.js SSR, server components and SEO-driven marketing sites are **not applicable** to this React/Vite operational SPA; no reason to add Next.js or GSAP.
