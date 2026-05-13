# Procurement List Control (PLC) — Baseline Architecture v1.0 FINAL

**Document Status:** APPROVED FOR CONTROLLED IMPLEMENTATION — Phase 1 authorised 13 May 2026  
**Prepared by:** THERMOPAC QMS Engineering  
**Date:** 13 May 2026  
**Supersedes:** Plan v1.0 (rejected — parallel path), Plan v2.0 (rejected — incomplete quantity / SAP / BUY List revision governance), Baseline v1.0 (draft — incomplete rollback, security, transaction, UI governance)  
**Next document:** `procurement-list-control-implementation-tracker.md` (created on approval)

---

## Contents

1. Purpose and Scope
2. Final Lifecycle Diagram
3. Final Quantity Flow Diagram
4. Final Numbering Architecture
5. Source-of-Truth Ownership Matrix
6. Blocking the Direct BUY List → PO Path
7. Migration Strategy
8. DB / Schema Changes (complete)
9. API / Routes (complete)
10. UI / Pages / Components
11. Line Status Lifecycle (complete)
12. Duplicate Prevention Logic
13. Concurrency and Transaction-Locking Governance
14. Quantity Ownership and Flow — Point-by-Point
15. BUY List Revision Governance
16. Superseded PLC Line Rules
17. AVL Governance — Vendor Subgroup Qualification
18. PO Amendment / Revision Workflow
19. SAP Integration Governance
20. Document Attachment Governance
21. Notification / Event Governance
22. Dashboard / KPI Governance
23. Archival and Closure Governance
24. Large-Project Performance Governance
25. Technical Datasheet / Specification Freeze Governance
26. Future Traceability Design
27. Implementation Phase Breakdown
28. Rollback Strategy
29. Zero-Trust Verification Checklist
30. Transaction Governance
31. Failure Recovery
32. Security Governance
33. Dependency Matrix
34. Production Cutover Strategy
35. Phase-Wise UI Creation Plan
36. UI Delivery by Phase
37. Phase-Wise UI Inventory
38. Schema Ownership Governance
39. No Direct SQL Update Governance
40. Final Approval Gates
41. Implementation Tracker Governance

---

## 1. Purpose and Scope

The Procurement List Control (PLC) module is a **project-wide procurement staging and control layer** that sits between BUY List Control (Phase 4 — Raise PR) and Purchase Order generation.

From the moment a BUY List line raises a Planning Record (PLN), ALL downstream procurement activity for that line is owned exclusively by PLC. No parallel procurement path via the legacy `procurement_execution_records → po_preparation_records → epc_purchase_orders` chain is permitted after migration Phase 2.

PLC is the **single source of truth** for:
- What quantity is required, ordered, received, and outstanding per procurement line
- Which vendor is selected and whether they are AVL-qualified for the subgroup
- Which PO Group (POG) and EPC PO cover a given line
- All GRN, inspection, and NCR traceability against a procurement line
- All procurement cockpit KPIs and dashboards

---

## 2. Final Lifecycle Diagram

```
BUY List Control (PPPC Phases 1–4)
│
│  Phase 1: Groups → Lines → Tag generation
│  Phase 2: BUY List created, status draft → released
│  Phase 3: Line selection + Datasheet upload + Approval
│  Phase 4: Raise PR
│             └─ item_planning_records [PLN-xxx] created
│             └─ procurement_list_lines [PLC line] AUTO-CREATED in same transaction
│
└──────────── PROCUREMENT LIST CONTROL — sole owner from here ───────────────────────┐
                                                                                       │
PLC LINE STATUS FLOW:                                                                  │
                                                                                       │
  pr_raised          ← created at Raise PR                                            │
      │                                                                                │
      ├──► (if RFQ flagged)                                                            │
      │         pending_rfq → rfq_issued → rfq_closed                                 │
      │                                         │                                      │
      ├──────────────────────────────────────── │ (if TBE flagged)                    │
      │                                         └─► tbe_in_progress → tbe_complete    │
      │                                                                     │          │
      ├───────────────────────────────────────────────────────────────────  │          │
      │                                                          (if CBE)   │          │
      │                                                   cbe_in_progress   │          │
      │                                                         │           │          │
      └──────────────────────────────────────────────────────── │ ──────── ┘          │
                                                                │                      │
                                                         vendor_selected               │
                                                                │                      │
                                                    (line added to PO Group)           │
                                                                │                      │
                                                         in_po_group                   │
                                                                │                      │
                                                    (POG submitted for approval)       │
                                                                │                      │
                                                         po_submitted                  │
                                                                │                      │
                                                    (Manager approves POG)             │
                                                                │                      │
                                                         po_approved                   │
                                                                │                      │
                                                    (EPC PO issued to vendor)          │
                                                                │                      │
                                                         po_issued                     │
                                                                │                      │
                                                    (GRN recorded — partial)           │
                                                                │                      │
                                                  partially_received ←─────────────── │
                                                         │       │   (repeat PO if    │
                                                         │       │    qty_balance > 0) │
                                                         │       └──► in_po_group      │
                                                         │                             │
                                                    (all qty received)                 │
                                                         │                             │
                                                  fully_received                       │
                                                         │                             │
                                                    (inspection passed + stores ok)    │
                                                         │                             │
                                                       closed  (terminal)              │
                                                                                       │
  Terminal exits: cancelled | superseded                                               │
                                                                                       │
  PARALLEL DIRECT PATH IS PERMANENTLY PROHIBITED AFTER MIGRATION PHASE 2.            │
└──────────────────────────────────────────────────────────────────────────────────────┘

POG STATUS FLOW:

  draft → submitted → approved → po_issued → partially_received → fully_received
                                                │
                                         cancelled | rejected (lines released back)

EPC PO STATUS FLOW:

  draft → issued → under_amendment → amended → partially_received → fully_received → closed
                                │
                              cancelled (lines released; PLC line status reverts)
```

---

## 3. Final Quantity Flow Diagram

```
BUY List Line
  qty = original line quantity (immutable — source: project_buy_list_lines.quantity)
        │
        └──► procurement_list_lines  ← QUANTITY MASTER for this procurement scope
             │
             │  qty_required      = snapshot of BUY list line quantity at PR raise (IMMUTABLE after creation)
             │  qty_ordered       = SUM of epc_po_group_lines.line_qty
             │                      WHERE po_group.status NOT IN ('cancelled','rejected')
             │  qty_pending       = qty_ordered - qty_received          (in-transit, not yet GRN'd)
             │  qty_received      = SUM of plc_grn_records.accepted_qty (inspection-accepted and GRN-accepted qty)
             │  qty_balance       = qty_required - qty_ordered          (still needs ordering)
             │  qty_over          = MAX(0, qty_ordered - qty_required)  (over-procurement)
             │
             │  RULES:
             │  ── R1: qty_ordered + new_line_qty > qty_required
             │         → BLOCKED unless Manager explicitly approves over-procurement
             │         → approval recorded in over_procurement_reason + over_procurement_approved_by
             │
             │  ── R2: qty_balance > 0 → line remains eligible for new PO Groups (repeat/partial)
             │
             │  ── R3: qty_balance = 0 and qty_received < qty_ordered → status = po_issued (waiting GRN)
             │
             │  ── R4: qty_received = qty_ordered → status = fully_received
             │
             │  ── R5: PO amendment reducing line qty below qty_received → BLOCKED
             │
             │  ── R6: All qty fields are recomputed server-side on every GRN/PO mutation.
             │         They are NEVER directly user-editable.
             │
             ├──► epc_po_group_lines  (one row per PO that covers this PLC line)
             │    │
             │    │  line_qty          = this PO's ordered quantity for this line
             │    │                     (may be < qty_required for partial procurement)
             │    │  line_qty_received = SUM of plc_grn_records.accepted_qty
             │    │                     WHERE grn.po_group_line_id = this row
             │    │
             │    └──► epc_purchase_order_items  (commercial record — unit_rate, total_amount)
             │         │  qty_received = mirrors line_qty_received (denormalized for SAP sync)
             │         │
             │         └──► sap_purchase_orders (SAP-side reference — read-only in THERMOPAC)
             │
             └──► plc_grn_records  (one row per physical delivery event)
                  │
                  │  grn_qty          = physical quantity delivered on this challan
                  │  accepted_qty     = quantity accepted after inspection
                  │                    (grn_qty - rejected_qty; set after inspection)
                  │  rejected_qty     = quantity rejected (NCR raised separately)
                  │
                  │  NOTE: accepted_qty is the authoritative received quantity.
                  │        grn_qty is the raw delivery count. They differ when inspection rejects items.
                  │
                  └──► inspection_execution_records (inspection outcome per GRN)
                       │  accepted_qty recorded here → flows back to plc_grn_records.accepted_qty
                       │
                       └──► non_conformance_reports (if rejected_qty > 0)

SINGLE SOURCE OF TRUTH PER STAGE:

  Stage                   │ Source of Truth Table            │ Field
  ────────────────────────┼──────────────────────────────────┼──────────────────────
  Required quantity       │ procurement_list_lines           │ qty_required (immutable)
  Ordered quantity        │ procurement_list_lines           │ qty_ordered (computed)
  PO line quantity        │ epc_po_group_lines               │ line_qty
  GRN raw delivery qty    │ plc_grn_records                  │ grn_qty
  Inspection accepted qty │ inspection_execution_records     │ accepted_qty
  Stores accepted qty     │ plc_grn_records                  │ accepted_qty (set after inspection)
  Running received total  │ procurement_list_lines           │ qty_received (computed sum)
  Balance to procure      │ procurement_list_lines           │ qty_balance (computed)

  No field is counted in more than one place. qty_received on procurement_list_lines
  is the SUM of plc_grn_records.accepted_qty — it is never independently maintained.
```

---

## 4. Final Numbering Architecture

| Document | Number Format | Sequence Key (doc_sequences) | Scope | Immutability |
|---|---|---|---|---|
| Planning Record | `{projectCode}-PLN-{seq:04}` | `PLN` + projectId | Per project | Immutable after creation |
| PLC Display Code | `{projectCode}-PLC-{lineNo:04}` | Sequential integer, no doc_sequences entry | Per project | Immutable after creation |
| PO Group | `{projectCode}-POG-{seq:04}` | `POG` + projectId | Per project | Formal document — immutable after approval |
| EPC PO | `{projectCode}-PO-{seq:04}` | `PO` + projectId | Per project | Immutable after issue |
| PO Amendment | `{projectCode}-PO-{seq:04}-AMD-{n}` | Incremented field on epc_po_amendments | Per PO | Immutable after approval |
| GRN | `{projectCode}-GRN-{seq:04}` | `GRN` + projectId | Per project | Immutable after acceptance |
| Material Issue | `{projectCode}-MIR-{seq:04}` | `MIR` + projectId | Per project | Immutable after creation |
| RFQ (Phase 2) | `{projectCode}-RFQ-{seq:04}` | `RFQ` + projectId | Per project | Formal document |

**POG formal status clarification:**  
A PO Group is a **formal procurement authorisation document** — not temporary staging. It:
- Carries a governed sequence number from `doc_sequences`
- Has a full approval chain with named user and timestamp at each step
- Is immutable after Manager approval (any change requires a PO Amendment)
- Has a permanent audit trail in `procurement_list_audit_log`
- Is the internal authorisation record; the EPC PO is the vendor-facing contract it generates

**Sequence format:** All sequences zero-padded to 4 digits, resetting per financial year per project (consistent with the existing `doc_sequences` service which already keys by `doc_type + fy_code + project_id`).

---

## 5. Source-of-Truth Ownership Matrix

| Data Domain | Owner Table | Exclusive Authority |
|---|---|---|
| What needs to be procured | `project_buy_list_lines` | BUY List Control |
| PR intent and planning number | `item_planning_records` | Phase 4 Raise PR |
| Procurement scope + all qty tracking | `procurement_list_lines` | **PLC — sole owner** |
| Vendor subgroup qualification | `vendor_subgroup_qualification` | AVL Governance (Admin) |
| PO authorisation batch | `epc_po_groups` | **PLC — sole owner** |
| Vendor-facing PO document | `epc_purchase_orders` | **PLC — generated and owned** |
| PO line commercial detail | `epc_purchase_order_items` | **PLC — generated and owned** |
| PO amendments | `epc_po_amendments` | **PLC — sole owner** |
| Physical delivery events | `plc_grn_records` | GRN / Stores module (via PLC cockpit) |
| Inspection outcome | `inspection_execution_records` | Quality module (linked to PLC line) |
| Non-conformance | `non_conformance_reports` | Quality module (linked to PLC line) |
| Material issued to production | `plc_material_issues` | Stores module (Phase 3) |
| SAP PO cross-reference | `sap_purchase_orders` | SAP integration (read-only in THERMOPAC) |
| SAP GRN cross-reference | `sap_goods_receipt_po` | SAP integration (read-only in THERMOPAC) |
| Procurement audit trail | `procurement_list_audit_log` | System — append-only, no mutation |
| Document attachments | `plc_document_attachments` | PLC (each entity type has attachment records) |
| In-app notifications | `notifications` | System — written by PLC event handlers |

---

## 6. Blocking the Direct BUY List → PO Path

### Existing Old Chain (Deprecated)

```
item_planning_records
  → procurement_execution_records   (server/project-routes.ts)
  → po_preparation_records          (server/project-routes.ts)
  → epc_purchase_orders             (single-item, 1:1 with planning record)
```

### Block Mechanism

**Step 1 — Coupling at Raise PR:**  
The `POST /api/buy-list-lines/:id/raise-pr` and `POST /api/buy-lists/:id/bulk-raise-pr` routes are modified (inside the same transaction) to also create `procurement_list_lines` immediately. This is the hard coupling point. From this moment, the PLC line is the owner.

**Step 2 — Guard on old downstream routes:**  
All routes that advance a planning record via `procurement_execution_records` directly check:
```sql
SELECT 1 FROM procurement_list_lines
WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded')
```
If a PLC line exists → the old route returns HTTP 423 with body:
```json
{ "error": "deprecated_path", "message": "Use Procurement List Control to advance this procurement line." }
```

**Phase 1 (Migration):** Soft block — warning header returned, old route still executes (for in-flight records with no PLC line).  
**Phase 2 (Post-migration):** Hard block — HTTP 423, no execution.  
**Phase 3 (Deprecation):** Old direct routes removed from codebase. Tables retained read-only.

### Routes Affected by Block

- `POST /api/procurement-executions/:id/start-preparation`
- `PATCH /api/procurement-executions/:id`
- All `po_preparation_records` write routes
- Any route that creates `epc_purchase_orders` via `poPreparationId` directly

---

## 7. Migration Strategy

### Phase 0 — Pre-Migration Audit (no code)

Run a pre-migration SQL report:
```sql
SELECT
  COUNT(*) FILTER (WHERE per.id IS NULL AND ppr.id IS NULL AND epo.id IS NULL) AS planning_only,
  COUNT(*) FILTER (WHERE per.id IS NOT NULL AND ppr.id IS NULL) AS has_per,
  COUNT(*) FILTER (WHERE ppr.id IS NOT NULL AND epo.id IS NULL) AS has_ppr,
  COUNT(*) FILTER (WHERE epo.id IS NOT NULL) AS has_epo
FROM item_planning_records ipr
LEFT JOIN procurement_execution_records per ON per.planning_record_id = ipr.id
LEFT JOIN po_preparation_records ppr ON ppr.planning_record_id = ipr.id
LEFT JOIN epc_purchase_orders epo ON epo.planning_record_id = ipr.id
WHERE ipr.source = 'buy_list' AND ipr.status NOT IN ('cancelled','superseded');
```
Result reviewed and approved by THERMOPAC management before any migration proceeds.

### Phase 1 — Additive (Zero Disruption)

1. Deploy all new tables (§8) with no constraints that block existing data.
2. Run idempotent backfill (`POST /api/projects/:projectId/procurement-list/backfill`):
   - For every `item_planning_records` where `source = 'buy_list'`:
     - Create `procurement_list_lines` if not already present.
     - Set status based on furthest downstream record (see §11 status table).
     - Set `qty_required` from planning record quantity.
     - Snapshot buy list line data fields.
   - For existing `epc_purchase_orders`: create a `epc_po_groups` record with `is_legacy = true`, link via `po_group_id`. Create one `epc_po_group_lines` row per existing PO item.
   - Set `procurement_list_lines.active_po_group_id` and `active_po_number` from legacy EPC PO.
3. Old direct routes continue to function — soft deprecation warning header added.
4. PLC cockpit is available in read-only mode for existing data.

### Phase 2 — Soft Block

1. New procurement via old direct routes returns HTTP 423 if a PLC line exists for that planning record.
2. In-flight records created before Phase 1 (no PLC line → no block) continue through old path.
3. UI: "Start Preparation" and old PO creation buttons hidden when `plc_line_id` exists.
4. All new Raise PR actions automatically create PLC lines (code change in raise-pr route).

### Phase 3 — Hard Deprecation

1. Old direct routes (`start-preparation`, `po_preparation_records` writes) removed from codebase.
2. `procurement_execution_records` and `po_preparation_records` tables retained read-only.
3. Any remaining legacy records that never progressed get a PLC line in `cancelled` status.

### Migration Execution Order (schema)

1. `vendor_subgroup_qualification`
2. `procurement_list_lines`
3. `epc_po_groups`
4. `epc_po_group_lines`
5. `epc_po_amendments`
6. `plc_grn_records`
7. `plc_material_issues`
8. `plc_document_attachments`
9. `procurement_list_audit_log`
10. `ALTER TABLE epc_purchase_orders` (add `po_group_id`, `amendment_count`, DROP NOT NULL on `planning_record_id`)
11. `ALTER TABLE epc_purchase_order_items` (add `plc_line_id`, `po_group_line_id`, `planning_record_id`, `buy_list_line_id`, `qty_received`)
12. `ALTER TABLE inspection_execution_records` (add `plc_line_id`, `grn_record_id`)
13. `ALTER TABLE non_conformance_reports` (add `plc_line_id`, `epc_po_id`, `grn_record_id`)
14. Register `doc_sequences` keys: `POG`, `GRN`, `MIR`, `RFQ`
15. Register page permission: `procurement-list-control`
16. Run Phase 0 audit, review, then run backfill

---

## 8. DB / Schema Changes (Complete)

### 8a. New Table: `procurement_list_lines`

```
procurement_list_lines
  id                             serial PK
  plc_number                     varchar(35) UNIQUE NOT NULL  -- {projectCode}-PLC-{lineNo:04}
  project_id                     FK → projects NOT NULL
  planning_record_id             FK → item_planning_records UNIQUE NOT NULL
  buy_list_header_id             FK → project_buy_list_headers
  buy_list_line_id               FK → project_buy_list_lines

  -- Snapshot from BUY List (frozen at PR raise — immutable after creation)
  buy_group_id                   FK → buy_groups
  buy_group_code                 varchar(30)
  buy_subgroup_id                FK → buy_subgroups
  buy_subgroup_code              varchar(30)
  tag_no                         varchar(80)
  installed_on                   varchar(120)
  service_description            varchar(255)
  generic_requirement            text
  specification                  text
  selected_item_code             varchar(100)
  selected_item_description      text
  technical_attributes_snapshot  jsonb      -- FROZEN at PR raise
  datasheet_gcs_path             varchar(500)
  datasheet_gcs_bucket           varchar(100)
  datasheet_revision_seq         integer
  approved_makes                 text
  uom                            varchar(30)

  -- Quantity Governance (all server-computed — never directly user-editable)
  qty_required                   numeric(10,2) NOT NULL   -- immutable snapshot
  qty_ordered                    numeric(10,2) DEFAULT 0  -- SUM of active PO line qtys
  qty_received                   numeric(10,2) DEFAULT 0  -- SUM of GRN accepted_qty
  qty_pending                    numeric(10,2) DEFAULT 0  -- qty_ordered - qty_received
  qty_balance                    numeric(10,2) DEFAULT 0  -- qty_required - qty_ordered
  over_procurement_approved      boolean DEFAULT false
  over_procurement_reason        text
  over_procurement_approved_by   FK → users (nullable)
  over_procurement_approved_at   timestamp (nullable)

  -- Status
  status                         varchar(40) NOT NULL DEFAULT 'pr_raised'

  -- Vendor selection
  selected_vendor_id             FK → vendors (nullable)
  selected_vendor_name           varchar(255)
  vendor_selected_by             FK → users (nullable)
  vendor_selected_at             timestamp (nullable)
  vendor_selection_note          text
  avl_status_at_selection        varchar(30)   -- qualified|conditional|unqualified|bypassed

  -- PO summary links (denormalized for display — recomputed on mutation)
  active_po_group_id             FK → epc_po_groups (nullable)
  active_po_number               varchar(50)
  latest_po_line_ref             integer

  -- BUY List revision tracking
  buy_list_revision_code         varchar(5)    -- revision code at time of PR raise
  superseded_by_revision         varchar(35)   -- if BUY list revised after PR raise
  revision_action_required       varchar(30)   -- none|amendment_required|cancel_required

  -- Cockpit flags
  rfq_required                   boolean DEFAULT false
  tbe_required                   boolean DEFAULT false
  cbe_required                   boolean DEFAULT false
  inspection_required            boolean DEFAULT false
  is_partial_allowed             boolean DEFAULT true
  priority                       varchar(20) DEFAULT 'normal'
  required_by_date               date

  -- Closure
  closed_by                      FK → users (nullable)
  closed_at                      timestamp (nullable)
  close_reason                   text
  cancelled_by                   FK → users (nullable)
  cancelled_at                   timestamp (nullable)
  cancel_reason                  text
  superseded_by                  integer (nullable)  -- FK → procurement_list_lines (self-ref)
  superseded_at                  timestamp (nullable)
  supersession_reason            text

  -- Legacy flag
  is_legacy                      boolean DEFAULT false

  notes                          text
  created_by                     FK → users
  created_at                     timestamp NOT NULL
  updated_at                     timestamp NOT NULL
```

**Indexes:**
```sql
CREATE INDEX idx_plc_project     ON procurement_list_lines(project_id);
CREATE INDEX idx_plc_status      ON procurement_list_lines(project_id, status);
CREATE INDEX idx_plc_vendor      ON procurement_list_lines(selected_vendor_id);
CREATE INDEX idx_plc_subgroup    ON procurement_list_lines(buy_subgroup_id);
CREATE INDEX idx_plc_tag         ON procurement_list_lines(project_id, tag_no);
CREATE INDEX idx_plc_po_group    ON procurement_list_lines(active_po_group_id);
```

---

### 8b. New Table: `epc_po_groups` (Formal Procurement Document)

```
epc_po_groups
  id                     serial PK
  po_group_number        varchar(35) UNIQUE NOT NULL   -- {projectCode}-POG-{seq:04}
  project_id             FK → projects NOT NULL
  vendor_id              FK → vendors (nullable)
  vendor_name            varchar(255)

  status                 varchar(30) NOT NULL DEFAULT 'draft'
    -- draft|submitted|approved|po_issued|partially_received|fully_received|cancelled|rejected

  -- PO Header data
  payment_terms          text
  delivery_terms         text
  required_by_date       date
  delivery_address       text
  warranty_terms         text
  po_notes               text

  -- Computed totals (refreshed on line edit / GRN)
  total_line_count       integer DEFAULT 0
  total_ordered_qty      numeric(12,2) DEFAULT 0
  total_received_qty     numeric(12,2) DEFAULT 0
  total_amount           numeric(16,2)
  currency               varchar(10) DEFAULT 'INR'

  -- Approval chain
  submitted_by           FK → users (nullable)
  submitted_at           timestamp (nullable)
  submission_note        text
  approved_by            FK → users (nullable)
  approved_at            timestamp (nullable)
  approval_note          text
  rejected_by            FK → users (nullable)
  rejected_at            timestamp (nullable)
  rejection_reason       text
  cancelled_by           FK → users (nullable)
  cancelled_at           timestamp (nullable)
  cancel_reason          text

  -- Generated EPC PO
  epc_po_id              FK → epc_purchase_orders (nullable)
  epc_po_number          varchar(50)

  -- Legacy flag (backfilled records)
  is_legacy              boolean DEFAULT false

  created_by             FK → users
  created_at             timestamp NOT NULL
  updated_at             timestamp NOT NULL
```

---

### 8c. New Table: `epc_po_group_lines`

```
epc_po_group_lines
  id                           serial PK
  po_group_id                  FK → epc_po_groups NOT NULL
  plc_line_id                  FK → procurement_list_lines NOT NULL
  line_number                  integer NOT NULL

  -- Quantity
  line_qty                     numeric(10,2) NOT NULL
  line_qty_received            numeric(10,2) DEFAULT 0

  -- Commercial
  unit_rate                    numeric(12,2)
  total_amount                 numeric(14,2)
  line_notes                   text

  -- Specification freeze (populated at PO issue)
  tech_attrs_frozen            jsonb
  datasheet_gcs_path_frozen    varchar(500)
  spec_freeze_note             text
  frozen_at                    timestamp
  frozen_by                    FK → users (nullable)

  -- Status
  status                       varchar(30) DEFAULT 'active'
    -- active|partially_received|fully_received|cancelled

  UNIQUE(po_group_id, plc_line_id)
  created_at                   timestamp NOT NULL
  updated_at                   timestamp NOT NULL
```

**Duplicate prevention index:**
```sql
-- Enforces that a PLC line can only be in one active PO Group at a time.
-- Implemented via a trigger-maintained is_active boolean (simpler than partial index on subquery):
ALTER TABLE epc_po_group_lines ADD COLUMN is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX uq_plc_line_one_active_group
  ON epc_po_group_lines(plc_line_id)
  WHERE is_active = true;
-- is_active is set to false when po_group.status transitions to cancelled or rejected.
```

---

### 8d. New Table: `epc_po_amendments`

```
epc_po_amendments
  id                      serial PK
  epc_po_id               FK → epc_purchase_orders NOT NULL
  amendment_number        varchar(60) UNIQUE NOT NULL  -- {poNumber}-AMD-{n}
  amendment_seq           integer NOT NULL DEFAULT 1
  amendment_type          varchar(30) NOT NULL
    -- qty_change|delivery_date|commercial|scope_change|cancellation
  description             text NOT NULL
  change_summary          jsonb         -- structured diff
  line_qty_changes        jsonb         -- [{line_number, old_qty, new_qty, reason}]
  status                  varchar(30) DEFAULT 'draft'
    -- draft|submitted|approved|issued|rejected
  submitted_by            FK → users (nullable)
  submitted_at            timestamp (nullable)
  approved_by             FK → users (nullable)
  approved_at             timestamp (nullable)
  approval_note           text
  rejected_by             FK → users (nullable)
  rejection_reason        text
  created_by              FK → users NOT NULL
  created_at              timestamp NOT NULL
  updated_at              timestamp NOT NULL
```

---

### 8e. New Table: `vendor_subgroup_qualification` (AVL Governance)

```
vendor_subgroup_qualification
  id                     serial PK
  vendor_id              FK → vendors NOT NULL
  buy_subgroup_id        FK → buy_subgroups NOT NULL

  qualification_status   varchar(30) DEFAULT 'unqualified'
    -- qualified|conditional|under_review|suspended|unqualified

  qualification_basis    text
  approval_certificate   varchar(255)   -- GCS path or doc reference
  valid_from             date
  valid_until            date           -- NULL = no expiry
  annual_review_due      date

  -- Scoring (auto-maintained by system)
  performance_score      integer DEFAULT 100   -- 0–100
  last_supply_date       date
  total_orders           integer DEFAULT 0
  total_ncrs             integer DEFAULT 0
  last_ncr_date          date

  -- Governance
  qualified_by           FK → users (nullable)
  qualified_at           timestamp (nullable)
  suspended_by           FK → users (nullable)
  suspended_at           timestamp (nullable)
  suspension_reason      text
  reviewed_by            FK → users (nullable)
  reviewed_at            timestamp (nullable)
  review_note            text

  notes                  text
  created_by             FK → users
  created_at             timestamp NOT NULL
  updated_at             timestamp NOT NULL

  UNIQUE(vendor_id, buy_subgroup_id)
```

---

### 8f. New Table: `plc_grn_records` (GRN Traceability)

```
plc_grn_records
  id                        serial PK
  grn_number                varchar(35) UNIQUE NOT NULL   -- {projectCode}-GRN-{seq:04}
  project_id                FK → projects NOT NULL
  plc_line_id               FK → procurement_list_lines NOT NULL
  epc_po_id                 FK → epc_purchase_orders NOT NULL
  po_group_line_id          FK → epc_po_group_lines NOT NULL

  -- Physical receipt
  grn_date                  date NOT NULL
  grn_qty                   numeric(10,2) NOT NULL
  challan_number            varchar(100)
  vehicle_number            varchar(60)
  received_by               FK → users NOT NULL
  received_at               timestamp NOT NULL

  -- Condition at receipt
  condition                 varchar(30) DEFAULT 'pending_inspection'
    -- ok|damaged|partial|pending_inspection
  condition_notes           text

  -- After inspection
  accepted_qty              numeric(10,2)   -- set after inspection; source of truth for qty_received
  rejected_qty              numeric(10,2) DEFAULT 0
  inspection_waived         boolean DEFAULT false
  inspection_waiver_reason  text
  inspection_waived_by      FK → users (nullable)

  -- Inspection link
  inspection_required       boolean DEFAULT false
  inspection_status         varchar(30) DEFAULT 'pending'
    -- pending|in_progress|passed|failed|conditional|waived
  inspection_record_id      FK → inspection_execution_records (nullable)

  -- Stores acceptance
  stores_accepted           boolean DEFAULT false
  stores_accepted_by        FK → users (nullable)
  stores_accepted_at        timestamp (nullable)
  stores_location           varchar(100)

  -- SAP cross-reference
  sap_grn_doc_entry         integer (nullable)   -- FK to sap_goods_receipt_po.doc_entry
  sap_grn_number            varchar(50)
  sap_sync_status           varchar(20) DEFAULT 'pending'
    -- pending|synced|mismatch|error
  sap_sync_note             text
  sap_synced_at             timestamp (nullable)

  notes                     text
  created_by                FK → users NOT NULL
  created_at                timestamp NOT NULL
  updated_at                timestamp NOT NULL
```

---

### 8g. New Table: `plc_material_issues` (Phase 3 — Stores Outward)

```
plc_material_issues
  id                     serial PK
  issue_number           varchar(35) UNIQUE NOT NULL   -- {projectCode}-MIR-{seq:04}
  project_id             FK → projects NOT NULL
  plc_line_id            FK → procurement_list_lines NOT NULL
  grn_record_id          FK → plc_grn_records NOT NULL
  issued_qty             numeric(10,2) NOT NULL
  issued_to              text
  work_order_ref         varchar(100)
  issue_purpose          varchar(100)
  issued_by              FK → users NOT NULL
  issued_at              timestamp NOT NULL
  notes                  text
  created_at             timestamp NOT NULL
  updated_at             timestamp NOT NULL
```

---

### 8h. New Table: `plc_document_attachments`

Central attachment registry for all PLC-related documents (replaces jsonb-embedded patterns used elsewhere).

```
plc_document_attachments
  id                    serial PK
  project_id            FK → projects NOT NULL
  entity_type           varchar(40) NOT NULL
    -- plc_line|po_group|epc_po|po_amendment|grn|rfq|tbe|cbe
  entity_id             integer NOT NULL
  document_type         varchar(40) NOT NULL
    -- vendor_quotation|tbe_document|cbe_document|avl_certificate|
    -- po_document|grn_document|inspection_report|ncr_document|other
  document_name         varchar(255) NOT NULL
  gcs_bucket            varchar(100) NOT NULL
  gcs_object_path       varchar(500) NOT NULL
  original_filename     varchar(255)
  mime_type             varchar(100)
  file_size_bytes       bigint
  checksum_sha256       varchar(64)
  revision_seq          integer DEFAULT 1
  is_current            boolean DEFAULT true    -- only one current per entity+doc_type+name
  uploaded_by           FK → users NOT NULL
  uploaded_at           timestamp NOT NULL
  notes                 text
  created_at            timestamp NOT NULL
```

**GCS path convention:**
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DOCUMENTS/{docType}/{entityRef}/{filename}
```
Strictly follows GCS governance (`docs/gcs-governance-rev4-closure.md`).

---

### 8i. New Table: `procurement_list_audit_log`

```
procurement_list_audit_log
  id               serial PK
  project_id       FK → projects NOT NULL
  entity_type      varchar(40) NOT NULL
    -- plc_line|po_group|epc_po|po_amendment|grn|avl
  entity_id        integer NOT NULL
  event            varchar(80) NOT NULL
  old_status       varchar(40)
  new_status       varchar(40)
  payload          jsonb        -- full context snapshot
  performed_by     FK → users NOT NULL
  performed_at     timestamp NOT NULL

  -- No update, no delete — append-only
```

---

### 8j. ALTER TABLE Statements

```sql
-- epc_purchase_orders
ALTER TABLE epc_purchase_orders
  ALTER COLUMN planning_record_id DROP NOT NULL,
  ADD COLUMN po_group_id            integer REFERENCES epc_po_groups(id),
  ADD COLUMN amendment_count        integer DEFAULT 0,
  ADD COLUMN current_amendment_id   integer REFERENCES epc_po_amendments(id),
  ADD COLUMN qty_ordered_total      numeric(12,2) DEFAULT 0,
  ADD COLUMN qty_received_total     numeric(12,2) DEFAULT 0;

-- epc_purchase_order_items
ALTER TABLE epc_purchase_order_items
  ADD COLUMN plc_line_id          integer REFERENCES procurement_list_lines(id),
  ADD COLUMN po_group_line_id     integer REFERENCES epc_po_group_lines(id),
  ADD COLUMN planning_record_id   integer REFERENCES item_planning_records(id),
  ADD COLUMN buy_list_line_id     integer REFERENCES project_buy_list_lines(id),
  ADD COLUMN qty_received         numeric(10,2) DEFAULT 0;

-- inspection_execution_records
ALTER TABLE inspection_execution_records
  ADD COLUMN plc_line_id     integer REFERENCES procurement_list_lines(id),
  ADD COLUMN grn_record_id   integer REFERENCES plc_grn_records(id);

-- non_conformance_reports
ALTER TABLE non_conformance_reports
  ADD COLUMN plc_line_id     integer REFERENCES procurement_list_lines(id),
  ADD COLUMN epc_po_id       integer REFERENCES epc_purchase_orders(id),
  ADD COLUMN grn_record_id   integer REFERENCES plc_grn_records(id);
```

---

## 9. API / Routes (Complete)

All routes registered under `requirePageAccess('procurement-list-control')`. Manager-level actions use `requireManager`. All mutating routes apply `guardNotFrozen` and `guardCostUnlocked`.

### 9a. Procurement List Lines

| Method | Route | Guard | Description |
|---|---|---|---|
| GET | `/api/projects/:projectId/procurement-list` | Auth + Page | All PLC lines (paginated — see §24) |
| GET | `/api/procurement-list-lines/:id` | Auth + Page | Single line with full linked data |
| POST | `/api/projects/:projectId/procurement-list/backfill` | Auth + Page + Manager | Idempotent backfill |
| PATCH | `/api/procurement-list-lines/:id/vendor-select` | Auth + Page + Manager | Set selected vendor; AVL check |
| PATCH | `/api/procurement-list-lines/:id/flags` | Auth + Page + Manager | Set rfq/tbe/cbe flags, priority |
| PATCH | `/api/procurement-list-lines/:id/notes` | Auth + Page | Update notes only |
| POST | `/api/procurement-list-lines/:id/cancel` | Auth + Page + Manager | Cancel PLC line with reason |
| POST | `/api/procurement-list-lines/:id/supersede` | Auth + Page + Manager | Supersede PLC line (BUY list revision) |
| POST | `/api/projects/:projectId/procurement-list/qty-recompute` | Auth + Page | Recompute all qty fields for project |
| GET | `/api/projects/:projectId/procurement-list/po-eligibility` | Auth + Page | Eligibility per line |
| GET | `/api/projects/:projectId/procurement-list/qty-summary` | Auth + Page | Cockpit qty dashboard data |

### 9b. PO Groups

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | `/api/epc-po-groups` | Auth + Page + Manager | Create POG; pg_advisory_xact_lock |
| GET | `/api/epc-po-groups/:id` | Auth + Page | Full POG detail with lines |
| GET | `/api/projects/:projectId/epc-po-groups` | Auth + Page | All POGs for project |
| PATCH | `/api/epc-po-groups/:id/header` | Auth + Page + Manager | Edit header while draft |
| PATCH | `/api/epc-po-groups/:id/lines` | Auth + Page + Manager | Edit line qty / rates while draft |
| POST | `/api/epc-po-groups/:id/submit` | Auth + Page | Submit for approval |
| POST | `/api/epc-po-groups/:id/approve` | Auth + Page + Manager | Approve; generate EPC PO |
| POST | `/api/epc-po-groups/:id/reject` | Auth + Page + Manager | Reject with reason; release lines |
| POST | `/api/epc-po-groups/:id/cancel` | Auth + Page + Manager | Cancel; release lines |
| POST | `/api/epc-po-groups/:id/issue-po` | Auth + Page + Manager | Issue EPC PO; freeze spec snapshot |

### 9c. EPC Purchase Orders (multi-line, from POG)

| Method | Route | Guard | Description |
|---|---|---|---|
| GET | `/api/epc-purchase-orders/:id` | Auth + Page | Full PO with all lines |
| GET | `/api/epc-purchase-orders/:id/lines` | Auth + Page | Line-level commercial detail |
| POST | `/api/epc-purchase-orders/:id/amend` | Auth + Page + Manager | Initiate PO Amendment |
| GET | `/api/epc-purchase-orders/:id/amendments` | Auth + Page | Amendment history |
| GET | `/api/projects/:projectId/epc-purchase-orders` | Auth + Page | All EPC POs for project |

### 9d. GRN

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | `/api/plc-grn` | Auth + Page | Record goods receipt |
| GET | `/api/plc-grn/:id` | Auth + Page | GRN detail |
| GET | `/api/projects/:projectId/plc-grn` | Auth + Page | All GRNs for project |
| POST | `/api/plc-grn/:id/accept-stores` | Auth + Page + Manager | Mark stores acceptance |
| PATCH | `/api/plc-grn/:id/inspection-result` | Auth + Page + Manager | Link inspection result |
| POST | `/api/plc-grn/:id/waive-inspection` | Auth + Page + Manager | Waive inspection with reason |

### 9e. AVL Governance

| Method | Route | Guard | Description |
|---|---|---|---|
| GET | `/api/vendors/:vendorId/qualification` | Auth + Page | All subgroup qualifications |
| POST | `/api/vendor-subgroup-qualification` | Auth + Page + Manager | Add qualification |
| PATCH | `/api/vendor-subgroup-qualification/:id` | Auth + Page + Manager | Update status / score |
| POST | `/api/vendor-subgroup-qualification/:id/suspend` | Auth + Page + Manager | Suspend with reason |
| POST | `/api/procurement-list/avl-check` | Auth + Page | Check vendor vs PLC line subgroups |

### 9f. Document Attachments

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | `/api/plc-documents/upload` | Auth + Page | Upload document to GCS; create attachment record |
| GET | `/api/plc-documents/:entityType/:entityId` | Auth + Page | All attachments for entity |
| DELETE | `/api/plc-documents/:id` | Auth + Page + Manager | Mark attachment inactive (no GCS delete) |

### 9g. Quantity Governance

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | `/api/procurement-list-lines/:id/approve-over-procurement` | Auth + Page + Manager | Approve over-procurement with mandatory reason |

### 9h. SAP Sync (Phase 4)

| Method | Route | Guard | Description |
|---|---|---|---|
| POST | `/api/plc-sap/push-po/:epcPoId` | Auth + Page + Manager | Push approved EPC PO to SAP B1 |
| POST | `/api/plc-sap/pull-grn/:epcPoId` | Auth + Page | Pull SAP GRN records for this PO |
| POST | `/api/plc-sap/reconcile/:epcPoId` | Auth + Page + Manager | Reconcile THERMOPAC vs SAP qty mismatch |
| GET | `/api/plc-sap/sync-status/:epcPoId` | Auth + Page | Current SAP sync status for this PO |

---

## 10. UI / Pages / Components

### 10a. Main Page: `ProcurementListControlPage`

**Route:** `/epc/procurement-list-control`  
**Permission:** `procurement-list-control`

**Cockpit sections:**

**A. Project Selector and Summary Strip**
- Total lines | Pending | In Progress | PO Issued | Received | Closed
- Qty strip: Required | Ordered | Received | Balance | Over-procured (alert)
- AVL alerts: unqualified vendor in active POG
- Delivery overdue count

**B. Procurement Lines Table** (paginated — 50 per page default)
- Columns: PLC No | Tag No | Group | Subgroup | Description | Qty Required | Qty Ordered | Qty Received | Qty Balance | Status | Vendor | AVL | PO Group | EPC PO | Priority | Flags
- Multi-select checkboxes
- Filters: Status | Subgroup | Vendor | PO No | Priority | Required Date Range | AVL status

**C. Bulk Actions Toolbar**
- Create PO Group | Set Priority | Set RFQ Required | Assign Vendor | Export Selected

**D. PO Groups Panel** (tab)
- All POGs with status, vendor, line count, amount, actions

**E. GRN / Delivery Tracking Panel** (tab, Phase 3)
- All GRN records: date, qty, vendor, condition, inspection status

**F. KPI Dashboard Panel** (tab)
- See §22

**G. Future Panels** (Phase 2+)
- RFQ Management | TBE/CBE Board | Vendor Performance | Delivery Calendar

### 10b. PO Group Wizard (Multi-Step Dialog)

Step 1: AVL check — vendor selection with real-time qualification status per subgroup  
Step 2: Line review — line-by-line qty, unit rate, notes  
Step 3: PO header — required date, payment terms, delivery terms, notes, warranty  
Step 4: Confirm — summary with AVL warnings requiring checkbox acknowledgement

### 10c. Other Components

- `PoGroupDetailPanel` — POG detail with line table, approval chain, EPC PO link
- `GrnRecordDialog` — GRN entry with challan, qty, condition, inspection flag
- `PlcLineDetailDrawer` — Full history panel: PLN → PLC → POG → PO → GRN → Inspection
- `VendorAvlPanel` — Qualification management on vendor master page
- `PlcDocumentManager` — Attachment upload/view per entity
- BUY List Control: new "Procurement" column showing PLC status, PO Group, PO No, PO Line Ref

---

## 11. Line Status Lifecycle (Complete Reference)

| Status | Entry Condition | Exits To | Notes |
|---|---|---|---|
| `pr_raised` | Raise PR executed | `pending_rfq` / `vendor_selected` / `in_po_group` | Auto-created in same tx as PLN |
| `pending_rfq` | `rfq_required` flag set | `rfq_issued` | Phase 2 |
| `rfq_issued` | RFQ document created | `rfq_closed` | Phase 2 |
| `rfq_closed` | RFQ responses logged | `tbe_in_progress` / `vendor_selected` | Phase 2 |
| `tbe_in_progress` | TBE initiated | `cbe_in_progress` / `vendor_selected` | Phase 2 |
| `cbe_in_progress` | CBE initiated | `vendor_selected` | Phase 2 |
| `vendor_selected` | Vendor chosen + AVL check | `in_po_group` | Direct from `pr_raised` if no RFQ/TBE/CBE |
| `in_po_group` | Line added to draft POG | `po_submitted` / reverts on cancel/reject | Locked by pg_advisory_xact_lock |
| `po_submitted` | POG submitted | `po_approved` / `vendor_selected` on rejection | |
| `po_approved` | Manager approves POG | `po_issued` | EPC PO generated |
| `po_issued` | EPC PO issued to vendor | `partially_received` | Spec snapshot frozen |
| `partially_received` | First GRN recorded (partial) | `fully_received` / `in_po_group` (repeat PO) | qty_balance > 0 → repeat allowed |
| `fully_received` | All qty_ordered received | `closed` | |
| `closed` | Inspection passed + stores accepted | (terminal) | Manual close allowed by Manager |
| `cancelled` | Manager cancels | (terminal) | Requires reason |
| `superseded` | BUY List revision creates new PLC line | (terminal) | See §16 |

---

## 12. Duplicate Prevention Logic

**Three layers — same pattern as tag number generation:**

**Layer 1 — Application guard:**
```sql
SELECT pgl.plc_line_id, pg.po_group_number, pg.status
FROM epc_po_group_lines pgl
JOIN epc_po_groups pg ON pg.id = pgl.po_group_id
WHERE pgl.plc_line_id = ANY($selectedLineIds)
  AND pgl.is_active = true
```
If any row returned → HTTP 409 with offending line IDs and active group numbers.

**Layer 2 — Database unique index:**
```sql
CREATE UNIQUE INDEX uq_plc_line_one_active_group
  ON epc_po_group_lines(plc_line_id)
  WHERE is_active = true;
```
`is_active` is set to `false` by the POG cancel/reject handler inside the same transaction.

**Layer 3 — PLC line status:**
Any attempt to add a line that is not in `pr_raised` / `rfq_closed` / `tbe_complete` / `vendor_selected` / `partially_received` (with qty_balance > 0) returns HTTP 422 before touching `epc_po_group_lines`.

---

## 13. Concurrency and Transaction-Locking Governance

**Problem:** Two users simultaneously selecting overlapping PLC lines for different PO Groups may both pass the Layer 1 guard before either commits.

**Solution:** `pg_advisory_xact_lock` keyed on each PLC line ID — same pattern as tag number generation (`getNextTagNoInTx` uses `pg_advisory_xact_lock(projectId)`).

**Implementation (`POST /api/epc-po-groups`):**
1. Sort selected `plcLineIds` ascending (prevents deadlock).
2. Open transaction.
3. For each ID in sorted order: `SELECT pg_advisory_xact_lock($id)`.
4. Re-read each `procurement_list_lines` row inside the transaction with `SELECT ... FOR UPDATE`.
5. Re-validate status and qty_balance.
6. If any line fails revalidation → ROLLBACK, HTTP 409.
7. Insert `epc_po_groups` + `epc_po_group_lines`.
8. Update `procurement_list_lines.status = 'in_po_group'` + `active_po_group_id`.
9. COMMIT (releases all advisory locks).

**Qty recomputation locking:**
All qty field recomputation (`qty_ordered`, `qty_received`, `qty_pending`, `qty_balance`) is done with `SELECT ... FOR UPDATE` on the `procurement_list_lines` row inside a transaction before writing. This prevents concurrent GRN or PO creation from causing double-counting.

---

## 14. Quantity Ownership and Flow — Point-by-Point

This section is the definitive reference. No ambiguity is permitted.

### 14a. PLC Line Qty

**Owner:** `procurement_list_lines`  
**Fields:**

| Field | Set By | When | Mutable? |
|---|---|---|---|
| `qty_required` | System (from buy list line qty at PR raise) | Once, at PLC line creation | NEVER |
| `qty_ordered` | System-computed | After every POG line create/cancel/amend | Read-only for users |
| `qty_received` | System-computed | After every GRN inspection acceptance | Read-only for users |
| `qty_pending` | System-computed = `qty_ordered - qty_received` | After every GRN | Read-only |
| `qty_balance` | System-computed = `qty_required - qty_ordered` | After every POG mutation | Read-only |

### 14b. POG Line Qty

**Owner:** `epc_po_group_lines`  
**Field:** `line_qty` — set by user at PO Group creation. May be less than `qty_required` (partial procurement). Subject to over-procurement guard (§3, R1). Set once; editable only while POG is in `draft` status.

### 14c. EPC PO Line Qty

**Owner:** `epc_purchase_order_items`  
**Field:** quantity — mirrors `epc_po_group_lines.line_qty` at the moment of PO issue. Immutable after issue. Changed only via formal PO Amendment.

### 14d. GRN Qty

**Owner:** `plc_grn_records`  
**Field:** `grn_qty` — physical delivery count on the challan. Set by Stores at receipt. Immutable.

### 14e. Inspection Accepted Qty

**Owner:** `inspection_execution_records` (for the formal result) → flows to `plc_grn_records.accepted_qty`  
`accepted_qty = grn_qty - rejected_qty`  
Set by Quality module after inspection. Feeds back into PLC qty computation.

### 14f. Stores Accepted Qty

**Owner:** `plc_grn_records.accepted_qty` (same field — stores acceptance confirms the inspection-accepted qty is physically placed in stores).  
`stores_accepted_at` and `stores_accepted_by` are the formal Stores sign-off.

### 14g. No Duplicate Counting

- `qty_received` on `procurement_list_lines` = SUM of `plc_grn_records.accepted_qty` for that PLC line — computed, not independently stored.
- `line_qty_received` on `epc_po_group_lines` = SUM of `plc_grn_records.accepted_qty` where `grn.po_group_line_id = this row` — computed, not independently stored.
- `qty_received_total` on `epc_purchase_orders` = SUM of `epc_purchase_order_items.qty_received` — denormalized for SAP sync, always recomputed from GRN on mutation.

---

## 15. BUY List Revision Governance

A BUY List can be revised (new revision code) after lines have been raised to PR. The rules below define what happens to PLC lines at each stage when the underlying BUY List line changes.

### 15a. Revision After PR Raised (PLC Line status = `pr_raised` / `vendor_selected`)

- BUY List line revision creates a new `project_buy_list_lines` row (supersession pattern).
- The old buy list line's PLC line receives `revision_action_required = 'cancel_required'` and a notification is raised.
- A Manager must explicitly cancel the old PLC line and a new Raise PR on the revised line creates a fresh PLC line.
- **Automatic action: NONE.** No automatic cancel or supersede. Requires explicit Manager decision.

### 15b. Revision After POG Approved (PLC Line status = `po_approved`)

- POG and EPC PO are already generated. A BUY list revision at this stage sets `revision_action_required = 'amendment_required'` on the PLC line.
- The cockpit surfaces a prominent alert: "Specification changed after PO approval — PO Amendment may be required."
- **Automatic action: NONE.** Manager decides whether to proceed with amendment or accept existing PO.

### 15c. Revision After PO Issued (PLC Line status = `po_issued`)

- EPC PO is issued and the vendor is bound by the frozen spec snapshot on `epc_po_group_lines.tech_attrs_frozen`.
- The BUY list revision does NOT affect the issued PO spec. The frozen snapshot is authoritative for the vendor.
- `revision_action_required = 'amendment_required'` is set on the PLC line.
- A formal PO Amendment must be raised if the scope/spec change materially affects the PO.
- **Automatic action: Alert only. No PO change until Amendment is explicitly approved.**

### 15d. Revision After Partial GRN (PLC Line status = `partially_received`)

- Same as §15c for the already-issued PO covering received qty.
- If `qty_balance > 0` (more to procure), the new PLC line (from revised BUY list raise PR) handles the balance.
- The original PLC line continues to manage the already-ordered/received qty.
- **Automatic action: NONE. Two PLC lines may co-exist for the same Tag No at different revision codes. This is intentional and traceable.**

### 15e. BUY List Revision Supersession Flag

When a BUY List line is superseded by a new revision, the corresponding PLC line gets:
```
revision_action_required = 'cancel_required' | 'amendment_required'
superseded_by_revision   = new revision code
```
The cockpit highlights these lines in an amber "Revision Alert" row style.

---

## 16. Superseded PLC Line Rules

A PLC line enters `superseded` status when:
- A Manager explicitly supersedes it via `POST /api/procurement-list-lines/:id/supersede`.
- The new replacement PLC line ID is recorded in `superseded_by` field.

**Rules:**

1. **Auto-close balance qty: YES** — upon supersession, `qty_balance` becomes 0 conceptually (the superseded line is closed). The replacement PLC line carries the new qty_required.

2. **Auto-cancel associated PO Group: CONDITIONAL** — if the PLC line's POG is still in `draft` or `submitted` status, the system auto-removes the superseded line from the POG and recalculates totals. If the POG is `approved` or beyond, a PO Amendment is required before the line can be superseded.

3. **Force PO Amendment: YES** — if PLC line is `po_approved` / `po_issued`, supersession is blocked until a PO Amendment is raised and approved. The Amendment must reduce the affected line qty to 0 (scope removal).

4. **Force new PLC line creation: YES** — supersession always requires a new PLC line to be created from the revised BUY list line's Raise PR. The system validates that `superseded_by` FK points to the new PLC line before marking the old one as superseded.

5. **Audit trail: MANDATORY** — supersession reason logged in `procurement_list_audit_log` and in `supersession_reason` field.

6. **GRN and received qty: PRESERVED** — already-received quantities remain on the superseded PLC line for historical traceability. They are not migrated to the replacement line.

---

## 17. AVL Governance — Vendor Subgroup Qualification

### 17a. Qualification Lifecycle

```
unqualified → under_review → qualified | conditional
                                  │
                            suspended (performance failure or manual)
                                  │
                            under_review (re-qualification attempt)
```

### 17b. Enforcement Levels

Controlled by a DB config flag `avl_enforcement_level`:

| Level | Behaviour |
|---|---|
| `advisory` | Qualification status shown; no block on PO Group creation |
| `soft` | Warning shown for unqualified/suspended vendors; Manager must acknowledge with checkbox; logged in audit |
| `hard` | PO Group creation BLOCKED if any line's vendor is `unqualified` or `suspended` for its subgroup |

Default after migration: `soft`. Escalation to `hard` is a management decision.

### 17c. Performance Score Automation

- Every clean GRN (no NCR, accepted_qty = grn_qty): +1 point (max 100).
- Every NCR linked to this vendor + subgroup: -10 points.
- Below 60: automatic flag for review, cockpit alert.
- Below 40: automatic suspension recommendation (still requires Manager to execute).

### 17d. Annual Review

- `annual_review_due` field. Cockpit alerts 30 days before due date.
- Overdue review: vendor qualification status moves to `under_review` automatically.

---

## 18. PO Amendment / Revision Workflow

### 18a. When Triggered

Any change to an EPC PO that has already been issued:
- Quantity adjustment (increase or decrease)
- Delivery date change
- Commercial terms change
- Scope addition (new line item)
- Scope removal (line qty → 0)
- Cancellation of entire PO

### 18b. Amendment Lifecycle

```
EPC PO status = 'issued' | 'partially_received'
  → POST /api/epc-purchase-orders/:id/amend
  → epc_po_amendments record created (status = 'draft')
  → EPC PO status → 'under_amendment' (new GRNs blocked temporarily)
  → Amendment submitted → Manager approves
  → Amendment issued:
      - epc_purchase_order_items updated
      - epc_po_group_lines.line_qty updated
      - procurement_list_lines qty fields recomputed
      - EPC PO amendment_count incremented
      - EPC PO status reverts to 'issued'
```

### 18c. Amendment Guards

- Cannot reduce `line_qty` below `line_qty_received` — system blocks.
- Cannot amend a PO that is `closed` or `cancelled`.
- Only one active amendment per PO at a time (blocks new amendment if one is in `draft` or `submitted`).
- Amendment approval requires Manager role.

---

## 19. SAP Integration Governance

### 19a. Ownership Model

| Entity | THERMOPAC QMS | SAP B1 |
|---|---|---|
| EPC PO (procurement authorisation) | **Source of truth** | Receives a push |
| SAP PO (`sap_purchase_orders`) | Read-only mirror | **Source of truth for financials/tax** |
| GRN (physical receipt) | **Source of truth for qty** | Receives a push or parallel entry |
| SAP GRN (`sap_goods_receipt_po`) | Read-only mirror | SAP-side record |
| Invoice | SAP only | **Source of truth** |

### 19b. PO Sync Flow

When EPC PO is issued (`POST /api/epc-po-groups/:id/issue-po`):
1. THERMOPAC creates the EPC PO record.
2. A background job (or manual trigger via `POST /api/plc-sap/push-po/:epcPoId`) pushes PO data to SAP B1 via the existing SAP B1 integration layer.
3. SAP B1 creates its PO document and returns the SAP `docEntry`.
4. THERMOPAC stores the SAP `docEntry` in `epc_purchase_orders.sap_po_doc_entry` (new field to add).
5. `epc_purchase_orders.sap_sync_status` set to `synced`.

### 19c. GRN Sync Flow

Two patterns supported (configurable per project):

**Pattern A — THERMOPAC GRN first:**
1. Stores records GRN in THERMOPAC (`POST /api/plc-grn`).
2. System pushes GRN to SAP B1.
3. SAP GRN `docEntry` stored in `plc_grn_records.sap_grn_doc_entry`.

**Pattern B — SAP GRN first:**
1. Stores creates GRN in SAP B1.
2. THERMOPAC pulls SAP GRN via `POST /api/plc-sap/pull-grn/:epcPoId`.
3. System creates or updates `plc_grn_records` from SAP data.
4. Manual confirmation of `accepted_qty` still required in THERMOPAC (inspection may differ).

### 19d. Retry and Reconciliation Strategy

- Failed SAP push: `sap_sync_status = 'error'`, `sap_sync_note` contains error detail. Retry available via manual trigger. Up to 3 automatic retries with exponential backoff (same pattern as existing SAP integration).
- Mismatch detection: `POST /api/plc-sap/reconcile/:epcPoId` compares THERMOPAC `qty_ordered` / `qty_received` against SAP PO lines / GRN lines. Returns a diff report.
- Mismatch resolution: THERMOPAC is the source of truth for **quantity governance**. SAP is the source of truth for **financials**. Reconciliation report presented to Manager who decides corrective action.
- `sap_sync_status` values: `pending` | `synced` | `mismatch` | `error` | `not_applicable`

### 19e. Schema Additions for SAP Sync

```sql
ALTER TABLE epc_purchase_orders
  ADD COLUMN sap_po_doc_entry    integer,
  ADD COLUMN sap_po_doc_num      varchar(50),
  ADD COLUMN sap_sync_status     varchar(20) DEFAULT 'pending',
  ADD COLUMN sap_sync_note       text,
  ADD COLUMN sap_synced_at       timestamp;
```

---

## 20. Document Attachment Governance

All procurement documents are stored in GCS via the `plc_document_attachments` table (§8h).

### 20a. Document Types per Entity

| Entity | Permitted Document Types |
|---|---|
| `plc_line` | specification_revision, approved_makes_update, correspondence |
| `po_group` | rfq_response, vendor_quotation, avl_certificate, internal_approval |
| `epc_po` | po_document (signed copy), vendor_acceptance, delivery_schedule |
| `po_amendment` | amendment_document, vendor_acknowledgement |
| `grn` | delivery_challan, packing_list, test_certificate, weight_certificate |
| `rfq` (Phase 2) | rfq_document, addendum, query_response |
| `tbe` (Phase 2) | tbe_report, technical_clarification |
| `cbe` (Phase 2) | cbe_report, commercial_clarification, negotiation_record |

### 20b. GCS Path Convention

```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DOCUMENTS/{entityType}/{entityRef}/{docType}_{revision}_{filename}
```

Strictly follows `docs/gcs-governance-rev4-closure.md`. No exceptions.

### 20c. Attachment Rules

- SHA-256 duplicate detection: same checksum on same entity → link to existing GCS object, create new attachment record with new `revision_seq`.
- Only one `is_current = true` per `(entity_type, entity_id, document_type, document_name)` combination.
- Attachments are never physically deleted from GCS. `is_current = false` marks superseded versions.
- Signed URL expiry: 1 hour for procurement documents (same as existing EPC attachment pattern).

---

## 21. Notification / Event Governance

All notifications use the existing `notifications` table (`userId`, `type`, `title`, `message`, `link`, `priority`, `category`, `sourceType`, `sourceId`).

| Event | Trigger | Recipients | Priority | Category |
|---|---|---|---|---|
| `plc.pr_raised` | Raise PR completes | Procurement Manager for project | medium | procurement |
| `plc.rfq_pending` | `rfq_required` flag set, no RFQ raised in 48h | Assigned procurement user | high | procurement |
| `plc.vendor_selection_pending` | PLC line in `pr_raised` for > 5 business days | Procurement Manager | medium | procurement |
| `plc.pog_approval_pending` | POG submitted, not approved in 24h | All Managers | high | procurement |
| `plc.pog_rejected` | POG rejected | POG creator | high | procurement |
| `plc.po_issued` | EPC PO issued | POG creator + Vendor contact (email if available) | medium | procurement |
| `plc.delivery_overdue` | required_by_date passed + status not `fully_received` | Procurement Manager | high | procurement |
| `plc.grn_pending_inspection` | GRN recorded with `inspection_required = true` | Quality Manager | high | quality |
| `plc.inspection_failed` | Inspection result = failed | Procurement Manager + Quality Manager | urgent | quality |
| `plc.ncr_raised` | NCR linked to a PLC GRN | Procurement Manager + Quality Manager | urgent | quality |
| `plc.avl_review_due` | `annual_review_due` within 30 days | Procurement Admin | low | avl |
| `plc.avl_overdue` | `annual_review_due` passed | Procurement Admin + Manager | high | avl |
| `plc.over_procurement_requested` | Over-procurement request raised | All Managers | high | procurement |
| `plc.buy_list_revision_alert` | BUY list revised after PO issued | Procurement Manager | high | procurement |

**Delivery channel:** In-app notifications (existing `notifications` table + bell icon). Email via SendGrid for `urgent` and `high` priority events where recipient has email configured. No new infrastructure required.

---

## 22. Dashboard / KPI Governance

**Location:** KPI Dashboard panel within the Procurement List Control cockpit (tab on the main page).

**Data source:** Computed on demand from PLC tables. For large projects, pre-computed nightly via background job (§24).

### 22a. KPI Definitions

| KPI | Formula | Source |
|---|---|---|
| Procurement Completion % | `(COUNT lines with status IN (closed, fully_received)) / COUNT(total lines) * 100` | `procurement_list_lines` |
| Lines Pending Ordering | `COUNT WHERE qty_balance > 0 AND status NOT IN (po_issued, partially_received, fully_received, closed, cancelled)` | `procurement_list_lines` |
| Procurement Delay | Lines where `required_by_date < TODAY AND status NOT IN (fully_received, closed)` — count and avg days late | `procurement_list_lines` |
| PO Aging (Open POs) | Age in days from `epc_purchase_orders.created_at` where status = `issued` and `partially_received` | `epc_purchase_orders` |
| GRN Aging (Pending Inspection) | GRNs where `inspection_status = pending` and `received_at < (NOW - 48h)` | `plc_grn_records` |
| Vendor Performance Score | `vendor_subgroup_qualification.performance_score` per vendor per subgroup | `vendor_subgroup_qualification` |
| Over-procurement Lines | `COUNT WHERE qty_over > 0` | `procurement_list_lines` |
| Inspection Pending | `COUNT WHERE inspection_status = pending` | `plc_grn_records` |
| NCR Count | `COUNT non_conformance_reports WHERE plc_line_id IS NOT NULL AND status != closed` | `non_conformance_reports` |
| AVL Qualification Rate | `COUNT qualified / COUNT total vendor-subgroup pairs` | `vendor_subgroup_qualification` |

### 22b. Dashboard Views

- **Project Procurement Health** — completion %, delay count, over-procurement flag, NCR count
- **Vendor Scorecard** — per-vendor: orders, NCRs, performance score, qualification status
- **PO Aging Report** — all open POs with age, vendor, value, status
- **Delivery Calendar** — Gantt-style view of `required_by_date` per PLC line, color-coded by risk
- **GRN Inspection Queue** — all GRNs pending inspection, sortable by days pending

---

## 23. Archival and Closure Governance

### 23a. PLC Line Closure

A PLC line is `closed` when:
1. `fully_received` (all ordered qty received), AND
2. Inspection passed (or waived), AND
3. Stores acceptance confirmed

Close action: `POST /api/procurement-list-lines/:id/close` (requireManager). The line status moves to `closed`. No further mutations permitted except adding notes.

**Forced closure (Manager override):** A Manager may close a line before full receipt if remaining balance is accepted as cancelled (e.g., vendor cannot supply remaining qty). `over_procurement_approved` logic is not triggered — instead, `cancel_reason` records the shortfall.

### 23b. Project Closure Handling

When a project is closed/completed:
1. All PLC lines in terminal status (`closed`, `cancelled`, `superseded`) — no action.
2. PLC lines in `po_issued` or `partially_received` — surfaced as a "Procurement Closure Checklist" alert. Manager must either force-close or raise a final GRN.
3. PLC lines in `pr_raised` / `vendor_selected` / `in_po_group` — auto-cancelled with reason `project_closed` (system action; logged).
4. Open POGs (`draft` / `submitted`) — auto-cancelled with reason `project_closed`.
5. Issued EPC POs — not auto-cancelled. Manager must explicitly close or cancel.

### 23c. Immutable Retention Rules

| Entity | Retention | Deletable? |
|---|---|---|
| `procurement_list_lines` | Permanent | NO — status-based closure only |
| `epc_po_groups` | Permanent | NO |
| `epc_purchase_orders` | Permanent | NO |
| `epc_po_amendments` | Permanent | NO |
| `plc_grn_records` | Permanent | NO |
| `procurement_list_audit_log` | Permanent | NO — append-only |
| `plc_document_attachments` | Permanent (GCS files never deleted) | `is_current = false` only |
| `vendor_subgroup_qualification` | Permanent | NO — status changes only |

No `DELETE` statements are permitted on any PLC-related table in any API route. Drizzle ORM schema definitions for these tables have no `.onDelete('cascade')` on the PLC tables themselves.

---

## 24. Large-Project Performance Governance

THERMOPAC projects may have 300–1000+ procurement lines. The cockpit must remain responsive.

### 24a. Pagination

- All `GET /api/projects/:projectId/procurement-list` responses are paginated: default 50 rows per page, configurable up to 200.
- Cursor-based pagination (using `id` as cursor) rather than offset for stability under concurrent inserts.
- Filter parameters applied server-side before pagination.

### 24b. Required Indexes

```sql
CREATE INDEX idx_plc_project_status    ON procurement_list_lines(project_id, status);
CREATE INDEX idx_plc_project_vendor    ON procurement_list_lines(project_id, selected_vendor_id);
CREATE INDEX idx_plc_project_subgroup  ON procurement_list_lines(project_id, buy_subgroup_id);
CREATE INDEX idx_plc_required_date     ON procurement_list_lines(project_id, required_by_date)
  WHERE required_by_date IS NOT NULL;
CREATE INDEX idx_plc_qty_balance       ON procurement_list_lines(project_id)
  WHERE qty_balance > 0;
CREATE INDEX idx_pogline_group         ON epc_po_group_lines(po_group_id);
CREATE INDEX idx_grn_plc_line          ON plc_grn_records(plc_line_id);
CREATE INDEX idx_grn_project           ON plc_grn_records(project_id);
CREATE INDEX idx_grn_inspection_status ON plc_grn_records(project_id, inspection_status)
  WHERE inspection_status = 'pending';
CREATE INDEX idx_audit_entity          ON procurement_list_audit_log(entity_type, entity_id);
```

### 24c. Background Qty Recomputation

For large projects (> 200 PLC lines), qty field recomputation is offloaded to a background job:

- **Trigger:** Any GRN creation, POG cancel, or PO amendment completion queues a recomputation job for the affected `plc_line_id`s.
- **Job:** Runs within the existing scheduler. Job type: `plc_qty_recompute`, runs within 60 seconds of trigger.
- **UI during recompute:** Qty fields show a "calculating" indicator. A `qty_last_computed_at` timestamp on `procurement_list_lines` drives this.
- **Manual trigger:** `POST /api/projects/:projectId/procurement-list/qty-recompute` for Manager override.

### 24d. Cockpit Performance Strategy

- **Summary strip:** Pre-computed and cached in a `procurement_cockpit_summary` materialized view, refreshed every 5 minutes or on demand.
- **Filters applied server-side:** No full-table scans in JS. All filter + sort combinations use covered indexes.
- **KPI dashboard:** Heavy queries run asynchronously on demand, results cached for 10 minutes.
- **Export:** CSV export of filtered lines runs as a streaming response — no full dataset loaded in memory.

---

## 25. Technical Datasheet / Specification Freeze Governance

**When freeze occurs:** At `POST /api/epc-po-groups/:id/issue-po` (PO issue step), inside the same transaction as the PO status update.

**What is frozen per line:**

| Field | Source | Frozen Into |
|---|---|---|
| Technical attributes | `procurement_list_lines.technical_attributes_snapshot` | `epc_po_group_lines.tech_attrs_frozen` |
| Datasheet GCS path | `procurement_list_lines.datasheet_gcs_path` | `epc_po_group_lines.datasheet_gcs_path_frozen` |
| Datasheet GCS bucket | `procurement_list_lines.datasheet_gcs_bucket` | (included in `tech_attrs_frozen` metadata) |
| Datasheet revision seq | `procurement_list_lines.datasheet_revision_seq` | (included in metadata) |
| Spec freeze note | "Frozen at PO issue {poNumber} on {date} by {user}" | `epc_po_group_lines.spec_freeze_note` |
| Frozen timestamp | NOW() | `epc_po_group_lines.frozen_at` |
| Frozen by | current user | `epc_po_group_lines.frozen_by` |

**Immutability:** After freeze, `tech_attrs_frozen` and `datasheet_gcs_path_frozen` are never overwritten. The only path to changing the vendor's specification is a formal PO Amendment (§18).

**GCS path stability:** GCS governance already ensures files are never deleted (only superseded). The frozen path always resolves to a valid file.

**UI display:** In PO detail view, a "Specification at Issue" section shows the frozen spec and a "View Datasheet (at issue)" button that resolves the frozen GCS path. If the current BUY List datasheet differs, a "Spec has been revised since PO issue" banner is shown.

---

## 26. Future Traceability Design

Full traceability chain — designed now, activated per phase:

```
project_buy_list_lines  [BUY List Control]
  └── item_planning_records  [PLN — Raise PR]
       └── procurement_list_lines  [PLC — single scope owner]
            │
            ├── epc_po_group_lines  (per PO batch)
            │    └── epc_purchase_order_items  (commercial per PO line)
            │         └── epc_po_amendments  (revision history)
            │
            ├── plc_grn_records  (per physical delivery)  [Phase 3]
            │    └── inspection_execution_records  (quality gate)
            │         └── non_conformance_reports  (if rejected)
            │
            ├── plc_material_issues  (stores outward)  [Phase 3]
            │
            ├── plc_document_attachments  (all documents)  [Phase 1]
            │
            └── future_links (designed, not yet activated):
                 ├── plc_rfq_records            [Phase 2]
                 ├── plc_vendor_quotes           [Phase 2]
                 ├── plc_tbe_records             [Phase 2]
                 ├── plc_cbe_records             [Phase 2]
                 ├── plc_vendor_comparison       [Phase 2]
                 ├── plc_rate_contract_refs      [Phase 3]
                 └── sap_purchase_orders         [Phase 4]
```

**End-to-end lineage query for any received material:**
```sql
SELECT
  bl.tag_no, bl.generic_requirement,
  plc.plc_number, plc.qty_required, plc.qty_ordered, plc.qty_received,
  pg.po_group_number, epo.po_number,
  grn.grn_number, grn.grn_date, grn.accepted_qty,
  ier.inspection_type, ier.status AS inspection_status,
  ncr.ncr_number, ncr.severity
FROM procurement_list_lines plc
JOIN project_buy_list_lines bl ON bl.id = plc.buy_list_line_id
LEFT JOIN epc_po_group_lines pgl ON pgl.plc_line_id = plc.id
LEFT JOIN epc_po_groups pg ON pg.id = pgl.po_group_id
LEFT JOIN epc_purchase_orders epo ON epo.id = pg.epc_po_id
LEFT JOIN plc_grn_records grn ON grn.plc_line_id = plc.id
LEFT JOIN inspection_execution_records ier ON ier.grn_record_id = grn.id
LEFT JOIN non_conformance_reports ncr ON ncr.grn_record_id = grn.id
WHERE plc.project_id = $1
ORDER BY plc.plc_number, grn.grn_date;
```

---

## 27. Implementation Phase Breakdown

### Phase 1 — Core MVP (Procurement List Control foundation)

**Scope:** PLC line creation, POG creation/approval, EPC PO generation (multi-line), duplicate prevention, qty governance, AVL soft enforcement, document attachments, notifications (core events), BUY List integration, BUY List revision alerts, cockpit page (lines + POG panel), migration backfill.

**Schema deliverables:**
- 8 new tables (§8a through §8i)
- 4 ALTER TABLE statements (§8j)
- Indexes (§24b)
- Sequence registration: POG

**Backend deliverables:**
- `server/procurement-list-routes.ts`
- `server/vendor-qualification-routes.ts`
- `server/pppc-routes.ts` modified: raise-pr + bulk-raise-pr auto-create PLC line in same tx; soft deprecation block
- `server/doc-sequence-service.ts` — register POG doc type

**Frontend deliverables:**
- `client/src/pages/procurement-list-control-page.tsx`
- `client/src/components/po-group-wizard.tsx`
- `client/src/components/po-group-detail.tsx`
- `client/src/components/vendor-avl-panel.tsx`
- `client/src/components/plc-document-manager.tsx`
- `epc-buy-list-control-page.tsx` — PLC status column added
- Page permission seed: `procurement-list-control`

**Estimated scope:** ~2000 lines backend, ~1800 lines frontend. Single sprint.

---

### Phase 2 — RFQ / TBE / CBE (Bid Evaluation)

**Scope:** RFQ lifecycle, vendor quote upload, TBE report, CBE report, vendor comparison matrix, hard block on legacy routes.

**Schema deliverables:** `plc_rfq_records`, `plc_vendor_quotes`, `plc_tbe_records`, `plc_cbe_records`, RFQ doc sequence.

**Backend deliverables:** `server/plc-rfq-routes.ts`, `server/plc-evaluation-routes.ts`, hard block in `pppc-routes.ts`.

**Frontend deliverables:** RFQ panel, TBE/CBE board, vendor comparison matrix.

---

### Phase 3 — GRN / Inspection / NCR Integration

**Scope:** GRN recording, inspection linking, NCR traceability, stores acceptance, material issue (MIR), background qty recomputation, KPI dashboard, delivery calendar.

**Schema deliverables:** `plc_grn_records` and `plc_material_issues` routes activated; doc sequences: GRN, MIR.

**Backend deliverables:** `server/plc-grn-routes.ts`, `server/plc-material-issue-routes.ts`, background job: `plc_qty_recompute`.

**Frontend deliverables:** GRN panel, GRN dialog, inspection queue, KPI dashboard, delivery calendar.

---

### Phase 4 — SAP / Full Procurement Governance

**Scope:** SAP PO push, SAP GRN sync, reconciliation, rate contracts, materialized view for summary strip, full CSV export, archival automation.

**Schema deliverables:** SAP sync columns (§19e), `procurement_cockpit_summary` materialized view, `plc_rate_contract_refs`.

**Backend deliverables:** `server/plc-sap-routes.ts`, reconciliation engine, project closure automation, materialized view refresh scheduler.

**Frontend deliverables:** SAP sync panel, reconciliation diff report, rate contract locking, full export.

---

## 28. Rollback Strategy

This section defines how to reverse each layer of the PLC deployment if a critical defect is discovered in production.

### 28a. DB Rollback

Rollback is performed in strict reverse migration order. Each step is idempotent and safe to re-run.

**Step-by-step reversal (reverse of §7 migration execution order):**

```sql
-- Step 16: Remove backfill data (procurement_list_lines rows where is_legacy = false created after cutover)
-- NOTE: Only run if Phase 2 has NOT been activated. Legacy rows created by backfill are preserved.
DELETE FROM procurement_list_lines WHERE created_at > '[cutover_timestamp]' AND is_legacy = false;

-- Step 15–14: Unregister page permissions and doc sequences
DELETE FROM page_permissions WHERE permission_key = 'procurement-list-control';
DELETE FROM doc_sequences WHERE doc_type IN ('POG','GRN','MIR','RFQ');

-- Step 13–10: DROP the ALTER TABLE additions (in reverse)
ALTER TABLE non_conformance_reports
  DROP COLUMN IF EXISTS plc_line_id,
  DROP COLUMN IF EXISTS epc_po_id,
  DROP COLUMN IF EXISTS grn_record_id;

ALTER TABLE inspection_execution_records
  DROP COLUMN IF EXISTS plc_line_id,
  DROP COLUMN IF EXISTS grn_record_id;

ALTER TABLE epc_purchase_order_items
  DROP COLUMN IF EXISTS plc_line_id,
  DROP COLUMN IF EXISTS po_group_line_id,
  DROP COLUMN IF EXISTS planning_record_id,
  DROP COLUMN IF EXISTS buy_list_line_id,
  DROP COLUMN IF EXISTS qty_received;

ALTER TABLE epc_purchase_orders
  DROP COLUMN IF EXISTS po_group_id,
  DROP COLUMN IF EXISTS amendment_count,
  DROP COLUMN IF EXISTS current_amendment_id,
  DROP COLUMN IF EXISTS qty_ordered_total,
  DROP COLUMN IF EXISTS qty_received_total,
  DROP COLUMN IF EXISTS sap_po_doc_entry,
  DROP COLUMN IF EXISTS sap_po_doc_num,
  DROP COLUMN IF EXISTS sap_sync_status,
  DROP COLUMN IF EXISTS sap_sync_note,
  DROP COLUMN IF EXISTS sap_synced_at;
ALTER TABLE epc_purchase_orders ALTER COLUMN planning_record_id SET NOT NULL;

-- Step 9–1: DROP new tables in reverse dependency order
DROP TABLE IF EXISTS procurement_list_audit_log CASCADE;
DROP TABLE IF EXISTS plc_document_attachments CASCADE;
DROP TABLE IF EXISTS plc_material_issues CASCADE;
DROP TABLE IF EXISTS plc_grn_records CASCADE;
DROP TABLE IF EXISTS epc_po_amendments CASCADE;
DROP TABLE IF EXISTS epc_po_group_lines CASCADE;
DROP TABLE IF EXISTS epc_po_groups CASCADE;
DROP TABLE IF EXISTS procurement_list_lines CASCADE;
DROP TABLE IF EXISTS vendor_subgroup_qualification CASCADE;
DROP TABLE IF EXISTS procurement_cockpit_summary CASCADE;
```

**Safety rule:** DB rollback is only possible before Phase 2 hard-block activation. After Phase 2, live procurement data exists in the new tables and rollback requires a managed data-migration plan — not a simple DROP.

**Backup requirement:** A full PostgreSQL `pg_dump` snapshot must be taken immediately before Phase 1 migration begins. The dump is the recovery baseline.

---

### 28b. API / Routes Rollback

**Phase 1 (before Phase 2 hard-block):**
- Remove or comment out `server/procurement-list-routes.ts`, `server/vendor-qualification-routes.ts`, and `server/plc-grn-routes.ts` from `server/routes.ts` registrations.
- Revert the two modified `pppc-routes.ts` raise-pr handlers to their pre-PLC versions (restore from git tag `pre-plc-phase1`).
- Old downstream routes remain fully operational — soft deprecation headers are also removed.

**Phase 2+ (hard-block active):**
- Remove HTTP 423 guard from old routes (restore permissive behaviour).
- Keep PLC routes in place — they contain live procurement data.
- Mark affected routes as read-only by removing all write handlers and returning HTTP 410 with a migration notice.

---

### 28c. UI Rollback

**Feature flag approach:** A server-config boolean `PLC_ENABLED` (stored in `app_config` table, readable via `GET /api/config/plc-enabled`) gates all PLC UI entry points.

- `PLC_ENABLED = false`: The PLC cockpit link is hidden from navigation. The BUY List "Procurement" column reverts to the legacy procurement status link. No data is destroyed.
- `PLC_ENABLED = true`: Full PLC cockpit visible.
- The flag is checked at runtime in the React router — the `/epc/procurement-list-control` route renders a "Coming Soon" placeholder when disabled, not a 404.
- Rollback: set `PLC_ENABLED = false` via admin config panel. Zero downtime.

---

### 28d. Migration Rollback

**Backfill reversal:** The backfill endpoint (`POST /api/projects/:projectId/procurement-list/backfill`) is idempotent. Running it again after a partial failure is safe — it skips rows that already exist.

**If the backfill must be reversed** (pre-Phase 2 only):
```sql
-- Remove all backfill-created PLC records for a specific project
BEGIN;
DELETE FROM epc_po_group_lines
  WHERE po_group_id IN (SELECT id FROM epc_po_groups WHERE project_id = $1 AND is_legacy = true);
DELETE FROM epc_po_groups WHERE project_id = $1 AND is_legacy = true;
DELETE FROM procurement_list_lines WHERE project_id = $1;
COMMIT;
```

Each project's backfill can be reversed independently. Legacy `epc_purchase_orders` rows are unaffected (they are read-only cross-references).

---

### 28e. Legacy Fallback

**Condition for re-enabling legacy path:**
The legacy BUY List → PO chain can be re-enabled for a specific planning record by:
1. Cancelling or superseding the PLC line associated with that planning record (status → `cancelled`).
2. Once the PLC line is in a terminal status, the guard check (`SELECT 1 FROM procurement_list_lines WHERE planning_record_id = $1 AND status NOT IN ('cancelled','superseded')`) returns no rows.
3. The old downstream routes process the record normally.

This is intentional — it allows a graceful fallback for any individual line without rolling back the entire system.

**Global legacy re-enable:** Only available before Phase 2 activation. Controlled by the `PLC_ENABLED` feature flag and the soft/hard block setting in `pppc-routes.ts`. Document all records advanced via the legacy path during the fallback period and re-backfill them when PLC is re-enabled.

---

## 29. Zero-Trust Verification Checklist

This checklist is run against the production deployment after each phase launch. Every item must pass before the phase is declared complete.

### 29a. Quantity Integrity

**Check:** After any GRN creation, POG cancel, or PO amendment, run:
```sql
SELECT id, plc_number,
  qty_ordered,
  (SELECT COALESCE(SUM(line_qty),0) FROM epc_po_group_lines pgl
   JOIN epc_po_groups pg ON pg.id = pgl.po_group_id
   WHERE pgl.plc_line_id = plc.id AND pg.status NOT IN ('cancelled','rejected')) AS computed_ordered,
  qty_received,
  (SELECT COALESCE(SUM(accepted_qty),0) FROM plc_grn_records WHERE plc_line_id = plc.id) AS computed_received
FROM procurement_list_lines plc
WHERE project_id = $1
HAVING qty_ordered != computed_ordered OR qty_received != computed_received;
```
**Expected result:** Zero rows. Any row returned is a quantity integrity violation — investigate immediately before proceeding.

---

### 29b. Duplicate Prevention

**Check 1 — One active group per line:**
```sql
SELECT plc_line_id, COUNT(*) AS active_group_count
FROM epc_po_group_lines
WHERE is_active = true
GROUP BY plc_line_id
HAVING COUNT(*) > 1;
```
**Expected:** Zero rows.

**Check 2 — PLN uniqueness:**
```sql
SELECT planning_record_id, COUNT(*) AS plc_line_count
FROM procurement_list_lines
WHERE status NOT IN ('cancelled','superseded')
GROUP BY planning_record_id
HAVING COUNT(*) > 1;
```
**Expected:** Zero rows. One active PLC line per PLN is the invariant.

---

### 29c. Concurrency Locking

**Verify:** In a controlled two-browser test, simultaneously submit two PO Group creation requests selecting the same PLC line IDs. Confirm that exactly one succeeds with HTTP 201 and the other returns HTTP 409. Check `procurement_list_audit_log` shows only one `pog_created` event for the line.

**Advisory lock coverage:** All routes that mutate `epc_po_group_lines` must run `SELECT pg_advisory_xact_lock($plcLineId)` inside the transaction. Verify with a code review grep:
```bash
grep -n "pg_advisory_xact_lock" server/procurement-list-routes.ts
```
Expected: present in `POST /api/epc-po-groups` and `PATCH /api/epc-po-groups/:id/lines` handlers.

---

### 29d. SAP Reconciliation

**Check:** After every PO issue and every GRN in production, run:
```sql
SELECT id, po_number, sap_sync_status, sap_sync_note
FROM epc_purchase_orders
WHERE sap_sync_status IN ('error','mismatch')
ORDER BY updated_at DESC;
```
**Expected:** Zero rows in steady state. Any `error` row triggers the retry handler. Any `mismatch` row is escalated to Manager within 1 business day.

**Reconciliation diff check (weekly):** Run `POST /api/plc-sap/reconcile/:epcPoId` for all issued POs. Confirm zero quantity discrepancies.

---

### 29e. Datasheet Freeze

**Check:** For every PLC line in `po_issued` / `partially_received` / `fully_received` / `closed` status:
```sql
SELECT pgl.id, pgl.tech_attrs_frozen, pgl.datasheet_gcs_path_frozen, pgl.frozen_at
FROM epc_po_group_lines pgl
JOIN epc_po_groups pg ON pg.id = pgl.po_group_id
WHERE pg.status IN ('po_issued','partially_received','fully_received')
  AND (pgl.tech_attrs_frozen IS NULL OR pgl.datasheet_gcs_path_frozen IS NULL OR pgl.frozen_at IS NULL);
```
**Expected:** Zero rows. A null frozen field on an issued PO line is a critical data integrity defect.

---

### 29f. Audit Immutability

**Check 1 — No UPDATE on audit log:**
Verify that `procurement_list_audit_log` has no UPDATE trigger and no application route that issues an UPDATE on this table:
```bash
grep -rn "procurement_list_audit_log" server/ | grep -i "update\|UPDATE"
```
**Expected:** Zero matches (only INSERT is permitted).

**Check 2 — Row count monotonicity:** After any procurement action, the total row count of `procurement_list_audit_log` must be strictly greater than before. Never equal, never less.

**Check 3 — Row hash spot-check:** Periodically compute `MD5(performed_by::text || performed_at::text || event || payload::text)` for a random sample and compare against a stored digest log. Any mismatch indicates tampering.

---

### 29g. Permission Enforcement

**Check:** For every PLC API route, confirm the middleware chain includes the required guards. Test matrix:

| Route | Unauthenticated | Auth, no page access | Auth, page access, no Manager | Auth, page access, Manager |
|---|---|---|---|---|
| GET procurement-list | 401 | 403 | 200 | 200 |
| PATCH vendor-select | 401 | 403 | 403 | 200 |
| POST epc-po-groups | 401 | 403 | 403 | 201 |
| POST epc-po-groups/:id/approve | 401 | 403 | 403 | 200 |
| POST plc-grn | 401 | 403 | 200 | 200 |
| POST plc-grn/:id/accept-stores | 401 | 403 | 403 | 200 |

Automated test: Replay all mutating PLC routes with a non-Manager JWT and confirm 403 is returned for every Manager-gated route.

---

### 29h. Revision Governance

**Check:** After any BUY List line revision (new revision code created), confirm:
```sql
SELECT plc.id, plc.plc_number, plc.revision_action_required
FROM procurement_list_lines plc
WHERE plc.buy_list_revision_code != (
  SELECT revision_code FROM project_buy_list_headers WHERE id = plc.buy_list_header_id
)
  AND plc.status NOT IN ('cancelled','superseded','closed')
  AND plc.revision_action_required = 'none';
```
**Expected:** Zero rows. Any PLC line whose BUY List has been revised must have `revision_action_required` set.

---

### 29i. AVL Enforcement

**Check — soft enforcement:** For every POG creation where vendor is `unqualified` for one or more line subgroups, confirm:
- `over_procurement_approved = false` is NOT the issue — check AVL-specific bypass.
- `procurement_list_audit_log` contains an `avl_bypass_acknowledged` event with `performed_by` = Manager.

**Check — hard enforcement (Phase 2+):** Attempt to create a POG via API with an unqualified vendor for one of the lines. Confirm HTTP 422 with error body `{ "error": "avl_hard_block" }`.

---

### 29j. GRN / Inspection Traceability

**Check:** For every closed PLC line, verify at least one GRN record exists and `accepted_qty` is not null:
```sql
SELECT plc.id, plc.plc_number
FROM procurement_list_lines plc
WHERE plc.status = 'closed'
  AND NOT EXISTS (
    SELECT 1 FROM plc_grn_records grn
    WHERE grn.plc_line_id = plc.id
      AND grn.accepted_qty IS NOT NULL
  );
```
**Expected:** Zero rows (a line cannot be closed without a GRN with accepted qty).

**Inspection traceability check:** For every GRN where `inspection_required = true` and `inspection_waived = false`, confirm an `inspection_execution_records` row exists and is linked:
```sql
SELECT grn.id, grn.grn_number
FROM plc_grn_records grn
WHERE grn.inspection_required = true
  AND grn.inspection_waived = false
  AND grn.inspection_record_id IS NULL
  AND grn.inspection_status NOT IN ('pending','in_progress');
```
**Expected:** Zero rows.

---

## 30. Transaction Governance

### 30a. Fully Transactional APIs

These routes must execute all DB writes inside a single PostgreSQL transaction. A failure at any step must roll back the entire operation.

| Route | Writes Inside Transaction | Rollback Trigger |
|---|---|---|
| `POST /api/buy-list-lines/:id/raise-pr` | `item_planning_records` + `procurement_list_lines` + `procurement_list_audit_log` | Any insert failure |
| `POST /api/buy-lists/:id/bulk-raise-pr` | All PLN + PLC line rows in one transaction | Any single PLN/PLC insert failure |
| `POST /api/epc-po-groups` | `epc_po_groups` + `epc_po_group_lines` + `procurement_list_lines` status update + audit log | Any failure including advisory lock contention |
| `POST /api/epc-po-groups/:id/approve` | `epc_po_groups` status update + `epc_purchase_orders` creation + `epc_purchase_order_items` creation + audit log | PO or item creation failure |
| `POST /api/epc-po-groups/:id/issue-po` | EPC PO status update + spec snapshot freeze (`tech_attrs_frozen` / `datasheet_gcs_path_frozen`) + audit log | Snapshot freeze failure |
| `POST /api/epc-po-groups/:id/cancel` | POG status update + `epc_po_group_lines.is_active = false` + `procurement_list_lines` status revert + audit log | Any update failure |
| `POST /api/epc-po-groups/:id/reject` | Same as cancel | Same |
| `POST /api/plc-grn` | `plc_grn_records` creation + `procurement_list_lines` qty recompute + status update + audit log | GRN insert failure |
| `PATCH /api/plc-grn/:id/inspection-result` | GRN `accepted_qty` update + `procurement_list_lines` qty recompute + status check + audit log | Any update failure |
| `POST /api/epc-purchase-orders/:id/amend` | `epc_po_amendments` creation + EPC PO status → `under_amendment` + audit log | Any failure |
| Amendment issue | `epc_purchase_order_items` qty update + `epc_po_group_lines` qty update + `procurement_list_lines` qty recompute + amendment status → `issued` + audit log | Any failure |
| `POST /api/procurement-list-lines/:id/supersede` | PLC line status → `superseded` + POG line deactivation (if draft POG) + audit log | Any failure |

**Implementation pattern:**
```typescript
await db.transaction(async (tx) => {
  // all writes use tx, not db
  await tx.insert(...).values(...);
  await tx.update(...).set(...).where(...);
  await tx.insert(procurementListAuditLog).values(auditEntry);
  // if any throws, entire tx rolls back
});
```

---

### 30b. Advisory-Lock APIs

These routes use `pg_advisory_xact_lock` in addition to transaction wrapping to prevent concurrent race conditions.

| Route | Lock Key | Purpose |
|---|---|---|
| `POST /api/epc-po-groups` | Each `plcLineId` in ascending order | Prevent two POGs claiming the same line simultaneously |
| `PATCH /api/epc-po-groups/:id/lines` | Each `plcLineId` being added | Same as above |
| `POST /api/plc-grn` | `plcLineId` | Prevent concurrent GRNs from double-counting qty |
| `POST /api/projects/:projectId/procurement-list/qty-recompute` | `projectId` (as project-wide lock) | Prevent concurrent recomputes for the same project |
| `POST /api/buy-lists/:id/bulk-raise-pr` | `projectId` | Consistent with existing tag generation lock pattern |

**Lock acquisition pattern (same as tag generation):**
```typescript
await tx.execute(sql`SELECT pg_advisory_xact_lock(${lineId})`);
const fresh = await tx.select().from(procurementListLines)
  .where(eq(procurementListLines.id, lineId))
  .for('update')
  .limit(1);
// revalidate fresh.status and qty_balance before proceeding
```

---

### 30c. Partial-Failure Rollback Rules

| Scenario | What Happened | Recovery Action |
|---|---|---|
| POG created but some PLC line status updates failed | `epc_po_groups` row exists, some `procurement_list_lines` rows still show old status | Full transaction rollback prevents this. If row somehow committed (infrastructure fault), run qty-recompute + manual status correction via Admin panel |
| Bulk raise-PR: 8 of 10 PLN/PLC pairs inserted, then error | Transaction rolled back — 0 PLN/PLC rows committed | Re-run bulk raise-PR. Idempotent: skips lines already raised |
| GRN inserted but qty recompute failed | `plc_grn_records` row should not exist (tx rolled back). If it does (infrastructure fault), `qty_last_computed_at` will be stale | Admin runs manual qty-recompute for the project. GRN row remains but qty fields will be recomputed correctly |
| PO issue: EPC PO created but spec freeze failed | Transaction rolled back — EPC PO not issued. POG remains in `approved` status | Re-attempt `issue-po`. Idempotent check: if `frozen_at` is null on all lines, re-freeze and update status |
| SAP push partially wrote (SAP received data but THERMOPAC didn't get the `docEntry` response) | `sap_sync_status = 'error'` on the EPC PO | Run SAP reconcile to detect duplicate SAP PO. Manually record SAP `docEntry` via Admin panel. Do NOT re-push without reconciling first |

---

## 31. Failure Recovery

### 31a. Interrupted PO Issue

**Scenario:** The `POST /api/epc-po-groups/:id/issue-po` request times out or crashes mid-execution after the DB transaction committed but before the HTTP response was returned.

**Detection:** The POG remains in `po_issued` status (committed) but the client received no response. The user may retry.

**Recovery steps:**
1. The route is idempotent for retries: check `epc_po_groups.status`. If already `po_issued` and `epc_po_id` is set, return the existing EPC PO reference — no duplicate PO created.
2. Check `epc_po_group_lines.frozen_at` — if null on any line, trigger spec freeze only for unfrozen lines, then return success.
3. The `procurement_list_audit_log` shows whether the `po_issued` event was logged. If it was, the operation completed. Return the PO detail to the client.

**Guard:** The route begins with:
```typescript
const existingPog = await db.query.epcPoGroups.findFirst({ where: eq(..., pogId) });
if (existingPog.status === 'po_issued') {
  return res.json({ success: true, po: existingPo, message: 'Already issued' });
}
```

---

### 31b. SAP Sync Failure

**Scenario:** `POST /api/plc-sap/push-po/:epcPoId` fails mid-sync — THERMOPAC wrote the EPC PO but SAP returned an error or timed out.

**Detection:** `epc_purchase_orders.sap_sync_status = 'error'`, `sap_sync_note` contains the error detail.

**Recovery steps:**
1. Automatic retry: 3 attempts with exponential backoff (5s, 30s, 120s). Managed by the existing background job scheduler.
2. If all retries fail: a `high` priority notification is raised to all Managers.
3. Manual retry available via `POST /api/plc-sap/push-po/:epcPoId` (idempotent — checks SAP for existing PO by THERMOPAC reference before pushing a new one).
4. If SAP already received the push but failed to return `docEntry`: use the reconcile endpoint to locate the SAP PO by matching vendor + items + amount, then manually record the `docEntry` via Admin panel.
5. PLC module continues functioning normally while SAP sync is pending — SAP sync failure does not block GRN or inspection.

---

### 31c. GRN Failure

**Scenario:** `POST /api/plc-grn` fails after the challan has physically arrived and the storekeeper has already signed.

**Detection:** HTTP 500 returned to UI; no `plc_grn_records` row created (transaction rolled back).

**Recovery steps:**
1. Retry the GRN creation — the route is safe to retry (duplicate detection: if same `challan_number + plc_line_id + grn_date` already exists, return the existing GRN rather than creating a duplicate).
2. If the failure is due to a DB constraint (e.g., `epc_po_id` mismatch), the error message is surfaced to the UI with a specific field hint.
3. If the PLC line is in `under_amendment` status (GRNs blocked during amendment), the storekeeper is notified with a "GRN blocked — PO under amendment" message. GRN will be accepted immediately after the amendment is issued.

**Duplicate prevention on retry:**
```sql
SELECT id FROM plc_grn_records
WHERE plc_line_id = $1
  AND challan_number = $2
  AND grn_date = $3
LIMIT 1;
```

---

### 31d. Attachment Failure

**Scenario:** `POST /api/plc-documents/upload` fails after the file was written to GCS but before the `plc_document_attachments` DB record was created.

**Detection:** GCS object exists; no DB record. The file is effectively orphaned.

**Recovery steps:**
1. The upload route is structured as: GCS write first, then DB insert. If the DB insert fails, the GCS object is left in place (it is not deleted — GCS governance prohibits deletion).
2. Retry: the client re-uploads the file. SHA-256 duplicate detection identifies the same file content on the second upload. The route links to the existing GCS object (same `gcs_object_path`) and creates only the DB record.
3. For bulk orphan cleanup: an Admin maintenance route `POST /api/admin/plc-documents/reconcile-orphans` scans GCS objects under the `PROCUREMENT/DOCUMENTS/` prefix against the DB records and flags orphans for manual review.

---

### 31e. Recompute Failure

**Scenario:** The background `plc_qty_recompute` job fails for one or more PLC line IDs — qty fields are stale.

**Detection:** `procurement_list_lines.qty_last_computed_at` is older than the most recent `plc_grn_records.created_at` or `epc_po_group_lines.updated_at` for that line.

**Recovery steps:**
1. The cockpit UI checks `qty_last_computed_at` against a 5-minute staleness threshold. Stale qty fields are shown with an amber "Recalculating" badge, not the stale value.
2. The scheduler automatically retries the failed job at the next 60-second interval.
3. Manual recovery: `POST /api/projects/:projectId/procurement-list/qty-recompute` — recomputes all qty fields for all lines in the project, unconditionally.
4. The recompute job is wrapped in a try/catch per line ID. A failure on one line does not block recomputation of the others. The failed line ID is logged and retried independently.
5. In the extreme case where the scheduler is down: DB-level recompute via SQL:
```sql
UPDATE procurement_list_lines plc
SET
  qty_ordered = (SELECT COALESCE(SUM(pgl.line_qty),0)
    FROM epc_po_group_lines pgl
    JOIN epc_po_groups pg ON pg.id = pgl.po_group_id
    WHERE pgl.plc_line_id = plc.id AND pg.status NOT IN ('cancelled','rejected')),
  qty_received = (SELECT COALESCE(SUM(grn.accepted_qty),0)
    FROM plc_grn_records grn WHERE grn.plc_line_id = plc.id),
  qty_last_computed_at = NOW()
WHERE plc.project_id = $1;
```

---

## 32. Security Governance

### 32a. IDOR Prevention

**Risk:** A user with `procurement-list-control` page access for Project A attempts to access PLC lines from Project B by guessing IDs.

**Control — every single-entity GET and PATCH:**
```typescript
const line = await db.query.procurementListLines.findFirst({
  where: and(eq(procurementListLines.id, lineId), eq(procurementListLines.projectId, resolvedProjectId))
});
if (!line) return res.status(404).json({ error: 'not_found' });
```

`resolvedProjectId` is derived from the authenticated user's active project scope (same pattern as existing EPC routes). The user cannot supply a `projectId` that does not match their session project scope.

**Applies to:** Every route in §9 that operates on a single entity (GET, PATCH, POST by ID). All list routes already scope by `project_id` in the WHERE clause.

---

### 32b. Project Isolation

**Rule:** A user's session is bound to a project scope at authentication. PLC routes resolve `projectId` from the session, not from the request body or URL params, for all ownership checks.

**Implementation:**
```typescript
const sessionProjectId = req.user!.activeProjectId; // from session, not from req.params
```

For routes where `projectId` is in the URL (`/api/projects/:projectId/procurement-list`), the route middleware asserts:
```typescript
if (parseInt(req.params.projectId) !== req.user!.activeProjectId) {
  return res.status(403).json({ error: 'project_scope_mismatch' });
}
```

This prevents a user from switching their URL `projectId` to access another project's data even if they know the project ID.

---

### 32c. Attachment Authorization

**Rule:** Signed GCS URLs for procurement documents are generated on-demand only for the requesting user's project scope. The GCS path is never exposed directly — only the signed URL is returned.

**Control:**
1. The frontend never stores or constructs GCS paths. It calls `GET /api/plc-documents/:entityType/:entityId` to list attachments, which returns `attachment_id` values only (no paths).
2. To download, the frontend calls `GET /api/plc-documents/:attachmentId/signed-url`. The backend:
   - Verifies the attachment's `project_id` matches the session project scope.
   - Generates a 1-hour signed URL.
   - Returns only the signed URL — the `gcs_object_path` is never included in API responses.

**GCS bucket access:** The service account used by the Node.js backend has `storage.objectViewer` (read) on the procurement documents prefix. No direct user access to the GCS bucket is granted.

---

### 32d. Signed URL Expiry

**Policy:** All procurement document signed URLs expire in **1 hour** (3600 seconds). This is consistent with the existing EPC attachment pattern.

**Implementation:**
```typescript
const [url] = await storage.bucket(bucket).file(path).getSignedUrl({
  action: 'read',
  expires: Date.now() + 60 * 60 * 1000, // 1 hour
  version: 'v4'
});
```

**Download enforcement:** Signed URLs are not cached client-side. Each "View Document" or "Download" action fetches a fresh signed URL from the backend. This ensures revoked access (user role change, project scope change) takes effect within 1 hour at most, and immediately for new requests.

**Upload signed URLs:** For document uploads, a signed URL (`action: 'write'`) is issued with a 15-minute expiry. If the upload is not completed within 15 minutes, the client must request a new upload URL.

---

### 32e. Audit Tamper Protection

**Database-level controls:**
1. The `procurement_list_audit_log` table has no UPDATE or DELETE routes in any API file. Verified by: grep for any UPDATE/DELETE SQL targeting this table returns zero results in the codebase.
2. The PostgreSQL role used by the application (`app_user`) has INSERT-only privileges on `procurement_list_audit_log`. No UPDATE or DELETE is granted at the DB level.
3. The table has no `updated_at` column — there is no semantic path for an update.

**Application-level controls:**
4. The Drizzle ORM model for `procurement_list_audit_log` has no `.update()` method exposed in the storage interface — it is INSERT-only by design.
5. All audit entries include a `performed_by` FK (user ID) and `performed_at` timestamp (server time — never client-supplied).
6. The `payload` jsonb column captures a full snapshot of the entity state at the time of the event, enabling before/after comparison even if the parent row is subsequently status-updated.

**Spot-check procedure (monthly):**
- Select 50 random rows from `procurement_list_audit_log`.
- Verify `performed_by` and `performed_at` are non-null.
- Cross-reference `entity_id` + `event` with the expected history for that entity.

---

## 33. Dependency Matrix

### 33a. Schema Dependencies

```
vendor_subgroup_qualification
  └── (independent — only needs vendors + buy_subgroups)

procurement_list_lines
  └── item_planning_records
  └── project_buy_list_headers
  └── project_buy_list_lines
  └── buy_groups, buy_subgroups
  └── vendors, users, projects

epc_po_groups
  └── projects, vendors, users

epc_po_group_lines
  └── epc_po_groups
  └── procurement_list_lines
  └── users

epc_po_amendments
  └── epc_purchase_orders
  └── users

plc_grn_records
  └── procurement_list_lines
  └── epc_purchase_orders
  └── epc_po_group_lines
  └── inspection_execution_records (nullable FK)
  └── users, projects

plc_material_issues
  └── procurement_list_lines
  └── plc_grn_records
  └── users, projects

plc_document_attachments
  └── projects, users
  └── (entity_type + entity_id — polymorphic, no FK — by design)

procurement_list_audit_log
  └── projects, users
  └── (entity_type + entity_id — polymorphic)

ALTER epc_purchase_orders
  └── epc_po_groups (new FK)
  └── epc_po_amendments (new FK)

ALTER epc_purchase_order_items
  └── procurement_list_lines (new FK)
  └── epc_po_group_lines (new FK)

ALTER inspection_execution_records
  └── procurement_list_lines (new FK)
  └── plc_grn_records (new FK)

ALTER non_conformance_reports
  └── procurement_list_lines (new FK)
  └── epc_purchase_orders (new FK)
  └── plc_grn_records (new FK)
```

**Creation order must strictly follow the dependency tree above.** Attempting to create `epc_po_group_lines` before `epc_po_groups` and `procurement_list_lines` will fail with a FK violation.

---

### 33b. API Dependencies

| API Group | Depends On | Must Exist Before |
|---|---|---|
| Backfill (`/procurement-list/backfill`) | All new tables | All `GET` procurement-list routes |
| PLC line vendor-select | `vendor_subgroup_qualification` table | POG creation |
| POG create | `procurement_list_lines` (line status check) | POG approve |
| POG approve | `epc_po_groups` (status = draft/submitted) | POG issue-po |
| POG issue-po | `epc_purchase_orders` + spec freeze | GRN routes |
| GRN routes | `plc_grn_records` + issued EPC PO | Inspection routes, material issue |
| SAP push-po | Issued EPC PO | SAP pull-grn, reconcile |
| Qty-recompute | All GRN + POG data | KPI dashboard (accurate) |

---

### 33c. Route File Dependencies

| New Route File | Imports / Uses |
|---|---|
| `server/procurement-list-routes.ts` | `server/doc-sequence-service.ts`, `server/leave-service.ts` (no) — `server/tag-generation-service.ts` (lock pattern reference) |
| `server/vendor-qualification-routes.ts` | `shared/schema.ts` (vendor_subgroup_qualification table) |
| `server/plc-grn-routes.ts` | `server/procurement-list-routes.ts` (qty recompute helper) |
| `server/plc-sap-routes.ts` | Existing SAP B1 integration layer |
| `server/pppc-routes.ts` (modified) | `server/procurement-list-routes.ts` (PLC line auto-create on raise-pr) |

**Circular dependency check:** `procurement-list-routes.ts` must not import from `pppc-routes.ts`. The PLC line creation logic is extracted into a shared service function (`createPlcLineInTx`) that both files import from a new `server/plc-line-service.ts`. This prevents circular imports.

---

### 33d. UI Component Dependencies

| Component | Depends On |
|---|---|
| `ProcurementListControlPage` | `useQuery` `/api/projects/:id/procurement-list`, `PlcLineDetailDrawer`, `PoGroupWizard` |
| `PoGroupWizard` | `useQuery` `/api/projects/:id/procurement-list/po-eligibility`, `VendorAvlPanel` |
| `PoGroupDetailPanel` | `useQuery` `/api/epc-po-groups/:id` |
| `PlcLineDetailDrawer` | Multiple linked entity queries (PLN, POG, EPC PO, GRN, inspection) |
| `GrnRecordDialog` | `useQuery` `/api/epc-purchase-orders/:id` (to validate PO exists and is issued) |
| `PlcDocumentManager` | `useQuery` `/api/plc-documents/:entityType/:entityId`, signed URL fetch |
| `VendorAvlPanel` | `useQuery` `/api/vendors/:id/qualification` |

---

### 33e. Implementation Order

The correct implementation order across all phases, respecting all dependencies:

```
Phase 1:
  1. shared/schema.ts additions (new tables, alter table types)
  2. server/plc-line-service.ts (shared service for PLC line creation)
  3. server/procurement-list-routes.ts (all PLC + POG + EPC PO routes)
  4. server/vendor-qualification-routes.ts
  5. server/pppc-routes.ts (raise-pr modification)
  6. server/doc-sequence-service.ts (POG registration)
  7. server/routes.ts (register all new route files)
  8. DB migration (drizzle push or raw SQL in migration order)
  9. Page permission seed
  10. client/src/pages/procurement-list-control-page.tsx
  11. client/src/components/po-group-wizard.tsx
  12. client/src/components/po-group-detail.tsx
  13. client/src/components/plc-document-manager.tsx
  14. client/src/components/vendor-avl-panel.tsx
  15. client/src/components/plc-line-detail-drawer.tsx
  16. client/src/App.tsx (register new route)
  17. Navigation update (sidebar/menu)
  18. epc-buy-list-control-page.tsx (PLC status column)
  19. Backfill execution (manual trigger post-deploy)

Phase 2:
  20. shared/schema.ts additions (RFQ, TBE, CBE tables)
  21. server/plc-rfq-routes.ts
  22. server/plc-evaluation-routes.ts
  23. Hard block activation in pppc-routes.ts
  24. RFQ/TBE/CBE UI components

Phase 3:
  25. server/plc-grn-routes.ts
  26. server/plc-material-issue-routes.ts
  27. Background job: plc_qty_recompute
  28. GRN + inspection queue UI
  29. KPI dashboard panel + delivery calendar

Phase 4:
  30. server/plc-sap-routes.ts
  31. Materialized view: procurement_cockpit_summary
  32. Materialized view refresh scheduler
  33. SAP sync + reconciliation UI
  34. CSV export
  35. Project closure automation
```

---

## 34. Production Cutover Strategy

### 34a. Deployment Sequence

```
T-2 weeks   Phase 0 audit SQL run on production DB → counts reviewed by management
T-1 week    Phase 1 schema migration tested end-to-end on staging
T-3 days    All Phase 1 code reviewed, tested, and merged to main
T-1 day     Production pg_dump snapshot taken and stored in GCS cold storage
T-day       Maintenance window announced (1-hour window, off-peak hours)

Cutover steps (in order):
  Step 1:  Set maintenance mode ON (read-only banner in UI, no new procurement actions)
  Step 2:  Run Phase 1 schema migrations on production DB (estimated: 2–5 minutes)
  Step 3:  Verify migration with post-migration check SQL:
             SELECT table_name FROM information_schema.tables WHERE table_name IN (...)
  Step 4:  Deploy new application code (Node.js + React bundle)
  Step 5:  Set PLC_ENABLED = true in app_config
  Step 6:  Run backfill for all active projects:
             POST /api/projects/:id/procurement-list/backfill (per project, serialized)
  Step 7:  Verify backfill counts match Phase 0 audit counts
  Step 8:  Run Zero-Trust Verification Checklist §29 items a–c (quantity + duplicate + permission)
  Step 9:  Set maintenance mode OFF
  Step 10: Monitor error rate for 30 minutes before declaring cutover complete
```

---

### 34b. Migration Execution

**Tooling:** Drizzle ORM `drizzle-kit push:pg` for new table creation where possible. For ALTER TABLE statements on existing tables, raw SQL is safer — execute via `psql` or the existing DB management panel.

**Execution log:** Every SQL statement is logged with timestamp, statement, and row count affected. Log stored in `procurement_list_audit_log` under entity_type = `system_migration`, entity_id = 0.

**Estimated migration duration:**

| Step | Duration |
|---|---|
| CREATE 9 new tables + indexes | ~30 seconds |
| ALTER TABLE epc_purchase_orders | ~5 seconds (adds columns, no data rewrite) |
| ALTER TABLE epc_purchase_order_items | ~5 seconds |
| ALTER TABLE inspection_execution_records | ~5 seconds |
| ALTER TABLE non_conformance_reports | ~5 seconds |
| Backfill (100 projects, 500 PLN each) | ~10 minutes |

**Total estimated window:** 15–20 minutes including verification.

---

### 34c. User Transition

**Communication plan:**
1. **1 week before:** Email to all Procurement users explaining the new PLC module — what changes and what stays the same.
2. **3 days before:** Training session (screen-share) covering the POG wizard and cockpit.
3. **Day of cutover:** In-app notification to all Procurement users: "Procurement List Control is now live. Your existing procurement lines have been migrated."

**Legacy UI retirement:**
- "Start Preparation" button on the planning record page: hidden when `plc_line_id` exists (Phase 1).
- "Create PO" button on the old po_preparation flow: hidden when `plc_line_id` exists (Phase 1).
- Full retirement (Phase 3): buttons removed entirely; page shows read-only legacy data only.

**Training materials:** A condensed 2-page quick-reference guide covering: (1) How to find your PLC cockpit, (2) How to create a PO Group, (3) How to record a GRN.

---

### 34d. Legacy Shutdown

**Schedule:**
- **Phase 1 (cutover day):** Legacy path soft-blocked for new PLC lines. Old records in flight continue.
- **Phase 2 (4 weeks after Phase 1 stable):** Hard block. No new records via legacy path. All users confirmed on PLC path.
- **Phase 3 (8 weeks after Phase 1):** Legacy UI routes removed. `procurement_execution_records` and `po_preparation_records` tables set to read-only (REVOKE INSERT, UPDATE, DELETE from app_user at DB level).
- **Phase 4 (6 months after Phase 1):** Tables archived to a separate `_archive` schema or exported to Parquet in GCS cold storage. Optionally retained in DB as read-only historical references.

---

### 34e. Production Verification

**Immediately after cutover (within 30 minutes):**
- [ ] Run Zero-Trust §29a (qty integrity) — expected: zero violation rows
- [ ] Run Zero-Trust §29b (duplicate prevention) — expected: zero violation rows
- [ ] Run Zero-Trust §29g (permission enforcement) — expected: all permission tests pass
- [ ] Open PLC cockpit for the 3 most active projects — confirm lines loaded, summary strip shows correct totals
- [ ] Create one test POG (draft only, do not approve) — confirm POG number generated correctly
- [ ] Cancel the test POG — confirm lines released back

**24 hours after cutover:**
- [ ] Zero SAP sync errors for any POs issued during the window
- [ ] Backfill row counts match Phase 0 audit counts exactly
- [ ] No support tickets related to "PO can't be created" (legacy block working correctly)
- [ ] `procurement_list_audit_log` showing correct events for all transactions made since cutover

---

## 35. Phase-Wise UI Creation Plan

This section is the complete specification for every UI element to be built, modified, or retired across all four phases.

### 35a. New Pages

| Page | File | Route | Phase |
|---|---|---|---|
| Procurement List Control Cockpit | `client/src/pages/procurement-list-control-page.tsx` | `/epc/procurement-list-control` | 1 |
| (Vendor AVL is a panel on the existing Vendor Master page — no new page needed) | — | — | 1 |

**ProcurementListControlPage layout:**
- Full-width container, same shell as BUY List Control page
- Project selector at top (same `ProjectSelector` component used elsewhere)
- Summary strip below project selector (6 stat cards: Total | Pending | In Progress | PO Issued | Received | Closed)
- Qty alert strip: Required | Ordered | Balance | Over-procured (red if > 0) | Overdue (amber if > 0)
- Tabbed panel below: [Procurement Lines] [PO Groups] [GRN Tracking (Phase 3)] [KPI Dashboard (Phase 3)] [Bid Evaluation (Phase 2)]
- Default tab: Procurement Lines

---

### 35b. New Dialogs

| Dialog | Component File | Trigger | Phase |
|---|---|---|---|
| PO Group Wizard (multi-step) | `client/src/components/po-group-wizard.tsx` | "Create PO Group" button in bulk toolbar | 1 |
| PO Group Detail Panel | `client/src/components/po-group-detail.tsx` | Click on POG number in PO Groups tab | 1 |
| PLC Line Detail Drawer | `client/src/components/plc-line-detail-drawer.tsx` | Click on PLC No in lines table | 1 |
| GRN Record Dialog | `client/src/components/grn-record-dialog.tsx` | "Record GRN" button on issued PO | 3 |
| Material Issue Dialog | `client/src/components/material-issue-dialog.tsx` | "Issue Material" button on received GRN | 3 |
| PO Amendment Dialog | `client/src/components/po-amendment-dialog.tsx` | "Amend PO" button on issued PO | 1 |
| Over-Procurement Approval Dialog | Inline in cockpit | Auto-shown when qty_ordered would exceed qty_required | 1 |
| Vendor AVL Bypass Acknowledgement | Inline in PO Group Wizard Step 1 | Auto-shown when unqualified vendor selected | 1 |
| SAP Reconciliation Report | `client/src/components/sap-reconcile-dialog.tsx` | "Reconcile" button on PO detail | 4 |

**PO Group Wizard — Step Detail:**

*Step 1 — Vendor & AVL:*
- Vendor dropdown (existing vendor master)
- Real-time AVL status badge per subgroup of selected lines: green (qualified), amber (conditional), red (unqualified/suspended)
- If any red: amber warning banner with checkbox "I acknowledge this vendor is not AVL-qualified for [subgroup] — proceeding with Manager responsibility"
- Manager role required to acknowledge and continue

*Step 2 — Line Review:*
- Table: PLC No | Tag No | Subgroup | Qty Required | Qty Balance | Line Qty (editable) | Unit Rate (INR, editable) | Line Notes
- Real-time qty validation: line qty > qty_balance → red highlight + error message
- Running total: Total Amount (INR)

*Step 3 — PO Header:*
- Required Delivery Date (date picker, DD/MM/YYYY)
- Payment Terms (text)
- Delivery Terms (text)
- Delivery Address (textarea, pre-filled from project)
- Warranty Terms (text)
- PO Notes (textarea)

*Step 4 — Confirm:*
- Summary: Vendor | Lines | Total Amount | Delivery Date
- AVL bypass acknowledgements listed if any
- "Create PO Group" button (disabled until all required fields present)
- POG number shown on success (generated by server)

---

### 35c. New Tables / Grids

| Grid | Location | Columns | Phase |
|---|---|---|---|
| Procurement Lines Table | ProcurementListControlPage — "Procurement Lines" tab | PLC No, Tag No, Group, Subgroup, Description, Qty Reqd, Qty Ordered, Qty Rcvd, Qty Balance, Status badge, Vendor, AVL badge, POG No, EPC PO No, Priority, Flags, Actions | 1 |
| PO Groups Table | ProcurementListControlPage — "PO Groups" tab | POG No, Vendor, Lines, Total Ordered Qty, Total Amount, Status badge, Submitted By, Approved By, EPC PO No, Actions | 1 |
| POG Lines Sub-table | Inside PO Group Detail Panel | Line No, PLC No, Tag No, Subgroup, Line Qty, Line Qty Rcvd, Unit Rate, Amount, Status, Spec Frozen badge | 1 |
| GRN Records Table | ProcurementListControlPage — "GRN Tracking" tab | GRN No, Date, PLC No, Tag No, Vendor, Challan No, GRN Qty, Accepted Qty, Condition, Inspection Status, SAP Status, Actions | 3 |
| Inspection Queue Table | Inside GRN Tracking tab (sub-view) | GRN No, Tag No, Received Date, Days Pending, Condition, Inspector Assigned | 3 |
| Vendor AVL Table | Vendor Master page — new "AVL Qualification" tab | Subgroup, Status badge, Performance Score, Valid Until, Annual Review Due, Last NCR, Actions | 1 |
| Amendment History Table | Inside PLC Line Detail Drawer — "PO Amendments" section | Amendment No, Type, Status, Change Summary, Submitted By, Approved By, Date | 1 |

**Procurement Lines Table detail:**
- Row styles: amber for `revision_action_required != 'none'`, red for `required_by_date < today AND status NOT IN (fully_received, closed)`, green for `closed`
- Multi-select checkboxes (leading column)
- Sticky header, virtualized scrolling for > 100 rows
- Column visibility toggle (user-configurable, persisted to localStorage)
- Sort: click any column header; server-side sort applied
- Filter bar above table: Status multiselect | Subgroup multiselect | Vendor dropdown | Priority | AVL status | Date range for required_by_date

---

### 35d. Dashboard Sections

| Section | Location | Content | Phase |
|---|---|---|---|
| Summary Strip | Top of ProcurementListControlPage | 6 stat cards + qty strip | 1 |
| Project Procurement Health | KPI Dashboard tab | Completion %, delay count, over-procurement flag, NCR count — 4 stat cards | 3 |
| Vendor Scorecard | KPI Dashboard tab | Table: Vendor, Orders, NCRs, Score, Status | 3 |
| PO Aging Report | KPI Dashboard tab | Table: PO No, Vendor, Age (days), Amount, Status | 3 |
| Delivery Calendar | KPI Dashboard tab | Gantt-style: PLC lines sorted by required_by_date, color-coded (green/amber/red by risk) | 3 |
| GRN Inspection Queue | GRN Tracking tab | Table sorted by days pending, with "Assign Inspector" action | 3 |
| SAP Sync Status Panel | PO Detail (inside PLC Line Detail Drawer) | Sync status badge, SAP doc entry, last synced at, retry button | 4 |

---

### 35e. Workflow Screens

| Workflow | UI Implementation | Phase |
|---|---|---|
| Raise PR → PLC line auto-created | Handled server-side; BUY List control page shows PLC No in the new "Procurement" column after raise | 1 |
| POG Draft → Submit → Approve → Issue PO | Status transitions triggered via action buttons in PO Group Detail Panel; each transition shows confirmation dialog | 1 |
| PO Amendment initiation and approval | PO Amendment Dialog; approval action in PLC Line Detail Drawer | 1 |
| GRN Record → Inspection → Stores Accept | GRN Record Dialog → inspection result linked by Quality module → Stores Accept button in GRN detail | 3 |
| Vendor AVL Qualification | Vendor Master — AVL tab — Add/Update/Suspend qualification via form dialog | 1 |
| Project Closure Checklist | Project settings page — new "Procurement Closure Checklist" panel showing open PLC lines requiring action | 3 |

---

### 35f. Tabs / Panels

| Tab / Panel | Parent Component | Content | Phase |
|---|---|---|---|
| "Procurement Lines" tab | ProcurementListControlPage | Main procurement lines grid + bulk toolbar + filter bar | 1 |
| "PO Groups" tab | ProcurementListControlPage | POG table + "Create PO Group" button | 1 |
| "Bid Evaluation" tab | ProcurementListControlPage | RFQ list + TBE/CBE board | 2 |
| "GRN Tracking" tab | ProcurementListControlPage | GRN table + Inspection Queue sub-panel | 3 |
| "KPI Dashboard" tab | ProcurementListControlPage | 5 dashboard sections (§35d) | 3 |
| "PLC History" section | PlcLineDetailDrawer | Full event timeline: PLN creation → PLC creation → vendor selection → POG → PO → GRN → inspection | 1 |
| "Specification" section | PlcLineDetailDrawer | Technical attributes snapshot + "Spec at issue" (if PO issued) + revision alert banner | 1 |
| "Documents" section | PlcLineDetailDrawer | PlcDocumentManager embedded | 1 |
| "AVL Qualification" tab | Vendor Master page (existing) | VendorAvlPanel — subgroup qualification table | 1 |
| "Amendments" section | PlcLineDetailDrawer | Amendment history table | 1 |

---

### 35g. Existing Page Modifications

| Existing Page | Modification | Phase |
|---|---|---|
| `epc-buy-list-control-page.tsx` | Add "Procurement" column to lines table showing: PLC status badge, PLC No (link to cockpit), POG No, EPC PO No | 1 |
| `epc-buy-list-control-page.tsx` | Add amber row highlight for lines where BUY list has been revised after PR raise (PLC `revision_action_required != 'none'`) | 1 |
| Vendor Master page | Add "AVL Qualification" tab with VendorAvlPanel | 1 |
| Project settings / Project detail page | Add "Procurement Closure Checklist" panel (Phase 3) | 3 |
| Planning Record detail (if page exists) | Add "PLC Line" section showing linked PLC line number, status, POG number | 1 |
| Old procurement execution page (if navigable) | Show deprecation banner: "This record is managed by Procurement List Control. [View in PLC Cockpit]" | 1 |

---

### 35h. Navigation / Menu Changes

| Change | Location | Phase |
|---|---|---|
| Add "Procurement List Control" link to EPC sidebar | `client/src/components/sidebar.tsx` or equivalent | 1 |
| Position: below "BUY List Control", above "Document Control" | EPC module section | 1 |
| Icon: `ClipboardList` from lucide-react | Sidebar link | 1 |
| Permission gate: only visible if user has `procurement-list-control` page access | Sidebar link render logic | 1 |
| Breadcrumb update: "EPC > Procurement List Control" | ProcurementListControlPage header | 1 |

---

### 35i. Permission Changes

| Permission | Type | Affected Users | Phase |
|---|---|---|---|
| `procurement-list-control` (new page permission) | Page-level access | Assigned to Procurement role + Superuser | 1 |
| Manager guard on all write actions (POG create, approve, reject, vendor select, cancel, supersede, close) | Route-level | Only Manager role + Superuser can execute | 1 |
| Admin-only: `POST /api/admin/plc-documents/reconcile-orphans` | Admin route | Superuser only | 1 |
| `vendor-qualification-admin` (optional sub-permission for AVL management) | Sub-permission | Procurement Admin or Manager | 1 |
| SAP sync routes: Manager + SAP integration role | Route-level guard | Phase 4 only | 4 |

**Permission seeding (Phase 1 migration script):**
```sql
INSERT INTO page_permissions (permission_key, display_name, description)
VALUES ('procurement-list-control', 'Procurement List Control', 'Access to the PLC cockpit, POG management, vendor selection, and GRN recording')
ON CONFLICT (permission_key) DO NOTHING;
```

---

### 35j. Mobile / Responsive Considerations

The PLC cockpit is a complex data-dense page primarily used on desktop. However, the following elements must be responsive for tablet and mobile access:

| Element | Desktop | Tablet (md: 768px) | Mobile (sm: 640px) |
|---|---|---|---|
| Summary strip | 6 stat cards in a row | 3+3 grid | 2+2+2 grid |
| Procurement Lines Table | All columns visible | Hide: AVL badge, PO Line Ref, Flags — show column toggle | Card view (each row expands to a card) |
| PO Groups Table | All columns visible | Hide: Submitted By, Approved By | Card view |
| PO Group Wizard | Full 4-step wizard | Same — wizard fits tablet | Full-screen modal; steps scrollable |
| PlcLineDetailDrawer | Side drawer (400px) | Bottom sheet (60vh) | Full-screen modal |
| GRN Record Dialog | Standard dialog (480px) | Same | Full-screen modal |
| Vendor AVL Panel | Table | Table (narrower) | Stacked cards |
| Summary strip qty alerts | Inline row | Wrapped | Stacked |

**Touch targets:** All action buttons in tables have a minimum 44px touch target on mobile. Row-tap on mobile opens the line drawer (replaces hover-based actions).

**Data entry on mobile:** The GRN Record Dialog and PO Group Wizard are designed to be usable on a tablet in landscape mode for storekeeper field use. Date pickers use native mobile inputs (`<input type="date">`). Quantity inputs use `inputmode="decimal"`.

---

## 36. UI Delivery by Phase

### 36a. Phase 1 UI (Core MVP)

**Delivered in Phase 1:**

*New pages:*
- `procurement-list-control-page.tsx` — full cockpit with "Procurement Lines" and "PO Groups" tabs, summary strip, qty strip, filter bar, bulk toolbar

*New dialogs / drawers:*
- `po-group-wizard.tsx` — 4-step wizard (vendor AVL, line qty, PO header, confirm)
- `po-group-detail.tsx` — POG detail panel with approval actions and line table
- `plc-line-detail-drawer.tsx` — full history drawer with timeline, spec section, documents section, amendments section
- `po-amendment-dialog.tsx` — amendment initiation and tracking
- `plc-document-manager.tsx` — document upload/view per entity
- `vendor-avl-panel.tsx` — AVL qualification management (embedded in Vendor Master)
- Inline: over-procurement approval dialog, AVL bypass acknowledgement

*New tables / grids:*
- Procurement Lines Table (full column set, filter bar, multi-select, sort)
- PO Groups Table
- POG Lines Sub-table (inside PO Group Detail)
- Vendor AVL Table (inside Vendor Master)
- Amendment History Table (inside PLC Line Detail Drawer)

*Dashboard sections:*
- Summary Strip (6 stat cards)
- Qty Alert Strip

*Tabs / panels:*
- "Procurement Lines" tab
- "PO Groups" tab
- All sections inside PlcLineDetailDrawer (History, Specification, Documents, Amendments)
- "AVL Qualification" tab on Vendor Master

*Existing page modifications:*
- BUY List Control: "Procurement" column added to lines table
- BUY List Control: amber row highlight for revision alerts
- Vendor Master: AVL tab added
- Old procurement execution page: deprecation banner

*Navigation:*
- Sidebar "Procurement List Control" link added

*Permissions:*
- `procurement-list-control` page permission seeded
- All Manager guards active on write routes

---

### 36b. Phase 2 UI (Bid Evaluation)

**Delivered in Phase 2 (incremental, no Phase 1 changes needed):**

*New tabs / panels:*
- "Bid Evaluation" tab on ProcurementListControlPage with sub-panels:
  - RFQ Management: RFQ list table, "Create RFQ" button, RFQ detail with document attachments
  - Vendor Quote Comparison: multi-vendor quote matrix per PLC line (scores, price, delivery)
  - TBE Board: TBE records per line, TBE report upload, recommended vendor
  - CBE Board: CBE records per line, final vendor selection workflow

*New dialogs:*
- `rfq-create-dialog.tsx` — RFQ creation with line selection and document upload
- `vendor-quote-dialog.tsx` — quote entry per vendor per RFQ
- `tbe-dialog.tsx` — TBE report upload and score entry
- `cbe-dialog.tsx` — CBE record and final price comparison

*New tables / grids:*
- RFQ Table (in Bid Evaluation tab)
- Vendor Quote Comparison Matrix (pivot table: lines vs vendors)
- TBE Score Table
- CBE Score Table

*Existing page modifications:*
- PLC Line status badge: add `pending_rfq`, `rfq_issued`, `rfq_closed`, `tbe_in_progress`, `cbe_in_progress` badge variants

*No navigation changes (tab added to existing page).*

*Hard-block notification banner:* When a user attempts the old procurement execution path post-Phase 2, the UI shows: "This procurement path has been retired. Please use Procurement List Control." (replaces the soft deprecation banner from Phase 1).

---

### 36c. Phase 3 UI (GRN / Inspection / KPI)

**Delivered in Phase 3 (incremental):**

*New tabs / panels:*
- "GRN Tracking" tab on ProcurementListControlPage:
  - GRN Records Table
  - Inspection Queue sub-panel
- "KPI Dashboard" tab on ProcurementListControlPage:
  - Project Procurement Health (4 stat cards)
  - Vendor Scorecard table
  - PO Aging Report table
  - Delivery Calendar (Gantt-style, sortable by required date)
  - GRN Inspection Queue (days pending, assignee)

*New dialogs:*
- `grn-record-dialog.tsx` — GRN entry (challan, qty, condition, inspection flag)
- `material-issue-dialog.tsx` — material issue (MIR) entry
- Inline: stores acceptance confirmation dialog, inspection waiver dialog

*New tables / grids:*
- GRN Records Table
- Inspection Queue Table
- Material Issue History Table (inside PlcLineDetailDrawer — new "Stores" section)

*Existing page modifications:*
- PlcLineDetailDrawer: add "GRN History" section, "Material Issues" section
- Project settings: add "Procurement Closure Checklist" panel for project closure workflow

*Performance indicators:*
- Delivery Calendar cells color-coded: green (> 14 days ahead), amber (< 14 days), red (overdue)
- KPI stat cards use Recharts (existing in codebase) for mini trend charts where useful

---

### 36d. Phase 4 UI (SAP / Full Governance)

**Delivered in Phase 4 (incremental):**

*New panels:*
- SAP Sync Status Panel (inside PlcLineDetailDrawer — new "SAP Integration" section):
  - Sync status badge (pending / synced / mismatch / error)
  - SAP PO doc entry + doc number
  - Last synced timestamp
  - "Retry Sync" button (Manager)
  - "Reconcile" button (Manager)
- SAP Reconciliation Report (modal/dialog):
  - Side-by-side: THERMOPAC qty fields vs SAP qty fields per line
  - Discrepancy rows highlighted in red
  - "Accept SAP" / "Accept THERMOPAC" resolution actions per discrepancy

*New dialogs:*
- `sap-reconcile-dialog.tsx` — reconciliation diff report with resolution actions
- Rate Contract locking modal (in Vendor Selection step of PO Group Wizard — new sub-step between Step 1 and Step 2)

*New tables / grids:*
- SAP Sync Status Summary Table (in KPI Dashboard tab) — all EPC POs with sync status and age

*Existing component modifications:*
- PO Group Wizard: add Rate Contract selection sub-step (Phase 4)
- PLC Cockpit summary strip: "SAP Sync Errors" alert card added
- KPI Dashboard: add SAP reconciliation health card

*Full CSV export:*
- "Export" button in the Procurement Lines Table toolbar (all filtered lines, all columns)
- Export includes all qty fields, status, vendor, POG No, EPC PO No, required date, GRN summary
- Streaming response — no in-memory full load

*Archival automation:*
- Project Closure Checklist (from Phase 3) updated: auto-cancel of draft/submitted POGs shown with confirmation; issued POs still require manual Manager action

---

## Approval Checklist

Before implementation of any phase begins, the following must be confirmed by THERMOPAC management:

**Governance decisions:**
- [ ] Phase 0 pre-migration SQL report reviewed and record counts accepted
- [ ] `avl_enforcement_level` starting value confirmed (`advisory` / `soft` / `hard`)
- [ ] Over-procurement block threshold confirmed (default: block at 0% over)
- [ ] Performance score thresholds confirmed (default: review at 60, suspend at 40)
- [ ] SAP sync pattern confirmed for GRN (Pattern A or Pattern B per project)
- [ ] Notification recipients confirmed (Procurement Manager role / specific users)

**Security and rollback:**
- [ ] Rollback window confirmed (Phase 2 hard-block is the point of no-return for simple DB rollback)
- [ ] Production pg_dump snapshot schedule confirmed (at minimum: before Phase 1 migration, before Phase 2 activation)
- [ ] `PLC_ENABLED` feature flag approach approved for UI rollback control

**Implementation scope:**
- [ ] Phase 1 implementation scope approved
- [ ] Phase 2 start date and scope approved (separate approval before Phase 2 begins)
- [ ] Phase 3 start date and scope approved (separate approval)
- [ ] Phase 4 start date and scope approved (separate approval)

**Cutover:**
- [ ] Maintenance window timing confirmed
- [ ] User training schedule confirmed
- [ ] Baseline document reviewed, all sections accepted
- [ ] Baseline document formally signed off

---

## Document Statistics

**Saved as:** `docs/procurement-list-control-baseline-v1.md`  
**Supersedes:** `docs/procurement-list-control-baseline-v1.0.md`  
**Version:** Final (v1.0 FINAL)  
**Date:** 13 May 2026

### Section Inventory

| # | Section Title | Lines (approx) |
|---|---|---|
| 1 | Purpose and Scope | 17 |
| 2 | Final Lifecycle Diagram | 60 |
| 3 | Final Quantity Flow Diagram | 60 |
| 4 | Final Numbering Architecture | 20 |
| 5 | Source-of-Truth Ownership Matrix | 20 |
| 6 | Blocking the Direct BUY List → PO Path | 30 |
| 7 | Migration Strategy | 55 |
| 8 | DB / Schema Changes (Complete) | 230 |
| 9 | API / Routes (Complete) | 80 |
| 10 | UI / Pages / Components | 50 |
| 11 | Line Status Lifecycle | 22 |
| 12 | Duplicate Prevention Logic | 20 |
| 13 | Concurrency and Transaction-Locking Governance | 25 |
| 14 | Quantity Ownership and Flow | 40 |
| 15 | BUY List Revision Governance | 45 |
| 16 | Superseded PLC Line Rules | 25 |
| 17 | AVL Governance | 35 |
| 18 | PO Amendment / Revision Workflow | 35 |
| 19 | SAP Integration Governance | 60 |
| 20 | Document Attachment Governance | 35 |
| 21 | Notification / Event Governance | 25 |
| 22 | Dashboard / KPI Governance | 40 |
| 23 | Archival and Closure Governance | 45 |
| 24 | Large-Project Performance Governance | 50 |
| 25 | Technical Datasheet / Specification Freeze Governance | 35 |
| 26 | Future Traceability Design | 40 |
| 27 | Implementation Phase Breakdown | 75 |
| 28 | Rollback Strategy | 105 |
| 29 | Zero-Trust Verification Checklist | 100 |
| 30 | Transaction Governance | 80 |
| 31 | Failure Recovery | 90 |
| 32 | Security Governance | 90 |
| 33 | Dependency Matrix | 105 |
| 34 | Production Cutover Strategy | 90 |
| 35 | Phase-Wise UI Creation Plan | 150 |
| 36 | UI Delivery by Phase | 110 |
| — | Approval Checklist | 25 |
| — | Document Statistics (this section) | 50 |
| **Total** | | **~2,259 lines** |

### Schema Inventory

**New tables (9):**
1. `procurement_list_lines` — 58 columns
2. `epc_po_groups` — 28 columns
3. `epc_po_group_lines` — 18 columns
4. `epc_po_amendments` — 18 columns
5. `vendor_subgroup_qualification` — 22 columns
6. `plc_grn_records` — 26 columns
7. `plc_material_issues` — 12 columns
8. `plc_document_attachments` — 15 columns
9. `procurement_list_audit_log` — 10 columns

**Altered tables (4):**
1. `epc_purchase_orders` — +6 PLC columns, +5 SAP columns, planning_record_id made nullable
2. `epc_purchase_order_items` — +5 columns
3. `inspection_execution_records` — +2 columns
4. `non_conformance_reports` — +3 columns

**Indexes (16):**
- 6 on `procurement_list_lines`
- 1 unique partial index `uq_plc_line_one_active_group` on `epc_po_group_lines`
- 2 on `epc_po_group_lines`
- 3 on `plc_grn_records`
- 1 on `procurement_list_audit_log`
- 3 additional covering indexes for cockpit queries

**Future tables (Phase 2+, designed not yet built, 6):**
`plc_rfq_records`, `plc_vendor_quotes`, `plc_tbe_records`, `plc_cbe_records`, `plc_rate_contract_refs`, `procurement_cockpit_summary` (materialized view)

### API / Route Inventory

**New route files (6):**
1. `server/procurement-list-routes.ts` — 11 PLC line routes + 10 POG routes + 5 EPC PO routes
2. `server/vendor-qualification-routes.ts` — 5 AVL routes
3. `server/plc-grn-routes.ts` (Phase 3) — 6 GRN routes
4. `server/plc-material-issue-routes.ts` (Phase 3) — 2 MIR routes
5. `server/plc-sap-routes.ts` (Phase 4) — 4 SAP routes
6. `server/plc-rfq-routes.ts` (Phase 2) — ~6 RFQ routes
7. `server/plc-evaluation-routes.ts` (Phase 2) — ~6 TBE/CBE routes

**Modified route files (2):**
1. `server/pppc-routes.ts` — raise-pr + bulk-raise-pr handlers modified (PLC auto-create); downstream routes soft/hard blocked
2. `server/doc-sequence-service.ts` — POG, GRN, MIR, RFQ doc types registered

**Total new API endpoints (Phase 1–4): 55+**

| Group | Count |
|---|---|
| PLC Lines | 11 |
| PO Groups | 10 |
| EPC Purchase Orders | 5 |
| GRN | 6 |
| Material Issue | 2 |
| AVL Governance | 5 |
| Document Attachments | 3 |
| Qty Governance | 1 |
| SAP Sync | 4 |
| RFQ (Phase 2) | ~6 |
| Evaluation (Phase 2) | ~6 |
| Admin / Utility | 3 |
| **Total** | **~62** |

### Migration Inventory

| Step | Type | Estimated Duration |
|---|---|---|
| CREATE 9 new tables | DDL | 30 seconds |
| CREATE 16 indexes | DDL | 30 seconds |
| ALTER 4 existing tables | DDL | 20 seconds |
| Register 4 doc_sequences keys | DML | < 1 second |
| Register 1 page_permission | DML | < 1 second |
| Run Phase 0 audit query | Read-only SQL | < 1 second |
| Backfill per project (~500 PLN rows each) | Application logic | ~2 minutes per project |
| Phase 2: DROP legacy write guards | Code deploy | < 1 second |
| Phase 3: REVOKE write on legacy tables | DDL privilege | < 1 second |
| Phase 4: CREATE materialized view | DDL | < 5 seconds |

**Total migration time (Phase 1, 100 projects):** ~3–4 hours for backfill; ~5 minutes for schema changes.

**Rollback time (pre-Phase 2):** ~15 minutes (DROP new tables + revert ALTER TABLE + redeploy previous code).

### Implementation Effort Estimate

| Phase | Backend (server TS) | Frontend (React TS) | DB / Migration | Testing | Total |
|---|---|---|---|---|---|
| Phase 1 | ~2,200 lines | ~2,800 lines | ~100 lines SQL | ~2 days | **~7,100 lines / ~3 weeks** |
| Phase 2 | ~1,000 lines | ~1,200 lines | ~40 lines SQL | ~1 day | **~2,240 lines / ~1.5 weeks** |
| Phase 3 | ~800 lines | ~1,000 lines | ~20 lines SQL | ~1 day | **~1,820 lines / ~1 week** |
| Phase 4 | ~600 lines | ~600 lines | ~30 lines SQL | ~0.5 day | **~1,230 lines / ~1 week** |
| **Total** | **~4,600** | **~5,600** | **~190** | **~4.5 days** | **~12,390 lines / ~6.5 weeks** |

*Estimates assume one senior full-stack engineer. Estimates are conservative and include time for review, debugging, and incremental backfill validation.*

---

## 37. Phase-Wise UI Inventory

Complete inventory of every UI element. Phase column is the delivery phase. Nothing in Phase 2+ is built during Phase 1.

### 37a. Pages

| Element | Type | File | Phase |
|---|---|---|---|
| Procurement List Control Cockpit | Full page | `client/src/pages/procurement-list-control-page.tsx` | 1 |

### 37b. Dialogs and Drawers

| Element | Type | File | Trigger | Phase |
|---|---|---|---|---|
| PO Group Wizard | Multi-step dialog (4 steps) | `client/src/components/po-group-wizard.tsx` | "Create PO Group" button | 1 |
| PO Group Detail Panel | Sheet/drawer | `client/src/components/po-group-detail.tsx` | Click POG number | 1 |
| PLC Line Detail Drawer | Side drawer | `client/src/components/plc-line-detail-drawer.tsx` | Click PLC No | 1 |
| PO Amendment Dialog | Dialog | `client/src/components/po-amendment-dialog.tsx` | "Amend PO" button | 1 |
| Over-Procurement Approval | Inline confirm dialog | Inside procurement-list-control-page | Auto-shown | 1 |
| AVL Bypass Acknowledgement | Inline checkbox in Wizard Step 1 | Inside po-group-wizard | Auto-shown | 1 |
| GRN Record Dialog | Dialog | `client/src/components/grn-record-dialog.tsx` | "Record GRN" | 3 |
| Material Issue Dialog | Dialog | `client/src/components/material-issue-dialog.tsx` | "Issue Material" | 3 |
| SAP Reconciliation Report | Dialog | `client/src/components/sap-reconcile-dialog.tsx` | "Reconcile" | 4 |
| RFQ Create Dialog | Dialog | `client/src/components/rfq-create-dialog.tsx` | "Create RFQ" | 2 |
| Vendor Quote Dialog | Dialog | `client/src/components/vendor-quote-dialog.tsx` | "Enter Quote" | 2 |
| TBE Dialog | Dialog | `client/src/components/tbe-dialog.tsx` | "Open TBE" | 2 |
| CBE Dialog | Dialog | `client/src/components/cbe-dialog.tsx` | "Open CBE" | 2 |

### 37c. Tables and Grids

| Element | Location | Key Columns | Phase |
|---|---|---|---|
| Procurement Lines Table | "Procurement Lines" tab | PLC No, Tag No, Group, Subgroup, Qty Reqd, Qty Ordered, Qty Rcvd, Qty Balance, Status, Vendor, AVL, POG No, EPC PO No, Priority | 1 |
| PO Groups Table | "PO Groups" tab | POG No, Vendor, Lines, Amount, Status, Submitted By, Approved By, EPC PO No | 1 |
| POG Lines Sub-table | PO Group Detail Panel | Line No, PLC No, Tag No, Line Qty, Line Qty Rcvd, Unit Rate, Amount, Status | 1 |
| Vendor AVL Table | Vendor Master — AVL tab | Subgroup, Status, Performance Score, Valid Until, Annual Review Due | 1 |
| Amendment History Table | PLC Line Detail Drawer | Amendment No, Type, Status, Summary, Submitted By, Approved By | 1 |
| GRN Records Table | "GRN Tracking" tab | GRN No, Date, PLC No, Vendor, Challan No, GRN Qty, Accepted Qty, Inspection Status | 3 |
| Inspection Queue Table | GRN Tracking tab — sub-view | GRN No, Tag No, Received Date, Days Pending, Condition | 3 |
| Vendor Scorecard Table | KPI Dashboard tab | Vendor, Orders, NCRs, Score, Status | 3 |
| PO Aging Report Table | KPI Dashboard tab | PO No, Vendor, Age (days), Amount, Status | 3 |
| SAP Sync Status Table | KPI Dashboard tab | EPC PO No, Sync Status, SAP Doc Entry, Last Synced | 4 |

### 37d. Dashboard Sections

| Section | Location | Content | Phase |
|---|---|---|---|
| Summary Strip | Top of cockpit (always visible) | 6 stat cards: Total / Pending / In Progress / PO Issued / Received / Closed | 1 |
| Qty Alert Strip | Below summary strip | Required / Ordered / Balance / Over-procured / Overdue counts | 1 |
| Project Procurement Health | KPI Dashboard tab | Completion %, delay count, over-procurement flag, NCR count | 3 |
| Delivery Calendar | KPI Dashboard tab | Gantt by required_by_date, color-coded by risk | 3 |
| GRN Inspection Queue | GRN Tracking tab | Days-pending sorted queue | 3 |
| SAP Sync Health | KPI Dashboard tab (Phase 4 addition) | Error count, mismatch count, last sync time | 4 |

### 37e. Tabs and Panels

| Element | Parent | Phase |
|---|---|---|
| "Procurement Lines" tab | ProcurementListControlPage | 1 |
| "PO Groups" tab | ProcurementListControlPage | 1 |
| "Bid Evaluation" tab | ProcurementListControlPage | 2 |
| "GRN Tracking" tab | ProcurementListControlPage | 3 |
| "KPI Dashboard" tab | ProcurementListControlPage | 3 |
| "PLC History" section | PlcLineDetailDrawer | 1 |
| "Specification" section | PlcLineDetailDrawer | 1 |
| "Documents" section | PlcLineDetailDrawer | 1 |
| "Amendments" section | PlcLineDetailDrawer | 1 |
| "Stores" section (GRN + MIR) | PlcLineDetailDrawer | 3 |
| "SAP Integration" section | PlcLineDetailDrawer | 4 |
| "AVL Qualification" tab | Vendor Master page | 1 |

### 37f. Existing Page Modifications

| Page | Change | Phase |
|---|---|---|
| `epc-buy-list-control-page.tsx` | Add "Procurement" column: PLC status badge + PLC No (linked) + POG No + EPC PO No | 1 |
| `epc-buy-list-control-page.tsx` | Amber row highlight when `revision_action_required != 'none'` | 1 |
| Vendor Master page | Add "AVL Qualification" tab with VendorAvlPanel | 1 |
| Old procurement execution page | Add deprecation banner: "Managed by Procurement List Control" | 1 |
| Project settings page | Add "Procurement Closure Checklist" panel | 3 |

### 37g. Navigation and Permission Changes

| Change | Phase |
|---|---|
| Sidebar: "Procurement List Control" link added below "BUY List Control" (icon: ClipboardList) | 1 |
| Page permission key `procurement-list-control` seeded in `page_permissions` table | 1 |
| `shared/epc-permission-registry.ts`: entry for `procurement-list-control` added | 1 |
| App.tsx: `PageProtectedRoute` for `/epc/procurement-list-control` | 1 |
| projects-production.ts lazy export: `EpcProcurementListControlPage` | 1 |

---

## 38. Schema Ownership Governance

This section defines who owns each PLC-related table and what "ownership" means in practice.

### 38a. Ownership Definitions

| Term | Meaning |
|---|---|
| **Creator** | The only application code path that may INSERT rows into this table |
| **Mutator** | The only application code path that may UPDATE rows in this table |
| **Read-Only** | No application code may INSERT, UPDATE, or DELETE rows — read only |
| **Append-Only** | INSERT is permitted; UPDATE and DELETE are never permitted |

### 38b. Table Ownership Matrix

| Table | Creator | Mutator | Deletable? | Notes |
|---|---|---|---|---|
| `procurement_list_lines` | `createPlcLineInTx()` in `server/plc-line-service.ts` only | `recomputePlcQty()` + status update functions in `plc-line-service.ts` only | NO | Status change is the only mutation; qty fields are recomputed-only |
| `epc_po_groups` | `POST /api/epc-po-groups` handler only | Status-transition handlers only (`approve`, `reject`, `cancel`, `issue-po`) | NO | Header fields editable while `draft`; immutable after `approved` |
| `epc_po_group_lines` | `POST /api/epc-po-groups` handler only (inside same tx) | `PATCH /api/epc-po-groups/:id/lines` (draft only) + `is_active = false` on cancel/reject | NO | `is_active` flag is the only mutation post-approve |
| `epc_po_amendments` | `POST /api/epc-purchase-orders/:id/amend` handler only | Status-transition handlers only | NO | Immutable after `issued` |
| `vendor_subgroup_qualification` | `POST /api/vendor-subgroup-qualification` handler only | `PATCH /api/vendor-subgroup-qualification/:id` + performance score updater | NO | Status changes only; performance_score auto-maintained |
| `plc_grn_records` | `POST /api/plc-grn` handler only | `PATCH /api/plc-grn/:id/inspection-result` + `POST /api/plc-grn/:id/accept-stores` | NO | accepted_qty set once by inspection; immutable after stores acceptance |
| `plc_material_issues` | `POST /api/plc-material-issues` handler only (Phase 3) | NONE — immutable after creation | NO | Append-only after creation |
| `plc_document_attachments` | `POST /api/plc-documents/upload` handler only | `is_current = false` only via DELETE route (logical delete) | NO (GCS file never deleted) | `DELETE` route sets `is_current = false`; no physical deletion |
| `procurement_list_audit_log` | `logPlcAudit()` in `plc-line-service.ts` called at end of every mutation | NONE | NO | Strictly append-only; no route or function may UPDATE or DELETE |
| `epc_purchase_orders` (PLC columns) | `POST /api/epc-po-groups/:id/approve` handler | Status-transition handlers; `POST /api/epc-po-groups/:id/issue-po` for qty totals | NO | Legacy columns unchanged |
| `epc_purchase_order_items` (PLC columns) | `POST /api/epc-po-groups/:id/approve` handler | `qty_received` updated by GRN recompute only | NO | Legacy columns unchanged |

### 38c. Ownership Violation Definition

An ownership violation is any of the following:
1. A route handler outside the designated creator path writing to a PLC table.
2. Any `drizzle.update()` or raw SQL `UPDATE` on `procurement_list_audit_log`.
3. Any `drizzle.delete()` or raw SQL `DELETE` on any PLC table.
4. Any direct field assignment to `procurement_list_lines.qty_*` fields outside `recomputePlcQty()`.
5. Any write to `procurement_list_lines.qty_required` after the row is created.

**Response to an ownership violation in code review:** PR rejected; no merge permitted until violation is corrected.

---

## 39. No Direct SQL Update Governance

### 39a. Rule

**No raw SQL `UPDATE` or `DELETE` statements are permitted on any PLC table in application code.**

This applies to:
- `pool.query('UPDATE procurement_list_lines ...')` — prohibited
- `db.execute(sql\`UPDATE procurement_list_lines ...\`)` — prohibited
- `drizzle.delete(procurementListLines).where(...)` — prohibited
- Any `UPDATE` in a transaction that bypasses the service layer functions

**Only permitted exceptions:**
1. Migration scripts (one-time, reviewed by two engineers before execution).
2. Emergency admin correction scripts (approved by Superuser + documented in `procurement_list_audit_log` under entity_type `system_correction`).
3. Backfill routes (`POST /api/projects/:projectId/procurement-list/backfill`) which are migration-phase-only and disabled after Phase 2.

### 39b. Enforcement

**Code review gate:** Any PR touching PLC tables is reviewed against this rule before merge. Grep check:
```bash
grep -n "UPDATE procurement_list\|UPDATE epc_po_group\|DELETE FROM procurement_list\|DELETE FROM epc_po_group\|DELETE FROM plc_" server/
```
Expected: zero results (only migration scripts and service layer).

**Service layer as the exclusive write path:**

| Operation | Correct Call | Incorrect Call |
|---|---|---|
| Create PLC line | `createPlcLineInTx(client, params)` | Direct INSERT in route handler |
| Recompute qty | `recomputePlcQty(plcLineId, client)` | `pool.query('UPDATE procurement_list_lines SET qty_ordered = ...')` |
| Log audit | `logPlcAudit(client, event, ...)` | Direct INSERT in route handler |
| Update PLC line status | `updatePlcLineStatus(client, id, newStatus, userId, reason)` | Direct UPDATE in route handler |

### 39c. Drizzle ORM Preferred Pattern

All writes use the Drizzle fluent API, never raw SQL for PLC tables:
```typescript
// Correct
await client.update(procurementListLines)
  .set({ status: 'in_po_group', activePoGroupId: pogId, updatedAt: new Date() })
  .where(eq(procurementListLines.id, plcLineId));

// Prohibited
await client.execute(sql`UPDATE procurement_list_lines SET status = 'in_po_group' WHERE id = ${plcLineId}`);
```

Exception: `pg_advisory_xact_lock` must use raw SQL (it is a PostgreSQL function call, not a DML statement):
```typescript
await tx.execute(sql`SELECT pg_advisory_xact_lock(${plcLineId})`); // Permitted — not DML
```

---

## 40. Final Approval Gates

### 40a. Per-Phase Approval Requirements

Implementation of each phase is not considered complete until all five evidence types are submitted and formally approved by THERMOPAC management.

| Evidence Type | What Is Required | Format |
|---|---|---|
| **Zero-Trust Verification Evidence** | Results of all applicable §29 checks with query output or test log showing zero violations | SQL query output screenshot or exported CSV |
| **Schema Evidence** | `\d+ procurement_list_lines` (and other new tables) output from production DB, confirming all columns and indexes are present | psql `\d+` output or pgAdmin screenshot |
| **API Evidence** | HTTP request/response log for each new route, demonstrating correct HTTP status codes, correct JSON payloads, and correct error handling | Postman collection export or curl log |
| **UI Evidence / Screenshots** | Screenshots of every new page, dialog, table, and tab delivered in the phase | PNG screenshots with test data visible |
| **Rollback Evidence** | Confirmation that the rollback procedure (§28) has been tested on the staging environment and succeeds within the documented time window | Staging test log with timestamps |

### 40b. Phase 1 Approval Gate

**Prerequisite:** Phase 0 pre-migration audit completed and counts accepted.

**Deliverables for approval:**

- [ ] Zero-Trust §29a (quantity integrity) — zero violation rows on all active projects
- [ ] Zero-Trust §29b (duplicate prevention) — zero active duplicate group assignments
- [ ] Zero-Trust §29c (concurrency locking) — concurrent POG creation test confirms exactly one succeeds
- [ ] Zero-Trust §29g (permission enforcement) — all 6 route / role combinations return correct HTTP status
- [ ] Schema evidence: all 9 new tables present in production DB with all columns and indexes
- [ ] Schema evidence: all ALTER TABLE additions confirmed on 4 existing tables
- [ ] API evidence: all 26 Phase 1 routes tested (11 PLC line + 10 POG + 5 EPC PO routes)
- [ ] UI evidence: screenshots of PLC cockpit, PO Group Wizard (all 4 steps), PLC Line Detail Drawer, PO Group Detail Panel, Vendor AVL Panel, BUY List Control with PLC column
- [ ] Rollback evidence: staging rollback test completed in < 20 minutes

**Phase 1 sign-off required before Phase 2 begins.** No Phase 2 implementation work starts without written approval.

### 40c. Phase 2 Approval Gate (future)

Same five evidence types applied to Phase 2 deliverables. Specifically:
- [ ] Hard-block on legacy routes confirmed (HTTP 423 returned, not just warned)
- [ ] RFQ lifecycle tested end-to-end on staging
- [ ] Vendor comparison matrix renders correctly with multi-vendor data
- [ ] TBE and CBE report workflows tested

### 40d. Phase 3 Approval Gate (future)

- [ ] GRN lifecycle tested: record → inspection → stores acceptance → PLC qty recomputed correctly
- [ ] Background qty recompute job confirmed running (scheduler log)
- [ ] NCR traceability confirmed: NCR linked to GRN, GRN linked to PLC line, PLC line qty not double-counted
- [ ] KPI dashboard data matches raw SQL verification queries

### 40e. Phase 4 Approval Gate (future)

- [ ] SAP PO push confirmed (SAP docEntry recorded in DB)
- [ ] SAP GRN pull confirmed (plc_grn_records created from SAP data)
- [ ] Reconciliation report confirms zero discrepancy on test project
- [ ] Materialized view refresh confirmed on schedule

---

## 41. Implementation Tracker Governance

### 41a. Tracker Document

The implementation tracker is a living document created at the start of Phase 1 implementation. Its path: `docs/procurement-list-control-implementation-tracker.md`.

**Tracker contents:**
- Current phase number and status (`Not Started` / `In Progress` / `Awaiting Approval` / `Approved`)
- Per-deliverable checklist (schema, backend, frontend, migration, verification)
- Evidence log: date, evidence type, submitter, link/screenshot reference
- Approval record: approver name, date, approval scope
- Phase gate status: locked / open
- Known issues log (non-blocking issues carried forward to next phase)

### 41b. Tracker Lock Mechanism

**Phase gate lock:** Once a phase is submitted for approval (status `Awaiting Approval`), no further implementation work on any component is permitted until:
1. All evidence is reviewed and accepted, OR
2. Specific items are called back for correction (tracker status reverts to `In Progress` for those items only).

**Cross-phase lock:** Phase N+1 implementation does not begin until Phase N gate is formally approved. The tracker records the approval date and approver for each gate.

### 41c. Tracker Maintenance Rules

1. The tracker is updated at the completion of every implementation step — not retrospectively.
2. Each evidence item is linked by filename or URL at the time of submission.
3. Known issues discovered during a phase are logged immediately — not deferred.
4. The tracker is never deleted or overwritten. If a phase is re-done, a new section is appended (with a revision note) rather than editing previous entries.
5. The tracker is committed to version control at the end of every implementation session.

### 41d. Phase 1 Tracker Initialisation

At the start of Phase 1 implementation, create the tracker by running:
```
docs/procurement-list-control-implementation-tracker.md
```
with the following initial structure:

```markdown
# PLC Implementation Tracker
**Baseline:** docs/procurement-list-control-baseline-v1.md (approved 13 May 2026)

## Phase 1 — Core MVP
**Status:** In Progress  
**Started:** [date]  
**Submitted for approval:** [date]  
**Approved:** [date]  
**Approver:** [name]

### Schema
- [ ] vendor_subgroup_qualification created
- [ ] procurement_list_lines created
- [ ] epc_po_groups created
- [ ] epc_po_group_lines created
- [ ] epc_po_amendments created
- [ ] plc_grn_records created (table only; routes Phase 3)
- [ ] plc_material_issues created (table only; routes Phase 3)
- [ ] plc_document_attachments created
- [ ] procurement_list_audit_log created
- [ ] epc_purchase_orders ALTER columns applied
- [ ] epc_purchase_order_items ALTER columns applied
- [ ] inspection_execution_records ALTER columns applied
- [ ] non_conformance_reports ALTER columns applied
- [ ] All 16 indexes created

### Backend
- [ ] server/plc-line-service.ts created
- [ ] server/procurement-list-routes.ts created (26 routes)
- [ ] server/vendor-qualification-routes.ts created (5 routes)
- [ ] server/pppc-routes.ts modified (raise-pr + bulk-raise-pr)
- [ ] server/routes.ts updated (new routes registered)
- [ ] POG doc_sequence key registered
- [ ] page_permission 'procurement-list-control' seeded

### Frontend
- [ ] client/src/pages/procurement-list-control-page.tsx created
- [ ] client/src/components/po-group-wizard.tsx created
- [ ] client/src/components/po-group-detail.tsx created
- [ ] client/src/components/plc-line-detail-drawer.tsx created
- [ ] client/src/components/plc-document-manager.tsx created
- [ ] client/src/components/vendor-avl-panel.tsx created
- [ ] client/src/loaders/projects-production.ts updated
- [ ] client/src/App.tsx updated
- [ ] client/src/components/layout.tsx updated (sidebar link)
- [ ] shared/epc-permission-registry.ts updated
- [ ] epc-buy-list-control-page.tsx updated (PLC column)

### Verification
- [ ] npm run typecheck — zero errors
- [ ] Zero-Trust §29a (qty integrity)
- [ ] Zero-Trust §29b (duplicate prevention)
- [ ] Zero-Trust §29c (concurrency locking)
- [ ] Zero-Trust §29g (permission enforcement)
- [ ] Rollback test on staging

### Evidence Log
| Date | Type | Item | Submitter | Reference |
|---|---|---|---|---|
```

---

## Document Statistics (Final)

**Saved as:** `docs/procurement-list-control-baseline-v1.md`  
**Supersedes:** `docs/procurement-list-control-baseline-v1.0.md`  
**Version:** v1.0 FINAL — APPROVED  
**Approval date:** 13 May 2026

### Section Inventory

| Range | Group | Section Count |
|---|---|---|
| §1–§7 | Architecture, lifecycle, numbering, migration | 7 |
| §8 | Schema (9 new tables, 4 ALTER TABLE, 16 indexes) | 1 (10 subsections) |
| §9 | API / Routes (~62 endpoints across 4 phases) | 1 (8 subsections) |
| §10–§13 | UI, status lifecycle, duplicate prevention, concurrency | 4 |
| §14–§18 | Quantity ownership, BUY list revision, supersession, AVL, PO amendment | 5 |
| §19–§26 | SAP, documents, notifications, KPI, archival, performance, datasheet, traceability | 8 |
| §27 | Implementation phase breakdown | 1 (4 phases) |
| §28–§32 | Rollback, zero-trust, transaction governance, failure recovery, security | 5 |
| §33–§34 | Dependency matrix, production cutover | 2 |
| §35–§36 | Phase-wise UI creation plan, UI delivery by phase | 2 |
| §37–§41 | UI inventory, schema ownership, SQL governance, approval gates, tracker | 5 |
| **Total** | | **41 sections** |

### Schema Inventory

| Item | Count |
|---|---|
| New tables (Phase 1 created, some routes Phase 3+) | 9 |
| Altered existing tables | 4 |
| New columns across all tables | ~15 new columns |
| Indexes | 16 |
| Future tables (Phases 2–4, designed not built) | 6 |
| Doc sequence keys to register | 4 (POG, GRN, MIR, RFQ) |
| Page permissions to seed | 1 |

### API / Route Inventory

| Phase | Route File | Endpoints |
|---|---|---|
| 1 | `server/procurement-list-routes.ts` | 26 (PLC lines + POG + EPC PO) |
| 1 | `server/vendor-qualification-routes.ts` | 5 |
| 1 | `server/pppc-routes.ts` (modified) | 0 new; 2 modified |
| 2 | `server/plc-rfq-routes.ts` | ~6 |
| 2 | `server/plc-evaluation-routes.ts` | ~6 |
| 3 | `server/plc-grn-routes.ts` | 6 |
| 3 | `server/plc-material-issue-routes.ts` | 2 |
| 4 | `server/plc-sap-routes.ts` | 4 |
| **Total** | | **~55+ endpoints** |

### Implementation Effort Estimate

| Phase | Backend | Frontend | DB/Migration | Total Lines | Duration |
|---|---|---|---|---|---|
| 1 | ~2,200 | ~2,800 | ~100 SQL | ~5,100 | ~3 weeks |
| 2 | ~1,000 | ~1,200 | ~40 SQL | ~2,240 | ~1.5 weeks |
| 3 | ~800 | ~1,000 | ~20 SQL | ~1,820 | ~1 week |
| 4 | ~600 | ~600 | ~30 SQL | ~1,230 | ~1 week |
| **Total** | **~4,600** | **~5,600** | **~190** | **~10,390** | **~6.5 weeks** |

---

*End of Procurement List Control Baseline v1.0 FINAL — APPROVED*  
*Document saved: `docs/procurement-list-control-baseline-v1.md`*  
*Supersedes: `docs/procurement-list-control-baseline-v1.0.md`*  
*Approval date: 13 May 2026 — Phase 1 implementation authorised*
