# PLC Phase 4 — Evidence Package
**Baseline:** docs/procurement-list-control-baseline-v1.md §9h, §19, §21, §22, §24  
**Compiled:** 13 May 2026  
**Status:** COMPLETE — All T001–T006 deliverables verified

---

## 1. Database Schema Migrations (T001)

### 1a. SAP sync columns — `epc_purchase_orders`

| Column | Type | Purpose |
|---|---|---|
| `sap_po_doc_entry` | INTEGER | SAP B1 PurchaseOrders.DocEntry (PK in SAP) |
| `sap_po_doc_num` | VARCHAR(50) | SAP B1 display doc number |
| `sap_sync_status` | VARCHAR(20) DEFAULT 'pending' | pending / synced / error / mismatch |
| `sap_sync_note` | TEXT | Last sync error message (max 500 chars) |
| `sap_synced_at` | TIMESTAMPTZ | Timestamp of last successful sync |

### 1b. SAP sync columns — `plc_grn_records`

| Column | Type | Purpose |
|---|---|---|
| `sap_grn_doc_entry` | INTEGER | SAP B1 GoodsReceiptPO.DocEntry |
| `sap_grn_number` | VARCHAR(50) | SAP B1 display doc number |
| `sap_sync_status` | VARCHAR(20) DEFAULT 'pending' | pending / synced / error |
| `sap_sync_note` | TEXT | Last sync error message |
| `sap_synced_at` | TIMESTAMPTZ | Timestamp of last successful sync |

### 1c. `plc_rate_contract_refs` table

```sql
CREATE TABLE plc_rate_contract_refs (
  id              SERIAL PRIMARY KEY,
  plc_line_id     INTEGER NOT NULL REFERENCES procurement_list_lines(id),
  project_id      INTEGER NOT NULL REFERENCES projects(id),
  vendor_id       INTEGER REFERENCES vendors(id),
  vendor_name     VARCHAR(255),
  rate_per_unit   NUMERIC(14,4) NOT NULL,
  currency        VARCHAR(10) NOT NULL DEFAULT 'INR',
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  contract_ref    VARCHAR(100),
  contract_notes  TEXT,
  is_locked       BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by       INTEGER REFERENCES users(id),
  locked_at       TIMESTAMPTZ,
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 1d. `procurement_cockpit_summary` materialized view

Columns: `project_id`, `total_lines`, `open_lines`, `closed_lines`, `cancelled_lines`,
`lines_requiring_reconciliation`, `open_ncr_count`, `sap_synced_po_count`,
`sap_error_count`, `sap_mismatch_count`, `procurement_completion_pct`,
`on_time_delivery_pct`, `refreshed_at`.

Refresh strategy: `REFRESH MATERIALIZED VIEW CONCURRENTLY` via unique index
`idx_cockpit_summary_project` — safe for concurrent reads.

### 1e. Phase 4 Indexes confirmed (14 total including Phase 3)

| Index Name | Table | Columns |
|---|---|---|
| `idx_plc_sap_sync` | `epc_purchase_orders` | `(sap_sync_status)` WHERE NOT NULL |
| `idx_grn_sap_sync` | `plc_grn_records` | `(sap_sync_status)` WHERE NOT NULL |
| `idx_rate_contract_plc_line` | `plc_rate_contract_refs` | `(plc_line_id)` |
| `idx_rate_contract_project` | `plc_rate_contract_refs` | `(project_id)` |
| `idx_rate_contract_vendor` | `plc_rate_contract_refs` | `(vendor_id)` WHERE NOT NULL |
| `idx_cockpit_summary_project` | `procurement_cockpit_summary` | `(project_id)` UNIQUE |

Plus all Phase 1–3 indexes: `idx_plc_project_status`, `idx_plc_project_vendor`,
`idx_plc_project_subgroup`, `idx_plc_required_date`, `idx_plc_qty_balance`,
`idx_pogline_group`, `idx_grn_inspection_status`, `idx_audit_entity`.

---

## 2. Backend — SAP & Governance Routes (T002)

**File:** `server/plc-sap-routes.ts`  
**Registration:** `server/routes.ts` lines 3919–3925 via `setupPlcSapRoutes(app)`  
**Auth guard:** `ensureAuthenticated` + `requirePageAccess('procurement-list-control')` on ALL routes.  
**Manager guard:** `isManagerOrAbove()` check on push-po, reconcile, refresh-summary, line-close, rate-contract lock.

### Route inventory

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/plc-sap/push-po/:epcPoId` | Auth + Page + Manager | Push approved EPC PO to SAP B1 PurchaseOrders |
| POST | `/api/plc-sap/push-grn/:grnId` | Auth + Page | Push accepted GRN to SAP B1 GoodsReceiptPO |
| POST | `/api/plc-sap/pull-grn/:epcPoId` | Auth + Page | Pull GRNs from SAP B1 → create `plc_grn_records` shells |
| POST | `/api/plc-sap/reconcile/:epcPoId` | Auth + Page + Manager | Diff THERMOPAC vs SAP qty per line; writes `sap_sync_status` |
| GET | `/api/plc-sap/sync-status/:epcPoId` | Auth + Page | Current sync status for one PO |
| POST | `/api/plc-sap/refresh-summary` | Auth + Page + Manager | Trigger `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| GET | `/api/projects/:projectId/cockpit-summary` | Auth + Page | Read cockpit summary from mat view |
| GET | `/api/projects/:projectId/procurement-list/export-csv` | Auth + Page | Streaming CSV export (filter by status/subgroup) |
| POST | `/api/procurement-list-lines/:id/close` | Auth + Page + Manager | Line closure; force-close path requires reason |
| GET | `/api/plc-rate-contracts` | Auth + Page | List rate contract refs (projectId / plcLineId filter) |
| POST | `/api/plc-rate-contracts` | Auth + Page | Create rate contract ref |
| PATCH | `/api/plc-rate-contracts/:id/lock` | Auth + Page + Manager | Lock / unlock rate |

### SAP session zero-trust pattern

All SAP push/pull/reconcile routes call `sapSessionManager.getSession(userId)` before touching the SAP B1 API. If no active session exists, the route returns **HTTP 409** with `code: SAP_SESSION_REQUIRED`. No SAP call is made without a live, user-bound session.

### Transaction safety

Push-PO and push-GRN use `BEGIN / COMMIT / ROLLBACK` client transactions:
- Row-level lock (`FOR UPDATE`) on the PO/GRN record before payload build.
- SAP call happens outside the DB transaction to avoid holding locks during network I/O.
- `sap_sync_status = 'error'` written on failure; audit log entry written on both success and failure.
- No double-push: checks `sap_po_doc_entry IS NOT NULL` → returns 400 if already pushed.

### CSV export security

- Uses `pool.query` with parameterized `$1`, `$2` … inputs — no SQL injection.
- Auth + page guard enforced; response streams directly to client with `Content-Disposition: attachment`.
- All columns from `procurement_list_lines` + joined GRN + PO, including SAP sync columns.

---

## 3. Notification Engine (T003)

**File:** `server/plc-notification-service.ts`  
**Pattern:** All functions call `createNotification()` from `server/notification-routes.ts` line 204.

### 14 event types implemented

| Function | Event Type | Trigger |
|---|---|---|
| `notifyPlcLineOverdue` | `plc_delivery_overdue` | Escalation job — required_by_date < today |
| `notifyPlcPogApprovalPending` | `plc_pog_approval_pending` | POG in 'submitted' > 24h |
| `notifyPlcGrnPendingInspection` | `plc_grn_pending_inspection` | GRN in 'received' status > 48h |
| `notifyPlcInspectionFailed` | `plc_inspection_failed` | Post-inspection: all units rejected |
| `notifyPlcNcrRaised` | `plc_ncr_raised` | Post-inspection: NCR auto-raised |
| `notifyPlcVendorAvlBypass` | `plc_vendor_avl_bypass` | AVL bypass recorded |
| `notifyPlcVendorAvlExpiry` | `plc_vendor_avl_expiry` | Qualification nearing expiry |
| `notifyPlcPoAmendment` | `plc_po_amendment` | PO amendment submitted |
| `notifyPlcLineStatusChange` | `plc_line_status_change` | Line status transition |
| `notifyPlcQuantityMismatch` | `plc_quantity_mismatch` | qty_over_procured > 0 |
| `notifyPlcSapSyncError` | `plc_sap_sync_error` | SAP push returned error |
| `notifyPlcSapMismatch` | `plc_sap_mismatch` | Reconciliation found discrepancies |
| `notifyPlcLineClosed` | `plc_line_closed` | Line closed / force-closed |
| `notifyPlcRateContractExpiry` | `plc_rate_contract_expiry` | Rate contract nearing valid_to |

### Wiring into existing routes

**`server/plc-grn-routes.ts`** — post-commit block after inspection result:
```typescript
if (inspStatus === 'failed' || (rejected > 0 && accepted === 0)) {
  await notifyPlcInspectionFailed(id, grn.project_id, grn.grn_number, ...);
}
if (ncr) {
  await notifyPlcNcrRaised(ncr.id, grn.project_id, ncr.ncr_number, ...);
}
```
Both calls are wrapped in `try { … } catch { /* non-fatal */ }` — notification failure never rolls back the inspection result.

### Escalation bulk scanners

| Function | Scan query | Target |
|---|---|---|
| `runOverdueScan()` | `required_by_date < CURRENT_DATE AND status NOT IN (closed, cancelled)` | All projects |
| `runPogApprovalStaleScan()` | `status='submitted' AND submitted_at < NOW() - 24h` | epc_po_groups |
| `runGrnPendingInspectionScan()` | `status='received' AND inspection_status='pending' AND created_at < NOW() - 48h` | plc_grn_records |
| `runRateContractExpiryScan()` | `valid_to BETWEEN NOW() AND NOW() + 14 days AND is_locked=false` | plc_rate_contract_refs |

---

## 4. Escalation Scheduler (T004)

**File:** `server/plc-escalation-job.ts`  
**Registration:** `server/routes.ts` lines 3923–3925 — `setupPlcEscalationJob()` + `setupCockpitSummaryRefresh()`

### Startup log (confirmed 13 May 2026 09:21:10)

```
[PLC-ESCALATION] Scheduling escalation job (6h interval for overdue; 24h for POG/GRN stale)
[PLC-ESCALATION] Scheduling cockpit summary refresh (5-min interval)
```

### Schedule

| Job | Interval | First run |
|---|---|---|
| Overdue delivery scan | 6 hours | On startup |
| POG approval stale scan | 24 hours | On startup |
| GRN pending inspection scan | 24 hours | On startup |
| Rate contract expiry scan | 24 hours | On startup |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY` | 5 minutes | On startup |

---

## 5. Frontend Enhancements (T005)

**File:** `client/src/pages/procurement-list-control-page.tsx`

### Phase 4 additions

| Feature | Location | API Used |
|---|---|---|
| CSV Export button | Lines tab toolbar | `GET /api/projects/:id/procurement-list/export-csv` |
| "Close Line" action | Lines tab row dropdown | `POST /api/procurement-list-lines/:id/close` |
| SAP Sync status badge | PO Groups table — new column | `pog.sapSyncStatus` |
| Cockpit Summary KPI card | KPI tab | `GET /api/projects/:id/cockpit-summary` (5-min refetch) |
| Rate Contract Refs table | KPI tab | `GET /api/plc-rate-contracts?projectId=...` |
| Reconciliation Diff dialog | KPI tab + state | `POST /api/plc-sap/reconcile/:epcPoId` |
| Line Close confirm dialog | Phase 4 dialogs section | `closeLineMut` mutation |

### Line Close confirm dialog

- Shows PLC No, Tag No, current status.
- If status ≠ `fully_received` → force-close banner + mandatory reason field.
- Confirm button submits `{ forceClose, cancelReason }` to backend.
- Audit log entry written server-side with `forceClose` flag and reason.

### Reconciliation diff dialog

- Table per line: TP Ordered / SAP Ordered / TP Received / SAP Received / Match icon.
- Mismatch rows highlighted in red.
- Summary badge: "Quantities Match" (green) or "Discrepancies Found" (red).
- Audit log entry written server-side for every reconciliation run.

### KPI Cockpit card (materialized view)

Renders: Procurement Completion %, On-Time Delivery Rate %, Lines Requiring Reconciliation, Open NCR Count, SAP sync summary badges (synced / error / mismatch counts). Auto-refreshes every 5 minutes.

---

## 6. Zero-Trust Verification

### §29a — Quantity Integrity
- `recomputePlcQty()` in `plc-line-service.ts` called after every GRN accept/reject/waive.
- `qty_balance = qty_required - qty_received` enforced in DB trigger / service layer.
- Over-procurement: `qty_over_procured = MAX(0, qty_received - qty_required)` — surfaced in cockpit summary.

### §29b — Duplicate Prevention
- `procurement_list_lines.plc_number` — UNIQUE index per project.
- `epc_po_groups.pog_number` — UNIQUE per project.
- `plc_grn_records.grn_number` — UNIQUE per project (enforced by sequence generation).
- HTTP 409 on conflict.

### §29c — Concurrency Locking
- `pg_advisory_xact_lock(projectId)` in `createPlcLineInTx` (PPPC raise-pr path).
- `FOR UPDATE` row lock on EPC PO and GRN records before SAP push mutations.

### §29d — SAP Session Zero-Trust
- Every SAP push/pull route: `sapSessionManager.getSession(userId)` → 409 `SAP_SESSION_REQUIRED` if no session.
- Session is user-bound — no shared session pools.
- All SAP requests include `B1SESSION` + `ROUTEID` cookies from live session object.

### §29e — Audit Trail
- `logPlcAudit()` called on every state transition: SAP push, GRN accept, inspection, NCR raise, line close.
- Entries written to `procurement_list_audit_log` with `entity_type`, `entity_id`, `event_type`, `old_status`, `new_status`, `changed_by`, `notes`, `metadata` (JSONB).
- Audit writes inside DB transactions — rolled back with the parent transaction on failure.

### §29f — Manager-Only Escalation Gates
Routes gated by `isManagerOrAbove()` (roles: Superuser, GM, SM):
- `POST /api/plc-sap/push-po/:epcPoId`
- `POST /api/plc-sap/reconcile/:epcPoId`
- `POST /api/plc-sap/refresh-summary`
- `POST /api/procurement-list-lines/:id/close`
- `PATCH /api/plc-rate-contracts/:id/lock`

### §29g — Page Permission Enforcement
All Phase 4 routes: `requirePageAccess('procurement-list-control')` middleware applied before handler. Returns 403 for users without explicit page permission.

---

## 7. Startup Confirmation Log

Server log from 13 May 2026 09:21:10 (IST):

```
[PLC] Procurement List Control routes registered (Phase 1)
[VendorQual] AVL qualification routes registered
[PLC] Phase 4 SAP / governance routes registered
[PLC-ESCALATION] Scheduling escalation job (6h interval for overdue; 24h for POG/GRN stale)
[PLC-ESCALATION] Scheduling cockpit summary refresh (5-min interval)
```

All 5 Phase 4 subsystems registered without error.

---

## 8. File Summary

| File | Status | Role |
|---|---|---|
| `server/plc-sap-routes.ts` | NEW (411 lines) | SAP integration + governance (12 routes) |
| `server/plc-notification-service.ts` | NEW | 14 event types + 4 bulk scanners |
| `server/plc-escalation-job.ts` | NEW | Scheduler (6h / 24h / 5-min jobs) |
| `server/plc-grn-routes.ts` | MODIFIED | Notification wiring (inspection_failed, ncr_raised) |
| `server/routes.ts` | MODIFIED | Phase 4 registration at lines 3919–3925 |
| `client/src/pages/procurement-list-control-page.tsx` | MODIFIED | Phase 4 UI (CSV export, line close, SAP badge, KPI cockpit, reconcile dialog) |
| `docs/plc-phase4-evidence-package.md` | NEW | This document |
| `docs/procurement-list-control-implementation-tracker.md` | UPDATED | Phase 4 Complete |
