# RFQ Multi-Vendor Email Dispatch — Baseline v1.0

**Document Status:** APPROVED FOR CONTROLLED IMPLEMENTATION  
**Prepared by:** THERMOPAC QMS Engineering  
**Date:** 13 May 2026  
**Supersedes:** None (first baseline for this feature)  
**Governs:** `server/plc-rfq-routes.ts`, `server/rfq-email-service.ts` (new), `server/rfq-pdf-generator.ts` (new), `client/src/components/rfq-dispatch-panel.tsx` (new)

---

## Contents

1. Business Rule Summary
2. Email Workflow
3. DB / Schema Changes
4. Attachment Strategy
5. Freeze Governance
6. Audit / Log Design
7. API Routes
8. Service Architecture
9. Email Template Specification
10. UI Specification
11. Implementation Phase Breakdown
12. Zero-Trust Verification Checklist

---

## 1. Business Rule Summary

| Rule | Statement |
|------|-----------|
| R-01 | Issuing an RFQ MUST send a formal email to every vendor in `plc_rfq_vendors` |
| R-02 | Each email MUST carry: RFQ PDF, all applicable datasheet PDFs, tech spec (if uploaded), T&C |
| R-03 | Datasheet revision is **frozen at issue time** — subsequent uploads to the buy-list line have NO effect on this RFQ |
| R-04 | Every dispatch attempt (success or failure) MUST be recorded in `plc_rfq_dispatch_log` (append-only) |
| R-05 | Resend is permitted at any time while the RFQ is `issued`; each resend increments `resend_count` |
| R-06 | Vendor acknowledgment can be recorded manually (email reply confirmation) or via a future portal link |
| R-07 | An RFQ may NOT be closed if any vendor has `dispatch_status = 'failed'` and `resend_count = 0` |
| R-08 | Vendors without a stored email address are flagged as `dispatch_status = 'no_email'` — RFQ issue is NOT blocked, but the operator is warned |
| R-09 | All attachment GCS paths stored in `plc_rfq_attachments` are immutable after creation |
| R-10 | The generated RFQ PDF is stored in GCS and its path written to `plc_rfq_attachments` |

---

## 2. Email Workflow

```
POST /api/plc-rfq/:id/issue
        │
        ├─ 1. Validate RFQ is draft, has ≥1 line and ≥1 vendor
        │
        ├─ 2. BEGIN transaction
        │       UPDATE plc_rfq_records SET status='issued', issued_at=NOW()
        │       UPDATE procurement_list_lines status (aggregate-aware — see parallel-RFQ baseline)
        │
        ├─ 3. FREEZE ATTACHMENTS (within transaction)
        │       For each plc_rfq_lines.plc_line_id:
        │         → look up buy_list_line_selections (via source_buy_list_line_id)
        │         → INSERT plc_rfq_attachments (type=datasheet, frozen snapshot)
        │       For each RFQ-level tech_spec / T&C uploaded to the RFQ:
        │         → INSERT plc_rfq_attachments (type=tech_spec / t_and_c)
        │
        ├─ 4. COMMIT transaction
        │
        ├─ 5. GENERATE RFQ PDF (post-commit, async)
        │       rfqPdfGenerator.generate(rfqId) → Buffer
        │       Upload Buffer → GCS path:
        │         TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/RFQ/{rfqNumber}/rfq-document.pdf
        │       INSERT plc_rfq_attachments (type=rfq_pdf)
        │
        └─ 6. DISPATCH LOOP (per vendor, parallel Promise.allSettled)
                For each vendor in plc_rfq_vendors:
                  a. Resolve vendor email (vendors.email or plc_rfq_vendors.email_override)
                  b. If no email → INSERT dispatch_log(status='no_email'); continue
                  c. Download attachment buffers from GCS
                  d. Build Nodemailer message (HTML body + attachments)
                  e. transporter.sendMail(...)
                  f. INSERT plc_rfq_dispatch_log (status='sent' or 'failed')
                  g. logPlcAudit(eventType='rfq_email_dispatched')
                UPDATE plc_rfq_records.dispatch_status (aggregate of all vendors)
```

**Transport:** Existing `createMailTransporter()` from `server/utils/password-security.ts` (Nodemailer + Gmail SMTP).  
**Failure handling:** Each vendor dispatch is independent — one failure does not abort others. Failed vendors can be resent individually.

---

## 3. DB / Schema Changes

### 3a. New Table: `plc_rfq_attachments`

Stores **immutable frozen snapshots** of every attachment linked to an RFQ at issue time. Also stores the generated RFQ PDF path.

```sql
CREATE TABLE plc_rfq_attachments (
  id                    SERIAL PRIMARY KEY,
  rfq_id                INTEGER NOT NULL REFERENCES plc_rfq_records(id) ON DELETE CASCADE,
  plc_line_id           INTEGER REFERENCES procurement_list_lines(id) ON DELETE SET NULL,
  attachment_type       VARCHAR(30) NOT NULL,
  -- Values: rfq_pdf | datasheet | tech_spec | t_and_c
  gcs_bucket            VARCHAR(100) NOT NULL,
  gcs_path              TEXT NOT NULL,
  original_filename     VARCHAR(255),
  file_size_bytes       BIGINT,
  mime_type             VARCHAR(100),
  checksum_sha256       VARCHAR(64),
  source_revision_seq   INTEGER,        -- datasheet_revision_seq at freeze time
  frozen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  frozen_by             INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_plc_rfq_attachments_rfq   ON plc_rfq_attachments(rfq_id);
CREATE INDEX idx_plc_rfq_attachments_line  ON plc_rfq_attachments(plc_line_id);
-- No UPDATE/DELETE permitted after insert (governed by application layer)
```

### 3b. New Table: `plc_rfq_dispatch_log`

Append-only record of every email dispatch attempt, vendor by vendor.

```sql
CREATE TABLE plc_rfq_dispatch_log (
  id                    SERIAL PRIMARY KEY,
  rfq_id                INTEGER NOT NULL REFERENCES plc_rfq_records(id) ON DELETE CASCADE,
  vendor_id             INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  email_to              TEXT NOT NULL,        -- actual address used (snapshot)
  email_cc              TEXT[],               -- optional CC addresses
  dispatch_status       VARCHAR(20) NOT NULL,
  -- Values: sent | failed | no_email | resent
  nodemailer_message_id TEXT,                -- Message-ID header from SMTP response
  failure_reason        TEXT,
  attachment_count      INTEGER DEFAULT 0,
  dispatched_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dispatched_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_resend             BOOLEAN NOT NULL DEFAULT FALSE,
  resend_number         INTEGER NOT NULL DEFAULT 0   -- 0 = original, 1 = first resend
);

CREATE INDEX idx_rfq_dispatch_rfq     ON plc_rfq_dispatch_log(rfq_id);
CREATE INDEX idx_rfq_dispatch_vendor  ON plc_rfq_dispatch_log(rfq_id, vendor_id);
-- Append-only: no UPDATE/DELETE permitted
```

### 3c. Alter Table: `plc_rfq_vendors`

Add email override and acknowledgment fields.

```sql
ALTER TABLE plc_rfq_vendors
  ADD COLUMN email_override      TEXT,          -- if set, use this instead of vendors.email
  ADD COLUMN dispatch_status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- Values: pending | sent | failed | no_email | acknowledged
  ADD COLUMN last_dispatched_at  TIMESTAMPTZ,
  ADD COLUMN resend_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN acknowledged_at     TIMESTAMPTZ,
  ADD COLUMN acknowledgment_note TEXT;
```

### 3d. Alter Table: `plc_rfq_records`

Add issue timestamp and aggregate dispatch status.

```sql
ALTER TABLE plc_rfq_records
  ADD COLUMN issued_at           TIMESTAMPTZ,
  ADD COLUMN dispatch_status     VARCHAR(20) NOT NULL DEFAULT 'not_dispatched',
  -- Values: not_dispatched | partial | dispatched | all_acknowledged
  ADD COLUMN attachments_frozen_at TIMESTAMPTZ;
```

### 3e. Alter Table: `plc_rfq_records` — T&C / Spec upload

Allow operator to upload RFQ-level documents (T&C, project-level spec) before issue.

```sql
ALTER TABLE plc_rfq_records
  ADD COLUMN tc_gcs_path         TEXT,          -- Terms & Conditions PDF
  ADD COLUMN tc_original_filename VARCHAR(255),
  ADD COLUMN spec_gcs_path       TEXT,          -- Technical specification PDF
  ADD COLUMN spec_original_filename VARCHAR(255);
```

---

## 4. Attachment Strategy

### Priority order for each attachment type

| Attachment | Source | Fallback |
|-----------|--------|---------|
| **RFQ PDF** | Generated at issue by `rfqPdfGenerator.generate()` | None — always generated |
| **Datasheet** | `buy_list_line_selections.datasheet_gcs_object_path` (per PLC line) | Skip if `datasheet_required=false` or not yet uploaded; warn in dispatch log |
| **Technical Spec** | `plc_rfq_records.spec_gcs_path` (RFQ-level) OR `procurement_list_lines.specification_notes` embedded in RFQ PDF | Skip if not uploaded |
| **Terms & Conditions** | `plc_rfq_records.tc_gcs_path` (RFQ-level upload) | Embedded HTML section in email body (standard T&C template) |

### GCS path conventions (governed by §20 of PLC baseline)

```
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/RFQ/{rfqNumber}/rfq-document.pdf
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/RFQ/{rfqNumber}/t-and-c.pdf
TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/RFQ/{rfqNumber}/tech-spec.pdf
```

Datasheets remain at their existing buy-list line paths — they are NOT copied to the RFQ folder. Only the GCS path reference is frozen in `plc_rfq_attachments`.

### Attachment download for email

```
GCS signed URL (15-min TTL)
  → axios GET → Buffer
  → nodemailer attachment { filename, content: Buffer, contentType }
```

Maximum total attachment size per email: **20 MB**. If exceeded, attachments are uploaded to GCS and the email body includes download links (signed URLs, 7-day TTL) instead of inline attachments.

---

## 5. Freeze Governance

### When freeze occurs
Immediately before COMMIT in the issue transaction (Step 3 in §2).

### What is frozen
For each `plc_rfq_lines.plc_line_id`:
- Join to `project_buy_list_lines` via `procurement_list_lines.source_buy_list_line_id`
- Join to `buy_list_line_selections` via `buy_list_line_selections.buy_list_line_id`
- Snapshot: `datasheet_gcs_bucket`, `datasheet_gcs_object_path`, `datasheet_original_filename`, `datasheet_checksum_sha256`, `datasheet_revision_seq`
- One `plc_rfq_attachments` row per line (type = `datasheet`), only if `datasheet_uploaded = TRUE`

### Freeze invariants
- `plc_rfq_attachments` rows are **never updated or deleted** after creation
- If a line's datasheet is later revised (new upload to buy-list), the frozen snapshot is unaffected
- The same frozen snapshot is used for all resends of the same RFQ
- A diff warning is shown in the UI if the live datasheet checksum differs from the frozen snapshot

---

## 6. Audit / Log Design

### Existing audit table reuse
All RFQ email events are recorded in `procurement_list_audit_log` via `logPlcAudit()` with `entity_type = 'rfq'`:

| Event Type | Triggered When | Metadata |
|-----------|---------------|---------|
| `rfq_issued` | RFQ status → issued | `{rfqId, vendorCount, lineCount}` |
| `rfq_email_dispatched` | Email sent to one vendor | `{vendorId, vendorName, emailTo, messageId, attachmentCount}` |
| `rfq_email_failed` | Email failed for one vendor | `{vendorId, vendorName, emailTo, failureReason}` |
| `rfq_email_resent` | Resend dispatched | `{vendorId, vendorName, emailTo, resendNumber}` |
| `rfq_vendor_acknowledged` | Acknowledgment recorded | `{vendorId, vendorName, acknowledgedBy, note}` |
| `rfq_attachments_frozen` | Freeze completed | `{frozenCount, lineCount}` |

### `plc_rfq_dispatch_log` is the operational log
- One row per dispatch attempt (original + each resend)
- Never updated — new resend = new row with `is_resend=true`, `resend_number` incremented
- `plc_rfq_vendors.dispatch_status` is the current denormalized status (updated on each dispatch)

### Resend count guard
The application must enforce: `resend_count` increments on `plc_rfq_vendors` and a new `plc_rfq_dispatch_log` row is inserted. The `plc_rfq_vendors` row is never deleted.

---

## 7. API Routes

### Modified route

| Method | Path | Change |
|--------|------|--------|
| `POST` | `/api/plc-rfq/:id/issue` | Now triggers freeze + email dispatch loop after DB commit |

### New routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/plc-rfq/:id/resend/:vendorId` | Auth + Page | Resend email to one vendor (RFQ must be `issued`) |
| `PATCH` | `/api/plc-rfq/:id/vendors/:vendorId/acknowledge` | Auth + Page + Manager | Record vendor acknowledgment |
| `GET` | `/api/plc-rfq/:id/dispatch-log` | Auth + Page | Full dispatch log for one RFQ |
| `POST` | `/api/plc-rfq/:id/attachments` | Auth + Page | Upload T&C / spec to RFQ (before issue only) |
| `GET` | `/api/plc-rfq/:id/attachments` | Auth + Page | List frozen attachments for one RFQ |

### Route contract: `POST /api/plc-rfq/:id/issue` (modified)

**Response body (updated):**
```json
{
  "success": true,
  "rfqId": 7,
  "rfqNumber": "2627-017-RFQ-0001",
  "dispatched": [
    { "vendorId": 12, "vendorName": "ACME Pumps", "status": "sent", "messageId": "<abc@smtp>" }
  ],
  "failed": [],
  "noEmail": [],
  "frozenAttachments": 3
}
```

### Route contract: `POST /api/plc-rfq/:id/resend/:vendorId`

**Request body:**
```json
{ "emailOverride": "optional-override@vendor.com" }
```
**Guards:** RFQ must be `issued`. `resend_count` is incremented. New `plc_rfq_dispatch_log` row inserted.

### Route contract: `PATCH /api/plc-rfq/:id/vendors/:vendorId/acknowledge`

**Request body:**
```json
{ "acknowledgedAt": "2026-05-14T10:00:00Z", "note": "Confirmed via phone call" }
```
Updates `plc_rfq_vendors.acknowledged_at`, `acknowledgment_note`, `dispatch_status = 'acknowledged'`.

---

## 8. Service Architecture

### New files

```
server/
  rfq-email-service.ts        — email dispatch orchestrator (main)
  rfq-pdf-generator.ts        — PDFKit-based RFQ document generator
```

### `server/rfq-email-service.ts` — responsibilities

```
dispatchRfqToVendors(rfqId, issuedBy)
  1. Load RFQ + vendors + lines + frozen attachments from DB
  2. Generate RFQ PDF (call rfqPdfGenerator)
  3. Upload RFQ PDF to GCS; INSERT plc_rfq_attachments(type='rfq_pdf')
  4. Promise.allSettled([...vendors.map(v => sendToVendor(rfq, v, attachments, issuedBy))])
  5. Aggregate results → UPDATE plc_rfq_records.dispatch_status

sendToVendor(rfq, vendor, attachments, issuedBy)
  1. Resolve email: vendor.email_override ?? vendors.email
  2. If no email → log 'no_email'; return
  3. downloadAttachmentBuffers(attachments)
  4. buildEmailMessage(rfq, vendor, buffers)
  5. transporter.sendMail(message)
  6. INSERT plc_rfq_dispatch_log
  7. UPDATE plc_rfq_vendors SET dispatch_status, last_dispatched_at
  8. logPlcAudit(...)
```

### `server/rfq-pdf-generator.ts` — RFQ PDF content

| Section | Content |
|---------|---------|
| Header | THERMOPAC letterhead, RFQ number, date, submission deadline |
| Vendor address block | vendor.name, contact_person, address |
| Line table | PLC number, tag no, item code, description, qty, UOM, spec notes |
| Delivery / commercial terms | From RFQ notes + project payment terms |
| Submission instructions | Email / portal address, deadline |
| Footer | THERMOPAC address, authorised signatory placeholder |

**Library:** PDFKit (`pdfkit`) — consistent with `server/dds-pdf-service.ts` and existing generators.

---

## 9. Email Template Specification

**Subject:** `RFQ ${rfqNumber} | ${subject} | THERMOPAC — Submission by ${submissionDeadline}`

**From:** `GMAIL_USER` (configured in environment)

**Body (HTML):** Extends the existing THERMOPAC email style from `server/utils/password-security.ts`

```
┌─────────────────────────────────────────────────────────┐
│  THERMOPAC                          [logo gradient bar]  │
│  Request for Quotation                                   │
├─────────────────────────────────────────────────────────┤
│  Dear {contactPerson / vendor.name},                     │
│                                                          │
│  THERMOPAC invites your quotation for the following      │
│  items per RFQ {rfqNumber} dated {rfqDate}.              │
│                                                          │
│  ┌──────────┬───────────┬──────────┬─────┬────┐         │
│  │ PLC No.  │ Tag / Desc│ Spec     │ Qty │ UOM│         │
│  ├──────────┼───────────┼──────────┼─────┼────┤         │
│  │ (lines…) │           │          │     │    │         │
│  └──────────┴───────────┴──────────┴─────┴────┘         │
│                                                          │
│  Submission deadline: {submissionDeadline}               │
│  Subject your quote to: {GMAIL_USER}                     │
│                                                          │
│  Please quote: unit price, delivery weeks, validity.     │
│                                                          │
│  [T&C standard clause — embedded text if no PDF]         │
├─────────────────────────────────────────────────────────┤
│  Attachments enclosed:                                   │
│  ✓ RFQ Document ({rfqNumber}.pdf)                        │
│  ✓ Datasheet — {tagNo} ({filename})  [per line]          │
│  ✓ Technical Specification (if uploaded)                 │
│  ✓ Terms & Conditions                                    │
├─────────────────────────────────────────────────────────┤
│  THERMOPAC Engineering Pvt Ltd                           │
│  Procurement Team                                        │
└─────────────────────────────────────────────────────────┘
```

---

## 10. UI Specification

### 10a. RFQ List table — new columns

| Column | Content |
|--------|---------|
| `Dispatch` | Badge: `Not Dispatched` / `Partial` / `Dispatched` / `All Acknowledged` |
| `Issued` | `issued_at` formatted with `fmtDateTime` |

### 10b. RFQ Detail panel — Dispatch tab (new tab alongside Lines / Vendors / Quotes)

```
┌─ Dispatch Status ──────────────────────────────────────────────┐
│  Vendor          │ Email            │ Status      │ Actions     │
│  ACME Pumps      │ acme@pumps.com   │ ✓ Sent      │ Resend      │
│  Bharat Pumps    │ (no email)       │ ⚠ No Email  │ Set Email   │
│  Flowtech        │ info@flow.com    │ ✓ Acknowledged│ —         │
├─ Frozen Attachments ──────────────────────────────────────────┤
│  Type        │ Filename              │ Line     │ Rev  │ ⚠ Drift │
│  RFQ PDF     │ 2627-017-RFQ-0001.pdf │ —        │ —    │         │
│  Datasheet   │ pump-p101-ds.pdf      │ P-101    │ v2   │         │
│  Datasheet   │ pump-p102-ds.pdf      │ P-102    │ v2   │ ⚠       │
│  T&C         │ thermopac-tc-2026.pdf │ —        │ —    │         │
└───────────────────────────────────────────────────────────────┘

⚠ Drift indicator: frozen checksum ≠ current live datasheet checksum
```

### 10c. "Set Email" inline editor

When a vendor has no stored email, an inline text input appears in the dispatch table row allowing the operator to set `plc_rfq_vendors.email_override` without navigating to the vendor master.

### 10d. Acknowledge modal

Triggered by "Acknowledge" button per vendor row. Captures:
- `acknowledged_at` (defaults to now, editable)
- `acknowledgment_note` (free text — "Confirmed by phone / email reply ref: …")

### 10e. Pre-issue validation toast

When operator clicks "Issue RFQ", a pre-flight check runs:
- ✓ All vendors have an email (or override)
- ✓ All lines have a datasheet uploaded (if `datasheet_required = TRUE`)
- ✓ Submission deadline is set
- Any failures shown as warnings (not hard blocks except R-07 from §1)

### 10f. Component files

| File | Role |
|------|------|
| `client/src/components/rfq-dispatch-panel.tsx` | Dispatch tab — vendor dispatch table + frozen attachment list |
| `client/src/components/rfq-acknowledge-modal.tsx` | Acknowledgment capture modal |
| `client/src/components/rfq-preflight-checker.tsx` | Pre-issue validation summary |

---

## 11. Implementation Phase Breakdown

### Phase A — Schema (run via `drizzle-kit push:pg` + raw SQL)
1. `ALTER TABLE plc_rfq_records` — add `issued_at`, `dispatch_status`, `attachments_frozen_at`, `tc_gcs_path`, `tc_original_filename`, `spec_gcs_path`, `spec_original_filename`
2. `ALTER TABLE plc_rfq_vendors` — add `email_override`, `dispatch_status`, `last_dispatched_at`, `resend_count`, `acknowledged_at`, `acknowledgment_note`
3. `CREATE TABLE plc_rfq_attachments`
4. `CREATE TABLE plc_rfq_dispatch_log`
5. Add to `shared/schema.ts` (Drizzle definitions + insert schemas)

### Phase B — Backend services
1. `server/rfq-pdf-generator.ts` — PDFKit RFQ document
2. `server/rfq-email-service.ts` — `dispatchRfqToVendors()`, `resendToVendor()`
3. Modify `POST /api/plc-rfq/:id/issue` to call freeze + dispatch
4. Add `POST /api/plc-rfq/:id/resend/:vendorId`
5. Add `PATCH /api/plc-rfq/:id/vendors/:vendorId/acknowledge`
6. Add `GET /api/plc-rfq/:id/dispatch-log`
7. Add `POST /api/plc-rfq/:id/attachments` (T&C / spec upload)

### Phase C — Frontend
1. `rfq-dispatch-panel.tsx` — dispatch table + freeze viewer
2. `rfq-acknowledge-modal.tsx`
3. `rfq-preflight-checker.tsx`
4. Wire new Dispatch tab into RFQ detail panel
5. Add dispatch badge column to RFQ list table

### Phase D — Hardening
1. Attachment size guard (>20 MB → links instead of inline)
2. Drift detection (frozen checksum vs live)
3. R-07 close-block when any vendor has `failed` + `resend_count = 0`
4. Vendor "no email" warning flow with inline email-override input

---

## 12. Zero-Trust Verification Checklist

| Check | Pass Condition |
|-------|---------------|
| Issue with 0 vendors having email | Dispatch loop runs; all logged as `no_email`; RFQ still moves to `issued` |
| Issue with mixed email/no-email vendors | Email vendors get mail; no-email vendors logged; partial dispatch status |
| Resend after failed dispatch | New `plc_rfq_dispatch_log` row; `resend_count` incremented; status updated |
| Attachment > 20 MB | Email body uses signed URL links; no inline attachment |
| Datasheet revised after RFQ issue | Frozen snapshot unchanged; drift indicator shown in UI |
| Close RFQ with failed dispatch | Blocked with HTTP 422 if any vendor `dispatch_status='failed'` and `resend_count=0` |
| Cancel RFQ after partial dispatch | Status reverts per parallel-RFQ cancel rule (see rfq-parallel-baseline); dispatch log preserved |
| Duplicate issue attempt | `plc_rfq_records.status` guard blocks — HTTP 400 `RFQ is 'issued'` |
| GCS download failure for attachment | Attachment skipped; `plc_rfq_dispatch_log.failure_reason` records the GCS error; email still sent |
| SMTP failure (Nodemailer throws) | `dispatch_status='failed'`; audit log entry; no rollback of DB state |

---

*End of RFQ Email Dispatch Baseline v1.0*
