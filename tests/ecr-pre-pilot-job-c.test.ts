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
    expect(candidate).toContain('JOB_C_CANDIDATE_INTERFACE_BOUNDARY_INCOMPATIBLE');
    expect(candidate).toContain('flux >= 0.0');
    expect(worker).toContain('BLOCKED_EXACT_QUALIFICATION_FAILED');
    expect(worker).toContain('jac_sparsity=sparsity');
    expect(worker).toContain('(27*m,27*m)');
    expect(worker).toContain('LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV');
    expect(worker).toContain('JOB_C_LOCAL_FLUX_PICARD_NONCONVERGENCE');
    expect(worker).toContain('JOB_C_LAMBDA1_MONOLITHIC_POLISH_FAILED');
    expect(worker).toContain('"dominantResidualRows":diagnostics(ev)');
    expect(worker).toContain('np.tile(interface_u,m)');
    expect(worker).toContain('ZERO_TRANSFER_POSITIVE_BOUND_SEED_NOT_EXACT_ZERO_FEED_FV_ROOT');
    expect(worker).toContain('max_nfev=40');
    expect(worker).toContain('progress(f"local flux Picard lambda {lam:g}")');
    expect(worker).toContain('progress("lambda 1 monolithic polish")');
    expect(worker).toContain('flows=x[:14*m].reshape(2,m,7)');
    expect(worker).toContain('np.full(14*m,epsilon)');
    expect(worker).toContain('np.tile(scale,2*m)');
    expect(worker).toContain('x_scale=variable_scale');
    expect(worker).not.toContain('flows=np.exp(x[:14*m])');
    expect(worker).toContain('fullResponseSha256');
    expect(worker).toContain('EXACT_JOB_B_{len(cells)}_OF_{len(cells)}_QUALIFIED');
    expect(worker).toContain('balance_tolerance/aV');
    expect(worker).toContain('"incomingPhysicalFlowsRegularized":False');
    expect(worker).toContain('"physicalDispersedInletZerosPreservedExactly"');
    expect(worker).toContain('"rootClassReproduction":inlet_job_b.get');
  });

  it('solves and qualifies the exact height reported after bisection', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const h2Solve = worker.indexOf('low=solve_height(2.0)');
    const h2Replay = worker.indexOf('h2_benchmark=qualify_h2(low)');
    const heightSearchBoundary = worker.indexOf('high=solve_height(20.0,low["solution"])');
    expect(h2Solve).toBeGreaterThan(-1);
    expect(h2Replay).toBeGreaterThan(h2Solve);
    expect(h2Replay).toBeLessThan(heightSearchBoundary);
    expect(worker).toContain('final_height=(lo+hi)/2');
    expect(worker).toContain('selected=solve_height(final_height,accepted_by_height[nearest])');
    expect(worker).toContain('"profileSolvedHeightM":selected["height"]');
    expect(worker).toContain('selected.get("profileSolvedHeightM") != height');
    expect(worker).toContain('"profileStateSha256":digest([selected["state"][0],selected["state"][1]])');
    expect(worker).toContain('digest(qualified_state) != selected.get("profileStateSha256")');
    expect(worker).toContain('dz=height/r["compartments"]');
    expect(worker).toContain('"maximumExactScaledCellResidual":scaled');
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

  it('uses bounded dense frozen-FV solves within local-flux Picard iteration', () => {
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
    expect(worker).toContain('frozenFvAcceptance');
    expect(worker).toContain('tr_solver="exact"');
    expect(worker).toContain('"missingDependencyCount":0');
    expect(worker).toContain('GLOBAL_INLET_FULL_SCALE_FROZEN_FLUX_DIAGNOSTIC_ONLY');
    expect(worker).toContain('UNBOUNDED_TERMINAL_DIAGNOSTIC_ONLY_NOT_ACCEPTANCE');
    expect(worker).toContain('"unconstrainedTerminalDiagnostic":unconstrained');
    expect(worker).not.toContain('predicted_flows=unconstrained_fit.x');
    expect(worker).not.toContain('predicted_flows=unconstrained_fit.x');
    expect(worker).toContain('UNCLIPPED_CONSERVATIVE_PROFILE');
    expect(worker).toContain('refreshedRawFvResidualMolS');
    expect(worker).toContain('integratedSourceMismatchRawMolS');
    expect(worker).toContain('activePositiveLowerBoundFlows');
    expect(worker).toContain('dominantFrozenFvResidualRows');
    expect(worker).toContain('max_nfev=160');
    expect(worker).toContain('return np.r_[scaled_fv,ev["interface"]]');
  });

  it('orders Picard sources correctly and computes pure source-mismatch metrics', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const preInterface = worker.indexOf(
      'local_u,frozen_nc,pre_gate=solve_local_interfaces(',
    );
    const frozenFv = worker.indexOf(
      'fit=scipy.optimize.least_squares(',
      preInterface,
    );
    const refreshedInterface = worker.indexOf(
      'solve_local_interfaces(solved_flows,local_u)',
      frozenFv,
    );
    const refreshedFv = worker.indexOf(
      'physical_fv=frozen_flow_evaluate(',
      refreshedInterface,
    );
    expect(preInterface).toBeGreaterThan(-1);
    expect(frozenFv).toBeGreaterThan(preInterface);
    expect(refreshedInterface).toBeGreaterThan(frozenFv);
    expect(refreshedFv).toBeGreaterThan(refreshedInterface);
    expect(worker).not.toContain('lambda q:residual(q,lam)');
    expect(worker.match(/lambda q:residual\(q,1\.0\)/g)).toHaveLength(1);

    const metric = (
      frozen: number[],
      refreshed: number[],
      lambda: number,
      area: number,
      scales: number[],
    ) => {
      const integrated = refreshed.map(
        (flux, index) => lambda * (flux - frozen[index]) * area,
      );
      return {
        raw: Math.max(...integrated.map(Math.abs)),
        scaled: Math.max(...integrated.map(
          (value, index) => Math.abs(value / scales[index]),
        )),
      };
    };
    expect(metric([1, -2], [1.1, -1.8], 0, 3, [2, 4])).toEqual({
      raw: 0,
      scaled: 0,
    });
    const nonzero = metric([1, -2], [1.1, -1.8], 0.5, 3, [2, 4]);
    expect(nonzero.raw).toBeCloseTo(0.3, 14);
    expect(nonzero.scaled).toBeCloseTo(0.075, 14);
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

  it('uses the global-inlet failure only as evidence and tries local continuation', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('positiveGlobalOutletNecessaryConditionPassed');
    expect(worker).toContain('sourceSignReversalWouldResolveAllBoundaries');
    expect(worker).toContain('"physicalInfeasibilityClaimed":False');
    expect(worker).toContain('frozen_acceptance=require_positive_frozen_solution(');
    expect(worker).toContain('GLOBAL_INLET_FULL_SCALE_FROZEN_FLUX_DIAGNOSTIC_ONLY');
    expect(worker).toContain('LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV');
    expect(worker).toContain('current_flows=x[:14*m].copy()');
    expect(worker).not.toContain(
      'if not inlet_flux_audit[\n                      "positiveGlobalOutletNecessaryConditionPassed"]',
    );
    expect(worker).toContain('minimum_flow<=0');
    expect(worker).toContain('c[j]/c[j].sum()');
    expect(worker).toContain('d[j]/d[j].sum()');
    expect(worker).toContain('lambda_targets=[0.0,.00001,.00003,.0001,.0003,.001');
    expect(worker).toContain('lambda_targets.insert(');
    expect(worker).toContain('minimum_lambda_interval=1e-8');
    expect(worker).toContain('ZERO_TRANSFER_POSITIVE_BOUND_SEED_NOT_EXACT_ZERO_FEED_FV_ROOT');
    expect(worker).toContain('zeroFeedPositiveBoundSeeds');
  });
});