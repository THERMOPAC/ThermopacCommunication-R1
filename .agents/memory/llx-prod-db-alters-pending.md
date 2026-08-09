---
name: LLX pending production DB ALTERs
description: Check-constraint widenings applied manually to the dev DB that must be applied to the production DB at/after next publish (schema.ts already updated).
---

## The Rule
The dev DB got manual `ALTER TABLE ... DROP/ADD CONSTRAINT` widenings during LLX workspace work; production still has the old constraints until they are applied there. `shared/schema.ts` matches the widened dev state.

**Pending on production:**
- `ds_inputs_section_chk` — add `ecp_design`, `ecr_design` (plus three earlier widenings from prior sessions).
- `ds_calc_runs_type_chk` — add `mechanical_vessel`.
- `ds_results_section_chk` — add `mechanical_vessel` (keep `comparison`, `summary` — dropping them broke the constraint once in dev; full list: process_design, hydraulics_common, ecp, ecr, comparison, summary, mechanical_vessel).

**Also pending on production:** `CREATE TABLE design_reports` + `design_report_events` (Stage 13 reporting) AND the five V&V tables `vv_regression_cases`, `vv_regression_runs`, `vv_equation_register`, `vv_verification_findings`, `vv_engine_version_approvals` — all created manually in dev via Node pg; re-run the same DDL on prod at next publish (see `server/vv/` and `server/design-reports/` for column lists).

**How to apply:** run the ALTERs against production via the production DB query path after publish; drizzle push is unreliable here (schema too large — see publish DB-diff hang note).

## design_selection_records (new table, dev-only as of 2026-08-06)
Apply to prod at next publish:
```sql
CREATE TABLE IF NOT EXISTS design_selection_records (LIKE design_selection_records INCLUDING ALL); -- NO: run the real DDL below
```
Real DDL: copy from dev — `pg_dump --schema-only -t design_selection_records` or re-run the raw SQL used in dev (table with record jsonb, selected_technology, selected_diameter_mm, confidence_level, selection_status chk (recommended/engineering_review_required/not_recommendable), is_superseded, decision chk (pending/approved/verification_requested/overridden), decision_by/at/engineer/reason, override_technology/diameter_mm/impact, created_by/at).
Also seed prod V&V equation register: `npx tsx server/vv/seed-dsel-equation-register.ts` against prod DB.
Also on prod: `CREATE UNIQUE INDEX IF NOT EXISTS design_selection_records_one_active_per_revision ON design_selection_records (revision_id) WHERE is_superseded = FALSE;`

## DS-SEL-006 diameter governance (dev-only as of 2026-08-07)
Apply to prod at next publish:
```sql
ALTER TABLE design_selection_records
  ADD COLUMN IF NOT EXISTS selection_mode varchar(20) NOT NULL DEFAULT 'autonomous',
  ADD COLUMN IF NOT EXISTS user_selected_diameter_mm integer,
  ADD COLUMN IF NOT EXISTS effective_diameter_mm integer,
  ADD COLUMN IF NOT EXISTS user_selection_engineer varchar(120),
  ADD COLUMN IF NOT EXISTS user_selection_reason text,
  ADD COLUMN IF NOT EXISTS user_selection_at timestamp,
  ADD COLUMN IF NOT EXISTS selection_impact jsonb;
ALTER TABLE design_selection_records ADD CONSTRAINT dsel_records_mode_chk CHECK (selection_mode IN ('autonomous','user_selected'));
ALTER TABLE design_reports
  ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stale_reason text;
DROP INDEX IF EXISTS design_reports_rev_doc_uidx;
CREATE UNIQUE INDEX design_reports_rev_doc_live_uidx ON design_reports (revision_id, doc_type) WHERE NOT is_stale;
```
## design_software_reference_papers (Step 15 library, dev-only as of 2026-08-07)
Apply to prod at next publish (definition matches shared/schema.ts `designSoftwareReferencePapers`):
```sql
CREATE TABLE IF NOT EXISTS design_software_reference_papers (
  id SERIAL PRIMARY KEY, ref_code VARCHAR(20) NOT NULL, authors TEXT NOT NULL,
  organization VARCHAR(200), title TEXT NOT NULL, publication TEXT NOT NULL,
  year INTEGER NOT NULL, used_for TEXT NOT NULL, notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT ds_ref_papers_status_chk CHECK (status IN ('active','superseded','withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS ds_ref_papers_code_uniq ON design_software_reference_papers (ref_code);
ALTER TABLE design_software_reference_papers
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(300),
  ADD COLUMN IF NOT EXISTS file_uploaded_at TIMESTAMP;
```
Also seed REF-001 (Duss, Sulzer, AIChE Spring 2013, ECP pressure-drop framework) and REF-002 (Rauber, Sulzer, AIChE Annual 2006, hydraulic screening 35–60 m³/m²·h) with ON CONFLICT (ref_code) DO NOTHING.

(The partial index is REQUIRED — generateReport's ON CONFLICT targets `(revision_id, doc_type) WHERE NOT is_stale`.) Re-seed DS-SEL register (now includes DS-SEL-006).

## CPS Knowledge Engine (Phase 1) — apply to prod at next publish
```sql
CREATE TABLE IF NOT EXISTS cps_knowledge_parameters (
  id SERIAL PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  parameter_name VARCHAR(200) NOT NULL,
  parameter_code VARCHAR(60) NOT NULL,
  symbol VARCHAR(40),
  parameter_type VARCHAR(30) NOT NULL,
  value NUMERIC,
  unit VARCHAR(40),
  description TEXT,
  engineering_notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  CONSTRAINT cps_kparams_category_chk CHECK (category IN ('media_column','material_properties','heating_cooling','process_cutoff','process_times','regeneration_recovery','standard_equipment','regen_offgas_tox')),
  CONSTRAINT cps_kparams_type_chk CHECK (parameter_type IN ('performance','physical_constant','process_threshold','process_time','equipment_standard'))
);
CREATE UNIQUE INDEX IF NOT EXISTS cps_kparams_code_uniq ON cps_knowledge_parameters (parameter_code);
CREATE INDEX IF NOT EXISTS cps_kparams_category_idx ON cps_knowledge_parameters (category);
CREATE TABLE IF NOT EXISTS cps_knowledge_parameter_history (
  id SERIAL PRIMARY KEY,
  parameter_id INTEGER NOT NULL REFERENCES cps_knowledge_parameters(id),
  parameter_code VARCHAR(60) NOT NULL,
  old_value NUMERIC,
  new_value NUMERIC,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cps_kparam_hist_param_idx ON cps_knowledge_parameter_history (parameter_id);
```
Seed prod by running `scripts/create-cps-knowledge-tables.ts` against prod DB (idempotent, ON CONFLICT DO NOTHING).

## cps_sizing_cases (new table, dev-only as of 2026-08-08)
CPS Sizing Tool Customer Input cases. Apply at next publish by running
`npx tsx scripts/create-cps-sizing-cases-table.ts` against prod (idempotent),
or equivalent DDL: table cps_sizing_cases with scope CHECK
(COLOUR_ODOR / COLOUR_ODOR_SULPHUR) and conditional sulphur NULL/NOT NULL CHECK.
