@echo off
title Stop Avantis Assist Services
echo Stopping Avantis services on ports 9140, 9141, 9142, 9143...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9140 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9141 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9142 "') do taskkill /f /pid %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9143 "') do taskkill /f /pid %%a 2>nul

echo [OK] All Avantis platform processes stopped.
pause
