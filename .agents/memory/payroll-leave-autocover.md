---
name: Payroll Leave Auto-Cover Deduction
description: How official payroll deducts leave balance when CL covers LOP, and how reversal works. Now also applies to trial runs.
---

## The Rule
When payroll (trial OR official) is generated and paid-leave balance covers LOP (auto-cover), the engine:
1. **Deducts** `leaveBalances.usedDays` immediately
2. Creates an audit row in `payroll_leave_autocover`
3. On re-run: reversal first restores balance, then fresh deduction applied
4. On cancel: reversal restores balance

Trial runs write autocover rows too (as of June 2026 fix). The official run checks by `(userId, periodId, status='applied')` — not by `payrollRecordId` — to avoid double-deducting when a trial already wrote the rows.

**Why:** Without trial-time deduction, the slip showed `Leave Deducted = 0` while the attendance summary showed `Paid Leave Used for LOP Adjustment = 3` — contradictory figures. The ledger must be accurate from trial time, not only after conversion.

## run_number Convention
- **Trial rows:** `run_number = -(trialRunNo)` (e.g. trial #1 → -1, trial #2 → -2)
- **Official rows:** positive run numbers (1, 2, 3…)
- They never collide in the unique index `(period_id, run_number, user_id, leave_type_id)`

## Drizzle Falsy-0 Gotcha — CRITICAL
`db.insert(...).values({ runNumber: 0 })` silently drops the field (0 is falsy in JS), causing `null value in column 'run_number' violates not-null constraint`.
**Always use `db.execute(sql\`INSERT...\`)` when inserting any integer that may be 0.**
This same rule applies to any other notNull integer column with potential value of 0.

## Key Tables
- `payroll_leave_autocover` — audit log, one row per (period, run, user, leave_type)
  - `status`: 'applied' | 'reversed'
  - `payrollRecordId` → FK to payroll_records, cascade delete
  - Unique index: `(period_id, run_number, user_id, leave_type_id)` — idempotency guard
- `payroll_attendance_snapshot.balance_covered_days` — set in `stepLeaveConsolidation`, read in `stepSalaryCalculation`

## How to Apply (Engine)
- Trial route (`payroll-trial-routes.ts`): after record insert, if `balanceCoveredDays > 0`: reverse existing applied rows, read fresh balance, apply greedy deduction, insert new autocover rows via raw SQL
- `stepSalaryCalculation` (`payroll-run-engine.ts`): checks `(userId, periodId, status='applied')` — not payrollRecordId — before applying official deduction to prevent double-deduction after trial
- Cancel route: reverses all `applied` rows for the payrollRecordId being cancelled

## Salary Slip Builder (salary-slip-builder.ts)
- Queries `payrollLeaveAutocover` where `(userId, periodId, status='applied')` 
- Adds `daysDeducted` to `usedInMonthMap` so opening/closing compute correctly from actual DB values
- `closing = currentClosing = max(0, allocated + carryover - usedYTD)` — raw DB value, never computed

## allocated_days vs Opening on Slip
The slip shows Opening = `currentClosing + usedInMonth - accruedInMonth`. 
To show Opening = X on the slip when deducted=D and accrued=A: set `allocated_days = X + A` (not X).
If the admin sets allocated=14.5 intending that as the Opening, the DB value should be 14.5 + accrual = 15.75 so the slip back-computes opening correctly as 14.5.

## DB Push Note
`drizzle-kit push:pg` shows only a deprecation warning and does not actually push. Apply schema changes with raw SQL using `node -e "const {Pool}=require('pg')..."`.
