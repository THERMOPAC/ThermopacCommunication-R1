# Phase 1D Evidence Package — CAPA Framework
**Date:** 2026-05-22  
**Commit:** dc32f443f1cc7ac51b6da6d711d439ad4f36f3f2  
**Prepared by:** Replit Agent (Main)

---

## Evidence Index

| # | Validation | Method | Result |
|---|---|---|---|
| E-01 | Build validation | `tsc --noEmit` | ✅ PASS — EXIT:0, zero type errors |
| E-02 | DB table validation | Live DB introspection | ✅ PASS — 4 tables, correct schema |
| E-03 | Audit enum validation | `pg_enum` query | ✅ PASS — 12/12 values, 0 missing |
| E-04 | CAPA route validation | Source grep | ✅ PASS — 21 endpoints |
| E-05 | CAPA workflow validation | Source analysis | ✅ PASS — advisory lock, transitions, number gen |
| E-06 | RCA/CAPA linkage validation | Source + DB FK | ✅ PASS — rca_id FK + 422 guard |
| E-07 | RCA reopen block validation | Source grep | ✅ PASS — 409 at `oi-rca-routes.ts` L437 |
| E-08 | Issue closure block validation | Source grep | ✅ PASS — 409 at `oi-transition-service.ts` L89 |
| E-09 | CAPA action verification validation | Source analysis | ✅ PASS — verify/reject/complete flow |
| E-10 | Effectiveness review validation | Source analysis | ✅ PASS — score 1–5, recurrence flag |
| E-11 | Overdue escalation validation | Source analysis | ✅ PASS — L1/L2/L3, 01:00 IST, unique guard |
| E-12 | Unauthorized access validation | Source + RBAC analysis | ✅ PASS — all surfaces authenticated + role-gated |
| E-13 | Future-phase leakage validation | Marker scan | ✅ PASS — zero Phase 2+ markers |

---

## E-01 · Build Validation

**Command:** `npx tsc --noEmit`  
**Result:** `EXIT:0`  
**Output:** No lines matching `error TS` in oi-capa files  
**Verdict:** ✅ PASS — TypeScript compilation clean across all Phase 1D files

---

## E-02 · DB Table Validation

**Method:** Live PostgreSQL introspection via `information_schema`

### Table: `oi_capa_records` — 26 columns

```
id (integer), capa_number (text, UNIQUE), issue_id (integer, FK→oi_issues),
rca_id (integer, FK→oi_rca_records), capa_type (text), title (text),
description (text), root_cause_ref (text), priority (text),
assigned_to (integer, FK→users), verifier_id (integer, FK→users),
approver_id (integer, FK→users), status (text), due_date (timestamp),
extended_due_date (timestamp), opened_at (timestamp), in_progress_at (timestamp),
pending_verification_at (timestamp), effectiveness_review_at (timestamp),
closed_at (timestamp), cancelled_at (timestamp), cancellation_reason (text),
re_open_count (integer), created_by (integer, FK→users),
created_at (timestamp), updated_at (timestamp)
```

**Indexes (8):** `pkey`, `capa_number_key (UNIQUE)`, `idx_status`, `idx_issue_id`, `idx_rca_id`, `idx_assigned`, `idx_due_date`, `idx_priority`

### Table: `oi_capa_actions` — 17 columns

```
id, capa_id (FK→oi_capa_records), action_no, description, assigned_to (FK→users),
due_date, status, completed_at, completed_by (FK→users), completion_note,
verification_status, verified_at, verified_by (FK→users), verification_note,
created_by (FK→users), created_at, updated_at
```

**Unique:** `uq_capa_action_no (action_no, capa_id)`

### Table: `oi_capa_effectiveness` — 10 columns

```
id, capa_id (FK→oi_capa_records), review_cycle, reviewer_id (FK→users),
reviewed_at, effectiveness_score, is_effective, recurrence_observed,
evidence_notes, recommendation
```

**Unique:** `uq_capa_effectiveness_cycle (capa_id, review_cycle)`

### Table: `oi_capa_escalation_log` — 4 columns

```
id, capa_id (FK→oi_capa_records), level (1/2/3), fired_at
```

**Unique:** `uq_capa_escalation_level (capa_id, level)`

**Verdict:** ✅ PASS — All 4 tables present, 14 FKs verified, 4 unique constraints confirmed

---

## E-03 · Audit Enum Validation

**Method:** `pg_enum` live query against `oi_audit_action` type

**Total enum values:** 37 (25 pre-existing + 12 CAPA)

**CAPA values confirmed (12/12):**
```
capa_action_added, capa_action_cancelled, capa_action_completed,
capa_action_updated, capa_action_verification_rejected, capa_action_verified,
capa_cancelled, capa_created, capa_deleted, capa_effectiveness_recorded,
capa_reopened, capa_sla_breach
```

**Missing:** NONE  
**Unexpected extras:** NONE  
**Verdict:** ✅ PASS

---

## E-04 · CAPA Route Validation

**Method:** `oiCapaRouter.` pattern grep against `server/oi-capa-routes.ts`  
**Count:** 21 routes

**Full route inventory:**
```
POST   /issues/:id/capa                              — Create CAPA
GET    /issues/:id/capa                              — List CAPAs for issue
GET    /capa                                         — Global register
GET    /capa/:capaId                                 — Detail
PATCH  /capa/:capaId                                 — Update fields
POST   /capa/:capaId/transition                      — Status transition
DELETE /capa/:capaId                                 — Delete (draft, SM+)
POST   /capa/:capaId/actions                         — Add action item
GET    /capa/:capaId/actions                         — List actions
PATCH  /capa/:capaId/actions/:actionId               — Update action
POST   /capa/:capaId/actions/:actionId/complete      — Complete action
POST   /capa/:capaId/actions/:actionId/verify        — Verify action
POST   /capa/:capaId/actions/:actionId/reject-verification — Reject verify
POST   /capa/:capaId/actions/:actionId/cancel        — Cancel action
DELETE /capa/:capaId/actions/:actionId               — Delete action
POST   /capa/:capaId/effectiveness                   — Record review
GET    /capa/:capaId/effectiveness                   — Review history
GET    /dashboard/capa-summary                       — Overview KPIs
GET    /dashboard/capa-by-type                       — Type breakdown
GET    /dashboard/capa-sla                           — SLA adherence
GET    /dashboard/capa-effectiveness                 — Effectiveness rate
```

**Router registration confirmed:** `server/routes.ts` includes `oiCapaRouter`  
**Verdict:** ✅ PASS

---

## E-05 · CAPA Workflow Validation

**Source evidence from `server/oi-capa-routes.ts`:**

| Feature | Line | Evidence |
|---|---|---|
| Advisory lock for CAPA number | L63–64 | `pg_advisory_xact_lock(hashtext('capa_number_seq'))` |
| CAPA number format | L69 | `` `CAPA-${year}-${String(cnt+1).padStart(3,'0')}` `` |
| Transition guard present | L238+ | `TRANSITION` map + `ALLOWED_FROM` checks |
| Immutable fields post-open | L238 | `IMMUTABLE_POST_OPEN = new Set(['capaType','issueId','rcaId','capaNumber','createdBy'])` |
| SM-only fields | L240 | `ALLOWED_SM_FIELDS = new Set(['approverId','dueDate','extendedDueDate'])` |
| Approver ≠ Assignee | L107–108 | `approverId === assignedTo → 422` |

**Verdict:** ✅ PASS

---

## E-06 · RCA/CAPA Linkage Validation

**DB evidence:** `oi_capa_records.rca_id` FK → `oi_rca_records.id` confirmed in `information_schema.referential_constraints`

**Source evidence — `server/oi-capa-routes.ts` L101–104:**
```typescript
const [rca] = await db.select({ id: oiRcaRecords.id, issueId: oiRcaRecords.issueId, status: oiRcaRecords.status })
  .from(oiRcaRecords).where(eq(oiRcaRecords.id, data.rcaId)).limit(1);
if (rca.issueId !== issueId)
  return res.status(422).json({ error: "rca_issue_mismatch", message: "RCA does not belong to this issue" });
```

**Verdict:** ✅ PASS — FK enforced at DB level, 422 error enforced at application level

---

## E-07 · RCA Reopen Block Validation

**Source evidence — `server/oi-rca-routes.ts` L428–437:**
```typescript
// Phase 1D gate: block RCA reopen if any linked CAPA is active (not draft or cancelled)
const activeCapa = await db.select({ id: oiCapaRecords.id, capaNumber: oiCapaRecords.capaNumber })
  .from(oiCapaRecords)
  .where(and(eq(oiCapaRecords.rcaId, rcaId), notInArray(oiCapaRecords.status, ['draft','cancelled'])))
  .limit(1);
if (activeCapa.length > 0)
  return res.status(409).json({
    error: "active_capa_exists",
    message: `CAPA ${activeCapa[0].capaNumber} is active. Cancel or close all CAPAs linked to this RCA before reopening.`
  });
```

**Verdict:** ✅ PASS — 409 with actionable message, CAPA number surfaced to caller

---

## E-08 · Issue Closure Block Validation

**Source evidence — `server/oi-transition-service.ts` L89:**
```typescript
throw new TransitionError(`capa_closure_required:${openCapas.length}`, 409);
```

Context: Fires when `newStatus === 'closed'` and `openCapas.length > 0` (CAPAs with status not in `['closed','cancelled']`)

**Verdict:** ✅ PASS — Structured error code includes count of blocking CAPAs

---

## E-09 · CAPA Action Verification Validation

**Source evidence:**

| Step | HTTP Verb | Path | Guard |
|---|---|---|---|
| Complete | POST | `…/complete` | Status must be `open` |
| Verify | POST | `…/verify` | Status must be `completed` |
| Reject verification | POST | `…/reject-verification` | Returns action to `open` |
| Cancel | POST | `…/cancel` | Status ≠ `verified` |

**Timestamp tracking confirmed:**
- `completed_at` set on complete action (`oi-capa-routes.ts` — `completedAt` field)
- `verified_at` set on verify action
- `verified_by` FK captured

**Verdict:** ✅ PASS — 3-step (complete → verify → close or reject → reopen) fully implemented

---

## E-10 · Effectiveness Review Validation

**Source evidence from `server/oi-capa-routes.ts`:**

```typescript
const effectivenessSchema = z.object({
  effectivenessScore: z.number().int().min(1).max(5),
  isEffective:        z.boolean(),
  recurrenceObserved: z.boolean(),
  evidenceNotes:      z.string().optional(),
  recommendation:     z.string().optional(),
});
```

**Unique constraint confirmed:** `uq_capa_effectiveness_cycle (capa_id, review_cycle)` — prevents duplicate cycle submissions

**Recurrence flag confirmed:** `recurrenceObserved` boolean present in schema and dashboard rollup

**Verdict:** ✅ PASS

---

## E-11 · Overdue Escalation Validation

**Source evidence from `server/oi-capa-escalation-service.ts`:**

| Feature | Evidence |
|---|---|
| Cron schedule | `01:00` IST (`'0 1 * * *'` in Asia/Kolkata) |
| L1 threshold | 1–6 calendar days overdue |
| L2 threshold | 7–13 calendar days overdue |
| L3 threshold | 14+ calendar days overdue |
| One-shot guard | `INSERT … ON CONFLICT DO NOTHING` on `uq_capa_escalation_level (capa_id, level)` |
| Audit trail | `capa_sla_breach` written per escalation fired |
| System actor | `id=0, name='System', role='System'` |
| Scheduler registered | `server/index.ts` confirmed to include CAPA escalation |

**Runtime confirmation:** Log line `[CAPA Escalation] Scheduler started — nightly at 01:00 IST` at server line 188

**Verdict:** ✅ PASS

---

## E-12 · Unauthorized Access Validation

**Authentication surface:**
- `actorFromReq(req)` called at top of every handler — accesses `req.user` unconditionally
- `req.user` is undefined for unauthenticated sessions → throws before business logic → Express catches → 500 (behind session middleware which returns 401 first)
- All OI routes registered behind `isAuthenticated` middleware in `routes.ts`

**RBAC surface:**

| Role Tier | Allowed Operations |
|---|---|
| Any authenticated | Read CAPA list, detail, actions, effectiveness |
| Manager+ (`MANAGER_ROLES`) | Create CAPA, add/update actions |
| Senior Manager+ (`SM_ROLES`) | Set approverId, extendedDueDate; delete CAPA (draft) |

**Verdict:** ✅ PASS — No endpoint reachable without session; role checked on every mutating operation

---

## E-13 · Future-Phase Leakage Validation

**Markers scanned:** `ai_`, `ml_`, `nlp_`, `prediction`, `automation_engine`, `phase2`, `Phase 2`, `gpt_capa`, `auto_remediation`

**Files scanned:**
- `server/oi-capa-routes.ts` (759 lines)
- `server/oi-capa-escalation-service.ts` (108 lines)
- `client/src/pages/oi/oi-capa-register.tsx` (268 lines)
- `client/src/pages/oi/oi-capa-detail.tsx` (681 lines)
- `client/src/pages/oi/oi-capa-constants.ts` (96 lines)

**Result:** Zero matches across all files and all markers

**Verdict:** ✅ PASS — Phase 1D is strictly scoped to CAPA lifecycle, action items, effectiveness, SLA escalation, and integration panels. No AI/ML, no phase 2 features.

---

## Summary Scorecard

| # | Validation | Result |
|---|---|---|
| E-01 | Build validation | ✅ PASS |
| E-02 | DB table validation | ✅ PASS |
| E-03 | Audit enum validation | ✅ PASS |
| E-04 | CAPA route validation | ✅ PASS |
| E-05 | CAPA workflow validation | ✅ PASS |
| E-06 | RCA/CAPA linkage validation | ✅ PASS |
| E-07 | RCA reopen block validation | ✅ PASS |
| E-08 | Issue closure block validation | ✅ PASS |
| E-09 | CAPA action verification validation | ✅ PASS |
| E-10 | Effectiveness review validation | ✅ PASS |
| E-11 | Overdue escalation validation | ✅ PASS |
| E-12 | Unauthorized access validation | ✅ PASS |
| E-13 | Future-phase leakage validation | ✅ PASS |
| | **OVERALL** | **13/13 ✅ ALL PASS** |

---

*Phase 1D Evidence Package v1.0 — submitted for closure approval*  
*No further Phase 1D work will be performed until closure approval is received.*
