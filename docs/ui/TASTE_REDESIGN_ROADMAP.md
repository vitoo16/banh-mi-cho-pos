# Taste-led full app redesign — implementation checklist

Status: **implemented code slices under review**; no real-device or operator visual signoff. Not a finished full-system redesign.

## Art direction
Bánh Mì Chợ is an operational tool, not a generic SaaS dashboard. Favor a clear menu, fast queue triage, legible currency and calm actions. Warm neutral canvas, muted green-black headers, restrained bakery-brown action accent, and quiet boundaries replace bright gradient cards, excessive shadows, decorative badges and microanimations.

## Typography
Target: **Be Vietnam Pro** across Owner Web, Cashier Web, and Staff Native.
- Web CSS uses a Be Vietnam Pro-first fallback stack.
- **Implemented in this PR:** local TrueType originals from Google Fonts with @font-face for four weights (400/500/600/700); no WAN font downloads. Includes SIL OFL license.
- **Implemented in this PR:** same local TTF assets bundled with Expo useFonts, a loading/failure fallback, and typography wrappers applied to Text + TextInput. Real-device font rendering remains to be verified.
- Preserve system fallback for accessibility and failed font loading; tabular lining numerals must remain readable for currency.

## Order of implementation
1. **Foundation:** unify color/spacing/radii/focus semantics across shared CSS and RN tokens (implemented).
2. **Owner:** login, navigation, dashboard (daily totals), production sales by day/week/month/quarter/year, orders, catalog, finance, staff. Use route-specific typography, dense tables only as needed. Preserve TanStack Query data boundaries.
3. **Cashier:** queue/selected order, unpaid/paid/exception states, cash input and change, transfer confirmation, receipt printing and retry/UNKNOWN. No silent settling.
4. **Staff:** login, menu/quantity, cart and notes, payment intent, save confirmation, order history, crash/offline recovery. Keep idempotency and request locks.
5. **Visual QA:** compare actual screenshots for Owner 320/390/1366, POS 1024/1366 and mobile 320/390 with 200% text. Validate axe, keyboard focus, safe areas, long names and VND amounts.
6. **CI:** npm run check; npm run test:domain; npm run test:integration; npm run test:ui; npm run test:bundle; physical device smoke test. Green CI and reviewer sign-off required before merge.

## Rules
- Do not edit money semantics or API contracts for aesthetic purposes.
- Avoid added decorative panels, gradients, glassmorphism, mixed icon families, oversized hero copy, arbitrary letter spacing and motion on checkout.
- Avoid horizontal clipping of financial values, tabs or primary actions; test 320px and zoom.
- Owner dashboard production and daily order counts are **dynamic**, never hardcoded to 300.
- No stock/prep/KDS features without separate approved scope.

## Evidence tracking
Local font asset paths and code implemented; automated asset checks added. Native device rendering, physical screenshots and full regression test evidence remain outstanding; do not claim readiness to deploy.

## October 19 Web guideline remediation
- Owner navigation is now real SPA links with open-in-new-tab behavior. Catalog uses a proper submit form and protects unsaved drafts from modal exits, direct navigation and browser Back/Forward.
- Cashier now uses TanStack Query with separate queue and operations polling, stable shared cache and pause-on-hidden; OrderQueue and CashTenderPanel have independent UI boundaries. Queue shows older orders progressively, never hard caps daily totals.
- Web timestamps use explicit Asia/Ho_Chi_Minh. Chromium/Firefox/WebKit operational smoke, review-candidate screenshots and CI browser installs were added. This is not Safari on macOS.
- Remaining gates are physical operator, printer/bank sandbox and visual approval. See FRONTEND_GUIDELINES_AUDIT_2026-10-19.md and FRONTEND_REMEDIATION_STATUS.md.
