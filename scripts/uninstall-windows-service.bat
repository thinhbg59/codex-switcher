@echo off
setlocal enabledelayedexpansion
title Codex Switcher - Uninstall Auto-Start
chcp 65001 >nul 2>&1

echo =======================================================
echo    GO BO TU DONG CHAY NGAM CODEX SWITCHER (WINDOWS)
echo =======================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Codex Switcher Web.lnk"
set "VBS_PATH=%STARTUP_FOLDER%\CodexSwitcher.vbs"

if exist "%SHORTCUT_PATH%" (
    del /f /q "%SHORTCUT_PATH%" >nul 2>&1
    echo [*] Da xoa loi tat khoi dong: %SHORTCUT_PATH%
)

if exist "%VBS_PATH%" (
    del /f /q "%VBS_PATH%" >nul 2>&1
    echo [*] Da xoa file VBS startup: %VBS_PATH%
)

:: Dung tien trinh node web-server dang chay (neu co)
echo [*] Dang dung tien trinh web-server...
taskkill /F /FI "WINDOWTITLE eq Codex Switcher*" >nul 2>&1

echo.
echo [OK] Da go bo che do tu dong chay ngam thanh cong!
echo.
pause
