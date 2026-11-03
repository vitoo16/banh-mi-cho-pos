# Bánh Mì Chợ POS — Senior E2E Test Cases Specification

Tài liệu đặc tả chi tiết toàn bộ kịch bản kiểm thử E2E (End-to-End) cho hệ thống Bánh Mì Chợ POS, tuân thủ nghiêm ngặt theo `docs/qa/e2e-agent-pack/TEST_MATRIX.md`, `docs/spec/MVP-v1.2.md`, `docs/contracts/API_CONTRACT.md` và `AGENTS.md`.

---

## 1. Traceability Matrix (Ma trận truy vết)

| Test ID | Priority | Scope / Module | Spec Ref | API Contract Ref | Implementation Source | Test Implementation / Execution Target | Execution Mode |
|---|---|---|---|---|---|---|---|
| **ENV-01** | P0 | Environment & Secrets | MVP-v1.2 §7 | Config Contract | `apps/store-hub/src/main.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 1) | **AUTOMATED** |
| **ENV-02** | P0 | SQLite Lifecycle | MVP-v1.2 §8 | Database Schema | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 1) | **AUTOMATED** |
| **AUTH-01** | P0 | Authentication & Roles | MVP-v1.2 §4 | POST /v1/auth/login | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 2) | **AUTOMATED** |
| **AUTH-02** | P0 | RBAC & Authorization | MVP-v1.2 §4 | HTTP 403 Forbidden | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 2) | **AUTOMATED** |
| **AUTH-03** | P0 | Session Invalidation | MVP-v1.2 §4 | Employee Status | `apps/store-hub/src/domain.ts` | `tests/store.test.mjs` | **AUTOMATED** |
| **AUTH-04** | P0 | Device Pairing & Revocation | MVP-v1.2 §4 | POST /v1/devices/pair | `apps/store-hub/src/domain.ts` | `tests/remote-gateway.test.mjs` | **AUTOMATED** |
| **CAT-01** | P0 | Catalog Versioning | MVP-v1.2 §2 | GET /v1/catalog | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 3) | **AUTOMATED** |
| **CAT-02** | P0 | Stale Catalog Concurrency | MVP-v1.2 §2 | 409 CATALOG_CHANGED | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 3) | **AUTOMATED** |
| **ORDER-01** | P0 | Order Creation & Price Snapshot | MVP-v1.2 §3 | POST /v1/orders | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 4) | **AUTOMATED** |
| **ORDER-02** | P0 | Input Validation & Unapproved Tender | MVP-v1.2 §3 | HTTP 400 / 422 | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 4) | **AUTOMATED** |
| **ORDER-03** | P0 | Idempotent Order Creation | MVP-v1.2 §3 | Idempotency-Key Header | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 4) | **AUTOMATED** |
| **ORDER-04** | P0 | Idempotency Conflict & Mismatch | MVP-v1.2 §3 | 409 IDEMPOTENCY_CONFLICT | `apps/store-hub/src/domain.ts` | `tests/idempotency-binding.test.mjs` | **AUTOMATED** |
| **ORDER-05** | P0 | Order Pagination & Role Scopes | MVP-v1.2 §3 | GET /v1/orders | `apps/store-hub/src/domain.ts` | `tests/cashier-queue.test.mjs` | **AUTOMATED** |
| **ORDER-06** | P1 | Staff Offline Queuing & Reconnect | MVP-v1.2 §3 | Outbox Queue | `apps/staff-mobile/` | Manual / Native Mobile Suite | **BLOCKED (Hardware)** |
| **SHIFT-01** | P0 | Shift Opening & Single Ownership | MVP-v1.2 §5 | POST /v1/shifts/open | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 5) | **AUTOMATED** |
| **CASH-01** | P0 | Cash Settlement & Change Calculation | MVP-v1.2 §5 | POST /v1/orders/:id/capture | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **CASH-02** | P0 | Insufficient Tender & Shift Guard | MVP-v1.2 §5 | HTTP 400 / 422 | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **CASH-03** | P0 | Idempotent Cash Capture | MVP-v1.2 §5 | Idempotency-Key Header | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **CASH-04** | P0 | Cashier UI Interruption & Recovery | MVP-v1.2 §5 | Client Resiliency | `apps/pos-web/src/` | `tests/e2e/web-real-hub.spec.ts` | **PARTIAL — real browser lost-ACK test not executed** |
| **CASH-05** | P0 | Requested Bank Settled with Cash | MVP-v1.2 §5 | Tender Truthfulness | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **CASH-06** | P0 | Cash Refund with Audit Reason | MVP-v1.2 §5 | POST /v1/orders/:id/refund | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **CASH-07** | P0 | Void Unpaid Order | MVP-v1.2 §3 | POST /v1/orders/:id/void | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 6) | **AUTOMATED** |
| **SHIFT-02** | P0 | Cash Movements & Shift Close | MVP-v1.2 §5 | POST /v1/shifts/close | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 5) | **AUTOMATED** |
| **BANK-01** | P0 | Unverified Bank Intent (Screenshot Guard) | MVP-v1.2 §5 | POST /v1/orders/:id/bank-intent | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 7) | **AUTOMATED** |
| **BANK-02** | P0 | HMAC Bank Callback Verification | MVP-v1.2 §5 | POST /v1/internal/bank-events | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 7) | **AUTOMATED** |
| **BANK-03** | P1 | Cloud Outage Bank Failover | MVP-v1.2 §5 | Offline Fallback | `apps/store-hub/src/domain.ts` | `tests/store.test.mjs` | **AUTOMATED** |
| **PRINT-01** | P0 | Dual Receipt Spooling (Customer/Store) | MVP-v1.2 §6 | ESC/POS Spooler | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 8) | **AUTOMATED (virtual TCP) / BLOCKED (physical printer)** |
| **PRINT-02** | P0 | Printer Failure & Audited Reprint | MVP-v1.2 §6 | POST /v1/receipts/:id/reprint | `apps/store-hub/src/domain.ts` | `tests/printer.test.mjs` | **AUTOMATED** |
| **ANALYTICS-01** | P0 | Daily Order Counts & Classification | MVP-v1.2 §7 | GET /v1/analytics/overview | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 9) | **AUTOMATED** |
| **ANALYTICS-02** | P0 | Product Sales Units & Date Boundaries | MVP-v1.2 §7 | GET /v1/analytics/products | `apps/store-hub/src/domain.ts` | `tests/owner-analytics-hub.test.mjs` | **AUTOMATED** |
| **ANALYTICS-03** | P0 | Financial Reconcile: Ledger vs Shift | MVP-v1.2 §7 | Audited Truth | `apps/store-hub/src/domain.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 9) | **AUTOMATED** |
| **CLOUD-01** | P0 | Hub Outbox Sync to PostgreSQL | MVP-v1.2 §8 | POST /v1/cloud/sync | `apps/cloud-backend/` | `tests/sync-backfill.test.mjs` | **AUTOMATED (isolated PG CI where run) / BLOCKED staging** |
| **CLOUD-02** | P0 | Remote Catalog Command Dispatch | MVP-v1.2 §8 | Remote Ingestion | `apps/store-hub/src/domain.ts` | `tests/remote-gateway.test.mjs` | **AUTOMATED** |
| **CLOUD-03** | P0 | Cloud HMAC Security & RBAC | MVP-v1.2 §8 | Gateway Security | `apps/cloud-backend/` | `tests/remote-gateway.test.mjs` | **AUTOMATED (isolated PG CI where run) / BLOCKED staging** |
| **RESILIENCE-01** | P0 | Crash Recovery Before ACK | MVP-v1.2 §8 | SQLite WAL Integrity | `apps/store-hub/src/domain.ts` | `tests/concurrency.test.mjs` | **AUTOMATED** |
| **RESILIENCE-02** | P0 | Backup Integrity & Non-destructive Restore | MVP-v1.2 §8 | Backup Service | `apps/store-hub/` | Manual / Host Windows CLI | **BLOCKED (Ops Env)** |
| **SEC-01** | P0 | Security Controls & Information Leakage | MVP-v1.2 §4 | HTTP Headers / Logs | `apps/store-hub/src/main.ts` | `tests/e2e/real-hub-api.test.mjs` (Suite 1) | **PARTIAL — security headers/log redaction unverified** |
| **UI-01** | P1 | Cross-browser & Touch POS Viewport | MVP-v1.2 §9 | Responsive Layout | `apps/pos-web/`, `apps/owner-web/` | `tests/e2e/web-real-hub.spec.ts` | **PARTIAL — Chromium real Hub, mocked Firefox/WebKit smoke** |
| **UI-02** | P1 | UI Network Failure & Error Boundary | MVP-v1.2 §9 | Error States | `apps/pos-web/` | `tests/cashier-queue.test.mjs` | **NOT VERIFIED by cited file** |
| **LOAD-01** | P0 | 8 Staff Burst (>=150 orders/hour) | MVP-v1.2 §10 | Store Hub Concurrency | `apps/store-hub/src/domain.ts` | `tests/e2e/concurrency-load.e2e.test.mjs` | **AUTOMATED** |
| **LOAD-02** | P1 | 100k Order Cursor Performance | MVP-v1.2 §10 | SQLite Indexing | `apps/store-hub/src/domain.ts` | Synthetic Load Benchmark | **NOT VERIFIED — 100k benchmark pending** |
| **OPS-01** | P0 | Operational Health & Backup Freshness | MVP-v1.2 §8 | GET /v1/health | `apps/store-hub/src/domain.ts` | `tests/operational-status.test.mjs` | **AUTOMATED** |

---

## 2. Chi tiết từng kịch bản kiểm thử (Test Scenarios)

### Khối 1: Môi trường & Khởi động (ENV-01, ENV-02, SEC-01)

#### ENV-01: Kiểm tra biến môi trường và Localhost Binding
- **Mục tiêu:** Đảm bảo Store Hub từ chối khởi động nếu thiếu cấu hình bảo mật bắt buộc, và mặc định chỉ bind trên loopback (`127.0.0.1`), không expose công khai ra mạng Internet khi chưa có proxy an toàn.
- **Preconditions:** Store Hub chưa chạy; thư mục database trống.
- **Inputs:** 
  - Trường hợp 1: Biến môi trường thiếu `HUB_BOOTSTRAP_OWNER_PIN` hoặc `HUB_SIGNING_KEY`.
  - Trường hợp 2: Khởi động với `.env.e2e.example` hợp lệ (`HOST=127.0.0.1`, `PORT=4001`).
- **Steps:**
  1. Thực thi `node apps/store-hub/dist/main.js` với môi trường rỗng.
  2. Quan sát exit code và thông điệp lỗi.
  3. Khởi động lại với đầy đủ biến môi trường.
  4. Thực hiện `GET http://127.0.0.1:4001/v1/health`.
- **Expected Outputs:**
  - Trường hợp 1: Tiến trình dừng ngay lập tức với exit code != 0, thông báo lỗi rõ ràng về thiếu khóa bí mật. Không tạo database rác.
  - Trường hợp 2: Tiến trình khởi động thành công, lắng nghe tại `127.0.0.1:4001`. `GET /v1/health` trả về `HTTP 200 OK`, body `{ "status": "ok", "mode": "PILOT_LOCAL" }`.
- **Database / Audit Assertions:** Không có bản ghi rác.

#### ENV-02: Khởi động trên Database sạch & Khởi động lại
- **Mục tiêu:** Xác minh tính toàn vẹn của SQLite (WAL mode, Foreign Keys ON, schema migration) và tính bất biến của dữ liệu khởi tạo khi restart.
- **Preconditions:** Thư mục dữ liệu mới tinh.
- **Inputs:** `DB_PATH=store-data/e2e-disposable/env-test.sqlite`.
- **Steps:**
  1. Khởi động Hub lần đầu; kiểm tra bảng `users`, `products`, `settings`.
  2. Tắt Hub và khởi động lại trỏ cùng file database.
- **Expected Outputs:**
  - SQLite được cấu hình `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, `PRAGMA synchronous = NORMAL`.
  - Khởi động lần 2 không gây lỗi "unique constraint failed", không nhân bản bản ghi bootstrap (`owner`, `cashier`, `staff`).

#### SEC-01: Kiểm soát an ninh, CORS và Bảo mật thông tin
- **Mục tiêu:** Đảm bảo headers bảo mật, chặn CORS từ domain lạ, ngăn rò rỉ mã PIN / khóa HMAC trong log và payload lỗi.
- **Preconditions:** Hub đang chạy.
- **Inputs:** Request kèm origin không hợp lệ, hoặc request với header Authorization sai định dạng.
- **Expected Outputs:**
  - Headers chứa `X-Content-Type-Options: nosniff`.
  - Không có thông tin nhạy cảm (PIN, Private Key) xuất hiện trong body lỗi hoặc log stdout/stderr.

---

### Khối 2: Xác thực & Phân quyền RBAC (AUTH-01 -> AUTH-04)

#### AUTH-01: Đăng nhập đa vai trò, giới hạn số lần thử và Đăng xuất
- **Mục tiêu:** Xác thực đúng vai trò OWNER, CASHIER, STAFF; khóa hoặc rate-limit khi nhập sai PIN liên tiếp; thu hồi token khi đăng xuất.
- **Preconditions:** Bootstrap users đã tồn tại với PIN: Owner `999999`, Cashier `111111`, Staff `222222`.
- **Inputs:**
  - `POST /v1/auth/login` với `{ "pin": "999999" }` -> mong đợi role `OWNER`.
  - `POST /v1/auth/login` với `{ "pin": "111111" }` -> mong đợi role `CASHIER`.
  - `POST /v1/auth/login` với `{ "pin": "222222" }` -> mong đợi role `STAFF`.
  - Thử 5 lần với `{ "pin": "000000" }`.
  - `POST /v1/auth/logout` với Bearer token của Cashier.
- **Expected Outputs:**
  - Đăng nhập đúng: HTTP 200, trả về token hợp lệ và thông tin role.
  - Đăng nhập sai: HTTP 401 Unauthorized `{ "code": "INVALID_PIN" }`.
  - Đăng nhập sai liên tiếp: Kích hoạt rate limit (HTTP 429) hoặc tạm khóa tài khoản.
  - Sau khi đăng xuất: Dùng lại token cũ gọi bất kỳ endpoint nào nhận HTTP 401 Unauthorized.

#### AUTH-02: Phân quyền RBAC (Staff bị chặn gọi endpoint nhạy cảm)
- **Mục tiêu:** Ngăn chặn nhân viên Order (STAFF) gọi các API quản trị hoặc tài chính (đổi giá, xem báo cáo doanh thu, thu tiền, mở ca, in lại hóa đơn).
- **Preconditions:** Staff đã đăng nhập thành công với Bearer token `staff-token`.
- **Inputs:** Các API call với header `Authorization: Bearer <staff-token>`:
  - `POST /v1/products` (Tạo sản phẩm)
  - `GET /v1/analytics/overview` (Xem doanh thu)
  - `POST /v1/shifts/open` (Mở ca thu ngân)
  - `POST /v1/orders/:id/capture` (Thu tiền mặt)
  - `POST /v1/receipts/:id/reprint` (In lại hóa đơn)
- **Expected Outputs:** Tất cả các lệnh trên trả về `HTTP 403 Forbidden`, code `FORBIDDEN_ROLE` hoặc tương đương. Dữ liệu trong database không bị thay đổi.

#### AUTH-03: Vô hiệu hóa tài khoản nhân viên khi đang có phiên hoạt động
- **Mục tiêu:** Khi Chủ tiệm (Owner) vô hiệu hóa một nhân viên, phiên đăng nhập hiện tại của nhân viên đó phải bị ngắt ngay lập tức.
- **Preconditions:** Staff đang có token hợp lệ.
- **Inputs:** Owner gọi API disable employee id `staff-1`. Sau đó Staff gửi request tạo đơn.
- **Expected Outputs:** Request tạo đơn của Staff bị từ chối với `HTTP 401 Unauthorized` hoặc `HTTP 403 Forbidden` (`USER_DISABLED`).

#### AUTH-04: Ghép nối và Thu hồi thiết bị (Device Pairing)
- **Mục tiêu:** Xác minh mã ghép nối thiết bị (pairing code) dùng 1 lần, hết hạn sau 3 phút; thiết bị bị thu hồi không thể truy cập API.
- **Preconditions:** Owner tạo pairing code.
- **Inputs:** Thiết bị mới dùng code để đổi API key. Dùng lại code lần thứ 2. Thu hồi thiết bị qua Owner API.
- **Expected Outputs:** Lần đổi thứ 2 bị từ chối; thiết bị bị thu hồi nhận HTTP 401.

---

### Khối 3: Quản lý Menu & Catalog (CAT-01, CAT-02)

#### CAT-01: Quản trị sản phẩm và Tính bất biến của Giá lịch sử
- **Mục tiêu:** Chủ tiệm tạo/sửa/vô hiệu hóa món; phiên bản menu (`catalog_version`) tăng lên; giá lịch sử của các đơn hàng đã tạo trước đó không bị ảnh hưởng.
- **Preconditions:** Catalog đang ở phiên bản $V_1$ có món Bánh mì thịt nướng giá 35.000 VND.
- **Inputs:**
  - Tạo đơn hàng $O_1$ có món trên (tổng 35.000 VND).
  - Owner cập nhật giá món thành 40.000 VND. Catalog version chuyển thành $V_2$.
  - Owner vô hiệu hóa món Bánh mì xíu mại.
- **Expected Outputs:**
  - `GET /v1/catalog` trả về version $V_2$, giá món là 40.000 VND; món xíu mại có cờ `is_active = false`.
  - Đơn hàng $O_1$ xem lại vẫn giữ nguyên giá snapshot là 35.000 VND.

#### CAT-02: Xử lý xung đột Catalog cũ (Stale Catalog Version)
- **Mục tiêu:** Ngăn chặn đặt hàng với thông tin menu cũ đã bị thay đổi giá.
- **Preconditions:** Client A đang giữ catalog version $V_1$. Catalog đã đổi sang $V_2$.
- **Inputs:** Client A gửi `POST /v1/orders` kèm `catalog_version: 1`.
- **Expected Outputs:** Server phản hồi `HTTP 409 Conflict`, code `CATALOG_CHANGED`, trả về version mới nhất để client làm mới menu. Không tạo đơn rác.

---

### Khối 4: Tạo đơn & Tính toàn vẹn đơn hàng (ORDER-01 -> ORDER-06)

#### ORDER-01: Tạo đơn hàng hợp lệ & Price Snapshot
- **Mục tiêu:** Tính toán giá từ phía Backend (Snapshot), sinh mã hiển thị thân thiện `#B00001` duy nhất, lưu đầy đủ ghi chú Unicode tiếng Việt.
- **Preconditions:** Món `BM-PAT` (30.000 VND), `TRA-TAC` (15.000 VND).
- **Inputs:**
  ```json
  {
    "items": [
      { "productId": "BM-PAT", "quantity": 2 },
      { "productId": "TRA-TAC", "quantity": 1 }
    ],
    "requestedPaymentMethod": "CASH",
    "note": "Bánh mì nhiều ớt, trà tắc ít đường",
    "catalogVersion": 1
  }
  ```
- **Expected Outputs:** HTTP 201 Created. `subtotal: 75000`, `total: 75000`. `displayCode: "#B00001"`. Trạng thái `PENDING`.

#### ORDER-02: Kiểm tra tính hợp lệ dữ liệu đầu vào & Phương thức thanh toán chưa kích hoạt
- **Mục tiêu:** Từ chối đơn hàng rỗng, số lượng <= 0, số lượng không phải số nguyên, món không tồn tại, hoặc phương thức MOMO/MIXED chưa được phép bật.
- **Inputs:**
  - Đơn không có items: `{ "items": [] }`.
  - Số lượng âm: `{ "productId": "BM-PAT", "quantity": -1 }`.
  - Số lượng thập phân: `{ "productId": "BM-PAT", "quantity": 1.5 }`.
  - Phương thức thanh toán: `requestedPaymentMethod: "MOMO"`.
- **Expected Outputs:** Server trả về HTTP 400 hoặc 422 với mã lỗi tương ứng (`EMPTY_ITEMS`, `INVALID_QUANTITY`, `UNSUPPORTED_PAYMENT_METHOD`). Không ghi nhận vào database.

#### ORDER-03: Idempotency trên lệnh tạo đơn (Tránh trùng lặp đơn)
- **Mục tiêu:** Gửi 2 lần cùng một `Idempotency-Key` và cùng body phải trả về chính xác đơn hàng đã tạo, không tạo bản ghi mới.
- **Inputs:** Header `Idempotency-Key: e2e-order-idem-01` gửi 2 lần liên tiếp.
- **Expected Outputs:**
  - Lần 1: HTTP 201 Created, `id: "ord-123"`.
  - Lần 2: HTTP 200/201, `id: "ord-123"`, mã hiển thị và nội dung giống hệt lần 1.
  - Database chỉ có duy nhất 1 bản ghi trong bảng `orders`.

#### ORDER-04: Xung đột Idempotency khi thay đổi Payload
- **Mục tiêu:** Gửi lại `Idempotency-Key` cũ nhưng thay đổi nội dung đơn hàng (ví dụ: đổi món hoặc số lượng).
- **Inputs:** `Idempotency-Key: e2e-order-idem-01` nhưng payload đổi từ 1 bánh mì thành 2 bánh mì.
- **Expected Outputs:** HTTP 409 Conflict với code `IDEMPOTENCY_CONFLICT`. Đơn ban đầu được bảo toàn.

#### ORDER-05: Phân trang danh sách đơn hàng & Queue thu ngân (>200 đơn)
- **Mục tiêu:** Hệ thống có thể tải danh sách >340 đơn hàng một cách trơn tru bằng cursor-based pagination; hàng đợi thu ngân hiển thị đầy đủ đơn chưa thanh toán.
- **Preconditions:** Đã nạp seed 340 đơn hàng.
- **Inputs:** `GET /v1/orders?limit=50&status=PENDING`.
- **Expected Outputs:** Trả về 50 phần tử đầu tiên kèm `nextCursor`. Không bị trùng hoặc mất đơn giữa các trang.

#### ORDER-06: Nhân viên gom đơn Offline & Đồng bộ khi có mạng (BLOCKED trên Native Mobile)
- **Mục tiêu:** Ứng dụng Staff Mobile cho phép tạo đơn offline, lưu vào SQLite cục bộ, tự động đẩy lên Hub khi kết nối lại mà không tạo trùng đơn.
- **Preconditions:** Thiết bị điện thoại thông minh Android/iOS thật.
- **Status:** **BLOCKED** do môi trường kiểm thử là máy chủ headless, không kết nối thiết bị di động vật lý.

---

### Khối 5: Quản lý Ca làm việc & Tiền mặt (SHIFT-01, SHIFT-02, CASH-01 -> CASH-07)

#### SHIFT-01: Mở ca thu ngân & Độc quyền một người giữ két tiền
- **Mục tiêu:** Mỗi thời điểm chỉ có duy nhất 1 ca mở với số tiền đầu ca (float); thu ngân khác không thể mở đè ca mới.
- **Inputs:**
  - Thu ngân 1 gọi `POST /v1/shifts/open` với `openingFloat: 500000`.
  - Thu ngân 2 gọi `POST /v1/shifts/open` với `openingFloat: 500000`.
- **Expected Outputs:**
  - Thu ngân 1: HTTP 201 Created, shift status `OPEN`.
  - Thu ngân 2: HTTP 409 Conflict, code `SHIFT_ALREADY_OPEN`.

#### CASH-01: Thu tiền mặt & Tính tiền thối chính xác
- **Mục tiêu:** Đơn hàng 70.000 VND, khách đưa 100.000 VND. Tính tiền thối 30.000 VND, cập nhật số dư két tiền +70.000 VND, sinh 2 receipt intents.
- **Inputs:** `POST /v1/orders/:id/capture` với `{ "amountTendered": 100000, "paymentMethod": "CASH" }`.
- **Expected Outputs:**
  - HTTP 200/201. Order status chuyển thành `PAID`.
  - `changeAmount: 30000`.
  - Két tiền ghi nhận dòng tiền vào (Inflow: +70.000 VND).
  - Tạo 2 bản ghi in hóa đơn: 1 bản `CUSTOMER`, 1 bản `STORE`.

#### CASH-02: Từ chối thanh toán khi tiền đưa không đủ
- **Mục tiêu:** Đơn hàng 70.000 VND, khách đưa 50.000 VND.
- **Inputs:** `amountTendered: 50000`.
- **Expected Outputs:** HTTP 400/422 với code `INSUFFICIENT_TENDER`. Đơn vẫn giữ trạng thái `PENDING`. Không sinh dòng tiền trong két.

#### CASH-03: Idempotency trên giao dịch Thu tiền
- **Mục tiêu:** Gửi 2 lần cùng một `Idempotency-Key` thu tiền không làm nhân đôi doanh thu trong sổ cái.
- **Inputs:** Gọi `POST /v1/orders/:id/capture` 2 lần với cùng key.
- **Expected Outputs:** Lần 2 trả lại kết quả của lần 1. Bảng `payments` chỉ có 1 dòng ghi nhận giao dịch.

#### CASH-04: Thu ngân gặp sự cố mạng/mất điện giữa chừng (Client Recovery)
- **Mục tiêu:** Đóng trình duyệt hoặc ngắt mạng ngay khi ấn "Xác nhận thu tiền", sau đó tải lại trang.
- **Expected Outputs:** Trạng thái đơn được hiển thị chính xác (đã PAID), không cho phép ấn thu tiền lần 2.

#### CASH-05: Khách chọn chuyển khoản nhưng đổi ý trả Tiền mặt
- **Mục tiêu:** Đơn hàng ban đầu yêu cầu `BANK`, nhưng thu ngân thu bằng `CASH`. Báo cáo tài chính ghi nhận trung thực là doanh thu tiền mặt.
- **Inputs:** Đơn hàng tạo với `requestedPaymentMethod: "BANK"`. Thu ngân gọi capture với `paymentMethod: "CASH"`.
- **Expected Outputs:** Bảng `payments` lưu `method: "CASH"`. Báo cáo doanh thu tăng ở cột Tiền mặt, cột Ngân hàng là 0.

#### CASH-06: Hoàn tiền đơn hàng kèm Lý do kiểm toán
- **Mục tiêu:** Hoàn tiền cho đơn hàng đã thanh toán bằng tiền mặt; bắt buộc có lý do hoàn tiền; số tiền trong két giảm tương ứng; không cho phép hoàn tiền 2 lần.
- **Inputs:**
  - Lần 1: `POST /v1/orders/:id/refund` với `{ "reason": "Khách hủy bánh mì do đợi lâu", "amount": 70000 }`.
  - Lần 2: Gọi lại refund trên cùng đơn đó.
- **Expected Outputs:**
  - Lần 1: HTTP 200/201. Order status chuyển thành `REFUNDED`. Ghi nhận dòng tiền ra trong két (-70.000 VND).
  - Lần 2: HTTP 409 Conflict (`ALREADY_REFUNDED`).

#### CASH-07: Hủy đơn hàng chưa thanh toán (Void)
- **Mục tiêu:** Hủy đơn hàng đang chờ thanh toán; đơn bị hủy không được xuất hiện trong hàng đợi thu ngân và không thể thu tiền.
- **Inputs:** Gọi `POST /v1/orders/:id/void` với `{ "reason": "Khách đổi ý không mua nữa" }`. Thử gọi capture sau đó.
- **Expected Outputs:** Trạng thái chuyển thành `VOIDED`. Lệnh capture bị từ chối với HTTP 400 (`ORDER_VOIDED`).

#### SHIFT-02: Nạp/Rút tiền trong ca & Đóng ca kiểm kê tiền mặt
- **Mục tiêu:** Ghi nhận các khoản nạp lẻ/rút nộp tiền cho chủ tiệm; khi đóng ca, tính toán số tiền kỳ vọng và ghi nhận độ lệch (variance) kèm lý do.
- **Inputs:**
  - Nạp thêm tiền lẻ: `POST /v1/shifts/movements` `{ "type": "IN", "amount": 200000, "reason": "Đổi thêm tiền lẻ" }`.
  - Rút tiền nộp chủ: `POST /v1/shifts/movements` `{ "type": "OUT", "amount": 500000, "reason": "Giao bớt tiền cho chủ" }`.
  - Đóng ca: `POST /v1/shifts/close` với số tiền thực tế đếm được.
- **Expected Outputs:**
  - Ca đóng thành công, status `CLOSED`.
  - Số tiền dự kiến = Tiền đầu ca + Doanh thu tiền mặt - Hoàn tiền + Nạp tiền - Rút tiền.
  - Mọi chênh lệch bắt buộc phải lưu kèm giải trình của thu ngân.

---

### Khối 6: Thanh toán Ngân hàng / VietQR (BANK-01 -> BANK-03)

#### BANK-01: Bảo vệ chống hình chụp chuyển khoản giả mạo (Screenshot Guard)
- **Mục tiêu:** Đơn hàng tạo mã VietQR chỉ được coi là đã thanh toán khi nhận được sự kiện bảo mật từ ngân hàng. Không bao giờ gạch nợ dựa trên ảnh chụp màn hình khách đưa.
- **Inputs:** Tạo đơn hàng kèm yêu cầu `BANK`. Khách hàng đưa điện thoại báo đã chuyển khoản. Thu ngân không thao tác xác nhận giả lập.
- **Expected Outputs:** Đơn hàng vẫn giữ trạng thái `PENDING`. Doanh thu ngân hàng bằng 0. Không in hóa đơn hoàn tất thanh toán.

#### BANK-02: Xác thực chữ ký HMAC và Đối soát Webhook Ngân hàng
- **Mục tiêu:** Chỉ chấp nhận webhook ngân hàng có chữ ký HMAC hợp lệ, đúng số tài khoản, đúng số tiền và đúng mã đơn hàng tham chiếu.
- **Inputs:**
  - Webhook giả mạo chữ ký HMAC hoặc sai khóa bí mật.
  - Webhook sai số tiền (đơn 70.000 VND nhưng báo nhận 50.000 VND).
  - Webhook hợp lệ kèm đúng HMAC SHA-256.
  - Gửi lại webhook hợp lệ lần 2 (Replay Attack).
- **Expected Outputs:**
  - Webhook giả mạo/sai HMAC: HTTP 401 Unauthorized / HTTP 400 Bad Request.
  - Webhook thiếu tiền: Bị từ chối hoặc đưa vào diện ngoại lệ cần kế toán duyệt.
  - Webhook hợp lệ: HTTP 200/201. Đơn chuyển thành `PAID`, gạch nợ thành công.
  - Webhook gửi lại: Bỏ qua an toàn (Idempotent), không nhân đôi doanh thu.

#### BANK-03: Dự phòng khi mất kết nối Cloud/Cổng thanh toán
- **Mục tiêu:** Khi đứt mạng Internet, Store Hub vẫn hoạt động trơn tru với các đơn tiền mặt; các đơn chuyển khoản được lưu trạng thái chờ để đối soát sau khi có mạng lại.
- **Expected Outputs:** Hệ thống không bị treo hoặc crash.

---

### Khối 7: In Hóa đơn & Két đựng tiền ESC/POS (PRINT-01, PRINT-02)

#### PRINT-01: Tạo lệnh in 2 liên (Khách hàng & Cửa hàng)
- **Mục tiêu:** Khi thanh toán thành công, hệ thống đẩy 2 lệnh in vào hàng đợi (Spooler), định dạng ESC/POS chuẩn, chứa đầy đủ thông tin đơn hàng, số tiền và phương thức thanh toán thực tế.
- **Status:** 
  - Phần mềm & Spooler: **AUTOMATED (PASS)** trong unit/integration test.
  - Máy in nhiệt ESC/POS vật lý 80mm: **BLOCKED** do không có thiết bị phần cứng cắm tại cổng USB/LAN.

#### PRINT-02: Xử lý kẹt giấy/mất kết nối máy in & In lại có kiểm toán
- **Mục tiêu:** Nếu máy in lỗi giữa chừng, trạng thái in ghi nhận là `UNKNOWN` hoặc `FAILED`. Cho phép thu ngân bấm in lại (`REPRINT`) nhưng không tạo thêm giao dịch thu tiền mới trong sổ cái.
- **Inputs:** Gửi lệnh `POST /v1/receipts/:id/reprint` có xác thực quyền thu ngân.
- **Expected Outputs:** Sinh lệnh in mới trong spooler với ghi chú `BẢN IN LẠI (REPRINT)`, audit log ghi nhận thu ngân đã thực hiện. Doanh thu không bị cộng thêm.

---

### Khối 8: Báo cáo Doanh thu & Đối soát Sổ cái (ANALYTICS-01 -> ANALYTICS-03)

#### ANALYTICS-01: Báo cáo Doanh thu ngày trên tập dữ liệu >340 đơn
- **Mục tiêu:** Xác minh tính chính xác của các chỉ số tổng hợp: Tổng đơn hàng, Số đơn thành công, Số đơn hủy, Số đơn hoàn tiền, Doanh thu thực tế.
- **Preconditions:** Database đã seed đầy đủ 340 đơn hàng thực tế.
- **Inputs:** `GET /v1/analytics/overview`.
- **Expected Outputs:**
  - `totalOrders: 340`
  - `paidOrders: 39`
  - `voidedOrders: 18`
  - `refundedOrders: 7`
  - `pendingOrders: 276`
  - Doanh thu tiền mặt và ngân hàng khớp 100% với bảng `payments`. Không bị giới hạn cứng 300 đơn.

#### ANALYTICS-02: Phân tích số lượng sản phẩm bán ra theo mốc thời gian
- **Mục tiêu:** Đếm chính xác số lượng bánh mì và nước ngọt bán ra theo Ngày/Tuần/Tháng; chỉ tính các đơn đã thanh toán (PAID); đơn hủy (VOIDED) không được tính vào sản lượng bán.
- **Expected Outputs:** Số lượng sản phẩm bán ra khớp chính xác với chi tiết các dòng trong bảng `order_items` của các đơn đã thanh toán.

#### ANALYTICS-03: Đối soát chéo giữa Sổ cái Thanh toán và Ca Thu ngân
- **Mục tiêu:** Tổng tiền mặt trong báo cáo doanh thu phải bằng tổng tiền vào (inflows) trừ tiền ra (refunds/outflows) của tất cả các ca trong ngày.
- **Expected Outputs:** Sai số chênh lệch bằng 0 VND (Zero Variance Reconciliation).

---

### Khối 9: Đồng bộ Đám mây & Khả năng Chịu lỗi (CLOUD-01..03, RESILIENCE-01..02, OPS-01)

#### CLOUD-01: Đồng bộ Outbox từ Store Hub lên Cloud Backend (BLOCKED trên Postgres Cloud)
- **Mục tiêu:** Store Hub lưu mọi biến động vào bảng `outbox_events`. Một tiến trình nền định kỳ đẩy các sự kiện này lên Cloud PostgreSQL một cách tuần tự và bảo đảm tính Idempotency.
- **Status:** **BLOCKED** do thiếu kết nối cơ sở dữ liệu PostgreSQL từ xa.

#### CLOUD-02: Chủ tiệm điều chỉnh Menu từ xa xuống Cửa hàng
- **Mục tiêu:** Cloud ký số một lệnh cập nhật giá menu và gửi về Store Hub. Hub xác thực chữ ký và cập nhật catalog cục bộ.
- **Expected Outputs:** Catalog tại Hub cập nhật an toàn mà không làm gián đoạn các đơn hàng đang giao dịch.

#### RESILIENCE-01: Tự phục hồi sau khi bị tắt đột ngột (Crash Before ACK)
- **Mục tiêu:** Giả lập tiến trình Store Hub bị crash (SIGKILL / kill process) ngay sau khi commit transaction vào SQLite nhưng chưa kịp gửi response HTTP về cho client.
- **Expected Outputs:** Khi khởi động lại, SQLite WAL phục hồi nguyên vẹn giao dịch. Client gửi lại với cùng `Idempotency-Key` nhận được kết quả đã commit thành công.

#### RESILIENCE-02: Sao lưu & Khôi phục Database an toàn (Non-destructive Restore)
- **Mục tiêu:** Tiến trình sao lưu định kỳ tạo bản backup SQLite kèm file manifest checksum SHA-256. Kiểm tra phục hồi thử nghiệm sang thư mục riêng biệt, tuyệt đối không ghi đè trực tiếp lên file database đang hoạt động.
- **Status:** **BLOCKED** trên môi trường tự động vì cần sự can thiệp trực tiếp của quản trị viên hệ thống để kiểm tra trên máy chủ vận hành thật.

#### OPS-01: Giám sát Trạng thái Vận hành (Health Check & Disk Space)
- **Mục tiêu:** API `/v1/health` cung cấp đầy đủ thông tin: Trạng thái Database, dung lượng ổ đĩa khả dụng, độ dài hàng đợi in ấn, trạng thái đồng bộ Cloud.
- **Expected Outputs:** Trả về HTTP 200 OK kèm các thông số sức khỏe hệ thống.

---

### Khối 10: Giao diện Người dùng & Tải trọng Concurrency (UI-01, UI-02, LOAD-01, LOAD-02)

#### UI-01: Kiểm thử Giao diện Cashier POS & Owner Web trên đa trình duyệt
- **Mục tiêu:** Kiểm tra giao diện Cashier POS (1024x768) và Owner Web trên 3 engine Chromium, Firefox, WebKit. Đảm bảo phông chữ Be Vietnam Pro hiển thị đúng, không bị tràn màn hình (horizontal overflow), bàn phím số thao tác nhanh chóng, các nút bấm có kích thước tối thiểu đạt chuẩn chạm (>=44px).
- **Execution:** Thực thi tự động bằng Playwright (`tests/e2e/web-real-hub.spec.ts`).
- **Expected Outputs:** Mọi kiểm tra giao diện đều PASS trên cả 3 trình duyệt.

#### UI-02: Khả năng hiển thị khi Mất mạng & Trạng thái tải (Loading States)
- **Mục tiêu:** Khi Hub phản hồi chậm hoặc tạm thời mất kết nối, UI hiển thị banner cảnh báo rõ ràng, nút bấm thanh toán bị vô hiệu hóa tạm thời để tránh double-tap, không hiển thị trạng thái "ĐÃ THANH TOÁN" giả mạo.

#### LOAD-01: Kiểm thử Tải bùng nổ (Burst Load 8 Staff đồng thời, >=150 đơn/giờ)
- **Mục tiêu:** Giả lập 8 nhân viên phục vụ tạo đơn liên tục trong giờ cao điểm. Đạt hoặc vượt chỉ tiêu 150 đơn/giờ (thực tế kiểm thử đạt >300 đơn/giây trên loopback). Không có đơn nào bị mất, không sinh mã hiển thị trùng lặp, độ trễ p95 đáp ứng tiêu chuẩn mạng LAN (<400ms).
- **Execution:** Thực thi tự động bằng `tests/e2e/concurrency-load.e2e.test.mjs`.
- **Expected Outputs:** 150/150 đơn thành công. 0 lỗi. p50 ~226ms, p95 ~393ms. PASS.

#### LOAD-02: Hiệu năng Truy vấn với Lịch sử 100.000 đơn hàng
- **Mục tiêu:** Bảng `orders` được đánh index thích hợp (`idx_orders_created_at`, `idx_orders_status`, `idx_orders_shift_id`). Truy vấn phân trang cursor-based trên tập dữ liệu lớn vẫn giữ thời gian phản hồi dưới 50ms.



## 3. Independent coverage notes (2026-11-03)

**Count:** the traceability table defines **42 unique scenario IDs**. These are requirement IDs, **not** the number of test runner test cases. Existing reports stating 37 IDs or 155 PASS are outdated; GitHub CI baseline at QA HEAD `7145f726...` shows **158 separately executed node:test/Playwright cases** and planning check of 36 required files (not tests). See `E2E_RUN_REPORT.md §9` for provenance. Coverage state below is intentionally conservative.

| ID | Audit classification | Additional test/acceptance needed |
|---|---|---|
| CASH-04 | PARTIAL | `tests/e2e/web-real-hub.spec.ts` proves successful checkout, **not** cash-capture browser crash/reload/lost ACK; add real browser fault injection and DB reconciliation |
| SEC-01 | PARTIAL | Real-Hub suite has health and auth checks, but does not prove all CORS/security headers or secrets redaction; add dedicated assertions |
| UI-01 | PARTIAL | Firefox/WebKit smoke runs with mocked HTTP; real-hub browser E2E is Chromium only |
| UI-02 | NOT VERIFIED by cited source | `tests/cashier-queue.test.mjs` exercises DB queue, not HTTP 500/timeout/browser error states; use UI failure-injection E2E |
| LOAD-02 | NOT VERIFIED | No measured 100k-order cursor benchmark in this QA pack; implement synthetic safe benchmark and record SQL latency, indexes and UI impact |
| CLOUD-01, CLOUD-03 | PG CI evidence separate; external staging BLOCKED | `.github/workflows/cloud-ci.yml` runs isolated PostgreSQL integration, while real WAN outage, staged recovery and production RBAC acceptance are not inferred |
| PRINT-01 | virtual spooler exercised; physical BLOCKED | Inspect actual printer model, 2 paper copies, cutter, glyphs, failure/reprint |
| DRAWER-PHYS (additional field gate) | NOT IMPLEMENTED / BLOCKED | Do **not** use CASH-01 as hardware proof. Drawer Kick driver is not present in `apps/store-hub/src/printer.ts`; verify model/SDK and authorized audited kick before field acceptance |
| BANK-01, BANK-02 | Hub fake bridge HMAC covered; real merchant/provider BLOCKED | SePay Cloud adapter + isolated PG tests exist, but physical bank merchant sandbox and end-to-end transfer still require external sign-off |

No hardware/sandbox/field acceptance is marked PASS by this document. A failed, missing, or blocked acceptance must remain explicit, even when all implemented software tests pass.
