import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn, exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = fs.existsSync(path.join(__dirname, "dist"))
  ? path.join(__dirname, "dist")
  : path.join(path.resolve(__dirname, ".."), "dist");
const BACKEND_PORT = 3211;
const WEB_PORT = parseInt(process.env.CODEX_SWITCHER_WEB_PORT || "3210", 10);
const WEB_HOST = process.env.CODEX_SWITCHER_WEB_HOST || "0.0.0.0";
const BINARY_PATH = "/Applications/Codex Switcher.app/Contents/MacOS/codex-web";
const NOTIFICATION_CONFIG_PATH = path.join(process.env.HOME || "", ".codex", "notification_config.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

// ==================== NOTIFICATION HELPERS ====================

function readNotificationConfig() {
  try {
    if (fs.existsSync(NOTIFICATION_CONFIG_PATH)) {
      const data = JSON.parse(fs.readFileSync(NOTIFICATION_CONFIG_PATH, "utf8"));
      return {
        telegram: {
          enabled: Boolean(data.telegram?.enabled),
          botToken: data.telegram?.botToken || "",
          chatId: data.telegram?.chatId || "",
        },
        ntfy: {
          enabled: Boolean(data.ntfy?.enabled),
          topic: data.ntfy?.topic || "",
          server: data.ntfy?.server || "https://ntfy.sh",
        },
        threshold: typeof data.threshold === "number" ? data.threshold : 80,
        cooldownMinutes: typeof data.cooldownMinutes === "number" ? data.cooldownMinutes : 60,
      };
    }
  } catch (err) {
    console.error("[Notification] Error reading config:", err.message);
  }
  return {
    telegram: { enabled: false, botToken: "", chatId: "" },
    ntfy: { enabled: false, topic: "", server: "https://ntfy.sh" },
    threshold: 80,
    cooldownMinutes: 60,
  };
}

function writeNotificationConfig(config) {
  try {
    const dir = path.dirname(NOTIFICATION_CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(NOTIFICATION_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
    return true;
  } catch (err) {
    console.error("[Notification] Error writing config:", err.message);
    return false;
  }
}

async function sendTelegramNotification({ botToken, chatId, text, parseMode = "Markdown", replyMarkup }) {
  if (!botToken || !chatId) {
    throw new Error("Vui lòng cung cấp đầy đủ Bot Token và Chat ID");
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(data.description || `Lỗi Telegram API (HTTP ${res.status})`);
  }
  return data;
}

async function sendNtfyNotification({ server = "https://ntfy.sh", topic, title, message, priority = "high", tags = ["warning", "bar_chart"], clickUrl, actions }) {
  if (!topic) throw new Error("Vui lòng cung cấp ntfy Topic");
  const base = server.replace(/\/+$/, "");
  const targetUrl = `${base}/${encodeURIComponent(topic)}`;
  const headers = {
    "Title": title || "Codex Switcher Alert",
    "Priority": priority,
    "Tags": Array.isArray(tags) ? tags.join(",") : tags,
  };
  if (clickUrl) headers["Click"] = clickUrl;
  if (actions) headers["Actions"] = actions;

  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: message,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lỗi ntfy.sh (HTTP ${res.status}): ${text}`);
  }
  return { ok: true };
}

let lastAlerts = {};

async function checkLowQuotaAndNotify() {
  try {
    const config = readNotificationConfig();
    if (!config.telegram.enabled && !config.ntfy.enabled) {
      return;
    }

    // Call backend to get active account info
    const activeRes = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/invoke/get_active_account_info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!activeRes.ok) return;
    const activeAccount = await activeRes.json();
    if (!activeAccount || !activeAccount.id) return;

    // Call backend to get usage for active account
    const usageRes = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/invoke/get_usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: activeAccount.id }),
    });
    if (!usageRes.ok) return;
    const usage = await usageRes.json();
    if (!usage || typeof usage.primary_used_percent !== "number") return;

    const used = usage.primary_used_percent;
    const remaining = Math.max(0, 100 - used);
    const threshold = config.threshold || 80;

    if (used >= threshold) {
      const now = Date.now();
      const last = lastAlerts[activeAccount.id];
      const cooldownMs = (config.cooldownMinutes || 60) * 60 * 1000;

      // Only notify if cooldown has passed or used percent increased significantly
      if (last && (now - last.time < cooldownMs) && (used <= last.used + 5)) {
        return;
      }

      let resetTimeText = "";
      if (usage.primary_resets_at) {
        const resetDate = new Date(usage.primary_resets_at * 1000);
        const diffMinutes = Math.max(0, Math.round((resetDate.getTime() - now) / 60000));
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        const timeStr = resetDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
        resetTimeText = `${timeStr} (sau ${hours > 0 ? `${hours}h ` : ""}${mins}m)`;
      }

      const dashboardUrl = "http://100.66.99.92:3210";

      // 1. Send Telegram if enabled
      if (config.telegram.enabled && config.telegram.botToken && config.telegram.chatId) {
        const tgText = `⚠️ *Cảnh báo: Hạn mức Codex sắp hết!*\n\n👤 *Tài khoản:* \`${activeAccount.name || activeAccount.email || "Active"}\`\n📊 *Đã sử dụng:* *${used.toFixed(0)}%* (Còn lại: *${remaining.toFixed(0)}%*)\n${resetTimeText ? `⏳ *Reset lúc:* ${resetTimeText}\n` : ""}\n💡 _Hãy mở Codex Switcher để đổi sang tài khoản khác hoặc lưu công việc._`;
        try {
          await sendTelegramNotification({
            botToken: config.telegram.botToken,
            chatId: config.telegram.chatId,
            text: tgText,
            replyMarkup: {
              inline_keyboard: [
                [
                  { text: "📱 Mở Codex Switcher", url: dashboardUrl }
                ]
              ]
            }
          });
          console.log(`[Notification] Sent Telegram low quota alert for ${activeAccount.name} (${used}%)`);
        } catch (tgErr) {
          console.error(`[Notification] Telegram alert error:`, tgErr.message);
        }
      }

      // 2. Send ntfy if enabled
      if (config.ntfy.enabled && config.ntfy.topic) {
        const ntfyTitle = `⚠️ Codex Quota thấp (${used.toFixed(0)}%) - ${activeAccount.name}`;
        const ntfyMsg = `Tài khoản "${activeAccount.name}" đã dùng ${used.toFixed(0)}% (còn ${remaining.toFixed(0)}%).${resetTimeText ? ` Reset: ${resetTimeText}.` : ""}`;
        try {
          await sendNtfyNotification({
            server: config.ntfy.server,
            topic: config.ntfy.topic,
            title: ntfyTitle,
            message: ntfyMsg,
            clickUrl: dashboardUrl,
            actions: `view, Mở Dashboard, ${dashboardUrl}`
          });
          console.log(`[Notification] Sent ntfy low quota alert for ${activeAccount.name} (${used}%)`);
        } catch (ntfyErr) {
          console.error(`[Notification] ntfy alert error:`, ntfyErr.message);
        }
      }

      lastAlerts[activeAccount.id] = { time: now, used };
    }
  } catch (err) {
    console.error("[Notification] Check low quota error:", err.message);
  }
}

// Periodic check every 60s
setInterval(() => {
  void checkLowQuotaAndNotify();
}, 60 * 1000);

// ==================== TAILSCALE HELPERS ====================

async function isTailscaleRunning() {
  try {
    const { stdout } = await execAsync("ps -axo command=");
    return stdout.includes("Tailscale.app") || stdout.includes("tailscaled");
  } catch {
    return false;
  }
}

async function ensureTailscaleRunning() {
  try {
    const running = await isTailscaleRunning();
    if (!running) {
      console.log("[Tailscale] Tailscale is not running. Launching Tailscale in background...");
      await execAsync("open -g -a Tailscale 2>/dev/null || open -g -a '/Applications/Tailscale.app' 2>/dev/null || true");
      console.log("[Tailscale] Launch command sent.");
    }
  } catch (err) {
    console.error("[Tailscale] Error checking/launching Tailscale:", err.message);
  }
}

async function openTailscaleApp() {
  try {
    await execAsync("open -g -a Tailscale 2>/dev/null || open -g -a '/Applications/Tailscale.app' 2>/dev/null || true");
    return { ok: true };
  } catch (err) {
    throw new Error(`Failed to open Tailscale: ${err.message}`);
  }
}

// ==================== PASEO & CODEX HELPERS ====================

async function getPaseoProcesses() {
  try {
    const { stdout } = await execAsync("ps -axo pid=,command=");
    const pids = [];
    for (const line of stdout.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      const pid = parseInt(parts[0], 10);
      const cmd = parts.slice(1).join(" ").toLowerCase();
      if (isNaN(pid) || pid === process.pid || cmd.includes("codex-switcher")) continue;
      if (
        cmd.includes("paseo.app") ||
        cmd.includes("/paseo") ||
        cmd.startsWith("paseo ") ||
        cmd === "paseo" ||
        cmd.includes("paseo helper") ||
        cmd.includes("paseo daemon") ||
        cmd.includes("paseo supervisor")
      ) {
        if (!pids.includes(pid)) pids.push(pid);
      }
    }
    return {
      count: pids.length,
      background_count: 0,
      can_switch: pids.length === 0,
      pids,
    };
  } catch {
    return { count: 0, background_count: 0, can_switch: true, pids: [] };
  }
}

async function killPaseoProcesses() {
  const info = await getPaseoProcesses();
  if (info.pids.length > 0) {
    try {
      await execAsync(`kill -9 ${info.pids.join(" ")} 2>/dev/null || true`);
    } catch {}
  }
  return {
    targeted_count: info.pids.length,
    killed_pids: info.pids,
    failed_pids: [],
  };
}

async function closePaseoApp() {
  try {
    await execAsync("osascript -e 'tell application id \"sh.paseo.desktop\" to quit' 2>/dev/null || osascript -e 'tell application \"Paseo\" to quit' 2>/dev/null || killall -15 Paseo 2>/dev/null || true");
    return { ok: true };
  } catch (err) {
    throw new Error(`Failed to close Paseo: ${err.message}`);
  }
}

async function openPaseoApp() {
  try {
    await execAsync("open -b sh.paseo.desktop 2>/dev/null || open -a Paseo");
    return null;
  } catch (err) {
    throw new Error(`Failed to open Paseo: ${err.message}`);
  }
}

async function openCodexApp() {
  try {
    await execAsync("open -b com.openai.codex 2>/dev/null || open -a Codex 2>/dev/null || open -a ChatGPT 2>/dev/null");
    return null;
  } catch (err) {
    throw new Error(`Failed to open Codex: ${err.message}`);
  }
}

// Initial Tailscale check and periodic keeper
void ensureTailscaleRunning();
setInterval(() => {
  void ensureTailscaleRunning();
}, 60 * 1000);

console.log(`Starting backend from ${BINARY_PATH} on port ${BACKEND_PORT}...`);
const backend = spawn(BINARY_PATH, [], {
  env: {
    ...process.env,
    CODEX_SWITCHER_WEB_HOST: "127.0.0.1",
    CODEX_SWITCHER_WEB_PORT: String(BACKEND_PORT),
  },
  stdio: ["ignore", "pipe", "pipe"],
});

backend.stdout.on("data", (data) => {
  process.stdout.write(`[backend] ${data}`);
});
backend.stderr.on("data", (data) => {
  process.stderr.write(`[backend err] ${data}`);
});

function cleanup() {
  backend.kill();
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", () => backend.kill());

// Helper to parse JSON body
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // ==================== NOTIFICATION ROUTES ====================

  if (url.pathname === "/api/invoke/get_notification_config") {
    try {
      const config = readNotificationConfig();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(config));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/save_notification_config") {
    try {
      const payload = await parseRequestBody(req);
      writeNotificationConfig(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/get_telegram_chat_id") {
    try {
      const payload = await parseRequestBody(req);
      const botToken = payload.botToken;
      if (!botToken) throw new Error("Vui lòng nhập Bot Token trước");
      const url = `https://api.telegram.org/bot${botToken}/getUpdates`;
      const tgRes = await fetch(url);
      const tgData = await tgRes.json();
      if (!tgData.ok) {
        throw new Error(tgData.description || `Lỗi Telegram API (${tgRes.status})`);
      }
      const updates = tgData.result || [];
      if (updates.length === 0) {
        throw new Error("Chưa nhận được tin nhắn nào. Hãy mở Bot trên Telegram và bấm START hoặc gửi 1 tin nhắn bất kỳ cho Bot trước!");
      }
      const last = updates[updates.length - 1];
      const chat = last.message?.chat || last.my_chat_member?.chat || last.channel_post?.chat || last.callback_query?.message?.chat;
      if (!chat || !chat.id) {
        throw new Error("Không tìm thấy Chat ID. Hãy gửi tin nhắn mới cho Bot rồi bấm lại!");
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        chatId: String(chat.id),
        name: chat.first_name || chat.title || chat.username || "",
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/test_telegram_notification") {
    try {
      const payload = await parseRequestBody(req);
      const botToken = payload.botToken;
      const chatId = payload.chatId;
      const dashboardUrl = "http://100.66.99.92:3210";
      const tgText = `🔔 *Codex Switcher - Thông báo thử nghiệm*\n\n✅ Cấu hình Telegram của bạn đang hoạt động bình thường!\n\n_Hệ thống sẽ gửi cảnh báo đến đây khi hạn mức của tài khoản active xuống thấp._`;
      
      const result = await sendTelegramNotification({
        botToken,
        chatId,
        text: tgText,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: "📱 Mở Codex Switcher", url: dashboardUrl }
            ]
          ]
        }
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/test_ntfy_notification") {
    try {
      const payload = await parseRequestBody(req);
      const serverUrl = payload.server || "https://ntfy.sh";
      const topic = payload.topic;
      const dashboardUrl = "http://100.66.99.92:3210";
      
      const result = await sendNtfyNotification({
        server: serverUrl,
        topic,
        title: "🔔 Codex Switcher - Test Notification",
        message: "Cấu hình ntfy.sh của bạn đang hoạt động bình thường!",
        tags: ["white_check_mark", "robot"],
        clickUrl: dashboardUrl,
        actions: `view, Mở Dashboard, ${dashboardUrl}`
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ==================== APP & PROCESS ROUTES ====================

  if (url.pathname === "/api/invoke/check_tailscale") {
    try {
      const running = await isTailscaleRunning();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ is_running: running }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/open_tailscale") {
    try {
      const result = await openTailscaleApp();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/open_codex_app") {
    try {
      const result = await openCodexApp();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/open_paseo_app") {
    try {
      const result = await openPaseoApp();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/close_paseo_app") {
    try {
      const result = await closePaseoApp();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/check_paseo_processes") {
    try {
      const result = await getPaseoProcesses();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/kill_paseo_processes") {
    try {
      const result = await killPaseoProcesses();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Proxy remaining /api/* calls to backend binary
  if (url.pathname.startsWith("/api/")) {
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${BACKEND_PORT}`,
        },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on("error", (err) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Backend connection failed: ${err.message}` }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  let safePath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(DIST_DIR, safePath === "/" ? "index.html" : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (path.extname(safePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";

  res.writeHead(200, {
    "Content-Type": mime,
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(WEB_PORT, WEB_HOST, () => {
  console.log(`Codex Switcher Web Dashboard is running at http://${WEB_HOST}:${WEB_PORT}`);
  console.log(`Serving static files from ${DIST_DIR}`);
});
