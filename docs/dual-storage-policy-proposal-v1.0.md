# THERMOPAC Dual-Storage Policy — Proposal v1.0

**Status**: Approved  
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

## 2. Approved Policy

**Every GCS-governed document uploaded via the ERP must be written to two storage locations:**

| Layer | Storage | Authority |
|---|---|---|
| Primary | Google Cloud Storage (GCS) | Source of truth for all ERP operations, reads, and downloads |
| Secondary | Windows file server via Local Document Agent | Mirror for local/desktop access |

GCS is always written first. The Windows mirror copy is dispatched as an async agent job immediately after GCS succeeds.

---

## 3. Path Symmetry

The GCS relative path and the Windows agent relative path are **identical** for all document types. The agent prepends `allowedRootPath` from its own `config.json` to form the full Windows path.

**Example — Company GST Certificate:**

| Layer | Path |
|---|---|
| GCS (full) | `gs://thermopac_storage/TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| GCS (relative) | `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| Agent relative | `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst_certificate.pdf` |
| Windows (full) | `\\SERVER\d\THERMOPAC\TPEL\COMPANY\TPEL\GST_CERTIFICATE\rev-01\001-gst_certificate.pdf` |

**Rule**: GCS relative path = agent `local_relative_path`. No translation required.

---

## 4. Mechanism — Upload Flow

The Local Windows Document Agent uses the existing `SAVE_FILE` job type. The dual-storage flow uses this job type.

### Step-by-step (per upload)

```
Browser → ERP upload endpoint
    │
    ├─ 1. Upload file buffer → GCS                  (synchronous, primary)
    │       ↓ success
    ├─ 2. Compute SHA-256 of uploaded buffer
    │
    ├─ 3. INSERT document_agent_jobs row             (job_type = SAVE_FILE)
    │       Fields stored:
    │         source_module        ← e.g. 'company_documents'
    │         source_record_id     ← FK to source table row
    │         gcs_path             ← full GCS relative path
    │         local_relative_path  ← same as gcs_path
    │         sha256               ← hash of uploaded file
    │         status               ← 'pending'
    │       No signed URL stored at this point.
    │
    └─ 4. Return success to browser                 (GCS write confirmed)
```

### Agent claim flow (polling every 30s)

```
Windows Agent → POST /api/local-agent/jobs/claim
    │
    ├─ ERP finds next pending SAVE_FILE job
    ├─ ERP generates a fresh GCS signed URL for gcs_path  ← generated on-demand
    ├─ ERP returns job payload including the fresh signed URL
    ├─ ERP marks job as 'claimed'
    │
    ├─ Agent downloads file from fresh signed URL
    ├─ Agent creates folder structure if missing
    ├─ Agent writes file to: allowedRootPath + local_relative_path
    ├─ Agent verifies SHA-256 of written file matches job sha256
    │
    └─ Agent → POST /api/local-agent/jobs/result
            ├─ success → job marked 'complete', completed_at set
            └─ failure → job marked 'failed', error_message stored
```

**Key properties of this design:**
- No signed URL is ever stored in the database — no expiry problem
- If the agent is offline, jobs remain `pending` indefinitely until the agent reconnects
- A fresh signed URL is generated at the moment the agent claims the job, guaranteeing it is always valid at download time

---

## 5. Mirror Confirmation Standard

A mirror copy is confirmed **only** when all four steps complete in sequence:

1. Agent downloads file from fresh signed URL ✅
2. Agent writes file to the full Windows path ✅
3. Agent verifies SHA-256 of written file matches stored sha256 ✅
4. Agent reports `complete` to ERP ✅

If any step fails, the job is marked `failed`. The GCS copy remains the authoritative source. The document is still accessible from the ERP via signed URL download.

---

## 6. Scope — All GCS-Governed Document Modules

This policy applies to every module that writes a document to GCS. Branding assets and ephemeral processing artefacts are excluded (see Section 10).

| Module | Source Table | Example GCS Path |
|---|---|---|
| Company Documents | `company_documents` | `TPEL/COMPANY/{code}/{docType}/rev-{N}/001-{label}.{ext}` |
| Vendor Compliance | `vendor_compliance_docs` | `TPEL/VENDOR/{CardCode}/{docType}/rev-{N}/{filename}` |
| Legal Management | `legal_documents` | `TPEL/LEGAL/{category}/{filename}` |
| QMS Calibration Certificates | `qms_document_revisions` | `TPEL/QMS/Calibration/{InstrumentCode}/rev-{N}/{filename}` |
| EPC PPPC Datasheets | `buy_list_line_selections` | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/DATASHEETS/...` |
| EPC Final Offer | `offers` | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/1_Sales/2_Final_Offer/...` |
| Design Data Sheets (DDS PDF) | `design_data_sheets` | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/2_Design/...` |
| PLC TBE Reports | `plc_evaluations` | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/3_Purchase/TBE/...` |

> Implementation order: modules are wired in by the implementation team based on priority. The policy applies to all; rollout is incremental.

---

## 7. Database — `document_agent_jobs` Table

The `document_agent_jobs` table already exists (used by Agent Jobs Monitor). The implementation must extend it with dual-storage columns rather than create a new table.

**Required columns** (add if not present):

```sql
ALTER TABLE document_agent_jobs
  ADD COLUMN IF NOT EXISTS source_module       TEXT,
  ADD COLUMN IF NOT EXISTS source_record_id    INTEGER,
  ADD COLUMN IF NOT EXISTS local_relative_path TEXT,
  ADD COLUMN IF NOT EXISTS sha256              TEXT;
```

**Full schema reference** (columns used by dual-storage jobs):

| Column | Type | Description |
|---|---|---|
| `id` | SERIAL PK | Job ID |
| `job_type` | TEXT | Always `SAVE_FILE` for dual-storage jobs |
| `source_module` | TEXT | Module that created the job (e.g. `company_documents`) |
| `source_record_id` | INTEGER | FK to source table row |
| `gcs_path` | TEXT | Full GCS relative path |
| `local_relative_path` | TEXT | Same as `gcs_path` |
| `sha256` | TEXT | SHA-256 hex of the uploaded file |
| `status` | TEXT | `pending` → `claimed` → `complete` / `failed` |
| `claimed_at` | TIMESTAMPTZ | When agent claimed the job |
| `completed_at` | TIMESTAMPTZ | When agent reported result |
| `error_message` | TEXT | Agent-reported error (on failure) |
| `retry_count` | INTEGER | Number of times retried |
| `created_at` | TIMESTAMPTZ | When job was created |
| `created_by` | INTEGER | User ID of uploader |

**What is NOT stored**: No signed URL, no signed URL expiry timestamp. The signed URL is generated fresh on every `jobs/claim` request and returned in the response only — never persisted.

---

## 8. Retry Policy

| Who can retry | Condition |
|---|---|
| Original uploader | May retry their own failed jobs |
| Superuser | May retry any failed job |

| Scenario | Behaviour |
|---|---|
| Agent offline | Job remains `pending` indefinitely; no expiry; no action needed |
| Agent download fails (network error) | Job marked `failed`; uploader or Superuser can retry |
| SHA-256 mismatch after write | Job marked `failed`; uploader or Superuser can retry |
| Folder creation fails | Job marked `failed`; agent reports OS error detail; uploader or Superuser can retry |
| GCS upload fails | Upload rejected; no agent job created |

Retry creates a new `document_agent_jobs` row; it does not mutate the original failed row.

---

## 9. UI — Mirror Status Indicator

Every document row in every governed module's document table must show a mirror status indicator alongside the GCS status:

| Agent Job Status | Indicator |
|---|---|
| `complete` | ✅ Local copy confirmed |
| `pending` or `claimed` | ⏳ Local copy pending |
| `failed` | ⚠️ Local copy failed + Retry button |
| No job row (legacy upload) | — (no indicator; pre-policy record) |

The Retry button is visible to the original uploader and Superuser. Retry dispatches a new `SAVE_FILE` job for that document.

---

## 10. Exclusions

**Rule**: Every GCS-governed document type must have a corresponding local mirror copy. If a document type has an active GCS governance rule, it is covered by this policy and must not be excluded.

The following are explicitly excluded because they are **not GCS-governed documents**:

| Item | Reason |
|---|---|
| SolidWorks extraction job results | Ephemeral processing artefacts under `epc-slddrw/`; 30-day TTL; no GCS governance rule |
| RFQ attachment snapshots (`plc_rfq_attachments`) | Reference copies of already-governed DATASHEET paths; no new GCS object created by this flow |
| GCS-to-Windows sync of pre-existing historical files | Out of scope; handled by a separate migration plan |
| Read operations (downloads, previews) | No change; GCS signed URL used for all reads |
| Windows-to-GCS sync | Not in scope; ERP is the sole write authority |

> **Note**: Branding assets (COMPANY_LOGO, COMPANY_SEAL, COMPANY_SIGNATURE) have active GCS governance rules and are therefore **included** in this policy — they are not excluded.

---

## 11. Failure Handling — GCS as Authoritative Source

- GCS write failure → upload rejected; no agent job created; browser receives error.
- Agent job failure → GCS copy remains authoritative; document accessible via ERP signed URL download; job logged as failed.
- Agent job failure does NOT roll back the GCS write.
- All failed agent jobs are visible in **Admin → Agent Jobs Monitor**.
- No email or push notification on agent job failure (can be added in a future phase if needed).

---

## 12. Approved Decisions

| # | Decision | Value |
|---|---|---|
| D1 | GCS authority | GCS is primary source of truth for all ERP operations |
| D2 | Windows role | Mirror only; no ERP reads from Windows |
| D3 | Signed URL storage | Never stored in DB; generated fresh on `jobs/claim` |
| D4 | Job fields stored | `gcs_path`, `local_relative_path`, `sha256`, `source_module`, `source_record_id` |
| D5 | Mirror confirmation | All 4 steps must complete (download → write → SHA256 verify → report) |
| D6 | Agent offline behaviour | Jobs stay `pending` indefinitely; no expiry |
| D7 | Retry access | Original uploader or Superuser |
| D8 | Policy scope | All GCS-governed document modules |
| D9 | Notifications | None in initial rollout |
| D10 | `document_agent_jobs` table | Extends existing table; no new table created |
