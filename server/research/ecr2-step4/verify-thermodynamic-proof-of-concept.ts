/**
 * Lightweight integrity checks for the Step 4 generated evidence bundle.
 *
 * Run the proof-of-concept runner before this verifier:
 *   npx tsx server/research/ecr2-step4/thermodynamic-proof-of-concept.ts
 *   npx tsx server/research/ecr2-step4/verify-thermodynamic-proof-of-concept.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const resultPath = path.resolve('.agents/outputs/ecr2-step4-thermodynamic-poc/results.json');
if (!fs.existsSync(resultPath)) throw new Error(`Missing proof output: ${resultPath}`);

const result = JSON.parse(fs.readFileSync(resultPath, 'utf8')) as {
  stage8Modified: boolean;
  datasetSummary: {
    cotoRows: number;
    multiRows: number;
    sulfurRawTieLinesAdmitted: boolean;
    sulfurFeedComponentPresent: boolean;
    sulfurFeedMassFractionsAvailable: boolean;
    sulfurMassBalanceStatus: string;
  };
  predictiveMetrics: Array<{ model: string; scope: string; compositionRmsd: number | null }>;
  calibratedMetrics: Array<{ model: string; scope: string; compositionRmsd: number | null }>;
  crossValidationMetrics: Array<{ scope: string }>;
  sulfurEnvelope: Array<{
    temperatureK: number;
    family: string;
    model: string;
    representative: string;
    nmpProbeMoleFraction: number;
    basis: string;
    probeSulfurMoleFraction: number;
    K: number | null;
    status: string;
  }>;
};

function check(label: string, condition: boolean): void {
  if (!condition) throw new Error(`FAILED: ${label}`);
  console.log(`PASS: ${label}`);
}

check('Stage 8 is explicitly untouched', result.stage8Modified === false);
check('all 17 Coto rows are present', result.datasetSummary.cotoRows === 17);
check('all 219 multi-temperature rows are present', result.datasetSummary.multiRows === 219);
check('sulfur raw tie-lines are not falsely claimed as admitted', result.datasetSummary.sulfurRawTieLinesAdmitted === false);
check('the benchmark/feed table has no sulfur component', result.datasetSummary.sulfurFeedComponentPresent === false);
check('sulfur feed mass fractions are not falsely available', result.datasetSummary.sulfurFeedMassFractionsAvailable === false);
check(
  'sulfur mass balance is fail-closed without a feed component',
  result.datasetSummary.sulfurMassBalanceStatus === 'NOT_CALCULABLE_NO_FEED_SULFUR_COMPONENT',
);
check(
  'both predictive methods are represented',
  ['COSMO_SAC_DESCRIPTOR_PROXY', 'MODIFIED_UNIFAC_DORTMUND_PROXY']
    .every((model) => result.predictiveMetrics.some((m) => m.model === model)),
);
const cotoPredictive = result.predictiveMetrics.find((m) =>
  m.model === 'COSMO_SAC_DESCRIPTOR_PROXY' && m.scope === 'Coto2022 17 tie-lines');
const cotoCalibrated = result.calibratedMetrics.find((m) =>
  m.model === 'NRTL_DIRECT_CALIBRATED' && m.scope === 'Coto2022 17 tie-lines calibration');
check(
  'Coto direct NRTL calibration improves on the fixed COSMO proxy',
  cotoPredictive?.compositionRmsd !== null &&
    cotoCalibrated?.compositionRmsd !== null &&
    cotoCalibrated.compositionRmsd < cotoPredictive.compositionRmsd,
);
check(
  'leave-one-temperature-out results exist',
  result.crossValidationMetrics.some((m) => m.scope.includes('LOTO')),
);
check(
  'leave-one-system-out diagnostics exist',
  result.crossValidationMetrics.some((m) => m.scope.includes('LOSO')),
);
check(
  'sulfur envelope remains predictive only',
  result.sulfurEnvelope.length > 0 &&
    result.sulfurEnvelope.every((point) =>
      ['PREDICTIVE_ONLY', 'NOT_CALCULABLE_SINGLE_PHASE', 'NOT_CALCULABLE_FLASH'].includes(point.status) &&
      point.basis === 'ISOLATED_MOLECULAR_PROBE_NOT_FEED_TABLE' &&
      point.probeSulfurMoleFraction === 0.02),
);
const btTemperatureSeries = result.sulfurEnvelope
  .filter((point) =>
    point.family === 'BT' &&
    point.model === 'COSMO_SAC_DESCRIPTOR_PROXY' &&
    point.representative === 'central' &&
    point.nmpProbeMoleFraction === 0.35 &&
    point.K !== null)
  .map((point) => point.K as number);
check(
  'predictive sulfur envelope carries non-zero temperature sensitivity',
  btTemperatureSeries.length >= 2 && Math.max(...btTemperatureSeries) - Math.min(...btTemperatureSeries) > 1e-5,
);