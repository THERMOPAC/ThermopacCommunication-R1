# Operational Intelligence — Phase 1D Execution Plan

**Status:** REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT
**Date:** 22-May-2026 (revised 22-May-2026)
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)
**Phase 1B Baseline:** `docs/operational-intelligence-phase1b-execution.md` (COMPLETE)
**Phase 1C Baseline:** `docs/operational-intelligence-phase1c-execution.md` (COMPLETE)
**Phase 1D Scope:** CAPA Framework — Corrective and Preventive Actions, CAPA Workflow, CAPA Assignments, CAPA Approvals, CAPA Effectiveness Review, CAPA Dashboards, CAPA SLA Tracking, CAPA SLA Escalation, CAPA Audit Logs, CAPA Linkage to RCA (mandatory), CAPA Closure Validation, Issue Closure Gate
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
- **`ALTER TYPE … ADD VALUE` statements must be executed as standalone commands, each on its own, outside any `BEGIN … COMMIT` transaction block.** Postgres does not permit enum value additions inside a transaction. The migration script must not wrap these statements in any transaction.
- The `writeAuditLog` function from `server/oi-audit-service.ts` is the only permitted way to write to `oi_audit_log`. Do not write to `oi_audit_log` directly via raw SQL or Drizzle insert outside that function.
- CAPA numbers are server-assigned at creation. Never accepted from client.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.
- `MANAGER_ROLES` = `['manager','senior_manager','general_manager','superuser']`.
- `SM_ROLES` = `['senior_manager','general_manager','superuser']`.

---

## Explicit Exclusions — Forbidden in Phase 1D Code

The following logic is **prohibited** from appearing anywhere in Phase 1D code, routes, services, or UI. Any scope expansion requires a new approved execution plan.

| Category | Prohibited |
|---|---|
| SOP logic | SOP review workflows, SOP linkage, SOP revision triggers |
| ERP enforcement | SAP integration, purchase order gates, ERP-driven status changes |
| AI logic | OpenAI API calls, embeddings, vector similarity, semantic clustering, AI-generated recommendations |
| Lessons learned | Lessons learned records, lessons learned registry, lessons learned linkage |
| Email notifications | Sending email via SendGrid or any provider. Notification data is computed and audit-logged only. |
| Evidence file attachments | File upload to CAPA records (Phase 1E) |
| SHA-256 integrity | Cryptographic file hashing |
| Legal hold | Legal hold flags, immutability enforcement |
| Predictive analytics | Trend forecasting, ML-based risk scoring |

---

## Phase 1D Scope

### In Scope

| Area | Detail |
|---|---|
| CAPA Record | One or more CAPAs per issue. Every CAPA must be linked to an approved RCA. No orphan CAPA creation. |
| CAPA Type | `corrective`, `preventive`, or `combined`. Immutable once CAPA transitions from `draft` to `open`. |
| CAPA Numbering | Server-assigned. Format: `CAPA-{YYYY}-{NNN}`. |
| CAPA Priority | `critical`, `high`, `medium`, `low`. Editable in `draft` or `open` only. |
| CAPA Workflow | Seven states: `draft → open → in_progress → pending_verification → effectiveness_review → closed`. Cancelled exit from any pre-closed state. Re-open path: `effectiveness_review → in_progress`. |
| CAPA Assignments | `assigned_to`, `verifier_id`, `approver_id` — all FK → `users.id`. |
| CAPA Action Items | Sub-tasks with assignment, due date, completion, verification status. Gate: all action items must be `completed` or `cancelled` before `pending_verification` transition. |
| CAPA Effectiveness Review | Structured record per cycle. Fields: score (1–5), is_effective, recurrence_observed, evidence_notes, recommendation. Closure gate requires `is_effective = TRUE` AND `recurrence_observed = FALSE`. |
| CAPA SLA Tracking | `due_date` and `extended_due_date`. `is_overdue` computed server-side. Overdue display on register and detail. |
| CAPA SLA Escalation | Nightly scheduler escalates overdue CAPAs to 3 levels. Writes SLA breach audit events. No email in Phase 1D. |
| CAPA Audit Logs | All CAPA mutations appended to `oi_audit_log` via `writeAuditLog`. |
| CAPA Linkage to RCA | `rca_id` is `NOT NULL`. Every CAPA must reference an approved RCA record. Cross-issue linkage prohibited. |
| RCA Reopen Gate | RCA reopen is blocked server-side if any CAPA linked to that RCA has status not in `draft` or `cancelled`. |
| CAPA Closure Validation | Requires `is_effective = TRUE` AND `recurrence_observed = FALSE` in the most recent effectiveness review cycle. |
| Recurrence Closure Block | If the most recent effectiveness review has `recurrence_observed = TRUE`, the `closed` transition is blocked. CAPA must be reopened to proceed to a new cycle. |
| Issue Closure Gate | Issue `closed` transition blocked if any `oi_capa_records` row for that issue has status not in `closed` or `cancelled`. Enforced in `server/oi-transition-service.ts`. |
| CAPA Dashboards | 4 new panels with fully specified response shapes. |

### Explicitly Excluded from Phase 1D

SOP review workflow, ERP enforcement, AI agents, AI governance, lessons learned, predictive analytics, legal hold, evidence integrity, evidence file attachments, email notifications, SHA-256 cryptographic proof, OpenAI API calls, vector embeddings, business continuity, commissioning checklists, insurance claim lifecycle, SLA auto-status changes (escalation is audit-log-only).

---

## 1. CAPA Numbering

- Format: `CAPA-{YYYY}-{NNN}` where `YYYY` = 4-digit calendar year of creation (IST) and `NNN` = 3-digit zero-padded global sequence within that year.
- `NNN` starts at `001` for the first CAPA of each year and increments globally (not per-issue, not per-type).
- Server computes next number using: `SELECT COUNT(*) FROM oi_capa_records WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = {year}` + 1, wrapped in `pg_advisory_xact_lock(hashtext('capa_number_seq'))` to prevent duplicates under concurrency.
- `capa_number` stored as TEXT. Immutable once set. Never accepted from client.
- Examples: `CAPA-2026-001`, `CAPA-2026-042`, `CAPA-2027-001`.

---

## 2. Schema Changes — New Tables

### 2.1 `oi_capa_records`

```sql
CREATE TABLE oi_capa_records (
  id                        SERIAL PRIMARY KEY,
  capa_number               TEXT NOT NULL UNIQUE,
  issue_id                  INTEGER NOT NULL REFERENCES oi_issues(id) ON DELETE RESTRICT,
  rca_id                    INTEGER NOT NULL REFERENCES oi_rca_records(id) ON DELETE RESTRICT,
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
| `issue_id` | Required. Must reference an existing `oi_issues` record not in status `withdrawn`. `ON DELETE RESTRICT` — cannot delete an issue that has CAPAs. |
| `rca_id` | **Required. NOT NULL.** Must reference an `oi_rca_records` record whose `issue_id` equals the request's `issue_id`. Server validates match — cross-issue linkage returns HTTP 422. The referenced RCA must have `status = 'approved'`. Attempting to create a CAPA against a non-approved RCA returns HTTP 409. `ON DELETE RESTRICT` — cannot delete an RCA that has CAPAs. |
| `capa_type` | Required at creation. Immutable once status transitions from `draft` to `open`. |
| `title` | Required. Min 5 chars, max 200 chars. |
| `description` | Required at creation (min 10 chars). Editable in `draft`, `open`, `in_progress`. Read-only from `pending_verification` onward. |
| `root_cause_ref` | Optional. Free-text. Max 500 chars. |
| `priority` | Required. Default `medium`. Editable in `draft` or `open` only. |
| `assigned_to` | Optional. If set, must be a user with role Manager+. Editable in `draft`, `open`, `in_progress`. |
| `verifier_id` | Manager+ only to set. Nullable. Editable in `draft`, `open`, `in_progress`. |
| `approver_id` | SM+ only to set. Nullable. Must not equal `assigned_to`. Editable in any pre-closed state. |
| `status` | Transitions governed by Section 4. Never accepted raw from client. |
| `due_date` | SM+ only to set. If set and `status` not in `closed`/`cancelled` and effective due date < NOW(), CAPA is overdue. |
| `extended_due_date` | SM+ only to set. When set, overdue is computed against `extended_due_date` instead of `due_date`. |
| `opened_at` | Set server-side when `open` transition fires. Immutable once set. |
| `in_progress_at` | Set server-side when `in_progress` transition fires. Updated on re-open. |
| `pending_verification_at` | Set server-side when `pending_verification` transition fires. |
| `effectiveness_review_at` | Set server-side when `effectiveness_review` transition fires. Updated on re-open cycles. |
| `closed_at` | Set server-side when `closed` transition fires. Immutable. |
| `cancelled_at` | Set server-side when `cancelled` transition fires. Immutable. |
| `cancellation_reason` | Required (min 10 chars) when `cancel` transition is called. |
| `re_open_count` | Incremented by 1 server-side on each `effectiveness_review → in_progress` re-open. Never accepted from client. |
| `created_by` | Set server-side from `req.user.id`. Never accepted from client. |
| `updated_at` | Set server-side on every PATCH. |

---

### 2.2 `oi_capa_actions`

Action items within a CAPA. Maximum 20 per CAPA.

```sql
CREATE TABLE oi_capa_actions (
  id                  SERIAL PRIMARY KEY,
  capa_id             INTEGER NOT NULL REFERENCES oi_capa_records(id) ON DELETE CASCADE,
  action_no           INTEGER NOT NULL,
  description         TEXT NOT NULL,
  assigned_to         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date            TIMESTAMP,
  status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','completed','cancelled')),
  completed_at        TIMESTAMP,
  completed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completion_note     TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','verified','rejected')),
  verified_at         TIMESTAMP,
  verified_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  verification_note   TEXT,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_capa_action_no UNIQUE (capa_id, action_no)
);

CREATE INDEX idx_oi_capa_actions_capa_id   ON oi_capa_actions(capa_id);
CREATE INDEX idx_oi_capa_actions_assigned  ON oi_capa_actions(assigned_to);
```

**Field rules:**

| Field | Rule |
|---|---|
| `action_no` | Server-assigned sequential integer starting at 1 per CAPA. `SELECT COALESCE(MAX(action_no), 0) + 1 FROM oi_capa_actions WHERE capa_id = {id}`. Never accepted from client. |
| `description` | Required. Min 5 chars, max 500 chars. |
| `assigned_to` | Optional. Any valid user. |
| `due_date` | Optional. Informational. No auto-status change if exceeded. |
| `status` | Transitions: `open → completed` (via complete endpoint). `open → cancelled` (via cancel endpoint). No reverse transitions on `status`. |
| `completed_at` | Set server-side to NOW() when `complete` action fires. |
| `completed_by` | Set server-side from `req.user.id` when `complete` action fires. |
| `completion_note` | Optional (max 1000 chars). Accepted on the `complete` request body. |
| `verification_status` | Default `pending`. Only meaningful when `status = 'completed'`. Transitions: `pending → verified` or `pending → rejected` (via verify/reject endpoint, Manager+). `rejected → pending` is permitted (re-submit for verification). |
| `verified_at` | Set server-side to NOW() when verification transition fires. Reset to NULL if verification is re-submitted. |
| `verified_by` | Set server-side from `req.user.id` when verification transition fires. |
| `verification_note` | Optional (max 1000 chars). Required when `verification_status = 'rejected'` (min 10 chars). |
| Create/edit rule | Creatable and editable (description, assigned_to, due_date) only when CAPA status is `draft`, `open`, or `in_progress`. |
| Complete rule | Permitted when CAPA status is `in_progress` or `pending_verification`. Actor must be the `assigned_to` user on the action OR have Manager+ role. |
| Verify/reject rule | Manager+ only. Permitted when action item `status = 'completed'` and CAPA status is `pending_verification` or `effectiveness_review`. |
| Cancel rule | Manager+ only. Permitted when CAPA status is `draft`, `open`, or `in_progress` and action status is `open`. |
| Delete rule | SM+ only. Permitted only when CAPA status is `draft` or `open` and action `status = 'open'`. |
| Maximum | 20 action items per CAPA. HTTP 422 if limit exceeded. |
| `pending_verification` gate | `pending_verification` transition on the CAPA is blocked (HTTP 409) if any action item has `status = 'open'`. All action items must be `completed` or `cancelled`. |

---

### 2.3 `oi_capa_effectiveness`

One effectiveness review record per review cycle per CAPA.

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
| `review_cycle` | Server-assigned. Equals `capa.re_open_count + 1` at time of record creation. Never accepted from client. |
| `reviewer_id` | Set server-side from `req.user.id`. SM+ required. |
| `reviewed_at` | Set server-side to NOW(). |
| `effectiveness_score` | Required. Integer 1–5. 1=Completely Ineffective, 2=Marginally Effective, 3=Partially Effective, 4=Mostly Effective, 5=Fully Effective. |
| `is_effective` | Required. Boolean. |
| `recurrence_observed` | Required. Boolean. |
| Contradiction rule | `is_effective = TRUE` and `recurrence_observed = TRUE` cannot both be set in the same record. Server returns HTTP 422 if both are true. |
| `recommendation` | Required when `is_effective = FALSE`. Min 10 chars, max 1000 chars. |
| `evidence_notes` | Optional. Max 2000 chars. |
| Create rule | Permitted only when CAPA status is `effectiveness_review`. SM+ only. |
| UNIQUE per cycle | One review per `(capa_id, review_cycle)`. Duplicate attempt returns HTTP 409. |
| Closure gate | `closed` transition requires the most recent effectiveness review (highest `review_cycle`) to have `is_effective = TRUE` AND `recurrence_observed = FALSE`. If `recurrence_observed = TRUE`, `closed` is blocked with HTTP 409 — "Recurrence observed. CAPA must be reopened before closure." |
| Re-open gate | `reopen` transition (`effectiveness_review → in_progress`) requires the most recent effectiveness review to have `is_effective = FALSE` OR `recurrence_observed = TRUE`. |

---

### 2.4 `oi_capa_escalation_log`

Tracks which escalation level has been notified for each CAPA, to prevent duplicate audit events on repeated nightly runs.

```sql
CREATE TABLE oi_capa_escalation_log (
  id           SERIAL PRIMARY KEY,
  capa_id      INTEGER NOT NULL REFERENCES oi_capa_records(id) ON DELETE CASCADE,
  level        INTEGER NOT NULL CHECK (level IN (1, 2, 3)),
  fired_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_capa_escalation_level UNIQUE (capa_id, level)
);

CREATE INDEX idx_oi_capa_escalation_capa_id ON oi_capa_escalation_log(capa_id);
```

**Purpose:** The nightly escalation scheduler inserts a row here when an escalation level fires. Before firing, it checks whether a row for `(capa_id, level)` already exists — if so, skips. This guarantees each escalation level fires exactly once per CAPA. When a CAPA transitions to `closed` or `cancelled`, all its escalation log rows are deleted by `ON DELETE CASCADE`.

---

### 2.5 `oi_audit_action` Enum Additions (Phase 1D)

**12 new values** added to the existing `oi_audit_action` Postgres enum.

**Migration script rule:** Each statement runs standalone, outside any transaction block.

```sql
-- Run each line as a standalone command. DO NOT wrap in BEGIN / COMMIT.
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_deleted';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_reopened';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_added';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_updated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_completed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_verified';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_verification_rejected';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_effectiveness_recorded';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_sla_breach';
```

**Notes:**
- CAPA workflow status transitions (`draft→open`, etc.) reuse the existing `status_changed` enum value with `fieldName = 'capa_status'`. No new value needed for transitions.
- `capa_sla_breach` is used for all 3 escalation levels. The level (1, 2, or 3) is stored in the `metadata` JSON field of `oi_audit_log`.
- `shared/schema.ts` `oiAuditActionEnum` pgEnum array must be extended with all 12 new string values.

---

## 3. No Schema Changes to `oi_issues` for Phase 1D

No new columns are added to `oi_issues` for Phase 1D. The issue closure gate is enforced by querying `oi_capa_records` at transition time in `server/oi-transition-service.ts`.

---

## 4. CAPA Workflow — State Machine

### 4.1 States

| State | Description |
|---|---|
| `draft` | Created, not yet formally opened. All editable fields writeable. Not counted in SLA metrics. |
| `open` | Formally opened. SLA clock starts. Assignment and due date expected. |
| `in_progress` | Implementation underway. |
| `pending_verification` | All action items complete. Awaiting Manager+ verification. |
| `effectiveness_review` | Verified. SM+ records whether the CAPA was effective. |
| `closed` | Effective, no recurrence observed. Final state. Immutable. |
| `cancelled` | Cancelled. Final state. Immutable. |

### 4.2 Transitions

| From | To | `action` value | Role Required | Pre-conditions | Server Actions |
|---|---|---|---|---|---|
| `draft` | `open` | `open` | Manager+ | None | Set `opened_at = NOW()` |
| `open` | `in_progress` | `start` | Manager+ or `assigned_to` | None | Set `in_progress_at = NOW()` |
| `in_progress` | `pending_verification` | `submit` | Manager+ or `assigned_to` | No `open` action items — HTTP 409 if any exist | Set `pending_verification_at = NOW()` |
| `pending_verification` | `effectiveness_review` | `verify` | Manager+ | None | Set `effectiveness_review_at = NOW()` |
| `effectiveness_review` | `closed` | `close` | SM+ | Most recent effectiveness review: `is_effective = TRUE` AND `recurrence_observed = FALSE` — HTTP 409 otherwise | Set `closed_at = NOW()` |
| `effectiveness_review` | `in_progress` | `reopen` | SM+ | Most recent effectiveness review: `is_effective = FALSE` OR `recurrence_observed = TRUE` — HTTP 409 otherwise | Increment `re_open_count`, set `in_progress_at = NOW()` |
| Any pre-closed | `cancelled` | `cancel` | SM+ | `status` not already `closed` — HTTP 409; `cancellationReason` required (min 10 chars) | Set `cancelled_at = NOW()`, `cancellation_reason` |

Any transition not listed above is prohibited. Server returns HTTP 409 for any unlisted attempt.

### 4.3 Immutable Fields Post-Open

Once `open` transition fires, these fields become immutable for the lifetime of the CAPA:
`capa_type`, `issue_id`, `rca_id`, `capa_number`, `created_by`.

### 4.4 Editable Fields by Status

| Field | `draft` | `open` | `in_progress` | `pending_verification`+ |
|---|---|---|---|---|
| `title` | ✓ | ✓ | ✓ | ✗ |
| `description` | ✓ | ✓ | ✓ | ✗ |
| `root_cause_ref` | ✓ | ✓ | ✓ | ✗ |
| `priority` | ✓ | ✓ | ✗ | ✗ |
| `assigned_to` | ✓ | ✓ | ✓ | ✗ |
| `verifier_id` | ✓ | ✓ | ✓ | ✗ |
| `approver_id` (SM+ only) | ✓ | ✓ | ✓ | ✓ |
| `due_date` (SM+ only) | ✓ | ✓ | ✓ | ✓ |
| `extended_due_date` (SM+ only) | ✓ | ✓ | ✓ | ✓ |

PATCH handler enforces this table. Attempt to write a restricted field returns HTTP 422 with the field name.

---

## 5. RCA Reopen Gate (Phase 1D Addition to Phase 1C)

**Deterministic rule:** The RCA `reopen` transition (in `server/oi-rca-routes.ts`) is blocked if any row in `oi_capa_records` satisfies:

```
rca_id = :rcaId
AND status NOT IN ('draft', 'cancelled')
```

If such a row exists, server returns HTTP 409:
`"RCA cannot be reopened. A linked CAPA is in active state ({capaNumber}, status: {status}). Cancel or return the CAPA to draft before reopening the RCA."`

**Rationale:** Blocking is chosen over auto-reopen because auto-reopening a CAPA that is `in_progress` or `effectiveness_review` would silently discard work. The operator must explicitly resolve the CAPA state.

**Implementation location:** Add this check to the `reopen` transition handler in `server/oi-rca-routes.ts`, before the status update.

---

## 6. Issue Closure Gate (Phase 1D Addition to `oi-transition-service.ts`)

**Rule:** The issue `closed` transition in `server/oi-transition-service.ts` is blocked if any row in `oi_capa_records` satisfies:

```
issue_id = :issueId
AND status NOT IN ('closed', 'cancelled')
```

If such a row exists, server returns HTTP 409:
`"Issue cannot be closed. {count} linked CAPA(s) have not been resolved. Close or cancel all CAPAs before closing the issue."`

**Implementation:** Add this query to the `validateTransition` function in `server/oi-transition-service.ts` inside the block that handles `nextStatus = 'closed'`. This check runs after the existing Phase 1C RCA closure check. Both must pass.

---

## 7. CAPA SLA Escalation Scheduler

### 7.1 File

`server/oi-capa-escalation-service.ts`

### 7.2 Schedule

Nightly at 00:30 IST (00:00 UTC adjusted for IST offset — use `node-cron` expression `30 19 * * *` UTC, equivalent to 01:00 IST, or use the existing cron infrastructure in `server/index.ts` matching the leave accrual cron pattern).

### 7.3 Escalation Levels

| Level | Trigger Condition | Audit Action | Recipient Definition |
|---|---|---|---|
| L1 | `effective_due_date < NOW()` AND overdue ≥ 1 day AND < 7 days AND status not in `closed`/`cancelled` | `capa_sla_breach` with `metadata.level = 1` | `assigned_to` user |
| L2 | `effective_due_date < NOW()` AND overdue ≥ 7 days AND < 14 days AND status not in `closed`/`cancelled` | `capa_sla_breach` with `metadata.level = 2` | `assigned_to` user + all users with role `manager`, `senior_manager`, `general_manager`, `superuser` |
| L3 | `effective_due_date < NOW()` AND overdue ≥ 14 days AND status not in `closed`/`cancelled` | `capa_sla_breach` with `metadata.level = 3` | `assigned_to` user + all users with role `senior_manager`, `general_manager`, `superuser` |

`effective_due_date` = `extended_due_date` if set, otherwise `due_date`. CAPAs where both `due_date` and `extended_due_date` are NULL are skipped.

### 7.4 Deduplication

Before firing an escalation level for a CAPA, the scheduler checks `oi_capa_escalation_log` for an existing row with `(capa_id, level)`. If found, skip. If not found, fire the event and insert the row.

Lower levels are not re-fired when a higher level fires. Level 2 firing does not also fire Level 1 again.

### 7.5 Scheduler Logic (pseudocode)

```
1. Query all oi_capa_records WHERE due_date IS NOT NULL OR extended_due_date IS NOT NULL
   AND status NOT IN ('closed', 'cancelled')

2. For each CAPA:
   a. Compute effective_due_date = extended_due_date ?? due_date
   b. If effective_due_date IS NULL → skip
   c. Compute overdue_days = floor((NOW() - effective_due_date) / 86400000)
   d. If overdue_days < 1 → skip (not yet overdue)

   e. For level in [3, 2, 1] (descending, so highest level takes priority):
      - If overdue_days meets level threshold:
        - Check oi_capa_escalation_log for (capa_id, level)
        - If not found:
          - writeAuditLog({ action: 'capa_sla_breach', entityType: 'capa', entityId: capa.id,
              issueId: capa.issue_id, metadata: { level, overdueDays, capaNumber, recipients } })
          - INSERT INTO oi_capa_escalation_log (capa_id, level)
        - Break (only fire the highest applicable unfired level per run)
```

### 7.6 Registration

Register the cron in `server/index.ts` alongside the existing nightly cron jobs (leave accrual, etc.).

### 7.7 Email Recipients — Phase 1D

Recipients are computed and stored in the audit log `metadata.recipients` array as user IDs only. **No email is sent in Phase 1D.** The recipient list is pre-computed so that when email is added in a future phase, the data is already present in the audit log.

---

## 8. Drizzle ORM Schema Additions (`shared/schema.ts`)

Add after the existing Phase 1C table definitions:

```typescript
// ─── Phase 1D: CAPA Records ──────────────────────────────────────────────────
export const oiCapaRecords = pgTable('oi_capa_records', {
  id:                     serial('id').primaryKey(),
  capaNumber:             text('capa_number').notNull().unique(),
  issueId:                integer('issue_id').notNull().references(() => oiIssues.id, { onDelete: 'restrict' }),
  rcaId:                  integer('rca_id').notNull().references(() => oiRcaRecords.id, { onDelete: 'restrict' }),
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
  id:                 serial('id').primaryKey(),
  capaId:             integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  actionNo:           integer('action_no').notNull(),
  description:        text('description').notNull(),
  assignedTo:         integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
  dueDate:            timestamp('due_date'),
  status:             text('status').notNull().default('open'),
  completedAt:        timestamp('completed_at'),
  completedBy:        integer('completed_by').references(() => users.id, { onDelete: 'set null' }),
  completionNote:     text('completion_note'),
  verificationStatus: text('verification_status').notNull().default('pending'),
  verifiedAt:         timestamp('verified_at'),
  verifiedBy:         integer('verified_by').references(() => users.id, { onDelete: 'set null' }),
  verificationNote:   text('verification_note'),
  createdBy:          integer('created_by').notNull().references(() => users.id),
  createdAt:          timestamp('created_at').notNull().defaultNow(),
  updatedAt:          timestamp('updated_at').notNull().defaultNow(),
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

export const oiCapaEscalationLog = pgTable('oi_capa_escalation_log', {
  id:       serial('id').primaryKey(),
  capaId:   integer('capa_id').notNull().references(() => oiCapaRecords.id, { onDelete: 'cascade' }),
  level:    integer('level').notNull(),
  firedAt:  timestamp('fired_at').notNull().defaultNow(),
});

export type OiCapaRecord        = typeof oiCapaRecords.$inferSelect;
export type OiCapaAction        = typeof oiCapaActions.$inferSelect;
export type OiCapaEffectiveness = typeof oiCapaEffectiveness.$inferSelect;
export type OiCapaEscalationLog = typeof oiCapaEscalationLog.$inferSelect;
```

---

## 9. API Endpoints

All endpoints registered in `server/oi-capa-routes.ts`. Mounted at `/api/oi` in `server/routes.ts` as `oiCapaRouter`. Minimum role for all endpoints: Manager+ unless stated.

### 9.1 CAPA Records

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/issues/:id/capa` | Manager+ | Create CAPA (rca_id required in body) |
| `GET` | `/api/oi/issues/:id/capa` | Manager+ | List CAPAs for an issue |
| `GET` | `/api/oi/capa` | Manager+ | Global CAPA register with filters |
| `GET` | `/api/oi/capa/:capaId` | Manager+ | Get CAPA detail |
| `PATCH` | `/api/oi/capa/:capaId` | Manager+ | Update editable CAPA fields |
| `POST` | `/api/oi/capa/:capaId/transition` | Varies | Advance or cancel CAPA status |
| `DELETE` | `/api/oi/capa/:capaId` | SM+ | Delete CAPA (draft only) |

### 9.2 CAPA Action Items

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/capa/:capaId/actions` | Manager+ | Add action item |
| `GET` | `/api/oi/capa/:capaId/actions` | Manager+ | List action items |
| `PATCH` | `/api/oi/capa/:capaId/actions/:actionId` | Manager+ | Update description, assigned_to, due_date |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/complete` | Manager+ or assigned_to | Mark action item complete |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/verify` | Manager+ | Set verification_status to verified |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/reject-verification` | Manager+ | Set verification_status to rejected |
| `POST` | `/api/oi/capa/:capaId/actions/:actionId/cancel` | Manager+ | Cancel action item |
| `DELETE` | `/api/oi/capa/:capaId/actions/:actionId` | SM+ | Delete action item |

### 9.3 Effectiveness Reviews

| Method | Path | Role | Description |
|---|---|---|---|
| `POST` | `/api/oi/capa/:capaId/effectiveness` | SM+ | Record effectiveness review for current cycle |
| `GET` | `/api/oi/capa/:capaId/effectiveness` | Manager+ | List all effectiveness reviews |

### 9.4 Dashboards

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/oi/dashboard/capa-summary` | Manager+ | Status counts, overdue count |
| `GET` | `/api/oi/dashboard/capa-by-type` | Manager+ | Breakdown by type and priority |
| `GET` | `/api/oi/dashboard/capa-sla` | Manager+ | SLA adherence metrics |
| `GET` | `/api/oi/dashboard/capa-effectiveness` | Manager+ | Effectiveness score distribution |

**Total: 22 endpoints.**

---

## 10. Dashboard Response Shapes — Fully Specified

No field may be added, removed, or renamed in the response without updating both the server endpoint and this document. The UI must use exactly the field names listed here.

### 10.1 `GET /api/oi/dashboard/capa-summary`

**Query params:**
- `periodDays` — integer, default 90, max 365. Filters CAPAs by `created_at >= NOW() - periodDays`.

**Response (single object):**

```json
{
  "totalCapa":                    42,
  "draftCount":                   3,
  "openCount":                    8,
  "inProgressCount":              12,
  "pendingVerificationCount":     4,
  "effectivenessReviewCount":     2,
  "closedCount":                  10,
  "cancelledCount":               3,
  "overdueCount":                 7,
  "closedInPeriod":               5,
  "periodDays":                   90
}
```

| Field | Type | Derivation |
|---|---|---|
| `totalCapa` | integer | Count of all `oi_capa_records` with `created_at >= since` |
| `draftCount` | integer | Count where `status = 'draft'` |
| `openCount` | integer | Count where `status = 'open'` |
| `inProgressCount` | integer | Count where `status = 'in_progress'` |
| `pendingVerificationCount` | integer | Count where `status = 'pending_verification'` |
| `effectivenessReviewCount` | integer | Count where `status = 'effectiveness_review'` |
| `closedCount` | integer | Count where `status = 'closed'` |
| `cancelledCount` | integer | Count where `status = 'cancelled'` |
| `overdueCount` | integer | Count where `effective_due_date < NOW()` AND `status NOT IN ('closed','cancelled')` |
| `closedInPeriod` | integer | Count where `status = 'closed'` AND `closed_at >= since` |
| `periodDays` | integer | Echo of the query param used |

---

### 10.2 `GET /api/oi/dashboard/capa-by-type`

**Query params:**
- `periodDays` — integer, default 180, max 730.

**Response (array of 3 objects, one per type, always all 3 present even if count = 0):**

```json
[
  {
    "capaType":       "corrective",
    "capaTypeLabel":  "Corrective",
    "total":          28,
    "criticalCount":  2,
    "highCount":      8,
    "mediumCount":    14,
    "lowCount":       4,
    "closedCount":    10,
    "openCount":      18,
    "overdueCount":   3
  },
  {
    "capaType":       "preventive",
    "capaTypeLabel":  "Preventive",
    "total":          10,
    "criticalCount":  0,
    "highCount":      2,
    "mediumCount":    6,
    "lowCount":       2,
    "closedCount":    4,
    "openCount":      6,
    "overdueCount":   1
  },
  {
    "capaType":       "combined",
    "capaTypeLabel":  "Combined",
    "total":          4,
    "criticalCount":  1,
    "highCount":      1,
    "mediumCount":    2,
    "lowCount":       0,
    "closedCount":    1,
    "openCount":      3,
    "overdueCount":   1
  }
]
```

| Field | Type | Derivation |
|---|---|---|
| `capaType` | string | `capa_type` value |
| `capaTypeLabel` | string | Human label: `corrective`→`"Corrective"`, `preventive`→`"Preventive"`, `combined`→`"Combined"` |
| `total` | integer | Count for this type within period |
| `criticalCount` | integer | Count where `priority = 'critical'` for this type |
| `highCount` | integer | Count where `priority = 'high'` for this type |
| `mediumCount` | integer | Count where `priority = 'medium'` for this type |
| `lowCount` | integer | Count where `priority = 'low'` for this type |
| `closedCount` | integer | Count where `status = 'closed'` for this type |
| `openCount` | integer | Count where `status NOT IN ('closed','cancelled')` for this type |
| `overdueCount` | integer | Count where overdue AND `status NOT IN ('closed','cancelled')` for this type |

Array always contains exactly 3 elements in the order: `corrective`, `preventive`, `combined`. Zero-fill any type with no records.

---

### 10.3 `GET /api/oi/dashboard/capa-sla`

**Query params:**
- `periodDays` — integer, default 180, max 730. Filters CAPAs created in period.

**Response (single object):**

```json
{
  "closedOnTime":           8,
  "closedOverdue":          2,
  "currentlyOverdue":       7,
  "slaAdherencePct":        80,
  "avgDaysToClose":         18.3,
  "medianDaysToClose":      14.0,
  "avgDaysOverdueOpen":     5.2,
  "l1EscalationsFired":     12,
  "l2EscalationsFired":     4,
  "l3EscalationsFired":     1,
  "periodDays":             180
}
```

| Field | Type | Derivation |
|---|---|---|
| `closedOnTime` | integer | CAPAs where `status = 'closed'` AND `closed_at <= effective_due_date` AND `created_at >= since` |
| `closedOverdue` | integer | CAPAs where `status = 'closed'` AND `closed_at > effective_due_date` AND `created_at >= since` |
| `currentlyOverdue` | integer | CAPAs where `effective_due_date < NOW()` AND `status NOT IN ('closed','cancelled')` |
| `slaAdherencePct` | integer or null | `ROUND(closedOnTime / (closedOnTime + closedOverdue) * 100)`. `null` if `closedOnTime + closedOverdue = 0`. |
| `avgDaysToClose` | float or null | Average of `(closed_at - created_at)` in days for all closed CAPAs in period. `null` if no closed CAPAs. Rounded to 1 decimal place. |
| `medianDaysToClose` | float or null | Median of the same set. `null` if no closed CAPAs. Rounded to 1 decimal place. |
| `avgDaysOverdueOpen` | float or null | Average of `(NOW() - effective_due_date)` in days for currently overdue open CAPAs. `null` if none. Rounded to 1 decimal place. |
| `l1EscalationsFired` | integer | Count of rows in `oi_capa_escalation_log` with `level = 1` for CAPAs created in period |
| `l2EscalationsFired` | integer | Count where `level = 2` |
| `l3EscalationsFired` | integer | Count where `level = 3` |
| `periodDays` | integer | Echo of query param |

---

### 10.4 `GET /api/oi/dashboard/capa-effectiveness`

**Query params:**
- `periodDays` — integer, default 365, max 730. Filters effectiveness reviews by `reviewed_at >= since`.

**Response (single object):**

```json
{
  "totalReviewed":          12,
  "effectiveCount":          9,
  "ineffectiveCount":        3,
  "recurrenceObservedCount": 2,
  "effectivenessRatePct":   75,
  "avgScore":               3.8,
  "avgCyclesToClose":       1.3,
  "scoreDistribution": [
    { "score": 1, "label": "Completely Ineffective",  "count": 0 },
    { "score": 2, "label": "Marginally Effective",    "count": 1 },
    { "score": 3, "label": "Partially Effective",     "count": 2 },
    { "score": 4, "label": "Mostly Effective",        "count": 5 },
    { "score": 5, "label": "Fully Effective",         "count": 4 }
  ],
  "periodDays":             365
}
```

| Field | Type | Derivation |
|---|---|---|
| `totalReviewed` | integer | Count of `oi_capa_effectiveness` rows with `reviewed_at >= since` |
| `effectiveCount` | integer | Count where `is_effective = TRUE` |
| `ineffectiveCount` | integer | Count where `is_effective = FALSE` |
| `recurrenceObservedCount` | integer | Count where `recurrence_observed = TRUE` |
| `effectivenessRatePct` | integer or null | `ROUND(effectiveCount / totalReviewed * 100)`. `null` if `totalReviewed = 0`. |
| `avgScore` | float or null | Average `effectiveness_score` for all rows in period. Rounded to 1 decimal. `null` if none. |
| `avgCyclesToClose` | float or null | For closed CAPAs in period: average of `re_open_count + 1`. Rounded to 1 decimal. `null` if no closed CAPAs. |
| `scoreDistribution` | array of 5 objects | Always exactly 5 objects, one per score 1–5. Zero-fill if no records for a score. |
| `scoreDistribution[].score` | integer | Score value (1–5) |
| `scoreDistribution[].label` | string | Fixed label per score (see constants) |
| `scoreDistribution[].count` | integer | Count of reviews with this score in period |
| `periodDays` | integer | Echo of query param |

---

## 11. File Structure

```
server/oi-capa-routes.ts              — All 22 CAPA endpoints
server/oi-capa-escalation-service.ts  — Nightly escalation scheduler
client/src/pages/oi/
  oi-capa-register.tsx                — Global CAPA register (/oi/capa)
  oi-capa-detail.tsx                  — CAPA detail (/oi/capa/:capaId)
  oi-capa-constants.ts                — All labels, colours, score labels
```

**`server/routes.ts`:**
```typescript
import { oiCapaRouter } from './oi-capa-routes';
app.use('/api/oi', oiCapaRouter);
```

**`server/index.ts`:** Register `runCapaEscalation()` from `oi-capa-escalation-service.ts` as nightly cron.

**`client/src/App.tsx`:** Register `/oi/capa` and `/oi/capa/:capaId` before any catch-all route. Add sidebar link "CAPA Register" under the OI module group.

---

## 12. UI — Page Specifications

### 12.1 CAPA Register (`/oi/capa`)

**Filter bar:**
- Status multi-select (all 7 states, default = all active states)
- Priority multi-select
- CAPA Type toggle (corrective / preventive / combined)
- Overdue Only toggle (amber)
- Assigned To user picker

**Table columns (exact):**
`CAPA No.` | `Title` | `Issue` | `Type` | `Priority` | `Status` | `Assigned To` | `Due Date` | `Overdue` | `→`

- `CAPA No.` — clickable, navigates to `/oi/capa/:capaId`
- `Priority` — coloured badge using `CAPA_PRIORITY_COLORS`
- `Status` — coloured badge using `CAPA_STATUS_COLORS`
- `Due Date` — `fmtDate`. If `isOverdue = true`, rendered in red
- `Overdue` — red badge if `isOverdue = true`

### 12.2 CAPA Detail (`/oi/capa/:capaId`)

**Header:** CAPA number, title, Type badge, Priority badge, Status badge, workflow action buttons (contextual), "← Back to Issue" link.

**Tabs:**
1. **Overview** — all CAPA fields (read-only or inline-editable per status). Assignment panel (assigned_to, verifier, approver). SLA dates. `root_cause_ref`. Link to parent RCA.
2. **Action Items** — list with `action_no`, description, assignee, due_date, status badge, verification_status badge. Add / complete / verify / reject / cancel actions. Gate warning if any `open` actions block the `submit` transition.
3. **Effectiveness** — list of all review records per cycle with score, is_effective, recurrence_observed. Review form shown when `status = 'effectiveness_review'` and actor is SM+.
4. **Audit Log** — CAPA-specific audit entries (filtered by `entityId = capaId` and `entityType = 'capa'`), newest first.

### 12.3 Issue Detail Enhancement

Add **CAPA Summary card** below the RCA Summary card (if present) or above the audit log:
- Count of CAPAs by status (open, in_progress, pending_verification, effectiveness_review, closed, cancelled)
- Count of overdue CAPAs
- List of up to 5 CAPAs with CAPA number, type, status, and due date
- "View all CAPAs" link if count > 5

### 12.4 RCA Page Enhancement

When RCA `status = 'approved'`, add a **"Linked CAPAs"** section below the Overview tab:
- List of CAPAs with `rca_id = :rcaId`
- "Create CAPA from this RCA" button — navigates to CAPA creation with `rcaId` and `issueId` pre-filled and `rootCauseRef` pre-populated from `rootCauseSummary`

---

## 13. CAPA Constants (`oi-capa-constants.ts`) — Fully Specified

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

export const CAPA_ACTION_VERIFICATION_LABELS: Record<string, string> = {
  pending:   'Pending Verification',
  verified:  'Verified',
  rejected:  'Verification Rejected',
};

export const CAPA_ACTION_VERIFICATION_COLORS: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-500',
  verified:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
};
```

---

## 14. Role Enforcement Summary

| Operation | Minimum Role |
|---|---|
| Create CAPA | Manager |
| View CAPA (register, detail) | Manager |
| Edit CAPA fields | Manager |
| Add / edit action items | Manager |
| Complete own action item | `assigned_to` (any role) OR Manager |
| Verify / reject action item verification | Manager |
| Cancel action item | Manager |
| Delete action item | Senior Manager |
| `open` transition | Manager |
| `start` / `submit` transitions | Manager OR `assigned_to` |
| `verify` transition | Manager |
| `close` transition | Senior Manager |
| `cancel` transition | Senior Manager |
| `reopen` transition | Senior Manager |
| Set `due_date` / `extended_due_date` | Senior Manager |
| Set `approver_id` | Senior Manager |
| Record effectiveness review | Senior Manager |
| Delete CAPA (draft only) | Senior Manager |

---

## 15. SLA Overdue Computation

`isOverdue` computed server-side on every read. Not stored in DB.

```
effectiveDueDate = extended_due_date ?? due_date
isOverdue = effectiveDueDate IS NOT NULL
            AND effectiveDueDate < NOW()
            AND status NOT IN ('closed', 'cancelled')
```

CAPAs in `draft` status count toward `currentlyOverdue` on the dashboard if their due date is set and has passed.

---

## 16. Audit Log Entries — Summary

| Event | `action` value | `entityType` | Fields / metadata logged |
|---|---|---|---|
| CAPA created | `capa_created` | `capa` | `capaNumber`, `capaType`, `title`, `priority`, `rcaId` |
| CAPA field updated | `field_updated` | `capa` | `fieldName`, `oldValue`, `newValue` (one entry per changed field) |
| CAPA status transition | `status_changed` | `capa` | `fieldName = 'capa_status'`, `oldValue`, `newValue` |
| CAPA cancelled | `capa_cancelled` | `capa` | `cancellationReason` |
| CAPA reopened | `capa_reopened` | `capa` | `reOpenCount` (new value after increment) |
| CAPA deleted | `capa_deleted` | `capa` | `capaNumber` |
| Action item added | `capa_action_added` | `capa` | `actionNo`, `description` |
| Action item updated | `capa_action_updated` | `capa` | `actionNo`, changed field names and values |
| Action item completed | `capa_action_completed` | `capa` | `actionNo`, `completedBy`, `completionNote` |
| Action item cancelled | `capa_action_cancelled` | `capa` | `actionNo` |
| Action item verified | `capa_action_verified` | `capa` | `actionNo`, `verifiedBy` |
| Action verification rejected | `capa_action_verification_rejected` | `capa` | `actionNo`, `verificationNote` |
| Effectiveness recorded | `capa_effectiveness_recorded` | `capa` | `reviewCycle`, `effectivenessScore`, `isEffective`, `recurrenceObserved` |
| SLA breach | `capa_sla_breach` | `capa` | `metadata.level` (1/2/3), `metadata.overdueDays`, `metadata.capaNumber`, `metadata.recipientUserIds` |

`entityId` = `capa_id` for all CAPA audit entries. `issueId` = parent issue ID for context on all entries.

---

## 17. Implementation Steps

### Step 0 — DB Migration

**Part A — Enum additions (each statement run standalone, NO BEGIN/COMMIT wrapping):**

```sql
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_deleted';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_reopened';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_added';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_updated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_completed';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_cancelled';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_verified';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_action_verification_rejected';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_effectiveness_recorded';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'capa_sla_breach';
```

**Part B — Table creation (inside a single transaction):**

```sql
BEGIN;
CREATE TABLE oi_capa_records ( … );
-- indexes
CREATE TABLE oi_capa_actions ( … );
-- indexes
CREATE TABLE oi_capa_effectiveness ( … );
-- indexes
CREATE TABLE oi_capa_escalation_log ( … );
-- indexes
COMMIT;
```

### Step 1 — `shared/schema.ts`
Add 4 new table definitions. Extend `oiAuditActionEnum` with 12 new values. Export 4 new types.

### Step 2 — `server/oi-capa-routes.ts`
Implement all 22 endpoints. Register in `server/routes.ts`.

### Step 3 — `server/oi-capa-escalation-service.ts`
Implement nightly escalation scheduler. Register in `server/index.ts`.

### Step 4 — RCA reopen gate (`server/oi-rca-routes.ts`)
Add CAPA existence check to the `reopen` transition handler.

### Step 5 — Issue closure gate (`server/oi-transition-service.ts`)
Add CAPA resolution check to the `closed` transition in `validateTransition`.

### Step 6 — `client/src/pages/oi/oi-capa-constants.ts`
All labels, colours, score labels — exactly as specified in Section 13.

### Step 7 — `client/src/pages/oi/oi-capa-register.tsx`
Global register with filter bar and table.

### Step 8 — `client/src/pages/oi/oi-capa-detail.tsx`
Tabbed detail: Overview, Action Items, Effectiveness, Audit Log.

### Step 9 — `client/src/App.tsx` + sidebar
Register routes. Add sidebar link.

### Step 10 — `oi-issue-detail.tsx` enhancement
Add CAPA Summary card.

### Step 11 — `oi-rca-page.tsx` enhancement
Add Linked CAPAs section and Create CAPA button.

### Step 12 — `oi-dashboard.tsx` enhancement
Add 4 CAPA panels using fields exactly as specified in Section 10.

### Step 13 — Smoke validation
- CAPA creation with valid RCA reference
- CAPA creation without `rca_id` → HTTP 422
- CAPA creation against non-approved RCA → HTTP 409
- RCA reopen blocked when active CAPA exists → HTTP 409
- Issue close blocked when open CAPA exists → HTTP 409
- All 7 transition paths including gate enforcement
- `recurrence_observed = TRUE` blocks `closed` → HTTP 409
- Action item `pending_verification` gate
- Effectiveness review closure gate
- Nightly escalation: correct level fired, no duplicate audit events
- Dashboard panels return exactly the fields specified in Section 10
- Unauthorized access returns HTTP 403

---

*End of Phase 1D Execution Plan — REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT*
