@echo off
setlocal enabledelayedexpansion
title Codex Switcher - Install Auto-Start on Windows
chcp 65001 >nul 2>&1

echo =======================================================
echo    CAI DAT TU DONG CHAY NGAM CHO CODEX SWITCHER
echo =======================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "DEPLOY_DIR=%USERPROFILE%\.codex-switcher-web"

:: 1. Kiem tra xem da build va deploy chua
if not exist "%DEPLOY_DIR%\web-server.mjs" (
    echo [*] Chua tim thay thu muc runtime, dang tien hanh build...
    if exist "%SCRIPT_DIR%..\build-windows.bat" (
        call "%SCRIPT_DIR%..\build-windows.bat"
    ) else if exist "%SCRIPT_DIR%build-windows.bat" (
        call "%SCRIPT_DIR%build-windows.bat"
    )
)

if not exist "%DEPLOY_DIR%\start-service.vbs" (
    if exist "%SCRIPT_DIR%start-service.vbs" (
        copy /Y "%SCRIPT_DIR%start-service.vbs" "%DEPLOY_DIR%\start-service.vbs" >nul 2>&1
    )
)

if not exist "%DEPLOY_DIR%\start-service.bat" (
    if exist "%SCRIPT_DIR%start-service.bat" (
        copy /Y "%SCRIPT_DIR%start-service.bat" "%DEPLOY_DIR%\start-service.bat" >nul 2>&1
    )
)

:: 2. Tao Shortcut trong thu muc Startup cua Windows
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=%STARTUP_FOLDER%\Codex Switcher Web.lnk"
set "TARGET_VBS=%DEPLOY_DIR%\start-service.vbs"

echo [*] Dang tao loi tat tu khoi dong tai: %STARTUP_FOLDER%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%SHORTCUT_PATH%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%TARGET_VBS%\"'; $s.WorkingDirectory = '%DEPLOY_DIR%'; $s.WindowStyle = 7; $s.Description = 'Codex Switcher Background Web Server'; $s.Save()"

if %errorlevel% neq 0 (
    echo [CANH BAO] Khong the tao bang PowerShell, thu cach thu 2...
    copy /Y "%TARGET_VBS%" "%STARTUP_FOLDER%\CodexSwitcher.vbs" >nul 2>&1
)

:: 3. Khoi chay dich vu ngay lap tuc
echo [*] Dang khoi chay dich vu ngam...
wscript.exe "%TARGET_VBS%"

echo.
echo =======================================================
echo    [OK] CAI DAT THANH CONG!
echo =======================================================
echo.
echo Codex Switcher se tu dong chay ngam moi khi ban dang nhap Windows.
echo Web Dashboard da san sang tai: http://localhost:3210
echo.
echo De go bo tu dong chay ngam, hay chay file:
echo   scripts\uninstall-windows-service.bat
echo.

pause
