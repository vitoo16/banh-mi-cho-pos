---
name: vite-react-frontend
description: Use for React/Vite web UI, state, routes, accessibility and browser performance.
---

# Vite React touch POS and owner dashboard

**Trigger:** Use for React/Vite web UI, state, routes, accessibility and browser performance.

## Mandatory task instructions

1. Read WEB_PLAN.md; build POS for cashier on Windows and responsive Owner dashboard as separate Vite apps.
2. Use generated OpenAPI client, TanStack Query for server data, minimal local state, no inline financial authority logic or UI-set PAID.
3. Accessible large touch controls, visible amount and change, input modes, keyboard shortcuts, explicit pending/timeout/UNKNOWN status.
4. Lazy-load owner charts and admin routes; don't bundle heavy chart libs into cashier page. Render recent orders in cursor pages not full tables.
5. Vitest+Testing Library+MSW and Playwright for error, reconnect, duplicate save, printed copies and permissions; report measured bundle stats.

## Evidence required

In PR list the skill, tests actually run, file paths, blockers and negative-case evidence. Do not substitute skill text for implementation or benchmark results.
