# Practical design system — Bánh Mì Chợ POS

**Status:** Shared implementation foundation; palette remains a proposed brand direction until owner approval. Tokens do not imply a final logo or brand identity.

## Design read (Taste Skill — primary art direction)

Reading this as: a trust-critical, high-throughput bakery operations product for staff, cashier and shop owner, with a warm, calm and precise visual language; leaning toward a bespoke operational design system rather than a marketing-site template.

Taste Skill is the primary art-direction reviewer, not a literal template. Its current upstream brief explicitly says it is aimed at landing pages/portfolios and not dashboards/data tables. Therefore use its brief-reading, anti-generic, consistency and redesign-audit principles only where they fit; do not import its default variance/motion settings into cashier workflows. UI/UX Pro Max helps validate hierarchy and patterns. Vercel Web Interface Guidelines, this MVP spec and financial/security rules remain hard acceptance constraints.

### Product-specific design dials

- **Design variance:** 4/10. Distinctive through spacing, type hierarchy and warm material tone, not novelty at the expense of scanning.
- **Motion intensity:** 2/10 for Staff and cashier POS; 3/10 for Owner. Transitions should clarify state changes, never delay actions; honor reduced motion.
- **Visual density:** Staff 4/10, cashier POS 7/10 for operational facts, Owner 5/10 with denser tables only where comparison needs them.
- **Primary action:** exactly one visually dominant action per current task/viewport.
- **Typography:** local/system stack, tabular numbers for currency and metrics; no remote font dependency on LAN/offline paths.
- **Surface:** warm cream canvas, white working surfaces, dark readable text, restrained caramel accent. Semantic red/amber/green always paired with words/icons; color never carries payment state alone.
- **Motion:** only explicit opacity/transform transitions; never `transition: all`; avoid layout shifts and continuous animation at the counter.

## Shared tokens

The source of truth for Web tokens is `packages/ui/src/web-tokens.css`; React Native mirrors semantic values in `apps/mobile-staff/src/ui/designTokens.ts`. Do not import DOM components into React Native or create a runtime dependency between the apps.

| Token family | Purpose |
|---|---|
| Canvas / surface / ink / muted / border | Layout and content hierarchy |
| Accent / success / warning / danger | Actions and explicitly labeled states |
| Radius / spacing | Consistent touch-friendly component geometry |
| Shadow | Dialog elevation; cards remain quiet |
| Motion / easing | Short, non-blocking transitions |
| Focus | Visible, high-contrast keyboard focus |

## Non-negotiable operational boundaries

- No stock count, kitchen display, prep-state, station printer or delivery-completion UI.
- Staff creates orders and requests a payment method; staff cannot settle payment.
- A bank transfer intent is not proof of payment. Pending, verified paid, exception and printer-unknown states must be textually distinct.
- Never hide, truncate or shrink essential VND amounts to solve responsive overflow.
- No layout animation on cashier save/settlement; keep the primary action immediate and predictable.
- At 320px and 200% text, vertical scrolling is acceptable; clipped actions or financial amounts are not.

## Acceptance references

- `docs/ui/SCREEN_SPECS.md`
- `docs/ui/UI_QA_MATRIX.md`
- `docs/ui/AGENT_UI_WORKFLOW.md`
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- UI/UX Pro Max: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- Taste Skill: https://github.com/Leonxlnx/taste-skill
