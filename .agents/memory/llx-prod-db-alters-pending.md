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

**How to apply:** run the ALTERs against production via the production DB query path after publish; drizzle push is unreliable here (schema too large — see publish DB-diff hang note).
