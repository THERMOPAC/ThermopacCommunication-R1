# Leave Management — Closure Correction Plan v1.0
**Date:** 06-May-2026  
**Parent Audit:** `docs/leave-mgmt-zero-trust-audit-v1.md` (Conditional PASS)  
**Baseline:** `docs/leave-management-correction-plan-baseline-v1.0.md`  
**Status:** PENDING APPROVAL — Do not implement until this plan is approved.

---

## Evidence Confirmation

All items below are evidenced by live DB queries and code inspection run on 06-May-2026.
The audit report at `docs/leave-mgmt-zero-trust-audit-v1.md` contains the full DB/API
evidence tables for every item. Specific evidence for each closure item is cited inline.

---

## Item 1 — R1: Historical Leave Balance Drift (7 Records)

### Evidence
Live DB query (06-May-2026):

| User | Role | Leave Type | Balance `used_days` | Approved Days (SUM) | Drift |
|---|---|---|---|---|---|
| Tarkeshwar (id=32) | Employee | Unpaid Leave | 196.00 | 13.00 | **+183.00** |
| Manjusha (id=13) | Manager | Casual Leave | 0.00 | 6.00 | -6.00 |
| Sagar (id=16) | Employee | Casual Leave | 1.00 | 4.00 | -3.00 |
| Pravin (id=18) | Employee | Casual Leave | 1.00 | 3.50 | -2.50 |
| Bhushan (id=11) | Employee | Casual Leave | 0.00 | 2.00 | -2.00 |
| Mansi (id=5) | Manager | Casual Leave | 4.00 | 5.00 | -1.00 |
| Roshan (id=25) | Employee | Casual Leave | 5.50 | 6.00 | -0.50 |

**Root cause (two distinct sources):**

- **Tarkeshwar (+183):** `server/salary-calculation-engine.ts` auto-applied 183 unpaid leave days directly to `leave_balances.used_days` when `updateBalances=true` was set in payroll. This is the direct-write Rule 1 violation documented in the audit. The 183 has no corresponding `leave_requests` rows.
- **Six CL users (-0.5 to -6):** Old admin bypass route (`POST /leave/admin/...`) approved leave requests without updating `leave_balances.used_days`. The approved requests exist in `leave_requests` but `used_days` was never incremented.

### Proposed Fix

**Step 1 — HR verification (prerequisite, not code):**  
HR must review the 7 rows and confirm one of two dispositions for each:
- **Accept correction:** Reset `used_days` to match `SUM(approved leave_requests.total_days)`.
- **Accept as-is:** Leave the balance untouched and document the business reason (e.g., Tarkeshwar's 183 days may reflect a legitimate long-term unpaid absence approved outside the system).

**Step 2 — One-time reconciliation script (code):**  
Write a standalone script `scripts/reconcile-r1-balances.ts` that:
1. Takes a `--dry-run` flag (prints changes without writing).
2. For each affected (user_id, leave_type_id, year) approved by HR:
   - Computes `correct_used = SUM(approved leave_requests.total_days)`.
   - Updates `leave_balances.used_days = correct_used`.
   - Writes one row to a new `balance_correction_log` table recording `before_value`, `after_value`, `corrected_by`, `correction_reason`, `corrected_at`.
3. Runs inside a single `db.transaction()` — atomic, all-or-nothing.
4. Prints a diff report before committing.

**Files to change:**
- New file: `scripts/reconcile-r1-balances.ts`
- New migration: `ALTER TABLE leave_balances ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMP` (audit trail)
- New table migration: `CREATE TABLE balance_correction_log (...)` (permanent audit record)
- No changes to `leave-service.ts` or routes — correction is data-only.

**Acceptance criteria:**
- `--dry-run` output reviewed and approved by HR before live run.
- After run: R1 reconciliation query returns 0 drift rows for corrected users.
- `balance_correction_log` has one row per corrected balance with full audit trail.
- R7 (no negative balances) still passes after correction.

---

## Item 2 — R3: 99 Approved-Leave Attendance Gaps

### Evidence
Live DB query (06-May-2026):

- **99 approved leave request/date combinations** where no `on_leave` or `half_day` attendance record exists.
- **24 users** affected.
- **Critical observation:** R3 check includes future-dated approved leaves (e.g., Roshan req_id=7 on 2026-08-01). Future leave dates legitimately have no attendance record yet — the check must be scoped to `date <= CURRENT_DATE`.

**Revised scope after scoping to past dates:**
The query currently counts all approved leave dates including future ones. The correct violation count applies only to dates ≤ today.

Top affected users by request count: Bhamble (5), Jawahar (5), Darshan (4), Sagar (4), Roshan (3), Sitaram (3), Mangesh (3), Amritanand (3).

**Root cause:** Old approval routes (pre-service-layer) approved leave without calling `writeAttendanceForLeave`. All gap requests predate 06-May-2026.

### Proposed Fix

**Phase A — Fix R3 check (immediate, code):**  
Update the R3 reconciliation query in the audit/reconciliation tooling (and any admin UI that runs R3) to add `AND dates.date_val <= CURRENT_DATE`. This filters out future leave dates that legitimately have no attendance yet. This will reduce the 99 count to the true historical violation count.

**Phase B — Backfill script (code):**  
Write `scripts/backfill-r3-attendance.ts` that:
1. Selects all approved `leave_requests` where, for any date in `[start_date, end_date]` (past dates only, `<= CURRENT_DATE`), no `on_leave`/`half_day` attendance record exists.
2. For each gap date:
   - If no attendance record exists: inserts `{status: 'on_leave'/'half_day', statusSource: 'leave', source: 'system', adminNotes: 'Backfilled by R3 closure script'}`.
   - If attendance record exists with `statusSource = 'admin_override'`: **skips** (never overwrite admin decisions).
   - If attendance record exists with other status: updates to `on_leave`/`half_day` with `statusSource='leave'`, logs the overwrite.
3. Runs inside `db.transaction()`.
4. Supports `--dry-run`.
5. Produces a report: rows inserted, rows skipped (admin_override), rows updated.

**Files to change:**
- New file: `scripts/backfill-r3-attendance.ts`
- No schema changes required.
- No changes to `leave-service.ts` — the service already writes correctly for new approvals.

**Acceptance criteria:**
- After scoping R3 to past dates: count of genuine violations identified and documented.
- After backfill: R3 query (past dates only) returns 0 violations.
- R4 (no sandwich gap has on_leave attendance) still passes after backfill.
- 0 `admin_override` records overwritten (verified by script report).

---

## Item 3 — T07/T08: Cross-Year Leave Split Validation

### Evidence
- **0 cross-year leave requests** exist in DB (confirmed by `SELECT ... WHERE EXTRACT(YEAR FROM start_date) != EXTRACT(YEAR FROM end_date)`).
- Current code (`server/leave-service.ts`, `applyLeave()`): balance year is derived from `startDate` year only. Example: a leave from 28-Dec-2026 to 03-Jan-2027 would consume 7 days from the **2026** CL balance only, leaving 2027 balance untouched.
- No runtime error occurs — the incorrect behaviour is silent.

### Proposed Fix

**`applyLeave()` in `server/leave-service.ts`:**

When `EXTRACT(YEAR FROM startDate) != EXTRACT(YEAR FROM endDate)`:
1. **Split the request** into two spans at the year boundary:
   - Span A: `startDate → 31-Dec-YYYY`, days = working days in span A.
   - Span B: `01-Jan-(YYYY+1) → endDate`, days = working days in span B.
2. Deduct `pendingDays` from balance year YYYY for Span A days.
3. Deduct `pendingDays` from balance year YYYY+1 for Span B days.
4. Both deductions in the same transaction.
5. On approval: `usedDays` credited to the respective year's balance.
6. On reject/cancel/revoke: reverse from the same year-split balances.

**`cancelLeave()`, `rejectLeave()`, `approveLeave()`, `revokeApprovedLeave()`** in `server/leave-service.ts`:  
All these functions must read `startDate` and `endDate` from the leave request and apply the same year-split logic when reversing or moving balance.

**Files to change:**
- `server/leave-service.ts` — `applyLeave()`, `approveLeave()`, `rejectLeave()`, `cancelLeave()`, `revokeApprovedLeave()`
- No schema changes required.
- `docs/leave-mgmt-zero-trust-audit-v1.md` — update T07/T08 to PASS after fix.

**Test cases to execute after fix:**

| Test | Input | Expected |
|---|---|---|
| T07 | Apply: start=28-Dec-2026, end=03-Jan-2027 | 2026 balance: pendingDays += 4; 2027 balance: pendingDays += 3 |
| T08 | T07 → Approve | 2026: usedDays += 4, pendingDays -= 4; 2027: usedDays += 3, pendingDays -= 3 |
| T08a | T07 → Reject | 2026: pendingDays -= 4; 2027: pendingDays -= 3 |
| T08b | T07 → Approve → Revoke | 2026: usedDays -= 4; 2027: usedDays -= 3 |
| T08c | Cross-year where 2027 balance = 0 | Returns `INSUFFICIENT_BALANCE` (2027 leg) at apply time |

**Acceptance criteria:**
- All 5 test cases above pass.
- No cross-year request causes negative balance in either year.
- Existing T01–T06 and T09–T12 (same-year) tests continue to pass.

---

## Item 4 — T28/T48: Wire Sandwich LWP Days into Payroll Consolidation

### Evidence
- `leave_deductions` table has **no `is_lwp` column** (confirmed by schema inspection).
- `payroll_attendance_snapshot` has `sandwich_lwp_days` column (present in `shared/schema.ts` line 5825) — but `stepLeaveConsolidation` (`server/payroll-run-engine.ts` line 478) does not populate it.
- `stepLeaveConsolidation` currently reads approved leave requests and updates `paidLeaveDays`/`unpaidLeaveDays` but does not read `leave_deductions` at all.
- `salary-calculation-engine.ts` (existing engine) does not consume `sandwich_lwp_days` from the snapshot.

### Proposed Fix

**Step 1 — Schema: Add `is_lwp` to `leave_deductions`:**
```sql
ALTER TABLE leave_deductions
  ADD COLUMN IF NOT EXISTS is_lwp BOOLEAN NOT NULL DEFAULT FALSE;
```
Update `shared/schema.ts` `leaveDeductions` table definition to add `isLwp: boolean('is_lwp').notNull().default(false)`.

**Step 2 — Service: Set `is_lwp` when creating deductions (`server/leave-service.ts`):**  
In `createSandwichDeductionsForLeave()` (line 181), when a sandwich gap date falls on a date where the employee has **insufficient leave balance** (balance < deduction days), mark the deduction row `is_lwp = true`. This mirrors the baseline Part 4.3 Step 5 logic.

For simplicity in Phase 1: mark `is_lwp = true` only when `leaveType.sandwichApplicable = true` and the employee's available balance (after the triggering leave) is < sandwich gap days. If unsure, default `is_lwp = false` and let HR correct via LOP confirmation.

**Step 3 — Consolidation: Populate `sandwich_lwp_days` in `stepLeaveConsolidation()` (`server/payroll-run-engine.ts` line 478):**  
After processing approved leave requests, for each employee:
1. Query `leave_deductions` where `employee_id = emp.id AND status = 'approved' AND deduction_date BETWEEN period.startDate AND period.endDate AND is_lwp = true`.
2. Sum `days` → `sandwichLwpDays`.
3. Update `payrollAttendanceSnapshot` `sandwich_lwp_days = sandwichLwpDays`.

**Step 4 — Salary calculation: Consume `sandwich_lwp_days` in `stepSalaryCalculation()` (line 600):**  
When computing `lopDays` for the salary calculation:
```
effectiveLop = snapshot.lopDays + snapshot.sandwich_lwp_days
```
For LWP-exempt employees: `effectiveLop = 0` (sandwich LWP waived by exemption).

**Files to change:**
- `shared/schema.ts` — add `isLwp` to `leaveDeductions`
- `server/leave-service.ts` — `createSandwichDeductionsForLeave()`, balance check for `is_lwp` flag
- `server/payroll-run-engine.ts` — `stepLeaveConsolidation()` (populate `sandwich_lwp_days`), `stepSalaryCalculation()` (consume it)
- New DB migration: `ALTER TABLE leave_deductions ADD COLUMN is_lwp BOOLEAN NOT NULL DEFAULT FALSE`

**Acceptance criteria:**
- T28: Employee with 0 CL balance, Fri+Mon leave, Sat/Sun sandwich → `leave_deductions` rows have `is_lwp=true`, payroll snapshot has `sandwich_lwp_days=2`, `effectiveLop += 2`.
- T48: LWP-exempt employee in same scenario → `sandwich_lwp_days=2` in snapshot but `effective_lop = 0` (`lwp_exempt_applied=true`).
- T47 (paid sandwich) still passes — `is_lwp=false` deductions do not increase LOP.
- R6 passes: `SUM(leave_deductions.days WHERE is_lwp=false AND status='approved')` = `snapshot.sandwich_paid_days`.

---

## Item 5 — T40: Enforce Payroll Hard-Block When LOP is Unconfirmed

### Evidence
- `stepSalaryCalculation()` (`server/payroll-run-engine.ts` line 600) currently has **no gate** checking whether `lop_days_confirmed IS NOT NULL` before proceeding.
- The column `lop_days_confirmed` exists in `payroll_attendance_snapshot` (`shared/schema.ts` line 5828) but is never checked at the `salary_calculation` step entry point.
- 2 payroll periods exist in `draft` status — no `salary_calculation` run has been executed yet, so no violation has occurred. But the gate must exist before the first run.
- `admin-routes.ts` line 2438 already queries `lop_confirmed_at IS NULL` for the HR confirmation UI — the data model is correct, only the enforcement gate is missing.

### Proposed Fix

**In `stepSalaryCalculation()` (`server/payroll-run-engine.ts` line 600), at function entry, before iterating employees:**

```typescript
// Gate: Reject salary calculation if any non-exempt employee
// has lop_days_computed > 0 but lop_days_confirmed IS NULL
const unconfirmedLop = await db
  .select({ userId: payrollAttendanceSnapshot.userId })
  .from(payrollAttendanceSnapshot)
  .leftJoin(users, eq(users.id, payrollAttendanceSnapshot.userId))
  .where(
    and(
      eq(payrollAttendanceSnapshot.periodId, periodId),
      eq(payrollAttendanceSnapshot.runNumber, runNumber),
      isNull(payrollAttendanceSnapshot.lopDaysConfirmed),
      gt(payrollAttendanceSnapshot.lopDaysComputed, '0'),
      eq(users.lwpExempt, false)    // exempt employees don't need confirmation
    )
  );

if (unconfirmedLop.length > 0) {
  return {
    success: false,
    employeesProcessed: 0,
    employeesSkipped: employees.length,
    errorCount: 1,
    summary: { blockedByUnconfirmedLop: unconfirmedLop.length },
    exceptions: [{
      userId: 0,
      type: 'lop_unconfirmed',
      severity: 'error',
      title: `Salary calculation blocked: ${unconfirmedLop.length} employee(s) have unconfirmed LOP`,
      details: `HR must confirm LOP for all employees via the LOP Confirmation panel before running salary calculation.`,
    }],
  };
}
```

**Additionally:** The payroll wizard frontend (`client/src/components/payroll-run-wizard.tsx`) must show a clear warning/blocker at the `salary_calculation` step card if unconfirmed LOP exists, with a link to the LOP Confirmation panel.

**Files to change:**
- `server/payroll-run-engine.ts` — `stepSalaryCalculation()` entry gate (approximately line 607)
- `client/src/components/payroll-run-wizard.tsx` — add unconfirmed-LOP warning at salary_calculation step
- No schema changes required.

**Acceptance criteria:**
- T40: With 1 employee having `lop_days_computed=2` and `lop_days_confirmed IS NULL`, invoking `salary_calculation` step returns `success=false`, `errorCount=1`, error type `lop_unconfirmed`. No salary snapshot is written.
- T40b: After HR confirms LOP for all employees → `salary_calculation` proceeds normally.
- LWP-exempt employees are not checked (they never need LOP confirmation since their effective LOP is 0).
- Payroll wizard shows a clear "X employees have unconfirmed LOP" warning at the salary_calculation step.

---

## Item 6 — T41: Recompute LOP After Regularization Changes Attendance

### Evidence
- When `POST /attendance/regularization/:id/approve` is called (`server/attendance-routes.ts` line 1247):
  - Attendance record is updated (e.g., absent → present, or check-in/check-out corrected).
  - If a payroll snapshot (`payroll_attendance_snapshot`) already exists for this employee+period, its `lop_days_computed` is **not recomputed** — it becomes stale.
  - 0 rows currently in `payroll_attendance_snapshot` — no live violations yet, but the gap will manifest on the first payroll run that overlaps a regularization approval.
- The regularization CL credit (`attendance-routes.ts` lines 1473–1490) writes `allocatedDays += 1` directly to `leave_balances`. This is an `allocatedDays` write (not `usedDays`/`pendingDays`), classified as acceptable exception in the audit, but it also has no accrual log entry.

### Proposed Fix

**Part A — Snapshot invalidation on regularization approval:**  
In the regularization approval route (`attendance-routes.ts` line 1503 region), after updating the attendance record, add:

```typescript
// Invalidate the payroll attendance snapshot for this employee+period
// so stepAttendanceSnapshot will recompute on the next payroll run
const coveredPeriod = await db
  .select({ id: payrollPeriods.id })
  .from(payrollPeriods)
  .where(
    and(
      lte(payrollPeriods.startDate, reg.requestDate),
      gte(payrollPeriods.endDate, reg.requestDate),
      inArray(payrollPeriods.status, ['draft', 'attendance_snapshot'])
    )
  );
if (coveredPeriod.length > 0) {
  await db.update(payrollAttendanceSnapshot)
    .set({ lopDaysComputed: null, lopDaysConfirmed: null, lop_confirmed_by: null })
    .where(
      and(
        eq(payrollAttendanceSnapshot.periodId, coveredPeriod[0].id),
        eq(payrollAttendanceSnapshot.userId, reg.employeeId)
      )
    );
}
```
**Important guard:** Only invalidate if the payroll period status is `draft` or `attendance_snapshot` — never invalidate a snapshot where `lop_days_confirmed IS NOT NULL` and payroll is at `salary_calculation` stage or beyond (that would be a payroll integrity violation).

**Part B — CL credit goes through accrual log:**  
The Scenario B CL credit (`attendance-routes.ts` lines 1473–1490) writes `allocatedDays += 1` directly. This should also log to `leave_accrual_log` with `notes = 'CL credited via regularization approval'` and `deduction_type = 'regularization_credit'`. This makes R9 (CL allocated = accrual log) correct for regularization credits.

**Files to change:**
- `server/attendance-routes.ts` — regularization approval route lines 1503–1514: add snapshot invalidation block (Part A)
- `server/attendance-routes.ts` — lines 1473–1490: add `leave_accrual_log` insert after `leave_balances` update (Part B)
- No schema changes required.

**Acceptance criteria:**
- T41a: Regularization approved → attendance flips absent→present → `payroll_attendance_snapshot.lop_days_computed` is NULL (invalidated) for that employee+period (if period is in draft/snapshot stage).
- T41b: Next `stepAttendanceSnapshot` run → snapshot is recomputed with corrected attendance.
- T41c: Regularization approved after payroll is at `salary_calculation` stage → snapshot NOT touched (period status guard).
- T41d: Scenario B CL credit → `leave_accrual_log` row inserted.
- R9 passes after T41d fix.

---

## Item 7 — T43/T44: CL Accrual Pro-Rating and Annual Cap Validation

### Evidence
- `leave_types.accrual_pro_rate = true` (column present, value set).
- `leave_types.max_days_per_year = 8.00` for CL (the annual cap — confirmed live).
- `users.date_of_joining` column exists; employees who joined mid-2025 or 2026: Vijay (2026-04-01), Suraj (2025-12-01), Vinit (2025-10-01), Pratik (2025-09-13), Amritanand (2025-08-01), Tarkeshwar (2025-05-13), Lawrence (2025-02-18), Roshan (2025-02-01).
- `runMonthlyClAccrual()` in `server/leave-service.ts` (line 601): currently loops **all** active users and credits the full `rate = 1.25` regardless of join date or cap.
- **Cap consistency note:** `max_days_per_year = 8.00`, but `1.25 × 12 = 15.00`. This means the cap is hit at ~6.4 months of accrual. Business intent must be confirmed with HR before implementing cap logic.

### Proposed Fix

**T43 — Pro-rating for new joiners:**  
In `runMonthlyClAccrual()` (`server/leave-service.ts` line 633), for each user, before crediting:

```typescript
// Pro-rate check: employee joined in the accrual month?
const employee = await db.select({ dateOfJoining: users.dateOfJoining })
  .from(users).where(eq(users.id, user.id));
const joinDate = employee[0]?.dateOfJoining;
const [accrualYear, accrualMonthNum] = accrualMonth.split('-').map(Number);

let creditRate = rate; // full rate by default
if (joinDate && lt.accrualProRate) {
  const jYear = joinDate.getFullYear();
  const jMonth = joinDate.getMonth() + 1; // 1-based
  if (jYear === accrualYear && jMonth === accrualMonthNum) {
    // Pro-rate: credit proportional to days remaining in month from join date
    const daysInMonth = new Date(accrualYear, accrualMonthNum, 0).getDate();
    const joinDay = joinDate.getDate();
    const remainingDays = daysInMonth - joinDay + 1;
    creditRate = parseFloat((rate * remainingDays / daysInMonth).toFixed(2));
  } else if (jYear > accrualYear || (jYear === accrualYear && jMonth > accrualMonthNum)) {
    // Employee hasn't joined yet — skip entirely
    skipped++;
    continue;
  }
}
```

**T44 — Annual cap enforcement:**  
Before crediting each user, check the **current year's total accrued** from `leave_accrual_log` and compare to `max_days_per_year`:

```typescript
const yearAccrued = await db
  .select({ total: sql<number>`SUM(days_accrued::numeric)` })
  .from(leaveAccrualLog)
  .where(
    and(
      eq(leaveAccrualLog.userId, user.id),
      eq(leaveAccrualLog.leaveTypeId, lt.id),
      like(leaveAccrualLog.accrualMonth, `${year}-%`)
    )
  );
const alreadyAccrued = parseFloat(yearAccrued[0]?.total?.toString() ?? '0');
const cap = parseFloat(lt.maxDaysPerYear?.toString() ?? '0');
if (cap > 0 && alreadyAccrued >= cap) {
  skipped++; // cap already reached
  continue;
}
// Clamp to cap if partial credit would exceed it
if (cap > 0 && alreadyAccrued + creditRate > cap) {
  creditRate = cap - alreadyAccrued;
}
```

**Pre-implementation gate — HR confirmation required:**  
Before implementing T44, HR must confirm: is the `max_days_per_year = 8.00` cap intentional for CL? At 1.25/month, the cap is reached in month 7 (August for employees who joined Jan 1). If incorrect, HR should update `max_days_per_year` to the correct value (e.g., 15.00 if no cap is intended). Implementation proceeds only after HR confirms.

**Files to change:**
- `server/leave-service.ts` — `runMonthlyClAccrual()` (lines 633–680): add pro-rate and cap checks
- No schema changes required (all needed columns already exist: `date_of_joining`, `max_days_per_year`, `accrual_pro_rate`).

**Acceptance criteria:**
- T43a: Employee Vijay (joined 2026-04-01) runs April 2026 accrual → credited `1.25 × (30/30) = 1.25` days (joined day 1 of April, no pro-rate reduction).
- T43b: Employee joining 2026-04-15 runs April 2026 accrual → credited `1.25 × (16/30) ≈ 0.67` days.
- T43c: Employee joining 2026-05-01 → April 2026 accrual → skipped (joined after April).
- T44a: Employee with 8.00 already accrued in 2026 → July 2026 accrual → skipped (cap reached).
- T44b: Employee with 7.50 already accrued → July 2026 accrual (rate=1.25) → credited 0.50 (cap clamp).
- Idempotency: re-running the same month still skipped (existing log entry blocks re-run, regardless of cap/pro-rate).

---

## Implementation Order & Dependencies

```
Item 1 (R1 reconcile)          — No code dependencies. Needs HR sign-off first.
Item 2 (R3 backfill)           — No code dependencies. Needs R3 query fix first (Phase A).
Item 3 (T07/T08 cross-year)    — No dependencies on other items.
Item 4 (T28/T48 sandwich LWP)  — Must complete schema migration before service changes.
Item 5 (T40 payroll gate)      — No dependencies (additive gate on existing flow).
Item 6 (T41 regularization)    — No dependencies. Part B depends on Item 2 R9 check.
Item 7 (T43/T44 CL accrual)    — Needs HR confirmation on cap value before implementing T44.

Suggested execution order: 5 → 4 → 3 → 2 → 1 → 6 → 7
Rationale: 5 (payroll gate) is highest-risk prevention; 4 needs schema migration;
3 is logic-only; 1 and 2 are data-only with HR gate; 6 and 7 are additive refinements.
```

---

## Approval Gate

This plan requires approval before any implementation begins.

Once approved, each item will be implemented individually, with a verification run of the
relevant test cases and reconciliation rule queries after each item is merged.

*Plan authored 06-May-2026 by Architecture Review Session.*
