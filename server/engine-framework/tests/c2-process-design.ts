// ═══════════════════════════════════════════════════════════════════════════════
// Stage C2 — LLX Process Design Engine validation suite
// Run: npx tsx server/engine-framework/tests/c2-process-design.ts
//
// Covers correction-14 list: gross inlet balance without outlet split data;
// complete three-component balance; non-zero NMP carryover; non-zero oil loss;
// explicit zero-loss assumptions; missing loss data ⇒ Pending Validation;
// case independence; solvent flow/ratio inconsistency rejection; phase
// assignment independent of density ordering; exact closure.
// ═══════════════════════════════════════════════════════════════════════════════

import { LLXProcessDesignEngine } from '../../engines/llx/llx-process-design-engine';
import type { CalculationContext } from '../types';

let pass = 0, fail = 0;

function checkTrue(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}
function check(name: string, actual: number | null | undefined, expected: number, relTol = 1e-9) {
  const ok = actual !== null && actual !== undefined && Number.isFinite(actual)
    && Math.abs(actual - expected) <= relTol * Math.max(Math.abs(expected), 1e-12);
  if (ok) { pass++; console.log(`  ✅ ${name}: ${actual}`); }
  else { fail++; console.error(`  ❌ ${name}: got ${actual}, expected ${expected}`); }
}

const engine = new LLXProcessDesignEngine();
const ctx: CalculationContext = { revisionId: 999001, designId: 1, moduleType: 'llx', userId: 1 };

const tag = (value: number, sourceType = 'Measured', sourceReference = 'Thermopac lab report LR-2026-014') =>
  ({ value, sourceType, sourceReference });

/** Approved hand-calculated benchmark inputs. */
function baseInputs(): Record<string, unknown> {
  return {
    operatingTemperature: 60,
    feedFlow: { value: 5000, basis: 'mass' },
    feedDensity: { value: 895, referenceTemperatureC: 60, sourceType: 'Measured', sourceReference: 'Thermopac lab density LR-2026-011' },
    solventToOilRatio: 1.5,
    maxCirculationFactor: 1.2,
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    theoreticalStages: 6,
    compartmentOrStageEfficiency: 0.6,
    soluteMassFractionInFeed: tag(0.30),
    caseSplits: {
      normal: {
        soluteRecoveryToExtract: tag(0.90),
        solventCarryoverFraction: tag(0.02),
        oilLossToExtractFraction: tag(0.01),
      },
    },
    applyNormalSplitsToMaximumCase: true,
  };
}

async function main() {
  // ── 1. Approved hand-calculated benchmark (complete three-component balance) ──
  console.log('── Approved hand-calculated benchmark ──');
  {
    const v = engine.validate(baseInputs());
    checkTrue('benchmark inputs validate', v.valid, JSON.stringify(v.errors));
    const res = await engine.calculate(baseInputs(), ctx);
    checkTrue('status not error', res.status !== 'error');
    const d = res.data as any;

    check('normalSolventMassFlow', d.flows.normalSolventMassFlow, 7500);
    check('maximumSolventMassFlow', d.flows.maximumSolventMassFlow, 9000);
    check('solventToOilRatio', d.solventToOilRatio.value, 1.5);
    checkTrue('ratio basis stated', d.solventToOilRatio.basis === 'normal NMP mass flow / total RRBO feed mass flow');
    check('feedVolumetricFlow (5000/895)', d.flows.feedVolumetricFlow, 5000 / 895);

    const nb = d.normalCase.componentBalance;
    check('feed oil carrier', nb.feed.oilCarrier, 3500);
    check('feed solute', nb.feed.solute, 1500);
    check('raffinate oil carrier', nb.raffinate.oilCarrier, 3465);
    check('raffinate solute', nb.raffinate.solute, 150);
    check('raffinate NMP (non-zero carryover)', nb.raffinate.nmp, 150);
    check('raffinate total', nb.raffinate.total, 3765);
    check('extract oil (non-zero oil loss)', nb.extract.oilCarrier, 35);
    check('extract solute', nb.extract.solute, 1350);
    check('extract NMP', nb.extract.nmp, 7350);
    check('extract total', nb.extract.total, 8735);
    check('closure absolute', nb.closure.absolute_kg_h, 0, 1e-6);
    checkTrue('closure relative < 1e-12', nb.closure.relative < 1e-12);

    // Corrected yield terminology (correction 1)
    const y = d.normalCase.yields;
    check('grossRaffinateToFeedRatio', y.grossRaffinateToFeedRatio, 0.753);
    check('grossExtractToFeedRatio', y.grossExtractToFeedRatio, 1.747);
    check('solventFreeRaffinateYield', y.solventFreeRaffinateYield, 0.723);
    check('recoveredOilCarrierYield', y.recoveredOilCarrierYield, 0.99);
    check('extractedSoluteRecovery', y.extractedSoluteRecovery, 0.90);
    check('solventRecoveryToExtract', y.solventRecoveryToExtract, 0.98);
    check('nmpCarryoverToRaffinate', y.nmpCarryoverToRaffinate, 0.02);
    checkTrue('no output named raffinateYield/extractYield', !('raffinateYield' in y) && !('extractYield' in y));

    // Maximum case — independent balance with reused splits
    const mb = d.maximumCase.componentBalance;
    check('max raffinate NMP', mb.raffinate.nmp, 180);
    check('max raffinate total', mb.raffinate.total, 3795);
    check('max extract total', mb.extract.total, 10205);
    check('max closure absolute', mb.closure.absolute_kg_h, 0, 1e-6);
    checkTrue('max case marks splits reused', mb.splitFractionsUsed.reusedFromNormalCase === true);
    checkTrue('CASE_SPLIT_ASSUMPTIONS_REUSED warning', res.warnings.some(w => w.code === 'CASE_SPLIT_ASSUMPTIONS_REUSED'));
    checkTrue('max case Pending Validation when splits reused', mb.classification === 'Pending Validation');
    checkTrue('normal case Calculated Screening Result', nb.classification === 'Calculated Screening Result');

    // PD-010
    check('estimatedPhysicalStages ceil(6/0.6)', d.stages.estimatedPhysicalStages, 10);
    checkTrue('stage label = Preliminary Stage-Equivalent Estimate', d.stages.label === 'Preliminary Stage-Equivalent Estimate');

    // Versions, assumptions, status
    checkTrue('CEL version recorded', d.celVersion === '1.0.0');
    checkTrue('EPD version recorded', d.epdVersion === '1.0.0');
    checkTrue('standing assumptions present', ['no accumulation', 'Isothermal', 'evaporation', 'disengagement']
      .every(k => (d.assumptions as any[]).some(a => a.assumption.toLowerCase().includes(k.toLowerCase()))));
    // NMP density at 60 °C interpolates the Assumed 80 °C point ⇒ pending_validation
    checkTrue('NMP Assumed density ⇒ pending_validation overall', d.calculationRunStatus === 'pending_validation');
    checkTrue('ASSUMED_PROPERTY_DATA warning present', res.warnings.some(w => w.code === 'ASSUMED_PROPERTY_DATA'));
    checkTrue('phase continuity from input (NMP continuous)', d.phaseConfiguration.continuousPhase === 'NMP');
    checkTrue('lighter phase RRBO (895 < ~1005)', d.phaseConfiguration.lighterPhase === 'RRBO');
  }

  // ── 2. Gross inlet balance only — missing outlet split data ──
  console.log('── Missing split data ⇒ gross inlet balance + Pending Validation ──');
  {
    const inputs = baseInputs();
    delete inputs.caseSplits;
    delete inputs.applyNormalSplitsToMaximumCase;
    delete inputs.soluteMassFractionInFeed;
    const res = await engine.calculate(inputs, ctx);
    const d = res.data as any;
    check('gross inlet total F+S', d.normalCase.grossInletBalance.totalInletMassFlow, 12500);
    checkTrue('gross inlet is Calculated Screening Result', d.normalCase.grossInletBalance.classification === 'Calculated Screening Result');
    checkTrue('component balance Pending Validation', d.normalCase.componentBalance.classification === 'Pending Validation');
    checkTrue('missing inputs listed', (d.normalCase.componentBalance.missingInputs as string[]).length === 4);
    checkTrue('outlet-split-incomplete warning', res.warnings.some(w => w.code === 'OUTLET_SPLIT_INCOMPLETE'));
    checkTrue('yields Pending Validation', d.normalCase.yields.classification === 'Pending Validation');
    checkTrue('no fabricated raffinate/extract totals', d.normalCase.componentBalance.raffinate === undefined);
    checkTrue('overall pending_validation', d.calculationRunStatus === 'pending_validation');
  }

  // ── 3. Explicit zero-loss assumptions ──
  console.log('── Explicit source-tagged zero-loss assumptions ──');
  {
    const inputs = baseInputs();
    (inputs.caseSplits as any).normal.solventCarryoverFraction = tag(0, 'Assumed', 'Screening assumption — zero NMP carryover, to be confirmed by settling test');
    (inputs.caseSplits as any).normal.oilLossToExtractFraction = tag(0, 'Assumed', 'Screening assumption — zero oil loss, to be confirmed by LLE data');
    const res = await engine.calculate(inputs, ctx);
    const d = res.data as any;
    const a = d.assumptions as any[];
    checkTrue('zero NMP loss stored as assumption', a.some(x => x.assumption.includes('Zero NMP loss to raffinate')));
    checkTrue('zero oil loss stored as assumption', a.some(x => x.assumption.includes('Zero oil loss to extract')));
    check('raffinate NMP = 0 under explicit assumption', d.normalCase.componentBalance.raffinate.nmp, 0, 1e-12);
    checkTrue('Assumed splits ⇒ balance Pending Validation', d.normalCase.componentBalance.classification === 'Pending Validation');
    checkTrue('ASSUMED_SPLIT_INPUT warning', res.warnings.some(w => w.code === 'ASSUMED_SPLIT_INPUT'));
  }

  // ── 4. Case independence — separate maximum-case splits, no silent reuse ──
  console.log('── Case independence ──');
  {
    const inputs = baseInputs();
    delete inputs.applyNormalSplitsToMaximumCase;
    const res = await engine.calculate(inputs, ctx);
    const d = res.data as any;
    checkTrue('no reuse without explicit option ⇒ max case Pending Validation', d.maximumCase.componentBalance.classification === 'Pending Validation');
    checkTrue('no CASE_SPLIT_ASSUMPTIONS_REUSED without option', !res.warnings.some(w => w.code === 'CASE_SPLIT_ASSUMPTIONS_REUSED'));

    const inputs2 = baseInputs();
    delete inputs2.applyNormalSplitsToMaximumCase;
    (inputs2.caseSplits as any).maximum = {
      soluteRecoveryToExtract: tag(0.88),
      solventCarryoverFraction: tag(0.03),
      oilLossToExtractFraction: tag(0.012),
    };
    const res2 = await engine.calculate(inputs2, ctx);
    const d2 = res2.data as any;
    check('max case own r: extract solute 0.88×1500', d2.maximumCase.componentBalance.extract.solute, 1320);
    check('max case own s_L: raffinate NMP 0.03×9000', d2.maximumCase.componentBalance.raffinate.nmp, 270);
    checkTrue('own max splits ⇒ Calculated Screening Result', d2.maximumCase.componentBalance.classification === 'Calculated Screening Result');
    check('normal case unchanged', d2.normalCase.componentBalance.raffinate.total, 3765);
  }

  // ── 5. PD-003 solvent-flow / ratio consistency ──
  console.log('── PD-003 consistency ──');
  {
    const ok = baseInputs();
    ok.solventFlow = 7500; // consistent with ratio 1.5 on 5000 kg/h
    const resOk = await engine.calculate(ok, ctx);
    const c = (resOk.data as any).solventFlowConsistency;
    checkTrue('consistency record stored', !!c && c.acceptanceTolerance === 0.001);
    check('implied ratio', c.impliedRatio, 1.5);
    checkTrue('consistent pair accepted', resOk.status !== 'error');

    const bad = baseInputs();
    bad.solventFlow = 7600; // implied 1.52 vs 1.5 → 1.33 % > 0.1 %
    const resBad = await engine.calculate(bad, ctx);
    checkTrue('inconsistent pair rejected', resBad.status === 'error');
    checkTrue('blocked status recorded', (resBad.data as any).calculationRunStatus === 'calculation_blocked');
    checkTrue('both entered values recorded on rejection', (resBad.data as any).solventFlowConsistency.enteredSolventFlow_kg_h === 7600);
  }

  // ── 6. Phase assignment independent of density ordering ──
  console.log('── Phase assignment vs density ordering ──');
  {
    // Heavy feed (denser than NMP), same continuity input
    const heavy = baseInputs();
    (heavy.feedDensity as any).value = 1100;
    const res = await engine.calculate(heavy, ctx);
    const p = (res.data as any).phaseConfiguration;
    checkTrue('continuity still from input (NMP continuous)', p.continuousPhase === 'NMP' && p.dispersedPhase === 'RRBO');
    checkTrue('lighter phase now NMP', p.lighterPhase === 'NMP' && p.heavierPhase === 'RRBO');

    const light = baseInputs();
    (light.phaseConfiguration as any) = 'rrbo_continuous_nmp_dispersed';
    const res2 = await engine.calculate(light, ctx);
    const p2 = (res2.data as any).phaseConfiguration;
    checkTrue('RRBO-continuous honoured though RRBO is lighter', p2.continuousPhase === 'RRBO' && p2.lighterPhase === 'RRBO');
  }

  // ── 7. PD-008 extraction factor (definition only) ──
  console.log('── PD-008 extraction factor ──');
  {
    const inputs = baseInputs();
    inputs.distributionRatio = {
      value: 1.8, numeratorPhase: 'extract (NMP) phase', denominatorPhase: 'raffinate (oil) phase',
      concentrationBasis: 'mass ratio, solute-free', temperatureC: 60,
      sourceType: 'Measured', sourceReference: 'Thermopac LLE screening test LT-2026-002',
    };
    const res = await engine.calculate(inputs, ctx);
    const A = (res.data as any).extractionFactor;
    check('A = 1.8 × 7500/5000', A.value, 2.7);
    checkTrue('symbol A (not E/ε)', A.symbol === 'A');
    checkTrue('complete basis ⇒ Calculated Screening Result', A.classification === 'Calculated Screening Result');
    checkTrue('definition disclaims recovery prediction', String(A.definition).includes('NOT used to predict recovery'));

    const incomplete = baseInputs();
    incomplete.distributionRatio = { value: 1.8, sourceType: 'Measured', sourceReference: 'LT-2026-002' };
    const res2 = await engine.calculate(incomplete, ctx);
    const A2 = (res2.data as any).extractionFactor;
    checkTrue('incomplete equilibrium basis ⇒ Pending Validation', A2.classification === 'Pending Validation');
    checkTrue('missing metadata listed', (A2.missingMetadata as string[]).includes('concentrationBasis'));
    checkTrue('basis-incomplete warning', res2.warnings.some(w => w.code === 'DISTRIBUTION_RATIO_BASIS_INCOMPLETE'));
  }

  // ── 8. Invalid-input rejection ──
  console.log('── Invalid inputs ──');
  {
    const cases: Array<[string, (i: Record<string, unknown>) => void]> = [
      ['missing operatingTemperature', i => { delete i.operatingTemperature; }],
      ['missing feedFlow', i => { delete i.feedFlow; }],
      ['zero feed flow', i => { i.feedFlow = { value: 0, basis: 'mass' }; }],
      ['bad feed basis', i => { i.feedFlow = { value: 5000, basis: 'molar' }; }],
      ['missing feedDensity', i => { delete i.feedDensity; }],
      ['feedDensity without sourceReference', i => { (i.feedDensity as any).sourceReference = ''; }],
      ['missing solvent basis', i => { delete i.solventToOilRatio; }],
      ['negative ratio', i => { i.solventToOilRatio = -1; }],
      ['missing maxCirculationFactor', i => { delete i.maxCirculationFactor; }],
      ['maxCirculationFactor < 1', i => { i.maxCirculationFactor = 0.9; }],
      ['invalid phaseConfiguration', i => { i.phaseConfiguration = 'oil_dispersed'; }],
      ['non-integer stages', i => { i.theoreticalStages = 5.5; }],
      ['efficiency 0', i => { i.compartmentOrStageEfficiency = 0; }],
      ['efficiency > 1', i => { i.compartmentOrStageEfficiency = 1.2; }],
      ['x_F = 1 rejected', i => { i.soluteMassFractionInFeed = tag(1); }],
      ['split without sourceType', i => { (i.caseSplits as any).normal.soluteRecoveryToExtract = { value: 0.9, sourceReference: 'x' }; }],
      ['split > 1 rejected', i => { (i.caseSplits as any).normal.solventCarryoverFraction = tag(1.2); }],
    ];
    for (const [name, mutate] of cases) {
      const i = baseInputs();
      mutate(i);
      const v = engine.validate(i);
      checkTrue(`rejects: ${name}`, !v.valid);
      // calculate() must self-gate: blocked status, no NaN output, even if the
      // caller skipped validate().
      const res = await engine.calculate(i, ctx);
      checkTrue(`calculate blocked: ${name}`,
        res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked'
        && !JSON.stringify(res.data).includes('NaN'));
    }
    // Distribution ratio with complete phase/basis/temperature but missing provenance
    checkTrue('distributionRatio without provenance rejected end-to-end', await (async () => {
      const i = baseInputs();
      i.distributionRatio = { value: 1.8, numeratorPhase: 'extract', denominatorPhase: 'raffinate', concentrationBasis: 'mass ratio', temperatureC: 60 };
      const v = engine.validate(i);
      const res = await engine.calculate(i, ctx);
      return !v.valid && res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked';
    })());
    checkTrue('warns maxCirculationFactor outside 1.1–1.5', (() => {
      const i = baseInputs(); i.maxCirculationFactor = 2.0;
      const v = engine.validate(i);
      return v.valid && v.errors.some(e => e.severity === 'warning' && e.field === 'maxCirculationFactor');
    })());
  }

  console.log(`\n═══ RESULT: ${pass} passed, ${fail} failed ═══`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
