import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
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

// Cross-Platform OS Flags & Paths
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const HOME_DIR = os.homedir();
const NOTIFICATION_CONFIG_PATH = path.join(HOME_DIR, ".codex", "notification_config.json");

function findBinaryPath() {
  if (process.env.CODEX_SWITCHER_BINARY) return process.env.CODEX_SWITCHER_BINARY;
  const candidates = isWindows
    ? [
        path.join(__dirname, "codex-web.exe"),
        path.join(__dirname, "..", "target", "release", "codex-web.exe"),
        path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Codex Switcher", "codex-web.exe"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "Codex Switcher", "codex-web.exe"),
        "codex-web.exe",
      ]
    : isMac
    ? [
        "/Applications/Codex Switcher.app/Contents/MacOS/codex-web",
        path.join(__dirname, "codex-web"),
        path.join(__dirname, "..", "target", "release", "codex-web"),
        "codex-web",
      ]
    : [
        "/usr/local/bin/codex-web",
        path.join(__dirname, "codex-web"),
        path.join(__dirname, "..", "target", "release", "codex-web"),
        "codex-web",
      ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

function findPaseoCliPath() {
  if (process.env.PASEO_CLI) return process.env.PASEO_CLI;
  const candidates = isWindows
    ? [
        path.join(process.env.LOCALAPPDATA || "", "Programs", "paseo", "bin", "paseo.cmd"),
        path.join(process.env.LOCALAPPDATA || "", "Programs", "paseo", "paseo.cmd"),
        path.join(HOME_DIR, ".local", "bin", "paseo.cmd"),
        path.join(HOME_DIR, ".local", "bin", "paseo.exe"),
        path.join(HOME_DIR, "AppData", "Roaming", "npm", "paseo.cmd"),
        "paseo.cmd",
        "paseo",
      ]
    : [
        path.join(HOME_DIR, ".local", "bin", "paseo"),
        "/usr/local/bin/paseo",
        "paseo",
      ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "paseo";
}

const BINARY_PATH = findBinaryPath();
const PASEO_CLI_PATH = findPaseoCliPath();

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
        resumePrompt: typeof data.resumePrompt === "string" && data.resumePrompt.trim() ? data.resumePrompt.trim() : "tiếp tục",
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
    resumePrompt: "tiếp tục",
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

function generateSmartResumePrompt(agentData = {}, mode = "smart", customPrompt = null) {
  if (customPrompt && typeof customPrompt === "string" && customPrompt.trim()) {
    return customPrompt.trim();
  }
  const cleanTitle = (agentData?.title || "").replace(/[\r\n\t]+/g, " ").trim();

  if (mode === "compact") {
    return "tiếp tục (chỉ xuất code/diff sửa đổi, không giải thích lý thuyết)";
  }

  if (mode === "smart" || !mode) {
    if (cleanTitle && cleanTitle.length > 3 && cleanTitle !== "Cuộc trò chuyện Paseo") {
      return `Tập trung hoàn thành tiếp nhiệm vụ: "${cleanTitle}". Chỉ xuất code sửa đổi cần thiết, không giải thích dông dài và không đọc lại các file đã hoàn thành.`;
    }
    return "Tập trung hoàn thành tiếp phần việc đang dở. Chỉ chỉnh sửa code cần thiết, không giải thích dài dòng và không đọc lại file cũ.";
  }

  return "tiếp tục";
}

const sessionMetricsCache = new Map();
const sessionFileIndex = new Map();
let lastSessionIndexTime = 0;

function refreshSessionIndexIfNeeded() {
  const now = Date.now();
  if (now - lastSessionIndexTime < 30000 && sessionFileIndex.size > 0) return;
  lastSessionIndexTime = now;

  if (!fs.existsSync(SESSIONS_DIR)) return;
  try {
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today.getTime() - i * 86400000);
      const y = String(d.getFullYear());
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const dayDir = path.join(SESSIONS_DIR, y, m, day);
      if (!fs.existsSync(dayDir)) continue;

      const files = fs.readdirSync(dayDir);
      for (const f of files) {
        if (f.endsWith(".jsonl")) {
          const match = f.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (match) {
            sessionFileIndex.set(match[1], path.join(dayDir, f));
          }
        }
      }
    }
  } catch {}
}

function findCodexSessionMetrics(sessionId) {
  if (!sessionId) {
    return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0, turns: 0 };
  }

  const now = Date.now();
  const cached = sessionMetricsCache.get(sessionId);
  if (cached && (now - cached.cachedAt < 10000)) {
    return cached.metrics;
  }

  refreshSessionIndexIfNeeded();

  const targetPath = sessionFileIndex.get(sessionId);
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0, turns: 0 };
  }

  try {
    const stats = fs.statSync(targetPath);
    if (cached && cached.mtime === stats.mtimeMs) {
      cached.cachedAt = now;
      return cached.metrics;
    }

    const size = stats.size;
    const readSize = Math.min(size, 96 * 1024);
    const buffer = Buffer.alloc(readSize);
    const fd = fs.openSync(targetPath, "r");
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
    fs.closeSync(fd);

    const text = buffer.toString("utf8");
    const lines = text.split("\n");
    let lastUsage = null;
    let turnCount = 0;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('"token_count"')) {
        try {
          const data = JSON.parse(line);
          if (data.type === "event_msg" && data.payload?.type === "token_count") {
            const u = data.payload.info?.last_token_usage;
            if (u && !lastUsage) {
              lastUsage = u;
            }
            turnCount++;
          }
        } catch {}
      }
    }

    const turns = Math.max(turnCount, Math.round(size / (15 * 1024)) || 1);

    const metrics = lastUsage
      ? {
          inputTokens: lastUsage.input_tokens || 0,
          outputTokens: lastUsage.output_tokens || 0,
          cachedTokens: lastUsage.cached_input_tokens || 0,
          reasoningTokens: lastUsage.reasoning_output_tokens || 0,
          totalTokens: lastUsage.total_tokens || 0,
          turns,
        }
      : { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0, turns: 0 };

    sessionMetricsCache.set(sessionId, { cachedAt: now, mtime: stats.mtimeMs, metrics });
    return metrics;
  } catch (e) {
    console.error("[SessionMetrics] Error reading session tail:", sessionId, e.message);
  }

  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0, turns: 0 };
}

function loadPaseoProjectsAndWorkspaces() {
  const projectsFile = path.join(HOME_DIR, ".paseo", "projects", "projects.json");
  const workspacesFile = path.join(HOME_DIR, ".paseo", "projects", "workspaces.json");

  const projectsMap = new Map();
  const workspacesMap = new Map();

  try {
    if (fs.existsSync(projectsFile)) {
      const prjList = JSON.parse(fs.readFileSync(projectsFile, "utf8"));
      for (const p of prjList) {
        projectsMap.set(p.projectId, {
          projectId: p.projectId,
          displayName: p.displayName || path.basename(p.rootPath || "Project"),
          rootPath: p.rootPath,
        });
      }
    }
  } catch {}

  try {
    if (fs.existsSync(workspacesFile)) {
      const wksList = JSON.parse(fs.readFileSync(workspacesFile, "utf8"));
      for (const w of wksList) {
        workspacesMap.set(w.workspaceId, {
          workspaceId: w.workspaceId,
          projectId: w.projectId,
          title: w.title || w.displayName || "Main Workspace",
          cwd: w.cwd,
          branch: w.branch,
        });
      }
    }
  } catch {}

  return { projectsMap, workspacesMap };
}

function getPaseoTabsAnalytics() {
  const agentsBase = path.join(HOME_DIR, ".paseo", "agents");
  if (!fs.existsSync(agentsBase)) return [];
  const { projectsMap, workspacesMap } = loadPaseoProjectsAndWorkspaces();
  const rawWorkspaces = fs.readdirSync(agentsBase);
  const tabs = [];

  for (const rawWks of rawWorkspaces) {
    const wksPath = path.join(agentsBase, rawWks);
    try {
      if (!fs.statSync(wksPath).isDirectory()) continue;
      const files = fs.readdirSync(wksPath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(wksPath, file);
        try {
          const stats = fs.statSync(filePath);
          const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
          if (data.archivedAt) continue; // Skip archived agents

          const sessionId = data.runtimeInfo?.sessionId || data.persistence?.sessionId || null;
          const metrics = findCodexSessionMetrics(sessionId);

          const err = data.lastError || "";
          const hasQuotaError =
            err.includes("usage limit") ||
            err.includes("hit your usage limit") ||
            err.includes("purchase more credits") ||
            err.includes("rate limit") ||
            err.includes("Quota exceeded");

          const inputTokens = metrics.inputTokens;
          const turns = metrics.turns;

          let bloatLevel = "safe"; // <50k tokens
          if (inputTokens >= 90000 || turns >= 30) {
            bloatLevel = "danger"; // >90k or >30 turns -> Heavy bloat!
          } else if (inputTokens >= 50000 || turns >= 18) {
            bloatLevel = "warning"; // 50k - 90k tokens
          }
          const provider = data.provider || "codex";
          const model = data.config?.model || data.runtimeInfo?.model || null;

          const workspaceId = data.workspaceId || rawWks;
          const wksMeta = workspacesMap.get(workspaceId);
          const projectId = wksMeta?.projectId || "default_project";
          const prjMeta = projectsMap.get(projectId);

          const projectName = prjMeta?.displayName || (data.cwd ? path.basename(data.cwd) : "Default Project");
          const workspaceTitle = wksMeta?.title || (data.cwd ? path.basename(data.cwd) : "Main Workspace");

          let statusType = "idle";
          let statusLabel = "Đã dừng (Idle)";
          let statusColor = "gray";

          if (hasQuotaError) {
            statusType = "quota_error";
            statusLabel = "Lỗi Hết Quota";
            statusColor = "red";
          } else if (err && err.trim()) {
            statusType = "error";
            statusLabel = "Lỗi";
            statusColor = "red";
          } else if (data.requiresAttention || data.lastStatus === "waiting_for_input") {
            statusType = "waiting";
            statusLabel = "Chờ phản hồi";
            statusColor = "amber";
          } else if (data.lastStatus === "running") {
            statusType = "running";
            statusLabel = "Đang chạy";
            statusColor = "emerald";
          } else if (data.lastStatus === "closed") {
            statusType = "closed";
            statusLabel = "Đã đóng";
            statusColor = "gray";
          } else {
            statusType = "idle";
            statusLabel = "Đã dừng (Idle)";
            statusColor = "gray";
          }

          tabs.push({
            id: data.id,
            title: data.title || "Cuộc trò chuyện Paseo",
            cwd: data.cwd || wksMeta?.cwd || "",
            workspaceId,
            workspaceTitle,
            projectId,
            projectName,
            branch: wksMeta?.branch || null,
            provider,
            model,
            updatedAt: data.updatedAt || new Date(stats.mtimeMs).toISOString(),
            mtime: stats.mtimeMs,
            lastStatus: data.lastStatus || "unknown",
            statusType,
            statusLabel,
            statusColor,
            hasQuotaError,
            lastError: err,
            sessionId,
            turns,
            inputTokens,
            outputTokens: metrics.outputTokens,
            cachedTokens: metrics.cachedTokens,
            reasoningTokens: metrics.reasoningTokens,
            totalTokens: metrics.totalTokens,
            bloatLevel,
            isBloated: bloatLevel === "danger" || bloatLevel === "warning",
            recommendedAction:
              bloatLevel === "danger"
                ? "Nên Tách Tab Mới (Tiết kiệm >85% Quota!)"
                : bloatLevel === "warning"
                ? "Khuyên dùng Smart Resume"
                : "Tối ưu",
          });
        } catch {}
      }
    } catch {}
  }

  tabs.sort((a, b) => b.mtime - a.mtime);
  return tabs;
}

async function createPaseoFreshHandoffTab(agentId, promptOverride = null) {
  const tabs = getPaseoTabsAnalytics();
  const target = tabs.find((t) => t.id === agentId);
  if (!target) {
    throw new Error(`Không tìm thấy tab Paseo có ID: ${agentId}`);
  }

  const rawTitle = target.title.replace(/\[Tiếp nối\]\s*/g, "").trim();
  const newTitle = `[Tiếp nối] ${rawTitle || "Tác vụ"}`;
  const cwd = target.cwd || HOME_DIR;
  const provider = target.provider || "codex";
  const modelFlag = target.model ? ` --model "${target.model}"` : "";
  const workspaceId = target.workspaceId || null;
  const workspaceFlag = workspaceId && workspaceId.startsWith("wks_") ? ` --workspace "${workspaceId}"` : "";

  const handoffPrompt = promptOverride && promptOverride.trim()
    ? promptOverride.trim()
    : `Tiếp nối nhiệm vụ: "${rawTitle}". Hãy phân tích nhanh trạng thái hiện tại của code trong thư mục và hoàn thành các bước tiếp theo. Giữ câu trả lời súc tích, đi thẳng vào code sửa đổi.`;

  console.log(`[PaseoHandoff] Spawning fresh agent for "${newTitle}" in workspace "${workspaceId}" ("${cwd}", provider: ${provider})...`);

  let newAgentId = null;
  try {
    const cmd = `"${PASEO_CLI_PATH}" run --provider "${provider}"${modelFlag}${workspaceFlag} --cwd "${cwd.replace(/"/g, '\\"')}" --title "${newTitle.replace(/"/g, '\\"')}" -d --json "${handoffPrompt.replace(/"/g, '\\"')}"`;
    const { stdout } = await execAsync(cmd);
    try {
      const parsed = JSON.parse(stdout);
      newAgentId = parsed.id || parsed.agentId || null;
    } catch {
      const match = stdout.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (match) newAgentId = match[1];
    }
  } catch (err) {
    throw new Error(`Lỗi tạo tab Paseo mới: ${err.message}`);
  }

  // Open the newly created agent in Paseo Desktop if agentId obtained
  if (newAgentId) {
    try {
      await execAsync(`"${PASEO_CLI_PATH}" agent open ${newAgentId}`);
    } catch {}
  }

  return {
    ok: true,
    originalAgentId: agentId,
    newAgentId,
    workspaceId,
    workspaceTitle: target.workspaceTitle,
    title: newTitle,
    cwd,
    prompt: handoffPrompt,
  };
}

function detectPaseoQuotaErrors() {
  return getPaseoTabsAnalytics().filter((t) => t.hasQuotaError);
}

let lastHandledPaseoErrors = {};

async function switchAccountAndRestartPaseo(targetAccountId = null, forceRestartApp = false) {
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

  // Check if Paseo is currently running
  const info = await getPaseoProcesses();

  if (info.count > 0 && !forceRestartApp) {
    // IN-PLACE HOT RELOAD: Keep desktop window open, reload worker process & daemon in 0.5s!
    console.log(`[PaseoHotReload] In-place reloading Paseo worker for account ${target.name}...`);
    return await hotReloadAccountForPaseo(target.id);
  }

  // If Paseo is not running, just switch account and open Paseo
  await invokeBackendApi("switch_account", { accountId: target.id });
  await new Promise((r) => setTimeout(r, 600));
  if (forceRestartApp || info.count === 0) {
    await openPaseoApp().catch(() => {});
  }

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
  await killCodexWorkerProcesses();

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

async function autoResumePaseoTask({ targetAgentId = null, targetAccountId = null, promptMessage = null, restartPaseo = false } = {}) {
  const config = readNotificationConfig();
  const effectivePrompt = (typeof promptMessage === "string" && promptMessage.trim())
    ? promptMessage.trim()
    : (config.resumePrompt || "tiếp tục");

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
    const agentPrompt = generateSmartResumePrompt(agent, config.smartResumeMode || "smart", promptMessage);
    try {
      console.log(`[PaseoAutoResume] Sending prompt "${agentPrompt}" to agent ${agent.id} (${agent.title || ""})...`);
      await execAsync(`"${PASEO_CLI_PATH}" send ${agent.id} "${agentPrompt.replace(/"/g, '\\"')}" --no-wait`);
      messageSent = true;
      console.log(`[PaseoAutoResume] Prompt sent successfully to agent ${agent.id}`);
    } catch (err) {
      sendError = err.message;
      console.error(`[PaseoAutoResume] Failed to send prompt to ${agent.id}:`, err.message);
    }
    lastHandledPaseoErrors[agent.id] = Date.now();
    results.push({ agent, messageSent, sendError, promptSent: agentPrompt });
  }

  // 4. Notify via Telegram & ntfy
  if (config.telegram?.enabled && config.telegram?.botToken && config.telegram?.chatId) {
    const resumedListText = results.length > 0
      ? results.map((r, i) => `${i + 1}. \`${r.agent.title || r.agent.id}\`\n   💬 _Prompt:_ "${r.promptSent}"`).join("\n")
      : "_Tất cả các tab_";

    const tgMsg = `🚀 *ĐÃ TỰ ĐỘNG KHÔI PHỤC ${results.length} CUỘC TRÒ CHUYỆN TRÊN PASEO (SMART RESUME)!*\n\n📝 *Các tab được tiếp tục:*\n${resumedListText}\n\n✅ *Tài khoản mới:* \`${switchedTo.name}\` (Còn *${newRemaining.toFixed(0)}%* quota)\n\n👉 _Paseo đang tiếp tục xử lý song song tất cả các tab!_`;

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

// ==================== TOKEN & QUOTA ANALYTICS MODULE ====================

const SESSIONS_DIR = path.join(HOME_DIR, ".codex", "sessions");
const sessionFileCache = new Map();
let cachedTokenStats = null;
let lastTokenAggregationTime = 0;
let isAggregatingTokens = false;

function getRelevantSessionFiles(cutoffMs) {
  if (!fs.existsSync(SESSIONS_DIR)) return [];
  const cutoffStr = new Date(cutoffMs).toISOString().slice(0, 10);
  const cutoffYear = cutoffStr.slice(0, 4);

  const files = [];
  try {
    const years = fs.readdirSync(SESSIONS_DIR).filter((y) => /^\d{4}$/.test(y) && y >= cutoffYear);
    for (const y of years) {
      const yPath = path.join(SESSIONS_DIR, y);
      const months = fs.readdirSync(yPath).filter((m) => /^\d{2}$/.test(m));
      for (const m of months) {
        const mPath = path.join(yPath, m);
        const days = fs.readdirSync(mPath).filter((d) => /^\d{2}$/.test(d));
        for (const d of days) {
          const dateStr = `${y}-${m}-${d}`;
          if (dateStr < cutoffStr) continue;
          const dPath = path.join(mPath, d);
          const dayFiles = fs.readdirSync(dPath).filter((f) => f.endsWith(".jsonl"));
          for (const f of dayFiles) {
            files.push(path.join(dPath, f));
          }
        }
      }
    }
  } catch (err) {
    console.error("[TokenAnalytics] Error discovering session files:", err.message);
  }
  return files;
}

async function parseSessionFile(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const cached = sessionFileCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.records;
    }

    const records = [];
    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.includes('"token_count"')) continue;
      try {
        const data = JSON.parse(line);
        if (data.type === "event_msg" && data.payload?.type === "token_count") {
          const ts = new Date(data.timestamp).getTime();
          const usage = data.payload.info?.last_token_usage;
          if (usage && !isNaN(ts)) {
            records.push({
              ts,
              input: usage.input_tokens || 0,
              output: usage.output_tokens || 0,
              cached: usage.cached_input_tokens || 0,
              reasoning: usage.reasoning_output_tokens || 0,
              total: usage.total_tokens || 0,
            });
          }
        }
      } catch {}
    }

    sessionFileCache.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, records });
    return records;
  } catch {
    return [];
  }
}

const ANALYTICS_WINDOWS = [
  { key: "1h", label: "1 Giờ", ms: 1 * 3600 * 1000 },
  { key: "24h", label: "24 Giờ", ms: 24 * 3600 * 1000 },
  { key: "3d", label: "3 Ngày", ms: 3 * 24 * 3600 * 1000 },
  { key: "7d", label: "7 Ngày", ms: 7 * 24 * 3600 * 1000 },
  { key: "30d", label: "30 Ngày", ms: 30 * 24 * 3600 * 1000 },
];

async function updateTokenAnalytics() {
  if (isAggregatingTokens) return cachedTokenStats;
  isAggregatingTokens = true;

  try {
    const maxWindow = 30 * 24 * 3600 * 1000;
    const cutoffMs = Date.now() - maxWindow;
    const files = getRelevantSessionFiles(cutoffMs);

    const allRecords = [];
    for (const file of files) {
      const records = await parseSessionFile(file);
      for (const r of records) {
        allRecords.push(r);
      }
    }

    const now = Date.now();
    const result = {};

    for (const win of ANALYTICS_WINDOWS) {
      const winCutoff = now - win.ms;
      let input = 0;
      let output = 0;
      let cached = 0;
      let reasoning = 0;
      let total = 0;
      let turns = 0;

      for (const r of allRecords) {
        if (r.ts >= winCutoff) {
          input += r.input;
          output += r.output;
          cached += r.cached;
          reasoning += r.reasoning;
          total += r.total;
          turns++;
        }
      }

      const cacheHitRate = input > 0 ? (cached / input) * 100 : 0;
      const avgPerTurn = turns > 0 ? Math.round(total / turns) : 0;

      result[win.key] = {
        key: win.key,
        label: win.label,
        turns,
        total,
        input,
        output,
        cached,
        reasoning,
        cacheHitRate: parseFloat(cacheHitRate.toFixed(1)),
        avgPerTurn,
      };
    }

    cachedTokenStats = result;
    lastTokenAggregationTime = now;
    return result;
  } catch (err) {
    console.error("[TokenAnalytics] Aggregation error:", err.message);
    return cachedTokenStats || {};
  } finally {
    isAggregatingTokens = false;
  }
}

// Initial aggregation in background + interval every 45s
void updateTokenAnalytics();
setInterval(() => {
  void updateTokenAnalytics();
}, 45 * 1000);

async function getSystemQuotaOverview() {
  const accounts = await invokeBackendApi("list_accounts").catch(() => []);
  const active = await invokeBackendApi("get_active_account_info").catch(() => null);

  let readyCount = 0; // <= 20% used
  let midCount = 0; // 21-80% used
  let highCount = 0; // 81-94% used
  let exhaustedCount = 0; // >= 95% used
  let sumUsed = 0;
  let validUsageCount = 0;
  let totalRemainingPercent = 0;
  let totalUsedPercent = 0;
  const totalMaxPercent = accounts.length * 100;

  const accountsWithUsage = [];
  for (const acc of accounts) {
    let usage = null;
    let usedPercent = 0;
    try {
      usage = await invokeBackendApi("get_usage", { accountId: acc.id });
      if (typeof usage?.primary_used_percent === "number") {
        usedPercent = usage.primary_used_percent;
      }
    } catch {}

    const remainingPercent = Math.max(0, 100 - usedPercent);
    totalRemainingPercent += remainingPercent;
    totalUsedPercent += usedPercent;
    sumUsed += usedPercent;
    validUsageCount++;

    if (usedPercent <= 20) readyCount++;
    else if (usedPercent <= 80) midCount++;
    else if (usedPercent < 95) highCount++;
    else exhaustedCount++;

    accountsWithUsage.push({
      id: acc.id,
      name: acc.name,
      email: acc.email,
      plan_type: acc.plan_type,
      is_active: acc.is_active,
      used_percent: usedPercent,
      remaining_percent: remainingPercent,
      resets_at: usage?.primary_resets_at || null,
    });
  }

  const avgUsed = validUsageCount > 0 ? sumUsed / validUsageCount : 0;
  const avgRemaining = Math.max(0, 100 - avgUsed);
  const poolRemainingRate = totalMaxPercent > 0 ? (totalRemainingPercent / totalMaxPercent) * 100 : 0;

  return {
    totalAccounts: accounts.length,
    totalRemainingPercent: Math.round(totalRemainingPercent),
    totalUsedPercent: Math.round(totalUsedPercent),
    totalMaxPercent,
    poolRemainingRate: parseFloat(poolRemainingRate.toFixed(1)),
    readyCount,
    midCount,
    highCount,
    exhaustedCount,
    avgUsedPercent: parseFloat(avgUsed.toFixed(1)),
    avgRemainingPercent: parseFloat(avgRemaining.toFixed(1)),
    activeAccount: active
      ? {
          id: active.id,
          name: active.name,
          email: active.email,
          plan_type: active.plan_type,
        }
      : null,
    accounts: accountsWithUsage,
  };
}

function formatTokenCount(num) {
  if (typeof num !== "number" || isNaN(num)) return "0";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + " tỷ (B)";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + " triệu (M)";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + " K";
  return num.toLocaleString();
}

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
    const welcome = `👋 *Xin chào! Tôi là Bot điều khiển Codex Switcher.*\n\n⚡ *Tài khoản active:* \`${active?.name || "Chưa chọn"}\`\n\n📱 *Các lệnh điều khiển:*\n• /usage (hoặc /tokens) - Thống kê tổng token đã dùng (1h, 1d, 3d, 7d, 30d)\n• /resume\\_paseo (hoặc /tieptuc) - Tự đổi tài khoản & gửi 'tiếp tục' trên Paseo\n• /restart\\_paseo - Đổi tài khoản & khởi động lại Paseo\n• /list - Danh sách tài khoản & nút chuyển nhanh\n• /active - Xem chi tiết hạn mức tài khoản hiện tại\n• /switch <số hoặc tên> - Chuyển sang tài khoản\n• /warmup - Warm up tất cả tài khoản\n• /paseo - Trạng thái & Mở/Đóng app Paseo\n• /codex - Trạng thái & Mở/Đóng app Codex\n\n👉 _Hoặc bấm các nút bên dưới:_`;

    await sendTelegramNotification({
      botToken,
      chatId,
      text: welcome,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: "📊 Thống kê Token & Quota", callback_data: "token_win:24h" },
            { text: "🎯 Quản lý Tabs Paseo", callback_data: "cmd_tabs" },
          ],
          [
            { text: "🚀 Đổi Acc & Tiếp tục Paseo", callback_data: "cmd_auto_resume_paseo" },
            { text: "🔄 Đổi Acc & Reload Paseo", callback_data: "cmd_auto_switch_restart_paseo" },
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

  // 1.5. /usage, /tokens, /token, /analytics, /quota
  if (
    lower === "/usage" ||
    lower === "/tokens" ||
    lower === "/token" ||
    lower === "/analytics" ||
    lower === "/quota" ||
    lower.startsWith("/usage ") ||
    lower.startsWith("/tokens ") ||
    lower.startsWith("/token ")
  ) {
    let winKey = "24h";
    if (lower.includes("1h") || lower.includes("1 giờ") || lower.includes("1 gio")) winKey = "1h";
    else if (lower.includes("3d") || lower.includes("3 ngày") || lower.includes("3 ngay")) winKey = "3d";
    else if (lower.includes("7d") || lower.includes("7 ngày") || lower.includes("7 ngay") || lower.includes("1w") || lower.includes("1 tuần")) winKey = "7d";
    else if (lower.includes("30d") || lower.includes("30 ngày") || lower.includes("30 ngay") || lower.includes("1m") || lower.includes("1 tháng")) winKey = "30d";
    await sendTokenAnalyticsMessage(botToken, chatId, winKey);
    return;
  }

  // 2. /resume_paseo, /continue_paseo, /tieptuc
  if (
    lower === "/resume_paseo" ||
    lower === "/continue_paseo" ||
    lower === "/tieptuc" ||
    lower === "tieptuc" ||
    lower.startsWith("/resume_paseo ") ||
    lower.startsWith("/continue_paseo ") ||
    lower.startsWith("/tieptuc ")
  ) {
    let customPrompt = null;
    const match = text.match(/^\/(?:resume_paseo|continue_paseo|tieptuc)\s+(.+)$/i);
    if (match && match[1].trim()) {
      customPrompt = match[1].trim();
    }
    await performAutoResumePaseoNotify(botToken, chatId, null, customPrompt);
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

  // 7. /tabs, /paseo_tabs
  if (lower === "/tabs" || lower === "/paseo_tabs") {
    await sendPaseoTabsListMessage(botToken, chatId);
    return;
  }

  // 8. /paseo
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

async function performAutoResumePaseoNotify(botToken, chatId, targetAgentId = null, promptMessage = null) {
  try {
    const config = readNotificationConfig();
    const effectivePrompt = promptMessage || config.resumePrompt || "tiếp tục";
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `⏳ *Đang đổi sang tài khoản tốt nhất và tiếp tục Paseo (Tin nhắn: "${effectivePrompt}")...*`,
    }).catch(() => {});

    await autoResumePaseoTask({ targetAgentId, promptMessage: effectivePrompt });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Tự động tiếp tục Paseo thất bại: ${err.message}`,
    }).catch(() => {});
  }
}

async function sendTokenAnalyticsMessage(botToken, chatId, selectedWinKey = "24h") {
  try {
    const stats = cachedTokenStats || (await updateTokenAnalytics());
    const data = stats[selectedWinKey] || stats["24h"] || Object.values(stats)[0] || {
      total: 0,
      input: 0,
      output: 0,
      cached: 0,
      reasoning: 0,
      turns: 0,
      cacheHitRate: 0,
      avgPerTurn: 0,
    };
    const quotaOverview = await getSystemQuotaOverview().catch(() => null);

    const winLabels = {
      "1h": "⚡ 1 Giờ gần nhất",
      "24h": "📅 24 Giờ (1 Ngày)",
      "3d": "📆 3 Ngày gần nhất",
      "7d": "📊 7 Ngày gần nhất",
      "30d": "📈 30 Ngày gần nhất",
    };

    const currentLabel = winLabels[selectedWinKey] || selectedWinKey;

    const tgMsg = `📊 *BÁO CÁO TOKEN & QUOTA CODEX*
⏱ *Khung thời gian:* *${currentLabel}*

🔥 *Tổng Token tiêu thụ:* *${formatTokenCount(data.total)}* (${data.total.toLocaleString()} tokens)
💬 *Tổng lượt tương tác (Turns):* *${data.turns.toLocaleString()}* lượt
⚡ *Trung bình mỗi lượt:* *${data.avgPerTurn.toLocaleString()}* tokens/turn

📋 *Chi tiết phân bổ Token:*
• 📥 *Input Prompt:* \`${formatTokenCount(data.input)}\`
• 📤 *Output Generation:* \`${formatTokenCount(data.output)}\`
• 🧠 *Reasoning / Thinking:* \`${formatTokenCount(data.reasoning)}\`
• ⚡ *Cached Input (Đã cache):* \`${formatTokenCount(data.cached)}\`
🎯 *Tỷ lệ Cache Hit:* *${data.cacheHitRate}%* _(Tiết kiệm ${formatTokenCount(data.cached)} tokens!)_

${
  quotaOverview
    ? `🌐 *Tổng quan Quota Hệ Thống:*
• 🔋 *Tổng Quota còn lại:* *${quotaOverview.totalRemainingPercent}%* / ${quotaOverview.totalMaxPercent}% (${quotaOverview.poolRemainingRate}% dung lượng khả dụng)
• 👥 Tổng tài khoản: *${quotaOverview.totalAccounts}* (${quotaOverview.readyCount} sẵn sàng 100%, ${quotaOverview.exhaustedCount} hết limit)
• ⚡ Active: \`${quotaOverview.activeAccount?.name || "Chưa chọn"}\``
    : ""
}

👉 _Bấm nút bên dưới để đổi mốc thời gian:_`;

    const inlineButtons = [
      [
        { text: selectedWinKey === "1h" ? "• 1 Giờ •" : "1 Giờ", callback_data: "token_win:1h" },
        { text: selectedWinKey === "24h" ? "• 24 Giờ •" : "24 Giờ", callback_data: "token_win:24h" },
        { text: selectedWinKey === "3d" ? "• 3 Ngày •" : "3 Ngày", callback_data: "token_win:3d" },
      ],
      [
        { text: selectedWinKey === "7d" ? "• 7 Ngày •" : "7 Ngày", callback_data: "token_win:7d" },
        { text: selectedWinKey === "30d" ? "• 30 Ngày •" : "30 Ngày", callback_data: "token_win:30d" },
        { text: "🔄 Refresh", callback_data: `token_win:${selectedWinKey}` },
      ],
      [
        { text: "📋 Danh sách tài khoản", callback_data: "cmd_list" },
        { text: "📱 Mở Dashboard", url: DASHBOARD_URL },
      ],
    ];

    await sendTelegramNotification({
      botToken,
      chatId,
      text: tgMsg,
      replyMarkup: { inline_keyboard: inlineButtons },
    });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Lỗi lấy thống kê token: ${err.message}`,
    }).catch(() => {});
  }
}

async function sendPaseoTabsListMessage(botToken, chatId) {
  try {
    const tabs = getPaseoTabsAnalytics();
    if (tabs.length === 0) {
      await sendTelegramNotification({
        botToken,
        chatId,
        text: "ℹ️ Hiện không có tab Paseo nào đang mở.",
      });
      return;
    }

    let text = `🎯 *DANH SÁCH TAB PASEO & ĐỘ PHÌNH NGỮ CẢNH (CONTEXT)*\n\n`;
    const inlineButtons = [];

    tabs.slice(0, 6).forEach((tab, index) => {
      const icon = tab.bloatLevel === "danger" ? "🔴" : tab.bloatLevel === "warning" ? "🟡" : "🟢";
      const statusNote = tab.hasQuotaError ? " ⚠️ *(Lỗi Quota)*" : "";
      const shortTitle = tab.title.length > 28 ? tab.title.slice(0, 28) + "..." : tab.title;

      text += `${index + 1}. ${icon} *${shortTitle}*${statusNote}\n`;
      text += `   • 📊 *Context:* \`${formatTokenCount(tab.inputTokens)}\` (${tab.turns} turns)\n`;
      text += `   • 💡 _Gợi ý:_ ${tab.recommendedAction}\n\n`;

      const row = [
        { text: `⚡ Smart Resume #${index + 1}`, callback_data: `resume_tab:${tab.id}` },
      ];
      if (tab.isBloated) {
        row.push({ text: `🌱 Tách Tab Mới #${index + 1}`, callback_data: `handoff_tab:${tab.id}` });
      }
      inlineButtons.push(row);
    });

    inlineButtons.push([
      { text: "🚀 Tiếp tục tất cả tab lỗi", callback_data: "cmd_auto_resume_paseo" },
      { text: "📱 Mở Dashboard", url: DASHBOARD_URL },
    ]);

    await sendTelegramNotification({
      botToken,
      chatId,
      text,
      replyMarkup: { inline_keyboard: inlineButtons },
    });
  } catch (err) {
    await sendTelegramNotification({
      botToken,
      chatId,
      text: `❌ Lỗi đọc danh sách tab Paseo: ${err.message}`,
    }).catch(() => {});
  }
}

async function handleTelegramCallbackQuery(query, botToken, config) {
  const chatId = query.message?.chat?.id;
  const data = query.data;
  if (!chatId || !data) return;

  if (data.startsWith("handoff_tab:")) {
    const agentId = data.split(":")[1];
    await answerTelegramCallbackQuery(botToken, query.id, "Đang tạo tab mới tinh gọn...");
    try {
      const res = await createPaseoFreshHandoffTab(agentId);
      await sendTelegramNotification({
        botToken,
        chatId,
        text: `🌱 *ĐÃ TẠO TAB MỚI TINH GỌN THÀNH CÔNG!* 🚀\n\n📝 *Tiêu đề:* \`${res.title}\`\n📁 *Thư mục:* \`${res.cwd}\`\n\n🎯 *Lợi ích:* Tiết kiệm >85% Quota (Context mới chỉ ~3k-5k tokens thay vì gánh hàng trăm ngàn tokens cũ!).`,
        replyMarkup: {
          inline_keyboard: [[{ text: "🎯 Xem danh sách Tabs", callback_data: "cmd_tabs" }]],
        },
      });
    } catch (err) {
      await sendTelegramNotification({
        botToken,
        chatId,
        text: `❌ Lỗi tạo tab mới: ${err.message}`,
      });
    }
    return;
  }

  if (data.startsWith("resume_tab:")) {
    const agentId = data.split(":")[1];
    await answerTelegramCallbackQuery(botToken, query.id, "Đang gửi Smart Resume...");
    await performAutoResumePaseoNotify(botToken, chatId, agentId);
    return;
  }

  if (data === "cmd_tabs") {
    await answerTelegramCallbackQuery(botToken, query.id);
    await sendPaseoTabsListMessage(botToken, chatId);
    return;
  }

  if (data.startsWith("token_win:")) {
    const winKey = data.split(":")[1] || "24h";
    await answerTelegramCallbackQuery(botToken, query.id, `Đang tải thống kê ${winKey}...`);
    await sendTokenAnalyticsMessage(botToken, chatId, winKey);
    return;
  }

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

// ==================== CROSS-PLATFORM SYSTEM HELPERS ====================

async function killCodexWorkerProcesses() {
  try {
    if (isWindows) {
      await execAsync('taskkill /F /IM codex.exe /T 2>nul || true');
    } else {
      await execAsync('pkill -f "codex app-server" 2>/dev/null || killall -9 codex 2>/dev/null || true');
    }
  } catch {}
}

async function isTailscaleRunning() {
  try {
    if (isWindows) {
      const { stdout } = await execAsync('tasklist /FO CSV /NH 2>nul');
      return stdout.toLowerCase().includes("tailscale");
    } else {
      const { stdout } = await execAsync("ps -axo command=");
      return stdout.includes("Tailscale.app") || stdout.includes("tailscaled");
    }
  } catch {
    return false;
  }
}

async function ensureTailscaleRunning() {
  try {
    const running = await isTailscaleRunning();
    if (!running) {
      console.log("[Tailscale] Tailscale is not running. Launching Tailscale in background...");
      if (isWindows) {
        await execAsync('start "" "C:\\Program Files\\Tailscale\\tailscale-ipn.exe" 2>nul || start "" "tailscale-ipn.exe" 2>nul || true');
      } else {
        await execAsync("open -g -a Tailscale 2>/dev/null || open -g -a '/Applications/Tailscale.app' 2>/dev/null || true");
      }
      console.log("[Tailscale] Launch command sent.");
    }
  } catch (err) {
    console.error("[Tailscale] Error checking/launching Tailscale:", err.message);
  }
}

async function openTailscaleApp() {
  try {
    if (isWindows) {
      await execAsync('start "" "C:\\Program Files\\Tailscale\\tailscale-ipn.exe" 2>nul || start "" "tailscale-ipn.exe" 2>nul || true');
    } else {
      await execAsync("open -g -a Tailscale 2>/dev/null || open -g -a '/Applications/Tailscale.app' 2>/dev/null || true");
    }
    return { ok: true };
  } catch (err) {
    throw new Error(`Failed to open Tailscale: ${err.message}`);
  }
}

async function getPaseoProcesses() {
  try {
    if (isWindows) {
      const { stdout } = await execAsync('tasklist /FO CSV /NH 2>nul');
      const pids = [];
      for (const line of stdout.split("\n")) {
        const match = line.match(/^"([^"]+)","(\d+)"/);
        if (match) {
          const name = match[1].toLowerCase();
          const pid = parseInt(match[2], 10);
          if (name.includes("paseo") && pid !== process.pid) {
            pids.push(pid);
          }
        }
      }
      return { count: pids.length, background_count: 0, can_switch: pids.length === 0, pids };
    } else {
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
    }
  } catch {
    return { count: 0, background_count: 0, can_switch: true, pids: [] };
  }
}

async function killPaseoProcesses() {
  const info = await getPaseoProcesses();
  if (info.pids.length > 0) {
    try {
      if (isWindows) {
        await execAsync('taskkill /F /IM Paseo.exe /T 2>nul || true');
      } else {
        await execAsync(`kill -9 ${info.pids.join(" ")} 2>/dev/null || true`);
      }
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
    if (isWindows) {
      await execAsync('taskkill /IM Paseo.exe 2>nul || true');
    } else {
      await execAsync("osascript -e 'tell application id \"sh.paseo.desktop\" to quit' 2>/dev/null || osascript -e 'tell application \"Paseo\" to quit' 2>/dev/null || killall -15 Paseo 2>/dev/null || true");
    }
    return { ok: true };
  } catch (err) {
    throw new Error(`Failed to close Paseo: ${err.message}`);
  }
}

async function openPaseoApp() {
  try {
    if (isWindows) {
      await execAsync('start "" "paseo:" 2>nul || start "" "%LOCALAPPDATA%\\Programs\\Paseo\\Paseo.exe" 2>nul || start "" "Paseo.exe" 2>nul || true');
    } else {
      await execAsync("open -b sh.paseo.desktop 2>/dev/null || open -a Paseo");
    }
    return null;
  } catch (err) {
    throw new Error(`Failed to open Paseo: ${err.message}`);
  }
}

async function openCodexApp() {
  try {
    if (isWindows) {
      await execAsync('start "" "codex:" 2>nul || start "" "%LOCALAPPDATA%\\Programs\\Codex\\Codex.exe" 2>nul || start "" "Codex.exe" 2>nul || true');
    } else {
      await execAsync("open -b com.openai.codex 2>/dev/null || open -a Codex 2>/dev/null || open -a ChatGPT 2>/dev/null");
    }
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

  // ==================== TOKEN & QUOTA ANALYTICS ROUTES ====================

  if (url.pathname === "/api/invoke/get_token_analytics") {
    try {
      const stats = cachedTokenStats || await updateTokenAnalytics();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        stats,
        lastUpdated: lastTokenAggregationTime,
        windows: ANALYTICS_WINDOWS,
      }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/get_system_quota_overview") {
    try {
      const overview = await getSystemQuotaOverview();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, overview }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

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

  if (url.pathname === "/api/invoke/get_paseo_tabs_analytics") {
    try {
      const tabs = getPaseoTabsAnalytics();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, tabs }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname === "/api/invoke/create_paseo_fresh_handoff_tab") {
    try {
      const payload = await parseRequestBody(req);
      if (!payload.agentId) {
        throw new Error("agentId is required");
      }
      const result = await createPaseoFreshHandoffTab(payload.agentId, payload.prompt || null);
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
