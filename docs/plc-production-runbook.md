# PLC Production Runbook
**Module:** Procurement List Control (PLC)  
**Version:** 1.0  
**Effective:** 13 May 2026  
**Status:** LIVE — Formally Approved

---

## 1. Production Rollout Checklist

### 1.1 Pre-Rollout (Admin, once)

- [ ] Confirm `page_permissions` granted for all procurement users (Pallab id=4, Akash id=10 — seeded Phase 1; add others via EPC Permission Control Dashboard)
- [ ] Confirm `doc_sequences` seeded: `POG`, `RFQ`, `GRN`, `MIR`, `NCR` (all seeded Phase 1/3)
- [ ] Confirm `procurement_cockpit_summary` materialized view exists and initial refresh has run
- [ ] Confirm escalation scheduler running: check server log for `[PLC-ESCALATION] Scheduling escalation job`
- [ ] Confirm SAP B1 credentials available for Finance/Procurement Lead (required for SAP push)
- [ ] Review `docs/procurement-list-control-baseline-v1.md` with Procurement Lead

### 1.2 Controlled Project Onboarding (First 3 Projects)

For each project:

1. **Verify PPPC is complete** — at least one PR raised (PPPC Phase 4 raise-pr) so PLC lines exist
2. **Navigate to Procurement List Control** in sidebar → select project
3. **Review All Lines tab** — confirm PLC numbers, tag nos, quantities match approved buy list
4. **Verify AVL status** — run AVL check on critical lines; flag any `avl_bypassed` lines for QA review
5. **Create first PO Group** — POG Wizard: select lines → assign vendor (from CBE recommendation) → set pricing → submit
6. **Manager approves POG** — POG detail sheet → Approve
7. **Issue EPC PO** — Links POG to a formal EPC Purchase Order
8. **SAP live validation** (supervised, see §5) — push PO to SAP B1 with Finance Lead present
9. **Record first GRN** when material arrives
10. **Inspect and accept** — QA team records inspection result
11. **Accept to stores** — Stores team confirms
12. **Run reconciliation** — compare THERMOPAC vs SAP quantities; confirm `synced` status
13. **Review KPI tab** — confirm cockpit summary shows correct completion %

### 1.3 Full Rollout (All Projects)

After 3-project supervised period passes with no critical issues:
- Onboard remaining active projects
- Enable self-service onboarding for Procurement team
- Brief managers on force-close governance and SAP push procedures

---

## 2. Page Permissions — Adding Users

To grant a new user access to PLC, navigate to **EPC Permission Control Dashboard** → find user → enable `procurement-list-control`.

Or via direct SQL (Admin only):
```sql
INSERT INTO page_permissions (user_id, page_key, granted_by, granted_at)
VALUES ({user_id}, 'procurement-list-control', {admin_user_id}, NOW())
ON CONFLICT (user_id, page_key) DO NOTHING;
```

**Manager-only actions** (Superuser / GM / SM only — no SQL needed, determined by role):
- Push PO to SAP B1
- Reconcile THERMOPAC vs SAP
- Trigger cockpit refresh
- Close / force-close PLC lines
- Lock rate contracts

---

## 3. SAP B1 Session Setup (Pre-Push)

Before any SAP push or reconciliation, the acting user must have an active SAP B1 session:

1. Navigate to SAP B1 Integration settings in THERMOPAC
2. Login with SAP B1 credentials (Service Layer URL, company DB, username, password)
3. System registers a live session via `sapSessionManager`
4. Session is user-bound — each user must login independently
5. Session expires on logout or SAP B1 timeout

If SAP push returns HTTP 409 `SAP_SESSION_REQUIRED` — user must re-login to SAP B1 first.

---

## 4. Document Sequences — Current State

| Sequence Key | Project | Next Seq | Format |
|---|---|---|---|
| `POG` | Per project | 1 (auto-increments per project) | `{FY}-{ProjectCode}-POG-{NNN}` |
| `RFQ` | Per project | 1 (auto-increments per project) | `{FY}-{ProjectCode}-RFQ-{NNN}` |
| `GRN` | Global | 1 | `{FY}-{ProjectCode}-GRN-{NNN}` |
| `MIR` | Global | 1 | `{FY}-{ProjectCode}-MIR-{NNN}` |
| `NCR` | Global | 1 | `{FY}-{ProjectCode}-NCR-{NNN}` |

Sequences use `pg_advisory_xact_lock` — concurrent document creation is safe.

---

## 5. SAP Live Validation Protocol

**First live SAP push must be witnessed by Finance/Procurement Lead.**

### 5.1 Pre-Push Checklist
- [ ] EPC PO status = `approved`
- [ ] All PO Group lines have confirmed vendor and pricing
- [ ] PO amount matches CBE-finalized price
- [ ] SAP B1 session active (user logged in)
- [ ] SAP B1 test environment push done first (recommended for first project)

### 5.2 Push Execution
1. Open PO Group detail → "Push to SAP B1" button (Managers only)
2. Confirm in dialog
3. Observe: `sap_sync_status` changes from `pending` → `synced`
4. Note SAP DocEntry and DocNum returned
5. Verify in SAP B1 UI: PurchaseOrders → confirm document exists with correct lines and amounts

### 5.3 Post-Push Reconciliation
Run within 24h of push:
1. KPI tab → "Reconcile" button on the PO
2. Confirm all lines show ✓ (green) match
3. If mismatch: raise SAP correction and re-run reconciliation until `synced`

### 5.4 GRN Push Validation
After goods received and inspection passed:
1. GRN tab → push GRN to SAP B1
2. Verify SAP B1 GoodsReceiptPO document created
3. Confirm `sap_sync_status = 'synced'` on GRN record

---

## 6. Production Monitoring

### 6.1 Server Log Signals (healthy)

```
[PLC] Phase 4 SAP / governance routes registered
[PLC-ESCALATION] Scheduling escalation job (6h interval for overdue; 24h for POG/GRN stale)
[PLC-ESCALATION] Scheduling cockpit summary refresh (5-min interval)
[PLC-ESCALATION] Scan complete in NNms      ← every 6h; scanned/notified counts expected
```

### 6.2 Alert Signals (requires action)

| Log Pattern | Meaning | Action |
|---|---|---|
| `[PLC-SAP] push-po error:` | SAP PO push failed | Check SAP session; retry push; check SAP B1 connectivity |
| `[PLC-SAP] reconcile error:` | Reconciliation failed | Check SAP session; re-run reconciliation |
| `[PLC-ESCALATION] Cockpit refresh error:` | Mat view refresh failed | Check DB connectivity; manually trigger via `POST /api/plc-sap/refresh-summary` |
| `sap_sync_status = 'error'` appearing in logs | SAP sync errors accumulating | Review `epc_purchase_orders` for error rows; re-push affected POs |

### 6.3 Weekly KPI Review (Procurement Lead)

Review every Monday:
1. Open KPI tab for each active project
2. **Procurement Completion %** — target > 80% for projects in execution phase
3. **On-Time Delivery Rate %** — alert if < 90%
4. **Lines Requiring Reconciliation** — must be 0 after each weekly reconciliation run
5. **Open NCRs** — all NCRs > 5 days old require disposition
6. **SAP Sync status** — all pushed POs must show `synced`; zero `error` or `mismatch`

### 6.4 Notification Monitoring

Check notification inbox for:
- `plc_delivery_overdue` — expedite affected lines
- `plc_pog_approval_pending` — Manager must approve or reject within 24h
- `plc_grn_pending_inspection` — QA must complete inspection within 48h
- `plc_sap_sync_error` — Finance to re-push within same business day
- `plc_sap_mismatch` — Reconciliation correction required within 2 business days
- `plc_ncr_raised` — QA Lead to initiate NCR disposition

### 6.5 Daily Checklist (Procurement Team)

- [ ] Review unread notifications for PLC event types
- [ ] Check GRN tab for materials received yesterday — inspect and accept within 48h
- [ ] Check Lines tab for `overdue` status lines — expedite with vendor
- [ ] Check PO Groups for any `draft` POGs > 24h — submit or cancel

---

## 7. CSV Export — Regular Reporting

Use CSV export (Lines tab → Export CSV) for:
- Weekly procurement status reports to management
- Input to ERP/finance reconciliation
- Audit trail exports (includes `sap_po_doc_entry`, `sap_sync_status` columns)

Export by status:
- `Status: All` — full project snapshot
- `Status: Overdue` — expediting report
- `Status: Partially Received` — open delivery follow-up
- `Status: Mismatch` — SAP correction list

---

## 8. Rate Contract Management

For repeat suppliers with agreed framework rates:

1. Open KPI tab → Rate Contract Refs section (or create via API)
2. Enter `rate_per_unit`, `currency`, `valid_from`, `valid_to`, `contract_ref`
3. Once reviewed and approved by Finance: **Lock** the rate (Manager action)
4. Locked rates are excluded from the 14-day expiry notification — intentional
5. Before a rate contract expires (`valid_to` approaching): Finance renews and creates a new record

---

## 9. Line Closure — Governance

### Standard Close
- Only available when line `status = fully_received`
- Manager closes via Lines tab → row menu → "Close Line"
- No reason required (standard flow)

### Force Close
- Available for lines not yet fully received
- Requires a written reason (e.g., "Scope cancelled", "Material substitution approved")
- Reason appended to `internal_notes` with Manager ID and date
- Audit log entry recorded with `forceClose: true`
- Notification sent to project stakeholders
- **Irreversible** — closed lines cannot be re-opened

---

## 10. Incident Response

### SAP Push Failure
1. Check `epc_purchase_orders.sap_sync_status` — confirm `error`
2. Read `sap_sync_note` for error detail
3. Verify SAP B1 session active for the user
4. Verify SAP B1 service layer reachable
5. Retry push; if persistent error, contact SAP B1 admin

### Quantity Discrepancy (THERMOPAC vs SAP)
1. Run reconciliation from KPI tab
2. Review diff table — identify mismatched lines
3. Raise SAP B1 journal correction for the affected PO
4. Re-run reconciliation after correction
5. Confirm `sap_sync_status = 'synced'`

### NCR Raised — Disposition
1. QA Lead reviews NCR in GRN tab
2. Actions: Accept Under Concession / Return to Vendor / Scrap
3. If Return to Vendor: raise debit note and update PO quantity
4. Close NCR in system once disposition complete

### Escalation Notification Storm
If escalation scanner sends unexpected volume of notifications:
1. Check server log: `[PLC-ESCALATION] Scan complete` — review `scanned` and `notified` counts
2. If legitimate (real overdue items): proceed with expediting
3. If spurious: check if `required_by_date` data is correctly populated on lines
4. Superuser can temporarily adjust line `required_by_date` via Lines tab if dates were entered incorrectly

---

## 11. Governance — Future Enhancements

All future PLC changes must:
1. Maintain zero-trust architecture: SAP session check on all push routes, `requirePageAccess`, audit log
2. Use `logPlcAudit()` from `server/plc-line-service.ts` for any state-changing event
3. Maintain `record_type` isolation if trial/official split is ever introduced
4. Follow GCS governance (`docs/gcs-governance-rev4-closure.md`) for any document attachments
5. Include targeted typecheck evidence before merge
6. Document in evidence package format matching `docs/plc-phase4-formal-evidence-submission.md`

---

*Runbook version 1.0 — effective 13 May 2026*  
*Next review: After first full project completes PLC lifecycle (PR → GRN → SAP sync → KPI closure)*
