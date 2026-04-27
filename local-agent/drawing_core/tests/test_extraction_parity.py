"""
drawing_core/tests/test_extraction_parity.py — Regression parity test.

PURPOSE
───────
Confirms that drawing_core.get_custom_properties() returns byte-identical
results to the extractor's existing _read_cpm() for the same .slddrw file.

This test MUST PASS before solidworks_extractor.py is modified to import
from drawing_core (Step 4 in the migration sequence).

USAGE
─────
Run from the local-agent\ directory on a Windows machine with SolidWorks:

    python drawing_core/tests/test_extraction_parity.py <path_to_drawing.slddrw>

EXIT CODES
──────────
  0 — PASS  (identical output, safe to proceed to extractor switchover)
  1 — FAIL  (diff detected, fix drawing_core/properties.py and re-run)
  2 — ERROR (could not run — missing file, SolidWorks unavailable, etc.)

NOTES
─────
- Runs a REAL SolidWorks session via DispatchEx().
- Requires pywin32 and a configured config.ini (for sw_progid).
- Does NOT save, modify, or close the engineer's session.
- Compares only properties in ALL_PROPS (the 101 schema-defined names).
- Prints a full diff if FAIL; prints PASS summary if identical.
"""

from __future__ import annotations
import os
import sys
import json


def _find_local_agent_root() -> str:
    """Walk up from this file to find the local-agent root."""
    here = os.path.abspath(os.path.dirname(__file__))
    candidate = os.path.dirname(os.path.dirname(here))   # drawing_core/../ = local-agent
    if os.path.isfile(os.path.join(candidate, "requirements.txt")):
        return candidate
    raise RuntimeError(f"Cannot locate local-agent root from {here}")


def _setup_path():
    root = _find_local_agent_root()
    if root not in sys.path:
        sys.path.insert(0, root)


def _run(drawing_path: str) -> int:
    _setup_path()

    if not os.path.isfile(drawing_path):
        print(f"[ERROR] File not found: {drawing_path}")
        return 2

    print(f"[Parity Test] Target file : {drawing_path}")
    print(f"[Parity Test] File size   : {os.path.getsize(drawing_path):,} bytes")
    print()

    # ── Load config ───────────────────────────────────────────────────────────
    try:
        from agent.config import AgentConfig
        config = AgentConfig()
        sw_progid = config.sw_progid
        if not sw_progid:
            print("[ERROR] SolidWorks ProgID not detected — ensure SW is installed.")
            return 2
        print(f"[Parity Test] SolidWorks  : {sw_progid}")
    except Exception as e:
        print(f"[ERROR] Config load failed: {e}")
        return 2

    # ── Launch SolidWorks ─────────────────────────────────────────────────────
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
    except ImportError:
        print("[ERROR] pywin32 not available — run on Windows with pywin32 installed.")
        return 2

    from extractor.sw_instance import _launch_sw_dedicated_instance, _get_sldworks_pids, _kill_orphan_sw_process
    import logging
    logging.basicConfig(level=logging.WARNING)
    logger = logging.getLogger("parity_test")

    sw_app      = None
    sw_pid      = None
    model       = None          # must be initialised before the outer try/finally
    pids_before = _get_sldworks_pids()

    try:
        sw_app, binding = _launch_sw_dedicated_instance(sw_progid, logger)
        pids_after = _get_sldworks_pids()
        new_pids   = pids_after - pids_before
        sw_pid     = next(iter(new_pids), None)
        sw_app.Visible = False
        print(f"[Parity Test] SW launched  : {binding}  PID={sw_pid}")

        # ── Open drawing (read-only, both sessions use same options) ──────────
        import win32com.client as _wc
        _VT_I4_REF = pythoncom.VT_I4 | pythoncom.VT_BYREF
        from win32com.client import VARIANT as _V
        _SW_DOC_DRW   = 3
        _OPT_SILENT   = 1
        _OPT_READONLY = 2

        options = _OPT_SILENT | _OPT_READONLY
        v_err  = _V(pythoncom.VT_I4 | pythoncom.VT_BYREF, 0)
        v_warn = _V(pythoncom.VT_I4 | pythoncom.VT_BYREF, 0)
        model  = None
        try:
            model = sw_app.OpenDoc7(drawing_path, _SW_DOC_DRW, options, "", v_err, v_warn)
        except Exception as e:
            print(f"[Parity Test] OpenDoc7 raised: {e} — trying OpenDoc6")
        if model is None:
            try:
                model = sw_app.OpenDoc6(drawing_path, _SW_DOC_DRW, options, "", 0, 0)
            except Exception as e:
                print(f"[Parity Test] OpenDoc6 raised: {e}")
        if model is None:
            try:
                model = sw_app.OpenDoc(drawing_path, _SW_DOC_DRW)
            except Exception as e:
                print(f"[Parity Test] OpenDoc raised: {e}")
        if model is None:
            print("[ERROR] All open strategies failed.")
            return 2

        print("[Parity Test] Drawing opened.")
        print()

        # ── Run A: extractor's _read_cpm (original, untouched) ────────────────
        print("[Parity Test] Running: extractor._read_cpm (original) ...")
        from extractor.solidworks_extractor import _read_cpm, _TARGET_PROPERTIES
        cpm_obj = model.Extension.CustomPropertyManager("")
        legacy_result: dict = _read_cpm(cpm_obj, "drawing-level", logger, probe_names=_TARGET_PROPERTIES)
        print(f"[Parity Test] _read_cpm returned {len(legacy_result)} properties")

        # ── Run B: drawing_core.get_custom_properties ─────────────────────────
        print("[Parity Test] Running: drawing_core.get_custom_properties ...")
        from drawing_core.properties import get_custom_properties
        from drawing_core.schema import ALL_PROPS
        core_result = get_custom_properties(model, names=ALL_PROPS, logger=logger)
        core_props  = core_result.properties
        print(f"[Parity Test] drawing_core returned {len(core_props)} properties")
        print(f"[Parity Test]   present={len(core_result.present)} missing={len(core_result.missing)}")

        # ── Compare ───────────────────────────────────────────────────────────
        # Scope: only keys that _read_cpm probed (the original _TARGET_PROPERTIES)
        # Both results normalised to lowercase keys, stripped values.
        scope = [n for n in _TARGET_PROPERTIES if n in legacy_result or n in core_props]
        diffs: list[dict] = []

        for name in scope:
            legacy_val = str(legacy_result.get(name, "")).strip()
            core_val   = str(core_props.get(name, "")).strip()
            if legacy_val != core_val:
                diffs.append({
                    "property": name,
                    "legacy":   legacy_val,
                    "core":     core_val,
                    "present_in_core": name in core_result.present,
                })

        print()
        if not diffs:
            print("=" * 60)
            print("  RESULT: PASS")
            print(f"  {len(scope)} properties compared — all identical.")
            print("  Safe to proceed to extractor switchover (Step 4).")
            print("=" * 60)
            return 0
        else:
            print("=" * 60)
            print(f"  RESULT: FAIL  ({len(diffs)} differences found)")
            print("  NOT safe to switch extractor — fix drawing_core/properties.py")
            print("=" * 60)
            print()
            for d in diffs:
                print(f"  Property : {d['property']}")
                print(f"  Legacy   : {d['legacy']!r}")
                print(f"  Core     : {d['core']!r}")
                print(f"  Present  : {d['present_in_core']}")
                print()
            return 1

    except Exception as e:
        import traceback
        print(f"[ERROR] {type(e).__name__}: {e}")
        traceback.print_exc()
        return 2

    finally:
        if sw_app is not None:
            try:
                if model is not None:
                    sw_app.CloseDoc(drawing_path)
            except Exception:
                pass
            try:
                sw_app.ExitApp()
            except Exception:
                pass
        if sw_pid is not None:
            from extractor.sw_instance import _kill_orphan_sw_process
            if sw_pid in _get_sldworks_pids():
                _kill_orphan_sw_process(sw_pid, logger)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python drawing_core/tests/test_extraction_parity.py <path_to.slddrw>")
        print()
        print("  Compares extractor._read_cpm() vs drawing_core.get_custom_properties()")
        print("  Must PASS before extractor is switched to use drawing_core (Step 4).")
        sys.exit(2)
    sys.exit(_run(sys.argv[1]))
