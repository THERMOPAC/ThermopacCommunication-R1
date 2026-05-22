# Operational Intelligence — Phase 2A Execution Plan

**Status:** REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-22 (revised 2026-05-22)  
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)  
**Phase 1B Baseline:** `docs/operational-intelligence-phase1b-execution.md` (COMPLETE)  
**Phase 1C Baseline:** `docs/operational-intelligence-phase1c-execution.md` (COMPLETE)  
**Phase 1D Baseline:** `docs/operational-intelligence-phase1d-execution.md` (COMPLETE)  
**Phase 2A Scope:** SOP Intelligence — SOP Master, Revisions, Workflow, Approvals, Ownership, Department/Process Mapping, Linkage to RCA/CAPA/Issues, Effectiveness Tracking, Acknowledgment & Training Assignment, Register, Detail Page, Dashboards  
**Prepared by:** Architecture review session

---

## Governance Rules (Non-Negotiable — inherited from Phases 1A–1D, extended here)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- All mutations write to `oi_audit_log`. Every field change on every SOP entity produces a `field_updated` or `status_changed` audit entry via `writeAuditLog`.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size.
- **All Phase 1A–1D server-side rules remain fully active.** Phase 2A does not modify or relax any prior rule.
- **`ALTER TYPE … ADD VALUE` statements must be executed as standalone commands, each on its own, outside any `BEGIN … COMMIT` transaction block.**
- The `writeAuditLog` function from `server/oi-audit-service.ts` is the only permitted way to write to `oi_audit_log`.
- SOP numbers are server-assigned at creation. Never accepted from client.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.
- `MANAGER_ROLES` = `['Manager', 'Senior Manager', 'General Manager', 'Superuser']`.
- `SM_ROLES` = `['Senior Manager', 'General Manager', 'Superuser']`.
- Departments are the fixed list from the application: `Accounts`, `Administration`, `After Sales`, `Design`, `Marketing`, `Production`, `Projects`, `Purchase`, `Quality Control`, `Stores`.

---

## Explicit Exclusions — Forbidden in Phase 2A Code

The following logic is **prohibited** from appearing anywhere in Phase 2A code, routes, services, or UI.

| Category | Prohibited |
|---|---|
| ERP enforcement | SAP-triggered SOP activation, purchase order gates, ERP-driven status changes, ERP workflow blocking (SAP state gates on SOP transitions) |
| ERP checklist injection | ERP-generated checklist items injected into SOP content or SOP workflow steps |
| Dynamic ERP forms | ERP-populated form fields, SAP master data auto-filling SOP fields at any stage |
| Auto-generated SOP content | AI-generated, ERP-generated, or template-engine-generated SOP text, sections, or procedures |
| AI / ML | OpenAI API calls, embeddings, semantic search, AI-suggested linkages |
| Predictive analytics | Trend forecasting, ML-based compliance scoring, risk prediction |
| Legal hold | Legal hold flags, immutability for legal purposes |
| Evidence integrity | SHA-256 cryptographic proof, tamper detection, blockchain anchoring |
| Automatic SOP activation | SOPs do not auto-activate on `effective_date`. Activation is always a manual `activate` transition by an authorised user. |
| Email notifications | No SendGrid or any email dispatch in Phase 2A. Notification data computed and audit-logged only. |
| File attachments | SOP document file upload to GCS is excluded from Phase 2A. Document reference is a free-text field only. |
| Lessons learned | Lessons learned records, lessons learned linkage |
| Commissioning / inspection | Commissioning checklists, inspection order linkage |

---

## Phase 2A Scope

### In Scope

| Area | Detail |
|---|---|
| SOP Master Record | Single canonical record per SOP with numbering, ownership, status, department/process mapping |
| SOP Numbering | Server-assigned format `SOP-{YYYY}-{NNN}` |
| SOP Revisions | Full revision history with draft/review/approve/reject workflow per revision cycle |
| SOP Workflow | Five-state lifecycle: `draft → under_review → approved → active → retired` |
| SOP Approvals | SM+ approver assignment; revision approval/rejection with mandatory rejection reason |
| SOP Ownership | `owner_id` (Manager+), `approver_id` (SM+), `department`, `process_area` |
| SOP Department/Process Mapping | `department` (fixed list), `process_area` (free-text), `sop_type` (taxonomy) |
| SOP Linkage to Issues/RCA/CAPA | M:N linkage table; link can reference any `oi_issues`, `oi_rca_records`, or `oi_capa_records` record; link note required |
| SOP Effectiveness Tracking | Post-activation effectiveness reviews per cycle: score 1–5, deviation_observed, requires_revision |
| SOP Acknowledgment & Training Assignment | Managers assign acknowledgment tasks to users; users explicitly acknowledge; tracked per (sop, revision, user) |
| SOP Register | Filterable list with status, department, type, overdue-acknowledgment, overdue-review |
| SOP Detail Page | Full detail: info, revisions tab, linkages tab, acknowledgments tab, effectiveness tab, audit log |
| SOP Dashboards | 4 dashboard panels: summary overview, acknowledgment compliance rate, effectiveness rate, department breakdown |

### Explicitly Excluded from Phase 2A

ERP enforcement, ERP workflow blocking, ERP checklist injection, dynamic ERP forms, auto-generated SOP content, AI agents, AI governance, predictive analytics, legal hold, evidence integrity, file attachments to GCS, email notifications, SHA-256 cryptographic proof, OpenAI API calls, vector embeddings, automatic SOP activation, lessons learned linkage, commissioning checklists.

---

## 1. SOP Numbering

- Format: `SOP-{YYYY}-{NNN}` where `YYYY` = 4-digit calendar year of creation (IST) and `NNN` = 3-digit zero-padded global sequence within that year.
- `NNN` starts at `001` for the first SOP of each year and increments globally (not per-department, not per-type).
- Server computes next number using: `SELECT COUNT(*)::int AS cnt FROM oi_sop_records WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Kolkata') = {year}` + 1, wrapped in `pg_advisory_xact_lock(hashtext('sop_number_seq'))`.
- `sop_number` stored as TEXT. Immutable once set. Never accepted from client.
- Examples: `SOP-2026-001`, `SOP-2026-012`, `SOP-2027-001`.

---

## 2. Schema Changes — New Tables

### 2.1 `oi_sop_records`

Master SOP record. One row per SOP document. Holds current/live state only; full revision history is in `oi_sop_revisions`.

```sql
CREATE TABLE oi_sop_records (
  id                  SERIAL PRIMARY KEY,
  sop_number          TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  sop_type            TEXT NOT NULL
                        CHECK (sop_type IN ('procedure','work_instruction','policy','guideline','checklist')),
  department          TEXT NOT NULL,
  process_area        TEXT NOT NULL,
  document_reference  TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','under_review','approved','active','retired')),
  owner_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approver_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  revision_number     INTEGER NOT NULL DEFAULT 0,
  effective_date      TIMESTAMP,
  review_due_date     TIMESTAMP,
  next_review_date    TIMESTAMP,
  activated_at        TIMESTAMP,
  retired_at          TIMESTAMP,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oi_sop_records_status       ON oi_sop_records(status);
CREATE INDEX idx_oi_sop_records_department   ON oi_sop_records(department);
CREATE INDEX idx_oi_sop_records_owner        ON oi_sop_records(owner_id);
CREATE INDEX idx_oi_sop_records_sop_type     ON oi_sop_records(sop_type);
CREATE INDEX idx_oi_sop_records_review_due   ON oi_sop_records(review_due_date);
```

**Field rules:**

| Field | Rule |
|---|---|
| `sop_number` | Server-assigned at creation. Format `SOP-{YYYY}-{NNN}`. Immutable. Never accepted from client. |
| `title` | Required. Min 5 chars, max 200 chars. |
| `description` | Required. Min 10 chars. Editable in `draft` only. |
| `sop_type` | Required at creation. Immutable once status transitions from `draft` to `under_review`. Values: `procedure`, `work_instruction`, `policy`, `guideline`, `checklist`. |
| `department` | Required. Must be a value from the fixed department list. |
| `process_area` | Required. Free-text. Max 100 chars. Describes the specific process or subprocess (e.g., "Incoming Inspection", "Drawing Release"). |
| `document_reference` | Optional. Free-text. Max 200 chars. External reference code or document number. |
| `status` | Transitions governed by Section 4. Never accepted raw from client. |
| `owner_id` | Required. Must be a user with role Manager+. Editable in `draft` and `under_review`. |
| `approver_id` | SM+ only to set. Must not equal `owner_id`. Editable in `draft` and `under_review`. |
| `revision_number` | Starts at 0 (draft). Incremented server-side to 1 on first `approved` transition, then incremented by 1 on each subsequent `approved` revision. Never accepted from client. |
| `effective_date` | Optional. SM+ only to set. The date from which the SOP is intended to be in force. Setting this does not auto-activate the SOP. |
| `review_due_date` | Optional. SM+ only to set. Date by which the SOP should be reviewed for continued relevance. If `review_due_date < NOW()` and `status = 'active'`, the SOP appears as "review overdue" in the register. |
| `next_review_date` | Optional. SM+ only to set. Computed future review date after a successful effectiveness review or manual update. |
| `activated_at` | Set server-side when `activate` transition fires. Immutable once set. |
| `retired_at` | Set server-side when `retire` transition fires. Immutable. |
| `created_by` | Set server-side from `req.user.id`. Never accepted from client. |
| `updated_at` | Set server-side on every PATCH. |

---

### 2.2 `oi_sop_revisions`

Full revision history. Each approved revision cycle creates one row. Draft revisions are also stored to preserve in-progress work.

```sql
CREATE TABLE oi_sop_revisions (
  id                  SERIAL PRIMARY KEY,
  sop_id              INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE CASCADE,
  revision_number     INTEGER NOT NULL,
  change_summary      TEXT NOT NULL,
  change_rationale    TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','under_review','approved','rejected')),
  submitted_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at        TIMESTAMP,
  reviewed_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_notes        TEXT,
  approved_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_at         TIMESTAMP,
  rejected_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason    TEXT,
  rejected_at         TIMESTAMP,
  created_by          INTEGER NOT NULL REFERENCES users(id),
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sop_revision_number UNIQUE (sop_id, revision_number)
);

CREATE INDEX idx_oi_sop_revisions_sop_id ON oi_sop_revisions(sop_id);
CREATE INDEX idx_oi_sop_revisions_status ON oi_sop_revisions(status);
```

**Field rules:**

| Field | Rule |
|---|---|
| `revision_number` | Server-assigned. Equals `sop.revision_number + 1` at the time of revision creation. Never accepted from client. |
| `change_summary` | Required. Min 10 chars, max 500 chars. Summary of what changed. |
| `change_rationale` | Required. Min 10 chars, max 1000 chars. Why the change is needed (may reference linked issues/RCAs/CAPAs). |
| `status` | `draft → under_review → approved` or `under_review → rejected`. Rejected revision returns to `draft` for amendment — the same revision row is updated, not recreated. |
| `submitted_by` | Set server-side from `req.user.id` when `submit` transition fires. |
| `submitted_at` | Set server-side to NOW() when `submit` fires. |
| `reviewed_by` | Set server-side from `req.user.id` when `approve` or `reject` fires. |
| `review_notes` | Optional. SM+ may add review notes on approval. |
| `approved_by` | Set server-side from `req.user.id` when `approve` fires. Must be the SOP's `approver_id` or a Superuser. |
| `approved_at` | Set server-side to NOW() when `approve` fires. Immutable once set. |
| `rejected_by` | Set server-side from `req.user.id` when `reject` fires. |
| `rejection_reason` | Required when `reject` fires. Min 10 chars, max 1000 chars. |
| `rejected_at` | Set server-side to NOW() when `reject` fires. |
| Create rule | A new revision can be created only when the SOP status is `active` or `approved` and there is no existing revision in `draft` or `under_review` for this SOP. At most one active revision per SOP at any time. HTTP 409 if a pending revision already exists. |
| Approval effect | On `approve`: SOP `revision_number` is incremented server-side; SOP status returns to `approved` if it was `active` (requiring re-activation by SM+). A new acknowledgment assignment cycle may be initiated by the owner. |
| Max revisions per SOP | Unlimited. Historical revisions are read-only once status is `approved` or `rejected`. |

---

### 2.3 `oi_sop_linkages`

Many-to-many linkage between SOPs and OI entities (issues, RCAs, CAPAs).

```sql
CREATE TABLE oi_sop_linkages (
  id            SERIAL PRIMARY KEY,
  sop_id        INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE CASCADE,
  linked_type   TEXT NOT NULL
                  CHECK (linked_type IN ('issue','rca','capa')),
  linked_id     INTEGER NOT NULL,
  link_note     TEXT NOT NULL,
  linked_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sop_linkage UNIQUE (sop_id, linked_type, linked_id)
);

CREATE INDEX idx_oi_sop_linkages_sop_id      ON oi_sop_linkages(sop_id);
CREATE INDEX idx_oi_sop_linkages_linked_type ON oi_sop_linkages(linked_type, linked_id);
```

**Field rules:**

| Field | Rule |
|---|---|
| `sop_id` | Must reference an existing SOP. |
| `linked_type` | One of `issue`, `rca`, `capa`. |
| `linked_id` | Must reference an existing record of the corresponding type. Server validates existence — returns HTTP 404 if target not found. |
| `link_note` | Required. Min 5 chars, max 500 chars. Explains why this SOP is relevant to the linked entity. |
| `linked_by` | Set server-side from `req.user.id`. Manager+ required to add or remove linkages. |
| Duplicate guard | Unique constraint on `(sop_id, linked_type, linked_id)`. Duplicate returns HTTP 409. |
| Retired SOP gate | Linkage creation is blocked if the SOP status is `retired`. Server returns HTTP 422: `"Retired SOPs cannot receive new linkages."` |
| Deletion | Linkage deletion permitted by Manager+ and by Superuser. Does not affect the SOP or the linked entity. **Deletion must always write a `sop_unlinked` audit event.** The audit `context` field must contain the SOP number, and the `fieldName` field must carry `"{linked_type}:{linked_id}"` so that the linked entity type and ID are recoverable from the audit log. |
| Reverse lookup | `GET /api/oi/issues/:id/sop`, `GET /api/oi/capa/:capaId/sop`, `GET /api/oi/rca/:rcaId/sop` — return all SOPs linked to the given entity, ordered by `created_at` descending. |

---

### 2.4 `oi_sop_acknowledgments`

Tracks acknowledgment assignments and completion per user per SOP revision.

```sql
CREATE TABLE oi_sop_acknowledgments (
  id                SERIAL PRIMARY KEY,
  sop_id            INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE CASCADE,
  revision_number   INTEGER NOT NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  due_date          TIMESTAMP,
  acknowledged_at   TIMESTAMP,
  acknowledgment_note TEXT,
  CONSTRAINT uq_sop_ack UNIQUE (sop_id, revision_number, user_id)
);

CREATE INDEX idx_oi_sop_ack_sop_id  ON oi_sop_acknowledgments(sop_id);
CREATE INDEX idx_oi_sop_ack_user_id ON oi_sop_acknowledgments(user_id);
CREATE INDEX idx_oi_sop_ack_due     ON oi_sop_acknowledgments(due_date);
```

**Field rules:**

| Field | Rule |
|---|---|
| `sop_id` | The SOP being acknowledged. |
| `revision_number` | The specific revision the user is acknowledging. Set server-side from the SOP's current `revision_number` at assignment time. Never accepted from client. |
| `user_id` | The user required to acknowledge. Any active user. |
| `assigned_by` | Set server-side from `req.user.id`. Manager+ required to assign. |
| `assigned_at` | Set server-side to NOW(). |
| `due_date` | Optional. If set and `acknowledged_at IS NULL` and `due_date < NOW()`, the acknowledgment is overdue. |
| `acknowledged_at` | NULL until the user explicitly acknowledges. Set server-side to NOW() when `acknowledge` action fires. Only the assigned `user_id` may acknowledge their own assignment (or Superuser on their behalf). |
| `acknowledgment_note` | Optional. Max 1000 chars. User may add a note when acknowledging (e.g. concerns noted). |
| Duplicate guard | Unique constraint on `(sop_id, revision_number, user_id)`. Attempting to assign the same user twice for the same revision returns HTTP 409. |
| Withdrawal | Assignment can be withdrawn (deleted) by Manager+ if `acknowledged_at IS NULL`. Cannot delete an already-acknowledged assignment. Withdrawal **must write a `sop_acknowledgment_withdrawn` audit event** with the withdrawn `user_id` and `revision_number` in the `context` field. |
| SOP must be active | Acknowledgment assignments can only be created when: (a) SOP status = `active`, AND (b) SOP `revision_number >= 1` (at least one revision has been approved and activated). HTTP 422 with error `sop_not_ready_for_acknowledgment` if either condition is not met. No pending revision (`draft` or `under_review`) is permitted — a SOP mid-revision is considered not yet stable for new assignments. |
| Retired SOP gate | Acknowledgment assignment creation is blocked if SOP status = `retired`. Server returns HTTP 422: `"Retired SOPs cannot receive acknowledgment assignments."` |
| Assignment audit | Assignment (batch or single) **must write a `sop_acknowledgment_assigned` audit event** per assigned user. The `context` field carries the SOP number and revision number. The `fieldName` carries the assigned `user_id`. |
| Acknowledge audit | User acknowledgment **must write a `sop_acknowledged` audit event**. The `context` field carries the SOP number and revision number. The `fieldName` carries the acknowledging `user_id`. |

---

### 2.5 `oi_sop_effectiveness`

Periodic effectiveness review records for an active SOP.

```sql
CREATE TABLE oi_sop_effectiveness (
  id                   SERIAL PRIMARY KEY,
  sop_id               INTEGER NOT NULL REFERENCES oi_sop_records(id) ON DELETE CASCADE,
  review_cycle         INTEGER NOT NULL DEFAULT 1,
  reviewer_id          INTEGER NOT NULL REFERENCES users(id),
  reviewed_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  effectiveness_score  INTEGER NOT NULL CHECK (effectiveness_score BETWEEN 1 AND 5),
  is_effective         BOOLEAN NOT NULL,
  deviation_observed   BOOLEAN NOT NULL DEFAULT FALSE,
  requires_revision    BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_notes       TEXT,
  recommendation       TEXT,
  CONSTRAINT uq_sop_effectiveness_cycle UNIQUE (sop_id, review_cycle)
);

CREATE INDEX idx_oi_sop_effectiveness_sop_id ON oi_sop_effectiveness(sop_id);
```

**Field rules:**

| Field | Rule |
|---|---|
| `review_cycle` | Server-assigned. Equals `COUNT(*) + 1` of existing effectiveness reviews for this SOP. Never accepted from client. |
| `reviewer_id` | Set server-side from `req.user.id`. SM+ required. |
| `reviewed_at` | Set server-side to NOW(). |
| `effectiveness_score` | Required. Integer 1–5. 1=Completely Ineffective, 2=Marginally Effective, 3=Partially Effective, 4=Mostly Effective, 5=Fully Effective. |
| `is_effective` | Required. Boolean. |
| `deviation_observed` | Required. Boolean. TRUE if staff have been observed deviating from the SOP. |
| `requires_revision` | Required. Boolean. If TRUE, owner is expected to initiate a revision. |
| `recommendation` | Required when `is_effective = FALSE` or `requires_revision = TRUE`. Min 10 chars, max 1000 chars. |
| `evidence_notes` | Optional. Max 2000 chars. |
| Contradiction rule 1 | `is_effective = TRUE` AND `deviation_observed = TRUE` cannot both be set in the same record. Server returns HTTP 422: `"A SOP cannot be effective and have deviations observed simultaneously."` |
| Contradiction rule 2 | `is_effective = TRUE` AND `requires_revision = TRUE` cannot both be set in the same record. Server returns HTTP 422: `"A SOP marked effective cannot simultaneously require revision."` |
| Create rule | Permitted only when SOP status is `active`. SM+ only. Blocked if SOP status is `retired` — HTTP 422: `"Retired SOPs cannot receive effectiveness reviews."` |
| Unique per cycle | One review per `(sop_id, review_cycle)`. Duplicate attempt returns HTTP 409. |

---

### 2.6 `oi_audit_action` Enum Additions (Phase 2A)

**13 new values** added to the existing `oi_audit_action` Postgres enum.

**Migration script rule:** Each statement runs standalone, outside any transaction block.

```sql
-- Run each line as a standalone command. DO NOT wrap in BEGIN / COMMIT.
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_created';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_revised';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_submitted_for_review';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_approved';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_rejected';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_activated';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_retired';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_linked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_unlinked';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_acknowledgment_assigned';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_acknowledged';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_acknowledgment_withdrawn';
ALTER TYPE oi_audit_action ADD VALUE IF NOT EXISTS 'sop_effectiveness_recorded';
```

**Notes:**
- SOP workflow status transitions reuse the existing `status_changed` enum value with `fieldName = 'sop_status'`.
- `field_updated` is used for individual field changes on `oi_sop_records`.
- `sop_revised` is written when a revision is created (a new `oi_sop_revisions` row).
- `sop_acknowledgment_withdrawn` is written whenever a pending acknowledgment assignment is deleted by a Manager+.
- `shared/schema.ts` `oiAuditActionEnum` pgEnum array must be extended with all 13 values.
- All SOP audit writes use `writeSopAuditLog()` from `server/oi-sop-audit-service.ts`, which inserts into the dedicated `oi_sop_audit_log` table with a `sop_id` FK. **`writeAuditLog` is NOT used for SOP entities.** See Amendment 001 (`docs/phase2a-amendment-001-sop-audit-governance.md`) for the full rationale and governance decision.

---

## 3. Schema Changes to Existing Tables

### 3.1 No changes to `oi_issues`, `oi_rca_records`, or `oi_capa_records`

SOP linkage is managed entirely through `oi_sop_linkages`. No FK columns are added to existing tables. Reverse lookups use the `linked_type/linked_id` index on `oi_sop_linkages`.

---

## 4. SOP Workflow — State Machine

### 4.1 States

| State | Description |
|---|---|
| `draft` | SOP being authored. Fully editable. Not counted in compliance metrics. |
| `under_review` | Submitted to approver for review. Locked for editing. |
| `approved` | Approved by SM+ approver. Ready for activation but not yet in force. |
| `active` | Manually activated by SM+. Currently in force. SLA clock (review_due_date) applies. Acknowledgment assignments can be issued. |
| `retired` | Permanently withdrawn. No new linkages or acknowledgments permitted. Final state. |

### 4.2 SOP Status Transitions

| From | To | Action Value | Role Required | Pre-conditions | Server Actions |
|---|---|---|---|---|---|
| `draft` | `under_review` | `submit` | Manager+ (must be owner or SM+) | `approver_id` must be set; `approver_id` ≠ `owner_id` | Set `submitted_at`; write `sop_submitted_for_review` audit |
| `under_review` | `approved` | `approve` | SM+ (must be the SOP's `approver_id` or Superuser) | None | Increment `revision_number` to 1 (first approval); write `sop_approved` audit |
| `under_review` | `draft` | `reject` | SM+ (must be the SOP's `approver_id` or Superuser) | `rejection_reason` required (min 10 chars) | Write rejection reason to latest revision; write `sop_rejected` audit |
| `approved` | `active` | `activate` | SM+ | **All five pre-conditions must pass** — see Section 5.3. HTTP 422 if any fails. | Set `activated_at = NOW()`; write `sop_activated` audit |
| `active` | `approved` | `revise` | SM+ | No pending revision exists (status `draft` or `under_review`) | Triggers creation of a new `oi_sop_revisions` row; SOP status returns to `approved` after revision is approved — this is the Revision Workflow (Section 4.3) |
| `active` | `retired` | `retire` | SM+ | No pending revision; `retirement_reason` required (min 10 chars) | Set `retired_at = NOW()`; write `sop_retired` audit |
| `approved` | `retired` | `retire` | SM+ | `retirement_reason` required | Set `retired_at = NOW()`; write `sop_retired` audit |

Any transition not listed above is prohibited. Server returns HTTP 409 for any unlisted attempt.

### 4.3 Revision Workflow (Sub-State Machine on `oi_sop_revisions`)

A revision is a formal change proposal to an active or approved SOP. It follows its own lifecycle within `oi_sop_revisions`.

| From | To | Action | Role Required | Pre-conditions | Server Actions |
|---|---|---|---|---|---|
| — | `draft` (new row) | Create revision | Manager+ | SOP status `active` or `approved`; no existing revision in `draft` or `under_review`; SOP status must NOT be `retired` — HTTP 422: `"Retired SOPs cannot receive new revisions."` | Create row; write `sop_revised` audit |
| `draft` | `under_review` | Submit revision | Manager+ (must be owner or SM+) | `change_summary` min 10 chars; `change_rationale` min 10 chars | Set `submitted_by`, `submitted_at`; write `sop_submitted_for_review` audit |
| `under_review` | `approved` | Approve revision | SM+ (must be SOP's `approver_id` or Superuser) | None | Set `approved_by`, `approved_at`; increment SOP `revision_number`; SOP status returns to `approved` if currently `active`; write `sop_approved` audit |
| `under_review` | `rejected` | Reject revision | SM+ (must be SOP's `approver_id` or Superuser) | `rejection_reason` min 10 chars | Set `rejected_by`, `rejected_at`, `rejection_reason`; write `sop_rejected` audit |
| `rejected` | `draft` | Amend | Manager+ (must be owner) | — | Reset `status` to `draft`; clear `rejected_by`, `rejected_at`; update `change_summary` / `change_rationale`; write `field_updated` audit |

**When a revision is approved:**
- `oi_sop_records.revision_number` is incremented by 1 server-side.
- If the SOP's status was `active` at the time of revision approval, the SOP status is set to `approved`. The owner must explicitly re-activate via the `activate` transition. This ensures the owner intentionally publishes the revised SOP.
- Outstanding acknowledgments for prior revision numbers remain in the table as historical records but are immediately **obsolete** — they are excluded from all compliance metrics. Pending (unacknowledged) assignments from prior revisions do NOT transfer forward and are NOT auto-completed. Users must be re-assigned and must acknowledge the new revision separately.

**When the revised SOP is re-activated (`activate` transition fires after a revision):**
- The SOP's `revision_number` already reflects the new approved revision (incremented at approval time).
- All compliance metrics (`pendingAckCount`, `acknowledgedCount`, acknowledgment rate) are now computed exclusively against `revision_number = sop.revision_number` (the new revision). Any unacknowledged rows from prior revision numbers are treated as historical records with no compliance weight.
- The owner must explicitly create new acknowledgment assignments for the new revision. No automatic re-assignment occurs.

### 4.4 Immutable Fields Post-Under-Review

Once `under_review` transition fires, these fields become immutable for the SOP master record until the SOP returns to `draft` (via rejection):
`sop_type`, `sop_number`, `created_by`.

### 4.5 Editable Fields by SOP Status

| Field | `draft` | `under_review` | `approved` | `active` | `retired` |
|---|---|---|---|---|---|
| `title` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `description` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `department` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `process_area` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `document_reference` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `owner_id` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `approver_id` (SM+) | ✓ | ✓ | ✗ | ✗ | ✗ |
| `effective_date` (SM+) | ✓ | ✓ | ✓ | ✓ | ✗ |
| `review_due_date` (SM+) | ✓ | ✓ | ✓ | ✓ | ✗ |
| `next_review_date` (SM+) | ✓ | ✓ | ✓ | ✓ | ✗ |

PATCH handler enforces this table. Attempt to write a restricted field returns HTTP 422 with the field name.

---

## 5. Business Rules

### 5.1 SOP Creation

- Manager+ only (role check → HTTP 403 if not met).
- `sop_type` is immutable after `under_review` transition.
- `owner_id` defaults to `req.user.id` if not supplied.
- `approver_id` must not equal `owner_id` → HTTP 422.
- `sop_number` server-assigned; advisory lock prevents duplicates.

### 5.2 Approver Separation

- `approver_id` must not equal `owner_id` at creation or on PATCH.
- The `approve` revision action can only be executed by the SOP's `approver_id` or by a Superuser — not by the `owner_id`, even if the owner is SM+.

### 5.3 SOP Activation Pre-Conditions

The `activate` transition (`approved → active`) is blocked unless **all five** of the following conditions are satisfied simultaneously. Each failed condition returns HTTP 422 with the specific error code listed.

| # | Pre-Condition | Error Code | Error Message |
|---|---|---|---|
| 1 | An approved revision exists (`revision_number >= 1`) | `sop_no_approved_revision` | `"SOP cannot be activated without at least one approved revision."` |
| 2 | `owner_id IS NOT NULL` | `sop_owner_required` | `"SOP cannot be activated without an owner assigned."` |
| 3 | `approver_id IS NOT NULL` | `sop_approver_required` | `"SOP cannot be activated without an approver assigned."` |
| 4 | `department IS NOT NULL AND department != ''` | `sop_department_required` | `"SOP cannot be activated without a department assigned."` |
| 5 | `process_area IS NOT NULL AND process_area != ''` | `sop_process_area_required` | `"SOP cannot be activated without a process area assigned."` |

If more than one pre-condition fails, the server returns the error for the first failing condition in the order listed above (top-down). All five are checked server-side; UI may surface them as a pre-flight checklist for usability.

### 5.4 Single Active Revision

- At most one revision in `draft` or `under_review` per SOP at any time.
- Attempting to create a second open revision returns HTTP 409: `"A pending revision already exists. Approve or reject the current revision before creating a new one."`.

### 5.4 Review Overdue Detection

- A SOP is **review overdue** if: `status = 'active'` AND `review_due_date IS NOT NULL` AND `review_due_date < NOW()`.
- Computed server-side at query time. Not stored. Surfaced as `isReviewOverdue` boolean in list and detail API responses.

### 5.5 Acknowledgment Overdue Detection

- An acknowledgment is **overdue** if: `acknowledged_at IS NULL` AND `due_date IS NOT NULL` AND `due_date < NOW()`.
- Computed server-side at query time. Surfaced in the acknowledgment list as `isOverdue` boolean.

### 5.6 SOP Retirement Gate

- A SOP cannot be retired if any linked `oi_capa_records` has status not in `closed` or `cancelled` and the linkage type is `capa`. Server returns HTTP 409: `"SOP cannot be retired while linked CAPAs are active."`.
- Rationale: retiring a SOP that governs an in-progress CAPA would leave the CAPA without procedural grounding.

### 5.7 Linked Entity Existence Validation

- On linkage creation, server queries the target table (`oi_issues`, `oi_rca_records`, or `oi_capa_records`) to confirm the record exists. HTTP 404 if not found.
- Withdrawn issues and cancelled CAPAs may still be linked (informational record-keeping). No status gate on the target entity.

### 5.8 SOP Audit Store (Amendment 001)

**⚠ CORRECTED — see `docs/phase2a-amendment-001-sop-audit-governance.md`**

- SOP audit entries are written to the dedicated `oi_sop_audit_log` table via `writeSopAuditLog()` in `server/oi-sop-audit-service.ts`.
- `oi_audit_log.issue_id` is `NOT NULL` in the actual schema — the original plan's claim that it is nullable was incorrect.
- `writeAuditLog` is NOT called for SOP entities. `oi_audit_log` remains an issue-subordinate-only audit table.
- The `context` field in `oi_sop_audit_log` carries the SOP number (e.g., `"SOP SOP-2026-001"`).
- `GET /api/oi/sop/:sopId/audit-log` queries `oi_sop_audit_log WHERE sop_id = :sopId` — no `issue_id` dependency.

---

## 6. API Endpoints (27 endpoints)

All endpoints are prefixed with `/api/oi`. All require session authentication (`req.user` must exist).

### 6.1 SOP Master CRUD

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 1 | `POST` | `/sop` | Manager+ | Create SOP |
| 2 | `GET` | `/sop` | Any | List SOP register (filters: status, department, sopType, ownerId, overdueReviewOnly, search) |
| 3 | `GET` | `/sop/:sopId` | Any | Get SOP detail with action summary, effectiveness summary, pending ack count |
| 4 | `PATCH` | `/sop/:sopId` | Manager+ | Update SOP fields (field-level editability enforced per Section 4.5) |
| 5 | `POST` | `/sop/:sopId/transition` | Role varies per transition | SOP status transition (`submit`, `approve`, `reject`, `activate`, `retire`) |

### 6.2 SOP Revisions

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 6 | `POST` | `/sop/:sopId/revisions` | Manager+ | Create new revision (draft) |
| 7 | `GET` | `/sop/:sopId/revisions` | Any | List all revisions for SOP |
| 8 | `PATCH` | `/sop/:sopId/revisions/:revId` | Manager+ (owner) | Update revision `change_summary` / `change_rationale` (draft only) |
| 9 | `POST` | `/sop/:sopId/revisions/:revId/submit` | Manager+ (owner or SM+) | Submit revision for review |
| 10 | `POST` | `/sop/:sopId/revisions/:revId/approve` | SM+ (`approver_id` or Superuser) | Approve revision |
| 11 | `POST` | `/sop/:sopId/revisions/:revId/reject` | SM+ (`approver_id` or Superuser) | Reject revision (reason required) |

### 6.3 SOP Linkages

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 12 | `POST` | `/sop/:sopId/linkages` | Manager+ | Add linkage to issue/rca/capa |
| 13 | `GET` | `/sop/:sopId/linkages` | Any | List all linkages for a SOP |
| 14 | `DELETE` | `/sop/:sopId/linkages/:linkageId` | Manager+ | Remove linkage |
| 15 | `GET` | `/issues/:id/sop` | Any | List SOPs linked to an issue |
| 16 | `GET` | `/capa/:capaId/sop` | Any | List SOPs linked to a CAPA |
| 17 | `GET` | `/rca/:rcaId/sop` | Any | List SOPs linked to an RCA |

### 6.4 SOP Acknowledgments

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 18 | `POST` | `/sop/:sopId/acknowledgments` | Manager+ | Assign acknowledgment to user(s). Body: `{ userIds: number[], dueDate?: string }`. Batch assignment — creates one row per userId. |
| 19 | `GET` | `/sop/:sopId/acknowledgments` | Any | List acknowledgments for SOP (current revision by default; `?revisionNumber=N` for historical) |
| 20 | `POST` | `/sop/:sopId/acknowledgments/:ackId/acknowledge` | `user_id` of the assignment OR Superuser | User acknowledges the SOP |
| 21 | `DELETE` | `/sop/:sopId/acknowledgments/:ackId` | Manager+ | Withdraw pending acknowledgment (blocked if already acknowledged) |

### 6.5 SOP Effectiveness

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 22 | `POST` | `/sop/:sopId/effectiveness` | SM+ | Record effectiveness review |
| 23 | `GET` | `/sop/:sopId/effectiveness` | Any | List all effectiveness reviews for SOP |

### 6.6 Dashboards

| # | Method | Path | Role | Description |
|---|---|---|---|---|
| 24 | `GET` | `/dashboard/sop-summary` | Any | SOP portfolio overview KPIs |
| 25 | `GET` | `/dashboard/sop-acknowledgment` | Any | Acknowledgment compliance rate by department |
| 26 | `GET` | `/dashboard/sop-effectiveness` | Any | Effectiveness rate and deviation metrics |
| 27 | `GET` | `/dashboard/sop-by-department` | Any | Active SOP count, review-overdue count, pending-ack count per department |

---

## 7. Dashboard Response Shapes

### 7.1 `GET /api/oi/dashboard/sop-summary`

Query params: `?periodDays=90` (optional, default 90)

```json
{
  "totalSop": 42,
  "draftCount": 5,
  "underReviewCount": 3,
  "approvedCount": 4,
  "activeCount": 28,
  "retiredCount": 2,
  "reviewOverdueCount": 6,
  "pendingAckCount": 15,
  "newInPeriod": 8
}
```

### 7.2 `GET /api/oi/dashboard/sop-acknowledgment`

Query params: `?periodDays=30` (optional, default 30)

```json
[
  {
    "department": "Quality Control",
    "totalAssigned": 24,
    "acknowledged": 18,
    "overdue": 4,
    "pendingOnTime": 2,
    "acknowledgmentRatePct": 75
  }
]
```

Array of objects, one per department that has assignments. Ordered by `acknowledgmentRatePct` ascending (lowest compliance first).

### 7.3 `GET /api/oi/dashboard/sop-effectiveness`

Query params: `?periodDays=365` (optional, default 365)

```json
{
  "totalReviews": 31,
  "effectiveCount": 22,
  "ineffectiveCount": 9,
  "effectivenessRatePct": 71,
  "deviationObservedCount": 7,
  "requiresRevisionCount": 11,
  "avgScore": "3.8",
  "reviewsInPeriod": 31
}
```

### 7.4 `GET /api/oi/dashboard/sop-by-department`

Query params: none (all active SOPs)

```json
[
  {
    "department": "Quality Control",
    "activeCount": 12,
    "reviewOverdueCount": 2,
    "pendingAckCount": 5
  }
]
```

Array ordered by `activeCount` descending.

---

## 8. SOP List API Response Shape

`GET /api/oi/sop` — paginated list

Each item in the array:

```json
{
  "id": 7,
  "sopNumber": "SOP-2026-007",
  "title": "Incoming Material Inspection Procedure",
  "sopType": "procedure",
  "department": "Quality Control",
  "processArea": "Incoming Inspection",
  "status": "active",
  "revisionNumber": 2,
  "ownerName": "Rajesh Kumar",
  "approverName": "Anita Sharma",
  "effectiveDate": "2026-03-01T00:00:00.000Z",
  "reviewDueDate": "2026-09-01T00:00:00.000Z",
  "isReviewOverdue": false,
  "pendingAckCount": 3,
  "linkageCount": 4,
  "createdAt": "2026-02-15T07:30:00.000Z",
  "updatedAt": "2026-04-10T11:00:00.000Z"
}
```

---

## 9. SOP Detail API Response Shape

`GET /api/oi/sop/:sopId` — single SOP with computed summaries

```json
{
  "id": 7,
  "sopNumber": "SOP-2026-007",
  "title": "Incoming Material Inspection Procedure",
  "description": "...",
  "sopType": "procedure",
  "department": "Quality Control",
  "processArea": "Incoming Inspection",
  "documentReference": "QC-IMP-001",
  "status": "active",
  "revisionNumber": 2,
  "effectiveDate": "2026-03-01T00:00:00.000Z",
  "reviewDueDate": "2026-09-01T00:00:00.000Z",
  "nextReviewDate": "2027-03-01T00:00:00.000Z",
  "activatedAt": "2026-03-01T09:00:00.000Z",
  "retiredAt": null,
  "isReviewOverdue": false,
  "ownerName": "Rajesh Kumar",
  "approverName": "Anita Sharma",
  "ownerId": 14,
  "approverId": 22,
  "pendingAckCount": 3,
  "totalAckCount": 8,
  "acknowledgedCount": 5,
  "linkageCount": 4,
  "effectivenessSummary": {
    "totalReviews": 2,
    "latestCycle": 2,
    "latestScore": 4,
    "latestIsEffective": true,
    "latestDeviationObserved": false
  },
  "pendingRevision": null,
  "createdAt": "2026-02-15T07:30:00.000Z",
  "updatedAt": "2026-04-10T11:00:00.000Z"
}
```

`pendingRevision` is either `null` or an object `{ id, revisionNumber, status, changeSummary, submittedAt }` for the in-progress revision (if any).

---

## 10. Client Pages

### 10.1 SOP Register — `/oi/sop`

**File:** `client/src/pages/oi/oi-sop-register.tsx`

- Filterable table: status (multi-select badge filter), department (dropdown), sopType (dropdown), `overdueReviewOnly` toggle, search by title/SOP number.
- Columns: SOP Number, Title, Type, Department, Process Area, Status badge, Revision, Owner, Review Due (with overdue highlight), Pending Ack count.
- Row click navigates to `/oi/sop/:sopId`.
- "New SOP" button (Manager+) opens inline creation form (title, description, sopType, department, processArea, documentReference, ownerId, approverId fields).
- Empty state: "No SOPs found. Create the first one."

### 10.2 SOP Detail — `/oi/sop/:sopId`

**File:** `client/src/pages/oi/oi-sop-detail.tsx`

- Header: SOP number, title, status badge, revision badge, department/process area tags.
- Info card: type, owner, approver, effective date, review due date, document reference.
- Transition action bar: context-sensitive buttons based on current status and user role. Examples:
  - Draft + owner → "Submit for Review" button.
  - Under Review + approver → "Approve" / "Reject" buttons.
  - Approved + SM+ → "Activate" button.
  - Active + SM+ → "Retire" button.
  - Active + owner → "Create Revision" button (when no pending revision exists).
- Tabs: **Overview** | **Revisions** | **Linkages** | **Acknowledgments** | **Effectiveness** | **Audit Log**

**Overview tab:**
- SOP field grid (all master fields).
- Pending revision alert card (if exists): revision number, status, change summary, "View Revision" link.
- Acknowledgment compliance mini-chart: acknowledged / total for current revision.

**Revisions tab:**
- List of all `oi_sop_revisions` rows ordered by `revision_number` descending.
- Each row: revision number, status badge, change summary (truncated), submitted date, approved/rejected date, approved by.
- Expandable row: full change_summary, change_rationale, review_notes, rejection_reason.
- Active revision (draft/under_review): shows action buttons inline (Submit / Approve / Reject / Amend).

**Linkages tab:**
- List of all linkages grouped by `linked_type`.
- Each row: type icon, linked entity identifier (issue number / RCA number / CAPA number), link note, linked by, date.
- "Add Linkage" button (Manager+): modal with `linked_type` dropdown, `linked_id` number input (validated on the server), `link_note` field.
- "Remove" button per row (Manager+).

**Acknowledgments tab:**
- Filter: `?revisionNumber=N` selector (defaults to current revision).
- List: user name, department, assigned date, due date, acknowledged date (or "Pending" / "Overdue" badge).
- "Assign Acknowledgment" button (Manager+): multi-select user list with optional due date.
- Current user's own pending acknowledgment (if any) shows a prominent "Acknowledge" button.

**Effectiveness tab:**
- List of effectiveness reviews ordered by `review_cycle` descending.
- Each row: cycle number, score (star display 1–5), is_effective, deviation_observed, requires_revision, reviewer name, date.
- Expandable: evidence_notes, recommendation.
- "Record Effectiveness Review" button (SM+, only when SOP is `active`).

**Audit Log tab:**
- Chronological list of `oi_audit_log` entries filtered by `context LIKE 'SOP SOP-2026-%'` (SOP's sop_number) or by a `sop_id` cross-reference field if implemented.
- Implementation note: since audit log uses `issue_id`, SOP audits are looked up via `context` field containing the SOP number as a substring. Query: `WHERE context LIKE 'SOP {sopNumber}%'`.

### 10.3 SOP Panels on Existing Pages

**OI Dashboard (`oi-dashboard.tsx`):**
- `SopDashboardPanels` component inserted after the CAPA dashboard panels and before Quick Actions.
- Shows 3 cards: SOP Overview (KPIs from `sop-summary`), Acknowledgment Compliance (table from `sop-acknowledgment`), Effectiveness Rate (from `sop-effectiveness`).
- Quick action button: "SOP Register" → `/oi/sop`.

**Issue Detail (`oi-issue-detail.tsx`):**
- `SopLinkedPanel` component: inserted after the `CapaSummaryCard`.
- Shows count of linked SOPs and clickable list of up to 5 SOP numbers with title and status badge.
- "View all linked SOPs" link → `/oi/sop?linkedIssueId={issueId}` (register pre-filtered, or just displays all).

**RCA Page (`oi-rca-page.tsx`):**
- New "Linked SOPs" tab after "Linked CAPAs" tab.
- `LinkedSopTab` component: fetches `GET /api/oi/rca/:rcaId/sop`, displays SOP list with number, title, status, revision.

**CAPA Detail (`oi-capa-detail.tsx`):**
- New "Linked SOPs" tab.
- `CapaLinkedSopTab` component: fetches `GET /api/oi/capa/:capaId/sop`, displays SOP list.

### 10.4 New Constants File

**File:** `client/src/pages/oi/oi-sop-constants.ts`

Contains:
- `SOP_STATUS_LABELS` — human-readable labels for all 5 statuses.
- `SOP_STATUS_COLORS` — Tailwind class strings for status badges.
- `SOP_TYPE_LABELS` — human-readable labels for all 5 types.
- `SOP_TYPE_ICONS` — Lucide icon name per type.
- `SOP_EFFECTIVENESS_SCORE_LABELS` — `{ 1: 'Completely Ineffective', 2: 'Marginally Effective', 3: 'Partially Effective', 4: 'Mostly Effective', 5: 'Fully Effective' }`.

### 10.5 App Router & Sidebar Additions

**`client/src/App.tsx`:**
```
Route path="/oi/sop/:sopId"  → OiSopDetailPage
Route path="/oi/sop"         → OiSopRegisterPage
```
`/oi/sop/:sopId` must appear BEFORE `/oi/sop`.

**`client/src/components/layout.tsx`:**
```
{ icon: BookOpen, label: "SOP Register", href: "/oi/sop" }
```
Inserted after the "CAPA Register" entry in the OI sidebar section.

---

## 11. New Server Files

| File | Purpose |
|---|---|
| `server/oi-sop-routes.ts` | All 26 SOP endpoints |

SOP routes are registered in `server/routes.ts` as:
```typescript
import { oiSopRouter } from "./oi-sop-routes";
app.use("/api/oi", requireAuth, oiSopRouter);
```

No new background scheduler is required for Phase 2A. Review-overdue detection is computed at query time.

---

## 12. Drizzle Schema Additions (`shared/schema.ts`)

Four new Drizzle table definitions:
1. `oiSopRecords` — mirrors `oi_sop_records`
2. `oiSopRevisions` — mirrors `oi_sop_revisions`
3. `oiSopLinkages` — mirrors `oi_sop_linkages`
4. `oiSopAcknowledgments` — mirrors `oi_sop_acknowledgments`
5. `oiSopEffectiveness` — mirrors `oi_sop_effectiveness`

Four exported types:
- `OiSopRecord` = `typeof oiSopRecords.$inferSelect`
- `OiSopRevision` = `typeof oiSopRevisions.$inferSelect`
- `OiSopLinkage` = `typeof oiSopLinkages.$inferSelect`
- `OiSopAcknowledgment` = `typeof oiSopAcknowledgments.$inferSelect`
- `OiSopEffectiveness` = `typeof oiSopEffectiveness.$inferSelect`

`oiAuditActionEnum` extended with all 13 new `sop_*` values.

---

## 13. Migration Script

**Order of execution (psql, each block run as a standalone transaction or direct command):**

1. Run each `ALTER TYPE oi_audit_action ADD VALUE` statement individually (13 statements, standalone, not in a transaction).
2. Run the 5 `CREATE TABLE` statements in a single `BEGIN … COMMIT` transaction block.
3. Run all `CREATE INDEX` statements.
4. Run all `CONSTRAINT` additions (already embedded in CREATE TABLE).

---

## 14. Non-Regression Checklist

| Area | Impact | Note |
|---|---|---|
| `oi_issues` table | None | No columns added |
| `oi_rca_records` table | None | No columns added; new "Linked SOPs" tab is read-only reverse lookup |
| `oi_capa_records` table | None | No columns added; new "Linked SOPs" tab is read-only reverse lookup |
| Phase 1A–1D routes | None | `oiSopRouter` is a new router; no existing route signatures changed |
| `oi_sop_audit_log` | New table (Phase 2A) | SOP-specific audit; `sop_id` FK; `oi_audit_log` is NOT used for SOP entries — see Amendment 001 |
| Payroll, Leave, EPC, PPPC | None | No changes |
| GCS governance | None | No new document flows; `document_reference` is free-text |

---

## 15. Exclusion Verification Table

| Excluded Feature | Verification |
|---|---|
| ERP enforcement | No SAP API calls, no purchase order gate, no ERP-driven transitions |
| ERP workflow blocking | No SAP state gates on SOP transitions; all transitions are manual and role-gated |
| ERP checklist injection | No ERP-sourced checklist items in any SOP field or workflow step |
| Dynamic ERP forms | No SAP master data auto-fills any SOP field; all fields are operator-entered |
| Auto-generated SOP content | No AI, ERP, or template engine generates SOP text, sections, or procedures |
| AI agents | No OpenAI calls, no embeddings, no semantic search |
| Predictive analytics | No ML scoring, no trend forecasting |
| Legal hold | No immutability flags, no legal hold field |
| Evidence integrity | No SHA-256, no cryptographic proof |
| Automatic SOP activation | `activate` is always an explicit SM+ manual transition; `effective_date` is informational only |
| Email notifications | No SendGrid calls; all escalation data is audit-logged only |
| File attachments | `document_reference` is free-text; no GCS upload in Phase 2A |

---

*Phase 2A Execution Plan v1.1 (revised 2026-05-22) — submitted for approval*  
*Implementation does not begin until written approval is received.*
