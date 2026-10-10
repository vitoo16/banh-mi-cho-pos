# Practical design system — Bánh Mì Chợ POS

**Status:** Proposed tokens pending visual pilot; no brand identity supplied. Do not imply final logo/colors approved. Build RN and Web implementations from semantic tokens; never force React Native elements into DOM component package.

## Design direction

**Brand feel:** friendly neighborhood bakery + modern cashier reliability. Restrained, energetic only where an action matters, not decorative. White/cream neutral surface with dark readable text, one amber/caramel accent for primary actions, semantic red/green reserved for warnings/success, never an AI gradient. Ensure actual brand approval before freezing palette.

| Token | Light proposal | Usage |
|---|---|---|
| `color.bg` | `#FAF9F6` | application base |
| `color.surface` | `#FFFFFF` | input/card/receipt detail |
| `color.text` | `#1E2420` | primary copy, strong amounts |
| `color.muted` | `#5D6760` | secondary, labels |
| `color.border` | `#D9DFD8` | quiet separators |
| `color.accent` | `#A84F10` | primary brand accent; validate contrast for white text |
| `color.accentSurface` | `#FFF0E3` | chosen/hover surface |
| `color.success` | `#166534` | confirmed financial state + text label |
| `color.warning` | `#8B5E00` | pending/stale + text label |
| `color.danger` | `#B42318` | destructive/insufficient funds + text label |
| `color.focus` | `#2563EB` | high-contrast focus outline when necessary |

Use 2–4px focus ring/outset; all combinations must be programmatically tested for WCAG AA text contrast (≥4.5:1 for normal text, ≥3:1 for large text/UI critical outlines); APCA may supplement but must not replace required WCAG audits. Never use the accent color as the sole state indicator.

## Type scale (starting targets)

- **Base font:** system sans; Android Noto Sans / iOS SF, Windows Segoe UI fallback. Vietnamese diacritics thoroughly tested. Avoid custom marketing display fonts in cashier UI. Prefer stable numeral widths (`font-variant-numeric: tabular-nums` / RN font features where supported).
- RN: body 16sp minimum, secondary labels 14sp, item names 16–18sp medium, price 16–18sp semibold, order code 28–32sp, CTA 16–18sp, amount due/change 26–36sp, allow screen-reader font scaling.
- POS: body 16–18px, controls 17–20px, code 22–26px, amount due/change 32–44px, pending status 16px+ with textual explanation.
- Owner mobile: body 16px, metrics 26–34px, page titles 22–26px; tables in cards on narrow viewport.
- Prefer `clamp()` for desktop amounts, not fixed 48px text that clips a 7-digit total in narrow panes. Never reduce financial amount font under 22px to fit.

## Spacing and shape

- Spacing scale 4, 8, 12, 16, 20, 24, 32. Screen horizontal padding RN 12–16dp at 320–360dp and 16–20dp at 390+, POS 16–24px, Owner 16px mobile/24–32px desktop.
- Radius scale 8px controls, 12px cards/sheets, 16px major surfaces; **avoid huge 24px pills on every container**. Borders subtle, restrained shadows on overlays only.
- One major hierarchy anchor per screen (primary total, order code or page title). Secondary information quiet. Do not over-card every table row; lean separators or whitespace after usability review.

## Hit areas / accessibility

- RN/POS touch controls min 44×44dp / 48×48 CSS px critical; stepper ± ideally 48–52. Spacing between opposing destructive actions ≥8px. Use WCAG/ARIA roles, visible focus rings, real button semantics, labels, disabled semantics and native accessibility announcements.
- Web all workflows keyboard-operable, logical tab order, Escape closes dialogs, focus restored to trigger, sticky headers not obscuring focus; native app VoiceOver/TalkBack and adjustable text size.
- `:focus-visible`, `:focus-within`, reduced motion; explicit `touch-action: manipulation` for POS/web controls. No spinner without readable text for saves >~500ms.
- Disabled != unavailable: explain a blocked action; error messages include recovery instructions. Loading/saving always prevents duplicate action, but UNKNOWN ACK offers status-check not blind retry.

## Component palette

- `AppHeader`, `SafeAreaActionFooter`, `StatusText`, `CurrencyAmount`, `MenuQtyRow`, `ShortOrderCode`, `MethodOptionCard`, `NoteDisclosure`, `PaymentSummary`, `CashTenderKeypad`, `NetworkBanner`, `PrintCopyStatus`, `ResponsiveRecord`, `ErrorRecovery`, `ShiftSummary`, `AmountReconciliation`.
- Prefer text-first cash and menu rows, not icon-only actions or photographs. Icons are supportive and accessible, never replace the label `Tiền mặt`/`Chuyển khoản`.
- Source-of-truth states and labels come from backend data, not client color switch. Reserve semantic success green for paid-confirmed, not just selected payment intent.

## Overflow/responsiveness implementation checklists

**Web:** use `min-width:0` inside grid/flex; `width:min(100%,...)`; `grid-template-columns: minmax(0,1fr)` and bounded split panes; avoid `100vw` in nested scroll containers; define one vertical scroll owner per panel (`min-height:0`), use `overflow-wrap:break-word` on long content; ensure sticky-footer padding bottom. Disable horizontal page scrolling, *not* the legitimate locally scrolling category chip strip. At POS 1024 width, panels should collapse gracefully rather than truncate/change.

**Native:** `SafeAreaView`/`useSafeAreaInsets`, `KeyboardAvoidingView` where appropriate, keyboard dismiss affordances, screen reader scaling, `flexShrink:1` text, avoid static full-height modal; use `FlatList`/`FlashList`/`LegendList` appropriately based on measured catalog length. Keep status and action footer visible while content scrolls; no absolute positioning over keyboard.

**Receipt:** receipt paper width dependent on physical device, likely ~72mm printable area for 80mm paper. Layout density tested on real printer including long Vietnamese text and two-copy page break. Do not reuse responsive screen CSS as printer template.

## Microcopy (Vietnamese)

| Situation | Preferred label | Never show |
|---|---|---|
| Staff requested cash | `Khách chọn: Tiền mặt` | `Đã thu tiền mặt` |
| Staff requested bank | `Khách chọn: Chuyển khoản` | `Thanh toán thành công` |
| Hub saved | `Đã lưu đơn #B104` | `Đã thanh toán` |
| Unknown create | `Chưa xác nhận được đơn. Kiểm tra lại trước khi gửi.` | `Lỗi! Thử gửi đơn mới.` |
| Bank pending | `Chờ ngân hàng xác nhận` | `Đã nhận` |
| Bank paid | `Đã xác nhận chuyển khoản` | `Khách nói đã chuyển` |
| Cash insufficient | `Còn thiếu 15.000đ` | `Số tiền không hợp lệ` |
| Printer unknown | `Chưa rõ máy in đã ra giấy. Kiểm tra trước khi in lại.` | `Đã in thành công` |
| Cash drawer variance | `Thiếu quỹ 20.000đ` / `Dư quỹ 20.000đ` | `Quỹ sai` |

## Taste skill project overrides

Taste default guidance targets visually expressive sites; for this operational application, override its hero/scroll animation/complexity suggestions. **RN variance 3, motion 2, density 5; POS variance 2, motion 1, density 7; Owner variance 3, motion 2, density 5**. Dials are advisory numbers, not measurements. Visual review must reject decorative gradients, floating glow, glassmorphism hiding buttons, gratuitous charts and 'one-size-fits-all' dashboard cards.

## Design handoff artifacts required

- Three final states per critical screen: base, error/recovery, narrow/keyboard scenario. 1 comprehensive screen inventory and one token source, not separately invented styles per team.
- Accessibility annotations, semantic status copy, focus/keyboard path, min dimensions, usage constraints and actual tester device matrix.
- Screenshot baselines at 320×568, 360×640, 390×844; POS 1024×768 and 1366×768 with 125% scale; Owner 390×844 and 1280×800.