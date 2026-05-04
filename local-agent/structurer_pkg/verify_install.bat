@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.35
REM  VERIFY INSTALLATION — filename fix self-test
REM  --
REM  Runs the Python self-test that confirms the installed
REM  solidworks_structurer.py produces filenames of the form
REM      {DrawingNo}.slddrw   (no _rev- suffix)
REM
REM  Does NOT require Administrator — read-only test.
REM  Does NOT require SolidWorks to be running.
REM ============================================================

title Thermopac Filename Verify

set "INSTALL_DIR=C:\Program Files\ThermopacStructuringAgent"
set "TEST_SCRIPT=%INSTALL_DIR%\structurer\_test_filename.py"

echo.
echo  Thermopac Structuring Agent — Filename Verification
echo  ====================================================

if not exist "%INSTALL_DIR%\" (
    echo  [FAIL] Install directory not found: %INSTALL_DIR%
    echo  Run bootstrap.bat (as Administrator) to install the agent first.
    echo.
    pause
    exit /b 1
)

if not exist "%TEST_SCRIPT%" (
    echo  [FAIL] Self-test script not found: %TEST_SCRIPT%
    echo  This means the installation is v1.0.32 (old version without the test).
    echo  Download Full Package v1.0.35 from the Worker Agents page and run
    echo  install_update.bat (as Administrator) from the ZIP root folder.
    echo.
    pause
    exit /b 1
)

REM ── Find Python ───────────────────────────────────────────────────────────────
set "PYTHON="
for %%P in (
    "%INSTALL_DIR%\python\python.exe"
    "C:\Python311\python.exe"
    "C:\Python310\python.exe"
    "C:\Python39\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python311\python.exe"
    "C:\Users\%USERNAME%\AppData\Local\Programs\Python\Python310\python.exe"
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
echo  [FAIL] Python not found. Install Python 3.9+ and re-run.
echo.
pause
exit /b 1
:found_python

echo  Python: %PYTHON%
echo.

REM ── Run the self-test ─────────────────────────────────────────────────────────
"%PYTHON%" "%TEST_SCRIPT%"
set "TEST_EXIT=%errorLevel%"

echo.
if %TEST_EXIT% EQU 0 (
    echo  ====================================================
    echo   VERIFIED: filename fix is correctly installed.
    echo   Next job will create:  {DrawingNo}.slddrw
    echo  ====================================================
) else (
    echo  ====================================================
    echo   FAILED: installed code still has old filename logic.
    echo   Download Full Package v1.0.35 from the Worker Agents
    echo   page and run install_update.bat as Administrator
    echo   from the extracted ZIP root folder.
    echo  ====================================================
)
echo.
pause
exit /b %TEST_EXIT%
