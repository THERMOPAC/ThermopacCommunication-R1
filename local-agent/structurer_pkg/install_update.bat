@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.35
REM  INSTALL UPDATE SCRIPT
REM  --
REM  Run as Administrator from the ROOT of the extracted ZIP:
REM      ThermopacStructuringAgent-v1.0.35\install_update.bat
REM  NOT from inside a subfolder.
REM
REM  Steps:
REM    1. Verify source files exist (fails with clear error if not)
REM    2. Stop any running agent Python process
REM    3. Robocopy agent\ and structurer\ to install dir
REM    4. Remove stale extractor files left by old installs
REM    5. Run the Python filename self-test to confirm fix
REM    6. Report PASS or FAIL
REM ============================================================

title ThermopacStructurer Installer v1.0.35

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
echo  Thermopac Drawing Structuring Agent — Update to v1.0.35
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

REM ── Verify source folders exist relative to THIS script ──────────────────────
if not exist "%SRC%\agent\" (
    echo  [ERROR] Source folder not found: %SRC%\agent\
    echo.
    echo  You must run install_update.bat from the ROOT of the extracted ZIP:
    echo.
    echo    ThermopacStructuringAgent-v1.0.35\
    echo      agent\                  ^<-- must be here
    echo      structurer\             ^<-- must be here
    echo      install_update.bat      ^<-- run THIS file  (you are here)
    echo      structure_pkg\
    echo          install_update.bat  ^<-- do NOT run this one
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\structurer\" (
    echo  [ERROR] Source folder not found: %SRC%\structurer\
    echo  Same as above — run from the ZIP root folder.
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\agent\structure_job_client.py" (
    echo  [ERROR] Key file missing: %SRC%\agent\structure_job_client.py
    echo  Re-download Full Package v1.0.35 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
if not exist "%SRC%\structurer\solidworks_structurer.py" (
    echo  [ERROR] Key file missing: %SRC%\structurer\solidworks_structurer.py
    echo  Re-download Full Package v1.0.35 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)

REM ── Verify source filename fix BEFORE copying ─────────────────────────────────
findstr /C:"_rev-" "%SRC%\structurer\solidworks_structurer.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [ERROR] Source file still contains _rev- pattern.
    echo  This package is not clean. Re-download from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
echo  [OK] Source verified: solidworks_structurer.py has no _rev- pattern.

REM ── Stop any running agent processes ─────────────────────────────────────────
echo.
echo  Stopping any running agent processes...
taskkill /F /FI "WINDOWTITLE eq ThermopacStructurer*" >nul 2>&1
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*main_structurer*' -or $_.CommandLine -like '*ThermopacStructuringAgent*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('Stopped PID ' + $_.ProcessId) } catch {} }"
timeout /t 2 >nul

REM ── Copy agent\ ──────────────────────────────────────────────────────────────
echo  Copying agent\ ...
robocopy "%SRC%\agent" "%INSTALL_DIR%\agent" /E /IS /IT /IM /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [ERROR] robocopy failed for agent\ (code %errorLevel%)
    echo  The agent process may still be running. Close the console and retry.
    pause
    exit /b 1
)
echo  [OK] agent\ copied.

REM ── Copy structurer\ ─────────────────────────────────────────────────────────
echo  Copying structurer\ ...
robocopy "%SRC%\structurer" "%INSTALL_DIR%\structurer" /E /IS /IT /IM /NJH /NJS
if %errorLevel% GEQ 8 (
    echo  [ERROR] robocopy failed for structurer\ (code %errorLevel%)
    pause
    exit /b 1
)
echo  [OK] structurer\ copied.

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

REM ── Find Python ───────────────────────────────────────────────────────────────
set "PYTHON="
for %%P in (
    "%INSTALL_DIR%\python\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Python39\python.exe"
) do (
    if exist %%P (
        set "PYTHON=%%~P"
        goto :found_python
    )
)
where python >nul 2>&1
if %errorLevel% EQU 0 (
    set "PYTHON=python"
    goto :found_python
)
echo.
echo  [WARN] Python not found — skipping filename self-test.
echo  Run verify_install.bat after installing Python to confirm the fix.
goto :skip_test
:found_python

REM ── Run the filename self-test ────────────────────────────────────────────────
echo.
echo  Running filename self-test...
"%PYTHON%" "%INSTALL_DIR%\structurer\_test_filename.py"
set "TEST_RESULT=%errorLevel%"
if %TEST_RESULT% NEQ 0 (
    echo.
    echo  [ERROR] Self-test FAILED — the copy did not succeed correctly.
    echo  The agent process may have had the files locked. Close the agent
    echo  console window and run this script again.
    echo.
    pause
    exit /b 1
)
:skip_test

echo.
echo  config.ini preserved (your settings are unchanged).
echo.
echo  ============================================================
echo   UPDATE COMPLETE — ThermopacStructuringAgent v1.0.35
echo   Files will be saved as:  {DrawingNo}.slddrw
echo   No revision suffix in filename.
echo  ============================================================
echo.
echo  Close this window and reopen run.bat to start the agent.
echo.
pause
