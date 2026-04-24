@echo off
REM ============================================================
REM  Thermopac Structuring Agent — Set Testing Mode
REM  Writes mode = testing to user APPDATA (no admin needed).
REM  Run this ONCE, then start the agent normally.
REM ============================================================
title Set Testing Mode

set "CFG_DIR=%APPDATA%\ThermopacStructuringAgent"
set "CFG=%CFG_DIR%\config.ini"

mkdir "%CFG_DIR%" 2>nul

powershell -NoProfile -Command ^
  "$f='%CFG%'; $c = if (Test-Path $f) { Get-Content $f } else { @() }; $c = $c | Where-Object { $_ -notmatch '^\s*mode\s*=' }; if (-not ($c | Select-String '^\[agent\]')) { $c += '[agent]' }; $idx = ($c | Select-String -n '^\[agent\]').LineNumber - 1; $c = $c[0..$idx] + 'mode = testing' + $c[($idx+1)..($c.Length-1)]; Set-Content $f $c -Encoding UTF8"

echo.
echo  Done!  mode = testing written to:
echo  %CFG%
echo.
echo  Now start the agent using the desktop shortcut or Start Menu.
echo.
pause
