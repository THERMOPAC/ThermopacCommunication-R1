@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.34
REM  INSTALL UPDATE SCRIPT
REM  --
REM  Run as Administrator from the extracted ZIP folder.
REM  Copies all Python source files to the installed location,
REM  overwriting old versions. Preserves config.ini (your settings).
REM ============================================================

title ThermopacStructurer Updater v1.0.34

REM ── Require Administrator ────────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [ERROR] This script must be run as Administrator.
    echo.
    echo  Right-click install_update.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

REM ── Detect install path ───────────────────────────────────────────────────────
set "INSTALL_DIR=C:\Program Files\ThermopacStructuringAgent"

if not exist "%INSTALL_DIR%\" (
    echo.
    echo  [ERROR] Install directory not found:
    echo         %INSTALL_DIR%
    echo.
    echo  Run the full installer first, then use this script to update.
    echo.
    pause
    exit /b 1
)

REM ── Locate this script's directory (the extracted ZIP root) ───────────────────
set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

echo.
echo  Thermopac Drawing Structuring Agent — Update to v1.0.34
echo  --------------------------------------------------------
echo  Source : %SRC%
echo  Target : %INSTALL_DIR%
echo.

REM ── Verify source directories exist before copying ───────────────────────────
if not exist "%SRC%\agent\" (
    echo  [ERROR] Source folder not found: %SRC%\agent\
    echo.
    echo  This script must be run from the ROOT of the extracted ZIP folder,
    echo  not from inside a subfolder (e.g. structure_pkg\).
    echo.
    echo  Correct location:  ThermopacStructuringAgent-v1.0.34\install_update.bat
    echo  Wrong location:    ThermopacStructuringAgent-v1.0.34\structure_pkg\install_update.bat
    echo.
    pause
    exit /b 1
)

if not exist "%SRC%\structurer\" (
    echo  [ERROR] Source folder not found: %SRC%\structurer\
    echo.
    echo  This script must be run from the ROOT of the extracted ZIP folder.
    echo.
    pause
    exit /b 1
)

REM ── Verify key source file is present (sanity check) ─────────────────────────
if not exist "%SRC%\agent\structure_job_client.py" (
    echo  [ERROR] Key file missing: %SRC%\agent\structure_job_client.py
    echo.
    echo  The extracted ZIP may be incomplete. Re-download the Full Package.
    echo.
    pause
    exit /b 1
)

REM ── Copy agent Python source (overwrite) ────────────────────────────────────
echo  Updating agent\...
xcopy /E /I /Y "%SRC%\agent"      "%INSTALL_DIR%\agent"
if %errorLevel% NEQ 0 (
    echo  [ERROR] Failed to copy agent\ — check permissions.
    pause
    exit /b 1
)

echo  Updating structurer\...
xcopy /E /I /Y "%SRC%\structurer" "%INSTALL_DIR%\structurer"
if %errorLevel% NEQ 0 (
    echo  [ERROR] Failed to copy structurer\ — check permissions.
    pause
    exit /b 1
)

REM ── Copy bat/ps1 helper scripts (overwrite) ──────────────────────────────────
for %%F in (
    run.bat
    fix_appdata_url.ps1
    set_testing_mode.bat
    set_dev_url.bat
    set_prod_url.bat
    set_node_token.bat
) do (
    if exist "%SRC%\%%F" (
        echo  Updating %%F...
        copy /Y "%SRC%\%%F" "%INSTALL_DIR%\%%F" >nul 2>&1
    )
)

REM ── Verify version was actually written ───────────────────────────────────────
findstr /C:"1.0.34" "%INSTALL_DIR%\agent\structure_job_client.py" >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [WARNING] Version check failed — structure_job_client.py may not have updated.
    echo  Check that the agent process was closed before running this script.
    echo.
) else (
    echo.
    echo  [OK] Version verified: structure_job_client.py contains v1.0.34
)

REM ── Preserve config.ini (do NOT overwrite user settings) ─────────────────────
echo.
echo  config.ini preserved (your settings were not changed).
echo.

echo  ============================================================
echo   Update complete!  ThermopacStructuringAgent is now v1.0.34
echo  ============================================================
echo.
echo  You can now close this window and restart the agent.
echo.
pause
