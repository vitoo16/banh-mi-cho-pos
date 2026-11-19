# Bánh Mì Chợ POS — Windows Local CI (không dùng GitHub Actions)

**Trạng thái: runnable candidate; not yet executed on the owner's Windows machine.** Script chưa được chứng nhận chạy trọn bộ trên Windows của cửa hàng, không phải chứng nhận production/hardware. Không thay đổi logic thanh toán, đơn hàng, SQLite hay các workflow GitHub hiện tại.

## Cách sử dụng

Đây là CI chạy trực tiếp trên máy phát triển Windows bằng PowerShell 5.1+ và Node.js 24. Không cần GitHub Actions runner, GitHub API hay GH_TOKEN. Sau khi các dependencies đã được tải về trước, script có thể chạy khi mất Internet.

Chạy từ CMD tại thư mục gốc monorepo (cùng cấp với package.json):

    cd C:\path\to\banh-mi-cho-pos
    run-ci.cmd quick
    run-ci.cmd full

Hoặc PowerShell:

    .\run-ci.ps1 -Suite quick
    .\run-ci.ps1 -Suite full

**QUICK** bao gồm các gate đang có trên main:
- npm run docs:check
- node --test tests/local-ci-contract.test.mjs
- npm run check; npm run build
- npm run test:domain; npm run test:integration (tiền mặt, in hai liên giả lập, order, outbox, recovery)
- npm run test:bundle (ngân sách JS/CSS/font)
- Windows SQLite backup/restore: backup-freshness, restore, restore-process-rehearsal, windows-backup-job
- BMC_PERF_PROFILE=smoke và npm run test:perf:http (150 orders)

**FULL** chạy toàn bộ QUICK và thêm:
- PostgreSQL 16 disposable qua Docker Desktop, chạy năm test Cloud/SePay/sync theo test-concurrency=1
- npm run test:ui (Playwright Chromium/Firefox/WebKit theo cấu hình repo)
- npm run test:e2e (Real Hub API + browser E2E)
- BMC_PERF_PROFILE=burst và npm run test:perf:http (1.500 orders)
- Các script test:security:hub-network, test:dev:hub, test:perf:history-index nếu *nhánh đang checkout* định nghĩa. Nếu không có, in NOT APPLICABLE — không tính là PASS.
- npx --no-install expo export --platform all (Android/iOS **JS bundle**; không phải APK/IPA native build).

Script dừng tại stage lỗi đầu tiên, trả exit code 1, ghi log và KHÔNG giả mạo PASS. Đối với quick/full cần Docker/Playwright hay assets Expo chưa cài, kết quả là FAIL thay vì âm thầm bỏ qua.

## Chuẩn bị lần đầu (khi có Internet)

Trên máy dev/test Windows riêng, không chạy trên máy POS thu ngân đang bán hàng:

1. Cài Node.js **24**, npm, Git for Windows. Kiểm tra node -v bắt đầu bằng v24.
2. Clone repo và checkout đúng commit/PR branch muốn test. Runner ghi SHA, branch và dirty worktree vào summary.
3. Từ thư mục gốc repo:

       npm install --no-audit --no-fund
       npx playwright install chromium firefox webkit

4. Với full: cài Docker Desktop, chọn Linux containers, khởi động Docker và tải trước:

       docker pull postgres:16

5. Chuẩn bị cache/assets Expo khi online; script đặt EXPO_OFFLINE=1.
6. Tắt dev servers nếu đang dùng 5173, 5174, 4400 hoặc 4420 trước khi chạy Playwright/E2E.

Repository chưa có npm package-lock.json đã được kiểm chứng. Việc cài đặt lần đầu qua npm install có thể resolve dependency mới; đừng tuyên bố khả năng tái lập hoàn toàn cho đến khi có lockfile được review. Runner cố ý KHÔNG thực hiện npm install, docker pull hay tải browser trong khi chạy test.

## Bảo vệ dữ liệu thực tế

- Refuse nếu shell đã có STORE_DB_PATH, DATABASE_URL, PRINTER_HOST, CLOUD_SYNC_URL hoặc BANK_BRIDGE_SECRET không rỗng.
- Mỗi stage dùng SQLite path tạm khác nhau trong thư mục riêng. Node test có quyền tạo fixture tạm của nó.
- NODE_ENV=test; HUB_BIND_HOST=127.0.0.1; PRINTER_HOST/CLOUD_SYNC_URL/BANK_BRIDGE_SECRET/TLS path rỗng; DOTENV_CONFIG_PATH trỏ đến đường dẫn không tồn tại để tránh đọc nhầm file .env.
- Khi QUICK, DATABASE_URL trỏ đến địa chỉ loopback vô hiệu. Khi FULL, tạo PostgreSQL container --rm với mật khẩu ngẫu nhiên và cổng ngẫu nhiên ràng buộc 127.0.0.1, cleanup trong finally.
- KHÔNG chạy khi ứng dụng POS đang vận hành với tiền thật hoặc với cấu hình ngân hàng/provider production.
- Trước khi chia sẻ log, phải kiểm tra và che đường dẫn cá nhân, thông tin môi trường, token hoặc dữ liệu nhạy cảm. Test runner không lưu thông tin mật khẩu PostgreSQL của container vào summary.

## Báo cáo

Sau mỗi lần chạy có một thư mục dưới:

    artifacts/local-ci/YYYYMMDD-HHMMSS-PID/
      summary.json
      01-docs-check.log
      02-local-ci-contract.log
      ...
      expo-native-export/     (FULL only)

summary.json chứa suite, PASS/FAIL, thời gian, Node/Windows version, Git SHA, branch, dirty flag và exit code/log của từng stage. Thư mục này được .gitignore; không commit log hoặc Expo export.

**A green Local CI run is not a GitHub required status check**. Nó không tự gỡ yêu cầu branch protection của GitHub. Khi review PR, ghi rõ SHA và hệ điều hành chạy, đính kèm summary/log đã redact; giữ independent code review và các gate cần thiết.

## Pre-push hook tùy chọn

File scripts/local-ci/pre-push.example chạy quick từ repo root (dùng git rev-parse --show-toplevel). Sau khi QUICK đã hoạt động, xem lại rồi copy vào .git/hooks/pre-push nếu chưa có hook. Git for Windows sẽ chặn push khi quick fail. Hook chỉ hoạt động trên máy đã cài và có thể bị bypass; không phải gate chung của GitHub.

## Giới hạn, nghiệm thu, rollback

- Không thay thế 80mm thermal printer thật, cutter, két RJ11/RJ12, Android/iOS native app, thiết bị thực, mạng LAN/TLS, SePay provider thực, Windows power-loss drill hoặc nghiệm thu chủ cửa hàng.
- node --test tests/local-ci-contract.test.mjs là **static contract tests**, không phải kiểm tra cú pháp PowerShell hay thực thi end-to-end Windows.
- Muốn chứng nhận local CI hoạt động, chạy thành công cả run-ci.cmd quick và full trên Windows + lưu evidence; phải xem lại log sau từng lỗi.
- Nếu cần rollback: revert PR này, bỏ script/test/docs/hook. Không cần xóa workflow GitHub, không cần thay đổi tiền/đơn hàng hay database schema.
