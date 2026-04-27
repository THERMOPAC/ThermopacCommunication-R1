"""
drawing_core/schema.py — Canonical SolidWorks custom property registry.

Single source of truth for ALL property names written by the Structuring Agent
and read by the Extraction Agent.  Both agents import from here.

Property count: 101
  HEADER_PROPS  : 17
  SHELL_PROPS   : 24
  TUBE_PROPS    : 24
  JACKET_PROPS  : 24
  GENERAL_PROPS : 12
  ─────────────────
  ALL_PROPS     : 101

Revision history:
  v4 baseline — initial definition (17 HEADER including Revision_Reason)
"""

from __future__ import annotations

# ── Mechanical suffix order (24 per column prefix) ────────────────────────────
# Mirrors _MECH_PROP_SHORTS in solidworks_structurer.py — must stay in sync.
_MECH_SUFFIXES: tuple[str, ...] = (
    "IDP", "EDP", "WP", "HTP", "MDMT",
    "HT_TEMP", "OP_TEMP", "MOT", "DES_TEMP",
    "STATE", "VOL", "FLUID", "HZ", "SG",
    "ICA", "ECA",
    "RT", "JE", "TG", "FTC", "PWHT",
    "HEAD", "INS", "INS_SPEC",
)


def _mech_props(prefix: str) -> list[str]:
    return [f"{prefix}_{s}" for s in _MECH_SUFFIXES]


# ── Header properties (17) ────────────────────────────────────────────────────
HEADER_PROPS: list[str] = [
    "Drawing_Number",
    "Revision",
    "Revision_Reason",
    "Tag_No",
    "Serial_No",
    "Description",
    "Equipment_Type",
    "Equipment_Configuration",
    "Design_Code",
    "Material_Code",
    "Inspection_By",
    "DrawnBy",
    "DrawnDate",
    "CheckedBy",
    "CheckedDate",
    "EngineeringApproval",
    "EngAppDate",
]

# ── Mechanical column properties (24 each) ────────────────────────────────────
SHELL_PROPS:  list[str] = _mech_props("SHELL")
TUBE_PROPS:   list[str] = _mech_props("TUBE")
JACKET_PROPS: list[str] = _mech_props("JACKET")

# ── General data properties (12) ─────────────────────────────────────────────
GENERAL_PROPS: list[str] = [
    "HYDRO_TEST_POSITION",
    "GENERAL_ORIENT",
    "GENERAL_SERVICE_LIFE",
    "GENERAL_WIND_CODE",
    "GENERAL_WIND_VEL",
    "GENERAL_SEISMIC_CODE",
    "GENERAL_SEISMIC_Z",
    "GENERAL_SEISMIC_H",
    "GENERAL_SEISMIC_V",
    "GENERAL_WEIGHT",
    "GENERAL_LOCATION",
    "GENERAL_QTY",
]

# ── Master list — 101 properties ──────────────────────────────────────────────
ALL_PROPS: list[str] = (
    HEADER_PROPS
    + SHELL_PROPS
    + TUBE_PROPS
    + JACKET_PROPS
    + GENERAL_PROPS
)

# Quick-lookup set for O(1) membership tests
ALL_PROPS_SET: frozenset[str] = frozenset(ALL_PROPS)

# ── Sanity assertion (caught at import time, not at runtime on the field) ─────
assert len(HEADER_PROPS)  == 17, f"HEADER_PROPS count: {len(HEADER_PROPS)}"
assert len(SHELL_PROPS)   == 24, f"SHELL_PROPS count: {len(SHELL_PROPS)}"
assert len(TUBE_PROPS)    == 24, f"TUBE_PROPS count: {len(TUBE_PROPS)}"
assert len(JACKET_PROPS)  == 24, f"JACKET_PROPS count: {len(JACKET_PROPS)}"
assert len(GENERAL_PROPS) == 12, f"GENERAL_PROPS count: {len(GENERAL_PROPS)}"
assert len(ALL_PROPS)     == 101, f"ALL_PROPS count: {len(ALL_PROPS)}"
assert len(set(ALL_PROPS)) == len(ALL_PROPS), "Duplicate property names in ALL_PROPS"
