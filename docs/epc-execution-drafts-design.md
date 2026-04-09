# EPC Execution Drafts — Unified Automation Design

**Status:** DRAFT — Pending Review & Approval  
**Author:** Agent  
**Date:** 2026-04-08  
**Scope:** Automated DO/WO/PO/IO draft generation at Offer-to-Order conversion  
**Baseline Dependency:** `docs/epc-project-numbering-gcs-baseline.md` (v6-final)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Document Numbering Rules](#2-document-numbering-rules)
3. [Number Generation Timing & Immutability](#3-number-generation-timing--immutability)
4. [Concurrency Safety & Uniqueness](#4-concurrency-safety--uniqueness)
5. [Worked Examples](#5-worked-examples)
6. [Schema Changes](#6-schema-changes)
7. [Draft Generation Flow](#7-draft-generation-flow)
8. [Dependency Rules](#8-dependency-rules)
9. [Approval Task Flow](#9-approval-task-flow)
10. [Data Mapping](#10-data-mapping)
11. [Failure Handling](#11-failure-handling)
12. [API Endpoints](#12-api-endpoints)
13. [UI Design](#13-ui-design)
14. [Audit & Control](#14-audit--control)
15. [Impact on Existing Services](#15-impact-on-existing-services)
16. [Future Pipeline Integration](#16-future-pipeline-integration)

---

## 1. Overview

When an approved Offer is converted to a Project, the system must automatically generate **draft execution documents** for every project item. These drafts are pre-numbered, tracked, and gated through an approval workflow before they become active documents.

**Documents generated per project item:**

| Doc Type | Full Name | When Applicable |
|----------|-----------|----------------|
| DO | Drawing Order | Make items (custom). Skipped for Buy items. |
| WO | Work Order | Make items only |
| PO | Purchase Order | Buy items, or Make items with purchased sub-components |
| IO | Inspection Order | All items (incoming for Buy, in-process for Make) |

---

## 2. Document Numbering Rules

### 2.1 Numbering Standard

All document types follow the approved EPC numbering baseline. The key rule: **every document number is derived from the project code + document type + a 4-digit project-scoped sequence.**

| Doc Type | Abbr | Format | Sequence Scope | Width | Generator |
|----------|------|--------|---------------|-------|-----------|
| Project | PROJECT | `{FY}-{NNN}` | FY-global | 3 digits | `getNextProjectSeq(fyCode)` |
| Drawing Order | DO | `{PC}-DO-{NNNN}` | Per project | 4 digits | `getNextDocSeq('DO', projectId)` |
| Work Order | WO | `{PC}-WO-{NNNN}` | Per project | 4 digits | `getNextDocSeq('WO', projectId)` |
| Purchase Order | PO | `{PC}-PO-{NNNN}` | Per project | 4 digits | `getNextDocSeq('PO', projectId)` |
| Inspection Order | IO | `IO-{FY}-{ProjectSeq}-{Cat}-{NNNN}` | Per project | 4 digits | `getNextDocSeq('IO', projectId)` |

Where:
- `{FY}` = 4-digit financial year code (e.g., `2627`)
- `{NNN}` = 3-digit project sequence within FY (e.g., `001`)
- `{PC}` = Project Code = `{FY}-{NNN}` (e.g., `2627-001`)
- `{NNNN}` = 4-digit document sequence within project (e.g., `0001`)
- `{Cat}` = IO category: `M` (Make/in-process), `B` (Buy/incoming), `C` (Component)

### 2.2 Doc Type Rule: DO (Drawing Order) — NEW

Drawing Order is a **new document type** being added to the EPC Document Type Registry.

| Attribute | Value |
|-----------|-------|
| Abbreviation | `DO` |
| Format | `{PC}-DO-{NNNN}` |
| Scope | Per project |
| Sequence width | 4 digits |
| Authoritative table | `execution_drafts` (new) → activates into `epc_drawing_orders` (new) |
| Number column | `doc_number` |
| Example | `2627-001-DO-0001` |

**Rationale:** Drawing Orders track the formal request and approval for engineering drawings before production/procurement can begin. Currently managed via `epc_drawing_controls`, but those are drawing registrations — not drawing work orders. The DO represents the instruction to produce a drawing, which must be approved before WO/PO can proceed for custom items.

### 2.3 Doc Type Rule: IO (Inspection Order) — EXISTING, SEPARATE FORMAT

Inspection Orders retain their existing format from the baseline:

| Attribute | Value |
|-----------|-------|
| Abbreviation | IO |
| Format | `IO-{FY}-{ProjectSeq}-{Cat}-{NNNN}` |
| Scope | Per project |
| Sequence width | 4 digits |
| Authoritative table | `inspection_orders` |
| Number column | `inspection_order_number` |
| Example | `IO-2627-001-M-0001` (Make/in-process), `IO-2627-001-B-0001` (Buy/incoming) |

**IO format is NOT changed.** It follows its own numbering convention as documented in the baseline (Section 10 — Separate Numbering Systems). The `getNextDocSeq('IO', projectId)` function generates the sequence portion; the prefix and category are constructed by the IO generator.

### 2.4 WO and PO — EXISTING, UNCHANGED

| Doc | Format | Example |
|-----|--------|---------|
| WO | `{PC}-WO-{NNNN}` | `2627-001-WO-0001` |
| PO | `{PC}-PO-{NNNN}` | `2627-001-PO-0001` |

These follow the existing baseline rules. No format changes. The only change is that drafts are now pre-generated at conversion time rather than created manually later.

---

## 3. Number Generation Timing & Immutability

### 3.1 When Numbers Are Generated

| Event | What Happens |
|-------|-------------|
| Offer → Project conversion | `generateExecutionDrafts(projectId)` runs inside the conversion transaction |
| For each project item | System calls `getNextDocSeq(docType, projectId)` for each applicable doc type |
| Number assigned | Written to `execution_drafts.doc_number` immediately |
| Number persisted | Committed as part of the conversion transaction |

**Numbers are generated at draft creation time, NOT at activation time.**

### 3.2 Immutability Rules

| Rule | Enforcement |
|------|------------|
| Once assigned, a doc number NEVER changes | `doc_number` column: `NOT NULL`, no UPDATE allowed after INSERT |
| Rejected drafts retain their number | Number is consumed. A new draft for the same item gets a NEW number. |
| Held drafts retain their number | When released from hold, the original number is used. |
| Deleted/canceled drafts consume the number | The sequence does not reset. Gaps are acceptable and expected. |

**No recycling. No reuse. Gaps are normal.**

### 3.3 Guardrail Enforcement

All generated numbers pass through the existing guardrail assertions:

| Doc Type | Guardrail | Function |
|----------|-----------|----------|
| DO | `assertChildDocNumber()` | Validates `{PC}-DO-{NNNN}` format |
| WO | `assertChildDocNumber()` | Validates `{PC}-WO-{NNNN}` format |
| PO | `assertChildDocNumber()` | Validates `{PC}-PO-{NNNN}` format |
| IO | Custom validation | Validates `IO-{FY}-{Seq}-{Cat}-{NNNN}` format (existing IO validator) |

The `DO` type must be added to the guardrails' `CHILD_DOC_RE` pattern and to the `DOC_TYPE_ABBR` registry.

---

## 4. Concurrency Safety & Uniqueness

### 4.1 Sequence Engine (Existing — No Changes)

All numbers use the existing `doc_sequences` table with atomic `INSERT ... ON CONFLICT DO UPDATE`:

```sql
INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq)
VALUES ($1, NULL, $2, 1)
ON CONFLICT (doc_type, project_id)
  WHERE project_id IS NOT NULL
DO UPDATE SET next_seq = doc_sequences.next_seq + 1
RETURNING next_seq
```

- Single atomic SQL statement — no SELECT-then-INSERT race
- Row-level lock held only during the RETURNING — minimal contention
- Unique constraint on `(doc_type, project_id)` WHERE `project_id IS NOT NULL`
- Returns the consumed sequence number; caller pads to 4 digits

### 4.2 Idempotency in Draft Generation

Draft generation is idempotent per `(project_id, project_item_id, doc_type)`:

```sql
-- Before creating a draft, check:
SELECT id FROM execution_drafts
WHERE project_id = $1 AND project_item_id = $2 AND doc_type = $3
  AND status NOT IN ('rejected', 'canceled')
```

- If an active draft exists → skip (do not create duplicate)
- If only rejected/canceled drafts exist → create new draft with NEW number
- Unique constraint: `UNIQUE(project_id, project_item_id, doc_type) WHERE status NOT IN ('rejected', 'canceled')`

### 4.3 Uniqueness Guarantees

| Level | Guarantee | Mechanism |
|-------|-----------|-----------|
| Sequence per project per type | No duplicates | `doc_sequences` atomic counter |
| Draft per item per type | One active draft | Partial unique index on `execution_drafts` |
| Doc number globally | Unique across system | Project code prefix ensures global uniqueness |
| Cross-project | No collisions | Project code is globally unique (FY-scoped sequence) |

---

## 5. Worked Examples

### 5.1 Scenario: Offer OFR-2627-005 converted to Project

**Offer:** OFR-2627-005  
**Customer:** LWA (Lubricating World Arabia)  
**Financial Year:** 2627  
**Project Code Generated:** `2627-003` (third project in FY 2627)

**Offer Line Items:**

| # | Item | Make/Buy | Qty |
|---|------|----------|-----|
| 1 | Thermic Fluid Heater 10L | Make | 1 |
| 2 | Control Panel CP-200 | Make | 1 |
| 3 | Expansion Tank ET-50 | Buy | 2 |
| 4 | Temperature Sensor TS-K | Buy | 4 |

### 5.2 Drafts Generated

**Item 1: Thermic Fluid Heater 10L (Make)**

| Draft | Doc Number | Status | Dependency |
|-------|-----------|--------|------------|
| DO | `2627-003-DO-0001` | `draft_system_generated` | None |
| WO | `2627-003-WO-0001` | `draft_system_generated` | Blocked until DO approved |
| IO | `IO-2627-003-M-0001` | `draft_system_generated` | Independent |

**Item 2: Control Panel CP-200 (Make)**

| Draft | Doc Number | Status | Dependency |
|-------|-----------|--------|------------|
| DO | `2627-003-DO-0002` | `draft_system_generated` | None |
| WO | `2627-003-WO-0002` | `draft_system_generated` | Blocked until DO approved |
| IO | `IO-2627-003-M-0002` | `draft_system_generated` | Independent |

**Item 3: Expansion Tank ET-50 (Buy)**

| Draft | Doc Number | Status | Dependency |
|-------|-----------|--------|------------|
| DO | — | Skipped (Buy item) | — |
| WO | — | Skipped (Buy item) | — |
| PO | `2627-003-PO-0001` | `draft_system_generated` | None |
| IO | `IO-2627-003-B-0001` | `draft_system_generated` | Independent |

**Item 4: Temperature Sensor TS-K (Buy)**

| Draft | Doc Number | Status | Dependency |
|-------|-----------|--------|------------|
| DO | — | Skipped (Buy item) | — |
| WO | — | Skipped (Buy item) | — |
| PO | `2627-003-PO-0002` | `draft_system_generated` | None |
| IO | `IO-2627-003-B-0002` | `draft_system_generated` | Independent |

### 5.3 Sequence State After Generation

| doc_type | project_id | next_seq |
|----------|-----------|----------|
| DO | 42 | 3 (consumed 0001, 0002) |
| WO | 42 | 3 (consumed 0001, 0002) |
| PO | 42 | 3 (consumed 0001, 0002) |
| IO | 42 | 5 (consumed 0001–0004) |

### 5.4 Rejection & Re-draft Scenario

If `2627-003-DO-0001` is rejected:
- Draft status → `rejected`, rejection_remarks recorded
- Original number `2627-003-DO-0001` is consumed (never reused)
- User can request re-draft → new draft created with `2627-003-DO-0003`
- Sequence counter continues from 3

---

## 6. Schema Changes

### 6.1 New Table: `execution_drafts`

```
execution_drafts
├── id                    serial PK
├── project_id            integer FK → projects(id) NOT NULL
├── project_item_id       integer FK → project_items(id) NOT NULL
├── doc_type              varchar(10) NOT NULL  -- 'DO', 'WO', 'PO', 'IO'
├── doc_number            varchar(30) NOT NULL  -- immutable after INSERT
├── status                varchar(30) NOT NULL DEFAULT 'draft_system_generated'
│                         -- draft_system_generated → pending_approval → approved | rejected | on_hold
├── generated_by          varchar(20) NOT NULL DEFAULT 'system'
├── approved_by           integer FK → users(id) NULL
├── rejected_by           integer FK → users(id) NULL
├── rejection_remarks     text NULL  -- required on rejection
├── hold_remarks          text NULL
├── linked_task_id        integer FK → tasks(id) NULL
├── dependency_doc_type   varchar(10) NULL  -- e.g., 'DO' (what this draft depends on)
├── dependency_met        boolean NOT NULL DEFAULT false
├── source_data           jsonb NOT NULL DEFAULT '{}'
│                         -- { drawing_no, revision, ecr_number, ecn_number,
│                         --   vendor_id, vendor_name, bom_header_id,
│                         --   make_or_buy, quantity, uom, specification }
├── activated_entity_id   integer NULL  -- ID of real WO/PO/IO/DO created on approval
├── activated_entity_type varchar(50) NULL  -- table name of the activated entity
├── error_message         text NULL
├── created_at            timestamp NOT NULL DEFAULT NOW()
├── updated_at            timestamp NOT NULL DEFAULT NOW()
│
├── UNIQUE(project_id, project_item_id, doc_type)
│     WHERE status NOT IN ('rejected', 'canceled')
│     -- partial unique index: one active draft per item per type
│
└── INDEX(project_id, status)
```

### 6.2 New Table: `epc_drawing_orders`

```
epc_drawing_orders
├── id                    serial PK
├── do_number             varchar(30) NOT NULL UNIQUE  -- e.g., 2627-001-DO-0001
├── project_id            integer FK → projects(id) NOT NULL
├── project_item_id       integer FK → project_items(id) NOT NULL
├── master_item_id        integer FK → master_items(id) NULL
├── item_code             varchar(100) NULL
├── item_description      text NULL
├── drawing_type          varchar(30) NULL  -- 'GA', 'fabrication', 'assembly', 'detail'
├── required_by_date      timestamp NULL
├── assigned_to           integer FK → users(id) NULL  -- design engineer
├── status                varchar(30) NOT NULL DEFAULT 'draft'
│                         -- draft → approved → in_progress → completed → released
├── drawing_no            varchar(100) NULL  -- output drawing number when completed
├── revision              varchar(10) NULL
├── linked_ecr_number     varchar(30) NULL
├── linked_ecn_number     varchar(30) NULL
├── linked_dwg_control_id integer FK → epc_drawing_controls(id) NULL
├── notes                 text NULL
├── created_by            integer FK → users(id) NOT NULL
├── created_at            timestamp NOT NULL DEFAULT NOW()
├── updated_at            timestamp NOT NULL DEFAULT NOW()
```

### 6.3 Registry Updates

**`DOC_TYPE_ABBR` in `server/epc-coding.ts` — add DO:**

```typescript
'DO': { table: 'epc_drawing_orders', column: 'do_number', label: 'Drawing Order' },
```

**`CHILD_DOC_RE` in `server/epc-guardrails.ts` — already covers DO:**

The existing regex `^\d{4}-\d{3}-[A-Z]{2,4}-\d{4}$` already matches `2627-001-DO-0001` (DO is 2 letters, within the 2–4 range).

### 6.4 Baseline Update Required

Add to `docs/epc-project-numbering-gcs-baseline.md` Section 4.2:

| Doc Type | Full Name | Authoritative Table | Number Column | Scope | Format |
|----------|-----------|---------------------|---------------|-------|--------|
| DO | Drawing Order | `epc_drawing_orders` | `do_number` | Per project | `{PC}-DO-{NNNN}` |

---

## 7. Draft Generation Flow

### 7.1 Service: `generateExecutionDrafts(projectId, userId)`

```
ENTRY: Called at end of offer-conversion transaction

1. LOAD project record (code, fy_code, project_seq)
2. LOAD all project_items for this project with master_item data
3. VALIDATE project code via assertProjectCode()

4. BEGIN TRANSACTION
   For each project_item:
     a. IDEMPOTENCY CHECK
        - Query execution_drafts for active drafts for this item
        - If active drafts exist → skip this item (log: "already generated")

     b. CLASSIFY ITEM
        - If make_or_buy = 'Make':  generate DO, WO, IO(M)
        - If make_or_buy = 'Buy':   generate PO, IO(B)

     c. FOR EACH applicable doc_type:
        i.   GENERATE NUMBER
             - DO/WO/PO: call getNextDocSeq(docType, projectId, tx)
               → compose: `${projectCode}-${docType}-${seq}`
               → assertChildDocNumber(number, context)
             - IO: call getNextDocSeq('IO', projectId, tx)
               → compose: `IO-${fyCode}-${projectSeq}-${category}-${seq}`

        ii.  SNAPSHOT SOURCE DATA
             - { drawing_no, revision, ecr, ecn, vendor_id, vendor_name,
                 bom_header_id, make_or_buy, quantity, uom, specification,
                 master_item_code, master_item_description }

        iii. SET DEPENDENCY
             - WO draft: dependency_doc_type = 'DO' (for Make items)
             - PO draft: dependency_doc_type = 'DO' (for Make items with purchased subs)
             - DO draft: dependency_doc_type = NULL (no dependency)
             - IO draft: dependency_doc_type = NULL (independent)
             - Buy items: no DO dependency

        iv.  INSERT execution_draft row
             - status = 'draft_system_generated'
             - generated_by = 'system'

        v.   CREATE APPROVAL TASK
             - via createEpcTask() with automationKey
             - title: "Approve {docType} {docNumber} for {itemCode}"
             - assigned to: role-based (DO→Design Lead, WO→Production Lead,
               PO→Procurement Lead, IO→Quality Lead)
             - link task_id back to execution_draft

5. COMMIT TRANSACTION

6. RETURN summary:
   { projectId, created: N, skipped: N, failed: N,
     drafts: [{ doc_type, doc_number, project_item_id, status }] }

7. ON ERROR:
   - ROLLBACK transaction (no partial drafts)
   - Log error with full context
   - Create alert task for Project Manager
   - Return error summary (safe for retry — idempotent)
```

### 7.2 Transaction Safety

- All drafts for a project are created in ONE transaction
- If any draft fails (sequence error, validation error, DB error) → entire batch rolls back
- No partial state — either all drafts exist or none do
- Retry is safe because idempotency check runs first

---

## 8. Dependency Rules

### 8.1 Dependency Matrix

| Item Type | DO | WO | PO | IO |
|-----------|----|----|----|----|
| **Make (custom)** | No dependency | Blocked until DO approved | Blocked until DO approved (if Make item has purchased subs) | Independent |
| **Buy (standard)** | Skipped | Skipped | No dependency | Independent |

### 8.2 Dependency Enforcement

When a user attempts to **Approve** a draft:

```
1. Check: does this draft have a dependency_doc_type?
2. If YES:
   a. Query: is there an approved execution_draft for the SAME project_item_id
      with doc_type = dependency_doc_type?
   b. If NO → BLOCK approval with message:
      "Cannot approve {docType} {docNumber}: Drawing Order {doNumber} must be
       approved first for item {itemCode}."
   c. If YES → Allow approval, set dependency_met = true
3. If NO dependency → Allow approval
```

### 8.3 Cascade on DO Approval

When a DO draft is approved:
- System checks all WO and PO drafts for the same `project_item_id`
- Updates their `dependency_met = true`
- Updates their status from `draft_system_generated` → `pending_approval`
- Sends notification to assignees: "Drawing Order approved — WO/PO now ready for approval"

---

## 9. Approval Task Flow

### 9.1 Task Actions

Each execution_draft has a linked approval task with 3 possible actions:

| Action | Effect on Draft | Effect on Task | Requirements |
|--------|----------------|----------------|--------------|
| **Approve** | status → `approved`, approved_by set, activated_entity created | task → `completed` | Dependency met. User has Manager+ role. |
| **Reject** | status → `rejected`, rejected_by set, rejection_remarks recorded | task → `completed` with rejection reason | Remarks mandatory. |
| **Hold** | status → `on_hold`, hold_remarks recorded | task → `on_hold` | Optional remarks. |

### 9.2 Status Flow

```
draft_system_generated
  ├──→ pending_approval  (when dependency met, or no dependency)
  │     ├──→ approved     (creates real entity, task completed)
  │     ├──→ rejected     (remarks required, number consumed, task completed)
  │     └──→ on_hold      (paused, task on hold)
  │           └──→ pending_approval  (resumed from hold)
  └──→ canceled          (project canceled or item removed)
```

### 9.3 Activation on Approval

When a draft is approved, the system creates the real entity in the authoritative table:

| Draft Type | Creates Entity In | Key Fields Copied |
|------------|------------------|-------------------|
| DO | `epc_drawing_orders` | do_number, project_id, item data, assigned_to |
| WO | `epc_work_orders` | wo_number, project_id, item data, BOM link |
| PO | `epc_purchase_orders` | po_number, project_id, item data, vendor |
| IO | `inspection_orders` | inspection_order_number, project_id, type, item data |

The `execution_drafts.activated_entity_id` and `activated_entity_type` are set to point to the created record.

---

## 10. Data Mapping

### 10.1 Source Data Snapshot

At draft creation, the following data is captured from Project + Items + BOM + Vendor:

| Field | Source | Stored In |
|-------|--------|-----------|
| drawing_no | `project_items` or `epc_drawing_controls` | `source_data.drawing_no` |
| revision | `epc_drawing_controls.revision_code` | `source_data.revision` |
| ecr_number | `engineering_change_requests.document_number` | `source_data.ecr_number` |
| ecn_number | `engineering_change_notices.document_number` | `source_data.ecn_number` |
| vendor_id | `project_items.vendor_id` or `po_preparation_records` | `source_data.vendor_id` |
| vendor_name | Resolved from vendors table | `source_data.vendor_name` |
| bom_header_id | `epc_bom_headers.id` (current, released) | `source_data.bom_header_id` |
| make_or_buy | `project_items.make_or_buy` | `source_data.make_or_buy` |
| quantity | `project_items.quantity` | `source_data.quantity` |
| uom | `project_items.uom` | `source_data.uom` |
| specification | `project_items.specification` | `source_data.specification` |
| master_item_code | `master_items.item_code` | `source_data.master_item_code` |
| master_item_description | `master_items.description` | `source_data.master_item_description` |

### 10.2 Separate Fields — Not in Barcode

Drawing number, revision, ECR, and ECN are stored as **separate named fields** in `source_data` JSON — never embedded in barcodes or composite strings. This ensures:
- Each field is independently queryable
- Revision tracking is explicit
- ECR/ECN linkage is traceable
- No data loss from format changes

---

## 11. Failure Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| DB error during draft creation | Full transaction rollback. No partial drafts. | Safe retry — idempotency check prevents duplicates. |
| Sequence engine failure | Transaction rollback. Sequence not consumed. | Retry generates the correct next number. |
| Guardrail assertion failure | Transaction rollback. Violation logged. | Fix the root cause (invalid project code, etc.), then retry. |
| Task creation failure | Draft row exists but no task. | Background job detects orphan drafts and creates missing tasks. |
| Activation failure (on approval) | Draft stays `pending_approval`. Error logged. | Admin can retry activation. Draft number is preserved. |

### Retry Safety

```
generateExecutionDrafts(projectId) is safe to call multiple times:
  - First call: creates all drafts
  - Second call: skips all items (active drafts exist)
  - After rejection: creates new drafts only for rejected items
  - After partial failure + rollback: creates all drafts (none exist)
```

---

## 12. API Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/projects/:id/generate-drafts` | Trigger draft generation (also called automatically at conversion) | Manager+ |
| GET | `/api/projects/:id/execution-drafts` | List all drafts for a project, grouped by item | Authenticated |
| GET | `/api/execution-drafts/:id` | Get single draft detail with audit trail | Authenticated |
| POST | `/api/execution-drafts/:id/approve` | Approve a draft → creates real entity | Manager+ |
| POST | `/api/execution-drafts/:id/reject` | Reject a draft (remarks required) | Manager+ |
| POST | `/api/execution-drafts/:id/hold` | Put draft on hold | Manager+ |
| POST | `/api/execution-drafts/:id/resume` | Resume from hold → pending_approval | Manager+ |
| POST | `/api/execution-drafts/:id/re-draft` | Create new draft for a rejected item | Manager+ |

---

## 13. UI Design

### 13.1 Execution Drafts Tab

New tab on the Project detail page: **"Execution Drafts"**

Layout: Card grid grouped by project item. Each item card shows:

```
┌─────────────────────────────────────────────┐
│ Item: Thermic Fluid Heater 10L  [Make]      │
│ Code: 2627-003-P2627-003-001                │
├──────────┬──────────┬──────────┬────────────┤
│ DO       │ WO       │ PO       │ IO         │
│ DO-0001  │ WO-0001  │ —        │ IO-M-0001  │
│ ●Pending │ ⊘Blocked │          │ ●Pending   │
│ [Approve]│ Needs DO │          │ [Approve]  │
│ [Reject] │          │          │ [Reject]   │
│ [Hold]   │          │          │ [Hold]     │
└──────────┴──────────┴──────────┴────────────┘
```

### 13.2 Status Badges

| Status | Color | Badge |
|--------|-------|-------|
| `draft_system_generated` | Grey | "Draft" |
| `pending_approval` | Yellow | "Pending Approval" |
| `approved` | Green | "Approved" |
| `rejected` | Red | "Rejected" |
| `on_hold` | Orange | "On Hold" |
| `canceled` | Dark grey | "Canceled" |
| Blocked (dependency) | Blue outline | "Waiting for DO" |

### 13.3 Summary Bar

At the top of the tab:
```
Execution Drafts: 10 total | 3 Pending | 2 Blocked | 1 Approved | 0 Rejected | 4 Draft
```

---

## 14. Audit & Control

### 14.1 Fields Tracked on `execution_drafts`

| Field | When Set |
|-------|----------|
| `generated_by` | At creation (`'system'` for auto-generated) |
| `approved_by` | On approval (user ID) |
| `rejected_by` | On rejection (user ID) |
| `rejection_remarks` | On rejection (mandatory) |
| `hold_remarks` | On hold (optional) |
| `created_at` | At creation |
| `updated_at` | On every status change |

### 14.2 Workflow Events

Every status change writes to `project_workflow_events`:

| Event Type | Data |
|------------|------|
| `execution_draft.created` | `{ doc_type, doc_number, project_item_id, generated_by }` |
| `execution_draft.approved` | `{ doc_type, doc_number, approved_by, activated_entity_id }` |
| `execution_draft.rejected` | `{ doc_type, doc_number, rejected_by, rejection_remarks }` |
| `execution_draft.held` | `{ doc_type, doc_number, held_by, hold_remarks }` |
| `execution_draft.resumed` | `{ doc_type, doc_number, resumed_by }` |
| `execution_draft.dependency_met` | `{ doc_type, doc_number, dependency_doc_type, dependency_doc_number }` |

### 14.3 Full Audit Query

```sql
SELECT * FROM project_workflow_events
WHERE project_id = $1
  AND event_type LIKE 'execution_draft.%'
ORDER BY created_at;
```

---

## 15. Impact on Existing Services

### 15.1 Files Modified

| File | Change |
|------|--------|
| `server/epc-coding.ts` | Add `'DO'` to `DOC_TYPE_ABBR` registry |
| `server/epc-guardrails.ts` | No change needed — DO already matches `CHILD_DOC_RE` |
| `server/offer-conversion.ts` | Add call to `generateExecutionDrafts()` after project creation |
| `shared/schema.ts` | Add `execution_drafts` and `epc_drawing_orders` tables |
| `docs/epc-project-numbering-gcs-baseline.md` | Add DO to Section 4.2 document type registry |

### 15.2 Files Created

| File | Purpose |
|------|---------|
| `server/pipeline/generate-execution-drafts.ts` | Core draft generation service |
| `server/pipeline/draft-approval.ts` | Approve/reject/hold logic + activation |
| `server/pipeline/pipeline-routes.ts` | API endpoints |
| `server/pipeline/pipeline-types.ts` | TypeScript types |
| `client/src/components/execution-drafts.tsx` | Frontend tab component |

### 15.3 No Impact On

| System | Why |
|--------|-----|
| Existing WO/PO creation routes | These remain available for manual creation. Drafts are an additional pathway. |
| Existing IO generators | IO generation from WO release/PO issuance remains unchanged. Draft IO is a pre-generation for planning visibility. |
| Existing BOM/DWG flows | BOM and Drawing Control are upstream inputs, not affected by draft generation. |
| EPC numbering guardrails | DO already matches the regex. No guardrail changes needed. |
| GCS paths | No GCS paths involved in draft generation. Paths are created when documents are activated and files are attached. |

---

## 16. Future Pipeline Integration

The `execution_drafts` system is designed to plug directly into the approved Pipeline Orchestrator:

| Pipeline Stage | Execution Drafts Role |
|---------------|----------------------|
| S2 (Offer → Project) | `generateExecutionDrafts()` runs automatically |
| S5 (Planning Release) | Can auto-approve DO drafts in Express/Full Auto mode |
| S10 (WO/PO Created) | Draft approval activates entities (replaces manual creation) |
| S12 (IO Generated) | Draft IO activation replaces trigger-based IO generation |

The `automation_mode` on projects (Manual/Assisted/Express/Full Auto) will control whether draft approval tasks wait for humans or auto-advance.

---

**END OF DESIGN DOCUMENT**

**Action Required:** Review and approve before implementation begins.

**Baseline Update Required:** Adding DO to the EPC Project Numbering baseline requires a new audit per the production guardrail policy.
