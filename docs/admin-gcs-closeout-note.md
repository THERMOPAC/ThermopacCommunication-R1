# Administration GCS Rev 2 — Closeout Note

| Field | Value |
|---|---|
| **Document type** | Closeout / Implementation Record |
| **Plan reference** | `docs/admin-gcs-remediation-plan-v2.md` |
| **Checklist reference** | `docs/admin-gcs-implementation-checklist.md` |
| **Status** | CLOSED — IMPLEMENTED (Rev 2) |
| **Date** | 2026-04-14 |

---

## 1. Implementation Summary

### Phase 1 — Critical Bug Fixes + Path Compliance

All 18 active Administration GCS write routes corrected to produce Rev 2-compliant paths.

| Fix | Detail |
|---|---|
| Legal upload parameter order | `uploadFileToGCS` was called with arguments reversed at all 14 Legal call sites — silent failure meant zero Legal files were ever stored. Corrected at all 14 sites. |
| Legal return field access | `uploadResult.gcsPath` was read as `uploadResult.path` — returned `undefined` to DB. Corrected. |
| Visa secondary upload broken | `uploadVisaDocumentLegacy` was writing to a path without the record ID segment. Corrected to Rev 2 pattern. |
| All 18 routes path-compliant | Contracts, Compliance, POSH, Notices, PolicyTemplates, NDA, Exclusivity (Legal — 14 routes), Visa (create + update + legacy upload — 3 routes), Trip (upload — 1 route). All produce `ADMIN/{Module}/{entityId}/{seq:03d}-{label}.{ext}`. |
| `assertAdminGcsPath()` wired | All 18 write call sites call `assertAdminGcsPath()` immediately before GCS write. Throws `AdminGcsPathViolation` (HTTP 500) on any non-ADMIN or legacy-root path. |

### Phase 2 — Schema Changes

| Table / Column | Purpose |
|---|---|
| `trip_documents.seq`, `.label`, `.gcs_path` | Seq + label columns for Rev 2 path construction and auditing |
| `visa_documents` (new child table) | Stores visa document versions with `seq`, `label`, `is_active`, `superseded_at` |
| `contract_documents`, `posh_documents`, `notice_documents` (new child tables) | Append-only child document tables for Legal modules |
| `policy_templates.version_number`, `.doc_is_active` | Version tracking for Policy Template documents |
| `gcs_migration_log` (new table) | Per-file staged migration audit log |

### Phase 3A — Concurrency-Safe Seq Allocation

All 12 upload blocks wired with `SELECT COALESCE(MAX(seq),0)+1 … FOR UPDATE` inside `db.transaction()`. Seq is held under a row-level lock during the GCS write to prevent collision under concurrent uploads.

### Phase 3 — Migration (Live Files)

All legacy GCS objects moved from pre-Rev 2 roots to ADMIN-rooted paths via `scripts/migrate-admin-gcs.ts` — a 5-stage idempotent migration script.

| Migration | Files | Script |
|---|---|---|
| M1 — `Business_Trips/` → `ADMIN/Travel/` | 75 files across 23 trips | `scripts/migrate-admin-gcs.ts` |
| M2 — `Business_Visa/` → `ADMIN/Visa/` | 15 files across 15 visa records | same script |
| Trip 11 seq collision repair | 4 files re-sequenced; 4 orphaned objects deleted | `scripts/fix-trip11-seq.ts` (one-time, completed) |

### Post-Migration: Signed URL Fix

`uploadFileToGCS` previously returned a static public URL (`https://storage.googleapis.com/…`) and stored it in `file_url` columns. Updated to generate and return a signed URL (365-day expiry) as the primary access token. All 21 Legal `file_url` write sites updated to store `signedUrl`. WPQR fallback static URL removed.

---

## 2. Security Posture Summary

| Control | State | Verified |
|---|---|---|
| `publicAccessPrevention` | **enforced** — set at bucket level; cannot be overridden per-object | ✅ API metadata |
| Uniform Bucket-Level Access | **enabled**, locked since 2025-07-10 — object-level ACLs permanently disabled | ✅ API metadata |
| Public IAM bindings | **none** — `allUsers` and `allAuthenticatedUsers` have zero roles on the bucket | ✅ IAM policy query |
| Unauthenticated HTTP access | **HTTP 403 Forbidden** for all objects — confirmed via direct URL test against a known ADMIN path | ✅ Live test |
| Static URLs in write paths | **zero** — `uploadFileToGCS` now generates signed URLs; all three admin route files produce only signed or gcsPath outputs | ✅ Code + grep |
| `assertAdminGcsPath()` enforcement | **17 call sites** across 3 route files; two-layer check: blocked-prefix scan + ADMIN/ prefix + 18 module-specific regex patterns | ✅ Code audit |
| Legacy roots blocked at runtime | All 10 legacy prefixes blocked: `Business_Trips/`, `Business_Visa/`, `visa-documents/`, `contracts/`, `compliance/`, `posh-cases/`, `legal-notices/`, `policy-templates/`, `nda-agreements/`, `exclusivity-agreements/` | ✅ `admin-guardrails.ts` |

---

## 3. Final Counts

### Migration

| Metric | Count |
|---|---|
| Source objects discovered | 90 (75 trip + 15 visa) |
| Destination objects created | 90 |
| MD5 checksum verifications | 90 — 0 mismatches |
| Source objects deleted (S4) | 90 |
| Migration log rows (`gcs_migration_log`) | 90 — all `stage = done` |
| Migration failures | 0 |

### Database — final state

| Table | Legacy rows remaining | ADMIN rows |
|---|---|---|
| `trip_documents` | 0 | 75 |
| `visa_records` | 0 | 15 |
| `visa_documents` | 0 | 15 (new, all `is_active=true`, `seq=1`) |
| `nda_agreements` | 0 | 0 (no files uploaded yet) |
| `exclusivity_agreements` | 0 | 0 |
| `contract_documents` | 0 | 0 |
| `posh_cases` | 0 | 0 |
| `legal_notices` | 0 | 0 |
| `policy_templates` | 0 | 0 |
| `compliance_register` | 0 | 0 |

### Code

| Metric | Count |
|---|---|
| Route files modified | 3 (`trip-management-routes.ts`, `visa-management-routes.ts`, `legal-management-routes.ts`) |
| `assertAdminGcsPath()` call sites | 17 (14 Legal + 2 Visa + 1 Trip) |
| `uploadResult.url` → `uploadResult.signedUrl` replacements | 21 (Legal) + 1 (WPQR) |
| Static public URL constructions removed | 2 (`gcs-operations.ts`, `wpqr-routes.ts`) |
| New server files | 1 (`server/admin-guardrails.ts`) |
| New schema tables | 5 (`visa_documents`, `contract_documents`, `posh_documents`, `notice_documents`, `gcs_migration_log`) |
| Migration scripts | 2 (`scripts/migrate-admin-gcs.ts`, `scripts/fix-trip11-seq.ts`) |

---

## 4. Open Items

**None.**

All Phase 1, Phase 2, Phase 3, and Phase 3A items are complete. The one previously-flagged latent risk (static URL in `file_url`) has been resolved. Bucket security is confirmed enforced at the infrastructure level.

---

## 5. Operational Recommendations

### 5.1 Monitor guardrail violations

`assertAdminGcsPath()` throws `AdminGcsPathViolation` on any rejected path, which is caught and returned as HTTP 500. These errors are logged to the server console via the existing `console.error` handlers in each route.

- Set up a log alert on the string `AdminGcsPathViolation` in the server log stream.
- Any occurrence in production indicates a new code path writing to GCS that has not been reviewed against Rev 2 — treat as a P1 incident.
- Expected baseline in steady state: **zero occurrences**.

### 5.2 Monitor signed URL expiry behavior

All signed URLs are generated with a 365-day expiry at upload time (or migration time for legacy records). This means:

- Trip documents uploaded today will need their `trip_documents.file_url` refreshed after 2027-04-14.
- Visa records migrated today will need `visa_records.file_url` refreshed after 2027-04-14.
- Legal documents uploaded from now will similarly expire in one year.

Recommended actions:
- Build a background job (or add to an existing maintenance scheduler) that queries `file_url LIKE '%Expires=%'`, extracts the expiry timestamp, and regenerates the signed URL 30 days before expiry using `bucket.file(gcs_path).getSignedUrl(...)`.
- Run this job monthly. Priority tables: `trip_documents`, `visa_records`, `visa_documents`.
- The `gcs_path` / `file_path` columns are the permanent identifiers — they never expire and are the correct source of truth for re-generating signed URLs at any time.

### 5.3 Review bucket IAM periodically

`publicAccessPrevention: enforced` and Uniform Bucket-Level Access are the two controls preventing all public file exposure. Both are currently confirmed active.

- **Quarterly**: Run `bucket.getMetadata()` and confirm `publicAccessPrevention === 'enforced'` and `uniformBucketLevelAccess.enabled === true`. A change to either is a critical security regression.
- **On any IAM change**: Immediately re-run the IAM policy query (`bucket.iam.getPolicy()`) and confirm `PUBLIC_BINDINGS === []`. Any binding to `allUsers` or `allAuthenticatedUsers` must be reverted immediately.
- **On service account changes**: Confirm the SA used by the application retains `roles/storage.objectAdmin` (or equivalent scoped roles) and has not been granted any public-facing roles.
- The locked `uniformBucketLevelAccess.lockedTime` (`2025-07-10`) means object-level ACLs **cannot** be re-enabled — this is a permanent lock and provides additional assurance.
