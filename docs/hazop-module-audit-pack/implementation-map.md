# HAZOP Module — Implementation Map
**Compiled:** 2026-05-25  
**Scope:** Phase-wise breakdown of all files changed, DB tables created, routes added, UI pages added  

---

## Phase 1 — Foundation (2026-05-24)

### DB Tables Created (20)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 1 | `hazop_studies` | UNIQUE(study_number), UNIQUE(project_id, fy_code), UNIQUE(concept_title, fy_code) |
| 2 | `hazop_concept_equipment` | UNIQUE(study_id, concept_tag) |
| 3 | `hazop_concept_instruments` | UNIQUE(study_id, concept_tag) |
| 4 | `hazop_design_assumptions` | FK → hazop_studies |
| 5 | `hazop_process_loops` | FK → hazop_studies |
| 6 | `hazop_process_steps` | FK → hazop_process_loops (legacy; superseded by Phase 2 v2.0 arch) |
| 7 | `hazop_nodes` | UNIQUE(step_id) — legacy 1:1 per step; superseded by Phase 2 v2.0 |
| 8 | `hazop_deviations` | UNIQUE(node_id, guideword, parameter) |
| 9 | `hazop_causes` | FK → hazop_deviations |
| 10 | `hazop_consequences` | FK → hazop_deviations |
| 11 | `hazop_safeguards` | FK → hazop_deviations |
| 12 | `hazop_actions` | FK → hazop_deviations |
| 13 | `hazop_safety_functions` | UNIQUE(study_id, sif_number) |
| 14 | `hazop_ce_matrix` | UNIQUE(study_id) |
| 15 | `hazop_ce_causes` | FK → hazop_ce_matrix |
| 16 | `hazop_ce_effects` | FK → hazop_ce_matrix |
| 17 | `hazop_ce_cells` | UNIQUE(cause_id, effect_id) |
| 18 | `hazop_fat_sat_items` | FK → hazop_studies |
| 19 | `hazop_revisions` | FK → hazop_studies |
| 20 | `hazop_deviation_library` | UNIQUE(equipment_category, guideword, parameter) |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | Created — 6 study CRUD endpoints |
| `server/scripts/seed-hazop-library.ts` | Created — 16-row deviation library seed |
| `server/routes.ts` | HAZOP routes + seed registered |
| `shared/schema.ts` | 20 HAZOP table declarations appended |

### Routes Added (6)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hazop/studies/project/:projectId` | List studies for a project |
| GET | `/api/hazop/studies/concept` | List all concept studies |
| GET | `/api/hazop/studies/:studyId` | Get single study with counts |
| POST | `/api/hazop/studies` | Create study |
| PATCH | `/api/hazop/studies/:studyId` | Update study metadata |
| DELETE | `/api/hazop/studies/:studyId` | Delete draft study |

### UI Pages Added (1)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-dashboard.tsx` | `/hazop/dashboard` | Study list with create/delete |

### Other Files Changed
| File | Change |
|------|--------|
| `client/src/components/layout.tsx` | HAZOP nav block added |
| `client/src/App.tsx` | HAZOP routes registered |
| `client/src/loaders/hazop.ts` | Lazy loader created |

---

## Phase 2 — Process Loop & Node Builder (2026-05-25)

### Architecture Decision
Phase 2 v1.0 (1 Step = 1 Node) rejected. Phase 2 v2.0 adopted: `Study → Loop → Node → Step(s) → Deviation`.  
Node table (`hazop_nodes`) restructured from step-keyed to loop-keyed with explicit `node_number`.

### DB Tables Changed (0 new — existing tables restructured via additive migration)
| Table | Change |
|-------|--------|
| `hazop_nodes` | UNIQUE constraint changed from `(step_id)` to `(loop_id, node_number)` — v2.0 architecture |
| `hazop_process_steps` | UNIQUE(node_id, sequence_no) added |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | Loop CRUD, Node CRUD, Step CRUD routes added |

### Routes Added (~12)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hazop/studies/:studyId/loops` | List loops for study |
| POST | `/api/hazop/studies/:studyId/loops` | Create loop |
| PATCH | `/api/hazop/loops/:id` | Update loop |
| DELETE | `/api/hazop/loops/:id` | Delete loop |
| GET | `/api/hazop/loops/:loopId/nodes` | List nodes for loop |
| POST | `/api/hazop/loops/:loopId/nodes` | Create node |
| PATCH | `/api/hazop/nodes/:id` | Update node |
| DELETE | `/api/hazop/nodes/:id` | Delete node |
| GET | `/api/hazop/nodes/:nodeId/steps` | List steps for node |
| POST | `/api/hazop/nodes/:nodeId/steps` | Create step |
| PATCH | `/api/hazop/steps/:id` | Update step |
| DELETE | `/api/hazop/steps/:id` | Delete step |

### UI Pages Added (2)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-worksheet.tsx` | `/hazop/studies/:id/worksheet` | Loops → Nodes → Steps tri-panel |
| `client/src/pages/hazop/hazop-process-builder.tsx` | `/hazop/studies/:id/process-builder` | Process parameter & equipment builder |

---

## Phase 3 — HAZOP Generation Engine & Worksheet (2026-05-25)

### DB Tables Changed (0 new — Phase 1 tables consumed)
Phase 3 populates `hazop_deviations`, `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, `hazop_actions` via generation engine. No new tables created.

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | Generation route + deviation/cause/consequence/safeguard/action CRUD |

### Routes Added (~15)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/hazop/nodes/:nodeId/generate` | Run HAZOP generation engine for a node |
| GET | `/api/hazop/nodes/:nodeId/deviations` | List deviations |
| POST | `/api/hazop/nodes/:nodeId/deviations` | Create deviation |
| PATCH | `/api/hazop/deviations/:id` | Update deviation |
| DELETE | `/api/hazop/deviations/:id` | Delete deviation |
| GET | `/api/hazop/deviations/:devId/causes` | List causes |
| POST | `/api/hazop/deviations/:devId/causes` | Add cause |
| PATCH | `/api/hazop/causes/:id` | Update cause |
| DELETE | `/api/hazop/causes/:id` | Delete cause |
| POST | `/api/hazop/deviations/:devId/consequences` | Add consequence |
| PATCH | `/api/hazop/consequences/:id` | Update consequence |
| POST | `/api/hazop/deviations/:devId/safeguards` | Add safeguard |
| PATCH | `/api/hazop/safeguards/:id` | Update safeguard |
| POST | `/api/hazop/deviations/:devId/actions` | Add action |
| PATCH | `/api/hazop/actions/:id` | Update action |

### UI Pages Added (2)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-nodes.tsx` | `/hazop/studies/:id/nodes` | Node register with generation trigger |
| `client/src/pages/hazop/hazop-scenarios.tsx` | `/hazop/studies/:id/scenarios` | Scenario register |

---

## Phase 3A — Deviation Library Expansion (2026-05-25)

### DB Tables Changed
| Table | Change |
|-------|--------|
| `hazop_deviation_library` | Expanded from 16 rows (4 categories) to full 18-category coverage via additional seed rows |

### Server Files Changed
| File | Change |
|------|--------|
| `server/scripts/seed-hazop-library.ts` | Additional library entries for 14 previously uncovered categories |

### UI Pages Added (0)

---

## Phase 4 — Safety Logic, C&E Matrix, Interlocks, Alarm-Trips, SCE (2026-05-25)

### Architecture
Phase 4A: Safety Logic Modeling Layer (Event Groups, Response Groups).  
Phase 4B: C&E Matrix (new schema: matrices/rows/columns), Interlocks, Alarm-Trips, SCE, Scenarios.

### DB Tables Created (11 — tables 21 to 31)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 21 | `hazop_event_groups` | UNIQUE(study_id, group_number) |
| 22 | `hazop_event_group_members` | UNIQUE(group_id, deviation_id) |
| 23 | `hazop_response_groups` | UNIQUE(study_id, group_number) |
| 24 | `hazop_response_group_actions` | UNIQUE(response_group_id, sequence_no) |
| 25 | `hazop_ce_matrices` | UNIQUE(study_id, matrix_number) |
| 26 | `hazop_ce_rows` | UNIQUE(matrix_id, row_number); FK → hazop_event_groups |
| 27 | `hazop_ce_columns` | UNIQUE(matrix_id, col_number); FK → hazop_response_groups |
| 28 | `hazop_interlocks` | UNIQUE(study_id, interlock_number) |
| 29 | `hazop_interlock_actions` | UNIQUE(interlock_id, sequence_no) |
| 30 | `hazop_alarm_trips` | UNIQUE(study_id, alarm_number) |
| 31 | `hazop_safety_critical_elements` | UNIQUE(study_id, sce_number) |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | ~35 routes added for Phase 4 artefacts |

### Routes Added (~35)
Covers full CRUD + extract for: event groups, event group members, response groups, response group actions, C&E matrices, C&E rows, C&E columns, C&E cells, interlocks, interlock actions, alarm trips, SCE + set-baseline routes for matrices/interlocks/alarm-trips/SCE.

### UI Pages Added (8)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-event-groups.tsx` | `/hazop/studies/:id/event-groups` | Event group register |
| `client/src/pages/hazop/hazop-response-groups.tsx` | `/hazop/studies/:id/response-groups` | Response group register |
| `client/src/pages/hazop/hazop-ce-matrix.tsx` | `/hazop/studies/:id/ce-matrix` | C&E matrix editor |
| `client/src/pages/hazop/hazop-interlocks.tsx` | `/hazop/studies/:id/interlocks` | Interlock register |
| `client/src/pages/hazop/hazop-alarm-trips.tsx` | `/hazop/studies/:id/alarm-trips` | Alarm & trip register |
| `client/src/pages/hazop/hazop-safety-critical-elements.tsx` | `/hazop/studies/:id/sce` | SCE register |
| `client/src/pages/hazop/hazop-safety-functions.tsx` | `/hazop/studies/:id/safety-functions` | SIF register |
| `client/src/pages/hazop/hazop-actions.tsx` | `/hazop/studies/:id/actions` | Action items register |

---

## Phase 5A — LOPA Core (2026-05-25)

### DB Tables Created (3 — tables 32 to 34)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 32 | `hazop_scenarios` | UNIQUE(study_id, scenario_number) |
| 33 | `hazop_scenario_ipl_stack` | UNIQUE(scenario_id, stack_position); creditable BOOLEAN, pfd_source, ccf_group fields for audit |
| 34 | `hazop_lopa_records` | UNIQUE(study_id, lopa_number); UNIQUE(scenario_id); arithmetic audit fields: pfd_product, achieved_mef_per_year, risk_gap_ratio, required_sil |

### Additional Columns (Phase 5A hardening v1.1)
Columns added to `hazop_scenario_ipl_stack`: `creditable BOOLEAN`, `pfd_source TEXT`, `ccf_group TEXT`.  
Columns added to `hazop_lopa_records`: arithmetic audit fields (defects 5A-D006/D008 resolution).

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | LOPA CRUD, IPL stack CRUD, recalculate, set-baseline, generate routes |

### Routes Added (~10)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hazop/studies/:studyId/lopa` | List LOPA records |
| POST | `/api/hazop/studies/:studyId/lopa` | Create LOPA record |
| GET | `/api/hazop/lopa/:id` | Get LOPA detail (augmented in 5D) |
| PATCH | `/api/hazop/lopa/:id` | Update LOPA |
| DELETE | `/api/hazop/lopa/:id` | Delete LOPA |
| POST | `/api/hazop/lopa/:id/recalculate` | Rerun LOPA arithmetic engine |
| POST | `/api/hazop/lopa/:id/set-baseline` | Freeze LOPA baseline (fixed in 5D to write approved_by/approved_at) |
| GET | `/api/hazop/lopa/:id/ipl-stack` | Get IPL stack |
| POST | `/api/hazop/lopa/:id/ipl-stack` | Add IPL stack item |
| DELETE | `/api/hazop/lopa/:lopaId/ipl-stack/:itemId` | Remove IPL stack item |

### UI Pages Added (2)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-lopa.tsx` | `/hazop/studies/:id/lopa` | LOPA register (modified in 5D) |
| `client/src/pages/hazop/hazop-lopa-detail.tsx` | `/hazop/studies/:id/lopa/:lopaId` | LOPA detail + IPL stack (modified in 5D) |

---

## Phase 5B — Safety Requirements Specification (2026-05-25)

### DB Tables Created (1 — table 35)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 35 | `hazop_srs_records` | UNIQUE(study_id, srs_number); UNIQUE(safety_function_id); pfd_target ≤ pfd_required validation |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | SRS CRUD, extract from SIF, set-baseline, PDF export routes |

### Routes Added (~6)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hazop/studies/:studyId/srs` | List SRS records |
| POST | `/api/hazop/studies/:studyId/srs` | Create SRS record |
| GET | `/api/hazop/srs/:id` | Get SRS detail (augmented in 5D) |
| PATCH | `/api/hazop/srs/:id` | Update SRS |
| POST | `/api/hazop/srs/:id/set-baseline` | Freeze SRS baseline |
| POST | `/api/hazop/srs/:id/extract` | Auto-extract SRS from linked SIF data |

### UI Pages Added (2)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-srs.tsx` | `/hazop/studies/:id/srs` | SRS register (modified in 5D) |
| `client/src/pages/hazop/hazop-srs-detail.tsx` | `/hazop/studies/:id/srs/:srsId` | SRS detail + traceability (modified in 5D) |

---

## Phase 5C — Management of Change Register (2026-05-25)

### DB Tables Created (1 — table 36)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 36 | `hazop_moc_records` | UNIQUE(study_id, moc_number); CHECK exactly-one-artefact FK; `baseline_before` captured at creation |

### Additional Columns (additive, applied to 4 tables)
| Table | Columns Added |
|-------|--------------|
| `hazop_lopa_records` | `requires_review BOOLEAN NOT NULL DEFAULT false`, `reviewed_by INTEGER`, `reviewed_at TIMESTAMPTZ` |
| `hazop_srs_records` | same 3 columns |
| `hazop_interlocks` | same 3 columns |
| `hazop_alarm_trips` | same 3 columns |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | 8 MOC routes + 4 mark-reviewed routes; detect-and-gate middleware injected into LOPA/SRS PATCH |

### Routes Added (12)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/hazop/studies/:studyId/moc` | List MOC records |
| POST | `/api/hazop/studies/:studyId/moc` | Raise new MOC |
| GET | `/api/hazop/moc/:id` | Get MOC detail |
| PATCH | `/api/hazop/moc/:id` | Update open MOC |
| DELETE | `/api/hazop/moc/:id` | Delete open MOC |
| POST | `/api/hazop/moc/:id/approve` | Approve MOC (role-gated; self-approval blocked) |
| POST | `/api/hazop/moc/:id/reject` | Reject MOC |
| POST | `/api/hazop/moc/:id/close` | Close approved MOC; captures baseline_after |
| POST | `/api/hazop/lopa/:id/mark-reviewed` | Clear requires_review on LOPA |
| POST | `/api/hazop/srs/:id/mark-reviewed` | Clear requires_review on SRS |
| POST | `/api/hazop/interlocks/:id/mark-reviewed` | Clear requires_review on interlock |
| POST | `/api/hazop/alarm-trips/:id/mark-reviewed` | Clear requires_review on alarm-trip |

### UI Pages Added (2)
| File | Route | Purpose |
|------|-------|---------|
| `client/src/pages/hazop/hazop-moc.tsx` | `/hazop/studies/:id/moc` | MOC register |
| `client/src/pages/hazop/hazop-moc-detail.tsx` | `/hazop/studies/:id/moc/:mocId` | MOC detail + approval panel |

---

## Phase 5D — Countersigned Baseline Approval (2026-05-25)

### DB Tables Created (1 — table 37)
| # | Table | Key Constraints |
|---|-------|-----------------|
| 37 | `hazop_baseline_approvals` | UNIQUE(artefact_type, artefact_id, baseline_revision); CHECK artefact_type IN ('lopa','srs'); CHECK approval_discipline IN ('process','instrumentation','safety') |

### New Server Files
| File | Purpose |
|------|---------|
| `server/utils/hazop-hmac.ts` | `generateApprovalToken` + `verifyApprovalToken` — 7-field HMAC-SHA256 canonical string, timingSafeEqual verify |

### Server Files Changed
| File | Change |
|------|--------|
| `server/hazop-routes.ts` | 4 new routes added; LOPA set-baseline fixed (approved_by + approved_at writes); LOPA detail GET augmented (baseline_approval JOIN); SRS detail GET augmented; LOPA list GET augmented (is_countersigned); SRS list GET augmented |
| `shared/schema.ts` | `hazopBaselineApprovals` table declaration + insert schema + type alias appended |

### Routes Added (4 new) / Modified (2 augmented)
| Method | Path | Purpose | Phase |
|--------|------|---------|-------|
| POST | `/api/hazop/lopa/:id/countersign` | 7-gate countersign LOPA baseline | 5D new |
| POST | `/api/hazop/srs/:id/countersign` | 7-gate countersign SRS baseline | 5D new |
| GET | `/api/hazop/studies/:studyId/baseline-approvals` | Study-level approval register | 5D new |
| POST | `/api/hazop/baseline-approvals/:approvalId/verify` | HMAC integrity verification | 5D new |
| GET | `/api/hazop/lopa/:id` | + baseline_approval sub-object in response | 5D augmented |
| GET | `/api/hazop/srs/:id` | + baseline_approval sub-object in response | 5D augmented |

### UI Pages Modified (4 — no new pages created)
| File | Changes |
|------|---------|
| `client/src/pages/hazop/hazop-lopa.tsx` | `is_countersigned` "Signed" badge added |
| `client/src/pages/hazop/hazop-lopa-detail.tsx` | Countersign button (role-gated), countersign dialog (discipline dropdown + notes), approval detail block (5 explicit fields + HMAC verify button) |
| `client/src/pages/hazop/hazop-srs.tsx` | `is_countersigned` "Countersigned" column + badge added |
| `client/src/pages/hazop/hazop-srs-detail.tsx` | Same as LOPA detail; Dialog imports added |

---

## Summary Totals

| Metric | Phase 1 | Phase 2 | Phase 3 | Phase 3A | Phase 4 | Phase 5A | Phase 5B | Phase 5C | Phase 5D | **Total** |
|--------|---------|---------|---------|----------|---------|----------|----------|----------|----------|-----------|
| DB tables created | 20 | 0 | 0 | 0 | 11 | 3 | 1 | 1 | 1 | **37** |
| Routes added | 6 | ~12 | ~15 | 0 | ~35 | ~10 | ~6 | 12 | 4 | **~100** |
| UI pages added | 1 | 2 | 2 | 0 | 8 | 2 | 2 | 2 | 0 | **19** |
| UI pages modified | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 4 | **4** |
