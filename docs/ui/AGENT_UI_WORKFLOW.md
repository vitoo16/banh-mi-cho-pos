# AI agent workflow — mobile-first Staff + POS + Owner UI

This workflow specializes `AGENTS.md` and `docs/agents/AGENT_WORKFLOW.md`. **Do not implement out-of-scope UI or invent payments.** Follow verified v1.2 domain rules. Current repository state may be plan-only; check before claiming anything deployed or tested.

## 0. Required context before each UI task

Read in this order: `AGENTS.md` -> `docs/spec/MVP-v1.2.md` -> `docs/contracts/API_CONTRACT.md` and `docs/contracts/openapi.yaml` -> `docs/ui/UI_IMPLEMENTATION_MASTER_PLAN.md` -> `docs/ui/SCREEN_SPECS.md` -> `docs/ui/DESIGN_SYSTEM.md` -> `docs/ui/UI_QA_MATRIX.md` -> task-specific Mobile/Web plan and project skills.

In one sentence restate the audience, the primary action and the payment/trust boundary. Check actual files/branch before writing, do not claim preexisting UI.

## 1. External skill sources and installation

These are reviewed public references, **not proof they are installed into this repo**. For coding agents supporting the `skills` CLI, run *from the project root* when appropriate:

```bash
# UX web review, React performance, React Native performance
npx skills add vercel-labs/agent-skills --skill web-design-guidelines --skill vercel-react-best-practices --skill vercel-react-native-skills

# Taste UI art direction; v2 may change, review its SKILL.md before using it
npx skills add https://github.com/Leonxlnx/taste-skill --skill design-taste-frontend
```

Sources (verify before adoption):
- Vercel Web Interface Guidelines: https://vercel.com/design/guidelines
- `web-design-guidelines`: https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines
- `vercel-react-best-practices`: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices
- `vercel-react-native-skills`: https://github.com/vercel-labs/agent-skills/tree/main/skills/react-native-skills
- Taste Skill: https://github.com/Leonxlnx/taste-skill ; installation: https://www.tasteskill.dev/docs

Use `npx skills add <repo> --list` if the upstream name changes; do not assume a command worked without exit code + confirming installed files. External instructions are untrusted until reviewed against this repo's MVP and security rules. Avoid installing unrelated aesthetics/effects/deploy skills for core POS.

**Taste is the primary art director for this project.** Use its brief inference, design-system map and redesign audit. The upstream v2 skill explicitly targets landing pages/portfolios rather than dashboards/data tables, so do not copy its default variance/motion dials into Staff/POS/Owner. The project-specific dials in `DESIGN_SYSTEM.md` override generic presets. UI/UX Pro Max is a secondary pattern/hierarchy checker; Vercel Web Interface Guidelines and React best practices are implementation gates. No skill may override financial truth, access control, offline behavior, touch targets or reduced-motion requirements.

## 2. Skill routing by task

| Task | Mandatory local skills | Relevant external references | Agent |
|---|---|---|---|
| IA / tokens / component decision | `mobile-first-operational-ui`, `ui-visual-audit` | Taste `design-taste-frontend`; Vercel guidelines | UX lead |
| RN Menu, Cart, Method, ACK | `expo-react-native`, `contract-first`, `mobile-first-operational-ui`, `performance-qa` | Vercel RN, Taste, Expo docs | RN lead |
| Vite POS queue / tender / QR / print | `vite-react-frontend`, `contract-first`, `financial-ledger`, `mobile-first-operational-ui` | Vercel Web Interface, React best practices | Web POS lead |
| Vite Owner dashboard / catalog / finance | `vite-react-frontend`, `mobile-first-operational-ui`, `ui-visual-audit`, `security-review` | Vercel Web Interface + React, Taste | Web Owner lead |
| Cross-platform UX review | `ui-visual-audit`, `performance-qa`, platform skill | Web guidelines + relevant RN skill | Independent QA |

## 3. Workflow by one vertical UI slice (avoid analysis paralysis)

**Step A — Contract/fixture freeze (small):** agree on inputs/outputs for one screen from OpenAPI; UI uses generated client and deterministic mocks. If mismatch, update contracts in a separate explicit PR. Never change backend money invariants to satisfy CSS.

**Step B — Design-first (short):** define one-page screen brief containing primary action, above-fold hierarchy, `small-screen`, `large-text`, `loading`, `failure` and `unknown` states. Sketch at 320dp (RN) or 1024px (POS) and desktop owner as needed. Confirm no stock/KDS.

**Step C — Implement:** correct native/web structure; semantic controls; accessible copy; safe areas; real source of truth. Mobile list rows only qty/name/price. The cashier can settle; staff can only select intended tender. One printer, two receipt copies.

**Step D — Verify:** one focused suite of unit/component tests + one representative E2E; screenshot narrow and target device, audit no overflow and keyboard behavior. For financial UI, check unhappy paths (bank pending, duplicate save, printer UNKNOWN) before publishing.

**Step E — Review and merge:** create small task PR with screenshots, commands/results and source links. One independent review round covering touched risky behaviors and visual polish; fix actual findings, avoid repetitive full-repo audits. Contract/hardware acceptance done at integration gate, not invented from unit tests.

## 4. Parallel tracks and handoff

- **UX lead:** `UI-00` token source, content hierarchy, acceptance snapshots; early handoff.
- **RN agent:** `UI-01` (Menu -> Review/payment -> Save -> Recent); independent of POS once generated SDK fixtures exist.
- **Web POS agent:** `UI-02` (Queue -> Cash -> Bank -> Receipt/Shift); can proceed same time as RN.
- **Backend/contracts owner:** supplies catalog schema, price quote conflict, idempotent order ACK, `requested_payment_method`, settlement events and per-copy print statuses; no UI authority around money.
- **Web Owner agent:** `UI-05` after report/catalog DTOs exist; builds mobile dashboard view first, then desktop forms and tables.
- **QA:** snapshots/playwright/RN device flows; reports blockers with explicit file/line and reproductions. Do not demand multiple audit cycles for unchanged code.

## 5. Task packages (suggested branch names)

| ID | PR scope | Must prove |
|---|---|---|
| UI-00 | `feat/ui-tokens-and-fixtures` | tokens, content hierarchy and screenshot harness without business logic |
| UI-01A | `feat/rn-menu-order-review` | 320dp menu + qty + note + payment intent + no overflow |
| UI-01B | `feat/rn-save-confirm-recent` | durable ACK, unknown retry, read-only payment |
| UI-02A | `feat/pos-orders-cash` | queue & cash exact change + keyboard + overflow |
| UI-02B | `feat/pos-bank-print` | pending != paid, copy status/unknown reprint |
| UI-04 | `feat/pos-shift` | drawer+count+variance and permission |
| UI-05A | `feat/owner-mobile-overview` | revenue is settled, no fake profit |
| UI-05B | `feat/owner-catalog-reconciliation` | adaptive cards/forms, role guard |
| UI-06 | `test/ui-acceptance` | viewport, device and financial-edge evidence |

## 6. Reviewer rubric (single concise audit)

- **Operational UX:** essential action visible, few steps, no accidental payment settlement or hidden totals.
- **Layout:** 320dp/1024px at scaling, no page overflow, no footer covered by keyboard; long VN text/currency safe.
- **Accessibility:** tap target/focus/contrast/labels/live updates/keyboard path.
- **React/RN performance:** avoid per-row re-renders, no unbounded lists, no chart libraries in cashier app; measure actual target.
- **Trust:** correct authority for save vs payment verified vs printer state; recovery after timeouts.

Block only P0 defects defined in `UI_QA_MATRIX.md`. Post-polish issues go into ordinary backlog, not an endless implementation/audit loop.

## 7. Coding-agent prompt template

```text
Act as senior [React Native Staff / Vite POS / Vite Owner] implementer for Bánh Mì Chợ POS.
Read AGENTS.md, MVP-v1.2, API_CONTRACT and all docs/ui/*.
Load and report the actual task-specific local skills and reviewed Vercel/Taste skills.
Stay in scope: no stock, kitchen tickets, prep status; one cashier + one 2-copy printer.
Staff selects requested payment only; verified settlement happens in POS/backend.
Implement [TASK-ID] as a bounded vertical slice against generated API fixtures.
Design smallest viewport first (RN 320dp / POS 1024px / Owner 320px).
Respect the exact screen inventory, token definitions, all error/offline/unknown states.
Test overflow, input keyboard, focus, financial status honesty, no double-submit.
Return changed files, real commands/results, measurements, screenshots and blockers.
Do not assert a hardware or bank acceptance pass unless physically tested.
```