"""
property_registry.py — Single source of truth for SolidWorks custom property types.

TYPE_TEXT   → swCustomInfoText  (30): any field that can contain units, slashes,
              "N.A.", dashes, composite/range strings, or any non-numeric text.
TYPE_DOUBLE → swCustomInfoDouble (3): fields that are ALWAYS a pure decimal number
              with no units, no separators, no fallback text whatsoever.

Rules applied per field:
  TEXT   — if the value can EVER be a slash-range ("17 / 48"), carry units
           ("-29 Deg °C"), contain "N.A." / "—", or be a free-text string.
  DOUBLE — only when the value is guaranteed to be a plain integer or decimal
           number in every possible DDS payload (pressures, volumes, MOT).

Note on HTP / ICA / ECA:
  These values are always numeric, but the SolidWorks drawing template
  (A1 AGENT.drwdot) pre-defines them as Text type.  Writing them as
  swCustomInfoDouble causes Add3() to return code 1 (type conflict).
  Registry declares them TEXT so the agent never attempts a Double write.
  PTB controls for these fields must also be Editbox/Text, not Numberbox.
"""

from __future__ import annotations

# ── SW custom property type constants ─────────────────────────────────────────
TYPE_TEXT:   int = 30   # swCustomInfoText
TYPE_DOUBLE: int = 3    # swCustomInfoDouble

# ── Mechanical column suffix → type mapping ───────────────────────────────────
# 24 suffixes, same order as _MECH_PROP_SHORTS in solidworks_structurer.py
_MECH_SUFFIX_TYPES: dict[str, int] = {
    "IDP":      TYPE_DOUBLE,  # internal design pressure/MAWP — always pure numeric
    "EDP":      TYPE_DOUBLE,  # external design pressure/MAWP — always pure numeric
    "WP":       TYPE_DOUBLE,  # working pressure — always pure numeric
    "HTP":      TYPE_TEXT,    # hydro test pressure — numeric but template forces Text
    "MDMT":     TYPE_TEXT,    # e.g. "-29 Deg °C" — carries unit suffix
    "HT_TEMP":  TYPE_TEXT,    # e.g. "17 / 48" — min/max slash-range
    "OP_TEMP":  TYPE_TEXT,    # e.g. "100 / 120" or "150" — full range string
    "MOT":      TYPE_DOUBLE,  # extracted max operating temp — always pure numeric
    "DES_TEMP": TYPE_TEXT,    # e.g. "220 / 250" — can be slash-range
    "STATE":    TYPE_TEXT,    # "Mixture of Fluid and Vapor" — free text
    "VOL":      TYPE_DOUBLE,  # gross volume in liters — always pure numeric
    "FLUID":    TYPE_TEXT,    # "Hydrocarbon" — free text
    "HZ":       TYPE_TEXT,    # hazard level — text label
    "SG":       TYPE_TEXT,    # e.g. "0.85 / —" — slash + em-dash
    "ICA":      TYPE_TEXT,    # internal corrosion allowance — numeric but template forces Text
    "ECA":      TYPE_TEXT,    # external corrosion allowance — numeric but template forces Text
    "RT":       TYPE_TEXT,    # "FULL RADIOGRAPHY (100% RT)" — text
    "JE":       TYPE_TEXT,    # "0.85 / 0.85 / 0.85" — multiple slash values
    "TG":       TYPE_TEXT,    # "N.A." or text — free text
    "FTC":      TYPE_TEXT,    # "ASME Standard Tolerance" — text
    "PWHT":     TYPE_TEXT,    # "NOT REQUIRED" — text
    "HEAD":     TYPE_TEXT,    # "TORISPHERICAL (10%)" — text
    "INS":      TYPE_TEXT,    # "NO" / "YES" — text
    "INS_SPEC": TYPE_TEXT,    # "N.A." or specification string — text
}

# ── Column prefixes ───────────────────────────────────────────────────────────
_MECH_PREFIXES: tuple[str, ...] = ("SHELL", "TUBE", "JACKET")

# ── Phase 1 header fields ─────────────────────────────────────────────────────
_HEADER_FIELDS: tuple[str, ...] = (
    "Drawing_Number", "Revision", "Tag_No", "Serial_No", "Description",
    "Equipment_Type", "Equipment_Configuration", "Design_Code",
    "Material_Code", "Inspection_By",
    "DrawnBy", "DrawnDate", "CheckedBy", "CheckedDate",
    "EngineeringApproval", "EngAppDate",
)

# ── Phase 3 general data fields ───────────────────────────────────────────────
# All TEXT: values may carry units, be composite, or be "N.A."
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


# ── Build the registry ────────────────────────────────────────────────────────

def _build_registry() -> dict[str, int]:
    reg: dict[str, int] = {}

    for name in _HEADER_FIELDS:
        reg[name] = TYPE_TEXT

    for prefix in _MECH_PREFIXES:
        for suffix, typ in _MECH_SUFFIX_TYPES.items():
            reg[f"{prefix}_{suffix}"] = typ

    for name in _GENERAL_FIELDS:
        reg[name] = TYPE_TEXT

    return reg


PROPERTY_REGISTRY: dict[str, int] = _build_registry()


# ── Public helpers ────────────────────────────────────────────────────────────

def get_prop_type(name: str) -> int:
    """Return the registered SW type constant for *name*.

    Falls back to TYPE_TEXT for any property not in the registry so that
    unregistered/future properties are always safely written as text.
    """
    return PROPERTY_REGISTRY.get(name, TYPE_TEXT)


def type_label(prop_type: int) -> str:
    """Human-readable label for a type constant (for logging)."""
    return "Double" if prop_type == TYPE_DOUBLE else "Text"


def ptb_control_type(prop_type: int) -> str:
    """PTB XML control element Type attribute string."""
    return "Numberbox" if prop_type == TYPE_DOUBLE else "Editbox"


def ptb_property_type(prop_type: int) -> str:
    """PTB XML property element Type attribute string."""
    return "Number" if prop_type == TYPE_DOUBLE else "Text"


def registry_summary() -> str:
    """Return a compact registry summary for startup logging."""
    double_fields = [k for k, v in PROPERTY_REGISTRY.items() if v == TYPE_DOUBLE]
    text_fields   = [k for k, v in PROPERTY_REGISTRY.items() if v == TYPE_TEXT]
    return (
        f"Property registry: {len(PROPERTY_REGISTRY)} fields — "
        f"{len(double_fields)} Double, {len(text_fields)} Text. "
        f"Double fields: {', '.join(double_fields)}"
    )
