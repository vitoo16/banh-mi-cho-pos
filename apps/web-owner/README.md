# web-owner — reserved application workspace

Implementation will start after M0/M1 gates in `docs/plans/MASTER_PLAN.md`; this folder intentionally contains no production code. Do not claim the app exists yet.

## Remote price updates

Set `VITE_CLOUD_API_URL` to the authenticated HTTPS Cloud API. Existing products can now be edited from the remote Owner interface through a **durable signed command inbox**; the change is *not* effective until Store Hub validates it. The UI shows pending, applied and conflict statuses. Creating new products, employee management, cash and printing remain local-only. No product/price state is optimistic. Cloud may lag the local price mirror while offline. For the protocol and secrets see `docs/ops/CLOUD_SYNC_RUNBOOK.md`.
