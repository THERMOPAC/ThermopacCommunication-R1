# Company Information Master — Phase 2 Planning Baseline

**Status**: PLANNING BASELINE — DO NOT IMPLEMENT
**Created**: 2026-05-20
**Phase 1 Closure Reference**: `docs/company-information-master-phase1-closure.md`
**Phase 1 Baseline Reference**: `docs/company-information-master-baseline-v1.md`

This document is the authoritative planning baseline for Phase 2 of the Company Information
Master module. No implementation work may begin until this baseline is reviewed, approved,
and a separate implementation session is opened.

---

## 0. Phase 2 Objectives

Phase 1 delivered a fully governed company data store.
Phase 2 promotes stored company data into active use across the ERP:

1. Replace all hardcoded callsites with live DB reads
2. Enable a multi-company architecture with session-level switcher
3. Enforce maker-checker approval for sensitive legal/tax/banking changes
4. Propagate company change events to PDF generators, email templates, and SAP payloads
5. Introduce a cache layer to protect the DB from company-record stampedes
6. Govern branding image dimensions and quality
7. Automate GCS orphan cleanup for superseded branding assets
8. Route SAP integration calls by company context
9. Push live company data changes to open browser sessions
10. Trigger notifications on document expiry and approval events

---

## 1. Hardcoded Callsite Migration

### 1.1 Confirmed Callsite Inventory

All callsites were verified against the live codebase on 2026-05-20.

#### CS-01 — `server/salary-slip-generator.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 159 | `'client/public/images/thermopac-logo.jpg'` (file path) | `company_master.logo_gcs_path` → signed URL at render time |
| 2 | 167 | `'THERMOPAC PROCESS ENGINEERING LLP'` (header) | `company_master.legal_name` |
| 3 | 519 | `'For THERMOPAC PROCESS ENGINEERING LLP'` (signatory) | `company_master.legal_name` |
| 4 | 532 | `'THERMOPAC  \|  L 4, 405 The Summit Business Bay, Vile Parle, Western Express Highway, Mumbai 400 057'` | `company_master.display_name` + `company_addresses[registered_office]` composite |
| 5 | 536 | `'Tel: +91 22 2617 8080-84  \|  Fax: +91 22 2617 8084  \|  Email: sales@thermopac.in'` | New field: `company_master.phone` / `company_master.email` (Phase 2 schema delta) |

**Migration risk**: HIGH — salary slips are legally binding documents. A rendering defect could produce slips with blank or wrong company identity.

**Fallback strategy**: If `company_master` read fails or returns null, generator falls back to compile-time constants (`COMPANY_FALLBACK` object defined in the generator). Never fails silently — throw a named error `COMPANY_DATA_UNAVAILABLE` and halt generation.

**Regression validation**:
- Generate a test salary slip before and after migration
- Assert PDF text contains `THERMOPAC PROCESS ENGINEERING LLP` (from DB, not constant)
- Assert logo renders (signed URL resolves within 15s)
- Assert no blank company header on DB timeout (fallback fires, error logged)

---

#### CS-02 — `server/offer-pdf-generator.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 55 | Company description paragraph (Thermopac background) | `company_branding.default_letterhead` or new `company_master.description` field |
| 2 | 62 | `forThermopac: 'For THERMOPAC'` | `company_master.display_name` |
| 3 | 105 | `Author: 'THERMOPAC'` (PDF metadata) | `company_master.short_name` |
| 4 | 143 | `'client/public/assets/thermopac-logo.jpg'` | `company_master.logo_gcs_path` → signed URL |
| 5 | 581 | `'…Ex-Works basis at our Mumbai factory…'` (T&C text) | `company_branding.terms_conditions` (already a Phase 1 field) |
| 6 | 629–637 | Multiple `'THERMOPAC'` references in commissioning T&C | `company_branding.terms_conditions` block substitution |
| 7 | 741 | `'THERMOPAC \| L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057'` | `company_master.display_name` + `company_addresses[registered_office]` composite |
| 8 | 742 | `'Tel: +91 22 2617 8080 to 84 \| Fax: +91 22 2617 8084 \| E-Mail: sales@thermopac.in'` | New Phase 2 contact fields |

**Migration risk**: HIGH — customer-facing commercial document. Incorrect identity is a contractual risk.

**Fallback strategy**: Same `COMPANY_FALLBACK` pattern as CS-01. T&C text: if `company_branding.terms_conditions` is null, use in-code default T&C text (current hardcoded text promoted to a named constant).

**Regression validation**:
- Generate a test offer before and after migration
- Assert footer address composite matches `company_addresses[registered_office]`
- Assert logo renders and is visually correct
- Assert T&C section renders (not blank)

---

#### CS-03 — `server/services/document-path-resolver.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 197 | `COMPANY: 'TPEL'` | `company_master.company_code` |

**Migration risk**: MEDIUM — GCS paths contain the company code as a prefix segment. A wrong code would write files to an incorrect GCS path. Existing paths are immutable once written.

**Fallback strategy**: Cache `company_code` in module-level variable at server startup (eager load). If startup read fails, abort server boot with `FATAL: company_code unavailable`. Never default to an empty string.

**Regression validation**:
- Assert constructed GCS paths begin with `TPEL/` when company_code=TPEL
- Assert server refuses to start if company_master table is empty

---

#### CS-04 — `server/advance-tax-routes.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 91 | `companyName = 'TPEL'` | `company_master.company_code` or `company_master.short_name` |

**Migration risk**: LOW — used in advance tax computation context labels, not customer-facing output.

**Fallback strategy**: Default to `'TPEL'` constant if DB read fails; log warning.

**Regression validation**:
- Verify tax computation labels include correct company identifier
- Assert no regression in trial-balance or tax estimate outputs

---

#### CS-05 — `client/src/components/buy-datasheet-dialog.tsx`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 69 | `'THERMOPAC PROCESS ENGINEERING LLP'` (PDF header) | `company_master.legal_name` via `/api/company/active` |
| 2 | 143 | `'THERMOPAC Process Engineering LLP — THERMOPAC QMS'` (footer) | `company_master.legal_name` + `company_master.short_name` |

**Migration risk**: LOW — internal procurement document, not customer-facing.

**Fallback strategy**: Use React Query's `staleTime` so cached company data is used if the `/api/company/active` request is slow. Display placeholder if completely unavailable.

**Regression validation**:
- Render a buy-datasheet PDF and assert header/footer contain DB-sourced names
- Test with network failure: assert placeholder renders, not crash

---

#### CS-06 (additional) — `server/utils/pppc-services.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 997 | `company: 'THERMOPAC'` | `company_master.short_name` |

**Migration risk**: LOW — used in procurement payload labelling.

---

#### CS-07 (additional) — `server/utils/drawing-report-template.ts`

| # | Line | Hardcoded Value | Replacement Field |
|---|---|---|---|
| 1 | 209 | `'THERMOPAC — Drawing Verification Report'` | `company_master.display_name` + literal ` — Drawing Verification Report` |
| 2 | 331 | `'THERMOPAC ERP — Drawing Verification System v1.0'` | `company_master.short_name` |

**Migration risk**: LOW — internal QMS report.

---

### 1.2 Out-of-Scope Callsites (do not migrate in Phase 2)

| File | Value | Reason |
|---|---|---|
| `server/utils/gcs-storage.ts` | `THERMOPAC_INVENTORY`, `THERMOPAC_PROJECTS` | Legacy GCS root prefixes predating GCS Governance Rev 5. Governed separately by `docs/gcs-governance-rev5-option-c-baseline.md`. Not company_master fields. |
| `server/utils/storage-config.ts` | `thermopac_storage` (bucket name) | GCS bucket name is an infrastructure constant, not a company identity field. Governed by env var `GCS_BUCKET_NAME`. |
| `server/utils/qms-file-governance.ts` | `THERMOPAC_INVENTORY`, `THERMOPAC_PROJECTS` | Same as above — GCS path governance, not company identity. |
| `server/lead-generation-routes.ts` | `'ThermopacBot/1.0'` (User-Agent) | HTTP client identifier — infrastructure constant, not company identity field. |
| `server/sap-b1-integration/data-mapping.ts` | `conflictResolution: 'thermopac_wins'` | Enum value string — not company identity. |

---

### 1.3 Migration Sequence

```
Step 1: Implement getActiveCompany() server-side helper
        — single DB read, memoised per request lifecycle
        — used by all server-side callsites

Step 2: Implement useActiveCompany() React hook (client)
        — wraps /api/company/active with staleTime=5min
        — used by all client-side callsites

Step 3: Migrate LOW-risk callsites first (CS-04, CS-05, CS-06, CS-07)
        — non-customer-facing, easy rollback

Step 4: Migrate MEDIUM-risk callsite (CS-03 document-path-resolver)
        — require GCS path regression test suite before merge

Step 5: Migrate HIGH-risk callsites (CS-01, CS-02)
        — require full PDF regression test suite before merge
        — deploy with feature flag (FF_COMPANY_LIVE_PDF=false default)
        — toggle flag per environment; prod only after QA sign-off

Step 6: Remove all COMPANY_FALLBACK constants after 30-day stability window
```

---

## 2. Multi-Company Architecture

### 2.1 Design Goals

- One Replit environment may serve multiple company entities (e.g. subsidiaries, JVs)
- Each user is assigned one or more companies
- Active company is session-scoped and persists across page reloads
- Superuser can override to any company
- All DB reads and writes are company-scoped by default after Phase 2

### 2.2 Schema Delta

```sql
-- User-company assignment table
CREATE TABLE user_company_assignments (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id  INTEGER NOT NULL REFERENCES company_master(id) ON DELETE RESTRICT,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

CREATE UNIQUE INDEX idx_user_default_company
  ON user_company_assignments (user_id) WHERE is_default = true;

-- Session company context (stored in Express session, not DB)
-- req.session.activeCompanyId: number
```

### 2.3 Global Company Switcher — UI Design

- Displayed in the top navigation bar adjacent to user avatar
- Shows current active company `short_name` and logo thumbnail
- Dropdown lists all companies assigned to the user
- Superuser sees ALL companies (no assignment required)
- On switch: POST `/api/company/session/switch` → updates `req.session.activeCompanyId`
- After switch: React Query cache is fully invalidated (all keys), page reloads active views

### 2.4 Session-Level Active Company

```
Session shape:
  req.session.activeCompanyId: number   — set on login to user's default company
                                         — overridden on explicit switcher use

Login flow:
  1. Fetch user's default company from user_company_assignments WHERE is_default=true
  2. If none: use globally active company (company_master WHERE is_active=true)
  3. Set req.session.activeCompanyId

API middleware (new):
  companyContextMiddleware:
    - reads req.session.activeCompanyId
    - attaches full company row to req.activeCompany
    - rejects with 400 COMPANY_CONTEXT_MISSING if session has no company
```

### 2.5 Permission Isolation

| Permission | Rule |
|---|---|
| Read any company data | User must be assigned to that company |
| Write to a company | Superuser or role-appropriate assignment for that company |
| Switch company | User must be assigned to target company; Superuser unrestricted |
| View another company's audit log | Superuser only, regardless of assignment |
| Activate a different company globally | Superuser only |

### 2.6 Audit Segregation

- All write routes that currently take `company_id` from path continue to do so
- `company_audit_log` is already partitioned by `company_id`
- Audit log read route (`GET /api/company/:id/audit-log`) enforces company assignment check in Phase 2

---

## 3. Legal/Tax Approval Workflow (Maker-Checker)

### 3.1 Design Rationale

GSTIN, PAN, banking details, and legal name changes have direct impact on:
- GST filings and reverse-charge liability
- TDS/TCS deduction accounts
- Bank reconciliation and payment routing
- Offer and invoice legal identity

These fields require a two-person approval before the DB record is mutated.

### 3.2 Schema Delta

```sql
CREATE TABLE company_change_approvals (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER      NOT NULL REFERENCES company_master(id) ON DELETE RESTRICT,
  change_type     VARCHAR(40)  NOT NULL,  -- 'legal_name','gstin','pan','bank_account','iec_code'
  proposed_value  JSONB        NOT NULL,  -- full field set being changed (not just the diff)
  current_value   JSONB        NOT NULL,  -- snapshot of current values at time of submission
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
  -- status: pending | under_review | approved | rejected | cancelled
  submitted_by    INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  applied_at      TIMESTAMPTZ,  -- when approved change was written to live table
  cancelled_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at    TIMESTAMPTZ,
  version         INTEGER      NOT NULL DEFAULT 1
);

CREATE INDEX idx_cca_company_id ON company_change_approvals(company_id);
CREATE INDEX idx_cca_status     ON company_change_approvals(status);
CREATE INDEX idx_cca_submitted_at ON company_change_approvals(submitted_at);
```

### 3.3 Approval State Machine

```
[submitted_by != reviewer enforced]

  PENDING  ──── review ───►  UNDER_REVIEW
     │                            │
     │ cancel (submitter)         ├── approve (Superuser, not submitter) ──► APPROVED → apply to DB
     ▼                            │
  CANCELLED                       └── reject (Superuser, not submitter) ──► REJECTED
```

### 3.4 Fields Requiring Maker-Checker

| Field | Table | Risk Classification |
|---|---|---|
| `legal_name` | company_master | CRITICAL |
| `gstin` | company_legal_tax | CRITICAL |
| `pan` | company_legal_tax | CRITICAL |
| `iec_code` | company_legal_tax | HIGH |
| `lut_number` + `lut_validity_date` | company_legal_tax | HIGH |
| `ad_code` | company_legal_tax | HIGH |
| `account_number` | company_bank_accounts | CRITICAL |
| `ifsc` | company_bank_accounts | HIGH |
| `swift` | company_bank_accounts | HIGH |
| `bank_name` + `branch` | company_bank_accounts | MEDIUM |

All other fields (address, ERP config, branding text, display name) remain direct-write in Phase 1 behavior.

### 3.5 API Delta

```
POST   /api/company/:id/approvals           — submit a change for approval (Superuser|AccountsHead)
GET    /api/company/:id/approvals           — list approvals (Superuser|AccountsHead)
GET    /api/company/approvals/:approvalId   — single approval detail
PATCH  /api/company/approvals/:approvalId/approve  — approve and apply (Superuser, not submitter)
PATCH  /api/company/approvals/:approvalId/reject   — reject with notes (Superuser, not submitter)
PATCH  /api/company/approvals/:approvalId/cancel   — cancel pending (submitter only)
```

### 3.6 Immutable Audit Trail

- `company_change_approvals` rows are never updated after `approved` or `rejected`
- `applied_at` is set when the change is written to the live table inside a transaction
- `proposed_value` and `current_value` are JSONB snapshots — full field sets, not diffs
- `review_notes` are append-only (no edit after submit)

### 3.7 Rollback Governance

- An approved change cannot be undone via the approval system
- To reverse an approved change, the reversal must be submitted as a new approval request
- Audit log (`company_audit_log`) records both the approval application and any subsequent reversal

---

## 4. Event Propagation

### 4.1 Propagation Model

When company data changes (activated, legal_name updated, branding changed, address updated),
downstream modules must reflect the new state. Phase 2 uses a synchronous in-process event bus
(no external message broker required at this scale) with retry logic for async consumers.

```
EventBus (server-side, in-process):
  emitter: Node.js EventEmitter (wrapped)
  events:
    company.activated           payload: { companyId }
    company.general.updated     payload: { companyId, changedFields: string[] }
    company.legal.updated       payload: { companyId, changedFields: string[] }
    company.branding.updated    payload: { companyId, changedFields: string[] }
    company.address.updated     payload: { companyId, addressType: string }
    company.document.uploaded   payload: { companyId, docType, revision }
    company.document.expired    payload: { companyId, docType, expiryDate }
    company.approval.pending    payload: { companyId, approvalId, changeType }
    company.approval.resolved   payload: { companyId, approvalId, status: 'approved'|'rejected' }
```

### 4.2 Subscriber Map

| Event | Subscriber | Action |
|---|---|---|
| `company.general.updated` | PDF generator cache invalidator | Flush memoised company payload |
| `company.general.updated` | document-path-resolver | Reload cached `company_code` |
| `company.branding.updated` | Signed URL cache invalidator | Invalidate logo/signature/seal cached URLs |
| `company.legal.updated` | SAP payload generator | Flag next SAP sync to refresh company header |
| `company.activated` | All company-aware caches | Full cache flush |
| `company.document.expired` | Notification service | Send expiry alert |
| `company.approval.pending` | Notification service | Send review-requested alert |

### 4.3 Retry Behaviour

- Synchronous subscribers: exceptions are caught, logged to `company_audit_log`, and do not abort the originating HTTP request
- Async subscribers (notifications): retry up to 3 times with 5s backoff; failure logged but not retried further in Phase 2 (Phase 3 candidate: dead-letter queue)

### 4.4 Failure Isolation

- If a subscriber fails, the originating company data write is already committed
- Subscriber failures are observable via `company_audit_log` entries with `action='event_dispatch_failure'`
- No subscriber failure can roll back the primary data change

### 4.5 Eventual Consistency

- PDF generators: cached company payload TTL = 5 minutes; worst-case staleness = 5min after an event
- SAP sync: next scheduled sync picks up the updated company header; no real-time push
- UI: React Query `staleTime` on `/api/company/active` = 5 minutes; WebSocket invalidation signal (§9) reduces worst-case to ~1s for open sessions

---

## 5. Cache Layer

### 5.1 Cache Design

The active company record is read on every authenticated request by middleware. A DB read
per request is wasteful and creates a single point of failure.

```
Cache name:        active-company-cache
Implementation:    In-process Node.js Map (Phase 2); Redis-ready interface for Phase 3
Cache keys:
  'active_company'              → full CompanyPayload (master + all sub-records)
  'active_company_code'         → string (company_code only; used by path resolver at startup)
  'company_logo_signed_url'     → { url: string, expiresAt: number }
  'company_signature_signed_url'→ { url: string, expiresAt: number }
  'company_seal_signed_url'     → { url: string, expiresAt: number }
```

### 5.2 TTL Strategy

| Cache Key | TTL | Invalidation Trigger |
|---|---|---|
| `active_company` | 5 minutes | `company.activated`, `company.general.updated`, `company.legal.updated`, `company.address.updated` |
| `active_company_code` | Until server restart | Server startup eager load; invalidated only on `company.activated` |
| Signed URL caches | 14 minutes (1 min before GCS expiry) | `company.branding.updated`; automatic on TTL expiry |

### 5.3 Invalidation Strategy

```typescript
// Pseudo-code: cache invalidation on event
eventBus.on('company.activated',       () => cache.flush());
eventBus.on('company.general.updated', () => cache.delete('active_company'));
eventBus.on('company.branding.updated',() => {
  cache.delete('active_company');
  cache.delete('company_logo_signed_url');
  cache.delete('company_signature_signed_url');
  cache.delete('company_seal_signed_url');
});
```

### 5.4 Concurrency Handling

- Cache reads use a "stale-while-revalidate" pattern: serve stale value while a single background refresh is in flight
- Multiple simultaneous cache misses collapse into one DB read (request coalescing via a Promise lock)
- Cache writes are atomic (Map.set is synchronous in Node.js)

### 5.5 Stale-Read Prevention

- `company.activated` always triggers a full cache flush — no stale reads after an activation switch
- Signed URL cache TTL is 1 minute shorter than the actual GCS URL TTL — URLs served from cache are always valid
- Cache miss always falls back to a live DB read — no error propagation from cache layer

### 5.6 Distributed Cache Readiness

The cache interface is designed as a swappable adapter:
```typescript
interface CompanyCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
  flush(): Promise<void>;
}
// Phase 2: InMemoryCompanyCache implements CompanyCache
// Phase 3: RedisCompanyCache implements CompanyCache (drop-in swap)
```

---

## 6. Branding Image Validation

### 6.1 Dimension and Quality Rules

| Asset | Min Width | Min Height | Max Width | Max Height | Aspect Ratio | Max Size |
|---|---|---|---|---|---|---|
| Logo | 200px | 60px | 2000px | 600px | 2:1 to 6:1 | 2 MB |
| Signature | 200px | 60px | 1500px | 500px | 2:1 to 8:1 | 2 MB |
| Seal | 200px | 200px | 1000px | 1000px | 0.9:1 to 1.1:1 (near-square) | 2 MB |

### 6.2 Transparency Handling

- PNG and WEBP uploads may contain alpha channel — permitted
- JPEG uploads cannot contain alpha — enforced by MIME check (already Phase 1)
- Server does not strip alpha; transparency is preserved in GCS storage

### 6.3 Print-Quality Rule

- Minimum effective resolution for print: 150 DPI at A4 header strip width (~180mm ≈ 1063px at 150dpi)
- Enforcement: warn (not reject) if width < 600px; reject only if width < 200px

### 6.4 Validation Implementation

```typescript
// Phase 2 addition: sharp library for dimension inspection
// npm install sharp
import sharp from 'sharp';

async function validateBrandingDimensions(buffer: Buffer, assetType: 'logo'|'signature'|'seal') {
  const meta = await sharp(buffer).metadata();
  // apply rules from table above
  // return { valid: boolean, warnings: string[], errors: string[] }
}
// Called after magic-byte check, before GCS upload
```

### 6.5 Thumbnail Generation

- On successful branding upload, generate a 200×60px thumbnail (logo/signature) or 100×100px (seal)
- Thumbnail stored at `TPEL/COMPANY/{CompanyCode}/BRANDING/{AssetType}/thumb-{filename}`
- Thumbnail path stored in a new `*_thumb_gcs_path` column (Phase 2 schema delta)
- Thumbnail used in UI cards and email headers (avoid serving full-res images to UI)

### 6.6 Phase 2 Schema Delta

```sql
ALTER TABLE company_master
  ADD COLUMN logo_thumb_gcs_path      TEXT,
  ADD COLUMN signature_thumb_gcs_path TEXT,
  ADD COLUMN seal_thumb_gcs_path      TEXT;
```

---

## 7. Orphan GCS Cleanup

### 7.1 Orphan Definition

A GCS object under `TPEL/COMPANY/` is an orphan if:
- It is not referenced by `company_master.logo_gcs_path`, `.signature_gcs_path`, or `.seal_gcs_path`
- AND it is not referenced by any `company_documents.gcs_path` row

Orphans are created when a branding asset is replaced (old GCS object not deleted in Phase 1).

### 7.2 Retention Window

- Orphan objects are retained for **30 days** before eligible for deletion
- Retention window is measured from GCS object creation time (`timeCreated` metadata)
- Objects less than 30 days old are never deleted, even if unreferenced

### 7.3 Cleanup Scheduler

```
Trigger:      Nightly cron — 02:00 IST daily
Dry-run flag: COMPANY_ORPHAN_CLEANUP_DRY_RUN=true (default) — logs but does not delete
Delete flag:  COMPANY_ORPHAN_CLEANUP_DRY_RUN=false — enables actual deletion
Admin route:  POST /api/admin/company-orphans/run?dryRun=true|false (Superuser only)
```

### 7.4 Audit-Safe Deletion

- Before deletion: log to `company_audit_log` with `action='gcs_orphan_deleted'`, `old_value=gcs_path`, `new_value=null`
- After deletion: confirm GCS object no longer exists (HEAD request)
- On failure: log `action='gcs_orphan_delete_failed'`, retain object, retry next cycle

### 7.5 Rollback Protection

- Deleted objects cannot be recovered from GCS (no versioning enabled by default)
- Mitigation: 30-day retention window + dry-run mode mandatory for first 3 production cycles
- An admin must explicitly set `COMPANY_ORPHAN_CLEANUP_DRY_RUN=false` to enable live deletion

### 7.6 GCS Verification Steps

```
1. List all GCS objects under TPEL/COMPANY/ prefix
2. Build set of referenced paths from DB (all company_master + company_documents)
3. Compute: orphan_set = gcs_set − referenced_set
4. Filter orphan_set: retain if object age < 30 days
5. Log candidate list
6. If !dryRun: delete each, log result
7. Emit summary: { total, candidates, deleted, failed, skipped }
```

---

## 8. Multi-Company SAP Integration Routing

### 8.1 Design Principle

SAP B1 Service Layer connections are authenticated per SAP company database (`sap_company_db`).
When multiple companies are configured in Phase 2, each company's SAP calls must route to its
own SAP company database. No credentials are stored in `company_erp_config` — only the DB name.

**Non-negotiable**: SAP credentials (username, password, Service Layer URL) remain in environment
variables. `company_erp_config` stores only the logical DB name and branch/warehouse mappings.

### 8.2 Routing Architecture

```
company_erp_config.sap_company_db  →  logical key into SapSessionPool
SapSessionPool:
  sessions: Map<string, SapSession>  (keyed by sap_company_db)
  Each session: { token, expiresAt, baseUrl }
  baseUrl: from env var SAP_SERVICE_LAYER_URL (single URL; multi-URL Phase 3)
```

### 8.3 Branch and Warehouse Mapping

```
company_erp_config:
  sap_branch_code      VARCHAR(20)   — sent as BPL_IdAssignedToInvoice on AP/AR documents
  default_warehouse    VARCHAR(40)   — sent as WarehouseCode on inventory transactions
  default_cost_center  VARCHAR(40)   — sent as ProfitCode on journal entries
```

Phase 2 ensures that when generating SAP document payloads (PO, SO, JE), the correct
branch/warehouse/cost-centre values are sourced from `req.activeCompany.erpConfig` rather than
hardcoded values.

### 8.4 Service Layer Governance

The rules defined in `replit.md` (SAP Service Layer UDF Behaviour) are **unchanged**:
- No `$select` or `$orderby` on bulk vendor fetch
- No credential storage in application tables
- `Test SAP` button forces fresh login (`invalidateSharedSapSession()`)
- Full Scan paginates in memory and filters locally

Multi-company routing does not alter these rules. Each company gets its own session slot in
`SapSessionPool`, but the same governance rules apply to all slots.

### 8.5 Credential Boundary

```
Permitted in company_erp_config:  sap_company_db, sap_branch_code, default_warehouse,
                                   default_cost_center, default_payment_terms,
                                   default_delivery_terms, base_uom, decimal_precision

Prohibited in company_erp_config: SAP username, SAP password, Service Layer URL,
                                   any token or session key
```

Violation of the credential boundary is a zero-trust failure. Any attempt to store credentials
in `company_erp_config` must be rejected at code review.

---

## 9. Cross-Module Live Refresh

### 9.1 Design Decision: WebSocket vs Polling

| Criterion | WebSocket | Polling |
|---|---|---|
| Latency | ~1s | 5–60s |
| Server complexity | Medium | Low |
| Client complexity | Medium | Low |
| Connection overhead | Persistent | Per-request |
| Recommendation | **Preferred for Phase 2** | Fallback only |

Decision: WebSocket via `ws` library (already used in other modules). Polling at 30s interval
as automatic fallback if WebSocket connection drops.

### 9.2 Invalidation Signal

```
Server emits on company change:
  ws.send(JSON.stringify({ type: 'COMPANY_INVALIDATED', companyId: N }))

Client React handler:
  queryClient.invalidateQueries({ queryKey: ['/api/company/active'] })
  queryClient.invalidateQueries({ queryKey: ['/api/company', companyId] })
```

No full page reload — only affected queries are invalidated. React Query re-fetches automatically.

### 9.3 Document Refresh Behaviour

- If a user has a PDF preview open when branding changes, the WebSocket signal triggers
  a stale-data banner ("Company data has been updated — refresh to see latest")
- The banner includes a "Refresh now" button that invalidates and re-fetches
- PDF documents already generated and downloaded are not affected — they are point-in-time snapshots

---

## 10. Notification Hooks

### 10.1 Notification Events

| Event | Trigger | Channels | Recipients |
|---|---|---|---|
| Company activated | `PATCH /api/company/:id/activate` | In-app toast + email | Superuser group |
| Branding changed | Any branding upload or text save | In-app toast | Superuser group |
| Legal/tax changed | Approval applied | In-app toast + email | Superuser + Accounts Head |
| Document expiring (14 days) | Nightly cron | Email | Superuser + Accounts Head |
| Document expired | Nightly cron | Email + in-app alert | Superuser + Accounts Head |
| Approval pending | Approval submitted | Email | Superuser (reviewers) |
| Approval resolved | Approve/reject action | Email | Submitter |

### 10.2 Notification Channels

- **In-app toast**: React toast notification via existing `useToast` hook
- **Email**: Via existing SendGrid integration (`SENDGRID_API_KEY`) — new email templates for company events
- **In-app alert banner**: Persistent badge in navigation (document expiry warnings)

### 10.3 Retry Policy

- Email send: retry 3 times with exponential backoff (1s, 4s, 16s)
- After 3 failures: log to `company_audit_log` with `action='notification_failed'`; no further retry in Phase 2
- In-app notifications: fire-and-forget (WebSocket); no retry (client will re-fetch on reconnect)

### 10.4 Audit Logging

All notification dispatch attempts (success or failure) are logged to `company_audit_log`:
```
action: 'notification_dispatched' | 'notification_failed'
field_name: 'channel'           (e.g. 'email', 'websocket')
new_value:  'event_type'        (e.g. 'document_expired')
notes:      recipient user_id or group
```

---

## 11. Deliverables Summary

### 11.1 Schema Delta (Phase 2 total)

```sql
-- New tables:
company_change_approvals    — maker-checker approval workflow
user_company_assignments    — user-to-company assignment for multi-company

-- New columns:
company_master: logo_thumb_gcs_path, signature_thumb_gcs_path, seal_thumb_gcs_path
company_master: phone, email, description (Phase 2 contact/about fields for CS-01/CS-02)

-- New indexes:
idx_cca_company_id, idx_cca_status, idx_cca_submitted_at
idx_user_default_company (partial unique)
```

### 11.2 API Delta (Phase 2 additions to /api/company)

```
POST   /api/company/session/switch                      — switch active company in session
GET    /api/company/:id/approvals                       — list change approvals
POST   /api/company/:id/approvals                       — submit change for approval
GET    /api/company/approvals/:approvalId               — approval detail
PATCH  /api/company/approvals/:approvalId/approve       — approve and apply
PATCH  /api/company/approvals/:approvalId/reject        — reject
PATCH  /api/company/approvals/:approvalId/cancel        — cancel
POST   /api/admin/company-orphans/run                   — trigger orphan cleanup
GET    /api/admin/company-orphans/report                — last orphan scan report
POST   /api/admin/user-company-assignments              — assign user to company (Superuser)
DELETE /api/admin/user-company-assignments/:id          — remove assignment (Superuser)
GET    /api/admin/user-company-assignments/:userId      — list user's assignments
```

### 11.3 Event Model

```
company.activated, company.general.updated, company.legal.updated,
company.branding.updated, company.address.updated, company.document.uploaded,
company.document.expired, company.approval.pending, company.approval.resolved
```

### 11.4 Cache Strategy Summary

In-process Map with swappable Redis adapter. TTL: 5 min for full payload,
14 min for signed URLs. Invalidation via EventBus listeners. Request coalescing
on simultaneous cache misses.

---

## 12. Risk Matrix

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| PDF regression after callsite migration | Medium | HIGH | Feature flag; PDF diff test suite before prod |
| GCS path corruption from company_code read failure | Low | CRITICAL | Server abort on startup if company_code unavailable |
| Orphan cleanup deletes non-orphan files | Low | HIGH | 30-day retention window; dry-run mandatory for first 3 cycles |
| Concurrent approval application (race) | Low | HIGH | Optimistic lock on company_change_approvals; DB transaction |
| SAP session contamination across companies | Low | HIGH | Per-company session slots in SapSessionPool; explicit session invalidation on company switch |
| Cache stale after activation | Low | MEDIUM | `company.activated` triggers full cache flush |
| WebSocket flood on mass company change | Low | LOW | Debounce invalidation signals; 500ms cooldown per companyId |
| Maker-checker bypass (submitter approves own change) | Low | CRITICAL | DB constraint: `reviewed_by != submitted_by`; enforced at route level |
| Branding thumbnail GCS path collision | Low | LOW | Filename includes content hash suffix |

---

## 13. Migration Sequence

```
Phase 2 — Implementation Order:

Block A (Infrastructure — no user-visible impact):
  A1. CompanyCache adapter interface + InMemoryCompanyCache
  A2. companyContextMiddleware (session-level active company)
  A3. EventBus (server-side in-process)
  A4. getActiveCompany() server helper
  A5. useActiveCompany() React hook

Block B (Low-risk callsite migration):
  B1. CS-04 advance-tax-routes.ts
  B2. CS-06 pppc-services.ts
  B3. CS-07 drawing-report-template.ts
  B4. CS-05 buy-datasheet-dialog.tsx

Block C (Medium-risk callsite migration):
  C1. CS-03 document-path-resolver.ts (GCS path — requires regression suite)

Block D (Governance features):
  D1. company_change_approvals table + API + maker-checker UI
  D2. user_company_assignments table + assignment API
  D3. Global company switcher UI
  D4. Branding dimension validation (sharp)
  D5. Orphan cleanup scheduler + admin route

Block E (High-risk callsite migration — feature-flagged):
  E1. CS-01 salary-slip-generator.ts
  E2. CS-02 offer-pdf-generator.ts
  [Deploy with FF_COMPANY_LIVE_PDF=false; toggle per environment after QA]

Block F (Event propagation + notifications):
  F1. EventBus subscriber wiring for all callsites
  F2. WebSocket invalidation signal
  F3. Notification email templates + SendGrid dispatch
  F4. Nightly document expiry cron

Block G (Cleanup):
  G1. Remove COMPANY_FALLBACK constants after 30-day stability window
  G2. Remove feature flag FF_COMPANY_LIVE_PDF after production confirmation
```

---

## 14. Rollback Strategy

| Block | Rollback Method |
|---|---|
| A (Infrastructure) | Feature flags; middleware is additive and non-breaking |
| B/C/D (Low/medium risk) | Git revert per block; independent deployments |
| D1 (Maker-checker) | Approval table can be left empty; routes return 404 if not wired |
| E (PDF callsites) | `FF_COMPANY_LIVE_PDF=false` instantly reverts to hardcoded values |
| F (Events/notifications) | EventBus listeners are additive; remove subscriber to disable |
| G (Cleanup) | Constants can be re-added; do not remove until 30-day window passes |

DB rollback: all Phase 2 schema changes use `IF NOT EXISTS` / `IF EXISTS` guards.
`ALTER TABLE ADD COLUMN` is non-destructive. `DROP` statements are not used in Phase 2.

---

## 15. Lifecycle Validation Plan

Phase 2 implementation must pass the following test categories before acceptance:

| Category | Count | Description |
|---|---|---|
| Cache correctness | 6 | TTL expiry, invalidation on each event type, no stale after activation |
| Callsite migration | 14 | Before/after PDF content assertion for each callsite (CS-01 to CS-07) |
| Maker-checker lifecycle | 8 | Submit, review, approve, reject, cancel, self-approve blocked, version lock, audit trail |
| Multi-company switch | 6 | Session switch, permission isolation, cache flush, route persistence, Superuser override |
| Orphan cleanup | 5 | Dry-run report, retention window, deletion log, GCS verify, failure recovery |
| Branding validation | 6 | Min/max dimension, aspect ratio, print quality warn, thumbnail path, collision avoidance |
| SAP routing | 4 | Company-specific session slot, credential boundary, branch/warehouse mapping, no contamination |
| Event propagation | 9 | One test per event type — dispatch, subscriber receives, retry on failure |
| Notification dispatch | 7 | Each event channel — email, in-app, expiry cron, retry on failure, audit log entry |
| Zero-trust Phase 2 | 8 | Self-approve blocked, credential boundary, session company scope, orphan auth, feature flag guard |

**Total: 73 lifecycle tests** to be defined and run before Phase 2 acceptance.

---

## 16. Zero-Trust Audit Requirements (Phase 2)

| Control | Requirement |
|---|---|
| Maker-checker self-approval | `reviewed_by != submitted_by` enforced at DB constraint level AND route level |
| SAP credential boundary | No SAP password/token stored in any company table — enforced at code review |
| Company session isolation | Every authenticated route reads `req.activeCompany` from session, not from client-supplied ID |
| Orphan cleanup authorization | Admin route requires Superuser role; dry-run is default; audit log required before and after each deletion |
| Feature flag control | `FF_COMPANY_LIVE_PDF` only togglable via environment variable, not via API |
| Cache bypass attack | Cache miss always falls back to DB read; no unauthenticated cache read path |
| Multi-company data leak | API routes validate that `req.session.activeCompanyId` matches `:id` in path, or that user is assigned to the requested company |
| Notification recipient scoping | Notification dispatch reads recipient list from DB (user roles); no client-supplied recipient list accepted |

---

## 17. Lock Statement

This baseline is **planning only**. No code changes may begin until:

1. This document is reviewed and approved by the user
2. A separate implementation session is opened
3. Implementation blocks are sequenced and assigned

The Phase 1 implementation (commit `80edd6c1`) remains locked and unchanged until Phase 2
implementation begins.
