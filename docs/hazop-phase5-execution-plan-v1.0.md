# HAZOP Phase 5 — Execution Plan v1.0
**Document**: `docs/hazop-phase5-execution-plan-v1.0.md`  
**Status**: DRAFT — Submitted for product owner review  
**Predecessor**: Phase 4 formally closed 2026-05-25 (ZTA-4B-CLOSED / UAT-4B-ACCEPTED)  
**Author**: QMS Architect  
**Prepared**: 2026-05-25

---

## Table of Contents
1. [Scope](#1-scope)
2. [Exclusions](#2-exclusions)
3. [Phase 4 Inputs Available to Phase 5](#3-phase-4-inputs-available-to-phase-5)
4. [Phase 5A — LOPA Core (IPL Stack + PFD Calculations)](#4-phase-5a--lopa-core-ipl-stack--pfd-calculations)
5. [Phase 5B — Safety Requirements Specification (SRS)](#5-phase-5b--safety-requirements-specification-srs)
6. [Phase 5C — Management of Change (MOC) Register](#6-phase-5c--management-of-change-moc-register)
7. [Phase 5D — Baseline Approval Workflow](#7-phase-5d--baseline-approval-workflow)
8. [Phase 5E — AI Safeguard Ranking Engine](#8-phase-5e--ai-safeguard-ranking-engine)
9. [Complete Phase 5 Schema](#9-complete-phase-5-schema)
10. [API Routes](#10-api-routes)
11. [UI Pages](#11-ui-pages)
12. [Zero-Trust Audit Checklist](#12-zero-trust-audit-checklist)
13. [Sub-Task Breakdown](#13-sub-task-breakdown)
14. [Readiness Gate](#14-readiness-gate)

---

## 1. Scope

Phase 5 transforms Phase 4B engineering safety artefacts into a **Layer of Protection Analysis (LOPA)** — the industry-standard quantified risk assessment methodology for determining whether protection layers are sufficient and what Safety Integrity Level (SIL) is required for each SIF.

Phase 5 delivers five distinct sub-phases executed in dependency order:

| Sub-phase | Title | Key Output |
|---|---|---|
| **5A** | LOPA Core — IPL Stack & PFD Calculations | `hazop_scenario_ipl_stack`, `hazop_lopa_records`, per-scenario PFD arithmetic |
| **5B** | Safety Requirements Specification (SRS) | `hazop_srs_records` — one SRS per SIF with full SIL, demand rate, response time, proof test |
| **5C** | Management of Change (MOC) Register | `hazop_moc_records` — change tracking against all baselined artefacts |
| **5D** | Baseline Approval Workflow | Digital countersign on `baseline_revision` — approver, date, signature token |
| **5E** | AI Safeguard Ranking | OpenAI-powered ranking of IPL effectiveness; ranked improvement recommendations |

Phase 5 is entirely additive. No Phase 4 schema is modified. All new tables reference Phase 4 records via FK.

---

## 2. Exclusions

The following are confirmed Phase 6+ scope:

| Excluded | Reason |
|---|---|
| SIS detailed design (logic solver specification, I/O list) | Requires P&ID integration and SIL verification software |
| Bow-tie risk diagrams | Requires visualisation engine beyond current stack |
| Fault tree / event tree analysis | Dedicated FTA/ETA tool scope |
| PSM / PSSR regulatory compliance checklists | Regulatory module scope |
| Integration with SIL verification tools (exSILentia, SISTEMA) | Third-party tool integration; export-only in Phase 5 |
| HAZOP report generation (full formal report) | Phase 6; all data exists in DB, report template is phase 6 |
| Process safety information (PSI) document management | Document Control module scope |

---

## 3. Phase 4 Inputs Available to Phase 5

Phase 4 has pre-positioned all data fields required for LOPA. No new Phase 4 data collection is needed.

| Phase 4 Field | Phase 5 Use |
|---|---|
| `hazop_scenarios.consequence_severity` | Determines risk tolerance target frequency |
| `hazop_scenarios.residual_risk` | Pre-screening: `intolerable` scenarios are mandatory LOPA candidates |
| `hazop_scenarios.initiating_event_group_id` | IPL stack root |
| `hazop_response_groups.is_independent_protection_layer` | Only IPL=true RGs enter the LOPA IPL stack |
| `hazop_response_groups.effectiveness_rating` | Seed for PFD assignment |
| `hazop_response_groups.human_dependency_level` | Human factor credit multiplier |
| `hazop_response_groups.protection_layer` | PFD default lookup table (see §4.3) |
| `hazop_response_groups.confidence_score` (via actions) | AI ranking signal |
| `hazop_safety_functions.sil_target` | Proposed SIL — Phase 5 computes required SIL for comparison |
| `hazop_safety_functions.is_independent_protection_layer` | IPL credit in LOPA stack |
| `hazop_interlocks.effectiveness_rating` | PFD seed |
| `hazop_alarm_trips.human_dependency_level` | Operator action credit |
| `hazop_safety_critical_elements.fail_state` | SIS design input for SRS |
| `hazop_scenarios.baseline_revision` | MOC anchor — baseline before change |
| `hazop_ce_matrices` | Verify all scenario/response linkages before LOPA |

---

## 4. Phase 5A — LOPA Core (IPL Stack + PFD Calculations)

### 4.1 Concept

A LOPA calculation for one scenario:

```
Mitigated Event Frequency (MEF) = Initiating Event Frequency (IEF)
                                   × PFD_1 × PFD_2 × ... × PFD_n

where PFD_i is the Probability of Failure on Demand for IPL_i
```

If `MEF ≤ Risk Tolerance Target Frequency (RTTF)`, the scenario is tolerable.  
If `MEF > RTTF`, a new or upgraded IPL is required, and the required SIL is computed as:

```
Required PFD_new_IPL = RTTF / MEF_without_new_IPL
SIL_required = CEIL(-LOG10(Required_PFD_new_IPL))
```

### 4.2 New Table: `hazop_scenario_ipl_stack`

The formal IPL stack — one row per (scenario, IPL) pair. This is the table deferred from Phase 4.

```sql
CREATE TABLE hazop_scenario_ipl_stack (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  scenario_id             INTEGER NOT NULL REFERENCES hazop_scenarios(id) ON DELETE CASCADE,

  -- IPL source (exactly one of these three is non-null)
  response_group_id       INTEGER REFERENCES hazop_response_groups(id) ON DELETE SET NULL,
  safety_function_id      INTEGER REFERENCES hazop_safety_functions(id) ON DELETE SET NULL,
  interlock_id            INTEGER REFERENCES hazop_interlocks(id) ON DELETE SET NULL,

  -- IPL characterisation
  ipl_type                TEXT NOT NULL CHECK (ipl_type IN ('response_group','safety_function','interlock','manual')),
  ipl_label               TEXT NOT NULL,          -- display label for this IPL row
  protection_layer        TEXT NOT NULL CHECK (protection_layer IN ('BPCS','SIS','Mechanical','Procedural','Operator','Relief')),
  is_independent          BOOLEAN NOT NULL DEFAULT false,
  effectiveness_rating    TEXT CHECK (effectiveness_rating IN ('low','medium','high','verified')),
  human_dependency_level  TEXT CHECK (human_dependency_level IN ('none','low','medium','high','critical')),
  fail_state              TEXT CHECK (fail_state IN ('fail_open','fail_closed','fail_last','deenergize_to_trip','energize_to_trip')),

  -- LOPA PFD assignment
  pfd_value               NUMERIC(10,6),          -- 0.000001 to 1.0; NULL = not yet assigned
  pfd_source              TEXT CHECK (pfd_source IN ('default','user_entered','calculated','certified')),
  pfd_basis               TEXT,                   -- justification for PFD (e.g. "SIL 2 certified, IEC 61508")
  credit_applied          BOOLEAN NOT NULL DEFAULT false,  -- true = this IPL's PFD credit is included in MEF calculation

  -- Ordering
  stack_position          INTEGER NOT NULL,        -- position in IPL stack (1 = first independent barrier after IE)

  -- Audit
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              INTEGER REFERENCES users(id),

  UNIQUE (scenario_id, stack_position)
);
```

### 4.3 PFD Default Lookup Table

When an IPL is added to the stack from a response group, the system auto-assigns a `pfd_value` based on `protection_layer` + `effectiveness_rating`. These defaults are editable by the HAZOP team.

| `protection_layer` | `effectiveness_rating` | Default `pfd_value` | Basis |
|---|---|---|---|
| `SIS` | `verified` | 0.001000 | SIL 3 assumption (conservative) |
| `SIS` | `high` | 0.010000 | SIL 2 |
| `SIS` | `medium` | 0.100000 | SIL 1 |
| `SIS` | `low` | 0.300000 | Below SIL 1 — partial credit only |
| `Mechanical` / `Relief` | any | 0.010000 | PSV/PRV certified performance |
| `BPCS` | `high` | 0.100000 | BPCS cannot exceed SIL 1 credit |
| `BPCS` | `medium` | 0.100000 | BPCS standard |
| `BPCS` | `low` | 0.300000 | Degraded BPCS |
| `Procedural` | `high` | 0.100000 | Well-documented, trained, audited |
| `Procedural` | `medium` | 0.300000 | Standard procedure |
| `Procedural` | `low` | 1.000000 | No credit applied |
| `Operator` | `high` | 0.100000 | Operator with adequate time (>10 min) |
| `Operator` | `medium` | 0.300000 | Operator with limited time (1–10 min) |
| `Operator` | `critical` HD | 1.000000 | Operator with <1 min — no credit |

> **Independence rule:** BPCS IPLs and BPCS alarms that share the same initiating cause (common cause failure) cannot both receive PFD credit. The system flags common-cause conflicts automatically via `hazop_response_groups.common_cause_group`.

### 4.4 New Table: `hazop_lopa_records`

One LOPA record per scenario. Contains the IE frequency, risk tolerance, computed MEF, and SIL gap.

```sql
CREATE TABLE hazop_lopa_records (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  scenario_id             INTEGER NOT NULL REFERENCES hazop_scenarios(id) ON DELETE CASCADE,

  lopa_number             TEXT NOT NULL,           -- LOPA-{nnn}; unique per study
  title                   TEXT,

  -- Initiating event frequency
  ie_frequency_per_year   NUMERIC(15,9) NOT NULL,  -- e.g. 0.10 = once per 10 years
  ie_frequency_basis      TEXT,                    -- e.g. "OREDA database, generic pump failure"

  -- Risk tolerance
  consequence_category    TEXT NOT NULL CHECK (consequence_category IN ('minor','serious','major','critical','catastrophic')),
  rttf_per_year           NUMERIC(15,9) NOT NULL,  -- Risk Tolerance Target Frequency
  rttf_basis              TEXT,                    -- e.g. "Company risk criteria, 10^-5/yr for critical"

  -- LOPA result (computed)
  achieved_mef_per_year   NUMERIC(15,9),           -- computed from IPL stack
  pfd_product             NUMERIC(15,9),           -- product of all credited IPL PFDs
  risk_gap_ratio          NUMERIC(15,6),           -- achieved_mef / rttf; <1 = tolerable
  required_additional_pfd NUMERIC(15,9),           -- PFD required from new SIF (if gap exists)
  required_sil            INTEGER CHECK (required_sil IN (1,2,3,4)),  -- derived from required_additional_pfd
  lopa_outcome            TEXT CHECK (lopa_outcome IN ('tolerable','gap_exists','requires_sif','requires_sif_upgrade')),

  -- Baseline and status
  lopa_status             TEXT NOT NULL DEFAULT 'draft'
                          CHECK (lopa_status IN ('draft','in_review','approved')),
  baseline_revision       TEXT,                    -- BL-{nnn} format; set by set-baseline route
  approved_by             INTEGER REFERENCES users(id),
  approved_at             TIMESTAMPTZ,

  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              INTEGER REFERENCES users(id),

  UNIQUE (study_id, lopa_number),
  UNIQUE (scenario_id)                             -- one LOPA per scenario
);
```

### 4.5 Initiating Event Frequency Defaults

The system pre-populates `ie_frequency_per_year` from `event_type`:

| `event_type` | Default IEF (per year) | Basis |
|---|---|---|
| `equipment_failure` | 0.100 | OREDA generic mechanical failure |
| `vacuum_failure` | 0.100 | OREDA vacuum pump/seal failure |
| `thermal_runaway` | 0.010 | Exothermic event — low probability |
| `power_failure` | 0.100 | Utility failure statistics |
| `utility_failure` | 0.300 | Cooling water / instrument air |
| `phase_transition` | 0.300 | Process upset — relatively frequent |
| `instrument_failure` | 0.100 | Generic transmitter failure |
| `operator_error` | 0.010 | Trained operator, procedure in place |
| `process_deviation` | 0.300 | Process variation — frequent |
| `overpressure` | 0.010 | Relief device demand rate |

All IEF defaults are editable by the HAZOP team and must be reviewed before LOPA approval.

### 4.6 Risk Tolerance Target Frequency Defaults

Industry-standard risk criteria by consequence category:

| `consequence_category` | Default RTTF (per year) | Basis |
|---|---|---|
| `minor` | 1.000 × 10⁻² | Minor injury acceptable frequency |
| `serious` | 1.000 × 10⁻³ | RIDDOR event — tolerable at 10⁻³/yr |
| `major` | 1.000 × 10⁻⁴ | Multiple injuries — ALARP threshold |
| `critical` | 1.000 × 10⁻⁵ | Fatality — ALARP threshold |
| `catastrophic` | 1.000 × 10⁻⁶ | Multiple fatalities — broadly acceptable risk |

These defaults should be replaced with company-specific risk criteria before Phase 5 approval.

---

## 5. Phase 5B — Safety Requirements Specification (SRS)

### 5.1 Concept

A Safety Requirements Specification defines the functional and integrity requirements for each Safety Instrumented Function (SIF). It is the formal engineering document required before SIS design can proceed.

Each SRS record is linked to one SIF from Phase 4B and one LOPA record from Phase 5A.

### 5.2 New Table: `hazop_srs_records`

```sql
CREATE TABLE hazop_srs_records (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  safety_function_id      INTEGER NOT NULL REFERENCES hazop_safety_functions(id) ON DELETE CASCADE,
  lopa_id                 INTEGER REFERENCES hazop_lopa_records(id) ON DELETE SET NULL,

  srs_number              TEXT NOT NULL,           -- SRS-{nnn}; unique per study

  -- SIL determination
  sil_required            INTEGER NOT NULL CHECK (sil_required IN (1,2,3,4)),
  sil_proposed            INTEGER CHECK (sil_proposed IN (1,2,3,4)),
  pfd_required            NUMERIC(10,6) NOT NULL,  -- from LOPA gap calculation
  pfd_target              NUMERIC(10,6),           -- design target (must be ≤ pfd_required)

  -- Functional requirements
  process_demand_description TEXT NOT NULL,        -- when must the SIF activate?
  safe_state_description     TEXT NOT NULL,        -- what is the safe state?
  process_input_tag          TEXT,                 -- initiating sensor tag
  final_element_tag          TEXT,                 -- final element tag
  final_element_action       TEXT,                 -- e.g. "de-energise to close"
  fail_state                 TEXT CHECK (fail_state IN ('fail_open','fail_closed','fail_last','deenergize_to_trip','energize_to_trip')),

  -- Response time requirements
  process_safety_time_sec    INTEGER,              -- time from demand to dangerous condition
  response_time_required_sec INTEGER,              -- SIF must actuate within this time
  manual_reset_required      BOOLEAN DEFAULT true,

  -- Proof test requirements
  proof_test_interval_days   INTEGER,              -- TI in PFD calculation
  proof_test_coverage        NUMERIC(5,2),         -- diagnostic coverage % (0–100)
  proof_test_procedure_ref   TEXT,                 -- reference to test procedure document

  -- Architecture
  architecture_type          TEXT CHECK (architecture_type IN ('1oo1','1oo2','2oo3','2oo2','1oo1D')),
  hardware_fault_tolerance   INTEGER DEFAULT 0,    -- HFT per IEC 61508

  -- Approval
  srs_status                 TEXT NOT NULL DEFAULT 'draft'
                             CHECK (srs_status IN ('draft','in_review','approved','superseded')),
  baseline_revision          TEXT,
  approved_by                INTEGER REFERENCES users(id),
  approved_at                TIMESTAMPTZ,

  notes                      TEXT,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  created_by                 INTEGER REFERENCES users(id),

  UNIQUE (study_id, srs_number),
  UNIQUE (safety_function_id)                      -- one SRS per SIF
);
```

---

## 6. Phase 5C — Management of Change (MOC) Register

### 6.1 Concept

Every modification to a baselined safety artefact (scenario, SIF, interlock, LOPA record, SRS) must be documented in an MOC record. The MOC record captures: what changed, why, who authorised it, and the before/after baseline revision.

### 6.2 New Table: `hazop_moc_records`

```sql
CREATE TABLE hazop_moc_records (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  moc_number              TEXT NOT NULL,           -- MOC-{nnn}; unique per study

  -- Linked artefact (exactly one non-null)
  scenario_id             INTEGER REFERENCES hazop_scenarios(id) ON DELETE SET NULL,
  safety_function_id      INTEGER REFERENCES hazop_safety_functions(id) ON DELETE SET NULL,
  interlock_id            INTEGER REFERENCES hazop_interlocks(id) ON DELETE SET NULL,
  alarm_trip_id           INTEGER REFERENCES hazop_alarm_trips(id) ON DELETE SET NULL,
  sce_id                  INTEGER REFERENCES hazop_safety_critical_elements(id) ON DELETE SET NULL,
  lopa_id                 INTEGER REFERENCES hazop_lopa_records(id) ON DELETE SET NULL,
  srs_id                  INTEGER REFERENCES hazop_srs_records(id) ON DELETE SET NULL,

  -- Change description
  change_type             TEXT NOT NULL CHECK (change_type IN ('add','modify','delete','supersede','rebaseline')),
  change_reason           TEXT NOT NULL,
  change_description      TEXT NOT NULL,
  safety_impact_assessment TEXT,

  -- Before/after baseline
  baseline_before         TEXT,                    -- baseline_revision before change
  baseline_after          TEXT,                    -- baseline_revision after change

  -- Approval
  requested_by            INTEGER REFERENCES users(id),
  requested_at            TIMESTAMPTZ DEFAULT NOW(),
  approved_by             INTEGER REFERENCES users(id),
  approved_at             TIMESTAMPTZ,
  moc_status              TEXT NOT NULL DEFAULT 'open'
                          CHECK (moc_status IN ('open','approved','rejected','closed')),

  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (study_id, moc_number)
);
```

---

## 7. Phase 5D — Baseline Approval Workflow

### 7.1 Concept

Phase 4 introduced `baseline_revision` as a freeze anchor. Phase 5D adds **countersigned approval** — a second user (approver) must sign off a baseline before it is considered formally approved for SIS design.

### 7.2 New Table: `hazop_baseline_approvals`

```sql
CREATE TABLE hazop_baseline_approvals (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,

  -- What is being approved
  artefact_table          TEXT NOT NULL CHECK (artefact_table IN (
                            'hazop_scenarios','hazop_safety_functions','hazop_interlocks',
                            'hazop_alarm_trips','hazop_safety_critical_elements',
                            'hazop_ce_matrices','hazop_lopa_records','hazop_srs_records')),
  artefact_id             INTEGER NOT NULL,
  baseline_revision       TEXT NOT NULL,

  -- Preparer (author of the baseline)
  prepared_by             INTEGER NOT NULL REFERENCES users(id),
  prepared_at             TIMESTAMPTZ NOT NULL,

  -- Approver (countersignature)
  approved_by             INTEGER REFERENCES users(id),
  approved_at             TIMESTAMPTZ,
  approval_token          TEXT,                    -- HMAC token: hash of (artefact_table + artefact_id + baseline_revision + approver_id + timestamp)
  approval_status         TEXT NOT NULL DEFAULT 'pending'
                          CHECK (approval_status IN ('pending','approved','rejected')),
  rejection_reason        TEXT,

  created_at              TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (artefact_table, artefact_id, baseline_revision)
);
```

### 7.3 Approval Token Generation

`approval_token` is computed server-side as:
```
HMAC-SHA256(secret=SESSION_SECRET, message="artefact_table:artefact_id:baseline_revision:approver_id:approved_at_ISO")
```

This creates a tamper-evident audit trail for each countersignature, satisfying IEC 61511 Part 1 §12 (documentation and audit) requirements.

---

## 8. Phase 5E — AI Safeguard Ranking Engine

### 8.1 Concept

Using the OpenAI integration already installed, Phase 5E adds an AI-powered safeguard ranking and recommendation system that:
1. Ranks IPLs by effectiveness and reliability using all Phase 4 signals
2. Identifies the weakest link in each scenario's IPL stack
3. Recommends specific improvements to close SIL gaps
4. Generates narrative LOPA justification text for the SRS

### 8.2 Input signals (all from Phase 4)

| Signal | Weight |
|---|---|
| `effectiveness_rating` | High — primary effectiveness signal |
| `confidence_score` (from response group actions) | High — extraction confidence |
| `human_dependency_level` | High — human factors penalty |
| `is_independent_protection_layer` | Boolean gate — non-IPL RGs excluded |
| `protection_layer` | Medium — layer type credibility |
| `common_cause_group` | Medium — CCF penalty |
| `fail_state` | Medium — design quality signal |
| `baseline_revision` | Low — maturity signal |

### 8.3 New Table: `hazop_ai_rankings`

```sql
CREATE TABLE hazop_ai_rankings (
  id                      SERIAL PRIMARY KEY,
  study_id                INTEGER NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  scenario_id             INTEGER REFERENCES hazop_scenarios(id) ON DELETE CASCADE,

  ranking_type            TEXT NOT NULL CHECK (ranking_type IN ('ipl_stack','scenario_risk','safeguard_gap','lopa_narrative')),
  model_version           TEXT NOT NULL,           -- e.g. "gpt-4o-2024-08-06"
  prompt_version          TEXT NOT NULL,           -- internal prompt revision

  -- AI output
  ranked_items            JSONB,                   -- [{ipl_id, rank, score, rationale}]
  weakest_link_id         INTEGER,                 -- ID of weakest response_group or safety_function
  improvement_suggestions JSONB,                   -- [{priority, suggestion, expected_pfd_improvement}]
  narrative_text          TEXT,                    -- generated LOPA justification prose

  -- Quality
  confidence_score        INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  reviewed_by             INTEGER REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,
  review_outcome          TEXT CHECK (review_outcome IN ('accepted','rejected','modified')),

  created_at              TIMESTAMPTZ DEFAULT NOW(),
  created_by              INTEGER REFERENCES users(id)
);
```

---

## 9. Complete Phase 5 Schema

### New tables (5 primary + 1 supporting)

| # | Table | Phase | Rows per study (est.) |
|---|---|---|---|
| 33 | `hazop_scenario_ipl_stack` | 5A | 6 scenarios × 4–8 IPLs ≈ 24–48 rows |
| 34 | `hazop_lopa_records` | 5A | 1 per scenario = 6 rows |
| 35 | `hazop_srs_records` | 5B | 1 per SIF = 4 rows |
| 36 | `hazop_moc_records` | 5C | Variable — grows with change activity |
| 37 | `hazop_baseline_approvals` | 5D | 1 per baseline action (per artefact) |
| 38 | `hazop_ai_rankings` | 5E | 1–3 per scenario |

**Total tables after Phase 5: 38** (Phases 1–3: 24, Phase 4: 32, Phase 5: 38)

### No Phase 4 modifications

All Phase 5 tables are additive. The following Phase 4 fields were deliberately pre-positioned to feed Phase 5 and require no change:
- `effectiveness_rating` → PFD seed
- `is_independent_protection_layer` → IPL stack filter
- `baseline_revision` → MOC anchor
- `sil_target` → SRS SIL comparison
- `confidence_score` → AI ranking signal

---

## 10. API Routes

### Phase 5A — LOPA Core

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/lopa` | List all LOPA records |
| `POST` | `/api/hazop/studies/:studyId/lopa/generate` | Auto-generate LOPA records for all intolerable/unacceptable scenarios |
| `GET` | `/api/hazop/lopa/:id` | Get LOPA detail with full IPL stack and computed result |
| `PATCH` | `/api/hazop/lopa/:id` | Update LOPA (IEF, RTTF, status) |
| `DELETE` | `/api/hazop/lopa/:id` | Delete (409 if baselined) |
| `POST` | `/api/hazop/lopa/:id/set-baseline` | Freeze LOPA at current revision |
| `GET` | `/api/hazop/studies/:studyId/ipl-stack/:scenarioId` | Get IPL stack for one scenario |
| `POST` | `/api/hazop/studies/:studyId/ipl-stack/:scenarioId/build` | Auto-build IPL stack from scenario's response groups |
| `POST` | `/api/hazop/ipl-stack/items` | Add manual IPL to stack |
| `PATCH` | `/api/hazop/ipl-stack/items/:id` | Update IPL item (PFD, credit, notes) |
| `DELETE` | `/api/hazop/ipl-stack/items/:id` | Remove IPL from stack |
| `POST` | `/api/hazop/lopa/:id/recalculate` | Re-run MEF + SIL gap arithmetic |

### Phase 5B — SRS

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/srs` | List all SRS records |
| `POST` | `/api/hazop/studies/:studyId/srs/extract` | Auto-generate SRS records from Phase 4B SIFs + LOPA results |
| `GET` | `/api/hazop/srs/:id` | Get SRS detail |
| `PATCH` | `/api/hazop/srs/:id` | Update SRS |
| `DELETE` | `/api/hazop/srs/:id` | Delete (409 if approved) |
| `POST` | `/api/hazop/srs/:id/set-baseline` | Approve SRS baseline |
| `GET` | `/api/hazop/srs/:id/export-pdf` | Export SRS as PDF |

### Phase 5C — MOC

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/moc` | List all MOC records |
| `POST` | `/api/hazop/studies/:studyId/moc` | Raise new MOC |
| `GET` | `/api/hazop/moc/:id` | Get MOC detail |
| `PATCH` | `/api/hazop/moc/:id` | Update MOC |
| `POST` | `/api/hazop/moc/:id/approve` | Approve MOC |
| `POST` | `/api/hazop/moc/:id/reject` | Reject MOC |
| `POST` | `/api/hazop/moc/:id/close` | Close MOC |

### Phase 5D — Baseline Approvals

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/baseline-approvals` | List all pending approvals |
| `POST` | `/api/hazop/baseline-approvals/:id/approve` | Countersign baseline (generates approval_token) |
| `POST` | `/api/hazop/baseline-approvals/:id/reject` | Reject baseline with reason |

### Phase 5E — AI Ranking

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/hazop/studies/:studyId/ai-rank` | Trigger AI ranking for all scenarios |
| `POST` | `/api/hazop/lopa/:id/ai-narrative` | Generate LOPA narrative text for one scenario |
| `GET` | `/api/hazop/studies/:studyId/ai-rankings` | List all AI rankings |
| `POST` | `/api/hazop/ai-rankings/:id/review` | Record human review outcome |

### Phase 5 Summary

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/phase5-summary` | KPIs: LOPA coverage, SIL gap count, SRS count, MOC open count, AI ranking coverage |

---

## 11. UI Pages

| Page | Route | Key Features |
|---|---|---|
| **LOPA Dashboard** | `/hazop/studies/:id/lopa` | Per-scenario LOPA cards; MEF vs RTTF gauge; SIL gap alert badges; generate-all button |
| **LOPA Detail** | `/hazop/studies/:id/lopa/:lopaId` | IPL stack table; PFD editor per IPL; live MEF recalculation; SIL gap visualisation; baseline button |
| **IPL Stack Editor** | Embedded in LOPA Detail | Drag-to-reorder stack; PFD input with default pre-fill; credit toggle; CCF conflict warnings |
| **SRS Register** | `/hazop/studies/:id/srs` | SRS list; SIL badge; extract-from-SIFs button; PDF export per SRS |
| **SRS Detail / Editor** | `/hazop/studies/:id/srs/:srsId` | Full SRS form; proof test fields; architecture selector; approval workflow |
| **MOC Register** | `/hazop/studies/:id/moc` | MOC list with status badges; raise-MOC dialog; filter by artefact type |
| **Baseline Approvals** | `/hazop/studies/:id/approvals` | Pending approval queue; countersign button (Superuser/GM/SM roles); approval token display |
| **AI Ranking** | `/hazop/studies/:id/ai-ranking` | Per-scenario ranked IPL cards; improvement recommendations; run-ranking button; accept/reject per suggestion |
| **Phase 5 Dashboard** | Embedded in HAZOP Dashboard | LOPA coverage %, SIL gap count, SRS approved count, MOC open count, AI ranking coverage |

---

## 12. Zero-Trust Audit Checklist

### 12.1 Schema integrity
- [ ] All 6 new tables created with correct CHECK constraints
- [ ] `hazop_scenario_ipl_stack.pfd_value` bounded to [0.000001, 1.0]
- [ ] `hazop_lopa_records` UNIQUE on `scenario_id` (one LOPA per scenario)
- [ ] `hazop_srs_records` UNIQUE on `safety_function_id` (one SRS per SIF)
- [ ] All FK columns use `ON DELETE SET NULL` or `ON DELETE CASCADE` as documented
- [ ] `approval_token` column exists and is NOT NULL after approval

### 12.2 LOPA arithmetic
- [ ] `pfd_product` = product of all `pfd_value` WHERE `credit_applied = true` in IPL stack
- [ ] `achieved_mef_per_year` = `ie_frequency_per_year × pfd_product`
- [ ] `risk_gap_ratio` = `achieved_mef_per_year / rttf_per_year`
- [ ] `lopa_outcome = 'tolerable'` if and only if `risk_gap_ratio ≤ 1.0`
- [ ] `required_additional_pfd = rttf_per_year / ie_frequency_per_year / pfd_product_without_new_sif`
- [ ] `required_sil = CEIL(-LOG10(required_additional_pfd))` clamped to [1, 4]
- [ ] IEF defaults correctly loaded from `event_type` lookup table
- [ ] RTTF defaults correctly loaded from `consequence_category` lookup table

### 12.3 IPL stack rules
- [ ] Only `is_independent_protection_layer = true` response groups auto-added to stack
- [ ] CCF conflict detection flags response groups sharing the same `common_cause_group`
- [ ] BPCS IPLs marked as conflicting with same-cause BPCS alarms (cannot double-credit)
- [ ] `stack_position` UNIQUE per `scenario_id` enforced
- [ ] Recalculate route is idempotent (running twice gives same result)

### 12.4 SRS requirements
- [ ] `pfd_target ≤ pfd_required` enforced (server-side validation, 422 if violated)
- [ ] `response_time_required_sec ≤ process_safety_time_sec` enforced (422 if violated)
- [ ] PDF export generates complete SRS document (all fields present, no blank required fields)
- [ ] SRS `sil_required` matches LOPA `required_sil` for linked LOPA (warning if mismatch)

### 12.5 MOC workflow
- [ ] MOC cannot be created against a non-baselined artefact (400 error)
- [ ] MOC `approved` status requires `approved_by` and `approved_at` to be non-null
- [ ] Closed MOC is immutable (PATCH returns 409)
- [ ] MOC list API returns `artefact_label` for each record (denormalised display field)

### 12.6 Baseline approval
- [ ] `approval_token` is computed server-side — never accepted from client
- [ ] Approver cannot be the same user as preparer (self-approval returns 422)
- [ ] Rejected approval resets `baseline_revision` to NULL on the parent artefact (or flags it as unapproved)
- [ ] Phase 4 `set-baseline` route must create a `hazop_baseline_approvals` pending record

### 12.7 AI ranking
- [ ] AI route uses OpenAI integration (already installed — `javascript_openai==1.0.0`)
- [ ] AI output is stored in `hazop_ai_rankings.ranked_items` as JSONB — not raw text
- [ ] `reviewed_by` and `review_outcome` required before AI suggestions can be applied
- [ ] `prompt_version` versioned to allow regression testing of ranking quality

### 12.8 Auth guard
- [ ] All Phase 5 routes return 401 unauthenticated
- [ ] Baseline approval routes require `Superuser | General Manager | Senior Manager` role
- [ ] AI ranking routes require `Superuser | HAZOP` module permission
- [ ] MOC approval requires `Superuser | General Manager` role

---

## 13. Sub-Task Breakdown

| ID | Task | Blocked By | Estimate |
|---|---|---|---|
| **T5A-001** | Schema: `hazop_scenario_ipl_stack` + `hazop_lopa_records` (psql + schema.ts) | Phase 4 closed | S |
| **T5A-002** | Routes: LOPA CRUD + generate + recalculate | T5A-001 | M |
| **T5A-003** | Routes: IPL stack CRUD + auto-build + PFD defaults | T5A-001 | M |
| **T5A-004** | LOPA arithmetic engine (server-side pure function — `computeLopa()`) | T5A-001 | M |
| **T5A-005** | UI: LOPA Dashboard + IPL Stack Editor | T5A-002, T5A-003 | L |
| **T5A-006** | ZTA: Phase 5A arithmetic verification | T5A-005 | S |
| **T5B-001** | Schema: `hazop_srs_records` (psql + schema.ts) | T5A-006 | S |
| **T5B-002** | Routes: SRS CRUD + extract-from-SIFs + PDF export | T5B-001 | M |
| **T5B-003** | UI: SRS Register + SRS Detail Editor | T5B-002 | M |
| **T5B-004** | ZTA: SRS validation rules (pfd_target ≤ pfd_required, response time) | T5B-003 | S |
| **T5C-001** | Schema: `hazop_moc_records` (psql + schema.ts) | T5A-006 | S |
| **T5C-002** | Routes: MOC CRUD + approve + reject + close | T5C-001 | M |
| **T5C-003** | UI: MOC Register | T5C-002 | M |
| **T5D-001** | Schema: `hazop_baseline_approvals` (psql + schema.ts) | T5C-001 | S |
| **T5D-002** | Routes: Approval queue + countersign + approval_token generation | T5D-001 | M |
| **T5D-003** | Modify Phase 4 `set-baseline` routes to create pending approval records | T5D-001 | S |
| **T5D-004** | UI: Baseline Approvals queue page | T5D-002 | M |
| **T5E-001** | AI ranking engine: prompt design + OpenAI call + JSONB storage | T5A-006 | M |
| **T5E-002** | Routes: AI rank + AI narrative + review | T5E-001 | S |
| **T5E-003** | UI: AI Ranking page | T5E-002 | M |
| **T5-DASH** | Phase 5 dashboard KPIs (embed in HAZOP Dashboard) | T5A-006, T5B-004, T5C-003 | S |
| **T5-ZTA** | Full Phase 5 ZTA + UAT evidence | All T5x tasks | M |

**Sizes:** S = half-day, M = 1–2 days, L = 2–3 days  
**Total sub-tasks: 22**

### Dependency order

```
Phase 4 closed
  └── T5A-001 (schema)
        ├── T5A-002 (LOPA routes)
        ├── T5A-003 (IPL stack routes)
        └── T5A-004 (arithmetic engine)
              └── T5A-005 (LOPA UI)
                    └── T5A-006 (ZTA gate — must pass before 5B, 5C, 5D, 5E begin)
                          ├── T5B-001 → T5B-002 → T5B-003 → T5B-004
                          ├── T5C-001 → T5C-002 → T5C-003
                          ├── T5D-001 → T5D-002 → T5D-003 → T5D-004
                          └── T5E-001 → T5E-002 → T5E-003
                                └── T5-DASH → T5-ZTA
```

**5B, 5C, 5D, 5E can be executed in parallel** once T5A-006 passes.

---

## 14. Readiness Gate

### Pre-implementation gates (all must pass before T5A-001 begins)

- [ ] Phase 4B formally closed (✓ confirmed 2026-05-25)
- [ ] At least one study has all 6 Phase 4B artefact domains populated (scenarios, C&E, SIFs, interlocks, alarms, SCEs)
- [ ] Risk tolerance criteria approved by product owner (RTTF per consequence category — §4.6)
- [ ] IEF defaults reviewed and accepted (§4.5) or company-specific table provided
- [ ] PFD default lookup table approved (§4.3)
- [ ] Roles authorised for baseline approval countersign confirmed (Superuser / GM / SM)
- [ ] AI ranking prompt reviewed and accepted (§8)
- [ ] Technical debt item HAZOP-TD-001 (CE cell normalization) acknowledged — does not block Phase 5

### Architecture decision required before T5A-001

**Q: Should LOPA calculations be stored as immutable snapshots (point-in-time) or as live-computed views?**

Two options:
- **Option A (Recommended):** Store `pfd_product`, `achieved_mef_per_year`, `risk_gap_ratio`, `required_sil` in `hazop_lopa_records` as computed and stored on each `recalculate` call. Baseline freezes the snapshot. Simple, auditable, no live dependency on IPL stack changes after baseline.
- **Option B:** Compute all LOPA values live on every API read from the IPL stack. No stored arithmetic — always reflects current IPL stack. Cannot be baselined without snapshots.

**Recommendation: Option A.** IEC 61511 requires a frozen, approved LOPA document. Live computation is incompatible with formal approval. Phase 5D approval workflow requires a stable baseline.

*Decision must be made before T5A-001 begins.*

---

*End of Phase 5 Execution Plan v1.0*  
*Prepared: 2026-05-25 | Status: DRAFT — Submitted for product owner review*  
*Predecessor: HAZOP Phase 4 closed 2026-05-25 (ZTA-4B-CLOSED / UAT-4B-ACCEPTED)*  
*Deferred Tech Debt: docs/hazop-phase4-legacy-ce-cell-normalization.md*
