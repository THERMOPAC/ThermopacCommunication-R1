# GCS Governance — Wave 0 Execution Plan
## finance / BRC_DOCUMENT Confirmation

**Status**: PLANNING BASELINE — approved for reference; execution not yet started  
**Wave**: 0 (Confirm live DB-driven routing — no new code to write)  
**Rule**: `finance/BRC_DOCUMENT` (rule_id=27, version_id=23)  
**Path template**: `Accounts/{FY}/{filename}`  
**Phase 3 note**: D-01 path correction (`Accounts/` → `TPEL/FINANCE/BRC/`) is explicitly deferred and must NOT be bundled with Wave 0  
**Prerequisite for Wave 1**: Wave 0 closes with a clean observation window

---

## 1. Purpose

Wave 0 is not a migration — it is a confirmation exercise. The BRC_DOCUMENT route was wired with `issueUploadToken()`, `validateUploadToken()`, and `logUploadEvent()` during Phase 0 development. However, **zero upload tokens have ever been issued in production**, meaning the entire token lifecycle has never been triggered by a real user action.

Wave 0 verifies that:
- The token issuance endpoint functions correctly in production
- The upload endpoint enforces the token gate without fallback
- The monitor log captures every upload event
- The stored `document_path` in the BRC record matches the governance-derived path
- The download endpoint correctly serves files from stored paths
- Freeze protection is in place on the governance activation side
- There is no hardcoded path construction in any upload code path for this rule

Wave 0 produces the first entry in `gcs_upload_tokens` and `gcs_upload_monitor_log` for a production document type, validating the end-to-end infrastructure before Wave 1 begins.

---

## 2. Current DB State (as of 2026-05-17)

### Rule row — `gcs_governance_rules`

| column | value |
|---|---|
| id | 27 |
| module_key | finance |
| document_type | BRC_DOCUMENT |
| display_name | Bank Realisation Certificate |
| active | true |
| root_prefix | Accounts |
| notes | 🚨 WRONG ROOT — Phase 3 migration approved but not yet executed. Target: `TPEL/FINANCE/BRC/{CompanyFY}/{filename}`. Route: `server/finance-routes-fixed.ts` (Phase 2A lock-down in place). |

### Active version row — `gcs_governance_rule_versions`

| column | value |
|---|---|
| id | 23 |
| rule_id | 27 |
| version_number | 1 |
| status | active |
| path_template | `Accounts/{FY}/{filename}` |
| revision_mode | none |
| activated_at | 2026-05-16 17:57:24 |
| validation_evidence→overall | PASS |
| superseded_at | null |

### Token table — `gcs_upload_tokens`

| metric | count |
|---|---|
| Total tokens (all time, this rule) | 0 |
| Used tokens | 0 |
| Live tokens | 0 |
| Expired tokens | 0 |

### Monitor log — `gcs_upload_monitor_log`

| metric | count |
|---|---|
| Entries for matched_rule_id=27 | 0 |

### BRC record table — `bank_realization_certificates`

Relevant columns for Wave 0:

| column | type | nullable | notes |
|---|---|---|---|
| id | integer | NO | PK |
| certificate_number | varchar | NO | Stored as filename stem |
| document_path | varchar | YES | GCS object path — must equal `resolvedPath` from the upload token |
| related_invoice_id | integer | YES | FK to `invoices` |

---

## 3. Routes and Endpoints

All endpoints in `server/finance-routes-fixed.ts`. Router mounted at `/api/finance`.

### 3a — Token Issuance

```
POST /api/finance/brc/upload-token
Auth: ensureAuthenticated
Lines: 1334–1380
```

**Request body**:
```json
{ "invoiceId": 123, "invoiceNumber": "INV-2025-042", "issueDate": "2025-08-15" }
```

**What it does** (lines 1334–1380):
1. Validates presence of `invoiceId`, `invoiceNumber`, `issueDate`
2. Confirms invoice exists in DB (`SELECT id FROM invoices WHERE id = $1`)
3. Computes `FY` from `issueDate` (fiscal year = calendar year if month ≥ April, else year−1)
4. Constructs `filename` as `${invoiceNumber}.pdf`
5. Looks up `rule_id` from `gcs_governance_rules WHERE module_key='finance' AND document_type='BRC_DOCUMENT' AND active=true`
6. Calls `issueUploadToken({ ruleId, tokenValues: { FY, filename }, issuedTo: userId, ttlSeconds: 300 })`
   — resolves template `Accounts/{FY}/{filename}` → `Accounts/{FY}/{invoiceNumber}.pdf`
   — writes row to `gcs_upload_tokens`
7. Returns `{ rawToken, resolvedPath, expiresAt }`

**Failure modes handled**:
- Missing fields → HTTP 400
- Invoice not found → HTTP 404
- Governance rule not found → HTTP 500 (message: "BRC governance rule not found — contact administrator")
- `issueUploadToken()` throws → HTTP 500 (message: "Failed to issue upload token")

**Token TTL**: 300 seconds (5 minutes from issue)

**No hardcoded path**: `resolvedPath` comes exclusively from `issueUploadToken()`. No string template construction in the route handler.

### 3b — GCS Upload with Token Gate

```
POST /api/finance/upload/gcs
Auth: ensureAuthenticated
Lines: 1387–1478
Content-Type: multipart/form-data
```

**Request**: `file` (binary) + `uploadToken` (string)

**What it does** (lines 1387–1478):
1. Parses multipart upload via `multer` (memory storage)
2. Reads `uploadToken` from request body — **rejects with HTTP 400 if absent**
3. SHA-256 hashes `uploadToken`, looks up row in `gcs_upload_tokens`
4. Reads `resolved_path` from the token row (path comes from DB — never from request body or client input)
5. Calls `validateUploadToken({ rawToken: uploadToken, actualPath: resolvedPath })`
   — rejects: `not_found` → 403, `expired` → 403, `already_used` → 403, `path_mismatch` → 403
6. Uploads file buffer to GCS at `resolvedPath` using `createWriteStream`
7. Calls `logUploadEvent({ gcsPath: resolvedPath, moduleKey: 'finance', documentType: 'BRC_DOCUMENT', fileSizeBytes, mimeType, uploadedBy, routeFile })`
8. Returns `{ success: true, filePath: resolvedPath }`

**No hardcoded path**: GCS write target is `file = bucket.file(resolvedPath)` where `resolvedPath = tokenRecord.resolved_path`. No fallback path construction.

**Failure modes handled**:
- No file uploaded → 400
- Missing `uploadToken` → 400
- Token not found / expired / already used / path mismatch → 403 (specific message per rejection reason)
- GCS write error → 500
- `logUploadEvent()` failure → silent (non-fatal; must not affect the upload)

### 3c — BRC Record Create / Update (document_path storage)

```
POST /api/finance/brc          (create — line 1089)
PUT  /api/finance/brc/:id      (update — line 1173)
```

These routes accept `documentPath` in the request body and store it as `bank_realization_certificates.document_path`. The client must pass the `filePath` value returned by the upload endpoint as `documentPath`. This is the only point where the governance-derived path enters the BRC record.

**Wave 0 verification requirement**: Confirm that `bank_realization_certificates.document_path` equals `gcs_upload_tokens.resolved_path` for the corresponding token.

### 3d — Download

```
GET /api/finance/brc/:id/document
Auth: ensureAuthenticated
Lines: 1649–1729 (approx)
```

**What it does**:
1. Reads `document_path` from `bank_realization_certificates WHERE id = $1`
2. Opens GCS file at `brc.document_path`
3. Confirms file exists (`file.exists()`)
4. Streams file to response with `Content-Type: application/pdf`, `Content-Disposition: inline`

**No governance service calls**: download reads the stored path from the DB record and serves the file directly. This is correct — the governance token gate applies only to uploads. Download must not be changed during or after Wave 0.

**Wave 0 verification requirement**: Confirm that a BRC record whose `document_path` was set via the token-gated upload flow is downloadable without error.

---

## 4. Token Lifecycle — End-to-End Flow

```
Client                          Server (/finance/brc/upload-token)
  │                                    │
  │  POST { invoiceId, invoiceNumber, issueDate }
  │ ─────────────────────────────────► │
  │                                    ├─ SELECT invoices WHERE id=$invoiceId
  │                                    ├─ compute FY, filename
  │                                    ├─ SELECT gcs_governance_rules WHERE module='finance' AND type='BRC_DOCUMENT'
  │                                    ├─ issueUploadToken(ruleId=27, {FY, filename}, userId)
  │                                    │    └─ SELECT gcs_governance_rule_versions WHERE rule_id=27 AND status='active'
  │                                    │    └─ resolve: Accounts/{FY}/{invoiceNumber}.pdf
  │                                    │    └─ INSERT gcs_upload_tokens(tokenHash, resolvedPath, versionId=23, ...)
  │  ◄── { rawToken, resolvedPath, expiresAt }
  │
  │  [Client holds rawToken (≤5 min)]
  │
Client                          Server (/finance/upload/gcs)
  │                                    │
  │  POST multipart: file + uploadToken
  │ ─────────────────────────────────► │
  │                                    ├─ hash(uploadToken) → lookup gcs_upload_tokens
  │                                    ├─ read resolved_path from token row
  │                                    ├─ validateUploadToken(rawToken, resolved_path)
  │                                    │    └─ check not_found / expired / already_used / path_mismatch
  │                                    │    └─ UPDATE gcs_upload_tokens SET used_at=NOW(), used_for_path=resolved_path
  │                                    ├─ bucket.file(resolved_path).createWriteStream()
  │                                    ├─ logUploadEvent(resolved_path, 'finance', 'BRC_DOCUMENT', ...)
  │                                    │    └─ INSERT gcs_upload_monitor_log
  │  ◄── { success: true, filePath: resolved_path }
  │
  │  [Client passes filePath → POST /finance/brc as documentPath]
  │
Client                          Server (/finance/brc)
  │                                    │
  │  POST { invoiceId, ..., documentPath: resolved_path }
  │ ─────────────────────────────────► │
  │                                    ├─ INSERT bank_realization_certificates(document_path=resolved_path, ...)
  │  ◄── { success: true, brc: { id, document_path: resolved_path, ... } }
  │
  │  [Later: view document]
  │
Client                          Server (/finance/brc/:id/document)
  │                                    │
  │  GET /finance/brc/{id}/document
  │ ─────────────────────────────────► │
  │                                    ├─ SELECT document_path FROM bank_realization_certificates WHERE id=$id
  │                                    ├─ bucket.file(document_path).createReadStream()
  │  ◄── PDF stream
```

---

## 5. DB Tables Involved

| table | operation | purpose |
|---|---|---|
| `invoices` | SELECT | invoice existence check before token issue |
| `gcs_governance_rules` | SELECT | look up rule_id=27 at upload-token time |
| `gcs_governance_rule_versions` | SELECT | load active version (v_id=23) and path_template inside `issueUploadToken()` |
| `gcs_upload_tokens` | INSERT (issue) | stores rawToken hash, resolvedPath, versionId, issuedTo, expiresAt |
| `gcs_upload_tokens` | UPDATE (validate) | sets used_at, used_for_path on consumption |
| `gcs_upload_monitor_log` | INSERT | logUploadEvent() after each successful upload |
| `bank_realization_certificates` | INSERT/UPDATE | stores document_path = resolvedPath for download |

---

## 6. Evidence Package

### Pre-Execution Evidence (collect before marking Wave 0 in progress)

| item | what to confirm | verification method |
|---|---|---|
| E-PRE-1 | Rule is active: `rule_id=27`, `version_id=23`, `status='active'` | `SELECT status FROM gcs_governance_rule_versions WHERE id=23` → `active` |
| E-PRE-2 | Zero-Trust PASS confirmed current | `SELECT validation_evidence->>'overall' FROM gcs_governance_rule_versions WHERE id=23` → `PASS` |
| E-PRE-3 | Token template resolves correctly | Dry-run: `issueUploadToken(27, { FY: '2526', filename: 'INV-TEST-001.pdf' }, userId)` → resolvedPath = `Accounts/2526/INV-TEST-001.pdf` (no unresolved tokens) |
| E-PRE-4 | No hardcoded path in upload handler | Code audit: confirm line 1442 (`bucket.file(resolvedPath)`) uses only `tokenRecord.resolved_path`; no string template present |
| E-PRE-5 | No fallback on token validation failure | Code audit: confirm all `validateUploadToken()` failure branches return HTTP 403 — none fall through to a legacy path construction |
| E-PRE-6 | D-01 deferred item is NOT bundled | Confirm path_template remains `Accounts/{FY}/{filename}` — no v2 version exists for rule_id=27 |
| E-PRE-7 | No freeze active | `GET /api/gcs-governance/freeze-status` → no active freeze |
| E-PRE-8 | Download endpoint confirmed governance-clean | Code audit: confirm `/brc/:id/document` reads `document_path` from `bank_realization_certificates` only; no governance service calls present |

### Post-Execution Evidence (collect during/after observation window)

| item | what to confirm | verification query / method |
|---|---|---|
| E-POST-1 | At least 1 production token issued | `SELECT COUNT(*) FROM gcs_upload_tokens WHERE rule_id=27 AND module_key='finance'` → ≥1 |
| E-POST-2 | Token consumed (upload completed) | `SELECT used_at, used_for_path FROM gcs_upload_tokens WHERE rule_id=27 AND used_at IS NOT NULL` → ≥1 row |
| E-POST-3 | Resolved path matches template structure | `SELECT resolved_path FROM gcs_upload_tokens WHERE rule_id=27` → all values match pattern `Accounts/\d{4}/[\w\-]+\.pdf` |
| E-POST-4 | Monitor log entry created | `SELECT COUNT(*) FROM gcs_upload_monitor_log WHERE matched_rule_id=27` → ≥1 |
| E-POST-5 | Monitor log shows path_conforms=true | `SELECT path_conforms, violation_reason FROM gcs_upload_monitor_log WHERE matched_rule_id=27` → all `path_conforms=true`, `violation_reason=null` |
| E-POST-6 | BRC document_path matches token resolved_path | `SELECT brc.document_path, t.resolved_path FROM bank_realization_certificates brc JOIN gcs_upload_tokens t ON brc.document_path = t.resolved_path WHERE t.rule_id=27` → matching rows |
| E-POST-7 | Download succeeds | Manual: `GET /api/finance/brc/{id}/document` for the BRC created via token-gated upload returns HTTP 200 + PDF stream |
| E-POST-8 | No expired unused tokens (no abandoned uploads) | `SELECT COUNT(*) FROM gcs_upload_tokens WHERE rule_id=27 AND used_at IS NULL AND expires_at < NOW()` → 0 after observation window |
| E-POST-9 | No validation failures in application log | Search logs for `[BRC-Token]` and `validateUploadToken` → no 403 responses except deliberate test cases |
| E-POST-10 | Zero GCS path violations | E-POST-5: `path_conforms` column → 0 false rows for matched_rule_id=27 |

---

## 7. Freeze Protection

### What "freeze" means in Wave 0 context

The governance freeze (`checkActivationFreeze()`) prevents **version activation swaps** — it blocks the route that transitions a rule version from `approved` → `active`. It does not block upload token issuance or upload processing. Uploads under an already-active version proceed regardless of freeze state.

### What Wave 0 must verify

| check | method |
|---|---|
| Freeze blocks version activation | Confirm `checkActivationFreeze()` is called in `POST /api/gcs-governance/rules/:ruleId/versions/:versionId/activate` before the atomic swap |
| Freeze does NOT block upload token issuance | Confirm no freeze check in `POST /finance/brc/upload-token` — uploads must not be blocked by a governance freeze |
| No v2 activation possible during freeze | If a freeze is declared during Wave 0 observation, confirm `POST /activate` returns HTTP 423; confirm token issuance still works |

### Freeze verification queries

```sql
-- Confirm no freeze currently active (run before execution)
SELECT * FROM gcs_governance_freeze_log WHERE lifted_at IS NULL ORDER BY created_at DESC LIMIT 1;
-- (or equivalent freeze table/config — consult gcs-governance-zero-trust.ts for exact implementation)
```

---

## 8. No-Hardcoded-Fallback Verification

The following code audit must be completed as E-PRE-4 and E-PRE-5 before Wave 0 is marked in-progress.

### Upload path source — confirmed

**Line 1423 (`finance-routes-fixed.ts`)**:
```typescript
const resolvedPath: string = tokenRecord.resolved_path;
```
Path comes from `gcs_upload_tokens.resolved_path` row — written by `issueUploadToken()` at token issue time, never modifiable after insertion.

**Line 1442**:
```typescript
const file = bucket.file(resolvedPath);
```
GCS target is `resolvedPath` from the validated token. No string construction.

### Token validation — all failure paths return 403, no fallthrough

**Lines 1426–1434**:
```typescript
if (!validation.valid) {
  const messages: Record<string, string> = {
    not_found:    'Invalid upload token',
    expired:      'Upload token has expired — request a new one',
    already_used: 'Upload token has already been used',
    path_mismatch:'Upload token path mismatch',
  };
  return res.status(403).json({ error: messages[validation.reason ?? 'not_found'] });
}
```
No branch falls through to upload. Every validation failure is a terminal 403.

### Hardcoded fallback check — confirmed absent

Grep audit to be run at execution time:
```bash
grep -n "Accounts/" server/finance-routes-fixed.ts
```
Expected result: zero occurrences (the string `Accounts/` must not appear in any upload code path; it exists only in the governance rule's `path_template` in the DB).

---

## 9. Stored Resolved_Path Downloads

### How it works

After a successful token-gated upload, the client receives `filePath: resolvedPath` (e.g. `Accounts/2526/INV-2025-042.pdf`). The client submits this to `POST /finance/brc` as `documentPath`, which is stored in `bank_realization_certificates.document_path`.

The download endpoint (`GET /finance/brc/:id/document`) reads `document_path` from the BRC record and streams the GCS file at that path. No governance service interaction at download time.

### Critical invariant

The stored `document_path` is the governance-derived path from the upload token. If the path template ever changes (via a future v2 version activation), files uploaded under v1 remain at v1 paths and are served correctly because the DB stores the exact path, not a regenerated one.

### Wave 0 download verification

1. Complete a token-gated BRC upload (produces `filePath = Accounts/{FY}/{invoiceNumber}.pdf`)
2. Create a BRC record via `POST /finance/brc` with `documentPath = filePath`
3. Call `GET /finance/brc/{brcId}/document`
4. Confirm HTTP 200 + PDF stream
5. Confirm `brc.document_path` in DB = `gcs_upload_tokens.resolved_path` for the token used in step 1

---

## 10. Production Observation Process

### Window

**Minimum**: 48 hours from the first production upload token that has `used_at IS NOT NULL` for rule_id=27.

### Monitoring — active checks during window

Run the following queries at the start, mid-point, and end of the observation window:

```sql
-- 1. Token lifecycle summary
SELECT
  COUNT(*)                                                          AS total_issued,
  COUNT(*) FILTER (WHERE used_at IS NOT NULL)                      AS consumed,
  COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at > NOW())   AS still_live,
  COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW())  AS expired_unused
FROM gcs_upload_tokens
WHERE rule_id = 27;

-- 2. Monitor log summary
SELECT
  COUNT(*)                                        AS total_events,
  COUNT(*) FILTER (WHERE path_conforms = true)   AS conforming,
  COUNT(*) FILTER (WHERE path_conforms = false)  AS violations
FROM gcs_upload_monitor_log
WHERE matched_rule_id = 27;

-- 3. BRC document_path parity check
SELECT
  brc.id,
  brc.document_path,
  t.resolved_path,
  (brc.document_path = t.resolved_path) AS path_matches
FROM bank_realization_certificates brc
LEFT JOIN gcs_upload_tokens t
  ON brc.document_path = t.resolved_path AND t.rule_id = 27
WHERE brc.document_path IS NOT NULL
ORDER BY brc.created_at DESC
LIMIT 20;

-- 4. Expired-unused tokens (alert signal)
SELECT id, resolved_path, issued_at, expires_at, notes
FROM gcs_upload_tokens
WHERE rule_id = 27 AND used_at IS NULL AND expires_at < NOW();
```

### Alert conditions — immediate investigation required

| signal | threshold | action |
|---|---|---|
| `expired_unused` count > 0 | Any | Investigation: determine why uploads were not completed for issued tokens (client error? session timeout? UI bug?) |
| `path_conforms = false` in monitor log | Any | Investigation: path template mismatch — check for token value substitution errors |
| `brc.document_path ≠ t.resolved_path` | Any | Investigation: client sent wrong path to BRC create endpoint — confirm client is using `filePath` from upload response |
| HTTP 403 responses in application log for `/finance/upload/gcs` | Any (from legitimate users) | Investigation: token expiry, double-submission, or session issue |
| HTTP 500 at upload-token endpoint | Any | Investigation: DB connectivity or governance service error |

### Window close criteria

All of the following must be true:
1. E-POST-1 through E-POST-10 evidence assembled
2. Zero alert conditions breached (or all investigated and resolved with documented explanation)
3. At least 1 complete cycle observed: token issued → upload completed → BRC record created → document downloaded
4. Engineering sign-off recorded
5. Wave 1 may not begin until sign-off is recorded

---

## 11. Rollback Procedure

Wave 0 has no code change — there is nothing to deploy and therefore no deployment rollback. The rollback scenarios are limited to:

### Scenario A — Token issuance working but upload failing consistently

**Symptom**: `POST /finance/brc/upload-token` succeeds (tokens appear in DB), but `POST /finance/upload/gcs` consistently fails with 403 or 500.

**Response**:
1. Check application logs for the specific failure reason (token validation message, GCS error)
2. If 403 `expired`: client is taking >5 minutes between token issue and upload. TTL can be extended in code (`ttlSeconds: 300` → `ttlSeconds: 900`) in a targeted patch. This is a low-risk one-line change; requires a restart.
3. If 403 `path_mismatch`: the `actualPath` passed to `validateUploadToken()` does not equal `tokenRecord.resolved_path`. Code audit required — this indicates a bug in how `resolvedPath` is passed between the token lookup and validation.
4. If 500 GCS error: check GCS credentials and bucket access — not a governance issue.

**Governance impact**: none. Failed uploads do not affect the governance state. Expired unused tokens are inert.

### Scenario B — Monitor log failures

**Symptom**: uploads succeed but `gcs_upload_monitor_log` shows no entries for rule_id=27.

**Response**: `logUploadEvent()` failures are non-fatal by design (silent catch in the service). Investigate the monitor log write error via application logs. Fix is a targeted patch. No impact on upload functionality.

### Scenario C — BRC document_path mismatch detected

**Symptom**: E-POST-6 query shows `brc.document_path` does not match `gcs_upload_tokens.resolved_path`.

**Response**: The client is not passing the token-derived `filePath` to `POST /finance/brc`. This is a UI/client bug, not a governance or backend bug. The BRC record must be updated (`PUT /finance/brc/:id`) with the correct `documentPath`. If the BRC was created with an incorrect path, the file may be at the correct GCS path but the DB record points elsewhere — the DB record must be corrected to point to the actual GCS object path.

### What Cannot Be Rolled Back

- `gcs_upload_tokens` rows written during Wave 0 (immutable)
- `gcs_upload_monitor_log` rows (append-only)
- Files uploaded to GCS (must be deleted manually via GCS console if needed)

---

## 12. Success Criteria

Wave 0 is declared complete when all of the following are confirmed:

| # | criterion | evidence item |
|---|---|---|
| S-1 | Rule and version state verified active and PASS | E-PRE-1, E-PRE-2 |
| S-2 | Token issuance endpoint produces correct resolvedPath | E-PRE-3 |
| S-3 | No hardcoded path construction in upload route | E-PRE-4, E-PRE-5 |
| S-4 | D-01 deferred item confirmed not bundled | E-PRE-6 |
| S-5 | At least 1 production upload token issued and consumed | E-POST-1, E-POST-2 |
| S-6 | Resolved path matches template | E-POST-3 |
| S-7 | Monitor log entry written for each upload | E-POST-4 |
| S-8 | Monitor log shows path_conforms=true | E-POST-5 |
| S-9 | BRC document_path equals token resolved_path | E-POST-6 |
| S-10 | Download of token-uploaded BRC succeeds | E-POST-7 |
| S-11 | Zero expired unused tokens after window | E-POST-8 |
| S-12 | Zero application log 403 errors from legitimate uploads | E-POST-9 |
| S-13 | Zero GCS path violations in monitor log | E-POST-10 |
| S-14 | 48-hour observation window completed | Timestamp: window_open to window_close recorded |
| S-15 | Engineering sign-off recorded | Written sign-off with date and name |

---

## 13. Failure Criteria

Wave 0 is declared failed (requiring investigation before Wave 1 may begin) if any of the following occur:

| # | failure condition | consequence |
|---|---|---|
| F-1 | `issueUploadToken()` throws in production for a legitimate BRC upload | Wave 0 blocked; root cause investigation required |
| F-2 | `validateUploadToken()` returns `path_mismatch` for a legitimate upload (not a test) | Wave 0 blocked; governance logic bug must be identified and fixed |
| F-3 | `gcs_upload_monitor_log.path_conforms = false` for any entry matched to rule_id=27 | Wave 0 blocked; path template or token resolution error |
| F-4 | `bank_realization_certificates.document_path` does not match `gcs_upload_tokens.resolved_path` for the same BRC | Wave 0 blocked; client integration bug — must be fixed before Wave 1 |
| F-5 | Download (`GET /finance/brc/:id/document`) fails for a token-uploaded BRC | Wave 0 blocked; stored path not serving correctly |
| F-6 | Any hardcoded `Accounts/` string found in the upload code path during audit | Wave 0 blocked; hardcoded fallback must be removed before Wave 0 can be declared clean |

---

## 14. Risk Assessment

**Overall Wave 0 risk: Low**

| risk | likelihood | impact | mitigation |
|---|---|---|---|
| Token TTL (5 min) too short for BRC upload UI flow | Low | Low — users see "token expired" message, can re-request | TTL is configurable (`ttlSeconds` param); can be extended to 900s in a targeted patch if observed |
| Client not passing `filePath` to BRC create endpoint | Medium | Low — BRC record has wrong `document_path`; download fails, file is at correct GCS path | Detected by E-POST-6; corrected by updating the BRC record |
| GCS credential error during upload | Low | Medium — upload fails, no data loss | GCS credentials independent of governance; fix via environment config |
| Monitor log write failure | Low | Low — non-fatal; uploads succeed; evidence gap | Fix in targeted patch; does not affect correctness |
| Path template wrong (D-01 known issue) | Already known | Deferred — template is intentionally `Accounts/{FY}/` pending Phase 3 migration | Explicitly excluded from Wave 0 scope; no action required |
| Two clients race to use same token | Very low | Low — second use returns 403 `already_used`; client must re-request | Single-use token design handles this correctly |

---

## Appendix A — Verification Queries Summary

The following queries constitute the complete Wave 0 DB-side evidence collection. All are read-only.

```sql
-- PRE: Rule state
SELECT r.id, r.active, v.id AS v_id, v.status, v.path_template,
       v.validation_evidence->>'overall' AS zt
FROM gcs_governance_rules r
JOIN gcs_governance_rule_versions v ON v.rule_id = r.id AND v.status = 'active'
WHERE r.module_key = 'finance' AND r.document_type = 'BRC_DOCUMENT';

-- PRE: Confirm no v2 version exists
SELECT COUNT(*) AS version_count FROM gcs_governance_rule_versions WHERE rule_id = 27;
-- expected: 1

-- POST: Token lifecycle
SELECT
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE used_at IS NOT NULL)                      AS consumed,
  COUNT(*) FILTER (WHERE used_at IS NULL AND expires_at <= NOW())  AS expired_unused
FROM gcs_upload_tokens WHERE rule_id = 27;

-- POST: Path conformance
SELECT path_conforms, violation_reason, COUNT(*)
FROM gcs_upload_monitor_log WHERE matched_rule_id = 27
GROUP BY path_conforms, violation_reason;

-- POST: BRC parity check
SELECT brc.id, brc.document_path, t.resolved_path,
       (brc.document_path = t.resolved_path) AS matches
FROM bank_realization_certificates brc
LEFT JOIN gcs_upload_tokens t ON brc.document_path = t.resolved_path AND t.rule_id = 27
WHERE brc.document_path IS NOT NULL
ORDER BY brc.created_at DESC LIMIT 10;
```

---

## Appendix B — Token Resolution Detail

**Rule**: `finance/BRC_DOCUMENT` (rule_id=27, version_id=23)  
**Template**: `Accounts/{FY}/{filename}`

| token | source in upload-token endpoint | derivation |
|---|---|---|
| `{FY}` | `issueDate` from request body | `date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1` — fiscal year April–March; result is 4-digit calendar year (e.g. `2025`) |
| `{filename}` | `invoiceNumber` from request body | Constructed as `${invoiceNumber}.pdf` — hardcoded `.pdf` extension |

**Example resolutions**:

| invoiceNumber | issueDate | FY | resolved path |
|---|---|---|---|
| INV-2025-042 | 2025-08-15 | 2025 | `Accounts/2025/INV-2025-042.pdf` |
| INV-2026-001 | 2026-02-10 | 2025 | `Accounts/2025/INV-2026-001.pdf` (Feb = pre-April → previous year) |
| INV-2026-018 | 2026-05-01 | 2026 | `Accounts/2026/INV-2026-018.pdf` |

**Note on FY token**: The token registry uses `{FY}` described as "Financial year in YYZZ format" (e.g. `2627`). However, the upload-token route computes FY as a 4-digit calendar year (e.g. `2025`), not YYZZ format. This is a pre-existing inconsistency between the token description and the actual usage. It is **not** a Zero-Trust violation (the token resolves correctly), but it should be noted in the D-01 path correction plan when the template is updated in Phase 3.

---

*Document prepared: 2026-05-17*  
*Status: planning baseline — approved for reference; no execution until authorised*  
*Prerequisite for Wave 1: Wave 0 observation window closed with all 15 success criteria met*
