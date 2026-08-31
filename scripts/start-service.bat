@echo off
set "DIR=%~dp0"
cd /d "%DIR%"

set "NODE_BIN=node"
where node >nul 2>&1
if %errorlevel% neq 0 (
    if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_BIN=%ProgramFiles%\nodejs\node.exe"
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_BIN=%LOCALAPPDATA%\Programs\nodejs\node.exe"
)

if exist "%DIR%web-server.mjs" (
    "%NODE_BIN%" "%DIR%web-server.mjs"
) else if exist "%DIR%scripts\web-server.mjs" (
    "%NODE_BIN%" "%DIR%scripts\web-server.mjs"
) else if exist "%USERPROFILE%\.codex-switcher-web\web-server.mjs" (
    cd /d "%USERPROFILE%\.codex-switcher-web"
    "%NODE_BIN%" "%USERPROFILE%\.codex-switcher-web\web-server.mjs"
) else (
    echo [Error] web-server.mjs not found > "%TEMP%\codex-switcher-err.log"
    exit /b 1
)
