@echo off
:: Avantis Client Companion — Windows Service Installer
:: Must be executed with Administrative Privileges

echo =========================================================
echo   Avantis Client Companion — Windows Service Setup
echo =========================================================

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This installer must be executed as Administrator.
    echo Right-click this file and select 'Run as Administrator'.
    pause
    exit /b 1
)

set SERVICE_NAME=AvantisHealthService
set DISPLAY_NAME=Avantis Client Companion Health Service
set SERVICE_DESC=Provides continuous hardware diagnostics, predictive maintenance, and driver verification for Avantis Windows PCs.
set SCRIPT_DIR=%~dp0
set NODE_EXE=%ProgramFiles%\nodejs\node.exe

if not exist "%NODE_EXE%" (
    for %%X in (node.exe) do (set NODE_EXE=%%~$PATH:X)
)

if not exist "%NODE_EXE%" (
    echo [ERROR] Node.js runtime not found. Ensure Node.js is installed.
    pause
    exit /b 1
)

set SERVICE_RUNNER=%SCRIPT_DIR%avantis_service.js

echo [1/3] Checking existing service...
sc query "%SERVICE_NAME%" >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Stopping existing service...
    sc stop "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
    sc delete "%SERVICE_NAME%" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [2/3] Creating Windows Service "%SERVICE_NAME%"...
sc create "%SERVICE_NAME%" binPath= "\"%NODE_EXE%\" \"%SERVICE_RUNNER%\"" start= auto DisplayName= "%DISPLAY_NAME%"
sc description "%SERVICE_NAME%" "%SERVICE_DESC%"
sc failure "%SERVICE_NAME%" reset= 86400 actions= restart/60000/restart/60000/restart/60000

echo [3/3] Starting %SERVICE_NAME%...
sc start "%SERVICE_NAME%"

echo.
echo =========================================================
echo   Avantis Windows Service Successfully Registered & Started
echo =========================================================
pause
