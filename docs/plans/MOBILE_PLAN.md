# Frontend mobile plan — React Native + Expo staff app

**RN native app with Expo development builds**; no web-only PWA as final mobile choice. Android is expected default, but iOS viability requires device evidence. RN works over store LAN to local Hub; do NOT call cloud from every order when local service is healthy.

## Core screens

| ID | Screen | Primary interaction | Edge cases |
|---|---|---|---|
| FM-00 | Pair/login | Pair approved device, employee sign in (server scope) | Revocation, lockout, offline auth policy |
| FM-01 | Menu | **ONLY item name + price**, optional category/search, +/- qty | Empty catalog, stale version, offline hub |
| FM-02 | Cart | Selected items, quantities, optional note per item/order, total | Price change/stale catalog, fast edits |
| FM-03 | Requested payment picker | CASH default, BANK, optional MOMO/MIXED only enabled | Disabled options never persisted |
| FM-04 | Save confirmation | Large SAVE button, unique order ID after persisted ACK, call out verbal prep | Double tap, slow response, timeout unknown |
| FM-05 | My recent orders | Recent IDs, totals, requested method, READ-ONLY actual pay status | Reconnect and live status delay |

## State design
- Cart is ephemeral in RN memory; persistent draft optional after M0 decision. Key user action creates a unique `client_request_id` and `Idempotency-Key` reused on retry, not regenerated each tap.
- `SAVING`: lock save; `CONFIRMED`: backend ACK includes order_id and display_code; `UNKNOWN_RETRY`: resolve by idempotency key before attempting another create. Never tell worker to verbally hand off a save that hub has not durably ACKed.
- Product price is cached for display only. Server makes final total from price history; if stale mismatch, show refresh/accept before order create. No client authoritative amount.
- RN app cannot mark PAID, open cash drawer, print receipts, alter prices, show total financial turnover or record stock.

## Connectivity POC
- Build actual Expo dev clients. Establish allowed local network permission / origin trust per platform (iOS ATS/local network and Android network security config); avoid permitting insecure arbitrary traffic. Device pairing/revocation, NAT/firewall rules documented.
- Network fixture tests: WAN down LAN up, hub reboot, phone sleep/resume, reconnect, duplicate taps, two phone clocks out of sync.
- If LAN connection cannot be secured with chosen certificate/pairing method, STOP and author ADR with options. No insecure hard-coded shared API key to expedite delivery.

## Performance / UX
- Frequent menu interactions must avoid unnecessary list rerenders; memoized item rows and selectors; stable callbacks; virtual list only when menu large.
- Preload small cached catalog after login. No heavyweight charts/videos; staff UI has no stock or prep tracking.
- Font >= readable minimum, 44–48pt large tap targets; one-hand order capture, no horizontal scroll for payment options.
- First-time staff should place routine order in ≤15 seconds (usability target to validate), total interactions for common 1–2 product sale ≤6 taps after screen is open (target; not proven).

## Tests
- Unit: cart sum quantity and notes, method default and gated choices, formatting, stale price, server error handling.
- Component: accessibility, loading, double-submit prevention, server-assigned order display.
- Integration: mocked Hub auth + order create + idempotency replay + reconnect.
- Mobile E2E choice Maestro vs Detox finalized in POC, test Android real device and available iOS, includes airplane-mode WAN down LAN connected (by controlling WAN router rather than putting phone fully offline).

## Deliverable
Expo project bootstrapped and reproducible in CI; RN app links to shared generated contract package; no native change without build/test proof; no store staff banking credentials on phone.

## Detailed UI execution overlay (P0, 2026-10-10)

Before any RN UI task read `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md`, `docs/ui/SCREEN_SPECS.md` (RN-00..RN-04), `docs/ui/DESIGN_SYSTEM.md`, `docs/ui/UI_QA_MATRIX.md`, and `docs/ui/AGENT_UI_WORKFLOW.md`. UI-01A implements Menu + Review + requested CASH/BANK, UI-01B implements verified Hub ACK and recent orders. No new kitchen/inventory or staff financial authority. Agents use local `expo-react-native`, `mobile-first-operational-ui` skills and current reviewed Vercel RN + Taste references. RN screen baseline 320dp with keyboard + safe area; signed off only with real Android handset measurements.

## Durable failed-create handling (2026-10-11)

The shared `classifyOrderCreateFailure` uses actual Hub error **codes**, not numeric HTTP status, to decide if local staged draft can be safely cleared. Unknown results including legacy idempotency 409 preserve the original key+payload and show Recovery; staged SQLite records are immutable for a given key. Only confirmed explicitly pre-commit validation errors clear the staging record for user editing. See `tests/order-create-recovery.test.mjs` for server error classification fixtures. This does not substitute for real Android/iOS process-termination tests.
