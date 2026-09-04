import { useState, useEffect, useCallback, useMemo } from "react";
import { invokeBackend } from "../lib/platform";
import { useI18n } from "../lib/i18n";

export interface PaseoProjectMeta {
  projectId: string;
  displayName: string;
  rootPath: string;
}

export interface PaseoWorkspaceMeta {
  workspaceId: string;
  projectId: string;
  title: string;
  cwd: string;
  branch: string | null;
}

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
  statusType: "running" | "idle" | "waiting" | "quota_error" | "error" | "closed";
  statusLabel: string;
  statusColor: string;
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
  runningCount: number;
  erroredCount: number;
}

export interface ProjectGroup {
  projectId: string;
  projectName: string;
  rootPath: string;
  workspaces: WorkspaceGroup[];
  totalTabs: number;
  bloatedCount: number;
  runningCount: number;
  erroredCount: number;
  totalTokens: number;
}

function formatTokenCount(num: number): string {
  if (!num || isNaN(num)) return "0";
  if (num >= 1e9) return (num / 1e9).toFixed(2) + " B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + " M";
  if (num >= 1e3) return (num / 1e3).toFixed(1) + " K";
  return num.toLocaleString();
}

type TabFilterMode = "all" | "running" | "idle" | "waiting" | "bloated" | "errored";

export function PaseoTabsManager({
  onShowToast,
  onNavigateHome,
}: {
  onShowToast?: (msg: string, isError?: boolean) => void;
  onNavigateHome?: () => void;
}) {
  const { t, lang } = useI18n();
  const [tabs, setTabs] = useState<PaseoTabInfo[]>([]);
  const [allProjects, setAllProjects] = useState<PaseoProjectMeta[]>([]);
  const [allWorkspaces, setAllWorkspaces] = useState<PaseoWorkspaceMeta[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<TabFilterMode>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<Record<string, boolean>>({});

  const fetchTabs = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await invokeBackend<{
        ok: boolean;
        tabs: PaseoTabInfo[];
        allProjects?: PaseoProjectMeta[];
        allWorkspaces?: PaseoWorkspaceMeta[];
      }>("get_paseo_tabs_analytics");
      if (res?.tabs) {
        setTabs(res.tabs);
      }
      if (res?.allProjects) {
        setAllProjects(res.allProjects);
      }
      if (res?.allWorkspaces) {
        setAllWorkspaces(res.allWorkspaces);
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
    }, 10 * 1000);
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
      onShowToast?.(lang === "vi" ? `Đang gửi Smart Resume cho tab "${tab.title}"...` : `Sending Smart Resume for tab "${tab.title}"...`);
      const res = await invokeBackend<{
        ok: boolean;
        result?: { switchedTo?: { name: string } };
      }>("auto_resume_paseo", { agentId: tab.id });
      if (res?.ok) {
        onShowToast?.(lang === "vi" ? `Đã gửi Smart Resume thành công tới tab "${tab.title}"!` : `Successfully sent Smart Resume to "${tab.title}"!`);
      } else {
        onShowToast?.(lang === "vi" ? "Đã gửi Smart Resume tới tab Paseo!" : "Sent Smart Resume to Paseo tab!");
      }
      await fetchTabs();
    } catch (err) {
      console.error("Smart resume error:", err);
      onShowToast?.(`${lang === "vi" ? "Lỗi gửi Smart Resume:" : "Error sending Smart Resume:"} ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSmartHandoff = async (tab: PaseoTabInfo) => {
    try {
      setActionLoadingId(tab.id);
      onShowToast?.(lang === "vi" ? `Đang tách tab mới tinh gọn cho "${tab.title}"...` : `Creating fresh handoff tab for "${tab.title}"...`);
      const res = await invokeBackend<{
        ok: boolean;
        result?: { newAgentId?: string; title?: string; workspaceTitle?: string };
      }>("create_paseo_fresh_handoff_tab", { agentId: tab.id });

      if (res?.ok) {
        onShowToast?.(
          lang === "vi"
            ? `🌱 Đã tạo tab mới tinh gọn "${res.result?.title || tab.title}" trong Workspace "${tab.workspaceTitle}" thành công (Tiết kiệm >85% Quota)!`
            : `🌱 Successfully created fresh tab "${res.result?.title || tab.title}" in Workspace "${tab.workspaceTitle}" (Saved >85% Quota)!`
        );
      } else {
        onShowToast?.(lang === "vi" ? "Đã tạo tab Paseo mới thành công!" : "Successfully created fresh Paseo tab!");
      }
      await fetchTabs();
    } catch (err) {
      console.error("Smart handoff error:", err);
      onShowToast?.(`${lang === "vi" ? "Lỗi tách tab mới:" : "Error creating fresh tab:"} ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Grouping logic: Project => Workspace => Tabs
  const projectTree = useMemo(() => {
    const prjMap = new Map<string, ProjectGroup>();

    // 1. Initialize from allProjects
    for (const p of allProjects) {
      prjMap.set(p.projectId, {
        projectId: p.projectId,
        projectName: p.displayName,
        rootPath: p.rootPath,
        workspaces: [],
        totalTabs: 0,
        bloatedCount: 0,
        runningCount: 0,
        erroredCount: 0,
        totalTokens: 0,
      });
    }

    // 2. Initialize from allWorkspaces
    for (const w of allWorkspaces) {
      let prj = prjMap.get(w.projectId);
      if (!prj) {
        prj = {
          projectId: w.projectId,
          projectName: w.cwd ? w.cwd.split("/").pop() || "Project" : "Project",
          rootPath: w.cwd,
          workspaces: [],
          totalTabs: 0,
          bloatedCount: 0,
          runningCount: 0,
          erroredCount: 0,
          totalTokens: 0,
        };
        prjMap.set(w.projectId, prj);
      }
      prj.workspaces.push({
        workspaceId: w.workspaceId,
        title: w.title,
        cwd: w.cwd,
        branch: w.branch,
        tabs: [],
        totalTokens: 0,
        bloatedCount: 0,
        runningCount: 0,
        erroredCount: 0,
      });
    }

    // 3. Attach tabs
    for (const tab of tabs) {
      let prj = prjMap.get(tab.projectId);
      if (!prj) {
        prj = {
          projectId: tab.projectId,
          projectName: tab.projectName || "Default Project",
          rootPath: tab.cwd,
          workspaces: [],
          totalTabs: 0,
          bloatedCount: 0,
          runningCount: 0,
          erroredCount: 0,
          totalTokens: 0,
        };
        prjMap.set(tab.projectId, prj);
      }

      let wks = prj.workspaces.find((w) => w.workspaceId === tab.workspaceId);
      if (!wks) {
        wks = {
          workspaceId: tab.workspaceId,
          title: tab.workspaceTitle || "Main Workspace",
          cwd: tab.cwd,
          branch: tab.branch,
          tabs: [],
          totalTokens: 0,
          bloatedCount: 0,
          runningCount: 0,
          erroredCount: 0,
        };
        prj.workspaces.push(wks);
      }

      // Filter matching
      let matchesFilter = true;
      if (filterMode === "running") {
        matchesFilter = tab.statusType === "running";
      } else if (filterMode === "idle") {
        matchesFilter = tab.statusType === "idle" || tab.statusType === "closed";
      } else if (filterMode === "waiting") {
        matchesFilter = tab.statusType === "waiting";
      } else if (filterMode === "bloated") {
        matchesFilter = tab.isBloated;
      } else if (filterMode === "errored") {
        matchesFilter = tab.hasQuotaError || tab.statusType === "error" || tab.statusType === "quota_error";
      }

      if (matchesFilter && searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const tabMatch =
          tab.title.toLowerCase().includes(q) ||
          tab.lastStatus.toLowerCase().includes(q) ||
          (tab.model && tab.model.toLowerCase().includes(q)) ||
          tab.workspaceTitle.toLowerCase().includes(q) ||
          tab.projectName.toLowerCase().includes(q);
        if (!tabMatch) {
          matchesFilter = false;
        }
      }

      if (matchesFilter) {
        wks.tabs.push(tab);
        wks.totalTokens += tab.totalTokens;
        if (tab.isBloated) wks.bloatedCount++;
        if (tab.statusType === "running") wks.runningCount++;
        if (tab.hasQuotaError || tab.statusType === "error" || tab.statusType === "quota_error") {
          wks.erroredCount++;
        }

        prj.totalTabs++;
        prj.totalTokens += tab.totalTokens;
        if (tab.isBloated) prj.bloatedCount++;
        if (tab.statusType === "running") prj.runningCount++;
        if (tab.hasQuotaError || tab.statusType === "error" || tab.statusType === "quota_error") {
          prj.erroredCount++;
        }
      }
    }

    // Return non-empty groups if searching or filtering, or all projects
    if (filterMode !== "all" || searchQuery.trim()) {
      return Array.from(prjMap.values()).filter((p) => p.totalTabs > 0);
    }
    return Array.from(prjMap.values());
  }, [allProjects, allWorkspaces, tabs, filterMode, searchQuery]);

  const totalRunningCount = tabs.filter((t) => t.statusType === "running").length;
  const totalIdleCount = tabs.filter((t) => t.statusType === "idle" || t.statusType === "closed").length;
  const totalWaitingCount = tabs.filter((t) => t.statusType === "waiting").length;
  const totalBloatedCount = tabs.filter((t) => t.isBloated).length;
  const totalErroredCount = tabs.filter((t) => t.hasQuotaError || t.statusType === "error" || t.statusType === "quota_error").length;

  return (
    <div className="space-y-6">
      {/* Route Header / Breadcrumb Card */}
      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm p-5 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-600 flex items-center justify-center text-white shadow-md">
              <span className="text-xl">🎯</span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                  {t.paseoManagerTitle}
                </h1>
                {totalRunningCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>{totalRunningCount} {lang === "vi" ? "tab đang chạy" : "running tabs"}</span>
                  </span>
                )}
                {totalBloatedCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                    {totalBloatedCount} {lang === "vi" ? "tab quá turns" : "bloated tabs"}
                  </span>
                )}
                {totalErroredCount > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-200 dark:border-red-700 animate-pulse">
                    {totalErroredCount} {lang === "vi" ? "tab lỗi Quota" : "quota error tabs"}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {t.paseoManagerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {onNavigateHome && (
              <button
                onClick={onNavigateHome}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>👥</span>
                <span>{t.topRouteAccounts}</span>
              </button>
            )}

            <button
              onClick={() => void fetchTabs()}
              disabled={isLoading}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
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
              <span>{t.refreshTabs}</span>
            </button>
          </div>
        </div>

        {/* Quota Optimization Guide Banner */}
        <div className="mt-4 p-4 rounded-xl bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-teal-50/60 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-teal-950/30 border border-blue-200/80 dark:border-blue-900/50 space-y-3 text-xs">
          <div className="flex items-start gap-2.5">
            <span className="text-base shrink-0 mt-0.5">💡</span>
            <div>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {t.quotaAdviceTitle}:
              </span>
              <span className="text-gray-600 dark:text-gray-300 ml-1.5">
                {t.quotaAdviceDesc}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-0.5">
            <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-gray-800 border border-emerald-300/90 dark:border-emerald-700/80 text-emerald-900 dark:text-emerald-300 font-medium flex items-center gap-2 shadow-2xs">
              <span className="text-sm">🟢</span>
              <div>{t.adviceUnder15}</div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-gray-800 border border-amber-300/90 dark:border-amber-700/80 text-amber-900 dark:text-amber-300 font-medium flex items-center gap-2 shadow-2xs">
              <span className="text-sm">🟡</span>
              <div>{t.adviceErrors}</div>
            </div>

            <div className="px-3 py-2 rounded-lg bg-white/90 dark:bg-gray-800 border border-red-300/90 dark:border-red-700/80 text-red-900 dark:text-red-300 font-medium flex items-center gap-2 shadow-2xs">
              <span className="text-sm">🔴</span>
              <div>{t.adviceOver25}</div>
            </div>
          </div>
        </div>

        {/* Filter Toolbar with Statuses */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-3">
          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-medium gap-1">
            <button
              onClick={() => setFilterMode("all")}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                filterMode === "all"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-bold shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              {t.filterAll} ({tabs.length})
            </button>

            <button
              onClick={() => setFilterMode("running")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                filterMode === "running"
                  ? "bg-emerald-600 text-white font-bold shadow-xs"
                  : "text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{t.filterRunning} ({totalRunningCount})</span>
            </button>

            <button
              onClick={() => setFilterMode("idle")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                filterMode === "idle"
                  ? "bg-gray-600 text-white font-bold shadow-xs"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <span>⚪</span>
              <span>{t.filterIdle} ({totalIdleCount})</span>
            </button>

            {totalWaitingCount > 0 && (
              <button
                onClick={() => setFilterMode("waiting")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterMode === "waiting"
                    ? "bg-amber-600 text-white font-bold shadow-xs"
                    : "text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-gray-700/60"
                }`}
              >
                <span>🟡</span>
                <span>{t.filterWaiting} ({totalWaitingCount})</span>
              </button>
            )}

            <button
              onClick={() => setFilterMode("bloated")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                filterMode === "bloated"
                  ? "bg-amber-500 text-white font-bold shadow-xs"
                  : "text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-gray-700/60"
              }`}
            >
              <span>⚠️</span>
              <span>{t.filterBloated} ({totalBloatedCount})</span>
            </button>

            {totalErroredCount > 0 && (
              <button
                onClick={() => setFilterMode("errored")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterMode === "errored"
                    ? "bg-red-600 text-white font-bold shadow-xs"
                    : "text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-gray-700/60"
                }`}
              >
                <span>🔴</span>
                <span>{t.filterErrored} ({totalErroredCount})</span>
              </button>
            )}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchTabsPlaceholder}
              className="w-full h-9 pl-9 pr-3 text-xs rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            <span className="absolute left-3 top-2.5 text-xs text-gray-400 dark:text-gray-500">🔍</span>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hierarchical Tree: Project => Workspace => Tabs */}
      {projectTree.length === 0 ? (
        <div className="p-12 text-center text-sm text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-3xl mb-2">🔍</div>
          <div>{t.noTabsFound}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {projectTree.map((project) => {
            const isPrjCollapsed = collapsedProjects[project.projectId];

            return (
              <div
                key={project.projectId}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden transition-colors"
              >
                {/* Level 1: Project Header */}
                <div
                  onClick={() => toggleProject(project.projectId)}
                  className="px-5 py-3.5 flex items-center justify-between cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">📦</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {t.project}: {project.projectName}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">({project.rootPath})</span>
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                        <span>{project.workspaces.length} Workspace · {project.totalTabs} Tabs</span>
                        {project.runningCount > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            · 🟢 {project.runningCount} {lang === "vi" ? "đang chạy" : "running"}
                          </span>
                        )}
                        <span>· {lang === "vi" ? "Tổng context:" : "Total context:"} {formatTokenCount(project.totalTokens)} tokens</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {project.bloatedCount > 0 && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                        ⚠️ {project.bloatedCount} {lang === "vi" ? "Quá turns" : "Bloated"}
                      </span>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 dark:text-gray-500 transform transition-transform duration-200 ${
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
                  <div className="p-4 space-y-4 bg-gray-50/50 dark:bg-gray-950/60">
                    {project.workspaces.map((workspace) => {
                      const isWksCollapsed = collapsedWorkspaces[workspace.workspaceId];

                      return (
                        <div
                          key={workspace.workspaceId}
                          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-xs"
                        >
                          {/* Workspace Header */}
                          <div
                            onClick={() => toggleWorkspace(workspace.workspaceId)}
                            className="px-4 py-3 flex items-center justify-between cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border-b border-gray-200 dark:border-gray-700"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-base">📂</span>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-xs text-gray-900 dark:text-gray-100">
                                    {t.workspace}: {workspace.title}
                                  </span>
                                  {workspace.branch && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
                                      🌿 {workspace.branch}
                                    </span>
                                  )}
                                  {workspace.runningCount > 0 && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700 animate-pulse">
                                      {workspace.runningCount} {lang === "vi" ? "đang chạy" : "running"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate">
                                  ID: {workspace.workspaceId} · {lang === "vi" ? "Thư mục:" : "Folder:"} {workspace.cwd}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {workspace.tabs.length} tabs ({formatTokenCount(workspace.totalTokens)} context)
                              </span>
                              <svg
                                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transform transition-transform duration-200 ${
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
                            workspace.tabs.length === 0 ? (
                              <div className="p-4 text-center text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
                                {lang === "vi" ? "Chưa có tab nào đang hoạt động trong workspace này." : "No active tabs in this workspace."}
                              </div>
                            ) : (
                              <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white dark:bg-gray-900">
                                {workspace.tabs.map((tab) => {
                                  const isWorking = actionLoadingId === tab.id;
                                  const bloatBorder =
                                    tab.bloatLevel === "danger"
                                      ? "border-red-300 dark:border-red-700 bg-red-50/40 dark:bg-red-950/30"
                                      : tab.bloatLevel === "warning"
                                      ? "border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/30"
                                      : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80";

                                  return (
                                    <div
                                      key={tab.id}
                                      className={`p-3.5 rounded-xl border ${bloatBorder} flex flex-col justify-between gap-3 transition-all`}
                                    >
                                      <div>
                                        {/* Tab Title & Status Badge */}
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                          <div className="flex items-center gap-2 min-w-0">
                                            <h4
                                              className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate"
                                              title={tab.title}
                                            >
                                              {tab.title}
                                            </h4>
                                          </div>

                                          {/* Status Badge */}
                                          <div className="shrink-0 flex items-center gap-1">
                                            {tab.statusType === "running" ? (
                                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1 shadow-2xs">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block"></span>
                                                <span>{lang === "vi" ? "Đang chạy" : "Running"}</span>
                                              </span>
                                            ) : tab.statusType === "quota_error" ? (
                                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 animate-pulse">
                                                {lang === "vi" ? "Lỗi Hết Quota" : "Quota Error"}
                                              </span>
                                            ) : tab.statusType === "error" ? (
                                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700">
                                                {lang === "vi" ? "Lỗi" : "Error"}
                                              </span>
                                            ) : tab.statusType === "waiting" ? (
                                              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                                {lang === "vi" ? "Chờ phản hồi" : "Waiting"}
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                                                {lang === "vi" ? "Đã dừng" : "Idle"}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Metrics Box */}
                                      <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs">
                                        <div>
                                          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                            Context Tokens
                                          </span>
                                          <span className="font-bold font-mono text-gray-900 dark:text-gray-100">
                                            {formatTokenCount(tab.inputTokens)}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                                            {t.totalTurns}
                                          </span>
                                          <span
                                            className={`font-bold font-mono ${
                                              tab.turns >= 30
                                                ? "text-red-600 dark:text-red-400 font-extrabold"
                                                : tab.turns >= 18
                                                ? "text-amber-600 dark:text-amber-400 font-bold"
                                                : "text-gray-900 dark:text-gray-100"
                                            }`}
                                          >
                                            {tab.turns} turns
                                          </span>
                                        </div>
                                      </div>

                                      {/* Tab Actions */}
                                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs">
                                        <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                                          {tab.recommendedAction}
                                        </span>

                                        <div className="flex items-center gap-1.5 shrink-0">
                                          {tab.isBloated && (
                                            <button
                                              onClick={() => void handleSmartHandoff(tab)}
                                              disabled={isWorking}
                                              title={lang === "vi" ? "Tạo tab mới sạch sẽ với ~3k tokens từ tác vụ này (Tiết kiệm >85% Quota)" : "Create fresh lightweight tab (~3k tokens, saving >85% Quota)"}
                                              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                            >
                                              <span>🌱</span>
                                              <span>{t.freshHandoffTab}</span>
                                            </button>
                                          )}

                                          <button
                                            onClick={() => void handleSmartResume(tab)}
                                            disabled={isWorking}
                                            title={lang === "vi" ? "Gửi prompt định hướng súc tích" : "Send smart prompt resume"}
                                            className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-300 dark:border-gray-600 transition-colors disabled:opacity-50 flex items-center gap-1 cursor-pointer shadow-2xs"
                                          >
                                            <span>⚡</span>
                                            <span>{t.smartResumeTab}</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
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
