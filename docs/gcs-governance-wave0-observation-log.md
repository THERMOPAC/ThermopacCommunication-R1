# GCS Governance — Wave 0 Production Observation Log
## finance / BRC_DOCUMENT (rule_id=27, version_id=23)

**Window status**: OPEN  
**Window opened**: 2026-05-17T01:44:11.883Z  
**Window closes (earliest)**: 48h after first qualifying production upload — clock not yet started  
**Audit log event**: `gcs_governance_audit_log` id=1, `event_type='wave0_observation_window_open'`  
**Wave 1 status**: BLOCKED  
**Pre-production verification**: PASS (13/15 criteria — S-14 and S-15 pending this window)

---

## 1. Baseline State at Window Open (2026-05-17T01:44:11.883Z)

| metric | value | notes |
|---|---|---|
| Production tokens issued (rule_id=27, excl. Wave 0 test) | 0 | Clean baseline |
| Production tokens consumed | 0 | |
| Monitor log entries (id > 1, excl. Wave 0 test) | 0 | Wave 0 test entry is id=1 |
| BRC records with `document_path` | 123 | Pre-governance uploads |
| BRC records without `document_path` | 1 | id=98 — first upload candidate |

### First Upload Candidate

BRC id=98 has no `document_path`. When a user uploads its PDF through the governance-gated flow this record will be the first observable production upload.

| field | value |
|---|---|
| brc id | 98 |
| certificate_number | BARB0VILEASA00344189+00344184 |
| issue_date | 2025-12-15 |
| bank_name | BANK OF BARODA |
| amount | 228,783.60 USD |
| invoice_number | INV-2526-056 |
| document_path | null (awaiting upload) |
| expected resolved_path (post-patch) | `Accounts/2526/INV-2526-056.pdf` |

---

## 2. What Constitutes a Qualifying Production Upload

A qualifying production upload is an upload that satisfies ALL of the following:

1. A new row appears in `gcs_upload_tokens` with:
   - `rule_id = 27`
   - `notes NOT LIKE 'WAVE 0%'` (excludes verification tokens)
   - `used_at IS NOT NULL` (upload was completed)

2. The corresponding `gcs_upload_monitor_log` entry exists with:
   - `matched_rule_id = 27`
   - `path_conforms = true`

3. The corresponding `bank_realization_certificates` row has:
   - `document_path = gcs_upload_tokens.resolved_path` for the qualifying token

All three must be satisfied before the 48-hour clock starts.

---

## 3. Observation Window Timeline

```
2026-05-17T01:44:11Z  ── Window opened; baseline recorded
        │
        ├── [CHECK #1] 2026-05-17T01:46:18Z — M-5 baseline confirmed; no uploads yet
        ├── [PATCH]    2026-05-17T01:52Z    — FY format bug fixed (see §OB-001)
        ├── [CHECK #2] 2026-05-17T01:52:02Z — M-5 confirmed; no uploads; patch live
        │
        ▼
[first qualifying production upload occurs]
        │
        ├── 48-hour clock starts
        ├── E-POST-6 evidence captured (document_path parity)
        ├── E-POST-7 evidence captured (download smoke test)
        │
        ▼
[48 hours elapse with zero alert conditions]
        │
        ▼
[earliest close: 48h after first qualifying upload]
        │
        ▼
[Engineering sign-off recorded]  ── S-15 met
        │
        ▼
Wave 0 CLOSED — Wave 1 unblocked
```

---

## 4. Monitoring Queries

### Query M-1 — Production Token Check

```sql
SELECT
  t.id                AS token_id,
  t.resolved_path,
  t.token_values,
  t.issued_to,
  t.version_id,
  t.expires_at,
  t.used_at,
  t.used_for_path,
  (t.used_for_path = t.resolved_path) AS path_integrity,
  t.notes,
  (t.expires_at > NOW()) AS still_live
FROM gcs_upload_tokens t
WHERE t.rule_id = 27
  AND t.notes NOT LIKE 'WAVE 0%'
ORDER BY t.id;
```

**Expected at first check**: 0 rows  
**When qualifying upload occurs**: ≥1 row with `used_at IS NOT NULL`

### Query M-2 — Monitor Log Check

```sql
SELECT
  m.id,
  m.detected_gcs_path,
  m.path_conforms,
  m.violation_reason,
  m.file_size_bytes,
  m.mime_type,
  m.uploaded_by,
  m.route_file,
  m.detected_at
FROM gcs_upload_monitor_log m
WHERE m.matched_rule_id = 27
  AND m.id > 1
ORDER BY m.id;
```

**Expected at first check**: 0 rows  
**When qualifying upload occurs**: ≥1 row with `path_conforms = true`

### Query M-3 — BRC document_path Parity (E-POST-6)

```sql
SELECT
  brc.id                AS brc_id,
  brc.certificate_number,
  brc.document_path,
  t.id                  AS token_id,
  t.resolved_path,
  (brc.document_path = t.resolved_path) AS path_matches,
  t.used_at             AS upload_completed_at
FROM bank_realization_certificates brc
JOIN gcs_upload_tokens t
  ON brc.document_path = t.resolved_path
  AND t.rule_id = 27
  AND t.notes NOT LIKE 'WAVE 0%'
ORDER BY t.used_at DESC
LIMIT 10;
```

**Expected when qualifying upload occurs**: ≥1 row with `path_matches = true`

### Query M-4 — Expired Unused Token Audit (alert signal)

```sql
SELECT
  id, resolved_path, expires_at, issued_to, notes,
  EXTRACT(EPOCH FROM (NOW() - expires_at))/60 AS minutes_since_expiry
FROM gcs_upload_tokens
WHERE rule_id = 27
  AND notes NOT LIKE 'WAVE 0%'
  AND used_at IS NULL
  AND expires_at < NOW()
ORDER BY expires_at;
```

**Expected throughout window**: 0 rows  
**Alert if**: any rows appear

### Query M-5 — Complete Summary Dashboard

```sql
SELECT
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%')                                     AS prod_tokens_total,
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%' AND used_at IS NOT NULL)             AS prod_tokens_consumed,
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%' AND used_at IS NULL AND expires_at <= NOW()) AS prod_tokens_expired_unused,
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1)                                                AS prod_monitor_entries,
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1 AND path_conforms = true)                      AS prod_monitor_conforming,
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1 AND path_conforms = false)                     AS prod_monitor_violations,
  (SELECT COUNT(*) FROM bank_realization_certificates brc
   JOIN gcs_upload_tokens t ON brc.document_path = t.resolved_path
   WHERE t.rule_id=27 AND t.notes NOT LIKE 'WAVE 0%')                                 AS prod_brc_path_matches,
  '2026-05-17T01:44:11.883Z'::timestamptz                                             AS window_opened_at,
  NOW()                                                                                AS current_time,
  EXTRACT(EPOCH FROM (NOW() - '2026-05-17T01:44:11.883Z'::timestamptz))/3600         AS hours_elapsed;
```

### Query M-6 — Alert: 403 / Upload Failure Detection

Scan application logs via `refresh_all_logs` for:
- `[BRC-Token]` errors
- HTTP 403 at `/api/finance/brc/upload-token` or `/api/finance/upload/gcs`
- HTTP 500 at either endpoint

---

## 5. Alert Conditions

| # | alert condition | action |
|---|---|---|
| A-1 | `path_conforms = false` in monitor log | STOP — path template or token resolution error |
| A-2 | `document_path ≠ resolved_path` for a production BRC record | STOP — client UI bug investigation required |
| A-3 | Production expired unused tokens | INVESTIGATE — UI flow timeout |
| A-4 | HTTP 403 for a legitimate upload | INVESTIGATE — token validation failure |
| A-5 | HTTP 500 at token issuance endpoint | STOP — governance service or DB error |
| A-6 | `used_for_path ≠ resolved_path` on consumed token | STOP — critical governance violation |

---

## 6. Window Close Criteria

| # | criterion | source |
|---|---|---|
| WC-1 | ≥1 qualifying production upload (M-1: `used_at IS NOT NULL`) | M-1 |
| WC-2 | 48 hours elapsed since first qualifying upload | Timeline |
| WC-3 | Zero alert conditions A-1 through A-6 during window | All queries |
| WC-4 | M-3 confirms `document_path = resolved_path` ≥1 production BRC | M-3 |
| WC-5 | M-2 confirms `path_conforms = true` for all production monitor entries | M-2 |
| WC-6 | M-4 shows 0 expired unused tokens (or all investigated) | M-4 |
| WC-7 | Download smoke test: HTTP 200 for first token-uploaded BRC | Manual |
| WC-8 | Engineering sign-off recorded | §10 |

---

## 7. Monitoring Check Log

| check# | timestamp | prod_tokens | consumed | monitor_entries | violations | expired_unused | brc_matches | alert | notes |
|---|---|---|---|---|---|---|---|---|---|
| 0 (baseline) | 2026-05-17T01:44:11Z | 0 | 0 | 0 | 0 | 0 | 0 | none | Window opened. Baseline clean. |
| 1 | 2026-05-17T01:46:18Z | 0 | 0 | 0 | 0 | 0 | 0 | none | No production uploads yet. M-6 clean (0 errors). FY bug found during audit — see §OB-001. |
| 2 | 2026-05-17T01:52:02Z | 0 | 0 | 0 | 0 | 0 | 0 | none | Patch live. M-6 clean. No uploads. 48h clock not started. |

---

## OB-001 — FY Token Format Bug (Found and Fixed 2026-05-17T01:52Z)

### Classification

Pre-upload discovery — **found and patched before any production token was issued**.  
No data corruption occurred. No BRC records affected.

### Finding

`server/finance-routes-fixed.ts` line 1353 computed the `{FY}` token value in YYYY format (calendar year) instead of the required YYZZ format (Indian financial year, April–March cycle).

**Broken code (removed):**
```typescript
// FY = calendar year of invoice issue date (preserves existing Accounts/{YYYY}/... pattern)
const fy = String(date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1);
```

**What this would have produced:**

| invoice date | FY (broken) | FY (required) | wrong path | correct path |
|---|---|---|---|---|
| 2025-12-15 | 2025 | 2526 | Accounts/2025/INV-2526-056.pdf | Accounts/2526/INV-2526-056.pdf |
| 2026-05-10 | 2026 | 2627 | Accounts/2026/INV-2627-056.pdf | Accounts/2627/INV-2627-056.pdf |
| 2026-04-01 | 2026 | 2627 | Accounts/2026/INV-2627-001.pdf | Accounts/2627/INV-2627-001.pdf |
| 2026-01-20 | 2025 | 2526 | Accounts/2025/INV-2526-001.pdf | Accounts/2526/INV-2526-001.pdf |
| 2027-03-31 | 2026 | 2627 | Accounts/2026/INV-2627-060.pdf | Accounts/2627/INV-2627-060.pdf |

### Token Registry Confirmation

`gcs_governance_token_registry` entry for `FY`:
```
token_name      : FY
description     : Financial year
example_value   : 2627
source_description: Financial year in YYZZ format
```

YYZZ is the authoritative spec. The broken code contradicted this registry definition.

### Root Cause

The comment on the broken line said "preserves existing `Accounts/{YYYY}/...` pattern" — the developer aligned with the old pre-governance bucket structure (which used YYYY) rather than the token registry spec (YYZZ). The 123 existing BRC records in the database all use YYYY paths (`Accounts/2025/`, `Accounts/2024/`, etc.) because they were uploaded before the governance gate was applied.

### Fix Applied

**Patched code (lines 1353–1359 of `server/finance-routes-fixed.ts`):**
```typescript
// FY = Indian financial year in YYZZ format (April–March cycle).
// e.g. Apr 2026–Mar 2027 → "2627";  Jan 2026 (pre-April) → "2526".
// Matches token registry spec: FY exampleValue='2627', sourceDescription='YYZZ format'.
const date = new Date(issueDate);
const fyStartYear = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
const fy = String(fyStartYear).slice(-2) + String(fyStartYear + 1).slice(-2);
```

### Verification

All 5 boundary-condition test cases PASS after patch:

| invoice date | fyStartYear | FY (YYZZ) | resolved_path |
|---|---|---|---|
| 2026-05-10 | 2026 | 2627 | Accounts/2627/INV-2627-056.pdf |
| 2025-12-15 | 2025 | 2526 | Accounts/2526/INV-2526-056.pdf |
| 2026-01-20 | 2025 | 2526 | Accounts/2526/INV-2526-001.pdf |
| 2026-04-01 | 2026 | 2627 | Accounts/2627/INV-2627-001.pdf |
| 2027-03-31 | 2026 | 2627 | Accounts/2627/INV-2627-060.pdf |

### Impact on Existing BRC Records

The 123 pre-governance BRC records with `document_path` in YYYY format (`Accounts/2025/...`) are **not affected** — they were uploaded before the governance gate existed and reference real files at those paths in GCS. The governance token gate applies only to new uploads (Wave 0 onwards).

Going forward, all governance-gated BRC uploads will land in YYZZ paths (`Accounts/2526/...`, `Accounts/2627/...`).

### Status: RESOLVED

No corrective action required for existing records. Patch is live. First production upload will use the corrected YYZZ path.

---

## OB-002 — FY Format Scope Audit (2026-05-17T01:52Z)

### Scope: All Code Paths for FY Computation

| location | FY computation | format | status |
|---|---|---|---|
| `server/finance-routes-fixed.ts` line 1358–1359 | `fyStartYear` → YYZZ slice formula | **YYZZ** | PASS (patched) |
| `client/src/lib/utils.ts` `getIndianFinancialYear()` | `startYear.slice(-2) + endYear.slice(-2)` | **YYZZ** | PASS |
| `server/services/gcs-governance-service.ts` lines 712–719 | `startYear.slice(-2) + endYear.slice(-2)` (payroll ref) | YYZZ | N/A — payroll refs, not BRC paths |
| `gcs_governance_token_registry` FY entry | `example_value='2627'`, `source_description='YYZZ format'` | **YYZZ** | Registry spec authoritative |
| Existing 123 BRC `document_path` values | Pre-governance YYYY (`2025`, `2024`, etc.) | YYYY | Pre-governance, not token-gated — expected |

### FY Token in `issueUploadToken()` Call

The `tokenValues: { FY: fy, filename }` on line 1368 now passes a YYZZ string.  
The `resolvedPath` returned by `issueUploadToken()` will be `Accounts/2526/INV-2526-056.pdf` for BRC id=98.

### No Other BRC-Specific FY Computations Found

A full grep of `server/finance-routes-fixed.ts` for `getFullYear`, `fy`, `FY`, `financialYear` found no other instances that could independently compute an incorrect FY for BRC token issuance. The download route (`GET /finance/brc/:id/document`) does not compute FY at all — it serves the file at the stored `document_path`.

---

## 8. First Production Upload Evidence (to be populated)

*This section is populated when WC-1 is first satisfied.*

### Token Record

```
token_id        :
resolved_path   :  (expected format: Accounts/YYZZ/INV-YYZZ-NNN.pdf)
token_values    :  (expected: { "FY": "YYZZ", "filename": "INV-YYZZ-NNN.pdf" })
issued_to       :
version_id      :
issued_at       :
used_at         :
used_for_path   :
path_integrity  :
notes           :
```

### Monitor Log Entry

```
log_id            :
matched_rule_id   :
detected_gcs_path :
path_conforms     :
violation_reason  :
file_size_bytes   :
mime_type         :
uploaded_by       :
detected_at       :
```

### BRC Record Parity (E-POST-6)

```
brc_id            :
certificate_number:
document_path     :
token_resolved_path:
path_matches      :
upload_completed  :
```

### Download Smoke Test (E-POST-7)

```
endpoint         : GET /api/finance/brc/{brc_id}/document
http_status      :
content_type     :
file_served      :
tested_at        :
```

### 48-Hour Clock

```
first_upload_at  :
window_closes_at :
```

---

## 9. PASS / FAIL Summary (to be completed at window close)

| # | criterion | status | evidence |
|---|---|---|---|
| S-9 | `brc.document_path = gcs_upload_tokens.resolved_path` | PENDING | §8 BRC parity |
| S-10 | Download of token-uploaded BRC succeeds | PENDING | §8 download test |
| S-14 | 48-hour observation window completed | PENDING | §8 48h clock |
| S-15 | Engineering sign-off | PENDING | §10 below |

---

## 10. Engineering Sign-Off (to be completed at window close)

```
Sign-off by     :
Date/time       :
Decision        : [ ] PASS — Wave 1 unblocked  [ ] FAIL — investigation required
Notes           :
```

---

## Appendix — Token Verification Checklist (per production upload)

For each qualifying production upload, verify:

- [ ] `resolved_path` matches pattern `^Accounts/[0-9]{2}[0-9]{2}/[^/]+\.pdf$` (YYZZ format, e.g. `Accounts/2526/...` or `Accounts/2627/...`)
- [ ] `token_values` contains `FY` in YYZZ format (e.g. `"FY": "2526"`) and `filename` (`{invoiceNumber}.pdf`)
- [ ] `used_at IS NOT NULL` (upload completed)
- [ ] `used_for_path = resolved_path` (path integrity)
- [ ] `path_conforms = true` in monitor log
- [ ] `violation_reason IS NULL` in monitor log
- [ ] `bank_realization_certificates.document_path = resolved_path`
- [ ] `document_path` is in YYZZ format (`Accounts/2526/` or `Accounts/2627/`), NOT YYYY format (`Accounts/2025/`)
- [ ] No `Accounts/` hardcoded string in upload flow (re-confirm line 1442 of finance-routes-fixed.ts)
- [ ] No application 403/500 errors attributable to this upload

---

*Window opened: 2026-05-17T01:44:11.883Z*  
*Last updated: 2026-05-17T01:52:02Z (Check #2 + OB-001 FY fix + OB-002 scope audit)*  
*Audit log event: gcs_governance_audit_log id=1*  
*Wave 1 blocked until §10 sign-off*
