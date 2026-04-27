"""
drawing_core/results.py — Structured result dataclasses for all core operations.

Zero-trust design:
  PropertyReadResult.present / .missing distinguish physical presence in the drawing
  from value content.  An empty string value ("") in present means the property
  exists with a blank value; a name in missing means it was not found at all.
  These are NOT equivalent and must not be treated as such in verification.
"""

from __future__ import annotations
from dataclasses import dataclass, field


# ── Read ──────────────────────────────────────────────────────────────────────

@dataclass
class PropertyReadResult:
    """
    Result of get_custom_properties().

    present  — property names physically found in the drawing.
               A property with value "" is still in present.
    missing  — property names queried but NOT found in the drawing.
               Callers MUST NOT treat missing as equivalent to present-with-"".

    properties — {name: value} ONLY for names in present.
    sources    — {name: COM strategy that succeeded} for diagnostics.
    errors     — names where ALL read strategies failed (not the same as missing).
    """
    properties: dict[str, str]       = field(default_factory=dict)
    present:    set[str]             = field(default_factory=set)
    missing:    set[str]             = field(default_factory=set)
    sources:    dict[str, str]       = field(default_factory=dict)
    errors:     list[str]            = field(default_factory=list)

    def is_present(self, name: str) -> bool:
        return name in self.present

    def value(self, name: str) -> str | None:
        """Return value if present, None if missing."""
        if name in self.present:
            return self.properties.get(name, "")
        return None


# ── Write ─────────────────────────────────────────────────────────────────────

@dataclass
class PropertyWriteResult:
    """
    Result of set_custom_properties().

    before  — {name: value} read BEFORE the write (only for names attempted).
    after   — {name: value} read BACK after the write (only for names written).
    written — names where Add3 succeeded.
    skipped — names skipped because value was blank.
    warnings — names where Add3 returned non-zero or raised.
    """
    written:   list[str]       = field(default_factory=list)
    skipped:   list[str]       = field(default_factory=list)
    warnings:  list[str]       = field(default_factory=list)
    before:    dict[str, str]  = field(default_factory=dict)
    after:     dict[str, str]  = field(default_factory=dict)


# ── Clear ─────────────────────────────────────────────────────────────────────

@dataclass
class PropertyClearResult:
    """
    Result of clear_custom_properties().

    deleted  — removed via Delete() → will appear in missing on next read.
    blanked  — set to "" via Add3 fallback → still present, value "".
               Verification: DDS expected "" + present "" → PASS (see v4 baseline).
    failed   — both Delete() and Add3("") failed.
    before   — {name: value} read before clear (only for names that were present).
    """
    deleted:  list[str]       = field(default_factory=list)
    blanked:  list[str]       = field(default_factory=list)
    failed:   list[str]       = field(default_factory=list)
    before:   dict[str, str]  = field(default_factory=dict)


# ── Save ─────────────────────────────────────────────────────────────────────

@dataclass
class SaveResult:
    """
    Result of save_drawing().
    """
    success:         bool        = False
    path:            str         = ""
    folders_created: list[str]   = field(default_factory=list)
    error:           str         = ""


# ── Verification (L2 — future) ────────────────────────────────────────────────

@dataclass
class PropertyVerificationEntry:
    """
    Per-property result in ControlJobResult.verification.

    Zero-trust rules (v4 baseline):
      expected "" + missing         → PASS
      expected "" + present ""      → PASS
      expected "" + present value   → FAIL
      expected value + missing      → FAIL
      expected value + mismatch     → FAIL
      expected value + match        → PASS
    """
    name:         str   = ""
    expected:     str   = ""
    actual:       str   = ""    # "" if missing
    present:      bool  = False
    status:       str   = ""    # "pass" | "fail"
    before_write: str   = ""    # value before inject step
    after_write:  str   = ""    # value confirmed after inject step


@dataclass
class ControlJobResult:
    """
    Full result returned by the Thermopac Drawing Control Agent (L2).
    Placeholder — L2 execution not yet implemented.
    """
    overall_status:       str                          = "pending"
    failed_step:          str                          = ""
    revision_written:     str                          = ""
    properties_written:   list[str]                    = field(default_factory=list)
    properties_cleared:   list[str]                    = field(default_factory=list)
    verification:         list[PropertyVerificationEntry] = field(default_factory=list)
    folders_created:      list[str]                    = field(default_factory=list)
    checksum_before_extract: str                       = ""
    checksum_after_extract:  str                       = ""
    error:                str                          = ""
