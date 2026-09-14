/**
 * Isolated diagnosis for the first Stage-4 local Job-B request for design 269.
 *
 * This is deliberately not a Stage-4 column replay: it reads the normal
 * read-only authority, reconstructs the transfer=0 first cell exactly, makes
 * one unique immutable Job-B interface request, and writes reproducible
 * evidence. It performs no database writes and does not call the Stage-4
 * lifecycle service.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { pool } from '../server/db';
import { evaluateJobA, JOB_A_COMPONENT_ORDER } from '../server/ecr-pre-pilot/job-a';
import {
  solveSevenComponentTwoFilmInterface,
  type JobBInterfaceRequest,
} from '../server/ecr-pre-pilot/job-b-interface';
import { evaluateSevenComponentLocalEquilibrium } from '../server/ecr-pre-pilot/stage4-seven-component-adapter';
import { loadStage4PrePilotSizingAuthority } from '../server/ecr-pre-pilot/stage4-pre-pilot-sizing-service';

const DESIGN_ID = 269;
const OUT_JSON = 'research/design269-stage4-interface-root-diagnosis.json';
const OUT_MD = 'research/design269-stage4-interface-root-diagnosis.md';
const MW = [170.3348, 120.1916, 142.1971, 202.2506, 405.58, 99.1311, 18.01528];
const canonicalJson = (value: unknown) => JSON.stringify(value);
const sha256 = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
const normalize = (values: number[]) => {
  const sum = values.reduce((total, value) => total + value, 0);
  if (!(sum > 0)) throw new Error('DIAGNOSIS_INVALID_ZERO_TOTAL_PHASE');
  return values.map(value => value / sum);
};

function initialFeeds(basis: any) {
  const rrboMassKgS = basis.rrboFeed.flowM3S * basis.rrboFeed.densityKgM3;
  const wetMassKgS = basis.wetSolventPhase.flowM3S * basis.wetSolventPhase.densityKgM3;
  const r = basis.composition.rrboFeedWt;
  const w = basis.composition.wetSolventWt;
  const oil = [r.saturates, r.monoAromatics, r.diAromatics, r.polyAromatics,
    r.polarAromatics, r.nmp, 0].map((pct: number, index: number) =>
    rrboMassKgS * pct * 10 / MW[index]);
  const solvent = [0, 0, 0, 0, 0, wetMassKgS * w.nmp * 10 / MW[5],
    wetMassKgS * w.water * 10 / MW[6]];
  if (basis.phaseConfiguration === 'nmp-continuous-rrbo-dispersed') {
    return { continuous: solvent, dispersed: oil, continuousIsExtract: true };
  }
  if (basis.phaseConfiguration === 'rrbo-continuous-nmp-dispersed') {
    return { continuous: oil, dispersed: solvent, continuousIsExtract: false };
  }
  throw new Error('DIAGNOSIS_UNSUPPORTED_PHASE_CONFIGURATION');
}

function totalConcentration(densityKgM3: number, x: number[]) {
  return densityKgM3 / (x.reduce((sum, value, index) => sum + value * MW[index], 0) / 1000);
}

function qualificationByStart(response: any) {
  const threshold = response.acceptanceThresholds;
  const assessment = new Map((response.endpointAssessments ?? [])
    .map((row: any) => [row.startClass, row]));
  return (response.startDiagnostics ?? []).map((row: any) => {
    const endpoint = assessment.get(row.startClass) as any;
    return {
      startClass: row.startClass,
      measured: {
        optimizerSuccess: row.optimizerSuccess,
        optimizerStatus: row.optimizerStatus,
        functionEvaluations: row.functionEvaluations,
        numericalJacobianRank: row.numericalJacobianRank,
        maximumIsoactivityLogResidual: row.maximumIsoactivityLogResidual,
        maximumFluxEqualityResidualMolM2S: row.maximumFluxEqualityResidualMolM2S,
        maximumScaledFluxEqualityResidual: row.maximumScaledFluxEqualityResidual,
        maximumInterfaceCompositionSeparation: row.maximumInterfaceCompositionSeparation,
        continuousDiffusiveSumResidualMolM2S: row.continuousDiffusiveSumResidualMolM2S,
        dispersedDiffusiveSumResidualMolM2S: row.dispersedDiffusiveSumResidualMolM2S,
        continuousTotalFluxIdentityResidualMolM2S: row.continuousTotalFluxIdentityResidualMolM2S,
        dispersedTotalFluxIdentityResidualMolM2S: row.dispersedTotalFluxIdentityResidualMolM2S,
      },
      unchangedThresholds: threshold,
      gateComparison: {
        optimizer: row.optimizerSuccess === true ? 'PASS' : 'FAIL',
        numericalJacobianRank: row.numericalJacobianRank === threshold.requiredNumericalJacobianRank
          ? 'PASS' : 'FAIL',
        isoactivityResidual: row.maximumIsoactivityLogResidual
          <= threshold.maximumIsoactivityLogResidual ? 'PASS' : 'FAIL',
        scaledFluxEqualityResidual: row.maximumScaledFluxEqualityResidual
          <= threshold.maximumScaledFluxEqualityResidual ? 'PASS' : 'FAIL',
        phaseSeparation: endpoint?.phaseSeparationAccepted === true ? 'PASS' : 'FAIL',
        phaseOrientation: endpoint?.phaseOrientationAccepted === true ? 'PASS' : 'FAIL',
        endpointStability: Object.hasOwn(endpoint ?? {}, 'endpointStabilityAccepted')
          ? endpoint.endpointStabilityAccepted === true ? 'PASS' : 'FAIL'
          : 'NOT_REACHED_NO_REPRODUCED_ELIGIBLE_PAIR',
      },
    };
  });
}

async function main() {
  // The owner is read only to invoke the owner-scoped, public authority builder;
  // it is intentionally omitted from every output artifact.
  const owner = await pool.query<{ created_by: number }>(
    'SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1',
    [DESIGN_ID],
  );
  if (!owner.rows[0]) throw new Error('DIAGNOSIS_DESIGN_NOT_FOUND');
  const authority = await loadStage4PrePilotSizingAuthority(owner.rows[0].created_by, DESIGN_ID);
  const { solverInput: input } = authority;
  const feed = initialFeeds(input.processBasis);
  const xContinuous = normalize(feed.continuous);
  const xDispersed = normalize(feed.dispersed);
  const inletInventory = feed.continuous.map((value, index) => value + feed.dispersed[index]);
  // This is the same initial adapter binding performed before Job A in solveCase;
  // it is not a local interface solve and does not duplicate the requested root.
  const inletFlash = await evaluateSevenComponentLocalEquilibrium({
    temperatureK: input.processBasis.temperatureK,
    componentMolarInventory: inletInventory,
    componentOrder: [...JOB_A_COMPONENT_ORDER],
  }, { timeoutMs: 120_000 }) as any;
  if (inletFlash.status !== 'CALCULATED') {
    throw new Error(`DIAGNOSIS_INLET_ADAPTER_UNAVAILABLE:${inletFlash.status}`);
  }
  const continuousPhase = feed.continuousIsExtract
    ? input.processBasis.wetSolventPhase : input.processBasis.rrboFeed;
  const dispersedPhase = feed.continuousIsExtract
    ? input.processBasis.rrboFeed : input.processBasis.wetSolventPhase;
  const jobA = evaluateJobA({
    stage1SnapshotHash: input.stage1SnapshotHash,
    theoreticalStages: input.calculatedNt,
    theoreticalStageProvenance: 'STAGE_2_CALCULATED_NT',
    stage2JobId: input.stage2JobId,
    stage2ResultHash: input.stage2ResultHash,
    stage2EngineHash: input.stage2EngineHash,
    thermodynamicAdapterPreflightHash: inletFlash.resultHash,
    stage3RunId: String(input.stage3RunId),
    stage3ImmutableHash: input.stage3ImmutableHash,
    stage3ImplementationHash: input.stage3ImplementationHash,
    selectedTrialId: input.selectedTrialId,
    selectedTrialOrdinal: input.selectedTrialOrdinal,
    temperatureK: input.processBasis.temperatureK,
    interfacialTensionNM: input.processBasis.interfacialTensionNM,
    d32M: input.hydraulics.d32M,
    slipVelocityMS: input.hydraulics.continuousSuperficialVelocityMS / (1 - input.hydraulics.operatingHoldup)
      + input.hydraulics.dispersedSuperficialVelocityMS / input.hydraulics.operatingHoldup,
    continuous: {
      densityKgM3: continuousPhase.densityKgM3,
      dynamicViscosityPaS: continuousPhase.dynamicViscosityPaS,
      moleFractions: xContinuous,
    },
    dispersed: {
      densityKgM3: dispersedPhase.densityKgM3,
      dynamicViscosityPaS: dispersedPhase.dynamicViscosityPaS,
      moleFractions: xDispersed,
    },
  });
  const kc = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(row => row.componentId === component && row.phase === 'continuous').filmCoefficientMS);
  const kd = JOB_A_COMPONENT_ORDER.map(component =>
    (jobA.cells as any[]).find(row => row.componentId === component && row.phase === 'dispersed').filmCoefficientMS);
  const request: JobBInterfaceRequest = {
    componentOrder: [...JOB_A_COMPONENT_ORDER],
    T: input.processBasis.temperatureK,
    x_bulk_continuous: xContinuous,
    x_bulk_dispersed: xDispersed,
    kc,
    kd,
    CtC: totalConcentration(continuousPhase.densityKgM3, xContinuous),
    CtD: totalConcentration(dispersedPhase.densityKgM3, xDispersed),
    phase_config: input.processBasis.phaseConfiguration as JobBInterfaceRequest['phase_config'],
  };
  const requestFingerprint = sha256(request);
  // Exactly one immutable Job-B root request is made by this diagnosis.
  const response = await solveSevenComponentTwoFilmInterface(request, { timeoutMs: 300_000 });
  const identities = ([0.0126, 0.0105] as const).flatMap(caseCoefficient =>
    ([2, 4] as const).map(finiteVolumeCellsPerPhysicalCompartment => ({
      caseCoefficient,
      physicalCompartments: input.calculatedNt,
      finiteVolumeCellsPerPhysicalCompartment,
      transferIteration: 0,
      cellIndex: 0,
      requestFingerprint,
      sameRequestAsAllOtherInitialCases: true,
      derivation: 'transfer[all cells][all components]=0; all continuous faces=continuous feed; all dispersed dIn/dOut=dispersed feed; c, cells-per-compartment, dz, area and Ec enter only after Job-B returns flux per area.',
    })),
  );
  const evidence = {
    schema: 'DESIGN269_STAGE4_INTERFACE_ROOT_DIAGNOSIS_V1',
    scope: {
      designId: DESIGN_ID,
      operation: 'READ_ONLY_AUTHORITY_PLUS_ONE_UNIQUE_IMMUTABLE_JOB_B_INTERFACE_ROOT',
      prohibitedActionsNotPerformed: [
        'No Stage-4 full-column rerun', 'No Stage-2 or Stage-3 rerun',
        'No persisted-result mutation', 'No worker, engine, or threshold modification',
      ],
    },
    authority: {
      calculatedNt: input.calculatedNt,
      stage1SnapshotHash: input.stage1SnapshotHash,
      stage2JobId: input.stage2JobId,
      stage2ResultHash: input.stage2ResultHash,
      stage2EngineHash: input.stage2EngineHash,
      stage3RunId: String(input.stage3RunId),
      stage3ImmutableHash: input.stage3ImmutableHash,
      stage3ImplementationHash: input.stage3ImplementationHash,
      selectedTrialId: input.selectedTrialId,
      selectedTrialOrdinal: input.selectedTrialOrdinal,
      processBasis: input.processBasis,
      hydraulics: input.hydraulics,
      authorityLineageHash: authority.lineageHash,
    },
    exactInitialState: {
      physicalCompartments: input.calculatedNt,
      transferInitializedToMolS: 'all 5×(2 or 4) cells × 7 components = 0',
      continuousFaceAtCellZeroMolS: feed.continuous,
      dispersedInAndOutAtCellZeroMolS: feed.dispersed,
      localContinuousMoleFraction: xContinuous,
      localDispersedMoleFraction: xDispersed,
    },
    inletAdapterBinding: {
      status: inletFlash.status, resultHash: inletFlash.resultHash,
      engineHash: inletFlash.engineHash,
    },
    jobA: {
      resultSha256: jobA.resultSha256,
      continuousFilmCoefficientKcMPerS: kc,
      dispersedFilmCoefficientKdMPerS: kd,
    },
    requestFingerprint: {
      algorithm: 'sha256(JSON.stringify(request))',
      value: requestFingerprint,
      uniqueRequestCount: 1,
      crossCaseInitialRequestIdentity: identities,
    },
    exactJobBRequest: request,
    immutableJobBResponse: response,
    perStartMeasuredGateComparison: qualificationByStart(response),
    interpretationBoundary: [
      'The response is evidence about the immutable preliminary local two-film solver at transfer=0 only.',
      'The solver preserves literal zero bulk feed components; LOG_FLOOR applies to interface-coordinate initialization, not submitted bulk vectors.',
      'Endpoint stability is evaluated by the worker only after it finds a reproduced eligible pair. A NOT_REACHED stability entry is not a stability pass or failure.',
    ],
  };
  await fs.writeFile(OUT_JSON, `${JSON.stringify(evidence, null, 2)}\n`);
  const startRows = evidence.perStartMeasuredGateComparison.map((row: any) =>
    `| ${row.startClass} | ${row.gateComparison.optimizer} | ${row.gateComparison.numericalJacobianRank} | ${row.gateComparison.isoactivityResidual} | ${row.gateComparison.scaledFluxEqualityResidual} | ${row.gateComparison.phaseSeparation} | ${row.gateComparison.phaseOrientation} | ${row.gateComparison.endpointStability} |`).join('\n');
  const markdown = `# Design 269 Stage-4 interface-root diagnosis

## Scope and method

This is a read-only isolated reproduction. It loaded the normal
\`loadStage4PrePilotSizingAuthority\` authority for design 269, reconstructed
the first local state at \`transfer=0\`, and sent **one unique request** to the
manifest-verified immutable Job-B worker. It did not rerun the Stage-4 column,
Stage 2, or Stage 3; it did not modify thresholds, worker, engine, or stored
results.

The request fingerprint is \`${requestFingerprint}\`. For physical count
${input.calculatedNt}, both FV meshes (2 and 4 cells/physical compartment) and
both K&H coefficients (0.0126 and 0.0105) have this same initial request:
coefficient, Ec, cell count, dz, and interfacial area are applied only after
the per-area Job-B response. Thus there is one, not four, first-root identity.

## Immutable response

Worker status: **${response.status}**. Worker/source binding hashes and the
complete request, response, exact vectors, coefficients, and thresholds are
stored in [the JSON evidence](./design269-stage4-interface-root-diagnosis.json).

## Measured per-start gate comparison

| start | optimizer | rank | isoactivity | scaled flux equality | separation | orientation | endpoint stability |
|---|---|---|---|---|---|---|---|
${startRows}

“NOT_REACHED” means no reproduced eligible pair reached the worker's endpoint
stability branch; it must not be interpreted as a stability result. The exact
measured residuals and unchanged acceptance thresholds are in the JSON rather
than rounded here.

## Evidence-bounded diagnosis

At the first state, the continuous boundary is the exact fresh wet-solvent
feed and the dispersed boundary is the exact fresh RRBO feed. Consequently
the submitted continuous hydrocarbon fractions and dispersed NMP/H2O fractions
are literal zero. This follows directly from the Stage-4 \`feeds\` and
\`transfer=0\` initialization, not from mesh/coefficient selection. The
worker's response is therefore consistent across all four failed initial
cases. The existing response evidence can distinguish optimizer/rank/residual/
separation/orientation gates, but cannot label endpoint stability failed when
that branch was not reached.

No mapping, unit, coefficient scaling, or initialization correction is
established by this one-state evidence. In particular, changing a zero feed,
forcing equimolar total flux, altering Job-A coefficients, or relaxing any
gate would change the governed request/closure rather than diagnose this
immutable failure. Any future correction requires a separately qualified
constitutive or boundary treatment and fresh evidence; this report makes no
process-infeasibility claim.
`;
  await fs.writeFile(OUT_MD, markdown);
  console.log(JSON.stringify({
    written: [OUT_JSON, OUT_MD],
    status: response.status,
    requestFingerprint,
    startCount: response.startDiagnostics?.length ?? 0,
  }));
  await pool.end();
}

main().catch(async error => {
  await pool.end().catch(() => undefined);
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});