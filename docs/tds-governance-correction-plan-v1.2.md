# Payroll TDS Calculation Governance — Correction Plan v1.2
**Date:** 2026-05-07  
**Supersedes:** v1.1 (2026-05-07)  
**Scope:** All server-side payroll TDS calculation, storage, and downstream consumption  
**Mandate:** Trial route and official run route use the exact same TDS service and same payroll core logic. No duplicate TDS arithmetic anywhere.

**What changed in v1.2 vs v1.1:**
- BUG-04: Corrected FY 2025-26 New Regime Section 87A figures — rebate eligibility threshold ₹12,00,000, rebate cap ₹60,000, standard deduction ₹75,000, effective zero-tax gross ₹12,75,000 (rebate-based, not a 0% slab). All ₹7L references removed.
- §8 C4 test cases rewritten to use correct FY 2025-26 regime-specific figures
- §10 Step D corrected — after recomputation, future monthly TDS *reduces* (not increases) for over-deducted employees, because the spread-forward sees a lower remaining annual liability once the corrected (lower) YTD totals are recorded

**What changed in v1.1 vs v1.0:**
- Added BUG-07 (C7) — `challans/generate` includes trial records in TDS challan (CRITICAL)
- Added BUG-08 (C8) — `tds/reconciliation/refresh` includes trial records in SAP reconciliation (HIGH)
- §0 extended to cover TDS Compliance module (`tds-compliance-page.tsx`)
- §1 architecture diagram updated to show compliance module downstream path
- §4 audit expanded with compliance module routes and two new corrected-by-C7/C8 entries
- §6 table updated with C7, C8
- §7 implementation order updated
- §8 test cases added for C7, C8
- §10 added — Data Correction Procedure after C1 fix applied to prior periods

---

## §0 — Existing TDS UI Modules (Context)

### Module A — Income Tax & TDS Management Tab
Embedded in the Payroll Management page (`payroll-management-new.tsx`), composed of three sub-panels in `tds-management.tsx`:

| Tab | What it does |
|-----|-------------|
| **Tax Slabs** | View and seed both New Regime and Old Regime slabs per FY. Correctly shows both regimes side-by-side. "Load Default Slabs" button seeds `tax_slabs` via `POST /api/payroll/tax-slabs/seed-defaults`. |
| **Declarations** | Full CRUD + approval workflow for `employee_tax_declarations`. Correctly shows Old Regime fields (HRA, 80C, 80D, 24B, etc.) conditionally only when regime = 'old'. Status lifecycle: draft → submitted → approved/rejected. |
| **TDS Dashboard** | Period-level view of `tds_monthly_records` (employee, regime, projected taxable, monthly TDS, YTD TDS). Contains a **"Compute TDS"** button that calls `POST /api/payroll/tds/compute/:periodId` directly. |

### Module B — TDS Compliance Module (`tds-compliance-page.tsx`)
A separate statutory compliance page with four tabs:

| Tab | What it does |
|-----|-------------|
| **Challans & Filing** | Full lifecycle for `statutory_challans` (TDS, PF, ESIC, PT). Challan generation via `POST /api/statutory/challans/generate` aggregates `payrollRecords.tdsAmount` for Section 192 (salary TDS). No TDS arithmetic — reads stored amounts. |
| **Compliance Register** | Unified `tds_compliance_register` table view. Two source categories: `payroll_192` (populated from challan generation) and `sap_wht_non_salary` (Section 194C/J/H/I/Q, synced from SAP B1 WHT documents). No TDS arithmetic. |
| **SAP Reconciliation** | Compares stored `payrollRecords.tdsAmount` against SAP Journal Entry amounts via `tds_payroll_sap_reconciliation`. Supports deep JE verification against SAP B1. No TDS arithmetic. |
| **Exceptions** | Displays `tds_payroll_sap_reconciliation` records where `sapVerificationStatus='mismatched'` or SAP posting missing/failed. Read-only. |

**The compliance module is a pure consumer — it performs zero TDS arithmetic.** All TDS figures flow from `tds-calculation-service.ts → payrollRecords.tdsAmount → compliance module`. However, two routes in this module have a missing `record_type='official'` filter (BUG-07, BUG-08 below).

The UI is correct and complete for both modules. All defects described below are **backend service defects** — the UI is already capturing the right data; the backend is not using it correctly.

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

                ↓ Downstream consumption (record_type='official' rows only — after C7/C8)
statutory-compliance-routes.ts
     ├── challans/generate        ← Reads payrollRecords.tdsAmount (official only)
     ├── tds/reconciliation/refresh ← Snapshots payrollRecords.tdsAmount → tds_payroll_sap_reconciliation
     ├── tds/deep-je-verify       ← Reads tds_payroll_sap_reconciliation (no arithmetic)
     ├── tds/sap-wht-sync         ← Reads SAP B1 WHT amounts directly (no payroll arithmetic)
     └── challans/:id/post-sap    ← Posts GL JE to SAP B1 using stored challan amounts
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

**FY 2025-26 Section 87A rules (correct figures):**

| Regime | Rebate eligibility threshold | Rebate cap | Standard deduction | Effective zero-tax gross |
|--------|------------------------------|------------|--------------------|--------------------------|
| New | Taxable income ≤ ₹12,00,000 | ₹60,000 | ₹75,000 | ₹12,75,000 salaried gross |
| Old | Taxable income ≤ ₹5,00,000 | ₹12,500 | ₹50,000 | ₹5,50,000 salaried gross |

**Important:** The New Regime zero-tax outcome up to ₹12,75,000 gross is **rebate-based**, not a 0% slab. The slab tax is computed normally, then the Section 87A rebate (up to ₹60,000) eliminates it for eligible incomes. Employees above ₹12,00,000 taxable income receive no rebate and pay full slab tax.

**Current behaviour (New Regime only):** The `Math.min(x, x)` expression evaluates to `x` — no cap is applied. For New Regime employees with taxable income ≤ ₹12,00,000, the computed slab tax is within ₹60,000 and zeroed correctly by coincidence. For employees above the threshold, no rebate is due anyway, so the expression is also harmless. The bug is dormant in the current hardcoded-New-Regime state.

**Defect when Old Regime is activated (BUG-01 fix):** Section 87A rebate under Old Regime (FY 2025-26) is **capped at ₹12,500** with a lower eligibility threshold of ₹5,00,000 taxable income. The current uncapped expression would grant a full rebate to Old Regime employees with income ≤ ₹5,00,000, wiping out tax that should only be partially offset, resulting in under-deduction.

**Fix:** Apply proper regime-specific caps. The eligibility threshold check (`taxOnProjectedIncome <= slabs[0].section87aRebateLimit`) is already in place; only the cap amount is missing:
```typescript
// Determine rebate cap per regime (FY 2025-26)
const maxRebateCap = regime === 'new'
  ? 60000   // New Regime: rebate up to ₹60,000 for taxable income ≤ ₹12,00,000
  : 12500;  // Old Regime: rebate up to ₹12,500 for taxable income ≤ ₹5,00,000

section87aRebate = Math.min(taxOnProjectedIncome, maxRebateCap);
taxOnProjectedIncome = Math.max(0, taxOnProjectedIncome - section87aRebate);
cessAmount = taxOnProjectedIncome * cessRate;  // cess computed on post-rebate tax
```

**Note:** The eligibility threshold (`section87aRebateLimit`) is already seeded correctly per regime in `tax_slabs` — ₹12,00,000 for New, ₹5,00,000 for Old. The existing threshold check is retained unchanged; this fix only corrects the cap value.

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

### BUG-07 · CRITICAL — `challans/generate` Fetches All payrollRecords Without `record_type` Filter

**File:** `server/statutory-compliance-routes.ts` lines 472–473  
**Code:**
```typescript
const records = await db.select().from(payrollRecords)
  .where(eq(payrollRecords.periodId, payrollPeriodId));
// ↑ NO record_type filter — fetches trial AND official rows
// ↑ NO status filter — fetches even 'draft' / 'failed' rows
```

**Impact:** When HR generates a TDS Section 192 challan for a period that has both trial and official payroll records:

1. Trial record TDS amounts are summed into `totalEmployeeContribution` alongside official amounts
2. The inflated total is posted to SAP B1 as the JE credit amount (Dr: TDS Payable / Cr: Bank)
3. The `tds_compliance_register` gets `payroll_192` entries that include trial employees
4. The resulting SAP JE overstates the actual TDS liability for the period — a **statutory filing error**

This is especially dangerous because the challan may already be paid and filed with the Income Tax department by the time the discrepancy is discovered.

**Fix:** Add both `record_type='official'` and an active-status filter (mirrors the reconciliation logic):
```typescript
const records = await db.select().from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, payrollPeriodId),
    eq(payrollRecords.recordType as any, 'official'),
    inArray(payrollRecords.status as any, ['generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred'])
  ));
```

**Correction item:** C7

---

### BUG-08 · HIGH — `tds/reconciliation/refresh` Fetches All payrollRecords Without `record_type` Filter

**File:** `server/statutory-compliance-routes.ts` lines 1272–1275  
**Code:**
```typescript
.where(and(
  eq(payrollRecords.periodId, periodId),
  inArray(payrollRecords.status, ['generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred']),
))
// ↑ Status filter is present — good. But NO record_type filter.
```

**Impact:** Trial payroll records with an active status (e.g., `status='processed'`) are snapshotted into `tds_payroll_sap_reconciliation`. When the deep JE verification runs, it looks for those employees' TDS amounts in SAP JEs — which will never match because trial payroll is not posted to SAP. This generates false SAP-missing exceptions and corrupts the reconciliation table with trial data.

**Fix:** Add `record_type='official'` filter alongside the existing status filter:
```typescript
.where(and(
  eq(payrollRecords.periodId, periodId),
  eq(payrollRecords.recordType as any, 'official'),
  inArray(payrollRecords.status, ['generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred']),
))
```

**Correction item:** C8

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

| File / Route | TDS Usage | Status |
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
| `manual-salary-routes.ts` | `tdsAmount = 0` intentional — Section 194C population | ✓ Correct (see §5) |
| `statutory-compliance-routes.ts` `challans/generate` | Reads `payrollRecords.tdsAmount`; no arithmetic | ✓ Correct (after C7) |
| `statutory-compliance-routes.ts` `tds/reconciliation/refresh` | Snapshots stored `tdsAmount` to reconciliation table; no arithmetic | ✓ Correct (after C8) |
| `statutory-compliance-routes.ts` `tds/deep-je-verify` | Reads reconciliation table + SAP JE; no arithmetic | ✓ Correct |
| `statutory-compliance-routes.ts` `tds/sap-wht-sync` | Imports WHT amounts from SAP B1 directly; zero payroll arithmetic | ✓ Correct |
| `statutory-compliance-routes.ts` `challans/:id/post-sap` | Posts stored challan `totalEmployeeContribution` to SAP as GL JE | ✓ Correct (after C7) |
| `statutory-compliance-routes.ts` `tds/compliance-register` | Read-only register view | ✓ Correct |
| `statutory-compliance-routes.ts` GL mapping / challan CRUD | Administrative setup; no TDS arithmetic | ✓ Correct |
| `tds-compliance-page.tsx` (all 4 tabs) | Pure display + action triggers; zero TDS arithmetic in frontend | ✓ Correct |
| `tds-management.tsx` (Tax Slabs tab) | Displays slab config — no arithmetic | ✓ Correct |
| `tds-management.tsx` (Declarations tab) | Declaration CRUD with approval workflow | ✓ Correct |
| `tds-management.tsx` (TDS Dashboard tab) | Reads `tds_monthly_records` — no arithmetic | ✓ Correct (after GAP-01 guard) |

---

## §5 — Intentional Separations (Do Not Change)

### Manual Salary Routes — `tdsAmount = 0`

`manual-salary-routes.ts` processes **non-system users** (contract workers, daily-wage workers). These are not salaried employees under Section 192. Their TDS compliance is tracked separately under Section 194C in `tds_compliance_register`. The `tdsAmount = 0` in `calculateManualSalary()` is correct and intentional — the TDS section, population, and accounting treatment differ entirely from the salaried payroll TDS path.

**Do not route `calculateManualSalary()` through `computeMonthlyTds()`.** The populations, TDS sections, and treatments are distinct.

### SAP WHT Non-Salary Sync — Independent TDS Source

`POST /api/statutory/tds/sap-wht-sync` reads Section 194C/J/H/I/Q WHT documents directly from SAP B1 and writes them to `tds_compliance_register` with `sourceCategory='sap_wht_non_salary'`. These amounts come from SAP's own WHT computation on vendor documents — they have nothing to do with `computeMonthlyTds()` and must remain independent.

### `regimeLocked` Field

`employee_tax_declarations.regime_locked` exists in schema but is not enforced by the TDS service. Its intent is to prevent regime changes after a FY's first pay period. This is a UI-level guard (once locked, the regime dropdown should be disabled). No service-layer enforcement is required at this stage.

### `catchUpAdjustment` Always Zero

`catchUpAdjustment = 0` is intentional. The spread-forward mechanism (dividing remaining annual liability by remaining months) handles prior under-deductions automatically. Explicit catch-up is not needed and adding it would create complexity without benefit.

### Surcharge Always Zero

`surchargeAmount = 0` is intentional for now. No THERMOPAC employee currently earns above ₹50L annually. Surcharge calculation should be added when needed, not speculatively.

### `tdsAmount || incomeTax` Fallback in Compliance Routes

Multiple compliance routes use `rec.tdsAmount?.toString() || rec.incomeTax?.toString() || '0'`. The `incomeTax` column is the legacy field name for the same value as `tdsAmount` (both stored on `payrollRecords`). This dual-field read is defensive and correct — do not simplify to one field without confirming schema migration is complete.

---

## §6 — Correction Work Items

| ID | Priority | File | Change |
|----|----------|------|--------|
| C1 | CRITICAL | `tds-calculation-service.ts` | Read `regime` from declaration; fall back to `'new'` if no approved declaration. Activate Old Regime code path. |
| C2 | CRITICAL | `tds-calculation-service.ts` | Add `status='approved'` filter when reading `employeeTaxDeclarations`. |
| C3 | CRITICAL | `tds-calculation-service.ts` | Add `record_type='official'` filter in `computeAndSaveTdsForPeriod()`. |
| C7 | CRITICAL | `statutory-compliance-routes.ts` | Add `record_type='official'` + active-status filter to `challans/generate`. |
| C4 | HIGH | `tds-calculation-service.ts` | Fix `section87aRebate` computation with proper regime-specific cap. |
| C5 | HIGH | `payroll-routes.ts` | Delete `calculateDeductions()` and `calculateBonuses()` dead code (lines 448–511). |
| C8 | HIGH | `statutory-compliance-routes.ts` | Add `record_type='official'` filter to `tds/reconciliation/refresh`. |
| C6 | MEDIUM | `tds-calculation-service.ts` | Fix `monthsLeft` for mid-year joiners (`Math.max(1, remainingMonths + 1)` always). |
| GAP-01 | LOW (UI) | `tds-management.tsx` | Add locked-period guard on "Compute TDS" button; show warning before triggering. |

**Dependencies:**
- C1 depends on C2 (approved-only declarations must be in place first) and C4 (correct 87A cap must be in place first)
- C7 and C8 are independent of each other and of C1–C6
- C2 and C3 are independent

---

## §7 — Implementation Order

```
Step 1: C5  — Delete dead code in payroll-routes.ts (zero risk)
Step 2: C3  — Add record_type='official' filter in computeAndSaveTdsForPeriod() (protective)
Step 3: C7  — Add record_type='official' filter in challans/generate (prevents SAP overstatement)
Step 4: C8  — Add record_type='official' filter in reconciliation/refresh (prevents false exceptions)
Step 5: C2  — Add status='approved' filter on declarations (protective)
Step 6: C4  — Fix section87aRebate cap formula (required before C1 goes live)
Step 7: C6  — Fix monthsLeft for mid-year joiners (minor numerical fix)
Step 8: C1  — Activate Old Regime (behavioural change — deploy after declaration review)
Step 9: GAP-01 — Add UI guard on TDS Dashboard Compute button
Step 10: Data correction — run §10 procedure for all prior-period compliance register entries
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

### C3 — Record Type Filter in computeAndSaveTdsForPeriod
- Period has 2 official + 3 trial rows → `computeAndSaveTdsForPeriod()` processes exactly 2 rows
- `tds_monthly_records` count = 2, not 5

### C4 — 87A Rebate Cap (FY 2025-26)

**New Regime:**
- Taxable income = ₹10,00,000 → slab tax = ₹60,000 (5% on ₹3L + 10% on ₹3L + 15% on ₹1L); rebate = min(60,000, 60,000) = ₹60,000; annual tax after rebate = ₹0 → TDS = 0
- Taxable income = ₹12,00,000 → slab tax = ₹80,000 (compute per slabs); wait — at exactly ₹12,00,000 the marginal-relief rule applies so effective tax = ₹60,000; rebate = ₹60,000; TDS = 0 (eligible threshold boundary)
- Taxable income = ₹12,10,000 → income exceeds ₹12,00,000 threshold; no Section 87A rebate; TDS > 0
- Taxable income = ₹15,00,000 → no rebate; full slab tax applies; TDS > 0
- Standard deduction of ₹75,000 confirmed: gross salary ₹12,75,000 − ₹75,000 = ₹12,00,000 taxable → TDS = 0 (rebate-based, not 0% slab)

**Old Regime:**
- Taxable income = ₹4,50,000 → slab tax = ₹10,000 (5% on ₹2,00,000 above ₹2.5L basic exemption); rebate = min(10,000, 12,500) = ₹10,000; annual tax = ₹0 → TDS = 0
- Taxable income = ₹5,00,000 → slab tax = ₹12,500 (5% on ₹2.5L); rebate = min(12,500, 12,500) = ₹12,500; annual tax = ₹0 → TDS = 0 (at eligibility boundary)
- Taxable income = ₹5,10,000 → income exceeds ₹5,00,000 threshold; no Section 87A rebate; tax = ₹13,000; cess = ₹520; annual liability = ₹13,520 → TDS > 0
- Taxable income = ₹6,00,000 → slab tax = ₹32,500 (5% on ₹2.5L + 20% on ₹1L); no rebate (income > ₹5L); TDS > 0

### C5 — Dead Code Deletion
- TypeScript compilation clean after deletion
- `grep calculateDeductions` and `grep calculateBonuses` return zero results outside the deleted lines

### C6 — MonthsLeft Fix
- April joiner (month 1 of FY): `monthsLeft = 12` → no change
- December joiner (month 9 of FY): `monthsLeft = 4` (not 12)
- March joiner (month 12 of FY): `monthsLeft = 1`

### C7 — Challan Generation Record Type Filter
- Period has 2 official + 2 trial rows, all with `tdsAmount > 0`
- `POST /api/statutory/challans/generate` with `moduleType='TDS'` → `totalEmployeeContribution` equals sum of 2 official rows only
- `tds_compliance_register` gets exactly 2 `payroll_192` entries, not 4
- Verify `statutoryChallanDetails` has exactly 2 rows, not 4

### C8 — Reconciliation Refresh Record Type Filter
- Period has 3 official + 2 trial rows (trial rows have `status='processed'`)
- `POST /api/statutory/tds/reconciliation/refresh` → `tds_payroll_sap_reconciliation` has exactly 3 rows, not 5
- `response.refreshed = 3`

---

## §9 — What Stays Out of Scope

| Topic | Reason |
|-------|--------|
| Surcharge calculation | No employee earns > ₹50L. Add when needed. |
| `catchUpAdjustment` | Spread-forward handles under-deductions implicitly. By design. |
| `tds_monthly_records.record_type` column | Not needed. After C3, `computeAndSaveTdsForPeriod()` only processes official rows. Trial TDS is never persisted. All persisted records are de-facto official. |
| `salary-calculation-engine.ts` | No TDS arithmetic (confirmed by grep). Leave as-is. |
| `regimeLocked` enforcement | UI-level guard only. No service enforcement needed at this stage. |
| SAP WHT sync arithmetic | `tds/sap-wht-sync` reads WHT amounts from SAP B1 — these are SAP-computed, not payroll-TDS-service-computed. Independent by design. |

---

## §10 — Data Correction Procedure (Post C1 Deployment)

When C1 (Old Regime activation) is deployed, any employee with `regime='old'` and `status='approved'` who was processed under the New Regime in prior months of the current FY will have stored `tdsAmount` values that are too high (over-deducted). The following procedure must be followed:

### Step A — Identify Affected Employees
```sql
SELECT u.username, u.first_name, u.last_name, d.regime, d.status,
       d.section80c, d.section80d, d.monthly_rent_paid, d.section24b
FROM employee_tax_declarations d
JOIN users u ON u.id = d.user_id
WHERE d.financial_year = '2025-26'
  AND d.regime = 'old'
  AND d.status = 'approved';
```

### Step B — Identify Affected Periods
For each affected employee, identify all periods in FY 2025-26 that have already been processed (official payroll records with `status` in `['processed', 'approved', 'paid', 'locked']`).

### Step C — Re-compute TDS
Use the TDS Dashboard's "Compute TDS" button for each affected period (one period at a time, oldest first). After C3 is deployed, only official records will be recomputed. After GAP-01 is deployed, the button will warn if the period is locked — HR must confirm.

**Locked periods:** If a period is locked and SAP JE has already been posted for that period, re-computing TDS will change `payrollRecords.tdsAmount` and `net_pay` but will not automatically:
- Update the already-generated `statutory_challans` or `statutory_challan_details`
- Update the `tds_compliance_register` entries for those periods
- Update the SAP JE that was already posted

In this case, the correct procedure is:
1. Re-compute TDS for the period (updates `payrollRecords`)
2. Delete the existing TDS challan for that period (only if `status != 'paid'` and `sapPostingStatus != 'posted'`)
3. Re-generate the challan (picks up the corrected `tdsAmount`)
4. If the SAP JE was already posted: create a reversal JE for the delta amount (difference between old and new TDS), post it, and update the reconciliation record manually
5. Run `tds/reconciliation/refresh` for the period to resnapshot the corrected amounts

### Step D — Effect on Future Monthly TDS
After re-computing prior periods, `tds_monthly_records` for those months will record the corrected (lower) monthly TDS amounts, and `payrollRecords.tdsAmount` will be reduced accordingly.

When the next month's TDS is computed, `tdsDeductedYtd` is read from the updated records and will now be **lower** than it was under the incorrectly forced New Regime. The spread-forward formula divides the **remaining annual liability** by remaining months:

```
monthlyTds = (annualTaxLiability − tdsDeductedYtd) / monthsLeft
```

Because `tdsDeductedYtd` is now correctly lower (reflecting the Old Regime corrected amounts) and `annualTaxLiability` itself is also lower (Old Regime deductions applied), the net remaining liability is lower — so **future monthly TDS reduces**. There is no catch-up spike.

The employee does not receive a cash refund automatically. The over-deduction from prior months is corrected prospectively: less is deducted in remaining months until the annual liability is met. If the employee has already left or the FY ends before correction, a Form 16 adjustment or refund via ITR is the correct resolution path — outside the scope of this system.

### Step E — Verify
Run the parity verification report (`POST /api/admin/payroll/verify/trial-vs-official`) for all affected periods to confirm official records are consistent. Run `tds/reconciliation/refresh` and `tds/deep-je-verify` to confirm SAP alignment.
