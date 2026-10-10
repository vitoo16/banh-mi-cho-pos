# BÁNH MÌ CHỢ POS — MVP SPEC v1.2 (SIMPLIFIED / PAYMENT-METHOD-AWARE)

**Ngày cập nhật:** 10/10/2026  
**Trạng thái:** Đặc tả baseline để phân rã backlog và làm POC; chưa triển khai hoặc kiểm thử production.  
**Thay thế:** `Banh_Mi_Cho_POS_MVP_v1.1_Simplified_Spec.md` trong phạm vi MVP (và qua đó thay thế v1.0). V1.1/v1.0 là các bản lịch sử khi có xung đột.

## 0. Bối cảnh và quyết định bắt buộc

- **1 cửa hàng**, **4–8 nhân viên nhận đơn đồng thời**, **1 thu ngân phụ trách 1 két tiền**, **trên 300 đơn/ngày**.
- **Chưa có máy POS**; đã có **tài khoản ngân hàng hộ kinh doanh/doanh nghiệp** nhận chuyển khoản.
- Nhân viên đặt món đứng **cách khu chuẩn bị khoảng 1 mét**, **báo miệng cho người làm** như quy trình hiện tại. Không số hóa giao nhận tác vụ bếp.
- App nhân viên chỉ cần **tên món + giá bán**, chọn số lượng, **ghi chú khi cần** và **phương thức thanh toán khách dự định dùng** trước khi lưu đơn; không cho nhân viên sửa giá niêm yết hoặc cấu hình store.
- **Không quản lý số lượng tồn kho / số bánh còn lại trong MVP.** Người nhận đơn nhìn thực tế để quyết định còn bán hay không. Không chặn bán vì tồn kho phần mềm.
- **Không in phiếu chế biến**, **không KDS**, **không tách đơn gửi từng khu**, **không trạng thái từng món đang làm/đã xong**, **không xác nhận đã lấy/giao món bắt buộc**.
- **Một máy in duy nhất ở POS thu ngân** in **hai liên trên một lần thanh toán thành công**: (1) liên khách, (2) liên tiệm. Đây là hai bản biên nhận của *cùng một đơn*, **không phải hai phiếu đối soát giữa các khu**.
- Vẫn giữ yêu cầu cốt lõi: tạo đơn nhanh, tính đúng giá/tiền thối, phân biệt cash/bank/MoMo, chi tiết tiền vào ra két, chốt ca, danh sách đơn và báo cáo chủ.
- **Không tự động tính “lợi nhuận thực tế”** khi chưa thu thập dữ liệu giá vốn, chi phí và hàng hủy; MVP báo cáo doanh thu, dòng tiền, lợi nhuận chỉ khi bổ sung dữ liệu đáng tin cậy.

### 0.1 Delta riêng của v1.2 (so với v1.1)

- **BỔ SUNG:** một bước chọn **phương thức thanh toán dự kiến** ngay trong giỏ hàng / màn hình xác nhận đơn trên Staff App: `TIỀN MẶT` (mặc định), `CHUYỂN KHOẢN NGÂN HÀNG`, `MOMO` (chỉ hiển thị khi cấu hình merchant được bật), và `KẾT HỢP` (trong luồng nâng cao nếu cửa hàng bật).
- Staff App chỉ **ghi lựa chọn thanh toán mong muốn**, không được đánh dấu đơn `PAID`, nhập số tiền khách đưa hoặc xác nhận tiền đã vào ngân hàng. Điều này do **thu ngân/nguồn thanh toán đã xác minh** thực hiện.
- Khi nhân viên lưu đơn, POS nhận đồng thời tên món, tổng tiền, ghi chú và **phương thức thanh toán dự kiến**; mặc định mở đúng chế độ thu tiền tương ứng để giảm thao tác.
- **Thu ngân có quyền đổi phương thức thanh toán thực tế** trước hoặc trong giao dịch. Nếu đã có một khoản thanh toán được ghi nhận, phần còn lại phải theo logic split/partial, không xóa/chuyển đổi tùy tiện khoản đã thu.
- **Phân biệt hai trường:** `requested_payment_method` (ý định khi nhận đơn) và `payment.method`/`payment_allocations` (nguồn tiền thực tế đã thu). Báo cáo theo phương thức thanh toán phải dựa trên nguồn thực tế, không dựa trên lựa chọn ban đầu.
- **Không thay đổi**: báo miệng cho khu làm, không quản lý tồn kho, chỉ một máy in đúng hai liên sau khi thanh toán đủ, thu ngân duy nhất chịu trách nhiệm két.

### 0.2 Phạm vi giữ nguyên từ v1.1

**LOẠI BỎ khỏi MVP:** `station_tasks`, `prep_station_id`, `stock_policy`, lô tồn kho, reservations, `quantity_ready`, `quantity_handed_over`, `fulfillment_status` chi tiết, in phiếu bếp, 2 kitchen printers, màn hình KDS, thông báo món xong, bắt buộc theo dõi giao món, validation tồn kho, bộ đếm hàng còn lại.

**GIỮ:** Catalog; sản phẩm/giá/version; note món/đơn; order header/lines; người tạo; cashier; payments; refunds; cash drawer + shift; cash movements; audit log; 2 liên bill; đối soát bank; owner dashboard; backend phân quyền; offline/retry; idempotency.

**TÙY CHỌN VỀ SAU:** Báo 'hết hàng' thủ công bằng một nút bật/tắt hiển thị catalog do chủ/thu ngân quản lý (không dựa trên số tồn); thống kê sản lượng bán theo món từ order items (không phải tồn kho); nhập chi phí, BOM nếu chủ muốn theo dõi lãi.

## 1. Workflow thực tế (không tạo thêm công đoạn cho nhân viên)

### 1.1 Nhận đơn bằng điện thoại

1. Nhân viên đăng nhập bằng tài khoản/PIN; tải danh mục tên món, giá, lựa chọn bổ sung có phụ thu nếu được chủ tạo, phiên bản catalog.
2. Nhấn món, `+/-` số lượng, thêm ghi chú theo món hoặc toàn đơn **nếu có yêu cầu đặc biệt**; app cập nhật tổng tiền ngay lập tức. **Chọn phương thức thanh toán:** `Tiền mặt` (được chọn sẵn), `Chuyển khoản`, `MoMo` (chỉ khi đã kích hoạt), hoặc `Kết hợp` (tính năng nâng cao nếu bật).
3. Nhấn **LƯU ĐƠN**; Store Hub cấp mã ngắn duy nhất trong ngày (ví dụ `B104`, không chỉ dựa vào đồng hồ máy client), lưu `created_by`, time, lines, snapshot prices/notes/total, **`requested_payment_method`**, trả ACK. Tránh bấm hai lần bằng idempotency key.
4. Sau khi app xác nhận đã lưu, nhân viên **báo miệng đơn cho khu chuẩn bị ngay cạnh** như hiện nay; **không in hay gửi digital ticket đến khu làm**. Điều này giúp tránh có bánh đã làm nhưng đơn chưa được lưu.
5. Nhân viên và thu ngân nhìn thấy **mã đơn, tổng tiền, phương thức thanh toán dự kiến và trạng thái thanh toán**. Nhân viên có thể nói mã đơn cho thu ngân/khách nếu cần phân biệt các đơn đến liên tục. Chọn phương thức không đồng nghĩa đã thanh toán.
6. Nếu khách đổi ý: chỉ được sửa trực tiếp trước khi có khoản thanh toán; sau đó phải có thao tác điều chỉnh/hủy/hoàn tiền được kiểm soát và lưu dấu vết.

**Không bắt buộc:** nhấn 'bắt đầu làm', 'lấy xong', 'đã giao', 'đã hoàn thành'. Tiệm tiếp tục điều phối bằng lời nói, bằng mắt và liên tiệm đã in.

### 1.2 Thu ngân & in hai liên

1. Thu ngân xem danh sách đơn mới ở POS (đơn mới lên đầu) hoặc tìm mã đơn/nhân viên/thời gian.
2. Kiểm tra tổng tiền và **phương thức thanh toán dự kiến do nhân viên chọn**. POS mở nhanh giao diện thu tiền tương ứng; thu ngân có thể sửa sang **Tiền mặt / Chuyển khoản / MoMo đã kích hoạt / Kết hợp** nếu khách đổi ý. Mọi thay đổi được audit. Phương thức cuối cùng của báo cáo lấy theo các khoản thực thu.
3. **Tiền mặt:** nhập số tiền khách đưa, tự tính `thối = khách đưa - số tiền mặt còn phải thu`; chỉ xác nhận nếu đủ. Ghi nhận được cả tiền khách đưa, tiền thối và net cash, gắn `cashier_id`, `cash_shift_id`, `order_id`.
4. **Chuyển khoản:** tạo QR theo đơn có số tiền và reference riêng; trạng thái **CHỜ XÁC NHẬN** cho đến khi nhận được giao dịch hợp lệ từ tích hợp được hỗ trợ. Không dựa vào ảnh chụp ứng dụng của khách.
5. Khi toàn bộ tiền đã được xác nhận, POS khởi tạo *một receipt print batch gồm hai bản*: **LIÊN KHÁCH** và **LIÊN TIỆM**, in liền nhau trên **cùng máy in**, có đánh dấu rõ loại liên và cắt giấy.
6. Biên nhận có mã đơn, ngày giờ, món, số lượng, giá, tổng tiền, phương thức trả và trạng thái đã thanh toán. Liên tiệm bổ sung tên nhân viên nhận đơn/thu ngân, số tiền khách đưa và tiền thối, ghi chú cần thiết. Ghi chú có thể được lọc trên liên khách nếu nội bộ.
7. Khi máy in lỗi, đánh dấu `FAILED/UNKNOWN` và cho thu ngân **in lại đúng liên bị thiếu**, in dấu `IN LẠI`; không sinh doanh thu hay thanh toán lần hai.
8. Nhân viên giao bánh theo thực tế. Không cần ghi event giao món trong MVP; báo cáo về đơn đã bán dựa trên đơn thanh toán hợp lệ, không dựa trên 'bếp hoàn thành'.

**Bất biến:** Không in biên nhận mang nhãn *ĐÃ THANH TOÁN* khi chuyển khoản vẫn pending; nếu cần in tạm để đối chiếu, phải là phiếu tạm không tính vào hai liên biên nhận chuẩn và không gắn nhãn đã thu tiền — mặc định không bật tính năng này.

### 1.3 Các ngoại lệ tối thiểu

| Sự kiện | Xử lý |
|---|---|
| Khách đổi món trước khi thanh toán | Edit order, lưu version/ai sửa, tổng mới; không in bill |
| Khách đổi món sau khi thu tiền | Yêu cầu chỉnh/hủy/hoàn tiền, audit; phát hành biên nhận điều chỉnh nếu cần |
| Không còn món dù catalog vẫn hiện | Nhân viên nhìn thực tế và không chọn; tùy chọn báo chủ ẩn món bằng tay |
| Khách chuyển thiếu | Partial/pending, hiện số còn phải thu, không xác nhận đủ |
| Khách chuyển dư | Ghi khoản dư cần giải quyết, không tự ghi thành doanh thu |
| Trùng webhook hoặc gửi lại lệnh | Idempotency, không nhân đôi tiền/đơn/bill |
| Mất Internet | LAN order + cash + print hoạt động; chuyển khoản chưa đối soát vẫn pending |
| Mất kết nối máy in | Lưu jobs, hiện lỗi, reprint có nhãn |
| POS khởi động lại | Khôi phục từ SQLite, không mất thanh toán đã commit; tiếp tục sync |

## 2. Các màn hình tối thiểu (MVP)

### 2.1 Staff App — 3 màn hình vận hành

- `STAFF-01 Login`: PIN/tài khoản, tên nhân viên, cảnh báo khi mất kết nối Store Hub.
- `STAFF-02 Chọn món`: chỉ hiển thị **tên món, giá, nút +/−**, phân nhóm/tìm nhanh nếu danh mục dài; không hiển thị tồn kho, công đoạn bếp, giá vốn, báo cáo doanh thu toàn tiệm.
- `STAFF-03 Giỏ + lưu`: số lượng, tổng tiền, ghi chú không bắt buộc, **nhóm nút chọn phương thức thanh toán** (Tiền mặt mặc định / Chuyển khoản / MoMo khi được bật / Kết hợp nâng cao), nút **LƯU ĐƠN** lớn; sau lưu hiển thị mã đơn, tổng, phương thức dự kiến, xem 10–20 đơn gần nhất do mình tạo và trạng thái thu tiền.

### 2.2 POS Cashier — 5 màn hình vận hành

- `POS-01 Live orders`: đơn chưa thu/chờ ngân hàng/đã thu; tìm mã đơn; hiển thị người tạo, tổng và **phương thức dự kiến**; có lọc nhanh Tiền mặt/Ngân hàng; không có tabs từng khu chế biến.
- `POS-02 Payment checkout`: hiển thị phương thức dự kiến, cho thu ngân **đổi phương thức thực thu**. Nhánh tiền mặt: tổng tiền, trường `Khách đưa`, số thối font lớn, xác nhận giao dịch một lần. Nhánh ngân hàng: điều hướng QR và chờ xác minh. Nhánh kết hợp: phân bổ số tiền theo nguồn, kiểm tra tổng đủ trước khi in.
- `POS-03 Bank QR`: QR có amount/reference duy nhất, pending/paid/exception; không đánh dấu trả thành công chỉ nhờ screenshot.
- `POS-04 Cash shift`: mở ca, quỹ đầu ca, tiền chủ thêm/rút, chi tiền mặt, nhật ký chuyển động quỹ.
- `POS-05 Close shift`: expected drawer, actual counted, difference, mệnh giá tùy chọn, biên bản và log người chốt.
- `POS-06 Receipt history` **trong giao diện đơn**, không cần màn hình riêng nếu UI gọn: số lần in, trạng thái từng liên, nút in lại theo quyền.

### 2.3 Owner Dashboard — 4 vùng quản lý

- `OWNER-01 Summary`: tổng số đơn đã thanh toán, doanh thu thuần, cash/bank/MoMo theo **nguồn tiền thực**, khoản chưa đối soát, giờ cập nhật gần nhất.
- `OWNER-02 Orders/Finance`: tìm/lọc đơn và chi tiết; thanh toán/hoàn tiền/hủy; sổ quỹ, số phải có vs thực đếm, lịch sử chênh lệch.
- `OWNER-03 Catalog/Pricing`: CRUD sản phẩm, nhóm, giá, ghi chú/tùy chọn, bật/tắt bán thủ công. **Không nhập số lượng tồn**.
- `OWNER-04 Accounts/Settings`: nhân viên, roles, ngân hàng nhận, cấu hình biên nhận/cửa hàng, kết nối máy in, audit log.

## 3. Ví dụ bill in 2 liên (cùng order)

```text
========= BÁNH MÌ CHỢ =========
             LIÊN KHÁCH
Mã đơn: B104       10/10/2026 18:45
--------------------------------
Bánh mì thịt nguội  x2     70.000
Bánh bao            x1     20.000
--------------------------------
TỔNG THANH TOÁN            90.000
Phương thức thực thu: TIỀN MẶT
Trạng thái: ĐÃ THANH TOÁN
            CẢM ƠN QUÝ KHÁCH
================================
```

```text
========= BÁNH MÌ CHỢ =========
             LIÊN TIỆM
Mã đơn: B104       10/10/2026 18:45
Nhân viên đặt: NV-03
Thu ngân: TN-01       Ca: CS-015
--------------------------------
Bánh mì thịt nguội  x2     70.000
  Ghi chú: 1 ổ không hành
Bánh bao            x1     20.000
--------------------------------
THÀNH TIỀN                 90.000
KHÁCH ĐƯA                 100.000
TIỀN THỐI                  10.000
TIỀN THU RÒNG              90.000
Mã thanh toán: PAY-...
================================
```

**Chỉ có 1 máy in tại quầy thu ngân.** Tiệm lưu cả hai biên nhận trong database; giấy liên tiệm là bản hỗ trợ đối chiếu thủ công, còn **đối soát tài chính sử dụng ledger**, không cộng doanh thu từ các tờ giấy.

## 4. Tiền mặt — yêu cầu chính xác

- Số tiền lưu dưới **số nguyên VNĐ**, không dùng float.
- Mỗi thanh toán tiền mặt: lưu `cash_tendered`, `cash_change_given`, `cash_net`, người thu, thời điểm, ca, mã đơn; hai movement `CASH_RECEIVED` và `CASH_CHANGE_PAID`, hoặc một settlement có hai legs bất biến.
- Một thu ngân chịu trách nhiệm một két theo ca. Chủ cấp tiền thối đầu ca, bổ sung/rút tiền đều tạo movement; không đưa tiền chuyển khoản vào két.
- `expected_closing_cash = opening_float + cash_received - cash_change - cash_refunds + cash_added - cash_withdrawn - cash_expenses` (tránh đếm hai lần cùng một movement).
- `variance = actual_counted - expected_closing_cash`; biên bản chốt ca bất biến, sửa sai bằng chứng từ điều chỉnh được phê duyệt.
- Với thanh toán nhiều phương thức, giá trị đơn chỉ được tính doanh thu **một lần**; không cộng tiền khách đưa trước thối vào doanh thu.

## 5. Ngân hàng & MoMo

- Tài khoản ngân hàng hộ kinh doanh/doanh nghiệp hiện có là tài khoản nhận mặc định. Nhà cung cấp đối soát (SePay/payOS hoặc giải pháp ngân hàng chính thức) chỉ chọn **sau khi xác nhận ngân hàng đang dùng và chính sách provider**.
- Tạo QR gắn `payment_intent_id`, `order_id`, `amount`, `reference` duy nhất; không dùng cùng nội dung chuyển khoản cho nhiều đơn.
- Cloud provider callback được xác thực chữ ký/token, chống replay/trùng ID, đối chiếu account + reference + amount + direction rồi mới ghi nhận.
- Khi client POS offline, số tiền chuyển khoản chưa được xác nhận phải hiển thị pending; xử lý tiền chờ bằng hàng đợi ngoại lệ rõ người phụ trách.
- MoMo merchant API/IPN nằm trong interface adapter để tích hợp sau khi được cấp điều kiện merchant. Tiền vào ngân hàng nhờ ứng dụng MoMo quét VietQR **vẫn là một giao dịch ngân hàng**, không cộng riêng thêm MoMo.

## 6. Thiết bị MVP mới (đã giảm đáng kể)

| Thiết bị | SL | Lưu ý |
|---|---:|---|
| Windows 11 touch POS hoặc mini-PC + màn hình cảm ứng | 1 | Xác minh CPU tương thích Win11, license, RAM 8GB+, SSD 256GB+ |
| Máy in nhiệt 80mm kết nối LAN/USB | **1** | In hai liên khách/tiệm trên cùng máy, tự cắt |
| Ngăn kéo tiền tương thích máy in | 1 | RJ11/RJ12 phải được test thực tế |
| Wi-Fi/router và UPS tối thiểu | 1 bộ | Ưu tiên POS nối LAN có dây, điện thoại nhân viên qua Wi-Fi |
| Điện thoại hiện có của nhân viên | 4–8 | Không bắt buộc mua điện thoại mới |
| Kitchen printer, KDS, máy quét mã vạch | **0** | Không mua cho MVP |

**Dự trù phần cứng để thảo luận:** khoảng **15–25 triệu VNĐ** nếu dùng các dải giá ước tính trước đó (POS ~10–16tr; printer ~1.25–1.8tr; drawer ~0.8–1.2tr; router/UPS/phụ kiện ~3–6tr), **không phải báo giá xác minh mới**, có thể tiết kiệm hơn nếu đã có Wi-Fi/UPS phù hợp. Chưa tính chi phí viết phần mềm và phí giao dịch/tích hợp.

## 7. Kiến trúc kỹ thuật (đủ bền nhưng trải nghiệm đơn giản)

```text
Nhân viên (4–8 điện thoại, chỉ nhận món/giá/ghi chú)
                       |
                   Wi-Fi LAN
                       |
             Windows POS + Store Hub
     Local API + SQLite + 1 Receipt Print Queue
              |                      |
          1 máy in               1 két tiền
         (2 liên)             (thu ngân duy nhất)
                       |
                   Sync outbox
                       |
            Cloud API + PostgreSQL
                 /             \
       Owner Dashboard     Bank QR/Webhooks
```

- **Store Hub** là điểm ghi chính cho đơn bán tại quầy và tiền mặt; `order_id` UUID, `display_code` ngắn, request có idempotency key, DB commit trước ACK.
- **Cloud** lưu bản sao đồng bộ và tiếp nhận xác minh tiền ngân hàng. Sync có `event_id` chống trùng, version + timestamp, không được ghi đè dữ liệu đã thanh toán chỉ vì kết nối phục hồi.
- **Receipt print job** tạo chỉ một lần cho lần thanh toán đủ, có hai `receipt_copy` riêng `CUSTOMER`/`STORE`, trạng thái và số lần in lại, không tạo payment mới khi retry.
- Nếu chọn React/PWA cho nhân viên, phải thử HTTPS LAN thực tế trên Android/iOS tại POC; nếu không đạt sẽ dùng client phù hợp mà vẫn giữ UI tối giản.
- POS là single local hub nên phải có tự khởi động lại ứng dụng/dịch vụ, backup, xác thực và kịch bản khôi phục khi máy bị hỏng. Không quảng cáo đây là HA.

## 8. Data model tối thiểu

- `stores(id, name, timezone, ...)`
- `users(id, store_id, role, pin_hash, active, ...)`
- `products(id, store_id, name, price_vnd, category_id, is_active, version, ...)` **không có stock_qty**
- `product_prices(id, product_id, effective_at, price_vnd, changed_by, ...)`
- `orders(id, store_id, display_code, created_by, created_at, status, total_vnd, requested_payment_method, idempotency_key, version, ...)`  — `requested_payment_method` là phương thức **dự kiến**, không phải trạng thái `PAID`.
- `order_items(id, order_id, product_id, name_snapshot, unit_price_snapshot_vnd, qty, note, line_total_vnd, ...)`
- `order_notes(order_id, note, ...)` (hoặc field notes trong orders)
- `payments(id, order_id, method, expected_vnd, captured_vnd, status, provider, ...)` — `method` phản ánh phương thức **thực thu**, có thể khác `orders.requested_payment_method`; cho phép nhiều payments trên một order để hỗ trợ kết hợp.
- `payment_intents(id, payment_id, reference, expires_at, status, ...)`
- `external_transactions(id, provider, external_transaction_id, bank_account_id, amount_vnd, signature_verified, ...)`
- `payment_allocations(id, payment_id, external_transaction_id, amount_vnd, state, ...)`
- `cash_drawers`, `cash_shifts`, `cash_movements`, `cash_counts`, `cash_count_denominations`
- `receipt_batches(id, order_id, paid_event_id, ...)`, `receipt_copies(id, batch_id, kind, print_status, retry_count, last_printed_at, ...)`
- `refunds`, `audit_events`, `sync_outbox`, `sync_cursors`

**Không tạo:** `stock_batches`, `stock_movements`, `station_tasks`, `kitchen_tickets`, `fulfillment_progress` trong MVP.

### 8.1 Trạng thái đơn và tiền

- Order: `DRAFT (chưa gửi) -> COMMITTED (đã ghi nhận) -> VOIDED (hủy có lý do)`; không cần status IN_PROGRESS/READY/HANDED_OVER.
- Payment: `UNPAID / PARTIALLY_PAID / PAID / PARTIALLY_REFUNDED / REFUNDED`; payment intent `PENDING / CONFIRMED / EXCEPTION / EXPIRED`.
- Receipt: `NOT_REQUESTED / QUEUED / PRINTED / FAILED / UNKNOWN`; từng liên lưu độc lập.
- Chỉ giao diện thu ngân có quyền ghi cash settled; chủ/manager có quyền sửa/duyệt ngoại lệ theo cấu hình. Nhân viên chỉ tạo đơn.

## 9. API tối thiểu (định hướng)

- `GET /v1/catalog`
- `POST /v1/orders` + `Idempotency-Key` — payload có `requested_payment_method`; backend kiểm tra các phương thức đang được bật tại cửa hàng.
- `GET /v1/orders?payment_status=...&cursor=...`
- `GET /v1/orders/:id`
- `PATCH /v1/orders/:id` (chỉ trước thanh toán; expected_version)
- `POST /v1/orders/:id/void-request`
- `PATCH /v1/orders/:id/requested-payment-method` (trước khi settle, theo RBAC, audit)
- `POST /v1/orders/:id/payments/cash`
- `POST /v1/orders/:id/payments/bank-intent`
- `GET /v1/orders/:id/payments`
- `GET /v1/orders/:id/receipt-copies`
- `POST /v1/receipt-copies/:id/reprint` (RBAC + audit)
- `POST /v1/cash-shifts/open`
- `POST /v1/cash-shifts/:id/movements`
- `GET /v1/cash-shifts/:id/expected`
- `POST /v1/cash-shifts/:id/close`
- `GET /v1/owner/dashboard`
- `GET /v1/owner/reconciliation-exceptions`

## 10. Tiêu chí nghiệm thu MVP

| ID | Kịch bản | Kết quả yêu cầu |
|---|---|---|
| ACC-01 | 8 nhân viên đồng thời tạo đơn, test 150 đơn/giờ | Đơn không mất/trùng, tổng tiền đúng (mục tiêu kiểm thử) |
| ACC-02 | Chọn món tên/giá/số lượng, note **và phương thức dự kiến** | Lưu chính xác; mặc định Tiền mặt; **không hỏi tồn kho** |
| ACC-02A | Nhân viên chọn Chuyển khoản, khách đổi sang Tiền mặt | POS cho thu ngân đổi; chỉ thu thực tế ghi Cash, không tạo thu Bank ảo |
| ACC-02B | Nhân viên chọn Tiền mặt nhưng chưa đến thu ngân | Đơn giữ `UNPAID`, không tự tăng két tiền hay in biên nhận đã thanh toán |
| ACC-02C | Nhân viên chọn MoMo khi merchant chưa kích hoạt | Không hiện lựa chọn MoMo; backend chặn giá trị unsupported |
| ACC-02D | Khách trả kết hợp tiền mặt + ngân hàng | Nếu tính năng được bật, chỉ in khi đủ; sổ quỹ chỉ nhận phần cash và bank ledger chỉ nhận phần bank |
| ACC-03 | Khách trả 100k cho 90k | Thu ngân được tính thối 10k; sổ quỹ net +90k |
| ACC-04 | Thanh toán đủ | **Một máy in** in đúng hai liên, khách + tiệm, mã đơn giống nhau |
| ACC-05 | Máy in mất giấy sau liên đầu | Cho in lại chỉ liên còn thiếu; không thu thêm tiền |
| ACC-06 | Đơn có nhiều loại món | Không tạo ticket bếp, không cần bấm trạng thái chế biến |
| ACC-07 | Hai webhook cùng giao dịch | Chỉ xác nhận một payment/không tăng doanh thu trùng |
| ACC-08 | Mất Internet, LAN còn | Nhân viên tạo đơn, POS thu cash và in bill; bank chưa được tự xác nhận |
| ACC-09 | Chủ cập nhật giá 35k->38k | Đơn cũ giữ giá snapshot; đơn mới áp dụng giá mới |
| ACC-10 | Chốt ca thực đếm lệch 20k | Chênh 20k; có biên bản giải trình; bank không cộng vào két |
| ACC-11 | Quầy bán 300+ đơn/ngày | Báo cáo thống kê theo món và số đơn đúng, không suy ra tồn kho còn lại |

## 11. Lộ trình triển khai

- **POC:** test máy POS Windows 11; máy in 80mm in hai liên có dấu tiếng Việt/cắt giấy; két; 4–8 điện thoại kết nối LAN; test fallback WAN; rà soát ngân hàng thực tế.
- **M1 Core:** tài khoản và RBAC; catalog tên món/giá; chọn qty/note/**phương thức thanh toán dự kiến**; create-order; live POS cashier queue có phương thức; không có stock/kitchen.
- **M2 Cash & Print:** thu ngân xem/chỉnh phương thức thực thu; payment cash, change, 2-copy receipt jobs, mở/chốt ca, movement ledger, in lại.
- **M3 Bank + Owner:** bank payment intent, QR, webhook đối soát, owner dashboard (orders/revenue/source/cash), audit; dashboard phân loại theo payment thực thu, không dùng requested method. Màn hình chọn Chuyển khoản trên Staff App ở M1 vẫn được lưu nhưng chỉ thanh toán qua ngân hàng khi M3 đã tích hợp.
- **M4 Release:** test giờ cao điểm, offline LAN, phục hồi, backup, UAT cùng nhân viên, quy định hóa đơn điện tử áp dụng.
- **Phase 2 chỉ khi có nhu cầu:** giá vốn, nhập nguyên liệu, chi phí, lợi nhuận, MoMo merchant API, thông báo hết món thủ công, tích hợp HĐĐT nếu bắt buộc thì phải triển khai *trước go-live*, không đợi Phase 2.

## 12. Thông tin chưa chốt (không cản trở bắt đầu UI/DB/API)

1. Tên ngân hàng nhận tiền của hộ kinh doanh/doanh nghiệp (không cần số tài khoản hay mật khẩu) để xác minh giải pháp callback/QR.
2. Nhân viên chủ yếu dùng Android, iPhone hay cả hai (quyết định client LAN).
3. Người nhận đơn có dẫn khách đến quầy thu ngân/đọc mã đơn hay thu ngân nhận trực tiếp từ khách; xác định UX tìm đơn nhanh.
4. Tên/địa chỉ/định danh pháp lý in bill; quy định hóa đơn điện tử cụ thể phải xác minh trước vận hành chính thức.

**Quy tắc thay đổi phạm vi:** Không tự động đưa yêu cầu về kitchen management hoặc inventory trở lại vào MVP. Chỉ triển khai sau khi chủ tiệm yêu cầu thay đổi rõ ràng.

## 13. Quy tắc UI & API cụ thể cho lựa chọn thanh toán (v1.2)

### 13.1 Staff App: một khối chọn phương thức đặt trước nút lưu

```text
----------------------------------
TỔNG CỘNG               90.000đ

KHÁCH THANH TOÁN BẰNG
(●) Tiền mặt       ( ) Chuyển khoản
( ) MoMo*          ( ) Kết hợp*

[ LƯU ĐƠN ]
----------------------------------
* Chỉ hiện khi tính năng tương ứng đã được chủ kích hoạt.
```

- Đây là **payment preference / requested method**, có default `CASH` để nhân viên thao tác ít nhất trong trường hợp thường gặp.
- Chọn phương thức không tự động chuyển trạng thái `PAID`; mọi đơn mới bắt đầu `UNPAID`.
- Staff vẫn có thể chọn Chuyển khoản ở M1 để báo cho thu ngân, nhưng tạo QR/xác nhận tự động chỉ được bật sau khi tích hợp payment provider M3.
- Màn hình đơn đã lưu hiển thị: `B104 · 90.000đ · Chuyển khoản · Chờ thu tiền`.

### 13.2 Cashier: xác nhận tiền thực thu

- POS làm nổi bật phương thức do nhân viên chọn và mở tác vụ đúng loại; có nút **Đổi phương thức**.
- Cash: nhập `tendered_vnd` và lưu `change_vnd`; ngân hàng: chờ thanh toán có mã tham chiếu unique được xác thực; MoMo: dùng provider merchant khi enabled; kết hợp: mỗi khoản thu ghi riêng.
- Không thể dùng lựa chọn ban đầu để tăng doanh thu hoặc tăng số dư két; chỉ dữ liệu giao dịch đã settle tạo ledger thực thu.
- Cột lọc doanh thu trên Owner App phân theo thực thu: Cash / Bank / MoMo; có thể thêm biểu đồ phương thức **dự kiến** chỉ để phân tích hành vi nếu muốn, mặc định ẩn.

### 13.3 Validation & enums

- `requested_payment_method`: `CASH | BANK_TRANSFER | MOMO | MIXED`; `CASH` là giá trị mặc định của UI, nhưng backend vẫn kiểm tra payload hợp lệ.
- Cho phép sửa theo quyền trước khi settle; không thay thế hay xóa payment đã được xác nhận. Nếu đã có partial payment và khách đổi phương thức thì khoản còn lại có thể trả bằng nguồn khác nếu tính năng MIXED bật.
- Feature flags: `enable_bank_transfer`, `enable_momo`, `enable_mixed_payments`; MoMo chỉ bật khi tích hợp hợp lệ. Về trạng thái MVP, `enable_bank_transfer` chỉ bật cho thanh toán thật khi có quy trình xác nhận hợp lệ.
- Lưu audit khi cashier sửa requested/actual method; hành động này không sửa `amount_vnd` hay tự phát hành biên nhận.
