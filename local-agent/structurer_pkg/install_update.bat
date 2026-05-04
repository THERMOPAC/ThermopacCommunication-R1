@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.37
REM  INSTALL / UPDATE SCRIPT
REM  --
REM  Run as Administrator from the ROOT of the extracted ZIP:
REM      ThermopacStructuringAgent-v1.0.37\install_update.bat
REM
REM  Steps:
REM    1. Verify source solidworks_structurer.py — no _rev- (FAIL if found)
REM    2. Verify source has no __pycache__ or .pyc files (FAIL if found)
REM    3. Stop any running agent process
REM    4. Wipe installed agent\ and structurer\ folders entirely (clean slate)
REM    5. Copy fresh v1.0.37 agent\ and structurer\ from ZIP source
REM    6. Delete any __pycache__ and .pyc files in the install dir
REM    7. Verify installed solidworks_structurer.py — no _rev- (FAIL if found)
REM    8. Report PASS
REM ============================================================

title ThermopacStructurer Installer v1.0.37

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
echo  Thermopac Drawing Structuring Agent — Install/Update to v1.0.37
echo  ----------------------------------------------------------------
echo  Source : %SRC%
echo  Target : %INSTALL_DIR%
echo.

REM ── Verify install dir exists ─────────────────────────────────────────────────
if not exist "%INSTALL_DIR%\" (
    echo  [ERROR] Install directory not found: %INSTALL_DIR%
    echo  Run bootstrap.bat as Administrator to perform a full install first.
    echo.
    pause
    exit /b 1
)

REM ── Verify source folders exist ──────────────────────────────────────────────
if not exist "%SRC%\agent\" (
    echo  [ERROR] Source folder not found: %SRC%\agent\
    echo  Run install_update.bat from the ROOT of the extracted ZIP.
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
if not exist "%SRC%\structurer\solidworks_structurer.py" (
    echo  [ERROR] Key file missing: %SRC%\structurer\solidworks_structurer.py
    echo  Re-download Full Package v1.0.37 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)

REM ══════════════════════════════════════════════════════════════
REM  STEP 1: Verify source has no _rev- filename pattern
REM ══════════════════════════════════════════════════════════════
echo  [STEP 1] Verifying source solidworks_structurer.py is clean...
findstr /C:"_rev-{" "%SRC%\structurer\solidworks_structurer.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo.
    echo  [FAIL] Source solidworks_structurer.py contains _rev- filename pattern.
    echo  This package is corrupt. Re-download v1.0.37 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
findstr /C:"safe_rev" "%SRC%\structurer\solidworks_structurer.py" >nul 2>&1
if %errorLevel% EQU 0 (
    echo.
    echo  [FAIL] Source solidworks_structurer.py still references safe_rev variable.
    echo  This package is corrupt. Re-download v1.0.37 from the Worker Agents page.
    echo.
    pause
    exit /b 1
)
echo  [OK] Source is clean: filename = f"{safe_dn}.slddrw"

REM ══════════════════════════════════════════════════════════════
REM  STEP 2: Verify source has no __pycache__ or .pyc files
REM ══════════════════════════════════════════════════════════════
echo  [STEP 2] Verifying source has no __pycache__ or .pyc files...
if exist "%SRC%\structurer\__pycache__\" (
    echo  [FAIL] Source package contains __pycache__ in structurer\.
    echo  The ZIP was built from a dirty tree. Re-download v1.0.37.
    pause
    exit /b 1
)
if exist "%SRC%\agent\__pycache__\" (
    echo  [FAIL] Source package contains __pycache__ in agent\.
    echo  The ZIP was built from a dirty tree. Re-download v1.0.37.
    pause
    exit /b 1
)
REM Check for any stray .pyc files
dir /s /b "%SRC%\structurer\*.pyc" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [FAIL] Source package contains .pyc files in structurer\.
    echo  Re-download v1.0.37.
    pause
    exit /b 1
)
dir /s /b "%SRC%\agent\*.pyc" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [FAIL] Source package contains .pyc files in agent\.
    echo  Re-download v1.0.37.
    pause
    exit /b 1
)
echo  [OK] Source package is clean — no __pycache__, no .pyc files.

REM ══════════════════════════════════════════════════════════════
REM  STEP 3: Stop running agent processes
REM ══════════════════════════════════════════════════════════════
echo  [STEP 3] Stopping any running agent processes...
taskkill /F /FI "WINDOWTITLE eq ThermopacStructurer*" >nul 2>&1
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-WmiObject Win32_Process | Where-Object { $_.CommandLine -like '*main_structurer*' -or $_.CommandLine -like '*ThermopacStructuringAgent*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('Stopped PID ' + $_.ProcessId) } catch {} }"
timeout /t 2 >nul
echo  [OK] Agent processes stopped.

REM ══════════════════════════════════════════════════════════════
REM  STEP 4: Wipe installed agent\ and structurer\ (clean slate)
REM  Wiping ensures no old .py, .pyc, or __pycache__ files survive.
REM  config.ini is outside these folders and is NOT touched.
REM ══════════════════════════════════════════════════════════════
echo  [STEP 4] Wiping installed agent\ and structurer\ for clean install...
if exist "%INSTALL_DIR%\agent\" (
    rd /S /Q "%INSTALL_DIR%\agent"
    if %errorLevel% NEQ 0 (
        echo  [FAIL] Could not remove %INSTALL_DIR%\agent\
        echo  Ensure the agent is fully stopped and no files are locked.
        pause
        exit /b 1
    )
    echo  [OK] Wiped: %INSTALL_DIR%\agent\
) else (
    echo  [OK] %INSTALL_DIR%\agent\ not present (fresh install).
)
if exist "%INSTALL_DIR%\structurer\" (
    rd /S /Q "%INSTALL_DIR%\structurer"
    if %errorLevel% NEQ 0 (
        echo  [FAIL] Could not remove %INSTALL_DIR%\structurer\
        echo  Ensure the agent is fully stopped and no files are locked.
        pause
        exit /b 1
    )
    echo  [OK] Wiped: %INSTALL_DIR%\structurer\
) else (
    echo  [OK] %INSTALL_DIR%\structurer\ not present (fresh install).
)

REM ══════════════════════════════════════════════════════════════
REM  STEP 5: Copy fresh v1.0.37 files
REM ══════════════════════════════════════════════════════════════
echo  [STEP 5] Installing fresh v1.0.37 files...
xcopy "%SRC%\agent"      "%INSTALL_DIR%\agent\"      /E /I /Q /Y
if %errorLevel% NEQ 0 (
    echo  [FAIL] xcopy failed for agent\
    pause
    exit /b 1
)
xcopy "%SRC%\structurer" "%INSTALL_DIR%\structurer\"  /E /I /Q /Y
if %errorLevel% NEQ 0 (
    echo  [FAIL] xcopy failed for structurer\
    pause
    exit /b 1
)
echo  [OK] Fresh v1.0.37 files installed.

REM ── Copy helper scripts ───────────────────────────────────────────────────────
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

REM ── Remove stale files from old installs ──────────────────────────────────────
if exist "%INSTALL_DIR%\agent\job_runner.py"  del /F /Q "%INSTALL_DIR%\agent\job_runner.py"  >nul 2>&1
if exist "%INSTALL_DIR%\agent\main.py"        del /F /Q "%INSTALL_DIR%\agent\main.py"        >nul 2>&1
if exist "%INSTALL_DIR%\extractor"            rd /S /Q  "%INSTALL_DIR%\extractor"             >nul 2>&1

REM ══════════════════════════════════════════════════════════════
REM  STEP 6: Delete ALL __pycache__ and .pyc files in install dir
REM  xcopy does not exclude them automatically.
REM  Even though Step 2 verified the source is clean, remove
REM  defensively in case any survived the copy.
REM ══════════════════════════════════════════════════════════════
echo  [STEP 6] Removing __pycache__ and .pyc files from install dir...
for /d /r "%INSTALL_DIR%\agent"      %%d in (__pycache__) do (
    if exist "%%d" ( rd /S /Q "%%d" & echo  [OK] Deleted: %%d )
)
for /d /r "%INSTALL_DIR%\structurer" %%d in (__pycache__) do (
    if exist "%%d" ( rd /S /Q "%%d" & echo  [OK] Deleted: %%d )
)
del /S /Q "%INSTALL_DIR%\agent\*.pyc"      >nul 2>&1
del /S /Q "%INSTALL_DIR%\structurer\*.pyc" >nul 2>&1
echo  [OK] No __pycache__ or .pyc files in installed package.

REM ══════════════════════════════════════════════════════════════
REM  STEP 7: Verify installed solidworks_structurer.py is clean
REM ══════════════════════════════════════════════════════════════
echo  [STEP 7] Verifying installed solidworks_structurer.py...
set "INSTALLED=%INSTALL_DIR%\structurer\solidworks_structurer.py"
if not exist "%INSTALLED%" (
    echo  [FAIL] Installed file not found: %INSTALLED%
    pause
    exit /b 1
)
findstr /C:"_rev-{" "%INSTALLED%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [FAIL] Installed file still contains _rev- pattern.
    echo  The wipe/copy failed to replace the file correctly.
    pause
    exit /b 1
)
findstr /C:"safe_rev" "%INSTALLED%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [FAIL] Installed file still references safe_rev.
    pause
    exit /b 1
)
echo  [OK] Installed file is verified clean.
echo  [OK] SaveAs3 will receive: {StagingRoot}\{DrawingNo}\{DrawingNo}.slddrw

REM ══════════════════════════════════════════════════════════════
REM  DONE
REM ══════════════════════════════════════════════════════════════
echo.
echo  config.ini preserved — your settings are unchanged.
echo.
echo  ============================================================
echo   INSTALL COMPLETE — ThermopacStructuringAgent v1.0.37
echo.
echo   Source:   filename = f"{safe_dn}.slddrw"
echo   SaveAs3:  {StagingRoot}\{DrawingNo}\{DrawingNo}.slddrw
echo   No _rev- suffix.  No __pycache__.  No .pyc files.
echo  ============================================================
echo.
echo  Close this window and run run.bat to start the agent.
echo.
pause
