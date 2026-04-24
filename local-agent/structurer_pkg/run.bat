@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent v1.0.7
REM  THERMOPAC ERP | SolidWorks WRITE Agent | Phase 1
REM  --
REM  Uses bundled venv Python if available, falls back to system Python.
REM  The Inno Setup installer places the bundled python\ folder here.
REM ============================================================
title ThermopacStructurer v1.0.7
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

set "AGENT_DIR=%~dp0"
if "%AGENT_DIR:~-1%"=="\" set "AGENT_DIR=%AGENT_DIR:~0,-1%"

REM -- Change to agent root so Python module imports resolve correctly
cd /d "%AGENT_DIR%"

REM -- Prefer bundled Python (installed by Inno Setup or build-installer.bat)
set "PYEXE=%AGENT_DIR%\python\python.exe"

REM -- Fall back to venv Python (bootstrap.bat setup)
if not exist "%PYEXE%" set "PYEXE=%AGENT_DIR%\venv\Scripts\python.exe"

REM -- Fall back to system Python
if not exist "%PYEXE%" set "PYEXE=python"

echo.
echo  ThermopacStructurer -- SolidWorks Drawing Structuring Agent
echo  THERMOPAC ERP Integration  ^|  Phase 1  ^|  v1.0.7
echo.

"%PYEXE%" "%AGENT_DIR%\agent\main_structurer.py" "%AGENT_DIR%\config.ini" %*
pause
