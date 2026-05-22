# Operational Intelligence — Phase 3B Execution Plan

**Status:** SUBMITTED FOR APPROVAL — DO NOT IMPLEMENT  
**Date:** 2026-05-23  
**Phase 3A Baseline:** `docs/operational-intelligence-phase3a-execution.md` (CLOSED)  
**OI Baseline:** `docs/OI-Baseline-v1.2-FINAL.md` §30–31  
**Phase 3B Scope:** Full Analytics Suite — Analytics Hub page + 14 dashboard panels + backend analytics routes  
**Prepared by:** Architecture review session  

---

## Governance Rules (Non-Negotiable — inherited from all prior phases)

- No assumptions. Every field and behaviour is explicitly stated in this document.
- All enforcement is server-side. UI validation is supplementary only.
- All timestamps stored as UTC. Displayed as IST using `fmtDate` / `fmtDateTime`.
- **Schema migration: none required in Phase 3B.** All analytics are aggregation queries on existing tables.
- **All prior phase server-side rules remain fully active.** Phase 3B does not modify or relax any prior rule.
- `MANAGER_ROLES` = `['Manager', 'Senior Manager', 'General Manager', 'Superuser']`.
- All analytics endpoints are GET-only. No mutations in Phase 3B.
- No new DB tables. No Drizzle schema changes. No psql migration.

---

## Explicit Exclusions — Forbidden in Phase 3B Code

| Category | Prohibited |
|---|---|
| AI / ML analytics | No LLM-generated insights, no ML scoring, no embedding-based correlation |
| Predictive analytics | No trend forecasting, no alert generation, no pattern detection (Phase 4B) |
| Prevention alerts | No `oi_prevention_alerts` creation or display (Phase 4A) |
| New DB tables | No CREATE TABLE statements in Phase 3B |
| Mutation endpoints | No POST/PATCH/DELETE in analytics routes |
| External charting libraries | No Recharts, Chart.js, D3 — stat cards and tables only (consistent with Phase 1E–3A) |
| Email notifications | No SendGrid dispatch |
| File attachments | No GCS uploads |
| Phase 1E rewrites | Do not modify the existing Command Centre dashboard (`oi-dashboard.tsx`) |

---

## Future-Phase Leakage Guard

| Prohibited Pattern | Reason |
|---|---|
| `oi_prevention_alerts` table reads | Phase 4A only |
| OpenAI API calls from analytics routes | Phase 4A only |
| Cross-project ML correlation scoring | Phase 4B only |
| Legal hold logic | Phase 5A only |
| Business Continuity Dashboard | Phase 5A only |

---

## Phase 3B Scope

### In Scope

| Item | Detail |
|---|---|
| Analytics Hub page | New page at `/oi/analytics` — 14-tab dashboard |
| Backend analytics routes | New file `server/oi-analytics-routes.ts` — 14 GET endpoints |
| Sidebar entry | "Analytics" entry in OI section of `layout.tsx` |
| Routing + loader | `/oi/analytics` route in `App.tsx`, lazy loader in `loaders/oi.ts` |
| 14 dashboard panels | Listed in §3 below |

### Not In Scope

- Command Centre Dashboard changes (Phase 1E — complete)
- Repeat Failure Dashboard (Phase 3A — complete, in existing dashboard)
- CAPA Effectiveness Dashboard (Phase 3A — complete)
- SOP Effectiveness Dashboard (Phase 3A — complete)
- Business Continuity Dashboard (Phase 5A)

---

## 1. Data Foundation

All 14 analytics endpoints query **existing** OI tables only. No new tables.

| Source Table | Used By |
|---|---|
| `oi_issues` | All 14 dashboards (primary source) |
| `oi_capa_records`, `oi_capa_actions` | COPQ, Delay Intelligence |
| `oi_lesson_records` | Cross-referenced in Margin Erosion |
| `projects` | Project Risk Heatmap |
| `vendors` | Vendor Reliability |
| `customers` | Customer Complaint |

### Confirmed field availability on `oi_issues` (from `shared/schema.ts`)

| Analytics Area | Fields Available |
|---|---|
| Project linkage | `project_id`, `risk_rating`, `risk_score`, `oi_risk_score`, `business_criticality`, `financial_criticality`, `schedule_criticality` |
| Vendor linkage | `vendor_id` (FK → `vendors.id`) |
| Customer linkage | `customer_id` (FK → `customers.id`), `customer_criticality`, `customer_industry`, `warranty_claim_flag` |
| Equipment | `equipment_family`, `equipment_type`, `package_type`, `critical_equipment_flag` |
| Site/Commissioning | `project_phase` enum, `fat_reference`, `sat_reference`, `punch_point_reference`, `readiness_status` |
| Financial | `estimated_loss_amount`, `actual_loss_amount`, `recovery_amount`, `net_financial_exposure`, `insurance_claim_flag`, `claim_reference` |
| Delay / SLA | `capture_delay_hours`, `response_time_actual_hours`, `investigation_duration_hours`, `total_resolution_hours`, `response_sla_breached`, `closure_sla_breached`, `response_due_at`, `closure_due_at` |
| Statutory | `statutory_criticality`, `statutory_authority`, `compliance_status`, `statutory_severity`, `legal_review_required` |
| Warranty | `warranty_claim_flag`, `warranty_claim_reference`, `liability_severity`, `liability_type` |
| Liability | `liability_severity`, `liability_type`, `indemnity_required`, `consequential_damage_flag`, `liability_score` |
| Consequential | `consequential_damage_flag`, `business_interruption_flag`, `estimated_loss_amount`, `actual_loss_amount` |
| Insurance | `insurance_claim_flag`, `claim_reference`, `recovery_amount`, `net_financial_exposure` |
| Margin | `net_financial_exposure`, `actual_loss_amount`, `recovery_amount` |

---

## 2. Backend Routes (`server/oi-analytics-routes.ts`)

New file. GET-only. All routes require `requireAuth` middleware. No role restriction on read.

Default rolling window: `periodDays=90` query param on all applicable endpoints.

### Endpoint Register (14 endpoints)

| # | Endpoint | Returns | Source |
|---|---|---|---|
| 1 | `GET /api/oi/analytics/project-risk-heatmap` | Issues per project with risk_rating distribution + open counts | `oi_issues` LEFT JOIN `projects` |
| 2 | `GET /api/oi/analytics/vendor-reliability` | Issues per vendor: count, severity breakdown, avg resolution hours | `oi_issues` LEFT JOIN `vendors` WHERE `vendor_id IS NOT NULL` |
| 3 | `GET /api/oi/analytics/customer-complaint` | Issues per customer: count, warranty claims, avg criticality | `oi_issues` LEFT JOIN `customers` WHERE `customer_id IS NOT NULL` |
| 4 | `GET /api/oi/analytics/equipment-reliability` | Issues per equipment_family: count, severity breakdown, critical_equipment_flag rate | `oi_issues` WHERE `equipment_family IS NOT NULL` |
| 5 | `GET /api/oi/analytics/site-commissioning` | Issues in site/commissioning phases: FAT/SAT/punchlist refs, readiness_status breakdown | `oi_issues` WHERE `project_phase IN ('site','commissioning','fat','sat','punch_list','handover')` |
| 6 | `GET /api/oi/analytics/copq` | Total estimated + actual loss; breakdown by category and severity | `oi_issues` WHERE `estimated_loss_amount IS NOT NULL OR actual_loss_amount IS NOT NULL` |
| 7 | `GET /api/oi/analytics/financial-exposure` | Open financial exposure: estimated vs actual vs recovered; insurance flag breakdown | `oi_issues` |
| 8 | `GET /api/oi/analytics/delay-intelligence` | SLA breach counts, avg delay hours by category; worst offenders | `oi_issues` |
| 9 | `GET /api/oi/analytics/compliance-statutory` | Issues by statutory_criticality, compliance_status, legal_review_required flag | `oi_issues` |
| 10 | `GET /api/oi/analytics/warranty` | Warranty claims: count, open vs resolved, claim reference list | `oi_issues` WHERE `warranty_claim_flag = true` |
| 11 | `GET /api/oi/analytics/liability-exposure` | Issues by liability_severity, indemnity_required, consequential_damage_flag | `oi_issues` |
| 12 | `GET /api/oi/analytics/consequential-damage` | Issues with consequential_damage_flag or business_interruption_flag: loss totals | `oi_issues` WHERE `consequential_damage_flag = true OR business_interruption_flag = true` |
| 13 | `GET /api/oi/analytics/insurance-recovery` | Insurance claims: total exposure, total recovered, net exposure, open claims | `oi_issues` WHERE `insurance_claim_flag = true` |
| 14 | `GET /api/oi/analytics/margin-erosion` | Net financial exposure totals by project, category, and period | `oi_issues` WHERE `net_financial_exposure IS NOT NULL` |

### Response shape (all endpoints)

Each endpoint returns a single JSON object with top-level keys appropriate to the dashboard. No pagination. All amounts in INR (as stored). Period filtering via `?periodDays=N` (default 90, applied to `created_at`).

---

## 3. Analytics Hub Page (`client/src/pages/oi/oi-analytics.tsx`)

### Route
`/oi/analytics`

### Layout
- Single page, `p-4 space-y-4` container
- Page header: "OI Analytics Hub" with subtitle and period selector (30 / 60 / 90 / 180 / 365 days)
- 14 collapsible sections (one per dashboard) — collapsed by default, expand on click
- OR: 14-tab layout — one tab per dashboard group

**Decision: Tab layout**, grouped into 5 logical tab groups (to keep tabs manageable):

| Tab | Dashboards Included |
|---|---|
| **Risk** | Project Risk Heatmap |
| **Financial** | COPQ, Financial Exposure, Margin Erosion |
| **Reliability** | Vendor Reliability, Customer Complaint, Equipment Reliability |
| **Compliance** | Compliance / Statutory, Warranty, Liability, Consequential Damage, Insurance Recovery |
| **Operations** | Site / Commissioning, Delay Intelligence |

### Period Selector
- Shared state across all tabs
- Options: `30d` / `60d` / `90d` / `180d` / `365d` (buttons, not dropdown)
- Default: `90d`
- All `useQuery` calls pass `?periodDays={N}` — queryKey includes periodDays for correct cache isolation

### Dashboard Panel Pattern (consistent with Phase 1E–3A)

Each dashboard panel:
- `Card` with `border-l-4` colored stripe (color by tab group)
- `CardHeader` with icon + title + "period" badge
- `CardContent` with:
  - Summary stat row (3–4 large numbers)
  - Detail table or breakdown grid (max 10 rows)
  - Empty state message when no data

### Color scheme by tab group

| Tab | Border color | Icon |
|---|---|---|
| Risk | `border-l-red-400` | `ShieldAlert` |
| Financial | `border-l-amber-400` | `DollarSign` |
| Reliability | `border-l-blue-400` | `Truck` / `Users` / `Zap` |
| Compliance | `border-l-purple-400` | `Scale` / `ShieldCheck` |
| Operations | `border-l-slate-400` | `Clock` / `Activity` |

---

## 4. Sidebar Integration

File: `client/src/components/layout.tsx`  
Entry: `{ icon: BarChart3, label: "Analytics", href: "/oi/analytics" }`  
Position: After "Lessons Learned" in the OI section  
Icon: `BarChart3` (already imported)  

---

## 5. Routing + Loader

### `client/src/loaders/oi.ts`
```typescript
export const OiAnalyticsPage = lazyWithRetry(() => import("@/pages/oi/oi-analytics"));
```

### `client/src/App.tsx`
```
<ProtectedRoute path="/oi/analytics" component={() => <OI.OiAnalyticsPage />} />
```
Registered after `/oi/lessons`.

---

## 6. Task Register

| ID | Title | Files | Blocked By |
|---|---|---|---|
| T001 | Analytics routes (14 GET endpoints) | `server/oi-analytics-routes.ts` | None |
| T002 | Register analytics routes in server/routes.ts | `server/routes.ts` | T001 |
| T003 | Analytics Hub page (5-tab, 14 panels) | `client/src/pages/oi/oi-analytics.tsx` | T001 |
| T004 | Sidebar + loader + App.tsx route | `layout.tsx`, `loaders/oi.ts`, `App.tsx` | T003 |
| T005 | Validation + tracker + zero-trust audit + evidence package | `docs/` | T004 |

---

## 7. Explicit Non-Changes

The following files are **not modified** in Phase 3B:

- `shared/schema.ts` — no schema changes
- `server/oi-lesson-routes.ts` — Phase 3A, closed
- `server/oi-enforcement-routes.ts` — Phase 2B, closed
- `server/oi-sop-routes.ts` — Phase 2A, closed
- `client/src/pages/oi/oi-dashboard.tsx` — Phase 1E/2A/2B/3A, not touched
- All payroll, leave, SAP, GCS, PPPC routes — explicitly unchanged

---

## 8. DB Migration

**None.** Phase 3B adds no tables, no columns, no indexes, no enum values.

---

## Summary

| Item | Count |
|---|---|
| New server files | 1 (`oi-analytics-routes.ts`) |
| Modified server files | 1 (`routes.ts` — one line) |
| New client files | 1 (`oi-analytics.tsx`) |
| Modified client files | 3 (`layout.tsx`, `loaders/oi.ts`, `App.tsx`) |
| New DB tables | 0 |
| DB migration | None |
| New API endpoints | 14 (GET-only) |

**Phase 3B may begin upon approval of this document.**
