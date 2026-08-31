import { useState, useEffect, useCallback } from "react";
import { invokeBackend } from "../lib/platform";

export type TimeWindowKey = "1h" | "24h" | "3d" | "7d" | "30d";

export interface TokenWindowStats {
  key: string;
  label: string;
  turns: number;
  total: number;
  input: number;
  output: number;
  cached: number;
  reasoning: number;
  cacheHitRate: number;
  avgPerTurn: number;
}

export interface SystemQuotaOverview {
  totalAccounts: number;
  totalRemainingPercent: number;
  totalUsedPercent: number;
  totalMaxPercent: number;
  poolRemainingRate: number;
  avgUsedPercent: number;
  avgRemainingPercent: number;
  readyCount: number;
  midCount: number;
  highCount: number;
  exhaustedCount: number;
  activeAccount: {
    id: string;
    name: string;
    email?: string;
    plan_type?: string;
  } | null;
  accounts: Array<{
    id: string;
    name: string;
    email?: string;
    plan_type?: string;
    is_active: boolean;
    used_percent: number | null;
    remaining_percent: number | null;
    resets_at: number | null;
  }>;
}

const WINDOW_TABS: Array<{ key: TimeWindowKey; label: string; icon: string }> = [
  { key: "1h", label: "1 Giờ", icon: "⚡" },
  { key: "24h", label: "24 Giờ", icon: "📅" },
  { key: "3d", label: "3 Ngày", icon: "📆" },
  { key: "7d", label: "7 Ngày", icon: "📊" },
  { key: "30d", label: "30 Ngày", icon: "📈" },
];

function formatTokens(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) return "0";
  const abs = Math.abs(tokens);
  if (abs >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(2)} B`;
  if (abs >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${(tokens / 1_000).toFixed(1)} K`;
  return new Intl.NumberFormat().format(tokens);
}

function formatExact(tokens: number | null | undefined): string {
  if (tokens === null || tokens === undefined || !Number.isFinite(tokens)) return "0";
  return new Intl.NumberFormat().format(tokens);
}

const STORAGE_COLLAPSED_KEY = "codex_analytics_widget_collapsed";
const STORAGE_WINDOW_KEY = "codex_analytics_widget_window";

export function AnalyticsWidget() {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindowKey>(() => {
    return (localStorage.getItem(STORAGE_WINDOW_KEY) as TimeWindowKey) || "24h";
  });

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_COLLAPSED_KEY) === "true";
  });

  const [tokenStats, setTokenStats] = useState<Record<string, TokenWindowStats> | null>(null);
  const [quotaOverview, setQuotaOverview] = useState<SystemQuotaOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const handleSelectWindow = (key: TimeWindowKey) => {
    setSelectedWindow(key);
    localStorage.setItem(STORAGE_WINDOW_KEY, key);
  };

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      const [tokenRes, quotaRes] = await Promise.allSettled([
        invokeBackend<{ ok: boolean; stats: Record<string, TokenWindowStats> }>("get_token_analytics"),
        invokeBackend<{ ok: boolean; overview: SystemQuotaOverview }>("get_system_quota_overview"),
      ]);

      if (tokenRes.status === "fulfilled" && tokenRes.value?.stats) {
        setTokenStats(tokenRes.value.stats);
      }
      if (quotaRes.status === "fulfilled" && quotaRes.value?.overview) {
        setQuotaOverview(quotaRes.value.overview);
      }
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("[AnalyticsWidget] Failed to fetch analytics:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics();
    const timer = setInterval(() => {
      void fetchAnalytics();
    }, 30 * 1000);
    return () => clearInterval(timer);
  }, [fetchAnalytics]);

  const currentStats = tokenStats ? tokenStats[selectedWindow] : null;

  const totalTokens = currentStats?.total ?? 0;
  const inputTokens = currentStats?.input ?? 0;
  const outputTokens = currentStats?.output ?? 0;
  const cachedTokens = currentStats?.cached ?? 0;
  const reasoningTokens = currentStats?.reasoning ?? 0;
  const turnsCount = currentStats?.turns ?? 0;
  const cacheHitRate = currentStats?.cacheHitRate ?? 0;
  const avgPerTurn = currentStats?.avgPerTurn ?? 0;

  return (
    <div className="mb-6 rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      {/* Widget Header */}
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800/60 bg-gradient-to-r from-purple-50/50 via-indigo-50/30 to-blue-50/50 dark:from-purple-950/20 dark:via-indigo-950/10 dark:to-blue-950/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-sm shadow-purple-500/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">
                Thống Kê Token & Quota Toàn Hệ Thống
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50">
                Live
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Tổng hợp lượt gọi, token prompt, token sinh và hạn mức tất cả tài khoản
            </p>
          </div>
        </div>

        {/* Action Controls & Window Switcher */}
        <div className="flex items-center gap-2">
          {/* Time Window Tabs */}
          <div className="flex items-center bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 text-xs font-medium">
            {WINDOW_TABS.map((tab) => {
              const active = selectedWindow === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => handleSelectWindow(tab.key)}
                  className={`px-2.5 py-1 rounded-lg transition-all duration-200 flex items-center gap-1 ${
                    active
                      ? "bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 font-semibold shadow-xs"
                      : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-gray-700/40"
                  }`}
                >
                  <span className="text-[11px]">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Refresh button */}
          <button
            onClick={() => void fetchAnalytics()}
            disabled={isLoading}
            title="Làm mới số liệu"
            className="p-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-all disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? "animate-spin text-purple-600" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* Collapse/Expand Toggle */}
          <button
            onClick={handleToggleCollapse}
            title={isCollapsed ? "Mở rộng" : "Thu gọn"}
            className="p-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all"
          >
            <svg
              className={`w-4 h-4 transform transition-transform duration-200 ${isCollapsed ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Widget Body */}
      {!isCollapsed && (
        <div className="p-5 space-y-4">
          {/* Main 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Card 1: Tổng Token */}
            <div className="p-4 rounded-xl border border-purple-100 dark:border-purple-900/40 bg-gradient-to-br from-purple-50/60 to-white dark:from-purple-950/30 dark:to-gray-800/60 shadow-xs relative overflow-hidden group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                  Tổng Token Đã Dùng
                </span>
                <span className="text-purple-500 dark:text-purple-400">🔥</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  {formatTokens(totalTokens)}
                </span>
              </div>
              <div className="mt-2 pt-2 border-t border-purple-100/60 dark:border-purple-900/40 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>Chính xác:</span>
                <span className="font-mono font-medium text-purple-700 dark:text-purple-300">
                  {formatExact(totalTokens)}
                </span>
              </div>
            </div>

            {/* Card 2: Phân Rã Token */}
            <div className="p-4 rounded-xl border border-blue-100 dark:border-blue-900/40 bg-gradient-to-br from-blue-50/60 to-white dark:from-blue-950/30 dark:to-gray-800/60 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Phân Rã Token
                </span>
                <span className="text-blue-500 dark:text-blue-400">📥 📤</span>
              </div>
              <div className="space-y-1.5 mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span> Input:
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatTokens(inputTokens)}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 dark:text-gray-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Output:
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatTokens(outputTokens)}
                  </span>
                </div>
                {reasoningTokens > 0 && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span> Thinking:
                    </span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-300">
                      {formatTokens(reasoningTokens)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Card 3: Cache Hit Rate */}
            <div className="p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-gray-800/60 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Tỷ Lệ Cache Hit
                </span>
                <span className="text-emerald-500 dark:text-emerald-400">⚡</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                  {cacheHitRate}%
                </span>
                <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
                  đã tối ưu
                </span>
              </div>
              <div className="mt-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, cacheHitRate))}%` }}
                  ></div>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                  <span>Tiết kiệm:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatTokens(cachedTokens)} tokens
                  </span>
                </div>
              </div>
            </div>

            {/* Card 4: Lượt Gọi & Trung Bình */}
            <div className="p-4 rounded-xl border border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-gray-800/60 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Lượt Chat (Turns)
                </span>
                <span className="text-amber-500 dark:text-amber-400">💬</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  {turnsCount.toLocaleString()}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">turns</span>
              </div>
              <div className="mt-2 pt-2 border-t border-amber-100/60 dark:border-amber-900/40 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>Trung bình / lượt:</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  {formatTokens(avgPerTurn)}
                </span>
              </div>
            </div>
          </div>

          {/* Total Pooled Quota Card */}
          {quotaOverview && (
            <div className="p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/70 via-purple-50/40 to-white dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-gray-800/60 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🔋</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                        Tổng Quota Còn Lại Toàn Hệ Thống
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                        {quotaOverview.poolRemainingRate}% Dung lượng
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Tổng cộng dồn % quota còn lại của toàn bộ {quotaOverview.totalAccounts} tài khoản (Mỗi tài khoản 100%)
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-baseline gap-1 justify-end">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 tracking-tight">
                      {quotaOverview.totalRemainingPercent}%
                    </span>
                    <span className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                      / {quotaOverview.totalMaxPercent}%
                    </span>
                  </div>
                  <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    (Đã dùng: {quotaOverview.totalUsedPercent}%)
                  </span>
                </div>
              </div>

              {/* Progress capacity bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 h-2.5 rounded-full transition-all duration-500 shadow-xs"
                  style={{ width: `${Math.min(100, Math.max(0, quotaOverview.poolRemainingRate))}%` }}
                ></div>
              </div>

              {/* Badges Breakdown */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs border-t border-indigo-100/60 dark:border-indigo-900/40">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold text-[11px]">
                    🟢 {quotaOverview.readyCount} Sẵn sàng 100%
                  </span>
                  {quotaOverview.midCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold text-[11px]">
                      🟡 {quotaOverview.midCount} Đang dùng (21-80%)
                    </span>
                  )}
                  {quotaOverview.highCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold text-[11px]">
                      🟠 {quotaOverview.highCount} Sắp hết (81-94%)
                    </span>
                  )}
                  {quotaOverview.exhaustedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold text-[11px]">
                      🔴 {quotaOverview.exhaustedCount} Hết limit (≥95%)
                    </span>
                  )}
                </div>

                {quotaOverview.activeAccount && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 dark:text-purple-300 font-medium">
                    ⚡ Active: <strong className="truncate max-w-[140px]">{quotaOverview.activeAccount.name}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1">
            <span>Dữ liệu được cập nhật tự động từ các phiên làm việc của Codex</span>
            {lastRefreshed && (
              <span>Cập nhật lúc: {lastRefreshed.toLocaleTimeString("vi-VN")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
