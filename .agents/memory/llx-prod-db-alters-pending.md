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
(The partial index is REQUIRED — generateReport's ON CONFLICT targets `(revision_id, doc_type) WHERE NOT is_stale`.) Re-seed DS-SEL register (now includes DS-SEL-006).
