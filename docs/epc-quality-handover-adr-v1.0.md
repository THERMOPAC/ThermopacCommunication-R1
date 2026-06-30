# ADR v1.0 — EPC ↔ Quality Management Handover
**Status**: APPROVED  
**Date**: 2026-06-29  
**Last updated**: 2026-06-30 (R7, R8 approved)

---

## Context

The EPC module manages Work Orders (WOs) and Drawing Controls. The Quality Management module manages Quality Planning Records (QPL) and Inspection Execution Records (INS). A formal, auditable handover mechanism is required between the two modules so that Quality can act on manufacturing readiness without being dependent on manual EPC actions.

### Key facts established during design review

- Both the WO and the Inspection Order (IO) are created at project conception (offer → order conversion). Neither creates the other.
- QPL (`quality_planning_records`) and INS (`inspection_execution_records`) are also created by the EPC pipeline at project inception: QPL in `draft` status, INS in `scheduled` status.
- `project_item_id` is present on `epc_drawing_controls`, `quality_planning_records`, and `inspection_execution_records` — this is the three-way join key.
- The `epc_drawing_controls` table has a `released_for_manufacturing` boolean flag, set only when a Senior Manager explicitly releases for manufacturing.

---

## Decision

### Handover object and mechanism

**The Inspection Order (IO) is the single handover object** between EPC and Quality Management. The handover is a **linking and signalling event only** — not a creation event.

### Formal handover trigger

**Drawing Released for Manufacturing** (`epc_drawing_controls.released_for_manufacturing = true`) is the formal EPC → Quality Management handover event. This replaces all manual activation actions previously required.

---

## Rules — must never be violated

### R1 — No new IO is created by EPC

The system finds the pre-existing IO for the same `project_item_id`, writes `inspection_orders.epc_work_order_id = wo.id` (the link), and sets `epc_work_orders.quality_status = 'in_progress'`. If no IO exists for the item, the action is blocked with a clear error — Quality must generate the IO first.

### R2 — Quality executes on the IO without any workflow change

The Quality team uses the existing Inspections page. No changes to IER, MDR, NCR, or Final Dossier workflows.

### R3 — Write-back is automatic and system-driven

When IO `status → 'completed'` and `epc_work_order_id IS NOT NULL`, the system writes:
- `epc_work_orders.quality_status = 'inspection_cleared'`
- `epc_work_orders.quality_cleared_at = NOW()`
- `epc_work_orders.quality_cleared_inspection_id = IO.id`

### R4 — Dispatch gate is a hard block

`epc_dispatch_readiness` creation is blocked unless `epc_work_orders.quality_status = 'inspection_cleared'`. This gate is implemented in `server/project-routes.ts` and must not be weakened.

### R5 — Quality status vocabulary is fixed

Values (in order):
- `pending_inspection` — default
- `in_progress` — handover signalled (drawing released for manufacturing)
- `inspection_cleared` — IO completed
- `inspection_failed` — IER failure path

No other values permitted.

### R6 — IER write-back is a parallel path

The existing IER write-back via QPR → `production_exec_id` is a parallel path for QPR-linked WOs and must remain untouched. The IO-based write-back and the IER-based write-back are additive — both can set `inspection_cleared` on the same WO. The first one to fire wins; the second is a no-op due to the `AND quality_status != 'inspection_cleared'` guard.

### R7 — Drawing Released for Manufacturing auto-activates QPL and INS

When `epc_drawing_controls.released_for_manufacturing` becomes `true`, the drawing release handler automatically transitions, within the **same DB transaction**:

| Record | Table | Filter | Transition |
|--------|-------|--------|------------|
| QPL | `quality_planning_records` | `project_item_id = drawing.project_item_id AND status = 'draft' AND source_context = 'work_order'` | `draft → in_progress` |
| INS | `inspection_execution_records` | `project_item_id = drawing.project_item_id AND status = 'scheduled' AND source_context = 'work_order'` | `scheduled → in_progress` |

**Procurement-only releases** (`released_for_procurement` only, `released_for_manufacturing = false`) do **NOT** trigger this handover.

**`source_context = 'work_order'` filter is mandatory** — procurement-context QPL (`incoming_inspection`) is activated by a different trigger (goods receipt), not drawing release.

### R8 — Manual QPL and INS activation actions are removed

"Start Preparation" and "Start Inspection" are replaced entirely by the automatic R7 trigger.

Removed:
- Route `POST /api/quality-plans/:id/start-preparation`
- Route `POST /api/inspection-executions/:id/start`
- "Start Preparation" button and dialog in `epc-quality-inspection-page.tsx`
- "Start Inspection" button and dialog in `epc-quality-inspection-page.tsx`

QPL active working state is now `in_progress` (previously `under_preparation`). The `mark-ready` route (`POST /api/quality-plans/:id/mark-ready`) accepts both `in_progress` and `under_preparation` for backward compatibility with pre-migration records.

---

## What is unchanged

- `mark-ready` (QPL `in_progress → ready_for_inspection_setup`)
- `revert-to-preparation` (QPL `ready_for_inspection_setup → in_progress`)
- `schedule` (INS — only applies to `draft`-born INS records)
- `complete`, `fail`, `mark-rework-required`, `close`, `cancel` on both QPL and INS
- The `/inspections` page (`inspection_orders` / IO) — entirely separate module, untouched
- IER, MDR, NCR, Final Dossier — untouched

---

## Schema

One column added to `inspection_orders`:

```sql
ALTER TABLE inspection_orders
  ADD COLUMN epc_work_order_id INTEGER NULL REFERENCES epc_work_orders(id) ON DELETE SET NULL;
```

No other schema changes required for the handover mechanism.

---

## Server implementation

- `server/quality/epc-io-handover.ts` — exports `linkAndSignalInspectionReady(woId, userId)` and `writeBackWOQualityStatus(inspectionOrderId)`
- `server/project-routes.ts` — R7 auto-transition appended inside the drawing release `db.transaction` block, gated on `mfgReleased && rec.project_item_id`
- Route `GET /api/epc/work-orders/:id/inspection-order` — lookup only

---

## Risk register (residual)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Erroneous drawing release | Low | Senior Manager sign-off required; QPL/INS cancellable manually |
| Drawing with no `project_item_id` | Low | Guard `rec.project_item_id` in handler — no-op if null |
| Pre-migration `under_preparation` QPL records | Low | `mark-ready` accepts both `under_preparation` and `in_progress` |
