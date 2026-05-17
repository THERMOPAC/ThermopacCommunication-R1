@echo off
setlocal

echo ============================================================
echo  THERMOPAC Local Document Agent — Uninstall Windows Service
echo ============================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo ERROR: Node.js is not installed or not in PATH.
  pause
  exit /b 1
)

echo Stopping service first...
net stop ThermopacLocalDocumentAgent 2>nul
echo.

echo Uninstalling Windows Service: ThermopacLocalDocumentAgent
cd /d "%~dp0"
node dist\index.js --uninstall-service

echo.
echo Service uninstalled.
echo.
pause
