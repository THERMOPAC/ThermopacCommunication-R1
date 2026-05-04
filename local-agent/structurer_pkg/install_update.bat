@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.36
REM  INSTALL UPDATE SCRIPT
REM  --
REM  Run as Administrator from the ROOT of the extracted ZIP:
REM      ThermopacStructuringAgent-v1.0.36\install_update.bat
REM  NOT from inside a subfolder.
REM
REM  Steps:
REM    1. Verify source solidworks_structurer.py has NO _rev- pattern (FAIL if found)
REM    2. Stop any running agent Python process
REM    3. Robocopy agent\ and structurer\ to install dir
REM    4. Force overwrite solidworks_structurer.py with direct copy
REM    5. Delete __pycache__ in installed agent\ and structurer\
REM    6. Verify installed solidworks_structurer.py has NO _rev- pattern (FAIL if found)
REM    7. Report PASS or FAIL
REM ============================================================

title ThermopacStructurer Installer v1.0.36

REM ── Require Administrator ─────────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [ERROR] This script must be run as Administrator.
    echo  Right-click install_update.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

REM ── Locate this script's own directory (ZIP root) ────────────────────────────
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

set "INSTALL_DIR=C:\Program Files\ThermopacStructuringAgent"

echo.
echo  Thermopac Drawing Structuring Agent — Update to v1.0.36
echo  ---------------------------------------------------------
echo  Source : %SRC%
echo  Target : %INSTALL_DIR%
echo.

REM ── Verify install dir exists ─────────────────────────────────────────────────
if not exist "%INSTALL_DIR%\" (
    echo  [ERROR] Install directory not found: %INSTALL_DIR%
    echo  Run bootstrap.bat (as Administrator) to perform a full install first.
    echo.
    pause
    exit /b 1
)

REM ── Verify source folders exist ──────────────────────────────────────────────
if not exist "%SRC%\agent\" (
    echo  [ERROR] Source folder not found: %SRC%\agent\
    echo.
    echo  Run install_update.bat from the ROOT of the extracted ZIP:
    echo.
    echo    ThermopacStructuringAgent-v1.0.36\
    echo      agent\                  ^<-- must be here
    echo      structurer\             ^<-- must be here
    echo      install_update.bat      ^<-- run THIS file
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\structurer\" (
    echo  [ERROR] Source folder not found: %SRC%\structurer\
    echo  Run from the ZIP root folder.
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\agent\structure_job_client.py" (
    echo  [ERROR] Key file missing: %SRC%\agent\structure_job_client.py
    echo  Re-download Full Package v1.0.36 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\structurer\solidworks_structurer.py" (
    echo  [ERROR] Key file missing: %SRC%\structurer\solidworks_structurer.py
    echo  Re-download Full Package v1.0.36 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)

REM ── STEP 1: Verify source file is clean BEFORE copying ───────────────────────
echo  [STEP 1] Verifying source solidworks_structurer.py has no _rev- pattern...
findstr /C:"_rev-" "%SRC%\structurer\solidworks_structurer.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo.
    echo  [FAIL] Source solidworks_structurer.py contains _rev- pattern.
    echo  This package is corrupt. Re-download from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
echo  [OK] Source is clean: filename = f"{safe_dn}.slddrw"
echo.

REM ── STEP 2: Stop any running agent processes ─────────────────────────────────
echo  [STEP 2] Stopping any running agent processes...
taskkill /F /FI "WINDOWTITLE eq ThermopacStructurer*" >nul 2>&1
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*main_structurer*' -or $_.CommandLine -like '*ThermopacStructuringAgent*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('Stopped PID ' + $_.ProcessId) } catch {} }"
timeout /t 2 >nul
echo  [OK] Agent processes stopped.
echo.

REM ── STEP 3: Robocopy agent\ ──────────────────────────────────────────────────
echo  [STEP 3] Copying agent\ ...
robocopy "%SRC%\agent" "%INSTALL_DIR%\agent" /E /IS /IT /IM /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [FAIL] robocopy failed for agent\ (code %errorLevel%)
    echo  The agent process may still be running. Close the console and retry.
    pause
    exit /b 1
)
echo  [OK] agent\ copied.
echo.

REM ── Copy structurer\ ─────────────────────────────────────────────────────────
robocopy "%SRC%\structurer" "%INSTALL_DIR%\structurer" /E /IS /IT /IM /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [FAIL] robocopy failed for structurer\ (code %errorLevel%)
    pause
    exit /b 1
)
echo  [OK] structurer\ copied.

REM ── STEP 4: Force overwrite solidworks_structurer.py ────────────────────────
REM    Belt-and-suspenders: copy /Y writes unconditionally regardless of
REM    timestamps, bypassing any robocopy same-file heuristic.
echo.
echo  [STEP 4] Force overwriting installed solidworks_structurer.py...
copy /Y "%SRC%\structurer\solidworks_structurer.py" "%INSTALL_DIR%\structurer\solidworks_structurer.py" >nul
if %errorLevel% NEQ 0 (
    echo  [FAIL] copy /Y failed for solidworks_structurer.py.
    echo  Ensure the file is not open or locked and retry as Administrator.
    pause
    exit /b 1
)
echo  [OK] solidworks_structurer.py force-written to %INSTALL_DIR%\structurer\
echo.

REM ── STEP 5: Delete __pycache__ ───────────────────────────────────────────────
REM    Python caches compiled bytecode in __pycache__\*.pyc.
REM    Deleting it forces Python to recompile from the freshly copied source.
echo  [STEP 5] Deleting __pycache__ to prevent stale bytecode...
if exist "%INSTALL_DIR%\structurer\__pycache__" (
    rd /S /Q "%INSTALL_DIR%\structurer\__pycache__"
    echo  [OK] Deleted: structurer\__pycache__
) else (
    echo  [OK] structurer\__pycache__ not present.
)
if exist "%INSTALL_DIR%\agent\__pycache__" (
    rd /S /Q "%INSTALL_DIR%\agent\__pycache__"
    echo  [OK] Deleted: agent\__pycache__
) else (
    echo  [OK] agent\__pycache__ not present.
)
echo.

REM ── Copy helper scripts (non-config files only) ───────────────────────────────
for %%F in (
    run.bat
    fix_appdata_url.ps1
    set_testing_mode.bat
    set_dev_url.bat
    set_prod_url.bat
    set_node_token.bat
    verify_install.bat
) do (
    if exist "%SRC%\%%F" (
        copy /Y "%SRC%\%%F" "%INSTALL_DIR%\%%F" >nul 2>&1
    )
)

REM ── Remove stale extractor files from old installs ────────────────────────────
if exist "%INSTALL_DIR%\agent\job_runner.py" (
    echo  Removing stale file: agent\job_runner.py
    del /F /Q "%INSTALL_DIR%\agent\job_runner.py" >nul 2>&1
)
if exist "%INSTALL_DIR%\agent\main.py" (
    echo  Removing stale file: agent\main.py
    del /F /Q "%INSTALL_DIR%\agent\main.py" >nul 2>&1
)
if exist "%INSTALL_DIR%\extractor" (
    echo  Removing stale folder: extractor\
    rd /S /Q "%INSTALL_DIR%\extractor" >nul 2>&1
)

REM ── STEP 6: Verify INSTALLED file is clean ────────────────────────────────────
echo  [STEP 6] Verifying installed solidworks_structurer.py has no _rev- pattern...
if not exist "%INSTALL_DIR%\structurer\solidworks_structurer.py" (
    echo  [FAIL] Installed file not found after copy: %INSTALL_DIR%\structurer\solidworks_structurer.py
    pause
    exit /b 1
)
findstr /C:"_rev-" "%INSTALL_DIR%\structurer\solidworks_structurer.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo.
    echo  [FAIL] Installed solidworks_structurer.py still contains _rev- pattern.
    echo  The file may have been locked during copy. Ensure the agent is fully
    echo  stopped, then run this script again as Administrator.
    echo.
    pause
    exit /b 1
)
echo  [OK] Installed file is clean: no _rev- pattern found.
echo  [OK] SaveAs3 will receive:  {DrawingNo}.slddrw  (no revision suffix)
echo.

echo  config.ini preserved (your settings are unchanged).
echo.
echo  ============================================================
echo   UPDATE COMPLETE — ThermopacStructuringAgent v1.0.36
echo   Filename save path:  {staging_root}\{DrawingNo}\{DrawingNo}.slddrw
echo   No revision suffix.  SaveAs3 receives the clean path.
echo  ============================================================
echo.
echo  Close this window and reopen run.bat to start the agent.
echo.
pause
