@echo off
setlocal

echo ============================================================
echo  THERMOPAC Local Document Agent — Install Windows Service
echo ============================================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Please install Node.js 18 LTS or later from https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo Node.js found:
node --version
echo.

if not exist "%~dp0config.json" (
  echo ERROR: config.json not found.
  echo Please copy config.json.example to config.json and fill in your settings.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0node_modules" (
  echo Installing dependencies (node-windows)...
  cd /d "%~dp0"
  npm install --production
  if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
  )
  echo.
)

echo Installing Windows Service: ThermopacLocalDocumentAgent
echo.
cd /d "%~dp0"
node dist\index.js --install-service

echo.
echo Done. The service will auto-start on next Windows boot.
echo To start immediately, run start-service.bat
echo.
pause
