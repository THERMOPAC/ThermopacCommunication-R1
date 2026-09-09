import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JOB_C_COMPONENT_ORDER,
  JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
  jobCResultHash,
  runJobCWorker,
} from '../server/ecr-pre-pilot/job-c';
import {
  jobCCheckpointRequestPayload,
  validateJobCCheckpoint,
} from '../server/ecr-pre-pilot/job-c-job-service';

describe('ECR pre-pilot Job C governed numerical basis', () => {
  it('waits for graceful cancellation, forwards the last checkpoint, and never completes it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'job-c-cancel-'));
    const workerDir = join(root, 'server/ecr-pre-pilot/job-c');
    mkdirSync(workerDir, { recursive: true });
    const interrupted = {
      protocol: 'ECR_PRE_PILOT_JOB_C_V1',
      status: 'INTERRUPTED_PRELIMINARY_JOB_C',
      interrupted: true,
      complete: false,
    };
    const response = { ...interrupted, resultSha256: jobCResultHash(interrupted) };
    writeFileSync(join(workerDir, 'worker.py'), `
import json, signal, sys, time
sys.stdin.readline()
def stop(signum, frame):
    print("JOB_C_CHECKPOINT "+json.dumps({"schemaVersion":"ECR_JOB_C_PARTIAL_V1","complete":False,"completedResults":[{"id":"contact-1","kind":"QUALIFIED_CONTACT"}]}), flush=True)
    print(${JSON.stringify(JSON.stringify(response))}, flush=True)
    sys.exit(0)
signal.signal(signal.SIGTERM, stop)
print("JOB_C_PROGRESS "+json.dumps({"phase":"nonlinear solve","completed":1,"total":7,"iteration":4,"residual":1e-5,"residualKind":"scaled","elapsedSeconds":12.5,"heightCandidateM":2.0}), flush=True)
while True: time.sleep(0.05)
`);
    const previousRoot = process.env.JOB_C_RUNTIME_ROOT;
    const previousPython = process.env.JOB_C_PYTHON;
    process.env.JOB_C_RUNTIME_ROOT = root;
    process.env.JOB_C_PYTHON = 'python3';
    const controller = new AbortController();
    let checkpoint: Record<string, any> | undefined;
    try {
      await expect(runJobCWorker({} as any, {
        signal: controller.signal,
        onProgress: (_phase, _completed, _total, diagnostics) => {
          expect(diagnostics).toMatchObject({
            iteration: 4, residual: 1e-5, elapsedSeconds: 12.5, heightCandidateM: 2,
          });
          controller.abort();
        },
        onCheckpoint: value => { checkpoint = value; },
      })).rejects.toMatchObject({
        message: 'JOB_C_CANCELLED',
        details: { workerResult: expect.objectContaining({ complete: false }) },
      });
      expect(checkpoint).toMatchObject({
        schemaVersion: 'ECR_JOB_C_PARTIAL_V1',
        complete: false,
        completedResults: [{ id: 'contact-1', kind: 'QUALIFIED_CONTACT' }],
      });
    } finally {
      if (previousRoot === undefined) delete process.env.JOB_C_RUNTIME_ROOT;
      else process.env.JOB_C_RUNTIME_ROOT = previousRoot;
      if (previousPython === undefined) delete process.env.JOB_C_PYTHON;
      else process.env.JOB_C_PYTHON = previousPython;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('retains terminal worker evidence when checkpoint persistence fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'job-c-checkpoint-failure-'));
    const workerDir = join(root, 'server/ecr-pre-pilot/job-c');
    mkdirSync(workerDir, { recursive: true });
    const blocked = {
      protocol: 'ECR_PRE_PILOT_JOB_C_V1',
      status: 'BLOCKED_PRELIMINARY_JOB_C',
      error: 'JOB_C_BOUNDARY_CONTINUATION_NOT_REPRODUCIBLE',
    };
    const response = { ...blocked, resultSha256: jobCResultHash(blocked) };
    writeFileSync(join(workerDir, 'worker.py'), `
import json, sys
sys.stdin.readline()
print("JOB_C_CHECKPOINT "+json.dumps({"schemaVersion":"ECR_PRE_PILOT_JOB_C_PARTIAL_V1","complete":False,"requestSha256":"bad","completedResults":[],"progress":{"phase":"test"}}), flush=True)
print(${JSON.stringify(JSON.stringify(response))}, flush=True)
`);
    const previousRoot = process.env.JOB_C_RUNTIME_ROOT;
    const previousPython = process.env.JOB_C_PYTHON;
    process.env.JOB_C_RUNTIME_ROOT = root;
    process.env.JOB_C_PYTHON = 'python3';
    try {
      await expect(runJobCWorker({} as any, {
        onCheckpoint: () => {
          throw new Error('CHECKPOINT_WRITE_FAILED');
        },
      })).rejects.toMatchObject({
        message: 'JOB_C_CHECKPOINT_PERSISTENCE_FAILED',
        details: {
          cause: 'CHECKPOINT_WRITE_FAILED',
          workerResult: expect.objectContaining({
            status: 'BLOCKED_PRELIMINARY_JOB_C',
            error: 'JOB_C_BOUNDARY_CONTINUATION_NOT_REPRODUCIBLE',
          }),
        },
      });
    } finally {
      if (previousRoot === undefined) delete process.env.JOB_C_RUNTIME_ROOT;
      else process.env.JOB_C_RUNTIME_ROOT = previousRoot;
      if (previousPython === undefined) delete process.env.JOB_C_PYTHON;
      else process.env.JOB_C_PYTHON = previousPython;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ['malformed JSON', '{"broken":'],
    ['null', 'null'],
    ['array', '[]'],
    ['invalid object', '{}'],
  ])('fails closed for an unterminated %s checkpoint at EOF', async (_label, payload) => {
    const root = mkdtempSync(join(tmpdir(), 'job-c-checkpoint-eof-'));
    const workerDir = join(root, 'server/ecr-pre-pilot/job-c');
    mkdirSync(workerDir, { recursive: true });
    const blocked = {
      protocol: 'ECR_PRE_PILOT_JOB_C_V1',
      status: 'BLOCKED_PRELIMINARY_JOB_C',
      error: 'EXPECTED_SCIENTIFIC_BLOCK',
    };
    const response = { ...blocked, resultSha256: jobCResultHash(blocked) };
    writeFileSync(join(workerDir, 'worker.py'), `
import sys
sys.stdin.readline()
print(${JSON.stringify(JSON.stringify(response))}, flush=True)
sys.stdout.write("JOB_C_CHECKPOINT "+${JSON.stringify(payload)})
sys.stdout.flush()
`);
    const previousRoot = process.env.JOB_C_RUNTIME_ROOT;
    const previousPython = process.env.JOB_C_PYTHON;
    process.env.JOB_C_RUNTIME_ROOT = root;
    process.env.JOB_C_PYTHON = 'python3';
    try {
      await expect(runJobCWorker({} as any, {
        onCheckpoint: checkpoint => validateJobCCheckpoint(
          checkpoint, 'a'.repeat(64),
        ),
      })).rejects.toMatchObject({
        message: 'JOB_C_CHECKPOINT_PERSISTENCE_FAILED',
        details: {
          cause: 'JOB_C_CHECKPOINT_INVALID',
          workerResult: expect.objectContaining({
            status: 'BLOCKED_PRELIMINARY_JOB_C',
            error: 'EXPECTED_SCIENTIFIC_BLOCK',
          }),
        },
      });
    } finally {
      if (previousRoot === undefined) delete process.env.JOB_C_RUNTIME_ROOT;
      else process.env.JOB_C_RUNTIME_ROOT = previousRoot;
      if (previousPython === undefined) delete process.env.JOB_C_PYTHON;
      else process.env.JOB_C_PYTHON = previousPython;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports checkpoint envelope fields that fail validation', () => {
    const expected = 'a'.repeat(64);
    expect(() => validateJobCCheckpoint({
      schemaVersion: 'ECR_JOB_C_PARTIAL_V1',
      complete: false,
      requestSha256: expected,
      completedResults: [],
      progress: { phase: 'test' },
    }, expected)).not.toThrow();
    expect(() => validateJobCCheckpoint({
      schemaVersion: 'wrong',
      complete: true,
      requestSha256: 'wrong',
      completedResults: {},
      progress: {},
    }, expected)).toThrowError(expect.objectContaining({
      message: 'JOB_C_CHECKPOINT_INVALID',
      details: expect.objectContaining({
        failures: [
          'SCHEMA_VERSION', 'COMPLETE_FLAG', 'REQUEST_SHA256',
          'COMPLETED_RESULTS', 'PROGRESS',
        ],
      }),
    }));
  });

  it('normalizes checkpoint hashes symmetrically with the Python worker', () => {
    const transported = {
      protocol: 'ECR_PRE_PILOT_JOB_C_V1',
      operation: 'SOLVE_HEIGHT',
      resumeCheckpoint: { stale: true },
      temperatureK: 333.15,
    };
    expect(jobCCheckpointRequestPayload(transported)).toEqual({
      temperatureK: 333.15,
    });
    expect(jobCResultHash(jobCCheckpointRequestPayload(transported)))
      .toBe('3997adc82aca88668052749bae5f41fdabf51c122404c0684dcb48f01e3a28c4');
  });

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

  it('normalizes signed zero identically across Python and JS without rounding tiny positives', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
         and node.name in {"native_json_scalar", "canonical", "hashed", "digest"}]
namespace = {"hashlib": __import__("hashlib"), "json": json}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "signed-zero-test", "exec"), namespace)
negative = json.loads('{"outer":[-0.0,{"map":{"negative":-0.0,"positive":0.0}},[0.0,-0.0]],"tiny":[5e-324,{"value":1e-300}]}')
positive = json.loads('{"outer":[0.0,{"map":{"negative":0.0,"positive":0.0}},[0.0,0.0]],"tiny":[5e-324,{"value":1e-300}]}')
zeroed_tiny = json.loads('{"outer":[0.0,{"map":{"negative":0.0,"positive":0.0}},[0.0,0.0]],"tiny":[0.0,{"value":0.0}]}')
print(json.dumps({
  "negativeCanonical": namespace["canonical"](namespace["hashed"](negative)),
  "positiveCanonical": namespace["canonical"](namespace["hashed"](positive)),
  "negativeDigest": namespace["digest"](negative),
  "positiveDigest": namespace["digest"](positive),
  "zeroedTinyDigest": namespace["digest"](zeroed_tiny),
}))
`], { encoding: 'utf8' }));
    const negative = {
      outer: [-0, { map: { negative: -0, positive: 0 } }, [0, -0]],
      tiny: [5e-324, { value: 1e-300 }],
    };
    const positive = {
      outer: [0, { map: { negative: 0, positive: 0 } }, [0, 0]],
      tiny: [5e-324, { value: 1e-300 }],
    };
    expect(observed.negativeCanonical).toBe(observed.positiveCanonical);
    expect(observed.negativeCanonical).toContain('4.9406564584124654e-324');
    expect(observed.negativeCanonical).toContain('1.0000000000000000e-300');
    expect(observed.negativeDigest).toBe(observed.positiveDigest);
    expect(observed.negativeDigest).toBe(jobCResultHash(negative));
    expect(observed.positiveDigest).toBe(jobCResultHash(positive));
    expect(observed.zeroedTinyDigest).not.toBe(observed.positiveDigest);
  });

  it('captures raw worker text before rejecting a bad result hash', async () => {
    const runtime = readFileSync('server/ecr-pre-pilot/job-c.ts', 'utf8');
    const captureAt = runtime.indexOf('options.onRawResponse?.(finalLines.join');
    const parseAt = runtime.indexOf('const response = JSON.parse(finalLines[0])');
    const integrityAt = runtime.indexOf(
      'response.resultSha256 !== jobCResultHash(response)',
    );
    expect(captureAt).toBeGreaterThan(-1);
    expect(captureAt).toBeLessThan(parseAt);
    expect(parseAt).toBeLessThan(integrityAt);
    expect(runtime).toContain('Research capture only; never bypasses the response integrity check.');

    const root = mkdtempSync(join(tmpdir(), 'job-c-bad-hash-'));
    const workerDir = join(root, 'server/ecr-pre-pilot/job-c');
    mkdirSync(workerDir, { recursive: true });
    const raw = '{"protocol":"ECR_PRE_PILOT_JOB_C_V1", "resultSha256":"bad"}';
    writeFileSync(join(workerDir, 'worker.py'), `import sys\nsys.stdin.readline()\nprint('${raw}')\n`);
    const previousRoot = process.env.JOB_C_RUNTIME_ROOT;
    const previousPython = process.env.JOB_C_PYTHON;
    process.env.JOB_C_RUNTIME_ROOT = root;
    process.env.JOB_C_PYTHON = 'python3';
    let captured: string | undefined;
    try {
      await expect(runJobCWorker({} as any, {
        onRawResponse: value => { captured = value; },
      })).rejects.toThrow('JOB_C_WORKER_RESPONSE_INTEGRITY_INVALID');
      expect(captured).toBe(raw);
    } finally {
      if (previousRoot === undefined) delete process.env.JOB_C_RUNTIME_ROOT;
      else process.env.JOB_C_RUNTIME_ROOT = previousRoot;
      if (previousPython === undefined) delete process.env.JOB_C_PYTHON;
      else process.env.JOB_C_PYTHON = previousPython;
      rmSync(root, { recursive: true, force: true });
    }
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
    expect(worker).toContain('COUPLED_BOUNDED_SPARSE_189_CONTINUATION');
    expect(worker).toContain('JOB_C_POSITIVE_BRANCH_LIMIT_REACHED');
    expect(worker).toContain('FINITE_SCIENTIFIC_TRIAL_PLAN_EXHAUSTED');
    expect(worker).toContain('maximum_bracket_refinements=3');
    expect(worker).toContain('REJECTED_COUPLED_CONTINUATION_TRIAL');
    expect(worker).toContain('JOB_C_LAMBDA1_MONOLITHIC_REPLAY_FAILED');
    expect(worker).toContain('"dominantResidualRows":diagnostics(ev)');
    expect(worker).toContain(
      'np.asarray(solver_start_profile_unknowns).reshape(-1)',
    );
    expect(worker).toContain('JOB_C_BOUNDARY_AWARE_INITIAL_PROFILE_INVALID');
    expect(worker).toContain('max_nfev=40');
    expect(worker).toContain('progress("direct coupled zero-transfer bootstrap"');
    expect(worker).toContain('else f"direct coupled lambda {lam:g}",');
    expect(worker).toContain('progress("lambda 1 monolithic replay")');
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
    expect(profileSeed).toBe(-1);
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
    const runtime = readFileSync('server/ecr-pre-pilot/job-c.ts', 'utf8');
    const packager = readFileSync('scripts/package-job-c-runtime.mjs', 'utf8');
    expect(service).toContain('currentJobCArtifactHashes()');
    expect(service).toContain('jobCBoundaryInterfaceQualifierSha256: jobCArtifacts.boundaryQualifierHash');
    expect(service).toContain('jobCBranchContinuationSha256: jobCArtifacts.branchContinuationHash');
    expect(queue).toContain(
      'artifacts.boundaryQualifierHash === deps?.jobCBoundaryInterfaceQualifierSha256',
    );
    expect(queue).toContain(
      'artifacts.branchContinuationHash === deps?.jobCBranchContinuationSha256',
    );
    expect(queue).toContain('jobCResultHash(snapshot)');
    expect(queue).toContain('jobCResultHash(snapshot.prepared)');
    expect(packager).toContain("version: 'ECR_JOB_C_BRANCH_CONTINUATION_V1'");
    expect(packager).toContain('branchContinuation: {');
    expect(runtime).toContain(
      "digest('server/ecr-pre-pilot/job-c/branch_continuation.py')",
    );
    expect(runtime).toContain(
      "manifest.branchContinuation?.version !== 'ECR_JOB_C_BRANCH_CONTINUATION_V1'",
    );
  });

  it('forms one deterministic equivalence class per eligible qualifier root', () => {
    const qualifier = readFileSync(
      'server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py', 'utf8',
    );
    expect(qualifier).toContain('found=root_class; break');
    expect(qualifier).toContain('found["_members"].append(candidate)');
    expect(qualifier).toContain('"independentlyReproduced":len(independent_pairs)>0');
    expect(qualifier).toContain('if independent_pairs:');
    expect(qualifier).toContain('INDEPENDENT_START_MINIMUM_SCALED_SEPARATION = 2e-3');
    expect(qualifier).toContain('"startStateSha256":digest(initial.tolist())');
    expect(qualifier).toContain('"INDEPENDENT_HYBRID_FLUX_PLUS",oriented[0],xb_d');
    expect(qualifier).toContain('.01*bound,"INPUT_DERIVED_HYBRID_NONZERO_FLUX_V1"');
    expect(qualifier).toContain('if second is representative: continue');
    expect(qualifier).toContain('state_of(representative),state_of(second)');
    expect(qualifier).toContain('endpoint_difference>endpoint_tolerance');
    expect(qualifier).toContain('initial_separation<INDEPENDENT_START_MINIMUM_SCALED_SEPARATION');
    expect(qualifier).toContain('ECR_JOB_C_CROSS_QUALIFIED_LOG_RATIO_HESSIAN_V1');
    expect(qualifier).toContain('"stepSizeConverged":bool(scalar_converged and projected_converged');
    expect(qualifier).toContain('"crossReconstructionAgreement":{');
    expect(qualifier).toContain('"symmetryAccepted":symmetry_converged');
    expect(qualifier).toContain('selected=min(selectable');
  });

  it('requires direct endpoint agreement and genuinely separated starts', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import importlib.util, json
spec=importlib.util.spec_from_file_location(
  "qualifier","server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py")
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
def check(endpoint,seed,primary_hash="a",witness_hash="b",
          primary_lineage="primary",witness_lineage="witness"):
  return module.independent_pair_evidence(
    [0.0],[endpoint],[0.0],[seed],primary_hash,witness_hash,
    primary_lineage,witness_lineage,1e-3) is not None
print(json.dumps({
  "accepted":check(9e-4,1e-2),
  "endpointRejected":check(1.8e-3,1e-2),
  "seedRejected":check(9e-4,1e-3),
  "hashRejected":check(9e-4,1e-2,witness_hash="a"),
  "lineageRejected":check(9e-4,1e-2,witness_lineage="primary"),
}))
`], { encoding: 'utf8' }));
    expect(observed).toEqual({
      accepted: true,
      endpointRejected: false,
      seedRejected: false,
      hashRejected: false,
      lineageRejected: false,
    });
  });

  it('solves and qualifies the exact height reported after bisection', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const h2Solve = worker.indexOf('low=solve_height(2.0,resume_anchor)');
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

  it('has no qualification, nonlinear-solver, or outer wall-clock deadline', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const controller = readFileSync('server/ecr-pre-pilot/job-c.ts', 'utf8');
    const controlledClock = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, signal, time
source = open("server/ecr-pre-pilot/job-c/worker.py").read()
tree = ast.parse(source)
selected = [node for node in tree.body if isinstance(node, ast.FunctionDef)
            and node.name in ("require_runtime_budget", "run_with_qualification_budget")]
namespace = {"time": time, "signal": signal}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "runtime-budget-test", "exec"), namespace)
limits = {}
for node in tree.body:
    if isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id in (
              "QUALIFICATION_BUDGET_SECONDS", "NONLINEAR_SOLVER_BUDGET_SECONDS"):
                limits[target.id] = ast.literal_eval(node.value)
print(json.dumps({"limits": limits,
  "unlimitedElapsed": namespace["require_runtime_budget"](
    {"started": 0.0, "maximumSeconds": None}, 86400.0),
  "unlimitedOperation": namespace["run_with_qualification_budget"](
    {"started": time.monotonic()-86400.0, "maximumSeconds": None},
    lambda: "completed", "MISS"),
  "alarmRemaining": signal.getitimer(signal.ITIMER_REAL)[0]}))
`], { encoding: 'utf8' }));
    expect(controlledClock).toEqual({
      limits: {
        QUALIFICATION_BUDGET_SECONDS: null,
        NONLINEAR_SOLVER_BUDGET_SECONDS: null,
      },
      unlimitedElapsed: 86400,
      unlimitedOperation: 'completed',
      alarmRemaining: 0,
    });
    expect(worker).toContain('QUALIFICATION_BUDGET_SECONDS=None');
    expect(worker).not.toContain('QUALIFICATION_BUDGET_SECONDS=600');
    expect(worker).toContain('NONLINEAR_SOLVER_BUDGET_SECONDS=None');
    expect(worker).not.toContain('NONLINEAR_SOLVER_BUDGET_SECONDS=720');
    expect(worker).toContain('"cacheStatus":"HIT_FULL_HASH_MATCH"');
    expect(worker).toContain('budget["started"]=time.monotonic()');
    expect(worker).toContain('run_with_qualification_budget(qualification_budget,');
    expect(worker).toContain('"jobBManifestSha256":file_sha256(job_b_manifest_path)');
    expect(worker).toContain('"thermodynamicInputSha256":digest(thermodynamic_input)');
    expect(worker).toContain('"qualificationRequestsSha256":digest(qualification_requests)');
    expect(worker).toContain('"branchCtC":branch["CtC"],"branchCtD":branch["CtD"]');
    expect(worker).toContain('"profileSha256":r["axialLocalContactProfileSha256"]');
    expect(worker).toContain('"sha256":file_sha256(qualifier_path)');
    expect(worker).not.toContain('BOUNDED_FROZEN_FV_SOLVE');
    expect(worker).not.toContain('UNBOUNDED_TERMINAL_DIAGNOSTIC');
    expect(worker).not.toContain('rejectedStepSourceRefreshMismatch');
    expect(worker).toContain('"phase":"DIRECT_COUPLED_189_EQUATION_SOLVE"');
    expect(worker).not.toContain(
      'last_accepted.get("integratedSourceMismatchRawMolS",0.0)',
    );
    expect(controller).not.toContain('JOB_C_TIMEOUT');
    expect(controller).not.toContain('timeoutMs');
    expect(controller).not.toContain('JOB_C_NONLINEAR_SOLVER_BUDGET_MS');
    expect(controller.match(/setTimeout\(/g)).toHaveLength(1);
    expect(controller).toContain("child.kill('SIGKILL')");
    expect(worker).toContain('progress("boundary interface qualification")');
    expect(worker).toContain('progress("nonlinear solver started")');
    expect(controller).toContain('JOB_C_QUALIFICATION_CACHE_DIR:');
  });

  it('reuses only intact contact evidence with an exact scientific cache identity', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, os, stat, tempfile
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {"native_json_scalar","canonical","hashed","digest",
  "file_sha256","qualification_cache_identity",
  "qualification_cache_path","finite_vector","load_qualification_cache",
  "store_qualification_cache"}
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
         and node.name in names]
namespace = {
  "hashlib": __import__("hashlib"), "json": json, "math": __import__("math"),
  "os": os, "tempfile": tempfile, "Path": Path,
  "root": Path("dist/job-b-interface-runtime").resolve(),
  "QUALIFIER_VERSION": "ECR_JOB_C_BOUNDARY_INTERFACE_QUALIFIER_V2",
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

  it('qualifies an axial profile before globally conservative coupled continuation', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('positiveGlobalOutletNecessaryConditionPassed');
    expect(worker).toContain('sourceSignReversalWouldResolveAllBoundaries');
    expect(worker).toContain('"physicalInfeasibilityClaimed":False');
    expect(worker).toContain('GLOBAL_INLET_FULL_SCALE_FROZEN_FLUX_DIAGNOSTIC_ONLY');
    expect(worker).toContain('DIRECT_COUPLED_189_EQUATION_SOLVE');
    expect(worker).not.toContain('require_positive_frozen_solution');
    expect(worker).not.toContain('current_flows=x[:14*m].copy()');
    expect(worker).not.toContain('LOCAL_FLUX_PICARD_BOUNDED_DENSE_98_FV');
    expect(worker).not.toContain(
      'if not inlet_flux_audit[\n                      "positiveGlobalOutletNecessaryConditionPassed"]',
    );
    expect(worker).toContain('minimum_flow<=0');
    expect(worker).toContain('c[j]/c[j].sum()');
    expect(worker).toContain('d[j]/d[j].sum()');
    expect(worker).toContain('JOB_C_AXIAL_PROFILE_NO_POSITIVE_CONTINUATION_INTERVAL');
    expect(worker).toContain('allHydrocarbonPrefixesAndSolventSuffixesAdmitted');
    expect(worker).toContain('qualifiedLocalContacts');
    expect(worker).toContain('profile_interval_probe_lambda=(');
    expect(worker).toContain('bootstrap_lambda=1e-8');
    expect(worker).not.toContain('transfer=initial_lambda*profile_flux*av*A*dz');
    expect(worker).toContain('lambda_targets=coupled_lambda_targets(bootstrap_lambda)');
    expect(worker).toContain('lambda_targets.insert(');
    expect(worker).toContain('minimum_lambda_interval=1e-10');
    expect(worker).toContain('"literalPhysicalFeedFacesPreserved":True');
    expect(worker).toContain('GAUSS_NEWTON_CORRECTED_STATE');
    expect(worker).toContain('coupled_gauss_newton_candidate(');
    expect(worker).toContain('ACCEPTED_COUPLED_CONTINUATION_ANCHOR');
    expect(worker).not.toContain('ZERO_TRANSFER_POSITIVE_BOUND_SEED_NOT_EXACT_ZERO_FEED_FV_ROOT');
    expect(worker).not.toContain('zeroFeedPositiveBoundSeeds');
  });

  it('uses an inventory-conservative positive seed and direct coupled homotopy', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const seed = worker.indexOf('flows,_=globally_conservative_interior_seed(');
    const coupled = worker.indexOf(
      'COUPLED_BOUNDED_SPARSE_189_CONTINUATION',
      seed,
    );
    expect(seed).toBeGreaterThan(-1);
    expect(worker).toContain('globally_conservative_interior_seed(');
    expect(worker.indexOf('seed_interfaces,_,seed_gate=solve_local_interfaces(', seed))
      .toBeGreaterThan(seed);
    expect(worker.indexOf(
      'np,coupled_fit.x,lam,raw_evaluate,gate_metrics,',
      coupled,
    ))
      .toBeGreaterThan(coupled);
    expect(worker).not.toContain('transfer=initial_lambda*profile_flux*av*A*dz');
    expect(worker).toContain('raw_evaluate(x,lam)');
    expect(worker).toContain('raw<=1e-7');
    expect(worker).toContain('scaled<=1e-7');
  });

  it('accepts an unchanged-system zero-transfer anchor before positive lambda', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const targets = worker.indexOf(
      'lambda_targets=coupled_lambda_targets(bootstrap_lambda)',
    );
    const loop = worker.indexOf('while lambda_index<len(lambda_targets):', targets);
    const solve = worker.indexOf('scipy.optimize.least_squares', loop);
    const acceptance = worker.indexOf('coupled_accepted=selected["accepted"]', solve);
    expect(targets).toBeGreaterThan(-1);
    expect(loop).toBeGreaterThan(targets);
    expect(solve).toBeGreaterThan(loop);
    expect(acceptance).toBeGreaterThan(solve);
    expect(worker).toContain(
      'COUPLED_BOUNDED_SPARSE_189_ZERO_TRANSFER_BOOTSTRAP',
    );
    expect(worker).toContain(
      'DIRECT_COUPLED_189_EQUATION_ZERO_TRANSFER_BOOTSTRAP',
    );
    expect(worker).toContain('scipy.optimize._numdiff.approx_derivative(');
    expect(worker).toContain('method="3-point"');
    expect(worker).toContain('base_residual,accepted_x');
    expect(worker).toContain('base_residual,probe_residual=coupled_objective_channels(');
    expect(worker).toContain('probe_residual,q,method="3-point"');
    expect(worker).toContain('sparsity=colored_sparsity');
    expect(worker).toContain('"jacobianConstructionResidualEvaluations"');
    expect(worker).toContain('"optimizerTrialBaseResidualEvaluations"');
    expect(worker).toContain('"jacobianExactStateCacheHits"');
    expect(worker).toContain('"qualifiedLocalBranchBundleSha256"');
    expect(worker).toContain('OPTIMIZER_BASE_ITERATE_CAPTURE');
    expect(worker).toContain('ACCEPTED_REFERENCE_DIRECT_REEVALUATION');
    expect(worker).toContain('ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR');
    expect(worker).toContain('"acceptedContinuationHistory":history');
    expect(worker).toContain('"preSolveAcceptedStateAudit":pre_solve_audit');
    expect(worker).toContain('"componentBalanceAudit":component_balance_audit');
    expect(worker).toContain(
      'tr_options={"atol":1e-10,"btol":1e-10,',
    );
    expect(worker).toContain('"maxiter":4*(27*m),"regularize":True}');
    expect(worker).toContain('xtol=None,ftol=1e-11,gtol=1e-11');
    expect(worker).toContain('"lastAcceptedLambda":previous_lambda');
    expect(worker).toContain('"rejectedLambdaBracket":None if previous_lambda is None');
    expect(worker).toContain('"dominantResidualRows":coupled_dominant_rows');
    expect(worker).toContain('"dominantResidualBlocks":coupled_dominant_blocks');
    expect(worker).toContain('int(coupled_fit.nfev) if coupled_fit is not None');
    expect(worker).toContain('"actualResidualEvaluations":');
    expect(worker.match(
      /"actualResidualEvaluationScope":\s*"OPTIMIZER_BASE_PLUS_JACOBIAN_PROBES_ONLY"/g,
    )).toHaveLength(2);
    expect(worker).toContain('raise CoupledGateFeasible()');
  });

  it('executes zero-first targets, accepted brackets, and the full sparse dependency mask', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, numpy as np, scipy
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "coupled_lambda_targets",
  "coupled_bounded_bracket_next",
  "coupled_jacobian_sparsity",
  "coupled_solver_row_scale",
}
selected = [
  node for node in tree.body
  if isinstance(node, ast.FunctionDef) and node.name in names
]
namespace = {}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-continuation-contract", "exec"), namespace)
targets = namespace["coupled_lambda_targets"](1e-8)
first_refinement = namespace["coupled_bounded_bracket_next"](
  1e-8, 3e-8, 0, 3, 1e-10)
second_refinement = namespace["coupled_bounded_bracket_next"](
  first_refinement["lambda"], 3e-8, 1, 3, 1e-10)
third_refinement = namespace["coupled_bounded_bracket_next"](
  second_refinement["lambda"], 3e-8, 2, 3, 1e-10)
exhausted_refinement = namespace["coupled_bounded_bracket_next"](
  third_refinement["lambda"], 3e-8, 3, 3, 1e-10)
floor_refinement = namespace["coupled_bounded_bracket_next"](
  1e-10, 1.5e-10, 0, 3, 1e-10)
m = 7
mask = namespace["coupled_jacobian_sparsity"](scipy, m).toarray()
row_scale = namespace["coupled_solver_row_scale"](
  np, [4.8, 0.5, 1e-6],
).tolist()
expected = set()
for j in range(m):
  neighboring = {j}
  if j > 0:
    neighboring.add(j - 1)
  if j < m - 1:
    neighboring.add(j + 1)
  for row in range(14*j, 14*j+7):
    for k in neighboring:
      expected.update((row, col) for col in range(7*k, 7*k+7))
    expected.update((row, col) for col in range(7*m+7*j, 7*m+7*j+7))
    expected.update((row, col) for col in range(14*m+13*j, 14*m+13*j+13))
  for row in range(14*j+7, 14*j+14):
    for k in neighboring:
      expected.update((row, col) for col in range(7*m+7*k, 7*m+7*k+7))
    expected.update((row, col) for col in range(7*j, 7*j+7))
    expected.update((row, col) for col in range(14*m+13*j, 14*m+13*j+13))
  for row in range(14*m+13*j, 14*m+13*j+13):
    expected.update((row, col) for col in range(7*j, 7*j+7))
    expected.update((row, col) for col in range(7*m+7*j, 7*m+7*j+7))
    expected.update((row, col) for col in range(14*m+13*j, 14*m+13*j+13))
actual = set(zip(*mask.nonzero()))
print(json.dumps({
  "targets": targets,
  "firstRefinement": first_refinement,
  "secondRefinement": second_refinement,
  "thirdRefinement": third_refinement,
  "exhaustedRefinement": exhausted_refinement,
  "floorRefinement": floor_refinement,
  "shape": list(mask.shape),
  "maskExact": actual == expected,
  "nonzeroCount": len(actual),
  "rowScale": row_scale,
}))
`], { encoding: 'utf8' }));
    expect(observed.targets[0]).toBe(0);
    expect(observed.targets.slice(0, 6)).toEqual([
      0, 1e-10, 3e-10, 1e-9, 3e-9, 1e-8,
    ]);
    expect(observed.targets.slice(6, 10)).toEqual([
      3e-8, 1e-7, 3e-7, 1e-6,
    ]);
    expect(observed.targets.at(-1)).toBe(1);
    expect(observed.firstRefinement).toEqual({
      lambda: 2e-8, trial: 1,
    });
    expect(observed.secondRefinement.lambda).toBeCloseTo(2.5e-8, 20);
    expect(observed.secondRefinement.trial).toBe(2);
    expect(observed.thirdRefinement.lambda).toBeCloseTo(2.75e-8, 20);
    expect(observed.thirdRefinement.trial).toBe(3);
    expect(observed.exhaustedRefinement).toBeNull();
    expect(observed.floorRefinement).toBeNull();
    expect(observed.shape).toEqual([189, 189]);
    expect(observed.maskExact).toBe(true);
    expect(observed.nonzeroCount).toBeGreaterThan(0);
    expect(observed.rowScale).toEqual([1, 0.5, 1e-6]);
  }, 15_000);

  it('reuses safe colored Jacobians and deep-copies one hash-bound branch bundle', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, hashlib, json, numpy as np, scipy
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "native_json_scalar",
  "canonical",
  "coupled_evaluation_attribution",
  "coupled_evaluation_report",
  "coupled_objective_channels",
  "immutable_qualified_branch_bundle",
  "qualified_branch_bundle_for_start",
  "coupled_cached_numerical_jacobian",
}
selected = [
  node for node in tree.body
  if isinstance(node, ast.FunctionDef) and node.name in names
]
namespace = {
  "hashlib": hashlib, "json": json, "np": np, "scipy": scipy,
}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-efficiency-contract", "exec"), namespace)

qualified = [{
  "index": index,
  "flux": [float(index + component) for component in range(7)],
  "unknowns": [float(index - component) for component in range(13)],
  "evidence": {"numericalCell": index + 1, "nested": {"value": index}},
} for index in range(7)]
bundle = namespace["immutable_qualified_branch_bundle"](qualified)
first_start = namespace["qualified_branch_bundle_for_start"](bundle)
first_start[0]["unknowns"][0] = 999.0
first_start[0]["evidence"]["nested"]["value"] = 999
second_start = namespace["qualified_branch_bundle_for_start"](bundle)
tampered = dict(bundle)
tampered["canonicalJson"] += " "
tamper_rejected = False
try:
  namespace["qualified_branch_bundle_for_start"](tampered)
except RuntimeError:
  tamper_rejected = True

attribution = namespace["coupled_evaluation_attribution"]()
def evaluate(state, lam, observer):
  values = np.asarray(state) ** 2
  if observer is not None:
    observer(state, values)
  return values
base, probe = namespace["coupled_objective_channels"](
  evaluate, lambda state, values: None, 1e-8, attribution)
sparsity = scipy.sparse.csr_matrix(np.eye(3, dtype=int))
groups = scipy.optimize._numdiff.group_columns(sparsity)
attribution["jacobianColorGroupCount"] = int(groups.max() + 1)
colored = (sparsity, groups)
cache = {"lambda": None, "state": None, "matrix": None}
q = np.asarray([1.0, 2.0, 3.0])
lower = np.zeros(3)
upper = np.full(3, 10.0)
first = namespace["coupled_cached_numerical_jacobian"](
  np, scipy, probe, q, 1e-8, lower, upper, colored, attribution, cache)
expected = first.toarray().copy()
first.data[:] = 999.0
same_state = namespace["coupled_cached_numerical_jacobian"](
  np, scipy, probe, q, 1e-8, lower, upper, colored, attribution, cache)
new_lambda = namespace["coupled_cached_numerical_jacobian"](
  np, scipy, probe, q, 2e-8, lower, upper, colored, attribution, cache)
base(q)
report = namespace["coupled_evaluation_report"](attribution)

print(json.dumps({
  "branchCount": len(second_start),
  "bundleHashLength": len(bundle["sha256"]),
  "nestedMutationIsolated":
    second_start[0]["unknowns"][0] == 0.0
    and second_start[0]["evidence"]["nested"]["value"] == 0,
  "tamperRejected": tamper_rejected,
  "cacheCopyIntact": np.allclose(same_state.toarray(), expected),
  "newLambdaEquivalent": np.allclose(new_lambda.toarray(), expected),
  "derivativeCorrect": np.allclose(
    expected, np.diag([2.0, 4.0, 6.0]), atol=1e-8),
  "report": report,
}))
`], { encoding: 'utf8' }));
    expect(observed.branchCount).toBe(7);
    expect(observed.bundleHashLength).toBe(64);
    expect(observed.nestedMutationIsolated).toBe(true);
    expect(observed.tamperRejected).toBe(true);
    expect(observed.cacheCopyIntact).toBe(true);
    expect(observed.newLambdaEquivalent).toBe(true);
    expect(observed.derivativeCorrect).toBe(true);
    expect(observed.report).toMatchObject({
      optimizerTrialBaseResidualEvaluations: 1,
      jacobianRequests: 3,
      jacobianBuilds: 2,
      jacobianExactStateCacheHits: 1,
      jacobianColorGroupCount: 1,
    });
    expect(observed.report.jacobianConstructionResidualEvaluations)
      .toBeGreaterThan(0);
    expect(observed.report.totalModelResidualEvaluations).toBe(
      observed.report.optimizerTrialBaseResidualEvaluations
      + observed.report.jacobianConstructionResidualEvaluations,
    );
  }, 15_000);

  it('executes probe exclusion, independent gates, confirmation, and checkpoint revalidation contracts', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, hashlib, json, math, numpy as np
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "coupled_gate_decision",
  "coupled_evaluation_attribution",
  "coupled_evaluation_report",
  "coupled_objective_channels",
  "coupled_observe_base_candidate",
  "confirm_coupled_candidate",
  "find_resume_zero_anchor",
  "find_resume_coupled_anchor",
  "validate_coupled_warm_flows",
  "coupled_bound_proximity",
  "coupled_gauss_newton_candidate",
  "split_coupled_warm_state",
  "checkpoint_request_payload",
  "native_json_scalar",
  "canonical",
  "hashed",
  "digest",
}
selected = [
  node for node in tree.body
  if ((isinstance(node, ast.ClassDef) and node.name == "JobCBlocked")
      or (isinstance(node, ast.FunctionDef) and node.name in names))
]
namespace = {"np": np, "math": math, "hashlib": hashlib, "json": json}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-candidate-contract", "exec"), namespace)

def metrics(raw=1e-8, scaled=1e-8, interface=1e-8, minimum=1e-5):
  return {
    "rawFvResidualMolS": raw,
    "scaledFvResidual": scaled,
    "maximumOriginalJobBGateResidual": interface,
    "minimumFlowMolS": minimum,
    **namespace["coupled_gate_decision"](raw, scaled, interface, minimum),
  }

tracker = {
  "baseEvaluationCount": 0,
  "bestScore": math.inf,
  "bestState": None,
  "bestMetrics": None,
}
attribution = namespace["coupled_evaluation_attribution"]()
channel_calls = []
def evaluate(state, lam, observer):
  channel_calls.append("base" if observer is not None else "probe")
  if observer is not None:
    observer(state, None)
  return np.asarray(state)
def observer(state, unused):
  namespace["coupled_observe_base_candidate"](
    np, tracker, state, metrics())
base, probe = namespace["coupled_objective_channels"](
  evaluate, observer, 1e-8, attribution)
probe(np.asarray([9.0]))
base(np.asarray([3.0]))

gate_pass = namespace["coupled_gate_decision"](1e-8, 1e-8, 1e-8, 1e-5)
raw_fail = namespace["coupled_gate_decision"](2e-7, 1e-8, 1e-8, 1e-5)
scaled_fail = namespace["coupled_gate_decision"](1e-8, 2e-7, 1e-8, 1e-5)

responses = [metrics(), metrics(raw=2e-7)]
def one_failed_confirmation(state, lam):
  return responses.pop(0)
confirmation_rejected = namespace["confirm_coupled_candidate"](
  np, [1.0], 1e-8, one_failed_confirmation, lambda value: value,
  attribution)
responses = [metrics(), metrics()]
def both_pass_confirmation(state, lam):
  return responses.pop(0)
confirmation_accepted = namespace["confirm_coupled_candidate"](
  np, [1.0], 1e-8, both_pass_confirmation, lambda value: value,
  attribution)
evaluation_attribution = namespace["coupled_evaluation_report"](attribution)

checkpoint_state = [0.2] * 189
checkpoint = json.loads(json.dumps({"completedResults": [{
  "id": "coupled-anchor:2:lambda:0",
  "kind": "ACCEPTED_ZERO_TRANSFER_COUPLED_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 0.0, "state": checkpoint_state},
}]}))
restored = namespace["find_resume_zero_anchor"](
  checkpoint["completedResults"], 2.0)
checkpoint["completedResults"].append({
  "id": "coupled-anchor:2:lambda:1e-9",
  "kind": "ACCEPTED_COUPLED_CONTINUATION_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 1e-9, "state": [0.3] * 189,
    "stateSha256": namespace["digest"]([0.3] * 189),
    "continuationBracket": {"searchRootUpperLambda": 0.9,
      "upperRejectedLambda": 0.8, "refinementsUsed": 3},
    "bracketRefinementTrial": 3},
  "inputSha256": "request-digest",
})
checkpoint["completedResults"].append({
  "id": "coupled-rejection:2:root:3e-8:trial:1:lambda:2e-8",
  "kind": "REJECTED_COUPLED_CONTINUATION_TRIAL",
  "value": {"heightM": 2.0, "rejectedLambda": 2e-8,
    "lowerAcceptedLambda": 1e-9, "searchRootUpperLambda": 3e-8,
    "bracketRefinementTrial": 1, "stateSha256": "a" * 64,
    "gateMetrics": {
      **namespace["coupled_gate_decision"](2e-7, 1e-9, 1e-9, 1e-6),
      "rawFvResidualMolS": 2e-7,
      "scaledFvResidual": 1e-9,
      "maximumOriginalJobBGateResidual": 1e-9,
      "minimumFlowMolS": 1e-6,
    },
    "deterministicConfirmation": {
      "independentRawReevaluationCount": 2,
      "bothScientificGateEvaluationsPassed": False,
      "maximumMetricDifference": 0,
      "exactlyRepeatable": True,
    },
    "coupledAttempts": [{"accepted": False}]},
  "inputSha256": "request-digest",
})
checkpoint["completedResults"].append({
  "id": "coupled-rejection:2:malformed-no-evidence",
  "kind": "REJECTED_COUPLED_CONTINUATION_TRIAL",
  "value": {"heightM": 2.0, "rejectedLambda": 1.5e-8,
    "lowerAcceptedLambda": 1e-9, "searchRootUpperLambda": 3e-8,
    "bracketRefinementTrial": 2},
  "inputSha256": "request-digest",
})
checkpoint["completedResults"].append({
  "id": "coupled-anchor:2:lambda:3e-9:malformed",
  "kind": "ACCEPTED_COUPLED_CONTINUATION_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 3e-9, "state": [float("nan")] * 189,
    "stateSha256": "not-a-valid-state-hash"},
})
checkpoint["completedResults"].append({
  "id": "coupled-anchor:2:lambda:4e-9:overflow",
  "kind": "ACCEPTED_COUPLED_CONTINUATION_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 4e-9,
    "state": [10**1000] + [0.4] * 188,
    "stateSha256": "not-a-valid-state-hash"},
})
highest_anchor = namespace["find_resume_coupled_anchor"](
  checkpoint["completedResults"], 2.0,
  expected_request_sha256="request-digest")
mixed_entry_anchor = namespace["find_resume_coupled_anchor"](
  checkpoint["completedResults"] + [None, [], 7], 2.0,
  expected_request_sha256="request-digest")
conflicting_rejection = json.loads(json.dumps(
  checkpoint["completedResults"][2]))
conflicting_rejection["id"] = "coupled-rejection:2:conflicting-root"
conflicting_rejection["value"]["rejectedLambda"] = 2.5e-8
conflicting_rejection["value"]["searchRootUpperLambda"] = 4e-8
ambiguous_anchor = namespace["find_resume_coupled_anchor"](
  checkpoint["completedResults"] + [conflicting_rejection], 2.0,
  expected_request_sha256="request-digest")
stored_bad_state = [0.35] * 189
stored_bad_anchor = {
  "id": "coupled-anchor:2:lambda:2.5e-8:bad-counter",
  "kind": "ACCEPTED_COUPLED_CONTINUATION_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 2.5e-8,
    "state": stored_bad_state,
    "stateSha256": namespace["digest"](stored_bad_state),
    "continuationBracket": {"searchRootUpperLambda": 3e-8,
      "upperRejectedLambda": 2e-8, "refinementsUsed": 3},
    "bracketRefinementTrial": 1},
  "inputSha256": "request-digest",
}
inconsistent_stored_anchor = namespace["find_resume_coupled_anchor"](
  [checkpoint["completedResults"][2], stored_bad_anchor], 2.0,
  expected_request_sha256="request-digest")
midpoint_rejection = json.loads(json.dumps(
  checkpoint["completedResults"][2]))
midpoint_rejection["id"] = "coupled-rejection:2:root:3e-8:trial:0"
midpoint_rejection["value"]["lowerAcceptedLambda"] = 1e-8
midpoint_rejection["value"]["rejectedLambda"] = 3e-8
midpoint_rejection["value"]["searchRootUpperLambda"] = 3e-8
midpoint_rejection["value"]["bracketRefinementTrial"] = 0
midpoint_state = [0.4] * 189
midpoint_anchor = {
  "id": "coupled-anchor:2:lambda:2e-8",
  "kind": "ACCEPTED_COUPLED_CONTINUATION_ANCHOR",
  "value": {"heightM": 2.0, "lambda": 2e-8,
    "state": midpoint_state,
    "stateSha256": namespace["digest"](midpoint_state),
    "continuationBracket": {"searchRootUpperLambda": 3e-8,
      "upperRejectedLambda": 3e-8, "refinementsUsed": 1},
    "bracketRefinementTrial": 1},
  "inputSha256": "request-digest",
}
first_midpoint_resume = namespace["find_resume_coupled_anchor"](
  [midpoint_rejection, midpoint_anchor], 2.0,
  expected_request_sha256="request-digest")
revalidated_midpoint_anchor = json.loads(json.dumps(midpoint_anchor))
revalidated_midpoint_anchor["value"]["continuationBracket"] = (
  first_midpoint_resume["continuationBracket"])
revalidated_midpoint_anchor["value"]["bracketRefinementTrial"] = (
  first_midpoint_resume["bracketRefinementTrial"])
second_midpoint_resume = namespace["find_resume_coupled_anchor"](
  [midpoint_rejection, revalidated_midpoint_anchor], 2.0,
  expected_request_sha256="request-digest")
split_ok = namespace["split_coupled_warm_state"](np, restored, 7)
malformed = [0.2, 0.3]
malformed_rejected = False
try:
  namespace["split_coupled_warm_state"](np, malformed, 7)
except Exception as error:
  malformed_rejected = (
    getattr(error, "code", None) == "JOB_C_WARM_START_STATE_INVALID")
out_of_bounds_rejected = False
try:
  namespace["validate_coupled_warm_flows"](
    np, [0.0, 0.2], np.asarray([1e-12, 1e-12]),
    np.asarray([1.0, 1.0]), 1e-12, 2.0)
except Exception as error:
  out_of_bounds_rejected = (
    getattr(error, "code", None) == "JOB_C_WARM_START_FLOW_BOUNDS_INVALID")

proximity = namespace["coupled_bound_proximity"](
  np, np.asarray([5e-11, 0.5]), np.asarray([0.0, 0.0]),
  np.asarray([1.0, 1.0]), np.asarray([1.0, 1.0]))
full_correction = namespace["coupled_gauss_newton_candidate"](
  np, np.asarray([1.0, 1.0]), np.asarray([0.1, -0.1]),
  np.asarray([0.0, 0.0]), np.asarray([2.0, 2.0]))
damped_correction = namespace["coupled_gauss_newton_candidate"](
  np, np.asarray([1.0, 1.0]), np.asarray([-2.0, 0.5]),
  np.asarray([0.0, 0.0]), np.asarray([2.0, 2.0]))
checkpoint_payload = namespace["checkpoint_request_payload"]({
  "protocol": "transport", "operation": "SOLVE_HEIGHT",
  "resumeCheckpoint": {"old": True}, "temperatureK": 333.15,
})

print(json.dumps({
  "channelCalls": channel_calls,
  "capturedState": tracker["bestState"].tolist(),
  "baseEvaluationCount": tracker["baseEvaluationCount"],
  "evaluationAttribution": evaluation_attribution,
  "gatePass": gate_pass["accepted"],
  "rawFail": raw_fail["accepted"],
  "rawFailOnly": (not raw_fail["rawFvGatePassed"]
                  and raw_fail["scaledFvGatePassed"]),
  "scaledFail": scaled_fail["accepted"],
  "scaledFailOnly": (scaled_fail["rawFvGatePassed"]
                     and not scaled_fail["scaledFvGatePassed"]),
  "oneFailedConfirmationAccepted": confirmation_rejected["accepted"],
  "bothPassConfirmationAccepted": confirmation_accepted["accepted"],
  "checkpointRoundTrip": restored == checkpoint_state,
  "highestAnchorLambda": highest_anchor["lambda"],
  "highestAnchorStateFirst": highest_anchor["state"][0],
  "highestAnchorBracket": highest_anchor["continuationBracket"],
  "mixedEntryAnchorBracket": mixed_entry_anchor["continuationBracket"],
  "ambiguousAnchorBracket": ambiguous_anchor["continuationBracket"],
  "inconsistentStoredBracket":
    inconsistent_stored_anchor["continuationBracket"],
  "firstMidpointResumeBracket":
    first_midpoint_resume["continuationBracket"],
  "firstMidpointResumeTrial":
    first_midpoint_resume["bracketRefinementTrial"],
  "secondMidpointResumeBracket":
    second_midpoint_resume["continuationBracket"],
  "secondMidpointResumeTrial":
    second_midpoint_resume["bracketRefinementTrial"],
  "splitFlowLength": len(split_ok[0]),
  "splitInterfaceLength": len(split_ok[1]),
  "malformedRejected": malformed_rejected,
  "outOfBoundsRejected": out_of_bounds_rejected,
  "nearLowerDetected": bool(proximity["nearLower"][0]),
  "interiorNotNearBound": bool(
    not proximity["nearLower"][1] and not proximity["nearUpper"][1]),
  "fullCorrectionAdmitted": full_correction["admitted"],
  "fullCorrectionScale": full_correction["stepScale"],
  "fullCorrectionState": full_correction["state"].tolist(),
  "dampedCorrectionAdmitted": damped_correction["admitted"],
  "dampedCorrectionFullStepAdmissible":
    damped_correction["fullStepAdmissible"],
  "dampedCorrectionScale": damped_correction["stepScale"],
  "dampedCorrectionState": damped_correction["state"].tolist(),
  "checkpointPayload": checkpoint_payload,
  "checkpointPayloadSha256": namespace["digest"](checkpoint_payload),
  "numpyBooleanDigestNormalized": (
    namespace["digest"]({"flag": np.bool_(True)})
      == namespace["digest"]({"flag": True})),
  "numpyBooleanJsonNormalized": (
    namespace["canonical"]({"flag": np.bool_(True)}) == '{"flag":true}'),
}))
`], { encoding: 'utf8' }));
    expect(observed.channelCalls).toEqual(['probe', 'base']);
    expect(observed.capturedState).toEqual([3]);
    expect(observed.baseEvaluationCount).toBe(1);
    expect(observed.evaluationAttribution).toMatchObject({
      optimizerTrialBaseResidualEvaluations: 1,
      jacobianConstructionResidualEvaluations: 1,
      confirmationResidualEvaluations: 4,
      optimizerModelResidualEvaluationsIncludingJacobianConstruction: 2,
      totalModelResidualEvaluations: 6,
    });
    expect(observed.gatePass).toBe(true);
    expect(observed.rawFail).toBe(false);
    expect(observed.rawFailOnly).toBe(true);
    expect(observed.scaledFail).toBe(false);
    expect(observed.scaledFailOnly).toBe(true);
    expect(observed.oneFailedConfirmationAccepted).toBe(false);
    expect(observed.bothPassConfirmationAccepted).toBe(true);
    expect(observed.checkpointRoundTrip).toBe(true);
    expect(observed.highestAnchorLambda).toBe(1e-9);
    expect(observed.highestAnchorStateFirst).toBe(0.3);
    expect(observed.highestAnchorBracket).toEqual({
      searchRootUpperLambda: 3e-8,
      upperRejectedLambda: 2e-8,
      refinementsUsed: 1,
    });
    expect(observed.mixedEntryAnchorBracket).toEqual(
      observed.highestAnchorBracket,
    );
    expect(observed.ambiguousAnchorBracket).toBeNull();
    expect(observed.inconsistentStoredBracket).toBeNull();
    expect(observed.firstMidpointResumeBracket).toEqual({
      searchRootUpperLambda: 3e-8,
      upperRejectedLambda: 3e-8,
      refinementsUsed: 1,
    });
    expect(observed.firstMidpointResumeTrial).toBe(1);
    expect(observed.secondMidpointResumeBracket).toEqual(
      observed.firstMidpointResumeBracket,
    );
    expect(observed.secondMidpointResumeTrial).toBe(1);
    expect(observed.splitFlowLength).toBe(98);
    expect(observed.splitInterfaceLength).toBe(91);
    expect(observed.malformedRejected).toBe(true);
    expect(observed.outOfBoundsRejected).toBe(true);
    expect(observed.nearLowerDetected).toBe(true);
    expect(observed.interiorNotNearBound).toBe(true);
    expect(observed.fullCorrectionAdmitted).toBe(true);
    expect(observed.fullCorrectionScale).toBe(1);
    expect(observed.fullCorrectionState).toEqual([1.1, 0.9]);
    expect(observed.dampedCorrectionAdmitted).toBe(true);
    expect(observed.dampedCorrectionFullStepAdmissible).toBe(false);
    expect(observed.dampedCorrectionScale).toBeCloseTo(0.475, 12);
    expect(observed.dampedCorrectionState[0]).toBeCloseTo(0.05, 12);
    expect(observed.dampedCorrectionState[1]).toBeCloseTo(1.2375, 12);
    expect(observed.checkpointPayload).toEqual({ temperatureK: 333.15 });
    expect(observed.checkpointPayloadSha256)
      .toBe(jobCResultHash(jobCCheckpointRequestPayload({
        protocol: 'transport',
        operation: 'SOLVE_HEIGHT',
        resumeCheckpoint: { old: true },
        temperatureK: 333.15,
      })));
    expect(observed.numpyBooleanDigestNormalized).toBe(true);
    expect(observed.numpyBooleanJsonNormalized).toBe(true);
  }, 15_000);

  it('executes the conservative seed and coupled warm-state contracts', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, numpy as np
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
selected = [
  node for node in tree.body
  if ((isinstance(node, ast.ClassDef) and node.name == "JobCBlocked")
      or (isinstance(node, ast.FunctionDef) and node.name in {
        "globally_conservative_interior_seed", "split_coupled_warm_state"
      }))
]
namespace = {
  "COMPONENTS": ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"),
  "np": np,
}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-seed-contract", "exec"), namespace)
feedc = np.asarray([0, 0, 0, 0, 0, 4.846724298541135, 0.4061367165354447])
feedd = np.asarray([
  4.868190306515299, 0.5681555559253281, 0.27442347433402103,
  0.0964699788831831, 0.04810668945981338, 0, 0,
])
cells = 7
epsilon = (float(np.sum(feedc) + np.sum(feedd))) * 1e-13
flows, transfer = namespace["globally_conservative_interior_seed"](
  np, feedc, feedd, cells, 1e-8, epsilon)
c, d = flows.reshape(2, cells, 7)
interfaces = np.linspace(-1.0, 1.0, 13 * cells)
warm = np.r_[flows, interfaces]
warm_flows, warm_interfaces = namespace["split_coupled_warm_state"](
  np, warm, cells)
invalid_code = None
try:
  namespace["split_coupled_warm_state"](np, warm[:-1], cells)
except namespace["JobCBlocked"] as error:
  invalid_code = error.code
print(json.dumps({
  "unknownCount": int(warm.size),
  "flowCount": int(warm_flows.size),
  "interfaceCount": int(warm_interfaces.size),
  "warmFlowsUnchanged": bool(np.array_equal(warm_flows, flows)),
  "warmInterfacesUnchanged": bool(np.array_equal(warm_interfaces, interfaces)),
  "minimumFlowMolS": float(np.min(flows)),
  "epsilonMolS": float(epsilon),
  "globalClosure": (c[-1] + d[0] - feedc - feedd).tolist(),
  "continuousOutlet": c[-1].tolist(),
  "dispersedOutlet": d[0].tolist(),
  "perCellTransfer": transfer.tolist(),
  "invalidCode": invalid_code,
}))
`], { encoding: 'utf8' }));
    expect(observed).toMatchObject({
      unknownCount: 189,
      flowCount: 98,
      interfaceCount: 91,
      warmFlowsUnchanged: true,
      warmInterfacesUnchanged: true,
      invalidCode: 'JOB_C_WARM_START_STATE_INVALID',
    });
    expect(observed.minimumFlowMolS).toBeGreaterThan(observed.epsilonMolS);
    expect(Math.max(...observed.globalClosure.map(Math.abs))).toBeLessThan(1e-14);
    expect(observed.perCellTransfer).toHaveLength(7);
    expect(observed.perCellTransfer.every(
      (row: number[]) => row.length === 7 && row.every(Number.isFinite),
    )).toBe(true);
  });

  it('replays lambda one with the unchanged strict-positive bounds', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const replay = worker.indexOf('progress("lambda 1 monolithic replay")');
    const result = worker.indexOf('lambda1MonolithicReplay', replay);
    expect(replay).toBeGreaterThan(-1);
    expect(worker.indexOf('bounds=(lower,upper)', replay)).toBeGreaterThan(replay);
    expect(worker.indexOf('bounds=(lower,upper)', replay)).toBeLessThan(result);
    expect(worker.slice(replay, result)).not.toContain('[:14*m]=0.0');
    expect(worker).toContain('COUPLED_BOUNDED_SPARSE_189_LAMBDA_ONE_REPLAY');
    expect(worker).not.toContain('LIMITED_189_EQUATION_POLISH_AFTER_PICARD');
  });
});