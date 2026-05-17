@echo off
echo Starting ThermopacLocalDocumentAgent...
net start ThermopacLocalDocumentAgent
if %ERRORLEVEL% neq 0 (
  echo.
  echo Failed to start via Service Manager. Running directly instead...
  echo Press Ctrl+C to stop.
  echo.
  cd /d "%~dp0"
  node dist\index.js
)
pause
