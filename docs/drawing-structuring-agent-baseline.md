# Drawing Structuring Agent — Audit Baseline

**Version tag:** `v1.0.70-structurer-phase1`
**Date:** 2025-04-23
**Status:** Phase 1 approved and implemented

---

## 1. Agent Identity

| Field | Value |
|---|---|
| Name | Thermopac Drawing Structuring Agent |
| Type | WRITE agent (creates / updates .slddrw files) |
| Counterpart | Thermopac Extraction Agent (READ ONLY — separate binary) |
| Entry point | `local-agent/agent/main_structurer.py` |
| Phase | Phase 1 |

---

## 2. Phase 1 Approved Scope

### Allowed
- Create a new SolidWorks drawing from a template (`.drwdot`)
- Insert custom properties (Layer 1 fields) via `CustomPropertyManager`
- Save `.slddrw` to staging path
- Title block population via `$PRP:` / `$PRPSHEET:` linking only (template-side)

### Explicitly excluded from Phase 1

| Item | Phase |
|---|---|
| DDS tables (`InsertTableAnnotation2`) | Phase 3 |
| Heuristic title block note injection (`INote.SetText`) | Phase 2 |
| DVS verification | Out of scope — separate agent |
| Approval block insertion | Out of scope — separate agent |
| PDF generation | Out of scope |
| GCS upload (final release path) | Out of scope |

---

## 3. Job JSON Structure

```json
{
  "job_id": "uuid-v4",
  "job_type": "drawing_structure",
  "drawing_control_id": "DC-2024-0042",
  "drawing_number": "T-PRJ-001-GA-001",
  "revision": "A",
  "mode": "create_new",

  "dds": {
    "Tag_No":         "HX-101",
    "Serial_No":      "SN-2024-0042",
    "Description":    "Regenerative Column Skid",
    "Equipment_Type": "Shell & Tube Heat Exchanger",
    "Customer":       "TotalEnergies",
    "Project_Seq":    "PRJ-001",
    "FY":             "FY2024",
    "Country":        "Nigeria",
    "Data_Sheet_Rev": "B"
  }
}
```

**Rules:**
- `drawing_number` and `revision` are always required at top level
- `dds` contains only properties to be written — agent writes nothing outside this dict (plus `Drawing_Number` and `Revision` which are always written)
- `template_path` and `staging_root` come exclusively from `config.ini [structurer]` — never from the job payload

---

## 4. Staging Path Rule

```
{staging_root}/{drawingControlId}/{DrawingNumber}_rev-{Revision}.slddrw
```

Example:
```
C:\ThermopacStaging\drawings\DC-2024-0042\T-PRJ-001-GA-001_rev-A.slddrw
```

- `staging_root` → `[structurer] staging_root` in `config.ini`
- Subdirectory created automatically if missing
- File must NOT already exist when `mode=create_new`

---

## 5. Pre-flight Validation (before SolidWorks launches)

All checks run before any SolidWorks COM call. First failure immediately fails the job.

| Check | Fail message |
|---|---|
| `drawing_number` present | `drawing_number missing or empty in job payload` |
| `revision` present | `revision missing or empty in job payload` |
| `dds` present and non-empty | `dds payload missing or empty` |
| `drawing_control_id` present | `drawing_control_id missing from job payload` |
| `template_path` configured | `template_path not configured — set [structurer] template_path in config.ini` |
| `template_path` file exists | `template_path not found or not readable: {path}` |
| `staging_root` writable | `staging_root not writable ({path}): {error}` |
| `create_new` + file already exists | `mode=create_new but file already exists: {path}` |
| `update_existing` + file missing | `mode=update_existing but staging file not found: {path}` |

---

## 6. SolidWorks Safety Contract

| Requirement | Implementation |
|---|---|
| Dedicated instance only | `DispatchEx()` — three-tier fallback, no `GetActiveObject()` |
| Hidden instance | `swApp.Visible = False`, `swApp.UserControl = False` |
| Always ExitApp | `finally` block — unconditional |
| Orphan kill | `taskkill /F /PID {agent_sw_pid}` if `ExitApp()` raises |
| No engineer session interference | `GetActiveObject()` does not exist in any code path |

---

## 7. Property Write Control

Only fields present in `job.dds` are written. Plus two fixed fields always written:

| Property | Source |
|---|---|
| `Drawing_Number` | `job.drawing_number` (always) |
| `Revision` | `job.revision` (always) |
| Any key in `job.dds` | `job.dds[key]` (only if present) |

API: `CustomPropertyManager("").Add3(name, swCustomInfoText, value, swCustomPropertyReplaceValue)`

Unrelated existing properties on the document are never touched.

---

## 8. Idempotency & Safety

| Scenario | Behavior |
|---|---|
| `create_new` + file already exists | FAIL (pre-flight) |
| `update_existing` + file missing | FAIL (pre-flight) |
| `Drawing_Number` mismatch on open | FAIL (post-open consistency check) |
| `Revision` mismatch on open | FAIL (post-open consistency check) |

---

## 9. Retry Logic

| Failure type | Retry |
|---|---|
| SolidWorks launch failure | 1 retry after 10s |
| File lock (`OpenDoc7` returns None) | 1 retry after 15s |
| Pre-flight failures | No retry — fail immediately |
| Save failure | No retry — fail immediately |
| Property write failure | No retry — log warning, continue with remaining properties |

---

## 10. File Map

| File | Role |
|---|---|
| `local-agent/structurer/solidworks_structurer.py` | Phase 1 SolidWorks WRITE logic |
| `local-agent/structurer/__init__.py` | Package marker |
| `local-agent/agent/structure_job_runner.py` | Job orchestrator |
| `local-agent/agent/structure_job_client.py` | HTTP client (`/api/epc-structure-jobs/*`) |
| `local-agent/agent/main_structurer.py` | Entry point / poll loop |
| `local-agent/extractor/sw_instance.py` | Shared COM helpers (used by both agents) |
| `local-agent/agent/config.py` | `[structurer]` section added |

---

## 11. Config.ini Requirements

```ini
[structurer]
template_path = \\server\templates\Standard_A1.drwdot
staging_root  = C:\ThermopacStaging\drawings
```

Both fields are mandatory for structuring jobs to succeed.
`template_path` left blank → pre-flight fails → no SolidWorks launched.

---

## 12. Job Result Payload

### Success
```json
{
  "status": "success",
  "drawing_number": "T-PRJ-001-GA-001",
  "revision": "A",
  "mode": "create_new",
  "file_path": "C:\\ThermopacStaging\\drawings\\DC-2024-0042\\T-PRJ-001-GA-001_rev-A.slddrw",
  "file_size_bytes": 302080,
  "properties_written": ["Drawing_Number", "Revision", "Tag_No", "Serial_No"],
  "properties_verified": ["Drawing_Number", "Revision", "Tag_No", "Serial_No"],
  "solidworks_session": "dedicated-isolated (binding=dedicated-DispatchEx pid=14872)",
  "duration_sec": 11.4,
  "errors": [],
  "warnings": []
}
```

### Failure
```json
{
  "status": "failed",
  "drawing_number": "T-PRJ-001-GA-001",
  "revision": "A",
  "mode": "create_new",
  "file_path": null,
  "properties_written": [],
  "properties_verified": [],
  "duration_sec": 0.3,
  "errors": ["template_path not found or not readable: \\\\server\\templates\\Standard_A1.drwdot"],
  "warnings": []
}
```

---

## 13. Zero-Trust Verification Points

The following 5 points are the audit checkpoints for future Zero-Trust review:

### V1 — Staging path uses correct filename format
**File:** `local-agent/structurer/solidworks_structurer.py`
```python
filename     = f"{drawing_number}_rev-{revision}.slddrw"
staging_path = os.path.normpath(os.path.join(staging_dir, filename))
```

### V2 — Template path comes ONLY from config
**File:** `local-agent/structurer/solidworks_structurer.py`
```python
template_path = config.structurer_template_path
```
**File:** `local-agent/agent/config.py`
```python
self.structurer_template_path = cfg.get("structurer", "template_path", fallback="").strip()
```

### V3 — Properties written ONLY from DDS payload
**File:** `local-agent/structurer/solidworks_structurer.py`
```python
to_write = {
    "Drawing_Number": job["drawing_number"],
    "Revision":       job["revision"],
}
to_write.update(job.get("dds", {}))
```

### V4 — SolidWorks launches ONLY after pre-flight passes
**File:** `local-agent/structurer/solidworks_structurer.py`
```python
# Pre-flight runs first — raises PreflightError on any failure
staging_path = _preflight(job, template_path, staging_root)

# ...only if we reach here does SW launch:
swApp, binding_mode = _launch_sw_dedicated_instance(config.sw_progid, logger)
```

### V5 — ExitApp() always executes (even on failure)
**File:** `local-agent/structurer/solidworks_structurer.py`
```python
finally:
    if swModel is not None:
        swApp.CloseDoc(staging_path)   # Step 1
    if swApp is not None:
        swApp.ExitApp()                # Step 2 — always, no conditional
        # → on failure: _kill_orphan_sw_process(agent_sw_pid, logger)
    pythoncom.CoUninitialize()         # Step 3
```
