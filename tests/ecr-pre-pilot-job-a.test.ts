import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  JOB_A_COMPONENT_ORDER,
  JOB_A_EVIDENCE_IDS,
  JOB_A_IMPLEMENTATION_SHA256,
  JOB_A_MOLECULAR_DATA,
  JOB_A_STAGE2_ENGINE_ID,
  JOB_A_STAGE2_ENGINE_VERSION,
  evaluateJobA,
  jobAResultHash,
  type JobAEvaluationInput,
} from '../server/ecr-pre-pilot/job-a';

const hash = 'a'.repeat(64);
const input = (): JobAEvaluationInput => ({
  stage1SnapshotHash: hash,
  theoreticalStages: 7,
  theoreticalStageProvenance: 'PRE_PILOT_DESIGN_DEFAULT',
  stage2JobId: null,
  stage2ResultHash: null,
  stage2EngineHash: 'e'.repeat(64),
  thermodynamicAdapterPreflightHash: 'd'.repeat(64),
  stage3RunId: 'stage3-1',
  stage3ImmutableHash: 'b'.repeat(64),
  stage3ImplementationHash: 'c'.repeat(64),
  selectedTrialId: 'rpm:60:diameterM:0.5',
  selectedTrialOrdinal: 2,
  temperatureK: 333.15,
  interfacialTensionNM: .012,
  d32M: .0015,
  slipVelocityMS: .08,
  continuous: {
    densityKgM3: 1020,
    dynamicViscosityPaS: .002,
    moleFractions: [.01, .01, .01, .01, .01, .9, .05],
  },
  dispersed: {
    densityKgM3: 850,
    dynamicViscosityPaS: .012,
    moleFractions: [.55, .15, .1, .08, .07, .05, 0],
  },
});

describe('ECR pre-pilot Job A K&H base closure', () => {
  it('calculates all fourteen directional cells in exact governed order', () => {
    const result = evaluateJobA(input());
    expect(result.componentOrder).toEqual(['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O']);
    expect(result.cells.map(cell => `${cell.componentId}:${cell.phase}`)).toEqual(
      JOB_A_COMPONENT_ORDER.flatMap(id => [`${id}:continuous`, `${id}:dispersed`]),
    );
    expect(result.cells).toHaveLength(14);
    for (const cell of result.cells) {
      for (const value of [
        cell.diffusivityM2S, cell.reynolds, cell.schmidt, cell.peclet,
        cell.sherwood, cell.filmCoefficientMS,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it('exposes exact zero-residual dimensional identities and SI conversions', () => {
    for (const cell of evaluateJobA(input()).cells) {
      expect(cell.dimensionalAudit.diffusivityConversion.valueM2S).toBe(
        cell.dimensionalAudit.diffusivityConversion.valueCm2S * 1e-4,
      );
      expect(cell.dimensionalAudit.reynoldsIdentity.residual).toBe(0);
      expect(cell.dimensionalAudit.schmidtIdentity.residual).toBe(0);
      expect(cell.dimensionalAudit.pecletIdentity.residual).toBe(0);
      expect(cell.dimensionalAudit.filmIdentity.residual).toBe(0);
      expect(cell.filmCoefficientMS).toBe(cell.sherwood * cell.diffusivityM2S / input().d32M);
    }
  });

  it('replays canonical hashes regardless of object insertion order', () => {
    const first = evaluateJobA(input());
    const original = input();
    const reordered = {
      ...original,
      continuous: {
        moleFractions: original.continuous.moleFractions,
        dynamicViscosityPaS: original.continuous.dynamicViscosityPaS,
        densityKgM3: original.continuous.densityKgM3,
      },
    };
    const second = evaluateJobA(reordered);
    expect(first.inputSha256).toBe(second.inputSha256);
    expect(first.resultSha256).toBe(second.resultSha256);
    expect(jobAResultHash(first)).toBe(first.resultSha256);
    expect(first.implementationSha256).toBe(JOB_A_IMPLEMENTATION_SHA256);
  });

  it('freezes exact structural values, applies water correction, and preserves heavy behavior', () => {
    expect(JOB_A_MOLECULAR_DATA.DI.boilingVolumeCm3Mol).toBe(178.16594275007947);
    expect(JOB_A_MOLECULAR_DATA.PA.boilingVolumeCm3Mol).toBe(521.231269838688);
    const result = evaluateJobA(input());
    const water = result.cells.find(cell => cell.componentId === 'H2O' && cell.phase === 'continuous')!;
    const pa = result.cells.find(cell => cell.componentId === 'PA' && cell.phase === 'continuous')!;
    const mono = result.cells.find(cell => cell.componentId === 'MONO' && cell.phase === 'continuous')!;
    expect(water.molecularInputs.waterSoluteVolumeMultiplier).toBe(4.5);
    expect(water.molecularInputs.wilkeChangBoilingVolumeCm3Mol).toBe(
      JOB_A_MOLECULAR_DATA.H2O.boilingVolumeCm3Mol * 4.5,
    );
    expect(water.flags).toContain('KOOIJMAN_WATER_SOLUTE_VOLUME_CORRECTION');
    expect(pa.diffusivityM2S).toBeLessThan(mono.diffusivityM2S);
    expect(pa.molecularInputs.boilingVolumeCm3Mol).toBeGreaterThan(mono.molecularInputs.boilingVolumeCm3Mol);
  });

  it('pins provenance and never claims pilot or release qualification', () => {
    const result = evaluateJobA(input());
    expect(result.evidenceIds).toEqual(JOB_A_EVIDENCE_IDS);
    expect(result.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.inputSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toMatchObject({
      status: 'JOB_A_CLOSED_FOR_PRE_PILOT_IMPLEMENTATION',
      thermodynamicAuthority: {
        engineId: JOB_A_STAGE2_ENGINE_ID,
        engineVersion: JOB_A_STAGE2_ENGINE_VERSION,
        jobId: null,
        resultHash: null,
        engineHash: 'e'.repeat(64),
        adapterPreflightHash: 'd'.repeat(64),
        adapterPreflightStatus: 'PASS',
        referenceDutyOperation: 'REFERENCE_DUTY',
        referenceDutyExecution: 'NOT_EXECUTED_BY_JOB_A',
        componentOrder: JOB_A_COMPONENT_ORDER,
      },
      localHydraulics: {
        source: 'FROZEN_STAGE_3_LOCAL_STATE',
        recomputedPower: false,
        recomputedDropSize: false,
        recomputedHoldup: false,
        recomputedSlipVelocity: false,
      },
      excludedEnhancements: {
        c2Available: false,
        c2Value: null,
        psiUsed: false,
      },
      legacyPathInvoked: false,
      releaseEligible: false,
      pilotValidated: false,
    });
    result.cells.forEach(cell => expect(cell.flags).toEqual(expect.arrayContaining([
      'PRE_PILOT_PREDICTIVE_APPROXIMATION',
      'DIFFUSION_MODEL_APPROXIMATE',
      'INFINITE_DILUTION_APPLIED_TO_LOCAL_PSEUDOPHASE',
      'NOT_PILOT_VALIDATED',
      'NOT_RELEASE_ELIGIBLE',
      'CORRELATION_EXTRAPOLATED',
    ])));
  });

  it('rejects nonphysical, nonfinite, and malformed phase states', () => {
    for (const mutate of [
      (value: any) => { value.temperatureK = Infinity; },
      (value: any) => { value.d32M = 0; },
      (value: any) => { value.continuous.dynamicViscosityPaS = -1; },
      (value: any) => { value.dispersed.moleFractions = [1, 0]; },
      (value: any) => { value.stage2ResultHash = 'bad'; },
      (value: any) => { value.stage3ImmutableHash = 'bad'; },
    ]) {
      const value = input() as any;
      mutate(value);
      expect(() => evaluateJobA(value)).toThrow(/JOB_A_/);
    }
  });

  it('has static and runtime isolation from legacy transport implementations', () => {
    const source = [
      'server/ecr-pre-pilot/job-a.ts',
      'server/ecr-pre-pilot-service.ts',
      'server/ecr-pre-pilot/routes.ts',
    ].map(file => fs.readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toMatch(/from ['"][^'"]*(llx-ecr2-counter-current-bvp|local-property-closure|five-component|diffusivity)[^'"]*['"]/);
    expect(source).not.toContain('legacyPathInvoked: true');
    expect(source).toContain('loadValidatedCompletedSevenComponentNtForStage4');
    expect(source).toContain('PRE_PILOT_DESIGN_DEFAULT');
    expect(source).toContain('preflightSevenComponentStage4Adapter');
    expect(source).toContain('JOB_A_DEPENDENCY_BLOCKED:STAGE2_STAGE3_HASH_MISMATCH');
    expect(evaluateJobA(input()).legacyPathInvoked).toBe(false);
  });

  it('exposes body-free authenticated evaluate/latest route contracts', () => {
    const routes = fs.readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-a/evaluate'");
    expect(routes).toContain("'/api/ecr-pre-pilot/designs/:id/job-a/latest'");
    expect(routes).toContain('JOB_A_CLIENT_PHYSICAL_INPUT_PROHIBITED');
    expect(routes.match(/ensureAuthenticated/g)?.length).toBeGreaterThanOrEqual(2);
  });
});