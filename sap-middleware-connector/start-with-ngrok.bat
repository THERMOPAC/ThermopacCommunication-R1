@echo off
echo ==========================================
echo   SAP B1 Service Layer + ngrok Setup
echo ==========================================
echo.

echo Step 1: Verifying Service Layer...
node service-layer-verification.js

echo.
echo Step 2: Starting middleware server...
start "SAP Middleware" cmd /k "node service-layer-server.js"

echo.
echo Step 3: Waiting for server to start...
timeout /t 5 /nobreak > nul

echo.
echo Step 4: Starting ngrok tunnel...
echo Opening ngrok tunnel for port 3001...
echo.
echo After ngrok starts, you'll see a URL like:
echo https://abc123.ngrok.io
echo.
echo Copy this URL and send it to complete the integration!
echo.
ngrok http 3001