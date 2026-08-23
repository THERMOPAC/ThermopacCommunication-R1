// ═══════════════════════════════════════════════════════════════════════════════
// C2 — Temperature-Dependent LLE Model (TLLE) tests
// Covers: interpolation vs extrapolation classification, model tie-line family
// generation, development-gap fail-closed, reproduction record honesty,
// engine wiring (temperatureModel block, labels, warnings), and no-throw
// behaviour across a wide temperature sweep.
// Run: npx tsx server/engine-framework/tests/c2-temperature-lle.ts
// ═══════════════════════════════════════════════════════════════════════════════
import {
  temperatureModelStatus, generateModelTieLinesAtTemperature, TlleModelError,
  TLLE_EXTRAPOLATION_CLASSIFICATION, TLLE_REPRODUCTION_RECORD, TLLE_REPRODUCTION_GATE,
  experimentalFamilyForTemperature, calibratedTemperatureRangeK, usableCalibrationPointsK,
  resolveThermodynamicValidityAtTemperature,
} from '../cel/llx-temperature-lle-model';
import {
  computeGovernedTheoreticalStages, interpolateTieLine,
  COTO_2022_DATASET_ID, COTO_2022_TEMPERATURE_K,
} from '../cel/coto2022-nmp-lle';
import { LLXProcessDesignEngine } from '../../engines/llx/llx-process-design-engine';

let passed = 0, failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function main() {
  console.log('── Calibration registry & classification ──');
  {
    const pts = usableCalibrationPointsK();
    check('registry carries exactly the usable Coto point', pts.length === 1 && pts[0] === COTO_2022_TEMPERATURE_K);
    const range = calibratedTemperatureRangeK();
    check('calibrated range limited to directly usable data', range.minK === COTO_2022_TEMPERATURE_K && range.maxK === COTO_2022_TEMPERATURE_K);

    const sIn = temperatureModelStatus(298.15);
    check('298.15 K → interpolation, distance 0', sIn.mode === 'interpolation' && sIn.distanceOutsideRangeK === 0);
    check('298.15 K governed by an experimental family', experimentalFamilyForTemperature(298.15)?.dataset.datasetId === COTO_2022_DATASET_ID);
    const sEdge = temperatureModelStatus(298.65); // inside 0.5 K acceptance window
    check('acceptance window (±0.5 K) still interpolation', sEdge.mode === 'interpolation');
    const sOut = temperatureModelStatus(343.15);
    check('343.15 K → extrapolation', sOut.mode === 'extrapolation');
    check('extrapolation distance = 44.5 K', sOut.distanceOutsideRangeK === 44.5, String(sOut.distanceOutsideRangeK));
    check('exact extrapolation classification', sOut.classification === TLLE_EXTRAPOLATION_CLASSIFICATION);
    check('no experimental family at 343.15 K', experimentalFamilyForTemperature(343.15) === null);

    const direct = resolveThermodynamicValidityAtTemperature(298.15);
    check('direct Coto temperature is explicitly validated-preliminary',
      direct.temperatureStatus === 'VALIDATED' &&
      direct.selectedTemperatureApplicability === 'VALIDATED_PRELIMINARY');
    check('direct Coto evidence carries source context and tie-line count',
      direct.evidence.pressureKPa === 101.6 &&
      direct.evidence.components.length === 5 &&
      direct.evidence.tieLinesAvailable === 13 &&
      direct.evidence.tieLinesUsed === 13);
    check('failed calibration reproduction and negative optimizer readiness are explicit',
      direct.calibrationTemperatureReproduction.status === 'FAIL' &&
      direct.optimizerForwardThermodynamicReadiness === 'NOT_READY');
    check('multi-temperature diagnostic evidence remains excluded',
      direct.independentMultiTemperatureValidation.status === 'INSUFFICIENT_EVIDENCE' &&
      direct.independentMultiTemperatureValidation.diagnosticEvidenceExcluded === true &&
      direct.parameterIdentifiability.status === 'CALIBRATION_TEMPERATURE_ONLY');

    const nearBoundary = resolveThermodynamicValidityAtTemperature(298.65);
    check('±0.5 K direct-evidence window remains validated-preliminary',
      nearBoundary.temperatureStatus === 'VALIDATED' &&
      nearBoundary.distanceFromNearestAdmittedTemperatureK === 0.5);
    const extrapolated = resolveThermodynamicValidityAtTemperature(343.15);
    check('off-calibration temperature is extrapolated-preliminary with exact distance',
      extrapolated.temperatureStatus === 'EXTRAPOLATED' &&
      extrapolated.selectedTemperatureApplicability === 'EXTRAPOLATED_PRELIMINARY' &&
      extrapolated.extrapolation.used === true &&
      extrapolated.extrapolation.distanceOutsideAdmittedRangeK === 45);
    const insufficient = resolveThermodynamicValidityAtTemperature(Number.NaN);
    check('invalid temperature fails closed as insufficient evidence',
      insufficient.temperatureStatus === 'INSUFFICIENT_EVIDENCE' &&
      insufficient.selectedTemperatureApplicability === 'INSUFFICIENT_EVIDENCE');
  }

  console.log('── Model tie-line family generation ──');
  {
    const fam = generateModelTieLinesAtTemperature(343.15);
    check('family generated at 343.15 K', fam.temperatureK === 343.15 && fam.tieLines.length >= 4);
    check('all compositions finite and normalised', fam.tieLines.every((t) =>
      t.x.every(Number.isFinite) && t.y.every(Number.isFinite) &&
      Math.abs(t.x.reduce((a, b) => a + b, 0) - 1) < 0.01 && Math.abs(t.y.reduce((a, b) => a + b, 0) - 1) < 0.01));
    check('x1R strictly monotone (interpolation coordinate preserved)',
      fam.tieLines.every((t, i) => i === 0 || t.x[0] > fam.tieLines[i - 1].x[0]));
    check('dropped tie-lines carry exact reasons', fam.droppedTieLines.every((d) => d.reason.length > 0));

    // Equilibrium actually changes with temperature → N_T follows temperature.
    const fam55 = generateModelTieLinesAtTemperature(328.15);
    const x1Probe = 0.75;
    const e298 = interpolateTieLine(x1Probe).extract;
    const e328 = interpolateTieLine(x1Probe, fam55.tieLines as any).extract;
    const diff = Math.max(...e298.map((v, i) => Math.abs(v - e328[i])));
    check('model equilibrium at 328.15 K differs from 298.15 K experimental (same x1R)', diff > 0.005, `max |Δy| = ${diff.toFixed(4)}`);
  }

  console.log('── Development-gap fail-closed ──');
  {
    let err: TlleModelError | null = null;
    try { generateModelTieLinesAtTemperature(600); } catch (e) { if (e instanceof TlleModelError) err = e; else throw e; }
    check('600 K fails closed as TlleModelError', err !== null);
    check('exact DEVELOPMENT GAP statement', err?.limit === 'Temperature-Dependent LLE Model — DEVELOPMENT GAP', err?.limit);
  }

  console.log('── Reproduction record honesty ──');
  {
    check('gate = 3·u(x) = 0.009', Math.abs(TLLE_REPRODUCTION_GATE - 0.009) < 1e-12);
    check('gate failure recorded, never hidden', TLLE_REPRODUCTION_RECORD.tieLinesWithinGate < TLLE_REPRODUCTION_RECORD.tieLinesTotal && TLLE_REPRODUCTION_RECORD.maxAbsDev > TLLE_REPRODUCTION_GATE);
    check('per-tie-line record complete (13 rows)', TLLE_REPRODUCTION_RECORD.perTieLineMaxAbsDev.length === 13);
  }

  console.log('── Cascade with model basis (deterministic, never throws) ──');
  {
    const fam = generateModelTieLinesAtTemperature(328.15);
    const r = computeGovernedTheoreticalStages({
      temperatureK: 328.15,
      feedMoleFractions: [0.76782, 0.15356, 0.05119, 0.02742, 0],
      solventMolarRatio: 4.6474,
      targetRaffinateAromaticsMole: 0.12,
      equilibriumBasis: { tieLines: fam.tieLines, datasetId: fam.datasetId, datasetVersion: fam.datasetVersion, citation: fam.citation, basisLabel: fam.basisLabel },
    });
    check('model-basis cascade returns a governed result (no throw)', r.status === 'calculated' || r.status === 'not_calculable');
    check('basis dataset id carried through', r.datasetId === fam.datasetId);
    check('temperatureStatus = model_at_design_temperature', r.temperatureStatus === 'model_at_design_temperature');
    if (r.status === 'not_calculable') check('fail-closed carries exact limit', !!r.limitExceeded?.limit && !!r.limitExceeded?.detail);
  }

  console.log('── Engine wiring (temperatureModel block, labels, warnings) ──');
  const eng = new LLXProcessDesignEngine();
  const tag = (v: number) => ({ value: v, sourceType: 'Measured', sourceReference: 'TLLE test' });
  const inputs = (T: number) => ({
    operatingTemperature: T, extractionTemperature: T,
    feedFlow: { value: 1.0, basis: 'volumetric' },
    feedDensity: { value: 870, referenceTemperatureC: 15, sourceType: 'Measured', sourceReference: 'TLLE test' },
    solventToOilRatio: 1.2, maxCirculationFactor: 1.2,
    phaseConfiguration: 'nmp_continuous_rrbo_dispersed',
    soluteMassFractionInFeed: tag(0.2),
    caseSplits: { normal: { soluteRecoveryToExtract: tag(0.9), solventCarryoverFraction: tag(0.02), oilLossToExtractFraction: tag(0.01) } },
    applyNormalSplitsToMaximumCase: true,
    lleStageInputs: {
      rrboCharacterisationWtPct: { saturates: tag(80), monoAromatics: tag(14), diAromatics: tag(4), polyAromatics: tag(2) },
      totalAromaticsWtPct: tag(20),
      classMolecularWeights: { saturates: tag(400), monoAromatics: tag(350), diAromatics: tag(300), polyAromatics: tag(280) },
      targetRaffinateAromaticsMolePct: tag(12),
    },
  });
  const ctx = { calculationClass: 'Preliminary Screening' } as any;
  {
    const r = await eng.calculate(inputs(25) as any, ctx);
    const d: any = r.data;
    const tm = d?.lleStageCalculation?.temperatureModel;
    check('25 °C run not blocked', r.status !== 'error');
    check('temperatureModel block present', !!tm);
    check('25 °C → interpolation, dist 0', tm?.mode === 'interpolation' && tm?.distanceOutsideRangeK === 0);
    check('experimental basis reported in-range', tm?.experimentalBasis?.datasetId === COTO_2022_DATASET_ID && tm?.experimentalBasis?.tieLines === 13);
    check('user T + calibrated range surfaced', tm?.userSelectedTemperatureK === 298.15 && tm?.calibratedTemperatureRangeK?.minK === 298.15);
    check('temperature resolver metadata is surfaced on the C2 snapshot',
      tm?.thermodynamicValidity?.operatingTemperatureK === 298.15 &&
      tm?.thermodynamicValidity?.temperatureStatus === 'VALIDATED' &&
      tm?.thermodynamicValidity?.optimizerForwardThermodynamicReadiness === 'NOT_READY');
    check('no extrapolation warning in-range', !(d ? (r as any).warnings ?? [] : []).some?.((w: any) => w.code === 'NT_TEMPERATURE_EXTRAPOLATION'));
  }
  {
    const r = await eng.calculate(inputs(70) as any, ctx);
    const d: any = r.data;
    const tm = d?.lleStageCalculation?.temperatureModel;
    check('70 °C run not blocked (never fails closed on temperature alone)', r.status !== 'error');
    check('70 °C → extrapolation, dist 44.5 K', tm?.mode === 'extrapolation' && tm?.distanceOutsideRangeK === 44.5);
    check('exact classification on result', tm?.classification === TLLE_EXTRAPOLATION_CLASSIFICATION);
    check('model identity + validation status surfaced', !!tm?.model?.id && String(tm?.validationStatus).includes('reproduction record'));
    check('off-temperature C2 snapshot carries extrapolation evidence metadata',
      tm?.thermodynamicValidity?.temperatureStatus === 'EXTRAPOLATED' &&
      tm?.thermodynamicValidity?.evidence?.tieLinesAvailable === 13 &&
      tm?.thermodynamicValidity?.independentMultiTemperatureValidation?.status === 'INSUFFICIENT_EVIDENCE');
    check('model tie-line family echoed', (tm?.modelTieLineFamily?.tieLinesUsed ?? 0) >= 4);
    const quality = d?.lleStageCalculation;
    check('historical LLE aromatics are explicitly retained on the full phase',
      quality?.raffinateAromaticsLLE?.symbol === 'x_A,R^LLE' &&
      quality?.raffinateAromaticsLLE?.denominatorIncludesNMP === true);
    check('hydrocarbon-only product molar and mass aromatics are reported separately',
      quality?.raffinateProductQuality?.x_A_R_product?.symbol === 'x_A,R^product' &&
      quality?.raffinateProductQuality?.w_A_R_product?.symbol === 'w_A,R^product' &&
      quality?.raffinateProductQuality?.x_A_R_product?.denominatorIncludesNMP === false &&
      quality?.raffinateProductQuality?.w_A_R_product?.denominatorIncludesNMP === false);
    const st = d?.stages;
    if (st?.mode === 'auto_calculated') {
      check('extrapolated N_T labelled with exact classification', String(st.label).includes(TLLE_EXTRAPOLATION_CLASSIFICATION) && st.classification === 'Pending Validation');
    } else {
      check('non-calculable extrapolation carries exact limit (not a temperature limit)', !!d?.lleStageCalculation?.limitExceeded?.limit && !String(d?.lleStageCalculation?.limitExceeded?.limit).toLowerCase().includes('temperature limit'));
    }
  }
  {
    // Wide sweep — the engine must never throw/block on temperature alone.
    let allOk = true;
    for (const T of [0, 25, 40, 55, 70, 90, 120, 150]) {
      const r = await eng.calculate(inputs(T) as any, ctx);
      if (r.status === 'error') { allOk = false; console.log(`     sweep FAILED at ${T} °C`); }
    }
    check('temperature sweep 0–150 °C never blocks the run', allOk);
  }

  console.log(`\n═══ RESULT: ${passed} passed, ${failed} failed ═══`);
  if (failed > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
