# HƯỚNG DẪN SỬ DỤNG VÀ VẬN HÀNH TOÀN DIỆN CODEX SWITCHER

Tài liệu này hướng dẫn chi tiết cách build mã nguồn, cài đặt điều khiển từ xa qua Tailscale, cấu hình Telegram Bot, thông báo đẩy qua ntfy.sh và cơ chế tự động khôi phục phiên chat với Paseo trên cả macOS và Windows.

---

## MỤC LỤC

1. [Tổng Quan & Tính Năng Nổi Bật](#1-tổng-quan--tính-năng-nổi-bật)
2. [Cài Đặt & Build Dự Án Từ Source Code](#2-cài-đặt--build-dự-án-từ-source-code)
3. [Cài Đặt Tailscale Để Điều Khiển Qua Điện Thoại](#3-cài-đặt-tailscale-để-điều-khiển-qua-điện-thoại)
4. [Tạo & Cấu Hình Telegram Bot Điều Khiển](#4-tạo--cấu-hình-telegram-bot-điều-khiển)
5. [Cấu Hình Thông Báo Đẩy Qua ntfy.sh](#5-cấu-hình-thông-báo-đẩy-qua-ntfysh)
6. [Cơ Chế Tự Động Hóa & Tích Hợp Với Paseo](#6-cơ-chế-tự-động-hóa--tích-hợp-với-paseo)
7. [Hướng Dẫn Chạy Trên macOS và Windows](#7-hướng-dẫn-chạy-trên-macos-và-windows)
8. [Bảng Tra Cứu Lệnh Telegram Bot](#8-bảng-tra-cứu-lệnh-telegram-bot)

---

## 1. TỔNG QUAN & TÍNH NĂNG NỔI BẬT

**Codex Switcher** là hệ thống quản lý và tự động hóa đa tài khoản ChatGPT / OpenAI Codex, cung cấp:

- 🔄 **Chuyển đổi tài khoản tức thì:** Đổi token hoạt động mà không làm mất cấu hình hay phiên làm việc.
- ⚡ **Theo dõi Quota thời gian thực:** Xem chi tiết % đã dùng trong cửa sổ 5 giờ và 7 ngày của từng tài khoản.
- 🤖 **Tự động chuyển tài khoản (Auto-Switch):** Tự động phát hiện khi tài khoản active đạt ngưỡng (ví dụ 95%) để chuyển sang tài khoản còn nhiều quota nhất.
- 🚀 **Tích hợp Paseo thông minh (In-Place Hot-Reload):** Khi đang chat mà bị lỗi hết hạn mức (`You’ve hit your usage limit`), hệ thống tự động đổi tài khoản, giải phóng worker cũ, tải lại cấu hình daemon trong ~0.6s và tự động gửi tin nhắn `"tiếp tục"` vào **tất cả các tab đang chạy** mà **HOÀN TOÀN KHÔNG CẦN ĐÓNG PASEO**.
- 📱 **Điều khiển đa kênh:** Qua Web Dashboard (hỗ trợ mobile qua Tailscale) và Telegram Bot hai chiều.
- 🔔 **Cảnh báo đa kênh:** Gửi tin nhắn tức thì qua Telegram và ntfy.sh khi quota thấp hoặc khi vừa tự động đổi tài khoản.
- 💻 **Đa nền tảng:** Tương thích 100% với macOS, Windows và Linux.

---

## 2. CÀI ĐẶT & BUILD DỰ ÁN TỪ SOURCE CODE

### 2.1. Yêu cầu môi trường
- **Node.js:** Phiên bản 18 trở lên (`node -v`).
- **Package Manager:** `pnpm` (`npm install -g pnpm`).
- **Rust Toolchain (Nếu build native binary):** `rustc`, `cargo` (`curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh`).

### 2.2. Các bước cài đặt và build

```bash
# 1. Clone repository
git clone https://github.com/thinhbg59/codex-switcher.git
cd codex-switcher

# 2. Cài đặt thư viện dependencies
pnpm install

# 3. Build Web Dashboard Frontend
pnpm build
# Kết quả build sẽ nằm tại thư mục dist/

# 4. (Tùy chọn) Build Rust Backend Binary
cargo build --release --bin codex-web
# File nhị phân sinh ra tại: target/release/codex-web (trên Mac) hoặc target/release/codex-web.exe (trên Windows)
```

### 2.3. Khởi chạy Web Server cục bộ

```bash
# Khởi chạy server quản lý (Port mặc định 3210)
node scripts/web-server.mjs
```

Truy cập dashboard tại: `http://localhost:3210`

---

## 3. CÀI ĐẶT TAILSCALE ĐỂ ĐIỀU KHIỂN QUA ĐIỆN THOẠI

Tailscale tạo một mạng VPN an toàn (Mesh VPN) giúp bạn truy cập trực tiếp Web Dashboard trên máy tính từ điện thoại ở bất kỳ đâu mà không cần mở port mạng (NAT/Port Forwarding).

### 3.1. Cài đặt trên máy tính (Host)
1. Tải và cài đặt Tailscale từ: [https://tailscale.com/download](https://tailscale.com/download)
2. Mở ứng dụng Tailscale và đăng nhập tài khoản (Google, Microsoft, GitHub, v.v.).
3. Lấy địa chỉ **Tailscale IP** của máy tính (dạng `100.x.y.z`, ví dụ: `100.66.99.92`).

### 3.2. Cài đặt trên điện thoại (Mobile)
1. Cài ứng dụng **Tailscale** từ App Store (iOS) hoặc Google Play (Android).
2. Đăng nhập **cùng tài khoản Tailscale** như trên máy tính.
3. Bật kết nối VPN trên ứng dụng điện thoại.

### 3.3. Truy cập Dashboard từ điện thoại
- Mở trình duyệt Safari/Chrome trên điện thoại và truy cập:
  ```text
  http://<Địa_chỉ_Tailscale_IP>:3210
  Ví dụ: http://100.66.99.92:3210
  ```
- *Mẹo:* Bạn có thể bấm nút **"Thêm vào Màn hình chính" (Add to Home Screen)** trên điện thoại để dùng như một ứng dụng độc lập.

---

## 4. TẠO & CẤU HÌNH TELEGRAM BOT ĐIỀU KHIỂN

### 4.1. Tạo Telegram Bot mới
1. Mở ứng dụng Telegram, tìm kiếm bot **`@BotFather`**.
2. Gõ lệnh `/newbot` và làm theo hướng dẫn:
   - Nhập tên hiển thị cho Bot (ví dụ: `My Codex Switcher`).
   - Nhập username cho Bot kết thúc bằng chữ `bot` (ví dụ: `MyCodexSwitcher_bot`).
3. BotFather sẽ cung cấp cho bạn một **Bot Token** có định dạng:
   `8881113656:AAFmxqb1g7niRYBT_uzhaaTyM8f8sXjT64Y` (Lưu lại chuỗi này).

### 4.2. Kích hoạt và lấy Chat ID
1. Tìm bot bạn vừa tạo trên Telegram và bấm nút **START** (hoặc gửi 1 tin nhắn bất kỳ cho bot).
2. Mở Web Dashboard (`http://100.66.99.92:3210`) ➔ Bấm vào **🔔 Cài đặt thông báo & Tự động**.
3. Bật mục **Telegram Notifications**.
4. Dán **Bot Token** vào ô cấu hình.
5. Bấm nút **🔍 Tự động tìm Chat ID** ➔ Hệ thống sẽ tự quét và điền Chat ID của bạn.
6. Bấm **🔔 Gửi thử nghiệm** để nhận tin nhắn kiểm tra.
7. Bấm **Lưu cài đặt**.

---

## 5. CẤU HÌNH THÔNG BÁO ĐẨY QUA NTFY.SH

[ntfy.sh](https://ntfy.sh) là dịch vụ gửi thông báo đẩy hoàn toàn miễn phí, không cần đăng ký tài khoản:

1. Trên điện thoại: Tải ứng dụng **ntfy** (iOS / Android).
2. Mở app ntfy ➔ Bấm dấu `+` để thêm topic (ví dụ: `tcodex`).
3. Trên Web Dashboard Codex Switcher ➔ Mở **Cài đặt thông báo**:
   - Bật mục **ntfy.sh Notifications**.
   - Nhập Topic: `tcodex`.
   - Server: `https://ntfy.sh` (hoặc server riêng nếu có).
   - Bấm **🔔 Gửi thử nghiệm** và **Lưu cài đặt**.

---

## 6. CƠ CHẾ TỰ ĐỘNG HÓA & TÍCH HỢP VỚI PASEO

### 6.1. Nguyên lý In-Place Hot-Reload (Không cần tắt Paseo)
Khi một tab chat trong Paseo báo lỗi hết quota:
1. Codex Switcher phát hiện file `~/.paseo/agents/<workspace>/<id>.json` có `lastError: "You’ve hit your usage limit..."`.
2. Tự động chọn tài khoản phụ có quota tốt nhất (0% used) và nạp token mới vào `~/.codex/auth.json`.
3. Giải phóng worker cũ (`pkill -f "codex app-server"` hoặc `taskkill /F /IM codex.exe /T`).
4. Gửi tín hiệu reload cho daemon (`paseo daemon reload`).
5. Gửi lệnh `paseo send <agent-id> "<resumePrompt>" --no-wait` đến **tất cả các tab đang bị lỗi**.
6. Paseo tự động spawn worker mới với token mới và chạy tiếp tục toàn bộ các tab song song.

### 6.2. Cấu hình tin nhắn tiếp tục (Resume Prompt)
- Mặc định tin nhắn gửi đi là `"tiếp tục"`.
- Trong Web Dashboard (Cài đặt thông báo ➔ Tự động Tiếp tục Chat trên Paseo): Bạn có thể tùy chỉnh thành `"tiếp tục công việc"`, `"continue"`, v.v.

---

## 7. HƯỚNG DẪN CHẠY TRÊN MACOS VÀ WINDOWS

### 7.1. Cấu hình chạy tự động ngầm trên macOS (LaunchAgent)

Tạo file `~/Library/LaunchAgents/com.codex.switcher.web.plist` với nội dung:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.codex.switcher.web</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Users/thinhdev/.codex-switcher-web/web-server.mjs</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/codex-switcher-web.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/codex-switcher-web-err.log</string>
</dict>
</plist>
```

Kích hoạt dịch vụ:
```bash
launchctl load ~/Library/LaunchAgents/com.codex.switcher.web.plist
```

---

### 7.2. Cấu hình chạy tự động trên Windows

#### Cách 1: Sử dụng PM2 (Khuyên dùng)
```cmd
# Cài đặt PM2
npm install -g pm2 pm2-windows-startup

# Khởi chạy server
pm2 start scripts\web-server.mjs --name codex-switcher

# Lưu trạng thái tự khởi động cùng Windows
pm2 save
pm2-startup install
```

#### Cách 2: Thư mục Startup (Khởi chạy khi đăng nhập)
1. Bấm `Win + R`, gõ `shell:startup` và Enter.
2. Tạo file `start_codex_switcher.vbs` trong thư mục này:
   ```vbs
   Set WshShell = CreateObject("WScript.Shell")
   WshShell.Run "node C:\Users\<Username>\codex-switcher\scripts\web-server.mjs", 0, False
   ```

---

## 8. BẢNG TRA CỨU LỆNH TELEGRAM BOT

| Lệnh | Mô tả chi tiết |
|---|---|
| **/start** hoặc **/help** | Mở Menu chính với các nút bấm điều khiển nhanh và trạng thái tài khoản active. |
| **/resume_paseo** hoặc **/tieptuc** | Tự động đổi sang tài khoản tốt nhất và gửi tin nhắn `"tiếp tục"` vào tất cả các tab Paseo vừa hết quota. |
| **/tieptuc <nội dung>** | Đổi tài khoản và gửi nội dung tin nhắn tùy ý vào các tab Paseo (ví dụ: `/tieptuc làm tiếp`). |
| **/restart_paseo** | Đóng an toàn Paseo ➔ Đổi sang tài khoản tốt nhất ➔ Khởi động lại Paseo. |
| **/restart_paseo <tên/số>** | Đổi sang tài khoản cụ thể và khởi động lại Paseo (ví dụ: `/restart_paseo 2`). |
| **/list** hoặc **/accounts** | Xem danh sách tất cả các tài khoản kèm % dung lượng và các nút bấm chuyển đổi 1 chạm. |
| **/active** hoặc **/status** | Xem chi tiết thông số quota (5h và 7d) và thời gian reset của tài khoản đang dùng. |
| **/switch <tên hoặc số>** | Chuyển tài khoản hoạt động mà không đụng đến Paseo (ví dụ: `/switch 1`). |
| **/warmup** | Gửi tín hiệu đánh thức (warm-up) đồng loạt tất cả các tài khoản đã lưu. |
| **/paseo** | Xem số tiến trình Paseo đang chạy, kèm nút Mở / Đóng / Force Close Paseo. |
| **/codex** | Xem trạng thái tiến trình Codex, kèm nút Mở / Force Close Codex. |
