# Company Information Master — Baseline v1.0

**Status:** REVISED DRAFT — awaiting approval  
**Date:** 2026-05-20  
**Revision:** v1.0-rev2 (18 corrections applied per review)  
**Protocol:** `docs/operating-protocol-v1.0.md` — no implementation until this doc is approved.

---

## 1. Objective

Provide a single DB-backed source of truth for all THERMOPAC company data consumed by ERP modules. Replace hardcoded strings scattered across server and client code with dynamic reads from `company_master` and related tables.

---

## 2. Scope

### 2.1 In Scope

| Area | What changes |
|---|---|
| DB | 9 new tables: `company_master`, `company_legal_tax`, `company_addresses`, `company_bank_accounts`, `company_erp_config`, `company_branding`, `company_documents`, `company_audit_log` + branding asset tracking in `company_master` |
| API | CRUD routes under `/api/company` (Superuser / Accounts Head only for write) |
| UI | New page `/administration/company-information` with 8 tabs |
| Governance seed | 9 GCS governance rules for company document uploads + 3 branding asset rules |
| Hardcoded identification | 5 confirmed callsites **identified for future replacement** (Phase 2) |

### 2.2 Explicitly Out of Scope (this baseline)

- Migration of hardcoded callsites to dynamic reads — **Phase 2 only**
- Multi-company nav switcher — **Phase 2 only**
- Approval workflow for legal/tax changes — **Phase 2 only** (see §6.2)
- SAP B1 Company DB selection — remains env-var `SAP_COMPANY_DB` (SAP governance boundary)
- Automatic cross-module propagation / event bus — **Phase 2 only**
- Mobile / responsive redesign — desktop layout only

---

## 3. Active Company Governance

**Rule:** Only one active company is allowed globally at any time (`company_master.is_active = true`).

- A new company record may be created with `is_active = false` (staging / future entity).
- Setting a record to `is_active = true` must atomically set all other records to `is_active = false` within the same DB transaction.
- `GET /api/company/active` returns the single active record. If none exists → 404. If multiple exist (data inconsistency) → 500 with alert.
- Deactivation of the only active company is rejected with 409.

---

## 4. DB Schema

### 4.1 `company_master`

```sql
company_master (
  id                  SERIAL PRIMARY KEY,
  company_code        VARCHAR(10)   NOT NULL UNIQUE,   -- e.g. TPEL
  short_name          VARCHAR(30)   NOT NULL,
  legal_name          VARCHAR(120)  NOT NULL,
  display_name        VARCHAR(120)  NOT NULL,
  company_type        VARCHAR(40),                     -- LLP, Pvt Ltd, Public Ltd …
  industry            VARCHAR(80),
  fy_start_month      SMALLINT      NOT NULL DEFAULT 4, -- April = 4
  base_currency       VARCHAR(3)    NOT NULL DEFAULT 'INR',
  timezone            VARCHAR(60)   NOT NULL DEFAULT 'Asia/Kolkata',
  logo_gcs_path       TEXT,
  signature_gcs_path  TEXT,
  seal_gcs_path       TEXT,
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  version             INTEGER       NOT NULL DEFAULT 1,  -- optimistic lock counter
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP     NOT NULL DEFAULT NOW()
)
-- Index
CREATE INDEX idx_company_master_is_active ON company_master(is_active);
CREATE INDEX idx_company_master_updated_at ON company_master(updated_at);
```

### 4.2 `company_legal_tax`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

```sql
company_legal_tax (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL UNIQUE REFERENCES company_master(id),
  cin                   VARCHAR(21),
  pan                   VARCHAR(10),
  gstin                 VARCHAR(15),
  iec_code              VARCHAR(10),
  iec_branch            VARCHAR(40),          -- export compliance
  lut_number            VARCHAR(40),
  lut_validity_date     DATE,
  lut_financial_year    VARCHAR(10),          -- export compliance e.g. 2526
  msme_udyam            VARCHAR(20),
  tan                   VARCHAR(10),
  pf_number             VARCHAR(20),
  esi_number            VARCHAR(17),
  gst_registration_type VARCHAR(40),          -- Regular, Composition, SEZ, etc.
  gst_state_code        VARCHAR(3),
  export_without_gst    BOOLEAN               NOT NULL DEFAULT false,
  ad_code               VARCHAR(14),          -- export compliance
  authorized_dealer_bank VARCHAR(80),         -- export compliance
  version               INTEGER               NOT NULL DEFAULT 1,
  updated_by            INTEGER REFERENCES users(id),
  updated_at            TIMESTAMP             NOT NULL DEFAULT NOW()
)
CREATE INDEX idx_company_legal_tax_company_id ON company_legal_tax(company_id);
CREATE INDEX idx_company_legal_tax_updated_at ON company_legal_tax(updated_at);
```

### 4.3 `company_addresses`

```sql
company_addresses (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES company_master(id),
  address_type  VARCHAR(30) NOT NULL,   -- registered_office | corporate_office | factory | dispatch | billing
  address_line1 TEXT,
  address_line2 TEXT,
  city          VARCHAR(60),
  district      VARCHAR(60),
  state         VARCHAR(60),
  country       VARCHAR(60)   NOT NULL DEFAULT 'India',
  pin_code      VARCHAR(10),
  geo_lat       NUMERIC(10,6),
  geo_lng       NUMERIC(10,6),
  is_active     BOOLEAN       NOT NULL DEFAULT true,
  version       INTEGER       NOT NULL DEFAULT 1,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMP     NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, address_type)
)
CREATE INDEX idx_company_addresses_company_id ON company_addresses(company_id);
CREATE INDEX idx_company_addresses_is_active ON company_addresses(is_active);
```

**Address types (controlled vocabulary):** `registered_office`, `corporate_office`, `factory`, `dispatch`, `billing`

### 4.4 `company_bank_accounts`

```sql
company_bank_accounts (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES company_master(id),
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
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, account_number)
)
CREATE INDEX idx_company_bank_accounts_company_id ON company_bank_accounts(company_id);
CREATE INDEX idx_company_bank_accounts_is_active ON company_bank_accounts(is_active);
```

### 4.5 `company_erp_config`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

```sql
company_erp_config (
  id                     SERIAL PRIMARY KEY,
  company_id             INTEGER NOT NULL UNIQUE REFERENCES company_master(id),
  sap_company_db         VARCHAR(60),
  sap_branch_code        VARCHAR(20),
  default_warehouse      VARCHAR(40),
  default_cost_center    VARCHAR(40),
  default_payment_terms  VARCHAR(80),
  default_delivery_terms VARCHAR(80),
  base_uom               VARCHAR(20),
  decimal_precision      SMALLINT NOT NULL DEFAULT 2,
  version                INTEGER  NOT NULL DEFAULT 1,
  updated_by             INTEGER REFERENCES users(id),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
)
CREATE INDEX idx_company_erp_config_company_id ON company_erp_config(company_id);
```

### 4.6 `company_branding`

One-to-one with `company_master`. `UNIQUE(company_id)` enforced.

```sql
company_branding (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL UNIQUE REFERENCES company_master(id),
  default_letterhead  TEXT,
  footer_text         TEXT,
  terms_conditions    TEXT,
  rfq_footer          TEXT,
  offer_footer        TEXT,
  purchase_footer     TEXT,
  report_watermark    TEXT,
  version             INTEGER NOT NULL DEFAULT 1,
  updated_by          INTEGER REFERENCES users(id),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
)
CREATE INDEX idx_company_branding_company_id ON company_branding(company_id);
```

### 4.7 `company_documents`

GCS-governed uploads — immutable revision chain.

```sql
company_documents (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES company_master(id),
  doc_type        VARCHAR(40) NOT NULL,
  -- Controlled vocabulary: GST_CERTIFICATE | PAN_CARD | IEC_CERTIFICATE | LUT_COPY |
  -- MSME_CERTIFICATE | CANCELLED_CHEQUE | INCORPORATION_CERTIFICATE |
  -- FACTORY_LICENSE | PF_ESI_DOCUMENT
  revision_number SMALLINT    NOT NULL DEFAULT 1,
  file_name       VARCHAR(255) NOT NULL,
  gcs_path        TEXT         NOT NULL,
  content_type    VARCHAR(80),
  size_bytes      INTEGER,
  status          VARCHAR(20)  NOT NULL DEFAULT 'uploaded',  -- uploaded | verified | expired
  expiry_date     DATE,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  uploaded_by     INTEGER      NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  notes           TEXT
)
CREATE INDEX idx_company_documents_company_id ON company_documents(company_id);
CREATE INDEX idx_company_documents_doc_type ON company_documents(doc_type);
CREATE INDEX idx_company_documents_is_active ON company_documents(is_active);
```

### 4.8 `company_audit_log`

Immutable — no UPDATE or DELETE ever issued against this table. Permanent retention.

```sql
company_audit_log (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES company_master(id),
  action      VARCHAR(40) NOT NULL,
  -- Controlled vocabulary: field_change | legal_change | doc_upload | doc_replace |
  -- status_change | create | branding_upload | activation_change
  table_name  VARCHAR(60),
  field_name  VARCHAR(80),
  old_value   TEXT,
  new_value   TEXT,
  changed_by  INTEGER REFERENCES users(id),
  changed_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  notes       TEXT
)
CREATE INDEX idx_company_audit_log_company_id ON company_audit_log(company_id);
CREATE INDEX idx_company_audit_log_changed_at ON company_audit_log(changed_at);
```

---

## 5. Document Revision Lifecycle

1. **Uploading a new revision** atomically sets `is_active = false` on all prior revisions of the same `(company_id, doc_type)` within the same DB transaction, then inserts the new revision with `is_active = true` and `revision_number = MAX(prior) + 1`.
2. **Only the latest revision** may have `is_active = true` at any time per `(company_id, doc_type)`.
3. **Historical revisions are immutable** — no UPDATE of `gcs_path`, `file_name`, `content_type`, `size_bytes`, or `revision_number` on any row where `is_active = false`.
4. **Status and expiry** (`status`, `expiry_date`, `notes`) are the only fields patchable on active revisions.
5. **No hard delete** — physical GCS objects are never deleted via this module.

---

## 6. Approval Workflow

### 6.1 Scope for this baseline
**Approval workflow for legal/tax field changes is Phase 2 — out of scope for this baseline.**

No `company_change_approvals` table is created in Phase 1.

### 6.2 Governance bridge (Phase 1 only)
All changes to `company_legal_tax` are:
- Logged with `action = 'legal_change'` in `company_audit_log` (captures old + new value per field)
- Restricted to Superuser and Accounts Head roles
- Changes take effect immediately in Phase 1 (no pending state)

The audit log serves as the manual approval trail until the approval workflow is implemented in Phase 2.

---

## 7. Branding Asset Upload Governance

Logo, Authorized Signature, and Company Seal are uploaded to GCS and stored as paths in `company_master`.

| Field | `logo_gcs_path` | `signature_gcs_path` | `seal_gcs_path` |
|---|---|---|---|
| GCS path pattern | `TPEL/COMPANY/{Code}/BRANDING/logo/{filename}` | `TPEL/COMPANY/{Code}/BRANDING/signature/{filename}` | `TPEL/COMPANY/{Code}/BRANDING/seal/{filename}` |
| Allowed MIME | `image/jpeg`, `image/png`, `image/webp` | `image/jpeg`, `image/png`, `image/webp` | `image/jpeg`, `image/png`, `image/webp` |
| Max size | 2 MB | 2 MB | 2 MB |
| Image only restriction | Enforced server-side (MIME check + magic-byte check) | Same | Same |
| Dimension validation | Max 1000×1000 px (server-side via sharp or native) — Phase 2 | Same | Same |
| Replace lifecycle | Uploading a new file overwrites the GCS path stored in `company_master`; prior file remains in GCS as orphan until future GCS retention job |

**Dimension validation is Phase 2.** In Phase 1, only MIME and size are enforced.

---

## 8. API Routes

All routes under `/api/company`. Auth: `ensureAuthenticated` on all.

### 8.1 Route Table

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/company` | All authenticated | List all companies (id, code, short_name, is_active) |
| GET | `/api/company/active` | All authenticated | Get active company full payload |
| GET | `/api/company/:id` | All authenticated | Get one company full payload |
| POST | `/api/company` | Superuser | Create new company |
| PATCH | `/api/company/:id/general` | Superuser | Update general fields |
| PATCH | `/api/company/:id/legal-tax` | Superuser, Accounts Head | Update legal/tax fields |
| PATCH | `/api/company/:id/address/:type` | Superuser | Upsert one address by type |
| POST | `/api/company/:id/bank-accounts` | Superuser, Accounts Head | Add bank account |
| PATCH | `/api/company/:id/bank-accounts/:bankId` | Superuser, Accounts Head | Update bank account |
| DELETE | `/api/company/:id/bank-accounts/:bankId` | Superuser | Soft-delete (is_active=false) |
| PATCH | `/api/company/:id/erp-config` | Superuser | Update ERP config |
| PATCH | `/api/company/:id/branding` | Superuser | Update branding text fields |
| POST | `/api/company/:id/branding/logo` | Superuser | Upload logo (multer + GCS) |
| POST | `/api/company/:id/branding/signature` | Superuser | Upload signature |
| POST | `/api/company/:id/branding/seal` | Superuser | Upload seal |
| POST | `/api/company/:id/documents/:docType` | Superuser | Upload document revision |
| GET | `/api/company/:id/documents` | All authenticated | Latest active revision per doc type |
| GET | `/api/company/:id/documents/:docType/history` | Superuser | Full revision history |
| GET | `/api/company/doc/:docId/download` | Superuser | Signed download URL (attachment) |
| GET | `/api/company/doc/:docId/view` | All authenticated | Signed view URL (inline) |
| PATCH | `/api/company/doc/:docId/status` | Superuser, Accounts Head | Update status / expiry |
| PATCH | `/api/company/:id/activate` | Superuser | Set as active company (atomic swap) |
| GET | `/api/company/:id/audit-log` | Superuser | Paginated audit log |

### 8.2 Standardized Error Payload

All error responses use this structure:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable description",
  "fields": {
    "gstin": "GSTIN checksum invalid",
    "pan": "PAN format invalid"
  }
}
```

- `error`: machine-readable code (e.g. `VALIDATION_ERROR`, `ROLE_FORBIDDEN`, `CONCURRENT_UPDATE`, `NOT_FOUND`, `CONFLICT`)
- `message`: human-readable summary
- `fields`: field-level errors (present only for validation failures)

### 8.3 Role Failure Response

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

## 9. Role Matrix

| Action | Superuser | Accounts Head | HR Head | GM / SM / Employee |
|---|---|---|---|---|
| View all tabs | ✅ | ✅ | Legal & Tax read-only | General tab only |
| Edit General | ✅ | ❌ | ❌ | ❌ |
| Edit Legal & Tax | ✅ | ✅ | ❌ | ❌ |
| Edit Address | ✅ | ❌ | ❌ | ❌ |
| Edit Banking | ✅ | ✅ | ❌ | ❌ |
| Edit ERP Config | ✅ | ❌ | ❌ | ❌ |
| Edit Branding | ✅ | ❌ | ❌ | ❌ |
| Upload Branding Assets | ✅ | ❌ | ❌ | ❌ |
| Upload Documents | ✅ | ❌ | ❌ | ❌ |
| Update Doc Status | ✅ | ✅ | ❌ | ❌ |
| Activate Company | ✅ | ❌ | ❌ | ❌ |
| View Audit Log | ✅ | ❌ | ❌ | ❌ |

---

## 10. Validation Rules

### PAN
- Format: `[A-Z]{5}[0-9]{4}[A-Z]` (10 chars, regex enforced server-side)

### GSTIN
- Format: `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]` (15 chars)
- State code (chars 1–2) must match stored `gst_state_code`
- Embedded PAN (chars 3–12) must match stored `pan`
- Luhn mod-36 checksum enforced server-side

### IEC
- Format: `[0-9]{10}` (10 digits)

### IFSC
- Format: `[A-Z]{4}0[A-Z0-9]{6}` (11 chars, 5th char always `0`)

### CIN
- Format: `[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}` (21 chars)

### TAN
- Format: `[A-Z]{4}[0-9]{5}[A-Z]` (10 chars)

### Duplicate bank account
- `UNIQUE(company_id, account_number)` enforced at DB level
- Application returns `CONFLICT` error before DB unique violation when possible

---

## 11. Concurrency Protection (Optimistic Locking)

Every mutable table carries a `version INTEGER NOT NULL DEFAULT 1` column.

**Write protocol:**
1. Client reads record; receives current `version`.
2. Client sends PATCH with `{ ..., version: N }`.
3. Server issues: `UPDATE ... SET version = N+1 WHERE id = :id AND version = :N`
4. If 0 rows updated → respond `409 CONCURRENT_UPDATE` with message "Record was modified by another user. Please refresh and retry."
5. On success → return updated record with new `version`.

Tables covered: `company_master`, `company_legal_tax`, `company_addresses`, `company_bank_accounts`, `company_erp_config`, `company_branding`.

`company_documents` and `company_audit_log` are append-only — no version column required.

---

## 12. Transaction Governance

**Rule:** All POST and PATCH routes must wrap business update + audit log insert in a single DB transaction. Both commits atomically or both roll back.

```typescript
// Pattern
await db.transaction(async (tx) => {
  await tx.update(companyMaster).set({ ... }).where(eq(companyMaster.id, id));
  await tx.insert(companyAuditLog).values({ ... });
});
```

This applies to:
- All PATCH routes on any sub-table
- Document upload (deactivate prior revisions + insert new revision + audit)
- Company activation (atomic swap of is_active + audit)
- Branding asset upload (update gcs_path in company_master + audit)

---

## 13. Cache Governance

The `GET /api/company/active` endpoint may introduce a short-lived in-process cache in Phase 2.

**Phase 1 rule:** No caching. Every request hits the DB directly.

**Phase 2 rule (future):** If a cache is added, invalidation is mandatory on every PATCH/POST/DELETE to any company sub-table. Cache key: `company:active`. TTL ≤ 5 minutes. Stale-while-revalidate is prohibited for write-sensitive data (legal name, GSTIN, address).

---

## 14. GCS Path Governance

### 14.1 Normalization Rules

All path segments must conform to:

| Rule | Detail |
|---|---|
| Folder segments | All lowercase. No spaces. Hyphens permitted for labels; underscores for doc type discriminators. |
| Doc type segment | UPPER_SNAKE_CASE (matches `doc_type` controlled vocabulary, e.g. `GST_CERTIFICATE`) |
| Revision segment | `rev-NN` where `NN` = zero-padded 2-digit integer (01, 02 … 99) |
| Sequence segment | `NNN` = zero-padded 3-digit integer (001) |
| Label segment | kebab-case derived from doc type (e.g. `gst-certificate`, `pan-card`) |
| Extension | Lowercase, normalized from MIME: `application/pdf` → `pdf`, `image/jpeg` → `jpg`, `image/png` → `png`, `image/webp` → `webp` |

### 14.2 Document Path

```
TPEL/COMPANY/{CompanyCode}/{DocType}/rev-{RevNo}/{Seq}-{Label}.{Ext}
```

Example: `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf`

### 14.3 Branding Asset Paths

```
TPEL/COMPANY/{CompanyCode}/BRANDING/logo/{filename}
TPEL/COMPANY/{CompanyCode}/BRANDING/signature/{filename}
TPEL/COMPANY/{CompanyCode}/BRANDING/seal/{filename}
```

### 14.4 Path Generation

Paths are always computed server-side. Clients never supply raw GCS paths. All path generation is deterministic: same inputs → same path.

---

## 15. GCS Governance Mapping

Module key: `company` · Submodule key: `compliance` · Root prefix: `TPEL/COMPANY`  
Revision mode: `numeric` · Max file size: 20 MB (documents), 2 MB (branding assets)  
Allowed MIME (documents): `application/pdf`, `image/jpeg`, `image/png`, `image/webp`  
Allowed MIME (branding assets): `image/jpeg`, `image/png`, `image/webp`

**9 document governance rules to be seeded:**

| Doc Type | Mandatory |
|---|---|
| `GST_CERTIFICATE` | Yes |
| `PAN_CARD` | Yes |
| `CANCELLED_CHEQUE` | Yes |
| `INCORPORATION_CERTIFICATE` | Yes |
| `IEC_CERTIFICATE` | No |
| `LUT_COPY` | No |
| `MSME_CERTIFICATE` | No |
| `FACTORY_LICENSE` | No |
| `PF_ESI_DOCUMENT` | No |

**3 branding asset governance rules to be seeded:** `COMPANY_LOGO`, `COMPANY_SIGNATURE`, `COMPANY_SEAL`

---

## 16. Seed Governance

Rules for the initial data seed:

1. **Idempotent:** The seed function checks `SELECT COUNT(*) FROM company_master` before inserting. If any record exists, the seed is skipped entirely — it never updates or overwrites existing records.
2. **Only when no company exists:** The seed runs once, at server startup, only when the table is empty.
3. **Never overwrite admin-edited records:** After the initial seed, all updates must go through the authenticated PATCH API. The seed function has no upsert/update path.

Seed record (known confirmed values):

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
```

Registered office address seeded from confirmed value:
```
address_type:  registered_office
address_line1: L 4, 405 The Summit Business Bay
address_line2: Vile Parle (East), W E Highway
city:          Mumbai
state:         Maharashtra
country:       India
pin_code:      400057
```

All other sub-tables (legal_tax, bank_accounts, erp_config, branding, documents) seeded as empty — must be populated by admin through the UI.

---

## 17. Audit Governance

| Policy | Rule |
|---|---|
| Retention | Permanent — no time-based purge, no archival delete |
| Cascade delete | `company_audit_log` has NO cascade delete. Foreign key `company_id` uses `RESTRICT` not `CASCADE` — a company cannot be deleted if audit records exist |
| Immutability | No application route shall ever issue `UPDATE` or `DELETE` on `company_audit_log`. The Drizzle model for this table exposes insert only |
| Append-only enforcement | Server-side: the Drizzle schema for `company_audit_log` exposes no update or delete operations. The route layer never calls `.update()` or `.delete()` on this table |

---

## 18. UI Governance

| Behaviour | Rule |
|---|---|
| Unsaved changes warning | Each tab tracks a `isDirty` state (React state). Navigating away from a dirty tab shows a browser-native `beforeunload` + custom modal warning |
| Dirty-state tracking | Form `isDirty` derived from `react-hook-form`'s `formState.isDirty`. Reset on successful save |
| Tab-level save | Each tab has its own Save button. Saving one tab does not affect other tabs |
| Cancel / Revert | Cancel button resets the form to last-fetched server state via `form.reset(serverData)`. Does not navigate away |
| Optimistic lock error | On 409 CONCURRENT_UPDATE, show a toast: "This record was updated by another user. Your changes have been discarded — the latest version is shown." Then reload from server |

---

## 19. Cross-Module Dependency Map (Hardcoded → Future Migration)

The following callsites are **confirmed hardcoded** and are **identified for Phase 2 replacement**. Not in scope for this baseline.

| File | Line(s) | Hardcoded Value | Target Field |
|---|---|---|---|
| `server/salary-slip-generator.ts` | 167, 519, 532 | `"THERMOPAC PROCESS ENGINEERING LLP"`, address | `company_master.legal_name`, `company_addresses.registered_office` |
| `server/offer-pdf-generator.ts` | 741 | Company name + address footer | `company_master.legal_name`, registered office address |
| `server/services/document-path-resolver.ts` | 197 | `COMPANY: 'TPEL'` | `company_master.company_code` |
| `server/advance-tax-routes.ts` | 91 | `companyName = 'TPEL'` | `company_master.company_code` |
| `client/src/components/buy-datasheet-dialog.tsx` | 69, 143 | `"THERMOPAC PROCESS ENGINEERING LLP"` | `company_master.legal_name` |

---

## 20. Migration Plan

### Phase 1 (this baseline — approved scope)
1. Create 9 DB tables via Drizzle schema additions to `shared/schema.ts`
2. `drizzle-kit push:pg` to apply schema
3. Create `server/company-routes.ts` with all 22 API routes
4. Register route in `server/routes.ts` at `/api/company`
5. Seed governance rules (12 rules: 9 documents + 3 branding) in `gcs-governance-service.ts`
6. Seed initial THERMOPAC company record (idempotent, only if table empty)
7. Create `client/src/pages/company-information-page.tsx` (8 tabs)
8. Register page in `client/src/App.tsx` at `/administration/company-information`
9. Add nav entry in `client/src/components/layout.tsx` under Administration

### Phase 2 (future — NOT in scope)
- Replace 5 hardcoded callsites with `getActiveCompany()` helper
- Add in-process cache with mandatory invalidation
- Approval workflow for legal/tax changes
- Multi-company nav switcher
- Dimension validation for branding assets
- GCS retention cleanup for orphaned branding asset files

---

## 21. Lifecycle Validation Checklist

Before marking Phase 1 complete, all of the following must pass:

| # | Test | Expected |
|---|---|---|
| 1 | `POST /api/company` → create new | 201, record in DB |
| 2 | `GET /api/company/active` → returns full payload | 200, all sub-records populated |
| 3 | `PATCH /api/company/:id/legal-tax` with invalid GSTIN | 400, `VALIDATION_ERROR`, `fields.gstin` present |
| 4 | `POST /api/company/:id/documents/GST_CERTIFICATE` (valid PDF) | 201, GCS object at `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf` |
| 5 | Upload second revision of same doc type | Prior revision `is_active=false`; new revision `is_active=true`, `revision_number=2` |
| 6 | `GET /api/company/doc/:docId/download` | Returns signed GCS URL |
| 7 | `GET /api/company/:id/audit-log` | Shows `field_change` entries for every PATCH field |
| 8 | Non-Superuser PATCH to general | 403, `ROLE_FORBIDDEN` |
| 9 | Accounts Head PATCH to legal-tax | 200, audit logged |
| 10 | PATCH with stale `version` (concurrent update) | 409, `CONCURRENT_UPDATE` |
| 11 | `POST /api/company/:id/bank-accounts` with duplicate `account_number` | 409, `CONFLICT` |
| 12 | `DELETE /api/company/:id/bank-accounts/:bankId` | `is_active=false` in DB; record not physically deleted |
| 13 | Direct `UPDATE company_audit_log` via app route | No such route exists; 404 |
| 14 | Branding asset upload with non-image MIME | 400, `VALIDATION_ERROR` |
| 15 | Branding asset upload exceeding 2 MB | 400, `VALIDATION_ERROR` |
| 16 | `PATCH /api/company/:id/activate` when it is the only active company and is_active set to false | 409, cannot deactivate sole active company |
| 17 | `PATCH /api/company/:id/activate` on inactive company | Sets it active, sets all others inactive atomically; audit logged |

---

## 22. Approval Readiness Summary

| Section | Status |
|---|---|
| Scope and exclusions | ✅ Explicit |
| Table count | ✅ 9 tables (8 business + 1 audit) |
| One-to-one constraints | ✅ UNIQUE(company_id) on legal_tax, erp_config, branding |
| Active company governance | ✅ Single active globally — atomic swap |
| Document revision lifecycle | ✅ Immutable history, automatic prior deactivation |
| Approval workflow | ✅ Phase 2 out-of-scope — documented |
| Branding upload governance | ✅ MIME, size, replace lifecycle defined |
| DB indexes | ✅ All indexes listed per table |
| Transaction governance | ✅ Atomic commit of business update + audit |
| Cache governance | ✅ No cache Phase 1; invalidation rule for Phase 2 |
| GCS path normalization | ✅ All rules explicit |
| Seed governance | ✅ Idempotent, skip-if-exists, no overwrite |
| Concurrency protection | ✅ Optimistic locking via `version` column |
| UI governance | ✅ Dirty state, unsaved warning, tab-level save |
| Export compliance fields | ✅ AD Code, Authorized Dealer Bank, IEC Branch, LUT FY added |
| Audit governance | ✅ Permanent, no cascade, append-only |
| Error payload standard | ✅ Defined with machine-readable codes |
| Lifecycle validation | ✅ 17 test cases covering all scenarios |
