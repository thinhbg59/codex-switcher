import { useState, useEffect, useCallback } from "react";
import { invokeBackend } from "../lib/platform";

export interface PaseoTabInfo {
  id: string;
  title: string;
  cwd: string;
  workspaceId: string;
  updatedAt: string;
  mtime: number;
  lastStatus: string;
  hasQuotaError: boolean;
  lastError: string;
  sessionId: string | null;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  bloatLevel: "safe" | "warning" | "danger";
  isBloated: boolean;
  recommendedAction: string;
}

const STORAGE_COLLAPSED_KEY = "codex_paseo_tabs_manager_collapsed";

function formatTokenCount(num: number): string {
  if (!num || isNaN(num)) return "0";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + " B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + " M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + " K";
  return num.toLocaleString();
}

export function PaseoTabsManager({
  onShowToast,
}: {
  onShowToast?: (msg: string, isError?: boolean) => void;
}) {
  const [tabs, setTabs] = useState<PaseoTabInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_COLLAPSED_KEY) === "false" ? false : false;
  });

  const fetchTabs = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await invokeBackend<{ ok: boolean; tabs: PaseoTabInfo[] }>(
        "get_paseo_tabs_analytics"
      );
      if (res?.tabs) {
        setTabs(res.tabs);
      }
    } catch (err) {
      console.error("[PaseoTabsManager] Failed to fetch tabs:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTabs();
    const interval = setInterval(() => {
      void fetchTabs();
    }, 15 * 1000);
    return () => clearInterval(interval);
  }, [fetchTabs]);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  const handleSmartResume = async (tab: PaseoTabInfo) => {
    try {
      setActionLoadingId(tab.id);
      onShowToast?.(`Đang gửi Smart Resume cho tab "${tab.title}"...`);
      const res = await invokeBackend<{
        ok: boolean;
        result?: { switchedTo?: { name: string } };
      }>("auto_resume_paseo", { agentId: tab.id });
      if (res?.ok) {
        onShowToast?.(`Đã gửi Smart Resume thành công tới tab "${tab.title}"!`);
      } else {
        onShowToast?.("Đã gửi Smart Resume tới tab Paseo!");
      }
      await fetchTabs();
    } catch (err) {
      console.error("Smart resume error:", err);
      onShowToast?.(`Lỗi gửi Smart Resume: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSmartHandoff = async (tab: PaseoTabInfo) => {
    try {
      setActionLoadingId(tab.id);
      onShowToast?.(`Đang tách tab mới tinh gọn cho "${tab.title}"...`);
      const res = await invokeBackend<{
        ok: boolean;
        result?: { newAgentId?: string; title?: string };
      }>("create_paseo_fresh_handoff_tab", { agentId: tab.id });

      if (res?.ok) {
        onShowToast?.(
          `🌱 Đã tạo tab mới tinh gọn "${res.result?.title || tab.title}" thành công (Tiết kiệm >85% Quota)!`
        );
      } else {
        onShowToast?.("Đã tạo tab Paseo mới thành công!");
      }
      await fetchTabs();
    } catch (err) {
      console.error("Smart handoff error:", err);
      onShowToast?.(`Lỗi tách tab mới: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const bloatedCount = tabs.filter((t) => t.isBloated).length;
  const erroredCount = tabs.filter((t) => t.hasQuotaError).length;

  if (tabs.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800/60 bg-gradient-to-r from-emerald-50/50 via-teal-50/30 to-blue-50/50 dark:from-emerald-950/20 dark:via-teal-950/10 dark:to-blue-950/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs">
            <span className="text-base">🎯</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white tracking-tight">
                Quản Lý & Tối Ưu Tab Paseo (Smart Context)
              </h2>
              {bloatedCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50">
                  {bloatedCount} tab nặng
                </span>
              )}
              {erroredCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border border-red-200/50 dark:border-red-800/50 animate-pulse">
                  {erroredCount} tab hết Quota
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Giám sát dung lượng Context của từng tab và tối ưu Quota bằng Smart Resume & Smart Handoff
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchTabs()}
            disabled={isLoading}
            title="Làm mới danh sách Tab"
            className="p-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-all disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-600" : ""}`}
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

      {/* Tabs List */}
      {!isCollapsed && (
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tabs.map((tab) => {
              const isWorking = actionLoadingId === tab.id;
              const bloatBg =
                tab.bloatLevel === "danger"
                  ? "border-red-200/80 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/20"
                  : tab.bloatLevel === "warning"
                  ? "border-amber-200/80 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
                  : "border-gray-200/70 bg-gray-50/40 dark:border-gray-800/70 dark:bg-gray-800/20";

              return (
                <div
                  key={tab.id}
                  className={`p-3.5 rounded-xl border ${bloatBg} transition-all duration-200 flex flex-col justify-between gap-3 relative overflow-hidden`}
                >
                  <div>
                    {/* Top Row */}
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm">
                          {tab.bloatLevel === "danger"
                            ? "🔴"
                            : tab.bloatLevel === "warning"
                            ? "🟡"
                            : "🟢"}
                        </span>
                        <h3
                          className="text-xs font-bold text-gray-900 dark:text-white truncate"
                          title={tab.title}
                        >
                          {tab.title}
                        </h3>
                      </div>
                      {tab.hasQuotaError && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 shrink-0">
                          Hết Quota
                        </span>
                      )}
                    </div>

                    {/* Path & Session */}
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mb-2">
                      📁 <span className="font-mono">{tab.cwd || tab.workspaceId}</span>
                    </div>

                    {/* Context Metrics */}
                    <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-white/80 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider block">
                          Context Tokens
                        </span>
                        <span className="font-bold font-mono text-gray-900 dark:text-white">
                          {formatTokenCount(tab.inputTokens)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider block">
                          Số Lượt (Turns)
                        </span>
                        <span className="font-bold font-mono text-gray-900 dark:text-white">
                          {tab.turns} turns
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-700/50 text-xs">
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      {tab.recommendedAction}
                    </span>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {tab.isBloated && (
                        <button
                          onClick={() => void handleSmartHandoff(tab)}
                          disabled={isWorking}
                          title="Tạo tab mới sạch sẽ với ~3k tokens từ tác vụ này (Tiết kiệm >85% Quota)"
                          className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          <span>🌱</span>
                          <span>Tách Tab Mới</span>
                        </button>
                      )}

                      <button
                        onClick={() => void handleSmartResume(tab)}
                        disabled={isWorking}
                        title="Gửi prompt định hướng súc tích, bỏ qua giải thích dài dòng"
                        className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1"
                      >
                        <span>⚡</span>
                        <span>Smart Resume</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1">
            <span>
              💡 <strong>Smart Handoff:</strong> Tự động tách tác vụ sang tab mới sạch để tránh gánh 100k+ tokens mỗi turn.
            </span>
            <span>{tabs.length} tab đang hoạt động</span>
          </div>
        </div>
      )}
    </div>
  );
}
