# Leave Management — Closure Correction Plan v1.0 (REVISED)
**Date:** 06-May-2026  
**Revision:** v1.1 — implementation order corrected, accrual execution redesigned,  
Item 7 hard-gated on HR confirmation  
**Parent Audit:** `docs/leave-mgmt-zero-trust-audit-v1.md` (Conditional PASS)  
**Baseline:** `docs/leave-management-correction-plan-baseline-v1.0.md`  
**Status:** PENDING APPROVAL — Do not implement until this plan is approved.

---

## Evidence Confirmation

All items below are evidenced by live DB queries and code inspection run on 06-May-2026.
The audit report at `docs/leave-mgmt-zero-trust-audit-v1.md` contains the full DB/API
evidence tables for every item. Specific evidence for each closure item is cited inline.

---

## Implementation Order

```
5 → 4 → 3 → 2 → 6 → 7 → 1
```

| Step | Item | Rationale |
|---|---|---|
| 1st | Item 5 — Payroll LOP gate | Highest-risk prevention. Must exist before any payroll run. No dependencies. |
| 2nd | Item 4 — Sandwich LWP wiring | Schema migration (is_lwp column) needed before service and payroll changes. |
| 3rd | Item 3 — Cross-year leave split | Logic-only change. No schema changes. No dependencies. |
| 4th | Item 2 — R3 attendance backfill | Data script. No code dependencies. Fix R3 query scope first (past dates only). |
| 5th | Item 6 — Regularization + LOP recompute | Additive guard on regularization approval. Part B depends on Item 2 log table. |
| 6th | Item 7 — CL accrual pro-rating / cap | **Hard-gated on HR confirming the annual CL cap policy.** Do not start until HR answers. See §HR Gate below. |
| 7th (Last) | Item 1 — R1 historical balance drift | Historical data correction only after all logic is stabilized. Running R1 before Items 2–6 risks re-introducing drift from the same code paths. |

---

## §HR Gate — CL Annual Cap Policy (Blocks Item 7)

**This must be resolved by HR before Item 7 can be designed or implemented.**

**The problem:** The current DB has:
- `leave_types.monthly_accrual_rate = 1.25` (just set by the correction plan)
- `leave_types.max_days_per_year = 8.00`

At 1.25 CL per month, a full calendar year earns `1.25 × 12 = 15.00 days`. The current cap
of `8.00` means accrual stops in month 7 (e.g., a January joiner hits the cap in July;
an April joiner hits it in October). This is inconsistent and appears to be a data error.

**HR must answer all of the following before Item 7 proceeds:**

| Question | Options |
|---|---|
| Q1: What is the intended annual CL entitlement per employee? | 8 days / 15 days / other |
| Q2: Is the 1.25/month accrual rate correct? | Yes (15 days/year) / No (change rate) |
| Q3: If cap = 8.00 is correct, what happens to accrual after the cap is hit? | Stops accruing / Excess converts to AL / Other |
| Q4: Is the accrual annual (calendar year Jan–Dec) or fiscal year (Apr–Mar)? | Calendar / Fiscal |
| Q5: For employees who joined mid-year, is CL pro-rated in the joining month? | Yes / No |
| Q6: Is there a maximum carryover limit for unused CL at year-end? | Value in days / No carryover |

**Current DB state for reference:**
```
leave_types WHERE code='CL':
  monthly_accrual_rate  = 1.25
  max_days_per_year     = 8.00   ← INCONSISTENT with 1.25 × 12 = 15.00
  accrual_pro_rate      = true
  accrual_day_of_month  = 1
  carryover_allowed     = (check live)
  max_carryover_days    = (check live)
```

Until HR answers, `max_days_per_year` should be corrected to at least 15.00 as a
**temporary data fix** so the first automated accrual run (June 1) does not silently
stop after 8 days. This one-line DB update can be done immediately without waiting
for the full Item 7 implementation.

---

## Revised Accrual Execution Design

**Replaces the previous midnight-cron-primary approach across Items 6 and 7.**

### Principle
Monthly CL accrual and year-end carryover must be **guaranteed to run** before payroll
processes attendance data. They must also be **fully idempotent** so running them twice
(from payroll pipeline and from cron) never double-credits any employee.

### Trigger 1 — Monthly CL Accrual → `stepAttendanceSnapshot`

At the **start** of `stepAttendanceSnapshot()` in `server/payroll-run-engine.ts` (line 284),
before any employee is processed:

```
accrualMonth = YYYY-MM derived from period.startDate
```

**Check:** Query `leave_accrual_log WHERE accrual_month = accrualMonth` — if any rows
exist for this month, accrual has already run (idempotent guard passes).

**If not run:**
1. Call `runMonthlyClAccrual(accrualMonth, executedBy)`.
2. If it returns `errors.length > 0`: `stepAttendanceSnapshot` returns an error result
   (blocking payroll) with exception type `cl_accrual_failed`.
3. If it succeeds: continue with attendance snapshot processing.

**If already run:** Proceed immediately (no action, no blocking).

This means the payroll wizard will surface `cl_accrual_failed` as a blocking exception
before any attendance data is touched.

### Trigger 2 — Year-End CL Carryover → `stepAttendanceSnapshot` (April periods only)

**Fiscal year is April–March.** At the start of each April payroll period:
- Derive: `closingCalendarYear = period.startDate.year - 1`
  (April 2026 → closingCalendarYear = 2025; year 2025 balances carry to year 2026)
- `runYearEndClCarryover(closingCalendarYear, executedBy)` must have run before attendance snapshot.

**Idempotency gap:** `runYearEndClCarryover()` currently has no idempotency log
(unlike `runMonthlyClAccrual` which uses `leave_accrual_log`). This must be fixed:
- Add a `leave_carryover_log` table: `(id, from_year, to_year, run_at, run_by, processed, errors)`.
- `runYearEndClCarryover()` inserts a row on completion and checks for an existing row
  on entry → skips if already run.
- The April `stepAttendanceSnapshot` gate checks `leave_carryover_log WHERE from_year = closingCalendarYear`.

**If carryover not run:** Auto-run before proceeding.  
**If carryover fails:** Block `stepAttendanceSnapshot` with exception type `cl_carryover_failed`.  
**If already run:** Proceed.

### Trigger 3 — Midnight Cron (Backup Automation)

The existing cron in `server/attendance-midnight-processor.ts` (line 8, imports both
`runMonthlyClAccrual` and `runYearEndClCarryover`) **remains as a safety net**.

On the 1st of each month at 00:00 IST:
- Calls `runMonthlyClAccrual(currentMonth)` — idempotent, skips if payroll already triggered it.
- On April 1: also calls `runYearEndClCarryover(closingYear)` — idempotent via new log.

The cron is not the primary trigger — it is the backstop in case payroll is not run
on the 1st (e.g., long weekends, delayed processing).

### Summary Table

| Trigger | When | Accrual | Carryover | Blocks payroll if fails? |
|---|---|---|---|---|
| `stepAttendanceSnapshot` | Every payroll run | ✅ Auto-runs if missing | ✅ Auto-runs if April + missing | ✅ Yes |
| Midnight cron (1st of month) | 00:00 IST, 1st | ✅ Backup | ✅ Backup (April only) | No (background) |

### New Schema Required (for carryover idempotency)
```sql
CREATE TABLE leave_carryover_log (
  id            SERIAL PRIMARY KEY,
  from_year     INTEGER NOT NULL,
  to_year       INTEGER NOT NULL,
  run_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  run_by        INTEGER REFERENCES users(id),
  processed     INTEGER NOT NULL DEFAULT 0,
  errors        TEXT[],
  UNIQUE (from_year, to_year)        -- prevents duplicate carryover runs
);
```

---

## Item 1 — R1: Historical Leave Balance Drift (7 Records)
**Implementation position: Last (after Items 2–6 stabilized)**

### Evidence
| User | Leave Type | Balance `used_days` | Approved Days | Drift | Root Cause |
|---|---|---|---|---|---|
| Tarkeshwar (id=32) | Unpaid Leave | 196.00 | 13.00 | **+183.00** | `salary-calculation-engine.ts` direct write (Rule 1 violation, now documented) |
| Manjusha (id=13) | Casual Leave | 0.00 | 6.00 | -6.00 | Old admin bypass route approved leave without updating `used_days` |
| Sagar (id=16) | CL | 1.00 | 4.00 | -3.00 | Same |
| Pravin (id=18) | CL | 1.00 | 3.50 | -2.50 | Same |
| Bhushan (id=11) | CL | 0.00 | 2.00 | -2.00 | Same |
| Mansi (id=5) | CL | 4.00 | 5.00 | -1.00 | Same |
| Roshan (id=25) | CL | 5.50 | 6.00 | -0.50 | Same |

**Why last:** Any code correction to the approval path (Items 2–6) may further change
`used_days` for affected employees. Reconciling R1 before those corrections risks a
second round of drift. Running R1 after all logic is stable gives a single, final,
HR-reviewed correction.

### Proposed Fix

**Step 1 — HR sign-off per row (prerequisite):**  
HR reviews each of the 7 rows. For each:
- **Accept correction:** set `used_days = SUM(approved leave_requests.total_days)`.
- **Accept as-is:** document the business reason (e.g., Tarkeshwar's 183-day drift may
  reflect a legitimate long-term unpaid absence recorded outside the system).

**Step 2 — One-time reconciliation script:**  
`scripts/reconcile-r1-balances.ts`  
- `--dry-run` flag (prints diff, no write).
- For each HR-approved row: updates `used_days` and inserts into `balance_correction_log`.
- Full `db.transaction()` — all-or-nothing.
- Verifies R7 (no negative balances) before committing.

**New table:**
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

**Files:** `scripts/reconcile-r1-balances.ts`, new migration for `balance_correction_log`.

**Acceptance:** R1 query returns 0 drift rows for corrected users. R7 still passes. Correction log has 1 row per corrected balance.

---

## Item 2 — R3: 99 Approved-Leave Attendance Gaps
**Implementation position: 4th**

### Evidence
- 99 approved leave/date combinations with no `on_leave`/`half_day` attendance record.
- 24 users affected. Top: Bhamble (5), Jawahar (5), Darshan (4), Sagar (4).
- **Scope correction required:** The count includes future-dated approved leaves (e.g.,
  Roshan's Aug 2026 leave). Future dates legitimately have no attendance record yet.
  The R3 rule must be scoped to `date <= CURRENT_DATE`.
- All genuine past-date gaps predate 06-May-2026 (before service layer).

### Proposed Fix

**Phase A — Fix R3 query (immediate):**  
Add `AND dates.date_val <= CURRENT_DATE` to the R3 reconciliation query.
This separates genuine historical violations from legitimately absent future records.

**Phase B — Backfill script:**  
`scripts/backfill-r3-attendance.ts`
- Selects approved leaves where `date <= CURRENT_DATE` and attendance gap exists.
- For each gap date:
  - No record: insert `{status: 'on_leave'/'half_day', statusSource: 'leave', source: 'system'}`.
  - `statusSource = 'admin_override'`: **skip** (never overwrite admin decisions).
  - Other status: update to `on_leave`/`half_day`, log overwrite.
- `--dry-run` flag. Full `db.transaction()`.

**Files:** `scripts/backfill-r3-attendance.ts`. No schema changes.

**Acceptance:** R3 (past dates only) = 0 violations after backfill. R4 still passes. 0 admin_override records overwritten.

---

## Item 3 — T07/T08: Cross-Year Leave Split
**Implementation position: 3rd**

### Evidence
- 0 cross-year leave requests in DB today — no live damage.
- `applyLeave()` derives balance year from `startDate` only. A Dec 28 → Jan 3 leave
  debits 7 days from the **start year** balance only; the end year balance is untouched.

### Proposed Fix

**In `applyLeave()` and all five lifecycle functions** (`approveLeave`, `rejectLeave`,
`cancelLeave`, `revokeApprovedLeave`) in `server/leave-service.ts`:

When `startDate.year != endDate.year`, split at the year boundary:
- Span A: `startDate → 31-Dec-YYYY` → deduct from year YYYY balance.
- Span B: `01-Jan-(YYYY+1) → endDate` → deduct from year YYYY+1 balance.
- Both deductions inside the same `db.transaction()`.
- Balance check at apply time: **both** year balances must satisfy minimum.

**Files:** `server/leave-service.ts` — 5 functions.

**Test cases:**

| Test | Input | Expected Result |
|---|---|---|
| T07 | Apply Dec 28 → Jan 3 | 2026 `pendingDays += 4`; 2027 `pendingDays += 3` |
| T08 | T07 → Approve | 2026 `usedDays += 4, pendingDays -= 4`; 2027 `usedDays += 3, pendingDays -= 3` |
| T08a | T07 → Reject | 2026 `pendingDays -= 4`; 2027 `pendingDays -= 3` |
| T08b | T07 → Approve → Revoke | 2026 `usedDays -= 4`; 2027 `usedDays -= 3` |
| T08c | Dec 28 → Jan 3, 2027 CL balance = 0 | Returns `INSUFFICIENT_BALANCE` at apply time |

**Acceptance:** All 5 test cases pass. T01–T06, T09–T12 unchanged.

---

## Item 4 — T28/T48: Wire Sandwich LWP Days into Payroll Consolidation
**Implementation position: 2nd (needs schema migration first)**

### Evidence
- `leave_deductions` table has **no `is_lwp` column** (confirmed by schema inspection).
- `payroll_attendance_snapshot.sandwich_lwp_days` column exists but is never populated
  (`stepLeaveConsolidation` does not read `leave_deductions`).

### Proposed Fix

**Step 1 — Schema migration:**
```sql
ALTER TABLE leave_deductions
  ADD COLUMN IF NOT EXISTS is_lwp BOOLEAN NOT NULL DEFAULT FALSE;
```
Update `shared/schema.ts` `leaveDeductions` table: add `isLwp: boolean('is_lwp').notNull().default(false)`.

**Step 2 — Service: set `is_lwp` at deduction creation** (`server/leave-service.ts`, `createSandwichDeductionsForLeave()` line 181):  
After computing the sandwich gap dates, check the employee's current available balance for the leave type. If `available_balance < sandwich_gap_days`, mark those deduction rows `is_lwp = true`.

**Step 3 — `stepLeaveConsolidation()` (`server/payroll-run-engine.ts` line 478):**  
After existing leave consolidation, for each employee query:
```sql
SELECT SUM(days) FROM leave_deductions
WHERE employee_id = emp.id
  AND status = 'approved'
  AND is_lwp = true
  AND deduction_date BETWEEN period.startDate AND period.endDate
```
Update `payrollAttendanceSnapshot.sandwich_lwp_days` with this value.

**Step 4 — `stepSalaryCalculation()` (line 600):**  
```typescript
effectiveLop = snapshot.lopDays + snapshot.sandwichLwpDays
// LWP-exempt employees: effectiveLop = 0 (both LOP and sandwich LWP waived)
```

**Files:** `shared/schema.ts`, `server/leave-service.ts`, `server/payroll-run-engine.ts`, DB migration.

**Acceptance:**
- T28: Employee with 0 balance, Fri+Mon leave, Sat/Sun sandwich → deduction rows `is_lwp=true`, snapshot `sandwich_lwp_days=2`, `effectiveLop += 2`.
- T48: LWP-exempt employee same scenario → `sandwich_lwp_days=2` in snapshot, `effectiveLop = 0`.
- T47 (paid sandwich) still passes — `is_lwp=false` does not increase LOP.

---

## Item 5 — T40: Payroll Hard-Block When LOP Is Unconfirmed
**Implementation position: 1st (highest-risk prevention)**

### Evidence
- `stepSalaryCalculation()` (`server/payroll-run-engine.ts` line 600) has **no gate** on `lop_days_confirmed`.
- 2 payroll periods currently in `draft` status — no `salary_calculation` run yet.
- Gate must exist before the first payroll run that reaches `salary_calculation`.

### Proposed Fix

**At the entry of `stepSalaryCalculation()`, before iterating employees:**
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
    eq(users.lwpExempt, false)   // exempt employees skip confirmation
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

**Payroll wizard frontend** (`client/src/components/payroll-run-wizard.tsx`):
Show a blocking warning at the `salary_calculation` step card when any snapshot row has
`lop_days_computed > 0` and `lop_days_confirmed IS NULL`, with a direct link to the
LOP Confirmation panel.

**Files:** `server/payroll-run-engine.ts` (~line 607), `client/src/components/payroll-run-wizard.tsx`.

**Acceptance:**
- T40: 1 employee with unconfirmed LOP → `salary_calculation` returns `success=false`, `lop_unconfirmed`, 0 salary snapshots written.
- T40b: After HR confirms → step proceeds normally.
- Exempt employees are excluded from the gate check.
- Payroll wizard shows blocking warning with employee count.

---

## Item 6 — T41: Recompute LOP After Regularization Changes Attendance
**Implementation position: 5th**

### Evidence
- Regularization approval (`server/attendance-routes.ts` line 1247): updates attendance
  but does NOT invalidate `payroll_attendance_snapshot.lop_days_computed`.
- Scenario B CL credit (lines 1473–1490): writes `allocatedDays += 1` directly to
  `leave_balances` with no `leave_accrual_log` entry (R9 divergence).
- 0 payroll snapshot rows currently — no live violation yet.

### Proposed Fix

**Part A — Snapshot invalidation after regularization:**  
After attendance is updated in the regularization approval route (line 1503 region):
```typescript
// Only invalidate if payroll period is still in early stages (not yet salary_calculation)
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
**Guard:** Never invalidate if period is at `salary_calculation` or later — that would
corrupt a payroll run already in progress.

**Part B — CL credit writes to accrual log:**  
After the `leave_balances` update (line 1474), also insert to `leave_accrual_log`:
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
This makes the regularization CL credit visible in the accrual log and satisfies R9.

**Files:** `server/attendance-routes.ts` (lines 1473–1514 region). No schema changes.

**Acceptance:**
- T41a: Regularization approved on May 15 → snapshot `lop_days_computed` nulled if May period is in `draft`/`attendance_snapshot`.
- T41b: Next `stepAttendanceSnapshot` re-run → correct LOP computed.
- T41c: Regularization approved after period reaches `salary_calculation` → snapshot not touched.
- T41d: Scenario B CL credit → `leave_accrual_log` row inserted.

---

## Item 7 — T43/T44: CL Accrual Pro-Rating and Annual Cap
**Implementation position: 6th — HARD-GATED on §HR Gate confirmation**

**Do not begin implementation until HR answers all questions in §HR Gate above.**

### Evidence
- `users.date_of_joining` column present.
- `leave_types.accrual_pro_rate = true` (column present).
- `leave_types.max_days_per_year = 8.00` — inconsistent with `1.25 × 12 = 15.00`.
- 2026 joiner: Vijay (joined 2026-04-01) — will receive first accrual June 1 at full rate.
- `runMonthlyClAccrual()` (line 633): credits all active users at full rate, no join-date check, no cap check.

### Immediate Pre-Fix (No HR approval needed)

**Temporary cap correction** — set `max_days_per_year` to a safe value before the
June 1 accrual, to prevent the cap from silently blocking legitimate accrual:
```sql
UPDATE leave_types SET max_days_per_year = 15.00 WHERE code = 'CL';
-- (Revert or correct this once HR confirms the true cap value)
```
This is a single DB update, not a code change, and can be applied immediately.

### Proposed Fix (pending HR confirmation)

**T43 — Pro-rating for joiners** (in `runMonthlyClAccrual()`, `server/leave-service.ts` line 633):
```typescript
// For each user: check if they joined in the current accrual month
const [emp] = await db.select({ dateOfJoining: users.dateOfJoining })
  .from(users).where(eq(users.id, user.id));
const joinDate = emp?.dateOfJoining;

let creditRate = rate;
if (joinDate && lt.accrualProRate) {
  const [ay, am] = accrualMonth.split('-').map(Number);
  const jYear = joinDate.getFullYear(), jMonth = joinDate.getMonth() + 1;
  if (jYear > ay || (jYear === ay && jMonth > am)) {
    skipped++; continue; // not yet joined
  }
  if (jYear === ay && jMonth === am) {
    // Pro-rate: days remaining in month from join date
    const daysInMonth = new Date(ay, am, 0).getDate();
    creditRate = parseFloat((rate * (daysInMonth - joinDate.getDate() + 1) / daysInMonth).toFixed(2));
  }
}
```

**T44 — Annual cap enforcement** (same function, after pro-rate, before upsertBalance):
```typescript
if (lt.maxDaysPerYear && parseFloat(lt.maxDaysPerYear) > 0) {
  const cap = parseFloat(lt.maxDaysPerYear);
  const [ytd] = await db.select({ total: sql<number>`COALESCE(SUM(days_accrued::numeric), 0)` })
    .from(leaveAccrualLog)
    .where(and(
      eq(leaveAccrualLog.userId, user.id),
      eq(leaveAccrualLog.leaveTypeId, lt.id),
      like(leaveAccrualLog.accrualMonth, `${year}-%`)
    ));
  const alreadyAccrued = parseFloat(ytd.total.toString() ?? '0');
  if (alreadyAccrued >= cap) { skipped++; continue; }
  creditRate = Math.min(creditRate, cap - alreadyAccrued);
}
```

**Files:** `server/leave-service.ts` — `runMonthlyClAccrual()`. No schema changes.

**Test cases (to run after HR confirms policy):**

| Test | Scenario | Expected |
|---|---|---|
| T43a | Vijay (joined Apr 1), April accrual | Full 1.25 (joined day 1) |
| T43b | Employee joins Apr 15, April accrual | 1.25 × 16/30 ≈ 0.67 |
| T43c | Employee joins May 1, April accrual | Skipped (not yet joined) |
| T44a | Employee at `max_days_per_year` already accrued | Skipped |
| T44b | Employee 0.5 below cap, rate 1.25 | Credited 0.50 (clamped) |
| T44c | Re-run same month after cap skip | Still skipped (idempotent log guard) |

---

## Verification Sequence (After Each Item)

After each item is implemented, run these checks before proceeding to the next:

| After Item | Verification Steps |
|---|---|
| Item 5 | Manually trigger `salary_calculation` on a draft period with unconfirmed LOP → must return `lop_unconfirmed` error. Then confirm LOP → must proceed. |
| Item 4 | Create a sandwich leave for an employee with 0 balance → check `is_lwp=true` in `leave_deductions`. Run `leave_consolidation` → verify `sandwich_lwp_days` in snapshot. |
| Item 3 | Submit a Dec 28 → Jan 3 leave request → verify balance split across both years. |
| Item 2 | Run R3 query (past dates only) → verify count. Run backfill → R3 = 0. Verify R4 unchanged. |
| Item 6 | Approve regularization for an employee whose May period is in draft → verify snapshot nulled. |
| Item 7 | Run `runMonthlyClAccrual('2026-06')` → verify pro-rate for Vijay (Apr joiner, gets full 1.25). Verify cap not breached. |
| Item 1 | Run `--dry-run` → present diff to HR. HR approves → live run. Verify R1 = 0 drift for corrected users. R7 still passes. |

---

*Plan revised 06-May-2026 by Architecture Review Session. Awaiting HR confirmation on §HR Gate and overall plan approval before any implementation begins.*
