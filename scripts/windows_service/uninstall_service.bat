@echo off
:: Avantis Client Companion — Windows Service Uninstaller
:: Must be executed with Administrative Privileges

echo =========================================================
echo   Avantis Client Companion — Windows Service Removal
echo =========================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Must be executed as Administrator.
    pause
    exit /b 1
)

set SERVICE_NAME=AvantisHealthService

echo [1/2] Stopping "%SERVICE_NAME%"...
sc stop "%SERVICE_NAME%" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/2] Deleting Windows Service "%SERVICE_NAME%"...
sc delete "%SERVICE_NAME%"

echo.
echo Service "%SERVICE_NAME%" has been removed.
pause
