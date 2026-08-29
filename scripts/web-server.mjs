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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

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
