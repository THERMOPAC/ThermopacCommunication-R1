# Item Code as Canonical Engineering Identity — Migration ADR v1.0

**Date:** 2026-06-30  
**Status:** APPROVED — Tier 1 Implemented  
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

### Tier 2 — Approved, Pending Implementation

| Table | Current Rows | Notes |
|---|---|---|
| `engineering_change_requests` | 3 | ECRs must carry item identity |
| `engineering_change_notices` | 0 | Schema change only |
| `project_buy_list_headers` | 2 | Buy list for MAKE item's BOM |
| `epc_document_attachments` | 315 | Partial — item-specific entity types only (inspection_order, epc_drawing_controls) |

### Tier 3 — Approved, Pending Implementation (All Zero Rows)

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

## Rules for New Development

1. **Any new table representing a business record for a MAKE item must include `item_code VARCHAR(100)` from the outset.**
2. **`item_code` must be populated at INSERT time** — never left null for Make items unless the source `project_items.item_code` is genuinely null (a data quality issue to be resolved separately).
3. **`item_code` must never be overwritten** — it is frozen at creation. If an item code changes in `project_items`, the downstream records preserve the original engineering identity.
4. **`project_item_id` remains the JOIN key** — application code joins on `project_item_id`, not on `item_code`. `item_code` is for human traceability and reporting, not for enforcing FK relationships.

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
