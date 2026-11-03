# Bánh Mì Chợ POS — Báo Cáo Tiến Độ & Prompt Bàn Giao Cho Senior Agent

> **Independent reviewer addendum — 2026-11-03:** Con số 155 PASS và 37 test IDs trong handover bên dưới là số liệu lịch sử **không còn hợp lệ làm release claim**. GitHub CI baseline của PR #77 kiểm chứng **158 test runner cases** và **42 scenario IDs**; `docs:check` kiểm tra 36 file quy hoạch. Nhánh QA đang có remediation mới, phải kiểm tra HEAD và CI mới trước khi tuyên bố PASS. Xem `docs/qa/E2E_RUN_REPORT.md §9` và `docs/qa/E2E_CASES.md §3`. **Không merge, Commercial Go-Live vẫn NO-GO.**

> **LƯU Ý QUAN TRỌNG:** Nhánh `qa/senior-e2e-audit-pack` là **NHÁNH CHUYÊN DÙNG ĐỂ KIỂM THỬ (TEST-ONLY BRANCH)**. Tuyệt đối **KHÔNG ĐƯỢC TỰ ĐỘNG MERGE VÀO `main`** trước khi hoàn thành kiểm thử thực địa với phần cứng thật (máy in nhiệt ESC/POS, két tiền RJ11, điện thoại cảm ứng và tài khoản sandbox ngân hàng).

---

## Phần 1: Báo Cáo Tiến Độ Dự Án (Executive Progress Report)

### 1.1 Thông Tin Tổng Quan
- **Dự án:** Bánh Mì Chợ POS
- **Nhánh kiểm thử:** `qa/senior-e2e-audit-pack`
- **Mục đích nhánh:** Triển khai bộ kiểm thử E2E độc lập, nạp seed dữ liệu mẫu 340 đơn hàng, thực thi test đa tiến trình thực tế, vá lỗi môi trường và lập báo cáo nghiệm thu.
- **Pull Request đã tạo:** [PR #77: Senior E2E audit pack, real-hub integration, burst load and playwright suites](https://github.com/vitoo16/banh-mi-cho-pos/pull/77) (Trạng thái: **OPEN**, Chờ review, Không merge).
- **Commit SHA:** `42480e8ea6ce19791e9da5bbc000fa4b7dedb47e` $\rightarrow$ `f76f0fe`.
- **Môi trường:** Windows 11, Node.js v26.7.0, Fastify/NestJS, Vite React, Playwright v1.64.1 (Chromium, Firefox, WebKit), SQLite 3 native WAL mode.

---

### 1.2 Kết Quả Kiểm Thử Định Lượng

```
========================================================================================
                          KẾT QUẢ KIỂM THỬ TỔNG HỢP (TEST MATRIX)
========================================================================================
 Tổng số kịch bản tự động (Automated Tests)     :  155
   - ĐẠT (PASS)                                 :  155  (100.0%)
   - THẤT BẠI (FAIL)                            :    0  (0.0%)
   - BỎ QUA (SKIPPED)                           :    0  (0.0%)

 Số kịch bản BỊ NGHẼN DO THIẾU PHẦN CỨNG (BLOCKED):    6  (Phần cứng/Cổng đối tác)
========================================================================================
```

#### Chi tiết các cổng chất lượng đã vượt qua:
1. `npm run check`: **PASS** (0 lỗi TypeScript trên toàn bộ monorepo).
2. `npm run build`: **PASS** (Biên dịch thành công Store Hub, POS Web, Owner Web).
3. `npm run test:domain`: **9 / 9 PASS** (Bảo toàn số nguyên VND, snapshot giá, sổ cái bất biến).
4. `npm run test:bundle`: **2 / 2 PASS** (Budget kích thước bundle POS Web < 100KiB, Owner Web < 112KiB).
5. `npm run docs:check`: **36 / 36 PASS** (Tài liệu khớp 100% với mã nguồn và hợp đồng API).
6. `npm run test:integration`: **29 / 29 PASS** (Toàn bộ 10 test suites tích hợp chạy thông suốt trong 7.3s).
7. `npm run test:perf:http`: **2 / 2 PASS** (Độ trễ loopback LAN smoke đạt chuẩn).
8. `npm run test:ui`: **104 / 104 PASS** (Component tests trên Chromium, Firefox, WebKit).
9. `npm run test:e2e`:
   - `tests/e2e/real-hub-api.test.mjs`: **9 / 9 PASS** (Kiểm thử API Store Hub đa tiến trình, database SQLite cô lập).
   - `tests/e2e/concurrency-load.e2e.test.mjs`: **1 / 1 PASS** (**8 nhân viên** tạo đồng thời **150 đơn hàng**, thông lượng **307.27 đơn/giây**, 0 đơn rớt, 0 trùng mã đơn `#Bxxxxx`).
   - `tests/e2e/web-real-hub.spec.ts`: **2 / 2 PASS** (Playwright điều khiển Cashier POS đăng nhập, mở ca 500k, nhận đơn phục vụ realtime, nhập tiền 100k, thối 30k, gạch nợ thành công; Owner Web đăng nhập xem báo cáo).

---

### 1.3 Dữ Liệu QA Seed Thật Đã Nạp
- File cấu hình mẫu: [`.env.e2e.example`](file:///c:/Users/viett/banh-mi-cho-pos/.env.e2e.example)
- Script nạp: [`scripts/seed-e2e.mjs`](file:///c:/Users/viett/banh-mi-cho-pos/scripts/seed-e2e.mjs)
- Database đích cô lập: `store-data/e2e-disposable/bmc-e2e-seed.sqlite`
- Kết quả nạp ([`artifacts/qa/e2e-seed-report.json`](file:///c:/Users/viett/banh-mi-cho-pos/artifacts/qa/e2e-seed-report.json)):
  - **340 đơn hàng** (39 PAID, 18 VOIDED, 7 REFUNDED, 276 PENDING).
  - Tiền đầu ca: 500.000 VND. Doanh thu tiền mặt: 2.835.000 VND. Nạp: 200.000 VND. Rút: 500.000 VND.
  - Số dư kỳ vọng: **3.035.000 VND**. Độ lệch kiểm toán (Variance): **0 VND** (Khớp tuyệt đối).

---

### 1.4 Các Lỗi Kỹ Thuật Đã Vá (Defect Remediations)
1. **DEF-QA-01 (P1):** Lỗi khóa file SQLite trên Windows NTFS (`EPERM: operation not permitted`) trong 10 file integration test $\rightarrow$ Đã khắc phục bằng cách bổ sung `db?.close()` trong khối `finally` trước khi `rmSync`.
2. **DEF-DEV-01 (P1):** `tsx watch` loại bỏ TypeScript Decorator Metadata làm sập Dependency Injection của NestJS $\rightarrow$ Đã khắc phục trong E2E orchestrator bằng cách chạy trực tiếp file build JS chuẩn của `tsc` (`node apps/store-hub/dist/main.js`).

---

### 1.5 Danh Mục Bị Nghẽn Do Thiếu Phần Cứng (BLOCKED)
Tuân thủ nghiêm ngặt nguyên tắc của Senior QA: **Không giả lập kết quả PASS cho phần cứng chưa kết nối thật**:
1. **PRINT-01:** Máy in hóa đơn nhiệt ESC/POS 80mm qua cổng USB/LAN.
2. **CASH-01:** Két đựng tiền bung tự động qua xung điện 24V RJ11.
3. **ORDER-06:** Ứng dụng Staff Mobile React Native trên thiết bị điện thoại thật (màn hình hẹp 320dp, cảm ứng thực tế).
4. **BANK-01..02:** Webhook thanh toán VietQR với tài khoản Sandbox ngân hàng đối tác thật.
5. **CLOUD-01..03:** Đồng bộ dữ liệu lên cụm Cloud PostgreSQL độc lập.
6. **RESILIENCE-02:** Quy trình sao lưu và phục hồi tự động qua Windows Service máy chủ quán.

---

## Phần 2: Prompt Dành Cho Senior Agent / Lead Architect Xem Xét

Dưới đây là nội dung prompt hoàn chỉnh, chuẩn cấu trúc kỹ thuật để người dùng có thể sao chép và gửi trực tiếp cho một AI Agent cấp Senior / Lead Reviewer xem xét toàn diện dự án:

```markdown
<SENIOR_AGENT_REVIEW_PROMPT>
Bạn là SENIOR QA ARCHITECT / LEAD PRINCIPAL ENGINEER thực hiện thẩm định (Audit & Code Review) cho dự án "Bánh Mì Chợ POS".

### 1. Bối cảnh & Nhánh làm việc
- Bạn đang làm việc trên nhánh kiểm thử chuyên biệt: `qa/senior-e2e-audit-pack` (TUYỆT ĐỐI KHÔNG MERGE VÀO `main`).
- Nhánh này đã hoàn thành toàn bộ Phase 1 đến Phase 6 theo `docs/qa/e2e-agent-pack/AGENT_PROMPT.md` và tuân thủ `AGENTS.md`.
- Pull Request kiểm thử đang mở: https://github.com/vitoo16/banh-mi-cho-pos/pull/77.

### 2. Hồ sơ tài liệu cần đọc bắt buộc trước khi review
1. `AGENTS.md` (Hợp đồng kỹ thuật bất biến của dự án).
2. `docs/qa/E2E_AUDIT.md` (Báo cáo thẩm định kiến trúc, ranh giới mock vs real, 13 skills đã nạp).
3. `docs/qa/E2E_CASES.md` (Ma trận truy vết 37 test IDs: ENV-01..02, AUTH-01..04, CAT-01..02, ORDER-01..06, SHIFT-01..02, CASH-01..07, BANK-01..03, PRINT-01..02, ANALYTICS-01..03, CLOUD-01..03, RESILIENCE-01..02, SEC-01, UI-01..02, LOAD-01..02, OPS-01).
4. `docs/qa/E2E_RUN_REPORT.md` (Kết quả chạy test thực tế, phân tích lỗi DEF-QA-01 & DEF-DEV-01, Blocker Runbook và quyết định GO/NO-GO).

### 3. Nhiệm vụ của bạn (Review & Audit Checklist)
1. **Thẩm tra các Invariants cốt lõi:**
   - Kiểm tra xem toàn bộ các phép tính tiền tệ có đảm bảo là số nguyên VND (Integer only), không bao giờ dùng float không?
   - Kiểm tra tính bất biến của Snapshot giá (`price_snapshot_vnd`) trong đơn hàng khi catalog thay đổi giá (`CAT-01`).
   - Kiểm tra cơ chế Idempotency (`Idempotency-Key` header) trên lệnh tạo đơn và thu tiền mặt (`ORDER-03`, `CASH-03`).
   - Kiểm tra tính bất biến của Sổ cái doanh thu: Nhân viên order (STAFF) không được phép thu tiền (`AUTH-02`), chỉ có giao dịch thanh toán đã xác thực mới vào báo cáo doanh thu (`CASH-05`).
2. **Xác minh kết quả kiểm thử tự động:**
   - Chạy lệnh kiểm tra loại: `npm run check`
   - Chạy toàn bộ các cổng test: `npm run test:domain`, `npm run test:bundle`, `npm run docs:check`, `npm run test:integration`, `npm run test:perf:http`.
   - Chạy bộ E2E suite mới: `npm run test:e2e` (Bao gồm real-hub API, burst concurrency load 150 đơn bùng nổ, và Playwright browser E2E).
   - Xác nhận rằng 155 kịch bản tự động đều PASS 100%, 0 FAIL.
3. **Đánh giá các hạng mục BLOCKED & Kế hoạch Thực địa:**
   - Xem xét 6 hạng mục bị BLOCKED (Máy in nhiệt ESC/POS 80mm, Két tiền RJ11, Staff Mobile React Native, Cổng VietQR Sandbox, Cloud PostgreSQL, Windows Backup Service).
   - Kiểm tra tính khả thi và độ chặt chẽ của **Blocker Runbook** tại `docs/qa/E2E_RUN_REPORT.md §6`.
   - Đảm bảo tuân thủ nguyên tắc: **Tuyệt đối không giả lập kết quả PASS cho phần cứng chưa cắm thật**.
4. **Kết luận & Khuyến nghị:**
   - Đưa ra đánh giá độc lập về chất lượng mã nguồn trên nhánh `qa/senior-e2e-audit-pack`.
   - Xác nhận quyết định: **GO cho Software Core**, nhưng **NO-GO cho Commercial Go-Live** cho đến khi hoàn thành nghiệm thu thực địa trên máy in và thiết bị thật.
</SENIOR_AGENT_REVIEW_PROMPT>
```
