# Canonical Document Type Vocabulary — v1.0
**Date:** 2026-05-16
**Status:** DRAFT — Pending approval before use in enforcement phases
**Prepared by:** Replit Agent
**Related baseline:** `docs/gcs-governance-rev5-option-c-baseline.md`

---

## Purpose

This document is the single source of truth for all canonical `document_type` values used across the GCS Governance system. Every governance rule in `gcs_governance_rules` uses exactly one `document_type` from this list. No rule may use a `document_type` not listed here without first updating this vocabulary.

This vocabulary is used by:
- `gcs_governance_rules.document_type` column
- `gcs_upload_monitor_log.document_type` column
- Upload token requests (`gcs_upload_tokens.document_type` column)
- Any future Phase 2B enforcement middleware

---

## Controlled Vocabulary

### EPC Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source |
|---|---|---|---|---|
| `EPC_DOCUMENT` | EPC Project Document | A | Numeric | `epc-coding.ts` → `buildEpcGcsPath()` |
| `DRAWING` | EPC Engineering Drawing | A | Alphabetic | `epc-coding.ts` → `buildDrawingGcsPath()` |
| `DDS` | Design Data Sheet PDF | A | Alphabetic | `dds-pdf-service.ts` → `buildDdsGcsPath()` |
| `CO_DOCUMENT` | Customer Order Document | A | Numeric | `customer-order-document-routes.ts` |
| `ECR` | Engineering Change Request | A | Numeric | `engineering-change-routes.ts` |
| `DISPATCH` | Dispatch Document | A | Numeric | `dispatch-routes.ts` |
| `DATASHEET` | PPPC Procurement Datasheet | A | Numeric | `pppc-routes.ts` |
| `QUOTATION` | Standalone Offer PDF (pre-project) | B* | Numeric | `epc-coding.ts` → `buildQuotationGcsPath()` |
| `EPC_QUOTATION` | Project-Linked Quotation | A | None | `epc-coding.ts` → `buildEpcQtnGcsPath()` |

*`QUOTATION` is pre-project (no NNN). Uses current CompanyFY at time of generation.

---

### DVS Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source |
|---|---|---|---|---|
| `DVS_STAGING` | DVS Drawing Staging | A | Numeric | `drawing-verification-routes.ts` |

---

### QMS Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `WPQR` | Welder Performance Qualification Record | B | Numeric | `wpqr-routes.ts` | Company-level master record |
| `PMA` | Particular Material Appraisal | B | Numeric | `pma-routes.ts` | Company-level material library |
| `WPS_PQR` | Welding Procedure Spec / PQR | B | Numeric | `wps-pqr-routes.ts` | Company-level, under QMS/WPS/ |
| `CALIBRATION_CERT` | Calibration Certificate | B | None | `calibration-routes.ts` | Flat file, no revision |
| `WELDER_CERT` | Welder Qualification Certificate | B | Numeric | `welder-certificate-routes.ts` | Linked to welder personnel |
| `WELDER_PHOTO` | Welder ID Photo | B | None | `welder-photo-routes.ts` | Flat file, no revision |
| `TEST_PROCEDURE` | Test Procedure Document | B | Numeric | `test-procedures-routes.ts` | Company NDT procedures |
| `INSPECTION_DOC` | Inspection Record Document | A | None | `inspection-document-routes.ts` | Project-specific, has `project_id` FK |
| `MATERIAL_CERT` | Material Identification Document | A | None | `material-identification-routes.ts` | Project-specific, has `project_id` FK |
| `FINAL_DOSSIER` | Final Inspection Dossier PDF | A | None | `final-dossier-generator.ts` | Project-specific, linked to IONum |

All 10 QMS types currently use TRANSITIONAL ROOT `QMS/`. See `docs/gcs-governance-rev5-option-c-baseline.md` Section 3.8 for target paths.

---

### Design Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `DESIGN_DRAWING` | Design Drawing (governed) | A | Alphabetic | `design-drawing-routes.ts` | Already at correct TPEL root |
| `BASIC_DRAWING` | Basic / Preliminary Drawing | A | Numeric | `design-basic-drawings-routes.ts` | Migration pending |
| `TRANSMITTAL` | Design Transmittal | A | None | `design-transmittal-routes.ts` | Migration pending |
| `DESIGN_BACKUP` | Design Project Backup | A | Numeric | `design-backup-routes.ts` | Migration pending |
| `DESIGN_STANDARD` | Design Standard / Company Template | B (no FY) | None | `design-standards-routes.ts` | Evergreen library |

---

### HR Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `TRIP_DOCUMENT` | Business Trip Document | B | None | `trip-management-routes.ts` | Migration pending |
| `VISA_DOCUMENT` | Visa / Travel Document | B | None | `visa-management-routes.ts` | Migration pending |

---

### Legal Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `LEGAL_DOCUMENT` | Legal Document / Contract | B | None | `legal-management-routes.ts` | Migration pending |

---

### Finance Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `BRC_DOCUMENT` | Bank Realisation Certificate | B | None | `finance-routes-fixed.ts` | Phase 2A lock-down active. Phase 3 migration approved, not executed. |

---

### Sales Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `OFFER_TEMPLATE` | Offer / Quotation Template | B (no FY) | None | `sales-marketing-routes.ts` | Evergreen library. Route path adjustment pending. |

---

### SAP Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `SAP_ATTACHMENT` | SAP Purchase Attachment | B | None | `sap-purchase-routes.ts` | Migration pending. {DocType}: QUOTE, GRPO, PO, GENERAL |

---

### Legacy Module

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `LEGACY_FILE` | Legacy File Storage | A | None | Pre-TPEL archive | Read-only archive. Root: `THERMOPAC_PROJECTS/` |

---

### Internal Module (Ephemeral — Not Subject to Governance)

| `document_type` | Display Name | Family | Revision Mode | Route / Source | Note |
|---|---|---|---|---|---|
| `SLDDRW_JOB_RESULT` | SolidWorks Extraction Job Result | — | None | `epc-slddrw-job-routes.ts` | Rule active=false. Ephemeral. TTL: 30 days. |

---

## Summary Count

| Module | Count |
|---|---|
| EPC | 9 |
| DVS | 1 |
| QMS | 10 |
| Design | 5 |
| HR | 2 |
| Legal | 1 |
| Finance | 1 |
| Sales | 1 |
| SAP | 1 |
| Legacy | 1 |
| Internal | 1 |
| **Total** | **33** |

---

## DocType Controlled Vocabulary (SAP)

The `{DocType}` token in `SAP_ATTACHMENT` paths uses this controlled vocabulary:

| Value | Meaning |
|---|---|
| `QUOTE` | Vendor quotation / offer document |
| `GRPO` | Goods Receipt Purchase Order document |
| `PO` | Purchase Order attachment |
| `GENERAL` | General purchase-related attachment not fitting above categories |

---

## Revision Mode Reference

| Value | Meaning | Example |
|---|---|---|
| `numeric` | Sequential integer revision | `rev-01`, `rev-02` |
| `alphabetic` | Letter-based revision | `rev-A`, `rev-B` |
| `none` | No revision scheme — single file or flat storage | `rev-na` or no rev segment |

---

## Amendment Process

To add a new `document_type`:
1. Add the entry to this vocabulary document
2. Add the corresponding rule to `SEED_RULES` in `server/services/gcs-governance-service.ts`
3. If new tokens are introduced, add them to `SEED_TOKENS`
4. Restart the server (seed runs on startup)
5. Verify the new rule is present in `gcs_governance_rules` via DB query
6. Update `docs/gcs-governance-rev5-option-c-baseline.md` or create a new revision baseline

To retire a `document_type`, set `active: false` in `SEED_RULES` — the monitor will stop matching files against it.
