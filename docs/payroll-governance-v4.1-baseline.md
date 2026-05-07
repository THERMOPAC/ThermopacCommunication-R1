# Payroll Calculation Governance — Baseline v4.1

**Status: APPROVED BASELINE — SOURCE OF TRUTH**
**Date: 2026-05-06**
**Approved by: THERMOPAC Management**
**Supersedes: All prior payroll governance drafts (v1.0 through v4.0)**

No implementation may begin without reference to this document.
No deviation from this baseline is permitted without a versioned amendment.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Governance Architecture](#2-governance-architecture)
3. [Schema Changes](#3-schema-changes)
4. [Shared Payroll Core Design](#4-shared-payroll-core-design)
5. [Trial Payroll Lifecycle](#5-trial-payroll-lifecycle)
6. [Official Payroll Lifecycle](#6-official-payroll-lifecycle)
7. [State Machines](#7-state-machines)
8. [API Endpoints](#8-api-endpoints)
9. [SAP Governance](#9-sap-governance)
10. [Parity Verification](#10-parity-verification)
11. [Pre-Official Drift Detection](#11-pre-official-drift-detection)
12. [Trial Reproducibility Limitation](#12-trial-reproducibility-limitation)
13. [Migration Strategy](#13-migration-strategy)
14. [Implementation Sequence](#14-implementation-sequence)
15. [Complete File Change List](#15-complete-file-change-list)
16. [Acceptance Tests](#16-acceptance-tests)
17. [Architectural Confirmations](#17-architectural-confirmations)
18. [Intentional Separations](#18-intentional-separations)
19. [Calculation Engine Version Policy](#19-calculation-engine-version-policy)

---

## 1. Executive Summary

### Business Problem

Prior to this governance correction, `Run Payroll Engine Test` and `Start Run` were architecturally indistinguishable at the data layer:

- Both wrote to the same `payroll_records` table with no type separation
- The test button modified live loan and advance balances
- The test button persisted TDS records
- The test button had no run number, no snapshot, and no audit trail
- A test run after a pipeline run silently overwrote official payroll records
- The test button used hardcoded PT = ₹300 for all months (incorrect: non-February months are ₹200)
- ESIC and gratuity were unrounded in the pipeline but rounded in the test route, causing SAP JE drift

### Business Workflow (Approved)

```
1. Admin runs Trial Payroll Run for one employee
2. Admin posts trial JE to SAP B1 (clearly marked [TRIAL])
3. Finance reviews and validates the trial JE in SAP B1
4. Finance reverses the trial JE using SAP B1 Reverse Entry
5. Admin confirms reversal in the THERMOPAC system
6. Admin runs official Start Run for all employees
7. Official SAP salary JEs are posted
```

### Correction Summary

| What changes | From | To |
|---|---|---|
| Test button behaviour | Live DB mutations | Trial records only — no loan/advance/TDS writes |
| Record separation | None — all rows identical | `record_type = 'trial'` vs `'official'` with separate partial indexes |
| Trial history | Single overwriting row | Multiple rows per employee per period (`trial_run_no` sequence) |
| Trial state | Derived from SAP fields | Explicit `trial_status` column |
| Calculation core | Three separate inline implementations | One shared `computeEmployeeSalaryNumbers()` function |
| PT value | Hardcoded 300 in test route | DB-driven from `payrollSettings` in both routes |
| ESIC rounding | Inconsistent between routes | `r2()` centralised in shared core |
| Gratuity rounding | Inconsistent between routes | `r2()` centralised in shared core |
| Engine versioning | None | `calculation_engine_version` column on every record |
| Official Start Run blocking | None | Blocked if any `trial_status = 'sap_posted'` for the period |
| Drift detection | None | Pre-flight check compares data changes against trial timestamp |

---

## 2. Governance Architecture

### Two Routes, One Core, Zero Arithmetic Duplication

```
┌──────────────────────────────────────────────────────────────────────┐
│                    payroll-salary-core.ts                            │
│                                                                      │
│   computeEmployeeSalaryNumbers(inputs: SalaryInputs): SalaryResult   │
│                                                                      │
│   Pure function. No DB reads. No DB writes. No side effects.         │
│   Deterministic. All arithmetic lives here and only here.            │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ called by both
          ┌──────────────┴──────────────┐
          │                             │
┌─────────▼──────────┐       ┌──────────▼──────────┐
│ payroll-trial-      │       │ payroll-run-engine.ts│
│ routes.ts           │       │                      │
│                     │       │ stepSalaryCalcula-   │
│ Trial run lifecycle │       │ tion() — orchestrates│
│ - reads live data   │       │ - reads snapshots    │
│ - no loan writes    │       │ - writes loan tables │
│ - no TDS persist    │       │ - persists TDS       │
│ - trial record type │       │ - official record    │
│ - trial run number  │       │ - pipeline run number│
└─────────────────────┘       └──────────────────────┘
```

### Core Principle

> One function contains all payroll arithmetic.
> Trial and Official are orchestration differences, not calculation differences.
> A bug fixed in the core is fixed for both simultaneously.

### Three Former Implementations (Now Eliminated)

Before this refactor, arithmetic existed in three separate places:

| Location | Lines | Status after refactor |
|---|---|---|
| `server/payroll-routes.ts` `/run/single-user` | 579–974 | Route deprecated (410). Arithmetic moved to core. |
| `server/payroll-run-engine.ts` `stepSalaryCalculation()` | 720–836 | Arithmetic block replaced by core call. Orchestration remains. |
| `server/salary-calculation-engine.ts` `SalaryCalculationEngine` | 936 lines | Unchanged in this plan (display/preview only). Phase 2 future alignment. |

---

## 3. Schema Changes

### 3.1 Four New Columns on `payroll_records`

```sql
-- Column 1: Record type
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS record_type
    VARCHAR(10) NOT NULL DEFAULT 'official'
    CONSTRAINT chk_record_type CHECK (record_type IN ('trial', 'official'));

-- Column 2: Trial sequence number (NULL for official records)
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS trial_run_no INTEGER;

-- Column 3: Explicit trial workflow state (NULL for official records)
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS trial_status
    VARCHAR(15)
    CONSTRAINT chk_trial_status CHECK (
      trial_status IN ('generated', 'sap_posted', 'reversed', 'cancelled')
    );

-- Column 4: Calculation engine version
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS calculation_engine_version
    VARCHAR(20) NOT NULL DEFAULT 'legacy';
```

### 3.2 Index Changes

```sql
-- Remove prior simple unique constraint if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_records_period_id_user_id_key'
  ) THEN
    ALTER TABLE payroll_records
      DROP CONSTRAINT payroll_records_period_id_user_id_key;
  END IF;
END $$;

-- Official: exactly one per employee per period
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_official
  ON payroll_records (period_id, user_id)
  WHERE record_type = 'official';

-- Trial: one row per trial_run_no per employee per period
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_trial_run
  ON payroll_records (period_id, user_id, trial_run_no)
  WHERE record_type = 'trial';
```

### 3.3 Migration Impact on Existing Rows

| Column | Existing rows receive | Effect |
|---|---|---|
| `record_type` | `'official'` (DB DEFAULT) | All existing records correctly classified as official |
| `trial_run_no` | `NULL` | No impact |
| `trial_status` | `NULL` | No impact |
| `calculation_engine_version` | `'legacy'` (DB DEFAULT) | All existing records marked as pre-refactor — correct and auditable |

No existing row is modified by application logic. The migration is purely additive.

### 3.4 Drizzle ORM Schema (`shared/schema.ts`)

Add to `payrollRecords` table definition:

```typescript
recordType: varchar('record_type', { length: 10 }).notNull().default('official'),
trialRunNo: integer('trial_run_no'),
trialStatus: varchar('trial_status', { length: 15 }),
calculationEngineVersion: varchar('calculation_engine_version', { length: 20 }).notNull().default('legacy'),
```

### 3.5 Coexistence Example

After both trial and official records exist for the same employee/period:

| `id` | `period_id` | `user_id` | `record_type` | `trial_run_no` | `trial_status` | `calculation_engine_version` |
|---|---|---|---|---|---|---|
| 8140 | 7 | 23 | `trial` | 1 | `reversed` | `2.0.0` |
| 8141 | 7 | 23 | `trial` | 2 | `reversed` | `2.0.0` |
| 8142 | 7 | 23 | `trial` | 3 | `reversed` | `2.0.0` |
| 8201 | 7 | 23 | `official` | `NULL` | `NULL` | `2.0.0` |

Both partial indexes are satisfied. Trial rows and official rows coexist. Neither route touches the other's rows.

---

## 4. Shared Payroll Core Design

### 4.1 File: `server/payroll-salary-core.ts`

**Contract:** Pure function. No imports from `db`. No `await`. No side effects. Deterministic.

### 4.2 Exported Interfaces

```typescript
export interface SalaryInputs {
  // Salary configuration (all pre-parsed floats)
  basicSalary: number;
  salaryType: 'monthly' | 'daily';
  houseRentAllowance: number;
  conveyance: number;
  lta: number;
  specialAllowance: number;
  supplementaryAllowance: number;
  kgpAllowance: number;
  configBonus: number;
  groupInsurance: number;
  workingHoursPerDay: number;
  otRate: number;
  otMultiplier: number;

  // Attendance (pre-computed by caller — source differs by route)
  paidDays: number;
  lopDays: number;
  totalWorkingDays: number;
  overtimeHours: number;

  // Statutory flags (pre-resolved by caller via resolveStatutoryApplicability())
  isPFApplicable: boolean;
  isESICApplicable: boolean;
  isPTApplicable: boolean;

  // PT configuration (DB-sourced by caller)
  ptMonthly: number;         // e.g. 200
  ptFebruary: number;        // e.g. 300
  isFebruary: boolean;       // derived from period.startDate by caller

  // Loan/advance simulation inputs (read-only — no balance modification by core)
  activeLoans: Array<{
    id: number;
    outstandingBalance: string;
    emiAmount: string;
    loanType: string;
  }>;
  activeAdvances: Array<{
    id: number;
    outstandingBalance: string;
    recoveryAmount: string;
    recoveryType: string;
  }>;
  minimumTakeHome: number;   // from payrollSettings, sourced by caller
}

export interface SalaryResult {
  // Earnings (all r2-rounded)
  proratedBase: number;
  hra: number;
  conv: number;
  lta: number;
  specialAllowance: number;
  supplementaryAllowance: number;
  kgpAllowance: number;
  bonusAllowance: number;
  overtimePay: number;
  grossPay: number;          // sum of above excluding bonusAllowance

  // Statutory deductions (all r2-rounded)
  employeePF: number;
  employerPF: number;
  employeeESIC: number;
  employerESIC: number;
  professionalTax: number;
  gratuity: number;
  groupInsurance: number;

  // Loan/advance simulation (identical logic to official deduction — no DB writes by core)
  loanDeductions: number;
  advanceDeductions: number;
  loanBreakdown: Array<{ loanId: number; requested: number; applied: number }>;
  advanceBreakdown: Array<{ advanceId: number; requested: number; applied: number }>;

  // Subtotals (exact arithmetic on r2 components — NOT re-rounded)
  totalStatutoryDeductions: number;   // employeePF + employeeESIC + professionalTax
  totalDeductionsPreTds: number;      // totalStatutory + loans + advances
  netPayPreTds: number;               // grossPay - totalDeductionsPreTds

  // CTC
  ctcMonthly: number;
  ctcYearly: number;

  // Metadata
  paidDays: number;
  salaryBasis: number | 'actual_days';
  engineVersion: '2.0.0';            // literal — stamped on every result
}
```

### 4.3 Exported Constants

```typescript
export const PAYROLL_CONSTANTS = {
  MONTHLY_DIVISOR: 30,
  PF_RATE: 0.12,
  PF_CEILING: 15000,
  EMPLOYEE_ESIC_RATE: 0.0075,
  EMPLOYER_ESIC_RATE: 0.0325,
  ESIC_GROSS_CEILING: 21000,
  GRATUITY_NUMERATOR: 15,
  GRATUITY_DENOMINATOR: 26,
  GRATUITY_MONTHS: 12,
  BONUS_DEFAULT_RATE: 0.0833,
  ENGINE_VERSION: '2.0.0' as const,
} as const;
```

### 4.4 Rounding Rule — Authoritative

```typescript
const r2 = (n: number): number => Math.round(n * 100) / 100;
```

**Rules:**
- Every individual component uses `r2()` exactly once at the point of computation.
- Sums of already-rounded components (e.g. `grossPay`, `totalStatutoryDeductions`, `netPayPreTds`) are **never re-rounded**.
- This guarantees SAP JE self-balance: `totalDebit = totalCredit` within ±₹0.005.
- This rule is enforced by code review. The string `Math.round` must not appear in any file other than `payroll-salary-core.ts` for payroll arithmetic.

### 4.5 Professional Tax Rule — Authoritative

```typescript
function computeProfessionalTax(
  grossPay: number,
  isPTApplicable: boolean,
  ptMonthly: number,
  ptFebruary: number,
  isFebruary: boolean
): number {
  if (!isPTApplicable) return 0;
  const rate = isFebruary ? ptFebruary : ptMonthly;
  if (grossPay > 10000) return rate;
  if (grossPay > 7500) return 175;
  return 0;
}
```

PT values (`ptMonthly`, `ptFebruary`) are always read from `payrollSettings` DB table by the caller. The core never hardcodes PT amounts.

### 4.6 Statutory Applicability

`resolveStatutoryApplicability()` remains in `payroll-run-engine.ts`. Both the trial route and the pipeline call it before invoking the core. The result (three boolean flags) is passed into `computeEmployeeSalaryNumbers()` as inputs. This keeps the core decoupled from employee-type logic while ensuring both routes use the same statutory resolver.

### 4.7 Bonus Treatment — Authoritative

| Context | Bonus included? |
|---|---|
| Gross pay | No — bonus excluded from gross |
| PF basis | No — PF base = `min(proratedBase, 15000)` |
| ESIC basis | No — ESIC computed on grossPay which excludes bonus |
| PT basis | No — PT checked against grossPay |
| CTC monthly | Yes — `ctcMonthly = grossPay + employerPF + employerESIC + gratuity + groupInsurance + bonusAllowance` |
| CTC yearly | Yes — `ctcYearly = ctcMonthly × 12` |
| SAP JE earnings | No — bonus is not a period payroll disbursement in this system |
| Net pay | No — bonus not in grossPay, therefore not in netPay |

### 4.8 Net Pay Derivation — Authoritative

```
netPayPreTds = grossPay - totalDeductionsPreTds
finalNetPay  = netPayPreTds - tdsAmount
```

`tdsAmount` is computed by `tds-calculation-service.ts` and passed to the caller after the core returns. The core computes `netPayPreTds` only. The caller assembles `finalNetPay`. No independent rounding of net pay at any stage.

### 4.9 Pipeline Loan/Advance Handling

In the pipeline, `stepSalaryCalculation()` passes **empty arrays** for `activeLoans` and `activeAdvances` to the core. Loan and advance deductions are handled by the separate `stepDeductionCalculation()` step downstream. The core's loan/advance simulation is used exclusively by the trial route.

---

## 5. Trial Payroll Lifecycle

### 5.1 Purpose

The trial run allows an admin to:
- Compute and review a complete salary calculation for one employee before month-end
- Post the result to SAP B1 as a clearly marked trial JE for finance validation
- Reverse the trial JE in SAP B1
- Confirm the reversal in the THERMOPAC system
- Repeat the cycle if salary configuration or attendance is corrected
- Proceed to the official Start Run only after all trial JEs are reversed

### 5.2 Calculation Flow (Trial Route)

```
1.  Fetch period, salary config, employee (SELECT — no writes)
2.  Fetch live attendance records for the period (SELECT — no writes)
3.  Compute attendance figures: paidDays, lopDays, weeklyOffs, presentDays
4.  Call resolveStatutoryApplicability() — determines PF/ESIC/PT eligibility
5.  Fetch ptConfig from payrollSettings (SELECT — no writes)
6.  Fetch minimumTakeHome from payrollSettings (SELECT — no writes)
7.  Fetch active loans + advances (SELECT — read-only, no balance checks against record)
8.  Call computeEmployeeSalaryNumbers() — shared core, no DB access
9.  Call computeMonthlyTds() — TDS projection, no saveTdsRecord()
10. Compute finalNetPay = coreResult.netPayPreTds - tdsAmount
11. Assign nextTrialRunNo = MAX(trial_run_no) + 1 (inside transaction)
12. INSERT payroll_records:
      record_type = 'trial'
      trial_run_no = nextTrialRunNo
      trial_status = 'generated'
      calculation_engine_version = '2.0.0'
      All salary fields from coreResult
      tdsAmount from TDS service
      calculationSnapshot includes reproducibilityNote + attendanceReadAt + engineVersion
13. Return full result JSON to UI
```

### 5.3 What the Trial Route Explicitly Does NOT Do

- Does not read or write `payrollAttendanceSnapshot`
- Does not write `employeeLoanRepayments`
- Does not write `employeeAdvanceRecoveries`
- Does not update `employee_loans.outstanding_balance`
- Does not update `employee_advances.outstanding_balance`
- Does not call `saveTdsRecord()`
- Does not call `verifyPeriod()`
- Does not create or update `payrollLocks`
- Does not touch rows where `record_type = 'official'`

### 5.4 Trial Overwrite Rules

| State of existing trial(s) for same employee/period | Action |
|---|---|
| No trial rows exist | Create Trial #1 |
| Trial #N exists with `trial_status = 'generated'` | Create Trial #N+1. Old row remains untouched and cancellable independently. |
| Trial #N exists with `trial_status = 'sap_posted'` | **Block.** Error: "Reverse the existing trial JE before running another trial." |
| Trial #N exists with `trial_status = 'reversed'` | Create Trial #N+1 freely |
| Trial #N exists with `trial_status = 'cancelled'` | Create Trial #N+1 freely |
| Official record exists for same employee/period | Allowed — trial and official are independent rows |

No trial row is ever silently overwritten or deleted. Every trial record is permanent.

### 5.5 `trial_run_no` Generation

```typescript
// Inside a transaction:
const [maxRow] = await db
  .select({ maxNo: sql<number>`COALESCE(MAX(trial_run_no), 0)` })
  .from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.userId, userId),
    eq(payrollRecords.recordType, 'trial')
  ));

const nextTrialRunNo = (maxRow?.maxNo ?? 0) + 1;
// INSERT inside same transaction
```

### 5.6 Calculation Snapshot (per Trial Record)

Stored as JSONB in `calculationSnapshot` column:

```json
{
  "engineVersion": "2.0.0",
  "snapshotDate": "2026-04-28T14:25:00.000Z",
  "attendanceReadAt": "2026-04-28T14:24:58.000Z",
  "salaryConfigReadAt": "2026-04-28T14:24:57.000Z",
  "reproducibilityNote": "Trial run. Live data used at execution time. Not a frozen snapshot. Results may differ if attendance, leave, salary config, or payroll settings change after this timestamp.",
  "ptUsed": 200,
  "isFebruary": false,
  "paidDays": 30,
  "lopDays": 0,
  "salaryBasis": 30
}
```

---

## 6. Official Payroll Lifecycle

### 6.1 Purpose

The official Start Run is the only path that creates authoritative payroll records. It processes all eligible employees through a six-step pipeline with snapshots, locking, and run numbers.

### 6.2 Pipeline Steps (Unchanged Except Step 2)

| Step | Function | Change in v4.1 |
|---|---|---|
| 1. Attendance Snapshot | `stepAttendanceSnapshot()` | Unchanged |
| 2. Leave Consolidation | `stepLeaveConsolidation()` | Unchanged |
| **3. Salary Calculation** | **`stepSalaryCalculation()`** | **Refactored — now calls `computeEmployeeSalaryNumbers()`** |
| 4. KPI Adjustment | `stepKpiAdjustment()` | Unchanged |
| 5. Deduction Calculation | `stepDeductionCalculation()` | Unchanged |
| 6. TDS Calculation | `stepTdsCalculation()` | Unchanged |

### 6.3 `stepSalaryCalculation()` Refactor

The arithmetic block (lines 720–836 of the current implementation) is replaced with:

```typescript
const coreResult = computeEmployeeSalaryNumbers({
  basicSalary,
  salaryType,
  houseRentAllowance: parseFloat(sal.houseRentAllowance || '0'),
  // ... all fields from salary config
  paidDays: rawPaidDays,            // from payrollAttendanceSnapshot (frozen)
  lopDays,                          // from payrollAttendanceSnapshot (frozen)
  isPFApplicable: statutoryResult.isPFApplicable,
  isESICApplicable: statutoryResult.isESICApplicable,
  isPTApplicable: statutoryResult.isPTApplicable && emp.role !== 'Superuser',
  ptMonthly: ptConfig.monthly,      // DB-sourced once before loop
  ptFebruary: ptConfig.february,    // DB-sourced once before loop
  isFebruary,                       // derived from period.startDate
  activeLoans: [],                  // empty — loans handled by stepDeductionCalculation
  activeAdvances: [],               // empty — advances handled by stepDeductionCalculation
  minimumTakeHome,                  // DB-sourced once before loop
});
```

### 6.4 Official Record Query Filter (Critical Change)

All queries in `stepSalaryCalculation()` that read or write `payroll_records` must filter by `record_type = 'official'`:

```typescript
// Reading existing record — MUST filter by record_type
const existingRecord = await db
  .select()
  .from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.userId, emp.id),
    eq(payrollRecords.recordType, 'official')   // ← required
  ));

// Writing new record — MUST set record_type
await db.insert(payrollRecords).values({
  ...payrollData,
  recordType: 'official',
  trialRunNo: null,
  trialStatus: null,
  calculationEngineVersion: coreResult.engineVersion,  // '2.0.0'
});
```

---

## 7. State Machines

### 7.1 Trial Record State Machine

```
[Not started]
      │
      ▼  User clicks "Run Payroll Trial"
┌─────────────┐
│  generated  │ ──────────────────────────────────────► cancelled
└──────┬──────┘   User discards without posting          (terminal)
       │
       │  User clicks "Post Trial JE to SAP"
       │  SAP API call succeeds
       ▼
┌─────────────┐
│  sap_posted │  ← BLOCKS official Start Run
└──────┬──────┘
       │
       │  Admin reverses JE in SAP B1
       │  Admin clicks "Confirm Reversal" in UI
       │  Enters SAP reversal doc entry number
       ▼
┌─────────────┐
│  reversed   │  ← Official Start Run unblocked
└─────────────┘  (terminal)
```

**Transition rules:**
- `generated` → `sap_posted`: only on confirmed SAP API success
- `generated` → `cancelled`: admin action only; cannot cancel after SAP posting
- `sap_posted` → `reversed`: admin confirmation with mandatory SAP reversal doc entry
- `sap_posted` → `cancelled`: not permitted — once posted to SAP, reversal is the only path
- `reversed` → any: not permitted — terminal state
- `cancelled` → any: not permitted — terminal state

### 7.2 Official Record Status (Existing — Unchanged)

```
generated → approved → paid / locked
```

The existing `status` column on `payrollRecords` governs official record lifecycle. Unchanged by this plan.

---

## 8. API Endpoints

### 8.1 New Endpoints (`server/payroll-trial-routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/payroll/trial/run` | Create a new trial payroll record | payroll role |
| `GET` | `/api/payroll/trial/history/:periodId/:userId` | List all trial runs for employee/period | payroll role |
| `POST` | `/api/payroll/trial/:recordId/cancel` | Cancel a `generated` trial | payroll role |

### 8.2 New Endpoints (`server/admin-routes.ts`)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/admin/payroll/trial/:recordId/post-sap-je` | Post trial JE to SAP B1 | Superuser |
| `POST` | `/api/admin/payroll/trial/:recordId/confirm-reversal` | Record reversal confirmation | Superuser |
| `POST` | `/api/admin/payroll/verify/trial-vs-official` | 21-field parity comparison | Superuser |

### 8.3 Modified Endpoints

| Method | Path | Change |
|---|---|---|
| `GET` | `/api/payroll/run/preflight/:periodId` | New — returns blocking checks + drift report |
| `POST` | `/api/payroll/run/start` | Add pre-flight blocking check before pipeline begins |

### 8.4 Deprecated Endpoint

```
POST /api/payroll/run/single-user
```

**Handling:** Route stays registered. Returns HTTP 410 immediately with no DB operations:

```typescript
router.post('/run/single-user', async (req, res) => {
  console.warn('[DEPRECATED] /api/payroll/run/single-user called');
  return res.status(410).json({
    error: 'This endpoint has been deprecated.',
    migration: 'Use POST /api/payroll/trial/run for trial runs. Use POST /api/payroll/run/start for the official payroll pipeline.',
    code: 'ENDPOINT_DEPRECATED',
  });
});
```

No HTTP 301 redirect. POST redirects can cause unsafe re-POST behaviour in some clients.

---

## 9. SAP Governance

### 9.1 Trial JE Markers

| SAP Field | Trial JE | Official JE |
|---|---|---|
| `Memo` | `"[TRIAL #N] Salary JE - {empName} - {period}"` | `"Salary JE - {empName} - {period}"` |
| `Reference3` | `"92B-TRIAL"` | `"92B"` |
| `U_PayrollRunType` | `"TRIAL"` | `"OFFICIAL"` |
| `JournalEntryLines` | Identical amounts | Identical amounts |

The trial run number `N` is embedded in the SAP Memo so finance can identify which iteration corresponds to which system record when viewing JEs directly in SAP B1.

### 9.2 `buildSalaryJePayload()` Changes (`server/admin-routes.ts`)

```typescript
function buildSalaryJePayload(
  record: any,
  employee: any,
  empName: string,
  periodLabel: string,
  postingDate: string,
  glMap: Map<string, string>,
  ptAmountOverride: number | undefined,
  isTrial: boolean = false,      // ← new
  trialRunNo?: number            // ← new
)
```

When `isTrial = true`:
```typescript
const memoPrefix = `[TRIAL #${trialRunNo}] `;
Memo: `${memoPrefix}Salary JE - ${empName} - ${periodLabel}`,
Reference3: '92B-TRIAL',
U_PayrollRunType: 'TRIAL',
```

### 9.3 Trial JE Post Route (in `admin-routes.ts`)

`POST /api/admin/payroll/trial/:recordId/post-sap-je`

- Reads only `record_type = 'trial'` records — 404 if called with official record ID
- Validates `trial_status = 'generated'` — rejects if already posted or reversed
- Builds JE with trial markers
- On SAP success: sets `trial_status = 'sap_posted'`, writes `sap_doc_entry`, `sap_je_number`, `sap_posted_at`

### 9.4 Trial JE Reversal Confirmation (`admin-routes.ts`)

`POST /api/admin/payroll/trial/:recordId/confirm-reversal`

Body:
```json
{
  "reversalSapDocEntry": 4418,
  "reversalSapJeNumber": "00004418",
  "reversalMemo": "Trial #2 validated. Proceeding to official run."
}
```

Action:
- Validates `trial_status = 'sap_posted'`
- Sets `trial_status = 'reversed'`
- Writes `reversal_sap_doc_entry`, `reversal_sap_je_number`, `reversal_sap_posted_at`, `reversed_by`, `reversed_at`, `reversal_memo`

### 9.5 Official Start Run Blocking

Checked inside `POST /api/payroll/run/start` before any pipeline step:

```typescript
const activeTrialJes = await db
  .select({ userId: payrollRecords.userId, trialRunNo: payrollRecords.trialRunNo, sapJeNumber: payrollRecords.sapJeNumber })
  .from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.recordType, 'trial'),
    eq(payrollRecords.trialStatus, 'sap_posted')
  ));

if (activeTrialJes.length > 0) {
  return res.status(409).json({
    error: 'Official payroll run blocked: unreversed trial JEs exist.',
    code: 'TRIAL_JE_UNREVERSED',
    blockedEmployees: activeTrialJes,
  });
}
```

| `trial_status` | Blocks official Start Run? |
|---|---|
| `generated` | No — no SAP exposure |
| `sap_posted` | **Yes — must be reversed** |
| `reversed` | No |
| `cancelled` | No |

---

## 10. Parity Verification

### 10.1 Purpose

Confirms that Trial and Official records for the same employee/period produced consistent results, detecting any remaining calculation-logic divergence.

### 10.2 Endpoint

`POST /api/admin/payroll/verify/trial-vs-official`

Body: `{ periodId: number, userId: number }`

### 10.3 21-Field Comparison Set

```
1.  grossPay
2.  proratedBase (stored as baseSalary)
3.  hra
4.  conveyanceAllowance
5.  ltaAllowance
6.  specialAllowance
7.  supplementaryAllowance
8.  kgpAllowance
9.  bonus
10. overtimePay
11. employeePf
12. employeeEsic
13. professionalTax
14. gratuity
15. loanDeductions
16. advanceDeductions
17. tdsAmount
18. totalDeductions
19. netPay
20. ctcMonthly
21. calculationEngineVersion   ← field 21 — added in v4.1
```

### 10.4 Divergence Classification

| Divergence type | Meaning | UI treatment |
|---|---|---|
| `attendance-driven` | Same calc core, different attendance inputs (live vs frozen) | Amber — expected if attendance changed between trial and official |
| `calculation-logic` | Same attendance inputs, different output | Red — indicates core was not used consistently; blocks SAP JE posting |
| `engine-version-mismatch` | Trial is `legacy`, official is `2.0.0` | Critical red — trial predates refactor; figures are not comparable |

### 10.5 Engine Version Mismatch Response

```json
{
  "matches": false,
  "divergences": [
    {
      "field": "calculationEngineVersion",
      "trial": "legacy",
      "official": "2.0.0",
      "type": "engine-version-mismatch",
      "severity": "critical",
      "message": "Trial was computed by unversioned legacy logic. Official record used engine v2.0.0. Run a new trial before accepting these results."
    }
  ]
}
```

---

## 11. Pre-Official Drift Detection

### 11.1 Problem

Finance validates a trial JE in SAP B1. Between the trial run and the official Start Run, attendance is corrected. The official payroll produces different figures from what finance validated. This goes undetected until the JE is posted.

### 11.2 Drift Check Logic

Runs as part of `GET /api/payroll/run/preflight/:periodId`.

For each employee with a `reversed` trial for the period, compare `trial.created_at` against:

```typescript
// a. Attendance records updated after trial
SELECT date, updated_at FROM attendance_records
  WHERE user_id = ? AND date BETWEEN period.start AND period.end
    AND updated_at > trialCreatedAt;

// b. Leave requests changed after trial
SELECT id, updated_at FROM leave_requests
  WHERE employee_id = ? AND status = 'approved'
    AND start_date <= period.end AND end_date >= period.start
    AND updated_at > trialCreatedAt;

// c. Salary config changed after trial
SELECT updated_at FROM employee_salaries
  WHERE user_id = ? AND is_active = true
    AND updated_at > trialCreatedAt;

// d. Payroll settings changed after trial
SELECT setting_name, updated_at FROM payroll_settings
  WHERE updated_at > trialCreatedAt;
```

### 11.3 Pre-Flight Response Structure

```json
{
  "checks": {
    "attendanceLocked": true,
    "noActiveTrialJes": true,
    "noUnresolvedVerifications": true,
    "noDriftSinceTrialReversal": false
  },
  "blocking": [],
  "warnings": ["noDriftSinceTrialReversal"],
  "driftReport": {
    "hasDrift": true,
    "employees": [
      {
        "userId": 23,
        "employeeName": "Ramesh Kumar",
        "latestTrialRunNo": 2,
        "trialCreatedAt": "2026-04-28T14:25:00Z",
        "driftReasons": [
          {
            "source": "attendance",
            "description": "Attendance on 2026-04-25 updated after trial",
            "changedAt": "2026-04-29T10:12:00Z"
          }
        ]
      }
    ]
  }
}
```

### 11.4 Blocking vs Warning

| Condition | Classification | Start Run effect |
|---|---|---|
| `noActiveTrialJes = false` | **Blocking** | Button disabled — no override |
| `noDriftSinceTrialReversal = false` | **Warning** | Amber confirmation dialog required |
| `noUnresolvedVerifications = false` | **Blocking** | Button disabled — no override |

### 11.5 Drift Confirmation Dialog

```
⚠ WARNING: Payroll-Affecting Data Changed After Trial Validation

The following employees had changes after their trial JE was reversed:
• Ramesh Kumar (Trial #2, reversed 28-Apr 15:10)
  - Attendance updated: 29-Apr 10:12
  - Leave approved: 29-Apr 11:00

The official payroll figures may differ from the validated trial JE.

[ Cancel ]    [ I understand — proceed with official run ]
```

Confirmation is logged in the payroll run log:
```json
{
  "driftConfirmed": true,
  "confirmedBy": 1,
  "confirmedAt": "2026-04-30T09:05:00Z",
  "driftEmployees": [23]
}
```

---

## 12. Trial Reproducibility Limitation

### 12.1 Authoritative Statement

> **Trial payroll records are NOT immutable snapshots.**
> Trial runs read live attendance, leave, salary configuration, and payroll settings at the moment of execution. Any subsequent change to any of these data sources will cause a new trial run to produce different figures — even for the same employee and period. The trial record in the database reflects only the state of the system at the time that specific trial was executed.
>
> Official records ARE reproducible via `payrollAttendanceSnapshot` and `payrollSalarySnapshot`. Trial records carry no such guarantee.

### 12.2 Where This Is Documented

**`replit.md` — Architecture Decisions section:**
> Trial Payroll Reproducibility: Trial runs read live attendance, leave, salary config, and PT/payroll settings. Trial records are NOT reproducible snapshots. If any payroll-affecting data changes after a trial is run, a new trial must be executed before the trial JE can be considered representative of the final official payroll. Official records are reproducible via payrollAttendanceSnapshot and payrollSalarySnapshot.

**Trial run dialog — amber warning banner:**
> "Trial run only. No loan/advance balances are modified. TDS is simulated. Trial results reflect live data at execution time and are NOT guaranteed to match the official Start Run if attendance, leave, salary configuration, or payroll settings change afterwards."

**Trial history table — per-row data freshness indicator:**
```
#   Status     Date           Data Freshness
1   reversed   28-Apr 11:20   ⚠ Stale — attendance updated 29-Apr
2   reversed   28-Apr 14:25   ⚠ Stale — leave approved 29-Apr
3   sap_posted 29-Apr 09:10   ✓ Current
```

**`calculationSnapshot` JSONB on every trial record:**
```json
{
  "reproducibilityNote": "Trial run. Live data used at execution time. Not a frozen snapshot. Results may differ if attendance, leave, salary config, or payroll settings change after this timestamp.",
  "attendanceReadAt": "2026-04-28T14:24:58.000Z",
  "salaryConfigReadAt": "2026-04-28T14:24:57.000Z"
}
```

---

## 13. Migration Strategy

### 13.1 Migration Script (Safe, Additive Only)

```sql
-- Step 1: Add record_type column
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS record_type
    VARCHAR(10) NOT NULL DEFAULT 'official'
    CONSTRAINT chk_record_type CHECK (record_type IN ('trial', 'official'));

-- Step 2: Add trial_run_no column
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS trial_run_no INTEGER;

-- Step 3: Add trial_status column
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS trial_status
    VARCHAR(15)
    CONSTRAINT chk_trial_status CHECK (
      trial_status IN ('generated', 'sap_posted', 'reversed', 'cancelled')
    );

-- Step 4: Add calculation_engine_version column
ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS calculation_engine_version
    VARCHAR(20) NOT NULL DEFAULT 'legacy';

-- Step 5: Drop old unique constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_records_period_id_user_id_key'
  ) THEN
    ALTER TABLE payroll_records
      DROP CONSTRAINT payroll_records_period_id_user_id_key;
  END IF;
END $$;

-- Step 6: Create partial unique index for official records
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_official
  ON payroll_records (period_id, user_id)
  WHERE record_type = 'official';

-- Step 7: Create partial unique index for trial records
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_trial_run
  ON payroll_records (period_id, user_id, trial_run_no)
  WHERE record_type = 'trial';
```

### 13.2 Safety Properties

- All steps are additive (no DROP COLUMN, no data DELETE, no UPDATE)
- Step 5 is conditional — only drops if the constraint exists
- Existing rows are correctly classified by DB DEFAULT values without any application intervention
- Rollback: `DROP COLUMN` on each of the four columns (no functional rollback needed — columns are nullable or have safe defaults)
- Zero downtime: additive DDL operations do not require table locks in PostgreSQL with appropriate settings

---

## 14. Implementation Sequence

| Step | Task | Risk | Depends on |
|---|---|---|---|
| 1 | DB migration (4 columns, 2 indexes) | Low — additive DDL | None |
| 2 | `shared/schema.ts` — add 4 new column definitions | Low — additive | Step 1 |
| 3 | Create `server/payroll-salary-core.ts` | Zero — new file | None |
| 4 | Refactor `stepSalaryCalculation()` in `payroll-run-engine.ts` | Medium — test against known figures | Step 3 |
| 5 | Create `server/payroll-trial-routes.ts` — all trial lifecycle endpoints | Low — new file | Steps 2, 3 |
| 6 | Update `server/admin-routes.ts` — JE builder trial flag, trial JE post + confirm-reversal endpoints, parity verification | Low — additive | Step 2 |
| 7 | Update `server/payroll-routes.ts` — `/run/single-user` → 410; pre-flight check in `/run/start`; new preflight endpoint | Low — mostly additive | Step 2, Step 5 live |
| 8 | Frontend: Salary Config tab — trial dialog with history table, action buttons, amber banner | Low — UI only | Step 5 |
| 9 | Frontend: Payroll Run Engine tab — pre-flight panel, drift confirmation, remove single-user dropdown | Low — UI only | Steps 5, 6, 7 |
| 10 | Update `replit.md` — trial reproducibility limitation | Zero — docs | None |
| 11 | Verify all 20 acceptance tests | — | All steps |

---

## 15. Complete File Change List

| File | Change type | Summary |
|---|---|---|
| `server/payroll-salary-core.ts` | **New** | `computeEmployeeSalaryNumbers()`, `PAYROLL_CONSTANTS`, `r2()` |
| `server/payroll-trial-routes.ts` | **New** | Trial run, cancel, history endpoints |
| `server/payroll-run-engine.ts` | **Refactor** | `stepSalaryCalculation()` — arithmetic replaced by core call; official record filter added; `record_type='official'` on writes |
| `server/payroll-routes.ts` | **Update** | `/run/single-user` → 410; `/run/start` pre-flight; `/run/preflight/:periodId` endpoint |
| `server/admin-routes.ts` | **Update** | `buildSalaryJePayload()` trial flag; trial JE post endpoint; trial reversal confirm endpoint; 21-field parity verification endpoint |
| `shared/schema.ts` | **Update** | 4 new columns on `payrollRecords` |
| DB migration | **Migration** | 4 columns, conditional constraint drop, 2 partial unique indexes |
| `client/src/pages/admin/payroll-management-new.tsx` | **Update** | Trial dialog + trial history table + data freshness indicators; PayrollRunTab pre-flight panel + drift confirmation; single-user dropdown removed |
| `replit.md` | **Update** | Trial reproducibility limitation documented in Architecture Decisions |

### Files Explicitly NOT Changed

| File | Reason |
|---|---|
| `server/tds-calculation-service.ts` | Trial calls `computeMonthlyTds()` only — no internal change needed |
| `server/payroll-run-engine.ts` — all steps except `stepSalaryCalculation()` | Deduction, TDS, KPI, bonus, attendance, leave steps unchanged |
| `client/src/components/payroll-run-wizard.tsx` | Pipeline wizard UI unchanged |
| `server/salary-calculation-engine.ts` | Display/preview only. Phase 2 future alignment. Not in scope. |
| All other application files | No payroll arithmetic dependencies |

---

## 16. Acceptance Tests

All 20 tests must pass before any SAP JE posting from the new routes is permitted.

| # | Test | Pass Condition |
|---|---|---|
| 1 | Run trial for Employee A, Period April | Trial record created: `record_type='trial'`, `trial_run_no=1`, `trial_status='generated'`, `calculation_engine_version='2.0.0'` |
| 2 | Run trial again same employee/period | Second row created: `trial_run_no=2`; first row untouched |
| 3 | Post trial JE to SAP | `trial_status='sap_posted'`, `sap_doc_entry` populated; SAP Memo = `"[TRIAL #2] Salary JE..."` |
| 4 | Click Start Run with unconfirmed trial JE | HTTP 409 returned; pipeline not started |
| 5 | Confirm reversal | `trial_status='reversed'`, `reversal_sap_doc_entry` populated |
| 6 | Click Start Run after reversal (no drift) | Pipeline runs; official record created with `record_type='official'`, `trial_run_no=NULL`, `calculation_engine_version='2.0.0'` |
| 7 | Parity check — same attendance inputs | All 21 fields match; `summary = "consistent"` |
| 8 | Parity check — engine version mismatch | `calculationEngineVersion` divergence returned as `type="engine-version-mismatch"`, `severity="critical"` |
| 9 | `SELECT COUNT(*) FROM payroll_records WHERE record_type='trial'` before/after official run | Count unchanged — official run does not touch trial rows |
| 10 | `SELECT outstanding_balance FROM employee_loans` before/after trial run | Unchanged — trial never modifies loan balances |
| 11 | Call `POST /api/payroll/run/single-user` | HTTP 410 with deprecation JSON; zero DB operations |
| 12 | PT for non-February period | `professional_tax = 200` (from DB) — not 300 — in both trial and official records |
| 13 | PT for February period | `professional_tax = 300` (from DB) in both trial and official records |
| 14 | ESIC on partial-month gross | `employee_esic = r2(grossPay × 0.0075)` — rounded to 2dp — in both trial and official |
| 15 | Drift detected after reversal | `preflight.noDriftSinceTrialReversal = false`; driftReport lists affected employees and sources |
| 16 | Drift confirmation logged | `payrollRunLog` entry contains `driftConfirmed: true`, `confirmedBy`, `confirmedAt` |
| 17 | Trial record `calculationSnapshot` | Contains `reproducibilityNote`, `attendanceReadAt`, `engineVersion: "2.0.0"` |
| 18 | Official record `calculationSnapshot` | Contains `engineVersion: "2.0.0"` |
| 19 | Amber banner in trial dialog | Contains text: "NOT guaranteed to match the official Start Run if attendance...changes afterwards" |
| 20 | Trial history data freshness indicator | Row shows ⚠ indicator if data changed after that trial's `created_at` |

---

## 17. Architectural Confirmations

### Confirmation 1: Single Source of Truth — Yes, Unconditionally

After v4.1 implementation, `computeEmployeeSalaryNumbers()` in `server/payroll-salary-core.ts` is the only location in the codebase that performs payroll arithmetic. Both the trial route and the official pipeline call the same function. A bug found and fixed in the core is fixed for both simultaneously, with no other code to change.

### Confirmation 2: No Duplicate Arithmetic

| Arithmetic | Current locations | After refactor |
|---|---|---|
| Salary proration | `payroll-routes.ts` L771, `payroll-run-engine.ts` L746 | Core only |
| Gross pay assembly | `payroll-routes.ts` L781, `payroll-run-engine.ts` L767 | Core only |
| PF computation | `payroll-routes.ts` L785, `payroll-run-engine.ts` L807 | Core only |
| ESIC computation | `payroll-routes.ts` L790, `payroll-run-engine.ts` L816 | Core only |
| PT computation | `payroll-routes.ts` L795 (hardcoded), `payroll-run-engine.ts` L826 | Core only |
| Gratuity computation | `payroll-routes.ts` L798, `payroll-run-engine.ts` L822 | Core only |
| Overtime computation | `payroll-routes.ts` L763–765, `payroll-run-engine.ts` L727 | Core only |
| CTC assembly | `payroll-routes.ts` L854, `payroll-run-engine.ts` L835 | Core only |
| Net pay derivation | `payroll-routes.ts` L933, `payroll-run-engine.ts` L833 | Core only |

### Confirmation 3: Fix Propagation — Per Calculation Type

| Calculation | Fix in core fixes both Trial and Official? |
|---|---|
| PT | Yes — core receives DB-sourced values from caller |
| PF | Yes — `pfBase × PF_RATE` with `r2()` |
| ESIC | Yes — `grossPay × EMPLOYEE_ESIC_RATE` with `r2()` |
| Gratuity | Yes — `r2((basicSalary × 15/26) / 12)` |
| Rounding | Yes — `r2()` defined once in core |
| Gross/net pay | Yes — formula and derivation in core |
| Overtime | Yes — `hourlyRate × overtimeHours × otRate × otMultiplier` with `r2()` |
| Statutory applicability | Yes — `resolveStatutoryApplicability()` called by both callers; flags passed to core |
| Salary proration | Yes — `r2(component × paidDays / MONTHLY_DIVISOR)` |
| Bonus | Yes — bonus logic inside core |
| Loan/advance capacity | Yes — priority logic (emergency first, FIFO, floor) inside core |

---

## 18. Intentional Separations

These are correct design differences. They are not bugs or duplications.

| Area | Trial Run | Official Run | Why Intentionally Different |
|---|---|---|---|
| Attendance source | Live `attendance_records` at execution time | Frozen `payrollAttendanceSnapshot` | Trial checks current state; official uses governance-locked inputs |
| Loan/advance DB writes | Core computes amounts; route does NOT write to loan/advance tables | Core computes same amounts; `stepDeductionCalculation()` writes to tables | Trial must be fully reversible without loan accounting corrections |
| TDS persistence | `computeMonthlyTds()` only — result stored in trial record | `computeMonthlyTds()` AND `saveTdsRecord()` | Trial TDS is a projection; official TDS is the committed statutory liability |
| Run number | `trial_run_no` — sequential per employee per period | `runNumber` — from pipeline run log covering all employees | Different audit axes: trial tracks iteration; official tracks pipeline execution |
| Record type | `record_type = 'trial'` | `record_type = 'official'` | Separate uniqueness enforcement; neither route touches the other's rows |
| SAP JE markers | `[TRIAL #N]` prefix; `92B-TRIAL`; `U_PayrollRunType: 'TRIAL'` | No prefix; `92B`; `U_PayrollRunType: 'OFFICIAL'` | Finance must distinguish trial from official in SAP B1 |
| SAP JE reversibility | Required before official run | Permanent accounting record | Trial is validation; official is commitment |
| Snapshot creation | None — trial reads live data | `payrollAttendanceSnapshot` + `payrollSalarySnapshot` created | Official run must be reproducible; trial run is not expected to be |
| Reproducibility | Not guaranteed (live data) | Guaranteed via snapshots | Documented limitation — by design |

---

## 19. Calculation Engine Version Policy

### Version Values

| Value | Meaning | Applied to |
|---|---|---|
| `'legacy'` | Pre-refactor inline logic. Rules unverifiable by code reference. | All existing rows via DB DEFAULT |
| `'2.0.0'` | `computeEmployeeSalaryNumbers()` in `payroll-salary-core.ts`. Rules documented in this baseline. | All new rows after refactor — both trial and official |
| `'2.x.y'` | Future versions, bumped per policy below | Future runs |

### Version Bump Policy

| Trigger | Bump |
|---|---|
| Rounding formula change | Minor → e.g. `2.1.0` |
| Statutory rate change coded in core (e.g. PF rate) | Minor |
| PT/ESIC ceiling change coded in core | Minor |
| Proration formula change (e.g. `MONTHLY_DIVISOR`) | Major → e.g. `3.0.0` |
| PT config DB value change only | **No bump** — DB-driven; old records retain their version; new records get current |

### Storage

`calculation_engine_version` is stored in two places per record:
1. `payroll_records.calculation_engine_version` — queryable column for auditing and parity checks
2. `payroll_records.calculationSnapshot.engineVersion` — JSONB snapshot for full contextual audit

---

---

## 20. Standard Payroll Verification Checklist

This checklist must be completed — and all items confirmed pass — before merging any change that touches TDS, salary, payroll, or tax-config logic.

### 20.1 — When to Run

Run this checklist after any change to:

| Changed file / area | Checklist required |
|--------------------|--------------------|
| `server/tax-config/fy-*.ts` | Yes |
| `server/tax-config/index.ts` | Yes |
| `server/tds-calculation-service.ts` | Yes |
| `server/payroll-salary-core.ts` | Yes |
| `server/payroll-routes.ts` | Yes |
| `server/payroll-run-engine.ts` | Yes |
| `server/payroll-trial-routes.ts` | Yes |
| `server/statutory-compliance-routes.ts` | Yes |
| DB migration touching `tax_slabs`, `tds_monthly_records`, `payroll_records`, `employee_tax_declarations` | Yes |
| Any change to slab rates, std deduction, cess, 87A values | Yes |

### 20.2 — Checklist Steps

```
STEP  COMMAND / ACTION                                       PASS CONDITION
────  ──────────────────────────────────────────────────────  ──────────────────────────────────────────
P1    npx tsx server/tax-config/tds-slab-verify.ts           44/44 PASSED, exit code 0
P2    npm run check                                          0 TypeScript errors in changed files
P3    grep -c "regime === 'old'" server/tds-calculation-service.ts   0
P4    grep -c "calculateHraExemption" server/tds-calculation-service.ts  0
P5    grep -c "calculateDeductions\|calculateBonuses" server/payroll-routes.ts  0
P6    grep -n "record_type.*official" server/statutory-compliance-routes.ts   ≥2 matches (C7 + C8)
P7    grep -n "record_type.*official" server/tds-calculation-service.ts    ≥1 match (C3)
P8    grep -n "section87aRebateCap" server/tds-calculation-service.ts   ≥1 match (C4)
P9    grep -n "getTaxConfig" server/tds-calculation-service.ts     ≥1 match (N4)
P10   App starts without error on port 5000 (npm run dev)   No EADDRINUSE or unhandled exceptions in log
```

### 20.3 — High-Income Slab Test — Expected Values (FY 2025-26)

| Gross Annual | Taxable | Total Annual TDS |
|-------------|---------|-----------------|
| ₹30,00,000 | ₹29,25,000 | **₹4,75,800** |
| ₹50,00,000 | ₹49,25,000 | **₹10,99,800** |
| ₹1,00,00,000 | ₹99,25,000 | **₹26,59,800** |

These figures are the permanent regression anchors. Any change to slab config that shifts these numbers requires explicit sign-off from the Finance team and a version bump to the affected `fy-*.ts` file.

### 20.4 — Annual FY Config Gate (before first April payroll)

1. Create `server/tax-config/fy-YYYY-YY.ts` with Finance Ministry values
2. Register in `server/tax-config/index.ts`
3. Finance team signs off on slab values, std deduction, cess, and 87A figures
4. Run `npx tsx server/tax-config/tds-slab-verify.ts` — update expected values for new FY if rates changed
5. Merge to main **before** April payroll is processed

### 20.5 — Governance References

| Document | Governs |
|----------|---------|
| `docs/tds-governance-correction-plan-v1.3.md` | TDS arithmetic, regime policy, FY config, test suite |
| `docs/payroll-governance-v4.1-baseline.md` | Trial/official segregation, payroll core, SAP governance |
| `server/tax-config/tds-slab-verify.ts` | Permanent 44-test arithmetic verification |
| `server/tax-config/fy-2025-26.ts` | FY 2025-26 slab constants (source of truth) |
| `server/tds-calculation-service.ts` | Single TDS arithmetic source |
| `server/payroll-salary-core.ts` | Single salary arithmetic source |

---

*End of Payroll Governance Baseline v4.1*

*This document is the authoritative implementation reference. All implementation decisions must be traceable to a section of this document. Any deviation requires a versioned amendment approved by THERMOPAC Management.*
