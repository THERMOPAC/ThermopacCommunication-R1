# GCS Governance Baseline — Rev 5 (Option C Clarification)
**Date:** 2026-05-16
**Status:** APPROVED — Canonical path definitions frozen. No migration executed.
**Supersedes:** `docs/gcs-governance-rev4-closure.md`
**Prepared by:** Replit Agent
**Approved by:** THERMOPAC Management

---

## 1. Summary of Changes from Rev 4

Rev 4 closed governance Phase 0 and Phase 1 and established the two-family path model. Rev 5 (this document) resolves all outstanding governance clarification items for the Design, HR, Legal, Sales, SAP, and QMS modules. No files have been moved. No enforcement has been extended. Only governance rules (DB seed) and baseline documentation are updated.

### Changes Made in Rev 5

| # | Change |
|---|---|
| 1 | Design Basic Drawings — reclassified as Family A, canonical target path defined |
| 2 | Design Transmittals — reclassified as Family A, canonical target path defined |
| 3 | Design Backups — reclassified as Family A, canonical target path defined |
| 4 | Design Standards — new governance rule added, Family B evergreen library (no FY) |
| 5 | HR Business Trips — reclassified as Family B, canonical target path defined, {CompanyFY} replaces {BizYear} |
| 6 | HR Visa Documents — reclassified as Family B, canonical target path defined |
| 7 | Legal Contracts — reclassified as Family B, canonical target path defined, {ContractType} replaces {Category} |
| 8 | Sales Offer Templates — confirmed company-wide evergreen library, canonical target path defined, Family B no FY (Decision 1) |
| 9 | SAP Attachments — {DocType} discriminator added per Decision 2, canonical target path defined |
| 10 | QMS all 10 rules — family classification added to notes, precise target paths documented |
| 11 | 11 new tokens added to SEED_TOKENS registry |

---

## 2. Two-Family Path Model (Reaffirmed)

```
Family A — Project Governance Path
  TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/...

  Used when: document is created against a specific project (has project_id FK)
  FY type:   ProjectFY — the financial year of the project record
  Tokens:    {CC} continent code, {CO} customer order, {Cust} customer slug,
             {ProjectFY} e.g. 2627, {NNN} 3-digit project sequence

Family B — Company Governance Path
  TPEL/{Department}/{CompanyFY}/...

  Used when: document is company-level — not tied to a specific project
  FY type:   CompanyFY — April-March financial year, format YYZZ e.g. 2526
  Tokens:    {Department} e.g. ADMIN/HR, LEGAL, SAP, QMS, SALES, DESIGN
```

### Approved Exception — Evergreen Libraries (no FY)

Two document types are approved to omit `{CompanyFY}` from their path because they are reusable company-wide libraries with no annual reset cycle:

- **Design Standards:** `TPEL/DESIGN/STANDARDS/{Category}/{StandardName}/{filename}`
- **Sales Offer Templates:** `TPEL/SALES/TEMPLATES/{TemplateSlug}/{Seq}-{Label}.{ext}`

This exception was approved 2026-05-16 (Decision 1).

---

## 3. Module-by-Module Canonical Path Definitions

### 3.1 EPC Module (unchanged from Rev 4)

| Document Type | Family | Path Template |
|---|---|---|
| EPC_DOCUMENT | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| DRAWING | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |
| DDS | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DDS/{DrawingNo}_dds-rev-{rev}.pdf` |
| CO_DOCUMENT | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/CO/{CO}/rev-{rev}/{Seq}-{Label}.{ext}` |
| ECR | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECR/{DocNumber}/rev-{rev}/{filename}` |
| DISPATCH | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DISPATCH/{DocNumber}/rev-{rev}/{filename}` |
| DATASHEET | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}` |
| QUOTATION | B* | `TPEL/{CC}/{CO}/{Cust}/{FY}/Quotations/{OfferNo}/rev-{rev}/{Seq}-{Label}.pdf` |
| EPC_QUOTATION | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QTN/{OfferNo}/rev-na/{Seq}-{Label}.pdf` |

*QUOTATION is pre-project (no NNN), uses current company FY at time of generation.

---

### 3.2 Design Module

**Rule:** All design documents with a `projectId` or `designProjectId` are Family A. Company-wide design library assets are Family B (evergreen).

| Document Type | Family | Canonical Target Path | Current (Transitional) Path |
|---|---|---|---|
| DESIGN_DRAWING | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` | Already correct ✅ |
| BASIC_DRAWING | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BASIC/{Discipline}/{DrawingType}_R{rev}.{ext}` | `Design_Management/{ProjectCode}/Basic_Drawings/{Discipline}/...` |
| TRANSMITTAL | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/TRANSMITTAL/{TransmittalNo}/{filename}` | `Design_Management/Transmittals/{TransmittalNo}/...` |
| DESIGN_BACKUP | A | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BACKUP/{BackupType}_R{rev}/{filename}` | `Design_Management/{ProjectCode}/Backups/...` |
| DESIGN_STANDARD | B (no FY) | `TPEL/DESIGN/STANDARDS/{Category}/{StandardName}/{filename}` | `Design_Management/Standards/{Category}/{StandardName}/...` |

**FY type for Design Family A:** ProjectFY — the FY of the linked project record.

---

### 3.3 HR Module

**Rule:** All HR documents are Family B. `{CompanyFY}` = April-March FY of the document's creation/issue date.

| Document Type | Family | Canonical Target Path | Current (Transitional) Path |
|---|---|---|---|
| TRIP_DOCUMENT | B | `TPEL/ADMIN/HR/{CompanyFY}/TRIPS/{EmployeeName}/{Destination}/{DocType}/{filename}` | `Business_Trips/{BizYear}/{EmployeeName}/{Destination}/{FromDate}/{DocType}/...` |
| VISA_DOCUMENT | B | `TPEL/ADMIN/HR/{CompanyFY}/VISA/{EmployeeName}/{Category}/{filename}` | `Visa_Documents/{EmployeeName}/{Category}/...` |

**Token clarifications:**
- `{CompanyFY}` replaces `{BizYear}` — must use April-March FY format (e.g. `2526`), not calendar year
- `{Destination}` = sanitised city/country slug (e.g. `dubai`, `frankfurt`)
- `{DocType}` for trips = document category (e.g. `boarding-pass`, `hotel`, `invoice`, `visa`)
- `{FromDate}` used in old path is **not** carried to the canonical path — it belongs in the DB record, not the GCS path

---

### 3.4 Legal Module

**Rule:** All legal documents are Family B. `{CompanyFY}` = FY of contract execution/signature.

| Document Type | Family | Canonical Target Path | Current (Transitional) Path |
|---|---|---|---|
| LEGAL_DOCUMENT | B | `TPEL/LEGAL/{CompanyFY}/{ContractType}/{EntityName}/{filename}` | `Legal_Documents/{Category}/{EntityName}/...` |

**`{ContractType}` controlled vocabulary:** `NDA`, `Service`, `Purchase`, `Employment`, `Civil`, `Criminal`, `IP`, `Compliance`

---

### 3.5 Finance Module

| Document Type | Family | Canonical Target Path | Current Path | Status |
|---|---|---|---|---|
| BRC_DOCUMENT | B | `TPEL/FINANCE/BRC/{CompanyFY}/{filename}` | `Accounts/{FY}/{filename}` | Phase 3 approved, not executed |

Phase 2A lock-down is in place at `server/finance-routes-fixed.ts`. Existing files remain at `Accounts/{FY}/` until Phase 3 migration is approved and executed.

---

### 3.6 Sales Module

**Confirmed classification (2026-05-16):** Offer Templates are company-wide reusable library assets. Not project-specific. Evergreen — no FY segment.

| Document Type | Family | Canonical Target Path | Current Governance Rule Path | Actual Route Path |
|---|---|---|---|---|
| OFFER_TEMPLATE | B (no FY) | `TPEL/SALES/TEMPLATES/{TemplateSlug}/{Seq}-{Label}.{ext}` | `Offer_Templates/{Seq}/{filename}` ❌ wrong | `TPEL/Templates/Offers/{templateSlug}/...` (TPEL-rooted, minor adjustment needed) |

**Note:** The actual route code (`server/sales-marketing-routes.ts`) already uses `TPEL/Templates/Offers/...` — it is TPEL-rooted and closer to correct than the old governance rule. The canonical target replaces `Templates/Offers/` with `SALES/TEMPLATES/` for consistency with the department-based path structure. A minor route path adjustment is needed in the sales route (not in scope for this revision — migration phase).

---

### 3.7 SAP Module

**Confirmed classification (2026-05-16):** SAP attachments are company-level procurement documents. VendorCode-based hierarchy confirmed. `{DocType}` discriminator approved (Decision 2).

| Document Type | Family | Canonical Target Path | Current (Transitional) Path |
|---|---|---|---|
| SAP_ATTACHMENT | B | `TPEL/SAP/{CompanyFY}/VENDOR-DOCS/{VendorCode}/{DocType}/{Seq}/{filename}` | `Vendor_Quotes/{VendorCode}/{Seq}/...` |

**`{DocType}` controlled vocabulary:** `QUOTE`, `GRPO`, `PO`, `GENERAL`

**Notes:**
- SAP is the source of truth — no local DB table stores attachment metadata
- `{VendorCode}` = SAP Business Partner code (confirmed correct from route analysis)
- `{Seq}` = sequential counter within vendor+doctype context

---

### 3.8 QMS Module

**Transitional root `QMS/` remains approved for all existing files.** No new uploads should use `QMS/` root. Family classification confirmed 2026-05-16.

#### Family B — Company-Level QMS Documents

These exist independently of any project. They are master records.

| Document Type | Display Name | Current Transitional Path | Family B Target Path |
|---|---|---|---|
| WPQR | Welder Performance Qualification Record | `QMS/WPQR/{DocNumber}/rev-{rev}/...` | `TPEL/QMS/{CompanyFY}/WPQR/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| PMA | Particular Material Appraisal | `QMS/PMA/{DocNumber}/rev-{rev}/...` | `TPEL/QMS/{CompanyFY}/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| WPS_PQR | Welding Procedure Spec / PQR | `QMS/WPS/{DocNumber}/rev-{rev}/...` | `TPEL/QMS/{CompanyFY}/WPS-PQR/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| CALIBRATION_CERT | Calibration Certificate | `QMS/Instrument/{filename}` | `TPEL/QMS/{CompanyFY}/CALIBRATION/{filename}` |
| WELDER_CERT | Welder Qualification Certificate | `QMS/WelderCertificates/{DocNumber}/rev-{rev}/...` | `TPEL/QMS/{CompanyFY}/WELDER-CERTS/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| WELDER_PHOTO | Welder ID Photo | `QMS/WELDERS/{WelderCode}/{filename}` | `TPEL/QMS/{CompanyFY}/WELDERS/{WelderCode}/{filename}` |
| TEST_PROCEDURE | Test Procedure Document | `QMS/TestProcedures/{DocNumber}/rev-{rev}/...` | `TPEL/QMS/{CompanyFY}/TEST-PROCEDURES/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |

**FY type:** CompanyFY = April-March FY of document creation/last revision.

#### Family A — Project-Specific QMS Documents

These are created against a specific project (have `project_id` FK). Routes have access to the full project hierarchy.

| Document Type | Display Name | Current Transitional Path | Family A Target Path |
|---|---|---|---|
| INSPECTION_DOC | Inspection Record Document | `QMS/Inspections_Records/{ProjectCode}/{IONum}/{TabName}/{filename}` | `TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/INSPECTIONS/{IONum}/{TabName}/{filename}` |
| MATERIAL_CERT | Material Identification Doc | `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}` | `TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/MATERIAL-ID/{Seq}/{filename}` |
| FINAL_DOSSIER | Final Inspection Dossier PDF | `QMS/Inspections_Records/{ProjectCode}/{IONum}/Final_Dossier/{filename}` | `TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/DOSSIER/{IONum}/{filename}` |

---

## 4. Internal / Ephemeral (Not Subject to Governance)

| Document Type | Path | Status |
|---|---|---|
| SLDDRW_JOB_RESULT | `epc-slddrw/{DrawingControlId}/{Timestamp}-{filename}` | Rule active=false. Ephemeral processing artefact. TTL: 30 days. Never expose via signed URL. |

---

## 5. Token Registry Additions (Rev 5)

The following tokens were added to `gcs_governance_token_registry` in Rev 5:

| Token | Description | Example | Source |
|---|---|---|---|
| `CompanyFY` | Company FY (April-March) | `2526` | Derived from April-March cycle |
| `TransmittalNo` | Design transmittal number | `TR-2025-042` | `design_transmittals` table |
| `BackupType` | Design backup type slug | `full-project` | User selection at upload |
| `DrawingType` | Basic drawing type code | `GA` | Design basic drawing record |
| `Destination` | Business trip destination slug | `dubai` | Sanitised from business trip record |
| `ContractType` | Legal contract type | `NDA` | `legal_contracts.contract_type` |
| `TemplateSlug` | Offer template name slug | `heat-exchanger-offer` | Sanitised from `offer_templates` |
| `DocType` | Attachment type discriminator | `QUOTE` | Controlled: QUOTE, GRPO, PO, GENERAL |
| `StandardName` | Design standard name slug | `vessel-nozzle-schedule` | Sanitised from `design_standards` |
| `QmsType` | QMS sub-type for TPEL paths | `WPQR` | Controlled vocabulary |

---

## 6. Migration Status Summary

| Module | Migration Status | Phase |
|---|---|---|
| Finance BRC | Phase 3 approved, not executed | Awaiting Phase 3 |
| Design (Basic/Transmittal/Backup/Standards) | Target paths defined, migration not executed | Awaiting migration phase |
| HR (Trips, Visa) | Target paths defined, migration not executed | Awaiting migration phase |
| Legal | Target paths defined, migration not executed | Awaiting migration phase |
| Sales Templates | Target paths defined, minor route adjustment needed | Awaiting migration phase |
| SAP | Target paths defined, migration not executed | Awaiting migration phase |
| QMS (all 10 types) | Target paths defined, migration not executed | Awaiting dedicated QMS migration phase (high complexity) |

**No files have been moved. No enforcement has been extended. All above is governance baseline only.**

---

## 7. Decisions Recorded

| Decision | Date | Decision |
|---|---|---|
| D1 — Evergreen library FY exception | 2026-05-16 | Approved: Design Standards and Sales Templates use no FY segment (`TPEL/DESIGN/STANDARDS/` and `TPEL/SALES/TEMPLATES/`) |
| D2 — SAP DocType discriminator | 2026-05-16 | Approved: `{DocType}` added to SAP path. Controlled vocabulary: QUOTE, GRPO, PO, GENERAL |
| D3 — Option C work sequence | 2026-05-16 | Approved: (1) Update DB rules and seed, (2) Update baseline docs, (3) Vocabulary draft, then Phase 2B separately |

---

## 8. What Has NOT Changed

- No file migration executed
- No new upload enforcement added beyond Phase 2A (Finance BRC)
- No QMS migration started
- Finance Phase 3 not started
- EPC, DVS, Legacy, Internal rules unchanged
- `gcs-governance-rev4-closure.md` remains as historical record
