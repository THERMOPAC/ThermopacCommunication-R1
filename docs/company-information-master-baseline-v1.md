# Company Information Master — Baseline v1.0 (FINAL)

**Status:** FINAL DRAFT — awaiting explicit approval before any implementation  
**Date:** 2026-05-20  
**Revision:** v1.0-rev3 (all final governance corrections applied)  
**Protocol:** `docs/operating-protocol-v1.0.md` — no implementation until this doc is approved.

---

## 1. Objective

Provide a single DB-backed source of truth for all THERMOPAC company data consumed by ERP modules. Replace hardcoded strings across server and client code with dynamic reads from `company_master` and related tables.

---

## 2. Scope

### 2.1 Phase 1 — In Scope

| Area | Detail |
|---|---|
| DB | **8 new tables** (see §4) |
| API | 22 routes under `/api/company` |
| UI | `/administration/company-information` — 8 tabs |
| GCS governance seed | 12 rules (9 document types + 3 branding assets) |
| Hardcoded callsites | 5 identified for future Phase 2 replacement — **not migrated in Phase 1** |

### 2.2 Phase 1 Table Count = 8

| # | Table |
|---|---|
| 1 | `company_master` |
| 2 | `company_legal_tax` |
| 3 | `company_addresses` |
| 4 | `company_bank_accounts` |
| 5 | `company_erp_config` |
| 6 | `company_branding` |
| 7 | `company_documents` |
| 8 | `company_audit_log` |

### 2.3 Explicitly Out of Scope (Phase 1)

- Replacement of 5 hardcoded callsites → **Phase 2**
- Multi-company nav switcher → **Phase 2**
- Approval workflow for legal/tax changes → **Phase 2**
- SAP B1 Company DB selection via UI → env-var `SAP_COMPANY_DB` boundary preserved
- Automatic cross-module propagation / event bus → **Phase 2**
- Branding asset dimension validation → **Phase 2**
- In-process caching layer → **Phase 2**
- Mobile/responsive redesign → desktop only

---

## 3. Active Company Governance

**Rule: Only one company record may have `is_active = true` globally at any time.**

- Enforced by a DB partial unique index (see §4.1).
- `PATCH /api/company/:id/activate` atomically sets the target to `is_active = true` and all others to `is_active = false` within a single transaction.
- Deactivating the sole active company is rejected with `409 CONFLICT` — message: "Cannot deactivate the only active company."
- `GET /api/company/active` returns the single active record. If none → 404. If more than one (data inconsistency) → 500 with alert.

---

## 4. DB Schema

### FK Delete Rules (applied globally)

- `company_id` foreign keys → **`ON DELETE RESTRICT`** (company cannot be deleted if child records exist)
- `changed_by`, `updated_by`, `created_by` foreign keys → **`ON DELETE SET NULL`** (user deletion does not orphan company records)

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

-- Single active company constraint
CREATE UNIQUE INDEX idx_company_master_one_active
  ON company_master (is_active)
  WHERE is_active = true;

CREATE INDEX idx_company_master_is_active  ON company_master(is_active);
CREATE INDEX idx_company_master_updated_at ON company_master(updated_at);
```

### 4.2 `company_legal_tax`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

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

CREATE INDEX idx_company_legal_tax_company_id  ON company_legal_tax(company_id);
CREATE INDEX idx_company_legal_tax_updated_at  ON company_legal_tax(updated_at);
```

### 4.3 `company_addresses`

```sql
company_addresses (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER     NOT NULL
                REFERENCES company_master(id) ON DELETE RESTRICT,
  address_type  VARCHAR(30) NOT NULL
                CHECK (address_type IN (
                  'registered_office','corporate_office',
                  'factory','dispatch','billing'
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

**Address type CHECK** — the DB `CHECK` constraint is authoritative. The application layer also validates the value before reaching the DB.

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

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

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

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

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
                    'GST_CERTIFICATE','PAN_CARD','IEC_CERTIFICATE','LUT_COPY',
                    'MSME_CERTIFICATE','CANCELLED_CHEQUE','INCORPORATION_CERTIFICATE',
                    'FACTORY_LICENSE','PF_ESI_DOCUMENT'
                  )),
  revision_number SMALLINT     NOT NULL DEFAULT 1,
  file_name       VARCHAR(255) NOT NULL,
  gcs_path        TEXT         NOT NULL,
  content_type    VARCHAR(80),
  size_bytes      INTEGER,
  status          VARCHAR(20)  NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded','verified','expired')),
  expiry_date     DATE,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  uploaded_by     INTEGER      NOT NULL
                  REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  notes           TEXT
);

-- Only one active revision per (company_id, doc_type)
CREATE UNIQUE INDEX idx_company_documents_one_active_revision
  ON company_documents (company_id, doc_type)
  WHERE is_active = true;

CREATE INDEX idx_company_documents_company_id ON company_documents(company_id);
CREATE INDEX idx_company_documents_doc_type   ON company_documents(doc_type);
CREATE INDEX idx_company_documents_is_active  ON company_documents(is_active);
```

### 4.8 `company_audit_log`

Immutable — **append-only, permanent retention**.

```sql
company_audit_log (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER     NOT NULL
              REFERENCES company_master(id) ON DELETE RESTRICT,
  action      VARCHAR(40) NOT NULL
              CHECK (action IN (
                'field_change','legal_change','doc_upload','doc_replace',
                'status_change','create','branding_upload','activation_change'
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

**Rule: No hard delete of any company record.**

- `company_master`: deactivation only via `is_active = false`. No `DELETE` route exists.
- `company_bank_accounts`: soft-delete via `is_active = false`. No `DELETE` route issues a SQL `DELETE`.
- `company_addresses`: `is_active = false` to retire an address. The `UNIQUE(company_id, address_type)` constraint means the address_type slot may be reactivated by setting a new record active.
- `company_documents`: `is_active = false` on superseded revisions. No physical GCS delete.
- `company_legal_tax`, `company_erp_config`, `company_branding`: updated in-place (single row per company_id); no delete route.
- `company_audit_log`: **no delete, no soft-delete, ever**. Permanent immutable record.

---

## 6. Document Revision Lifecycle

1. Upload triggers atomic transaction: set `is_active = false` on all prior `(company_id, doc_type)` rows → insert new row with `is_active = true`, `revision_number = MAX(prior) + 1`.
2. The partial unique index `idx_company_documents_one_active_revision` enforces single active revision at DB level.
3. Historical revisions (`is_active = false`) are immutable: `gcs_path`, `file_name`, `content_type`, `size_bytes`, `revision_number` may not be updated.
4. Only `status`, `expiry_date`, and `notes` are patchable on the active revision.
5. No physical GCS object deletion occurs via this module.

---

## 7. Approval Workflow

**Phase 2 out-of-scope.** No `company_change_approvals` table in Phase 1.

Phase 1 bridge: all `company_legal_tax` changes logged with `action = 'legal_change'` capturing `old_value` and `new_value` per field. Changes take effect immediately. Audit log serves as manual approval trail.

---

## 8. Upload Security Governance

### 8.1 MIME + Magic-Byte Validation

**Both** MIME type and magic-byte (file signature) are validated server-side for every upload. A file that passes MIME check but fails magic-byte check is rejected. A spoofed MIME is never trusted.

| Upload type | Allowed MIME | Magic bytes |
|---|---|---|
| Documents (all 9 types) | `application/pdf`, `image/jpeg`, `image/png`, `image/webp` | `%PDF-` / `\xFF\xD8\xFF` / `\x89PNG\r\n` / `RIFF...WEBP` |
| Branding assets (logo, signature, seal) | `image/jpeg`, `image/png`, `image/webp` | `\xFF\xD8\xFF` / `\x89PNG\r\n` / `RIFF...WEBP` |

Magic-byte check reads the first 12 bytes of the uploaded buffer only (no full-file scan). Rejection response: `400 VALIDATION_ERROR`, `message: "File content does not match declared type."`.

### 8.2 File Size Limits

| Upload type | Max size |
|---|---|
| Documents | 20 MB |
| Branding assets (logo, signature, seal) | 2 MB |

Enforced by multer `limits.fileSize` before any processing.

### 8.3 Deterministic Filename Sanitization

All filenames are **discarded**. The GCS object name is always computed server-side from the doc_type and revision_number — the client-provided filename is never used in the GCS path.

The original filename is stored in `company_documents.file_name` for display only, after applying this sanitization:
1. Strip path separators (`/`, `\`, `..`)
2. Replace all non-alphanumeric characters except `.`, `-`, `_` with `_`
3. Collapse consecutive `_` to single `_`
4. Trim leading and trailing `_`
5. Truncate to 120 characters

The sanitized filename is stored; the raw client filename is never persisted.

### 8.4 Dimension Validation (Branding Assets)

**Phase 2.** Not enforced in Phase 1. Maximum recommended dimensions (advisory only): 1000 × 1000 px.

---

## 9. GCS Path Governance

### 9.1 Physical Path Convention

**All GCS physical path segments use UPPERCASE for controlled-vocabulary segments and the company code.** Lowercase is used only for derived labels.

```
TPEL/COMPANY/{CompanyCode}/{DocType}/rev-{RevNo}/{Seq}-{label}.{ext}
```

| Segment | Convention | Example |
|---|---|---|
| Root | UPPERCASE fixed | `TPEL` |
| Module folder | UPPERCASE fixed | `COMPANY` |
| `{CompanyCode}` | UPPERCASE from `company_master.company_code` | `TPEL` |
| `{DocType}` | UPPER_SNAKE_CASE controlled vocabulary | `GST_CERTIFICATE` |
| `rev-{RevNo}` | lowercase `rev-` + zero-padded 2-digit integer | `rev-01` |
| `{Seq}` | zero-padded 3-digit integer | `001` |
| `{label}` | lowercase kebab-case derived from doc_type | `gst-certificate` |
| `{ext}` | lowercase from MIME | `pdf`, `jpg`, `png`, `webp` |

### 9.2 Document Path

```
TPEL/COMPANY/{CompanyCode}/{DocType}/rev-{RevNo}/{Seq}-{label}.{ext}
```

Example: `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf`

### 9.3 Branding Asset Paths

```
TPEL/COMPANY/{CompanyCode}/BRANDING/LOGO/{sanitized_filename}
TPEL/COMPANY/{CompanyCode}/BRANDING/SIGNATURE/{sanitized_filename}
TPEL/COMPANY/{CompanyCode}/BRANDING/SEAL/{sanitized_filename}
```

### 9.4 Path Generation Rules

- Paths are **always computed server-side**. Clients never supply raw GCS paths.
- **Deterministic**: same inputs always produce the same path.
- GCS objects are never renamed after upload.

### 9.5 Signed URL TTL Governance

| Endpoint | Action | TTL |
|---|---|---|
| `GET /doc/:docId/download` | `read` (attachment) | 15 minutes |
| `GET /doc/:docId/view` | `read` (inline) | 60 minutes |
| Branding asset view | `read` (inline) | 60 minutes |

- Signed URL version: **v4** (GCS standard).
- URLs are generated fresh on every request — no signed URL caching.
- TTL values are hardcoded constants in the route handler; not configurable via request params.

---

## 10. Validation Rules

### Timezone
- Must be a **valid IANA timezone** from the IANA Time Zone Database (e.g. `Asia/Kolkata`, `UTC`, `America/New_York`).
- Server-side validation: `Intl.supportedValuesOf('timeZone').includes(value)` (Node 18+) or equivalent tz-db check.
- Rejection: `400 VALIDATION_ERROR`, `fields.timezone: "Must be a valid IANA timezone identifier."`

### Currency
- Must be a **valid ISO-4217 currency code** (3 uppercase letters, from a maintained allowlist).
- Allowlist (Phase 1): `INR`, `USD`, `EUR`, `GBP`, `AED`, `SGD`, `JPY`, `CHF` — extensible by admin in Phase 2.
- Rejection: `400 VALIDATION_ERROR`, `fields.base_currency: "Must be a valid ISO-4217 currency code."`

### PAN
- Format: `/^[A-Z]{5}[0-9]{4}[A-Z]$/` (10 chars)

### GSTIN
- Format: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/` (15 chars)
- State code (chars 1–2) must match `gst_state_code`
- Embedded PAN (chars 3–12) must match stored `pan`
- Luhn mod-36 checksum enforced server-side

### IEC
- Format: `/^[0-9]{10}$/`

### IFSC
- Format: `/^[A-Z]{4}0[A-Z0-9]{6}$/` (11 chars; 5th char always `0`)

### CIN
- Format: `/^[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/` (21 chars)

### TAN
- Format: `/^[A-Z]{4}[0-9]{5}[A-Z]$/` (10 chars)

### Address type
- Validated at application layer AND enforced by DB `CHECK` constraint (§4.3).
- Valid values: `registered_office`, `corporate_office`, `factory`, `dispatch`, `billing`

---

## 11. Rate Limiting

Applied per authenticated user session via express-rate-limit middleware on the following endpoint groups:

| Endpoint group | Window | Max requests |
|---|---|---|
| `POST /api/company/:id/documents/:docType` (upload) | 1 minute | 10 |
| `POST /api/company/:id/branding/logo\|signature\|seal` (upload) | 1 minute | 5 |
| `GET /api/company/doc/:docId/download` | 1 minute | 30 |
| `GET /api/company/doc/:docId/view` | 1 minute | 60 |
| `PATCH /api/company/:id/activate` | 1 minute | 3 |

Exceeded limit response: `429 Too Many Requests`.

---

## 12. Concurrency Protection (Optimistic Locking)

Every mutable table carries `version INTEGER NOT NULL DEFAULT 1`.

**Write protocol:**
1. Client reads record; receives current `version`.
2. Client sends PATCH body including `{ version: N }`.
3. Server: `UPDATE ... SET version = N+1, updated_at = NOW() WHERE id = :id AND version = :N`
4. 0 rows updated → `409 CONCURRENT_UPDATE` — "Record was modified by another user. Please refresh and retry."
5. On success → return updated record with new `version`.

Tables: `company_master`, `company_legal_tax`, `company_addresses`, `company_bank_accounts`, `company_erp_config`, `company_branding`.

`company_documents` and `company_audit_log` are append-only — no version column.

---

## 13. Transaction Governance

All POST and PATCH routes wrap the business update + audit log insert in a single DB transaction.

```typescript
await db.transaction(async (tx) => {
  await tx.update(targetTable).set({ ... }).where(...);
  await tx.insert(companyAuditLog).values({ action, field_name, old_value, new_value, ... });
});
```

Applies to: all PATCH routes, document upload (deactivate prior + insert new + audit), branding upload, company activation (atomic swap + audit).

---

## 14. Audit Governance

| Policy | Rule |
|---|---|
| Retention | **Permanent** — no time-based purge, no archival delete |
| Cascade delete | `ON DELETE RESTRICT` on `company_id` FK — a company cannot be deleted while audit records exist |
| `changed_by` user deletion | `ON DELETE SET NULL` — audit row preserved; user reference set to NULL |
| Immutability | No application route ever issues `UPDATE` or `DELETE` on `company_audit_log` |
| Append-only | Drizzle schema for `company_audit_log` exposes insert only — no `.update()` or `.delete()` methods wired |
| Action vocabulary | Controlled by DB `CHECK` constraint (§4.8) |

---

## 15. Cache Governance

**Phase 1: No caching.** All reads hit the DB directly.

**Phase 2 rule (future):** If a cache is added, invalidation is mandatory on every write to any company sub-table. Cache key: `company:active`. TTL ≤ 5 minutes. Stale-while-revalidate is prohibited for legal name, GSTIN, and address fields.

---

## 16. API Routes

### 16.1 Route Table

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/company` | All authenticated | List all (id, code, short_name, is_active) |
| GET | `/api/company/active` | All authenticated | Full active company payload |
| GET | `/api/company/:id` | All authenticated | Full single company payload |
| POST | `/api/company` | Superuser | Create company |
| PATCH | `/api/company/:id/general` | Superuser | Update general + version check |
| PATCH | `/api/company/:id/legal-tax` | Superuser, Accounts Head | Update legal/tax + version check |
| PATCH | `/api/company/:id/address/:type` | Superuser | Upsert address by type |
| POST | `/api/company/:id/bank-accounts` | Superuser, Accounts Head | Add bank account |
| PATCH | `/api/company/:id/bank-accounts/:bankId` | Superuser, Accounts Head | Update bank account |
| DELETE | `/api/company/:id/bank-accounts/:bankId` | Superuser | Soft-delete (is_active=false) |
| PATCH | `/api/company/:id/erp-config` | Superuser | Update ERP config |
| PATCH | `/api/company/:id/branding` | Superuser | Update branding text fields |
| POST | `/api/company/:id/branding/logo` | Superuser | Upload logo |
| POST | `/api/company/:id/branding/signature` | Superuser | Upload signature |
| POST | `/api/company/:id/branding/seal` | Superuser | Upload seal |
| POST | `/api/company/:id/documents/:docType` | Superuser | Upload document revision |
| GET | `/api/company/:id/documents` | All authenticated | Latest active revision per doc type |
| GET | `/api/company/:id/documents/:docType/history` | Superuser | Full revision history |
| GET | `/api/company/doc/:docId/download` | Superuser | Signed download URL (15 min TTL) |
| GET | `/api/company/doc/:docId/view` | All authenticated | Signed view URL (60 min TTL) |
| PATCH | `/api/company/doc/:docId/status` | Superuser, Accounts Head | Update status/expiry |
| PATCH | `/api/company/:id/activate` | Superuser | Atomic active company swap |
| GET | `/api/company/:id/audit-log` | Superuser | Paginated audit log |

### 16.2 Standardized Error Payload

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable summary.",
  "fields": {
    "gstin": "GSTIN checksum invalid.",
    "pan": "PAN format invalid."
  }
}
```

Error codes: `VALIDATION_ERROR`, `ROLE_FORBIDDEN`, `CONCURRENT_UPDATE`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `MIME_REJECTED`, `MAGIC_BYTE_REJECTED`

### 16.3 Role Failure Response

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

## 17. Role Matrix

| Action | Superuser | Accounts Head | HR Head | GM / SM / Employee |
|---|---|---|---|---|
| View all tabs | ✅ | ✅ | Legal & Tax (read) | General tab only |
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

## 18. UI Governance

| Behaviour | Rule |
|---|---|
| Unsaved changes warning | Each tab tracks `isDirty` via `react-hook-form`'s `formState.isDirty`. Navigating away while dirty shows browser `beforeunload` + custom modal |
| Dirty-state tracking | `isDirty` derived from `formState.isDirty`; reset on successful save via `form.reset(serverData)` |
| Tab-level save | Each tab has its own Save button; saving one tab does not affect others |
| Cancel / Revert | Resets form to last-fetched server state. Does not navigate away |
| Optimistic lock error | On `409 CONCURRENT_UPDATE`: toast "Record updated by another user — latest version shown", then reload |
| `version` field | Sent in every PATCH body; not displayed to user |

---

## 19. Seed Governance

1. **Idempotent:** Run only when `COUNT(*) FROM company_master = 0`.
2. **Skip-if-exists:** If any company record exists, seed is skipped entirely.
3. **Never overwrite:** No upsert or update path in the seed function.

Seed values (confirmed from codebase scan):

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

Registered office (confirmed from offer-pdf-generator.ts line 741 and salary-slip-generator.ts line 532):
```
address_type:  registered_office
address_line1: L 4, 405 The Summit Business Bay
address_line2: Vile Parle (East), W E Highway
city:          Mumbai
state:         Maharashtra
country:       India
pin_code:      400057
```

All other sub-tables seeded empty.

---

## 20. GCS Governance Seed (12 Rules)

Module: `company` · Submodule: `compliance` · Root: `TPEL/COMPANY`

**9 document rules:**

| Doc Type | Label | Mandatory | Max MB | MIME |
|---|---|---|---|---|
| `GST_CERTIFICATE` | gst-certificate | Yes | 20 | PDF, JPG, PNG, WEBP |
| `PAN_CARD` | pan-card | Yes | 20 | PDF, JPG, PNG, WEBP |
| `CANCELLED_CHEQUE` | cancelled-cheque | Yes | 20 | PDF, JPG, PNG, WEBP |
| `INCORPORATION_CERTIFICATE` | incorporation-certificate | Yes | 20 | PDF, JPG, PNG, WEBP |
| `IEC_CERTIFICATE` | iec-certificate | No | 20 | PDF, JPG, PNG, WEBP |
| `LUT_COPY` | lut-copy | No | 20 | PDF, JPG, PNG, WEBP |
| `MSME_CERTIFICATE` | msme-certificate | No | 20 | PDF, JPG, PNG, WEBP |
| `FACTORY_LICENSE` | factory-license | No | 20 | PDF, JPG, PNG, WEBP |
| `PF_ESI_DOCUMENT` | pf-esi-document | No | 20 | PDF, JPG, PNG, WEBP |

**3 branding asset rules:** `COMPANY_LOGO`, `COMPANY_SIGNATURE`, `COMPANY_SEAL` — module `company`, submodule `branding`, max 2 MB, image-only.

---

## 21. Cross-Module Dependency Map

5 callsites confirmed hardcoded — **Phase 2 replacement only**:

| File | Line(s) | Hardcoded Value | Target |
|---|---|---|---|
| `server/salary-slip-generator.ts` | 167, 519, 532 | Legal name, address | `company_master.legal_name` + registered office |
| `server/offer-pdf-generator.ts` | 741 | Legal name + address footer | Same |
| `server/services/document-path-resolver.ts` | 197 | `COMPANY: 'TPEL'` | `company_master.company_code` |
| `server/advance-tax-routes.ts` | 91 | `companyName = 'TPEL'` | `company_master.company_code` |
| `client/src/components/buy-datasheet-dialog.tsx` | 69, 143 | Legal name | `company_master.legal_name` |

---

## 22. Implementation Sequence (Phase 1)

1. Add 8 tables + all indexes to `shared/schema.ts`
2. `drizzle-kit push:pg` to apply schema
3. Create `server/company-routes.ts` — all 23 routes, multer, GCS, validation, rate limiting
4. Register in `server/routes.ts` at `/api/company`
5. Seed initial THERMOPAC record + governance rules in server startup
6. Create `client/src/pages/company-information-page.tsx` — 8 tabs, dirty-state, version field
7. Register in `client/src/App.tsx` at `/administration/company-information`
8. Add nav entry in `client/src/components/layout.tsx` under Administration

---

## 23. Lifecycle Validation Checklist (24 tests)

| # | Test | Expected |
|---|---|---|
| 1 | `POST /api/company` → create | 201, record in DB with version=1 |
| 2 | `GET /api/company/active` | 200, full payload |
| 3 | `PATCH legal-tax` invalid GSTIN | 400, `VALIDATION_ERROR`, `fields.gstin` |
| 4 | `POST .../documents/GST_CERTIFICATE` valid PDF | 201, GCS at `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf` |
| 5 | Upload second revision same doc type | Prior `is_active=false`; new `revision_number=2`, `is_active=true` |
| 6 | DB partial unique index — third active revision attempt | DB rejects: unique index violation |
| 7 | `GET /doc/:docId/download` | Returns v4 signed URL with 15-min TTL |
| 8 | `GET /doc/:docId/view` | Returns v4 signed URL with 60-min TTL |
| 9 | Signed URL after TTL expiry | GCS returns 403 |
| 10 | `GET /api/company/:id/audit-log` | `field_change` entries for every PATCH field |
| 11 | Non-Superuser PATCH general | 403, `ROLE_FORBIDDEN` |
| 12 | Accounts Head PATCH legal-tax | 200, `legal_change` in audit log |
| 13 | PATCH with stale `version` | 409, `CONCURRENT_UPDATE` |
| 14 | DB partial unique index — second active company | DB rejects: `idx_company_master_one_active` violation |
| 15 | `POST bank-accounts` duplicate `account_number` | 409, `CONFLICT` |
| 16 | `DELETE bank-accounts/:id` | `is_active=false` in DB; no SQL DELETE |
| 17 | Upload PDF with MIME declared as `image/jpeg` (spoof) | 400, `MIME_REJECTED` |
| 18 | Upload JPEG with magic bytes of a ZIP file | 400, `MAGIC_BYTE_REJECTED` |
| 19 | Branding upload with `application/pdf` MIME | 400, `MIME_REJECTED` (images only) |
| 20 | `PATCH general` with invalid IANA timezone | 400, `VALIDATION_ERROR`, `fields.timezone` |
| 21 | `PATCH general` with invalid ISO-4217 currency | 400, `VALIDATION_ERROR`, `fields.base_currency` |
| 22 | Upload filename `../../etc/passwd.pdf` | Sanitized to `passwd.pdf`; stored sanitized name; GCS path unaffected |
| 23 | Direct `UPDATE company_audit_log` via app route | No such route exists; 404 |
| 24 | Exceed upload rate limit (11 requests/minute) | 429, `RATE_LIMITED` |

---

## 24. Approval Readiness Summary

| # | Item | Status |
|---|---|---|
| 1 | Phase 1 table count = 8 | ✅ Explicit list in §2.2 |
| 2 | GCS physical path uppercase convention | ✅ §9.1 — UPPERCASE fixed segments, lowercase labels only |
| 3 | Partial unique index — single active company | ✅ `idx_company_master_one_active` in §4.1 |
| 4 | Partial unique index — single active doc revision | ✅ `idx_company_documents_one_active_revision` in §4.7 |
| 5 | FK delete rules (RESTRICT / SET NULL) | ✅ All tables — §4 preamble |
| 6 | IANA timezone validation | ✅ §10 |
| 7 | ISO-4217 currency validation | ✅ §10 with Phase 1 allowlist |
| 8 | Address type CHECK/ENUM | ✅ DB CHECK + app-layer validation §4.3 |
| 9 | MIME + magic-byte validation | ✅ §8.1 — both enforced, separate error codes |
| 10 | Deterministic filename sanitization | ✅ §8.3 — 5-step sanitization, GCS path unaffected |
| 11 | Signed URL TTL governance | ✅ §9.5 — download 15 min, view 60 min, v4 |
| 12 | Rate limiting | ✅ §11 — 5 endpoint groups defined |
| 13 | Soft-delete-only governance | ✅ §5 — all tables explicitly covered |
| 14 | Audit immutability | ✅ §14 — append-only, RESTRICT FK, no delete route |
| 15 | DB unique index enforcement test | ✅ Tests #6 and #14 in §23 |
| 16 | MIME spoof rejection test | ✅ Test #17 |
| 17 | Magic-byte mismatch rejection test | ✅ Test #18 |
| 18 | Invalid timezone rejection test | ✅ Test #20 |
| 19 | Invalid currency rejection test | ✅ Test #21 |
| 20 | Filename sanitization test | ✅ Test #22 |
| 21 | Signed URL expiry test | ✅ Test #9 |
| 22 | Concurrency protection | ✅ §12 — version column, 409 response |
| 23 | Transaction governance | ✅ §13 — atomic business + audit |
| 24 | Seed governance | ✅ §19 — idempotent, skip-if-exists, never overwrite |
| 25 | UI governance | ✅ §18 — dirty state, unsaved warning, tab-level save |
| 26 | Approval workflow | ✅ Phase 2 — explicitly deferred, §7 |
| 27 | Branding dimension validation | ✅ Phase 2 — explicitly deferred, §8.4 |
| 28 | Cache governance | ✅ Phase 1 = no cache; Phase 2 rule stated §15 |
| 29 | Implementation sequence | ✅ §22 — 8 ordered steps |
| 30 | Lifecycle validation | ✅ 24 test cases in §23 |

**All 30 readiness items are ✅ Explicit. Phase 1 implementation may begin upon explicit approval.**
