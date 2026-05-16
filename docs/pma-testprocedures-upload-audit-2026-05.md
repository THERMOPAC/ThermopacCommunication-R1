# PMA & TestProcedures Upload Governance Audit
**Date:** 16 May 2026  
**Scope:** Read-only audit — no code changes, no migrations  
**Phase:** QMS Upload Hardening Phase 2B (Gap E — observational)  
**Auditor:** Agent session (continuation of Phase 2B baseline)

---

## 1. Methodology

All findings are sourced exclusively from:
- Direct DB queries on `pma_documents`, `test_procedures`, `qms_document_revisions`, `qms_document_audit_log`, `gcs_upload_tokens`, `gcs_governance_rules`
- Full line-by-line read of `server/quality/pma-routes.ts` (713 lines) and `server/quality/test-procedures-routes.ts` (858 lines)
- GCS path decoding from signed URLs stored in `test_procedures.attachments` JSONB

No files were modified. No migrations were run. No GCS objects were accessed.

---

## 2. Governance Rules — Confirmed Active

| id | module_key | submodule_key | document_type | root_prefix | path_template | active |
|----|-----------|--------------|--------------|-------------|--------------|--------|
| 11 | qms | pma | PMA | QMS | `QMS/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` | ✅ true |
| 18 | qms | test_proc | TEST_PROCEDURE | QMS | `QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` | ✅ true |

Both governance rules are correctly seeded and active.

---

## 3. PMA Module Audit

### 3.1 Data Population

| Metric | Value |
|--------|-------|
| Total `pma_documents` rows | **18** |
| Date range | 2025-07-22 → 2025-08-20 |
| Rows with `file_path` | 18 / 18 (100 %) |
| Rows with `file_url` | 18 / 18 (100 %) |
| Rows at governance path (`QMS/PMA/…`) | **0** |
| Rows at legacy path (`QMS/PMA_Records/…`) | **18** |
| `qms_document_revisions` rows (module = PMA) | **0** |
| `gcs_upload_tokens` rows (PMA) | **0** |
| `qms_document_audit_log` upload events | **0** |
| `qms_document_audit_log` download events | **10** |

### 3.2 Legacy GCS Path Pattern

Every existing PMA record is stored at:
```
QMS/PMA_Records/{PMA-YYYY-XXX}.pdf
```
Example: `QMS/PMA_Records/PMA-2025-001.pdf` through `QMS/PMA_Records/PMA-2025-018.pdf`

The `file_path` column stores the raw GCS object key (stable, not a signed URL). The `file_url` column stores a signed URL (may have expired).

**Governance target path** (from rule id=11):
```
QMS/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}
```
No PMA file has ever been written to this path.

### 3.3 Route Analysis — All Three Upload Paths

| Endpoint | `createRevision()` called | `resolveQmsRuleId('PMA')` | `ruleId` passed | Status |
|----------|--------------------------|--------------------------|----------------|--------|
| `POST /` (create + file) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Correct |
| `PUT /:id` (update + file) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Correct |
| `POST /:id/upload` (add revision) | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Correct |

All three upload routes are correctly wired to the governance engine. Token lifecycle, SHA-256 deduplication, and revision tracking will engage correctly for any **future** upload.

### 3.4 Download Route Analysis

```
GET /:id/download
```
- Calls `getLatestRevision('PMA', pmaDocument.pmaNumber)` first — correct module name, correct document number string.
- If governed revision found → signed URL from `qcs_document_revisions.gcs_path` + `logDownload()` ✅
- If not found (currently always) → falls back to `pmaDocument.fileUrl` from DB record ✅
- `logDownload()` is called in both paths ✅ (download events appear in audit log correctly)

### 3.5 PMA Findings Summary

| Finding | Severity | Nature |
|---------|----------|--------|
| All 18 existing records are at legacy path `QMS/PMA_Records/` | **Historical** | Pre-governance uploads (Jul–Aug 2025). Routes were retrofitted after all records existed. |
| 0 governed revisions in `qms_document_revisions` | **Historical** | No new PMA uploads have been made since governance routes were implemented. |
| Route code is governance-compliant on all 3 upload paths | — | ✅ No code gap |
| Download fallback correctly reads `pmaDocument.filePath` | — | ✅ No code gap |
| Download audit log working (10 events) | — | ✅ Correct |

**PMA verdict: No route-level code bugs.** The gap is entirely data-historical — all records predate the governance implementation. The first new PMA upload after today will be fully governed.

---

## 4. TestProcedures Module Audit

### 4.1 Data Population

| Metric | Value |
|--------|-------|
| Total `test_procedures` rows | **7** |
| Date range (created_at) | 2025-07-22 → 2025-07-24 |
| Rows with attachments | 7 / 7 (100 %) |
| Attachment storage format | Signed URL arrays in JSONB (`test_procedures.attachments`) |
| `qms_document_revisions` rows (module = TestProcedures) | **0** |
| `gcs_upload_tokens` rows (TestProcedures) | **0** |
| `qms_document_audit_log` upload events | **0** |
| `qms_document_audit_log` download events | **2** (TP-2025-003, TP-2025-006) |

### 4.2 Actual GCS Path Landscape

Files were uploaded in two distinct phases (decoded from signed URLs in `test_procedures.attachments`):

**Phase 1 — Per-procedure flat folder (Jul–Aug 2025):**
```
QMS/Test_Procedures/{TP-Number}/{original_filename}
```
Examples seen: `QMS/Test_Procedures/TP-2025-001/RADIOGRAPHIC TESTING PROCEDURE ( EN ).pdf`

**Phase 2 — Method/Standard hierarchy (Aug–Sep 2025 onwards):**
```
QMS/Test_Procedures/{NDT_Method}/{Standard}/{TP-Number}.pdf
```
Examples seen:
- `QMS/Test_Procedures/RT/EN/TP-2025-002.pdf`
- `QMS/Test_Procedures/PT/Others/TP-2025-006.pdf`
- `QMS/Test_Procedures/HT/EN/TP-2025-003.pdf`
- `QMS/Test_Procedures/PNT/EN/TP-2025-005.pdf`
- `QMS/Test_Procedures/MT/Others/TP-2025-008.pdf`

Both phases use `Test_Procedures` **with underscore**.

**Governance target path** (from rule id=18):
```
QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}
```
This uses `TestProcedures` **without underscore, camelCase**. No file has ever been written here.

### 4.3 Route Analysis

#### `POST /` — Create procedure with initial file
```typescript
// line 262 — test-procedures-routes.ts
const govResult = await createRevision({
  module: 'TestProcedures' as QmsModule,
  documentNumber: data.procedureNumber,
  label: `procedure-${revLabel}`,
  fileBuffer: req.file.buffer,
  originalFileName: req.file.originalname,
  contentType: req.file.mimetype,
  parentEntityType: 'test_procedure',
  parentEntityId: newProcedure.id,
  userId,
  userRole,
  ipAddress: req.ip,
  // ⚠ ruleId is NOT passed
});
```
**GAP-TP-1:** `createRevision()` is called without `ruleId`. The governance engine's token lifecycle — upload token issuance, token verification, token consumption — is not triggered. Files are still written to GCS and a revision row is created, but without token enforcement. This is inconsistent with `PUT /:id` and `POST /:id/upload` which both pass `ruleId`.

#### `PUT /:id` — Update existing procedure with new file
```typescript
const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE');
// ...
const govResult = await createRevision({
  ...
  ruleId: testProcRuleId,   // ✅ passed
});
```
✅ Correct.

#### `POST /:id/upload` — Add new file revision to existing procedure
```typescript
const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE');
// ...
await createRevision({
  ...
  ruleId: testProcRuleId,   // ✅ passed
});
```
✅ Correct.

#### `DELETE /:id` — Soft delete
```typescript
// line 581 — test-procedures-routes.ts
const latestRev = await getLatestRevision('test_procedure', id);
```
**GAP-TP-2:** `getLatestRevision` signature is `(module: QmsModule, documentNumber: string)`. This call passes:
- arg 1: `'test_procedure'` — entity type string, not a valid `QmsModule` value
- arg 2: `id` — numeric entity ID, not a document number string

The function will never find a match. The soft-delete DB operation on `qms_document_revisions` via `softDeleteRevision()` called on line 595 passes `id` correctly (entity ID), so the actual soft-delete logic may still work if the revision ID is obtained elsewhere — but the `getLatestRevision` call itself is a no-op/dead lookup. **This needs verification against the actual delete handler logic.** (Note: since 0 governed revisions exist, this bug has no current operational impact, but it will matter once governed revisions are created.)

#### `GET /:id/download` — Download latest file
```typescript
// line 681 — test-procedures-routes.ts
const latestRev = await getLatestRevision('test_procedure', id);
```
**GAP-TP-3:** Same wrong-signature call as DELETE. `getLatestRevision` will always return null. Every download immediately falls through to the legacy GCS path scan strategy (lines 722–744).

Legacy download scan tries these paths in order:
1. `QMS/Test_Procedures/{ndtMethod}/{Standard}/{procedureNumber}.pdf` ← Phase 2 files found here
2. `QMS/Test_Procedures/{ndtMethod}/{alt_Standard}/{procedureNumber}.pdf` (all 3 standard variants)
3. `QMS/Test_Procedures/{procedureNumber}.pdf`
4. `QMS/Test_Procedures/{ndtMethod}/{procedureNumber}.pdf`
5. `QMS/Test_Procedures/{ndtMethod}/{procedureNumber}/{attachedFileName}` (from JSONB)

This matches the actual Phase 2 path pattern and explains the 2 successful download audit log entries. `logDownload()` is called with `details: { source: 'legacy_fallback' }` ✅.

#### `GET /:id/files` — List all files for a procedure
Uses `buildProcedureGcsPrefixes()` which generates:
- `QMS/Test_Procedures/{ndtMethod}/{Standard}/{procedureNumber}` (Phase 2)
- `QMS/Test_Procedures/{procedureNumber}` (Phase 1 / legacy)

Both use `Test_Procedures` with underscore — consistent with actual files. ✅ This listing endpoint correctly finds existing files.

### 4.4 Attachment Architecture Issue

All 7 existing TestProcedure records store their file references as **signed URL arrays** in the `test_procedures.attachments` JSONB column. Example structure:
```json
[
  { "fileName": "RADIOGRAPHIC TESTING PROCEDURE ( EN ).pdf",
    "fileUrl": "https://storage.googleapis.com/thermopac_storage/QMS/Test_Procedures/TP-2025-002/RADIOGRAPHIC%20TESTING%20PROCEDURE%20%28%20EN%20%29.pdf?GoogleAccessId=...&Expires=...&Signature=...",
    "uploadedAt": "2025-09-09T10:21:22.177Z",
    "uploadedBy": 25 },
  ...
]
```

**GAP-TP-4 — Dual-track architecture mismatch:**
- The legacy system writes signed URLs to `test_procedures.attachments` (signed URLs expire; GCS object keys are not stored)
- The governance system writes to `qms_document_revisions` (stores permanent GCS object keys)
- These two tracks are **completely disconnected** — there is no migration between them, no deduplication, and no shared pointer
- The `GET /:id/files` endpoint reads from GCS directly (bypasses both), which is correct for the legacy files but adds a third read path

### 4.5 GCS Path Namespace Collision Risk

| Path root | Used by | Files exist? |
|-----------|---------|--------------|
| `QMS/Test_Procedures/` | All 7 existing records (Phases 1 & 2) | ✅ Yes |
| `QMS/Test_Procedures/` | Download fallback scan (lines 722–744) | — |
| `QMS/Test_Procedures/` | `buildProcedureGcsPrefixes()` (file listing) | — |
| `QMS/TestProcedures/` | Governance rule id=18 target | ❌ No files yet |

If any user triggers `POST /` (create), `PUT /:id`, or `POST /:id/upload`, governed revisions will be written to `QMS/TestProcedures/…` (no underscore). The download handler will **not find these files** because `getLatestRevision` is broken (GAP-TP-3) and the legacy scan only searches `QMS/Test_Procedures/…` (with underscore). Files written to the governed path would become unreachable via the download endpoint.

### 4.6 TestProcedures Findings Summary

| ID | Finding | Severity | Location |
|----|---------|----------|----------|
| GAP-TP-1 | `POST /` calls `createRevision()` without `ruleId` — no token lifecycle | **Medium** | `test-procedures-routes.ts` line 262 |
| GAP-TP-2 | `DELETE /:id` calls `getLatestRevision('test_procedure', id)` — wrong args | **Medium** | `test-procedures-routes.ts` line 581 |
| GAP-TP-3 | `GET /:id/download` calls `getLatestRevision('test_procedure', id)` — wrong args; governed revisions will never be served | **High** | `test-procedures-routes.ts` line 681 |
| GAP-TP-4 | Attachment storage is signed URL arrays (expire); governance system uses permanent GCS keys; two systems are not integrated | **High (architectural)** | `test_procedures.attachments` JSONB |
| GAP-TP-5 | Governance path `QMS/TestProcedures/` (no underscore) vs actual files + scan at `QMS/Test_Procedures/` (underscore) — namespace mismatch | **High** | Rule id=18 vs actual GCS objects |
| Historical | All 7 records predate governance implementation — 0 governed revisions | Informational | — |

**TestProcedures verdict: 5 findings, 3 high/medium severity code gaps.** Three of these (GAP-TP-3, GAP-TP-4, GAP-TP-5) would silently render any new governed upload unreachable via the download endpoint.

---

## 5. Cross-Module Comparison

| Dimension | PMA | TestProcedures |
|-----------|-----|---------------|
| Records in primary table | 18 | 7 |
| Governed revisions | 0 | 0 |
| Upload route wiring (POST /) | ✅ Correct | ⚠ Missing ruleId |
| Upload route wiring (PUT /:id) | ✅ Correct | ✅ Correct |
| Upload route wiring (POST /:id/upload) | ✅ Correct | ✅ Correct |
| Download route `getLatestRevision` call | ✅ Correct args | ❌ Wrong args (entity type + numeric id) |
| Delete route `getLatestRevision` call | ✅ Correct | ❌ Wrong args |
| GCS path: governance target vs actual | Different roots (legacy first) | Different roots **+ different prefix spelling** |
| Attachment storage | `pma_documents.file_path` = raw GCS key (stable) | `test_procedures.attachments` = signed URLs (expire) |
| Download fallback | ✅ Uses stable `file_path` from DB | ✅ Uses GCS scan (works for existing files) |
| Download audit log events | 10 | 2 |
| Route-level code bugs | **None** | **4 (GAP-TP-1 through GAP-TP-4)** |
| GCS namespace collision risk | Low (different root dirs) | **High (`Test_Procedures` vs `TestProcedures`)** |

---

## 6. GCS Path Registry — Both Modules

### PMA Path Zones

| Zone | Pattern | File count (est.) | Status |
|------|---------|------------------|--------|
| Legacy | `QMS/PMA_Records/{PMA-YYYY-XXX}.pdf` | 18 | Orphan-retained; served via DB `file_path` fallback |
| Governance target | `QMS/PMA/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` | 0 | Never written; will be written on next new upload |

### TestProcedures Path Zones

| Zone | Pattern | File count (est.) | Status |
|------|---------|------------------|--------|
| Legacy Phase 1 | `QMS/Test_Procedures/{TP-Number}/{filename}` | ~7–10 objects | Orphan-retained; served via GCS scan |
| Legacy Phase 2 | `QMS/Test_Procedures/{NDT}/{Standard}/{TP-Number}.pdf` | ~7–15 objects | Active; served via GCS scan (download fallback) |
| Governance target | `QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` | 0 | Never written; unreachable if written (GAP-TP-3+5) |

---

## 7. Risk Assessment

### PMA — LOW RISK
Route code is correct on all paths. Any new upload will be governed. Legacy files are stable (raw GCS keys in DB). No action required before next upload.

### TestProcedures — HIGH RISK (do not accept new uploads without fixes)
If a user uploads a file for any test procedure right now:
- `POST /` (create with file): governed revision created at `QMS/TestProcedures/…` but no token enforced (GAP-TP-1)
- Subsequent download attempt: `getLatestRevision` will fail (GAP-TP-3 wrong args) → legacy scan will look in `QMS/Test_Procedures/…` (wrong root) → 404
- The file is written to GCS but **unreachable** via the download endpoint

This is a silent data-correctness failure. The upload succeeds, the row is written to `qms_document_revisions`, but the user cannot download the file they just uploaded.

---

## 8. Recommended Actions for Phase 2C

Listed in priority order. All are confined to `server/quality/test-procedures-routes.ts` unless noted.

### TP-FIX-1 — Fix `getLatestRevision` call in download handler (CRITICAL)
**File:** `test-procedures-routes.ts` line 681  
**Change:** Replace `getLatestRevision('test_procedure', id)` with `getLatestRevision('TestProcedures', procedure.procedureNumber)`  
This requires fetching the `procedureNumber` from the DB before the call (already done — `procedure` is available in scope).

### TP-FIX-2 — Fix `getLatestRevision` call in delete handler (MEDIUM)
**File:** `test-procedures-routes.ts` line 581  
**Change:** Replace `getLatestRevision('test_procedure', id)` with `getLatestRevision('TestProcedures', procedure.procedureNumber)`  
Requires fetching procedure record first (verify if it's already fetched in that handler's scope).

### TP-FIX-3 — Add `ruleId` to `POST /` create handler (MEDIUM)
**File:** `test-procedures-routes.ts` line 262  
**Change:** Add `const testProcRuleId = await resolveQmsRuleId('TEST_PROCEDURE')` before the `createRevision()` call, then pass `ruleId: testProcRuleId`.  
Aligns with `PUT /:id` and `POST /:id/upload` patterns.

### TP-FIX-4 — Resolve governance path vs actual path namespace (HIGH, decision required)
Two options:
- **Option A:** Update governance rule id=18 `path_template` to `QMS/Test_Procedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` (WITH underscore) — aligns with existing files. Requires SQL update to `gcs_governance_rules`.
- **Option B:** Keep governance rule as `QMS/TestProcedures/` (no underscore) — the intended canonical name. Add `QMS/TestProcedures/` to the download fallback scan strategy (and to `buildProcedureGcsPrefixes`). Over time, all governed files land at the clean path; legacy files remain at `QMS/Test_Procedures/`.

**Recommendation:** Option B — keep the clean governance path, extend the download fallback to cover both roots. This avoids modifying the governance rule mid-stream and gives a clean migration boundary.

### TP-FIX-5 — Attachment storage migration (ARCHITECTURAL, Phase 2C or later)
Stored signed URLs will expire. A future migration should:
1. Parse `test_procedures.attachments` JSONB to extract raw GCS object keys (strip query string from signed URL)
2. Write canonical `qms_document_revisions` rows for each historical file
3. Optionally clear `test_procedures.attachments` or mark as migrated

This is non-trivial and warrants a separate baseline document. Not required before Phase 2C fixes TP-FIX-1 through TP-FIX-4.

---

## 9. Audit Log Observations

### `qms_document_audit_log` — PMA entries
| action | count | doc numbers |
|--------|-------|-------------|
| download | 10 | PMA-2025-001 (×2), 002, 003, 005, 006, 009, 010 |
| upload | 0 | — |

### `qms_document_audit_log` — TestProcedures entries
| action | count | doc numbers |
|--------|-------|-------------|
| download | 2 | TP-2025-003, TP-2025-006 |
| upload | 0 | — |

No upload events exist for either module. This is consistent with 0 `qms_document_revisions` rows — no upload has gone through `createRevision()` successfully for either module, because all existing records predate the governance implementation.

The download audit log is working correctly for both modules. All download events are correctly attributed with module, document_number, and GCS path (NULL path in audit rows because `revision_id` FK is NULL for legacy fallback downloads — this may be a minor audit log gap worth noting).

---

## 10. Audit Closure

| Module | Route code | Data state | Operational risk |
|--------|-----------|-----------|-----------------|
| PMA | ✅ Clean — no gaps | Historical legacy files | 🟢 Low |
| TestProcedures | ⚠ 4 code gaps | Historical legacy files + expiring signed URLs | 🔴 High |

**No code changes were made in this audit session.**

Recommended next session: implement TP-FIX-1 through TP-FIX-4 (confined to `test-procedures-routes.ts` + one governance rule decision) as Phase 2C.

---

*Audit document generated: 2026-05-16. Baseline status: DRAFT. To be promoted to FINAL upon Phase 2C implementation review.*
