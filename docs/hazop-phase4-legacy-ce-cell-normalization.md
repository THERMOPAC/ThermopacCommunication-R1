# HAZOP — Deferred Technical Debt: Legacy CE Cell Normalization

**Document ID:** HAZOP-TD-001  
**Status:** DEFERRED — accepted at Phase 4B closure (2026-05-25)  
**Owner:** Engineering / QMS Platform  
**Priority:** Low (no runtime blocker)

---

## 1. Background

The `hazop_ce_cells` table was created in Phase 1 of the HAZOP module to support the original Cause & Effect matrix implementation. It carries two legacy columns with hard NOT NULL constraints and foreign keys to the Phase 1 legacy tables:

```sql
cause_id  INTEGER NOT NULL REFERENCES hazop_ce_causes(id)  ON DELETE CASCADE
effect_id INTEGER NOT NULL REFERENCES hazop_ce_effects(id) ON DELETE CASCADE
UNIQUE (cause_id, effect_id)
```

These columns, and the tables they reference (`hazop_ce_causes`, `hazop_ce_effects`), belong to the v1.0 / v1.1 C&E matrix schema.

## 2. Phase 4B Additive Extension

In Phase 4B, the C&E matrix was redesigned around two new tables:

- `hazop_ce_rows` — rows keyed to `hazop_event_groups`
- `hazop_ce_columns` — columns keyed to `hazop_response_groups`
- `hazop_ce_matrices` — the new parent matrix entity

The `hazop_ce_cells` table was extended **additively** (policy: no destructive migration) with four new nullable columns:

```sql
v4b_matrix_id  INTEGER REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE
row_id         INTEGER REFERENCES hazop_ce_rows(id)     ON DELETE CASCADE
col_id         INTEGER REFERENCES hazop_ce_columns(id)  ON DELETE CASCADE
triggered      BOOLEAN NOT NULL DEFAULT false
```

Phase 4B records are distinguished from legacy records by the discriminator:

```sql
WHERE row_id IS NOT NULL   -- Phase 4B records
WHERE row_id IS NULL       -- Legacy Phase 1 records
```

The Phase 4B route handler (`POST /api/hazop/ce-matrices/:id/cells`) correctly writes Phase 4B records through the application layer. The legacy `cause_id`/`effect_id` NOT NULL constraint only blocks **psql-direct insertion of Phase 4B cells** (used in UAT seeding, not in production use).

## 3. Accepted Limitations

| Limitation | Impact |
|---|---|
| Cannot insert Phase 4B cells via psql without providing dummy cause_id/effect_id | Low — production use is via authenticated API only |
| UNIQUE constraint on `(cause_id, effect_id)` is meaningless for Phase 4B records | None — Phase 4B records have `cause_id IS NULL` |
| Legacy tables `hazop_ce_causes` and `hazop_ce_effects` must be retained | Low — small footprint, no performance impact |

## 4. Future Normalization Work (Deferred)

When Phase 4B usage is stable and Phase 1 legacy data is archived or migrated, the following normalization steps should be executed:

### Step 1 — Verify no live Phase 1 records remain
```sql
SELECT COUNT(*) FROM hazop_ce_cells WHERE row_id IS NULL;
-- Must be 0 before proceeding
```

### Step 2 — Drop legacy NOT NULL constraints
```sql
ALTER TABLE hazop_ce_cells ALTER COLUMN cause_id DROP NOT NULL;
ALTER TABLE hazop_ce_cells ALTER COLUMN effect_id DROP NOT NULL;
```

### Step 3 — Drop legacy unique constraint
```sql
ALTER TABLE hazop_ce_cells DROP CONSTRAINT hazop_ce_cells_cause_id_effect_id_key;
```

### Step 4 — Add Phase 4B unique constraint
```sql
ALTER TABLE hazop_ce_cells
  ADD CONSTRAINT hazop_ce_cells_v4b_row_col_key
  UNIQUE (v4b_matrix_id, row_id, col_id)
  WHERE row_id IS NOT NULL;
```

### Step 5 — Drop Phase 1 legacy tables (if fully decommissioned)
```sql
DROP TABLE hazop_ce_causes CASCADE;
DROP TABLE hazop_ce_effects CASCADE;
-- Also drop cause_id and effect_id columns from hazop_ce_cells
ALTER TABLE hazop_ce_cells DROP COLUMN cause_id;
ALTER TABLE hazop_ce_cells DROP COLUMN effect_id;
```

### Step 6 — Remove discriminator pattern from codebase
Replace all `WHERE row_id IS NOT NULL` / `WHERE row_id IS NULL` discriminators with clean Phase 4B-only queries.

## 5. Prerequisites for Normalization

- [ ] Phase 1 legacy HAZOP data fully migrated or archived
- [ ] `hazop_ce_causes` and `hazop_ce_effects` confirmed empty or decommissioned
- [ ] No active UI features depend on Phase 1 C&E schema
- [ ] Change Management approval (MOC required for schema destructive migration)
- [ ] Backup taken before any DROP operations

## 6. Acceptance Decision

This debt item was formally accepted at Phase 4B UAT closure on **2026-05-25** by the project owner.

Decision rationale:
- UI route logic functions correctly end-to-end
- No runtime blocker exists in production
- Additive-only migration policy was preserved throughout Phase 4B
- No Phase 4B architectural requirement is violated
- The `cause_id` constraint only affects psql-direct seeding (test/UAT context)

---

*Recorded by: THERMOPAC QMS Platform Engineering*  
*Date: 2026-05-25*  
*Phase 4B Closure Reference: ZTA-4B-CLOSED / UAT-4B-ACCEPTED*
