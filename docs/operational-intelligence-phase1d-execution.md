# Operational Intelligence — Phase 1D Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT
**Date:** 22-May-2026
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)
**Phase 1B Baseline:** `docs/operational-intelligence-phase1b-execution.md` (COMPLETE)
**Phase 1C Baseline:** `docs/operational-intelligence-phase1c-execution.md` (COMPLETE)
**Phase 1D Scope:** CAPA Framework — Corrective and Preventive Actions, CAPA Workflow, CAPA Assignments, CAPA Approvals, CAPA Effectiveness Review, CAPA Dashboards, CAPA SLA Tracking, CAPA Audit Logs, CAPA Linkage to RCA, CAPA Closure Validation
**Prepared by:** Architecture review session

---

## Governance Rules (Non-Negotiable — inherited from Phase 1A + 1B + 1C, extended here)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- All mutations write to `oi_audit_log`. Every field change on every CAPA entity produces a `field_updated` or `status_changed` audit entry.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size.
- **All Phase 1A, 1B, and 1C server-side rules remain fully active.** Phase 1D does not modify or relax any prior rule.
- **No future-phase logic** (SOP review workflow, ERP enforcement, AI agents, lessons learned, predictive analytics, legal hold, evidence integrity / SHA-256, AI governance) may appear in Phase 1D code. If in doubt, omit it.
- The `writeAuditLog` function from `server/oi-audit-service.ts` is the only permitted way to write to `oi_audit_log`.
- CAPA numbers are server-assigned. Never accepted from client.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.
- `MANAGER_ROLES` = `['manager','senior_manager','general_manager','superuser']`.
- `SM_ROLES` = `['senior_manager','general_manager','superuser']`.

---

## Phase 1D Scope

### In Scope

| Area | Detail |
|---|---|
| CAPA Record | One or more CAPAs per issue. CAPAs may be linked to an approved RCA or created standalone (no RCA linkage required). |
| CAPA Type | `corrective`, `preventive`, or `combined`. Immutable once CAPA is opened. |
| CAPA Numbering | Server-assigned at creation. Format: `CAPA-{YYYY}-{NNN}` (year of creation, NNN = 3-digit zero-padded global sequence within that year). |
| CAPA Priority | `critical`, `high`, `medium`, `low`. Settable at creation and editable in `draft` or `open` state. |
| CAPA Workflow | Seven states: `draft → open → in_progress → pending_verification → effectiveness_review → closed`. Cancelled path: any pre-closed state → `cancelled`. Re-open path: `effectiveness_review → in_progress`. |
| CAPA Assignments | `assigned_to` (implementer), `verifier_id`, `approver_id` — all FK → `users.id`. |
| CAPA Action Items | Sub-tasks within a CAPA. Each has its own assignment, due date, and completion status. Gate: all action items must be `completed` or `cancelled` before transitioning to `pending_verification`. |
| CAPA Approvals | `open` transition: Manager+. `effectiveness_review` transition (from `pending_verification`): Manager+. `closed` transition: SM+. `cancelled` transition: SM+. |
| CAPA Effectiveness Review | Structured record per review cycle. Fields: score (1–5), is_effective (boolean), recurrence_observed, evidence_notes, recommendation. Gate: at least one review with `is_effective = TRUE` required before `closed` transition. |
| CAPA SLA Tracking | `due_date` on the CAPA record. `is_overdue` computed server-side (due_date < now AND status not in `closed`/`cancelled`). Overdue badge on register and detail page. `extended_due_date` field (SM+ only to set). |
| CAPA Audit Logs | All CAPA mutations append to existing `oi_audit_log` via `writeAuditLog`. |
| CAPA Linkage to RCA | Optional FK `rca_id` on `oi_capa_records`. RCA page shows "Linked CAPA" summary card when RCA is approved. Issue detail page shows CAPA summary card. |
| CAPA Closure Validation | Server-side gate: `closed` transition requires `is_effective = TRUE` in at least one effectiveness review record for this CAPA. |
| CAPA Global Register | New page `/oi/capa` listing all CAPAs across all issues, with filters. |
| CAPA Dashboards | 4 new dashboard panels: CAPA Summary, CAPA by Type, CAPA SLA Adherence, Effectiveness Rate. |

### Explicitly Excluded from Phase 1D

SOP review workflow, ERP enforcement workflow, AI agents, AI governance, lessons learned, predictive analytics, legal hold, evidence integrity / SHA-256 / cryptographic proof, OpenAI API calls, vector embeddings, business continuity, commissioning checklists, insurance claim lifecycle, CAPA evidence file attachments (Phase 1E), CAPA email notifications (future phase), SLA auto-escalation (display only — no auto-status changes).

---

## 1. CAPA Numbering

- Format: `CAPA-{YYYY}-{NNN}` where `YYYY` = 4-digit year of creation (IST) and `NNN` = 3-digit zero-padded global sequence within that calendar year.
- `NNN` starts at `001` for the first CAPA of each year and increments globally (not per-issue, not per-type).
- Sequence is computed server-side using `SELECT COUNT(*) FROM oi_capa_records WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = {year}` + 1, wrapped in a `pg_advisory_xact_lock` to prevent duplicate assignment under concurrent creation.
- `capa_number` is stored as TEXT on the record. Immutable once set.
- Example: `CAPA-2026-001`, `CAPA-2026-042`, `CAPA-2027-001`.

---

## 2. Schema Changes — New Tables

### 2.1 `oi_capa_records`

One CAPA record per corrective or preventive action. Multiple CAPAs per issue are permitted.

```sql
CREATE TABLE oi_capa_records (
  id                        SERIAL PRIMARY KEY,
  capa_number               TEXT NOT NULL UNIQUE,
  issue_id                  INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE RESTRICT,
  rca_id                    INTEGER REFERENCES oi_rca_records(id) ON DELETE SET NULL,
  capa_type                 TEXT NOT NULL
                              CHECK (capa_type IN ('corrective','preventive','combined')),
  title                     TEXT NOT NULL,
  description               TEXT NOT NULL,
  root_cause_ref            TEXT,
  priority                  TEXT NOT NULL DEFAULT 'medium'
                              CHECK (priority IN ('critical','high','medium','low')),
  assigned_to               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verifier_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_id               INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status                    TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','open','in_progress',
                                'pending_verification','effectiveness_review',
                                'closed','cancelled')),
  due_date                  TIMESTAMP,
  extended_due_date         TIMESTAMP,
  opened_at                 TIMESTAMP,
  in_progress_at            TIMESTAMP,
  pending_verification_at   TIMESTAMP,
  effectiveness_review_at   TIMESTAMP,
  closed_at                 TIMESTAMP,
  cancelled_at              TIMESTAMP,
  cancellation_reason       TEXT,
  re_open_count             INTEGER NOT NULL DEFAULT 0,
  created_by                INTEGER NOT NULL REFERENCES users(id),
  created_at                TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oi_capa_records_issue_id   ON oi_capa_records(issue_id);
CREATE INDEX idx_oi_capa_records_rca_id     ON oi_capa_records(rca_id);
CREATE INDEX idx_oi_capa_records_status     ON oi_capa_records(status);
CREATE INDEX idx_oi_capa_records_assigned   ON oi_capa_records(assigned_to);
CREATE INDEX idx_oi_capa_records_due_date   ON oi_capa_records(due_date);
CREATE INDEX idx_oi_capa_records_priority   ON oi_capa_records(priority);
```

**Field rules:**

| Field | Rule |
|---|---|
| `capa_number` | Server-assigned at creation. Format `CAPA-{YYYY}-{NNN}`. Immutable. Never accepted from client. |
| `issue_id` | Required. Must reference an existing `oi_issues` record. Issue must not be in status `withdrawn`. |
| `rca_id` | Optional. If provided, must reference an `oi_rca_records` record whose `issue_id` matches `issue_id`. Server validates match — cross-issue linkage is rejected with HTTP 422. |
| `capa_type` | Required at creation. Immutable once status transitions from `draft` to `open`. Only editable in `draft`. |
| `title` | Required. Min 5 chars, max 200 chars. |
| `description` | Required at creation (min 10 chars). Editable in `draft`, `open`, `in_progress`. Read-only from `pending_verification` onward. |
| `root_cause_ref` | Optional. Free-text description of the root cause being addressed. Max 500 chars. |
| `priority` | Required. Default `medium`. Editable in `draft` or `open` only. |
| `assigned_to` | Optional. If set, must be a user with role Manager+. Editable in `draft`, `open`, `in_progress`. |
| `verifier_id` | Manager+ only to set. Nullable. Editable in `draft`, `open`, `in_progress`. |
| `approver_id` | SM+ only to set. Nullable. Must not equal `assigned_to`. Editable in any pre-closed state. |
| `status` | Transitions are strictly governed — see Section 4. Never accepted raw from client. |
| `due_date` | Optional. SM+ only to set. If set and `status` not in `closed`/`cancelled` and `due_date` < NOW(), the CAPA is considered overdue. |
| `extended_due_date` | SM+ only to set. If set, overdue is computed against `extended_due_date` instead of `due_date`. |
| `opened_at` | Set server-side when `open` transition fires. Immutable once set. |
| `in_progress_at` | Set server-side when `in_progress` transition fires. |
| `pending_verification_at` | Set server-side when `pending_verification` transition fires. |
| `effectiveness_review_at` | Set server-side when `effectiveness_review` transition fires. Updated on re-open cycles too. |
| `closed_at` | Set server-side when `closed` transition fires. Immutable. |
| `cancelled_at` | Set server-side when `cancelled` transition fires. Immutable. |
| `cancellation_reason` | Required (min 10 chars) when `cancel` transition is called. |
| `re_open_count` | Incremented by 1 server-side each time `effectiveness_review → in_progress` re-open occurs. Never accepted from client. |
| `created_by` | Set server-side from `req.user.id`. Never accepted from client. |
| `updated_at` | Set server-side on every PATCH. Never accepted from client. |

---

### 2.2 `oi_capa_actions`

Individual action items within a CAPA. Each CAPA may have 0 to 20 action items.

```sql
CREATE TABLE oi_capa_actions (
  id               SERIAL PRIMARY KEY,
  capa_id          INTEGER NOT NULL REFERENCES oi_capa_records(id) ON DELETE CASCADE,
  action_no        INTEGER NOT NULL,
  description      TEXT NOT NULL,
  assigned_to      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date         TIMESTAMP,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','completed','cancelled')),
  completed_at     TIMESTAMP,
  completed_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completion_note  TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_capa_action_no UNIQUE (capa_id, action_no)
);

CREATE INDEX idx_oi_capa_actions_capa_id     ON oi_capa_actions(capa_id);
CREATE INDEX idx_oi_capa_actions_assigned    ON oi_capa_actions(assigned_to);
```

**Field rules:**

| Field | Rule |
|---|---|
| `action_no` | Server-assigned sequential integer starting at 1 per CAPA. `SELECT MAX(action_no) FROM oi_capa_actions WHERE capa_id = {id}` + 1 at creation time. Never accepted from client. |
| `description` | Required. Min 5 chars, max 500 chars. |
| `assigned_to` | Optional. Any valid user. |
| `due_date` | Optional. No enforcement if exceeded — display only. |
| `status` | `open` is the default. Transitions: `open → completed` (via complete endpoint), `open → cancelled` (via cancel endpoint). No reverse transitions. |
| `completed_at` | Set server-side when `complete` action fires. |
| `completed_by` | Set server-side from `req.user.id` when `complete` action fires. |
| `completion_note` | Optional. Max 1000 chars. Accepted on the `complete` request body. |
| `created_by` | Set server-side from `req.user.id`. |
| Create/edit rule | Action items creatable and editable (description, assigned_to, due_date) only when CAPA status is `draft`, `open`, or `in_progress`. |
| Completion rule | `complete` action permitted when CAPA status is `in_progress` or `pending_verification`. Permitted by the assigned user or any Manager+. |
| Cancel rule | `cancel` action permitted when CAPA status is `draft`, `open`, or `in_progress`. Manager+ only. |
| Delete rule | SM+ only. Only when CAPA status is `draft` or `open` and action status is `open`. |
| Maximum | 20 action items per CAPA. HTTP 422 if limit exceeded. |
| Gate | `pending_verification` transition on the CAPA is blocked (HTTP 409) if any action item is in `open` status. All action items must be `completed` or `cancelled`. |

---

### 2.3 `oi_capa_effectiveness`

One effectiveness review record per review cycle per CAPA. Review cycles increment each time a CAPA is re-opened from `effectiveness_review`.

```sql
CREATE TABLE oi_capa_effectiveness (
  id                   SERIAL PRIMARY KEY,
  capa_id              INTEGER NOT NULL REFERENCES oi_capa_records(id) ON DELETE CASCADE,
  review_cycle         INTEGER NOT NULL DEFAULT 1,
  reviewer_id          INTEGER NOT NULL REFERENCES users(id),
  reviewed_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  effectiveness_score  INTEGER NOT NULL CHECK (effectiveness_score BETWEEN 1 AND 5),
  is_effective         BOOLEAN NOT NULL,
  recurrence_observed  BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_notes       TEXT,
  recommendation       TEXT,
  CONSTRAINT uq_capa_effectiveness_cycle UNIQUE (capa_id, review_cycle)
);

CREATE INDEX idx_oi_capa_effectiveness_capa_id ON oi_capa_effectiveness(capa_id);
```

**Field rules:**

| Field | Rule |
|---|---|
| `review_cycle` | Server-assigned. Equals `re_open_count + 1` at time of record creation. Never accepted from client. |
| `reviewer_id` | Set server-side from `req.user.id`. SM+ role required to post an effectiveness review. |
| `reviewed_at` | Set server-side to NOW(). |
| `effectiveness_score` | Required. Integer 1–5. Scale: 1 = Completely Ineffective, 2 = Marginally Effective, 3 = Partially Effective, 4 = Mostly Effective, 5 = Fully Effective. |
| `is_effective` | Required. Boolean. If `FALSE`, the reviewer must provide `recommendation` (min 10 chars). |
| `recurrence_observed` | Required. Boolean. If `TRUE` and `is_effective = TRUE`, server returns HTTP 422 — these are contradictory. |
| `evidence_notes` | Optional. Max 2000 chars. |
| `recommendation` | Required when `is_effective = FALSE`. Min 10 chars. Max 1000 chars. |
| Create rule | Permitted only when CAPA status is `effectiveness_review`. SM+ only. |
| UNIQUE per cycle | One review per `review_cycle`. Attempting to insert a second record for the same cycle returns HTTP 409. |
| Closure gate | `closed` transition blocked until at least one row exists with `is_effective = TRUE` for this `capa_id`. |
| Re-open trigger | If SM+ submits a review with `is_effective = FALSE`, they may then call the re-open transition on the CAPA (sends back to `in_progress`). The review record is NOT automatically followed by a transition — the re-open is a separate explicit API call. |

---

### 2.4 `oi_audit_action` Enum Additions (Phase 1D)

**9 new values** must be added to the existing `oi_audit_action` Postgres enum:

```sql
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_deleted';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_reopened';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_added';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_updated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_completed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_effectiveness_recorded';
```

**Note:** CAPA workflow status transitions (`draft→open`, `open→in_progress`, etc.) reuse the existing `status_changed` audit action value with `fieldName = 'capa_status'`, consistent with Phase 1C's pattern for RCA transitions. No new enum value is needed for status transitions.

**Implementation rule:** All `ALTER TYPE ... ADD VALUE` statements must be run as standalone commands outside any `BEGIN/COMMIT` block, as Postgres does not allow adding enum values inside a transaction.

**`shared/schema.ts` update:** Extend the `oiAuditActionEnum` `pgEnum(...)` array with all 9 new string values.

---

## 3. Schema Changes — `oi_issues` Additions (Phase 1D)

No new columns on `oi_issues` for Phase 1D. CAPA state is held entirely in the new tables. The issue detail page derives CAPA state by querying `oi_capa_records WHERE issue_id = :id`.

---

## 4. CAPA Workflow — State Machine

### 4.1 States

| State | Description |
|---|---|
| `draft` | Created, not yet formally opened. All fields editable. Not visible in CAPA SLA metrics. |
| `open` | Formally opened. Due date and assignment expected. SLA clock starts. |
| `in_progress` | Implementation actively underway. |
| `pending_verification` | All action items complete. Awaiting Manager+ verification. |
| `effectiveness_review` | Verified. SM+ reviews whether the CAPA was effective. |
| `closed` | Effective. Final state. No further edits. |
| `cancelled` | Cancelled. Final state. No further edits. |

### 4.2 Transitions

| From | To | Role Required | Pre-condition | Server Action |
|---|---|---|---|---|
| `draft` | `open` | Manager+ | None | Set `opened_at = NOW()` |
| `open` | `in_progress` | Manager+ or `assigned_to` | None | Set `in_progress_at = NOW()` |
| `in_progress` | `pending_verification` | Manager+ or `assigned_to` | All action items in `completed` or `cancelled` — HTTP 409 if any `open` actions remain | Set `pending_verification_at = NOW()` |
| `pending_verification` | `effectiveness_review` | Manager+ | None | Set `effectiveness_review_at = NOW()` |
| `effectiveness_review` | `closed` | SM+ | At least one `oi_capa_effectiveness` row with `is_effective = TRUE` for this CAPA — HTTP 409 if gate not met | Set `closed_at = NOW()` |
| `effectiveness_review` | `in_progress` | SM+ | At least one `oi_capa_effectiveness` row for current cycle with `is_effective = FALSE` — HTTP 409 if gate not met | Increment `re_open_count`, set `in_progress_at = NOW()`, write `capa_reopened` audit action |
| Any pre-closed | `cancelled` | SM+ | `status` not in `closed` — HTTP 409 if already closed | Require `cancellation_reason` (min 10 chars), set `cancelled_at = NOW()` |

**Reverse transitions not listed above are prohibited.** Server returns HTTP 409 for any attempt.

### 4.3 Immutable Fields Post-Open

Once status transitions from `draft` to `open`, the following fields are immutable:

- `capa_type`
- `issue_id`
- `rca_id`
- `capa_number`
- `created_by`

### 4.4 Editable Fields by Status

| Field | `draft` | `open` | `in_progress` | `pending_verification`+ |
|---|---|---|---|---|
| `title` | ✓ | ✓ | ✓ | ✗ |
| `description` | ✓ | ✓ | ✓ | ✗ |
| `root_cause_ref` | ✓ | ✓ | ✓ | ✗ |
| `priority` | ✓ | ✓ | ✗ | ✗ |
| `assigned_to` | ✓ | ✓ | ✓ | ✗ |
| `verifier_id` | ✓ | ✓ | ✓ | ✗ |
| `approver_id` (SM+) | ✓ | ✓ | ✓ | ✓ |
| `due_date` (SM+) | ✓ | ✓ | ✓ | ✓ |
| `extended_due_date` (SM+) | ✓ | ✓ | ✓ | ✓ |

The PATCH handler must maintain an `ALLOWED_FIELDS` set and an `ALLOWED_SM_FIELDS` set consistent with the table above. Any attempt to write an immutable or status-restricted field returns HTTP 422.

---

## 5. Drizzle ORM Schema Additions (`shared/schema.ts`)

Add after the existing Phase 1C RCA table definitions:

```typescript
// ─── Phase 1D: CAPA Records ──────────────────────────────────────────────────
export const oiCapaRecords = pgTable('oi_capa_records', {
  id:                     serial('id').primaryKey(),
  capaNumber:             text('capa_number').notNull().unique(),
  issueId:                integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'restrict' }),
  rcaId:                  integer('rca_id').references(() => oiRcaRecords.id, { onDelete: 'set null' }),
  capaType:               text('capa_type').notNull(),
  title:                  text('title').notNull(),
  description:            text('description').notNull(),
  rootCauseRef:           text('root_cause_ref'),
  priority:               text('priority').notNull().default('medium'),
  assignedTo:             integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  verifierId:             integer('verifier_id').references(() => users.id, { onDelete: 'set null' }),
  approverId:             integer('approver_id').references(() => users.id, { onDelete: 'set null' }),
  status:                 text('status').notNull().default('draft'),
  dueDate:                timestamp('due_date'),
  extendedDueDate:        timestamp('extended_due_date'),
  openedAt:               timestamp('opened_at'),
  inProgressAt:           timestamp('in_progress_at'),
  pendingVerificationAt:  timestamp('pending_verification_at'),
  effectivenessReviewAt:  timestamp('effectiveness_review_at'),
  closedAt:               timestamp('closed_at'),
  cancelledAt:            timestamp('cancelled_at'),
  cancellationReason:     text('cancellation_reason'),
  reOpenCount:            integer('re_open_count').notNull().default(0),
  createdBy:              integer('created_by').notNull().references(() => users.id),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
});

export const oiCapaActions = pgTable('oi_capa_actions', {
  id:             serial('id').primaryKey(),
  capaId:         integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  actionNo:       integer('action_no').notNull(),
  description:    text('description').notNull(),
  assignedTo:     integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  dueDate:        timestamp('due_date'),
  status:         text('status').notNull().default('open'),
  completedAt:    timestamp('completed_at'),
  completedBy:    integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completionNote: text('completion_note'),
  createdBy:      integer('created_by').notNull().references(() => users.id),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
});

export const oiCapaEffectiveness = pgTable('oi_capa_effectiveness', {
  id:                  serial('id').primaryKey(),
  capaId:              integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  reviewCycle:         integer('review_cycle').notNull().default(1),
  reviewerId:          integer('reviewer_id').notNull().references(() => users.id),
  reviewedAt:          timestamp('reviewed_at').notNull().defaultNow(),
  effectivenessScore:  integer('effectiveness_score').notNull(),
  isEffective:         boolean('is_effective').notNull(),
  recurrenceObserved:  boolean('recurrence_observed').notNull().default(false),
  evidenceNotes:       text('evidence_notes'),
  recommendation:      text('recommendation'),
});

export type OiCapaRecord       = typeof oiCapaRecords.$inferSelect;
export type OiCapaAction       = typeof oiCapaActions.$inferSelect;
export type OiCapaEffectiveness = typeof oiCapaEffectiveness.$inferSelect;
```

---

## 6. API Endpoints

All endpoints are registered in a new file `server/oi-capa-routes.ts` and mounted at `/api/oi` in `server/routes.ts` as `oiCapaRouter`.

Minimum role for all endpoints: Manager+ unless stated otherwise.

### 6.1 CAPA Records

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/issues/:id/capa` | Manager+ | Create a new CAPA for an issue |
| `GET` | `/api/oi/issues/:id/capa` | Manager+ | List all CAPAs for an issue |
| `GET` | `/api/oi/capa` | Manager+ | Global CAPA register with filters |
| `GET` | `/api/oi/capa/:capaId` | Manager+ | Get CAPA detail |
| `PATCH` | `/api/oi/capa/:capaId` | Manager+ | Update editable CAPA fields |
| `POST` | `/api/oi/capa/:capaId/transition` | Varies | Advance or cancel CAPA status |
| `DELETE` | `/api/oi/capa/:capaId` | SM+ | Delete CAPA (draft status only) |

### 6.2 CAPA Action Items

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/capa/:capaId/actions` | Manager+ | Add an action item |
| `GET` | `/api/oi/capa/:capaId/actions` | Manager+ | List action items |
| `PATCH` | `/api/oi/capa/:capaId/actions/:actionId` | Manager+ | Update action item fields |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/complete` | Manager+ or assigned_to | Mark action item complete |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/cancel` | Manager+ | Cancel action item |
| `DELETE` | `/api/oi/capa/:capaId/actions/:actionId` | SM+ | Delete action item |

### 6.3 Effectiveness Reviews

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/capa/:capaId/effectiveness` | SM+ | Record effectiveness review for current cycle |
| `GET` | `/api/oi/capa/:capaId/effectiveness` | Manager+ | List all effectiveness reviews for CAPA |

### 6.4 Dashboards

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/oi/dashboard/capa-summary` | Manager+ | Counts by status, overdue count, closed this period |
| `GET` | `/api/oi/dashboard/capa-by-type` | Manager+ | CAPA counts broken down by `capa_type` and `priority` |
| `GET` | `/api/oi/dashboard/capa-sla` | Manager+ | SLA adherence: on-time closed vs overdue closed vs currently overdue |
| `GET` | `/api/oi/dashboard/capa-effectiveness` | Manager+ | Effectiveness score distribution, effective rate, average cycles to close |

**Total: 18 endpoints.**

---

## 7. Endpoint Specifications

### 7.1 `POST /api/oi/issues/:id/capa`

**Role:** Manager+

**Request body (Zod-validated):**
```
capaType:      'corrective' | 'preventive' | 'combined'   (required)
title:         string  min 5, max 200                       (required)
description:   string  min 10                               (required)
rootCauseRef:  string  max 500                              (optional)
priority:      'critical' | 'high' | 'medium' | 'low'      (optional, default 'medium')
assignedTo:    integer (userId)                             (optional)
verifierId:    integer (userId)                             (optional)
approverId:    integer (userId)                             (optional)
rcaId:         integer                                      (optional)
dueDate:       ISO 8601 string                              (optional, SM+ only)
```

**Server behaviour:**
1. Validate issue exists and is not in status `withdrawn`. HTTP 404 / 422 as appropriate.
2. If `rcaId` provided, validate that `oi_rca_records.issue_id = req.params.id`. HTTP 422 if mismatch.
3. If `approverId` provided, validate it does not equal `assignedTo`. HTTP 422.
4. If `dueDate` provided and actor role is not SM+, ignore field silently (do not reject — match Phase 1C pattern for SM-only fields).
5. Acquire `pg_advisory_xact_lock(hashtext('capa_number_seq'))`.
6. Compute next `capa_number` using `CAPA-{year}-{NNN}` logic.
7. Insert into `oi_capa_records`. Return created record with HTTP 201.
8. Write `capa_created` to `oi_audit_log`.

### 7.2 `GET /api/oi/capa` — Global Register

**Query params:**

| Param | Type | Description |
|---|---|---|
| `status` | string | Filter by status |
| `priority` | string | Filter by priority |
| `capaType` | string | Filter by `capa_type` |
| `assignedTo` | integer | Filter by `assigned_to` user ID |
| `overdueOnly` | boolean | `true` → only CAPAs where effective due date < NOW() and status not closed/cancelled |
| `issueId` | integer | Filter by issue |
| `rcaId` | integer | Filter by RCA |
| `search` | string | Case-insensitive search across `capa_number`, `title` |
| `limit` | integer | Default 50, max 200 |
| `offset` | integer | Default 0 |

**Response:** Array of CAPA records enriched with:
- `isOverdue: boolean` — computed server-side
- `assignedToName: string | null`
- `issueCode: string` — `oi_issues.issue_code`
- `actionSummary: { total: number; open: number; completed: number; cancelled: number }`

### 7.3 `GET /api/oi/capa/:capaId`

**Response:** Full CAPA record with:
- `assignedToName`, `verifierName`, `approverName`, `createdByName`
- `isOverdue: boolean`
- `actionSummary: { total; open; completed; cancelled }`
- `effectivenessSummary: { totalReviews; latestCycle; latestScore; latestIsEffective }`
- `issueCode`, `issueStatus`, `issueSeverity`
- `rcaRootCauseCode`, `rcaRootCauseLabel` (if `rca_id` is set)

### 7.4 `PATCH /api/oi/capa/:capaId`

**Server behaviour:**
1. Load existing CAPA. HTTP 404 if not found.
2. Determine allowed fields based on current `status` (see Section 4.4 table).
3. SM+ fields: `approver_id`, `due_date`, `extended_due_date` — silently drop if actor is not SM+.
4. If `approver_id` is being set, validate it does not equal current `assigned_to` (or the `assigned_to` being set in the same request). HTTP 422.
5. Apply updates. Set `updated_at = NOW()`.
6. Write `field_updated` audit entry for each changed field.

### 7.5 `POST /api/oi/capa/:capaId/transition`

**Request body:**
```
action:             string   (required) — one of: 'open','start','submit','verify','close','cancel','reopen'
cancellationReason: string   (required when action = 'cancel', min 10 chars)
```

**Action → transition map:**

| `action` | Transition | Role Gate | Pre-conditions |
|---|---|---|---|
| `open` | `draft → open` | Manager+ | None |
| `start` | `open → in_progress` | Manager+ or `assigned_to` | None |
| `submit` | `in_progress → pending_verification` | Manager+ or `assigned_to` | No `open` action items |
| `verify` | `pending_verification → effectiveness_review` | Manager+ | None |
| `close` | `effectiveness_review → closed` | SM+ | `is_effective = TRUE` review exists |
| `cancel` | any pre-closed → `cancelled` | SM+ | `cancellationReason` provided |
| `reopen` | `effectiveness_review → in_progress` | SM+ | `is_effective = FALSE` review exists for current cycle |

**Server behaviour:**
1. Validate `action` is a known value. HTTP 400 otherwise.
2. Validate current status allows the requested transition. HTTP 409 otherwise.
3. Validate role gate. HTTP 403 otherwise.
4. Check all pre-conditions. HTTP 409 with descriptive error if not met.
5. Apply transition: update `status` + set the corresponding timestamp field.
6. For `reopen`: increment `re_open_count`, reset `in_progress_at`.
7. Write `status_changed` audit entry with `fieldName = 'capa_status'`, `oldValue = {from}`, `newValue = {to}`.
8. For `cancel`: additionally write `capa_cancelled` audit entry.
9. For `reopen`: additionally write `capa_reopened` audit entry.

### 7.6 `POST /api/oi/capa/:capaId/actions/:actionId/complete`

**Request body:**
```
completionNote:  string   (optional, max 1000 chars)
```

**Server behaviour:**
1. Load action item. HTTP 404 if not found or `capa_id` mismatch.
2. Validate CAPA status is `in_progress` or `pending_verification`. HTTP 409 otherwise.
3. Validate actor is `assigned_to` on the action item OR has Manager+ role. HTTP 403 otherwise.
4. Validate action status is `open`. HTTP 409 if already completed or cancelled.
5. Set `status = 'completed'`, `completed_at = NOW()`, `completed_by = req.user.id`, `completion_note`.
6. Write `capa_action_completed` audit entry.

### 7.7 `POST /api/oi/capa/:capaId/effectiveness`

**Request body:**
```
effectivenessScore:  integer  1–5           (required)
isEffective:         boolean                (required)
recurrenceObserved:  boolean                (required)
evidenceNotes:       string   max 2000      (optional)
recommendation:      string   max 1000      (required when isEffective = false)
```

**Server behaviour:**
1. Load CAPA. HTTP 404 if not found.
2. Validate CAPA status is `effectiveness_review`. HTTP 409 otherwise.
3. Validate actor role is SM+. HTTP 403 otherwise.
4. Validate `isEffective = TRUE` and `recurrenceObserved = TRUE` are not both set. HTTP 422.
5. Validate `recommendation` provided when `isEffective = FALSE`. HTTP 422.
6. Compute `review_cycle = capa.re_open_count + 1`.
7. Check UNIQUE constraint on `(capa_id, review_cycle)`. HTTP 409 if already reviewed this cycle.
8. Insert effectiveness review record.
9. Write `capa_effectiveness_recorded` audit entry.
10. Return inserted record.

### 7.8 Dashboard Endpoints — Response Shapes

**`GET /api/oi/dashboard/capa-summary`**

Query params: `periodDays` (default 90, max 365)

```json
{
  "totalCapa": 42,
  "draftCount": 3,
  "openCount": 8,
  "inProgressCount": 12,
  "pendingVerificationCount": 4,
  "effectivenessReviewCount": 2,
  "closedCount": 10,
  "cancelledCount": 3,
  "overdueCount": 7,
  "closedInPeriod": 5
}
```

**`GET /api/oi/dashboard/capa-by-type`**

Query params: `periodDays` (default 180, max 730)

```json
[
  { "capaType": "corrective", "capaTypeLabel": "Corrective", "total": 28, "critical": 2, "high": 8, "medium": 14, "low": 4 },
  { "capaType": "preventive", "capaTypeLabel": "Preventive", "total": 10, "critical": 0, "high": 2, "medium": 6, "low": 2 },
  { "capaType": "combined",   "capaTypeLabel": "Combined",   "total": 4,  "critical": 1, "high": 1, "medium": 2, "low": 0 }
]
```

**`GET /api/oi/dashboard/capa-sla`**

Query params: `periodDays` (default 180, max 730)

```json
{
  "closedOnTime": 8,
  "closedOverdue": 2,
  "currentlyOverdue": 7,
  "slaAdherencePct": 80,
  "avgDaysToClose": 18.3,
  "medianDaysToClose": 14.0
}
```

`slaAdherencePct` = `closedOnTime / (closedOnTime + closedOverdue) * 100`. Returns `null` if no closed CAPAs.

**`GET /api/oi/dashboard/capa-effectiveness`**

Query params: `periodDays` (default 365, max 730)

```json
{
  "totalReviewed": 12,
  "effectiveCount": 9,
  "ineffectiveCount": 3,
  "effectivenessRatePct": 75,
  "avgScore": 3.8,
  "avgCyclesToClose": 1.3,
  "scoreDistribution": [
    { "score": 1, "count": 0 },
    { "score": 2, "count": 1 },
    { "score": 3, "count": 2 },
    { "score": 4, "count": 5 },
    { "score": 5, "count": 4 }
  ]
}
```

---

## 8. File Structure

```
server/oi-capa-routes.ts       — All 18 CAPA endpoints
client/src/pages/oi/
  oi-capa-register.tsx         — Global CAPA register page (/oi/capa)
  oi-capa-detail.tsx           — CAPA detail page (/oi/capa/:capaId)
  oi-capa-constants.ts         — CAPA type labels, priority colours, status colours, score labels
```

**`server/routes.ts` addition:**
```typescript
import { oiCapaRouter } from './oi-capa-routes';
// existing oiRcaRouter registration …
app.use('/api/oi', oiCapaRouter);
```

**`client/src/App.tsx` additions (route order):**
```
/oi/capa          → OiCapaRegisterPage
/oi/capa/:capaId  → OiCapaDetailPage
```
Both must appear before any catch-all route.

**Sidebar addition:** "CAPA Register" link under the OI module group.

---

## 9. UI — Page Specifications

### 9.1 CAPA Register (`/oi/capa`)

**Filter bar:**
- Status multi-select (all 7 states, default = all except cancelled/closed)
- Priority multi-select
- CAPA Type toggle (corrective / preventive / combined)
- Overdue Only toggle (amber)
- Assigned To user picker

**Table columns:**
`CAPA No.` | `Title` | `Issue` | `Type` | `Priority` | `Status` | `Due Date` | `Overdue` | `Assigned To` | `Actions`

- `CAPA No.` — clickable link to `/oi/capa/:capaId`
- `Priority` — coloured badge: Critical=red, High=orange, Medium=amber, Low=grey
- `Status` — coloured badge per status
- `Due Date` — formatted using `fmtDate`. If overdue and not closed/cancelled, date shown in red
- `Overdue` — red badge if `isOverdue = true`

**Pagination:** 50 per page with load-more or page control.

### 9.2 CAPA Detail (`/oi/capa/:capaId`)

**Header:**
- CAPA number, title
- Type badge, Priority badge, Status badge
- Workflow action buttons (contextual per status and role)
- "Back to Issue" link

**Tabs:**
1. **Overview** — all CAPA fields in read-only or editable mode based on status. Editable fields use inline edit pattern (click to edit, save on blur or explicit save button).
2. **Action Items** — list of action items with status badges. Add / complete / cancel actions. Gate warning shown if any `open` items block `pending_verification` transition.
3. **Effectiveness** — list of effectiveness review records (per cycle). When status = `effectiveness_review` and actor is SM+, show review form. Score displayed as 1–5 stars or numeric. `isEffective` shown as green tick or red cross.
4. **Audit Log** — CAPA-specific audit entries, newest first. Shows action, changed fields, old/new values, actor, timestamp.

### 9.3 Issue Detail Enhancement

Add a **CAPA Summary card** below the RCA Summary card (if RCA card exists) or below the audit log (if no RCA):
- Shows count of CAPAs for this issue, count by status, count overdue
- Link to each CAPA (list, up to 5, with "View all" if more)

### 9.4 RCA Page Enhancement

When RCA status is `approved`, add a **"Linked CAPA"** section below the Overview tab content:
- List CAPAs linked to this RCA (via `rca_id = :rcaId`)
- "Create CAPA from this RCA" button — pre-fills `rcaId`, `rootCauseRef` from `rootCauseSummary`

### 9.5 Dashboard Integration

Add a **"CAPA"** section to the existing OI dashboard below the RCA section. Contains the 4 panels using the 4 dashboard endpoints defined in Section 7.8.

---

## 10. CAPA Constants (`oi-capa-constants.ts`)

```typescript
export const CAPA_STATUS_LABELS: Record<string, string> = {
  draft:                  'Draft',
  open:                   'Open',
  in_progress:            'In Progress',
  pending_verification:   'Pending Verification',
  effectiveness_review:   'Effectiveness Review',
  closed:                 'Closed',
  cancelled:              'Cancelled',
};

export const CAPA_STATUS_COLORS: Record<string, string> = {
  draft:                  'bg-gray-100 text-gray-600',
  open:                   'bg-blue-100 text-blue-700',
  in_progress:            'bg-indigo-100 text-indigo-700',
  pending_verification:   'bg-amber-100 text-amber-700',
  effectiveness_review:   'bg-purple-100 text-purple-700',
  closed:                 'bg-green-100 text-green-700',
  cancelled:              'bg-red-100 text-red-600',
};

export const CAPA_TYPE_LABELS: Record<string, string> = {
  corrective:  'Corrective',
  preventive:  'Preventive',
  combined:    'Combined',
};

export const CAPA_PRIORITY_LABELS: Record<string, string> = {
  critical: 'Critical',
  high:     'High',
  medium:   'Medium',
  low:      'Low',
};

export const CAPA_PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-amber-100 text-amber-700',
  low:      'bg-gray-100 text-gray-500',
};

export const CAPA_SCORE_LABELS: Record<number, string> = {
  1: 'Completely Ineffective',
  2: 'Marginally Effective',
  3: 'Partially Effective',
  4: 'Mostly Effective',
  5: 'Fully Effective',
};

export const CAPA_ACTION_STATUS_LABELS: Record<string, string> = {
  open:       'Open',
  completed:  'Completed',
  cancelled:  'Cancelled',
};
```

---

## 11. Role Enforcement Summary

| Operation | Minimum Role |
|---|---|
| Create CAPA | Manager |
| View CAPA | Manager |
| Edit CAPA fields | Manager |
| Add / edit action items | Manager |
| Complete own action item | `assigned_to` (any role) or Manager |
| Cancel action item | Manager |
| Delete action item | Senior Manager |
| `open` transition | Manager |
| `start` / `submit` transitions | Manager or `assigned_to` |
| `verify` transition | Manager |
| `close` transition | Senior Manager |
| `cancel` transition | Senior Manager |
| `reopen` transition | Senior Manager |
| Set `due_date` / `extended_due_date` | Senior Manager |
| Set `approver_id` | Senior Manager |
| Record effectiveness review | Senior Manager |
| Delete CAPA (draft only) | Senior Manager |

---

## 12. SLA Overdue Logic

`isOverdue` is computed server-side on every read. Not stored in DB.

```
effectiveDueDate = extended_due_date ?? due_date
isOverdue = effectiveDueDate IS NOT NULL
            AND effectiveDueDate < NOW()
            AND status NOT IN ('closed', 'cancelled')
```

SLA clock starts when `opened_at` is set (i.e. when status transitions to `open`). CAPAs in `draft` do not appear in SLA overdue counts on the dashboard.

---

## 13. Audit Log Entries — Summary

| Event | `action` value | `entityType` | Fields logged |
|---|---|---|---|
| CAPA created | `capa_created` | `capa` | `capaNumber`, `capaType`, `title`, `priority` |
| CAPA field updated | `field_updated` | `capa` | `fieldName`, `oldValue`, `newValue` per field |
| CAPA status transition | `status_changed` | `capa` | `fieldName='capa_status'`, old/new values |
| CAPA cancelled | `capa_cancelled` | `capa` | `cancellationReason` |
| CAPA re-opened | `capa_reopened` | `capa` | `reOpenCount` (new value) |
| CAPA deleted | `capa_deleted` | `capa` | `capaNumber` |
| Action item added | `capa_action_added` | `capa` | `actionNo`, `description` |
| Action item updated | `capa_action_updated` | `capa` | `actionNo`, changed fields |
| Action item completed | `capa_action_completed` | `capa` | `actionNo`, `completionNote` |
| Action item cancelled | `capa_action_cancelled` | `capa` | `actionNo` |
| Effectiveness recorded | `capa_effectiveness_recorded` | `capa` | `reviewCycle`, `effectivenessScore`, `isEffective` |

`entityId` = `capa_id` for all CAPA audit entries. `issueId` = parent issue ID for context.

---

## 14. Implementation Steps

### Step 0 — DB Migration (psql direct SQL)
Run outside any transaction:
```sql
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_deleted';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_reopened';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_added';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_updated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_completed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_effectiveness_recorded';
```

Then run inside a transaction:
```sql
BEGIN;
CREATE TABLE oi_capa_records ( … );
-- all indexes
CREATE TABLE oi_capa_actions ( … );
-- all indexes
CREATE TABLE oi_capa_effectiveness ( … );
-- all indexes
COMMIT;
```

### Step 1 — Drizzle schema update (`shared/schema.ts`)
Add `oiCapaRecords`, `oiCapaActions`, `oiCapaEffectiveness` table definitions and exported types.
Extend `oiAuditActionEnum` pgEnum array with 9 new values.

### Step 2 — Server routes (`server/oi-capa-routes.ts`)
Implement all 18 endpoints. Register in `server/routes.ts`.

### Step 3 — Constants file (`client/src/pages/oi/oi-capa-constants.ts`)
All labels, colours, score labels.

### Step 4 — CAPA Register page (`client/src/pages/oi/oi-capa-register.tsx`)
Global register with filter bar and table.

### Step 5 — CAPA Detail page (`client/src/pages/oi/oi-capa-detail.tsx`)
Tabbed detail: Overview, Action Items, Effectiveness, Audit Log.

### Step 6 — App.tsx routes + sidebar
Register `/oi/capa` and `/oi/capa/:capaId`. Add sidebar link.

### Step 7 — Issue detail enhancement
Add CAPA Summary card to `oi-issue-detail.tsx`.

### Step 8 — RCA page enhancement
Add "Linked CAPA" section and "Create CAPA from this RCA" button to `oi-rca-page.tsx`.

### Step 9 — Dashboard panels
Add 4 CAPA panels to `oi-dashboard.tsx`.

### Step 10 — Smoke test
Verify:
- CAPA creation with and without RCA linkage
- All 7 state transitions, including gate enforcement
- Action item completion gate on `pending_verification`
- Effectiveness review closure gate
- Overdue flag computation
- Dashboard panels render without errors
- Unauthorized access returns HTTP 403

---

*End of Phase 1D Execution Plan — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT*
