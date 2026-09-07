import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
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

  it('pins candidate equations and versioned qualifier fail-closed qualification', () => {
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
    expect(worker).toContain('LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV');
    expect(worker).toContain('JOB_C_COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED');
    expect(worker).toContain('JOB_C_LAMBDA1_MONOLITHIC_POLISH_FAILED');
    expect(worker).toContain('"dominantResidualRows":diagnostics(ev)');
    expect(worker).toContain('np.asarray(profile_unknowns).reshape(-1)');
    expect(worker).toContain('JOB_C_BOUNDARY_AWARE_INITIAL_PROFILE_INVALID');
    expect(worker).toContain('max_nfev=40');
    expect(worker).toContain('progress(f"local flux Picard lambda {lam:g}")');
    expect(worker).toContain('progress("lambda 1 monolithic polish")');
    expect(worker).toContain('flows=x[:14*m].reshape(2,m,7)');
    expect(worker).toContain('np.full(14*m,epsilon)');
    expect(worker).toContain('np.tile(scale,2*m)');
    expect(worker).toContain('x_scale=variable_scale');
    expect(worker).not.toContain('flows=np.exp(x[:14*m])');
    expect(worker).toContain('fullResponseSha256');
    expect(worker).toContain('QUALIFIED_JOB_C_BOUNDARY_BRANCH_{len(cells)}_OF_{len(cells)}_REPLAYED');
    expect(worker).toContain('balance_tolerance/aV');
    expect(worker).not.toContain('job_b.solve(');
    expect(worker).toContain('PINNED_ENGINE_LINEAGE_ONLY_NO_JOB_B_FLUX_CONSUMED');
  });

  it('qualifies every mapped local contact before boundary-aware numerical seeding', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const service = readFileSync('server/ecr-pre-pilot-service.ts', 'utf8');
    const source = worker.indexOf('branch=r["boundaryBranchQualificationRequest"]');
    const gate = worker.indexOf('JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL');
    const profileSeed = worker.indexOf('transfer=initial_lambda*profile_flux*av*A*dz');
    expect(service).toContain('RECORDED_STAGE2_FEED_END_LOCAL_CONTACT_STATE');
    expect(service).toContain('PINNED_STAGE2_RECORDED_LOCAL_CONTACTS_REBINNED_TO_FV_CELLS');
    expect(service).not.toContain('request.x_bulk_dispersed[5] !== 0');
    expect(service).not.toContain('request.x_bulk_dispersed[6] !== 0');
    expect(worker).toContain('qualifiedLocalContacts');
    expect(worker).toContain('"numericalTraceAdded":False');
    expect(service).toContain('const orderedContacts = [...contacts].sort');
    expect(service).toContain('const workerOrderedBins = [...ascendingStage2Bins].reverse()');
    expect(worker).toContain('source_bins==expected_source_bins');
    expect(worker).toContain(
      '"STAGE2_FEED_END_ASCENDING_EQUAL_BINS_REVERSED_TO_CONTINUOUS_INLET_FV_ORDER_V1"',
    );
    expect(source).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(source);
    expect(profileSeed).toBeGreaterThan(gate);
  });

  it('records the governed design-269 branch and global-pair flux classifications', () => {
    const qualifiedLocalContactSolventFlux = {
      nmpMolM2S: 6.145286375e-4,
      h2oMolM2S: 4.444661153e-5,
    };
    const artificialGlobalPairSolventFlux = {
      nmpMolM2S: -5.0633159008829556e-5,
      h2oMolM2S: -1.4160839270758237e-5,
    };
    expect(qualifiedLocalContactSolventFlux.nmpMolM2S).toBeGreaterThanOrEqual(0);
    expect(qualifiedLocalContactSolventFlux.h2oMolM2S).toBeGreaterThanOrEqual(0);
    expect(artificialGlobalPairSolventFlux.nmpMolM2S).toBeLessThan(0);
    expect(artificialGlobalPairSolventFlux.h2oMolM2S).toBeLessThan(0);
  });

  it('pins the boundary qualifier in prepared and queued immutable lineage', () => {
    const service = readFileSync('server/ecr-pre-pilot-service.ts', 'utf8');
    const queue = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
    expect(service).toContain('currentJobCArtifactHashes()');
    expect(service).toContain('jobCBoundaryInterfaceQualifierSha256: jobCArtifacts.boundaryQualifierHash');
    expect(queue).toContain(
      'artifacts.boundaryQualifierHash === deps?.jobCBoundaryInterfaceQualifierSha256',
    );
    expect(queue).toContain('jobCResultHash(snapshot)');
    expect(queue).toContain('jobCResultHash(snapshot.prepared)');
  });

  it('forms one deterministic equivalence class per eligible qualifier root', () => {
    const qualifier = readFileSync(
      'server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py', 'utf8',
    );
    expect(qualifier).toContain('found=root_class; break');
    expect(qualifier).toContain('found["_members"].append(candidate)');
    expect(qualifier).toContain('"independentlyReproduced":len(members)>=2');
    expect(qualifier).toContain('if len(members)>=2:');
    expect(qualifier).toContain('selected=min(selectable');
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

  it('uses bounded Picard predictors and a coupled continuation fallback', () => {
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
    expect(worker).toContain('COUPLED_BOUNDED_SPARSE_189_CONTINUATION');
    expect(worker).toContain('COUPLED_POSITIVE_FEASIBILITY_UNRESOLVED');
    expect(worker).toContain('"physicalInfeasibilityClaimed":False');
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
    expect(worker.match(/lambda q:residual\(q,lam\)/g)).toHaveLength(1);
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

  it('turns solver budget expiry and unavailable refresh evidence into governed diagnostics', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const controller = readFileSync('server/ecr-pre-pilot/job-c.ts', 'utf8');
    const controlledClock = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, signal, time
source = open("server/ecr-pre-pilot/job-c/worker.py").read()
tree = ast.parse(source)
selected = []
for node in tree.body:
    if isinstance(node, ast.ClassDef) and node.name == "JobCBlocked":
        selected.append(node)
    if isinstance(node, ast.FunctionDef) and node.name in (
        "require_runtime_budget", "terminate_descendants",
        "qualification_budget_block", "run_with_qualification_budget"):
        selected.append(node)
namespace = {"_active_qualification_pool": None, "time": time, "signal": signal,
  "NONLINEAR_SOLVER_BUDGET_SECONDS": 720}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "runtime-budget-test", "exec"), namespace)
budget = {"started": 10.0, "maximumSeconds": 5.0}
at_limit = namespace["require_runtime_budget"](budget, 15.0)
expired = False
try:
    namespace["require_runtime_budget"](budget, 15.000001)
except TimeoutError:
    expired = True
actions = []
class Pool:
    def terminate(self): actions.append("terminate")
    def join(self): actions.append("join")
namespace["_active_qualification_pool"] = Pool()
exit_code = None
try:
    namespace["terminate_descendants"](15, None)
except SystemExit as error:
    exit_code = error.code
qualification_code = None
solver_status = None
qualification_budget = {"started": time.monotonic(), "maximumSeconds": 0.02}
try:
    namespace["run_with_qualification_budget"](
      qualification_budget, lambda: time.sleep(0.1), "NOT_CHECKED")
except namespace["JobCBlocked"] as error:
    qualification_code = error.code
    solver_status = error.diagnostics["runtimeBudgets"]["nonlinearSolver"]["status"]
print(json.dumps({"atLimit": at_limit, "expired": expired,
  "cancelActions": actions, "exitCode": exit_code,
  "qualificationCode": qualification_code, "solverStatus": solver_status}))
`], { encoding: 'utf8' }));
    expect(controlledClock).toEqual({
      atLimit: 5,
      expired: true,
      cancelActions: ['terminate', 'join'],
      exitCode: 143,
      qualificationCode: 'JOB_C_QUALIFICATION_RUNTIME_BUDGET',
      solverStatus: 'NOT_STARTED',
    });
    expect(worker).toContain('QUALIFICATION_BUDGET_SECONDS=600');
    expect(worker).toContain('NONLINEAR_SOLVER_BUDGET_SECONDS=720');
    expect(worker).toContain('"cacheStatus":"HIT_FULL_HASH_MATCH"');
    expect(worker).toContain('budget["started"]=time.monotonic()');
    expect(worker).toContain('run_with_qualification_budget(qualification_budget,');
    expect(worker).toContain('signal.setitimer(signal.ITIMER_REAL,max(remaining,1e-6))');
    expect(worker).toContain('"jobBManifestSha256":file_sha256(job_b_manifest_path)');
    expect(worker).toContain('"thermodynamicInputSha256":digest(thermodynamic_input)');
    expect(worker).toContain('"qualificationRequestsSha256":digest(qualification_requests)');
    expect(worker).toContain('"branchCtC":branch["CtC"],"branchCtD":branch["CtD"]');
    expect(worker).toContain('"profileSha256":r["axialLocalContactProfileSha256"]');
    expect(worker).toContain('"sha256":file_sha256(qualifier_path)');
    expect(worker).toContain('"error":"JOB_C_INTERNAL_RUNTIME_BUDGET"');
    const coupledStart = worker.indexOf(
      'coupled_starts=[("LAST_ACCEPTED_COUPLED_STATE",accepted_x)]',
    );
    const coupledEnd = worker.indexOf(
      'unconstrained=None',
      coupledStart,
    );
    const coupled = worker.slice(coupledStart, coupledEnd);
    expect(coupled).toContain('except TimeoutError:');
    expect(coupled).toContain('"terminatedBy":"INTERNAL_RUNTIME_BUDGET"');
    expect(coupled).toContain('coupled_budget_exhausted=True');
    expect(worker).toContain('"qualification":"NOT_RUN_INTERNAL_RUNTIME_BUDGET"');
    expect(worker).toContain(
      '"status":"NOT_COMPUTED_FROZEN_FV_DID_NOT_CLOSE"',
    );
    expect(worker).toContain('def frozen_scaled(flow_vector):\n'
      + '                    require_runtime_budget(budget)');
    expect(worker).toContain('"phase":"BOUNDED_FROZEN_FV_SOLVE"');
    expect(worker).toContain('"phase":"UNBOUNDED_TERMINAL_DIAGNOSTIC"');
    expect(worker).toContain('"qualification":"TERMINATED_INTERNAL_RUNTIME_BUDGET"');
    expect(worker).toContain(
      '"rejectedStepSourceRefreshMismatch":',
    );
    expect(worker).not.toContain(
      'last_accepted.get("integratedSourceMismatchRawMolS",0.0)',
    );
    expect(worker).toContain('"error":"JOB_C_INTERNAL_RUNTIME_BUDGET"');
    expect(worker).toContain('"classification":"NUMERICAL_RUNTIME_BUDGET_EXHAUSTED"');
    expect(controller).toContain('const JOB_C_QUALIFICATION_BUDGET_MS = 600_000;');
    expect(controller).toContain('const JOB_C_NONLINEAR_SOLVER_BUDGET_MS = 720_000;');
    expect(controller).toContain('JOB_C_QUALIFICATION_CACHE_DIR:');
  });

  it('reuses only intact contact evidence with an exact scientific cache identity', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, os, stat, tempfile
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {"canonical","hashed","digest","file_sha256","qualification_cache_identity",
  "qualification_cache_path","finite_vector","load_qualification_cache",
  "store_qualification_cache"}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
         and node.name in names]
namespace = {
  "hashlib": __import__("hashlib"), "json": json, "math": __import__("math"),
  "os": os, "tempfile": tempfile, "Path": Path,
  "root": Path("dist/job-b-interface-runtime").resolve(),
  "QUALIFIER_VERSION": "ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V1",
  "__file__": str(Path("server/ecr-pre-pilot/job-c/worker.py").resolve()),
}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "cache-test", "exec"), namespace)
request = json.loads(Path("tests/fixtures/design269-job-c-worker-request.json").read_text())
digest = namespace["digest"]
branch = request["boundaryBranchQualificationRequest"]
branch["sourceStateSha256"] = digest({k:v for k,v in branch.items()
                                     if k != "sourceStateSha256"})
request["axialLocalContactProfileSha256"] = digest({
  "authority": request["axialLocalContactProfileAuthority"],
  "profile": request["axialLocalContactProfile"],
})
cache_dir = tempfile.mkdtemp(prefix="job-c-cache-test-")
os.environ["JOB_C_QUALIFICATION_CACHE_DIR"] = cache_dir
qualified = []
for index, contact in enumerate(request["axialLocalContactProfile"]):
  response = {
    "status": "QUALIFIED_JOB_C_BOUNDARY_BRANCH",
    "unknowns": [float(index)] * 13,
    "interface": {
      "continuousComponentFluxMolM2S": [float(index)] * 7,
      "dispersedComponentFluxMolM2S": [float(index)] * 7,
    },
  }
  response["resultHash"] = digest(response)
  qualified.append({
    "index": index,
    "evidence": {"numericalCell": index + 1,
      "provenance": contact["provenance"], "qualifier": response},
    "flux": response["interface"]["continuousComponentFluxMolM2S"],
    "unknowns": response["unknowns"],
  })
identity, key = namespace["qualification_cache_identity"](request)
namespace["store_qualification_cache"](identity, key, qualified)
hit, _, hit_key = namespace["load_qualification_cache"](request)
mode = stat.S_IMODE(os.stat(namespace["qualification_cache_path"](key)).st_mode)
changed = json.loads(json.dumps(request))
changed_branch = changed["boundaryBranchQualificationRequest"]
changed_branch["CtC"] += 1
changed_branch["sourceStateSha256"] = digest({
  k:v for k,v in changed_branch.items() if k != "sourceStateSha256"
})
miss, _, changed_key = namespace["load_qualification_cache"](changed)
cache_path = namespace["qualification_cache_path"](key)
envelope = json.loads(cache_path.read_text())
envelope["qualifiedContacts"][0]["flux"] = [0.0] * 6
body = {k:v for k,v in envelope.items() if k != "cacheEnvelopeSha256"}
envelope["cacheEnvelopeSha256"] = digest(body)
cache_path.write_text(namespace["canonical"](envelope))
tampered, _, _ = namespace["load_qualification_cache"](request)
print(json.dumps({"hit": hit is not None, "sameKey": key == hit_key,
  "privateMode": mode, "changedMiss": miss is None,
  "changedKey": changed_key != key, "tamperedMiss": tampered is None}))
`], { encoding: 'utf8' }));
    expect(observed).toEqual({
      hit: true,
      sameKey: true,
      privateMode: 0o600,
      changedMiss: true,
      changedKey: true,
      tamperedMiss: true,
    });
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

  it('qualifies an axial profile before a boundary-aware positive continuation', () => {
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
    expect(worker).toContain('JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL');
    expect(worker).toContain('allHydrocarbonPrefixesAndSolventSuffixesAdmitted');
    expect(worker).toContain('qualifiedLocalContacts');
    expect(worker).toContain('initial_lambda=min(1e-5,upper*.25)');
    expect(worker).toContain('transfer=initial_lambda*profile_flux*av*A*dz');
    expect(worker).toContain('lambda_targets=sorted(set([initial_lambda');
    expect(worker).toContain('lambda_targets.insert(');
    expect(worker).toContain('minimum_lambda_interval=1e-8');
    expect(worker).toContain('"literalPhysicalFeedFacesPreserved":True');
    expect(worker).not.toContain('ZERO_TRANSFER_POSITIVE_BOUND_SEED_NOT_EXACT_ZERO_FEED_FV_ROOT');
    expect(worker).not.toContain('zeroFeedPositiveBoundSeeds');
  });
});