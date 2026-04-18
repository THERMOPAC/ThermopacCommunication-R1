# THERMOPAC — SolidWorks Extraction Agent
## Baseline Design Document v3
**Status: APPROVED**
**Date: 2026-04-18**
**Supersedes: v1 (plan), v2 (plan)**

All implementation must strictly follow this baseline.
Any deviation requires explicit revision and re-approval before code is written.

---

## Goal

Upload → Extract → Rule Engine → Agent → Approval → Release

---

## Architecture Rule

- Cloud app = workflow orchestration only
- Local Windows PC with SolidWorks installed = extraction execution
- Local agent = execution bridge between cloud and SolidWorks

---

## 1. Windows App Type

Python 3.11 application compiled to standalone Windows EXE via PyInstaller.
Foreground console application (v1). No hidden Windows Service.

---

## 2. Package / Install Approach

Installer: Inno Setup → `ThermopacAgent-Setup-v1.0.exe`

Installer creates:
- Application folder: `C:\Program Files\ThermopacAgent\`
- Temp folder: `C:\ThermopacAgent\temp\`
- Logs folder: `C:\ThermopacAgent\logs\`
- Default `config.ini`
- Start Menu + Desktop shortcuts
- Optional Task Scheduler auto-start entry

Prerequisites (not bundled): SolidWorks 20XX installed, Windows 10/11 x64.

---

## 3. Project Structure

```
ThermopacAgent/
├── agent/
│   ├── main.py              # Entry point — poll loop + signal handling
│   ├── config.py            # Load + validate config.ini, resolve SW ProgID
│   ├── logger.py            # Rotating file logger + console output
│   ├── job_client.py        # HTTP client (all 4 agent API calls)
│   └── job_runner.py        # Job orchestration with job-level timeout
│
├── extractor/
│   ├── solidworks_extractor.py   # Opens dedicated SW instance, dispatches modules
│   ├── extract_properties.py
│   ├── extract_sheets.py
│   ├── extract_views.py
│   ├── extract_dimensions.py
│   ├── extract_annotations.py
│   ├── extract_tables.py
│   ├── extract_references.py
│   ├── extract_health.py
│   ├── extract_nozzles.py
│   └── extract_design_data.py    # MANDATORY — hard failure if table absent
│
├── config.ini
├── ThermopacAgent.exe            # PyInstaller output
├── INSTALL.md
├── build.bat                     # PyInstaller build script
├── requirements.txt
└── installer/
    └── setup.iss                 # Inno Setup script
```

---

## 4. SolidWorks API Integration Design

**Rule: Always launch a dedicated, invisible SolidWorks instance. Never attach to running user session.**

Connection strategy:
1. Read `solidworks_version` from config.ini → resolve ProgID
2. `win32com.client.DispatchEx(progid)` — always creates new independent process
3. `swApp.Visible = False`
4. `swApp.UserControlBackground(True)` — suppress all dialogs
5. `OpenDoc6(temp_path, swDocDRAWING, swOpenDocOptions_ReadOnly | swOpenDocOptions_Silent)`
6. Run all 10 extraction modules sequentially
7. `CloseDoc(temp_path)` — NEVER Save or SaveAs
8. `swApp.ExitApp()` — always, in finally block

### SolidWorks version → ProgID map

| SW Version | ProgID |
|---|---|
| 2019 | `SldWorks.Application.27` |
| 2020 | `SldWorks.Application.28` |
| 2021 | `SldWorks.Application.29` |
| 2022 | `SldWorks.Application.30` |
| 2023 | `SldWorks.Application.31` |
| 2024 | `SldWorks.Application.32` |

`solidworks_version = 2019` resolves automatically.
`solidworks_progid` key overrides map for non-standard installs.

---

## 5. Extraction Result JSON Schema

```json
{
  "schema_version": "1.0",
  "agent": {
    "node_id": "PC-DESIGN-01",
    "agent_version": "1.0.0",
    "machine_name": "DESKTOP-ABCDEF",
    "extraction_timestamp": "2026-04-18T07:30:00Z"
  },
  "file": {
    "original_filename": "C10308-CPS-ACS-S6T-20-P28.slddrw",
    "file_size_bytes": 2048000,
    "sha256": "abc123..."
  },
  "properties": {
    "drawing_number": "C10308-CPS-ACS-S6T-20-P28",
    "revision": "B",
    "title": "Continuous Polishing System",
    "description": "",
    "author": "",
    "created_date": "2025-01-10",
    "last_saved_date": "2026-03-15",
    "solidworks_version": "2024 SP3",
    "custom_properties": {}
  },
  "sheets": [{ "sheet_name": "Sheet1", "scale": "1:10", "paper_size": "A1", "view_count": 6 }],
  "views": [{ "sheet": "Sheet1", "view_name": "Front View", "view_type": "base", "scale": "1:10", "model_reference": "assembly.sldasm" }],
  "dimensions": { "total_count": 148, "driven_count": 12, "tolerance_count": 34, "sample": [] },
  "annotations": { "notes_count": 23, "weld_symbols_count": 8, "surface_finish_count": 4, "gd_t_count": 6, "notes_sample": [] },
  "tables": { "bom_found": true, "bom_rows": 34, "revision_table_found": true, "revision_rows": [], "general_tolerance_table_found": false },
  "references": { "referenced_models": [], "external_references_broken": 0, "total_references": 12 },
  "health": { "open_errors": [], "open_warnings": [], "rebuild_errors": 0, "rebuild_warnings": 2, "dangling_dimensions": 0, "dangling_relations": 0 },
  "nozzles": { "found": true, "nozzle_count": 8, "nozzles": [{ "tag": "N1", "size": "4\"", "rating": "150#", "service": "Inlet", "facing": "RF" }] },
  "design_data_table": {
    "found": true,
    "rows": [
      { "parameter": "Design Pressure",     "value": "10.5", "unit": "barg" },
      { "parameter": "Design Temperature",  "value": "180",  "unit": "°C" },
      { "parameter": "Corrosion Allowance", "value": "3",    "unit": "mm" },
      { "parameter": "Material",            "value": "SA-516 Gr.70", "unit": "" },
      { "parameter": "Hazard Level",        "value": "Category 1",   "unit": "" },
      { "parameter": "PWHT",                "value": "Yes",  "unit": "" },
      { "parameter": "Radiography",         "value": "10%",  "unit": "" },
      { "parameter": "Joint Efficiency",    "value": "0.85", "unit": "" },
      { "parameter": "Insulation",          "value": "50",   "unit": "mm" },
      { "parameter": "Hydro Test Pressure", "value": "15.75","unit": "barg" }
    ]
  },
  "extraction_errors": {
    "properties": null,
    "sheets": null,
    "views": null,
    "dimensions": null,
    "annotations": null,
    "tables": null,
    "references": null,
    "health": null,
    "nozzles": "Table not found",
    "design_data_table": null
  }
}
```

**`design_data_table.found` must be `true` and `rows` must be non-empty.**
If absent → agent calls `POST /fail` before uploading. Job does not reach `completed` without it.

---

## 6. Cloud API Contract

### Authentication — Per-node token + node_id validation

Each agent node is registered in `epc_agent_nodes` table.
All agent requests carry:
```
x-node-id:    PC-DESIGN-01
x-node-token: <node-specific token>
```

Server validates:
1. `x-node-id` exists in `epc_agent_nodes`
2. `x-node-token` matches bcrypt hash stored in that row
3. Node `active = true`

Failure → 401. No shared key. Every PC has its own revocable credential.

### Endpoints

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `GET` | `/api/epc-slddrw-jobs/pending` | — | `{ jobs: [{ id, drawing_control_id, filename }] }` |
| `POST` | `/api/epc-slddrw-jobs/:id/claim` | `{ agent_version, machine_name }` | `{ ok, download_url, filename, sha256 }` or `409` |
| `POST` | `/api/epc-slddrw-jobs/:id/complete` | `{ extraction_result }` | `{ ok }` or `422` |
| `POST` | `/api/epc-slddrw-jobs/:id/fail` | `{ reason }` | `{ ok }` |

Claim returns the GCS pre-signed download URL (15 min validity) directly. No separate download endpoint.

Claim is atomic: single `UPDATE ... WHERE status = 'pending' AND id = :id RETURNING *`. First writer wins; second gets 0 rows → 409.

### Server-side JSON validation on `/complete`

Zod schema enforced before accepting. Hard failures (422):
- `schema_version` string
- `agent.node_id` string, must equal `x-node-id` header
- `agent.agent_version` string
- `agent.extraction_timestamp` ISO 8601 string
- `file.original_filename` string
- `file.sha256` 64-char hex string
- `file.file_size_bytes` number > 0
- `properties` object present
- `extraction_errors` object with one key per module
- `design_data_table.found` must be `true`
- `design_data_table.rows` array with length >= 1
- Each row: `{ parameter: string, value: string, unit: string }`

If validation passes → job marked `completed`, result stored, DDS Comparison Engine triggered.

---

## 6b. DDS Comparison Engine (Cloud-side)

**Principle: DDS is the source of truth. Critical mismatches block approval and release.**

Triggered automatically when job transitions to `completed`.

### DDS field mapping

| Drawing Parameter | DDS Field | Severity |
|---|---|---|
| Design Pressure | `mechanicalData.shell.internalDesignPressureMawp` | CRITICAL |
| Design Temperature | `mechanicalData.shell.designTempMinMax` | CRITICAL |
| Corrosion Allowance | `mechanicalData.shell.internalCorrosionAllowanceMm` | CRITICAL |
| Material | `designCode` | CRITICAL |
| Hazard Level | `mechanicalData.shell.hazardLevel` | CRITICAL |
| PWHT | `mechanicalData.shell.postWeldHeatTreatment` | WARNING |
| Radiography | `mechanicalData.shell.radiography` | WARNING |
| Joint Efficiency | `mechanicalData.shell.jointEfficiency` | WARNING |
| Insulation | `mechanicalData.shell.insulation` | WARNING |
| Hydro Test Pressure | `mechanicalData.shell.hydroTestPressure` | WARNING |

Numeric comparisons normalised to base units (barg, °C, mm) using `drawing-unit-normalizer.ts`.
String comparisons case-insensitive, whitespace-normalised.

### Outcome values

| Condition | `dds_comparison_status` |
|---|---|
| All CRITICAL match | `pass` |
| Any CRITICAL mismatch | `fail` |
| Only WARNING mismatch | `warn` |
| DDS not found or incomplete | `blocked` |

### Approval gate

- `fail` → Approve button disabled, server rejects approval with 422
- `blocked` → Approve button disabled
- `warn` → Approve allowed, warnings shown, approver must acknowledge
- `pass` → Normal approval flow

Gate enforced in both frontend (button state) and backend approval endpoint.

---

## 7. Polling / Claim / Job Lifecycle

```
POLL every 10s
│
├─ GET /pending → empty → wait → repeat
└─ Job found → POST /claim
    ├─ 409 → wait → re-poll
    └─ 200 → { download_url, filename, sha256 }
         ├─ Download from GCS signed URL → verify SHA-256
         ├─ Write to temp\job_{id}\
         ├─ launch dedicated SW instance (DispatchEx)
         ├─ OpenDoc6(temp_copy, read-only, silent)
         ├─ ExtractProperties → ExtractSheets → ExtractViews →
         │  ExtractDimensions → ExtractAnnotations → ExtractTables →
         │  ExtractReferences → ExtractHealth → ExtractNozzles →
         │  ExtractDesignDataTable  ← MANDATORY: hard failure if absent
         ├─ CloseDoc → ExitApp (always in finally)
         ├─ design_data_table.found = false → POST /fail, stop
         ├─ POST /complete → { extraction_result }
         │   ├─ 422 → POST /fail { reason: Zod errors }
         │   └─ 200 → done → [cloud] DDS Comparison → Rule Engine
         └─ Delete temp\job_{id}\ (always in finally)
              → wait → re-poll
```

Stale job timeout: jobs at `processing` > 30 min → auto-reset to `failed` by cloud background task.
Max retries: 3. `retry_count` incremented on each retry.

---

## 8. Safety Rules

| Rule | Enforcement |
|---|---|
| Dedicated SW instance | `DispatchEx(progid)` only. Never `GetActiveObject`. Never `Dispatch`. |
| Read-only open | `OpenDoc6` with `swOpenDocOptions_ReadOnly | swOpenDocOptions_Silent` |
| Never modify original | Agent writes to temp dir. GCS original untouched. |
| Never Save / SaveAs | No such calls exist in codebase. |
| Temp copy only | Extractor receives temp path. Original filename for metadata only. |
| Temp always cleared | `finally` block deletes temp dir on success and failure. |
| One job at a time | Poll loop is sequential. |
| Clean SW shutdown | `CloseDoc` + `ExitApp` always in `finally`. |
| Dialog suppression | `UserControlBackground(True)` + silent open flag. |
| Per-node auth | `x-node-id` + `x-node-token` validated on every request. |
| Design Data mandatory | Hard failure if table absent. Job never reaches `completed` without it. |
| DDS gate mandatory | Approval API rejects if `dds_comparison_status` = `fail` or `blocked`. |

---

## 9. Logging / Error Handling

Log file: `C:\ThermopacAgent\logs\agent-YYYY-MM-DD.log`
Rotation: daily, 30-day retention.

Job-level timeout: entire job runs in a worker thread. Main poll thread joins with
`thread.join(timeout=job_timeout_sec)`. On timeout: cancellation event set, worker
checks it between modules, calls CloseDoc + ExitApp in finally, main calls `POST /fail`.
No per-module watchdog threads.

---

## 10. Version 1 Extraction Scope

| Module | Mandatory? |
|---|---|
| `ExtractProperties` | Yes (soft failure logs error, empty properties submitted) |
| `ExtractSheets` | No — soft failure |
| `ExtractViews` | No — soft failure |
| `ExtractDimensions` | No — soft failure |
| `ExtractAnnotations` | No — soft failure |
| `ExtractTables` | No — soft failure |
| `ExtractReferences` | No — soft failure |
| `ExtractHealth` | No — soft failure |
| `ExtractNozzles` | No — soft failure |
| `ExtractDesignDataTable` | **YES — hard failure. Absent or empty → job fails.** |

---

## 11. Install & Configure

### Step 1 — Admin registers node (cloud app)
- Admin opens Agent Nodes panel
- Creates: `node_id`, label, `active = true`
- System generates `node_token` — displayed once

### Step 2 — Install on Windows PC
- Run `ThermopacAgent-Setup-v1.0.exe`

### Step 3 — Edit `config.ini`
```ini
[cloud]
api_url    = https://thermopac-communication-thermopacllp.replit.app
node_id    = PC-DESIGN-01
node_token = <token from admin panel>

[agent]
poll_interval_sec = 10
job_timeout_sec   = 600
max_retries       = 3

[paths]
temp_dir = C:\ThermopacAgent\temp
log_dir  = C:\ThermopacAgent\logs

[solidworks]
solidworks_version = 2024
; solidworks_progid = SldWorks.Application.32
visible            = false
```

### Step 4 — Run
Double-click shortcut. Console: auth test + first poll.

### Step 5 — Verify
Upload `.slddrw` from cloud DWG Attachments card.
Agent: claim → SW launch → extraction → upload.
Cloud: Zod validation → DDS comparison → Drawing Verification card updates.

---

## Cloud Database Tables

### `epc_agent_nodes`
| Column | Type |
|---|---|
| id | serial PK |
| node_id | varchar(100) unique not null |
| token_hash | varchar(255) not null (bcrypt) |
| machine_name | varchar(255) |
| created_by | varchar(255) |
| created_at | timestamp default now |
| active | boolean default true |
| last_seen_at | timestamp |
| last_seen_version | varchar(50) |

### `epc_slddrw_extraction_jobs`
| Column | Type |
|---|---|
| id | serial PK |
| drawing_control_id | int FK → epc_drawing_controls |
| attachment_id | int FK → epc_document_attachments |
| slddrw_gcs_path | varchar(500) not null |
| slddrw_filename | varchar(255) |
| slddrw_sha256 | varchar(64) |
| status | varchar(50) default 'pending' |
| node_id | varchar(100) |
| agent_version | varchar(50) |
| machine_name | varchar(255) |
| claimed_at | timestamp |
| completed_at | timestamp |
| failed_reason | text |
| retry_count | int default 0 |
| extraction_result | jsonb |
| dds_comparison_status | varchar(50) |
| dds_comparison_result | jsonb |
| created_by | varchar(255) |
| created_at | timestamp default now |

---

*End of baseline design document v3.*
