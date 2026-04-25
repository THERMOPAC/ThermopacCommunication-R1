@echo off
REM ============================================================
REM  set_dev_url.bat — Override api_url to point at the Replit
REM  DEVELOPMENT server (where structure-job routes are active).
REM
REM  Run this once.  No administrator rights required.
REM  Writes to: %APPDATA%\ThermopacStructuringAgent\config.ini
REM
REM  To revert to production, run set_prod_url.bat or delete
REM  the [cloud] api_url line from the APPDATA config.ini.
REM ============================================================

setlocal

set "APPDATA_DIR=%APPDATA%\ThermopacStructuringAgent"
set "APPDATA_CFG=%APPDATA_DIR%\config.ini"
set "DEV_URL=https://5d05ae61-8225-4651-bb76-b4e20a4ddabb-00-3mex6zlihlmft.janeway.replit.dev"

echo.
echo  Setting api_url to DEVELOPMENT server (no admin rights needed)...
echo.

if not exist "%APPDATA_DIR%" mkdir "%APPDATA_DIR%"

PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cfg = '%APPDATA_CFG%';" ^
  "$url = '%DEV_URL%';" ^
  "$lines = @();" ^
  "if (Test-Path $cfg) { $lines = [System.IO.File]::ReadAllLines($cfg) };" ^
  "$hasCloud = $false;" ^
  "$hasUrl = $false;" ^
  "$out = [System.Collections.Generic.List[string]]::new();" ^
  "foreach ($line in $lines) {" ^
  "  if ($line -match '^\[cloud\]') { $hasCloud = $true; $out.Add($line); continue };" ^
  "  if ($hasCloud -and $line -match '^api_url\s*=') { $out.Add('api_url = ' + $url); $hasUrl = $true; continue };" ^
  "  $out.Add($line)" ^
  "};" ^
  "if (-not $hasCloud) { $out.Add('[cloud]'); $out.Add('api_url = ' + $url) };" ^
  "elseif (-not $hasUrl) { $idx = ($out | Select-String -Pattern '^\[cloud\]' | Select-Object -First 1).LineNumber; $out.Insert($idx, 'api_url = ' + $url) };" ^
  "[System.IO.File]::WriteAllLines($cfg, $out, [System.Text.UTF8Encoding]::new($false))"

echo  Done.
echo.
echo  api_url is now: %DEV_URL%
echo.
echo  APPDATA config: %APPDATA_CFG%
echo.
echo  Restart the Structuring Agent to apply.
echo.
pause
