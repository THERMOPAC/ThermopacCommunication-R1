# QMS Upload Hardening — Phase 2B Baseline v1.0

**Status:** PLANNING ONLY — no implementation  
**Date:** 2026-05-16  
**Scope:** `server/quality/` upload routes × `server/utils/qms-file-governance.ts`  
**Constraint:** QMS `transitional` GCS root unchanged — no path migrations, no DB migrations, no route rewrites, no frontend changes.

---

## 1. Executive Summary

Phase 2B connects the five QMS upload modules (WPQR, PMA, Test Procedures, Calibration, Welder Certificates) to the `gcs_governance_rules` / `gcs_upload_tokens` token framework that was piloted in Phase 2A (BRC Finance). After Phase 2B, every file uploaded through a QMS route will be tied to a specific governance rule ID, appear in the GCS Governance Dashboard token ledger, and have its GCS path locked by the server — never derived from client input.

The key architectural difference from BRC Phase 2A: **QMS paths are already server-generated** (clients never propose a path). Therefore, Phase 2B does NOT require a two-step client round-trip (token-request → upload). Instead, the token is issued and consumed **within the same server-side request** — an "internal single-request token flow". The result is identical governance traceability with zero frontend changes.

---

## 2. What Changes vs. What Stays the Same

### Changes
| Area | Before | After |
|---|---|---|
| Path generation | `generateQmsPath()` in `qms-file-governance.ts` (standalone) | Path resolved from `gcs_governance_rules.path_template` via `issueUploadToken()` |
| Token ledger | Not present — QMS uploads invisible to governance dashboard | Each upload issues + consumes 1 token → appears in `gcs_upload_tokens` |
| Rule linkage | None — `createRevision()` doesn't know about `ruleId` | `createRevision()` (or a new wrapper) resolves ruleId before uploading |
| WPQR legacy fallback | `catch (govErr) { uploadFileToGCS('/QMS/WPQR/{id}.pdf') }` | Removed — governance error → 500 (no silent bypass) |
| Calibration silent fallback | `catch { /* swallowed, instrument created without cert path */ }` | Swallowed error surfaced as 500 |
| Governance rule path templates | `WELDER_CERT` template says `QMS/WelderCertificates/...` — mismatches actual paths | Template corrected to `QMS/WelderManagement/...` (see §4.3) |

### Stays the Same
- All GCS paths (no files moved, no paths changed)
- `qms_document_revisions` table and all existing revision records
- `qms_document_audit_log` table
- All API request/response shapes
- All frontend components and hooks
- `checkUploadPermission()` / `checkDeletePermission()` role logic
- SHA-256 checksum verification in `createRevision()`
- Revision history (`getRevisionHistory()`, `getLatestRevision()`)

---

## 3. Background: How the Two Systems Work Today

### 3.1 `qms-file-governance.ts` — `createRevision()` flow

```
POST /api/quality/{module}  (with multer file)
  │
  ├── checkUploadPermission(userRole)           ← role gate
  ├── computeChecksum(buffer)                    ← SHA-256 pre-upload
  ├── getNextRevisionNumber(module, docNumber)   ← DB: max rev + 1
  ├── generateQmsPath(module, docNumber, rev, seq, label, ext)
  │       → "QMS/{module}/{docNumber}/rev-{N}/{seq}-{label}.{ext}"
  ├── bucket.file(path).exists()                 ← non-destructive write guard
  ├── file.save(buffer)                          ← GCS upload
  ├── verifyUploadedChecksum(path, checksum)     ← checksum re-read from GCS
  ├── db.transaction: update prev isLatest=false, insert new revision row
  └── logAuditEvent(action:'upload'|'revision')
```

**What's missing:** no `ruleId`, no token issued, no `gcs_upload_tokens` entry.

### 3.2 BRC Phase 2A — reference token flow (for context)

```
Step 1 (client):  POST /finance/brc/upload-token  →  { rawToken, resolvedPath }
Step 2 (client):  POST /finance/brc/upload/gcs  (file + rawToken)
                    └── validateUploadToken({ rawToken, actualPath: resolvedPath })
                    └── gcsStorage.file(token.resolved_path).save(buffer)
```

BRC uses two steps because the **client supplies** the filename (invoice-specific), so the server must issue a pre-locked path that the client acknowledges before sending the bytes.

### 3.3 Phase 2B QMS — internal single-request token flow

```
POST /api/quality/{module}  (with multer file, same as today)
  │
  ├── [NEW] resolve ruleId from gcs_governance_rules
  │       WHERE module_key = 'qms' AND document_type = '{DOC_TYPE}'
  │
  ├── checkUploadPermission(userRole)
  ├── computeChecksum(buffer)
  ├── getNextRevisionNumber(module, docNumber)
  │
  ├── [NEW] issueUploadToken({ ruleId, tokenValues: { DocNumber, rev, Seq, Label, ext }, issuedTo, ttlSeconds: 60 })
  │       → resolvedPath from governance rule template
  │       → tokenId, rawToken stored in gcs_upload_tokens
  │
  ├── bucket.file(resolvedPath).exists()         ← non-destructive write guard
  ├── file.save(buffer)                          ← GCS upload to resolved path
  ├── verifyUploadedChecksum(resolvedPath, checksum)
  │
  ├── [NEW] validateUploadToken({ rawToken, actualPath: resolvedPath })
  │       → marks token as used_at = now()
  │
  ├── db.transaction: update prev isLatest=false, insert revision row
  └── logAuditEvent(action:'upload'|'revision')
```

The path is identical to what `generateQmsPath()` currently produces (same template, same token values). The only additions are the `issueUploadToken()` and `validateUploadToken()` calls that bookend the GCS write.

TTL for internal tokens is set to **60 seconds** (not 300s like BRC client-facing tokens) because issue → validate happens within the same synchronous request.

---

## 4. Pre-Implementation Corrections — RESOLVED (2026-05-16)

All three conflict items were confirmed and resolved before implementation. Seed corrections have been applied to `server/services/gcs-governance-service.ts`.

### 4.1 WELDER_CERT — RESOLVED ✓

**Decision:** `QMS/WelderManagement/...` is the authoritative path.

**Root cause:** The governance rule template was written as `QMS/WelderCertificates/...` but `welder-certificate-routes.ts` has always called `createRevision({ module: 'WelderManagement' })`, causing `generateQmsPath()` to produce `QMS/WelderManagement/...`. All files on GCS are at the `WelderManagement` prefix. The template was wrong; the files are correct.

**Action taken:** Seed corrected — `WELDER_CERT.pathTemplate` updated from `QMS/WelderCertificates/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` to `QMS/WelderManagement/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}`. No GCS files moved. No DB records changed.

**Authoritative path going forward:** `QMS/WelderManagement/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}`

---

### 4.2 CALIBRATION_CERT — RESOLVED ✓ (Option A confirmed)

**Decision:** Consolidate on `createRevision()` path. `uploadCalibrationCertificate()` is deprecated.

**Root cause:** Two upload utilities co-existed in `calibration-routes.ts`:
- `uploadCalibrationCertificate()` (`server/utils/calibration-certificate-upload.ts`) — writes a flat overwrite-on-each-calibration file at `QMS/Instrument/{INST-XXXXX}.pdf`. No revision folder. No DB record. No checksum. No audit log.
- `createRevision('Calibration')` (`server/utils/qms-file-governance.ts`) — writes `QMS/Calibration/{DocNumber}/rev-{N}/{Seq}-{Label}.{ext}`. Full revision tracking. Checksum. Audit log.

The governance rule template `QMS/Instrument/{filename}` was written for the legacy utility; `createRevision()` was added later with a different path prefix, leaving the rule template stale.

**Action taken:** Seed corrected — `CALIBRATION_CERT.pathTemplate` updated from `QMS/Instrument/{filename}` to `QMS/Calibration/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}`. `revisionMode` changed from `'none'` to `'numeric'`. Existing flat files at `QMS/Instrument/{INST-XXXXX}.pdf` are **retained as-is in GCS** (no deletion); they are legacy orphans — their signed URLs in the DB will continue to resolve until the file is naturally superseded. Phase 2B implementation must replace all `uploadCalibrationCertificate()` call sites in `calibration-routes.ts` with `createRevision()`.

**Authoritative path going forward:** `QMS/Calibration/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}`

**`uploadCalibrationCertificate()` status:** DEPRECATED — to be removed from all `calibration-routes.ts` call sites during Phase 2B implementation. The utility file `server/utils/calibration-certificate-upload.ts` should be deleted once all call sites are removed.

---

### 4.3 WPQR Legacy Fallback — CONFIRMED FOR REMOVAL ✓

**Decision:** Remove both legacy fallback blocks. Governance failure → HTTP 500. No silent ungoverned writes.

**Current fallback (to be removed):**
```typescript
} catch (govErr) {
  // ← THIS BLOCK MUST BE DELETED
  console.error('Governance upload failed, falling back to legacy:', govErr);
  const filePath = `/QMS/WPQR/${documentId}.pdf`;   // ungoverned flat path
  const uploadResult = await uploadFileToGCS(filePath, req.file.buffer, req.file.mimetype);
  // No revision record. No audit log. No checksum. Path bypasses governance entirely.
}
```

This fallback exists in two handlers: `POST /api/quality/wpqr` (line ~436) and `PATCH /api/quality/wpqr/:id` (line ~622). Both blocks are removed during Phase 2B implementation.

**Rationale:** The governance layer (`createRevision()`) has been in production since the initial QMS build. No legitimate upload relies on the fallback — it only fires if governance itself is broken (e.g., GCS credentials missing, DB unreachable). In that scenario, a visible 500 is the correct response. Silently writing to an ungoverned path is worse than failing loudly.

**Post-removal behaviour:** Any error in `createRevision()` propagates as a 500 response. The DB record (e.g., `wpqr_documents` row) is rolled back or never committed, depending on whether the insert happened before the governance call. Refer to §5.1 for the correct transaction ordering to ensure DB insert is not committed without a successful GCS write.

---

### 4.4 Token Name Mapping

`generateQmsPath()` uses parameter names that differ from the governance rule token names. The mapping is:

| `generateQmsPath()` param | Governance rule token | Notes |
|---|---|---|
| `documentNumber` | `{DocNumber}` | Direct mapping |
| `revisionNumber` | `{rev}` | Direct mapping |
| `sequence` | `{Seq}` | Always `1` for single-file revisions |
| `label` | `{Label}` | Sanitised with `replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()` |
| `fileExtension` | `{ext}` | Derived from filename or MIME type |

The path produced by `issueUploadToken()` using these token values is identical to what `generateQmsPath()` currently produces — no path change, purely a governance bookkeeping addition.

---

## 5. Module-by-Module Implementation Tasks

### 5.1 WPQR (`wpqr-routes.ts`) — Priority: HIGH

**Affected handlers:**
- `POST /api/quality/wpqr` — line 312: create with file upload
- `PATCH /api/quality/wpqr/:id` — line 501: update with optional file replacement

**Critical issue — legacy fallback at lines 436–448 (POST) and ~line 622–635 (PATCH):**
```typescript
} catch (govErr) {
  console.error('Governance upload failed, falling back to legacy:', govErr);
  const filePath = `/QMS/WPQR/${documentId}.pdf`;            // ← ungoverned path
  const uploadResult = await uploadFileToGCS(filePath, ...);  // ← bypasses all governance
  ...
}
```
This fallback writes to `/QMS/WPQR/{docId}.pdf` — a flat path with no revision folder, no DB revision record, no audit log, no checksum. If governance fails, the document exists in GCS with no traceability.

**Phase 2B change:**
1. Look up `ruleId` from `gcs_governance_rules WHERE module_key='qms' AND document_type='WPQR'`
2. Replace `generateQmsPath()` with `issueUploadToken()` inside `createRevision()` (or in a thin wrapper in the route)
3. **Remove both legacy fallback blocks entirely** — governance error becomes a 500 response
4. Mark token as used via `validateUploadToken()` after successful GCS write

**Token values for WPQR:**
```typescript
tokenValues: {
  DocNumber: documentId,           // e.g. "WPQR-42"
  rev:       String(nextRev),      // e.g. "1"
  Seq:       '1',
  Label:     'qualification-record',
  ext:       ext,                  // 'pdf'
}
```

### 5.2 PMA (`pma-routes.ts`) — Priority: HIGH

**Affected handlers:**
- `POST /api/quality/pma` — line 205: create with file
- `PUT /api/quality/pma/:id` — line 279: update with optional file

**Current state:** `createRevision()` is called with no legacy fallback (govErr → 500 already). Module: `'PMA'`. Path: `QMS/PMA/{DocNumber}/rev-{N}/...`. Governance rule template matches. This is the cleanest QMS module.

**Phase 2B change:**
1. Look up `ruleId WHERE module_key='qms' AND document_type='PMA'`
2. Issue token with `tokenValues: { DocNumber: pmaNumber, rev, Seq:'1', Label:'material-approval', ext }`
3. Resolve path from token (same as current `generateQmsPath()` output)
4. Validate and consume token post-upload
5. No fallback to remove (already absent)

### 5.3 Test Procedures (`test-procedures-routes.ts`) — Priority: HIGH

**Affected handlers:**
- `POST /api/quality/test-procedures` — line 262: create with file
- `PUT /api/quality/test-procedures/:id` — line ~384: update with optional file
- `POST /api/quality/test-procedures/:id/upload` — line ~506: standalone file upload

**Current state:** `createRevision({ module: 'TestProcedures' })`. Governance rule template `QMS/TestProcedures/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` matches. No legacy fallback (govErr → 500).

**Phase 2B change:**
1. Look up `ruleId WHERE module_key='qms' AND document_type='TEST_PROCEDURE'`
2. Issue token with `tokenValues: { DocNumber: procedureNumber, rev, Seq:'1', Label: 'procedure-{ndtMethod}', ext }`
3. Validate and consume token post-upload

### 5.4 Welder Certificates (`welder-certificate-routes.ts`) — Priority: MEDIUM

**Affected handlers:**
- `POST /api/quality/welder-certificates/:welderId` — line 300: upload cert
- `PUT /api/quality/welder-certificates/:certificateId/file` — line 538: revise cert file

**Path issue (§4.1):** Governance rule template must be corrected to `QMS/WelderManagement/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` before this module is touched.

**Current state:** `createRevision({ module: 'WelderManagement' })`. No legacy fallback (govErr → 500).

**Phase 2B change (after §4.1 correction):**
1. Look up `ruleId WHERE module_key='qms' AND document_type='WELDER_CERT'`
2. Token values: `{ DocNumber: '{welderIdString}-{certNo}', rev, Seq:'1', Label:'cert-{certificateType}', ext }`
3. Validate and consume token post-upload

### 5.5 Calibration (`calibration-routes.ts`) — Priority: MEDIUM (pending §4.2 decision)

**Affected handlers:**
- `POST /api/quality/calibration/instruments` — line 324: create instrument with cert (uses `createRevision()`)
- `PUT /api/quality/calibration/instruments/:id` — line ~437: update with cert (uses `createRevision()`)
- Other handlers using `uploadCalibrationCertificate()` — to be migrated to `createRevision()` (Option A)

**Current state:** Dual-upload path conflict (§4.2). `createRevision({ module: 'Calibration' })` writes to `QMS/Calibration/...` but governance rule template says `QMS/Instrument/...`. Error is silently swallowed on instrument create (instrument created but `certificate_gcs_key` stays null if govErr).

**Phase 2B change (assuming Option A — consolidate on `createRevision()`):**
1. Correct governance rule template from `QMS/Instrument/{filename}` to `QMS/Calibration/{DocNumber}/rev-{rev}/{Seq}-{Label}.{ext}` (seed update)
2. Replace all `uploadCalibrationCertificate()` call sites with `createRevision({ module: 'Calibration' })`
3. Surface the silent `catch {}` block as 500 on cert upload failure — do NOT silently create instrument without cert path when cert upload was requested
4. Look up `ruleId WHERE module_key='qms' AND document_type='CALIBRATION_CERT'`
5. Token values: `{ DocNumber: instrumentId, rev, Seq:'1', Label:'certificate', ext }`
6. Validate and consume token post-upload

---

## 6. Changes to `createRevision()` in `qms-file-governance.ts`

Rather than modifying every route file individually, the preferred approach is to extend `createRevision()` to optionally accept a `ruleId` and integrate the token lifecycle internally. This centralises governance in the shared utility.

### 6.1 Proposed signature extension

```typescript
export async function createRevision(params: {
  // --- existing params (unchanged) ---
  module: QmsModule;
  documentNumber: string;
  label: string;
  fileBuffer: Buffer;
  originalFileName: string;
  contentType: string;
  parentEntityType: string;
  parentEntityId: number;
  userId: number;
  userRole: string;
  ipAddress?: string;
  // --- new optional param ---
  ruleId?: number;   // governance rule ID; if provided, token is issued + consumed
}): Promise<QmsUploadResult>
```

### 6.2 Internal token flow (when `ruleId` is provided)

```typescript
// Inside createRevision(), after permission check and before GCS upload:

let tokenRawValue: string | undefined;
let resolvedPathFromToken: string | undefined;

if (params.ruleId != null) {
  const tokenResult = await issueUploadToken({
    ruleId: params.ruleId,
    tokenValues: {
      DocNumber: params.documentNumber,
      rev:       String(nextRev),
      Seq:       '1',
      Label:     params.label,
      ext,
    },
    issuedTo: params.userId,
    ttlSeconds: 60,   // internal; issue and validate within same request
    notes: `Internal QMS upload: ${params.module}/${params.documentNumber} rev ${nextRev}`,
  });
  tokenRawValue = tokenResult.rawToken;
  resolvedPathFromToken = tokenResult.resolvedPath;
  // Assert: resolvedPathFromToken must equal gcsPath from generateQmsPath()
  // If they diverge, throw — it means the rule template is out of sync
}

const gcsPath = resolvedPathFromToken ?? generateQmsPath(...);  // fallback for non-governed call sites during migration
```

After successful GCS write:

```typescript
if (tokenRawValue && resolvedPathFromToken) {
  const validation = await validateUploadToken({
    rawToken: tokenRawValue,
    actualPath: resolvedPathFromToken,
  });
  if (!validation.valid) {
    // This should never happen (issued 10ms ago, same process)
    // but log and do not abort — revision is already committed
    console.error(`[QMS Gov] Token validation failed post-upload: ${validation.reason} — path: ${resolvedPathFromToken}`);
  }
}
```

### 6.3 Route-side changes

Each route must resolve `ruleId` and pass it to `createRevision()`:

```typescript
// Example — WPQR POST handler (pre-calculated once per request):
const [govRule] = await db
  .select({ id: gcsGovernanceRules.id })
  .from(gcsGovernanceRules)
  .where(
    and(
      eq(gcsGovernanceRules.moduleKey, 'qms'),
      eq(gcsGovernanceRules.documentType, 'WPQR'),
      eq(gcsGovernanceRules.active, true)
    )
  )
  .limit(1);

if (!govRule) {
  return res.status(500).json({ error: 'WPQR governance rule not found — contact administrator' });
}

const govResult = await createRevision({
  ...existingParams,
  ruleId: govRule.id,   // ← new
});
```

This pattern mirrors the BRC implementation at `finance-routes-fixed.ts` lines 1360–1363.

---

## 7. Files to be Modified

| File | Change Type | Summary |
|---|---|---|
| `server/services/gcs-governance-service.ts` | Seed correction | Fix `WELDER_CERT` template; fix/update `CALIBRATION_CERT` template (§4.1, §4.2) |
| `server/utils/qms-file-governance.ts` | Extension | Add optional `ruleId` param to `createRevision()`; add internal token issue/validate logic; add import for `issueUploadToken`, `validateUploadToken` |
| `server/quality/wpqr-routes.ts` | Hardening | Resolve `ruleId`; pass to `createRevision()`; **remove both legacy fallback blocks** |
| `server/quality/pma-routes.ts` | Hardening | Resolve `ruleId`; pass to `createRevision()` |
| `server/quality/test-procedures-routes.ts` | Hardening | Resolve `ruleId`; pass to `createRevision()` |
| `server/quality/welder-certificate-routes.ts` | Hardening | Resolve `ruleId`; pass to `createRevision()` (after seed fix) |
| `server/quality/calibration-routes.ts` | Hardening + consolidation | Resolve `ruleId`; pass to `createRevision()`; replace `uploadCalibrationCertificate()` call sites; surface silent catch |
| `server/utils/calibration-certificate-upload.ts` | Deprecation | Mark as deprecated; remove call sites (after Option A confirmed) |

**Files NOT modified:**
- `shared/schema.ts` — no schema changes
- `drizzle.config.ts` — no DB migrations
- All `client/` files — no frontend changes
- `server/gcs-governance-routes.ts` — no new governance API endpoints needed

---

## 8. Ordered Implementation Sequence

The tasks are ordered to minimise risk: seed corrections first (no code side effects), then the shared utility, then routes from cleanest to most complex.

```
Task  Blocked By  Description
T001  —           Seed corrections: fix WELDER_CERT template; decide Calibration Option A/B and update CALIBRATION_CERT template
T002  T001        DB push/sync to apply seed changes (drizzle-kit push or manual SQL)
T003  T002        Extend createRevision() in qms-file-governance.ts: add ruleId param, import issueUploadToken/validateUploadToken, internal token lifecycle
T004  T003        Harden PMA routes (cleanest: no fallback, matching template)
T005  T003        Harden Test Procedures routes (no fallback, matching template)
T006  T003        Harden WPQR routes (remove legacy fallback — highest risk item)
T007  T001,T003   Harden Welder Certificate routes (after seed template fix)
T008  T001,T003   Harden Calibration routes: consolidate on createRevision(); surface silent catch; deprecate uploadCalibrationCertificate()
T009  T004–T008   Smoke test: verify governance dashboard shows token entries for each module after test uploads
T010  T009        Update replit.md pointer with link to this document
```

---

## 9. Invariants and Guard Rails

These must hold after Phase 2B — any implementation step that would violate these is a bug:

1. **No path changes.** `resolvedPathFromToken` must equal what `generateQmsPath()` currently produces for the same inputs. If they diverge, throw a configuration error — do not silently use either path.

2. **No client-visible API changes.** Endpoint URLs, request shapes, response bodies, and HTTP status codes are unchanged for all QMS endpoints.

3. **Governance failure = 500, not silent bypass.** Removing the WPQR legacy fallback means governance errors become visible 500s. This is intentional — silent GCS writes with no governance record are worse than a visible failure.

4. **Token TTL = 60 seconds (internal).** Internal tokens expire in 60 seconds. If `validateUploadToken()` returns `expired` after a successful upload, log an error but do not roll back the upload — the revision record is already committed. Investigate why the upload took > 60 seconds.

5. **Single token per revision.** Each call to `createRevision()` issues exactly 1 token. Token is marked `used_at` immediately after the GCS write completes.

6. **`qmsDocumentRevisions` table is unaffected.** The token integration is additive — existing revision records remain valid; the new `ruleId` linkage is in `gcs_upload_tokens`, not in `qms_document_revisions`.

7. **`checkUploadPermission()` is not weakened.** The token gate is an additional layer, not a replacement for the role check. Both must pass.

---

## 10. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| `gcs_governance_rules` row not found at runtime (after seed push fails) | HIGH | Low | Route returns 500 with explicit message; no silent fallback |
| `issueUploadToken()` fails (DB error) | HIGH | Very Low | Throw before GCS write — no partial state |
| `validateUploadToken()` returns `path_mismatch` | MEDIUM | Very Low | Means rule template diverged from `generateQmsPath()`; log error, assert in pre-deploy tests |
| Token TTL exceeded on slow upload (> 60 sec) | LOW | Very Low | 60-sec window is for internal call, not user-facing; large file uploads already timeout at multer 10–50 MB limit |
| WPQR fallback removal breaks existing clients | LOW | Very Low | Fallback only triggered when governance layer throws — governance has been in place since initial QMS build; no legitimate upload relies on fallback path |
| Calibration `uploadCalibrationCertificate()` removal | MEDIUM | Low | Audit all call sites in `calibration-routes.ts` before removal; instrument download URLs must still resolve |

---

## 11. Evidence Required After Implementation

For each module, an acceptance upload test must produce:

1. A `gcs_upload_tokens` row with `used_at IS NOT NULL` and `module_key = 'qms'`
2. A `qms_document_revisions` row with matching `gcs_path`
3. A `qms_document_audit_log` row with `action = 'upload'` or `action = 'revision'`
4. The governance dashboard (`/api/governance/upload-tokens`) shows the upload in the `used` bucket
5. The GCS path stored in the entity table (`wpqr_documents.file_path`, etc.) equals `resolved_path` from the token

SQL to verify after test upload (run per module):
```sql
-- Verify token + revision parity for a specific document
SELECT
  t.id              AS token_id,
  t.document_type,
  t.resolved_path,
  t.used_at,
  r.gcs_path        AS revision_path,
  r.revision_number,
  a.action          AS audit_action
FROM gcs_upload_tokens t
JOIN qms_document_revisions r ON r.gcs_path = t.resolved_path
JOIN qms_document_audit_log a ON a.gcs_path = t.resolved_path
WHERE t.module_key = 'qms'
  AND t.document_type = 'WPQR'   -- change per module
  AND t.used_at IS NOT NULL
ORDER BY t.issued_at DESC
LIMIT 5;
```

---

## 12. Out of Scope (Deferred)

- WPS/PQR routes (`wps-pqr-routes.ts`) — not confirmed to use `qms-file-governance.ts`; to be audited separately
- Welder Photo routes (`welder-photo-routes.ts`) — flat-file pattern; separate Phase 2C item
- Inspection Document routes (`inspection-document-routes.ts`) — Family A (project-specific), different governance path structure; separate phase
- Final Dossier routes (`final-dossier-generator.ts`) — programmatic PDF, not user upload; separate phase
- NCR document uploads — new module, not yet implemented
- Migration of historical `QMS/WPQR/{id}.pdf` legacy fallback files — deferred (no current migration scope)
- Family B TPEL path migration (`QMS/...` → `TPEL/QMS/{FY}/...`) — Rev 5 target path, separate future phase

---

## 13. Pointers

- **BRC Phase 2A reference implementation:** `server/finance-routes-fixed.ts` lines 1340–1470
- **Token service functions:** `server/services/gcs-governance-service.ts` — `issueUploadToken()` (line 329), `validateUploadToken()` (line 382)
- **Governance rule seed:** `server/services/gcs-governance-service.ts` lines 221–234
- **QMS governance utility:** `server/utils/qms-file-governance.ts` — `createRevision()` (line 170), `generateQmsPath()` (line 29)
- **GCS Governance Rev 5 baseline:** `docs/gcs-governance-rev5-option-c-baseline.md`
- **Document Type Vocabulary v2.0 (FROZEN):** `docs/document-type-vocabulary-v2.0.md`
