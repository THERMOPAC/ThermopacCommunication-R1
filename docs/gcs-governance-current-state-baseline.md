# GCS Governance — Current State Baseline

**Status**: BASELINE SNAPSHOT — authoritative as of 2026-05-17  
**Governance phase completed**: Phase 0 (DB-Driven Routing foundation) + Phase 1 (Retroactive validation + registry remediation)  
**Active canonical rules**: 34  
**Retired rules**: 4  
**Zero-Trust FAIL findings**: 0  
**Next phase**: Phase 2 (upload token gate migration) — awaiting direction

---

## 1. Final Active Canonical Rule List (34 Rules)

All 34 rules carry `status='active'`, `version_number=1`, Zero-Trust `overall='PASS'`, `source='baseline_seed'`, `validationMode='retroactive'`.

| # | rule_id | module | document_type | display_name | root_prefix | revision_mode | path_template |
|---|---|---|---|---|---|---|---|
| 1 | 21 | design | BASIC_DRAWING | Basic/Preliminary Drawing | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BASIC/{Discipline}/{DrawingType}_R{rev}.{ext}` |
| 2 | 23 | design | DESIGN_BACKUP | Design Project Backup | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/BACKUP/{BackupType}_R{rev}/{filename}` |
| 3 | 33 | design | DESIGN_STANDARD | Design Standard / Company Template | TPEL/DESIGN/STANDARDS | none | `TPEL/DESIGN/STANDARDS/{Category}/{StandardName}/{filename}` |
| 4 | 22 | design | TRANSMITTAL | Design Transmittal | TPEL | none | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DESIGN/TRANSMITTAL/{TransmittalNo}/{filename}` |
| 5 | 9 | dvs | DVS_STAGING | DVS Drawing Staging | TPEL/STAGING | numeric | `TPEL/STAGING/DRAWINGS/{ProjectCode}/{DrawingNo}/rev-{rev}/original/{filename}` |
| 6 | 4 | epc | CO_DOCUMENT | Customer Order Document | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/CO/{CO}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 7 | 7 | epc | DATASHEET | PPPC Procurement Datasheet | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/{ListNo}/{Tag}/{Seq}_ds-rev-{rev}.{ext}` |
| 8 | 3 | epc | DDS | Design Data Sheet PDF | TPEL | alphabetic | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DDS/{DrawingNo}_dds-rev-{rev}.pdf` |
| 9 | 6 | epc | DISPATCH | Dispatch Document | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DISPATCH/{DocNumber}/rev-{rev}/{filename}` |
| 10 | 35 | epc | ECN | Engineering Change Notice | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECN/{DocNumber}/rev-{rev}/{filename}` |
| 11 | 5 | epc | ECR | Engineering Change Request | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECR/{DocNumber}/rev-{rev}/{filename}` |
| 12 | 1 | epc | EPC_DOCUMENT | EPC Project Document | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 13 | 34 | epc | EPC_DRAWING | EPC Engineering Drawing | TPEL | alphabetic | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{DrawingNo}_rev-{rev}.{ext}` |
| 14 | 32 | epc | EPC_QUOTATION | Project-Linked Quotation (EPC) | TPEL | none | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QTN/{OfferNo}/rev-na/{Seq}-{Label}.pdf` |
| 15 | 8 | epc | QUOTATION | Standalone Offer PDF (pre-project) | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/Quotations/{OfferNo}/rev-{rev}/{Seq}-{Label}.pdf` |
| 16 | 27 | finance | BRC_DOCUMENT | Bank Realisation Certificate | Accounts | none | `Accounts/{FY}/{filename}` |
| 17 | 24 | hr | TRIP_DOCUMENT | Business Trip Document | TPEL/ADMIN/HR | none | `TPEL/ADMIN/HR/{CompanyFY}/TRIPS/{EmployeeName}/{Destination}/{DocType}/{filename}` |
| 18 | 25 | hr | VISA_DOCUMENT | Visa / Travel Document | TPEL/ADMIN/HR | none | `TPEL/ADMIN/HR/{CompanyFY}/VISA/{EmployeeName}/{Category}/{filename}` |
| 19 | 31 | internal | SLDDRW_JOB_RESULT | SolidWorks Extraction Job Result | epc-slddrw | none | `epc-slddrw/{DrawingControlId}/{Timestamp}-{filename}` |
| 20 | 30 | legacy | LEGACY_FILE | Legacy File Storage | THERMOPAC_PROJECTS | none | `THERMOPAC_PROJECTS/{FY}/{ProjectCode}/{Discipline}/{Seq}/{filename}` |
| 21 | 26 | legal | LEGAL_DOCUMENT | Legal Document / Contract | TPEL/LEGAL | none | `TPEL/LEGAL/{CompanyFY}/{ContractType}/{EntityName}/{filename}` |
| 22 | 12 | qms | CALIBRATION_CERT | Calibration Certificate | QMS | numeric | `QMS/Calibration/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 23 | 14 | qms | FINAL_DOSSIER | Final Inspection Dossier PDF | QMS | none | `QMS/Inspections_Records/{ProjectCode}/{IONum}/Final_Dossier/{filename}` |
| 24 | 13 | qms | INSPECTION_DOC | Inspection Record Document | QMS | none | `QMS/Inspections_Records/{ProjectCode}/{IONum}/{TabName}/{filename}` |
| 25 | 37 | qms | MATERIAL_ID_DOC | Material Identification Document | QMS | none | `QMS/Material_Identification/{ProjectCode}/{Seq}/{filename}` |
| 26 | 38 | qms | NCR | Non-Conformance Report | TPEL | numeric | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QMS/NCR/{NcrNumber}/rev-{rev}/{filename}` |
| 27 | 11 | qms | PMA | Particular Material Appraisal | QMS | numeric | `QMS/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 28 | 18 | qms | TEST_PROCEDURE | Test Procedure Document | QMS | numeric | `QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 29 | 15 | qms | WELDER_CERT | Welder Qualification Certificate | QMS | numeric | `QMS/WelderManagement/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 30 | 16 | qms | WELDER_PHOTO | Welder ID Photo | QMS | none | `QMS/WELDERS/{WelderCode}/{filename}` |
| 31 | 10 | qms | WPQR | Welder Performance Qualification Record | QMS | numeric | `QMS/WPQR/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 32 | 19 | qms | WPS_PQR | Welding Procedure Spec / PQR | QMS | numeric | `QMS/WPS/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` |
| 33 | 28 | sales | OFFER_TEMPLATE | Offer / Quotation Template | TPEL/SALES/TEMPLATES | none | `TPEL/SALES/TEMPLATES/{TemplateSlug}/{TemplateSlug}_{Seq}.{ext}` e.g. `TPEL/SALES/TEMPLATES/uor-standard-offer/uor-standard-offer_001.pdf` |
| 34 | 29 | sap | SAP_ATTACHMENT | SAP Purchase Attachment | TPEL/SAP | none | `TPEL/SAP/{CompanyFY}/VENDOR-DOCS/{VendorCode}/{DocType}/{Seq}/{filename}` |

**Version state**: all v1, all `activated_at = 2026-05-16`. No v2 versions exist.

---

## 2. Retired / Deprecated / Reference-Only Rules

These four rules were incorrectly activated during the initial DB seed (seeder did not respect `active: false` in SEED_RULES). Corrected 2026-05-17 by setting `status='superseded'`. Zero upload tokens were ever issued against any of these rules.

| rule_id | module | document_type | version_id | superseded_at | reason | canonical successor |
|---|---|---|---|---|---|---|
| 2 | epc | DRAWING | 8 | 2026-05-17 01:10:08 | DEPRECATED 2026-05 — renamed to EPC_DRAWING | epc/EPC_DRAWING (rule_id=34) |
| 17 | qms | MATERIAL_CERT | 3 | 2026-05-17 01:10:08 | DEPRECATED 2026-05 — renamed to MATERIAL_ID_DOC; CERT suffix was misleading | qms/MATERIAL_ID_DOC (rule_id=37) |
| 20 | design | DESIGN_DRAWING | 33 | 2026-05-17 01:10:08 | RETIRED 2026-05 — merged into EPC_DRAWING; both routes use same buildDrawingGcsPath() builder | epc/EPC_DRAWING (rule_id=34) |
| 36 | epc | RFQ_ATTACHMENT | 31 | 2026-05-17 01:10:08 | REFERENCE-ONLY — never creates GCS objects; rfq-email-service.ts copies DATASHEET-governed paths verbatim | epc/DATASHEET (rule_id=7) |

---

## 3. Routing Architecture Summary

The governance system defines three routing categories based on the degree to which uploads are governed by the DB-driven token layer.

### 3a — DB-Driven

The upload route calls `issueUploadToken()` in `server/services/gcs-governance-service.ts`. The resolved GCS path is derived at runtime from the active version's `path_template` in the database. The token is validated on upload completion via `validateUploadToken()`. This is the target architecture for all flows.

**Confirmed DB-driven flows as of baseline:**

| route file | module | document_type | mechanism |
|---|---|---|---|
| `server/finance-routes-fixed.ts` | finance | BRC_DOCUMENT | Looks up `rule_id` by `module_key='finance'` + `document_type='BRC_DOCUMENT'` from DB at runtime; calls `issueUploadToken()` directly |
| `server/utils/qms-file-governance.ts` | qms | (all QMS types) | `createRevision()` calls `issueUploadToken()` **when `ruleId` param is supplied by the caller** |

**Note on QMS**: `createRevision()` has a dual code path: if `ruleId` is provided it goes through `issueUploadToken()`; if `ruleId` is absent it falls back to a legacy path builder. Zero upload tokens have been issued in production to date, indicating that QMS callers are currently using the legacy fallback. QMS routes are **partially wired** — the governance integration exists in the utility layer but callers have not yet been updated to supply `ruleId`.

**Production upload tokens issued**: 0 (confirmed by full table scan of `gcs_upload_tokens`). The governance token layer has been validated by dry-run and admin test tooling but has not yet processed a production upload.

### 3b — Parity-Gated

The upload route uses a hardcoded path-builder function from `server/epc-coding.ts`. The builder produces TPEL-compliant paths that match the corresponding governance template byte-for-byte. There is no runtime DB consultation and no upload token. The path is considered "parity-gated" because governance parity was verified at baseline time (the builder output matches the canonical template), but the token gate has not been inserted.

| route file(s) | module | document_type | builder function |
|---|---|---|---|
| `server/design-drawing-routes.ts`, `server/project-item-detail-routes.ts` | epc | EPC_DRAWING | `buildDrawingGcsPath()` |
| `server/dds-pdf-service.ts` | epc | DDS | `buildDdsGcsPath()` |
| `server/epc-document-routes.ts`, pipeline routes | epc | EPC_DOCUMENT | `buildEpcGcsPath()` |
| `server/epc-coding.ts` / offer-conversion | epc | QUOTATION | `buildQuotationGcsPath()` |
| `server/epc-coding.ts` / offer-conversion | epc | EPC_QUOTATION | `buildEpcQtnGcsPath()` |

Parity-gated routes will be migrated to `issueUploadToken()` in Phase 2. Until migration, path correctness relies on the builder functions remaining in sync with the governance templates. Any template change to an active version must be reflected in the builder (or the builder retired in favour of token-derived paths).

### 3c — Unmanaged

The upload route constructs the GCS path by string interpolation or a local helper without reference to the governance rule registry. No `issueUploadToken()` call. No parity verification at runtime. Correctness depends on the path being accurate at time of coding and remaining unchanged.

| module | document_type | route file | notes |
|---|---|---|---|
| epc | DATASHEET | `server/pppc-routes.ts` | Path hardcoded from PPPC buy-list logic |
| epc | CO_DOCUMENT | `server/customer-order-document-routes.ts` | Direct string construction |
| epc | ECR | `server/engineering-change-routes.ts` | Direct string construction |
| epc | ECN | `server/drawing-ecr-ecn-routes.ts` | Direct string construction |
| epc | DISPATCH | `server/dispatch-routes.ts` | Direct string construction |
| internal | SLDDRW_JOB_RESULT | `server/epc-slddrw-job-routes.ts` | Agent-driven; path uses DrawingControlId + Timestamp injected at job completion |
| hr | TRIP_DOCUMENT | `server/trip-management-routes.ts` | Direct string construction |
| hr | VISA_DOCUMENT | `server/visa-management-routes.ts` | Direct string construction |
| legal | LEGAL_DOCUMENT | `server/legal-management-routes.ts` | Direct string construction |
| sales | OFFER_TEMPLATE | `server/sales-marketing-routes.ts` | Direct string construction; minor path alignment with canonical template pending |
| sap | SAP_ATTACHMENT | `server/sap-purchase-routes.ts` | Direct string construction |
| legacy | LEGACY_FILE | various (read-only) | Legacy read-only bucket; no new writes expected |
| design | BASIC_DRAWING | `server/design-basic-drawings-routes.ts` | Direct string construction; existing files in legacy path |
| design | DESIGN_BACKUP | `server/design-backup-routes.ts` | Direct string construction |
| design | DESIGN_STANDARD | `server/design-standards-routes.ts` | Direct string construction |
| design | TRANSMITTAL | `server/design-transmittal-routes.ts` | Direct string construction |
| dvs | DVS_STAGING | `server/drawing-verification-routes.ts` | Direct path construction; staging bucket |
| qms | all QMS types | `server/utils/qms-file-governance.ts` | Legacy path builder fallback (ruleId not yet supplied by callers) |

---

## 4. DB-Driven Governance Foundation Summary

### What Was Built (Phase 0)

The DB-driven routing foundation consists of six components implemented in Phase 0 (v1.1 baseline, approved 2026-05-16):

| component | file | description |
|---|---|---|
| Governance rule registry | `gcs_governance_rules` table | One row per document type; defines module/type identity and metadata |
| Version registry | `gcs_governance_rule_versions` table | One row per version per rule; carries `path_template`, `revision_mode`, `status`, `validation_evidence`, `activated_at`, `superseded_at`, `diff_from_prev` |
| Token registry | `gcs_governance_token_registry` table | 40 registered tokens with descriptions and example values; used by Zero-Trust Check 1 and Check 3 |
| Upload token gate | `gcs_upload_tokens` table | Pre-authorised single-use tokens issued by `issueUploadToken()`, validated on upload completion by `validateUploadToken()` |
| Governance service | `server/services/gcs-governance-service.ts` | `issueUploadToken()` / `validateUploadToken()` / `logUploadEvent()` |
| Zero-Trust validator | `server/services/gcs-governance-zero-trust.ts` | 7-check validation suite run at version-submit time |

### What the Foundation Enables

- **Immutable path governance**: once a version is active, its `path_template` is the authority for all upload paths issued under that rule
- **Version lifecycle**: draft → pending_approval → active → superseded (no reverse; no deletion)
- **Activation safety**: dry-run simulation + activation freeze check before any version swap
- **Audit trail**: `gcs_governance_audit_log` records every lifecycle event (first production lifecycle event pending)
- **Token immutability**: issued `gcs_upload_tokens` rows are never updated after `used_at` is set

---

## 5. Retroactive Validation Summary

### Purpose

Because Phase 0 seeded 38 active v1 versions via raw SQL (bypassing the version-submit workflow), no Zero-Trust validation had been run against those versions. A retroactive baseline validation was designed and executed to establish the initial `validation_evidence` record for each active version.

### Execution History

| run | date | mode | versions found | processed | PASS | FAIL |
|---|---|---|---|---|---|---|
| Run 1 (initial) | 2026-05-17T00:48:00Z | default | 38 | 38 | 29 | 9 |
| Run 2 (idempotency proof) | 2026-05-17T00:48:46Z | default | 38 | 0 (all skipped) | — | — |
| Run 3 (post Phase 1a) | 2026-05-17T00:58:49Z | --force | 38 | 38 | 31 | 7 |
| Run 4 (post Phase 1b) | 2026-05-17T01:10:30Z | --force | 34 | 34 | **34** | **0** |

### Resolution Path

| original finding | root cause | resolution | phase |
|---|---|---|---|
| F-01: `{ItemCode}` unregistered (4 rules) | Token not in registry at seed time | Added `{ItemCode}` to `gcs_governance_token_registry` (id=1992) | Phase 1a |
| F-02: `{DrawingControlId}`, `{Timestamp}` unregistered (1 rule) | Internal agent tokens never registered | Added both tokens to registry (id=1993, 1994) | Phase 1a |
| F-03: DATASHEET / RFQ_ATTACHMENT path conflict | RFQ_ATTACHMENT incorrectly activated (should be reference-only, never active) | Retired RFQ_ATTACHMENT (version_id=31 → superseded) | Phase 1b |
| F-04: MATERIAL_CERT / MATERIAL_ID_DOC conflict | MATERIAL_CERT incorrectly activated (deprecated rename, should have been inactive) | Retired MATERIAL_CERT (version_id=3 → superseded) | Phase 1b |
| F-05: RFQ_ATTACHMENT revision_mode inconsistency | revisionMode='none' with `{rev}` in template | Resolved by retirement — rule no longer evaluated | Phase 1b |
| F-06: DRAWING / DESIGN_DRAWING / EPC_DRAWING 3-way conflict | Two deprecated rules incorrectly activated; consolidation decision already made in seed data but not executed in DB | Retired DRAWING (version_id=8) and DESIGN_DRAWING (version_id=33); EPC_DRAWING confirmed canonical | Phase 1b |

### Final Evidence State

All 34 active v1 versions carry:
- `validation_evidence IS NOT NULL`
- `validation_evidence->>'overall' = 'PASS'`
- `validation_evidence->>'source' = 'baseline_seed'`
- `validation_evidence->>'validationMode' = 'retroactive'`
- `ran_at = 2026-05-17T01:10:30–35Z`

Evidence JSON: `docs/retroactive-baseline-validation-evidence.json`

---

## 6. Zero-Trust Validation Model

### The 7 Checks

Zero-Trust validation runs at `version submit` time (before `pending_approval`) and on demand for admin dry-runs. It is implemented in `server/services/gcs-governance-zero-trust.ts`.

| # | check name | what it verifies | fail consequence |
|---|---|---|---|
| 1 | `token_completeness` | Every `{token}` in `path_template` exists in `gcs_governance_token_registry` with `active=true` | Blocks submission — unregistered tokens cannot be resolved |
| 2 | `root_prefix` | Template begins with one of the approved GCS root prefixes (`TPEL/`, `QMS/`, `Accounts/`, `epc-slddrw/`, `THERMOPAC_PROJECTS/`, `TPEL/STAGING`) | Blocks submission — wrong root means files land outside governed namespace |
| 3 | `synthetic_paths` | Three synthetic example paths generated using registry `exampleValue`s resolve without any unresolved `{token}` placeholders | Blocks submission — path is not resolvable at runtime |
| 4 | `path_uniqueness` | Synthetic example paths do not collide with any other active rule's synthetic paths | Blocks submission — two rules competing for the same GCS namespace |
| 5 | `extension_safety` | File extension segment is either a registered `{ext}` token or a safe literal extension (`.pdf`, `.xlsx`, etc.) | Blocks submission — dangerous extension patterns |
| 6 | `revision_mode_consistency` | If `{rev}` appears in the template, `revisionMode ∈ {minor, major, numeric, alphabetic}` (not `none`). If `{rev}` absent, `revisionMode` must be `none` | Blocks submission — revision metadata contradicts template |
| 7 | `high_impact_diff` | Synthetic paths for the new version do not change the GCS root prefix compared to the previous active version's paths | Blocks submission — root-level rerouting of existing documents requires explicit migration approval |

All 7 checks must PASS for a version to advance to `pending_approval`. A `FAIL` on any check produces per-check detail stored in `validation_evidence` and stops the lifecycle.

### Retroactive Baseline Exception

The initial 34 active v1 versions were seeded directly via raw SQL and were never submitted through the workflow. Their `validation_evidence` is marked `source='baseline_seed'` and `validationMode='retroactive'` to distinguish it from forward validation (which runs at submit time on candidate versions). Check 7 (`high_impact_diff`) auto-passes for v1 versions (no predecessor to diff against).

---

## 7. Version Lifecycle Model

```
[DRAFT]
  │
  ▼  (submit — triggers Zero-Trust 7-check validation)
[PENDING_APPROVAL]   ← validation_evidence written here
  │
  ▼  (approve)
[APPROVED]
  │
  ▼  (dry-run activation — simulates path resolution, does NOT swap active version)
[APPROVED + dry_run evidence]
  │
  ▼  (activate — two-step confirmation, freeze check, atomic swap)
[ACTIVE]             ← previous version transitions to SUPERSEDED simultaneously
  │
  ▼  (superseded by newer version, or retired directly)
[SUPERSEDED]         ← terminal state; superseded_at timestamp written
```

### Invariants

- Exactly **one** version per rule may have `status='active'` at any time
- `status` transitions are **forward-only**: no rollback to `active` once superseded
- `path_template`, `revision_mode`, `version_number` are **immutable** once written
- A version may be set to `superseded` without a successor (retirement, as done in Phase 1b)
- `activated_at` is written once and never updated
- `validation_evidence` is written at submit-time (forward validation) or by the retroactive script (baseline validation); it records the check results permanently

### Activation Safety Gates

1. **Dry-run required**: activation is blocked unless a dry-run simulation has been recorded in the version's `validationEvidence.dry_run` field
2. **Activation freeze check** (`checkActivationFreeze()`): blocks activation if the GCS bucket is in a freeze window (e.g., during audit periods, production incidents)
3. **Two-step UI confirmation**: the `RuleVersionPanel` UI requires explicit ACTIVATE confirmation after displaying the dry-run report
4. **Atomic swap**: the DB update that sets the new version to `active` and the old version to `superseded` runs in a single transaction

---

## 8. Token Immutability Model

### Upload Token Lifecycle

```
issueUploadToken(ruleId, tokenValues, actorId)
  → resolves active version's path_template
  → substitutes tokenValues into template
  → writes gcs_upload_tokens row:
      { rawToken, resolvedPath, tokenValues, versionId, issuedAt, expiresAt }
  → returns { rawToken, resolvedPath, expiresAt }

[caller uploads file to resolvedPath in GCS]

validateUploadToken(rawToken, uploadedPath)
  → reads gcs_upload_tokens by rawToken
  → confirms uploadedPath matches resolvedPath
  → writes usedAt, usedForPath (the ONLY two columns ever updated)
  → token is now consumed — single use
```

### Immutability Guarantees

The following columns on `gcs_upload_tokens` are **never updated after row creation**:

| column | write | update |
|---|---|---|
| `raw_token` | once at issue | never |
| `resolved_path` | once at issue | never |
| `token_values` | once at issue | never |
| `version_id` | once at issue | never |
| `issued_at` | once at issue | never |
| `expires_at` | once at issue | never |
| `used_at` | set at validation | never again |
| `used_for_path` | set at validation | never again |

**Consequence**: a GCS upload token is an immutable record of what path was authorised, to whom, under which governance version, and when. This provides a complete audit chain even if the rule version is later superseded.

---

## 9. Activation Freeze Model

### Purpose

Prevents version activations during periods when the GCS routing table should not change — production incidents, audit windows, post-deployment stability periods.

### Implementation

`checkActivationFreeze()` in `server/services/gcs-governance-zero-trust.ts` is called by the activation route before the atomic version swap. A freeze is recorded in the DB (or via a config flag). If a freeze is active, the activation endpoint returns HTTP 423 (Locked) with a freeze reason message.

### Bypass

Only users with `Superuser` role may override a freeze via an explicit bypass flag in the activation request payload. The bypass is recorded in the audit log with the actor and timestamp.

---

## 10. Dry-Run Activation Model

### Purpose

Allows the operator to preview the full effect of activating a new version — which paths will be produced, what diff exists from the current active version — without committing the swap.

### Process

1. Operator triggers dry-run via `POST /api/gcs-governance/rules/:ruleId/dry-run-activate`
2. `runDryRunSimulation()` executes Checks 1–7 on the candidate version, generates synthetic example paths, and computes the diff from the current active version's paths
3. Results are written into `validationEvidence.dry_run` on the candidate version row
4. Dry-run result is displayed in the `RuleVersionPanel` UI
5. Activation is only unblocked if `dry_run.overall = 'PASS'`

### Constraints

- Dry-run does NOT swap the active version
- Dry-run does NOT issue any upload tokens
- Dry-run does NOT write to `gcs_upload_tokens` or `gcs_governance_audit_log`
- A second dry-run on the same version overwrites the previous dry-run result (idempotent)

---

## 11. Current Routing Categories — Full Assignment

### DB-Driven (2 flows confirmed wired, 0 tokens yet issued in production)

| module | document_type | rule_id | route file | wiring status |
|---|---|---|---|---|
| finance | BRC_DOCUMENT | 27 | `finance-routes-fixed.ts` | **Fully wired** — DB lookup + `issueUploadToken()` + `validateUploadToken()` + `logUploadEvent()` |
| qms | all QMS types | various | `qms-file-governance.ts` `createRevision()` | **Partially wired** — `issueUploadToken()` present but conditional on caller supplying `ruleId`; callers not yet updated |

### Parity-Gated (builder produces correct path, no token gate)

| module | document_type | rule_id | builder | parity status |
|---|---|---|---|---|
| epc | EPC_DRAWING | 34 | `buildDrawingGcsPath()` | Parity confirmed — builder template matches governance template |
| epc | DDS | 3 | `buildDdsGcsPath()` | Parity confirmed |
| epc | EPC_DOCUMENT | 1 | `buildEpcGcsPath()` | Parity confirmed |
| epc | QUOTATION | 8 | `buildQuotationGcsPath()` | Parity confirmed |
| epc | EPC_QUOTATION | 32 | `buildEpcQtnGcsPath()` | Parity confirmed |

### Unmanaged (no token gate, no verified parity)

| module | document_type | rule_id | notes |
|---|---|---|---|
| epc | DATASHEET | 7 | pppc-routes.ts hardcoded path |
| epc | CO_DOCUMENT | 4 | customer-order-document-routes.ts |
| epc | ECR | 5 | engineering-change-routes.ts |
| epc | ECN | 35 | drawing-ecr-ecn-routes.ts |
| epc | DISPATCH | 6 | dispatch-routes.ts |
| internal | SLDDRW_JOB_RESULT | 31 | agent job-result handler; path from DrawingControlId + Timestamp |
| hr | TRIP_DOCUMENT | 24 | trip-management-routes.ts |
| hr | VISA_DOCUMENT | 25 | visa-management-routes.ts |
| legal | LEGAL_DOCUMENT | 26 | legal-management-routes.ts |
| sales | OFFER_TEMPLATE | 28 | sales-marketing-routes.ts |
| sap | SAP_ATTACHMENT | 29 | sap-purchase-routes.ts |
| legacy | LEGACY_FILE | 30 | read-only; no new writes expected |
| design | BASIC_DRAWING | 21 | design-basic-drawings-routes.ts |
| design | DESIGN_BACKUP | 23 | design-backup-routes.ts |
| design | DESIGN_STANDARD | 33 | design-standards-routes.ts |
| design | TRANSMITTAL | 22 | design-transmittal-routes.ts |
| dvs | DVS_STAGING | 9 | drawing-verification-routes.ts |
| qms | all QMS types | various | createRevision() falling back to legacy path builder (ruleId not supplied by callers) |

---

## 12. Remaining Unmanaged Flows

27 of 34 canonical rules currently have unmanaged or partially-managed upload routes. These fall into three migration-readiness tiers:

### Tier 1 — Ready for Token Gate (parity already confirmed)

These 5 flows use hardcoded builders whose output matches the governance template. Migration is a refactor: replace `buildXxx(…)` call + `uploadFileWithDiagnostics()` call with `issueUploadToken()` + upload + `validateUploadToken()`.

`epc/EPC_DRAWING`, `epc/DDS`, `epc/EPC_DOCUMENT`, `epc/QUOTATION`, `epc/EPC_QUOTATION`

### Tier 2 — Wiring Exists, Callers Need ruleId Update

The QMS file governance utility (`createRevision()`) already calls `issueUploadToken()` when `ruleId` is provided. Migration is updating each QMS route caller to look up and supply `ruleId`.

Affected QMS routes: CALIBRATION_CERT, WPQR, PMA, WPS_PQR, TEST_PROCEDURE, WELDER_CERT, WELDER_PHOTO, INSPECTION_DOC, FINAL_DOSSIER, MATERIAL_ID_DOC, NCR (11 document types)

### Tier 3 — Requires Full Wiring

These flows have no governance integration at any layer. Full migration requires: add DB rule lookup, add `issueUploadToken()` call, add upload + `validateUploadToken()`, add `logUploadEvent()`.

`epc/DATASHEET`, `epc/CO_DOCUMENT`, `epc/ECR`, `epc/ECN`, `epc/DISPATCH`, `internal/SLDDRW_JOB_RESULT`, `hr/TRIP_DOCUMENT`, `hr/VISA_DOCUMENT`, `legal/LEGAL_DOCUMENT`, `sales/OFFER_TEMPLATE`, `sap/SAP_ATTACHMENT`, `dvs/DVS_STAGING`, `design/BASIC_DRAWING`, `design/DESIGN_BACKUP`, `design/DESIGN_STANDARD`, `design/TRANSMITTAL`

### Special: Legacy

`legacy/LEGACY_FILE` (THERMOPAC_PROJECTS/ root) — read-only; no new writes expected. No migration planned.

---

## 13. Migration Readiness Assessment

| metric | value |
|---|---|
| Total canonical rules | 34 |
| DB-driven (fully wired, production-ready) | 1 (finance/BRC_DOCUMENT) |
| DB-driven (wired, callers not yet updated) | 11 (QMS — Tier 2) |
| Parity-gated (builder confirmed, token gate not inserted) | 5 (EPC builders — Tier 1) |
| Unmanaged (full wiring required) | 16 (Tier 3) |
| Read-only / no migration needed | 1 (legacy/LEGACY_FILE) |
| **Upload tokens issued in production** | **0** |
| **Audit log rows** | **0** |
| **Production governance coverage** | **~3%** (1 of 34 rules fully live) |

The governance foundation is fully built and validated. No production upload flows have been migrated through the token gate yet except BRC_DOCUMENT (which is wired but has issued 0 tokens in the current observation window — the BRC upload flow exists in production but may not have been triggered since Phase 0 deployment).

---

## 14. Known Deferred Items

These items are documented, approved in principle (where noted), but not yet executed. They are out of scope for Phase 1.

| # | item | module | status | notes |
|---|---|---|---|---|
| D-01 | BRC_DOCUMENT root prefix migration: `Accounts/{FY}/` → `TPEL/FINANCE/BRC/{CompanyFY}/` | finance | Phase 3 approved, not executed | Flagged as wrong root in governance service; existing BRC files remain at `Accounts/`; migration requires GCS object move + route update |
| D-02 | QMS Family B root migration: `QMS/` → `TPEL/QMS/{CompanyFY}/` | qms | Planned, not approved for execution | Affects: WPQR, PMA, CALIBRATION_CERT, WPS_PQR, TEST_PROCEDURE, WELDER_CERT, WELDER_PHOTO |
| D-03 | QMS Family A root migration: `QMS/Inspections_Records/`, `QMS/Material_Identification/` → `TPEL/{CC}/{CO}/{Cust}/{ProjectFY}/{NNN}/QMS/…` | qms | Planned, not approved for execution | Affects: INSPECTION_DOC, FINAL_DOSSIER, MATERIAL_ID_DOC |
| D-04 | Design module path migrations: BASIC_DRAWING, TRANSMITTAL, DESIGN_BACKUP, DESIGN_STANDARD existing files from `Design_Management/…` | design | Target paths set 2026-05 (Option C), migration not yet executed | Existing GCS objects remain at pre-governance paths; new uploads use governance templates |
| D-05 | OFFER_TEMPLATE path alignment: `TPEL/Templates/Offers/` → `TPEL/SALES/TEMPLATES/` | sales | Minor adjustment noted, not executed | Actual route uses `TPEL/Templates/Offers/`; governance template is `TPEL/SALES/TEMPLATES/`; 1-segment correction needed |
| D-06 | SAP_ATTACHMENT path migration: `Vendor_Quotes/{VendorCode}/{Seq}/` → `TPEL/SAP/{CompanyFY}/VENDOR-DOCS/{VendorCode}/{DocType}/{Seq}/` | sap | Pending | Existing files remain at old path |
| D-07 | Governance seeder guard: add `if (rule.active === false) continue` to SEED_RULES activation loop | internal | Code change, low risk | Prevents incorrect reactivation of retired rules in fresh environments |
| D-08 | QMS caller `ruleId` update: update all `createRevision()` call sites to supply `ruleId` | qms | Phase 2 Tier 2 migration | 11 QMS document types; unlocks full DB-driven routing for QMS module |
| D-09 | EPC builder token gate insertion: wrap `buildXxx()` calls with `issueUploadToken()` | epc | Phase 2 Tier 1 migration | 5 EPC document types; lowest risk — parity already confirmed |
| D-10 | Tier 3 full wiring: 16 unmanaged routes | various | Phase 2 Tier 3 migration | Requires scoping per route |

---

## 15. Production-Readiness Assessment

### Governance Foundation

| component | state | assessment |
|---|---|---|
| Rule registry (34 canonical rules) | Complete, all PASS | Production-ready |
| Token registry (40 tokens) | Complete | Production-ready |
| Version lifecycle engine | Complete, tested via dry-run | Production-ready |
| Zero-Trust 7-check validator | Complete | Production-ready |
| Activation freeze + dry-run gates | Complete | Production-ready |
| Upload token issue + validate | Complete | Production-ready |
| Audit log | Structurally complete; 0 rows (no production lifecycle events yet) | Foundation ready; will populate on first live activation |
| UI governance panel (`RuleVersionPanel`) | Complete; two-step activation implemented | Production-ready |

### Upload Flow Coverage

| category | rules | production state |
|---|---|---|
| DB-driven (fully live) | 1 | ✓ Governance enforced for BRC_DOCUMENT uploads |
| DB-driven (wired, callers pending) | 11 QMS | — Wiring exists; 0 tokens issued; callers need ruleId |
| Parity-gated | 5 EPC | — Path correctness maintained by builders; no token gate |
| Unmanaged | 16 + QMS fallback | — No governance enforcement at upload time |
| Legacy read-only | 1 | — No governance migration needed |

### Overall Assessment

**The governance foundation is production-grade and fully validated.** The rule registry, version lifecycle, Zero-Trust checks, token gate, and activation safety mechanisms are all implemented and tested. The baseline is clean: 34 active rules, 0 FAIL findings, complete validation evidence.

**Upload flow migration is at 3% coverage** (1 of 34 rules fully live in production). The remaining 33 rules have governance definitions but their upload routes have not yet been migrated to consume the token gate. This does not create a regression — all existing upload paths continue to work exactly as before Phase 0. The governance layer is additive.

**Priority migration sequence** (for Phase 2 planning):
1. QMS Tier 2 (11 rules) — wiring exists, low-risk caller update
2. EPC Tier 1 (5 rules) — parity confirmed, straightforward refactor
3. EPC Tier 3 (5 rules) — CO, ECR, ECN, DISPATCH, DATASHEET — moderate effort
4. HR / Legal / Sales / SAP (6 rules) — low volume, lower risk
5. Design / DVS / Internal (5 rules) — specialised flows, highest complexity

**The system is ready to begin Phase 2 migration at any time.** Each route can be migrated independently with no impact on other routes.

---

*Document prepared: 2026-05-17*  
*Source of truth: live DB state at time of preparation + codebase audit conducted 2026-05-17*  
*Next review: at start of Phase 2 migration*
