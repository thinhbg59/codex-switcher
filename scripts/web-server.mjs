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
const DASHBOARD_URL = "http://100.66.99.92:3210";
const BINARY_PATH = "/Applications/Codex Switcher.app/Contents/MacOS/codex-web";
const NOTIFICATION_CONFIG_PATH = path.join(process.env.HOME || "", ".codex", "notification_config.json");
const PASEO_CLI_PATH = fs.existsSync(path.join(process.env.HOME || "", ".local", "bin", "paseo"))
  ? path.join(process.env.HOME || "", ".local", "bin", "paseo")
  : "paseo";

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

// ==================== BACKEND INVOKER ====================

async function invokeBackendApi(command, payload = {}) {
  const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/invoke/${command}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error (${res.status}): ${text}`);
  }
  return await res.json();
}

// ==================== NOTIFICATION CONFIG & HELPERS ====================

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
        autoSwitch: {
          enabled: Boolean(data.autoSwitch?.enabled),
          threshold: typeof data.autoSwitch?.threshold === "number" ? data.autoSwitch.threshold : 95,
        },
        autoResumePaseo: data.autoResumePaseo !== undefined ? Boolean(data.autoResumePaseo) : true,
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
    autoSwitch: { enabled: false, threshold: 95 },
    autoResumePaseo: true,
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

function formatResetDuration(resetTimestamp) {
  if (!resetTimestamp) return null;
  const now = Date.now();
  const resetDate = new Date(resetTimestamp * 1000);
  const diffMinutes = Math.max(0, Math.round((resetDate.getTime() - now) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  const timeStr = resetDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${timeStr} (sau ${hours > 0 ? `${hours}h ` : ""}${mins}m)`;
}

async function sendTelegramNotification({ botToken, chatId, text, parseMode = "Markdown", replyMarkup }) {
  if (!botToken || !chatId) {
    throw new Error("Vui lòng cung cấp đầy đủ Bot Token và Chat ID");
  }
  const params = new URLSearchParams({
    chat_id: String(chatId),
    text: text || "",
    parse_mode: parseMode,
  });
  if (replyMarkup) {
    params.append("reply_markup", typeof replyMarkup === "string" ? replyMarkup : JSON.stringify(replyMarkup));
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage?${params.toString()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.description || `Lỗi Telegram API (HTTP ${res.status})`);
    }
    return data;
  } catch (err) {
    // Fallback to POST if query string is too large
    const postUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const body = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const postRes = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const postData = await postRes.json();
    if (!postData.ok) {
      throw new Error(postData.description || `Lỗi Telegram API (HTTP ${postRes.status})`);
    }
    return postData;
  }
}

async function answerTelegramCallbackQuery(botToken, callbackQueryId, text = "") {
  try {
    const params = new URLSearchParams({
      callback_query_id: String(callbackQueryId),
    });
    if (text) params.append("text", text);
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery?${params.toString()}`;
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {}
}

async function sendNtfyNotification({ server = "https://ntfy.sh", topic, title, message, priority = 4, tags = ["warning", "bar_chart"], clickUrl, actions }) {
  if (!topic) throw new Error("Vui lòng cung cấp ntfy Topic");
  const base = server.replace(/\/+$/, "");
  const targetUrl = `${base}/`;

  const payload = {
    topic,
    title: title || "Codex Switcher Alert",
    message: message || "",
    priority: typeof priority === "number" ? priority : (priority === "high" ? 4 : 3),
    tags: Array.isArray(tags) ? tags : [tags],
  };

  if (clickUrl) {
    payload.click = clickUrl;
  }
  if (actions) {
    payload.actions = actions;
  }

  const res = await fetch(targetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lỗi ntfy.sh (HTTP ${res.status}): ${text}`);
  }
  return { ok: true };
}

// ==================== PASEO ERROR DETECTION & AUTO RESUME ====================

function detectPaseoQuotaErrors() {
  const agentsBase = path.join(process.env.HOME || "", ".paseo", "agents");
  if (!fs.existsSync(agentsBase)) return [];
  const workspaces = fs.readdirSync(agentsBase);
  const errored = [];

  for (const wks of workspaces) {
    const wksPath = path.join(agentsBase, wks);
    try {
      if (!fs.statSync(wksPath).isDirectory()) continue;
      const files = fs.readdirSync(wksPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(wksPath, file);
        try {
          const stats = fs.statSync(filePath);
          const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
          const err = data.lastError || "";
          if (
            err.includes("usage limit") ||
            err.includes("hit your usage limit") ||
            err.includes("purchase more credits") ||
            err.includes("rate limit") ||
            err.includes("Quota exceeded")
          ) {
            errored.push({
              id: data.id,
              title: data.title || "Cuộc trò chuyện Paseo",
              updatedAt: data.updatedAt,
              mtime: stats.mtime.getTime(),
              lastError: err,
              cwd: data.cwd,
            });
          }
        } catch {}
      }
    } catch {}
  }

  errored.sort((a, b) => b.mtime - a.mtime);
  return errored;
}

let lastHandledPaseoErrors = {};

async function switchAccountAndRestartPaseo(targetAccountId = null) {
  const allAccounts = await invokeBackendApi("list_accounts").catch(() => []);
  const activeAccount = await invokeBackendApi("get_active_account_info").catch(() => null);

  let target = null;
  if (targetAccountId) {
    target = allAccounts.find((a) => a.id === targetAccountId);
  } else {
    // Pick best alternative account
    const otherAccounts = allAccounts.filter((a) => a.id !== activeAccount?.id);
    if (otherAccounts.length === 0) {
      throw new Error("Không có tài khoản khác để chuyển đổi.");
    }
    const candidatesWithUsage = [];
    for (const acc of otherAccounts) {
      try {
        const u = await invokeBackendApi("get_usage", { accountId: acc.id });
        candidatesWithUsage.push({
          account: acc,
          usage: u,
          used: typeof u?.primary_used_percent === "number" ? u.primary_used_percent : 0,
        });
      } catch {
        candidatesWithUsage.push({ account: acc, usage: null, used: 100 });
      }
    }
    candidatesWithUsage.sort((a, b) => a.used - b.used);
    target = candidatesWithUsage[0].account;
  }

  if (!target) {
    throw new Error("Không tìm thấy tài khoản mục tiêu.");
  }

  // 1. Close Paseo gracefully
  await closePaseoApp().catch(() => {});
  await new Promise((r) => setTimeout(r, 600));

  // Check if Paseo is still running, force kill if needed
  const info = await getPaseoProcesses();
  if (info.count > 0) {
    await killPaseoProcesses().catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  }

  // 2. Switch account
  await invokeBackendApi("switch_account", { accountId: target.id });
  await new Promise((r) => setTimeout(r, 1000));

  // 3. Re-open Paseo
  await openPaseoApp().catch(() => {});

  const usage = await invokeBackendApi("get_usage", { accountId: target.id }).catch(() => null);
  return {
    switchedTo: target,
    usage,
  };
}

async function hotReloadAccountForPaseo(targetAccountId = null) {
  const allAccounts = await invokeBackendApi("list_accounts").catch(() => []);
  const activeAccount = await invokeBackendApi("get_active_account_info").catch(() => null);

  let target = null;
  if (targetAccountId) {
    target = allAccounts.find((a) => a.id === targetAccountId);
  } else {
    // Pick best alternative account
    const otherAccounts = allAccounts.filter((a) => a.id !== activeAccount?.id);
    if (otherAccounts.length === 0) {
      throw new Error("Không có tài khoản khác để chuyển đổi.");
    }
    const candidatesWithUsage = [];
    for (const acc of otherAccounts) {
      try {
        const u = await invokeBackendApi("get_usage", { accountId: acc.id });
        candidatesWithUsage.push({
          account: acc,
          usage: u,
          used: typeof u?.primary_used_percent === "number" ? u.primary_used_percent : 0,
        });
      } catch {
        candidatesWithUsage.push({ account: acc, usage: null, used: 100 });
      }
    }
    candidatesWithUsage.sort((a, b) => a.used - b.used);
    target = candidatesWithUsage[0].account;
  }

  if (!target) {
    throw new Error("Không tìm thấy tài khoản mục tiêu.");
  }

  // 1. Switch account in Codex Switcher (updates ~/.codex/auth.json)
  await invokeBackendApi("switch_account", { accountId: target.id });

  // 2. Terminate old codex worker processes so Paseo spawns a new worker with fresh credentials
  try {
    await execAsync('pkill -f "codex app-server" 2>/dev/null || killall -9 codex 2>/dev/null || true');
  } catch {}

  // 3. In-place reload Paseo daemon configuration
  try {
    await execAsync(`"${PASEO_CLI_PATH}" daemon reload`);
    console.log("[PaseoAutoResume] In-place daemon config reloaded successfully.");
  } catch (err) {
    console.log("[PaseoAutoResume] Daemon reload warning:", err.message);
  }

  // 4. Ensure Paseo is running
  const info = await getPaseoProcesses();
  if (info.count === 0) {
    await openPaseoApp().catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
  }

  const usage = await invokeBackendApi("get_usage", { accountId: target.id }).catch(() => null);
  return {
    switchedTo: target,
    usage,
  };
}

async function autoResumePaseoTask({ targetAgentId = null, targetAccountId = null, promptMessage = "tiếp tục", restartPaseo = false } = {}) {
  // 1. Detect ALL target agents with quota errors
  let targetAgents = [];
  const erroredList = detectPaseoQuotaErrors();

  if (targetAgentId) {
    const single = erroredList.find((a) => a.id === targetAgentId) || { id: targetAgentId, title: "Paseo Agent" };
    targetAgents = [single];
  } else if (erroredList.length > 0) {
    targetAgents = erroredList;
  }

  // 2. Switch account: In-place Hot Reload vs Full Restart
  let switchRes;
  if (restartPaseo) {
    switchRes = await switchAccountAndRestartPaseo(targetAccountId);
    await new Promise((r) => setTimeout(r, 3500));
  } else {
    switchRes = await hotReloadAccountForPaseo(targetAccountId);
    await new Promise((r) => setTimeout(r, 800));
  }

  const switchedTo = switchRes.switchedTo;
  const newUsed = typeof switchRes.usage?.primary_used_percent === "number" ? switchRes.usage.primary_used_percent : 0;
  const newRemaining = Math.max(0, 100 - newUsed);

  // 3. Send prompt to ALL errored agents
  const results = [];
  for (const agent of targetAgents) {
    if (!agent.id) continue;
    let messageSent = false;
    let sendError = null;
    try {
      console.log(`[PaseoAutoResume] Sending prompt "${promptMessage}" to agent ${agent.id} (${agent.title || ""})...`);
      await execAsync(`"${PASEO_CLI_PATH}" send ${agent.id} "${promptMessage.replace(/"/g, '\\"')}" --no-wait`);
      messageSent = true;
      console.log(`[PaseoAutoResume] Prompt sent successfully to agent ${agent.id}`);
    } catch (err) {
      sendError = err.message;
      console.error(`[PaseoAutoResume] Failed to send prompt to ${agent.id}:`, err.message);
    }
    lastHandledPaseoErrors[agent.id] = Date.now();
    results.push({ agent, messageSent, sendError });
  }

  // 4. Notify via Telegram & ntfy
  const config = readNotificationConfig();
  if (config.telegram?.enabled && config.telegram?.botToken && config.telegram?.chatId) {
    const resumedListText = results.length > 0
      ? results.map((r, i) => `${i + 1}. \`${r.agent.title || r.agent.id}\``).join("\n")
      : "_Tất cả các tab_";

    const tgMsg = `🚀 *ĐÃ TỰ ĐỘNG KHÔI PHỤC ${results.length} CUỘC TRÒ CHUYỆN TRÊN PASEO!*\n\n📝 *Các tab được tiếp tục:*\n${resumedListText}\n\n✅ *Tài khoản mới:* \`${switchedTo.name}\` (Còn *${newRemaining.toFixed(0)}%* quota)\n💬 *Tin nhắn gửi đi:* \`${promptMessage}\`\n\n👉 _Paseo đang tiếp tục xử lý song song tất cả các tab!_`;

    await sendTelegramNotification({
      botToken: config.telegram.botToken,
      chatId: config.telegram.chatId,
      text: tgMsg,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "📋 Danh sách tài khoản", callback_data: "cmd_list" }],
          [{ text: "📱 Mở Dashboard", url: DASHBOARD_URL }],
        ],
      },
    }).catch(() => {});
  }

  if (config.ntfy?.enabled && config.ntfy?.topic) {
    await sendNtfyNotification({
      server: config.ntfy.server,
      topic: config.ntfy.topic,
      title: `🚀 Tiếp tục ${results.length} tab Paseo: ${switchedTo.name}`,
      message: `Đã đổi sang ${switchedTo.name} (còn ${newRemaining.toFixed(0)}%) và tiếp tục ${results.length} cuộc trò chuyện.`,
      tags: ["rocket", "white_check_mark"],
      clickUrl: DASHBOARD_URL,
    }).catch(() => {});
  }

  return {
    ok: true,
    targetAgents,
    resumedCount: results.length,
    results,
    switchedTo,
    usage: switchRes.usage,
  };
}

// Background monitor for Paseo Quota Errors (runs every 10s)
setInterval(async () => {
  try {
    const config = readNotificationConfig();
    if (!config.autoResumePaseo && !config.autoSwitch?.enabled) return;

    const errored = detectPaseoQuotaErrors();
    if (errored.length === 0) return;

    const now = Date.now();
    // Filter to unhandled errors in the last 3 minutes
    const newlyErrored = errored.filter((a) => {
      if (now - a.mtime > 3 * 60 * 1000) return false;
      const lastHandled = lastHandledPaseoErrors[a.id];
      return !lastHandled || now - lastHandled > 3 * 60 * 1000;
    });

    if (newlyErrored.length > 0) {
      console.log(`[PaseoMonitor] Detected ${newlyErrored.length} Paseo agent(s) with quota error. Resuming all...`);
      for (const a of newlyErrored) {
        lastHandledPaseoErrors[a.id] = now;
      }
      await autoResumePaseoTask();
    }
  } catch (err) {
    console.error("[PaseoMonitor] Check error:", err.message);
  }
}, 10 * 1000);

// ==================== AUTO-SWITCH & LOW QUOTA MONITOR ====================

let lastAlerts = {};

async function checkLowQuotaAndNotify() {
  try {
    const config = readNotificationConfig();
    const activeAccount = await invokeBackendApi("get_active_account_info").catch(() => null);
    if (!activeAccount || !activeAccount.id) return;

    const usage = await invokeBackendApi("get_usage", { accountId: activeAccount.id }).catch(() => null);
    if (!usage || typeof usage.primary_used_percent !== "number") return;

    const used = usage.primary_used_percent;
    const remaining = Math.max(0, 100 - used);
    const threshold = config.threshold || 80;
    const autoSwitchThreshold = config.autoSwitch?.threshold || 95;

    // 1. AUTO-SWITCH CHECK
    if (config.autoSwitch?.enabled && used >= autoSwitchThreshold) {
      const allAccounts = await invokeBackendApi("list_accounts").catch(() => []);
      const otherAccounts = allAccounts.filter((a) => a.id !== activeAccount.id);

      if (otherAccounts.length > 0) {
        // Fetch usage for other accounts
        const candidatesWithUsage = [];
        for (const candidate of otherAccounts) {
          try {
            const candUsage = await invokeBackendApi("get_usage", { accountId: candidate.id });
            const candUsed = typeof candUsage?.primary_used_percent === "number" ? candUsage.primary_used_percent : 0;
            candidatesWithUsage.push({ account: candidate, usage: candUsage, used: candUsed });
          } catch {
            candidatesWithUsage.push({ account: candidate, usage: null, used: 100 });
          }
        }

        // Sort by lowest usage first
        candidatesWithUsage.sort((a, b) => a.used - b.used);
        const bestCandidate = candidatesWithUsage[0];

        if (bestCandidate && bestCandidate.used < autoSwitchThreshold) {
          console.log(`[AutoSwitch] Switching from ${activeAccount.name} (${used}%) to ${bestCandidate.account.name} (${bestCandidate.used}%)...`);
          await invokeBackendApi("switch_account", { accountId: bestCandidate.account.id });

          const candRemaining = Math.max(0, 100 - bestCandidate.used);
          const candResetText = formatResetDuration(bestCandidate.usage?.primary_resets_at);

          // Notify via Telegram
          if (config.telegram?.enabled && config.telegram?.botToken && config.telegram?.chatId) {
            const tgMsg = `🔄 *TỰ ĐỘNG CHUYỂN TÀI KHOẢN THÀNH CÔNG!*\n\n⚠️ *Tài khoản cũ:* \`${activeAccount.name}\` (Đã dùng ${used.toFixed(0)}%)\n✅ *Tài khoản mới:* \`${bestCandidate.account.name}\`\n📊 *Hạn mức mới:* Đã dùng *${bestCandidate.used.toFixed(0)}%* (Còn lại: *${candRemaining.toFixed(0)}%*)\n${candResetText ? `⏳ *Reset:* ${candResetText}\n` : ""}\n👉 _Codex đã được chuyển sang tài khoản mới tự động để không bị ngắt quãng._`;
            await sendTelegramNotification({
              botToken: config.telegram.botToken,
              chatId: config.telegram.chatId,
              text: tgMsg,
              replyMarkup: {
                inline_keyboard: [[{ text: "📱 Mở Dashboard", url: DASHBOARD_URL }]],
              },
            }).catch((e) => console.error("[AutoSwitch] Telegram error:", e.message));
          }

          // Notify via ntfy
          if (config.ntfy?.enabled && config.ntfy?.topic) {
            await sendNtfyNotification({
              server: config.ntfy.server,
              topic: config.ntfy.topic,
              title: `🔄 Tự động chuyển: ${bestCandidate.account.name}`,
              message: `Đã tự động đổi sang ${bestCandidate.account.name} (còn ${candRemaining.toFixed(0)}%) do ${activeAccount.name} đạt ${used.toFixed(0)}%.`,
              tags: ["repeat", "white_check_mark"],
              clickUrl: DASHBOARD_URL,
            }).catch((e) => console.error("[AutoSwitch] ntfy error:", e.message));
          }

          lastAlerts[activeAccount.id] = { time: Date.now(), used };
          return;
        }
      }
    }

    // 2. REGULAR LOW-QUOTA ALERT
    if ((config.telegram.enabled || config.ntfy.enabled) && used >= threshold) {
      const now = Date.now();
      const last = lastAlerts[activeAccount.id];
      const cooldownMs = (config.cooldownMinutes || 60) * 60 * 1000;

      if (last && now - last.time < cooldownMs && used <= last.used + 5) {
        return;
      }

      const resetTimeText = formatResetDuration(usage.primary_resets_at);

      // Fetch other accounts for quick-switch inline buttons
      const allAccounts = await invokeBackendApi("list_accounts").catch(() => []);
      const otherAccounts = allAccounts.filter((a) => a.id !== activeAccount.id);
      const switchButtons = [];

      switchButtons.push([
        { text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" },
      ]);

      for (let i = 0; i < Math.min(3, otherAccounts.length); i++) {
        const acc = otherAccounts[i];
        const shortName = acc.name.length > 20 ? acc.name.substring(0, 18) + ".." : acc.name;
        switchButtons.push([{ text: `🔄 Đổi & Restart Paseo: ${shortName}`, callback_data: `switch_restart:${acc.id}` }]);
      }
      switchButtons.push([{ text: "📱 Mở Dashboard", url: DASHBOARD_URL }]);

      // Telegram notification
      if (config.telegram.enabled && config.telegram.botToken && config.telegram.chatId) {
        const tgText = `⚠️ *Cảnh báo: Hạn mức Codex sắp hết!*\n\n👤 *Tài khoản:* \`${activeAccount.name}\`\n📊 *Đã sử dụng:* *${used.toFixed(0)}%* (Còn lại: *${remaining.toFixed(0)}%*)\n${resetTimeText ? `⏳ *Reset lúc:* ${resetTimeText}\n` : ""}\n💡 _Bấm nút bên dưới để đổi tài khoản & tiếp tục chat trên Paseo:_`;
        try {
          await sendTelegramNotification({
            botToken: config.telegram.botToken,
            chatId: config.telegram.chatId,
            text: tgText,
            replyMarkup: {
              inline_keyboard: switchButtons,
            },
          });
          console.log(`[Notification] Sent Telegram low quota alert for ${activeAccount.name} (${used}%)`);
        } catch (tgErr) {
          console.error(`[Notification] Telegram alert error:`, tgErr.message);
        }
      }

      // ntfy notification
      if (config.ntfy.enabled && config.ntfy.topic) {
        const ntfyTitle = `⚠️ Codex Quota thấp (${used.toFixed(0)}%) - ${activeAccount.name}`;
        const ntfyMsg = `Tài khoản "${activeAccount.name}" đã dùng ${used.toFixed(0)}% (còn ${remaining.toFixed(0)}%).${resetTimeText ? ` Reset: ${resetTimeText}.` : ""}`;
        try {
          await sendNtfyNotification({
            server: config.ntfy.server,
            topic: config.ntfy.topic,
            title: ntfyTitle,
            message: ntfyMsg,
            clickUrl: DASHBOARD_URL,
            actions: [{ action: "view", label: "📱 Mở Dashboard", url: DASHBOARD_URL }],
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

// ==================== TELEGRAM INTERACTIVE BOT POLLING ====================

let tgPollingOffset = 0;
let isPollingActive = false;

async function handleTelegramMessage(msg, botToken, config) {
  const chatId = msg.chat?.id;
  const text = (msg.text || "").trim();
  if (!chatId || !text) return;

  const lower = text.toLowerCase();

  // 1. /start, /help
  if (lower === "/start" || lower === "/help") {
    const active = await invokeBackendApi("get_active_account_info").catch(() => null);
    const welcome = `👋 *Xin chào! Tôi là Bot điều khiển Codex Switcher.*\n\n⚡ *Tài khoản active:* \`${active?.name || "Chưa chọn"}\`\n\n📱 *Các lệnh điều khiển:*\n• /resume\\_paseo (hoặc /tieptuc) - Tự đổi tài khoản & gửi 'tiếp tục' trên Paseo\n• /restart\\_paseo - Đổi tài khoản & khởi động lại Paseo\n• /list - Danh sách tài khoản & nút chuyển nhanh\n• /active - Xem chi tiết hạn mức tài khoản hiện tại\n• /switch <số hoặc tên> - Chuyển sang tài khoản\n• /warmup - Warm up tất cả tài khoản\n• /paseo - Trạng thái & Mở/Đóng app Paseo\n• /codex - Trạng thái & Mở/Đóng app Codex\n\n👉 _Hoặc bấm các nút bên dưới:_`;

    await sendTelegramNotification({
      botToken,
      chatId,
      text: welcome,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" },
          ],
          [
            { text: "🔄 Đổi Acc & Restart Paseo", callback_data: "cmd_auto_switch_restart_paseo" },
          ],
          [
            { text: "📋 Danh sách tài khoản", callback_data: "cmd_list" },
            { text: "⚡ Tài khoản Active", callback_data: "cmd_active" },
          ],
          [
            { text: "🔥 Warm Up All", callback_data: "cmd_warmup" },
            { text: "🚀 Mở Paseo", callback_data: "cmd_open_paseo" },
          ],
          [{ text: "📱 Mở Web Dashboard", url: DASHBOARD_URL }],
        ],
      },
    });
    return;
  }

  // 2. /resume_paseo, /continue_paseo, /tieptuc
  if (lower === "/resume_paseo" || lower === "/continue_paseo" || lower === "/tieptuc" || lower === "tieptuc") {
    await performAutoResumePaseoNotify(botToken, chatId, null);
    return;
  }

  // 3. /restart_paseo, /switch_restart
  if (lower === "/restart_paseo" || lower === "/switch_restart" || lower === "switch_restart" || lower === "restart_paseo") {
    await performSwitchAndRestartPaseoNotify(botToken, chatId, null);
    return;
  }

  if (lower.startsWith("/switch_restart ") || lower.startsWith("/restart_paseo ")) {
    const query = text.replace(/^\/(switch_restart|restart_paseo)\s+/i, "").trim();
    const accounts = await invokeBackendApi("list_accounts").catch(() => []);
    let target = null;
    const index = parseInt(query, 10);
    if (!isNaN(index) && index >= 1 && index <= accounts.length) {
      target = accounts[index - 1];
    } else {
      target = accounts.find((a) =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        (a.email && a.email.toLowerCase().includes(query.toLowerCase()))
      );
    }
    if (!target) {
      await sendTelegramNotification({
        botToken,
        chatId,
        text: `❌ Không tìm thấy tài khoản khớp với: *"${query}"*.\nGõ /list để xem danh sách tài khoản.`,
      });
      return;
    }
    await performSwitchAndRestartPaseoNotify(botToken, chatId, target.id);
    return;
  }

  // 4. /list, /accounts
  if (lower === "/list" || lower === "/accounts") {
    await sendAccountsListMessage(botToken, chatId);
    return;
  }

  // 5. /active, /status
  if (lower === "/active" || lower === "/status") {
    await sendActiveAccountStatusMessage(botToken, chatId);
    return;
  }

  // 6. /warmup
  if (lower === "/warmup") {
    await invokeBackendApi("warmup_all_accounts").catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "🔥 *Đã gửi tín hiệu Warm-up đến toàn bộ các tài khoản thành công!*",
      replyMarkup: {
        inline_keyboard: [[{ text: "📋 Xem danh sách tài khoản", callback_data: "cmd_list" }]],
      },
    });
    return;
  }

  // 7. /paseo
  if (lower === "/paseo") {
    const paseoInfo = await getPaseoProcesses();
    const isRunning = paseoInfo.count > 0;
    const msgText = isRunning
      ? `🟢 *Paseo đang chạy* (${paseoInfo.count} tiến trình)`
      : `⚪ *Paseo đang tắt* (0 tiến trình)`;

    const buttons = [
      [{ text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" }],
      [{ text: "🔄 Đổi Acc & Restart Paseo", callback_data: "cmd_auto_switch_restart_paseo" }],
      isRunning
        ? [
            { text: "❌ Đóng Paseo", callback_data: "cmd_close_paseo" },
            { text: "⛔ Force Close", callback_data: "cmd_kill_paseo" },
          ]
        : [{ text: "🚀 Mở Paseo", callback_data: "cmd_open_paseo" }],
    ];

    await sendTelegramNotification({
      botToken,
      chatId,
      text: msgText,
      replyMarkup: { inline_keyboard: buttons },
    });
    return;
  }

  // 8. /codex
  if (lower === "/codex") {
    const codexInfo = await invokeBackendApi("check_codex_processes").catch(() => ({ count: 0 }));
    const isRunning = codexInfo.count > 0;
    const msgText = isRunning
      ? `🟢 *Codex đang chạy* (${codexInfo.count} tiến trình)`
      : `⚪ *Codex đang tắt* (0 tiến trình)`;

    const buttons = isRunning
      ? [[{ text: "⛔ Force Close Codex", callback_data: "cmd_kill_codex" }]]
      : [[{ text: "🚀 Mở Codex", callback_data: "cmd_open_codex" }]];

    await sendTelegramNotification({
      botToken,
      chatId,
      text: msgText,
      replyMarkup: { inline_keyboard: buttons },
    });
    return;
  }

  // 9. /switch <query>
  if (lower.startsWith("/switch ") || lower.startsWith("switch ")) {
    const query = text.replace(/^\/?switch\s+/i, "").trim();
    if (!query) {
      await sendTelegramNotification({
        botToken,
        chatId,
        text: "❓ Vui lòng nhập số thứ tự hoặc tên tài khoản. Ví dụ: `/switch 2` hoặc `/switch ngovan`",
      });
      return;
    }

    const accounts = await invokeBackendApi("list_accounts").catch(() => []);
    let target = null;

    const index = parseInt(query, 10);
    if (!isNaN(index) && index >= 1 && index <= accounts.length) {
      target = accounts[index - 1];
    } else {
      target = accounts.find((a) =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        (a.email && a.email.toLowerCase().includes(query.toLowerCase()))
      );
    }

    if (!target) {
      await sendTelegramNotification({
        botToken,
        chatId,
        text: `❌ Không tìm thấy tài khoản khớp với: *"${query}"*.\nGõ /list để xem danh sách tài khoản.`,
      });
      return;
    }

    await performSwitchAndNotify(botToken, chatId, target.id);
    return;
  }
}

async function sendAccountsListMessage(botToken, chatId) {
  const accounts = await invokeBackendApi("list_accounts").catch(() => []);
  if (accounts.length === 0) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "⚠️ Hiện chưa có tài khoản nào được lưu trong Codex Switcher.",
    });
    return;
  }

  let textLines = ["📋 *DANH SÁCH TÀI KHOẢN CODEX*\n"];
  const inlineButtons = [];

  inlineButtons.push([
    { text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" },
  ]);
  inlineButtons.push([
    { text: "🔄 Tự đổi Acc tốt nhất & Restart Paseo", callback_data: "cmd_auto_switch_restart_paseo" },
  ]);

  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const num = i + 1;
    let usageInfo = null;
    try {
      usageInfo = await invokeBackendApi("get_usage", { accountId: acc.id });
    } catch {}

    const used = typeof usageInfo?.primary_used_percent === "number" ? usageInfo.primary_used_percent : null;
    const remaining = used !== null ? Math.max(0, 100 - used) : null;
    const resetText = formatResetDuration(usageInfo?.primary_resets_at);

    if (acc.is_active) {
      textLines.push(`🟢 *${num}. ${acc.name}* [ACTIVE]`);
      if (used !== null) {
        textLines.push(`   📊 Đã dùng: *${used.toFixed(0)}%* (Còn: ${remaining.toFixed(0)}%)${resetText ? ` | Reset: ${resetText}` : ""}\n`);
      }
      inlineButtons.push([{ text: `🟢 ${num}. ${acc.name} (Active)`, callback_data: `switch:${acc.id}` }]);
    } else {
      textLines.push(`⚪ *${num}. ${acc.name}*`);
      if (used !== null) {
        textLines.push(`   📊 Đã dùng: *${used.toFixed(0)}%* (Còn: ${remaining.toFixed(0)}%)${resetText ? ` | Reset: ${resetText}` : ""}\n`);
      }
      const shortTitle = `🔄 ${num}. ${acc.name}${used !== null ? ` (${used.toFixed(0)}%)` : ""}`;
      inlineButtons.push([
        { text: shortTitle, callback_data: `switch:${acc.id}` },
        { text: "⚡ + Paseo", callback_data: `switch_restart:${acc.id}` },
      ]);
    }
  }

  textLines.push("👉 _Bấm nút bên dưới để chuyển tài khoản ngay lập tức:_");
  inlineButtons.push([{ text: "📱 Mở Web Dashboard", url: DASHBOARD_URL }]);

  await sendTelegramNotification({
    botToken,
    chatId,
    text: textLines.join("\n"),
    replyMarkup: { inline_keyboard: inlineButtons },
  });
}

async function sendActiveAccountStatusMessage(botToken, chatId) {
  const active = await invokeBackendApi("get_active_account_info").catch(() => null);
  if (!active || !active.id) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "⚠️ Hiện chưa có tài khoản nào đang active.",
    });
    return;
  }

  const usage = await invokeBackendApi("get_usage", { accountId: active.id }).catch(() => null);
  const used5h = typeof usage?.primary_used_percent === "number" ? usage.primary_used_percent : 0;
  const rem5h = Math.max(0, 100 - used5h);
  const reset5h = formatResetDuration(usage?.primary_resets_at);

  const used7d = typeof usage?.secondary_used_percent === "number" ? usage.secondary_used_percent : null;
  const rem7d = used7d !== null ? Math.max(0, 100 - used7d) : null;
  const reset7d = formatResetDuration(usage?.secondary_resets_at);

  const text = `⚡ *THÔNG TIN TÀI KHOẢN ACTIVE*\n\n👤 *Tên:* \`${active.name}\`\n📧 *Email:* \`${active.email || "N/A"}\`\n👑 *Gói:* *${(active.plan_type || "Plus").toUpperCase()}*\n\n📊 *Hạn mức 5h:* Đã dùng *${used5h.toFixed(0)}%* (Còn lại: *${rem5h.toFixed(0)}%*)\n${reset5h ? `⏳ *Reset 5h:* ${reset5h}\n` : ""}${used7d !== null ? `\n📈 *Hạn mức 7 ngày:* Đã dùng *${used7d.toFixed(0)}%* (Còn lại: *${rem7d.toFixed(0)}%*)\n${reset7d ? `⏳ *Reset 7d:* ${reset7d}\n` : ""}` : ""}`;

  await sendTelegramNotification({
    botToken,
    chatId,
    text,
    replyMarkup: {
      inline_keyboard: [
        [{ text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" }],
        [{ text: "🔄 Tự đổi Acc & Restart Paseo", callback_data: "cmd_auto_switch_restart_paseo" }],
        [{ text: "📋 Danh sách tài khoản", callback_data: "cmd_list" }],
        [{ text: "📱 Mở Web Dashboard", url: DASHBOARD_URL }],
      ],
    },
  });
}

async function performSwitchAndNotify(botToken, chatId, accountId) {
  try {
    await invokeBackendApi("switch_account", { accountId });
    const active = await invokeBackendApi("get_active_account_info").catch(() => null);
    const usage = await invokeBackendApi("get_usage", { accountId }).catch(() => null);

    const used = typeof usage?.primary_used_percent === "number" ? usage.primary_used_percent : 0;
    const remaining = Math.max(0, 100 - used);
    const resetText = formatResetDuration(usage?.primary_resets_at);

    const msg = `✅ *CHUYỂN TÀI KHOẢN THÀNH CÔNG!*\n\n👤 *Tài khoản hiện tại:* \`${active?.name || "Active"}\`\n📊 *Hạn mức:* Đã dùng *${used.toFixed(0)}%* (Còn lại: *${remaining.toFixed(0)}%*)\n${resetText ? `⏳ *Reset lúc:* ${resetText}\n` : ""}\n👉 _Codex đã được cập nhật sang tài khoản này!_`;

    await sendTelegramNotification({
      botToken,
      chatId,
      text: msg,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "🚀 Mở/Restart Paseo", callback_data: "cmd_open_paseo" }],
          [{ text: "📋 Danh sách tài khoản", callback_data: "cmd_list" }],
          [{ text: "📱 Mở Web Dashboard", url: DASHBOARD_URL }],
        ],
      },
    });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Chuyển tài khoản thất bại: ${err.message}`,
    });
  }
}

async function performSwitchAndRestartPaseoNotify(botToken, chatId, accountId = null) {
  try {
    const res = await switchAccountAndRestartPaseo(accountId);
    const used = typeof res.usage?.primary_used_percent === "number" ? res.usage.primary_used_percent : 0;
    const remaining = Math.max(0, 100 - used);
    const resetText = formatResetDuration(res.usage?.primary_resets_at);

    const msg = `✅ *ĐÃ ĐỔI TÀI KHOẢN VÀ KHỞI ĐỘNG LẠI PASEO!* 🚀\n\n👤 *Tài khoản hiện tại:* \`${res.switchedTo.name}\`\n📊 *Hạn mức:* Đã dùng *${used.toFixed(0)}%* (Còn lại: *${remaining.toFixed(0)}%*)\n${resetText ? `⏳ *Reset:* ${resetText}\n` : ""}\n👉 _Paseo đã được đóng và mở lại với tài khoản mới thành công._`;

    await sendTelegramNotification({
      botToken,
      chatId,
      text: msg,
      replyMarkup: {
        inline_keyboard: [
          [{ text: "📋 Danh sách tài khoản", callback_data: "cmd_list" }],
          [{ text: "📱 Mở Web Dashboard", url: DASHBOARD_URL }],
        ],
      },
    });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Thao tác thất bại: ${err.message}`,
    });
  }
}

async function performAutoResumePaseoNotify(botToken, chatId, targetAgentId = null) {
  try {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "⏳ *Đang đóng Paseo, đổi sang tài khoản tốt nhất, mở lại và gửi lệnh 'tiếp tục'...*",
    }).catch(() => {});

    const res = await autoResumePaseoTask({ targetAgentId });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Tự động tiếp tục Paseo thất bại: ${err.message}`,
    }).catch(() => {});
  }
}

async function handleTelegramCallbackQuery(query, botToken, config) {
  const chatId = query.message?.chat?.id;
  const data = query.data;
  if (!chatId || !data) return;

  if (data === "cmd_auto_resume_paseo") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang khôi phục Paseo...");
    await performAutoResumePaseoNotify(botToken, chatId, null);
    return;
  }

  if (data.startsWith("switch_restart:")) {
    const accountId = data.split(":")[1];
    await answerTelegramCallbackQuery(botToken, query.id, "Đang đổi account & restart Paseo...");
    await performSwitchAndRestartPaseoNotify(botToken, chatId, accountId);
    return;
  }

  if (data === "cmd_auto_switch_restart_paseo") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang tự chọn account & restart Paseo...");
    await performSwitchAndRestartPaseoNotify(botToken, chatId, null);
    return;
  }

  if (data.startsWith("switch:")) {
    const accountId = data.split(":")[1];
    await answerTelegramCallbackQuery(botToken, query.id, "Đang chuyển tài khoản...");
    await performSwitchAndNotify(botToken, chatId, accountId);
    return;
  }

  if (data === "cmd_list") {
    await answerTelegramCallbackQuery(botToken, query.id);
    await sendAccountsListMessage(botToken, chatId);
    return;
  }

  if (data === "cmd_active") {
    await answerTelegramCallbackQuery(botToken, query.id);
    await sendActiveAccountStatusMessage(botToken, chatId);
    return;
  }

  if (data === "cmd_warmup") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang warm up...");
    await invokeBackendApi("warmup_all_accounts").catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "🔥 *Đã gửi tín hiệu Warm-up đến toàn bộ các tài khoản thành công!*",
      replyMarkup: {
        inline_keyboard: [[{ text: "📋 Xem danh sách tài khoản", callback_data: "cmd_list" }]],
      },
    });
    return;
  }

  if (data === "cmd_open_paseo") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang mở Paseo...");
    await openPaseoApp().catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "🚀 *Đã gửi lệnh mở ứng dụng Paseo.*",
    });
    return;
  }

  if (data === "cmd_close_paseo") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang đóng Paseo...");
    await closePaseoApp().catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "❌ *Đã gửi lệnh đóng ứng dụng Paseo.*",
    });
    return;
  }

  if (data === "cmd_kill_paseo") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang force close Paseo...");
    await killPaseoProcesses().catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "⛔ *Đã Force Close toàn bộ tiến trình Paseo.*",
    });
    return;
  }

  if (data === "cmd_open_codex") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang mở Codex...");
    await openCodexApp().catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "🚀 *Đã gửi lệnh mở ứng dụng Codex.*",
    });
    return;
  }

  if (data === "cmd_kill_codex") {
    await answerTelegramCallbackQuery(botToken, query.id, "Đang force close Codex...");
    await invokeBackendApi("kill_codex_processes").catch(() => {});
    await sendTelegramNotification({
      botToken,
      chatId,
      text: "⛔ *Đã Force Close toàn bộ tiến trình Codex.*",
    });
    return;
  }

  await answerTelegramCallbackQuery(botToken, query.id);
}

async function startTelegramLongPolling() {
  if (isPollingActive) return;
  isPollingActive = true;

  while (true) {
    const config = readNotificationConfig();
    if (!config.telegram?.enabled || !config.telegram?.botToken) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    const botToken = config.telegram.botToken;
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?offset=${tgPollingOffset}&timeout=15`;
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            tgPollingOffset = update.update_id + 1;
            if (update.message) {
              await handleTelegramMessage(update.message, botToken, config).catch((e) =>
                console.error("[TG Bot] Message error:", e.message)
              );
            } else if (update.callback_query) {
              await handleTelegramCallbackQuery(update.callback_query, botToken, config).catch((e) =>
                console.error("[TG Bot] Callback error:", e.message)
              );
            }
          }
        }
      }
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Start Telegram Poller in background
void startTelegramLongPolling();

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

  // ==================== NOTIFICATION & SWITCH-PASEO ROUTES ====================

  if (url.pathname === "/api/invoke/auto_resume_paseo") {
    try {
      const payload = await parseRequestBody(req);
      const result = await autoResumePaseoTask({
        targetAgentId: payload.agentId || null,
        targetAccountId: payload.accountId || null,
        promptMessage: payload.message || "tiếp tục",
        restartPaseo: Boolean(payload.restartPaseo),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/get_paseo_errored_agents") {
    try {
      const result = detectPaseoQuotaErrors();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/switch_and_restart_paseo") {
    try {
      const payload = await parseRequestBody(req);
      const result = await switchAccountAndRestartPaseo(payload.accountId || null);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

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
      const tgText = `🔔 *Codex Switcher - Thông báo thử nghiệm*\n\n✅ Cấu hình Telegram của bạn đang hoạt động bình thường!\n\n_Hệ thống sẽ gửi cảnh báo đến đây khi hạn mức của tài khoản active xuống thấp và bạn có thể bấm nút để đổi tài khoản trực tiếp!_`;
      
      const result = await sendTelegramNotification({
        botToken,
        chatId,
        text: tgText,
        replyMarkup: {
          inline_keyboard: [
            [{ text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" }],
            [{ text: "🔄 Tự đổi Acc & Restart Paseo", callback_data: "cmd_auto_switch_restart_paseo" }],
            [
              { text: "📋 Danh sách tài khoản", callback_data: "cmd_list" },
              { text: "📱 Mở Dashboard", url: DASHBOARD_URL }
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
      
      const result = await sendNtfyNotification({
        server: serverUrl,
        topic,
        title: "🔔 Codex Switcher - Thông báo thử nghiệm",
        message: "Cấu hình ntfy.sh của bạn đang hoạt động bình thường!",
        tags: ["white_check_mark", "robot"],
        clickUrl: DASHBOARD_URL,
        actions: [
          { action: "view", label: "📱 Mở Dashboard", url: DASHBOARD_URL }
        ]
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
