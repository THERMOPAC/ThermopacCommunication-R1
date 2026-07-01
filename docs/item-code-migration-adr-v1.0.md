# Item Code as Canonical Engineering Identity — Migration ADR v1.0

**Date:** 2026-06-30 (rev 2026-07-01)  
**Status:** APPROVED — Tiers 1, 2, 3, 4 Implemented — MIGRATION COMPLETE — Engineering Identity Model APPROVED 2026-07-01  
**Author:** THERMOPAC QMS Architecture Review  

---

## Context

An audit of the EPC pipeline data model confirmed that `item_code` (e.g. `C10357-PMA-CSS-KCB-32160 12 M3-P2627-018`) is the true engineering/business continuity key for MAKE items, while `project_item_id` is an internal database surrogate key. The audit found that `item_code` was carried through most pipeline stages but was absent from several tables, breaking end-to-end traceability without SQL JOINs.

---

## Decision

The following architectural principle is approved and binding:

> **For MAKE items, `item_code` is the canonical engineering/business continuity key.**
> Every business record representing a MAKE item shall carry `item_code` as a frozen, denormalized value populated at record creation time. `item_code` shall never be regenerated or overwritten after initial population.

| Key | Role |
|---|---|
| `project_item_id` | Internal database foreign key — used for SQL joins and integrity constraints |
| `item_code` | Canonical engineering identity — frozen at creation, appears on physical artefacts |

**`item_code` in downstream tables is intentionally a static copy, not a live FK reference.** This matches physical reality: a Work Order printed today carries the Item Code stamped at that moment; a DB rename does not retroactively change physical documents.

---

## Migration Scope

### Tier 1 — Implemented (2026-06-30)

| Table | Rows Backfilled | Source |
|---|---|---|
| `epc_purchase_orders` | 5 | `project_items.item_code` via `project_item_id` |
| `item_planning_records` | 250 | `project_items.item_code` via `project_item_id` |
| `execution_drafts` | 704 | `project_items.item_code` via `project_item_id` |

### Tier 2 — Implemented (2026-06-30)

| Table | Current Rows | Notes |
|---|---|---|
| `engineering_change_requests` | 3 | ECRs must carry item identity |
| `engineering_change_notices` | 0 | Schema change only |
| `project_buy_list_headers` | 2 | Buy list for MAKE item's BOM |
| `epc_document_attachments` | 315 | Partial — item-specific entity types only (inspection_order, epc_drawing_controls) |

### Tier 3 — Implemented (2026-06-30)

| Table | Notes |
|---|---|
| `project_item_drawings` | Drawing register linkage |
| `inspection_documents` | 2-hop: via inspection_orders.item_id |
| `work_order_items` | WO line items |

### Tier 4 — Approved, Pending Implementation (All Zero Rows)

| Table | Notes |
|---|---|
| `bom_explosion_logs` | Operational log |
| `bom_gating_bypass_log` | Audit log |
| `epc_agent_findings` | Diagnostic record |

### Explicitly Excluded

| Table | Reason |
|---|---|
| `epc_po_amendments` | Child of `epc_purchase_orders` — traceable via parent PO |
| `epc_po_groups` / `epc_po_group_lines` | Vendor-level grouping, not item-level |
| `epc_documents` | Project-level documents, not MAKE item records |
| `dispatch_documents` / `dispatch_items` | Legacy dispatch system, superseded by `epc_dispatch_*` |
| `inspection_reports` | References old `work_order_id` system, not EPC pipeline |
| `epc_bom_lines` | Represents BUY components; carries `component_item_code` — correct |

---

## Canonical Business Key

| Identifier | Role | Rule |
|---|---|---|
| `project_item_id` | Internal database foreign key | Used for SQL JOINs and integrity constraints only |
| `project_items.item_code` | Canonical engineering/business continuity key | Single source of truth for all EPC/QMS business records |
| `master_items.item_code` | Catalogue/master data identifier | Used within master data management only — never propagated to business records |

**Binding rules (non-negotiable):**

- **No EPC/QMS business record shall populate `item_code` from `master_items.item_code`.**
- **All new business records shall populate `item_code` exclusively from `project_items.item_code`**, read at the time of record creation via the `project_item_id` foreign key.
- `master_items.item_code` may appear in display strings, BOM line definition fields (`epc_bom_lines.component_item_code`), and catalogue UI — never in a business record `item_code` column.
- Virtual sub-assembly WO items with no corresponding `project_items` row shall receive `item_code = null`. This is the only permitted null case; it is not a bug.

---

## MAKE Project Item Engineering Identity Model

**Approved: 2026-07-01**

Every MAKE Project Item shall have exactly one of each of the following three identifiers. This model applies to MAKE items only. BUY items are explicitly out of scope.

### The Three Identifiers

| Identifier | DB Column | Example | Purpose |
|---|---|---|---|
| **Project Item Code** | `project_items.item_code` | `C10357-UOR-WNS-SKD-1000 TO 4500 LPH-P2627-018` | Canonical engineering/business continuity key across the entire EPC/QMS pipeline |
| **SAP Barcode** | `project_items.code_bars` | `C103572627018040` | Canonical manufacturing/SAP/barcode identity of the Project Item |
| **Drawing Number** | `epc_drawing_controls.drawing_number` | `C103572627018040` | Canonical engineering drawing identity |

### Binding Rules

1. **Project Item Code is the canonical engineering/business key.** Every downstream EPC/QMS business record (BOM, DWG, QPL, PO, WO, IO, Dispatch, Commissioning, Invoice, Documents, etc.) shall carry exactly one Project Item Code, populated from `project_items.item_code` at record creation time.

2. **`project_item_id` remains the internal database foreign key.** All SQL JOINs use `project_item_id`. `item_code` is the human/external/physical identity — it is not a FK.

3. **`master_items.item_code` is a catalogue identifier only.** It shall never be used as the business continuity key and shall never be written to any business record `item_code` column.

4. **SAP Barcode is a single, stable value per Project Item.** `project_items.code_bars` is a single column — one value per row. It is set at SAP sync time and does not change after assignment.

5. **Drawing Number shall always be identical to the SAP Barcode for MAKE items.** SAP Barcode and Drawing Number are 1:1 for every MAKE Project Item. The drawing number does not change between drawing revisions — only the revision code (e.g. A, B, C or 00, 01, 02) advances. Past revisions are retained as `is_current = false`.

6. **One active Drawing per Project Item at any time.** `epc_drawing_controls.is_current = true` marks the single active drawing. Multiple revision rows may exist for history; only one is active.

7. **One active Inspection Order per MAKE Project Item.** Each MAKE Project Item shall have at most one active Inspection Order at any time. The IO is the single EPC ↔ Quality Management handover object (see `docs/epc-quality-handover-adr-v1.0.md`).

### Permitted Exceptions

| Exception | Rule |
|---|---|
| **Virtual WO sub-assembly items** | `item_code = null` is permitted. These are BOM component items with no standalone `project_items` row. They are traceable via their parent `project_item_id`. This is the only permitted null case. |
| **BOM Lines (`epc_bom_lines.component_item_code`)** | Stores the master catalogue code, not the project-form item_code. BOM lines are catalogue/component definitions, not business records. BOM explosion translates these to project form at runtime. |
| **BUY items** | This identity model does not apply to BUY items. BUY items follow the procurement path (PO) and may not have a WO, Drawing, or IO. |

### Future Hardening Recommendations (Not Yet Implemented)

The following DB-level constraints are recommended to formally enforce the identity model. They are documented here for future implementation and shall not be implemented until formally scheduled:

1. Add a `UNIQUE` constraint on `project_items.item_code`.
2. Add a `UNIQUE` constraint on `project_items.code_bars`.
3. Add an application-level validation that rejects any `epc_drawing_controls` INSERT where `drawing_number ≠ project_items.code_bars` for MAKE items.
4. Add a partial unique index on `inspection_orders (item_id) WHERE status NOT IN ('cancelled', 'superseded')` to enforce at most one active IO per Project Item.

---

## Rules for New Development

1. **Any new table representing a business record for a MAKE item must include `item_code VARCHAR(100)` from the outset.**
2. **`item_code` must be populated at INSERT time** — never left null for Make items unless the source `project_items.item_code` is genuinely null (a data quality issue to be resolved separately).
3. **`item_code` must never be overwritten** — it is frozen at creation. If an item code changes in `project_items`, the downstream records preserve the original engineering identity.
4. **`project_item_id` remains the JOIN key** — application code joins on `project_item_id`, not on `item_code`. `item_code` is for human traceability and reporting, not for enforcing FK relationships.
5. **Source check before every new creation route** — before writing `item_code` to any new table, confirm the value originates from `project_items.item_code`, not from any `masterItem` variable or `master_items` query result.

---

## Verification

Post-implementation verification confirms:

- `epc_purchase_orders.item_code` populated for all 5 existing rows
- `item_planning_records.item_code` populated for all rows with a non-null source
- `execution_drafts.item_code` populated for all 704 rows
- All new inserts in creation routes include `item_code`

---

## Related Documents

- `replit.md` — Architecture decisions (EPC Pipeline FK Audit)
- `docs/epc-quality-handover-adr-v1.0.md` — EPC ↔ Quality Management handover
- `docs/epc-project-naming-governance-v1.0.md` — Project naming standards
