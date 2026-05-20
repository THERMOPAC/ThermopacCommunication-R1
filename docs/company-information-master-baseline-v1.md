# Company Information Master — Baseline v1.0 (FINAL)

**Status:** FINAL DRAFT — awaiting explicit approval before any implementation  
**Date:** 2026-05-20  
**Revision:** v1.0-rev4 (all final governance corrections applied)  
**Protocol:** `docs/operating-protocol-v1.0.md` — no implementation until this doc is approved.

---

## 1. Objective

Provide a single DB-backed source of truth for all THERMOPAC company data consumed by ERP modules. Replace hardcoded strings across server and client code with dynamic reads from `company_master` and related tables.

---

## 2. Scope

### 2.1 Phase 1 — In Scope

| Area | Detail |
|---|---|
| DB | **8 new tables** (see §2.2) |
| API | 23 routes under `/api/company` |
| UI | `/administration/company-information` — 8 tabs |
| GCS governance seed | 12 rules (9 document types + 3 branding asset types) |
| Hardcoded callsites | 5 identified for future Phase 2 replacement — **not migrated in Phase 1** |

### 2.2 Phase 1 Table List (count = 8)

| # | Table | Role |
|---|---|---|
| 1 | `company_master` | Core company identity, branding asset GCS paths |
| 2 | `company_legal_tax` | Legal identifiers, tax numbers, export compliance |
| 3 | `company_addresses` | Multiple addresses by type |
| 4 | `company_bank_accounts` | One or more bank accounts |
| 5 | `company_erp_config` | SAP and ERP defaults |
| 6 | `company_branding` | Letterhead, footer, terms text fields |
| 7 | `company_documents` | GCS-backed compliance documents (revision chain) |
| 8 | `company_audit_log` | Immutable append-only change history |

### 2.3 Explicitly Out of Scope (Phase 1)

- Replacement of 5 hardcoded callsites → **Phase 2**
- Multi-company nav switcher → **Phase 2**
- Approval workflow for legal/tax changes → **Phase 2**
- SAP B1 Company DB selection via UI → env-var `SAP_COMPANY_DB` boundary preserved
- Automatic cross-module propagation / event bus → **Phase 2**
- Branding asset dimension validation → **Phase 2**
- In-process caching layer → **Phase 2**
- GCS orphan cleanup job → **Phase 2**
- Mobile/responsive redesign → desktop only

---

## 3. Active Company Governance

**Rule: Only one company record may have `is_active = true` globally at any time.**

- Enforced by DB partial unique index `idx_single_active_company` (§4.1).
- `PATCH /api/company/:id/activate` atomically sets the target to `is_active = true` and all others to `is_active = false` within a single DB transaction.
- Deactivating the sole active company is rejected `409 CONFLICT`: "Cannot deactivate the only active company."
- `GET /api/company/active` → single active record. If none → 404. If more than one (data inconsistency) → 500 with server alert.

---

## 4. DB Schema

### 4.0 FK Delete Rules — Global

Applied to **every** table in this module:

| FK column | Rule | Reason |
|---|---|---|
| `company_id` | `ON DELETE RESTRICT` | Company cannot be deleted while any child records exist |
| `changed_by` | `ON DELETE SET NULL` | Audit history must survive user deletion |
| `updated_by` | `ON DELETE SET NULL` | Same |
| `created_by` | `ON DELETE SET NULL` | Same |
| `uploaded_by` | `ON DELETE SET NULL` | Document records must survive uploader deletion |

### 4.1 `company_master`

```sql
company_master (
  id                  SERIAL PRIMARY KEY,
  company_code        VARCHAR(10)   NOT NULL UNIQUE,
  short_name          VARCHAR(30)   NOT NULL,
  legal_name          VARCHAR(120)  NOT NULL,
  display_name        VARCHAR(120)  NOT NULL,
  company_type        VARCHAR(40),
  industry            VARCHAR(80),
  fy_start_month      SMALLINT      NOT NULL DEFAULT 4
                      CHECK (fy_start_month BETWEEN 1 AND 12),
  base_currency       VARCHAR(3)    NOT NULL DEFAULT 'INR',
  timezone            VARCHAR(60)   NOT NULL DEFAULT 'Asia/Kolkata',
  logo_gcs_path       TEXT,
  signature_gcs_path  TEXT,
  seal_gcs_path       TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  version             INTEGER       NOT NULL DEFAULT 1,
  created_by          INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP     NOT NULL DEFAULT NOW()
);

-- Enforces: only one active company globally
CREATE UNIQUE INDEX idx_single_active_company
  ON company_master (is_active)
  WHERE is_active = true;

CREATE INDEX idx_company_master_is_active  ON company_master(is_active);
CREATE INDEX idx_company_master_updated_at ON company_master(updated_at);
```

### 4.2 `company_legal_tax`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced at DB level.

```sql
company_legal_tax (
  id                     SERIAL PRIMARY KEY,
  company_id             INTEGER       NOT NULL UNIQUE
                         REFERENCES company_master(id) ON DELETE RESTRICT,
  cin                    VARCHAR(21),
  pan                    VARCHAR(10),
  gstin                  VARCHAR(15),
  iec_code               VARCHAR(10),
  iec_branch             VARCHAR(40),
  lut_number             VARCHAR(40),
  lut_validity_date      DATE,
  lut_financial_year     VARCHAR(10),
  msme_udyam             VARCHAR(20),
  tan                    VARCHAR(10),
  pf_number              VARCHAR(20),
  esi_number             VARCHAR(17),
  gst_registration_type  VARCHAR(40),
  gst_state_code         VARCHAR(3),
  export_without_gst     BOOLEAN        NOT NULL DEFAULT false,
  ad_code                VARCHAR(14),
  authorized_dealer_bank VARCHAR(80),
  version                INTEGER        NOT NULL DEFAULT 1,
  updated_by             INTEGER        REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMP      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_legal_tax_company_id ON company_legal_tax(company_id);
CREATE INDEX idx_company_legal_tax_updated_at ON company_legal_tax(updated_at);
```

### 4.3 `company_addresses`

```sql
company_addresses (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER     NOT NULL
                REFERENCES company_master(id) ON DELETE RESTRICT,
  address_type  VARCHAR(30) NOT NULL
                CHECK (address_type IN (
                  'registered_office',
                  'corporate_office',
                  'factory',
                  'dispatch',
                  'billing'
                )),
  address_line1 TEXT,
  address_line2 TEXT,
  city          VARCHAR(60),
  district      VARCHAR(60),
  state         VARCHAR(60),
  country       VARCHAR(60) NOT NULL DEFAULT 'India',
  pin_code      VARCHAR(10),
  geo_lat       NUMERIC(10,6),
  geo_lng       NUMERIC(10,6),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  version       INTEGER     NOT NULL DEFAULT 1,
  updated_by    INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, address_type)
);

CREATE INDEX idx_company_addresses_company_id ON company_addresses(company_id);
CREATE INDEX idx_company_addresses_is_active  ON company_addresses(is_active);
```

**Address type governance:** DB `CHECK` constraint is authoritative. Application layer validates the value before sending to DB. The five allowed values are fixed and may not be extended without a schema migration.

### 4.4 `company_bank_accounts`

```sql
company_bank_accounts (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER      NOT NULL
                    REFERENCES company_master(id) ON DELETE RESTRICT,
  bank_name         VARCHAR(80)  NOT NULL,
  branch            VARCHAR(80),
  beneficiary_name  VARCHAR(120) NOT NULL,
  account_number    VARCHAR(20)  NOT NULL,
  ifsc              VARCHAR(11),
  swift             VARCHAR(11),
  iban              VARCHAR(34),
  currency          VARCHAR(3)   NOT NULL DEFAULT 'INR',
  is_primary        BOOLEAN      NOT NULL DEFAULT false,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  version           INTEGER      NOT NULL DEFAULT 1,
  created_by        INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, account_number)
);

CREATE INDEX idx_company_bank_accounts_company_id ON company_bank_accounts(company_id);
CREATE INDEX idx_company_bank_accounts_is_active  ON company_bank_accounts(is_active);
```

### 4.5 `company_erp_config`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced at DB level.

```sql
company_erp_config (
  id                     SERIAL PRIMARY KEY,
  company_id             INTEGER   NOT NULL UNIQUE
                         REFERENCES company_master(id) ON DELETE RESTRICT,
  sap_company_db         VARCHAR(60),
  sap_branch_code        VARCHAR(20),
  default_warehouse      VARCHAR(40),
  default_cost_center    VARCHAR(40),
  default_payment_terms  VARCHAR(80),
  default_delivery_terms VARCHAR(80),
  base_uom               VARCHAR(20),
  decimal_precision      SMALLINT  NOT NULL DEFAULT 2
                         CHECK (decimal_precision BETWEEN 0 AND 6),
  version                INTEGER   NOT NULL DEFAULT 1,
  updated_by             INTEGER   REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_erp_config_company_id ON company_erp_config(company_id);
```

### 4.6 `company_branding`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced at DB level.

```sql
company_branding (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER   NOT NULL UNIQUE
                      REFERENCES company_master(id) ON DELETE RESTRICT,
  default_letterhead  TEXT,
  footer_text         TEXT,
  terms_conditions    TEXT,
  rfq_footer          TEXT,
  offer_footer        TEXT,
  purchase_footer     TEXT,
  report_watermark    TEXT,
  version             INTEGER   NOT NULL DEFAULT 1,
  updated_by          INTEGER   REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_company_branding_company_id ON company_branding(company_id);
```

### 4.7 `company_documents`

GCS-governed uploads — immutable revision chain.

```sql
company_documents (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER      NOT NULL
                  REFERENCES company_master(id) ON DELETE RESTRICT,
  doc_type        VARCHAR(40)  NOT NULL
                  CHECK (doc_type IN (
                    'GST_CERTIFICATE',
                    'PAN_CARD',
                    'IEC_CERTIFICATE',
                    'LUT_COPY',
                    'MSME_CERTIFICATE',
                    'CANCELLED_CHEQUE',
                    'INCORPORATION_CERTIFICATE',
                    'FACTORY_LICENSE',
                    'PF_ESI_DOCUMENT'
                  )),
  revision_number SMALLINT     NOT NULL DEFAULT 1,
  file_name       VARCHAR(255) NOT NULL,
  gcs_path        TEXT         NOT NULL,
  content_type    VARCHAR(80),
  size_bytes      INTEGER,
  status          VARCHAR(20)  NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'verified', 'expired')),
  expiry_date     DATE,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  uploaded_by     INTEGER      NOT NULL
                  REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  notes           TEXT
);

-- Enforces: only one active revision per document type per company
CREATE UNIQUE INDEX idx_single_active_doc
  ON company_documents (company_id, doc_type)
  WHERE is_active = true;

CREATE INDEX idx_company_documents_company_id ON company_documents(company_id);
CREATE INDEX idx_company_documents_doc_type   ON company_documents(doc_type);
CREATE INDEX idx_company_documents_is_active  ON company_documents(is_active);
```

### 4.8 `company_audit_log`

Immutable — append-only, permanent retention. No UPDATE or DELETE ever.

```sql
company_audit_log (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER     NOT NULL
              REFERENCES company_master(id) ON DELETE RESTRICT,
  action      VARCHAR(40) NOT NULL
              CHECK (action IN (
                'field_change',
                'legal_change',
                'doc_upload',
                'doc_replace',
                'status_change',
                'create',
                'branding_upload',
                'activation_change'
              )),
  table_name  VARCHAR(60),
  field_name  VARCHAR(80),
  old_value   TEXT,
  new_value   TEXT,
  changed_by  INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  notes       TEXT
);

CREATE INDEX idx_company_audit_log_company_id ON company_audit_log(company_id);
CREATE INDEX idx_company_audit_log_changed_at ON company_audit_log(changed_at);
```

---

## 5. Soft-Delete-Only Governance

**Rule: No hard delete of any company record, ever.**

| Table | Soft-delete mechanism | Notes |
|---|---|---|
| `company_master` | `is_active = false` via `PATCH /activate` | No DELETE route exists. Sole active company cannot be deactivated |
| `company_bank_accounts` | `is_active = false` via DELETE endpoint (issues UPDATE, not SQL DELETE) | Account number slot is released; may be reused |
| `company_addresses` | `is_active = false` | The `UNIQUE(company_id, address_type)` slot may be reactivated |
| `company_documents` | `is_active = false` on superseded revisions (automatic on new upload) | No physical GCS object deletion |
| `company_legal_tax` | Updated in-place (one row per company); no delete route | |
| `company_erp_config` | Updated in-place (one row per company); no delete route | |
| `company_branding` | Updated in-place (one row per company); no delete route | |
| `company_audit_log` | **No delete, no soft-delete, ever** | Permanent, immutable |

---

## 6. Document Revision Lifecycle

1. Upload initiates a DB transaction: all prior rows with same `(company_id, doc_type)` are set `is_active = false`; new row inserted with `is_active = true`, `revision_number = MAX(prior) + 1`.
2. `idx_single_active_doc` enforces the single-active-revision invariant at DB level — any application bug that inserts a second active revision is rejected by the DB.
3. Historical revisions (`is_active = false`) are immutable: `gcs_path`, `file_name`, `content_type`, `size_bytes`, `revision_number` may never be updated.
4. Only `status`, `expiry_date`, `notes` are patchable on any revision (active or historical).
5. No physical GCS object deletion occurs via this module.

---

## 7. Branding Asset Retention Governance

Branding assets (logo, signature, seal) are stored in GCS. When a new asset replaces an existing one:

- The old GCS object is **not deleted**. It remains in GCS as an orphan.
- The new GCS path overwrites the stored path in `company_master` (logo_gcs_path / signature_gcs_path / seal_gcs_path).
- Audit log records both the old and new GCS paths (`old_value`, `new_value` in `company_audit_log`).
- **Audit records are permanent** — even if the physical GCS object is later deleted by a future cleanup job, the audit log entry is never removed.
- A scheduled GCS retention/cleanup job to remove orphaned branding assets is **Phase 2 out-of-scope**.
- In Phase 1, orphaned branding assets accumulate in GCS with no automatic cleanup.

---

## 8. Approval Workflow

**Phase 2 out-of-scope.** No `company_change_approvals` table in Phase 1.

Phase 1 bridge: all `company_legal_tax` changes are logged with `action = 'legal_change'`, capturing `old_value` and `new_value` per changed field. Changes take effect immediately. The audit log is the manual approval trail until Phase 2.

---

## 9. Upload Security Governance

### 9.1 MIME + Magic-Byte Validation

Both MIME type (from `Content-Type` / multer detection) and magic-byte (file signature) are validated server-side for every upload. The server **never trusts the MIME header alone**.

| Upload type | Allowed MIME | Magic bytes (hex) | Magic bytes (human) |
|---|---|---|---|
| Documents (all 9 types) | `application/pdf` | `25 50 44 46 2D` | `%PDF-` |
| | `image/jpeg` | `FF D8 FF` | JPEG SOI |
| | `image/png` | `89 50 4E 47 0D 0A 1A 0A` | PNG signature |
| | `image/webp` | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` | RIFF….WEBP |
| Branding assets (logo, signature, seal) | `image/jpeg` | `FF D8 FF` | JPEG SOI |
| | `image/png` | `89 50 4E 47 0D 0A 1A 0A` | PNG signature |
| | `image/webp` | `52 49 46 46 ?? ?? ?? ?? 57 45 42 50` | RIFF….WEBP |

Magic-byte check reads the first 12 bytes of the uploaded buffer only. No full-file scan.

- MIME check fails → `400`, error code `MIME_REJECTED`
- Magic-byte check fails → `400`, error code `MAGIC_BYTE_REJECTED`
- Both checks pass → proceed to size check

### 9.2 File Size Limits

| Upload type | Max size | Enforcement |
|---|---|---|
| Documents | 20 MB | `multer limits.fileSize` — rejected before any processing |
| Branding assets (logo, signature, seal) | 2 MB | Same |

### 9.3 Deterministic Filename Sanitization

The GCS object name is **always computed server-side** from `doc_type` and `revision_number`. The client-provided filename is never used in the GCS path.

The original filename is stored in `company_documents.file_name` for display only, after the following sanitization pipeline:

| Step | Rule |
|---|---|
| 1 | Strip path separators: remove `/`, `\`, `..` |
| 2 | Strip unsafe characters: replace anything not matching `[A-Za-z0-9._-]` with `_` |
| 3 | Collapse: replace consecutive `_` with a single `_` |
| 4 | Trim: remove leading and trailing `_` |
| 5 | Normalize extension: extract extension, force lowercase (`PDF`→`pdf`, `JPG`→`jpg`) |
| 6 | Truncate: maximum 120 characters |

The raw client-provided filename is **never persisted**. Only the sanitized form is stored.

### 9.4 Dimension Validation (Branding Assets)

**Phase 2 out-of-scope.** Phase 1 enforces MIME and size only. Advisory maximum: 1000 × 1000 px.

---

## 10. GCS Path Governance

### 10.1 Chosen Convention — UPPERCASE for Fixed Vocabulary Segments

**This module uses UPPERCASE for all fixed controlled-vocabulary path segments.** This is the single, authoritative rule. There are no exceptions and no mixed lowercase alternatives.

| Segment type | Convention | Rationale |
|---|---|---|
| Root org code | UPPERCASE | `TPEL` — matches project-wide GCS root |
| Module folder | UPPERCASE | `COMPANY` — consistent with `VENDORS`, `DESIGN`, etc. |
| Company code | UPPERCASE | Sourced from `company_master.company_code` (stored UPPERCASE) |
| Document type | UPPER_SNAKE_CASE | Sourced from `doc_type` controlled vocabulary |
| Branding subfolder | UPPERCASE | `BRANDING`, `LOGO`, `SIGNATURE`, `SEAL` |
| Revision folder | `rev-` lowercase prefix + zero-padded 2-digit integer | `rev-01` — matches existing project convention for revision folders |
| Sequence prefix | Zero-padded 3-digit integer | `001` |
| Label slug | Lowercase kebab-case derived from doc_type | `gst-certificate`, `pan-card` |
| Extension | Lowercase normalized from MIME | `pdf`, `jpg`, `png`, `webp` |

The `rev-NN` convention (lowercase prefix) is not a contradiction — it is a deliberate formatting token, not a vocabulary segment, matching the pattern used across all other GCS modules in this project.

### 10.2 Document GCS Path Template

```
TPEL/COMPANY/{COMPANY_CODE}/{DOC_TYPE}/rev-{NN}/{SEQ}-{label}.{ext}
```

| Token | Rule | Example |
|---|---|---|
| `{COMPANY_CODE}` | `company_master.company_code` — stored UPPERCASE | `TPEL` |
| `{DOC_TYPE}` | `company_documents.doc_type` — UPPER_SNAKE_CASE | `GST_CERTIFICATE` |
| `{NN}` | `revision_number` zero-padded to 2 digits | `01` |
| `{SEQ}` | Always `001` (one file per revision) | `001` |
| `{label}` | DOC_TYPE lowercased, underscores → hyphens | `gst-certificate` |
| `{ext}` | Lowercase from MIME | `pdf` |

Full example: `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf`

### 10.3 Branding Asset GCS Path Templates

```
TPEL/COMPANY/{COMPANY_CODE}/BRANDING/LOGO/{sanitized_filename}
TPEL/COMPANY/{COMPANY_CODE}/BRANDING/SIGNATURE/{sanitized_filename}
TPEL/COMPANY/{COMPANY_CODE}/BRANDING/SEAL/{sanitized_filename}
```

Examples:
```
TPEL/COMPANY/TPEL/BRANDING/LOGO/thermopac-logo.jpg
TPEL/COMPANY/TPEL/BRANDING/SIGNATURE/authorized-signatory.png
TPEL/COMPANY/TPEL/BRANDING/SEAL/company-seal.png
```

### 10.4 Path Generation Rules

- Paths are always computed server-side. Clients never supply raw GCS paths.
- Deterministic: same inputs → same path, always.
- GCS objects are never renamed after upload.
- Path templates are defined as constants in `server/company-routes.ts`. No inline string concatenation.

### 10.5 Signed URL TTL Governance

| Endpoint | Purpose | TTL | GCS version |
|---|---|---|---|
| `GET /api/company/doc/:docId/download` | Download (attachment) | 15 minutes | v4 |
| `GET /api/company/doc/:docId/view` | Inline view | 60 minutes | v4 |
| Branding asset view (logo/signature/seal) | Inline view | 60 minutes | v4 |

- Signed URLs are generated fresh on every request. No signed URL caching.
- TTL values are hardcoded constants. Not configurable via request parameters.
- After TTL expiry, GCS returns `403 Forbidden` to the URL caller.

---

## 11. Validation Rules

### Timezone
- Must be a valid IANA timezone identifier.
- Server-side: `Intl.supportedValuesOf('timeZone').includes(value)` (Node 18+).
- Rejection: `400 VALIDATION_ERROR`, `fields.timezone: "Must be a valid IANA timezone identifier."`
- Applies to: `company_master.timezone`

### Currency
- Must be a valid ISO-4217 three-letter uppercase currency code.
- Phase 1 allowlist: `INR`, `USD`, `EUR`, `GBP`, `AED`, `SGD`, `JPY`, `CHF`
- Rejection: `400 VALIDATION_ERROR`, `fields.{fieldName}: "Must be a valid ISO-4217 currency code."`
- Applies to: `company_master.base_currency` **and** `company_bank_accounts.currency`

### PAN
- Format: `/^[A-Z]{5}[0-9]{4}[A-Z]$/` (10 chars)

### GSTIN
- Format: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/` (15 chars)
- State code (chars 1–2) must match `gst_state_code`
- Embedded PAN (chars 3–12) must match stored `pan`
- Luhn mod-36 checksum — server-side implementation

### IEC
- Format: `/^[0-9]{10}$/`

### IFSC
- Format: `/^[A-Z]{4}0[A-Z0-9]{6}$/` (11 chars; 5th char always `0`)

### CIN
- Format: `/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/` (21 chars)

### TAN
- Format: `/^[A-Z]{4}[0-9]{5}[A-Z]$/` (10 chars)

### Address type
- Application layer validates before DB; DB CHECK constraint is final enforcement.
- Allowed: `registered_office`, `corporate_office`, `factory`, `dispatch`, `billing`

---

## 12. Rate Limiting

Applied per authenticated user session via `express-rate-limit`:

| Endpoint group | Window | Limit | Applies to |
|---|---|---|---|
| Document upload | 1 minute | 10 requests | `POST /api/company/:id/documents/:docType` |
| Branding asset upload | 1 minute | 5 requests | `POST /api/company/:id/branding/logo\|signature\|seal` |
| Signed URL — download | 1 minute | 30 requests | `GET /api/company/doc/:docId/download` |
| Signed URL — view | 1 minute | 60 requests | `GET /api/company/doc/:docId/view` |
| Company activation | 1 minute | 3 requests | `PATCH /api/company/:id/activate` |

Exceeded limit → `429 Too Many Requests`, error code `RATE_LIMITED`.

---

## 13. Concurrency Protection (Optimistic Locking)

Every mutable table carries `version INTEGER NOT NULL DEFAULT 1`.

Protocol:
1. Client reads record → receives current `version`.
2. Client sends PATCH body with `{ ..., version: N }`.
3. Server: `UPDATE ... SET version = N+1, updated_at = NOW() WHERE id = :id AND version = :N`
4. 0 rows affected → `409 CONCURRENT_UPDATE`: "Record was modified by another user. Please refresh and retry."
5. Success → return updated record with new `version`.

Covered tables: `company_master`, `company_legal_tax`, `company_addresses`, `company_bank_accounts`, `company_erp_config`, `company_branding`.

`company_documents` and `company_audit_log` are append-only — no version column required.

---

## 14. Transaction Governance

All POST and PATCH routes wrap the business update and audit log insert in a single DB transaction. Both commit or both roll back.

```typescript
await db.transaction(async (tx) => {
  await tx.update(targetTable).set({ ... }).where(...);
  await tx.insert(companyAuditLog).values({ action, field_name, old_value, new_value, ... });
});
```

Applies to: every PATCH route on any sub-table · document upload (deactivate prior + insert new + audit) · branding asset upload (update path + audit) · company activation (atomic swap + audit).

---

## 15. Audit Governance

| Policy | Rule |
|---|---|
| Retention | **Permanent** — no time-based purge, no archival delete, ever |
| `company_id` FK | `ON DELETE RESTRICT` — company cannot be deleted while any audit records exist |
| User FK (`changed_by`) | `ON DELETE SET NULL` — audit row is preserved; user column becomes NULL |
| Immutability | No application route ever issues `UPDATE` or `DELETE` on `company_audit_log` |
| Append-only enforcement | The Drizzle schema for `company_audit_log` wires only `.insert()`. No `.update()` or `.delete()` are exposed |
| Action vocabulary | Enforced by DB `CHECK` constraint (§4.8) |
| Physical asset deletion | Audit records remain permanent even if a referenced GCS object is later deleted by a cleanup job |

---

## 16. Cache Governance

**Phase 1: No caching.** Every request reads directly from DB.

**Phase 2 rule (future):** If a cache is introduced, invalidation is mandatory on every write to any company sub-table. Cache key: `company:active`. TTL ≤ 5 minutes. Stale-while-revalidate is prohibited for legal name, GSTIN, address, and banking fields.

---

## 17. API Routes

### 17.1 Route Table

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/company` | All authenticated | List all (id, code, short_name, is_active) |
| GET | `/api/company/active` | All authenticated | Full active company payload |
| GET | `/api/company/:id` | All authenticated | Full single company payload |
| POST | `/api/company` | Superuser | Create company |
| PATCH | `/api/company/:id/general` | Superuser | Update general fields + version |
| PATCH | `/api/company/:id/legal-tax` | Superuser, Accounts Head | Update legal/tax fields + version |
| PATCH | `/api/company/:id/address/:type` | Superuser | Upsert address by type |
| POST | `/api/company/:id/bank-accounts` | Superuser, Accounts Head | Add bank account |
| PATCH | `/api/company/:id/bank-accounts/:bankId` | Superuser, Accounts Head | Update bank account |
| DELETE | `/api/company/:id/bank-accounts/:bankId` | Superuser | Soft-delete (sets is_active=false) |
| PATCH | `/api/company/:id/erp-config` | Superuser | Update ERP config |
| PATCH | `/api/company/:id/branding` | Superuser | Update branding text fields |
| POST | `/api/company/:id/branding/logo` | Superuser | Upload logo image |
| POST | `/api/company/:id/branding/signature` | Superuser | Upload signature image |
| POST | `/api/company/:id/branding/seal` | Superuser | Upload seal image |
| POST | `/api/company/:id/documents/:docType` | Superuser | Upload document revision |
| GET | `/api/company/:id/documents` | All authenticated | Latest active revision per doc type |
| GET | `/api/company/:id/documents/:docType/history` | Superuser | Full revision history |
| GET | `/api/company/doc/:docId/download` | Superuser | Signed download URL (15 min) |
| GET | `/api/company/doc/:docId/view` | All authenticated | Signed inline URL (60 min) |
| PATCH | `/api/company/doc/:docId/status` | Superuser, Accounts Head | Update doc status/expiry |
| PATCH | `/api/company/:id/activate` | Superuser | Atomic active company swap |
| GET | `/api/company/:id/audit-log` | Superuser | Paginated audit log |

### 17.2 Standardized Error Payload

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable summary.",
  "fields": {
    "gstin": "GSTIN checksum invalid.",
    "timezone": "Must be a valid IANA timezone identifier."
  }
}
```

Error codes: `VALIDATION_ERROR` · `ROLE_FORBIDDEN` · `CONCURRENT_UPDATE` · `NOT_FOUND` · `CONFLICT` · `RATE_LIMITED` · `MIME_REJECTED` · `MAGIC_BYTE_REJECTED`

### 17.3 Role Failure Response

```json
HTTP 403
{
  "error": "ROLE_FORBIDDEN",
  "message": "This action requires Superuser or Accounts Head role.",
  "required": ["Superuser", "Accounts Head"],
  "actual": "Employee"
}
```

---

## 18. Role Matrix

| Action | Superuser | Accounts Head | HR Head | GM / SM / Employee |
|---|---|---|---|---|
| View all tabs | ✅ | ✅ | Legal & Tax read-only | General tab only |
| Edit General | ✅ | ❌ | ❌ | ❌ |
| Edit Legal & Tax | ✅ | ✅ | ❌ | ❌ |
| Edit Address | ✅ | ❌ | ❌ | ❌ |
| Edit Banking | ✅ | ✅ | ❌ | ❌ |
| Edit ERP Config | ✅ | ❌ | ❌ | ❌ |
| Edit Branding Text | ✅ | ❌ | ❌ | ❌ |
| Upload Branding Assets | ✅ | ❌ | ❌ | ❌ |
| Upload Documents | ✅ | ❌ | ❌ | ❌ |
| Update Doc Status | ✅ | ✅ | ❌ | ❌ |
| Activate Company | ✅ | ❌ | ❌ | ❌ |
| View Audit Log | ✅ | ❌ | ❌ | ❌ |

---

## 19. UI Governance

| Behaviour | Rule |
|---|---|
| Unsaved changes warning | Each tab tracks `isDirty` via `react-hook-form formState.isDirty`. Navigation away while dirty shows `beforeunload` + custom modal |
| Dirty-state tracking | Derived from `formState.isDirty`; reset on successful save via `form.reset(serverData)` |
| Tab-level save | Each tab has its own Save button. Saving one tab does not affect other tabs |
| Cancel / Revert | Resets form to last-fetched server state. Does not navigate away |
| Optimistic lock error | On `409 CONCURRENT_UPDATE`: toast "Record updated by another user — latest version shown", then reload from server |
| `version` field | Sent in every PATCH body; never displayed to the user |

---

## 20. Seed Governance

1. **Idempotent:** Check `SELECT COUNT(*) FROM company_master` at server startup. If any row exists, skip entirely.
2. **Only when empty:** Seed runs once, only when the table has zero rows.
3. **Never overwrite:** No upsert, update, or merge path in the seed function.

Seed record (confirmed from codebase scan):

```
company_code:      TPEL
short_name:        THERMOPAC
legal_name:        THERMOPAC PROCESS ENGINEERING LLP
display_name:      THERMOPAC Process Engineering LLP
company_type:      LLP
fy_start_month:    4
base_currency:     INR
timezone:          Asia/Kolkata
is_active:         true
version:           1
```

Registered office address (confirmed from `offer-pdf-generator.ts:741` and `salary-slip-generator.ts:532`):

```
address_type:  registered_office
address_line1: L 4, 405 The Summit Business Bay
address_line2: Vile Parle (East), W E Highway
city:          Mumbai
state:         Maharashtra
country:       India
pin_code:      400057
```

All other sub-tables (`company_legal_tax`, `company_bank_accounts`, `company_erp_config`, `company_branding`, `company_documents`) seeded as empty. Admin must populate via the UI.

---

## 21. GCS Governance Seed (12 Rules)

Module key: `company` · Root prefix: `TPEL/COMPANY`

**9 document governance rules** (submodule: `compliance`):

| Doc Type | Label slug | Mandatory | Max MB | MIME |
|---|---|---|---|---|
| `GST_CERTIFICATE` | `gst-certificate` | Yes | 20 | PDF, JPEG, PNG, WEBP |
| `PAN_CARD` | `pan-card` | Yes | 20 | PDF, JPEG, PNG, WEBP |
| `CANCELLED_CHEQUE` | `cancelled-cheque` | Yes | 20 | PDF, JPEG, PNG, WEBP |
| `INCORPORATION_CERTIFICATE` | `incorporation-certificate` | Yes | 20 | PDF, JPEG, PNG, WEBP |
| `IEC_CERTIFICATE` | `iec-certificate` | No | 20 | PDF, JPEG, PNG, WEBP |
| `LUT_COPY` | `lut-copy` | No | 20 | PDF, JPEG, PNG, WEBP |
| `MSME_CERTIFICATE` | `msme-certificate` | No | 20 | PDF, JPEG, PNG, WEBP |
| `FACTORY_LICENSE` | `factory-license` | No | 20 | PDF, JPEG, PNG, WEBP |
| `PF_ESI_DOCUMENT` | `pf-esi-document` | No | 20 | PDF, JPEG, PNG, WEBP |

**3 branding asset governance rules** (submodule: `branding`):

| Asset Type | Mandatory | Max MB | MIME |
|---|---|---|---|
| `COMPANY_LOGO` | No | 2 | JPEG, PNG, WEBP |
| `COMPANY_SIGNATURE` | No | 2 | JPEG, PNG, WEBP |
| `COMPANY_SEAL` | No | 2 | JPEG, PNG, WEBP |

---

## 22. Cross-Module Dependency Map

5 callsites confirmed hardcoded — **Phase 2 replacement only, not in Phase 1 scope**:

| File | Line(s) | Hardcoded Value | Target |
|---|---|---|---|
| `server/salary-slip-generator.ts` | 167, 519, 532 | `"THERMOPAC PROCESS ENGINEERING LLP"`, address | `company_master.legal_name` + `company_addresses.registered_office` |
| `server/offer-pdf-generator.ts` | 741 | Legal name + address footer | Same |
| `server/services/document-path-resolver.ts` | 197 | `COMPANY: 'TPEL'` | `company_master.company_code` |
| `server/advance-tax-routes.ts` | 91 | `companyName = 'TPEL'` | `company_master.company_code` |
| `client/src/components/buy-datasheet-dialog.tsx` | 69, 143 | `"THERMOPAC PROCESS ENGINEERING LLP"` | `company_master.legal_name` |

---

## 23. Implementation Sequence (Phase 1 — 8 steps)

| Step | Action |
|---|---|
| 1 | Add 8 tables + all indexes to `shared/schema.ts` |
| 2 | Run `drizzle-kit push:pg` to apply schema |
| 3 | Create `server/company-routes.ts` — all 23 routes, multer, GCS, MIME/magic-byte, rate limiting, optimistic lock |
| 4 | Register in `server/routes.ts` at `/api/company` |
| 5 | Seed: initial THERMOPAC record + 12 GCS governance rules at server startup |
| 6 | Create `client/src/pages/company-information-page.tsx` — 8 tabs, dirty-state, version field |
| 7 | Register in `client/src/App.tsx` at `/administration/company-information` |
| 8 | Add nav entry in `client/src/components/layout.tsx` under Administration |

---

## 24. Lifecycle Validation Checklist (25 tests)

| # | Test | Expected |
|---|---|---|
| 1 | `POST /api/company` — create | 201, record in DB, `version=1` |
| 2 | `GET /api/company/active` | 200, full payload |
| 3 | `PATCH legal-tax` invalid GSTIN | 400, `VALIDATION_ERROR`, `fields.gstin` populated |
| 4 | `POST .../documents/GST_CERTIFICATE` valid PDF | 201, GCS at `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf` |
| 5 | Upload second revision same doc type | Prior `is_active=false`; new `revision_number=2`, `is_active=true` |
| 6 | DB index test — attempt third active revision manually | DB rejects: `idx_single_active_doc` unique violation |
| 7 | DB index test — attempt second active company manually | DB rejects: `idx_single_active_company` unique violation |
| 8 | `GET /doc/:docId/download` | Signed URL, 15-min TTL, v4 |
| 9 | `GET /doc/:docId/view` | Signed URL, 60-min TTL, v4 |
| 10 | Use signed URL after TTL expiry | GCS returns `403 Forbidden` |
| 11 | `GET /api/company/:id/audit-log` | `field_change` rows per field for every PATCH |
| 12 | Non-Superuser PATCH general | `403 ROLE_FORBIDDEN` |
| 13 | Accounts Head PATCH legal-tax | 200, `legal_change` in audit log |
| 14 | PATCH with stale `version` | `409 CONCURRENT_UPDATE` |
| 15 | `POST bank-accounts` duplicate `account_number` | `409 CONFLICT` |
| 16 | `DELETE bank-accounts/:id` | `is_active=false` in DB; no SQL DELETE issued |
| 17 | Upload PDF with MIME header `image/jpeg` (MIME spoof) | `400 MIME_REJECTED` |
| 18 | Upload JPEG wrapper containing ZIP content (magic-byte mismatch) | `400 MAGIC_BYTE_REJECTED` |
| 19 | Branding upload with `application/pdf` MIME | `400 MIME_REJECTED` (images only) |
| 20 | `PATCH general` with timezone `"Mars/Olympus"` (invalid IANA) | `400 VALIDATION_ERROR`, `fields.timezone` |
| 21 | `PATCH general` with `base_currency: "XYZ"` (invalid ISO-4217) | `400 VALIDATION_ERROR`, `fields.base_currency` |
| 22 | `POST bank-accounts` with `currency: "ABC"` (invalid ISO-4217) | `400 VALIDATION_ERROR`, `fields.currency` |
| 23 | Upload filename `../../etc/passwd.pdf` | Stored as `passwd.pdf`; GCS path unaffected; sanitized name in DB |
| 24 | Direct `UPDATE company_audit_log` via any app route | No such route exists; 404 |
| 25 | Exceed document upload rate limit (11 requests/1 min) | `429 RATE_LIMITED` |

---

## 25. Approval Readiness Summary

| # | Governance Item | Status |
|---|---|---|
| 1 | Phase 1 table count = 8 (explicit list) | ✅ §2.2 |
| 2 | Partial unique index — single active company (`idx_single_active_company`) | ✅ §4.1 |
| 3 | Partial unique index — single active doc revision (`idx_single_active_doc`) | ✅ §4.7 |
| 4 | GCS path convention — UPPERCASE fixed segments, single authoritative rule, no contradiction | ✅ §10.1 |
| 5 | GCS examples consistent with chosen convention throughout §10 | ✅ §10.2, §10.3 |
| 6 | FK `company_id` → `ON DELETE RESTRICT` | ✅ §4.0 |
| 7 | FK `changed_by` → `ON DELETE SET NULL` | ✅ §4.0 |
| 8 | FK `updated_by` → `ON DELETE SET NULL` | ✅ §4.0 |
| 9 | FK `created_by` → `ON DELETE SET NULL` | ✅ §4.0 |
| 10 | FK `uploaded_by` → `ON DELETE SET NULL` | ✅ §4.0 + §4.7 |
| 11 | IANA timezone validation — server-side mandatory | ✅ §11 |
| 12 | ISO-4217 currency validation — covers `base_currency` and `bank_accounts.currency` | ✅ §11 |
| 13 | Address type DB CHECK constraint | ✅ §4.3 |
| 14 | MIME validation — server-side, separate error code `MIME_REJECTED` | ✅ §9.1 |
| 15 | Magic-byte validation — server-side, separate error code `MAGIC_BYTE_REJECTED` | ✅ §9.1 |
| 16 | Filename sanitization — 6-step pipeline, GCS path unaffected | ✅ §9.3 |
| 17 | Signed URL TTL — download 15 min, view 60 min, GCS v4, fresh per request | ✅ §10.5 |
| 18 | Rate limiting — 5 endpoint groups defined | ✅ §12 |
| 19 | Soft-delete-only governance — all 8 tables covered explicitly | ✅ §5 |
| 20 | Branding asset retention — orphans retained, Phase 2 cleanup, audit permanent | ✅ §7 |
| 21 | Audit immutability — permanent, append-only, RESTRICT FK, no delete route | ✅ §15 |
| 22 | Audit survives user deletion — `ON DELETE SET NULL` on all user FKs | ✅ §4.0, §15 |
| 23 | Audit survives GCS object deletion — audit records never deleted | ✅ §15 |
| 24 | DB index enforcement — lifecycle tests #6 and #7 | ✅ §24 |
| 25 | MIME spoof rejection — lifecycle test #17 | ✅ §24 |
| 26 | Magic-byte mismatch rejection — lifecycle test #18 | ✅ §24 |
| 27 | Invalid IANA timezone rejection — lifecycle test #20 | ✅ §24 |
| 28 | Invalid ISO-4217 currency rejection — lifecycle tests #21, #22 | ✅ §24 |
| 29 | Filename sanitization — lifecycle test #23 | ✅ §24 |
| 30 | Signed URL expiry — lifecycle test #10 | ✅ §24 |
| 31 | Concurrency protection — optimistic lock, `version` column | ✅ §13 |
| 32 | Transaction governance — atomic business + audit | ✅ §14 |
| 33 | Seed governance — idempotent, skip-if-exists, no overwrite | ✅ §20 |
| 34 | UI governance — dirty state, unsaved warning, tab-level save, revert | ✅ §19 |
| 35 | Approval workflow — Phase 2 explicitly deferred | ✅ §8 |
| 36 | Branding dimension validation — Phase 2 explicitly deferred | ✅ §9.4 |
| 37 | Cache governance — no cache Phase 1; invalidation rule stated for Phase 2 | ✅ §16 |
| 38 | Implementation sequence — 8 ordered steps | ✅ §23 |
| 39 | Lifecycle validation — 25 test cases | ✅ §24 |
| 40 | Hardcoded callsite map — 5 identified, Phase 2 only | ✅ §22 |

**All 40 readiness items are ✅ Explicit.**  
**Phase 1 implementation is blocked pending your explicit approval.**
