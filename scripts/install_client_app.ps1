# ==============================================================================
# Avantis PC Assist — Native Windows Desktop Application Installer
# Creates native Desktop and Start Menu shortcuts with standalone window chrome
# ==============================================================================

$ErrorActionPreference = "Stop"

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  AVANTIS PC ASSIST — DESKTOP APPLICATION INSTALLER  " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host ""

$repoRoot = (Get-Item $PSScriptRoot).Parent.FullName
$clientUiDir = Join-Path $repoRoot "client-ui"
$iconPath = Join-Path $clientUiDir "assets\favicon.ico"
$launcherBat = Join-Path $repoRoot "scripts\launch_app_window.bat"

# Detect default Chromium browser for standalone --app window execution
$edgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}
$chromePath = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
    $chromePath = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}

$browserExe = $null
if (Test-Path $edgePath) {
    $browserExe = $edgePath
    Write-Host "[OK] Detected Microsoft Edge for native window host" -ForegroundColor Green
} elseif (Test-Path $chromePath) {
    $browserExe = $chromePath
    Write-Host "[OK] Detected Google Chrome for native window host" -ForegroundColor Green
} else {
    Write-Host "[!] Using system default browser protocol" -ForegroundColor Yellow
}

# 1. Create launch_app_window.bat
$launcherContent = @"
@echo off
title Avantis PC Assist Launcher
set REPO_ROOT=%~dp0..

:: Check if backend/agent are already listening on port 9140/9141/9142
netstat -ano | findstr ":9142 " >nul
if errorlevel 1 (
    echo Starting Avantis background services...
    start /min "" cmd /c "cd /d "%REPO_ROOT%" && call scripts\run_all.bat"
    timeout /t 3 /nobreak >nul
)

:: Launch in native chromeless standalone application window
if exist "$edgePath" (
    start "" "$edgePath" --app=http://localhost:9142 --window-size=1366,768 --app-id=avantis-pc-assist
) else (
    if exist "$chromePath" (
        start "" "$chromePath" --app=http://localhost:9142 --window-size=1366,768 --app-id=avantis-pc-assist
    ) else (
        start "" http://localhost:9142
    )
)
exit
"@

Set-Content -Path $launcherBat -Value $launcherContent -Encoding ASCII
Write-Host "[OK] Generated app launcher at: $launcherBat" -ForegroundColor Green

# 2. Create Desktop Shortcut (.lnk)
$wshShell = New-Object -ComObject WScript.Shell

$desktopDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Desktop)
$desktopShortcutPath = Join-Path $desktopDir "Avantis PC Assist.lnk"

$shortcut = $wshShell.CreateShortcut($desktopShortcutPath)
$shortcut.TargetPath = $launcherBat
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "Avantis PC Assist — Endpoint Hardware Intelligence & Support"
if (Test-Path $iconPath) {
    $shortcut.IconLocation = "$iconPath, 0"
}
$shortcut.WindowStyle = 7 # Minimized launch window
$shortcut.Save()

Write-Host "[OK] Desktop shortcut created: $desktopShortcutPath" -ForegroundColor Green

# 3. Create Start Menu Shortcut
$startMenuDir = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::Programs)
$avantisStartFolder = Join-Path $startMenuDir "Avantis"
if (-not (Test-Path $avantisStartFolder)) {
    New-Item -ItemType Directory -Path $avantisStartFolder | Out-Null
}

$startMenuShortcutPath = Join-Path $avantisStartFolder "Avantis PC Assist.lnk"
$startShortcut = $wshShell.CreateShortcut($startMenuShortcutPath)
$startShortcut.TargetPath = $launcherBat
$startShortcut.WorkingDirectory = $repoRoot
$startShortcut.Description = "Avantis PC Assist — Endpoint Hardware Intelligence & Support"
if (Test-Path $iconPath) {
    $startShortcut.IconLocation = "$iconPath, 0"
}
$startShortcut.WindowStyle = 7
$startShortcut.Save()

Write-Host "[OK] Start Menu shortcut created: $startMenuShortcutPath" -ForegroundColor Green

Write-Host ""
Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  INSTALLATION COMPLETED SUCCESSFULLY!              " -ForegroundColor Green
Write-Host "  You can now launch Avantis PC Assist from your     " -ForegroundColor White
Write-Host "  Desktop or Start Menu like any native Windows app. " -ForegroundColor White
Write-Host "=====================================================" -ForegroundColor Cyan
