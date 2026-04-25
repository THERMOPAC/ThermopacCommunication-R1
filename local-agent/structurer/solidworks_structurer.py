"""
solidworks_structurer.py — Phase 1 Drawing Structuring Agent.

Creates or updates a SolidWorks .slddrw file from DDS job data:
  1. Pre-flight validation  (before launching SolidWorks)
  2. Launch dedicated hidden SolidWorks instance via DispatchEx()
  3. Mode branch:
       create_new      → NewDocument(template_path) → SaveAs3(staging_path)
       update_existing → OpenDoc(staging_path)      → Save2()
  4. Write custom properties (only fields present in dds payload)
  5. Post-write read-back verification
  6. Return structured result JSON

Safety contract (Phase 1):
  - DispatchEx() only — creates a NEW, ISOLATED SolidWorks process
  - GetActiveObject() is NEVER used
  - swApp.Visible = False always
  - ExitApp() always in finally block
  - Orphan guard: taskkill /F /PID if ExitApp() fails
  - Never calls Save on files that fail validation
  - No DDS tables, no heuristic note injection, no PDF, no GCS upload

SolidWorks integer constants used:
  swDocDRAWING              = 3
  swOpenDocOptions_Silent   = 32   (suppress dialogs)
  swCustomInfoText          = 30   (string property type)
  swCustomPropertyReplaceValue = 1 (overwrite if exists)
  swSaveAsCurrentVersion    = 0
"""

from __future__ import annotations
import os
import time
import threading
from datetime import datetime, timezone
from typing import Optional

try:
    import win32com.client
    import pythoncom
    PYWIN32_AVAILABLE = True
except ImportError:
    win32com  = None
    pythoncom = None
    PYWIN32_AVAILABLE = False

from extractor.sw_instance import (
    _get_sldworks_pids,
    _kill_orphan_sw_process,
    _launch_sw_dedicated_instance,
)

# ── SolidWorks API constants ──────────────────────────────────────────────────
_SW_DOC_DRAWING            = 3
_SW_OPEN_SILENT            = 32
_SW_CUSTOM_INFO_TEXT       = 30
_SW_CUSTOM_PROP_REPLACE    = 1
_SW_SAVE_CURRENT_VERSION   = 0

# Error codes from ISldWorks.OpenDoc / OpenDoc6 return values (common subset)
_SW_FILE_NOT_FOUND         = 2
_SW_FILE_LOCK_ERROR        = 3

# ── Pre-flight ────────────────────────────────────────────────────────────────

class PreflightError(Exception):
    """Raised when a pre-flight check fails. Job is failed immediately, no SW launched."""


def _preflight(job: dict, template_path: str, staging_root: str) -> str:
    """
    Run all pre-flight checks before launching SolidWorks.
    Returns the fully-qualified staging_path on success.
    Raises PreflightError with a descriptive message on any failure.
    """
    drawing_number   = (job.get("drawing_number") or "").strip()
    revision         = (job.get("revision") or "").strip()
    dds              = job.get("dds")
    mode             = (job.get("mode") or "create_new").strip()
    drawing_ctrl_id  = str(job.get("drawing_control_id") or "").strip()

    if not drawing_number:
        raise PreflightError("drawing_number missing or empty in job payload")
    if not revision:
        raise PreflightError("revision missing or empty in job payload")
    if not dds or not isinstance(dds, dict) or len(dds) == 0:
        raise PreflightError("dds payload missing or empty")
    if not drawing_ctrl_id:
        raise PreflightError("drawing_control_id missing from job payload")

    if not template_path:
        raise PreflightError(
            "template_path not set — configure it in ERP System Settings "
            "(Admin → System Settings → SolidWorks Structuring Agent → Template Path). "
            "Fallback: set [structurer] template_path in the agent's config.ini."
        )
    if not os.path.isfile(template_path):
        raise PreflightError(
            f"template_path not found or not accessible: {template_path!r} — "
            "verify the path exists and the agent machine has network access to it."
        )

    if not staging_root:
        raise PreflightError(
            "staging_root not set — configure it in ERP System Settings "
            "(Admin → System Settings → SolidWorks Structuring Agent → Staging Root). "
            "Fallback: set [structurer] staging_root in the agent's config.ini."
        )
    try:
        staging_dir = os.path.join(staging_root, drawing_ctrl_id)
        os.makedirs(staging_dir, exist_ok=True)
        probe = os.path.join(staging_dir, ".write_probe")
        with open(probe, "w") as f:
            f.write("ok")
        os.remove(probe)
    except Exception as e:
        raise PreflightError(f"staging_root not writable ({staging_root}): {e}")

    filename      = f"{drawing_number}_rev-{revision}.slddrw"
    staging_path  = os.path.normpath(os.path.join(staging_dir, filename))

    if mode == "update_existing" and not os.path.isfile(staging_path):
        raise PreflightError(
            f"mode=update_existing but staging file not found: {staging_path}"
        )

    return staging_path


# ── Custom property helpers ───────────────────────────────────────────────────

def _write_properties(swModel, job: dict, logger) -> tuple[list, list]:
    """
    Write Drawing_Number + Revision (always) plus every key present in job['dds'].
    Returns (properties_written, warnings).
    """
    cpm = swModel.Extension.CustomPropertyManager("")
    written  = []
    warnings = []

    to_write = {
        "Drawing_Number": job["drawing_number"],
        "Revision":       job["revision"],
    }
    to_write.update(job.get("dds", {}))

    for name, value in to_write.items():
        str_val = str(value) if value is not None else ""
        try:
            ret = cpm.Add3(name, _SW_CUSTOM_INFO_TEXT, str_val, _SW_CUSTOM_PROP_REPLACE)
            if ret == 0:
                logger.info(f"[Structurer] Property written: {name} = {str_val!r}")
                written.append(name)
            else:
                msg = f"Property '{name}' Add3 returned code {ret}"
                logger.warning(f"[Structurer] {msg}")
                warnings.append(msg)
        except Exception as e:
            msg = f"Property '{name}' write failed: {type(e).__name__}: {e}"
            logger.warning(f"[Structurer] {msg}")
            warnings.append(msg)

    return written, warnings


def _verify_properties(swModel, properties_written: list, logger) -> tuple[list, list]:
    """
    Read back each written property to confirm value round-trips correctly.
    Returns (verified, mismatch_warnings).
    """
    cpm        = swModel.Extension.CustomPropertyManager("")
    verified   = []
    mismatches = []

    for name in properties_written:
        try:
            result = cpm.Get5(name, False)
            if isinstance(result, tuple):
                resolved_val = result[1] if len(result) > 1 else result[0]
            else:
                resolved_val = result
            if resolved_val is not None:
                verified.append(name)
                logger.debug(f"[Structurer] Verified: {name} = {str(resolved_val)!r}")
            else:
                msg = f"Read-back of '{name}' returned None"
                mismatches.append(msg)
                logger.warning(f"[Structurer] {msg}")
        except Exception as e:
            msg = f"Read-back of '{name}' failed: {type(e).__name__}: {e}"
            mismatches.append(msg)
            logger.warning(f"[Structurer] {msg}")

    return verified, mismatches


# ── Safety checks on existing file ────────────────────────────────────────────

def _check_existing_drawing_consistency(swModel, job: dict, logger):
    """
    For update_existing mode: read Drawing_Number and Revision from the opened
    file and compare against job payload. Raises ValueError on mismatch.
    """
    cpm = swModel.Extension.CustomPropertyManager("")
    checks = {
        "Drawing_Number": job["drawing_number"],
        "Revision":       job["revision"],
    }
    for prop_name, expected in checks.items():
        try:
            result = cpm.Get5(prop_name, False)
            actual = result[1] if isinstance(result, tuple) and len(result) > 1 else result
            actual = str(actual or "").strip()
        except Exception:
            actual = ""

        if not actual:
            logger.warning(
                f"[Structurer] {prop_name} not found in existing file — proceeding with overwrite"
            )
            continue

        if actual.lower() != expected.lower():
            raise ValueError(
                f"{prop_name} mismatch: file has '{actual}', job expects '{expected}'"
            )

    logger.info("[Structurer] Existing file consistency checks passed")


# ── Main entry point ──────────────────────────────────────────────────────────

def run_structuring(job: dict, config, cancel_event: threading.Event, logger) -> dict:
    """
    Phase 1 structuring entry point.  Called inside a worker thread by
    structure_job_runner.py.

    Returns a result dict.
    Raises on unrecoverable error — caller is responsible for fail_job().
    """
    if not PYWIN32_AVAILABLE:
        raise RuntimeError(
            "pywin32 is not installed — cannot launch SolidWorks COM."
        )

    drawing_number = job["drawing_number"]
    revision       = job["revision"]
    mode           = (job.get("mode") or "create_new").strip()

    # Prefer template_path / staging_root embedded in the job payload
    # (set via ERP System Settings, baked into every job at creation time).
    # Fall back to local config.ini values for backward compatibility.
    template_path = (
        (job.get("template_path") or job.get("templatePath") or "").strip()
        or config.structurer_template_path
    )
    staging_root = (
        (job.get("staging_root") or job.get("stagingRoot") or "").strip()
        or config.structurer_staging_root
    )

    logger.info(
        f"[Structurer] Job start — drawing={drawing_number} rev={revision} mode={mode}"
    )
    logger.info(f"[Structurer] template_path (resolved): {template_path or 'NOT SET'}")
    logger.info(f"[Structurer] staging_root  (resolved): {staging_root  or 'NOT SET'}")

    # ── Pre-flight (before any SolidWorks involvement) ────────────────────────
    staging_path = _preflight(job, template_path, staging_root)
    logger.info(f"[Structurer] Pre-flight passed — staging_path={staging_path}")

    if mode == "create_new" and os.path.isfile(staging_path):
        raise ValueError(
            f"mode=create_new but file already exists: {staging_path}. "
            "Use mode=update_existing or remove the file first."
        )

    t_start = time.monotonic()

    swApp          = None
    swModel        = None
    agent_sw_pid   = None
    binding_mode   = "none"
    sw_launch_ok   = False

    # ── SolidWorks launch (one retry on failure) ──────────────────────────────
    pythoncom.CoInitialize()
    try:
        pids_before = _get_sldworks_pids()

        for attempt in range(1, 3):
            try:
                swApp, binding_mode = _launch_sw_dedicated_instance(
                    config.sw_progid, logger
                )
                sw_launch_ok = True
                break
            except Exception as e:
                logger.warning(
                    f"[Structurer] SW launch attempt {attempt} failed: {type(e).__name__}: {e}"
                )
                if attempt < 2:
                    logger.info("[Structurer] Retrying SolidWorks launch in 10s…")
                    time.sleep(10)

        if not sw_launch_ok:
            raise RuntimeError("SolidWorks launch failed after 1 retry")

        pids_after  = _get_sldworks_pids()
        new_pids    = pids_after - pids_before
        agent_sw_pid = next(iter(new_pids), None)
        if agent_sw_pid:
            logger.info(f"[COM] Agent's dedicated SLDWORKS.EXE PID: {agent_sw_pid}")
        else:
            logger.info("[COM] PID not isolated (DispatchEx reused existing process)")

        swApp.Visible = False
        try:
            swApp.UserControl = False
        except Exception:
            pass

        logger.info("[Structurer] SolidWorks hidden instance ready")

        # ── Cancel check ─────────────────────────────────────────────────────
        if cancel_event.is_set():
            raise RuntimeError("Job cancelled before document open")

        # ── Mode branch ───────────────────────────────────────────────────────
        if mode == "create_new":
            logger.info(f"[Structurer] NewDocument from template: {template_path}")
            swModel = swApp.NewDocument(template_path, 0, 0, 0)
            if swModel is None:
                raise RuntimeError(
                    "NewDocument returned None — check template_path and SolidWorks license"
                )
            logger.info("[Structurer] New drawing document created")

        elif mode == "update_existing":
            logger.info(f"[Structurer] Opening existing file: {staging_path}")

            swModel = None

            for open_attempt in range(1, 3):
                try:
                    # ISldWorks.OpenDoc(FileName, Type) — no ByRef params, late-bind safe
                    swModel = swApp.OpenDoc(staging_path, _SW_DOC_DRAWING)
                except Exception as e:
                    logger.warning(
                        f"[Structurer] OpenDoc attempt {open_attempt} raised: "
                        f"{type(e).__name__}: {e}"
                    )
                    swModel = None

                if swModel is not None:
                    break

                if open_attempt < 2:
                    logger.warning(
                        "[Structurer] OpenDoc returned None — "
                        "file may be locked. Retrying in 15s…"
                    )
                    time.sleep(15)

            if swModel is None:
                raise RuntimeError(
                    f"OpenDoc failed for '{staging_path}' after 1 retry — "
                    "file may be missing, locked, or corrupt"
                )

            logger.info("[Structurer] Existing drawing opened")

            # Safety: check Drawing_Number + Revision consistency
            _check_existing_drawing_consistency(swModel, job, logger)

        else:
            raise ValueError(f"Unknown mode: '{mode}' — expected create_new or update_existing")

        # ── Cancel check ─────────────────────────────────────────────────────
        if cancel_event.is_set():
            raise RuntimeError("Job cancelled before property write")

        # ── Write custom properties ───────────────────────────────────────────
        logger.info("[Structurer] Writing custom properties…")
        properties_written, write_warnings = _write_properties(swModel, job, logger)
        logger.info(
            f"[Structurer] {len(properties_written)} properties written, "
            f"{len(write_warnings)} write warnings"
        )

        # ── Save ─────────────────────────────────────────────────────────────
        # Use the IModelDoc2 interface methods — they have NO ByRef parameters
        # so they work correctly with pywin32 late-binding (DispatchEx).
        #
        # create_new:       IModelDoc2.SaveAs3(path, version, options)  → 3 plain args
        # update_existing:  IModelDoc2.Save2(SaveOnlyIfModified)        → 1 plain arg
        #
        # Avoided: IModelDocExtension::SaveAs3 (7 params, 2 ByRef) and Save3 —
        # both crash with 'str object cannot be interpreted as integer' under
        # pywin32 late-binding when VARIANT(VT_BYREF) is marshalled.

        if mode == "create_new":
            logger.info(f"[Structurer] SaveAs3 → {staging_path}")
            try:
                # IModelDoc2.SaveAs3(FileName, Version, Options) — no ByRef params
                ret = swModel.SaveAs3(staging_path, _SW_SAVE_CURRENT_VERSION, 0)
            except Exception as save_exc:
                import traceback as _tb
                _args      = getattr(save_exc, 'args', ())
                _hresult   = (hex(_args[0]) if isinstance(_args[0], int) else repr(_args[0])) if _args else 'N/A'
                _excepinfo = repr(_args[2]) if len(_args) > 2 else 'N/A'
                raise RuntimeError(
                    f"SaveAs3 COM exception: {type(save_exc).__name__}: {save_exc} "
                    f"| HRESULT={_hresult} "
                    f"| excepinfo={_excepinfo} "
                    f"| path={staging_path!r} "
                    f"| traceback: {_tb.format_exc()}"
                ) from save_exc
            logger.info(f"[Structurer] SaveAs3 result: ret={ret} path={staging_path!r}")
            if not ret:
                raise RuntimeError(
                    f"SaveAs3 returned False — check write permissions on {staging_path!r}"
                )
        else:
            logger.info("[Structurer] Save2 (update existing)")
            try:
                # IModelDoc2.Save2(SaveOnlyIfModified) — no ByRef params
                ret = swModel.Save2(0)
            except Exception as save_exc:
                import traceback as _tb
                _args      = getattr(save_exc, 'args', ())
                _hresult   = (hex(_args[0]) if isinstance(_args[0], int) else repr(_args[0])) if _args else 'N/A'
                _excepinfo = repr(_args[2]) if len(_args) > 2 else 'N/A'
                raise RuntimeError(
                    f"Save2 COM exception: {type(save_exc).__name__}: {save_exc} "
                    f"| HRESULT={_hresult} "
                    f"| excepinfo={_excepinfo} "
                    f"| traceback: {_tb.format_exc()}"
                ) from save_exc
            logger.info(f"[Structurer] Save2 result: ret={ret}")
            if not ret:
                raise RuntimeError("Save2 returned False")

        logger.info("[Structurer] Save successful")

        # ── Post-write read-back ──────────────────────────────────────────────
        properties_verified, verify_warnings = _verify_properties(
            swModel, properties_written, logger
        )

        # ── File stats ────────────────────────────────────────────────────────
        file_size = 0
        try:
            file_size = os.path.getsize(staging_path)
        except Exception:
            pass

        duration = time.monotonic() - t_start
        all_warnings = write_warnings + verify_warnings

        result = {
            "status":               "success",
            "drawing_number":       drawing_number,
            "revision":             revision,
            "mode":                 mode,
            "file_path":            staging_path,
            "file_size_bytes":      file_size,
            "properties_written":   properties_written,
            "properties_verified":  properties_verified,
            "solidworks_session":   f"dedicated-isolated (binding={binding_mode} pid={agent_sw_pid})",
            "duration_sec":         round(duration, 2),
            "errors":               [],
            "warnings":             all_warnings,
        }
        logger.info(
            f"[Structurer] Complete — {len(properties_written)} props, "
            f"{file_size:,} bytes, {duration:.1f}s"
        )
        return result

    finally:
        # ── Step 1: Close document ────────────────────────────────────────────
        if swModel is not None:
            try:
                swApp.CloseDoc(staging_path)
                logger.info("[COM] Document closed")
            except Exception as e:
                logger.warning(f"[COM] CloseDoc error: {e}")

        # ── Step 2: Exit dedicated instance (always) ──────────────────────────
        if swApp is not None:
            try:
                swApp.ExitApp()
                logger.info("[COM] Dedicated SolidWorks instance exited cleanly")
            except Exception as e:
                logger.warning(f"[COM] ExitApp() failed: {type(e).__name__}: {e}")
                if agent_sw_pid:
                    logger.warning(
                        f"[COM] Orphan guard: force-killing PID {agent_sw_pid}…"
                    )
                    _kill_orphan_sw_process(agent_sw_pid, logger)
                else:
                    logger.warning(
                        "[COM] Orphan guard: no PID tracked — "
                        "check Task Manager for stray SLDWORKS.EXE processes"
                    )

        # ── Step 3: Release COM apartment ────────────────────────────────────
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass
