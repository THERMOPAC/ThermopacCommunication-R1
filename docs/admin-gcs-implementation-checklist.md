# Administration GCS Implementation Checklist

| Field | Value |
|---|---|
| **Plan reference** | `docs/admin-gcs-remediation-plan-v2.md` (Rev 2 — Approved Baseline) |
| **Scope** | Administration Module GCS remediation and document control |
| **Root** | `ADMIN/` |
| **Date created** | 2026-04-14 |

---

## Phase 1 — Critical Bug Fixes

> Addresses active data loss. Zero Legal files are stored today. Visa secondary upload is broken.
> Must be completed before any migration or schema work.

### 1.1 Fix Legal upload parameter order (7 call sites) ✅ DONE 2026-04-14

- [x] Identified all 14 `uploadFileToGCS` call sites (2 per module: POST + PUT × 7 modules)
- [x] Swapped parameters to `uploadFileToGCS(fileName, req.file.buffer, mimetype)` at all 14 sites
- [x] Added `uploadResult.success` guard at every site; returns HTTP 500 on failure

**Result**: Silent upload failures eliminated. All 14 call sites now fail loudly and explicitly.

---

### 1.2 Fix Legal return field access (7 call sites) ✅ DONE 2026-04-14

- [x] Replaced `uploadResult.fileName` (undefined) with `fileName` (the path variable) at all 14 sites
- [x] Replaced `uploadResult.publicUrl` (undefined) with `uploadResult.url ?? null` at all 14 sites
- [x] DB rows now receive a valid `filePath` and `fileUrl` after upload

**Result**: `filePath` and `fileUrl` columns populated correctly after every successful upload.

---

### 1.3 Replace legacy Legal path prefixes (7 submodules) ✅ DONE 2026-04-14

- [x] `contracts/` → `ADMIN/Legal/Contracts/{ts}/{ts}.{ext}` (POST) / `ADMIN/Legal/Contracts/{contractId}/{ts}.{ext}` (PUT)
- [x] `compliance/` → `ADMIN/Legal/Compliance/{ts}/{ts}.{ext}` / `ADMIN/Legal/Compliance/{complianceId}/{ts}.{ext}`
- [x] `posh-cases/` → `ADMIN/Legal/Posh/{ts}/{ts}.{ext}` / `ADMIN/Legal/Posh/{poshCaseId}/{ts}.{ext}`
- [x] `legal-notices/` → `ADMIN/Legal/Notices/{ts}/{ts}.{ext}` / `ADMIN/Legal/Notices/{noticeId}/{ts}.{ext}`
- [x] `policy-templates/` → `ADMIN/Legal/PolicyTemplates/{ts}/{ts}.{ext}` / `ADMIN/Legal/PolicyTemplates/{templateId}/{ts}.{ext}`
- [x] `nda-agreements/` → `ADMIN/Legal/NDA/{ts}/{ts}.{ext}` / `ADMIN/Legal/NDA/{ndaId}/{ts}.{ext}`
- [x] `exclusivity-agreements/` → `ADMIN/Legal/Exclusivity/{ts}/{ts}.{ext}` / `ADMIN/Legal/Exclusivity/{exclusivityId}/{ts}.{ext}`

> **Phase 1 Note**: POST routes use `Date.now()` as path segment since entity ID is not yet available at upload time. PUT routes use the entity ID from `req.params`. Phase 2 will introduce child document tables and `seq` allocation for POST paths.

**Result**: Zero new writes to any legacy Legal prefix. All new writes go to `ADMIN/Legal/` root.

---

### 1.4 Fix Visa secondary upload ✅ DONE 2026-04-14

- [x] Removed `file.makePublic()` call from `uploadVisaDocumentLegacy` (was throwing on enforced-PAP bucket)
- [x] Added `getSignedUrl()` returning a 1-year signed URL
- [x] Updated path from `visa-documents/{visaRecordId}/` to `ADMIN/Visa/Employees/{employeeId}/Records/{visaRecordId}/{ts}.{ext}`
- [x] Added `employeeId` lookup before path construction (queries `visaRecords` by `visaRecordId`)
- [x] Fixed primary visa upload (`createVisaRecord`, `updateVisaRecord`) — replaced `generateVisaGCSPath` (used username) with `buildVisaGcsPath` (uses numeric IDs)
- [x] Fixed `uploadVisaDocument` helper — now returns signed URL, calls `assertAdminGcsPath`
- [x] `generateVisaGCSPath` function removed; replaced by `buildVisaGcsPath`

**Result**: Visa secondary upload no longer throws 403. Both primary and secondary visa uploads write to `ADMIN/Visa/` root with stable numeric IDs only.

---

### 1.5 Add `assertAdminGcsPath()` guardrail ✅ DONE 2026-04-14

- [x] Created `server/admin-guardrails.ts` with `assertAdminGcsPath(gcsPath: string): void` and `AdminGcsPathViolation` error class
- [x] 18 allowed-pattern regexes covering all approved ADMIN module paths
- [x] 10 blocked-prefix strings covering all legacy Admin GCS roots
- [x] `assertAdminGcsPath` wired into all 14 Legal upload blocks (via `fileName` before `uploadFileToGCS`)
- [x] `assertAdminGcsPath` wired into `uploadVisaDocument` helper (covers both primary create and update paths)
- [x] `assertAdminGcsPath` wired into `uploadVisaDocumentLegacy` (explicit call before `bucket.file()`)
- [x] `assertAdminGcsPath` wired into `uploadTripDocument` (before `bucket.file()`)

**Result**: Any attempt to write to a blocked or non-ADMIN path throws `AdminGcsPathViolation` at the point of path construction, before any GCS API call is made.

**Validation note**: Calling `assertAdminGcsPath("contracts/test.pdf")` throws `AdminGcsPathViolation` (blocked prefix). Calling `assertAdminGcsPath("ADMIN/Legal/Contracts/1/001.pdf")` passes. Calling `assertAdminGcsPath("some-other-path/test.pdf")` throws (not ADMIN root).

---

## Phase 2 — Schema Changes

> Adds columns and child tables required by both active/broken modules (Phase 1) and migration (Phase 3).
> Must be completed before running migrations.

### 2.1 `trip_documents` table changes

- [ ] Add column `gcs_path TEXT`
- [ ] Add column `seq INT`
- [ ] Add column `label VARCHAR(50)`
- [ ] Add column `uploaded_by INT` (FK → `users.id`)
- [ ] Add column `uploaded_at TIMESTAMP`
- [ ] Add column `deleted_at TIMESTAMP` (soft-delete)
- [ ] Add UNIQUE constraint on (`trip_id`, `seq`)

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

**Validation**: Table exists with correct structure and unique constraint.

---

### 2.3 Create Legal child tables

- [ ] Create `contract_documents` (parent FK → `contracts.id`)
- [ ] Create `posh_documents` (parent FK → `posh_cases.id`)
- [ ] Create `notice_documents` (parent FK → `legal_notices.id`)

Each table: `id SERIAL PK`, `{parent}_id INT FK`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`{parent}_id`, `seq`).

**Validation**: All three tables exist with correct FKs and UNIQUE constraints.

---

### 2.4 Add columns to Legal parent tables

- [ ] `compliance_register`: add `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`
- [ ] `nda_agreements`: add `draft_gcs_path TEXT`, `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`
- [ ] `exclusivity_agreements`: add `draft_gcs_path TEXT`, `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`

**Validation**: Confirm columns exist with correct defaults.

---

### 2.5 Add policy versioning columns

- [ ] `policy_templates`: add `gcs_path TEXT`, `version_number INT`, `effective_date DATE`, `is_active BOOLEAN DEFAULT false`, `activated_by INT FK`, `activated_at TIMESTAMP`

**Validation**: Confirm all 6 new columns present.

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

## Quick-Reference: Legacy Roots Blocked After Phase 3

| Legacy Root | Live Files | New Root | Migration Phase |
|---|---|---|---|
| `Business_Trips/` | 75 | `ADMIN/Travel/Employees/{id}/Trips/{id}/Documents/` | 3.3–3.4 |
| `Business_Visa/` | 16 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | 3.3–3.4 |
| `contracts/` | 0 | `ADMIN/Legal/Contracts/{id}/` | Phase 1 fix |
| `compliance/` | 0 | `ADMIN/Legal/Compliance/{id}/` | Phase 1 fix |
| `posh-cases/` | 0 | `ADMIN/Legal/Posh/{id}/` | Phase 1 fix |
| `legal-notices/` | 0 | `ADMIN/Legal/Notices/{id}/` | Phase 1 fix |
| `policy-templates/` | 0 | `ADMIN/Legal/PolicyTemplates/{id}/` | Phase 1 fix |
| `nda-agreements/` | 0 | `ADMIN/Legal/NDA/{id}/` | Phase 1 fix |
| `exclusivity-agreements/` | 0 | `ADMIN/Legal/Exclusivity/{id}/` | Phase 1 fix |
| `visa-documents/` | 0 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | Phase 1 fix |
