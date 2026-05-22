# Operational Intelligence — Phase 3A Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-22  
**Phase 2B Baseline:** `docs/operational-intelligence-phase2b-execution.md` (CLOSED)  
**Phase 3A Scope:** Lessons Learned Platform — Records, Linkage, Review Workflow, Approval Workflow, Publication Workflow, Recurrence Monitoring, Effectiveness Review, Dashboards, Cross-Project Learning Register  
**Prepared by:** Architecture review session  
**Revision:** 1

---

## Governance Rules (Non-Negotiable — inherited from all prior phases)

- No assumptions. Every field, rule, and behaviour is explicitly stated in this document.
- No hidden logic. No silent auto-actions. No client-side-only validation.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime` from `client/src/lib/date-format.ts`.
- **Schema migration: `psql` direct SQL only.** `drizzle-kit push` hangs on this schema size.
- **All prior phase server-side rules remain fully active.** Phase 3A does not modify or relax any prior rule.
- **`ALTER TYPE … ADD VALUE` statements must be executed as standalone commands, each on its own, outside any `BEGIN … COMMIT` transaction block.**
- `MANAGER_ROLES` = `['Manager', 'Senior Manager', 'General Manager', 'Superuser']`.
- `SM_ROLES` = `['Senior Manager', 'General Manager', 'Superuser']`.
- `SUPERUSER_ROLES` = `['Superuser']`.
- Lesson numbers are server-assigned. Never accepted from client.
- **Audit governance:** All lesson audit writes go to `oi_lesson_audit_log` via a dedicated `writeLessonAuditLog()` service function — INSERT-only, never updated or deleted. Reasons: (1) `oi_audit_log` is scoped to `oi_issues.id`; (2) `oi_enforcement_audit_log` is scoped to control/hold IDs; (3) lesson records are a first-class entity deserving their own audit trail. This decision is non-negotiable.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.

---

## Explicit Exclusions — Forbidden in Phase 3A Code

| Category | Prohibited |
|---|---|
| AI agents | OpenAI API calls, LLM-generated lessons, AI-suggested linkages, AI-authored recommendations |
| Predictive analytics | ML-based recurrence scoring, trend forecasting, automatic similarity detection |
| Automatic lesson generation | No lesson is ever created automatically. Lesson creation is always a deliberate human action by an authenticated user. |
| Automatic SOP creation | Phase 3A must never automatically create or modify an SOP record as a side effect of lesson publication. |
| Automatic ERP enforcement changes | Phase 3A must never create, activate, or modify enforcement controls or holds as a side effect of lesson publication. |
| Email notifications | No SendGrid or email dispatch in Phase 3A. All notification data is audit-logged only. |
| File attachments to lessons | GCS file upload against lesson records is excluded. All content is free-text only. |
| Automatic recurrence detection | Recurrence checks are always performed by a human reviewer. No system-driven scan of issues for recurrence patterns. |
| Automatic effectiveness scoring | Effectiveness reviews are always human-authored. No calculated score from issue data. |
| Legal hold | Legal hold flags, immutability for legal purposes, legal hold lifecycle. |

---

## Future-Phase Leakage Guard (Non-Negotiable)

The following are explicitly prohibited from appearing in any Phase 3A code, routes, services, schemas, UI, or comments.

| Prohibited Pattern | Reason |
|---|---|
| AI-driven lesson drafting — any logic that auto-populates lesson fields from RCA/CAPA data | Reserved for AI phase only |
| Automatic SOP update on lesson publication — any code that creates or revises a SOP record | Requires separate governance approval |
| Automatic enforcement change on lesson publication — any code that raises or modifies a hold | Phase 2B enforcement is human-only; this rule carries forward |
| Recurrence score — any numeric score computed from issue history | Requires predictive analytics governance |
| Lesson-to-lesson ML similarity matching — any embedding, cosine similarity, or text distance computation | Not approved for any phase without explicit governance review |

---

## Phase 3A Scope

### In Scope

| Area | Detail |
|---|---|
| Lesson Record Master | Full lesson CRUD with controlled vocabulary, scope, priority, category, type |
| Lesson Numbering | Server-assigned `LLN-{YYYY}-{NNN}` |
| Lesson Lifecycle | Six-state workflow: `draft → submitted_for_review → under_review → approved → published → archived`. Rejection path: `submitted_for_review / under_review → rejected → draft`. |
| Lesson Linkage | Polymorphic links to: `issue`, `rca`, `capa`, `sop`, `enforcement_control`, `enforcement_hold`. CRUD with ref lookup. UNIQUE per (lesson, link_type, entity_id). |
| Lesson Review Workflow | Named reviewers assigned per lesson; each reviewer: `pending → approved / rejected / recused`. Lesson moves to `under_review` when first reviewer is assigned. |
| Lesson Approval Workflow | SM+ approval of lesson (moves to `approved`). Rejection returns to `draft`. Rejection reason mandatory (min 20 chars). |
| Lesson Publication Workflow | SM+ publication of approved lesson (moves to `published`). Published lessons are read-only for all fields except archival. |
| Lesson Archival | SM+ archival of published lesson (moves to `archived`). Archive reason mandatory (min 10 chars). Terminal state — no further transitions. |
| Recurrence Monitoring | Human-authored recurrence check records per lesson. Fields: check date, checker, recurrence found (boolean), detail, optional linked issue/RCA, recommendation. |
| Effectiveness Review | Human-authored effectiveness review records per published lesson. Fields: review date, reviewer, status (`pending → completed / deferred`), rating, observations, next review due. |
| Lesson Audit Log | Dedicated `oi_lesson_audit_log` — immutable, INSERT-only, one row per event. |
| Lesson Register | Filterable table: status, category, type, scope, author, department, priority, cross-project flag. |
| Cross-Project Learning Register | Filtered view of published lessons where `cross_project_applicable = true`, grouped by category. |
| SOP Enforcement Lesson Tab | 8th tab on `oi-sop-detail.tsx` — lists published lessons linked to that SOP. |
| Issue/RCA/CAPA Lesson Tab | New "Lessons" tab on existing issue detail, RCA detail, CAPA detail pages — lists lessons linked to that record. |
| Lesson Dashboards | Two dashboard panels: (1) Lesson pipeline summary (by status/category), (2) Recurrence heatmap (by category, rolling 12 months). |
| OI Dashboard Integration | Enforcement panels already on dashboard. Lesson panels added after enforcement panels. |

---

## 1. Lesson Lifecycle

```
                 ┌──────────────────────────────────────────────────────────────┐
                 │                        draft                                 │
                 │   (created by author; all fields editable; not yet submitted) │
                 └──────────────────────────────────────────────────────────────┘
                                            │  POST /submit
                                            ▼
                 ┌──────────────────────────────────────────────────────────────┐
                 │                  submitted_for_review                        │
                 │   (awaiting reviewer assignment by Manager+; review_due_at   │
                 │    set; lesson fields locked for author; editable by SM+ only)│
                 └──────────────────────────────────────────────────────────────┘
                    │ POST /reviewers (first reviewer assigned)    │ POST /reject (SM+)
                    ▼                                              │
                 ┌─────────────────────────────────┐              │
                 │         under_review             │              │
                 │  (reviewer(s) assigned; pending  │              │
                 │   review votes from each)        │              │
                 └─────────────────────────────────┘              │
                    │ POST /approve (SM+, all reviewers done)      │
                    ▼                                              ▼
                 ┌─────────────────────────────────┐  ┌──────────────────────────┐
                 │           approved               │  │        rejected          │
                 │  (SM+ approval recorded;         │  │  (reason mandatory;      │
                 │   ready for publication)         │  │   returns to draft on    │
                 └─────────────────────────────────┘  │   next edit by author)   │
                    │ POST /publish (SM+)              └──────────────────────────┘
                    ▼
                 ┌─────────────────────────────────┐
                 │           published              │
                 │  (read-only; visible in cross-   │
                 │   project register; effectiveness│
                 │   review schedule active)        │
                 └─────────────────────────────────┘
                    │ POST /archive (SM+, reason ≥10 chars)
                    ▼
                 ┌─────────────────────────────────┐
                 │           archived               │
                 │  (terminal; visible in register  │
                 │   with archived badge; no further│
                 │   transitions)                   │
                 └─────────────────────────────────┘
```

### 1.1 Lesson Field Editability by State

| Field Group | `draft` | `submitted_for_review` | `under_review` | `approved` | `published` | `archived` |
|---|---|---|---|---|---|---|
| Core content (title, description, recommendation) | Author / SM+ | SM+ only | SM+ only | SM+ only | ❌ locked | ❌ locked |
| Category / type / scope | Author / SM+ | SM+ only | SM+ only | SM+ only | ❌ locked | ❌ locked |
| Linkages | Manager+ | Manager+ | Manager+ | Manager+ | Manager+ | ❌ locked |
| Reviewer assignment | SM+ | SM+ | SM+ | ❌ | ❌ | ❌ |
| Recurrence checks | — | — | — | — | Manager+ | ❌ |
| Effectiveness reviews | — | — | — | — | Manager+ | ❌ |

---

## 2. Controlled Vocabulary

### 2.1 Lesson Status Values (6)

`draft`, `submitted_for_review`, `under_review`, `approved`, `published`, `archived`

### 2.2 Lesson Category Values (10)

| Value | Label |
|---|---|
| `design_deficiency` | Design Deficiency |
| `procurement_quality` | Procurement Quality |
| `execution_process` | Execution Process |
| `testing_commissioning` | Testing & Commissioning |
| `documentation_control` | Documentation Control |
| `communication_coordination` | Communication & Coordination |
| `vendor_management` | Vendor Management |
| `planning_scheduling` | Planning & Scheduling |
| `safety_compliance` | Safety & Compliance |
| `technical_deviation` | Technical Deviation |

### 2.3 Lesson Type Values (4)

| Value | Label |
|---|---|
| `preventive` | Preventive |
| `corrective` | Corrective |
| `best_practice` | Best Practice |
| `observation` | Observation |

### 2.4 Applicability Scope Values (4)

| Value | Required Scope Field | Null Fields |
|---|---|---|
| `global` | None | `scope_department` null, `scope_project_id` null, `scope_equipment_type` null |
| `department` | `scope_department` (from fixed department list) | `scope_project_id` null, `scope_equipment_type` null |
| `project` | `scope_project_id` (FK → projects.id) | `scope_department` null, `scope_equipment_type` null |
| `equipment_type` | `scope_equipment_type` (min 2 chars) | `scope_department` null, `scope_project_id` null |

### 2.5 Priority Values (4)

`low`, `normal`, `high`, `critical`

### 2.6 Recurrence Risk Values (3)

`low`, `medium`, `high`

### 2.7 Effectiveness Rating Values (4)

| Value | Label |
|---|---|
| `highly_effective` | Highly Effective |
| `effective` | Effective |
| `partially_effective` | Partially Effective |
| `not_effective` | Not Effective |

### 2.8 Linkage Types (6)

| Value | Source Table | Reference Field |
|---|---|---|
| `issue` | `oi_issues` | `issue_number` |
| `rca` | `oi_rca_records` | `rca_number` |
| `capa` | `oi_capa_records` | `capa_number` |
| `sop` | `oi_sop_records` | `sop_number` |
| `enforcement_control` | `oi_enforcement_controls` | `control_number` |
| `enforcement_hold` | `oi_enforcement_holds` | `hold_number` |

### 2.9 Reviewer Status Values (4)

`pending`, `approved`, `rejected`, `recused`

### 2.10 Effectiveness Review Status Values (3)

`pending`, `completed`, `deferred`

---

## 3. New Tables (6 tables)

### 3.1 `oi_lesson_records`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_number` | varchar(20) | NOT NULL | UNIQUE | Server-assigned `LLN-{YYYY}-{NNN}` |
| `title` | text | NOT NULL | min 5 chars | |
| `description` | text | NOT NULL | min 20 chars | Full lesson description |
| `lesson_category` | varchar(50) | NOT NULL | — | One of 10 category values in §2.2 |
| `lesson_type` | varchar(30) | NOT NULL | — | One of 4 type values in §2.3 |
| `applicability_scope` | varchar(30) | NOT NULL | DEFAULT `global` | One of 4 scope values in §2.4 |
| `scope_department` | varchar(100) | NULL | — | Required when scope = `department` |
| `scope_project_id` | integer | NULL | FK → projects.id ON DELETE SET NULL | Required when scope = `project` |
| `scope_equipment_type` | varchar(100) | NULL | — | Required when scope = `equipment_type` (min 2 chars) |
| `status` | varchar(30) | NOT NULL | DEFAULT `draft` | One of 6 status values in §2.1 |
| `process_area` | varchar(100) | NULL | — | Free-form process area label |
| `root_cause_summary` | text | NULL | — | Optional summary of root cause context |
| `recommendation` | text | NOT NULL | min 20 chars | Action recommendation |
| `implementation_guidance` | text | NULL | — | Optional step-by-step guidance |
| `priority` | varchar(20) | NOT NULL | DEFAULT `normal` | One of 4 values in §2.5 |
| `recurrence_risk` | varchar(20) | NULL | — | One of 3 values in §2.6; set by author |
| `cross_project_applicable` | boolean | NOT NULL | DEFAULT false | Appears in cross-project register when `published` |
| `effectiveness_review_due_months` | integer | NULL | DEFAULT 6, min 1 | Months after publication before first effectiveness review is due |
| `author_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | |
| `submitted_at` | timestamp | NULL | — | Set server-side at `submit` transition |
| `review_due_at` | timestamp | NULL | — | Set server-side at `submit` transition: `submitted_at + 14 days` |
| `approved_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who approved |
| `approved_at` | timestamp | NULL | — | Server-set at approval transition |
| `published_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who published |
| `published_at` | timestamp | NULL | — | Server-set at publication transition |
| `archived_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who archived |
| `archived_at` | timestamp | NULL | — | Server-set at archival transition |
| `archive_reason` | text | NULL | min 10 chars when present | Required at archival |
| `rejected_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who rejected |
| `rejected_at` | timestamp | NULL | — | Server-set at rejection |
| `rejection_reason` | text | NULL | min 20 chars when present | Required at rejection |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT now() | |

**Indexes:**
- `idx_oi_lessons_status` on `(status)`
- `idx_oi_lessons_category` on `(lesson_category)`
- `idx_oi_lessons_author` on `(author_id)`
- `idx_oi_lessons_scope_project` on `(scope_project_id)` WHERE scope_project_id IS NOT NULL
- `idx_oi_lessons_cross_project` on `(cross_project_applicable, status)`
- `idx_oi_lessons_created_at` on `(created_at)`

### 3.2 `oi_lesson_linkages`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `link_type` | varchar(30) | NOT NULL | — | One of 6 values in §2.8 |
| `linked_entity_id` | integer | NOT NULL | — | PK of the linked record in its source table |
| `linked_entity_ref` | varchar(100) | NULL | — | Display reference (e.g. `OI-2026-001`, `SOP-2026-001`). Server-populated at link creation via lookup. |
| `link_note` | text | NULL | — | Optional context note (max 500 chars) |
| `created_by` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Constraints:**
- UNIQUE on `(lesson_id, link_type, linked_entity_id)` — prevents duplicate links

**Indexes:**
- `idx_oi_lesson_linkages_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_linkages_entity` on `(link_type, linked_entity_id)` — enables reverse lookup (all lessons linked to a given issue/RCA/etc.)

### 3.3 `oi_lesson_reviewers`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `reviewer_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Must be Manager+ at assignment time |
| `review_status` | varchar(20) | NOT NULL | DEFAULT `pending` | One of 4 values in §2.9 |
| `review_note` | text | NULL | — | Optional reviewer comment |
| `reviewed_at` | timestamp | NULL | — | Server-set when reviewer submits vote |
| `assigned_by` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | SM+ who assigned reviewer |
| `assigned_at` | timestamp | NOT NULL | DEFAULT now() | |

**Constraints:**
- UNIQUE on `(lesson_id, reviewer_id)` — no reviewer assigned twice to same lesson

**Indexes:**
- `idx_oi_lesson_reviewers_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_reviewers_reviewer_id` on `(reviewer_id)`

### 3.4 `oi_lesson_recurrence_checks`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `check_date` | timestamp | NOT NULL | — | Date the manual check was performed (human-entered, server-validates not future) |
| `checker_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Manager+ |
| `recurrence_found` | boolean | NOT NULL | DEFAULT false | Did the checker identify a recurrence? |
| `recurrence_detail` | text | NULL | Required if `recurrence_found = true`, min 20 chars | Describe the recurrence |
| `linked_issue_id` | integer | NULL | FK → oi_issues.id ON DELETE SET NULL | Optional link to the recurrent issue |
| `linked_rca_id` | integer | NULL | FK → oi_rca_records.id ON DELETE SET NULL | Optional link to the recurrent RCA |
| `recommendation` | text | NULL | — | Follow-up action recommendation |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Indexes:**
- `idx_oi_lesson_recurrence_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_recurrence_found` on `(lesson_id, recurrence_found)` WHERE recurrence_found = true

### 3.5 `oi_lesson_effectiveness_reviews`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `review_date` | timestamp | NOT NULL | — | Date the review was conducted (human-entered, server-validates not future) |
| `reviewer_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Manager+ |
| `review_status` | varchar(20) | NOT NULL | DEFAULT `pending` | `pending` (scheduled) → `completed` / `deferred` |
| `effectiveness_rating` | varchar(30) | NULL | Required if `review_status = completed` | One of 4 values in §2.7 |
| `observations` | text | NULL | Required if `review_status = completed`, min 20 chars | What the reviewer observed |
| `recommendation` | text | NULL | — | Follow-up recommendation |
| `next_review_due` | timestamp | NULL | — | Set when completed or deferred; optional |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Indexes:**
- `idx_oi_lesson_effectiveness_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_effectiveness_status` on `(review_status)` WHERE review_status = 'pending'

### 3.6 `oi_lesson_audit_log`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `action` | oiAuditActionEnum | NOT NULL | — | One of the 13 lesson audit values in §4 |
| `actor_id` | integer | NOT NULL | — | Authenticated user ID at event time |
| `actor_name` | text | NOT NULL | — | Snapshot of user name at event time |
| `actor_role` | text | NOT NULL | — | Snapshot of user role at event time |
| `field_name` | text | NULL | — | For field-level events |
| `old_value` | text | NULL | — | Previous value snapshot |
| `new_value` | text | NULL | — | New value snapshot |
| `context` | text | NULL | — | Human-readable context string (max 200 chars) |
| `ip_address` | text | NULL | — | From Express `req.ip` |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**No `updated_at` column.** Record is immutable after insert.

**Indexes:**
- `idx_oi_lesson_audit_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_audit_actor` on `(actor_id)`
- `idx_oi_lesson_audit_action` on `(action)`

---

## 4. Enum Additions (13 values added to `oiAuditActionEnum`)

All 13 values must be added to the existing `oi_audit_action` PostgreSQL enum via `ALTER TYPE … ADD VALUE` — each as a standalone statement outside any transaction block.

```sql
ALTER TYPE oi_audit_action ADD VALUE 'lesson_created';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_submitted_for_review';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_assigned';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_voted';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_review_recused';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_approved';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_rejected';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_published';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_archived';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_linked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_unlinked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_recurrence_recorded';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_effectiveness_reviewed';
```

---

## 5. Lesson Numbering

**Format:** `LLN-{YYYY}-{NNN}`  
- `LLN` — fixed prefix (Lessons Learned Note)
- `{YYYY}` — 4-digit calendar year of creation (IST, using `dateInIST()` from `server/utils/date-ist.ts`)
- `{NNN}` — zero-padded 3-digit serial, reset to `001` each calendar year

**Server-side generation:** Query `MAX(lesson_number) WHERE lesson_number LIKE 'LLN-{YYYY}-%'` within a serialised transaction. Never accepted from client. Never editable.

**First lesson in a year:** `LLN-2026-001`

---

## 6. Server Architecture

### 6.1 Audit Service

**File:** `server/oi-lesson-audit-service.ts`

```typescript
export async function writeLessonAuditLog(params: {
  lessonId: number;
  action: typeof oiAuditActionEnum.enumValues[number];
  actorId: number;
  actorName: string;
  actorRole: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  context?: string | null;
  ipAddress?: string | null;
}): Promise<void>
```

- INSERT-only. No UPDATE. No DELETE.
- `lessonId` is always required (not nullable — unlike enforcement audit which allows controlId OR holdId).
- `context` truncated to 200 chars server-side before insert.
- Called in every mutating route handler before returning the response.

### 6.2 Routes File

**File:** `server/oi-lesson-routes.ts`  
**Router:** `oiLessonRouter`  
**Mounted at:** `/api/oi` (same mount point as existing OI routers)  
**Auth:** All endpoints require `ensureAuthenticated`.

### 6.3 Role Constants (shared with enforcement routes — define locally)

```typescript
const MANAGER_ROLES   = ["Manager", "Senior Manager", "General Manager", "Superuser"];
const SM_ROLES        = ["Senior Manager", "General Manager", "Superuser"];
const SUPERUSER_ROLES = ["Superuser"];
```

---

## 7. API Endpoint Specification (30 endpoints)

### 7.1 Lesson Records — CRUD (6 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons` | Any authenticated | Create lesson in `draft` | Author = logged-in user. `lesson_number` server-assigned. Status = `draft`. Scope fields validated per §2.4. Writes `lesson_created` audit event. |
| `GET` | `/lessons` | Manager+ | List lessons with filters | Filter by: status, category, lesson_type, applicability_scope, author_id, department, priority, cross_project_applicable. Pagination: offset/limit. Returns summary projection (no large text fields). |
| `GET` | `/lessons/:lessonId` | Manager+ | Full lesson detail | Includes all fields, reviewer list, linkage list, recurrence check count, effectiveness review count. |
| `PATCH` | `/lessons/:lessonId` | Author (draft) / SM+ (any state up to approved) | Update lesson fields | Only permitted in `draft`, `submitted_for_review`, `under_review`, `approved` states. `published` and `archived` lessons are fully locked. Scope re-validated on every patch. Writes `field_updated` audit event per changed field. |
| `GET` | `/lessons/:lessonId/audit-log` | Manager+ | Lesson audit history | Returns all `oi_lesson_audit_log` rows for this lesson, newest first. |
| `GET` | `/lessons/cross-project` | Manager+ | Cross-project register | Returns published lessons where `cross_project_applicable = true`. Grouped by category in response. Supports filter by category, priority, scope. |

### 7.2 Lesson Lifecycle Transitions (5 endpoints)

| Method | Path | Auth | Description | Pre-Conditions | Fields Set Server-Side |
|---|---|---|---|---|---|
| `POST` | `/lessons/:lessonId/submit` | Author only | Submit for review | Status must be `draft` or `rejected`. `title` ≥ 5 chars, `description` ≥ 20 chars, `recommendation` ≥ 20 chars. | `status = submitted_for_review`, `submitted_at = now()`, `review_due_at = now() + 14 days`. Writes `lesson_submitted_for_review`. |
| `POST` | `/lessons/:lessonId/approve` | SM+ | Approve lesson | Status must be `under_review`. At least one reviewer must have voted `approved`. No reviewer in `rejected` status (unless recused). | `status = approved`, `approved_by = actor.id`, `approved_at = now()`. Writes `lesson_approved`. |
| `POST` | `/lessons/:lessonId/reject` | SM+ | Reject lesson | Status must be `submitted_for_review` or `under_review`. Body: `{ rejectionReason }` (min 20 chars). | `status = rejected`, `rejected_by = actor.id`, `rejected_at = now()`, `rejection_reason`. Writes `lesson_rejected`. |
| `POST` | `/lessons/:lessonId/publish` | SM+ | Publish lesson | Status must be `approved`. | `status = published`, `published_by = actor.id`, `published_at = now()`. Writes `lesson_published`. |
| `POST` | `/lessons/:lessonId/archive` | SM+ | Archive published lesson | Status must be `published`. Body: `{ archiveReason }` (min 10 chars). | `status = archived`, `archived_by = actor.id`, `archived_at = now()`, `archive_reason`. Writes `lesson_archived`. |

### 7.3 Lesson Linkages (4 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:lessonId/linkages` | Manager+ | Add linkage | Lesson must not be `archived`. Body: `{ linkType, linkedEntityId, linkNote? }`. Server validates entity exists in source table and populates `linked_entity_ref`. UNIQUE constraint → 409 on duplicate. Writes `lesson_linked`. |
| `GET` | `/lessons/:lessonId/linkages` | Manager+ | List linkages | Returns all linkages for lesson with `linked_entity_ref`. |
| `DELETE` | `/lessons/:lessonId/linkages/:linkageId` | Manager+ | Remove linkage | Lesson must not be `published` or `archived`. Writes `lesson_unlinked`. |
| `GET` | `/lessons/by-entity/:linkType/:entityId` | Manager+ | Reverse lookup | Returns all lessons linked to a specific entity instance (enables "Lessons" tab on issue/RCA/CAPA/SOP/enforcement pages). |

### 7.4 Lesson Reviewers (4 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:lessonId/reviewers` | SM+ | Assign reviewer | Lesson must be `submitted_for_review` or `under_review`. Reviewer must be Manager+. Reviewer must not be the lesson author. UNIQUE → 409. Sets lesson status to `under_review` if first reviewer and currently `submitted_for_review`. Writes `lesson_reviewer_assigned`. |
| `GET` | `/lessons/:lessonId/reviewers` | Manager+ | List reviewers | Returns all reviewers with their current status. |
| `POST` | `/lessons/:lessonId/reviewers/:reviewerId/vote` | Reviewer (self only) | Submit review vote | Body: `{ vote: 'approved' | 'rejected', reviewNote? }`. Sets `review_status`, `reviewed_at`. Vote `rejected` does NOT auto-reject lesson — SM+ must explicitly call `/reject`. Writes `lesson_reviewer_voted`. |
| `POST` | `/lessons/:lessonId/reviewers/:reviewerId/recuse` | Reviewer (self) or SM+ | Recuse reviewer | Sets `review_status = recused`. Does not trigger any automatic lesson state change. Writes `lesson_review_recused`. |

### 7.5 Recurrence Checks (3 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:lessonId/recurrence-checks` | Manager+ | Record recurrence check | Lesson must be `published`. Body: `{ checkDate, recurrenceFound, recurrenceDetail?, linkedIssueId?, linkedRcaId?, recommendation? }`. `checkDate` must not be in the future. If `recurrenceFound = true`, `recurrenceDetail` is required (min 20 chars). Writes `lesson_recurrence_recorded`. |
| `GET` | `/lessons/:lessonId/recurrence-checks` | Manager+ | List recurrence checks | Newest first. |
| `DELETE` | `/lessons/:lessonId/recurrence-checks/:checkId` | SM+ | Delete recurrence check | Only by SM+. Hard delete. Writes audit event with `old_value = recurrenceFound`. |

### 7.6 Effectiveness Reviews (3 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:lessonId/effectiveness-reviews` | Manager+ | Schedule or record effectiveness review | Lesson must be `published`. Body: `{ reviewDate, reviewStatus, effectivenessRating?, observations?, recommendation?, nextReviewDue? }`. If `review_status = completed`: `effectiveness_rating` required, `observations` required (min 20 chars). `review_date` must not be in the future. Writes `lesson_effectiveness_reviewed`. |
| `GET` | `/lessons/:lessonId/effectiveness-reviews` | Manager+ | List effectiveness reviews | Newest first. |
| `PATCH` | `/lessons/:lessonId/effectiveness-reviews/:reviewId` | Manager+ | Update a pending review to completed/deferred | Only `pending` reviews may be updated. Sets rating, observations, next_review_due. Writes `lesson_effectiveness_reviewed`. |

### 7.7 Dashboard Endpoints (4 endpoints)

| Method | Path | Auth | Description | Returns |
|---|---|---|---|---|
| `GET` | `/dashboard/lesson-summary` | Manager+ | Lesson pipeline summary | Counts by status. Counts by category (top 5). Count of `cross_project_applicable = true` and published. Count of pending effectiveness reviews overdue (past `published_at + effectiveness_review_due_months`). |
| `GET` | `/dashboard/lesson-recurrence-heatmap` | Manager+ | Recurrence heatmap | For each category: count of lessons with at least one `recurrence_found = true` check in the past 12 months. Returns `{ category, recurrenceCount }[]` sorted descending. |
| `GET` | `/dashboard/lesson-pipeline` | SM+ | Full pipeline with reviewer status | Lessons in `submitted_for_review` / `under_review` states with `review_due_at`, reviewer count, pending reviewer count. Used for SM+ triage view. |
| `GET` | `/dashboard/lesson-effectiveness-due` | Manager+ | Overdue effectiveness reviews | Published lessons where no completed effectiveness review exists and `published_at + effectiveness_review_due_months` months < now(). |

---

## 8. Server Route Registration

In `server/routes.ts`, after the existing `OI CAPA routes registered` log line and before any other non-OI route:

```typescript
import { oiLessonRouter } from "./oi-lesson-routes";
// ...
app.use("/api/oi", ensureAuthenticated, oiLessonRouter);
// After registration:
console.log("OI Lessons Learned routes registered");
```

---

## 9. Client Architecture

### 9.1 New Pages (2)

| File | Route | Description |
|---|---|---|
| `client/src/pages/oi/oi-lesson-register.tsx` | `/oi/lessons` | Tabbed register: "Lessons" (all/filterable) + "Cross-Project Register" tab |
| `client/src/pages/oi/oi-lesson-detail.tsx` | `/oi/lessons/:lessonId` | 6-tab detail page |

### 9.2 New Constants File (1)

| File | Contents |
|---|---|
| `client/src/pages/oi/oi-lesson-constants.ts` | Status colors/labels, category labels/colors, type labels, scope labels, priority colors, rating colors, linkage type labels |

### 9.3 Lesson Detail Page — Tab Structure (6 tabs)

| Tab Value | Tab Label | Contents |
|---|---|---|
| `overview` | Overview | All core lesson fields. Status badge. Author, approved-by, published-by. Scope details. Priority + recurrence risk badges. Action buttons (submit / approve / reject / publish / archive) — gated by role and status. |
| `linkages` | Linkages | Table of linked entities with `link_type` icon, `linked_entity_ref`, `link_note`. Add linkage form (Manager+). Delete button (Manager+, if not published/archived). |
| `reviewers` | Reviewers | Table of assigned reviewers with current vote status. Assign reviewer form (SM+). Vote button (for self, if pending). Recuse button. |
| `recurrence` | Recurrence | List of recurrence check records. Add check form (Manager+, published lessons only). |
| `effectiveness` | Effectiveness | List of effectiveness review records. Schedule review form (Manager+, published lessons only). |
| `audit` | Audit Log | Full `oi_lesson_audit_log` for this lesson, newest first. Actor, role, action, context, timestamp. |

### 9.4 Lesson Register Page — Tab Structure (2 tabs)

| Tab | Contents |
|---|---|
| All Lessons | Filter bar (status, category, type, scope, priority, author). Sortable table. Status badge column. Category badge. Priority badge. |
| Cross-Project Register | Published lessons where `cross_project_applicable = true`. Grouped by category. Shows lesson_number, title, recommendation summary, priority, published_at. |

### 9.5 Client Routing (loaders/oi.ts + App.tsx)

Add to `client/src/loaders/oi.ts`:
```typescript
export const OiLessonRegisterPage = lazy(() => import("../pages/oi/oi-lesson-register"));
export const OiLessonDetailPage   = lazy(() => import("../pages/oi/oi-lesson-detail"));
```

Add to `client/src/App.tsx` (within OI Suspense boundary):
```tsx
<Route path="/oi/lessons"            component={OiLessonRegisterPage} />
<Route path="/oi/lessons/:lessonId"  component={OiLessonDetailPage} />
```

### 9.6 Sidebar Entry (layout.tsx)

Add after the "Enforcement Controls" entry in the OI section:

```tsx
{ href: "/oi/lessons", label: "Lessons Learned", icon: <BookMarked className="h-4 w-4" /> }
```

Icon: `BookMarked` from `lucide-react`.

### 9.7 OI Dashboard Integration (oi-dashboard.tsx)

Add `LessonDashboardPanels` component after `EnforcementDashboardPanels`. Contains:
1. **Lesson Pipeline Card** — status breakdown counts with colored badges.
2. **Recurrence Heatmap Card** — top 5 categories by recurrence count (bar display, 12-month window). Shown only if at least one recurrence record exists.

### 9.8 SOP Detail — 8th Tab (oi-sop-detail.tsx)

Add after the existing 7th "Enforcement" tab:

```tsx
<TabsTrigger value="lessons">Lessons</TabsTrigger>
// ...
<TabsContent value="lessons" className="mt-4"><SopLessonTab sop={sop} /></TabsContent>
```

`SopLessonTab` fetches from `GET /api/oi/lessons/by-entity/sop/:sopId` and renders a read-only card list of linked lessons with status badge, category, and lesson_number.

### 9.9 Existing Detail Pages — "Lessons" Tab

Add a `LessonsTab` component and tab to:
- `oi-issue-detail.tsx` (link_type = `issue`)
- `oi-rca-detail.tsx` (link_type = `rca`)
- `oi-capa-detail.tsx` (link_type = `capa`)
- `oi-enforcement-detail.tsx` — already has 5 tabs; add 6th "Lessons" tab (link_type = `enforcement_control`)

Each uses `GET /api/oi/lessons/by-entity/{linkType}/{entityId}` and renders the same read-only card list pattern.

---

## 10. Schema Additions (shared/schema.ts)

### 10.1 Enum additions

Add 13 values to the `oiAuditActionEnum` definition in `shared/schema.ts`, in a new comment block after the Phase 2B enforcement values:

```typescript
  // Phase 3A: Lessons Learned audit actions
  "lesson_created","lesson_submitted_for_review","lesson_reviewer_assigned",
  "lesson_reviewer_voted","lesson_review_recused","lesson_approved",
  "lesson_rejected","lesson_published","lesson_archived",
  "lesson_linked","lesson_unlinked","lesson_recurrence_recorded",
  "lesson_effectiveness_reviewed",
```

### 10.2 New table exports

After `oiEnforcementAuditLog` and its insert schema + types, add:

1. `oiLessonRecords` + `insertOiLessonRecordSchema` + `InsertOiLessonRecord` + `OiLessonRecord`
2. `oiLessonLinkages` + `insertOiLessonLinkageSchema` + `InsertOiLessonLinkage` + `OiLessonLinkage`
3. `oiLessonReviewers` + `insertOiLessonReviewerSchema` + `InsertOiLessonReviewer` + `OiLessonReviewer`
4. `oiLessonRecurrenceChecks` + `insertOiLessonRecurrenceCheckSchema` + `InsertOiLessonRecurrenceCheck` + `OiLessonRecurrenceCheck`
5. `oiLessonEffectivenessReviews` + `insertOiLessonEffectivenessReviewSchema` + `InsertOiLessonEffectivenessReview` + `OiLessonEffectivenessReview`
6. `oiLessonAuditLog` + `insertOiLessonAuditLogSchema` + `InsertOiLessonAuditLog` + `OiLessonAuditLog`

---

## 11. DB Migration SQL

Execute each block via `psql "$DATABASE_URL"` as standalone statements.

### 11.1 Enum Additions (13 ALTER TYPE statements — each standalone)

```sql
ALTER TYPE oi_audit_action ADD VALUE 'lesson_created';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_submitted_for_review';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_assigned';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_voted';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_review_recused';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_approved';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_rejected';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_published';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_archived';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_linked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_unlinked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_recurrence_recorded';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_effectiveness_reviewed';
```

### 11.2 Table Creation

```sql
CREATE TABLE IF NOT EXISTS oi_lesson_records (
  id                              SERIAL PRIMARY KEY,
  lesson_number                   VARCHAR(20)  NOT NULL UNIQUE,
  title                           TEXT         NOT NULL,
  description                     TEXT         NOT NULL,
  lesson_category                 VARCHAR(50)  NOT NULL,
  lesson_type                     VARCHAR(30)  NOT NULL,
  applicability_scope             VARCHAR(30)  NOT NULL DEFAULT 'global',
  scope_department                VARCHAR(100),
  scope_project_id                INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  scope_equipment_type            VARCHAR(100),
  status                          VARCHAR(30)  NOT NULL DEFAULT 'draft',
  process_area                    VARCHAR(100),
  root_cause_summary              TEXT,
  recommendation                  TEXT         NOT NULL,
  implementation_guidance         TEXT,
  priority                        VARCHAR(20)  NOT NULL DEFAULT 'normal',
  recurrence_risk                 VARCHAR(20),
  cross_project_applicable        BOOLEAN      NOT NULL DEFAULT false,
  effectiveness_review_due_months INTEGER               DEFAULT 6,
  author_id                       INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at                    TIMESTAMP,
  review_due_at                   TIMESTAMP,
  approved_by                     INTEGER      REFERENCES users(id) ON DELETE RESTRICT,
  approved_at                     TIMESTAMP,
  published_by                    INTEGER      REFERENCES users(id) ON DELETE RESTRICT,
  published_at                    TIMESTAMP,
  archived_by                     INTEGER      REFERENCES users(id) ON DELETE RESTRICT,
  archived_at                     TIMESTAMP,
  archive_reason                  TEXT,
  rejected_by                     INTEGER      REFERENCES users(id) ON DELETE RESTRICT,
  rejected_at                     TIMESTAMP,
  rejection_reason                TEXT,
  created_at                      TIMESTAMP    NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oi_lesson_linkages (
  id                INTEGER      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lesson_id         INTEGER      NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  link_type         VARCHAR(30)  NOT NULL,
  linked_entity_id  INTEGER      NOT NULL,
  linked_entity_ref VARCHAR(100),
  link_note         TEXT,
  created_by        INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMP    NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, link_type, linked_entity_id)
);

CREATE TABLE IF NOT EXISTS oi_lesson_reviewers (
  id              INTEGER      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lesson_id       INTEGER      NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  reviewer_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_status   VARCHAR(20)  NOT NULL DEFAULT 'pending',
  review_note     TEXT,
  reviewed_at     TIMESTAMP,
  assigned_by     INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at     TIMESTAMP    NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, reviewer_id)
);

CREATE TABLE IF NOT EXISTS oi_lesson_recurrence_checks (
  id                 INTEGER   PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lesson_id          INTEGER   NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  check_date         TIMESTAMP NOT NULL,
  checker_id         INTEGER   NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  recurrence_found   BOOLEAN   NOT NULL DEFAULT false,
  recurrence_detail  TEXT,
  linked_issue_id    INTEGER   REFERENCES oi_issues(id) ON DELETE SET NULL,
  linked_rca_id      INTEGER   REFERENCES oi_rca_records(id) ON DELETE SET NULL,
  recommendation     TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oi_lesson_effectiveness_reviews (
  id                   INTEGER      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lesson_id            INTEGER      NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  review_date          TIMESTAMP    NOT NULL,
  reviewer_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  review_status        VARCHAR(20)  NOT NULL DEFAULT 'pending',
  effectiveness_rating VARCHAR(30),
  observations         TEXT,
  recommendation       TEXT,
  next_review_due      TIMESTAMP,
  created_at           TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oi_lesson_audit_log (
  id          SERIAL       PRIMARY KEY,
  lesson_id   INTEGER      NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  action      oi_audit_action NOT NULL,
  actor_id    INTEGER      NOT NULL,
  actor_name  TEXT         NOT NULL,
  actor_role  TEXT         NOT NULL,
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  context     TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMP    NOT NULL DEFAULT now()
);
```

### 11.3 Indexes

```sql
-- oi_lesson_records
CREATE INDEX IF NOT EXISTS idx_oi_lessons_status         ON oi_lesson_records(status);
CREATE INDEX IF NOT EXISTS idx_oi_lessons_category       ON oi_lesson_records(lesson_category);
CREATE INDEX IF NOT EXISTS idx_oi_lessons_author         ON oi_lesson_records(author_id);
CREATE INDEX IF NOT EXISTS idx_oi_lessons_scope_project  ON oi_lesson_records(scope_project_id) WHERE scope_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oi_lessons_cross_project  ON oi_lesson_records(cross_project_applicable, status);
CREATE INDEX IF NOT EXISTS idx_oi_lessons_created_at     ON oi_lesson_records(created_at);

-- oi_lesson_linkages
CREATE INDEX IF NOT EXISTS idx_oi_lesson_linkages_lesson_id ON oi_lesson_linkages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_linkages_entity     ON oi_lesson_linkages(link_type, linked_entity_id);

-- oi_lesson_reviewers
CREATE INDEX IF NOT EXISTS idx_oi_lesson_reviewers_lesson_id   ON oi_lesson_reviewers(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_reviewers_reviewer_id ON oi_lesson_reviewers(reviewer_id);

-- oi_lesson_recurrence_checks
CREATE INDEX IF NOT EXISTS idx_oi_lesson_recurrence_lesson_id ON oi_lesson_recurrence_checks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_recurrence_found     ON oi_lesson_recurrence_checks(lesson_id, recurrence_found) WHERE recurrence_found = true;

-- oi_lesson_effectiveness_reviews
CREATE INDEX IF NOT EXISTS idx_oi_lesson_effectiveness_lesson_id ON oi_lesson_effectiveness_reviews(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_effectiveness_status    ON oi_lesson_effectiveness_reviews(review_status) WHERE review_status = 'pending';

-- oi_lesson_audit_log
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_lesson_id ON oi_lesson_audit_log(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_actor     ON oi_lesson_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_action    ON oi_lesson_audit_log(action);
```

**Total indexes: 19**

---

## 12. Governance Validations Required Before Phase 3A Closure

Before Phase 3A may be marked closed, the following mandatory validations must be submitted:

| Validation | Description |
|---|---|
| Build validation | `npx tsc --noEmit` must produce 0 errors across full project |
| DB validation | All 6 tables, all 13 enum values, all 19 indexes confirmed in pg_catalog |
| Lesson creation and numbering | `LLN-{YYYY}-{NNN}` correctly assigned, unique, server-only |
| Lifecycle transition validation | Each state transition correctly gates and sets server-side fields |
| Linkage reverse-lookup validation | `GET /by-entity/:linkType/:entityId` returns correct lessons |
| Reviewer workflow validation | Reviewer assignment, voting, and recusal all correctly gated |
| Approval gate validation | Approval blocked when all reviewers have not voted (unless SM+ bypasses) |
| Publication gate validation | Publication requires `approved` state only |
| Archival gate validation | Archive blocked unless `published`; archive_reason enforced |
| Recurrence check validation | `recurrenceDetail` required when `recurrenceFound = true`; future date blocked |
| Effectiveness review validation | Completed review requires rating + observations; future date blocked |
| Audit immutability validation | No UPDATE/DELETE in audit service; no `updated_at` column in audit table |
| Unauthorized access validation | All endpoints return 401 without auth; 403 for role violations |
| ERP mutation audit | Zero writes to any ERP entity table from lesson routes |
| Future-phase leakage validation | No AI, ML, or automatic SOP/enforcement changes in Phase 3A code |
| Cross-project register validation | Only `published` + `cross_project_applicable = true` lessons appear |

---

## 13. Deliverable Summary

### New Server Files (2)
- `server/oi-lesson-audit-service.ts`
- `server/oi-lesson-routes.ts`

### Modified Server Files (1)
- `server/routes.ts` — register `oiLessonRouter`

### New Client Files (3)
- `client/src/pages/oi/oi-lesson-constants.ts`
- `client/src/pages/oi/oi-lesson-register.tsx`
- `client/src/pages/oi/oi-lesson-detail.tsx`

### Modified Client Files (8)
- `client/src/loaders/oi.ts` — 2 lazy exports
- `client/src/App.tsx` — 2 routes
- `client/src/components/layout.tsx` — sidebar entry
- `client/src/pages/oi/oi-dashboard.tsx` — `LessonDashboardPanels`
- `client/src/pages/oi/oi-sop-detail.tsx` — 8th "Lessons" tab
- `client/src/pages/oi/oi-enforcement-detail.tsx` — 6th "Lessons" tab
- `client/src/pages/oi/oi-issue-detail.tsx` — "Lessons" tab (if tab structure exists)
- `client/src/pages/oi/oi-rca-detail.tsx` — "Lessons" tab (if tab structure exists)

### Modified Schema Files (1)
- `shared/schema.ts` — 13 enum values + 6 table definitions + 6 insert schemas + 12 types

### DB Changes
- 13 `ALTER TYPE … ADD VALUE` statements
- 6 `CREATE TABLE` statements
- 19 `CREATE INDEX` statements

---

## §A — Audit Governance — Architectural Decision Record

**Decision:** Phase 3A introduces a dedicated `oi_lesson_audit_log` table rather than reusing `oi_audit_log` or `oi_enforcement_audit_log`.

**Reason 1 — Schema constraint:** `oi_audit_log` has `issue_id INTEGER NOT NULL` — it cannot accept lesson records without an issue ID. This is a hard schema constraint.

**Reason 2 — Enforcement isolation:** `oi_enforcement_audit_log` has `control_id` and `hold_id` — semantically and structurally scoped to enforcement records only. Mixing lesson events would couple unrelated lifecycles.

**Reason 3 — Query isolation:** Lesson audit queries (`GET /lessons/:id/audit-log`) must return only lesson events without filtering across a large shared table. A dedicated table ensures O(lesson_id) query performance without cross-join risk.

**Reason 4 — Future schema evolution:** Lesson audit records may require lesson-specific fields (e.g. workflow step, reviewer identity) that would not fit the generic `oi_audit_log` schema without nullable columns degrading the shared table.

**Non-negotiable:** `writeLessonAuditLog()` is the only permitted write path to `oi_lesson_audit_log`. Direct `db.insert(oiLessonAuditLog)` calls outside the audit service are forbidden.
