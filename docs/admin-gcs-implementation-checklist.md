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

### 1.1 Fix Legal upload parameter order (7 call sites)

- [ ] Identify all 7 `uploadFileToGCS(req.file.buffer, fileName, mimetype)` calls in `legal-management-routes.ts`
- [ ] Swap parameters to `uploadFileToGCS(fileName, req.file.buffer, mimetype)` at each site
- [ ] Verify no other call sites in other files use the wrong order

**Validation**: Upload a test contract document and confirm the GCS object is created.

---

### 1.2 Fix Legal return field access (7 call sites)

- [ ] Replace `result.fileName` with `result.gcsPath` at all 7 sites
- [ ] Replace `result.publicUrl` with `result.signedUrl` at all 7 sites
- [ ] Confirm DB row is updated with correct `gcs_path` value after upload

**Validation**: Confirm DB `gcs_path` column holds a valid `ADMIN/Legal/...` path after upload.

---

### 1.3 Replace legacy Legal path prefixes (7 submodules)

- [ ] `contracts/` → `ADMIN/Legal/Contracts/{contractId}/{seq:03d}-{label}.{ext}`
- [ ] `compliance/` → `ADMIN/Legal/Compliance/{complianceId}/{seq:03d}-{label}.{ext}`
- [ ] `posh-cases/` → `ADMIN/Legal/Posh/{caseId}/{seq:03d}-{label}.{ext}`
- [ ] `legal-notices/` → `ADMIN/Legal/Notices/{noticeId}/{seq:03d}-{label}.{ext}`
- [ ] `policy-templates/` → `ADMIN/Legal/PolicyTemplates/{templateId}/{seq:03d}-{label}.{ext}`
- [ ] `nda-agreements/` → `ADMIN/Legal/NDA/{ndaId}/{seq:03d}-{label}.{ext}`
- [ ] `exclusivity-agreements/` → `ADMIN/Legal/Exclusivity/{exclusivityId}/{seq:03d}-{label}.{ext}`

**Validation**: Bucket scan confirms zero new writes to any legacy Legal prefix after fix.

---

### 1.4 Fix Visa secondary upload

- [ ] Remove `file.makePublic()` call at `visa-management-routes.ts:836`
- [ ] Replace with `gcsFile.getSignedUrl()` returning a signed URL
- [ ] Update secondary upload path prefix from `visa-documents/{visaRecordId}/` to `ADMIN/Visa/Employees/{employeeId}/Records/{visaRecordId}/`
- [ ] Confirm `{seq}` is allocated using `SELECT MAX(seq) FOR UPDATE` pattern

**Validation**: Secondary visa document upload completes without a 403 or thrown error. File appears at new ADMIN path.

---

### 1.5 Add `assertAdminGcsPath()` guardrail

- [ ] Create `server/admin-guardrails.ts` with `assertAdminGcsPath(path: string): void`
- [ ] Implement allowed-prefix regex covering all 18 defined ADMIN paths
- [ ] Implement blocked-prefix list (all 10 legacy Admin roots)
- [ ] Add `assertAdminGcsPath(gcsPath)` call before every `bucket.file(path)` in `legal-management-routes.ts`
- [ ] Add `assertAdminGcsPath(gcsPath)` call before every `bucket.file(path)` in `visa-management-routes.ts`
- [ ] Add `assertAdminGcsPath(gcsPath)` call before every `bucket.file(path)` in `trip-management-routes.ts`

**Validation**: Attempt to write to `contracts/test.pdf` — confirm `AdminGcsPathViolation` is thrown. Attempt to write to `ADMIN/Legal/Contracts/1/001-executed.pdf` — confirm it passes.

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
