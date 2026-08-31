@echo off
setlocal enabledelayedexpansion
title Codex Switcher - Running on Windows
chcp 65001 >nul 2>&1

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "DEPLOY_DIR=%USERPROFILE%\.codex-switcher-web"
set "SERVER_SCRIPT="

if exist "%DEPLOY_DIR%\web-server.mjs" (
    set "SERVER_SCRIPT=%DEPLOY_DIR%\web-server.mjs"
    cd /d "%DEPLOY_DIR%"
) else if exist "%SCRIPT_DIR%scripts\web-server.mjs" (
    set "SERVER_SCRIPT=%SCRIPT_DIR%scripts\web-server.mjs"
) else if exist "%SCRIPT_DIR%web-server.mjs" (
    set "SERVER_SCRIPT=%SCRIPT_DIR%web-server.mjs"
)

if "%SERVER_SCRIPT%"=="" (
    echo [CANH BAO] Chua tim thay web-server.mjs hoac chua build!
    echo Dang tien hanh build tu dong...
    if exist "%SCRIPT_DIR%build-windows.bat" (
        call "%SCRIPT_DIR%build-windows.bat"
        set "SERVER_SCRIPT=%DEPLOY_DIR%\web-server.mjs"
        cd /d "%DEPLOY_DIR%"
    ) else (
        echo [LOI] Khong the tim thay file build!
        pause
        exit /b 1
    )
)

echo =======================================================
echo    KHOI CHAY CODEX SWITCHER WEB DASHBOARD (WINDOWS)
echo =======================================================
echo.
echo [*] Server script: %SERVER_SCRIPT%
echo [*] Web URL:       http://localhost:3210
echo.
echo Dang mo trinh duyet...
start http://localhost:3210

echo [*] Nhan Ctrl + C de dung server.
echo.

node "%SERVER_SCRIPT%"
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Node.js process dung dot ngot (Ma loi: %errorlevel%)
    pause
)
