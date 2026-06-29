---
name: EPC ↔ Quality handover architecture
description: How the EPC-to-Quality handover works — what was pre-existing, what was added, and the key vocabulary.
---

## What already existed (do NOT re-add)
- `epc_work_orders.quality_status` column with values: `pending_inspection`, `in_progress`, `inspection_cleared`, `inspection_failed`
- `epc_work_orders.quality_cleared_*` and `quality_failed_*` columns
- **IER write-back** at `server/project-routes.ts` lines ~6663–6683: when an IER is completed with pass/conditional_pass, writes `inspection_cleared` to WOs via `WHERE execution_record_id = qp.production_exec_id` (QPR-based chain)
- **Dispatch gate** at `server/project-routes.ts` lines ~8796–8813: blocks dispatch readiness creation unless `quality_status = 'inspection_cleared'`

## What was added (minimal surgical additions)
1. **Schema**: `inspection_orders.epc_work_order_id` — nullable FK → `epc_work_orders.id` (`ON DELETE SET NULL`). Forward reference handled as `() => epcWorkOrders.id as any` (epcWorkOrders defined at line ~11760, inspectionOrders at ~5208).
2. **DB**: `ALTER TABLE inspection_orders ADD COLUMN IF NOT EXISTS epc_work_order_id INTEGER REFERENCES epc_work_orders(id) ON DELETE SET NULL` — applied directly via SQL.
3. **New server file**: `server/quality/epc-io-handover.ts` — exports:
   - `createInspectionOrderFromEpcWO(epcWorkOrderId, userId)` — idempotent; sets WO to `in_progress` on create
   - `writeBackWOQualityStatus(inspectionOrderId)` — writes `inspection_cleared` when IO → completed; reverts to `pending_inspection` when IO → canceled
4. **New API route** in `server/wo-manage-routes.ts`:
   - `GET /api/epc/work-orders/:id/inspection-order` — returns linked IO or null
   - `POST /api/epc/work-orders/:id/request-inspection` — Manager+ only, WO must be `released`
5. **Write-back hook** in `server/quality-routes.ts` PATCH `/inspection-orders/:id` handler (~line 427): calls `writeBackWOQualityStatus` when `orderData.status === 'completed'` and `existingOrder.epcWorkOrderId` is set
6. **Frontend** `client/src/pages/epc-wo-manage-page.tsx`: Quality Inspection Status panel shows between hold banner and Row A; includes Request Inspection button (Manager, released WO, no IO yet), IO reference display, and clearance date

## Key vocabulary (non-negotiable — must match dispatch gate)
- `pending_inspection` — WO created, not yet inspected
- `in_progress` — IO created and pending Quality action
- `inspection_cleared` — IO completed; dispatch allowed
- `inspection_failed` — used by IER failure path only

## IO number format
`IO-{YYYY}-{projectCode}-W-{woSeqPadded}` e.g. `IO-2026-2627-018-W-0001`
Distinct from bulk-generated IOs which use M (Make) or B (Buy) suffix.

**Why:** The `epc_work_order_id as any` forward reference was needed because inspectionOrders is defined thousands of lines before epcWorkOrders in schema.ts, and AnyPgColumn is not imported. The `as any` cast is safe — the FK constraint is DB-level.
