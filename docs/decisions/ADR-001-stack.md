# ADR-001 — Stack / deployment (ACCEPTED FOR MVP PLANNING)

- **Web POS + Owner:** React + Vite + TypeScript; browser POS UI accesses **local hub** at localhost; Owner uses cloud API. TanStack Query for remote state, React Router, lightweight Zustand only for transient UI, Tailwind/shadcn-style components subject to accessibility review. Avoid unneeded SSR/Next.js.
- **Mobile:** React Native + Expo (development builds), TypeScript, Expo Router, TanStack Query; local-first pending request status but server ACK required before employee verbally sends order. No direct access to SQLite of POS from device.
- **Backend:** NestJS + Fastify adapter, strict TS, class-validator/Zod schemas as contract consistent implementation, OpenAPI 3.1; shared pure TS money/order domain functions.
- **Storage:** SQLite on cashier Windows Store Hub; PostgreSQL on cloud; migrations and backup validation from day one.
- **Workspace:** pnpm monorepo + TypeScript project references; Node 24 LTS target (verify compatibility at scaffolding), ESLint/Prettier, Vitest, Playwright, mobile E2E via Maestro/Detox POC decision.
- **CI:** git lint/type/unit/contract/docs checks on PR. Integration (ephemeral Postgres/SQLite), load and simulated print fault stages later. Cloud deploy chosen only after operational/recovery decision; do not assume free-tier instance stays awake.

Rejected: raw Express (more custom architecture and guard/contract glue), microservices, kitchen management, web-only staff, multi-POS distributed cash authority.

Reasons: small team, money-sensitive workflow, concurrent FE/BE, reliable local service, auditability and maintainability.
