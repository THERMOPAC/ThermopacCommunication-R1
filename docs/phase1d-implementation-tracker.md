# Phase 1D Implementation Tracker — CAPA Framework
**Status:** COMPLETE — Awaiting Closure Approval  
**Date:** 2026-05-22  
**Prepared by:** Replit Agent (Main)  
**Commit:** dc32f443f1cc7ac51b6da6d711d439ad4f36f3f2

---

## 1. Scope

Phase 1D delivers the full Corrective & Preventive Action (CAPA) framework integrated into the OI module. It builds on the approved RCA foundation from Phase 1C and gates future OI closure and reopen workflows on CAPA state.

---

## 2. Deliverable Inventory

### 2.1 Database Layer

| Artifact | Type | Status | Notes |
|---|---|---|---|
| `oi_capa_records` | Table (26 cols) | ✅ LIVE | 7-state lifecycle, advisory-lock CAPA number, 8 indexes |
| `oi_capa_actions` | Table (17 cols) | ✅ LIVE | Action items with 3-step verify workflow |
| `oi_capa_effectiveness` | Table (10 cols) | ✅ LIVE | Post-closure review cycles, score 1–5 |
| `oi_capa_escalation_log` | Table (4 cols) | ✅ LIVE | One-shot L1/L2/L3 escalation, unique (capa_id, level) |
| `oi_audit_action` enum | 12 new values | ✅ LIVE | All 12 CAPA audit actions verified, 0 missing |

**Total indexes across 4 tables:** 18 (including 4 unique constraints)

### 2.2 Server Layer

| File | Lines | Routes | Status | Purpose |
|---|---|---|---|---|
| `server/oi-capa-routes.ts` | 759 | 21 | ✅ NEW | All CAPA endpoints |
| `server/oi-capa-escalation-service.ts` | 108 | — | ✅ NEW | Nightly SLA escalation cron |
| `server/oi-transition-service.ts` | 105 | — | ✅ PATCHED | CAPA closure gate added |
| `server/oi-rca-routes.ts` | 1115 | — | ✅ PATCHED | CAPA reopen gate added |
| `server/routes.ts` | — | — | ✅ PATCHED | `oiCapaRouter` registered |
| `server/index.ts` | — | — | ✅ PATCHED | Escalation scheduler wired |

### 2.3 API Route Inventory (21 endpoints)

| # | Method | Path | Purpose |
|---|---|---|---|
| 1 | POST | `/api/oi/issues/:id/capa` | Create CAPA (Manager+) |
| 2 | GET | `/api/oi/issues/:id/capa` | List CAPAs for issue |
| 3 | GET | `/api/oi/capa` | Global CAPA register (filter: status, priority, type, assignedTo, issueId, rcaId, overdueOnly, search) |
| 4 | GET | `/api/oi/capa/:capaId` | CAPA detail with action summary, effectiveness summary |
| 5 | PATCH | `/api/oi/capa/:capaId` | Update CAPA fields (field-level immutability enforced post-open) |
| 6 | POST | `/api/oi/capa/:capaId/transition` | Status transition with validation |
| 7 | DELETE | `/api/oi/capa/:capaId` | Delete CAPA (draft only, SM+) |
| 8 | POST | `/api/oi/capa/:capaId/actions` | Add action item |
| 9 | GET | `/api/oi/capa/:capaId/actions` | List action items |
| 10 | PATCH | `/api/oi/capa/:capaId/actions/:actionId` | Update action item |
| 11 | POST | `/api/oi/capa/:capaId/actions/:actionId/complete` | Mark action complete |
| 12 | POST | `/api/oi/capa/:capaId/actions/:actionId/verify` | Verifier approves action |
| 13 | POST | `/api/oi/capa/:capaId/actions/:actionId/reject-verification` | Verifier rejects action |
| 14 | POST | `/api/oi/capa/:capaId/actions/:actionId/cancel` | Cancel action item |
| 15 | DELETE | `/api/oi/capa/:capaId/actions/:actionId` | Delete action (open status only) |
| 16 | POST | `/api/oi/capa/:capaId/effectiveness` | Record effectiveness review |
| 17 | GET | `/api/oi/capa/:capaId/effectiveness` | Get effectiveness history |
| 18 | GET | `/api/oi/dashboard/capa-summary` | Overview KPIs (90-day window) |
| 19 | GET | `/api/oi/dashboard/capa-by-type` | Type breakdown chart |
| 20 | GET | `/api/oi/dashboard/capa-sla` | SLA adherence + escalation counts |
| 21 | GET | `/api/oi/dashboard/capa-effectiveness` | Effectiveness rate + recurrence |

### 2.4 Client Layer

| File | Lines | Status | Purpose |
|---|---|---|---|
| `client/src/pages/oi/oi-capa-constants.ts` | 96 | ✅ NEW | Labels, colours, priority/type maps |
| `client/src/pages/oi/oi-capa-register.tsx` | 268 | ✅ NEW | Global CAPA register with filters |
| `client/src/pages/oi/oi-capa-detail.tsx` | 681 | ✅ NEW | Full detail: workflow, actions, effectiveness, audit |
| `client/src/pages/oi/oi-issue-detail.tsx` | 716 | ✅ PATCHED | `CapaSummaryCard` injected after RCA card |
| `client/src/pages/oi/oi-rca-page.tsx` | 824 | ✅ PATCHED | `LinkedCapaTab` + "Linked CAPAs" tab trigger |
| `client/src/pages/oi/oi-dashboard.tsx` | 746 | ✅ PATCHED | `CapaDashboardPanels` (4 cards) + CAPA quick-action |
| `client/src/components/layout.tsx` | — | ✅ PATCHED | "CAPA Register" sidebar entry |
| `client/src/App.tsx` | — | ✅ PATCHED | `/oi/capa/:capaId` and `/oi/capa` routes |

---

## 3. Business Rules Implemented

| Rule | Implementation | Location |
|---|---|---|
| CAPA requires approved RCA | RCA status check at creation | `oi-capa-routes.ts` L97–105 |
| CAPA belongs to same issue as RCA | `rca.issueId !== issueId` → 422 `rca_issue_mismatch` | `oi-capa-routes.ts` L104 |
| Approver ≠ Assignee | `approverId === assignedTo` → 422 | `oi-capa-routes.ts` L107–108 |
| CAPA number uniqueness | `pg_advisory_xact_lock(hashtext('capa_number_seq'))` + unique constraint | `oi-capa-routes.ts` L61–70 |
| Issue closure blocked by active CAPAs | `capa_closure_required:N` 409 | `oi-transition-service.ts` L89 |
| RCA reopen blocked by active CAPAs | `active_capa_exists` 409 | `oi-rca-routes.ts` L428–437 |
| Field immutability post-open | `IMMUTABLE_POST_OPEN` Set blocks `capaType/issueId/rcaId/capaNumber/createdBy` | `oi-capa-routes.ts` L238 |
| SLA escalation one-shot | Unique constraint `(capa_id, level)` on `oi_capa_escalation_log` | DB unique constraint |
| Escalation timing | L1: 1–6d OD, L2: 7–13d, L3: 14+d; fired at 01:00 IST nightly | `oi-capa-escalation-service.ts` |
| CAPA creation gated to Manager+ | `MANAGER_ROLES` check → 403 | `oi-capa-routes.ts` L88–89 |
| Effectiveness review per cycle | Unique constraint `(capa_id, review_cycle)` | DB unique constraint |

---

## 4. State Machine

```
draft ──→ open ──→ in_progress ──→ pending_verification ──→ effectiveness_review ──→ closed
  │         │           │                    │                         │
  └─cancel  └─cancel    └─cancel             ├─back to in_progress     └─reopen → open
                                             └─cancel
```

---

## 5. Total LOC Delta

| Category | Lines Added/Modified |
|---|---|
| New server files | 867 |
| Patched server files | ~30 (gates + wiring) |
| New client files | 1,045 |
| Patched client files | ~180 (panels + tabs) |
| **Total Phase 1D delta** | **~2,122 lines** |

---

## 6. Dependencies & Non-Regressions

- **Phase 1A–1C** untouched except surgical gate insertions in transition-service and rca-routes
- **Payroll, Leave, EPC, PPPC, Finance modules** — no changes
- **GCS governance** — no new document flows introduced
- **Shared schema** — 4 new tables + 12 enum additions, no modifications to existing definitions

---

*Phase 1D tracker v1.0 — submitted for closure approval*
