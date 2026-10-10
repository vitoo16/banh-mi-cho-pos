---
name: ui-visual-audit
description: Audit Bánh Mì Chợ UI for overflow, legibility, accessibility, focus, status truthfulness and performance, including narrow RN phones and touch POS.
---

# UI visual + operational audit

## Trigger
When reviewing RN staff, Vite POS or owner UI changes, including design token changes.

## Scope
Use `docs/ui/UI_QA_MATRIX.md`. Load task-specific Vercel Web Interface Guidelines and Vercel React/React Native skill. For aesthetics use project-overridden Taste guidance, not marketing-site templates.

## One-pass check
- Inspect screenshots at 320×568 RN, 390×844, POS 1024×768 and 1366×768 with 125% OS scale, Owner mobile and desktop. Test long item name, long note, 12.345.678đ, 200% text, open keyboard.
- Flag horizontal page scrolling, clipped Save/Cash Confirm, obstructed focus, squashed currency, <44dp touch areas, contrast violations.
- Confirm payment intent vs verified paid, bank pending, ACK unknown and printer UNKNOWN are visually distinct and actionably recoverable.
- Check no unwanted KDS, stock, station printer or prep-state UI appeared.
- Run relevant automated tests/axe/playwright + real-device accessibility where available; cite actual evidence and blockers; no hallucinated passes.
- Report exact `path:line`, severity, reproduction, minimal fix and whether the finding blocks P0. Do not re-audit unchanged files endlessly.
