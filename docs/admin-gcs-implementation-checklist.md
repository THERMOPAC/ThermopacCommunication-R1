# Administration GCS Implementation Checklist

| Field | Value |
|---|---|
| **Plan reference** | `docs/admin-gcs-remediation-plan-v2.md` (Rev 2 — Approved Baseline) |
| **Scope** | Administration Module GCS remediation and document control |
| **Root** | `ADMIN/` |
| **Date created** | 2026-04-14 |

---

## Phase 1 — Critical Bug Fixes + Path Compliance

> Addresses active data loss (zero Legal files stored; Visa secondary upload broken).
> Path compliance: entity ID in directory; `{seq:03d}-{label}.{ext}` filename format.
> **Phase 1 is IN PROGRESS. Do not mark complete until all TEMP-P2 items are resolved.**

---

### 1.1 Fix Legal upload parameter order ✅ DONE 2026-04-14

- [x] Identified all 14 `uploadFileToGCS` call sites (2 per module: POST + PUT × 7 modules)
- [x] Swapped parameters to `uploadFileToGCS(fileName, req.file.buffer, mimetype)` at all 14 sites
- [x] Added `uploadResult.success` guard at every site; returns HTTP 500 on failure

**Result**: Silent upload failures eliminated. All 14 call sites now fail loudly and explicitly.

---

### 1.2 Fix Legal return field access ✅ DONE 2026-04-14

- [x] Replaced `uploadResult.fileName` (undefined) with `fileName` (the path variable) at all 14 sites
- [x] Replaced `uploadResult.publicUrl` (undefined) with `uploadResult.url ?? null` at all 14 sites
- [x] DB rows now receive a valid `filePath` and `fileUrl` after upload

**Result**: `filePath` and `fileUrl` columns populated correctly after every successful upload.

---

### 1.3 Replace legacy Legal path prefixes — entity ID + seq + label ⚠️ PARTIALLY DONE

#### 1.3a Legacy prefix replacement ✅ DONE 2026-04-14

- [x] `contracts/` → `ADMIN/Legal/Contracts/`
- [x] `compliance/` → `ADMIN/Legal/Compliance/`
- [x] `posh-cases/` → `ADMIN/Legal/Posh/`
- [x] `legal-notices/` → `ADMIN/Legal/Notices/`
- [x] `policy-templates/` → `ADMIN/Legal/PolicyTemplates/`
- [x] `nda-agreements/` → `ADMIN/Legal/NDA/`
- [x] `exclusivity-agreements/` → `ADMIN/Legal/Exclusivity/`

#### 1.3b Entity ID in directory (two-step insert for POST routes) ✅ DONE 2026-04-14

- [x] POST /contracts: two-step insert — insert record → get `contractId` → upload to `ADMIN/Legal/Contracts/{contractId}/` → update
- [x] POST /compliance: two-step insert — insert record → get `complianceId` → upload → update
- [x] POST /posh-cases: two-step insert — insert record → get `caseId` → upload → update
- [x] POST /notices: two-step insert — insert record → get `noticeId` → upload → update
- [x] POST /policy-templates: two-step insert — insert record → get `templateId` → upload → update
- [x] POST /nda-agreements: two-step insert — insert record → get `ndaId` → upload → update
- [x] POST /exclusivity-agreements: two-step insert — insert record → get `exclusivityId` → upload → update
- [x] PUT routes: entity ID from `req.params` — already available, no two-step needed

#### 1.3c `{seq:03d}-{label}.{ext}` filename format — label ✅ DONE 2026-04-14

- [x] `resolveLegalLabelAndSeq(module, rawLabel)` added to `server/admin-guardrails.ts`
- [x] `buildLegalGcsPath(module, entityId, seq, label, originalName)` added to `server/admin-guardrails.ts`
- [x] Controlled vocabulary constants `LEGAL_LABEL_VOCAB` in `admin-guardrails.ts` (all 7 modules)
- [x] All 14 Legal call sites now produce filenames in `{seq:03d}-{label}.{ext}` format
- [x] Label is read from `req.body.documentLabel`; validated against vocabulary; falls back to module default

Vocabulary defaults per module:

| Module | Default label | Valid labels |
|--------|--------------|--------------|
| Contracts | `draft` | `draft`, `executed`, `amendment`, `termination-notice`, `addendum` |
| Compliance | `evidence` | `evidence` |
| Posh | `complaint` | `complaint`, `acknowledgement`, `inquiry-order`, `witness-statement`, `inquiry-report`, `show-cause`, `closure-notice`, `appeal` |
| Notices | `notice` | `notice`, `reply`, `counter-reply`, `settlement-agreement`, `court-filing` |
| PolicyTemplates | `policy` | `policy` |
| NDA | `draft` | `draft`, `executed` |
| Exclusivity | `draft` | `draft`, `executed` |

#### 1.3d `{seq:03d}-{label}.{ext}` filename format — seq ⚠️ PARTIALLY DONE (TEMP-P2)

| Module | Seq behavior | Status |
|--------|-------------|--------|
| Compliance | `001` permanent — overwrite-before-lock, single file; no child table needed | ✅ PERMANENT |
| NDA | label-derived: `draft=001`, `executed=002` — two-file max, no child table needed | ✅ PERMANENT |
| Exclusivity | label-derived: `draft=001`, `executed=002` — same as NDA | ✅ PERMANENT |
| Contracts | `001` [TEMP-P2] — append-only, multi-file; seq increment requires `contract_documents` child table | ⚠️ TEMP-P2 |
| Posh | `001` [TEMP-P2] — append-only, multi-file; seq increment requires `posh_documents` child table | ⚠️ TEMP-P2 |
| Notices | `001` [TEMP-P2] — append-only, multi-file; seq increment requires `notice_documents` child table | ⚠️ TEMP-P2 |
| PolicyTemplates | `001` [TEMP-P2] — single-active-with-history; version tracking requires child table | ⚠️ TEMP-P2 |

> **TEMP-P2**: Concurrency-safe seq increment (`SELECT MAX(seq) FOR UPDATE`) requires child document tables defined in Phase 2. Until Phase 2, seq is hardcoded to `001` for all uploads on these modules. Each new upload overwrites the previous object at `{entityId}/001-{label}.{ext}`. This satisfies the path format requirement but not the immutable-append-only control rule.

**Phase 1 current path examples (all routes):**

| Route | Actual path written today |
|-------|--------------------------|
| POST /contracts (draft) | `ADMIN/Legal/Contracts/{contractId}/001-draft.pdf` |
| PUT /contracts/:id (amendment) | `ADMIN/Legal/Contracts/{contractId}/001-amendment.pdf` [TEMP-P2 — should be `002-` or higher] |
| POST /compliance | `ADMIN/Legal/Compliance/{complianceId}/001-evidence.pdf` |
| PUT /nda-agreements/:id (executed) | `ADMIN/Legal/NDA/{ndaId}/002-executed.pdf` |
| POST /exclusivity-agreements (draft) | `ADMIN/Legal/Exclusivity/{exclusivityId}/001-draft.pdf` |

**Result**: Zero new writes to any legacy Legal prefix. ADMIN root enforced. Entity ID in path. Filename format `{seq:03d}-{label}.{ext}` produced at every call site. Three modules (Compliance, NDA, Exclusivity) are permanently correct; four modules are correct at `001` pending Phase 2 seq allocation.

---

### 1.4 Fix Visa upload — entity ID + seq + label ⚠️ PARTIALLY DONE

#### 1.4a Path and transport fixes ✅ DONE 2026-04-14

- [x] Removed `file.makePublic()` from `uploadVisaDocumentLegacy` (threw 403 on enforced-PAP bucket)
- [x] All visa uploads now use `getSignedUrl()` (1-year expiry)
- [x] `generateVisaGCSPath` (used username) removed; replaced by `buildVisaDocumentGcsPath` (numeric IDs only)
- [x] `assertAdminGcsPath` called before every bucket write in all three visa upload flows

#### 1.4b Entity ID in directory (two-step insert for createVisaRecord) ✅ DONE 2026-04-14

- [x] `createVisaRecord`: two-step — insert visa record first → get `visaRecordId` → upload to `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/` → update record
- [x] `updateVisaRecord`: `visaRecordId` from `req.params.id` — already available
- [x] `uploadVisaDocumentLegacy`: `visaRecordId` from `req.body.visaRecordId` — already available

#### 1.4c `{seq:03d}-{label}.{ext}` filename format ⚠️ PARTIALLY DONE (TEMP-P2)

- [x] `resolveVisaLabel(rawLabel)` added to `admin-guardrails.ts`; validates against `VISA_LABEL_VOCAB`
- [x] `buildVisaDocumentGcsPath(empId, visaRecordId, seq, label, originalName)` in `admin-guardrails.ts`
- [x] All three visa upload flows: `documentLabel` from request body, default `visa-copy`
- [x] Valid labels: `visa-copy`, `renewal-copy`, `entry-permit`, `other`
- [x] seq = `001` for all uploads [TEMP-P2] — increment requires `visa_documents` child table

> **TEMP-P2**: seq=001 is hardcoded. Renewal uploads should increment seq, but require `visa_documents` child table (Phase 2 §2.2).

**Result**: Visa secondary upload no longer throws 403. All three visa upload paths follow `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/001-{label}.{ext}`.

---

### 1.5 Fix Trip upload — seq + label ⚠️ PARTIALLY DONE (TEMP-P2)

- [x] `resolveTripLabel(documentType)` added to `admin-guardrails.ts`; maps `documentType` to TRIP_LABEL_VOCAB; falls back to `'other'`
- [x] `buildTripDocumentGcsPath(empId, tripId, seq, label, originalName)` in `admin-guardrails.ts`
- [x] `uploadTripDocument` now builds path: `ADMIN/Travel/Employees/{empId}/Trips/{tripId}/Documents/001-{label}.{ext}`
- [x] `assertAdminGcsPath` called on every trip document upload
- [x] Valid labels: `travel-booking`, `hotel-confirmation`, `visa-copy`, `itinerary`, `invitation-letter`, `other`
- [x] seq = `001` [TEMP-P2] — increment requires `seq` column on `trip_documents` table (Phase 2 §2.1)

> **TEMP-P2**: `trip_documents` is already a child table but lacks a `seq` column. Phase 2 adds the column and enables proper concurrency-safe seq allocation per `tripId`.

**Result**: Trip document filename is now `001-{label}.{ext}` instead of `{timestamp}.{ext}`. Path format correct. Entity IDs already in path (trip_id and employee_id were already used).

---

### 1.6 Add `assertAdminGcsPath()` guardrail + vocabulary + path builders ✅ DONE 2026-04-14

- [x] `AdminGcsPathViolation` error class in `server/admin-guardrails.ts`
- [x] `assertAdminGcsPath(gcsPath)`: 10 blocked prefixes + 18 approved-pattern regexes
- [x] `LEGAL_LABEL_VOCAB`, `VISA_LABEL_VOCAB`, `TRIP_LABEL_VOCAB` — controlled vocabulary per module
- [x] `resolveLegalLabelAndSeq(module, rawLabel)` — validates label, derives seq by module rule
- [x] `resolveVisaLabel(rawLabel)`, `resolveTripLabel(documentType)` — vocabulary gatekeepers
- [x] `buildLegalGcsPath(module, entityId, seq, label, originalName)` — canonical Legal path builder
- [x] `buildVisaDocumentGcsPath(empId, visaRecordId, seq, label, originalName)` — canonical Visa path builder
- [x] `buildTripDocumentGcsPath(empId, tripId, seq, label, originalName)` — canonical Trip path builder
- [x] All three route files import from `admin-guardrails.ts`; no inline path string construction remaining

**Result**: Single source of truth for all ADMIN/ path construction. Any change to approved path format requires only one file update. Guardrail fires before any GCS API call.

---

## Phase 1 — Open Items (blocking Phase 1 completion)

| Item | Module(s) | Blocker | Phase required |
|------|-----------|---------|---------------|
| Concurrency-safe seq increment on PUT/POST | Contracts, POSH, Notices, PolicyTemplates | `contract_documents`, `posh_documents`, `notice_documents` child tables | Phase 2 §2.3 |
| Visa renewal seq increment | Visa | `visa_documents` child table | Phase 2 §2.2 |
| Trip document seq increment | Trip | `seq` column on `trip_documents` | Phase 2 §2.1 |

---

## Phase 2 — Schema Changes

> Adds columns and child tables required by both active/broken modules (Phase 1) and migration (Phase 3).
> Must be completed before running migrations.

### 2.1 `trip_documents` table changes

- [ ] Add column `seq INT`
- [ ] Add column `label VARCHAR(50)`
- [ ] Add column `uploaded_by INT` (FK → `users.id`) if not already present
- [ ] Add column `uploaded_at TIMESTAMP` if not already present
- [ ] Add column `deleted_at TIMESTAMP` (soft-delete)
- [ ] Add UNIQUE constraint on (`trip_id`, `seq`)

**After this**: Update `uploadTripDocument` to use `SELECT MAX(seq) FOR UPDATE` pattern; remove `[TEMP-P2]` annotation.

**Validation**: `\d trip_documents` shows all new columns and unique constraint.

---

### 2.2 Create `visa_documents` table

- [ ] `id SERIAL PRIMARY KEY`
- [ ] `visa_record_id INT NOT NULL` (FK → `visa_records.id`)
- [ ] `gcs_path TEXT NOT NULL`
- [ ] `seq INT NOT NULL`
- [ ] `label VARCHAR(50)`
- [ ] `is_active BOOLEAN DEFAULT true`
- [ ] `uploaded_by INT` (FK → `users.id`)
- [ ] `uploaded_at TIMESTAMP NOT NULL`
- [ ] `superseded_at TIMESTAMP`
- [ ] UNIQUE(`visa_record_id`, `seq`)

**After this**: Update all three visa upload flows to use `SELECT MAX(seq) FOR UPDATE`; remove `[TEMP-P2]` annotations.

**Validation**: Table exists with correct structure and unique constraint.

---

### 2.3 Create Legal child tables

- [ ] Create `contract_documents` (parent FK → `contracts.id`)
- [ ] Create `posh_documents` (parent FK → `posh_cases.id`)
- [ ] Create `notice_documents` (parent FK → `legal_notices.id`)

Each table: `id SERIAL PK`, `{parent}_id INT FK`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`{parent}_id`, `seq`).

**After this**: Update Contracts, POSH, Notices upload routes to use `SELECT MAX(seq) FOR UPDATE`; remove `[TEMP-P2]` annotations from these routes.

**Validation**: All three tables exist with correct FKs and UNIQUE constraints.

---

### 2.4 Add columns to Legal parent tables

- [ ] `compliance_register`: add `file_locked BOOLEAN DEFAULT false`
- [ ] `nda_agreements`: add `draft_gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`
- [ ] `exclusivity_agreements`: add `draft_gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`

**Validation**: Confirm columns exist with correct defaults.

---

### 2.5 Add policy versioning columns

- [ ] `policy_templates`: add `version_number INT`, `effective_date DATE`, `is_active BOOLEAN DEFAULT false`, `activated_by INT FK`, `activated_at TIMESTAMP`

**Validation**: Confirm all 5 new columns present.

---

### 2.6 Run `db:push`

- [ ] Run `npm run db:push` (or `npm run db:push --force` if needed)
- [ ] Confirm no destructive changes to existing primary key columns
- [ ] Confirm all new tables and columns applied successfully

---

## Phase 3 — Migration

> Move 91 live legacy files (75 Travel + 16 Visa) to new ADMIN paths.
> Staged and idempotent — safe to interrupt and re-run at any stage.

### 3.1 Write migration script for Travel documents

- [ ] Script: `scripts/migrate-admin-travel-gcs.ts`
- [ ] Implements all 5 stages: S0 Inventory → S1 Copy → S2 Verify SHA-256 → S3 Update DB → S4 Delete source
- [ ] Each stage independently idempotent (checks current state before acting)
- [ ] Logs per-file: `legacy_path`, `new_path`, `sha256_match`, `db_updated_at`, `source_deleted_at`
- [ ] New path: `ADMIN/Travel/Employees/{employee_id}/Trips/{trip_id}/Documents/{seq:03d}-{label}.{ext}`

**Validation**: Dry-run output shows all 75 files with correct new paths before any writes.

---

### 3.2 Write migration script for Visa documents

- [ ] Script: `scripts/migrate-admin-visa-gcs.ts`
- [ ] Implements same 5-stage pattern
- [ ] New path: `ADMIN/Visa/Employees/{employee_id}/Records/{visa_record_id}/001-visa-copy.{ext}`
- [ ] Creates `visa_documents` rows during S3 with `is_active = true`
- [ ] Nulls legacy file URL column on `visa_records` after S3 confirmed

**Validation**: Dry-run output shows all 16 files with correct new paths before any writes.

---

### 3.3 Run migrations in staging

- [ ] Execute Travel migration script in staging environment
- [ ] Verify SHA-256 match on all 75 files
- [ ] Verify all 75 `trip_documents.gcs_path` values updated to `ADMIN/Travel/...`
- [ ] Verify zero files remain at `Business_Trips/` prefix
- [ ] Execute Visa migration script in staging environment
- [ ] Verify SHA-256 match on all 16 files
- [ ] Verify all 16 `visa_documents` rows created with `is_active = true`
- [ ] Verify zero files remain at `Business_Visa/` prefix

---

### 3.4 Run migrations in production

- [ ] Execute Travel migration in production
- [ ] Execute Visa migration in production
- [ ] Final verification query: `SELECT COUNT(*) FROM trip_documents WHERE gcs_path LIKE 'Business_Trips/%'` = 0
- [ ] Final verification query: `SELECT COUNT(*) FROM visa_documents WHERE gcs_path LIKE 'Business_Visa/%'` = 0

---

### 3.5 Deploy and activate guardrails

- [ ] Deploy `admin-guardrails.ts` blocking all legacy Admin roots
- [ ] Confirm `assertAdminGcsPath()` is active in all three admin route files
- [ ] Attempt a test write to a legacy prefix — confirm it throws `AdminGcsPathViolation` and returns HTTP 500

---

## Phase 4 — Control Enforcement (Future Modules)

> Implement when each feature module is built. Do not implement prematurely.

### 4.1 Trip Expense Receipts

- [ ] Implement receipt upload to `ADMIN/Travel/Employees/{employeeId}/Trips/{tripId}/Expenses/{expenseId}/001-receipt.{ext}`
- [ ] Add lock check: reject upload if `tripReimbursements.status = 'processed'`
- [ ] `trip_expenses.receipt_locked` set to `true` on reimbursement processing

**Status**: `pending`

---

### 4.2 Leave Attachments

- [ ] Implement attachment upload to `ADMIN/Leave/Requests/{requestId}/001-medical-certificate.{ext}`
- [ ] Add lock check: reject if `manager_approval_status IS NOT NULL`
- [ ] `leave_requests.attachment_locked = true` on first manager action

**Status**: `pending`

---

### 4.3 Payslip Storage

- [ ] Schema: add `payslip_gcs_path`, `payslip_generated_at` to `payroll_records`
- [ ] Write-once gate: reject if `payslip_gcs_path IS NOT NULL`
- [ ] Payroll lock check: reject if period is locked for employee
- [ ] Store at `ADMIN/Payroll/Payslips/{periodId}/{employeeId}/001-payslip.pdf`

**Status**: `pending`

---

### 4.4 Investment Proof Uploads

- [ ] Rename `proof_document_key` → `proof_gcs_path` in `employee_investment_proofs`
- [ ] Add `file_locked BOOLEAN DEFAULT false`
- [ ] Overwrite-before-lock gate: reject if `verified_at IS NOT NULL`
- [ ] Store at `ADMIN/Payroll/TaxProofs/{declarationId}/{proofId}/001-proof.{ext}`

**Status**: `pending`

---

### 4.5 Loan Documents

- [ ] Create `loan_documents` table
- [ ] Implement concurrency-safe seq allocation per `loanId`
- [ ] Store at `ADMIN/Payroll/Loans/{loanId}/{seq:03d}-{label}.{ext}`

**Status**: `pending`

---

### 4.6 Advance Documents

- [ ] Create `advance_documents` table
- [ ] Implement concurrency-safe seq allocation per `advanceId`
- [ ] Store at `ADMIN/Payroll/Advances/{advanceId}/{seq:03d}-{label}.{ext}`

**Status**: `pending`

---

### 4.7 Statutory Challans

- [ ] Rename `ecr_file_key` → `ecr_gcs_path` in `statutory_challans`
- [ ] Add `challan_pdf_gcs_path`, `payment_receipt_gcs_path`
- [ ] Each column write-once; reject second write per column
- [ ] Store at `ADMIN/Statutory/Challans/{challanId}/{seq:03d}-{label}.{ext}`

**Status**: `pending`

---

### 4.8 Advance Tax Challans

- [ ] Add `challan_gcs_path` to `advance_tax_payments`
- [ ] Write-once gate: reject if `challan_gcs_path IS NOT NULL`
- [ ] Store at `ADMIN/Statutory/AdvanceTax/{challanId}/001-challan-receipt.{ext}`

**Status**: `pending`

---

### 4.9 Appraisal Increment Letters

- [ ] Add `letter_gcs_path`, `letter_generated_at` to `employee_appraisals`
- [ ] Write-once gate: reject if `letter_gcs_path IS NOT NULL`
- [ ] Write only when `employee_appraisals.status = 'approved'`
- [ ] Store at `ADMIN/Appraisals/Cycles/{cycleId}/Records/{appraisalId}/001-increment-letter.pdf`

**Status**: `pending`

---

## Quick-Reference: Active Path Formats (Phase 1 state)

| Route | Path format today | Status |
|-------|------------------|--------|
| POST /legal/contracts | `ADMIN/Legal/Contracts/{contractId}/001-{label}.{ext}` | TEMP-P2 (seq fixed at 001) |
| PUT /legal/contracts/:id | `ADMIN/Legal/Contracts/{contractId}/001-{label}.{ext}` | TEMP-P2 (seq fixed at 001) |
| POST /legal/compliance | `ADMIN/Legal/Compliance/{complianceId}/001-evidence.{ext}` | PERMANENT |
| PUT /legal/compliance/:id | `ADMIN/Legal/Compliance/{complianceId}/001-evidence.{ext}` | PERMANENT |
| POST /legal/posh-cases | `ADMIN/Legal/Posh/{caseId}/001-{label}.{ext}` | TEMP-P2 |
| PUT /legal/posh-cases/:id | `ADMIN/Legal/Posh/{caseId}/001-{label}.{ext}` | TEMP-P2 |
| POST /legal/notices | `ADMIN/Legal/Notices/{noticeId}/001-{label}.{ext}` | TEMP-P2 |
| PUT /legal/notices/:id | `ADMIN/Legal/Notices/{noticeId}/001-{label}.{ext}` | TEMP-P2 |
| POST /legal/policy-templates | `ADMIN/Legal/PolicyTemplates/{templateId}/001-policy.{ext}` | TEMP-P2 |
| PUT /legal/policy-templates/:id | `ADMIN/Legal/PolicyTemplates/{templateId}/001-policy.{ext}` | TEMP-P2 |
| POST /legal/nda-agreements | `ADMIN/Legal/NDA/{ndaId}/001-draft.{ext}` or `002-executed.{ext}` | PERMANENT |
| PUT /legal/nda-agreements/:id | `ADMIN/Legal/NDA/{ndaId}/001-draft.{ext}` or `002-executed.{ext}` | PERMANENT |
| POST /legal/exclusivity-agreements | `ADMIN/Legal/Exclusivity/{exclusivityId}/001-draft.{ext}` or `002-executed.{ext}` | PERMANENT |
| PUT /legal/exclusivity-agreements/:id | `ADMIN/Legal/Exclusivity/{exclusivityId}/001-draft.{ext}` or `002-executed.{ext}` | PERMANENT |
| createVisaRecord | `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/001-{label}.{ext}` | TEMP-P2 |
| updateVisaRecord | `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/001-{label}.{ext}` | TEMP-P2 |
| uploadVisaDocumentLegacy | `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/001-{label}.{ext}` | TEMP-P2 |
| uploadTripDocument | `ADMIN/Travel/Employees/{empId}/Trips/{tripId}/Documents/001-{label}.{ext}` | TEMP-P2 |

## Quick-Reference: Legacy Roots Blocked

| Legacy Root | Live Files | New Root | Status |
|---|---|---|---|
| `Business_Trips/` | 75 | `ADMIN/Travel/Employees/{id}/Trips/{id}/Documents/` | Migration Phase 3 |
| `Business_Visa/` | 16 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | Migration Phase 3 |
| `contracts/` | 0 | `ADMIN/Legal/Contracts/{id}/` | Fixed Phase 1 |
| `compliance/` | 0 | `ADMIN/Legal/Compliance/{id}/` | Fixed Phase 1 |
| `posh-cases/` | 0 | `ADMIN/Legal/Posh/{id}/` | Fixed Phase 1 |
| `legal-notices/` | 0 | `ADMIN/Legal/Notices/{id}/` | Fixed Phase 1 |
| `policy-templates/` | 0 | `ADMIN/Legal/PolicyTemplates/{id}/` | Fixed Phase 1 |
| `nda-agreements/` | 0 | `ADMIN/Legal/NDA/{id}/` | Fixed Phase 1 |
| `exclusivity-agreements/` | 0 | `ADMIN/Legal/Exclusivity/{id}/` | Fixed Phase 1 |
| `visa-documents/` | 0 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | Fixed Phase 1 |
