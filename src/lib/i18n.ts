import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type Language = "en" | "vi";

export const LANGUAGE_STORAGE_KEY = "codex-switcher-language";
export const LANGUAGE_CHANGED_EVENT = "language-changed";

export function readStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === "vi" ? "vi" : "en";
  } catch {
    return "en";
  }
}

export function writeStoredLanguage(lang: Language): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (e) {
    console.error("Failed to write language to storage:", e);
  }
}

export const translations = {
  en: {
    // Header & Brand
    appTitle: "Codex Switcher",
    appSubtitle: "Manage ChatGPT & Codex CLI Accounts",

    // Header Actions & Buttons
    maskShowAll: "Show all account names and emails",
    maskHideAll: "Hide all account names and emails",
    refreshAllUsage: "Refresh all usage",
    refreshingUsage: "Refreshing all usage...",
    warmUpAll: "Warm up all accounts",
    warmingUpAll: "Warming up all accounts...",
    searchAccounts: "Search accounts",
    hideSearch: "Hide account search",
    searchPlaceholder: "Search accounts by name or email...",
    menu: "Menu",
    accountMenu: "Account",

    // Top Route Navigation
    topRouteAccounts: "Account Dashboard",
    topRoutePaseo: "Paseo Workspaces & Tabs",
    otherAccountsLabel: "Other Accounts",
    activeAccountHeading: "Active Account",
    sortLabel: "Sort",
    sortDeadlineAsc: "Reset: earliest to latest",
    sortDeadlineDesc: "Reset: latest to earliest",
    sortRemainingDesc: "% remaining: highest to lowest",
    sortRemainingAsc: "% remaining: lowest to highest",
    sortSubscriptionAsc: "Expiry: earliest to latest",
    sortSubscriptionDesc: "Expiry: latest to earliest",
    noMatchingAccounts: "No matching accounts",
    tryDifferentSearch: "Try a different account name or email address.",

    // Status Bar & Process Controls
    codexRunning: "Codex is running",
    codexStopped: "Codex is stopped",
    paseoRunning: "Paseo is running",
    paseoStopped: "Paseo is stopped",
    processes: "processes",
    openCodex: "Open Codex",
    closeCodex: "Close Codex",
    forceCloseCodex: "Force Close Codex",
    openPaseo: "Open Paseo",
    closePaseo: "Close Paseo",
    forceClosePaseo: "Force Close Paseo",
    opening: "Opening...",
    closing: "Closing...",
    stopping: "Stopping...",
    switchAndResumeBtn: "🚀 Switch & Resume Paseo",
    switchAndRestartPaseoBtn: "🔄 Restart Paseo",
    smartResumeAutoTitle: "Switch to best account (without closing app), reload config and send 'continue' to the quota-exhausted conversation",
    switchAndRestartTitle: "Automatically close Paseo, switch to best account and reopen Paseo",
    resumingPaseo: "⏳ Resuming...",
    restartingPaseo: "⏳ Restarting...",

    // Navigation Menu Items
    autoWarmUp: "Auto Warm Up",
    autoWarmUpAll: "Auto warm-up (all accounts)",
    timer: "Timer",
    timedWarmUp: "Timed warm-up",
    timedWarmUpDesc: "Warm up accounts at specific scheduled times daily",
    noTimesAdded: "No times added yet.",
    addTime: "Add",
    notifications: "Notifications",
    appearance: "Appearance",
    themeDark: "☾ Dark",
    themeLight: "☀ Light",
    language: "Language",
    langEn: "English",
    langVi: "Tiếng Việt",
    telegramOn: "Telegram: On",
    ntfyOn: "ntfy: On",
    off: "Off",
    on: "On",

    // Account Dropdown Actions
    addAccount: "Add Account",
    refreshMetadata: "Refresh Metadata",
    backupRestore: "Backup & Restore",
    exportFullEncrypted: "Export Full Backup (Encrypted)",
    importFullEncrypted: "Import Full Backup (Encrypted)",
    exportSlimText: "Export Slim Text",
    importSlimText: "Import Slim Text",
    openSessionsFolder: "Open Sessions Folder",
    tailscaleStatus: "Tailscale VPN",
    tailscaleConnected: "Tailscale: Connected",
    tailscaleDisconnected: "Tailscale: Disconnected",
    tailscaleLaunch: "Open Tailscale",

    // Account Card
    activeAccount: "Active",
    switchAccount: "Switch",
    switchingAccount: "Switching...",
    switchAndRestartPaseo: "Switch & Restart Paseo",
    deleteAccount: "Delete",
    renameAccount: "Rename",
    copyToken: "Copy Token",
    tokenCopied: "Copied Token!",
    refreshUsage: "Refresh Usage",
    resetCredits: "Reset Credits",
    usageStats: "Usage Stats",
    autoWarmupAccount: "Auto Warm-Up",
    autoWarmupManagedByAll: "Managed by global Auto Warm-Up",
    planType: "Plan",
    subscriptionExpiry: "Expiry",
    expired: "Expired",
    until: "Until",
    expiryUnavailable: "Expiry unavailable",
    rateLimit5Hour: "5-Hour Limit",
    rateLimitWeekly: "Weekly Limit",
    rateLimitCredits: "Credits",
    resetsIn: "Resets in",
    resetAt: "Reset at",
    lastRefreshed: "Last refreshed",
    never: "Never",
    justNow: "Just now",
    timeAgoSec: "s ago",
    timeAgoMin: "m ago",
    timeAgoHour: "h ago",
    noAccountsYet: "No accounts added yet.",
    addFirstAccount: "Add your first account to get started.",

    // Modals - Add Account
    addAccountModalTitle: "Add Account",
    tabBrowserLogin: "Log in with Browser",
    tabImportAuth: "Import auth.json",
    accountNameLabel: "Account Name",
    accountNamePlaceholder: "e.g. Personal, Work, Project X",
    loginWithBrowserBtn: "Log in with ChatGPT",
    authorizeInBrowserText: "A browser window has opened for authorization. If it didn't open automatically, copy and paste this URL:",
    copyAuthUrl: "Copy URL",
    authUrlCopied: "Copied!",
    waitingForLogin: "Waiting for login in browser...",
    cancelLoginBtn: "Cancel",
    chooseFile: "Choose File",
    importAuthJsonBtn: "Import Account",
    importing: "Importing...",

    // Modals - Notifications
    notificationSettingsTitle: "Notification & Auto-Switch Settings",
    notificationSettingsSubtitle: "Receive alerts via Telegram or ntfy when the active account is running low on quota",
    telegramSettings: "Telegram Bot Notifications",
    recommendedBadge: "Recommended",
    telegramBotToken: "Telegram Bot Token",
    telegramChatId: "Chat ID",
    telegramBotTokenHint: "Get from @BotFather when creating a bot.",
    telegramGetChatIdHint: "Send /start to your bot, then click 'Detect Chat ID'",
    detectChatId: "🔍 Detect Chat ID",
    detectingChatId: "Detecting...",
    chatIdEasyGuideTitle: "💡 Quick guide to get Chat ID:",
    chatIdEasyGuideStep1: "1. Open your bot on Telegram and press START (or send /start).",
    chatIdEasyGuideStep2: "2. Click the '🔍 Detect Chat ID' button above to auto-fill!",
    chatIdEasyGuideNote: "(Note: ID formatted like 888111... in idbot is the bot's ID; Chat ID for notifications must be your personal user ID).",
    ntfySettings: "Push Notifications via ntfy.sh",
    ntfyTopic: "Topic",
    ntfyTopicPlaceholder: "codex_alerts_myname",
    ntfyServer: "Server URL",
    alertThresholdTitle: "Alert Thresholds",
    alertThresholdLabel: "Alert when usage reaches:",
    cooldownMinutesLabel: "Cooldown interval:",
    cooldownOptionMin: "minutes",
    cooldownDefaultSuffix: "- Default",
    autoSwitchSection: "Smart Auto-Switch (Codex)",
    autoSwitchSectionDesc: "When the active account reaches the threshold, the system automatically scans and switches to the account with the most remaining quota (0% or lowest) and sends a notification.",
    autoSwitchEnabled: "Auto-switch to best account when quota is nearly exhausted",
    autoSwitchThresholdLabel: "Trigger auto-switch when active account usage reaches:",
    autoResumePaseoSection: "Paseo Multi-Agent Auto-Resume",
    autoResumePaseoSectionDesc: "Detect quota error ➔ Switch account ➔ Send 'continue' prompt without closing app",
    autoResumePaseoDetail: "When Paseo encounters 'You’ve hit your usage limit', the system will automatically switch accounts, reload the daemon config instantly, and send a resume message into ongoing tasks.",
    smartResumeMode: "Smart Resume Mode",
    smartResumeSmartBtn: "⚡ Smart (Recommended)",
    smartResumeCompactBtn: "📦 Compact",
    smartResumeCustomBtn: "✏️ Custom",
    smartResumeModeSmartDesc: "⚡ Smart guidance: directs AI to focus on pending tasks without re-reading old files, saving 60% reasoning tokens.",
    smartResumeModeCompactDesc: "📦 Sends: 'continue (output only code/diff changes, no theoretical explanations)'",
    smartResumeModeCustomDesc: "✏️ Uses exactly the custom prompt entered below.",
    customPromptLabel: "Resume Prompt Message",
    customPromptPlaceholder: "e.g. continue",
    testTelegramBtn: "✈️ Test Telegram Message",
    testNtfyBtn: "📡 Test ntfy",
    testSending: "Sending test...",
    saveSettings: "Save Settings",
    savingSettings: "Saving...",
    cancelBtn: "Cancel",
    closeBtn: "Close",
    forceCloseBtn: "Force close",

    // Modals - Export/Import Config
    exportSlimTitle: "Export Slim Text",
    importSlimTitle: "Import Slim Text",
    exportSlimDesc: "This slim string contains account secrets. Keep it private.",
    importSlimDesc: "Existing accounts are kept. Only missing accounts are imported.",
    copyToClipboard: "Copy to Clipboard",
    copiedToClipboard: "Copied to clipboard!",
    copyStringBtn: "Copy String",
    copiedBtn: "Copied",
    importConfigBtn: "Import Missing Accounts",
    pasteConfigPlaceholder: "Paste config string here",
    exportPlaceholder: "Export string will appear here",
    generating: "Generating...",

    // Modals - Confirmations
    deleteConfirmTitle: "Delete Account",
    deleteConfirmMsg: "Are you sure you want to delete this account? This action cannot be undone.",
    switchBlockedTitle: "Cannot Switch Account",
    switchBlockedRunningMsg: "Codex CLI is currently running. Please close it or use 'Force Close' before switching accounts.",
    forceCloseCodexPromptTitle: "Force close running Codex processes?",
    forceCloseCodexPromptDesc: "This will force close running Codex processes that currently block account switching.",
    forceClosePaseoPromptTitle: "Force close running Paseo processes?",
    forceClosePaseoPromptDesc: "This will force close running Paseo processes.",
    unsavedWorkLost: "Unsaved work may be lost.",
    clickDeleteAgainToConfirm: "Click delete again to confirm removal",
    usageRefreshedSuccess: "Usage refreshed successfully",

    // Dock prompt
    keepInDockTitle: "Keep Codex Switcher in the Dock?",
    keepInDockDesc: "When the window is closed, Codex Switcher can stay in the Dock or live only in the menu bar.",
    keepInDockLater: "You can always change this later from the tray popup.",
    dontAskAgain: "Don't ask again",
    keepInDockBtn: "Keep in Dock",
    menuBarOnlyBtn: "Menu Bar Only",

    // Analytics Widget
    analyticsTitle: "Token Analytics & Quota Overview",
    analyticsSubtitle: "Consolidated turns, input tokens, output tokens and quota across all accounts",
    window1h: "1 Hour",
    window24h: "24 Hours",
    window3d: "3 Days",
    window7d: "7 Days",
    window30d: "30 Days",
    totalTokens: "Total Tokens",
    totalTokensUsed: "Total Tokens Used",
    exactCount: "Exact:",
    tokenBreakdown: "Token Breakdown",
    totalTurns: "Total Turns",
    turns: "turns",
    avgPerTurn: "Avg / Turn",
    inputTokens: "Input Prompt",
    outputTokens: "Output Generation",
    reasoningTokens: "Reasoning / Thinking",
    cachedTokens: "Cached Input",
    cacheHitRate: "Cache Hit Rate",
    optimized: "optimized",
    savedTokens: "Saved:",
    systemQuotaPoolTitle: "System Total Pooled Quota",
    systemQuotaPoolDesc: "Cumulative remaining quota percentage across all accounts (100% per account)",
    capacityAvailable: "Capacity",
    usedRate: "Used",
    readyCount: "Ready 100%",
    midCount: "In Use (21-80%)",
    highCount: "Low Quota (81-94%)",
    exhaustedCount: "Exhausted (≥95%)",
    earliestReset: "Earliest Reset",
    earliestResetLabel: "Earliest Reset:",
    activeLabel: "Active:",
    afterPrefix: "in",
    analyticsFooter: "Data updated automatically from active Codex sessions",
    lastUpdated: "Updated at",

    // Paseo Tabs Manager
    paseoManagerTitle: "Paseo Projects, Workspaces & Tabs",
    paseoManagerSubtitle: "Monitor agent context bloat, turns, and smart auto-resume",
    filterAll: "All Tabs",
    filterRunning: "Running",
    filterIdle: "Idle",
    filterWaiting: "Waiting",
    filterBloated: "Bloated Context",
    filterErrored: "Quota Error",
    searchTabsPlaceholder: "Search tabs by title, project, or workspace...",
    refreshTabs: "Refresh Tabs",
    noTabsFound: "No Paseo tabs found matching filter.",
    workspace: "Workspace",
    project: "Project",
    turnsLabel: "turns",
    contextLabel: "Context",
    smartResumeTab: "⚡ Smart Resume",
    freshHandoffTab: "🌿 Fresh Handoff",
    resumeAllErrored: "🚀 Resume All Errored Tabs",
    bloatSafe: "Safe Context",
    bloatWarning: "Warning: High Context",
    bloatDanger: "Danger: Heavily Bloated",
    quotaAdviceTitle: "Quota Optimization Recommendation",
    quotaAdviceDesc: "The higher the turns, the larger the context loaded on every prompt. Recommended:",
    adviceUnder15: "Keep tasks under 15-20 turns for optimal speed and quota conservation.",
    adviceOver25: "For tasks over 25 turns, use 'Fresh Handoff' to split into a new tab.",
    adviceErrors: "When quota runs out, switch accounts and click 'Smart Resume'.",

    // Toast & Alerts
    toastCopied: "Copied to clipboard!",
    toastSaved: "Saved successfully!",
    toastError: "An error occurred:",
  },
  vi: {
    // Header & Brand
    appTitle: "Codex Switcher",
    appSubtitle: "Quản lý Tài khoản ChatGPT & Codex CLI",

    // Header Actions & Buttons
    maskShowAll: "Hiện toàn bộ tên và email tài khoản",
    maskHideAll: "Ẩn toàn bộ tên và email tài khoản",
    refreshAllUsage: "Làm mới hạn mức tất cả tài khoản",
    refreshingUsage: "Đang làm mới hạn mức...",
    warmUpAll: "Warm-up tất cả tài khoản",
    warmingUpAll: "Đang warm-up tất cả tài khoản...",
    searchAccounts: "Tìm kiếm tài khoản",
    hideSearch: "Ẩn ô tìm kiếm",
    searchPlaceholder: "Tìm tài khoản theo tên hoặc email...",
    menu: "Menu",
    accountMenu: "Tài khoản",

    // Top Route Navigation
    topRouteAccounts: "Dashboard Tài Khoản",
    topRoutePaseo: "Quản Lý Paseo (Project & Tabs)",
    otherAccountsLabel: "Các tài khoản khác",
    activeAccountHeading: "Tài khoản đang hoạt động",
    sortLabel: "Sắp xếp",
    sortDeadlineAsc: "Reset: Sớm nhất đến muộn nhất",
    sortDeadlineDesc: "Reset: Muộn nhất đến sớm nhất",
    sortRemainingDesc: "% còn lại: Cao đến thấp",
    sortRemainingAsc: "% còn lại: Thấp đến cao",
    sortSubscriptionAsc: "Hạn gói: Hết sớm nhất",
    sortSubscriptionDesc: "Hạn gói: Hết muộn nhất",
    noMatchingAccounts: "Không tìm thấy tài khoản phù hợp",
    tryDifferentSearch: "Hãy thử tìm với tên hoặc email khác.",

    // Status Bar & Process Controls
    codexRunning: "Codex đang chạy",
    codexStopped: "Codex đang tắt",
    paseoRunning: "Paseo đang chạy",
    paseoStopped: "Paseo đang tắt",
    processes: "tiến trình",
    openCodex: "Mở Codex",
    closeCodex: "Đóng Codex",
    forceCloseCodex: "Buộc dừng Codex",
    openPaseo: "Mở Paseo",
    closePaseo: "Đóng Paseo",
    forceClosePaseo: "Buộc dừng Paseo",
    opening: "Đang mở...",
    closing: "Đang đóng...",
    stopping: "Đang dừng...",
    switchAndResumeBtn: "🚀 Đổi Acc & Tiếp tục Paseo",
    switchAndRestartPaseoBtn: "🔄 Restart Paseo",
    smartResumeAutoTitle: "Đổi sang tài khoản tốt nhất (không cần tắt app), reload cấu hình và gửi 'tiếp tục' vào cuộc trò chuyện vừa hết quota",
    switchAndRestartTitle: "Tự động đóng Paseo, chuyển sang tài khoản tốt nhất và mở lại Paseo",
    resumingPaseo: "⏳ Đang gửi tiếp...",
    restartingPaseo: "⏳ Đang đổi...",

    // Navigation Menu Items
    autoWarmUp: "Tự động Warm Up",
    autoWarmUpAll: "Tự động warm-up (toàn bộ tài khoản)",
    timer: "Hẹn giờ",
    timedWarmUp: "Warm-up theo giờ cố định",
    timedWarmUpDesc: "Tự động warm-up các tài khoản vào các khung giờ cụ thể mỗi ngày",
    noTimesAdded: "Chưa có khung giờ nào.",
    addTime: "Thêm",
    notifications: "Thông báo & Bot",
    appearance: "Giao diện",
    themeDark: "☾ Tối (Dark)",
    themeLight: "☀ Sáng (Light)",
    language: "Ngôn ngữ (Language)",
    langEn: "English",
    langVi: "Tiếng Việt",
    telegramOn: "Telegram: Bật",
    ntfyOn: "ntfy: Bật",
    off: "Tắt",
    on: "Bật",

    // Account Dropdown Actions
    addAccount: "Thêm tài khoản",
    refreshMetadata: "Cập nhật thông tin gói",
    backupRestore: "Sao lưu & Khôi phục",
    exportFullEncrypted: "Xuất bản sao lưu đầy đủ (Mã hóa)",
    importFullEncrypted: "Nhập bản sao lưu đầy đủ (Mã hóa)",
    exportSlimText: "Xuất mã cấu hình nhanh (Slim Text)",
    importSlimText: "Nhập mã cấu hình nhanh (Slim Text)",
    openSessionsFolder: "Mở thư mục Sessions",
    tailscaleStatus: "Mạng VPN Tailscale",
    tailscaleConnected: "Tailscale: Đã kết nối",
    tailscaleDisconnected: "Tailscale: Chưa kết nối",
    tailscaleLaunch: "Mở Tailscale",

    // Account Card
    activeAccount: "Đang chọn",
    switchAccount: "Chuyển sang",
    switchingAccount: "Đang chuyển...",
    switchAndRestartPaseo: "Đổi Acc & Khởi động lại Paseo",
    deleteAccount: "Xóa tài khoản",
    renameAccount: "Đổi tên",
    copyToken: "Sao chép Token",
    tokenCopied: "Đã sao chép Token!",
    refreshUsage: "Làm mới hạn mức",
    resetCredits: "Lịch sử Quota",
    usageStats: "Thống kê dùng",
    autoWarmupAccount: "Tự động Warm-Up",
    autoWarmupManagedByAll: "Đang quản lý bởi Warm-Up toàn cục",
    planType: "Gói",
    subscriptionExpiry: "Hạn dùng",
    expired: "Đã hết hạn",
    until: "Đến ngày",
    expiryUnavailable: "Chưa có thông tin hạn",
    rateLimit5Hour: "Hạn mức 5 Giờ",
    rateLimitWeekly: "Hạn mức Tuần",
    rateLimitCredits: "Credits",
    resetsIn: "Reset sau",
    resetAt: "Reset lúc",
    lastRefreshed: "Làm mới lúc",
    never: "Chưa bao giờ",
    justNow: "Vừa xong",
    timeAgoSec: "giây trước",
    timeAgoMin: "phút trước",
    timeAgoHour: "giờ trước",
    noAccountsYet: "Chưa có tài khoản nào.",
    addFirstAccount: "Thêm tài khoản đầu tiên để bắt đầu sử dụng.",

    // Modals - Add Account
    addAccountModalTitle: "Thêm Tài Khoản Codex",
    tabBrowserLogin: "Đăng nhập qua Trình duyệt",
    tabImportAuth: "Nhập file auth.json",
    accountNameLabel: "Tên tài khoản",
    accountNamePlaceholder: "VD: Cá nhân, Công ty, Dự án A...",
    loginWithBrowserBtn: "Đăng nhập với ChatGPT",
    authorizeInBrowserText: "Cửa sổ trình duyệt đang mở để xác thực. Nếu trình duyệt không tự mở, hãy sao chép đường link bên dưới:",
    copyAuthUrl: "Sao chép Link",
    authUrlCopied: "Đã sao chép!",
    waitingForLogin: "Đang chờ đăng nhập trên trình duyệt...",
    cancelLoginBtn: "Hủy bỏ",
    chooseFile: "Chọn tập tin",
    importAuthJsonBtn: "Nhập tài khoản",
    importing: "Đang nhập...",

    // Modals - Notifications
    notificationSettingsTitle: "Cấu hình Thông Báo & Tự Động Xoay Tua",
    notificationSettingsSubtitle: "Nhận cảnh báo qua Telegram hoặc ntfy khi tài khoản active sắp hết hạn mức",
    telegramSettings: "Thông báo qua Telegram Bot",
    recommendedBadge: "Khuyên dùng",
    telegramBotToken: "Telegram Bot Token",
    telegramChatId: "Chat ID",
    telegramBotTokenHint: "Lấy từ @BotFather khi tạo bot mới.",
    telegramGetChatIdHint: "Gửi lệnh /start đến bot, sau đó nhấn 'Tìm Chat ID'",
    detectChatId: "🔍 Tự động lấy Chat ID",
    detectingChatId: "Đang tìm...",
    chatIdEasyGuideTitle: "💡 Cách lấy Chat ID dễ nhất:",
    chatIdEasyGuideStep1: "1. Mở Bot vừa tạo trên Telegram và bấm START (hoặc gửi /start).",
    chatIdEasyGuideStep2: "2. Bấm nút '🔍 Tự động lấy Chat ID' ở trên để hệ thống tự điền ID cho bạn!",
    chatIdEasyGuideNote: "(Lưu ý: ID dạng 888111... trong idbot là ID của con Bot, Chat ID gửi tin nhắn phải là ID cá nhân của bạn).",
    ntfySettings: "Thông báo đẩy qua ntfy.sh",
    ntfyTopic: "Chủ đề (Topic)",
    ntfyTopicPlaceholder: "codex_alerts_myname",
    ntfyServer: "Server URL",
    alertThresholdTitle: "Điều kiện cảnh báo",
    alertThresholdLabel: "Báo khi đã dùng đến:",
    cooldownMinutesLabel: "Khoảng cách lặp lại:",
    cooldownOptionMin: "phút / lần",
    cooldownDefaultSuffix: "- Mặc định",
    autoSwitchSection: "Tự Động Đổi Tài Khoản (Auto-Switch)",
    autoSwitchSectionDesc: "Khi tài khoản đang dùng đạt ngưỡng giới hạn, hệ thống sẽ tự động quét và chuyển sang tài khoản phụ có dung lượng còn nhiều nhất (0% hoặc thấp nhất) và gửi thông báo về Telegram.",
    autoSwitchEnabled: "Tự động chuyển sang tài khoản tốt nhất khi tài khoản hiện tại gần hết hạn mức",
    autoSwitchThresholdLabel: "Tự động chuyển khi tài khoản active đã dùng đạt:",
    autoResumePaseoSection: "Tự Động Tiếp Tục Chat trên Paseo",
    autoResumePaseoSectionDesc: "Phát hiện lỗi hết Quota ➔ Đổi acc ➔ Gửi 'tiếp tục' (không cần tắt app)",
    autoResumePaseoDetail: "Khi Paseo báo lỗi 'You’ve hit your usage limit', hệ thống sẽ tự động chuyển sang tài khoản mới, tải lại cấu hình daemon trong chớp mắt và tự động gửi tin nhắn tiếp tục vào đúng các cuộc trò chuyện đang làm dở.",
    smartResumeMode: "Chế độ tiếp tục thông minh (Smart Resume Mode):",
    smartResumeSmartBtn: "⚡ Smart (Khuyên dùng)",
    smartResumeCompactBtn: "📦 Compact",
    smartResumeCustomBtn: "✏️ Tùy chỉnh",
    smartResumeModeSmartDesc: "⚡ Tự động định hướng: yêu cầu AI tập trung đúng mục tiêu dở dang, không đọc lại file cũ, tiết kiệm 60% reasoning tokens.",
    smartResumeModeCompactDesc: "📦 Gửi: 'tiếp tục (chỉ xuất code/diff sửa đổi, không giải thích lý thuyết)'",
    smartResumeModeCustomDesc: "✏️ Sử dụng chính xác nội dung bạn nhập bên dưới.",
    customPromptLabel: "Tin nhắn gửi đi khi tiếp tục (Resume Prompt):",
    customPromptPlaceholder: "tiếp tục",
    testTelegramBtn: "✈️ Gửi tin nhắn thử (Test)",
    testNtfyBtn: "📡 Gửi thử ntfy",
    testSending: "Đang gửi thử...",
    saveSettings: "Lưu Cài Đặt",
    savingSettings: "Đang lưu...",
    cancelBtn: "Hủy",
    closeBtn: "Đóng",
    forceCloseBtn: "Buộc dừng",

    // Modals - Export/Import Config
    exportSlimTitle: "Xuất mã cấu hình nhanh (Slim Text)",
    importSlimTitle: "Nhập mã cấu hình nhanh (Slim Text)",
    exportSlimDesc: "Chuỗi mã này chứa bí mật tài khoản. Hãy bảo mật cẩn thận.",
    importSlimDesc: "Tài khoản hiện có sẽ được giữ nguyên. Chỉ nhập các tài khoản chưa có.",
    copyToClipboard: "Sao chép vào Bộ nhớ tạm",
    copiedToClipboard: "Đã sao chép vào bộ nhớ tạm!",
    copyStringBtn: "Sao chép chuỗi",
    copiedBtn: "Đã chép",
    importConfigBtn: "Nhập tài khoản chưa có",
    pasteConfigPlaceholder: "Dán chuỗi cấu hình vào đây",
    exportPlaceholder: "Chuỗi xuất sẽ hiển thị ở đây",
    generating: "Đang tạo...",

    // Modals - Confirmations
    deleteConfirmTitle: "Xác nhận xóa tài khoản",
    deleteConfirmMsg: "Bạn có chắc chắn muốn xóa tài khoản này không? Thao tác này không thể hoàn tác.",
    switchBlockedTitle: "Không thể đổi tài khoản",
    switchBlockedRunningMsg: "Tiến trình Codex CLI đang chạy. Vui lòng đóng hoặc nhấn 'Buộc dừng' trước khi đổi tài khoản.",
    forceCloseCodexPromptTitle: "Buộc dừng các tiến trình Codex đang chạy?",
    forceCloseCodexPromptDesc: "Thao tác này sẽ buộc dừng các tiến trình Codex đang chạy chặn việc đổi tài khoản.",
    forceClosePaseoPromptTitle: "Buộc dừng các tiến trình Paseo đang chạy?",
    forceClosePaseoPromptDesc: "Thao tác này sẽ buộc dừng các tiến trình Paseo đang chạy.",
    unsavedWorkLost: "Dữ liệu chưa lưu có thể bị mất.",
    clickDeleteAgainToConfirm: "Bấm xóa lần nữa để xác nhận xóa tài khoản",
    usageRefreshedSuccess: "Đã làm mới hạn mức thành công",

    // Dock prompt
    keepInDockTitle: "Giữ Codex Switcher trên Dock?",
    keepInDockDesc: "Khi đóng cửa sổ, Codex Switcher có thể ở lại trên Dock hoặc chỉ chạy trên thanh Menu bar.",
    keepInDockLater: "Bạn có thể thay đổi thiết lập này sau từ menu khay hệ thống.",
    dontAskAgain: "Không hỏi lại",
    keepInDockBtn: "Giữ trên Dock",
    menuBarOnlyBtn: "Chỉ Menu Bar",

    // Analytics Widget
    analyticsTitle: "Thống Kê Token & Quota Toàn Hệ Thống",
    analyticsSubtitle: "Tổng hợp lượt gọi, token prompt, token sinh và hạn mức tất cả tài khoản",
    window1h: "1 Giờ",
    window24h: "24 Giờ",
    window3d: "3 Ngày",
    window7d: "7 Ngày",
    window30d: "30 Ngày",
    totalTokens: "Tổng Token",
    totalTokensUsed: "Tổng Token Đã Dùng",
    exactCount: "Chính xác:",
    tokenBreakdown: "Phân Rã Token",
    totalTurns: "Lượt Chat (Turns)",
    turns: "turns",
    avgPerTurn: "Trung bình / Lượt",
    inputTokens: "Input Prompt",
    outputTokens: "Output Generation",
    reasoningTokens: "Reasoning (Suy luận)",
    cachedTokens: "Cached (Đã Cache)",
    cacheHitRate: "Tỷ Lệ Cache Hit",
    optimized: "đã tối ưu",
    savedTokens: "Tiết kiệm:",
    systemQuotaPoolTitle: "Tổng Quota Còn Lại Toàn Hệ Thống",
    systemQuotaPoolDesc: "Tổng cộng dồn % quota còn lại của toàn bộ các tài khoản (Mỗi tài khoản 100%)",
    capacityAvailable: "Dung lượng",
    usedRate: "Đã dùng",
    readyCount: "Sẵn sàng 100%",
    midCount: "Đang dùng (21-80%)",
    highCount: "Sắp hết (81-94%)",
    exhaustedCount: "Hết limit (≥95%)",
    earliestReset: "Reset gần nhất",
    earliestResetLabel: "Reset gần nhất:",
    activeLabel: "Active:",
    afterPrefix: "sau",
    analyticsFooter: "Dữ liệu được cập nhật tự động từ các phiên làm việc của Codex",
    lastUpdated: "Cập nhật lúc",

    // Paseo Tabs Manager
    paseoManagerTitle: "Quản Lý Projects, Workspaces & Tabs Paseo",
    paseoManagerSubtitle: "Theo dõi độ phình ngữ cảnh (context), số turns và tự động tiếp tục",
    filterAll: "Tất cả Tabs",
    filterRunning: "Đang chạy",
    filterIdle: "Nghỉ (Idle)",
    filterWaiting: "Đang chờ",
    filterBloated: "Phình Context",
    filterErrored: "Lỗi Quota",
    searchTabsPlaceholder: "Tìm kiếm tab theo tiêu đề, project hoặc workspace...",
    refreshTabs: "Làm mới Tabs",
    noTabsFound: "Không tìm thấy tab nào phù hợp bộ lọc.",
    workspace: "Workspace",
    project: "Project",
    turnsLabel: "turns",
    contextLabel: "Context",
    smartResumeTab: "⚡ Tiếp tục (Smart Resume)",
    freshHandoffTab: "🌿 Tách Tab mới (Fresh Handoff)",
    resumeAllErrored: "🚀 Tiếp tục tất cả Tab lỗi Quota",
    bloatSafe: "Ngữ cảnh an toàn",
    bloatWarning: "Cảnh báo: Context lớn",
    bloatDanger: "Nguy hiểm: Context phình nặng",
    quotaAdviceTitle: "Khuyến Nghị Tối Ưu Quota",
    quotaAdviceDesc: "Càng nhiều turns, mỗi câu chat càng nạp lại context lớn. Khuyên dùng:",
    adviceUnder15: "Nên giữ tác vụ dưới 15-20 turns để tiết kiệm quota và tăng tốc độ xử lý.",
    adviceOver25: "Với tác vụ trên 25 turns, hãy dùng 'Tách Tab mới' để reset context.",
    adviceErrors: "Khi tab báo lỗi hết quota, đổi tài khoản và bấm 'Tiếp tục (Smart Resume)'.",

    // Toast & Alerts
    toastCopied: "Đã sao chép vào bộ nhớ tạm!",
    toastSaved: "Đã lưu cài đặt thành công!",
    toastError: "Đã xảy ra lỗi:",
  },
};

export type TranslationKey = keyof typeof translations.en;
export type Translations = typeof translations.en;

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(readStoredLanguage);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    writeStoredLanguage(newLang);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LANGUAGE_CHANGED_EVENT, { detail: newLang }));
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === "en" ? "vi" : "en");
  }, [lang, setLang]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === LANGUAGE_STORAGE_KEY && (e.newValue === "en" || e.newValue === "vi")) {
        setLangState(e.newValue);
      }
    };
    const handleCustom = (e: Event) => {
      const custom = e as CustomEvent<Language>;
      if (custom.detail === "en" || custom.detail === "vi") {
        setLangState(custom.detail);
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener(LANGUAGE_CHANGED_EVENT, handleCustom);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, handleCustom);
    };
  }, []);

  const value = {
    lang,
    setLang,
    toggleLang,
    t: translations[lang] || translations.en,
  };

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextType {
  const context = useContext(I18nContext);
  if (!context) {
    const defaultLang = readStoredLanguage();
    return {
      lang: defaultLang,
      setLang: writeStoredLanguage,
      toggleLang: () => {
        writeStoredLanguage(defaultLang === "en" ? "vi" : "en");
      },
      t: translations[defaultLang] || translations.en,
    };
  }
  return context;
}
