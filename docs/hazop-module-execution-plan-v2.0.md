# HAZOP Module — Execution Plan v2.0
# Deterministic Process Intelligence Engine — Dual-Mode Architecture

**Status:** PLAN — NOT IMPLEMENTED  
**Date:** 2026-05-24  
**Supersedes:** `docs/hazop-module-execution-plan-v1.0.md`  
**Author:** THERMOPAC QMS Agent  
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 1. Design Philosophy

### 1.1 Core Principle
This module is a **Deterministic Process Intelligence Engine**, not a spreadsheet form.

- The system does NOT read P&IDs automatically.
- The user manually builds a Process Loop using controlled dropdown fields.
- Given a complete Process Loop, the system deterministically applies HAZOP methodology rules to auto-generate deviations, causes, consequences, safeguards, and recommended actions.
- Same input → same output. No AI inference, no guessing.
- **This is a single module. Not two modules.** The operating mode determines only the equipment data source. All HAZOP logic, generation, approval, revision, and export are identical in both modes.

### 1.2 Two Operating Modes

| Aspect | Mode 1: Project-Based | Mode 2: Concept / Expected Project |
|---|---|---|
| `study_mode` value | `project_based` | `concept_expected_project` |
| `project_id` | Required — FK to `projects` | NULL |
| Equipment source | BUY List / Automation Engineering data | Manually created concept equipment |
| Tag source | Actual BUY list `tag_no` | Temporary concept tags |
| Instrument source | `ae_instrument_register` | Manually entered expected instruments |
| Study number prefix | `{project_code}-HAZOP-{seq}` | `CONCEPT-HAZOP-{seq}` |
| Status lifecycle | `draft → reviewed → approved → released → closed` | `draft → proposal → converted` |
| Conversion to project | N/A | Supported — see §10 |

### 1.3 What Does NOT Change Between Modes
- HAZOP guidewords and parameters (§2)
- Equipment category vocabulary (§6.1)
- Process Loop Builder step structure (§7)
- HAZOP auto-generation engine (§8)
- Safety function extraction (§8.4)
- C&E matrix generation (§8.5)
- FAT/SAT generation (§8.6)
- Approval workflow (§12)
- Revision control (§12)
- Export engine (§13)
- Audit logging (§20)
- Role permissions (§14)

### 1.4 What is NOT in scope
- Automatic P&ID parsing or OCR
- Free-text HAZOP entry (all fields are controlled vocabulary)
- Risk matrix or risk ranking (SIL assignment is a future phase)
- Quantitative risk analysis

### 1.5 Primary Flow (Both Modes)
```
[Mode 1: Project-Based]          [Mode 2: Concept]
BUY List / AE Module             Concept Equipment Library
  └─► Equipment Pool                └─► Concept Equipment Pool
        │                                  │
        └───────────────┬──────────────────┘
                        ▼
              Process Loop Builder
              (user manually sequences equipment)
                        │
                        ▼
            HAZOP Auto-Generation Engine
              ├─► Deviations (Guideword × Parameter per step)
              │     ├─► Causes
              │     ├─► Consequences
              │     ├─► Safeguards
              │     └─► Recommended Actions
              ├─► Safety Function Extraction (SIFs)
              ├─► Cause & Effect Matrix
              └─► FAT/SAT Verification Checklists
```

---

## 2. HAZOP Methodology Rules

### 2.1 Guidewords (controlled, fixed vocabulary)
| Code | Guideword | Meaning |
|---|---|---|
| `NO` | NO / NONE | No flow, no signal, complete negation |
| `MORE` | MORE | Quantitative increase |
| `LESS` | LESS | Quantitative decrease |
| `AS_WELL_AS` | AS WELL AS | Qualitative increase / additional component |
| `PART_OF` | PART OF | Qualitative decrease / less than intended |
| `REVERSE` | REVERSE | Logical opposite |
| `OTHER_THAN` | OTHER THAN | Complete substitution |
| `EARLY` | EARLY | Relative to time |
| `LATE` | LATE | Relative to time |
| `BEFORE` | BEFORE | Relating to order or sequence |
| `AFTER` | AFTER | Relating to order or sequence |

### 2.2 Parameters (controlled, fixed vocabulary)
| Code | Parameter | Applicable To |
|---|---|---|
| `FLOW` | Flow | Pumps, valves, instruments, pipes |
| `PRESSURE` | Pressure | All equipment |
| `TEMPERATURE` | Temperature | All equipment except check valves, isolation valves |
| `LEVEL` | Level | Tanks, vessels, columns, separators |
| `COMPOSITION` | Composition | All equipment |
| `PHASE` | Phase | Vessels, separators, columns |
| `SPEED` | Speed | Pumps, motors |
| `VISCOSITY` | Viscosity | Pumps, heat exchangers |
| `REACTION` | Reaction | Vessels, columns, heaters |
| `TIME` | Time | Batch steps, sequences |

### 2.3 Deviation Matrix (Guideword × Parameter)
Only meaningful combinations are generated. Non-meaningful pairs are suppressed without warning.

| Guideword | Flow | Pressure | Temperature | Level | Composition | Phase |
|---|---|---|---|---|---|---|
| NO | ✓ No Flow | ✗ | ✗ | ✗ | ✗ | ✗ |
| MORE | ✓ High Flow | ✓ High Pressure | ✓ High Temperature | ✓ High Level | ✓ Contamination | ✗ |
| LESS | ✓ Low Flow | ✓ Low Pressure | ✓ Low Temperature | ✓ Low Level | ✓ Off-spec | ✗ |
| REVERSE | ✓ Reverse Flow | ✗ | ✗ | ✗ | ✗ | ✗ |
| OTHER_THAN | ✗ | ✗ | ✗ | ✗ | ✓ Wrong fluid | ✓ Phase change |
| AS_WELL_AS | ✗ | ✗ | ✗ | ✗ | ✓ Ingress | ✗ |
| PART_OF | ✗ | ✗ | ✗ | ✗ | ✓ Partial mix | ✓ Two-phase |

Full matrix defined in `server/hazop-deviation-library.ts` with `applicable: boolean` per combination.

---

## 3. Equipment Category → Parameter Applicability Map

| Equipment Category | Applicable Parameters |
|---|---|
| Tank | FLOW, PRESSURE, TEMPERATURE, LEVEL, COMPOSITION, PHASE |
| Pump | FLOW, PRESSURE, TEMPERATURE, SPEED, VISCOSITY |
| Heat Exchanger | FLOW, PRESSURE, TEMPERATURE, COMPOSITION |
| Heater | FLOW, PRESSURE, TEMPERATURE, REACTION |
| Vessel | FLOW, PRESSURE, TEMPERATURE, LEVEL, COMPOSITION, PHASE |
| Column | FLOW, PRESSURE, TEMPERATURE, LEVEL, COMPOSITION, PHASE, REACTION |
| Separator | FLOW, PRESSURE, LEVEL, PHASE, COMPOSITION |
| Filter | FLOW, PRESSURE, COMPOSITION |
| Control Valve | FLOW, PRESSURE |
| Isolation Valve | FLOW, PRESSURE |
| Check Valve | FLOW, PRESSURE |
| Instrument | FLOW, PRESSURE, TEMPERATURE, LEVEL |
| Utility System | FLOW, PRESSURE, TEMPERATURE |
| Drain | FLOW, PRESSURE |
| Vent | FLOW, PRESSURE |
| Product Outlet | FLOW, PRESSURE, COMPOSITION |
| Waste Outlet | FLOW, PRESSURE, COMPOSITION |
| Next Loop | — (transition node; no deviations generated) |

---

## 4. Deviation Library — Standard Causes, Consequences, Safeguards

### 4.1 Library Structure
Stored in `hazop_deviation_library` table (seeded at deployment, read-only at runtime).  
Each record = `(equipment_category, guideword, parameter) → { typical_causes[], typical_consequences[], typical_safeguards[], typical_actions[] }`.

### 4.2 Tag Matching in Concept Mode
In Concept Mode, safeguard tag hints are matched against `hazop_concept_instruments` instead of `ae_instrument_register`. Matching logic is identical — compare `tag_hint` against `concept_tag`.

### 4.3 Example Entries

**Pump + MORE + FLOW = High Flow**
- Typical causes: Control valve fails open; Pump speed too high; Bypass valve open inadvertently
- Typical consequences: Downstream overpressure; Erosion of pipeline; Product contamination
- Typical safeguards: High flow alarm (FIA-HH); Pressure safety valve (PSV); High pressure shutdown
- Typical actions: Verify FCV fail-safe position; Install flow transmitter with high-high trip

**Tank + MORE + LEVEL = High Level**
- Typical causes: Inlet valve fails open; Level controller failure; Outlet pump failure
- Typical consequences: Overflow; Loss of containment; Environmental spill
- Typical safeguards: High level alarm (LIA-HH); High-high level shutdown (LSHH); Overflow line
- Typical actions: Verify LSHH setpoint; Confirm overflow drain capacity

**Pump + NO + FLOW = No Flow**
- Typical causes: Pump fails to start; Isolation valve closed; Suction line blocked
- Typical consequences: Process starvation; Downstream equipment damage; Pump cavitation
- Typical safeguards: Low flow alarm (FIA-LL); No-flow trip (FSLL); Pump run monitoring
- Typical actions: Verify pump start permissives; Install low-flow shutdown

**Vessel + MORE + PRESSURE = High Pressure**
- Typical causes: Outlet blocked; External fire; Cooling failure; Overfill
- Typical consequences: Vessel overpressure; Potential rupture; Loss of containment
- Typical safeguards: Pressure safety valve (PSV); High pressure alarm; Pressure relief vent
- Typical actions: Verify PSV sizing; Confirm relief path

**Heat Exchanger + LESS + TEMPERATURE = Low Temperature**
- Typical causes: Utility fluid flow loss; Utility fluid temperature low; Fouling
- Typical consequences: Off-spec product; Crystallisation; Pipe blockage
- Typical safeguards: Low temperature alarm (TIA-LL); Utility flow monitor
- Typical actions: Install TIA-LL with operator alert

Full library: 200+ entries. Defined in `server/hazop-deviation-library.ts`, seeded via `server/scripts/seed-hazop-library.ts`.

---

## 5. Database Schema

### 5.1 Modified Table: `hazop_studies`
Study header — supports both modes.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| **study_mode** | varchar(30) NOT NULL | `project_based` / `concept_expected_project` |
| **project_id** | int FK projects.id **NULLABLE** | Required if `study_mode = project_based`; NULL if concept |
| study_number | varchar(50) NOT NULL | `{project_code}-HAZOP-{seq}` (project) or `CONCEPT-HAZOP-{seq}` (concept) |
| title | varchar(200) NOT NULL | |
| revision | varchar(10) NOT NULL DEFAULT `A` | |
| **status** | varchar(30) NOT NULL DEFAULT `draft` | Project mode: `draft / reviewed / approved / released / closed` — Concept mode: `draft / proposal / converted` |
| study_leader | int FK users.id | |
| team_members | jsonb | Array of user IDs |
| study_date | date | |
| process_description | text | |
| **design_basis** | text | Concept mode: design basis assumptions; Project mode: reference doc |
| **concept_title** | varchar(200) | Concept mode: expected project/opportunity name |
| **converted_to_study_id** | int FK hazop_studies.id | Populated on conversion — points to the new project-based study |
| **converted_at** | timestamp | |
| **converted_by** | int FK users.id | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |
| created_by | int FK users.id | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

CHECK: IF `study_mode = 'project_based'` THEN `project_id IS NOT NULL` — enforced server-side on INSERT/UPDATE.  
UNIQUE: `(study_number)` — global, not per-project, because concept studies have no project.

---

### 5.2 New Table: `hazop_concept_equipment`
Manually created expected equipment — used only in Concept Mode.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| equipment_category | varchar(50) NOT NULL | Controlled — see §6.1 |
| concept_tag | varchar(50) NOT NULL | Temporary tag — e.g. `P-101` or `TK-01` |
| equipment_role | varchar(100) | e.g. `Feed Pump`, `Storage Tank` |
| make | varchar(100) | Expected make |
| model | varchar(100) | Expected model |
| kw_rating | numeric | For pumps/motors |
| estimated_pressure_min | numeric | barg |
| estimated_pressure_max | numeric | barg |
| estimated_temp_min | numeric | °C |
| estimated_temp_max | numeric | °C |
| fluid | varchar(100) | |
| has_vfd | boolean DEFAULT false | |
| hazardous_area | boolean DEFAULT false | |
| area_classification | varchar(30) | |
| design_assumption | text | Free text — e.g. `Assumed centrifugal, 7.5kW, 4 barg discharge` |
| is_confirmed | boolean DEFAULT false | Updated during conversion |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(study_id, concept_tag)`

---

### 5.3 New Table: `hazop_concept_instruments`
Expected instruments — used only in Concept Mode.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| concept_tag | varchar(50) NOT NULL | Temporary instrument tag — e.g. `PT-101`, `FT-201` |
| instrument_class | varchar(30) | PT / TT / FT / LT / XT / FY |
| service_description | varchar(200) | |
| signal_type | varchar(20) | `4-20mA` / `digital` / `thermocouple` |
| estimated_range_min | numeric | |
| estimated_range_max | numeric | |
| units | varchar(20) | |
| linked_equipment_tag | varchar(50) | References `hazop_concept_equipment.concept_tag` |
| design_assumption | text | |
| is_confirmed | boolean DEFAULT false | |
| notes | text | |
| created_at | timestamp DEFAULT NOW() | |

UNIQUE: `(study_id, concept_tag)`

---

### 5.4 New Table: `hazop_design_assumptions`
Formal design basis assumptions for a study (primarily Concept Mode, but allowed in Project Mode).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| assumption_number | int NOT NULL | Sequential within study |
| assumption_category | varchar(50) | `process` / `equipment` / `instrument` / `utility` / `safety` / `regulatory` |
| description | text NOT NULL | |
| basis | text | Where the assumption comes from |
| status | varchar(20) DEFAULT `open` | `open` / `confirmed` / `superseded` |
| confirmed_at | timestamp | |
| confirmed_by | int FK users.id | |
| preserved_on_conversion | boolean DEFAULT true | Whether this assumption carries over on conversion |
| created_at | timestamp DEFAULT NOW() | |

---

### 5.5 Unchanged Tables (from v1.0)
The following tables are unchanged — they work identically in both modes because they are scoped only to `study_id`:

- `hazop_process_loops`
- `hazop_process_steps` *(two columns modified — see §5.6)*
- `hazop_nodes`
- `hazop_deviations`
- `hazop_causes`
- `hazop_consequences`
- `hazop_safeguards`
- `hazop_actions`
- `hazop_safety_functions` *(one column modified — see §5.7)*
- `hazop_ce_matrix` *(one column modified — see §5.8)*
- `hazop_ce_causes`
- `hazop_ce_effects`
- `hazop_ce_cells`
- `hazop_deviation_library`
- `hazop_fat_sat_items`
- `hazop_revisions`

---

### 5.6 Modified Table: `hazop_process_steps`
Two columns modified to support both equipment sources:

| Column | Type | Notes |
|---|---|---|
| … (all columns from v1.0 unchanged) | | |
| buy_list_line_id | int FK project_buy_list_lines.id **NULLABLE** | Set in Project Mode; NULL in Concept Mode |
| **concept_equipment_id** | int FK hazop_concept_equipment.id **NULLABLE** | Set in Concept Mode; NULL in Project Mode |

Rule: `buy_list_line_id` and `concept_equipment_id` are mutually exclusive. Only one may be set per step. Both may be NULL for virtual steps (Drain, Vent, Next Loop, etc.). Enforced server-side.

---

### 5.7 Modified Table: `hazop_safety_functions`
`project_id` column becomes nullable:

| Column | Notes |
|---|---|
| project_id | int **NULLABLE** — NULL for concept studies |
| sif_number | `{project_code}-SIF-{seq}` (project) or `CONCEPT-SIF-{seq}` (concept) |

---

### 5.8 Modified Table: `hazop_ce_matrix`
`project_id` column becomes nullable:

| Column | Notes |
|---|---|
| project_id | int **NULLABLE** — NULL for concept studies |
| matrix_number | `{project_code}-CEM-{seq}` (project) or `CONCEPT-CEM-{seq}` (concept) |

---

### 5.9 Modified Table: `hazop_fat_sat_items`
`project_id` column becomes nullable:

| Column | Notes |
|---|---|
| project_id | int **NULLABLE** — NULL for concept studies |

---

## 6. Controlled Vocabulary

### 6.1 Equipment Category (exact values stored in DB — unchanged from v1.0)
```
Tank | Pump | Heat Exchanger | Heater | Vessel | Column | Separator
Filter | Control Valve | Isolation Valve | Check Valve | Instrument
Utility System | Drain | Vent | Product Outlet | Waste Outlet | Next Loop
```

### 6.2 Connection Type (unchanged)
```
Pipe (flanged) | Pipe (screwed) | Pipe (welded) | Flexible hose
Instrumentation line | Electrical signal | Mechanical link | Virtual (logic only)
```

### 6.3 Outlet Type (unchanged)
```
Process outlet | Recycle | Bypass | Drain | Vent | Relief
Overflow | Sample point | Instrument tap | Loop transition
```

### 6.4 Outlet Destination (unchanged)
| Value stored | Description |
|---|---|
| `next_step` | Proceeds to the immediately next sequence step |
| `prev_step` | Returns to the immediately previous sequence step |
| `start_of_loop` | Returns to sequence_no = 1 of this loop |
| `specific_step` | A specific earlier step (`outlet_destination_ref` = target sequence_no) |
| `next_loop` | Feeds into the next process loop |
| `recycle` | Recycle back to a referenced step/loop |
| `bypass` | Bypasses one or more steps (`outlet_destination_ref` = target sequence_no) |
| `drain` | To drain system |
| `vent` | To vent system |
| `product_outlet` | Final product outlet — loop terminates |
| `waste_outlet` | Waste stream — loop terminates |

---

## 7. Status Lifecycles

### 7.1 Project-Based Mode (`study_mode = 'project_based'`)
```
draft → reviewed → approved → released → closed
                ↑                 ↑
           (rejected)        (rejected)
```
| Status | Meaning |
|---|---|
| `draft` | Study in progress — loops being built, HAZOP being generated |
| `reviewed` | HAZOP worksheet review complete — submitted for approval |
| `approved` | Approved by Manager or above |
| `released` | Released — GCS upload triggered; document issued |
| `closed` | Project completed; study archived |

### 7.2 Concept Mode (`study_mode = 'concept_expected_project'`)
```
draft → proposal → converted
```
| Status | Meaning |
|---|---|
| `draft` | Study in progress — concept equipment being built, HAZOP being explored |
| `proposal` | Concept HAZOP complete — presented as proposal/pre-FEED input |
| `converted` | Converted to a Project-Based study after order confirmation (see §10) |

### 7.3 Rejection Rule (Project Mode only)
If rejected at `reviewed` or `approved` → status returns to `draft`. Rejection reason recorded in `hazop_revisions`.

---

## 8. HAZOP Auto-Generation Engine

### 8.1 Trigger (unchanged)
`POST /api/hazop/studies/:studyId/generate`  
Optional: `{ loopId?: number }` — generate for one loop only.  
Works identically in both modes.

### 8.2 Equipment Pool Resolution (mode-dependent)
Before generation runs, the engine resolves the equipment pool for tag matching:

```
IF study_mode = 'project_based':
  equipment_pool = project_buy_list_lines WHERE project_id = study.project_id
  instrument_pool = ae_instrument_register WHERE project_id = study.project_id

IF study_mode = 'concept_expected_project':
  equipment_pool = hazop_concept_equipment WHERE study_id = study.id
  instrument_pool = hazop_concept_instruments WHERE study_id = study.id
```

Tag matching of safeguard `tag_hint` against `instrument_pool` uses identical logic in both modes.

### 8.3 Generation Algorithm (unchanged from v1.0)
```
FOR each loop in study (or target loop):
  FOR each step in loop ORDER BY sequence_no:
    skip if equipment_category IN ('Drain','Vent','Next Loop','Product Outlet','Waste Outlet')
    
    1. Create hazop_nodes record for this step
    2. Lookup applicable parameters for equipment_category (§3 map)
    
    FOR each applicable parameter:
      FOR each guideword:
        3. Lookup (equipment_category, guideword, parameter) in hazop_deviation_library
           IF applicable = false → skip
           IF not found → skip with server-side warning log
        4. INSERT hazop_deviations
        5. INSERT hazop_causes (source = 'library')
        6. INSERT hazop_consequences (source = 'library')
        7. INSERT hazop_safeguards — match tag_hint against resolved instrument_pool
        8. INSERT hazop_actions (source = 'library', status = 'open')
    
    9. UPDATE hazop_nodes.deviation_count, action_count

  10. UPDATE hazop_process_loops.status = 'hazop_generated'
```

### 8.4 Safety Function Extraction (separate trigger — unchanged)
`POST /api/hazop/studies/:studyId/extract-safety-functions`

- Scans `hazop_safeguards` WHERE `safeguard_type = 'instrumented'`
- Scans `hazop_actions` WHERE `action_type = 'instrumentation'`
- Inserts unique `(initiator_tag, final_element_tag)` pairs as SIFs
- `sif_number` = `{project_code}-SIF-{seq}` (project mode) or `CONCEPT-SIF-{seq}` (concept mode)

### 8.5 C&E Matrix Generation (separate trigger — unchanged)
`POST /api/hazop/studies/:studyId/generate-ce-matrix`

- Builds cause rows and effect columns from SIFs
- `matrix_number` = `{project_code}-CEM-{seq}` (project mode) or `CONCEPT-CEM-{seq}` (concept mode)

### 8.6 FAT/SAT Generation (separate trigger — unchanged)
`POST /api/hazop/studies/:studyId/generate-fat-sat?type=FAT|SAT`

- Generated from C&E matrix cells — identical logic in both modes
- In Concept Mode, FAT/SAT represents an expected test scope (verified after conversion to project)

### 8.7 Idempotency (unchanged)
Re-generation on same loop only adds new points for new steps. Existing deviations (unique on `node_id, guideword, parameter`) are skipped.

---

## 9. Process Loop Builder — Equipment Selection Rules

### 9.1 Project Mode
- `equipment_tag` dropdown: populated from `project_buy_list_lines` for the study's `project_id`, filtered by `equipment_category` mapping.
- `buy_list_line_id` set on step save.
- `concept_equipment_id` = NULL.

### 9.2 Concept Mode
- `equipment_tag` dropdown: populated from `hazop_concept_equipment` for the study, filtered by `equipment_category`.
- `concept_equipment_id` set on step save.
- `buy_list_line_id` = NULL.
- If no concept equipment exists for the selected category → inline "Add concept equipment" action opens a mini-form to create a new `hazop_concept_equipment` record on the fly.

### 9.3 Step Validation Rules (identical in both modes)
1. Step 1 must start with a source equipment category: Tank, Vessel, Separator, Utility System, or a transition from another loop.
2. Non-terminal steps must have `outlet_destination` set.
3. `equipment_tag` is a warning if missing, not a hard block.
4. Loop must have at least 2 steps before generation is allowed.

---

## 10. Concept → Project Conversion Path

### 10.1 Trigger
`POST /api/hazop/studies/:conceptStudyId/convert`  
Body: `{ target_project_id: number }`

### 10.2 Conversion Rules
1. Resolve `target_project_id` — must be a valid project with `status` not `closed`.
2. Validate that no existing `project_based` HAZOP study already exists for `target_project_id` (warn but do not block — a project may have multiple studies).
3. Create a new `hazop_studies` record with `study_mode = 'project_based'`, `project_id = target_project_id`, `status = 'draft'`.
4. Copy all child records into the new study:
   - `hazop_process_loops` → new rows with `study_id = new_study.id`
   - `hazop_process_steps` → new rows; `buy_list_line_id` is attempted to be resolved from the project's BUY list by matching `concept_tag` against BUY list `tag_no`. If matched → set `buy_list_line_id`; if unmatched → `buy_list_line_id = NULL`, `concept_equipment_id = NULL`, equipment_tag retained as-is (manual resolution required).
   - `hazop_nodes`, `hazop_deviations`, `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, `hazop_actions` → copied verbatim with new `study_id`.
   - `hazop_safety_functions` → copied; `project_id` updated to `target_project_id`; `sif_number` re-sequenced using project prefix.
   - `hazop_ce_matrix`, `hazop_ce_causes`, `hazop_ce_effects`, `hazop_ce_cells` → copied; `project_id` updated.
   - `hazop_fat_sat_items` → copied; `project_id` updated.
   - `hazop_design_assumptions` WHERE `preserved_on_conversion = true` → copied.
   - `hazop_revisions` → copied verbatim (audit trail preserved).
5. Update concept study: `status = 'converted'`, `converted_to_study_id = new_study.id`, `converted_at = NOW()`, `converted_by = user.id`.
6. All operations in a single DB transaction — atomic. If any step fails → full rollback.

### 10.3 Post-Conversion
- The new project-based study starts at `status = 'draft'`.
- The concept study is read-only after conversion (`status = 'converted'`; no edits allowed).
- UI shows a banner on the concept study: "Converted to study {new_study.study_number} on {date}. View →".
- The new study shows a banner: "Converted from concept study {concept_study.study_number}. Review tag assignments →".
- Any `hazop_process_steps` where `buy_list_line_id` and `concept_equipment_id` are both NULL after conversion are flagged with `requires_tag_resolution = true` — shown as warnings in the Loop Builder.

---

## 11. Document Numbering

| Document | Project Mode | Concept Mode |
|---|---|---|
| HAZOP Study | `{code}-HAZOP-{seq}` e.g. `2627-018-HAZOP-001` | `CONCEPT-HAZOP-{seq}` e.g. `CONCEPT-HAZOP-001` |
| Safety Instrumented Function | `{code}-SIF-{seq}` | `CONCEPT-SIF-{seq}` |
| Cause & Effect Matrix | `{code}-CEM-{seq}` | `CONCEPT-CEM-{seq}` |
| FAT Checklist | `{code}-HAZFAT-{seq}` | `CONCEPT-HAZFAT-{seq}` |
| SAT Checklist | `{code}-HAZSAT-{seq}` | `CONCEPT-HAZSAT-{seq}` |
| Deviation Number | `DEV-{seq}` within study | `DEV-{seq}` within study |

Sequences via existing `doc_number_sequences` table. `CONCEPT` prefix used as the project code for concept studies.

---

## 12. Approval Workflow & Revision Control

### 12.1 Approval (Project Mode)
```
POST /api/hazop/studies/:id/submit   → status: draft → reviewed
POST /api/hazop/studies/:id/approve  → status: reviewed → approved
POST /api/hazop/studies/:id/reject   → status: reviewed/approved → draft
POST /api/hazop/studies/:id/release  → status: approved → released + GCS upload
POST /api/hazop/studies/:id/close    → status: released → closed
```
Approval requires role Manager / Senior Manager / General Manager / Superuser.  
Self-approval prohibited: `approver_id !== creator_id` enforced server-side.

### 12.2 Approval (Concept Mode)
```
POST /api/hazop/studies/:id/submit-proposal → status: draft → proposal
POST /api/hazop/studies/:id/withdraw        → status: proposal → draft
POST /api/hazop/studies/:id/convert         → status: proposal → converted (see §10)
```
Concept studies do not require formal approval — `proposal` indicates the engineer considers the study complete for pre-FEED purposes.

### 12.3 Revision Control (both modes)
- Status `released` (project) or `proposal` (concept): document frozen.
- To edit a frozen study: `POST /api/hazop/studies/:id/revise` → clones study with incremented revision, old status set to `superseded`.
- Every status transition writes to `hazop_revisions`.
- Revision sequence: `A → B → C … Z → AA → AB …`

---

## 13. Navigation Placement

Below **Automation Engineering** in `client/src/components/layout.tsx`.  
Inserted after Automation Engineering block, before Drawing Verification block.

```tsx
...(hasViewPermission("HAZOP") ? [{
  icon: ShieldAlert,
  label: "HAZOP",
  isSubmenu: true,
  isOpen: isHazopMenuOpen,
  toggle: () => setIsHazopMenuOpen(!isHazopMenuOpen),
  children: [
    { icon: BarChart4, label: "HAZOP Dashboard", href: "/hazop/dashboard" },
    { icon: GitBranch, label: "Process Loop Builder", href: "/hazop/loop-builder" },
    { icon: List, label: "HAZOP Worksheet", href: "/hazop/worksheet" },
    { icon: Shield, label: "Safety Functions", href: "/hazop/safety-functions" },
    { icon: Grid, label: "Cause & Effect Matrix", href: "/hazop/ce-matrix" },
    { icon: CheckSquare, label: "FAT/SAT", href: "/hazop/fat-sat" },
    { icon: FileText, label: "Action Register", href: "/hazop/actions" },
  ]
}] : []),
```

**New state variable:** `isHazopMenuOpen`  
**Module permission key:** `"HAZOP"`  
**Page key:** `"hazop"`

---

## 14. Role Permissions

Identical in both modes.

| Role | View | Create Study / Build Loops | Run Generation | Approve / Release | Delete (draft only) |
|---|---|---|---|---|---|
| Superuser | ✓ | ✓ | ✓ | ✓ | ✓ |
| General Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Senior Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Senior Executive | ✓ | ✓ | ✓ | ✗ | ✗ |
| Employee | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 15. API Structure

### 15.1 Study Management
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/projects/:projectId/studies` | List project-based studies for a project |
| GET | `/api/hazop/concept-studies` | List all concept studies (no project filter) |
| POST | `/api/hazop/studies` | Create study (body includes `study_mode`, optional `project_id`) |
| GET | `/api/hazop/studies/:studyId` | Get study detail |
| PATCH | `/api/hazop/studies/:studyId` | Update study header |
| POST | `/api/hazop/studies/:studyId/submit` | Submit for review (project mode) |
| POST | `/api/hazop/studies/:studyId/approve` | Approve (project mode) |
| POST | `/api/hazop/studies/:studyId/reject` | Reject (project mode) |
| POST | `/api/hazop/studies/:studyId/release` | Release + GCS upload (project mode) |
| POST | `/api/hazop/studies/:studyId/close` | Close (project mode) |
| POST | `/api/hazop/studies/:studyId/submit-proposal` | Submit as proposal (concept mode) |
| POST | `/api/hazop/studies/:studyId/withdraw` | Withdraw proposal (concept mode) |
| POST | `/api/hazop/studies/:studyId/convert` | Convert concept → project study |
| POST | `/api/hazop/studies/:studyId/revise` | Create new revision of frozen study |

### 15.2 Concept Equipment & Instruments (Concept Mode only)
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/concept-equipment` | List concept equipment |
| POST | `/api/hazop/studies/:studyId/concept-equipment` | Add concept equipment |
| PATCH | `/api/hazop/concept-equipment/:id` | Update |
| DELETE | `/api/hazop/concept-equipment/:id` | Delete (study in draft only) |
| GET | `/api/hazop/studies/:studyId/concept-instruments` | List concept instruments |
| POST | `/api/hazop/studies/:studyId/concept-instruments` | Add concept instrument |
| PATCH | `/api/hazop/concept-instruments/:id` | Update |
| DELETE | `/api/hazop/concept-instruments/:id` | Delete |
| GET | `/api/hazop/studies/:studyId/design-assumptions` | List assumptions |
| POST | `/api/hazop/studies/:studyId/design-assumptions` | Add assumption |
| PATCH | `/api/hazop/design-assumptions/:id` | Update |

### 15.3 Process Loop Builder
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/loops` | List loops |
| POST | `/api/hazop/studies/:studyId/loops` | Create loop |
| GET | `/api/hazop/loops/:loopId` | Get loop with steps |
| PATCH | `/api/hazop/loops/:loopId` | Update loop header |
| DELETE | `/api/hazop/loops/:loopId` | Delete (draft only) |
| GET | `/api/hazop/loops/:loopId/steps` | List steps |
| POST | `/api/hazop/loops/:loopId/steps` | Add step |
| PATCH | `/api/hazop/loop-steps/:stepId` | Update step |
| DELETE | `/api/hazop/loop-steps/:stepId` | Delete step |
| POST | `/api/hazop/loops/:loopId/reorder` | Reorder steps |

### 15.4 Equipment Pool Query (mode-aware)
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/equipment-pool?category={cat}` | Returns BUY list items (project mode) or concept equipment (concept mode) filtered by category |
| GET | `/api/hazop/studies/:studyId/instrument-pool` | Returns AE instrument register (project) or concept instruments (concept) |

### 15.5 Generation
| Method | Route | Action |
|---|---|---|
| POST | `/api/hazop/studies/:studyId/generate` | Generate HAZOP |
| POST | `/api/hazop/studies/:studyId/extract-safety-functions` | Extract SIFs |
| POST | `/api/hazop/studies/:studyId/generate-ce-matrix` | Build C&E matrix |
| POST | `/api/hazop/studies/:studyId/generate-fat-sat` | Generate FAT/SAT |

### 15.6 Worksheet, Safety Functions, C&E, FAT/SAT, Actions
*(Identical to v1.0 — all routes unchanged; all scoped to `study_id`)*

| Method | Route |
|---|---|
| GET | `/api/hazop/studies/:studyId/worksheet` |
| GET | `/api/hazop/nodes/:nodeId/deviations` |
| PATCH | `/api/hazop/deviations/:deviationId` |
| POST | `/api/hazop/deviations/:deviationId/causes` |
| DELETE | `/api/hazop/causes/:causeId` |
| POST | `/api/hazop/deviations/:deviationId/consequences` |
| POST | `/api/hazop/deviations/:deviationId/safeguards` |
| POST | `/api/hazop/deviations/:deviationId/actions` |
| PATCH | `/api/hazop/actions/:actionId` |
| GET | `/api/hazop/studies/:studyId/safety-functions` |
| PATCH | `/api/hazop/safety-functions/:sifId` |
| GET | `/api/hazop/studies/:studyId/ce-matrix` |
| PATCH | `/api/hazop/ce-matrix/cells/:cellId` |
| GET | `/api/hazop/studies/:studyId/fat-sat` |
| PATCH | `/api/hazop/fat-sat/:itemId` |

### 15.7 Export
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/export/worksheet` | Excel — HAZOP worksheet |
| GET | `/api/hazop/studies/:studyId/export/ce-matrix` | Excel — C&E matrix |
| GET | `/api/hazop/studies/:studyId/export/action-register` | Excel — action register |
| GET | `/api/hazop/studies/:studyId/export/fat-sat` | Excel — FAT/SAT checklist |
| GET | `/api/hazop/studies/:studyId/export/design-assumptions` | Excel — design basis / assumptions |

---

## 16. UI Pages

### 16.1 HAZOP Dashboard `/hazop/dashboard`
- Tabs: **Project Studies** / **Concept Studies**
- Project Studies tab: grouped by project — study number, status, loop count, deviation count, open actions.
- Concept Studies tab: list of all concept studies — title, status, loop count, open actions, conversion status.
- Progress indicators per study.
- "New Study" button → opens study creation dialog (mode selector: Project-Based vs Concept).

### 16.2 Study Creation Dialog (modal — not a separate page)
- **Mode selector** (first field): `Project-Based` / `Concept / Expected Project`
- If Project-Based: project selector dropdown (filterable).
- If Concept: title field + `concept_title` + design basis text.
- Study title, study leader, team members, process description.

### 16.3 Process Loop Builder `/hazop/loop-builder`
- Study selector at top — shows mode badge (`PROJECT` / `CONCEPT`).
- Left: loop list.
- Centre: step form — equipment_tag dropdown auto-populated from mode-appropriate pool (§9).
  - Concept Mode: shows concept tags from `hazop_concept_equipment` + inline "Add new concept equipment" link.
  - Project Mode: shows BUY list tags filtered by category.
- Right: live topology diagram.
- Concept Mode banner: "Concept Study — Using expected equipment. Tag assignments will be resolved on conversion to a project."

### 16.4 Concept Equipment Manager `/hazop/concept-equipment`
- Only visible/accessible for concept studies.
- CRUD table: concept_tag, category, role, estimated conditions, design_assumption.
- Instrument sub-table per equipment row.
- Design Assumptions section at bottom.

### 16.5 HAZOP Worksheet `/hazop/worksheet` (unchanged from v1.0)

### 16.6 Safety Functions `/hazop/safety-functions` (unchanged)

### 16.7 Cause & Effect Matrix `/hazop/ce-matrix` (unchanged)

### 16.8 FAT/SAT `/hazop/fat-sat`
- Concept Mode banner: "This FAT/SAT was generated from expected equipment. Verify tag assignments before use in an actual test."

### 16.9 Action Register `/hazop/actions` (unchanged)

### 16.10 Conversion Screen (modal — triggered from concept study detail)
- Shows conversion summary: loops to convert, steps with unmatched tags, assumptions to carry forward.
- Project selector.
- Tag resolution preview table: concept_tag → matched BUY list tag (or "Unmatched — manual resolution required").
- "Convert" button — fires `POST /api/hazop/studies/:id/convert`.
- Post-conversion redirect to the new project-based study.

---

## 17. New Server Files

| File | Purpose |
|---|---|
| `server/hazop-routes.ts` | All HAZOP API routes (mode-aware) |
| `server/hazop-generation-service.ts` | HAZOP auto-generation engine (resolves equipment pool per mode) |
| `server/hazop-sif-service.ts` | SIF extraction + C&E matrix generation |
| `server/hazop-fat-sat-service.ts` | FAT/SAT auto-generation |
| `server/hazop-export-service.ts` | Excel exports for all HAZOP documents |
| `server/hazop-conversion-service.ts` | Concept → Project conversion logic (atomic transaction) |
| `server/hazop-deviation-library.ts` | Deviation library seed data (static) |

---

## 18. New Client Files

| File | Purpose |
|---|---|
| `client/src/pages/hazop/hazop-dashboard.tsx` | Dashboard with Project / Concept tabs |
| `client/src/pages/hazop/process-loop-builder.tsx` | Loop Builder (mode-aware equipment selector) |
| `client/src/pages/hazop/concept-equipment-page.tsx` | Concept Equipment Manager |
| `client/src/pages/hazop/hazop-worksheet.tsx` | HAZOP Worksheet |
| `client/src/pages/hazop/safety-functions-page.tsx` | Safety Functions |
| `client/src/pages/hazop/ce-matrix-page.tsx` | Cause & Effect Matrix |
| `client/src/pages/hazop/hazop-fat-sat-page.tsx` | FAT/SAT |
| `client/src/pages/hazop/action-register-page.tsx` | Action Register |
| `client/src/lib/hazop-topology.ts` | Flowchart topology builder (pure function) |
| `client/src/lib/hazop-mode.ts` | Mode utilities: `isConceptMode(study)`, `isProjectMode(study)`, `getStudyPrefix(study)` |

---

## 19. Schema Migration

### 19.1 Table Status
`hazop_studies` is a **new table**. v1.0 of this plan was never implemented — no HAZOP tables exist in the database. All 20 tables listed below are new additions.

### 19.2 New Tables — Complete List (20 total)

| # | Table | Purpose |
|---|---|---|
| 1 | `hazop_studies` | Study header — supports both modes via `study_mode` field |
| 2 | `hazop_concept_equipment` | Manually created expected equipment (Concept Mode only) |
| 3 | `hazop_concept_instruments` | Expected instruments (Concept Mode only) |
| 4 | `hazop_design_assumptions` | Design basis assumptions (both modes) |
| 5 | `hazop_process_loops` | Named process loops within a study |
| 6 | `hazop_process_steps` | Equipment steps within a loop |
| 7 | `hazop_nodes` | Auto-generated HAZOP analysis node per step |
| 8 | `hazop_deviations` | Deviations per node (guideword × parameter) |
| 9 | `hazop_causes` | Causes per deviation |
| 10 | `hazop_consequences` | Consequences per deviation |
| 11 | `hazop_safeguards` | Existing safeguards per deviation |
| 12 | `hazop_actions` | Recommended actions per deviation |
| 13 | `hazop_safety_functions` | Extracted Safety Instrumented Functions (SIFs) |
| 14 | `hazop_ce_matrix` | Cause & Effect Matrix header |
| 15 | `hazop_ce_causes` | Cause rows of the C&E matrix |
| 16 | `hazop_ce_effects` | Effect columns of the C&E matrix |
| 17 | `hazop_ce_cells` | Cell values (cause × effect intersections) |
| 18 | `hazop_fat_sat_items` | FAT/SAT test items |
| 19 | `hazop_revisions` | Revision log for study documents |
| 20 | `hazop_deviation_library` | Reference library (seeded at deployment, read-only at runtime) |

**No existing tables are modified.**

### 19.3 Migration Notes
- All 20 tables created via `drizzle-kit push:pg` after adding to `shared/schema.ts`.
- `hazop_deviation_library` seeded by `server/scripts/seed-hazop-library.ts` — run once after push.
- Document sequences (`HAZOP`, `SIF`, `CEM`, `HAZFAT`, `HAZSAT`) inserted into `doc_number_sequences` on first use. `CONCEPT` is a reserved synthetic prefix for concept-mode document numbers — must not be used as a real project code.

---

## 20. GCS Document Governance
On `release` (project mode):  
`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/HAZOP/{docType}-rev{revision}.xlsx`

On `proposal` export (concept mode):  
`TPEL/CONCEPT/{study_number}/{docType}-rev{revision}.xlsx`

Governed by `docs/gcs-governance-rev5-option-c-baseline.md`. Both paths go through the existing GCS governance layer.

---

## 21. Audit Logging

Every state change, generation event, and conversion writes to audit log:

| Event | `action` value |
|---|---|
| Study created | `create` |
| Study status changed | `status_change` |
| HAZOP generated | `generate` |
| SIF extracted | `extract_sif` |
| C&E matrix generated | `generate_ce` |
| FAT/SAT generated | `generate_fat_sat` |
| Concept → Project converted | `convert` |
| Deviation marked not-credible | `credibility_change` |
| Action closed | `action_close` |
| Document released | `release` |

Fields: `entity_type`, `entity_id`, `action`, `changed_by`, `changed_at`, `old_value` (JSON), `new_value` (JSON).

---

## 22. Zero-Trust Audit Checklist

| Check | Rule |
|---|---|
| All routes use `ensureAuthenticated` | No unauthenticated access |
| Module routes use `hasViewPermission("HAZOP")` | Page-level gate |
| Approve/release routes check role >= Manager | Enforced server-side |
| Self-approval blocked | `approver_id !== creator_id` server-side |
| `project_id` NOT NULL enforced for `project_based` mode | Server-side check on INSERT/UPDATE |
| `buy_list_line_id` and `concept_equipment_id` mutually exclusive | Server-side check on step INSERT/UPDATE |
| Converted concept studies are read-only | All PATCH/DELETE routes check `status !== 'converted'` |
| Conversion is atomic | Single DB transaction; full rollback on any failure |
| Library seed is read-only at runtime | No API route exposes INSERT/UPDATE on `hazop_deviation_library` |
| Generation is idempotent | UNIQUE on `(node_id, guideword, parameter)` |
| `pg_advisory_xact_lock(studyId)` on all batch generation | No concurrent generation collision |
| GCS upload only on `released` (project) or explicit export trigger (concept) | Pre-release documents never auto-uploaded |
| SIF numbers unique globally | UNIQUE on `(study_number_prefix, sif_seq)` via sequence service |
| All step fields from controlled vocabulary | Enum check server-side before DB insert |

---

## 23. Implementation Phases

### Phase 1 — Foundation (both modes)
- DB schema (all 20 tables)
- Deviation library seed script
- Study CRUD (both modes)
- Study creation dialog with mode selector
- Navigation entry
- HAZOP Dashboard (Project + Concept tabs)

### Phase 2 — Concept Equipment + Loop Builder
- Concept Equipment Manager (CRUD)
- Concept Instruments (CRUD)
- Design Assumptions (CRUD)
- Process Loop Builder UI (mode-aware equipment dropdown)
- Loop topology diagram

### Phase 3 — HAZOP Engine
- Equipment pool resolver (mode-aware)
- Auto-generation engine
- HAZOP Worksheet UI (read + inline edit)
- Action Register UI

### Phase 4 — Safety Functions & C&E
- SIF extraction engine
- C&E matrix generation
- Safety Functions UI
- C&E Matrix UI (grid view)

### Phase 5 — FAT/SAT + Exports
- FAT/SAT generation
- FAT/SAT UI
- Excel exports (all document types + design assumptions)

### Phase 6 — Conversion + Governance
- Concept → Project conversion service
- Conversion screen UI
- Approval workflow (both modes)
- Revision control
- GCS upload on release
- Full audit logging

---

## 24. Risk Analysis

| Risk | Mitigation |
|---|---|
| Concept tag `P-101` does not match BUY list tag `P-101A` on conversion | Tag resolution preview shown to user before conversion; unmatched steps flagged; not a hard block |
| Concept study converted to wrong project | Conversion requires explicit project selection + confirmation dialog showing project code + name |
| SIF number collision between concept and project sequences | `CONCEPT` prefix is a reserved code in `doc_number_sequences`; project codes never start with `CONCEPT` |
| Large concept study conversion (100+ steps) | Conversion runs in background job; result notified to user; full rollback on failure |
| User edits concept study after proposal status | `proposal` status prevents edits; requires explicit `withdraw` to return to draft |
| Design assumptions lost on conversion | `preserved_on_conversion = true` is default; user must explicitly opt out |

---

## 25. Rollback Strategy
1. All 20 tables are additive — `DROP TABLE hazop_*` in FK order restores original state.
2. Navigation block removal: revert one block in `layout.tsx`.
3. Route removal: remove `import` of `hazop-routes.ts` from `server/routes.ts`.
4. No existing tables modified.

---

## 26. Future Expansion

| Feature | Description |
|---|---|
| SIL Assessment | Add SIL target to `hazop_safety_functions`; IEC 61508/61511 demand rate inputs |
| LOPA | Extend SIF records with IPF credit columns |
| P&ID Markup Export | Export loop topology as SVG reference sketch |
| SCADA Integration | Link SIF final element tags to `ae_scada_tags` — auto-create SCADA alarms |
| Pre-FEED Report | Auto-generate pre-FEED process safety report from concept study for client submission |

---

## 27. Validation Checklist (Pre-Implementation Gate)

- [ ] `project_buy_list_lines.tag_no` confirmed — all tagged lines available for equipment pool dropdown in project mode.
- [ ] `buy_subgroups.code` confirmed for category-to-subgroup mapping.
- [ ] `doc_number_sequences` insertion method confirmed — new prefixes `HAZOP`, `SIF`, `CEM`, `HAZFAT`, `HAZSAT`, `CONCEPT` (as synthetic prefix).
- [ ] `hasViewPermission` and `hasPageAccess` function signatures confirmed.
- [ ] GCS governance path for concept mode (`TPEL/CONCEPT/…`) confirmed as acceptable under `docs/gcs-governance-rev5-option-c-baseline.md` — if not acceptable, alternative path must be agreed.
- [ ] `pg_advisory_xact_lock` key strategy confirmed: use `study_id` (integer) as lock key for all HAZOP generation and conversion operations.
- [ ] Approval to add `isHazopMenuOpen` state variable and `ShieldAlert`, `GitBranch`, `Grid` Lucide icons in `layout.tsx`.
- [ ] New module permission `"HAZOP"` insertion method into permissions table confirmed.
- [ ] Deviation library seed data (200+ entries) reviewed and approved before Phase 1 DB push.
- [ ] Concept mode GCS path governance exception (no project code in path) explicitly approved.
- [ ] Confirmed that `CONCEPT` is not a valid/existing project code in the system (to avoid sequence collision).

---

*Plan v2.0 saved. Supersedes v1.0. No implementation has occurred. Implementation requires explicit approval per `docs/operating-protocol-v1.0.md` §2.*
