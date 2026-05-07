/**
 * TDS Slab Arithmetic Verification — Permanent Test Suite
 *
 * Tests the TDS engine for high-income brackets, focusing on:
 *   - Progressive slab accumulation (all 7 slabs)
 *   - 30% rate applied only above ₹24,00,000 taxable income
 *   - No upper salary cap (Infinity max on top slab)
 *   - Mathematically correct annual tax for ₹30L / ₹50L / ₹1Cr gross
 *
 * Surcharge is future scope — not tested here.
 *
 * Run: npx tsx server/tax-config/tds-slab-verify.ts
 */

import { getTaxConfig } from './index';

// ---------------------------------------------------------------------------
// Engine helpers (mirrors computeMonthlyTds logic — pure functions)
// ---------------------------------------------------------------------------

const cfg = getTaxConfig('2025-26');

function calcSlabTax(taxableIncome: number): number {
  let tax = 0;
  for (const slab of cfg.slabs) {
    if (taxableIncome <= slab.min) break;
    const inSlab = Math.min(taxableIncome, slab.max) - slab.min;
    if (inSlab > 0) tax += inSlab * slab.rate;
  }
  return tax;
}

function annualTax(grossAnnual: number): {
  gross: number;
  taxable: number;
  slabBreakdown: { range: string; rate: string; taxableInSlab: number; tax: number }[];
  slabTax: number;
  rebate87A: number;
  taxAfterRebate: number;
  cess: number;
  totalAnnualTax: number;
  portion30pct: number;
} {
  const taxable = Math.max(0, grossAnnual - cfg.standardDeduction);
  const slabBreakdown = cfg.slabs.map((slab) => {
    if (taxable <= slab.min) return { range: `>₹${slab.min / 100000}L`, rate: `${slab.rate * 100}%`, taxableInSlab: 0, tax: 0 };
    const inSlab = Math.min(taxable, slab.max) - slab.min;
    const tax = Math.max(0, inSlab) * slab.rate;
    const maxLabel = slab.max === Infinity ? '∞' : `₹${slab.max / 100000}L`;
    return { range: `₹${slab.min / 100000}L–${maxLabel}`, rate: `${slab.rate * 100}%`, taxableInSlab: Math.max(0, inSlab), tax };
  });

  const slabTax = calcSlabTax(taxable);
  const rebate87A = taxable <= cfg.section87aRebateLimit ? Math.min(slabTax, cfg.section87aRebateCap) : 0;
  const taxAfterRebate = Math.max(0, slabTax - rebate87A);
  const cess = taxAfterRebate * cfg.cessRate;
  const totalAnnualTax = taxAfterRebate + cess;
  const portion30pct = Math.max(0, taxable - 2_400_000) * 0.30;

  return { gross: grossAnnual, taxable, slabBreakdown, slabTax, rebate87A, taxAfterRebate, cess, totalAnnualTax, portion30pct };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let pass = 0;
let fail = 0;

function check(label: string, got: number, expect: number, tolerancePaise = 0): void {
  const ok = Math.abs(got - expect) <= tolerancePaise;
  const mark = ok ? 'PASS' : 'FAIL';
  const gotFmt = got.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const expFmt = expect.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  console.log(`  ${mark}  ${label}: ₹${gotFmt} (expect ₹${expFmt})`);
  ok ? pass++ : fail++;
}

function checkTrue(label: string, condition: boolean): void {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}`);
  condition ? pass++ : fail++;
}

function section(title: string): void {
  console.log(`\n── ${title} ──`);
}

// ---------------------------------------------------------------------------
// SECTION 1: Slab structure
// ---------------------------------------------------------------------------

section('S1 — Slab structure integrity');

checkTrue('S1-01  7 slabs defined', cfg.slabs.length === 7);
checkTrue('S1-02  Top slab max is Infinity (no upper cap)', cfg.slabs[6].max === Infinity);
checkTrue('S1-03  Top slab rate is 30%', cfg.slabs[6].rate === 0.30);
checkTrue('S1-04  Top slab min is ₹24,00,000', cfg.slabs[6].min === 2_400_000);
checkTrue('S1-05  Slabs are contiguous (each max = next min)', cfg.slabs.every((s, i) => {
  if (i === cfg.slabs.length - 1) return true;
  return s.max === cfg.slabs[i + 1].min;
}));

// ---------------------------------------------------------------------------
// SECTION 2: ₹30L gross
// ---------------------------------------------------------------------------

section('S2 — ₹30,00,000 gross annual salary');
const r30 = annualTax(30_00_000);

checkTrue('S2-01  Taxable = gross − std-ded (₹75,000)', r30.taxable === 29_25_000);
check(   'S2-02  Slab tax (progressive, all slabs)',     r30.slabTax,        4_57_500);
check(   'S2-03  30% slab portion only (above ₹24L)',   r30.portion30pct,   1_57_500);
check(   'S2-04  0% portion on first ₹4L',              r30.slabBreakdown[0].tax, 0);
check(   'S2-05  5% portion (₹4L–₹8L) = ₹20,000',     r30.slabBreakdown[1].tax, 20_000);
check(   'S2-06  10% portion (₹8L–₹12L) = ₹40,000',   r30.slabBreakdown[2].tax, 40_000);
check(   'S2-07  15% portion (₹12L–₹16L) = ₹60,000',  r30.slabBreakdown[3].tax, 60_000);
check(   'S2-08  20% portion (₹16L–₹20L) = ₹80,000',  r30.slabBreakdown[4].tax, 80_000);
check(   'S2-09  25% portion (₹20L–₹24L) = ₹1,00,000',r30.slabBreakdown[5].tax, 1_00_000);
check(   'S2-10  30% portion (₹24L–₹29.25L) = ₹1,57,500', r30.slabBreakdown[6].tax, 1_57_500);
check(   'S2-11  No 87A rebate (taxable > ₹12L)',       r30.rebate87A,      0);
check(   'S2-12  Cess at 4%',                           r30.cess,           18_300);
check(   'S2-13  Total annual tax',                     r30.totalAnnualTax, 4_75_800);

// ---------------------------------------------------------------------------
// SECTION 3: ₹50L gross
// ---------------------------------------------------------------------------

section('S3 — ₹50,00,000 gross annual salary');
const r50 = annualTax(50_00_000);

checkTrue('S3-01  Taxable = gross − std-ded (₹75,000)', r50.taxable === 49_25_000);
check(   'S3-02  Slab tax (progressive, all slabs)',     r50.slabTax,        10_57_500);
check(   'S3-03  30% slab portion only (above ₹24L)',   r50.portion30pct,    7_57_500);
check(   'S3-04  Slabs 1–6 tax sub-total = ₹3,00,000', r50.slabBreakdown.slice(0, 6).reduce((s, b) => s + b.tax, 0), 3_00_000);
check(   'S3-05  30% portion (₹24L–₹49.25L)',          r50.slabBreakdown[6].tax, 7_57_500);
check(   'S3-06  No 87A rebate',                        r50.rebate87A,       0);
check(   'S3-07  Cess at 4%',                           r50.cess,            42_300);
check(   'S3-08  Total annual tax',                     r50.totalAnnualTax,  10_99_800);

// ---------------------------------------------------------------------------
// SECTION 4: ₹1 Crore gross
// ---------------------------------------------------------------------------

section('S4 — ₹1,00,00,000 gross annual salary (₹1 Cr)');
const r1cr = annualTax(1_00_00_000);

checkTrue('S4-01  Taxable = gross − std-ded (₹75,000)', r1cr.taxable === 99_25_000);
check(   'S4-02  Slab tax (progressive, all slabs)',      r1cr.slabTax,        25_57_500);
check(   'S4-03  30% slab portion only (above ₹24L)',    r1cr.portion30pct,   22_57_500);
check(   'S4-04  Slabs 1–6 tax sub-total = ₹3,00,000',  r1cr.slabBreakdown.slice(0, 6).reduce((s, b) => s + b.tax, 0), 3_00_000);
check(   'S4-05  30% portion (₹24L–₹99.25L)',           r1cr.slabBreakdown[6].tax, 22_57_500);
check(   'S4-06  No 87A rebate',                         r1cr.rebate87A,       0);
check(   'S4-07  Cess at 4%',                            r1cr.cess,            1_02_300);
check(   'S4-08  Total annual tax',                      r1cr.totalAnnualTax,  26_59_800);

// ---------------------------------------------------------------------------
// SECTION 5: 30% applies only above ₹24L — boundary tests
// ---------------------------------------------------------------------------

section('S5 — 30% boundary: gross ₹24L has ZERO 30% portion');
const r24L = annualTax(24_00_000);

checkTrue('S5-01  Taxable at ₹24L gross < ₹24L (std-ded pushes it below)', r24L.taxable < 2_400_000);
check(   'S5-02  30% portion at ₹24L gross = ₹0',  r24L.portion30pct, 0);
check(   'S5-03  Top slab tax at ₹24L gross = ₹0', r24L.slabBreakdown[6].tax, 0);

section('S5 — 30% boundary: gross ₹24.76L first rupee at 30%');
const r2476 = annualTax(24_76_000); // taxable = 24,01,000 → ₹1 into 30% slab
checkTrue('S5-04  Taxable at ₹24.76L gross = ₹24,01,000', r2476.taxable === 24_01_000);
check(   'S5-05  30% portion = ₹1 × 30% = ₹300',  r2476.portion30pct,         300);
check(   'S5-06  Top slab tax = ₹300',             r2476.slabBreakdown[6].tax, 300);

// ---------------------------------------------------------------------------
// SECTION 6: No upper cap — extreme income
// ---------------------------------------------------------------------------

section('S6 — No upper salary cap (₹10 Cr gross)');
const r10cr = annualTax(10_00_00_000);

checkTrue('S6-01  Taxable is computed (no NaN, no cap)',    isFinite(r10cr.totalAnnualTax) && r10cr.totalAnnualTax > 0);
checkTrue('S6-02  Total tax increases with income (> ₹1Cr tax)', r10cr.totalAnnualTax > r1cr.totalAnnualTax);
checkTrue('S6-03  30% portion grows linearly above ₹24L',
  Math.abs((r10cr.portion30pct / r1cr.portion30pct) - ((r10cr.taxable - 2_400_000) / (r1cr.taxable - 2_400_000))) < 0.0001
);

// ---------------------------------------------------------------------------
// SECTION 7: Progressive property — tax always increases with income
// ---------------------------------------------------------------------------

section('S7 — Progressive tax: higher income → higher tax (monotonicity)');
const incomes = [15_00_000, 20_00_000, 25_00_000, 30_00_000, 50_00_000, 1_00_00_000];
const taxes = incomes.map((g) => annualTax(g).totalAnnualTax);
const isMonotone = taxes.every((t, i) => i === 0 || t > taxes[i - 1]);

checkTrue('S7-01  Tax is strictly increasing across ₹15L/₹20L/₹25L/₹30L/₹50L/₹1Cr', isMonotone);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${'='.repeat(60)}`);
console.log(`RESULT: ${pass} PASSED, ${fail} FAILED  (total: ${pass + fail})`);
console.log(`${'='.repeat(60)}\n`);

if (fail > 0) {
  process.exit(1);
}
