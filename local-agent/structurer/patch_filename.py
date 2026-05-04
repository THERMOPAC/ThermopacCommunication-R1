"""
patch_filename.py — In-place patcher for solidworks_structurer.py

Removes the _rev-{revision} suffix from the filename line in the INSTALLED
copy of solidworks_structurer.py, even when robocopy fails to replace the file.

Usage (called by install_update.bat):
    python patch_filename.py [install_dir]

Default install_dir: C:\\Program Files\\ThermopacStructuringAgent
"""
import os
import re
import sys

# ── Locate the installed file ──────────────────────────────────────────────────
if len(sys.argv) > 1:
    install_dir = sys.argv[1].strip('"').strip("'")
else:
    install_dir = r"C:\Program Files\ThermopacStructuringAgent"

target = os.path.join(install_dir, "structurer", "solidworks_structurer.py")

print("=" * 60)
print("  Thermopac Structuring Agent — Filename Patcher")
print("=" * 60)
print(f"  Target : {target}")

if not os.path.exists(target):
    print(f"\n[FAIL] File not found: {target}")
    print("       Has the agent been installed? Run bootstrap.bat first.")
    sys.exit(1)

# ── Read the installed file ────────────────────────────────────────────────────
with open(target, "r", encoding="utf-8") as f:
    lines = f.readlines()

# ── Check if already clean ────────────────────────────────────────────────────
has_rev = any("_rev-" in ln and ".slddrw" in ln for ln in lines)
if not has_rev:
    print("\n[OK]  No _rev- suffix found in filename lines — file is already clean.")
    print("      Files will be saved as  {DrawingNo}.slddrw")
    print("=" * 60)
    sys.exit(0)

# ── Patch: remove _rev-{...} from any filename assignment line ─────────────────
#
# Handles any of these old patterns:
#   filename  = f"{safe_dn}_rev-{revision}.slddrw"
#   filename  = f"{drawing_number}_rev-{revision}.slddrw"
#   filename = f"{safe_dn}_rev-{rev}.slddrw"
#   ...and any spacing variation.
#
# Strategy: for lines that contain both "_rev-" and ".slddrw", strip the
# _rev-{<anything>} token that immediately precedes .slddrw.
# ─────────────────────────────────────────────────────────────────────────────
patched_lines = []
changed = 0

for i, line in enumerate(lines):
    if "_rev-" in line and ".slddrw" in line:
        new_line = re.sub(r'_rev-\{[^}]+\}', '', line)
        if new_line != line:
            print(f"\n[PATCH] Line {i + 1}:")
            print(f"  OLD: {line.rstrip()}")
            print(f"  NEW: {new_line.rstrip()}")
            patched_lines.append(new_line)
            changed += 1
            continue
    patched_lines.append(line)

if changed == 0:
    print("\n[FAIL] _rev- pattern found but could not be patched automatically.")
    print("       Please contact Thermopac support.")
    sys.exit(2)

# ── Write back ────────────────────────────────────────────────────────────────
with open(target, "w", encoding="utf-8") as f:
    f.writelines(patched_lines)

# ── Verify ────────────────────────────────────────────────────────────────────
with open(target, "r", encoding="utf-8") as f:
    verify_content = f.read()

still_has_rev = any(
    "_rev-" in ln and ".slddrw" in ln
    for ln in verify_content.splitlines()
)
if still_has_rev:
    print("\n[FAIL] Patch was written but _rev- still present in file!")
    sys.exit(3)

print(f"\n[PASS] Patched {changed} line(s) successfully.")
print("[PASS] Files will now be saved as  {DrawingNo}.slddrw  (no revision suffix)")
print("=" * 60)
sys.exit(0)
