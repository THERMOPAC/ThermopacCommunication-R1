# HAZOP Module — Execution Plan v1.0
# Deterministic Process Intelligence Engine

**Status:** PLAN — NOT IMPLEMENTED  
**Date:** 2026-05-24  
**Author:** THERMOPAC QMS Agent  
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 1. Design Philosophy

### 1.1 Core Principle
This module is a **Deterministic Process Intelligence Engine**, not a spreadsheet form.

**What this means:**
- The system does NOT read P&IDs automatically.
- The user manually builds a Process Loop using controlled dropdown fields.
- Given a complete Process Loop, the system deterministically applies HAZOP methodology rules to auto-generate deviations, causes, consequences, safeguards, and recommended actions.
- Same input → same output. No AI inference, no guessing.

### 1.2 What is NOT in scope
- Automatic P&ID parsing or OCR
- Free-text HAZOP entry (all fields are controlled vocabulary)
- Risk matrix or risk ranking (SIL assignment is a future phase)
- Quantitative risk analysis

### 1.3 Primary Flow
```
BUY List
  └─► Equipment Pool (tagged items auto-populated from BUY List)
        └─► Process Loop Builder (user manually sequences equipment)
              └─► HAZOP Auto-Generation Engine
                    ├─► Deviations (Guideword × Parameter per step)
                    │     ├─► Causes
                    │     ├─► Consequences
                    │     ├─► Safeguards (existing)
                    │     └─► Recommended Actions
                    ├─► Safety Function Extraction
                    │     └─► Safety Instrumented Functions (SIFs)
                    ├─► Cause & Effect Matrix
                    │     ├─► Cause rows (process trips/alarms)
                    │     └─► Effect columns (actuator actions)
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
| NO | ✓ High Flow | ✗ | ✗ | ✗ | ✗ | ✗ |
| MORE | ✓ High Flow | ✓ High Pressure | ✓ High Temperature | ✓ High Level | ✓ Contamination | ✗ |
| LESS | ✓ Low Flow | ✓ Low Pressure | ✓ Low Temperature | ✓ Low Level | ✓ Off-spec | ✗ |
| REVERSE | ✓ Reverse Flow | ✗ | ✗ | ✗ | ✗ | ✗ |
| OTHER_THAN | ✗ | ✗ | ✗ | ✗ | ✓ Wrong fluid | ✓ Phase change |
| AS_WELL_AS | ✗ | ✗ | ✗ | ✗ | ✓ Ingress | ✗ |
| PART_OF | ✗ | ✗ | ✗ | ✗ | ✓ Partial mix | ✓ Two-phase |

Full matrix defined in `server/hazop-deviation-library.ts` — all combinations with `applicable: boolean` flag.

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
| Next Loop | — (transition node, no deviations generated) |

---

## 4. Deviation Library — Standard Causes, Consequences, Safeguards

### 4.1 Library Structure
Stored in `hazop_deviation_library` table (seeded at deployment).  
Each record = `(equipment_category, guideword, parameter) → { typical_causes[], typical_consequences[], typical_safeguards[], typical_actions[] }`.

### 4.2 Example Entries

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

Full library: 200+ entries covering all `(equipment_category, guideword, parameter)` meaningful combinations, defined in `server/hazop-deviation-library.ts` and seeded into `hazop_deviation_library` table.

---

## 5. Database Schema

### 5.1 New Tables

#### `hazop_studies`
Study header — one per project.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| project_id | int FK projects.id NOT NULL | |
| study_number | varchar(50) NOT NULL | e.g. `2627-018-HAZOP-001` |
| title | varchar(200) NOT NULL | |
| revision | varchar(10) NOT NULL DEFAULT `A` | |
| status | varchar(20) NOT NULL DEFAULT `draft` | `draft` / `in_progress` / `completed` / `released` |
| study_leader | int FK users.id | |
| team_members | jsonb | Array of user IDs |
| study_date | date | |
| process_description | text | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |
| created_by | int FK users.id | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(project_id, study_number)`

---

#### `hazop_process_loops`
A named process loop (HAZOP node) within a study.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| project_id | int NOT NULL | |
| loop_number | int NOT NULL | Sequential within study — 1, 2, 3… |
| loop_name | varchar(200) NOT NULL | e.g. `Pump Feed Circuit — Tank-101 to P-101 to V-201` |
| design_intent | text | What this loop is supposed to do |
| fluid | varchar(100) | Primary fluid |
| operating_pressure_min | numeric | barg |
| operating_pressure_max | numeric | barg |
| operating_temp_min | numeric | °C |
| operating_temp_max | numeric | °C |
| status | varchar(20) DEFAULT `draft` | `draft` / `complete` / `hazop_generated` |
| sort_order | int NOT NULL | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

---

#### `hazop_process_steps`
One row per equipment step in a loop. This is the manually-built process topology.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| loop_id | int FK hazop_process_loops.id NOT NULL | |
| project_id | int NOT NULL | |
| sequence_no | int NOT NULL | User-set order within loop — 1, 2, 3… |
| equipment_category | varchar(50) NOT NULL | Controlled vocabulary — see §6.1 |
| equipment_tag | varchar(50) | From BUY list tag_no — nullable if utility/drain/vent |
| buy_list_line_id | int FK project_buy_list_lines.id | Null for virtual steps |
| equipment_role | varchar(100) | Free text — e.g. `Feed Pump`, `Inlet Isolation` |
| connection_type | varchar(50) NOT NULL | Controlled — see §6.2 |
| from_step | int | sequence_no of upstream step (null = loop inlet) |
| to_step | int | sequence_no of downstream step (null = loop outlet) |
| outlet_type | varchar(50) | Controlled — see §6.3 |
| outlet_destination | varchar(50) NOT NULL | Controlled — see §6.4 |
| outlet_destination_ref | varchar(100) | For step references: `LOOP-{n}-STEP-{n}` |
| operating_pressure | numeric | barg |
| operating_temperature | numeric | °C |
| fluid | varchar(100) | |
| remarks | text | |
| sort_order | int NOT NULL | Must match sequence_no on save |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(loop_id, sequence_no)`

---

#### `hazop_nodes`
Auto-generated HAZOP analysis nodes — one per process step.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| loop_id | int FK hazop_process_loops.id NOT NULL | |
| step_id | int FK hazop_process_steps.id NOT NULL | |
| node_reference | varchar(100) NOT NULL | e.g. `LOOP-1-STEP-3` |
| node_description | varchar(300) | Auto-built from equipment_category + tag + role |
| deviation_count | int DEFAULT 0 | Populated after generation |
| action_count | int DEFAULT 0 | |
| generated_at | timestamp | |
| generated_by | int FK users.id | |

---

#### `hazop_deviations`
One row per generated deviation (guideword × parameter per node).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| node_id | int FK hazop_nodes.id NOT NULL | |
| study_id | int FK hazop_studies.id NOT NULL | |
| deviation_number | varchar(50) NOT NULL | e.g. `DEV-001` within study |
| guideword | varchar(20) NOT NULL | Controlled — see §2.1 |
| parameter | varchar(20) NOT NULL | Controlled — see §2.2 |
| deviation_description | varchar(200) NOT NULL | e.g. `High Flow` |
| is_credible | boolean DEFAULT true | Engineer can mark as not credible |
| credibility_reason | text | Required if is_credible = false |
| reviewed | boolean DEFAULT false | |
| reviewed_by | int FK users.id | |
| reviewed_at | timestamp | |
| created_at | timestamp DEFAULT NOW() | |

UNIQUE: `(node_id, guideword, parameter)`

---

#### `hazop_causes`
Causes per deviation — may be library-seeded or user-added.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| deviation_id | int FK hazop_deviations.id NOT NULL | |
| cause_number | int NOT NULL | |
| cause_description | text NOT NULL | |
| source | varchar(10) DEFAULT `library` | `library` / `manual` |
| deleted | boolean DEFAULT false | Soft delete — engineer can remove library causes |

---

#### `hazop_consequences`
Consequences per deviation.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| deviation_id | int FK hazop_deviations.id NOT NULL | |
| consequence_number | int NOT NULL | |
| consequence_description | text NOT NULL | |
| severity | varchar(20) | `catastrophic` / `critical` / `marginal` / `negligible` |
| source | varchar(10) DEFAULT `library` | `library` / `manual` |
| deleted | boolean DEFAULT false | |

---

#### `hazop_safeguards`
Existing safeguards per deviation.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| deviation_id | int FK hazop_deviations.id NOT NULL | |
| safeguard_number | int NOT NULL | |
| safeguard_description | text NOT NULL | |
| safeguard_type | varchar(30) | `instrumented` / `mechanical` / `procedural` / `alarm` |
| tag_ref | varchar(50) | Instrument tag providing this safeguard (from BUY list) |
| source | varchar(10) DEFAULT `library` | `library` / `manual` |
| deleted | boolean DEFAULT false | |

---

#### `hazop_actions`
Recommended actions per deviation.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| deviation_id | int FK hazop_deviations.id NOT NULL | |
| action_number | int NOT NULL | Unique within study for tracking |
| action_description | text NOT NULL | |
| action_type | varchar(30) | `engineering` / `procedural` / `instrumentation` / `further_study` |
| assigned_to | int FK users.id | |
| due_date | date | |
| status | varchar(20) DEFAULT `open` | `open` / `closed` / `deferred` |
| close_comments | text | |
| closed_at | timestamp | |
| source | varchar(10) DEFAULT `library` | `library` / `manual` |

---

#### `hazop_safety_functions`
Safety Instrumented Functions (SIFs) extracted from HAZOP actions/safeguards.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| project_id | int NOT NULL | |
| sif_number | varchar(50) NOT NULL | e.g. `2627-018-SIF-001` |
| sif_description | varchar(300) NOT NULL | e.g. `High Pressure Shutdown — P-101 outlet` |
| initiating_cause | text NOT NULL | The demand condition |
| initiator_tag | varchar(50) | Sensor/switch tag |
| initiator_condition | varchar(100) | e.g. `PT101 > 10 barg` |
| final_element_tag | varchar(50) | Valve / motor tag |
| final_element_action | varchar(100) | e.g. `Close XV201, Stop P101` |
| sif_type | varchar(30) | `shutdown` / `alarm` / `permissive` / `interlock` |
| safety_critical | boolean DEFAULT false | |
| source_deviation_id | int FK hazop_deviations.id | |
| source_action_id | int FK hazop_actions.id | |
| sil_target | varchar(10) | NULL until SIL assessment phase |
| status | varchar(20) DEFAULT `draft` | |
| created_at | timestamp DEFAULT NOW() | |
| updated_at | timestamp DEFAULT NOW() | |

UNIQUE: `(study_id, sif_number)`

---

#### `hazop_ce_matrix`
Cause & Effect Matrix header — one per study.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL UNIQUE | |
| project_id | int NOT NULL | |
| matrix_number | varchar(50) NOT NULL | e.g. `2627-018-CEM-001` |
| revision | varchar(10) DEFAULT `A` | |
| status | varchar(20) DEFAULT `draft` | |
| generated_at | timestamp | |
| approved_by | int FK users.id | |
| approved_at | timestamp | |
| created_at | timestamp DEFAULT NOW() | |

---

#### `hazop_ce_causes`
Cause rows of the C&E matrix.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| matrix_id | int FK hazop_ce_matrix.id NOT NULL | |
| row_number | int NOT NULL | Display order |
| cause_tag | varchar(50) NOT NULL | Initiator instrument tag |
| cause_description | varchar(200) NOT NULL | |
| cause_condition | varchar(100) | e.g. `> 10 barg`, `= 1 (closed)` |
| cause_type | varchar(20) | `alarm` / `trip` / `permissive` |
| source_sif_id | int FK hazop_safety_functions.id | |

---

#### `hazop_ce_effects`
Effect columns of the C&E matrix.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| matrix_id | int FK hazop_ce_matrix.id NOT NULL | |
| col_number | int NOT NULL | Display order |
| effect_tag | varchar(50) NOT NULL | Final element tag |
| effect_description | varchar(200) NOT NULL | |
| effect_action | varchar(50) | `close` / `open` / `stop` / `start` / `alarm` / `trip` |
| source_sif_id | int FK hazop_safety_functions.id | |

---

#### `hazop_ce_cells`
Cell values at (cause row × effect column) intersections.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| matrix_id | int FK hazop_ce_matrix.id NOT NULL | |
| cause_id | int FK hazop_ce_causes.id NOT NULL | |
| effect_id | int FK hazop_ce_effects.id NOT NULL | |
| action | varchar(10) | `X` = trip / `A` = alarm / `I` = interlock / NULL = no action |
| time_delay_sec | int DEFAULT 0 | |
| notes | varchar(200) | |

UNIQUE: `(cause_id, effect_id)`

---

#### `hazop_deviation_library`
Reference library for auto-generation — seeded at deployment, read-only at runtime.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| equipment_category | varchar(50) NOT NULL | |
| guideword | varchar(20) NOT NULL | |
| parameter | varchar(20) NOT NULL | |
| applicable | boolean NOT NULL DEFAULT true | |
| deviation_description | varchar(200) NOT NULL | |
| typical_causes | jsonb NOT NULL | Array of strings |
| typical_consequences | jsonb NOT NULL | Array of strings |
| typical_safeguards | jsonb NOT NULL | Array of `{description, type, tag_hint}` |
| typical_actions | jsonb NOT NULL | Array of `{description, type}` |
| version | int NOT NULL DEFAULT 1 | Library version |

UNIQUE: `(equipment_category, guideword, parameter)`

---

#### `hazop_fat_sat_items`
FAT/SAT test items derived from the C&E matrix safety functions.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| project_id | int NOT NULL | |
| checklist_type | varchar(5) NOT NULL | `FAT` / `SAT` |
| item_number | int NOT NULL | |
| sif_id | int FK hazop_safety_functions.id | |
| cause_id | int FK hazop_ce_causes.id | |
| effect_id | int FK hazop_ce_effects.id | |
| test_description | text NOT NULL | Auto-generated: `Apply {cause_condition} on {cause_tag} — verify {effect_action} on {effect_tag}` |
| expected_result | varchar(300) | |
| actual_result | varchar(300) | |
| status | varchar(20) DEFAULT `not_tested` | `not_tested` / `pass` / `fail` / `na` |
| remarks | text | |
| tested_by | int FK users.id | |
| tested_at | timestamp | |

---

#### `hazop_revisions`
Revision log for study documents.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| study_id | int FK hazop_studies.id NOT NULL | |
| document_type | varchar(30) | `study` / `loop` / `ce_matrix` / `fat_sat` |
| revision | varchar(10) NOT NULL | |
| change_description | text NOT NULL | |
| changed_by | int FK users.id NOT NULL | |
| changed_at | timestamp DEFAULT NOW() | |

---

## 6. Controlled Vocabulary

### 6.1 Equipment Category (exact values stored in DB)
```
Tank | Pump | Heat Exchanger | Heater | Vessel | Column | Separator
Filter | Control Valve | Isolation Valve | Check Valve | Instrument
Utility System | Drain | Vent | Product Outlet | Waste Outlet | Next Loop
```

### 6.2 Connection Type
```
Pipe (flanged) | Pipe (screwed) | Pipe (welded) | Flexible hose
Instrumentation line | Electrical signal | Mechanical link | Virtual (logic only)
```

### 6.3 Outlet Type
```
Process outlet | Recycle | Bypass | Drain | Vent | Relief
Overflow | Sample point | Instrument tap | Loop transition
```

### 6.4 Outlet Destination (controlled)
| Value stored | Description |
|---|---|
| `next_step` | Proceeds to the immediately next sequence step |
| `prev_step` | Returns to the immediately previous sequence step |
| `start_of_loop` | Returns to sequence_no = 1 of this loop |
| `specific_step` | A specific earlier step (reference stored in `outlet_destination_ref`) |
| `next_loop` | Feeds into the next process loop |
| `recycle` | Recycle back to a referenced step/loop |
| `bypass` | Bypasses one or more steps (reference stored in `outlet_destination_ref`) |
| `drain` | To drain system |
| `vent` | To vent system |
| `product_outlet` | Final product outlet — loop terminates |
| `waste_outlet` | Waste stream — loop terminates |

---

## 7. Process Loop Builder — UI Interaction Rules

### 7.1 Step Creation Rules
1. Step 1 of every loop must start with a source (Tank, Vessel, Separator, Utility System, or transition from another loop).
2. Each step's `from_step` must reference an existing earlier sequence_no within the same loop, or be null (first step).
3. Each step's `to_step` is auto-set = sequence_no + 1 unless `outlet_destination` is not `next_step`.
4. `Next Loop` equipment category = terminal step — no deviations generated for it; it creates a loop transition reference only.
5. Drain / Vent / Product Outlet / Waste Outlet = terminal steps — loop ends here.

### 7.2 Validation Before HAZOP Generation
- Every step must have `equipment_category` set.
- Every non-terminal step must have `to_step` or `outlet_destination` set.
- Every tagged step (`equipment_category` not in `{Drain, Vent, Next Loop}`) should have `equipment_tag` set. Warning issued if missing — not a hard block.
- Loop must have at least 2 steps.

### 7.3 Loop Topology Diagram
The UI renders the loop as a vertical flowchart using step sequence, showing:
- Equipment boxes (color-coded by category)
- Arrows between steps
- Branch arrows for Recycle / Bypass
- Terminal boxes for Drain / Vent / Outlet

---

## 8. HAZOP Auto-Generation Engine

### 8.1 Trigger
`POST /api/hazop/studies/:studyId/generate`  
Optional: `{ loopId?: number }` — generate for one loop only.

### 8.2 Algorithm
```
FOR each loop in study (or target loop):
  FOR each step in loop ORDER BY sequence_no:
    skip if equipment_category IN ('Drain','Vent','Next Loop','Product Outlet','Waste Outlet')
    
    1. Create hazop_nodes record for this step
    
    2. Lookup applicable parameters for equipment_category (§3 map)
    
    FOR each applicable parameter:
      FOR each guideword:
        3. Lookup (equipment_category, guideword, parameter) in hazop_deviation_library
           IF applicable = false → skip (no record created)
           IF not found → skip with server-side warning log
        
        4. INSERT hazop_deviations (deviation_number = DEV-{seq}, guideword, parameter, deviation_description)
        
        5. FOR each item in typical_causes → INSERT hazop_causes (source = 'library')
        6. FOR each item in typical_consequences → INSERT hazop_consequences (source = 'library')
        7. FOR each item in typical_safeguards:
             - Match tag_hint against BUY list tags for this project
             - If match found → set tag_ref on safeguard record
             INSERT hazop_safeguards (source = 'library')
        8. FOR each item in typical_actions → INSERT hazop_actions (source = 'library', status = 'open')
    
    9. UPDATE hazop_nodes.deviation_count, action_count
  
  10. UPDATE hazop_process_loops.status = 'hazop_generated'
```

### 8.3 Idempotency
Re-generation on same loop:
- Deviations already present (unique on `node_id, guideword, parameter`) → skip.
- New steps added to loop since last generation → generate for new steps only.
- Deleted steps → orphaned nodes remain but are marked `deleted = true`.

### 8.4 Safety Function Extraction (separate trigger)
`POST /api/hazop/studies/:studyId/extract-safety-functions`

Rules:
1. Scan all `hazop_safeguards` WHERE `safeguard_type = 'instrumented'` AND `deleted = false`.
2. Scan all `hazop_actions` WHERE `action_type = 'instrumentation'` AND `deleted = false`.
3. For each unique `(initiator_tag, final_element_tag)` pair → insert one `hazop_safety_functions` record.
4. Duplicate pairs → skip (idempotent).
5. `sif_number` assigned sequentially: `{project_code}-SIF-{seq}`.

### 8.5 C&E Matrix Generation (separate trigger)
`POST /api/hazop/studies/:studyId/generate-ce-matrix`

Rules:
1. For each `hazop_safety_functions` record in the study:
   - If `initiator_tag` not already in `hazop_ce_causes` → insert cause row.
   - If `final_element_tag` + `final_element_action` not already in `hazop_ce_effects` → insert effect column.
   - Insert `hazop_ce_cells` cell: action = `X` for trip SIFs, `A` for alarm SIFs, `I` for interlock SIFs.

### 8.6 FAT/SAT Generation (separate trigger)
`POST /api/hazop/studies/:studyId/generate-fat-sat?type=FAT|SAT`

Rules:
1. For each `hazop_ce_cells` record WHERE action IS NOT NULL:
   - Auto-generate `test_description`:  
     `Apply {cause_condition} on {cause_tag} — verify {effect_action} on {effect_tag}`
   - Insert `hazop_fat_sat_items`.
2. Idempotent — skip if `(study_id, cause_id, effect_id, checklist_type)` already exists.

---

## 9. Document Numbering
| Document | Prefix | Example |
|---|---|---|
| HAZOP Study | `HAZOP` | `2627-018-HAZOP-001` |
| Safety Instrumented Function | `SIF` | `2627-018-SIF-001` |
| Cause & Effect Matrix | `CEM` | `2627-018-CEM-001` |
| FAT Checklist | `HAZFAT` | `2627-018-HAZFAT-001` |
| SAT Checklist | `HAZSAT` | `2627-018-HAZSAT-001` |
| Deviation Number | `DEV` | `DEV-001` (within study) |

---

## 10. Navigation Placement

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

## 11. Role Permissions

| Role | View | Create/Edit Process Loop | Run Generation | Approve/Release | Delete |
|---|---|---|---|---|---|
| Superuser | ✓ | ✓ | ✓ | ✓ | ✓ |
| General Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Senior Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Manager | ✓ | ✓ | ✓ | ✓ | ✗ |
| Senior Executive | ✓ | ✓ | ✓ | ✗ | ✗ |
| Employee | ✓ | ✗ | ✗ | ✗ | ✗ |

---

## 12. API Structure

### 12.1 Study Management
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/projects/:projectId/studies` | List studies |
| POST | `/api/hazop/projects/:projectId/studies` | Create study |
| GET | `/api/hazop/studies/:studyId` | Get study detail |
| PATCH | `/api/hazop/studies/:studyId` | Update study |
| POST | `/api/hazop/studies/:studyId/submit` | Submit for approval |
| POST | `/api/hazop/studies/:studyId/approve` | Approve |
| POST | `/api/hazop/studies/:studyId/release` | Release + GCS upload |

### 12.2 Process Loop Builder
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/loops` | List loops |
| POST | `/api/hazop/studies/:studyId/loops` | Create loop |
| GET | `/api/hazop/loops/:loopId` | Get loop with all steps |
| PATCH | `/api/hazop/loops/:loopId` | Update loop header |
| DELETE | `/api/hazop/loops/:loopId` | Delete loop (draft only) |
| GET | `/api/hazop/loops/:loopId/steps` | List steps |
| POST | `/api/hazop/loops/:loopId/steps` | Add step |
| PATCH | `/api/hazop/loop-steps/:stepId` | Update step |
| DELETE | `/api/hazop/loop-steps/:stepId` | Delete step |
| POST | `/api/hazop/loops/:loopId/reorder` | Reorder steps |

### 12.3 HAZOP Generation
| Method | Route | Action |
|---|---|---|
| POST | `/api/hazop/studies/:studyId/generate` | Generate HAZOP from all loops |
| POST | `/api/hazop/studies/:studyId/extract-safety-functions` | Extract SIFs |
| POST | `/api/hazop/studies/:studyId/generate-ce-matrix` | Build C&E matrix |
| POST | `/api/hazop/studies/:studyId/generate-fat-sat` | Generate FAT/SAT skeleton |

### 12.4 HAZOP Worksheet (read + edit)
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/worksheet` | Full worksheet (nodes + deviations) |
| GET | `/api/hazop/nodes/:nodeId/deviations` | Deviations for one node |
| PATCH | `/api/hazop/deviations/:deviationId` | Update credibility, reviewed flag |
| POST | `/api/hazop/deviations/:deviationId/causes` | Add manual cause |
| DELETE | `/api/hazop/causes/:causeId` | Soft-delete cause |
| POST | `/api/hazop/deviations/:deviationId/consequences` | Add manual consequence |
| POST | `/api/hazop/deviations/:deviationId/safeguards` | Add manual safeguard |
| POST | `/api/hazop/deviations/:deviationId/actions` | Add manual action |
| PATCH | `/api/hazop/actions/:actionId` | Update action (assign, close) |

### 12.5 Safety Functions
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/safety-functions` | List SIFs |
| PATCH | `/api/hazop/safety-functions/:sifId` | Update SIF |

### 12.6 Cause & Effect Matrix
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/ce-matrix` | Full matrix (causes + effects + cells) |
| PATCH | `/api/hazop/ce-matrix/cells/:cellId` | Update cell action |

### 12.7 FAT/SAT
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/fat-sat` | List items by type |
| PATCH | `/api/hazop/fat-sat/:itemId` | Record test result |

### 12.8 Export
| Method | Route | Action |
|---|---|---|
| GET | `/api/hazop/studies/:studyId/export/worksheet` | Excel — HAZOP worksheet |
| GET | `/api/hazop/studies/:studyId/export/ce-matrix` | Excel — C&E matrix |
| GET | `/api/hazop/studies/:studyId/export/action-register` | Excel — action register |
| GET | `/api/hazop/studies/:studyId/export/fat-sat` | Excel — FAT/SAT checklist |

---

## 13. UI Pages

### 13.1 HAZOP Dashboard `/hazop/dashboard`
- Per-project study list: study number, status, loop count, deviation count, open actions.
- Progress indicators: loops built / generated / reviewed / approved.
- Quick-access: open action items count with link to action register.

### 13.2 Process Loop Builder `/hazop/loop-builder`
- Left panel: study selector + loop list (add/delete loops).
- Centre panel: step-by-step form for adding/editing steps.
  - All fields are controlled dropdowns (§6).
  - `equipment_tag` dropdown pulls from project BUY list tags filtered by category mapping.
  - `outlet_destination` = `specific_step` → secondary dropdown shows available sequence_nos in loop.
- Right panel: live flowchart topology diagram rendered from saved steps.
  - Boxes color-coded: Pump=blue, Tank=green, Valve=orange, Instrument=purple, Terminal=grey.
  - Arrows show flow direction and outlet type.
  - Validation warnings shown inline (missing tags, open-ended paths).
- "Ready for HAZOP" button — validates loop and marks status = `complete`.

### 13.3 HAZOP Worksheet `/hazop/worksheet`
- Grouped by loop → node → deviation.
- Each deviation row expandable to show causes / consequences / safeguards / actions inline.
- Inline editing for all fields (credibility toggle, adding manual entries, soft-deleting library entries).
- Column layout: Ref | Equipment | Guideword | Parameter | Deviation | Causes | Consequences | Safeguards | Actions.
- Filter by: loop, parameter, guideword, reviewed status, action status.
- Action items assignable with due date from worksheet directly.

### 13.4 Safety Functions `/hazop/safety-functions`
- Table: SIF number, description, initiator tag, condition, final element, action, type, safety-critical flag.
- Inline edit: tag references, SIF description.
- "Extract SIFs" button (re-runs extraction idempotently).

### 13.5 Cause & Effect Matrix `/hazop/ce-matrix`
- Grid view: cause rows (left) × effect columns (top).
- Each cell: editable `X` / `A` / `I` / blank.
- Color coding: `X` = red (trip), `A` = amber (alarm), `I` = blue (interlock).
- "Generate C&E Matrix" button.
- Export button.

### 13.6 FAT/SAT `/hazop/fat-sat`
- Tabs: FAT / SAT.
- Columns: item no., test description, expected result, actual result, status, remarks, tested by, date.
- Inline result recording.
- Overall pass/fail summary per section.
- Export button.

### 13.7 Action Register `/hazop/actions`
- Flat list of all open actions across all deviations in the study.
- Columns: action no., deviation ref, description, type, assigned to, due date, status.
- Filter by: status, assigned to, action type.
- Mark closed inline.
- Export button.

---

## 14. New Server Files

| File | Purpose |
|---|---|
| `server/hazop-routes.ts` | All HAZOP API routes |
| `server/hazop-generation-service.ts` | HAZOP auto-generation engine (loop → deviations) |
| `server/hazop-sif-service.ts` | Safety function extraction + C&E matrix generation |
| `server/hazop-fat-sat-service.ts` | FAT/SAT auto-generation |
| `server/hazop-export-service.ts` | Excel export for all HAZOP documents |
| `server/hazop-deviation-library.ts` | Library seed data (static — imported once at DB seed) |

---

## 15. New Client Files

| File | Purpose |
|---|---|
| `client/src/pages/hazop/hazop-dashboard.tsx` | HAZOP Dashboard |
| `client/src/pages/hazop/process-loop-builder.tsx` | Process Loop Builder (main UI) |
| `client/src/pages/hazop/hazop-worksheet.tsx` | HAZOP Worksheet |
| `client/src/pages/hazop/safety-functions-page.tsx` | Safety Functions register |
| `client/src/pages/hazop/ce-matrix-page.tsx` | Cause & Effect Matrix |
| `client/src/pages/hazop/hazop-fat-sat-page.tsx` | FAT/SAT |
| `client/src/pages/hazop/action-register-page.tsx` | Action Register |
| `client/src/lib/hazop-topology.ts` | Flowchart topology builder (pure function — steps → diagram data) |

---

## 16. Schema Migration
All 12 new tables added to `shared/schema.ts` and pushed via `drizzle-kit push:pg`.  
`hazop_deviation_library` seeded by a one-time seed script `server/scripts/seed-hazop-library.ts`.  
Document sequence types (`HAZOP`, `SIF`, `CEM`, `HAZFAT`, `HAZSAT`) inserted into `doc_number_sequences` on first use.  
No existing tables modified.

---

## 17. GCS Document Governance
On `release`:  
`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/HAZOP/{docType}-rev{revision}.xlsx`  
Route through existing GCS governance layer.  
Governed by `docs/gcs-governance-rev5-option-c-baseline.md`.

---

## 18. Zero-Trust Audit Checklist

| Check | Rule |
|---|---|
| All routes use `ensureAuthenticated` | No unauthenticated access |
| Module routes use `hasViewPermission("HAZOP")` | Page-level gate |
| Approve/release routes check role >= Manager | Enforced server-side |
| Self-approval blocked | `approver_id !== creator_id` |
| Library seed is read-only at runtime | No API route exposes INSERT/UPDATE on `hazop_deviation_library` |
| Generation is idempotent | Same input → same output; no duplicate deviations |
| `pg_advisory_xact_lock(studyId)` on all batch generation | No concurrent generation collision |
| All step fields from controlled vocabulary | Enum check server-side before DB insert |
| Outlet destination ref validated on save | `outlet_destination = 'specific_step'` → `outlet_destination_ref` must be a valid sequence_no in loop |
| Deviation credibility change audited | Every `is_credible = false` write logged with reason |
| GCS upload only on `released` status | Pre-release documents never uploaded to GCS |
| SIF numbers unique per project | UNIQUE constraint on `(study_id, sif_number)` |

---

## 19. Implementation Phases

### Phase 1 — Foundation
- DB schema (all 12 tables)
- Deviation library seed (hazop-deviation-library.ts + seed script)
- Study + loop + step CRUD
- Process Loop Builder UI (form only — no diagram)
- Navigation entry

### Phase 2 — HAZOP Engine
- Auto-generation engine (hazop-generation-service.ts)
- HAZOP Worksheet UI (read + inline edit)
- Action Register UI

### Phase 3 — Safety Functions & C&E
- SIF extraction engine
- C&E matrix generation
- Safety Functions UI
- C&E Matrix UI (grid view)

### Phase 4 — FAT/SAT + Exports
- FAT/SAT generation
- FAT/SAT UI
- Excel exports (all document types)
- Loop topology diagram (flowchart rendering)

### Phase 5 — Governance
- Approval workflow
- Revision control
- GCS upload on release
- Audit logging

---

## 20. Risk Analysis

| Risk | Mitigation |
|---|---|
| Deviation library gaps (unrecognised equipment + parameter combo) | `applicable = false` entries in library suppress silently; engineer adds manually |
| Engineer skips equipment tags on steps | Warning shown, not a hard block; FAT/SAT items still generated with tag placeholder |
| Large studies (100+ loops) | Generation runs per-loop; progress events streamed via SSE |
| SIF extraction creates duplicate SIFs | Idempotency: unique on `(initiator_tag, final_element_tag)` per study |
| C&E matrix grows beyond printable width | Export splits into multiple sheets at 20 effect columns per sheet |
| Library version drift | `version` field on library rows; new entries bump version; old entries retained |

---

## 21. Rollback Strategy
1. All tables additive — `DROP TABLE hazop_*` in FK order restores state.
2. Navigation block removal: revert one block in `layout.tsx`.
3. Route removal: remove `import` of `hazop-routes.ts` from `server/routes.ts`.
4. No existing tables modified.

---

## 22. Future Expansion

| Feature | Description |
|---|---|
| SIL Assessment | Add SIL target column to `hazop_safety_functions`; integrate IEC 61508/61511 demand rate inputs |
| Layer of Protection Analysis (LOPA) | Extend SIF records with IPF (Independent Protection Layer) credits |
| P&ID Markup Export | Export loop topology as tagged P&ID reference sketch (SVG) |
| SCADA Integration | Link SIF final element tags to `ae_scada_tags` — auto-create SCADA alarm from SIF |
| Regulatory Reporting | Generate IEC-compliant SIL verification report PDF |

---

## 23. Validation Checklist (Pre-Implementation Gate)

- [ ] `project_buy_list_lines.tag_no` confirmed — all tagged lines available for equipment tag dropdown.
- [ ] `buy_subgroups.code` confirmed for category-to-subgroup mapping (instruments, pumps, valves).
- [ ] `doc_number_sequences` insertion method confirmed — new prefixes `HAZOP`, `SIF`, `CEM`, `HAZFAT`, `HAZSAT`.
- [ ] `hasViewPermission` and `hasPageAccess` function signatures confirmed.
- [ ] GCS governance path structure confirmed from `docs/gcs-governance-rev5-option-c-baseline.md`.
- [ ] `pg_advisory_xact_lock` integer key strategy confirmed — use `study_id` not `project_id` for HAZOP generation locks.
- [ ] Approval to add `isHazopMenuOpen` state variable and `ShieldAlert`, `GitBranch`, `Grid` Lucide icons in `layout.tsx`.
- [ ] New module permission `"HAZOP"` insertion method confirmed.
- [ ] Deviation library seed data reviewed and approved before Phase 1 DB push.

---

*Plan saved as per `docs/operating-protocol-v1.0.md` §5. No implementation has occurred. Implementation requires explicit approval per §2.*
