@echo off
setlocal enabledelayedexpansion
title Codex Switcher - Build for Windows
chcp 65001 >nul 2>&1

echo =======================================================
echo    CODEX SWITCHER - BUILD & DEPLOY CHO WINDOWS
echo =======================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Kiem tra Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js!
    echo Vui long cai dat Node.js tai: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [*] Node.js version: %NODE_VER%

:: 2. Kiem tra Package Manager (pnpm hoac npm)
set PKG_MGR=pnpm
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    set PKG_MGR=npm
    echo [*] Khong tim thay pnpm, su dung npm mac dinh.
) else (
    echo [*] Su dung package manager: pnpm
)

:: 3. Cai dat thu vien dependencies neu chua co
if not exist "node_modules\" (
    echo [*] Dang cai dat thu vien dependencies...
    if "%PKG_MGR%"=="pnpm" (
        call pnpm install
    ) else (
        call npm install
    )
    if %errorlevel% neq 0 (
        echo [LOI] Cai dat dependencies that bai!
        pause
        exit /b 1
    )
)

:: 4. Build Frontend (Vite)
echo [*] Dang build giao dien Web Dashboard...
if "%PKG_MGR%"=="pnpm" (
    call pnpm build
) else (
    call npm run build
)

if %errorlevel% neq 0 (
    echo [LOI] Build frontend that bai!
    pause
    exit /b 1
)

echo [OK] Build frontend thanh cong vao thu muc dist\

:: 5. Copy vao thu muc runtime nguoi dung (%USERPROFILE%\.codex-switcher-web\)
set "DEPLOY_DIR=%USERPROFILE%\.codex-switcher-web"
echo [*] Dang deploy vao: %DEPLOY_DIR%

if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"
if not exist "%DEPLOY_DIR%\dist" mkdir "%DEPLOY_DIR%\dist"

xcopy /E /I /Y "dist" "%DEPLOY_DIR%\dist" >nul 2>&1
copy /Y "scripts\web-server.mjs" "%DEPLOY_DIR%\web-server.mjs" >nul 2>&1

:: Copy helper scripts cho runtime
if exist "scripts\start-service.bat" copy /Y "scripts\start-service.bat" "%DEPLOY_DIR%\start-service.bat" >nul 2>&1
if exist "scripts\start-service.vbs" copy /Y "scripts\start-service.vbs" "%DEPLOY_DIR%\start-service.vbs" >nul 2>&1
if exist "scripts\run-windows.bat" copy /Y "scripts\run-windows.bat" "%DEPLOY_DIR%\run.bat" >nul 2>&1

echo [OK] Deploy thanh cong vao: %DEPLOY_DIR%
echo.
echo =======================================================
echo    HOAN TAT BUILD & DEPLOY!
echo =======================================================
echo.
echo Cach khoi chay:
echo  1. Chay truc tiep:     Chay file "run-windows.bat"
echo  2. Cai dat chay ngam:  Chay "scripts\install-windows-service.bat"
echo.

pause
