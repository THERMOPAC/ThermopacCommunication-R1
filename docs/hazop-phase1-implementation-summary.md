# HAZOP Module — Phase 1 Implementation Summary

**Baseline Version**: 1.0  
**Completed**: 2026-05-24  
**Status**: CLOSED — Zero-trust audit passed, all tables live, seed idempotent.

---

## 1. Scope Delivered

Phase 1 (Foundation) delivers the full data layer, backend routes, and dashboard UI for HAZOP study management. No Process Loop Builder, no node/deviation UI, no FAT/SAT, no generation logic — strictly additive, zero side-effects on existing modules.

---

## 2. Database Layer (20 Tables)

All tables created via direct `psql` SQL (drizzle-kit push not used — schema too large).

| # | Table | Description |
|---|-------|-------------|
| 1 | `hazop_studies` | Master study record (project_based or concept_expected_project) |
| 2 | `hazop_concept_equipment` | Equipment datasheet for concept studies |
| 3 | `hazop_concept_instruments` | Instrument list for concept studies |
| 4 | `hazop_design_assumptions` | Design assumptions per study |
| 5 | `hazop_process_loops` | Process loop definitions |
| 6 | `hazop_process_steps` | Process steps within a loop |
| 7 | `hazop_nodes` | HAZOP node per step (1:1) |
| 8 | `hazop_deviations` | Deviations per node (guideword × parameter) |
| 9 | `hazop_causes` | Causes per deviation |
| 10 | `hazop_consequences` | Consequences per deviation |
| 11 | `hazop_safeguards` | Safeguards per deviation |
| 12 | `hazop_actions` | Action items per deviation |
| 13 | `hazop_safety_functions` | SIF definitions linked to deviations/actions |
| 14 | `hazop_ce_matrix` | Cause-Effect matrix (1:1 per study) |
| 15 | `hazop_ce_causes` | C&E cause rows |
| 16 | `hazop_ce_effects` | C&E effect columns |
| 17 | `hazop_ce_cells` | C&E intersection cells |
| 18 | `hazop_fat_sat_items` | FAT/SAT checklist items |
| 19 | `hazop_revisions` | Document revision audit trail |
| 20 | `hazop_deviation_library` | Guideword/parameter deviation template library |

### Key Constraints
- `hazop_studies`: UNIQUE `(study_number)`, UNIQUE `(project_id, fy_code)`, UNIQUE `(concept_title, fy_code)` (conditional)
- `hazop_nodes`: UNIQUE `(step_id)` — enforces one node per step
- `hazop_deviations`: UNIQUE `(node_id, guideword, parameter)`
- `hazop_ce_cells`: UNIQUE `(cause_id, effect_id)`
- `hazop_ce_matrix`: UNIQUE `(study_id)` — one C&E matrix per study
- `hazop_safety_functions`: UNIQUE `(study_id, sif_number)`
- `hazop_deviation_library`: UNIQUE `(equipment_category, guideword, parameter)`

---

## 3. Backend Routes (6 Endpoints)

File: `server/hazop-routes.ts`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hazop/studies/project/:projectId` | List studies for a project |
| GET | `/api/hazop/studies/concept` | List all concept studies |
| GET | `/api/hazop/studies/:studyId` | Get single study (with related counts) |
| POST | `/api/hazop/studies` | Create study (project_based or concept_expected_project) |
| PATCH | `/api/hazop/studies/:studyId` | Patch study metadata (converted status blocked) |
| DELETE | `/api/hazop/studies/:studyId` | Delete draft study only |

### Business Rules Enforced
- `study_mode` must be `project_based` or `concept_expected_project`
- `project_based`: `project_id` required, concept fields rejected
- `concept_expected_project`: `project_id` must not be provided, `concept_title` required
- Advisory lock on study creation prevents duplicate study numbers under concurrent requests
- DELETE: only draft studies (403 otherwise)
- PATCH: converted studies are read-only (400)
- PATCH: prohibited fields (`study_number`, `study_mode`, `project_id`, `status`, `converted_project_id`) silently ignored

---

## 4. Deviation Library Seed

File: `server/scripts/seed-hazop-library.ts`

- 16 entries across 4 equipment categories: `centrifugal_pump`, `heat_exchanger`, `pressure_vessel`, `control_valve`
- Seed execution is automatic on server startup but remains fully idempotent (upsert by `equipment_category + guideword + parameter`)
- Registered in `server/routes.ts`
- Confirmed: `0 inserted, 16 already existed` on subsequent starts

---

## 5. Frontend

### Dashboard Page
File: `client/src/pages/hazop/hazop-dashboard.tsx`
- Two tabs: Project Studies, Concept Studies
- Create Study dialog (adapts form fields by mode)
- Delete confirmation dialog (draft-only enforcement)
- Status badges with colour coding
- TanStack Query for all fetches

### Navigation
File: `client/src/components/layout.tsx`
- `isHazopMenuOpen` state + auto-open on HAZOP page detection
- Nav block controlled by `hasViewPermission("HAZOP")`
- Positioned after Project Management block

### Routing
- `client/src/App.tsx`: `<ProtectedRoute path="/hazop/dashboard" component={...} />`
- `client/src/loaders/hazop.ts`: lazy-loaded via `lazyWithRetry`

---

## 6. Module Permissions

- `"HAZOP"` added to `modules` array in `shared/schema.ts`
- `module_permissions` rows seeded for all Superuser accounts (`can_view=true`)
- Navigation uses `hasViewPermission("HAZOP")` — no bypass code

---

## 7. Zero-Trust Audit Results

| Item | Check | Result |
|------|-------|--------|
| ZTA-1 | All 20 HAZOP tables exist | ✅ PASS (20/20) |
| ZTA-2 | `hazop_studies.study_number` UNIQUE constraint | ✅ PASS |
| ZTA-3 | `hazop_nodes` UNIQUE (step_id) | ✅ PASS |
| ZTA-4 | `hazop_ce_cells` UNIQUE (cause_id, effect_id) | ✅ PASS |
| ZTA-5 | Deviation library seeded (16 records, 4 categories) | ✅ PASS |
| ZTA-6 | `doc_sequences` partial unique indexes present | ✅ PASS |
| ZTA-7 | HAZOP module permissions seeded (Superuser) | ✅ PASS |
| ZTA-8 | No Phase 2+ routes (loop/step/node/generation) | ✅ PASS |
| ZTA-9 | `ALLOWED_STUDY_MODES` validation on POST | ✅ PASS |
| ZTA-10 | `project_id` required for `project_based` mode | ✅ PASS |
| ZTA-11 | `project_id` rejected for `concept_expected_project` mode | ✅ PASS |
| ZTA-12 | DELETE enforces draft-only (403 otherwise) | ✅ PASS |
| ZTA-13 | PATCH blocks `converted` status studies | ✅ PASS |
| ZTA-14 | Advisory lock on study creation | ✅ PASS |
| ZTA-15 | Prohibited PATCH fields silently ignored | ✅ PASS |

**All 15 items: PASS**

---

## 8. Rollback

To fully roll back Phase 1:
```sql
DROP TABLE IF EXISTS hazop_deviation_library CASCADE;
DROP TABLE IF EXISTS hazop_revisions CASCADE;
DROP TABLE IF EXISTS hazop_fat_sat_items CASCADE;
DROP TABLE IF EXISTS hazop_ce_cells CASCADE;
DROP TABLE IF EXISTS hazop_ce_effects CASCADE;
DROP TABLE IF EXISTS hazop_ce_causes CASCADE;
DROP TABLE IF EXISTS hazop_ce_matrix CASCADE;
DROP TABLE IF EXISTS hazop_safety_functions CASCADE;
DROP TABLE IF EXISTS hazop_actions CASCADE;
DROP TABLE IF EXISTS hazop_safeguards CASCADE;
DROP TABLE IF EXISTS hazop_consequences CASCADE;
DROP TABLE IF EXISTS hazop_causes CASCADE;
DROP TABLE IF EXISTS hazop_deviations CASCADE;
DROP TABLE IF EXISTS hazop_nodes CASCADE;
DROP TABLE IF EXISTS hazop_process_steps CASCADE;
DROP TABLE IF EXISTS hazop_process_loops CASCADE;
DROP TABLE IF EXISTS hazop_design_assumptions CASCADE;
DROP TABLE IF EXISTS hazop_concept_instruments CASCADE;
DROP TABLE IF EXISTS hazop_concept_equipment CASCADE;
DROP TABLE IF EXISTS hazop_studies CASCADE;
DELETE FROM module_permissions WHERE module_name = 'HAZOP';
```
Then remove `hazop-routes.ts`, `seed-hazop-library.ts`, loader, dashboard page, and revert `layout.tsx`, `App.tsx`, `routes.ts`, `schema.ts`.

---

## 9. Phase 2 Readiness

The data layer (tables 5–17) is fully deployed and ready for Phase 2 (Process Loop Builder UI). No schema changes anticipated for Phase 2 entry.
