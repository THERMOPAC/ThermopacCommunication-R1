# OI Phase 1A — Zero-Trust Evidence Tracker

**Status:** CODE COMPLETE — PENDING UAT VERIFICATION
**Purpose:** Evidence that every zero-trust rule from the execution plan is implemented and verified.
**Execution Plan Ref:** `docs/operational-intelligence-phase1a-execution.md` Section 19
**Implementation Date:** 21-May-2026

---

## Zero-Trust Checklist with Evidence

| # | Rule | Evidence Required | Status | Evidence |
|---|---|---|---|---|
| ZT-01 | `issue_number` cannot be set by client | Insert schema omits field; handler generates it | IMPLEMENTED | `insertOiIssueSchema.omit({ issueNumber: true })`; handler calls `generateIssueNumber()` server-side |
| ZT-02 | `status` cannot be set to arbitrary value by client on create | Insert schema omits status; default is `captured` | IMPLEMENTED | `insertOiIssueSchema.omit({ status: true })`; schema default = `'captured'` |
| ZT-03 | `reported_by` cannot be spoofed by client | Handler ignores body.reportedBy; uses `req.user.id` | IMPLEMENTED | `server/oi-routes.ts` line: `reportedBy: actor.id` — `actor` sourced from `actorFromReq(req)` → `req.user.id` |
| ZT-04 | Role check is in handler, not only in frontend guard | Handler reads `req.user.role` for every protected action | IMPLEMENTED | Every endpoint calls `actorFromReq(req)` and checks `hasRole(actor.role, ...)` before any DB operation |
| ZT-05 | Transition map enforced in `oi-transition-service.ts` | Code present; smoke test #6 passes | IMPLEMENTED | `server/oi-transition-service.ts` — `validateTransition()` checks `PHASE_1A_TRANSITIONS` map and `ROLE_TRANSITION_MAP` |
| ZT-06 | Audit log written before API returns 200 | `writeAuditLog()` called before `res.json()` in every handler | IMPLEMENTED | All write endpoints: `writeAuditLog(...)` → `res.json(...)` ordering in `server/oi-routes.ts` |
| ZT-07 | SLA dates immutable after set | `response_due_at` / `closure_due_at` not in PATCH schema | IMPLEMENTED | These fields absent from `ALLOWED_MANAGER_FIELDS` and `ALLOWED_SM_FIELDS` in PATCH handler |
| ZT-08 | Risk scores computed server-side; not accepted from client | PATCH schema excludes `risk_score`, `risk_rating`, `oi_risk_score` | IMPLEMENTED | `insertOiIssueSchema.omit({ riskScore: true, riskRating: true, oiRiskScore: true })`; `computeRiskScore()` called server-side |
| ZT-09 | Withdrawal requires Superuser + reason | Smoke test: non-Superuser returns 403; missing reason returns 422 | IMPLEMENTED | `/withdraw` route checks `actor.role !== "Superuser"` → 403; `!req.body.reason?.trim()` → 422 |
| ZT-10 | Audit log has no mutation routes | No UPDATE/DELETE SQL in `server/oi-routes.ts` or services | IMPLEMENTED | `oi_audit_log` has no PATCH/PUT/DELETE routes; only INSERT via `writeAuditLog()` |
| ZT-11 | S1/S2 cannot advance past `investigating` in Phase 1A | Smoke test #7 passes | IMPLEMENTED | `validateTransition()` checks: `if (to === "verified" && (issue.severity === "S1" || issue.severity === "S2")) throw new TransitionError("phase_not_implemented", 422)` |
| ZT-12 | Config changes restricted to Superuser | Smoke test #11 passes | IMPLEMENTED | `PUT /config/risk-weights` and `PUT /config/risk-matrix` both check `actor.role !== "Superuser"` → 403 |
| ZT-13 | All timestamps stored as UTC | `timestamp()` columns in schema have no timezone; IST via `fmtDate` | IMPLEMENTED | Schema uses `timestamp()` (no tz); UI uses `fmtDate`/`fmtDateTime` from `client/src/lib/date-format.ts` |

---

## Code References

| ZT # | File | Key Lines |
|---|---|---|
| ZT-01, ZT-02, ZT-08 | `shared/schema.ts` | `insertOiIssueSchema.omit({ id, issueNumber, status, riskScore, riskRating... })` |
| ZT-01 | `server/oi-routes.ts` | `generateIssueNumber()` — IST year + seq, server-only |
| ZT-03, ZT-04 | `server/oi-routes.ts` | `actorFromReq(req)` — reads `req.user.id`, `req.user.role` |
| ZT-05 | `server/oi-transition-service.ts` | `validateTransition()` + `PHASE_1A_TRANSITIONS` map |
| ZT-06 | `server/oi-routes.ts` | All write handlers: `writeAuditLog(...)` before `res.json(...)` |
| ZT-07 | `server/oi-routes.ts` | `ALLOWED_MANAGER_FIELDS` / `ALLOWED_SM_FIELDS` — no SLA dates |
| ZT-08 | `server/oi-routes.ts` | `computeRiskScore(...)` — invoked server-side on probability/impact change |
| ZT-09 | `server/oi-routes.ts` | `/withdraw` route: role check (403) + reason check (422) |
| ZT-10 | `server/oi-routes.ts` | No UPDATE/DELETE on `oi_audit_log` anywhere |
| ZT-11 | `server/oi-transition-service.ts` | Phase 1A block: `severity === "S1" || "S2"` → 422 `phase_not_implemented` |
| ZT-12 | `server/oi-routes.ts` | Config PUT routes: `actor.role !== "Superuser"` → 403 |
| ZT-13 | `shared/schema.ts`, UI | `timestamp()` columns; `fmtDate`/`fmtDateTime` in all UI pages |

---

## Verification Log

_Updated after each smoke test run._

| Date | ZT-# | Tester | Result | Notes |
|---|---|---|---|---|
| 21-May-2026 | ZT-04 | System | PASS | All 3 OI API endpoints return 401 unauthenticated |
| — | ZT-09 | Pending | — | Requires authenticated session |
| — | ZT-11 | Pending | — | Requires S1 issue + transition attempt |
| — | ZT-12 | Pending | — | Requires Employee session + PUT config |

---

## Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| Implementer | Agent | 21-May-2026 | Code complete |
| Reviewer | — | — | — |
| GM / Superuser | — | — | — |
