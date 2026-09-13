import { describe, expect, it } from 'vitest';
import {
  sizeAcceptedJobCPhysicalKuhniColumn,
  sizeAcceptedJobCWithWorkerTransport,
  summarizeJobCPhysicalSizingDependency,
  assessAcceptedJobCForPhysicalSizing,
  setJobCPhysicalSizingWorkerTransportForTest,
  solveDirectPartialTransferSizingCandidate,
  type AcceptedJobCPhysicalSizingInput,
} from '../server/ecr-pre-pilot/job-c-physical-sizing';
import {
  createNoAxialMixingClosure,
  type KuhniMassTransferDependencies,
  type KuhniMassTransferInput,
} from '../server/ecr-pre-pilot/kuhni-mass-transfer';
import {
  jobCResultHash,
  jobCScientificResultHash,
  type JobCWorkerRequest,
} from '../server/ecr-pre-pilot/job-c';
import { JOB_A_COMPONENT_ORDER, JOB_A_MOLECULAR_DATA } from '../server/ecr-pre-pilot/job-a';

const hash = 'a'.repeat(64);
const qualifier = {
  status: 'QUALIFIED_JOB_C_BOUNDARY_BRANCH',
  independentReproductionMaximumRelativeDifference: 1e-4,
  acceptanceThresholds: {
    independentStartReproductionRelativeTolerance: 1e-3,
    minimumLocalStabilityCurvature: 0,
    postInterfaceTpdThreshold: 0,
  },
  selectedGateEvidence: {
    localStability: {
      continuous: { minimumEigenvalue: 1, stepSizeConverged: true },
      dispersed: { minimumEigenvalue: 1, stepSizeConverged: true },
    },
    routineTpd: {
      continuous: {
        minimum: 0, allRefinementsAccepted: true,
        explicitMonoRichBasinSearch: { allRequiredSearchesAccepted: true },
      },
      dispersed: {
        minimum: 0, allRefinementsAccepted: true,
        explicitMonoRichBasinSearch: { allRequiredSearchesAccepted: true },
      },
    },
  },
};

function acceptedJobCResult() {
  const fullResponse: any = JSON.parse(JSON.stringify(qualifier));
  fullResponse.resultHash = jobCScientificResultHash(fullResponse);
  const cells = Array.from({ length: 7 }, (_, index) => ({
    numericalCell: index + 1,
    exactBoundaryQualifier: {
      status: 'QUALIFIED_JOB_C_BOUNDARY_BRANCH',
      fullResponseSha256: fullResponse.resultHash,
      fullResponse,
    },
  }));
  const result: any = {
    status: 'CALCULATED_PRELIMINARY_JOB_C',
    dependencies: {
      stage1SnapshotHash: hash,
      jobAResultSha256: hash,
      jobBResultSha256: hash,
      stage3ImmutableHash: hash,
      stage2EngineHash: hash,
      jobBInterfaceArtifactSha256: hash,
      jobBInterfaceWorkerSha256: hash,
      jobCBoundaryInterfaceQualifierSha256: hash,
      jobCBranchContinuationSha256: hash,
    },
    workerResult: {
      status: 'CALCULATED_PRELIMINARY_JOB_C',
      resultSha256: hash,
      sensitivityCases: [{
        selected: {
          heightM: 1,
          recoveryPctNmpFreeRrboHydrocarbonMassBasis: 91,
          outletDuty: { lambda: 1, productDuty: { targetRecoveryPct: 90 } },
          exactQualificationStatus: 'QUALIFIED_JOB_C_BOUNDARY_BRANCH_7_OF_7_REPLAYED',
          residualDiagnostics: {
            exactQualifiedCellCount: 7,
            maximumExactCellResidualMolS: 1e-9,
            maximumExactScaledCellResidual: 1e-9,
            maximumExactGlobalBalanceResidualMolS: 1e-9,
            minimumLocalComponentFlowMolS: 1e-4,
          },
          numericalCells: cells,
        },
      }],
    },
  };
  result.workerResult.resultSha256 = jobCScientificResultHash(result.workerResult);
  result.resultSha256 = jobCResultHash(result);
  return result;
}

const identity = {
  implementationId: 'controlled-test-closure',
  version: '1',
  implementationHash: hash,
};

function dependencies(observedPhysicalCounts: number[]): KuhniMassTransferDependencies {
  return {
    kernelArtifactHash: 'b'.repeat(64),
    operatingHydraulics: {
      ...identity,
      evaluate: state => {
        observedPhysicalCounts.push(state.physicalCompartments);
        return {
          operatingHoldup: 0.2,
          d32M: 0.002,
          areaModelStatus: 'CALCULATED_IN_RANGE',
          applicability: [],
          uncertainty: [],
        };
      },
    },
    equilibrium: {
      ...identity,
      evaluate: () => ({
        continuousEquilibriumComposition: [0.2, 0.8],
        dispersedEquilibriumComposition: [0.8, 0.2],
        applicability: [],
        uncertainty: [],
      }),
      generateReferenceDuty: ({ theoreticalStages }) => ({ id: `ideal-${theoreticalStages}` }),
    },
    massTransfer: {
      ...identity,
      fluxFrame: {
        kind: 'MOLAR_AVERAGE',
        dependentComponentTreatment: 'B',
        constraint: 'ZERO_SUM_DIFFUSIVE_MOLAR_FLUX',
      },
      evaluate: request => ({
        componentTransferMolS: [
          0.2 * request.continuousInMolarFlowMolS[0],
          -0.02 * request.continuousInMolarFlowMolS[0],
        ],
        componentDiffusiveFluxMolS: [0.1, -0.1],
        applicability: [],
        uncertainty: [],
      }),
    },
    axialMixing: createNoAxialMixingClosure(identity),
  };
}

function massTransferInput(): Omit<KuhniMassTransferInput, 'hydraulicCandidates'> {
  return {
    lineage: {
      stage1SnapshotHash: hash,
      stage2: {
        modelId: 'model', modelHash: hash, engineId: 'engine', engineHash: hash,
        equilibriumId: 'equilibrium', equilibriumHash: hash,
      },
      stage3: { runId: 'stage3', version: '1.1.0', immutableHash: hash },
      propertyPackageHash: hash,
      evidencePackageHash: hash,
      hardwareGeometry: { source: 'controlled accepted basis', hash, status: 'GOVERNED' },
    },
    componentIds: ['A', 'B'],
    continuousFeed: { componentMolarFlowMolS: [1, 1] },
    dispersedFeed: { componentMolarFlowMolS: [0.1, 1] },
    stage2UnavailableReason: 'controlled test uses the admitted default basis',
    maximumCompartments: 8,
    maximumActiveHeightM: 4,
    dutyAcceptance: {
      id: 'controlled-recovery-duty',
      version: '1',
      implementationHash: hash,
      targets: [{
        phase: 'continuous', componentId: 'A', metric: 'MOLAR_FLOW_MOL_S',
        comparator: 'LTE', target: 0.65, tolerance: 0,
      }],
    },
  };
}

function input(counts: number[]): AcceptedJobCPhysicalSizingInput {
  return {
    jobCResult: acceptedJobCResult(),
    mechanicalBasis: {
      source: 'controlled fixed Kühni mechanical spacing fixture',
      hash,
      status: 'GOVERNED',
      spacingRule: 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M',
      compartmentHeightM: 0.5,
    },
    hydraulicCandidates: [
      {
        candidate: {
          ordinal: 1, rpm: 20, columnDiameterM: 0.8, compartmentHeightM: 0.5,
          powerVolumeWM3: 10, trialId: 'rpm:20', trialImmutableHash: hash,
          status: 'CALCULATED_IN_RANGE', applicability: [], uncertainty: [],
          pilotValidated: false, hydraulicallyFeasible: true,
        },
        stage3Evidence: {
          columnDiameterM: 0.8, rpm: 20, compartmentHeightM: 0.5,
          d32M: 0.002, operatingHoldup: 0.2, floodHoldup: 0.4,
        },
      },
      {
        candidate: {
          ordinal: 2, rpm: 30, columnDiameterM: 1, compartmentHeightM: 0.5,
          powerVolumeWM3: 10, trialId: 'rpm:30', trialImmutableHash: hash,
          status: 'CALCULATED_IN_RANGE', applicability: [], uncertainty: [],
          pilotValidated: false, hydraulicallyFeasible: true,
        },
        stage3Evidence: {
          columnDiameterM: 1, rpm: 30, compartmentHeightM: 0.5,
          d32M: 0.002, operatingHoldup: 0.2, floodHoldup: 0.4,
        },
      },
    ],
    massTransferInput: massTransferInput(),
    dependencies: dependencies(counts),
    revalidateRoundedGeometry: (candidate, installedHeightM, physicalCompartments) => ({
      d32M: candidate.stage3Evidence.d32M,
      operatingHoldup: candidate.stage3Evidence.operatingHoldup,
      floodHoldup: candidate.stage3Evidence.floodHoldup,
      hydraulicCriteriaPassed: installedHeightM === physicalCompartments
        * candidate.candidate.compartmentHeightM,
      provenance: 'CONTROLLED_ROUNDED_GEOMETRY_REVALIDATION',
    }),
  };
}

function moleFractions(weights: number[]) {
  const moles = weights.map((weight, index) =>
    weight / JOB_A_MOLECULAR_DATA[JOB_A_COMPONENT_ORDER[index]].molecularWeightGmol);
  const total = moles.reduce((sum, value) => sum + value, 0);
  return moles.map(value => value / total);
}

function workerTransportInput() {
  const source: any = acceptedJobCResult();
  const processBasis: any = {
    schemaVersion: 'ECR_PRE_PILOT_HYDRODYNAMIC_PROCESS_BASIS_V1',
    stage1SnapshotHash: hash,
    operatingTemperatureC: 40,
    temperatureK: 313.15,
    operatingPressure: 'atmospheric',
    phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
    composition: {
      rrboGrade: 'controlled fixture',
      rrboFeedWt: {
        saturates: 40, monoAromatics: 20, diAromatics: 20, polyAromatics: 10,
        polarAromatics: 10, nmp: 0,
      },
      wetSolventWt: { nmp: 95, water: 5 },
    },
    rrboFeed: {
      identity: 'RRBO_FEED', valueLph: 360, conversion: 'fixture',
      flowM3S: 1e-4, densityKgM3: 878, dynamicViscosityPaS: 0.056,
    },
    wetSolventPhase: {
      identity: 'WET_NMP_SOLVENT_PHASE', solventOilMassRatio: 1, conversion: 'fixture',
      flowM3S: 1e-4, densityKgM3: 1028, dynamicViscosityPaS: 0.001666,
    },
    interfacialTensionNM: 0.012,
  };
  const workerRequest: any = {
    componentOrder: [...JOB_A_COMPONENT_ORDER],
    temperatureK: processBasis.temperatureK,
    continuousFeedMolS: [1, 1, 1, 1, 1, 1, 1],
    dispersedFeedMolS: [1, 1, 1, 1, 1, 1, 1],
    continuousTotalConcentrationMolM3: 1,
    dispersedTotalConcentrationMolM3: 1,
    // Deliberately unlike Job-A's recalculated films.
    kc: Array(7).fill(1),
    kd: Array(7).fill(2),
    phaseConfiguration: processBasis.phaseConfiguration,
    compartments: 7,
    columnDiameterM: 1.2,
    rpm: 30,
    operatingHoldup: 0.2,
    d32M: 0.002,
    minimumRecoveryPct: 90,
    boundaryBranchQualificationRequest: {
      componentOrder: [...JOB_A_COMPONENT_ORDER],
      T: processBasis.temperatureK,
      x_bulk_continuous: [0, 0, 0, 0, 0, .95, .05],
      x_bulk_dispersed: moleFractions([40, 20, 20, 10, 10, 0, 0]),
      kc: Array(7).fill(1),
      kd: Array(7).fill(2),
      CtC: 1,
      CtD: 1,
      phase_config: processBasis.phaseConfiguration,
      provenance: { qualification: 'RECORDED_STAGE2_FEED_END_LOCAL_CONTACT_STATE' },
    },
    jobAFilmRecalculationBasis: {
      sourceJobAResultSha256: hash,
      stage1SnapshotHash: hash,
      theoreticalStages: 7,
      theoreticalStageProvenance: 'PRE_PILOT_DESIGN_DEFAULT',
      stage2JobId: null,
      stage2ResultHash: null,
      stage2EngineHash: hash,
      thermodynamicAdapterPreflightHash: hash,
      stage3RunId: 'controlled-stage3',
      stage3ImmutableHash: hash,
      stage3ImplementationHash: hash,
      temperatureK: processBasis.temperatureK,
      interfacialTensionNM: processBasis.interfacialTensionNM,
      continuous: {
        densityKgM3: processBasis.wetSolventPhase.densityKgM3,
        dynamicViscosityPaS: processBasis.wetSolventPhase.dynamicViscosityPaS,
        moleFractions: moleFractions([0, 0, 0, 0, 0, 95, 5]),
      },
      dispersed: {
        densityKgM3: processBasis.rrboFeed.densityKgM3,
        dynamicViscosityPaS: processBasis.rrboFeed.dynamicViscosityPaS,
        moleFractions: moleFractions([40, 20, 20, 10, 10, 0, 0]),
      },
    },
  };
  const branch = workerRequest.boundaryBranchQualificationRequest;
  branch.sourceStateSha256 = jobCResultHash(branch);
  source.dependencies.workerRequestSha256 = jobCResultHash(workerRequest);
  source.resultSha256 = jobCResultHash(source);
  return {
    source,
    workerRequest: workerRequest as JobCWorkerRequest,
    processBasis,
    hydraulicCandidates: [{
      candidate: {
        ordinal: 0, rpm: 30, columnDiameterM: 1.2, compartmentHeightM: 0.5,
        powerVolumeWM3: 1, trialId: 'candidate-0', trialImmutableHash: hash,
        status: 'CALCULATED_IN_RANGE', applicability: [], uncertainty: [],
        pilotValidated: false, hydraulicallyFeasible: true,
      },
      stage3Evidence: {
        columnDiameterM: 1.2, rpm: 30, compartmentHeightM: 0.5,
        d32M: 0.002, operatingHoldup: 0.2, floodHoldup: 0.4,
      },
    }],
  };
}

function workerTransportSizingInvocation() {
  const { source, workerRequest, processBasis, hydraulicCandidates } = workerTransportInput();
  return {
    source,
    workerRequest,
    invocation: {
      jobCResult: source,
      completedQueueJob: {
        status: 'completed' as const,
        result: source,
        resultHash: jobCScientificResultHash(source),
        input: { prepared: { workerRequest } },
      },
      workerRequest,
      mechanicalBasis: {
        source: 'controlled fixed Kühni mechanical spacing fixture',
        hash,
        status: 'GOVERNED' as const,
        spacingRule: 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M' as const,
        compartmentHeightM: 0.5,
      },
      processBasis,
      hydraulicCandidates,
    },
  };
}

describe('accepted Job-C physical Kühni sizing bridge', () => {
  it('sizes controlled accepted full-transfer evidence and distinguishes physical from numerical compartments', () => {
    const counts: number[] = [];
    const result = sizeAcceptedJobCPhysicalKuhniColumn(input(counts));
    expect(result.status).toBe('CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING');
    if (result.status !== 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING') return;
    expect(result.admission.accepted).toBe(true);
    expect(result.requiredHeightM).toBe(1);
    expect(result.installedHeightM).toBe(1);
    expect(result.physicalCompartments).toBe(2);
    expect(result.numericalCompartments).toBe(7);
    expect(result.compartmentMapping.overallEfficiency).toBeNull();
    expect(result.finalGeometry).toMatchObject({
      rpm: 20, diameterM: 0.8, d32M: 0.002, operatingHoldup: 0.2,
      floodHoldup: 0.4, roundedGeometryRevalidated: true,
    });
    expect(counts).toContain(1);
    expect(counts).toContain(2);
  });

  it('rejects workflow/partial results before any sizing transport calculation', () => {
    const counts: number[] = [];
    const candidate = input(counts);
    candidate.jobCResult.status = 'CALCULATED_WORKFLOW_TEST_ONLY_JOB_C';
    candidate.jobCResult.workerResult.status = 'CALCULATED_WORKFLOW_TEST_ONLY_JOB_C';
    candidate.jobCResult.workerResult.diagnosticOnly = true;
    const result = sizeAcceptedJobCPhysicalKuhniColumn(candidate);
    expect(result).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      reasons: expect.arrayContaining(['JOB_C_FULL_LAMBDA_ACCEPTED_RESULT_REQUIRED']),
    });
    expect(counts).toEqual([]);
  });

  it('fails closed when a signed worker, outer response, or qualifier is tampered', () => {
    const tamperedWorker: any = acceptedJobCResult();
    tamperedWorker.workerResult.sensitivityCases[0].selected.heightM = 1.1;
    expect(assessAcceptedJobCForPhysicalSizing(tamperedWorker).reasons).toContain(
      'JOB_C_WORKER_SCIENTIFIC_RESULT_INTEGRITY_REQUIRED',
    );

    const tamperedOuter: any = acceptedJobCResult();
    tamperedOuter.physicalSizing = { status: 'INVENTED' };
    expect(assessAcceptedJobCForPhysicalSizing(tamperedOuter).reasons).toContain(
      'JOB_C_OUTER_RESULT_INTEGRITY_REQUIRED',
    );

    const tamperedQualifier: any = acceptedJobCResult();
    tamperedQualifier.workerResult.sensitivityCases[0].selected.numericalCells[0]
      .exactBoundaryQualifier.fullResponse.selectedGateEvidence
      .localStability.continuous.minimumEigenvalue = -1;
    tamperedQualifier.workerResult.resultSha256 = jobCScientificResultHash(
      tamperedQualifier.workerResult,
    );
    tamperedQualifier.resultSha256 = jobCResultHash(tamperedQualifier);
    expect(assessAcceptedJobCForPhysicalSizing(tamperedQualifier).reasons).toContain(
      'JOB_C_FULL_TRANSFER_EXACT_CELL_QUALIFICATION_REQUIRED',
    );

    const duplicateOrdinal: any = acceptedJobCResult();
    duplicateOrdinal.workerResult.sensitivityCases[0].selected.numericalCells[1].numericalCell = 1;
    duplicateOrdinal.workerResult.resultSha256 = jobCScientificResultHash(
      duplicateOrdinal.workerResult,
    );
    duplicateOrdinal.resultSha256 = jobCResultHash(duplicateOrdinal);
    expect(assessAcceptedJobCForPhysicalSizing(duplicateOrdinal).reasons).toContain(
      'JOB_C_FULL_TRANSFER_EXACT_CELL_QUALIFICATION_REQUIRED',
    );
  });

  it('requires an explicit governed mechanical spacing basis', () => {
    const candidate = input([]);
    candidate.mechanicalBasis = null;
    expect(() => sizeAcceptedJobCPhysicalKuhniColumn(candidate)).toThrow(
      'SUPPORTED_MECHANICAL_SPACING_BASIS_REQUIRED',
    );
  });

  it('selects the coupled RPM/diameter deterministically and blocks only missing mechanical authority', () => {
    const first = sizeAcceptedJobCPhysicalKuhniColumn(input([]));
    const second = sizeAcceptedJobCPhysicalKuhniColumn(input([]));
    expect(first.status).toBe('CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING');
    expect(second.status).toBe('CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING');
    if (first.status === 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING'
      && second.status === 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING') {
      expect(first.finalGeometry).toEqual(second.finalGeometry);
      expect(first.transport.resultHash).toBe(second.transport.resultHash);
    }
    const summary = summarizeJobCPhysicalSizingDependency(acceptedJobCResult());
    expect(summary).toMatchObject({
      status: 'DEPENDENCY_BLOCKED',
      physicalCompartments: null,
      finalOperatingRpm: null,
    });
    expect(summary.requiredDependencies).toContain(
      'SUPPORTED_PHYSICAL_MECHANICAL_COMPARTMENT_SPACING_BASIS',
    );
  });

  it('blocks mismatched mechanical spacing before it can reuse a V1.1 hydraulic trial', async () => {
    const source: any = acceptedJobCResult();
    const workerRequest: any = { componentOrder: ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'] };
    source.dependencies.workerRequestSha256 = jobCResultHash(workerRequest);
    source.resultSha256 = jobCResultHash(source);
    const result = await sizeAcceptedJobCWithWorkerTransport({
      jobCResult: source,
      completedQueueJob: {
        status: 'completed', result: source, resultHash: jobCScientificResultHash(source),
        input: { prepared: { workerRequest } },
      },
      workerRequest,
      mechanicalBasis: {
        source: 'different spacing drawing', hash, status: 'GOVERNED',
        spacingRule: 'STAGE3_FROZEN_COMPARTMENT_HEIGHT_M', compartmentHeightM: 0.5,
      },
      processBasis: {
        phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
        interfacialTensionNM: 0.012,
        rrboFeed: { flowM3S: 1e-4, densityKgM3: 878, dynamicViscosityPaS: 0.056 },
        wetSolventPhase: { flowM3S: 1e-4, densityKgM3: 1028, dynamicViscosityPaS: 0.001666 },
      } as any,
      hydraulicCandidates: [{
        candidate: {
          ordinal: 0, rpm: 30, columnDiameterM: 1.2, compartmentHeightM: 0.6,
          powerVolumeWM3: 1, trialId: 'candidate-0', trialImmutableHash: hash,
          status: 'CALCULATED_IN_RANGE', applicability: [], uncertainty: [],
          pilotValidated: false, hydraulicallyFeasible: true,
        },
        stage3Evidence: {
          columnDiameterM: 1.2, rpm: 30, compartmentHeightM: 0.6,
          d32M: 0.002, operatingHoldup: 0.2, floodHoldup: 0.4,
        },
      }],
    });
    expect(result).toMatchObject({
      status: 'NO_PHYSICAL_SIZING_SOLUTION',
      trialEvidence: [{
        status: 'MECHANICAL_SPACING_HYDRAULIC_GEOMETRY_MISMATCH',
      }],
    });
  });

  it('recalculates candidate Job-A films, searches that candidate height, and revalidates its rounded hardware height through the controlled worker seam', async () => {
    const { source, workerRequest, invocation } = workerTransportSizingInvocation();
    const calls: Array<{ request: JobCWorkerRequest; operation: string }> = [];
    const restore = setJobCPhysicalSizingWorkerTransportForTest(async (request, { operation }) => {
      calls.push({ request, operation });
      const response: any = JSON.parse(JSON.stringify(source.workerResult));
      const selected = response.sensitivityCases[0].selected;
      const physicalTrial = request.physicalSizingTrial as any;
      const heightM = operation === 'SOLVE_HEIGHT' ? 1.1 : physicalTrial.installedHeightM;
      selected.heightM = heightM;
      selected.profileSolvedHeightM = heightM;
      if (operation === 'REVALIDATE_PHYSICAL_TRIAL') {
        selected.physicalSizingTrial = {
          ...physicalTrial,
          transportRecomputed: true,
          physicalCompartmentsAreNotNumericalCells: true,
        };
        response.physicalSizingRevalidation = {
          status: 'RECALCULATED_FULL_LAMBDA_TRANSPORT',
          physicalSizingTrial: physicalTrial,
        };
      }
      response.resultSha256 = jobCScientificResultHash(response);
      return response;
    });
    try {
      const result = await sizeAcceptedJobCWithWorkerTransport(invocation);
      expect(result.status).toBe('CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING');
      if (result.status !== 'CALCULATED_PRELIMINARY_PHYSICAL_KUHNI_SIZING') return;
      expect(calls.map(call => call.operation)).toEqual([
        'SOLVE_HEIGHT', 'REVALIDATE_PHYSICAL_TRIAL',
      ]);
      expect(calls[0].request.kc).not.toEqual(workerRequest.kc);
      expect(calls[0].request.kd).not.toEqual(workerRequest.kd);
      expect(calls[1].request.kc).toEqual(calls[0].request.kc);
      expect(calls[1].request.kd).toEqual(calls[0].request.kd);
      expect(result.requiredHeightM).toBe(1.1);
      expect(result.installedHeightM).toBe(1.5);
      expect(result.physicalCompartments).toBe(3);
      expect(result.trialEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          status: 'FEASIBLE',
          requiredHeightM: 1.1,
        }),
      ]));
    } finally {
      restore();
    }
  });

  it('records a worker throw during candidate height search without referencing an uncreated physical trial', async () => {
    const { invocation } = workerTransportSizingInvocation();
    const restore = setJobCPhysicalSizingWorkerTransportForTest(async () => {
      throw new Error('controlled height-search transport failure');
    });
    try {
      const result = await sizeAcceptedJobCWithWorkerTransport(invocation);
      expect(result).toMatchObject({
        status: 'NO_PHYSICAL_SIZING_SOLUTION',
        trialEvidence: [expect.objectContaining({
          status: 'TRANSPORT_REVALIDATION_FAILED',
          reason: 'controlled height-search transport failure',
        })],
      });
      if (result.status === 'NO_PHYSICAL_SIZING_SOLUTION') {
        expect(result.trialEvidence[0]).not.toHaveProperty('physicalTrial');
      }
    } finally {
      restore();
    }
  });

  it('recalculates films and sends a seeded, direct fixed-partial-lambda trial without a Job-C continuation', async () => {
    const { source, workerRequest, processBasis, hydraulicCandidates } = workerTransportInput();
    (workerRequest as any).diagnosticMode = {
      mode: 'STRICT_PARTIAL_TRANSFER_DIAGNOSTIC_LAMBDA_8E_MINUS_9_V1',
      terminalLambda: 8e-9, heightTrialM: 2, normalAcceptancePermitted: false,
    };
    (workerRequest as any).continuationAnchor = { poisonedSourceModeMustNotLeak: true };
    const anchorState = Array(189).fill(1);
    const anchor: any = {
      sourceJobId: 'strict-anchor-id',
      sourceResultHash: hash,
      profileStateSha256: jobCResultHash(anchorState),
      profileState: anchorState,
      sourceDependencies: source.dependencies,
    };
    const calls: Array<{ request: JobCWorkerRequest; operation: string }> = [];
    const restore = setJobCPhysicalSizingWorkerTransportForTest(async (request, { operation }) => {
      calls.push({ request, operation });
      const trial = request.partialTransferSizingTrial;
      const echoedTrial = calls.length === 2
        ? { ...trial, sourceAnchorResultSha256: 'b'.repeat(64) } : trial;
      const rawResidual = calls.length === 3 ? Number.POSITIVE_INFINITY : 1e-8;
      return {
        status: 'CALCULATED_DIRECT_PARTIAL_TRANSFER_CANDIDATE',
        partialTransferSizingRevalidation: { partialTransferSizingTrial: echoedTrial },
        sensitivityCases: [{
          selected: {
            partialTransferLambda: 8e-9,
            profileSolvedHeightM: 3,
            recoveryPctNmpFreeRrboHydrocarbonMassBasis: 91,
            directSolve: {
              homotopyUsed: false,
              sourceAnchorStateSha256: trial?.sourceAnchorStateSha256,
            },
            numericalCells: Array.from({ length: 7 }, (_, index) => ({ numericalCell: index + 1 })),
            gateMetrics: {
              rawFvGatePassed: true, scaledFvGatePassed: true,
              originalJobBGatePassed: true, strictPositivityPassed: true, accepted: true,
              rawFvResidualMolS: rawResidual, scaledFvResidual: 1e-8,
              maximumOriginalJobBGateResidual: 1e-8, minimumFlowMolS: 0.1,
            },
          },
        }],
      };
    });
    try {
      const result = await solveDirectPartialTransferSizingCandidate({
        anchor, workerRequest, processBasis, candidate: hydraulicCandidates[0], heightM: 3,
      });
      expect(result.status).toBe('TRANSPORT_GATES_PASSED');
      expect(calls).toHaveLength(1);
      expect(calls[0].operation).toBe('SOLVE_FIXED_PARTIAL_TRANSFER_TRIAL');
      expect(calls[0].request.kc).not.toEqual(workerRequest.kc);
      expect(calls[0].request.kd).not.toEqual(workerRequest.kd);
      expect(calls[0].request.partialTransferSizingTrial).toMatchObject({
        sourceAnchorJobId: 'strict-anchor-id', lambda: 8e-9, heightM: 3,
        profileState: anchorState,
      });
      expect(calls[0].request).not.toHaveProperty('continuationAnchor');
      expect(calls[0].request).not.toHaveProperty('resumeCheckpoint');
      expect(calls[0].request).not.toHaveProperty('diagnosticMode');
      const poisonedEcho = await solveDirectPartialTransferSizingCandidate({
        anchor, workerRequest, processBasis, candidate: hydraulicCandidates[0], heightM: 3,
      });
      expect(poisonedEcho).toMatchObject({
        status: 'TRANSPORT_GATE_REJECTED',
        reason: 'PARTIAL_TRANSFER_DIRECT_CANDIDATE_RESPONSE_OR_GATE_INVALID',
      });
      const nonFiniteGate = await solveDirectPartialTransferSizingCandidate({
        anchor, workerRequest, processBasis, candidate: hydraulicCandidates[0], heightM: 3,
      });
      expect(nonFiniteGate).toMatchObject({
        status: 'TRANSPORT_GATE_REJECTED',
        reason: 'PARTIAL_TRANSFER_DIRECT_CANDIDATE_RESPONSE_OR_GATE_INVALID',
      });
    } finally {
      restore();
    }
  });
});