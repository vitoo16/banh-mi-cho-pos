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
| F-08 font budget | Self-hosted fonts proven available but gzip budget excludes TTF | Still open |
| F-09 route splitting | Owner pages still eagerly imported; lazy loading needs measurement and a safe loading affordance | Still open |
| F-10 CSS consolidation | Some historical override layering remains | Still open |
| F-11 runtime perf | Bundle budget and backend perf exist, browser P50/P95 and INP/LCP/CLS target measurement absent | Still open |
| F-12 secondary accessibility | Automated WCAG A/AA smoke and several focus flows; real screen readers and cashier exception focus audit absent | Still open |

**Guardrails:** no change to ledger, cash settlement, bank verification, staff permissions or receipt exactly-once claims. POS retains persistent cash idempotency key and no second capture on ACK unknown. Production quantities never capped by display pagination.

### How to sign off
1. Every check on the **latest** head SHA must be green; older green commit does not prove latest.
2. Review PNG candidate screenshots on Owner 390 and POS 1024 in multiple rendering engines, and collect missing Owner 320/1366 and POS 1280/1366/1920, Windows 125/150% zoom, 200% text. A screenshot produced by CI is only a *candidate*, not an accepted visual diff.
3. Record real device trials for Staff Android/iOS, keyboard/safe area/TalkBack/VoiceOver, the receipt printer two-copy + UNKNOWN flow, and bank sandbox verification. Full POS cash LAN-only without Cloud must be observed.
4. Owner/operator chooses final colors, typography and navigation, then record approval. Keep Draft until explicit release acceptance.

## Measured pre–cross-engine evidence
Commit `8473a92`: POS JS 90.2 KiB gzip, CSS 4.7 KiB; Owner JS 92.2 KiB, CSS 4.9 KiB; both under repository budgets (assets/font bytes, browser runtime and printer not measured). Re-run evidence on final SHA.
