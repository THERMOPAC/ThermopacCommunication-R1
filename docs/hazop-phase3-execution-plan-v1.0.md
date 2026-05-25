# HAZOP Module — Phase 3 Execution Plan v1.0
# HAZOP Generation Engine & Worksheet

**Status:** PLAN — AWAITING APPROVAL
**Date:** 2026-05-25
**Supersedes:** Nothing (first Phase 3 plan)
**Parent Plan:** `docs/hazop-module-execution-plan-v2.0.md`
**Phase 2 Summary:** `docs/hazop-phase2-execution-plan-v2.0.md` (Phase 2 v2.0 — CLOSED)
**Author:** THERMOPAC QMS Agent
**Governed by:** `docs/operating-protocol-v1.0.md`

---

## 0. Context and Phase 3 Entry Conditions

Phase 2 v2.0 is closed. The following are in place and verified:

| Condition | Status |
|---|---|
| Loop → Node → Step(s) hierarchy in DB | COMPLETE |
| All 27 Phase 2 ZTA checks | PASS |
| `hazop_deviations` table with UNIQUE(node_id, guideword, parameter) | EXISTS in DB |
| `hazop_causes`, `hazop_consequences`, `hazop_safeguards`, `hazop_actions` tables | EXISTS in DB |
| `hazop_deviation_library` seeded — 16 rows (Pump, Vessel, Heat Exchanger, Control Valve) | CONFIRMED |
| KI-1 carry-forward: generation engine must guard against using `outlet_destination_ref` for non-required destinations | BINDING REQUIREMENT |
| KI-2 carry-forward: V1/V2/V3 warning badges in UI must be resolved before Phase 3 worksheet review closure | BINDING REQUIREMENT |

**Phase 3 readiness gate (from Phase 2 §13):**
- At least one `draft` study exists with ≥1 loop, ≥1 node, ≥2 steps ✓
- `hazop_deviation_library` contains rows ✓

---

## 1. Phase 3 Scope

Phase 3 delivers the HAZOP generation engine, deviation CRUD, and the worksheet view.
It transforms the process definition built in Phase 2 into a populated HAZOP worksheet.

### 1.1 Explicit Phase 3 Deliverables

| # | Deliverable |
|---|---|
| 1 | Single-node generation endpoint: `POST /api/hazop/nodes/:nodeId/generate` |
| 2 | Study-level generation endpoint: `POST /api/hazop/studies/:studyId/generate` |
| 3 | Deviation read and CRUD routes (post-generation review, credibility flagging) |
| 4 | Cause, Consequence, Safeguard CRUD routes (add manual items, soft-delete library items) |
| 5 | Action CRUD routes (add, assign, update status, close) |
| 6 | UI page: `/hazop/studies/:id/worksheet` — node-by-node HAZOP worksheet viewer and editor |
| 7 | UI page: `/hazop/studies/:id/actions` — study-level action register |
| 8 | V1/V2/V3 warning badges resolved in Process Builder step cards (KI-2 from Phase 2) |
| 9 | KI-1 guard implemented in generation engine |

### 1.2 Explicit Phase 3 Exclusions

| Excluded | Deferred To |
|---|---|
| Study status transition (draft → in-review → approved → released) | Phase 6 |
| Revision cloning | Phase 6 |
| GCS upload / document package | Phase 6 |
| Excel worksheet export | Phase 5 |
| FAT/SAT checklist generation | Phase 5 |
| Concept → Project conversion | Phase 6 |
| Cause & Effect matrix | Phase 4 |
| Safety function extraction | Phase 4 |
| Process topology diagram | Phase 7 (deferred, per Phase 2 §16) |
| AI-assisted cause/consequence generation (OpenAI) | Phase 5 |

---

## 2. Schema — No New Tables Required

All Phase 3 tables already exist in the database from Phase 1 schema creation.
No `psql` DDL is required for Phase 3.

### 2.1 Existing Tables Used in Phase 3

#### `hazop_deviations`

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| node_id | integer NOT NULL FK → hazop_nodes | CASCADE delete |
| study_id | integer NOT NULL FK → hazop_studies | Denormalized. Set from node.study_id on generation |
| deviation_number | varchar NOT NULL | Format: `{node_reference}-D{nn:02d}` e.g. `1.1-D01` |
| guideword | varchar(20) NOT NULL | Controlled vocabulary (§5.1) |
| parameter | varchar(20) NOT NULL | Controlled vocabulary (§5.1) |
| deviation_description | varchar NOT NULL | Built from library + node context (§7.2) |
| is_credible | boolean NOT NULL DEFAULT true | Set by reviewer |
| credibility_reason | text | Required when is_credible = false |
| reviewed | boolean NOT NULL DEFAULT false | Set by reviewer via PATCH |
| reviewed_by | integer FK → users | Set on review |
| reviewed_at | timestamp | Set on review |
| created_at | timestamp NOT NULL DEFAULT now() | |
| UNIQUE | (node_id, guideword, parameter) | Enforced by `hazop_deviations_node_id_guideword_parameter_key` |

#### `hazop_causes`

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| deviation_id | integer NOT NULL FK → hazop_deviations | CASCADE delete |
| cause_number | integer NOT NULL | Auto-assigned: MAX+1 within deviation_id |
| cause_description | text NOT NULL | |
| source | varchar NOT NULL DEFAULT 'library' | `'library'` = auto-generated; `'manual'` = user-added |
| deleted | boolean NOT NULL DEFAULT false | Soft delete — library rows only |

#### `hazop_consequences`

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| deviation_id | integer NOT NULL FK → hazop_deviations | CASCADE delete |
| consequence_number | integer NOT NULL | Auto-assigned: MAX+1 within deviation_id |
| consequence_description | text NOT NULL | |
| severity | varchar | `low`, `medium`, `high`, `critical` |
| source | varchar NOT NULL DEFAULT 'library' | `'library'` or `'manual'` |
| deleted | boolean NOT NULL DEFAULT false | Soft delete |

#### `hazop_safeguards`

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| deviation_id | integer NOT NULL FK → hazop_deviations | CASCADE delete |
| safeguard_number | integer NOT NULL | Auto-assigned: MAX+1 within deviation_id |
| safeguard_description | text NOT NULL | |
| safeguard_type | varchar | `instrumented`, `procedural`, `mechanical`, `alarm` |
| tag_ref | varchar | Equipment tag reference (e.g. LAHH-201) |
| source | varchar NOT NULL DEFAULT 'library' | `'library'` or `'manual'` |
| deleted | boolean NOT NULL DEFAULT false | Soft delete |

#### `hazop_actions`

| Column | Type | Rules |
|---|---|---|
| id | serial PK | |
| deviation_id | integer NOT NULL FK → hazop_deviations | CASCADE delete |
| action_number | integer NOT NULL | Auto-assigned: MAX+1 within deviation_id |
| action_description | text NOT NULL | |
| action_type | varchar | `design`, `procedure`, `instrumentation`, `study` |
| assigned_to | integer FK → users | |
| due_date | date | |
| status | varchar NOT NULL DEFAULT 'open' | `'open'`, `'closed'`, `'cancelled'` |
| close_comments | text | Required when status → `'closed'` |
| closed_at | timestamp | Set when status → `'closed'` |
| source | varchar NOT NULL DEFAULT 'library' | `'library'` or `'manual'` |

#### `hazop_deviation_library` (read-only in Phase 3)

| Column | Notes |
|---|---|
| equipment_category | The 18 equipment categories from Phase 2 vocabulary |
| guideword | Guide word string |
| parameter | Parameter string |
| applicable | boolean — only rows with applicable=true are used |
| deviation_description | Template description |
| typical_causes | jsonb array of strings |
| typical_consequences | jsonb array of strings |
| typical_safeguards | jsonb array of strings |
| typical_actions | jsonb array of strings |
| UNIQUE | (equipment_category, guideword, parameter) |

**Current library coverage (16 rows):**

| Category | Guide Words Covered |
|---|---|
| Pump | No/Flow, More/Flow, Less/Flow, Reverse/Flow, More/Pressure, Less/Pressure |
| Vessel | More/Level, Less/Level, More/Pressure, Less/Pressure |
| Heat Exchanger | No/Flow, More/Temperature, Less/Temperature, Other Than/Composition |
| Control Valve | No/Flow, More/Flow |

**Note:** Tank, Column, Separator, Filter, Isolation Valve, Check Valve, Instrument,
Utility System, Drain, Vent, Product Outlet, Waste Outlet, Heater, Next Loop
have **zero library entries**. Nodes whose steps contain ONLY these categories will
generate zero deviations. This is by design — the library can be extended in future phases.

### 2.2 Schema Change Required — None

No `ALTER TABLE`, `CREATE TABLE`, or index changes are needed for Phase 3.
All required tables, FKs, and constraints already exist.

---

## 3. API Routes

All routes in `server/hazop-routes.ts`.

### 3.1 Generation Routes — NEW

#### `POST /api/hazop/nodes/:nodeId/generate`

Generates HAZOP deviations for a single node.

**Request body:** None required. Optional:
```
force_regen   boolean   optional   If true: re-generate library items for existing
                                   unreviewed deviations. Default: false.
```

**Server-side rules:**
1. Resolve node → loop → study. 409 if `study.status ≠ 'draft'`.
2. Acquire advisory lock `pg_advisory_xact_lock(studyId, 3001)`. 409 if lock not acquired.
3. 400 if node has 0 steps.
4. Run generation algorithm (§6). Wrapped in a single DB transaction.
5. Update `hazop_nodes.deviation_count`, `generated_at`, `generated_by`.
6. Release lock (automatic on transaction end).

**Response:** `{ generated: N, skipped: M, node_id, deviation_count }` — 200.

---

#### `POST /api/hazop/studies/:studyId/generate`

Generates HAZOP deviations for all nodes in a study, in order (by loop_number ASC, node_number ASC).

**Request body:**
```
force_regen   boolean   optional   Passed through to each node generation call. Default: false.
```

**Server-side rules:**
1. Resolve study. 409 if `study.status ≠ 'draft'`.
2. Acquire advisory lock `pg_advisory_xact_lock(studyId, 3002)`.
3. Fetch all nodes for study ordered by `loop_number ASC, node_number ASC`.
4. For each node: skip if 0 steps (record in skipped list). Run generation algorithm (§6) per node. Each node generation runs in its own sub-transaction (partial failure does not abort the entire study generation).
5. Return aggregate summary.

**Response:** `{ nodes_generated: N, nodes_skipped: M, nodes_failed: K, details: [...] }` — 200.

---

### 3.2 Deviation CRUD Routes — NEW

#### `GET /api/hazop/nodes/:nodeId/deviations`

Returns all deviations for a node, with nested causes, consequences, safeguards, actions.
Soft-deleted items (`deleted=true`) are excluded from child arrays.

**Response per deviation:**
```json
{
  "id": 1,
  "deviation_number": "1.1-D01",
  "guideword": "No",
  "parameter": "Flow",
  "deviation_description": "No flow through Feed Pump Suction Node",
  "is_credible": true,
  "credibility_reason": null,
  "reviewed": false,
  "reviewed_by": null,
  "reviewed_at": null,
  "causes": [...],
  "consequences": [...],
  "safeguards": [...],
  "actions": [...]
}
```

---

#### `PATCH /api/hazop/deviations/:deviationId`

Allowed fields: `deviation_description`, `is_credible`, `credibility_reason`, `reviewed`.

Special rules:
- `reviewed = true` → server sets `reviewed_by = req.user.id`, `reviewed_at = NOW()`.
- `reviewed = false` → server clears `reviewed_by`, `reviewed_at`.
- `is_credible = false` without `credibility_reason` → 400.
- `is_credible = true` → `credibility_reason` silently cleared to NULL.
- Prohibited: `id`, `node_id`, `study_id`, `guideword`, `parameter`, `deviation_number`, `created_at` — silently ignored.
- 409 if study `status ≠ 'draft'`.

---

#### `DELETE /api/hazop/deviations/:deviationId`

Hard delete. Cascades to all child causes, consequences, safeguards, actions.
409 if study `status ≠ 'draft'`.
After delete: recalculate and update `hazop_nodes.deviation_count`.
Response: 204.

---

### 3.3 Cause CRUD — NEW

#### `POST /api/hazop/deviations/:deviationId/causes`

Adds a manual cause. `source` is forced to `'manual'` server-side regardless of body value.
`cause_number` = `MAX(cause_number) + 1` within `deviation_id`.
409 if study `status ≠ 'draft'`.

**Body:** `{ cause_description: string (required) }`

---

#### `PATCH /api/hazop/causes/:causeId`

Allowed fields: `cause_description`.
Prohibited (silently ignored): `id`, `deviation_id`, `cause_number`, `source`, `deleted`.
409 if study `status ≠ 'draft'`.

---

#### `DELETE /api/hazop/causes/:causeId`

**Behaviour depends on `source`:**
- `source = 'library'` → soft delete: `deleted = true`. Row is retained.
- `source = 'manual'` → hard delete.

409 if study `status ≠ 'draft'`.
Response: 204.

---

### 3.4 Consequence CRUD — NEW

Same pattern as §3.3 with routes:
- `POST /api/hazop/deviations/:deviationId/consequences`
- `PATCH /api/hazop/consequences/:consequenceId` — allowed: `consequence_description`, `severity`
- `DELETE /api/hazop/consequences/:consequenceId` — same library/manual soft-vs-hard logic

---

### 3.5 Safeguard CRUD — NEW

Same pattern as §3.3 with routes:
- `POST /api/hazop/deviations/:deviationId/safeguards`
- `PATCH /api/hazop/safeguards/:safeguardId` — allowed: `safeguard_description`, `safeguard_type`, `tag_ref`
- `DELETE /api/hazop/safeguards/:safeguardId` — same library/manual soft-vs-hard logic

---

### 3.6 Action CRUD — NEW

#### `POST /api/hazop/deviations/:deviationId/actions`

`source` forced to `'manual'`. `status` defaults to `'open'`.
Body: `{ action_description, action_type?, assigned_to?, due_date? }`

#### `PATCH /api/hazop/actions/:actionId`

Allowed: `action_description`, `action_type`, `assigned_to`, `due_date`, `status`, `close_comments`.

Special rules:
- `status = 'closed'` → server sets `closed_at = NOW()`. `close_comments` required — 400 if absent.
- `status = 'open'` → clears `closed_at`, `close_comments`.

After action status change: recalculate and update `hazop_nodes.action_count`
(count of `open` actions whose deviation.node_id = this node).

#### `DELETE /api/hazop/actions/:actionId`

Hard delete for manual actions. Soft delete (source='library'): not applicable (actions are never soft-deleted — they are either open or closed).
After delete: recalculate `hazop_nodes.action_count`.

---

### 3.7 Study Action Register — NEW

#### `GET /api/hazop/studies/:studyId/actions`

Returns all open and closed actions across all deviations in the study.
Includes: action fields + deviation fields (guideword, parameter, deviation_number) + node fields (node_reference, node_name).
Optional query param: `?status=open` or `?status=closed`. Default: all.

---

### 3.8 Study Worksheet Summary — NEW

#### `GET /api/hazop/studies/:studyId/worksheet-summary`

Returns a per-node summary:
```json
[
  {
    "node_id": 1,
    "node_reference": "1.1",
    "node_name": "Feed Storage Node",
    "deviation_count": 8,
    "reviewed_count": 3,
    "non_credible_count": 1,
    "open_action_count": 4,
    "generated_at": "2026-05-25T..."
  },
  ...
]
```

---

## 4. Generation Algorithm — Deterministic Rule Engine

The generation algorithm is **fully deterministic**: given the same node steps and the same
deviation library, it always produces the same set of deviations. There is no randomness,
AI inference, or non-determinism in Phase 3.

```
function generateNodeDeviations(nodeId, userId, forceRegen):

  1. ACQUIRE LOCK
     pg_advisory_xact_lock(studyId, 3001)

  2. LOAD NODE CONTEXT
     node = SELECT n.*, l.loop_number, s.project_id, s.study_mode
            FROM hazop_nodes n
            JOIN hazop_process_loops l ON l.id = n.loop_id
            JOIN hazop_studies s ON s.id = n.study_id
            WHERE n.id = nodeId

  3. LOAD STEPS (ordered by sequence_no ASC)
     steps = SELECT * FROM hazop_process_steps
             WHERE node_id = nodeId
             ORDER BY sequence_no ASC

  4. VALIDATE
     IF steps.length = 0 → RAISE 400 "Node has no steps"
     IF node.study_status ≠ 'draft' → RAISE 409

  5. BUILD EQUIPMENT SET
     categories = DISTINCT(steps.map(s => s.equipment_category))
     — Example: ['Tank', 'Pump', 'Vessel']

  6. IDENTIFY DOMINANT EQUIPMENT (for phrasing — see §5.2)
     dominant = highest-ranked category in `categories` per dominance hierarchy

  7. BUILD TOPOLOGY CONTEXT (see §8 — KI-1 guard applied here)
     entryStep = steps[0]  (sequence_no = 1)
     exitStep  = steps[last]
     exitDestination = exitStep.outlet_destination
     exitRef = REF_REQUIRED.has(exitDestination) ? exitStep.outlet_destination_ref : null
     — KI-1: outlet_destination_ref is only used when outlet_destination ∈ {specific_step, recycle, bypass}

  8. QUERY LIBRARY
     libraryRows = SELECT * FROM hazop_deviation_library
                   WHERE equipment_category = ANY(categories)
                     AND applicable = true

  9. BUILD DEVIATION SET (UNION of guide word × parameter pairs)
     deviationPairs = DISTINCT(libraryRows.map(r => [r.guideword, r.parameter]))
     — Sorted: guideword order (No, More, Less, Reverse, Other Than, Part of, As well as, Early, Late)
     — Then by parameter alphabetically within guideword

  10. FOR EACH (guideword, parameter) pair:

      a. CHECK EXISTING
         existing = SELECT FROM hazop_deviations
                    WHERE node_id = nodeId AND guideword = gw AND parameter = param

         IF existing AND existing.reviewed = true AND NOT forceRegen:
           → SKIP (reviewed deviations protected)
           → INCREMENT skipped counter

         IF existing AND NOT forceRegen:
           → SKIP (already generated, not reviewed — leave untouched unless forceRegen)
           → INCREMENT skipped counter

      b. SELECT BEST LIBRARY ENTRY (for description template)
         bestEntry = libraryRows where equipment_category = dominant
                     AND guideword = gw AND parameter = param
         IF not found: bestEntry = first libraryRows entry for (gw, param)

      c. BUILD DEVIATION NUMBER
         seqNo = (count of already-inserted deviations for this nodeId) + 1
         devNumber = `${node.node_reference}-D${String(seqNo).padStart(2, '0')}`
         — Example: "1.1-D01", "2.3-D07"

      d. BUILD DEVIATION DESCRIPTION (see §7.2)
         description = buildDeviationDescription(bestEntry, node, dominant, exitDestination)

      e. UPSERT DEVIATION
         IF existing AND forceRegen AND NOT existing.reviewed:
           UPDATE hazop_deviations SET deviation_description = description
                                   WHERE id = existing.id
         ELSE:
           INSERT INTO hazop_deviations
             (node_id, study_id, deviation_number, guideword, parameter,
              deviation_description, is_credible, reviewed, created_at)
           VALUES (nodeId, node.study_id, devNumber, gw, param,
                   description, true, false, NOW())
           ON CONFLICT (node_id, guideword, parameter) DO NOTHING
           — UNIQUE constraint ensures no duplicates even on concurrent calls

      f. FOR NEW DEVIATIONS ONLY (inserted, not updated or skipped):
         INSERT causes FROM bestEntry.typical_causes[]
           — One row per string in the array
           — source = 'library', deleted = false
           — cause_number = sequential within deviation
         INSERT consequences FROM bestEntry.typical_consequences[]
         INSERT safeguards FROM bestEntry.typical_safeguards[]
         INSERT actions FROM bestEntry.typical_actions[]

  11. UPDATE NODE
      UPDATE hazop_nodes SET
        deviation_count = (SELECT COUNT(*) FROM hazop_deviations WHERE node_id = nodeId),
        generated_at = NOW(),
        generated_by = userId
      WHERE id = nodeId

  12. RETURN { generated, skipped, node_id, deviation_count }
```

---

## 5. Controlled Vocabulary for Deviations

### 5.1 Guide Words and Parameters

Guide words and parameters are sourced from `hazop_deviation_library`.
The existing library uses the following values:

**Guide words:**
```
No | More | Less | Reverse | Other Than | Part of | As well as | Early | Late
```

**Parameters:**
```
Flow | Pressure | Temperature | Level | Composition
```

These are not enforced by a separate table constraint. The library itself is the vocabulary source.
Phase 3 does not add guide words or parameters — it only reads what the library provides.

### 5.2 Dominant Equipment Hierarchy

Used only for deviation description phrasing (§7.2). Does not affect guide word selection.

```
Vessel > Tank > Column > Separator > Pump > Heat Exchanger > Heater >
Filter > Control Valve > Isolation Valve > Check Valve > Instrument >
Utility System > Drain > Vent > Product Outlet > Waste Outlet > Next Loop
```

Algorithm: iterate the hierarchy from highest to lowest; return the first category present
in the node's step set.

---

## 6. Node Aggregation Logic (§15.2 Binding Constraint)

Equipment aggregation uses the **UNION** of all (guideword, parameter) pairs whose
`equipment_category` appears in any of the node's steps.

**This is binding (defined in Phase 2 §15.2):**
- Step categories are collected with `DISTINCT` — each category counted once regardless of how many steps have it.
- Library is queried for ALL collected categories.
- Result is the UNION, not the intersection, not the dominant-only set.
- Example: Node with steps `{Vessel, Vent}` inherits all library deviations for both Vessel AND Vent.
- A node with steps `{Tank, Drain, Vent}` where Drain and Vent have no library entries will receive only Tank's deviations.

---

## 7. Deviation Description Construction

### 7.1 Template Source

The `deviation_description` in `hazop_deviation_library` is a generic template
(e.g. "No flow through pump"). Phase 3 enriches it with node context.

### 7.2 Construction Algorithm

```
function buildDeviationDescription(libraryEntry, node, dominantCategory, exitDestination):

  base = libraryEntry.deviation_description
  nodeName = node.node_name

  // Pattern: "{base} — {nodeName}"
  // Example: "No flow through pump — Feed Pump Suction Node"

  description = `${base} — ${nodeName}`

  // Optional enrichment for "No Flow" with exit context
  IF libraryEntry.guideword = 'No' AND libraryEntry.parameter = 'Flow':
    IF exitDestination = 'next_node':
      description += ' (no flow to next node)'
    IF exitDestination = 'next_loop':
      description += ' (no flow to next loop)'
    IF exitDestination = 'product_outlet':
      description += ' (product delivery blocked)'
    IF exitDestination = 'waste_outlet':
      description += ' (waste removal blocked)'

  RETURN description.substring(0, 255)  // Truncate to varchar field limit if needed
```

Reviewers can manually update `deviation_description` via `PATCH /api/hazop/deviations/:id`
after generation.

---

## 8. Cause Generation Logic

Causes are generated from `typical_causes` JSONB array in the matching library entry.

**Algorithm:**
```
causes = bestEntry.typical_causes  // string[]
FOR i, causeText IN enumerate(causes):
  INSERT INTO hazop_causes (deviation_id, cause_number, cause_description, source, deleted)
  VALUES (newDeviationId, i+1, causeText, 'library', false)
```

**Context enrichment (equipment tag substitution):**
Where the library cause text references a generic term like "pump", the generation engine
attempts tag substitution using the node's steps:

- If `dominantCategory = 'Pump'` and a step with `equipment_category = 'Pump'` has an `equipment_tag`:
  the cause text's first occurrence of `"pump"` (case-insensitive) is suffixed with the tag.
  Example: "Pump failure" → "Pump failure (P-101)" if P-101 is the pump tag in the node.

Tag substitution is **optional and best-effort**: if no tag is available for the dominant
equipment, the library text is used verbatim. Tag substitution applies only to the
dominant equipment category's tag.

---

## 9. Safeguard Suggestion Logic

Safeguards are generated from `typical_safeguards` JSONB array.

**Tag reference resolution:**
Where a safeguard description mentions an instrument class that can be resolved from
`hazop_concept_instruments` (concept mode) or from the BUY list tag (project mode):

- If the safeguard text contains an instrument class keyword (e.g. "Low flow alarm",
  "High level trip"), and the node's steps include a step with a linked concept instrument
  or buy list tag that matches this class, the `tag_ref` field on the safeguard row is
  populated with that instrument tag.
- This resolution is best-effort and subject to a simple keyword match.
- If no match: `tag_ref = NULL`.

**Algorithm:**
```
safeguards = bestEntry.typical_safeguards  // string[]
instrumentPool = loadConceptInstrumentsForStudy(studyId)  // or BUY list tags

FOR i, safeguardText IN enumerate(safeguards):
  tagRef = resolveInstrumentTag(safeguardText, instrumentPool)  // may return null
  INSERT INTO hazop_safeguards
    (deviation_id, safeguard_number, safeguard_description, source, tag_ref, deleted)
  VALUES (newDeviationId, i+1, safeguardText, 'library', tagRef, false)
```

---

## 10. Topology Traversal Logic

Phase 3 uses the intra-node step sequence as contextual input to the generation engine
(binding per Phase 2 §17.4). The traversal is:

```
LOAD ordered steps: SELECT * FROM hazop_process_steps
                    WHERE node_id = nodeId ORDER BY sequence_no ASC

entryStep = steps[0]           — seq=1: entry equipment (tank, vessel, pump inlet)
exitStep  = steps[steps.length-1]  — last seq: exit equipment (outlet, vent, next)

exitDestination = exitStep.outlet_destination

// KI-1 GUARD (mandatory — binding from Phase 2 closure)
// outlet_destination_ref is stored for non-required destinations but must NEVER be used
// by the generation engine unless the destination is in the ref-required set.
const REF_REQUIRED = new Set(['specific_step', 'recycle', 'bypass'])
exitRef = REF_REQUIRED.has(exitDestination) ? exitStep.outlet_destination_ref : null

stepCategorySet = DISTINCT(steps.map(s => s.equipment_category))
stepTagMap = Map: equipment_category → equipment_tag (first non-null tag per category)
```

**Signals used by generation engine:**

| Signal | Source | Used For |
|---|---|---|
| `stepCategorySet` | All steps | Guide word selection (§6) |
| `dominantCategory` | Highest in hierarchy (§5.2) | Deviation phrasing (§7.2), best library entry selection (§4.10b) |
| `entryStep.equipment_category` | Step seq=1 | Identifies inlet equipment for "No Flow" cause phrasing |
| `exitDestination` | Last step | "No Flow" description enrichment (§7.2) |
| `exitRef` | Last step — only if `exitDestination ∈ REF_REQUIRED` | Cross-node/loop reference in cause text |
| `stepTagMap` | All steps | Tag substitution in causes (§8), safeguard tag_ref (§9) |

---

## 11. Re-generation Semantics

Re-generation (calling generate again on a node that was already generated) must be
safe and idempotent.

| Scenario | Behaviour |
|---|---|
| Deviation already exists, `reviewed = false`, `forceRegen = false` | SKIP. Deviation and its children are left untouched. |
| Deviation already exists, `reviewed = true`, `forceRegen = false` | SKIP. Protected. |
| Deviation already exists, `reviewed = false`, `forceRegen = true` | UPDATE deviation_description only. Children (causes/consequences/safeguards/actions) are NOT re-generated. |
| Deviation already exists, `reviewed = true`, `forceRegen = true` | SKIP. Reviewed deviations are always protected, even with forceRegen. |
| New (guideword, parameter) pair — not yet in DB | INSERT new deviation + all library children. |
| (guideword, parameter) pair no longer in library (library changed) | NOT deleted. Existing deviations remain. Manual deletion required. |
| Step added to node (new equipment category) | Re-generation adds new deviations for new pairs. Existing deviations untouched. |
| Step deleted from node (category no longer in node) | Deviations from that category are NOT auto-deleted. Must be manually reviewed/deleted. |
| Library item soft-deleted (`source='library'`, `deleted=true`) | NOT regenerated. User's explicit soft-delete is respected. |
| Manual cause/consequence/safeguard (`source='manual'`) | NEVER touched by generation engine. |

---

## 12. Concurrency Strategy

Two simultaneous generation requests for the same study must not produce duplicate
deviations or corrupt deviation_count.

**Strategy: PostgreSQL advisory lock per study**

```sql
SELECT pg_advisory_xact_lock(study_id::bigint * 10000 + 3001)
```

- Single-node generation: lock key = `study_id * 10000 + 3001`
- Study-level generation: lock key = `study_id * 10000 + 3002`
- Both keys are distinct to prevent deadlock between single-node and study-level calls.
- Lock is acquired inside the transaction and released automatically on transaction commit/rollback.
- If the lock is not acquired within 5 seconds, return 409 `{ error: 'Generation already in progress for this study' }`.

**Backup safety:** The `UNIQUE(node_id, guideword, parameter)` constraint on `hazop_deviations`
acts as a hard guard: even without the advisory lock, a concurrent INSERT will fail with
a unique violation rather than creating a duplicate. The advisory lock prevents the
concurrent call from proceeding at all, which is cleaner.

---

## 13. Warning Handling — V1/V2/V3 in Process Builder UI (KI-2 Resolution)

This resolves KI-2 from Phase 2 closure.

Warnings V1, V2, V3 are returned in the step POST/PATCH response body under a `warnings[]` array.
The Process Builder must display these as per-row amber badges in the step card.

**V1** — First step of a node does not start with a vessel-class equipment:
```
equipment_category NOT IN ('Tank','Vessel','Separator','Column','Utility System')
AND connection_type ≠ 'Loop transition'
AND sequence_no = 1
→ Warning: "First step should be a vessel-class equipment or use Loop transition connection"
```

**V2** — Last step of a node uses a non-terminal outlet destination:
```
outlet_destination NOT IN ('product_outlet','waste_outlet','drain','vent','next_node','next_loop')
AND sequence_no = MAX(sequence_no) within node
→ Warning: "Last step outlet destination does not exit the node — confirm routing"
```

**V3** — Equipment tag absent for a taggable category:
```
equipment_category NOT IN ('Drain','Vent','Next Loop','Product Outlet','Waste Outlet')
AND equipment_tag IS NULL
→ Warning: "Equipment tag recommended for taggable category"
```

**UI implementation:**
- Warnings are returned in the API response for POST and PATCH step.
- The step card renders an amber `⚠` badge at the top right of the card if `warnings.length > 0`.
- Hovering the badge shows the warning list in a tooltip.
- Warnings do not block submission (they are not validation errors).
- The warning state is re-evaluated on each save; the badge is cleared if the save succeeds with no warnings.

**Note on V1/V2/V3 server logic:** These checks already exist in the routes (POST step §3.3.1 rules 1–3 implied). If not yet implemented server-side, they must be added in Phase 3 alongside the UI changes.

---

## 14. Worksheet UI

### 14.1 Route

**`/hazop/studies/:id/worksheet`**
**File:** `client/src/pages/hazop/hazop-worksheet.tsx` (new file)

### 14.2 Layout

```
[Study header: study_number | title | status badge | mode badge]
[Actions: "Generate All Nodes" button | "Action Register" link]

[Left sidebar — 280px]
  Node list (grouped by loop):
  Loop 1 — Feed Transfer Loop
    ▸ 1.1 Feed Storage Node     [8 dev | 2 reviewed]
    ▸ 1.2 Feed Filtration Node  [4 dev | 0 reviewed]
  Loop 2 — Dehydration Loop
    ▸ 2.1 Feed Preheating Node  [Not generated]
    ...

[Main panel — flex-1]
  IF no node selected:
    "Select a node to view its HAZOP worksheet."

  IF node selected:
    [Node header]
      {node_reference} — {node_name}
      Design Intent: {design_intent}
      P&ID Ref: {p_and_id_ref}
      Steps: {step_count} | Equipment: {equipment categories as badges}
      [Generate Node] button  [shown only if study is draft]
      Generated: {generated_at fmtDate} by {generated_by name}

    [Deviation table — one row per deviation]
      Columns: Dev # | Guide Word | Parameter | Description | Credible? | Reviewed | Actions
      Each row expandable to show:
        Sub-section: Causes     [+ Add Cause]     — list with [Edit] [Delete] per row
        Sub-section: Consequences [+ Add Consequence] — list with [Edit] [Delete] + severity badge
        Sub-section: Safeguards [+ Add Safeguard] — list with [Edit] [Delete] + tag_ref badge
        Sub-section: Actions    [+ Add Action]    — list with [Edit] [Complete] per row

    If no deviations and study is draft:
      "No deviations generated for this node yet."
      [Generate Now] button
```

### 14.3 Node Sidebar Item States

| State | Visual |
|---|---|
| Not generated | Grey text, italic "Not generated" |
| Generated, 0 reviewed | Blue badge `N dev`, grey badge `0 reviewed` |
| Generated, partially reviewed | Blue badge `N dev`, amber badge `M reviewed` |
| Fully reviewed | Blue badge `N dev`, green badge `N reviewed` |
| Has open actions | Red dot on sidebar item |

### 14.4 Deviation Row States

| State | Visual |
|---|---|
| Not reviewed, credible | Normal row |
| Reviewed | Green left border |
| Not credible | Strikethrough text, grey row |
| Has open actions | Red action count badge |

### 14.5 Interaction Rules

- "Generate Node" → calls `POST .../generate`. Refreshes deviation list.
- "Generate All Nodes" → calls `POST .../studies/:id/generate`. Refreshes entire worksheet summary sidebar.
- Clicking a deviation row expands it inline (accordion). Only one deviation expanded at a time (configurable).
- "Add Cause / Consequence / Safeguard / Action" → inline mini-form within the expanded row.
- Soft-deleted library items shown with strikethrough only if a "show deleted" toggle is active (off by default, hidden by default).
- Reviewed toggle on deviation row: click to toggle. Triggers `PATCH .../deviations/:id` with `{ reviewed: true/false }`.
- "Not Credible" toggle: click → opens mini-dialog requesting `credibility_reason`. On confirm, triggers PATCH.
- No generation button shown when `study.status ≠ 'draft'`.

---

### 14.6 Action Register Page

**`/hazop/studies/:id/actions`**
**File:** `client/src/pages/hazop/hazop-actions.tsx` (new file)

```
[Study header]

[Filter bar: Status (All / Open / Closed) | Node filter (All Nodes / select) | Assignee filter]

[Summary: X open | Y closed | Z overdue]

[Action table — read/write]
  Columns: Action # | Dev # | Node | Guideword/Param | Description | Type | Assigned To |
           Due Date | Status | Actions
  Each row: [Edit] [Close] (if open) or [Reopen] (if closed)
```

---

## 15. Files Modified / Created

### New files

| File | Purpose |
|---|---|
| `client/src/pages/hazop/hazop-worksheet.tsx` | HAZOP worksheet UI (§14.2) |
| `client/src/pages/hazop/hazop-actions.tsx` | Action register UI (§14.6) |

### Modified files

| File | Change |
|---|---|
| `server/hazop-routes.ts` | Add generation routes (§3.1), deviation CRUD (§3.2), cause/consequence/safeguard/action CRUD (§3.3–3.6), summary routes (§3.7–3.8) |
| `client/src/App.tsx` | Register two new page routes: `/hazop/studies/:id/worksheet` and `/hazop/studies/:id/actions` |
| `client/src/loaders/hazop.ts` | Lazy-load `HazopWorksheetPage` and `HazopActionsPage` |
| `client/src/pages/hazop/hazop-process-builder.tsx` | Add V1/V2/V3 warning badges on step cards (KI-2 resolution) |
| `shared/schema.ts` | No changes to table definitions. Import types for Phase 3 tables if not already exported |

### Unchanged files

`client/src/pages/hazop/hazop-dashboard.tsx`,
`client/src/pages/hazop/hazop-nodes.tsx`,
`server/hazop-routes.ts` existing Phase 2 routes — preserved without modification

---

## 16. Rollback Plan

Phase 3 adds no schema changes. Rollback is limited to code revert.

If Phase 3 generates data that must be rolled back:

```sql
-- Delete all generated deviations for a study (and children via CASCADE)
DELETE FROM hazop_deviations WHERE study_id = :studyId;

-- Reset node generation metadata
UPDATE hazop_nodes SET deviation_count = 0, generated_at = NULL, generated_by = NULL
WHERE loop_id IN (SELECT id FROM hazop_process_loops WHERE study_id = :studyId);
```

The above SQL is the rollback procedure. It is non-destructive to loops, nodes, and steps.

**Code rollback:** Revert `server/hazop-routes.ts` and the two new UI files.
Phase 2 schema, routes, and UI are unaffected by Phase 3 code removal.

---

## 17. Zero-Trust Audit Checklist — Phase 3

All 27 checks must pass before Phase 4 begins.

| # | Check |
|---|---|
| ZTA-1 | `POST /api/hazop/nodes/:nodeId/generate` exists and returns 200 with `{ generated, skipped, node_id, deviation_count }` |
| ZTA-2 | Calling generate twice on the same node with same steps produces no duplicate deviations (idempotent) |
| ZTA-3 | Deviation with `reviewed = true` is NOT overwritten on re-generation regardless of `forceRegen` value |
| ZTA-4 | Cause with `source = 'manual'` is NOT deleted or modified by re-generation |
| ZTA-5 | Library causes (`source = 'library'`) are NOT re-inserted for a deviation that already exists |
| ZTA-6 | `deviation_number` format matches `{node_reference}-D{nn:02d}` — e.g. `"1.1-D01"` |
| ZTA-7 | UNIQUE constraint `(node_id, guideword, parameter)` is never violated — concurrent generation inserts safely |
| ZTA-8 | `deviation.node_id` matches the nodeId from the generation request |
| ZTA-9 | `deviation.study_id` matches `node.study_id` (correctly denormalized) |
| ZTA-10 | `hazop_nodes.deviation_count` equals `COUNT(*) FROM hazop_deviations WHERE node_id = nodeId` after generation |
| ZTA-11 | `hazop_nodes.generated_at` is updated to NOW() after generation |
| ZTA-12 | `hazop_nodes.generated_by` is set to the authenticated user's id after generation |
| ZTA-13 | `POST .../generate` on a node with 0 steps → 400 |
| ZTA-14 | `POST .../generate` on a node in a non-draft study → 409 |
| ZTA-15 | KI-1 guard: `outlet_destination_ref` from a step with `outlet_destination = 'next_step'` is NOT used in any cause or description construction |
| ZTA-16 | Advisory lock prevents two simultaneous study-level generation calls from overlapping |
| ZTA-17 | Equipment aggregation is UNION-based: a node with steps `{Vessel, Pump}` receives deviations from BOTH Vessel and Pump library entries |
| ZTA-18 | Dominant equipment is used only for phrasing — the full deviation set is not reduced to dominant-only |
| ZTA-19 | `DELETE /api/hazop/nodes/:nodeId` cascades to `hazop_deviations` (existing FK CASCADE verified) |
| ZTA-20 | `PATCH /api/hazop/deviations/:id` with `reviewed = true` persists and survives a subsequent re-generation call |
| ZTA-21 | `GET /api/hazop/nodes/:nodeId/deviations` does NOT return soft-deleted causes/consequences/safeguards in child arrays |
| ZTA-22 | `POST .../causes` forces `source = 'manual'` regardless of body value |
| ZTA-23 | No step-level generation route exists (no `POST .../steps/:stepId/generate`) |
| ZTA-24 | `POST /api/hazop/studies/:studyId/generate` generates all nodes with steps, skips nodes with 0 steps |
| ZTA-25 | `deviation_description` contains the node_name (from `buildDeviationDescription` §7.2) |
| ZTA-26 | `hazop_nodes.action_count` is updated when an action is added, closed, or deleted |
| ZTA-27 | No study status transition route (`POST .../approve`, `.../release`, `.../submit`) exists in Phase 3 |

---

## 18. Phase 3 Test Plan

### 18.1 Generation Engine Tests

| Test | Input | Expected |
|---|---|---|
| T-G1 | Node with 1 Pump step → generate | 6 deviations created (No/Flow, More/Flow, Less/Flow, Reverse/Flow, More/Pressure, Less/Pressure) |
| T-G2 | Node with {Vessel, Vent} steps → generate | Union of Vessel (4) + Vent (0, no library) = 4 deviations |
| T-G3 | Node with {Pump, Heat Exchanger} steps → generate | Union of Pump (6) + HX (4) minus shared pairs = 9 unique pairs |
| T-G4 | Node with {Drain, Vent} steps only → generate | 0 deviations (no library entries for these categories), returns `{ generated: 0, skipped: 0 }` |
| T-G5 | Generate twice on same node | Second call: `{ generated: 0, skipped: N }` — no new rows |
| T-G6 | Mark one deviation reviewed, then regenerate | Reviewed deviation skipped, count does not change |
| T-G7 | forceRegen=true on non-reviewed deviation | deviation_description updated, causes NOT regenerated |
| T-G8 | forceRegen=true on reviewed deviation | Deviation skipped (protected) |
| T-G9 | Node with 0 steps → generate | 400 returned |
| T-G10 | Generate on non-draft study | 409 returned |

### 18.2 KI-1 Guard Tests

| Test | Input | Expected |
|---|---|---|
| T-KI1-1 | Last step has `outlet_destination = 'next_step'`, `outlet_destination_ref = '2.1.3'` | `exitRef = null` in generation context — ref not used in any description or cause |
| T-KI1-2 | Last step has `outlet_destination = 'specific_step'`, `outlet_destination_ref = '2.1.3'` | `exitRef = '2.1.3'` correctly used in generation context |
| T-KI1-3 | Last step has `outlet_destination = 'next_node'`, `outlet_destination_ref = '1.2.1'` | `exitRef = null` — ref not used |
| T-KI1-4 | Last step has `outlet_destination = 'recycle'`, `outlet_destination_ref = '1.1.1'` | `exitRef = '1.1.1'` correctly used |

### 18.3 Deviation CRUD Tests

| Test | Input | Expected |
|---|---|---|
| T-D1 | PATCH deviation: `reviewed = true` | `reviewed_by`, `reviewed_at` set |
| T-D2 | PATCH deviation: `is_credible = false` without reason | 400 |
| T-D3 | PATCH deviation: `is_credible = false` with reason | Row updated, reason stored |
| T-D4 | PATCH deviation: `is_credible = true` | `credibility_reason` cleared to NULL |
| T-D5 | PATCH deviation with `node_id` in body | `node_id` silently ignored |
| T-D6 | PATCH deviation with `guideword` in body | `guideword` silently ignored |
| T-D7 | DELETE deviation | Row deleted, node.deviation_count decremented |

### 18.4 Child CRUD Tests

| Test | Input | Expected |
|---|---|---|
| T-C1 | POST cause with `source = 'library'` in body | Stored with `source = 'manual'` (server override) |
| T-C2 | DELETE library cause | Soft delete: `deleted = true`, row retained |
| T-C3 | DELETE manual cause | Hard delete: row removed |
| T-C4 | GET deviations | Soft-deleted causes not in response |
| T-C5 | PATCH action with `status = 'closed'` without close_comments | 400 |
| T-C6 | PATCH action with `status = 'closed'` with close_comments | `closed_at = NOW()` set |
| T-C7 | PATCH action with `status = 'open'` | `closed_at` cleared to NULL |
| T-C8 | Action added/closed → `hazop_nodes.action_count` updated | Verified by GET nodes response |

### 18.5 Concurrency Test

| Test | Input | Expected |
|---|---|---|
| T-CON1 | Two simultaneous `POST .../generate` for same study | Second call returns 409 while first is in-progress |
| T-CON2 | Concurrent generate + delete step | Advisory lock ensures no torn read of step list |

### 18.6 Warning Badge Tests (KI-2 resolution)

| Test | Input | Expected |
|---|---|---|
| T-W1 | Add step seq=1 with category='Pump' (non-vessel-class) | Response contains `warnings: ['V1: First step should be vessel-class...']`. UI shows amber badge. |
| T-W2 | Edit step to category='Tank' | Response `warnings: []`. Amber badge cleared. |
| T-W3 | Add step with no equipment_tag, category='Pump' | Response contains `warnings: ['V3: Equipment tag recommended...']` |
| T-W4 | Last step of node with `outlet_destination = 'next_step'` | Response contains `warnings: ['V2: Last step outlet does not exit node...']` |

---

## 19. Dependency Map

Phase 3 has no dependency on any Phase outside Phase 2.
All required tables and FKs are in place.

```
Phase 2 (CLOSED) ──► Phase 3 (THIS PLAN)
                       │
                       ├── Reads: hazop_nodes, hazop_process_steps, hazop_process_loops,
                       │          hazop_studies, hazop_deviation_library
                       │
                       └── Writes: hazop_deviations, hazop_causes, hazop_consequences,
                                   hazop_safeguards, hazop_actions,
                                   hazop_nodes (deviation_count, action_count, generated_at, generated_by)
```

Phase 4 (Cause & Effect Matrix, Safety Functions) may not start until Phase 3 ZTA passes.

---

## 20. Open Questions (Non-Blocking — Must Be Resolved Before Implementation)

| # | Question | Impact |
|---|---|---|
| OQ-1 | Should a node be locked to further step edits after generation? (i.e. `generated_at IS NOT NULL AND status='draft'` → warn user before step change). | Affects Process Builder UX and generation re-trigger logic. Recommended: warn, not block. |
| OQ-2 | Should re-generation be automatic on step add/delete, or always explicit via the [Generate Node] button? | Affects UX. Recommendation: always explicit — prevents accidental destruction of reviewed deviations. |
| OQ-3 | `deviation_number` format is `{node_reference}-D{nn:02d}`. Should renumbering occur after deletion of a deviation? | Recommendation: no renumbering (same as sequence_no philosophy). Gaps are acceptable. |
| OQ-4 | Should the study-level `POST .../generate` skip nodes that are already fully reviewed? | Affects efficiency of re-runs. Recommendation: yes, skip fully-reviewed nodes by default unless `forceRegen=true`. |

---

## 21. Phase 4 Readiness Gate (For Reference)

Phase 4 (Cause & Effect Matrix, Safety Functions) may start only when:

1. All 27 Phase 3 ZTA checks pass.
2. At least one study has been generated with deviations.
3. The worksheet UI is operational.
4. OQ-1 through OQ-4 above have been answered and documented.
