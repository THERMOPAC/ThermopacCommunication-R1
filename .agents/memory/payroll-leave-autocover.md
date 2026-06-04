---
name: Payroll Leave Auto-Cover Deduction
description: How official payroll deducts leave balance when CL covers LOP, and how reversal works.
---

## The Rule
When official payroll is generated and paid-leave balance covers LOP (auto-cover), the engine:
1. **Deducts** `leaveBalances.usedDays` immediately in `stepSalaryCalculation`
2. Creates an audit row in `payroll_leave_autocover` tied to `payrollRecordId`
3. On payroll void/reversal, `reverseLinkedDeductions()` in `admin-routes.ts` restores the balance

Trial payroll does NOT deduct — the balance is untouched for trials.

**Why:** Prevents the salary slip and leave ledger from showing contradictory values (slip says 4 CL used, DB says balance unchanged).

## Key Tables
- `payroll_leave_autocover` — audit log, one row per (period, run, user, leave_type)
  - `status`: 'applied' | 'reversed'
  - `payrollRecordId` → FK to payroll_records, cascade delete
  - Unique index: `(period_id, run_number, user_id, leave_type_id)` — idempotency guard
- `payroll_attendance_snapshot.balance_covered_days` — set in `stepLeaveConsolidation`, read in `stepSalaryCalculation`

## How to Apply (Engine)
- `stepLeaveConsolidation`: monthly path now also has balance auto-cover (was missing before this feature); stores result in `balanceCoveredDays` column of snapshot
- `stepSalaryCalculation`: after upserting payroll record, checks `attSnap[0].balanceCoveredDays`; if > 0 and no existing autocover for this recordId, deducts greedily from paid leave types

## Salary Slip Builder
- Queries `payrollLeaveAutocover` for the `recordId`
- Adds `daysDeducted` to `usedInMonthMap` so opening/closing compute correctly from actual DB values
- For trial: no entries in the table → shows actual (un-deducted) DB balance

## DB Push Note
`drizzle-kit push:pg` shows only a deprecation warning and does not actually push. Apply schema changes with raw SQL using `node -e "const {Pool}=require('pg')..."`.
