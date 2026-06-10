# THERMOPAC Dual-Storage Policy — Proposal v1.0

**Status**: Proposed — Pending Approval  
**Author**: THERMOPAC ERP  
**Date**: 2026-06-10  

---

## 1. Problem Statement

Currently, all document uploads in the ERP write **only to GCS**. The Windows file server (`\\SERVER\d\THERMOPAC`) receives no copy.

This creates a gap:
- THERMOPAC operations rely on Windows file server access via Windows Explorer / desktop tools
- GCS is cloud-only — not directly accessible from the Windows server environment
- If GCS is unavailable, uploaded documents cannot be accessed locally
- The Windows server currently holds the historical archive; new uploads bypass it entirely

---

## 2. Proposed Policy

**Every document uploaded via the ERP must be written to two storage locations:**

| Layer | Storage | Authority |
|---|---|---|
| Primary | Google Cloud Storage (GCS) | Source of truth for all ERP operations |
| Secondary | Windows file server via Local Document Agent | Mirror for local/desktop access |

GCS is always written first. The Windows copy is dispatched as an async agent job immediately after GCS succeeds.

---

## 3. Path Symmetry

The GCS relative path and the Windows relative path are **identical** for all document types. The agent prepends `allowedRootPath` from its own config.

**Example — Company GST Certificate:**

| Layer | Path |
|---|---|
| GCS (full) | `gs://thermopac_storage/TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| GCS (relative) | `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| Agent relative | `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| Windows (full) | `\\SERVER\d\THERMOPAC\TPEL\COMPANY\TPEL\GST_CERTIFICATE\rev-01\001-gst_certificate.pdf` |

**Rule**: GCS path = Agent relative path (same string). No translation needed.

---

## 4. Mechanism — How the Secondary Write Works

The Local Windows Document Agent already supports a `SAVE_FILE` job type. The dual-storage flow uses this job type.

### Flow (per upload)

```
Browser → ERP upload endpoint
    │
    ├─ 1. Upload file buffer → GCS              (synchronous, primary)
    │       ↓ success
    ├─ 2. Generate GCS signed URL (15 min TTL)  (for agent to download the file)
    │
    ├─ 3. INSERT document_agent_jobs row         (job_type = SAVE_FILE)
    │       payload = {
    │         gcs_signed_url: <url>,             ← agent downloads from here
    │         local_relative_path: <gcs_path>,  ← same as GCS path
    │         sha256: <hash of uploaded file>    ← for integrity check
    │       }
    │
    └─ 4. Return success to browser             (GCS write confirmed)

Windows Agent (polling every 30s):
    ├─ Claims SAVE_FILE job
    ├─ Downloads file from signed URL
    ├─ Verifies SHA-256 hash
    ├─ Creates folder structure if missing
    ├─ Writes file to full local path
    └─ Reports result → job marked complete/failed
```

GCS write failure → upload aborted, no agent job created.  
Agent job failure → GCS copy remains authoritative; job logged as failed; retry possible.

---

## 5. Scope — Phase 1 (Proposed)

Phase 1 covers **Company Information documents only**:

| Document Type | GCS Path Pattern | Dual-Storage |
|---|---|---|
| GST_CERTIFICATE | `TPEL/COMPANY/{code}/GST_CERTIFICATE/rev-{N}/001-gst_certificate.{ext}` | ✅ |
| PAN_CARD | `TPEL/COMPANY/{code}/PAN_CARD/rev-{N}/001-pan_card.{ext}` | ✅ |
| IEC_CERTIFICATE | `TPEL/COMPANY/{code}/IEC_CERTIFICATE/rev-{N}/001-iec_certificate.{ext}` | ✅ |
| LUT_COPY | `TPEL/COMPANY/{code}/LUT_COPY/rev-{N}/001-lut_copy.{ext}` | ✅ |
| MSME_CERTIFICATE | `TPEL/COMPANY/{code}/MSME_CERTIFICATE/rev-{N}/001-msme_certificate.{ext}` | ✅ |
| CANCELLED_CHEQUE | `TPEL/COMPANY/{code}/CANCELLED_CHEQUE/rev-{N}/001-cancelled_cheque.{ext}` | ✅ |
| INCORPORATION_CERTIFICATE | `TPEL/COMPANY/{code}/INCORPORATION_CERTIFICATE/rev-{N}/001-incorporation_certificate.{ext}` | ✅ |
| FACTORY_LICENSE | `TPEL/COMPANY/{code}/FACTORY_LICENSE/rev-{N}/001-factory_license.{ext}` | ✅ |
| PF_ESI_DOCUMENTS | `TPEL/COMPANY/{code}/PF_ESI_DOCUMENTS/rev-{N}/001-pf_esi_documents.{ext}` | ✅ |

**Out of scope for Phase 1** (future phases):
- EPC project documents (PPPC datasheets, final offers, DDS, DWG)
- Vendor documents
- HR / Employee documents
- Branding assets (logo, signature)

---

## 6. Database Changes

One new table: `document_agent_jobs`

```sql
CREATE TABLE document_agent_jobs (
  id              SERIAL PRIMARY KEY,
  job_type        TEXT NOT NULL DEFAULT 'SAVE_FILE',
  source_module   TEXT NOT NULL,          -- 'company_documents', 'epc_docs', etc.
  source_record_id INTEGER NOT NULL,      -- FK to source table row
  gcs_path        TEXT NOT NULL,
  local_relative_path TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  signed_url      TEXT,                   -- populated at job creation; expires
  signed_url_expires_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending',   -- pending|claimed|complete|failed
  claimed_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INTEGER
);
```

> **Note**: The existing `document_agent_jobs` table used by the Agent Jobs Monitor may already exist. The implementation must check and extend it if needed rather than create a duplicate.

---

## 7. Agent Job Retry Policy

| Scenario | Behaviour |
|---|---|
| Signed URL expired before agent claims job | ERP refreshes signed URL on next claim attempt |
| Agent download fails (network) | Job marked failed; retry after 5 min; max 3 retries |
| SHA-256 mismatch | Job marked failed; not retried automatically; requires manual re-upload |
| Folder creation fails | Job marked failed; agent reports OS error detail |
| Agent offline | Jobs remain pending until agent reconnects; no timeout expiry for pending jobs |

---

## 8. UI — Agent Job Status Visibility

On the **Company Information → Documents** table, each row gets a secondary indicator:

| GCS Status | Agent Status | Indicator shown |
|---|---|---|
| uploaded | complete | ✅ Local copy confirmed |
| uploaded | pending / claimed | ⏳ Local copy pending |
| uploaded | failed | ⚠️ Local copy failed (with retry button) |
| uploaded | no job created | — (legacy uploads pre-policy) |

The retry button re-dispatches a new `SAVE_FILE` agent job for that document.

---

## 9. Failure Handling — GCS as Authoritative Source

- GCS is always written first. If GCS fails, no agent job is created and the upload is rejected.
- If the agent job fails, GCS remains the authoritative copy. The document is accessible via the ERP (signed URL download).
- The agent job failure does NOT roll back the GCS write.
- Failed agent jobs are visible in **Admin → Agent Jobs Monitor**.

---

## 10. Exclusions

The following are explicitly excluded from this policy:

| Item | Reason |
|---|---|
| Branding assets (logo, seal, signature) | Internal ERP display only; not a governed document |
| SolidWorks extraction job results | Ephemeral processing artefacts; GCS path under `epc-slddrw/` |
| GCS-to-Windows sync of pre-existing historical files | Out of scope; handled by separate migration plan |
| Read operations (downloads, previews) | No change; GCS signed URL used for all reads |
| Windows-to-GCS sync | Not in scope; ERP is the write authority |

---

## 11. Open Questions (Require Decision Before Implementation)

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Does `document_agent_jobs` table already exist in DB? Must check schema before implementation. | Check required |
| Q2 | Signed URL TTL for agent download: 15 min or longer? | 60 min proposed (agent polls every 30s; may queue behind other jobs) |
| Q3 | Should the UI retry button be Superuser-only or available to any uploader? | Superuser-only proposed |
| Q4 | Phase 2 scope: which module is next after Company documents? | EPC documents proposed |
| Q5 | Should failed agent jobs trigger an email/notification to admin? | No notification in Phase 1 |

---

## 12. Proposed Implementation Phases

| Phase | Scope | Status |
|---|---|---|
| Phase 1 | Company Information documents — dual storage | 🟡 Proposed |
| Phase 2 | EPC documents (PPPC datasheets, final offers) | ⏳ Future |
| Phase 3 | Vendor documents | ⏳ Future |
| Phase 4 | HR / Employee documents | ⏳ Future |

---

## 13. Approval Required

Before implementation begins:

1. Confirm Phase 1 scope (Company documents only) ✅/❌  
2. Confirm GCS = source of truth, Windows = mirror ✅/❌  
3. Confirm signed URL TTL (proposed: 60 min) ✅/❌  
4. Confirm retry button visibility (proposed: Superuser-only) ✅/❌  
5. Confirm no notification on agent job failure in Phase 1 ✅/❌  
