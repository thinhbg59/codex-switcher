# HƯỚNG DẪN SỬ DỤNG VÀ VẬN HÀNH TOÀN DIỆN CODEX SWITCHER

Tài liệu này hướng dẫn chi tiết cách cài đặt và build mã nguồn, tích hợp IDE Paseo (paseo.sh), cài đặt điều khiển từ xa qua Tailscale, cấu hình Telegram Bot, thông báo đẩy qua ntfy.sh, và cơ chế theo dõi Token/Quota toàn hệ thống trên cả macOS và Windows.

---

## MỤC LỤC

1. [Tổng Quan & Tính Năng Nổi Bật](#1-tổng-quan--tính-năng-nổi-bật)
2. [Cài Đặt & Cấu Hình Paseo (paseo.sh)](#2-cài-đặt--cấu-hình-paseo-paseosh)
3. [Cài Đặt & Build Codex Switcher Từ Source Code](#3-cài-đặt--build-codex-switcher-từ-source-code)
4. [Cài Đặt Tailscale Để Điều Khiển Qua Điện Thoại](#4-cài-đặt-tailscale-để-điều-khiển-qua-điện-thoại)
5. [Tạo & Cấu Hình Telegram Bot Điều Khiển Hai Chiều](#5-tạo--cấu-hình-telegram-bot-điều-khiển-hai-chiều)
6. [Cấu Hình Thông Báo Đẩy Qua ntfy.sh](#6-cấu-hình-thông-báo-đẩy-qua-ntfysh)
7. [Cơ Chế Tự Động Hóa & In-Place Hot-Reload Cho Paseo](#7-cơ-chế-tự-động-hóa--in-place-hot-reload-cho-paseo)
8. [Hệ Thống Phân Tích Token & Quota Cộng Dồn (Analytics)](#8-hệ-thống-phân-tích-token--quota-cộng-dồn-analytics)
9. [Hướng Dẫn Vận Hành Ngầm Trên macOS và Windows](#9-hướng-dẫn-vận-hành-ngầm-trên-macos-và-windows)
10. [Bảng Tra Cứu Lệnh Telegram Bot & Paseo CLI](#10-bảng-tra-cứu-lệnh-telegram-bot--paseo-cli)

---

## 1. TỔNG QUAN & TÍNH NĂNG NỔI BẬT

**Codex Switcher** là hệ sinh thái quản lý và tự động hóa đa tài khoản ChatGPT / OpenAI Codex toàn diện:

- 🔄 **Chuyển đổi tài khoản tức thì:** Đổi token hoạt động (`~/.codex/auth.json`) trong chớp mắt mà không làm gián đoạn IDE hay mất phiên làm việc.
- 🔋 **Tổng Quota Cộng Dồn (Pooled Quota):** Tự động tính tổng % dung lượng còn lại của tất cả tài khoản trong hệ thống (ví dụ: 5 tài khoản = **473% / 500%**).
- 📊 **Widget Thống Kê Token Thời Gian Thực:** Đo lường chính xác lượng Token tiêu thụ (Input, Output, Reasoning, Cached), Tỷ lệ Cache Hit (~96%) và số lượt chat (Turns) theo các khung: **1h, 24h, 3 ngày, 7 ngày, 30 ngày**.
- 🚀 **Tích hợp Paseo thông minh (In-Place Hot-Reload):** Tự động phát hiện lỗi hết hạn mức (`You’ve hit your usage limit`), tự đổi tài khoản 0% used, reload daemon Paseo và gửi tin nhắn `"tiếp tục"` vào **tất cả các tab đang chạy** mà **HOÀN TOÀN KHÔNG CẦN ĐÓNG PASEO**.
- 📱 **Điều khiển đa kênh từ xa:** Qua Web Dashboard trên điện thoại (Tailscale VPN) và Telegram Bot tương tác 2 chiều.
- 🔔 **Cảnh báo tức thì:** Gửi thông báo đẩy qua Telegram và ntfy.sh khi quota thấp hoặc khi vừa tự động đổi tài khoản.
- 💻 **Đa nền tảng 100%:** Hỗ trợ chuẩn xác trên macOS, Windows và Linux.

---

## 2. CÀI ĐẶT & CẤU HÌNH PASEO (PASEO.SH)

Paseo ([https://paseo.sh](https://paseo.sh)) là Agentic IDE hiện đại được xây dựng để lập trình viên tương tác trực tiếp với các Agent AI (như OpenAI Codex, Claude, Gemini).

### 2.1. Cài đặt Paseo Desktop App & CLI

#### A. Trên macOS:
1. **Tải trực tiếp:** Truy cập [https://paseo.sh](https://paseo.sh) và tải file cài đặt `Paseo.dmg` (cho Apple Silicon hoặc Intel).
2. Kéo `Paseo.app` vào thư mục `/Applications`.
3. **Cài đặt qua Command Line (Tự động):**
   ```bash
   curl -fsSL https://paseo.sh/install | bash
   ```
4. **Kiểm tra Paseo CLI:**
   Mở Terminal và gõ:
   ```bash
   paseo --version
   ```
   *(Paseo CLI được cài đặt tự động tại `~/.local/bin/paseo` hoặc `/usr/local/bin/paseo`)*.

#### B. Trên Windows:
1. Truy cập [https://paseo.sh](https://paseo.sh), tải bộ cài đặt Windows (`Paseo-Setup.exe`).
2. Tiến hành cài đặt theo hướng dẫn.
3. Paseo CLI sẽ tự động được liên kết tại `%LOCALAPPDATA%\Programs\paseo\bin\paseo.cmd` hoặc thêm vào biến môi trường `PATH`.

---

### 2.2. Cách Paseo Tương Tác Với OpenAI Codex
- **Lưu trữ phiên làm việc:** Mỗi tab chat trong Paseo là một Agent Session được lưu dưới dạng file JSON tại:
  ```text
  ~/.paseo/agents/<workspace-id>/<agent-id>.json
  ```
- **Tiến trình xử lý nền:** Paseo Daemon (chạy ngầm cổng 6767) quản lý các worker con `codex app-server --enable goals` để giao tiếp với OpenAI.

---

### 2.3. Các lệnh Paseo CLI thông dụng
| Lệnh CLI | Chức năng |
|---|---|
| `paseo list` | Liệt kê tất cả các phiên chat / agent đang có trong dự án. |
| `paseo inspect <agent-id>` | Xem chi tiết trạng thái, token đã dùng, model và lỗi của 1 phiên chat. |
| `paseo send <agent-id> "<nội dung>" --no-wait` | Gửi tin nhắn tiếp tục xử lý vào phiên chat đó mà không cần gõ trên UI. |
| `paseo daemon reload` | Nạp lại cấu hình daemon trong ~50ms mà không làm tắt cửa sổ ứng dụng. |
| `paseo daemon restart` | Khởi động lại dịch vụ nền của Paseo. |

---

## 3. CÀI ĐẶT & BUILD CODEX SWITCHER TỪ SOURCE CODE

### 3.1. Yêu cầu môi trường
- **Node.js:** Phiên bản 18 trở lên (`node -v`).
- **Package Manager:** `pnpm` (`npm install -g pnpm`).
- **Rust Toolchain (Nếu build file nhị phân Tauri/Web Core):** `rustc`, `cargo` (`curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh`).

### 3.2. Các bước cài đặt và build

```bash
# 1. Clone repository
git clone https://github.com/thinhbg59/codex-switcher.git
cd codex-switcher

# 2. Cài đặt thư viện dependencies
pnpm install

# 3. Build Web Dashboard Frontend
pnpm build
# Kết quả build HTML/CSS/JS sẽ nằm tại thư mục dist/

# 4. (Tùy chọn) Build Rust Backend Binary
cargo build --release --bin codex-web
# File nhị phân sinh ra tại: target/release/codex-web (trên Mac) hoặc target/release/codex-web.exe (trên Windows)
```

### 3.3. Khởi chạy Web Server cục bộ

```bash
# Khởi chạy server quản lý (Port mặc định 3210)
node scripts/web-server.mjs
```

Truy cập dashboard tại: `http://localhost:3210`

---

## 4. CÀI ĐẶT TAILSCALE ĐỂ ĐIỀU KHIỂN QUA ĐIỆN THOẠI

Tailscale tạo mạng VPN an toàn (Mesh VPN) giúp bạn truy cập trực tiếp Web Dashboard trên máy tính từ điện thoại ở bất kỳ đâu mà không cần mở port modem hay NAT mạng.

### 4.1. Cài đặt trên máy tính (Host)
1. Tải và cài đặt Tailscale từ: [https://tailscale.com/download](https://tailscale.com/download)
2. Mở ứng dụng Tailscale và đăng nhập tài khoản (Google, Microsoft, GitHub, v.v.).
3. Lấy địa chỉ **Tailscale IP** của máy tính (dạng `100.x.y.z`, ví dụ: `100.66.99.92`).

### 4.2. Cài đặt trên điện thoại (Mobile)
1. Cài ứng dụng **Tailscale** từ App Store (iOS) hoặc Google Play (Android).
2. Đăng nhập **cùng tài khoản Tailscale** như trên máy tính.
3. Bật kết nối VPN trên ứng dụng điện thoại.

### 4.3. Truy cập Dashboard từ điện thoại
- Mở trình duyệt Safari/Chrome trên điện thoại và truy cập:
  ```text
  http://<Địa_chỉ_Tailscale_IP>:3210
  Ví dụ: http://100.66.99.92:3210
  ```
- *Mẹo:* Bạn có thể bấm nút **"Thêm vào Màn hình chính" (Add to Home Screen)** trên Safari/Chrome để dùng như một ứng dụng Native độc lập.

---

## 5. TẠO & CẤU HÌNH TELEGRAM BOT ĐIỀU KHIỂN HAI CHIỀU

### 5.1. Tạo Telegram Bot mới
1. Mở ứng dụng Telegram, tìm kiếm bot **`@BotFather`**.
2. Gõ lệnh `/newbot` và làm theo hướng dẫn:
   - Nhập tên hiển thị cho Bot (ví dụ: `Codex Switcher Bot`).
   - Nhập username cho Bot kết thúc bằng chữ `bot` (ví dụ: `CodexSwitcherNotify_bot`).
3. BotFather sẽ cung cấp cho bạn một **Bot Token** có định dạng mẫu:
   `1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ_1234567` (Lưu lại chuỗi này).

### 5.2. Kích hoạt và kết nối với Codex Switcher
1. Tìm bot bạn vừa tạo trên Telegram và bấm nút **START** (hoặc gửi 1 tin nhắn bất kỳ cho bot).
2. Mở Web Dashboard (`http://100.66.99.92:3210`) ➔ Bấm vào **🔔 Cài đặt thông báo & Tự động**.
3. Bật mục **Telegram Notifications**.
4. Dán **Bot Token** vào ô cấu hình.
5. Bấm nút **🔍 Tự động tìm Chat ID** ➔ Hệ thống sẽ tự quét và điền Chat ID của bạn.
6. Bấm **🔔 Gửi thử nghiệm** để nhận tin nhắn kiểm tra.
7. Bấm **Lưu cài đặt**.

---

## 6. CẤU HÌNH THÔNG BÁO ĐẨY QUA NTFY.SH

[ntfy.sh](https://ntfy.sh) là dịch vụ gửi thông báo đẩy hoàn toàn miễn phí, nhanh chóng và không cần đăng ký tài khoản:

1. **Trên điện thoại:** Tải ứng dụng **ntfy** (iOS / Android).
2. Mở app ntfy ➔ Bấm dấu `+` để thêm topic (ví dụ: `tcodex`).
3. **Trên Web Dashboard Codex Switcher:** Mở **Cài đặt thông báo**:
   - Bật mục **ntfy.sh Notifications**.
   - Nhập Topic: `tcodex`.
   - Server: `https://ntfy.sh` (hoặc server riêng nếu có).
   - Bấm **🔔 Gửi thử nghiệm** và **Lưu cài đặt**.

---

## 7. CƠ CHẾ TỰ ĐỘNG HÓA & IN-PLACE HOT-RELOAD CHO PASEO

### 7.1. Nguyên lý In-Place Hot-Reload (Không tắt Paseo)
Khi một hoặc nhiều tab chat trong Paseo báo lỗi hết quota (`You’ve hit your usage limit`):
1. **Phát hiện lỗi:** Tiến trình nền quét thư mục `~/.paseo/agents/` mỗi 10 giây và gom danh sách toàn bộ các tab bị lỗi.
2. **Cập nhật Auth:** Codex Switcher chọn tài khoản phụ có quota tốt nhất (0% used) và nạp token mới vào `~/.codex/auth.json`.
3. **Giải phóng Worker cũ:** Gửi tín hiệu tắt worker `codex app-server` cũ (`pkill -f "codex app-server"` hoặc `taskkill /F /IM codex.exe /T`). *(Lưu ý: Không làm ảnh hưởng cửa sổ Paseo)*.
4. **Làm mới Daemon:** Gọi lệnh `paseo daemon reload` (mất ~50ms).
5. **Gửi lệnh tiếp tục đồng loạt:** Gửi lệnh `paseo send <agent-id> "<resumePrompt>" --no-wait` đến **tất cả các tab đang chạy**.
6. **Tiếp tục công việc:** Paseo tự động spawn worker mới với token mới và xử lý tiếp toàn bộ các tab song song.

### 7.2. Tùy chỉnh tin nhắn tiếp tục (Resume Prompt)
- **Mặc định:** `"tiếp tục"`.
- **Cấu hình trên Web Dashboard:** Mở Cài đặt thông báo ➔ Ô **Tin nhắn gửi đi khi tiếp tục (Resume Prompt)** ➔ Đổi thành `tiếp tục công việc`, `continue`, v.v.
- **Tùy biến nhanh qua Telegram:** Gõ `/tieptuc hãy làm tiếp mục 2` ➔ Bot sẽ nạp tài khoản mới và gửi chính xác câu lệnh đó vào các tab đang chạy.

---

## 8. HỆ THỐNG PHÂN TÍCH TOKEN & QUOTA CỘNG DỒN (ANALYTICS)

### 8.1. Công thức tính Tổng Quota Cộng Dồn (Pooled Quota)
- Nếu hệ thống có $N$ tài khoản, **Tổng dung lượng tối đa = $N 	imes 100%$** (ví dụ 5 tài khoản = **500%**).
- **Tổng Quota Còn Lại** = $sum (100% - 	ext{Đã dùng của từng acc})$:
  - *Ví dụ:* 4 acc còn 100% + 1 acc còn 73% (đã dùng 27%) = **473% / 500%** (Đạt **94.6%** dung lượng khả dụng).

### 8.2. Thống kê Token theo mốc thời gian
Hệ thống tự động quét và phân tích dữ liệu từ `~/.codex/sessions/` theo các mốc:
- **1 Giờ (1h)**
- **24 Giờ / 1 Ngày (24h)**
- **3 Ngày (3d)**
- **7 Ngày (7d)**
- **30 Ngày (30d)**

**Các chỉ số đo lường chi tiết:**
- **Input Tokens:** Lượng token prompt và context gửi vào.
- **Output Tokens:** Lượng token phản hồi sinh ra.
- **Reasoning Tokens:** Token suy luận/suy nghĩ chuyên sâu của mô hình.
- **Cached Input Tokens & Tỷ Lệ Cache Hit (%):** Đo lường hiệu quả tái sử dụng bộ nhớ đệm ngữ cảnh (thường đạt ~96%, giúp tăng tốc phản hồi gấp 2-3 lần và tiết kiệm quota).
- **Tổng số Turns (Lượt tương tác):** Số chu kỳ gửi yêu cầu và nhận phản hồi giữa người dùng và Codex.

---

## 9. HƯỚNG DẪN VẬN HÀNH NGẦM TRÊN MACOS VÀ WINDOWS

### 9.1. Cấu hình chạy tự động ngầm trên macOS (LaunchAgent)

Tạo file `~/Library/LaunchAgents/com.codex.switcher.web.plist`:

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

### 9.2. Cấu hình chạy tự động trên Windows (1-Click Auto-Start)

#### Cách 1: Sử dụng Script 1-Click Tích Hợp Sẵn (Khuyên dùng)
1. **Build & Cài đặt tự động:**
   - Nhấp đúp chuột vào file `build-windows.bat` (hoặc chạy trong CMD).
   - Nhấp đúp chuột vào file `scripts\install-windows-service.bat`.
2. Hệ thống sẽ tự động tạo shortcut chạy ngầm (`start-service.vbs`) vào thư mục Startup của Windows và kích hoạt dịch vụ chạy ngầm ngay lập tức.
3. Để gỡ bỏ tự khởi động, chỉ cần chạy file `scripts\uninstall-windows-service.bat`.

#### Cách 2: Chạy trực tiếp
- Nhấp đúp chuột vào file `run-windows.bat`. Script sẽ tự động khởi động server và mở ngay trình duyệt tại `http://localhost:3210`.

#### Cách 3: Sử dụng PM2 (Dành cho Server/Dev)
```cmd
# Cài đặt PM2
npm install -g pm2 pm2-windows-startup

# Khởi chạy server
pm2 start scripts\web-server.mjs --name codex-switcher

# Lưu trạng thái tự khởi động cùng Windows
pm2 save
pm2-startup install
```

---

## 10. BẢNG TRA CỨU LỆNH TELEGRAM BOT & PASEO CLI

### 📱 Bảng lệnh Telegram Bot
| Lệnh | Ý nghĩa thao tác |
|---|---|
| **/start** hoặc **/help** | Mở Menu chính với các nút bấm điều khiển nhanh và trạng thái tài khoản active. |
| **/usage** hoặc **/tokens** | Báo cáo chi tiết Token tiêu thụ (1h, 24h, 3d, 7d, 30d), Tỷ lệ Cache Hit và Tổng Quota cộng dồn. |
| **/resume_paseo** hoặc **/tieptuc** | Tự động đổi tài khoản tốt nhất và gửi `"tiếp tục"` vào tất cả các tab Paseo vừa hết quota. |
| **/tieptuc <nội dung>** | Đổi tài khoản và gửi nội dung tin nhắn tùy ý vào các tab Paseo (ví dụ: `/tieptuc làm tiếp`). |
| **/restart_paseo** | Đóng an toàn Paseo ➔ Đổi sang tài khoản tốt nhất ➔ Khởi động lại Paseo. |
| **/restart_paseo <tên/số>** | Đổi sang tài khoản cụ thể và khởi động lại Paseo (ví dụ: `/restart_paseo 2`). |
| **/list** hoặc **/accounts** | Xem danh sách tất cả các tài khoản kèm % dung lượng và các nút bấm chuyển đổi 1 chạm. |
| **/active** hoặc **/status** | Xem chi tiết thông số quota (5h và 7d) và thời gian reset của tài khoản đang dùng. |
| **/switch <tên hoặc số>** | Chuyển tài khoản hoạt động trong nền (ví dụ: `/switch 1`). |
| **/warmup** | Gửi tín hiệu đánh thức (warm-up) đồng loạt tất cả các tài khoản đã lưu. |
| **/paseo** | Xem số tiến trình Paseo đang chạy, kèm nút Mở / Đóng / Force Close Paseo. |
| **/codex** | Xem trạng thái tiến trình Codex, kèm nút Mở / Force Close Codex. |
