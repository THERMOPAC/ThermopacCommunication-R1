# EPC Execution Plan — Unified Automation Design

**Status:** IMPLEMENTATION BASELINE v3 — Final corrections applied  
**Author:** Agent  
**Date:** 2026-04-09  
**Scope:** Automated DO/WO/PO/IO draft generation at Offer-to-Order conversion  
**Baseline Dependency:** `docs/epc-project-numbering-gcs-baseline.md` (v6-final)  
**Usage:** This document is the implementation baseline. Each module must be confirmed against this document during development.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Scope & Backward Compatibility](#2-scope--backward-compatibility)
3. [Document Numbering Rules](#3-document-numbering-rules)
4. [Number Generation Timing & Immutability](#4-number-generation-timing--immutability)
5. [Concurrency Safety & Uniqueness](#5-concurrency-safety--uniqueness)
6. [Worked Examples](#6-worked-examples)
7. [Schema Changes](#7-schema-changes)
8. [Draft Generation Flow](#8-draft-generation-flow)
9. [Dependency Rules](#9-dependency-rules)
10. [Approval Authority & Separation of Duties](#10-approval-authority--separation-of-duties)
11. [Approval Task Assignment](#11-approval-task-assignment)
12. [Task Due Date & SLA Rules](#12-task-due-date--sla-rules)
13. [Approval vs Activation (Two-Phase)](#13-approval-vs-activation-two-phase)
14. [IO Trigger Rules & Deduplication](#14-io-trigger-rules--deduplication)
15. [Re-Draft Rules](#15-re-draft-rules)
16. [Data Mapping](#16-data-mapping)
17. [Failure Handling](#17-failure-handling)
18. [API Endpoints](#18-api-endpoints)
19. [UI Design](#19-ui-design)
20. [Audit & Control](#20-audit--control)
21. [Impact on Existing Services](#21-impact-on-existing-services)
22. [Future Pipeline Integration](#22-future-pipeline-integration)

---

## 1. Overview

When an approved Offer is converted to a Project, the system must automatically generate **draft execution documents** for every project item. These drafts are pre-numbered, tracked, and gated through an approval workflow before they become active documents.

**Documents generated per project item:**

| Doc Type | Full Name | When Applicable (`applicable`) |
|----------|-----------|-------------------------------|
| DO | Drawing Order | `true` for Make items. `false` for Buy items. |
| WO | Work Order | `true` for Make items. `false` for Buy items. |
| PO | Purchase Order | `true` for Buy items, or Make items with purchased sub-components. `false` otherwise. |
| IO | Inspection Order | `true` for all items. Make → in-process (linked to WO). Buy → incoming (linked to PO). |

**Key design principle:** Items where a doc type does not apply are marked `applicable = false` — they are NOT "skipped" or omitted. Every item has a row for every doc type, providing full visibility.

---

## 2. Scope & Backward Compatibility

### 2.1 Activation Scope

| Rule | Detail |
|------|--------|
| **New conversions only** | Draft generation runs ONLY on **new** Offer → Project conversions performed after this feature is deployed. |
| **No retroactive generation** | Existing projects (IDs 1–18, 20+) are NOT touched. No drafts are generated, no numbering is changed, no workflows are altered. |
| **Test project** | Project ID 19 is the designated test project for validating this feature during development and QA. |
| **Opt-in for existing** | If an existing project needs draft generation in the future, a manual trigger (`POST /api/projects/:id/generate-drafts`) can be used — but this is never automatic. |

### 2.2 Backward Compatibility Guarantees

| Guarantee | Detail |
|-----------|--------|
| **Manual WO creation** | Existing `POST /api/epc-work-orders` route remains fully functional. Users can still create WOs manually for any project — old or new. |
| **Manual PO creation** | Existing `POST /api/epc-purchase-orders` route remains fully functional. No changes to manual PO creation. |
| **Manual IO creation** | Existing IO generators (`fixed-inspection-order-generator.ts`, WO-release triggers, PO-issuance triggers) remain fully functional and unchanged. |
| **No forced draft generation** | Old projects never have `generateExecutionDrafts()` called automatically. The function only runs inside `executeOfferConversion()` for new conversions. |
| **No numbering changes** | Existing WO/PO/IO numbers are not modified. The sequence engine continues from where it left off for each project. |
| **No schema conflicts** | The new `execution_drafts` and `epc_drawing_orders` tables are additive — no columns added to existing tables, no column renames, no type changes. |
| **Dual path** | For new projects, both paths work: (a) automated drafts from conversion, OR (b) manual creation using existing routes. They coexist without conflict. |

### 2.3 What Changes for New Projects

| Aspect | Before | After |
|--------|--------|-------|
| Offer → Project conversion | Creates project + items only | Creates project + items + execution drafts |
| DO/WO/PO/IO creation | Entirely manual | Pre-numbered drafts created, approved via task workflow, then activated into real entities (two-phase) |
| Document numbering | Assigned at manual creation time | Pre-assigned at conversion time (immutable) |
| Approval workflow | No formal approval gate | Approval tasks with dependency rules (DO gates WO/PO) |

### 2.4 Implementation Safety Rules

1. **`generateExecutionDrafts()` is called ONLY inside `executeOfferConversion()`** — never from a cron job, startup script, or migration.
2. **No migration script** runs against existing projects to backfill drafts.
3. **Existing routes are not modified** — only new routes are added (`/api/execution-drafts/*`).
4. **Existing tables are not altered** — `epc_work_orders`, `epc_purchase_orders`, `inspection_orders` schemas remain unchanged.
5. **Feature flag check** (future): If needed, a `projects.automation_mode` column can gate whether a specific project uses draft generation or manual mode. Not implemented in Phase 1 — all new conversions generate drafts.

---

## 3. Document Numbering Rules

### 3.1 Numbering Standard

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

### 3.2 Doc Type Rule: DO (Drawing Order) — NEW

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

### 3.3 Doc Type Rule: IO (Inspection Order) — EXISTING, SEPARATE FORMAT

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

### 3.4 WO and PO — EXISTING, UNCHANGED

| Doc | Format | Example |
|-----|--------|---------|
| WO | `{PC}-WO-{NNNN}` | `2627-001-WO-0001` |
| PO | `{PC}-PO-{NNNN}` | `2627-001-PO-0001` |

These follow the existing baseline rules. No format changes. The only change is that drafts are now pre-generated at conversion time rather than created manually later.

---

## 4. Number Generation Timing & Immutability

### 4.1 When Numbers Are Generated

| Event | What Happens |
|-------|-------------|
| Offer → Project conversion | `generateExecutionDrafts(projectId)` runs inside the conversion transaction |
| For each project item | System calls `getNextDocSeq(docType, projectId)` for each applicable doc type |
| Number assigned | Written to `execution_drafts.doc_number` immediately |
| Number persisted | Committed as part of the conversion transaction |

**Numbers are generated at draft creation time, NOT at activation time.**

Numbers are ONLY generated for rows where `applicable = true`. Rows with `applicable = false` have `doc_number = NULL`.

### 4.2 Immutability Rules

| Rule | Enforcement |
|------|------------|
| Once assigned, a doc number NEVER changes | `doc_number` column: no UPDATE allowed after INSERT |
| Rejected drafts retain their number | Number is consumed. A new draft for the same item gets a NEW number. |
| Held drafts retain their number | When released from hold, the original number is used. |
| Deleted/canceled drafts consume the number | The sequence does not reset. Gaps are acceptable and expected. |

**No recycling. No reuse. Gaps are normal.**

### 4.3 Guardrail Enforcement

All generated numbers pass through the existing guardrail assertions:

| Doc Type | Guardrail | Function |
|----------|-----------|----------|
| DO | `assertChildDocNumber()` | Validates `{PC}-DO-{NNNN}` format |
| WO | `assertChildDocNumber()` | Validates `{PC}-WO-{NNNN}` format |
| PO | `assertChildDocNumber()` | Validates `{PC}-PO-{NNNN}` format |
| IO | Custom validation | Validates `IO-{FY}-{Seq}-{Cat}-{NNNN}` format (existing IO validator) |

The `DO` type must be added to the guardrails' `CHILD_DOC_RE` pattern and to the `DOC_TYPE_ABBR` registry.

---

## 5. Concurrency Safety & Uniqueness

### 5.1 Sequence Engine (Existing — No Changes)

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

### 5.2 Idempotency in Draft Generation

Draft generation is idempotent per `(project_id, project_item_id, doc_type)`:

```sql
SELECT id FROM execution_drafts
WHERE project_id = $1 AND project_item_id = $2 AND doc_type = $3
  AND approval_status NOT IN ('rejected', 'canceled')
```

- If an active draft exists → skip (do not create duplicate)
- If only rejected/canceled drafts exist → create new draft with NEW number
- Unique constraint: `UNIQUE(project_id, project_item_id, doc_type) WHERE approval_status NOT IN ('rejected', 'canceled')`

### 5.3 Uniqueness Guarantees

| Level | Guarantee | Mechanism |
|-------|-----------|-----------|
| Sequence per project per type | No duplicates | `doc_sequences` atomic counter |
| Draft per item per type | One active draft | Partial unique index on `execution_drafts` |
| Doc number globally | Unique across system | Project code prefix ensures global uniqueness |
| Cross-project | No collisions | Project code is globally unique (FY-scoped sequence) |

---

## 6. Worked Examples

### 6.1 Scenario: Offer OFR-2627-005 converted to Project

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

### 6.2 Drafts Generated

**Item 1: Thermic Fluid Heater 10L (Make)**

| Draft | Applicable | Doc Number | Approval Status | Dependency Status |
|-------|-----------|-----------|-----------------|-------------------|
| DO | `true` | `2627-003-DO-0001` | `pending_approval` | `not_required` |
| WO | `true` | `2627-003-WO-0001` | `draft` | `blocked` (needs DO) |
| PO | `false` | — | — | — |
| IO | `true` | `IO-2627-003-M-0001` | `draft` | `not_required` |

**Item 2: Control Panel CP-200 (Make)**

| Draft | Applicable | Doc Number | Approval Status | Dependency Status |
|-------|-----------|-----------|-----------------|-------------------|
| DO | `true` | `2627-003-DO-0002` | `pending_approval` | `not_required` |
| WO | `true` | `2627-003-WO-0002` | `draft` | `blocked` (needs DO) |
| PO | `false` | — | — | — |
| IO | `true` | `IO-2627-003-M-0002` | `draft` | `not_required` |

**Item 3: Expansion Tank ET-50 (Buy)**

| Draft | Applicable | Doc Number | Approval Status | Dependency Status |
|-------|-----------|-----------|-----------------|-------------------|
| DO | `false` | — | — | — |
| WO | `false` | — | — | — |
| PO | `true` | `2627-003-PO-0001` | `pending_approval` | `not_required` |
| IO | `true` | `IO-2627-003-B-0001` | `draft` | `not_required` |

**Item 4: Temperature Sensor TS-K (Buy)**

| Draft | Applicable | Doc Number | Approval Status | Dependency Status |
|-------|-----------|-----------|-----------------|-------------------|
| DO | `false` | — | — | — |
| WO | `false` | — | — | — |
| PO | `true` | `2627-003-PO-0002` | `pending_approval` | `not_required` |
| IO | `true` | `IO-2627-003-B-0002` | `draft` | `not_required` |

### 6.3 Sequence State After Generation

| doc_type | project_id | next_seq |
|----------|-----------|----------|
| DO | 42 | 3 (consumed 0001, 0002) |
| WO | 42 | 3 (consumed 0001, 0002) |
| PO | 42 | 3 (consumed 0001, 0002) |
| IO | 42 | 5 (consumed 0001–0004) |

### 6.4 Rejection & Re-draft Scenario

If `2627-003-DO-0001` is rejected:
- Draft approval_status → `rejected`, rejection_remarks recorded
- Original number `2627-003-DO-0001` is consumed (never reused)
- Authorized user triggers re-draft → new draft created with `2627-003-DO-0003`
- New approval task auto-created and assigned
- Source data carried forward from original draft (see Section 15)
- Sequence counter continues from 3

---

## 7. Schema Changes

### 7.1 New Table: `execution_drafts`

```
execution_drafts
├── id                    serial PK
├── project_id            integer FK → projects(id) NOT NULL
├── project_item_id       integer FK → project_items(id) NOT NULL
├── doc_type              varchar(10) NOT NULL  -- 'DO', 'WO', 'PO', 'IO'
├── applicable            boolean NOT NULL DEFAULT true
│                         -- false = this doc type does not apply to this item
│                         -- (e.g., DO for Buy items). No number generated.
├── doc_number            varchar(30) NULL
│                         -- immutable after INSERT. NULL when applicable=false.
├── approval_status       varchar(30) NOT NULL DEFAULT 'draft'
│                         -- draft → pending_approval → approved | rejected | on_hold
│                         -- NULL-equivalent for applicable=false rows: 'not_applicable'
├── activation_status     varchar(30) NOT NULL DEFAULT 'not_activated'
│                         -- not_activated → pending_activation → activated | activation_failed
│                         -- Activation is a SEPARATE step AFTER approval.
├── generated_by          varchar(20) NOT NULL DEFAULT 'system'
├── approved_by           integer FK → users(id) NULL
├── rejected_by           integer FK → users(id) NULL
├── rejection_remarks     text NULL  -- required on rejection
├── hold_remarks          text NULL
├── linked_task_id        integer FK → tasks(id) NULL
├── dependency_doc_type   varchar(10) NULL
│                         -- e.g., 'DO' (what this draft depends on)
├── dependency_status     varchar(20) NOT NULL DEFAULT 'not_required'
│                         -- not_required | blocked | met
│                         -- not_required: no upstream dependency
│                         -- blocked: upstream draft not yet approved
│                         -- met: upstream draft approved, this draft can proceed
├── source_data           jsonb NOT NULL DEFAULT '{}'
│                         -- { drawing_no, revision, ecr_number, ecn_number,
│                         --   vendor_id, vendor_name, bom_header_id,
│                         --   make_or_buy, quantity, uom, specification,
│                         --   io_trigger_source, io_inspection_type }
├── activated_entity_id   integer NULL  -- ID of real WO/PO/IO/DO created on activation
├── activated_entity_type varchar(50) NULL  -- table name of the activated entity
├── activated_by          integer FK → users(id) NULL
├── activated_at          timestamp NULL
├── parent_draft_id       integer FK → execution_drafts(id) NULL
│                         -- points to the rejected draft this re-draft replaces
├── error_message         text NULL
├── created_at            timestamp NOT NULL DEFAULT NOW()
├── updated_at            timestamp NOT NULL DEFAULT NOW()
│
├── UNIQUE(project_id, project_item_id, doc_type)
│     WHERE approval_status NOT IN ('rejected', 'canceled', 'not_applicable')
│     -- partial unique index: one active draft per item per type
│
└── INDEX(project_id, approval_status)
```

### 7.2 New Table: `epc_drawing_orders`

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

### 7.3 Registry Updates

**`DOC_TYPE_ABBR` in `server/epc-coding.ts` — add DO:**

```typescript
'DO': { table: 'epc_drawing_orders', column: 'do_number', label: 'Drawing Order' },
```

**`CHILD_DOC_RE` in `server/epc-guardrails.ts` — already covers DO:**

The existing regex `^\d{4}-\d{3}-[A-Z]{2,4}-\d{4}$` already matches `2627-001-DO-0001` (DO is 2 letters, within the 2–4 range).

### 7.4 Baseline Update Required

Add to `docs/epc-project-numbering-gcs-baseline.md` Section 4.2:

| Doc Type | Full Name | Authoritative Table | Number Column | Scope | Format |
|----------|-----------|---------------------|---------------|-------|--------|
| DO | Drawing Order | `epc_drawing_orders` | `do_number` | Per project | `{PC}-DO-{NNNN}` |

---

## 8. Draft Generation Flow

### 8.1 Service: `generateExecutionDrafts(projectId, userId)`

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

     b. DETERMINE APPLICABILITY (not "skipped")
        For each doc_type in [DO, WO, PO, IO]:
          - DO:  applicable = (make_or_buy == 'Make')
          - WO:  applicable = (make_or_buy == 'Make')
          - PO:  applicable = (make_or_buy == 'Buy') OR (Make item has purchased subs)
          - IO:  applicable = true (all items get IO)

     c. FOR EACH doc_type:
        IF applicable = false:
          - INSERT execution_draft row with:
            applicable = false, doc_number = NULL,
            approval_status = 'not_applicable',
            activation_status = 'not_activated',
            dependency_status = 'not_required'
          - No number generated. No task created.

        IF applicable = true:
          i.   GENERATE NUMBER
               - DO/WO/PO: call getNextDocSeq(docType, projectId, tx)
                 → compose: `${projectCode}-${docType}-${seq}`
                 → assertChildDocNumber(number, context)
               - IO: call getNextDocSeq('IO', projectId, tx)
                 → compose: `IO-${fyCode}-${projectSeq}-${category}-${seq}`

          ii.  SNAPSHOT SOURCE DATA
               - { drawing_no, revision, ecr, ecn, vendor_id, vendor_name,
                   bom_header_id, make_or_buy, quantity, uom, specification,
                   master_item_code, master_item_description,
                   io_trigger_source, io_inspection_type }

          iii. SET DEPENDENCY
               - WO draft: dependency_doc_type='DO', dependency_status='blocked'
               - PO draft for Make subs: dependency_doc_type='DO', dependency_status='blocked'
               - PO draft for Buy items: dependency_status='not_required'
               - DO draft: dependency_status='not_required'
               - IO draft: dependency_status='not_required'

          iv.  SET INITIAL APPROVAL STATUS
               - If dependency_status = 'not_required': approval_status = 'pending_approval'
               - If dependency_status = 'blocked': approval_status = 'draft'

          v.   INSERT execution_draft row

          vi.  CREATE APPROVAL TASK (only if approval_status = 'pending_approval')
               - via createEpcTask() with automationKey
               - title: "Approve {docType} {docNumber} for {itemCode}"
               - assigned to: role-based (see Section 11)
               - link task_id back to execution_draft

5. COMMIT TRANSACTION

6. RETURN summary:
   { projectId, created: N, not_applicable: N, blocked: N, failed: N,
     drafts: [{ doc_type, doc_number, project_item_id, approval_status, applicable }] }

7. ON ERROR:
   - ROLLBACK transaction (no partial drafts)
   - Log error with full context
   - Create alert task for Project Manager
   - Return error summary (safe for retry — idempotent)
```

### 8.2 Transaction Safety

- All drafts for a project are created in ONE transaction
- If any draft fails (sequence error, validation error, DB error) → entire batch rolls back
- No partial state — either all drafts exist or none do
- Retry is safe because idempotency check runs first

---

## 9. Dependency Rules

### 9.1 Dependency Matrix

| Item Type | DO | WO | PO | IO |
|-----------|----|----|----|----|
| **Make (custom)** | `not_required` | `blocked` until DO approved | `blocked` until DO approved (if Make item has purchased subs) | `not_required` |
| **Buy (standard)** | `not_applicable` | `not_applicable` | `not_required` | `not_required` |

### 9.2 `dependency_status` Values

| Value | Meaning |
|-------|---------|
| `not_required` | This draft has no upstream dependency. Can proceed to approval immediately. |
| `blocked` | Upstream draft (identified by `dependency_doc_type`) not yet approved. Cannot be approved. |
| `met` | Upstream draft has been approved. This draft can now proceed to approval. |

### 9.3 Dependency Enforcement

When a user attempts to **Approve** a draft:

```
1. Check: does this draft have dependency_status = 'blocked'?
2. If YES:
   a. Query: is there an approved execution_draft for the SAME project_item_id
      with doc_type = dependency_doc_type?
   b. If NO → BLOCK approval with message:
      "Cannot approve {docType} {docNumber}: Drawing Order {doNumber} must be
       approved first for item {itemCode}."
   c. If YES → Should not happen (cascade should have updated to 'met')
3. If dependency_status = 'not_required' or 'met' → Allow approval
```

### 9.4 Cascade on DO Approval

When a DO draft is approved:
- System checks all WO and PO drafts for the same `project_item_id`
- Updates their `dependency_status` from `blocked` → `met`
- Updates their `approval_status` from `draft` → `pending_approval`
- Creates approval tasks for the newly unblocked drafts
- Sends notification to assignees: "Drawing Order approved — WO/PO now ready for approval"

---

## 10. Approval Authority & Separation of Duties

### 10.1 Who Can Approve

| Action | Authorized Roles | Additional Rule |
|--------|-----------------|-----------------|
| **Approve** | Senior Manager, General Manager, Superuser | Must NOT be the same user who triggered the offer-to-project conversion (separation of duties) |
| **Reject** | Manager, Senior Manager, General Manager, Superuser | Rejection remarks mandatory |
| **Hold** | Manager, Senior Manager, General Manager, Superuser | Optional remarks |
| **Resume from Hold** | Manager, Senior Manager, General Manager, Superuser | — |

### 10.2 Separation of Duties

| Rule | Enforcement |
|------|------------|
| Creator ≠ Approver | The user whose `userId` is stored in `generated_by` (the converting user) CANNOT approve the draft. API returns 403: `"Separation of duties: the user who generated this draft cannot approve it."` |
| Assignee can approve | The task assignee (phase lead) can approve if they meet the role requirement AND are not the creator. |
| Manager override | A Senior Manager or above can approve any draft they did not create, even if they are not the task assignee. |
| Self-rejection allowed | The creator CAN reject their own drafts (rejection is not a privilege escalation). |

### 10.3 Enforcement Implementation

```
On POST /api/execution-drafts/:id/approve:
  1. Load draft + linked conversion userId
  2. Check: request.user.id !== draft.generated_by_user_id
     → If same user → 403 "Separation of duties violation"
  3. Check: request.user.role in ['Senior Manager', 'General Manager', 'Superuser']
     → If not → 403 "Insufficient role for approval"
  4. Check: dependency_status is 'not_required' or 'met'
     → If 'blocked' → 400 "Dependency not met"
  5. Proceed with approval
```

---

## 11. Approval Task Assignment

### 11.1 Who Creates Each Task

All approval tasks are created by the **system** during `generateExecutionDrafts()`, using `createEpcTask()` with `createdBy` set to the user who triggered the offer-to-project conversion. Tasks are never created manually — they are a byproduct of draft generation.

| Draft Type | Task Created By | Trigger |
|------------|----------------|---------|
| DO | System (on behalf of converting user) | Draft generation at conversion |
| WO | System (on behalf of converting user) | Draft generation at conversion (task deferred until DO approved) |
| PO | System (on behalf of converting user) | Draft generation at conversion (task deferred if Make-sub dependency) |
| IO | System (on behalf of converting user) | Draft generation at conversion |

### 11.2 Task Assignment Matrix

Each draft type is assigned to a specific role using the existing `resolveAssignee(projectId, phaseName, fallback)` function, which checks the project's phase-lead assignments first, then falls back.

| Draft Type | Phase Name | Primary Assignee | Department |
|------------|-----------|------------------|------------|
| DO | `'Engineering'` | Engineering Phase Lead (Design department Senior Manager/Manager) | Design |
| WO | `'Production'` | Production Phase Lead (Production department Senior Manager/Manager) | Production |
| PO | `'Procurement'` | Procurement Phase Lead (Purchase department Senior Manager/Manager) | Purchase |
| IO | `'Quality'` | Quality Phase Lead (Quality Control department Senior Manager/Manager) | Quality Control |

### 11.3 Fallback Chain

If the primary assignee is not found, the system follows this fallback chain (built into `resolveAssignee`):

```
1. Phase Lead → Check project_phases table for phase_lead_id matching the phase name
   ↓ (not found)
2. Project Manager → Check projects.manager_id
   ↓ (not found)
3. Converting User → The user who triggered the offer-to-project conversion (fallbackCreatedBy)
```

| Fallback Level | Who | When Used |
|---------------|-----|-----------|
| Level 1 (preferred) | Phase Lead for the relevant phase | Phase lead assigned on project |
| Level 2 | Project Manager | No phase lead found |
| Level 3 (guaranteed) | Converting User | No project manager found (should never happen in practice) |

**No task is ever left unassigned.** The fallback chain always terminates at the converting user.

### 11.4 Task Properties

Each approval task is created with:

| Property | Value |
|----------|-------|
| `status` | `'pending'` |
| `source_type` | `'epc_automation'` |
| `source_agent` | `'epc_lifecycle'` |
| `category` | `'EPC'` |
| `priority` | Varies by doc type (see Section 12) |
| `title` | `"Approve {DocType} {DocNumber} for {ItemCode}"` |
| `description` | Includes item details, dependency status, and `automationKey` for idempotency |
| `automationKey` | `[automation_key:epc:execution_draft:{draftId}:approve]` |

### 11.5 Idempotency

The `automationKey` embedded in the task description prevents duplicate tasks. If `generateExecutionDrafts()` is retried (e.g., after a partial failure), `createEpcTask()` detects the existing task by key and returns its ID instead of creating a new one.

---

## 12. Task Due Date & SLA Rules

### 12.1 Due Date Calculation

Task due dates are calculated using the existing `computeBusinessDayDue(days)` function, which skips weekends (Saturday and Sunday). The number of business days varies by document type priority.

| Draft Type | Default SLA (business days) | Priority | Rationale |
|------------|---------------------------|----------|-----------|
| DO | **5 days** | High | Drawing is the critical path for Make items — blocks WO and PO |
| WO | **3 days** | High | Production planning needs quick turnaround after DO approval |
| PO | **3 days** | High | Procurement lead time is often the longest — early approval needed |
| IO | **5 days** | Medium | Inspection planning runs in parallel — not blocking other docs |

### 12.2 Due Date Derivation

```
start_date  = today (date of conversion / draft generation)
due_date    = computeBusinessDayDue(sla_days)   -- skips Sat/Sun
finish_date = due_date                          -- same as due_date at creation
```

**Example:** If conversion happens on Monday April 13, 2026:
- DO task due date: Friday April 18, 2026 (5 business days)
- WO task due date: Wednesday April 16, 2026 (3 business days)
- PO task due date: Wednesday April 16, 2026 (3 business days)
- IO task due date: Friday April 18, 2026 (5 business days)

### 12.3 Blocked Task Due Dates

For WO and PO drafts that are blocked by a DO dependency:
- The approval task is NOT created until the DO is approved (deferred task creation)
- When the DO is approved and the WO/PO status moves to `pending_approval`, the task is created with the SLA calculated from that date
- This ensures the approver gets a full SLA window from when they can actually act

```
on DO approval:
  for each dependent WO/PO draft:
    update dependency_status = 'met'
    update approval_status = 'pending_approval'
    create approval task with:
      start_date = today
      due_date = computeBusinessDayDue(sla_days)
```

### 12.4 SLA Overrides

| Override | How | When |
|----------|-----|------|
| Project-level urgency | Future: `projects.priority` field can multiply SLA (e.g., urgent = 0.5x) | Not in Phase 1 |
| Per-task manual override | Assignee can edit the task due date after creation | Always available |
| Admin override | Manager can edit any task's due date | Always available |

---

## 13. Approval vs Activation (Two-Phase)

### 13.1 Design Principle

**Approval and activation are SEPARATE steps.** Approving a draft does NOT directly create the real entity (WO/PO/IO/DO). Instead:

```
Phase 1: APPROVAL
  - approval_status: draft → pending_approval → approved
  - Validates authority, separation of duties, dependency
  - Records who approved and when
  - Does NOT create any entity in WO/PO/IO/DO tables

Phase 2: ACTIVATION
  - activation_status: not_activated → pending_activation → activated
  - Triggered AFTER approval (can be immediate or deferred)
  - Creates the real entity in the authoritative table
  - Records activated_entity_id, activated_entity_type, activated_by, activated_at
  - Can fail independently (e.g., missing BOM, vendor not set)
```

### 13.2 Why Two Phases

| Reason | Detail |
|--------|--------|
| Audit separation | Approval = "this should happen." Activation = "this has been created." Clear accountability. |
| Failure isolation | If entity creation fails (DB error, validation error), the approval is preserved. Admin retries activation without re-approving. |
| Future flexibility | Activation can be batched, scheduled, or require additional data entry before entity creation. |
| Rollback safety | An approved-but-not-activated draft can be un-approved without needing to delete a real entity. |

### 13.3 `approval_status` Values

| Value | Meaning |
|-------|---------|
| `not_applicable` | Doc type does not apply to this item (`applicable = false`) |
| `draft` | System-generated, waiting for dependency or initial review |
| `pending_approval` | Ready for approval (dependency met or not required) |
| `approved` | Approved by authorized user |
| `rejected` | Rejected with mandatory remarks |
| `on_hold` | Paused by authorized user |
| `canceled` | Project canceled or item removed |

### 13.4 `activation_status` Values

| Value | Meaning |
|-------|---------|
| `not_activated` | Default state. Entity not yet created. |
| `pending_activation` | Approval granted, activation in progress. |
| `activated` | Real entity created successfully. `activated_entity_id` is set. |
| `activation_failed` | Entity creation failed. `error_message` explains why. Retryable. |

### 13.5 Status Flow Diagram

```
applicable = false:
  approval_status = 'not_applicable'
  activation_status = 'not_activated'
  (terminal — no further transitions)

applicable = true:
  approval_status:
    draft
      ├──→ pending_approval  (dependency met or not required)
      │     ├──→ approved     (authorized user approves)
      │     ├──→ rejected     (remarks required, number consumed)
      │     └──→ on_hold      (paused)
      │           └──→ pending_approval  (resumed)
      └──→ canceled          (project canceled or item removed)

  activation_status (only when approval_status = 'approved'):
    not_activated
      └──→ pending_activation
            ├──→ activated          (entity created in target table)
            └──→ activation_failed  (error recorded, retryable)
```

### 13.6 Activation on Each Type

| Draft Type | Creates Entity In | Key Fields Copied | Activation Trigger |
|------------|------------------|-------------------|--------------------|
| DO | `epc_drawing_orders` | do_number, project_id, item data, assigned_to | Immediate after approval |
| WO | `epc_work_orders` | wo_number, project_id, item data, BOM link | Immediate after approval |
| PO | `epc_purchase_orders` | po_number, project_id, item data, vendor | Immediate after approval |
| IO | `inspection_orders` | inspection_order_number, project_id, type, item data | Deferred — see Section 14 |

The `execution_drafts.activated_entity_id` and `activated_entity_type` are set to point to the created record.

---

## 14. IO Trigger Rules & Deduplication

### 14.1 Problem: Existing IO Generators

The system already has three IO creation mechanisms:

| Trigger | Source File | IO Type | When |
|---------|-----------|---------|------|
| Bulk generator | `fixed-inspection-order-generator.ts` | Mixed (M/B/C) | Manual trigger from Inspections page |
| PO issuance | `epc-inspection-trigger.ts` → `triggerInspectionOnPoIssuance` | Incoming | When PO status → `issued` |
| WO release | `epc-inspection-trigger.ts` → `triggerInspectionOnWoRelease` | In-process | When WO status → `released` |

**Risk:** If execution drafts also create IOs on activation, there will be **duplicate IOs** — one from the draft and one from the existing trigger.

### 14.2 Solution: Draft IO = Planning Placeholder, Activation Deferred to Trigger

Draft IO rows serve as **planning placeholders** — they reserve the number and show the planned inspection in the Execution Drafts view. But IO activation (actual `inspection_orders` row creation) is **linked to the existing trigger system**, NOT to draft approval alone.

| Item Type | IO Draft Behavior | Actual IO Creation |
|-----------|------------------|--------------------|
| **Make** | IO draft `applicable = true`, `io_trigger_source = 'wo_release'`, `io_inspection_type = 'in-process'` | IO is created by `triggerInspectionOnWoRelease` when the WO (activated from WO draft) is released. Draft IO activation_status updated to `activated` with entity link. |
| **Buy** | IO draft `applicable = true`, `io_trigger_source = 'po_issuance'`, `io_inspection_type = 'incoming'` | IO is created by `triggerInspectionOnPoIssuance` when the PO (activated from PO draft) is issued. Draft IO activation_status updated to `activated` with entity link. |

### 14.3 Deduplication Mechanism

The existing IO triggers already have deduplication built in:

```sql
SELECT id, inspection_order_number FROM inspection_orders
WHERE project_id = $1 AND item_id = $2
  AND status NOT IN ('canceled')
  AND ($3::text IS NULL OR inspection_type = $3)
LIMIT 1
```

This prevents double-creation. The draft system adds an additional layer:

1. **At draft creation:** IO draft is marked with `io_trigger_source` and `io_inspection_type` in `source_data`
2. **At IO draft approval:** `approval_status → approved`, but `activation_status` remains `not_activated`
3. **At WO release / PO issuance:** Existing trigger fires. If it creates an IO:
   - System matches the new IO to the draft IO (by `project_id + project_item_id + doc_type`)
   - Updates draft: `activation_status → activated`, `activated_entity_id → new IO id`
4. **If trigger finds existing IO (dedup):** No new IO created, draft remains `not_activated` with note

### 14.4 IO Draft Approval Flow

```
IO draft approval does NOT create an inspection_orders row.
Instead, it signals: "This item's inspection plan is approved."

The actual IO row is created later by:
  - Make items: WO release trigger (in-process inspection)
  - Buy items:  PO issuance trigger (incoming inspection)

When the trigger creates the IO:
  - The draft's doc_number is passed to the trigger as the preferred IO number
  - If the trigger's own numbering conflicts, the trigger's number wins
    (draft records the actual number used)
```

### 14.5 Backward Compatibility

| Scenario | Behavior |
|----------|----------|
| Old project, manual WO release | Existing trigger fires normally. No draft exists. No conflict. |
| New project, draft WO released | Trigger fires, finds draft IO, links them. Single IO created. |
| New project, bulk IO generator used | Bulk generator creates IOs. Draft IOs remain `not_activated` (orphaned but harmless — visible in UI as "Created via bulk generator"). |

---

## 15. Re-Draft Rules

### 15.1 When Re-Draft Happens

A re-draft creates a new execution draft for a project item after the previous draft was **rejected**. It is the only way to get a new draft for an item that already had one.

### 15.2 Who Can Trigger Re-Draft

| Role | Can Trigger Re-Draft? |
|------|----------------------|
| Manager | Yes |
| Senior Manager | Yes |
| General Manager | Yes |
| Superuser | Yes |
| Employee | No |

The re-draft can be triggered by the original converting user, the task assignee, or any Manager+ role. There is no separation-of-duties restriction on re-drafting (it is not an approval action).

### 15.3 Re-Draft Process

```
POST /api/execution-drafts/:id/re-draft

1. VALIDATE:
   a. Original draft must have approval_status = 'rejected'
   b. No other active draft exists for same (project_id, project_item_id, doc_type)
   c. Requesting user has Manager+ role

2. GENERATE NEW NUMBER:
   a. Call getNextDocSeq(docType, projectId) — gets NEXT sequence number
   b. New number is different from the rejected draft's number

3. CREATE NEW DRAFT:
   a. Copy source_data from original draft (carry forward)
   b. Set parent_draft_id = original draft's ID
   c. Set approval_status = 'pending_approval' (or 'draft' if dependency blocked)
   d. Set activation_status = 'not_activated'
   e. Set dependency_status based on current state of upstream drafts

4. CREATE NEW APPROVAL TASK:
   a. Auto-created via createEpcTask() — same assignment logic as original
   b. New automationKey (uses new draft ID)
   c. Task description references the rejected draft for context

5. RETURN:
   { old_draft_id, new_draft_id, new_doc_number, new_task_id }
```

### 15.4 Data Carry-Forward

When a re-draft is created, the following data is carried forward from the rejected draft:

| Field | Carried Forward? | Notes |
|-------|-----------------|-------|
| `source_data` (full JSON) | Yes | All item data, vendor, BOM, drawing info |
| `doc_type` | Yes | Same type |
| `project_id` | Yes | Same project |
| `project_item_id` | Yes | Same item |
| `dependency_doc_type` | Yes | Same dependency rule |
| `doc_number` | **No** | New number generated |
| `approval_status` | **No** | Reset to `draft` or `pending_approval` |
| `activation_status` | **No** | Reset to `not_activated` |
| `approved_by` / `rejected_by` | **No** | Cleared |
| `linked_task_id` | **No** | New task created |

### 15.5 Audit Trail

- The new draft's `parent_draft_id` points to the rejected draft
- The rejected draft is preserved with all its history (who rejected, remarks, timestamps)
- Workflow event `execution_draft.re_drafted` logged with both old and new draft IDs
- Full lineage queryable: original → rejected → re-draft → (approved or rejected again → ...)

---

## 16. Data Mapping

### 16.1 Source Data Snapshot

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
| io_trigger_source | Derived from make_or_buy | `source_data.io_trigger_source` (`'wo_release'` or `'po_issuance'`) |
| io_inspection_type | Derived from make_or_buy | `source_data.io_inspection_type` (`'in-process'` or `'incoming'`) |

### 16.2 Separate Fields — Not in Barcode

Drawing number, revision, ECR, and ECN are stored as **separate named fields** in `source_data` JSON — never embedded in barcodes or composite strings. This ensures:
- Each field is independently queryable
- Revision tracking is explicit
- ECR/ECN linkage is traceable
- No data loss from format changes

---

## 17. Failure Handling

| Failure | Behavior | Recovery |
|---------|----------|----------|
| DB error during draft creation | Full transaction rollback. No partial drafts. | Safe retry — idempotency check prevents duplicates. |
| Sequence engine failure | Transaction rollback. Sequence not consumed. | Retry generates the correct next number. |
| Guardrail assertion failure | Transaction rollback. Violation logged. | Fix the root cause (invalid project code, etc.), then retry. |
| Task creation failure | Draft row exists but no task. | Background job detects orphan drafts and creates missing tasks. |
| Activation failure (after approval) | `activation_status → activation_failed`, `error_message` set. `approval_status` remains `approved`. | Admin retries activation via `POST /api/execution-drafts/:id/activate`. No re-approval needed. |

### Retry Safety

```
generateExecutionDrafts(projectId) is safe to call multiple times:
  - First call: creates all drafts
  - Second call: skips all items (active drafts exist)
  - After rejection: creates new drafts only for rejected items (via re-draft)
  - After partial failure + rollback: creates all drafts (none exist)
```

---

## 18. API Endpoints

| Method | Path | Purpose | Auth |
|--------|------|---------|------|
| POST | `/api/projects/:id/generate-drafts` | Trigger draft generation (also called automatically at conversion) | Manager+ |
| GET | `/api/projects/:id/execution-drafts` | List all drafts for a project, grouped by item | Authenticated |
| GET | `/api/execution-drafts/:id` | Get single draft detail with audit trail | Authenticated |
| POST | `/api/execution-drafts/:id/approve` | Approve a draft (separation of duties enforced) | Senior Manager+ |
| POST | `/api/execution-drafts/:id/activate` | Activate an approved draft → create real entity | Senior Manager+ |
| POST | `/api/execution-drafts/:id/reject` | Reject a draft (remarks required) | Manager+ |
| POST | `/api/execution-drafts/:id/hold` | Put draft on hold | Manager+ |
| POST | `/api/execution-drafts/:id/resume` | Resume from hold → pending_approval | Manager+ |
| POST | `/api/execution-drafts/:id/re-draft` | Create new draft for a rejected item (carry-forward) | Manager+ |

---

## 19. UI Design

### 19.1 Execution Drafts Tab

New tab on the Project detail page: **"Execution Drafts"**

Layout: Card grid grouped by project item. Each item card shows:

```
┌──────────────────────────────────────────────────────────┐
│ Item: Thermic Fluid Heater 10L  [Make]                   │
├──────────┬──────────┬──────────┬────────────┤
│ DO       │ WO       │ PO       │ IO         │
│ DO-0001  │ WO-0001  │ N/A      │ IO-M-0001  │
│ ●Approved│ ⊘Blocked │          │ ●Pending   │
│ ○Not Act.│ Needs DO │          │ ○Awaiting  │
│          │          │          │  WO release│
│ [Activate]│         │          │            │
└──────────┴──────────┴──────────┴────────────┘
```

### 19.2 Status Badges

| Status | Color | Badge |
|--------|-------|-------|
| `not_applicable` | Light grey | "N/A" |
| `draft` (approval) | Grey | "Draft" |
| `pending_approval` | Yellow | "Pending Approval" |
| `approved` | Green | "Approved" |
| `rejected` | Red | "Rejected" |
| `on_hold` | Orange | "On Hold" |
| `canceled` | Dark grey | "Canceled" |
| `blocked` (dependency) | Blue outline | "Waiting for DO" |
| `not_activated` | White dot | "Not Activated" |
| `activated` | Green dot | "Activated" |
| `activation_failed` | Red dot | "Activation Failed" |

### 19.3 Summary Bar

At the top of the tab:
```
Execution Drafts: 16 total | 4 N/A | 3 Pending | 2 Blocked | 1 Approved | 0 Rejected | 6 Draft
Activation: 1 Activated | 0 Failed | 11 Pending
```

---

## 20. Audit & Control

### 20.1 Fields Tracked on `execution_drafts`

| Field | When Set |
|-------|----------|
| `generated_by` | At creation (`'system'` for auto-generated) |
| `approved_by` | On approval (user ID — must differ from generated_by) |
| `rejected_by` | On rejection (user ID) |
| `rejection_remarks` | On rejection (mandatory) |
| `hold_remarks` | On hold (optional) |
| `activated_by` | On activation (user ID) |
| `activated_at` | On activation (timestamp) |
| `parent_draft_id` | On re-draft (links to rejected predecessor) |
| `created_at` | At creation |
| `updated_at` | On every status change |

### 20.2 Workflow Events

Every status change writes to `project_workflow_events`:

| Event Type | Data |
|------------|------|
| `execution_draft.created` | `{ doc_type, doc_number, project_item_id, generated_by, applicable }` |
| `execution_draft.approved` | `{ doc_type, doc_number, approved_by }` |
| `execution_draft.activated` | `{ doc_type, doc_number, activated_by, activated_entity_id, activated_entity_type }` |
| `execution_draft.activation_failed` | `{ doc_type, doc_number, error_message }` |
| `execution_draft.rejected` | `{ doc_type, doc_number, rejected_by, rejection_remarks }` |
| `execution_draft.held` | `{ doc_type, doc_number, held_by, hold_remarks }` |
| `execution_draft.resumed` | `{ doc_type, doc_number, resumed_by }` |
| `execution_draft.dependency_met` | `{ doc_type, doc_number, dependency_doc_type, dependency_doc_number }` |
| `execution_draft.re_drafted` | `{ old_draft_id, new_draft_id, old_doc_number, new_doc_number, triggered_by }` |

### 20.3 Full Audit Query

```sql
SELECT * FROM project_workflow_events
WHERE project_id = $1
  AND event_type LIKE 'execution_draft.%'
ORDER BY created_at;
```

---

## 21. Impact on Existing Services

### 21.1 Files Modified

| File | Change |
|------|--------|
| `server/epc-coding.ts` | Add `'DO'` to `DOC_TYPE_ABBR` registry |
| `server/epc-guardrails.ts` | No change needed — DO already matches `CHILD_DOC_RE` |
| `server/offer-conversion.ts` | Add call to `generateExecutionDrafts()` after project creation |
| `shared/schema.ts` | Add `execution_drafts` and `epc_drawing_orders` tables |
| `server/utils/epc-inspection-trigger.ts` | Add draft-linking: after IO creation, find matching draft IO and update `activation_status` |
| `docs/epc-project-numbering-gcs-baseline.md` | Add DO to Section 4.2 document type registry |

### 21.2 Files Created

| File | Purpose |
|------|---------|
| `server/pipeline/generate-execution-drafts.ts` | Core draft generation service |
| `server/pipeline/draft-approval.ts` | Approve/reject/hold logic (Phase 1) |
| `server/pipeline/draft-activation.ts` | Entity creation logic (Phase 2) |
| `server/pipeline/draft-redraft.ts` | Re-draft logic with carry-forward |
| `server/pipeline/pipeline-routes.ts` | API endpoints |
| `server/pipeline/pipeline-types.ts` | TypeScript types |
| `client/src/components/execution-drafts.tsx` | Frontend tab component |

### 21.3 No Impact On

| System | Why |
|--------|-----|
| Existing WO/PO creation routes | These remain available for manual creation. Drafts are an additional pathway. |
| Existing IO generators (bulk) | Bulk IO generator remains unchanged. If it creates an IO for an item that has a draft, the draft is linked to the IO after the fact. |
| Existing IO triggers (WO release / PO issuance) | These remain the primary IO creation mechanism. Draft IO approval does not create IOs — the triggers do. Draft is linked after trigger fires. |
| Existing BOM/DWG flows | BOM and Drawing Control are upstream inputs, not affected by draft generation. |
| EPC numbering guardrails | DO already matches the regex. No guardrail changes needed. |
| GCS paths | No GCS paths involved in draft generation. Paths are created when documents are activated and files are attached. |
| Existing projects (IDs 1–18, 20+) | Completely untouched. No retroactive draft generation. No schema changes to existing tables. |

---

## 22. Future Pipeline Integration

The `execution_drafts` system is designed to plug directly into the approved Pipeline Orchestrator:

| Pipeline Stage | Execution Drafts Role |
|---------------|----------------------|
| S2 (Offer → Project) | `generateExecutionDrafts()` runs automatically |
| S5 (Planning Release) | Can auto-approve DO drafts in Express/Full Auto mode |
| S10 (WO/PO Created) | Draft approval + activation replaces manual creation |
| S12 (IO Generated) | IO trigger fires on WO release / PO issuance; draft linked |

The `automation_mode` on projects (Manual/Assisted/Express/Full Auto) will control whether draft approval tasks wait for humans or auto-advance.

---

**END OF IMPLEMENTATION BASELINE**

**Document Title:** EPC Execution Plan — Unified Automation Design  
**Version:** v3-final  
**Status:** Implementation Baseline  
**Rule:** Each module must be confirmed against this document during development. Any deviation requires explicit approval and document revision before proceeding.
