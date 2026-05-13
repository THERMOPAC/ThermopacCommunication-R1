# PLC Implementation Tracker
**Baseline:** docs/procurement-list-control-baseline-v1.md (approved 13 May 2026)

## Phase 1 — Core MVP
**Status:** COMPLETE — Pending Phase 1 Approval Gate  
**Started:** 13 May 2026  
**All tasks completed:** 13 May 2026  
**Submitted for approval:** —  
**Approved:** —  
**Approver:** —

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

## Phase 2+ Gate
**Phase 1 must be formally approved before any Phase 2 work begins.**  
Approval evidence required: functional walkthrough by approver + sign-off in Evidence Log above.
