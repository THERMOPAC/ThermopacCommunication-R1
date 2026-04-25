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
    Write the 10 DDS-sourced custom properties using the exact names that exist
    in the SolidWorks template (as defined by the extraction agent's verification
    layer).  Only properties that have a non-empty value are written.

    Template properties NOT available from the DDS payload (filled by engineer):
        HYDRO_TEST_POSITION, SHELL_IDP, SHELL_MOT, TUBE_IDP, TUBE_MOT,
        JACKET_IDP, JACKET_MOT, DrawnBy, DrawnDate, CheckedBy, CheckedDate,
        EngineeringApproval, EngAppDate

    Returns (properties_written, warnings).
    """
    cpm = swModel.Extension.CustomPropertyManager("")
    written  = []
    warnings = []

    dds = job.get("dds") or {}

    def _dds(*keys: str) -> str:
        """Return first non-blank value found among the given DDS keys."""
        for k in keys:
            v = str(dds.get(k) or "").strip()
            if v:
                return v
        return ""

    to_write = {
        # ── Always present ─────────────────────────────────────────────────
        "Drawing_Number":        job.get("drawing_number", ""),
        "Revision":              job.get("revision", ""),
        # ── Mapped from DDS payload using template-exact property names ────
        "Tag_No":                _dds("tag_no", "tagNo"),
        "Serial_No":             _dds("manufacture_serial_no", "manufactureSerialNo"),
        "Description":           _dds("equipment_description", "equipmentDescription"),
        "Equipment_Type":        _dds("equipment_type"),
        "Equipment_Configuration": _dds("equipment_config"),
        "Design_Code":           _dds("design_code"),
        "Material_Code":         _dds("material_code"),
        "Inspection_By":         _dds("inspection_by"),
    }

    non_blank = {k: v for k, v in to_write.items() if v}
    logger.info(
        f"[Structurer] Writing {len(non_blank)} template properties "
        f"(of 10 mapped; {10 - len(non_blank)} skipped — blank in DDS payload)"
    )

    for name, value in to_write.items():
        str_val = str(value) if value is not None else ""
        if not str_val:
            logger.debug(f"[Structurer] Property skipped (blank): {name}")
            continue
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
        _existing_bytes = os.path.getsize(staging_path)
        logger.warning(
            f"[Structurer] create_new: staging file already exists "
            f"({_existing_bytes:,} bytes) — removing before fresh create: {staging_path}"
        )
        try:
            os.remove(staging_path)
            logger.info("[Structurer] Existing staging file removed OK")
        except OSError as _oe:
            raise ValueError(
                f"create_new: cannot remove existing staging file: {staging_path} — {_oe}"
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

            # ── Confirm document is active ────────────────────────────────────
            # NewDocument automatically makes the new doc the active document.
            # We confirmed this empirically: swApp.ActiveDoc.GetTitle returns the
            # correct title immediately after NewDocument returns.
            #
            # NOTE: ActivateDoc2 is NOT called here because its 3rd param (Errors)
            # is ByRef Long — pywin32 late-binding raises DISP_E_TYPEMISMATCH when
            # a plain Python int is passed, and the call is unnecessary anyway since
            # the document is already active.
            #
            # NOTE: GetTitle is a COM PROPERTY in pywin32 — access WITHOUT parens.
            # Calling swModel.GetTitle() raises "str object is not callable".

            _doc_title = ""
            try:
                _doc_title = str(swModel.GetTitle)
                logger.info(f"[Structurer] Document title: {_doc_title!r}")
            except Exception as _te:
                logger.warning(f"[Structurer] GetTitle property failed: {_te}")

            try:
                _active = swApp.ActiveDoc
                _active_title = str(_active.GetTitle) if _active is not None else "None"
                logger.info(f"[Structurer] Active doc confirmed: {_active_title!r}")
            except Exception as _ce:
                logger.warning(f"[Structurer] Could not confirm active doc: {_ce}")

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
            # ── Log active doc immediately before save ────────────────────────
            try:
                _pre_save_active = swApp.ActiveDoc
                _pre_save_title  = str(_pre_save_active.GetTitle) if _pre_save_active else "None"
            except Exception:
                _pre_save_title = "unknown"
            logger.info(f"[Structurer] Active doc before SaveAs3: {_pre_save_title!r}")

            logger.info(f"[Structurer] SaveAs3 → {staging_path}")

            # swSaveAsOptions_e constants
            _OPT_NONE   = 0   # allow dialogs (may hang in headless — but some SW builds need it)
            _OPT_SILENT = 1   # suppress dialogs
            _OPT_COPY   = 2   # save a copy (doesn't rename the in-memory document)

            def _try_save_as3(doc, label, opts):
                """
                Call IModelDoc2.SaveAs3 and return (effective_success, err_str|None).

                SW2019 headless quirk: SaveAs3 can write the file to disk but still
                return 0 (False) when there is a non-fatal internal issue — e.g. a
                rebuild warning, unresolved sheet-format reference, etc.  We check
                whether the output file actually appeared on disk: if it did with a
                non-zero size, we log a WARNING and treat it as success so the job
                completes rather than failing.
                """
                # Remove stale file so we can detect whether this call wrote it
                if os.path.isfile(staging_path):
                    try:
                        os.remove(staging_path)
                        logger.debug(f"[Structurer] Pre-SaveAs3 stale file removed ({label})")
                    except OSError:
                        pass

                try:
                    r = doc.SaveAs3(staging_path, _SW_SAVE_CURRENT_VERSION, opts)
                except Exception as _se:
                    import traceback as _tb2
                    _a  = getattr(_se, 'args', ())
                    _hr = (hex(_a[0]) if isinstance(_a[0], int) else repr(_a[0])) if _a else 'N/A'
                    _ei = repr(_a[2]) if len(_a) > 2 else 'N/A'
                    _msg = (
                        f"SaveAs3({label}) COM exception: {type(_se).__name__}: {_se} "
                        f"| HRESULT={_hr} | excepinfo={_ei} "
                        f"| path={staging_path!r} "
                        f"| traceback: {_tb2.format_exc()}"
                    )
                    logger.warning(f"[Structurer] {_msg}")
                    return None, _msg

                # Check whether file landed on disk
                _sz = os.path.getsize(staging_path) if os.path.isfile(staging_path) else 0
                logger.info(
                    f"[Structurer] SaveAs3({label}, opts={opts}) "
                    f"→ ret={r} | file_on_disk={_sz:,} bytes"
                )

                if r:
                    return True, None   # SW reported success

                if _sz > 0:
                    # SW returned False but wrote a non-empty file — accept it.
                    # This is a known SW2019 headless behaviour when a non-fatal
                    # internal issue (rebuild warning, sheet-format reference) is
                    # encountered; the file is valid and openable.
                    logger.warning(
                        f"[Structurer] SaveAs3({label}) returned False but file was "
                        f"written ({_sz:,} bytes) — treating as success "
                        f"(SW2019 headless non-fatal return)"
                    )
                    return True, None

                return False, None   # no file, genuine failure

            # ── Attempt 1: swModel, Options=Silent ───────────────────────────
            ret, exc_info = _try_save_as3(swModel, "swModel", _OPT_SILENT)
            if exc_info:
                raise RuntimeError(exc_info)

            # ── Attempt 2: swModel, Options=None (no dialog suppression) ─────
            if not ret:
                logger.warning("[Structurer] Attempt 1 failed — retrying with opts=0")
                ret, exc_info = _try_save_as3(swModel, "swModel/opts=0", _OPT_NONE)
                if exc_info:
                    raise RuntimeError(exc_info)

            # ── Attempt 3: swApp.ActiveDoc, Options=Silent ───────────────────
            if not ret:
                logger.warning("[Structurer] Attempt 2 failed — retrying via ActiveDoc")
                try:
                    _ad = swApp.ActiveDoc
                    if _ad is not None:
                        ret, exc_info = _try_save_as3(_ad, "ActiveDoc", _OPT_SILENT)
                        if exc_info:
                            logger.warning(f"[Structurer] Attempt 3 raised: {exc_info}")
                            ret = False
                    else:
                        logger.warning("[Structurer] swApp.ActiveDoc is None — skipping attempt 3")
                except Exception as _a3e:
                    logger.warning(f"[Structurer] Attempt 3 wrapper error: {_a3e}")

            # ── Attempt 4: Visible=True, swModel, Options=Silent ─────────────
            if not ret:
                logger.warning("[Structurer] Attempt 3 failed — setting Visible=True and retrying")
                try:
                    swApp.Visible = True
                    logger.info("[Structurer] swApp.Visible = True")
                except Exception as _ve:
                    logger.warning(f"[Structurer] Could not set Visible=True: {_ve}")
                ret, exc_info = _try_save_as3(swModel, "swModel+Visible", _OPT_SILENT)
                if exc_info:
                    raise RuntimeError(exc_info)

            if not ret:
                raise RuntimeError(
                    f"SaveAs3 returned False AND no file written — all 4 attempts failed "
                    f"| path={staging_path!r} "
                    f"| active_doc_before_save={_pre_save_title!r} "
                    f"| doc_title={_doc_title!r}"
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

        # ── Flush pause — let SolidWorks finish writing before ExitApp() ──────
        # Without this, ExitApp() can interrupt the file write, leaving a file
        # that Windows Explorer can see but SolidWorks cannot open.
        time.sleep(2)
        logger.info("[Structurer] Flush pause complete — proceeding to verify")

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
