---
name: trip_documents path columns
description: Which column holds the real GCS path in trip_documents, and which records are ineligible for mirroring.
---

## Rule
`file_path` is the authoritative GCS object key for all eligible trip document records.
`gcs_path` is unreliable — older records have the old Windows-style path (`ADMIN/Travel/Employees/...`); newest records (uploaded after a route change) have it empty.

**Never use `gcs_path` as the GCS key for agent jobs or signed URLs.**

## Eligibility filter for mirror/GCS operations
```sql
WHERE file_path LIKE 'TPEL/%'
  AND is_active = true
  AND deleted_at IS NULL
```

## Pre-GCS records — permanently excluded
4 records (ids 5, 10, 12, 69) have `file_path = gcs_path = 'ADMIN/Travel/Employees/...'`.
These were uploaded before GCS adoption. No GCS object exists. Mark `not_applicable` or skip entirely.

**Why:** The `trip_documents` table predates the Dual-Storage Policy. The two path columns accumulated different meanings across upload eras.

**How to apply:** Any backfill, mirror job creation, or signed URL generation for trip documents must use `file_path` as the GCS key and exclude rows where `file_path NOT LIKE 'TPEL/%'`.

## Mirror backfill (completed 2026-06-15)
68 SAVE_FILE jobs created in `document_agent_jobs` (job ids 42–109), source_module='trip_documents'.
No schema changes were made to `trip_documents` — no mirror_status or mirror_job_id columns added.
Status tracking via Mirror Health Dashboard only (query document_agent_jobs by source_module).
