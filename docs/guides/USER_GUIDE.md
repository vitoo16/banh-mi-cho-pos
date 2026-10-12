# BÁNH MÌ CHỢ POS — HƯỚNG DẪN SỬ DỤNG WEB & MOBILE
> **Bản dành cho chủ tiệm, thu ngân và nhân viên nhận đơn.** Phù hợp manual test/pilot bằng đơn giả. Cập nhật theo source code trên `main` tháng 10/2026. Không phải xác nhận triển khai production.

## 0. Đọc nhanh trước khi thao tác

Bánh Mì Chợ gồm **3 giao diện** và **2 backend**:

| Thành phần | Ai dùng? | Để làm gì? | Chạy ở đâu? |
|---|---|---|---|
| **Owner Web** (`apps/web-owner`) | Chủ tiệm | Menu/giá, nhân viên/thiết bị, tổng đơn, sản lượng, tài chính | Web tại quầy, hoặc Owner remote khi Cloud đã cấu hình |
| **POS Web** (`apps/web-pos`) | Thu ngân | Nhận đơn, thu CASH, quản lý ca/két, biên nhận | Trình duyệt trên máy quầy |
| **Staff Mobile** (`apps/mobile-staff`) | Nhân viên nhận đơn | Chọn món, số lượng, ghi chú, gửi đơn, xem đơn đã tạo | Android/iOS (Expo development build trong pilot) |
| **Store Hub** (`apps/store-hub`) | Hệ thống | **Nguồn dữ liệu chính** cho đơn, tiền, trạng thái in; SQLite | Máy POS Windows trong LAN |
| **Cloud API** (`apps/cloud-api`) | Hệ thống/Owner remote | Mirror PostgreSQL, báo cáo từ xa, hàng đợi lệnh cập nhật menu | Tùy chọn; staging chưa xác nhận đã deploy |

**Ba nguyên tắc cần thuộc lòng:**
1. Nhân viên chọn CASH/BANK chỉ là **khách dự định trả bằng cách đó**. **Không có nghĩa đã thanh toán**.
2. **Chỉ thu ngân/hệ thống ngân hàng đã được xác minh** mới ghi nhận thanh toán. Không xác nhận chuyển khoản từ ảnh chụp màn hình.
3. Khi mạng bị gián đoạn, **không tự tạo lại đơn hoặc thu tiền lần hai**. Dùng chức năng **Kiểm tra lại** để gửi lại **cùng yêu cầu và mã chống trùng**.

**Phạm vi pilot:** Dùng PIN thử nghiệm riêng, món/giá mẫu, tiền giả, Wi-Fi test. Chưa nghiệm thu ngân hàng merchant, máy in thật, bảo mật LAN, 8 điện thoại thật hoặc mất điện Windows.

## 1. Tài khoản và đường dẫn

| Vai trò | Mở gì | Cách đăng nhập |
|---|---|---|
| Chủ tại tiệm | `http://127.0.0.1:5174` trên máy đang chạy Vite | **Mã PIN chủ tiệm**, do người dựng Store Hub cấu hình |
| Thu ngân | `http://127.0.0.1:5173` trên máy đang chạy Vite | **Mã PIN thu ngân**; không cần nhập mã nhân viên trên màn hình này |
| Nhân viên | Ứng dụng BMC Staff trên điện thoại | **Mã nhân viên** + **Mã PIN**; khi ghép lần đầu thêm **Mã ghép thiết bị** |
| Chủ từ xa | URL Owner Web do người triển khai cung cấp, khi `VITE_CLOUD_API_URL` đã thiết lập | **Mật khẩu quản trị từ xa**, khác PIN nội bộ |

`127.0.0.1` là **máy đang mở trình duyệt**, không phải IP để nhập trên điện thoại. Nếu chưa được gửi URL/hướng dẫn ghép nối LAN, báo người kỹ thuật thay vì tự bật server công khai.

Các tài khoản bootstrap mặc định có ID `owner`, `cashier`, `staff`, còn PIN/mật khẩu **không có giá trị mặc định để dùng thật**. Chủ tiệm nên cấp tài khoản riêng cho từng nhân viên. Mã ghép thiết bị có hạn khoảng **3 phút** và mỗi thiết bị được cấp riêng.

## 2. HƯỚNG DẪN CHỦ TIỆM — OWNER WEB

### 2.1. Đăng nhập, điều hướng

1. Trên máy tại tiệm mở Owner Web; nhập PIN được cấp; bấm **Đăng nhập**.
2. Menu gồm **Tổng quan / Sản lượng / Đơn hàng / Tài chính / Sản phẩm / Nhân viên**. Trên điện thoại/trình duyệt hẹp có thanh điều hướng dưới.
3. Nhấn nút **Tải lại** ở đầu trang khi cần; dữ liệu liên quan được làm mới, không nhất thiết toàn trang.
4. **Đăng xuất** khi rời thiết bị.

Nếu thấy thông báo **Cloud có thể trễ**: đây là chế độ từ xa, dữ liệu chỉ phản ánh các sự kiện đã được Store Hub đồng bộ. Dữ liệu tại quầy vẫn là nguồn chính.

### 2.2. Sản phẩm — tạo, đổi giá, ẩn món

1. Chọn **Sản phẩm** → **+ Thêm món**.
2. Nhập **Tên món**, **Nhóm món**, **Giá bán (VNĐ)** và chọn **Đang bán** nếu muốn hiện trên điện thoại nhân viên.
3. Nhấn **Lưu sản phẩm**. Giá là **số nguyên VNĐ**, không nhập dấu phân cách thập phân.
4. Để sửa, chọn **Sửa** cạnh món rồi thay đổi tên/giá/trạng thái. **Đã ẩn** sẽ không xuất hiện trong menu nhân viên.
5. **Đơn đã tạo giữ giá snapshot cũ**; đổi giá không sửa doanh thu của đơn cũ.

**Owner từ xa:** tạo/sửa món sinh **yêu cầu gửi về Hub**. Theo dõi **Đang chờ POS / POS đã áp dụng / Xung đột giá**. Khi chưa được Hub áp dụng, không thông báo cho nhân viên rằng giá đã có hiệu lực. Nếu đang có yêu cầu chưa xác nhận sau reload, làm theo hướng dẫn **gửi lại đúng yêu cầu cũ**, không nhập lại để tạo trùng.

### 2.3. Tổng quan — xem tình hình ngày hôm nay

- Chọn **Tổng quan** xem KPI tổng số đơn trong ngày, doanh thu theo các giao dịch đã xác nhận, tiền mặt và chỉ số liên quan.
- Số lượng đơn **không cố định 300**: màn hình thống kê dựa trên dữ liệu thực; danh sách dài hỗ trợ xem tiếp.
- Khi qua 00:00 theo giờ Việt Nam, số liệu “hôm nay” đổi theo ngày cửa hàng. Không lấy con số Cloud stale làm nguồn đối soát két tiền.

### 2.4. Sản lượng — loại bánh bán theo kỳ

1. Chọn **Sản lượng**.
2. Chọn **Ngày / Tuần / Tháng / Quý / Năm**.
3. Chọn **ngày tham chiếu** hoặc bấm **Về hôm nay**.
4. Đọc **Đơn tạo trong kỳ**, **Số bánh đã bán**, **Đơn đã thu** và danh sách **Theo nhóm bánh / Chi tiết từng loại bánh**.
5. Bấm **Làm mới báo cáo** để lấy lại dữ liệu.

**Cách hiểu số liệu:** “Số bánh đã bán” là số lượng trong các đơn **đã thu đủ**, phân kỳ theo **ngày tạo đơn (UTC+7)**; không phải số bánh tồn kho hay kế hoạch sản xuất cố định. Đơn chưa thu, hủy, hoàn toàn bộ không nằm trong số bánh bán được theo quy tắc báo cáo hiện tại. Khi so sánh báo cáo, nhớ thống nhất ngày/kỳ.

### 2.5. Đơn hàng — tra cứu

1. Chọn **Đơn hàng**; xem mã đơn, giờ tạo, người lập, tiền, trạng thái thanh toán và phương thức khách đã chọn.
2. Nhập **mã đơn** ở ô tìm kiếm.
3. Bấm **Xem thêm đơn cũ** để tải các trang tiếp theo. Tìm kiếm hiện tại chỉ tìm trong **những trang đã được tải**.
4. Nếu nghi một đơn gửi trùng sau lỗi mạng, **tra cứu ở đây hoặc POS** trước khi tạo lệnh khác.

### 2.6. Tài chính — sổ quỹ và ngoại lệ ngân hàng

- **Sổ quỹ hiện tại:** quỹ đầu ca và **tiền phải có** (dữ liệu từ Hub).
- **Đối soát ngân hàng:** số đơn chờ xác minh, ngoại lệ và cảnh báo thu trùng CASH/BANK.
- **Không có ngoại lệ** chỉ đáng tin nếu dữ liệu đã tải thành công. Thông báo **Không tải được giao dịch ngoại lệ** nghĩa là *chưa biết*, không phải không có lỗi.
- **Tiền khách định chuyển khoản không phải doanh thu BANK** cho đến khi có sự kiện ngân hàng hợp lệ.
- Nếu cảnh báo **CASH_AND_BANK_CAPTURE**, giữ nguyên chứng từ và liên hệ người phụ trách đối soát; không tự xóa đơn hoặc ghi thêm doanh thu.

### 2.7. Nhân viên và thiết bị

**Ở Owner nội bộ:**
1. Chọn **Nhân viên** → **Thêm nhân viên**. Nhập **Mã nhân viên**, **Tên hiển thị**, vai trò **Nhận đơn** hoặc **Thu ngân**, **PIN** từ 6 ký tự.
2. Bấm **Tạo tài khoản**. Mỗi nhân viên dùng riêng mã để truy vết đơn.
3. Trong danh sách tài khoản, chọn **Khóa / Mở lại** khi cần.
4. Ở **Thiết bị nhân viên**, nhập tên thiết bị dễ nhận biết → **Tạo mã ghép**; đưa mã đang còn hạn cho đúng nhân viên.
5. Nếu máy bị thất lạc/thay người, chọn **Thu hồi** và ghi lý do. Thiết bị đã thu hồi phải ghép lại.

**Ở Owner Cloud:** trang Nhân viên không cấp quyền thao tác quản lý tài khoản/thiết bị. Các thao tác này thực hiện tại Hub nội bộ.

## 3. HƯỚNG DẪN THU NGÂN — POS WEB

### 3.1. Đầu ca: kiểm tra và mở ca

1. Mở POS Web trên máy quầy, đăng nhập PIN thu ngân.
2. Kiểm tra **Store Hub** có kết nối và tình trạng máy in/Cloud ở phần cảnh báo.
3. Chọn **Sổ quỹ & chốt ca** → **Mở ca**.
4. **Đếm tiền lẻ được chủ bàn giao**, nhập **Tiền lẻ chủ bàn giao (VNĐ)**, bấm **Mở ca thu ngân**.
5. Nếu máy in chưa cấu hình, hai liên có thể ở **Đang chờ máy in**; không đánh dấu là đã in.

**Một ca có một thu ngân và một két**. Không tạo ca thứ hai tùy tiện để xử lý lỗi đăng nhập.

### 3.2. Nhận đơn và thu CASH

1. Chọn **Đơn hàng** → **Chờ thu**. Có thể tìm theo mã đơn hoặc nhân viên.
2. Chọn một đơn; kiểm tra mã, món, số lượng, ghi chú và **Tổng cần thu**.
3. Nếu khách đưa tiền mặt, chọn **Tiền mặt**.
4. Nhập **Khách đưa (VNĐ)** hoặc dùng nút mệnh giá nhanh.
5. Kiểm tra **TIỀN THỐI / CÒN THIẾU**. Nút xác nhận bị khóa nếu chưa mở ca hoặc tiền chưa đủ.
6. **Chỉ sau khi thực sự nhận tiền**, bấm **Xác nhận đã nhận tiền** *một lần* và kiểm tra trạng thái **Đã thu tiền**.
7. Hệ thống ghi tiền theo Hub, sau đó tạo **hai liên biên nhận** (khách/tiệm) cho cùng một lần thanh toán.

Ví dụ: đơn 70.000đ, khách đưa 100.000đ → tiền thối 30.000đ. Khi chốt ca, tiền thực thu vào két là 70.000đ, không phải 100.000đ.

**Nếu xuất hiện “Thu tiền mặt cần xác minh”:** KHÔNG nhận tiền lần nữa. Sau khi Hub hoạt động lại, dùng **Gửi lại đúng yêu cầu cũ để xác minh**. Nếu khác tài khoản hoặc mất bản ghi khôi phục, báo chủ kiểm tra ledger trước khi xử lý tiếp.

### 3.3. Khách muốn chuyển khoản

1. Chọn đơn → **Chuyển khoản**.
2. Chỉ khi bộ xác minh ngân hàng được cấu hình đúng, hệ thống mới cho tạo yêu cầu/mã tham chiếu; có thể hiển thị VietQR và thông tin nhận.
3. Hướng dẫn khách kiểm tra **tài khoản, số tiền, nội dung chuyển khoản**.
4. Đợi backend nhận **bằng chứng ngân hàng đã xác minh**. *Không* bấm xác nhận đã thu chỉ vì khách đưa ảnh chuyển tiền.
5. Nếu provider chưa được nghiệm thu, sử dụng dữ liệu giả và giữ đơn ở trạng thái **Chờ xác minh**; không thử giao dịch tiền thật.
6. Nếu đổi sang CASH, chỉ dùng **Thu tiền mặt thay thế** khi đã xác minh chưa thu trùng; trường hợp tiền đã chuyển nhưng đến muộn cần đối soát.

### 3.4. In 2 liên, máy in lỗi và in lại

- **Liên khách** và **Liên tiệm** được ghi nhận riêng.
- **Đang chờ máy in:** chưa gửi.
- **SENT / Đã gửi dữ liệu:** mới gửi lệnh qua TCP, **không chứng minh giấy đã in**.
- **UNKNOWN / Chưa rõ giấy đã ra:** kiểm tra giấy, đầu in, dao cắt, và cả hai liên trước.

Cách in lại: mở đúng đơn → **Hai liên biên nhận** → **Xem trạng thái in / Kiểm tra** → chọn **Yêu cầu in lại** trên đúng liên → nhập **lý do**. Biên nhận in lại có dấu **BẢN IN LẠI**. Không thu tiền hay tạo lại lô biên nhận chỉ để in lại.

### 3.5. Hủy, hoàn tiền và sửa két

- **Hủy đơn chưa thu tiền:** mở đơn còn chưa thu → **Hủy đơn chưa thu tiền**, nhập lý do và xác nhận.
- **Hoàn toàn bộ tiền mặt:** với đơn đã thu, cần ca phù hợp; chọn **Hoàn toàn bộ tiền mặt**, nhập lý do và xác nhận. Hệ thống sẽ ghi khoản hoàn và thay đổi sổ quỹ; không tự bù bằng sửa đơn cũ.
- **Sổ quỹ & chốt ca → Thu / chi két:** chọn **Bổ sung / Rút tiền / Chi tiền**, nhập số tiền cùng lý do, rồi **Ghi vào sổ quỹ**. Đây là thao tác có audit; không dùng để che sai lệch.

### 3.6. Chốt ca

1. Chọn **Sổ quỹ & chốt ca** → kiểm tra **Tiền đầu ca**, **Tiền phải có**.
2. **Đếm tiền mặt thực tế trong két** và nhập **Tiền thực đếm**.
3. Kiểm tra **Chênh lệch**. Nếu lệch, nhập **Giải trình** (bắt buộc).
4. Sau khi chủ/thu ngân kiểm chứng, bấm **Xác nhận chốt ca** rồi xác nhận hộp thoại.
5. Đối chiếu tổng tiền mặt, các khoản thu/chi, hoàn tiền, BANK đang chờ và các liên in UNKNOWN.

Không chốt ca khi đang có thanh toán CASH chưa xác minh mà chưa đối soát.

## 4. HƯỚNG DẪN NHÂN VIÊN — STAFF MOBILE

### 4.1. Cài, ghép thiết bị, đăng nhập

Ứng dụng dùng **Expo development build** trong pilot, không phải một app đã xác nhận phát hành trên App Store/Google Play.

1. Người kỹ thuật cung cấp bản build thử và cấu hình URL **HTTPS của Store Hub trong Wi-Fi tiệm**.
2. Chủ tiệm tạo tài khoản và cấp **Mã nhân viên + PIN**.
3. Chủ tiệm tạo **Mã ghép thiết bị** tại Owner nội bộ; nhập mã trên điện thoại ở lần ghép đầu (hoặc sau thu hồi).
4. Bấm **Đăng nhập**. Khi ghép thành công, thông tin định danh thiết bị được lưu trong vùng bảo mật hệ điều hành.
5. Không chụp/chia sẻ mã PIN hoặc mã ghép.

Mã nhân viên thường được gõ chữ thường (ví dụ `nv01`). Nếu thiết bị bị thu hồi, liên hệ chủ để ghép lại, không tự bỏ kiểm tra chứng chỉ TLS.

### 4.2. Lên đơn mới

1. Ở màn **Nhận đơn mới**, dùng **Tìm tên món…** nếu cần.
2. Chạm **+ / −** để điều chỉnh số lượng.
3. Kiểm tra tổng tạm tính phía dưới → **Xem đơn →**.
4. Trên **Kiểm tra đơn**, có thể sửa số lượng, **ghi chú cho từng món** hoặc **ghi chú cho cả đơn**.
5. Chọn **Tiền mặt** hoặc **Chuyển khoản ngân hàng** theo yêu cầu của khách. Đây chỉ là **phương thức dự kiến**.
6. Kiểm tra lại toàn bộ rồi bấm **LƯU ĐƠN** *một lần*.
7. Khi thấy **ĐÃ GHI NHẬN VÀO POS** cùng mã `#Bxxxxx`, thông báo mã đơn cho quầy/bên chuẩn bị bánh. Bấm **Tạo đơn tiếp** để nhận khách mới.

**Nhân viên không thu tiền trên ứng dụng Staff**, không đánh dấu PAID, không chỉnh giá/menu và không điều khiển máy in.

### 4.3. Xem đơn đã tạo

Bấm **Đơn của tôi** ở đầu màn hình để xem các đơn gần đây, tiền và trạng thái thanh toán do Hub ghi nhận. Khi dữ liệu chưa cập nhật, không tự suy ra khách đã trả tiền.

### 4.4. Lỗi khi gửi đơn / mất kết nối

- Khi hiện **Đơn đang chờ xác nhận** hoặc **Không chắc Store Hub đã nhận đơn hay chưa**, KHÔNG làm lại đơn mới.
- Điện thoại đã ghi payload cùng khóa chống trùng vào SQLite nội bộ trước khi gửi. Sau khi Wi-Fi/Hub trở lại, đăng nhập **đúng nhân viên ban đầu** và bấm **Kiểm tra lại đơn với POS**.
- Nếu thấy **Giá món đã thay đổi**, đọc giá mới; chỉ bấm **Đã xem giá mới** sau khi đồng ý, rồi tạo lệnh phù hợp.
- Nếu đổi tài khoản trên điện thoại còn đơn chưa xác nhận, hệ thống sẽ từ chối xử lý thay nhân viên cũ.
- Không xóa dữ liệu app hoặc gỡ ứng dụng khi đang có đơn UNKNOWN; kiểm tra với POS/Owner trước.

## 5. Khi gặp sự cố — hành động an toàn

| Hiện tượng | Làm ngay | Tuyệt đối tránh |
|---|---|---|
| Mobile không vào được Hub | Kiểm tra cùng Wi-Fi, IP/TLS, mã ghép và trạng thái Hub | Bật HTTP công khai, bỏ xác thực để chạy nhanh |
| Cloud mất kết nối nhưng Hub LAN vẫn hoạt động | Bán CASH qua Hub như bình thường; xem outbox chờ đồng bộ | Coi Cloud stale là số liệu thời gian thực |
| Hub LAN ngừng hoạt động | Dừng gửi đơn/thu tiền chưa xác minh; báo người quản trị | Cho 8 điện thoại tự cấp mã đơn độc lập |
| Staff báo “đơn đang gửi” | Nhấn **Kiểm tra lại đơn**, cùng ID + key | Tạo đơn mới bằng một key khác |
| POS báo “Thu tiền mặt cần xác minh” | Kiểm tra két, dùng **Gửi lại đúng yêu cầu cũ** | Nhận thêm tiền / xóa storage |
| Máy in `UNKNOWN` | Kiểm tra giấy rồi in lại đúng liên, có lý do | In hàng loạt, thu tiền lại |
| Chuyển khoản chờ xác minh | Giữ PENDING, đợi provider hoặc đối soát có chứng từ | Đánh dấu PAID bằng ảnh chụp |
| Owner Cloud hiện lệnh `PENDING` | Đợi Hub online và áp dụng, theo dõi `APPLIED` hoặc `CONFLICT` | Báo nhân viên đã đổi giá trước khi Hub xác nhận |
| Lệch tiền cuối ca | Đếm lại, xem hoàn tiền/thu chi, nhập giải trình | Sửa xóa các bản ghi đã thu |
| Backup/restore lỗi | Báo quản trị; giữ cả `.sqlite` và `.manifest.json` | Restore đè database đang chạy |

## 6. Checklist manual test theo vai trò

> Chỉ dùng **dữ liệu giả**, PIN riêng và máy dev/test; ghi lại kết quả PASS/FAIL, ảnh màn hình, giờ Việt Nam, mã đơn, phiên bản và thiết bị.

### Chủ tiệm
- [ ] Đăng nhập/đăng xuất nội bộ.
- [ ] Thêm món, sửa giá, ẩn/bật món; kiểm tra Staff nhận menu mới.
- [ ] Tạo nhân viên riêng, cấp mã ghép, thu hồi thiết bị.
- [ ] Xem Tổng quan: đơn ngày hôm nay thay đổi đúng khi có đơn mới.
- [ ] Xem Sản lượng: ngày/tuần/tháng/quý/năm và từng loại bánh.
- [ ] Xem Đơn hàng: tìm mã, **Xem thêm đơn cũ** khi nhiều đơn.
- [ ] Xem tài chính: CASH đã thu, BANK chưa xác minh, lỗi Cloud rõ ràng.

### Thu ngân
- [ ] Mở ca với tiền đầu ca có đếm thực tế.
- [ ] Thu CASH đơn 70.000đ với 100.000đ khách đưa → thối 30.000đ.
- [ ] Không thể thu CASH nếu thiếu tiền hoặc chưa mở ca.
- [ ] Hủy đơn chưa thu và kiểm tra không cộng doanh thu.
- [ ] Thu/chi két có lý do, hoàn tiền mặt toàn bộ đơn giả.
- [ ] Thử Hub mất phản hồi *sau commit*, xác minh không thu tiền lần hai.
- [ ] Thử printer `WAITING / UNKNOWN / SENT` và in lại đúng liên.
- [ ] Đếm tiền thực tế và chốt ca; có giải trình khi lệch.

### Nhân viên mobile
- [ ] Đăng nhập/ghép trên Android thật; nếu có iOS cũng thử.
- [ ] Thêm 1, 2 và nhiều món; sửa ghi chú; lưu đơn.
- [ ] Thử chọn CASH và BANK, xác nhận **không có trạng thái PAID** chỉ vì chọn.
- [ ] Đơn đã lưu có mã đúng, xuất hiện tại POS.
- [ ] Nhấn LƯU nhanh hai lần → không tạo trùng.
- [ ] Ngắt LAN sau khi bấm LƯU, vào recovery và gửi lại cùng key.
- [ ] Thử khóa nhân viên/thu hồi thiết bị rồi đăng nhập lại.
- [ ] Thử 4–8 máy gửi đơn cùng lúc và đối chiếu đủ mã đơn.

### Trước khi dùng tiền khách thật
- [ ] TLS, firewall, pairing, quyền và máy Windows đã nghiệm thu.
- [ ] Máy in nhiệt 80mm + dao cắt + giấy + chữ Việt + két tiền đã thử.
- [ ] Ngân hàng merchant/sandbox, xác minh có đối soát, không dựa ảnh.
- [ ] Backup mã hóa, có lịch chạy, off-host, cảnh báo, restore, đo RPO/RTO.
- [ ] Mất Internet 30 phút, phục hồi LAN/Cloud, kiểm tra outbox.
- [ ] Chủ tiệm ký kết quả chạy thử/đối soát; không dùng CI PASS thay cho bước này.

---

**Tài liệu đi kèm**

- [Chạy monorepo trên máy dev / test](./MONOREPO_SETUP.md)
- [Kế hoạch deploy Cloud FREE cho staging](./FREE_STAGING_DEPLOY.md)
- [Pilot kỹ thuật](../ops/LOCAL_PILOT.md)
- [Runbook vận hành/khôi phục](../ops/RUNBOOK.md)
- [Danh sách nghiệm thu trước production](../qa/ACCEPTANCE.md)
