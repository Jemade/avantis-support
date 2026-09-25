@echo off
title Install Avantis PC Assist
echo Installing Avantis PC Assist to Desktop and Start Menu...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_client_app.ps1"
pause
