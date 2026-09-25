@echo off
title Avantis Assist Enterprise Platform Launcher
echo ===================================================
echo   AVANTIS ASSIST ENTERPRISE PLATFORM
echo   Endpoint Intelligence and Diagnostics
echo ===================================================
echo.
echo Starting enterprise microservices and agent...
echo.

:: 1. Enterprise Cloud Platform Backend (.NET 8)
echo [1/3] Launching Enterprise Platform API (Port 9141)...
start "Avantis Platform API" cmd /k "cd /d %~dp0..\platform\backend\src\Avantis.Platform.Api && dotnet run"
timeout /t 3 /nobreak >nul

:: 2. Enterprise Windows Agent (.NET 8)
echo [2/3] Launching Windows Enterprise Agent (Port 9140)...
start "Avantis Windows Agent" cmd /k "cd /d %~dp0..\agent_net\src\Avantis.Agent.Service && dotnet run"
timeout /t 2 /nobreak >nul

:: 3. Client Companion UI
echo [3/3] Launching Client Desktop Companion UI (Port 9142)...
start "Avantis Client Companion UI" cmd /k "cd /d %~dp0..\client-ui && node server.js"
timeout /t 1 /nobreak >nul

echo.
echo ===================================================
echo   [OK] All Avantis Enterprise Services Active!
echo ===================================================
echo.
echo - Platform API (Swagger UI):   http://localhost:9141/swagger
echo - Agent Service Local IPC:     http://localhost:9140/api/status
echo - Client Desktop UI:           http://localhost:9142
echo.
echo Press any key to open the web interfaces in your default browser...
pause >nul

start http://localhost:9142
start http://localhost:9141/swagger
