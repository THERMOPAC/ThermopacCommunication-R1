---
name: drizzle-kit push unusable; additive sync governs
description: Why post-merge/dev schema sync must never use drizzle-kit push on this project, and how the additive sync works
---

# drizzle-kit push is unusable on this project

**Rule:** Never run `drizzle-kit push` (or `npm run db:push`) to completion against this database. Post-merge setup uses `scripts/db-additive-sync.ts` instead (additive only: CREATE TABLE / ADD COLUMN, never drop/rename).

**Why:**
- Schema pull alone takes ~5 minutes (very large schema), so push blows typical timeouts.
- Push prompts interactively on create-vs-rename ambiguity; with stdin closed it dies at the prompt but exits 0 — "success" with nothing applied.
- The DB carries dozens of live-data columns that are absent from `shared/schema.ts` (accepted historical drift: mirror_status/mirror_job_id, SAP sync fields, invoices paid/outstanding amounts, welder camelCase columns, etc.). A completed forced push would DROP them.
- drizzle-kit 0.30 crashes (Zod invalid_type) introspecting expression indexes such as `COALESCE(state,'')`; the statutory_filing_uniq index was converted to a `UNIQUE NULLS NOT DISTINCT` constraint for this reason — prefer that pattern over expression indexes.

**How to apply:**
- Additive schema changes flow automatically via post-merge (`scripts/post-merge.sh` → `db-additive-sync.ts`; timeout 720s).
- Renames, drops, NOT NULL tightening, and constraint changes must be done deliberately with SQL, preserving data (e.g. material_identification_counter `sequence`→`sequence_number` was a data-preserving rename).
- `--dry-run` flag on the sync script previews statements and reports drift warnings.
