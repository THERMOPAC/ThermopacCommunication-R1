// ═══════════════════════════════════════════════════════════════════════════════
// Stage C5 Validation Suite — ECR-Type Kühni Agitated Extraction Column Engine
// Run: npx tsx server/engine-framework/tests/c5-ecr-column.ts
// ═══════════════════════════════════════════════════════════════════════════════

import { LLXECREngine } from '../../engines/llx/llx-ecr-engine';
import { getProperty } from '../epd/database';

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
const G = 9.80665;
const ctx = { revisionId: 1, designId: 1, moduleType: 'llx', userId: 1 } as never;
const engine = new LLXECREngine();
const tag = (value: number, unit: string, sourceType = 'Vendor', sourceReference = 'ECR-VD-01') => ({ value, unit, sourceType, sourceReference });

function baseInputs(): Record<string, unknown> {
  return {
    operatingTemperature: T,
    normalCase: { rrboMassFlow_kg_h: 5000, nmpMassFlow_kg_h: 7500 },
    maximumCase: { rrboMassFlow_kg_h: 5000, nmpMassFlow_kg_h: 9000 },
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    feedDensity: { value: 895, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'LR-2026-011' },
    feedViscosity: { value: 0.012, referenceTemperatureC: T, sourceType: 'Measured', sourceReference: 'LR-2026-012' },
    continuousPhaseViscosity: tag(0.0008, 'Pa.s', 'Vendor', 'NMP-lit-60C'),
    interfacialTension: tag(0.025, 'N/m', 'Measured', 'IFT-2026-03'),
    powerDensityBasis: 'volume_averaged',
    rotorType: 'shrouded turbine',
    rotorToColumnDiameterRatio: tag(0.5, '-'),
    rotorSpeed: tag(120, 'rpm'),
    powerNumber: tag(3.5, '-'),
    statorOpenAreaFraction: tag(0.25, '-'),
    theoreticalStages: 6,
    compartmentEfficiency: tag(0.4, '-'),
    compartmentHeight: tag(0.25, 'm'),
    shaftEfficiency: tag(0.95, '-'),
    mechanicalDesignMargin: tag(1.2, '-'),
    maxAllowableTipSpeed: tag(4.0, 'm/s'),
    preferredTipSpeedRange: { min: tag(1.5, 'm/s'), max: tag(3.5, 'm/s') },
    maxAllowableShaftPower: tag(30, 'kW'),
    vendorHydraulicCapacity: { kind: 'constant', value: 30, unit: 'm3/(m2.h)', applicabilityNote: 'Vendor datasheet basis: RRBO/NMP-class agitated LLE service', sourceType: 'Vendor', sourceReference: 'ECR-VD-01' },
    topHeadHeight: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    topDisengagementHeight: tag(0.8, 'm', 'Assumed', 'Screening allowance'),
    topDistributorAllowance: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    bottomDistributorAllowance: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    bottomDisengagementHeight: tag(1.0, 'm', 'Assumed', 'Screening allowance'),
    bottomHeadHeight: tag(0.5, 'm', 'Assumed', 'Screening allowance'),
    driveSealBearingAllowance: tag(0.6, 'm', 'Assumed', 'Screening allowance'),
    diameterValues: [1.0],
    selectedTrialDiameter: 1.0,
  };
}

async function main() {
  console.log('═══ Stage C5 — ECR-Type Agitated Column Engine Validation ═══');
  const rhoNMP = getProperty('nmp', 'density', T).value;
  const A = Math.PI / 4;
  const qD = 5000 / 895; const qC = 7500 / rhoNMP;
  const loadTot = (qD + qC) / A;
  const rhoMix = 12500 / (qD + qC);

  // ── 1. Hand-calc benchmark (plan §6) ──
  console.log('── Hand-calculation benchmark (D = 1.0 m) ──');
  {
    const res = await engine.calculate(baseInputs(), ctx);
    checkTrue('run not blocked', res.status !== 'error', res.validationIssues);
    const d = res.data as any;
    const row = d.normalCase.diameters[0];
    check('area', row.area.result, A);
    check('total load ≈ 16.62', row.loads.total.result, loadTot, 1e-9);
    check('superficial u_c (m/s)', row.loads.superficialVelocities.continuous_m_s.result, qC / A / 3600, 1e-9);
    check('utilization (normal) ≈ 55.4 %', row.ecrHydraulicUtilization.result, (loadTot / 30) * 100, 1e-9);
    const loadTotMax = (qD + 9000 / rhoNMP) / A;
    check('utilization (maximum) ≈ 61.7 %', d.maximumCase.diameters[0].ecrHydraulicUtilization.result, (loadTotMax / 30) * 100, 1e-9);
    checkTrue('within screening band', row.feasibility === 'within_screening_band');
    // stator & rotor region
    check('stator velocity 0.01847 m/s', row.statorFreeAreaVelocity.result, (qD + qC) / 3600 / (A * 0.25), 1e-9);
    check('rotor swept loading 66.47', row.rotorSweptAreaLoading.result, (qD + qC) / (Math.PI * 0.25 / 4), 1e-9);
    // rotor
    check('rotor diameter from ratio', row.rotor.rotorDiameter.result, 0.5);
    const sp = row.rotor.atSpeed[0];
    check('rotational frequency 2 rev/s', sp.rotationalFrequency.result, 2);
    check('tip speed 3.142 m/s', sp.tipSpeed.result, Math.PI * 0.5 * 2, 1e-9);
    checkTrue('tip speed within preferred range', sp.tipSpeedClassification.result === 'preferred_range', sp.tipSpeedClassification);
    check('Re = 6.28e5', sp.reynolds.result, rhoNMP * 2 * 0.25 / 0.0008, 1e-9);
    check('We = 20094', sp.weber.result, rhoNMP * 4 * 0.125 / 0.025, 1e-9);
    check('Fr = 0.2039', sp.froude.result, 4 * 0.5 / G, 1e-9);
    // power (volume-averaged basis)
    check('P per rotor ≈ 838 W', sp.power.perRotor.result, 3.5 * rhoMix * 8 * 0.5 ** 5, 1e-9);
    checkTrue('15 compartments', d.compartments.result === 15);
    check('total shaft power = 15 × P₁', sp.power.totalShaft.result, 15 * 3.5 * rhoMix * 8 * 0.5 ** 5, 1e-9);
    check('motor power after η and margin', sp.power.motorDesign.result, 15 * 3.5 * rhoMix * 8 * 0.5 ** 5 / 0.95 * 1.2, 1e-9);
    checkTrue('density basis recorded', sp.power.densityBasis.selected === 'volume_averaged' && Math.abs(sp.power.densityBasis.valueUsed_kg_m3 - rhoMix) < 1e-9);
    // heights
    check('active height 3.75 m', d.heightBreakdown.activeAgitatedHeight.result, 3.75);
    check('T/T = 6.55 m', d.heightBreakdown.totalTangentToTangent.result, 3.75 + 0.8 + 0.5 + 0.5 + 1.0, 1e-9);
    check('overall vessel = 8.15 m', d.heightBreakdown.overallVesselHeight.result, 6.55 + 0.5 + 0.5 + 0.6, 1e-9);
    // governance
    checkTrue('run pending (Assumed allowances)', d.calculationRunStatus === 'pending_validation');
    checkTrue('applicability statement', d.applicabilityStatement.includes('ECR-TYPE AGITATED COLUMN SCREENING'));
    checkTrue('7 limitations incl. no Kühni model', d.limitations.length === 7 && d.limitations[0] === 'No proprietary Kühni model');
    const v = d.engineVersions;
    checkTrue('CEL/EPD/C2/C3/ECR versions recorded', !!(v.cel && v.epd && v.processDesign && v.hydraulicsCommon && v.ecrAgitatedColumn));
    const rb = d.rateBasedPlaceholders;
    checkTrue('rate-based placeholders null', rb.compartmentMassTransferCoefficient === null && rb.residenceTime === null && rb.stageEfficiencyFromKoaVQ === null && rb.axialBackMixing === null);
    const it = sp.power.perRotor;
    checkTrue('rich item shape', it.units === 'W' && typeof it.source === 'string' && it.formulaReference === 'ECR-006' && it.engineVersion === '1.0.0' && Array.isArray(it.warnings));
    const json = JSON.stringify(d).toLowerCase();
    checkTrue('no C3 generic-throughput reuse', !json.includes('generichydraulicthroughput'));
    checkTrue('no droplet-size output', !json.includes('dropletsize') && !json.includes('sautermean') && !json.includes('d32'));
    checkTrue('no vendor recommendation keys', !json.includes('recommendeddiameter') && !json.includes('recommendedspeed'));
    checkTrue('trial diameter echoed only', d.normalCase.summary.selectedTrialDiameter_m === 1.0 && d.normalCase.summary.selectedTrialDiameterNote.includes('not engine-recommended'));
    checkTrue('bearing/support Pending Validation', row.bearingSupportRequirements.status === 'Pending Validation');
  }

  // ── 2. Refinement R1 — selectable mixture-density basis ──
  console.log('── R1: power density basis ──');
  {
    const i = baseInputs();
    i.powerDensityBasis = 'continuous_phase';
    const res = await engine.calculate(i, ctx);
    const sp = (res.data as any).normalCase.diameters[0].rotor.atSpeed[0];
    check('continuous-phase basis uses ρ_NMP', sp.power.perRotor.result, 3.5 * rhoNMP * 8 * 0.5 ** 5, 1e-9);
    checkTrue('basis recorded in item + designBasis', sp.power.densityBasis.selected === 'continuous_phase' && (res.data as any).designBasis.powerDensityBasis.selected === 'continuous_phase');

    const j = baseInputs();
    j.powerDensityBasis = 'holdup_corrected';
    const res2 = await engine.calculate(j, ctx);
    checkTrue('holdup_corrected rejected as reserved', res2.status === 'error' && res2.validationIssues.some((e) => e.message.includes('RESERVED')));

    const k = baseInputs();
    delete k.powerDensityBasis;
    checkTrue('missing basis blocked (never hard-coded)', (await engine.calculate(k, ctx)).status === 'error');
  }

  // ── 3. Refinement R2 — rotor geometry ──
  console.log('── R2: rotor geometry ──');
  {
    // direct only → ratio calculated
    const i = baseInputs();
    delete i.rotorToColumnDiameterRatio;
    i.rotorDiameter = tag(0.5, 'm');
    const res = await engine.calculate(i, ctx);
    const r = (res.data as any).normalCase.diameters[0].rotor;
    check('direct diameter → ratio calculated', r.rotorToColumnDiameterRatio.result, 0.5);

    // both, agreeing within 1 %
    const j = baseInputs();
    j.rotorDiameter = tag(0.502, 'm'); // 0.4 % off implied 0.5
    const res2 = await engine.calculate(j, ctx);
    checkTrue('both entered, within ±1 % accepted', res2.status !== 'error');
    check('direct value governs when both valid', (res2.data as any).normalCase.diameters[0].rotor.rotorDiameter.result, 0.502);

    // both, disagreeing
    const k = baseInputs();
    k.rotorDiameter = tag(0.6, 'm'); // 20 % off
    const res3 = await engine.calculate(k, ctx);
    checkTrue('±1 % violation blocked', res3.status === 'error' && (res3.data as any).calculationRunStatus === 'calculation_blocked' && res3.validationIssues.some((e) => e.message.includes('1 %')));

    // neither
    const m = baseInputs();
    delete m.rotorToColumnDiameterRatio;
    checkTrue('no rotor geometry blocked', (await engine.calculate(m, ctx)).status === 'error');
  }

  // ── 4. Refinement R3 — tip-speed classification ──
  console.log('── R3: tip-speed classification ──');
  {
    const clsAt = async (rpm: number) => {
      const i = baseInputs();
      i.rotorSpeed = tag(rpm, 'rpm');
      const res = await engine.calculate(i, ctx);
      return { res, cls: (res.data as any).normalCase.diameters[0].rotor.atSpeed[0].tipSpeedClassification.result };
    };
    checkTrue('below preferred range', (await clsAt(50)).cls === 'below_preferred_range');      // v_tip 1.31
    checkTrue('preferred range', (await clsAt(120)).cls === 'preferred_range');                 // 3.14
    checkTrue('above preferred range', (await clsAt(140)).cls === 'above_preferred_range');     // 3.67 ≤ 4.0
    const over = await clsAt(160);                                                              // 4.19 > 4.0
    checkTrue('above vendor limit', over.cls === 'above_vendor_limit');
    checkTrue('TIP_SPEED_LIMIT_EXCEEDED warning', over.res.warnings.some((w) => w.code === 'TIP_SPEED_LIMIT_EXCEEDED'));

    // no preferred range supplied → classification Not Calculable, limit still enforced
    const i = baseInputs();
    delete i.preferredTipSpeedRange;
    const res = await engine.calculate(i, ctx);
    checkTrue('no preferred range → Not Calculable classification', (res.data as any).normalCase.diameters[0].rotor.atSpeed[0].tipSpeedClassification.status === 'Not Calculable');
    const j = baseInputs();
    delete j.preferredTipSpeedRange; delete j.maxAllowableTipSpeed;
    const res2 = await engine.calculate(j, ctx);
    checkTrue('no criteria at all → no_limit_data, never assumed', (res2.data as any).normalCase.diameters[0].rotor.atSpeed[0].tipSpeedClassification.result === 'no_limit_data');
  }

  // ── 5. Speed range path ──
  console.log('── Rotor speed range ──');
  {
    const i = baseInputs();
    delete i.rotorSpeed;
    i.rotorSpeedRange = { min: tag(60, 'rpm'), max: tag(160, 'rpm') };
    const res = await engine.calculate(i, ctx);
    const at = (res.data as any).normalCase.diameters[0].rotor.atSpeed;
    checkTrue('both range ends evaluated', at.length === 2 && at[0].speedPoint === 'atMinSpeed' && at[1].speedPoint === 'atMaxSpeed');
    check('min-speed tip speed', at[0].tipSpeed.result, Math.PI * 0.5, 1e-9);
    checkTrue('max end above vendor limit flagged', at[1].tipSpeedClassification.result === 'above_vendor_limit');
    const j = baseInputs();
    j.rotorSpeedRange = { min: tag(60, 'rpm'), max: tag(160, 'rpm') }; // + rotorSpeed from base
    checkTrue('speed + range together rejected', (await engine.calculate(j, ctx)).status === 'error');
    const k = baseInputs();
    delete k.rotorSpeed;
    checkTrue('no speed blocked', (await engine.calculate(k, ctx)).status === 'error');
  }

  // ── 6. Compartments & missing mandatory inputs ──
  console.log('── Compartments & mandatory gates ──');
  {
    const i = baseInputs();
    i.compartmentEfficiency = tag(0.35, '-');
    const res = await engine.calculate(i, ctx);
    checkTrue('ceil(6/0.35) = 18', (res.data as any).compartments.result === 18);

    for (const f of ['compartmentEfficiency', 'powerNumber', 'compartmentHeight', 'shaftEfficiency', 'mechanicalDesignMargin', 'rotorType', 'driveSealBearingAllowance']) {
      const j = baseInputs();
      delete j[f];
      const r = await engine.calculate(j, ctx);
      checkTrue(`missing ${f} blocked`, r.status === 'error' && (r.data as any).calculationRunStatus === 'calculation_blocked');
    }

    const k = baseInputs();
    (k.compartmentEfficiency as any).sourceType = 'Assumed';
    const res2 = await engine.calculate(k, ctx);
    const d2 = res2.data as any;
    checkTrue('Assumed efficiency → compartments Pending Validation', d2.compartments.status === 'Pending Validation');
    checkTrue('run pending_validation', d2.calculationRunStatus === 'pending_validation');
  }

  // ── 7. Vendor capacity governance ──
  console.log('── Vendor hydraulic capacity ──');
  {
    const i = baseInputs();
    delete i.vendorHydraulicCapacity;
    const res = await engine.calculate(i, ctx);
    const row = (res.data as any).normalCase.diameters[0];
    checkTrue('missing capacity → Pending Validation, not blocked', res.status !== 'error' && row.ecrHydraulicUtilization.status === 'Pending Validation' && row.feasibility === 'pending_validation');
    checkTrue('NO_ECR_CAPACITY_DATA warning', res.warnings.some((w) => w.code === 'NO_ECR_CAPACITY_DATA'));
    checkTrue('rotor/power still calculated', typeof row.rotor.atSpeed[0].power.totalShaft.result === 'number');

    // curve out of data range refused
    const j = baseInputs();
    j.vendorHydraulicCapacity = { kind: 'table', independentVariable: 'flowRatioDispersedToContinuous', independentUnit: '-', dependentUnit: 'm3/(m2.h)', points: [{ x: 0.9, y: 32 }, { x: 1.1, y: 28 }], sourceType: 'Vendor', sourceReference: 'ECR curve' };
    const res2 = await engine.calculate(j, ctx); // flow ratio ≈ 0.748 < 0.9
    checkTrue('capacity curve extrapolation refused', (res2.data as any).normalCase.diameters[0].ecrHydraulicUtilization.status === 'Not Calculable' && res2.warnings.some((w) => w.code === 'VENDOR_CAPACITY_OUT_OF_DATA_RANGE'));

    // wrong curve variable blocked
    const k = baseInputs();
    k.vendorHydraulicCapacity = { kind: 'table', independentVariable: 'totalLiquidLoad', independentUnit: 'm3/(m2.h)', dependentUnit: 'm3/(m2.h)', points: [{ x: 5, y: 32 }, { x: 30, y: 25 }], sourceType: 'Vendor', sourceReference: 'wrong basis' };
    checkTrue('wrong curve variable blocked', (await engine.calculate(k, ctx)).status === 'error');

    // Assumed capacity ⇒ pending; no derating ⇒ warning
    const m = baseInputs();
    (m.vendorHydraulicCapacity as any).sourceType = 'Assumed';
    const res3 = await engine.calculate(m, ctx);
    checkTrue('Assumed capacity → utilization Pending Validation', (res3.data as any).normalCase.diameters[0].ecrHydraulicUtilization.status === 'Pending Validation');
    checkTrue('NO_SYSTEM_DERATING_DATA warning', res3.warnings.some((w) => w.code === 'NO_SYSTEM_DERATING_DATA'));
  }

  // ── 8. Mechanical screening ──
  console.log('── Mechanical screening ──');
  {
    const i = baseInputs();
    i.maxAllowableShaftPower = tag(5, 'kW'); // P_shaft ≈ 12.57 kW
    const res = await engine.calculate(i, ctx);
    const sp = (res.data as any).normalCase.diameters[0].rotor.atSpeed[0];
    checkTrue('shaft power exceedance flagged', sp.mechanicalScreening.shaftPowerCheck.result === 'above_limit');
    checkTrue('SHAFT_POWER_LIMIT_EXCEEDED warning', res.warnings.some((w) => w.code === 'SHAFT_POWER_LIMIT_EXCEEDED'));

    const j = baseInputs();
    delete j.maxAllowableShaftPower;
    const res2 = await engine.calculate(j, ctx);
    checkTrue('no shaft-power limit → Not Calculable', (res2.data as any).normalCase.diameters[0].rotor.atSpeed[0].mechanicalScreening.shaftPowerCheck.status === 'Not Calculable');

    const k = baseInputs();
    k.maxUnsupportedShaftLength = tag(5, 'm'); // overall vessel 8.15 m
    const res3 = await engine.calculate(k, ctx);
    checkTrue('shaft support required flagged', (res3.data as any).normalCase.diameters[0].shaftSupportCheck.result === 'intermediate_support_required' && res3.warnings.some((w) => w.code === 'SHAFT_SUPPORT_REQUIRED'));

    // stator limits
    const m = baseInputs();
    m.statorVelocityLimits = { min: tag(0.05, 'm/s'), max: tag(0.5, 'm/s') }; // v_st 0.0185 < 0.05
    const res4 = await engine.calculate(m, ctx);
    checkTrue('stator velocity below vendor minimum flagged', res4.warnings.some((w) => w.code === 'STATOR_VELOCITY_BELOW_LIMIT'));
    const n = baseInputs();
    n.rotorSweptLoadingLimit = tag(50, 'm3/(m2.h)'); // loading 66.5
    const res5 = await engine.calculate(n, ctx);
    checkTrue('rotor swept loading above limit flagged', res5.warnings.some((w) => w.code === 'ROTOR_SWEPT_LOADING_ABOVE_LIMIT'));
    const o = baseInputs();
    delete o.statorOpenAreaFraction;
    const res6 = await engine.calculate(o, ctx);
    checkTrue('no stator fraction → Not Calculable', (res6.data as any).normalCase.diameters[0].statorFreeAreaVelocity.status === 'Not Calculable');
  }

  // ── 9. Missing IFT / NMP-continuous viscosity gate ──
  console.log('── Property gates ──');
  {
    const i = baseInputs();
    delete i.interfacialTension;
    const res = await engine.calculate(i, ctx);
    const sp = (res.data as any).normalCase.diameters[0].rotor.atSpeed[0];
    checkTrue('no IFT → Weber Not Calculable, Re/Fr unaffected', sp.weber.status === 'Not Calculable' && typeof sp.reynolds.result === 'number' && typeof sp.froude.result === 'number');

    const j = baseInputs();
    delete j.continuousPhaseViscosity;
    checkTrue('NMP continuous without μ_c blocked (never silently taken)', (await engine.calculate(j, ctx)).status === 'error');

    const k = baseInputs();
    k.phaseConfiguration = 'rrbo_continuous_nmp_dispersed';
    delete k.continuousPhaseViscosity;
    const res2 = await engine.calculate(k, ctx);
    const sp2 = (res2.data as any).normalCase.diameters[0].rotor.atSpeed[0];
    checkTrue('RRBO continuous uses entered feed viscosity', res2.status !== 'error' && Math.abs(sp2.reynolds.result - 895 * 2 * 0.25 / 0.012) / (895 * 2 * 0.25 / 0.012) < 1e-9, sp2.reynolds);
  }

  // ── 10. Independent cases & diameter paths ──
  console.log('── Cases & diameter paths ──');
  {
    const i = baseInputs();
    (i.maximumCase as any).nmpMassFlow_kg_h = 12000;
    const res = await engine.calculate(i, ctx);
    const d = res.data as any;
    checkTrue('maximum case does not alter normal', Math.abs(d.normalCase.diameters[0].ecrHydraulicUtilization.result - (loadTot / 30) * 100) < 1e-9);
    checkTrue('maximum utilization > normal', d.maximumCase.diameters[0].ecrHydraulicUtilization.result > d.normalCase.diameters[0].ecrHydraulicUtilization.result);

    const j = baseInputs();
    delete j.diameterValues; delete j.selectedTrialDiameter;
    j.diameterSweep = { min: 0.6, max: 1.6, step: 0.2 };
    const res2 = await engine.calculate(j, ctx);
    const s = (res2.data as any).normalCase.summary;
    checkTrue('sweep: infeasible small D', s.hydraulicallyInfeasibleDiameters_m.includes(0.6));
    checkTrue('sweep: within band includes 1.0', s.withinScreeningBandDiameters_m.includes(1));
    checkTrue('sweep: no trial diameter note', s.selectedTrialDiameter_m === null);

    const k = baseInputs();
    delete k.diameterValues;
    k.diameterSweep = { min: 1, max: 1, step: 0.1 };
    checkTrue('degenerate sweep rejected', (await engine.calculate(k, ctx)).status === 'error');
    const m = baseInputs();
    m.diameterSweep = { min: 0.6, max: 1.6, step: 0.2 };
    checkTrue('sweep + values rejected', (await engine.calculate(m, ctx)).status === 'error');
  }

  // ── 11. Blocked-input matrix ──
  console.log('── Blocked inputs (never defaulted, never NaN) ──');
  {
    const cases: [string, (i: Record<string, unknown>) => void][] = [
      ['missing normalCase', (i) => { delete i.normalCase; }],
      ['negative NMP flow', (i) => { (i.maximumCase as any).nmpMassFlow_kg_h = -1; }],
      ['invalid phase configuration', (i) => { i.phaseConfiguration = 'oil_continuous'; }],
      ['missing feedDensity', (i) => { delete i.feedDensity; }],
      ['untagged powerNumber', (i) => { (i.powerNumber as any).sourceReference = ''; }],
      ['ratio out of range', (i) => { i.rotorToColumnDiameterRatio = tag(0.95, '-'); }],
      ['speed range min ≥ max', (i) => { delete i.rotorSpeed; i.rotorSpeedRange = { min: tag(200, 'rpm'), max: tag(100, 'rpm') }; }],
      ['preferred tip range min ≥ max', (i) => { i.preferredTipSpeedRange = { min: tag(4, 'm/s'), max: tag(2, 'm/s') }; }],
      ['compartmentEfficiency > 1', (i) => { i.compartmentEfficiency = tag(1.2, '-'); }],
      ['missing allowance', (i) => { delete i.topDisengagementHeight; }],
      ['empty diameterValues', (i) => { i.diameterValues = []; }],
      ['constant capacity without applicability note', (i) => { delete (i.vendorHydraulicCapacity as any).applicabilityNote; }],
    ];
    for (const [name, mutate] of cases) {
      const i = baseInputs();
      mutate(i);
      const res = await engine.calculate(i, ctx);
      const ok = res.status === 'error' && (res.data as any).calculationRunStatus === 'calculation_blocked' && !JSON.stringify(res.data).includes('NaN');
      checkTrue(`blocked: ${name}`, ok, res.validationIssues.slice(0, 2));
    }
  }

  // ── 12. Assumed-input propagation ──
  console.log('── Assumed inputs → Pending Validation ──');
  {
    for (const f of ['powerNumber', 'rotorSpeed', 'rotorToColumnDiameterRatio', 'shaftEfficiency', 'systemDeratingFactor'] as const) {
      const i = baseInputs();
      if (f === 'systemDeratingFactor') (i as any).systemDeratingFactor = { value: 0.85, unit: '-', sourceType: 'Assumed', sourceReference: 'estimate' };
      else (i[f] as any).sourceType = 'Assumed';
      const res = await engine.calculate(i, ctx);
      checkTrue(`Assumed ${f} → pending run + assumptions register`, (res.data as any).calculationRunStatus === 'pending_validation' && (res.data as any).assumptions.length > 0);
    }
  }

  // ── 12b. Review fixes: Assumed criteria, capacity governance, stator check split ──
  console.log('── Assumed screening criteria & capacity/stator governance ──');
  {
    // Assumed optional criterion → run pending_validation + criterion check Pending
    const i1 = baseInputs();
    (i1 as any).maxAllowableTipSpeed = { value: 6, unit: 'm/s', sourceType: 'Assumed', sourceReference: 'estimate' };
    const r1 = await engine.calculate(i1, ctx);
    checkTrue('Assumed maxAllowableTipSpeed → pending run', (r1.data as any).calculationRunStatus === 'pending_validation' && (r1.data as any).assumptions.some((a: any) => a.assumption.includes('maxAllowableTipSpeed')));
    checkTrue('Assumed tip criterion → tip classification Pending Validation', (r1.data as any).normalCase.diameters[0].rotor.atSpeed[0].tipSpeedClassification.status === 'Pending Validation');

    const i1b = baseInputs();
    (i1b as any).rotorSweptLoadingLimit = { value: 100, unit: 'm3/(m2.h)', sourceType: 'Assumed', sourceReference: 'estimate' };
    const r1b = await engine.calculate(i1b, ctx);
    checkTrue('Assumed swept-loading limit → pending run + item Pending', (r1b.data as any).calculationRunStatus === 'pending_validation' && (r1b.data as any).normalCase.diameters[0].rotorSweptAreaLoading.status === 'Pending Validation');

    // Zero / malformed constant capacity → validation-blocked
    const i2 = baseInputs();
    (i2 as any).vendorHydraulicCapacity = { kind: 'constant', value: 0, unit: 'm3/(m2.h)', sourceType: 'Vendor', sourceReference: 'v', applicabilityNote: 'note' };
    const r2 = await engine.calculate(i2, ctx);
    checkTrue('zero constant capacity → calculation_blocked', r2.status === 'error' && (r2.data as any).calculationRunStatus === 'calculation_blocked');
    const i3 = baseInputs();
    (i3 as any).vendorHydraulicCapacity = { kind: 'table', independentVariable: 'flowRatioDispersedToContinuous', unit: 'm3/(m2.h)', sourceType: 'Vendor', sourceReference: 'v', points: [] };
    const r3 = await engine.calculate(i3, ctx);
    checkTrue('empty capacity curve → calculation_blocked', r3.status === 'error' && (r3.data as any).calculationRunStatus === 'calculation_blocked');

    // Stator: no limits → separate limit-check item Not Calculable, velocity still calculated
    const r4 = await engine.calculate(baseInputs(), ctx); // baseInputs supplies no stator limits
    const row4 = (r4.data as any).normalCase.diameters[0];
    checkTrue('stator velocity reported without limits', typeof row4.statorFreeAreaVelocity.result === 'number');
    checkTrue('stator limit check Not Calculable without limits', row4.statorVelocityLimitCheck.status === 'Not Calculable');
    const i5 = baseInputs();
    (i5 as any).statorVelocityLimits = { min: { value: 0.001, unit: 'm/s', sourceType: 'Vendor', sourceReference: 'v' }, max: { value: 0.5, unit: 'm/s', sourceType: 'Vendor', sourceReference: 'v' } };
    const r5 = await engine.calculate(i5, ctx);
    checkTrue('stator limit check present & assessed with limits', (r5.data as any).normalCase.diameters[0].statorVelocityLimitCheck.result === 'within_vendor_limits');

    // R1 provenance on ALL power items
    const sp5 = (r5.data as any).normalCase.diameters[0].rotor.atSpeed[0];
    checkTrue('R1 basis recorded on totalShaft & motorDesign', sp5.power.totalShaft.source.includes("basis 'volume_averaged'") && sp5.power.motorDesign.source.includes("basis 'volume_averaged'"));
  }

  // ── 13. Concurrency / property-context isolation ──
  console.log('── Concurrency & property-context isolation ──');
  {
    const runs = Array.from({ length: 10 }, (_, k) => {
      const i = baseInputs();
      (i.feedDensity as any).value = 880 + k * 5;
      return engine.calculate(i, ctx).then((r) => ({ k, rho: (r.data as any).designBasis.feedFluid.densityUsed.value }));
    });
    const results = await Promise.all(runs);
    checkTrue('10 concurrent runs isolated', results.every((r) => Math.abs(r.rho - (880 + r.k * 5)) < 1e-9), results);
    checkTrue('shared NMP registry untouched', Math.abs(getProperty('nmp', 'density', T).value - rhoNMP) < 1e-12);
  }

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
