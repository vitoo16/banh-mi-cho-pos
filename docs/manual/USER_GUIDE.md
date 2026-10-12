# HƯỚNG DẪN SỬ DỤNG BÁNH MÌ CHỢ POS — WEB & MOBILE

> **Phiên bản:** Manual testing / pilot, 12/10/2026. Áp dụng cho monorepo `banh-mi-cho-pos`.
> **Quan trọng:** Dùng dữ liệu giả trên môi trường thử nghiệm. Chưa được nghiệm thu toàn bộ thiết bị, merchant bank, bảo mật mạng hoặc hóa đơn điện tử cho giao dịch thật.

## 1. Tổng quan hệ thống

| Thành phần | Ai sử dụng? | Tác dụng |
| --- | --- | --- |
| **Store Hub** — `apps/store-hub` | Quản trị kỹ thuật | Backend nội bộ: đơn, giá, thanh toán, ca, SQLite, hàng đợi in, outbox; nguồn dữ liệu authoritative tại cửa hàng |
| **POS Web** — `apps/web-pos` | Thu ngân | Nhận đơn của Staff, thu tiền mặt, yêu cầu BANK, quản lý tiền đầu ca/cuối ca, trạng thái máy in |
| **Owner Web** — `apps/web-owner` | Chủ tiệm | Sản phẩm, nhân viên, mã ghép điện thoại, tổng quan, số bánh đã bán, đơn hàng, báo cáo và đối soát |
| **Staff Mobile** — `apps/mobile-staff` | Nhân viên nhận order | Chọn bánh, số lượng, ghi chú, hình thức thanh toán *khách dự định dùng*, lưu đơn và tra cứu đơn của mình |
| **Cloud API** — `apps/cloud-api` | Hệ thống và Owner từ xa | Đồng bộ từ Store Hub ra PostgreSQL; báo cáo từ xa có thể trễ; lệnh sửa giá từ xa chờ Hub xác nhận |

**Tiền và đơn:** Staff chỉ tạo đơn, không có quyền xác nhận đã thu tiền. Thu ngân xác nhận CASH khi thực sự nhận đủ tiền. BANK chỉ được xác nhận bởi luồng chứng thực từ nhà cung cấp ngân hàng hợp lệ; không đánh dấu đã trả chỉ vì khách chọn BANK, đưa ảnh chuyển khoản hoặc QR hiện ra.

### Môi trường thử nghiệm nội bộ

- POS Web: `http://127.0.0.1:5173` (mở **trên máy chạy POS/Hub**).
- Owner Web: `http://127.0.0.1:5174` (chế độ Hub nội bộ khi không cấu hình `VITE_CLOUD_API_URL`).
- Store Hub: `http://127.0.0.1:4400`, chỉ nghe localhost mặc định.
- Cloud API: `http://127.0.0.1:4500` khi cấu hình PostgreSQL và chạy local; **không phải một URL public đã deploy**.
- Điện thoại thật: phải cùng mạng thử nghiệm, được cấu hình địa chỉ Hub có thể truy cập từ điện thoại và ghép thiết bị. `127.0.0.1` trên **điện thoại** chính là điện thoại, **không phải máy Hub**.

Nếu trang không tải, xem mục **10. Khắc phục sự cố**. Không mở firewall ra Internet công cộng, không dùng `ALLOW_INSECURE_LAN_DEV` với dữ liệu khách thật.

## 2. Chuẩn bị lần đầu (người quản trị kỹ thuật)

Cài Node.js **24+** và npm, tải code monorepo về máy thử nghiệm. Tại **thư mục gốc repository**:

```bash
npm install
npm run build -w @bmc/contracts
```

Tạo `apps/store-hub/.env` dựa trên `apps/store-hub/.env.example`. Cấu hình **PIN riêng và mạnh** cho OWNER, CASHIER, STAFF; đường dẫn `STORE_DB_PATH` là thư mục dữ liệu thử nghiệm; `HUB_BIND_HOST=127.0.0.1`, `HUB_PORT=4400`. `SEED_DEMO_CATALOG=1` chỉ tạo **giá thử**, tuyệt đối không dùng để bán hàng thật.

Đảm bảo biến môi trường thực sự được nạp vào tiến trình Hub theo cách khởi chạy đã cấu hình; nếu dev script không tự tải `.env`, hãy nạp biến qua shell/process manager trước khi chạy. Không commit `.env`, tài khoản, mật khẩu, PIN hay khóa webhook.

Mở **bốn terminal tại gốc monorepo**:

| Terminal | Lệnh | Kết quả |
| --- | --- | --- |
| 1 | `npm run dev:hub` | API cục bộ và SQLite |
| 2 | `npm run dev:pos` | POS Web, cổng 5173 |
| 3 | `npm run dev:owner` | Owner Web, cổng 5174 |
| 4 | `npm run dev:mobile` | Expo dev server; dùng development build hoặc môi trường Expo được dự án hỗ trợ |

Chưa cần chạy Cloud để thử **CASH cục bộ**. Nếu cần thử Owner từ xa, xem `DEPLOYMENT_FREE_TEST.md`. Cloud không thay thế Store Hub.

**Lưu ý:** bootstrap user/PIN được tạo ở lần khởi chạy đầu. Sửa PIN trong `.env` sau khi đã tạo database không nhất thiết thay đổi PIN đang lưu. Hãy dùng quy trình quản trị tài khoản phù hợp; không tự xóa database có dữ liệu quan trọng.

## 3. Chủ tiệm — Owner Web

Đến `http://127.0.0.1:5174`, nhập **PIN chủ tiệm** rồi chọn **Đăng nhập**. Menu gồm: **Tổng quan / Sản lượng / Đơn hàng / Tài chính / Sản phẩm / Nhân viên**. Trang Owner có nút **Tải lại**, nút **Đăng xuất** và thanh điều hướng mobile.

### 3.1. Sản phẩm: thêm, sửa, bật/tắt

1. Mở **Sản phẩm** → **+ Thêm món**.
2. Nhập **Tên món**, **Nhóm/loại**, **Giá bán (VNĐ)** và trạng thái **Đang bán**.
3. Lưu, sau đó xác minh món và giá xuất hiện ở menu. Khi sửa món đang bán: chọn **Sửa**, cập nhật tên/giá/trạng thái và lưu.
4. Món tắt bán không được hiện như một món mới để Staff chọn. Đơn đã lưu giữ **giá snapshot** tại thời điểm tạo, không bị thay đổi bởi giá mới.

Tại **Owner Cloud từ xa**, thay đổi sản phẩm đã có là *đề xuất sửa giá* và có trạng thái **pending/applied/conflict**. Giá **chưa có hiệu lực** cho đến khi Hub tại tiệm xác nhận. Thêm món mới và các thay đổi nhân viên chỉ làm từ Owner nội bộ.

### 3.2. Nhân viên và điện thoại

Mở **Nhân viên**. Trong **Tài khoản tại tiệm**, kiểm tra vai trò, trạng thái; có thể **Khóa / Mở lại** tài khoản thích hợp. Để tạo người dùng mới, nhập **mã nhân viên**, **tên**, chọn vai trò **Nhận đơn** hoặc **Thu ngân**, đặt PIN và bấm **Tạo tài khoản**.

Trong **Thiết bị nhân viên**, nhập tên điện thoại → **Tạo mã ghép**. Mã 16 ký tự dùng một lần, có thời hạn **3 phút**. Cung cấp mã trực tiếp cho đúng nhân viên đang ở quầy; nhập trong Mobile lúc đăng nhập. Mất máy hoặc nghỉ việc: dùng **Thu hồi** thiết bị, đồng thời khóa tài khoản nếu cần. Test đăng nhập lại thiết bị đã thu hồi phải thất bại.

### 3.3. Tổng quan, sản lượng và đơn hàng

- **Tổng quan:** xem thống kê tổng số đơn trong ngày, đơn đã thu, doanh thu và các KPI tách biệt. Không có giới hạn cứng 300 đơn/ngày.
- **Sản lượng:** xem tổng số bánh bán theo từng món và nhóm; chọn **Ngày / Tuần / Tháng / Quý / Năm**, chọn ngày tham chiếu, hoặc **Về hôm nay**. Nút **Làm mới báo cáo** lấy lại dữ liệu; URL bộ lọc có thể dùng để xem lại cùng kỳ.
- **Đơn hàng:** xem các đơn đã ghi nhận, tìm/duyệt lịch sử theo quyền. Đừng nhầm số **đơn** và số **ổ bánh**: một đơn có thể chứa nhiều bánh.
- **Tài chính:** xem sổ quỹ, thống kê CASH/BANK và các **giao dịch ngoại lệ**. Khi Cloud mất kết nối, dữ liệu Owner Cloud có thể trễ; lấy dữ liệu tại Hub làm chuẩn để đối soát.

## 4. Nhân viên — Staff Mobile (Android/iOS)

### 4.1. Cài và kết nối

Trong `apps/mobile-staff/.env`, cấu hình `EXPO_PUBLIC_HUB_URL` tới Hub thử nghiệm có thể truy cập được từ điện thoại. Bản release yêu cầu **HTTPS với chứng chỉ được máy tin cậy**; HTTP chỉ được bật bằng `EXPO_PUBLIC_ALLOW_INSECURE_DEV=1` trong môi trường development nội bộ cách ly. Không cấu hình HTTP/dev bypass cho giao dịch thật.

Mở ứng dụng → nhập **Mã nhân viên**, **Mã PIN nhân viên** và **Mã ghép thiết bị** (lần đầu hoặc sau thu hồi) → **Đăng nhập**. Nếu hiện **Thiếu địa chỉ máy POS** hoặc **Cần HTTPS**, nhờ người phụ trách kỹ thuật sửa địa chỉ và chứng chỉ, không nhập địa chỉ ngẫu nhiên.

### 4.2. Nhận và lưu một đơn

1. Tại **Nhận đơn mới**, tìm món bằng **Tìm tên món…**.
2. Dùng nút **+ / −** để chọn số lượng. Kiểm tra tổng tiền tạm tính.
3. Bấm **Xem đơn →**. Nhập **Ghi chú cho món** (ví dụ “không hành”) và **Ghi chú cho đơn** (ví dụ “khách lấy sau”) nếu cần.
4. Chọn **Tiền mặt** hoặc **Chuyển khoản ngân hàng**: đây **chỉ là ý định của khách**.
5. Bấm **LƯU ĐƠN** đúng **một lần**, xem màn hình **ĐÃ GHI NHẬN VÀO POS**, ghi nhớ mã `#...`. Báo mã đơn cho quầy bên trong. Sau đó bấm **Tạo đơn tiếp**.

Nếu hiện **Giá món đã thay đổi**, kiểm tra lại giá và tổng rồi xác nhận **Đã xem giá mới** trước khi lưu.

### 4.3. Khi mất mạng / bấm lưu nhưng không biết thành công

Nếu ứng dụng hiển thị **Đơn đang chờ xác nhận** hoặc **Chưa biết Store Hub đã nhận...**:

- **Không tạo đơn mới** và không thay đổi món hoặc số lượng để “thử lại”.
- Khi kết nối ổn, bấm **Kiểm tra lại đơn với POS**. App gửi lại đúng payload và mã chống trùng đã lưu.
- Nếu app khởi động lại, đăng nhập đúng **nhân viên cũ** rồi xử lý màn hình khôi phục đơn.
- Nếu điện thoại bị lỗi dữ liệu hoặc không xử lý được, nhờ thu ngân kiểm tra mã trong POS trước khi nhập lại bằng tay.

Bấm **Đơn của tôi** để xem đơn gần đây và tình trạng **Chưa thu tiền / Đã thu tiền / Đã hủy / Đã hoàn tiền**. **Thoát** để đăng xuất sau ca.

## 5. Thu ngân — POS Web

Đến `http://127.0.0.1:5173` trên máy thu ngân, nhập **Mã PIN thu ngân** → **Đăng nhập**. Thanh trên cho biết **Store Hub / Mất kết nối** và **Ca: Đang mở / Chưa mở**.

### 5.1. Đầu ca

Chọn **Sổ quỹ & chốt ca** → **Mở ca**, nhập **Tiền lẻ chủ bàn giao (VNĐ)** đúng số tiền đếm được → xác nhận mở ca. Không đưa số tiền BANK vào két tiền mặt. Đối soát tồn đầu ca và nhận bàn giao bằng quy trình tại tiệm.

### 5.2. Tìm đơn và thu CASH

1. Chọn **Đơn hàng**; bộ lọc **Chờ thu / Đã thu / Tất cả**, ô **Tìm mã đơn hoặc nhân viên**.
2. Bấm đơn có mã đúng; đối chiếu món, số lượng, ghi chú và số tiền phải thu.
3. Chọn **Tiền mặt**. Nhập **Khách đưa (VNĐ)** hoặc chọn mệnh giá gợi ý; kiểm tra **TIỀN THỐI / CÒN THIẾU**.
4. Sau khi **đã nhận đủ tiền mặt**, bấm **Xác nhận đã nhận tiền** một lần. Xem trạng thái đã thanh toán và hai receipt intents **liên khách / liên tiệm**.
5. Giao đúng tiền thối; đối chiếu giấy in. **Không nhấn thu tiền lần nữa** khi phản hồi chậm.

Nếu xuất hiện **Thu tiền mặt cần xác minh**, ứng dụng có thể đã gửi yêu cầu nhưng chưa nhận ACK. Giữ nguyên đơn và số tiền; chọn **Gửi lại đúng yêu cầu cũ để xác minh** khi Hub online. Đây là retry chống trùng, không phải thu lần hai. Không xóa dữ liệu phục hồi trình duyệt khi chưa đối chiếu.

### 5.3. BANK / QR

Chọn **Chuyển khoản** để xem yêu cầu chuyển khoản/QR **nếu backend đã được cấu hình đủ điều kiện**. Nếu đang chờ thì giữ trạng thái **Chưa thu tiền / Chờ ngân hàng**. **Không** tự xác nhận PAID dựa vào ảnh, thông báo khách hoặc việc QR đã hiển thị. Chỉ áp dụng settle BANK sau luồng merchant/provider được tích hợp, xác thực và nghiệm thu. Nếu hệ thống chưa có cấu hình BANK chính thức, hãy test bằng CASH giả lập.

### 5.4. Máy in — hai liên và UNKNOWN

Mỗi CASH capture có **liên khách (CUSTOMER)** và **liên tiệm (STORE)**. Trạng thái:

| Trạng thái | Cần làm |
| --- | --- |
| `WAITING_FOR_PRINTER` | Chưa thể gửi; kiểm tra cấu hình, giấy, IP/port, kết nối |
| `SENT` | Dữ liệu đã chuyển qua TCP; **chưa chứng minh giấy đã in thật** |
| `UNKNOWN` | Không xác định giấy đã ra hay chưa; **không tự in lại** |

Khi có cảnh báo `UNKNOWN`, kiểm tra cuộn giấy, khay ra giấy và xem đã có **liên khách / liên tiệm** nào. Sau khi xác định thiếu, thu ngân mới dùng **in lại** với lý do. Bản in lại có nhãn **BẢN IN LẠI**. Không thu CASH lại để in lại và không tự in lặp liên `UNKNOWN`.

### 5.5. Thu/chi và cuối ca

Trong **Sổ quỹ & chốt ca**, xem tiền đầu ca, thu/chi, số dư dự kiến. Với phát sinh thu/chi dùng ô **Số tiền (VNĐ)** và **Lý do** có thể kiểm toán; ghi đúng nghiệp vụ thực tế.

Cuối ca: đếm tiền trong két → nhập **Tiền thực đếm (VNĐ)**, nhập **Giải trình (bắt buộc nếu lệch)** nếu khác số dự kiến → **Xác nhận chốt ca**. Không đưa tổng doanh thu chuyển khoản vào tồn két. Lưu biên bản và đối chiếu tiền thật với sổ quỹ.

## 6. Owner Web từ xa (Cloud) — khác Owner tại tiệm

Để dùng Cloud, phải có Cloud API public HTTPS, PostgreSQL và liên kết sync được cấu hình an toàn theo `docs/ops/CLOUD_SYNC_RUNBOOK.md`. Owner Web remote dùng biến build `VITE_CLOUD_API_URL=https://...`.

- Đăng nhập bằng **mật khẩu Cloud Owner**, không phải PIN cục bộ.
- Đọc tổng quan, sản lượng, đơn hàng, tài chính và các ngoại lệ với **độ trễ đồng bộ**; không tự coi Cloud là sổ tiền gốc.
- Sửa **giá sản phẩm đang có** được gửi thành lệnh chờ Hub thực thi; theo dõi `pending/applied/conflict`; không mặc định giá mới đã có hiệu lực.
- **Không** tạo nhân viên, ghép điện thoại, thu CASH, in hóa đơn hay tạo món mới qua giao diện từ xa.

Nếu Cloud offline, tiệm tiếp tục xử lý CASH qua Hub nội bộ. Không yêu cầu nhân viên mở public Cloud URL thay cho Hub local.

## 7. Quy tắc quan trọng cho mọi vai trò

- **Tính tiền:** số tiền hiển thị từ Staff để tham khảo; Hub quyết định giá snapshot và tổng theo số lượng.
- **Đơn chưa rõ ACK:** không lập đơn thay thế ngay; tra cứu/retry bằng cùng key.
- **Không cố định 300 đơn:** theo dõi sản lượng thực tế ngày/tuần/tháng/quý/năm để điều chỉnh kế hoạch làm bánh.
- **Mất Cloud ≠ mất cửa hàng:** tiếp tục bán CASH khi Hub/LAN còn hoạt động.
- **Mất Hub/LAN:** Staff không tự giả xác nhận đơn đã lưu; phải xác minh POS khi Hub phục hồi.
- **Thiết bị nhân viên mất:** chủ thu hồi thiết bị và khóa tài khoản.
- **Mật khẩu/PIN:** cấp riêng, không chia sẻ hoặc chụp màn hình.
- **Không đưa thông tin cá nhân nhạy cảm vào ghi chú order**.

## 8. Checklist manual test theo vai trò

- [ ] Owner đăng nhập, tạo 2 món, đổi giá, ẩn một món; menu Staff cập nhật đúng.
- [ ] Owner tạo tài khoản Staff, tạo mã ghép và login mobile thành công.
- [ ] Staff tạo một đơn gồm ≥2 món, ghi chú từng món, ghi chú chung, chọn CASH; ghi mã đơn.
- [ ] POS thấy đơn, mở ca, thu CASH bằng số tiền lớn hơn tổng và tính tiền thối đúng.
- [ ] POS có 2 receipt intents; bản in thật chỉ xác minh khi nối máy in thật.
- [ ] Owner xem 1 đơn, đúng tổng **số bánh**, doanh thu CASH và sản lượng theo món.
- [ ] Staff tạo BANK intent; POS vẫn hiển thị chưa thanh toán nếu chưa có xác nhận provider.
- [ ] Mất ACK / restart app: phục hồi cùng yêu cầu, không sinh bản sao order/payment.
- [ ] Owner thu hồi điện thoại; mobile đã bị thu hồi không đăng nhập được.
- [ ] Đếm tiền và chốt ca; xử lý chênh lệch có giải trình.
- [ ] Chạy test kiểm tra backup/restore trên **dữ liệu giả**, không thay thế live POS.

## 9. Vai trò và quyền

| Hoạt động | Staff | Cashier | Owner nội bộ | Owner Cloud |
| --- | --- | --- | --- | --- |
| Chọn món và lưu đơn | Có | Theo chức năng POS | Quản trị | Không |
| Chọn khách dự định CASH/BANK | Có | Có thể xử lý khi thu | Xem báo cáo | Xem báo cáo |
| Xác nhận CASH | Không | Có | Theo quyền backend | Không |
| In lại / xử lý lỗi in | Không | Có (cần lý do) | Giám sát | Không |
| Mở/chốt ca, thu/chi | Không | Có | Xem/giám sát | Chỉ báo cáo |
| Thêm/sửa sản phẩm | Không | Không | Có | Sửa sản phẩm có sẵn bằng lệnh chờ |
| Quản lý Staff và ghép thiết bị | Không | Không | Có | Không |

## 10. Khắc phục sự cố thường gặp

| Triệu chứng | Kiểm tra và hành động |
| --- | --- |
| POS báo **Mất kết nối** | Hub có chạy? URL/port 4400 có đúng? Tường lửa và chứng chỉ? Không thu lặp khi request không rõ ACK |
| Mobile thiếu địa chỉ POS | Kiểm tra `EXPO_PUBLIC_HUB_URL` và rebuild/khởi động lại app |
| Mobile yêu cầu HTTPS | Cài TLS chứng chỉ tin cậy; dev HTTP chỉ trên Wi-Fi thử nghiệm cách ly |
| Ghép điện thoại thất bại | Mã ghép đã hết 3 phút? Tài khoản đúng? Thiết bị đã bị thu hồi? |
| Món không thấy trên Staff | Món có bật bán? Menu đã tải lại? Có thay đổi giá Cloud còn chờ Hub? |
| Đơn lưu treo / không chắc | **Kiểm tra lại đơn với POS** trên Mobile; không tạo mới cùng đơn |
| CASH phản hồi không rõ | Giữ nguyên thông tin; dùng **Gửi lại đúng yêu cầu cũ để xác minh** |
| QR BANK chưa hiện | Chưa cấu hình merchant/bank; không giả xác nhận PAID |
| In không ra giấy | Cấu hình `PRINTER_HOST`/`PRINTER_PORT`? Máy in online? Giấy? `UNKNOWN` phải kiểm tra giấy trước khi in lại |
| Owner Cloud chậm cập nhật | Hub outbound sync, mạng WAN, PostgreSQL/Cloud có online? Cloud có thể trễ |
| Báo cáo không khớp | So ngày giờ Việt Nam, bộ lọc kỳ, đơn VOIDED/REFUNDED và phân biệt đơn với số lượng bánh |
| Không đăng nhập sau đổi PIN `.env` | Bootstrap chỉ tạo user lần đầu; cần quy trình quản lý tài khoản, đừng xóa DB tùy tiện |

## 11. Kết thúc mỗi buổi test

Ghi **thiết bị / hệ điều hành / tài khoản vai trò / bước thao tác / kết quả mong đợi / kết quả thực tế / mã đơn giả / ảnh màn hình đã che dữ liệu nhạy cảm**. Với lỗi thu tiền hoặc đơn trùng, dừng tạo giao dịch mới, giữ dữ liệu pending và gửi log đã loại bí mật để kiểm tra.

Sau khi 3 nhóm **chức năng → thiết bị → mất mạng/khôi phục** đều đạt, chủ tiệm và người phụ trách vận hành mới ký nghiệm thu. Bài CI tự động không thay cho in giấy, liên kết ngân hàng thật hoặc thử trên Windows/Android/iOS thực tế.
