# GCS Governance Rev 4 — Final Closure Note

**Status**: ACCEPTED — Zero-Trust Compliant  
**Baseline version**: Rev 4 (GCS Governance Remediation Rev 4 + G8/R12 Label Enforcement + Zero-Trust Hardening)  
**Closure date**: 2026-04-13  
**Accepted by**: THERMOPAC QMS Governance Review

---

## 1. Approved Baseline Version Implemented

**Rev 4 — GCS Governance Remediation + G8/R12 + Zero-Trust Hardening** is the finalized, accepted baseline. It is the implemented GCS governance baseline for all EPC document families covered in this module (DWG, QTN, INS, ECR, ECN, DSP, CO, TEMPLATE). It does not alter or supersede governance decisions for system-level document roots (QMS/, HR/, ACCOUNTS/, etc.) which are governed separately under their own frameworks.

This baseline is **mandatory** for all future document flows within its scope. Any new upload handler, document family, or storage route added to the system must conform to every rule in Section 4 before being merged.

The system has been audited and confirmed:
- **287/287** rows in `epc_document_attachments` at TPEL paths. Zero legacy paths.
- **0** rows in `change_documents` with non-TPEL `gcs_object_path`.
- **0** rows in `customer_order_documents` with non-TPEL `gcs_object_path`.
- **Zero** fallback write logic exists in any upload handler.

---

## 2. Completed Tasks

### Rev 3 Foundation (T001–T009)

| Task | Description | Status |
|---|---|---|
| T001 | Enforce `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/` root for all EPC project document uploads | DONE |
| T002 | One shared `buildDrawingGcsPath()` builder (G4) used by ECR/ECN, Design Registry, EPC document routes — no duplicate builders | DONE |
| T003 | No new writes to legacy paths (G5) — dispatch legacy branch retired, inspection revision flag removed | DONE |
| T004 | New table `customer_order_documents` (CO family) with TPEL path storage and signed URL download | DONE |
| T005 | INS: multi-revision support; attachment stored in `epc_document_attachments` with TPEL path | DONE |
| T006 | GCS retention policy — `gcs_object_deletions` admin table for controlled removal | DONE |
| T007 | Offer templates dual-written to `TPEL/Templates/Offers/…` in GCS with local FS fallback for zero-GCS environments | DONE |
| T008 | ECR/ECN uploads: TPEL path via `buildEpcGcsPath()`, signed URLs for downloads, GCS object deleted on record deletion | DONE |
| T009 | QTN path uses `project_seq` (not `projectCode`); `buildEpcQtnGcsPath()` asserts path | DONE |

### G8 / R12 — Controlled Label Vocabulary (all routes)

| Task | Description | Status |
|---|---|---|
| G8-VOC | Create `shared/gcs-label-vocabulary.ts` — single source of truth for all family vocabularies | DONE |
| G8-ECR | HTTP 422 on ECR upload if `documentType` not in ECR vocabulary | DONE |
| G8-ECN | HTTP 422 on ECN upload if `documentType` not in ECN vocabulary | DONE |
| G8-DSP | HTTP 422 on DSP upload if `document_type` not in DSP vocabulary | DONE |
| G8-CO | HTTP 422 on CO upload if `documentLabel` not in CO vocabulary | DONE |
| G8-EPC | HTTP 422 on EPC General upload if `attachment_label` not in family vocabulary (DWG/BOM exempted — revision-controlled) | DONE |
| G8-INS | Reject INS upload if `label` not in INS vocabulary (8 values) | DONE |
| G8-TPL | HTTP 422 on Template upload (create + replace) if `label` not in TEMPLATE vocabulary | DONE |
| G8-QTN | Fix quotation PDF artifact default label from free-text to `'quotation-document'` | DONE |
| G8-UI-EPC | `epc-document-panel.tsx` — dropdowns for 8 document families, no free-text | DONE |
| G8-UI-ECR | `engineering-change-management.tsx` — dynamic vocab dropdown per ECR/ECN | DONE |
| G8-UI-INS | `inspection-document-upload.tsx` — rewritten with pre-upload dialog; label and drawingNumber required | DONE |
| G8-UI-TPL | `offer-templates-page.tsx` — TEMPLATE vocabulary Select, no free-text | DONE |

### Zero-Trust Hardening (audit findings ECR-1, LEGACY-1, ASSERT-1)

| Task | Description | Status |
|---|---|---|
| ZT-ECR | ECR: `project_id` mandatory (HTTP 422 if absent); removed `engineering_changes/ecr/` fallback; G8 validation unconditional; `gcs_object_path` always set; `storage_url` always null | DONE |
| ZT-ECN | ECN: same hardening as ZT-ECR applied to ECN upload handler | DONE |
| ZT-INS | INS: removed `QMS/Inspections_Records/` default path; geo resolution failure rejects upload with structured error; no silent catch | DONE |
| ZT-TPL | TEMPLATE: `assertGcsPath()` called before every GCS write in `uploadTemplateToGcs()` | DONE |
| ZT-GRL | Guardrail (`epc-guardrails.ts`): added `QMS/` and `engineering_changes/` to legacy prefix blocklist; added `TPEL/Templates/` to explicit allowlist; removed ambiguous inner condition | DONE |

---

## 3. Closed Audit Findings

| Finding ID | Severity | Description | Resolution |
|---|---|---|---|
| ECR-1 | HIGH | ECR/ECN G8 guard conditional on `project_id`; uploads without project link wrote to `engineering_changes/ecr\|ecn/{id}/...` (non-TPEL) | **CLOSED** — `project_id` mandatory (HTTP 422); fallback path code deleted; `engineering_changes/` added to guardrail blocklist |
| LEGACY-1 | MEDIUM | INS upload initialised `filePath` as `QMS/Inspections_Records/...`; TPEL override in try/catch; geo failure silently wrote legacy path | **CLOSED** — QMS default removed; geo resolution failure returns structured `{success:false}` error; no catch that swallows failure |
| ASSERT-1 | LOW | `uploadTemplateToGcs()` did not call `assertGcsPath()`; TPEL/Templates/ path unguarded | **CLOSED** — `assertGcsPath(gcsPath, 'uploadTemplateToGcs')` added before GCS save; guardrail extended to allow `TPEL/Templates/` |
| DATA-1 | INFO | 267 INS + 12 QTN rows in `epc_document_attachments` have pre-R4 free-text labels | **ACKNOWLEDGED** — pre-existing records written before R4 enforcement; no new writes affected; G8 enforcement is forward-only |

---

## 4. Final Governance Rules in Force

These rules are **non-negotiable** for all future document flows.

### G1 — TPEL Root
Every new GCS write by any upload handler must produce a path beginning with `TPEL/`. No exceptions.

### G2 — Project-Scoped Path Pattern
All project documents must follow:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/{DocumentNumber}/{revSlot}/{seq}-{label}.{ext}
```
Where `{CC}` = 2-letter continent, `{CO}` = 2-letter country, `{Cust}` = 3–5 char customer short code, `{FY}` = 4-digit fiscal year code, `{NNN}` = 3-digit project sequence.

### G3 — Governed Non-Project Roots
Only two non-project TPEL roots are permitted:
- `TPEL/Templates/Offers/{templateSlug}/` — offer templates
- `TPEL/{CC}/{CO}/{Cust}/{FY}/{project_legacy_code}/...` — legacy project codes accepted for pre-R4 records only; no new writes to legacy code form

### G4 — One Builder Per Family
| Family | Builder | File |
|---|---|---|
| DWG | `buildDrawingGcsPath()` | `server/epc-coding.ts` |
| DDS | `buildDdsGcsPath()` | `server/epc-coding.ts` |
| ECR, ECN, DSP, CO, INS, QTN, + all non-DWG | `buildEpcGcsPath()` | `server/epc-coding.ts` |
| QTN (quotation artifact) | `buildEpcQtnGcsPath()` | `server/epc-coding.ts` |
| TEMPLATE | `uploadTemplateToGcs()` inline builder | `server/sales-marketing-routes.ts` |

No other GCS path construction is permitted. New document types must use one of the above builders or add a new builder that calls `assertGcsPath()` internally.

### G5 — No New Legacy Writes
The following prefixes are permanently blocked by `assertGcsPath()` / `validateGcsPath()` in `server/epc-guardrails.ts`:
- `EPC/`
- `THERMOPAC_PROJECTS/`
- `QMS/` *(blocked for EPC document families; system-level QMS routes pre-existing)*
- `engineering_changes/` *(retired)*

Any upload handler producing a path with these prefixes will throw before the GCS write executes.

### G6 — assertGcsPath() Coverage
`assertGcsPath()` must be called on every constructed path. It is called automatically inside `buildEpcGcsPath()` and `buildDrawingGcsPath()`. Any builder not calling one of these functions must call `assertGcsPath()` directly before the GCS write.

### G7 — Signed URLs Only
All document downloads must use `getSignedUrl({ action: 'read', expires: Date.now() + N })`. Public URL generation (`https://storage.googleapis.com/...`) is prohibited for all governed document families. TTL must not exceed 1 hour.

### G8 — Controlled Label Vocabulary
Labels are mandatory and must come from the controlled vocabulary in `shared/gcs-label-vocabulary.ts`. No free-text labels are permitted. The UI must present labels as dropdowns. The server must validate and return HTTP 422 on any invalid label before the file is read or uploaded.

**Family vocabularies:**

| Family | Allowed values |
|---|---|
| ECR | `change-request-form`, `supporting-analysis`, `affected-drawing`, `impact-assessment`, `cost-estimate`, `schedule-impact` |
| ECN | `change-notice`, `revised-drawing`, `updated-spec`, `implementation-record`, `close-out-report` |
| DSP | `dispatch-note`, `packing-list`, `gate-pass`, `lorry-receipt`, `e-way-bill`, `quality-release`, `delivery-challan` |
| CO | `letter-of-intent`, `purchase-order`, `advance-payment-proof`, `scope-of-supply`, `technical-specification`, `payment-terms`, `amendment` |
| INS | `inspection-report`, `test-certificate`, `witness-record`, `third-party-report`, `ndt-certificate`, `hardness-test`, `dimensional-report`, `material-traceability` |
| QTN | `quotation-document`, `bill-of-quantities`, `commercial-terms`, `technical-offer`, `deviation-list`, `clarification`, `revised-offer` |
| EPC (general) | `design-calc`, `datasheet`, `material-cert`, `test-report`, `vendor-doc`, `method-statement`, `approval-drawing`, `schedule`, `meeting-minutes`, `transmittal`, `site-instruction`, `weld-map`, `ndt-report`, `pressure-test`, `hydro-test` |
| TEMPLATE | `quotation-template`, `technical-submittal`, `cover-letter`, `bill-of-quantities`, `transmittal-template` |
| DWG | Exempt — revision-controlled; label = drawing title (free, stored in `epc_document_attachments.attachment_label`) |
| BOM | Exempt — revision-controlled |

### G9 — Mandatory Project Linkage for ECR/ECN
ECR and ECN upload requests must supply a `project_id` on the parent record. Uploads against an unlinked ECR/ECN are rejected with HTTP 422 before any file processing. This ensures geo-codes can always be resolved and a TPEL path always constructed.

### G10 — No Silent Fallback
Upload handlers must not catch geo resolution failures and fall back to a secondary path. If geo resolution fails, the upload must be rejected with a structured error response. Silent fallback is a governance violation.

---

## 5. Sample Final Paths Per Document Family

Canonical patterns are derived directly from the approved builders in `server/epc-coding.ts` and `server/utils/inspection-document-upload.ts`. Live DB examples are taken from `epc_document_attachments` (confirmed 2026-04-13). Pre-R4 paths are noted where they differ from the R4 canonical — they are read-only legacy records; no new writes use those forms.

Legend: `{CC}` = 2-letter continent code · `{CO}` = 2-letter country code · `{Cust}` = 3–5 char customer short code · `{FY}` = 4-digit fiscal year · `{NNN}` = 3-digit project sequence (e.g. `013`, `003`)

---

### DWG — Design Drawing (revision-controlled)

Builder: `buildDrawingGcsPath()` — `server/epc-coding.ts` L246–260  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{ItemCode}/DWG/{CodeBars}_rev-{rev}.{ext}
```
Live examples (DB-confirmed):
```
TPEL/EU/TR/ACI/2627/013/C10308-CPS-HED-FOR-60-P2627-013/DWG/C103082627013007_rev-00.pdf
TPEL/AS/SA/YAN/2627/003/C10295-CPS-PCP-FOR-200-P2627-003/DWG/C102952627003003_rev-00.pdf
```
Notes: `{ItemCode}` is the item/drawing code. `{CodeBars}` is the system-assigned code bars identifier. `{rev}` is the 2-digit revision index (e.g. `00`, `01`, `A`). DWG is revision-controlled; label is exempt from G8 vocabulary (stored as drawing title in `attachment_label`).

---

### QTN — Quotation Document

Builder: `buildEpcQtnGcsPath()` — `server/epc-coding.ts` L263–281  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QTN/{offerNumber}/rev-na/{seq}-{label}.pdf
```
R4 canonical example:
```
TPEL/AS/SA/YAN/2627/003/QTN/OFR-2627-0001/rev-na/001-quotation-document.pdf
TPEL/EU/TR/ACI/2627/013/QTN/OFR-2627-0011/rev-na/001-quotation-document.pdf
```
Notes: Slot 5 is `{NNN}` (3-digit project sequence only — e.g. `003`, `013`). Pre-R4 DB records incorrectly used the full project code in that slot (e.g. `2627-013`) — those are legacy read-only rows. R4 default label is `quotation-document`. Revision slot is always `rev-na` for the quotation artifact.

---

### INS — Inspection Document

Builder: inline in `server/utils/inspection-document-upload.ts` L180  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/INS/{IONum}/rev-{rev}/{seq}-{drawingNumber}-{label}.{ext}
```
R4 canonical example:
```
TPEL/OC/NZ/WPC/2425/001/INS/IO-2025-1-M-7/rev-A/025-m7-dwg-001-inspection-report.pdf
TPEL/EU/TR/ACI/2627/013/INS/IO-2627-013-0003/rev-B/001-c10308-test-certificate.pdf
```
Notes: Slot 5 is `{NNN}` (3-digit sequence). `{IONum}` is the inspection order number. `{drawingNumber}` is the sanitised drawing reference from `req.body.drawingNumber`. `{rev}` is from `req.body.revision` (e.g. `A`, `B`). Pre-R4 DB records used full legacy project code in slot 5 and `/A/` as the revision notation — those are legacy read-only rows.

---

### ECR — Engineering Change Request Document

Builder: `buildEpcGcsPath()` — `server/epc-coding.ts` L153–178  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECR/{ecrDocNumber}/rev-na/{seq}-{label}.{ext}
```
Example:
```
TPEL/EU/TR/ACI/2627/013/ECR/2627-013-ECR-0001/rev-na/001-affected-drawing.pdf
```
Notes: No live DB records yet — first upload will produce this path. Project linkage (`project_id`) is mandatory; upload is rejected with HTTP 422 if absent. `rev-na` is correct for ECR attachments (not revision-controlled documents).

---

### ECN — Engineering Change Notice Document

Builder: `buildEpcGcsPath()` — `server/epc-coding.ts` L153–178  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/ECN/{ecnDocNumber}/rev-na/{seq}-{label}.{ext}
```
Example:
```
TPEL/EU/TR/ACI/2627/013/ECN/2627-013-ECN-0001/rev-na/001-revised-drawing.pdf
```
Notes: Same constraints as ECR. Project linkage mandatory. `rev-na` is correct.

---

### DSP — Dispatch Document

Builder: `buildEpcGcsPath()` — `server/epc-coding.ts` L153–178  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/DSP/{dispatchNumber}/rev-na/{seq}-{label}.{ext}
```
Example:
```
TPEL/AS/SA/YAN/2627/003/DSP/DSP-2627-003-0001/rev-na/001-dispatch-note.pdf
```
Notes: No live DB records yet (dispatch uploads write to `epc_document_attachments`; no records have been submitted). `rev-na` is correct for dispatch documents.

---

### CO — Customer Order Document

Builder: `buildEpcGcsPath()` — `server/epc-coding.ts` L153–178  
Pattern:
```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/CO/{customerOrderNumber}/rev-{NN}/{seq}-{label}.{ext}
```
Example:
```
TPEL/EU/TR/ACI/2627/013/CO/PO-ACI-2025-001/rev-01/001-purchase-order.pdf
TPEL/EU/TR/ACI/2627/013/CO/PO-ACI-2025-001/rev-02/001-amendment.pdf
```
Notes: `{NN}` is a 2-digit numeric revision (e.g. `01`, `02`) supplied by the uploader as `revisionCode`. CO documents are versioned by revision. `rev-na` must not be used for CO; the upload UI must require a revision code.

---

### TEMPLATE — Offer Template

Builder: `uploadTemplateToGcs()` — `server/sales-marketing-routes.ts` L30–45  
Pattern:
```
TPEL/Templates/Offers/{templateSlug}/{seq}-{label}.{ext}
```
Example:
```
TPEL/Templates/Offers/standard-quotation-2025/001-quotation-template.pdf
TPEL/Templates/Offers/technical-cover-letter/001-cover-letter.pdf
```
Notes: `{templateSlug}` is derived from the template name (lowercased, non-alphanumeric → `-`). `{seq}` is a zero-padded 3-digit version counter. `assertGcsPath()` is called before every write. Label is from TEMPLATE vocabulary.

---

## Appendix — Guardrail Coverage Map

| Upload handler | File | G8 validation | assertGcsPath | Path builder | No fallback |
|---|---|---|---|---|---|
| ECR upload | `engineering-change-routes.ts` | ✅ HTTP 422 | ✅ via builder | `buildEpcGcsPath()` | ✅ |
| ECN upload | `engineering-change-routes.ts` | ✅ HTTP 422 | ✅ via builder | `buildEpcGcsPath()` | ✅ |
| DSP upload | `dispatch-routes.ts` | ✅ HTTP 422 | ✅ via builder | `buildEpcGcsPath()` | ✅ |
| CO upload | `customer-order-document-routes.ts` | ✅ HTTP 422 | ✅ via builder | `buildEpcGcsPath()` | ✅ |
| EPC General upload | `epc-document-routes.ts` | ✅ HTTP 422 | ✅ via builder | `buildEpcGcsPath()` / `buildDrawingGcsPath()` | ✅ |
| INS upload | `inspection-document-upload.ts` | ✅ reject | ✅ explicit | `TPEL/…/INS/…` inline | ✅ |
| QTN artifact | `quotation-pdf-artifact.ts` | ✅ default label | ✅ via builder | `buildEpcQtnGcsPath()` | ✅ |
| TEMPLATE create | `sales-marketing-routes.ts` | ✅ HTTP 422 | ✅ explicit | `uploadTemplateToGcs()` | ✅ |
| TEMPLATE replace | `sales-marketing-routes.ts` | ✅ HTTP 422 | ✅ explicit | `uploadTemplateToGcs()` | ✅ |
