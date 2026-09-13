import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  JOB_C_COMPONENT_ORDER,
  JOB_C_PRELIMINARY_SENSITIVITY_BASIS,
  JOB_C_TEMPORARY_DIAGNOSTIC_MODE,
  jobCResultHash,
  jobCScientificResultHash,
  runJobCWorker,
} from '../server/ecr-pre-pilot/job-c';
import {
  jobCCheckpointRequestPayload,
  validateJobCCheckpoint,
  validateJobCWorkerResponseStatus,
} from '../server/ecr-pre-pilot/job-c-job-service';

const diagnosticReplayScript = 'scripts/replay-job-c-rejection.py';

it('retains the original worker failure while rejecting invalid response statuses', () => {
  const workerResult = {
    status: 'FAILURE_INVALID_REQUEST',
    error: 'setting an array element with a sequence.',
    resultSha256: 'immutable-worker-evidence',
  };
  try {
    validateJobCWorkerResponseStatus({ status: workerResult.status, workerResult });
    throw new Error('Expected invalid status to be rejected');
  } catch (error: any) {
    expect(error.message).toBe('JOB_C_WORKER_RESPONSE_STATUS_INVALID');
    expect(error.details.workerStatus).toBe('FAILURE_INVALID_REQUEST');
    expect(error.details.workerResult).toBe(workerResult);
    expect(error.details.workerResult.error).toBe(workerResult.error);
  }
  for (const status of ['BLOCKED_PRELIMINARY_JOB_C', 'CALCULATED_PRELIMINARY_JOB_C']) {
    expect(() => validateJobCWorkerResponseStatus({ status })).not.toThrow();
  }
  expect(() => validateJobCWorkerResponseStatus({
    status: 'CALCULATED_DIAGNOSTIC_PARTIAL_JOB_C',
  })).not.toThrow();
});

const diagnosticReplayFiles = [
  'server/ecr-pre-pilot/job-c/worker.py',
  'server/ecr-pre-pilot/job-c/candidate_interface.py',
  'server/ecr-pre-pilot/job-c/boundary_interface_qualifier.py',
  'server/ecr-pre-pilot/job-c/branch_continuation.py',
] as const;

function diagnosticHashValue(value: any): any {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('NON_FINITE_DIAGNOSTIC_FIXTURE');
    const [mantissa, exponent] = value.toExponential(16).toLowerCase().split('e');
    return { $number: `${mantissa}e${Number(exponent)}` };
  }
  if (Array.isArray(value)) return value.map(diagnosticHashValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key, diagnosticHashValue(child),
    ]));
  }
  return value;
}

function diagnosticHash(value: any): string {
  const canonical = (child: any): string => Array.isArray(child)
    ? `[${child.map(canonical).join(',')}]`
    : child && typeof child === 'object'
      ? `{${Object.entries(child).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
      : JSON.stringify(child);
  return createHash('sha256').update(canonical(diagnosticHashValue(value))).digest('hex');
}

function writeDiagnosticReplayFixture(root: string) {
  const state = Array.from({ length: 189 }, () => 0.1);
  const residual = Array.from({ length: 189 }, () => 0.2);
  const jacobian = Array.from({ length: 189 }, (_, row) =>
    Array.from({ length: 189 }, (_, column) => row === column ? 1 : 0));
  const lowerBounds = Array.from({ length: 189 }, () => -1);
  const upperBounds = Array.from({ length: 189 }, () => 1);
  const variableScale = Array.from({ length: 189 }, () => 1);
  const activeMask = Array.from({ length: 189 }, () => 0);
  const diagnosticBody = {
    state, residual, jacobian, lowerBounds, upperBounds, variableScale, activeMask,
    stateSha256: diagnosticHash(state),
    residualSha256: diagnosticHash(residual),
    jacobianSha256: diagnosticHash(jacobian),
  };
  const diagnosticLinearization = {
    ...diagnosticBody,
    payloadSha256: diagnosticHash(diagnosticBody),
  };
  const nestedAudit = {
    stateSha256: diagnosticLinearization.stateSha256,
    diagnosticLinearization,
  };
  const rootAudit = {
    stateSha256: diagnosticLinearization.stateSha256,
    diagnosticLinearization,
    rankAwareCorrectionSequence: {
      linearizations: [{
        correctionIndex: 1,
        startingStateSha256: diagnosticLinearization.stateSha256,
        jacobianAudit: nestedAudit,
      }],
    },
  };
  const coupledAttempts = [{ accepted: false, jacobianAudit: rootAudit }];
  const captureBody = {
    schemaVersion: 'ECR_JOB_C_REJECTED_DIAGNOSTIC_V1',
    diagnosticOnly: true,
    requestSha256: diagnosticHash({ temperatureK: 333.15 }),
    workerFilesSha256: Object.fromEntries(
      diagnosticReplayFiles.map(relative => [
        relative,
        '',
      ]),
    ),
    selectedStateSha256: diagnosticHash(state),
    coupledAttemptsSha256: diagnosticHash(coupledAttempts),
  };
  for (const relative of diagnosticReplayFiles) {
    const destination = join(root, relative);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(relative));
    captureBody.workerFilesSha256[relative] = createHash('sha256')
      .update(readFileSync(destination)).digest('hex');
  }
  const request = {
    protocol: 'ECR_PRE_PILOT_JOB_C_V1',
    operation: 'SOLVE_HEIGHT',
    temperatureK: 333.15,
  };
  const checkpointPath = join(root, 'checkpoint.json');
  const requestPath = join(root, 'request.json');
  const evidence = {
    heightM: 2,
    rejectedLambda: 0.2,
    state,
    stateSha256: diagnosticHash(state),
    diagnosticCapture: { ...captureBody, captureSha256: diagnosticHash(captureBody) },
    coupledAttempts,
  };
  const checkpoint = {
    schemaVersion: 'ECR_JOB_C_PARTIAL_V1',
    complete: false,
    requestSha256: captureBody.requestSha256,
    progress: { phase: 'synthetic rejected checkpoint', completed: 1 },
    completedResults: [{
      id: 'rejected-synthetic-1',
      kind: 'REJECTED_COUPLED_CONTINUATION_TRIAL',
      value: evidence,
      inputSha256: captureBody.requestSha256,
    }],
  };
  writeFileSync(requestPath, JSON.stringify(request));
  writeFileSync(checkpointPath, JSON.stringify(checkpoint));
  return {
    checkpointPath, requestPath, runtimeRoot: root, checkpoint, evidence,
  };
}

describe('ECR pre-pilot Job C governed numerical basis', () => {
  it('shows the four governing gates and keeps L2 diagnostic-only in Stage 4', () => {
    const page = readFileSync(
      'client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx',
      'utf8',
    );
    expect(page).toContain('Governing Job C gates');
    expect(page).toContain('Maximum raw FV residual');
    expect(page).toContain('Scaled FV residual');
    expect(page).toContain('Original Job B interface residual');
    expect(page).toContain('Strict positivity');
    expect(page).toContain('Current limiting gate');
    expect(page).toContain('Accepted/rejected λ bracket');
    expect(page).toContain('L2 diagnostic (not an acceptance gate)');
    expect(page).toContain('does not establish physical infeasibility');
  });

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

  it('pins the server-owned partial-transfer diagnostic without changing the standard lambda-one route', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    const service = readFileSync('server/ecr-pre-pilot-service.ts', 'utf8');
    const queue = readFileSync('server/ecr-pre-pilot/job-c-job-service.ts', 'utf8');
    const route = readFileSync('server/ecr-pre-pilot/routes.ts', 'utf8');
    const page = readFileSync(
      'client/src/pages/design-software/ecr-pre-pilot-design-stage-4-page.tsx', 'utf8',
    );
    expect(JOB_C_TEMPORARY_DIAGNOSTIC_MODE).toEqual({
      mode: 'TEMPORARY_PARTIAL_TRANSFER_DIAGNOSTIC_ONLY_V1',
      terminalLambda: 6.5e-9,
      heightTrialM: 2,
      normalAcceptancePermitted: false,
      qualification: 'USER_AUTHORIZED_TEMPORARY_DIAGNOSTIC_ONLY',
    });
    expect(worker).toContain('bootstrap_lambda,diagnostic_terminal_lambda');
    expect(worker).toContain('clear_gate_metrics=partial_diagnostic');
    expect(worker).toContain('FOUR_UNCHANGED_GATES_AND_TWO_UNCACHED_REPEAT_CONFIRMATIONS');
    expect(worker).toContain('progress("lambda 1 monolithic replay")');
    expect(worker).toContain('JOB_C_DIAGNOSTIC_MODE_INVALID');
    expect(service).toContain('BLOCKED_PARTIAL_TRANSFER_ENDPOINT_NEVER_ACCEPTED_DESIGN');
    expect(service).toContain('criterionSatisfyingDiagnosticHeight: false');
    expect(queue).toContain('options.diagnosticOnly');
    expect(queue).toContain('scientificCompleted: !diagnosticOnly');
    expect(route).toContain('diagnosticOnly: true');
    expect(route).toContain("'/api/ecr-pre-pilot/designs/:id/job-c/diagnostic/jobs'");
    expect(route).toContain("'/api/ecr-pre-pilot/designs/:id/job-c/jobs'");
    expect(page).toContain('Provisional downstream diagnostic only');
    expect(page).toContain('partial-transfer endpoint');
    expect(page).toContain('not optimized');
  });

  it('caps the diagnostic schedule before lambda one and returns before its replay', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json
from pathlib import Path
source=Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree=ast.parse(source)
targets=next(node for node in tree.body
  if isinstance(node,ast.FunctionDef) and node.name=="coupled_lambda_targets")
namespace={}
exec(compile(ast.Module(body=[targets],type_ignores=[]),"diagnostic-targets","exec"),namespace)
case=next(node for node in tree.body
  if isinstance(node,ast.FunctionDef) and node.name=="case")
case_source=ast.get_source_segment(source,case)
guard='PARTIAL_TRANSFER_ONLY_FOUR_GATES_AND_UNCACHED_REPEAT_CONFIRMED'
replay='progress("lambda 1 monolithic replay")'
unavailable='JOB_C_DIAGNOSTIC_PARTIAL_ENDPOINT_UNQUALIFIED'
print(json.dumps({
  "targets":namespace["coupled_lambda_targets"](1e-8,6.5e-9),
  "guardBeforeReplay":case_source.index(guard)<case_source.index(replay),
  "guardRaisesDiagnosticReason":unavailable in case_source,
  "normalStillIncludesOne":1.0 in namespace["coupled_lambda_targets"](1e-8),
  "diagnosticGateConfirmation":all(token in case_source for token in [
    "independentRawReevaluationCount", "bothScientificGateEvaluationsPassed",
    "exactlyRepeatable", "rawFvGatePassed", "scaledFvGatePassed",
    "originalJobBGatePassed", "strictPositivityPassed"]),
}))
`], { encoding: 'utf8' }));
    expect(observed.targets[observed.targets.length - 1]).toBe(6.5e-9);
    expect(Math.max(...observed.targets)).toBe(6.5e-9);
    expect(observed.guardBeforeReplay).toBe(true);
    expect(observed.guardRaisesDiagnosticReason).toBe(true);
    expect(observed.normalStillIncludesOne).toBe(true);
    expect(observed.diagnosticGateConfirmation).toBe(true);

    const service = readFileSync('server/ecr-pre-pilot-service.ts', 'utf8');
    const unavailable = service.slice(service.indexOf("status: 'UNAVAILABLE_ENDPOINT_NOT_QUALIFIED'"));
    expect(unavailable.slice(0, unavailable.indexOf(': undefined;'))).not.toContain('fields:');
  });

  it('produces deterministic hashes and excludes its own result field', () => {
    const body = { status: 'CALCULATED_PRELIMINARY_JOB_C', value: 2.0 };
    const hash = jobCResultHash(body);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(jobCResultHash({ ...body, resultSha256: 'ignored' })).toBe(hash);
    expect(jobCResultHash({ ...body, value: 2.1 })).not.toBe(hash);
    const profiled = {
      ...body,
      runtimeDiagnostics: { attemptWallSeconds: 1.2 },
    };
    expect(jobCScientificResultHash(profiled)).toBe(
      jobCScientificResultHash({
        ...profiled,
        runtimeDiagnostics: { attemptWallSeconds: 99.9 },
      }),
    );
    expect(jobCScientificResultHash({ ...profiled, value: 2.1 }))
      .not.toBe(jobCScientificResultHash(profiled));
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
      'response.resultSha256 !== jobCScientificResultHash(response)',
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
    expect(queue).toContain(
      'jobCScientificResultHash(reusableRow.result_snapshot)',
    );
    expect(queue).toContain(
      'result, jobCScientificResultHash(result)',
    );
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
    expect(worker).toContain('BOUND_AWARE_BVLS_TRUE_RESIDUAL_CORRECTED_STATE');
    expect(worker).toContain('coupled_bounded_bvls_direction(');
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
      'np,coupled_fit.x,lam,exact_raw_evaluate,gate_metrics,',
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
    expect(worker).toContain('"localInterfaceEquationCacheHits"');
    expect(worker).toContain('"localInterfaceEquationCacheMisses"');
    expect(worker).toContain('use_equation_cache=False');
    expect(worker).toContain('ev=exact_raw_evaluate(x,1.0)');
    expect(worker).toContain('"wallClockAttribution"');
    expect(worker).toContain('"exclusivePhaseWallFractions"');
    expect(worker).toContain('"localInterfaceThermodynamics"');
    expect(worker).toContain('"sparseSolveAndGlobalization"');
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
import ast, hashlib, json, math, numpy as np, scipy
import time
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "native_json_scalar",
  "canonical",
  "coupled_evaluation_attribution",
  "coupled_evaluation_report",
  "coupled_wall_clock_report",
  "coupled_objective_channels",
  "immutable_qualified_branch_bundle",
  "qualified_branch_bundle_for_start",
  "coupled_cached_numerical_jacobian",
  "coupled_cached_local_equations",
}
selected = [
  node for node in tree.body
  if isinstance(node, ast.FunctionDef) and node.name in names
]
namespace = {
  "hashlib": hashlib, "json": json, "math": math, "np": np,
  "scipy": scipy, "time": time,
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
class LocalSolver:
  def __init__(self):
    self.calls = 0
  def equations(self, u, xc, xd):
    self.calls += 1
    return (
      np.r_[u[:6], xc[0]],
      xc.copy(), xd.copy(), float(u[-1]),
      np.arange(7, dtype=float) + xc,
      np.arange(7, dtype=float) + xd,
      xc - xd,
    )
local_solver = LocalSolver()
local_cache = {}
local_attribution = namespace["coupled_evaluation_attribution"]()
local_u = np.linspace(-1.0, 1.0, 13)
local_xc = np.asarray([.1, .2, .1, .1, .1, .3, .1])
local_xd = np.asarray([.2, .1, .1, .1, .1, .3, .1])
local_first = namespace["coupled_cached_local_equations"](
  np, local_solver, local_cache, local_u, local_xc, local_xd,
  local_attribution)
local_second = namespace["coupled_cached_local_equations"](
  np, local_solver, local_cache, local_u.copy(), local_xc.copy(),
  local_xd.copy(), local_attribution)
local_changed = local_u.copy()
local_changed[0] = np.nextafter(local_changed[0], np.inf)
namespace["coupled_cached_local_equations"](
  np, local_solver, local_cache, local_changed, local_xc, local_xd,
  local_attribution)
local_solver.equations(local_u, local_xc, local_xd)
local_mutation_rejected = False
try:
  local_first[0][0] = 99.0
except ValueError:
  local_mutation_rejected = True
report = namespace["coupled_evaluation_report"](attribution)
attribution.update({
  "preSolveDiagnosticWallSeconds": 1.0,
  "optimizerTrialBaseWallSeconds": 2.0,
  "jacobianProbeWallSeconds": 3.0,
  "jacobianBuildWallSeconds": 5.0,
  "optimizerWallSeconds": 9.0,
  "exactGateReevaluationWallSeconds": 1.0,
  "fvResidualAssemblyWallSeconds": 2.5,
  "localInterfaceThermodynamicsWallSeconds": 4.5,
})
wall_clock = namespace["coupled_wall_clock_report"](attribution, 12.0)
zero_clock = namespace["coupled_wall_clock_report"](
  namespace["coupled_evaluation_attribution"](), 0.0)
invalid_attribution = namespace["coupled_evaluation_attribution"]()
invalid_attribution["optimizerWallSeconds"] = float("nan")
invalid_clock = namespace["coupled_wall_clock_report"](
  invalid_attribution, 1.0)
inconsistent_attribution = namespace["coupled_evaluation_attribution"]()
inconsistent_attribution.update({
  "optimizerTrialBaseWallSeconds": 2.0,
  "optimizerWallSeconds": 1.0,
})
inconsistent_clock = namespace["coupled_wall_clock_report"](
  inconsistent_attribution, 2.0)

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
  "localEquationCalls": local_solver.calls,
  "localCacheHits": local_attribution["localInterfaceEquationCacheHits"],
  "localCacheMisses": local_attribution["localInterfaceEquationCacheMisses"],
  "localCacheExactValues": all(
    np.array_equal(a, b) if isinstance(a, np.ndarray) else a == b
    for a, b in zip(local_first, local_second)),
  "localCacheMutationRejected": local_mutation_rejected,
  "report": report,
  "wallClock": wall_clock,
  "zeroClock": zero_clock,
  "invalidClock": invalid_clock,
  "inconsistentClock": inconsistent_clock,
}))
`], { encoding: 'utf8' }));
    expect(observed.branchCount).toBe(7);
    expect(observed.bundleHashLength).toBe(64);
    expect(observed.nestedMutationIsolated).toBe(true);
    expect(observed.tamperRejected).toBe(true);
    expect(observed.cacheCopyIntact).toBe(true);
    expect(observed.newLambdaEquivalent).toBe(true);
    expect(observed.derivativeCorrect).toBe(true);
    expect(observed.localEquationCalls).toBe(3);
    expect(observed.localCacheHits).toBe(1);
    expect(observed.localCacheMisses).toBe(2);
    expect(observed.localCacheExactValues).toBe(true);
    expect(observed.localCacheMutationRejected).toBe(true);
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
    expect(observed.wallClock.exclusivePhaseWallSeconds).toEqual({
      preSolveDiagnostics: 1,
      optimizerTrialBaseEvaluations: 2,
      jacobianProbes: 3,
      jacobianConstructionOverhead: 2,
      sparseSolveAndGlobalization: 2,
      exactGateReevaluations: 1,
      unclassifiedOverhead: 1,
    });
    expect(Object.values(
      observed.wallClock.exclusivePhaseWallFractions,
    ).reduce((sum: number, value) => sum + Number(value), 0)).toBeCloseTo(1);
    expect(observed.wallClock.kernelWallSeconds).toEqual({
      fvResidualAssembly: 2.5,
      localInterfaceThermodynamics: 4.5,
    });
    expect(observed.wallClock.status).toBe('PROFILED');
    expect(observed.zeroClock).toMatchObject({
      status: 'PROFILED',
      attemptWallSeconds: 0,
      exclusivePhaseWallFractions: {
        preSolveDiagnostics: 0,
        optimizerTrialBaseEvaluations: 0,
        jacobianProbes: 0,
        jacobianConstructionOverhead: 0,
        sparseSolveAndGlobalization: 0,
        exactGateReevaluations: 0,
        unclassifiedOverhead: 0,
      },
    });
    expect(observed.invalidClock).toMatchObject({
      status: 'INVALID_TIMING_INPUT',
      exclusivePhaseWallFractions: null,
    });
    expect(observed.inconsistentClock).toMatchObject({
      status: 'INCONSISTENT_TIMING_TOTALS',
      exclusivePhaseWallFractions: null,
    });
  }, 15_000);

  it('executes probe exclusion, independent gates, confirmation, and checkpoint revalidation contracts', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, hashlib, json, math, numpy as np, time
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
namespace = {
  "np": np, "math": math, "hashlib": hashlib, "json": json, "time": time,
}
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

  it('uses deterministic rank-revealing equilibration without changing gates', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, math, numpy as np
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "coupled_gate_decision",
  "coupled_gate_score",
  "coupled_finite_norm",
  "coupled_residual_subspace_projection",
  "coupled_dominant_raw_fv_subspace_rows",
  "coupled_equilibrated_minimum_norm_correction",
}
selected = [
  node for node in tree.body
  if isinstance(node, ast.FunctionDef) and node.name in names
]
namespace = {"np": np, "math": math}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-rank-aware-contract", "exec"), namespace)

jac = np.diag([1e12, 1e-12, 0.0])
residual = np.asarray([1e12, -1e-12, 1.0])
correction, audit = namespace[
  "coupled_equilibrated_minimum_norm_correction"](
    np, jac, residual, np.ones(3), sweeps=4)
repeat, repeat_audit = namespace[
  "coupled_equilibrated_minimum_norm_correction"](
    np, jac.copy(), residual.copy(), np.ones(3), sweeps=4)
predicted = residual + jac @ correction
subspace = audit["linearizedResidualSubspace"]
original_projection = subspace["originalEuclidean"]
weighted_projection = subspace["equilibratedWeighted"]
dominant = namespace["coupled_dominant_raw_fv_subspace_rows"](
  np, original_projection, weighted_projection, audit["rowScale"],
  np.ones(7), ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"],
  0, maximum_rows=20)
fv_residual = np.zeros(28)
fv_residual[26] = -4.0
fv_projection = {
  "residual": fv_residual.tolist(),
  "columnSpaceRemovable": (fv_residual * 0.75).tolist(),
  "leftNullSpaceUnresolved": (fv_residual * 0.25).tolist(),
}
fv_weighted = {
  "residual": (fv_residual * 2.0).tolist(),
  "columnSpaceRemovable": (fv_residual * 1.5).tolist(),
  "leftNullSpaceUnresolved": (fv_residual * 0.5).tolist(),
}
dominant_fv = namespace["coupled_dominant_raw_fv_subspace_rows"](
  np, fv_projection, fv_weighted, np.full(28, 2.0),
  np.asarray([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0]),
  ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"],
  2, maximum_rows=1)
real_svd = np.linalg.svd
svd_calls = {"count": 0}
def projection_failure_svd(*args, **kwargs):
  svd_calls["count"] += 1
  if svd_calls["count"] == 3:
    raise np.linalg.LinAlgError("diagnostic only")
  return real_svd(*args, **kwargs)
np.linalg.svd = projection_failure_svd
try:
  available_correction, unavailable_audit = namespace[
    "coupled_equilibrated_minimum_norm_correction"](
      np, np.eye(2), np.asarray([1.0, -2.0]), np.ones(2), sweeps=4)
finally:
  np.linalg.svd = real_svd
real_projection = namespace["coupled_residual_subspace_projection"]
def weighted_projection_failure(*args, **kwargs):
  raise FloatingPointError("diagnostic only")
namespace["coupled_residual_subspace_projection"] = weighted_projection_failure
try:
  weighted_failure_correction, weighted_failure_audit = namespace[
    "coupled_equilibrated_minimum_norm_correction"](
      np, np.eye(2), np.asarray([1.0, -2.0]), np.ones(2), sweeps=4)
finally:
  namespace["coupled_residual_subspace_projection"] = real_projection
extreme_correction, extreme_audit = namespace[
  "coupled_equilibrated_minimum_norm_correction"](
    np, np.eye(2) * 1e150, np.asarray([1e155, -1e155]),
    np.ones(2), sweeps=4)
strict_extreme_json = json.dumps(extreme_audit, allow_nan=False)
passing = {
  "rawFvResidualMolS": 1e-8,
  "scaledFvResidual": 2e-8,
  "maximumOriginalJobBGateResidual": 3e-8,
  "minimumFlowMolS": 1e-5,
  **namespace["coupled_gate_decision"](1e-8, 2e-8, 3e-8, 1e-5),
}
raw_failing = {
  "rawFvResidualMolS": 1.01e-7,
  "scaledFvResidual": 2e-8,
  "maximumOriginalJobBGateResidual": 3e-8,
  "minimumFlowMolS": 1e-5,
  **namespace["coupled_gate_decision"](1.01e-7, 2e-8, 3e-8, 1e-5),
}
invalid, invalid_audit = namespace[
  "coupled_equilibrated_minimum_norm_correction"](
    np, jac, residual, np.asarray([1.0, 0.0, 1.0]), sweeps=4)
print(json.dumps({
  "correction": correction.tolist(),
  "predicted": predicted.tolist(),
  "audit": audit,
  "originalReconstruction": max(abs(
    np.asarray(original_projection["residual"])
    - np.asarray(original_projection["columnSpaceRemovable"])
    - np.asarray(original_projection["leftNullSpaceUnresolved"]))),
  "weightedReconstruction": max(abs(
    np.asarray(weighted_projection["residual"])
    - np.asarray(weighted_projection["columnSpaceRemovable"])
    - np.asarray(weighted_projection["leftNullSpaceUnresolved"]))),
  "originalUnresolved": original_projection[
    "leftNullSpaceUnresolved"],
  "weightedUnresolved": weighted_projection[
    "leftNullSpaceUnresolved"],
  "dominantNoCells": dominant,
  "dominantFv": dominant_fv,
  "diagnosticFailureCorrection": available_correction.tolist(),
  "diagnosticFailureStatus":
    unavailable_audit["linearizedResidualSubspace"]["status"],
  "weightedFailureCorrection": weighted_failure_correction.tolist(),
  "weightedFailureStatus":
    weighted_failure_audit["linearizedResidualSubspace"]["status"],
  "extremeCorrectionFinite": bool(np.all(np.isfinite(extreme_correction))),
  "extremeStrictJson": bool(strict_extreme_json),
  "repeatExact": bool(np.array_equal(correction, repeat)),
  "repeatAuditExact": audit == repeat_audit,
  "passingScore": namespace["coupled_gate_score"](passing),
  "rawFailingScore": namespace["coupled_gate_score"](raw_failing),
  "invalidCorrection": invalid,
  "invalidStatus": invalid_audit["status"],
}))
`], { encoding: 'utf8' }));
    expect(observed.correction[0]).toBeCloseTo(-1, 12);
    expect(observed.correction[1]).toBeCloseTo(1, 12);
    expect(observed.correction[2]).toBe(0);
    expect(observed.predicted[0]).toBeCloseTo(0, 12);
    expect(observed.predicted[1]).toBeCloseTo(0, 12);
    expect(observed.predicted[2]).toBe(1);
    expect(observed.audit).toMatchObject({
      status: 'CALCULATED',
      method: 'RUIZ_EQUILIBRATED_SVD_MINIMUM_NORM',
      equilibrationSweeps: 4,
      originalNumericalRank: 1,
      equilibratedNumericalRank: 2,
      originalLeftNullity: 2,
      originalRightNullity: 2,
      equilibratedLeftNullity: 1,
      equilibratedRightNullity: 1,
      nullDirectionCount: 1,
    });
    expect(observed.originalReconstruction).toBeLessThan(1e-12);
    expect(observed.weightedReconstruction).toBeLessThan(1e-12);
    expect(observed.originalUnresolved[0]).toBeCloseTo(0, 12);
    expect(observed.originalUnresolved[1]).toBeCloseTo(-1e-12, 24);
    expect(observed.originalUnresolved[2]).toBeCloseTo(1, 12);
    expect(observed.weightedUnresolved[0]).toBeCloseTo(0, 12);
    expect(observed.weightedUnresolved[1]).toBeCloseTo(0, 12);
    expect(observed.weightedUnresolved[2]).toBeCloseTo(1, 12);
    expect(observed.dominantNoCells).toEqual([]);
    expect(observed.dominantFv[0]).toMatchObject({
      equationIndex: 27,
      numericalCell: 2,
      phase: 'dispersed',
      component: 'NMP',
      rawResidualMolS: -24,
      originalColumnSpaceRemovableRawMolS: -18,
      originalLeftNullSpaceUnresolvedRawMolS: -6,
      equilibratedWeightedColumnSpaceRemovableRawMolS: -18,
      equilibratedWeightedLeftNullSpaceUnresolvedRawMolS: -6,
    });
    expect(observed.diagnosticFailureCorrection).toEqual([-1, 2]);
    expect(observed.diagnosticFailureStatus).toBe('UNAVAILABLE');
    expect(observed.weightedFailureCorrection).toEqual([-1, 2]);
    expect(observed.weightedFailureStatus).toBe('UNAVAILABLE');
    expect(observed.extremeCorrectionFinite).toBe(true);
    expect(observed.extremeStrictJson).toBe(true);
    expect(observed.repeatExact).toBe(true);
    expect(observed.repeatAuditExact).toBe(true);
    expect(observed.passingScore).toBeCloseTo(0.3, 12);
    expect(observed.rawFailingScore).toBeCloseTo(1.01, 12);
    expect(observed.invalidCorrection).toBeNull();
    expect(observed.invalidStatus).toBe('INVALID_INPUT');
  }, 15_000);

  it('uses bounded true-residual recovery without treating an intermediate step as a gate', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, hashlib, json, math, numpy as np, scipy
from pathlib import Path
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "coupled_gate_decision",
  "coupled_gate_score",
   "coupled_finite_norm",
  "coupled_gauss_newton_candidate",
   "coupled_bounded_bvls_direction",
   "coupled_correction_limiter",
  "coupled_rank_aware_recovery",
  "diagnostic_linearization", "native_json_scalar", "canonical", "hashed", "digest",
}
selected = [
  node for node in tree.body
  if isinstance(node, ast.FunctionDef) and node.name in names
]
namespace = {"np": np, "scipy": scipy, "math": math, "hashlib": hashlib, "json": json}
exec(compile(ast.Module(body=selected, type_ignores=[]),
             "job-c-rank-aware-recovery", "exec"), namespace)

def confirmed(state):
  x = float(np.asarray(state)[0])
  score = abs(x - 2.0) + 1.0
  metrics = {
    "rawFvResidualMolS": score * 1e-7,
    "scaledFvResidual": 1e-8,
    "maximumOriginalJobBGateResidual": 1e-8,
    "minimumFlowMolS": x,
    **namespace["coupled_gate_decision"](
      score * 1e-7, 1e-8, 1e-8, x),
  }
  return {
    "accepted": metrics["accepted"],
    "state": np.asarray(state).copy(),
    "evaluation": np.asarray([x - 2.0]),
    "metrics": metrics,
    "confirmation": {
      "independentRawReevaluationCount": 2,
      "bothScientificGateEvaluationsPassed": metrics["accepted"],
      "maximumMetricDifference": 0.0,
      "exactlyRepeatable": True,
    },
  }

audit_states = []
def audit_for(matrix, fun, state, active):
  x = float(state[0])
  audit_states.append(x)
  correction = np.asarray([-8.0 if x > 2.5 else 2.0 - x])
  return {
    "status": "CALCULATED",
    "state": x,
    "active": np.asarray(active).tolist(),
  }, correction

confirmed_states = []
def confirm(state):
  confirmed_states.append(float(state[0]))
  return confirmed(state)

jacobian_builds = []
def build_jacobian(state, f0):
  jacobian_builds.append({
    "state": float(state[0]),
    "f0": np.asarray(f0).tolist(),
  })
  return np.asarray([[1.0]])

budget_checks = []
result = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([3.0]), confirmed(np.asarray([3.0])),
  np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
  np.asarray([0.0]), np.asarray([10.0]), np.asarray([1.0]), audit_for, confirm,
  lambda evaluation: np.asarray(evaluation),
  build_jacobian, lambda state: f"{float(state[0]):.12f}",
  lambda: budget_checks.append(True),
  maximum_corrections=3, maximum_backtracks=6)

baseline_calls = (audit_states.copy(), confirmed_states.copy(),
                  jacobian_builds.copy(), budget_checks.copy())
audit_states.clear()
confirmed_states.clear()
jacobian_builds.clear()
budget_checks.clear()
def capturing_audit(matrix, fun, state, active):
  audit, correction = audit_for(matrix, fun, state, active)
  audit["diagnosticLinearization"] = namespace["diagnostic_linearization"](
    np, state, fun, matrix, np.asarray([0.0]), np.asarray([10.0]),
    np.asarray([1.0]), active)
  return audit, correction

captured_result = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([3.0]), confirmed(np.asarray([3.0])),
  np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
  np.asarray([0.0]), np.asarray([10.0]), np.asarray([1.0]), capturing_audit, confirm,
  lambda evaluation: np.asarray(evaluation),
  build_jacobian, lambda state: f"{float(state[0]):.12f}",
  lambda: budget_checks.append(True),
  maximum_corrections=3, maximum_backtracks=6)
def without_capture(value):
  if isinstance(value, dict):
    return {key: without_capture(child) for key, child in value.items()
            if key != "diagnosticLinearization"}
  if isinstance(value, list):
    return [without_capture(child) for child in value]
  if isinstance(value, np.ndarray):
    return value.tolist()
  return value
capture_unchanged = (without_capture(captured_result) == without_capture(result)
  and baseline_calls == (audit_states, confirmed_states, jacobian_builds, budget_checks))

accepted_skip_calls = []
accepted_skip = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([2.0]), confirmed(np.asarray([2.0])),
  np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
  np.asarray([0.0]), np.asarray([10.0]), np.asarray([1.0]),
  lambda *args: accepted_skip_calls.append("audit"),
  lambda state: accepted_skip_calls.append("confirm"),
  lambda evaluation: evaluation,
  lambda state, f0: accepted_skip_calls.append("jacobian"),
  lambda state: "accepted", lambda: accepted_skip_calls.append("budget"),
  maximum_corrections=3, maximum_backtracks=6)

print(json.dumps({
  "captureLeavesDecisionsAndEvaluationCountsUnchanged": capture_unchanged,
  "finalState": result["confirmed"]["state"].tolist(),
  "accepted": result["confirmed"]["accepted"],
  "sequence": result["sequence"],
  "rootAudit": result["rootAudit"],
  "confirmedStates": confirmed_states,
  "auditStates": audit_states,
  "jacobianBuilds": jacobian_builds,
  "budgetCheckCount": len(budget_checks),
  "acceptedSkipCalls": accepted_skip_calls,
  "acceptedSkipSequence": accepted_skip["sequence"],
}))
`], { encoding: 'utf8' }));
    expect(observed.captureLeavesDecisionsAndEvaluationCountsUnchanged).toBe(true);
    expect(observed.finalState).toEqual([2]);
    expect(observed.accepted).toBe(true);
    expect(observed.confirmedStates).toEqual([2]);
    expect(observed.auditStates).toHaveLength(1);
    expect(observed.auditStates[0]).toBe(3);
    expect(observed.jacobianBuilds).toEqual([]);
    expect(observed.sequence).toMatchObject({
      maximumCorrections: 3,
      maximumBacktracksPerCorrection: 6,
      retainedCorrectionCount: 1,
      accepted: true,
      terminationReason: 'SCIENTIFIC_GATES_PASSED_INDEPENDENT_OF_INTERMEDIATE_STEP',
    });
    expect(observed.sequence.linearizations[0].candidates).toHaveLength(1);
    expect(observed.sequence.linearizations[0].candidates[0])
      .toMatchObject({
        trueResidualDecreaseDecision: true,
        intermediateStepRetained: true,
        scientificAdmission: true,
      });
    expect(observed.rootAudit).toEqual({
      status: 'CALCULATED',
      state: 3,
      active: [0],
    });
    expect(observed.budgetCheckCount).toBe(2);
    expect(observed.acceptedSkipCalls).toEqual([]);
    expect(observed.acceptedSkipSequence).toMatchObject({
      retainedCorrectionCount: 0,
      accepted: false,
      terminationReason: 'CURRENT_CONFIRMED_STATE_ALREADY_ACCEPTED',
    });
  }, 15_000);

  it('bounds production BVLS recovery and preserves uncached scientific admission', () => {
    const worker = readFileSync('server/ecr-pre-pilot/job-c/worker.py', 'utf8');
    expect(worker).toContain('maximum_corrections=12, maximum_backtracks=6');
    expect(worker).toContain('SCALED_BVLS_BOUNDED_LINEAR_SUBPROBLEM');
    expect(worker).toContain('method="bvls",tol=1e-14');
    expect(worker).toContain('TRUE_RESIDUAL_DECREASE_RETAINED_NOT_A_GATE_PASS');
    expect(worker).toContain('UNCHANGED_FOUR_GATES_THEN_GATE_SCORE');
    expect(worker).toContain('RUIZ_EQUILIBRATED_SVD_MINIMUM_NORM');
    expect(worker).toContain('BOUND_AWARE_BVLS_TRUE_RESIDUAL_CORRECTED_STATE');
    expect(worker).toContain('exact_raw_evaluate,gate_metrics');
    expect(worker).toContain('base_residual_value=base_value');
    expect(worker).toContain('OPTIMIZER_BEST_BASE_STATE_REJECTED');
    expect(worker).toContain(
      '"SCIENTIFIC_GATES_PASSED_INDEPENDENT_OF_INTERMEDIATE_STEP"',
    );
    expect(worker).toContain('"NO_TRUE_RESIDUAL_DECREASE_WITHIN_FIXED_BACKTRACK_BUDGET"');
  });

  it('replays residual-only S0/S1/S2 BVLS corrections without a Job C run', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, json, math, sys, time
from pathlib import Path
sys.path.insert(0, "dist/predictive-nt-runtime-7c-1-5/server/research/"
  "ecr-pre-pilot-cosmosac/vendor/python")
import numpy as np
import scipy
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {
  "coupled_gate_decision", "coupled_gate_score", "coupled_finite_norm",
  "confirm_coupled_candidate", "coupled_bounded_bvls_direction",
  "coupled_correction_limiter", "coupled_rank_aware_recovery",
}
nodes = [node for node in tree.body
         if isinstance(node, ast.FunctionDef) and node.name in names]
namespace = {"np": np, "scipy": scipy, "math": math, "time": time}
exec(compile(ast.Module(body=nodes, type_ignores=[]),
             "<isolated-job-c-bound-aware-replay>", "exec"), namespace)

def metrics(state, passing=True):
  residual = abs(float(state[0]) - 1.0)
  raw = residual * 1e-7 if passing else 2e-7
  return {
    "rawFvResidualMolS": raw, "scaledFvResidual": raw,
    "maximumOriginalJobBGateResidual": raw,
    "minimumFlowMolS": float(state[0]),
    **namespace["coupled_gate_decision"](raw, raw, raw, float(state[0])),
  }

uncached_calls = []
def raw_evaluate(state, lam):
  uncached_calls.append(float(state[0]))
  value = float(state[0])
  return {"state": np.asarray(state).copy(),
          "residual": np.asarray([value - 1.0])}
def metric_for_evaluation(evaluation):
  return metrics(evaluation["state"])
confirmation = namespace["confirm_coupled_candidate"](
  np, np.asarray([1.0]), 1e-8, raw_evaluate, metric_for_evaluation)
confirmation_calls = len(uncached_calls)

def recovery_for(start, passing=True):
  initial = namespace["confirm_coupled_candidate"](
    np, np.asarray([start]), 1e-8, raw_evaluate, metric_for_evaluation)
  def confirm(state):
    if passing:
      return namespace["confirm_coupled_candidate"](
        np, state, 1e-8, raw_evaluate, metric_for_evaluation)
    evaluation = raw_evaluate(state, 1e-8)
    return {"accepted": False, "state": np.asarray(state).copy(),
      "evaluation": evaluation, "metrics": metrics(state, False),
      "confirmation": {"independentRawReevaluationCount": 2,
        "bothScientificGateEvaluationsPassed": False,
        "maximumMetricDifference": 0.0, "exactlyRepeatable": True}}
  def audit(matrix, fun, state, active):
    return {"status": "CALCULATED",
      "diagnosticLinearization": {"state": state.tolist()}}, np.asarray([77.])
  refreshed = []
  result = namespace["coupled_rank_aware_recovery"](
    np, scipy, np.asarray([start]), initial, np.asarray([start - 1.0]),
    np.asarray([[1.0]]), np.asarray([0]), np.asarray([0.1]),
    np.asarray([4.0]), np.asarray([1.0]), audit, confirm,
    lambda evaluation: evaluation["residual"],
    lambda state, f0: (refreshed.append(float(state[0]))
                        or np.asarray([[1.0]])),
    lambda state: f"{float(state[0]):.16g}", lambda: None,
    maximum_corrections=12, maximum_backtracks=6)
  result["freshJacobianStates"] = refreshed
  return result

states = {label: recovery_for(value)
          for label, value in (("S0", 4.0), ("S1", 3.0), ("S2", 2.5))}
non_gate = recovery_for(3.0, passing=False)

def gate_pass_metrics(evaluation):
  return {"rawFvResidualMolS": 0.0, "scaledFvResidual": 0.0,
    "maximumOriginalJobBGateResidual": 0.0, "minimumFlowMolS": 2.0,
    **namespace["coupled_gate_decision"](0.0, 0.0, 0.0, 2.0)}
def l2_increasing_raw(state, lam):
  return {"state": np.asarray(state).copy(), "residual": np.asarray([2.0])}
gate_despite_l2_increase = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([3.0]), {
    "accepted": False, "evaluation": {"residual": np.asarray([1.0])},
    "metrics": metrics(np.asarray([3.0])),
  }, np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
  np.asarray([0.1]), np.asarray([4.0]), np.asarray([1.0]),
  lambda *args: ({"status": "CALCULATED"}, np.asarray([99.])),
  lambda state: namespace["confirm_coupled_candidate"](
    np, state, 1e-8, l2_increasing_raw, gate_pass_metrics),
  lambda evaluation: evaluation["residual"], lambda state, f0: None,
  lambda state: f"{float(state[0]):.16g}", lambda: None,
  maximum_corrections=12, maximum_backtracks=6)

repeat_counter = [0]
def nonrepeat_raw(state, lam):
  repeat_counter[0] += 1
  offset = 0.0 if repeat_counter[0] == 1 else 1e-5
  return {"state": np.asarray([1.0 + offset]), "residual": np.asarray([0.0])}
nonrepeat_confirmation = namespace["confirm_coupled_candidate"](
  np, np.asarray([1.0]), 1e-8, nonrepeat_raw, metric_for_evaluation)

def multi_metrics(evaluation):
  raw = 2e-7 if float(evaluation["state"][0]) >= 2.0 else 3e-7
  return {"rawFvResidualMolS": raw, "scaledFvResidual": raw,
    "maximumOriginalJobBGateResidual": raw,
    "minimumFlowMolS": float(evaluation["state"][0]),
    **namespace["coupled_gate_decision"](
      raw, raw, raw, float(evaluation["state"][0]))}
def multi_raw(state, lam):
  x = float(state[0])
  return {"state": np.asarray(state).copy(), "residual": np.asarray([x])}
multi_initial = namespace["confirm_coupled_candidate"](
  np, np.asarray([3.0]), 1e-8, multi_raw, multi_metrics)
multi_step = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([3.0]), multi_initial, np.asarray([3.0]),
  np.asarray([[3.0]]), np.asarray([0]), np.asarray([0.1]),
  np.asarray([4.0]), np.asarray([1.0]),
  lambda *args: ({"status": "CALCULATED"}, np.asarray([88.])),
  lambda state: namespace["confirm_coupled_candidate"](
    np, state, 1e-8, multi_raw, multi_metrics),
  lambda evaluation: evaluation["residual"],
  lambda state, f0: np.asarray([[2.0]]),
  lambda state: f"{float(state[0]):.16g}", lambda: None,
  maximum_corrections=2, maximum_backtracks=6)

# The first candidate has a lower scalar score but is non-repeatable.  The
# second is repeatable and admitted; admission priority must select it.
priority_counts = [0]
def priority_raw(state, lam):
  x = float(state[0])
  if abs(x - 2.0) < 1e-12:
    priority_counts[0] += 1
    raw = 0.0 if priority_counts[0] == 1 else 1e-12
  else:
    raw = .5e-7
  return {"state": np.asarray(state).copy(), "residual": np.asarray([2.0]),
    "raw": raw}
def priority_metrics(evaluation):
  raw = evaluation["raw"]
  return {"rawFvResidualMolS": raw, "scaledFvResidual": raw,
    "maximumOriginalJobBGateResidual": raw, "minimumFlowMolS": 1.0,
    **namespace["coupled_gate_decision"](raw, raw, raw, 1.0)}
priority_selection = namespace["coupled_rank_aware_recovery"](
  np, scipy, np.asarray([3.0]), {
    "accepted": False, "evaluation": {"residual": np.asarray([1.0])},
    "metrics": metrics(np.asarray([3.0])),
  }, np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
  np.asarray([0.1]), np.asarray([4.0]), np.asarray([1.0]),
  lambda *args: ({"status": "CALCULATED"}, np.asarray([66.])),
  lambda state: namespace["confirm_coupled_candidate"](
    np, state, 1e-8, priority_raw, priority_metrics),
  lambda evaluation: evaluation["residual"], lambda state, f0: None,
  lambda state: f"{float(state[0]):.16g}", lambda: None,
  maximum_corrections=12, maximum_backtracks=6)
bounded, bounded_audit = namespace["coupled_bounded_bvls_direction"](
  np, scipy, np.asarray([[1.0]]), np.asarray([-10.0]), np.asarray([0.9]),
  np.asarray([0.1]), np.asarray([1.0]), np.asarray([1.0]))
for sparse_type in (scipy.sparse.csr_matrix, scipy.sparse.csr_array):
  sparse_correction, sparse_audit = namespace["coupled_bounded_bvls_direction"](
    np, scipy, sparse_type([[1.0]]), np.asarray([-10.0]), np.asarray([0.9]),
    np.asarray([0.1]), np.asarray([1.0]), np.asarray([1.0]))
  assert np.array_equal(sparse_correction, bounded)
  assert sparse_audit == bounded_audit
limiter = namespace["coupled_correction_limiter"](
  np, np.asarray([0.9]), bounded, np.asarray([0.1]), np.asarray([1.0]))
invalid, invalid_audit = namespace["coupled_bounded_bvls_direction"](
  np, scipy, np.asarray([[np.nan]]), np.asarray([1.0]), np.asarray([0.5]),
  np.asarray([0.1]), np.asarray([1.0]), np.asarray([1.0]))
cancelled = False
try:
  namespace["coupled_rank_aware_recovery"](
    np, scipy, np.asarray([3.0]), {
      "accepted": False, "evaluation": {"residual": np.asarray([1.0])},
      "metrics": metrics(np.asarray([3.0])),
    },
    np.asarray([1.0]), np.asarray([[1.0]]), np.asarray([0]),
    np.asarray([0.1]), np.asarray([4.0]), np.asarray([1.0]),
    lambda *args: ({}, None), lambda state: None,
    lambda evaluation: evaluation["residual"],
    lambda state, f0: None, lambda state: "x",
    lambda: (_ for _ in ()).throw(KeyboardInterrupt()),
    maximum_corrections=12, maximum_backtracks=6)
except KeyboardInterrupt:
  cancelled = True

# Saved S0/S1/S2 only: this reads their captured 189-vector residuals,
# Jacobians, bounds and scales.  It neither imports nor executes the worker.
report = json.loads(Path(
  "research-results/job-c-bound-aware-qualification.json").read_text())
checkpoint = json.loads(Path(
  "research-results/job-c-flux-column-evidence/checkpoint.json").read_text())
selected = next(row["value"] for row in checkpoint["completedResults"]
  if row.get("id") == "coupled-rejection:2:root:1e-08:trial:0:lambda:1e-08")
captured = {}
def collect_audits(value):
  if isinstance(value, dict):
    diagnostic = value.get("diagnosticLinearization")
    if isinstance(diagnostic, dict) and "stateSha256" in diagnostic:
      captured[diagnostic["stateSha256"]] = diagnostic
    for child in value.values():
      collect_audits(child)
  elif isinstance(value, list):
    for child in value:
      collect_audits(child)
collect_audits(selected["coupledAttempts"])
offline = []
for state in report["states"]:
  audit = captured[state["stateSha256"]]
  correction, audit_result = namespace["coupled_bounded_bvls_direction"](
    np, scipy, scipy.sparse.csr_matrix(audit["jacobian"]), np.asarray(audit["residual"]),
    np.asarray(audit["state"]), np.asarray(audit["lowerBounds"]),
    np.asarray(audit["upperBounds"]), np.asarray(audit["variableScale"]))
  expected = next(method for method in state["methods"]
    if method["method"] == "CAPTURED_FD")["iterations"][0]["correction"]
  offline.append({"state": state["state"], "status": audit_result["status"],
    "maxAbsoluteDifference": float(np.max(np.abs(correction - expected))),
    "withinQualifiedFloatingPointReplayTolerance": bool(
      np.max(np.abs(correction - expected)) <= 1e-15)})
print(json.dumps({
  "residualOnly": True,
  "states": {key: {"accepted": value["confirmed"]["accepted"],
    "state": value["confirmed"]["state"].tolist(),
    "count": value["sequence"]["retainedCorrectionCount"],
    "method": value["sequence"]["method"]} for key, value in states.items()},
  "intermediateOnly": non_gate["sequence"]["linearizations"][0]["candidates"][0],
  "nonGateFreshJacobianStates": non_gate["freshJacobianStates"],
  "gateDespiteL2Increase": {
    "accepted": gate_despite_l2_increase["confirmed"]["accepted"],
    "candidate": gate_despite_l2_increase["retainedCandidateRecord"],
    "termination": gate_despite_l2_increase["sequence"]["terminationReason"],
  },
  "nonrepeatConfirmation": {
    "accepted": nonrepeat_confirmation["accepted"],
    "confirmation": nonrepeat_confirmation["confirmation"],
  },
  "multiStep": {
    "selectedState": multi_step["confirmed"]["state"].tolist(),
    "selectedRecord": multi_step["retainedCandidateRecord"],
    "tracker": multi_step["sequence"]["candidateTracker"],
  },
  "admissionPriority": {
    "accepted": priority_selection["confirmed"]["accepted"],
    "state": priority_selection["confirmed"]["state"].tolist(),
    "returnedStateSha256": f"{float(priority_selection['confirmed']['state'][0]):.16g}",
    "record": priority_selection["retainedCandidateRecord"],
    "tracker": priority_selection["sequence"]["candidateTracker"],
  },
  "confirmation": confirmation["confirmation"],
  "confirmationCalls": confirmation_calls,
  "uncachedCalls": len(uncached_calls),
  "boundedState": (np.asarray([0.9]) + bounded).tolist(),
  "boundedAudit": bounded_audit, "limiter": limiter,
  "invalid": invalid is None, "invalidStatus": invalid_audit["status"],
  "cancellationPropagates": cancelled,
  "offlineS0S1S2": offline,
}))
`], { encoding: 'utf8' }));
    expect(observed.residualOnly).toBe(true);
    for (const state of Object.values(observed.states) as any[]) {
      expect(state.method).toBe('RELINEARIZED_SCALED_BVLS_TRUE_RESIDUAL');
      expect(state.accepted).toBe(true);
      expect(state.state[0]).toBeCloseTo(1, 12);
      expect(state.count).toBe(1);
    }
    expect(observed.confirmation).toMatchObject({
      independentRawReevaluationCount: 2,
      bothScientificGateEvaluationsPassed: true,
      exactlyRepeatable: true,
    });
    expect(observed.confirmationCalls).toBe(2);
    expect(observed.intermediateOnly).toMatchObject({
      trueResidualDecreaseDecision: true,
      intermediateStepRetained: true,
      scientificAdmission: false,
    });
    expect(observed.nonGateFreshJacobianStates).toEqual([1]);
    expect(observed.gateDespiteL2Increase).toMatchObject({
      accepted: true,
      termination: 'SCIENTIFIC_GATES_PASSED_INDEPENDENT_OF_INTERMEDIATE_STEP',
      candidate: {
        trueResidualDecreaseDecision: false,
        intermediateStepRetained: false,
        scientificAdmission: true,
      },
    });
    expect(observed.nonrepeatConfirmation).toMatchObject({
      accepted: false,
      confirmation: {
        independentRawReevaluationCount: 2,
        bothScientificGateEvaluationsPassed: true,
        exactlyRepeatable: false,
      },
    });
    expect(observed.multiStep.selectedState).toEqual([2]);
    expect(observed.multiStep.selectedRecord.stateSha256)
      .toBe(observed.multiStep.tracker.selectedStateSha256);
    expect(observed.multiStep.selectedRecord.correctionIndex).toBe(1);
    expect(observed.admissionPriority).toMatchObject({
      accepted: true,
      state: [2.5],
      record: {
        scientificAdmission: true,
        stateSha256: observed.admissionPriority.tracker.selectedStateSha256,
      },
    });
    expect(observed.admissionPriority.returnedStateSha256)
      .toBe(observed.admissionPriority.tracker.selectedStateSha256);
    expect(observed.boundedState[0]).toBeGreaterThan(0.9);
    expect(observed.boundedState[0]).toBeLessThan(1);
    expect(observed.boundedAudit.status).toBe('CALCULATED');
    expect(observed.limiter.limitingBound).toBe('UPPER');
    expect(observed.invalid).toBe(true);
    expect(observed.invalidStatus).toBe('INVALID_INPUT');
    expect(observed.cancellationPropagates).toBe(true);
    expect(observed.offlineS0S1S2).toHaveLength(3);
    for (const replay of observed.offlineS0S1S2) {
      expect(replay.status).toBe('CALCULATED');
      expect(replay.maxAbsoluteDifference).toBeLessThanOrEqual(1e-15);
      expect(replay.withinQualifiedFloatingPointReplayTolerance).toBe(true);
    }
  }, 15_000);

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

  it('round-trips a synthetic rejected checkpoint through read-only diagnostic algebra', () => {
    const root = mkdtempSync(join(tmpdir(), 'job-c-rejection-replay-'));
    const sentinel = join(root, 'design-output.json');
    writeFileSync(sentinel, 'must-not-change');
    try {
      const fixture = writeDiagnosticReplayFixture(root);
      const persisted = JSON.parse(JSON.stringify(fixture.checkpoint));
      validateJobCCheckpoint(persisted, fixture.checkpoint.requestSha256);
      expect(jobCResultHash(persisted)).toBe(jobCResultHash(fixture.checkpoint));
      expect(persisted.completedResults[0].value).toEqual(fixture.evidence);
      expect(diagnosticHash(persisted.completedResults[0].value.state))
        .toBe(fixture.evidence.stateSha256);
      const output = JSON.parse(execFileSync('python3', [
        diagnosticReplayScript,
        '--checkpoint', fixture.checkpointPath,
        '--request', fixture.requestPath,
        '--runtime-root', fixture.runtimeRoot,
        '--id', 'rejected-synthetic-1',
      ], { encoding: 'utf8' }));
      expect(output).toMatchObject({
        schemaVersion: 'ECR_JOB_C_REJECTION_REPLAY_DIAGNOSTIC_V1',
        diagnosticOnly: true,
        selectionId: 'rejected-synthetic-1',
        requestSha256: diagnosticHash({ temperatureK: 333.15 }),
        linearizationCount: 2,
      });
      expect(output.linearizations[0].jtResidualL2Norm).toBeCloseTo(
        Math.sqrt(189) * 0.2, 12,
      );
      expect(output.linearizations[0].minimumLowerBoundDistance).toBeCloseTo(1.1, 12);
      expect(output.linearizations[0].minimumUpperBoundDistance).toBeCloseTo(0.9, 12);
      expect(readFileSync(sentinel, 'utf8')).toBe('must-not-change');
      expect(readFileSync(fixture.checkpointPath, 'utf8')).toContain(
        'rejected-synthetic-1',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses the selected worker hash helpers without mutating captured arrays', () => {
    const observed = JSON.parse(execFileSync('python3', ['-c', `
import ast, contextlib, copy, hashlib, io, json
from pathlib import Path
import numpy as np
source = Path("server/ecr-pre-pilot/job-c/worker.py").read_text()
tree = ast.parse(source)
names = {"native_json_scalar", "canonical", "hashed", "digest",
         "diagnostic_linearization", "rejected_diagnostic_capture",
         "record_completed_result", "checkpoint"}
nodes = [copy.deepcopy(node) for node in tree.body
         if isinstance(node, ast.FunctionDef) and node.name in names]
namespace = {"hashlib": hashlib, "json": json, "np": np}
namespace.update({"_completed_results": [], "_request_sha256": "a" * 64,
                  "_last_progress": {"phase": "synthetic rejection"}})
exec(compile(ast.fix_missing_locations(ast.Module(body=nodes, type_ignores=[])),
             "<selected-worker-diagnostic-functions>", "exec"), namespace)
state = np.full(189, 0.1)
residual = np.full(189, 0.2)
jacobian = np.eye(189)
lower = np.full(189, -1.0)
upper = np.full(189, 1.0)
scale = np.ones(189)
active = np.zeros(189)
before = [state.tolist(), residual.tolist(), jacobian.tolist()]
linearization = namespace["diagnostic_linearization"](
  np, state, residual, jacobian, lower, upper, scale, active)
capture = namespace["rejected_diagnostic_capture"](
  state.tolist(), [{"jacobianAudit": {"diagnosticLinearization": linearization}}],
  "a" * 64, {"worker.py": "b" * 64})
namespace["record_completed_result"](
  "synthetic-rejected", "REJECTED_COUPLED_CONTINUATION_TRIAL",
  {"state": state.tolist(), "stateSha256": capture["selectedStateSha256"],
   "diagnosticCapture": capture,
   "coupledAttempts": [{"jacobianAudit": {"diagnosticLinearization": linearization}}]},
  inputSha256="a" * 64)
stream = io.StringIO()
with contextlib.redirect_stdout(stream):
  namespace["checkpoint"]()
checkpoint = json.loads(stream.getvalue().removeprefix("JOB_C_CHECKPOINT "))
print(json.dumps({
  "before": before,
  "after": [state.tolist(), residual.tolist(), jacobian.tolist()],
  "linearization": linearization,
  "capture": capture,
  "checkpoint": checkpoint,
  "checkpointSha256": namespace["digest"](checkpoint),
}))
`], { encoding: 'utf8' }));
    expect(observed.after).toEqual(observed.before);
    validateJobCCheckpoint(observed.checkpoint, 'a'.repeat(64));
    const persisted = JSON.parse(JSON.stringify(observed.checkpoint));
    expect(jobCResultHash(persisted)).toBe(observed.checkpointSha256);
    expect(persisted.completedResults[0].value.state).toEqual(observed.linearization.state);
    expect(persisted.completedResults[0].value.coupledAttempts[0]
      .jacobianAudit.diagnosticLinearization).toEqual(observed.linearization);
    const diagnosticPayload = { ...observed.linearization };
    delete diagnosticPayload.payloadSha256;
    expect(observed.linearization.payloadSha256).toBe(diagnosticHash(diagnosticPayload));
    expect(observed.linearization.stateSha256).toBe(
      diagnosticHash(observed.linearization.state),
    );
    const capturePayload = { ...observed.capture };
    delete capturePayload.captureSha256;
    expect(observed.capture.captureSha256).toBe(diagnosticHash(capturePayload));
    expect(observed.capture.selectedStateSha256).toBe(
      diagnosticHash(observed.linearization.state),
    );
  });

  it.each([
    'missing-vector',
    'tampered-vector',
    'wrong-request-lineage',
    'wrong-worker-lineage',
  ])('refuses %s before diagnostic algebra', kind => {
    const root = mkdtempSync(join(tmpdir(), `job-c-rejection-${kind}-`));
    try {
      const fixture = writeDiagnosticReplayFixture(root);
      const checkpoint = JSON.parse(
        readFileSync(fixture.checkpointPath, 'utf8'),
      ) as Record<string, any>;
      const evidence = checkpoint.completedResults[0].value;
      if (kind === 'missing-vector') {
        delete evidence.coupledAttempts[0].jacobianAudit
          .rankAwareCorrectionSequence.linearizations[0]
          .jacobianAudit.diagnosticLinearization;
        evidence.diagnosticCapture.coupledAttemptsSha256 = diagnosticHash(
          evidence.coupledAttempts,
        );
        const capturePayload = { ...evidence.diagnosticCapture };
        delete capturePayload.captureSha256;
        evidence.diagnosticCapture.captureSha256 = diagnosticHash(capturePayload);
      } else if (kind === 'tampered-vector') {
        evidence.coupledAttempts[0].jacobianAudit.diagnosticLinearization
          .residual[0] = 9;
        evidence.diagnosticCapture.coupledAttemptsSha256 = diagnosticHash(
          evidence.coupledAttempts,
        );
        const capturePayload = { ...evidence.diagnosticCapture };
        delete capturePayload.captureSha256;
        evidence.diagnosticCapture.captureSha256 = diagnosticHash(capturePayload);
      } else if (kind === 'wrong-request-lineage') {
        writeFileSync(fixture.requestPath, JSON.stringify({
          protocol: 'ECR_PRE_PILOT_JOB_C_V1',
          operation: 'SOLVE_HEIGHT',
          temperatureK: 334.15,
        }));
      } else {
        const workerPath = join(
          root, 'server/ecr-pre-pilot/job-c/worker.py',
        );
        writeFileSync(workerPath, `${readFileSync(workerPath, 'utf8')}\n# tampered\n`);
      }
      writeFileSync(fixture.checkpointPath, JSON.stringify(checkpoint));
      let refused = false;
      try {
        execFileSync('python3', [
          diagnosticReplayScript,
          '--checkpoint', fixture.checkpointPath,
          '--request', fixture.requestPath,
          '--runtime-root', fixture.runtimeRoot,
          '--id', 'rejected-synthetic-1',
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (error: any) {
        refused = true;
        expect(String(error.stderr)).toContain('REPLAY_REFUSED');
      }
      expect(refused).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});