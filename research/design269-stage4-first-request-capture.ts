/**
 * Capture the four actual first local requests assembled by the production
 * Stage-4 TypeScript engine for design 269, without a column or Python run.
 *
 * Local flash is deliberately a non-scientific structural stub accepted only
 * long enough to reach the assembly under test. The interface evaluator
 * captures each request and returns BLOCKED immediately, so every mesh stops
 * at physical count 5, iteration 1, cell 0. No response is scientific
 * evidence; only the engine-assembled request is evidence here.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pool } from '../server/db';
import { JOB_A_COMPONENT_ORDER } from '../server/ecr-pre-pilot/job-a';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';
import { runStage4PredictivePhysicalSizing } from '../server/ecr-pre-pilot/stage4-predictive-physical-sizing';

const DESIGN_ID = 269;
const BASELINE = 'research/design269-stage4-interface-root-diagnosis.json';
const OUT_JSON = 'research/design269-stage4-first-request-capture.json';
const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileSha = async (path: string) => createHash('sha256').update(await fs.readFile(path)).digest('hex');
const maximumVectorDifference = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b);
  if (Array.isArray(a) && Array.isArray(b)) {
    return Math.max(...a.map((value, i) => maximumVectorDifference(value, b[i])));
  }
  return 0;
};

async function main() {
  const owner = await pool.query<{ created_by: number }>(
    'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1', [DESIGN_ID],
  );
  if (!owner.rows[0]) throw new Error('CAPTURE_DESIGN_NOT_FOUND');
  const authority = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
  const input = { ...authority.solverInput, maximumCompartments: authority.solverInput.calculatedNt };
  const baseline = JSON.parse(await fs.readFile(BASELINE, 'utf8'));
  const captured: any[] = [];
  const result = await runStage4PredictivePhysicalSizing(input, {
    wallClockBudgetMs: 30_000,
    // Structural admission only. These positive normalized vectors are never
    // used for local interface composition in solveCase; they only satisfy the
    // pre-Job-A adapter binding required to reach the exact real assembly.
    flashEvaluator: async () => ({
      status: 'CALCULATED',
      phaseOrientation: 'NMP_RICH_EXTRACT',
      raffinateComposition: Array(7).fill(1 / 7),
      extractComposition: Array(7).fill(1 / 7),
      resultHash: '0'.repeat(64),
    }),
    interfaceEvaluator: async request => {
      captured.push({ request, requestHash: sha(request) });
      return { status: 'BLOCKED_NO_ACCEPTED_PHYSICAL_INTERFACE_ROOT' } as any;
    },
  });
  if (captured.length !== 4) throw new Error(`CAPTURE_EXPECTED_FOUR_GOT_${captured.length}`);
  const meshFailures = [
    ['0.0126', 'coarse', result.primary.lastConservedPhysicalTrial?.coarse?.interfaceFailure],
    ['0.0126', 'refined', result.primary.lastConservedPhysicalTrial?.refined?.interfaceFailure],
    ['0.0105', 'coarse', result.sensitivity.lastConservedPhysicalTrial?.coarse?.interfaceFailure],
    ['0.0105', 'refined', result.sensitivity.lastConservedPhysicalTrial?.refined?.interfaceFailure],
  ].map(([caseCoefficient, mesh, failure], index) => ({
    caseCoefficient: Number(caseCoefficient),
    mesh,
    capturedByInjectedEvaluator: captured[index],
    enginePersistableFailureCapture: failure,
  }));
  const manualRequest = baseline.exactJobBRequest;
  const comparisons = meshFailures.map((entry: any) => {
    const request = entry.capturedByInjectedEvaluator.request;
    const vectorKeys = ['x_bulk_continuous', 'x_bulk_dispersed', 'kc', 'kd'];
    return {
      caseCoefficient: entry.caseCoefficient,
      mesh: entry.mesh,
      actualEngineRequestHash: entry.capturedByInjectedEvaluator.requestHash,
      historicalManualRequestHash: baseline.requestFingerprint.value,
      bitwiseJsonIdentityWithManual: entry.capturedByInjectedEvaluator.requestHash
        === baseline.requestFingerprint.value,
      maximumAbsoluteDifferenceFromManualByField: {
        T: Math.abs(request.T - manualRequest.T),
        CtC: Math.abs(request.CtC - manualRequest.CtC),
        CtD: Math.abs(request.CtD - manualRequest.CtD),
        ...Object.fromEntries(vectorKeys.map(key => [
          key, maximumVectorDifference(request[key], manualRequest[key]),
        ])),
      },
      engineFailureCaptureAgreesWithInterceptor:
        entry.enginePersistableFailureCapture?.requestHash === entry.capturedByInjectedEvaluator.requestHash
        && entry.enginePersistableFailureCapture?.iteration === 1
        && entry.enginePersistableFailureCapture?.cellIndex === 0,
    };
  });
  const allActualHashes = comparisons.map(row => row.actualEngineRequestHash);
  const evidence = {
    schema: 'DESIGN269_STAGE4_ENGINE_ASSEMBLED_FIRST_REQUEST_CAPTURE_V1',
    scope: {
      designId: DESIGN_ID,
      enginePath: 'runStage4PredictivePhysicalSizing injected capture-only evaluators',
      physicalCompartments: input.calculatedNt,
      maximumCompartments: input.maximumCompartments,
      noPythonWorkerOrScientificFlash: true,
      noColumnIterationBeyondFirstBlockedCell: true,
      noPersistenceOrProductionEdit: true,
      flashStubDisclosure: 'STRUCTURAL_EXTRACTION_ORIENTATION_STUB_ONLY; NOT A SCIENTIFIC FLASH AND NOT USED AS LOCAL INTERFACE COMPOSITION',
      interfaceStubDisclosure: 'CAPTURE_ONLY_BLOCKED_RESPONSE; NOT A SCIENTIFIC INTERFACE RESPONSE',
    },
    sourceBinding: {
      baselineExecutedDiagnosisScriptSha256: await fileSha('research/design269-stage4-interface-root-diagnosis.ts'),
      baselineEvidenceSha256: await fileSha(BASELINE),
      stage4SizingSourceSha256: await fileSha('server/ecr-pre-pilot/stage4-predictive-physical-sizing.ts'),
    },
    requestAssemblyComparison: comparisons,
    actualHashSummary: {
      uniqueActualEngineRequestHashes: [...new Set(allActualHashes)],
      allFourActualEngineRequestsBitwiseIdentical: new Set(allActualHashes).size === 1,
      comment: 'No identity claim is made from analysis alone; hashes above are direct injected-evaluator captures from production assembly.',
    },
    capturedEngineRequests: meshFailures,
  };
  await fs.writeFile(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({
    written: OUT_JSON,
    uniqueActualEngineRequestHashes: evidence.actualHashSummary.uniqueActualEngineRequestHashes,
    allFourActualEngineRequestsBitwiseIdentical: evidence.actualHashSummary.allFourActualEngineRequestsBitwiseIdentical,
  }));
  await pool.end();
}

main().catch(async error => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});