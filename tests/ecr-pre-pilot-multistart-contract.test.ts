import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runContractFixture() {
  const script = String.raw`
import importlib.util, json, sys
from pathlib import Path
from types import SimpleNamespace

path = Path("server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/run.py").resolve()
spec = importlib.util.spec_from_file_location("multistart_contract", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
gates = {
    "maximumScaledEquationResidual": 1e-8,
    "multistartProductRelativeTolerance": 1e-6,
}
cases = {
    "termination_false_but_closed": module.classify_multistart(
        2.7755575615628914e-14, 4.359541449071358e-9, 5.1512425814423466e-9, gates
    ),
    "secondary_unclosed": module.classify_multistart(1e-12, 1e-4, 1e-3, gates),
    "primary_unclosed": module.classify_multistart(1e-4, 1e-12, 1e-3, gates),
    "closed_distinct_branch": module.classify_multistart(1e-12, 2e-12, 2e-6, gates),
    "closed_reproduced_branch": module.classify_multistart(1e-12, 2e-12, 2e-7, gates),
}
endpoint = SimpleNamespace(
    success=False,
    status=0,
    message="The maximum number of function evaluations is exceeded.",
    nfev=20,
    njev=20,
    cost=1.0,
    optimality=1.0,
    fun=module.np.asarray([4.359541449071358e-9] + [0.0] * 11),
)
cases["termination_evidence"] = module.attempt_evidence(
    "SPARSE_LSMR_INITIAL", endpoint, 1, 1.0, 1e-8
)
endpoint_success_unclosed = SimpleNamespace(
    success=True,
    status=1,
    message="gtol termination condition is satisfied.",
    nfev=3,
    njev=3,
    cost=1.0,
    optimality=1e-13,
    fun=module.np.asarray([1e-4] + [0.0] * 11),
)
cases["termination_success_but_unclosed"] = module.attempt_evidence(
    "DENSE_TRUST_REGION", endpoint_success_unclosed, 1, 1.0, 1e-8
)
print(json.dumps(cases))
`;
  return JSON.parse(execFileSync('python3.12', ['-c', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }));
}

describe('Predictive N_T multistart contract', () => {
  const fixture = runContractFixture();

  it('treats a finite residual below the governed limit as closed independently of termination', () => {
    expect(fixture.termination_false_but_closed).toMatchObject({
      primaryResidualClosureStatus: 'CLOSED',
      secondaryResidualClosureStatus: 'CLOSED',
      bothEndpointsClosed: true,
      branchComparisonStatus: 'EVALUATED',
      branchReproduced: true,
      blockers: [],
    });
    expect(fixture.termination_evidence).toMatchObject({
      solverSuccess: false,
      terminationStatus: 'MAX_NFEV',
      residualClosureStatus: 'CLOSED',
      closureLimit: 1e-8,
    });
    expect(fixture.termination_success_but_unclosed).toMatchObject({
      solverSuccess: true,
      terminationStatus: 'GTOL',
      residualClosureStatus: 'UNCLOSED',
      closureLimit: 1e-8,
    });
  });

  it('does not claim a branch comparison while either endpoint is unclosed', () => {
    expect(fixture.secondary_unclosed).toMatchObject({
      bothEndpointsClosed: false,
      branchComparisonStatus: 'NOT_EVALUABLE_ENDPOINT_UNCLOSED',
      reportedProductRelativeDifference: null,
    });
    expect(fixture.secondary_unclosed.blockers.map(({ code }: { code: string }) => code))
      .toEqual(['MULTISTART_SECONDARY_CLOSURE_FAILED']);
    expect(fixture.primary_unclosed.blockers.map(({ code }: { code: string }) => code))
      .toEqual(['COUPLED_SOLVER_CLOSURE_FAILED']);
  });

  it('emits branch reproduction failure only for two closed, different endpoints', () => {
    expect(fixture.closed_distinct_branch).toMatchObject({
      bothEndpointsClosed: true,
      branchComparisonStatus: 'EVALUATED',
      branchReproduced: false,
    });
    expect(fixture.closed_distinct_branch.blockers.map(({ code }: { code: string }) => code))
      .toEqual(['MULTISTART_BRANCH_REPRODUCTION_FAILED']);
    expect(fixture.closed_reproduced_branch).toMatchObject({
      bothEndpointsClosed: true,
      branchComparisonStatus: 'EVALUATED',
      branchReproduced: true,
      blockers: [],
    });
  });
});