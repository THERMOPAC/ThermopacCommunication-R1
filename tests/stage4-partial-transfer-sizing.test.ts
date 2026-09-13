import {
  decodeFrozenLocalCoefficients,
  prepareFrozenPartialTransferBvp,
  solveFrozenSecantPlugFlowBvp,
  verifyOwnedStrictPartialAnchor,
} from '../server/ecr-pre-pilot/stage4-partial-transfer-sizing';
import fs from 'node:fs';
import path from 'node:path';

const workerRequest = {
  kc: Array(7).fill(1 / 1_000),
  kd: Array(7).fill(1 / 1_000),
  continuousTotalConcentrationMolM3: 1_000,
  dispersedTotalConcentrationMolM3: 1_000,
};
// With xi_c=xi_d=1/7 and n=0, d_i=(2/7-c_i/sum(c))*sum(c)
// gives raw_d=raw_c exactly. None of the c_i is at its mean, so the
// frozen K denominator is nonzero without needing a clamp.
const c = [2, 3, 4, 5, 6, 7, 9];
const d = c.map(value => 2 * 36 / 7 - value);
const strictState = [
  ...Array.from({ length: 7 }, () => c).flat(),
  ...Array.from({ length: 7 }, () => d).flat(),
  ...Array(91).fill(0),
];

describe('frozen strict-anchor partial-transfer coefficients', () => {
  it('reconstructs the unscaled worker transform without fitting a coefficient', () => {
    const bands = decodeFrozenLocalCoefficients({ state: strictState, workerRequest });
    expect(bands).toHaveLength(7);
    const band = bands[0];
    const expectedRaw = c.map(value => value / 36 - 1 / 7);
    expectedRaw.forEach((value, index) =>
      expect(band.reconstructedContinuousComponentFluxMolM2S[index]).toBeCloseTo(value, 12));
    expect(band.overallCoefficientMolM2S.every(value => value > 0)).toBe(true);
  });

  it('rejects a tampered/non-189 strict source state', () => {
    expect(() => decodeFrozenLocalCoefficients({
      state: strictState.slice(0, 188),
      workerRequest,
    })).toThrow('PARTIAL_TRANSFER_COEFFICIENTS_INVALID_STRICT_ANCHOR_INPUT');
  });

  it('fails closed when an owned immutable strict-anchor record is absent or tampered', () => {
    expect(verifyOwnedStrictPartialAnchor({})).toBeNull();
    expect(verifyOwnedStrictPartialAnchor({
      status: 'completed',
      input_hash: '0'.repeat(64),
      result_hash: '0'.repeat(64),
      partial_result_hash: '0'.repeat(64),
      input_snapshot: {},
      result_snapshot: {},
      partial_result_snapshot: {},
    })).toBeNull();
  });

  it('solves a positive conservative opposite-feed plug-flow fixture', () => {
    const bands = Array.from({ length: 7 }, (_, index) => ({
      numericalCell: index + 1,
      continuousBulkMoleFractions: Array(7).fill(1 / 7),
      dispersedBulkMoleFractions: Array(7).fill(1 / 7),
      interfaceContinuousMoleFractions: Array(7).fill(1 / 7),
      interfaceDispersedMoleFractions: Array(7).fill(1 / 7),
      totalMolarFluxMolM2S: 0,
      reconstructedContinuousComponentFluxMolM2S: Array(7).fill(0),
      reconstructedDispersedComponentFluxMolM2S: Array(7).fill(0),
      equilibriumSecantM: Array(7).fill(1),
      overallCoefficientMolM2S: Array(7).fill(1e-4),
      equations: {
        rawContinuous: 'rawc=kc*CtC*(xc-xic)' as const,
        diffusiveContinuous: 'jc=rawc-xic*sum(rawc)' as const,
        componentFlux: 'N=jc+xic*n' as const,
        frozenSecant: 'm=xid/xic; K=N/(m*xc-xd)' as const,
      },
    }));
    const result = solveFrozenSecantPlugFlowBvp({
      continuousFeedMolS: Array(7).fill(2),
      dispersedFeedMolS: Array(7).fill(1),
      bands, holdup: 0.1, d32M: 0.003, columnDiameterM: 0.2, heightM: 0.5,
    });
    expect(result.converged).toBe(true);
    expect(result.minimumFlowMolS).toBeGreaterThan(0);
    expect(result.maximumComponentBalanceResidualMolS).toBeLessThan(1e-8);
    // RRBO/NMP feeds can have an absent hydrocarbon component at a true feed
    // boundary. It is not a negative interior/outlet inventory.
    const zeroBoundary = solveFrozenSecantPlugFlowBvp({
      continuousFeedMolS: [0, 2, 2, 2, 2, 2, 2],
      dispersedFeedMolS: Array(7).fill(1),
      bands, holdup: 0.1, d32M: 0.003, columnDiameterM: 0.2, heightM: 0.5,
    });
    expect(zeroBoundary.converged).toBe(true);
    expect(zeroBoundary.continuousOutletMolS[0]).toBeGreaterThan(0);
    expect(zeroBoundary.minimumFlowMolS).toBeGreaterThan(0);
  });

  it('prepares a read-only target-bracket outcome without storage or worker access', () => {
    const bands = decodeFrozenLocalCoefficients({ state: strictState, workerRequest });
    const prepared = prepareFrozenPartialTransferBvp({
      workerRequest: {
        ...workerRequest,
        phaseConfiguration: 'rrbo-continuous-nmp-dispersed',
        continuousFeedMolS: c,
        dispersedFeedMolS: d,
        operatingHoldup: 0.01,
        d32M: 1,
        columnDiameterM: 0.02,
      },
      bands,
      compartmentHeightM: 0.25,
      targetRecoveryPct: 101,
    });
    expect(prepared.selected).toBeNull();
    expect(prepared.targetFailure).toBe(
      'PARTIAL_TRANSFER_TARGET_RECOVERY_NOT_BRACKETED_BY_PERSISTED_STAGE3_COMPARTMENT_AND_2M_ANCHOR',
    );
    expect(prepared.lower.minimumFlowMolS).toBeGreaterThan(0);
  });

  it('keeps the separate UI action away from Job-C queue endpoints', () => {
    const page = fs.readFileSync(path.resolve(
      process.cwd(), 'client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx',
    ), 'utf8');
    const evaluate = page.slice(
      page.indexOf('const evaluatePartialTransferSizing'),
      page.indexOf('useEffect', page.indexOf('const evaluatePartialTransferSizing')),
    );
    expect(evaluate).toContain('partial-transfer-physical-sizing/evaluate');
    expect(evaluate).not.toContain('/job-c/jobs');
    expect(evaluate).not.toContain('runFullJobCFromStrictAnchor');
  });

  it('keeps latest-result replay tied to full strict-anchor and current Stage-3 lineage', () => {
    const service = fs.readFileSync(path.resolve(
      process.cwd(), 'server/ecr-pre-pilot-service.ts',
    ), 'utf8');
    const latest = service.slice(
      service.indexOf('export async function getLatestPartialTransferPhysicalSizing'),
    );
    expect(latest).toContain('implementation_hash,candidate_hash');
    expect(latest).toContain('job_b_engine_hash');
    expect(latest).toContain('PARTIAL_TRANSFER_PHYSICAL_SIZING_SAVED_STAGE3_LINEAGE_MISMATCH');
    expect(latest).toContain('PARTIAL_TRANSFER_PHYSICAL_SIZING_CURRENT_STAGE3_LINEAGE_CHANGED');
    expect(latest).toContain('getKuhniGeometryResolverRuns(userId, designId, true)');
  });
});