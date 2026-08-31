<p align="center">
  <img src="src-tauri/icons/logo.svg" alt="Codex Switcher" width="128" height="128">
</p>

<h1 align="center">Codex Switcher</h1>

<p align="center">
  <strong>The Ultimate Multi-Account Manager, Pooled Quota Monitor & Agentic IDE Automation Ecosystem for OpenAI Codex & Paseo</strong><br>
  Seamless account rotation, real-time token analytics, background daemon services, Telegram 2-way bot, and 1-click context optimization.
</p>

<p align="center">
  <a href="#key-features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#paseo-tabs-management">Paseo Management</a> •
  <a href="#remote-control--automation">Remote & Bots</a> •
  <a href="#windows--macos-services">Background Services</a> •
  <a href="DOCS.md">Documentation (Tiếng Việt)</a>
</p>

---

## 🌟 Key Features

### 1. 🔄 Multi-Account Management & Zero-Downtime Switching
- **Instant Hot-Reload:** Swap active OpenAI Codex accounts (`~/.codex/auth.json`) in milliseconds without restarting your IDE or losing chat context.
- **Dual Authentication:** Sign in via official ChatGPT OAuth or import/export standard `auth.json` profiles.
- **Smart Session Persistence:** Prevents race conditions and refresh-token invalidation across account rotations.
- **Automatic Warm-Up:** Keep 5-hour quota windows active via scheduled triggers or immediate warm-up bursts.

### 2. 🎯 Dedicated Paseo Project, Workspace & Tabs Route (`#/paseo`)
- **Hierarchical Tree Structure:** Visualizes your entire development workspace:
  $$\mathbf{Project} \longrightarrow \mathbf{Workspace} \longrightarrow \mathbf{Tabs}$$
- **Real-Time Agent Statuses:** Tracks active states:
  - 🟢 **Running (Đang chạy):** Live inference / tool execution with pulsing indicator.
  - ⚪ **Idle (Đã dừng):** Task completed, agent ready for input.
  - 🟡 **Waiting (Chờ phản hồi):** Awaiting user approval or inputs.
  - 🔴 **Quota Limit (Lỗi Hết Quota):** Automatic detection when account hits limit.
- **🌱 1-Click Smart Handoff (Tách Tab Mới):**
  - Resolves token bloat when sessions reach $>25$ turns ($>100\text{k}$ tokens).
  - Automatically spawns a fresh tab in the **exact same workspace** with ~3k tokens, saving **$>85\%$ quota** while continuing your codebase tasks.
- **⚡ Smart Resume:** Sends concise, non-redundant continuation prompts to unblock stuck sessions.

### 3. 📊 Total Pooled Quota & Token Analytics
- **Pooled Quota Capacity:** Aggregates remaining quota percentages across all accounts (e.g. 5 accounts = **473% / 500%**).
- **Multi-Window Token Breakdown:** Inspect Input, Output, Reasoning, and Cached Tokens across **1h, 24h, 3d, 7d, and 30d** windows.
- **Cache Hit Monitoring:** Real-time cache hit efficiency tracking (~96% hit rate).

### 4. 📱 Multi-Channel Remote Access & Telegram Bot
- **Tailscale Remote Dashboard:** Access the Web Dashboard from iOS / Android over private VPN (`http://<tailscale-ip>:3210/`).
- **Two-Way Telegram Bot:**
  - `/usage` or `/tokens` – Live quota and token consumption report.
  - `/resume_paseo` – 1-Click auto-switch account and unblock all throttled Paseo tabs.
  - Interactive Inline Keyboards for instant account switching and status checks.
- **Instant Push Alerts:** Real-time notifications via **Telegram** and **ntfy.sh**.

### 5. 🔒 Privacy & Visual Polish
- **1-Click Sensitive Data Masking:** Blur account emails and names across the dashboard and widgets with hover-to-reveal.
- **Complete Dark Mode:** Polished, high-contrast dark theme optimized for OLED and late-night coding.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js:** v18 or newer (`node -v`)
- **Package Manager:** `pnpm` (recommended) or `npm`
- **Optional (for Desktop App build):** Rust & Cargo toolchain

### Installation & Run

```bash
# 1. Clone the repository
git clone https://github.com/thinhbg59/codex-switcher.git
cd codex-switcher

# 2. Install dependencies
pnpm install

# 3. Build & start Web Dashboard (Port 3210)
pnpm lan
```

Open your browser at **`http://localhost:3210/`** (or `http://localhost:3210/#/paseo` for the Tab Manager).

---

## 🪟 Windows 1-Click Automation

For Windows users, dedicated 1-click batch scripts are included out-of-the-box:

| Script | Purpose |
|---|---|
| **`build-windows.bat`** | Automatically checks Node.js, installs dependencies, builds the frontend, and deploys runtime files. |
| **`run-windows.bat`** | Starts the Web Dashboard and opens `http://localhost:3210/` in your default browser. |
| **`scripts\install-windows-service.bat`** | **1-Click Silent Auto-Start:** Configures silent background startup on Windows login without any CMD popup window. |
| **`scripts\uninstall-windows-service.bat`** | Removes the background startup task and terminates background processes. |

---

## 🍎 macOS LaunchAgent Service

To run Codex Switcher as a persistent, silent background service on macOS:

```bash
# 1. Build and copy runtime files
pnpm build
mkdir -p ~/.codex-switcher-web
cp -R dist ~/.codex-switcher-web/
cp scripts/web-server.mjs ~/.codex-switcher-web/
cp scripts/start-service.sh ~/.codex-switcher-web/
chmod +x ~/.codex-switcher-web/start-service.sh

# 2. Create LaunchAgent plist (~/Library/LaunchAgents/com.codex.switcher.web.plist)
# 3. Load service
launchctl load ~/Library/LaunchAgents/com.codex.switcher.web.plist
```

---

## 🤖 Telegram Bot Commands Reference

| Command | Action |
|---|---|
| `/start` or `/help` | Displays interactive control menu and active account status. |
| `/usage` or `/tokens` | Reports token breakdown (1h, 24h, 3d, 7d, 30d), cache rate, and pooled quota. |
| `/resume_paseo` or `/tieptuc` | Auto-rotates to the highest-quota account and sends continuation prompt to all tabs. |
| `/tabs` | Lists all active Paseo projects, workspaces, turn counts, and token levels. |
| `/list` | Displays all configured accounts with remaining quota badges. |

---

## 📚 Complete Documentation

For comprehensive step-by-step guides in Vietnamese (including Tailscale remote setup, Telegram BotFather configuration, and troubleshooting), please see:

👉 **[DOCS.md — Hướng Dẫn Sử Dụng & Vận Hành Toàn Diện](DOCS.md)**

---

## ⚠️ Disclaimer

This tool is designed **exclusively for individuals who personally own multiple OpenAI / ChatGPT accounts** to manage their own workflows conveniently. It is not intended for account sharing, credential reselling, or circumventing OpenAI Terms of Service.

---

## 📄 License

MIT License. Developed with ❤️ for advanced AI coding workflows.
