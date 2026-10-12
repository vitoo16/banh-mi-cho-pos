# BÁNH MÌ CHỢ POS — CÀI ĐẶT & CHẠY MONOREPO CHO MANUAL TEST

> Tài liệu kỹ thuật dành cho người setup máy. Các bước dưới đây là **local/development pilot**, không tự triển khai production hoặc bypass bảo mật LAN. Khi hướng dẫn dưới đây khác cấu hình máy tại tiệm, ưu tiên `docs/ops/LOCAL_PILOT.md` và nguồn code/version thực tế.

## 1. Một repo — nhiều ứng dụng độc lập

```text
banh-mi-cho-pos/
├── apps/
│   ├── store-hub/       # NestJS + Fastify, SQLite WAL, HTTP LAN, máy in
│   ├── cloud-api/       # NestJS + Fastify, PostgreSQL, Owner remote/SePay adapter
│   ├── web-pos/         # React 19 + Vite, giao diện thu ngân
│   ├── web-owner/       # React 19 + Vite + TanStack Query, giao diện chủ
│   ├── mobile-staff/    # Expo + React Native, thiết bị nhân viên
│   └── api/             # Workspace placeholder, KHÔNG phải backend chạy
├── packages/
│   ├── contracts/       # API client và types dùng chung
│   ├── domain/          # Quy tắc đơn/tiền
│   └── ui/              # Tokens/design
├── tests/               # Node integration + Playwright UI
├── docs/guides/         # User guide và setup
└── package.json         # npm workspaces
```

**Quan trọng:** mỗi app có lệnh khởi động riêng từ repo root; chạy `npm run dev:hub` **không** tự động mở web + Expo + Cloud. **Không** dùng `apps/api` làm backend.

## 2. Điều kiện trước khi chạy

- Máy Windows/macOS/Linux có **Node.js 24 trở lên**, npm, Git.
- Trình duyệt Chrome/Edge cho POS/Owner.
- Cần Android Studio/SDK hoặc thiết bị Android với **Expo development build** để thử mobile. iOS native build yêu cầu macOS/Xcode và điều kiện Apple tương ứng; không tự nhận là đã kiểm thử iPhone.
- Dùng Wi-Fi thử nghiệm riêng nếu kết nối điện thoại thật; **không dùng thông tin khách và tiền thật**.
- Mỗi tài khoản có PIN tự chọn mạnh; không dùng placeholder trong môi trường thực.

Tại repo root:

```bash
node --version
npm --version
npm install --no-audit --no-fund
npm run build -w @bmc/contracts
```

Cấu hình dotenv **từng workspace**. Trên Windows PowerShell có thể dùng `Copy-Item`, trên Bash dùng `cp`.

## 3. Store Hub — backend NỘI BỘ bắt buộc

Tạo cấu hình từ mẫu:

```powershell
Copy-Item apps/store-hub/.env.example apps/store-hub/.env
```

Chỉnh `apps/store-hub/.env`:

```dotenv
STORE_DB_PATH=./store-data/bmc.sqlite
HUB_BIND_HOST=127.0.0.1
HUB_PORT=4400
SEED_DEMO_CATALOG=1
BOOTSTRAP_OWNER_PIN=THAY_BANG_PIN_RIENG_DU_DAI
BOOTSTRAP_CASHIER_PIN=THAY_BANG_PIN_KHAC_DU_DAI
BOOTSTRAP_STAFF_PIN=THAY_BANG_PIN_KHAC_NUA
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

`SEED_DEMO_CATALOG=1` chỉ dùng **giá và sản phẩm mẫu**; dữ liệu thật sẽ do Owner nhập. Không chia sẻ các PIN này và không commit `.env`.

Khởi động (terminal 1, ở repo root):

```bash
npm run dev:hub
```

Kiểm tra backend:

```text
http://127.0.0.1:4400/v1/health
```

Mong đợi HTTP 200, không phải trang HTML. Cấu hình local mặc định chỉ bind loopback. Không mở cổng 4400 ra Internet.

**Lưu ý tài khoản bootstrap:** `owner`, `cashier`, `staff` được khởi tạo khi DB mới; **sửa PIN trong `.env` sau khi DB đã tồn tại sẽ không tự đổi PIN trong SQLite**. Không xóa DB đã có giao dịch chỉ để reset tài khoản. Khi cần reset môi trường test, tạo DB test mới ở một path riêng và ghi rõ đây là dữ liệu giả.

## 4. POS Web — dành cho thu ngân

Terminal 2 (repo root):

```bash
npm run dev:pos
```

Mở: **http://127.0.0.1:5173**

- Vite dev server proxy `/v1` → `http://127.0.0.1:4400` nên **Hub phải đang chạy**.
- Nhập **PIN cashier**, không cần nhập ID.
- Chọn **Sổ quỹ & chốt ca** mở ca, sau đó **Đơn hàng** để thu tiền.
- Không dùng lệnh Vite dev làm “production Windows service”; bộ cài và tự khởi động vẫn là hạng mục triển khai riêng.

## 5. Owner Web — dành cho chủ

Terminal 3 (repo root):

```bash
npm run dev:owner
```

Mở: **http://127.0.0.1:5174**

- Mặc định `VITE_CLOUD_API_URL` **không đặt** → Owner gọi Store Hub qua proxy Vite, dùng PIN `owner`.
- Có thể thêm/sửa sản phẩm, tạo nhân viên, phát mã ghép thiết bị ở chế độ nội bộ.
- Nếu build Owner với `VITE_CLOUD_API_URL=https://...` thì sẽ chuyển sang **Cloud Owner**, dùng mật khẩu từ xa và dữ liệu mirror; không dùng PIN Owner Hub để login Cloud.
- `VITE_CLOUD_API_URL` là giá trị **public trong bundle Vite**. Chỉ được đặt base URL của API, **không đặt DATABASE_URL/PIN/secret**.

## 6. Mobile Staff — Expo development build

Tạo cấu hình trong `apps/mobile-staff/.env`:

```dotenv
EXPO_PUBLIC_HUB_URL=https://<IP_HOAC_DNS_LAN_CUA_HUB>:4400
```

Lưu ý:
- **Trên điện thoại, `localhost` và `127.0.0.1` trỏ vào chính điện thoại**, không phải máy Windows Store Hub.
- Hub ở LAN phải có IP/DNS đúng, chứng chỉ TLS được hệ điều hành Android/iOS tin cậy, ghép thiết bị bắt buộc và firewall chỉ cho mạng tiệm.
- `EXPO_PUBLIC_ALLOW_INSECURE_DEV=1` + `ALLOW_INSECURE_LAN_DEV=1` chỉ dành cho **Wi-Fi test cô lập, dữ liệu giả và native development mode**; không dùng cho đơn tiền thật.
- `apps/mobile-staff` dùng **expo-dev-client** và các native modules SQLite/SecureStore. **Không giả định Expo Go sẽ chạy được**.

Terminal 4:

```bash
npm run dev:mobile
```

Có thể phải build development client trước, ví dụ từ repo root:

```bash
npm run android -w @bmc/mobile-staff
```

Lệnh iOS (khi có macOS/Xcode):

```bash
npm run ios -w @bmc/mobile-staff
```

**Kịch bản ghép:**
1. Owner Web nội bộ → **Nhân viên** → tạo tài khoản riêng.
2. Owner → **Thiết bị nhân viên** → nhập tên máy, bấm **Tạo mã ghép** (mã tồn tại khoảng 3 phút).
3. Mobile → nhập mã nhân viên, PIN và mã ghép → đăng nhập.
4. Mobile chọn món → xem đơn → **LƯU ĐƠN**.
5. POS Web phải thấy đơn; **Staff không được tự ghi nhận PAID**.

Nếu Hub vẫn chỉ bind `127.0.0.1`, điện thoại vật lý **không truy cập được**. Người kỹ thuật phải cấu hình TLS/LAN/pairing theo `docs/ops/LOCAL_PILOT.md`. Đừng chỉ sửa IP rồi mở firewall ra toàn mạng.

## 7. Cloud API — thành phần TÙY CHỌN cho remote Owner

Cloud không cần thiết cho vòng manual test **CASH tại quầy**. Nếu muốn thử báo cáo từ xa:

- PostgreSQL có thể chạy local hoặc trên một dịch vụ staging bên ngoài.
- Tạo `apps/cloud-api/.env` từ mẫu, đặt `DATABASE_URL`, `CLOUD_STORE_ID`, `CLOUD_SYNC_SECRET` (ít nhất 32 ký tự), `CLOUD_OWNER_LOGIN_SECRET` (ít nhất 16 ký tự).
- Với local test: `CLOUD_BIND_HOST=127.0.0.1`, `CLOUD_PORT=4500`, `CLOUD_ALLOWED_ORIGIN=http://localhost:5174`.
- Chỉ đặt `CLOUD_TLS_TERMINATED=1` khi **thực sự có reverse proxy/managed ingress HTTPS đáng tin cậy**; không dùng nó để hợp thức hóa HTTP công khai.

Terminal riêng:

```bash
npm run dev:cloud
```

Health: `http://127.0.0.1:4500/v1/health`

Để Hub tự gửi dữ liệu lên Cloud, cấu hình riêng trong Hub:
```dotenv
CLOUD_SYNC_URL=https://<CLOUD_HOSTNAME>
CLOUD_STORE_ID=<SAME_STORE_ID_AS_CLOUD>
CLOUD_SYNC_SECRET=<SAME_SECRET_AS_CLOUD>
```

**Không đặt khóa sync trong web hoặc Expo**. Sau khi đã cấu hình đúng, Hub có outbox gửi HTTPS có chữ ký; Owner Cloud chỉ phản ánh dữ liệu đã đồng bộ, có thể trễ. Các tác vụ tài chính vẫn lấy Hub làm nguồn chính.

## 8. Script monorepo quan trọng

| Mục đích | Lệnh tại repo root |
|---|---|
| Build tất cả web/backend | `npm run build` |
| Typecheck ứng dụng | `npm run check` |
| Unit/domain nghiệp vụ tiền | `npm run test:domain` |
| Hub/SQLite/idempotency/integration | `npm run test:integration` |
| E2E Chromium/Playwright | `npm run test:ui` (cần setup browser theo Playwright) |
| Kiểm tra bundle JS/CSS | `npm run test:bundle` (sau build) |
| 8 Staff, 150 đơn HTTP loopback | `npm run test:perf:http` (sau build Store Hub) |
| Kiểm tra tài liệu | `npm run docs:check` |
| Backup SQLite + manifest | `npm run backup:store -- <NEW_FILE.sqlite>` |
| Verify SQLite + manifest | `npm run verify:backup -- <BACKUP.sqlite>` |
| Audit tuổi backup | `npm run check:backup-freshness -- <DIR> 15` |

**Lưu ý:** `npm run build` không tạo ứng dụng di động native phát hành; mobile có quy trình build Expo riêng. Các bài CI mô phỏng thiết bị không thay thế UAT trên Windows/Android/iOS.

## 9. Test luồng end-to-end tối thiểu

1. Đảm bảo Hub → POS → Owner → Staff đã mở, dùng **cùng database Hub test**.
2. Owner tạo bánh **Bánh mì thử nghiệm** giá **35.000đ** và bật bán.
3. Owner tạo/ghép nhân viên; Staff đăng nhập.
4. Staff chọn **2 bánh** → **LƯU ĐƠN** → nhận mã đơn, tổng 70.000đ.
5. POS → **Mở ca** với tiền đầu ca **250.000đ** → tìm đơn → nhập khách đưa **100.000đ** → kiểm tra thối **30.000đ** → xác nhận CASH.
6. POS thấy **Đã thu**; với printer chưa cấu hình, liên biên nhận có thể **Đang chờ máy in**, không được coi đã xuất giấy.
7. Owner → Tổng quan/Sản lượng phải ghi nhận theo quy tắc **đơn đã thu đủ**; tài chính két dự kiến **320.000đ**.
8. Reload 3 giao diện, tra mã đơn và so trạng thái. Đổi giá món thử sang 40.000đ: **đơn cũ vẫn 70.000đ**; đơn mới dùng giá mới.
9. Thử giả lập lỗi mạng: **không tạo lệnh/thanh toán mới** khi chưa biết ACK.
10. Chốt ca test với số tiền thực đếm và giải trình nếu chênh lệch.

## 10. Sửa lỗi cài đặt thường gặp

| Lỗi | Kiểm tra |
|---|---|
| Web POS/Owner chỉ hiện lỗi kết nối | Hub đang chạy ở port 4400? Vite proxy đúng? Đang mở đúng URL 5173/5174? |
| Mobile không thấy Hub | Không dùng 127.0.0.1; kiểm tra Wi-Fi test, cert TLS, firewall, pairing, LAN bind |
| Đổi PIN env nhưng không login được | DB cũ đã bootstrap; không tự rotate PIN sau lần đầu |
| Menu Mobile trống | Owner đã thêm sản phẩm và bật **Đang bán**? Hub và Staff đang dùng cùng DB/URL? |
| Nhấn LƯU mà không có mã đơn | Không tạo đơn lại; sử dụng **Kiểm tra lại đơn với POS** |
| CASH bị khóa | Thu ngân chưa mở ca, Hub offline, tiền khách đưa chưa đủ hoặc có capture chưa xác minh |
| BANK báo lỗi/chưa có QR | Provider chưa được cấu hình/nghiệm thu; dùng CASH giả lập trong pilot |
| Owner Cloud không thấy lệnh/menu mới | Kiểm tra Hub outbound sync, signed command inbox, `CLOUD_STORE_ID`, stale/pending trạng thái |
| Máy in chờ/UNKNOWN | Chưa cấu hình `PRINTER_HOST` hoặc kết nối lỗi; kiểm tra giấy trước khi in lại |
| Windows backup script thất bại | Thư mục backup có sẵn, được bảo vệ, chấp thuận operator và đủ quyền? Xem `RUNBOOK.md` |

**Không bao giờ** xóa SQLite live, xóa app data hoặc reset key để chữa lỗi “đơn chưa chắc chắn” trước khi đối soát.

---

- [Hướng dẫn người sử dụng Owner / POS / Staff](./USER_GUIDE.md)
- [Free Cloud staging (chưa deploy)](./FREE_STAGING_DEPLOY.md)
- [Runbook chính](../ops/RUNBOOK.md)
- [Local Pilot nâng cao](../ops/LOCAL_PILOT.md)
