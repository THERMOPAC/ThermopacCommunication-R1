# Operational Intelligence — Phase 1C Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT
**Date:** 22-May-2026
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)
**Phase 1B Baseline:** `docs/operational-intelligence-phase1b-execution.md` (COMPLETE)
**Phase 1C Scope:** RCA Framework, 5 Why, Fishbone, Failure Tree, RCA Workflow, RCA Approvals, RCA Assignments, RCA Evidence, RCA Audit Logs, RCA Dashboards, Similar Issue Intelligence, Cross-Issue Correlation, Root Cause Categorization
**Prepared by:** Architecture review session

---

## Governance Rules (Non-Negotiable — inherited from Phase 1A + 1B, extended here)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- All mutations write to `oi_audit_log`. Every field change on every RCA entity produces a `field_updated` or `status_changed` audit entry.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size.
- **All Phase 1A and Phase 1B server-side rules remain fully active.** Phase 1C does not modify or relax any prior rule.
- **No future-phase logic** (CAPA, SOP, ERP enforcement, AI agents, lessons learned, predictive analytics, legal hold, evidence integrity / SHA-256, AI governance) may appear in Phase 1C code. If in doubt, omit it.
- `similar` issue intelligence is pure DB query only — no OpenAI calls, no embeddings, no vector similarity.
- The `writeAuditLog` function from `server/oi-audit-service.ts` is the only permitted way to write to `oi_audit_log`. Do not write to `oi_audit_log` directly via raw SQL or Drizzle insert outside that function.

---

## Phase 1C Scope

### In Scope

| Area | Detail |
|---|---|
| RCA Record | One active RCA per issue. Fields: methodology, root cause code, root cause summary, contributing factors, immediate/underlying/systemic cause. |
| RCA Assignments | `assigned_to` (analyst conducting RCA), `reviewer_id`, `approver_id` — all FK → `users.id`. |
| RCA Workflow | Five states: `draft → submitted → under_review → approved` or `rejected`. Rejected → reopenable → `draft`. |
| RCA Approvals | Approve/reject actions restricted to SM+. Approver must not be the same user as `assigned_to`. Rejection requires a written reason. |
| 5 Why | Structured rows (1–5 levels) linked to the RCA record. Full-replace upsert. |
| Fishbone (Ishikawa) | Cause rows per 6M category (man, machine, material, method, measurement, environment). Create / edit / delete. |
| Failure Tree | Adjacency-list node tree with typed nodes (top_event, intermediate_event, basic_event, and_gate, or_gate). Create / update / delete. |
| RCA Evidence | File attachments stored as GCS path references. No SHA-256 integrity. No legal hold. Upload / list / delete. |
| RCA Audit Logs | All RCA mutations append to existing `oi_audit_log` table via `writeAuditLog`. |
| Root Cause Categorization | 15-code taxonomy stored as `root_cause_code` TEXT on the RCA record. Validated by Zod enum server-side. |
| Similar Issue Intelligence | `GET /api/oi/issues/:id/similar` — pure DB query returning other issues whose approved RCA shares the same `root_cause_code`. No AI. |
| Cross-Issue Correlation | Explicit bidirectional links between issues (4 link types). Create / list / delete. Manager+ to create; SM+ to delete. |
| RCA Dashboards | 4 new endpoints: completion rate, by-root-cause breakdown, time-to-RCA metrics, recurrence rate. |
| `oi_issues` additions | 2 new columns: `rca_required` (boolean), `rca_due_date` (timestamp). SM+ only to set. |

### Explicitly Excluded from Phase 1C

CAPA workflow, SOP review workflow, ERP enforcement workflow, AI agents, AI governance, lessons learned, predictive analytics, legal hold, evidence integrity / SHA-256 / cryptographic proof, OpenAI API calls, vector embeddings, semantic clustering, business continuity, commissioning checklists, insurance claim lifecycle management.

---

## 1. Root Cause Categorization Taxonomy

`root_cause_code` is a TEXT column validated server-side against this fixed set of 15 codes. The set is defined as a Zod enum constant in `server/oi-routes.ts`. No DB enum type — TEXT column with Zod server-side validation so future additions require no migration.

| Code | Label | Description |
|---|---|---|
| `DESIGN_ERROR` | Design Error | Engineering or design defect in drawings, specifications, or calculations |
| `MANUFACTURING_DEFECT` | Manufacturing Defect | Fabrication or production error, dimensional non-conformance |
| `MATERIAL_FAILURE` | Material Failure | Material quality failure, wrong grade, or substandard supply |
| `PROCESS_DEVIATION` | Process Deviation | Deviation from a documented standard process or procedure |
| `HUMAN_ERROR` | Human Error | Operator, technician, or engineer mistake not attributable to process gaps |
| `EQUIPMENT_FAILURE` | Equipment Failure | Equipment malfunction, breakdown, or calibration failure |
| `SUPPLIER_QUALITY` | Supplier Quality | Vendor or subcontractor quality failure |
| `SPECIFICATION_GAP` | Specification Gap | Missing, unclear, or contradictory specification or requirement |
| `COMMUNICATION_FAILURE` | Communication Failure | Breakdown in communication, handover, or documentation transfer |
| `ENVIRONMENTAL_FACTOR` | Environmental Factor | External environmental condition (temperature, humidity, contamination) |
| `SYSTEMIC_WEAKNESS` | Systemic Weakness | Organizational or system-level weakness enabling recurring failures |
| `INSPECTION_FAILURE` | Inspection Failure | Failure of incoming inspection, in-process inspection, or final QC |
| `MAINTENANCE_FAILURE` | Maintenance Failure | Inadequate or missed maintenance activity |
| `SOFTWARE_ERROR` | Software / Configuration Error | Software bug, misconfiguration, or firmware issue |
| `UNKNOWN` | Unknown | Root cause not yet determined; must be updated before RCA can be approved |

**Rule:** `root_cause_code = 'UNKNOWN'` blocks RCA approval. Server returns HTTP 422 if `approve` is called when `root_cause_code = 'UNKNOWN'`.

---

## 2. Schema Changes — New Tables

### 2.1 `oi_rca_records`

One active RCA record per issue. Uniqueness enforced by `UNIQUE(issue_id)`.

```sql
CREATE TABLE oi_rca_records (
  id                         SERIAL PRIMARY KEY,
  issue_id                   INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  methodology                TEXT NOT NULL CHECK (methodology IN ('five_why','fishbone','failure_tree','combined')),
  root_cause_code            TEXT NOT NULL DEFAULT 'UNKNOWN',
  root_cause_summary         TEXT NOT NULL DEFAULT '',
  contributing_factors       TEXT,
  immediate_cause            TEXT,
  underlying_cause           TEXT,
  systemic_cause             TEXT,
  assigned_to                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_id                INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status                     TEXT NOT NULL DEFAULT 'draft'
                               CHECK (status IN ('draft','submitted','under_review','approved','rejected')),
  submitted_at               TIMESTAMP,
  review_started_at          TIMESTAMP,
  approved_at                TIMESTAMP,
  rejected_at                TIMESTAMP,
  rejection_reason           TEXT,
  revision_number            INTEGER NOT NULL DEFAULT 1,
  created_by                 INTEGER NOT NULL REFERENCES users(id),
  created_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_oi_rca_one_per_issue UNIQUE (issue_id)
);

CREATE INDEX idx_oi_rca_records_issue_id  ON oi_rca_records(issue_id);
CREATE INDEX idx_oi_rca_records_status    ON oi_rca_records(status);
CREATE INDEX idx_oi_rca_records_root_cause ON oi_rca_records(root_cause_code);
CREATE INDEX idx_oi_rca_records_assigned  ON oi_rca_records(assigned_to);
```

**Field rules:**

| Field | Rule |
|---|---|
| `issue_id` | Required. Must reference an existing `oi_issues` record in status `classified`, `investigating`, `verified`, or `closed`. RCA cannot be created for issues in status `captured` or `withdrawn`. |
| `methodology` | Required at creation. Immutable once RCA is submitted. Only editable in `draft` or `rejected` state. |
| `root_cause_code` | Required. Must be one of the 15 taxonomy codes. Defaults to `UNKNOWN`. |
| `root_cause_summary` | Required at submission (min 20 chars). At creation, empty string is allowed. |
| `assigned_to` | Optional. If set, must be a user with role Manager, Senior Manager, General Manager, or Superuser. |
| `reviewer_id` | SM+ only to set. Nullable. |
| `approver_id` | SM+ only to set. Must not equal `assigned_to`. Nullable. |
| `status` | Transitions are strictly forward-only except for `rejected → draft` (via reopen). See Section 5. |
| `revision_number` | Starts at 1. Incremented by 1 server-side each time a rejected RCA is reopened. Never accepted from client. |
| `created_by` | Set server-side from `req.user.id`. Never accepted from client. |
| `updated_at` | Set server-side on every PATCH. Never accepted from client. |
| `submitted_at`, `review_started_at`, `approved_at`, `rejected_at` | Set server-side at the corresponding transition. Never accepted from client. |
| `rejection_reason` | Required (min 10 chars) when `reject` is called. Cleared (set NULL) when RCA is reopened. |

### 2.2 `oi_rca_five_why`

```sql
CREATE TABLE oi_rca_five_why (
  id           SERIAL PRIMARY KEY,
  rca_id       INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  why_level    INTEGER NOT NULL CHECK (why_level BETWEEN 1 AND 5),
  why_question TEXT NOT NULL,
  why_answer   TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_five_why_level UNIQUE (rca_id, why_level)
);

CREATE INDEX idx_oi_rca_five_why_rca_id ON oi_rca_five_why(rca_id);
```

**Field rules:**

- `why_level` — 1 = first why, 5 = fifth why. UNIQUE per `rca_id` — each level may appear at most once per RCA.
- `why_question` — min 5 chars.
- `why_answer` — min 5 chars.
- Rows only writable when RCA is in `draft` or `rejected` status. Attempting to write when `submitted`, `under_review`, or `approved` returns HTTP 409.
- The endpoint `POST /api/oi/issues/:id/rca/:rcaId/five-why` accepts the full set (array of up to 5 rows) and performs a **full replace** (DELETE existing rows + INSERT new set) within a single transaction.
- Minimum 1 row required. Maximum 5 rows. Rows must be consecutive starting from level 1 (levels 1, 2, 3 — not 1, 3, 5).
- Applicable only when `methodology` is `five_why` or `combined`.

### 2.3 `oi_rca_fishbone`

```sql
CREATE TABLE oi_rca_fishbone (
  id               SERIAL PRIMARY KEY,
  rca_id           INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (category IN ('man','machine','material','method','measurement','environment')),
  cause_description TEXT NOT NULL,
  is_primary_cause BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oi_rca_fishbone_rca_id ON oi_rca_fishbone(rca_id);
```

**Field rules:**

| Category | 6M Label |
|---|---|
| `man` | People / Human Factors |
| `machine` | Equipment / Machine |
| `material` | Materials / Parts |
| `method` | Process / Method |
| `measurement` | Measurement / Data |
| `environment` | Environment |

- `cause_description` — min 5 chars, max 500 chars.
- `is_primary_cause` — at most one row per RCA may have `is_primary_cause = TRUE`. Server enforces: if a new row is inserted or updated with `is_primary_cause = TRUE`, any existing row with `is_primary_cause = TRUE` on the same `rca_id` is set to `FALSE` in the same transaction.
- Create / edit / delete only when RCA is in `draft` or `rejected` status. HTTP 409 otherwise.
- No limit on number of rows per RCA. No minimum.
- Applicable only when `methodology` is `fishbone` or `combined`.

### 2.4 `oi_rca_failure_tree_nodes`

```sql
CREATE TABLE oi_rca_failure_tree_nodes (
  id             SERIAL PRIMARY KEY,
  rca_id         INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  parent_id      INTEGER REFERENCES oi_rca_failure_tree_nodes(id) ON DELETE CASCADE,
  node_type      TEXT NOT NULL CHECK (node_type IN ('top_event','intermediate_event','basic_event','and_gate','or_gate')),
  node_label     TEXT NOT NULL,
  node_note      TEXT,
  is_top_event   BOOLEAN NOT NULL DEFAULT FALSE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oi_rca_ftree_rca_id   ON oi_rca_failure_tree_nodes(rca_id);
CREATE INDEX idx_oi_rca_ftree_parent   ON oi_rca_failure_tree_nodes(parent_id);
```

**Node type rules:**

| `node_type` | `parent_id` | `is_top_event` | Description |
|---|---|---|---|
| `top_event` | NULL | TRUE | The single top-level failure event. Only one per RCA. |
| `intermediate_event` | required | FALSE | An intermediate failure caused by child events. |
| `basic_event` | required | FALSE | A leaf node — base cause, no children allowed. |
| `and_gate` | required | FALSE | Logic AND: all child events must occur. |
| `or_gate` | required | FALSE | Logic OR: any child event causes parent failure. |

- Only one `top_event` permitted per RCA. Server enforces: `INSERT` of a second `top_event` on the same `rca_id` returns HTTP 409.
- `basic_event` nodes must not have children. Server enforces on child creation: 422 if `parent_id` references a `basic_event`.
- `node_label` — min 3 chars, max 200 chars.
- `sequence_order` — integer for ordering siblings. Client-supplied. Default 0.
- Delete of a node cascades to all descendant nodes via `ON DELETE CASCADE` on the `parent_id` FK.
- Create / update / delete only when RCA is in `draft` or `rejected` status. HTTP 409 otherwise.
- Applicable only when `methodology` is `failure_tree` or `combined`.

### 2.5 `oi_rca_evidence`

```sql
CREATE TABLE oi_rca_evidence (
  id              SERIAL PRIMARY KEY,
  rca_id          INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  gcs_path        TEXT NOT NULL,
  file_size_bytes INTEGER,
  content_type    TEXT,
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oi_rca_evidence_rca_id ON oi_rca_evidence(rca_id);
```

**File rules:**

- Upload: `POST /api/oi/issues/:id/rca/:rcaId/evidence` — multipart form upload. Manager+ role required.
- GCS path pattern:
  - If the linked issue has a `project_id`: `TPEL/OI/{issue_id}/RCA/{rca_id}/{safe_filename}`
  - If the linked issue has no `project_id`: `TPEL/OI/UNLINKED/{issue_id}/RCA/{rca_id}/{safe_filename}`
  - `safe_filename` = original filename with spaces replaced by underscores and non-alphanumeric characters (except `.`, `-`, `_`) removed.
- Maximum file size: 25 MB. Server validates before GCS upload; returns HTTP 413 if exceeded.
- Allowed content types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`. All others return HTTP 415.
- No SHA-256 integrity hash. No legal hold. No immutability enforcement.
- Evidence files are uploadable when RCA status is `draft`, `submitted`, or `under_review`.
- Evidence files are readable (signed URL) at any status including `approved` and `rejected`.
- Evidence files are deletable only by the `uploaded_by` user or a SM+ user, and only when RCA status is `draft`, `submitted`, or `rejected`. Deletion when `under_review` or `approved` returns HTTP 409.
- Maximum 20 evidence files per RCA. Server returns HTTP 422 if limit exceeded.
- Signed URL generation: `GET /api/oi/issues/:id/rca/:rcaId/evidence/:evidenceId/signed-url` returns a 15-minute signed URL for direct download.

### 2.6 `oi_rca_similar_links`

Explicit bidirectional correlation table linking two issues sharing a common root cause or related cause pattern.

```sql
CREATE TABLE oi_rca_similar_links (
  id          SERIAL PRIMARY KEY,
  issue_id_a  INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  issue_id_b  INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  link_type   TEXT NOT NULL DEFAULT 'same_root_cause'
                CHECK (link_type IN ('same_root_cause','related_cause','recurrence','pattern')),
  link_note   TEXT,
  linked_by   INTEGER NOT NULL REFERENCES users(id),
  linked_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_link  CHECK (issue_id_a <> issue_id_b),
  CONSTRAINT uq_similar_pair UNIQUE (LEAST(issue_id_a, issue_id_b), GREATEST(issue_id_a, issue_id_b))
);

CREATE INDEX idx_oi_similar_links_a ON oi_rca_similar_links(issue_id_a);
CREATE INDEX idx_oi_similar_links_b ON oi_rca_similar_links(issue_id_b);
```

**Link type definitions:**

| `link_type` | Meaning |
|---|---|
| `same_root_cause` | Both issues share an identical root cause code and confirmed root cause |
| `related_cause` | Issues have related but not identical root causes |
| `recurrence` | Issue B is a recurrence of Issue A (same failure mode, later date) |
| `pattern` | Issues belong to a broader failure pattern (not a direct recurrence) |

**Rules:**
- `UNIQUE` constraint uses `LEAST`/`GREATEST` to enforce a canonical order — inserting A→B when B→A exists returns HTTP 409.
- `link_note` — optional, max 500 chars.
- Both referenced issue IDs must exist. Server validates before insert.
- `linked_by` set server-side from `req.user.id`. Never accepted from client.
- Create: Manager+ role. Delete: SM+ role. List: Manager+ role.

---

## 3. Schema Changes — `oi_issues` Additions (Phase 1C)

Only 2 new columns added to `oi_issues`. All other Phase 1C data lives in new tables.

```sql
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS rca_required  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rca_due_date  TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_oi_issues_rca_required ON oi_issues(rca_required);
```

**Rules:**
- `rca_required` — SM+ only to set. When `TRUE`, the issue register and detail page display an "RCA Required" badge. Dashboard completion rate denominator uses `rca_required = TRUE` issues.
- `rca_due_date` — SM+ only to set. If set and current timestamp exceeds `rca_due_date` and no approved RCA exists, the issue appears as "RCA Overdue" in the register and dashboard. Server does not auto-escalate — display only.
- Both fields are added to `ALLOWED_SM_FIELDS` in the existing PATCH handler.
- Both fields write a `field_updated` audit entry on change.

---

## 4. Drizzle ORM Schema Additions (`shared/schema.ts`)

### 4.1 New tables to add after the existing `oiIssues` definition

```typescript
// ─── Phase 1C: RCA Records ────────────────────────────────────────────────────
export const oiRcaRecords = pgTable('oi_rca_records', {
  id:                 serial('id').primaryKey(),
  issueId:            integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  methodology:        text('methodology').notNull(),
  rootCauseCode:      text('root_cause_code').notNull().default('UNKNOWN'),
  rootCauseSummary:   text('root_cause_summary').notNull().default(''),
  contributingFactors: text('contributing_factors'),
  immediateCause:     text('immediate_cause'),
  underlyingCause:    text('underlying_cause'),
  systemicCause:      text('systemic_cause'),
  assignedTo:         integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  reviewerId:         integer('reviewer_id').references(() => users.id, { onDelete: 'set null' }),
  approverId:         integer('approver_id').references(() => users.id, { onDelete: 'set null' }),
  status:             text('status').notNull().default('draft'),
  submittedAt:        timestamp('submitted_at'),
  reviewStartedAt:    timestamp('review_started_at'),
  approvedAt:         timestamp('approved_at'),
  rejectedAt:         timestamp('rejected_at'),
  rejectionReason:    text('rejection_reason'),
  revisionNumber:     integer('revision_number').notNull().default(1),
  createdBy:          integer('created_by').notNull().references(() => users.id),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaFiveWhy = pgTable('oi_rca_five_why', {
  id:           serial('id').primaryKey(),
  rcaId:        integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  whyLevel:     integer('why_level').notNull(),
  whyQuestion:  text('why_question').notNull(),
  whyAnswer:    text('why_answer').notNull(),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
});

export const oiRcaFishbone = pgTable('oi_rca_fishbone', {
  id:               serial('id').primaryKey(),
  rcaId:            integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  category:         text('category').notNull(),
  causeDescription: text('cause_description').notNull(),
  isPrimaryCause:   boolean('is_primary_cause').notNull().default(false),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaFailureTreeNodes = pgTable('oi_rca_failure_tree_nodes', {
  id:            serial('id').primaryKey(),
  rcaId:         integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  parentId:      integer('parent_id'),
  nodeType:      text('node_type').notNull(),
  nodeLabel:     text('node_label').notNull(),
  nodeNote:      text('node_note'),
  isTopEvent:    boolean('is_top_event').notNull().default(false),
  sequenceOrder: integer('sequence_order').notNull().default(0),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
});

export const oiRcaEvidence = pgTable('oi_rca_evidence', {
  id:            serial('id').primaryKey(),
  rcaId:         integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'cascade' }),
  fileName:      text('file_name').notNull(),
  gcsPath:       text('gcs_path').notNull(),
  fileSizeBytes: integer('file_size_bytes'),
  contentType:   text('content_type'),
  uploadedBy:    integer('uploaded_by').notNull().references(() => users.id),
  uploadedAt:    timestamp('uploaded_at').notNull().defaultNow(),
});

export const oiRcaSimilarLinks = pgTable('oi_rca_similar_links', {
  id:        serial('id').primaryKey(),
  issueIdA:  integer('issue_id_a').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  issueIdB:  integer('issue_id_b').notNull().references(() => oiIssues.id, { onDelete: 'cascade' }),
  linkType:  text('link_type').notNull().default('same_root_cause'),
  linkNote:  text('link_note'),
  linkedBy:  integer('linked_by').notNull().references(() => users.id),
  linkedAt:  timestamp('linked_at').notNull().defaultNow(),
});
```

**Notes:**
- `oiRcaFailureTreeNodes.parentId` — self-referential FK cannot be expressed in Drizzle without a circular reference. Declare as plain `integer('parent_id')` (no `.references()`) in Drizzle. The FK constraint is enforced by the SQL migration only.
- `users` table — verify it is exported from `shared/schema.ts` before referencing. If the export name differs (e.g. `systemUsers`), use the correct export name — do NOT define a duplicate table.

### 4.2 `oi_issues` additions to existing `oiIssues` `pgTable` definition

```typescript
// ─── Phase 1C: RCA Control Fields ────────────────────────────────────────────
rcaRequired:  boolean('rca_required').notNull().default(false),
rcaDueDate:   timestamp('rca_due_date'),
```

Add `rcaRequired` and `rcaDueDate` to the existing `insertOiIssueSchema` `.omit()` call — these are SM+ patched fields, not accepted at issue creation.

---

## 5. RCA Workflow — State Machine

### 5.1 States

| State | Description |
|---|---|
| `draft` | Initial state. RCA editable by assignee, creator, or Manager+. All methodology sub-tables writable. |
| `submitted` | Submitted for review. RCA record fields read-only. Sub-tables (5 Why, Fishbone, Failure Tree) read-only. Evidence upload still allowed. |
| `under_review` | SM+ is actively reviewing. All fields and sub-tables read-only. Evidence upload still allowed. |
| `approved` | Final approved state. Fully immutable. No edits of any kind permitted. Evidence upload NOT allowed. |
| `rejected` | SM+ rejected. Reopenable by assignee or creator. |

### 5.2 Permitted Transitions

| From | To | Trigger Endpoint | Role Gate | Conditions |
|---|---|---|---|---|
| `draft` | `submitted` | `POST …/submit` | Manager+ and (creator or assignee) | `root_cause_summary` ≥ 20 chars; `root_cause_code` set (not required to be non-UNKNOWN yet); at least 1 sub-table row if methodology is not `combined` |
| `submitted` | `under_review` | `POST …/start-review` | SM+ | None beyond role |
| `under_review` | `approved` | `POST …/approve` | SM+ and not the assignee | `root_cause_code` ≠ `UNKNOWN`; `root_cause_summary` ≥ 20 chars |
| `under_review` | `rejected` | `POST …/reject` | SM+ | `rejection_reason` ≥ 10 chars required in request body |
| `submitted` | `rejected` | `POST …/reject` | SM+ | `rejection_reason` ≥ 10 chars required in request body |
| `rejected` | `draft` | `POST …/reopen` | Manager+ and (creator or assignee) | Server increments `revision_number`; clears timestamps and `rejection_reason`; sets `status = 'draft'` |

All other transitions are forbidden. Any attempt returns HTTP 409 with message `"Transition not permitted from current state"`.

### 5.3 Segregation of Duty

- The user who calls `approve` must NOT be the same user as `assigned_to`. Server enforces: HTTP 422 if `req.user.id === rca.assignedTo`.
- If `assigned_to` is NULL, the segregation check is skipped (NULL is not a user).
- `reviewer_id` and `approver_id` may be the same user.
- The `reject` action has no segregation requirement — any SM+ may reject any RCA.

### 5.4 Audit Log Entries for Transitions

Every transition writes a single audit entry to `oi_audit_log` via `writeAuditLog`:

```typescript
writeAuditLog({
  issueId:    issue.id,
  userId:     req.user.id,
  action:     'status_changed',
  fieldName:  'rca_status',
  oldValue:   from,
  newValue:   to,
  metadata:   { rcaId: rca.id, revisionNumber: rca.revisionNumber }
});
```

---

## 6. API Routes — New File `server/oi-rca-routes.ts`

All routes are registered in `server/routes.ts` immediately after the existing OI routes block, under `ensureAuthenticated`. Prefix: `/api/oi`.

### 6.1 RCA CRUD

#### `POST /api/oi/issues/:id/rca`

Creates the RCA record for an issue. One per issue — HTTP 409 if one already exists.

**Role gate:** Manager+

**Request body (Zod-validated):**
```typescript
{
  methodology:      z.enum(['five_why','fishbone','failure_tree','combined']),
  rootCauseCode:    z.enum([...15 codes...]).optional().default('UNKNOWN'),
  rootCauseSummary: z.string().max(2000).optional().default(''),
  assignedTo:       z.number().int().positive().nullable().optional(),
}
```

**Server actions:**
1. Verify `oi_issues` record exists and belongs to a valid status (`classified`, `investigating`, `verified`, `closed`). 404 / 422 as appropriate.
2. Verify `assignedTo` user exists and has Manager+ role if provided.
3. Insert `oi_rca_records` with `status = 'draft'`, `revision_number = 1`, `created_by = req.user.id`.
4. Write audit log: `action = 'rca_created'`.
5. Return HTTP 201 with the created record.

#### `GET /api/oi/issues/:id/rca`

Returns the RCA record for an issue, including denormalised user display fields and sub-table row counts.

**Role gate:** Manager+

**Response:**
```typescript
{
  // all oi_rca_records fields
  assignedToName:     string | null,   // users.username for assigned_to
  reviewerName:       string | null,
  approverName:       string | null,
  createdByName:      string,
  fiveWhyCount:       number,          // COUNT from oi_rca_five_why
  fishboneCount:      number,          // COUNT from oi_rca_fishbone
  failureTreeCount:   number,          // COUNT from oi_rca_failure_tree_nodes
  evidenceCount:      number,          // COUNT from oi_rca_evidence
}
```

HTTP 404 if no RCA exists for this issue (not an error — caller checks for null).

#### `PATCH /api/oi/issues/:id/rca/:rcaId`

Updates RCA record fields. Only allowed when status is `draft` or `rejected`.

**Role gate:** Manager+ and (creator, assignee, or SM+)

**Allowed fields (Zod-validated):**
```typescript
rootCauseCode:       z.enum([...15 codes...]).optional(),
rootCauseSummary:    z.string().min(0).max(2000).optional(),
contributingFactors: z.string().max(2000).nullable().optional(),
immediateCause:      z.string().max(1000).nullable().optional(),
underlyingCause:     z.string().max(1000).nullable().optional(),
systemicCause:       z.string().max(1000).nullable().optional(),
assignedTo:          z.number().int().positive().nullable().optional(),
```

SM+ additionally allowed:
```typescript
reviewerId:          z.number().int().positive().nullable().optional(),
approverId:          z.number().int().positive().nullable().optional(),
```

**Immutable fields (never accepted in PATCH):** `id`, `issueId`, `status`, `methodology`, `revisionNumber`, `createdBy`, `createdAt`, `submittedAt`, `reviewStartedAt`, `approvedAt`, `rejectedAt`, `rejectionReason`.

`methodology` is immutable after creation. Server strips it from PATCH body silently.

Every changed field writes a `field_updated` audit entry.

#### `DELETE /api/oi/issues/:id/rca/:rcaId`

Deletes the entire RCA record and all sub-table rows (cascade).

**Role gate:** SM+

**Condition:** Only allowed when status is `draft`. HTTP 409 if status is anything else.

Writes audit log: `action = 'rca_deleted'`.

### 6.2 Workflow Transition Endpoints

All transition endpoints accept an empty body `{}` except `reject` which requires `rejection_reason`.

#### `POST /api/oi/issues/:id/rca/:rcaId/submit`

Transitions `draft → submitted`.

**Role gate:** Manager+ and (creator or assignee)

**Validations before transition:**
- `root_cause_summary` must be ≥ 20 chars.
- If `methodology` is `five_why`: at least 1 row in `oi_rca_five_why`.
- If `methodology` is `fishbone`: at least 1 row in `oi_rca_fishbone`.
- If `methodology` is `failure_tree`: at least 1 `top_event` node in `oi_rca_failure_tree_nodes`.
- If `methodology` is `combined`: at least 1 row in at least one sub-table.

Sets `submitted_at = NOW()`.

#### `POST /api/oi/issues/:id/rca/:rcaId/start-review`

Transitions `submitted → under_review`.

**Role gate:** SM+

Sets `review_started_at = NOW()`.

#### `POST /api/oi/issues/:id/rca/:rcaId/approve`

Transitions `under_review → approved`.

**Role gate:** SM+ and `req.user.id !== rca.assignedTo`

**Validations:**
- `root_cause_code` must NOT be `'UNKNOWN'`. HTTP 422 if it is.
- `root_cause_summary` must be ≥ 20 chars.

Sets `approved_at = NOW()`.

#### `POST /api/oi/issues/:id/rca/:rcaId/reject`

Transitions `submitted → rejected` or `under_review → rejected`.

**Role gate:** SM+

**Request body:**
```typescript
{ rejection_reason: z.string().min(10).max(1000) }
```

Sets `rejected_at = NOW()`, stores `rejection_reason`.

#### `POST /api/oi/issues/:id/rca/:rcaId/reopen`

Transitions `rejected → draft`.

**Role gate:** Manager+ and (creator or assignee)

Server actions:
1. Set `status = 'draft'`.
2. Increment `revision_number` by 1.
3. Clear `rejected_at`, `rejection_reason`, `submitted_at`, `review_started_at`.
4. Set `updated_at = NOW()`.
5. Write audit entry: `action = 'rca_reopened'`, `metadata: { revisionNumber: newRevisionNumber }`.

### 6.3 5 Why Endpoints

#### `GET /api/oi/issues/:id/rca/:rcaId/five-why`

Returns all rows ordered by `why_level` ASC.

**Role gate:** Manager+

#### `POST /api/oi/issues/:id/rca/:rcaId/five-why`

Full-replace: deletes all existing rows and inserts the submitted set within a single transaction.

**Role gate:** Manager+ and (creator or assignee)

**Condition:** RCA must be in `draft` or `rejected`. HTTP 409 otherwise.

**Request body:**
```typescript
z.array(z.object({
  whyLevel:    z.number().int().min(1).max(5),
  whyQuestion: z.string().min(5).max(500),
  whyAnswer:   z.string().min(5).max(500),
})).min(1).max(5)
```

**Validations:**
- All `whyLevel` values must be unique within the submitted array.
- Levels must be consecutive starting from 1 (e.g., [1, 2, 3] is valid; [1, 3] is not).

Writes a single audit entry: `action = 'five_why_updated'`, `metadata: { rowCount: n }`.

### 6.4 Fishbone Endpoints

#### `GET /api/oi/issues/:id/rca/:rcaId/fishbone`

Returns all rows ordered by `category`, then `id` ASC.

**Role gate:** Manager+

#### `POST /api/oi/issues/:id/rca/:rcaId/fishbone`

Adds one cause row.

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

**Request body:**
```typescript
{
  category:         z.enum(['man','machine','material','method','measurement','environment']),
  causeDescription: z.string().min(5).max(500),
  isPrimaryCause:   z.boolean().optional().default(false),
}
```

If `isPrimaryCause = true`, all other rows for this RCA with `is_primary_cause = true` are set to `false` in the same transaction.

Writes audit entry: `action = 'fishbone_cause_added'`.

#### `PATCH /api/oi/issues/:id/rca/:rcaId/fishbone/:causeId`

Updates one cause row.

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

Same body schema as POST (all fields optional). Same `isPrimaryCause` enforcement.

Writes audit entry: `action = 'fishbone_cause_updated'`.

#### `DELETE /api/oi/issues/:id/rca/:rcaId/fishbone/:causeId`

Deletes one cause row.

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

Writes audit entry: `action = 'fishbone_cause_deleted'`.

### 6.5 Failure Tree Endpoints

#### `GET /api/oi/issues/:id/rca/:rcaId/failure-tree`

Returns all nodes for the RCA ordered by `id` ASC. Client reconstructs the tree from `parent_id` adjacency.

**Role gate:** Manager+

#### `POST /api/oi/issues/:id/rca/:rcaId/failure-tree`

Adds one node.

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

**Request body:**
```typescript
{
  nodeType:      z.enum(['top_event','intermediate_event','basic_event','and_gate','or_gate']),
  nodeLabel:     z.string().min(3).max(200),
  parentId:      z.number().int().positive().nullable().optional(),
  nodeNote:      z.string().max(500).nullable().optional(),
  sequenceOrder: z.number().int().min(0).optional().default(0),
}
```

**Validations:**
- `top_event`: `parentId` must be null. Only one `top_event` per RCA. HTTP 409 if one already exists.
- Non-`top_event` nodes: `parentId` must be provided and must reference a node belonging to the same `rcaId`. HTTP 422 if not.
- `parentId` must not reference a `basic_event` node. HTTP 422 if so.

Sets `is_top_event = true` when `nodeType = 'top_event'`.

Writes audit entry: `action = 'failure_tree_node_added'`.

#### `PATCH /api/oi/issues/:id/rca/:rcaId/failure-tree/:nodeId`

Updates a node's `nodeLabel`, `nodeNote`, or `sequenceOrder`.

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

`nodeType` and `parentId` are immutable after creation. Strip silently from PATCH body.

Writes audit entry: `action = 'failure_tree_node_updated'`.

#### `DELETE /api/oi/issues/:id/rca/:rcaId/failure-tree/:nodeId`

Deletes the node and all descendant nodes (CASCADE via FK on `parent_id`).

**Role gate:** Manager+

**Condition:** RCA must be in `draft` or `rejected`.

Cannot delete the `top_event` node if other nodes exist — server checks: if node is `top_event` and child nodes exist, return HTTP 409 (`"Cannot delete top event while child nodes exist"`). Delete children first.

Writes audit entry: `action = 'failure_tree_node_deleted'`.

### 6.6 Evidence Endpoints

#### `GET /api/oi/issues/:id/rca/:rcaId/evidence`

Returns all evidence rows ordered by `uploaded_at` DESC.

**Role gate:** Manager+

#### `POST /api/oi/issues/:id/rca/:rcaId/evidence`

Upload a file to GCS and record the metadata.

**Role gate:** Manager+

**Condition:** RCA must be in `draft`, `submitted`, or `under_review`. HTTP 409 if `approved` or `rejected`.

**Implementation:** Use `multer` (already in project) with `memoryStorage()`. Server validates size and content type before GCS upload. Upload to GCS, then insert `oi_rca_evidence` row. If GCS upload fails, do not insert the DB row.

Writes audit entry: `action = 'rca_evidence_uploaded'`, `metadata: { fileName, fileSizeBytes }`.

#### `GET /api/oi/issues/:id/rca/:rcaId/evidence/:evidenceId/signed-url`

Returns a 15-minute signed read URL for the evidence file.

**Role gate:** Manager+

#### `DELETE /api/oi/issues/:id/rca/:rcaId/evidence/:evidenceId`

Deletes the evidence record. Does NOT delete the GCS object (soft delete pattern — GCS object remains for audit purposes but is no longer referenced).

**Role gate:** Manager+ and (uploader or SM+)

**Condition:** RCA must be in `draft`, `submitted`, or `rejected`. HTTP 409 if `under_review` or `approved`.

Writes audit entry: `action = 'rca_evidence_deleted'`, `metadata: { fileName }`.

### 6.7 Similar Issue Intelligence

#### `GET /api/oi/issues/:id/similar`

Returns other issues whose **approved** RCA shares the same `root_cause_code` as the current issue's RCA. Pure DB query — no OpenAI, no embeddings.

**Role gate:** Manager+

**Query logic:**

```sql
SELECT
  i.id,
  i.issue_number,
  i.title,
  i.category,
  i.status,
  i.severity,
  i.created_at,
  r.root_cause_code,
  r.root_cause_summary,
  r.approved_at
FROM oi_issues i
JOIN oi_rca_records r ON r.issue_id = i.id
WHERE r.root_cause_code = (
  SELECT root_cause_code FROM oi_rca_records WHERE issue_id = $issueId LIMIT 1
)
  AND r.status = 'approved'
  AND i.id <> $issueId
ORDER BY i.created_at DESC
LIMIT 20;
```

If the current issue has no RCA or its `root_cause_code` is `UNKNOWN`, returns an empty array (not an error).

**Response:**
```typescript
Array<{
  id:                number,
  issueNumber:       string,
  title:             string,
  category:          string,
  status:            string,
  severity:          string,
  createdAt:         string,
  rootCauseCode:     string,
  rootCauseSummary:  string,
  approvedAt:        string,
}>
```

### 6.8 Cross-Issue Correlation Endpoints

#### `GET /api/oi/issues/:id/correlations`

Returns all explicit links where `issue_id_a = :id OR issue_id_b = :id`, with denormalised display fields for the partner issue.

**Role gate:** Manager+

**Response:**
```typescript
Array<{
  id:              number,
  partnerIssueId:  number,
  partnerIssueNumber: string,
  partnerTitle:    string,
  partnerStatus:   string,
  partnerCategory: string,
  linkType:        string,
  linkNote:        string | null,
  linkedByName:    string,
  linkedAt:        string,
}>
```

#### `POST /api/oi/issues/:id/correlations`

Creates a bidirectional explicit link between two issues.

**Role gate:** Manager+

**Request body:**
```typescript
{
  partnerIssueId: z.number().int().positive(),
  linkType:       z.enum(['same_root_cause','related_cause','recurrence','pattern']),
  linkNote:       z.string().max(500).nullable().optional(),
}
```

**Validations:**
- `partnerIssueId` must exist in `oi_issues`. 422 if not.
- `partnerIssueId` must not equal the current issue ID. 422 if self-link.
- Pair must not already exist (in either direction). 409 if duplicate.

Server inserts with `issue_id_a = MIN(id, partnerIssueId)`, `issue_id_b = MAX(id, partnerIssueId)` to enforce canonical order.

Writes audit entry on the current issue: `action = 'correlation_link_created'`, `metadata: { partnerIssueId, linkType }`.

HTTP 201 on success.

#### `DELETE /api/oi/issues/:id/correlations/:linkId`

Removes an explicit link.

**Role gate:** SM+

Writes audit entry: `action = 'correlation_link_deleted'`.

### 6.9 Dashboard Endpoints

All registered under `/api/oi/dashboard/`. All require Manager+ unless specified.

#### `GET /api/oi/dashboard/rca-completion`

RCA completion rate across issues where `rca_required = TRUE`.

**Query params:**
- `periodDays` — integer, default 90, max 365.

**Response:**
```typescript
{
  totalRcaRequired:    number,   // COUNT of issues with rca_required = TRUE in period
  rcaDraftCount:       number,   // …with RCA in draft or no RCA yet
  rcaSubmittedCount:   number,
  rcaUnderReviewCount: number,
  rcaApprovedCount:    number,
  rcaRejectedCount:    number,
  noRcaCount:          number,   // rca_required = TRUE but no RCA record exists
  completionPct:       number,   // (rcaApprovedCount / totalRcaRequired) * 100 — 0 if denominator is 0
  overdueCount:        number,   // rca_required = TRUE, no approved RCA, rca_due_date < NOW()
}
```

#### `GET /api/oi/dashboard/rca-by-root-cause`

Issue counts grouped by `root_cause_code` where the issue has an **approved** RCA.

**Query params:**
- `periodDays` — integer, default 180, max 730.

**Response:**
```typescript
Array<{
  rootCauseCode:   string,
  rootCauseLabel:  string,   // derived from 15-code taxonomy — server maps code → label
  issueCount:      number,
  openCount:       number,   // issues not in closed/withdrawn
  avgMttrHours:    number | null,
}>
```

Sorted by `issueCount` descending. All 15 codes are included even if count is 0.

#### `GET /api/oi/dashboard/rca-time-to-complete`

Metrics on how long RCAs take to reach approved status.

**Query params:**
- `periodDays` — integer, default 90, max 365.

**Response:**
```typescript
{
  avgDaysToApproval:     number | null,  // AVG(approved_at - created_at) in days for approved RCAs
  medianDaysToApproval:  number | null,  // PERCENTILE_CONT(0.5) — Postgres window function
  minDaysToApproval:     number | null,
  maxDaysToApproval:     number | null,
  approvedInPeriod:      number,
  avgRevisionCount:      number | null,  // AVG(revision_number) for approved RCAs — higher = more rejections
  byMethodology: Array<{
    methodology:          string,
    avgDaysToApproval:    number | null,
    count:                number,
  }>,
}
```

**Implementation note:** Use PostgreSQL `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ...)` for median. This is supported in the existing Postgres version. Use `db.execute(sql\`...\`)` for this aggregate — Drizzle does not wrap window aggregates.

#### `GET /api/oi/dashboard/recurrence-rate`

Identifies root cause codes with recurring issues (issues sharing an approved RCA root cause code, ordered by frequency).

**Query params:**
- `minCount` — integer, default 2. Only return root causes with this many or more issues.
- `periodDays` — integer, default 365.

**Response:**
```typescript
Array<{
  rootCauseCode:    string,
  rootCauseLabel:   string,
  issueCount:       number,
  recurrenceCount:  number,   // issueCount - 1 (first occurrence is not a recurrence)
  earliestIssue:    string,   // ISO date
  latestIssue:      string,   // ISO date
  daysBetweenFirst: number,   // latestIssue - earliestIssue in days
  explicitLinkCount: number,  // COUNT of oi_rca_similar_links for this root cause code
}>
```

Sorted by `issueCount` descending.

---

## 7. Modified Existing API Endpoints

### 7.1 `GET /api/oi/issues` — Register Filter Additions

New optional query parameters stacked onto existing Phase 1A + 1B filters:

| Param | Type | Description |
|---|---|---|
| `rcaRequired` | boolean | Filter issues where `rca_required = TRUE` |
| `rcaOverdue` | boolean | Filter issues where `rca_required = TRUE`, no approved RCA, `rca_due_date < NOW()` |
| `rcaStatus` | `none` \| `draft` \| `submitted` \| `under_review` \| `approved` \| `rejected` | Filter by RCA status. `none` = `rca_required = TRUE` but no RCA record. |
| `rootCauseCode` | string | Filter by `root_cause_code` on linked approved RCA |

### 7.2 `GET /api/oi/issues/:id` — RCA Summary in Response

The issue detail response is extended with an `rcaSummary` object (always present, null if no RCA exists):

```typescript
rcaSummary: {
  id:              number,
  status:          string,
  methodology:     string,
  rootCauseCode:   string,
  rootCauseLabel:  string,
  revisionNumber:  number,
  assignedToName:  string | null,
  approvedAt:      string | null,
  fiveWhyCount:    number,
  fishboneCount:   number,
  failureTreeCount: number,
  evidenceCount:   number,
} | null
```

This summary is a LEFT JOIN — does not require a separate API call for the issue detail page.

---

## 8. Server-Side Enforcement Summary (Phase 1C)

Inherits all Phase 1A and Phase 1B rules. The following additional rules apply:

| Rule | Enforcement Point |
|---|---|
| RCA creation blocked for issues in status `captured` or `withdrawn` | POST handler — status check before INSERT |
| One RCA per issue — UNIQUE constraint on `issue_id` | DB constraint + 409 in POST handler |
| RCA status transitions strictly controlled — only permitted paths | Each transition endpoint validates current status |
| `approved → any` transition is forbidden | All transition endpoints reject if current status is `approved` |
| Sub-table writes blocked when RCA not in `draft` or `rejected` | Each sub-table write endpoint checks RCA status |
| 5 Why levels must be consecutive starting from 1 | POST handler array validation |
| Only one `top_event` node per failure tree | POST handler SELECT before INSERT |
| `basic_event` nodes cannot have children | POST failure-tree handler checks parent node type |
| Approval blocked if `root_cause_code = 'UNKNOWN'` | Approve endpoint — code check before transition |
| Approver cannot be the same user as `assigned_to` | Approve endpoint — user ID comparison |
| `revision_number` computed server-side only | Reopen handler — never accepted from client |
| All workflow timestamps set server-side only | Each transition handler — never accepted from client |
| Evidence upload blocked when RCA is `approved` or `rejected` | Evidence POST — status check |
| Evidence delete blocked when RCA is `under_review` or `approved` | Evidence DELETE — status check |
| Evidence max 20 files per RCA | Evidence POST — COUNT check before INSERT |
| Evidence file size max 25 MB | Multer `limits.fileSize` configuration |
| Evidence content type restricted to 7 allowed types | MIME type check before GCS upload |
| Fishbone `is_primary_cause` unique per RCA | Fishbone POST/PATCH — UPDATE existing rows in same transaction |
| Cross-issue self-link blocked | DB CHECK constraint + 422 in POST handler |
| Cross-issue duplicate link blocked | DB UNIQUE constraint + 409 in POST handler |
| `similar` endpoint uses only approved RCAs — never draft/rejected | SELECT WHERE `r.status = 'approved'` |
| `writeAuditLog` called for every RCA mutation | Every route handler — before `res.json()` |
| RCA data is Manager+ only — Employee and below cannot see RCA section | Role check at the top of every RCA route handler |

---

## 9. Validation Rules (Zod — `server/oi-rca-routes.ts`)

### 9.1 Create RCA Schema

```typescript
const createRcaSchema = z.object({
  methodology:      z.enum(['five_why','fishbone','failure_tree','combined']),
  rootCauseCode:    z.enum(ROOT_CAUSE_CODES).optional().default('UNKNOWN'),
  rootCauseSummary: z.string().max(2000).optional().default(''),
  assignedTo:       z.number().int().positive().nullable().optional(),
});
```

### 9.2 Patch RCA Schema

```typescript
const patchRcaSchema = z.object({
  rootCauseCode:       z.enum(ROOT_CAUSE_CODES).optional(),
  rootCauseSummary:    z.string().min(0).max(2000).optional(),
  contributingFactors: z.string().max(2000).nullable().optional(),
  immediateCause:      z.string().max(1000).nullable().optional(),
  underlyingCause:     z.string().max(1000).nullable().optional(),
  systemicCause:       z.string().max(1000).nullable().optional(),
  assignedTo:          z.number().int().positive().nullable().optional(),
  // SM+ only — validated separately before applying:
  reviewerId:          z.number().int().positive().nullable().optional(),
  approverId:          z.number().int().positive().nullable().optional(),
});
```

### 9.3 5 Why Schema

```typescript
const fiveWhyUpsertSchema = z.array(z.object({
  whyLevel:    z.number().int().min(1).max(5),
  whyQuestion: z.string().min(5).max(500),
  whyAnswer:   z.string().min(5).max(500),
})).min(1).max(5).refine(
  rows => {
    const levels = rows.map(r => r.whyLevel).sort((a, b) => a - b);
    return levels.every((v, i) => v === i + 1);
  },
  { message: 'why_level values must be consecutive starting from 1' }
);
```

### 9.4 Fishbone Schema

```typescript
const fishboneCauseSchema = z.object({
  category:         z.enum(['man','machine','material','method','measurement','environment']),
  causeDescription: z.string().min(5).max(500),
  isPrimaryCause:   z.boolean().optional().default(false),
});
```

### 9.5 Failure Tree Node Schema

```typescript
const failureTreeNodeSchema = z.object({
  nodeType:      z.enum(['top_event','intermediate_event','basic_event','and_gate','or_gate']),
  nodeLabel:     z.string().min(3).max(200),
  parentId:      z.number().int().positive().nullable().optional(),
  nodeNote:      z.string().max(500).nullable().optional(),
  sequenceOrder: z.number().int().min(0).optional().default(0),
});
```

### 9.6 Correlation Link Schema

```typescript
const correlationLinkSchema = z.object({
  partnerIssueId: z.number().int().positive(),
  linkType:       z.enum(['same_root_cause','related_cause','recurrence','pattern']),
  linkNote:       z.string().max(500).nullable().optional(),
});
```

### 9.7 Reject Schema

```typescript
const rejectSchema = z.object({
  rejection_reason: z.string().min(10).max(1000),
});
```

### 9.8 ROOT_CAUSE_CODES Constant

```typescript
const ROOT_CAUSE_CODES = [
  'DESIGN_ERROR','MANUFACTURING_DEFECT','MATERIAL_FAILURE','PROCESS_DEVIATION',
  'HUMAN_ERROR','EQUIPMENT_FAILURE','SUPPLIER_QUALITY','SPECIFICATION_GAP',
  'COMMUNICATION_FAILURE','ENVIRONMENTAL_FACTOR','SYSTEMIC_WEAKNESS',
  'INSPECTION_FAILURE','MAINTENANCE_FAILURE','SOFTWARE_ERROR','UNKNOWN',
] as const;

const ROOT_CAUSE_LABELS: Record<typeof ROOT_CAUSE_CODES[number], string> = {
  DESIGN_ERROR:           'Design Error',
  MANUFACTURING_DEFECT:   'Manufacturing Defect',
  MATERIAL_FAILURE:       'Material Failure',
  PROCESS_DEVIATION:      'Process Deviation',
  HUMAN_ERROR:            'Human Error',
  EQUIPMENT_FAILURE:      'Equipment Failure',
  SUPPLIER_QUALITY:       'Supplier Quality',
  SPECIFICATION_GAP:      'Specification Gap',
  COMMUNICATION_FAILURE:  'Communication Failure',
  ENVIRONMENTAL_FACTOR:   'Environmental Factor',
  SYSTEMIC_WEAKNESS:      'Systemic Weakness',
  INSPECTION_FAILURE:     'Inspection Failure',
  MAINTENANCE_FAILURE:    'Maintenance Failure',
  SOFTWARE_ERROR:         'Software / Configuration Error',
  UNKNOWN:                'Unknown',
};
```

This constant is defined once in `server/oi-rca-routes.ts` and imported by `server/routes.ts`. It is also duplicated in `client/src/pages/oi/oi-rca-constants.ts` for frontend use (no shared import — duplication is intentional to avoid server code leaking to client bundle).

---

## 10. UI Pages — New and Modified

### 10.1 New File: `client/src/pages/oi/oi-rca-constants.ts`

Client-side duplicate of `ROOT_CAUSE_CODES` and `ROOT_CAUSE_LABELS`, `METHODOLOGY_LABELS`, `FISHBONE_CATEGORY_LABELS`, `FAILURE_TREE_NODE_TYPE_LABELS`, `LINK_TYPE_LABELS`, `RCA_STATUS_LABELS`. No logic — constants only.

### 10.2 New File: `client/src/pages/oi/oi-rca-page.tsx`

Route: `/oi/issues/:id/rca`

Combined RCA page: renders the RCA form when status is `draft` or `rejected`, and an approved/read-only view otherwise. All RCA workflow action buttons (Submit, Start Review, Approve, Reject, Reopen) are rendered inline based on current status and user role.

**Layout:**

```
[ Issue Reference Banner ]  ← issue number, title, status chip (non-editable, links back to /oi/issues/:id)
[ RCA Status Header ]       ← status chip, revision number, methodology badge, assigned-to display

[ Tabs ]
  Overview | 5 Why | Fishbone | Failure Tree | Evidence | Similar Issues | Correlations
```

**Overview tab:**
- Root cause code (dropdown from 15 taxonomy codes — `<Select>` with `__none__` sentinel, same pattern as Phase 1B)
- Root cause summary (textarea, min 20 chars shown on submit)
- Contributing factors, immediate cause, underlying cause, systemic cause (textareas, optional)
- Assignment: Assigned To, Reviewer, Approver (user dropdowns, Manager+ roles only in list)
- Workflow action buttons:
  - `draft` → "Submit for Review" button (visible to creator / assignee)
  - `submitted` → "Start Review" button (SM+ only) + "Reject" button (SM+ only)
  - `under_review` → "Approve" button (SM+, not assignee) + "Reject" button (SM+)
  - `rejected` → "Reopen" button (creator / assignee) — displays `rejection_reason` in a red alert box
  - `approved` → read-only view with "Approved" banner, `approvedAt` timestamp

**5 Why tab:**
- Only active when `methodology = 'five_why'` or `'combined'`.
- 5 rows max. Add/remove rows (consecutive). Each row: Why Question + Why Answer inputs.
- "Save" button triggers full-replace POST.
- Read-only when RCA is not in `draft` / `rejected`.

**Fishbone tab:**
- Only active when `methodology = 'fishbone'` or `'combined'`.
- Six accordion sections (one per 6M category). Each section lists causes. "Add Cause" button opens inline form per category.
- Visual: "Primary Cause" star icon on the row with `isPrimaryCause = true`.
- Read-only when RCA is not in `draft` / `rejected`.

**Failure Tree tab:**
- Only active when `methodology = 'failure_tree'` or `'combined'`.
- Rendered as a collapsible tree (parent-child list, indented). Not a graphical canvas — plain indented list with expand/collapse.
- "Add Top Event" button visible when no top event exists.
- "Add Child Node" button on each non-`basic_event` node.
- Node chips show type icons: ⬡ top_event, ◈ intermediate_event, ● basic_event, ⊓ and_gate, ⊔ or_gate.
- Read-only when RCA is not in `draft` / `rejected`.
- Icons from `lucide-react` — use available icons, no new icon library.

**Evidence tab:**
- List of uploaded evidence files (file name, size, uploaded by, upload date, download link via signed URL).
- Upload area (file input, shows allowed types). Upload blocked via UI when RCA is `approved`.
- Delete button (uploader or SM+ — enforced server-side, UI hides for others).

**Similar Issues tab:**
- Fetches `GET /api/oi/issues/:id/similar`.
- Displays as a compact table: Issue Number, Title, Category, Status, Root Cause Code, Approved Date.
- Message "No similar issues found" if empty array.
- Message "Complete and approve this RCA first to see similar issues" if no approved RCA exists.

**Correlations tab:**
- List of explicit links with partner issue details and link type.
- "Link Issue" button opens a modal: issue number search input + link type dropdown + note.
- Delete button (SM+ only — enforced server-side).

### 10.3 Modified: `client/src/pages/oi/oi-issue-detail.tsx`

Add **RCA tab** to the existing tab set, between the current last tab and the Audit Log tab.

The RCA tab shows:
- If no RCA exists: "RCA Not Started" placeholder with "Start RCA" button (Manager+ only) — navigates to `/oi/issues/:id/rca`.
- If RCA exists: a read-only summary card (status, root cause code, root cause label, assigned to, revision number, approved date if approved) with a "View / Edit RCA" button linking to `/oi/issues/:id/rca`.
- `rcaSummary` data comes from the enriched `GET /api/oi/issues/:id` response — no extra API call.

Also add to the right panel:
- **RCA Required badge** — shown when `rca_required = TRUE`. Red badge.
- **RCA Due Date** — shown when `rca_due_date` is set. Orange if overdue, green if future. Formatted via `fmtDate`.
- **RCA Overdue badge** — red badge when `rca_required = TRUE`, no approved RCA, and `rca_due_date < now`.

### 10.4 Modified: `client/src/pages/oi/oi-issue-register.tsx`

**New filter additions:**
- "RCA Required" toggle (boolean)
- "RCA Overdue" toggle (boolean)
- "RCA Status" dropdown (`none | draft | submitted | under_review | approved | rejected`)
- "Root Cause" dropdown (populated from 15 taxonomy codes)

**New register column (opt-in via column selector):**
- "RCA" — shows RCA status chip (draft/submitted/under_review/approved/rejected/none). Only visible to Manager+.

**New badge in issue rows:**
- "RCA Req'd" chip on issues where `rca_required = TRUE` and RCA is not approved. Shown inline with the severity chip.

### 10.5 Modified: `client/src/pages/oi/oi-dashboard.tsx`

Add 4 new dashboard panels below the existing Phase 1B panels:

**RCA Completion Panel (Manager+):**
- Donut chart: Approved / Under Review / Submitted / Draft / No RCA — for `rca_required = TRUE` issues.
- Cards: Completion %, Overdue count.
- Data from `GET /api/oi/dashboard/rca-completion`.

**Root Cause Breakdown Panel (Manager+):**
- Horizontal bar chart: issue count by root cause code, last 180 days. Only codes with count > 0.
- Sorted by count descending. Bars colour-coded by recurrence risk (codes with `issueCount >= 3` shown in orange/red).
- Data from `GET /api/oi/dashboard/rca-by-root-cause`.

**RCA Time-to-Complete Panel (Manager+):**
- KPI cards: Avg Days to Approval, Median Days to Approval, Avg Revision Count.
- Small bar chart: by methodology (five_why / fishbone / failure_tree / combined) vs avg days.
- Data from `GET /api/oi/dashboard/rca-time-to-complete`.

**Recurrence Rate Panel (Manager+):**
- Table: Root Cause Code | Issue Count | First Occurrence | Last Occurrence | Days Between | Explicit Links.
- Sorted by issue count descending. Only codes with ≥ 2 issues shown.
- Data from `GET /api/oi/dashboard/recurrence-rate`.

Use `recharts` for all charts. No new charting libraries.

### 10.6 `client/src/App.tsx` — New Routes

Add two new routes:

```typescript
<Route path="/oi/issues/:id/rca" component={OiRcaPage} />
```

One route covers both create (no RCA exists) and edit/view (RCA exists). No separate "create" vs "detail" route.

Import: `import OiRcaPage from "@/pages/oi/oi-rca-page";`

---

## 11. File Changes

### New Files

| File | Purpose |
|---|---|
| `server/oi-rca-routes.ts` | All RCA API routes — CRUD, workflow transitions, sub-table CRUD, evidence, similar, correlations, dashboards |
| `client/src/pages/oi/oi-rca-page.tsx` | Combined RCA form / detail / approval page |
| `client/src/pages/oi/oi-rca-constants.ts` | Client-side taxonomy constants (ROOT_CAUSE_CODES, labels, methodology labels, etc.) |

### Modified Files

| File | Change |
|---|---|
| `shared/schema.ts` | Add 6 new table definitions; add `rcaRequired`, `rcaDueDate` to `oiIssues`; add both to `insertOiIssueSchema` `.omit()` |
| `server/routes.ts` | Import and register `oi-rca-routes.ts` after existing OI routes block |
| `server/oi-routes.ts` | Add `rcaRequired`, `rcaDueDate` to `ALLOWED_SM_FIELDS`; add `rcaSummary` join to `GET /api/oi/issues/:id`; add 4 new filter params to `GET /api/oi/issues` |
| `client/src/App.tsx` | Add `/oi/issues/:id/rca` route |
| `client/src/pages/oi/oi-issue-detail.tsx` | Add RCA tab; add RCA Required/Due Date/Overdue to right panel |
| `client/src/pages/oi/oi-issue-register.tsx` | Add 4 new filter params; add opt-in RCA status column; add "RCA Req'd" chip |
| `client/src/pages/oi/oi-dashboard.tsx` | Add 4 new dashboard panels |

### Unchanged Files (must not be touched)

`vite.config.ts`, `drizzle.config.ts`, `package.json`, `server/vite.ts`, `server/oi-audit-service.ts`, `server/oi-transition-service.ts`, `server/oi-escalation-service.ts`, `server/oi-scheduler.ts`. All non-OI route files.

---

## 12. Migration Script (psql direct SQL)

Run in this exact order. All statements use `IF NOT EXISTS` for idempotency.

```sql
-- ─── Step 1: oi_issues additions ─────────────────────────────────────────────
ALTER TABLE oi_issues
  ADD COLUMN IF NOT EXISTS rca_required  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rca_due_date  TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_oi_issues_rca_required ON oi_issues(rca_required);

-- ─── Step 2: oi_rca_records ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_records (
  id                    SERIAL PRIMARY KEY,
  issue_id              INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  methodology           TEXT NOT NULL CHECK (methodology IN ('five_why','fishbone','failure_tree','combined')),
  root_cause_code       TEXT NOT NULL DEFAULT 'UNKNOWN',
  root_cause_summary    TEXT NOT NULL DEFAULT '',
  contributing_factors  TEXT,
  immediate_cause       TEXT,
  underlying_cause      TEXT,
  systemic_cause        TEXT,
  assigned_to           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','submitted','under_review','approved','rejected')),
  submitted_at          TIMESTAMP,
  review_started_at     TIMESTAMP,
  approved_at           TIMESTAMP,
  rejected_at           TIMESTAMP,
  rejection_reason      TEXT,
  revision_number       INTEGER NOT NULL DEFAULT 1,
  created_by            INTEGER NOT NULL REFERENCES users(id),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_oi_rca_one_per_issue UNIQUE (issue_id)
);

CREATE INDEX IF NOT EXISTS idx_oi_rca_records_issue_id   ON oi_rca_records(issue_id);
CREATE INDEX IF NOT EXISTS idx_oi_rca_records_status     ON oi_rca_records(status);
CREATE INDEX IF NOT EXISTS idx_oi_rca_records_root_cause ON oi_rca_records(root_cause_code);
CREATE INDEX IF NOT EXISTS idx_oi_rca_records_assigned   ON oi_rca_records(assigned_to);

-- ─── Step 3: oi_rca_five_why ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_five_why (
  id           SERIAL PRIMARY KEY,
  rca_id       INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  why_level    INTEGER NOT NULL CHECK (why_level BETWEEN 1 AND 5),
  why_question TEXT NOT NULL,
  why_answer   TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_five_why_level UNIQUE (rca_id, why_level)
);

CREATE INDEX IF NOT EXISTS idx_oi_rca_five_why_rca_id ON oi_rca_five_why(rca_id);

-- ─── Step 4: oi_rca_fishbone ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_fishbone (
  id               SERIAL PRIMARY KEY,
  rca_id           INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  category         TEXT NOT NULL CHECK (category IN ('man','machine','material','method','measurement','environment')),
  cause_description TEXT NOT NULL,
  is_primary_cause BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oi_rca_fishbone_rca_id ON oi_rca_fishbone(rca_id);

-- ─── Step 5: oi_rca_failure_tree_nodes ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_failure_tree_nodes (
  id             SERIAL PRIMARY KEY,
  rca_id         INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  parent_id      INTEGER REFERENCES oi_rca_failure_tree_nodes(id) ON DELETE CASCADE,
  node_type      TEXT NOT NULL CHECK (node_type IN ('top_event','intermediate_event','basic_event','and_gate','or_gate')),
  node_label     TEXT NOT NULL,
  node_note      TEXT,
  is_top_event   BOOLEAN NOT NULL DEFAULT FALSE,
  sequence_order INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oi_rca_ftree_rca_id ON oi_rca_failure_tree_nodes(rca_id);
CREATE INDEX IF NOT EXISTS idx_oi_rca_ftree_parent ON oi_rca_failure_tree_nodes(parent_id);

-- ─── Step 6: oi_rca_evidence ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_evidence (
  id              SERIAL PRIMARY KEY,
  rca_id          INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE CASCADE,
  file_name       TEXT NOT NULL,
  gcs_path        TEXT NOT NULL,
  file_size_bytes INTEGER,
  content_type    TEXT,
  uploaded_by     INTEGER NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oi_rca_evidence_rca_id ON oi_rca_evidence(rca_id);

-- ─── Step 7: oi_rca_similar_links ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oi_rca_similar_links (
  id         SERIAL PRIMARY KEY,
  issue_id_a INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  issue_id_b INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE CASCADE,
  link_type  TEXT NOT NULL DEFAULT 'same_root_cause'
               CHECK (link_type IN ('same_root_cause','related_cause','recurrence','pattern')),
  link_note  TEXT,
  linked_by  INTEGER NOT NULL REFERENCES users(id),
  linked_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_link    CHECK (issue_id_a <> issue_id_b),
  CONSTRAINT uq_similar_pair UNIQUE (LEAST(issue_id_a, issue_id_b), GREATEST(issue_id_a, issue_id_b))
);

CREATE INDEX IF NOT EXISTS idx_oi_similar_links_a ON oi_rca_similar_links(issue_id_a);
CREATE INDEX IF NOT EXISTS idx_oi_similar_links_b ON oi_rca_similar_links(issue_id_b);
```

**Verification query after migration:**

```sql
-- Verify all 6 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'oi_rca_records','oi_rca_five_why','oi_rca_fishbone',
    'oi_rca_failure_tree_nodes','oi_rca_evidence','oi_rca_similar_links'
  )
ORDER BY table_name;
-- Expected: 6 rows

-- Verify oi_issues additions
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'oi_issues'
  AND column_name IN ('rca_required','rca_due_date')
ORDER BY column_name;
-- Expected: 2 rows
```

---

## 13. Rollback Strategy

Phase 1C introduces 6 new tables and 2 new columns on `oi_issues`. Rollback:

**Step 1 — Remove new API code:** Delete `server/oi-rca-routes.ts`. Remove the `require/import` and registration line from `server/routes.ts`. Revert the 4 modified API endpoints in `server/oi-routes.ts` (remove `rcaSummary` join, remove 4 new filter params, remove 2 SM+ fields from `ALLOWED_SM_FIELDS`).

**Step 2 — Remove UI additions:** Delete `client/src/pages/oi/oi-rca-page.tsx` and `client/src/pages/oi/oi-rca-constants.ts`. Revert modifications to `oi-issue-detail.tsx`, `oi-issue-register.tsx`, `oi-dashboard.tsx`. Remove the 2 routes from `App.tsx`.

**Step 3 — Drop tables and columns** (only if data loss is acceptable and approved by GM):

```sql
DROP TABLE IF EXISTS oi_rca_similar_links;
DROP TABLE IF EXISTS oi_rca_evidence;
DROP TABLE IF EXISTS oi_rca_failure_tree_nodes;
DROP TABLE IF EXISTS oi_rca_fishbone;
DROP TABLE IF EXISTS oi_rca_five_why;
DROP TABLE IF EXISTS oi_rca_records;

ALTER TABLE oi_issues
  DROP COLUMN IF EXISTS rca_required,
  DROP COLUMN IF EXISTS rca_due_date;
```

---

## 14. Zero-Trust Checklist (Pre-Implementation)

Before implementation begins, the implementer must confirm each item:

| # | Item | Confirm |
|---|---|---|
| 1 | `users` table export name verified in `shared/schema.ts` before using in new table definitions | ☐ |
| 2 | `oiIssues` table definition located; `rcaRequired` and `rcaDueDate` appended inside the existing `pgTable` call, not as a new table | ☐ |
| 3 | `writeAuditLog` function signature confirmed from `server/oi-audit-service.ts` before calling | ☐ |
| 4 | Existing multer setup in project verified before adding evidence upload routes | ☐ |
| 5 | GCS client and signed URL generation pattern verified from an existing route before implementing evidence endpoints | ☐ |
| 6 | `recharts` confirmed present in `package.json` before using in dashboard panels | ☐ |
| 7 | All 6 SQL tables created and verified (6-row result on verification query) before implementing any API routes | ☐ |
| 8 | `oi_rca_failure_tree_nodes.parent_id` FK declared as plain `integer('parent_id')` in Drizzle (no `.references()`) to avoid circular reference | ☐ |
| 9 | `ROOT_CAUSE_CODES` constant defined once in `server/oi-rca-routes.ts` and duplicated (not imported) in `client/src/pages/oi/oi-rca-constants.ts` | ☐ |
| 10 | No OpenAI API calls in any Phase 1C route | ☐ |
| 11 | No SHA-256 or content hash in evidence upload handler | ☐ |
| 12 | No CAPA, SOP, lessons learned, or legal hold fields or logic anywhere in Phase 1C code | ☐ |
| 13 | All new `<Select>` components use `value="__none__"` sentinel — no `value=""` anywhere | ☐ |
| 14 | `PERCENTILE_CONT` used via `db.execute(sql\`...\`)` — not via Drizzle ORM wrappers | ☐ |
| 15 | `uq_similar_pair UNIQUE(LEAST(...), GREATEST(...))` verified supported in Postgres version in use | ☐ |
