# HAZOP Module — Database Audit
**Compiled:** 2026-05-25  
**Total HAZOP tables:** 37  
**All tables in DB:** confirmed via `hazop_baseline_approvals` as table 37  

---

## Table Register

### Phase 1 Tables (1–20) — Foundation

| # | Table | Phase | Purpose | Key Constraints | FK Dependencies |
|---|-------|-------|---------|-----------------|-----------------|
| 1 | `hazop_studies` | 1 | Master study record | UNIQUE(study_number); UNIQUE(project_id, fy_code); UNIQUE(concept_title, fy_code) | FK → projects(id) nullable |
| 2 | `hazop_concept_equipment` | 1 | Equipment datasheet for concept studies | UNIQUE(study_id, concept_tag) | FK → hazop_studies |
| 3 | `hazop_concept_instruments` | 1 | Instrument list for concept studies | UNIQUE(study_id, concept_tag) | FK → hazop_studies |
| 4 | `hazop_design_assumptions` | 1 | Design assumptions per study | — | FK → hazop_studies |
| 5 | `hazop_process_loops` | 1 | Process loop definitions | — | FK → hazop_studies |
| 6 | `hazop_process_steps` | 1/2 | Process steps within a node | UNIQUE(node_id, sequence_no) — v2.0 | FK → hazop_nodes |
| 7 | `hazop_nodes` | 1/2 | HAZOP node | UNIQUE(loop_id, node_number) — v2.0 | FK → hazop_process_loops |
| 8 | `hazop_deviations` | 1 | Deviations per node | UNIQUE(node_id, guideword, parameter) | FK → hazop_nodes |
| 9 | `hazop_causes` | 1 | Causes per deviation | — | FK → hazop_deviations |
| 10 | `hazop_consequences` | 1 | Consequences per deviation | — | FK → hazop_deviations |
| 11 | `hazop_safeguards` | 1 | Safeguards per deviation | — | FK → hazop_deviations |
| 12 | `hazop_actions` | 1 | Action items per deviation | — | FK → hazop_deviations |
| 13 | `hazop_safety_functions` | 1 | SIF definitions | UNIQUE(study_id, sif_number) | FK → hazop_studies; FK → hazop_deviations nullable |
| 14 | `hazop_ce_matrix` | 1 | Legacy C&E matrix parent (v1.0 schema) | UNIQUE(study_id) | FK → hazop_studies |
| 15 | `hazop_ce_causes` | 1 | Legacy C&E cause rows | — | FK → hazop_ce_matrix |
| 16 | `hazop_ce_effects` | 1 | Legacy C&E effect columns | — | FK → hazop_ce_matrix |
| 17 | `hazop_ce_cells` | 1/4B | Legacy C&E intersection cells; extended in Phase 4B with nullable columns | UNIQUE(cause_id, effect_id) | FK → hazop_ce_causes, hazop_ce_effects |
| 18 | `hazop_fat_sat_items` | 1 | FAT/SAT checklist items | — | FK → hazop_studies |
| 19 | `hazop_revisions` | 1 | Document revision audit trail | — | FK → hazop_studies |
| 20 | `hazop_deviation_library` | 1/3A | Guideword/parameter deviation templates; expanded in Phase 3A | UNIQUE(equipment_category, guideword, parameter) | — |

---

### Phase 4 Tables (21–31) — Safety Logic, C&E v2, Interlocks, Alarms, SCE

| # | Table | Sub-phase | Purpose | Key Constraints | FK Dependencies |
|---|-------|-----------|---------|-----------------|-----------------|
| 21 | `hazop_event_groups` | 4A | Process demand grouping layer | UNIQUE(study_id, group_number) | FK → hazop_studies |
| 22 | `hazop_event_group_members` | 4A | Many-to-many: event groups ↔ deviations | UNIQUE(group_id, deviation_id) | FK → hazop_event_groups, hazop_deviations |
| 23 | `hazop_response_groups` | 4A | Protection layer grouping (BPCS/SIS/Mech/Proc/Op/Relief) | UNIQUE(study_id, group_number) | FK → hazop_studies |
| 24 | `hazop_response_group_actions` | 4A | Individual actions within a response group | UNIQUE(response_group_id, sequence_no) | FK → hazop_response_groups |
| 25 | `hazop_ce_matrices` | 4B | C&E matrix v2 parent entity | UNIQUE(study_id, matrix_number) | FK → hazop_studies |
| 26 | `hazop_ce_rows` | 4B | C&E matrix rows (event groups) | UNIQUE(matrix_id, row_number) | FK → hazop_ce_matrices, hazop_event_groups |
| 27 | `hazop_ce_columns` | 4B | C&E matrix columns (response groups) | UNIQUE(matrix_id, col_number) | FK → hazop_ce_matrices, hazop_response_groups |
| 28 | `hazop_interlocks` | 4B | Interlock register | UNIQUE(study_id, interlock_number) | FK → hazop_studies; baseline_revision TEXT |
| 29 | `hazop_interlock_actions` | 4B | Individual actions within an interlock | UNIQUE(interlock_id, sequence_no) | FK → hazop_interlocks |
| 30 | `hazop_alarm_trips` | 4B | Alarm & trip register | UNIQUE(study_id, alarm_number) | FK → hazop_studies; baseline_revision TEXT |
| 31 | `hazop_safety_critical_elements` | 4B | SCE register | UNIQUE(study_id, sce_number) | FK → hazop_studies |

---

### Phase 5 Tables (32–37) — LOPA, SRS, MOC, Countersigned Approval

| # | Table | Sub-phase | Purpose | Key Constraints | FK Dependencies |
|---|-------|-----------|---------|-----------------|-----------------|
| 32 | `hazop_scenarios` | 5A | Hazardous event scenario (LOPA input) | UNIQUE(study_id, scenario_number) | FK → hazop_studies; FK → hazop_event_groups nullable |
| 33 | `hazop_scenario_ipl_stack` | 5A | IPL stack items per scenario | UNIQUE(scenario_id, stack_position) | FK → hazop_scenarios; FK → hazop_response_groups nullable |
| 34 | `hazop_lopa_records` | 5A | LOPA calculation record | UNIQUE(study_id, lopa_number); UNIQUE(scenario_id) | FK → hazop_studies; FK → hazop_scenarios |
| 35 | `hazop_srs_records` | 5B | Safety Requirements Specification | UNIQUE(study_id, srs_number); UNIQUE(safety_function_id) | FK → hazop_studies; FK → hazop_safety_functions |
| 36 | `hazop_moc_records` | 5C | Management of Change register | UNIQUE(study_id, moc_number); CHECK exactly-one-artefact | FK → hazop_studies; exactly-one-of: FK → hazop_lopa_records, hazop_srs_records, hazop_safety_functions, hazop_interlocks, hazop_alarm_trips, hazop_safety_critical_elements |
| 37 | `hazop_baseline_approvals` | 5D | Countersigned baseline approval record with HMAC token | UNIQUE(artefact_type, artefact_id, baseline_revision); CHECK artefact_type IN ('lopa','srs'); CHECK approval_discipline IN ('process','instrumentation','safety') | FK → users (baselined_by, countersigned_by) |

---

## Phase 5C Additive Columns (applied to existing tables)

| Table | Column | Type | Constraint |
|-------|--------|------|------------|
| `hazop_lopa_records` | `requires_review` | BOOLEAN | NOT NULL DEFAULT false |
| `hazop_lopa_records` | `reviewed_by` | INTEGER | nullable, FK → users |
| `hazop_lopa_records` | `reviewed_at` | TIMESTAMPTZ | nullable |
| `hazop_srs_records` | `requires_review` | BOOLEAN | NOT NULL DEFAULT false |
| `hazop_srs_records` | `reviewed_by` | INTEGER | nullable, FK → users |
| `hazop_srs_records` | `reviewed_at` | TIMESTAMPTZ | nullable |
| `hazop_interlocks` | `requires_review` | BOOLEAN | NOT NULL DEFAULT false |
| `hazop_interlocks` | `reviewed_by` | INTEGER | nullable, FK → users |
| `hazop_interlocks` | `reviewed_at` | TIMESTAMPTZ | nullable |
| `hazop_alarm_trips` | `requires_review` | BOOLEAN | NOT NULL DEFAULT false |
| `hazop_alarm_trips` | `reviewed_by` | INTEGER | nullable, FK → users |
| `hazop_alarm_trips` | `reviewed_at` | TIMESTAMPTZ | nullable |

---

## Technical Debt: HAZOP-TD-001 — Legacy CE Cell Normalization

| Attribute | Detail |
|-----------|--------|
| Document | `docs/hazop-phase4-legacy-ce-cell-normalization.md` |
| Status | DEFERRED — accepted at Phase 4B closure |
| Priority | Low — no runtime blocker |
| Issue | `hazop_ce_cells` has hard NOT NULL FKs to legacy `hazop_ce_causes` / `hazop_ce_effects` from Phase 1 v1.0 schema. Phase 4B added new nullable columns for the v2.0 C&E schema. The legacy NOT NULL columns create structural inconsistency. |
| Risk | Any future migration that tries to drop legacy C&E tables will fail due to the NOT NULL FK in `hazop_ce_cells`. |
| Resolution path | Drop legacy NOT NULL constraints via `ALTER TABLE hazop_ce_cells ALTER COLUMN cause_id DROP NOT NULL; ALTER COLUMN effect_id DROP NOT NULL;` — to be done in a future phase when the legacy C&E v1.0 UI is retired. |

---

## Table Count Verification

```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'hazop%';
-- Expected: 37
```
