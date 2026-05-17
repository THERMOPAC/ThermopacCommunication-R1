# GCS Governance — Wave 0 Production Observation Log
## finance / BRC_DOCUMENT (rule_id=27, version_id=23)

**Window status**: OPEN  
**Window opened**: 2026-05-17T01:44:11.883Z  
**Window closes (earliest)**: 2026-05-19T01:44:11.883Z (48h after first qualifying production upload — see §3)  
**Audit log event**: `gcs_governance_audit_log` id=1, `event_type='wave0_observation_window_open'`  
**Wave 1 status**: BLOCKED until this window closes with all criteria met  
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
2026-05-19T01:44:11Z (or later)  ── Window may close
        │
        ▼
[Engineering sign-off recorded]  ── S-15 met
        │
        ▼
Wave 0 CLOSED — Wave 1 unblocked
```

---

## 4. Monitoring Queries

Run these queries at each monitoring check to assess window status.

### Query M-1 — Production Token Check (run first at each check)

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

**Expected at first check**: 0 rows (no production tokens yet)  
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

**Expected at first check**: 0 rows (beyond Wave 0 test entry id=1)  
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

**Expected throughout window**: 0 rows (no abandoned production tokens)  
**Alert if**: any rows appear

### Query M-5 — Complete Summary Dashboard

```sql
SELECT
  -- Token counts (production only)
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%')                                     AS prod_tokens_total,
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%' AND used_at IS NOT NULL)             AS prod_tokens_consumed,
  (SELECT COUNT(*) FROM gcs_upload_tokens
   WHERE rule_id=27 AND notes NOT LIKE 'WAVE 0%' AND used_at IS NULL AND expires_at <= NOW()) AS prod_tokens_expired_unused,

  -- Monitor log
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1)                                                AS prod_monitor_entries,
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1 AND path_conforms = true)                      AS prod_monitor_conforming,
  (SELECT COUNT(*) FROM gcs_upload_monitor_log
   WHERE matched_rule_id=27 AND id > 1 AND path_conforms = false)                     AS prod_monitor_violations,

  -- BRC parity
  (SELECT COUNT(*) FROM bank_realization_certificates brc
   JOIN gcs_upload_tokens t ON brc.document_path = t.resolved_path
   WHERE t.rule_id=27 AND t.notes NOT LIKE 'WAVE 0%')                                 AS prod_brc_path_matches,

  -- Observation window
  '2026-05-17T01:44:11.883Z'::timestamptz                                             AS window_opened_at,
  NOW()                                                                                AS current_time,
  EXTRACT(EPOCH FROM (NOW() - '2026-05-17T01:44:11.883Z'::timestamptz))/3600         AS hours_elapsed;
```

### Query M-6 — Alert: 403 / Upload Failure Detection

Check application logs via `refresh_all_logs` for patterns:
- `[BRC-Token]` errors
- `validateUploadToken.*FAIL` 
- HTTP 403 at `/api/finance/brc/upload-token` or `/api/finance/upload/gcs`
- HTTP 500 at either endpoint

---

## 5. Alert Conditions

If any of the following occur, the observation window is paused pending investigation. Wave 1 remains blocked.

| # | alert condition | query | action |
|---|---|---|---|
| A-1 | `path_conforms = false` in monitor log (M-2) | M-2 shows `violation_reason IS NOT NULL` | STOP — path template or token resolution error. Investigate before any further uploads |
| A-2 | `document_path ≠ resolved_path` for a production BRC record (M-3) | M-3 shows `path_matches = false` | STOP — client not passing `filePath` to BRC create. UI bug investigation required |
| A-3 | Production expired unused tokens (M-4) | M-4 returns any rows | INVESTIGATE — client initiated upload but did not complete within TTL. Check for UI flow timeout |
| A-4 | HTTP 403 for a legitimate upload (not a test) | App logs | INVESTIGATE — token validation failure for real user upload |
| A-5 | HTTP 500 at token issuance endpoint | App logs | STOP — governance service or DB error. Investigation required |
| A-6 | `used_for_path ≠ resolved_path` on a consumed token | M-1 shows `path_integrity = false` | STOP — critical governance violation. Path mismatch at consumption |

---

## 6. Window Close Criteria

The window may be closed and Wave 0 declared complete when ALL of the following are true:

| # | criterion | source |
|---|---|---|
| WC-1 | At least 1 qualifying production upload observed (M-1: ≥1 row with `used_at IS NOT NULL`) | M-1 |
| WC-2 | 48 hours elapsed since first qualifying upload | Timeline |
| WC-3 | Zero alert conditions A-1 through A-6 triggered during window | All monitoring queries |
| WC-4 | M-3 confirms `document_path = resolved_path` for ≥1 production BRC record | M-3 |
| WC-5 | M-2 confirms `path_conforms = true` for all production monitor entries | M-2 |
| WC-6 | M-4 shows 0 expired unused tokens (or all investigated and explained) | M-4 |
| WC-7 | Download smoke test: `GET /api/finance/brc/{brc_id}/document` returns HTTP 200 for the first token-uploaded BRC | Manual |
| WC-8 | Engineering sign-off recorded with name and timestamp | This document §9 |

---

## 7. Monitoring Check Log

One entry per check. Add a row each time M-5 is run.

| check# | timestamp | prod_tokens_total | prod_tokens_consumed | prod_monitor_entries | violations | expired_unused | brc_path_matches | alert | notes |
|---|---|---|---|---|---|---|---|---|---|
| 0 (baseline) | 2026-05-17T01:44:11Z | 0 | 0 | 0 | 0 | 0 | 0 | none | Window opened. Baseline clean. |

---

## 8. First Production Upload Evidence (to be populated)

*This section is populated when WC-1 is first satisfied.*

### Token Record

```
token_id        :
resolved_path   :
token_values    :
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
| S-15 | Engineering sign-off | PENDING | §9 below |

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

- [ ] `resolved_path` matches pattern `^Accounts/[0-9]{4}/[^/]+\.pdf$`
- [ ] `token_values` contains `FY` (4-digit year) and `filename` (`{invoiceNumber}.pdf`)
- [ ] `used_at IS NOT NULL` (upload completed)
- [ ] `used_for_path = resolved_path` (path integrity)
- [ ] `path_conforms = true` in monitor log
- [ ] `violation_reason IS NULL` in monitor log
- [ ] `bank_realization_certificates.document_path = resolved_path`
- [ ] No `Accounts/` hardcoded string introduced by the upload flow (re-confirm line 1442 unchanged)
- [ ] No application 403/500 errors attributable to this upload

---

*Window opened: 2026-05-17T01:44:11.883Z*  
*Audit log event: gcs_governance_audit_log id=1*  
*Wave 1 blocked until this document reaches §10 sign-off*
