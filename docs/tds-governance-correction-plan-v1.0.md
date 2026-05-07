# Payroll TDS Calculation Governance — Correction Plan v1.0
**Date:** 2026-05-07  
**Scope:** All server-side payroll TDS calculation, storage, and downstream consumption  
**Mandate:** Trial route and official run route use the exact same TDS service and same payroll core logic. No duplicate TDS arithmetic anywhere.

---

## §0 — Existing TDS Management UI (Context)

The application already has a fully-built Income Tax & TDS Management tab in the Payroll Management page (`payroll-management-new.tsx`), composed of three sub-panels in `tds-management.tsx`:

| Tab | What it does |
|-----|-------------|
| **Tax Slabs** | View and seed both New Regime and Old Regime slabs per FY. Correctly shows both regimes side-by-side. "Load Default Slabs" button seeds `tax_slabs` via `POST /api/payroll/tax-slabs/seed-defaults`. |
| **Declarations** | Full CRUD + approval workflow for `employee_tax_declarations`. Correctly shows Old Regime fields (HRA, 80C, 80D, 24B, etc.) conditionally only when regime = 'old'. Status lifecycle: draft → submitted → approved/rejected. |
| **TDS Dashboard** | Period-level view of `tds_monthly_records` (employee, regime, projected taxable, monthly TDS, YTD TDS). Contains a **"Compute TDS"** button that calls `POST /api/payroll/tds/compute/:periodId` directly. |

The UI is correct and complete. All defects described below are **backend service defects** — the UI is already capturing the right data; the backend is not using it correctly.

---

## §1 — Canonical Architecture (Target State)

```
employeeTaxDeclarations (status='approved')
         │ read by
         ▼
computeMonthlyTds()        ← Single arithmetic source for ALL TDS figures
     ↑
     │ called by
     ├── payroll-trial-routes.ts   (trial: compute + include in record, NO saveTdsRecord)
     └── tds-calculation-service.ts → computeAndSaveTdsForPeriod()
              ↑
              ├── payroll-run-engine.ts  step 'tds_calculation' (official pipeline)
              └── payroll-routes.ts  POST /tds/compute/:periodId  (manual re-compute,
                                     must only be called post-lock or by admin)

payroll-routes.ts          ← Route wiring only. NO TDS arithmetic.
admin-routes.ts            ← Reads record.tdsAmount from DB for SAP JE. No arithmetic.
salary-slip-generator.ts   ← Reads stored incomeTax field. No arithmetic.
payroll-calculation-verifier.ts ← Reads tds_monthly_records for post-run checks. No arithmetic.
manual-salary-routes.ts    ← tdsAmount = 0 intentionally (non-system users,
                              Section 194C, separate compliance register).
```

**One service. One function. Two callers (trial, official). All others read.**

---

## §2 — Defect Register

### BUG-01 · CRITICAL — Regime Hardcoded to `'new'`; Old Regime Is Dead Code

**File:** `server/tds-calculation-service.ts` line 126  
**Code:**
```typescript
const regime = 'new';   // ← hardcoded literal
// declaration is fetched on line 120 but declaration.regime is never read
```

**Impact:** Every employee is taxed under New Regime regardless of what they declared in the UI.  
Employees who submitted an Old Regime declaration lose all their deductions silently:

| Deduction | Old Regime | New Regime (current) | Loss |
|-----------|------------|----------------------|------|
| Standard deduction | ₹50,000 | ₹75,000 | New regime is better here (minor) |
| HRA exemption | Up to ₹1–2L/yr | Not available | Up to ₹2,00,000 lost |
| Section 80C | Up to ₹2,00,000 | Not available | Up to ₹2,00,000 lost |
| Section 80D | Up to ₹1,00,000 | Not available | Up to ₹1,00,000 lost |
| Section 24B | Up to ₹2,00,000 | Not available | Up to ₹2,00,000 lost |

The UI's Declarations tab correctly shows and captures all these fields. They are stored in `employee_tax_declarations`. They are fetched by the service. They are then discarded because `regime` is hardcoded before the data is applied.

The entire `if (regime === 'old' && declaration)` block (lines 176–204) is live, tested-looking code that is **never reached**.

**Fix:**
```typescript
// Replace line 126:
const regime = (declaration?.regime === 'old') ? 'old' : 'new';
```
The existing Old Regime code block (lines 176–204) must be kept and verified.

**Correction item:** C1

---

### BUG-02 · CRITICAL — Declaration Status Not Validated; Draft/Rejected Declarations Affect TDS

**File:** `server/tds-calculation-service.ts` lines 120–124  
**Code:**
```typescript
const [declaration] = await db.select().from(employeeTaxDeclarations)
  .where(and(
    eq(employeeTaxDeclarations.userId, userId),
    eq(employeeTaxDeclarations.financialYear, financialYear)
  ));
// ↑ NO status filter — reads draft, submitted, approved, AND rejected equally
```

**Context:** `employee_tax_declarations` has a `status` column (`draft` | `submitted` | `approved` | `rejected`) and a full approval workflow in the UI. HR/Finance can create a declaration, submit it, and an admin approves or rejects it. The intent is clear: only approved declarations should affect TDS.

**Impact:**
- An employee submits an Old Regime declaration with ₹2L in 80C — HR rejects it — TDS service still applies the ₹2L deduction.
- An employee has a draft declaration from last FY that was never cleaned up — it silently affects TDS.
- After BUG-01 is fixed, this becomes especially serious: 80C/HRA deductions from draft or rejected declarations would reduce TDS incorrectly.

**Fix:** Add `status='approved'` filter. Fall back to zero deductions (effectively New Regime defaults) if no approved declaration exists. `previousEmployerIncome` and `previousEmployerTds` fields should also only be read from approved declarations to prevent manipulation.
```typescript
const [declaration] = await db.select().from(employeeTaxDeclarations)
  .where(and(
    eq(employeeTaxDeclarations.userId, userId),
    eq(employeeTaxDeclarations.financialYear, financialYear),
    eq(employeeTaxDeclarations.status, 'approved')   // ← only approved
  ));
```

**Note:** The unique index `emp_tax_decl_user_fy` on `(userId, financialYear)` ensures at most one declaration per user per FY, so there is no ambiguity about which record to use once filtered.

**Correction item:** C2

---

### BUG-03 · CRITICAL — `computeAndSaveTdsForPeriod` Lacks `record_type='official'` Filter

**File:** `server/tds-calculation-service.ts` line 334  
**Code:**
```typescript
const records = await db.select().from(payrollRecords)
  .where(eq(payrollRecords.periodId, periodId));
// ↑ NO record_type filter — fetches trial AND official rows
```

**Impact:** The TDS Dashboard's "Compute TDS" button (`POST /api/payroll/tds/compute/:periodId`) calls `computeAndSaveTdsForPeriod()` directly, bypassing the payroll run engine's preflight check. If any `record_type='trial'` rows exist for the period when this runs:
1. TDS is computed for trial rows
2. `saveTdsRecord()` is called for each trial row — this upserts `tds_monthly_records` (unique key: `userId + periodId`)
3. The trial employee's `income_tax`, `tds_amount`, `total_deductions`, `net_pay` are overwritten
4. The official row's TDS record may be overwritten or interleaved with trial data

**Fix:** Add `record_type='official'` filter:
```typescript
const records = await db.select().from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.recordType as any, 'official')
  ));
```

**Correction item:** C3

---

### BUG-04 · HIGH — `section87aRebate` Computed as `Math.min(x, x)`

**File:** `server/tds-calculation-service.ts` line 219  
**Code:**
```typescript
section87aRebate = Math.min(taxOnProjectedIncome + cessAmount,
                            taxOnProjectedIncome + cessAmount);
// Math.min(x, x) = x — no minimum is being taken; both arguments are identical
```

**Current behaviour (New Regime only):** Functionally correct by coincidence — since both arguments are the same and `taxOnProjectedIncome` + `cessAmount` are then zeroed, the annual liability is correctly 0 for income ≤ ₹7L.

**Defect when Old Regime is activated (BUG-01 fix):** Section 87A rebate under Old Regime (FY 2025-26) is **capped at ₹12,500** and the threshold is income ≤ ₹5L (not ₹7L). The current code would give a full uncapped rebate for Old Regime employees with income ≤ ₹5L, resulting in zero TDS where the actual liability could be several thousand rupees per month.

**Fix:** Apply proper regime-specific caps:
```typescript
// Determine rebate cap per regime
const maxRebateCap = regime === 'new'
  ? Infinity           // New Regime: full rebate for income ≤ 7L (no Rs cap)
  : 12500;             // Old Regime: capped at ₹12,500

section87aRebate = Math.min(taxOnProjectedIncome, maxRebateCap);
taxOnProjectedIncome = Math.max(0, taxOnProjectedIncome - section87aRebate);
cessAmount = taxOnProjectedIncome * cessRate;  // cess computed on post-rebate tax
```

**Note:** The rebate threshold (₹7L New / ₹5L Old) comes from `slabs[0].section87aRebateLimit` which is already correctly seeded per regime. Only the cap amount needed fixing.

**Correction item:** C4

---

### BUG-05 · HIGH — `calculateDeductions()` Dead Code with Flat-Rate TDS Formula

**File:** `server/payroll-routes.ts` lines 448–511  
**Code:**
```typescript
function calculateBonuses(...) { ... }   // lines 448–490 — dead code
function calculateDeductions(baseSalary: number, settings: Record<string, string>) {
  const incomeTaxRate = parseFloat(settings.income_tax_rate || '10') / 100;
  const incomeTax = baseSalary * incomeTaxRate;   // ← flat 10% — not the TDS service
  ...
}   // lines 493–511 — dead code
```

**Status:** Both functions are defined but never called. Their only historical caller, `POST /api/payroll/generate-payroll/:periodId`, already returns `410 Gone`.

**Risk:** Any future developer who searches for "how to calculate TDS" in this codebase will find `calculateDeductions()` before `computeMonthlyTds()`. If ever accidentally called, it produces a flat-rate percentage deduction with no slab computation, no YTD carry-forward, no declaration deductions, and no 87A rebate — a completely wrong result.

**Fix:** Delete both functions entirely. They are unreachable dead code.

**Correction item:** C5

---

### BUG-06 · MEDIUM — `monthsLeft = 12` for All First-Month Computations Regardless of Join Month

**File:** `server/tds-calculation-service.ts` lines 228–230  
**Code:**
```typescript
const hasNoPriorTds = previousTdsRecords.length === 0 && tdsDeductedYtd === 0;
const monthsLeft = hasNoPriorTds ? 12 : Math.max(1, remainingMonths + 1);
```

**Impact:** An employee who joins in December (9th month of FY) has `remainingMonths = 3` and should divide annual liability by 4 (Dec, Jan, Feb, Mar). Instead, `monthsLeft = 12` — their first-month TDS is one-third of what it should be. The shortfall auto-corrects in the next month's computation (because `hasNoPriorTds` becomes false), resulting in a January spike.

**Fix:** Use actual remaining months for all cases:
```typescript
const monthsLeft = Math.max(1, remainingMonths + 1);
// This is correct for both April joiners (12) and mid-year joiners (e.g., 4 for December)
```

**Correction item:** C6

---

## §3 — Governance Gap (No Code Bug, Policy Enforcement Required)

### GAP-01 — TDS Dashboard "Compute TDS" Button Bypasses Run Engine Preflight

**File:** `client/src/components/tds-management.tsx` (TdsDashboardPanel)  
**Endpoint:** `POST /api/payroll/tds/compute/:periodId`

The TDS Dashboard allows Payroll Admin users to re-trigger TDS computation for any processed period at any time, without going through the payroll run engine's preflight drift check. This is a legitimate operational need (HR may need to re-compute after a declaration is approved). However, it creates a risk window:

- Period is locked, SAP JE is posted, then an admin re-triggers TDS → stored `income_tax` and `net_pay` change on locked records
- After BUG-03 fix, trial rows are excluded, which partially mitigates this

**Policy guidance to add to UI:** After BUG-03 (C3) is fixed, add a warning banner to the TDS Dashboard "Compute TDS" button: *"Re-computing TDS will update income tax and net pay on all official payroll records for this period. Only do this before the period is locked."* The button should be disabled if `period.status = 'locked'`.

**This is a UI enhancement, not a code defect.** No service-layer change needed.

---

## §4 — Verified Correct Patterns (No Change Required)

| File | TDS Usage | Status |
|------|-----------|--------|
| `payroll-trial-routes.ts` | Calls `computeMonthlyTds()`, does NOT call `saveTdsRecord()` | ✓ Correct |
| `payroll-run-engine.ts` | Calls `computeAndSaveTdsForPeriod()` via service | ✓ Correct (after C3) |
| `payroll-routes.ts` `/tds/compute` | Calls `computeAndSaveTdsForPeriod()` via service | ✓ Correct (after C3 + GAP-01 UI guard) |
| `payroll-routes.ts` tax-slabs endpoints | Pure DB CRUD — no arithmetic | ✓ Correct |
| `payroll-routes.ts` tax-declarations endpoints | Pure DB CRUD + approval state machine | ✓ Correct |
| `admin-routes.ts` | Reads `record.tdsAmount` from DB — no arithmetic | ✓ Correct |
| `salary-slip-generator.ts` | Reads `incomeTax` from stored record — no arithmetic | ✓ Correct |
| `payroll-calculation-verifier.ts` | Reads `tds_monthly_records` for verification only | ✓ Correct |
| `salary-calculation-engine.ts` | No TDS arithmetic at all (confirmed) | ✓ Clean |
| `advance-tax-routes.ts` | Company advance tax — different domain, not salary TDS | ✓ Correct |
| `statutory-compliance-routes.ts` | GL mapping and challan tracking — no arithmetic | ✓ Correct |
| `tds-management.tsx` (Tax Slabs tab) | Displays slab config — no arithmetic | ✓ Correct |
| `tds-management.tsx` (Declarations tab) | Declaration CRUD with approval workflow | ✓ Correct |
| `tds-management.tsx` (TDS Dashboard tab) | Reads `tds_monthly_records` — no arithmetic | ✓ Correct (after GAP-01 guard) |

---

## §5 — Intentional Separations (Do Not Change)

### Manual Salary Routes — `tdsAmount = 0`

`manual-salary-routes.ts` processes **non-system users** (contract workers, daily-wage workers). These are not salaried employees under Section 192. Their TDS compliance is tracked separately under Section 194C in `tds_compliance_register`. The `tdsAmount = 0` in `calculateManualSalary()` is correct and intentional — the TDS section, population, and accounting treatment differ entirely from the salaried payroll TDS path.

**Do not route `calculateManualSalary()` through `computeMonthlyTds()`.** The populations, TDS sections, and treatments are distinct.

### `regimeLocked` Field

`employee_tax_declarations.regime_locked` exists in schema but is not enforced by the TDS service. Its intent is to prevent regime changes after a FY's first pay period. This is a UI-level guard (once locked, the regime dropdown should be disabled). No service-layer enforcement is required at this stage.

### `catchUpAdjustment` Always Zero

`catchUpAdjustment = 0` is intentional. The spread-forward mechanism (dividing remaining annual liability by remaining months) handles prior under-deductions automatically. Explicit catch-up is not needed and adding it would create complexity without benefit.

### Surcharge Always Zero

`surchargeAmount = 0` is intentional for now. No THERMOPAC employee currently earns above ₹50L annually. Surcharge calculation should be added when needed, not speculatively.

---

## §6 — Correction Work Items

| ID | Priority | File | Change |
|----|----------|------|--------|
| C1 | CRITICAL | `tds-calculation-service.ts` | Read `regime` from declaration; fall back to `'new'` if no approved declaration. Activate Old Regime code path. |
| C2 | CRITICAL | `tds-calculation-service.ts` | Add `status='approved'` filter when reading `employeeTaxDeclarations`. |
| C3 | CRITICAL | `tds-calculation-service.ts` | Add `record_type='official'` filter in `computeAndSaveTdsForPeriod()`. |
| C4 | HIGH | `tds-calculation-service.ts` | Fix `section87aRebate` computation with proper regime-specific cap. |
| C5 | HIGH | `payroll-routes.ts` | Delete `calculateDeductions()` and `calculateBonuses()` dead code (lines 448–511). |
| C6 | MEDIUM | `tds-calculation-service.ts` | Fix `monthsLeft` for mid-year joiners (`Math.max(1, remainingMonths + 1)` always). |
| GAP-01 | LOW (UI) | `tds-management.tsx` | Add locked-period guard on "Compute TDS" button; show warning before triggering. |

**C1 depends on C2 (approved-only declarations) and C4 (correct 87A cap). C2 and C3 are independent.**

---

## §7 — Implementation Order

```
Step 1: C5  — Delete dead code in payroll-routes.ts (zero risk)
Step 2: C3  — Add record_type='official' filter (protective, no behavioural change)
Step 3: C2  — Add status='approved' filter on declarations (protective)
Step 4: C4  — Fix section87aRebate cap formula (required before C1 goes live)
Step 5: C6  — Fix monthsLeft for mid-year joiners (minor numerical fix)
Step 6: C1  — Activate Old Regime (behavioural change — deploy after declaration review)
Step 7: GAP-01 — Add UI guard on TDS Dashboard Compute button
```

**For C1 specifically:** Before deploying, run this query with HR/Finance and review:
```sql
SELECT u.username, u.first_name, u.last_name,
       d.regime, d.status,
       d.section80c, d.section80d, d.monthly_rent_paid, d.section24b
FROM employee_tax_declarations d
JOIN users u ON u.id = d.user_id
WHERE d.financial_year = '2025-26'
ORDER BY d.regime DESC, u.username;
```

Any employee with `regime='old'` and `status='approved'` is currently being overtaxed under the hardcoded New Regime. After C1 is deployed, those employees' TDS records for prior months of the current FY will need a re-compute via the TDS Dashboard or by re-running the `tds_calculation` step.

---

## §8 — Testing Requirements

### C1 — Old Regime Activation
- Employee: `regime='old'`, `status='approved'`, 80C = ₹1,50,000, HRA = ₹8,000/month, rent = ₹10,000/month → TDS reflects HRA and 80C deduction
- Employee: `regime='new'`, `status='approved'` → identical result to current (no regression)
- Employee: no declaration → defaults to New Regime, standard deduction only (no regression)
- Employee: `regime='old'`, `status='draft'` → treated as New Regime (declaration not approved)

### C2 — Approved-Only Declarations
- Employee has `regime='old'`, `status='rejected'` + `status='draft'` in separate tests → service uses New Regime defaults
- Employee has `regime='old'`, `status='approved'` → Old Regime deductions applied

### C3 — Record Type Filter
- Period has 2 official + 3 trial rows → `computeAndSaveTdsForPeriod()` processes exactly 2 rows
- `tds_monthly_records` count = 2, not 5

### C4 — 87A Rebate Cap
- New Regime, taxable income = ₹6,50,000 → TDS = 0 (full rebate, income ≤ ₹7L)
- New Regime, taxable income = ₹7,50,000 → TDS > 0 (no rebate; income > ₹7L)
- Old Regime, taxable income = ₹4,50,000 → tax = ₹10,000 (5% on ₹2L); rebate capped at ₹12,500 but tax is only ₹10,000 → TDS = 0 (full rebate, within cap)
- Old Regime, taxable income = ₹5,50,000 → tax = ₹15,000 (5% on ₹2.5L); rebate = ₹12,500; TDS on ₹2,500 annual tax → TDS > 0

### C5 — Dead Code Deletion
- TypeScript compilation clean after deletion
- `grep calculateDeductions` and `grep calculateBonuses` return zero results outside the deleted lines

### C6 — MonthsLeft Fix
- April joiner (month 1 of FY): `monthsLeft = 12` → no change
- December joiner (month 9 of FY): `monthsLeft = 4` (not 12)
- March joiner (month 12 of FY): `monthsLeft = 1`

---

## §9 — What Stays Out of Scope

| Topic | Reason |
|-------|--------|
| Surcharge calculation | No employee earns > ₹50L. Add when needed. |
| `catchUpAdjustment` | Spread-forward handles under-deductions implicitly. By design. |
| `tds_monthly_records.record_type` column | Not needed. After C3, `computeAndSaveTdsForPeriod()` only processes official rows. Trial TDS is never persisted. All persisted records are de-facto official. |
| `salary-calculation-engine.ts` | No TDS arithmetic (confirmed by grep). Leave as-is. |
| `regimeLocked` enforcement | UI-level guard only. No service enforcement needed at this stage. |
