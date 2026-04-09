# THERMOPAC Enterprise Document Control Framework (EDCF)

## Baseline v1.0

**Document ID:** EDCF-BASE-001
**Version:** 1.0
**Status:** FROZEN BASELINE
**Effective Date:** 2026-04-09
**Author:** System Architect
**Approved By:** _Pending_

---

## Table of Contents

1. [Purpose and Principles](#1-purpose-and-principles)
2. [Approved GCS Root Structure](#2-approved-gcs-root-structure)
3. [Final TPEL Standard](#3-final-tpel-standard)
4. [Document Classification Model](#4-document-classification-model)
5. [EDCS Architecture (High-Level)](#5-edcs-architecture-high-level)
6. [Known Issues from GCS Audit](#6-known-issues-from-gcs-audit)
7. [Phased Implementation Plan](#7-phased-implementation-plan)
8. [Non-Negotiable Rules](#8-non-negotiable-rules)
9. [Appendices](#9-appendices)

---

## 1. Purpose and Principles

### 1.1 Purpose

This document establishes the authoritative baseline for THERMOPAC's Enterprise Document Control System (EDCS). It defines the storage architecture, document governance model, and implementation roadmap that will govern all file storage operations for the next 10 years.

This baseline supersedes all previous ad-hoc storage conventions and becomes the single reference standard for:
- All new file upload implementations
- All migration activities
- All storage-related architecture decisions
- GCS Dashboard intelligence and reporting

### 1.2 Scope

Covers all documents across all business modules: EPC Project Management, Quality Management (QMS), Finance & Accounts, Human Resources, Legal & Compliance, Design Management, Inventory & Procurement, Travel & Visa Management, Production, and Sales & Marketing.

### 1.3 Governing Principles

| # | Principle | Description |
|---|---|---|
| P1 | **Every file gets a DB record** | No file may exist in GCS without a corresponding row in the document registry. Orphaned GCS objects are treated as anomalies. |
| P2 | **Paths are system-generated** | No module constructs its own GCS path. All paths flow through a central path engine that enforces the root structure defined in this document. |
| P3 | **Non-destructive writes** | No file is ever overwritten or hard-deleted. Supersession creates new records. Soft-delete marks records inactive. Physical deletion follows retention policy only. |
| P4 | **Dual identity** | Every document has a stable `document_id` (UUID, permanent, immutable) and a human-readable `document_number` (generated per type-specific rules). |
| P5 | **Controlled multi-root** | Documents are stored under governed roots matching their business function. Not everything goes under TPEL. System-level documents stay in their functional root. |
| P6 | **Backward compatibility** | Existing `epc_documents` and `epc_doc_types` tables remain operational. The EDCS wraps and extends them; it does not replace them during transition. |
| P7 | **Auditability** | Every file operation (upload, download, supersede, delete, lifecycle change) is logged in a unified audit trail. |
| P8 | **Retention by policy** | Every document type has a defined retention class. Archival and cleanup are automated, not manual. |

---

## 2. Approved GCS Root Structure

### 2.1 Governed Roots

The following 9 roots are the ONLY approved top-level prefixes in the `thermopac_storage` bucket. Any file stored outside these roots is a governance violation.

| Root | Purpose | Scope | Status |
|---|---|---|---|
| `TPEL/` | EPC project-controlled documents | Project-bound | Active, standard |
| `QMS/` | Quality system assets (procedures, certifications, instruments) | System-level | Active, restructure pending |
| `ACCOUNTS/` | Financial and statutory documents | System-level | New (replaces `Accounts/`) |
| `HR/` | People management documents | System-level | New |
| `LEGAL/` | Contracts, compliance, POSH | System-level | New (replaces `contracts/`, `compliance/`, `posh/`) |
| `DESIGN_LIB/` | Design standards, templates, transmittals (non-project) | System-level | New (replaces `Design_Management/Standards/` etc.) |
| `INVENTORY/` | Master item data and drawings | System-level | New (replaces `THERMOPAC_INVENTORY/`) |
| `TRAVEL/` | Business trips and visa records | System-level | New (replaces `Business_Trips/`, `Business_Visa/`) |
| `ARCHIVE/` | Retired and legacy data (read-only) | Frozen | New (absorbs `EPC/`, `THERMOPAC_PROJECTS/`) |

### 2.2 Path Templates

| Root | Template | Example |
|---|---|---|
| `TPEL/` | `TPEL/{CC}/{CO}/{Cust}/{FY}/{ProjectCode}/{DocType}/rev-{NN}/{Seq}-{Label}.{ext}` | `TPEL/AS/SA/YAN/2425/TP-AS-SA-YAN-2425-001/DWG/rev-C/0001-layout.pdf` |
| `TPEL/` (INS) | `TPEL/{CC}/{CO}/{Cust}/{FY}/{ProjectCode}/INS/{IO}/A/{Seq}-{Label}.{ext}` | `TPEL/OC/NZ/WPC/2425/TP-OC-NZ-WPC-2425-001/INS/IO-2025-1-M-7/A/5-Hydrotest_HT-1.pdf` |
| `QMS/` | `QMS/{Module}/{DocNumber}/rev-{N}/{Seq}-{Label}.{ext}` | `QMS/WPS/WPS-001/rev-2/1-specification.pdf` |
| `ACCOUNTS/` | `ACCOUNTS/{FY}/{Category}/{DocRef}.{ext}` | `ACCOUNTS/2025-26/BRC/INV-2526-001.pdf` |
| `HR/` | `HR/{EmployeeCode}/{Category}/{DocRef}.{ext}` | `HR/EMP-001/Payslips/2024-12.pdf` |
| `LEGAL/` | `LEGAL/{Category}/{Year}/{DocRef}.{ext}` | `LEGAL/Contracts/2024/NDA-ABC-Corp.pdf` |
| `DESIGN_LIB/` | `DESIGN_LIB/{Category}/{Name}/{File}` | `DESIGN_LIB/Standards/ASME-B31.3/latest.pdf` |
| `INVENTORY/` | `INVENTORY/{ItemCode}/{Category}/{File}` | `INVENTORY/4898001002002000/Drawings/4898001002002000_R3.pdf` |
| `TRAVEL/` | `TRAVEL/{Type}/{Year}/{EmployeeCode}/{TripRef}/{File}` | `TRAVEL/Trips/2025/EMP-001/MUM-BER/ticket.pdf` |
| `ARCHIVE/` | `ARCHIVE/{OriginalRoot}/{OriginalPath}` | `ARCHIVE/EPC/TP-OC-NZ-WPC-2425-001/INS/...` |

### 2.3 Roots That Will Be Retired

| Current Root | Object Count | Replacement | Retirement Method |
|---|---|---|---|
| `Accounts/` (lowercase) | 117 | `ACCOUNTS/` | Rename root prefix |
| `Business_Trips/` | 73 | `TRAVEL/Trips/` | Restructure + rename |
| `Business_Visa/` | 14 | `TRAVEL/Visa/` | Restructure + rename |
| `Design_Management/` (project drawings) | ~8 | `TPEL/.../DWG/` | Move project-bound drawings to TPEL |
| `Design_Management/` (standards/templates) | ~3 | `DESIGN_LIB/` | Move system assets to DESIGN_LIB |
| `THERMOPAC_INVENTORY/` | ~65 real files | `INVENTORY/` | Rename root prefix |
| `EPC/` | 273 | `ARCHIVE/EPC/` | Move to archive (already write-locked) |
| `THERMOPAC_PROJECTS/` | 1 real file | `ARCHIVE/THERMOPAC_PROJECTS/` | Move to archive (already write-locked) |
| `thermopac_storage/` | 3 | Bug fix + move to `ACCOUNTS/` | Fix upload code, move existing files |
| `upload-staging/` | 3 | Delete after rescue | Move welder photos to `QMS/WELDERS/`, delete staging |

---

## 3. Final TPEL Standard

### 3.1 Canonical TPEL Path Format

All project-controlled documents under `TPEL/` must follow this structure:

```
TPEL/{ContinentCode}/{CountryCode}/{CustomerShortCode}/{FYCode}/{ProjectCode}/{DocType}/{DocIdentifier}/{RevisionSegment}/{Sequence}-{Label}.{Extension}
```

| Segment | Position | Format | Example | Rules |
|---|---|---|---|---|
| Root | 1 | `TPEL` | `TPEL` | Fixed literal |
| Continent | 2 | ISO 2-letter | `AS`, `AF`, `EU`, `OC`, `SA` | From `customers.continent_code` |
| Country | 3 | ISO 2-letter | `SA`, `DZ`, `NZ`, `PL`, `BR` | From `customers.country_code` |
| Customer | 4 | 3-letter code | `YAN`, `SIP`, `WPC`, `FLU`, `LWA` | From `customers.short_code` |
| FY Code | 5 | 4-digit | `2425`, `2526`, `2627` | From `projects.fy_code` |
| Project Code | 6 | Full code | `TP-AS-SA-YAN-2425-001` | From `projects.code` |
| Doc Type | 7 | Registered code | `DWG`, `INS`, `QTN`, `DSP` | From `epc_doc_types.code` |
| Doc Identifier | 8 | Type-specific | `IO-2025-1-M-7`, `TP-...-DWG-0001` | Document number or IO number |
| Revision | 9 | `rev-{XX}` or `A` | `rev-C`, `rev-00`, `A` | See revision rules below |
| File | 10 | `{Seq}-{Label}.{ext}` | `001-drawing.pdf` | Sequential within revision |

### 3.2 TPEL Revision Segment Rules

| Doc Type | Revision Format | Reason |
|---|---|---|
| Slot types (GA, PID, QAP, etc.) | `rev-{NN}` (two-digit numeric) | Single doc per project per type, numeric revision |
| DWG (engineering drawings) | `rev-{X}` (single alpha) | Engineering convention (A, B, C, D...) |
| INS (inspection records) | `A` (fixed) | Inspection records are append-only, no revision. `A` = active revision. |
| QTN pre-conversion | `rev-{NN}` (two-digit numeric) | Quote revisions before project conversion |
| QTN post-conversion | `rev-na` (fixed) | Controlled copy, no further revisions |
| DSP (dispatch) | `rev-{NN}` | Dispatch documents follow numeric revision |

### 3.3 TPEL DocTypes Registry (Verified from Live Bucket + Code)

| Code | Name | Upload Mode | Revision Model | Currently in Bucket |
|---|---|---|---|---|
| `3D` | 3D Models | slot | numeric | No |
| `BEDD` | Basic Engineering Design Data | slot | numeric | No |
| `PID` | P&ID Drawings | slot | numeric | No |
| `GA` | General Arrangement | slot | numeric | No |
| `FDN` | Foundation Drawings | slot | numeric | No |
| `ELC` | Electrical Drawings | slot | numeric | No |
| `HAZ` | Hazard Analysis | slot | numeric | No |
| `QAP` | Quality Assurance Plan | slot | numeric | No |
| `PRG` | Progress Reports | slot | numeric | No |
| `CEF` | Cost Estimates | slot | numeric | No |
| `DSA` | Design Safety Analysis | slot | numeric | No |
| `DCA` | Document Change Advice | slot | numeric | No |
| `OMM` | O&M Manuals | slot | numeric | No |
| `TIE` | Tie-In Documents | slot | numeric | No |
| `MHB` | Material Handling | slot | numeric | No |
| `STD` | Standards Reference | slot | numeric | No |
| `INR` | Inspection Records | slot | numeric | No |
| `DWG` | Engineering Drawings | sequential | alpha | Yes (9 files) |
| `ECR` | Engineering Change Request | sequential | numeric | No |
| `ECN` | Engineering Change Notice | sequential | numeric | No |
| `IAT` | Inspection & Test Packs | sequential | numeric | No |
| `DSP` | Dispatch Documents | sequential | numeric | No |
| `INS` | Inspection Reports | sequential | fixed `A` | Yes (267 files) |
| `QTN` | Quotation PDFs | versioned | numeric / `na` | Yes (2 files) |
| `MTC` | Material Test Certificates | sequential | numeric | No (new) |
| `FDS` | Final Dossier | versioned | numeric | No (new) |
| `PMA` | Pre-Material Approval (project) | versioned | numeric | No (new) |

### 3.4 Known TPEL Format Variants in Live Bucket

The following non-standard patterns exist in the live bucket and must be handled during migration:

| Variant | Pattern | Files | Action |
|---|---|---|---|
| Barcode-based DWG | `TPEL/.../2627/003/{BarcodeNumber}/DWG/{Barcode}_rev-{NN}.pdf` | 3 | Assess: uses bare seq `003` instead of full project code, barcode in DocType position |
| Pre-conversion QTN | `TPEL/.../Quotations/{OFR}/rev-{NN}/...` | 4 | Documented two-stage model; `Quotations` is not a registered DocType but is allowed by design |
| Post-conversion QTN | `TPEL/.../{ProjectCode}/QTN/{OFR}/rev-na/...` | 2 | Correct per design |

---

## 4. Document Classification Model

### 4.1 Classification Categories

Every document type in the enterprise falls into exactly one of four categories:

| Category | Code | Definition | Root |
|---|---|---|---|
| **EPC Project-Controlled** | `CAT-1` | Project deliverables governed by EPC document control. Subject to revision control, supersession, sequence engine, and project lifecycle cascades. | `TPEL/` |
| **Project-Linked Misplaced** | `CAT-2` | Documents that ARE project deliverables but are currently stored outside `TPEL/`. Must be migrated to `TPEL/` under appropriate DocType. | Currently various; target `TPEL/` |
| **System-Controlled** | `CAT-3` | Enterprise-level documents not owned by any specific project. Reusable across projects. Must remain outside `TPEL/` under their functional governed root. | `QMS/`, `ACCOUNTS/`, `HR/`, `LEGAL/`, `DESIGN_LIB/`, `INVENTORY/`, `TRAVEL/` |
| **Legacy** | `CAT-4` | Retired, duplicated, or orphaned documents. Must be archived or cleaned up. | `ARCHIVE/` or deleted |

### 4.2 Full Document Type Classification

#### CAT-1: EPC Project-Controlled (27 types, root: TPEL)

| Code | Name | Revision Model | Lifecycle | Retention | In Bucket |
|---|---|---|---|---|---|
| `3D` | 3D Models | slot | full | project_lifecycle | No |
| `BEDD` | Basic Engineering Design | slot | full | project_lifecycle | No |
| `PID` | P&ID Drawings | slot | full | permanent | No |
| `GA` | General Arrangement | slot | full | permanent | No |
| `FDN` | Foundation Drawings | slot | full | permanent | No |
| `ELC` | Electrical Drawings | slot | full | permanent | No |
| `HAZ` | Hazard Analysis | slot | full | permanent | No |
| `QAP` | Quality Assurance Plan | slot | full | project_lifecycle | No |
| `PRG` | Progress Reports | slot | simple | project_lifecycle | No |
| `CEF` | Cost Estimates | slot | full | project_lifecycle | No |
| `DSA` | Design Safety Analysis | slot | full | permanent | No |
| `DCA` | Document Change Advice | slot | simple | project_lifecycle | No |
| `OMM` | O&M Manuals | slot | full | permanent | No |
| `TIE` | Tie-In Documents | slot | full | project_lifecycle | No |
| `MHB` | Material Handling | slot | full | project_lifecycle | No |
| `STD` | Standards Reference | slot | simple | project_lifecycle | No |
| `INR` | Inspection Records | slot | full | permanent | No |
| `DWG` | Engineering Drawings | sequential | full | permanent | Yes |
| `ECR` | Engineering Change Request | sequential | full | permanent | No |
| `ECN` | Engineering Change Notice | sequential | full | permanent | No |
| `IAT` | Inspection & Test Packs | sequential | full | permanent | No |
| `DSP` | Dispatch Documents | sequential | simple | statutory_10y | No |
| `QTN` | Quotation PDFs | versioned | full | statutory_10y | Yes |
| `INS` | Inspection Reports | sequential | full | permanent | Yes |
| `MTC` | Material Test Certificates | sequential | full | permanent | No (new) |
| `FDS` | Final Dossier | versioned | full | permanent | No (new) |
| `PMA` | Project-specific PMA | versioned | full | project_lifecycle | No (new) |

#### CAT-2: Project-Linked but Incorrectly Stored (5 types, must move to TPEL)

| Document Type | Current Location | Correct Location | Files in Bucket | Duplication Risk |
|---|---|---|---|---|
| Inspection reports (legacy) | `QMS/Inspections_Records/{projectSeq}/` | `TPEL/.../INS/` | 394 (old pattern) + 15 (new pattern) | HIGH: newer records already in TPEL |
| Material test certificates | `QMS/Material_Identification/{projectNumber}/` | `TPEL/.../MTC/` | 66 | LOW |
| Project engineering drawings | `Design_Management/{projectId}/Drawings/` | `TPEL/.../DWG/` | ~5 real files | MEDIUM: item codes overlap with TPEL DWG |
| Final dossier compilations | `QMS/Inspections_Records/{IO}/Final Dossier/` | `TPEL/.../FDS/` or inline under `INS/` | ~10 | LOW: dossiers also stored inline under TPEL INS |
| Project-specific PMA | `QMS/PMA_Records/` | `TPEL/.../PMA/` | 18 | LOW |

#### CAT-3: System-Controlled (36 types across 7 roots)

**QMS Root (12 types):**

| Code | Name | Current Path | Files | Revision Model | Retention |
|---|---|---|---|---|---|
| `WPS` | Welding Procedure Spec | `QMS/WPS_PQR/` (shared) | 0 separate | versioned | permanent |
| `PQR` | Procedure Qualification Record | `QMS/WPS_PQR/` (shared) | 0 separate | versioned | permanent |
| `WPQR` | Welder Qualification Record | `QMS/WPQR/` | 19 | versioned | permanent |
| `WLD_CERT` | Welder Certificate | `QMS/WELDERS/` | ~10 | none | permanent |
| `WLD_PHOTO` | Welder Photo | `QMS/WELDERS/` + `upload-staging/` | ~7 + 3 orphaned | none | permanent |
| `CAL_CERT` | Calibration Certificate | `QMS/Calibration/` | 4 | versioned | statutory_7y |
| `CAL_RPT` | Calibration Report | `QMS/Instrument/` | 64 | none | statutory_7y |
| `TEST_PROC` | Test Procedure | `QMS/Test_Procedures/` | 14 | versioned | permanent |
| `PMA_S` | PMA System Template | `QMS/PMA_Records/` | 1 (.keep) | versioned | permanent |
| `NCR_TPL` | NCR Template | Not in bucket | 0 | versioned | permanent |
| `QMS_POLICY` | QMS Policy Document | Not in bucket | 0 | versioned | permanent |
| `QMS_MANUAL` | Quality Manual | Not in bucket | 0 | versioned | permanent |

**ACCOUNTS Root (6 types):**

| Code | Name | Current Path | Files | Retention |
|---|---|---|---|---|
| `BRC` | Bank Realization Certificate | `Accounts/{year}/` | 117 | statutory_10y |
| `INV_PDF` | Invoice PDF | On-the-fly / `thermopac_storage/` | 3 (misplaced) | statutory_10y |
| `PAY_ADV` | Payment Advice | Not in bucket | 0 | statutory_7y |
| `TDS_CERT` | TDS Certificate | Not in bucket | 0 | statutory_10y |
| `GST_RET` | GST Return Filing | Not in bucket | 0 | statutory_10y |
| `DN_CN` | Debit/Credit Note | Not in bucket | 0 | statutory_10y |

**HR Root (7 types):**

| Code | Name | Files in Bucket | Retention |
|---|---|---|---|
| `SAL_SLIP` | Salary Slip | 0 (on-the-fly) | statutory_7y |
| `APPR_RPT` | Appraisal Report | 0 (on-the-fly) | operational_3y |
| `TAX_DECL` | Tax Declaration/Proof | 0 | statutory_7y |
| `OFFER_LTR` | Offer Letter/Contract | 0 | permanent |
| `LEAVE_DOC` | Leave Supporting Document | 0 | operational_3y |
| `TRAIN_CERT` | Training Certificate | 0 | permanent |
| `EMP_PHOTO` | Employee Photo | 0 | permanent |

**LEGAL Root (5 types):**

| Code | Name | Files in Bucket | Retention |
|---|---|---|---|
| `CONTRACT` | Contract/NDA/MOU | 0 (code paths exist, no files uploaded yet) | permanent |
| `LEGAL_NOTICE` | Legal Notice | 0 | permanent |
| `COURT_DOC` | Court Document | 0 | permanent |
| `COMPL_EVID` | Compliance Evidence | 0 | statutory_10y |
| `POSH_DOC` | POSH Case Document | 0 | permanent |

**DESIGN_LIB Root (3 types):**

| Code | Name | Current Path | Files | Retention |
|---|---|---|---|---|
| `DES_STD` | Design Standard | `Design_Management/*/Basic_Drawings/` | ~3 | permanent |
| `DES_TMPL` | Design Template | Not in bucket | 0 | permanent |
| `DES_TRANS` | Design Transmittal | Not in bucket | 0 | project_lifecycle |

**INVENTORY Root (3 types):**

| Code | Name | Current Path | Files | Retention |
|---|---|---|---|---|
| `ITEM_DWG` | Master Item Drawing | `THERMOPAC_INVENTORY/` | ~65 | permanent |
| `VENDOR_CERT` | Vendor Certificate | Not in bucket | 0 | statutory_7y |
| `BOM_EXPORT` | BOM Export | Not in bucket | 0 | operational_3y |

**TRAVEL Root (5 types):**

| Code | Name | Current Path | Files | Retention |
|---|---|---|---|---|
| `VISA_COPY` | Visa/Passport Copy | `Business_Visa/` | 14 | operational_3y |
| `FLT_TKT` | Flight Ticket/PNR | `Business_Trips/` | ~25 | operational_3y |
| `HOTEL_VCHR` | Hotel Voucher | `Business_Trips/` | ~20 | operational_3y |
| `EXP_RCPT` | Expense Receipt | `Business_Trips/` | ~15 | statutory_7y |
| `TRAVEL_INS` | Travel Insurance | `Business_Trips/` | ~5 | operational_3y |

#### CAT-4: Legacy (must be archived or cleaned up)

| Current Root | Files | Contents | Target |
|---|---|---|---|
| `EPC/` | 273 | Complete 1:1 duplicates of TPEL INS files | `ARCHIVE/EPC/` then safe-delete after 90 days |
| `THERMOPAC_PROJECTS/` | 1 real file | 1 BEDD document | `ARCHIVE/THERMOPAC_PROJECTS/` |
| `thermopac_storage/` | 3 | Invoice PDFs (bug-created path) | Move to `ACCOUNTS/`, fix code, delete root |
| `upload-staging/` | 3 | Orphaned welder photos (W-021.jpg x3) | Rescue to `QMS/WELDERS/`, delete root |

### 4.3 Cross-Root Duplication Map (Verified from Live Bucket)

| Document Type | Root A | Root B | Files A | Files B | Match Rate | Severity |
|---|---|---|---|---|---|---|
| Inspection reports | `EPC/.../INS/` | `TPEL/.../INS/` | 267 | 267 | **100%** | CRITICAL: 267 identical files, byte-level duplicates |
| Inspection reports | `QMS/Inspections_Records/` | `TPEL/.../INS/` | 409 | 267 | Partial overlap | HIGH: different path structures, overlapping IO numbers |
| Item drawings | `THERMOPAC_INVENTORY/{item}/` | `Design_Management/{project}/Drawings/{item}/` | ~65 | ~5 | Item code overlap | MEDIUM: same item code, different revision chains |
| Invoice PDFs | `Accounts/{year}/` | `thermopac_storage/Accounts/{year}/` | 117 | 3 | Different invoices | LOW: bug-created path, not true duplicates |

---

## 5. EDCS Architecture (High-Level)

### 5.1 Core Database Tables

#### document_registry (new, universal)

The single source of truth for every file in GCS across all roots.

| Column | Type | Purpose |
|---|---|---|
| `id` | `uuid` PK | Permanent, immutable document identity |
| `document_number` | `text` UNIQUE | Human-readable reference (auto-generated) |
| `storage_root` | `text` NOT NULL | Governed root enum: TPEL, QMS, ACCOUNTS, HR, LEGAL, DESIGN_LIB, INVENTORY, TRAVEL, ARCHIVE |
| `document_type_code` | `text` NOT NULL FK | Links to `document_type_registry.code` |
| `title` | `text` NOT NULL | Human-readable title |
| `gcs_object_path` | `text` NOT NULL UNIQUE | Full GCS key, system-generated, immutable |
| `file_name` | `text` NOT NULL | Original filename (for download) |
| `file_size_bytes` | `bigint` | File size |
| `content_type` | `text` | MIME type |
| `checksum_sha256` | `text` NOT NULL | Integrity verification |
| `revision_code` | `text` NOT NULL DEFAULT '00' | Current revision |
| `revision_chain_id` | `uuid` NOT NULL | Groups all revisions of same logical document |
| `is_current_revision` | `boolean` NOT NULL DEFAULT true | One per chain |
| `superseded_by_id` | `uuid` FK | Points to replacement |
| `lifecycle_status` | `text` NOT NULL DEFAULT 'draft' | draft, under_review, approved, issued, active, superseded, archived |
| `sensitivity_level` | `text` NOT NULL DEFAULT 'internal' | public, internal, confidential, restricted |
| `project_id` | `integer` FK nullable | Project link (if project-bound) |
| `entity_type` | `text` | Polymorphic: project, employee, instrument, welder, item, contract, trip, visa, invoice |
| `entity_id` | `text` | ID of linked entity |
| `metadata` | `jsonb` NOT NULL DEFAULT '{}' | Type-specific metadata |
| `retention_class` | `text` NOT NULL | permanent, project_lifecycle, statutory_10y, statutory_7y, operational_3y, temporary |
| `retention_expiry` | `timestamp` | Computed from retention class |
| `created_by` | `integer` NOT NULL FK | Uploader |
| `created_at` | `timestamp` NOT NULL DEFAULT now() | |
| `epc_document_id` | `integer` FK nullable | Backward-compatibility link to existing `epc_documents.id` |

#### document_type_registry (new, extends epc_doc_types)

Central registry of all 73 document types across all modules.

| Column | Type | Purpose |
|---|---|---|
| `code` | `text` PK | Unique type code |
| `name` | `text` NOT NULL | Display name |
| `storage_root` | `text` NOT NULL | Which governed root this type lives under |
| `module` | `text` NOT NULL | Business module |
| `scope` | `text` NOT NULL | `project` or `system` |
| `allowed_extensions` | `text[]` NOT NULL | Permitted file types |
| `max_file_size_mb` | `integer` NOT NULL DEFAULT 50 | |
| `revision_model` | `text` NOT NULL DEFAULT 'none' | slot, sequential, versioned, none |
| `lifecycle_model` | `text` NOT NULL DEFAULT 'simple' | full, simple, immediate, none |
| `requires_review` | `boolean` NOT NULL DEFAULT false | |
| `requires_approval` | `boolean` NOT NULL DEFAULT false | |
| `min_upload_role` | `text` NOT NULL DEFAULT 'Employee' | |
| `sensitivity_default` | `text` NOT NULL DEFAULT 'internal' | |
| `retention_class` | `text` NOT NULL DEFAULT 'operational_3y' | |
| `path_template` | `text` NOT NULL | Template for GCS path construction |
| `metadata_schema` | `jsonb` | JSON Schema for type-specific metadata |
| `numbering_pattern` | `text` | Document number format |

#### document_audit_log (new, unified)

| Column | Type | Purpose |
|---|---|---|
| `id` | `bigserial` PK | |
| `document_id` | `uuid` FK | |
| `action` | `text` NOT NULL | upload, download, view, supersede, lifecycle_change, metadata_update, access_grant, soft_delete, archive |
| `actor_id` | `integer` FK | User who performed action |
| `previous_state` | `jsonb` | State before action |
| `new_state` | `jsonb` | State after action |
| `details` | `jsonb` | Additional context |
| `timestamp` | `timestamp` NOT NULL DEFAULT now() | |

#### document_access_grants (new)

For sensitivity-controlled and restricted documents.

| Column | Type | Purpose |
|---|---|---|
| `id` | `serial` PK | |
| `document_id` | `uuid` FK | |
| `granted_to_user_id` | `integer` FK nullable | |
| `granted_to_role` | `text` nullable | |
| `granted_to_department` | `text` nullable | |
| `permission` | `text` NOT NULL | view, download, edit_metadata, approve, delete |
| `granted_by` | `integer` FK NOT NULL | |
| `expires_at` | `timestamp` nullable | |

### 5.2 Upload Flow (Central Path Engine)

```
Client Upload Request
    |
    v
[1. Validate document_type_code exists in registry]
    |
    v
[2. Check user role >= min_upload_role]
    |
    v
[3. Validate file: extension, size, MIME type]
    |
    v
[4. Compute SHA-256 checksum]
    |  - Block: identical to current active revision
    |  - Warn: identical exists elsewhere in project
    |  - Allow: identical in different project
    |
    v
[5. Validate metadata against type's metadata_schema]
    |
    v
[6. Generate GCS path from path_template (NEVER user-supplied)]
    |
    v
[7. BEGIN TRANSACTION]
    |  - Create document_registry record
    |  - If revision: supersede previous active record
    |  - Upload to GCS
    |  - Verify checksum post-upload
    |  - Write audit log
    |
    v
[8. COMMIT or ROLLBACK (cleanup GCS on failure)]
```

### 5.3 Document Lifecycle Models

**Full Lifecycle** (for engineering, legal, formally controlled documents):
```
draft -> under_review -> approved -> issued -> superseded -> archived
              |                                    ^
           rejected --(re-upload)--> draft         |
                                         (new revision)
```

**Simple Lifecycle** (for operational documents):
```
draft -> active -> archived
```

**Immediate Lifecycle** (for receipts, photos, certificates):
```
active -> archived    (uploaded directly as active)
```

### 5.4 Retention Classes

| Class | Duration | Auto-Archive | Auto-Delete | Applies To |
|---|---|---|---|---|
| `permanent` | Forever | Never | Never | Engineering drawings, quality records, legal contracts |
| `project_lifecycle` | Project close + 2 years | On project archive | Never | Progress reports, cost estimates |
| `statutory_10y` | 10 years | At expiry | Soft-delete at expiry + 1 year | Invoices, tax certs, dispatch docs |
| `statutory_7y` | 7 years | At expiry | Soft-delete at expiry + 1 year | Salary slips, payment advice, calibration certs |
| `operational_3y` | 3 years | At expiry | Soft-delete at expiry + 6 months | Travel docs, leave docs |
| `temporary` | 90 days | At expiry | Hard-delete at expiry | Staging files, temp exports |

### 5.5 Access Control Model

| Layer | Gate | Description |
|---|---|---|
| 1 | Authentication | All operations require authenticated session |
| 2 | Module gate | User must have module-level permission (canView, canUpload, canDownload) |
| 3 | Sensitivity gate | `public`: all users; `internal`: all users; `confidential`: Manager+ or explicit grant; `restricted`: named individuals only |
| 4 | Project scope gate | For project-bound docs: user must be project member with appropriate visibility scope |
| 5 | Document-level grant | `document_access_grants` table for per-document overrides |

**Special sensitivity rules:**
- POSH documents: always `restricted`
- Salary slips: employee + HR Manager+ + Superuser only
- Legal contracts: `confidential` by default
- Tax declarations: employee + HR tax handler + Superuser only

### 5.6 GCS Dashboard Integration

The dashboard gains a reconciliation engine comparing:
- **Physical layer** (GCS scan): what exists in the bucket
- **Logical layer** (document_registry): what should exist

Detectable anomalies:
- Orphaned GCS objects (no registry record)
- Missing GCS objects (registry record, no GCS file)
- Checksum mismatches
- Path violations (file outside governed roots)
- Registry gaps (modules uploading without central service)

---

## 6. Known Issues from GCS Audit

### 6.1 Live Bucket Audit Summary (2026-04-09)

| Metric | Value |
|---|---|
| Total objects | 1,490 |
| Top-level prefixes | 11 |
| Governed prefixes | 8 |
| Anomalous prefixes | 3 (`thermopac_storage/`, `upload-staging/`, `EPC/` duplicate) |
| Files with spaces in path | 32 |
| Directory marker objects | 2 |
| .keep placeholder files | ~49 |
| Duplicate files (EPC ↔ TPEL) | 267 (100% overlap) |

### 6.2 Critical Issues

| ID | Severity | Issue | Details |
|---|---|---|---|
| GCS-001 | CRITICAL | EPC ↔ TPEL 100% duplication | 267 inspection files exist identically in both `EPC/` and `TPEL/`. All 267 EPC files are byte-level copies of TPEL files. 273 total EPC objects (267 INS + 6 DWG). |
| GCS-002 | HIGH | QMS inspection records overlap TPEL | 409 files in `QMS/Inspections_Records/` overlap with 267 in `TPEL/.../INS/`. Same inspection orders exist in both roots with different path structures. Two sources of truth. |
| GCS-003 | HIGH | TPEL has 5 structural variants | INS uses `A/` instead of `rev-XX/`; DWG has old-format and barcode-format; QTN has pre-conversion and post-conversion paths. Not a single consistent structure. |
| GCS-004 | MEDIUM | `thermopac_storage/` bucket-inside-bucket | 3 invoice PDFs stored with bucket name as path prefix. Bug in finance upload code. Also has typo: `Account/` vs `Accounts/`. |
| GCS-005 | MEDIUM | `upload-staging/` orphaned files | 3 copies of `W-021.jpg` (welder photo). Never moved to final location. Will be permanently lost if staging is cleaned. |
| GCS-006 | MEDIUM | 32 files with spaces in paths | Found in Business_Visa (11), Design_Management (3), EPC (6), QMS (6), TPEL (6). Mostly in Final Dossier labels and visa filenames. |
| GCS-007 | LOW | Design_Management corrupted paths | `Design_Management/2025-5/Drawings//.keep` and `Design_Management/2025-5/Drawings//_R1.PDF` — empty item code segment. |
| GCS-008 | LOW | QMS has two inspection path formats | Old: `QMS/Inspections_Records/{projectSeq}/{IO}/...` (394 files); New: `QMS/Inspections_Records/{IO}/...` (15 files). Inconsistent hierarchy. |
| GCS-009 | LOW | .keep placeholders | ~49 empty `.keep` files across roots. GCS doesn't need directory markers. |
| GCS-010 | INFO | 2 directory marker objects | `THERMOPAC_INVENTORY/` and `THERMOPAC_PROJECTS/` exist as 0-byte objects at bucket root. |

### 6.3 Code-Level Issues

| ID | Issue | Details |
|---|---|---|
| CODE-001 | Finance upload prepends bucket name | The invoice upload service writes to `thermopac_storage/Accounts/` instead of `Accounts/`. Root cause: bucket name used as path prefix. |
| CODE-002 | Final Dossier generator doesn't sanitize labels | Creates filenames with spaces: `Final Dossier_FD_IO-...`. Should use underscores or hyphens. |
| CODE-003 | Welder photo upload uses temp staging without cleanup | Files land in `upload-staging/` and are never moved to `QMS/WELDERS/`. |
| CODE-004 | Design drawing upload allows empty item codes | Creates paths like `Drawings//_R1.PDF` when item code is not provided. |

---

## 7. Phased Implementation Plan

### Phase 0: Immediate Fixes (Week 1)

| Task | Priority | Risk | Effort |
|---|---|---|---|
| Fix finance upload bucket-name-as-prefix bug (CODE-001) | P0 | Prevents new data corruption | 1 hour |
| Fix Final Dossier label sanitization (CODE-002) | P0 | Prevents new space-in-path issues | 1 hour |
| Rescue 3 orphaned welder photos from `upload-staging/` to `QMS/WELDERS/` | P0 | Data loss risk | 30 min |
| Move 3 `thermopac_storage/` invoices to `Accounts/` | P0 | Data integrity | 30 min |
| Fix welder photo upload to write directly to `QMS/WELDERS/` (CODE-003) | P0 | Prevents new orphans | 2 hours |
| Fix empty item code validation in design upload (CODE-004) | P0 | Prevents corrupted paths | 1 hour |

### Phase 1: EDCS Foundation (Weeks 2-4)

| Task | Priority | Effort |
|---|---|---|
| Create `document_type_registry` table and seed all 73 types | P1 | 1 day |
| Create `document_registry` table | P1 | 1 day |
| Create `document_audit_log` table | P1 | 0.5 day |
| Create `document_access_grants` table | P1 | 0.5 day |
| Build central path engine service | P1 | 2 days |
| Build central upload service (validation + path generation + registry write) | P1 | 3 days |
| Backfill `document_registry` from existing `epc_documents` (TPEL files) | P1 | 1 day |
| Integrate GCS Dashboard with document registry (reconciliation engine) | P1 | 2 days |

### Phase 2: Active Root Migration (Weeks 5-8)

| Task | Priority | Effort |
|---|---|---|
| Rename `Accounts/` to `ACCOUNTS/` (117 files) | P2 | 1 day |
| Consolidate `Business_Trips/` + `Business_Visa/` into `TRAVEL/` (87 files) | P2 | 1 day |
| Rename `THERMOPAC_INVENTORY/` to `INVENTORY/` (~65 files) | P2 | 0.5 day |
| Split `Design_Management/` — standards to `DESIGN_LIB/`, project drawings to `TPEL/` | P2 | 1 day |
| Register all migrated files in `document_registry` | P2 | 2 days |
| Update all upload services to use central path engine | P2 | 3 days |
| Backfill `document_registry` for QMS files (612 objects) | P2 | 1 day |

### Phase 3: Duplication Resolution (Weeks 9-12)

| Task | Priority | Effort |
|---|---|---|
| Verify EPC ↔ TPEL checksum match for all 267 INS files | P1 | 1 day |
| Move `EPC/` to `ARCHIVE/EPC/` (after checksum verification) | P1 | 1 day |
| Resolve QMS Inspections_Records ↔ TPEL INS overlap | P1 | 3 days |
| Move `THERMOPAC_PROJECTS/` to `ARCHIVE/` | P3 | 30 min |
| Clean up `.keep` files and directory markers | P3 | 1 hour |

### Phase 4: New Module Onboarding (Weeks 13-16)

| Task | Priority | Effort |
|---|---|---|
| Wire HR module uploads through central service (salary slips, appraisals) | P2 | 2 days |
| Wire Legal module uploads through central service | P2 | 1 day |
| Wire remaining QMS uploads (calibration, test procedures) through central service | P2 | 2 days |
| Implement lifecycle workflows for `full` lifecycle types | P2 | 3 days |
| Implement retention policy automation (daily archival job) | P3 | 2 days |

### Phase 5: Hardening (Weeks 17-20)

| Task | Priority | Effort |
|---|---|---|
| Lock all non-governed root writes (reject uploads outside 9 roots) | P1 | 1 day |
| Enable reconciliation alerts in GCS Dashboard | P2 | 1 day |
| Implement document-level access grants for restricted docs | P2 | 2 days |
| Full audit: verify every GCS object has a `document_registry` record | P1 | 1 day |
| Performance testing at 10x current volume | P3 | 2 days |

---

## 8. Non-Negotiable Rules

These rules are absolute and may not be overridden by any module, developer, or business request without a formal amendment to this baseline document.

### Rule 1: No Ungoverned Writes

> **No file may be written to GCS outside the 9 governed roots defined in Section 2.1.**
> Any upload to a path not starting with `TPEL/`, `QMS/`, `ACCOUNTS/`, `HR/`, `LEGAL/`, `DESIGN_LIB/`, `INVENTORY/`, `TRAVEL/`, or `ARCHIVE/` must be rejected with HTTP 403.

### Rule 2: No Module-Constructed Paths

> **No module, route handler, or service may construct a GCS path directly.**
> All paths must be generated by the central path engine using the `path_template` from `document_type_registry`. Hardcoded path construction is a governance violation.

### Rule 3: Every File Gets a Registry Record

> **No file may exist in GCS without a corresponding row in `document_registry`.**
> The upload transaction must create the registry record BEFORE uploading to GCS. If the GCS upload fails, the registry record is rolled back. If the registry write fails after GCS upload, the GCS object is cleaned up.

### Rule 4: No Overwrites

> **No GCS object may be overwritten.** New content creates a new revision with a new `gcs_object_path`. The previous revision is marked as `superseded`, never deleted or overwritten.

### Rule 5: No Hard Deletes Without Retention Policy

> **No file may be physically deleted from GCS except by the automated retention policy engine.** Manual deletion is prohibited. Soft-delete (`is_deleted = true`) is the only user-facing delete operation.

### Rule 6: Checksums Are Mandatory

> **Every upload must compute and store a SHA-256 checksum.** Post-upload verification must confirm the stored checksum matches the GCS object. Checksum mismatches trigger immediate alert and upload rollback.

### Rule 7: Audit Trail Is Append-Only

> **The `document_audit_log` table is append-only.** No audit record may be updated or deleted under any circumstance. This includes administrative operations.

### Rule 8: Sensitivity Classification Is Required

> **Every document must have a `sensitivity_level`.** Default is `internal`. POSH documents default to `restricted`. The sensitivity level governs access control enforcement and cannot be downgraded without audit logging.

### Rule 9: Project Documents Stay Under TPEL

> **Any document that is a deliverable of a specific project must be stored under `TPEL/`.** System-level assets (standards, procedures, policies) that are reusable across projects must NOT be stored under `TPEL/`. The `scope` field in `document_type_registry` is the authoritative reference.

### Rule 10: Path Segments Must Not Contain Spaces

> **No segment of any GCS path may contain a space character.** Filenames must be sanitized before path construction. Spaces must be replaced with underscores or hyphens. This rule applies retroactively — existing files with spaces are flagged as anomalies for remediation.

---

## 9. Appendices

### Appendix A: Live Bucket Object Counts (2026-04-09)

| Root | Objects | Real Files (excl .keep/markers) |
|---|---|---|
| `QMS/` | 612 | ~607 |
| `TPEL/` | 282 | 275 |
| `EPC/` | 273 | 273 |
| `Accounts/` | 117 | 117 |
| `THERMOPAC_INVENTORY/` | 99 | ~65 |
| `Business_Trips/` | 73 | 73 |
| `Business_Visa/` | 14 | 14 |
| `Design_Management/` | 11 | ~8 |
| `THERMOPAC_PROJECTS/` | 3 | 1 |
| `thermopac_storage/` | 3 | 3 |
| `upload-staging/` | 3 | 3 |
| **Total** | **1,490** | **~1,439** |

### Appendix B: File Extension Distribution

| Extension | Count |
|---|---|
| `.pdf` | 1,409 |
| `.keep` | 72 |
| `.jpg` | 6 |
| `.jpeg` | 1 |

### Appendix C: TPEL Projects in Live Bucket

| Project Code | Continent | Country | Customer | FY | DocTypes Present |
|---|---|---|---|---|---|
| `TP-OC-NZ-WPC-2425-001` | OC | NZ | WPC | 2425 | INS (233 files) |
| `TP-AF-DZ-SIP-2425-001` | AF | DZ | SIP | 2425 | INS (21 files) |
| `TP-AS-SA-YAN-2425-001` | AS | SA | YAN | 2425 | INS (13), DWG (5) |
| `003` (bare seq) | AS | SA | YAN | 2627 | DWG (3, barcode format) |
| `2627-003` | AS | SA | YAN | 2627 | QTN (1) |
| `Quotations` (not a project) | AS | SA | YAN | 2627 | QTN pre-conversion (3) |
| `TP-EU-PL-FLU-2526-001` | EU | PL | FLU | 2526 | DWG (1) |
| `Quotations` (not a project) | SA | BR | LWA | 2627 | QTN pre-conversion (1) |
| `TP-SA-BR-LWA-2627-001` | SA | BR | LWA | 2627 | QTN post-conversion (1) |

### Appendix D: QMS Sub-Module Distribution

| Sub-Module | Files | Path Pattern |
|---|---|---|
| Inspections_Records | 409 | `QMS/Inspections_Records/{projectSeq or IO}/{IO}/{Tab}/{ID}.pdf` |
| Material_Identification | 66 | `QMS/Material_Identification/{projectSeq}/{MI-ID}/{DocType}.pdf` |
| Instrument | 64 | `QMS/Instrument/{INST-NNNNN}.pdf` (flat, no hierarchy) |
| PMA_Records | 19 | `QMS/PMA_Records/{PMA-YYYY-NNN}.pdf` (flat) |
| WPQR | 19 | `QMS/WPQR/{WPQR-N}.pdf` (flat) |
| WELDERS | 17 | `QMS/WELDERS/{W-NNN}/{W-NNN}.{jpg/pdf}` |
| Test_Procedures | 14 | `QMS/Test_Procedures/{Method}/{Lang}/{TP-YYYY-NNN}.pdf` |
| Calibration | 4 | `QMS/Calibration/{GOV-xxx-NNN}/rev-{N}/{Seq}-{label}.pdf` |

### Appendix E: Naming Convention Violations

32 files have spaces in paths:
- Business_Visa: 11 files (employee names and visa descriptions)
- Design_Management: 3 files ("General Arrangement Drawing" labels)
- EPC: 6 files (Final Dossier labels)
- QMS: 6 files (Final Dossier folder name + labels)
- TPEL: 6 files (Final Dossier labels)

### Appendix F: Amendment Log

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-04-09 | System Architect | Initial baseline — frozen |

---

**END OF DOCUMENT**

**This baseline is now FROZEN. Any changes to the governed root structure, document classification model, or non-negotiable rules require a formal amendment with version increment and re-approval.**
