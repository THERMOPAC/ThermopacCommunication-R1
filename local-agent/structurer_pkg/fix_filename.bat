@echo off
REM ============================================================
REM  Thermopac Drawing Structuring Agent — Zero-Trust Filename Patch
REM  --
REM  Searches ALL install locations for any .py file containing
REM  "_rev-" in a filename construction and patches every copy.
REM  Run as Administrator.
REM ============================================================

title ThermopacStructurer — Zero-Trust Filename Fix

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

echo.
echo  ============================================================
echo   Thermopac Structuring Agent — Zero-Trust Filename Patch
echo  ============================================================
echo.
echo  Searching all install locations for _rev- in Python files...
echo.

REM ── Run comprehensive PowerShell patch ───────────────────────────────────────
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$searchRoots = @(" ^
  "  'C:\Program Files\ThermopacStructuringAgent'," ^
  "  'C:\Program Files (x86)\ThermopacStructuringAgent'," ^
  "  \"$env:APPDATA\ThermopacStructuringAgent\"," ^
  "  \"$env:LOCALAPPDATA\ThermopacStructuringAgent\"," ^
  "  'C:\ThermopacStructuringAgent'" ^
  ");" ^
  "$patched = @();" ^
  "$alreadyOk = @();" ^
  "$notFound = @();" ^
  "foreach ($root in $searchRoots) {" ^
  "  if (-not (Test-Path $root)) { continue }" ^
  "  Write-Host \"  Scanning: $root\";" ^
  "  $files = Get-ChildItem -Path $root -Recurse -Filter '*.py' -ErrorAction SilentlyContinue;" ^
  "  foreach ($file in $files) {" ^
  "    $content = Get-Content $file.FullName -Raw -Encoding UTF8;" ^
  "    if ($content -match '_rev-') {" ^
  "      Write-Host \"  [FOUND] _rev- in: $($file.FullName)\";" ^
  "      $before = $content;" ^
  "      $content = $content -replace '(?m)^(\s*filename\s*=\s*f\"[^\"]*_rev-[^\"]*\.slddrw\")', '        filename  = f\"{safe_dn}.slddrw\"  # patched: removed _rev- suffix';" ^
  "      if ($content -ne $before) {" ^
  "        Set-Content $file.FullName $content -Encoding UTF8 -NoNewline;" ^
  "        Write-Host \"  [PATCHED] $($file.FullName)\";" ^
  "        $patched += $file.FullName;" ^
  "      } else {" ^
  "        Write-Host \"  [WARN] _rev- found but line pattern did not match in: $($file.FullName)\";" ^
  "        Write-Host \"         Trying broad replace of any slddrw line with _rev-...\";" ^
  "        $lines = (Get-Content $file.FullName -Encoding UTF8);" ^
  "        $newLines = @();" ^
  "        $changed = $false;" ^
  "        foreach ($line in $lines) {" ^
  "          if ($line -match '_rev-' -and $line -match '\.slddrw') {" ^
  "            Write-Host \"  [LINE] Was: $line\";" ^
  "            $indent = ($line -replace '^(\s*).*', '$1');" ^
  "            $newLine = $indent + 'filename  = f\"{safe_dn}.slddrw\"  # patched';" ^
  "            Write-Host \"  [LINE] Now: $newLine\";" ^
  "            $newLines += $newLine;" ^
  "            $changed = $true;" ^
  "          } else { $newLines += $line }" ^
  "        };" ^
  "        if ($changed) {" ^
  "          Set-Content $file.FullName $newLines -Encoding UTF8;" ^
  "          Write-Host \"  [PATCHED-BROAD] $($file.FullName)\";" ^
  "          $patched += $file.FullName;" ^
  "        }" ^
  "      }" ^
  "    }" ^
  "  }" ^
  "};" ^
  "Write-Host '';" ^
  "Write-Host '  ── VERIFICATION ──────────────────────────────────────────';" ^
  "Write-Host '';" ^
  "$failFiles = @();" ^
  "foreach ($root in $searchRoots) {" ^
  "  if (-not (Test-Path $root)) { continue }" ^
  "  $files = Get-ChildItem -Path $root -Recurse -Filter '*.py' -ErrorAction SilentlyContinue;" ^
  "  foreach ($file in $files) {" ^
  "    $c = Get-Content $file.FullName -Raw -Encoding UTF8 -ErrorAction SilentlyContinue;" ^
  "    if ($c -match '_rev-') {" ^
  "      Write-Host \"  [FAIL] _rev- STILL present: $($file.FullName)\";" ^
  "      $failFiles += $file.FullName;" ^
  "    }" ^
  "  }" ^
  "};" ^
  "Write-Host '';" ^
  "if ($patched.Count -eq 0) {" ^
  "  Write-Host '  [INFO] No files contained _rev- — may already be clean or wrong install location.';" ^
  "} else {" ^
  "  Write-Host \"  Files patched: $($patched.Count)\";" ^
  "  foreach ($p in $patched) { Write-Host \"    OK: $p\" }" ^
  "};" ^
  "if ($failFiles.Count -gt 0) {" ^
  "  Write-Host '';" ^
  "  Write-Host '  [FAIL] Patch incomplete — _rev- still present in the above files.';" ^
  "  Write-Host '  Open those files in Notepad and find the line with _rev- and .slddrw';" ^
  "  Write-Host '  Replace that entire line with:  filename = f\"{safe_dn}.slddrw\"';" ^
  "} else {" ^
  "  Write-Host '  [OK] All clear — no _rev- remaining in any installed Python file.';" ^
  "  Write-Host '  Restart the agent (close the console and reopen run.bat).';" ^
  "}"

echo.
echo  ============================================================
echo   Done. Restart the agent (run.bat) for changes to take effect.
echo  ============================================================
echo.
pause
