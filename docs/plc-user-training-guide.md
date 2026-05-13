# PLC User Training Guide
**Module:** Procurement List Control (PLC)  
**Audience:** Procurement Team, QA Team, Finance/Procurement Lead, Stores  
**Version:** 1.0 — 13 May 2026

---

## Overview

The Procurement List Control (PLC) module tracks every procurement line from purchase requisition through to goods receipt, inspection, stores acceptance, and SAP B1 synchronisation. It is the single source of truth for procurement status on every THERMOPAC project.

Navigate to it via the sidebar: **Procurement List Control**

---

## Module 1 — Getting Started

### 1.1 Selecting a Project

1. Click **Procurement List Control** in the sidebar
2. Use the **Project** dropdown at the top to select your project
3. All tabs (Lines, Bid Evaluation, PO Groups, GRN Tracking, KPI) filter to that project

### 1.2 Understanding PLC Numbers

Each procurement line has a unique PLC number in the format:
```
2627-013-PLC-0001
```
- `2627` = Financial Year
- `013` = Project sequence
- `PLC` = Document type
- `0001` = Sequential number

PLC lines are automatically created when a Purchase Requisition is raised in PPPC.

---

## Module 2 — All Lines Tab (Procurement Team)

### 2.1 Reading the Lines Table

| Column | Meaning |
|---|---|
| PLC No | Unique line identifier |
| Tag No | Equipment tag number |
| Subgroup | Equipment category (e.g., PT, TT, FT) |
| Description | Item description |
| Qty Required | Total quantity to procure |
| Qty Ordered | Quantity on issued POs |
| Qty Received | Quantity accepted in GRN |
| Qty Balance | Remaining to receive |
| Status | Current procurement status |
| Vendor | Selected vendor (from CBE) |

### 2.2 Line Status Reference

| Status | Meaning | Action Required |
|---|---|---|
| `pr_raised` | PR submitted, awaiting RFQ | Create RFQ in Bid Evaluation tab |
| `pending_rfq` | RFQ being prepared | Issue RFQ to vendors |
| `rfq_issued` | RFQ sent to vendors | Await vendor quotes |
| `rfq_closed` | Quotes received | Begin TBE |
| `tbe_complete` | Technical bid evaluation done | Begin CBE |
| `vendor_selected` | Vendor chosen in CBE | Create PO Group |
| `po_issued` | PO raised and issued | Await delivery |
| `partially_received` | Some material received | Continue expediting |
| `fully_received` | All material received | Close line or await stores |
| `closed` | Line completed and closed | No action |
| `overdue` | Past required-by date | **Expedite immediately** |

### 2.3 Filtering Lines

- **Status filter** — show only lines in a specific status
- **Subgroup filter** — show only a specific equipment category
- **Search** — find by PLC number, tag no, or description

### 2.4 Exporting to CSV

Click **Export CSV** in the toolbar to download a spreadsheet of all lines matching the current filter. The file includes SAP sync status — useful for weekly reporting.

### 2.5 Viewing Line Detail

Click any line row to open the **Line Detail Drawer** which shows:
- Full quantities and status history
- Linked POG, GRN, and MIR records
- AVL (Approved Vendor List) status
- Attached documents

---

## Module 3 — Bid Evaluation Tab (Procurement Team)

### 3.1 Creating an RFQ

1. Click **New RFQ**
2. Select lines to include
3. Add vendors to invite (must be on Approved Vendor List or AVL-bypassed)
4. Set RFQ subject, date, and deadline
5. **Issue RFQ** — status moves from `draft` to `issued`

### 3.2 Recording Vendor Quotes

For each vendor, for each line:
1. Open the vendor quote dialog
2. Enter: unit price, delivery weeks, technical score (0–100), commercial score (0–100)
3. Mark recommended if applicable
4. Save — repeat for all vendors and lines

### 3.3 Technical Bid Evaluation (TBE)

After closing the RFQ:
1. TBE panel appears per line
2. Select technically recommended vendor with justification
3. Status moves to `tbe_complete`

### 3.4 Commercial Bid Evaluation (CBE)

After TBE:
1. CBE panel appears per line
2. Enter final negotiated price and select final vendor
3. **Finalize CBE** — status moves to `vendor_selected`; vendor is recorded on the line

---

## Module 4 — PO Groups Tab (Procurement Team / Manager)

### 4.1 Creating a PO Group

A PO Group (POG) consolidates multiple PLC lines into one purchase order to a single vendor.

1. Click **New PO Group**
2. **Step 1 — Select Lines**: tick lines for this vendor (lines must have a selected vendor)
3. **Step 2 — Vendor**: confirm vendor details
4. **Step 3 — Pricing**: enter unit prices and total
5. **Step 4 — Review**: confirm all details
6. **Submit** — POG enters `submitted` status for Manager approval

### 4.2 Approving a PO Group (Manager)

1. Click a POG row to open the detail sheet
2. Review line items, vendor, and pricing
3. Click **Approve** (or **Reject** with reason)
4. Approved POGs can be linked to EPC Purchase Orders

### 4.3 SAP Sync Badge

The **SAP Sync** column shows the sync status of the linked EPC PO:
- *(blank)* — not yet pushed to SAP
- **synced** (green) — SAP B1 document confirmed
- **mismatch** (amber) — quantities differ between THERMOPAC and SAP
- **error** (red) — last push failed; re-push required

---

## Module 5 — GRN Tracking Tab (Stores / QA Team)

### 5.1 Recording a Goods Receipt (GRN)

When materials arrive at site:

1. Click **Record GRN**
2. Select the PLC line being received
3. Enter:
   - GRN quantity (cannot exceed qty remaining)
   - Receipt date (actual physical receipt)
   - Delivery challan / packing slip number
   - Transporter and LR number (optional)
   - Vendor override if material came from secondary source
4. **Save** — GRN created with status `received`, inspection pending

### 5.2 Inspecting Received Material (QA Team)

Within 48 hours of GRN:

1. Find GRN in the table
2. Actions menu → **Record Inspection**
3. Enter:
   - **Accepted Qty** — material meeting specification
   - **Rejected Qty** — material failing inspection
   - **QC Report Reference**
   - **Inspector Name**
4. If rejected qty > 0 → system auto-raises an NCR
5. **Save** — GRN moves to `passed`, `partial`, or `failed`

**Waive Inspection:** If inspection is not required for this item (e.g., certified material), select **Waive Inspection** with a written reason. All quantity is automatically accepted.

### 5.3 Accepting to Stores

After inspection passed:
1. Actions menu → **Accept to Stores**
2. Enter stores acceptance notes and location reference
3. Material is now in stores — available for issue

### 5.4 Issuing Material (Material Issue Request — MIR)

When material is needed from stores:
1. Select the relevant GRN or use the MIR panel below the GRN table
2. Click **Issue Material**
3. Enter:
   - Qty to issue (cannot exceed available in stores)
   - Issued to (person/department)
   - Purpose
4. MIR number auto-generated — print and file with stores records

---

## Module 6 — KPI Dashboard Tab (Procurement Lead / Manager)

### 6.1 Procurement Summary Card

Shows at-a-glance:
- **Total / Open / Overdue / Over-Procured** line counts
- **Total Ordered Value** (sum of all PO amounts)

### 6.2 Cockpit Summary (Materialized — refreshes every 5 min)

| KPI | Target | Action if Below Target |
|---|---|---|
| Procurement Completion % | > 80% in execution phase | Expedite open lines |
| On-Time Delivery Rate % | > 90% | Review overdue lines; contact vendors |
| Lines Requiring Reconciliation | 0 | Run SAP reconciliation |
| Open NCRs | 0 | QA Lead to disposition within 5 days |

**SAP Sync summary badges** show how many POs are synced, in error, or have quantity mismatches.

### 6.3 Rate Contract References

Displays all framework rate contracts for the project. Locked rates (🔒) are final — only Managers can lock or unlock.

### 6.4 Alert Panel

Appears when:
- Lines are past `required_by_date` — immediately expedite
- Over-procurement detected — run reconciliation
- AVL bypass lines present — QA review required

---

## Module 7 — SAP B1 Integration (Finance / Procurement Lead)

### 7.1 Logging into SAP B1

Before any SAP push, you must have an active SAP B1 session in THERMOPAC:
1. Go to SAP B1 Integration settings
2. Enter your SAP credentials (Service Layer URL, company DB, your username, password)
3. Session is live until you logout or it times out

### 7.2 Pushing a PO to SAP B1

After a PO Group is approved and EPC PO issued:
1. Open PO Groups tab → click the POG
2. In the detail sheet → **Push to SAP B1** (visible to Managers only)
3. System creates a PurchaseOrders document in SAP B1
4. SAP DocEntry and DocNum recorded in THERMOPAC
5. Verify in SAP B1 UI that the document appears correctly

### 7.3 Running Reconciliation

After each delivery cycle (weekly):
1. KPI tab → **Reconcile** for each PO
2. System compares THERMOPAC qty vs SAP B1 qty per line
3. Diff table shows: TP Ordered | SAP Ordered | TP Received | SAP Received | Match ✓/⚠
4. If mismatch: raise SAP correction → re-run reconciliation
5. All POs must show `synced` before period close

### 7.4 Pushing GRNs to SAP B1

After inspection passed:
1. GRN Tracking tab → select GRN → Actions → **Push GRN to SAP B1**
2. Creates GoodsReceiptPO in SAP B1
3. Verify in SAP B1 that GRN document and quantities match

---

## Module 8 — Notifications

The system sends you notifications for PLC events. Check your notification bell for:

| Notification | Recipient | Action |
|---|---|---|
| Delivery Overdue | Procurement Team | Expedite vendor; update ETA |
| POG Approval Pending (24h) | Manager | Approve or reject POG |
| GRN Pending Inspection (48h) | QA Team | Record inspection result |
| Inspection Failed | QA Lead, Procurement | Review NCR; arrange return |
| NCR Raised | QA Lead | Begin NCR disposition |
| SAP Sync Error | Finance Lead | Re-push to SAP B1 |
| SAP Quantity Mismatch | Finance, Procurement Lead | Run reconciliation and correct |
| Line Closed | Project team | Informational |
| Rate Contract Expiring | Procurement Lead | Renew or lock rate |

---

## Quick Reference — Who Does What

| Action | Role |
|---|---|
| Create RFQ, record quotes, TBE, CBE | Procurement Team |
| Create PO Group | Procurement Team |
| Approve / Reject POG | Manager (GM / SM / Superuser) |
| Record GRN | Stores / Procurement |
| Inspect material, raise NCR | QA Team |
| Accept to stores, issue MIR | Stores |
| Push PO to SAP B1 | Manager + active SAP session |
| Run reconciliation | Manager + active SAP session |
| Close / force-close line | Manager |
| Lock rate contract | Manager |
| Export CSV | Any PLC user |
| View KPI dashboard | Any PLC user |

---

## Common Mistakes to Avoid

1. **GRN qty > qty balance** — system will reject; check remaining qty before recording GRN
2. **Pushing to SAP without active session** — log into SAP B1 first; system returns HTTP 409 with a clear message
3. **Pushing a PO before it's approved** — system blocks; PO must be in `approved` status
4. **Force-closing without a reason** — mandatory; system requires written justification
5. **Creating duplicate GRNs** — system prevents same SAP GRN DocEntry being imported twice
6. **Not running reconciliation after goods receipt** — always run within 24h of GRN push to SAP

---

*Training guide version 1.0 — 13 May 2026*  
*Questions: contact Procurement Lead or system administrator*
