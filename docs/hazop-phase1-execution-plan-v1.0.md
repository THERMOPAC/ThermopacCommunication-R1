# HAZOP Module — Phase 1 Execution Plan v1.0
# Foundation: Schema · Seed · Study CRUD · Dashboard · Navigation

**Status:** PLAN — AWAITING APPROVAL  
**Date:** 2026-05-24  
**Parent Plan:** `docs/hazop-module-execution-plan-v2.0.md`  
**Author:** THERMOPAC QMS Agent  
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 1. Phase 1 Scope

Phase 1 delivers the structural foundation only. No HAZOP generation logic is implemented in this phase.

### 1.1 In Scope
| # | Deliverable |
|---|---|
| 1 | All 20 HAZOP DB tables added to `shared/schema.ts` and pushed to PostgreSQL |
| 2 | `hazop_deviation_library` seed script — runs once after DB push |
| 3 | Study CRUD (both modes): create, list, get, update, delete (draft only) |
| 4 | Document sequence generation for HAZOP study numbers (both modes) |
| 5 | HAZOP Dashboard page — Project Studies tab + Concept Studies tab |
| 6 | Navigation entry in `client/src/components/layout.tsx` |
| 7 | `"HAZOP"` module permission registration — Superuser gets full access by default |
| 8 | Page permissions for `"hazop"` page key |
| 9 | `server/hazop-routes.ts` — Phase 1 routes only |

### 1.2 Out of Scope (deferred to Phase 2+)
- Process Loop Builder and process steps
- Concept Equipment / Concept Instruments / Design Assumptions CRUD
- HAZOP auto-generation engine
- Safety function extraction
- Cause & Effect matrix
- FAT/SAT
- Approval workflow and revision control
- GCS upload
- Excel exports
- Conversion (Concept → Project)

### 1.3 Files to be Created
| File | Purpose |
|---|---|
| `server/hazop-routes.ts` | Phase 1 API routes (study CRUD + study number generation) |
| `client/src/pages/hazop/hazop-dashboard.tsx` | HAZOP Dashboard page |
| `server/scripts/seed-hazop-library.ts` | One-time seed for `hazop_deviation_library` |

### 1.4 Files to be Modified
| File | Change |
|---|---|
| `shared/schema.ts` | Add all 20 HAZOP table definitions |
| `server/routes.ts` | Register `hazop-routes.ts` at end of `registerRoutes()` |
| `client/src/components/layout.tsx` | Add HAZOP navigation block + `isHazopMenuOpen` state |
| `client/src/App.tsx` | Register `/hazop/dashboard` route |

---

## 2. Exact Database Schema

All 20 tables are new. No existing tables are modified. All definitions are additive.

### 2.1 `hazop_studies`
```
id                    serial PRIMARY KEY
study_mode            varchar(30) NOT NULL  -- 'project_based' | 'concept_expected_project'
project_id            integer REFERENCES projects(id) ON DELETE RESTRICT  -- NULLABLE
study_number          varchar(50) NOT NULL UNIQUE
title                 varchar(200) NOT NULL
revision              varchar(10) NOT NULL DEFAULT 'A'
status                varchar(30) NOT NULL DEFAULT 'draft'
study_leader          integer REFERENCES users(id)
team_members          jsonb
study_date            date
process_description   text
design_basis          text
concept_title         varchar(200)
converted_to_study_id integer REFERENCES hazop_studies(id)
converted_at          timestamp
converted_by          integer REFERENCES users(id)
approved_by           integer REFERENCES users(id)
approved_at           timestamp
created_by            integer REFERENCES users(id)
created_at            timestamp NOT NULL DEFAULT NOW()
updated_at            timestamp NOT NULL DEFAULT NOW()
```
Server-side rule: `study_mode = 'project_based'` → `project_id` MUST NOT be null. Enforced on INSERT/UPDATE, not in DB constraint (to allow nullable column).

---

### 2.2 `hazop_concept_equipment`
```
id                      serial PRIMARY KEY
study_id                integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
equipment_category      varchar(50) NOT NULL
concept_tag             varchar(50) NOT NULL
equipment_role          varchar(100)
make                    varchar(100)
model                   varchar(100)
kw_rating               numeric
estimated_pressure_min  numeric
estimated_pressure_max  numeric
estimated_temp_min      numeric
estimated_temp_max      numeric
fluid                   varchar(100)
has_vfd                 boolean NOT NULL DEFAULT false
hazardous_area          boolean NOT NULL DEFAULT false
area_classification     varchar(30)
design_assumption       text
is_confirmed            boolean NOT NULL DEFAULT false
notes                   text
created_at              timestamp NOT NULL DEFAULT NOW()
updated_at              timestamp NOT NULL DEFAULT NOW()
UNIQUE (study_id, concept_tag)
```

---

### 2.3 `hazop_concept_instruments`
```
id                      serial PRIMARY KEY
study_id                integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
concept_tag             varchar(50) NOT NULL
instrument_class        varchar(30)
service_description     varchar(200)
signal_type             varchar(20)
estimated_range_min     numeric
estimated_range_max     numeric
units                   varchar(20)
linked_equipment_tag    varchar(50)
design_assumption       text
is_confirmed            boolean NOT NULL DEFAULT false
notes                   text
created_at              timestamp NOT NULL DEFAULT NOW()
UNIQUE (study_id, concept_tag)
```

---

### 2.4 `hazop_design_assumptions`
```
id                      serial PRIMARY KEY
study_id                integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
assumption_number       integer NOT NULL
assumption_category     varchar(50)
description             text NOT NULL
basis                   text
status                  varchar(20) NOT NULL DEFAULT 'open'
confirmed_at            timestamp
confirmed_by            integer REFERENCES users(id)
preserved_on_conversion boolean NOT NULL DEFAULT true
created_at              timestamp NOT NULL DEFAULT NOW()
```

---

### 2.5 `hazop_process_loops`
```
id                      serial PRIMARY KEY
study_id                integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
project_id              integer  -- NULLABLE; mirrors study project_id for query convenience
loop_number             integer NOT NULL
loop_name               varchar(200) NOT NULL
design_intent           text
fluid                   varchar(100)
operating_pressure_min  numeric
operating_pressure_max  numeric
operating_temp_min      numeric
operating_temp_max      numeric
status                  varchar(20) NOT NULL DEFAULT 'draft'
sort_order              integer NOT NULL
created_at              timestamp NOT NULL DEFAULT NOW()
updated_at              timestamp NOT NULL DEFAULT NOW()
```

---

### 2.6 `hazop_process_steps`
```
id                      serial PRIMARY KEY
loop_id                 integer NOT NULL REFERENCES hazop_process_loops(id) ON DELETE CASCADE
project_id              integer  -- NULLABLE
sequence_no             integer NOT NULL
equipment_category      varchar(50) NOT NULL
equipment_tag           varchar(50)
buy_list_line_id        integer REFERENCES project_buy_list_lines(id) ON DELETE SET NULL
concept_equipment_id    integer REFERENCES hazop_concept_equipment(id) ON DELETE SET NULL
equipment_role          varchar(100)
connection_type         varchar(50) NOT NULL
from_step               integer
to_step                 integer
outlet_type             varchar(50)
outlet_destination      varchar(50) NOT NULL
outlet_destination_ref  varchar(100)
operating_pressure      numeric
operating_temperature   numeric
fluid                   varchar(100)
remarks                 text
sort_order              integer NOT NULL
created_at              timestamp NOT NULL DEFAULT NOW()
updated_at              timestamp NOT NULL DEFAULT NOW()
UNIQUE (loop_id, sequence_no)
```

---

### 2.7 `hazop_nodes`
```
id                serial PRIMARY KEY
study_id          integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
loop_id           integer NOT NULL REFERENCES hazop_process_loops(id) ON DELETE CASCADE
step_id           integer NOT NULL REFERENCES hazop_process_steps(id) ON DELETE CASCADE
node_reference    varchar(100) NOT NULL
node_description  varchar(300)
deviation_count   integer NOT NULL DEFAULT 0
action_count      integer NOT NULL DEFAULT 0
generated_at      timestamp
generated_by      integer REFERENCES users(id)
```

---

### 2.8 `hazop_deviations`
```
id                    serial PRIMARY KEY
node_id               integer NOT NULL REFERENCES hazop_nodes(id) ON DELETE CASCADE
study_id              integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
deviation_number      varchar(50) NOT NULL
guideword             varchar(20) NOT NULL
parameter             varchar(20) NOT NULL
deviation_description varchar(200) NOT NULL
is_credible           boolean NOT NULL DEFAULT true
credibility_reason    text
reviewed              boolean NOT NULL DEFAULT false
reviewed_by           integer REFERENCES users(id)
reviewed_at           timestamp
created_at            timestamp NOT NULL DEFAULT NOW()
UNIQUE (node_id, guideword, parameter)
```

---

### 2.9 `hazop_causes`
```
id                  serial PRIMARY KEY
deviation_id        integer NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE
cause_number        integer NOT NULL
cause_description   text NOT NULL
source              varchar(10) NOT NULL DEFAULT 'library'
deleted             boolean NOT NULL DEFAULT false
```

---

### 2.10 `hazop_consequences`
```
id                          serial PRIMARY KEY
deviation_id                integer NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE
consequence_number          integer NOT NULL
consequence_description     text NOT NULL
severity                    varchar(20)
source                      varchar(10) NOT NULL DEFAULT 'library'
deleted                     boolean NOT NULL DEFAULT false
```

---

### 2.11 `hazop_safeguards`
```
id                      serial PRIMARY KEY
deviation_id            integer NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE
safeguard_number        integer NOT NULL
safeguard_description   text NOT NULL
safeguard_type          varchar(30)
tag_ref                 varchar(50)
source                  varchar(10) NOT NULL DEFAULT 'library'
deleted                 boolean NOT NULL DEFAULT false
```

---

### 2.12 `hazop_actions`
```
id                  serial PRIMARY KEY
deviation_id        integer NOT NULL REFERENCES hazop_deviations(id) ON DELETE CASCADE
action_number       integer NOT NULL
action_description  text NOT NULL
action_type         varchar(30)
assigned_to         integer REFERENCES users(id)
due_date            date
status              varchar(20) NOT NULL DEFAULT 'open'
close_comments      text
closed_at           timestamp
source              varchar(10) NOT NULL DEFAULT 'library'
```

---

### 2.13 `hazop_safety_functions`
```
id                    serial PRIMARY KEY
study_id              integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
project_id            integer  -- NULLABLE
sif_number            varchar(50) NOT NULL
sif_description       varchar(300) NOT NULL
initiating_cause      text NOT NULL
initiator_tag         varchar(50)
initiator_condition   varchar(100)
final_element_tag     varchar(50)
final_element_action  varchar(100)
sif_type              varchar(30)
safety_critical       boolean NOT NULL DEFAULT false
source_deviation_id   integer REFERENCES hazop_deviations(id) ON DELETE SET NULL
source_action_id      integer REFERENCES hazop_actions(id) ON DELETE SET NULL
sil_target            varchar(10)
status                varchar(20) NOT NULL DEFAULT 'draft'
created_at            timestamp NOT NULL DEFAULT NOW()
updated_at            timestamp NOT NULL DEFAULT NOW()
UNIQUE (study_id, sif_number)
```

---

### 2.14 `hazop_ce_matrix`
```
id            serial PRIMARY KEY
study_id      integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE UNIQUE
project_id    integer  -- NULLABLE
matrix_number varchar(50) NOT NULL
revision      varchar(10) NOT NULL DEFAULT 'A'
status        varchar(20) NOT NULL DEFAULT 'draft'
generated_at  timestamp
approved_by   integer REFERENCES users(id)
approved_at   timestamp
created_at    timestamp NOT NULL DEFAULT NOW()
```

---

### 2.15 `hazop_ce_causes`
```
id                serial PRIMARY KEY
matrix_id         integer NOT NULL REFERENCES hazop_ce_matrix(id) ON DELETE CASCADE
row_number        integer NOT NULL
cause_tag         varchar(50) NOT NULL
cause_description varchar(200) NOT NULL
cause_condition   varchar(100)
cause_type        varchar(20)
source_sif_id     integer REFERENCES hazop_safety_functions(id) ON DELETE SET NULL
```

---

### 2.16 `hazop_ce_effects`
```
id                  serial PRIMARY KEY
matrix_id           integer NOT NULL REFERENCES hazop_ce_matrix(id) ON DELETE CASCADE
col_number          integer NOT NULL
effect_tag          varchar(50) NOT NULL
effect_description  varchar(200) NOT NULL
effect_action       varchar(50)
source_sif_id       integer REFERENCES hazop_safety_functions(id) ON DELETE SET NULL
```

---

### 2.17 `hazop_ce_cells`
```
id              serial PRIMARY KEY
matrix_id       integer NOT NULL REFERENCES hazop_ce_matrix(id) ON DELETE CASCADE
cause_id        integer NOT NULL REFERENCES hazop_ce_causes(id) ON DELETE CASCADE
effect_id       integer NOT NULL REFERENCES hazop_ce_effects(id) ON DELETE CASCADE
action          varchar(10)
time_delay_sec  integer NOT NULL DEFAULT 0
notes           varchar(200)
UNIQUE (cause_id, effect_id)
```

---

### 2.18 `hazop_fat_sat_items`
```
id               serial PRIMARY KEY
study_id         integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
project_id       integer  -- NULLABLE
checklist_type   varchar(5) NOT NULL
item_number      integer NOT NULL
sif_id           integer REFERENCES hazop_safety_functions(id) ON DELETE SET NULL
cause_id         integer REFERENCES hazop_ce_causes(id) ON DELETE SET NULL
effect_id        integer REFERENCES hazop_ce_effects(id) ON DELETE SET NULL
test_description text NOT NULL
expected_result  varchar(300)
actual_result    varchar(300)
status           varchar(20) NOT NULL DEFAULT 'not_tested'
remarks          text
tested_by        integer REFERENCES users(id)
tested_at        timestamp
```

---

### 2.19 `hazop_revisions`
```
id                serial PRIMARY KEY
study_id          integer NOT NULL REFERENCES hazop_studies(id) ON DELETE CASCADE
document_type     varchar(30)
revision          varchar(10) NOT NULL
change_description text NOT NULL
changed_by        integer NOT NULL REFERENCES users(id)
changed_at        timestamp NOT NULL DEFAULT NOW()
```

---

### 2.20 `hazop_deviation_library`
```
id                      serial PRIMARY KEY
equipment_category      varchar(50) NOT NULL
guideword               varchar(20) NOT NULL
parameter               varchar(20) NOT NULL
applicable              boolean NOT NULL DEFAULT true
deviation_description   varchar(200) NOT NULL
typical_causes          jsonb NOT NULL DEFAULT '[]'
typical_consequences    jsonb NOT NULL DEFAULT '[]'
typical_safeguards      jsonb NOT NULL DEFAULT '[]'
typical_actions         jsonb NOT NULL DEFAULT '[]'
version                 integer NOT NULL DEFAULT 1
UNIQUE (equipment_category, guideword, parameter)
```

---

## 3. Migration Order

Tables must be created in FK dependency order. Run `drizzle-kit push:pg` once after all 20 tables are added to `shared/schema.ts`.

**FK dependency order:**
```
1.  hazop_studies             (references: projects, users — all existing)
2.  hazop_concept_equipment   (references: hazop_studies)
3.  hazop_concept_instruments (references: hazop_studies)
4.  hazop_design_assumptions  (references: hazop_studies, users)
5.  hazop_process_loops       (references: hazop_studies)
6.  hazop_process_steps       (references: hazop_process_loops,
                                           project_buy_list_lines,
                                           hazop_concept_equipment)
7.  hazop_nodes               (references: hazop_studies,
                                           hazop_process_loops,
                                           hazop_process_steps)
8.  hazop_deviations          (references: hazop_nodes, hazop_studies, users)
9.  hazop_causes              (references: hazop_deviations)
10. hazop_consequences        (references: hazop_deviations)
11. hazop_safeguards          (references: hazop_deviations)
12. hazop_actions             (references: hazop_deviations, users)
13. hazop_safety_functions    (references: hazop_studies,
                                           hazop_deviations,
                                           hazop_actions)
14. hazop_ce_matrix           (references: hazop_studies, users)
15. hazop_ce_causes           (references: hazop_ce_matrix, hazop_safety_functions)
16. hazop_ce_effects          (references: hazop_ce_matrix, hazop_safety_functions)
17. hazop_ce_cells            (references: hazop_ce_matrix,
                                           hazop_ce_causes,
                                           hazop_ce_effects)
18. hazop_fat_sat_items       (references: hazop_studies,
                                           hazop_safety_functions,
                                           hazop_ce_causes,
                                           hazop_ce_effects,
                                           users)
19. hazop_revisions           (references: hazop_studies, users)
20. hazop_deviation_library   (no FK references — standalone)
```

Drizzle `push:pg` handles this automatically when all references are declared correctly in `shared/schema.ts`.

---

## 4. Document Sequence Strategy

### 4.1 Existing `doc_sequences` Table Structure
```
id          serial PK
doc_type    text NOT NULL
fy_code     varchar(4)
project_id  integer REFERENCES projects(id) ON DELETE CASCADE
next_seq    integer NOT NULL DEFAULT 1
UNIQUE (doc_type, project_id) WHERE project_id IS NOT NULL
UNIQUE (doc_type, fy_code)    WHERE project_id IS NULL
```

### 4.2 HAZOP Study Number Generation

**Project-Based Mode:**
- Row: `doc_type = 'HAZOP'`, `project_id = {project_id}`, `fy_code = NULL`
- Sequence starts at 1 per project.
- Number format: `{project_code}-HAZOP-{seq:03d}` e.g. `2627-018-HAZOP-001`
- `project_code` resolved from `projects` table at generation time.

**Concept Mode:**
- Row: `doc_type = 'HAZOP-CONCEPT'`, `project_id = NULL`, `fy_code = {current_fy}`
- Separate `doc_type` (`'HAZOP-CONCEPT'`) to avoid collision with project-scoped sequences.
- Sequence restarts at 1 per financial year.
- Number format: `CONCEPT-HAZOP-{fy}-{seq:03d}` e.g. `CONCEPT-HAZOP-2627-001`
- `fy_code` = `{last_2_of_start_year}{last_2_of_end_year}` (e.g. `2627` for FY 2026-27).

### 4.3 Sequence Acquisition (server-side)
```sql
-- Within a transaction, with advisory lock on project_id (project mode)
-- or pg_advisory_xact_lock(hashtext('HAZOP-CONCEPT-' || fy_code)) (concept mode):

INSERT INTO doc_sequences (doc_type, project_id, fy_code, next_seq)
VALUES ($doc_type, $project_id_or_null, $fy_code_or_null, 2)
ON CONFLICT (...) DO UPDATE SET next_seq = doc_sequences.next_seq + 1
RETURNING next_seq - 1 AS allocated_seq;
```
The allocated sequence is used to build the study number before inserting `hazop_studies`.

---

## 5. Concurrency Protection Strategy

### 5.1 Study Creation
- Advisory lock key: `pg_advisory_xact_lock(hashtext('hazop-study-create-' || project_id::text))` for project mode.
- Advisory lock key: `pg_advisory_xact_lock(hashtext('hazop-study-create-concept-' || fy_code))` for concept mode.
- Lock held for duration of sequence acquisition + study insert.
- Prevents duplicate study numbers under concurrent creation.

### 5.2 No Advisory Lock Needed For
- Study read (`GET`)
- Study update (`PATCH`) — uses row-level lock via `SELECT ... FOR UPDATE` on `hazop_studies`
- Study delete (`DELETE`) — delete only permitted when `status = 'draft'`

### 5.3 Status Transitions
- All status changes use `UPDATE hazop_studies SET status = $new WHERE id = $id AND status = $expected_current` — if 0 rows updated, return 409 Conflict.
- This prevents double-transitions under race conditions.

---

## 6. Exact Phase 1 API Routes (`server/hazop-routes.ts`)

### 6.1 Route File Pattern
```typescript
export async function setupHazopRoutes(app: Express): Promise<void> {
  // all routes below
}
```
Registered in `server/routes.ts` at the end of `registerRoutes()`:
```typescript
const { setupHazopRoutes } = await import('./hazop-routes');
await setupHazopRoutes(app);
console.log('HAZOP routes registered');
```

### 6.2 Phase 1 Routes

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/hazop/projects/:projectId/studies` | `ensureAuthenticated` | List studies for a project |
| `GET` | `/api/hazop/concept-studies` | `ensureAuthenticated` | List all concept studies |
| `POST` | `/api/hazop/studies` | `ensureAuthenticated` | Create study (both modes) |
| `GET` | `/api/hazop/studies/:studyId` | `ensureAuthenticated` | Get study detail |
| `PATCH` | `/api/hazop/studies/:studyId` | `ensureAuthenticated` | Update study header fields |
| `DELETE` | `/api/hazop/studies/:studyId` | `ensureAuthenticated` | Delete study (draft only) |

### 6.3 Route Specifications

#### `POST /api/hazop/studies`
**Request body fields:**
```
study_mode           string  REQUIRED  'project_based' | 'concept_expected_project'
project_id           integer REQUIRED  if study_mode = 'project_based'; rejected if concept
title                string  REQUIRED
concept_title        string  REQUIRED  if study_mode = 'concept_expected_project'
process_description  string  optional
design_basis         string  optional
study_leader         integer optional  user_id
team_members         integer[] optional
study_date           date    optional
```
**Server validations:**
1. `study_mode` must be exactly `'project_based'` or `'concept_expected_project'` — reject 400 otherwise.
2. If `study_mode = 'project_based'`: `project_id` must be present and resolve to an existing project — reject 400 if missing, 404 if project not found.
3. If `study_mode = 'concept_expected_project'`: `project_id` must be absent or null — reject 400 if provided.
4. `title` must not be empty string after trim.
5. Acquire advisory lock → acquire sequence → insert `hazop_studies` → release lock.

**Response:** 201 with full study record.

---

#### `GET /api/hazop/projects/:projectId/studies`
**Checks:** `project_id` must resolve to an existing project — 404 if not.  
**Returns:** Array of studies for the project, ordered by `created_at DESC`.  
**Fields returned:** `id, study_number, title, study_mode, status, revision, study_date, created_by, created_at, updated_at`

---

#### `GET /api/hazop/concept-studies`
**Returns:** All concept studies ordered by `created_at DESC`.  
**No project filter** — concept studies are global.

---

#### `GET /api/hazop/studies/:studyId`
**Returns:** Full study record including `project_id`, `study_mode`, `status`, `team_members`.  
**404** if study not found.

---

#### `PATCH /api/hazop/studies/:studyId`
**Allowed fields to update:**
```
title, concept_title, process_description, design_basis,
study_leader, team_members, study_date
```
**Prohibited from update via PATCH:**
```
study_mode, project_id, study_number, status, revision,
converted_to_study_id, converted_at, converted_by,
approved_by, approved_at, created_by, created_at
```
Any prohibited field in request body → silently ignored (not rejected — defensive).  
**404** if study not found. **409** if study is `converted` (read-only).

---

#### `DELETE /api/hazop/studies/:studyId`
**Permitted only when:** `status = 'draft'`  
**Rejected with 409** if status is anything other than `draft`.  
**Cascade:** All child records deleted via `ON DELETE CASCADE` on all child tables.  
**Returns:** 204 No Content on success.

---

## 7. Exact UI Pages

### 7.1 HAZOP Dashboard — `/hazop/dashboard`
**File:** `client/src/pages/hazop/hazop-dashboard.tsx`

**Page structure:**
```
Page header: "HAZOP" | subtitle: "Process Safety & Risk Analysis"
[New Study] button (top right) — opens study creation dialog

Tabs:
  [Project Studies]  [Concept Studies]
```

**Project Studies tab:**
- Project selector dropdown (loads from `GET /api/projects` — existing endpoint)
- On project select: loads `GET /api/hazop/projects/:projectId/studies`
- Study list table:
  - Columns: Study Number | Title | Status | Revision | Study Date | Created By | Actions
  - Status badge: `draft` (grey) / `reviewed` (blue) / `approved` (green) / `released` (dark green) / `closed` (black)
  - Actions: View (→ study detail, Phase 2+) | Delete (draft only, with confirm dialog)
- Empty state: "No HAZOP studies for this project yet. Create one to get started."

**Concept Studies tab:**
- Loads `GET /api/hazop/concept-studies`
- Study list table:
  - Columns: Study Number | Concept Title | Status | Revision | Study Date | Created By | Actions
  - Status badge: `draft` (grey) / `proposal` (amber) / `converted` (blue)
  - Actions: View (Phase 2+) | Delete (draft only)
- Empty state: "No concept studies yet. Use concept mode to explore HAZOP before a project is created."

**Study creation dialog (modal):**
- First field: Mode selector
  - Radio/select: `Project-Based` | `Concept / Expected Project`
- Conditional fields:
  - Project-Based only: Project dropdown (`GET /api/projects`)
  - Concept only: Concept Title text input
- Common fields: Study Title, Process Description (optional), Study Leader (user picker), Study Date (optional)
- Submit → `POST /api/hazop/studies`
- On success: reload appropriate tab

### 7.2 Route Registration in `client/src/App.tsx`
```tsx
import HazopDashboard from "@/pages/hazop/hazop-dashboard";
// ...
<Route path="/hazop/dashboard" component={HazopDashboard} />
```

---

## 8. Navigation Change — `client/src/components/layout.tsx`

### 8.1 New State Variable
Add at line ~138 (after `isDrawingVerificationMenuOpen`):
```typescript
const [isHazopMenuOpen, setIsHazopMenuOpen] = useState(false);
```

### 8.2 New Navigation Block
Insert after line 487 (end of Project Management `}] : [])`), before line 488 (Drawing Verification block):

```typescript
...(hasViewPermission("HAZOP") ? [{
  icon: ShieldAlert,
  label: "HAZOP",
  isSubmenu: true,
  isOpen: isHazopMenuOpen,
  toggle: () => setIsHazopMenuOpen(!isHazopMenuOpen),
  children: [
    { icon: BarChart4, label: "HAZOP Dashboard", href: "/hazop/dashboard" },
  ]
}] : []),
```

**Phase 1 only exposes the Dashboard child.** Additional children (Loop Builder, Worksheet, etc.) are added in Phase 2+.

### 8.3 New Icon Import
`ShieldAlert` must be imported from `lucide-react`. Verify it exists in the current lucide-react version before use.  
If absent, substitute with `ShieldCheck` (already imported).

---

## 9. Permission Changes

### 9.1 New Module: `"HAZOP"`
Added to `module_permissions` table for Superuser at deploy time.

**Method:** The `setupHazopRoutes` function calls a one-time setup helper on first startup:
```
INSERT INTO module_permissions (user_id, module_name, can_view, can_create, can_edit, can_delete)
SELECT id, 'HAZOP', true, true, true, true
FROM users WHERE role = 'Superuser'
ON CONFLICT (user_id, module_name) DO NOTHING;
```
This runs inside `setupHazopRoutes` at startup — idempotent.

### 9.2 New Page Permission: `"hazop"` page key
```
INSERT INTO page_permissions (user_id, page_key, module_name, can_view)
SELECT id, 'hazop', 'HAZOP', true
FROM users WHERE role = 'Superuser'
ON CONFLICT (user_id, page_key) DO NOTHING;
```
Also runs inside `setupHazopRoutes` at startup — idempotent.

### 9.3 Module Name: `"HAZOP"` — must match exactly
- `layout.tsx` `hasViewPermission("HAZOP")` — must match `module_name` in DB.
- `hasPageAccess("hazop")` — must match `page_key` in DB.
- Both strings are case-sensitive throughout.

---

## 10. Seed Strategy — `hazop_deviation_library`

### 10.1 Seed Script Location
`server/scripts/seed-hazop-library.ts`

### 10.2 Trigger
Called manually after Phase 1 DB push:
```bash
npx tsx server/scripts/seed-hazop-library.ts
```
Also callable via a protected admin route added in Phase 1:
```
POST /api/hazop/admin/seed-library
Auth: Superuser role only
Action: Runs seed script logic; idempotent (ON CONFLICT DO NOTHING)
```

### 10.3 Seed Data Structure
Each seed record:
```typescript
{
  equipment_category: string,     // from controlled vocabulary §6.1
  guideword: string,              // from §2.1
  parameter: string,              // from §2.2
  applicable: boolean,
  deviation_description: string,
  typical_causes: string[],
  typical_consequences: string[],
  typical_safeguards: { description: string, type: string, tag_hint: string }[],
  typical_actions: { description: string, type: string }[],
  version: 1
}
```

### 10.4 Seed Insert Pattern
```sql
INSERT INTO hazop_deviation_library (
  equipment_category, guideword, parameter, applicable,
  deviation_description, typical_causes, typical_consequences,
  typical_safeguards, typical_actions, version
)
VALUES (...)
ON CONFLICT (equipment_category, guideword, parameter) DO NOTHING;
```
`DO NOTHING` ensures seed is fully idempotent — safe to re-run.

### 10.5 Minimum Seed Coverage Required for Phase 1 Validation
Phase 1 validation only requires the library table to be populated and queryable. Full 200+ entry coverage is validated in Phase 3 (when generation engine runs). Phase 1 seed must include at minimum:
- 5 entries for `Pump` (NO+FLOW, MORE+FLOW, LESS+FLOW, MORE+PRESSURE, REVERSE+FLOW)
- 5 entries for `Tank` (MORE+LEVEL, LESS+LEVEL, MORE+PRESSURE, MORE+TEMPERATURE, OTHER_THAN+COMPOSITION)
- 3 entries for `Vessel` (MORE+PRESSURE, LESS+LEVEL, MORE+TEMPERATURE)
Total minimum: 13 seed records for Phase 1 validation.

---

## 11. Rollback Plan

### 11.1 DB Rollback
If Phase 1 must be rolled back, run in order (children before parents):
```sql
DROP TABLE IF EXISTS hazop_fat_sat_items CASCADE;
DROP TABLE IF EXISTS hazop_revisions CASCADE;
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
DROP TABLE IF EXISTS hazop_deviation_library CASCADE;
DROP TABLE IF EXISTS hazop_studies CASCADE;
```
After drop: remove `hazop_*` entries from `doc_sequences` and `module_permissions` and `page_permissions`.

### 11.2 Code Rollback
1. Revert `shared/schema.ts` — remove all `hazop_*` table definitions.
2. Delete `server/hazop-routes.ts`.
3. Delete `server/scripts/seed-hazop-library.ts`.
4. Delete `client/src/pages/hazop/hazop-dashboard.tsx`.
5. Revert `server/routes.ts` — remove `setupHazopRoutes` import and call.
6. Revert `client/src/components/layout.tsx` — remove `isHazopMenuOpen` state + navigation block.
7. Revert `client/src/App.tsx` — remove `/hazop/dashboard` route.

### 11.3 Impact on Existing System
Zero. All 20 tables are additive. No existing routes, tables, or pages are modified.

---

## 12. Zero-Trust Audit Checklist

| # | Check | Rule | Where Enforced |
|---|---|---|---|
| 1 | All routes use `ensureAuthenticated` | No unauthenticated access to any `/api/hazop/` route | `server/hazop-routes.ts` — all routes |
| 2 | `study_mode` validated to exact enum | Reject 400 if not `'project_based'` or `'concept_expected_project'` | Route handler, before DB insert |
| 3 | `project_id` required for project mode | Reject 400 if `study_mode = 'project_based'` and `project_id` absent/null | Route handler |
| 4 | `project_id` rejected for concept mode | Reject 400 if `study_mode = 'concept_expected_project'` and `project_id` provided | Route handler |
| 5 | Project existence verified | Reject 404 if `project_id` does not exist in `projects` table | Route handler, before DB insert |
| 6 | No raw `req.body` passed to DB | All fields explicitly destructured and validated before use | Route handler |
| 7 | Prohibited PATCH fields ignored | `study_mode`, `project_id`, `study_number`, `status`, etc. never updated via PATCH | Route handler |
| 8 | Delete blocked on non-draft | Reject 409 if `status !== 'draft'` on DELETE | Route handler |
| 9 | Sequence acquisition under advisory lock | Prevents duplicate study numbers under concurrency | `setupHazopRoutes` sequence logic |
| 10 | Seed route restricted to Superuser | `POST /api/hazop/admin/seed-library` checks `req.user.role === 'Superuser'` | Route handler |
| 11 | Library seed is idempotent | `ON CONFLICT DO NOTHING` — safe to re-run | Seed script |
| 12 | Permission seed is idempotent | `ON CONFLICT DO NOTHING` — safe to re-run at startup | `setupHazopRoutes` startup hook |
| 13 | No HAZOP data returned for wrong project | `GET /api/hazop/projects/:projectId/studies` filters strictly by `project_id` | Query WHERE clause |
| 14 | `converted` studies are read-only | PATCH returns 409 if `status = 'converted'` | Route handler |
| 15 | `ShieldAlert` icon availability confirmed | Icon import verified before layout.tsx change | Pre-implementation check |

---

## 13. Validation Checklist

### 13.1 Pre-Implementation (must confirm before writing any code)
- [ ] `ShieldAlert` exists in installed `lucide-react` version — run `grep -r "ShieldAlert" node_modules/lucide-react/dist/` to confirm.
- [ ] `doc_sequences` UNIQUE constraint behaviour confirmed for `project_id = NULL` rows — test insert before implementation.
- [ ] `hasViewPermission("HAZOP")` will work with the exact string `"HAZOP"` — confirmed against `layout.tsx` line ~299 `hasViewPermission` function definition.
- [ ] `hasPageAccess("hazop")` confirmed — `use-page-permissions.tsx` hook confirmed as the mechanism.
- [ ] `GET /api/projects` exists and returns `id` + `code` fields for project selector — confirmed from existing routes.
- [ ] `module_permissions` column list confirmed: `user_id, module_name, can_view, can_create, can_edit, can_delete, can_upload, can_download` — confirmed from live DB schema.

### 13.2 Post-DB-Push
- [ ] All 20 tables exist: `SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'hazop_%';` — must return exactly 20 rows.
- [ ] All UNIQUE constraints exist: `SELECT indexname FROM pg_indexes WHERE tablename LIKE 'hazop_%' AND indexname LIKE '%unique%';`
- [ ] All FK constraints exist: `SELECT conname FROM pg_constraint WHERE conrelid IN (SELECT oid FROM pg_class WHERE relname LIKE 'hazop_%') AND contype = 'f';`
- [ ] `hazop_studies.project_id` is nullable: `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'hazop_studies' AND column_name = 'project_id';` — must return `YES`.

### 13.3 Post-Seed
- [ ] Minimum 13 seed records in `hazop_deviation_library`: `SELECT COUNT(*) FROM hazop_deviation_library;` — must be >= 13.
- [ ] All seeded records have non-empty `typical_causes` and `typical_consequences`: `SELECT COUNT(*) FROM hazop_deviation_library WHERE typical_causes = '[]' OR typical_consequences = '[]';` — must return 0.
- [ ] Seed is idempotent: run seed script twice, row count must not change.

### 13.4 Post-Route-Registration
- [ ] `POST /api/hazop/studies` with `study_mode = 'project_based'` and valid `project_id` → returns 201 with a study number in format `{code}-HAZOP-001`.
- [ ] `POST /api/hazop/studies` with `study_mode = 'concept_expected_project'` and no `project_id` → returns 201 with study number in format `CONCEPT-HAZOP-{fy}-001`.
- [ ] `POST /api/hazop/studies` with `study_mode = 'project_based'` and missing `project_id` → returns 400.
- [ ] `POST /api/hazop/studies` with `study_mode = 'concept_expected_project'` and `project_id` provided → returns 400.
- [ ] `DELETE /api/hazop/studies/:id` on `status = 'draft'` → returns 204.
- [ ] `DELETE /api/hazop/studies/:id` on `status = 'reviewed'` → returns 409.
- [ ] `PATCH /api/hazop/studies/:id` with `study_mode` in body → ignored; `study_mode` unchanged in DB.
- [ ] Unauthenticated `GET /api/hazop/concept-studies` → returns 401.

### 13.5 Post-UI-Deployment
- [ ] HAZOP item appears in sidebar navigation after login for Superuser.
- [ ] HAZOP item does NOT appear for users without `"HAZOP"` module permission.
- [ ] `/hazop/dashboard` loads without errors.
- [ ] Project Studies tab: selecting a project loads study list (empty for new project).
- [ ] Concept Studies tab: loads without errors (empty on fresh system).
- [ ] Study creation dialog opens on "New Study" click.
- [ ] Creating a project-based study → appears in Project Studies tab.
- [ ] Creating a concept study → appears in Concept Studies tab.
- [ ] Delete action on draft study → study removed from list.

---

## 14. Test Cases

### TC-01: Project-Based Study Creation — Happy Path
- Input: `study_mode = 'project_based'`, valid `project_id`, `title = 'Test Study'`
- Expected: 201, `study_number = '{code}-HAZOP-001'`, `status = 'draft'`

### TC-02: Concept Study Creation — Happy Path
- Input: `study_mode = 'concept_expected_project'`, no `project_id`, `title = 'Concept Test'`, `concept_title = 'Expected Petrochemical Project'`
- Expected: 201, `study_number = 'CONCEPT-HAZOP-{fy}-001'`, `status = 'draft'`

### TC-03: Missing project_id for Project Mode
- Input: `study_mode = 'project_based'`, no `project_id`
- Expected: 400

### TC-04: project_id Provided for Concept Mode
- Input: `study_mode = 'concept_expected_project'`, `project_id = 35`
- Expected: 400

### TC-05: Invalid study_mode
- Input: `study_mode = 'freeform'`
- Expected: 400

### TC-06: Non-Existent project_id
- Input: `study_mode = 'project_based'`, `project_id = 999999`
- Expected: 404

### TC-07: Sequence Uniqueness — Two simultaneous creates on same project
- Input: Two concurrent `POST /api/hazop/studies` for same `project_id`
- Expected: Both succeed; study numbers are `-001` and `-002` (no duplicates)

### TC-08: Update Prohibited Fields
- Input: `PATCH /api/hazop/studies/:id` with `{ study_mode: 'concept_expected_project', study_number: 'HACKED' }`
- Expected: 200, but `study_mode` and `study_number` unchanged in DB

### TC-09: Delete Draft Study
- Input: `DELETE /api/hazop/studies/:id` where `status = 'draft'`
- Expected: 204; study no longer in DB; child tables CASCADE-deleted

### TC-10: Delete Non-Draft Study
- Input: `DELETE /api/hazop/studies/:id` where `status = 'reviewed'`
- Expected: 409

### TC-11: Seed Idempotency
- Action: Run seed script twice
- Expected: `SELECT COUNT(*) FROM hazop_deviation_library` returns same value both times

### TC-12: Permission Gate
- Input: Unauthenticated `GET /api/hazop/concept-studies`
- Expected: 401

### TC-13: Module Permission Visibility
- Input: User without `"HAZOP"` module permission loads sidebar
- Expected: HAZOP navigation item absent

### TC-14: Second Study on Same Project
- Input: Create two project-based studies for same `project_id`
- Expected: Numbers are `-001` and `-002`

### TC-15: Concept Study Sequence Per FY
- Input: Create concept study in FY 2627
- Expected: `study_number = 'CONCEPT-HAZOP-2627-001'`

---

## 15. Known Pre-Implementation Gaps to Resolve

| Gap | Resolution Required Before Code |
|---|---|
| `ShieldAlert` icon availability in lucide-react | Verify via `grep` in node_modules before layout.tsx edit |
| `GET /api/projects` response shape | Confirm it returns `id`, `code`, `customer_name` for project selector |
| `hasViewPermission` Module type | Confirm `"HAZOP"` is accepted by the `Module` type in layout.tsx (line ~299); may need to extend the type |
| FY code format | Confirm current FY derivation logic matches `2627` format used throughout the system |
| `doc_sequences` concept mode — NULL `project_id` unique constraint | Verify the `fy_code` partial unique index works for concept sequence isolation |

---

*Plan ready for approval. No implementation started. All changes described are additive only.*
