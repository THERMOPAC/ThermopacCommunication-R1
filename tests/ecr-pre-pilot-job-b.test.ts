import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateJobA, jobAResultHash, type JobAEvaluationInput } from '../server/ecr-pre-pilot/job-a';
import {
  JOB_B_COMPONENT_ORDER,
  JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S,
  JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE,
  assertJobBStage3ParentMatchesJobA,
  evaluateJobB,
  jobBResultHash,
  makeJobBLocalEquilibriumInventory,
} from '../server/ecr-pre-pilot/job-b';

const h = (character: string) => character.repeat(64);
const jobAInput = (): JobAEvaluationInput => ({
  stage1SnapshotHash: h('a'), theoreticalStages: 7,
  theoreticalStageProvenance: 'PRE_PILOT_DESIGN_DEFAULT',
  stage2JobId: null, stage2ResultHash: null, stage2EngineHash: h('e'),
  thermodynamicAdapterPreflightHash: h('f'), stage3RunId: 's3',
  stage3ImmutableHash: h('b'), stage3ImplementationHash: h('c'),
  selectedTrialId: 'rpm:60:diameterM:0.5', selectedTrialOrdinal: 0,
  temperatureK: 298.15, interfacialTensionNM: .012, d32M: .002,
  slipVelocityMS: .08,
  continuous: { densityKgM3: 1000, dynamicViscosityPaS: .002, moleFractions: [.01, .01, .01, .01, .01, .9, .05] },
  dispersed: { densityKgM3: 850, dynamicViscosityPaS: .012, moleFractions: [.55, .15, .1, .08, .07, .05, 0] },
});
const equilibrium = () => ({
  status: 'CALCULATED',
  operation: 'LOCAL_EQUILIBRIUM',
  engineId: 'ECR2_PRE_PILOT_SEVEN_COMPONENT_0P5_5P0_H2O',
  engineVersion: '7C-1.5.0',
  engineHash: h('e'),
  resultHash: h('d'),
  componentOrder: [...JOB_B_COMPONENT_ORDER],
  phaseOrientation: 'NMP_RICH_EXTRACT',
  raffinateComposition: [.55, .15, .1, .08, .07, .049999, .000001],
  extractComposition: [.01, .01, .01, .01, .01, .9, .05],
});

describe('ECR pre-pilot Job B bounded local flux coupling', () => {
  it('documents positive flux as continuous-to-dispersed at an absent-component boundary', () => {
    const worker = fs.readFileSync(
      'server/ecr-pre-pilot/job-b-interface/worker.py', 'utf8',
    );
    expect(worker).toContain(
      'POSITIVE_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED',
    );
    expect(worker).toContain('flux >= 0.0');
    expect(worker).toContain(
      'FAIL_CLOSED_SELECT_ONLY_REPRODUCED_BOUNDARY_COMPATIBLE_ROOT',
    );
    expect(worker).toContain('"candidateRoot"');
    expect(worker).toContain('"dispersedInletBoundaryCompatibility"');
  });

  it('consumes 14 Job-A cells, solved equilibrium, and frozen Stage-3 area exactly once', () => {
    const result = evaluateJobB({
      jobA: evaluateJobA(jobAInput()),
      operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
      equilibrium: equilibrium(),
    });
    expect(result.componentOrder).toEqual(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O']);
    expect(result.rows).toHaveLength(7);
    expect(result.frozenLocalHydraulics.interfacialAreaM2M3).toBe(6 * .2 / .002);
    expect(result.frozenLocalHydraulics.holdupAreaFactorCount).toBe(1);
    expect(result.frozenLocalHydraulics.hydrodynamicsRecomputed).toBe(false);
    expect(result.numericalValidity).toMatchObject({
      status: 'PASS',
      absoluteFilmClosureToleranceMolM2S: JOB_B_FILM_CLOSURE_ABSOLUTE_TOLERANCE_MOL_M2_S,
      relativeFilmClosureTolerance: JOB_B_FILM_CLOSURE_RELATIVE_TOLERANCE,
      allRuntimeValuesFinite: true,
      allJobACoefficientsAndDiffusivitiesPositiveFinite: true,
    });
    result.rows.forEach(row => {
      expect(row.kcMS).toBeGreaterThan(0);
      expect(row.kdMS).toBeGreaterThan(0);
      expect(row.diffusivityContinuousM2S).toBeGreaterThan(0);
      expect(row.diffusivityDispersedM2S).toBeGreaterThan(0);
    });
  });

  it('solves the analytic interface and closes both film equations without reciprocal error', () => {
    const result = evaluateJobB({
      jobA: evaluateJobA({
        ...jobAInput(),
        continuous: { densityKgM3: 1000, dynamicViscosityPaS: .002, moleFractions: [.02, .01, .01, .01, .01, .89, .05] },
      }), operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
      equilibrium: equilibrium(),
    });
    expect(result.status).toBe('PRE_PILOT_ALGEBRAIC_TWO_FILM_FLUX_CALCULATED');
    expect(result.authoritativeFluxAvailable).toBe(true);
    const row = result.rows[0];
    expect(row.continuousFilmResidualMolM2S).toBeCloseTo(0, 15);
    expect(row.dispersedFilmResidualMolM2S).toBeCloseTo(0, 15);
    expect(row.fluxMolM2S).toBeCloseTo(
      row.overallKcMS * (row.bulkContinuousMolM3 - row.bulkDispersedMolM3 / row.partitionM), 18,
    );
    expect(row.fluxMolM2S).toBeGreaterThan(0);
    expect(row.continuousPhaseSourceMolM3S + row.dispersedPhaseSourceMolM3S).toBeCloseTo(0, 12);
    expect(result.excluded).toMatchObject({
      c2Invented: false, hydrodynamicsRecomputed: false,
      compartmentCountCalculated: false, heightCalculated: false,
      efficiencyCalculated: false, finalRpmSelected: false,
      legacyFiveComponentPathInvoked: false,
    });
  });

  it('returns equilibrium zero flux, finite phase continuity, and explicit inactive absent species', () => {
    const zero = evaluateJobB({
      jobA: evaluateJobA(jobAInput()), operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed', equilibrium: equilibrium(),
    });
    const equilibriumSat = zero.rows.find(row => row.componentId === 'SAT')!;
    expect(equilibriumSat.fluxMolM2S).toBeCloseTo(0, 15);
    zero.rows.forEach(row => {
      expect(Number.isFinite(row.interfaceContinuousMolM3)).toBe(true);
      expect(Number.isFinite(row.interfaceDispersedMolM3)).toBe(true);
    });
    const absentInput = jobAInput();
    absentInput.continuous.moleFractions = [.01, .01, .01, .01, 0, .91, .05];
    absentInput.dispersed.moleFractions = [.62, .15, .1, .08, 0, .05, 0];
    const absentEq = equilibrium();
    absentEq.raffinateComposition = [.619999, .15, .1, .08, 0, .05, .000001];
    absentEq.extractComposition = [.01, .01, .01, .01, 0, .91, .05];
    const absent = evaluateJobB({
      jobA: evaluateJobA(absentInput), operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed', equilibrium: absentEq,
    }).rows.find(row => row.componentId === 'PA')!;
    expect(absent.inactiveZeroInventory).toBe(true);
    expect(absent.partitionM).toBeNull();
    expect(absent.fluxMolM2S).toBe(0);
  });

  it('reverses component transfer direction and binds explicit phase orientation into input hash', () => {
    const base = jobAInput();
    base.continuous.moleFractions = [.005, .01, .01, .01, .01, .905, .05];
    const input = {
      jobA: evaluateJobA(base), operatingHoldup: .2,
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed' as const,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      equilibrium: equilibrium(),
    };
    const reverse = evaluateJobB(input);
    const sat = reverse.rows[0];
    expect(sat.fluxMolM2S).toBeLessThan(0);
    expect(sat.continuousPhaseSourceMolM3S).toBeGreaterThan(0);
    expect(sat.dispersedPhaseSourceMolM3S).toBeLessThan(0);
    expect(1 / sat.overallKcMS).toBeCloseTo(
      1 / sat.kcMS + 1 / (sat.partitionM! * sat.kdMS), 8,
    );
    const otherOrientation = evaluateJobB({
      ...input, phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
    });
    expect(otherOrientation.inputSha256).not.toBe(reverse.inputSha256);
  });

  it('pins deterministic lineage and rejects preflight or malformed hydraulic state', () => {
    const input = {
      jobA: evaluateJobA(jobAInput()), operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed' as const,
      equilibrium: equilibrium(),
    };
    const first = evaluateJobB(input);
    const replay = evaluateJobB(input);
    expect(replay.resultSha256).toBe(first.resultSha256);
    expect(jobBResultHash(first)).toBe(first.resultSha256);
    expect(first.equilibriumAuthority).toMatchObject({
      solved: true, preflightUsedAsEquilibrium: false, engineVersion: '7C-1.5.0',
    });
    expect(() => evaluateJobB({ ...input, operatingHoldup: 0 })).toThrow(/FROZEN_STAGE3/);
    expect(() => evaluateJobB({
      ...input, equilibrium: { ...equilibrium(), status: 'PASS', operation: 'PREFLIGHT' },
    })).toThrow(/SOLVED_7C_1_5/);
    try {
      evaluateJobB({
        ...input,
        equilibrium: {
          ...equilibrium(), status: 'BLOCKED_STABILITY_GATES',
          gates: {
            optimizerConverged: true, isoactivityLogResidual: 2e-6,
            materialBalanceResidual: 3e-9, gibbsReduction: 4e-5,
          },
        },
      });
      throw new Error('expected dependency block');
    } catch (error: any) {
      expect(error.details).toMatchObject({
        adapterStatus: 'BLOCKED_STABILITY_GATES',
        adapterResultHash: 'd'.repeat(64),
        engineVersion: '7C-1.5.0',
        optimizerConverged: true,
        isoactivityLogResidual: 2e-6,
        materialBalanceResidual: 3e-9,
        gibbsReduction: 4e-5,
        fluxMetricsReturned: false,
      });
    }
    expect(() => evaluateJobB({
      ...input, phaseConfiguration: 'unsupported' as any,
    })).toThrow(/UNSUPPORTED_PHASE_CONFIGURATION/);
    const invalid = equilibrium();
    invalid.extractComposition[0] = 0;
    invalid.extractComposition[5] = .91;
    expect(() => evaluateJobB({ ...input, equilibrium: invalid }))
      .toThrow(/INVALID_PARTITION_FOR_PRESENT_COMPONENT/);
  });

  it('blocks adversarial coefficients, diffusivities, overflow, and Stage-3 parent drift', () => {
    const base = evaluateJobA(jobAInput()) as any;
    const resign = (jobA: any) => {
      jobA.resultSha256 = jobAResultHash(jobA);
      return jobA;
    };
    const run = (jobA: any) => evaluateJobB({
      jobA, operatingHoldup: .2,
      stage3OperatingHydraulicsStatus: 'OPERATING_HOLDUP_CALCULATED',
      phaseConfiguration: 'nmp-continuous-rrbo-dispersed',
      equilibrium: equilibrium(),
    });
    const zeroK = structuredClone(base);
    zeroK.cells[0].filmCoefficientMS = 0;
    expect(() => run(resign(zeroK))).toThrow(/JOB_A_CELL_MISSING/);
    const negativeD = structuredClone(base);
    negativeD.cells[0].diffusivityM2S = -1;
    expect(() => run(resign(negativeD))).toThrow(/JOB_A_CELL_MISSING/);
    const overflow = structuredClone(base);
    overflow.cells[0].filmCoefficientMS = 1e308;
    expect(() => run(resign(overflow))).toThrow(/NONFINITE_RUNTIME_VALUE/);
    expect(() => assertJobBStage3ParentMatchesJobA(base, {
      id: 'changed', immutableHash: base.dependencies.stage3ImmutableHash,
    })).toThrow(/STAGE3_PARENT_CHANGED/);
    expect(() => assertJobBStage3ParentMatchesJobA(base, {
      id: base.dependencies.stage3RunId, immutableHash: 'f'.repeat(64),
    })).toThrow(/STAGE3_PARENT_CHANGED/);
    expect(() => assertJobBStage3ParentMatchesJobA(base, {
      id: base.dependencies.stage3RunId,
      immutableHash: base.dependencies.stage3ImmutableHash,
    })).not.toThrow();
  });

  it('builds a physically weighted seven-component local inventory', () => {
    const inventory = makeJobBLocalEquilibriumInventory(evaluateJobA(jobAInput()), .2);
    expect(inventory).toHaveLength(7);
    expect(inventory.every(value => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(inventory.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  it('exposes authenticated body-free endpoints and Stage-4 UI action', () => {
    const routes = fs.readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    const page = fs.readFileSync('client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx', 'utf8');
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-b/evaluate'");
    expect(routes).not.toContain("'/api/ecr-pre-pilot/designs/:id/job-b/latest'");
    expect(routes).toContain('JOB_B_CLIENT_PHYSICAL_INPUT_PROHIBITED');
    expect(page).toContain('Test Job-B flux');
    expect(page).toContain('/job-b/evaluate');
  });
});