# Operational Intelligence — Phase 3A Execution Plan

**Status:** REVISED — SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT
**Date:** 2026-05-22
**Revision:** 2 (corrections C1–C10 incorporated)
**Phase 2B Baseline:** `docs/operational-intelligence-phase2b-execution.md` (CLOSED)
**Phase 3A Scope:** Lessons Learned Platform — Records, Revision Governance, Linkage, Review Workflow, Approval Workflow, Publication Workflow, Immutability, Acknowledgments, Recurrence Monitoring, Effectiveness Review, Search/Index Governance, Duplicate Prevention, Dashboards, Cross-Project Learning Register
**Prepared by:** Architecture review session

**Revision history:**
- R1: Initial plan submitted
- R2: C1–C10 corrections incorporated (publication immutability, revision governance, reviewer segregation, recurrence governance, cross-project governance, acknowledgment support, search/index governance, duplicate prevention, audit governance consistency, future-phase leakage guard expansion)

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
- Revision numbers are server-assigned. Never accepted from client.
- `title_hash` is server-computed. Never accepted from client.
- `ts_document` (full-text search vector) is server-computed. Never accepted from client.
- **Publication immutability is absolute.** A published lesson's core fields cannot be edited, deleted, or unlinked. Changes require a new revision. See §1.2.
- **Audit governance (Amendment 001 pattern):** All lesson audit writes go to `oi_lesson_audit_log` via `writeLessonAuditLog()` — INSERT-only, never updated or deleted. Formal justification in §A.
- Role ladder (ascending): Staff → Manager → Senior Manager (SM) → General Manager (GM) → Superuser.

---

## Explicit Exclusions — Forbidden in Phase 3A Code

| Category | Prohibited |
|---|---|
| AI agents | OpenAI API calls, LLM-generated lessons, AI-suggested linkages, AI-authored recommendations, AI-drafted revisions |
| Predictive analytics | ML-based recurrence scoring, trend forecasting, automatic similarity detection, automatic recurrence prediction |
| Automatic lesson generation | No lesson is ever created automatically. Lesson creation is always a deliberate human action by an authenticated user. |
| Automatic SOP generation | Phase 3A must never automatically create or modify an SOP record as a side effect of lesson publication or revision. |
| Automatic ERP enforcement changes | Phase 3A must never create, activate, or modify enforcement controls or holds as a side effect of lesson publication. |
| Email notifications | No SendGrid or email dispatch in Phase 3A. All notification data is audit-logged only. |
| File attachments | GCS file upload against lesson records, revisions, or acknowledgments is excluded. All content is free-text only. |
| Automatic recurrence detection | Recurrence checks are always performed by a human reviewer. No system-driven scan of issues for recurrence patterns. |
| Automatic effectiveness scoring | Effectiveness reviews are always human-authored. No calculated score from issue data. |
| Legal hold | Legal hold flags, immutability for legal purposes, legal hold lifecycle. |
| Vector embeddings | No embedding vectors, cosine similarity, semantic search, or any form of ML-based text representation. |
| Semantic AI search | Full-text search uses PostgreSQL `tsvector` / `tsquery` only — no AI-based ranking, relevance scoring, or query expansion. |

---

## Future-Phase Leakage Guard (Non-Negotiable)

The following are explicitly prohibited from appearing in any Phase 3A code, routes, services, schemas, UI, or comments.

| Prohibited Pattern | Reason |
|---|---|
| AI-driven lesson drafting — any logic that auto-populates lesson fields from RCA/CAPA data | Reserved for AI phase only |
| Automatic SOP update on lesson publication — any code that creates or revises a SOP record | Requires separate governance approval |
| Automatic enforcement change on lesson publication — any code that raises or modifies a hold | Phase 2B enforcement is human-only; this rule carries forward |
| Recurrence score — any numeric score computed from issue history | Requires predictive analytics governance |
| Lesson-to-lesson ML similarity matching — any embedding, cosine similarity, text distance, or vector operation | Not approved for any phase without explicit governance review |
| Vector database integration — pgvector, Pinecone, Weaviate, or any embedding store | Not approved for any phase without explicit governance review |
| Semantic search ranking — any query-time ML ranking, LLM re-ranking, or semantic expansion of `tsquery` | Not approved for any phase without explicit governance review |
| Automatic recurrence prediction — any system-initiated scan of issues/RCAs to flag recurrence | Human-only process in Phase 3A |
| AI-generated lesson revision — any code that drafts or pre-fills a revision from the parent lesson using LLM | Requires AI phase governance |

---

## Phase 3A Scope

### In Scope

| Area | Detail |
|---|---|
| Lesson Record Master | Full lesson CRUD with controlled vocabulary, scope, priority, category, type, tags |
| Lesson Numbering | Server-assigned `LLN-{YYYY}-{NNN}` |
| Lesson Lifecycle | Six-state workflow: `draft → submitted_for_review → under_review → approved → published → archived`. Rejection path: `submitted_for_review / under_review → rejected → draft`. |
| **Publication Immutability** | Published lesson core fields are locked. Cannot edit, delete, or unlink. Changes require a new revision via `POST /lessons/:id/revise`. |
| **Lesson Revision Governance** | Revisions carry `parent_lesson_id`, `revision_number` (server-assigned, auto-increment), `is_current_revision`. Publishing a new revision auto-archives the previous revision. |
| Lesson Linkage | Polymorphic links to: `issue`, `rca`, `capa`, `sop`, `enforcement_control`, `enforcement_hold`. CRUD with ref lookup. UNIQUE per (lesson, link_type, entity_id). Unlink blocked on published lessons. |
| Lesson Review Workflow | Named reviewers assigned per lesson; each reviewer: `pending → approved / rejected / recused`. Reviewer segregation enforced: reviewer ≠ author ≠ approver. |
| **Reviewer Segregation** | Reviewer cannot be the lesson author. Reviewer cannot be the SM+ who approves the lesson. SM+ who approved cannot be a reviewer. Enforced server-side at assignment and approval time. |
| Lesson Approval Workflow | SM+ approval of lesson (moves to `approved`). Approver must not be a reviewer on this lesson. Rejection returns to `draft`. Rejection reason mandatory (min 20 chars). |
| Lesson Publication Workflow | SM+ publication of approved lesson (moves to `published`). Published lessons are fully immutable for core fields and linkages. |
| Lesson Archival | SM+ archival of published lesson (moves to `archived`). Archive reason mandatory (min 10 chars). Terminal state — no further transitions. |
| **Cross-Project Governance** | `cross_project_applicable = true` requires SM+ explicit approval via `POST /lessons/:id/approve-cross-project`. Only visible in cross-project register when `published` AND `cross_project_approved = true`. |
| **Lesson Acknowledgment** | Published cross-project lessons support department-level and project-level acknowledgment assignments. Required acknowledgments tracked with `is_required`, due date, and a full acknowledgment audit trail. |
| Recurrence Monitoring | Human-authored recurrence check records per lesson. When `recurrence_found = true`: both `recurrence_detail` (min 20 chars) AND at least one of `linked_issue_id` or `linked_rca_id` are mandatory. |
| Effectiveness Review | Human-authored effectiveness review records per published lesson. |
| Lesson Audit Log | Dedicated `oi_lesson_audit_log` — immutable, INSERT-only. |
| **Full-Text Search** | `ts_document tsvector` column on `oi_lesson_records`, GIN-indexed. Covers title + description + recommendation + tags. `GET /lessons?q=...` uses `tsquery` with `plainto_tsquery`. |
| **Tag Indexing** | `tags text[]` column, GIN-indexed. Filter by tag via `@>` operator. Tags normalised lowercase, max 30 chars each, max 20 tags per lesson. |
| **Duplicate Prevention** | `title_hash` MD5 computed from `LOWER(TRIM(title))`. Partial unique index on `(lesson_category, title_hash)` WHERE `status = 'published'`. Additional API-level check for same linked entity. HTTP 409 on conflict. |
| Lesson Register | Filterable table: status, category, type, scope, author, department, priority, cross-project flag, tags, full-text search. |
| Cross-Project Learning Register | Published + cross_project_approved lessons only. Grouped by category. |
| Dashboard Panels | Lesson pipeline summary + recurrence heatmap (12-month rolling). |
| OI Dashboard Integration | Lesson panels added after enforcement panels. |
| SOP / Issue / RCA / CAPA / Enforcement Lesson Tabs | Reverse-lookup tabs on all linked entity detail pages. |

---

## 1. Lesson Lifecycle

```
         ┌─────────────────────────────────────────────────────────────────┐
         │                           draft                                 │
         │  (created by author OR created as a revision of a published     │
         │   lesson; all fields editable; not yet submitted)               │
         └─────────────────────────────────────────────────────────────────┘
                                     │  POST /submit
                                     ▼
         ┌─────────────────────────────────────────────────────────────────┐
         │                    submitted_for_review                         │
         │  (awaiting reviewer assignment by SM+; review_due_at set;       │
         │   core fields locked for author; editable by SM+ only)          │
         └─────────────────────────────────────────────────────────────────┘
            │ POST /reviewers (first reviewer assigned)   │ POST /reject (SM+)
            ▼                                             │
         ┌────────────────────────────┐                  │
         │        under_review        │                  │
         │  (reviewer(s) assigned;    │                  │
         │   pending votes)           │                  │
         └────────────────────────────┘                  │
            │ POST /approve (SM+, reviewer segregation   │
            │   enforced, at least one approved vote)    │
            ▼                                            ▼
         ┌────────────────────────────┐  ┌──────────────────────────────┐
         │         approved           │  │          rejected            │
         │  (SM+ approval recorded;   │  │  (reason mandatory ≥20 chars;│
         │   ready for publication)   │  │   status returns to draft)   │
         └────────────────────────────┘  └──────────────────────────────┘
            │ POST /publish (SM+)
            ▼
         ┌─────────────────────────────────────────────────────────────────┐
         │                         published                               │
         │  IMMUTABLE: core fields locked; linkages locked; no delete.     │
         │  Changes require: POST /lessons/:id/revise → new draft revision │
         │  Optional: POST /approve-cross-project (SM+) for cross-project  │
         │  register visibility. Acknowledgments may be required.          │
         └─────────────────────────────────────────────────────────────────┘
            │ POST /archive (SM+, reason ≥10 chars)
            │ OR auto-archived when a new revision of this lesson
            │ is published (previous revision archived automatically)
            ▼
         ┌────────────────────────────┐
         │         archived           │
         │  (terminal; no further     │
         │   transitions; visible in  │
         │   register with badge)     │
         └────────────────────────────┘
```

### 1.1 Lesson Field Editability by State

| Field Group | `draft` | `submitted_for_review` | `under_review` | `approved` | `published` | `archived` |
|---|---|---|---|---|---|---|
| Core content (title, description, recommendation, implementation_guidance) | Author / SM+ | SM+ only | SM+ only | SM+ only | ❌ **LOCKED** | ❌ **LOCKED** |
| Category / type / scope / priority / tags | Author / SM+ | SM+ only | SM+ only | SM+ only | ❌ **LOCKED** | ❌ **LOCKED** |
| `cross_project_applicable` flag | Author / SM+ | SM+ only | SM+ only | SM+ only | ❌ **LOCKED** | ❌ **LOCKED** |
| Linkages (add) | Manager+ | Manager+ | Manager+ | Manager+ | ❌ **LOCKED** | ❌ **LOCKED** |
| Linkages (delete) | Manager+ | Manager+ | Manager+ | Manager+ | ❌ **LOCKED** | ❌ **LOCKED** |
| Reviewer assignment | SM+ | SM+ | SM+ | ❌ | ❌ | ❌ |
| Cross-project approval | — | — | — | — | SM+ only | ❌ |
| Acknowledgment assignment | — | — | — | — | SM+ only | ❌ |
| Recurrence checks | — | — | — | — | Manager+ | ❌ |
| Effectiveness reviews | — | — | — | — | Manager+ | ❌ |

### 1.2 Publication Immutability Rules (C1)

A lesson in `published` or `archived` state is subject to the following absolute locks, enforced server-side:

| Operation | Allowed | Enforcement |
|---|---|---|
| Edit any core field (title, description, recommendation, category, type, scope, priority, tags, implementation_guidance) | ❌ Never | `PATCH /lessons/:id` returns HTTP 423 (Locked) if status = published / archived |
| Delete the lesson record | ❌ Never | `DELETE /lessons/:id` is not defined — no DELETE endpoint exists for lesson records. HTTP 405. |
| Add a linkage | ❌ Never | `POST /lessons/:id/linkages` returns HTTP 423 if status = published / archived |
| Remove a linkage | ❌ Never | `DELETE /lessons/:id/linkages/:linkId` returns HTTP 423 if status = published / archived |
| Change `cross_project_applicable` | ❌ Never after publish | Cross-project flag is locked at publication. Cross-project approval is a separate immutable action. |
| Create a new revision | ✅ SM+ only | `POST /lessons/:id/revise` creates a new `draft` lesson record with `parent_lesson_id = :id` and `revision_number = parent.revision_number + 1`. |

**There is no in-place edit of a published lesson.** Any change, however minor, requires the full revision workflow.

### 1.3 Lesson Revision Governance (C2)

**Revision schema fields** (added to `oi_lesson_records`):

| Field | Type | Description |
|---|---|---|
| `parent_lesson_id` | integer NULL FK → oi_lesson_records.id ON DELETE RESTRICT | NULL for original. Set to parent's id for all revisions. |
| `revision_number` | integer NOT NULL DEFAULT 1 | 1 for original. Server-increments on revision creation. |
| `is_current_revision` | boolean NOT NULL DEFAULT true | False for superseded revisions. True only for the active (published or latest draft) revision in a lineage. |

**Revision creation rules:**
- Only callable via `POST /lessons/:id/revise` by SM+.
- Source lesson must be in `published` state.
- Server creates a new `oi_lesson_records` row with:
  - `parent_lesson_id = source.id`
  - `revision_number = source.revision_number + 1`
  - `is_current_revision = true`
  - All core fields copied from source (title, description, recommendation, category, type, scope, priority, tags, implementation_guidance, recurrence_risk, cross_project_applicable, effectiveness_review_due_months)
  - `status = draft`
  - `lesson_number = LLN-{YYYY}-{NNN}` (new, server-assigned — revision is a new first-class record)
  - All linkages are NOT automatically copied. Author may re-add linkages in draft state.
- Source lesson's `is_current_revision` is NOT changed at revision creation — only changed to `false` when the new revision is published.

**Revision publication rules:**
- When a revision is published (`POST /lessons/:id/publish`), the server atomically:
  1. Sets the new revision to `status = published`, `is_current_revision = true`.
  2. Finds the `parent_lesson_id` chain and sets all ancestor lessons to `status = archived`, `is_current_revision = false`, `archived_at = now()`, `archive_reason = 'Superseded by revision LLN-{YYYY}-{NNN}'` (server-set, no manual reason required for auto-archival).
  3. Writes audit events on both the new revision (`lesson_published`) and each auto-archived ancestor (`lesson_archived` with context `auto_superseded`).
- This is an atomic DB transaction — both the publish and the archival succeed together or both fail.

**Revision display rules:**
- In the lesson register, the `parent_lesson_number` and `revision_number` are shown for any non-original lesson.
- Archived lessons that were superseded by a revision show "Superseded by {lesson_number}" in their detail view.
- The cross-project register shows only `is_current_revision = true` lessons.

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

### 2.11 Acknowledgment Type Values (2)

`department`, `project`

### 2.12 Acknowledgment Status Values (3)

`pending`, `acknowledged`, `overdue`

---

## 3. New Tables (7 tables)

### 3.1 `oi_lesson_records`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_number` | varchar(20) | NOT NULL | UNIQUE | Server-assigned `LLN-{YYYY}-{NNN}` |
| `parent_lesson_id` | integer | NULL | FK → oi_lesson_records.id ON DELETE RESTRICT | NULL for original. FK to parent for revisions. |
| `revision_number` | integer | NOT NULL | DEFAULT 1 | 1 for original. Server-incremented on revision creation. |
| `is_current_revision` | boolean | NOT NULL | DEFAULT true | False for superseded revisions. |
| `title` | text | NOT NULL | min 5 chars | |
| `title_hash` | varchar(32) | NOT NULL | — | Server-computed: MD5(LOWER(TRIM(title))). Used for duplicate detection. |
| `description` | text | NOT NULL | min 20 chars | Full lesson description |
| `lesson_category` | varchar(50) | NOT NULL | — | One of 10 category values in §2.2 |
| `lesson_type` | varchar(30) | NOT NULL | — | One of 4 type values in §2.3 |
| `applicability_scope` | varchar(30) | NOT NULL | DEFAULT `global` | One of 4 scope values in §2.4 |
| `scope_department` | varchar(100) | NULL | — | Required when scope = `department` |
| `scope_project_id` | integer | NULL | FK → projects.id ON DELETE SET NULL | Required when scope = `project` |
| `scope_equipment_type` | varchar(100) | NULL | — | Required when scope = `equipment_type` (min 2 chars) |
| `tags` | text[] | NULL | — | Array of normalised lowercase tags. Max 20 items. Each tag max 30 chars. Server-normalises before store. |
| `status` | varchar(30) | NOT NULL | DEFAULT `draft` | One of 6 status values in §2.1 |
| `process_area` | varchar(100) | NULL | — | Free-form process area label |
| `root_cause_summary` | text | NULL | — | Optional summary of root cause context |
| `recommendation` | text | NOT NULL | min 20 chars | Action recommendation |
| `implementation_guidance` | text | NULL | — | Optional step-by-step guidance |
| `priority` | varchar(20) | NOT NULL | DEFAULT `normal` | One of 4 values in §2.5 |
| `recurrence_risk` | varchar(20) | NULL | — | One of 3 values in §2.6; set by author |
| `cross_project_applicable` | boolean | NOT NULL | DEFAULT false | Flag set during draft/pre-publish. Locked at publication. |
| `cross_project_approved_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who approved cross-project visibility |
| `cross_project_approved_at` | timestamp | NULL | — | Server-set at cross-project approval |
| `effectiveness_review_due_months` | integer | NULL | DEFAULT 6, min 1 | Months after publication before first review due |
| `ts_document` | tsvector | NULL | — | Server-computed full-text search vector. Updated on create/update. Never accepted from client. |
| `author_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | |
| `submitted_at` | timestamp | NULL | — | Server-set at `submit` transition |
| `review_due_at` | timestamp | NULL | — | Server-set: `submitted_at + 14 days` |
| `approved_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who approved |
| `approved_at` | timestamp | NULL | — | Server-set at approval |
| `published_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who published |
| `published_at` | timestamp | NULL | — | Server-set at publication |
| `archived_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who archived, or NULL if auto-archived on supersession |
| `archived_at` | timestamp | NULL | — | Server-set at archival |
| `archive_reason` | text | NULL | min 10 chars for manual archival; auto-set on supersession | |
| `rejected_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | SM+ who rejected |
| `rejected_at` | timestamp | NULL | — | Server-set at rejection |
| `rejection_reason` | text | NULL | min 20 chars when present | |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |
| `updated_at` | timestamp | NOT NULL | DEFAULT now() | |

**Indexes:**
- `idx_oi_lessons_status` on `(status)`
- `idx_oi_lessons_category` on `(lesson_category)`
- `idx_oi_lessons_author` on `(author_id)`
- `idx_oi_lessons_scope_project` on `(scope_project_id)` WHERE scope_project_id IS NOT NULL
- `idx_oi_lessons_cross_project` on `(cross_project_applicable, status)` WHERE cross_project_applicable = true AND status = 'published'
- `idx_oi_lessons_current_revision` on `(parent_lesson_id, is_current_revision)`
- `idx_oi_lessons_created_at` on `(created_at)`
- `idx_oi_lessons_ts_document` GIN on `(ts_document)` — full-text search
- `idx_oi_lessons_tags` GIN on `(tags)` — tag containment queries
- `idx_oi_lessons_dup_prevention` UNIQUE PARTIAL on `(lesson_category, title_hash)` WHERE `status = 'published' AND is_current_revision = true` — duplicate prevention (§10)

### 3.2 `oi_lesson_linkages`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `link_type` | varchar(30) | NOT NULL | — | One of 6 values in §2.8 |
| `linked_entity_id` | integer | NOT NULL | — | PK of the linked record in its source table |
| `linked_entity_ref` | varchar(100) | NULL | — | Server-populated display reference |
| `link_note` | text | NULL | — | Optional context note (max 500 chars) |
| `created_by` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Constraints:**
- UNIQUE on `(lesson_id, link_type, linked_entity_id)`

**Indexes:**
- `idx_oi_lesson_linkages_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_linkages_entity` on `(link_type, linked_entity_id)` — reverse lookup

### 3.3 `oi_lesson_reviewers`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `reviewer_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Must be Manager+ AND not the lesson author AND not the SM+ approver |
| `review_status` | varchar(20) | NOT NULL | DEFAULT `pending` | One of 4 values in §2.9 |
| `review_note` | text | NULL | — | Optional reviewer comment |
| `reviewed_at` | timestamp | NULL | — | Server-set when reviewer submits vote |
| `assigned_by` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | SM+ who assigned reviewer |
| `assigned_at` | timestamp | NOT NULL | DEFAULT now() | |

**Constraints:**
- UNIQUE on `(lesson_id, reviewer_id)`

**Indexes:**
- `idx_oi_lesson_reviewers_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_reviewers_reviewer_id` on `(reviewer_id)`

### 3.4 `oi_lesson_recurrence_checks`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `check_date` | timestamp | NOT NULL | — | Date manual check performed. Server-validates: must not be future. |
| `checker_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Manager+ |
| `recurrence_found` | boolean | NOT NULL | DEFAULT false | |
| `recurrence_detail` | text | NULL | **Required (min 20 chars) when `recurrence_found = true`** | Describe the recurrence |
| `linked_issue_id` | integer | NULL | FK → oi_issues.id ON DELETE SET NULL | **Required when `recurrence_found = true` unless `linked_rca_id` is supplied** |
| `linked_rca_id` | integer | NULL | FK → oi_rca_records.id ON DELETE SET NULL | **Required when `recurrence_found = true` unless `linked_issue_id` is supplied** |
| `recommendation` | text | NULL | — | Follow-up recommendation |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Recurrence governance rule (C4):** When `recurrence_found = true`, the server enforces ALL of the following:
1. `recurrence_detail` is present and ≥ 20 chars.
2. At least one of `linked_issue_id` or `linked_rca_id` is present (not both null).
3. `check_date` is not in the future.
If any condition fails, HTTP 422 with a specific error code is returned.

**Indexes:**
- `idx_oi_lesson_recurrence_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_recurrence_found` on `(lesson_id, recurrence_found)` WHERE recurrence_found = true

### 3.5 `oi_lesson_effectiveness_reviews`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `review_date` | timestamp | NOT NULL | — | Date review conducted. Server-validates: not future. |
| `reviewer_id` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | Manager+ |
| `review_status` | varchar(20) | NOT NULL | DEFAULT `pending` | `pending` → `completed` / `deferred` |
| `effectiveness_rating` | varchar(30) | NULL | Required if `review_status = completed` | One of 4 values in §2.7 |
| `observations` | text | NULL | Required if `review_status = completed`, min 20 chars | |
| `recommendation` | text | NULL | — | |
| `next_review_due` | timestamp | NULL | — | Optional |
| `created_at` | timestamp | NOT NULL | DEFAULT now() | |

**Indexes:**
- `idx_oi_lesson_effectiveness_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_effectiveness_status` on `(review_status)` WHERE review_status = 'pending'

### 3.6 `oi_lesson_acknowledgments`

**Purpose:** Published cross-project lessons may require acknowledgment from designated departments or projects. This table tracks per-assignment acknowledgment status with a full audit trail.

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | Must be `published`. |
| `acknowledgment_type` | varchar(20) | NOT NULL | — | `department` or `project` |
| `target_department` | varchar(100) | NULL | Required when type = `department` | Department required to acknowledge |
| `target_project_id` | integer | NULL | FK → projects.id ON DELETE SET NULL; Required when type = `project` | Project required to acknowledge |
| `is_required` | boolean | NOT NULL | DEFAULT true | If false, acknowledgment is advisory only |
| `due_date` | timestamp | NULL | — | Optional acknowledgment due date |
| `acknowledged_by` | integer | NULL | FK → users.id ON DELETE RESTRICT | User who submitted acknowledgment |
| `acknowledged_at` | timestamp | NULL | — | Server-set when acknowledgment submitted |
| `acknowledgment_note` | text | NULL | — | Optional acknowledgment comment |
| `status` | varchar(20) | NOT NULL | DEFAULT `pending` | `pending` → `acknowledged`. `overdue` computed at query time (not stored). |
| `assigned_by` | integer | NOT NULL | FK → users.id ON DELETE RESTRICT | SM+ who assigned this acknowledgment requirement |
| `assigned_at` | timestamp | NOT NULL | DEFAULT now() | |

**Constraints:**
- UNIQUE on `(lesson_id, acknowledgment_type, target_department)` WHERE target_department IS NOT NULL
- UNIQUE on `(lesson_id, acknowledgment_type, target_project_id)` WHERE target_project_id IS NOT NULL

**Indexes:**
- `idx_oi_lesson_ack_lesson_id` on `(lesson_id)`
- `idx_oi_lesson_ack_status` on `(status)` WHERE status = 'pending'
- `idx_oi_lesson_ack_dept` on `(target_department)` WHERE target_department IS NOT NULL

**Acknowledgment rules:**
- Only SM+ can assign acknowledgment requirements (i.e. insert rows).
- Lesson must be `published` to assign acknowledgment requirements.
- Any authenticated Manager+ user in the relevant department/project may submit acknowledgment.
- Acknowledgment status does NOT block any workflow. It is informational and audited.
- Writes `lesson_acknowledged` audit event on submission; `lesson_acknowledgment_required` event on assignment.

### 3.7 `oi_lesson_audit_log`

| Column | Type | Nullable | Constraint | Description |
|---|---|---|---|---|
| `id` | serial | NOT NULL | PK | |
| `lesson_id` | integer | NOT NULL | FK → oi_lesson_records.id ON DELETE CASCADE | |
| `action` | oi_audit_action | NOT NULL | — | One of the 17 lesson audit values in §4 |
| `actor_id` | integer | NOT NULL | — | Authenticated user ID at event time |
| `actor_name` | text | NOT NULL | — | Snapshot of user name |
| `actor_role` | text | NOT NULL | — | Snapshot of user role |
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

## 4. Enum Additions (17 values added to `oiAuditActionEnum`)

All 17 values must be added to the existing `oi_audit_action` PostgreSQL enum via `ALTER TYPE … ADD VALUE` — each as a standalone statement outside any transaction block.

```sql
-- Phase 3A: Lessons Learned audit actions
ALTER TYPE oi_audit_action ADD VALUE 'lesson_created';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_submitted_for_review';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_assigned';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_reviewer_voted';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_review_recused';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_approved';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_rejected';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_published';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_archived';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_revised';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_linked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_unlinked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_recurrence_recorded';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_effectiveness_reviewed';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_cross_project_approved';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_acknowledgment_required';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_acknowledged';
```

---

## 5. Lesson Numbering

**Format:** `LLN-{YYYY}-{NNN}`
- `LLN` — fixed prefix (Lessons Learned Note)
- `{YYYY}` — 4-digit calendar year of creation (IST, using `dateInIST()` from `server/utils/date-ist.ts`)
- `{NNN}` — zero-padded 3-digit serial, reset to `001` each calendar year

**Note on revisions:** Each revision is a new first-class record and receives its own `LLN-{YYYY}-{NNN}` number. The revision lineage is tracked via `parent_lesson_id` and `revision_number`, not via the lesson number suffix.

**Server-side generation:** Query `MAX(lesson_number) WHERE lesson_number LIKE 'LLN-{YYYY}-%'` within a serialised transaction. Never accepted from client.

---

## 6. Reviewer Segregation Rules (C3)

These rules are enforced server-side at the point of each operation. Client-side hints may be provided but are supplementary only.

### 6.1 Assignment-Time Checks (enforced at `POST /lessons/:id/reviewers`)

| Rule | Error Code |
|---|---|
| Reviewer must not be the lesson `author_id` | `reviewer_is_author` |
| Reviewer must be Manager+ role | `reviewer_insufficient_role` |
| Reviewer must not already be assigned to this lesson | `reviewer_already_assigned` (409) |

### 6.2 Approval-Time Checks (enforced at `POST /lessons/:id/approve`)

| Rule | Error Code |
|---|---|
| SM+ approver must not be any reviewer on this lesson | `approver_is_reviewer` |
| SM+ approver must not be the lesson `author_id` | `approver_is_author` |
| At least one reviewer must have `review_status = approved` | `no_approved_reviewer_vote` |
| No reviewer must have `review_status = rejected` (unless recused — recused votes are ignored) | `rejected_reviewer_vote_outstanding` |

### 6.3 Vote-Time Checks (enforced at `POST /lessons/:id/reviewers/:reviewerId/vote`)

| Rule | Error Code |
|---|---|
| Actor must be the named reviewer (self-vote only) | `not_assigned_reviewer` |
| Reviewer cannot vote on their own approval outcome — i.e. a reviewer's vote is recorded but the SM+ approver at approval time must be a different person | (enforced at approval-time, not vote-time) |

### 6.4 Summary Segregation Matrix

| Role | Can be Author | Can be Reviewer | Can be Approver | Can be Publisher |
|---|---|---|---|---|
| Same person as author | ✅ | ❌ | ❌ | ❌ |
| Different person, Manager+ | — | ✅ | — | — |
| Same person as a reviewer | — | — | ❌ | — |
| SM+ (not author, not reviewer) | — | — | ✅ | ✅ |

---

## 7. Cross-Project Governance (C5)

### 7.1 Setting the Flag

- `cross_project_applicable` may be set to `true` by the lesson author or SM+ during `draft`, `submitted_for_review`, `under_review`, or `approved` states.
- Once published, the flag is locked. It cannot be changed in-place. A revision is required to change it.

### 7.2 Cross-Project Approval

Setting `cross_project_applicable = true` alone does **NOT** make the lesson visible in the cross-project register. SM+ must explicitly approve cross-project visibility via a dedicated action after the lesson is published.

**Endpoint:** `POST /lessons/:id/approve-cross-project`
**Auth:** SM+ only
**Pre-conditions:**
- Lesson must be `published`
- `cross_project_applicable` must be `true`
- `cross_project_approved_at` must be NULL (not already approved)

**Server actions:**
- Sets `cross_project_approved_by = actor.id`, `cross_project_approved_at = now()`
- Writes `lesson_cross_project_approved` audit event

### 7.3 Cross-Project Register Eligibility

A lesson appears in the cross-project register (`GET /lessons/cross-project`) if and only if ALL of:
- `status = 'published'`
- `is_current_revision = true`
- `cross_project_applicable = true`
- `cross_project_approved_at IS NOT NULL`

### 7.4 Acknowledgment Assignment Context

Cross-project acknowledgments may only be required for lessons that are cross-project approved. Attempting to assign acknowledgments to a lesson without `cross_project_approved_at IS NOT NULL` returns HTTP 422: `lesson_not_cross_project_approved`.

---

## 8. Search and Index Governance (C7)

### 8.1 Full-Text Search

**Field:** `ts_document tsvector` on `oi_lesson_records`

**Computation (server-side, on create and on every field update):**
```sql
ts_document = to_tsvector('english',
  COALESCE(title, '') || ' ' ||
  COALESCE(description, '') || ' ' ||
  COALESCE(recommendation, '') || ' ' ||
  COALESCE(implementation_guidance, '') || ' ' ||
  COALESCE(array_to_string(tags, ' '), '')
)
```

**Rules:**
- Computed server-side only. Never accepted from client.
- Updated atomically on every `PATCH /lessons/:id` call that modifies any of the source fields.
- Updated at lesson creation.
- Updated when tags are changed.

**API usage:**
- `GET /lessons?q={search_term}` — server calls `plainto_tsquery('english', search_term)` and filters with `ts_document @@ query`.
- Results ordered by `ts_rank(ts_document, query) DESC, created_at DESC`.
- Minimum query length: 2 characters (server enforces; returns HTTP 422 if shorter).
- No stemming overrides. No query expansion. No LLM re-ranking.

**Index:** GIN index on `ts_document` — `idx_oi_lessons_ts_document`

### 8.2 Tag Indexing

**Field:** `tags text[]` on `oi_lesson_records`

**Tag governance:**
- Stored as lowercase, trimmed text.
- Server normalises: `tags.map(t => t.trim().toLowerCase()).filter(t => t.length > 0 && t.length <= 30)`.
- Maximum 20 tags per lesson.
- Tags exceeding 30 chars after normalisation → HTTP 422: `tag_too_long`.
- More than 20 tags → HTTP 422: `too_many_tags`.
- Tags containing spaces are permitted (e.g. `heat exchanger`).
- Tags are not a controlled vocabulary — free-text, author-defined.

**API usage:**
- `GET /lessons?tags=tag1,tag2` — server uses `tags @> ARRAY['tag1','tag2']` (containment: lesson must have ALL specified tags).
- `GET /lessons?tags_any=tag1,tag2` — server uses `tags && ARRAY['tag1','tag2']` (overlap: lesson must have at least ONE specified tag).
- `GET /lessons/tag-suggestions` — returns top 50 most-used tags across non-archived lessons for autocomplete.

**Index:** GIN index on `tags` — `idx_oi_lessons_tags`

### 8.3 Category Indexing

**Index:** `idx_oi_lessons_category` on `(lesson_category)` — standard B-tree.

**API usage:**
- `GET /lessons?category=design_deficiency,procurement_quality` — server uses `WHERE lesson_category = ANY($1)`.

### 8.4 Cross-Project Filtering Strategy

**Index:** `idx_oi_lessons_cross_project` — partial index WHERE `cross_project_applicable = true AND status = 'published'`.

**API usage:**
- `GET /lessons/cross-project` — uses the partial index for fast retrieval. Always adds `AND cross_project_approved_at IS NOT NULL AND is_current_revision = true`.
- No full-table scan for cross-project queries. Partial index guarantees sub-linear performance.

### 8.5 Combined Filter Query Strategy

When `GET /lessons` receives multiple filters simultaneously (status + category + tags + q), the server builds a composable `WHERE` clause:

1. Status filter: `WHERE status = ANY($statuses)`
2. Category filter: `AND lesson_category = ANY($categories)`
3. Tag filter: `AND tags @> $tags` or `AND tags && $tags`
4. Full-text: `AND ts_document @@ plainto_tsquery('english', $q)`
5. Scope: `AND applicability_scope = ANY($scopes)`
6. Cross-project: `AND cross_project_applicable = true AND cross_project_approved_at IS NOT NULL`
7. Author: `AND author_id = $authorId`
8. Current revision only: `AND is_current_revision = true` (default; pass `include_all_revisions=true` to override)

Order: `ts_rank DESC NULLS LAST, created_at DESC`.

---

## 9. Duplicate Lesson Prevention (C8)

### 9.1 Title Hash

`title_hash` is server-computed as `MD5(LOWER(TRIM(title)))` on every create and patch. Never accepted from client.

### 9.2 Published Duplicate Prevention

**DB enforcement:**
```sql
CREATE UNIQUE INDEX idx_oi_lessons_dup_prevention
  ON oi_lesson_records (lesson_category, title_hash)
  WHERE status = 'published' AND is_current_revision = true;
```

This prevents two currently-published lessons in the same category from having the same normalised title. DB-level violation → server returns HTTP 409: `duplicate_published_lesson`.

**Note:** Revisions of the same lesson are exempt because the parent revision is archived (status = 'archived') before the new revision is published, so the partial index condition `status = 'published'` is not violated.

### 9.3 Same Linked Entity Duplicate Prevention

At the API level (`POST /lessons/:id/linkages`), when a user adds a linkage, the server additionally checks:

> Is there another currently-published, current-revision lesson with the same `lesson_category` AND a linkage to the same `(link_type, linked_entity_id)`?

If yes: HTTP 409: `duplicate_lesson_for_entity` with `conflicting_lesson_number` in the response body.

This is an API-level check only (not a DB constraint) because it requires a cross-table query. It applies only when both lessons are `published + is_current_revision = true`.

### 9.4 Draft Duplicate Warning

For draft lessons, the server checks the same condition and returns a `duplicate_warning` field in the `POST /lessons` response (not an error, not a block) — informational only.

---

## 10. Lesson Acknowledgment Support (C6)

### 10.1 Overview

Published, cross-project-approved lessons may carry acknowledgment requirements targeting specific departments or projects. Acknowledgment is informational and advisory — it does not block any workflow, approval, or publication.

### 10.2 Acknowledgment Assignment

`POST /lessons/:id/acknowledgments`
**Auth:** SM+ only
**Pre-conditions:**
- Lesson must be `published`
- `cross_project_approved_at IS NOT NULL`
**Body:** `{ acknowledgment_type, target_department?, target_project_id?, is_required, due_date? }`
**Server actions:**
- Inserts row in `oi_lesson_acknowledgments`
- Sets `status = pending`
- Writes `lesson_acknowledgment_required` audit event

### 10.3 Acknowledgment Submission

`POST /lessons/:id/acknowledgments/:ackId/acknowledge`
**Auth:** Manager+ in target department/project
**Pre-conditions:**
- `acknowledgment.status = pending`
- Actor must be Manager+
**Body:** `{ acknowledgment_note? }`
**Server actions:**
- Sets `acknowledged_by = actor.id`, `acknowledged_at = now()`, `status = acknowledged`, `acknowledgment_note`
- Writes `lesson_acknowledged` audit event including actor department context

### 10.4 Overdue Status

`status = overdue` is **never stored** — it is computed at query time: `due_date IS NOT NULL AND due_date < now() AND status = 'pending'`. Returned as a derived field in API responses. No DB column for `overdue`.

### 10.5 Audit Trail

Every acknowledgment assignment and submission writes a row to `oi_lesson_audit_log`:
- `lesson_acknowledgment_required`: `new_value = {type}:{dept/project_id}`, `context = "Acknowledgment required by {due_date or 'no due date'}"`
- `lesson_acknowledged`: `new_value = acknowledged`, `context = "Acknowledged by {actor_name} ({actor_role})"`

---

## 11. Server Architecture

### 11.1 Audit Service

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

INSERT-only. No UPDATE. No DELETE. `context` truncated to 200 chars server-side.

### 11.2 Routes File

**File:** `server/oi-lesson-routes.ts`
**Router:** `oiLessonRouter`
**Mounted at:** `/api/oi`
**Auth:** All endpoints require `ensureAuthenticated`

### 11.3 ts_document Update Helper

```typescript
// Called on create and every PATCH
async function updateTsDocument(lessonId: number): Promise<void> {
  await db.execute(sql`
    UPDATE oi_lesson_records
    SET ts_document = to_tsvector('english',
      COALESCE(title, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(recommendation, '') || ' ' ||
      COALESCE(implementation_guidance, '') || ' ' ||
      COALESCE(array_to_string(tags, ' '), '')
    ),
    updated_at = now()
    WHERE id = ${lessonId}
  `);
}
```

### 11.4 title_hash Update Helper

```typescript
function computeTitleHash(title: string): string {
  return crypto.createHash('md5').update(title.trim().toLowerCase()).digest('hex');
}
```

Called at create and at every PATCH that changes `title`. Written to `title_hash` column. Never exposed to client in create/patch request body.

---

## 12. API Endpoint Specification (36 endpoints)

### 12.1 Lesson Records — CRUD (7 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons` | Any authenticated | Create lesson in `draft` | Author = logged-in user. `lesson_number` server-assigned. `title_hash` server-computed. `ts_document` server-computed. `revision_number = 1`. `parent_lesson_id = null`. `is_current_revision = true`. Scope validated per §2.4. Duplicate warning returned (not error). Writes `lesson_created`. |
| `GET` | `/lessons` | Manager+ | List lessons | Filters: status, category, lesson_type, applicability_scope, author_id, priority, cross_project_applicable, tags, tags_any, q (full-text). Default: `is_current_revision = true`. Pass `include_all_revisions=true` to include superseded. Returns summary projection. |
| `GET` | `/lessons/:lessonId` | Manager+ | Full lesson detail | Includes all fields, reviewer list, linkage list, revision lineage (parent + children if any), acknowledgment list, recurrence check count, effectiveness review count. |
| `PATCH` | `/lessons/:lessonId` | Author (draft) / SM+ (pre-publish) | Update lesson fields | HTTP 423 if `published` or `archived`. Scope re-validated. `title_hash` recomputed if title changes. `ts_document` recomputed. Writes `field_updated` audit per changed field. |
| `GET` | `/lessons/:lessonId/audit-log` | Manager+ | Lesson audit history | Returns all `oi_lesson_audit_log` rows for this lesson, newest first. |
| `GET` | `/lessons/cross-project` | Manager+ | Cross-project register | Returns lessons where status=published, is_current_revision=true, cross_project_applicable=true, cross_project_approved_at IS NOT NULL. Grouped by category in response. Filter: category, priority, scope, tags. |
| `GET` | `/lessons/tag-suggestions` | Manager+ | Tag autocomplete | Top 50 most-used tags across non-archived lessons. |

### 12.2 Lesson Lifecycle Transitions (7 endpoints)

| Method | Path | Auth | Description | Pre-Conditions | Fields Set Server-Side |
|---|---|---|---|---|---|
| `POST` | `/lessons/:id/submit` | Author only | Submit for review | Status must be `draft` or `rejected`. title ≥ 5, description ≥ 20, recommendation ≥ 20. | `status = submitted_for_review`, `submitted_at`, `review_due_at = submitted_at + 14d`. Writes `lesson_submitted_for_review`. |
| `POST` | `/lessons/:id/approve` | SM+ | Approve lesson | Status = `under_review`. Reviewer segregation checks (§6.2). At least one `approved` vote. No `rejected` vote outstanding. Approver ≠ author, approver ≠ any reviewer. | `status = approved`, `approved_by`, `approved_at`. Writes `lesson_approved`. |
| `POST` | `/lessons/:id/reject` | SM+ | Reject lesson | Status = `submitted_for_review` or `under_review`. Body: `rejectionReason` ≥ 20 chars. | `status = rejected`, `rejected_by`, `rejected_at`, `rejection_reason`. Writes `lesson_rejected`. |
| `POST` | `/lessons/:id/publish` | SM+ | Publish lesson | Status = `approved`. If `is_current_revision = false` (revision): atomically archives parent chain. Duplicate check (§9.2 index + 9.3 API check). | `status = published`, `published_by`, `published_at`. Ancestor `status = archived` if revision. Writes `lesson_published` + `lesson_archived` (ancestors). |
| `POST` | `/lessons/:id/archive` | SM+ | Archive published lesson | Status = `published`. Body: `archiveReason` ≥ 10 chars. | `status = archived`, `archived_by`, `archived_at`, `archive_reason`, `is_current_revision = false`. Writes `lesson_archived`. |
| `POST` | `/lessons/:id/revise` | SM+ | Create revision of published lesson | Status = `published`. | Creates new `oi_lesson_records` row with `parent_lesson_id = :id`, `revision_number = source.revision_number + 1`, copies all core fields, `status = draft`, `is_current_revision = true`. Source lesson `is_current_revision` unchanged until revision published. Writes `lesson_revised` on both source and new record. |
| `POST` | `/lessons/:id/approve-cross-project` | SM+ | Approve cross-project visibility | Status = `published`. `cross_project_applicable = true`. `cross_project_approved_at IS NULL`. | `cross_project_approved_by`, `cross_project_approved_at`. Writes `lesson_cross_project_approved`. |

### 12.3 Lesson Linkages (4 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:id/linkages` | Manager+ | Add linkage | HTTP 423 if lesson `published` or `archived`. Entity exists validation. `linked_entity_ref` server-populated. UNIQUE → 409. Duplicate-entity API check (§9.3). Writes `lesson_linked`. |
| `GET` | `/lessons/:id/linkages` | Manager+ | List linkages | Returns all with `linked_entity_ref`. |
| `DELETE` | `/lessons/:id/linkages/:linkId` | Manager+ | Remove linkage | HTTP 423 if lesson `published` or `archived`. Writes `lesson_unlinked`. |
| `GET` | `/lessons/by-entity/:linkType/:entityId` | Manager+ | Reverse lookup | Returns all lessons linked to entity, excluding archived, newest first. |

### 12.4 Lesson Reviewers (4 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:id/reviewers` | SM+ | Assign reviewer | Status = `submitted_for_review` or `under_review`. Reviewer segregation §6.1. Sets lesson to `under_review` if first reviewer and currently `submitted_for_review`. Writes `lesson_reviewer_assigned`. |
| `GET` | `/lessons/:id/reviewers` | Manager+ | List reviewers | Returns all with status. |
| `POST` | `/lessons/:id/reviewers/:reviewerId/vote` | Reviewer (self only) | Submit review vote | Body: `{ vote: 'approved' \| 'rejected', reviewNote? }`. Vote `rejected` does not auto-reject lesson — SM+ must call `/reject`. Writes `lesson_reviewer_voted`. |
| `POST` | `/lessons/:id/reviewers/:reviewerId/recuse` | Reviewer (self) or SM+ | Recuse reviewer | Sets `review_status = recused`. No automatic lesson state change. Writes `lesson_review_recused`. |

### 12.5 Recurrence Checks (3 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:id/recurrence-checks` | Manager+ | Record recurrence check | Lesson = `published`. `check_date` ≤ now(). If `recurrence_found = true`: `recurrence_detail` ≥ 20 chars + at least one of `linked_issue_id` / `linked_rca_id` required (§3.4 C4 rule). Writes `lesson_recurrence_recorded`. |
| `GET` | `/lessons/:id/recurrence-checks` | Manager+ | List checks | Newest first. |
| `DELETE` | `/lessons/:id/recurrence-checks/:checkId` | SM+ | Delete check | Hard delete. Writes audit event. |

### 12.6 Effectiveness Reviews (3 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:id/effectiveness-reviews` | Manager+ | Schedule or record review | Lesson = `published`. `review_date` ≤ now(). If `completed`: `effectiveness_rating` required + `observations` ≥ 20 chars. Writes `lesson_effectiveness_reviewed`. |
| `GET` | `/lessons/:id/effectiveness-reviews` | Manager+ | List reviews | Newest first. |
| `PATCH` | `/lessons/:id/effectiveness-reviews/:reviewId` | Manager+ | Update pending review | Only `pending` reviews. Writes `lesson_effectiveness_reviewed`. |

### 12.7 Acknowledgments (3 endpoints)

| Method | Path | Auth | Description | Key Business Rules |
|---|---|---|---|---|
| `POST` | `/lessons/:id/acknowledgments` | SM+ | Assign acknowledgment requirement | Lesson = `published` + cross-project approved. Scope validation (§10.2). UNIQUE constraint → 409. Writes `lesson_acknowledgment_required`. |
| `GET` | `/lessons/:id/acknowledgments` | Manager+ | List acknowledgments | Returns all with computed `is_overdue` field. |
| `POST` | `/lessons/:id/acknowledgments/:ackId/acknowledge` | Manager+ | Submit acknowledgment | `status = pending`. Sets `acknowledged_by`, `acknowledged_at`, `status = acknowledged`. Writes `lesson_acknowledged`. |

### 12.8 Dashboard Endpoints (4 endpoints)

| Method | Path | Auth | Description | Returns |
|---|---|---|---|---|
| `GET` | `/dashboard/lesson-summary` | Manager+ | Lesson pipeline summary | Counts by status. Counts by category (top 5). `cross_project_approved` count (published). Pending effectiveness reviews count (overdue by published_at + effectiveness_review_due_months). |
| `GET` | `/dashboard/lesson-recurrence-heatmap` | Manager+ | Recurrence heatmap | Per category: lessons with ≥1 recurrence_found=true check in past 12 months. Returns `{ category, recurrenceCount }[]` sorted descending. |
| `GET` | `/dashboard/lesson-pipeline` | SM+ | Full pipeline for triage | Lessons in `submitted_for_review` / `under_review` with `review_due_at`, reviewer count, pending reviewer count, days-until-overdue. |
| `GET` | `/dashboard/lesson-effectiveness-due` | Manager+ | Overdue effectiveness reviews | Published lessons where no completed review exists and `published_at + effectiveness_review_due_months` months < now(). |

### 12.9 Total: 35 endpoints

---

## 13. Server Route Registration

In `server/routes.ts`:

```typescript
import { oiLessonRouter } from "./oi-lesson-routes";
// After OI enforcement routes:
app.use("/api/oi", ensureAuthenticated, oiLessonRouter);
console.log("OI Lessons Learned routes registered");
```

---

## 14. Client Architecture

### 14.1 New Pages (2)

| File | Route | Description |
|---|---|---|
| `client/src/pages/oi/oi-lesson-register.tsx` | `/oi/lessons` | Two tabs: "All Lessons" (filterable with full-text search + tag filter) + "Cross-Project Register" |
| `client/src/pages/oi/oi-lesson-detail.tsx` | `/oi/lessons/:lessonId` | 7-tab detail page |

### 14.2 New Constants File (1)

`client/src/pages/oi/oi-lesson-constants.ts` — status colors/labels, category labels/colors, type labels, scope labels, priority colors, rating colors, linkage type labels, acknowledgment type labels

### 14.3 Lesson Detail Page — Tab Structure (7 tabs)

| Tab | Label | Contents |
|---|---|---|
| `overview` | Overview | Core fields. Status badge. Revision badge (if revision_number > 1). Parent lesson link. Action buttons (submit/approve/reject/publish/archive/revise/approve-cross-project) — role + state gated. Immutability warning banner when `published`. |
| `linkages` | Linkages | Table of linked entities. Add form (Manager+, blocked if published/archived). Delete button (Manager+, blocked if published/archived). |
| `reviewers` | Reviewers | Reviewer list with vote status. Assign form (SM+). Vote button (self). Recuse button. |
| `acknowledgments` | Acknowledgments | Acknowledgment list with overdue highlight. Assign form (SM+, cross-project-approved lessons only). Acknowledge button (Manager+, self-service). |
| `recurrence` | Recurrence | Check list. Add form (Manager+, published only). |
| `effectiveness` | Effectiveness | Review list. Schedule/record form (Manager+, published only). |
| `audit` | Audit Log | Full `oi_lesson_audit_log` for this lesson, newest first. |

### 14.4 Lesson Register Page — Tab Structure (2 tabs)

| Tab | Contents |
|---|---|
| All Lessons | Full-text search bar. Filter: status, category, type, scope, priority, tags. Sort: created_at, published_at. Shows `revision_number` badge for revisions. Default: is_current_revision = true. Toggle to show all revisions. |
| Cross-Project Register | Cross-project-approved + published + current revision only. Grouped by category. Shows acknowledgment completion rate per lesson. |

### 14.5 Routing and Lazy Loaders

`client/src/loaders/oi.ts` — add:
```typescript
export const OiLessonRegisterPage = lazy(() => import("../pages/oi/oi-lesson-register"));
export const OiLessonDetailPage   = lazy(() => import("../pages/oi/oi-lesson-detail"));
```

`client/src/App.tsx` — add:
```tsx
<Route path="/oi/lessons"            component={OiLessonRegisterPage} />
<Route path="/oi/lessons/:lessonId"  component={OiLessonDetailPage} />
```

### 14.6 Sidebar Entry (layout.tsx)

After "Enforcement Controls":
```tsx
{ href: "/oi/lessons", label: "Lessons Learned", icon: <BookMarked className="h-4 w-4" /> }
```

### 14.7 OI Dashboard (oi-dashboard.tsx)

`LessonDashboardPanels` component added after `EnforcementDashboardPanels`:
- **Lesson Pipeline Card**: status counts with colored badges.
- **Recurrence Heatmap Card**: top 5 categories by recurrence count, 12-month window. Shown only if ≥1 recurrence record exists.

### 14.8 Integration Tabs on Existing Detail Pages

Add "Lessons" tab to each via `GET /api/oi/lessons/by-entity/{linkType}/{entityId}`:

| Page | Link Type |
|---|---|
| `oi-sop-detail.tsx` | 8th tab, `sop` |
| `oi-enforcement-detail.tsx` | 6th tab, `enforcement_control` |
| `oi-issue-detail.tsx` | new tab, `issue` |
| `oi-rca-detail.tsx` | new tab, `rca` |
| `oi-capa-detail.tsx` | new tab, `capa` |

---

## 15. DB Migration SQL

Execute all statements via `psql "$DATABASE_URL"`.

### 15.1 Enum Additions (17 statements — each standalone, each outside any transaction)

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
ALTER TYPE oi_audit_action ADD VALUE 'lesson_revised';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_linked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_unlinked';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_recurrence_recorded';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_effectiveness_reviewed';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_cross_project_approved';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_acknowledgment_required';
ALTER TYPE oi_audit_action ADD VALUE 'lesson_acknowledged';
```

### 15.2 Table Creation

```sql
CREATE TABLE IF NOT EXISTS oi_lesson_records (
  id                              SERIAL         PRIMARY KEY,
  lesson_number                   VARCHAR(20)    NOT NULL UNIQUE,
  parent_lesson_id                INTEGER        REFERENCES oi_lesson_records(id) ON DELETE RESTRICT,
  revision_number                 INTEGER        NOT NULL DEFAULT 1,
  is_current_revision             BOOLEAN        NOT NULL DEFAULT true,
  title                           TEXT           NOT NULL,
  title_hash                      VARCHAR(32)    NOT NULL,
  description                     TEXT           NOT NULL,
  lesson_category                 VARCHAR(50)    NOT NULL,
  lesson_type                     VARCHAR(30)    NOT NULL,
  applicability_scope             VARCHAR(30)    NOT NULL DEFAULT 'global',
  scope_department                VARCHAR(100),
  scope_project_id                INTEGER        REFERENCES projects(id) ON DELETE SET NULL,
  scope_equipment_type            VARCHAR(100),
  tags                            TEXT[],
  status                          VARCHAR(30)    NOT NULL DEFAULT 'draft',
  process_area                    VARCHAR(100),
  root_cause_summary              TEXT,
  recommendation                  TEXT           NOT NULL,
  implementation_guidance         TEXT,
  priority                        VARCHAR(20)    NOT NULL DEFAULT 'normal',
  recurrence_risk                 VARCHAR(20),
  cross_project_applicable        BOOLEAN        NOT NULL DEFAULT false,
  cross_project_approved_by       INTEGER        REFERENCES users(id) ON DELETE RESTRICT,
  cross_project_approved_at       TIMESTAMP,
  effectiveness_review_due_months INTEGER                 DEFAULT 6,
  ts_document                     TSVECTOR,
  author_id                       INTEGER        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at                    TIMESTAMP,
  review_due_at                   TIMESTAMP,
  approved_by                     INTEGER        REFERENCES users(id) ON DELETE RESTRICT,
  approved_at                     TIMESTAMP,
  published_by                    INTEGER        REFERENCES users(id) ON DELETE RESTRICT,
  published_at                    TIMESTAMP,
  archived_by                     INTEGER        REFERENCES users(id) ON DELETE RESTRICT,
  archived_at                     TIMESTAMP,
  archive_reason                  TEXT,
  rejected_by                     INTEGER        REFERENCES users(id) ON DELETE RESTRICT,
  rejected_at                     TIMESTAMP,
  rejection_reason                TEXT,
  created_at                      TIMESTAMP      NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMP      NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS oi_lesson_acknowledgments (
  id                   INTEGER      PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  lesson_id            INTEGER      NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  acknowledgment_type  VARCHAR(20)  NOT NULL,
  target_department    VARCHAR(100),
  target_project_id    INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  is_required          BOOLEAN      NOT NULL DEFAULT true,
  due_date             TIMESTAMP,
  acknowledged_by      INTEGER      REFERENCES users(id) ON DELETE RESTRICT,
  acknowledged_at      TIMESTAMP,
  acknowledgment_note  TEXT,
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending',
  assigned_by          INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at          TIMESTAMP    NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oi_lesson_audit_log (
  id          SERIAL          PRIMARY KEY,
  lesson_id   INTEGER         NOT NULL REFERENCES oi_lesson_records(id) ON DELETE CASCADE,
  action      oi_audit_action NOT NULL,
  actor_id    INTEGER         NOT NULL,
  actor_name  TEXT            NOT NULL,
  actor_role  TEXT            NOT NULL,
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  context     TEXT,
  ip_address  TEXT,
  created_at  TIMESTAMP       NOT NULL DEFAULT now()
);
```

### 15.3 Indexes (28 total)

```sql
-- oi_lesson_records
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_status          ON oi_lesson_records(status);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_category        ON oi_lesson_records(lesson_category);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_author          ON oi_lesson_records(author_id);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_scope_project   ON oi_lesson_records(scope_project_id) WHERE scope_project_id IS NOT NULL;
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_cross_project   ON oi_lesson_records(cross_project_applicable, status) WHERE cross_project_applicable = true AND status = 'published';
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_current_rev     ON oi_lesson_records(parent_lesson_id, is_current_revision);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_created_at      ON oi_lesson_records(created_at);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_ts_document     ON oi_lesson_records USING GIN(ts_document);
CREATE INDEX          IF NOT EXISTS idx_oi_lessons_tags            ON oi_lesson_records USING GIN(tags);
CREATE UNIQUE INDEX   IF NOT EXISTS idx_oi_lessons_dup_prevention  ON oi_lesson_records(lesson_category, title_hash) WHERE status = 'published' AND is_current_revision = true;

-- oi_lesson_linkages
CREATE INDEX IF NOT EXISTS idx_oi_lesson_linkages_lesson_id ON oi_lesson_linkages(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_linkages_entity    ON oi_lesson_linkages(link_type, linked_entity_id);

-- oi_lesson_reviewers
CREATE INDEX IF NOT EXISTS idx_oi_lesson_reviewers_lesson_id   ON oi_lesson_reviewers(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_reviewers_reviewer_id ON oi_lesson_reviewers(reviewer_id);

-- oi_lesson_recurrence_checks
CREATE INDEX IF NOT EXISTS idx_oi_lesson_recurrence_lesson_id ON oi_lesson_recurrence_checks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_recurrence_found     ON oi_lesson_recurrence_checks(lesson_id, recurrence_found) WHERE recurrence_found = true;

-- oi_lesson_effectiveness_reviews
CREATE INDEX IF NOT EXISTS idx_oi_lesson_effectiveness_lesson_id ON oi_lesson_effectiveness_reviews(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_effectiveness_status    ON oi_lesson_effectiveness_reviews(review_status) WHERE review_status = 'pending';

-- oi_lesson_acknowledgments
CREATE INDEX IF NOT EXISTS idx_oi_lesson_ack_lesson_id ON oi_lesson_acknowledgments(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_ack_status    ON oi_lesson_acknowledgments(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_oi_lesson_ack_dept      ON oi_lesson_acknowledgments(target_department) WHERE target_department IS NOT NULL;

-- oi_lesson_audit_log
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_lesson_id ON oi_lesson_audit_log(lesson_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_actor     ON oi_lesson_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_oi_lesson_audit_action    ON oi_lesson_audit_log(action);
```

---

## 16. Schema Additions (shared/schema.ts)

### 16.1 Enum additions (after Phase 2B enforcement values)

```typescript
  // Phase 3A: Lessons Learned audit actions
  "lesson_created","lesson_submitted_for_review","lesson_reviewer_assigned",
  "lesson_reviewer_voted","lesson_review_recused","lesson_approved",
  "lesson_rejected","lesson_published","lesson_archived","lesson_revised",
  "lesson_linked","lesson_unlinked","lesson_recurrence_recorded",
  "lesson_effectiveness_reviewed","lesson_cross_project_approved",
  "lesson_acknowledgment_required","lesson_acknowledged",
```

### 16.2 New table exports (after `oiEnforcementAuditLog` block)

1. `oiLessonRecords` + `insertOiLessonRecordSchema` + `InsertOiLessonRecord` + `OiLessonRecord`
2. `oiLessonLinkages` + `insertOiLessonLinkageSchema` + `InsertOiLessonLinkage` + `OiLessonLinkage`
3. `oiLessonReviewers` + `insertOiLessonReviewerSchema` + `InsertOiLessonReviewer` + `OiLessonReviewer`
4. `oiLessonRecurrenceChecks` + `insertOiLessonRecurrenceCheckSchema` + `InsertOiLessonRecurrenceCheck` + `OiLessonRecurrenceCheck`
5. `oiLessonEffectivenessReviews` + `insertOiLessonEffectivenessReviewSchema` + `InsertOiLessonEffectivenessReview` + `OiLessonEffectivenessReview`
6. `oiLessonAcknowledgments` + `insertOiLessonAcknowledgmentSchema` + `InsertOiLessonAcknowledgment` + `OiLessonAcknowledgment`
7. `oiLessonAuditLog` + `insertOiLessonAuditLogSchema` + `InsertOiLessonAuditLog` + `OiLessonAuditLog`

---

## 17. Governance Validations Required Before Phase 3A Closure

| Validation | Description |
|---|---|
| Build validation | `npx tsc --noEmit` must produce 0 errors across full project |
| DB validation | All 7 tables, all 17 enum values, all 28 indexes confirmed in pg_catalog |
| Lesson creation and numbering | `LLN-{YYYY}-{NNN}` correctly assigned, unique, server-only |
| Lifecycle transition validation | Each state transition correctly gates and sets server-side fields |
| **Publication immutability** | PATCH returns 423 for published/archived. Linkage add/delete returns 423. No DELETE endpoint. |
| **Revision governance** | `POST /revise` creates new record with incremented revision_number; publication auto-archives parent atomically |
| **Reviewer segregation** | Author blocked from reviewer assignment; reviewer blocked from approval; approver ≠ reviewer verified |
| **Recurrence governance** | `recurrence_found=true` blocks without both `recurrence_detail` and linked issue/RCA |
| **Cross-project governance** | Lesson not visible in cross-project register without explicit cross-project approval by SM+ |
| **Acknowledgment workflow** | Assignment requires published + cross-project-approved; submission gated to Manager+ |
| **Full-text search** | `GET /lessons?q=` correctly uses `ts_document @@ plainto_tsquery`; GIN index used |
| **Tag filtering** | `GET /lessons?tags=` uses `@>` containment; `tags_any=` uses `&&`; GIN index used |
| **Duplicate prevention** | Same category + title_hash + status=published → 409 from DB index; same linked entity → 409 from API check |
| Audit immutability | No UPDATE/DELETE in audit service; no `updated_at` in audit table |
| Unauthorized access | 401 without auth; 403 for role violations |
| ERP mutation audit | Zero writes to any ERP entity table from lesson routes |
| Future-phase leakage | No AI, ML, vector embeddings, semantic search, automatic SOP/enforcement changes |

---

## §A — Audit Governance — Architectural Decision Record (Amendment 001 Consistency)

**Decision:** Phase 3A introduces `oi_lesson_audit_log` as a dedicated audit table for lesson events, following the same pattern established in Phase 2B Amendment 001 for `oi_enforcement_audit_log`.

**Why `oi_audit_log` cannot be reused:**

| Constraint | Detail |
|---|---|
| Hard schema constraint | `oi_audit_log` has `issue_id INTEGER NOT NULL` — cannot accept lesson records without an issue ID. This is a DB-level NOT NULL constraint that cannot be worked around without altering the existing table, which would affect all prior phases. |
| Semantic incompatibility | `oi_audit_log` is the audit trail for `oi_issues` records. Lesson events are semantically distinct from issue events. Mixing them pollutes the issue audit trail. |
| Query isolation | `GET /lessons/:id/audit-log` must return only lesson events. A dedicated table ensures O(lesson_id) performance. A shared table would require a discriminator column on an existing production table. |
| Future schema evolution | Lesson audit records carry `lesson_revised` and `lesson_cross_project_approved` actions that have no meaning in the issue lifecycle context. |

**Why `oi_enforcement_audit_log` cannot be reused:**

| Constraint | Detail |
|---|---|
| Structural scope | `oi_enforcement_audit_log` columns `control_id` / `hold_id` are enforcement-specific — no `lesson_id` column exists on that table. |
| Semantic isolation | Enforcement events (`enforcement_hold_emergency_bypassed`) are unrelated to lesson events (`lesson_acknowledged`). Cross-module audit pollution violates the Amendment 001 isolation principle. |

**Amendment 001 consistency:** The Amendment 001 pattern (established for enforcement) is: each major OI sub-module that is a first-class entity gets its own dedicated audit table with an `INSERT`-only service function. Phase 3A follows this pattern identically.

**Non-negotiable:** `writeLessonAuditLog()` is the only permitted write path to `oi_lesson_audit_log`. Direct `db.insert(oiLessonAuditLog)` calls outside the audit service are forbidden in Phase 3A implementation code.
