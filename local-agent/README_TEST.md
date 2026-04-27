# ThermopacAgent v1.0.0-test-core — Regression Validation Package

## Purpose

This is a **controlled validation build** — not for production use.

It is used to validate the `drawing_core` shared module before enabling the
Thermopac Drawing Control Agent (L2).  The package confirms that:

1. `drawing_core.get_custom_properties()` returns byte-identical results to
   the existing extractor `_read_cpm()` for any real `.slddrw` file.
2. The updated Structuring Agent (which now delegates write/clear operations
   to `drawing_core`) continues to function correctly.
3. SHA-256 file integrity infrastructure (`compute_sha256()`) is importable
   and functional.

---

## Thermopac Drawing Control Agent — Status

> **"Thermopac Drawing Control Agent is design-locked but NOT active in this build."**

The L2 Drawing Control Agent design is fully approved (Baseline v4 + File
Integrity Control).  Its execution logic has NOT been implemented.  Setting
`agent_role = combined` in `config.ini` will cause a safe, immediate exit with
a clear message.  No SolidWorks session is launched in that case.

---

## Contents

```
ThermopacAgent_v1.0.0-test-core\
  config.ini                         ← default: agent_role = structure
  README_TEST.md                     ← this file
  requirements.txt
  agent\                             ← shared agent framework
  extractor\                         ← Thermopac Extraction Agent (UNCHANGED)
  structurer\                        ← Thermopac Structuring Agent (updated — uses drawing_core)
  drawing_core\                      ← NEW shared module (Step 1 of Baseline v4)
    __init__.py
    schema.py                        ← ALL_PROPS (101 canonical property names)
    results.py                       ← PropertyReadResult, PropertyWriteResult, ...
    properties.py                    ← get/set/clear custom properties
    sw_document.py                   ← open_drawing / close_drawing
    save.py                          ← save_drawing + compute_sha256
    tests\
      test_extraction_parity.py      ← REGRESSION TEST (run this)
```

---

## Entry Points

| Agent | Entry Point | Command |
|---|---|---|
| Structuring Agent | `agent\main_structurer.py` | `python agent\main_structurer.py` |
| Extraction Agent  | `agent\main.py`            | `python agent\main.py`            |
| Regression Test   | `drawing_core\tests\test_extraction_parity.py` | see below |

---

## Running the Regression Test

**Requirements:**
- Windows machine with SolidWorks installed
- `pywin32` installed (`pip install pywin32`)
- A real `.slddrw` file with custom properties written by the Structuring Agent
  (use a drawing with SHELL + TUBE + JACKET + all header fields for maximum coverage)

**Command (run from the package root):**

```cmd
python drawing_core\tests\test_extraction_parity.py "C:\path\to\your_drawing.slddrw"
```

The test will:
1. Launch a hidden, isolated SolidWorks instance
2. Open the drawing read-only
3. Run `extractor._read_cpm()` (original, untouched)
4. Run `drawing_core.get_custom_properties()` (new implementation)
5. Compare values for all overlapping properties
6. Close the drawing and cleanly kill the SolidWorks process
7. Print PASS or FAIL with a full diff

---

## Expected Output Format

**PASS (proceed to Step 4 — extractor switchover):**

```
[Parity Test] Target file : C:\drawings\DWG-001-A.slddrw
[Parity Test] File size   : 1,234,567 bytes
[Parity Test] SolidWorks  : SldWorks.Application.27
[Parity Test] SW launched  : DispatchEx  PID=12345
[Parity Test] Drawing opened.
[Parity Test] _read_cpm returned 26 properties
[Parity Test] drawing_core returned 101 properties
[Parity Test]   present=26  missing=75  errors=0

============================================================
  RESULT: PASS
  26 properties compared — all identical.
  Safe to proceed to extractor switchover (Step 4).
============================================================
```

**FAIL (do NOT switch extractor — fix drawing_core/properties.py first):**

```
============================================================
  RESULT: FAIL  (N differences found)
  NOT safe to switch extractor — fix drawing_core/properties.py
============================================================

  Property : Drawing_Number
  Legacy   : 'DWG-001'
  Core     : ''
  Present  : False
```

---

## PASS / FAIL Criteria

| Criterion | Required for PASS |
|---|---|
| No property value mismatch | All values in `_read_cpm` scope match `drawing_core` exactly |
| No missing properties | All 26 `_TARGET_PROPERTIES` present in both results |
| No COM errors | `errors=0` in core result |
| Exit code | 0 |

---

## What Changes in This Build vs Production Agents

| Component | Change |
|---|---|
| `extractor/` | **UNCHANGED** — identical to v1.0.70 |
| `structurer/solidworks_structurer.py` | Write and clear loops now delegate to `drawing_core` |
| `drawing_core/` | **NEW** — 101-property schema, property read/write/clear, SHA-256 integrity |
| `agent/config.py` | Reads `agent_role` from config.ini; `combined` exits safely |

---

*Thermopac ERP | SolidWorks Drawing Agent System | Controlled Validation Build*
*Baseline v4 + File Integrity Control — do not distribute*
