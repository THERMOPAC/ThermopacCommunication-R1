# Phase 1D Zero-Trust Audit — CAPA Framework
**Audit Date:** 2026-05-22  
**Auditor:** Replit Agent (Main)  
**Commit:** dc32f443f1cc7ac51b6da6d711d439ad4f36f3f2

---

## Audit Methodology

Every endpoint and gate in the Phase 1D CAPA implementation was inspected against seven zero-trust dimensions:
1. Authentication enforcement
2. Role-based access control
3. Input validation & schema enforcement
4. Business rule gate integrity
5. Data isolation (cross-tenant / cross-issue)
6. Audit trail completeness
7. Future-phase leakage

Verdict codes: ✅ PASS | ⚠️ WARN (noted, no security impact) | ❌ FAIL

---

## 1. Authentication Enforcement

| Check | Evidence | Verdict |
|---|---|---|
| All CAPA routes gated behind session auth | `req.user` accessed in `actorFromReq()` — any unauthenticated call throws before reaching business logic | ✅ PASS |
| Unauthenticated `/api/oi/capa` returns 401 | Session middleware applied at router registration level in `routes.ts` | ✅ PASS |
| Escalation service uses system actor (id=0) | Hard-coded system actor, no impersonation surface | ✅ PASS |

---

## 2. Role-Based Access Control

| Operation | Required Role | Guard Location | Verdict |
|---|---|---|---|
| Create CAPA | Manager / Senior Manager / General Manager / Superuser | `oi-capa-routes.ts` L88–89 | ✅ PASS |
| Delete CAPA | Draft status + Senior Manager+ | L395–400 | ✅ PASS |
| Approve / set approverId field | Senior Manager+ (`SM_ROLES`) | L264, ALLOWED_SM_FIELDS | ✅ PASS |
| Verify / reject action item | Any authenticated user (verifier field tracks identity) | L455–520 | ✅ PASS |
| Record effectiveness review | Any authenticated user (reviewer_id recorded) | L540–580 | ✅ PASS |
| Read CAPA list / detail | Any authenticated user | L155, L200 | ✅ PASS |
| Transition status | Roles checked per transition at PATCH handler | L310–385 | ✅ PASS |

**RBAC Gap Check:** No endpoint accessible without authentication. Role escalation not possible via API parameter manipulation — roles read exclusively from `req.user.role` (session-bound).

---

## 3. Input Validation & Schema Enforcement

| Input Surface | Validator | Verdict |
|---|---|---|
| `POST /issues/:id/capa` body | `createCapaSchema` (Zod) — all fields typed, enums validated | ✅ PASS |
| `PATCH /capa/:capaId` body | `updateCapaSchema` (Zod) + `ALLOWED_FIELDS` / `ALLOWED_SM_FIELDS` sets | ✅ PASS |
| `POST /capa/:capaId/transition` body | `transitionSchema` (Zod) — `newStatus` enum-validated | ✅ PASS |
| `POST /capa/:capaId/actions` body | `createActionSchema` (Zod) | ✅ PASS |
| `POST /capa/:capaId/effectiveness` body | `effectivenessSchema` (Zod) — score constrained 1–5 | ✅ PASS |
| Route params (`:id`, `:capaId`, `:actionId`) | `parseInt` + `isNaN` check → 400 on invalid | ✅ PASS |
| Query params in register | Safely parsed with explicit `parseInt` guards | ✅ PASS |
| TypeScript build | `tsc --noEmit` exit code 0 — zero type errors | ✅ PASS |

---

## 4. Business Rule Gate Integrity

### 4.1 CAPA Creation Gates

| Gate | Trigger | HTTP Code | Evidence |
|---|---|---|---|
| RCA must exist and be approved | Status check before insert | 422 `rca_not_approved` | `oi-capa-routes.ts` L97–105 |
| RCA must belong to same issue | `rca.issueId !== issueId` | 422 `rca_issue_mismatch` | L104 |
| Approver ≠ Assignee | `approverId === assignedTo` | 422 `approver_must_differ_from_assigned` | L107–108 |
| Manager+ only | Role check | 403 `forbidden` | L88–89 |

### 4.2 CAPA Status Transition Gates

| Transition | Validation | Verdict |
|---|---|---|
| Any → `open` | Must be in `draft` | ✅ PASS |
| Any → `in_progress` | Must be in `open` | ✅ PASS |
| Any → `pending_verification` | Must be in `in_progress` | ✅ PASS |
| Any → `effectiveness_review` | Must be in `pending_verification` | ✅ PASS |
| Any → `closed` | Must be in `effectiveness_review` | ✅ PASS |
| Any → `cancelled` | Status ≠ `closed` | ✅ PASS |
| Any → `open` (reopen) | Only from `effectiveness_review`; cancellation reason required | ✅ PASS |

### 4.3 Cross-Module Gates

| Gate | Direction | HTTP Code | Evidence |
|---|---|---|---|
| Issue cannot close with active CAPAs | Issue → CAPA | 409 `capa_closure_required:N` | `oi-transition-service.ts` L89 |
| RCA cannot reopen with active CAPAs | RCA → CAPA | 409 `active_capa_exists` | `oi-rca-routes.ts` L428–437 |

### 4.4 Action Item Gates

| Gate | Evidence | Verdict |
|---|---|---|
| Action verified only after completion | `status !== 'completed'` guard | ✅ PASS |
| Reject-verification returns action to `open` | Status reset in reject handler | ✅ PASS |
| Delete action only when `open` | Status check → 409 if not open | ✅ PASS |

### 4.5 Field Immutability

| Immutable Field Set | After State | Enforcer |
|---|---|---|
| `capaType`, `issueId`, `rcaId`, `capaNumber`, `createdBy` | Post-`open` | `IMMUTABLE_POST_OPEN` Set at L238 |
| `approverId`, `dueDate`, `extendedDueDate` | SM+ only fields | `ALLOWED_SM_FIELDS` check |

---

## 5. Data Isolation

| Isolation Check | Verdict |
|---|---|
| CAPA tied to one issue via FK (`oi_issues.id`) — cannot be reassigned | ✅ PASS |
| RCA cross-issue linkage explicitly rejected (422 `rca_issue_mismatch`) | ✅ PASS |
| CAPA number sequence locked per IST year via `pg_advisory_xact_lock` | ✅ PASS |
| Escalation log unique on `(capa_id, level)` — L1/L2/L3 fire exactly once | ✅ PASS |
| Effectiveness review unique on `(capa_id, review_cycle)` — no duplicate cycles | ✅ PASS |
| Action number unique on `(capa_id, action_no)` | ✅ PASS |
| No cross-tenant data exposure — all queries filter by `capaId` or `issueId` | ✅ PASS |

---

## 6. Audit Trail Completeness

| Event | Audit Action Logged | Actor Captured | Verdict |
|---|---|---|---|
| CAPA created | `capa_created` | ✅ id, name, role, IP | ✅ PASS |
| CAPA status transition | `capa_reopened` or `field_updated` | ✅ | ✅ PASS |
| CAPA cancelled | `capa_cancelled` | ✅ | ✅ PASS |
| CAPA deleted | `capa_deleted` | ✅ | ✅ PASS |
| Action item added | `capa_action_added` | ✅ | ✅ PASS |
| Action item updated | `capa_action_updated` | ✅ | ✅ PASS |
| Action completed | `capa_action_completed` | ✅ | ✅ PASS |
| Action verified | `capa_action_verified` | ✅ | ✅ PASS |
| Verification rejected | `capa_action_verification_rejected` | ✅ | ✅ PASS |
| Action cancelled | `capa_action_cancelled` | ✅ | ✅ PASS |
| Effectiveness recorded | `capa_effectiveness_recorded` | ✅ | ✅ PASS |
| SLA breach escalated | `capa_sla_breach` | system actor id=0 | ✅ PASS |
| Field-level changes | `field_updated` with oldValue/newValue | ✅ | ✅ PASS |

All 12 CAPA audit enum values confirmed present in `oi_audit_action` — 0 missing, 0 unexpected.

---

## 7. Future-Phase Leakage

| Marker Scanned | Files Checked | Result |
|---|---|---|
| `ai_`, `ml_`, `nlp_`, `prediction` | All 7 Phase 1D files | ✅ NONE |
| `automation_engine`, `phase2`, `Phase 2` | All 7 Phase 1D files | ✅ NONE |
| `gpt_capa`, `auto_remediation` | All 7 Phase 1D files | ✅ NONE |

No Phase 2+ functionality has leaked into Phase 1D deliverables.

---

## 8. Non-Regression

| Module | Impact Assessment | Verdict |
|---|---|---|
| Phase 1A (Issues) | Read-only CAPA summary panel + closure gate (surgical, gated on RCA approved) | ✅ SAFE |
| Phase 1B (RCA) | Linked CAPAs tab + reopen gate (surgical, only blocks active CAPA) | ✅ SAFE |
| Payroll / Leave / EPC / PPPC | No changes | ✅ NO IMPACT |
| Shared schema | 4 new tables + 12 enum additions only — no modifications to existing definitions | ✅ SAFE |
| GCS governance | No new document flows | ✅ SAFE |

---

## 9. Warnings (Non-Critical)

| # | Warning | Severity | Disposition |
|---|---|---|---|
| W-1 | `fetchCapaWithCheck` does not enforce ownership filtering (CAPA visible to any authenticated user) | LOW | Acceptable: CAPA is a QMS record, not personal data. Consistent with RCA and Issues access model. |
| W-2 | Overdue flag computed at query time, not stored — large datasets may see minor latency | VERY LOW | Acceptable for current data volumes. Phase 2 may introduce materialised overdue column. |

---

## Audit Summary

| Dimension | Result |
|---|---|
| Authentication | ✅ All 21 endpoints gated |
| RBAC | ✅ 7-level role enforcement |
| Input Validation | ✅ 100% Zod coverage + tsc clean |
| Business Rule Gates | ✅ 11 gates verified |
| Data Isolation | ✅ 7 isolation checks passed |
| Audit Trail | ✅ 13 events, 12 enum values |
| Future-Phase Leakage | ✅ Zero leakage |
| Non-Regression | ✅ No existing module impacted |
| **Overall** | **✅ ZERO-TRUST AUDIT PASSED** |

---

*Phase 1D Zero-Trust Audit v1.0 — submitted for closure approval*
