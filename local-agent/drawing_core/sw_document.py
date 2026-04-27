"""
drawing_core/sw_document.py — open_drawing() and close_drawing().

Safety contract (matches both L1 agents):
  - open_drawing() never uses GetActiveObject() — always works on the
    sw_app instance provided by the caller.
  - The caller is responsible for ExitApp() + orphan guard in their own
    finally block.  This module does not manage the SolidWorks process.
  - open_drawing(read_only=True)  → adds SW_OPEN_READ_ONLY flag (extraction)
  - open_drawing(read_only=False) → write-capable open (structuring / L2 control)
"""

from __future__ import annotations
import os

# ── SolidWorks OpenDoc constants (swOpenDocOptions_e) ────────────────────────
SW_DOC_DRAWING           = 3
SW_OPEN_SILENT           = 1     # swOpenDocOptions_Silent
SW_OPEN_READ_ONLY        = 2     # swOpenDocOptions_ReadOnly
SW_OPEN_RAPID_DRAFT      = 8     # swOpenDocOptions_RapidDraft / Detailing Mode
SW_OPEN_LOAD_LIGHTWEIGHT = 128   # swOpenDocOptions_LoadLightweight
SW_OPEN_OVERRIDE_DEFAULT = 64    # swOpenDocOptions_OverrideDefaultLoadLightweight


def open_drawing(
    sw_app,
    path: str,
    logger,
    *,
    read_only: bool = True,
    silent: bool = True,
    rapid_draft: bool = False,
) -> object:
    """
    Open a SolidWorks drawing document via OpenDoc7 → OpenDoc6 fallback.

    Parameters
    ----------
    sw_app      : active SolidWorks COM application object (DispatchEx result)
    path        : absolute path to the .slddrw file
    logger      : caller's logger instance
    read_only   : True  → add SW_OPEN_READ_ONLY flag (extraction — never saves)
                  False → write-capable open (structuring / L2 control)
    silent      : suppress SW dialogs (True in all automated contexts)
    rapid_draft : open in Detailing/RapidDraft mode (extraction only)

    Returns
    -------
    model object on success.
    Raises RuntimeError if both OpenDoc7 and OpenDoc6 fail.
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(f"[Core/Doc] Drawing file not found: {path}")

    options = 0
    if silent:
        options |= SW_OPEN_SILENT
    if read_only:
        options |= SW_OPEN_READ_ONLY
    if rapid_draft:
        options |= SW_OPEN_RAPID_DRAFT

    logger.info(
        f"[Core/Doc] open_drawing: {os.path.basename(path)} "
        f"read_only={read_only} silent={silent} rapid_draft={rapid_draft} "
        f"options={options}"
    )

    # ── Attempt 1: OpenDoc7 (preferred — ByRef error/warning codes) ───────────
    model = _try_open_doc7(sw_app, path, SW_DOC_DRAWING, options, logger)
    if model is not None:
        logger.info(f"[Core/Doc] Opened via OpenDoc7: {os.path.basename(path)}")
        return model

    # ── Attempt 2: OpenDoc6 (older API, no ByRef params in late-bind) ─────────
    model = _try_open_doc6(sw_app, path, SW_DOC_DRAWING, options, logger)
    if model is not None:
        logger.info(f"[Core/Doc] Opened via OpenDoc6 fallback: {os.path.basename(path)}")
        return model

    # ── Attempt 3: Simple OpenDoc (ISldWorks.OpenDoc) ─────────────────────────
    model = _try_open_doc_simple(sw_app, path, SW_DOC_DRAWING, logger)
    if model is not None:
        logger.info(f"[Core/Doc] Opened via OpenDoc (simple): {os.path.basename(path)}")
        return model

    raise RuntimeError(
        f"[Core/Doc] All open strategies failed for: {path}"
    )


def close_drawing(sw_app, path: str, logger) -> None:
    """
    Close the drawing at `path` in the given SolidWorks instance.

    Safe to call even if the document is not open — logs a warning and returns.
    Does NOT call ExitApp() — the caller manages the SolidWorks process lifetime.
    """
    logger.info(f"[Core/Doc] close_drawing: {os.path.basename(path)}")
    try:
        sw_app.CloseDoc(path)
        logger.info(f"[Core/Doc] CloseDoc OK: {os.path.basename(path)}")
    except Exception as e:
        logger.warning(
            f"[Core/Doc] CloseDoc raised (document may already be closed): "
            f"{type(e).__name__}: {e}"
        )


# ── Internal open helpers ─────────────────────────────────────────────────────

def _try_open_doc7(sw_app, path: str, doc_type: int, options: int, logger) -> object | None:
    """OpenDoc7(FileName, Type, Options, Configuration, Errors/out, Warnings/out)."""
    try:
        import pythoncom
        from win32com.client import VARIANT as _V
        _VI4_REF = pythoncom.VT_I4 | pythoncom.VT_BYREF
        v_err  = _V(_VI4_REF, 0)
        v_warn = _V(_VI4_REF, 0)
        model = sw_app.OpenDoc7(path, doc_type, options, "", v_err, v_warn)
        err_code  = v_err.value  if hasattr(v_err,  "value") else 0
        warn_code = v_warn.value if hasattr(v_warn, "value") else 0
        logger.info(
            f"[Core/Doc] OpenDoc7: model={'OK' if model else 'None'} "
            f"err={err_code} warn={warn_code}"
        )
        return model if model is not None else None
    except Exception as e:
        logger.info(f"[Core/Doc] OpenDoc7 raised: {type(e).__name__}: {e}")
        return None


def _try_open_doc6(sw_app, path: str, doc_type: int, options: int, logger) -> object | None:
    """OpenDoc6(FileName, Type, Options, Configuration, Errors, Warnings)."""
    try:
        model = sw_app.OpenDoc6(path, doc_type, options, "", 0, 0)
        logger.info(f"[Core/Doc] OpenDoc6: model={'OK' if model else 'None'}")
        return model if model is not None else None
    except Exception as e:
        logger.info(f"[Core/Doc] OpenDoc6 raised: {type(e).__name__}: {e}")
        return None


def _try_open_doc_simple(sw_app, path: str, doc_type: int, logger) -> object | None:
    """ISldWorks.OpenDoc(FileName, Type) — simplest API, no options."""
    try:
        model = sw_app.OpenDoc(path, doc_type)
        logger.info(f"[Core/Doc] OpenDoc(simple): model={'OK' if model else 'None'}")
        return model if model is not None else None
    except Exception as e:
        logger.info(f"[Core/Doc] OpenDoc(simple) raised: {type(e).__name__}: {e}")
        return None
