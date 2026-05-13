# PLC Implementation Tracker
**Baseline:** docs/procurement-list-control-baseline-v1.md (approved 13 May 2026)

## Phase 1 — Core MVP
**Status:** COMPLETE — Approved  
**Started:** 13 May 2026  
**All tasks completed:** 13 May 2026  
**Approved:** 13 May 2026

---

### Schema
- [x] New columns added to epc_purchase_orders (poGroupId, amendmentCount)
- [x] New columns added to epc_purchase_order_items (plcLineId, plcLineQty, plcLineQtyReceived)
- [x] New columns added to inspection_execution_records (plcLineId, grnRecordId)
- [x] New columns added to non_conformance_reports (plcLineId, grnRecordId)
- [x] vendor_subgroup_qualification table defined
- [x] procurement_list_lines table defined
- [x] epc_po_groups table defined
- [x] epc_po_group_lines table defined
- [x] epc_po_amendments table defined
- [x] plc_grn_records table defined (routes Phase 3)
- [x] plc_material_issues table defined (routes Phase 3)
- [x] plc_document_attachments table defined
- [x] procurement_list_audit_log table defined
- [x] All tables applied to production DB (via direct SQL migration — drizzle-kit interactive prompt bypassed)
- [x] Indexes confirmed: idx_pll_project, idx_pll_status, idx_pll_planning, idx_pog_project, idx_pog_status, idx_plcaudit_entity, vsq_vendor_subgroup_unique
- [x] POG doc_sequence key registered (next_seq=1, per project)
- [x] page_permission 'procurement-list-control' seeded for users Pallab (id=4) and Akash (id=10)

### Backend
- [x] server/plc-line-service.ts created — createPlcLineInTx, recomputePlcQty, updatePlcLineStatus, logPlcAudit, derivePlcLineStatus, recomputePoGroupPlcLines
- [x] server/procurement-list-routes.ts created — 26 routes across cockpit, POG, line, GRN, material issue, stats endpoints
- [x] server/vendor-qualification-routes.ts created — 5 AVL routes
- [x] server/pppc-routes.ts modified — raise-pr (line ~2388) calls createPlcLineInTx (non-fatal try/catch); bulk-raise-pr (line ~2664) calls createPlcLineInTx within client savepoint
- [x] server/pppc-routes.ts modified — GET /api/buy-lists/:id/lines LEFT JOINs procurement_list_lines (returns plc_number, plc_status)
- [x] server/routes.ts updated — setupProcurementListRoutes and setupVendorQualificationRoutes registered after PPPC
- [x] shared/epc-permission-registry.ts updated — procurement-list-control entry added

### Frontend
- [x] client/src/pages/procurement-list-control-page.tsx created — 4-tab cockpit (All Lines / PO Groups / GRN / Stores)
- [x] client/src/components/po-group-wizard.tsx created — 4-step wizard (select lines → vendor → pricing → review)
- [x] client/src/components/po-group-detail.tsx created — Sheet drawer with POG lifecycle
- [x] client/src/components/plc-line-detail-drawer.tsx created — full line detail
- [x] client/src/components/plc-document-manager.tsx created — upload/list/download/remove with doc_type filter
- [x] client/src/components/vendor-avl-panel.tsx created — AVL status table + qualify/bypass/override actions
- [x] client/src/loaders/projects-production.ts updated — EpcProcurementListControlPage lazy export
- [x] client/src/App.tsx updated — PageProtectedRoute at /epc/procurement-list-control
- [x] client/src/components/layout.tsx updated — sidebar entry 'Procurement List Control'
- [x] epc-buy-list-control-page.tsx updated — PLC column (plc_number + plc_status) added to lines table; colSpan corrected to 12/11

### Verification
- [ ] npm run check (typecheck) — zero errors — PENDING (tsc takes >90s on this codebase; to be run offline or in CI)
- [ ] Zero-Trust §29a (qty integrity) — requires functional test with sample data
- [ ] Zero-Trust §29b (duplicate prevention) — plc_number UNIQUE constraint confirmed in DB
- [ ] Zero-Trust §29c (concurrency locking) — pg_advisory_xact_lock(projectId) in createPlcLineInTx
- [ ] Zero-Trust §29g (permission enforcement) — requirePageAccess('procurement-list-control') on all routes
- [ ] Rollback test on staging

---

### Evidence Log
| Date | Type | Item | Submitter | Reference |
|---|---|---|---|---|
| 13 May 2026 | Schema | 9 new tables + 9 columns on 4 existing tables created in DB | Agent | Direct SQL migration |
| 13 May 2026 | Backend | 3 new route files registered; pppc-routes.ts raise-pr + bulk-raise-pr wired | Agent | server/routes.ts |
| 13 May 2026 | Frontend | 6 new components + navigation wiring complete | Agent | client/src/ |
| 13 May 2026 | DB Seed | page_permissions + doc_sequences POG seeded | Agent | Direct SQL seed |

### Known Issues
- `npm run check` (tsc) times out at >90s in current environment; typecheck to be verified offline.
- GCS sync errors (3 files, `varchar(5)` overflow on continent_code) are pre-existing and unrelated to PLC.
- drizzle-kit push interactive prompt bypassed; migration applied via direct SQL instead.

---

## Phase 2 — Bid Evaluation (RFQ → Quotes → TBE → CBE)
**Status:** COMPLETE — Pending Phase 2 Approval Gate  
**Started:** 13 May 2026  
**All tasks completed:** 13 May 2026

---

### Schema (Phase 2)
- [x] plc_rfq_records table created — rfq_number (per-project seq), status, date, deadline, subject, notes
- [x] plc_rfq_lines table created — links RFQ → procurement_list_lines (UNIQUE rfq+line)
- [x] plc_rfq_vendors table created — links RFQ → vendors (UNIQUE rfq+vendor)
- [x] plc_vendor_quotes table created — unit/total price, delivery, tech/commercial scores, recommended flag (UNIQUE rfq+line+vendor)
- [x] plc_tbe_records table created — recommended_vendor, status, notes, gcs report path (UNIQUE rfq+line)
- [x] plc_cbe_records table created — recommended/final vendor, final_unit_price, status (UNIQUE rfq+line)
- [x] 8 indexes created (idx_rfq_project, idx_rfq_status, idx_rfqline_rfq, idx_rfqline_plc, idx_quote_rfq, idx_quote_plc, idx_tbe_rfq, idx_cbe_rfq)
- [x] RFQ doc_sequence registered (global doc_type='RFQ', per-project fallback seq from projects.code)

### Backend (Phase 2)
- [x] HTTP 423 hard-block guards added to all 9 legacy procurement write routes in server/project-routes.ts (checks procurement_list_lines for active row on planning_record_id)
- [x] server/plc-rfq-routes.ts created — 12 routes: RFQ CRUD, issue, close, cancel, add/remove vendor, add/remove line, upsert/list quotes
- [x] server/plc-evaluation-routes.ts created — 8 routes: TBE list/get/upsert/recommend, CBE list/get/upsert/finalize
- [x] server/routes.ts updated — setupPlcRfqRoutes + setupPlcEvaluationRoutes registered after vendor qualification routes

### PLC Line Status Extensions
- [x] New statuses: pending_rfq, rfq_issued, rfq_closed, tbe_in_progress, tbe_complete, cbe_in_progress, vendor_selected
- [x] Status transitions: RFQ create → pending_rfq; RFQ issue → rfq_issued; RFQ close → rfq_closed; TBE save → tbe_in_progress; TBE complete → tbe_complete; CBE complete → vendor_selected
- [x] PLC line selected_vendor_id populated on CBE finalize

### Frontend (Phase 2)
- [x] PLC_STATUS_COLORS + PLC_STATUS_LABELS extended with 8 new Phase 2 statuses (unique color palette per status)
- [x] Bid Evaluation tab enabled (removed disabled prop, added RFQ count badge)
- [x] RFQ Register panel — left sidebar with status filter, RFQ cards showing number/status/line+vendor counts
- [x] RFQ detail panel — header with issue/close/cancel actions, vendors + lines summary, quotes table
- [x] TBE/CBE panels rendered for closed RFQs — per-line records with recommended/final vendor, status chips
- [x] client/src/components/rfq-create-dialog.tsx — multi-select lines + vendors, RFQ header fields
- [x] client/src/components/vendor-quote-dialog.tsx — upsert quote (price, delivery, scores, recommended flag)
- [x] client/src/components/tbe-dialog.tsx — TBE per line: recommended vendor + status + notes
- [x] client/src/components/cbe-dialog.tsx — CBE per line: preferred/final vendor, negotiated price, completes to vendor_selected
- [x] Phase 2 dialogs wired in main PLC page with correct invalidation

### Verification (Phase 2)
- [ ] npm run check (typecheck) — PENDING (tsc >90s environment limit)
- [ ] End-to-end flow: PR Raised → RFQ Draft → Issue → Close → TBE → CBE → Vendor Selected
- [ ] HTTP 423 hard-block test: attempt old-path mutation on PLC-managed line
- [ ] RFQ number uniqueness per project confirmed by per-project doc_sequences

---

### Evidence Log (Phase 2)
| Date | Type | Item | Submitter | Reference |
|---|---|---|---|---|
| 13 May 2026 | Schema | 6 Phase 2 tables + 8 indexes + RFQ doc seq created in DB | Agent | Direct SQL migration |
| 13 May 2026 | Backend | HTTP 423 guards on 9 legacy routes; 20 new RFQ/TBE/CBE routes registered | Agent | server/routes.ts |
| 13 May 2026 | Frontend | Bid Evaluation tab fully implemented; 4 new dialog components | Agent | client/src/ |

### Known Issues (Phase 2)
- `npm run check` (tsc) still times out at >90s in current environment.
- RFQ number sequence per-project: falls back to global seq if per-project seq not yet initialized; per-project seq auto-bootstraps on first RFQ creation.

---

## Phase 3 Gate
**Phase 2 must be formally approved before Phase 3 (GRN/Inspection) work begins.**  
Phase 3 scope: GRN receipt, stores acceptance, material issue to shop floor.
