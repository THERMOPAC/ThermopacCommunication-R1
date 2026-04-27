"""
drawing_core — Shared SolidWorks COM operations for Thermopac agents.

Public surface
──────────────
  from drawing_core.schema      import ALL_PROPS, HEADER_PROPS, SHELL_PROPS, ...
  from drawing_core.results     import PropertyReadResult, PropertyWriteResult, ...
  from drawing_core.properties  import get_custom_properties, set_custom_properties, ...
  from drawing_core.sw_document import open_drawing, close_drawing
  from drawing_core.save        import save_drawing, compute_sha256

Approved Baseline: v4 + File Integrity Control
Authority: Thermopac Drawing Control Agent — L2 Design
No deviation without formal revision and re-approval.

Agent roles:
  L1 Extraction Agent  → uses get_custom_properties() (READ only)
  L1 Structuring Agent → uses set_custom_properties(), clear_custom_properties(),
                         open_drawing(), close_drawing(), save_drawing()  (WRITE only)
  L2 Drawing Control Agent → uses all of the above + compute_sha256()  (WRITE+READ+VERIFY)
                              (execution NOT YET IMPLEMENTED — config placeholder only)
"""

from drawing_core.schema import (
    ALL_PROPS,
    ALL_PROPS_SET,
    HEADER_PROPS,
    SHELL_PROPS,
    TUBE_PROPS,
    JACKET_PROPS,
    GENERAL_PROPS,
)

from drawing_core.results import (
    PropertyReadResult,
    PropertyWriteResult,
    PropertyClearResult,
    SaveResult,
    PropertyVerificationEntry,
    ControlJobResult,
)

from drawing_core.properties import (
    get_custom_properties,
    set_custom_properties,
    clear_custom_properties,
)

from drawing_core.sw_document import (
    open_drawing,
    close_drawing,
)

from drawing_core.save import (
    save_drawing,
    compute_sha256,
)

__all__ = [
    "ALL_PROPS", "ALL_PROPS_SET",
    "HEADER_PROPS", "SHELL_PROPS", "TUBE_PROPS", "JACKET_PROPS", "GENERAL_PROPS",
    "PropertyReadResult", "PropertyWriteResult", "PropertyClearResult",
    "SaveResult", "PropertyVerificationEntry", "ControlJobResult",
    "get_custom_properties", "set_custom_properties", "clear_custom_properties",
    "open_drawing", "close_drawing",
    "save_drawing", "compute_sha256",
]
