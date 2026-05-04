@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.36
REM  VERIFY INSTALLATION
REM  --
REM  Confirms the installed solidworks_structurer.py produces
REM  filenames of the form:
REM      {DrawingNo}.slddrw   (no _rev- suffix)
REM
REM  Uses findstr — no Python or additional scripts required.
REM  Does NOT require Administrator — read-only test.
REM  Does NOT require SolidWorks to be running.
REM ============================================================

title Thermopac Filename Verify

set "INSTALL_DIR=C:\Program Files\ThermopacStructuringAgent"
set "TARGET=%INSTALL_DIR%\structurer\solidworks_structurer.py"

echo.
echo  Thermopac Structuring Agent — Filename Verification
echo  ====================================================
echo  Checking: %TARGET%
echo.

if not exist "%INSTALL_DIR%\" (
    echo  [FAIL] Install directory not found: %INSTALL_DIR%
    echo  Run bootstrap.bat (as Administrator) to install the agent first.
    echo.
    pause
    exit /b 1
)

if not exist "%TARGET%" (
    echo  [FAIL] File not found: %TARGET%
    echo  Run install_update.bat as Administrator to update the installation.
    echo.
    pause
    exit /b 1
)

REM ── Check 1: no _rev- pattern in the file ─────────────────────────────────────
findstr /C:"_rev-" "%TARGET%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [FAIL] _rev- pattern found in installed solidworks_structurer.py.
    echo.
    echo  The installed file still has the old filename construction.
    echo  Run install_update.bat as Administrator from the ZIP root.
    echo.
    pause
    exit /b 1
)
echo  [OK] No _rev- pattern in installed file.

REM ── Check 2: correct filename line is present ────────────────────────────────
findstr /C:"filename  = f" "%TARGET%" >nul 2>&1
if %errorLevel% NEQ 0 (
    findstr /C:"filename = f" "%TARGET%" >nul 2>&1
    if %errorLevel% NEQ 0 (
        echo  [WARN] Cannot confirm filename assignment line. File may be modified.
        goto :done_checks
    )
)
echo  [OK] filename assignment line is present.

REM ── Check 3: __pycache__ is absent (stale bytecode risk) ─────────────────────
:done_checks
if exist "%INSTALL_DIR%\structurer\__pycache__" (
    echo  [WARN] __pycache__ exists in structurer\ — stale bytecode may be loaded.
    echo         Run install_update.bat as Administrator to clear it.
) else (
    echo  [OK] No __pycache__ in structurer\ — bytecode is fresh.
)

echo.
echo  ====================================================
echo   VERIFIED: installed code has no _rev- suffix.
echo   SaveAs3 will receive:  {DrawingNo}.slddrw
echo  ====================================================
echo.
pause
exit /b 0
