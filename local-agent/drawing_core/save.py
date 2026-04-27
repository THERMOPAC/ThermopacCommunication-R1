"""
drawing_core/save.py — save_drawing() and file integrity helpers.

save_drawing():
  - Creates parent folders automatically (records which ones were made).
  - Detects whether to call SaveAs3 (new path) or Save2 (same path).
  - Raises RuntimeError on failure.

compute_sha256():
  - Returns the SHA-256 hex digest of a file on disk.
  - Used for File Integrity Control (v4 baseline):
      checksum_before_extract  — computed after SAVEAS + SAVE/CLOSE
      checksum_after_extract   — computed before EXTRACT opens the file
      Mismatch → FAIL ("File modified after write or corrupted")
"""

from __future__ import annotations
import hashlib
import os

from drawing_core.results import SaveResult


# ── SolidWorks save constants ─────────────────────────────────────────────────
_SW_SAVE_CURRENT_VERSION = 0
_SW_SAVE_AS_OPTS_SILENT  = 1


def save_drawing(model, path: str, logger) -> SaveResult:
    """
    Save a SolidWorks drawing model to `path`.

    Behaviour:
      - If `path` is the same as the model's current path → Save2().
      - If `path` differs → SaveAs3(path, swSaveAsCurrentVersion, silent).
      - Parent directories are created automatically before the call.
      - The file is verified to exist on disk after the call.

    Returns SaveResult.  Raises RuntimeError on unrecoverable failure.

    Note: SW2019 headless quirk — Save2/SaveAs3 may return 0 (False) even
    when the file was successfully written to disk.  We check file size and
    modification time as ground truth, not the return value alone.
    """
    result = SaveResult(path=path)

    current_path = ""
    try:
        raw = getattr(model, "GetPathName", None)
        if raw is not None:
            current_path = (raw() if callable(raw) else raw) or ""
        current_path = os.path.normcase(os.path.normpath(str(current_path).strip()))
    except Exception:
        pass

    norm_target = os.path.normcase(os.path.normpath(path.strip()))
    same_path   = (current_path == norm_target) and bool(current_path)

    # ── Auto-create parent folders ────────────────────────────────────────────
    parent = os.path.dirname(path)
    if parent and not os.path.isdir(parent):
        dirs_before = set()
        check = parent
        while check and not os.path.isdir(check):
            dirs_before.add(check)
            check = os.path.dirname(check)
        os.makedirs(parent, exist_ok=True)
        for d in dirs_before:
            if os.path.isdir(d):
                result.folders_created.append(d)
                logger.info(f"[Core/Save] Created folder: {d}")

    if same_path:
        # ── Save2 ─────────────────────────────────────────────────────────────
        logger.info(f"[Core/Save] Save2() → {path}")
        mtime_before = _safe_mtime(path)
        try:
            ret = model.Save2(0)
        except Exception as e:
            raise RuntimeError(f"[Core/Save] Save2 COM exception: {e}") from e

        mtime_after = _safe_mtime(path)
        sz = _safe_size(path)
        logger.info(
            f"[Core/Save] Save2 → ret={ret} | mtime_changed={mtime_after > mtime_before} "
            f"| file={sz:,} bytes"
        )
        if ret or mtime_after > mtime_before or sz > 0:
            result.success = True
            return result
        raise RuntimeError(f"[Core/Save] Save2 returned False and file not confirmed on disk: {path}")

    else:
        # ── SaveAs3 ───────────────────────────────────────────────────────────
        logger.info(f"[Core/Save] SaveAs3 → {path}")
        if os.path.isfile(path):
            try:
                os.remove(path)
                logger.debug(f"[Core/Save] Pre-SaveAs3 stale file removed")
            except OSError:
                pass

        err_str = None
        for opts_label, opts in [("silent", _SW_SAVE_AS_OPTS_SILENT), ("none", 0)]:
            try:
                ret = model.SaveAs3(path, _SW_SAVE_CURRENT_VERSION, opts)
                sz  = _safe_size(path)
                logger.info(
                    f"[Core/Save] SaveAs3(opts={opts_label}) → ret={ret} | file={sz:,} bytes"
                )
                if ret or sz > 0:
                    result.success = True
                    return result
            except Exception as e:
                err_str = f"{type(e).__name__}: {e}"
                logger.warning(f"[Core/Save] SaveAs3(opts={opts_label}) raised: {err_str}")
                continue

        if _safe_size(path) > 0:
            logger.warning("[Core/Save] SaveAs3 raised but file exists on disk — treating as success")
            result.success = True
            return result

        raise RuntimeError(
            f"[Core/Save] SaveAs3 failed for {path!r}. Last error: {err_str}"
        )


def compute_sha256(path: str) -> str:
    """
    Return the SHA-256 hex digest of the file at `path`.

    Used for File Integrity Control (v4 baseline):
      After SAVEAS/SAVE/CLOSE  → checksum_before_extract
      Before EXTRACT opens     → checksum_after_extract
      Mismatch → FAIL ("File modified after write or corrupted")

    Raises FileNotFoundError if the file does not exist.
    Raises RuntimeError on I/O error.
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(f"[Core/Integrity] File not found for SHA-256: {path}")
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except OSError as e:
        raise RuntimeError(f"[Core/Integrity] SHA-256 read error for {path}: {e}") from e


# ── Internal helpers ──────────────────────────────────────────────────────────

def _safe_mtime(path: str) -> float:
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


def _safe_size(path: str) -> int:
    try:
        return os.path.getsize(path) if os.path.isfile(path) else 0
    except OSError:
        return 0
