# OI Phase 1B — Implementation Tracker

**Status:** COMPLETE
**Approved:** 21-May-2026
**Completed:** 21-May-2026
**Execution Plan Ref:** `docs/operational-intelligence-phase1b-execution.md`
**Phase 1A Baseline:** `docs/operational-intelligence-phase1a-execution.md` (COMPLETE)

---

## Pre-Implementation Resolved Open Items

| # | Item | Resolution |
|---|---|---|
| 1 | `epcDrawingControls` export | Confirmed — `shared/schema.ts` line 12134 |
| 2 | `epcPurchaseOrders` export | Confirmed — `shared/schema.ts` line 11642 |
| 3 | `epcWorkOrders` export | Confirmed — `shared/schema.ts` line 11720 |
| 4 | `inspectionOrders` export | Confirmed — `shared/schema.ts` line 5204 |
| 5 | Drawing dropdown API | No existing project-scoped endpoint; added as `GET /api/oi/lookup/drawings?projectId=X` inside `oi-routes.ts` |
| 6 | PO dropdown API | No existing project-scoped endpoint; added as `GET /api/oi/lookup/epc-pos?projectId=X` |
| 7 | WO dropdown API | No existing project-scoped endpoint; added as `GET /api/oi/lookup/epc-wos?projectId=X` |
| 8 | IO dropdown API | No existing project-scoped endpoint; added as `GET /api/oi/lookup/inspection-orders?projectId=X` |
| 9 | `recharts` availability | Confirmed — `package.json` line 116, version ^2.13.0 |
| 10 | Existing `oi_risk_score` migration | Decision: leave existing computed scores intact; dimension scores start as NULL on existing issues; score will be recomputed when dimensions are first patched |

---

## Migration Baseline

| Metric | Value |
|---|---|
| `oi_issues` columns before Phase 1B | 81 |
| New columns added | 31 |
| Columns after migration | 112 |
| New tables | 0 |
| Migration method | `psql` direct SQL (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`) |

---

## Implementation Steps

### STEP 1 — DB Migration (psql direct SQL)

- [x] Run Step 1: Linkage FK columns (9 columns)
- [x] Run Step 2: Dimension score columns (9 columns)
- [x] Run Step 3: Financial exposure columns (5 columns)
- [x] Run Step 4: Liability columns (4 columns)
- [x] Run Step 5: Time intelligence columns (4 columns)
- [x] Run Step 6: Indexes (6 new indexes)
- [x] Verify: `oi_issues` column count = 112
- [x] Verify: all 31 new columns present

### STEP 2 — Drizzle ORM Schema (`shared/schema.ts`)

- [x] Add `smallint` to drizzle pg-core imports
- [x] Add 31 new columns to `oiIssues` pgTable definition (9 linkage FKs, 9 dimension scores, 5 financial, 4 liability, 4 time intelligence)
- [x] Update `insertOiIssueSchema` `.omit()` with 5 computed fields: `netFinancialExposure`, `captureDelayHours`, `responseTimeActualHours`, `investigationDurationHours`, `totalResolutionHours`

### STEP 3 — Lookup Endpoints (`server/oi-routes.ts`)

- [x] `GET /api/oi/lookup/drawings` — project-scoped drawing search (Manager+)
- [x] `GET /api/oi/lookup/epc-pos` — project-scoped PO search (Manager+)
- [x] `GET /api/oi/lookup/epc-wos` — project-scoped WO search (Manager+)
- [x] `GET /api/oi/lookup/inspection-orders` — project-scoped IO search (Manager+)

### STEP 4 — Server Logic Additions (`server/oi-routes.ts`)

- [x] `POST /api/oi/issues` — add `customer_id` auto-population from `project_id` (projects table join)
- [x] `POST /api/oi/issues` — add `capture_delay_hours` computation (detectedAt → now)
- [x] `PATCH /api/oi/issues/:id` — add linkage FK fields to `ALLOWED_MANAGER_FIELDS`
- [x] `PATCH /api/oi/issues/:id` — add dimension score fields to `ALLOWED_MANAGER_FIELDS`
- [x] `PATCH /api/oi/issues/:id` — add financial/liability fields to `ALLOWED_SM_FIELDS`
- [x] `PATCH /api/oi/issues/:id` — add `net_financial_exposure` computation (actualLoss − recovery)
- [x] `PATCH /api/oi/issues/:id` — add `oi_risk_score` recomputation from stored dimension columns × weight config
- [x] `PATCH /api/oi/issues/:id` — add FK existence validation for all 9 linkage fields (422 on not-found)
- [x] `PATCH /api/oi/issues/:id` — computed fields silently blocked via `COMPUTED_FIELDS` Set
- [x] Transition handler — add `response_time_actual_hours` at `investigating` transition
- [x] Transition handler — add `investigation_duration_hours` at `verified` transition
- [x] Transition handler — add `total_resolution_hours` at `closed` transition
- [x] `GET /api/oi/issues` — add 11 new filter params (customerId, vendorId, contractId, epcPoId, epcWoId, inspectionOrderId, epcDrawingControlId, hasFinancialExposure, dateFrom, dateTo, slaBreached=any)
- [x] `GET /api/oi/issues/:id` — parallel lookups for all 9 linkage display fields with denormalised labels
- [x] `GET /api/oi/dashboard/financial-exposure` — SM+ only
- [x] `GET /api/oi/dashboard/mttr` — Manager+ with weekly trend, by-severity, by-category
- [x] `GET /api/oi/dashboard/by-customer` — Manager+
- [x] `GET /api/oi/dashboard/by-vendor` — Manager+
- [x] `GET /api/oi/dashboard/linkage-coverage` — Manager+ with 10 coverage dimensions

### STEP 5 — Zod Schema Additions (`server/oi-routes.ts`)

- [x] `managerPatchExtSchema` — 9 linkage FKs (nullable integer) + 9 dimension scores (0–10)
- [x] `smPatchExtSchema` — 8 financial/liability fields with type-safe validation
- [x] All 6 computed fields confirmed absent from all client-facing Zod schemas (enforced by `COMPUTED_FIELDS` Set)

### STEP 6 — UI Pages

- [x] `oi-issue-capture.tsx` — Customer field (auto-populated from project), Vendor field (shown for PROC/MFG/LOG categories)
- [x] `oi-issue-classify.tsx` — EPC References panel (Drawing/PO/WO/IO/FAT IO/SAT IO/Contract/Customer/Vendor, project-scoped), Dimension Score panel (0–10 selects, 9 dims), Financial Exposure panel (SM+), Liability panel (SM+), Save Draft button
- [x] `oi-issue-detail.tsx` — EPC Reference Linkage card, Dimension Score bar chart panel (Manager+), Financial Exposure card (SM+), Liability card (SM+), Time Intelligence card (Manager+), insurance/warranty claim badges
- [x] `oi-issue-register.tsx` — Date range filter (dateFrom/dateTo), SLA "any" breach filter, Clear filters button
- [x] `oi-dashboard.tsx` — Financial Exposure panel (SM+), MTTR trend chart + by-severity grid (Manager+), By Customer bar chart (Manager+), By Vendor bar chart (Manager+), Linkage Coverage progress bars (Manager+)

---

## Files Modified

| File | Change | Status |
|---|---|---|
| `shared/schema.ts` | `smallint` import added; 31 columns added to `oiIssues`; omit updated with 5 computed fields | **COMPLETE** |
| `server/oi-routes.ts` | Full rewrite: 4 lookup endpoints, enhanced CRUD, 5 new dashboard endpoints, FK validation, time intel, Zod schemas | **COMPLETE** |
| `client/src/pages/oi/oi-issue-capture.tsx` | Customer + Vendor fields with project auto-population | **COMPLETE** |
| `client/src/pages/oi/oi-issue-classify.tsx` | EPC refs panel, dimension scores, financial/liability panel, Save Draft button | **COMPLETE** |
| `client/src/pages/oi/oi-issue-detail.tsx` | EPC refs card, financial card, liability card, time intel card, dimension score bars | **COMPLETE** |
| `client/src/pages/oi/oi-issue-register.tsx` | Date range filter, SLA "any" option, Clear filters button | **COMPLETE** |
| `client/src/pages/oi/oi-dashboard.tsx` | Financial exposure, MTTR trend, by-customer, by-vendor, linkage coverage panels | **COMPLETE** |

---

## Progress Log

| Date | Step | Action | Result |
|---|---|---|---|
| 21-May-2026 | All | Phase 1B approved for implementation | — |
| 21-May-2026 | Pre-check | All open items resolved; column count confirmed (81) | DONE |
| 21-May-2026 | STEP 1 | DB migration executed via psql — 31 columns, 6 indexes | DONE |
| 21-May-2026 | STEP 2 | `shared/schema.ts` updated — smallint import, 31 columns, omit | DONE |
| 21-May-2026 | STEP 3–5 | `server/oi-routes.ts` fully rewritten with all Phase 1B server logic | DONE |
| 21-May-2026 | STEP 6 | All 5 UI pages updated with Phase 1B features | DONE |
| 21-May-2026 | Build | Server confirmed running on port 5000, OI routes registered | DONE |
