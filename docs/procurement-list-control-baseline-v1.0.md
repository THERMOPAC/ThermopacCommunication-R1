# Procurement List Control (PLC) — Baseline Architecture v1.0

**Document Status:** AWAITING APPROVAL — do not implement until formally approved  
**Prepared by:** THERMOPAC QMS Engineering  
**Date:** 13 May 2026  
**Supersedes:** Plan v1.0 (rejected — parallel path), Plan v2.0 (rejected — incomplete quantity / SAP / BUY List revision governance)  
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
26. Future Traceability Design (GRN → Inspection → NCR → Stores → Material Issue)  
27. Implementation Phase Breakdown  

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
| `plc.pog_approval_pending` | POG awaiting approval > 24h | Managers | high | procurement |

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

No `DELETE` statements are permitted on any PLC-related table in any API route. Drizzle ORM schema definitions for these tables have no `.onDelete('cascade')` on the PLC tables themselves (child tables may use cascade for cleanup of draft sub-records only, reviewed case by case).

---

## 24. Large-Project Performance Governance

THERMOPAC projects may have 300–1000+ procurement lines. The cockpit must remain responsive.

### 24a. Pagination

- All `GET /api/projects/:projectId/procurement-list` responses are paginated: default 50 rows per page, configurable up to 200.
- Cursor-based pagination (using `id` as cursor) rather than offset for stability under concurrent inserts.
- Filter parameters applied server-side before pagination.

### 24b. Required Indexes

```sql
-- Covering indexes for common cockpit queries
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

For large projects (> 200 PLC lines), qty field recomputation is offloaded to a background job rather than inline on every mutation:

- **Trigger:** Any GRN creation, POG cancel, or PO amendment completion queues a recomputation job for the affected `plc_line_id`s.
- **Job:** Runs within the existing scheduler (`[Scheduler]` in the codebase). Job type: `plc_qty_recompute`, runs within 60 seconds of trigger.
- **UI during recompute:** Qty fields show a "calculating" indicator. A `qty_last_computed_at` timestamp on `procurement_list_lines` drives this.
- **Manual trigger:** `POST /api/projects/:projectId/procurement-list/qty-recompute` for Manager override.

### 24d. Cockpit Performance Strategy

- **Summary strip** (total lines, qty totals): Pre-computed and cached in a `procurement_cockpit_summary` materialized view, refreshed every 5 minutes or on demand.
- **Filters applied server-side**: No full-table scans in JS. All filter + sort combinations use covered indexes.
- **KPI dashboard**: Heavy queries (Vendor Scorecard, PO Aging) run asynchronously on demand, results cached for 10 minutes.
- **Export**: CSV export of filtered lines runs as a streaming response — no full dataset loaded in memory.

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

**GCS path stability:** GCS governance already ensures files are never deleted (only superseded). The frozen path always resolves to a valid file. A frozen path that points to a superseded datasheet is intentional — it represents what the vendor was given at PO issue.

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
            │              └── (corrective action → re-inspection → accept/scrap)
            │
            ├── plc_material_issues  (stores outward)  [Phase 3]
            │
            ├── plc_document_attachments  (all documents)  [Phase 1]
            │
            └── future_links (designed, not yet activated):
                 ├── plc_rfq_records            [Phase 2 — RFQ documents]
                 ├── plc_vendor_quotes           [Phase 2 — vendor quotation comparison]
                 ├── plc_tbe_records             [Phase 2 — Technical Bid Evaluation]
                 ├── plc_cbe_records             [Phase 2 — Commercial Bid Evaluation]
                 ├── plc_vendor_comparison       [Phase 2 — multi-vendor comparison matrix]
                 ├── plc_rate_contract_refs      [Phase 3 — rate contract locking]
                 └── sap_purchase_orders         [Phase 4 — SAP cross-reference]
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
- `server/procurement-list-routes.ts` (new file — all PLC + POG + EPC PO routes)
- `server/vendor-qualification-routes.ts` (new file — AVL governance routes)
- `server/pppc-routes.ts` modified: raise-pr + bulk-raise-pr auto-create PLC line in same tx; soft deprecation block on old downstream routes
- `server/doc-sequence-service.ts` — register POG doc type

**Frontend deliverables:**
- `client/src/pages/procurement-list-control-page.tsx` (cockpit page — lines table + POG panel + summary strip)
- `client/src/components/po-group-wizard.tsx` (multi-step PO Group creation)
- `client/src/components/po-group-detail.tsx` (POG detail + approval chain)
- `client/src/components/vendor-avl-panel.tsx` (AVL qualification management)
- `client/src/components/plc-document-manager.tsx` (attachment upload/view)
- `epc-buy-list-control-page.tsx` — PLC status column added to lines table
- Page permission seed: `procurement-list-control`

**Estimated scope:** ~2000 lines backend, ~1800 lines frontend. Single sprint.

---

### Phase 2 — RFQ / TBE / CBE (Bid Evaluation)

**Scope:** RFQ creation and lifecycle, vendor quote upload, TBE report, CBE report, vendor comparison matrix, hard block on legacy routes, `avl_enforcement_level` upgrade to `hard` option.

**Schema deliverables:**
- `plc_rfq_records`
- `plc_vendor_quotes`
- `plc_tbe_records`
- `plc_cbe_records`
- Doc sequence: RFQ

**Backend deliverables:**
- `server/plc-rfq-routes.ts`
- `server/plc-evaluation-routes.ts`
- Hard block activated in `pppc-routes.ts`

**Frontend deliverables:**
- RFQ panel in cockpit
- TBE / CBE evaluation board
- Vendor comparison matrix component
- Full cockpit tab for bid evaluation

---

### Phase 3 — GRN / Inspection / NCR Integration

**Scope:** GRN recording, inspection linking, NCR traceability, stores acceptance, material issue (MIR), background qty recomputation job, KPI dashboard, delivery calendar, GRN aging report, performance score automation.

**Schema deliverables:**
- `plc_grn_records` and `plc_material_issues` already created in Phase 1 (tables exist, routes activated in Phase 3)
- Doc sequences: GRN, MIR
- ALTER TABLE `inspection_execution_records` and `non_conformance_reports` (already planned in Phase 1 migration script; routes activated here)

**Backend deliverables:**
- `server/plc-grn-routes.ts`
- `server/plc-material-issue-routes.ts`
- Background job: `plc_qty_recompute` in scheduler
- KPI dashboard computation endpoints

**Frontend deliverables:**
- GRN panel in cockpit
- GRN recording dialog
- Inspection queue panel
- KPI dashboard panel
- Delivery calendar component

---

### Phase 4 — SAP / Full Procurement Governance

**Scope:** SAP PO push, SAP GRN pull/push, reconciliation workflow, mismatch report, rate contract locking, cockpit materialized view for summary strip, full CSV export, archival automation on project closure.

**Schema deliverables:**
- `epc_purchase_orders` SAP sync columns (§19e)
- `procurement_cockpit_summary` materialized view
- `plc_rate_contract_refs`

**Backend deliverables:**
- `server/plc-sap-routes.ts`
- Reconciliation engine
- Project closure automation (triggered from project closure route)
- Materialized view refresh scheduler

**Frontend deliverables:**
- SAP sync status panel in PO detail
- Reconciliation diff report component
- Rate contract locking on vendor selection
- Full export functionality (CSV, filtered)

---

## Approval Checklist

Before implementation begins, the following must be confirmed by THERMOPAC management:

- [ ] Phase 0 pre-migration SQL report reviewed and record counts accepted
- [ ] `avl_enforcement_level` starting value confirmed (`advisory` / `soft` / `hard`)
- [ ] Over-procurement block threshold confirmed (default: block at 0% over)
- [ ] Performance score thresholds confirmed (default: review at 60, suspend at 40)
- [ ] SAP sync pattern confirmed for GRN (Pattern A or Pattern B per project)
- [ ] Notification recipients confirmed (Procurement Manager role / specific users)
- [ ] Phase 1 implementation scope approved
- [ ] Baseline document signed off

---

*End of Procurement List Control Baseline v1.0*  
*Document saved: `docs/procurement-list-control-baseline-v1.0.md`*
