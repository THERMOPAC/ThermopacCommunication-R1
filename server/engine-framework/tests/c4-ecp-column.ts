// ═══════════════════════════════════════════════════════════════════════════════
// Stage C4 Validation Suite — Common Packed-Column Engine (ECP-type)
// Run: npx tsx server/engine-framework/tests/c4-ecp-column.ts
// ═══════════════════════════════════════════════════════════════════════════════

import { LLXECPEngine } from '../../engines/llx/llx-ecp-engine';
import { getProperty } from '../epd/database';
import { registerPacking, clearPackingRegistry, evaluatePerformanceBasis, PackingRecord } from '../packing/database';
import { GenericOpenAreaDistributorModule } from '../packing/distributors';

let passed = 0; let failed = 0;
function checkTrue(name: string, cond: boolean, extra?: unknown): void {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`); }
}
function check(name: string, actual: number, expected: number, tol = 1e-9): void {
  const ok = Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected));
  if (ok) { passed++; console.log(`  ✅ ${name}: ${actual}`); }
  else { failed++; console.log(`  ❌ ${name}: got ${actual}, expected ${expected} ± ${tol}`); }
}

const T = 60;
const ctx = { revisionId: 1, designId: 1, moduleType: 'llx', userId: 1 } as never;
const engine = new LLXECPEngine();

const tag = (value: number, unit: string, sourceType = 'Vendor', sourceReference = 'VH-77-ECP') => ({ value, unit, sourceType, sourceReference });

function vendorPacking(overrides: Partial<PackingRecord> = {}): PackingRecord {
  return {
    id: 'generic-structured-250-vh77',
    manufacturer: 'Generic Vendor',
    productFamily: 'Structured 250',
    productName: 'GSP-250',
    packingType: 'structured sheet-metal',
    geometryClass: 'structured',
    material: 'SS316L',
    size: tag(250, 'mm') as never,
    specificSurfaceArea: tag(250, 'm2/m3') as never,
    voidFraction: tag(0.975, '-') as never,
    hydraulicCapacityData: { kind: 'constant', value: 30, unit: 'm3/(m2.h)', applicabilityNote: 'Vendor datasheet basis: RRBO/NMP-class LLE system, moderate IFT', sourceType: 'Vendor', sourceReference: 'VH-77-ECP' } as never,
    pressureDropData: {
      wet: { kind: 'table', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: 'Pa/m', points: [{ x: 10, y: 50 }, { x: 20, y: 120 }, { x: 30, y: 250 }], sourceType: 'Vendor', sourceReference: 'VH-77-ECP dP curve' } as never,
    },
    minimumWettingRate: tag(5, 'm3/(m2.h)') as never,
    vendorNotes: 'Generic screening record for suite',
    source: 'VH-77-ECP datasheet',
    revision: 'Rev 0',
    ...overrides,
  };
}

function baseInputs(): Record<string, unknown> {
  return {
    operatingTemperature: T,
    normalCase: { rrboMassFlow_kg_h: 5000, nmpMassFlow_kg_h: 7500 },
    maximumCase: { rrboMassFlow_kg_h: 5000, nmpMassFlow_kg_h: 9000 },
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    feedDensity: { value: 895, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'LR-2026-011' },
    feedViscosity: { value: 0.012, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'LR-2026-012' },
    packing: vendorPacking(),
    heightBasis: 'HETS',
    theoreticalStages: 6,
    hets: { value: 0.45, unit: 'm', operatingTemperatureC: T, solvent: 'NMP', feed: 'RRBO', packing: 'GSP-250', sourceType: 'Vendor', sourceReference: 'VH-77 HETS quote' },
    distributor: {
      distributorType: 'ladder',
      freeAreaFraction: tag(0.02, '-'),
      holeVelocityLimits: { min: tag(0.05, 'm/s'), max: tag(0.30, 'm/s') },
      maxCapacity: tag(50, 'm3/h'),
    },
    topHeadHeight: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    topDisengagementHeight: tag(0.8, 'm', 'Assumed', 'Screening allowance'),
    topDistributorAllowance: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    packingSupportAllowance: tag(0.15, 'm', 'Assumed', 'Screening allowance'),
    holdDownAllowance: tag(0.1, 'm', 'Assumed', 'Screening allowance'),
    bottomDistributorAllowance: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    bottomDisengagementHeight: tag(1.0, 'm', 'Assumed', 'Screening allowance'),
    bottomHeadHeight: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    diameterValues: [1.0],
    selectedTrialDiameter: 1.0,
  };
}

async function main() {
  console.log('═══ Stage C4 — ECP-Type Packed Column Engine Validation ═══');
  const rhoNMP = getProperty('nmp', 'density', T).value;

  // ── 1. Hand-calc benchmark at D = 1.0 m ──
  console.log('── Hand-calculation benchmark (D = 1.0 m) ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    const d = res.data as never as Record<string, any>;
    checkTrue('run not blocked', res.status !== 'error', res.validationIssues);
    const row = d.normalCase.diameters[0];
    const A = Math.PI / 4;
    check('area = πD²/4', row.area.result, A);
    const qD = 5000 / 895; const qC = 7500 / rhoNMP;
    check('dispersed load', row.loads.dispersed.result, qD / A, 1e-9);
    check('continuous load', row.loads.continuous.result, qC / A, 1e-9);
    const loadTot = (qD + qC) / A;
    check('total load ≈ 16.6', row.loads.total.result, loadTot, 1e-9);
    check('ECP utilization % (normal)', row.ecpHydraulicUtilization.result, (loadTot / 30) * 100, 1e-9);
    checkTrue('normal within screening band', row.feasibility === 'within_screening_band', row.feasibility);
    const rowMax = d.maximumCase.diameters[0];
    const loadTotMax = (qD + 9000 / rhoNMP) / A;
    check('ECP utilization % (maximum)', rowMax.ecpHydraulicUtilization.result, (loadTotMax / 30) * 100, 1e-9);
    checkTrue('minimum wetting ok', row.minimumWettingStatus.result === 'ok');
    // distributor
    const v = (qD / 3600) / (A * 0.02);
    check('distributor open-area velocity', row.distributor.openAreaVelocity.result, v, 1e-9);
    checkTrue('distributor within vendor window', row.distributor.overallStatus === 'ok', row.distributor);
    // packing height & Δp
    check('packing height = 6 × 0.45', d.packingHeight.result, 2.7);
    const dpm = 50 + (120 - 50) * (loadTot - 10) / 10;
    check('Δp/m interpolated', row.pressureDrop.perMeter.result, dpm, 1e-9);
    check('Δp total = Δp/m × H', row.pressureDrop.total.result, dpm * 2.7, 1e-9);
    // heights
    check('total T/T', d.heightBreakdown.totalTangentToTangent.result, 0.8 + 0.5 + 2.7 + 0.15 + 0.1 + 0.5 + 1.0, 1e-9);
    check('overall vessel = T/T + heads', d.heightBreakdown.overallVesselHeight.result, 5.75 + 1.0, 1e-9);
    checkTrue('run pending (Assumed allowances)', d.calculationRunStatus === 'pending_validation');
    // rich items (refinement 8)
    const it = row.ecpHydraulicUtilization;
    checkTrue('rich item: units/source/status/validation/warnings/formulaReference/engineVersion',
      it.units === '%' && typeof it.source === 'string' && typeof it.status === 'string' && typeof it.validation === 'string' && Array.isArray(it.warnings) && it.formulaReference === 'ECP-002' && it.engineVersion === '1.1.0');
    // versions & applicability
    const v5 = d.engineVersions;
    checkTrue('CEL/EPD/C2/C3/ECP versions recorded', !!(v5.cel && v5.epd && v5.processDesign && v5.hydraulicsCommon && v5.ecpPackedColumn));
    checkTrue('applicability statement present', d.applicabilityStatement.includes('NOT VENDOR RATING AND NOT FOR FABRICATION'));
    checkTrue('7 limitations present', Array.isArray(d.limitations) && d.limitations.length === 7);
    // rate-based placeholders (refinement 4)
    const rb = d.rateBasedPlaceholders;
    checkTrue('HTU/NTU/Ka/interfacialArea reserved as null', rb.htu === null && rb.ntu === null && rb.ka === null && rb.interfacialArea === null);
    // dry/wet separation (refinement 5; v1.1.0: dry preliminary prediction implemented — ECP-009)
    checkTrue('wet applied, dry preliminary (ECP-009)', d.pressureDropArchitecture.wetApplied === true && d.pressureDropArchitecture.dryReserved === false && d.pressureDropArchitecture.dryPreliminaryImplemented === true);
    // ECP-009/ECP-010 single-phase frictional framework (v1.1.0)
    const sp = row.singlePhaseFrictional;
    checkTrue('ECP-009 present with classification', sp && sp.classification === 'Preliminary Pressure Drop Prediction — Pending RRBO/NMP Validation');
    check('ECP-009 d_h = 4/a', d.dryPressureDropPrediction.hydraulicDiameter.result, 4 / 250, 1e-12);
    checkTrue('ECP-009 Re/F_v/u_s calculated', typeof sp.phaseReynolds.result === 'number' && typeof sp.phaseLoadFactor.result === 'number' && typeof sp.superficialVelocity.result === 'number');
    checkTrue('ECP-009 c_f Not Calculable without tagged basis', sp.frictionFactor.status === 'Not Calculable' && sp.dryPressureDrop.status === 'Not Calculable');
    checkTrue('ECP-009 pipe reference never a packing c_f', sp.laminarPipeReferenceFrictionFactor.validation.includes('REFERENCE ONLY'));
    checkTrue('ECP-010 verification present with range statement', d.dryPressureDropVerification && String(d.dryPressureDropVerification.validatedRangeStatement).includes('OUTSIDE'));
    const DPC = 'Preliminary Pressure Drop Prediction — Pending RRBO/NMP Validation';
    checkTrue('mandated classification on every pressure-drop quantity (incl. Not Calculable)',
      sp.frictionFactor.pressureDropClassification === DPC && sp.dryPressureDrop.pressureDropClassification === DPC
      && d.dryPressureDropVerification.backCalculatedFrictionFactor.pressureDropClassification === DPC);
    // vendor neutrality (refinement 9): no vendor brand names in engine strings
    const json = JSON.stringify(d).toLowerCase();
    checkTrue('no C3 generic-throughput reuse in output', !json.includes('generichydraulicthroughput'));
    checkTrue('trial diameter echoed, not recommended', d.normalCase.summary.selectedTrialDiameter_m === 1.0 && d.normalCase.summary.selectedTrialDiameterNote.includes('not engine-recommended'));
    checkTrue('no recommendation key anywhere', !json.includes('recommendeddiameter'));
    // height breakdown labels (refinement 7)
    const labels = d.heightBreakdown.lines.map((l: any) => l.label);
    checkTrue('height lines include heads + bed + support + distributors', ['Top Head', 'Top Disengagement', 'Top Distributor', 'Packing Bed 1', 'Packing Support', 'Bottom Distributor', 'Bottom Disengagement', 'Bottom Head'].every((l) => labels.includes(l)), labels);
  }

  // ── 2. Independent normal and maximum cases ──
  console.log('── Independent normal and maximum cases ──');
  {
    const i = baseInputs();
    (i.maximumCase as any).nmpMassFlow_kg_h = 12000;
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    const un = d.normalCase.diameters[0].ecpHydraulicUtilization.result;
    const um = d.maximumCase.diameters[0].ecpHydraulicUtilization.result;
    checkTrue('maximum utilization > normal utilization', um > un, { un, um });
    check('normal unchanged by maximum case', un, ((5000 / 895 + 7500 / rhoNMP) / (Math.PI / 4) / 30) * 100, 1e-9);
  }

  // ── 3. Missing packing capacity data → Pending Validation, not blocked ──
  console.log('── Missing Vendor Packing Capacity ──');
  {
    const i = baseInputs();
    i.packing = vendorPacking({ hydraulicCapacityData: undefined });
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('run not blocked', res.status !== 'error');
    const row = d.normalCase.diameters[0];
    checkTrue('utilization Pending Validation', row.ecpHydraulicUtilization.status === 'Pending Validation');
    checkTrue('feasibility pending_validation', row.feasibility === 'pending_validation');
    checkTrue('NO_VENDOR_CAPACITY_DATA warning', res.warnings.some((w) => w.code === 'NO_VENDOR_CAPACITY_DATA'));
    checkTrue('loads still calculated', typeof row.loads.total.result === 'number');
    checkTrue('packing height still calculated', typeof d.packingHeight.result === 'number');
    checkTrue('run pending_validation', d.calculationRunStatus === 'pending_validation');
  }

  // ── 4. Missing / Assumed HETS ──
  console.log('── HETS governance ──');
  {
    const i = baseInputs();
    delete i.hets;
    const res = await engine.calculate(i, ctx);
    checkTrue('missing HETS blocks (never defaulted)', res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked');

    const j = baseInputs();
    (j.hets as any).sourceType = 'Assumed';
    const res2 = await engine.calculate(j, ctx);
    const d2 = res2.data as any;
    checkTrue('Assumed HETS → packing height Pending Validation', d2.packingHeight.status === 'Pending Validation');
    checkTrue('Assumed HETS in assumptions register', d2.assumptions.some((a: any) => a.assumption.includes('HETS')));

    const k = baseInputs();
    k.heightBasis = 'HTU_NTU';
    const res3 = await engine.calculate(k, ctx);
    checkTrue('HTU_NTU rejected as reserved path', res3.status === 'error' && res3.validationIssues.some((e) => e.message.includes('reserved')));

    // HETS is system data — mismatch warnings
    const m = baseInputs();
    (m.hets as any).packing = 'OtherPack-500';
    const res4 = await engine.calculate(m, ctx);
    checkTrue('HETS packing mismatch warning', res4.warnings.some((w) => w.code === 'HETS_PACKING_MISMATCH'));
    const n = baseInputs();
    (n.hets as any).operatingTemperatureC = 20;
    const res5 = await engine.calculate(n, ctx);
    checkTrue('HETS temperature mismatch warning', res5.warnings.some((w) => w.code === 'HETS_TEMPERATURE_MISMATCH'));
  }

  // ── 5. Pressure drop: missing basis & extrapolation refusal ──
  console.log('── Pressure drop governance ──');
  {
    const i = baseInputs();
    i.packing = vendorPacking({ pressureDropData: undefined });
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('missing Δp basis → Not Calculable', row.pressureDrop.status === 'Not Calculable');
    checkTrue('utilization unaffected', typeof row.ecpHydraulicUtilization.result === 'number');
    checkTrue('height unaffected', typeof (res.data as any).heightBreakdown.totalTangentToTangent.result === 'number');

    // load below table range → extrapolation refused
    const j = baseInputs();
    j.diameterValues = [2.5]; // total load ≈ 2.66 < 10
    delete j.selectedTrialDiameter;
    const res2 = await engine.calculate(j, ctx);
    const row2 = (res2.data as any).normalCase.diameters[0];
    checkTrue('Δp extrapolation refused below data range', row2.pressureDrop.status === 'Not Calculable' && res2.warnings.some((w) => w.code === 'PRESSURE_DROP_OUT_OF_DATA_RANGE'));
  }

  // ── 6. Curve architecture: polynomial + capacity curve out-of-range ──
  console.log('── Performance-curve architecture ──');
  {
    const poly = { kind: 'polynomial', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: 'Pa/m', coefficients: [10, 2, 0.5], validRange: { min: 5, max: 40 }, sourceType: 'Vendor', sourceReference: 'VH-77 poly fit' };
    const ev = evaluatePerformanceBasis(poly as never, 10);
    check('polynomial fit evaluates 10+2x+0.5x² at x=10', ev.value!, 10 + 20 + 50);
    const evOut = evaluatePerformanceBasis(poly as never, 50);
    checkTrue('polynomial extrapolation refused', !evOut.ok && evOut.reason!.includes('refused'));

    // capacity as curve vs dispersed/continuous flow ratio — out of range → Not Calculable
    const i = baseInputs();
    i.packing = vendorPacking({
      hydraulicCapacityData: { kind: 'table', independentVariable: 'flowRatioDispersedToContinuous', independentUnit: '-', dependentUnit: 'm3/(m2.h)', points: [{ x: 0.9, y: 32 }, { x: 1.1, y: 28 }], sourceType: 'Vendor', sourceReference: 'VH-77 capacity curve' } as never,
    });
    const res = await engine.calculate(i, ctx); // flow ratio ≈ 0.748 < 0.9 → refused
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('capacity curve out of range → utilization Not Calculable', row.ecpHydraulicUtilization.status === 'Not Calculable');
    checkTrue('VENDOR_CAPACITY_OUT_OF_DATA_RANGE warning', res.warnings.some((w) => w.code === 'VENDOR_CAPACITY_OUT_OF_DATA_RANGE'));
  }

  // ── 7. Distributor checks ──
  console.log('── Distributor checks (modular) ──');
  {
    // velocity below window at large diameter
    const i = baseInputs();
    i.diameterValues = [2.0];
    delete i.selectedTrialDiameter;
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('open-area velocity below vendor window flagged', row.distributor.overallStatus === 'outside_vendor_limits' && row.distributor.openAreaVelocity.warnings.length > 0);
    checkTrue('distributor sub-checks are rich items', row.distributor.openAreaVelocity.formulaReference === 'ECP-004' && row.distributor.openAreaVelocity.engineVersion === '1.1.0');
    checkTrue('DISTRIBUTOR_OUTSIDE_VENDOR_LIMITS warning', res.warnings.some((w) => w.code === 'DISTRIBUTOR_OUTSIDE_VENDOR_LIMITS'));

    // capacity exceeded
    const j = baseInputs();
    (j.distributor as any).maxCapacity = tag(10, 'm3/h');
    const res2 = await engine.calculate(j, ctx);
    const row2 = (res2.data as any).normalCase.diameters[0];
    checkTrue('vendor capacity exceeded flagged', row2.distributor.vendorCapacity.warnings.length > 0 && row2.distributor.overallStatus === 'outside_vendor_limits');

    // no distributor data → Not Calculable, run proceeds
    const k = baseInputs();
    delete k.distributor;
    const res3 = await engine.calculate(k, ctx);
    const row3 = (res3.data as any).normalCase.diameters[0];
    checkTrue('no distributor spec → Not Calculable', row3.distributor.status === 'Not Calculable');
    checkTrue('run proceeds without distributor', typeof row3.ecpHydraulicUtilization.result === 'number');

    // module interface is pluggable
    const mod = new GenericOpenAreaDistributorModule();
    checkTrue('generic module supports any type', mod.supports('orifice_pan') && mod.supports('chimney_tray'));
  }

  // ── 8. Minimum wetting failure ──
  console.log('── Minimum wetting ──');
  {
    const i = baseInputs();
    i.packing = vendorPacking({ minimumWettingRate: tag(15, 'm3/(m2.h)') as never }); // L_c ≈ 9.5 < 15
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('below minimum wetting flagged', row.minimumWettingStatus.result === 'below_minimum_wetting');
    checkTrue('BELOW_MINIMUM_WETTING warning', res.warnings.some((w) => w.code === 'BELOW_MINIMUM_WETTING'));

    const j = baseInputs();
    j.packing = vendorPacking({ minimumWettingRate: undefined });
    const res2 = await engine.calculate(j, ctx);
    checkTrue('no wetting datum → Not Calculable (never assumed)', (res2.data as any).normalCase.diameters[0].minimumWettingStatus.status === 'Not Calculable');
  }

  // ── 9. Assumed vendor data → Pending Validation ──
  console.log('── Assumed data governance ──');
  {
    const i = baseInputs();
    i.packing = vendorPacking({ hydraulicCapacityData: { kind: 'constant', value: 30, unit: 'm3/(m2.h)', applicabilityNote: 'engineer estimate', sourceType: 'Assumed', sourceReference: 'screening guess' } as never });
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('Assumed capacity → utilization Pending Validation', d.normalCase.diameters[0].ecpHydraulicUtilization.status === 'Pending Validation');
    checkTrue('Assumed packing data in assumptions register', d.assumptions.some((a: any) => a.assumption.includes('Assumed data')));
    checkTrue('run pending_validation', d.calculationRunStatus === 'pending_validation');

    const j = baseInputs();
    (j as any).systemDeratingFactor = { value: 0.8, unit: '-', sourceType: 'Assumed', sourceReference: 'estimate' };
    const res2 = await engine.calculate(j, ctx);
    checkTrue('Assumed derating → utilization Pending Validation', (res2.data as any).normalCase.diameters[0].ecpHydraulicUtilization.status === 'Pending Validation');

    // no derating supplied → warning, never invented
    const res3 = await engine.calculate(baseInputs(), ctx);
    checkTrue('NO_SYSTEM_DERATING_DATA warning when factor absent', res3.warnings.some((w) => w.code === 'NO_SYSTEM_DERATING_DATA'));
  }

  // ── 10. Packing Database separation (refinement 1) ──
  console.log('── Packing Database separation ──');
  {
    clearPackingRegistry();
    const issues = registerPacking(vendorPacking());
    checkTrue('valid record registers cleanly', issues.length === 0, issues);
    const i = baseInputs();
    delete i.packing;
    i.packingId = 'generic-structured-250-vh77';
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('engine consumes record from Packing Database', res.status !== 'error' && d.designBasis.packing.consumedFrom.includes('Packing Database'));

    const j = baseInputs();
    delete j.packing;
    j.packingId = 'not-registered';
    const res2 = await engine.calculate(j, ctx);
    checkTrue('unknown packingId blocked', res2.status === 'error');

    const k = baseInputs();
    k.packingId = 'generic-structured-250-vh77'; // both given
    const res3 = await engine.calculate(k, ctx);
    checkTrue('packingId + inline record rejected', res3.status === 'error');

    const badIssues = registerPacking(vendorPacking({ voidFraction: tag(1.5, '-') as never }));
    checkTrue('invalid record refused by database validation', badIssues.length > 0);

    // registry immutability — mutating the source record after registration has no effect
    clearPackingRegistry();
    const mutable = vendorPacking();
    registerPacking(mutable);
    (mutable.hydraulicCapacityData as any).value = 999;
    const m2 = baseInputs();
    delete m2.packing;
    m2.packingId = mutable.id;
    const resIm = await engine.calculate(m2, ctx);
    const utilIm = (resIm.data as any).normalCase.diameters[0].ecpHydraulicUtilization.result;
    checkTrue('registered record immune to caller mutation', Math.abs(utilIm - ((5000 / 895 + 7500 / getProperty('nmp', 'density', T).value) / (Math.PI / 4) / 30) * 100) < 1e-9, utilIm);

    // malformed performance data refused by database validation
    const nfIssues = registerPacking(vendorPacking({ id: 'bad-nf', pressureDropData: { wet: { kind: 'table', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: 'Pa/m', points: [{ x: 10, y: NaN }, { x: 20, y: 120 }], sourceType: 'Vendor', sourceReference: 'bad' } as never } }));
    checkTrue('non-finite table point refused', nfIssues.length > 0, nfIssues);
    const polyIssues = registerPacking(vendorPacking({ id: 'bad-poly', hydraulicCapacityData: { kind: 'polynomial', independentVariable: 'flowRatioDispersedToContinuous', independentUnit: '-', dependentUnit: 'm3/(m2.h)', coefficients: [30, NaN], validRange: { min: 0, max: 2 }, sourceType: 'Vendor', sourceReference: 'bad' } as never }));
    checkTrue('non-finite polynomial coefficient refused', polyIssues.length > 0);

    // curve-variable semantics enforced by the engine
    const wrongVar = baseInputs();
    wrongVar.packing = vendorPacking({ hydraulicCapacityData: { kind: 'table', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: 'm3/(m2.h)', points: [{ x: 5, y: 32 }, { x: 30, y: 25 }], sourceType: 'Vendor', sourceReference: 'wrong basis' } as never });
    checkTrue('capacity curve vs wrong variable blocked', (await engine.calculate(wrongVar, ctx)).status === 'error');
    clearPackingRegistry();
  }

  // ── 11. Bed split & redistributors ──
  console.log('── Bed split & redistributors ──');
  {
    const i = baseInputs();
    i.packing = vendorPacking({ maximumBedHeight: tag(1.0, 'm') as never });
    const res = await engine.calculate(i, ctx); // H = 2.7 → 3 beds, 2 redistributors — allowance missing → blocked
    checkTrue('bed split without redistributorAllowance blocked', res.status === 'error' && res.validationIssues.some((e) => e.field === 'redistributorAllowance'));

    const j = baseInputs();
    j.packing = vendorPacking({ maximumBedHeight: tag(1.0, 'm') as never });
    (j as any).redistributorAllowance = tag(0.6, 'm');
    const res2 = await engine.calculate(j, ctx);
    const d2 = res2.data as any;
    checkTrue('3 beds of 0.9 m', d2.bedArrangement.beds.length === 3 && Math.abs(d2.bedArrangement.beds[0].height_m - 0.9) < 1e-9);
    checkTrue('2 redistributors', d2.bedArrangement.redistributors === 2);
    check('T/T includes 2 × 0.6 m redistributors', d2.heightBreakdown.totalTangentToTangent.result, 5.75 + 1.2, 1e-9);
    const labels = d2.heightBreakdown.lines.map((l: any) => l.label);
    checkTrue('lines: Bed 1, Redistributor 1, Bed 2, Redistributor 2, Bed 3', ['Packing Bed 1', 'Redistributor 1', 'Packing Bed 2', 'Redistributor 2', 'Packing Bed 3'].every((l) => labels.includes(l)));

    const res3 = await engine.calculate(baseInputs(), ctx);
    checkTrue('no vendor bed limit → NO_BED_HEIGHT_LIMIT_DATA warning', res3.warnings.some((w) => w.code === 'NO_BED_HEIGHT_LIMIT_DATA'));
  }

  // ── 12. Diameter paths & band classification ──
  console.log('── Diameter paths & classification ──');
  {
    const i = baseInputs();
    delete i.diameterValues;
    i.diameterSweep = { min: 0.6, max: 1.6, step: 0.2 };
    delete i.selectedTrialDiameter;
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    const feas = d.normalCase.diameters.map((r: any) => [r.diameter_m, r.feasibility]);
    checkTrue('D=0.6 infeasible (>100 %)', d.normalCase.summary.hydraulicallyInfeasibleDiameters_m.includes(0.6), feas);
    checkTrue('D=0.8 above band', d.normalCase.summary.aboveScreeningBandDiameters_m.includes(0.8), feas);
    checkTrue('D=1.0 within band', d.normalCase.summary.withinScreeningBandDiameters_m.includes(1), feas);
    checkTrue('large D below minimum loading band', d.normalCase.summary.belowMinimumLoadingBandDiameters_m.length > 0, feas);
    checkTrue('no trial diameter → explicit note', d.normalCase.summary.selectedTrialDiameter_m === null);

    // custom band reclassifies
    const j = baseInputs();
    delete j.diameterValues; delete j.selectedTrialDiameter;
    j.diameterSweep = { min: 0.6, max: 1.6, step: 0.2 };
    j.utilizationBandPercent = { min: 10, max: 95 };
    const res2 = await engine.calculate(j, ctx);
    const d2 = res2.data as any;
    checkTrue('custom band stored in snapshot', d2.designBasis.utilizationBandPercent.min === 10 && d2.designBasis.utilizationBandPercent.max === 95);
    checkTrue('custom band reclassifies D=0.8 within band', d2.normalCase.summary.withinScreeningBandDiameters_m.includes(0.8));

    // min = max rejected; both paths rejected
    const k = baseInputs();
    delete k.diameterValues;
    k.diameterSweep = { min: 1, max: 1, step: 0.2 };
    checkTrue('degenerate sweep min = max rejected', (await engine.calculate(k, ctx)).status === 'error');
    const m = baseInputs();
    m.diameterSweep = { min: 0.6, max: 1.6, step: 0.2 }; // + diameterValues from base
    checkTrue('sweep + values together rejected', (await engine.calculate(m, ctx)).status === 'error');
  }

  // ── 13. Blocked-input matrix ──
  console.log('── Blocked inputs (never defaulted, never NaN) ──');
  {
    const cases: [string, (i: Record<string, unknown>) => void][] = [
      ['missing normalCase', (i) => { delete i.normalCase; }],
      ['missing maximumCase', (i) => { delete i.maximumCase; }],
      ['negative RRBO flow', (i) => { (i.normalCase as any).rrboMassFlow_kg_h = -5; }],
      ['missing packing definition', (i) => { delete i.packing; }],
      ['invalid phase configuration', (i) => { i.phaseConfiguration = 'oil_continuous'; }],
      ['missing feedDensity', (i) => { delete i.feedDensity; }],
      ['untagged HETS (no sourceReference)', (i) => { (i.hets as any).sourceReference = ''; }],
      ['HETS missing system context (no solvent)', (i) => { (i.hets as any).solvent = ''; }],
      ['missing theoreticalStages', (i) => { delete i.theoreticalStages; }],
      ['missing heightBasis', (i) => { delete i.heightBasis; }],
      ['missing topHeadHeight allowance', (i) => { delete i.topHeadHeight; }],
      ['missing bottomDisengagementHeight allowance', (i) => { delete i.bottomDisengagementHeight; }],
      ['untagged allowance (no sourceType)', (i) => { (i.holdDownAllowance as any).sourceType = undefined; }],
      ['packing voidFraction out of range', (i) => { i.packing = vendorPacking({ voidFraction: tag(0.3, '-') as never }); }],
      ['derating factor > 1 rejected', (i) => { (i as any).systemDeratingFactor = tag(1.4, '-'); }],
      ['empty diameterValues', (i) => { i.diameterValues = []; }],
    ];
    for (const [name, mutate] of cases) {
      const i = baseInputs();
      mutate(i);
      const res = await engine.calculate(i, ctx);
      const ok = res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked' && !JSON.stringify(res.data).includes('NaN');
      checkTrue(`blocked: ${name}`, ok, res.validationIssues.slice(0, 2));
    }
  }

  // ── 13b. ECP-009 friction-factor governance (v1.1.0) ──
  console.log('── ECP-009 friction-factor governance ──');
  {
    const DPC = 'Preliminary Pressure Drop Prediction — Pending RRBO/NMP Validation';
    // provenance gating: frictionFactorData without provenance is refused
    const noProv = registerPacking(vendorPacking({ id: 'ff-noprov', frictionFactorData: { kind: 'constant', dependentUnit: '-', value: 2.0, applicabilityNote: 'test', sourceType: 'Vendor', sourceReference: 'Vendor bulletin X' } as never }));
    checkTrue('frictionFactorData without provenance refused', noProv.some(i => i.field.includes('frictionFactorProvenance')));
    // provenance value outside the controlled set is refused
    const badProv = registerPacking(vendorPacking({ id: 'ff-badprov', frictionFactorData: { kind: 'constant', dependentUnit: '-', value: 2.0, applicabilityNote: 'test', sourceType: 'Vendor', sourceReference: 'Sulcol run' } as never, frictionFactorProvenance: 'vendor_software' as never }));
    checkTrue('vendor_software provenance refused', badProv.some(i => i.field.includes('frictionFactorProvenance')));
    // curve vs any variable other than phaseReynoldsNumber is refused
    const badVar = registerPacking(vendorPacking({ id: 'ff-badvar', frictionFactorProvenance: 'measured' as never, frictionFactorData: { kind: 'table', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: '-', points: [{ x: 1, y: 3 }, { x: 500, y: 1 }], sourceType: 'Measured', sourceReference: 'lab' } as never }));
    checkTrue('c_f curve vs non-Re variable refused', badVar.some(i => i.field.includes('independentVariable')));
    // supplied constant c_f: dry Δp computed and classified
    const okIssues = registerPacking(vendorPacking({ id: 'ff-const', frictionFactorProvenance: 'measured' as never, frictionFactorData: { kind: 'constant', dependentUnit: '-', value: 2.5, applicabilityNote: 'laminar range, test datum', sourceType: 'Measured', sourceReference: 'lab measurement M-1' } as never }));
    checkTrue('valid c_f record registers', okIssues.length === 0, okIssues);
    const iC = baseInputs(); delete iC.packing; (iC as any).packingId = 'ff-const';
    const rC = await engine.calculate(iC, ctx);
    const rowC = (rC.data as any).maximumCase.diameters[0];
    const spC = rowC.singlePhaseFrictional;
    // Δp/Δz = c_f·F_v²/(2·d_h) — eq. (6) equivalence, using the engine's own emitted F_v
    const expDpm = 2.5 * Math.pow(spC.phaseLoadFactor.result, 2) / (2 * (4 / 250));
    check('dry Δp/Δz = c_f·F_v²/(2·d_h) with supplied constant c_f', spC.dryPressureDrop.perMeter.result, expDpm, 1e-9);
    checkTrue('supplied c_f still only Pending Validation + mandated classification',
      spC.frictionFactor.status === 'Pending Validation' && spC.dryPressureDrop.perMeter.pressureDropClassification === DPC && spC.dryPressureDrop.total.pressureDropClassification === DPC);
    checkTrue('c_f source cites provenance', String(spC.frictionFactor.source).includes('provenance: measured'));
    // supplied c_f CURVE: out-of-range Re refused (no extrapolation)
    const curveReg = registerPacking(vendorPacking({ id: 'ff-curve', frictionFactorProvenance: 'controlled_literature' as never, frictionFactorData: { kind: 'table', independentVariable: 'phaseReynoldsNumber', independentUnit: '-', dependentUnit: '-', points: [{ x: 1, y: 30 }, { x: 10, y: 4 }], sourceType: 'Literature', sourceReference: 'controlled source C-1' } as never }));
    checkTrue('c_f curve record registers', curveReg.length === 0, curveReg);
    const iK = baseInputs(); delete iK.packing; (iK as any).packingId = 'ff-curve';
    const rK = await engine.calculate(iK, ctx);
    const spK = (rK.data as any).maximumCase.diameters[0].singlePhaseFrictional;
    checkTrue('c_f curve out-of-Re-range ⇒ Not Calculable (no extrapolation), classified', spK.frictionFactor.status === 'Not Calculable' && spK.dryPressureDrop.pressureDropClassification === DPC);
    // RRBO-continuous: continuous-phase viscosity must be the entered RRBO datum
    const iR = baseInputs(); (iR as any).phaseConfiguration = 'rrbo_continuous_nmp_dispersed';
    const rR = await engine.calculate(iR, ctx);
    const spR = (rR.data as any).maximumCase.diameters[0].singlePhaseFrictional;
    checkTrue('RRBO-continuous Re uses RRBO viscosity (lower Re than NMP-continuous)', String(spR.phaseReynolds.source).includes('η_c(RRBO)'));
  }

  // ── 14. Concurrency / property-context isolation ──
  console.log('── Concurrency & property-context isolation ──');
  {
    const runs = Array.from({ length: 10 }, (_, k) => {
      const i = baseInputs();
      (i.feedDensity as any).value = 880 + k * 5;
      return engine.calculate(i, ctx).then((r) => ({ k, rho: (r.data as any).designBasis.feedFluid.densityUsed.value }));
    });
    const results = await Promise.all(runs);
    checkTrue('10 concurrent runs each see their own RRBO density', results.every((r) => Math.abs(r.rho - (880 + r.k * 5)) < 1e-9), results);
    const shared = getProperty('nmp', 'density', T);
    checkTrue('shared NMP registry untouched', Math.abs(shared.value - rhoNMP) < 1e-12);
  }

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
