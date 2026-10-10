---
name: mobile-first-operational-ui
description: Design or implement Bánh Mì Chợ Staff, cashier POS and Owner screens with safe-area, no overflow, clear payment statuses and fast operation-first hierarchy.
---

# Bánh Mì Chợ mobile-first operational UI

## Trigger
Any screen design/implementation involving Staff RN, POS Vite, Owner Vite or shared UI tokens.

## Read first
`docs/spec/MVP-v1.2.md`; `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md`; `docs/ui/SCREEN_SPECS.md`; `docs/ui/DESIGN_SYSTEM.md`; `docs/ui/UI_QA_MATRIX.md` and corresponding platform plan.

## Mandatory
1. Use only business-approved scope. No inventory counter, kitchen status, printer-by-station or staff-set PAID.
2. Staff menu shows product name + price + quantity; notes are optional; default requested CASH with BANK and gated methods; save only after ACK.
3. Touch-first at RN 320dp, POS 1024px with OS scaling, Owner 320px; test keyboard, safe area and 200% fonts. Never solve overflow by hiding financial data.
4. Clear semantic hierarchy: one primary action, due/received/change prominent, pending bank and printer unknown visibly distinct.
5. 44+dp mobile targets and ≥48px POS critical targets; keyboard-operated web with visible focus and error recovery.
6. Taste Skill is for restrained visual consistency; it cannot override financial/trust boundaries or add decorative motion at busy cashier.
7. Read external Vercel/Taste guidance only after checking provenance; name exact sources in PR and report actual test evidence.
