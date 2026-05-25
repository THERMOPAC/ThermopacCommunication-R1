# HAZOP Phase 4 — Execution Plan v1.1 (Revised Architecture)
**Document**: `docs/hazop-phase4-execution-plan-v1.1.md`  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.0.md` (v1.0 is SUPERSEDED — do not implement)  
**Status**: SUBMITTED FOR APPROVAL — Implementation NOT yet authorised  
**Predecessor**: Phase 3 closure approved 2026-05-25  
**Revision reason**: 9 critical architectural corrections to v1.0 (instrument-centric design rejected)  
**Author**: QMS Architect  

---

## Revision Summary (v1.0 → v1.1)

| # | Correction | v1.0 Defect | v1.1 Fix |
|---|---|---|---|
| C1 | Phase 4A Safety Logic Modeling Layer | Missing entirely | New Phase 4A sub-phase added before C&E |
| C2 | Multi-action interlock model | 1 safeguard = 1 column; cannot model coordinated shutdowns | `hazop_interlock_actions` child table + `hazop_response_groups` |
| C3 | Event type classification | No event type field | `event_type` vocabulary added to `hazop_ce_rows`, `hazop_interlocks`, `hazop_alarm_trips` |
| C4 | Regime-aware extraction | Extraction ignored Phase 3 `operating_regime`/`phase_state` | Engine reads Phase 3 node regime fields and auto-suggests event types + protections |
| C5 | Protection layer classification | Missing | `protection_layer` field on all Phase 4 entities (BPCS/SIS/Mechanical/Procedural/Operator/Relief) |
| C6 | Alarm rationalization incomplete | Missing `response_time_sec`, `operator_action_required` | Both fields added to `hazop_alarm_trips` |
| C7 | Cause grouping before C&E | 1 deviation = 1 row; creates unusable matrix size | `hazop_event_groups` + `hazop_event_group_members` grouping layer |
| C8 | Extraction pipeline architecture | Deviation → safeguard → column (flat) | Process demand → response group → coordinated actions (hierarchical) |
| C9 | BPCS vs SIS separation | Not modelled | `protection_layer` + `hazop_response_groups.protection_layer` enforces separation |

---

## Table of Contents
1. [Scope](#1-scope)
2. [Exclusions](#2-exclusions)
3. [Phase 4A — Safety Logic Modeling Layer](#3-phase-4a--safety-logic-modeling-layer)
4. [Phase 4B — C&E Matrix, SIF, Interlock, Alarm/Trip](#4-phase-4b--ce-matrix-sif-interlock-alarmtrip)
5. [Schema Changes Required](#5-schema-changes-required)
6. [API Routes](#6-api-routes)
7. [UI Pages](#7-ui-pages)
8. [Linkage to Phase 3 Worksheet Data](#8-linkage-to-phase-3-worksheet-data)
9. [Regime-Aware Extraction Engine](#9-regime-aware-extraction-engine)
10. [Zero-Trust Audit Checklist](#10-zero-trust-audit-checklist)
11. [Rollback Plan](#11-rollback-plan)
12. [Phase 4 Readiness Gate](#12-phase-4-readiness-gate)
13. [Sub-Task Breakdown](#13-sub-task-breakdown)

---

## 1. Scope

Phase 4 transforms raw HAZOP worksheet outputs (deviations, safeguards, actions from Phase 3) into structured, traceable engineering safety artefacts suitable for SIS design, alarm rationalization, and LOPA preparation (Phase 5).

Phase 4 is split into two sequential sub-phases:

### Phase 4A — Safety Logic Modeling Layer
Must complete before Phase 4B begins. Establishes the structured abstraction layer between raw Phase 3 deviations and the C&E matrix:

| Artefact | Purpose |
|---|---|
| **Event Groups** | Groups of related process deviations that trigger the same protective demand. Prevents matrix explosion (1 deviation ≠ 1 row). |
| **Response Groups** | Coordinated sets of protective actions (multi-step shutdowns). One demand may trigger multiple simultaneous responses across BPCS and SIS layers. |
| **Protection Layer Classification** | Every protective response is tagged with its IPL type (BPCS, SIS, Mechanical, Procedural, Operator, Relief) before matrix generation. |

### Phase 4B — Engineering Safety Artefacts
Built on top of Phase 4A groupings:

| Artefact | Description |
|---|---|
| **C&E Matrix** | Rows = Event Groups; Columns = Response Groups. Sparse intersection matrix. Manageable size even for complex TWFE systems. |
| **Safety Function Register** | Formal SIFs extracted from SIS-layer response groups. Includes SIL requirement and response time. |
| **Interlock Register** | All interlocks (process and SIS) with multi-action child table for coordinated shutdown sequences. |
| **Alarm & Trip Register** | Rationalised alarm/trip list with `event_type`, `protection_layer`, `response_time_sec`, `operator_action_required`. |

---

## 2. Exclusions

Same as v1.0, plus:

| Excluded Item | Reason / Deferral |
|---|---|
| SIL Verification / LOPA calculations | Phase 5 — requires PFD, failure rate data |
| Functional Safety Assessment (FSA) | Phase 5 |
| SIF proof-test interval calculation | Phase 5 |
| Logic solver programming / cause-effect download | Vendor-specific, post-Phase 5 |
| Safety Requirement Specification (SRS) generation | Phase 5 |
| DCS alarm flood analysis (> 10 alarms/10 minutes) | Requires historian integration |
| Automatic multi-action interlock sequencing (time-based) | Out of scope — Phase 4 records sequence only, does not time-step |

---

## 3. Phase 4A — Safety Logic Modeling Layer

### 3.1 Event Groups

**Problem with v1.0**: Using one deviation per C&E row for a TWFE re-refining unit with 111 library entries creates a matrix too large to use. Multiple deviations share the same protective demand.

**Solution**: Group deviations into `hazop_event_groups` before generating C&E matrix rows.

**Grouping criteria** (any of the following can constitute a group):
- Same guideword + parameter across multiple nodes (e.g., all "No Flow" demands across feed section)
- Same `event_type` within a node (e.g., all vacuum_failure deviations)
- Explicitly user-grouped via UI (drag-and-drop or multi-select)

**TWFE example**:
```
Event Group EG-001: "Vacuum System Failure" (event_type: vacuum_failure)
  Members:
  - 1.1-D03: No Flow / Vacuum (TWFE Evaporator node, vacuum regime)
  - 1.2-D01: Less Pressure / Vacuum (Vacuum Condenser node)
  - 1.3-D04: Other Than / Composition (Vacuum Ejector System node)
```

### 3.2 Response Groups

**Problem with v1.0**: One safeguard = one column treats coordinated shutdown sequences as isolated actions, making the C&E matrix unrepresentative.

**Solution**: `hazop_response_groups` bundles multiple sequential/simultaneous protective actions. One C&E column = one response group.

**TWFE vacuum failure response group example**:
```
Response Group RG-001: "Vacuum Failure Shutdown" (protection_layer: SIS)
  Actions (sequence_no order):
  1. Stop feed pump (XV-feed, tag: P-101 stop)
  2. Stop heater (H-101 power off)
  3. Open nitrogen break valve (XV-N2-001 open)
  4. Activate PAHH vacuum alarm
  5. Start cooldown sequence (HV-cool-001)
```

### 3.3 BPCS vs SIS Separation

Every response group is classified as either BPCS or SIS (or Mechanical/Procedural/Operator/Relief). This separation is mandatory for:
- Correct C&E column colouring (BPCS = blue, SIS = red per IEC 61511 convention)
- Phase 5 LOPA: IPL credit only applies to independent layers

**Separation rules enforced in the extraction engine**:
- A single response group cannot contain both BPCS and SIS actions — must be split
- SIS response groups automatically generate a candidate `hazop_safety_functions` record
- `protection_layer = 'Relief'` response groups never generate SIF records (passive protection)

---

## 4. Phase 4B — C&E Matrix, SIF, Interlock, Alarm/Trip

### 4.1 C&E Matrix (revised architecture)

The C&E matrix in v1.1 is:
- **Rows** = `hazop_event_groups` (not individual deviations)
- **Columns** = `hazop_response_groups` (not individual safeguards)
- **Cells** = triggered Boolean + notes (sparse)

Each row header shows: `Group Number | Event Type badge | Group Name | (n deviations linked)`  
Each column header shows: `Group Number | Protection Layer badge | Group Name | (n actions)`

Matrix size for a 10-node TWFE study: typically 15–25 rows × 10–15 columns (manageable). Without grouping: 80–111 rows × 60+ columns (unusable).

### 4.2 Interlock Register (revised)

Interlocks now support multi-action child records:

```
Interlock IL-001: "TWFE Vacuum Trip" (type: SIS, protection_layer: SIS)
  event_type: vacuum_failure
  Initiating condition: Vacuum < 5 mbar (PVLL-101)
  Actions:
    1. Stop P-101 (feed pump)
    2. De-energise H-101 (heater)
    3. Open XV-N2-001 (N2 break)
    4. Alarm PAHH-101
```

Each action is a child row in `hazop_interlock_actions` with its own `tag_ref` and `action_type`.

---

## 5. Schema Changes Required

> **DDL protocol**: Apply via direct `psql` only (drizzle-kit push hangs in this environment). Update `shared/schema.ts` in parallel.

### 5.1 Phase 4A New Tables

#### `hazop_event_groups`

```sql
CREATE TABLE hazop_event_groups (
  id               SERIAL PRIMARY KEY,
  study_id         INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  group_number     TEXT NOT NULL,   -- e.g. "EG-001"
  group_name       TEXT NOT NULL,
  event_type       TEXT NOT NULL
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  description      TEXT,
  operating_regime TEXT CHECK (operating_regime IN ('atmospheric','vacuum','pressure')),
  phase_state      TEXT CHECK (phase_state IN ('liquid','two_phase','vapor')),
  process_function TEXT,    -- inherited from Phase 3 node context
  source           TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('auto_extracted','manual')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, group_number)
);
```

#### `hazop_event_group_members`

```sql
CREATE TABLE hazop_event_group_members (
  id             SERIAL PRIMARY KEY,
  group_id       INT NOT NULL REFERENCES hazop_event_groups(id) ON DELETE CASCADE,
  deviation_id   INT NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE,
  UNIQUE (group_id, deviation_id)
);
```

#### `hazop_response_groups`

```sql
CREATE TABLE hazop_response_groups (
  id                SERIAL PRIMARY KEY,
  study_id          INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  group_number      TEXT NOT NULL,   -- e.g. "RG-001"
  group_name        TEXT NOT NULL,
  protection_layer  TEXT NOT NULL
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  description       TEXT,
  source            TEXT NOT NULL DEFAULT 'manual'
                      CHECK (source IN ('auto_extracted','manual')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, group_number)
);
```

#### `hazop_response_group_actions`

```sql
CREATE TABLE hazop_response_group_actions (
  id                    SERIAL PRIMARY KEY,
  response_group_id     INT NOT NULL REFERENCES hazop_response_groups(id) ON DELETE CASCADE,
  sequence_no           INT NOT NULL,
  action_description    TEXT NOT NULL,
  action_type           TEXT
    CHECK (action_type IN ('stop','open','close','alarm','start','cooldown','isolate','de_energise','vent','other')),
  tag_ref               TEXT,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  source_action_id      INT REFERENCES hazop_actions(id) ON DELETE SET NULL,
  UNIQUE (response_group_id, sequence_no)
);
```

### 5.2 Phase 4B New Tables

#### `hazop_ce_matrices` (same as v1.0 — no changes to header table)

```sql
CREATE TABLE hazop_ce_matrices (
  id                SERIAL PRIMARY KEY,
  study_id          INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  node_id           INT REFERENCES hazop_nodes(id) ON DELETE SET NULL,
  matrix_number     TEXT NOT NULL,
  title             TEXT,
  scope_description TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','reviewed','approved')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, matrix_number)
);
```

#### `hazop_ce_rows` (REVISED — rows are event groups, not deviations)

```sql
CREATE TABLE hazop_ce_rows (
  id                    SERIAL PRIMARY KEY,
  matrix_id             INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  row_number            INT NOT NULL,
  description           TEXT NOT NULL,
  event_type            TEXT
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  tag_ref               TEXT,
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,   -- single-deviation rows
  source_cause_id       INT REFERENCES hazop_causes(id) ON DELETE SET NULL,
  event_group_id        INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,  -- grouped rows (preferred)
  UNIQUE (matrix_id, row_number)
);
```

#### `hazop_ce_columns` (REVISED — columns are response groups, not safeguards)

```sql
CREATE TABLE hazop_ce_columns (
  id                    SERIAL PRIMARY KEY,
  matrix_id             INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  col_number            INT NOT NULL,
  description           TEXT NOT NULL,
  col_type              TEXT NOT NULL DEFAULT 'interlock'
    CHECK (col_type IN ('alarm','trip','shutdown','interlock','sis','process_action','other')),
  protection_layer      TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  tag_ref               TEXT,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  source_action_id      INT REFERENCES hazop_actions(id) ON DELETE SET NULL,
  response_group_id     INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,  -- grouped columns (preferred)
  UNIQUE (matrix_id, col_number)
);
```

#### `hazop_ce_cells` (unchanged from v1.0 — sparse intersection)

```sql
CREATE TABLE hazop_ce_cells (
  id         SERIAL PRIMARY KEY,
  matrix_id  INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  row_id     INT NOT NULL REFERENCES hazop_ce_rows(id) ON DELETE CASCADE,
  col_id     INT NOT NULL REFERENCES hazop_ce_columns(id) ON DELETE CASCADE,
  triggered  BOOLEAN NOT NULL DEFAULT true,
  notes      TEXT,
  UNIQUE (row_id, col_id)
);
```

#### `hazop_safety_functions` (REVISED — adds `protection_layer`)

```sql
CREATE TABLE hazop_safety_functions (
  id                    SERIAL PRIMARY KEY,
  study_id              INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  sif_number            TEXT NOT NULL,
  description           TEXT NOT NULL,
  process_demand        TEXT,
  safety_action         TEXT,
  sil_required          INT CHECK (sil_required IN (1,2,3,4)),
  response_time_sec     INT,
  initiating_tag        TEXT,
  final_element         TEXT,
  protection_layer      TEXT NOT NULL DEFAULT 'SIS'
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  status                TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','verified','approved')),
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  ce_column_id          INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  response_group_id     INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, sif_number)
);
```

#### `hazop_interlocks` (REVISED — adds `event_type`, `protection_layer`)

```sql
CREATE TABLE hazop_interlocks (
  id                    SERIAL PRIMARY KEY,
  study_id              INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  interlock_number      TEXT NOT NULL,
  interlock_type        TEXT NOT NULL
    CHECK (interlock_type IN ('process','safety','SIS')),
  event_type            TEXT
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  protection_layer      TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  description           TEXT NOT NULL,
  initiating_condition  TEXT,
  initiating_tag        TEXT,
  final_element_tag     TEXT,
  set_point             TEXT,
  reset_type            TEXT CHECK (reset_type IN ('auto','manual')),
  bypass_provision      BOOLEAN NOT NULL DEFAULT false,
  sil_level             INT CHECK (sil_level IN (1,2,3,4)),
  status                TEXT NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified','verified','approved')),
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  event_group_id        INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,
  response_group_id     INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  ce_row_id             INT REFERENCES hazop_ce_rows(id) ON DELETE SET NULL,
  ce_column_id          INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, interlock_number)
);
```

#### `hazop_interlock_actions` (NEW — multi-action child table)

```sql
CREATE TABLE hazop_interlock_actions (
  id                    SERIAL PRIMARY KEY,
  interlock_id          INT NOT NULL REFERENCES hazop_interlocks(id) ON DELETE CASCADE,
  sequence_no           INT NOT NULL,
  action_description    TEXT NOT NULL,
  action_type           TEXT
    CHECK (action_type IN ('stop','open','close','alarm','start','cooldown','isolate','de_energise','vent','other')),
  tag_ref               TEXT,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  UNIQUE (interlock_id, sequence_no)
);
```

#### `hazop_alarm_trips` (REVISED — adds `event_type`, `protection_layer`, `response_time_sec`, `operator_action_required`)

```sql
CREATE TABLE hazop_alarm_trips (
  id                       SERIAL PRIMARY KEY,
  study_id                 INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  alarm_number             TEXT NOT NULL,
  alarm_type               TEXT NOT NULL
    CHECK (alarm_type IN ('alarm','trip','shutdown')),
  event_type               TEXT
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  protection_layer         TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  tag_ref                  TEXT,
  description              TEXT NOT NULL,
  process_parameter        TEXT,
  set_point                TEXT,
  alarm_action             TEXT,
  trip_action              TEXT,
  response_time_sec        INT,
  operator_action_required BOOLEAN NOT NULL DEFAULT true,
  priority                 TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  rationalization_status   TEXT NOT NULL DEFAULT 'pending'
    CHECK (rationalization_status IN ('pending','rationalized','suppressed','deleted')),
  source_deviation_id      INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id      INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  interlock_id             INT REFERENCES hazop_interlocks(id) ON DELETE SET NULL,
  event_group_id           INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, alarm_number)
);
```

### 5.3 `shared/schema.ts` additions

One Drizzle table definition per new table (8 new tables: 4 Phase 4A + 4 Phase 4B). All follow existing HAZOP ORM pattern:
- `serial('id').primaryKey()`
- Integer FK columns (no Drizzle `references()`)
- Export `insertHazop{Entity}Schema` via `createInsertSchema(...).omit({ id: true, created_at: true })`
- Export select types via `typeof hazop{Entity}.$inferSelect`

### 5.4 Number sequence formats

| Entity | Format | Example |
|---|---|---|
| Event Group | `EG-{nn:03d}` | `EG-001` |
| Response Group | `RG-{nn:03d}` | `RG-001` |
| C&E Matrix | `CEM-{study_short}-{nn:03d}` | `CEM-2627-001` |
| Safety Function | `SIF-{nn:03d}` | `SIF-001` |
| Interlock (process) | `IL-{nn:03d}` | `IL-001` |
| Interlock (SIS) | `SIS-{nn:03d}` | `SIS-001` |
| Alarm | `ALM-{nn:04d}` | `ALM-0001` |
| Trip | `TRIP-{nn:04d}` | `TRIP-0001` |

All use `MAX() + 1` with advisory lock `study_id * 10000 + 4001`.

---

## 6. API Routes

All routes registered in `server/hazop-routes.ts` under `// PHASE 4A START` and `// PHASE 4B START` comment blocks. All require `ensureAuthenticated`. All mutating routes check `study.status === 'draft'`.

### 6.1 Phase 4A — Event Groups

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/event-groups` | List all event groups |
| `POST` | `/api/hazop/studies/:studyId/event-groups` | Create event group |
| `PATCH` | `/api/hazop/event-groups/:id` | Update |
| `DELETE` | `/api/hazop/event-groups/:id` | Delete (cascades members) |
| `POST` | `/api/hazop/event-groups/:id/members` | Add deviation to group |
| `DELETE` | `/api/hazop/event-group-members/:id` | Remove deviation from group |
| `POST` | `/api/hazop/studies/:studyId/event-groups/extract` | **Regime-aware auto-grouping** (see §9) |

### 6.2 Phase 4A — Response Groups

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/response-groups` | List, optional `?protection_layer=SIS` filter |
| `POST` | `/api/hazop/studies/:studyId/response-groups` | Create response group |
| `PATCH` | `/api/hazop/response-groups/:id` | Update |
| `DELETE` | `/api/hazop/response-groups/:id` | Delete (cascades actions) |
| `POST` | `/api/hazop/response-groups/:id/actions` | Add action to group |
| `PATCH` | `/api/hazop/response-group-actions/:id` | Update action |
| `DELETE` | `/api/hazop/response-group-actions/:id` | Remove action |
| `POST` | `/api/hazop/studies/:studyId/response-groups/extract` | **Auto-extract from safeguards** (see §9) |

### 6.3 Phase 4B — C&E Matrix

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/ce-matrices` | List matrices |
| `POST` | `/api/hazop/studies/:studyId/ce-matrices` | Create matrix |
| `GET` | `/api/hazop/ce-matrices/:id/full` | Full matrix (rows, columns, cells, linked counts) |
| `PATCH` | `/api/hazop/ce-matrices/:id` | Update title/status |
| `DELETE` | `/api/hazop/ce-matrices/:id` | Delete (draft only) |
| `POST` | `/api/hazop/ce-matrices/:id/populate-from-groups` | **Populate rows from event groups + columns from response groups** (Phase 4A must complete first) |
| `POST` | `/api/hazop/ce-matrices/:id/rows` | Add row manually |
| `PATCH` | `/api/hazop/ce-rows/:rowId` | Update row |
| `DELETE` | `/api/hazop/ce-rows/:rowId` | Delete row |
| `POST` | `/api/hazop/ce-matrices/:id/columns` | Add column manually |
| `PATCH` | `/api/hazop/ce-columns/:colId` | Update column |
| `DELETE` | `/api/hazop/ce-columns/:colId` | Delete column |
| `PUT` | `/api/hazop/ce-matrices/:id/cells` | Bulk upsert cells |

### 6.4 Phase 4B — Safety Functions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/safety-functions` | List, optional `?protection_layer=SIS` filter |
| `POST` | `/api/hazop/studies/:studyId/safety-functions` | Create SIF |
| `PATCH` | `/api/hazop/safety-functions/:id` | Update |
| `DELETE` | `/api/hazop/safety-functions/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/safety-functions/extract-from-sis-groups` | Auto-create SIFs from SIS-layer response groups |

### 6.5 Phase 4B — Interlocks

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/interlocks` | List, optional `?type=SIS` or `?event_type=vacuum_failure` filter |
| `POST` | `/api/hazop/studies/:studyId/interlocks` | Create interlock |
| `PATCH` | `/api/hazop/interlocks/:id` | Update |
| `DELETE` | `/api/hazop/interlocks/:id` | Delete (draft only) |
| `POST` | `/api/hazop/interlocks/:id/actions` | Add interlock action |
| `PATCH` | `/api/hazop/interlock-actions/:id` | Update action |
| `DELETE` | `/api/hazop/interlock-actions/:id` | Delete action |
| `POST` | `/api/hazop/studies/:studyId/interlocks/extract` | Auto-extract from response groups (SIS/process types) |

### 6.6 Phase 4B — Alarm/Trip Register

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/alarm-trips` | List, filters: `?alarm_type`, `?priority`, `?rationalization_status`, `?event_type` |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips` | Create manually |
| `PATCH` | `/api/hazop/alarm-trips/:id` | Update |
| `DELETE` | `/api/hazop/alarm-trips/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips/extract` | Auto-extract from BPCS-layer response groups with `alarm`/`trip` action types |

### 6.7 Phase 4 Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/phase4-summary` | Counts per entity, linkage completeness %, BPCS/SIS split, orphan record count |

---

## 7. UI Pages

### 7.1 `hazop-phase4-dashboard.tsx`
**Route**: `/hazop/studies/:id/phase4`

Sections:
- Phase 4A status card: Event Groups (n), Response Groups (n), BPCS/SIS split bar
- Phase 4B status card: C&E Matrices (n), Safety Functions (n), Interlocks (n), Alarms/Trips (n)
- Linkage completeness: % of Phase 4 records with Phase 3 source link
- Extraction pipeline wizard: Step 1 (Run Event Grouping) → Step 2 (Run Response Grouping) → Step 3 (Generate C&E Matrix)
- "Run Full Phase 4A Extraction" button (regime-aware, single click)

### 7.2 `hazop-event-groups.tsx`
**Route**: `/hazop/studies/:id/event-groups`

- Table: Group No. | Event Type badge | Group Name | Operating Regime | Phase State | Process Function | Deviation Count
- Expandable row: shows linked deviations (deviation number + guideword + parameter from Phase 3)
- Multi-select deviations from worksheet to create/add to group
- Event type badges: vacuum_failure = purple, thermal_runaway = red, overpressure = orange, phase_transition = sky, others = grey
- "Auto-group (Regime-Aware)" button

### 7.3 `hazop-response-groups.tsx`
**Route**: `/hazop/studies/:id/response-groups`

- Table: Group No. | Protection Layer badge | Group Name | Action Count
- Expandable row: ordered list of actions (sequence_no, action_type icon, description, tag_ref)
- Inline action editor: add/edit/reorder/delete actions
- Protection layer filter tab bar (BPCS / SIS / Mechanical / Procedural / Operator / Relief)
- "Auto-extract from Safeguards" button

### 7.4 `hazop-ce-matrix.tsx`
**Route**: `/hazop/studies/:id/ce-matrix/:matrixId`

Grid layout (sticky row + column headers):
```
                          │ [BPCS] RG-001         │ [SIS] RG-002          │
                          │ Process Control        │ Vacuum Trip           │
──────────────────────────┼───────────────────────┼───────────────────────┤
EG-001 [vacuum_failure]   │          ✓            │          ✓            │
Vacuum System Failure     │                       │                       │
──────────────────────────┼───────────────────────┼───────────────────────┤
EG-002 [overpressure]     │                       │          ✓            │
High Pressure Demand      │                       │                       │
```

- Column headers colour-coded by protection_layer (BPCS=blue, SIS=red, Mechanical=grey, etc.)
- Row headers show event_type badge
- Cell click = toggle; right-click/hover = notes popover
- "Populate from Phase 4A Groups" button (appears when matrix is empty)

### 7.5 `hazop-safety-functions.tsx`
**Route**: `/hazop/studies/:id/safety-functions`

Columns: SIF No. | Description | Process Demand | Safety Action | SIL Required | Response Time | Initiating Tag | Final Element | Protection Layer | Status | Source Deviation  
SIL badge: SIL-1=yellow, SIL-2=orange, SIL-3=red, SIL-4=dark red

### 7.6 `hazop-interlocks.tsx`
**Route**: `/hazop/studies/:id/interlocks`

- Tabs: All | Process | Safety | SIS
- Table with expandable interlock rows showing `hazop_interlock_actions` as an ordered numbered list
- Event type badge on each row
- Protection layer badge
- SIL badge for SIS interlocks
- "Extract from Response Groups" button

### 7.7 `hazop-alarm-trips.tsx`
**Route**: `/hazop/studies/:id/alarm-trips`

Columns: Alarm No. | Type | Event Type | Protection Layer | Tag | Description | Parameter | Set Point | Response Time | Operator Required | Priority | Rationalization Status | Source  
Rationalization workflow kanban: Pending → Rationalized / Suppressed  
Priority heat-map row colouring: critical=red-50, high=orange-50, medium=amber-50, low=white

### 7.8 Navigation wiring

**Process builder header** (add after "Worksheet" button):
```tsx
<Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/phase4`)}>
  <Zap className="h-4 w-4" /> Phase 4
</Button>
```

**Worksheet page** (add to header actions row):
```tsx
<Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/phase4`)}>
  <Zap className="h-4 w-4" /> Phase 4
</Button>
```

---

## 8. Linkage to Phase 3 Worksheet Data

### 8.1 Traceability map (v1.1 — revised with grouping layer)

```
PHASE 3 SOURCES
  hazop_deviations ──────────────────────────────────────────────┐
    ├── hazop_event_group_members.deviation_id (Phase 4A)        │
    ├── hazop_ce_rows.source_deviation_id (single-row mode)      │
    ├── hazop_safety_functions.source_deviation_id               │
    ├── hazop_interlocks.source_deviation_id                     │
    └── hazop_alarm_trips.source_deviation_id                    │
                                                                  │
  hazop_safeguards ──────────────────────────────────────────────┤
    ├── hazop_response_group_actions.source_safeguard_id (4A)    │
    ├── hazop_ce_columns.source_safeguard_id (single-col mode)   │
    ├── hazop_safety_functions.source_safeguard_id               │
    ├── hazop_interlocks.source_safeguard_id                     │
    ├── hazop_interlock_actions.source_safeguard_id              │
    └── hazop_alarm_trips.source_safeguard_id                    │
                                                                  │
PHASE 4A GROUPING LAYER                                           │
  hazop_event_groups ◄───────────────────────────────────────────┘
    ├── hazop_ce_rows.event_group_id
    ├── hazop_interlocks.event_group_id
    └── hazop_alarm_trips.event_group_id

  hazop_response_groups
    ├── hazop_ce_columns.response_group_id
    ├── hazop_safety_functions.response_group_id
    └── hazop_interlocks.response_group_id

PHASE 4B ARTEFACTS
  hazop_ce_matrices → hazop_ce_rows + hazop_ce_columns → hazop_ce_cells
  hazop_safety_functions
  hazop_interlocks → hazop_interlock_actions
  hazop_alarm_trips
```

### 8.2 Mandatory linkage rules

| Phase 4 Table | Required link at create time |
|---|---|
| `hazop_event_group_members` | `deviation_id` mandatory |
| `hazop_response_group_actions` | `source_safeguard_id` OR `source_action_id` (at least one) |
| `hazop_safety_functions` | `source_deviation_id` OR `response_group_id` (at least one) |
| `hazop_interlocks` | `source_safeguard_id` OR `source_deviation_id` OR `event_group_id` |
| `hazop_alarm_trips` | `source_safeguard_id` OR `source_deviation_id` |
| `hazop_ce_rows` | `event_group_id` (preferred) OR `source_deviation_id` (single-row fallback) |
| `hazop_ce_columns` | `response_group_id` (preferred) OR `source_safeguard_id` (single-col fallback) |

### 8.3 Cascade behaviour on Phase 3 deletion

All Phase 4 FK columns referencing Phase 3 tables use `ON DELETE SET NULL`. Deletion of a Phase 3 safeguard orphans the Phase 4 record (sets FK to NULL) — it does not cascade-delete Phase 4 records. The `phase4-summary` endpoint reports orphan counts.

---

## 9. Regime-Aware Extraction Engine

The extraction engine (called by the Phase 4A auto-group routes) reads Phase 3 node context fields before classifying deviations and safeguards.

### 9.1 Event type auto-classification rules

| Phase 3 Node Condition | Guideword + Parameter combination | Auto-assigned `event_type` |
|---|---|---|
| `operating_regime = 'vacuum'` | Any / Pressure (decreasing) | `vacuum_failure` |
| `operating_regime = 'vacuum'` | Less / Pressure | `vacuum_failure` |
| `phase_state = 'two_phase'` | Other Than / Composition | `phase_transition` |
| `phase_state = 'two_phase'` | More / Level | `phase_transition` |
| `phase_state = 'vapor'` | More / Temperature | `thermal_runaway` |
| `phase_state = 'vapor'` | More / Pressure | `overpressure` |
| `process_function = 'TWFE Evaporation'` | No / Flow (feed) | `vacuum_failure` |
| `process_function = 'TWFE Evaporation'` | More / Temperature | `thermal_runaway` |
| `process_function = 'Degasoil Flash'` | More / Pressure | `overpressure` |
| `process_function = 'Dehydration'` | Less / Temperature | `utility_failure` |
| any | No / Utility | `utility_failure` |
| any | No / Power | `power_failure` |
| any | Other Than / Instrument signal | `instrument_failure` |
| fallback (no rule matched) | — | `process_deviation` |

### 9.2 Protection layer auto-classification rules (from `safeguard_type`)

| `hazop_safeguards.safeguard_type` | Auto-assigned `protection_layer` |
|---|---|
| `alarm` | `BPCS` |
| `trip` | `SIS` |
| `shutdown` | `SIS` |
| `SIS` | `SIS` |
| `interlock` | `BPCS` (default; override manually if SIS) |
| `relief_device` | `Mechanical` |
| `procedure` | `Procedural` |
| `design` | `Mechanical` |
| null / other | `Operator` |

### 9.3 Regime-specific protection auto-suggestions

When `operating_regime = 'vacuum'`, the extraction engine additionally suggests the following response group actions even if not present in Phase 3 safeguards:

| Trigger | Auto-suggested action | action_type | Requires manual confirmation |
|---|---|---|---|
| `vacuum_failure` event | N₂ break valve open | `open` | Yes — user must confirm tag_ref |
| `vacuum_failure` event | Feed pump stop | `stop` | Yes |
| `vacuum_failure` event | Heater de-energise | `de_energise` | Yes |
| `phase_transition` (two_phase) | Separator level trip | `trip` | Yes |
| `phase_transition` (two_phase) | Foaming alarm | `alarm` | Yes |
| `thermal_runaway` | Cooldown sequence | `cooldown` | Yes |
| `overpressure` | Relief device activation | `vent` | Yes (Mechanical layer) |

Auto-suggested actions are created with `source = 'auto_extracted'` and flagged with a "Confirm" badge in the UI until the user approves them (sets confirmed = true or edits them).

### 9.4 BPCS vs SIS split logic

A response group is classified as SIS if **any** of its actions has `protection_layer = 'SIS'`. If a single safeguard spans both BPCS and SIS actions, the extraction engine automatically splits it into two separate response groups:
- `{name} (BPCS)` — containing BPCS actions
- `{name} (SIS)` — containing SIS actions

The split is noted in the response group `description` field: `"Auto-split from safeguard SG-nnn"`.

---

## 10. Zero-Trust Audit Checklist

### 10.1 Auth & study-state guard
- [ ] All Phase 4A/4B GET routes return `401` without valid session
- [ ] All mutating routes return `401` without valid session
- [ ] All mutating routes return `409` when `study.status ≠ 'draft'`
- [ ] Advisory lock `study_id * 10000 + 4001` present on all bulk-write operations
- [ ] Study ID always resolved from URL param, never from request body

### 10.2 Phase 4A — Event group integrity
- [ ] `POST /event-group-members` rejects (400) when `deviation_id` absent
- [ ] Same deviation cannot appear in two different event groups for the same matrix (business rule — enforce at application layer with 409)
- [ ] Deleting an event group does not cascade-delete the Phase 3 deviations (SET NULL only)
- [ ] Auto-grouping is idempotent (run twice = same groups, no duplicates)

### 10.3 Phase 4A — Response group integrity
- [ ] BPCS/SIS split auto-logic tested: mixed safeguard creates two groups
- [ ] Response group with zero actions rejected (400) at create time — must have at least one action
- [ ] Deleting a response group does not cascade-delete Phase 3 safeguards (SET NULL only)
- [ ] `protection_layer` validation tested — invalid value rejects with 400

### 10.4 Phase 4B — C&E matrix integrity
- [ ] Cell bulk-upsert uses `ON CONFLICT (row_id, col_id) DO UPDATE` — no duplicates
- [ ] Deleting a matrix row cascades to its cells
- [ ] Deleting a matrix column cascades to its cells
- [ ] Populate-from-groups is idempotent — running twice produces the same rows/columns
- [ ] Matrix with mismatched study scope rejected (403 if row event group belongs to different study)

### 10.5 Phase 4B — Multi-action interlock integrity
- [ ] `sequence_no` unique per interlock enforced by DB constraint
- [ ] Deleting an interlock cascades to `hazop_interlock_actions` (verified)
- [ ] Interlock action `action_type` vocabulary validated server-side

### 10.6 Numbering uniqueness
- [ ] Concurrent SIF creation (parallel POST) does not produce duplicate `sif_number` (advisory lock tested)
- [ ] Same for interlock, alarm, event group, response group numbers
- [ ] UNIQUE constraint violation returns 409 (not 500)

### 10.7 Regime-aware extraction correctness
- [ ] Node with `operating_regime = 'vacuum'` produces at least one `vacuum_failure` event group
- [ ] Node with `phase_state = 'two_phase'` produces at least one `phase_transition` event group
- [ ] Auto-suggested regime-specific actions (N₂ break, cooldown) marked `source = 'auto_extracted'`
- [ ] Auto-suggested actions do not bypass the "manual confirmation" gate in the UI

### 10.8 TypeScript & runtime
- [ ] `npx tsc --noEmit --skipLibCheck` returns 0 HAZOP-file errors
- [ ] `parseJsonArray()` helper handles both jsonb-array and text-JSON-string
- [ ] All 8 new Drizzle table definitions export correct insert and select types
- [ ] Server log shows `✅ HAZOP routes registered` with no Phase 4 errors

### 10.9 UI/UX
- [ ] C&E matrix renders correctly with protection_layer column colour-coding
- [ ] Empty matrix shows "Populate from Phase 4A Groups" CTA (not generic "Add Column/Row")
- [ ] Interlock page expandable rows show ordered action list, not flat text
- [ ] Alarm page response_time_sec and operator_action_required visible in table and edit form
- [ ] Phase 4 dashboard extraction wizard step gates are enforced (cannot go to Step 3 without Step 1+2 complete)

---

## 11. Rollback Plan

### 11.1 Schema rollback (psql — in FK dependency order)

```sql
-- Phase 4B tables first
DROP TABLE IF EXISTS hazop_alarm_trips CASCADE;
DROP TABLE IF EXISTS hazop_interlock_actions CASCADE;
DROP TABLE IF EXISTS hazop_interlocks CASCADE;
DROP TABLE IF EXISTS hazop_safety_functions CASCADE;
DROP TABLE IF EXISTS hazop_ce_cells CASCADE;
DROP TABLE IF EXISTS hazop_ce_columns CASCADE;
DROP TABLE IF EXISTS hazop_ce_rows CASCADE;
DROP TABLE IF EXISTS hazop_ce_matrices CASCADE;
-- Phase 4A tables
DROP TABLE IF EXISTS hazop_response_group_actions CASCADE;
DROP TABLE IF EXISTS hazop_response_groups CASCADE;
DROP TABLE IF EXISTS hazop_event_group_members CASCADE;
DROP TABLE IF EXISTS hazop_event_groups CASCADE;
```

**All Phase 4 tables are new additions — no `ALTER TABLE` on existing Phase 3 tables.** Rollback has zero risk to Phase 3 data.

### 11.2 Code rollback

1. Remove `// PHASE 4A START` … `// PHASE 4A END` block from `server/hazop-routes.ts`
2. Remove `// PHASE 4B START` … `// PHASE 4B END` block from `server/hazop-routes.ts`
3. Remove Phase 4A/4B table definitions from `shared/schema.ts`
4. Remove Phase 4 loader exports from `client/src/loaders/hazop.ts`
5. Remove Phase 4 routes from `client/src/App.tsx`
6. Remove "Phase 4" nav button from `hazop-process-builder.tsx` and `hazop-worksheet.tsx`

### 11.3 Checkpoint strategy

Create a manual checkpoint named `"Pre-Phase4A-schema"` immediately before running T4-001 psql DDL. If ZTA fails at any point, restore this checkpoint to return to end-of-Phase-3 state.

---

## 12. Phase 4 Readiness Gate

### 12.1 Phase 3 gates (confirmed)
- [x] Phase 3 closure approved 2026-05-25
- [x] Generation engine operational
- [x] Worksheet page with deviations, safeguards, causes, consequences, actions all working
- [x] Node regime fields (`operating_regime`, `phase_state`, `process_function`) populated in DB

### 12.2 Critical pre-implementation gates

- [ ] At least one HAZOP study has deviations generated (to provide data for extraction testing)
- [ ] **`hazop_safeguards.safeguard_type` vocabulary confirmed populated in Phase 3 library** — the regime-aware extraction engine classification in §9.2 depends entirely on this field. If blank, extraction engine will classify everything as `Operator` layer. **This is the single highest-risk dependency.**
- [ ] Product owner approves the 10-value `event_type` vocabulary (no additions after schema creation without migration)
- [ ] Product owner approves the 6-value `protection_layer` vocabulary
- [ ] Product owner approves the 9-value `action_type` vocabulary for interlock actions
- [ ] Product owner confirms SIL as integer 1–4 only in Phase 4 (PFD calculation deferred to Phase 5)
- [ ] Phase 4A must complete and be tested before Phase 4B extraction engine is coded (the populate-from-groups route in Phase 4B depends on event_groups and response_groups existing)

### 12.3 Safeguard type vocabulary dependency (critical)

Before Phase 4 implementation starts, run this query to assess the gap:

```sql
SELECT safeguard_type, COUNT(*) as cnt
FROM hazop_safeguards
GROUP BY safeguard_type
ORDER BY cnt DESC;
```

If `safeguard_type` is NULL for all rows, the Phase 3 seed library must be updated to add `safeguard_type` values before Phase 4 can extract correctly. This is a **Phase 3 patch** that must be planned and applied first.

---

## 13. Sub-Task Breakdown

| ID | Task | Blocked By | Files |
|---|---|---|---|
| T4A-001 | Schema: Phase 4A tables (psql + schema.ts) | Phase 3 gate check | `shared/schema.ts`, psql |
| T4A-002 | Routes: Event group CRUD + regime-aware extract | T4A-001 | `server/hazop-routes.ts` |
| T4A-003 | Routes: Response group CRUD + action CRUD + extract | T4A-001 | `server/hazop-routes.ts` |
| T4A-004 | UI: Event groups page | T4A-002 | `hazop-event-groups.tsx` |
| T4A-005 | UI: Response groups page | T4A-003 | `hazop-response-groups.tsx` |
| T4A-006 | ZTA: Phase 4A verification | T4A-004, T4A-005 | — |
| T4B-001 | Schema: Phase 4B tables (psql + schema.ts) | T4A-006 | `shared/schema.ts`, psql |
| T4B-002 | Routes: C&E matrix CRUD + populate-from-groups | T4B-001 | `server/hazop-routes.ts` |
| T4B-003 | Routes: Safety functions CRUD + SIS extract | T4B-001 | `server/hazop-routes.ts` |
| T4B-004 | Routes: Interlocks CRUD + interlock actions + extract | T4B-001 | `server/hazop-routes.ts` |
| T4B-005 | Routes: Alarm/trip CRUD + extract | T4B-001 | `server/hazop-routes.ts` |
| T4B-006 | Routes: Phase 4 summary | T4B-002…T4B-005 | `server/hazop-routes.ts` |
| T4B-007 | UI: C&E matrix editor | T4B-002 | `hazop-ce-matrix.tsx` |
| T4B-008 | UI: Safety functions page | T4B-003 | `hazop-safety-functions.tsx` |
| T4B-009 | UI: Interlocks page (with multi-action rows) | T4B-004 | `hazop-interlocks.tsx` |
| T4B-010 | UI: Alarm/trip rationalization page | T4B-005 | `hazop-alarm-trips.tsx` |
| T4B-011 | UI: Phase 4 dashboard + nav wiring | T4B-007…T4B-010 | `hazop-phase4-dashboard.tsx`, process-builder, worksheet |
| T4B-012 | ZTA: Full Phase 4 verification | T4B-011 | — |

---

*End of Phase 4 Execution Plan v1.1*  
*Prepared: 2026-05-25 | Awaiting product owner approval before implementation*
