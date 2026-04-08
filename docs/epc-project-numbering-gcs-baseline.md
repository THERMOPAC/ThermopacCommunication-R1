# EPC Project Numbering & GCS Restructure — Implementation Baseline

**Status:** APPROVED — Source of truth for implementation and audit  
**Version:** v6-final  
**Approved:** 2026-04-08  

---

## Table of Contents

1. [Objectives & Non-Goals](#1-objectives--non-goals)
2. [Project Code Rules](#2-project-code-rules)
3. [Sequence Engine](#3-sequence-engine)
4. [Child Document Numbering](#4-child-document-numbering)
5. [Authoritative vs Legacy Tables](#5-authoritative-vs-legacy-tables)
6. [INV Split: EPC INV vs Finance INV](#6-inv-split-epc-inv-vs-finance-inv)
7. [GCS Path Rules](#7-gcs-path-rules)
8. [QTN Path Policy](#8-qtn-path-policy)
9. [Singletons](#9-singletons)
10. [Separate Numbering Systems (Unchanged)](#10-separate-numbering-systems-unchanged)
11. [Migration & Reset Rules](#11-migration--reset-rules)
12. [Phase Execution Order](#12-phase-execution-order)
13. [Assumptions & Constraints](#13-assumptions--constraints)

---

## 1. Objectives & Non-Goals

### Objectives

- Restructure project numbering from `TP-{CC}-{CO}-{Cust}-{FY}-{NNN}` to `{FY}-{NNN}`
- Implement a concurrency-safe sequence engine for PROJECT and all child document types
- Standardize all child document numbering to `{ProjectCode}-{DocType}-{NNNN}` (4-digit)
- Restructure GCS paths to use `fy_code` + `project_seq` fields (not parsed from code text)
- Make `code` the sole master external identifier; `operational_code` temporary until removal
- Cleanly reset all test-environment data to new format

### Non-Goals

- Finance invoice numbering (`INV-{YYZZ}-{NNN}`) is NOT changed
- Inspection Order format (`IO-{FY}-{Seq}-{Cat}-{NNNN}`) structure is NOT changed (only source fields updated)
- CodeBar format (`{BPCode}{FY4}{ProjectSeq3}{ItemSeq3}`) is NOT changed
- No new business features — this is a numbering/path restructure only

---

## 2. Project Code Rules

| Field | Role | Example | Derivation |
|-------|------|---------|-----------|
| `code` | Canonical project number — the ONLY external identifier | `2627-001` | `${fy_code}-${project_seq}` |
| `project_seq` | 3-digit sequence within FY | `001` | From `getNextProjectSeq(fyCode)` — atomic counter |
| `fy_code` | Authoritative FY field | `2627` | From offer's financial year |
| `operational_code` | Temporary compatibility alias | Same as `code` | Set equal to `code` until Phase 8 removal |

### Derivation Rules

- `code` is always composed as `${fy_code}-${project_seq}`
- GCS project root is always derived from `fy_code` + `project_seq` fields directly — NEVER by parsing `code` text
- `operational_code` must always equal `code` from Phase 2 onward
- After Phase 8, `operational_code` is removed entirely

---

## 3. Sequence Engine

### 3.1 Table: `doc_sequences`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | serial PK | Internal |
| `doc_type` | text, not null | All doc type codes |
| `fy_code` | varchar(4), nullable | Set for PROJECT rows only |
| `project_id` | integer, nullable, FK→projects(onDelete cascade) | Set for child doc rows only |
| `next_seq` | integer, not null, default 1 | Next available sequence |

### 3.2 Logical Keys (Partial Unique Indexes)

| Row type | Key | Constraint |
|----------|-----|-----------|
| PROJECT | `(doc_type, fy_code)` | Unique WHERE `project_id IS NULL` |
| Child docs | `(doc_type, project_id)` | Unique WHERE `project_id IS NOT NULL` |

### 3.3 Rules

- PROJECT: `fy_code` is the scope key. `project_id` is always NULL.
- Child docs: `project_id` is the sole scope key. `fy_code` is NOT stored (NULL).
- If FY is needed for display on child docs, join to `projects.fy_code`.

### 3.4 Service Functions (`server/doc-sequence-service.ts`)

**`getNextProjectSeq(fyCode, client?)`**
- For PROJECT only
- `INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq) VALUES ('PROJECT', $1, NULL, 1) ON CONFLICT (doc_type, fy_code) WHERE project_id IS NULL DO UPDATE SET next_seq = doc_sequences.next_seq + 1 RETURNING next_seq`
- Returns 3-digit padded string (e.g., `'001'`)
- Atomic, concurrency-safe — NO SELECT MAX

**`getNextDocSeq(docType, projectId, client?)`**
- For ALL project-scoped types
- `INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq) VALUES ($1, NULL, $2, 1) ON CONFLICT (doc_type, project_id) WHERE project_id IS NOT NULL DO UPDATE SET next_seq = doc_sequences.next_seq + 1 RETURNING next_seq`
- `project_id` is the sole scope key
- Returns 4-digit padded string (e.g., `'0001'`)
- Atomic, concurrency-safe

---

## 4. Child Document Numbering

### 4.1 Sequence Width Standard

- PROJECT: **NNN** (3 digits) — up to 999 projects per FY
- ALL child document types: **NNNN** (4 digits) — up to 9999 per project per type
- No exceptions. No mixed widths.

### 4.2 Complete Document Type Registry

| Doc Type | Full Name | Authoritative Table | Number Column | Scope | Format |
|----------|-----------|---------------------|---------------|-------|--------|
| PROJECT | Project | `projects` | `code` | FY-global | `{FY}-{NNN}` |
| WO | Work Order (EPC) | `epc_work_orders` | `wo_number` | Per project | `{PC}-WO-{NNNN}` |
| PO | Purchase Order (EPC) | `epc_purchase_orders` | `po_number` | Per project | `{PC}-PO-{NNNN}` |
| DWG | Drawing Control | `epc_drawing_controls` | `dwg_control_number` | Per project | `{PC}-DWG-{NNNN}` |
| BOM | Bill of Materials | `epc_bom_headers` | `bom_number` | Per project | `{PC}-BOM-{NNNN}` |
| PLN | Planning Record | `item_planning_records` | `planning_number` | Per project | `{PC}-PLN-{NNNN}` |
| BUY | Procurement Execution | `procurement_execution_records` | `procurement_number` | Per project | `{PC}-BUY-{NNNN}` |
| MFG | Production Execution | `production_execution_records` | `production_number` | Per project | `{PC}-MFG-{NNNN}` |
| QPL | Quality Plan | `quality_planning_records` | `quality_plan_number` | Per project | `{PC}-QPL-{NNNN}` |
| POP | PO Preparation | `po_preparation_records` | `po_prep_number` | Per project | `{PC}-POP-{NNNN}` |
| WOP | WO Preparation | `wo_preparation_records` | `wo_prep_number` | Per project | `{PC}-WOP-{NNNN}` |
| INS | Inspection Execution | `inspection_execution_records` | `inspection_number` | Per project | `{PC}-INS-{NNNN}` |
| DR | Dispatch Readiness | `epc_dispatch_readiness` | `dr_number` | Per project | `{PC}-DR-{NNNN}` |
| DSP | Dispatch Record | `epc_dispatch_records` | `dispatch_number` | Per project | `{PC}-DSP-{NNNN}` |
| CR | Commissioning Readiness | `epc_commissioning_readiness` | `cr_number` | Per project | `{PC}-CR-{NNNN}` |
| BR | Billing Readiness | `epc_billing_readiness` | `br_number` | Per project | `{PC}-BR-{NNNN}` |
| INV | Invoice (EPC) | `epc_invoices` | `invoice_number` | Per project | `{PC}-INV-{NNNN}` |
| MOM | Minutes of Meeting | *(if table exists)* | *(tbd)* | Per project | `{PC}-MOM-{NNNN}` |
| NCR | Non-Conformance Report | `non_conformance_reports` | *(number column)* | Per project | `{PC}-NCR-{NNNN}` |
| ECR | Engineering Change Request | `engineering_change_requests` | *(number column)* | Per project | `{PC}-ECR-{NNNN}` |
| ECN | Engineering Change Notice | `engineering_change_notices` | *(number column)* | Per project | `{PC}-ECN-{NNNN}` |

`{PC}` = ProjectCode = `{FY}-{NNN}` (e.g., `2627-001`)

---

## 5. Authoritative vs Legacy Tables

| Concept | Authoritative (EPC) | Legacy (Reference) | Migration Action |
|---------|---------------------|-------------------|-----------------|
| Work Orders | `epc_work_orders` | `work_orders` | Renumber both; legacy WO uses same sequence via `getNextDocSeq` |
| Purchase Orders | `epc_purchase_orders` | `purchase_orders` *(if exists)* | Renumber EPC; update legacy project_code if table exists |
| Dispatch | `epc_dispatch_readiness`, `epc_dispatch_records` | `dispatch_records`, `dispatch_items`, `dispatch_documents` | Renumber EPC; update legacy project references |
| Invoices | `epc_invoices` (project-scoped EPC doc) | `invoices` (finance-module FY-global) | Renumber EPC INV only; finance INV untouched |
| Commissioning | `epc_commissioning_readiness` | *(none)* | Renumber |
| Billing Readiness | `epc_billing_readiness` | *(none)* | Renumber |

---

## 6. INV Split: EPC INV vs Finance INV

| Attribute | EPC INV | Finance INV |
|-----------|---------|-------------|
| Table | `epc_invoices` | `invoices` |
| Scope | Per project | FY-global |
| Format | `{ProjectCode}-INV-{NNNN}` e.g. `2627-001-INV-0001` | `INV-{YYZZ}-{NNN}` e.g. `INV-2526-001` |
| Generator | `getNextDocSeq('INV', projectId)` via doc_sequences | MAX+1 parsing in `finance-routes.ts` |
| Purpose | EPC document control — invoice as project deliverable | Financial accounting — monetary tracking |
| Changed by this plan? | Yes — renumbered | No — untouched |

---

## 7. GCS Path Rules

### 7.1 Project Root

```
TPEL/{CC}/{CO}/{Cust}/{fy_code}/{project_seq}/
```

- Derived from `project.fy_code` + `project.project_seq` fields directly
- NEVER derived by parsing `project.code` text
- Example: `TPEL/SA/BR/LWA/2627/001/`

### 7.2 Child Folder Structure

```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/
  WO/{WOCode}/
  PO/{POCode}/
  Drawings/{DWGCode}/rev-{X}/
  BOM/{BOMCode}/
  PLN/{PLNCode}/
  BUY/{BUYCode}/
  MFG/{MFGCode}/
  QPL/{QPLCode}/
  POP/{POPCode}/
  WOP/{WOPCode}/
  INS/{INSCode}/
  DR/{DRCode}/
  DSP/{DSPCode}/
  CR/{CRCode}/
  BR/{BRCode}/
  INV/{INVCode}/
  Quality/QAP/{QAPCode}/
  Quality/ITP/{ITPCode}/
  Quality/NCR/{NCRCode}/
  MOM/{MOMCode}/
  ECR/{ECRCode}/
  ECN/{ECNCode}/
  Dispatch/
  Commissioning/
```

### 7.3 Legacy Paths (Must Not Remain in Active Code)

- `THERMOPAC_PROJECTS/${fy}/${project.code}/Dispatch/` — removed
- Any path using `operational_code` in GCS construction — removed

---

## 8. QTN Path Policy

| Stage | Ownership | Path |
|-------|-----------|------|
| Pre-conversion (offer-based) | Offer | `TPEL/{CC}/{CO}/{Cust}/{FY}/Quotations/{OfferNumber}/rev-{NN}/{seq}-{label}.pdf` |
| Post-conversion (project-based) | Project | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QTN/{OfferNumber}/rev-na/{seq}-{label}.pdf` |

- Pre-conversion file retained as reference, never modified after conversion
- Post-conversion copy is the controlled project document

---

## 9. Singletons

| Doc Type | Rule | Output |
|----------|------|--------|
| QAP | One per project, hardcoded | `{ProjectCode}-QAP-01` |
| ITP | One per project, hardcoded | `{ProjectCode}-ITP-01` |

No sequence row needed in `doc_sequences`.

---

## 10. Separate Numbering Systems (Unchanged)

| System | Format | Generator | Changed? |
|--------|--------|-----------|----------|
| Inspection Orders (IO) | `IO-{FY}-{ProjectSeq}-{Category}-{NNNN}` | `fixed-inspection-order-generator.ts` | Format unchanged; source fields updated to use `project.fy_code` + `project.project_seq` instead of `operational_code` |
| Finance Invoices | `INV-{YYZZ}-{NNN}` | `finance-routes.ts` MAX+1 | Not changed |
| CodeBars | `{BPCode}{FY4}{ProjectSeq3}{ItemSeq3}` | `epc-coding.ts` | Not changed |

---

## 11. Migration & Reset Rules

### 11.1 Project Code Reset

```sql
WITH ranked AS (
  SELECT id, fy_code,
    ROW_NUMBER() OVER (PARTITION BY fy_code ORDER BY id) AS new_seq
  FROM projects
)
UPDATE projects p SET
  project_seq = LPAD(r.new_seq::TEXT, 3, '0'),
  code = r.fy_code || '-' || LPAD(r.new_seq::TEXT, 3, '0'),
  operational_code = r.fy_code || '-' || LPAD(r.new_seq::TEXT, 3, '0')
FROM ranked r WHERE p.id = r.id;
```

### 11.2 Child Table project_code Updates

All tables with a `project_code` column linked to `project_id`:
- `project_items`, `inspection_orders`, `inspection_reports`, `non_conformance_reports`, `quality_checklists`, `design_projects`

### 11.3 Legacy work_orders Reset

```sql
WITH ranked AS (
  SELECT wo.id, p.code AS project_code,
    ROW_NUMBER() OVER (PARTITION BY wo.project_id ORDER BY wo.id) AS new_seq
  FROM work_orders wo JOIN projects p ON p.id = wo.project_id
)
UPDATE work_orders wo SET
  project_code = r.project_code,
  work_order_number = r.project_code || '-WO-' || LPAD(r.new_seq::TEXT, 4, '0')
FROM ranked r WHERE wo.id = r.id;
```

### 11.4 EPC Document Number Reset

For every table in Section 4.2 that has existing rows, apply:

```sql
WITH ranked AS (
  SELECT t.id, p.code,
    ROW_NUMBER() OVER (PARTITION BY t.project_id ORDER BY t.id) AS new_seq
  FROM {table} t JOIN projects p ON p.id = t.project_id
)
UPDATE {table} t SET
  {number_column} = r.code || '-{DOC_TYPE}-' || LPAD(r.new_seq::TEXT, 4, '0')
FROM ranked r WHERE t.id = r.id;
```

### 11.5 Sequence Seeding

```sql
-- PROJECT (FY-scoped)
INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq)
  SELECT 'PROJECT', fy_code, NULL,
    COALESCE(MAX(CAST(project_seq AS INTEGER)), 0) + 1
  FROM projects GROUP BY fy_code
  ON CONFLICT DO NOTHING;

-- All project-scoped types (template):
INSERT INTO doc_sequences (doc_type, fy_code, project_id, next_seq)
  SELECT '{DOC_TYPE}', NULL, project_id, COUNT(*) + 1
  FROM {table} GROUP BY project_id
  ON CONFLICT DO NOTHING;
```

### 11.6 GCS Object Migration

1. **Copy phase:** Compute new path from `project.fy_code` + `project.project_seq` (direct fields). Copy object. Update `gcs_object_path` in DB.
2. **Verification phase (mandatory):** HEAD request on every new path. Log VERIFIED or FAILED per object. Summary: total/verified/failed. **Any failures → STOP, no cleanup, report for review.**
3. **Cleanup phase (only after 100% verification):** Delete old objects.

---

## 12. Phase Execution Order

| # | Phase | Depends On | Destructive? |
|---|-------|-----------|-------------|
| 1 | Sequence Engine (table + service) | None | No |
| 2 | Project Code Refactor (offer-conversion, epc-coding) | 1 | No |
| 3 | WO/PO Numbering Refactor | 1, 2 | No |
| 4 | Child Doc Numbering (all 20+ types) | 1, 2 | No |
| 5 | Backend Route Updates (all files) | 2 | No |
| 6 | Frontend Updates | 2 | No |
| 7 | DB Migration Reset + GCS verify | 2, 3, 4, 5 | **Yes** |
| 8 | Remove operational_code | 5, 6, 7 | **Yes** |

---

## 13. Assumptions & Constraints

### Confirmed Assumptions

1. This is a test environment — clean reset is acceptable, no production data preservation needed.
2. `operational_code` is set equal to `code` during transition and removed in Phase 8.
3. Legacy `work_orders` table remains in use by production-routes.ts — must be renumbered alongside EPC tables.
4. Finance invoice numbering is completely independent and not modified.
5. CodeBar format is unaffected (uses `fyCode` + `projectSeq` directly).
6. Schema changes are applied via `npm run db:push` (or direct SQL for indexes).
7. GCS migration uses the same approach as the prior EPC→TPEL migration.
8. All child document types use 4-digit (NNNN) sequences — no exceptions.

### Open Items Needing Confirmation During Implementation

1. **MOM table:** Does a `meeting_minutes` or equivalent project-scoped table exist? If not, MOM sequence seeding is skipped.
2. **NCR/ECR/ECN number columns:** Exact column names to be confirmed from schema during implementation.
3. **Legacy `purchase_orders` table:** Confirm whether it exists and has data requiring migration.
4. **Legacy `dispatch_records` project_code column:** Confirm whether this column exists and needs updating.
