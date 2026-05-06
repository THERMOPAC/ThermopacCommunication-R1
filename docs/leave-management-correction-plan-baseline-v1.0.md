# Leave Management — Final Consolidated Correction Plan Baseline v1.0

**Document status:** Approved baseline — do not implement without referencing this file  
**Date approved:** 06-May-2026  
**Prepared by:** Architecture review session  
**Covers:** Leave balance integrity, sandwich deduction engine, CL accrual, LWP confirmation gate, LWP exemption for senior roles

---

## Governing Principles

Every decision in this plan flows from three non-negotiable rules:

> **Rule 1 — Single source of truth:** `leave_balances` is the only table that tracks leave balance state. Every mutation to `usedDays` or `pendingDays` happens through one shared service function, never inline in a route handler.

> **Rule 2 — Leave-first, payroll-second:** Sandwich deduction is a leave balance event. It consumes `leave_balances.usedDays` exactly like a normal leave day. It becomes a payroll (LWP/salary) deduction only when leave balance is insufficient, the leave type is unpaid, or HR explicitly marks it as salary-deductible.

> **Rule 3 — Transactions are mandatory:** Every operation that touches more than one table must run inside a single serializable database transaction. Partial writes are not acceptable.

> **Rule 4 — Attendance and payroll are separate decisions:** Attendance records what happened (absent, LWP). Payroll decides whether that absence causes a salary deduction. These are two distinct steps; the second always requires human confirmation.

---

## Part 1 — Audit Findings Summary

### 1.1 Critical Risks Identified

| # | Risk | Severity | Location |
|---|---|---|---|
| 1 | Admin route bypasses balance — `PUT /api/admin/leave-requests/:id/status` and `POST /api/admin/leave-requests` do not touch `leaveBalances` | HIGH | `server/admin-routes.ts` lines 2198, 2223 |
| 2 | No approved-leave cancellation route exists — once approved, employee cannot cancel | HIGH | `server/leave-routes.ts` line 518 |
| 3 | `leavePolicies` table exists but no enforcement of `maxDaysPerYear` or `maxCarryoverDays` | MEDIUM | `server/admin-routes.ts` (CRUD only) |
| 4 | Year-boundary split — leave spanning Dec 31 → Jan 1 deducts full `totalDays` from start-year balance only | MEDIUM | `server/leave-routes.ts` line 411 |
| 5 | Race condition between payroll Step 1 and Step 2 if leave approved mid-run | MEDIUM | `server/payroll-run-engine.ts` lines 325–380, 458–554 |
| 6 | `leave_approvals` table orphaned — multi-level chain defined in schema but not used | LOW | `shared/schema.ts` line 516 |
| 7 | No rollback of attendance on revocation via admin bypass route | LOW | `server/leave-routes.ts` line 728 |

### 1.2 Deduction Timing (Current State — Broken)

| Event | `pendingDays` | `usedDays` | Attendance |
|---|---|---|---|
| Leave application submitted | `+= totalDays` | unchanged | none |
| Manager approves | `-= totalDays` | `+= totalDays` | Written: `on_leave`/`half_day` |
| Manager rejects | `-= totalDays` | unchanged | none |
| Employee cancels (pending only) | `-= totalDays` (GREATEST 0) | unchanged | none |
| **Admin route approve (bypass)** | **NOT touched** | **NOT touched** | none |
| **Admin route reject (bypass)** | **NOT touched** | **NOT touched** | none |

---

## Part 2 — Affected Files

| File | Change Type | Reason |
|---|---|---|
| `server/leave-service.ts` | **Create new** | Single source of truth for all balance mutations and sandwich detection |
| `server/leave-routes.ts` | Refactor | Replace 400+ lines of inline balance logic with service calls |
| `server/admin-routes.ts` | Fix | Admin approve/reject/create bypass routes must call leave-service |
| `server/payroll-run-engine.ts` | Extend | `leave_consolidation` reads `leave_deductions`; adds sandwich + LWP snapshot columns |
| `shared/schema.ts` | Extend | Add `leave_deductions`, `leave_deduction_audit_log`, `sandwich_exemption_log`, `leave_accrual_log`; extend `users` and `leave_policies` |
| `server/attendance-midnight-processor.ts` | Extend | Wire monthly CL accrual job; wire year-end carryover job |
| `client/src/pages/leave/leave-balance-page.tsx` | Extend | Sandwich deduction sub-line; accrual history |
| `client/src/pages/admin/leave-management-page.tsx` | Extend | Sandwich deduction records; LWP confirmation; LWP exemption display |

---

## Part 3 — New Database Tables

### 3.1 `leave_deductions` — Primary sandwich/policy deduction store

```sql
CREATE TABLE leave_deductions (
  id                       serial PRIMARY KEY,
  employee_id              integer NOT NULL REFERENCES users(id),
  leave_type_id            integer NOT NULL REFERENCES leave_types(id),
  deduction_type           text NOT NULL CHECK (deduction_type IN ('sandwich_leave')),
  period_year              integer NOT NULL,

  deducted_days            numeric(5,2) NOT NULL,
  deduction_rate           numeric(4,3) NOT NULL DEFAULT 1.0
                             CHECK (deduction_rate > 0 AND deduction_rate <= 1.0),
  cap_days                 numeric(5,2),
  deducted_days_effective  numeric(5,2) NOT NULL,

  status                   text NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending','approved','voided','revoked')),

  source_ref_type          text NOT NULL DEFAULT 'leave_request',
  source_ref_id_left       integer REFERENCES leave_requests(id),
  source_ref_id_right      integer REFERENCES leave_requests(id),
  gap_dates                text[] NOT NULL,

  is_lwp                   boolean NOT NULL DEFAULT false,
  lwp_days                 numeric(5,2),
  lwp_marked_by            integer REFERENCES users(id),
  lwp_marked_at            timestamptz,

  policy_snapshot          jsonb NOT NULL DEFAULT '{}',

  created_at               timestamptz NOT NULL DEFAULT NOW(),
  created_by               integer NOT NULL REFERENCES users(id),
  voided_at                timestamptz,
  voided_by                integer REFERENCES users(id),
  void_reason              text,
  revoked_at               timestamptz,
  revoked_by               integer REFERENCES users(id),
  revoke_reason            text,

  CONSTRAINT chk_void_reason   CHECK (status != 'voided'  OR void_reason IS NOT NULL),
  CONSTRAINT chk_revoke_reason CHECK (status != 'revoked' OR revoke_reason IS NOT NULL),
  CONSTRAINT chk_lwp_days      CHECK (lwp_days IS NULL OR lwp_days <= deducted_days_effective),
  CONSTRAINT chk_rate_positive CHECK (deduction_rate > 0 AND deduction_rate <= 1.0)
);
```

**Note on naming:** The table is named `leave_deductions` (not `payroll_deductions`) because sandwich deduction is primarily a leave balance event. It bridges into payroll only when balance is insufficient (`is_lwp = true`).

### 3.2 `leave_deduction_audit_log` — Append-only audit trail

```sql
CREATE TABLE leave_deduction_audit_log (
  id              bigserial PRIMARY KEY,
  deduction_id    integer NOT NULL REFERENCES leave_deductions(id),
  event_type      text NOT NULL CHECK (event_type IN (
                    'created','approved','voided','revoked',
                    'lwp_flagged','lwp_confirmed','lwp_waived',
                    'void_blocked','revoke_blocked','exemption_granted'
                  )),
  performed_by    integer REFERENCES users(id),
  performed_at    timestamptz NOT NULL DEFAULT NOW(),
  previous_status text,
  new_status      text,
  context         jsonb NOT NULL DEFAULT '{}'
);
```

### 3.3 `sandwich_exemption_log` — Audit of non-charged enclosures

```sql
CREATE TABLE sandwich_exemption_log (
  id                   serial PRIMARY KEY,
  employee_id          integer NOT NULL REFERENCES users(id),
  leave_type_id        integer NOT NULL REFERENCES leave_types(id),
  gap_dates            text[] NOT NULL,
  exemption_reason     text NOT NULL,
  exemption_granted_by integer REFERENCES users(id),
  request_id_left      integer REFERENCES leave_requests(id),
  request_id_right     integer REFERENCES leave_requests(id),
  created_at           timestamptz NOT NULL DEFAULT NOW()
);
```

### 3.4 `leave_accrual_log` — CL monthly accrual audit trail

```sql
CREATE TABLE leave_accrual_log (
  id               serial PRIMARY KEY,
  employee_id      integer NOT NULL REFERENCES users(id),
  leave_type_id    integer NOT NULL REFERENCES leave_types(id),
  credit_year      integer NOT NULL,
  credit_month     integer NOT NULL,
  credited_days    numeric(4,2) NOT NULL,
  reason           text NOT NULL
                     CHECK (reason IN ('monthly_accrual','pro_rated','year_end_carryover','manual_adjustment')),
  balance_before   numeric(5,2),
  balance_after    numeric(5,2),
  created_at       timestamptz NOT NULL DEFAULT NOW(),
  created_by       integer REFERENCES users(id),
  notes            text
);
```

### 3.5 New Columns on Existing Tables

**`leave_types`** (extend):
```
accrual_type            text    CHECK IN ('annual','monthly','none')
monthly_accrual_rate    numeric(4,2)
accrual_day_of_month    integer  DEFAULT 1
accrual_pro_rate        boolean  DEFAULT true
```

**`leave_policies`** (extend):
```
sandwich_rate              numeric(4,3)  DEFAULT 1.0
sandwich_cap_days          integer
sandwich_exempt            boolean       DEFAULT false
sandwich_overflow          text          CHECK IN ('block','partial_lwp') DEFAULT 'partial_lwp'
single_holiday_gap_exempt  boolean       DEFAULT false
cross_type_sandwich        boolean       DEFAULT false
```

**`payroll_attendance_snapshot`** (extend):
```
sandwich_paid_days         numeric(5,2)   DEFAULT 0
sandwich_lwp_days          numeric(5,2)   DEFAULT 0
sandwich_lwp_amount        numeric(12,2)  DEFAULT 0
lop_days_computed          numeric(5,2)
lop_days_confirmed         numeric(5,2)
lop_confirmed_by           integer REFERENCES users(id)
lop_confirmed_at           timestamptz
lop_override_notes         text
```

**`users`** (extend — for LWP exemption, see Part 9):
```
lwp_exempt                 boolean  NOT NULL DEFAULT false
lwp_exempt_reason          text
lwp_exempt_granted_by      integer REFERENCES users(id)
lwp_exempt_granted_at      timestamptz
lwp_exempt_reviewed_at     timestamptz
lwp_exempt_next_review     date
```

### 3.6 Indexes

```sql
CREATE INDEX idx_ld_employee_year
  ON leave_deductions (employee_id, leave_type_id, period_year, status)
  WHERE status IN ('pending','approved');

CREATE INDEX idx_ld_type_period
  ON leave_deductions (deduction_type, period_year, status);

CREATE INDEX idx_ld_source_left
  ON leave_deductions (source_ref_id_left)
  WHERE status IN ('pending','approved');

CREATE INDEX idx_ld_source_right
  ON leave_deductions (source_ref_id_right)
  WHERE status IN ('pending','approved');

CREATE INDEX idx_ldal_deduction
  ON leave_deduction_audit_log (deduction_id, performed_at DESC);

CREATE INDEX idx_lal_employee_year
  ON leave_accrual_log (employee_id, leave_type_id, credit_year, credit_month);

CREATE INDEX idx_ld_reconcile
  ON leave_deductions (employee_id, leave_type_id, period_year, status);
```

---

## Part 4 — Shared Service: `server/leave-service.ts`

This is the **only file** permitted to write to `leave_balances`, `leave_requests`, or `leave_deductions`. All routes are thin wrappers that call into this service.

### 4.1 `applyLeave(tx, params)`

```
Inputs:
  userId, leaveTypeId, startDate, endDate, totalDays,
  isHalfDay, halfDayPeriod, reason, managerId,
  adminOverride? (skips balance check for admin-created leaves)

Inside one serializable transaction:
  1. Validate leave type active
  2. Validate isHalfDay allowed (canBeHalfDay flag)
  3. SELECT FOR UPDATE on overlapping leave_requests → throw OVERLAPPING_LEAVE
  4. Check payroll lock for the period
  5. Server-side sandwich recomputation:
       IF sandwichApplicable AND startDate >= SANDWICH_EFFECTIVE_DATE AND NOT isHalfDay:
         totalDays = computeSandwichLeave(...).totalDays
  6. Cross-year split via splitLeaveByYear(startDate, endDate, totalDays)
  7. Balance check (paid leave only, skip if adminOverride):
       For each year segment: available[year] >= segment.days
  8. INSERT leave_request (status='pending', managerApprovalStatus='pending')
  9. For each year segment:
       UPSERT leave_balances: pendingDays += segment.days (SELECT FOR UPDATE first)
  10. Run enclosure scan → createSandwichDeductionIfEnclosed(tx, newRequest)
  11. Send notification to manager

Returns: new leave_request row
```

### 4.2 `approveLeave(tx, params)`

```
Inputs: requestId, approverId, comments?

Inside one serializable transaction:
  1. SELECT leave_request FOR UPDATE
  2. Guard: throw ALREADY_PROCESSED if status != 'pending' OR managerApprovalStatus != 'pending'
  3. UPDATE leave_requests: status='approved', managerApprovalStatus='approved', approvedDate, updatedAt
  4. Cross-year split of totalDays
  5. For each year segment:
       SELECT leave_balances FOR UPDATE
       pendingDays = GREATEST(0, pending_days - segment.days)
       usedDays    = used_days + segment.days
  6. Approve all pending leave_deductions where source_ref_id_right = requestId
       → applyDeductionApproval(tx, deduction)
  7. Upsert attendance_records for each date in [startDate, endDate]:
       status = isHalfDay ? 'half_day' : 'on_leave', statusSource = 'leave'
       Skip dates where existing record has statusSource = 'admin_override'
  8. Write audit log; send notification to employee

Returns: updated leave_request row
```

### 4.3 `rejectLeave(tx, params)`

```
Inputs: requestId, rejectorId, comments (required)

Inside one serializable transaction:
  1. SELECT leave_request FOR UPDATE
  2. Guard: throw if managerApprovalStatus != 'pending'
  3. UPDATE leave_requests: status='rejected', updatedAt
  4. For each year segment: pendingDays = GREATEST(0, pending_days - segment.days)
  5. Void all leave_deductions where source_ref_id_right = requestId AND status='pending'
     Also void deductions where source_ref_id_left = requestId AND status='pending'
       → voidDeduction(tx, deduction, reason, rejectorId) for each
  6. Send notification to employee
```

### 4.4 `cancelLeave(tx, params)`

```
Inputs: requestId, userId

Inside one serializable transaction:
  1. SELECT leave_request FOR UPDATE where id = requestId AND employeeId = userId
  2. Guard: throw if status != 'pending'
  3. Check payroll lock
  4. UPDATE leave_requests: status='canceled', updatedAt
  5. For each year segment: pendingDays = GREATEST(0, pending_days - segment.days)
  6. Void all linked leave_deductions (both left and right) where status='pending'
```

### 4.5 `revokeApprovedLeave(tx, params)`

```
Inputs: requestId, revokedBy, reason (min 10 chars)

Inside one serializable transaction:
  1. SELECT leave_request FOR UPDATE
  2. Guard: throw if status != 'approved'
  3. Check payroll lock for period → throw PAYROLL_LOCKED if any leave date is locked
  4. UPDATE leave_requests: status='revoked', managerComments=reason, updatedAt
  5. For each year segment: usedDays = GREATEST(0, used_days - segment.days)
  6. Revoke all linked leave_deductions where status='approved'
       → revokeDeduction(tx, deduction, reason, revokedBy) for each
  7. Attendance rollback for each date in [startDate, endDate]:
       If statusSource='leave': UPDATE status='absent', statusSource='revoked_leave',
         adminNotes='Leave revoked (#id): reason'
       If statusSource='admin_override': SKIP
       If no record: INSERT absent record
  8. Write audit log; send notification to employee

Returns: updated leave_request row
```

### 4.6 `splitLeaveByYear(startDate, endDate, totalDays)`

```
If startDate.year === endDate.year:
  return [{year: startDate.year, days: totalDays}]

Else:
  calendarDaysTotal   = daysBetween(startDate, endDate) inclusive
  calendarDaysInYear1 = daysBetween(startDate, Dec 31 of startDate.year) inclusive
  daysYear1 = ROUND(totalDays * calendarDaysInYear1 / calendarDaysTotal, 2)
  daysYear2 = totalDays - daysYear1   ← remainder prevents rounding drift

  return [
    {year: startDate.year, days: daysYear1},
    {year: endDate.year,   days: daysYear2}
  ]

Rules:
  - Half-day leaves are single-day; year split never applies
  - Both year balance rows locked with SELECT FOR UPDATE before update
  - daysYear1 + daysYear2 = totalDays exactly
```

### 4.7 `createSandwichDeductionIfEnclosed(tx, newRequest)`

```
Runs only if: leaveType.sandwichApplicable = true
              AND newRequest.startDate >= SANDWICH_EFFECTIVE_DATE
              AND NOT isHalfDay

1. Fetch all leave_requests for same employee + same leaveTypeId
   where status IN ('pending','approved') AND id != newRequest.id

2. For each existing request R, detect gap:
   Case A (R ends before new starts):
     gapStart = R.endDate + 1 day
     gapEnd   = newRequest.startDate - 1 day
   Case B (R starts after new ends):
     gapStart = newRequest.endDate + 1 day
     gapEnd   = R.startDate - 1 day

   gapDates = dates from gapStart to gapEnd inclusive

   Filter — keep only dates that are:
     a) A weekly-off day OR company holiday for this employee
     b) NOT already covered by another leave_request (pending or approved)

   If filtered gapDates is empty: no enclosure → next R

3. Exemption checks (in order — first match wins):
   a) Sick leave covers any gap date → exempt
   b) singleHolidayGapExempt policy AND gap has only 1 holiday → exempt
   c) Employee role policy has sandwich_exempt = true → exempt
   d) Admin manual exemption on file → exempt
   If exempt: write sandwich_exemption_log; return null

4. Resolve policy from leave_policies for this employee:
   rate    = policy.sandwich_rate    (default 1.0)
   capDays = policy.sandwich_cap_days (default null)

5. Compute:
   rawDays = sandwichableDates.length
   deducted_days_effective = min(rawDays * rate, capDays ?? rawDays * rate)
   period_year = year of gapDates[0]

6. Balance check:
   available   = allocated + carryover - used - pending
   absorbable  = min(available, deducted_days_effective)
   lwp_days    = deducted_days_effective - absorbable
   If leaveType.isPaid = false: absorbable = 0, lwp_days = deducted_days_effective

7. INSERT leave_deductions:
   status='pending', is_lwp=(lwp_days > 0), lwp_days=(if > 0),
   source_ref_id_left=R.id, source_ref_id_right=newRequest.id,
   gap_dates=sandwichableDates, policy_snapshot={rate, capDays, overflow_policy}

8. UPDATE leave_balances:
   pendingDays += absorbable  (only absorbable portion; LWP portion not in balance)

9. If lwp_days > 0: write HR notification; write audit log 'lwp_flagged'

10. Write audit log 'created'

Returns: created leave_deduction row (or null if exempt)
```

### 4.8 `applyDeductionApproval(tx, deduction)`

```
Inside same transaction as approveLeave:
  1. SELECT leave_deductions FOR UPDATE
  2. Guard: throw if status != 'pending'
  3. UPDATE status='approved'
  4. absorbableDays = deducted_days_effective - COALESCE(lwp_days, 0)
  5. UPDATE leave_balances:
       pendingDays = GREATEST(0, pending_days - absorbableDays)
       usedDays    = used_days + absorbableDays
  6. Write audit log 'approved'
```

### 4.9 `voidDeduction(tx, deduction, reason, voidedBy)`

```
  1. SELECT leave_deductions FOR UPDATE
  2. Skip if status already IN ('voided','revoked')
  3. UPDATE status='voided', voided_at, voided_by, void_reason
  4. absorbableDays = deducted_days_effective - COALESCE(lwp_days, 0)
  5. pendingDays = GREATEST(0, pending_days - absorbableDays)
  6. Write audit log 'voided'
```

### 4.10 `revokeDeduction(tx, deduction, reason, revokedBy)`

```
  1. SELECT leave_deductions FOR UPDATE
  2. Skip if status already IN ('voided','revoked')
  3. Check payroll lock for any gap date → throw PAYROLL_LOCKED if locked
  4. UPDATE status='revoked', revoked_at, revoked_by, revoke_reason
  5. absorbableDays = deducted_days_effective - COALESCE(lwp_days, 0)
  6. usedDays = GREATEST(0, used_days - absorbableDays)
  7. If is_lwp = true AND lwp was payroll-processed:
       Flag payroll record for HR review (cannot auto-reverse locked payroll)
  8. Write audit log 'revoked'
```

---

## Part 5 — Route Changes

### 5.1 `server/leave-routes.ts`

| Route | Current | After Correction |
|---|---|---|
| `POST /request` | 120 lines inline balance + sandwich | `applyLeave(tx, params)` |
| `POST /request/:id/approve` | 90 lines inline balance + attendance | `approveLeave(tx, params)` |
| `POST /request/:id/reject` | 50 lines inline balance rollback | `rejectLeave(tx, params)` |
| `POST /request/:id/cancel` | 40 lines inline balance rollback | `cancelLeave(tx, params)` |
| `POST /request/:id/revoke` | Does not exist | New → `revokeApprovedLeave(tx, params)` |
| `GET /my-balance` | Direct balance read | Shows sandwich deduction sub-lines |

### 5.2 `server/admin-routes.ts`

| Route | Current | After Correction |
|---|---|---|
| `POST /leave-requests` | Raw insert, no balance touch | `applyLeave(tx, params, adminOverride=true)` |
| `PUT /leave-requests/:id/status` (approve) | Status only — balance bypassed | `approveLeave(tx, params)` |
| `PUT /leave-requests/:id/status` (reject) | Status only — balance bypassed | `rejectLeave(tx, params)` |
| `PUT /leave-requests/:id/revoke` | Does not exist | New → `revokeApprovedLeave(tx, params)` |
| `POST /leave-deductions/:id/confirm-lwp` | Does not exist | New HR action — confirm or waive LWP |
| `POST /payroll/confirm-lop` | Does not exist | New HR action — per-employee LOP confirmation |
| `POST /payroll/confirm-lop/bulk` | Does not exist | New HR bulk confirmation action |

---

## Part 6 — Sandwich Deduction Lifecycle

```
[enclosure detected on application]
              ↓
          PENDING
        /         \
[triggering        [triggering request rejected/canceled]
 request            OR [flanking request rejected/canceled]
 approved]                       ↓
    ↓                          VOIDED
 APPROVED                  (balance refunded)
    |
[HR or manager revokes] ← blocked if payroll locked
    ↓
 REVOKED
(balance restored; LWP flagged for HR review if applicable)
```

**`payroll_locked` is not a status.** It is a computed guard checked at void/revoke time against `payroll_periods`. If any gap date's period is `salary_calculated` or later, the mutation is blocked.

### Rollback Rules Summary

| Event | `pendingDays` | `usedDays` | Attendance | Deduction |
|---|---|---|---|---|
| Application submitted | `+= totalDays` (per year split) | — | — | Created `pending` |
| Manager/admin approves | `-= totalDays` | `+= totalDays` | Upsert `on_leave`/`half_day` | `→ approved` |
| Manager/admin rejects (pending) | `-= totalDays` | — | — | `→ voided` |
| Employee cancels (pending) | `-= totalDays` | — | — | `→ voided` |
| Revoke approved leave | — | `-= totalDays` | Revert to `absent`/`revoked_leave` | `→ revoked` |
| Payroll locked | Block all mutations | Block all mutations | Block attendance revert | Block void/revoke |

**Floor rule enforced by SQL in every mutation:**
```sql
pendingDays = GREATEST(0, pending_days - X)
usedDays    = GREATEST(0, used_days - X)
```

---

## Part 7 — Sandwich Policy Configuration

Fields added to `leave_policies`:

| Field | Type | Default | Meaning |
|---|---|---|---|
| `sandwich_rate` | numeric(4,3) | 1.0 | Deduction multiplier (0.5 = 50%) |
| `sandwich_cap_days` | integer | null | Max gap days per event |
| `sandwich_exempt` | boolean | false | No deduction ever created |
| `sandwich_overflow` | text | `'partial_lwp'` | `'block'` or `'partial_lwp'` when balance insufficient |
| `single_holiday_gap_exempt` | boolean | false | Exempt if gap contains only 1 holiday |
| `cross_type_sandwich` | boolean | false | Sandwich across different leave types |

### Sandwich Gap Detection Rules

| Condition | Sandwich applies? | Charged to |
|---|---|---|
| Same leaveTypeId, both sandwichApplicable, pure off-day gap | Yes | Triggering (second-submitted) request |
| Different leaveTypeId | No | — |
| First type not sandwichApplicable | No | — |
| Gap contains a working day | No | — |
| Gap day covered by another leave request | No | — |
| Triggering request rejected after enclosure | Refund gap days | Deduction → voided |
| Flanking request rejected after enclosure | Refund gap days | Deduction → voided; B's absorbable refunded |
| Flanking request rejected after payroll locked | Block rejection | — |
| Admin creates leave | Same scan applies | — |
| Half-day as flank | Enclosure still applies | Gap to triggering request |

---

## Part 8 — Payroll Engine Changes

### Step 2 — `leave_consolidation` (extended)

**Sub-step 2a** (existing, unchanged): Sum approved `leave_requests.totalDays`
```
paidLeaveDays   += SUM(approved paid leave requests in period)
unpaidLeaveDays += SUM(approved unpaid leave requests in period)
```

**Sub-step 2b** (new): Sum approved `leave_deductions`
```
For approved leave_deductions where is_lwp = false AND leave_type.isPaid = true:
  paidLeaveDays += deducted_days_effective   → reduces LOP → protects salary

For approved leave_deductions where is_lwp = true:
  lwpSandwichDays += lwp_days               → adds to LOP → reduces salary
```

**LOP calculation (monthly employees):**
```
lopFromAbsences     = absentCount + (halfDays × 0.5) + missingCount
lopRecoveredByLeave = min(paidLeaveDays, lopFromAbsences)
netLOP              = lopFromAbsences - lopRecoveredByLeave + lwpSandwichDays

salaryDeduction     = (basicSalary / 30) × netLOP
```

**Important:** Sandwich gap days (Sat/Sun) are weekly-off days — the employee was not absent on those days. They are a balance deduction, not an LOP adjustment. Only the `lwp_days` overflow portion becomes LOP.

### Step 3 — `salary_calculation` (gate added)

Before this step can run, `lop_days_confirmed IS NOT NULL` for every employee in the period. If any employee has unconfirmed LOP, the step is blocked with `PAYROLL_BLOCKED: LOP confirmation required for N employees`.

---

## Part 9 — LWP Exemption for Senior Roles

### 9.1 Policy Statement

Certain senior employees (General Manager, Senior Manager, Superuser, or any role designated by Superuser) are exempt from salary deduction for absent days. For these employees:

- Attendance still records the absence accurately (`absent` or `on_leave` as applicable)
- The absence is fully visible in all HR reports and attendance dashboards
- The payroll engine computes `lop_days_computed` as normal
- **`lop_days_confirmed` is automatically set to 0** — no salary deduction is applied
- The exemption is auditable — every auto-zero is logged with the exemption reason

This separates factual recording (attendance) from financial consequence (payroll) for designated roles.

### 9.2 Schema Design

**New columns on `users` table:**

```sql
ALTER TABLE users ADD COLUMN lwp_exempt              boolean   NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN lwp_exempt_reason       text;
ALTER TABLE users ADD COLUMN lwp_exempt_granted_by   integer REFERENCES users(id);
ALTER TABLE users ADD COLUMN lwp_exempt_granted_at   timestamptz;
ALTER TABLE users ADD COLUMN lwp_exempt_reviewed_at  timestamptz;
ALTER TABLE users ADD COLUMN lwp_exempt_next_review  date;
```

**Field semantics:**

| Field | Purpose |
|---|---|
| `lwp_exempt` | Master flag — if true, no salary deduction for any absent days |
| `lwp_exempt_reason` | Plain-text justification (e.g. "General Manager — Board-level designation") |
| `lwp_exempt_granted_by` | Superuser who granted the exemption |
| `lwp_exempt_granted_at` | Timestamp of grant |
| `lwp_exempt_reviewed_at` | When exemption was last reviewed by HR |
| `lwp_exempt_next_review` | Scheduled date for next review (governance requirement) |

**New table: `lwp_exemption_audit_log`**

```sql
CREATE TABLE lwp_exemption_audit_log (
  id              serial PRIMARY KEY,
  employee_id     integer NOT NULL REFERENCES users(id),
  event_type      text NOT NULL CHECK (event_type IN (
                    'exemption_granted','exemption_revoked',
                    'auto_lop_zeroed','review_completed'
                  )),
  performed_by    integer REFERENCES users(id),
  performed_at    timestamptz NOT NULL DEFAULT NOW(),
  payroll_period  text,
  lop_computed    numeric(5,2),
  lop_confirmed   numeric(5,2),
  reason          text,
  context         jsonb DEFAULT '{}'
);
```

### 9.3 Exemption Grant and Revoke

**Grant — `POST /api/admin/employees/:id/lwp-exempt`**
```
Access: Superuser only

Inputs: reason (required), next_review_date (required)

Validates:
  - reason min 10 chars
  - next_review_date must be in the future (max 12 months)
  - Cannot grant to self

Writes:
  UPDATE users: lwp_exempt=true, lwp_exempt_reason, lwp_exempt_granted_by,
                lwp_exempt_granted_at=now(), lwp_exempt_next_review
  INSERT lwp_exemption_audit_log: event_type='exemption_granted'
```

**Revoke — `DELETE /api/admin/employees/:id/lwp-exempt`**
```
Access: Superuser only

Inputs: reason (required)

Writes:
  UPDATE users: lwp_exempt=false, lwp_exempt_reason=null, lwp_exempt_granted_by=null
  INSERT lwp_exemption_audit_log: event_type='exemption_revoked', reason=reason
```

**Governance — review due alerts:**  
The midnight processor checks `lwp_exempt_next_review` on the day it is due and sends a notification to all Superusers: "[Employee] LWP exemption is due for review today."

### 9.4 Payroll Behavior for Exempt Employees

**In Step 3 — `salary_calculation`:**

Before processing each employee, check `users.lwp_exempt`:

```
IF employee.lwp_exempt = true:
  lop_days_confirmed  = 0       ← auto-set; HR does not need to manually confirm
  lop_confirmed_by    = SYSTEM_USER_ID
  lop_override_notes  = 'LWP exempt: ' + lwp_exempt_reason

  INSERT lwp_exemption_audit_log:
    event_type    = 'auto_lop_zeroed'
    lop_computed  = lop_days_computed  ← factual record of what was computed
    lop_confirmed = 0
    payroll_period = period identifier
    reason        = lwp_exempt_reason

ELSE:
  Require HR confirmation via confirm-lop route (see Part 10)
```

The exempt employee's salary is computed with `netLOP = 0`, producing no deduction. The audit log records exactly what the computed LOP was and that it was zeroed by exemption — not by HR discretion.

### 9.5 LWP Exemption Does NOT Affect

| Item | Behavior |
|---|---|
| Attendance records | `absent` still written exactly as for non-exempt employees |
| Leave balance | Absent days do not consume leave balance (leave was not applied) |
| HR reports — attendance | Absent days appear in all reports |
| HR reports — leave balance | No leave consumed; leave balance unchanged |
| Sandwich deduction | If exempt employee has a sandwich enclosure, the sandwich still deducts from **leave balance**. The LWP exemption only applies to the payroll salary deduction, not to leave balance debits. |
| Disciplinary record | Absence is visible and reportable |
| Notification to manager | Manager still notified of absence (no suppression) |

### 9.6 LWP Exemption Display

**Employee's own payslip:**
```
DEDUCTIONS
  LOP (3 computed absent days — exempt, no deduction): ₹0.00
```

The employee sees the computed absent days and that they were zeroed by policy. No hidden adjustments.

**HR leave management dashboard:**
```
Employee: Anilkumar Rao (GM)
May 2026 Payroll

  Absent days computed:   3
  LWP exempt:             YES — General Manager designation
  LOP confirmed:          0 days (auto-zeroed)
  Salary deduction:       ₹0.00
```

**Admin exemption roster (new admin view):**
```
LWP-Exempt Employees — Current
  Anilkumar Rao    GM    Granted: 01-Jan-2026   Review due: 01-Jan-2027
  Priya Nair       SM    Granted: 15-Mar-2026   Review due: 15-Mar-2027
```

### 9.7 Reconciliation Rule for LWP Exemption

```
R11 — LWP Exemption Auto-Zero:
  For every payroll_attendance_snapshot where employee.lwp_exempt = true:
    lop_days_confirmed MUST = 0
    lop_override_notes MUST contain 'LWP exempt'
    lwp_exemption_audit_log MUST have 'auto_lop_zeroed' entry for this period

  Violation: exempt employee had non-zero lop_days_confirmed → exemption not applied
```

```
R12 — LWP Exemption Grant Integrity:
  For every users row where lwp_exempt = true:
    lwp_exempt_granted_by MUST NOT be null
    lwp_exempt_granted_at MUST NOT be null
    lwp_exempt_next_review MUST NOT be null
    lwp_exempt_next_review MUST be in the future OR review_completed event exists

  Violation: exemption granted without proper authorization or review date
```

---

## Part 10 — LWP Confirmation Gate (Non-Exempt Employees)

### 10.1 Policy

An employee who is absent on a given day (no check-in, no approved leave, no weekly-off, no holiday) must be marked **Absent/LWP** in attendance. However, the payroll engine must not automatically deduct salary for absent days. All salary deductions require explicit HR confirmation.

### 10.2 HR LWP Confirmation Flow

**Route: `POST /api/admin/payroll/confirm-lop`**
```
Inputs: payrollPeriodId, employeeId, confirmedLopDays, notes?

Validates:
  1. Period is in 'attendance_snapshotted' or 'leave_consolidated' state
  2. confirmedLopDays >= 0 AND <= lop_days_computed
  3. If confirmedLopDays < lop_days_computed: notes required

Writes:
  UPDATE payroll_attendance_snapshot:
    lop_days_confirmed = confirmedLopDays
    lop_confirmed_by = userId
    lop_confirmed_at = now()
    lop_override_notes = notes
```

**HR Options:**

| Action | Meaning |
|---|---|
| Confirm LOP = computed value | Full deduction; standard case |
| Confirm LOP = 0 | Full waiver; reason required |
| Confirm LOP = partial | Partial waiver; reason required |
| Mark regularization pending | Block payroll for this employee; allow attendance fix first |

**Bulk route: `POST /api/admin/payroll/confirm-lop/bulk`**
```
Inputs: payrollPeriodId, confirmAll: true

For each employee where lwp_exempt = false AND lop_days_confirmed IS NULL:
  SET lop_days_confirmed = lop_days_computed
  lop_override_notes = 'Bulk confirmed — no override'
```

### 10.3 No-Deduction Scenarios Reference

| Attendance Status | Weekly Off/Holiday | Approved Leave | LWP Exempt | Result |
|---|---|---|---|---|
| `present` | — | — | — | No deduction |
| `half_day` | — | — | — | 0.5 day LOP computed → HR confirm |
| `on_leave` | — | Approved paid | — | LOP recovered by leave → no deduction |
| `weekly_off` | Yes | — | — | No deduction (not working day) |
| `holiday` | Yes | — | — | No deduction (not working day) |
| `absent` | — | — | No | LOP computed → HR must confirm |
| `absent` | — | — | **Yes** | LOP computed → auto-zeroed → no deduction |
| No record (missing) | — | — | No | `missingCount` → LOP computed → HR confirm |
| No record (missing) | — | — | **Yes** | `missingCount` → auto-zeroed → no deduction |

### 10.4 Payslip Display

**Full LOP confirmed:**
```
DEDUCTIONS
  LOP (2 days — absent, confirmed by HR): -₹3,333.33
```

**LOP waived:**
```
DEDUCTIONS
  LOP: ₹0.00 (2 computed absent days — waived by HR: [reason])
```

**LWP exempt:**
```
DEDUCTIONS
  LOP (3 computed absent days — exempt, no deduction): ₹0.00
```

**LWP sandwich (balance insufficient):**
```
DEDUCTIONS
  LOP (2 absent days):          -₹3,333.33
  LWP — Sandwich (1 day):       -₹1,666.67
```

---

## Part 11 — CL Monthly Accrual Policy

### 11.1 Policy

CL accrues at **1.25 days per calendar month**, credited on the 1st of each month. Maximum 15 days per year. Mid-year joiners receive pro-rated credit from joining month.

### 11.2 `runMonthlyClAccrual(db, creditMonth, creditYear)`

```
Called by: AttendanceMidnightProcessor on 1st of each month (IST)

For each active employee:
  a. If joining month matches creditMonth/Year:
       daysInMonth = calendar days in month
       daysFromJoin = daysInMonth - joinDate.day + 1
       credit = ROUND((1.25 / daysInMonth) * daysFromJoin, 2)
     Else:
       credit = 1.25

  b. Cap: if (allocatedDays + credit) > 15:
       credit = 15 - allocatedDays
       if credit <= 0: skip

  c. UPSERT leave_balances:
       allocatedDays += credit

  d. INSERT leave_accrual_log:
       reason = joining month ? 'pro_rated' : 'monthly_accrual'
       balance_before, balance_after
```

### 11.3 `runYearEndClCarryover(db, fromYear, toYear)`

```
Called by: AttendanceMidnightProcessor on Dec 31 (IST)

For each active employee:
  remainingCL = allocatedDays + carryoverDays - usedDays - pendingDays (fromYear)

  IF leaveType.carryoverAllowed = true:
    carryover = min(remainingCL, leaveType.maxCarryoverDays)
  ELSE:
    carryover = 0

  INSERT leave_balances (year=toYear, allocatedDays=0, carryoverDays=carryover, ...)
  INSERT leave_accrual_log: reason='year_end_carryover'
```

### 11.4 Accrual Interaction Rules

- Balance check in `applyLeave()` uses only credited `allocatedDays` — future accruals are invisible
- Manual admin adjustments must write to `leave_accrual_log` with `reason='manual_adjustment'`
- CL accrual uses `accrual_type = 'monthly'` flag on the CL leave type record

---

## Part 12 — Balance Display

### Employee Leave Balance Card

**Normal state (sufficient balance):**
```
Annual Leave — 2026
  Allocated:                    12.00 days
  Carried over:                  2.00 days
  Used (leaves):                 2.00 days
  Used (sandwich deduction):     2.00 days
  Pending approval:              1.00 day
  ─────────────────────────────────────────
  Available:                     9.00 days
```

**Partial LWP state:**
```
Annual Leave — 2026
  Allocated:                     2.00 days
  Used (leaves):                 1.00 day
  Used (sandwich deduction):     1.00 day
  Pending:                       0.00 days
  Available:                     0.00 days

  ⚠ 1 sandwich day pending LWP confirmation by HR
```

---

## Part 13 — Complete Reconciliation Rules

| # | Rule | Tables | When |
|---|---|---|---|
| R1 | `usedDays` = SUM(approved leave_requests) + SUM(approved deductions absorbable) | leave_balances, leave_requests, leave_deductions | After every balance mutation; nightly |
| R2 | `pendingDays` = SUM(pending requests) + SUM(pending deductions absorbable) | Same | After every balance mutation; nightly |
| R3 | Every approved leave date (non-off-day) has `on_leave` attendance with `statusSource='leave'` | leave_requests, attendance_records | Nightly |
| R4 | No sandwich gap date has `on_leave` attendance record | leave_deductions, attendance_records | After every deduction creation |
| R5 | Deduction status consistent with flanking request statuses | leave_deductions, leave_requests | After every leave status change |
| R6 | Snapshot `sandwich_paid_days` matches live approved deductions | leave_deductions, payroll_attendance_snapshot | Before payroll finalization |
| R7 | `usedDays >= 0` AND `pendingDays >= 0` | leave_balances | After every balance mutation |
| R8 | `available >= 0` unless admin override on file | leave_balances | After every balance mutation |
| R9 | CL `allocatedDays` = SUM(accrual log) for year up to current month | leave_balances, leave_accrual_log | Nightly; after each accrual run |
| R10 | No `salary_calculated` payroll exists without prior `lop_days_confirmed` | payroll_attendance_snapshot, payroll_periods | Before payroll finalization |
| R11 | LWP-exempt employee always has `lop_days_confirmed = 0` in payroll snapshot | payroll_attendance_snapshot, users | Before payroll finalization |
| R12 | Every `lwp_exempt = true` user has granted_by, granted_at, next_review set | users, lwp_exemption_audit_log | Nightly; after each grant/revoke |

---

## Part 14 — Zero-Trust Test Cases

### Leave Balance Integrity

| # | Scenario | Expected |
|---|---|---|
| T01 | Apply leave with balance = 0 (paid) | `INSUFFICIENT_BALANCE` — no balance change |
| T02 | Two simultaneous overlapping leave submissions | Second fails `OVERLAPPING_LEAVE` |
| T03 | Apply → approve → verify balance | `usedDays += N`, `pendingDays` restored |
| T04 | Apply → reject → verify balance | `pendingDays` fully restored, `usedDays` unchanged |
| T05 | Apply → cancel → verify balance | Same as T04 |
| T06 | Apply → approve → revoke → verify balance | `usedDays` fully restored |
| T07 | Cross-year leave (Dec 28 → Jan 3) → apply | `pendingDays` split across two balance rows |
| T08 | Cross-year leave → approve | `usedDays` split across two balance rows |
| T09 | Admin approve via admin route | `usedDays` incremented (parity with manager) |
| T10 | Admin reject via admin route | `pendingDays` decremented (parity with manager) |
| T11 | Concurrent reject + cancel (race condition) | `GREATEST(0,...)` floor; never negative |
| T12 | Double revoke | Second blocked: `status != 'approved'` guard |

### Sandwich Detection

| # | Scenario | Expected |
|---|---|---|
| T13 | Friday AL + Monday AL, weekends off | Deduction created for Sat+Sun (2 days) |
| T14 | Friday AL + Monday AL, Saturday has a leave request | No enclosure (gap not purely off-days) |
| T15 | Friday AL + Monday CL (different type) | No sandwich |
| T16 | Friday SL (sandwich=false) + Monday AL | No sandwich |
| T17 | Half-day Friday + Monday AL | Sandwich applies; half-day is valid flank |
| T18 | 3-request enclosure (Thu+Fri, Sat+Sun, Mon) | Two deduction records; independently lifecycle-managed |
| T19 | Sandwich with balance = 0 (partial_lwp policy) | `absorbable=0`, `lwp_days=2`, HR notified |
| T20 | Sandwich with balance = 1, gap = 2 | `absorbable=1`, `lwp_days=1`, `pendingDays += 1` only |
| T21 | Employee has `sandwich_exempt = true` policy | Exemption log written; no deduction created |

### Sandwich Rollback

| # | Scenario | Expected |
|---|---|---|
| T22 | Deduction pending → reject triggering request B | Deduction voided; `pendingDays -= absorbable` |
| T23 | Deduction pending → reject flanking request A | Deduction voided; `pendingDays -= absorbable` |
| T24 | Deduction approved → revoke request B | Deduction revoked; `usedDays -= absorbable` |
| T25 | Deduction approved → revoke request A | Deduction revoked; `usedDays -= absorbable` |
| T26 | Double-void (reject A then reject B) | Second void skipped; no double refund |
| T27 | Revoke approved deduction while payroll locked | Blocked with `PAYROLL_LOCKED` |
| T28 | HR confirms LWP → payroll runs → balance check | `lwp_days` in payroll snapshot; NOT in `usedDays` |

### LWP Exemption

| # | Scenario | Expected |
|---|---|---|
| T29 | GM is absent 3 days, `lwp_exempt = true` | Absent written to attendance; `lop_computed = 3`; `lop_confirmed = 0` (auto) |
| T30 | GM payslip | Shows "3 computed absent days — exempt, no deduction" |
| T31 | Exempt GM applies sandwich leave (balance sufficient) | Sandwich deduction still hits leave balance; no salary deduction |
| T32 | Exempt GM applies sandwich leave (balance insufficient) | LWP overflow auto-zeroed in payroll snapshot |
| T33 | Non-superuser tries to grant LWP exemption | Rejected — Superuser only |
| T34 | Superuser tries to grant LWP exemption to self | Rejected — cannot exempt self |
| T35 | LWP exemption review date passes | Superusers notified; exemption not auto-revoked |
| T36 | Revoke LWP exemption mid-payroll-period | Next payroll run applies LOP normally for that period |
| T37 | Exempt employee — payroll salary_calculation runs | `lop_days_confirmed = 0` already set; no gate blocking |

### LWP Confirmation Gate (Non-Exempt)

| # | Scenario | Expected |
|---|---|---|
| T38 | Non-exempt employee absent, HR bulk-confirms | `lop_days_confirmed = lop_days_computed` |
| T39 | Non-exempt employee absent, HR waives 1 of 2 LOP days | `lop_days_confirmed = 1`, notes required |
| T40 | Payroll salary_calculation attempted with unconfirmed LOP | Blocked with `PAYROLL_BLOCKED` error |
| T41 | Regularization approved after LOP computed | LOP re-computed; old confirmation voided; HR must re-confirm |

### CL Accrual

| # | Scenario | Expected |
|---|---|---|
| T42 | CL accrual runs on Feb 1 | `allocatedDays += 1.25` for all active employees |
| T43 | Employee joins Feb 15, accrual runs Mar 1 | Feb pro-rated: `(14/28) × 1.25 = 0.63`; Mar: 1.25 |
| T44 | Employee already at 15 CL days, accrual runs | No credit — cap enforced; accrual log shows 0 |
| T45 | Year-end carryover runs Dec 31 | New year row created with `carryoverDays`; Jan 1 accrual adds 1.25 |
| T46 | CL accrual log vs `allocatedDays` reconciliation | R9 passes for all employees |

### Payroll Integration

| # | Scenario | Expected |
|---|---|---|
| T47 | 4 leave days (2 requests + 2 sandwich, paid, sufficient balance) | `paidLeaveDays = 4`; zero salary deduction |
| T48 | Sandwich 2 days are LWP | `paidLeaveDays = 2`, `lwpSandwichDays = 2`; salary deducted for LWP only |
| T49 | Leave approved between payroll Step 1 and Step 2 | Step 2 corrects via leave_consolidation; final result correct |
| T50 | Apply new leave during payroll-locked period | Blocked with `PAYROLL_LOCKED` |

---

## Part 15 — Implementation Order

| Step | Action | Risk if skipped |
|---|---|---|
| 1 | Schema migration: all new tables + columns | Nothing works without schema |
| 2 | Create `server/leave-service.ts` — all service functions | Foundation for all following steps |
| 3 | Refactor `server/leave-routes.ts` — inline logic → service calls | Balance drift in existing routes |
| 4 | Fix `server/admin-routes.ts` — admin routes call service | Admin bypass continues corrupting balances |
| 5 | Add revoke routes (employee + admin) | No reversal path for approved leaves |
| 6 | Add LWP confirmation route + bulk route | LWP confirmation has no endpoint |
| 7 | Add LWP exemption grant/revoke routes | Senior employee exemption cannot be managed |
| 8 | Implement `createSandwichDeductionIfEnclosed` inside `applyLeave` | Sandwich avoidance via split applications continues |
| 9 | Implement `runMonthlyClAccrual()` and wire into midnight processor | CL not accruing monthly |
| 10 | Implement `runYearEndClCarryover()` and wire into midnight processor | Year-end CL does not carry over |
| 11 | Extend `payroll-run-engine.ts` — sub-step 2b + LOP confirmation gate + LWP exemption auto-zero | Payroll misses sandwich; salary deducted without HR confirmation |
| 12 | Update client balance display — sandwich sub-line, accrual history | Employee cannot see why balance dropped |
| 13 | Update payslip display — LOP confirmed vs computed, sandwich LWP, exemption note | Payslip opaque; disputes unresolvable |
| 14 | Add admin LWP exemption roster view | Exemption governance unmanageable |
| 15 | Run reconciliation rules R1–R12 against existing data | Historical data drift remains undetected |
