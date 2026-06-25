@echo off
title Antigravity Gemini Bridge - Auto Restart
echo ===================================================
echo Starting Antigravity Gemini Bridge...
echo If it disconnects or crashes, it will auto-restart.
echo Close this window to stop it permanently.
echo ===================================================

:loop
echo [ %date% %time% ] Connecting to bridge...
call npx antigravity-gemini-bridge@latest
echo.
echo [ %date% %time% ] Bridge disconnected! Restarting in 3 seconds...
timeout /t 3 /nobreak > nul
goto loop
