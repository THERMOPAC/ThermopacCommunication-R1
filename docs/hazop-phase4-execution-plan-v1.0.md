# HAZOP Phase 4 — Execution Plan v1.0
**Document**: `docs/hazop-phase4-execution-plan-v1.0.md`  
**Status**: APPROVED FOR PLANNING — Implementation pending gate review  
**Predecessor**: Phase 3 closure approved 2026-05-25  
**Author**: QMS Architect  

---

## Table of Contents
1. [Scope](#1-scope)
2. [Exclusions](#2-exclusions)
3. [Schema Changes Required](#3-schema-changes-required)
4. [API Routes](#4-api-routes)
5. [UI Pages](#5-ui-pages)
6. [Linkage to Phase 3 Worksheet Data](#6-linkage-to-phase-3-worksheet-data)
7. [Zero-Trust Audit Checklist](#7-zero-trust-audit-checklist)
8. [Rollback Plan](#8-rollback-plan)
9. [Phase 4 Readiness Gate](#9-phase-4-readiness-gate)

---

## 1. Scope

Phase 4 transforms raw HAZOP worksheet outputs (deviations, safeguards, actions) into structured, traceable engineering safety artefacts. It is entirely downstream of Phase 3 — no Phase 3 data is modified; Phase 4 only reads and links to it.

### 1.1 Deliverables

| Artefact | Description |
|---|---|
| **Cause & Effect (C&E) Matrix** | Tabular cross-reference of process demands (rows) against protective responses (columns). Each cell is a Boolean trigger mark plus optional notes. |
| **Safety Function Register** | Formal Safety Instrumented Functions (SIFs) extracted from the matrix. Each SIF has a process demand, safety action, required SIL, response time, and final element. |
| **Interlock Register** | All process and SIS interlocks identified from safeguards, with type classification (process / safety / SIS), set-point, reset type, and bypass provision. |
| **Alarm & Trip Register** | Rationalised alarm/trip list derived from safeguards and the C&E matrix, with priority, rationalization status, and operator/system actions. |

### 1.2 Key Functional Requirements

- Every Phase 4 record **must carry a `source_deviation_id` or `source_safeguard_id`** tracing it back to the Phase 3 worksheet — orphan records are prohibited.
- **Auto-extract engine**: one-click extraction populates C&E rows/columns from Phase 3 deviations + safeguards. Manual additions are allowed afterward.
- C&E Matrix supports study-scoped or node-scoped views.
- Deviation numbers from Phase 3 (`{node_ref}-D{nn}`) appear inline in the C&E matrix row headers for traceability.
- Phase 4 records are editable only while `hazop_studies.status = 'draft'`; approved studies are read-only.
- Advisory-lock `study_id * 10000 + 4001` guards all Phase 4 bulk-write operations per study.

### 1.3 Sub-Task Breakdown

| ID | Task | Blocked By |
|---|---|---|
| T4-001 | Schema — psql ALTER + shared/schema.ts | — |
| T4-002 | Routes — C&E Matrix CRUD + extract engine | T4-001 |
| T4-003 | Routes — Safety Functions CRUD | T4-001 |
| T4-004 | Routes — Interlock Register CRUD + extract | T4-001 |
| T4-005 | Routes — Alarm/Trip Register CRUD + extract | T4-001 |
| T4-006 | Routes — Phase 4 summary endpoint | T4-002…T4-005 |
| T4-007 | UI — C&E Matrix editor page | T4-002 |
| T4-008 | UI — Safety Functions page | T4-003 |
| T4-009 | UI — Interlock Register page | T4-004 |
| T4-010 | UI — Alarm/Trip Register page | T4-005 |
| T4-011 | UI — Phase 4 Dashboard + nav wiring | T4-007…T4-010 |
| T4-012 | ZTA verification | T4-011 |

---

## 2. Exclusions

The following are **explicitly out of scope for Phase 4**:

| Excluded Item | Reason / Deferral |
|---|---|
| SIL Verification / LOPA calculations | Requires probabilistic data (PFD, failure rates) — Phase 5 |
| Functional Safety Assessment (FSA) | Formal IEC 61511 FSA lifecycle — Phase 5 |
| Logic diagram / cause & effect diagram drawing (graphical) | Vector drawing tool — separate module |
| Export to SIS vendor formats (Triconex, Siemens, Rockwell) | Vendor-specific — post-Phase 5 |
| Safety Requirement Specification (SRS) document generation | Phase 5 |
| Integration with SAP PM for alarm maintenance | Separate SAP integration track |
| ATEX / zone classification mapping | Out of HAZOP scope |
| Historical alarm rate analytics | Requires DCS historian feed |

---

## 3. Schema Changes Required

> **Implementation note**: `drizzle-kit push` hangs in this environment. All DDL must be applied via direct `psql` statements. `shared/schema.ts` must be updated in parallel for ORM type safety.

### 3.1 New Tables

#### `hazop_ce_matrices`
Primary header for each C&E matrix. One matrix can be study-scoped (all nodes) or node-scoped.

```sql
CREATE TABLE hazop_ce_matrices (
  id               SERIAL PRIMARY KEY,
  study_id         INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  node_id          INT REFERENCES hazop_nodes(id) ON DELETE SET NULL,  -- null = study-scoped
  matrix_number    TEXT NOT NULL,   -- e.g. "CEM-2627-001"
  title            TEXT,
  scope_description TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','reviewed','approved')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, matrix_number)
);
```

#### `hazop_ce_rows`
Initiating demands/causes — rows of the C&E matrix.

```sql
CREATE TABLE hazop_ce_rows (
  id                    SERIAL PRIMARY KEY,
  matrix_id             INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  row_number            INT NOT NULL,
  description           TEXT NOT NULL,
  row_type              TEXT NOT NULL DEFAULT 'demand'
                          CHECK (row_type IN ('demand','alarm','trip','interlock','other')),
  tag_ref               TEXT,            -- e.g. "LSHH-101"
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_cause_id       INT REFERENCES hazop_causes(id) ON DELETE SET NULL,
  UNIQUE (matrix_id, row_number)
);
```

#### `hazop_ce_columns`
Protective responses — columns of the C&E matrix.

```sql
CREATE TABLE hazop_ce_columns (
  id                    SERIAL PRIMARY KEY,
  matrix_id             INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  col_number            INT NOT NULL,
  description           TEXT NOT NULL,
  col_type              TEXT NOT NULL DEFAULT 'interlock'
                          CHECK (col_type IN ('alarm','trip','shutdown','interlock','sis','process_action','other')),
  tag_ref               TEXT,            -- e.g. "XV-101"
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  source_action_id      INT REFERENCES hazop_actions(id) ON DELETE SET NULL,
  UNIQUE (matrix_id, col_number)
);
```

#### `hazop_ce_cells`
Intersection cells. Sparse — only triggered intersections need a row (interpret missing = false).

```sql
CREATE TABLE hazop_ce_cells (
  id           SERIAL PRIMARY KEY,
  matrix_id    INT NOT NULL REFERENCES hazop_ce_matrices(id) ON DELETE CASCADE,
  row_id       INT NOT NULL REFERENCES hazop_ce_rows(id) ON DELETE CASCADE,
  col_id       INT NOT NULL REFERENCES hazop_ce_columns(id) ON DELETE CASCADE,
  triggered    BOOLEAN NOT NULL DEFAULT true,
  notes        TEXT,
  UNIQUE (row_id, col_id)
);
```

#### `hazop_safety_functions`
Safety Instrumented Functions (SIFs).

```sql
CREATE TABLE hazop_safety_functions (
  id                    SERIAL PRIMARY KEY,
  study_id              INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  sif_number            TEXT NOT NULL,   -- e.g. "SIF-001"
  description           TEXT NOT NULL,
  process_demand        TEXT,
  safety_action         TEXT,
  sil_required          INT CHECK (sil_required IN (1,2,3,4)),
  response_time_sec     INT,
  initiating_tag        TEXT,
  final_element         TEXT,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','verified','approved')),
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  ce_column_id          INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, sif_number)
);
```

#### `hazop_interlocks`
Interlock register.

```sql
CREATE TABLE hazop_interlocks (
  id                    SERIAL PRIMARY KEY,
  study_id              INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  interlock_number      TEXT NOT NULL,   -- e.g. "IL-001" or "SIS-001"
  interlock_type        TEXT NOT NULL
                          CHECK (interlock_type IN ('process','safety','SIS')),
  description           TEXT NOT NULL,
  initiating_condition  TEXT,
  final_action          TEXT,
  initiating_tag        TEXT,
  final_element_tag     TEXT,
  set_point             TEXT,
  reset_type            TEXT CHECK (reset_type IN ('auto','manual')),
  bypass_provision      BOOLEAN NOT NULL DEFAULT false,
  sil_level             INT CHECK (sil_level IN (1,2,3,4)),   -- null for process interlocks
  status                TEXT NOT NULL DEFAULT 'identified'
                          CHECK (status IN ('identified','verified','approved')),
  source_deviation_id   INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id   INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  ce_row_id             INT REFERENCES hazop_ce_rows(id) ON DELETE SET NULL,
  ce_column_id          INT REFERENCES hazop_ce_columns(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, interlock_number)
);
```

#### `hazop_alarm_trips`
Alarm and trip rationalization register.

```sql
CREATE TABLE hazop_alarm_trips (
  id                       SERIAL PRIMARY KEY,
  study_id                 INT NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE,
  alarm_number             TEXT NOT NULL,   -- e.g. "ALM-001" or "TRIP-001"
  alarm_type               TEXT NOT NULL
                             CHECK (alarm_type IN ('alarm','trip','shutdown')),
  tag_ref                  TEXT,
  description              TEXT NOT NULL,
  process_parameter        TEXT,            -- Pressure | Temperature | Flow | Level | etc.
  set_point                TEXT,
  alarm_action             TEXT,            -- operator response
  trip_action              TEXT,            -- automatic system action
  priority                 TEXT NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low','medium','high','critical')),
  rationalization_status   TEXT NOT NULL DEFAULT 'pending'
                             CHECK (rationalization_status IN ('pending','rationalized','suppressed','deleted')),
  source_deviation_id      INT REFERENCES hazop_deviations(id) ON DELETE SET NULL,
  source_safeguard_id      INT REFERENCES hazop_safeguards(id) ON DELETE SET NULL,
  interlock_id             INT REFERENCES hazop_interlocks(id) ON DELETE SET NULL,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by               INT REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (study_id, alarm_number)
);
```

### 3.2 `shared/schema.ts` additions

One Drizzle table definition per new table, following the existing HAZOP pattern:
- Use `serial('id').primaryKey()`
- Foreign key references via `integer('...')` (no `references()` in Drizzle ORM raw)
- Export `insertHazopCeMatrixSchema`, `insertHazopSafetyFunctionSchema`, etc. via `createInsertSchema(...).omit({ id: true })`
- Export select types via `typeof hazopCeMatrices.$inferSelect`

### 3.3 DB Sequence Counter Strategy

Auto-numbering for `matrix_number`, `sif_number`, `interlock_number`, `alarm_number` uses the same `MAX() + 1` with advisory lock pattern established in Phase 3. Format:

| Entity | Format | Example |
|---|---|---|
| C&E Matrix | `CEM-{study_number}-{nn:03d}` | `CEM-CONCEPT-HAZOP-2627-001-001` |
| Safety Function | `SIF-{study_number}-{nn:03d}` | `SIF-CONCEPT-HAZOP-2627-001-001` |
| Interlock | `IL-{nn:03d}` (process) / `SIS-{nn:03d}` (SIS) | `IL-001`, `SIS-001` |
| Alarm/Trip | `ALM-{nn:04d}` / `TRIP-{nn:04d}` | `ALM-0001` |

---

## 4. API Routes

All routes are registered in `server/hazop-routes.ts` under a `// PHASE 4` comment block appended to the existing file. All routes require `ensureAuthenticated`. All mutating routes check `study.status === 'draft'` before writing.

### 4.1 C&E Matrix

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/ce-matrices` | List all matrices for a study |
| `POST` | `/api/hazop/studies/:studyId/ce-matrices` | Create new matrix (auto-number) |
| `GET` | `/api/hazop/ce-matrices/:id/full` | Full matrix: rows, columns, cells (sparse) |
| `PATCH` | `/api/hazop/ce-matrices/:id` | Update title / status / scope |
| `DELETE` | `/api/hazop/ce-matrices/:id` | Delete matrix (draft only) |
| `POST` | `/api/hazop/ce-matrices/:id/extract-from-hazop` | Auto-extract rows from deviations + columns from safeguards |
| `POST` | `/api/hazop/ce-matrices/:id/rows` | Add row manually |
| `PATCH` | `/api/hazop/ce-rows/:rowId` | Update row |
| `DELETE` | `/api/hazop/ce-rows/:rowId` | Delete row |
| `POST` | `/api/hazop/ce-matrices/:id/columns` | Add column manually |
| `PATCH` | `/api/hazop/ce-columns/:colId` | Update column |
| `DELETE` | `/api/hazop/ce-columns/:colId` | Delete column |
| `PUT` | `/api/hazop/ce-matrices/:id/cells` | Bulk upsert cells (`[{row_id, col_id, triggered, notes}]`) |

#### Extract-from-HAZOP logic (POST `.../extract-from-hazop`)
1. Acquires advisory lock `study_id * 10000 + 4001`.
2. Reads all deviations for the matrix scope (study or node).
3. For each deviation: inserts a `hazop_ce_rows` row (type=`demand`) linked via `source_deviation_id`.
4. For each safeguard across those deviations: inserts a `hazop_ce_columns` row linked via `source_safeguard_id`. Deduplicates by `tag_ref` + `col_type` if the same safeguard appears across multiple deviations.
5. Uses `ON CONFLICT DO NOTHING` — idempotent, safe to re-run.
6. Returns `{ rows_inserted, columns_inserted, rows_skipped, columns_skipped }`.

### 4.2 Safety Functions

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/safety-functions` | List all SIFs, optional `?status=draft` filter |
| `POST` | `/api/hazop/studies/:studyId/safety-functions` | Create SIF (auto-number) |
| `PATCH` | `/api/hazop/safety-functions/:id` | Update (description, SIL, tags, status, etc.) |
| `DELETE` | `/api/hazop/safety-functions/:id` | Delete (draft status only) |

**Updatable fields** (PATCH allowed list): `description`, `process_demand`, `safety_action`, `sil_required`, `response_time_sec`, `initiating_tag`, `final_element`, `status`, `ce_column_id`, `source_deviation_id`, `source_safeguard_id`, `notes`.

### 4.3 Interlock Register

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/interlocks` | List, optional `?type=SIS` filter |
| `POST` | `/api/hazop/studies/:studyId/interlocks` | Create (auto-number per type) |
| `PATCH` | `/api/hazop/interlocks/:id` | Update fields |
| `DELETE` | `/api/hazop/interlocks/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/interlocks/extract-from-safeguards` | Auto-identify interlocks from safeguards with `safeguard_type='interlock'` or `'SIS'` |

#### Extract-from-safeguards logic
1. Reads all safeguards where `safeguard_type IN ('interlock','SIS')` for the study.
2. For each: inserts an `hazop_interlocks` row with `source_safeguard_id` and inferred `interlock_type` (SIS if `safeguard_type='SIS'`, else `process`).
3. `ON CONFLICT DO NOTHING` on `(study_id, interlock_number)`.

### 4.4 Alarm/Trip Register

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/alarm-trips` | List, optional `?type=alarm` or `?rationalization_status=pending` filter |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips` | Create manually |
| `PATCH` | `/api/hazop/alarm-trips/:id` | Update (priority, set-point, actions, rationalization_status) |
| `DELETE` | `/api/hazop/alarm-trips/:id` | Delete (draft only) |
| `POST` | `/api/hazop/studies/:studyId/alarm-trips/extract-from-safeguards` | Auto-create from safeguards with type `alarm` or `trip` |

### 4.5 Phase 4 Summary

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/phase4-summary` | Counts + linkage completeness: total rows with vs. without `source_deviation_id`, pending rationalizations, unlinked SIFs, etc. |

---

## 5. UI Pages

All pages live under `client/src/pages/hazop/` and are registered in `client/src/loaders/hazop.ts` + `client/src/App.tsx`.

### 5.1 `hazop-phase4-dashboard.tsx`

**Route**: `/hazop/studies/:id/phase4`  
**Purpose**: Entry point for Phase 4. Shows:
- 4 stat cards: C&E Matrices, Safety Functions, Interlocks, Alarms/Trips
- Linkage completeness bar (% of Phase 4 records with Phase 3 source link)
- Quick-navigate buttons to each Phase 4 sub-page
- "Extract from HAZOP" call-to-action for empty studies

### 5.2 `hazop-ce-matrix.tsx`

**Route**: `/hazop/studies/:id/ce-matrix/:matrixId`  
**Purpose**: Spreadsheet-like C&E matrix editor.

Layout:
```
[ Matrix header: number, title, status badge ] [Extract from HAZOP] [Add Row] [Add Column]
┌──────────────────────────────┬──────┬──────┬──────┬──────────────────┐
│ Demand / Cause               │ XV-101│ XV-102│ ALM  │ (+ add column)  │
│ (tag ref, deviation number)  │ Close│ Close│ PAHH │                  │
├──────────────────────────────┼──────┼──────┼──────┤                  │
│ 1.1-D01 | No Flow | LSHH-101 │  ✓   │      │  ✓   │                  │
│ 1.1-D02 | More Level         │      │  ✓   │  ✓   │                  │
│ (+ add row)                  │      │      │      │                  │
└──────────────────────────────┴──────┴──────┴──────┴──────────────────┘
```

Cell interaction: click to toggle triggered/not-triggered; right-click or hover for notes popover.  
Column headers and row headers are inline-editable (click to edit).  
Phase 3 source traceability shown as tooltip on row/column hover (deviation number, safeguard description).

### 5.3 `hazop-safety-functions.tsx`

**Route**: `/hazop/studies/:id/safety-functions`  
**Purpose**: SIF register — table + edit/create form.

Columns: SIF Number | Description | Process Demand | Safety Action | SIL Required | Initiating Tag | Final Element | Status | Source Deviation  
Filter bar: status filter, SIL filter  
Actions: Add SIF, Edit, Delete (draft only)  
Source deviation column shows the Phase 3 deviation number as a clickable link back to the worksheet.

### 5.4 `hazop-interlocks.tsx`

**Route**: `/hazop/studies/:id/interlocks`  
**Purpose**: Interlock register.

Columns: Interlock No. | Type | Description | Initiating Condition | Final Action | Initiating Tag | Final Element | Set Point | Reset | Bypass | SIL | Status  
Filter: type (process / safety / SIS), status  
Actions: Add Interlock, Edit, Delete, "Extract from Safeguards" bulk action  
SIS interlocks show a red "SIS" badge; process interlocks show grey.  
SIL level shown as coloured badge (SIL 1 = yellow, SIL 2 = orange, SIL 3 = red).

### 5.5 `hazop-alarm-trips.tsx`

**Route**: `/hazop/studies/:id/alarm-trips`  
**Purpose**: Alarm rationalization register.

Columns: Alarm No. | Type | Tag Ref | Description | Parameter | Set Point | Priority | Alarm Action | Trip Action | Rationalization Status | Source  
Filter: alarm_type, priority, rationalization_status  
Rationalization workflow: Pending → Rationalized or Suppressed or Deleted  
Priority badge: Critical = red, High = orange, Medium = amber, Low = grey  
"Extract from Safeguards" button auto-populates pending alarms.

### 5.6 Navigation wiring

Add Phase 4 navigation to the process-builder header bar:

```tsx
<Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/phase4`)}>
  <Zap className="h-4 w-4" /> Phase 4
</Button>
```

The Phase 4 dashboard then links to each sub-page. The worksheet page (`hazop-worksheet.tsx`) also gets a "Phase 4" nav button.

---

## 6. Linkage to Phase 3 Worksheet Data

Every Phase 4 entity traces directly to Phase 3 via FK columns. The linkage rules are:

### 6.1 Mandatory linkage rules

| Phase 4 Table | Required Link | Prohibition |
|---|---|---|
| `hazop_ce_rows` | At least one of `source_deviation_id` or `source_cause_id` | Orphan rows allowed only if created manually (source = 'manual') |
| `hazop_ce_columns` | At least one of `source_safeguard_id` or `source_action_id` | Same as above |
| `hazop_safety_functions` | `source_deviation_id` required at create time | Cannot create SIF without pointing to a deviation |
| `hazop_interlocks` | `source_safeguard_id` required (or `source_deviation_id` for manual) | No orphan interlocks |
| `hazop_alarm_trips` | `source_safeguard_id` required (or `source_deviation_id`) | No orphan alarm records |

The API enforces these rules at POST time (400 response if mandatory link absent).

### 6.2 Phase 3 → Phase 4 traceability map

```
hazop_deviations
  ├── hazop_ce_rows (source_deviation_id)
  ├── hazop_safety_functions (source_deviation_id)
  ├── hazop_interlocks (source_deviation_id)
  └── hazop_alarm_trips (source_deviation_id)

hazop_safeguards
  ├── hazop_ce_columns (source_safeguard_id)
  ├── hazop_safety_functions (source_safeguard_id)
  ├── hazop_interlocks (source_safeguard_id)
  └── hazop_alarm_trips (source_safeguard_id)

hazop_actions
  └── hazop_ce_columns (source_action_id)

hazop_ce_columns
  └── hazop_safety_functions (ce_column_id)

hazop_interlocks
  └── hazop_alarm_trips (interlock_id)
```

### 6.3 Cascade behaviour on Phase 3 deletion

Phase 3 records can only be deleted while `study.status = 'draft'`. On deletion:
- `source_deviation_id`, `source_safeguard_id`, `source_cause_id`, `source_action_id` FK columns are `ON DELETE SET NULL` (not cascade delete).
- The `phase4-summary` endpoint reports orphaned Phase 4 records (null source) as a completeness warning.

### 6.4 Reviewed deviations protection extends to Phase 4

A Phase 3 deviation marked `reviewed = true` also protects its linked Phase 4 records from bulk-delete operations. Any route that deletes or bulk-overwrites Phase 3 deviations checks `reviewed` first — this rule already exists in Phase 3 and must not be weakened.

---

## 7. Zero-Trust Audit Checklist

Run this checklist after T4-012 (ZTA verification task) before marking Phase 4 complete.

### 7.1 Auth & access control
- [ ] All Phase 4 `GET` routes return `401` without a valid session cookie
- [ ] All Phase 4 `POST`/`PATCH`/`DELETE` routes return `401` without a valid session cookie
- [ ] Mutating routes return `409` when `study.status ≠ 'draft'`
- [ ] Advisory lock `study_id * 10000 + 4001` is present on all bulk-write operations (extract engine)
- [ ] No route accepts raw `study_id` from the request body for mutation — always resolved from URL params

### 7.2 Linkage integrity
- [ ] `POST /safety-functions` rejects (400) when `source_deviation_id` is absent
- [ ] `POST /interlocks` rejects (400) when both `source_safeguard_id` and `source_deviation_id` are absent
- [ ] `POST /alarm-trips` rejects (400) when both source links are absent
- [ ] `phase4-summary` correctly counts orphaned Phase 4 records (null source links)
- [ ] Deleting a Phase 3 safeguard sets `hazop_alarm_trips.source_safeguard_id = NULL` (not cascade deletes the alarm record)

### 7.3 C&E Matrix cell integrity
- [ ] Cell bulk-upsert (`PUT .../cells`) uses `ON CONFLICT (row_id, col_id) DO UPDATE` — no phantom duplicate cells
- [ ] Deleting a matrix row also deletes all its cells (CASCADE enforced via FK)
- [ ] Deleting a matrix column also deletes all its cells (CASCADE enforced via FK)
- [ ] Extract-from-HAZOP is idempotent (run twice = same result, no duplicate rows or columns)

### 7.4 Numbering uniqueness
- [ ] `UNIQUE (study_id, sif_number)` constraint tested — duplicate SIF number rejected with `409`
- [ ] `UNIQUE (study_id, interlock_number)` constraint tested
- [ ] `UNIQUE (study_id, alarm_number)` constraint tested
- [ ] `UNIQUE (study_id, matrix_number)` constraint tested
- [ ] Advisory lock prevents race condition on sequence generation (concurrent create attempts)

### 7.5 TypeScript & runtime
- [ ] `npx tsc --noEmit --skipLibCheck` returns 0 HAZOP-file errors
- [ ] No `any` type leaks on Phase 4 insert/select schema exports
- [ ] `parseJsonArray()` helper handles both jsonb-array and text-JSON-string column returns
- [ ] Server log shows `✅ HAZOP routes registered` with no Phase 4 registration errors
- [ ] Browser console shows no HAZOP-related JS errors on Phase 4 pages

### 7.6 UI/UX
- [ ] C&E matrix renders correctly with 0 rows (empty state with "Extract from HAZOP" CTA)
- [ ] C&E matrix renders correctly with >20 rows + >15 columns (horizontal scroll, sticky headers)
- [ ] Worksheet page "Phase 4" nav button correctly navigates to Phase 4 dashboard
- [ ] Source deviation number in SIF/Interlock/Alarm registers links back to the worksheet
- [ ] Stale `topology_changed_after_review` badge (from Phase 3 KI-2) still visible on nodes with Phase 4 linkage

---

## 8. Rollback Plan

### 8.1 Schema rollback (psql)

Run the following in sequence if Phase 4 must be fully reverted:

```sql
-- Step 1: Drop Phase 4 tables (in FK dependency order)
DROP TABLE IF EXISTS hazop_alarm_trips CASCADE;
DROP TABLE IF EXISTS hazop_interlocks CASCADE;
DROP TABLE IF EXISTS hazop_safety_functions CASCADE;
DROP TABLE IF EXISTS hazop_ce_cells CASCADE;
DROP TABLE IF EXISTS hazop_ce_columns CASCADE;
DROP TABLE IF EXISTS hazop_ce_rows CASCADE;
DROP TABLE IF EXISTS hazop_ce_matrices CASCADE;
```

No `ALTER TABLE` changes are made to existing tables (Phase 4 is purely additive via new tables), so rollback does not risk Phase 3 data.

### 8.2 Code rollback

1. Remove the Phase 4 route block from `server/hazop-routes.ts` (delimited by `// PHASE 4 START` and `// PHASE 4 END` comments).
2. Remove Phase 4 table definitions from `shared/schema.ts`.
3. Remove Phase 4 loader exports from `client/src/loaders/hazop.ts`.
4. Remove Phase 4 routes from `client/src/App.tsx`.
5. Remove Phase 4 nav button from `hazop-process-builder.tsx` and `hazop-worksheet.tsx`.

### 8.3 Checkpoint strategy

Before starting T4-001 (schema work), create a manual checkpoint named `"Pre-Phase4-schema"`. If ZTA fails and a full rollback is needed, restore from this checkpoint (Replit rollback function) to get back to the end-of-Phase-3 state without manual SQL execution.

### 8.4 Partial rollback (sub-module only)

If only one sub-module fails (e.g., C&E Matrix), it can be rolled back independently without affecting Safety Functions, Interlocks, or Alarms — since each sub-module has its own table set with no cross-dependencies except via FK (which cascade to NULL, not error).

---

## 9. Phase 4 Readiness Gate

Phase 4 implementation **must not begin** until all gate conditions below are confirmed:

### 9.1 Phase 3 completion gates (already confirmed)
- [x] Phase 3 closure approved 2026-05-25
- [x] `hazop_nodes` has `process_function`, `operating_regime`, `phase_state`, `topology_changed_after_review` columns
- [x] 111 library entries across 26 categories seeded (all TWFE categories populated)
- [x] Generation engine operational (`POST /api/hazop/nodes/:nodeId/generate`)
- [x] Worksheet and Actions pages deployed and navigable
- [x] KI-2 topology-change badge working in worksheet sidebar
- [x] Cause/Consequence/Safeguard/Action child CRUD operational

### 9.2 Phase 4 pre-implementation gates
- [ ] At least one HAZOP study has been through the full Phase 3 cycle (node created → steps added → deviations generated → safeguards populated → actions assigned) to provide live data for Phase 4 extraction testing
- [ ] `hazop_deviations`, `hazop_safeguards`, `hazop_causes` tables have at least 10 rows with `source = 'library'` to allow meaningful extract-from-HAZOP testing
- [ ] Product owner sign-off on C&E matrix column type vocabulary (`alarm`, `trip`, `shutdown`, `interlock`, `sis`, `process_action`) — no changes after schema creation
- [ ] Product owner sign-off on SIL level handling: Phase 4 records SIL as an integer (1–4) only; no probabilistic PFD calculation in Phase 4 scope (deferred to Phase 5)
- [ ] Confirm `hazop_safeguards` table has `safeguard_type` column populated — Phase 4 extract engine reads this for auto-classification of interlocks vs. alarms

### 9.3 Safeguard type vocabulary dependency

Phase 4's extract engine classifies safeguards into alarm/interlock/SIS types based on `hazop_safeguards.safeguard_type`. Before Phase 4 implementation, confirm the Phase 3 seed library populates `safeguard_type` values from the following controlled vocabulary:

| Value | Maps to Phase 4 |
|---|---|
| `alarm` | `hazop_alarm_trips` (alarm_type='alarm') |
| `trip` | `hazop_alarm_trips` (alarm_type='trip') |
| `shutdown` | `hazop_alarm_trips` (alarm_type='shutdown') |
| `interlock` | `hazop_interlocks` (interlock_type='process') |
| `SIS` | `hazop_interlocks` (interlock_type='SIS') + `hazop_safety_functions` |
| `relief_device` | `hazop_ce_columns` only (no auto-extract to interlock or alarm) |
| `procedure` | `hazop_ce_columns` only |
| `design` | `hazop_ce_columns` only |

**If `safeguard_type` is not yet populated in Phase 3 seed library data, this must be fixed before Phase 4 implementation starts — the extract engine depends on it.**

---

*End of Phase 4 Execution Plan v1.0*  
*Prepared: 2026-05-25 | Ready for implementation after readiness gate sign-off*
