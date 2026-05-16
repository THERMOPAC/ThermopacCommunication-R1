# Canonical Document Type Vocabulary — v2.0
**Date:** 2026-05-16
**Status:** APPROVED — FROZEN
**Supersedes:** `docs/document-type-vocabulary-v1.0.md` (draft), `docs/document-type-vocabulary-v2.0-draft.md`
**Audit basis:** Full 10-point vocabulary audit 2026-05-16
**Prepared by:** Replit Agent
**Approved by:** THERMOPAC Management

---

## Open Items — All Resolved

| # | Item | Resolution | Method |
|---|---|---|---|
| OI-1 | NCR GCS path and family | **Family A — Project Governance.** Path: `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QMS/NCR/{NcrNumber}/rev-{rev}/{filename}` | Management decision 2026-05-16 |
| OI-2 | ECN GCS path | **Separate from ECR.** Path: `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECN/{DocNumber}/rev-{rev}/{filename}` | Management decision 2026-05-16 |
| OI-3 | RFQ_ATTACHMENT canonical path | **Reference-only type — no new GCS objects created.** `rfq-email-service.ts` line 127 confirmed: `gcs_path` copied verbatim from existing `buy_list_line_selections.datasheet_gcs_object_path` (a `DATASHEET`-governed path). Rule set `active=false`. Vocabulary entry retained for audit tracking. | Code inspection |
| OI-4 | DESIGN_DRAWING vs EPC_DRAWING monitor conflict | **DESIGN_DRAWING retired — merged into EPC_DRAWING.** Code inspection confirmed both types use the same `buildDrawingGcsPath()` builder (`project-item-detail-routes.ts` line 205) and produce identical path templates. Same physical GCS files, same path. One rule is sufficient. `DESIGN_DRAWING` set `active=false`. | Code inspection |
| OI-5 | `DR` {DocType} value conflict | **Replaced by `DSP` (Dispatch).** `DR` conflicts with the universal engineering abbreviation for "Drawing". `DSP` is unambiguous. | Management decision 2026-05-16 |
| OI-6 | LEGAL_DOCUMENT split into LEGAL_CONTRACT / LEGAL_CASE_DOC / COMPLIANCE_DOC | **Deferred to future phase.** LEGAL_DOCUMENT remains as a single umbrella type. Split to be planned separately. | Management decision 2026-05-16 |

---

## Change Summary from v1.0 Draft

| Change | Type | Detail |
|---|---|---|
| `DRAWING` → `EPC_DRAWING` | Rename + deprecate old | Same path template. Old rule set `active=false`. |
| `DESIGN_DRAWING` retired | Retire | Merged into `EPC_DRAWING`. Same physical files. Set `active=false`. |
| `MATERIAL_CERT` → `MATERIAL_ID_DOC` | Rename + deprecate old | Corrects misleading `_CERT` suffix. Old rule set `active=false`. |
| `ECN` added | New type | Engineering Change Notice — separate lifecycle stage from ECR. |
| `NCR` added | New type | Non-Conformance Report — Family A, QMS ownership. |
| `RFQ_ATTACHMENT` added | New type (inactive) | Reference-only. No new GCS objects. Active=false. Audit tracking only. |
| `DR` → `DSP` in `{DocType}` vocab | Sub-vocabulary fix | Removes ambiguous abbreviation from EPC_DOCUMENT {DocType} values. |
| 5 metadata columns added | Schema addition | `lifecycle_category`, `family_type`, `retention_class`, `module_ownership`, `revision_strategy` |
| OI-6 deferred | Deferred | LEGAL_DOCUMENT split deferred to future phase. |

**Active types: 33 | Inactive in registry: 5 (DRAWING, DESIGN_DRAWING, MATERIAL_CERT, RFQ_ATTACHMENT, SLDDRW_JOB_RESULT)**

---

## Canonical Naming Rules (Frozen)

| Rule | Definition |
|---|---|
| N1 | Format: `SCREAMING_SNAKE_CASE` only. No spaces, hyphens, or lowercase. |
| N2 | Module prefix **required** when the same noun appears in two or more modules, or when the noun alone is ambiguous. |
| N3 | Module prefix **omitted** when the type is module-unique and the noun is self-describing, or for established industry abbreviations (ECR, NCR, BOM, RFQ, ECN). |
| N4 | Suffixes: `_CERT` for actual certificates only; `_DOCUMENT` only when the noun alone is ambiguous; `_REPORT` for formal output reports. |
| N5 | Forbidden: single or 2-letter naked abbreviations (`PO`, `WO`, `DR`) as standalone types; verb-based names; technology format names. |
| N6 | Rename trigger: violation of N1–N5 requires a rename. Old type: `active=false` in seed. New type: inserted. 30-day transition window before old type removed from queries. |

---

## Metadata Column Definitions

| Column | Allowed Values |
|---|---|
| `lifecycle_category` | `TECHNICAL` · `QUALITY` · `COMMERCIAL` · `FINANCIAL` · `LEGAL` · `ADMINISTRATIVE` · `OPERATIONAL` · `EPHEMERAL` |
| `family_type` | `A` (project) · `B` (company) · `B*` (pre-project) · `NONE` (ephemeral/internal) |
| `retention_class` | `PERMANENT` · `REGULATORY` · `LONG_TERM` · `STANDARD` · `SHORT_TERM` · `EPHEMERAL` |
| `module_ownership` | `epc` · `qms` · `design` · `hr` · `legal` · `finance` · `sales` · `sap` · `dvs` · `legacy` · `internal` |
| `revision_strategy` | `NUMERIC` · `ALPHABETIC` · `NONE` |

### Retention Class Definitions

| Class | Duration | Used For |
|---|---|---|
| `PERMANENT` | Never delete | Evergreen company libraries (design standards, offer templates) |
| `REGULATORY` | Per statute / standard | Financial compliance docs, welding/quality certs (ASME, ISO 9001) |
| `LONG_TERM` | 7–10 years | Project documents, legal contracts, engineering drawings |
| `STANDARD` | 3–7 years | ECR/ECN, dispatch, calibration, HR travel, SAP procurement |
| `SHORT_TERM` | 1–3 years | Staging artefacts, transmittals, backups, welder photos |
| `EPHEMERAL` | ≤ 30 days | Internal processing artefacts, never user-facing |

---

## Active Vocabulary

### Module: EPC (10 active types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Route / Source |
|---|---|---|---|---|---|---|---|
| `EPC_DOCUMENT` | EPC Project Document | TECHNICAL | A | LONG_TERM | epc | NUMERIC | `epc-coding.ts` → `buildEpcGcsPath()` |
| `EPC_DRAWING` | EPC Engineering Drawing | TECHNICAL | A | LONG_TERM | epc | ALPHABETIC | `epc-coding.ts` → `buildDrawingGcsPath()` · `project-item-detail-routes.ts` |
| `DDS` | Design Data Sheet | TECHNICAL | A | LONG_TERM | epc | ALPHABETIC | `dds-pdf-service.ts` → `buildDdsGcsPath()` |
| `CO_DOCUMENT` | Customer Order Document | COMMERCIAL | A | LONG_TERM | epc | NUMERIC | `customer-order-document-routes.ts` |
| `ECR` | Engineering Change Request | TECHNICAL | A | STANDARD | epc | NUMERIC | `engineering-change-routes.ts` |
| `ECN` | Engineering Change Notice | TECHNICAL | A | STANDARD | epc | NUMERIC | `drawing-ecr-ecn-routes.ts` |
| `DISPATCH` | Dispatch Document | OPERATIONAL | A | STANDARD | epc | NUMERIC | `dispatch-routes.ts` |
| `DATASHEET` | PPPC Procurement Datasheet | TECHNICAL | A | STANDARD | epc | NUMERIC | `pppc-routes.ts` |
| `QUOTATION` | Standalone Offer PDF (pre-project) | COMMERCIAL | B* | LONG_TERM | epc | NUMERIC | `epc-coding.ts` → `buildQuotationGcsPath()` |
| `EPC_QUOTATION` | Project-Linked Quotation | COMMERCIAL | A | LONG_TERM | epc | NONE | `epc-coding.ts` → `buildEpcQtnGcsPath()` |

Notes:
- `QUOTATION` is pre-project (no NNN). Uses current CompanyFY at time of generation.
- `ECN` is the approved change notice issued after an `ECR` is processed through the engineering change workflow. Different document, different lifecycle stage.
- `EPC_DRAWING` covers drawings uploaded from both the EPC drawing control and the design module — both use `buildDrawingGcsPath()` and produce the same path template. `DESIGN_DRAWING` was retired for this reason (see Deprecation Register).

---

### Module: DVS (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Route / Source |
|---|---|---|---|---|---|---|---|
| `DVS_STAGING` | DVS Drawing Staging Artefact | TECHNICAL | A | SHORT_TERM | dvs | NUMERIC | `drawing-verification-routes.ts` |

Note: Staging artefact — not a permanent record. Assign cleanup policy after DVS verification completes.

---

### Module: QMS (11 active types)

All QMS types currently use TRANSITIONAL ROOT `QMS/`. Family classifications and target paths confirmed 2026-05-16. See `docs/gcs-governance-rev5-option-c-baseline.md` Section 3.8.

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `WPQR` | Welder Performance Qualification Record | QUALITY | B | REGULATORY | qms | NUMERIC | Company-level master record. Current root: `QMS/WPQR/` |
| `PMA` | Particular Material Appraisal | QUALITY | B | LONG_TERM | qms | NUMERIC | Company material library. Current root: `QMS/PMA/` |
| `WPS_PQR` | Welding Procedure Spec / PQR | QUALITY | B | REGULATORY | qms | NUMERIC | Company-level. Current root: `QMS/WPS/` |
| `CALIBRATION_CERT` | Calibration Certificate | QUALITY | B | STANDARD | qms | NONE | Flat file. Current root: `QMS/Instrument/` |
| `WELDER_CERT` | Welder Qualification Certificate | QUALITY | B | REGULATORY | qms | NUMERIC | Linked to welder personnel. Current root: `QMS/WelderCertificates/` |
| `WELDER_PHOTO` | Welder ID Photo | ADMINISTRATIVE | B | SHORT_TERM | qms | NONE | Flat file. Current root: `QMS/WELDERS/` |
| `TEST_PROCEDURE` | Test Procedure Document | QUALITY | B | STANDARD | qms | NUMERIC | Company NDT procedures. Current root: `QMS/TestProcedures/` |
| `NCR` | Non-Conformance Report | QUALITY | A | STANDARD | qms | NUMERIC | Project-specific. Target path: `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QMS/NCR/{NcrNumber}/rev-{rev}/{filename}`. Raised by QA against EPC deliverables. GCS path pending — rule added at correct TPEL root. |
| `INSPECTION_DOC` | Inspection Record Document | QUALITY | A | LONG_TERM | qms | NONE | Has `project_id` FK. Current root: `QMS/Inspections_Records/` |
| `MATERIAL_ID_DOC` | Material Identification Document | QUALITY | A | LONG_TERM | qms | NONE | Has `project_id` FK. Current root: `QMS/Material_Identification/`. Renamed from `MATERIAL_CERT` — was misleading suffix. |
| `FINAL_DOSSIER` | Final Inspection Dossier PDF | QUALITY | A | LONG_TERM | qms | NONE | Linked to IONum → project. Current root: `QMS/Inspections_Records/` |

---

### Module: Design (4 active types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `BASIC_DRAWING` | Basic / Preliminary Drawing | TECHNICAL | A | LONG_TERM | design | NUMERIC | Migration pending. Current: `Design_Management/{ProjectCode}/Basic_Drawings/...` |
| `TRANSMITTAL` | Design Transmittal | OPERATIONAL | A | SHORT_TERM | design | NONE | Migration pending. Current: `Design_Management/Transmittals/...` |
| `DESIGN_BACKUP` | Design Project Backup | TECHNICAL | A | SHORT_TERM | design | NUMERIC | Migration pending. Current: `Design_Management/{ProjectCode}/Backups/...` |
| `DESIGN_STANDARD` | Design Standard / Company Template | TECHNICAL | B (no FY) | PERMANENT | design | NONE | Evergreen library. No FY segment. Migration pending. Current: `Design_Management/Standards/...` |

Note: `DESIGN_DRAWING` has been retired and merged into `EPC_DRAWING` (see Deprecation Register). All drawing uploads — whether initiated from EPC drawing control or design module — are governed by the `EPC_DRAWING` type.

---

### Module: HR (2 active types)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `TRIP_DOCUMENT` | Business Trip Document | ADMINISTRATIVE | B | STANDARD | hr | NONE | Migration pending. Current: `Business_Trips/...` |
| `VISA_DOCUMENT` | Visa / Travel Document | ADMINISTRATIVE | B | STANDARD | hr | NONE | Migration pending. Current: `Visa_Documents/...` |

---

### Module: Legal (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `LEGAL_DOCUMENT` | Legal Document / Contract | LEGAL | B | LONG_TERM | legal | NONE | Migration pending. Covers: contracts, cases, compliance. Future split (OI-6) deferred. |

---

### Module: Finance (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `BRC_DOCUMENT` | Bank Realisation Certificate | FINANCIAL | B | REGULATORY | finance | NONE | Phase 2A lock-down active. Phase 3 root migration approved, not yet executed. Current root: `Accounts/` |

---

### Module: Sales (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `OFFER_TEMPLATE` | Offer / Quotation Template | COMMERCIAL | B (no FY) | PERMANENT | sales | NONE | Evergreen library. No FY segment. Route path adjustment pending. |

---

### Module: SAP (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `SAP_ATTACHMENT` | SAP Purchase Attachment | FINANCIAL | B | STANDARD | sap | NONE | Migration pending. Current root: `Vendor_Quotes/`. {DocType}: QUOTE, GRPO, PO, GENERAL |

---

### Module: Legacy (1 active type)

| `document_type` | Display Name | Lifecycle | Family | Retention | Ownership | Revision | Note |
|---|---|---|---|---|---|---|---|
| `LEGACY_FILE` | Legacy File Storage | TECHNICAL | A | LONG_TERM | legacy | NONE | Read-only archive. Root: `THERMOPAC_PROJECTS/`. No new uploads. |

---

## Inactive / Reference Types (in registry, active=false)

| `document_type` | Module | Reason | Active |
|---|---|---|---|
| `DRAWING` | epc | Deprecated — renamed to `EPC_DRAWING` 2026-05 | false |
| `DESIGN_DRAWING` | design | Retired — merged into `EPC_DRAWING` 2026-05. Same physical files, same path builder. | false |
| `MATERIAL_CERT` | qms | Deprecated — renamed to `MATERIAL_ID_DOC` 2026-05. Misleading `_CERT` suffix. | false |
| `RFQ_ATTACHMENT` | epc | Reference-only (OI-3). No new GCS objects created. Tracks frozen snapshots of existing `DATASHEET` paths in `plc_rfq_attachments` table. | false |
| `SLDDRW_JOB_RESULT` | internal | Ephemeral SolidWorks job artefact. TTL: 30 days. Never user-facing. | false |

---

## Active Count by Module

| Module | Active Types |
|---|---|
| EPC | 10 |
| DVS | 1 |
| QMS | 11 |
| Design | 4 |
| HR | 2 |
| Legal | 1 |
| Finance | 1 |
| Sales | 1 |
| SAP | 1 |
| Legacy | 1 |
| **Total Active** | **33** |
| Inactive in registry | 5 |
| **Total in registry** | **38** |

---

## Token Sub-Vocabularies

### `EPC_DOCUMENT {DocType}` — Controlled Values

The `{DocType}` token in `EPC_DOCUMENT` paths (`TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/...`). These are path sub-segments within the single `EPC_DOCUMENT` rule — not separate governance types.

| Value | Full Name | Notes |
|---|---|---|
| `BOM` | Bill of Materials | Revision-controlled in `epc_document_routes.ts` |
| `PLN` | Project Planning Record | |
| `BUY` | Buy List / Procurement Record | |
| `MFG` | Manufacturing Record | |
| `QPL` | Quality Plan | |
| `POP` | Purchase Order Preparation | |
| `WOP` | Works Order Preparation | |
| `INS` | Inspection Execution Record | |
| `INV` | Invoice (EPC internal) | |
| `PLC` | Product Life Cycle Record | |
| `CO` | Customer Order | |
| `QTN` | Quotation (project-linked) | |
| `DSP` | Dispatch | Replaces `DR` (2026-05-16 — `DR` conflicted with "Drawing" abbreviation) |

---

### `SAP_ATTACHMENT {DocType}` — Controlled Values

| Value | Meaning |
|---|---|
| `QUOTE` | Vendor quotation / offer document |
| `GRPO` | Goods Receipt Purchase Order document |
| `PO` | Purchase Order attachment |
| `GENERAL` | General purchase-related attachment |

---

### `TRIP_DOCUMENT {DocType}` — Controlled Sub-Categories

| Value | Meaning |
|---|---|
| `travel-booking` | Flight / train booking confirmation |
| `hotel-confirmation` | Hotel booking confirmation |
| `meeting-invitation` | Meeting or event invitation |
| `visa-application` | Visa application documents |
| `advance-payment` | Advance payment request |
| `expense-receipt` | Post-trip expense receipts |
| `trip-report` | Post-trip visit report |
| `correspondence` | General trip-related correspondence |

---

### `RFQ_ATTACHMENT {attachment_type}` — Hardcoded Value

**Note:** `RFQ_ATTACHMENT` is a reference-only type. The `attachment_type` in `plc_rfq_attachments` is hardcoded as `'datasheet'` in `rfq-email-service.ts`. The `gcs_path` column stores the verbatim GCS path of the frozen PPPC `DATASHEET` file. No new GCS object is created at RFQ issue time.

| Value | Meaning |
|---|---|
| `datasheet` | Frozen snapshot of an existing PPPC procurement datasheet (hardcoded in service) |

---

## Deprecation Register

| Old `document_type` | New `document_type` | Reason | Seed Status |
|---|---|---|---|
| `DRAWING` | `EPC_DRAWING` | Naming conflict with retired `DESIGN_DRAWING`. Rename clarifies EPC module ownership. | active=false |
| `DESIGN_DRAWING` | `EPC_DRAWING` (merged) | Same physical files, same path builder (`buildDrawingGcsPath()`). Two rules for one template causes monitor ambiguity. | active=false |
| `MATERIAL_CERT` | `MATERIAL_ID_DOC` | `_CERT` suffix was misleading — this document is a Material Identification form, not a test certificate. | active=false |

**Transition rule:** Deprecated types remain in `gcs_governance_rules` with `active=false` for 30 days minimum after vocabulary freeze. Monitor queries exclude inactive rules. After transition window, rows may be archived but not deleted.

---

## Deferred Items (OI-6)

| Item | Detail | Status |
|---|---|---|
| `LEGAL_DOCUMENT` split | Split into `LEGAL_CONTRACT`, `LEGAL_CASE_DOC`, `COMPLIANCE_DOC` for finer granularity | Deferred to future phase. No timeline set. |

---

## Revision Strategy Reference

| Value | Meaning | Example |
|---|---|---|
| `NUMERIC` | Sequential integer | `rev-01`, `rev-02` |
| `ALPHABETIC` | Letter-based | `rev-A`, `rev-B` |
| `NONE` | No revision — single file or flat storage | `rev-na` or no rev segment |

---

## Amendment Process

**To add a `document_type`:**
1. Add entry to this document with all 5 metadata columns completed
2. Add rule to `SEED_RULES` in `server/services/gcs-governance-service.ts`
3. Add new tokens (if any) to `SEED_TOKENS`
4. Restart server — seed runs at startup
5. Verify in `gcs_governance_rules` via DB query
6. Update `docs/gcs-governance-rev5-option-c-baseline.md` or create new revision baseline

**To rename a `document_type`:**
1. Add old value to Deprecation Register above
2. Add new value as new entry
3. In `SEED_RULES`: old rule `active: false`; new rule: insert
4. 30-day transition window before removing old type from monitoring queries
5. Update route files to pass new type string (Phase 2B or later)

**To retire a `document_type`:**
Set `active: false` in `SEED_RULES`. Do not delete the DB row — retain for audit history.
