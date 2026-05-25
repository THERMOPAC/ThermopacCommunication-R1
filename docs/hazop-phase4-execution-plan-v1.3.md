# HAZOP Phase 4 — Execution Plan v1.3 (Final Architecture — Implementation Ready)
**Document**: `docs/hazop-phase4-execution-plan-v1.3.md`  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.2.md` (v1.2 superseded)  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.1.md` (v1.1 superseded)  
**Supersedes**: `docs/hazop-phase4-execution-plan-v1.0.md` (v1.0 superseded)  
**Status**: SUBMITTED FOR FINAL APPROVAL — Implementation NOT yet authorised  
**Revision reason**: 9 final architectural additions required before coding begins  
**Author**: QMS Architect  
**Predecessor**: Phase 3 closure approved 2026-05-25 | Phase 4 v1.2 architecture strong, corrections required  

---

## Revision Summary (v1.2 → v1.3)

| # | Addition | v1.2 Gap | v1.3 Resolution |
|---|---|---|---|
| B1 | Explicit scenario modeling | Scenarios inferred indirectly from event groups + matrices | New table `hazop_scenarios`; one entity per hazardous event chain |
| B2 | Consequence severity | `criticality_class` models response urgency only | `consequence_severity` field (5-value) on scenarios, event groups, interlocks, safety functions |
| B3 | Operating mode awareness | No mode distinction (startup vs. normal vs. upset vs. emergency) | `operating_mode` field (7-value) on scenarios, event groups, response groups; extraction engine becomes mode-aware |
| B4 | Safeguard effectiveness | No IPL quality rating for LOPA/AI ranking | `effectiveness_rating` field (4-value) on response groups, safety functions, interlocks, alarm/trips |
| B5 | Human dependency classification | Procedural/Operator IPLs undifferentiated | `human_dependency_level` field (5-value) on response groups, alarm/trips, scenarios |
| B6 | Fail-state modeling | No final-element fail-state data | `fail_state` field (5-value) on interlock actions + SCE table |
| B7 | Baseline revision/freeze | No frozen approved safety baseline mechanism | `baseline_revision TEXT` field on matrices, safety functions, interlocks, alarm/trips, scenarios |
| B8 | Explicit scenario linkage map | Only narrative cascade chains in §3.5 | Formal linkage map added to §3 and §8 |
| B9 | v1.3 plan document | — | This document |

---

## Table of Contents
1. [Scope](#1-scope)
2. [Exclusions](#2-exclusions)
3. [Phase 4A — Safety Logic Modeling Layer (v1.3)](#3-phase-4a--safety-logic-modeling-layer-v13)
4. [Phase 4B — Engineering Safety Artefacts (v1.3)](#4-phase-4b--engineering-safety-artefacts-v13)
5. [Complete Schema (v1.3 Final)](#5-complete-schema-v13-final)
6. [API Routes (v1.3)](#6-api-routes-v13)
7. [UI Pages (v1.3)](#7-ui-pages-v13)
8. [Linkage Architecture (v1.3 Final)](#8-linkage-architecture-v13-final)
9. [Regime-Aware Extraction Engine (v1.3)](#9-regime-aware-extraction-engine-v13)
10. [Zero-Trust Audit Checklist (v1.3)](#10-zero-trust-audit-checklist-v13)
11. [Rollback Plan](#11-rollback-plan)
12. [Phase 4 Readiness Gate (v1.3)](#12-phase-4-readiness-gate-v13)
13. [Sub-Task Breakdown (v1.3)](#13-sub-task-breakdown-v13)

---

## 1. Scope

Phase 4 transforms raw HAZOP worksheet outputs into structured, traceable engineering safety artefacts suitable for SIS design, alarm rationalization, and LOPA preparation (Phase 5).

Phase 4 sub-phases: Phase 4A (Safety Logic Modeling) → Phase 4B (Engineering Safety Artefacts). Phase 4A must complete and be ZTA-verified before Phase 4B coding begins.

### v1.3 scope additions summary

| Addition | Phase | Purpose |
|---|---|---|
| Explicit scenario entities (`hazop_scenarios`) | 4B | One-to-one with Phase 5 LOPA scenarios; formally links event group → consequence → response groups → IPLs → residual risk |
| `consequence_severity` | 4A + 4B | Rates the worst-case consequence of each scenario/event/interlock |
| `operating_mode` | 4A | Distinguishes hazards that occur only in startup, cleaning, or emergency modes vs. normal operation |
| `effectiveness_rating` | 4B | Rates safeguard/IPL quality; AI-assisted safeguard ranking in future |
| `human_dependency_level` | 4A + 4B | Models the reliability of human-dependent protection layers |
| `fail_state` | 4B | Final-element energize/de-energize-to-trip classification for SIS design |
| `baseline_revision` | 4B | Freeze/audit-trail for approved safety baselines (MOC evidence) |

---

## 2. Exclusions

Same as v1.2. Additionally confirmed as Phase 5 scope:

| Excluded | Reason |
|---|---|
| LOPA PFD calculations | Requires `effectiveness_rating` + `is_independent_protection_layer` as inputs — both now in Phase 4 |
| Baseline approval workflow (digital signatures) | Phase 5; `baseline_revision` field pre-positions the data |
| Management of Change (MOC) register | Phase 5; `baseline_revision` provides the before/after reference |
| AI safeguard ranking engine | Phase 5; `effectiveness_rating` + `confidence_score` provide the training signal |
| Operating mode procedural controls | Phase 5 SRS; `operating_mode` field captures the mode, SRS prose is Phase 5 |

---

## 3. Phase 4A — Safety Logic Modeling Layer (v1.3)

### 3.1 Event Groups (v1.3 additions: `consequence_severity`, `operating_mode`)

**`consequence_severity`** — classifies the worst-case consequence if all safeguards in this event group fail:

| Value | Meaning (process safety context) |
|---|---|
| `minor` | Minor injury, minor environmental release, recoverable equipment damage |
| `serious` | Serious injury (RIDDOR-reportable), contained spill, significant equipment damage |
| `major` | Multiple injuries, moderate release to atmosphere, major equipment loss |
| `critical` | Single fatality, significant environmental harm, unit shutdown |
| `catastrophic` | Multiple fatalities, major release, site-wide or off-site consequences |

**`operating_mode`** — the plant operating mode during which this event group is credible:

| Value | TWFE context |
|---|---|
| `startup` | Wiper motor first run, initial vacuum pull-down, first feed introduction |
| `normal` | Continuous steady-state TWFE evaporation |
| `shutdown` | Planned feed stop, vacuum let-down, wiper motor stop sequence |
| `cleaning` | CIP or solvent flush through evaporator |
| `maintenance` | Equipment open, isolation in place, permit-to-work active |
| `upset` | Deviation from normal (recovered without shutdown) |
| `emergency` | Uncontrolled deviation requiring emergency response |

### 3.2 Response Groups (v1.3 additions: `operating_mode`, `effectiveness_rating`, `human_dependency_level`)

**`effectiveness_rating`** — overall effectiveness of this response group as a protection layer:

| Value | Meaning |
|---|---|
| `low` | Effectiveness uncertain; relies on untested assumptions |
| `medium` | Effective under defined conditions; some uncertainty |
| `high` | Demonstrated effective; tested or verified by design |
| `verified` | Formally verified (proof-tested, certified, or LOPA-credited with demonstrated PFD) |

**`human_dependency_level`** — degree to which this response depends on correct human action:

| Value | Meaning |
|---|---|
| `none` | Fully automatic; no human action required (SIS or mechanical) |
| `low` | Operator acknowledges but does not act (alarm only, auto-trip follows) |
| `medium` | Operator action required within > 10 minutes |
| `high` | Operator action required within 1–10 minutes |
| `critical` | Operator action required within < 1 minute; human reliability is the limiting factor |

**`operating_mode`** — the mode(s) in which this response group is active (same vocabulary as event groups).

### 3.3 Scenario Modeling (NEW in v1.3 — Phase 4A output, Phase 4B entity)

A **Scenario** is the explicit, named, traceable entity representing one complete hazardous event chain from initiating event to residual risk. Each scenario:
- Has exactly one initiating event group
- May be linked to multiple response groups (the IPL stack)
- Has a consequence severity, operating mode, and residual risk rating
- Is the direct input to one Phase 5 LOPA calculation

Scenarios are created in Phase 4B (after event groups and response groups are established) but are informed by Phase 4A modeling. They are listed here because they complete the Phase 4A logical model.

**TWFE scenario examples:**

| Scenario No. | Title | Initiating Event Group | Transition Type | Consequence Severity |
|---|---|---|---|---|
| SC-001 | Vacuum system failure during normal operation | EG-001 (vacuum_failure) | vacuum_break | catastrophic |
| SC-002 | Film breakdown — wiper motor overload | EG-002 (equipment_failure) | film_breakdown | critical |
| SC-003 | Two-phase foaming — separator level high | EG-003 (phase_transition) | foaming | major |
| SC-004 | Thermal runaway — heater temperature runaway | EG-004 (thermal_runaway) | thermal_cracking | catastrophic |
| SC-005 | Power failure — all vacuum pumps stop | EG-005 (power_failure) | vacuum_break | catastrophic |

### 3.4 Explicit Scenario Linkage Map

Each scenario links through the full Phase 4 architecture:

```
hazop_scenarios
  ├── initiating_event_group_id → hazop_event_groups
  │     ├── event_type            (e.g. vacuum_failure)
  │     ├── process_transition_type (e.g. vacuum_break)
  │     ├── operating_mode        (e.g. normal)
  │     ├── consequence_severity  (e.g. catastrophic)
  │     └── common_cause_group    (e.g. vacuum_system)
  │
  ├── consequence_severity     (at scenario level — may differ from group level)
  ├── operating_mode
  ├── residual_risk            (after all IPLs)
  ├── baseline_revision        (freeze/MOC reference)
  │
  └── (Phase 5) hazop_scenario_ipl_stack (deferred table)
        ├── response_group_id → hazop_response_groups
        │     ├── protection_layer
        │     ├── logic_type
        │     ├── criticality_class
        │     ├── effectiveness_rating
        │     ├── is_independent_protection_layer
        │     ├── human_dependency_level
        │     └── common_cause_group
        │
        ├── safety_function_id → hazop_safety_functions
        │     ├── sil_required
        │     ├── response_time_sec
        │     └── is_independent_protection_layer
        │
        └── interlock_id → hazop_interlocks
              ├── logic_type
              ├── fail_state (via hazop_interlock_actions)
              └── effectiveness_rating
```

> Note: The full IPL stack linking table (`hazop_scenario_ipl_stack`) is deferred to Phase 5. In Phase 4, the linkage is documented via `hazop_scenarios.initiating_event_group_id` and the narrative `notes` field. Phase 5 adds the formal IPL stack table and PFD calculations.

### 3.5 Dynamic Hazard-Chain Architecture (unchanged from v1.2 §3.5)

TWFE process safety operates on a multi-step cascading hazard chain:
```
Initiating Event
  → Process Transition (process_transition_type)
    → Cascading Hazard
      → Operating Mode (operating_mode)
        → Consequence (consequence_severity)
          → Coordinated Multi-Layer Response (response groups, IPLs)
            → Residual Risk (residual_risk in hazop_scenarios)
```

Six documented TWFE cascade chains from v1.2 §3.5 remain the authoritative reference. The v1.3 addition is that each chain now maps directly to a `hazop_scenarios` record with all fields populated.

### 3.6 Common-Cause Failure Groups (unchanged from v1.2)

`common_cause_group` 8-value vocabulary on event groups and response groups — see v1.2 §3.6.

---

## 4. Phase 4B — Engineering Safety Artefacts (v1.3)

### 4.1 C&E Matrix — adds `baseline_revision`

`baseline_revision TEXT` field on `hazop_ce_matrices`. Format: `BL-{nn:03d}` (e.g. `BL-001`).

When a matrix is approved (`status = 'approved'`), the approver assigns a `baseline_revision`. Future modifications require incrementing to the next baseline revision and documenting the change reason in the matrix `scope_description` field. This is the MOC audit trail anchor.

### 4.2 Safety Functions — adds `consequence_severity`, `effectiveness_rating`, `is_independent_protection_layer`, `baseline_revision`

- `consequence_severity`: worst-case consequence if this SIF fails
- `effectiveness_rating`: SIF performance classification (`low`/`medium`/`high`/`verified`)
- `baseline_revision`: freeze anchor for MOC

### 4.3 Interlocks — adds `consequence_severity`, `effectiveness_rating`, `baseline_revision`

- `consequence_severity`: consequence if this interlock fails to act
- `effectiveness_rating`: interlock performance classification

### 4.4 Interlock Actions — adds `fail_state`

`fail_state` — final element behavior on de-energisation or power failure:

| Value | Meaning | Typical application |
|---|---|---|
| `fail_open` | Valve/damper opens on de-energisation | Emergency vent, N₂ break valve |
| `fail_closed` | Valve closes on de-energisation | Feed isolation valve, heater fuel valve |
| `fail_last` | Holds last position (spring-return or hydraulic) | Modulating control valve in normal service |
| `deenergize_to_trip` | System trips (safe state) when power is removed | Most SIS final elements (IEC 61511 preferred) |
| `energize_to_trip` | System trips when powered; requires energy to maintain safe state | Rare; only where de-energize creates a hazard |

### 4.5 Alarm/Trip Register — adds `effectiveness_rating`, `human_dependency_level`, `baseline_revision`

- `effectiveness_rating`: alarm/trip performance classification
- `human_dependency_level`: required for alarms where human action is the primary protection
- `baseline_revision`: freeze anchor

### 4.6 Scenarios — new Phase 4B table (see §5.15)

### 4.7 Safety Critical Elements — adds `fail_state`

`fail_state` on SCE records: final-element behavior classification for proof-test planning. A `deenergize_to_trip` SCE requires a proof test that confirms the trip path. A `fail_closed` valve requires a full-stroke test.

---

## 5. Complete Schema (v1.3 Final)

> **DDL protocol**: All via direct `psql` only. Update `shared/schema.ts` in parallel after each psql block.

### 5.1 `hazop_event_groups` (v1.3: adds `consequence_severity`, `operating_mode`)

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
  consequence_severity     TEXT
    CHECK (consequence_severity IN (
      'minor','serious','major','critical','catastrophic'
    )),
  operating_mode           TEXT
    CHECK (operating_mode IN (
      'startup','normal','shutdown','cleaning','maintenance','upset','emergency'
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

### 5.2 `hazop_event_group_members` (unchanged)

```sql
CREATE TABLE hazop_event_group_members (
  id             SERIAL PRIMARY KEY,
  group_id       INT NOT NULL REFERENCES hazop_event_groups(id) ON DELETE CASCADE,
  deviation_id   INT NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE,
  UNIQUE (group_id, deviation_id)
);
```

### 5.3 `hazop_response_groups` (v1.3: adds `operating_mode`, `effectiveness_rating`, `human_dependency_level`)

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
  effectiveness_rating            TEXT
    CHECK (effectiveness_rating IN ('low','medium','high','verified')),
  human_dependency_level          TEXT
    CHECK (human_dependency_level IN ('none','low','medium','high','critical')),
  operating_mode                  TEXT
    CHECK (operating_mode IN (
      'startup','normal','shutdown','cleaning','maintenance','upset','emergency'
    )),
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

### 5.4 `hazop_response_group_actions` (v1.2: `confidence_score` — unchanged)

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
```

### 5.5 `hazop_ce_matrices` (v1.3: adds `baseline_revision`)

```sql
CREATE TABLE hazop_ce_matrices (
  id                SERIAL PRIMARY KEY,
  study_id          INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  node_id           INT REFERENCES hazop_nodes(id) ON DELETE SET NULL,
  matrix_number     TEXT NOT NULL,
  title             TEXT,
  scope_description TEXT,
  baseline_revision TEXT,
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','reviewed','approved')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, matrix_number)
);

COMMENT ON COLUMN hazop_ce_matrices.baseline_revision IS
  'Freeze reference (e.g. BL-001). Assigned at approval. Change requires new revision.';
```

### 5.6 `hazop_ce_rows` (unchanged)

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

### 5.7 `hazop_ce_columns` (unchanged)

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

### 5.8 `hazop_ce_cells` (unchanged)

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

### 5.9 `hazop_safety_functions` (v1.3: adds `consequence_severity`, `effectiveness_rating`, `baseline_revision`)

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
  consequence_severity            TEXT
    CHECK (consequence_severity IN (
      'minor','serious','major','critical','catastrophic'
    )),
  effectiveness_rating            TEXT
    CHECK (effectiveness_rating IN ('low','medium','high','verified')),
  is_independent_protection_layer BOOLEAN NOT NULL DEFAULT true,
  baseline_revision               TEXT,
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

### 5.10 `hazop_interlocks` (v1.3: adds `consequence_severity`, `effectiveness_rating`, `baseline_revision`)

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
  consequence_severity            TEXT
    CHECK (consequence_severity IN (
      'minor','serious','major','critical','catastrophic'
    )),
  effectiveness_rating            TEXT
    CHECK (effectiveness_rating IN ('low','medium','high','verified')),
  is_independent_protection_layer BOOLEAN NOT NULL DEFAULT false,
  baseline_revision               TEXT,
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

### 5.11 `hazop_interlock_actions` (v1.3: adds `fail_state`)

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
  fail_state            TEXT
    CHECK (fail_state IN (
      'fail_open','fail_closed','fail_last',
      'deenergize_to_trip','energize_to_trip'
    )),
  tag_ref               TEXT,
  confidence_score      INT CHECK (confidence_score BETWEEN 0 AND 100),
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  UNIQUE (interlock_id, sequence_no)
);
```

### 5.12 `hazop_alarm_trips` (v1.3: adds `effectiveness_rating`, `human_dependency_level`, `baseline_revision`)

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
  effectiveness_rating     TEXT
    CHECK (effectiveness_rating IN ('low','medium','high','verified')),
  human_dependency_level   TEXT
    CHECK (human_dependency_level IN ('none','low','medium','high','critical')),
  tag_ref                  TEXT,
  description              TEXT NOT NULL,
  process_parameter        TEXT,
  set_point                TEXT,
  alarm_action             TEXT,
  trip_action              TEXT,
  response_time_sec        INT,
  operator_action_required BOOLEAN NOT NULL DEFAULT true,
  confidence_score         INT CHECK (confidence_score BETWEEN 0 AND 100),
  baseline_revision        TEXT,
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

### 5.13 `hazop_safety_critical_elements` (v1.3: adds `fail_state`)

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
  fail_state               TEXT
    CHECK (fail_state IN (
      'fail_open','fail_closed','fail_last',
      'deenergize_to_trip','energize_to_trip'
    )),
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

### 5.14 `hazop_scenarios` (NEW in v1.3)

```sql
CREATE TABLE hazop_scenarios (
  id                        SERIAL PRIMARY KEY,
  study_id                  INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  scenario_number           TEXT NOT NULL,
  title                     TEXT NOT NULL,
  initiating_event_group_id INT REFERENCES hazop_event_groups(id) ON DELETE SET NULL,
  consequence_description   TEXT NOT NULL,
  consequence_severity      TEXT NOT NULL
    CHECK (consequence_severity IN (
      'minor','serious','major','critical','catastrophic'
    )),
  operating_mode            TEXT
    CHECK (operating_mode IN (
      'startup','normal','shutdown','cleaning','maintenance','upset','emergency'
    )),
  human_dependency_level    TEXT
    CHECK (human_dependency_level IN ('none','low','medium','high','critical')),
  residual_risk             TEXT
    CHECK (residual_risk IN (
      'negligible','tolerable','unacceptable','intolerable'
    )),
  baseline_revision         TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, scenario_number)
);

COMMENT ON TABLE hazop_scenarios IS
  'One scenario = one complete hazardous event chain. Direct input to Phase 5 LOPA scenario. '
  'Each scenario links to one initiating_event_group and (via notes/Phase 5) to its full IPL stack.';
COMMENT ON COLUMN hazop_scenarios.baseline_revision IS
  'Freeze reference (BL-001 etc.). Assigned at approval. Change requires new revision and MOC.';
```

### 5.15 Complete table inventory (v1.3 final)

| Table | Phase | v1.x introduced | v1.3 changes |
|---|---|---|---|
| `hazop_event_groups` | 4A | v1.1 | +`consequence_severity`, +`operating_mode` |
| `hazop_event_group_members` | 4A | v1.1 | unchanged |
| `hazop_response_groups` | 4A | v1.1 | +`operating_mode`, +`effectiveness_rating`, +`human_dependency_level` |
| `hazop_response_group_actions` | 4A | v1.1 | unchanged (confidence_score from v1.2) |
| `hazop_ce_matrices` | 4B | v1.1 | +`baseline_revision` |
| `hazop_ce_rows` | 4B | v1.1 | unchanged |
| `hazop_ce_columns` | 4B | v1.1 | unchanged |
| `hazop_ce_cells` | 4B | v1.1 | unchanged |
| `hazop_safety_functions` | 4B | v1.1 | +`consequence_severity`, +`effectiveness_rating`, +`baseline_revision` |
| `hazop_interlocks` | 4B | v1.1 | +`consequence_severity`, +`effectiveness_rating`, +`baseline_revision` |
| `hazop_interlock_actions` | 4B | v1.1 | +`fail_state` |
| `hazop_alarm_trips` | 4B | v1.1 | +`effectiveness_rating`, +`human_dependency_level`, +`baseline_revision` |
| `hazop_safety_critical_elements` | 4B | v1.2 | +`fail_state` |
| `hazop_scenarios` | 4B | **v1.3 new** | — |

**Total Phase 4 tables: 14**

### 5.16 Number sequence formats (complete)

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
| Scenario | `SC-{nn:03d}` | `SC-001` |
| Baseline Revision | `BL-{nn:03d}` | `BL-001` |

All use `MAX() + 1` with advisory lock `study_id * 10000 + 4001`.

---

## 6. API Routes (v1.3)

All routes in `server/hazop-routes.ts` under `// PHASE 4A START` and `// PHASE 4B START` comment blocks. All require `ensureAuthenticated`. All mutating routes check `study.status === 'draft'`.

### 6.1 Phase 4A — Event Groups (v1.3 filter additions)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/event-groups` | Filters: `?event_type=`, `?process_transition_type=`, `?consequence_severity=`, `?operating_mode=`, `?common_cause_group=` |
| `POST` | `/api/hazop/studies/:studyId/event-groups` | Create |
| `PATCH` | `/api/hazop/event-groups/:id` | Update |
| `DELETE` | `/api/hazop/event-groups/:id` | Delete |
| `POST` | `/api/hazop/event-groups/:id/members` | Add deviation |
| `DELETE` | `/api/hazop/event-group-members/:id` | Remove deviation |
| `POST` | `/api/hazop/studies/:studyId/event-groups/extract` | Regime + mode-aware auto-grouping |

### 6.2 Phase 4A — Response Groups (v1.3 filter additions)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/response-groups` | Filters: `?protection_layer=`, `?logic_type=`, `?criticality_class=`, `?effectiveness_rating=`, `?human_dependency_level=`, `?operating_mode=` |
| `POST` | `/api/hazop/studies/:studyId/response-groups` | Create |
| `PATCH` | `/api/hazop/response-groups/:id` | Update |
| `DELETE` | `/api/hazop/response-groups/:id` | Delete |
| `POST` | `/api/hazop/response-groups/:id/actions` | Add action |
| `PATCH` | `/api/hazop/response-group-actions/:id` | Update |
| `DELETE` | `/api/hazop/response-group-actions/:id` | Delete |
| `POST` | `/api/hazop/studies/:studyId/response-groups/extract` | Auto-extract with effectiveness_rating + human_dependency_level defaults |

### 6.3 Phase 4B — Scenarios (NEW in v1.3)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/scenarios` | List. Filters: `?consequence_severity=`, `?operating_mode=`, `?residual_risk=` |
| `POST` | `/api/hazop/studies/:studyId/scenarios` | Create scenario |
| `GET` | `/api/hazop/scenarios/:id` | Get single scenario with linked event group summary |
| `PATCH` | `/api/hazop/scenarios/:id` | Update |
| `DELETE` | `/api/hazop/scenarios/:id` | Delete (draft only, or when `baseline_revision` is NULL) |
| `POST` | `/api/hazop/studies/:studyId/scenarios/generate-from-event-groups` | Auto-generate one draft scenario per event group (idempotent) |
| `POST` | `/api/hazop/scenarios/:id/set-baseline` | Set `baseline_revision` (assigns next `BL-{nnn}` number; freezes scenario — prevents delete) |

### 6.4 Phase 4B — C&E Matrix (adds baseline route)

All v1.2 routes unchanged, plus:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hazop/ce-matrices/:id/set-baseline` | Assign next `BL-{nnn}` baseline revision to matrix |

### 6.5 Phase 4B — Safety Functions (adds baseline route)

All v1.2 routes unchanged, plus:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hazop/safety-functions/:id/set-baseline` | Assign next `BL-{nnn}` baseline revision |

### 6.6 Phase 4B — Interlocks (adds baseline route)

All v1.2 routes unchanged, plus:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hazop/interlocks/:id/set-baseline` | Assign next `BL-{nnn}` baseline revision |

### 6.7 Phase 4B — Alarm/Trip Register (adds baseline route)

All v1.2 routes unchanged, plus:

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/hazop/alarm-trips/:id/set-baseline` | Assign next `BL-{nnn}` baseline revision |

### 6.8 Phase 4B — Safety Critical Elements (adds `fail_state` in body)

All v1.2 routes unchanged. `fail_state` is now a body field on create/update and a visible column in the list response.

### 6.9 Phase 4 Summary (v1.3 additions)

`GET /api/hazop/studies/:studyId/phase4-summary` — additions:

- `scenario_count` — total scenarios
- `scenarios_with_baseline` — % of scenarios with `baseline_revision` set
- `scenarios_by_severity` — breakdown by `consequence_severity`
- `scenarios_by_operating_mode` — breakdown by `operating_mode`
- `ccf_independence_warnings` — array of CCF violation objects (unchanged from v1.2)
- `effectiveness_distribution` — low/medium/high/verified counts across response groups + safety functions + interlocks
- `human_dependency_critical_count` — count of response groups/alarm-trips with `human_dependency_level = 'critical'`
- `fail_state_not_set_count` — count of interlock actions and SCEs with `fail_state = NULL`

---

## 7. UI Pages (v1.3)

### 7.1 `hazop-phase4-dashboard.tsx` (v1.3 additions)

New cards:
- **Scenarios**: count, % with baseline, severity breakdown donut chart
- **Human Dependency Alert**: count of `critical` human-dependency responses (orange badge)
- **Fail-State Coverage**: % of interlock actions with fail_state set
- **Baseline Coverage**: % of key entities (matrices, SIFs, interlocks) with baseline_revision set

Extraction wizard now includes Step 0: "Generate Draft Scenarios from Event Groups" as a pre-step to the three Phase 4A steps.

### 7.2 `hazop-event-groups.tsx` (v1.3 additions)

New columns:
- **Severity**: `consequence_severity` badge (catastrophic=dark red, critical=red, major=orange, serious=amber, minor=green)
- **Mode**: `operating_mode` badge (startup=blue, normal=grey, shutdown=purple, cleaning=teal, maintenance=brown, upset=amber, emergency=red)

Edit dialog adds:
- "Consequence Severity" dropdown
- "Operating Mode" dropdown

### 7.3 `hazop-response-groups.tsx` (v1.3 additions)

New columns:
- **Effectiveness**: `effectiveness_rating` badge (verified=blue, high=green, medium=amber, low=red)
- **Human Dep.**: `human_dependency_level` badge (none=grey, low=green, medium=amber, high=orange, critical=red)
- **Mode**: `operating_mode` badge

Edit dialog adds:
- "Effectiveness Rating" dropdown
- "Human Dependency Level" dropdown
- "Operating Mode" dropdown

### 7.4 `hazop-scenarios.tsx` (NEW in v1.3)
**Route**: `/hazop/studies/:id/scenarios`

Layout:
- Table: SC No. | Title | Initiating Event Group | Transition Type | Consequence | Severity badge | Operating Mode | Residual Risk | Baseline | Created
- Expandable row: consequence description + notes + linked event group summary (event_type, operating_regime, common_cause_group)
- Action buttons per row: Edit | Set Baseline | Delete (disabled if baseline set)
- "Generate from Event Groups" button (auto-creates one draft scenario per event group, idempotent)
- Severity badge colour: catastrophic=dark-red, critical=red-600, major=orange-500, serious=amber-500, minor=green-600
- Residual risk badge: intolerable=dark-red, unacceptable=red, tolerable=amber, negligible=green
- Baseline badge: "BL-001" in indigo when set; "No Baseline" in grey when not

### 7.5 `hazop-safety-functions.tsx` (v1.3 additions)

New columns: **Severity** (`consequence_severity` badge), **Effectiveness** (`effectiveness_rating` badge), **Baseline** (BL badge)

### 7.6 `hazop-interlocks.tsx` (v1.3 additions)

New columns: **Severity** badge, **Effectiveness** badge, **Baseline** badge  
Expandable action rows: now show `fail_state` per action (chip: `fail_open`, `fail_closed`, etc.)

### 7.7 `hazop-alarm-trips.tsx` (v1.3 additions)

New columns: **Effectiveness** badge, **Human Dep.** badge, **Baseline** badge

### 7.8 `hazop-safety-critical-elements.tsx` (v1.3 additions)

New column: **Fail State** (`fail_state` chip)

### 7.9 Navigation — adds Scenarios tab

Phase 4 dashboard tab navigation (v1.3 final):  
Overview | Scenarios | Event Groups | Response Groups | C&E Matrix | Safety Functions | Interlocks | Alarms & Trips | SCE Registry

---

## 8. Linkage Architecture (v1.3 Final)

### 8.1 Full Phase 4 entity map

```
PHASE 3 SOURCES
  hazop_nodes           (operating_regime, phase_state, process_function, operating_mode → extraction input)
  hazop_deviations      (deviation_id → event group member, CE row, scenario cause)
  hazop_safeguards      (safeguard_type, tag_ref → response group action source)
  hazop_actions         (action description → response group action source)

PHASE 4A — SAFETY LOGIC LAYER
  hazop_event_groups
    ├── members → hazop_event_group_members → hazop_deviations
    ├── event_type, process_transition_type, consequence_severity, operating_mode
    └── common_cause_group

  hazop_response_groups
    ├── actions → hazop_response_group_actions (sequence, action_type, fail_state pending [Phase 5], confidence_score)
    ├── protection_layer, logic_type, criticality_class, effectiveness_rating
    ├── human_dependency_level, operating_mode
    └── is_independent_protection_layer, common_cause_group

PHASE 4B — ENGINEERING SAFETY ARTEFACTS
  hazop_scenarios
    ├── initiating_event_group_id → hazop_event_groups
    ├── consequence_severity, operating_mode, human_dependency_level
    ├── residual_risk
    └── baseline_revision (freeze anchor)

  hazop_ce_matrices → hazop_ce_rows + hazop_ce_columns → hazop_ce_cells
    ├── rows: event_group_id or source_deviation_id
    ├── columns: response_group_id or source_safeguard_id
    └── baseline_revision

  hazop_safety_functions
    ├── response_group_id → hazop_response_groups
    ├── consequence_severity, effectiveness_rating, is_independent_protection_layer
    └── baseline_revision

  hazop_interlocks
    ├── actions → hazop_interlock_actions (sequence, action_type, fail_state, confidence_score)
    ├── event_group_id, response_group_id
    ├── consequence_severity, effectiveness_rating
    └── baseline_revision

  hazop_alarm_trips
    ├── event_group_id, interlock_id
    ├── effectiveness_rating, human_dependency_level
    └── baseline_revision

  hazop_safety_critical_elements
    ├── linked_sif_id → hazop_safety_functions
    ├── linked_interlock_id → hazop_interlocks
    └── fail_state, proof_test_required, inspection_interval_days
```

### 8.2 Cascade rules on Phase 3 deletion

All Phase 4 FK columns referencing Phase 3 tables use `ON DELETE SET NULL`. Phase 3 record deletion orphans Phase 4 references (nulls the FK) without deleting Phase 4 records. The `phase4-summary` API reports orphan counts.

### 8.3 Baseline freeze rules

A record with `baseline_revision` set may **not** be deleted. Attempting to delete a baselined record returns `HTTP 409: Cannot delete a baselined safety record`. Modification of a baselined record is permitted but the UI must display a "⚠ Baselined — this change should be tracked in your MOC register" warning. The baseline_revision field itself is not updated automatically on modification — that requires a new `POST .../set-baseline` call.

---

## 9. Regime-Aware Extraction Engine (v1.3)

### 9.1–9.5 (unchanged from v1.2)

All event type rules, process transition inference rules, protection layer classification, confidence scoring, CCF auto-assignment, and BPCS/SIS split logic are identical to v1.2 §9.1–9.5.

### 9.6 Operating mode auto-inference (NEW in v1.3)

The extraction engine infers `operating_mode` for event groups from Phase 3 node context where possible:

| Phase 3 Condition | Inferred `operating_mode` |
|---|---|
| Node `description` or deviation `description` contains keyword "startup" or "commissioning" | `startup` |
| Node `description` contains "cleaning" or "CIP" | `cleaning` |
| Node `description` contains "maintenance" or "isolation" | `maintenance` |
| Node `description` contains "shutdown" or "depressure" or "drain" | `shutdown` |
| `event_type IN ('thermal_runaway','overpressure')` AND no other mode keyword found | `upset` |
| `event_type IN ('power_failure','utility_failure')` with broad scope | `emergency` |
| Fallback (no keyword match) | `normal` |

All inferred modes are `source = 'auto_extracted'` and are user-editable. The UI shows a "Review Mode" prompt for auto-extracted event groups where mode was defaulted to `normal`.

### 9.7 Consequence severity auto-inference (NEW in v1.3)

| Event Type | Process Transition | Operating Regime | Auto-inferred `consequence_severity` |
|---|---|---|---|
| `vacuum_failure` | `vacuum_break` | `vacuum` | `catastrophic` |
| `thermal_runaway` | `thermal_cracking` | any | `catastrophic` |
| `power_failure` | `vacuum_break` | `vacuum` | `catastrophic` |
| `overpressure` | `flashing` or `devolatilization` | any | `critical` |
| `phase_transition` | `foaming` or `entrainment` | any | `major` |
| `equipment_failure` | `film_breakdown` | `vacuum` | `critical` |
| `utility_failure` | `condensation` | any | `serious` |
| `instrument_failure` | any | any | `serious` |
| `operator_error` | any | any | `serious` |
| `process_deviation` | any | any | `minor` (conservative default) |

Auto-inferred severity is `source = 'auto_extracted'` and must be reviewed by the HAZOP team before setting a baseline revision.

### 9.8 Effectiveness rating defaults (NEW in v1.3)

Auto-extract sets `effectiveness_rating` based on `protection_layer` and `confidence_score`:

| `protection_layer` | `confidence_score` | Default `effectiveness_rating` |
|---|---|---|
| `SIS` | ≥ 75 | `high` |
| `SIS` | 50–74 | `medium` |
| `SIS` | < 50 | `low` |
| `Mechanical` | any | `high` (relief devices have certified performance) |
| `BPCS` | ≥ 75 | `medium` |
| `BPCS` | < 75 | `low` |
| `Procedural` | any | `low` (default; human procedures unreliable without verification) |
| `Operator` | any | `low` |
| `Relief` | any | `verified` (certified, fixed set-point) |

### 9.9 Human dependency defaults (NEW in v1.3)

Auto-extract sets `human_dependency_level` based on `protection_layer`:

| `protection_layer` | Default `human_dependency_level` |
|---|---|
| `SIS` | `none` |
| `Mechanical` / `Relief` | `none` |
| `BPCS` | `low` (operator acknowledges, auto-trip follows) |
| `Operator` | `high` |
| `Procedural` | `high` |

### 9.10 Extraction pipeline (v1.3 final — 13 steps)

```
Input: Phase 3 hazop_nodes, hazop_deviations, hazop_safeguards, hazop_actions

Step 1:  Event type classification          → event_type
Step 2:  Process transition inference       → process_transition_type
Step 3:  CCF group auto-assignment          → common_cause_group (event groups)
Step 4:  Operating mode inference           → operating_mode (event groups)
Step 5:  Consequence severity inference     → consequence_severity (event groups)
Step 6:  Deviation grouping                 → hazop_event_groups + hazop_event_group_members
Step 7:  Protection layer classification    → protection_layer (safeguard → response group)
Step 8:  BPCS/SIS split logic               → two response groups when mixed
Step 9:  Logic type + criticality defaults  → logic_type, criticality_class
Step 10: Effectiveness rating defaults      → effectiveness_rating
Step 11: Human dependency defaults          → human_dependency_level
Step 12: Response group building            → hazop_response_groups + actions
Step 13: Confidence score calculation       → confidence_score (0–100 per action)

Post-extract auto-generation:
  → Draft hazop_scenarios (one per event group, idempotent)
  → Flag auto-extracted records with source = 'auto_extracted'
  → Queue "Review Required" items: NULL operating_mode defaults, severity < serious for vacuum/thermal events

Output:
  hazop_event_groups, hazop_event_group_members,
  hazop_response_groups, hazop_response_group_actions,
  hazop_scenarios (draft)
```

---

## 10. Zero-Trust Audit Checklist (v1.3)

All v1.2 checklist items retained. v1.3 additions:

### 10.1 Consequence severity
- [ ] `consequence_severity` CHECK constraint on all 4 tables (event_groups, interlocks, safety_functions, scenarios)
- [ ] Auto-inferred `catastrophic` for `vacuum_failure` + `vacuum_break` + vacuum regime (tested)
- [ ] Severity badge renders correctly in all 4 tables (dark red for catastrophic, not blank)
- [ ] Auto-inferred `minor` for `process_deviation` fallback shows "Review Required" prompt in UI

### 10.2 Operating mode
- [ ] `operating_mode` CHECK constraint on all 3 tables (event_groups, response_groups, scenarios)
- [ ] Auto-inference keyword matching tested: "cleaning" keyword → `cleaning` mode
- [ ] Default fallback to `normal` is correct (confirmed by manual review prompt in UI)
- [ ] Extraction idempotency: running twice does not change already-reviewed operating modes

### 10.3 Safeguard effectiveness
- [ ] `effectiveness_rating` CHECK constraint on all 4 tables
- [ ] Auto-default: `Mechanical` layer → `high`, `Procedural` layer → `low` (tested)
- [ ] `verified` rating only settable manually (extraction engine never assigns `verified`)

### 10.4 Human dependency
- [ ] `human_dependency_level` CHECK constraint on all 3 tables
- [ ] Auto-default: SIS + Mechanical = `none`, Operator + Procedural = `high` (tested)
- [ ] Phase 4 summary `human_dependency_critical_count` returns correct count

### 10.5 Fail state
- [ ] `fail_state` CHECK constraint on `hazop_interlock_actions` and `hazop_safety_critical_elements`
- [ ] `fail_state = NULL` acceptable (not all elements have interlock logic)
- [ ] Phase 4 summary `fail_state_not_set_count` counts only SIS interlock actions with NULL fail_state (not all actions)
- [ ] SCE auto-generate from SIS records: `fail_state` inherited from linked interlock action where available

### 10.6 Baseline revision
- [ ] `set-baseline` route assigns next `BL-{nnn}` using advisory lock (no duplicates)
- [ ] Deleting a record with `baseline_revision` set returns `409`
- [ ] UI shows "⚠ Baselined" warning banner on edit form for baselined records
- [ ] `baseline_revision` field is not cleared on record update (must call `set-baseline` explicitly to change)

### 10.7 Scenarios
- [ ] `hazop_scenarios` table created with all fields and CHECK constraints
- [ ] `scenario_number` UNIQUE per `study_id`
- [ ] `generate-from-event-groups` is idempotent: running twice creates no duplicate scenarios
- [ ] Deleting a scenario with `baseline_revision` set returns `409`
- [ ] `GET /scenarios/:id` returns linked event group summary (group_number, event_type, process_transition_type, consequence_severity)
- [ ] Scenario `residual_risk` field has CHECK constraint enforced
- [ ] Auto-generated scenarios have `status = 'draft'` and `baseline_revision = NULL`

### 10.8 v1.2 items (all retained)
- Process transition type, execution logic, criticality, confidence scoring, IPL independence, CCF groups, SCE registry, hazard-chain architecture — all checklist items from v1.2 §10 remain in effect.

---

## 11. Rollback Plan

### 11.1 Schema rollback (v1.3 — psql, FK dependency order)

```sql
-- Phase 4B (deepest dependencies first)
DROP TABLE IF EXISTS hazop_scenarios CASCADE;
DROP TABLE IF EXISTS hazop_safety_critical_elements CASCADE;
DROP TABLE IF EXISTS hazop_alarm_trips CASCADE;
DROP TABLE IF EXISTS hazop_interlock_actions CASCADE;
DROP TABLE IF EXISTS hazop_interlocks CASCADE;
DROP TABLE IF EXISTS hazop_safety_functions CASCADE;
DROP TABLE IF EXISTS hazop_ce_cells CASCADE;
DROP TABLE IF EXISTS hazop_ce_columns CASCADE;
DROP TABLE IF EXISTS hazop_ce_rows CASCADE;
DROP TABLE IF EXISTS hazop_ce_matrices CASCADE;
-- Phase 4A
DROP TABLE IF EXISTS hazop_response_group_actions CASCADE;
DROP TABLE IF EXISTS hazop_response_groups CASCADE;
DROP TABLE IF EXISTS hazop_event_group_members CASCADE;
DROP TABLE IF EXISTS hazop_event_groups CASCADE;
```

All Phase 4 tables are additions only. No ALTER TABLE on Phase 3 tables. Rollback is zero-risk to Phase 3 data.

### 11.2 Code rollback

Same as v1.2: remove Phase 4A/4B comment blocks from hazop-routes.ts, remove Drizzle table definitions from schema.ts, remove routes from App.tsx and loaders.

### 11.3 Checkpoint strategy

Create named checkpoint `"Pre-Phase4A-schema"` immediately before T4A-001 psql DDL. Restore to end-of-Phase-3 state if ZTA gate fails.

---

## 12. Phase 4 Readiness Gate (v1.3)

### 12.1 Phase 3 gates (confirmed)
- [x] Phase 3 closure approved 2026-05-25
- [x] Generation engine, worksheet, actions pages working
- [x] Node regime fields in DB

### 12.2 Critical pre-implementation gates

- [ ] At least one HAZOP study has deviations generated
- [ ] **`hazop_safeguards.safeguard_type` confirmed populated** — run: `SELECT safeguard_type, COUNT(*) FROM hazop_safeguards GROUP BY safeguard_type;`
- [ ] All vocabularies approved by product owner (see §12.3)
- [ ] Phase 4A ZTA must pass before Phase 4B coding begins

### 12.3 Vocabulary approval checklist (all must be approved before T4A-001)

| Field | Values | Count | Frozen |
|---|---|---|---|
| `event_type` | process_deviation, equipment_failure, utility_failure, vacuum_failure, phase_transition, thermal_runaway, overpressure, operator_error, instrument_failure, power_failure | 10 | Yes |
| `process_transition_type` | evaporation, condensation, flashing, devolatilization, film_formation, film_breakdown, foaming, entrainment, thermal_cracking, vacuum_break | 10 | Yes |
| `consequence_severity` | minor, serious, major, critical, catastrophic | 5 | Yes |
| `operating_mode` | startup, normal, shutdown, cleaning, maintenance, upset, emergency | 7 | Yes |
| `protection_layer` | BPCS, SIS, Mechanical, Procedural, Operator, Relief | 6 | Yes |
| `logic_type` | parallel, sequential, latched, permissive, voting, manual_reset | 6 | Yes |
| `criticality_class` | instant, fast, medium, slow, operator_managed | 5 | Yes |
| `effectiveness_rating` | low, medium, high, verified | 4 | Yes |
| `human_dependency_level` | none, low, medium, high, critical | 5 | Yes |
| `fail_state` | fail_open, fail_closed, fail_last, deenergize_to_trip, energize_to_trip | 5 | Yes |
| `action_type` | stop, open, close, alarm, start, cooldown, isolate, de_energise, vent, other | 10 | Yes |
| `common_cause_group` | vacuum_system, thermal_oil, power, instrument_air, cooling_water, utilities, control_system, shared_equipment | 8 | Yes |
| `residual_risk` | negligible, tolerable, unacceptable, intolerable | 4 | Yes |
| `source` | auto_extracted, manual | 2 | Yes |

**Total vocabulary values across all fields: 97**

Adding any value after schema creation requires a planned migration (DROP + re-add CHECK constraint). Product owner must approve the full table above before T4A-001 begins.

---

## 13. Sub-Task Breakdown (v1.3)

| ID | Task | Blocked By | v1.3 additions vs v1.2 |
|---|---|---|---|
| T4A-001 | Schema: Phase 4A tables (psql + schema.ts) | Phase 3 readiness gate | v1.3: +`consequence_severity`, +`operating_mode` on event_groups; +`operating_mode`, +`effectiveness_rating`, +`human_dependency_level` on response_groups |
| T4A-002 | Routes: Event group CRUD + extract | T4A-001 | v1.3: operating mode inference (Step 4) + consequence severity inference (Step 5) in extract |
| T4A-003 | Routes: Response group CRUD + action CRUD + extract | T4A-001 | v1.3: `effectiveness_rating` + `human_dependency_level` defaults (Steps 10–11) in extract |
| T4A-004 | UI: Event groups page | T4A-002 | v1.3: Severity badge + Mode badge columns; Severity + Mode dropdowns in edit dialog |
| T4A-005 | UI: Response groups page | T4A-003 | v1.3: Effectiveness + Human Dep. + Mode columns in table; corresponding dropdowns in edit dialog |
| T4A-006 | ZTA: Phase 4A verification | T4A-004, T4A-005 | v1.3: §10.1–10.4 new items |
| T4B-001 | Schema: Phase 4B tables (psql + schema.ts) | T4A-006 | v1.3: +`fail_state` on interlock_actions + SCE; +`consequence_severity`/`effectiveness_rating`/`baseline_revision` on SIFs, interlocks, alarm_trips; +`baseline_revision` on matrices; new `hazop_scenarios` table |
| T4B-002 | Routes: C&E matrix CRUD + populate-from-groups + baseline | T4B-001 | v1.3: `baseline_revision` field + `set-baseline` route |
| T4B-003 | Routes: Safety functions CRUD + extract + baseline | T4B-001 | v1.3: `consequence_severity`, `effectiveness_rating`, `baseline_revision` + `set-baseline` route |
| T4B-004 | Routes: Interlocks CRUD + interlock actions + extract + baseline | T4B-001 | v1.3: `consequence_severity`, `effectiveness_rating`, `fail_state`, `baseline_revision` + `set-baseline` route |
| T4B-005 | Routes: Alarm/trip CRUD + extract + baseline | T4B-001 | v1.3: `effectiveness_rating`, `human_dependency_level`, `baseline_revision` + `set-baseline` route |
| T4B-006 | Routes: Scenarios CRUD + generate-from-event-groups + set-baseline | T4B-001 | v1.3: **New route group** |
| T4B-007 | Routes: Phase 4 summary (v1.3 additions) | T4B-002…T4B-006 | v1.3: scenario counts, effectiveness distribution, human_dependency_critical_count, fail_state_not_set_count |
| T4B-008 | UI: C&E matrix editor (baseline badge) | T4B-002 | v1.3: Baseline badge + "Set Baseline" button |
| T4B-009 | UI: Safety functions page (severity + effectiveness + baseline) | T4B-003 | v1.3: 3 new columns |
| T4B-010 | UI: Interlocks page (severity + effectiveness + fail_state + baseline) | T4B-004 | v1.3: 4 new columns/fields |
| T4B-011 | UI: Alarm/trip page (effectiveness + human_dep + baseline) | T4B-005 | v1.3: 3 new columns |
| T4B-012 | UI: Scenarios page (new page) | T4B-006 | v1.3: **New page** `hazop-scenarios.tsx` |
| T4B-013 | UI: SCE registry page (fail_state column) | T4B-001 | v1.3: +fail_state column |
| T4B-014 | UI: Phase 4 dashboard (scenario card + new indicators) | T4B-008…T4B-013 | v1.3: Scenario card, human dep. alert, fail-state coverage, baseline coverage |
| T4B-015 | ZTA: Full Phase 4 verification | T4B-014 | v1.3: All §10 additions |

**Total sub-tasks: 21** (T4A-001→T4A-006, T4B-001→T4B-015)

---

*End of Phase 4 Execution Plan v1.3 (Final Architecture — Implementation Ready)*  
*Prepared: 2026-05-25 | Submitted for final product owner approval*  
*v1.0, v1.1, v1.2 are all SUPERSEDED — do not implement any prior version*  
*Vocabulary approval checklist in §12.3 must be signed off before T4A-001 begins*
