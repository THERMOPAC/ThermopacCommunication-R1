@echo off
setlocal

echo ============================================================
echo  THERMOPAC Local Document Agent -- Uninstall Windows Service
echo ============================================================
echo.

set SERVICE_NAME=ThermopacLocalDocumentAgent
set NSSM=%~dp0nssm.exe

REM ── Require Administrator ──────────────────────────────────
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
  echo ERROR: This script must be run as Administrator.
  echo Right-click uninstall-service.bat and choose "Run as administrator".
  echo.
  pause & exit /b 1
)

REM ── Stop and remove via NSSM ───────────────────────────────
if exist "%NSSM%" (
  echo Stopping service...
  "%NSSM%" stop   %SERVICE_NAME% confirm >nul 2>&1
  echo Removing service...
  "%NSSM%" remove %SERVICE_NAME% confirm
) else (
  echo NSSM not found -- using sc.exe fallback...
  net stop %SERVICE_NAME% >nul 2>&1
  sc.exe delete %SERVICE_NAME%
)

echo.
echo Service uninstalled.
echo Log files in %~dp0logs\ have been preserved.
echo.
pause
