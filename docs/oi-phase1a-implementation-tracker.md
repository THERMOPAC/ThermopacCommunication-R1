# OI Phase 1A — Implementation Tracker

**Status:** IMPLEMENTED — PENDING UAT SMOKE TESTS
**Approved:** 21-May-2026
**Implemented:** 21-May-2026
**Execution Plan Ref:** `docs/operational-intelligence-phase1a-execution.md`
**Baseline Ref:** `docs/operational-intelligence-baseline-v1.2.md`

---

## Implementation Steps

### STEP 1 — DB Schema & Migration
- [x] Add `pgEnum` and `index` to `shared/schema.ts` imports
- [x] Add 10 OI enums to `shared/schema.ts` (`oi_issue_status`, `oi_severity`, `oi_category`, `oi_project_phase`, `oi_probability_level`, `oi_impact_level`, `oi_risk_rating`, `oi_criticality_level`, `oi_escalation_type`, `oi_audit_action`)
- [x] Add `oi_issues` table to `shared/schema.ts` (74 columns; composite index approved)
- [x] Add `oi_audit_log` table to `shared/schema.ts`
- [x] Add `oi_escalations` table to `shared/schema.ts`
- [x] Add `oi_risk_weight_config` table to `shared/schema.ts`
- [x] Add `oi_risk_matrix_config` table to `shared/schema.ts`
- [x] Schema pushed to DB via `psql` (drizzle-kit push hangs on large schema; direct SQL used)
- [x] All 10 enums verified in DB (`SELECT pg_enum…`)
- [x] All 5 tables verified in DB (`information_schema.tables`)
- [x] 19 indexes created on `oi_issues`, `oi_audit_log`, `oi_escalations`
- [ ] Seed `oi_risk_weight_config` (1 row, default weights) — via API config PUT; seeded on first config save
- [ ] Seed `oi_risk_matrix_config` (25 rows) — seeded via OI Config page on first load

### STEP 2 — Server Services
- [x] Create `server/oi-audit-service.ts` — `writeAuditLog()` helper
- [x] Create `server/oi-transition-service.ts` — state machine + role validation + `getAllowedTransitions()`
- [x] Create `server/oi-escalation-service.ts` — 5 escalation triggers with notification dispatch

### STEP 3 — API Routes
- [x] Create `server/oi-routes.ts` — all 21 endpoints (create, list, get, patch, transition, severity-change, assign, withdraw, reopen, audit, escalations, escalate, 5 dashboard endpoints, 4 config endpoints)
- [x] Create `server/oi-scheduler.ts` — SLA breach check cron (runs hourly)
- [x] Register `app.use('/api/oi', ensureAuthenticated, oiRouter)` in `server/routes.ts` — **confirmed "OI routes registered" in server logs**
- [x] Register `startOiScheduler()` in `server/index.ts` — **confirmed "[OI Scheduler] Started" in server logs**

### STEP 4 — UI Pages
- [x] Create `client/src/pages/oi/oi-dashboard.tsx` — KPI cards, by-status breakdown, recent issues, quick actions
- [x] Create `client/src/pages/oi/oi-issue-register.tsx` — filterable issue list (severity/status/category/SLA/search)
- [x] Create `client/src/pages/oi/oi-issue-capture.tsx` — full capture form with S1 escalation warning
- [x] Create `client/src/pages/oi/oi-issue-detail.tsx` — full detail view, transition buttons, audit log, risk/SLA panels
- [x] Create `client/src/pages/oi/oi-issue-classify.tsx` — classification form (assignment, risk, criticality)
- [x] Create `client/src/pages/oi/oi-config.tsx` — risk weight config + interactive 5×5 risk matrix (Superuser only)

### STEP 5 — Navigation & Routing
- [x] Create `client/src/loaders/oi.ts` — lazy loader for all 6 OI pages
- [x] Add 6 OI routes to `client/src/App.tsx` (`/oi`, `/oi/issues`, `/oi/issues/new`, `/oi/issues/:id/classify`, `/oi/issues/:id`, `/oi/config`)
- [x] Add `isOIMenuOpen` state to `layout.tsx`
- [x] Add `isOnOIPage` detection to `layout.tsx`
- [x] Add OI auto-open to `useEffect` in `layout.tsx`
- [x] Add `ActivitySquare` icon import to `layout.tsx`
- [x] Add "Operational Intelligence" submenu to `menuItems` in `layout.tsx` (Dashboard, Issue Register, Report Issue, Configuration)

### STEP 6 — Smoke Tests
- [x] Auth gate: unauthenticated `/api/oi/dashboard/summary` returns 401 ✅
- [x] Auth gate: unauthenticated `/api/oi/issues` returns 401 ✅
- [x] Auth gate: unauthenticated `/api/oi/config/risk-weights` returns 401 ✅
- [ ] Create issue: POST returns 201 with generated issue_number (OI-{YYYY}-{NNNN})
- [ ] Forbidden transition: Employee attempt returns 403
- [ ] Manager classify: sets `response_due_at`; audit log written
- [ ] S1 escalation: `oi_escalations` row created
- [ ] Invalid transition: returns 422 with `transition_not_allowed`
- [ ] S1 phase block: verified attempt returns 422 with `phase_not_implemented`
- [ ] Audit immutability: no UPDATE/DELETE routes for audit_log
- [ ] Risk score: PATCH `probability_level` + `impact_level` → `risk_score` computed server-side
- [ ] Dashboard: returns valid JSON for authenticated user
- [ ] Config gate: Employee PUT `/api/oi/config/risk-weights` returns 403

---

## Files Created / Modified

| File | Action | Status |
|---|---|---|
| `shared/schema.ts` | MODIFIED — added pgEnum, index imports + 5 tables + 10 enums | DONE |
| `server/oi-audit-service.ts` | CREATED | DONE |
| `server/oi-transition-service.ts` | CREATED | DONE |
| `server/oi-escalation-service.ts` | CREATED | DONE |
| `server/oi-routes.ts` | CREATED | DONE |
| `server/oi-scheduler.ts` | CREATED | DONE |
| `server/routes.ts` | MODIFIED — OI router registered | DONE |
| `server/index.ts` | MODIFIED — OI scheduler started | DONE |
| `client/src/loaders/oi.ts` | CREATED | DONE |
| `client/src/App.tsx` | MODIFIED — 6 OI routes added | DONE |
| `client/src/components/layout.tsx` | MODIFIED — OI nav submenu added | DONE |
| `client/src/pages/oi/oi-dashboard.tsx` | CREATED | DONE |
| `client/src/pages/oi/oi-issue-register.tsx` | CREATED | DONE |
| `client/src/pages/oi/oi-issue-capture.tsx` | CREATED | DONE |
| `client/src/pages/oi/oi-issue-detail.tsx` | CREATED | DONE |
| `client/src/pages/oi/oi-issue-classify.tsx` | CREATED | DONE |
| `client/src/pages/oi/oi-config.tsx` | CREATED | DONE |

---

## Progress Log

| Date | Step | Action | Result |
|---|---|---|---|
| 21-May-2026 | All | Phase 1A approved for implementation | — |
| 21-May-2026 | STEP 1 | 10 enums + 5 tables in schema.ts; pushed via psql | DONE |
| 21-May-2026 | STEP 2 | 3 server services created | DONE |
| 21-May-2026 | STEP 3 | 21 API endpoints + scheduler + router registered | DONE |
| 21-May-2026 | STEP 4 | 6 UI pages created | DONE |
| 21-May-2026 | STEP 5 | OI loader + 6 routes in App.tsx + nav submenu in layout.tsx | DONE |
| 21-May-2026 | SMOKE | Auth gate: 3/3 endpoints return 401 unauthenticated | PASS |
