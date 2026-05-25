# HAZOP Phase 4 — Execution Plan v1.2 (Final Architecture)
**Document**: `docs/hazop-phase4-execution-plan-v1.2.md`  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.1.md` (v1.1 superseded)  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.0.md` (v1.0 superseded)  
**Status**: SUBMITTED FOR FINAL APPROVAL — Implementation NOT yet authorised  
**Predecessor approvals**: Phase 3 closure 2026-05-25, Phase 4 v1.1 architecture approved pending corrections  
**Revision reason**: 9 final architectural additions required before coding begins  
**Author**: QMS Architect  

---

## Revision Summary (v1.1 → v1.2)

| # | Addition | v1.1 Gap | v1.2 Resolution |
|---|---|---|---|
| A1 | Process transition modeling | `hazop_event_groups` had no transition type | `process_transition_type` field added (10-value vocabulary) |
| A2 | Response execution logic classification | Response groups and interlocks had no execution model | `logic_type` field on `hazop_response_groups` + `hazop_interlocks` (6-value vocabulary) |
| A3 | Response criticality classification | No timing / urgency classification | `criticality_class` on response groups, interlocks, alarm/trips (5-value vocabulary) |
| A4 | Extraction confidence scoring | Auto-extracted actions had no quality visibility | `confidence_score` INT 0–100 on `hazop_response_group_actions`, `hazop_interlock_actions`, `hazop_alarm_trips` |
| A5 | IPL independence modeling | `protection_layer` alone insufficient for LOPA credit | `is_independent_protection_layer BOOLEAN` on response groups, safety functions, interlocks |
| A6 | Common-cause failure grouping | No CCF modeling; shared-cause events/responses invisible | `common_cause_group` field on event groups + response groups (8-value vocabulary) |
| A7 | Safety Critical Element registry | No SCE tracking for Phase 5 proof-test lifecycle | New table `hazop_safety_critical_elements` (7 fields) |
| A8 | Dynamic hazard-chain architecture note | Docs described only hazard→response; TWFE cascade omitted | Explicit hazard→transition→cascade→response model documented in §3.5 |
| A9 | v1.2 plan document | — | This document |

---

## Table of Contents
1. [Scope](#1-scope)
2. [Exclusions](#2-exclusions)
3. [Phase 4A — Safety Logic Modeling Layer (revised)](#3-phase-4a--safety-logic-modeling-layer-revised)
4. [Phase 4B — C&E Matrix, SIF, Interlock, Alarm/Trip (unchanged scope)](#4-phase-4b--ce-matrix-sif-interlock-alarmtrip-unchanged-scope)
5. [Complete Schema (v1.2 Final)](#5-complete-schema-v12-final)
6. [API Routes](#6-api-routes)
7. [UI Pages](#7-ui-pages)
8. [Linkage to Phase 3 Worksheet Data](#8-linkage-to-phase-3-worksheet-data)
9. [Regime-Aware Extraction Engine (v1.2)](#9-regime-aware-extraction-engine-v12)
10. [Zero-Trust Audit Checklist (v1.2)](#10-zero-trust-audit-checklist-v12)
11. [Rollback Plan](#11-rollback-plan)
12. [Phase 4 Readiness Gate](#12-phase-4-readiness-gate)
13. [Sub-Task Breakdown (v1.2)](#13-sub-task-breakdown-v12)

---

## 1. Scope

Phase 4 transforms raw HAZOP worksheet outputs (deviations, safeguards, actions from Phase 3) into structured, traceable engineering safety artefacts suitable for SIS design, alarm rationalization, and LOPA preparation (Phase 5).

Phase 4 is split into two sequential sub-phases — unchanged from v1.1. Phase 4A must complete and be verified before Phase 4B extraction begins.

### v1.2 scope additions

The following Phase 5 readiness features are now embedded in Phase 4 (not deferred):

| Feature | Purpose | Where |
|---|---|---|
| Process transition modeling | TWFE hazards are driven by transitions (evaporation, foaming, etc.), not only static deviations | `hazop_event_groups.process_transition_type` |
| Execution logic classification | Interlocks and response groups must declare whether actions are parallel, sequential, latched, etc. | `logic_type` on response groups + interlocks |
| Response criticality | Urgency/timing class (instant/fast/medium/slow/operator_managed) for alarm rationalisation and SRS basis | `criticality_class` on response groups, interlocks, alarm/trips |
| IPL independence flag | LOPA IPL credit requires independence declaration (cannot credit correlated layers) | `is_independent_protection_layer` on response groups, safety functions, interlocks |
| Common-cause failure groups | CCF group tagging identifies which events/responses share a common mode failure root | `common_cause_group` on event groups + response groups |
| Confidence scoring | Auto-extracted records from regime-aware engine carry quality scores for review prioritisation | `confidence_score` on response group actions, interlock actions, alarm/trips |
| SCE registry | Lightweight Safety Critical Element list for Phase 5 proof-test tracking | New table `hazop_safety_critical_elements` |
| Hazard-chain documentation | TWFE cascade model documented as process-state architecture (see §3.5) | Architecture document |

---

## 2. Exclusions

Same as v1.1, plus confirmed deferral of the following to Phase 5:

| Excluded Item | Reason |
|---|---|
| SIL verification / LOPA PFD calculations | Phase 5 — requires PFD, failure rate data, diagnostic coverage |
| Functional Safety Assessment (FSA) | Phase 5 |
| SIF proof-test interval calculation | Phase 5 — but SCE `inspection_interval_days` field is pre-positioned here |
| Logic solver programming / CE download | Vendor-specific, post-Phase 5 |
| Safety Requirement Specification (SRS) document generation | Phase 5 — but Phase 4 data is the SRS input source |
| DCS alarm flood analysis | Requires historian integration |
| IPL PFD value assignment | Phase 5 — `is_independent_protection_layer` flag positioned here |
| CCF Beta-factor quantification | Phase 5 — `common_cause_group` tag positioned here |
| Sequential interlock timing (time-step logic) | Phase 4 records sequence only, does not time-step |

---

## 3. Phase 4A — Safety Logic Modeling Layer (revised)

### 3.1 Event Groups (v1.2 additions)

Two new fields added to `hazop_event_groups`:

**`process_transition_type`** — classifies the thermodynamic/physical transition that drives the hazardous event. Distinct from `event_type` (which classifies the initiating cause class). A vacuum_failure `event_type` may involve a `flashing` or `entrainment` transition type.

Vocabulary:
- `evaporation` — normal or abnormal vaporisation of liquid
- `condensation` — vapour condensing (unplanned condensate accumulation)
- `flashing` — pressure drop causing sudden vaporisation
- `devolatilization` — release of dissolved/occluded volatiles from heated oil
- `film_formation` — thin-film creation on wiper surfaces (TWFE-specific)
- `film_breakdown` — loss of thin film; dry running, hot spots
- `foaming` — two-phase foam layer formation (TWFE/degasoil separator)
- `entrainment` — liquid droplets carried into vapour line
- `thermal_cracking` — high-temperature decomposition of hydrocarbons
- `vacuum_break` — uncontrolled atmospheric air ingress to vacuum system

**`common_cause_group`** — groups events that share a common-cause failure root (e.g., all events that can result from power failure share `common_cause_group = 'power'`). Vocabulary: see §3.6.

### 3.2 Response Groups (v1.2 additions)

Two new fields added to `hazop_response_groups`:

**`logic_type`** — classifies how actions within the group are executed relative to each other:

| `logic_type` | Meaning | TWFE example |
|---|---|---|
| `parallel` | All actions fire simultaneously | Vacuum trip: stop pump AND open N₂ break simultaneously |
| `sequential` | Actions execute in defined order (sequence_no) | Cooldown: stop heater → close feed → start cooling |
| `latched` | Condition latches until manual reset | High-temperature shutdown: stays shut until operator resets |
| `permissive` | One action is gated on another completing first | Feed start: permissive on vacuum confirmed |
| `voting` | Activated only when ≥N of M initiating signals present | 2oo3 voting on vacuum transmitters |
| `manual_reset` | Auto-initiates but requires operator to reset | Any SIS trip with manual reset requirement |

**`criticality_class`** — see §3.3.

**`is_independent_protection_layer`** — boolean flag for LOPA IPL credit. A response group can only claim IPL credit if:
- it is functionally independent of the initiating event
- it is independent of other protection layers claimed in the same scenario
- `common_cause_group` does not overlap with the initiating event group's `common_cause_group`

**`common_cause_group`** — see §3.6.

### 3.3 Response Criticality Classification

`criticality_class` field on `hazop_response_groups`, `hazop_interlocks`, and `hazop_alarm_trips`:

| `criticality_class` | Meaning | Typical demand time |
|---|---|---|
| `instant` | Automatic trip, no delay tolerable | < 1 second |
| `fast` | Fast automatic response | 1–10 seconds |
| `medium` | Automatic response with short operator awareness window | 10–60 seconds |
| `slow` | Operator has time to respond if alerted | 1–30 minutes |
| `operator_managed` | Procedural response; operator action required, no automatic trip | > 30 minutes or manual |

This field directly feeds:
- Alarm rationalisation (operator response time requirement)
- SIF response time requirement in `hazop_safety_functions.response_time_sec`
- Phase 5 SRS basis documentation

### 3.4 Extraction Confidence Scoring

`confidence_score INT` (0–100) on `hazop_response_group_actions`, `hazop_interlock_actions`, and `hazop_alarm_trips`.

**Rules**:
- `source = 'auto_extracted'` rows: score calculated by extraction engine
- `source = 'manual'` rows: `confidence_score = NULL` (not applicable)
- Score is read-only from the UI; user cannot manually set it (prevents gaming)
- Score display: 0–49 = red badge "Low", 50–74 = amber badge "Medium", 75–89 = green badge "High", 90–100 = blue badge "Verified"

**Scoring algorithm** (extraction engine):

| Condition | Score contribution |
|---|---|
| `source_safeguard_id` is linked (Phase 3 safeguard found) | +40 |
| `protection_layer` classification is unambiguous (exact rule match) | +20 |
| `tag_ref` is populated | +15 |
| `action_type` is classified (not null) | +10 |
| `safeguard_type` was populated on source safeguard | +10 |
| `operating_regime` exact match in extraction rule table | +5 |
| **Maximum** | **100** |

### 3.5 Dynamic Hazard-Chain Architecture (TWFE)

> **This is the key architectural departure from instrument-centric HAZOP models.**

Conventional HAZOP models a single-step chain:
```
Hazard → Response
```

TWFE vacuum re-refining process safety operates on a **multi-step cascading hazard chain**:
```
Initiating Event
    → Process Transition
        → Cascading Hazard
            → Coordinated Multi-Layer Response
```

**Documented TWFE cascade chains:**

| Initiating Event | Process Transition | Cascading Hazard | Coordinated Response |
|---|---|---|---|
| Vacuum system failure | `vacuum_break` → air ingress | Oxidation of hot oil → thermal instability | SIS: stop wiper motor + stop feed + open N₂ break + trip heater |
| High evaporator temperature | `film_breakdown` | Coking on wiper blades → fouling + overtemperature | BPCS: reduce feed rate; SIS: trip heater; Procedural: inspection |
| Two-phase level anomaly | `foaming` → `entrainment` | Liquid carry-over to vapour line → condenser flooding | BPCS: open foam breaker; SIS: separator level trip |
| Wiper motor overload | `film_formation` loss → `film_breakdown` | Dry running → hot spots → thermal cracking | SIS: stop wiper motor + trip heater; Mechanical: relief device |
| Cooling failure | `condensation` upset → vapour carry-through | Devolatilization continues uncontrolled → overpressure | SIS: trip heater; Mechanical: PSV set point; BPCS: cooling water alarm |
| Power failure | All vacuum pumps stop → `vacuum_break` | Immediate air ingress + loss of wiper rotation | SIS: emergency N₂ purge; Procedural: isolation; Mechanical: check valves |

**Implications for Phase 4 data model**:

1. `hazop_event_groups.process_transition_type` captures the transition phase in the chain — not the initiating event and not the final response.
2. `hazop_event_groups.event_type` captures the initiating cause class.
3. The event group `description` field should document the full cascade chain narrative.
4. Response groups with `logic_type = 'sequential'` are the primary model for multi-step coordinated shutdowns that must follow the cascade chain in order.
5. `common_cause_group` tags ensure that events sharing a failure root (e.g., all power-failure cascades) are not credited as independent protection layers against each other.

**This model is the basis for Phase 5 LOPA scenario construction. Each cascade chain = one LOPA scenario.**

### 3.6 Common-Cause Failure Groups

`common_cause_group TEXT` field on `hazop_event_groups` and `hazop_response_groups`.

Vocabulary:

| Value | Shared failure mode |
|---|---|
| `vacuum_system` | Shared vacuum ejector, vacuum pump, or vacuum line |
| `thermal_oil` | Shared thermal oil heater or circuit |
| `power` | Shared electrical power supply (UPS or mains) |
| `instrument_air` | Shared instrument air supply |
| `cooling_water` | Shared cooling water circuit |
| `utilities` | General utility failure (power + instrument air + cooling simultaneously) |
| `control_system` | Shared DCS/PLC control system (common mode software fault) |
| `shared_equipment` | Physical equipment shared across multiple process nodes |

**LOPA independence rule (Phase 4 enforcement)**:
- Two response groups with the same `common_cause_group` as the triggering event group **cannot both** have `is_independent_protection_layer = true` in the same scenario.
- The `phase4-summary` API checks for this violation and reports it as a "CCF independence warning".

### 3.7 Safety Critical Element Registry

New table `hazop_safety_critical_elements` — lightweight Phase 5 readiness tracker.

An SCE is any piece of equipment, system, or procedure whose failure could cause a major accident or whose correct operation is necessary to prevent or limit a major accident.

This table is populated from Phase 4 SIF and interlock records. It provides the Phase 5 proof-test planning basis.

---

## 4. Phase 4B — C&E Matrix, SIF, Interlock, Alarm/Trip (unchanged scope)

Structure unchanged from v1.1. The v1.2 additions are field-level only:

| Table | v1.2 new fields |
|---|---|
| `hazop_interlocks` | `logic_type`, `criticality_class`, `is_independent_protection_layer` |
| `hazop_interlock_actions` | `confidence_score` |
| `hazop_alarm_trips` | `criticality_class`, `confidence_score` |
| `hazop_safety_functions` | `is_independent_protection_layer` |

---

## 5. Complete Schema (v1.2 Final)

> **DDL protocol**: All table creation and alterations via direct `psql` only (drizzle-kit push hangs in this environment). Update `shared/schema.ts` in parallel after each psql block.

### 5.1 Phase 4A Tables

#### `hazop_event_groups` (v1.2 — adds `process_transition_type`, `common_cause_group`)

```sql
CREATE TABLE hazop_event_groups (
  id                       SERIAL PRIMARY KEY,
  study_id                 INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  group_number             TEXT NOT NULL,
  group_name               TEXT NOT NULL,
  event_type               TEXT NOT NULL
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  process_transition_type  TEXT
    CHECK (process_transition_type IN (
      'evaporation','condensation','flashing','devolatilization',
      'film_formation','film_breakdown','foaming','entrainment',
      'thermal_cracking','vacuum_break'
    )),
  common_cause_group       TEXT
    CHECK (common_cause_group IN (
      'vacuum_system','thermal_oil','power','instrument_air',
      'cooling_water','utilities','control_system','shared_equipment'
    )),
  description              TEXT,
  operating_regime         TEXT CHECK (operating_regime IN ('atmospheric','vacuum','pressure')),
  phase_state              TEXT CHECK (phase_state IN ('liquid','two_phase','vapor')),
  process_function         TEXT,
  source                   TEXT NOT NULL DEFAULT 'manual'
                             CHECK (source IN ('auto_extracted','manual')),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, group_number)
);
```

#### `hazop_event_group_members` (unchanged from v1.1)

```sql
CREATE TABLE hazop_event_group_members (
  id             SERIAL PRIMARY KEY,
  group_id       INT NOT NULL REFERENCES hazop_event_groups(id) ON DELETE CASCADE,
  deviation_id   INT NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE,
  UNIQUE (group_id, deviation_id)
);
```

#### `hazop_response_groups` (v1.2 — adds `logic_type`, `criticality_class`, `is_independent_protection_layer`, `common_cause_group`)

```sql
CREATE TABLE hazop_response_groups (
  id                              SERIAL PRIMARY KEY,
  study_id                        INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  group_number                    TEXT NOT NULL,
  group_name                      TEXT NOT NULL,
  protection_layer                TEXT NOT NULL
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  logic_type                      TEXT
    CHECK (logic_type IN (
      'parallel','sequential','latched','permissive','voting','manual_reset'
    )),
  criticality_class               TEXT
    CHECK (criticality_class IN ('instant','fast','medium','slow','operator_managed')),
  is_independent_protection_layer BOOLEAN NOT NULL DEFAULT false,
  common_cause_group              TEXT
    CHECK (common_cause_group IN (
      'vacuum_system','thermal_oil','power','instrument_air',
      'cooling_water','utilities','control_system','shared_equipment'
    )),
  description                     TEXT,
  source                          TEXT NOT NULL DEFAULT 'manual'
                                    CHECK (source IN ('auto_extracted','manual')),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                      INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, group_number)
);
```

#### `hazop_response_group_actions` (v1.2 — adds `confidence_score`)

```sql
CREATE TABLE hazop_response_group_actions (
  id                    SERIAL PRIMARY KEY,
  response_group_id     INT NOT NULL REFERENCES hazop_response_groups(id) ON DELETE CASCADE,
  sequence_no           INT NOT NULL,
  action_description    TEXT NOT NULL,
  action_type           TEXT
    CHECK (action_type IN (
      'stop','open','close','alarm','start','cooldown',
      'isolate','de_energise','vent','other'
    )),
  tag_ref               TEXT,
  confidence_score      INT CHECK (confidence_score BETWEEN 0 AND 100),
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  source_action_id      INT REFERENCES hazop_actions(id) ON DELETE SET NULL,
  UNIQUE (response_group_id, sequence_no)
);

COMMENT ON COLUMN hazop_response_group_actions.confidence_score IS
  'Integer 0–100. Populated by extraction engine for auto_extracted rows only. NULL for manual rows.';
```

### 5.2 Phase 4B Tables

#### `hazop_ce_matrices` (unchanged from v1.1)

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

#### `hazop_ce_rows` (unchanged from v1.1)

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
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_cause_id       INT REFERENCES hazop_causes(id) ON DELETE SET NULL,
  event_group_id        INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,
  UNIQUE (matrix_id, row_number)
);
```

#### `hazop_ce_columns` (unchanged from v1.1)

```sql
CREATE TABLE hazop_ce_columns (
  id                    SERIAL PRIMARY KEY,
  matrix_id             INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  col_number            INT NOT NULL,
  description           TEXT NOT NULL,
  col_type              TEXT NOT NULL DEFAULT 'interlock'
    CHECK (col_type IN (
      'alarm','trip','shutdown','interlock','sis','process_action','other'
    )),
  protection_layer      TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  tag_ref               TEXT,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  source_action_id      INT REFERENCES hazop_actions(id) ON DELETE SET NULL,
  response_group_id     INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  UNIQUE (matrix_id, col_number)
);
```

#### `hazop_ce_cells` (unchanged from v1.1)

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

#### `hazop_safety_functions` (v1.2 — adds `is_independent_protection_layer`)

```sql
CREATE TABLE hazop_safety_functions (
  id                              SERIAL PRIMARY KEY,
  study_id                        INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  sif_number                      TEXT NOT NULL,
  description                     TEXT NOT NULL,
  process_demand                  TEXT,
  safety_action                   TEXT,
  sil_required                    INT CHECK (sil_required IN (1,2,3,4)),
  response_time_sec               INT,
  initiating_tag                  TEXT,
  final_element                   TEXT,
  protection_layer                TEXT NOT NULL DEFAULT 'SIS'
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  is_independent_protection_layer BOOLEAN NOT NULL DEFAULT true,
  status                          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','verified','approved')),
  source_deviation_id             INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id             INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  ce_column_id                    INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  response_group_id               INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                      INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, sif_number)
);
```

#### `hazop_interlocks` (v1.2 — adds `logic_type`, `criticality_class`, `is_independent_protection_layer`)

```sql
CREATE TABLE hazop_interlocks (
  id                              SERIAL PRIMARY KEY,
  study_id                        INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  interlock_number                TEXT NOT NULL,
  interlock_type                  TEXT NOT NULL
    CHECK (interlock_type IN ('process','safety','SIS')),
  event_type                      TEXT
    CHECK (event_type IN (
      'process_deviation','equipment_failure','utility_failure',
      'vacuum_failure','phase_transition','thermal_runaway',
      'overpressure','operator_error','instrument_failure','power_failure'
    )),
  protection_layer                TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  logic_type                      TEXT
    CHECK (logic_type IN (
      'parallel','sequential','latched','permissive','voting','manual_reset'
    )),
  criticality_class               TEXT
    CHECK (criticality_class IN ('instant','fast','medium','slow','operator_managed')),
  is_independent_protection_layer BOOLEAN NOT NULL DEFAULT false,
  description                     TEXT NOT NULL,
  initiating_condition            TEXT,
  initiating_tag                  TEXT,
  final_element_tag               TEXT,
  set_point                       TEXT,
  reset_type                      TEXT CHECK (reset_type IN ('auto','manual')),
  bypass_provision                BOOLEAN NOT NULL DEFAULT false,
  sil_level                       INT CHECK (sil_level IN (1,2,3,4)),
  status                          TEXT NOT NULL DEFAULT 'identified'
    CHECK (status IN ('identified','verified','approved')),
  source_deviation_id             INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id             INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  event_group_id                  INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,
  response_group_id               INT REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  ce_row_id                       INT REFERENCES hazop_ce_rows(id) ON DELETE SET NULL,
  ce_column_id                    INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                      INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, interlock_number)
);
```

#### `hazop_interlock_actions` (v1.2 — adds `confidence_score`)

```sql
CREATE TABLE hazop_interlock_actions (
  id                    SERIAL PRIMARY KEY,
  interlock_id          INT NOT NULL REFERENCES hazop_interlocks(id) ON DELETE CASCADE,
  sequence_no           INT NOT NULL,
  action_description    TEXT NOT NULL,
  action_type           TEXT
    CHECK (action_type IN (
      'stop','open','close','alarm','start','cooldown',
      'isolate','de_energise','vent','other'
    )),
  tag_ref               TEXT,
  confidence_score      INT CHECK (confidence_score BETWEEN 0 AND 100),
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  UNIQUE (interlock_id, sequence_no)
);

COMMENT ON COLUMN hazop_interlock_actions.confidence_score IS
  'Integer 0–100. Populated by extraction engine for auto_extracted rows only. NULL for manual rows.';
```

#### `hazop_alarm_trips` (v1.2 — adds `criticality_class`, `confidence_score`)

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
  criticality_class        TEXT
    CHECK (criticality_class IN ('instant','fast','medium','slow','operator_managed')),
  tag_ref                  TEXT,
  description              TEXT NOT NULL,
  process_parameter        TEXT,
  set_point                TEXT,
  alarm_action             TEXT,
  trip_action              TEXT,
  response_time_sec        INT,
  operator_action_required BOOLEAN NOT NULL DEFAULT true,
  confidence_score         INT CHECK (confidence_score BETWEEN 0 AND 100),
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

COMMENT ON COLUMN hazop_alarm_trips.confidence_score IS
  'Integer 0–100. Populated by extraction engine for auto_extracted rows only. NULL for manual rows.';
```

#### `hazop_safety_critical_elements` (NEW in v1.2)

```sql
CREATE TABLE hazop_safety_critical_elements (
  id                       SERIAL PRIMARY KEY,
  study_id                 INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  sce_number               TEXT NOT NULL,
  tag_ref                  TEXT NOT NULL,
  description              TEXT NOT NULL,
  equipment_type           TEXT,
  protection_layer         TEXT
    CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  linked_sif_id            INT REFERENCES hazop_safety_functions(id) ON DELETE SET NULL,
  linked_interlock_id      INT REFERENCES hazop_interlocks(id) ON DELETE SET NULL,
  proof_test_required      BOOLEAN NOT NULL DEFAULT true,
  inspection_interval_days INT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, sce_number)
);
```

### 5.3 Complete `shared/schema.ts` additions summary

Total new Drizzle table definitions for Phase 4 (v1.2 final count): **9 tables**

| Table | Phase | v1.x introduced | v1.2 field additions |
|---|---|---|---|
| `hazop_event_groups` | 4A | v1.1 | `process_transition_type`, `common_cause_group` |
| `hazop_event_group_members` | 4A | v1.1 | none |
| `hazop_response_groups` | 4A | v1.1 | `logic_type`, `criticality_class`, `is_independent_protection_layer`, `common_cause_group` |
| `hazop_response_group_actions` | 4A | v1.1 | `confidence_score` |
| `hazop_ce_matrices` | 4B | v1.1 | none |
| `hazop_ce_rows` | 4B | v1.1 | none |
| `hazop_ce_columns` | 4B | v1.1 | none |
| `hazop_ce_cells` | 4B | v1.1 | none |
| `hazop_safety_functions` | 4B | v1.1 | `is_independent_protection_layer` |
| `hazop_interlocks` | 4B | v1.1 | `logic_type`, `criticality_class`, `is_independent_protection_layer` |
| `hazop_interlock_actions` | 4B | v1.1 | `confidence_score` |
| `hazop_alarm_trips` | 4B | v1.1 | `criticality_class`, `confidence_score` |
| `hazop_safety_critical_elements` | 4B | **v1.2 new** | — |

### 5.4 Number sequence formats (complete)

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
| SCE | `SCE-{nn:03d}` | `SCE-001` |

All use `MAX() + 1` with advisory lock `study_id * 10000 + 4001`.

---

## 6. API Routes

All routes registered in `server/hazop-routes.ts` under `// PHASE 4A START` and `// PHASE 4B START` comment blocks.

### 6.1 Phase 4A — Event Groups (v1.2: `process_transition_type`, `common_cause_group` in request body)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/event-groups` | List all event groups. Optional filters: `?event_type=`, `?process_transition_type=`, `?common_cause_group=` |
| `POST` | `/api/hazop/studies/:studyId/event-groups` | Create event group |
| `PATCH` | `/api/hazop/event-groups/:id` | Update |
| `DELETE` | `/api/hazop/event-groups/:id` | Delete (cascades members) |
| `POST` | `/api/hazop/event-groups/:id/members` | Add deviation to group |
| `DELETE` | `/api/hazop/event-group-members/:id` | Remove deviation from group |
| `POST` | `/api/hazop/studies/:studyId/event-groups/extract` | Regime-aware auto-grouping with process_transition_type inference (see §9) |

### 6.2 Phase 4A — Response Groups (v1.2: `logic_type`, `criticality_class`, `is_independent_protection_layer`, `common_cause_group` in request body)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/response-groups` | List. Filters: `?protection_layer=`, `?logic_type=`, `?criticality_class=`, `?is_independent_protection_layer=` |
| `POST` | `/api/hazop/studies/:studyId/response-groups` | Create |
| `PATCH` | `/api/hazop/response-groups/:id` | Update |
| `DELETE` | `/api/hazop/response-groups/:id` | Delete (cascades actions) |
| `POST` | `/api/hazop/response-groups/:id/actions` | Add action. `confidence_score` set by server for auto_extracted actions |
| `PATCH` | `/api/hazop/response-group-actions/:id` | Update action (client cannot set `confidence_score`) |
| `DELETE` | `/api/hazop/response-group-actions/:id` | Remove action |
| `POST` | `/api/hazop/studies/:studyId/response-groups/extract` | Auto-extract with confidence scoring |

### 6.3 Phase 4B — C&E Matrix (unchanged from v1.1)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/ce-matrices` | List matrices |
| `POST` | `/api/hazop/studies/:studyId/ce-matrices` | Create matrix |
| `GET` | `/api/hazop/ce-matrices/:id/full` | Full matrix (rows, columns, cells, linked counts) |
| `PATCH` | `/api/hazop/ce-matrices/:id` | Update title/status |
| `DELETE` | `/api/hazop/ce-matrices/:id` | Delete (draft only) |
| `POST` | `/api/hazop/ce-matrices/:id/populate-from-groups` | Populate rows from event groups + columns from response groups |
| `POST` | `/api/hazop/ce-matrices/:id/rows` | Add row manually |
| `PATCH` | `/api/hazop/ce-rows/:rowId` | Update row |
| `DELETE` | `/api/hazop/ce-rows/:rowId` | Delete row |
| `POST` | `/api/hazop/ce-matrices/:id/columns` | Add column manually |
| `PATCH` | `/api/hazop/ce-columns/:colId` | Update column |
| `DELETE` | `/api/hazop/ce-columns/:colId` | Delete column |
| `PUT` | `/api/hazop/ce-matrices/:id/cells` | Bulk upsert cells |

### 6.4 Phase 4B — Safety Functions (v1.2: `is_independent_protection_layer` in body)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/safety-functions` | List. Filters: `?protection_layer=`, `?is_independent_protection_layer=` |
| `POST` | `/api/hazop/studies/:studyId/safety-functions` | Create |
| `PATCH` | `/api/hazop/safety-functions/:id` | Update |
| `DELETE` | `/api/hazop/safety-functions/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/safety-functions/extract-from-sis-groups` | Auto-create SIFs from SIS-layer response groups; `is_independent_protection_layer` defaults to `true` for SIS layer, `false` for shared CCF groups |

### 6.5 Phase 4B — Interlocks (v1.2: `logic_type`, `criticality_class`, `is_independent_protection_layer` in body)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/interlocks` | List. Filters: `?type=`, `?event_type=`, `?logic_type=`, `?criticality_class=` |
| `POST` | `/api/hazop/studies/:studyId/interlocks` | Create |
| `PATCH` | `/api/hazop/interlocks/:id` | Update |
| `DELETE` | `/api/hazop/interlocks/:id` | Delete (draft only) |
| `POST` | `/api/hazop/interlocks/:id/actions` | Add interlock action; `confidence_score` set server-side for auto_extracted |
| `PATCH` | `/api/hazop/interlock-actions/:id` | Update action |
| `DELETE` | `/api/hazop/interlock-actions/:id` | Delete action |
| `POST` | `/api/hazop/studies/:studyId/interlocks/extract` | Auto-extract with confidence scoring |

### 6.6 Phase 4B — Alarm/Trip Register (v1.2: `criticality_class`, `confidence_score` in list response)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/alarm-trips` | List. Filters: `?alarm_type=`, `?priority=`, `?rationalization_status=`, `?event_type=`, `?criticality_class=` |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips` | Create |
| `PATCH` | `/api/hazop/alarm-trips/:id` | Update |
| `DELETE` | `/api/hazop/alarm-trips/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips/extract` | Auto-extract; `confidence_score` and `criticality_class` set by engine |

### 6.7 Phase 4B — Safety Critical Elements (NEW in v1.2)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/safety-critical-elements` | List SCEs. Filters: `?protection_layer=`, `?proof_test_required=` |
| `POST` | `/api/hazop/studies/:studyId/safety-critical-elements` | Create SCE |
| `PATCH` | `/api/hazop/safety-critical-elements/:id` | Update |
| `DELETE` | `/api/hazop/safety-critical-elements/:id` | Delete |
| `POST` | `/api/hazop/studies/:studyId/safety-critical-elements/generate-from-sis` | Auto-generate SCE records from all approved SIS interlocks + SIF records |

### 6.8 Phase 4 Summary (v1.2 additions)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/phase4-summary` | Counts per entity + linkage completeness % + BPCS/SIS split + CCF independence warnings + orphan record count + SCE coverage % + confidence score distribution |

---

## 7. UI Pages

### 7.1 `hazop-phase4-dashboard.tsx` (v1.2 additions)
**Route**: `/hazop/studies/:id/phase4`

New indicators added to Phase 4A status card:
- CCF independence warnings badge (red count if CCF violations detected)
- Confidence score distribution mini chart: low/medium/high/verified breakdown
- `is_independent_protection_layer` coverage: % of SIS response groups with IPL flag set

### 7.2 `hazop-event-groups.tsx` (v1.2 additions)
**Route**: `/hazop/studies/:id/event-groups`

New columns:
- **Transition Type**: `process_transition_type` badge (teal colour)
- **CCF Group**: `common_cause_group` badge (amber colour, shown only when set)

Transition type badge vocabulary display:
`vacuum_break` → "Vacuum Break", `foaming` → "Foaming", `film_breakdown` → "Film Breakdown", etc.

Edit dialog adds:
- "Process Transition Type" dropdown (optional)
- "Common-Cause Group" dropdown (optional)

### 7.3 `hazop-response-groups.tsx` (v1.2 additions)
**Route**: `/hazop/studies/:id/response-groups`

New table columns:
- **Logic**: `logic_type` badge (parallel=sky, sequential=blue, latched=orange, permissive=green, voting=purple, manual_reset=red)
- **Urgency**: `criticality_class` badge (instant=red, fast=orange, medium=amber, slow=yellow, operator_managed=grey)
- **IPL**: `is_independent_protection_layer` checkbox indicator
- **CCF Group**: `common_cause_group` badge when set

Expandable action rows now show confidence_score badge per action.

Edit dialog adds:
- "Execution Logic" dropdown
- "Criticality Class" dropdown
- "Independent Protection Layer" toggle with tooltip explaining LOPA significance
- "Common-Cause Group" dropdown

### 7.4 `hazop-ce-matrix.tsx` (unchanged from v1.1)

Column header tooltip update: show `logic_type` and `criticality_class` from linked response group.

### 7.5 `hazop-safety-functions.tsx` (v1.2 additions)

New column: **IPL** — `is_independent_protection_layer` Boolean indicator (shield icon when true, dash when false).

### 7.6 `hazop-interlocks.tsx` (v1.2 additions)
**Route**: `/hazop/studies/:id/interlocks`

New table columns:
- **Logic**: `logic_type` badge
- **Urgency**: `criticality_class` badge
- **IPL**: `is_independent_protection_layer` indicator

Expandable action rows show `confidence_score` badge per action.

Edit dialog adds:
- "Execution Logic" dropdown
- "Criticality Class" dropdown
- "Independent Protection Layer" toggle

### 7.7 `hazop-alarm-trips.tsx` (v1.2 additions)
**Route**: `/hazop/studies/:id/alarm-trips`

New columns:
- **Urgency**: `criticality_class` badge
- **Confidence**: `confidence_score` badge (shown only for auto_extracted rows)

### 7.8 `hazop-safety-critical-elements.tsx` (NEW in v1.2)
**Route**: `/hazop/studies/:id/safety-critical-elements`

Columns: SCE No. | Tag Ref | Description | Equipment Type | Protection Layer | Linked SIF | Linked Interlock | Proof Test Required | Inspection Interval (days) | Notes  

Actions:
- "Generate from SIS Records" button — auto-creates SCE records from approved SIS interlocks and SIF records
- Manual create/edit/delete
- Export to CSV (for Phase 5 proof-test schedule seeding)

### 7.9 Navigation wiring (same as v1.1, plus SCE tab)

Phase 4 dashboard adds tab navigation: Overview | Event Groups | Response Groups | C&E Matrix | Safety Functions | Interlocks | Alarms & Trips | SCE Registry

---

## 8. Linkage to Phase 3 Worksheet Data

Traceability map unchanged from v1.1. v1.2 additions:

```
PHASE 4B (NEW v1.2)
  hazop_safety_critical_elements
    ├── linked_sif_id → hazop_safety_functions
    └── linked_interlock_id → hazop_interlocks
```

### 8.1 CCF independence validation rule (v1.2)

The `POST /api/hazop/studies/:studyId/phase4-summary` endpoint checks:

> For each `hazop_safety_functions` record where `is_independent_protection_layer = true`, verify that the linked `response_group_id.common_cause_group` does NOT match the `event_group_id.common_cause_group` of the initiating event linked to the same scenario (via `ce_row_id → event_group_id`).

Violations are returned in `summary.ccf_independence_warnings` array with the conflicting entity IDs. These are warnings, not errors — the record is allowed to exist, but the user must review it.

---

## 9. Regime-Aware Extraction Engine (v1.2)

### 9.1 Event type auto-classification rules (unchanged from v1.1)

See v1.1 §9.1 — identical rules. 15 classification rules + `process_deviation` fallback.

### 9.2 Process transition type auto-inference rules (NEW in v1.2)

| Phase 3 Node Condition | `event_type` | Inferred `process_transition_type` |
|---|---|---|
| `operating_regime = 'vacuum'`, `phase_state = 'liquid'` | `vacuum_failure` | `vacuum_break` |
| `operating_regime = 'vacuum'`, `phase_state = 'two_phase'` | `vacuum_failure` | `entrainment` |
| `phase_state = 'two_phase'`, level deviation | `phase_transition` | `foaming` |
| `phase_state = 'two_phase'`, flow deviation | `phase_transition` | `entrainment` |
| `phase_state = 'vapor'`, high temperature | `thermal_runaway` | `thermal_cracking` |
| `phase_state = 'vapor'`, high pressure | `overpressure` | `devolatilization` |
| `process_function = 'TWFE Evaporation'`, high temperature + vacuum | `vacuum_failure` | `film_breakdown` |
| `process_function = 'TWFE Evaporation'`, low temperature + vacuum | `vacuum_failure` | `film_formation` |
| `process_function = 'Degasoil Flash'`, pressure deviation | `overpressure` | `flashing` |
| cooling system failure in any node | `utility_failure` | `condensation` |
| fallback | — | NULL (user must assign manually) |

### 9.3 Protection layer and confidence scoring (v1.2 extension of v1.1 §9.2)

Base classification rules unchanged. Confidence score calculation added (see §3.4 scoring algorithm).

Additional confidence deductions:
- `process_transition_type = NULL` after extraction: −5 (transition type could not be inferred)
- `common_cause_group` is NULL but event_type is `power_failure` or `utility_failure`: −5 (CCF group expected)

### 9.4 Regime-specific protection auto-suggestions (unchanged from v1.1 §9.3)

All 7 suggestion rules unchanged. `criticality_class` is now also auto-set:

| Auto-suggested action | `criticality_class` set by engine |
|---|---|
| N₂ break valve open | `instant` |
| Feed pump stop | `instant` |
| Heater de-energise | `instant` |
| Separator level trip | `fast` |
| Foaming alarm | `medium` |
| Cooldown sequence | `fast` |
| Relief device activation | `instant` (Mechanical — no active logic required) |

### 9.5 CCF group auto-assignment (NEW in v1.2)

| Detected condition | Auto-assigned `common_cause_group` |
|---|---|
| `event_type = 'power_failure'` | `power` |
| `event_type = 'utility_failure'` AND `process_function` contains "vacuum" | `vacuum_system` |
| `event_type = 'utility_failure'` AND cooling system involved | `cooling_water` |
| `event_type = 'instrument_failure'` AND instrument_air referenced | `instrument_air` |
| `event_type = 'vacuum_failure'` | `vacuum_system` |
| Response group with `protection_layer = 'BPCS'` AND shared DCS reference | `control_system` |
| Fallback | NULL (user assigns manually) |

### 9.6 Extraction pipeline summary (v1.2 final)

```
Input: Phase 3 hazop_nodes (operating_regime, phase_state, process_function)
         + hazop_deviations
         + hazop_safeguards (safeguard_type, tag_ref)
         + hazop_actions

Step 1: Event type classification (15-rule table → event_type)
Step 2: Process transition inference (10-rule table → process_transition_type)
Step 3: CCF group auto-assignment (5-rule table → common_cause_group)
Step 4: Deviation grouping → hazop_event_groups (by event_type + transition_type + regime)
Step 5: Safeguard classification (protection_layer from safeguard_type)
Step 6: BPCS/SIS split logic (mixed safeguards auto-split)
Step 7: Response group building (logic_type + criticality_class auto-set)
Step 8: Confidence score calculation (0–100 per action)
Step 9: Auto-suggestions for missing regime-specific actions (marked auto_extracted, requires confirmation)
Step 10: IPL flag defaulting (SIS without shared CCF = true; shared CCF = false)

Output: Populated hazop_event_groups, hazop_event_group_members,
        hazop_response_groups, hazop_response_group_actions
        (all source = 'auto_extracted', confidence_score set, criticality_class set)
```

---

## 10. Zero-Trust Audit Checklist (v1.2)

All v1.1 checklist items retained. v1.2 additions:

### 10.1 Process transition type
- [ ] `process_transition_type` column exists on `hazop_event_groups` with CHECK constraint
- [ ] Extraction engine correctly infers `film_breakdown` for `process_function = 'TWFE Evaporation'` + high temperature + vacuum
- [ ] NULL transition type renders as "— (Not Assigned)" in UI, not as blank

### 10.2 Execution logic classification
- [ ] `logic_type` CHECK constraint rejects values outside the 6-value vocabulary
- [ ] `logic_type = 'sequential'` + expandable action list show sequence_no ordering in UI
- [ ] `logic_type = 'voting'` interlocks show SIL level validation prompt (voting logic implies SIS)

### 10.3 Criticality classification
- [ ] `criticality_class` CHECK constraint on all three tables
- [ ] Alarm rationalisation kanban shows criticality class colour band
- [ ] C&E column header tooltip shows criticality_class from linked response group
- [ ] Extraction engine sets `criticality_class = 'instant'` for N₂ break and feed stop actions

### 10.4 Confidence scoring
- [ ] `confidence_score` column exists with `CHECK (confidence_score BETWEEN 0 AND 100)`
- [ ] Client cannot POST `confidence_score` on action create (server ignores it; only engine writes it)
- [ ] Manual rows have `confidence_score = NULL` (verified in DB after manual create)
- [ ] Score 0–49 shows red "Low" badge; 50–74 amber; 75–89 green; 90–100 blue
- [ ] Running extraction twice does not create duplicate actions (idempotent)

### 10.5 IPL independence flag
- [ ] `is_independent_protection_layer` column exists on all three tables
- [ ] CCF independence warning logic returns violations correctly for overlapping common_cause_group
- [ ] `phase4-summary` returns `ccf_independence_warnings` array (not nested error)
- [ ] SIS auto-extract defaults `is_independent_protection_layer = true` for non-CCF groups

### 10.6 Common-cause failure groups
- [ ] `common_cause_group` CHECK constraint rejects unknown values
- [ ] Auto-assignment sets `common_cause_group = 'vacuum_system'` for `event_type = 'vacuum_failure'` nodes
- [ ] CCF independence check: two SIS IPLs in same scenario with same `common_cause_group` raises warning (not error)

### 10.7 Safety Critical Elements
- [ ] `hazop_safety_critical_elements` table created with all specified columns
- [ ] `sce_number` UNIQUE per `study_id`
- [ ] SCE auto-generate route creates one SCE per approved SIS interlock/SIF (no duplicates on re-run)
- [ ] CSV export from SCE page returns all 11 columns with correct headers
- [ ] Deleting a linked SIF/interlock sets FK to NULL (SET NULL, not CASCADE)

### 10.8 Dynamic hazard-chain architecture
- [ ] Phase 4 dashboard shows cascade chain example in the "About Phase 4" info panel
- [ ] Event group edit dialog includes a "Cascade Chain Description" textarea linked to the group's `description` field
- [ ] Response group with `logic_type = 'sequential'` shows a "This models a cascade shutdown sequence" hint

---

## 11. Rollback Plan

### 11.1 Schema rollback (v1.2 — psql, FK dependency order)

```sql
-- Phase 4B tables first
DROP TABLE IF EXISTS hazop_safety_critical_elements CASCADE;
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

All Phase 4 tables are new additions. No `ALTER TABLE` on existing Phase 3 tables. Rollback has zero risk to Phase 3 data.

### 11.2 Code rollback (unchanged from v1.1)

Remove Phase 4A/4B comment blocks from `server/hazop-routes.ts`, remove Phase 4 table definitions from `shared/schema.ts`, remove Phase 4 routes from `App.tsx` and loaders.

### 11.3 Checkpoint strategy

Create a named checkpoint `"Pre-Phase4A-schema"` immediately before running T4A-001 psql DDL.

---

## 12. Phase 4 Readiness Gate

### 12.1 Phase 3 gates (confirmed)
- [x] Phase 3 closure approved 2026-05-25
- [x] Generation engine operational; worksheet, actions pages working
- [x] Node regime fields (`operating_regime`, `phase_state`, `process_function`) in DB

### 12.2 Critical pre-implementation gates

- [ ] At least one HAZOP study has deviations generated
- [ ] **`hazop_safeguards.safeguard_type` vocabulary confirmed populated** — extraction engine classification depends entirely on this field. Run: `SELECT safeguard_type, COUNT(*) FROM hazop_safeguards GROUP BY safeguard_type;`
- [ ] Product owner approves 10-value `event_type` vocabulary (frozen post-schema)
- [ ] Product owner approves 10-value `process_transition_type` vocabulary (frozen post-schema)
- [ ] Product owner approves 6-value `protection_layer` vocabulary
- [ ] Product owner approves 6-value `logic_type` vocabulary
- [ ] Product owner approves 5-value `criticality_class` vocabulary
- [ ] Product owner approves 8-value `common_cause_group` vocabulary
- [ ] Product owner approves 9-value `action_type` vocabulary
- [ ] Phase 4A must complete and pass ZTA before Phase 4B coding begins

### 12.3 Vocabulary freeze notice

All CHECK constraint vocabulary values are **frozen at schema creation time**. Adding new vocabulary values after tables are populated requires:
1. `ALTER TABLE ... DROP CONSTRAINT ...` to drop the existing CHECK constraint
2. Re-add with new values
3. Update `shared/schema.ts` Zod enums
4. Update all UI dropdown options

This is a **planned migration** — not a zero-downtime change. Product owner must approve vocabularies in full before T4A-001 begins.

---

## 13. Sub-Task Breakdown (v1.2)

| ID | Task | Blocked By | v1.2 additions vs v1.1 |
|---|---|---|---|
| T4A-001 | Schema: Phase 4A tables (psql + schema.ts) | Phase 3 gate check | v1.2: 4 extra fields on event_groups and response_groups; `confidence_score` on response_group_actions |
| T4A-002 | Routes: Event group CRUD + regime-aware extract | T4A-001 | v1.2: `process_transition_type` inference, CCF auto-assign in extract |
| T4A-003 | Routes: Response group CRUD + action CRUD + extract | T4A-001 | v1.2: `logic_type`, `criticality_class`, `is_independent_protection_layer`, CCF auto-assign, confidence scoring in extract |
| T4A-004 | UI: Event groups page | T4A-002 | v1.2: Transition Type + CCF Group columns and dropdowns |
| T4A-005 | UI: Response groups page | T4A-003 | v1.2: Logic + Urgency + IPL columns, confidence badges on actions |
| T4A-006 | ZTA: Phase 4A verification | T4A-004, T4A-005 | v1.2: ZTA §10.1–10.6 additions |
| T4B-001 | Schema: Phase 4B tables (psql + schema.ts) | T4A-006 | v1.2: New fields on interlocks, alarm_trips, safety_functions; new `hazop_safety_critical_elements` table |
| T4B-002 | Routes: C&E matrix CRUD + populate-from-groups | T4B-001 | Unchanged |
| T4B-003 | Routes: Safety functions CRUD + SIS extract | T4B-001 | v1.2: `is_independent_protection_layer` in extract default |
| T4B-004 | Routes: Interlocks CRUD + interlock actions + extract | T4B-001 | v1.2: `logic_type`, `criticality_class`, `is_independent_protection_layer`, `confidence_score` on actions |
| T4B-005 | Routes: Alarm/trip CRUD + extract | T4B-001 | v1.2: `criticality_class`, `confidence_score` in extract |
| T4B-006 | Routes: Phase 4 summary + CCF warnings | T4B-002…T4B-005 | v1.2: CCF independence check, confidence score distribution, SCE coverage % |
| T4B-007 | UI: C&E matrix editor | T4B-002 | v1.2: Column tooltip shows logic_type + criticality_class |
| T4B-008 | UI: Safety functions page | T4B-003 | v1.2: IPL indicator column |
| T4B-009 | UI: Interlocks page | T4B-004 | v1.2: Logic + Urgency + IPL columns; confidence badges on actions |
| T4B-010 | UI: Alarm/trip rationalization page | T4B-005 | v1.2: Urgency + Confidence columns |
| T4B-011 | UI: SCE registry page | T4B-003, T4B-004 | v1.2: **New page** `hazop-safety-critical-elements.tsx` |
| T4B-012 | UI: Phase 4 dashboard + nav wiring (with SCE tab) | T4B-007…T4B-011 | v1.2: CCF warning badge, confidence distribution, SCE tab |
| T4B-013 | ZTA: Full Phase 4 verification | T4B-012 | v1.2: All §10 additions |

**Total sub-tasks: 19** (T4A-001→T4A-006, T4B-001→T4B-013)

---

*End of Phase 4 Execution Plan v1.2 (Final Architecture)*  
*Prepared: 2026-05-25 | Submitted for final product owner approval before any schema work begins*  
*v1.0 and v1.1 are SUPERSEDED — do not implement either prior version*
