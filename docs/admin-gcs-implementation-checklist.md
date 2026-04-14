# Administration GCS Implementation Checklist

| Field | Value |
|---|---|
| **Plan reference** | `docs/admin-gcs-remediation-plan-v2.md` (Rev 2 — Approved Baseline) |
| **Scope** | Administration Module GCS remediation and document control |
| **Root** | `ADMIN/` |
| **Date created** | 2026-04-14 |
| **Phase 1** | ✅ COMPLETE — 2026-04-14 |
| **Phase 2** | ✅ COMPLETE — 2026-04-14 |
| **Phase 3 (Migration)** | ✅ COMPLETE — 2026-04-14 — 90 files migrated (75 trip + 15 visa), 0 legacy roots remaining |
| **Overall status** | **IMPLEMENTED (Rev 2)** |

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

> Phase 3A complete (2026-04-14): All route-level seq allocation is wired. Zero TEMP-P2 markers remain in server code.
> Phase 1 may now be marked complete by the user.

| Item | Module(s) | Schema blocker | Schema status | Route status |
|------|-----------|---------------|--------------|--------------|
| Concurrency-safe seq on upload | Contracts, POSH, Notices | `contract_documents`, `posh_documents`, `notice_documents` | ✅ Tables created (Phase 2) | ✅ **DONE (Phase 3A)** — `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE` + INSERT child row in `db.transaction()` |
| PolicyTemplates seq | PolicyTemplates | `version_number` column + `doc_is_active` | ✅ Columns added (Phase 2) | ✅ **DONE (Phase 3A)** — `SELECT COALESCE(version_number,0)+1 FOR UPDATE` on parent row; `doc_is_active=false` on upload |
| Visa renewal seq | Visa | `visa_documents` child table | ✅ Table created (Phase 2) | ✅ **DONE (Phase 3A)** — `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE` + INSERT `visa_documents`; prior rows `is_active=false, superseded_at=NOW()` on update/legacy |
| Trip document seq | Trip | `seq` column on `trip_documents` | ✅ Column added (Phase 2) | ✅ **DONE (Phase 3A)** — `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE` on `trip_documents` per `trip_id` |

---

## Phase 2 — Schema Changes ✅ DONE 2026-04-14

> Adds columns and child tables required by both active/broken modules (Phase 1) and migration (Phase 3).
> Applied directly via SQL (db:push times out on schema this large — used executeSql instead).

### 2.1 `trip_documents` table changes ✅ DONE 2026-04-14

- [x] Add column `seq INT` (nullable; existing rows keep NULL)
- [x] Add column `label VARCHAR(50)` (nullable)
- [x] `uploaded_by INT` — already present
- [x] `uploaded_at TIMESTAMP` — already present
- [x] Add column `deleted_at TIMESTAMP` (soft-delete)
- [x] UNIQUE INDEX `trip_documents_trip_id_seq_idx` ON (`trip_id`, `seq`)

**Validation confirmed**: All 4 new columns present. UNIQUE INDEX confirmed via `pg_indexes`.
**Next**: Update `uploadTripDocument` to use `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE`; remove `[TEMP-P2]`.

---

### 2.2 Create `visa_documents` table ✅ DONE 2026-04-14

- [x] `id SERIAL PRIMARY KEY`
- [x] `visa_record_id INT NOT NULL` (FK → `visa_records.id`, CASCADE)
- [x] `gcs_path TEXT NOT NULL`
- [x] `seq INT NOT NULL`
- [x] `label VARCHAR(50)` (nullable)
- [x] `is_active BOOLEAN NOT NULL DEFAULT true`
- [x] `uploaded_by INT` (FK → `users.id`)
- [x] `uploaded_at TIMESTAMP NOT NULL DEFAULT NOW()`
- [x] `superseded_at TIMESTAMP` (nullable)
- [x] UNIQUE INDEX `visa_documents_visa_record_id_seq_idx` ON (`visa_record_id`, `seq`)

**Validation confirmed**: Table and index exist.
**Next**: Update all three visa upload flows to use `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE`; remove `[TEMP-P2]`.

---

### 2.3 Create Legal child tables ✅ DONE 2026-04-14

- [x] `contract_documents` (FK → `contracts.id` CASCADE) — UNIQUE(`contract_id`, `seq`)
- [x] `posh_documents` (FK → `posh_cases.id` CASCADE) — UNIQUE(`case_id`, `seq`)
- [x] `notice_documents` (FK → `legal_notices.id` CASCADE) — UNIQUE(`notice_id`, `seq`)

Each table: `id SERIAL PK`, `{parent}_id INT NOT NULL FK`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP NOT NULL`.

**Validation confirmed**: All 3 tables and 3 UNIQUE indexes exist.
**Next**: Update Contracts, POSH, Notices upload routes to use `SELECT COALESCE(MAX(seq),0)+1 FOR UPDATE`; remove `[TEMP-P2]`.

---

### 2.4 Add columns to Legal parent tables ✅ DONE 2026-04-14

- [x] `compliance_register`: `gcs_path TEXT`, `file_locked BOOLEAN NOT NULL DEFAULT false`
- [x] `nda_agreements`: `draft_gcs_path TEXT`, `executed_gcs_path TEXT`, `file_locked BOOLEAN NOT NULL DEFAULT false`
- [x] `exclusivity_agreements`: `draft_gcs_path TEXT`, `executed_gcs_path TEXT`, `file_locked BOOLEAN NOT NULL DEFAULT false`

**Validation confirmed**: All columns present with correct defaults.

---

### 2.5 Add policy versioning columns ✅ DONE 2026-04-14

- [x] `policy_templates`: `gcs_path TEXT`, `version_number INT`, `doc_is_active BOOLEAN NOT NULL DEFAULT false`, `activated_by INT FK users.id`, `activated_at TIMESTAMP`

> Note: `effective_date` already existed on this table (`effectiveDate` Drizzle field). Column not added again.
> Column name is `doc_is_active` (not `is_active`) to avoid ambiguity with approval-status semantics.

**Validation confirmed**: All 5 new columns present with correct defaults.

---

### 2.6 Create Payroll child tables ✅ DONE 2026-04-14

- [x] `loan_documents` (FK → `employee_loans.id` CASCADE) — UNIQUE(`loan_id`, `seq`)
- [x] `advance_documents` (FK → `employee_advances.id` CASCADE) — UNIQUE(`advance_id`, `seq`)

Each table: `id SERIAL PK`, `{parent}_id INT NOT NULL FK`, `gcs_path TEXT NOT NULL`, `seq INT NOT NULL`, `label VARCHAR(50) NOT NULL`, `uploaded_by INT FK`, `uploaded_at TIMESTAMP NOT NULL`.

**Validation confirmed**: Both tables and 2 UNIQUE indexes exist.

---

### 2.7 Schema application method

- [x] `npm run db:push` attempted — timed out (schema too large for drizzle-kit diff within 2 min limit)
- [x] Applied directly via SQL (`ALTER TABLE … ADD COLUMN IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`)
- [x] Drizzle TypeScript schema (`shared/schema.ts`) updated to match — all new tables and columns declared
- [x] Server restarted after schema changes — boots clean, zero TypeScript errors, zero runtime errors

---

## Phase 3 — Migration ✅ DONE 2026-04-14

> Move 90 live legacy files (75 Travel + 15 Visa) to new ADMIN paths.
> Migration executed live (not a separate staging environment — single production DB/bucket).

### 3.1 Migration script — Travel documents ✅ DONE 2026-04-14

- [x] Script: `scripts/migrate-admin-gcs.ts` (combined Travel + Visa)
- [x] 5-stage protocol: S0 Inventory → S1 Copy → S2 Verify MD5 → S3 Update DB → S4 Delete source
- [x] Per-stage idempotency: re-run skips done files, resumes from last logged stage
- [x] Migration log: `gcs_migration_log` table tracks per-file `legacy_path`, `new_path`, `checksum_source`, `checksum_dest`, `checksum_match`, `db_updated_at`, `source_deleted_at`, `stage`
- [x] New path: `ADMIN/Travel/Employees/{employee_id}/Trips/{trip_id}/Documents/{seq:03d}-{label}.{ext}`
- [x] seq assigned by `ROW_NUMBER() OVER (PARTITION BY trip_id ORDER BY uploaded_at, id)` over ALL rows (stable across partial runs)
- [x] Label mapped from `document_type`: `travel_booking`→`travel-booking`, `hotel_confirmation`→`hotel-confirmation`, `visa_documents`→`visa-copy`, `meeting_invitation`→`invitation-letter`

**Result**: 75/75 trip_documents migrated. 0 remaining at `Business_Trips/`. All MD5 checksums matched. 0 failures.

---

### 3.2 Migration script — Visa documents ✅ DONE 2026-04-14

- [x] Script: `scripts/migrate-admin-gcs.ts` (same combined script, M2 section)
- [x] Same 5-stage protocol
- [x] New path: `ADMIN/Visa/Employees/{employee_id}/Records/{visa_record_id}/001-visa-copy.{ext}`
- [x] `visa_documents` row inserted (seq=1, is_active=true) during S3 via `ON CONFLICT DO UPDATE`
- [x] `visa_records.file_path` updated to new ADMIN path; `file_url` updated to new 1-year signed URL

**Result**: 15/15 visa_records migrated. 0 remaining at `Business_Visa/`. All MD5 checksums matched. visa_documents: 15 rows, all is_active=true, all seq=1.

---

### 3.3 Final verification ✅ DONE 2026-04-14

- [x] `SELECT COUNT(*) FROM trip_documents WHERE file_path NOT LIKE 'ADMIN/%'` = **0**
- [x] `SELECT COUNT(*) FROM visa_records WHERE file_path NOT LIKE 'ADMIN/%'` = **0**
- [x] `SELECT COUNT(*) FROM gcs_migration_log WHERE stage != 'done'` = **0**
- [x] `SELECT COUNT(*) FROM gcs_migration_log WHERE checksum_match = false` = **0**
- [x] `SELECT COUNT(*) FROM trip_documents WHERE seq IS NULL` = **0**
- [x] `SELECT COUNT(*) FROM trip_documents WHERE label IS NULL` = **0**
- [x] `SELECT COUNT(*) FROM visa_documents WHERE is_active = true` = **15** (all active)

---

### 3.4 Seq collision repair (trip 11) ✅ DONE 2026-04-14

A seq ROW_NUMBER() bug in run 2 (computed over remaining rows only) caused rows 25 and 26 in trip 11 to receive wrong seq values (2 and 3 instead of 3 and 4). Repaired by:
- `scripts/fix-trip11-seq.ts`: GCS-copied to correct paths, DB updated in correct order (26→4 first, then 25→3), wrong-numbered objects deleted, orphaned hotel-confirmation objects deleted.
- Main script fixed to compute seq over ALL rows per trip (via CTE over all file_path NOT NULL rows before outer filter).

---

### 3.5 Guardrails ✅ ALREADY ACTIVE (Phase 1 / Phase 3A)

- [x] `assertAdminGcsPath()` active in all three admin route files (trip, visa, legal)
- [x] Blocks all legacy prefixes (`Business_Trips/`, `Business_Visa/`, `contracts/`, etc.)

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
| `Business_Trips/` | 75 | `ADMIN/Travel/Employees/{id}/Trips/{id}/Documents/` | ✅ Migrated — Phase 3 — 2026-04-14 |
| `Business_Visa/` | 15 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | ✅ Migrated — Phase 3 — 2026-04-14 |
| `contracts/` | 0 | `ADMIN/Legal/Contracts/{id}/` | Fixed Phase 1 |
| `compliance/` | 0 | `ADMIN/Legal/Compliance/{id}/` | Fixed Phase 1 |
| `posh-cases/` | 0 | `ADMIN/Legal/Posh/{id}/` | Fixed Phase 1 |
| `legal-notices/` | 0 | `ADMIN/Legal/Notices/{id}/` | Fixed Phase 1 |
| `policy-templates/` | 0 | `ADMIN/Legal/PolicyTemplates/{id}/` | Fixed Phase 1 |
| `nda-agreements/` | 0 | `ADMIN/Legal/NDA/{id}/` | Fixed Phase 1 |
| `exclusivity-agreements/` | 0 | `ADMIN/Legal/Exclusivity/{id}/` | Fixed Phase 1 |
| `visa-documents/` | 0 | `ADMIN/Visa/Employees/{id}/Records/{id}/` | Fixed Phase 1 |
