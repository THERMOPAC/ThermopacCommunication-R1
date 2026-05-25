# HAZOP Module — Phase 2 Execution Plan v2.0
# Process Definition & Node Builder — Revised Architecture

**Status:** PLAN — AWAITING APPROVAL
**Date:** 2026-05-25 (clarifications added 2026-05-25)
**Supersedes:** `docs/hazop-phase2-execution-plan-v1.0.md`
**Parent Plan:** `docs/hazop-module-execution-plan-v2.0.md`
**Phase 1 Summary:** `docs/hazop-phase1-implementation-summary.md`
**Author:** THERMOPAC QMS Agent
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 0. Architectural Decision Record

**Decision date:** 2026-05-25
**Decided by:** THERMOPAC

Phase 2 v1.0 implemented a 1 Step = 1 Node (auto-created) architecture. This has been
superseded by an explicit architectural decision to adopt Option B — Node-based HAZOP.

**Rejected architecture (v1.0):**
```
Study → Loop → Step → Node (auto-created 1:1)
```

**Adopted architecture (v2.0):**
```
Study → Loop → Node → Step(s) → Deviation
```

**Definitions (binding for all phases):**

| Term | Definition |
|---|---|
| Loop | Major process section (e.g. Dehydration Loop, TWFE Distillation Loop). Defined at study level. |
| Node | Simultaneously a **process section boundary** (P&ID-defined) and an **operational analysis boundary** (HAZOP worksheet unit). User-defined within a Loop. See §14 for the full dual-role definition. |
| Step | Individual equipment or process element inside a Node (e.g. Pump, Filter, Heat Exchanger, Vessel). Steps carry `sequence_no` scoped locally within their Node — not globally within the Loop. |
| Deviation | HAZOP analysis record attached to a Node. Guide words applied at Node level. Deviation context includes all equipment categories present in the Node's Steps (aggregated — see §15). |

**Consequence:** All Phase 2 v1.0 implementation (routes, UI, schema) that implements
the 1:1 Step→Node pattern must be revised before Phase 3 begins. Phase 3 cannot
proceed on the v1.0 schema.

---

## 1. Phase 2 Scope

Phase 2 delivers the process definition builder — the Loop/Node/Step structure required
before HAZOP worksheet generation (Phase 3). All schema changes are additive or alter
only Phase 1 HAZOP tables that contain no production data.

### 1.1 Explicit Phase 2 Limitations

The following are **explicitly prohibited** in Phase 2:

| Prohibited | Deferred To |
|---|---|
| HAZOP generation engine | Phase 3 |
| Deviation, cause, consequence, safeguard, action CRUD | Phase 3 |
| Safety function extraction | Phase 4 |
| Cause & Effect matrix | Phase 4 |
| Approval / rejection / release workflow | Phase 6 |
| Revision cloning | Phase 6 |
| GCS upload | Phase 6 |
| Excel exports | Phase 5 |
| FAT/SAT generation | Phase 5 |
| Concept → Project conversion | Phase 6 |

### 1.2 In Scope

| # | Deliverable |
|---|---|
| 1 | DB schema revision: `hazop_nodes` restructured as independent object; `hazop_process_steps` gains `node_id` FK |
| 2 | Process Loop CRUD routes (create/list/patch/delete) |
| 3 | Process Node CRUD routes (create/list/patch/delete) — nodes are now user-defined, not auto-created |
| 4 | Process Step CRUD routes (create/list/patch/delete) — steps belong to nodes, not loops |
| 5 | Study equipment pool resolver route (mode-aware, unchanged from v1.0) |
| 6 | Concept Equipment CRUD routes (unchanged from v1.0) |
| 7 | UI page: `/hazop/studies/:id/process-builder` — revised three-level hierarchy |
| 8 | UI page: `/hazop/studies/:id/nodes` — revised read-only node register |
| 9 | Dashboard action buttons: "Process Builder" and "Nodes" (unchanged from v1.0) |
| 10 | All v1.0 step validation rules carried forward with `node_id` scope |
| 11 | `sequence_no` governance: immutable, scoped to `(node_id)` instead of `(loop_id)` |

---

## 2. Database Schema Changes

All changes via direct `psql $DATABASE_URL`. No drizzle-kit push.
Execute in the exact order stated. All are reversible during development only.

### 2.1 Revision of `hazop_nodes` — from auto-created wrapper to independent object

**Step A — Drop the old unique constraint and step_id column:**
```sql
ALTER TABLE hazop_nodes DROP CONSTRAINT IF EXISTS uq_hazop_node_step;
ALTER TABLE hazop_nodes DROP CONSTRAINT IF EXISTS hazop_nodes_step_id_key;
ALTER TABLE hazop_nodes DROP COLUMN IF EXISTS step_id;
```

**Step B — Add new required columns:**
```sql
ALTER TABLE hazop_nodes
  ADD COLUMN node_number    INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN node_name      VARCHAR(200)  NOT NULL DEFAULT '',
  ADD COLUMN design_intent  TEXT,
  ADD COLUMN p_and_id_ref   VARCHAR(100);
```

**Step C — Add uniqueness constraint on (loop_id, node_number):**
```sql
ALTER TABLE hazop_nodes
  ADD CONSTRAINT uq_hazop_node_loop_num UNIQUE (loop_id, node_number);
```

**Step D — Remove defaults (after backfill if any data exists):**
```sql
ALTER TABLE hazop_nodes ALTER COLUMN node_number DROP DEFAULT;
ALTER TABLE hazop_nodes ALTER COLUMN node_name   DROP DEFAULT;
```

**Resulting `hazop_nodes` columns:**

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| study_id | integer FK → hazop_studies | CASCADE delete |
| loop_id | integer FK → hazop_process_loops | CASCADE delete |
| node_number | integer NOT NULL | Auto-assigned: MAX+1 within loop. Immutable after creation. |
| node_name | varchar(200) NOT NULL | User-defined. e.g. "Feed Transfer Section" |
| node_reference | varchar(100) NOT NULL | Computed: `{loop_number}.{node_number}` e.g. "2.1" |
| node_description | varchar(300) | Optional. Summary of what this node covers. |
| design_intent | text | Optional. Intended operation of this node. |
| p_and_id_ref | varchar(100) | Optional. P&ID drawing reference for this node boundary. |
| deviation_count | integer NOT NULL default 0 | Updated by Phase 3 generation engine. |
| action_count | integer NOT NULL default 0 | Updated by Phase 3 generation engine. |
| generated_at | timestamp | Set by Phase 3 generation engine. |
| generated_by | integer FK → users | Set by Phase 3 generation engine. |

**`node_reference` formula:**
```
node_reference = '{loop.loop_number}.{node_number}'
```
Example: Loop 2, Node 1 → `node_reference = "2.1"`, `node_name = "Feed Preheating Section"`

The reference is computed server-side on node INSERT using the loop's `loop_number`.
It is recomputed if `node_number` ever changes (it does not — `node_number` is immutable).

---

### 2.2 Revision of `hazop_process_steps` — steps now belong to nodes

**Step A — Add `node_id` FK:**
```sql
ALTER TABLE hazop_process_steps
  ADD COLUMN node_id INTEGER NOT NULL REFERENCES hazop_nodes(id) ON DELETE CASCADE;
```

**Step B — Change unique constraint from (loop_id, sequence_no) to (node_id, sequence_no):**
```sql
ALTER TABLE hazop_process_steps DROP CONSTRAINT IF EXISTS uq_hazop_step_loop_seq;
ALTER TABLE hazop_process_steps DROP CONSTRAINT IF EXISTS hazop_process_steps_loop_id_sequence_no_key;
ALTER TABLE hazop_process_steps
  ADD CONSTRAINT uq_hazop_step_node_seq UNIQUE (node_id, sequence_no);
```

**Note:** `loop_id` is retained on `hazop_process_steps` as a denormalized convenience
for queries that join steps without traversing through nodes. It must always match the
`node.loop_id`. Enforced server-side on INSERT.

---

### 2.3 Pre-existing Phase 2 v1.0 columns — carry forward unchanged

These were applied in Phase 2 v1.0 and remain valid:

| Column | Table | Status |
|---|---|---|
| `buy_list_line_id` | `hazop_process_steps` | Carry forward |
| `concept_equipment_id` | `hazop_process_steps` | Carry forward |
| `p_and_id_ref` | `hazop_process_loops` | Carry forward |
| `line_number` | `hazop_process_loops` | Carry forward |

---

### 2.4 `hazop_deviations` — no change needed

`hazop_deviations.node_id → hazop_nodes.id` is already correct for the v2.0 architecture.
Deviations attach to Nodes. Node is now the correct HAZOP boundary. No schema change.

---

### 2.5 Data migration for existing test records

Any existing rows in `hazop_nodes` created under the v1.0 auto-create pattern
(with a `step_id` column) must be deleted before applying §2.1.

```sql
-- Run before §2.1:
TRUNCATE hazop_nodes CASCADE;
TRUNCATE hazop_process_steps CASCADE;
-- (leave hazop_process_loops and hazop_studies intact if any real study data exists)
```

If no real (non-test) data exists in loops/steps/nodes, all four tables may be truncated.

---

## 3. API Routes

All routes in `server/hazop-routes.ts`.

### 3.1 Process Loop Routes — unchanged from v1.0

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/loops` | List loops ordered by `sort_order` |
| `POST` | `/api/hazop/studies/:studyId/loops` | Create loop |
| `PATCH` | `/api/hazop/loops/:loopId` | Update loop header fields |
| `DELETE` | `/api/hazop/loops/:loopId` | Delete loop (cascades to nodes → steps) |

Loop body fields (unchanged from v1.0 §3.1.1):
`loop_name`, `design_intent`, `fluid`, `operating_pressure_min/max`,
`operating_temp_min/max`, `p_and_id_ref`, `line_number`, `sort_order`.

---

### 3.2 Process Node Routes — NEW (replaces auto-create logic)

Nodes are now user-defined. They must be created explicitly before steps can be added.

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/loops/:loopId/nodes` | List nodes for loop ordered by `node_number` |
| `POST` | `/api/hazop/loops/:loopId/nodes` | Create node — see §3.2.1 |
| `PATCH` | `/api/hazop/nodes/:nodeId` | Update node — see §3.2.2 |
| `DELETE` | `/api/hazop/nodes/:nodeId` | Delete node + its steps (CASCADE) — see §3.2.3 |

#### 3.2.1 `POST /api/hazop/loops/:loopId/nodes`

**Request body:**
```
node_name        string  REQUIRED  e.g. "Feed Transfer Section"
node_description string  optional
design_intent    string  optional
p_and_id_ref     string  optional
```

**Server-side rules:**
1. Resolve loop → study. Reject if study `status` ≠ `draft` — 409.
2. `node_number` auto-assigned server-side: `MAX(node_number) + 1` for this `loop_id`.
3. `node_reference` computed: `'{loop.loop_number}.{node_number}'`.
4. `deviation_count`, `action_count` default to 0.
5. `generated_at`, `generated_by` default to NULL.

**Response:** Full node row.

#### 3.2.2 `PATCH /api/hazop/nodes/:nodeId`

Allowed fields: `node_name`, `node_description`, `design_intent`, `p_and_id_ref`.

Prohibited (silently ignored): `id`, `study_id`, `loop_id`, `node_number`,
`node_reference`, `deviation_count`, `action_count`, `generated_at`, `generated_by`.

Reject if study `status` ≠ `draft` — 409.

#### 3.2.3 `DELETE /api/hazop/nodes/:nodeId`

Rules:
1. Reject if study `status` ≠ `draft` — 409.
2. `hazop_process_steps` rows deleted automatically via FK CASCADE.
3. `hazop_deviations` rows (Phase 3) deleted automatically via FK CASCADE.
4. Response: 204.

---

### 3.3 Process Step Routes — revised scope (steps now under nodes)

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/nodes/:nodeId/steps` | List steps for node ordered by `sequence_no` |
| `POST` | `/api/hazop/nodes/:nodeId/steps` | Create step — see §3.3.1 |
| `PATCH` | `/api/hazop/steps/:stepId` | Update step — see §3.3.2 |
| `DELETE` | `/api/hazop/steps/:stepId` | Delete step — see §3.3.3 |

**Removed routes (v1.0):**
- `GET /api/hazop/loops/:loopId/steps` — replaced by node-scoped route above
- `POST /api/hazop/loops/:loopId/steps` — replaced by node-scoped route above
- Node auto-creation logic on step POST — removed entirely

#### 3.3.1 `POST /api/hazop/nodes/:nodeId/steps`

**Request body:**
```
equipment_category     string   REQUIRED — controlled vocabulary (§8)
equipment_tag          string   optional — warning if absent for taggable categories
equipment_role         string   optional
connection_type        string   REQUIRED — controlled vocabulary (§8)
outlet_type            string   optional
outlet_destination     string   REQUIRED — controlled vocabulary (§8)
outlet_destination_ref string   optional — REQUIRED when outlet_destination ∈ {specific_step, bypass, recycle}
operating_pressure     number   optional (barg)
operating_temperature  number   optional (°C)
fluid                  string   optional
remarks                string   optional
buy_list_line_id       number   optional — project mode only
concept_equipment_id   number   optional — concept mode only
```

**Server-side rules:**
1. Resolve node → loop → study. Reject if study `status` ≠ `draft` — 409.
2. Validate `equipment_category`, `connection_type`, `outlet_destination` against controlled vocabulary — 400 if invalid.
3. `buy_list_line_id` and `concept_equipment_id` are mutually exclusive — 400 if both non-NULL.
4. `concept_equipment_id` on `project_based` study → 400.
5. `buy_list_line_id` on `concept_expected_project` study → 400.
6. FK ownership checks (same as v1.0).
7. `sequence_no` = `MAX(sequence_no) + 1` for this `node_id`, computed server-side.
8. `loop_id` on step set from `node.loop_id` (denormalized, server-assigned).
9. `project_id` on step set from `study.project_id`.
10. No node is auto-created. The node must already exist.
11. `outlet_destination_ref` REQUIRED (warning-level, not hard block) when `outlet_destination` ∈ `{specific_step, bypass, recycle}`.

**Response:** Full step row. No `node` embedded (node already exists independently).

#### 3.3.2 `PATCH /api/hazop/steps/:stepId`

Allowed fields: `equipment_category`, `equipment_tag`, `equipment_role`, `connection_type`,
`outlet_type`, `outlet_destination`, `outlet_destination_ref`, `operating_pressure`,
`operating_temperature`, `fluid`, `remarks`, `buy_list_line_id`, `concept_equipment_id`.

Prohibited (silently ignored): `id`, `node_id`, `loop_id`, `project_id`,
`sequence_no`, `created_at`.

Vocabulary and FK rules from §3.3.1 apply.

**No node update on step PATCH.** Node fields (`node_name`, `node_reference`,
`node_description`) are independent — they are not derived from step data in v2.0.

#### 3.3.3 `DELETE /api/hazop/steps/:stepId`

Rules:
1. Reject if study `status` ≠ `draft` — 409.
2. Node is NOT deleted. Steps can be removed without deleting the node.
3. Remaining steps retain their original `sequence_no` values.
4. Response: 204.

---

### 3.4 Study-level Node List — revised

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/nodes` | List all nodes across study with loop context and step count |

Response includes per node: `id`, `loop_id`, `loop_number`, `loop_name`,
`node_number`, `node_reference`, `node_name`, `node_description`, `design_intent`,
`p_and_id_ref`, `step_count`, `deviation_count`, `action_count`, `generated_at`.

Nodes are read-only from this endpoint. Full CRUD is on the loop-scoped routes (§3.2).

---

### 3.5 Equipment Pool Resolver — unchanged from v1.0

| Method | Route | Action |
|---|---|---|
| `GET` | `/api/hazop/studies/:studyId/equipment-pool` | Return equipment options for step tag dropdowns |

Behavior and mode-aware logic unchanged from v1.0 §3.4.
Optional `?category=` filter unchanged.

---

### 3.6 Concept Equipment CRUD — unchanged from v1.0

All five routes from v1.0 §3.5 carry forward without modification.

---

## 4. Hierarchy — Full Data Model

```
hazop_studies
 └── hazop_process_loops          (user-defined; loop_number, loop_name, fluid, P&ID ref)
      └── hazop_nodes              (user-defined; node_number, node_name — HAZOP boundary)
           ├── hazop_process_steps (equipment list inside node; sequence_no within node)
           └── hazop_deviations    (Phase 3; guide words applied at Node level)
                ├── hazop_causes
                ├── hazop_consequences
                ├── hazop_safeguards
                └── hazop_actions
```

**FK chain:** step → node → loop → study (CASCADE delete flows downward)

**Example — Your Re-Refining Process:**

```
Study: HAZOP — Used Oil Re-Refining (Concept)
 │
 ├── Loop 1: Feed Transfer Loop
 │    ├── Node 1.1: Feed Storage Node
 │    │    ├── Step 1: Tank — TK-101 (Used Oil Feed Tank)
 │    │    └── Step 2: Pump — P-101 (Feed Pump)
 │    └── Node 1.2: Feed Filtration Node
 │         └── Step 1: Filter — ST-101 (Strainer / Filter)
 │
 ├── Loop 2: Dehydration Loop
 │    ├── Node 2.1: Feed Preheating Node
 │    │    └── Step 1: Heat Exchanger — HX-201 (Feed Preheater)
 │    ├── Node 2.2: Dehydration Vessel Node
 │    │    ├── Step 1: Vessel — V-201 (Dehydration Vessel)
 │    │    └── Step 2: Vent — (Water Vapor / Light Gas Removal)
 │    └── Node 2.3: Degasoil Flash Node
 │         ├── Step 1: Vessel — V-202 (Degasoil / Light Ends Flash Vessel)
 │         └── Step 2: Vent — (Light Fuel / Gas Oil Vapor Outlet)
 │
 ├── Loop 5: TWFE Vacuum Distillation Loop
 │    ├── Node 5.1: TWFE Feed Heating Node
 │    │    └── Step 1: Heat Exchanger — HX-501 (TWFE Feed Preheater)
 │    ├── Node 5.2: Thin Wiped Film Evaporator Node
 │    │    ├── Step 1: Vessel — TWFE-501 (Thin Wiped Film Evaporator)
 │    │    └── Step 2: Vent — (Base Oil Vapor Outlet)
 │    └── Node 5.3: Condensation & Receiver Node
 │         ├── Step 1: Heat Exchanger — CD-501 (Condenser)
 │         └── Step 2: Vessel — V-502 (Distillate Base Oil Receiver)
 │
 └── Loop 8: Residue Discharge Loop
      ├── Node 8.1: Residue Cooler Node
      │    └── Step 1: Heat Exchanger — CD-801 (Residue Cooler)
      └── Node 8.2: Residue Storage Node
           └── Step 1: Tank — TK-801 (Residue Storage Tank)
```

**HAZOP deviation example (Phase 3):**

```
Node 2.2: Dehydration Vessel Node
 ├── Deviation: No Flow
 │    ├── Cause: Pump P-201 fails to start
 │    ├── Consequence: Loss of feed — process shutdown
 │    ├── Safeguard: LAL-201 low level alarm on V-201
 │    └── Action: Verify LAHH-201 high-high level shutdown loop (by: Lead Process Eng)
 └── Deviation: High Temperature
      ├── Cause: HX-201 control valve CV-201 stuck open
      ├── Consequence: Thermal degradation of feed oil
      ├── Safeguard: TAHH-201 high-high temp trip
      └── Action: Include TAHH in SIL assessment (by: Instrumentation Eng)
```

---

## 5. Step Validation Rules

Changes from v1.0:
- `sequence_no` uniqueness scope: `(loop_id)` → `(node_id)`.
- V11 upgraded from Warning to Hard block (ref format now precisely defined — see §6.4).
- V12 added: `outlet_destination_ref` format check.

| # | Rule | Type |
|---|---|---|
| V1 | Step seq 1 within a node: `equipment_category` should be `Tank`, `Vessel`, `Separator`, `Utility System`, or `connection_type = 'Loop transition'` | Warning |
| V2 | Non-terminal `outlet_destination` (not `product_outlet`, `waste_outlet`, `drain`, `vent`) should be set | Warning |
| V3 | `equipment_tag` absent on a taggable category (not `Drain`, `Vent`, `Next Loop`, `Product Outlet`, `Waste Outlet`) | Warning |
| V4 | `buy_list_line_id` and `concept_equipment_id` both non-NULL | Hard block — 400 |
| V5 | `concept_equipment_id` on `project_based` study | Hard block — 400 |
| V6 | `buy_list_line_id` on `concept_expected_project` study | Hard block — 400 |
| V7 | `buy_list_line_id` not belonging to study's project | Hard block — 400 |
| V8 | `concept_equipment_id` not belonging to study | Hard block — 400 |
| V9 | `(node_id, sequence_no)` duplicate | Hard block — 409 |
| V10 | Loop/node/step mutation when study `status` ≠ `draft` | Hard block — 409 |
| V11 | `outlet_destination_ref` absent when `outlet_destination` ∈ `{specific_step, bypass, recycle}` | Hard block — 400 |
| V12 | `outlet_destination_ref` present but does not match `^\d+\.\d+\.\d+$` | Hard block — 400 |

---

## 6. Sequence Governance

### 6.1 Node Sequence (`node_number`)

| Rule | Specification |
|---|---|
| `node_number` immutability | Set on node creation; never changed. Prohibited on PATCH. |
| `node_number` assignment | `MAX(node_number) + 1` for this `loop_id`, server-side only. |
| No resequence API | Never exists for nodes. |
| Gap tolerance | Gaps in `node_number` are allowed after deletions. |

---

### 6.2 Step Sequence (`sequence_no`) — scoped locally within Node

**`sequence_no` is local to `node_id`. It is NOT global within the Loop.**

Each Node maintains its own independent step numbering starting at 1.
Two steps in different nodes may share the same `sequence_no` and this is
correct behaviour — they are in different scopes.

**Explicit example:**

```
Loop 2: Dehydration Loop
 │
 ├── Node 2.1: Feed Preheating Node
 │    ├── Step sequence_no=1   (Heat Exchanger — HX-201)
 │    └── Step sequence_no=2   (Control Valve — CV-201)
 │
 └── Node 2.2: Dehydration Vessel Node
      ├── Step sequence_no=1   (Vessel — V-201)   ← same sequence_no as Node 2.1 Step 1: correct
      └── Step sequence_no=2   (Vent — overhead)  ← same sequence_no as Node 2.1 Step 2: correct
```

The UNIQUE constraint is `(node_id, sequence_no)` — not `(loop_id, sequence_no)`.

**Step addressing:** A step is globally addressed as
`{loop_number}.{node_number}.{sequence_no}` — e.g. `2.2.1` for
Loop 2, Node 2.2, Step 1. This three-part address is the canonical
cross-node reference format (see §6.4).

| Rule | Specification |
|---|---|
| `sequence_no` immutability | Set on step creation; never changed. Prohibited on PATCH. |
| `sequence_no` scope | Unique within `(node_id)` only. Same value may exist in a different node within the same loop. |
| `sequence_no` assignment | `MAX(sequence_no) + 1` for this `node_id`, server-side only. |
| No resequence API | Never exists. |
| Delete behaviour | Deleting a step does not renumber remaining steps. |

---

### 6.3 Referential Stability Rationale

Phase 3 creates `hazop_deviations` keyed to `hazop_nodes.id`.
Any renumbering of nodes or steps would break the audit trail between
nodes, deviations, causes, safeguards, and actions.
`node_number` and `sequence_no` stability is a non-negotiable precondition
for downstream referential integrity.

---

### 6.4 Outlet Destination Reference Format

When a step's process flow exits to a specific destination that cannot be
resolved automatically, `outlet_destination_ref` carries a deterministic
address string using the format:

```
{loop_number}.{node_number}.{sequence_no}
```

**Examples:**

| Ref value | Meaning |
|---|---|
| `2.1.2` | Loop 2, Node 2.1, Step sequence 2 |
| `5.3.1` | Loop 5, Node 5.3, Step sequence 1 |
| `1.2.1` | Loop 1, Node 1.2, Step sequence 1 |

**Which outlet_destination values require a ref:**

| outlet_destination | ref required? | ref format | Resolution |
|---|---|---|---|
| `next_step` | No | — | Auto: next `sequence_no` within same node |
| `prev_step` | No | — | Auto: previous `sequence_no` within same node |
| `next_node` | No | — | Auto: first step of `node_number+1` in same loop |
| `next_loop` | No | — | Auto: first node/step of `loop_number+1` |
| `start_of_loop` | No | — | Auto: first step of first node of same loop |
| `specific_step` | **Yes** | `{L}.{N}.{S}` | Cross-node or cross-loop target step |
| `recycle` | **Yes** | `{L}.{N}.{S}` | Return target step |
| `bypass` | **Yes** | `{L}.{N}.{S}` | Bypass target step |
| `drain` | No | — | Terminal — no downstream |
| `vent` | No | — | Terminal — no downstream |
| `product_outlet` | No | — | Terminal — no downstream |
| `waste_outlet` | No | — | Terminal — no downstream |

**Server-side enforcement:**
- `outlet_destination_ref` REQUIRED (hard block — 400) when
  `outlet_destination` ∈ `{specific_step, recycle, bypass}`.
- `outlet_destination_ref` must match the format `^\d+\.\d+\.\d+$`
  (integer dot integer dot integer). Server validates format on INSERT and PATCH.
- Referential integrity (i.e., that the target step actually exists) is
  **not** validated at write time — it is validated at Phase 3 generation time.
- `outlet_destination_ref` is silently ignored when `outlet_destination`
  does not require it.

---

## 7. UI — Process Builder (`/hazop/studies/:id/process-builder`)

**File:** `client/src/pages/hazop/hazop-process-builder.tsx` (full rewrite from v1.0)

### 7.1 Three-Level Layout

```
[Study header: study_number | title | status badge | mode badge]

[Left panel — 280px fixed]
  Loop list (outer accordion or flat list):
    Loop #1 — Feed Transfer Loop  [+ Add Node]
      ▸ Node 1.1 — Feed Storage Node       [Edit] [Delete]
      ▸ Node 1.2 — Feed Filtration Node    [Edit] [Delete]
    Loop #2 — Dehydration Loop    [+ Add Node]
      ▸ Node 2.1 — Feed Preheating Node    [Edit] [Delete]
      ▸ Node 2.2 — Dehydration Vessel Node [Edit] [Delete]
    [+ Add Loop] button at bottom

[Right panel — flex-1]
  IF no node selected:
    "Select a node to view its steps."

  IF node selected:
    Node header:
      {node_reference} — {node_name}
      Description: {node_description}
      Design Intent: {design_intent}
      P&ID Ref: {p_and_id_ref}
      [Edit Node] button

    Step table:
      Columns: Seq | Category | Tag | Role | Connection | Outlet To | Ref | Pressure | Temp | Fluid | Actions
      [+ Add Step] button
      Each row: [Edit] [Delete]
      Amber ⚠ badge per row if warnings present (V1/V2/V3/V11)

    If no steps in node:
      "No steps yet. Add the first process step for this node."
```

### 7.2 Dialogs

**Add / Edit Loop dialog:**
Fields: `loop_name` (required), `design_intent`, `fluid`, `p_and_id_ref`,
`line_number`, `operating_pressure_min/max`, `operating_temp_min/max`.

**Add / Edit Node dialog:**
Fields: `node_name` (required), `node_description`, `design_intent`, `p_and_id_ref`.

**Add / Edit Step dialog:**
Fields (in order):
1. Equipment Category (controlled dropdown) — required
2. Connection Type (controlled dropdown) — required
3. Equipment Tag (Concept Equipment pool dropdown or BUY list dropdown — mode-aware) — optional
4. Equipment Tag free text (shown alongside pool dropdown, filled from pool selection or manual) — optional
5. Equipment Role (free text) — optional
6. Outlet Destination (controlled dropdown) — required
7. Outlet Ref / Target Step (text input) — **shown only when** Outlet Destination ∈ `{specific_step, bypass, recycle}`
8. Fluid (free text) — optional
9. Pressure (numeric, barg) — optional
10. Temperature (numeric, °C) — optional
11. Remarks (textarea) — optional

### 7.3 Interaction Rules

- Left panel: clicking a Loop expands/collapses its node list.
- Clicking a Node selects it and loads its steps in the right panel.
- "Add Node" button is scoped to its loop.
- "Add Loop" button creates a new loop (bottom of left panel).
- Delete Loop → AlertDialog confirmation → cascades nodes and steps.
- Delete Node → AlertDialog confirmation → cascades steps.
- Delete Step → AlertDialog confirmation → node is NOT deleted.
- No generation button in Phase 2.

---

## 8. UI — Node Register (`/hazop/studies/:id/nodes`)

**File:** `client/src/pages/hazop/hazop-nodes.tsx` (revised from v1.0)

**Layout:**
```
[Study header]

[Filter bar: Loop dropdown — "All Loops" or select one]

[Summary: X nodes | Y with deviations | Z with open actions]

[Node table — read-only]
  Columns: Node Ref | Node Name | Loop | Steps | Design Intent | P&ID Ref |
           Deviations | Open Actions | Generated At
  Row click: navigates to process-builder with that node selected (optional, Phase 3+)
  Empty state: "No nodes yet. Use Process Builder to create loops and nodes."
```

Deviation and action counts shown as badges (grey = 0, blue = >0).

---

## 9. Controlled Vocabulary

All enforced server-side. Free text rejected for controlled fields.

Changes from v1.0: `next_node` added to Outlet Destinations (now 12 values).

### Equipment Categories (18 exact values — unchanged)
```
Tank | Pump | Heat Exchanger | Heater | Vessel | Column | Separator
Filter | Control Valve | Isolation Valve | Check Valve | Instrument
Utility System | Drain | Vent | Product Outlet | Waste Outlet | Next Loop
```

### Connection Types (9 exact values — unchanged)
```
Pipe (flanged) | Pipe (screwed) | Pipe (welded) | Flexible hose
Instrumentation line | Electrical signal | Mechanical link | Virtual (logic only)
Loop transition
```

### Outlet Destinations (12 exact machine values — `next_node` added)

```
next_step | prev_step | start_of_loop | next_node | next_loop
specific_step | recycle | bypass
drain | vent | product_outlet | waste_outlet
```

**`next_node`** — NEW in v2.0. Routes the step's outlet to the first step of the
next node (`node_number + 1`) within the same loop. No `outlet_destination_ref`
needed. If no next node exists, the server issues warning V2 at step save time.

**Outlet Destination reference requirement summary (from §6.4):**

| Value | Requires `outlet_destination_ref` | Auto-resolved target |
|---|---|---|
| `next_step` | No | sequence_no+1 within same node |
| `prev_step` | No | sequence_no-1 within same node |
| `start_of_loop` | No | first step of first node in loop |
| `next_node` | No | first step of node_number+1 in same loop |
| `next_loop` | No | first node/step of loop_number+1 |
| `specific_step` | **Yes** — format `{L}.{N}.{S}` | explicit cross-node target |
| `recycle` | **Yes** — format `{L}.{N}.{S}` | return target step |
| `bypass` | **Yes** — format `{L}.{N}.{S}` | bypass target step |
| `drain` | No | Terminal |
| `vent` | No | Terminal |
| `product_outlet` | No | Terminal |
| `waste_outlet` | No | Terminal |

---

## 10. Files to be Created / Modified

### New files
None. Both UI page files already exist from v1.0 and will be rewritten in-place.

### Modified files

| File | Change |
|---|---|
| `server/hazop-routes.ts` | Remove v1.0 step routes; add node CRUD routes; revise step routes to node scope; remove auto-create node logic |
| `client/src/pages/hazop/hazop-process-builder.tsx` | Full rewrite: three-level hierarchy (Loop → Node → Steps) |
| `client/src/pages/hazop/hazop-nodes.tsx` | Revise: `step_count` column; remove Step Seq column; show `node_name` |
| `shared/schema.ts` | Revise `hazopNodes` table definition; revise `hazopProcessSteps` table definition |

### Unchanged files
`client/src/App.tsx`, `client/src/pages/hazop/hazop-dashboard.tsx`,
`client/src/loaders/hazop.ts` — no changes needed.

---

## 11. Explicit Exclusions

Unchanged from v1.0 §9.

| Item | Reason |
|---|---|
| `hazop_deviation_library` | Phase 3 |
| `hazop_deviations`, `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, `hazop_actions` | Phase 3 |
| `hazop_concept_instruments` | Phase 3 |
| `hazop_design_assumptions` | Phase 3 |
| `hazop_safety_functions`, `hazop_ce_matrix` | Phase 4 |
| `hazop_revisions` | Phase 6 |
| Status transition routes | Phase 6 |
| HAZOP worksheet view | Phase 3 |
| Generation button in UI | Phase 3 |

---

## 12. Zero-Trust Audit Checklist (Phase 2 v2.0)

All 27 checks must pass before Phase 3 begins.

| # | Check |
|---|---|
| ZTA-1 | `hazop_nodes.step_id` column does NOT exist |
| ZTA-2 | `hazop_nodes.node_number` column exists, NOT NULL |
| ZTA-3 | `hazop_nodes.node_name` column exists, NOT NULL |
| ZTA-4 | `hazop_nodes.design_intent` column exists |
| ZTA-5 | `hazop_nodes.p_and_id_ref` column exists |
| ZTA-6 | `hazop_process_steps.node_id` column exists, NOT NULL, FK → hazop_nodes |
| ZTA-7 | UNIQUE constraint `uq_hazop_node_loop_num` exists on `(loop_id, node_number)` |
| ZTA-8 | UNIQUE constraint `uq_hazop_step_node_seq` exists on `(node_id, sequence_no)` |
| ZTA-9 | `POST /api/hazop/loops/:loopId/nodes` creates node with auto-assigned `node_number` |
| ZTA-10 | `node_reference` = `'{loop_number}.{node_number}'` on node creation |
| ZTA-11 | `DELETE /api/hazop/nodes/:nodeId` cascades to steps |
| ZTA-12 | `DELETE /api/hazop/nodes/:nodeId` does NOT delete the loop |
| ZTA-13 | `DELETE /api/hazop/steps/:stepId` does NOT delete the node |
| ZTA-14 | `POST /api/hazop/nodes/:nodeId/steps` creates step with `node_id` set |
| ZTA-15 | `sequence_no` on step = `MAX(sequence_no)+1` within `node_id` scope — NOT loop scope |
| ZTA-16 | Two steps in different nodes of the same loop CAN share the same `sequence_no` — no constraint violation |
| ZTA-17 | `PATCH /api/hazop/steps/:stepId` with `sequence_no` → silently ignored |
| ZTA-18 | `PATCH /api/hazop/steps/:stepId` with `node_id` → silently ignored |
| ZTA-19 | `POST /api/hazop/loops/:loopId/steps` route does NOT exist (removed) |
| ZTA-20 | `GET /api/hazop/loops/:loopId/steps` route does NOT exist (removed) |
| ZTA-21 | `outlet_destination = 'next_node'` accepted without error |
| ZTA-22 | `outlet_destination = 'specific_step'` without `outlet_destination_ref` → 400 |
| ZTA-23 | `outlet_destination = 'specific_step'` with `outlet_destination_ref = 'abc'` (non-numeric) → 400 |
| ZTA-24 | `outlet_destination = 'specific_step'` with `outlet_destination_ref = '2.1.2'` → 201 accepted |
| ZTA-25 | `outlet_destination = 'next_node'` with `outlet_destination_ref` present → ref silently ignored |
| ZTA-26 | No generation route (`POST .../generate`) present anywhere |
| ZTA-27 | No `/resequence` route present anywhere |

---

## 13. Phase 3 Readiness Gate

Phase 3 (HAZOP Auto-Generation Engine) may start only when all 21 ZTA checks above pass
and the following conditions hold:

1. At least one loop exists in a `draft` study.
2. That loop has at least one node.
3. That node has at least two steps.
4. The deviation library is seeded (`hazop_deviation_library` rows exist — done in Phase 1).
5. `GET /api/hazop/studies/:studyId/equipment-pool` returns results for the study.

Phase 3 will generate deviations at the **Node level** by applying guide words and
parameters from the deviation library to each node. Steps within the node inform
the generation context (equipment categories present, connections) but are not
individual deviation targets.

---

## 14. Node Dual Role Definition (Binding)

A Node in THERMOPAC HAZOP simultaneously and inseparably serves two roles.
Both roles are carried by the same object. They are not in conflict.

### Role 1 — Process Section Boundary

The Node defines a physical section of the process, corresponding to a
boundary drawn on a P&ID. The boundary is documented by the Node's
`p_and_id_ref` field. All equipment items (Steps) within the Node are
within that P&ID boundary.

**Properties deriving from this role:**
- `p_and_id_ref`: which P&ID drawing defines this boundary
- `node_name`: the section name as it would appear on a P&ID study boundary mark
  (e.g. "Feed Pump Section", "Dehydration Vessel Node")
- Steps within the node = equipment within the P&ID boundary
- `node_reference` (`{loop}.{node}`) = the study node identifier used in
  the HAZOP report's node index

### Role 2 — Operational Analysis Boundary

The Node is the unit of HAZOP analysis. Guide words (No, More, Less, Reverse,
Other than, Part of, As well as, Early, Late) are applied to the Node as a whole.
The Node is the level at which a HAZOP worksheet is produced.

**Properties deriving from this role:**
- `design_intent`: what the node is intended to do under normal operation
  (e.g. "To preheat the oil feed from 40°C to 120°C before the dehydration vessel")
- `deviation_count`: total deviations generated against this node (Phase 3)
- `action_count`: open HAZOP actions arising from this node (Phase 3)
- `generated_at`: when the HAZOP worksheet was last generated for this node

### Why not separate them?

Separating P&ID section from analysis boundary would require two linked objects,
creating synchronisation risk and adding complexity for no practical benefit.
In standard HAZOP practice (IEC 61882), the node IS the P&ID section AND the
analysis boundary. THERMOPAC follows this standard definition.

**Decision:** Node = both roles. Single object. This is binding for all phases.

---

## 15. Phase 3 Deviation Generation Pre-Design (Binding Constraint)

This section is a Phase 2 document but makes binding decisions that constrain
Phase 3 design. Phase 3 specification must not contradict anything stated here.

### 15.1 Unit of Generation

Deviations are generated **per Node**, not per Step.

One HAZOP worksheet = one Node.
One worksheet contains N deviations (one per guide word × parameter combination).

Steps within the Node are not individual targets for guide word application.
They contribute **context** (equipment types present, process parameters).

### 15.2 Equipment Aggregation Approach

Phase 3 must use **full node-level equipment aggregation**, not dominant
category alone.

**Algorithm:**
1. Collect all distinct `equipment_category` values from the Node's Steps.
   Example: Node 2.2 has Steps with categories `{Vessel, Vent}`.
   Node 1.1 has Steps with categories `{Tank, Pump}`.

2. Query `hazop_deviation_library` for all entries where
   `applicable_equipment_category` ∈ collected set.

3. Take the **UNION** of all (guideword, parameter) pairs from those library entries.

4. Generate one `hazop_deviations` row per unique (guideword, parameter) pair.

5. The deviation description is written at node level —
   e.g. "No Flow — Dehydration Vessel Node", not "No Flow — V-201".

**Example:**

```
Node 2.2: Dehydration Vessel Node
Equipment categories present: Vessel, Vent

Library entries for Vessel:   No Flow | More Flow | High Temperature | High Pressure | High Level | Low Level
Library entries for Vent:     No Flow | High Pressure | Blocked | Reverse Flow

Union:  No Flow | More Flow | High Temperature | High Pressure | High Level | Low Level | Blocked | Reverse Flow

→ 8 deviations generated for Node 2.2
```

### 15.3 Dominant Equipment (Context Only)

A "dominant" equipment category may be used in Phase 3 for:
- Deviation description phrasing (e.g. "No Flow to Vessel V-201" vs "No Flow to Pump P-101")
- Ordering of generated deviations within the worksheet

Dominance hierarchy (highest to lowest):
```
Vessel > Tank > Column > Separator > Pump > Heat Exchanger > Heater >
Filter > Control Valve > Isolation Valve > Check Valve > Instrument >
Utility System > Drain > Vent > Product Outlet > Waste Outlet > Next Loop
```

The dominant category is the highest-ranked category present in the Node's Steps.
This is used for phrasing only — it does NOT reduce the set of guide words applied.

### 15.4 Phase 2 Implication

No Phase 2 schema changes are needed to support this algorithm.
The Phase 3 generation engine will read `hazop_process_steps.equipment_category`
(filtered by `node_id`) to build the aggregated category set.
The `equipment_category` field on each step is the sole Phase 3 input from Phase 2.

---

## 16. Process Topology Diagram — Deferred (Decision Record)

The user asked whether a future process topology diagram will use:
- Loop → Node → Step hierarchy
- OR a flat loop-level step graph

**Decision:** The topology diagram, when implemented, will use the
**Loop → Node → Step hierarchy**.

Rationale:
- The Node is the primary process unit (§14). Nodes are what appear as
  labelled blocks on a P&ID study boundary overlay.
- A flat step graph would be too granular for process overview and would
  not match the HAZOP report structure.
- The intended visual: Loops as swimlanes, Nodes as blocks within swimlanes,
  Steps as sub-items inside each Node block, directed connections between
  Nodes (not between individual Steps, unless `outlet_destination = specific_step`).

**Deferred to:** A future phase (not Phase 2, 3, 4, or 5 as currently scoped).
The Process Builder UI (Phase 2) does not include a topology diagram view.
The Phase 3 worksheet view does not include a topology diagram.
A dedicated "Process Flow View" feature may be scoped as Phase 7 or standalone.

---

## 17. Intra-Node Process Flow Rules (Binding)

### 17.1 Intra-Node Flow is Valid and Supported

Flow between Steps inside the same Node is a first-class part of the process
model. It is not incidental — it is the intended way to represent an ordered
equipment sequence within a HAZOP analysis boundary.

**Example:**

```
Node 2.2 — Dehydration Vessel Node
 ├── Step 1 (seq=1): Vessel — V-201
 │    outlet_destination = next_step         ← connects to Step 2 inside this node
 └── Step 2 (seq=2): Vent — Overhead Vapor Outlet
      outlet_destination = next_loop         ← exits the node and the loop
```

Step 1 using `outlet_destination = 'next_step'` to connect to Step 2 inside
the same Node is **valid, supported, and the normal pattern** for equipment
sequences within a node.

---

### 17.2 Scope of `next_step` and `prev_step`

`next_step` and `prev_step` operate **only within the same Node**.

They resolve to:
- `next_step` → the step with `sequence_no = current_sequence_no + 1`
  within the same `node_id`
- `prev_step` → the step with `sequence_no = current_sequence_no - 1`
  within the same `node_id`

They do NOT cross node boundaries. To cross to another node, use `next_node`,
`next_loop`, or `specific_step` with an explicit `{L}.{N}.{S}` reference.

**Boundary behaviour:**
- `next_step` on the last step of a node: the server issues warning V2
  (non-terminal destination not set) at step save time. The user should
  change the destination to `next_node`, `next_loop`, or a terminal value.
- `prev_step` on the first step of a node (seq=1): server issues warning V2.

---

### 17.3 Intra-Node Steps Form a Local Ordered Process Chain

Steps within a Node form a **local, ordered, directed process chain**.
The ordering is defined by `sequence_no` (ascending). The flow direction
is defined by each step's `outlet_destination`.

**Properties of this chain:**
- Ordered: steps are traversed from `sequence_no = 1` upward
- Directed: each step explicitly declares where its outlet goes
- Local: the chain is bounded by the node — external routing uses
  `next_node`, `next_loop`, or `specific_step`
- Non-branching in Phase 2: bypass and recycle branches are recorded via
  `outlet_destination_ref` but the model does not validate the full graph topology

**The Node boundary is the HAZOP analysis boundary.** The intra-node
step chain is the process description inside that boundary.

---

### 17.4 Phase 3 — Intra-Node Sequencing as Generation Context

Phase 3 generation uses intra-node step sequencing as **contextual information**.
Deviations remain Node-level only (one worksheet per Node). Step ordering and
outlet relationships do not create separate deviation entries.

**What Phase 3 uses from intra-node structure:**

| Context signal | How Phase 3 may use it |
|---|---|
| Step `equipment_category` set | Builds aggregated equipment set for guide word selection (§15.2) |
| Step `sequence_no` ordering | Identifies "entry" equipment (seq=1) vs "exit" equipment (last seq) |
| Step `outlet_destination` on last step | Confirms how the node connects to the next node — used in "No Flow" cause phrasing |
| Step `equipment_tag` values | Populates cause/safeguard descriptions with real tag numbers |
| `outlet_destination = recycle` or `bypass` with ref | Signals potential flow reversal or alternative path — informs reverse flow and other-than deviations |

**What Phase 3 does NOT do with intra-node structure:**
- Does not generate a separate deviation per step
- Does not produce a separate worksheet per step
- Does not require every step to have an explicit `outlet_destination` to generate

---

### 17.5 Topology Rendering — Intra-Node vs Inter-Node Flow

From §16, the process topology diagram (deferred) uses the Loop → Node → Step
hierarchy. The flow rendering rules for that future view are:

| Level | What is rendered |
|---|---|
| Inter-node | Directed connection between Nodes (primary visual) |
| Intra-node | Steps shown as an ordered list or sub-flow inside the Node block |
| Cross-loop | Directed connection from exit Node of Loop N to entry Node of Loop N+1 |
| Specific-step | Directed connection from exit step to target step, crossing node boundaries if needed |

**Summary:** The topology view shows **flow between Nodes as the primary
directed graph**. Intra-node step sequences are shown as subordinate detail
within a Node block — not as separate graph nodes in the primary topology.

---

### 17.6 Summary Table — Intra-Node Flow Rules

| Rule | Specification |
|---|---|
| Intra-node flow validity | Fully valid and the expected pattern for multi-step nodes |
| `next_step` / `prev_step` scope | Within same `node_id` only — never crosses node boundary |
| `next_step` on last step | Allowed; server issues warning V2 at save time |
| Step ordering | Defined by `sequence_no` ascending within the node |
| Step chain bounded by | Node boundary — exit via `next_node`, `next_loop`, or `specific_step` |
| Phase 3 deviation target | Node (never individual Step) |
| Phase 3 use of step order | Contextual only — entry/exit equipment identification, tag phrasing |
| Topology rendering | Nodes as primary graph nodes; intra-node steps as subordinate detail |
