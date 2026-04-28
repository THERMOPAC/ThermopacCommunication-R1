"""
property_registry.py — Single source of truth for SolidWorks custom property types.

All fields are TYPE_TEXT (swCustomInfoText = 30).

Rationale:
  - SolidWorks title-block annotations display Text and Double values identically.
  - Editbox PTB controls always show the stored value correctly.
  - Numberbox PTB controls show 0 when the stored type is Text — unreliable.
  - The drawing template (A1 AGENT.drwdot) pre-defines several fields as Text,
    causing Add3(Double) to return code 1 (type conflict) for those fields.
  - Using a single type for all fields eliminates all type-conflict issues,
    simplifies the PTB definition (all Editbox), and is zero-risk for display.
"""

from __future__ import annotations

# ── SW custom property type constants ─────────────────────────────────────────
TYPE_TEXT:   int = 30   # swCustomInfoText  — all fields use this
TYPE_DOUBLE: int = 3    # swCustomInfoDouble — retained for reference, not used

# ── Column prefixes ───────────────────────────────────────────────────────────
_MECH_PREFIXES: tuple[str, ...] = ("SHELL", "TUBE", "JACKET")

# ── Mechanical column suffixes ────────────────────────────────────────────────
_MECH_SUFFIXES: tuple[str, ...] = (
    "IDP", "EDP", "WP", "HTP", "MDMT",
    "HT_TEMP", "OP_TEMP", "MOT", "DES_TEMP",
    "STATE", "VOL", "FLUID", "HZ", "SG",
    "ICA", "ECA",
    "RT", "JE", "TG", "FTC", "PWHT",
    "HEAD", "INS", "INS_SPEC",
)

# ── Phase 1 header fields ─────────────────────────────────────────────────────
_HEADER_FIELDS: tuple[str, ...] = (
    "Drawing_Number", "Revision", "Tag_No", "Serial_No", "Description",
    "Equipment_Type", "Equipment_Configuration", "Design_Code",
    "Material_Code", "Inspection_By",
    "DrawnBy", "DrawnDate", "CheckedBy", "CheckedDate",
    "EngineeringApproval", "EngAppDate",
)

# ── Phase 3 general data fields ───────────────────────────────────────────────
_GENERAL_FIELDS: tuple[str, ...] = (
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
)


# ── Build the registry — every field is TYPE_TEXT ─────────────────────────────

def _build_registry() -> dict[str, int]:
    reg: dict[str, int] = {}

    for name in _HEADER_FIELDS:
        reg[name] = TYPE_TEXT

    for prefix in _MECH_PREFIXES:
        for suffix in _MECH_SUFFIXES:
            reg[f"{prefix}_{suffix}"] = TYPE_TEXT

    for name in _GENERAL_FIELDS:
        reg[name] = TYPE_TEXT

    return reg


PROPERTY_REGISTRY: dict[str, int] = _build_registry()


# ── Public helpers ────────────────────────────────────────────────────────────

def get_prop_type(name: str) -> int:
    """Return the registered SW type constant for *name*.
    Always TYPE_TEXT; falls back to TYPE_TEXT for unregistered properties.
    """
    return PROPERTY_REGISTRY.get(name, TYPE_TEXT)


def type_label(prop_type: int) -> str:
    """Human-readable label for a type constant (for logging)."""
    return "Double" if prop_type == TYPE_DOUBLE else "Text"


def ptb_control_type(prop_type: int) -> str:
    """PTB XML control element Type attribute — always Editbox."""
    return "Editbox"


def ptb_property_type(prop_type: int) -> str:
    """PTB XML property element Type attribute — always Text."""
    return "Text"


def registry_summary() -> str:
    """Return a compact registry summary for startup logging."""
    return (
        f"Property registry: {len(PROPERTY_REGISTRY)} fields — "
        f"all Text (swCustomInfoText=30)"
    )
