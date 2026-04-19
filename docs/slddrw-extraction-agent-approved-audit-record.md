# THERMOPAC — SolidWorks Extraction Agent
## Approved Combined Audit Record
**Document Type: AUDIT RECORD — APPROVED BASELINE + PHASE 1 CLOSURE PLAN**
**Status: APPROVED**
**Baseline Approved: 2026-04-18**
**Closure Plan Approved: 2026-04-19**
**Corrections Applied: 2026-04-19 (SW auto-detection, exact upload UI path)**

This document is the single authoritative audit record.
It combines the frozen baseline design (v3) and the Phase 1 closure plan,
with all approved corrections applied.
Any deviation from this document requires explicit revision and re-approval.

---

# PART A — FROZEN BASELINE DESIGN (v3)

*Source: docs/slddrw-extraction-agent-baseline-v3.md — APPROVED 2026-04-18*
*Supersedes: v1 (plan), v2 (plan)*

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

### Version Auto-Detection (APPROVED CORRECTION — 2026-04-19)

`solidworks_version = 0` in `config.ini` triggers automatic detection.
Agent scans the Windows registry for the highest installed SolidWorks version and resolves the ProgID without any manual configuration.

`solidworks_version = <year>` (e.g. `2024`) is a manual override — use only when auto-detection cannot resolve correctly.

`solidworks_progid = <ProgID>` is a full override for non-standard installs.

Auto-detection is the default and recommended mode for all production installs.

### SolidWorks version → ProgID map

| SW Version | ProgID |
|---|---|
| 2019 | `SldWorks.Application.27` |
| 2020 | `SldWorks.Application.28` |
| 2021 | `SldWorks.Application.29` |
| 2022 | `SldWorks.Application.30` |
| 2023 | `SldWorks.Application.31` |
| 2024 | `SldWorks.Application.32` |

### Connection strategy

1. Resolve ProgID via auto-detection (registry) or manual override in `config.ini`
2. `win32com.client.DispatchEx(progid)` — always creates new independent process
3. `swApp.Visible = False`
4. `swApp.UserControlBackground(True)` — suppress all dialogs
5. `OpenDoc6(temp_path, swDocDRAWING, swOpenDocOptions_ReadOnly | swOpenDocOptions_Silent)`
6. Run all 10 extraction modules sequentially
7. `CloseDoc(temp_path)` — NEVER Save or SaveAs
8. `swApp.ExitApp()` — always, in finally block

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
    "solidworks_version": "<auto-detected from file metadata>",
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
         ├─ launch dedicated SW instance (DispatchEx, auto-detected ProgID)
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
solidworks_version = 0
; Set to 0 for automatic registry detection (recommended).
; Set to a year (e.g. 2024) only if auto-detection fails.
; solidworks_progid = SldWorks.Application.32  (full override — non-standard installs only)
visible = false
```

### Step 4 — Run
Double-click shortcut. Console shows auth test + first poll.

### Step 5 — Verify
Upload `.slddrw` via:
`EPC app → /epc/drawing-controls → Drawing Control row → Drawing Verification card → Upload`

Agent: claim → SW launch (auto-detected ProgID) → extraction → upload.
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

# PART B — PHASE 1 CLOSURE PLAN

*Approved: 2026-04-19 — with corrections applied*

---

## Phase 1 Code Status — Complete on Replit

| Component | File | Status |
|---|---|---|
| Poll loop + signal handling | `agent/main.py` | ✅ |
| Config + SW ProgID auto-detection | `agent/config.py` | ✅ |
| Rotating logger | `agent/logger.py` | ✅ |
| HTTP client (4 API calls) | `agent/job_client.py` | ✅ |
| Job orchestration + timeout | `agent/job_runner.py` | ✅ |
| SW COM orchestrator | `extractor/solidworks_extractor.py` | ✅ |
| ExtractProperties | `extractor/extract_properties.py` | ✅ |
| ExtractSheets | `extractor/extract_sheets.py` | ✅ |
| ExtractViews | `extractor/extract_views.py` | ✅ |
| ExtractDimensions | `extractor/extract_dimensions.py` | ✅ |
| ExtractAnnotations | `extractor/extract_annotations.py` | ✅ |
| ExtractTables | `extractor/extract_tables.py` | ✅ |
| ExtractReferences | `extractor/extract_references.py` | ✅ |
| ExtractHealth | `extractor/extract_health.py` | ✅ |
| ExtractNozzles | `extractor/extract_nozzles.py` | ✅ |
| ExtractDesignDataTable (mandatory) | `extractor/extract_design_data.py` | ✅ |
| Inno Setup installer | `installer/setup.iss` | ✅ |
| Build scripts | `build.bat`, `bootstrap.bat` | ✅ |
| Default config | `config.ini` | ✅ |
| GitHub Actions workflow | `build-windows-agent-standalone.yml` | ✅ |
| Full zip package (26 files) | `client/public/thermopac-agent-full.zip` | ✅ |
| Cloud API — 4 endpoints | `server/epc-slddrw-job-routes.ts` | ✅ |
| Per-node bcrypt auth | `server/epc-slddrw-job-routes.ts` | ✅ |
| Zod validation on `/complete` | `server/epc-slddrw-job-routes.ts` | ✅ |
| `epc_agent_nodes` table | DB | ✅ |
| `epc_slddrw_extraction_jobs` table | DB | ✅ |
| `--test-full` auth test → PASS | Verified | ✅ |

---

## Remaining Steps to Close Phase 1 (Your Side)

| Step | Action |
|---|---|
| **1** | Push `thermopac-agent-full.zip` contents to GitHub repo `thermopac-agent` |
| **2** | GitHub Actions builds → `ThermopacAgent-Setup-v1.0.exe` in Releases |
| **3** | Install on SolidWorks Windows PC → edit `config.ini` |
| **4** | Upload a real `.slddrw` via: `EPC app → /epc/drawing-controls → Drawing Control row → Drawing Verification card → Upload` |
| **5** | Confirm agent extracts → result lands in DB with `status = 'completed'` |

---

## Phase 1 Execution Verification

### PRE-CONDITIONS

| Check | How |
|---|---|
| SolidWorks installed on PC | Open SW manually — confirm it launches |
| Python 3.11 installed | `python --version` in CMD |
| `config.ini` has correct `api_url`, `node_id`, `node_token` | Open in Notepad |
| `solidworks_version = 0` (auto-detect) | Confirm in `config.ini` |
| Node exists in cloud with `active = true` | Agent Nodes panel in EPC app |
| PC can reach cloud URL | `curl https://thermopac-communication-thermopacllp.replit.app/api/epc-slddrw-jobs/pending` |

---

### STEP 1 — Auth Test on Windows PC

**Command:**
```
ThermopacAgent.exe --test-full
```

**Expected agent output:**
```
[Config] Loaded: api_url=https://thermopac-... node_id=<node_id>
[Config] solidworks_version=0 → scanning Windows registry for highest installed version…
[Config] Resolved ProgID: SldWorks.Application.XX  (XX reflects actual installed version)
[Agent]  Connection test...
[Client] GET /api/epc-slddrw-jobs/pending → 200 OK
[Agent]  Auth OK
[Agent]  --test-full: synthetic claim/fail cycle...
[Agent]  Overall: PASS
```

**Expected server log:**
```
[NodeAuth] node_id=<node_id> token_prefix=<first 8 chars> → OK
```

**DB confirm:** `epc_agent_nodes.last_seen_at` updated.

**Failure:** `Authentication failed` → check `node_token` in `config.ini` matches token issued in Agent Nodes panel. Case-sensitive. No spaces.

---

### STEP 2 — Upload `.slddrw` (Cloud UI)

**Exact upload path (APPROVED CORRECTION — 2026-04-19):**
```
EPC app
  → /epc/drawing-controls
      → Click into a Drawing Control row
          → Drawing Verification card
              → Upload .slddrw button
```

This is the **only** upload point that creates an `epc_slddrw_extraction_jobs` row.
Uploading via any other card or route will not trigger an extraction job.

**DB confirm:**
```sql
SELECT id, status, slddrw_filename, slddrw_sha256, created_at
FROM epc_slddrw_extraction_jobs
ORDER BY created_at DESC LIMIT 1;
```
Expected: one row, `status = 'pending'`.

---

### STEP 3 — Start Agent Poll Loop

**Command:**
```
ThermopacAgent.exe
```

**Expected output (on startup):**
```
[Agent]  Auth OK — polling every 10s
[Agent]  Poll #1 → 1 job(s) pending
[Runner] ══ Job <id> start ══ file=<filename>.slddrw
[Client] POST /api/epc-slddrw-jobs/<id>/claim → 200 OK
[Runner] Downloading <filename>.slddrw…
[Runner] Download complete: <N> bytes → C:\ThermopacAgent\temp\job_<id>\<filename>.slddrw
[Runner] SHA-256 actual=<first 16 chars>… expected=<first 16 chars>…
```

**DB confirm (after claim):**
```sql
SELECT id, status, node_id, claimed_at, machine_name
FROM epc_slddrw_extraction_jobs WHERE id = <id>;
```
Expected: `status = 'processing'`, `node_id` and `claimed_at` set.

---

### STEP 4 — SolidWorks Extraction

**Expected agent output:**
```
[Extractor] Launching SolidWorks via ProgID SldWorks.Application.XX (auto-detected)…
[Extractor] SW launched — suppressing dialogs
[Extractor] Opening: C:\ThermopacAgent\temp\job_<id>\<filename>.slddrw (read-only, silent)
[Extractor] Doc opened: <filename>.slddrw
[Extractor] Module 1/10: ExtractProperties…  OK
[Extractor] Module 2/10: ExtractSheets…      OK
[Extractor] Module 3/10: ExtractViews…       OK
[Extractor] Module 4/10: ExtractDimensions…  OK
[Extractor] Module 5/10: ExtractAnnotations… OK
[Extractor] Module 6/10: ExtractTables…      OK
[Extractor] Module 7/10: ExtractReferences…  OK
[Extractor] Module 8/10: ExtractHealth…      OK
[Extractor] Module 9/10: ExtractNozzles…     OK  (or: WARNING — nozzle table not found)
[Extractor] Module 10/10: ExtractDesignDataTable… OK — <N> rows
[Extractor] CloseDoc OK
[Extractor] ExitApp OK
```

**Note:** A hidden `sldworks.exe` process appears in Task Manager during extraction. It exits automatically. Do NOT kill it manually.

**Note:** Modules 2–9 log WARNING and continue on soft failure. Only Module 10 causes a hard failure.

---

### STEP 5 — Upload Result to Cloud

**Expected agent output:**
```
[Runner] Uploading extraction result for job <id>…
[Client] POST /api/epc-slddrw-jobs/<id>/complete → 200 OK
[Runner] ══ Job <id> complete (<N>s) ══
[Runner] Temp dir removed: C:\ThermopacAgent\temp\job_<id>
[Agent]  Poll #2 → 0 job(s) pending
```

**DB confirm (success):**
```sql
SELECT id, status, completed_at, dds_comparison_status,
       extraction_result->>'schema_version' AS schema_ver,
       jsonb_array_length(extraction_result->'design_data_table'->'rows') AS design_rows
FROM epc_slddrw_extraction_jobs WHERE id = <id>;
```
Expected:
- `status = 'completed'`
- `completed_at` set
- `schema_ver = '1.0'`
- `design_rows >= 1`
- `dds_comparison_status = NULL` — correct for Phase 1 (Phase 2 not yet built)

**Log file confirm:** `C:\ThermopacAgent\logs\agent-<YYYY-MM-DD>.log` contains full run, no unhandled exceptions.

---

### FAILURE CASES

| Symptom | Cause | Fix |
|---|---|---|
| `Authentication failed` at startup | Wrong `node_token` or `node_id` | Re-check `config.ini` — case-sensitive, no spaces |
| `ConnectionError` on poll | No network or wrong `api_url` | Verify URL — no trailing slash, no `/api` suffix |
| `Poll #1 → 0 job(s)` despite upload | Job not created | Check DB `epc_slddrw_extraction_jobs` — if empty, uploaded via wrong card |
| `Job claim failed (409)` | Two agents racing | Normal — job continues next poll |
| `SHA-256 mismatch` | Corrupted download | Check GCS file integrity |
| `SolidWorks launch failed` | SW not installed or wrong ProgID | Set `solidworks_version = 0` for auto-detect; run `--test` to verify |
| `OpenDoc6 error` | File corrupt or not a real `.slddrw` | Open the file manually in SolidWorks first to verify |
| `DesignDataNotFoundError` | Drawing has no Design Data table | Use a drawing that has the table — hard failure by design |
| `complete rejected (422)` | Zod validation failed | Check server log for exact field errors |
| `status = 'processing'` stuck > 30 min | Agent crashed mid-job | Cloud auto-resets to `failed` after 30 min — restart agent |

---

## Phase 1 Success Criteria — ALL MUST BE TRUE

| # | Criterion |
|---|---|
| 1 | `ThermopacAgent.exe --test-full` → `Overall: PASS` on the SolidWorks PC |
| 2 | Real `.slddrw` uploaded via Drawing Verification card → `epc_slddrw_extraction_jobs` row with `status = 'pending'` |
| 3 | Agent claims job → `status = 'processing'` with correct `node_id` and `machine_name` |
| 4 | SolidWorks launches invisibly (auto-detected ProgID), all 10 modules run, SW exits cleanly |
| 5 | `POST /complete` returns 200 → `status = 'completed'` |
| 6 | `extraction_result` JSONB in DB — `design_data_table.rows` has ≥ 1 row with real drawing values |
| 7 | `C:\ThermopacAgent\logs\agent-<date>.log` contains the full run, no unhandled exceptions |
| 8 | Temp dir `C:\ThermopacAgent\temp\job_<id>\` deleted after completion |
| 9 | Agent continues polling after job completion — no crash |

**All 9 criteria confirmed = Phase 1 CLOSED. Phase 2 begins.**

---

# PART C — APPROVED CORRECTIONS LOG

| Date | Correction | Applied To |
|---|---|---|
| 2026-04-19 | SolidWorks version detection is automatic. `solidworks_version = 0` triggers registry scan. No hardcoded ProgID in expected outputs. ProgID shown in logs reflects actual machine. | §4 (baseline), §11 `config.ini`, Steps 1, 3, 4 (closure plan) |
| 2026-04-19 | Exact upload UI path: `EPC app → /epc/drawing-controls → Drawing Control row → Drawing Verification card → Upload`. This is the only valid upload point for extraction jobs. | §11 Step 5 (baseline), Steps 2 and Pre-conditions (closure plan) |

---

# PART D — DOCUMENT REGISTRY

| Document | File Path | Status |
|---|---|---|
| Frozen Baseline v3 | `docs/slddrw-extraction-agent-baseline-v3.md` | APPROVED 2026-04-18 |
| Delivery Plan | `docs/slddrw-extraction-agent-delivery-plan.md` | APPROVED 2026-04-19 |
| **This Combined Audit Record** | **`docs/slddrw-extraction-agent-approved-audit-record.md`** | **APPROVED 2026-04-19** |

*End of approved combined audit record.*
