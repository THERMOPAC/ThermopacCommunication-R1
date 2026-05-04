@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.35
REM  INSTALL UPDATE SCRIPT
REM  --
REM  Run as Administrator from the extracted ZIP folder.
REM  1. Stops any running agent Python process
REM  2. Uses robocopy to reliably overwrite installed files
REM  3. Verifies the correct version was written
REM  Preserves config.ini (your settings are never changed).
REM ============================================================

title ThermopacStructurer Updater v1.0.35

REM ── Require Administrator ────────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [ERROR] This script must be run as Administrator.
    echo  Right-click install_update.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

REM ── Detect install path ───────────────────────────────────────────────────────
set "INSTALL_DIR=C:\Program Files\ThermopacStructuringAgent"

if not exist "%INSTALL_DIR%\" (
    echo.
    echo  [ERROR] Install directory not found: %INSTALL_DIR%
    echo  Run the full installer (bootstrap.bat) first.
    echo.
    pause
    exit /b 1
)

REM ── Locate this script's directory (root of extracted ZIP) ───────────────────
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

echo.
echo  Thermopac Drawing Structuring Agent — Update to v1.0.35
echo  --------------------------------------------------------
echo  Source : %SRC%
echo  Target : %INSTALL_DIR%
echo.

REM ── Verify source files exist ─────────────────────────────────────────────────
if not exist "%SRC%\agent\" (
    echo  [ERROR] Source folder missing: %SRC%\agent\
    echo.
    echo  Run this script from the ROOT of the extracted ZIP:
    echo    ThermopacStructuringAgent-v1.0.35\install_update.bat
    echo  NOT from inside a subfolder like structure_pkg\.
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\structurer\" (
    echo  [ERROR] Source folder missing: %SRC%\structurer\
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\agent\structure_job_client.py" (
    echo  [ERROR] Key file missing: %SRC%\agent\structure_job_client.py
    echo  Re-download the Full Package from the ERP Worker Agents page.
    echo.
    pause
    exit /b 1
)

REM ── Stop any running agent Python processes ───────────────────────────────────
echo  Stopping any running agent processes...
taskkill /F /FI "WINDOWTITLE eq ThermopacStructurer*" >nul 2>&1
REM Also kill any python.exe running main_structurer.py
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process python,python3 -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*Thermopac*' -or (($_ | Select-Object -ExpandProperty Modules -ErrorAction SilentlyContinue | Where-Object { $_.FileName -like '*main_structurer*' }) -ne $null) } | Stop-Process -Force"
timeout /t 2 >nul

REM ── Copy agent\ using robocopy ────────────────────────────────────────────────
echo  Copying agent\...
robocopy "%SRC%\agent" "%INSTALL_DIR%\agent" /E /IS /IT /IM /NFL /NDL /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [ERROR] robocopy failed for agent\ (exit code %errorLevel%)
    pause
    exit /b 1
)

REM ── Copy structurer\ using robocopy ──────────────────────────────────────────
echo  Copying structurer\...
robocopy "%SRC%\structurer" "%INSTALL_DIR%\structurer" /E /IS /IT /IM /NFL /NDL /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [ERROR] robocopy failed for structurer\ (exit code %errorLevel%)
    pause
    exit /b 1
)

REM ── Copy helper scripts ───────────────────────────────────────────────────────
for %%F in (
    run.bat
    fix_appdata_url.ps1
    set_testing_mode.bat
    set_dev_url.bat
    set_prod_url.bat
    set_node_token.bat
) do (
    if exist "%SRC%\%%F" (
        echo  Copying %%F...
        copy /Y "%SRC%\%%F" "%INSTALL_DIR%\%%F" >nul 2>&1
    )
)

REM ── Remove stale extractor references (clean old installs) ───────────────────
if exist "%INSTALL_DIR%\agent\job_runner.py" (
    echo  Removing stale extractor file: agent\job_runner.py
    del /F /Q "%INSTALL_DIR%\agent\job_runner.py" >nul 2>&1
)
if exist "%INSTALL_DIR%\agent\main.py" (
    echo  Removing stale extractor file: agent\main.py
    del /F /Q "%INSTALL_DIR%\agent\main.py" >nul 2>&1
)
if exist "%INSTALL_DIR%\extractor" (
    echo  Removing stale extractor\ folder...
    rd /S /Q "%INSTALL_DIR%\extractor" >nul 2>&1
)

REM ── Verify version ────────────────────────────────────────────────────────────
echo.
findstr /C:"1.0.35" "%INSTALL_DIR%\agent\structure_job_client.py" >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  [ERROR] Version check FAILED — structure_job_client.py does not contain 1.0.35
    echo  The agent process may still be running and locking files.
    echo  Close the agent console window and run this script again.
    echo.
    pause
    exit /b 1
)
echo  [OK] Version verified: agent\structure_job_client.py = v1.0.35

REM ── Verify no _rev- remains ───────────────────────────────────────────────────
findstr /S /M "_rev-" "%INSTALL_DIR%\structurer\*.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [ERROR] _rev- still found in structurer\*.py — copy may have failed.
    echo  Close the agent and re-run this script.
    echo.
    pause
    exit /b 1
)
echo  [OK] Verified: no _rev- in structurer\solidworks_structurer.py

echo.
echo  config.ini preserved (your settings were not changed).
echo.
echo  ============================================================
echo   Update complete!  ThermopacStructuringAgent is now v1.0.35
echo   Filenames will now be saved as {DrawingNo}.slddrw
echo  ============================================================
echo.
echo  Restart the agent: close this window and open run.bat
echo.
pause
