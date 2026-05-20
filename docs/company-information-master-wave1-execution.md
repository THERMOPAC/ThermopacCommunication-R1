# Company Information Master — Wave 1 Execution Document

**Status**: AWAITING IMPLEMENTATION APPROVAL
**Created**: 2026-05-20
**Scope**: Phase 2A — Wave 1 only (Hardcoded Callsite Migration)
**Baseline Reference**: `docs/company-information-master-phase2-execution-plan.md`

This document is the sole authoritative guide for Wave 1 implementation.
Wave 2 planning begins separately after Wave 1 is declared stable.

---

## 1. Scope Statement

Wave 1 replaces all confirmed hardcoded company identity strings with live reads from
`company_master`. No other Phase 2 work (approvals, events, cache, SAP routing, orphan
cleanup, or multi-company session) is included or prepared for.

**Out of scope for Wave 1 (explicitly excluded)**:
- No legacy GCS path migration logic
- No orphan cleanup preparation
- No historical data compatibility logic
- No event propagation preparation
- No cache layer preparation
- No SAP routing preparation
- No multi-company session context

---

## 2. Exact Files Impacted

### 2.1 Server-side files

| File | Change Type | Risk |
|---|---|---|
| `server/salary-slip-generator.ts` | Replace 5 hardcoded strings with DB reads (flag-gated) | HIGH |
| `server/offer-pdf-generator.ts` | Replace 8 hardcoded strings with DB reads (flag-gated) | HIGH |
| `server/services/document-path-resolver.ts` | Replace `COMPANY: 'TPEL'` with DB read | MEDIUM |
| `server/advance-tax-routes.ts` | Replace `companyName = 'TPEL'` with DB read | LOW |
| `server/utils/pppc-services.ts` | Replace `company: 'THERMOPAC'` with DB read | LOW |
| `server/utils/drawing-report-template.ts` | Replace 2 hardcoded display strings with DB reads | LOW |
| `server/utils/company-context.ts` | **NEW FILE** — `getActiveCompany()` helper | — |

### 2.2 Client-side files

| File | Change Type | Risk |
|---|---|---|
| `client/src/components/buy-datasheet-dialog.tsx` | Replace 2 hardcoded strings with hook | LOW |
| `client/src/hooks/use-active-company.ts` | **NEW FILE** — `useActiveCompany()` hook | — |

### 2.3 Schema migration

| File | Change Type |
|---|---|
| DB migration (raw SQL via psql) | `ADD COLUMN` phone, fax, email, description to company_master |
| `shared/schema.ts` | Add 4 new columns to `companyMaster` Drizzle table definition |

### 2.4 Files explicitly NOT touched

The following files contain THERMOPAC/TPEL references that are out of scope for Wave 1:

| File | Reason excluded |
|---|---|
| `server/utils/gcs-storage.ts` | `THERMOPAC_INVENTORY` / `THERMOPAC_PROJECTS` are legacy GCS root prefixes, not company identity fields |
| `server/utils/qms-file-governance.ts` | Same — legacy GCS prefix constants |
| `server/utils/storage-config.ts` | `thermopac_storage` is a bucket name — infrastructure constant, not company identity |
| `server/lead-generation-routes.ts` | `ThermopacBot/1.0` is an HTTP User-Agent string — infrastructure constant |
| `server/sap-b1-integration/data-mapping.ts` | `thermopac_wins` is an enum value string, not company identity |

---

## 3. DB Schema Migration

### 3.1 SQL (run before any code changes deploy)

```sql
-- Add contact and description fields to company_master
ALTER TABLE company_master
  ADD COLUMN IF NOT EXISTS phone       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS fax         VARCHAR(60),
  ADD COLUMN IF NOT EXISTS email       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Seed TPEL contact data (idempotent)
UPDATE company_master SET
  phone       = '+91 22 2617 8080 to 84',
  fax         = '+91 22 2617 8084',
  email       = 'sales@thermopac.in',
  description = 'Thermopac has been building Re-refining plants and equipment since 1986, developing in-house technology for lower Capex and higher yields.'
WHERE company_code = 'TPEL'
  AND phone IS NULL;
```

### 3.2 Verification query (run after migration)

```sql
SELECT id, company_code, phone, fax, email,
       LEFT(description, 60) AS description_preview
FROM company_master
WHERE company_code = 'TPEL';
-- Expected: all 4 fields populated, not null
```

---

## 4. New Shared Helper Files

### 4.1 `server/utils/company-context.ts` (new file)

Purpose: single function used by all server-side callsites to read active company from DB.

```typescript
// Responsibilities:
// - SELECT * FROM company_master JOIN company_addresses JOIN company_legal_tax WHERE is_active=true
// - If no active company: throw new Error('COMPANY_DATA_UNAVAILABLE')
// - If DB error: throw new Error('COMPANY_DATA_UNAVAILABLE')
// - Per-request memoisation via req._companyCache (not a persistent cache)

export interface ActiveCompanyContext {
  id: number;
  companyCode: string;    // 'TPEL'
  legalName: string;      // 'THERMOPAC PROCESS ENGINEERING LLP'
  displayName: string;    // 'THERMOPAC Process Engineering LLP'
  shortName: string;      // 'THERMOPAC'
  phone: string | null;
  fax: string | null;
  email: string | null;
  description: string | null;
  registeredOffice: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    country: string;
    pinCode: string | null;
  } | null;
}

export async function getActiveCompany(): Promise<ActiveCompanyContext>
```

**Error contract**: throws `'COMPANY_DATA_UNAVAILABLE'` — never returns null, never returns
partial data. Callers must handle the error explicitly. It is the caller's responsibility to
decide whether to use `COMPANY_FALLBACK` or abort generation.

### 4.2 `client/src/hooks/use-active-company.ts` (new file)

Purpose: React hook wrapping `GET /api/company/active` for client-side callsites.

```typescript
// Uses useQuery with:
//   queryKey: ['/api/company/active']
//   staleTime: 5 * 60 * 1000   (5 minutes)
//   retry: 2
// Returns: { data: CompanyPayload | undefined, isLoading, isError }
```

---

## 5. COMPANY_FALLBACK Behaviour

Each high-risk generator defines a named fallback constant as a safety net.
The fallback is **only** used when `FF_COMPANY_LIVE_PDF=false` (flag is off).
When the flag is on and the DB read fails, the generator throws `COMPANY_DATA_UNAVAILABLE`
and halts — it does **not** silently fall back to the constant.

```typescript
// Defined at the top of server/salary-slip-generator.ts:
const SALARY_SLIP_COMPANY_FALLBACK = {
  legalName:   'THERMOPAC PROCESS ENGINEERING LLP',
  displayName: 'THERMOPAC Process Engineering LLP',
  shortName:   'THERMOPAC',
  phone:       '+91 22 2617 8080-84',
  fax:         '+91 22 2617 8084',
  email:       'sales@thermopac.in',
  logoPath:    path.join(process.cwd(), 'client', 'public', 'images', 'thermopac-logo.jpg'),
  address:     'L 4, 405 The Summit Business Bay, Vile Parle, Western Express Highway, Mumbai 400 057',
};

// Defined at the top of server/offer-pdf-generator.ts:
const OFFER_COMPANY_FALLBACK = {
  legalName:   'THERMOPAC PROCESS ENGINEERING LLP',
  displayName: 'THERMOPAC Process Engineering LLP',
  shortName:   'THERMOPAC',
  phone:       '+91 22 2617 8080 to 84',
  fax:         '+91 22 2617 8084',
  email:       'sales@thermopac.in',
  logoPath:    path.join(process.cwd(), 'client', 'public', 'assets', 'thermopac-logo.jpg'),
  address:     'THERMOPAC | L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057',
};
```

**Fallback logic in each generator**:
```typescript
const FF_LIVE_PDF = process.env.FF_COMPANY_LIVE_PDF === 'true';

let company: ActiveCompanyContext | null = null;
if (FF_LIVE_PDF) {
  company = await getActiveCompany(); // throws COMPANY_DATA_UNAVAILABLE if DB fails
}

// Usage:
const legalName = FF_LIVE_PDF
  ? company!.legalName
  : SALARY_SLIP_COMPANY_FALLBACK.legalName;
```

---

## 6. Migration Order

**Strict sequence — do not skip or reorder steps.**

```
Step 1: Run DB schema migration
        ↓ verify: phone/fax/email/description populated for TPEL

Step 2: Update shared/schema.ts (Drizzle type definitions for new columns)
        ↓ verify: npm run typecheck — 0 errors

Step 3: Create server/utils/company-context.ts
        ↓ verify: unit test getActiveCompany() returns TPEL data

Step 4: Create client/src/hooks/use-active-company.ts
        ↓ verify: hook renders without error in isolation

Step 5: Migrate Block B (LOW risk — no flag required)
        Files: advance-tax-routes.ts, pppc-services.ts, drawing-report-template.ts
        ↓ verify: Block B regression checklist (see §8)

Step 6: Migrate Block C (MEDIUM risk — GCS path)
        File: document-path-resolver.ts
        ↓ verify: GCS path validation checklist (see §9)

Step 7: Migrate Block D (LOW risk — client hook)
        File: buy-datasheet-dialog.tsx
        ↓ verify: buy-datasheet renders with DB-sourced values

Step 8: Deploy Block E (HIGH risk — BEHIND FLAG, flag=false)
        Files: salary-slip-generator.ts, offer-pdf-generator.ts
        Deploy with FF_COMPANY_LIVE_PDF=false
        ↓ verify: generators still use COMPANY_FALLBACK constants
        ↓ verify: npm run typecheck — 0 errors

Step 9: Dark-launch sequence (see §7)
```

**Steps 3–7 can be deployed together** (they are all flag-independent and low/medium risk).
**Step 8 must be deployed separately** from Steps 3–7.

---

## 7. Feature Flag Rollout

### 7.1 Flag Definition

```
Name:    FF_COMPANY_LIVE_PDF
Type:    Environment variable (string)
Values:  'true' | anything else (treated as false)
Default: not set (= false)
Scope:   salary-slip-generator.ts + offer-pdf-generator.ts only
```

### 7.2 Dark-Launch Sequence

```
Phase A — Deploy with flag OFF (Steps 1–8 above)
  Action:  Deploy all Wave 1 code with FF_COMPANY_LIVE_PDF unset
  Verify:  All generators use COMPANY_FALLBACK constants
  Verify:  PDF regression checklist passes with fallback (§10)
  Verify:  No TypeScript errors; no runtime errors in logs

Phase B — Enable flag in STAGING
  Action:  Set FF_COMPANY_LIVE_PDF=true in staging environment
  Verify:  Full PDF regression checklist passes with live DB data (§10)
  Verify:  Generated PDFs contain TPEL data from DB (not hardcoded)
  Verify:  COMPANY_DATA_UNAVAILABLE error fires correctly when DB is offline (staged test)
  Gate:    All PDF regression items checked — no proceed without full pass

Phase C — Production pilot (48-hour dark-launch window)
  Action:  Set FF_COMPANY_LIVE_PDF=true in PRODUCTION
  Verify:  Generate one salary slip manually — inspect output
  Verify:  Generate one test offer manually — inspect output
  Monitor: Server logs for COMPANY_DATA_UNAVAILABLE errors — expect zero
  Monitor: PDF generation latency — expect no meaningful increase
  Duration: 48 hours minimum before declaring stable

Phase D — Declare stable
  Confirm: No COMPANY_DATA_UNAVAILABLE in logs for 48 hours
  Confirm: PDF content correct on manual inspection
  Action:  Flag remains true permanently
  Record:  Date of production enable
```

### 7.3 Emergency Flag Disable

If any PDF renders with wrong or blank company identity:
```
1. Set FF_COMPANY_LIVE_PDF= (unset / empty)  ← takes effect on next request
2. Restart server if env var hot-reload is not configured
3. Verify: next salary slip / offer uses COMPANY_FALLBACK values
4. Time target: < 2 minutes from trigger to restoration
5. Do not re-enable flag until root cause identified and fixed
```

---

## 8. Block B Regression Checklist

Run after Steps 5 (advance-tax-routes, pppc-services, drawing-report-template).

- [ ] **advance-tax-routes.ts**: advance tax computation labels contain the company short_name from DB (`THERMOPAC` or `TPEL`)
- [ ] **pppc-services.ts**: procurement document labelled with `company_master.short_name`; label matches DB value
- [ ] **drawing-report-template.ts**: drawing verification report header contains `{company_master.display_name} — Drawing Verification Report`
- [ ] **drawing-report-template.ts**: footer contains `{company_master.short_name} ERP — Drawing Verification System v1.0`
- [ ] All 3 files: `npm run typecheck` — 0 errors
- [ ] No new errors in server log after deploy

---

## 9. GCS Path Validation Checklist

Run after Step 6 (document-path-resolver.ts).

### 9.1 Pre-migration verification

```sql
-- Confirm company_code in DB before migration
SELECT company_code FROM company_master WHERE is_active = true;
-- Expected: TPEL (single row)
```

### 9.2 Path construction test

After migration, generate the following 5 test paths programmatically and assert each begins with `TPEL/`:

| Input | Expected path prefix |
|---|---|
| EPC project doc upload | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/...` |
| Company document (GST) | `TPEL/COMPANY/TPEL/GST_CERTIFICATE/rev-01/...` |
| Procurement datasheet | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/PROCUREMENT/...` |
| Quality document | `TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/QUALITY/...` |
| Branding asset | `TPEL/COMPANY/TPEL/BRANDING/LOGO/...` |

- [ ] All 5 test paths begin with `TPEL/` (sourced from DB, not from hardcoded `'TPEL'`)
- [ ] Server startup: if `company_master` is empty → server logs `FATAL: company_code unavailable` and refuses to start path resolver
- [ ] `npm run typecheck` — 0 errors after migration
- [ ] No existing GCS paths are modified or regenerated by this migration (paths are constructed at upload time only)

---

## 10. PDF Regression Checklist

Run at Phase B (staging, flag=true) and Phase C (production, flag=true).

### 10.1 Salary Slip Regression

Generate a test salary slip for any active employee in staging:

- [ ] PDF header line 1: `THERMOPAC PROCESS ENGINEERING LLP` (from `company_master.legal_name`)
- [ ] PDF "For THERMOPAC PROCESS ENGINEERING LLP" signature line: matches `company_master.legal_name`
- [ ] PDF address footer: composite of `company_master.display_name` + `company_addresses[registered_office]`
  - Expected: `THERMOPAC  |  L 4, 405 The Summit Business Bay, Vile Parle, Western Express Highway, Mumbai 400 057`
- [ ] PDF phone/fax line: from `company_master.phone` and `company_master.fax`
  - Expected: `Tel: +91 22 2617 8080 to 84  |  Fax: +91 22 2617 8084  |  Email: sales@thermopac.in`
- [ ] Logo renders correctly in PDF (from `company_master.logo_gcs_path` signed URL OR local file fallback)
- [ ] PDF is not blank; all sections render
- [ ] `COMPANY_DATA_UNAVAILABLE` error test: take DB offline → generator throws named error → no blank PDF is generated; error is logged

### 10.2 Offer PDF Regression

Generate a test offer for any project in staging:

- [ ] PDF metadata Author field: `company_master.short_name` (`THERMOPAC`)
- [ ] PDF `forThermopac` text: `For THERMOPAC` derived from `company_master.display_name`
- [ ] PDF footer address (page bottom): `THERMOPAC | L 4, 405 The Summit Business Bay, Vile Parle (East), W E Highway, Mumbai India 400 057`
- [ ] PDF footer contact line: `Tel: +91 22 2617 8080 to 84 | Fax: +91 22 2617 8084 | E-Mail: sales@thermopac.in`
- [ ] Logo renders (signed URL from GCS OR local file fallback)
- [ ] Company description paragraph renders (from `company_master.description`)
- [ ] T&C section renders (from `company_branding.terms_conditions` OR in-code default if null)
- [ ] Mumbai factory reference in T&C still renders (from terms_conditions field or default constant)
- [ ] PDF is not blank; all pages render
- [ ] `COMPANY_DATA_UNAVAILABLE` error test: generator throws named error on DB failure; no blank PDF generated

### 10.3 Unchanged Behaviour Regression (flag=false)

With `FF_COMPANY_LIVE_PDF` unset (or empty):

- [ ] Salary slip uses `SALARY_SLIP_COMPANY_FALLBACK` values — content identical to pre-Wave-1 output
- [ ] Offer PDF uses `OFFER_COMPANY_FALLBACK` values — content identical to pre-Wave-1 output
- [ ] No DB calls made by generators when flag is off

---

## 11. Production Smoke Tests

Run immediately after Wave 1 code deploy (flag still off) and again after flag is enabled.

```
Smoke Test 1:  GET /api/company/active
               Expected: HTTP 200, company_code='TPEL', phone/fax/email populated

Smoke Test 2:  npm run typecheck
               Expected: 0 TypeScript errors

Smoke Test 3:  Check server log — 0 COMPANY_* errors for 5 minutes post-deploy

Smoke Test 4:  GET /api/company/1/documents
               Expected: HTTP 200 (existing Phase 1 route unaffected)

Smoke Test 5:  Generate one salary slip (manual, staging)
               Expected: PDF renders; no COMPANY_DATA_UNAVAILABLE error in log

Smoke Test 6:  Construct one GCS path via document-path-resolver
               Expected: path begins with 'TPEL/' (from DB)
```

---

## 12. Rollback Checklist

### 12.1 Rollback Triggers (any of these → immediate rollback)

- Salary slip generated with blank company name
- Offer PDF generated with wrong or blank legal name
- GCS path constructed with empty or wrong company code
- `COMPANY_DATA_UNAVAILABLE` errors appearing in production logs
- Any unhandled exception in salary-slip-generator.ts or offer-pdf-generator.ts

### 12.2 Rollback Execution

```
1. Set FF_COMPANY_LIVE_PDF= (unset)     ← restores fallback constants in generators
2. Restart server if env var hot-reload not active
3. Verify: generators use COMPANY_FALLBACK values (generate one test PDF)
4. Verify: GCS paths still begin with 'TPEL/' (Block C uses DB; fallback to 'TPEL' constant on error)
5. If Block C (document-path-resolver) is the issue:
   — git revert the specific file change
   — redeploy server
   — verify startup guard fires correctly
6. If schema migration is the issue (rare):
   — new columns are nullable; existing behaviour is unaffected if values are null
   — Block E flag is off; no code depends on new columns when flag is off
   — DB rollback only if columns themselves are causing issues:
     ALTER TABLE company_master
       DROP COLUMN IF EXISTS phone,
       DROP COLUMN IF EXISTS fax,
       DROP COLUMN IF EXISTS email,
       DROP COLUMN IF EXISTS description;
```

### 12.3 Rollback Validation

After rollback, confirm:

- [ ] `GET /api/company/active` → 200, TPEL data returned
- [ ] Salary slip generates with COMPANY_FALLBACK values (identical to pre-Wave-1)
- [ ] Offer PDF generates with COMPANY_FALLBACK values (identical to pre-Wave-1)
- [ ] GCS path constructed correctly (begins with `TPEL/`)
- [ ] Phase 1 lifecycle checklist: 25/25 PASS
- [ ] Zero COMPANY_* errors in log for 5 minutes post-rollback

### 12.4 Rollback Authority

Any Superuser may execute rollback steps immediately. No approval required.
A rollback decision should be communicated to the user within 15 minutes.

---

## 13. Implementation Start Gate

Wave 1 implementation may begin only after all three of the following are confirmed:

- [ ] This Wave 1 execution document reviewed and approved (user written approval)
- [ ] Rollback checklist (§12) reviewed and accepted
- [ ] PDF regression checklist (§10) reviewed and accepted

**Wave 2 planning and implementation are deferred. They do not begin until Wave 1 is declared
stable (T+48h rollback checkpoint confirmed) and a separate Wave 2 planning session is opened.**
