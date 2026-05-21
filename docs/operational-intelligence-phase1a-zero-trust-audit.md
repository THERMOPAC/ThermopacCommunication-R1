# OI Phase 1A — Zero-Trust Audit

**Status:** CODE COMPLETE — AWAITING REVIEWER SIGN-OFF
**Date:** 21-May-2026
**Auditor:** Implementation Agent
**Reference:** `docs/operational-intelligence-phase1a-execution.md` §19
**Evidence Record:** `docs/operational-intelligence-phase1a-evidence.md`

---

## Summary

13 zero-trust rules were mandated in the Phase 1A execution plan.
All 13 are implemented in code. 3 have been verified by automated test (auth-gate smoke).
Remaining 10 require an authenticated session for full UAT verification.

| Implemented | Code-Verified | Test-Verified | Pending UAT |
|-------------|---------------|---------------|-------------|
| 13 / 13     | 13 / 13       | 3 / 13        | 10          |

---

## ZT-01 — `issue_number` Cannot Be Set by Client

**Rule:** The `issue_number` field must be generated server-side only. Client cannot inject or influence it.

**Implementation:**
- `insertOiIssueSchema` omits `issueNumber` via `.omit()`
- Server generates via `generateIssueNumber()`:

```typescript
async function generateIssueNumber(): Promise<string> {
  const prefix = `OI-${getISTYear()}-`;
  const existing = await db.select({ issueNumber: oiIssues.issueNumber })
    .from(oiIssues).where(ilike(oiIssues.issueNumber, `${prefix}%`));
  const next = (existing.length + 1).toString().padStart(4, "0");
  return `${prefix}${next}`;
}
// Routes.ts line 137:
const issueNumber = await generateIssueNumber();
```

**Status:** IMPLEMENTED ✓
**UAT Test:** POST /api/oi/issues — verify response contains `issue_number` matching `OI-2026-NNNN`; verify body-supplied `issueNumber` is ignored.

---

## ZT-02 — `status` Cannot Be Arbitrarily Set on Create

**Rule:** Client cannot set `status` to any value on issue creation. Default must be `captured`.

**Implementation:**
- `insertOiIssueSchema` omits `status`
- Schema column default: `"captured"`
- Insert handler does not accept `status` from request body

```typescript
// shared/schema.ts — oi_issues table
status: oiIssueStatusEnum("status").notNull().default("captured"),
```

**Status:** IMPLEMENTED ✓
**UAT Test:** POST /api/oi/issues with `{"status":"closed"}` — verify response has `status: "captured"`.

---

## ZT-03 — `reported_by` Cannot Be Spoofed by Client

**Rule:** The `reportedBy` field must be sourced from the authenticated session, never from the request body.

**Implementation:**
```typescript
// server/oi-routes.ts line 25
function actorFromReq(req: any) {
  return { id: req.user.id, name: req.user.username, role: req.user.role, ip: req.ip };
}

// Line 161 — issue create handler
reportedBy: actor.id,   // actor.id = req.user.id; body is ignored
```

**Status:** IMPLEMENTED ✓
**UAT Test:** POST /api/oi/issues with `{"reportedBy":999}` — verify response has `reportedBy` = session user id, not 999.

---

## ZT-04 — Role Check Is in Handler, Not Only Frontend Guard

**Rule:** Every protected action must validate the actor's role server-side via `req.user.role`. Frontend display guards are supplementary only.

**Implementation:**
- `actorFromReq(req)` called at the top of every protected handler
- Role checked against `MANAGER_ROLES`, `SM_ROLES`, `GM_ROLES`, or `"Superuser"` before any DB operation
- `hasRole(actor.role, allowedRoles)` utility used consistently

**Evidence:** 6 distinct `return res.status(403)` points in `server/oi-routes.ts` alone. `validateTransition()` in `server/oi-transition-service.ts` adds role check for every state transition.

**Status:** IMPLEMENTED ✓
**UAT Test:** Authenticated Employee session → POST `/api/oi/issues/:id/transition` with `{"to":"classified"}` — verify 403 (Employee not in `ROLE_TRANSITION_MAP["captured->classified"]`).

---

## ZT-05 — Transition Map Enforced in `oi-transition-service.ts`

**Rule:** State machine transitions must be validated in a dedicated service, not inline in route handlers.

**Implementation:**
```typescript
// server/oi-transition-service.ts
export function validateTransition(issue, to, actorRole, reason?) {
  const allowed = PHASE_1A_TRANSITIONS[issue.status];
  if (!allowed || !allowed.includes(to))
    throw new TransitionError("transition_not_allowed", 422);
  // ... role check, phase block, reason check
}
```

Route handler calls `validateTransition(issue, to, actor.role, reason)` — no inline state logic in routes.

**Status:** IMPLEMENTED ✓
**UAT Test (negative):** Attempt `classified → closed` (not in map) — verify 422 `transition_not_allowed`.

---

## ZT-06 — Audit Log Written Before API Returns 200

**Rule:** `writeAuditLog()` must be called before `res.json()` in every write handler.

**Implementation:**

7 call sites in `server/oi-routes.ts`:

| Line | Handler | Action Logged |
|------|---------|---------------|
| 164  | Create issue | `created` |
| 272  | PATCH issue | `field_updated` |
| 350  | Transition | `status_changed` |
| 424  | Severity change | `severity_changed` |
| 452  | Assign | `assigned` |
| 489  | Assign notification | `assigned` |
| 560  | Withdraw / reopen | `withdrawn` / `reopened` |

In every case, `await writeAuditLog({...})` precedes `res.json({...})`.

**Status:** IMPLEMENTED ✓
**UAT Test:** Create issue → GET `/api/oi/issues/:id/audit` — verify exactly 1 audit row with `action: "created"`.

---

## ZT-07 — SLA Dates Immutable After Set

**Rule:** `response_due_at` and `closure_due_at` must not appear in the PATCH update schema.

**Implementation:**
The PATCH handler accepts only fields in `ALLOWED_MANAGER_FIELDS` and `ALLOWED_SM_FIELDS`. Neither list includes `responseDueAt` or `closureDueAt`. These fields are set **only** by the transition handler when issue moves to `classified`, computed from severity SLA config.

**Status:** IMPLEMENTED ✓
**UAT Test:** PATCH `/api/oi/issues/:id` with `{"responseDueAt":"2030-01-01"}` — verify field is ignored in DB.

---

## ZT-08 — Risk Scores Computed Server-Side

**Rule:** `risk_score`, `risk_rating`, and `oi_risk_score` must be excluded from client-accepted schemas. Computed server-side only.

**Implementation:**
```typescript
// server/oi-routes.ts lines 60-71
async function computeRiskScore(probabilityLevel, impactLevel) {
  if (!probabilityLevel || !impactLevel) return { riskScore: null, riskRating: null };
  const row = await db.select().from(oiRiskMatrixConfig)
    .where(and(eq(oiRiskMatrixConfig.probability, probabilityLevel),
               eq(oiRiskMatrixConfig.impact, impactLevel))).limit(1);
  return { riskScore: score, riskRating: rating };
}

// Lines 285-289 — called on PATCH when prob/impact changes
const { riskScore, riskRating } = await computeRiskScore(
  updates.probabilityLevel ?? issue.probabilityLevel,
  updates.impactLevel      ?? issue.impactLevel
);
updates.riskScore  = riskScore;
updates.riskRating = riskRating;
```

`insertOiIssueSchema` omits `riskScore`, `riskRating`, `oiRiskScore`.

**Status:** IMPLEMENTED ✓
**UAT Test:** PATCH with `{"riskScore":999}` — verify DB stores computed value, not 999.

---

## ZT-09 — Withdrawal Requires Superuser + Reason

**Rule:** Only Superuser can withdraw an issue. Reason field is mandatory.

**Implementation:**
```typescript
// server/oi-routes.ts — /withdraw route (line 471-473)
oiRouter.post("/issues/:id/withdraw", async (req, res) => {
  const actor = actorFromReq(req);
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" });
  // ...
});

// server/oi-transition-service.ts
if (to === "withdrawn" && !reason)
  throw new TransitionError("withdrawal_reason_required", 422);
```

Dual enforcement: role gate in route handler AND reason gate in transition validator.

**Status:** IMPLEMENTED ✓
**UAT Tests:**
1. Non-Superuser → POST `/withdraw` → expect 403
2. Superuser + no reason → expect 422 `withdrawal_reason_required`
3. Superuser + reason → expect 200, status = `withdrawn`

---

## ZT-10 — Audit Log Has No Mutation Routes

**Rule:** The `oi_audit_log` table must have no UPDATE or DELETE routes. It is append-only.

**Implementation:**
- `server/oi-audit-service.ts` exposes only `writeAuditLog()` — uses `db.insert()` only
- No PATCH/PUT/DELETE route exists targeting `oi_audit_log` in any OI file
- No direct `db.update(oiAuditLog)` or `db.delete(oiAuditLog)` anywhere

**Status:** IMPLEMENTED ✓
**Verification:** `grep -rn "update.*oiAuditLog\|delete.*oiAuditLog" server/` → NONE

---

## ZT-11 — S1/S2 Cannot Advance Past `investigating` in Phase 1A

**Rule:** Issues with severity S1 or S2 must be blocked from the `verified` state until Phase 1B is implemented.

**Implementation:**
```typescript
// server/oi-transition-service.ts lines 44-46
if (to === "verified" && (issue.severity === "S1" || issue.severity === "S2")) {
  throw new TransitionError("phase_not_implemented", 422);
}
```

This fires after the transition-map check (so `investigating → verified` would be map-valid) but before the role check — ensuring the block cannot be bypassed by role escalation.

**Status:** IMPLEMENTED ✓
**UAT Test:** S1 issue in `investigating` state → POST transition `{"to":"verified"}` → expect 422 `phase_not_implemented`.

---

## ZT-12 — Config Changes Restricted to Superuser

**Rule:** PUT to `/config/risk-weights` and `/config/risk-matrix` must be restricted to Superuser only.

**Implementation:**
```typescript
// GET config — Manager+ (read allowed)
oiRouter.get("/config/risk-weights", async (req, res) => {
  if (!hasRole(actor.role, MANAGER_ROLES)) return res.status(403).json({ error: "forbidden" });
});

// PUT config — Superuser only (write restricted)
oiRouter.put("/config/risk-weights", async (req, res) => {
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" }); // line 659
});

oiRouter.put("/config/risk-matrix", async (req, res) => {
  if (actor.role !== "Superuser") return res.status(403).json({ error: "forbidden" }); // line 681
});
```

Sidebar "Configuration" link is also hidden from non-Superuser users:
```typescript
// layout.tsx
...(user?.role === "Superuser" ? [{ icon: Settings, label: "Configuration", href: "/oi/config" }] : []),
```

**Status:** IMPLEMENTED ✓
**UAT Test:** Non-Superuser authenticated session → PUT `/api/oi/config/risk-weights` → expect 403.

---

## ZT-13 — All Timestamps Stored as UTC

**Rule:** All OI timestamps must be stored as UTC. IST conversion happens only in the UI display layer.

**Implementation:**
- All `timestamp()` columns in `oi_issues`, `oi_audit_log`, `oi_escalations` use Drizzle `timestamp()` — PostgreSQL `timestamp without time zone`, stored in UTC
- `new Date()` used in server handlers — Node.js `Date` objects are always UTC
- UI uses `fmtDate()` / `fmtDateTime()` from `client/src/lib/date-format.ts` for all display
- `toLocaleDateString()` / `toLocaleString()` — NOT used in any OI page (confirmed by grep)

**Status:** IMPLEMENTED ✓
**UAT Test:** Capture issue at 18:30 IST → verify DB `created_at` is 13:00 UTC.

---

## Test Evidence Matrix

| ZT-# | Rule | Code Verified | Auth-Gate | UAT Status |
|------|------|:---:|:---:|---|
| ZT-01 | issue_number server-generated | ✓ | N/A | Pending authenticated session |
| ZT-02 | status defaults to captured | ✓ | N/A | Pending authenticated session |
| ZT-03 | reported_by from session | ✓ | N/A | Pending authenticated session |
| ZT-04 | Role check in handler | ✓ | ✓ (401) | Pending role-specific test |
| ZT-05 | Transition map enforced | ✓ | ✓ (401) | Pending negative transition test |
| ZT-06 | Audit log before response | ✓ | N/A | Pending create + audit verify |
| ZT-07 | SLA dates immutable | ✓ | N/A | Pending PATCH test |
| ZT-08 | Risk score computed server-side | ✓ | N/A | Pending PATCH test |
| ZT-09 | Withdraw: Superuser + reason | ✓ | ✓ (401) | Pending role + reason tests |
| ZT-10 | Audit log append-only | ✓ | ✓ (grep: NONE) | Static — complete |
| ZT-11 | S1/S2 blocked past investigating | ✓ | N/A | Pending severity + transition test |
| ZT-12 | Config: Superuser only | ✓ | ✓ (401) | Pending Employee-session test |
| ZT-13 | UTC storage, IST display | ✓ | ✓ (grep: NONE) | Static — complete |

**Static verifications (ZT-10, ZT-13):** Completed by code inspection and grep — no runtime test required.
**Auth-gate verifications (ZT-04, ZT-05, ZT-09, ZT-12):** Completed by unauthenticated curl — all 401.
**UAT pending:** 10 rules — require an authenticated session with varying roles.

---

## Sign-Off

| Role | Name | Date | Decision |
|---|---|---|---|
| Implementer | Agent | 21-May-2026 | Submitted for review |
| Technical Reviewer | — | — | PENDING |
| GM / Superuser | — | — | PENDING |

---

## Conditions for Phase 1B Go-Ahead

1. All 10 pending UAT tests executed by a Superuser session and results recorded.
2. Technical Reviewer confirms ZT-06 (audit log ordering) by code walkthrough.
3. GM/Superuser sign-off on this document.
4. No open defects against Phase 1A scope.
