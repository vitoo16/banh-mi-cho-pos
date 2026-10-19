# UI-00 — Bánh Mì Chợ unified operational design direction

**Status:** Implemented in code as the initial foundation; screenshot/device approval is outstanding.

## Primary design lead: Taste Skill (contextual, project-first)
Reading this as an operational UI for neighborhood Vietnamese bakery Staff, Cashier and Owner: warm, calm, precise and trustworthy, with high-contrast money and state hierarchy. Taste is the **art direction**, not permission to copy landing-page gradients/GSAP/scroll effects into a POS.

| App | DESIGN_VARIANCE | MOTION_INTENSITY | VISUAL_DENSITY | Primary UX |
|---|---:|---:|---:|---|
| Cashier POS | 3/10 | 1/10 | 7/10 | next unpaid → due → tender/change → verified status/2 copies |
| Staff Native | 3/10 | 1/10 | 6/10 | menu / qty / optional note / method intent / durable save |
| Owner Web | 4/10 | 2/10 | 5/10 | today count, true captured money, product-period quantities, safe admin changes |

Project override: do not import general website Taste animation, large hero, desktop-first grid, external font/CDN or flashy gradients; app must work offline LAN and on 320dp. Existing caramel accent and cream canvas are project design baseline, **not a finalized commercial brand identity**. The user has not yet supplied approved logo/font assets. Maintain one Lucide icon family on Web, existing native controls on RN (not a new heavy UI library).

## Visual system

- Single source of Web semantic tokens: `packages/ui/src/web-tokens.css` imported by Owner and POS. Native mirrors values in `apps/mobile-staff/src/ui/designTokens.ts`. A follow-up can promote platform-agnostic JSON build generation when stack agrees.
- Current visual tokens: ink `#202820`, muted `#5A665B` on white/warm canvas, caramel primary `#994515`; green `#166534` only for confirmed receipt/payment, amber pending, red errors. **Never use color alone**.
- Bundled Be Vietnam Pro (400/500/600/700), with system fallbacks and no remote font dependency during WAN outage. Currency and operational counts use tabular numerals.
- Radius convention: 8px control, 12px cards and 16px dialogs, select overlays have visible focus ring. Min Web key action 48px; RN qty buttons 48dp. Modal role/focus trap work scheduled as OR-08; no false a11y claims.
- Owner six-section mobile navigation currently scrolls horizontally with visible partial next item and 11px text instead of shrinking to 9px; outer document must never X-scroll. POS retains deliberate split queue/checkout at supported widths; no decorative motion on cash capture.
- Real test gates: responsive 320/390 Owner, 1024/1366 POS, 320/390 native, font scaling 200%, offline with no CDN calls, labels, money clarity, bank pending vs paid, print UNKNOWN. Browser mock tests are not physical evidence.

## External sources reviewed and trust boundaries

1. Taste v2 `design-taste-frontend` (Leonxlnx/taste-skill, 2026): https://github.com/Leonxlnx/taste-skill; applies its brief-first/taste dials and color/focus rules, **not** marketing motion defaults.
2. UI/UX Pro Max (nextlevelbuilder/ui-ux-pro-max-skill): https://github.com/nextlevelbuilder/ui-ux-pro-max-skill — design system/contrast and interaction heuristics.
3. Vercel Web Interface Guidelines: https://vercel.com/design/guidelines — focus, keyboard, touch, form semantics, performance.
4. Vercel React Best Practices: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices — avoid request waterfalls and broad rerenders; profile before memo/caching.
5. Project local: `AGENTS.md`, `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/UI_QA_MATRIX.md`, `docs/plans/OWNER_REFACTOR_REGRESSION_PLAN.md`.

Do not install remote skills or unreviewed npm packages as a side effect of UI styling. For each future redesigned feature: inspect current UI → define task-specific screen brief → implement 1 safe slice → targeted golden test & screenshot → one changed-source review → merge after green CI.

## UI redesign completion matrix (implementation tickets)

- **UI-00 (this PR):** cross-platform visual semantic token foundation, offline typeface, focus/contrast/touch cleanup and tests.
- **OR-01:** Owner login/Auth/Query boundary, independent regression; this is a distinct PR.
- **UI-OWNER-01:** Extract Catalog/Orders/Finance/Staff and refine hierarchy, lazy-load noncritical charts; preserve remote command PENDING and original idempotency key.
- **UI-POS-01:** Checkout component hierarchy, confirmation focus and bank receipt states; no source-of-money change. Golden CASH/UNKNOWN and bank pending tests mandatory.
- **UI-RN-01:** Split Staff Login/Menu/Review/History/Recovery modules; verify keyboard/safe areas, device trust, pending SQLite and 320dp/200% type.
- **UI-QUALITY-01:** Playwright visual baselines and axe for Web; RN real-device screenshots/accessibility signoff; React Profiler before/after and budget evidence. No claimed perf score before measurement.

**No new functions outside approved scope:** no stock, no kitchen, no automatic production quota (daily order volume variable), no staff-mark-paid, no bank screenshot-as-proof.
