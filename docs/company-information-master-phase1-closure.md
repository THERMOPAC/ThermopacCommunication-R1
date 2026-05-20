# Company Information Master — Phase 1 Closure

**Status**: PRODUCTION READY (Phase 1)
**Closure Date**: 2026-05-20
**Baseline Reference**: `docs/company-information-master-baseline-v1.md`
**Approved By**: User (2026-05-20)
**Phase 2**: NOT STARTED — requires separate planning and approval

---

## 1. Approval Record

| Item | Result |
|---|---|
| Phase 1 implementation | ACCEPTED |
| Validation evidence | ACCEPTED |
| Lifecycle tests | 25/25 PASS |
| Zero-trust controls | 16/16 PASS |
| Compliance with baseline | CONFIRMED |

---

## 2. Implementation File List

| File | Role |
|---|---|
| `server/company-routes.ts` | 23 API routes — all business logic, security, GCS operations |
| `server/company-seed.ts` | Idempotent seed — TPEL company_master row + registered_office address |
| `server/services/gcs-governance-service.ts` | 12 company governance rules appended to `SEED_RULES` |
| `shared/schema.ts` | 8 company table definitions appended at end of file |
| `client/src/pages/admin/company-information-page.tsx` | 8-tab UI page |
| `client/src/loaders/admin.ts` | `CompanyInformationPage` lazy export |
| `client/src/App.tsx` | `ProtectedRoute` at `/administration/company-information` |
| `client/src/components/layout.tsx` | "Company Information" nav entry under Administration |

---

## 3. Schema Snapshot

### 3.1 Tables Created (8)

```sql
company_master          — core identity, activation flag, logo/sig/seal GCS paths
company_legal_tax       — CIN, PAN, GSTIN, IEC, LUT, MSME, TAN, PF, ESI, AD Code
company_addresses       — registered_office, corporate_office, factory, warehouse (multi-address)
company_bank_accounts   — multi-account, primary flag, soft-delete lifecycle
company_erp_config      — SAP DB, warehouse, cost centre, payment terms, decimal precision
company_branding        — letterhead, footer, T&C, RFQ/offer/purchase footers, watermark
company_documents       — compliance docs with immutable revision chain
company_audit_log       — permanent, append-only write history
```

### 3.2 Indexes (29 total)

| Index | Type | Purpose |
|---|---|---|
| `idx_single_active_company` | PARTIAL UNIQUE `WHERE is_active=true` | Enforces single active company invariant at DB level |
| `idx_single_active_doc` | PARTIAL UNIQUE `(company_id, doc_type) WHERE is_active=true` | One active revision per doc_type per company |
| `company_master_company_code_key` | UNIQUE | Unique company code |
| `company_branding_company_id_key` | UNIQUE | One branding row per company |
| `company_erp_config_company_id_key` | UNIQUE | One ERP config row per company |
| `company_legal_tax_company_id_key` | UNIQUE | One legal-tax row per company |
| `idx_company_*_company_id` (×7) | INDEX | FK lookup performance |
| `idx_company_*_is_active` (×3) | INDEX | Active filter performance |
| `idx_company_audit_log_changed_at` | INDEX | Time-range audit queries |
| `idx_company_legal_tax_updated_at` | INDEX | Recency queries |
| `idx_company_master_updated_at` | INDEX | Recency queries |

### 3.3 Foreign Key Constraints (15)

All `company_id` columns → `company_master.id` **ON DELETE RESTRICT**
All user ref columns (`created_by`, `updated_by`, `uploaded_by`, `changed_by`) → `users.id` **ON DELETE SET NULL**

| Table | company_id FK | user ref FK |
|---|---|---|
| company_legal_tax | RESTRICT | updated_by SET NULL |
| company_addresses | RESTRICT | updated_by SET NULL |
| company_bank_accounts | RESTRICT | created_by SET NULL |
| company_erp_config | RESTRICT | updated_by SET NULL |
| company_branding | RESTRICT | updated_by SET NULL |
| company_documents | RESTRICT | uploaded_by SET NULL |
| company_audit_log | RESTRICT | changed_by SET NULL |
| company_master | — | created_by SET NULL |

> **Note**: FK constraints were absent from the initial DDL and were added via `ALTER TABLE` during validation on 2026-05-20. All 15 constraints confirmed live before Phase 1 acceptance.

### 3.4 NOT NULL Constraints (58)

All structural NOT NULL columns enforced at DB level via PostgreSQL check constraints.

---

## 4. Seed Data

| Table | Row |
|---|---|
| `company_master` | id=1, company_code=TPEL, short_name=THERMOPAC, legal_name=THERMOPAC PROCESS ENGINEERING LLP, display_name=THERMOPAC Process Engineering LLP, company_type=LLP, fy_start_month=4, base_currency=INR, timezone=Asia/Kolkata, is_active=true, version=1 |
| `company_addresses` | id=1, company_id=1, address_type=registered_office, L 4 405 The Summit Business Bay, Vile Parle (East) W E Highway, Mumbai, Maharashtra, India 400057 |
| `company_legal_tax` | id=1, company_id=1 (skeleton row — all fields null, export_without_gst=false) |
| `company_erp_config` | id=1, company_id=1 (skeleton row — decimal_precision=2) |
| `company_branding` | id=1, company_id=1 (skeleton row — all text fields null) |

**Idempotency guard** (server/company-seed.ts line 79):
```typescript
if (count > 0) {
  console.log(`${TAG} ${count} company record(s) already exist — seed skipped.`);
  return;
}
```
Second server start does not overwrite existing records.

---

## 5. API Route Summary (23 routes)

| Method | Path | Roles | Rate Limit |
|---|---|---|---|
| GET | `/api/company/` | Any authenticated | — |
| GET | `/api/company/active` | Any authenticated | — |
| GET | `/api/company/:id` | Any authenticated | — |
| POST | `/api/company/` | Superuser | — |
| PATCH | `/api/company/:id/general` | Superuser | — |
| PATCH | `/api/company/:id/legal-tax` | Superuser, Accounts Head | — |
| PATCH | `/api/company/:id/address/:type` | Superuser | — |
| POST | `/api/company/:id/bank-accounts` | Superuser, Accounts Head | — |
| PATCH | `/api/company/:id/bank-accounts/:bankId` | Superuser, Accounts Head | — |
| DELETE | `/api/company/:id/bank-accounts/:bankId` | Superuser | — |
| PATCH | `/api/company/:id/erp-config` | Superuser | — |
| PATCH | `/api/company/:id/branding` | Superuser | — |
| POST | `/api/company/:id/branding/logo` | Superuser | 5/min |
| POST | `/api/company/:id/branding/signature` | Superuser | 5/min |
| POST | `/api/company/:id/branding/seal` | Superuser | 5/min |
| POST | `/api/company/:id/documents/:docType` | Superuser | 10/min |
| GET | `/api/company/:id/documents` | Any authenticated | — |
| GET | `/api/company/:id/documents/:docType/history` | Superuser | — |
| GET | `/api/company/doc/:docId/download` | Superuser | 30/min |
| GET | `/api/company/doc/:docId/view` | Superuser | 60/min |
| PATCH | `/api/company/doc/:docId/status` | Superuser, Accounts Head | — |
| PATCH | `/api/company/:id/activate` | Superuser | 3/min |
| GET | `/api/company/:id/audit-log` | Superuser | — |

---

## 6. GCS Governance Rules (12 rules, moduleKey: `company`)

### Compliance Documents (9) — revisionMode: numeric, maxFileSizeMb: 20
Allowed MIME: application/pdf, image/jpeg, image/png, image/webp

| documentType | Path Template |
|---|---|
| COMPANY_GST_CERTIFICATE | `TPEL/COMPANY/{CompanyCode}/GST_CERTIFICATE/rev-{RevNo}/{Seq}-gst-certificate.{Ext}` |
| COMPANY_PAN_CARD | `TPEL/COMPANY/{CompanyCode}/PAN_CARD/rev-{RevNo}/{Seq}-pan-card.{Ext}` |
| COMPANY_CANCELLED_CHEQUE | `TPEL/COMPANY/{CompanyCode}/CANCELLED_CHEQUE/rev-{RevNo}/{Seq}-cancelled-cheque.{Ext}` |
| COMPANY_INCORPORATION_CERTIFICATE | `TPEL/COMPANY/{CompanyCode}/INCORPORATION_CERTIFICATE/rev-{RevNo}/{Seq}-incorporation-certificate.{Ext}` |
| COMPANY_IEC_CERTIFICATE | `TPEL/COMPANY/{CompanyCode}/IEC_CERTIFICATE/rev-{RevNo}/{Seq}-iec-certificate.{Ext}` |
| COMPANY_LUT_COPY | `TPEL/COMPANY/{CompanyCode}/LUT_COPY/rev-{RevNo}/{Seq}-lut-copy.{Ext}` |
| COMPANY_MSME_CERTIFICATE | `TPEL/COMPANY/{CompanyCode}/MSME_CERTIFICATE/rev-{RevNo}/{Seq}-msme-certificate.{Ext}` |
| COMPANY_FACTORY_LICENSE | `TPEL/COMPANY/{CompanyCode}/FACTORY_LICENSE/rev-{RevNo}/{Seq}-factory-license.{Ext}` |
| COMPANY_PF_ESI_DOCUMENT | `TPEL/COMPANY/{CompanyCode}/PF_ESI_DOCUMENT/rev-{RevNo}/{Seq}-pf-esi-document.{Ext}` |

### Branding Assets (3) — revisionMode: none (replace lifecycle), maxFileSizeMb: 2
Allowed MIME: image/jpeg, image/png, image/webp only

| documentType | Path Template |
|---|---|
| COMPANY_LOGO | `TPEL/COMPANY/{CompanyCode}/BRANDING/LOGO/{filename}` |
| COMPANY_SIGNATURE | `TPEL/COMPANY/{CompanyCode}/BRANDING/SIGNATURE/{filename}` |
| COMPANY_SEAL | `TPEL/COMPANY/{CompanyCode}/BRANDING/SEAL/{filename}` |

**Sample generated path (baseline spec)**:
```
TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/001-gst-certificate.pdf
```

---

## 7. Validation Evidence Summary

### 7.1 Lifecycle Tests — 25/25 PASS

| Range | Area | Result |
|---|---|---|
| T01 | Unauthenticated request blocked (401) | PASS |
| T02 | Seed idempotency — second run skips | PASS |
| T03 | `idx_single_active_company` blocks second active company | PASS |
| T04 | Optimistic lock — wrong version → 0 rows updated | PASS |
| T05 | `idx_single_active_doc` blocks second active revision per doc_type | PASS |
| T06–T09 | Magic-byte validation — PDF, JPEG, PNG; fake file rejected | PASS |
| T10–T15 | Filename sanitization — path traversal, null-byte, XSS, length cap | PASS |
| T16–T20 | MIME allowlist — TIFF, EXE, HEIC rejected; WEBP accepted | PASS |
| T21–T22 | GCS doc path construction — exact match to baseline spec | PASS |
| T23–T24 | GCS branding path — UPPERCASE segments, correct structure | PASS |
| T25 | Signed URL TTLs — 15 min download, 60 min view | PASS |

### 7.2 Zero-Trust Audit — 16/16 PASS

| Control | Result |
|---|---|
| Authentication — all routes require session | PASS |
| Authorisation — Superuser guards (16 route guards) | PASS |
| Authorisation — Accounts Head guards (5 route guards) | PASS |
| Authorisation — non-privileged roles blocked | PASS |
| MIME validation — allowlist enforced before GCS | PASS |
| Magic-byte validation — content must match declared MIME | PASS |
| Filename sanitization — path traversal, XSS, length | PASS |
| Rate limiting — 5 limiters across all write/sensitive endpoints | PASS |
| Optimistic locking — concurrent edits return 409 | PASS |
| Transaction integrity — BEGIN/COMMIT/ROLLBACK on all writes | PASS |
| Signed URL scoping — no permanent file URLs exposed | PASS |
| Audit trail — 13 auditLog() calls inside write transactions | PASS |
| No secrets in DB — zero credential fields in company tables | PASS |
| FK integrity — 15 constraints (RESTRICT + SET NULL) confirmed | PASS |
| Single-active-company invariant — partial unique index at DB level | PASS |
| Single-active-document invariant — partial unique index at DB level | PASS |

---

## 8. UI Summary

| Element | Detail |
|---|---|
| Route | `/administration/company-information` (ProtectedRoute) |
| Nav entry | Administration → Company Information (Building2 icon) |
| Tabs | General, Legal & Tax, Address, Banking, ERP Config, Branding, Documents, Audit Log |
| Audit Log tab | Superuser-only (conditionally rendered) |
| Activate button | Superuser-only (conditionally rendered) |
| Write access | `canWrite = isSuperuser` for General/Address/ERP/Branding/Documents |
| Write access | `canWriteLegal = isSuperuser \|\| isAccountsHead` for Legal & Tax / Banking |
| All fields | `disabled={!canWrite}` or `disabled={!canWriteLegal}` |
| Dirty-state guard | `beforeunload` event fires if form is dirty; Save disabled until dirty; Revert button shown when dirty |
| Loading state | Skeleton while `isLoading`; spinner on mutation `isPending` |

---

## 9. Known Phase 2 Deferred Items

The following items were explicitly deferred from Phase 1 and are **not** implemented. Phase 2 requires separate planning and approval before any work begins.

| # | Item | Notes |
|---|---|---|
| P2-01 | Orphan GCS file cleanup | When a branding asset is replaced, the old GCS object is not deleted. Orphan sweep required. |
| P2-02 | Document expiry alerting | `company_documents.expiry_date` is stored but no cron job or alert exists for approaching expiry (e.g. LUT validity, factory license). |
| P2-03 | Multi-company UI flow | The `GET /api/company/` list endpoint exists but there is no UI to list, select, or compare multiple companies. |
| P2-04 | Bulk document export | No ZIP download or bulk export of all company documents. |
| P2-05 | Company-level SAP sync verification | `company_erp_config.sap_company_db` is stored but there is no validation that it matches the live SAP B1 connection. |
| P2-06 | Letterhead PDF preview | Branding tab stores text fields but no live PDF preview of the letterhead using the stored logo + footer. |
| P2-07 | Revision diff view | Document history tab lists revisions but does not show a diff between revisions. |
| P2-08 | GCS orphan audit report | No admin tool to list GCS objects under `TPEL/COMPANY/` that are not referenced in `company_documents` or `company_master`. |
| P2-09 | LUT auto-renewal reminder | LUT number and validity date stored; no workflow to remind before expiry or auto-flag expired LUTs in offer generation. |
| P2-10 | Propagation to PDF generation | `server/dds-pdf-service.ts` and other PDF generators currently hardcode THERMOPAC identity. Phase 2 should read from `company_master` + `company_branding` dynamically. |

---

## 10. Lock Statement

This document locks the Phase 1 implementation state as of **2026-05-20**.

- No changes to the Phase 1 schema, routes, or UI are permitted without a new baseline document.
- Phase 2 work must be planned separately with a new baseline before any implementation begins.
- The `docs/company-information-master-baseline-v1.md` baseline remains the authoritative spec for Phase 1 scope.
