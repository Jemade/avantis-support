@echo off
title Uninstall Avantis PC Assist Shortcuts
echo Removing Avantis PC Assist shortcuts...

if exist "%USERPROFILE%\Desktop\Avantis PC Assist.lnk" (
    del "%USERPROFILE%\Desktop\Avantis PC Assist.lnk"
    echo Removed Desktop shortcut.
)

if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Avantis" (
    rd /s /q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Avantis"
    echo Removed Start Menu folder.
)

echo.
echo [OK] Shortcuts removed.
pause
