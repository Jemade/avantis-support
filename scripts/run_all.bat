@echo off
title Avantis Client Companion Platform Launcher
echo ===================================================
echo   AVANTIS CLIENT COMPANION PLATFORM
echo   Hardware Intelligence and Support System
echo ===================================================
echo.
echo Starting backend, hardware agent, and client UI...
echo.

:: 1. Backend API (PostgreSQL / In-Memory persistence)
echo [1/3] Launching Avantis Platform API (Port 9141)...
start "Avantis Backend API" cmd /k "cd /d %~dp0..\backend && node src\server.js"
timeout /t 2 /nobreak >nul

:: 2. Hardware Diagnostics Agent
echo [2/3] Launching Avantis Hardware Agent (Port 9140)...
start "Avantis Hardware Agent" cmd /k "cd /d %~dp0..\agent && node src\index.js"
timeout /t 2 /nobreak >nul

:: 3. Client Companion UI
echo [3/3] Launching Client Desktop Companion UI (Port 9142)...
start "Avantis Client Companion UI" cmd /k "cd /d %~dp0..\client-ui && node server.js"
timeout /t 1 /nobreak >nul

echo.
echo ===================================================
echo   [OK] All Avantis Services Active!
echo ===================================================
echo.
echo - Platform API:         http://localhost:9141/health
echo - Hardware Agent IPC:   http://localhost:9140/api/status
echo - Client Desktop UI:    http://localhost:9142
echo.
echo Opening Client Companion in your default browser...
start http://localhost:9142
