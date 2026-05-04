"""
_test_filename.py — Standalone self-test for solidworks_structurer.py filename logic.

Verifies that:
  1. solidworks_structurer.py exists in this directory.
  2. The filename construction line does NOT contain _rev-.
  3. The actual _safe_name() function produces filenames of the
     form "{DrawingNo}.slddrw" with no revision suffix.

Run via verify_install.bat (or directly):
    python structurer\_test_filename.py

Exit code: 0 = PASS, 1 = FAIL
"""
from __future__ import annotations
import os
import re
import sys

_HERE     = os.path.dirname(os.path.abspath(__file__))
_SRC_FILE = os.path.join(_HERE, "solidworks_structurer.py")
_PASS     = 0
_FAIL     = 1


def _check_source(src: str) -> tuple[bool, str]:
    """
    Parse solidworks_structurer.py and find the filename = f"..." line.
    Returns (ok, message).
    """
    # Match:  filename  = f"{safe_dn}.slddrw"
    m = re.search(r'filename\s*=\s*f"([^"]+)"', src)
    if not m:
        return False, (
            "Cannot find  filename = f\"...\"  in solidworks_structurer.py.\n"
            "The file may be corrupt or from an unexpected version."
        )
    pattern = m.group(1)
    if "_rev-" in pattern:
        return False, (
            f"FAIL: _rev- found in filename pattern: {pattern!r}\n"
            "The installed solidworks_structurer.py is the old v1.0.32 code.\n"
            "Run install_update.bat (as Administrator) from the ZIP root to fix."
        )
    return True, f"filename pattern is clean: {pattern!r}"


def _check_runtime() -> tuple[bool, str]:
    """
    Import _safe_name() at runtime and verify it produces clean filenames.
    Falls back gracefully if win32com is unavailable (non-Windows or no SW).
    """
    # Inject mock modules so the import doesn't fail without win32com
    import types
    for mod in ("win32com", "win32com.client", "pythoncom", "pywintypes"):
        if mod not in sys.modules:
            sys.modules[mod] = types.ModuleType(mod)

    # Add the agent root to sys.path
    agent_root = os.path.dirname(_HERE)
    if agent_root not in sys.path:
        sys.path.insert(0, agent_root)

    try:
        from structurer.solidworks_structurer import _safe_name  # type: ignore
    except Exception as e:
        return False, f"Import failed: {e}"

    test_cases = [
        "C103092627016003",
        "C103092627016002",
        "DRAW-001",
        "ABC/123",   # illegal char — should be sanitised, not cause _rev-
    ]
    for dn in test_cases:
        safe_dn  = _safe_name(dn)
        filename = f"{safe_dn}.slddrw"
        if "_rev-" in filename:
            return False, (
                f"FAIL: _rev- in generated filename for drawing {dn!r}: {filename!r}"
            )

    sample = _safe_name("C103092627016003")
    return True, f"Runtime OK — sample: '{sample}.slddrw'"


def main() -> int:
    print()
    print("=" * 60)
    print("  Thermopac Structuring Agent — Filename Self-Test")
    print("=" * 60)

    # ── 1. File existence ──────────────────────────────────────────────
    if not os.path.isfile(_SRC_FILE):
        print(f"[FAIL] File not found: {_SRC_FILE}")
        print("       Re-run install_update.bat (as Administrator) from the ZIP root.")
        print("=" * 60)
        return _FAIL
    print(f"[OK]   File found: {_SRC_FILE}")

    # ── 2. Source code check ───────────────────────────────────────────
    with open(_SRC_FILE, encoding="utf-8") as fh:
        src = fh.read()

    ok, msg = _check_source(src)
    if not ok:
        print(f"[FAIL] Source check: {msg}")
        print("=" * 60)
        return _FAIL
    print(f"[OK]   Source check: {msg}")

    # ── 3. Runtime check ───────────────────────────────────────────────
    ok2, msg2 = _check_runtime()
    if not ok2:
        print(f"[FAIL] Runtime check: {msg2}")
        print("=" * 60)
        return _FAIL
    print(f"[OK]   Runtime check: {msg2}")

    print()
    print("  RESULT: PASS")
    print("  Files will be saved as  {DrawingNo}.slddrw  (no revision suffix)")
    print("=" * 60)
    return _PASS


if __name__ == "__main__":
    sys.exit(main())
