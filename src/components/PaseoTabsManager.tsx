import { useState, useEffect, useCallback, useMemo } from "react";
import { invokeBackend } from "../lib/platform";

export interface PaseoTabInfo {
  id: string;
  title: string;
  cwd: string;
  workspaceId: string;
  workspaceTitle: string;
  projectId: string;
  projectName: string;
  branch: string | null;
  provider: string;
  model: string | null;
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

export interface WorkspaceGroup {
  workspaceId: string;
  title: string;
  cwd: string;
  branch: string | null;
  tabs: PaseoTabInfo[];
  totalTokens: number;
  bloatedCount: number;
}

export interface ProjectGroup {
  projectId: string;
  projectName: string;
  rootPath: string;
  workspaces: WorkspaceGroup[];
  totalTabs: number;
  bloatedCount: number;
  totalTokens: number;
}

function formatTokenCount(num: number): string {
  if (!num || isNaN(num)) return "0";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + " B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + " M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + " K";
  return num.toLocaleString();
}

type TabFilterMode = "all" | "bloated" | "errored";

export function PaseoTabsManager({
  onShowToast,
  onNavigateHome,
}: {
  onShowToast?: (msg: string, isError?: boolean) => void;
  onNavigateHome?: () => void;
}) {
  const [tabs, setTabs] = useState<PaseoTabInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<TabFilterMode>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});

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

  const toggleProject = (projectId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  };

  const toggleWorkspace = (wksId: string) => {
    setCollapsedWorkspaces((prev) => ({ ...prev, [wksId]: !prev[wksId] }));
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

  // Grouping logic: Project => Workspace => Tabs
  const projectTree = useMemo(() => {
    const filtered = tabs.filter((t) => {
      if (filterMode === "bloated" && !t.isBloated) return false;
      if (filterMode === "errored" && !t.hasQuotaError) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesWks = t.workspaceTitle.toLowerCase().includes(q);
        const matchesPrj = t.projectName.toLowerCase().includes(q);
        const matchesCwd = t.cwd.toLowerCase().includes(q);
        if (!matchesTitle && !matchesWks && !matchesPrj && !matchesCwd) return false;
      }
      return true;
    });

    const prjMap = new Map<string, ProjectGroup>();

    for (const tab of filtered) {
      const pId = tab.projectId || "default_prj";
      let prj = prjMap.get(pId);
      if (!prj) {
        prj = {
          projectId: pId,
          projectName: tab.projectName || "Dự Án Chính",
          rootPath: tab.cwd,
          workspaces: [],
          totalTabs: 0,
          bloatedCount: 0,
          totalTokens: 0,
        };
        prjMap.set(pId, prj);
      }

      prj.totalTabs++;
      prj.totalTokens += tab.inputTokens;
      if (tab.isBloated) prj.bloatedCount++;

      const wId = tab.workspaceId || "default_wks";
      let wks = prj.workspaces.find((w) => w.workspaceId === wId);
      if (!wks) {
        wks = {
          workspaceId: wId,
          title: tab.workspaceTitle || "Workspace",
          cwd: tab.cwd,
          branch: tab.branch,
          tabs: [],
          totalTokens: 0,
          bloatedCount: 0,
        };
        prj.workspaces.push(wks);
      }

      wks.tabs.push(tab);
      wks.totalTokens += tab.inputTokens;
      if (tab.isBloated) wks.bloatedCount++;
    }

    return Array.from(prjMap.values());
  }, [tabs, filterMode, searchQuery]);

  const totalBloatedCount = tabs.filter((t) => t.isBloated).length;
  const totalErroredCount = tabs.filter((t) => t.hasQuotaError).length;

  return (
    <div className="space-y-6">
      {/* Route Header / Breadcrumb Card */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl shadow-xs p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-md">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">
                  Quản Lý Projects, Workspaces & Tabs Paseo
                </h1>
                {totalBloatedCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/50">
                    {totalBloatedCount} tab quá turns
                  </span>
                )}
                {totalErroredCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300 border border-red-200/50 dark:border-red-800/50 animate-pulse">
                    {totalErroredCount} tab lỗi Quota
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Cấu trúc phân cấp <strong className="text-gray-700 dark:text-gray-300">Project ➔ Workspace ➔ Tabs</strong> giúp theo dõi turns, context tokens và tách tab tinh gọn để tiết kiệm 85% Quota.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>⬅️</span>
                <span>Dashboard Tài Khoản</span>
              </button>
            )}

            <button
              onClick={() => void fetchTabs()}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <svg
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
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
              <span>Làm mới</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
          {/* Quick Filter Pills */}
          <div className="flex items-center bg-gray-100/80 dark:bg-gray-800/80 p-1 rounded-xl border border-gray-200/50 dark:border-gray-700/50 text-xs font-medium">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === "all"
                  ? "bg-white dark:bg-gray-700 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              Tất cả ({tabs.length})
            </button>
            <button
              onClick={() => setFilterMode("bloated")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                filterMode === "bloated"
                  ? "bg-white dark:bg-gray-700 text-amber-700 dark:text-amber-300 font-semibold shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
              }`}
            >
              <span>🔴</span>
              <span>Quá Turns ({totalBloatedCount})</span>
            </button>
            {totalErroredCount > 0 && (
              <button
                onClick={() => setFilterMode("errored")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterMode === "errored"
                    ? "bg-white dark:bg-gray-700 text-red-700 dark:text-red-300 font-semibold shadow-xs"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900"
                }`}
              >
                <span>⚠️</span>
                <span>Lỗi Quota ({totalErroredCount})</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[280px] flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên tab, workspace, project..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hierarchical Tree: Project => Workspace => Tabs */}
      {projectTree.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-400 dark:text-gray-500 bg-white/50 dark:bg-gray-900/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
          <div className="text-3xl mb-2">🔍</div>
          <div>Không tìm thấy tab nào phù hợp với bộ lọc hiện tại.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {projectTree.map((project) => {
            const isPrjCollapsed = collapsedProjects[project.projectId];

            return (
              <div
                key={project.projectId}
                className="rounded-2xl border border-gray-200/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-900/80 shadow-xs overflow-hidden"
              >
                {/* Level 1: Project Header */}
                <div
                  onClick={() => toggleProject(project.projectId)}
                  className="px-5 py-3.5 flex items-center justify-between cursor-pointer bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-gray-800/80 dark:to-gray-800/40 hover:from-gray-100 hover:to-gray-150 dark:hover:from-gray-750 transition-all border-b border-gray-100 dark:border-gray-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">📦</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-white">
                          Project: {project.projectName}
                        </span>
                        <span className="text-xs text-gray-400 font-mono">({project.rootPath})</span>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {project.workspaces.length} Workspace · {project.totalTabs} Tabs · Tổng context: {formatTokenCount(project.totalTokens)} tokens
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {project.bloatedCount > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                        🔴 {project.bloatedCount} Tab quá turns
                      </span>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transform transition-transform duration-200 ${
                        isPrjCollapsed ? "-rotate-90" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Level 2: Workspaces in Project */}
                {!isPrjCollapsed && (
                  <div className="p-4 space-y-4 bg-gray-50/20 dark:bg-gray-950/20">
                    {project.workspaces.map((workspace) => {
                      const isWksCollapsed = collapsedWorkspaces[workspace.workspaceId];

                      return (
                        <div
                          key={workspace.workspaceId}
                          className="rounded-xl border border-gray-200/70 dark:border-gray-750 bg-white dark:bg-gray-850 overflow-hidden shadow-2xs"
                        >
                          {/* Workspace Header */}
                          <div
                            onClick={() => toggleWorkspace(workspace.workspaceId)}
                            className="px-4 py-3 flex items-center justify-between cursor-pointer bg-gray-50/70 dark:bg-gray-800/50 hover:bg-gray-100/60 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base">📂</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                    Workspace: {workspace.title}
                                  </span>
                                  {workspace.branch && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200/50">
                                      🌿 {workspace.branch}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-400 font-mono truncate">
                                  ID: {workspace.workspaceId} · Thư mục: {workspace.cwd}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {workspace.tabs.length} tab ({formatTokenCount(workspace.totalTokens)} context)
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-400 transform transition-transform duration-200 ${
                                  isWksCollapsed ? "-rotate-90" : ""
                                }`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>

                          {/* Level 3: Tabs in Workspace */}
                          {!isWksCollapsed && (
                            <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
                              {workspace.tabs.map((tab) => {
                                const isWorking = actionLoadingId === tab.id;
                                const bloatBorder =
                                  tab.bloatLevel === "danger"
                                    ? "border-red-200/80 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/20"
                                    : tab.bloatLevel === "warning"
                                    ? "border-amber-200/80 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20"
                                    : "border-gray-200/60 bg-gray-50/20 dark:border-gray-800 dark:bg-gray-900/30";

                                return (
                                  <div
                                    key={tab.id}
                                    className={`p-3.5 rounded-xl border ${bloatBorder} flex flex-col justify-between gap-3 transition-all`}
                                  >
                                    <div>
                                      {/* Tab Title & Status */}
                                      <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-base">
                                            {tab.bloatLevel === "danger"
                                              ? "🔴"
                                              : tab.bloatLevel === "warning"
                                              ? "🟡"
                                              : "🟢"}
                                          </span>
                                          <h4
                                            className="text-xs font-bold text-gray-900 dark:text-white truncate"
                                            title={tab.title}
                                          >
                                            {tab.title}
                                          </h4>
                                        </div>
                                        {tab.hasQuotaError && (
                                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300 shrink-0">
                                            Hết Quota
                                          </span>
                                        )}
                                      </div>

                                      {/* Metrics Box */}
                                      <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 text-xs">
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
                                          <span
                                            className={`font-bold font-mono ${
                                              tab.turns >= 30
                                                ? "text-red-600 dark:text-red-400 font-extrabold"
                                                : tab.turns >= 18
                                                ? "text-amber-600 dark:text-amber-400 font-bold"
                                                : "text-gray-900 dark:text-white"
                                            }`}
                                          >
                                            {tab.turns} turns
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Tab Actions */}
                                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200/50 dark:border-gray-750 text-xs">
                                      <span className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                                        {tab.recommendedAction}
                                      </span>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {tab.isBloated && (
                                          <button
                                            onClick={() => void handleSmartHandoff(tab)}
                                            disabled={isWorking}
                                            title="Tạo tab mới sạch sẽ với ~3k tokens từ tác vụ này (Tiết kiệm >85% Quota)"
                                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                          >
                                            <span>🌱</span>
                                            <span>Tách Tab</span>
                                          </button>
                                        )}

                                        <button
                                          onClick={() => void handleSmartResume(tab)}
                                          disabled={isWorking}
                                          title="Gửi prompt định hướng súc tích"
                                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>⚡</span>
                                          <span>Resume</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
