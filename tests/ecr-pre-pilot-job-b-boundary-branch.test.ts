import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ECR pre-pilot Job-B boundary branch qualification', () => {
  const result = JSON.parse(readFileSync(
    '.agents/outputs/job-b-boundary-branch/results.json', 'utf8',
  ));
  const continuation = JSON.parse(readFileSync(
    '.agents/outputs/job-b-boundary-branch/h2-continuation-diagnostic.json', 'utf8',
  ));
  const local = JSON.parse(readFileSync(
    '.agents/outputs/job-b-boundary-branch/local-boundary-results.json', 'utf8',
  ));
  const seedCatalog = JSON.parse(readFileSync(
    '.agents/outputs/job-b-boundary-branch/candidate-root-seeds.json', 'utf8',
  ));

  it('retains the frozen component order, engine, worker, and 1e-7 gates', () => {
    expect(result.componentOrder).toEqual(
      ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
    );
    expect(result.stage2EngineVersion).toBe('7C-1.5.0');
    expect(result.stage2EngineHash).toBe(
      '4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac',
    );
    expect(result.jobBInterfaceWorkerSha256).toBe(
      '70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d',
    );
    expect(result.unchangedAcceptance).toMatchObject({
      isoactivityLogResidual: 1e-7,
      scaledTwoFilmResidual: 1e-8,
      rawFvResidualMolS: 1e-7,
      scaledFvResidual: 1e-7,
      clippingUsed: false,
      sourceSignReversalUsed: false,
      negativeFlowsAccepted: false,
      toleranceRelaxed: false,
    });
  });

  it('classifies every root and finds no boundary-compatible credible branch', () => {
    expect(result.search.distinctRootCount).toBe(3);
    expect(result.roots).toHaveLength(3);
    for (const root of result.roots) {
      expect(root.numericalJacobianRank).toBe(13);
      expect(root.maximumIsoactivityLogResidual).toBeLessThanOrEqual(1e-7);
      expect(root.maximumScaledFluxEqualityResidual).toBeLessThanOrEqual(1e-8);
    }
    expect(result.crediblePhysicalRootCount).toBe(1);
    expect(result.boundaryCompatibleRootCount).toBe(0);
    const credible = result.roots.find((root: any) => root.crediblePhysicalRoot);
    expect(credible).toMatchObject({
      canonicalPackagedJobBMatch: true,
      phaseSeparated: true,
      phaseOrientationAccepted: true,
      endpointStabilityAccepted: true,
      reproductionCount: 2,
    });
    expect(credible.independentReproductionMaximumRelativeDifference)
      .toBeLessThanOrEqual(1e-7);
    expect(credible.globalOutletNecessaryCondition.strictlyPositive).toBe(false);
    expect(credible.globalOutletNecessaryCondition.nonpositiveOutlets.map(
      (row: any) => `${row.phase}:${row.component}`,
    )).toEqual(['dispersed:NMP', 'dispersed:H2O']);
  });

  it('keeps Job C blocked after the exact 98-flow H=2 diagnostic', () => {
    expect(continuation).toMatchObject({
      heightM: 2,
      unknownFlowCount: 98,
      solver: 'LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV',
      reason: 'BOUNDED_FROZEN_FV_NONCONVERGENCE',
    });
    expect(continuation.unconstrainedTerminalDiagnostic).toMatchObject({
      optimizerSuccess: true,
      nonpositiveFlowCount: 14,
      qualification: 'UNBOUNDED_TERMINAL_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE',
    });
    expect(continuation.unconstrainedTerminalDiagnostic.rawFvResidualMolS)
      .toBeLessThanOrEqual(1e-7);
    expect(continuation.unconstrainedTerminalDiagnostic.scaledFvResidual)
      .toBeLessThanOrEqual(1e-7);
    expect(new Set(
      continuation.unconstrainedTerminalDiagnostic.nonpositiveFlows.map(
        (row: any) => row.component,
      ),
    )).toEqual(new Set(['NMP', 'H2O']));
    expect(result.jobCDisposition)
      .toBe('REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT');
    expect(result.requiredGovernedChangeIfBlocked).not.toBeNull();
  });

  it('finds no distinct credible root family at any H=2 local cell', () => {
    expect(seedCatalog.source).toMatchObject({
      kind: 'DETERMINISTIC_INLET_MULTISTART',
      startCount: 13,
      strictScaledTwoFilmGate: 1e-8,
      requiredNumericalJacobianRank: 13,
    });
    expect(seedCatalog.candidates).toHaveLength(7);
    expect(seedCatalog.candidates.filter(
      (candidate: any) => candidate.strictNumericalAccepted,
    )).toHaveLength(3);
    expect(seedCatalog.candidates.every(
      (candidate: any) => candidate.seedSource
        === 'DETERMINISTIC_INLET_MULTISTART'
        && candidate.sourceStarts.length > 0,
    )).toBe(true);
    expect(local).toMatchObject({
      heightM: 2,
      stage2EngineVersion: '7C-1.5.0',
      stage2EngineHash:
        '4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac',
      jobBInterfaceWorkerSha256:
        '70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d',
      boundaryCompatibleDistinctJobBBranchCount: 0,
      jobCDisposition: 'REMAINS_BLOCKED_NO_BOUNDARY_COMPATIBLE_JOB_B_ROOT',
    });
    expect(local.acceptedLambda).toBeLessThan(local.failedLambda);
    expect(local.search).toMatchObject({
      localCellCount: 7,
      seededCandidateBasinCount: 7,
      startsPerFamilyPerCell: 2,
      totalLocalRootAttempts: 98,
      totalDistinctNumericalRoots: 30,
      credibleLocalRoots: 7,
      credibleRootFamilies: ['R1'],
      distinctCredibleAlternateRootFamilies: [],
    });
    for (const cell of local.cellResults) {
      const credible = cell.roots.filter(
        (root: any) => root.crediblePhysicalRoot,
      );
      expect(credible).toHaveLength(1);
      expect(credible[0]).toMatchObject({
        sourceCandidateTemplates: ['R1'],
        numericalJacobianRank: 13,
        phaseSeparated: true,
        phaseOrientationAccepted: true,
        independentlyReproduced: true,
        endpointStabilityAccepted: true,
      });
      expect(credible[0].maximumIsoactivityLogResidual)
        .toBeLessThanOrEqual(1e-7);
      expect(credible[0].maximumScaledFluxEqualityResidual)
        .toBeLessThanOrEqual(1e-8);
      expect(credible[0].reproductionEvidence.maximumRelativeDifference)
        .toBeLessThanOrEqual(1e-6);
      expect([
        'PACKAGED_JOB_B_INHERITED_UNCHANGED_STABILITY_AND_TPD',
        'BOUNDARY_ROOT_UNCHANGED_STABILITY_AND_TPD',
      ]).toContain(credible[0].stabilityEvidence.source);
    }
  });
});