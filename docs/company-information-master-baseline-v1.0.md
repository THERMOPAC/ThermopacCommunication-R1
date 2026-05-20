# Company Information Master — Baseline v1.0

**Status:** DRAFT — awaiting approval  
**Date:** 2026-05-20  
**Protocol:** `docs/operating-protocol-v1.0.md` — no implementation until this doc is approved.

---

## 1. Objective

Provide a single DB-backed source of truth for all THERMOPAC company data consumed by ERP modules. Replace hardcoded strings scattered across server and client code with dynamic reads from `company_master` and related tables.

---

## 2. Scope

### 2.1 In Scope

| Area | What changes |
|---|---|
| DB | New tables: `company_master`, `company_addresses`, `company_bank_accounts`, `company_documents`, `company_audit_log` |
| API | CRUD routes under `/api/company` (Superuser / Accounts Head only for write) |
| UI | New page `/administration/company-information` with 8 tabs |
| Governance seed | 9 GCS governance rules for company document uploads |
| Hardcoded migration | 5 confirmed callsites replaced (see §8) |

### 2.2 Explicitly Out of Scope (this baseline)

- Removal of `thermopac_storage` bucket name from utility files — governed by GCS ops, not this module
- Multi-company switcher UI in the nav bar — Phase 2 only
- SAP B1 Company DB selection — remains env-var `SAP_COMPANY_DB` (SAP governance boundary)
- Automatic cross-module propagation — modules read from API on demand; no event bus
- Mobile / responsive redesign — desktop layout only

---

## 3. DB Schema

### 3.1 `company_master`

```sql
company_master (
  id                  SERIAL PRIMARY KEY,
  company_code        VARCHAR(10)  NOT NULL UNIQUE,   -- e.g. TPEL
  short_name          VARCHAR(30)  NOT NULL,            -- THERMOPAC
  legal_name          VARCHAR(120) NOT NULL,            -- THERMOPAC PROCESS ENGINEERING LLP
  display_name        VARCHAR(120) NOT NULL,
  company_type        VARCHAR(40),                      -- LLP, Pvt Ltd, Public Ltd …
  industry            VARCHAR(80),
  fy_start_month      SMALLINT     NOT NULL DEFAULT 4,  -- April = 4
  base_currency       VARCHAR(3)   NOT NULL DEFAULT 'INR',
  timezone            VARCHAR(60)  NOT NULL DEFAULT 'Asia/Kolkata',
  logo_gcs_path       TEXT,
  signature_gcs_path  TEXT,
  seal_gcs_path       TEXT,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  created_by          INTEGER REFERENCES users(id),
  created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP    NOT NULL DEFAULT NOW()
)
```

### 3.2 `company_legal_tax`

One-to-one with `company_master`. Separate table to isolate sensitive fields with stricter role guard.

```sql
company_legal_tax (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES company_master(id),
  cin                   VARCHAR(21),
  pan                   VARCHAR(10),
  gstin                 VARCHAR(15),
  iec_code              VARCHAR(10),
  lut_number            VARCHAR(40),
  lut_validity_date     DATE,
  msme_udyam            VARCHAR(20),
  tan                   VARCHAR(10),
  pf_number             VARCHAR(20),
  esi_number            VARCHAR(17),
  gst_registration_type VARCHAR(40),   -- Regular, Composition, SEZ, etc.
  gst_state_code        VARCHAR(3),
  export_without_gst    BOOLEAN NOT NULL DEFAULT false,
  updated_by            INTEGER REFERENCES users(id),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
)
```

### 3.3 `company_addresses`

Multiple addresses per company (one row per address type).

```sql
company_addresses (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES company_master(id),
  address_type  VARCHAR(30) NOT NULL,  -- registered_office | corporate_office | factory | dispatch | billing
  address_line1 TEXT,
  address_line2 TEXT,
  city          VARCHAR(60),
  district      VARCHAR(60),
  state         VARCHAR(60),
  country       VARCHAR(60) NOT NULL DEFAULT 'India',
  pin_code      VARCHAR(10),
  geo_lat       NUMERIC(10,6),
  geo_lng       NUMERIC(10,6),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  updated_by    INTEGER REFERENCES users(id),
  updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, address_type)
)
```

**Address types (controlled vocabulary):** `registered_office`, `corporate_office`, `factory`, `dispatch`, `billing`

### 3.4 `company_bank_accounts`

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
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, account_number)
)
```

### 3.5 `company_erp_config`

```sql
company_erp_config (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES company_master(id),
  sap_company_db        VARCHAR(60),
  sap_branch_code       VARCHAR(20),
  default_warehouse     VARCHAR(40),
  default_cost_center   VARCHAR(40),
  default_payment_terms VARCHAR(80),
  default_delivery_terms VARCHAR(80),
  base_uom              VARCHAR(20),
  decimal_precision     SMALLINT NOT NULL DEFAULT 2,
  updated_by            INTEGER REFERENCES users(id),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
)
```

### 3.6 `company_branding`

```sql
company_branding (
  id                  SERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES company_master(id),
  default_letterhead  TEXT,
  footer_text         TEXT,
  terms_conditions    TEXT,
  rfq_footer          TEXT,
  offer_footer        TEXT,
  purchase_footer     TEXT,
  report_watermark    TEXT,
  updated_by          INTEGER REFERENCES users(id),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
)
```

### 3.7 `company_documents`

GCS-governed uploads — immutable revision chain.

```sql
company_documents (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES company_master(id),
  doc_type        VARCHAR(40) NOT NULL,   -- GST_CERTIFICATE | PAN_CARD | IEC_CERTIFICATE | LUT_COPY | MSME_CERTIFICATE | CANCELLED_CHEQUE | INCORPORATION_CERTIFICATE | FACTORY_LICENSE | PF_ESI_DOCUMENT
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
```

### 3.8 `company_audit_log`

Immutable — no UPDATE or DELETE ever issued against this table.

```sql
company_audit_log (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES company_master(id),
  action      VARCHAR(40) NOT NULL,  -- field_change | doc_upload | doc_replace | status_change | create | legal_change
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
```

---

## 4. API Routes

All routes under `/api/company`. Auth: `ensureAuthenticated` on all.

| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/company` | All authenticated | List all companies (code, short_name, is_active) |
| GET | `/api/company/active` | All authenticated | Get active company master (full payload, all tabs) |
| GET | `/api/company/:id` | All authenticated | Get one company full payload |
| POST | `/api/company` | Superuser only | Create new company |
| PATCH | `/api/company/:id/general` | Superuser | Update general fields |
| PATCH | `/api/company/:id/legal-tax` | Superuser, Accounts Head | Update legal/tax fields; requires mandatory approval flag check |
| PATCH | `/api/company/:id/address/:type` | Superuser | Upsert one address |
| POST | `/api/company/:id/bank-accounts` | Superuser, Accounts Head | Add bank account |
| PATCH | `/api/company/:id/bank-accounts/:bankId` | Superuser, Accounts Head | Update bank account |
| DELETE | `/api/company/:id/bank-accounts/:bankId` | Superuser | Soft-delete bank account (set is_active=false) |
| PATCH | `/api/company/:id/erp-config` | Superuser | Update ERP config |
| PATCH | `/api/company/:id/branding` | Superuser | Update branding |
| POST | `/api/company/:id/documents/:docType` | Superuser | Upload new document revision (multer + GCS) |
| GET | `/api/company/:id/documents` | All authenticated | List latest active revision per doc type |
| GET | `/api/company/:id/documents/:docType/history` | Superuser | Full revision history |
| GET | `/api/company/doc/:docId/download` | Superuser | Signed download URL |
| GET | `/api/company/doc/:docId/view` | All authenticated | Signed view URL (inline) |
| PATCH | `/api/company/doc/:docId/status` | Superuser, Accounts Head | Update status / expiry |
| GET | `/api/company/:id/audit-log` | Superuser | Paginated audit log |

---

## 5. Role Matrix

| Action | Superuser | General Manager | Accounts Head | HR Head | Senior Manager | Employee |
|---|---|---|---|---|---|---|
| View all tabs | ✅ | ✅ | ✅ | Legal & Tax (read) | Read only | ❌ |
| Edit General | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Legal & Tax | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit Address | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Banking | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Edit ERP Config | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit Branding | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Upload Documents | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 6. Validation Rules

### PAN
- Format: `[A-Z]{5}[0-9]{4}[A-Z]` (10 chars)
- Computed server-side only

### GSTIN
- Format: `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]` (15 chars)
- State code (first 2 digits) must match `gst_state_code`
- PAN embedded (chars 3–12) must match stored PAN
- Checksum: Luhn mod-36 (server-side implementation)

### IEC
- Format: `[0-9]{10}` (10 digits)

### IFSC
- Format: `[A-Z]{4}0[A-Z0-9]{6}` (11 chars, 5th char always 0)

### CIN
- Format: `[A-Z][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}` (21 chars)

### Duplicate prevention
- `account_number` must be unique per company (UNIQUE constraint)
- GSTIN uniqueness across `company_master` — enforced in application layer (not DB UNIQUE — allows future multi-entity)

---

## 7. Audit Strategy

### What is logged
Every PATCH/POST to any company sub-table writes one row to `company_audit_log` per changed field:
- `action = 'field_change'` for scalar field updates
- `action = 'legal_change'` for any field in `company_legal_tax`
- `action = 'doc_upload'` or `'doc_replace'` for document uploads
- `action = 'create'` for new company creation

### What is NOT logged
- GET requests
- Read-only field views

### Immutability
No route shall ever issue `UPDATE` or `DELETE` on `company_audit_log`. No cascade delete to this table.

---

## 8. GCS Governance Mapping

All company documents stored under `TPEL/COMPANY/{CompanyCode}/{DocType}/rev-{RevNo}/{Seq}-{Label}.{Ext}`

Root prefix: `TPEL/COMPANY`  
Module key: `company`  
Submodule key: `compliance`  
Revision mode: `numeric`  
Max file size: 20 MB  
Allowed MIME: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`

9 governance rules to be seeded (one per document type):

| Doc Type | Label | Mandatory |
|---|---|---|
| `GST_CERTIFICATE` | GST Certificate | Yes |
| `PAN_CARD` | PAN Card | Yes |
| `IEC_CERTIFICATE` | IEC Certificate | No |
| `LUT_COPY` | LUT Copy | No |
| `MSME_CERTIFICATE` | MSME Certificate | No |
| `CANCELLED_CHEQUE` | Cancelled Cheque | Yes |
| `INCORPORATION_CERTIFICATE` | Incorporation Certificate | Yes |
| `FACTORY_LICENSE` | Factory License | No |
| `PF_ESI_DOCUMENT` | PF / ESI Documents | No |

Logo / Signature / Seal uploads use `TPEL/COMPANY/{CompanyCode}/BRANDING/{AssetType}/{filename}` — stored in `company_master.logo_gcs_path`, `signature_gcs_path`, `seal_gcs_path`.

---

## 9. Cross-Module Dependency Map (Hardcoded → Dynamic Migration)

The following callsites are confirmed hardcoded and are eligible for Phase 2 migration (NOT in scope for this baseline — listed for reference only):

| File | Line(s) | Hardcoded Value | Target Field |
|---|---|---|---|
| `server/salary-slip-generator.ts` | 167, 519, 532 | `"THERMOPAC PROCESS ENGINEERING LLP"`, address | `company_master.legal_name`, registered office address |
| `server/offer-pdf-generator.ts` | 741 | Company name + address footer | `company_master.legal_name`, registered office address |
| `server/services/document-path-resolver.ts` | 197 | `COMPANY: 'TPEL'` | `company_master.company_code` |
| `server/advance-tax-routes.ts` | 91 | `companyName = 'TPEL'` | `company_master.company_code` |
| `client/src/components/buy-datasheet-dialog.tsx` | 69, 143 | `"THERMOPAC PROCESS ENGINEERING LLP"` | `company_master.legal_name` |

**Phase 2 (future, not this baseline):** Each callsite replaced with `await getActiveCompany()` helper that reads from `company_master` with a 5-minute in-process cache.

---

## 10. Migration Plan

### Phase 1 (this baseline)
- Create DB tables (5 new tables + audit log)
- Create server routes (`server/company-routes.ts`)
- Create UI page (`client/src/pages/company-information-page.tsx`)
- Register route in App.tsx under `/administration/company-information`
- Seed governance rules in `gcs-governance-service.ts`
- Seed initial THERMOPAC company record from known values (idempotent)

### Phase 2 (future — NOT in scope)
- Replace hardcoded callsites (§9) with dynamic reads
- Add `GET /api/company/active/public` (unauthenticated, returns only company_code, legal_name, address, logo_url) for PDF generation
- Multi-company switcher in nav

---

## 11. UI Layout

**Route:** `/administration/company-information`  
**Nav:** Administration → Company Information  
**Layout:** Left panel (company list, narrow) + Right workspace (tab panel)

Tabs:
1. General
2. Legal & Tax
3. Address
4. Banking
5. ERP Configuration
6. Branding
7. Documents
8. Audit Log

---

## 12. Seed Record

On first start, if no `company_master` row exists, seed one idempotent record:

```
company_code:  TPEL
short_name:    THERMOPAC
legal_name:    THERMOPAC PROCESS ENGINEERING LLP
display_name:  THERMOPAC Process Engineering LLP
fy_start_month: 4
base_currency: INR
timezone:      Asia/Kolkata
```

Addresses seeded from confirmed values:
```
registered_office: L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai 400 057
```

Legal/Tax, Banking, ERP Config — seeded empty; must be filled by admin.

---

## 13. Lifecycle Validation Evidence

Before marking Phase 1 complete, the following must pass:

1. `POST /api/company` → 201, record in DB
2. `GET /api/company/active` → returns full payload with all sub-records
3. `PATCH /api/company/:id/legal-tax` with invalid GSTIN → 400 with checksum error
4. `POST /api/company/:id/documents/GST_CERTIFICATE` (PDF) → GCS object created at `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf`
5. `GET /api/company/doc/:docId/download` → signed URL
6. `GET /api/company/:id/audit-log` → shows field_change entries for PATCH
7. Non-Superuser PATCH to general → 403
8. Accounts Head PATCH to legal-tax → 200

---

## 14. Exclusions Restated

- No multi-company switcher in nav (Phase 2)
- No auto-propagation to existing modules (Phase 2)
- No SAP B1 company DB change via this UI (env-var boundary preserved)
- No deletion of any company record (soft-deactivation only via `is_active = false`)
- No changes to existing vendor compliance, GCS path templates, or module-level document upload flows
