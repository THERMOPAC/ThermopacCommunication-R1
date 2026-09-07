import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  JOB_C_COMPONENT_ORDER,
  JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
  jobCResultHash,
} from '../server/ecr-pre-pilot/job-c';

describe('ECR pre-pilot Job C governed numerical basis', () => {
  it('pins component order, sensitivity values, and numerical-only height bounds', () => {
    expect(JOB_C_COMPONENT_ORDER).toEqual(
      ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'],
    );
    expect(JOB_C_PRELIMINARY_SENSITIVITY_BASIS).toMatchObject({
      axialDispersionContinuousM2S: { nominal: 0.010, minimum: 0.003, maximum: 0.030 },
      axialDispersionDispersedM2S: { nominal: 0.0010, minimum: 0.0003, maximum: 0.0030 },
      activeHeightSearchM: { minimum: 2, maximum: 20, use: 'NUMERICAL_SEARCH_ONLY' },
    });
  });

  it('produces deterministic hashes and excludes its own result field', () => {
    const body = { status: 'CALCULATED_PRELIMINARY_JOB_C', value: 2.0 };
    const hash = jobCResultHash(body);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(jobCResultHash({ ...body, resultSha256: 'ignored' })).toBe(hash);
    expect(jobCResultHash({ ...body, value: 2.1 })).not.toBe(hash);
    // Python's governed worker uses bytewise lexicographic key ordering.
    // localeCompare orders case variants differently and breaks cross-runtime
    // integrity for fields such as initialRaw... and initialization.
    expect(jobCResultHash({
      initialization: 'x',
      initialRawFvResidualMolS: 1,
    })).toBe('d92549e1649402c7b8e02b769cf4498ee923af8b8dde5ea7d041eaecfa162819');
  });

  it('pins the candidate equations and exact Job-B fail-closed qualification', () => {
    const candidate = readFileSync(
      'server/ecr-pre-pilot/job-c/candidate_interface.py', 'utf8',
    );
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(candidate).toContain('raw_c=self.kcct*(xb_c-xi_c)');
    expect(candidate).toContain('jc=raw_c-xi_c*self.np.sum(raw_c)');
    expect(candidate).toContain('self.np.r_[mu,delta[:6]/self.scale[:6]]');
    expect(candidate).toContain('CANDIDATE_ONLY_NO_STABILITY_CLAIM');
    expect(candidate).toContain('"WARM_FAST_PATH"');
    expect(candidate).toContain('self.fallback_count+=1');
    expect(candidate).toContain('"fallbackCount":self.fallback_count');
    expect(worker).toContain('BLOCKED_EXACT_QUALIFICATION_FAILED');
    expect(worker).toContain('jac_sparsity=sparsity');
    expect(worker).toContain('(27*m,27*m)');
    expect(worker).toContain('"unknownCount":27*m');
    expect(worker).toContain('"residualCount":27*m');
    expect(worker).toContain('JOB_C_MONOLITHIC_LAMBDA_NONCONVERGENCE');
    expect(worker).toContain('"dominantResidualRows":diagnostics(ev)');
    expect(worker).toContain('np.tile(interface_u,m)');
    expect(worker).toContain('lambdaZeroAnalyticInitialization');
    expect(worker).toContain('max_nfev=80');
    expect(worker).toContain('"residualCallCount"');
    expect(worker).toContain('progress(f"monolithic lambda {lam:g}")');
    expect(worker).toContain('flows=x[:14*m].reshape(2,m,7)');
    expect(worker).toContain('np.full(14*m,epsilon)');
    expect(worker).toContain('np.tile(scale,2*m)');
    expect(worker).toContain('x_scale=variable_scale');
    expect(worker).not.toContain('flows=np.exp(x[:14*m])');
    expect(worker).toContain('fullResponseSha256');
    expect(worker).toContain('EXACT_JOB_B_{len(cells)}_OF_{len(cells)}_QUALIFIED');
    expect(worker).toContain('balance_tolerance/aV');
  });

  it('solves and qualifies the exact height reported after bisection', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('final_height=(lo+hi)/2');
    expect(worker).toContain('selected=solve_height(final_height,accepted_by_height[nearest])');
    expect(worker).toContain('"profileSolvedHeightM":selected["height"]');
    expect(worker).toContain('selected.get("profileSolvedHeightM") != height');
    expect(worker).toContain('"profileStateSha256":digest([selected["state"][0],selected["state"][1]])');
    expect(worker).toContain('digest(qualified_state) != selected.get("profileStateSha256")');
    expect(worker).toContain('dz=height/r["compartments"]');
  });

  it('keeps the seven-cell model numerical and defers grid independence', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('m != 7');
    expect(worker).toContain('"numericalCells":numerical_cells');
    expect(worker).toContain('NUMERICAL_FV_DISCRETIZATION_NOT_PHYSICAL_STAGE_COUNT');
    expect(worker).toContain('"gridIndependenceStatus":"PENDING_NOT_IMPLEMENTED"');
    expect(worker).not.toContain('"theoreticalStages"');
  });

  it('does not zero-lock a cross-phase flow at its positivity bound', () => {
    const epsilon = 1e-13;
    const transferSource = 1.026475e-4;
    const fvResidual = (flow: number) => flow - transferSource;
    const step = 1e-9;
    const finiteDifference = (
      fvResidual(epsilon + step) - fvResidual(epsilon)
    ) / step;
    expect(Number.isFinite(finiteDifference)).toBe(true);
    expect(finiteDifference).toBeCloseTo(1, 10);
    // The bound-constrained direct-coordinate least-squares minimizer can
    // grow from epsilon to the nonzero conservative transfer requirement.
    expect(transferSource).toBeGreaterThan(epsilon);
    expect(Math.abs(fvResidual(transferSource))).toBeLessThan(1e-15);
  });

  it('uses a conservative target-lambda frozen-flux predictor', () => {
    const donorFeed = 2e-3;
    const receivingFeed = 0;
    const lambda = 0.00125;
    const fullFluxTransfer = 1.026475e-4;
    const transfer = lambda * fullFluxTransfer;
    const donorOut = donorFeed - transfer;
    const receiverOut = receivingFeed + transfer;
    expect(receiverOut).toBeGreaterThan(0);
    expect(donorOut).toBeLessThan(donorFeed);
    expect(donorOut + receiverOut).toBeCloseTo(donorFeed + receivingFeed, 15);

    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('frozen_flow_evaluate');
    expect(worker).toContain('frozen_conservative_seed');
    expect(worker).toContain('audit_frozen_flow_sparsity');
    expect(worker).toContain('JOB_C_FROZEN_FV_JACOBIAN_SPARSITY_MISMATCH');
    expect(worker).toContain('JOB_C_FROZEN_FV_SUBSYSTEM_NONCONVERGENCE');
    expect(worker).toContain('tr_solver="exact"');
    expect(worker).toContain('method="lm"');
    expect(worker).toContain('"missingDependencyCount":0');
    expect(worker).toContain('UNBOUNDED_DIAGNOSTIC_ONLY_NOT_PHYSICAL_ACCEPTANCE');
    expect(worker).toContain('NO_PHYSICAL_INFEASIBILITY_CLAIM');
    expect(worker).not.toContain('predicted_flows=unconstrained_fit.x');
    expect(worker).toContain('DENSE_EXACT_TRF_FINITE_DIFFERENCE_JACOBIAN');
    expect(worker).toContain('"qualification":"PREDICTOR_ONLY_NOT_ACCEPTANCE"');
    expect(worker).toContain('previous["details"]');
    expect(worker).toContain('solvers[j].warm=x[');
    expect(worker).toContain('max_nfev=160');
    expect(worker).toContain('return np.r_[scaled_fv,ev["interface"]]');
  });

  it('reproduces the signed design-269 inlet flux and rejects either invalid source sign', () => {
    const components = ['SAT', 'MONO', 'DI', 'POLY', 'PA', 'NMP', 'H2O'];
    const continuousToDispersedFluxMolM2S = [
      -2.8752774456044256e-3,
      -2.4155889258078503e-4,
      -1.13853323500583e-4,
      -3.513605494607725e-5,
      -1.2796669062034185e-5,
      -5.0633159008829556e-5,
      -1.4160839270758237e-5,
    ];
    const continuousFeedMolS = [0, 0, 0, 0, 0, 4.846724298541135, 0.4061367165354447];
    const dispersedFeedMolS = [
      4.868190306515299, 0.5681555559253281, 0.27442347433402103,
      0.0964699788831831, 0.04810668945981338, 0, 0,
    ];
    const heightM = 2;
    const lambda = 0.00125;
    const diameterM = 0.8686867763858619;
    const holdup = 0.08522716012839626;
    const d32M = 0.003031929110308221;
    const interfacialAreaAcrossColumnM2 = (
      6 * holdup / d32M
      * Math.PI * diameterM ** 2 / 4
      * heightM
    );
    const transfer = continuousToDispersedFluxMolM2S.map(
      flux => lambda * flux * interfacialAreaAcrossColumnM2,
    );
    const continuousOutlet = continuousFeedMolS.map((flow, index) => flow - transfer[index]);
    const dispersedOutlet = dispersedFeedMolS.map((flow, index) => flow + transfer[index]);
    expect(dispersedOutlet[components.indexOf('NMP')]).toBeLessThan(0);
    expect(dispersedOutlet[components.indexOf('H2O')]).toBeLessThan(0);
    // Flipping the B→C source sign is not a repair: it makes all five
    // zero-feed continuous hydrocarbon outlets negative instead.
    const reversedContinuousOutlet = continuousFeedMolS.map(
      (flow, index) => flow + transfer[index],
    );
    expect(reversedContinuousOutlet.slice(0, 5).every(flow => flow < 0)).toBe(true);
    expect(continuousOutlet.slice(0, 5).every(flow => flow > 0)).toBe(true);
  });

  it('requires positive closed frozen FV flows before refresh or the 189-equation solve', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('JOB_C_FROZEN_FV_POSITIVITY_GATE_FAILED');
    expect(worker).toContain('positiveGlobalOutletNecessaryConditionPassed');
    expect(worker).toContain('sourceSignReversalWouldResolveAllBoundaries');
    expect(worker).toContain('"physicalInfeasibilityClaimed":False');
    expect(worker).toContain('frozen_acceptance=require_positive_frozen_solution(');
    const acceptance = worker.indexOf(
      'frozen_acceptance=require_positive_frozen_solution(',
    );
    const refresh = worker.indexOf(
      'before_refresh=np.r_[predicted_flows,x[14*m:]]',
    );
    const monolithic = worker.indexOf(
      'fit=scipy.optimize.least_squares(lambda q:residual(q,lam),x,',
    );
    expect(acceptance).toBeGreaterThan(-1);
    expect(acceptance).toBeLessThan(refresh);
    expect(acceptance).toBeLessThan(monolithic);
  });
});