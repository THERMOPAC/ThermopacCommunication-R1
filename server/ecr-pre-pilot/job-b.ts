import { createHash } from 'node:crypto';
import {
  JOB_A_COMPONENT_ORDER,
  JOB_A_IMPLEMENTATION_SHA256,
  JOB_A_MOLECULAR_DATA,
  JOB_A_STAGE2_ENGINE_ID,
  JOB_A_STAGE2_ENGINE_VERSION,
  jobAResultHash,
} from './job-a';

export const JOB_B_VERSION = 'ECR_PRE_PILOT_JOB_B_LOCAL_FLUX_V1' as const;
export const JOB_B_COMPONENT_ORDER = JOB_A_COMPONENT_ORDER;
export const JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S = 1e-12;
export const JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE = 1e-10;
export const JOB_B_IMPLEMENTATION_SHA256 = createHash('sha256').update([
  JOB_B_VERSION,
  'JOB_A_KC_KD_AND_DIFFUSIVITY_ONLY',
  'FROZEN_STAGE3_OPERATING_HOLDUP_D32',
  'ACTUAL_7C_1_5_LOCAL_EQUILIBRIUM',
  'POSITIVE_CONTINUOUS_TO_DISPERSED',
  'AREA_6_PHI_D_OVER_D32_ONCE',
  'ALGEBRAIC_TWO_FILM_LINEAR_PARTITION',
  'M_EQUALS_CD_STAR_OVER_CC_STAR',
  'FIXED_BULK_CT_RHO_OVER_MW_PRELIMINARY',
  'CLOSURE_SCALE_MAX_ABSOLUTE_FILM_FLUX_NO_FLOOR',
  `FILM_ABS_TOL=${JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S}`,
  `FILM_REL_TOL=${JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE}`,
].join('|')).digest('hex');

type RecordValue = Record<string, any>;
export class JobBDependencyError extends Error {
  readonly details: Record<string, unknown>;
  constructor(message: string, details: Record<string, unknown>) {
    super(message);
    this.name = 'JobBDependencyError';
    this.details = details;
  }
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('JOB_B_NON_FINITE_HASH_INPUT');
  return JSON.stringify(value);
};
const sha256 = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export interface JobBInput {
  jobA: RecordValue;
  operatingHoldup: number;
  stage3OperatingHydraulicsStatus: string;
  phaseConfiguration: 'nmp-continuous-rrbo-dispersed' | 'rrbo-continuous-nmp-dispersed';
  equilibrium: RecordValue;
}

export function assertJobBStage3ParentMatchesJobA(jobA: RecordValue, stage3: RecordValue | null): void {
  if (!stage3
    || stage3.id !== jobA?.dependencies?.stage3RunId
    || stage3.immutableHash !== jobA?.dependencies?.stage3ImmutableHash) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:STAGE3_PARENT_CHANGED_AFTER_JOB_A');
  }
}

export function jobBResultHash(value: unknown): string {
  const snapshot = value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => key !== 'resultSha256'))
    : value;
  return sha256(snapshot);
}

function phaseMolarConcentrations(jobA: RecordValue, phase: 'continuous' | 'dispersed') {
  const state = jobA.input?.[phase];
  const fractions = state?.moleFractions;
  if (!finite(state?.densityKgM3) || state.densityKgM3 <= 0
    || !Array.isArray(fractions) || fractions.length !== 7
    || fractions.some((x: unknown) => !finite(x) || x < 0)) {
    throw new Error(`JOB_B_INVALID_JOB_A_${phase.toUpperCase()}_STATE`);
  }
  const averageMwKgMol = fractions.reduce((sum: number, x: number, index: number) =>
    sum + x * JOB_A_MOLECULAR_DATA[JOB_B_COMPONENT_ORDER[index]].molecularWeightGmol / 1000, 0);
  const totalMolarConcentrationMolM3 = state.densityKgM3 / averageMwKgMol;
  return {
    moleFractions: [...fractions],
    averageMwKgMol,
    totalMolarConcentrationMolM3,
    componentMolarConcentrationMolM3: fractions.map((x: number) => x * totalMolarConcentrationMolM3),
  };
}

/** Historical diagnostic only. Not a permitted thermodynamic state for active Job B. */
export function makeJobBLocalEquilibriumInventory(jobA: RecordValue, operatingHoldup: number) {
  if (!finite(operatingHoldup) || !(operatingHoldup > 0 && operatingHoldup < 1)) {
    throw new Error('JOB_B_INVALID_FROZEN_OPERATING_HOLDUP');
  }
  const continuous = phaseMolarConcentrations(jobA, 'continuous');
  const dispersed = phaseMolarConcentrations(jobA, 'dispersed');
  return JOB_B_COMPONENT_ORDER.map((_, index) =>
    (1 - operatingHoldup) * continuous.componentMolarConcentrationMolM3[index]
    + operatingHoldup * dispersed.componentMolarConcentrationMolM3[index]);
}

/** Historical algebraic diagnostic, superseded by job-b-simultaneous. No application route calls this. */
export function evaluateJobB(input: JobBInput) {
  const { jobA, equilibrium } = input;
  if (jobA?.status !== 'JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION'
    || jobA?.implementationSha256 !== JOB_A_IMPLEMENTATION_SHA256
    || jobA?.legacyPathInvoked !== false
    || JSON.stringify(jobA?.componentOrder) !== JSON.stringify(JOB_B_COMPONENT_ORDER)
    || !hash(jobA?.resultSha256)
    || jobA.resultSha256 !== jobAResultHash(jobA)) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:VALID_JOB_A_RESULT_REQUIRED');
  }
  if (input.stage3OperatingHydraulicsStatus !== 'OPERATING_HOLDUP_CALCULATED'
    || !finite(input.operatingHoldup) || !(input.operatingHoldup > 0 && input.operatingHoldup < 1)
    || jobA?.localHydraulics?.source !== 'FROZEN_STAGE_3_LOCAL_STATE'
    || jobA?.localHydraulics?.recomputedHoldup !== false
    || jobA?.localHydraulics?.recomputedDropSize !== false) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:VALID_FROZEN_STAGE3_LOCAL_STATE_REQUIRED');
  }
  if (!['nmp-continuous-rrbo-dispersed', 'rrbo-continuous-nmp-dispersed']
    .includes(input.phaseConfiguration)) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:UNSUPPORTED_PHASE_CONFIGURATION');
  }
  if (equilibrium?.status !== 'CALCULATED'
    || equilibrium?.operation !== 'LOCAL_EQUILIBRIUM'
    || equilibrium?.engineId !== JOB_A_STAGE2_ENGINE_ID
    || equilibrium?.engineVersion !== JOB_A_STAGE2_ENGINE_VERSION
    || equilibrium?.phaseOrientation !== 'NMP_RICH_EXTRACT'
    || JSON.stringify(equilibrium?.componentOrder) !== JSON.stringify(JOB_B_COMPONENT_ORDER)
    || !hash(equilibrium?.engineHash) || !hash(equilibrium?.resultHash)
    || equilibrium.engineHash !== jobA?.thermodynamicAuthority?.engineHash) {
    const gates = equilibrium?.gates ?? {};
    throw new JobBDependencyError(
      'JOB_B_DEPENDENCY_BLOCKED:SOLVED_7C_1_5_LOCAL_EQUILIBRIUM_REQUIRED',
      {
        dependency: 'PINNED_LOCAL_EQUILIBRIUM',
        adapterStatus: equilibrium?.status ?? null,
        adapterResultHash: hash(equilibrium?.resultHash) ? equilibrium.resultHash : null,
        engineId: equilibrium?.engineId ?? null,
        engineVersion: equilibrium?.engineVersion ?? null,
        engineHash: hash(equilibrium?.engineHash) ? equilibrium.engineHash : null,
        operation: equilibrium?.operation ?? null,
        optimizerConverged: typeof gates.optimizerConverged === 'boolean'
          ? gates.optimizerConverged : null,
        isoactivityLogResidual: finite(gates.isoactivityLogResidual)
          ? gates.isoactivityLogResidual : null,
        materialBalanceResidual: finite(gates.materialBalanceResidual)
          ? gates.materialBalanceResidual : null,
        maximumCompositionSeparation: finite(gates.maximumCompositionSeparation)
          ? gates.maximumCompositionSeparation : null,
        gibbsReduction: finite(gates.gibbsReduction) ? gates.gibbsReduction : null,
        fluxMetricsReturned: false,
      },
    );
  }
  const d32M = jobA.localHydraulics.d32M;
  if (!finite(d32M) || d32M <= 0) throw new Error('JOB_B_DEPENDENCY_BLOCKED:INVALID_STAGE3_D32');
  const continuous = phaseMolarConcentrations(jobA, 'continuous');
  const dispersed = phaseMolarConcentrations(jobA, 'dispersed');
  const nmpContinuous = input.phaseConfiguration === 'nmp-continuous-rrbo-dispersed';
  const continuousEqX = equilibrium[nmpContinuous ? 'extractComposition' : 'raffinateComposition'];
  const dispersedEqX = equilibrium[nmpContinuous ? 'raffinateComposition' : 'extractComposition'];
  if (![continuousEqX, dispersedEqX].every(vector => Array.isArray(vector)
    && vector.length === 7 && vector.every((x: unknown) => finite(x) && x >= 0)
    && Math.abs(vector.reduce((a: number, b: number) => a + b, 0) - 1) <= 1e-8)) {
    throw new Error('JOB_B_DEPENDENCY_BLOCKED:INVALID_EQUILIBRIUM_PHASE_STATE');
  }
  const byKey = new Map((jobA.cells as RecordValue[]).map(cell =>
    [`${cell.componentId}:${cell.phase}`, cell]));
  const areaM2M3 = 6 * input.operatingHoldup / d32M;
  const rows = JOB_B_COMPONENT_ORDER.map((componentId, index) => {
    const c = byKey.get(`${componentId}:continuous`);
    const d = byKey.get(`${componentId}:dispersed`);
    if (!c || !d || !finite(c.filmCoefficientMS) || !finite(d.filmCoefficientMS)
      || !(c.filmCoefficientMS > 0) || !(d.filmCoefficientMS > 0)
      || !finite(c.diffusivityM2S) || !finite(d.diffusivityM2S)
      || !(c.diffusivityM2S > 0) || !(d.diffusivityM2S > 0)) {
      throw new Error(`JOB_B_DEPENDENCY_BLOCKED:JOB_A_CELL_MISSING:${componentId}`);
    }
    const bulkContinuousMolM3 = continuous.componentMolarConcentrationMolM3[index];
    const bulkDispersedMolM3 = dispersed.componentMolarConcentrationMolM3[index];
    // An absent component has no local inventory in either bulk.  Its tie-line
    // ratio may be 0/0, but its bounded source is explicitly zero.
    const inactiveZeroInventory = bulkContinuousMolM3 === 0 && bulkDispersedMolM3 === 0;
    const continuousStarMolM3 = continuousEqX[index] * continuous.totalMolarConcentrationMolM3;
    const dispersedStarMolM3 = dispersedEqX[index] * dispersed.totalMolarConcentrationMolM3;
    if (!inactiveZeroInventory && (!(continuousStarMolM3 > 0) || !(dispersedStarMolM3 >= 0))) {
      throw new Error(`JOB_B_DEPENDENCY_BLOCKED:INVALID_PARTITION_FOR_PRESENT_COMPONENT:${componentId}`);
    }
    const partitionM = inactiveZeroInventory ? null : dispersedStarMolM3 / continuousStarMolM3;
    if (!inactiveZeroInventory && (!finite(partitionM) || !(partitionM > 0))) {
      throw new Error(`JOB_B_DEPENDENCY_BLOCKED:INVALID_PARTITION_FOR_PRESENT_COMPONENT:${componentId}`);
    }
    const denominator = inactiveZeroInventory ? null : c.filmCoefficientMS + partitionM! * d.filmCoefficientMS;
    if (!inactiveZeroInventory && (!finite(denominator) || !(denominator > 0))) {
      throw new Error(`JOB_B_DEPENDENCY_BLOCKED:INVALID_TWO_FILM_DENOMINATOR:${componentId}`);
    }
    const continuousInterfaceMolM3 = inactiveZeroInventory ? 0
      : (c.filmCoefficientMS * bulkContinuousMolM3 + d.filmCoefficientMS * bulkDispersedMolM3) / denominator!;
    const dispersedInterfaceMolM3 = inactiveZeroInventory ? 0 : partitionM! * continuousInterfaceMolM3;
    const overallKcMS = inactiveZeroInventory ? 0
      : partitionM! * c.filmCoefficientMS * d.filmCoefficientMS / denominator!;
    const fluxMolM2S = inactiveZeroInventory ? 0
      : overallKcMS * (bulkContinuousMolM3 - bulkDispersedMolM3 / partitionM!);
    const continuousFilmResidualMolM2S = fluxMolM2S
      - c.filmCoefficientMS * (bulkContinuousMolM3 - continuousInterfaceMolM3);
    const dispersedFilmResidualMolM2S = fluxMolM2S
      - d.filmCoefficientMS * (dispersedInterfaceMolM3 - bulkDispersedMolM3);
    const continuousFilmFluxMolM2S = c.filmCoefficientMS
      * (bulkContinuousMolM3 - continuousInterfaceMolM3);
    const dispersedFilmFluxMolM2S = d.filmCoefficientMS
      * (dispersedInterfaceMolM3 - bulkDispersedMolM3);
    const continuousPhaseSourceMolM3S = -areaM2M3 * continuousFilmFluxMolM2S;
    const dispersedPhaseSourceMolM3S = areaM2M3 * dispersedFilmFluxMolM2S;
    const phaseConservationResidualMolM3S =
      continuousPhaseSourceMolM3S + dispersedPhaseSourceMolM3S;
    const runtimeValues = [
      partitionM ?? 0, denominator ?? 0, continuousInterfaceMolM3,
      dispersedInterfaceMolM3, overallKcMS, fluxMolM2S,
      areaM2M3 * fluxMolM2S, continuousFilmFluxMolM2S,
      dispersedFilmFluxMolM2S, continuousPhaseSourceMolM3S,
      dispersedPhaseSourceMolM3S, phaseConservationResidualMolM3S,
    ];
    if (runtimeValues.some(value => !finite(value))) {
      throw new Error(`JOB_B_NUMERICAL_VALIDITY_BLOCKED:NONFINITE_RUNTIME_VALUE:${componentId}`);
    }
    const filmScale = Math.max(
      Math.abs(fluxMolM2S), Math.abs(continuousFilmFluxMolM2S),
      Math.abs(dispersedFilmFluxMolM2S),
    );
    const filmBound = JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S
      + JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE * filmScale;
    if (Math.abs(continuousFilmResidualMolM2S) > filmBound
      || Math.abs(dispersedFilmResidualMolM2S) > filmBound
      || Math.abs(phaseConservationResidualMolM3S) > areaM2M3 * filmBound) {
      throw new Error(`JOB_B_NUMERICAL_VALIDITY_BLOCKED:FILM_CLOSURE_FAILED:${componentId}`);
    }
    return {
      componentId,
      signConvention: 'POSITIVE_CONTINUOUS_TO_DISPERSED',
      diffusivityContinuousM2S: c.diffusivityM2S,
      diffusivityDispersedM2S: d.diffusivityM2S,
      kcMS: c.filmCoefficientMS,
      kdMS: d.filmCoefficientMS,
      bulkContinuousMolM3,
      bulkDispersedMolM3,
      continuousStarMolM3,
      dispersedStarMolM3,
      partitionM,
      twoFilmDenominatorMS: denominator,
      interfaceContinuousMolM3: continuousInterfaceMolM3,
      interfaceDispersedMolM3: dispersedInterfaceMolM3,
      overallKcMS,
      fluxMolM2S,
      volumetricTransferMolM3S: areaM2M3 * fluxMolM2S,
      continuousFilmFluxMolM2S,
      dispersedFilmFluxMolM2S,
      continuousPhaseSourceMolM3S,
      dispersedPhaseSourceMolM3S,
      continuousFilmResidualMolM2S,
      dispersedFilmResidualMolM2S,
      phaseConservationResidualMolM3S,
      filmClosureBoundMolM2S: filmBound,
      inactiveZeroInventory,
    };
  });
  const allJobACoefficientsAndDiffusivitiesPositiveFinite = rows.every(row =>
    [row.kcMS, row.kdMS, row.diffusivityContinuousM2S, row.diffusivityDispersedM2S]
      .every(value => finite(value) && value > 0));
  const allRuntimeValuesFinite = rows.every(row => [
    row.partitionM ?? 0, row.twoFilmDenominatorMS ?? 0,
    row.interfaceContinuousMolM3, row.interfaceDispersedMolM3,
    row.overallKcMS, row.fluxMolM2S, row.volumetricTransferMolM3S,
    row.continuousFilmFluxMolM2S, row.dispersedFilmFluxMolM2S,
    row.continuousPhaseSourceMolM3S, row.dispersedPhaseSourceMolM3S,
    row.phaseConservationResidualMolM3S,
  ].every(finite));
  const allClosuresWithinBounds = rows.every(row =>
    Math.abs(row.continuousFilmResidualMolM2S) <= row.filmClosureBoundMolM2S
    && Math.abs(row.dispersedFilmResidualMolM2S) <= row.filmClosureBoundMolM2S
    && Math.abs(row.phaseConservationResidualMolM3S)
      <= areaM2M3 * row.filmClosureBoundMolM2S);
  const numericalValidityStatus = allJobACoefficientsAndDiffusivitiesPositiveFinite
    && allRuntimeValuesFinite && allClosuresWithinBounds ? 'PASS' : 'BLOCKED';
  if (numericalValidityStatus !== 'PASS') {
    throw new Error('JOB_B_NUMERICAL_VALIDITY_BLOCKED:SUMMARY_CHECK_FAILED');
  }
  const body = {
    status: 'PRE_PILOT_ALGEBRAIC_TWO_FILM_FLUX_CALCULATED' as const,
    schemaVersion: JOB_B_VERSION,
    componentOrder: JOB_B_COMPONENT_ORDER,
    implementationSha256: JOB_B_IMPLEMENTATION_SHA256,
    inputSha256: sha256({
      jobAResultSha256: jobA.resultSha256,
      operatingHoldup: input.operatingHoldup,
      phaseConfiguration: input.phaseConfiguration,
      equilibriumResultHash: equilibrium.resultHash,
    }),
    dependencies: {
      jobAResultSha256: jobA.resultSha256,
      stage1SnapshotHash: jobA.dependencies.stage1SnapshotHash,
      stage3RunId: jobA.dependencies.stage3RunId,
      stage3ImmutableHash: jobA.dependencies.stage3ImmutableHash,
      selectedTrialId: jobA.dependencies.selectedTrialId,
      equilibriumResultHash: equilibrium.resultHash,
      equilibriumEngineHash: equilibrium.engineHash,
    },
    theoreticalStageAuthority: {
      theoreticalStages: jobA.dependencies.theoreticalStages,
      provenance: jobA.dependencies.theoreticalStageProvenance,
      independentOfEquilibriumEngineIdentity: true,
    },
    equilibriumAuthority: {
      operation: 'LOCAL_EQUILIBRIUM',
      solved: true,
      preflightUsedAsEquilibrium: false,
      engineId: equilibrium.engineId,
      engineVersion: equilibrium.engineVersion,
      engineHash: equilibrium.engineHash,
      resultHash: equilibrium.resultHash,
    },
    frozenLocalHydraulics: {
      source: 'FROZEN_STAGE_3_LOCAL_STATE',
      operatingHoldup: input.operatingHoldup,
      d32M,
      interfacialAreaM2M3: areaM2M3,
      areaEquation: 'a=6*phi_d/d32',
      holdupAreaFactorCount: 1,
      hydrodynamicsRecomputed: false,
    },
    fluxContract: {
      approximation: 'COMPONENTWISE_ALGEBRAIC_TWO_FILM_LINEAR_PARTITION',
      partitionDefinition: 'm_i=C_d,i_star/C_c,i_star from solved pinned flash tie-line concentrations',
      bulkConcentrationDefinition: 'C_t=rho/MW_phase_average; C_i=x_i*C_t',
      bulkConcentrationQualification: 'PRELIMINARY_FIXED_DENSITY_MOLECULAR_WEIGHT_CLOSURE',
      equations: [
        'C_ci=(kc*C_c+kd*C_d)/(kc+m*kd)',
        'C_di=m*C_ci',
        'N=kc*kd/(kc+m*kd)*(m*C_c-C_d)',
        'Kc=m*kc*kd/(kc+m*kd); N=Kc*(C_c-C_d/m)',
        'r_i=a*N_i; a=6*phi_d/d32',
      ],
      signConvention: 'POSITIVE_CONTINUOUS_TO_DISPERSED',
      continuousPhaseSourceSign: -1,
      dispersedPhaseSourceSign: 1,
      conservationStatement: 'Each component source is equal and opposite between phases; no zero-sum constraint is imposed across components.',
    },
    rows,
    authoritativeFluxAvailable: true,
    numericalValidity: {
      status: numericalValidityStatus,
      absoluteFilmClosureToleranceMolM2S: JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S,
      relativeFilmClosureTolerance: JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE,
      maximumAbsoluteContinuousFilmResidualMolM2S: Math.max(...rows.map(row => Math.abs(row.continuousFilmResidualMolM2S))),
      maximumAbsoluteDispersedFilmResidualMolM2S: Math.max(...rows.map(row => Math.abs(row.dispersedFilmResidualMolM2S))),
      maximumAbsolutePhaseConservationResidualMolM3S: Math.max(...rows.map(row => Math.abs(row.phaseConservationResidualMolM3S))),
      allRuntimeValuesFinite,
      allJobACoefficientsAndDiffusivitiesPositiveFinite,
      allClosuresWithinBounds,
    },
    excluded: {
      c2Invented: false,
      hydrodynamicsRecomputed: false,
      compartmentCountCalculated: false,
      heightCalculated: false,
      efficiencyCalculated: false,
      finalRpmSelected: false,
      legacyFiveComponentPathInvoked: false,
    },
    releaseEligible: false,
    qualification: {
      thermodynamicModel: 'PRE_PILOT_PREDICTIVE_NOT_RELEASE_QUALIFIED',
      numericalValidity: 'DERIVED_FROM_RUNTIME_CHECKS',
    },
  };
  return { ...body, resultSha256: jobBResultHash(body) };
}