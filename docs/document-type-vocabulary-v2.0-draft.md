# Canonical Document Type Vocabulary — v2.0 (FREEZE CANDIDATE)
**Date:** 2026-05-16
**Status:** DRAFT — Under review. Supersedes v1.0 upon approval.
**Audit basis:** Full vocabulary audit 2026-05-16 (10-point review)
**Prepared by:** Replit Agent
**Related baseline:** `docs/gcs-governance-rev5-option-c-baseline.md`

---

## What Changed from v1.0

| Change | Type | Detail |
|---|---|---|
| `DRAWING` → `EPC_DRAWING` | Rename | Was duplicate of `DESIGN_DRAWING`; same path builder. Now unambiguous. |
| `MATERIAL_CERT` → `MATERIAL_ID_DOC` | Rename | Was misleading — this is a Material Identification document, not a material test certificate. |
| `ECN` added | New type | Engineering Change Notice (follows ECR approval). Was present in codebase, missing from vocabulary. |
| `NCR` added | New type | Non-Conformance Report. Used extensively in project and inspection routes. Pending GCS path confirmation. |
| `RFQ_ATTACHMENT` added | New type | RFQ email dispatch attachments. Go to GCS via `plc_rfq_attachments` table. |
| 5 metadata columns added | Schema extension | `lifecycle_category`, `family_type`, `retention_class`, `module_ownership`, `revision_strategy` |
| `EPC_DOCUMENT {DocType}` vocabulary documented | New section | Controlled sub-values for the `{DocType}` path token in EPC_DOCUMENT rules. |
| `TRIP_DOCUMENT {DocType}` vocabulary documented | New section | Controlled sub-categories for business trip document uploads. |

**Total count: 36 types** (was 33 — +3 new, 2 renamed, 0 removed)

---

## Canonical Naming Rules

| Rule | Definition |
|---|---|
| N1 | Format: `SCREAMING_SNAKE_CASE` only. No spaces, hyphens, or lowercase. |
| N2 | Module prefix **required** when the same noun appears in two or more modules, or when the noun alone is ambiguous without context. |
| N3 | Module prefix **omitted** when the type is module-unique and the noun is self-describing, or when an established industry abbreviation is used (ECR, NCR, BOM, RFQ, ECN). |
| N4 | Suffixes: `_CERT` for actual certificates only; `_DOCUMENT` only when the noun alone is ambiguous; `_REPORT` for formal output reports. |
| N5 | Forbidden: single or 2-letter abbreviations (`PO`, `WO`, `DR`) as standalone types; verb-based names; technology format names (`PDF_DOCUMENT`). |
| N6 | Rename trigger: if a current name violates N1–N5, it is a rename candidate. Rename requires: (a) old type marked deprecated in DB, (b) new type added, (c) 30-day transition window. |

---

## Metadata Column Definitions

Each type entry carries these five fields:

| Column | Allowed Values |
|---|---|
| `lifecycle_category` | `TECHNICAL` · `QUALITY` · `COMMERCIAL` · `FINANCIAL` · `LEGAL` · `ADMINISTRATIVE` · `OPERATIONAL` · `EPHEMERAL` |
| `family_type` | `A` (project) · `B` (company) · `B*` (pre-project, no NNN) · `NONE` (ephemeral/internal) |
| `retention_class` | `PERMANENT` · `REGULATORY` · `LONG_TERM` · `STANDARD` · `SHORT_TERM` · `EPHEMERAL` |
| `module_ownership` | `epc` · `qms` · `design` · `hr` · `legal` · `finance` · `sales` · `sap` · `dvs` · `legacy` · `internal` |
| `revision_strategy` | `NUMERIC` · `ALPHABETIC` · `NONE` |

### Retention Class Definitions

| Class | Duration | Applies To |
|---|---|---|
| `PERMANENT` | Never delete | Evergreen company library assets (standards, offer templates) |
| `REGULATORY` | Per statute / standard | Financial compliance docs, welding/quality certs (ASME, ISO 9001) |
| `LONG_TERM` | 7–10 years | Project documents, legal contracts, engineering drawings |
| `STANDARD` | 3–7 years | ECR/ECN, dispatch, calibration, HR travel, SAP procurement records |
| `SHORT_TERM` | 1–3 years | Staging artefacts, transmittals, backups, welder photos |
| `EPHEMERAL` | ≤ 30 days | Internal processing artefacts, never user-facing |

---

## Controlled Vocabulary

### Module: EPC (10 types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Route / Source |
|---|---|---|---|---|---|---|---|
| `EPC_DOCUMENT` | EPC Project Document | TECHNICAL | A | LONG_TERM | epc | NUMERIC | `epc-coding.ts` → `buildEpcGcsPath()` |
| `EPC_DRAWING` | EPC Engineering Drawing *(was `DRAWING`)* | TECHNICAL | A | LONG_TERM | epc | ALPHABETIC | `epc-coding.ts` → `buildDrawingGcsPath()` |
| `DDS` | Design Data Sheet | TECHNICAL | A | LONG_TERM | epc | ALPHABETIC | `dds-pdf-service.ts` → `buildDdsGcsPath()` |
| `CO_DOCUMENT` | Customer Order Document | COMMERCIAL | A | LONG_TERM | epc | NUMERIC | `customer-order-document-routes.ts` |
| `ECR` | Engineering Change Request | TECHNICAL | A | STANDARD | epc | NUMERIC | `engineering-change-routes.ts` |
| `ECN` | Engineering Change Notice *(new)* | TECHNICAL | A | STANDARD | epc | NUMERIC | `drawing-ecr-ecn-routes.ts` |
| `DISPATCH` | Dispatch Document | OPERATIONAL | A | STANDARD | epc | NUMERIC | `dispatch-routes.ts` |
| `DATASHEET` | PPPC Procurement Datasheet | TECHNICAL | A | STANDARD | epc | NUMERIC | `pppc-routes.ts` |
| `QUOTATION` | Standalone Offer PDF (pre-project) | COMMERCIAL | B* | LONG_TERM | epc | NUMERIC | `epc-coding.ts` → `buildQuotationGcsPath()` |
| `EPC_QUOTATION` | Project-Linked Quotation | COMMERCIAL | A | LONG_TERM | epc | NONE | `epc-coding.ts` → `buildEpcQtnGcsPath()` |
| `RFQ_ATTACHMENT` | RFQ Email Dispatch Attachment *(new)* | COMMERCIAL | A | STANDARD | epc | NONE | `plc-rfq-routes.ts` · `rfq-email-service.ts` |

Notes:
- `QUOTATION` is pre-project (no NNN). Uses current company FY at time of generation.
- `EPC_DRAWING` rename from `DRAWING` — path builder and template unchanged.
- `ECN` is the approved change notice issued after an `ECR` is processed.
- `RFQ_ATTACHMENT` GCS path: see `EPC_DOCUMENT {DocType}` vocabulary below. Sub-categories: `datasheet | drawing | specification | qap`.

---

### Module: DVS (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Route / Source |
|---|---|---|---|---|---|---|---|
| `DVS_STAGING` | DVS Drawing Staging Artefact | TECHNICAL | A | SHORT_TERM | dvs | NUMERIC | `drawing-verification-routes.ts` |

Note: Staging artefact — not a permanent record. Assign cleanup policy after DVS verification is complete.

---

### Module: QMS (11 types)

All currently at TRANSITIONAL ROOT `QMS/`. See `docs/gcs-governance-rev5-option-c-baseline.md` Section 3.8 for target paths.

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `WPQR` | Welder Performance Qualification Record | QUALITY | B | REGULATORY | qms | NUMERIC | Company-level master record |
| `PMA` | Particular Material Appraisal | QUALITY | B | LONG_TERM | qms | NUMERIC | Company material library |
| `WPS_PQR` | Welding Procedure Spec / PQR | QUALITY | B | REGULATORY | qms | NUMERIC | Company-level, under QMS/WPS/ |
| `CALIBRATION_CERT` | Calibration Certificate | QUALITY | B | STANDARD | qms | NONE | Flat file, no revision |
| `WELDER_CERT` | Welder Qualification Certificate | QUALITY | B | REGULATORY | qms | NUMERIC | Linked to welder personnel |
| `WELDER_PHOTO` | Welder ID Photo | ADMINISTRATIVE | B | SHORT_TERM | qms | NONE | Flat file |
| `TEST_PROCEDURE` | Test Procedure Document | QUALITY | B | STANDARD | qms | NUMERIC | Company NDT procedures |
| `NCR` | Non-Conformance Report *(new)* | QUALITY | A | STANDARD | qms | NUMERIC | Project-specific; GCS path pending confirmation |
| `INSPECTION_DOC` | Inspection Record Document | QUALITY | A | LONG_TERM | qms | NONE | Has `project_id` FK |
| `MATERIAL_ID_DOC` | Material Identification Document *(was `MATERIAL_CERT`)* | QUALITY | A | LONG_TERM | qms | NONE | Has `project_id` FK. Renamed — not a certificate. |
| `FINAL_DOSSIER` | Final Inspection Dossier PDF | QUALITY | A | LONG_TERM | qms | NONE | Linked to IONum → project |

---

### Module: Design (5 types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `DESIGN_DRAWING` | Design Drawing (governed) | TECHNICAL | A | LONG_TERM | design | ALPHABETIC | Already at correct TPEL root |
| `BASIC_DRAWING` | Basic / Preliminary Drawing | TECHNICAL | A | LONG_TERM | design | NUMERIC | Migration pending |
| `TRANSMITTAL` | Design Transmittal | OPERATIONAL | A | SHORT_TERM | design | NONE | Migration pending |
| `DESIGN_BACKUP` | Design Project Backup | TECHNICAL | A | SHORT_TERM | design | NUMERIC | Migration pending |
| `DESIGN_STANDARD` | Design Standard / Company Template | TECHNICAL | B (no FY) | PERMANENT | design | NONE | Evergreen library |

Note on `DESIGN_DRAWING` vs `EPC_DRAWING`: both reference the same GCS path builder (`buildDrawingGcsPath()`). `DESIGN_DRAWING` is the governed type tracked via the design module's drawing registry. `EPC_DRAWING` covers the same physical file when accessed through the EPC module. Monitor matching may assign either rule — this is a known architectural limitation. Resolution is deferred to the EPC/Design merge phase.

---

### Module: HR (2 types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `TRIP_DOCUMENT` | Business Trip Document | ADMINISTRATIVE | B | STANDARD | hr | NONE | Migration pending |
| `VISA_DOCUMENT` | Visa / Travel Document | ADMINISTRATIVE | B | STANDARD | hr | NONE | Migration pending |

---

### Module: Legal (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `LEGAL_DOCUMENT` | Legal Document / Contract | LEGAL | B | LONG_TERM | legal | NONE | Migration pending. Covers: contracts, cases, compliance. Future: split into LEGAL_CONTRACT / LEGAL_CASE_DOC. |

---

### Module: Finance (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `BRC_DOCUMENT` | Bank Realisation Certificate | FINANCIAL | B | REGULATORY | finance | NONE | Phase 2A lock-down active. Phase 3 migration approved, not yet executed. |

---

### Module: Sales (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `OFFER_TEMPLATE` | Offer / Quotation Template | COMMERCIAL | B (no FY) | PERMANENT | sales | NONE | Evergreen library. Route path adjustment pending. |

---

### Module: SAP (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `SAP_ATTACHMENT` | SAP Purchase Attachment | FINANCIAL | B | STANDARD | sap | NONE | Migration pending. DocType: QUOTE, GRPO, PO, GENERAL |

---

### Module: Legacy (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `LEGACY_FILE` | Legacy File Storage | TECHNICAL | A | LONG_TERM | legacy | NONE | Read-only archive. Root: `THERMOPAC_PROJECTS/`. No new uploads. |

---

### Module: Internal — Ephemeral (1 type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `SLDDRW_JOB_RESULT` | SolidWorks Extraction Job Result | EPHEMERAL | NONE | EPHEMERAL | internal | NONE | Rule active=false. TTL: 30 days. Never user-facing. |

---

## Summary Count by Module

| Module | Count | New in v2.0 |
|---|---|---|
| EPC | 11 | +2 (ECN, RFQ_ATTACHMENT) |
| DVS | 1 | — |
| QMS | 11 | +1 (NCR) |
| Design | 5 | — |
| HR | 2 | — |
| Legal | 1 | — |
| Finance | 1 | — |
| Sales | 1 | — |
| SAP | 1 | — |
| Legacy | 1 | — |
| Internal | 1 | — |
| **Total** | **36** | **+3 new** |

---

## Token Sub-Vocabularies

### `EPC_DOCUMENT {DocType}` — Controlled Values

The `{DocType}` token in `EPC_DOCUMENT` paths (`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/...`) accepts these controlled values. These are NOT separate governance types — they are path sub-segments within a single rule.

| Value | Full Name | GCS Segment Example |
|---|---|---|
| `BOM` | Bill of Materials | `.../BOM/BOM-001/rev-01/...` |
| `PLN` | Project Planning Record | `.../PLN/PLN-001/rev-01/...` |
| `BUY` | Buy List / Procurement Record | `.../BUY/BUY-001/rev-01/...` |
| `MFG` | Manufacturing Record | `.../MFG/MFG-001/rev-01/...` |
| `QPL` | Quality Plan | `.../QPL/QPL-001/rev-01/...` |
| `POP` | Purchase Order Preparation | `.../POP/POP-001/rev-01/...` |
| `WOP` | Works Order Preparation | `.../WOP/WOP-001/rev-01/...` |
| `INS` | Inspection Execution Record | `.../INS/INS-001/rev-01/...` |
| `INV` | Invoice (EPC internal) | `.../INV/INV-001/rev-01/...` |
| `PLC` | Product Life Cycle Record | `.../PLC/PLC-001/rev-01/...` |
| `CO` | Customer Order | `.../CO/CO-001/rev-01/...` |
| `QTN` | Quotation (project-linked) | `.../QTN/QTN-001/rev-na/...` |
| `DSP` | Dispatch | `.../DSP/DSP-001/rev-01/...` |

Note: `DR` (Dispatch Readiness) was found in epc-coding.ts but conflicts with the engineering standard abbreviation for "Drawing". Do not use `DR` as a {DocType} value. Pending confirmation of correct replacement value.

---

### `SAP_ATTACHMENT {DocType}` — Controlled Values

The `{DocType}` token in `SAP_ATTACHMENT` paths.

| Value | Meaning |
|---|---|
| `QUOTE` | Vendor quotation / offer document |
| `GRPO` | Goods Receipt Purchase Order document |
| `PO` | Purchase Order attachment |
| `GENERAL` | General purchase-related attachment |

---

### `TRIP_DOCUMENT {DocType}` — Controlled Sub-Categories

The `{DocType}` token in `TRIP_DOCUMENT` paths (`TPEL/ADMIN/HR/{CompanyFY}/TRIPS/{EmployeeName}/{Destination}/{DocType}/{filename}`).

| Value | Meaning |
|---|---|
| `travel-booking` | Flight / train booking confirmation |
| `hotel-confirmation` | Hotel booking confirmation |
| `meeting-invitation` | Meeting or event invitation |
| `visa-application` | Visa application documents (separate from VISA_DOCUMENT which covers the visa itself) |
| `advance-payment` | Advance payment request |
| `expense-receipt` | Post-trip expense receipts |
| `trip-report` | Post-trip visit report |
| `correspondence` | General trip-related correspondence |

---

### `RFQ_ATTACHMENT {DocType}` — Controlled Sub-Categories

Attachment categories within the RFQ email dispatch flow.

| Value | Meaning |
|---|---|
| `datasheet` | Technical datasheet attached to RFQ |
| `drawing` | Engineering drawing attached to RFQ |
| `specification` | Technical specification document |
| `qap` | Quality Assurance Plan |

---

## Revision Strategy Reference

| Value | Meaning | Example Segment |
|---|---|---|
| `NUMERIC` | Sequential integer | `rev-01`, `rev-02` |
| `ALPHABETIC` | Letter-based | `rev-A`, `rev-B` |
| `NONE` | No revision scheme | `rev-na` or segment omitted |

---

## Open Items — Pending Confirmation Before Freeze

| # | Item | Action Needed |
|---|---|---|
| OI-1 | `NCR` GCS path | Confirm whether NCR files go to GCS and define the canonical path template. Are NCRs project-specific (Family A) or can they exist at company level too? |
| OI-2 | `ECN` GCS path | Confirm whether ECN documents are stored in GCS. If yes, is the path adjacent to ECR (same folder, different label) or separate? |
| OI-3 | `RFQ_ATTACHMENT` path | Confirm canonical GCS path for RFQ attachments. Current route uses `plc_rfq_attachments` table — what path structure does it build? |
| OI-4 | `DESIGN_DRAWING` vs `EPC_DRAWING` monitor conflict | Two rules match the same GCS path prefix (`TPEL/`). Confirm whether the monitor should distinguish these by path depth/segment or whether to merge the two rules. |
| OI-5 | `DR` {DocType} value | `DR` (Dispatch Readiness) found in epc-coding.ts but conflicts with "Drawing" abbreviation. Confirm replacement value (`DISP-RDY`? `DRDY`?). |
| OI-6 | `LEGAL_DOCUMENT` split | Future: split into `LEGAL_CONTRACT`, `LEGAL_CASE_DOC`, `COMPLIANCE_DOC`. Confirm timing. |

---

## Deprecation Register

Types that are renamed in v2.0. Old values are retained in DB with `active=false` during a 30-day transition window after the seed is updated.

| Old `document_type` | New `document_type` | Reason | Status |
|---|---|---|---|
| `DRAWING` | `EPC_DRAWING` | Naming conflict with DESIGN_DRAWING — same path builder | Pending seed update |
| `MATERIAL_CERT` | `MATERIAL_ID_DOC` | Misleading suffix — not a certificate | Pending seed update |

---

## Amendment Process

**To add a `document_type`:**
1. Add entry to this vocabulary document (with all 5 metadata columns)
2. Add corresponding rule to `SEED_RULES` in `server/services/gcs-governance-service.ts`
3. Add new tokens (if any) to `SEED_TOKENS`
4. Restart server — seed runs on startup
5. Verify in `gcs_governance_rules` via DB query
6. Update `docs/gcs-governance-rev5-option-c-baseline.md` or create new revision baseline

**To rename a `document_type`:**
1. Add the old value to the Deprecation Register above
2. Add new value as a new entry
3. Update `SEED_RULES` — old rule: `active: false`; new rule: insert
4. Set 30-day transition window before removing old type from monitoring queries
5. Update all references in route files to use new type string

**To retire a `document_type`:**
Set `active: false` in `SEED_RULES`. The monitor stops matching files against it. Do not delete the DB row — retain for audit history.

---

## Freeze Checklist

This document is freeze-ready when:

- [ ] OI-1 through OI-6 are resolved
- [ ] `DRAWING` → `EPC_DRAWING` rename confirmed
- [ ] `MATERIAL_CERT` → `MATERIAL_ID_DOC` rename confirmed
- [ ] `ECN`, `NCR`, `RFQ_ATTACHMENT` GCS path templates confirmed and added to seed
- [ ] DB seed updated and verified for all changes
- [ ] `docs/gcs-governance-rev5-option-c-baseline.md` updated to reflect v2.0 vocabulary
- [ ] Status changed from DRAFT to APPROVED
