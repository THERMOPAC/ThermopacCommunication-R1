# Payroll TDS Calculation Governance — Correction Plan v1.3
**Date:** 2026-05-07  
**Supersedes:** v1.2 (2026-05-07)  
**Scope:** All server-side payroll TDS calculation, storage, and downstream consumption  
**Mandate:** New Regime only. Centralized per-FY tax config. Single arithmetic source for all TDS. Trial and official routes share the same service. No Old Regime code anywhere.

**What changed in v1.3 vs v1.2:**
- Scope narrowed to **New Regime only** — Old Regime logic, HRA/80C/80D/24B handling, regime branching, and all Old Regime UI/documentation references are explicitly removed
- BUG-01 (activate Old Regime) **dropped** — Old Regime is out of scope; `const regime = 'new'` is removed along with the entire regime concept
- Added N1–N4: new architecture items for centralized FY tax config (`server/tax-config/`)
- `computeMonthlyTds()` rewritten to use `getTaxConfig(financialYear)` — no DB slab query inside the compute function
- BUG-02 kept but scope narrowed: `status='approved'` filter retained for `previousEmployerIncome`, `previousEmployerTds`, `otherIncome` only
- BUG-04 retained: 87A cap fix now encoded directly in `FyConfig.section87aRebateCap` — no regime branching needed
- §0, §1, §4, §5, §8, §9, §10 all updated to remove Old Regime references and reflect new config architecture

---

## §0 — Existing TDS UI Modules (Context)

### Module A — Income Tax & TDS Management Tab
Embedded in the Payroll Management page (`payroll-management-new.tsx`), composed of three sub-panels in `tds-management.tsx`:

| Tab | What it does | Action required |
|-----|-------------|-----------------|
| **Tax Slabs** | Currently shows both New Regime and Old Regime slabs side-by-side. "Load Default Slabs" seeds `tax_slabs` via DB. | Remove Old Regime tab/columns. Slabs are now read from `server/tax-config/` — DB seeding is no longer the authoritative source for arithmetic. |
| **Declarations** | CRUD + approval workflow for `employee_tax_declarations`. Currently shows Old Regime fields (HRA, 80C, 80D, 24B, regime selector) conditionally. | Remove Old Regime fields and regime selector. Keep: previous employer income, previous employer TDS, other income, approval workflow. |
| **TDS Dashboard** | Period-level view of `tds_monthly_records`. "Compute TDS" calls `POST /api/payroll/tds/compute/:periodId`. | Remove `regime` column from display. Add GAP-01 locked-period guard. |

### Module B — TDS Compliance Module (`tds-compliance-page.tsx`)
A separate statutory compliance page with four tabs:

| Tab | What it does |
|-----|-------------|
| **Challans & Filing** | Challan lifecycle for TDS, PF, ESIC, PT. Challan generation aggregates `payrollRecords.tdsAmount`. No TDS arithmetic. |
| **Compliance Register** | Unified view of `tds_compliance_register`. Sources: `payroll_192` (salary TDS) and `sap_wht_non_salary` (Section 194C/J/H/I/Q from SAP). No TDS arithmetic. |
| **SAP Reconciliation** | Compares stored `payrollRecords.tdsAmount` against SAP JE amounts. Deep JE verification. No TDS arithmetic. |
| **Exceptions** | Mismatched/missing SAP postings. Read-only. |

**The compliance module is a pure consumer — zero TDS arithmetic.** No changes required to this module for Old Regime removal. C7 and C8 (`record_type='official'` filters) are still required.

---

## §1 — Target Architecture

```
server/tax-config/
  ├── fy-2025-26.ts    ← FY 2025-26 New Regime constants (slabs, std deduction, cess, 87A)
  ├── fy-2026-27.ts    ← FY 2026-27 placeholder (same structure, update before April 2027)
  └── index.ts         ← getTaxConfig(financialYear) — throws if FY not registered

employeeTaxDeclarations (status='approved')
         │ reads: previousEmployerIncome, previousEmployerTds, otherIncome only
         ▼
computeMonthlyTds(userId, periodId, month, year, grossSalary)
         │
         ├── getTaxConfig(financialYear)     ← in-memory config; no DB slab query
         ├── tds_monthly_records             ← YTD tdsDeductedYtd, grossSalaryYtd
         └── employee_tax_declarations       ← prev employer income/TDS, otherIncome (approved only)
         │
         ▼ TaxComputationResult (no regime, no HRA, no 80C/80D/24B fields)
         │
         ├── payroll-trial-routes.ts        → compute only, NO saveTdsRecord
         └── computeAndSaveTdsForPeriod()   → saveTdsRecord + update payrollRecords
                  ↑
                  ├── payroll-run-engine.ts  (official pipeline, step 'tds_calculation')
                  └── payroll-routes.ts     POST /tds/compute/:periodId (manual re-compute)

admin-routes.ts               ← reads record.tdsAmount — no arithmetic
salary-slip-generator.ts      ← reads stored incomeTax — no arithmetic
payroll-calculation-verifier.ts ← reads tds_monthly_records — no arithmetic
manual-salary-routes.ts       ← tdsAmount=0 intentionally (Section 194C)

             ↓ Downstream (official records only — after C7/C8)
statutory-compliance-routes.ts
     ├── challans/generate          (record_type='official' + status filter — after C7)
     ├── tds/reconciliation/refresh (record_type='official' — after C8)
     ├── tds/deep-je-verify         (reads reconciliation table, no arithmetic)
     ├── tds/sap-wht-sync           (SAP WHT — independent of payroll TDS arithmetic)
     └── challans/:id/post-sap      (posts stored challan amounts to SAP B1)
```

**One config per FY. One compute function. Two callers (trial, official). All others read.**

---

## §2 — New Architecture: `server/tax-config/`

### N1 · HIGH — Create `server/tax-config/fy-2025-26.ts`

Pure TypeScript constants. No DB dependency. No imports.

```typescript
// server/tax-config/fy-2025-26.ts

export interface TaxSlab {
  min: number;
  max: number;   // Infinity for the top bracket
  rate: number;  // decimal — e.g. 0.05 for 5%
}

export interface FyTaxConfig {
  financialYear: string;
  standardDeduction: number;
  cessRate: number;               // decimal — 0.04 for 4%
  surchargeRate: number;          // 0 until any employee exceeds ₹50L
  section87aRebateLimit: number;  // taxable income threshold (inclusive)
  section87aRebateCap: number;    // maximum rebate amount in ₹
  slabs: TaxSlab[];
}

export const FY_2025_26: FyTaxConfig = {
  financialYear: '2025-26',
  standardDeduction: 75_000,
  cessRate: 0.04,
  surchargeRate: 0,
  section87aRebateLimit: 12_00_000,   // ₹12,00,000
  section87aRebateCap:    60_000,      // ₹60,000
  slabs: [
    { min:        0, max:   4_00_000, rate: 0.00 },
    { min:  4_00_001, max:  8_00_000, rate: 0.05 },
    { min:  8_00_001, max: 12_00_000, rate: 0.10 },
    { min: 12_00_001, max: 16_00_000, rate: 0.15 },
    { min: 16_00_001, max: 20_00_000, rate: 0.20 },
    { min: 20_00_001, max: 24_00_000, rate: 0.25 },
    { min: 24_00_001, max: Infinity,  rate: 0.30 },
  ],
};
```

**Verification:** Gross salary ₹12,75,000 − standard deduction ₹75,000 = ₹12,00,000 taxable.  
Slab tax on ₹12,00,000: 5%×₹4L + 10%×₹4L + 15%×... wait:
- 0% on ₹0–₹4L = ₹0  
- 5% on ₹4L–₹8L = ₹20,000  
- 10% on ₹8L–₹12L = ₹40,000  
- Total slab tax = ₹60,000  
Section 87A: taxable ₹12,00,000 ≤ limit ₹12,00,000 → rebate = min(₹60,000, ₹60,000 cap) = ₹60,000  
Tax after rebate = ₹0 + 4% cess on ₹0 = ₹0. Monthly TDS = ₹0. ✓

---

### N2 · HIGH — Create `server/tax-config/fy-2026-27.ts`

Identical structure to N1. Values are the same as FY 2025-26 until the Finance Ministry announces otherwise. **Finance team must review and update this file before the first payroll run of April 2027.**

```typescript
// server/tax-config/fy-2026-27.ts
import { FyTaxConfig } from './fy-2025-26';

export const FY_2026_27: FyTaxConfig = {
  financialYear: '2026-27',
  standardDeduction: 75_000,
  cessRate: 0.04,
  surchargeRate: 0,
  section87aRebateLimit: 12_00_000,
  section87aRebateCap:    60_000,
  slabs: [
    { min:        0, max:   4_00_000, rate: 0.00 },
    { min:  4_00_001, max:  8_00_000, rate: 0.05 },
    { min:  8_00_001, max: 12_00_000, rate: 0.10 },
    { min: 12_00_001, max: 16_00_000, rate: 0.15 },
    { min: 16_00_001, max: 20_00_000, rate: 0.20 },
    { min: 20_00_001, max: 24_00_000, rate: 0.25 },
    { min: 24_00_001, max: Infinity,  rate: 0.30 },
  ],
};
```

**Annual review gate:** At the start of each FY, a new `fy-YYYY-YY.ts` file must be created, reviewed by Finance, and registered in `index.ts` before the April payroll run. No new FY may run without a registered config.

---

### N3 · HIGH — Create `server/tax-config/index.ts`

```typescript
// server/tax-config/index.ts
import { FY_2025_26, type FyTaxConfig } from './fy-2025-26';
import { FY_2026_27 } from './fy-2026-27';

const FY_CONFIGS: Record<string, FyTaxConfig> = {
  '2025-26': FY_2025_26,
  '2026-27': FY_2026_27,
};

/**
 * Returns the tax configuration for the given financial year.
 * Throws if the FY has no registered config — this is intentional:
 * a missing config is a deployment error, not a runtime fallback.
 */
export function getTaxConfig(financialYear: string): FyTaxConfig {
  const config = FY_CONFIGS[financialYear];
  if (!config) {
    throw new Error(
      `No tax configuration found for FY ${financialYear}. ` +
      `Add a new file to server/tax-config/ and register it in index.ts.`
    );
  }
  return config;
}

export type { FyTaxConfig };
export { type TaxSlab } from './fy-2025-26';
```

---

### N4 · HIGH — Rewrite `computeMonthlyTds()` to Use Config

**File:** `server/tds-calculation-service.ts`

The rewrite achieves five things simultaneously:
1. Replaces DB slab query with `getTaxConfig(financialYear)` (N1–N3)
2. Removes `getDefaultSlabs()` call from the hot path (no longer needed inside compute)
3. Removes all Old Regime branching and HRA/80C/80D/24B code
4. Applies C2 (approved-only declaration filter), C4 (correct 87A cap), C6 (monthsLeft fix)
5. Removes `regime` from `TaxComputationResult`; removes `hraExemption`, `section80cDeduction`, `section80dDeduction`, `otherChapter6aDeductions`, `section24bDeduction`

**Revised `TaxComputationResult` interface:**
```typescript
interface TaxComputationResult {
  grossSalaryMonthly: number;
  grossSalaryYtd: number;
  grossSalaryProjected: number;
  standardDeduction: number;
  totalDeductions: number;
  taxableIncomeProjected: number;
  taxOnProjectedIncome: number;
  cessAmount: number;
  surchargeAmount: number;
  section87aRebate: number;
  totalTaxLiabilityAnnual: number;
  tdsDeductedYtd: number;
  previousEmployerTds: number;
  tdsRequiredMonthly: number;
  catchUpAdjustment: number;
  tdsActualMonthly: number;
  financialYear: string;       // replaces regime — useful for audit/snapshot
}
```

**Revised `calculateTaxOnIncome()` — works with config slabs (numbers, not DB strings):**
```typescript
function calculateTaxOnIncome(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0;
  for (const slab of slabs) {
    if (taxableIncome <= slab.min) break;
    const taxableInSlab = Math.min(taxableIncome, slab.max) - slab.min;
    if (taxableInSlab > 0) tax += taxableInSlab * slab.rate;
  }
  return tax;
}
```

**Revised `computeMonthlyTds()` — annotated with which correction each block satisfies:**
```typescript
export async function computeMonthlyTds(
  userId: number,
  periodId: number,
  currentMonth: number,
  currentYear: number,
  grossSalaryThisMonth: number
): Promise<TaxComputationResult> {
  const financialYear = currentMonth >= 4
    ? `${currentYear}-${(currentYear + 1).toString().slice(2)}`
    : `${currentYear - 1}-${currentYear.toString().slice(2)}`;

  const monthsElapsed = currentMonth >= 4 ? currentMonth - 3 : currentMonth + 9;
  const remainingMonths = 12 - monthsElapsed;

  // N1-N3: in-memory config — no DB query for slabs
  const config = getTaxConfig(financialYear);

  // C2: approved declarations only; reads prev employer and other income fields only
  const [declaration] = await db.select().from(employeeTaxDeclarations)
    .where(and(
      eq(employeeTaxDeclarations.userId, userId),
      eq(employeeTaxDeclarations.financialYear, financialYear),
      eq(employeeTaxDeclarations.status, 'approved')
    ));

  // YTD from tds_monthly_records (prior periods in same FY)
  const allTdsRecords = await db.select().from(tdsMonthlyRecords)
    .where(and(
      eq(tdsMonthlyRecords.userId, userId),
      eq(tdsMonthlyRecords.financialYear, financialYear)
    ));
  const previousTdsRecords = allTdsRecords.filter(r => r.periodId !== periodId);
  const tdsDeductedYtd = previousTdsRecords.reduce(
    (sum, r) => sum + parseFloat(r.tdsActualMonthly || '0'), 0
  );
  const grossSalaryYtd = previousTdsRecords.reduce(
    (sum, r) => sum + parseFloat(r.grossSalaryMonthly || '0'), 0
  ) + grossSalaryThisMonth;

  // Projected annual gross
  const monthsWithData = previousTdsRecords.length + 1;
  const projectedFromYtd = grossSalaryYtd + (grossSalaryThisMonth * remainingMonths);
  const annualizedFromCurrent = grossSalaryThisMonth * 12;
  const grossSalaryProjected = monthsWithData < monthsElapsed
    ? Math.max(annualizedFromCurrent, projectedFromYtd)
    : projectedFromYtd;

  // Previous employer income and other income (from approved declaration only)
  const previousEmployerIncome = declaration
    ? parseFloat(declaration.previousEmployerIncome || '0') : 0;
  const previousEmployerTds = declaration
    ? parseFloat(declaration.previousEmployerTds || '0') : 0;
  const otherIncome = declaration
    ? parseFloat(declaration.otherIncome || '0') : 0;
  const totalGrossProjected = grossSalaryProjected + previousEmployerIncome + otherIncome;

  // New Regime: only standard deduction applies
  const standardDeduction = config.standardDeduction;
  const totalDeductions = standardDeduction;
  const taxableIncomeProjected = Math.max(0, totalGrossProjected - totalDeductions);

  // Slab tax on projected taxable income
  let taxOnProjectedIncome = calculateTaxOnIncome(taxableIncomeProjected, config.slabs);

  // C4: correct 87A rebate — eligibility threshold + capped rebate (no regime branching)
  let section87aRebate = 0;
  if (taxableIncomeProjected <= config.section87aRebateLimit) {
    section87aRebate = Math.min(taxOnProjectedIncome, config.section87aRebateCap);
    taxOnProjectedIncome = Math.max(0, taxOnProjectedIncome - section87aRebate);
  }

  const cessAmount = taxOnProjectedIncome * config.cessRate;
  const surchargeAmount = 0;   // No THERMOPAC employee currently exceeds ₹50L
  const totalTaxLiabilityAnnual = Math.max(0, taxOnProjectedIncome + cessAmount + surchargeAmount);

  // Remaining TDS to collect
  const totalTdsRequired = totalTaxLiabilityAnnual - previousEmployerTds;
  const tdsRemaining = Math.max(0, totalTdsRequired - tdsDeductedYtd);

  // C6: monthsLeft always uses remaining months — no special first-month case
  const monthsLeft = Math.max(1, remainingMonths + 1);
  const tdsRequiredMonthly = Math.round((tdsRemaining / monthsLeft) * 100) / 100;

  const catchUpAdjustment = 0;
  const tdsActualMonthly = Math.max(0, tdsRequiredMonthly + catchUpAdjustment);

  return {
    grossSalaryMonthly: grossSalaryThisMonth,
    grossSalaryYtd,
    grossSalaryProjected,
    standardDeduction,
    totalDeductions,
    taxableIncomeProjected,
    taxOnProjectedIncome,
    cessAmount,
    surchargeAmount,
    section87aRebate,
    totalTaxLiabilityAnnual,
    tdsDeductedYtd,
    previousEmployerTds,
    tdsRequiredMonthly,
    catchUpAdjustment,
    tdsActualMonthly,
    financialYear,
  };
}
```

---

## §3 — Remaining Bug Corrections

### BUG-02 · CRITICAL — No `status='approved'` Filter on Declarations  *(Scope narrowed in v1.3)*

**File:** `server/tds-calculation-service.ts` lines 120–124  
**Retained because:** `previousEmployerIncome`, `previousEmployerTds`, and `otherIncome` are read from `employee_tax_declarations` — these are regime-independent fields that survive Old Regime removal. A draft or rejected declaration with incorrect `previousEmployerIncome` would still distort TDS.

**Fix:** Already shown in N4 above — `eq(employeeTaxDeclarations.status, 'approved')` added.  
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

**Fix:**
```typescript
const records = await db.select().from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.recordType as any, 'official')
  ));
```
**Correction item:** C3

---

### BUG-04 · HIGH — `section87aRebate` Computed as `Math.min(x, x)` — No Cap Applied

**File:** `server/tds-calculation-service.ts` line 219  
**Code:**
```typescript
section87aRebate = Math.min(taxOnProjectedIncome + cessAmount,
                            taxOnProjectedIncome + cessAmount);
// Math.min(x, x) = x — no minimum applied; both arguments identical
```

**FY 2025-26 New Regime Section 87A (correct):**
- Rebate eligibility: taxable income ≤ ₹12,00,000
- Rebate cap: ₹60,000
- Standard deduction: ₹75,000 (in config)
- Effective zero-tax salaried gross: ₹12,75,000 (rebate-based, **not** a 0% slab)

**Fix:** Encoded in `FyTaxConfig.section87aRebateCap` — applied in N4:
```typescript
section87aRebate = Math.min(taxOnProjectedIncome, config.section87aRebateCap);
```

No regime branching required. A single cap value per FY handles it.  
**Correction item:** C4

---

### BUG-05 · HIGH — `calculateDeductions()` Dead Code with Flat-Rate TDS Formula

**File:** `server/payroll-routes.ts` lines 448–511  
Both `calculateBonuses()` and `calculateDeductions()` are defined but never called. Their only historical caller returns `410 Gone`. `calculateDeductions()` uses a flat 10% income tax rate — a completely wrong formula that would mislead any future developer.

**Fix:** Delete both functions.  
**Correction item:** C5

---

### BUG-06 · MEDIUM — `monthsLeft = 12` for All First-Month Joiners

**File:** `server/tds-calculation-service.ts` line 229  
```typescript
const monthsLeft = hasNoPriorTds ? 12 : Math.max(1, remainingMonths + 1);
```
A December joiner gets `monthsLeft = 12` instead of 4, causing under-deduction in month 1 and a spike in month 2.

**Fix:** Shown in N4 above — `const monthsLeft = Math.max(1, remainingMonths + 1);`  
**Correction item:** C6

---

### BUG-07 · CRITICAL — `challans/generate` No `record_type` Filter

**File:** `server/statutory-compliance-routes.ts` line 472  
No `record_type='official'` filter and no status guard. Trial-run TDS amounts are included in the SAP-posted TDS challan — a statutory filing error.

**Fix:**
```typescript
const records = await db.select().from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, payrollPeriodId),
    eq(payrollRecords.recordType as any, 'official'),
    inArray(payrollRecords.status as any, [
      'generated', 'processed', 'approved', 'paid', 'locked', 'verified', 'transferred'
    ])
  ));
```
**Correction item:** C7

---

### BUG-08 · HIGH — `tds/reconciliation/refresh` No `record_type` Filter

**File:** `server/statutory-compliance-routes.ts` line 1272  
Status filter present but no `record_type='official'` filter. Trial records appear as permanent SAP-missing exceptions.

**Fix:** Add `eq(payrollRecords.recordType as any, 'official')` to the existing `where` clause.  
**Correction item:** C8

---

## §4 — Old Regime Removal Work Items

### R1 · HIGH — Remove `calculateHraExemption()` Function

**File:** `server/tds-calculation-service.ts` lines 67–83  
Function is only called inside the `if (regime === 'old' && declaration)` block (lines 176–204), which is also deleted. Remove the function entirely.

---

### R2 · HIGH — Remove Old Regime Block from `computeMonthlyTds()`

**File:** `server/tds-calculation-service.ts` lines 176–204  
The entire `if (regime === 'old' && declaration) { ... }` block. Replaced by N4 rewrite which has no regime branching.

---

### R3 · HIGH — Remove Old Regime Seeding from `getDefaultSlabs()`

**File:** `server/tds-calculation-service.ts` lines 55–64  
```typescript
const oldRegimeSlabs = [ ... ];   // lines 55–60 — remove
for (const slab of [...newRegimeSlabs, ...oldRegimeSlabs]) {  // change to newRegimeSlabs only
```

`getDefaultSlabs()` may be kept for backwards-compatibility (it seeds the `tax_slabs` table used by the Tax Slabs UI display tab), but the Old Regime rows must be removed. After N1–N4 are deployed, `getDefaultSlabs()` is no longer called inside `computeMonthlyTds()` — it is only called from the seed endpoint.

---

### R4 · MEDIUM — Remove Old Regime Fields from `saveTdsRecord()`

**File:** `server/tds-calculation-service.ts` lines 288–292  
Remove these mappings from the `record` object:
```typescript
hraExemption: computation.hraExemption.toFixed(2),        // remove
section80cDeduction: computation.section80cDeduction.toFixed(2),  // remove
section80dDeduction: computation.section80dDeduction.toFixed(2),  // remove
otherChapter6aDeductions: computation.otherChapter6aDeductions.toFixed(2),  // remove
section24bDeduction: computation.section24bDeduction.toFixed(2),   // remove
regime: computation.regime,                                 // remove
```

Replace `regime` with `financialYear` for audit traceability.

**Schema note:** The `tds_monthly_records` table likely has `hra_exemption`, `section80c_deduction`, etc. as nullable columns. These columns can be left in the DB schema as nullable for historical record preservation — they simply will not be written going forward. A migration to drop them is optional and can be done in a later cleanup sprint.

---

### R5 · MEDIUM — Remove Old Regime UI from Declarations Tab

**File:** `client/src/components/tds-management.tsx` — Declarations panel  
Remove:
- `regime` selector dropdown (New / Old)
- HRA fields: `monthlyRentPaid`, `isMetroCity`
- Section 80C fields: `section80c`, `section80ccd1b`
- Section 80D fields: `section80d`, `section80dParents`
- Section 24B field: `section24b`
- Section 80E, 80G, 80TTA fields
- `otherDeductions` field
- Any conditional rendering that shows/hides fields based on `regime === 'old'`

**Keep:**
- `previousEmployerIncome` field
- `previousEmployerTds` field
- `otherIncome` field
- Approval workflow (draft → submitted → approved/rejected)
- Status badges and approve/reject buttons

---

### R6 · LOW — Remove Old Regime from Tax Slabs UI

**File:** `client/src/components/tds-management.tsx` — Tax Slabs panel  
Currently displays both New Regime and Old Regime slabs side-by-side. Remove the Old Regime column/tab. Display only New Regime slabs. The "Load Default Slabs" button can be kept but should only seed New Regime rows (see R3).

---

## §5 — Governance Gap

### GAP-01 — TDS Dashboard "Compute TDS" Button Bypasses Run Engine Preflight

**File:** `client/src/components/tds-management.tsx` (TdsDashboardPanel)  
**Endpoint:** `POST /api/payroll/tds/compute/:periodId`

After C3 is deployed (official records only), the remaining risk is re-computation on a locked, SAP-posted period. Add a UI guard:
- Disable the "Compute TDS" button if `period.status = 'locked'`
- Show a warning before allowing re-compute on any non-draft period: *"Re-computing TDS will update income tax and net pay on all official payroll records for this period. This cannot be undone. Proceed only before the period is locked."*

**UI enhancement only — no service-layer change required.**

---

## §6 — Verified Correct Patterns (No Change Required)

| File / Route | TDS Usage | Status |
|------|-----------|--------|
| `payroll-trial-routes.ts` | Calls `computeMonthlyTds()`, no `saveTdsRecord()` | ✓ Correct |
| `payroll-run-engine.ts` | Calls `computeAndSaveTdsForPeriod()` | ✓ Correct (after C3) |
| `payroll-routes.ts` `/tds/compute` | Calls `computeAndSaveTdsForPeriod()` | ✓ Correct (after C3 + GAP-01) |
| `payroll-routes.ts` tax-slabs endpoints | DB CRUD — no arithmetic | ✓ Correct (after R3) |
| `payroll-routes.ts` tax-declarations endpoints | DB CRUD + approval state machine | ✓ Correct (after R5) |
| `admin-routes.ts` | Reads `record.tdsAmount` — no arithmetic | ✓ Correct |
| `salary-slip-generator.ts` | Reads stored `incomeTax` — no arithmetic | ✓ Correct |
| `payroll-calculation-verifier.ts` | Reads `tds_monthly_records` — no arithmetic | ✓ Correct |
| `salary-calculation-engine.ts` | No TDS arithmetic | ✓ Clean |
| `advance-tax-routes.ts` | Company advance tax — different domain | ✓ Correct |
| `manual-salary-routes.ts` | `tdsAmount=0` intentional — Section 194C | ✓ Correct |
| `statutory-compliance-routes.ts` `challans/generate` | Reads `payrollRecords.tdsAmount` — no arithmetic | ✓ Correct (after C7) |
| `statutory-compliance-routes.ts` `tds/reconciliation/refresh` | Snapshots stored amounts — no arithmetic | ✓ Correct (after C8) |
| `statutory-compliance-routes.ts` `tds/deep-je-verify` | Reads reconciliation table + SAP JE | ✓ Correct |
| `statutory-compliance-routes.ts` `tds/sap-wht-sync` | SAP B1 WHT — independent of payroll TDS | ✓ Correct |
| `statutory-compliance-routes.ts` `challans/:id/post-sap` | Posts stored challan amounts to SAP | ✓ Correct (after C7) |
| `tds-compliance-page.tsx` (all 4 tabs) | Pure display — zero TDS arithmetic | ✓ Correct |
| `tds-management.tsx` (TDS Dashboard tab) | Reads `tds_monthly_records` — no arithmetic | ✓ Correct (after GAP-01 guard) |

---

## §7 — Intentional Separations (Do Not Change)

### Manual Salary → `tdsAmount = 0`
`manual-salary-routes.ts` handles Section 194C contract workers. Not salaried employees. `tdsAmount = 0` is correct and intentional. Do not route through `computeMonthlyTds()`.

### SAP WHT Non-Salary Sync — Independent
`tds/sap-wht-sync` imports Section 194C/J/H/I/Q WHT amounts from SAP B1. These come from SAP's own WHT computation on vendor documents — entirely independent of `computeMonthlyTds()`.

### `catchUpAdjustment = 0` — By Design
The spread-forward mechanism handles prior under-deductions by distributing the remaining annual liability across remaining months. Explicit catch-up arithmetic is not needed.

### `surchargeAmount = 0` — By Design
No THERMOPAC employee currently earns above ₹50L annually. Add surcharge calculation when needed.

### `tdsAmount || incomeTax` Fallback in Compliance Routes
Multiple compliance routes use `rec.tdsAmount?.toString() || rec.incomeTax?.toString() || '0'`. Both fields carry the same value — `incomeTax` is the legacy column name. Retain the dual-field read until a confirmed schema migration drops the legacy column.

### `tax_slabs` DB Table — Retained for Display
The `tax_slabs` table is retained for the Tax Slabs UI display tab. It is no longer the source of truth for TDS arithmetic — `getTaxConfig()` provides that. Old Regime rows in `tax_slabs` may be soft-deleted or left as-is; they will not affect computation.

---

## §8 — All Correction and Refactor Work Items

| ID | Priority | File(s) | Change |
|----|----------|---------|--------|
| N1 | HIGH | `server/tax-config/fy-2025-26.ts` *(new file)* | Create FY 2025-26 New Regime constants |
| N2 | HIGH | `server/tax-config/fy-2026-27.ts` *(new file)* | Create FY 2026-27 placeholder |
| N3 | HIGH | `server/tax-config/index.ts` *(new file)* | Create `getTaxConfig(financialYear)` |
| N4 | HIGH | `server/tds-calculation-service.ts` | Rewrite `computeMonthlyTds()` — use config, remove Old Regime, apply C2/C4/C6 |
| C2 | CRITICAL | `server/tds-calculation-service.ts` | `status='approved'` filter on declarations (included in N4) |
| C3 | CRITICAL | `server/tds-calculation-service.ts` | `record_type='official'` in `computeAndSaveTdsForPeriod()` |
| C4 | HIGH | `server/tds-calculation-service.ts` | Fix 87A rebate cap (included in N4 via config) |
| C5 | HIGH | `server/payroll-routes.ts` | Delete `calculateDeductions()` + `calculateBonuses()` |
| C6 | MEDIUM | `server/tds-calculation-service.ts` | Fix `monthsLeft` (included in N4) |
| C7 | CRITICAL | `server/statutory-compliance-routes.ts` | `record_type='official'` in `challans/generate` |
| C8 | HIGH | `server/statutory-compliance-routes.ts` | `record_type='official'` in `tds/reconciliation/refresh` |
| R1 | HIGH | `server/tds-calculation-service.ts` | Delete `calculateHraExemption()` |
| R2 | HIGH | `server/tds-calculation-service.ts` | Delete Old Regime block (lines 176–204) |
| R3 | HIGH | `server/tds-calculation-service.ts` | Remove Old Regime slab seeding from `getDefaultSlabs()` |
| R4 | MEDIUM | `server/tds-calculation-service.ts` | Remove Old Regime fields from `saveTdsRecord()` |
| R5 | MEDIUM | `client/src/components/tds-management.tsx` | Remove Old Regime fields from Declarations panel |
| R6 | LOW | `client/src/components/tds-management.tsx` | Remove Old Regime tab from Tax Slabs panel |
| GAP-01 | LOW | `client/src/components/tds-management.tsx` | Locked-period guard on "Compute TDS" button |

**N4 subsumes C2, C4, C6** (all three corrections are incorporated into the N4 rewrite).  
**N1–N3 must be completed before N4** (N4 imports from the config).  
**C3, C7, C8 are independent of N1–N4** and can be deployed first.

---

## §9 — Implementation Order

```
Step 1:  C5    — Delete dead code (payroll-routes.ts) — zero risk
Step 2:  C3    — record_type='official' in computeAndSaveTdsForPeriod()
Step 3:  C7    — record_type='official' in challans/generate
Step 4:  C8    — record_type='official' in reconciliation/refresh
Step 5:  N1    — Create server/tax-config/fy-2025-26.ts
Step 6:  N2    — Create server/tax-config/fy-2026-27.ts
Step 7:  N3    — Create server/tax-config/index.ts
Step 8:  N4    — Rewrite computeMonthlyTds() (includes C2, C4, C6)
Step 9:  R1    — Delete calculateHraExemption()
Step 10: R2    — Delete Old Regime block from service
Step 11: R3    — Remove Old Regime seeding from getDefaultSlabs()
Step 12: R4    — Remove Old Regime fields from saveTdsRecord()
Step 13: R5    — Remove Old Regime fields from Declarations UI
Step 14: R6    — Remove Old Regime from Tax Slabs UI
Step 15: GAP-01 — Locked-period guard on Compute TDS button
```

Steps 1–4 are purely protective (no behavioural change). Steps 5–8 are the core architecture change. Steps 9–14 are cleanup. Step 15 is a UI enhancement.

**TypeScript compilation must be clean after each step before proceeding.**

---

## §10 — Testing Requirements

### N1–N4 — Config and Rewrite
- `getTaxConfig('2025-26')` returns correct slabs, cap, limit, standard deduction
- `getTaxConfig('2099-99')` throws with descriptive error message (no silent fallback)
- Gross ₹12,75,000 → taxable ₹12,00,000 → slab tax ₹60,000 → rebate ₹60,000 → monthly TDS = ₹0
- Gross ₹12,76,000 → taxable ₹12,01,000 → above rebate threshold → TDS > 0
- Gross ₹15,75,000 → taxable ₹15,00,000 → no rebate; slab tax > ₹60,000 → TDS > 0
- Employee with approved declaration: `previousEmployerIncome = ₹2L`, `previousEmployerTds = ₹5,000` → added to projected gross and subtracted from TDS liability respectively
- Employee with draft declaration → treated same as no declaration (prev employer fields = 0)
- Employee with rejected declaration → treated same as no declaration

### C2 — Approved Declaration Filter
- Draft declaration with `previousEmployerIncome = ₹5L` → not applied
- Approved declaration with `previousEmployerIncome = ₹5L` → applied to projected gross

### C3 — Record Type Filter in `computeAndSaveTdsForPeriod()`
- Period with 2 official + 3 trial rows → exactly 2 rows processed; `tds_monthly_records` count = 2

### C4 — 87A Rebate Cap
- Taxable = ₹10,00,000 → slab tax = ₹60,000; rebate = min(₹60,000, cap ₹60,000) = ₹60,000 → TDS = 0
- Taxable = ₹12,00,000 → slab tax ≤ ₹60,000; rebate absorbs it fully → TDS = 0
- Taxable = ₹12,01,000 → above rebate threshold; no rebate; TDS > 0
- Taxable = ₹20,00,000 → no rebate; full slab tax + cess; TDS > 0

### C5 — Dead Code Deletion
- `tsc --noEmit` clean after deletion
- `grep -r "calculateDeductions\|calculateBonuses" server/` → zero results

### C6 — MonthsLeft Fix
- April joiner (month 1 of FY, no prior records): `monthsLeft = 12`
- December joiner (month 9 of FY, no prior records): `monthsLeft = 4`
- March joiner (month 12 of FY, no prior records): `monthsLeft = 1`

### C7 — Challan Generation Filter
- Period with 2 official + 2 trial rows (all `tdsAmount > 0`) → `totalEmployeeContribution` = sum of 2 official rows only; `tds_compliance_register` has 2 entries, not 4

### C8 — Reconciliation Refresh Filter
- Period with 3 official + 2 trial rows (trial `status='processed'`) → `tds_payroll_sap_reconciliation` has 3 rows; `response.refreshed = 3`

### R1–R4 — Old Regime Code Removal
- `grep -r "regime\|hraExemption\|section80c\|section80d\|section24b\|calculateHraExemption" server/tds-calculation-service.ts` → zero results after cleanup
- `tsc --noEmit` clean after each removal step

### R5–R6 — UI Cleanup
- Declarations form no longer shows HRA, 80C, 80D, 24B, regime selector, or rent fields
- Tax Slabs UI shows only New Regime rows

---

## §11 — What Stays Out of Scope

| Topic | Reason |
|-------|--------|
| Old Regime | Explicitly out of scope per v1.3 mandate. `tax_slabs` Old Regime DB rows are harmless; no need to delete them. |
| Surcharge calculation | No employee earns > ₹50L. Add when needed. |
| `catchUpAdjustment` | Spread-forward handles under-deductions implicitly. By design. |
| `tds_monthly_records` Old Regime columns | Leave nullable columns in place for historical data. Drop in a later cleanup sprint if desired. |
| SAP WHT sync arithmetic | SAP B1 computes WHT on vendor documents — independent of payroll TDS service by design. |
| `regimeLocked` DB field | Leave in schema as a nullable column. With Old Regime removed from UI and service, it has no operational effect. |
| FY 2026-27 config values | Placeholder mirrors FY 2025-26. Finance team must confirm before April 2027 payroll run. |

---

## §12 — Annual FY Config Gate

Before the first payroll run of any new financial year:

1. Create `server/tax-config/fy-YYYY-YY.ts` — fill values from the Finance Ministry notification
2. Register the new config in `server/tax-config/index.ts` `FY_CONFIGS` map
3. Finance team signs off on the slab values, standard deduction, cess rate, and 87A figures
4. Verify `getTaxConfig('YYYY-YY')` returns the correct config (automated test)
5. Merge to main **before** April payroll is processed

If this gate is missed, `getTaxConfig()` will throw on the first TDS compute attempt — a loud, immediate failure rather than a silent wrong-FY computation.
