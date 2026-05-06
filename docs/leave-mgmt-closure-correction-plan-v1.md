# Leave Management — Closure Correction Plan v1.0 (APPROVED)
**Date:** 06-May-2026  
**Revision:** v1.2 — HR/Management CL policy confirmed, Item 7 finalised,  
HR gate removed, accrual execution design approved  
**Parent Audit:** `docs/leave-mgmt-zero-trust-audit-v1.md` (Conditional PASS)  
**Baseline:** `docs/leave-management-correction-plan-baseline-v1.0.md`  
**Status:** APPROVED FOR IMPLEMENTATION

---

## Confirmed CL Policy (HR/Management, 06-May-2026)

| Policy | Value |
|---|---|
| Monthly accrual rate | **1.25 days / month** |
| Annual cap | **15 days / FY** |
| Fiscal year | **April to March** |
| Joining month accrual | **Pro-rated** (days remaining in joining month) |
| Carryover | **As configured in `leave_types`** (`carryover_allowed`, `max_carryover_days`) |

**DB state (post-fix):**
```
leave_types WHERE code='CL':
  monthly_accrual_rate = 1.25
  max_days_per_year    = 15.00  ← updated 06-May-2026
  accrual_type         = monthly
  accrual_pro_rate     = true
  carryover_allowed    = false   (CL does not carry over — as configured)
  max_carryover_days   = 0.00
```

---

## Approved Accrual Execution Design

### Principles
- Monthly CL accrual and year-end carryover are **guaranteed to run before payroll processes attendance**.
- Both operations are **fully idempotent** — re-running from cron or payroll never double-credits.
- Payroll **blocks** if required accrual or carryover is missing.

### Trigger 1 — Monthly CL Accrual → `stepAttendanceSnapshot`
At the start of `stepAttendanceSnapshot()` in `server/payroll-run-engine.ts`:
1. Derive `accrualMonth = YYYY-MM` from `period.startDate`.
2. Check `leave_accrual_log WHERE accrual_month = accrualMonth` — if rows exist, already ran (skip).
3. If not run: auto-run `runMonthlyClAccrual(accrualMonth, executedBy)`.
4. If `errors.length > 0`: return blocking error `cl_accrual_failed` — payroll stops.
5. If successful: continue with attendance snapshot.

### Trigger 2 — Year-End Carryover → `stepAttendanceSnapshot` (April periods only)
At the start of `stepAttendanceSnapshot()` when `period.startDate` month = April:
1. Derive `closingCalendarYear = period.startDate.year - 1`  
   *(April 2026 → closingCalendarYear = 2025; FY 2025-26 closes, FY 2026-27 opens)*
2. Check `leave_carryover_log WHERE from_year = closingCalendarYear` — if exists, already ran.
3. If not run: auto-run `runYearEndClCarryover(closingCalendarYear, executedBy)`.
4. If `errors.length > 0`: return blocking error `cl_carryover_failed`.
5. If successful: continue.

### Trigger 3 — Midnight Cron (Backup)
The existing cron in `server/attendance-midnight-processor.ts` remains as a safety net:
- On the 1st of each month at 00:00 IST: calls `runMonthlyClAccrual` (idempotent skip if already ran).
- On April 1: also calls `runYearEndClCarryover` (idempotent skip if already ran).
- Cron failures do **not** block payroll — payroll self-heals via Trigger 1/2.

### Idempotency Implementation

| Operation | Guard table | Guard key | Status |
|---|---|---|---|
| Monthly accrual | `leave_accrual_log` | `(user_id, leave_type_id, accrual_month)` | ✅ Already implemented |
| Year-end carryover | `leave_carryover_log` | `(from_year, to_year)` UNIQUE | ✅ **Implemented 06-May-2026** |

`leave_carryover_log` table:
```sql
CREATE TABLE leave_carryover_log (
  id        SERIAL PRIMARY KEY,
  from_year INTEGER NOT NULL,
  to_year   INTEGER NOT NULL,
  run_at    TIMESTAMP NOT NULL DEFAULT NOW(),
  run_by    INTEGER REFERENCES users(id),
  processed INTEGER NOT NULL DEFAULT 0,
  skipped   INTEGER NOT NULL DEFAULT 0,
  errors    TEXT[],
  notes     TEXT,
  CONSTRAINT leave_carryover_log_years_unique UNIQUE (from_year, to_year)
);
```

`runYearEndClCarryover()` now:
- Checks for existing `leave_carryover_log` row at entry → returns `alreadyRan: true` immediately if found.
- Inserts completion row at exit → future calls are idempotent.
- Returns `{ processed, skipped, errors, alreadyRan }`.

---

## Implementation Order

```
5 → 4 → 3 → 2 → 6 → 7 → 1
```

| Step | Item | Description | Rationale |
|---|---|---|---|
| 1st | **Item 5** | Payroll LOP gate | Highest-risk prevention. Must exist before any payroll run. |
| 2nd | **Item 4** | Sandwich LWP wiring | Schema migration (`is_lwp`) must precede service and payroll changes. |
| 3rd | **Item 3** | Cross-year leave split | Logic-only, no schema dependencies. |
| 4th | **Item 2** | R3 attendance backfill | Fix R3 scope (past dates only) first, then backfill script. |
| 5th | **Item 6** | Regularization + LOP recompute | Part B (accrual log entry) follows Item 2 table. |
| 6th | **Item 7** | CL accrual pro-rating and cap | Policy confirmed. Ready to implement. |
| 7th | **Item 1** | R1 historical balance drift | Data correction only after all logic stabilised. |

---

## Item 1 — R1: Historical Leave Balance Drift (7 Records)
**Position: Last (7th) — after all logic stabilised**

### Evidence
| User | Leave Type | `used_days` | Approved Days | Drift | Root Cause |
|---|---|---|---|---|---|
| Tarkeshwar (id=32) | Unpaid Leave | 196.00 | 13.00 | **+183.00** | `salary-calculation-engine.ts` direct write (Rule 1 violation) |
| Manjusha (id=13) | CL | 0.00 | 6.00 | -6.00 | Old admin bypass approved without updating `used_days` |
| Sagar (id=16) | CL | 1.00 | 4.00 | -3.00 | Same |
| Pravin (id=18) | CL | 1.00 | 3.50 | -2.50 | Same |
| Bhushan (id=11) | CL | 0.00 | 2.00 | -2.00 | Same |
| Mansi (id=5) | CL | 4.00 | 5.00 | -1.00 | Same |
| Roshan (id=25) | CL | 5.50 | 6.00 | -0.50 | Same |

### Fix
- **Prerequisite:** HR signs off per-row (accept correction or accept as-is).
- **Script:** `scripts/reconcile-r1-balances.ts` with `--dry-run` flag.
- **Audit table:** `balance_correction_log` (new, permanent):
  ```sql
  CREATE TABLE balance_correction_log (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    leave_type_id    INTEGER NOT NULL REFERENCES leave_types(id),
    year             INTEGER NOT NULL,
    field_corrected  VARCHAR(50) NOT NULL,
    before_value     NUMERIC NOT NULL,
    after_value      NUMERIC NOT NULL,
    correction_reason TEXT,
    corrected_by     INTEGER REFERENCES users(id),
    corrected_at     TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```
- Full `db.transaction()`, verifies R7 before committing.

**Acceptance:** R1 query = 0 drift rows for corrected users. R7 still passes. Correction log has 1 row per corrected balance.

---

## Item 2 — R3: 99 Approved-Leave Attendance Gaps
**Position: 4th**

### Evidence
- 99 approved leave/date combinations with no `on_leave`/`half_day` attendance.
- 24 users affected. Includes future dates (future approved leaves legitimately have no record).
- All genuine past-date gaps predate 06-May-2026 service layer.

### Fix
**Phase A — Fix R3 query scope:** Add `AND dates.date_val <= CURRENT_DATE` to all R3 reconciliation queries.

**Phase B — Backfill script:** `scripts/backfill-r3-attendance.ts`
- Past dates only (`<= CURRENT_DATE`). Skips `admin_override` records.
- Inserts `on_leave`/`half_day` with `statusSource='leave'`. `--dry-run` mode. `db.transaction()`.

**Files:** `scripts/backfill-r3-attendance.ts`. No schema changes.

**Acceptance:** R3 (past dates only) = 0. R4 unchanged. 0 admin_override records touched.

---

## Item 3 — T07/T08: Cross-Year Leave Split
**Position: 3rd**

### Evidence
- 0 cross-year leave requests in DB. Current code uses `startDate` year for entire leave.
- Silent incorrect behaviour — no runtime error, wrong year's balance consumed.

### Fix
In `applyLeave()`, `approveLeave()`, `rejectLeave()`, `cancelLeave()`, `revokeApprovedLeave()` in `server/leave-service.ts`:

When `startDate.year != endDate.year`, split at the December 31 / January 1 boundary:
- Span A (`startDate → 31-Dec-YYYY`): balance year YYYY.
- Span B (`01-Jan-YYYY+1 → endDate`): balance year YYYY+1.
- Both deductions inside the same `db.transaction()`.
- Balance check at apply time: **both** year balances must be sufficient.

**Files:** `server/leave-service.ts` — 5 functions.

**Test cases:**
| Test | Input | Expected |
|---|---|---|
| T07 | Apply Dec 28 → Jan 3 | 2026 `pendingDays += 4`; 2027 `pendingDays += 3` |
| T08 | T07 → Approve | 2026 `usedDays += 4, pendingDays -= 4`; 2027 `usedDays += 3, pendingDays -= 3` |
| T08a | T07 → Reject | 2026 `pendingDays -= 4`; 2027 `pendingDays -= 3` |
| T08b | T07 → Approve → Revoke | 2026 `usedDays -= 4`; 2027 `usedDays -= 3` |
| T08c | Dec 28 → Jan 3, 2027 balance = 0 | Returns `INSUFFICIENT_BALANCE` at apply time |

**Acceptance:** All 5 tests pass. T01–T12 unchanged.

---

## Item 4 — T28/T48: Wire Sandwich LWP Days into Payroll Consolidation
**Position: 2nd (schema migration first)**

### Evidence
- `leave_deductions` has no `is_lwp` column.
- `payroll_attendance_snapshot.sandwich_lwp_days` exists but is never populated.

### Fix
**Step 1 — Schema:**
```sql
ALTER TABLE leave_deductions ADD COLUMN IF NOT EXISTS is_lwp BOOLEAN NOT NULL DEFAULT FALSE;
```
Update `shared/schema.ts`: add `isLwp: boolean('is_lwp').notNull().default(false)` to `leaveDeductions`.

**Step 2 — Service** (`createSandwichDeductionsForLeave()`, `server/leave-service.ts`):  
After computing gap dates, check employee's available balance. If `available < sandwich_days`, mark deduction rows `is_lwp = true`.

**Step 3 — `stepLeaveConsolidation()`** (`server/payroll-run-engine.ts`):  
Query `leave_deductions WHERE employee_id = emp.id AND status='approved' AND is_lwp=true AND deduction_date BETWEEN period dates`. Update `payrollAttendanceSnapshot.sandwich_lwp_days`.

**Step 4 — `stepSalaryCalculation()`**:
```typescript
effectiveLop = snapshot.lopDays + snapshot.sandwichLwpDays
// LWP-exempt employees: effectiveLop = 0
```

**Files:** `shared/schema.ts`, `server/leave-service.ts`, `server/payroll-run-engine.ts`, DB migration.

**Acceptance:**
- T28: 0-balance employee, Fri+Mon leave → `is_lwp=true`, `sandwich_lwp_days=2`, `effectiveLop += 2`.
- T48: LWP-exempt same scenario → `sandwich_lwp_days=2`, `effectiveLop = 0`.
- T47 (paid sandwich) unchanged.

---

## Item 5 — T40: Payroll Hard-Block When LOP Is Unconfirmed
**Position: 1st (highest-risk prevention)**

### Evidence
- `stepSalaryCalculation()` (`server/payroll-run-engine.ts` line 600) has no gate on `lop_days_confirmed`.
- 2 payroll periods in `draft` — no `salary_calculation` run yet. Gate must exist before first run.

### Fix
At the entry of `stepSalaryCalculation()`, before iterating employees:
```typescript
const unconfirmedLop = await db
  .select({ userId: payrollAttendanceSnapshot.userId })
  .from(payrollAttendanceSnapshot)
  .leftJoin(users, eq(users.id, payrollAttendanceSnapshot.userId))
  .where(and(
    eq(payrollAttendanceSnapshot.periodId, periodId),
    eq(payrollAttendanceSnapshot.runNumber, runNumber),
    isNull(payrollAttendanceSnapshot.lopDaysConfirmed),
    gt(payrollAttendanceSnapshot.lopDaysComputed, '0'),
    eq(users.lwpExempt, false)
  ));

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
      title: `Salary calculation blocked: ${unconfirmedLop.length} employee(s) with unconfirmed LOP`,
      details: `HR must confirm LOP via the LOP Confirmation panel before running salary calculation.`,
    }],
  };
}
```

Additionally: payroll wizard (`client/src/components/payroll-run-wizard.tsx`) shows blocking warning at `salary_calculation` step when unconfirmed LOP exists, with link to LOP Confirmation panel.

**Files:** `server/payroll-run-engine.ts` (~line 607), `client/src/components/payroll-run-wizard.tsx`.

**Acceptance:**
- T40: Unconfirmed LOP → `success=false`, `lop_unconfirmed`, 0 salary snapshots written.
- T40b: After HR confirms → step proceeds.
- Exempt employees excluded from gate check.

---

## Item 6 — T41: Recompute LOP After Regularization Changes Attendance
**Position: 5th**

### Evidence
- Regularization approval updates attendance but does not invalidate `payroll_attendance_snapshot.lop_days_computed`.
- Scenario B CL credit writes `allocatedDays += 1` but has no `leave_accrual_log` entry.
- 0 payroll snapshot rows currently — no live violation yet.

### Fix
**Part A — Snapshot invalidation** (`server/attendance-routes.ts`, line 1503 region):
```typescript
const coveredPeriod = await db.select({ id: payrollPeriods.id, status: payrollPeriods.status })
  .from(payrollPeriods)
  .where(and(
    lte(payrollPeriods.startDate, reg.requestDate),
    gte(payrollPeriods.endDate, reg.requestDate),
    inArray(payrollPeriods.status, ['draft', 'attendance_snapshot'])
  ));
if (coveredPeriod.length > 0) {
  await db.update(payrollAttendanceSnapshot)
    .set({ lopDaysComputed: null, lopDaysConfirmed: null, lopConfirmedBy: null, lopConfirmedAt: null })
    .where(and(
      eq(payrollAttendanceSnapshot.periodId, coveredPeriod[0].id),
      eq(payrollAttendanceSnapshot.userId, reg.employeeId)
    ));
}
```
Guard: never touch snapshots at `salary_calculation` or later.

**Part B — CL credit → accrual log** (lines 1473–1490):
After `leave_balances` update, insert to `leave_accrual_log`:
```typescript
await db.insert(leaveAccrualLog).values({
  userId: reg.employeeId,
  leaveTypeId: clType.id,
  accrualMonth: format(new Date(reg.requestDate), 'yyyy-MM'),
  daysAccrued: '1.00',
  runBy: user.id,
  notes: `CL credited via regularization approval (reg #${reg.id})`,
});
```

**Files:** `server/attendance-routes.ts`.

**Acceptance:**
- T41a: Regularization on May 15 → May snapshot `lop_days_computed` nulled (period in draft).
- T41b: Next `stepAttendanceSnapshot` re-run → correct LOP.
- T41c: Regularization after period at `salary_calculation` → snapshot untouched.
- T41d: Scenario B credit → `leave_accrual_log` row inserted.

---

## Item 7 — T43/T44: CL Accrual Pro-Rating and Annual Cap
**Position: 6th — Policy confirmed, ready to implement**

### Confirmed Policy
- Monthly accrual: **1.25 days**
- Annual cap: **15 days / FY** (April–March)
- Joining month: **pro-rated** based on days remaining in the joining month
- `max_days_per_year` updated to `15.00` in DB on 06-May-2026
- Carryover: per `leave_types.carryover_allowed` / `max_carryover_days` (CL: no carryover)

### Fix (in `runMonthlyClAccrual()`, `server/leave-service.ts` line ~633)

**T43 — Pro-rate for joining month:**
```typescript
const [emp] = await db
  .select({ dateOfJoining: users.dateOfJoining })
  .from(users).where(eq(users.id, user.id));
const joinDate = emp?.dateOfJoining;

let creditRate = rate; // full rate by default
if (joinDate && lt.accrualProRate) {
  const [ay, am] = accrualMonth.split('-').map(Number);
  const jYear = joinDate.getFullYear(), jMonth = joinDate.getMonth() + 1;

  if (jYear > ay || (jYear === ay && jMonth > am)) {
    skipped++; continue; // employee has not joined yet for this accrual month
  }
  if (jYear === ay && jMonth === am) {
    // Pro-rate: credit only for days remaining in month from join date
    const daysInMonth = new Date(ay, am, 0).getDate();
    const remainingDays = daysInMonth - joinDate.getDate() + 1;
    creditRate = parseFloat((rate * remainingDays / daysInMonth).toFixed(2));
  }
  // If joined before accrual month: full rate (no adjustment needed)
}
```

**T44 — Annual cap (15 days / FY = 12 months × 1.25):**
```typescript
if (lt.maxDaysPerYear && parseFloat(lt.maxDaysPerYear) > 0) {
  const cap = parseFloat(lt.maxDaysPerYear);
  // Sum all accruals for this user+type in the current calendar year
  const [ytd] = await db
    .select({ total: sql<string>`COALESCE(SUM(days_accrued::numeric), 0)` })
    .from(leaveAccrualLog)
    .where(and(
      eq(leaveAccrualLog.userId, user.id),
      eq(leaveAccrualLog.leaveTypeId, lt.id),
      like(leaveAccrualLog.accrualMonth, `${year}-%`)
    ));
  const alreadyAccrued = parseFloat(ytd?.total ?? '0');
  if (alreadyAccrued >= cap) { skipped++; continue; } // cap reached
  creditRate = Math.min(creditRate, cap - alreadyAccrued); // clamp to cap
}
```

**Note on FY vs calendar year:** `leave_accrual_log.accrual_month` is `YYYY-MM` using
calendar year. Since FY is April–March and accrual starts April 1, the annual cap query
uses the calendar year of the accrual month. For FY 2026-27 (Apr 2026–Mar 2027), accrual
months span `2026-04` through `2027-03`. The cap check sums all 2026 months AND 2027 months
separately. Implementation note: the cap logic should sum by fiscal year, not calendar year.

**Revised cap query (FY-aware):**
```typescript
// Determine FY start: if accrualMonth >= April → FY starts in accrualYear, else accrualYear-1
const fyStartYear = am >= 4 ? ay : ay - 1;
const fyStartMonth = `${fyStartYear}-04`; // e.g. '2026-04'
const fyEndMonth   = `${fyStartYear + 1}-03`; // e.g. '2027-03'

const [ytd] = await db
  .select({ total: sql<string>`COALESCE(SUM(days_accrued::numeric), 0)` })
  .from(leaveAccrualLog)
  .where(and(
    eq(leaveAccrualLog.userId, user.id),
    eq(leaveAccrualLog.leaveTypeId, lt.id),
    gte(leaveAccrualLog.accrualMonth, fyStartMonth),
    lte(leaveAccrualLog.accrualMonth, fyEndMonth)
  ));
```

**Files:** `server/leave-service.ts` — `runMonthlyClAccrual()` (lines ~626–680).

**Test cases:**
| Test | Scenario | Expected |
|---|---|---|
| T43a | Vijay (joined Apr 1 2026), run Apr 2026 accrual | Full 1.25 (joined day 1) |
| T43b | Employee joins Apr 15 2026, run Apr 2026 accrual | `1.25 × 16/30 ≈ 0.67` |
| T43c | Employee joins May 1 2026, run Apr 2026 accrual | Skipped (not yet joined) |
| T44a | Employee has 15.00 accrued in FY 2026-27 | Skipped (cap reached) |
| T44b | Employee has 14.50 accrued in FY 2026-27 | Credited 0.50 (clamped) |
| T44c | Re-run same month after cap skip | Still skipped (idempotent log) |

**Acceptance:** All 6 tests pass. Existing T42 (accrual idempotency) unchanged.

---

## Verification Sequence

After each item is implemented, run these checks before proceeding:

| After | Verification |
|---|---|
| Item 5 | Trigger `salary_calculation` with unconfirmed LOP → `lop_unconfirmed` error, 0 snapshots written. Confirm LOP → step proceeds. |
| Item 4 | Sandwich leave with 0 balance → `is_lwp=true` in `leave_deductions`. Run `leave_consolidation` → `sandwich_lwp_days` populated in snapshot. |
| Item 3 | Dec 28 → Jan 3 leave → balance split across both years. T08c: 2027 balance=0 → `INSUFFICIENT_BALANCE`. |
| Item 2 | R3 query (past dates only) counts genuine violations. Backfill → R3 = 0. R4 unchanged. 0 admin_override touched. |
| Item 6 | Regularization on May 15 (draft period) → snapshot `lop_days_computed` nulled. Period at `salary_calculation` → snapshot untouched. Scenario B CL → accrual log row. |
| Item 7 | `runMonthlyClAccrual('2026-06')` → Vijay gets 1.25. Mid-month joiner gets pro-rated. Cap at 15 days enforced. Re-run → idempotent. |
| Item 1 | `--dry-run` diff reviewed by HR. Live run → R1 drift = 0 for corrected users. R7 passes. `balance_correction_log` has 1 row per correction. |

---

## Prerequisite — Carryover Idempotency (Completed 06-May-2026)

Before implementing any of the above items, the following prerequisite was completed:

- **`leave_carryover_log` table created** in DB with `UNIQUE (from_year, to_year)`.
- **`runYearEndClCarryover()` updated** in `server/leave-service.ts`:
  - Checks for existing log row at entry → returns `alreadyRan: true` immediately if found.
  - Inserts completion row at exit (processed, skipped, errors, notes).
  - Returns `{ processed, skipped, errors, alreadyRan }`.
- **`shared/schema.ts`** updated with `leaveCarryoverLog` table definition + insert schema + type.
- **`server/leave-service.ts`** imports `leaveCarryoverLog`.

*Approved and implemented 06-May-2026.*
