# HAZOP Module — Phase 2 Execution Plan v1.0
# Process Definition & Node Builder

**Status:** PLAN — AWAITING APPROVAL
**Date:** 2026-05-24
**Parent Plan:** `docs/hazop-module-execution-plan-v2.0.md`
**Phase 1 Summary:** `docs/hazop-phase1-implementation-summary.md`
**Author:** THERMOPAC QMS Agent
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 1. Phase 2 Scope

Phase 2 delivers the process loop and step builder — the HAZOP study structure required before worksheet generation (Phase 3). All work is additive. No existing tables, routes, or UI are modified beyond what is stated here.

### 1.1 Explicit Phase 2 Limitations

The following are **explicitly prohibited** in Phase 2. Any appearance of these is a scope violation:

| Prohibited | Deferred To |
|---|---|
| HAZOP generation engine — no `POST .../generate` | Phase 3 |
| Deviation, cause, consequence, safeguard, action CRUD | Phase 3 |
| Safety function extraction | Phase 4 |
| Cause & Effect matrix | Phase 4 |
| Approval / rejection / release workflow | Phase 6 |
| Revision cloning (`POST .../revise`) | Phase 6 |
| GCS upload | Phase 6 |
| Excel exports | Phase 5 |
| FAT/SAT generation | Phase 5 |
| Concept → Project conversion | Phase 6 |

---

### 1.2 In Scope

| # | Deliverable |
|---|---|
| 1 | DB schema changes: 4 `ALTER TABLE` statements via `psql` |
| 2 | Process Loop CRUD routes (create/list/patch/delete) |
| 3 | Process Step CRUD routes (create/list/patch/delete) |
| 4 | Node auto-create on step POST; auto-delete via CASCADE on step DELETE |
| 5 | Study equipment pool resolver route (mode-aware) |
| 6 | Concept Equipment CRUD routes (concept mode only) |
| 7 | UI page: `/hazop/studies/:id/process-builder` |
| 8 | UI page: `/hazop/studies/:id/nodes` |
| 9 | Sidebar child link: "Process Builder" under HAZOP submenu |
| 10 | Study structure hierarchy display: Study → Loops → Steps → Nodes |
| 11 | Step validation rules enforced server-side |
| 12 | Loop/Step `updated_at` stamped on every mutation (basic change tracking) |

---

## 2. Database Schema Changes

All 4 changes via direct `psql $DATABASE_URL`. No drizzle-kit push.

### 2.1 `hazop_process_steps` — Add 2 FK columns

```sql
ALTER TABLE hazop_process_steps
  ADD COLUMN buy_list_line_id    INTEGER REFERENCES project_buy_list_lines(id) ON DELETE SET NULL,
  ADD COLUMN concept_equipment_id INTEGER REFERENCES hazop_concept_equipment(id) ON DELETE SET NULL;
```

**Rule:** `buy_list_line_id` and `concept_equipment_id` are mutually exclusive. Only one may be non-NULL per step. Both may be NULL for virtual steps (Drain, Vent, Next Loop, Product Outlet, Waste Outlet). Enforced server-side on INSERT and PATCH.

### 2.2 `hazop_process_loops` — Add P&ID and Line reference columns

```sql
ALTER TABLE hazop_process_loops
  ADD COLUMN p_and_id_ref VARCHAR(100),
  ADD COLUMN line_number  VARCHAR(100);
```

- `p_and_id_ref`: P&ID drawing reference (e.g. `P&ID-2627-018-001-A`). Optional.
- `line_number`: Pipeline/line designation (e.g. `6"-P-101-CS-INS`). Optional.

### 2.3 Confirmed Unchanged Tables

The following Phase 1 tables require no schema changes for Phase 2:

| Table | Status |
|---|---|
| `hazop_studies` | No change |
| `hazop_nodes` | No change — auto-created on step INSERT |
| `hazop_concept_equipment` | No change — CRUD routes added in Phase 2 |
| `hazop_concept_instruments` | No change — deferred to Phase 3 (used for safeguard tag matching) |
| `hazop_design_assumptions` | No change — deferred to Phase 3 |

---

## 3. API Routes

All routes added to `server/hazop-routes.ts`. No new route file.

### 3.1 Process Loop Routes

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/loops` | List loops for study, ordered by `sort_order` |
| `POST` | `/api/hazop/studies/:studyId/loops` | Create loop — see §3.1.1 |
| `PATCH` | `/api/hazop/loops/:loopId` | Update loop header fields — see §3.1.2 |
| `DELETE` | `/api/hazop/loops/:loopId` | Delete loop — see §3.1.3 |

#### 3.1.1 `POST /api/hazop/studies/:studyId/loops`

**Request body:**
```
loop_name           string  REQUIRED
design_intent       string  optional
fluid               string  optional
operating_pressure_min  number  optional (barg)
operating_pressure_max  number  optional (barg)
operating_temp_min      number  optional (°C)
operating_temp_max      number  optional (°C)
p_and_id_ref        string  optional
line_number         string  optional
sort_order          number  optional — defaults to MAX(sort_order)+1 for this study
```

**Server-side rules:**
1. Validate `studyId` exists in `hazop_studies`.
2. Reject if study `status` is not `draft`.
3. `loop_number` auto-assigned: `MAX(loop_number) + 1` for this `study_id`.
4. `sort_order` defaults to `MAX(sort_order) + 1` for this `study_id` if not provided.
5. `status` defaults to `draft`.
6. `project_id` copied from `study.project_id` (NULL for concept studies).

**Response:** Full row.

#### 3.1.2 `PATCH /api/hazop/loops/:loopId`

Allowed fields: `loop_name`, `design_intent`, `fluid`, `operating_pressure_min`, `operating_pressure_max`, `operating_temp_min`, `operating_temp_max`, `p_and_id_ref`, `line_number`, `sort_order`.

Prohibited (silently ignored): `id`, `study_id`, `project_id`, `loop_number`, `status`, `created_at`.

Reject if study `status` is not `draft`.

#### 3.1.3 `DELETE /api/hazop/loops/:loopId`

Rules:
1. Reject if study `status` is not `draft` — 409.
2. Cascade deletes steps → nodes automatically (FK CASCADE in schema).
3. Response: 204.

---

### 3.2 Process Step Routes

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/loops/:loopId/steps` | List steps ordered by `sequence_no`, with node data joined |
| `POST` | `/api/hazop/loops/:loopId/steps` | Create step + auto-create node — see §3.2.1 |
| `PATCH` | `/api/hazop/steps/:stepId` | Update step — see §3.2.2 |
| `DELETE` | `/api/hazop/steps/:stepId` | Delete step + node (CASCADE) — see §3.2.3 |

#### 3.2.1 `POST /api/hazop/loops/:loopId/steps`

**Request body:**
```
sequence_no           number   REQUIRED — must be unique within loop
equipment_category    string   REQUIRED — controlled vocabulary (§6 of parent plan)
equipment_tag         string   optional — warning but not blocked if absent
equipment_role        string   optional
connection_type       string   REQUIRED — controlled vocabulary (§6 of parent plan)
outlet_type           string   optional
outlet_destination    string   REQUIRED — controlled vocabulary (§6 of parent plan)
outlet_destination_ref string  optional — required when outlet_destination = 'specific_step', 'bypass', 'recycle'
operating_pressure    number   optional (barg)
operating_temperature number   optional (°C)
fluid                 string   optional
remarks               string   optional
buy_list_line_id      number   optional — project mode only
concept_equipment_id  number   optional — concept mode only
sort_order            number   optional — defaults to sequence_no
```

**Server-side rules:**
1. Resolve loop → study. Reject if study `status` ≠ `draft`.
2. Validate `equipment_category` against controlled vocabulary.
3. Validate `connection_type` against controlled vocabulary.
4. Validate `outlet_destination` against controlled vocabulary.
5. `(buy_list_line_id IS NOT NULL AND concept_equipment_id IS NOT NULL)` → 400.
6. If `buy_list_line_id` provided: verify it belongs to the study's `project_id` — 400 if mismatch.
7. If `concept_equipment_id` provided: verify it belongs to the study — 400 if mismatch.
8. If study is `project_based` and `concept_equipment_id` provided → 400.
9. If study is `concept_expected_project` and `buy_list_line_id` provided → 400.
10. `(loop_id, sequence_no)` UNIQUE — 409 if duplicate.
11. After step INSERT: auto-insert `hazop_nodes` — see §4.

**Response:** Full step row with auto-created node embedded.

#### 3.2.2 `PATCH /api/hazop/steps/:stepId`

Allowed fields: `equipment_category`, `equipment_tag`, `equipment_role`, `connection_type`, `outlet_type`, `outlet_destination`, `outlet_destination_ref`, `operating_pressure`, `operating_temperature`, `fluid`, `remarks`, `sort_order`, `buy_list_line_id`, `concept_equipment_id`.

Prohibited (silently ignored): `id`, `loop_id`, `project_id`, `sequence_no`, `created_at`.

Rules 2–9 from §3.2.1 apply identically. Reject if study `status` ≠ `draft`.

On PATCH: update `hazop_nodes.node_reference` to reflect new equipment_tag if changed.

#### 3.2.3 `DELETE /api/hazop/steps/:stepId`

Rules:
1. Reject if study `status` ≠ `draft` — 409.
2. `hazop_nodes` row deleted automatically via FK CASCADE.
3. Response: 204.

---

### 3.3 Node Routes

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/nodes` | List all nodes for study with step + loop data joined (read-only) |

Nodes are never created, patched, or deleted directly via API. They are managed exclusively as a side-effect of step CRUD. `deviation_count` and `action_count` are updated by the Phase 3 generation engine.

---

### 3.4 Equipment Pool Resolver

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/equipment-pool` | Return equipment options for step tag dropdowns |

**Resolution logic (mode-aware):**

```
IF study_mode = 'project_based':
  Query project_buy_list_lines WHERE buy_list_header_id IN
    (SELECT id FROM project_buy_list_headers WHERE project_id = study.project_id)
  Return: id, tag_no, service_description, buy_subgroup_id (used for category mapping)

IF study_mode = 'concept_expected_project':
  Query hazop_concept_equipment WHERE study_id = study.id
  Return: id, concept_tag, equipment_category, equipment_role
```

Optional query param: `?category=Pump` — filters returned pool by equipment category.

---

### 3.5 Concept Equipment CRUD

Routes apply to `concept_expected_project` studies only. Attempting these on a `project_based` study → 400.

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/concept-equipment` | List all concept equipment for study |
| `POST` | `/api/hazop/studies/:studyId/concept-equipment` | Create concept equipment — see §3.5.1 |
| `PATCH` | `/api/hazop/concept-equipment/:id` | Update — see §3.5.2 |
| `DELETE` | `/api/hazop/concept-equipment/:id` | Delete — see §3.5.3 |

#### 3.5.1 `POST /api/hazop/studies/:studyId/concept-equipment`

**Request body:**
```
equipment_category   string  REQUIRED — controlled vocabulary
concept_tag          string  REQUIRED — e.g. P-101, TK-01
equipment_role       string  optional
make                 string  optional
model                string  optional
kw_rating            number  optional
estimated_pressure_min  number  optional
estimated_pressure_max  number  optional
estimated_temp_min   number  optional
estimated_temp_max   number  optional
fluid                string  optional
has_vfd              boolean  optional — default false
hazardous_area       boolean  optional — default false
area_classification  string  optional
design_assumption    text     optional
notes                text     optional
```

Rules:
1. `(study_id, concept_tag)` UNIQUE — 409 if duplicate.
2. Study must be `concept_expected_project` — 400 otherwise.
3. Study `status` must be `draft` — 409 otherwise.

#### 3.5.2 `PATCH /api/hazop/concept-equipment/:id`

Allowed: all fields except `id`, `study_id`, `created_at`.

Reject if study `status` ≠ `draft`.

Reject `concept_tag` change if this equipment is linked to any `hazop_process_steps.concept_equipment_id` — 409 with message: "Tag in use by step — remove step link first."

#### 3.5.3 `DELETE /api/hazop/concept-equipment/:id`

Reject if any `hazop_process_steps.concept_equipment_id = id` — 409 with message: "Equipment linked to step — unlink step first."

Reject if study `status` ≠ `draft` — 409.

Response: 204.

---

## 4. Node Auto-Creation Logic

On every successful `POST /api/hazop/loops/:loopId/steps`:

```sql
INSERT INTO hazop_nodes (study_id, loop_id, step_id, node_reference, node_description)
VALUES (
  $study_id,
  $loop_id,
  $step_id,
  $node_reference,   -- see formula below
  $node_description  -- see formula below
)
```

**`node_reference` formula:**
```
IF equipment_tag IS NOT NULL AND equipment_tag != '':
  node_reference = '{loop_number}.{sequence_no} — {equipment_tag}'
ELSE:
  node_reference = '{loop_number}.{sequence_no} — {equipment_category}'
```

**`node_description` formula:**
```
IF equipment_role IS NOT NULL:
  node_description = equipment_role
ELSE IF remarks IS NOT NULL:
  node_description = remarks
ELSE:
  node_description = NULL
```

On `PATCH /api/hazop/steps/:stepId` where `equipment_tag` or `equipment_role` changes:
- Update `hazop_nodes.node_reference` and `node_description` using the same formulae.

Nodes are deleted automatically via `ON DELETE CASCADE` when a step is deleted.

---

## 5. Step Validation Rules

Enforced server-side. Warnings are returned in the API response as `warnings[]` array — they do not block the request. Hard blocks return 400/409.

| # | Rule | Type |
|---|---|---|
| V1 | `sequence_no = 1` step: `equipment_category` must be one of `Tank`, `Vessel`, `Separator`, `Utility System` OR `connection_type = 'Loop transition'` | Warning |
| V2 | Non-terminal steps (where `outlet_destination` ≠ `product_outlet`, `waste_outlet`, `drain`, `vent`) must have `outlet_destination` set | Warning |
| V3 | `equipment_tag` absent on a taggable step (i.e. `equipment_category` not in `Drain`, `Vent`, `Next Loop`) | Warning |
| V4 | `buy_list_line_id` AND `concept_equipment_id` both non-NULL | Hard block — 400 |
| V5 | `concept_equipment_id` on a `project_based` study | Hard block — 400 |
| V6 | `buy_list_line_id` on a `concept_expected_project` study | Hard block — 400 |
| V7 | `buy_list_line_id` does not belong to the study's project | Hard block — 400 |
| V8 | `concept_equipment_id` does not belong to the study | Hard block — 400 |
| V9 | `(loop_id, sequence_no)` duplicate | Hard block — 409 |
| V10 | Loop/step mutation when study `status` ≠ `draft` | Hard block — 409 |

Minimum steps for generation (≥2 steps per loop) is **not** enforced in Phase 2. It is a UI-level warning only, enforced as a hard block by the Phase 3 generation route.

---

## 6. UI Pages

### 6.1 `/hazop/studies/:id/process-builder`

**File:** `client/src/pages/hazop/hazop-process-builder.tsx`

**Layout:**
```
[Study header bar: study_number | title | status badge | project/concept label]

[Left panel — 260px fixed]
  Loop list:
    + Add Loop button
    For each loop (card, click to select):
      Loop #{loop_number} — {loop_name}
      {step_count} steps | {status badge}
      [Edit] [Delete]

[Right panel — flex-1]
  Selected loop header:
    Loop name, fluid, P&ID ref, line number, pressure range, temp range
    [Edit Loop] button

  Step table:
    Columns: Seq | Equipment Category | Tag | Role | Connection | Outlet To | Pressure | Temp | Fluid | Node Ref | Actions
    + Add Step button (opens inline form or dialog)
    Each row: [Edit] [Delete]
    Warnings shown as amber ⚠ icon on row if V1/V2/V3 triggered

  If no loop selected:
    Empty state: "Select a loop to view steps"
```

**Behavior:**
- Loop list auto-selects first loop on page load if loops exist.
- Add Step opens a dialog (not inline) with all step fields per §3.2.1.
- Equipment tag dropdown populated from `GET /api/hazop/studies/:studyId/equipment-pool?category={selected_category}`.
- In concept mode: if equipment pool for selected category is empty → show inline "Add concept equipment" button that opens concept equipment mini-form (creates equipment then re-fetches pool).
- Sequence number auto-incremented: `MAX(sequence_no) + 1` for the selected loop (computed client-side from existing steps, confirmed server-side).
- Warnings from API `warnings[]` shown as amber toast per step save.
- No generation button in Phase 2.

---

### 6.2 `/hazop/studies/:id/nodes`

**File:** `client/src/pages/hazop/hazop-nodes.tsx`

**Layout:**
```
[Study header bar]

[Node table — read-only]
  Columns: Node Ref | Loop | Step Seq | Equipment Category | Tag | Description | Deviations | Open Actions | Generated At
  Filter: by Loop (dropdown)
  If no nodes exist: empty state "No nodes yet. Build process loops and steps first."
  deviation_count and action_count shown as badges (0 = grey, >0 = blue)
```

**Behavior:**
- Read-only. No create/edit/delete in this view.
- Nodes appear immediately after steps are created (populated by step auto-create logic).
- `deviation_count` = 0 for all nodes until Phase 3 generation runs.

---

### 6.3 Sidebar Navigation

Add two child links under the HAZOP submenu in `client/src/components/layout.tsx`:

```
HAZOP
  ├── HAZOP Dashboard       /hazop/dashboard        (Phase 1 — exists)
  ├── Process Builder       /hazop/studies           (Phase 2 — new; routes to study selection then /process-builder)
  └── Node Register         /hazop/nodes             (Phase 2 — new; read-only)
```

**Implementation note:** "Process Builder" sidebar link routes to `/hazop/dashboard` with the Project Studies tab active — user selects a study → opens `/hazop/studies/:id/process-builder`. No separate study-selection page needed.

The `/hazop/studies/:id/process-builder` and `/hazop/studies/:id/nodes` pages are accessed via the study row action buttons on the dashboard — not from the sidebar directly.

Add "Open Process Builder →" and "View Nodes →" action buttons to study rows on the HAZOP Dashboard (both tabs).

---

## 7. Files to be Created

| File | Purpose |
|---|---|
| `client/src/pages/hazop/hazop-process-builder.tsx` | Process Loop Builder UI |
| `client/src/pages/hazop/hazop-nodes.tsx` | Node Register UI (read-only) |

---

## 8. Files to be Modified

| File | Change |
|---|---|
| `server/hazop-routes.ts` | Add 10 new routes (§3.1–§3.5) |
| `client/src/App.tsx` | Register `/hazop/studies/:id/process-builder` and `/hazop/studies/:id/nodes` routes |
| `client/src/pages/hazop/hazop-dashboard.tsx` | Add "Open Process Builder →" and "View Nodes →" action buttons on study rows |

---

## 9. Explicit Exclusions

The following will **not** be touched in Phase 2:

| Item | Reason |
|---|---|
| `hazop_deviation_library` | Phase 3 |
| `hazop_deviations`, `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, `hazop_actions` | Phase 3 |
| `hazop_concept_instruments` | Phase 3 (used for safeguard tag matching in generation) |
| `hazop_design_assumptions` | Phase 3 |
| `hazop_safety_functions`, `hazop_ce_matrix` and related | Phase 4 |
| `hazop_revisions` | Phase 6 |
| `hazop_fat_sat_items` | Phase 5 |
| Status transition routes (submit/approve/reject/release/close/convert/revise) | Phase 6 |
| Any route or UI for HAZOP worksheet view | Phase 3 |
| Action register view | Phase 3 |

---

## 10. Sequence Governance

### 10.1 Rules

| Rule | Specification |
|---|---|
| `sequence_no` immutability | `sequence_no` is set on step creation and never changed. It is a prohibited field on `PATCH /api/hazop/steps/:stepId` (silently ignored). |
| Sequence gaps | Gaps in `sequence_no` are allowed and expected. A loop may have steps numbered 1, 2, 5, 7 — this is valid. |
| No drag-drop reordering | Phase 2 UI has no drag-drop reordering capability. |
| No resequence API | No `POST .../resequence` or equivalent route exists in Phase 2 or any future phase. |
| Delete behaviour | Deleting a step does not renumber remaining steps. Remaining `sequence_no` values are unchanged. |
| New step numbering | `sequence_no` for a new step = `MAX(sequence_no) + 1` for the loop, computed server-side. Client suggestion accepted but server always computes the final value. |
| Node stability | `hazop_nodes` identity is tied to `step_id` (UNIQUE constraint). Because `step_id` and `sequence_no` are stable, node references, future deviation references, and action item references remain stable across the study lifecycle. |

### 10.2 Rationale (for audit record)

Phase 3 HAZOP worksheet generation creates `hazop_deviations`, `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, and `hazop_actions` all keyed to `hazop_nodes.id` which is keyed to `hazop_process_steps.id`. Any resequencing of steps would break the audit trail between nodes, deviations, and actions. Sequence stability is a non-negotiable precondition for downstream referential integrity.

---

## 11. Controlled Vocabulary (enforced server-side)

### Equipment Categories (exact stored values)
```
Tank | Pump | Heat Exchanger | Heater | Vessel | Column | Separator
Filter | Control Valve | Isolation Valve | Check Valve | Instrument
Utility System | Drain | Vent | Product Outlet | Waste Outlet | Next Loop
```

### Connection Types (exact stored values)
```
Pipe (flanged) | Pipe (screwed) | Pipe (welded) | Flexible hose
Instrumentation line | Electrical signal | Mechanical link | Virtual (logic only)
Loop transition
```

### Outlet Destinations (exact stored values)
```
next_step | prev_step | start_of_loop | specific_step | next_loop
recycle | bypass | drain | vent | product_outlet | waste_outlet
```

---

## 11. Zero-Trust Audit Checklist (Phase 2)

To be verified post-implementation before Phase 2 is declared COMPLETE:

| # | Check |
|---|---|
| ZTA-1 | `hazop_process_steps.buy_list_line_id` column exists |
| ZTA-2 | `hazop_process_steps.concept_equipment_id` column exists |
| ZTA-3 | `hazop_process_loops.p_and_id_ref` column exists |
| ZTA-4 | `hazop_process_loops.line_number` column exists |
| ZTA-5 | `POST .../loops` rejected when study `status` ≠ `draft` |
| ZTA-6 | `POST .../steps` with both FKs non-NULL → 400 |
| ZTA-7 | `POST .../steps` on project study with `concept_equipment_id` → 400 |
| ZTA-8 | `POST .../steps` on concept study with `buy_list_line_id` → 400 |
| ZTA-9 | Node auto-created on step POST |
| ZTA-10 | Node auto-deleted on step DELETE |
| ZTA-11 | `node_reference` formula correct for tagged and untagged steps |
| ZTA-12 | `GET .../equipment-pool` returns buy list lines for project mode |
| ZTA-13 | `GET .../equipment-pool` returns concept equipment for concept mode |
| ZTA-14 | Concept equipment DELETE blocked when linked to a step |
| ZTA-15 | No generation route (`POST .../generate`) present |
| ZTA-16 | `/hazop/studies/:id/process-builder` page loads without error |
| ZTA-17 | `/hazop/studies/:id/nodes` page loads without error |
| ZTA-18 | `PATCH /api/hazop/steps/:stepId` with `sequence_no` in body → field silently ignored, value unchanged in DB |
| ZTA-19 | `POST .../steps` → `sequence_no` always equals `MAX(sequence_no)+1` regardless of client-supplied value |
| ZTA-20 | Delete step → remaining steps retain original `sequence_no` values (no renumbering) |
| ZTA-21 | No `/resequence` route exists anywhere in `hazop-routes.ts` |

---

## 12. Phase 3 Readiness Gate

Phase 3 (HAZOP Auto-Generation Engine) may start only when all 17 ZTA checks above pass.

Phase 3 entry requires: at least one loop with ≥2 steps in a draft study, deviation library seeded (done in Phase 1), and `GET .../equipment-pool` returning results.
