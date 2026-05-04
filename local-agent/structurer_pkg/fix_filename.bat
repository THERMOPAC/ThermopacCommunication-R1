@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent — Filename Patch
REM  --
REM  Removes the _rev-{revision} suffix from generated filenames.
REM  Patches ONE line in solidworks_structurer.py in-place.
REM  Run as Administrator.
REM ============================================================

title ThermopacStructurer — Filename Fix

REM ── Require Administrator ────────────────────────────────────────────────────
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo  [ERROR] Must be run as Administrator.
    echo  Right-click fix_filename.bat and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)

set "TARGET=C:\Program Files\ThermopacStructuringAgent\structurer\solidworks_structurer.py"

if not exist "%TARGET%" (
    echo.
    echo  [ERROR] File not found: %TARGET%
    echo.
    pause
    exit /b 1
)

echo.
echo  Patching: %TARGET%
echo.

REM ── Use PowerShell to do the in-place text replacement ───────────────────────
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$file = '%TARGET%';" ^
  "$content = Get-Content $file -Raw -Encoding UTF8;" ^
  "$before = $content;" ^
  "$content = $content -replace 'filename\s*=\s*f\"\{safe_dn\}_rev-\{revision\}\.slddrw\"', 'filename  = f\"{safe_dn}.slddrw\"';" ^
  "if ($content -eq $before) { Write-Host '[INFO] Pattern not found — already patched or different version.'; } else { Set-Content $file $content -Encoding UTF8 -NoNewline; Write-Host '[OK] Patch applied.'; }"

echo.

REM ── Verify the fix ────────────────────────────────────────────────────────────
findstr /C:"_rev-" "%TARGET%" >nul 2>&1
if %errorLevel% EQU 0 (
    echo  [WARNING] _rev- still found in file — patch may not have matched.
    echo  Open the file in Notepad and manually remove _rev-{revision} from the filename line.
) else (
    echo  [OK] Verified: _rev- is no longer in solidworks_structurer.py
    echo.
    echo  Restart the agent (run.bat) for the change to take effect.
)

echo.
pause
