@echo off
echo ==========================================
echo   SAP B1 Integration - ngrok Launcher
echo ==========================================
echo.

echo 1. Starting SAP Middleware Server...
start "SAP Middleware" cmd /k "node server.js"

echo 2. Waiting for middleware to start...
timeout /t 5 /nobreak >nul

echo 3. Starting ngrok tunnel...
echo    This will create a public URL for your middleware
echo    Copy the HTTPS URL that appears and send it to the developer
echo.
ngrok http 3001

echo.
echo ==========================================
echo   Integration Complete!
echo ==========================================
echo.
echo Send the ngrok HTTPS URL to complete the integration.
echo Press any key to exit...
pause >nul