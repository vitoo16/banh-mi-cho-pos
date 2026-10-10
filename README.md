# Bánh Mì Chợ POS — Product & Engineering Repository

**Status: SPEC/PLAN BASELINE ONLY. No application code has been implemented, no production deployment and no completed payment integration.**

Một cửa hàng, 4–8 nhân viên đồng thời, >300 đơn/ngày, một thu ngân, một két và **một máy in nhiệt in hai liên**. Nhân viên dùng React Native, POS và Owner dùng **React + Vite**, backend **NestJS + Fastify**, điểm bán có **Store Hub** qua LAN + SQLite, cloud dùng PostgreSQL.

## Source of truth

1. [`docs/spec/MVP-v1.2.md`](docs/spec/MVP-v1.2.md): phạm vi nghiệp vụ đã duyệt. Thay thế 1.1/1.0.
2. [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md): deployment topology, money and offline authority.
3. [`docs/contracts/API_CONTRACT.md`](docs/contracts/API_CONTRACT.md): API/event rules — cập nhật trước khi viết cả FE/BE.
4. [`docs/plans/MASTER_PLAN.md`](docs/plans/MASTER_PLAN.md): milestones and ownership.
5. [`docs/plans/PARALLEL_EXECUTION.md`](docs/plans/PARALLEL_EXECUTION.md): parallel FE/BE dependency map.
6. [`docs/agents/AGENT_WORKFLOW.md`](docs/agents/AGENT_WORKFLOW.md) and [`AGENTS.md`](AGENTS.md): mandatory agent procedure/skills.
7. [`docs/qa/ACCEPTANCE.md`](docs/qa/ACCEPTANCE.md): test & go-live gates.

## MVP — được phép và không được phép

**Có:** danh mục tên + giá, số lượng, ghi chú, lựa chọn thanh toán **dự kiến** trên điện thoại, lưu đơn idempotent; thu ngân xác nhận tiền thực tế (cash/bank), tính tiền thối, mở/chốt ca, QR theo đơn + đối soát webhook khi provider tương thích, in **1 liên khách + 1 liên tiệm**, chủ sửa sản phẩm và xem báo cáo.

**Không:** tồn kho, số lượng bánh còn lại, KDS, phiếu bếp, in máy thứ hai, công đoạn chế biến, bắt nhân viên bấm đã làm xong, tự động tính lợi nhuận thực tế khi thiếu giá vốn/chi phí. MoMo chỉ bật khi merchant đã kích hoạt, split payment là optional feature flag.

**Đặc biệt:** staff chọn phương thức thanh toán **không có nghĩa đã trả**. Cashier hoặc webhook có đối soát mới được settle. Không dùng ảnh chuyển tiền làm bằng chứng tự động. Mất Internet vẫn bán cash và in trên LAN; bank pending không được giả xác nhận.

## Repository layout

```text
apps/api/            NestJS + Fastify cloud API (planned)
apps/store-hub/      NestJS/Fastify LAN HTTP/WebSocket + SQLite + print (planned)
apps/web-pos/        React + Vite POS interface on Windows (planned)
apps/web-owner/      React + Vite owner interface (planned)
apps/mobile-staff/   React Native + Expo development build (planned)
packages/contracts/ Shared OpenAPI generated API clients/types (planned)
packages/domain/    Shared pure money/order domain rules (planned)
packages/ui/        Web design tokens / components (planned)
packages/config/    Shared lint/TypeScript/tooling presets (planned)
docs/               Source-of-truth specs, plans, contracts, QA, operations
.agents/skills/     Project-local agent skills; read by task
.github/            CI and PR templates
```

## Implementation start

- Start at **M0 POC**: devices, print 2 copies, local RN->Store Hub networking, restart/recovery, selected bank account integration. No hardware purchase before POC.
- FE & BE work in parallel **only after M1 API + domain contract freeze**.
- Do not call tasks CLOSED without source audit, integration evidence, offline acceptance and business sign-off.
- Run `node scripts/check-docs.mjs` (requires Node 24+). This checks **docs only**; it is not an app build or E2E test.

**Repo privacy:** recommend `private` until security, banking and operational documentation is scrubbed for public release. Never commit PINs, bank account numbers, credentials, real customer data or `.env` files.

## GitHub publishing

This delivered folder is a prepared local repository, **not automatically a live GitHub repository**. See [`docs/ops/GITHUB_SETUP.md`](docs/ops/GITHUB_SETUP.md) for a private-repo, GitHub CLI and Git bundle publication path. No application tests/builds are asserted from the planning-only docs CI.
