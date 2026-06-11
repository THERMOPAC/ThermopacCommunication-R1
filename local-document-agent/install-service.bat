@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  THERMOPAC Local Document Agent -- Install Windows Service
echo  Wrapper: NSSM (bundled)
echo ============================================================
echo.

set AGENT_DIR=%~dp0
set EXE=%AGENT_DIR%ThermopacDocAgent.exe
set SERVICE_NAME=ThermopacLocalDocumentAgent
set NSSM=%AGENT_DIR%nssm.exe
set LOG_DIR=%AGENT_DIR%logs

REM ── Require Administrator ──────────────────────────────────
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo ERROR: This script must be run as Administrator.
  echo Right-click install-service.bat and choose "Run as administrator".
  echo.
  pause & exit /b 1
)

REM ── Check config.json ──────────────────────────────────────
if not exist "%AGENT_DIR%config.json" (
  echo ERROR: config.json not found.
  echo Copy config.json.example to config.json and fill in your settings first.
  echo.
  pause & exit /b 1
)

REM ── Check EXE ──────────────────────────────────────────────
if not exist "%EXE%" (
  echo ERROR: ThermopacDocAgent.exe not found.
  echo Expected: %EXE%
  echo.
  pause & exit /b 1
)

REM ── Check NSSM (must be bundled -- no download) ────────────
if not exist "%NSSM%" (
  echo ERROR: nssm.exe not found.
  echo Expected: %NSSM%
  echo.
  echo nssm.exe must be included in this package.
  echo Download a fresh copy of the agent package from the ERP
  echo Worker Agents dashboard -- it includes nssm.exe bundled.
  echo.
  pause & exit /b 1
)

REM ── Create logs directory ──────────────────────────────────
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM ── Remove any existing registration ──────────────────────
echo Removing existing service registration (if any)...
"%NSSM%" stop   %SERVICE_NAME% confirm >nul 2>&1
"%NSSM%" remove %SERVICE_NAME% confirm >nul 2>&1
echo Done.
echo.

REM ── Register service via NSSM ──────────────────────────────
echo Registering service...
"%NSSM%" install %SERVICE_NAME% "%EXE%"
if %ERRORLEVEL% neq 0 (
  echo ERROR: NSSM install failed (code %ERRORLEVEL%).
  echo Ensure you are running as Administrator.
  echo.
  pause & exit /b 1
)

"%NSSM%" set %SERVICE_NAME% AppDirectory   "%AGENT_DIR%"
"%NSSM%" set %SERVICE_NAME% DisplayName    "THERMOPAC Local Document Agent"
"%NSSM%" set %SERVICE_NAME% Description    "THERMOPAC Local Document Agent -- saves ERP files to local file server"
"%NSSM%" set %SERVICE_NAME% Start          SERVICE_AUTO_START
"%NSSM%" set %SERVICE_NAME% AppStdout      "%LOG_DIR%\service-stdout.log"
"%NSSM%" set %SERVICE_NAME% AppStderr      "%LOG_DIR%\service-stderr.log"
"%NSSM%" set %SERVICE_NAME% AppRotateFiles 1
"%NSSM%" set %SERVICE_NAME% AppRotateBytes 10485760

echo.
echo Service registered. Starting now...
"%NSSM%" start %SERVICE_NAME%
if %ERRORLEVEL% neq 0 (
  echo WARNING: Service installed but failed to start immediately.
  echo Check config.json settings, then run start-service.bat.
) else (
  echo Service started successfully.
)

echo.
echo ============================================================
echo  ThermopacLocalDocumentAgent installed as auto-start service.
echo  Manage via:  services.msc  or  start/stop-service.bat
echo  Logs:        %LOG_DIR%
echo ============================================================
echo.
pause
