# Screen-by-screen implementation specification

**Status:** Planned, no implemented screens. **Source of truth:** MVP v1.2. **Priority:** RN Staff + Vite POS first; Vite Owner second. Do not introduce prep/inventory views.

## Shared state naming and financial affordances

- UI may derive `payment_display`: `UNPAID`, `BANK_PENDING`, `PARTIALLY_PAID`, `PAID_VERIFIED`, `EXCEPTION`, `REFUND_PENDING`, `REFUNDED`; backend/source contract remains authoritative. These are presentation mappings, not a request to invent DB enums.
- Staff `requested_payment_method` is intent, *never* proof. Method selected on Staff Order Review; no cashier control on Staff.
- `NETWORK_ONLINE_LAN`, `HUB_UNREACHABLE`, `CLOUD_STALE` states must be separate; disconnected cloud does not imply cash checkout unavailable.
- Every actionable form renders field-level errors; global failures render next step; no generic toast-only failed transaction.
- No customer identity/phone field required in MVP; don't force customers to register.

## A. React Native Staff — P0

### RN-00. Login / device pairing

**Task:** Authorized employee starts receiving orders quickly.

- Content top-to-bottom: store name, device trust state, PIN/login, `Đăng nhập`, network diagnostics secondary; compact current employee when session resumed.
- Security: no printed/secrets in UI; PIN input masked, server backoff on failures, logout/lock option; device pairing/revocation in owner settings.
- States: first pair / working / offline LAN / blocked device / expired session / wrong PIN / retryable timeout. Offline PIN behavior must follow backend policy, never hand-wave insecure fallback.
- Small screens: no keyboard-cover over primary CTA, vertical scroll when font scale 200%.
- Exit: authenticated and cached catalog loaded / clearly explained reconnect issue.

### RN-01. Menu / rapid order

**One-hand mobile shell**:

```text
┌─────────────────────────────────┐
│ BÁNH MÌ CHỢ        Đơn của tôi  │  compact header, optional status warning
│ [Tìm món...]                    │  only if useful at catalog scale
│ [Tất cả] [Bánh mì] [Bánh bao]  │  horizontally scrollable chips INSIDE strip only
│                                 │
│ Bánh mì thịt nguội       35.000đ│
│                       [−] 2 [+]│
│ Bánh mì đặc biệt         45.000đ│
│                       [−] 0 [+]│
│ Bánh bao                20.000đ │
│                       [−] 1 [+]│
│ ... vertically scrolling menu ...│
├─────────────────────────────────┤
│ 3 món  ·  90.000đ   [Xem đơn →]│  sticky SafeArea footer
└─────────────────────────────────┘
```

- Product **name + price** only, never photo/remaining stock/recipe/cost. Quantity inline ± controls; `−` disabled at zero. Category strip optional and horizontally scrollable **only within its own region**, not page-wide overflow. Search overlay for >~20 products, decision validated in prototype.
- Long name wraps max two lines without clipping price; allow row height to grow; minimum accessible row height ~64–80dp as content needs, controls ≥44dp.
- Fixed footer shows running item quantity, client-side estimate, `Xem đơn` or `Xem đơn (3)`; overlay not hide last product row (scroll content has padding).
- Do not put note field or payment method in every product row. Optional product note in cart row via edit affordance.
- Empty catalog => `Chưa có món để bán` + retry/contact owner; no endless spinner. Zero selection disables `Xem đơn`.
- Responsive/zoom: 320dp and 200% font scaling may stack name/price above qty instead of squeezing into one row; never shrink prices to unreadable size.
- RN performance: use stable callbacks and memoized rows; virtualized list if size/measurement justifies; do not memoize at the cost of stale qty.

### RN-02. Review and requested payment (same screen)

- Header: `Kiểm tra đơn` with Back; selected items with qty +/- and delete, item note editing (optional), collapsed `Thêm ghi chú cho đơn` control, subtotal/total using cached snapshot as **estimate** until Hub confirmation.
- Payment method **must appear on this screen before save**: two prominent stacked/segmented options `Tiền mặt` (default) and `Chuyển khoản`. MoMo/Mixed are *conditionally present* only when enabled. On 320dp, stack as full-width tiles; never put 4 methods squeezed into 4 columns.
- Sticky footer: total + single primary `LƯU ĐƠN` button (≥52dp); contains safe-area inset. Review content scrolls above footer; keyboard avoiding view when note opened; do not move CTA underneath keyboard.
- On save, freeze intent + chosen method and generate one idempotency key. `SAVING`: button becomes `Đang lưu…`, disabled to avoid double-submit. ACK unknown: `Chưa xác nhận được đơn. Kiểm tra trước khi gửi lại` and `Kiểm tra lại đơn` resolving the **same** key. Never generate second order silently.
- Price changed by owner: Hub returns current price/quote conflict; display affected items `Giá vừa cập nhật` with before/after and explicit `Dùng giá mới`; do not auto-save different total.
- Mobile back preserving cart, note and method; no unexpected reset. Clear only when durable ACK.

### RN-03. Order saved / verbal handoff

- Clearly show **server-generated short code**, final server total, requested payment label `Khách chọn: ...`, `Đã lưu đơn` and instruction **`Báo miệng cho người chuẩn bị bánh`**.
- Optional view payment *read-only* state; do not mark PAID on save. CTA `Tạo đơn tiếp` immediately resets to menu; `Xem đơn của tôi` secondary.
- Haptic confirmation only after durable ACK, accessible announcement. Show fallback code and retry unknown state, not fake code from device time.

### RN-04. My recent orders

- Chronological compact list: short code, time, total, `Khách chọn`, actual pay state READ-ONLY if synced; 10–20 recent rows, paging when more. Tap shows read-only receipt-like summary (no kitchen state).
- Badge `Trạng thái chưa cập nhật` on stale feed; data sync time accessible. On revoke/logout no cross-employee private data leakage.
- Empty/error/offline all intentional. Pull-to-refresh optional; do not poll aggressively in background.

## B. Web POS Cashier — P0

### POS-00. Cashier lock / open shift

- Login/PIN, current store, connection to Hub/printer, opening float from counted cash (optional denominations); one active drawer/shift owner.
- Block checkout if shift ownership not confirmed, with actionable `Mở ca` / `Đổi thu ngân` (privileged); show shift state in compact header, not giant banner.

### POS-01. Live order queue / search

- Above-the-fold: brand/shift/sync indicator, search by code, tabs `Chờ thu` / `Chờ xác nhận CK` / `Đã thu`, order list new/unpaid priority. **No stock, no prep status**.
- Row: `#B104` large enough, time, creator, amount, `Khách chọn: Tiền mặt/CK` & real state label. Differentiation text + icons; no bank-pending row marked paid.
- One click/tap into checkout. Optimistic animation can acknowledge tap, **never** update ledger/payed UI before response.
- Responsive POS: ≥1024 CSS width split list/detail if checkout side remains ≥500px; below threshold use queue full screen -> checkout full screen. At 1024 px do not let side column squeeze the main amount.
- Queue list virtualization/pagination for busy shifts, order IDs stable, live inserts do not steal focus/scroll under cashier's finger; pause/re-anchor new-order updates with `Có 4 đơn mới` action if active selection.
- Keyboard search shortcut `/` when not typing, Escape closes detail, Enter on selected order; cashier preferences configurable after usability validation.

### POS-02. Cash checkout

```text
┌───────────────────────┬───────────────────────────────────────┐
│ ĐƠN CHƯA THU          │ #B104 · 2 bánh + ghi chú              │
│ #B104   90.000đ       │ PHẢI THU      90.000đ                │
│ #B103   35.000đ       │ Tiền mặt  [Chuyển khoản]            │
│ ...                   │ KHÁCH ĐƯA [100000_________________]  │
│                       │ [100k] [200k] [500k] [Nhập khác]    │
│                       │ TIỀN THỐI     10.000đ                │
│                       │ [Xác nhận đã nhận tiền]             │
└───────────────────────┴───────────────────────────────────────┘
```

- DOM/layout not exact pixels; use responsive grid and fluid typography. Large numeric amount `Phải thu`, amount tendered numeric field, change prominent. Presets dynamically relevant but must not accidentally submit.
- Show `Khách chọn` as contextual info, real method selector as cashier-owned action. Cash capture is one deliberate button press after adequate amount, with response status and operation reference.
- Disable confirm on insufficient amount, malformed/overflow input, shift locked, payment already settled, inaccessible Hub. Show `Còn thiếu ...` inline and appropriate correction.
- Split/Mixed only with feature flag and contract support; initially hidden. If partial captured, show amount already collected and due remainder, never replace earlier capture history.
- Confirm then show payment verified + printing separate state; receipt printer failure does not change payment to unpaid.
- Use modal only for high-risk exceptions, not every normal transaction. No CTA overlaps numeric keyboard.

### POS-03. Bank QR / pending

- Exact order code + amount + payee reference + dynamic QR rendered only when backend supplies valid payment request. Keep QR scannable 220–320px depending viewport and instructions unobstructed.
- Status: `Đang chờ ngân hàng xác nhận`, optional waiting clock (NOT auto-paid), `Đã xác nhận` only after verified backend event, `Cần kiểm tra` for wrong amount/ref/duplicate/bank outage.
- Provide `Quay lại đơn`, `Kiểm tra giao dịch`; manual cash switch allowed before settlement and with reconciliation logic; no cashier one-click fake approve without explicit elevated exception flow.
- QR expiration/refresh from API, never use client-constructed unverified link/account; reconnect displays stale indicator.

### POS-04. Receipt state (inline order detail)

- After verified full settlement, two copies on one printer: `Liên khách` and `Liên tiệm` with `PENDING`, `SENT`, `PRINTED_CONFIRMED` only when device feedback truly supports it, `FAILED`, `UNKNOWN` states. If no physical acknowledgement, do not claim definitive PRINTED; use `Đã gửi máy in`.
- Show clear one-copy retry with `IN LẠI` and user confirmation; never submit payment capture on reprint; client only requests print job from Store Hub.
- If one copy fails, cashier can print missing copy, with warning about uncertain physical output in UNKNOWN case. Receipt error doesn't alter money ledger.

### POS-05. Cash drawer / movements

- Header current cashier, shift start, expected current cash (authorized read), quick `Bổ sung tiền`, `Rút tiền`, `Chi tiền`, all explicit reason & authorization. Never bury these actions in general app settings.
- No employee cash handling shortcuts outside cashier role. Error state when conflicting shift owner.

### POS-06. Close shift / cash count

- Use one-column sections where possible: expected amount, denominations input (optional), counted total, signed variance, reason, confirmation with accountability. No side-by-side columns that produce numeric clipping at 1024 or high scaling.
- Freeze/lock once close transition begins, protect against concurrent payment in progress with clear blocker and decision path.
- Emphasize **difference**, positive/negative sign and explanation; do not suggest correcting records to make difference zero.

## C. Vite Owner — P1

### OWNER-00. Role-safe sign-in

- MFA/provider policy as defined elsewhere; session expiration state; no financial data cached in public/shared kiosk view. No credentials visible in error details.

### OWNER-01. Dashboard (mobile first)

- At 360dp: prominent `Doanh thu đã xác nhận`, day filter, compact cards for Cash / Bank / MoMo (when enabled), `Đơn đã thu`, `Chuyển khoản cần đối soát`, `Chênh lệch quỹ`; timestamp of latest sync. **No default pie chart and no 8 KPI tiles in first fold**.
- At desktop: summary across grid 2–4 columns, optional detail chart lower on page lazy loaded. Each metric has definition tooltip and links to underlying filtered transactions.
- Never call calculated turnover real profit. If no cost data, show `Lợi nhuận: Chưa có dữ liệu giá vốn/chi phí` or omit profit entirely.

### OWNER-02. Orders browser

- Mobile: quick date/status/payment filters in bottom sheet; compact order cards with date, code, amount, settlement channel and created by; tapping opens details. Desktop: table with stable columns and pagination, no horizontal scrolling at supported 1024 width; additional columns in details.
- Distinguish method *requested* and settled allocations in order detail.

### OWNER-03. Reconciliation

- First view prioritizes unmatched/underpaid/overpaid, delayed webhook; each exception has amount, order/ref, reason, possible safe actions + audit confirmation; nothing automatically matched on amount alone.
- Mobile wraps each exception into an actionable card, not tiny multi-column table. Information hierarchy: issue -> impact -> proposed action -> audit.

### OWNER-04. Catalog management

- Listing name, current price, category, enabled state. Mobile search + item cards; edit via full-height form/page with name, integer VND, category, optional note/price version; clear `Lưu thay đổi` with validation and safe back handling.
- Before commit preview old/new price; old orders preserve snapshot. No stock count input. No product image requirement.

### OWNER-05. Employees & settings

- List employee & role, invite, revoke, reset limited permissions. Payment feature flags behind explicit settings; bank integration credentials handled securely server-side, never echoed in UI.
- Responsive forms with field help, destructive confirmation and log entries.

## D. Cross-platform component contracts

| Component | RN staff | POS Vite | Owner Vite | Important state |
|---|---|---|---|---|
| `CurrencyAmount` | small price / sticky total | due/change hero | KPI amount | integer VND, tabular nums, formatted |
| `ProductQtyRow` | required | order detail read-only | edit price elsewhere | disabled minus at 0 |
| `PaymentMethodSelector` | requested only | actual cashier selection | filter/report only | CASH default; feature gates |
| `ConnectionIndicator` | Hub LAN | Hub+printer | cloud freshness | no always-green fake |
| `OrderCode` | success after ACK | queue/receipt | history | server-generated only |
| `FinancialStatus` | read-only | authoritative event | reporting | pending != paid |
| `MoneyInput` | not allowed | cash tender/float/count | price only, separate semantics | VND integer, field validation |
| `ActionFooter` | save + total | confirm cash | save settings | safe area + non-overlap |
| `ErrorRecovery` | resolve unknown ACK | verify capture/print | refresh status | actionable recovery |

Shared tokens via `packages/ui` where useful; UI elements have *separate native and web implementations* to avoid browser-specific abstractions leaking into RN.

## E. Storybook or screen harness

Before connecting to backend, each screen requires deterministic fixture coverage: default, loading, empty, narrow viewport, long Vietnamese name, large VND (e.g. `12.345.678đ`), keyboard open, 200% text scale, no hub, stale cache, bank pending, duplicate acknowledgement, printer unknown. Use RN preview/dev build and Vite story/screenshot harness; no fake in-app data on production paths.