# Administration GCS Remediation Plan

| Field | Value |
|---|---|
| **Version** | 2.0 |
| **Status** | IMPLEMENTED (Rev 2) |
| **Scope** | Administration Module — all HR, Legal, Travel, Visa, Payroll, Statutory, Appraisal submodules |
| **Root** | `ADMIN/` |
| **ID Rule** | Stable system-assigned IDs only in all path segments — no names, display strings, usernames, or user-entered text permitted |
| **Supersedes** | Rev 1 (design only, never baselined) |
| **Date** | 2026-04-14 |

---

## Changes from Rev 1 to Rev 2

| # | Change |
|---|---|
| R1 | `employeeId` added to Travel and Visa path prefixes for partition-level browsability |
| R2 | "Numeric IDs only" replaced with "stable system IDs only" (covers serials, UUIDs, and other machine-assigned keys) |
| R3 | `COUNT(*) + 1` seq logic replaced with concurrency-safe `SELECT MAX(seq) FOR UPDATE` pattern |
| R4 | JSONB option removed from all multi-file modules — child tables are mandatory |
| R5 | Migration restated as staged and idempotent — no cross-system atomicity claimed |

---

## 1. Final ADMIN Path Tree

```
ADMIN/
│
├── Travel/
│   └── Employees/{employeeId}/
│       └── Trips/{tripId}/
│           ├── Documents/{seq:03d}-{label}.{ext}               ← Active → migrate
│           └── Expenses/{expenseId}/{seq:03d}-{label}.{ext}    ← Future
│
├── Visa/
│   └── Employees/{employeeId}/
│       └── Records/{visaRecordId}/{seq:03d}-{label}.{ext}      ← Active → migrate
│
├── Legal/
│   ├── Contracts/{contractId}/{seq:03d}-{label}.{ext}          ← Broken → Fix
│   ├── Compliance/{complianceId}/{seq:03d}-{label}.{ext}       ← Broken → Fix
│   ├── Posh/{caseId}/{seq:03d}-{label}.{ext}                   ← Broken → Fix
│   ├── Notices/{noticeId}/{seq:03d}-{label}.{ext}              ← Broken → Fix
│   ├── PolicyTemplates/{templateId}/{seq:03d}-{label}.{ext}    ← Broken → Fix
│   ├── NDA/{ndaId}/{seq:03d}-{label}.{ext}                     ← Broken → Fix
│   └── Exclusivity/{exclusivityId}/{seq:03d}-{label}.{ext}     ← Broken → Fix
│
├── Leave/
│   └── Requests/{requestId}/{seq:03d}-{label}.{ext}            ← Future
│
├── Payroll/
│   ├── Payslips/{periodId}/{employeeId}/{seq:03d}-payslip.pdf  ← Future
│   ├── Loans/{loanId}/{seq:03d}-{label}.{ext}                  ← Future
│   ├── Advances/{advanceId}/{seq:03d}-{label}.{ext}            ← Future
│   └── TaxProofs/{declarationId}/{proofId}/{seq:03d}-{label}.{ext} ← Future
│
├── Statutory/
│   ├── Challans/{challanId}/{seq:03d}-{label}.{ext}            ← Future
│   └── AdvanceTax/{challanId}/{seq:03d}-{label}.{ext}          ← Future
│
└── Appraisals/
    └── Cycles/{cycleId}/Records/{appraisalId}/{seq:03d}-{label}.{ext} ← Future
```

### Submodules confirmed not needing GCS paths

The following Administration submodules were audited and confirmed to have no document storage requirement — no GCS paths are defined or needed for these:

Attendance, Attendance Regularizations, Payroll (compute-only), Manual Salary Entries, Tax Declarations (numeric form only), DWAR, Schengen Tracker, Work Locations, Module Permissions, Two-Factor Auth, Notifications.

---

## 2. Path Control Table

| # | GCS Path | Module | Status | Control Rule | Duplicate Rule | Lock / Event Rule | DB Requirements | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | `ADMIN/Travel/Employees/{employeeId}/Trips/{tripId}/Documents/{seq:03d}-{label}.{ext}` | Business Trips | **Active → Migrate** | Append-only, multi-file | `{seq}` concurrency-safe per `tripId` (see §4) | Immutable on write. Soft-delete only (`deleted_at`). No overwrite. | `trip_documents`: add `gcs_path TEXT`, `seq INT`, `label VARCHAR(50)`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`, `deleted_at TIMESTAMP`. UNIQUE(`trip_id`, `seq`). | Valid labels: `travel-booking`, `hotel-confirmation`, `visa-copy`, `itinerary`, `invitation-letter`, `other`. 75 live files to migrate. `employeeId` = `business_trips.employee_id`. |
| 2 | `ADMIN/Travel/Employees/{employeeId}/Trips/{tripId}/Expenses/{expenseId}/{seq:03d}-{label}.{ext}` | Trip Expenses | **Future** | Overwrite-before-lock, single file | One file per `expenseId`. Re-upload: delete old GCS object, write new. `seq` always `001`. | Locked when `tripReimbursements.status = 'processed'`. Write rejected if locked. | `trip_expenses`: rename `receipt_url` → `receipt_gcs_path TEXT`. Add `receipt_locked BOOLEAN DEFAULT false`. | Valid label: `receipt`. `employeeId` = `trip_expenses.submitted_by`. |
| 3 | `ADMIN/Visa/Employees/{employeeId}/Records/{visaRecordId}/{seq:03d}-{label}.{ext}` | Visa Management | **Active → Migrate** | Single-active with history | `{seq}` concurrency-safe per `visaRecordId`. Active file tracked by `is_active = true`. | No hard lock. Renewal: new `{seq}` entry + prior entry `is_active = false`, `superseded_at` written. | New table `visa_documents`: `id SERIAL PK`, `visa_record_id INT FK visa_records.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50)`, `is_active BOOLEAN DEFAULT true`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP NOT NULL`, `superseded_at TIMESTAMP`. UNIQUE(`visa_record_id`, `seq`). | Valid labels: `visa-copy`, `renewal-copy`, `entry-permit`, `other`. 16 live files to migrate. `employeeId` = `visa_records.employee_id`. `makePublic()` bug eliminated. |
| 4 | `ADMIN/Legal/Contracts/{contractId}/{seq:03d}-{label}.{ext}` | Legal — Contracts | **Broken → Fix** | Append-only, label-differentiated | `{seq}` concurrency-safe per `contractId`. Same label may repeat (multiple amendments). | Immutable on write. No overwrite, no delete. | New child table `contract_documents`: `id SERIAL PK`, `contract_id INT FK contracts.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`contract_id`, `seq`). | Valid labels: `draft`, `executed`, `amendment`, `termination-notice`, `addendum`. Fix: swap uploadFileToGCS param order + correct return field names. |
| 5 | `ADMIN/Legal/Compliance/{complianceId}/{seq:03d}-{label}.{ext}` | Legal — Compliance Register | **Broken → Fix** | Overwrite-before-lock, single file | One file per `complianceId`. Re-upload: delete old, write new. `seq` always `001`. | Locked when `compliance_register.status = 'closed'` or `expiry_date < NOW()`. `file_locked = true` at close. | `compliance_register`: add `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`. | Valid label: `evidence`. Fix: same param-order + return-field bug. |
| 6 | `ADMIN/Legal/Posh/{caseId}/{seq:03d}-{label}.{ext}` | Legal — POSH Cases | **Broken → Fix** | Append-only, multi-file | `{seq}` concurrency-safe per `caseId`. No overwrite ever. | Immutable on write. Preserved indefinitely — legal record. | New child table `posh_documents`: `id SERIAL PK`, `case_id INT FK posh_cases.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`case_id`, `seq`). | Valid labels: `complaint`, `acknowledgement`, `inquiry-order`, `witness-statement`, `inquiry-report`, `show-cause`, `closure-notice`, `appeal`. Fix: same bug. |
| 7 | `ADMIN/Legal/Notices/{noticeId}/{seq:03d}-{label}.{ext}` | Legal — Legal Notices | **Broken → Fix** | Append-only, multi-file | `{seq}` concurrency-safe per `noticeId`. Full correspondence chain preserved. | Immutable on write. | New child table `notice_documents`: `id SERIAL PK`, `notice_id INT FK legal_notices.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`notice_id`, `seq`). | Valid labels: `notice`, `reply`, `counter-reply`, `settlement-agreement`, `court-filing`. Fix: same bug. |
| 8 | `ADMIN/Legal/PolicyTemplates/{templateId}/{seq:03d}-{label}.{ext}` | Legal — Policy Templates | **Broken → Fix** | Single-active with history | `{seq}` concurrency-safe per `templateId`. `is_active = true` on latest published version only. | New upload defaults `is_active = false`. Activation is an explicit separate HR action that sets prior active = false in the same transaction. Old versions never deleted. | `policy_templates`: add `gcs_path TEXT`, `version_number INT`, `effective_date DATE`, `is_active BOOLEAN DEFAULT false`, `activated_by INT FK`, `activated_at TIMESTAMP`. | Valid label: `policy`. `{seq}` is the path version identifier. `version_number` is the business-facing label (e.g. "v3"). |
| 9 | `ADMIN/Legal/NDA/{ndaId}/{seq:03d}-{label}.{ext}` | Legal — NDA Agreements | **Broken → Fix** | Append within record; `executed` is final state | Two files max per NDA: `draft` (optional) then `executed`. After `executed` upload, further writes blocked at route. | `file_locked = true` written atomically with `executed` upload success. | `nda_agreements`: add `draft_gcs_path TEXT`, `gcs_path TEXT` (executed copy), `file_locked BOOLEAN DEFAULT false`. | Valid labels: `draft`, `executed`. Fix: same bug. |
| 10 | `ADMIN/Legal/Exclusivity/{exclusivityId}/{seq:03d}-{label}.{ext}` | Legal — Exclusivity Agreements | **Broken → Fix** | Same as NDA | Same as NDA | `file_locked = true` at executed upload | `exclusivity_agreements`: add `draft_gcs_path TEXT`, `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`. | Valid labels: `draft`, `executed`. Fix: same bug. |
| 11 | `ADMIN/Leave/Requests/{requestId}/{seq:03d}-{label}.{ext}` | Leave | **Future** | Overwrite-before-lock, single file | One file per `requestId`. `seq` always `001`. Re-upload replaces. | Locked when `leave_requests.manager_approval_status IS NOT NULL`. `attachment_locked = true` set on first decision. | `leave_requests`: rename `attachment_url` → `attachment_gcs_path TEXT`. Add `attachment_locked BOOLEAN DEFAULT false`. | Valid label: `medical-certificate`. |
| 12 | `ADMIN/Payroll/Payslips/{periodId}/{employeeId}/{seq:03d}-payslip.pdf` | Payroll — Salary Slips | **Future** | Write-once, locked immediately | Route rejects if `payslip_gcs_path IS NOT NULL`. Also rejects if `payroll_locks` shows period locked. | Locked immediately on first successful write. `payslip_gcs_path` and `payslip_generated_at` written in same transaction. | `payroll_records`: add `payslip_gcs_path TEXT`, `payslip_generated_at TIMESTAMP`. Write gate: `WHERE payslip_gcs_path IS NULL`. | `{seq}` always `001`. Label always `payslip`. |
| 13 | `ADMIN/Payroll/Loans/{loanId}/{seq:03d}-{label}.{ext}` | Payroll — Loans | **Future** | Append-only, multi-file | `{seq}` concurrency-safe per `loanId`. | Immutable on write. | New child table `loan_documents`: `id SERIAL PK`, `loan_id INT FK employee_loans.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`loan_id`, `seq`). | Valid labels: `application`, `sanction-letter`, `disbursement-proof`, `closure-letter`. |
| 14 | `ADMIN/Payroll/Advances/{advanceId}/{seq:03d}-{label}.{ext}` | Payroll — Advances | **Future** | Append-only, multi-file | `{seq}` concurrency-safe per `advanceId`. | Immutable on write. | New child table `advance_documents`: `id SERIAL PK`, `advance_id INT FK employee_advances.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`advance_id`, `seq`). | Valid labels: `request`, `approval-letter`, `disbursement-proof`. |
| 15 | `ADMIN/Payroll/TaxProofs/{declarationId}/{proofId}/{seq:03d}-{label}.{ext}` | Payroll — Investment Proofs | **Future** | Overwrite-before-lock, single file | One file per `proofId`. `seq` always `001`. Re-upload: delete old, write new. | Locked when `employee_investment_proofs.verified_at IS NOT NULL`. `file_locked = true` when `verified_at` is set. | `employee_investment_proofs`: rename `proof_document_key` → `proof_gcs_path TEXT`. Add `file_locked BOOLEAN DEFAULT false`. | Valid label: `proof`. |
| 16 | `ADMIN/Statutory/Challans/{challanId}/{seq:03d}-{label}.{ext}` | Statutory Compliance | **Future** | Append-only, multi-file — one file per label slot | `{seq}` concurrency-safe per `challanId`. Reject upload if that label already exists for this `challanId`. | Each label slot independently immutable once written. | `statutory_challans`: rename `ecr_file_key` → `ecr_gcs_path TEXT`. Add `challan_pdf_gcs_path TEXT`, `payment_receipt_gcs_path TEXT`. Each column individually write-once. | Valid labels: `ecr-file`, `challan-pdf`, `payment-receipt`. Each maps to a dedicated column. |
| 17 | `ADMIN/Statutory/AdvanceTax/{challanId}/{seq:03d}-{label}.{ext}` | Statutory — Advance Tax | **Future** | Write-once, locked immediately | One file per advance tax payment. Route rejects if `challan_gcs_path IS NOT NULL`. | Locked immediately on write. | `advance_tax_payments`: add `challan_gcs_path TEXT`. Write gate: `WHERE challan_gcs_path IS NULL`. | Valid label: `challan-receipt`. `{seq}` always `001`. |
| 18 | `ADMIN/Appraisals/Cycles/{cycleId}/Records/{appraisalId}/{seq:03d}-{label}.{ext}` | Appraisals | **Future** | Write-once, locked immediately | One file per appraisal. Route rejects if `letter_gcs_path IS NOT NULL`. Write only when `status = 'approved'`. | Locked immediately on write. | `employee_appraisals`: add `letter_gcs_path TEXT`, `letter_generated_at TIMESTAMP`. Write gate: `WHERE status = 'approved' AND letter_gcs_path IS NULL`. | Valid label: `increment-letter`. `{seq}` always `001`. |

---

## 3. Controlled Vocabulary — Labels per Path

| Path Prefix | Valid Labels |
|---|---|
| `Travel/.../Documents/` | `travel-booking`, `hotel-confirmation`, `visa-copy`, `itinerary`, `invitation-letter`, `other` |
| `Travel/.../Expenses/{expenseId}/` | `receipt` |
| `Visa/.../Records/{id}/` | `visa-copy`, `renewal-copy`, `entry-permit`, `other` |
| `Legal/Contracts/{id}/` | `draft`, `executed`, `amendment`, `termination-notice`, `addendum` |
| `Legal/Compliance/{id}/` | `evidence` |
| `Legal/Posh/{id}/` | `complaint`, `acknowledgement`, `inquiry-order`, `witness-statement`, `inquiry-report`, `show-cause`, `closure-notice`, `appeal` |
| `Legal/Notices/{id}/` | `notice`, `reply`, `counter-reply`, `settlement-agreement`, `court-filing` |
| `Legal/PolicyTemplates/{id}/` | `policy` |
| `Legal/NDA/{id}/` | `draft`, `executed` |
| `Legal/Exclusivity/{id}/` | `draft`, `executed` |
| `Leave/Requests/{id}/` | `medical-certificate` |
| `Payroll/Payslips/{period}/{emp}/` | _(no label — filename = `001-payslip.pdf`)_ |
| `Payroll/Loans/{id}/` | `application`, `sanction-letter`, `disbursement-proof`, `closure-letter` |
| `Payroll/Advances/{id}/` | `request`, `approval-letter`, `disbursement-proof` |
| `Payroll/TaxProofs/{decl}/{proof}/` | `proof` |
| `Statutory/Challans/{id}/` | `ecr-file`, `challan-pdf`, `payment-receipt` |
| `Statutory/AdvanceTax/{id}/` | `challan-receipt` |
| `Appraisals/.../Records/{id}/` | `increment-letter` |

---

## 4. Concurrency-Safe Seq Allocation

The `COUNT(*) + 1` pattern is unsafe under concurrent uploads — two simultaneous requests read the same count and attempt to insert the same `seq`, violating the UNIQUE constraint or silently producing a race condition.

### Correct pattern for all append-only and single-active child tables

```sql
BEGIN;

SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
FROM {child_table}
WHERE {parent_id_col} = $parentId
FOR UPDATE;

-- Use next_seq to construct the GCS path.
-- Perform GCS write outside transaction (see note).

INSERT INTO {child_table} (parent_id, seq, gcs_path, label, ...)
VALUES ($parentId, $nextSeq, $gcsPath, $label, ...);

COMMIT;
```

### GCS write / transaction sequencing

GCS writes cannot participate in a DB transaction. Correct order:

1. Open DB transaction; acquire `FOR UPDATE` on the scanned set; determine `nextSeq`; build `gcsPath`
2. Hold the transaction while performing the GCS write
3. On GCS success: execute INSERT; COMMIT
4. On GCS failure: ROLLBACK; surface error; no path or DB record created
5. On DB INSERT failure after GCS success: attempt GCS delete of the just-written object as a compensating action; surface error

For single-file paths where `seq` is always `001`, the UNIQUE(`parent_id`, `seq`) constraint itself is the duplicate gate — no seq allocation loop required.

---

## 5. Migration Plan — Live Files (Staged, Idempotent)

### Design principles

- No operation is atomic across GCS and PostgreSQL. The migration proceeds in discrete, independently re-runnable stages.
- A `gcs_migration_log` table (or equivalent tracking state per row) records per-file progress so a re-run skips already-completed files.
- The legacy path is never deleted until the DB record is confirmed updated and the GCS copy is verified.
- The migration is safe to interrupt at any stage and re-run without side effects.

### Staged protocol (applied per file)

| Stage | Action | Idempotency check | Failure handling |
|---|---|---|---|
| **S0: Inventory** | Query all rows where `gcs_path LIKE '{legacyRoot}%'` | Read-only; run any time | None |
| **S1: Copy** | `bucket.copy(legacyPath, newAdminPath)` | Check if destination already exists in GCS — skip if present | Log failure; continue with next file; retry on re-run |
| **S2: Verify** | Compute SHA-256 of source and destination; assert match | Idempotent — re-run re-verifies | Mismatch: delete destination, re-copy on next run |
| **S3: Update DB** | `UPDATE ... SET gcs_path = newAdminPath WHERE gcs_path = legacyPath` | If `gcs_path` already equals `newAdminPath`, row is already migrated — skip | DB error: retry; do not delete source |
| **S4: Delete source** | `bucket.delete(legacyPath)` | Check if source still exists before deleting — skip if already gone | Log; object can be cleaned up manually |
| **S5: Verify clean** | Query `SELECT COUNT(*) WHERE gcs_path LIKE '{legacyRoot}%'` = 0 | Final gate | Investigate any remaining rows individually |

### Phase M1 — `Business_Trips/` (75 objects)

- New template: `ADMIN/Travel/Employees/{business_trips.employee_id}/Trips/{trip_documents.trip_id}/Documents/{seq:03d}-{inferredLabel}.{ext}`
- `{seq}` assigned by ordering legacy files by `trip_documents.created_at` within each `trip_id`
- `{inferredLabel}` mapped from legacy filename heuristics at migration time; stored in DB
- Migration log tracks: `legacy_path`, `new_path`, `sha256_match`, `db_updated_at`, `source_deleted_at`

### Phase M2 — `Business_Visa/` (16 objects)

- New template: `ADMIN/Visa/Employees/{visa_records.employee_id}/Records/{visa_records.id}/001-visa-copy.{ext}`
- Create `visa_documents` table rows during S3; set `is_active = true` on each migrated row
- Legacy file URL column on `visa_records` nulled out after migration row is confirmed

---

## 6. Fix Plan — Broken Uploads

### Fix F1 — Legal Management (`legal-management-routes.ts`) — 7 submodules

All Legal uploads fail silently. Root cause: two bugs present at every call site.

**Bug 1 — Parameter order reversed** at all 7 call sites:
```
Wrong:    uploadFileToGCS(req.file.buffer, fileName, mimetype)
Correct:  uploadFileToGCS(fileName, req.file.buffer, mimetype)
```

**Bug 2 — Wrong return field access** at all 7 call sites:
```
Wrong:    result.fileName    result.publicUrl
Correct:  result.gcsPath     result.signedUrl
```

**Bug 3 — Legacy path prefix** — all 7 call sites write to non-ADMIN roots (`contracts/`, `compliance/`, `posh-cases/`, `legal-notices/`, `policy-templates/`, `nda-agreements/`, `exclusivity-agreements/`).

Fix: replace each legacy prefix with the corresponding `ADMIN/Legal/{Module}/{entityId}/{seq:03d}-{label}.{ext}` construction.

After all three fixes at all 7 call sites, add `assertAdminGcsPath()` immediately before each `bucket.file(path)` call.

### Fix F2 — Visa Secondary Upload (`visa-management-routes.ts:836`)

**Bug**: `file.makePublic()` unconditionally throws against `publicAccessPrevention: enforced` bucket.

Fix: Remove the `file.makePublic()` call entirely. Return file access via `gcsFile.getSignedUrl()` — identical to how the primary visa upload already works.

**Additional**: Update secondary upload path from `visa-documents/{visaRecordId}/` to `ADMIN/Visa/Employees/{employeeId}/Records/{visaRecordId}/{seq:03d}-{label}.{ext}` with concurrency-safe `{seq}` assignment and `assertAdminGcsPath()` call.

---

## 7. Guardrails Design — `server/admin-guardrails.ts`

### Function signature

```typescript
export function assertAdminGcsPath(path: string): void
// Throws AdminGcsPathViolation if path is not a valid ADMIN/ path.
// Called immediately before every bucket.file(path) call in all admin route files.
```

### Allowed path prefixes (pass without error)

```
ADMIN/Travel/Employees/{id}/Trips/{id}/Documents/
ADMIN/Travel/Employees/{id}/Trips/{id}/Expenses/{id}/
ADMIN/Visa/Employees/{id}/Records/{id}/
ADMIN/Legal/Contracts/{id}/
ADMIN/Legal/Compliance/{id}/
ADMIN/Legal/Posh/{id}/
ADMIN/Legal/Notices/{id}/
ADMIN/Legal/PolicyTemplates/{id}/
ADMIN/Legal/NDA/{id}/
ADMIN/Legal/Exclusivity/{id}/
ADMIN/Leave/Requests/{id}/
ADMIN/Payroll/Payslips/{id}/{id}/
ADMIN/Payroll/Loans/{id}/
ADMIN/Payroll/Advances/{id}/
ADMIN/Payroll/TaxProofs/{id}/{id}/
ADMIN/Statutory/Challans/{id}/
ADMIN/Statutory/AdvanceTax/{id}/
ADMIN/Appraisals/Cycles/{id}/Records/{id}/
```

`{id}` matches `/^[\w-]+$/` — alphanumeric, hyphens, underscores only. Covers numeric serials and UUIDs.

### Blocked prefixes (throw `AdminGcsPathViolation`)

```
Business_Trips/
Business_Visa/
visa-documents/
contracts/
compliance/
posh-cases/
legal-notices/
policy-templates/
nda-agreements/
exclusivity-agreements/
```

Also throws for any `ADMIN/` path whose variable segment contains:
- A space character
- A capital-then-lowercase pattern consistent with a person's name
- Any segment that does not match a recognised module prefix

---

## 8. DB Schema Changes

| Table | Change | Type | Required by path # |
|---|---|---|---|
| `trip_documents` | Add `gcs_path TEXT`, `seq INT`, `label VARCHAR(50)`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`, `deleted_at TIMESTAMP`. UNIQUE(`trip_id`, `seq`). | Alter | 1 |
| `trip_expenses` | Rename `receipt_url` → `receipt_gcs_path TEXT`. Add `receipt_locked BOOLEAN DEFAULT false`. | Alter | 2 |
| `visa_records` | Null out legacy file URL column after migration (keep column, do not drop) | Alter | 3 |
| **New** `visa_documents` | `id SERIAL PK`, `visa_record_id INT FK visa_records.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50)`, `is_active BOOLEAN DEFAULT true`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP NOT NULL`, `superseded_at TIMESTAMP`. UNIQUE(`visa_record_id`, `seq`). | New table | 3 |
| **New** `contract_documents` | `id SERIAL PK`, `contract_id INT FK contracts.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`contract_id`, `seq`). | New table | 4 |
| `compliance_register` | Add `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`. | Alter | 5 |
| **New** `posh_documents` | `id SERIAL PK`, `case_id INT FK posh_cases.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`case_id`, `seq`). | New table | 6 |
| **New** `notice_documents` | `id SERIAL PK`, `notice_id INT FK legal_notices.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`notice_id`, `seq`). | New table | 7 |
| `policy_templates` | Add `gcs_path TEXT`, `version_number INT`, `effective_date DATE`, `is_active BOOLEAN DEFAULT false`, `activated_by INT FK`, `activated_at TIMESTAMP`. | Alter | 8 |
| `nda_agreements` | Add `draft_gcs_path TEXT`, `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`. | Alter | 9 |
| `exclusivity_agreements` | Add `draft_gcs_path TEXT`, `gcs_path TEXT`, `file_locked BOOLEAN DEFAULT false`. | Alter | 10 |
| `leave_requests` | Rename `attachment_url` → `attachment_gcs_path TEXT`. Add `attachment_locked BOOLEAN DEFAULT false`. | Alter | 11 |
| `payroll_records` | Add `payslip_gcs_path TEXT`, `payslip_generated_at TIMESTAMP`. | Alter | 12 |
| **New** `loan_documents` | `id SERIAL PK`, `loan_id INT FK employee_loans.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`loan_id`, `seq`). | New table | 13 |
| **New** `advance_documents` | `id SERIAL PK`, `advance_id INT FK employee_advances.id`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP`. UNIQUE(`advance_id`, `seq`). | New table | 14 |
| `employee_investment_proofs` | Rename `proof_document_key` → `proof_gcs_path TEXT`. Add `file_locked BOOLEAN DEFAULT false`. | Alter | 15 |
| `statutory_challans` | Rename `ecr_file_key` → `ecr_gcs_path TEXT`. Add `challan_pdf_gcs_path TEXT`, `payment_receipt_gcs_path TEXT`. | Alter | 16 |
| `advance_tax_payments` | Add `challan_gcs_path TEXT`. | Alter | 17 |
| `employee_appraisals` | Add `letter_gcs_path TEXT`, `letter_generated_at TIMESTAMP`. | Alter | 18 |

---

## 9. Implementation Phases

### Phase 1 — Critical Bug Fixes

These fix active data loss — zero Legal files are being stored today.

| Step | Action | Files |
|---|---|---|
| 1.1 | Fix `uploadFileToGCS` parameter order at all 7 Legal call sites | `legal-management-routes.ts` |
| 1.2 | Fix return field access (`result.gcsPath`, `result.signedUrl`) at all 7 call sites | `legal-management-routes.ts` |
| 1.3 | Replace 7 legacy Legal path prefixes with `ADMIN/Legal/{Module}/{entityId}/` | `legal-management-routes.ts` |
| 1.4 | Remove `makePublic()` from Visa secondary upload; fix path prefix | `visa-management-routes.ts` |
| 1.5 | Add `assertAdminGcsPath()` before all GCS writes in patched files | `admin-guardrails.ts` + route files |

### Phase 2 — Schema Changes for Active and Broken Modules

| Step | Action |
|---|---|
| 2.1 | Add `gcs_path`, `seq`, `label`, `uploaded_by`, `uploaded_at`, `deleted_at` to `trip_documents`. UNIQUE(`trip_id`, `seq`). |
| 2.2 | Create `visa_documents` table |
| 2.3 | Create `contract_documents`, `posh_documents`, `notice_documents` tables |
| 2.4 | Add `gcs_path`, `file_locked` to `compliance_register`, `nda_agreements`, `exclusivity_agreements` |
| 2.5 | Add policy versioning columns to `policy_templates` |
| 2.6 | Run `npm run db:push` |

### Phase 3 — Migration (Staged, Idempotent)

| Step | Action |
|---|---|
| 3.1 | Write migration script: `Business_Trips/` → `ADMIN/Travel/Employees/…` (S0–S5) |
| 3.2 | Write migration script: `Business_Visa/` → `ADMIN/Visa/Employees/…` (S0–S5) |
| 3.3 | Run migrations in staging; verify SHA-256; confirm zero legacy-root rows remain |
| 3.4 | Run in production |
| 3.5 | Deploy guardrail blocking all legacy Admin roots |

### Phase 4 — Future Path Enablement

Implemented when each feature is built — not before.

| Step | Path | Trigger |
|---|---|---|
| 4.1 | `ADMIN/Travel/.../Expenses/` | Expense receipt upload UI |
| 4.2 | `ADMIN/Leave/Requests/` | Leave attachment UI |
| 4.3 | `ADMIN/Payroll/Payslips/` | Payslip persistence requirement |
| 4.4 | `ADMIN/Payroll/TaxProofs/` | HR proof-review workflow |
| 4.5 | `ADMIN/Payroll/Loans/` + `Advances/` | Loan/advance document UI |
| 4.6 | `ADMIN/Statutory/Challans/` | Statutory filing workflow |
| 4.7 | `ADMIN/Statutory/AdvanceTax/` | Advance tax challan capture |
| 4.8 | `ADMIN/Appraisals/` | Appraisal letter generation |

---

## 10. Migration Completed

| Field | Value |
|---|---|
| **Date** | 2026-04-14 |
| **Total files migrated** | 90 |
| **Trip files (M1)** | 75 — `Business_Trips/` → `ADMIN/Travel/Employees/{empId}/Trips/{tripId}/Documents/{seq:03d}-{label}.{ext}` |
| **Visa files (M2)** | 15 — `Business_Visa/` → `ADMIN/Visa/Employees/{empId}/Records/{visaRecordId}/001-visa-copy.{ext}` |
| **Checksum verified** | Yes — MD5 source = MD5 destination for all 90 files; 0 mismatches |
| **Legacy roots eliminated** | Yes — 0 rows remain at `Business_Trips/` or `Business_Visa/` prefixes in any DB table |
| **Migration log** | `gcs_migration_log` — 90 rows, all `stage = done` |
| **DB rows updated** | 75 `trip_documents` + 15 `visa_records` + 15 `visa_documents` (new child rows, `seq=1`, `is_active=true`) |
| **Source objects deleted** | 90 — all legacy GCS objects removed in stage S4 after DB update confirmed |
| **Script** | `scripts/migrate-admin-gcs.ts` — 5-stage idempotent protocol (S0 inventory → S1 copy → S2 MD5 verify → S3 DB update → S4 delete) |
| **Seq collision repair** | Trip 11 seq collision repaired by `scripts/fix-trip11-seq.ts` (one-time, documented, completed) |
| **Plan count discrepancy** | Plan estimated 16 visa files; actual DB contained 15. 13 additional `visa_records` rows have NULL `file_path` (documents never uploaded — confirmed pre-existing, not migration loss). |

**Status: IMPLEMENTED (Rev 2)**
