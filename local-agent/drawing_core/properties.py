"""
drawing_core/properties.py — Custom property read/write/clear operations.

get_custom_properties():
  Clean, stable implementation of the VARIANT A/B/C read strategy.
  Presence-aware: distinguishes "present with ''" from "not found" (zero-trust).
  This is a COPY of the battle-tested logic in extractor/_read_cpm() — the
  extractor's own copy remains untouched until regression parity is confirmed.

set_custom_properties():
  Writes properties via Add3().  Reads before_value before each write and
  after_value after.  Logs every write with before → after.

clear_custom_properties():
  Clears via Delete() primary, Add3("") fallback.
  Distinguishes deleted (→ missing) from blanked (→ present "").
  Reads before_value for each property before clearing.

All functions return structured result objects from drawing_core.results.
"""

from __future__ import annotations

try:
    import win32com.client
    import pythoncom
    PYWIN32_AVAILABLE = True
except ImportError:
    PYWIN32_AVAILABLE = False

from drawing_core.results import PropertyReadResult, PropertyWriteResult, PropertyClearResult

# ── SolidWorks property write constants ───────────────────────────────────────
_SW_CUSTOM_INFO_TEXT    = 30   # swCustomInfoText
_SW_CUSTOM_PROP_REPLACE = 1    # swCustomPropertyReplaceValue


# ═════════════════════════════════════════════════════════════════════════════
#  READ
# ═════════════════════════════════════════════════════════════════════════════

def get_custom_properties(
    model,
    names: list[str] | None = None,
    logger=None,
) -> PropertyReadResult:
    """
    Read custom properties from a SolidWorks drawing model.

    Parameters
    ----------
    model   : SolidWorks model COM object (IModelDoc2)
    names   : property names to read.
              None → all properties the drawing contains (GetNames path).
              list → targeted read; names not found go into result.missing.
    logger  : optional logger; uses a no-op logger if None.

    Returns
    -------
    PropertyReadResult with presence-aware sets:
      present  — names physically found in the drawing
      missing  — names queried but not found
      properties — {name: value} only for present names
      sources    — {name: COM strategy} for diagnostics
      errors     — names where all strategies failed (COM error, not just missing)

    Zero-trust contract:
      present-with-""  ≠  missing
      Callers must check both value AND presence in verification logic.
    """
    log = logger if logger is not None else _NopLogger()
    result = PropertyReadResult()

    try:
        mgr = model.Extension.CustomPropertyManager("")
    except Exception as e:
        result.errors.append(f"CustomPropertyManager unavailable: {e}")
        log.warning(f"[Core/Props/Read] CustomPropertyManager unavailable: {e}")
        return result

    # ── Step 1: enumerate all present names via GetNames / GetAll3 ─────────────
    present_names: list[str] | None = _enumerate_names(mgr, log)

    if present_names is not None:
        log.info(
            f"[Core/Props/Read] GetNames returned {len(present_names)} properties"
        )
        # Read values for all enumerated names
        for name in present_names:
            value, source = _read_one_value(mgr, name, log)
            result.present.add(name)
            result.properties[name] = value
            result.sources[name] = source

        # For any explicitly requested names not in the enumeration → probe
        if names is not None:
            extra = [n for n in names if n not in result.present]
            if extra:
                log.info(
                    f"[Core/Props/Read] Probing {len(extra)} names not in GetNames result"
                )
                _probe_names(mgr, extra, result, log)

        # If names is provided, also mark names not found at all as missing
        if names is not None:
            for n in names:
                if n not in result.present and n not in result.missing:
                    result.missing.add(n)

    else:
        # GetNames failed — probe the requested names list (or ALL_PROPS)
        from drawing_core.schema import ALL_PROPS
        probe_list = names if names is not None else ALL_PROPS
        log.info(
            f"[Core/Props/Read] GetNames unavailable — probing {len(probe_list)} names"
        )
        _probe_names(mgr, probe_list, result, log)

        # Any probed name not resolved → missing
        if names is not None:
            for n in names:
                if n not in result.present and n not in result.missing:
                    result.missing.add(n)

    log.info(
        f"[Core/Props/Read] Complete: present={len(result.present)} "
        f"missing={len(result.missing)} errors={len(result.errors)}"
    )
    return result


def _enumerate_names(mgr, log) -> list[str] | None:
    """Try GetAll3 then GetNames to get all property names.  Returns None on failure."""
    # Strategy A: GetAll3 → returns parallel name/value arrays
    try:
        raw = mgr.GetAll3()
        if raw is not None and isinstance(raw, (list, tuple)) and len(raw) >= 1:
            names_arr = raw[0]
            if names_arr:
                names = [str(n) for n in names_arr if n]
                if names:
                    return names
    except Exception:
        pass

    # Strategy B: GetNames
    try:
        raw = mgr.GetNames()
        if raw:
            names = [str(n) for n in raw if n]
            if names:
                return names
    except Exception:
        pass

    # Strategy C: COM property access (some SW versions expose it as a property)
    try:
        raw = mgr.Names
        if raw:
            names = [str(n) for n in raw if n]
            if names:
                return names
    except Exception:
        pass

    return None


def _probe_names(mgr, names: list[str], result: PropertyReadResult, log) -> None:
    """
    Probe each name individually.  Updates result.present / result.missing in place.
    Uses HRESULT from InvokeTypes (Strategy B) as the canonical presence indicator.
    """
    for name in names:
        if name in result.present or name in result.missing:
            continue
        is_present, value, source = _probe_one(mgr, name, log)
        if is_present:
            result.present.add(name)
            result.properties[name] = value
            result.sources[name] = source
        else:
            result.missing.add(name)


def _probe_one(mgr, name: str, log) -> tuple[bool, str, str]:
    """
    Probe a single property name for presence and value.

    Returns (is_present: bool, value: str, source_label: str).

    Presence detection:
      Strategy A (VARIANT bypass): if the COM call completes without exception
        → property IS present (even if value is "").
      Strategy B (InvokeTypes): HRESULT = 0 → present; non-zero → not present.
      Strategy C (bare call): non-empty return value → assume present.
        Empty/None → cannot determine presence; treated as missing.

    This is the probe-path equivalent of _extract_one() in extractor/_read_cpm.
    """
    # ── Strategy A: VARIANT bypass (win32com VT_BYREF) ─────────────────────
    if PYWIN32_AVAILABLE:
        try:
            from win32com.client import VARIANT as _V
            _VT_BS_REF = pythoncom.VT_BSTR | pythoncom.VT_BYREF
            _VT_BL_REF = pythoncom.VT_BOOL | pythoncom.VT_BYREF
            for api_name, extra in [
                ("Get6", [_V(_VT_BL_REF, False), _V(_VT_BL_REF, False)]),
                ("Get5", [_V(_VT_BL_REF, False)]),
                ("Get4", []),
            ]:
                for uc in (True, False):
                    try:
                        v_val  = _V(_VT_BS_REF, "")
                        v_rval = _V(_VT_BS_REF, "")
                        getattr(mgr, api_name)(name, uc, v_val, v_rval, *extra)
                        # Reached without exception → property IS present
                        raw = (v_val.value  or "").strip()
                        res = (v_rval.value or "").strip()
                        val = res if (res and not res.startswith("$")) else (
                            raw if (raw and not raw.startswith("$")) else "")
                        return True, val, f"VARIANT.{api_name}(uc={uc})"
                    except Exception:
                        continue
        except ImportError:
            pass

    # ── Strategy B: InvokeTypes — HRESULT as presence indicator ──────────────
    if PYWIN32_AVAILABLE:
        FIN, FOUT = 1, 2
        VBS = pythoncom.VT_BSTR
        VBL = pythoncom.VT_BOOL
        VI4 = pythoncom.VT_I4
        specs = [
            ("Get6", (VI4, 0),
             ((VBS, FIN), (VBL, FIN), (VBS, FOUT), (VBS, FOUT), (VBL, FOUT), (VBL, FOUT)), 2),
            ("Get5", (VI4, 0),
             ((VBS, FIN), (VBL, FIN), (VBS, FOUT), (VBS, FOUT), (VBL, FOUT)), 2),
            ("Get4", (VI4, 0),
             ((VBS, FIN), (VBL, FIN), (VBS, FOUT), (VBS, FOUT)), 2),
        ]
        for api_name, ret_t, arg_t, rval_idx in specs:
            for uc in (True, False):
                try:
                    ids    = mgr._oleobj_.GetIDsOfNames(0, api_name)
                    dispid = ids[0] if isinstance(ids, (list, tuple)) else int(ids)
                    result = mgr._oleobj_.InvokeTypes(
                        dispid, 0, 1, ret_t, arg_t, name, uc
                    )
                    if isinstance(result, (list, tuple)):
                        hresult = result[0] if result else -1
                        if isinstance(hresult, int) and hresult == 0:
                            rv = str(result[rval_idx]).strip() if len(result) > rval_idx else ""
                            ev = str(result[1]).strip()        if len(result) > 1       else ""
                            val = rv if (rv and not rv.startswith("$")) else (
                                ev if (ev and not ev.startswith("$")) else "")
                            return True, val, f"InvokeTypes.{api_name}(uc={uc})"
                        # HRESULT ≠ 0 → not present (definitive)
                        return False, "", f"InvokeTypes.{api_name}:not_found(hr={hresult:#010x})"
                except Exception:
                    continue

    # ── Strategy C: bare call — non-empty value implies presence ─────────────
    for api in ("Get6", "Get5", "Get4", "Get2"):
        for uc in (True, False):
            try:
                ret = getattr(mgr, api)(name, uc)
                val = _pick_value(ret)
                if val:
                    return True, val, f"bare.{api}(uc={uc})"
            except Exception:
                continue

    # All strategies exhausted — treat as missing (conservative zero-trust)
    return False, "", "all_strategies_failed→missing"


def _read_one_value(mgr, name: str, log) -> tuple[str, str]:
    """
    Read value of a property that is KNOWN to be present (from GetNames).
    Returns (value, source_label).  Presence is not questioned here.
    """
    _, value, source = _probe_one(mgr, name, log)
    return value, source


def _pick_value(ret) -> str:
    """Extract best non-expression string from a COM return value."""
    if ret is None:
        return ""
    if isinstance(ret, str):
        v = ret.strip()
        return "" if v.startswith("$") else v
    if isinstance(ret, (list, tuple)) and ret:
        best = ""
        for idx in (1, 0):
            if len(ret) > idx:
                v = str(ret[idx]).strip()
                if v and not v.startswith("$"):
                    return v
                if v and not best:
                    best = v
        return best
    return ""


# ═════════════════════════════════════════════════════════════════════════════
#  WRITE
# ═════════════════════════════════════════════════════════════════════════════

def set_custom_properties(
    model,
    props: dict[str, str],
    logger=None,
) -> PropertyWriteResult:
    """
    Write custom properties to a SolidWorks model.

    Behaviour:
      - Reads before_value for each non-blank property before writing.
      - Skips properties with blank values silently.
      - Writes via ICustomPropertyManager.Add3().
      - Reads after_value for each written property.
      - Logs every write: "[Core/Props/Write] name: before → after"

    Returns PropertyWriteResult with written / skipped / warnings / before / after.
    """
    log = logger if logger is not None else _NopLogger()
    result = PropertyWriteResult()

    try:
        cpm = model.Extension.CustomPropertyManager("")
    except Exception as e:
        result.warnings.append(f"CustomPropertyManager unavailable: {e}")
        log.warning(f"[Core/Props/Write] CustomPropertyManager unavailable: {e}")
        return result

    for name, value in props.items():
        str_val = str(value).strip() if value is not None else ""
        if not str_val:
            result.skipped.append(name)
            continue

        # Read before_value
        before = _read_back(cpm, name, log)
        result.before[name] = before

        # Write
        try:
            ret = cpm.Add3(name, _SW_CUSTOM_INFO_TEXT, str_val, _SW_CUSTOM_PROP_REPLACE)
        except Exception as e:
            msg = f"{name}: Add3 raised {type(e).__name__}: {e}"
            result.warnings.append(msg)
            log.warning(f"[Core/Props/Write] {msg}")
            continue

        if ret == 0:
            after = _read_back(cpm, name, log)
            result.after[name] = after
            result.written.append(name)
            log.info(
                f"[Core/Props/Write] {name}: {before!r} → {after!r}"
            )
        else:
            msg = f"{name}: Add3 returned code {ret}"
            result.warnings.append(msg)
            log.warning(f"[Core/Props/Write] {msg}")

    log.info(
        f"[Core/Props/Write] Complete: written={len(result.written)} "
        f"skipped={len(result.skipped)} warnings={len(result.warnings)}"
    )
    return result


# ═════════════════════════════════════════════════════════════════════════════
#  CLEAR
# ═════════════════════════════════════════════════════════════════════════════

def clear_custom_properties(
    model,
    names: list[str],
    logger=None,
) -> PropertyClearResult:
    """
    Clear (remove or blank) custom properties from a SolidWorks model.

    Strategy:
      Primary  : ICustomPropertyManager.Delete(name)
                 → physically removes the property (→ missing on next read).
      Fallback : Add3(name, swCustomInfoText, "", swCustomPropertyReplaceValue)
                 → sets value to "" (property remains present with blank value).

    The distinction is tracked in PropertyClearResult.deleted vs .blanked:
      deleted → property will appear in missing on next PropertyReadResult
      blanked → property will appear in present with "" on next PropertyReadResult

    Both satisfy "DDS expected '' + present ''" → PASS in zero-trust verification.
    """
    log = logger if logger is not None else _NopLogger()
    result = PropertyClearResult()

    if not names:
        return result

    try:
        cpm = model.Extension.CustomPropertyManager("")
    except Exception as e:
        result.failed.extend(names)
        log.warning(f"[Core/Props/Clear] CustomPropertyManager unavailable: {e}")
        return result

    log.info(f"[Core/Props/Clear] Clearing {len(names)} properties")

    for name in names:
        # Read before_value
        before_is_present, before_val, _ = _probe_one(cpm, name, log)
        if before_is_present:
            result.before[name] = before_val

        # Primary: Delete()
        deleted = False
        try:
            cpm.Delete(name)
            deleted = True
        except Exception:
            pass

        if deleted:
            log.info(f"[Core/Props/Clear] {name}: {before_val!r} → DELETED (→ missing)")
            result.deleted.append(name)
            continue

        # Fallback: Add3("")
        try:
            cpm.Add3(name, _SW_CUSTOM_INFO_TEXT, "", _SW_CUSTOM_PROP_REPLACE)
            log.info(f"[Core/Props/Clear] {name}: {before_val!r} → '' (blanked, still present)")
            result.blanked.append(name)
        except Exception as e:
            log.warning(
                f"[Core/Props/Clear] {name}: both Delete and Add3('') failed: "
                f"{type(e).__name__}: {e}"
            )
            result.failed.append(name)

    log.info(
        f"[Core/Props/Clear] Complete: deleted={len(result.deleted)} "
        f"blanked={len(result.blanked)} failed={len(result.failed)}"
    )
    return result


# ── Read-back helper ──────────────────────────────────────────────────────────

def _read_back(cpm, name: str, log) -> str:
    """Read a single property value from cpm for before/after logging."""
    _, val, _ = _probe_one(cpm, name, log)
    return val


# ── No-op logger ──────────────────────────────────────────────────────────────

class _NopLogger:
    def info(self, *a, **k):    pass
    def warning(self, *a, **k): pass
    def debug(self, *a, **k):   pass
    def error(self, *a, **k):   pass
