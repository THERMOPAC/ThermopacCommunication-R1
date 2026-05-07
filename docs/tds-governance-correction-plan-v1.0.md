# Payroll TDS Calculation Governance — Correction Plan v1.0
**Date:** 2026-05-06  
**Scope:** All server-side payroll TDS calculation, storage, and downstream consumption  
**Mandate:** Trial route and official run route use the exact same TDS service and same payroll core logic. No duplicate TDS arithmetic anywhere.

---

## §1 — Canonical Architecture (Target State)

```
computeMonthlyTds()        ← Single arithmetic source for ALL TDS figures
     ↑
     │ called by
     ├── payroll-trial-routes.ts   (trial: compute + include in record, NO saveTdsRecord)
     └── tds-calculation-service.ts → computeAndSaveTdsForPeriod()
              ↑
              └── payroll-run-engine.ts  (official: step tds_calculation)

payroll-routes.ts          ← NO TDS arithmetic. Route wiring only.
admin-routes.ts            ← Reads record.tdsAmount from DB. No arithmetic.
salary-slip-generator.ts   ← Reads stored incomeTax field. No arithmetic.
manual-salary-routes.ts    ← tdsAmount = 0 intentionally (non-system users,
                              Section 194C, separate compliance register path).
payroll-calculation-verifier.ts ← Reads tds_monthly_records for post-run verification.
                                   No calculation.
```

**One service. One function. Two callers (trial, official). All others read.**

---

## §2 — Defect Register

### BUG-01 · CRITICAL — Regime Hardcoded to 'new'; Old Regime Dead Code

**File:** `server/tds-calculation-service.ts` line 126  
**Code:**
```typescript
const regime = 'new';   // ← hardcoded
// declaration.regime is fetched on line 120 and immediately ignored
```

**Impact:** Every employee is taxed under the New Regime regardless of what they declared.  
Employees who declared Old Regime lose all deductions:
- Standard deduction: ₹50,000 (old) vs ₹75,000 (new) — minor, new regime is better here
- HRA exemption: up to ₹1–2L/year — silently zeroed
- Section 80C: up to ₹2,00,000/year — silently zeroed
- Section 80D: up to ₹1,00,000/year — silently zeroed
- Section 24B (home loan interest): up to ₹2,00,000/year — silently zeroed

The entire `if (regime === 'old' && declaration)` block (lines 176–204) is dead code.

**Affected employees:** Any employee whose `employeeTaxDeclarations.regime = 'old'`.

**Fix:** Read `regime` from declaration; fall back to `'new'` if no declaration exists.
```typescript
const regime = (declaration?.regime === 'old') ? 'old' : 'new';
```
The Old Regime code block (lines 176–204) must remain and be verified.

**Correction item:** C1

---

### BUG-02 · CRITICAL — `computeAndSaveTdsForPeriod` Lacks `record_type='official'` Filter

**File:** `server/tds-calculation-service.ts` line 334  
**Code:**
```typescript
const records = await db.select().from(payrollRecords)
  .where(eq(payrollRecords.periodId, periodId));
// ↑ NO record_type filter — fetches trial AND official rows
```

**Impact:** If any `record_type='trial'` rows exist for the period when the TDS step runs:
1. TDS is computed and `saveTdsRecord()` is called for each trial row
2. `tds_monthly_records` is upserted with trial data (unique key: `userId + periodId`)
3. The trial row's `income_tax`, `tds_amount`, `total_deductions`, `net_pay` are overwritten
4. The official row's TDS record is overwritten by whichever ran last (order is non-deterministic)

Under current governance, trial rows must be reversed before the official run starts. But the TDS step has no enforcement of this invariant — it relies entirely on the preflight check upstream. A direct call to `POST /api/payroll/tds/compute/:periodId` bypasses the preflight entirely.

**Fix:** Add `record_type='official'` filter and exclude `workerType='non_system_user'` rows.
```typescript
const records = await db.select().from(payrollRecords)
  .where(and(
    eq(payrollRecords.periodId, periodId),
    eq(payrollRecords.recordType as any, 'official')
  ));
```

**Correction item:** C2

---

### BUG-03 · HIGH — `section87aRebate` Computed as `Math.min(x, x)`

**File:** `server/tds-calculation-service.ts` line 219  
**Code:**
```typescript
section87aRebate = Math.min(taxOnProjectedIncome + cessAmount,
                            taxOnProjectedIncome + cessAmount);
// Math.min(x, x) = x — no actual minimum is being taken
```

**Current behaviour under New Regime:** The full rebate zeroes all tax for income ≤ ₹7L. The final liability is correctly 0 because `taxOnProjectedIncome` and `cessAmount` are zeroed afterwards. The functional result is correct for New Regime.

**Defect when Old Regime is enabled (BUG-01 fix):** Section 87A rebate under Old Regime is capped at ₹12,500 (not the full tax). The current code would rebate the entire tax liability for Old Regime employees with income ≤ ₹5L (the Old Regime 87A limit), resulting in zero TDS where some TDS may be owed.

**Fix:** Introduce a proper rebate cap:
```typescript
// New Regime: if income ≤ 7L, full rebate (no cap — entire liability zeroed)
// Old Regime: if income ≤ 5L, rebate capped at ₹12,500
const maxRebate = regime === 'new'
  ? taxOnProjectedIncome + cessAmount   // full rebate
  : 12500;
section87aRebate = Math.min(taxOnProjectedIncome, maxRebate);
// Apply rebate: reduce tax first, then cess on remaining
taxOnProjectedIncome = Math.max(0, taxOnProjectedIncome - section87aRebate);
cessAmount = taxOnProjectedIncome * cessRate;
```

**Correction item:** C3

---

### BUG-04 · HIGH — `calculateDeductions()` Dead Code with Flat-Rate TDS Formula

**File:** `server/payroll-routes.ts` lines 493–511  
**Code:**
```typescript
function calculateDeductions(baseSalary: number, settings: Record<string, string>) {
  const incomeTaxRate = parseFloat(settings.income_tax_rate || '10') / 100;
  const incomeTax = baseSalary * incomeTaxRate;   // ← flat 10% — not the TDS service
  ...
}
```

**Status:** This function is defined but never called. Its only historical caller was `POST /api/payroll/generate-payroll/:periodId` which already returns `410 Gone`. The function is unreachable dead code.

**Risk:** If any future route calls `calculateDeductions()`, it will produce a flat-rate percentage TDS completely divorced from `computeMonthlyTds()` — a silent governance violation.

**Fix:** Delete the entire `calculateDeductions()` function (lines 493–511) and its unused `calculateBonuses()` companion (lines 448–490) which has the same dead-code status.

**Correction item:** C4

---

### BUG-05 · MEDIUM — `monthsLeft = 12` for First-Month New Joiners Regardless of Join Month

**File:** `server/tds-calculation-service.ts` lines 228–230  
**Code:**
```typescript
const hasNoPriorTds = previousTdsRecords.length === 0 && tdsDeductedYtd === 0;
const monthsLeft = hasNoPriorTds ? 12 : Math.max(1, remainingMonths + 1);
```

**Impact:** An employee who joins in December (month 9 of FY) has `remainingMonths = 3` but `monthsLeft = 12`. Their first-month TDS is computed as `annualLiability / 12` instead of `annualLiability / 4`, so the deduction is one-third of what it should be. The shortfall catches up in February and March automatically, but the December–January deduction is understated.

**Fix:** Use remaining months for all cases:
```typescript
const monthsLeft = Math.max(1, remainingMonths + 1);
```

**Correction item:** C5

---

## §3 — Verified Correct Patterns (No Change Required)

| File | TDS Usage | Status |
|------|-----------|--------|
| `payroll-trial-routes.ts` | Calls `computeMonthlyTds()`, does NOT call `saveTdsRecord()` | ✓ Correct |
| `payroll-run-engine.ts` | Calls `computeAndSaveTdsForPeriod()` from service | ✓ Correct (after C2 fix) |
| `payroll-routes.ts` `/tds/compute` | Calls `computeAndSaveTdsForPeriod()` from service | ✓ Correct (after C2 fix) |
| `admin-routes.ts` | Reads `record.tdsAmount` from DB — no arithmetic | ✓ Correct |
| `salary-slip-generator.ts` | Reads `incomeTax` from stored record — no arithmetic | ✓ Correct |
| `payroll-calculation-verifier.ts` | Reads `tds_monthly_records` for post-run verification only | ✓ Correct |
| `manual-salary-routes.ts` | `tdsAmount = 0` — intentional (see §4) | ✓ Intentional |
| `salary-calculation-engine.ts` | No TDS arithmetic (confirmed by grep) | ✓ Clean |
| `advance-tax-routes.ts` | Company advance tax — different domain, not employee TDS | ✓ Correct |
| `statutory-compliance-routes.ts` | GL mapping and challan tracking — no arithmetic | ✓ Correct |

---

## §4 — Intentional Separations (Do Not Change)

### Manual Salary Routes — `tdsAmount = 0`

`manual-salary-routes.ts` processes **non-system users** (contract workers, daily-wage workers). These are not salaried employees under Section 192. Their TDS compliance is tracked separately under Section 194C in `tds_compliance_register`. The `tdsAmount = 0` in `calculateManualSalary()` is correct and intentional — the TDS section differs entirely from the salaried payroll TDS path.

**Do not route `calculateManualSalary()` through `computeMonthlyTds()`.** The populations, TDS sections, and accounting treatments are different.

---

## §5 — Correction Work Items

| ID | Priority | File | Change | Risk |
|----|----------|------|--------|------|
| C1 | CRITICAL | `tds-calculation-service.ts` | Read `regime` from declaration, activate Old Regime code path | Behavioural change — verify all employees' declaration before deploy |
| C2 | CRITICAL | `tds-calculation-service.ts` | Add `record_type='official'` filter in `computeAndSaveTdsForPeriod()` | Low — protective filter |
| C3 | HIGH | `tds-calculation-service.ts` | Fix `section87aRebate` computation with proper cap per regime | Required before C1 can go live |
| C4 | HIGH | `payroll-routes.ts` | Delete `calculateDeductions()` and `calculateBonuses()` dead code | Zero risk — unreachable code |
| C5 | MEDIUM | `tds-calculation-service.ts` | Fix `monthsLeft` for mid-year joiners | Minor numerical correction |

---

## §6 — Implementation Order

**C4 first** (delete dead code — zero risk, cleans up before other changes)  
**C2 second** (record_type filter — protective, no behavioural change under normal flow)  
**C3 third** (fix 87A rebate cap formula — required before Old Regime is enabled)  
**C1 last** (activate Old Regime — behavioural change, requires prior review of all declarations)

For C1 specifically: before deploying, run this query and review with HR/Finance:
```sql
SELECT u.username, u.first_name, u.last_name, d.regime,
       d.section80c, d.section80d, d.monthly_rent_paid
FROM employee_tax_declarations d
JOIN users u ON u.id = d.user_id
WHERE d.regime = 'old'
  AND d.financial_year = '2025-26';
```
Any employee returned here is currently being overtaxed. After C1 is deployed, their TDS records for prior months of the FY will need manual review via the TDS re-compute endpoint.

---

## §7 — Testing Requirements

For each correction, the following must be verified before the period is locked:

### C1 — Old Regime Activation
- Employee with `regime='old'` + 80C = ₹1,50,000 + HRA = ₹8,000/month + rent = ₹10,000/month → TDS should reflect HRA exemption and 80C deduction
- Employee with `regime='new'` → identical result to current (no regression)
- Employee with no declaration → defaults to `'new'` (no change from current)

### C2 — Record Type Filter
- Run `computeAndSaveTdsForPeriod()` with trial rows in DB → only official rows processed
- `tds_monthly_records` count = number of official records only

### C3 — 87A Rebate Fix
- New Regime, income = ₹6,50,000 → TDS = 0 (income ≤ 7L)
- New Regime, income = ₹7,50,000 → TDS > 0 (income > 7L)
- Old Regime, income = ₹4,50,000 → TDS = 0 or reduced by ₹12,500 cap correctly
- Old Regime, income = ₹5,50,000 → TDS = tax on ₹50,000 slab (no rebate; income > 5L threshold)

### C4 — Dead Code Deletion
- TypeScript compilation succeeds after deletion
- No other file imports `calculateDeductions` or `calculateBonuses`

### C5 — MonthsLeft Fix
- Mid-year joiner (e.g., December): first TDS = `annualLiability / 4`, not `/ 12`
- April joiner: `monthsLeft = 12` (no change)

---

## §8 — What Stays Out of Scope

1. **Surcharge calculation** (`surchargeAmount` always 0): Employees earning > ₹50L annually. No such employees currently. Implement when needed.
2. **`catchUpAdjustment`** (always 0): The spread-forward mechanism handles under-deductions implicitly. Explicit catch-up is not needed.
3. **`tds_monthly_records.record_type` column**: Not needed. Trial TDS is never persisted (trial route does not call `saveTdsRecord()`). After C2, `computeAndSaveTdsForPeriod()` only processes official rows, so all persisted TDS records are de-facto official.
4. **`salary-calculation-engine.ts`** TDS: No TDS arithmetic exists here (confirmed). Leave as-is.

