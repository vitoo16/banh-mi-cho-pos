# Taste-led full app redesign — implementation checklist

Status: **foundation in progress**; not a finished full-system redesign.

## Art direction
Bánh Mì Chợ is an operational tool, not a generic SaaS dashboard. Favor a clear menu, fast queue triage, legible currency and calm actions. Warm neutral canvas, muted green-black headers, restrained bakery-brown action accent, and quiet boundaries replace bright gradient cards, excessive shadows, decorative badges and microanimations.

## Typography
Target: **Be Vietnam Pro** across Owner Web, Cashier Web, and Staff Native.
- Web CSS uses a Be Vietnam Pro-first fallback stack.
- **Release blocker:** vendor WOFF2 font files locally in the monorepo and define @font-face; don't depend on remote Google Fonts for POS LAN/offline.
- **Release blocker:** vendor compatible TTF/OTF assets for React Native, load via expo-font with splash/loading guard, and apply to all Text/TextInput variants. No font file is included in this initial PR; this is *not yet* font-complete.
- Preserve system fallback for accessibility and failed font loading; tabular lining numerals must remain readable for currency.

## Order of implementation
1. **Foundation:** unify color/spacing/radii/focus semantics across shared CSS and RN tokens (this PR).
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
Foundation CSS updated in this branch. Physical screenshots, tests and local font assets **not yet verified**; do not claim completed implementation or readiness to deploy.
