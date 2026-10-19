# Frontend remediation and release decision

**As of 2026-10-19 — PR #76 — current code head is evolving.**
This follows the immutable source audit `FRONTEND_GUIDELINES_AUDIT_2026-10-19.md`; CI evidence must always name the exact SHA that passed.

| Audit ID | Implementation | Evidence gate |
|---|---|---|
| F-01 POS data structure | Cashier queue and operational status use isolated TanStack Query streams; component extraction: OrderQueue and CashTenderPanel | Typecheck, bundle, cash idempotency/domain/integration, browser E2E; 300+ order queue test |
| F-02 Owner navigation | Real links with href preserve modifier/new-tab gestures; SPA pushState/back remains | Responsive Playwright tests updated to link semantics |
| F-03 product form | Enter/form submit with typed VND validation and inline accessible failure | Regression test for invalid numeric and Enter save |
| F-04 unsaved drafts | Close/navigate/logout/reload and browser back protect edits; remote idempotent retry payload remains authoritative | Dialog tests for confirm dismiss/accept, popstate test |
| F-05 cross-engine and snapshots | Chromium full suite; Firefox and Linux WebKit smoke; screenshot review candidates uploaded regardless of result | CI screenshot artifacts **are not approved pixel baselines**; macOS Safari, target hardware and visual signoff pending |
| F-06 VN timezone | Explicit timeZone for displayed Owner/POS timestamps; bank QR still an external network dependency with copy/paste fallback | Browser smoke; offline QR acceptance still pending |
| F-07 outdated docs | Design tokens/theme meta, mobile nav and font documentation aligned | Docs CI |
| F-08 font budget | Build asset check now counts locally emitted TTF/WOFF/OTF separately with an 850 KiB compressed font cap per Web app, along with JS/CSS budgets | Verify real output size via newest App CI; font byte budget is not a runtime font-loading metric |
| F-09 route splitting | Owner noncritical pages are lazy-loaded via `React.lazy`/`Suspense`; dashboard remains eager | Build/browser E2E green on `5e92297` plus later follow-up (latest head must also pass) |
| F-10 CSS consolidation | Some historical override layering remains | Still open |
| F-11 runtime perf | Bounded Owner history DOM (80 rows at a time), POS queue 80 rows at a time, DEV-only React Profiler assertion that cash input does not commit the unchanged queue | Mock-browser render isolation under test; real-device P50/P95, INP/LCP/CLS still open |
| F-12 secondary accessibility | Added keyboard drill for printer UNKNOWN -> select affected paid order -> no second cash action; Hub pending state hides false empty queue and disables disconnected shift actions | Playwright check pending on current head; real screen readers and operator hardware audit still open |

**Guardrails:** no change to ledger, cash settlement, bank verification, staff permissions or receipt exactly-once claims. POS retains persistent cash idempotency key and no second capture on ACK unknown. Production quantities never capped by display pagination.

### How to sign off
1. Every check on the **latest** head SHA must be green; older green commit does not prove latest.
2. Review CI PNG candidates for Owner 320/390/768/1366 and POS 1024/1280/1366/1920, plus POS 1024 with large root text. Check Windows 125/150% OS scaling and actual browser zoom separately; root-font scaling is not equivalent to physical OS/browser scaling. A screenshot produced by CI is only a *candidate*, not an accepted visual diff.
3. Record real device trials for Staff Android/iOS, keyboard/safe area/TalkBack/VoiceOver, the receipt printer two-copy + UNKNOWN flow, and bank sandbox verification. Full POS cash LAN-only without Cloud must be observed.
4. Owner/operator chooses final colors, typography and navigation, then record approval. Keep Draft until explicit release acceptance.

## Measured pre–cross-engine evidence
Commit `8473a92`: POS JS 90.2 KiB gzip, CSS 4.7 KiB; Owner JS 92.2 KiB, CSS 4.9 KiB; both under repository budgets (assets/font bytes, browser runtime and printer not measured). Re-run evidence on final SHA.

## Font asset budget methodology
Both Web builds are now checked for emitted TTF/OTF/WOFF/WOFF2 in dist (all subdirectories), in addition to JS and CSS. Font gzip bytes are reported independently; test fixtures verify font detection and over-budget rejection. This is a transmission-size proxy rather than a Core Web Vitals or first-render measurement. If either Web app exceeds 850 KiB, keep the failed check and optimize the local assets rather than raise the cap without evidence.

## Current follow-up test notes (2026-10-19)
- Owner history now keeps only 80 loaded rows in the DOM, with explicit `Hiện thêm` while retaining access to all fetched pages; 325-item read-only fixture proves full loaded-order search.
- POS initial auth/query screen no longer declares a working Store Hub before it has an authoritative successful read; disconnected shift actions are disabled.
- Developer-only POS `DevProfiler` captures *commit identifiers only*, not money/customer/session data; the tender-entry test checks unchanged queue isolation. The production build excludes the profiler wrapper.
- `browser-smoke.spec.ts` now saves screenshot **candidates** at more approved viewports. CI artifacts are not pixel-verified baselines and have not been visually approved.
- Printer UNKNOWN keyboard test proves a paid order from the exception list does not offer a second cash capture. This does not replace a physical paper-out/reprint drill.
