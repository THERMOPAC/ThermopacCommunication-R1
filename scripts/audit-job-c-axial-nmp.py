"""Read-only flux/balance audit of the archived Job-C state; no solver runs.

The archived constitutive expressions are evaluated at the saved interface
coordinates. Chemical potentials are not needed to evaluate those fluxes;
equilibrium/interface qualification is neither mocked nor rerun.
"""
import ast
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
from types import SimpleNamespace

import numpy as np

SOURCE = Path("research-results/job-c-final-continuation.json")
ARCHIVE = Path(str(SOURCE) + ".sources")
snapshot = json.loads(SOURCE.read_text())
r = snapshot["input"]
body = snapshot["result"]
diagnostics = body["diagnostics"]
continuation = diagnostics["branchContinuation"]

for filename, key in [
    ("worker.py", "implementationHash"),
    ("candidate_interface.py", "candidateHash"),
    ("boundary_interface_qualifier.py", "boundaryQualifierHash"),
    ("branch_continuation.py", "branchContinuationHash"),
]:
    assert hashlib.sha256((ARCHIVE / filename).read_bytes()).hexdigest() == snapshot["implementation"][key]

worker_tree = ast.parse((ARCHIVE / "worker.py").read_text())
hash_functions = [copy.deepcopy(node) for node in worker_tree.body
                  if isinstance(node, ast.FunctionDef) and node.name in ("canonical", "hashed", "digest")]
hash_namespace = {"json": json, "hashlib": hashlib}
exec(compile(ast.fix_missing_locations(ast.Module(body=hash_functions, type_ignores=[])),
             "<archived Job-C hash functions>", "exec"), hash_namespace)
digest = hash_namespace["digest"]
assert digest(r) == snapshot["inputSha256"]
assert digest({k: v for k, v in body.items() if k != "resultSha256"}) == body["resultSha256"]
state = np.asarray(continuation["startingState"], dtype=float)
assert digest(state.tolist()) == diagnostics["pseudoArclengthQualification"]["acceptedStateSha256"]
assert continuation["startingLambda"] == continuation["lastAcceptedLambda"]

spec = importlib.util.spec_from_file_location("archived_candidate", ARCHIVE / "candidate_interface.py")
candidate_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(candidate_module)

# Project ONLY the existing flux calculation from the archived function.
# The mu assignment and its equilibrium-residual return are not evaluated.
# No replacement chemical potentials or interface coordinates are supplied.
candidate_tree = ast.parse((ARCHIVE / "candidate_interface.py").read_text())
equations = copy.deepcopy(next(node for node in ast.walk(candidate_tree)
                              if isinstance(node, ast.FunctionDef) and node.name == "equations"))
equations.name = "evaluate_archived_fluxes"
equations.body = [
    node for node in equations.body
    if not isinstance(node, ast.Return) and not (
        isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "mu" for target in node.targets))
]
equations.body.append(ast.Return(value=ast.Tuple(
    elts=[ast.Name(id="nc", ctx=ast.Load()), ast.Name(id="nd", ctx=ast.Load())], ctx=ast.Load())))
assert not any(isinstance(node, ast.Name) and node.id == "mu" for node in ast.walk(equations))
flux_namespace = {}
exec(compile(ast.fix_missing_locations(ast.Module(body=[equations], type_ignores=[])),
             "<archived flux-only projection>", "exec"), flux_namespace)

m = int(r["compartments"])
assert m == 7 and list(r["componentOrder"]) == ["SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O"]
assert r["dispersedFeedMolS"][5:7] == [0, 0]
h = float(diagnostics["heightM"])
lam = float(continuation["startingLambda"])
area = math.pi * r["columnDiameterM"] ** 2 / 4
dz = h / m
av = 6 * r["operatingHoldup"] / r["d32M"]
c, d = state[:14*m].reshape(2, m, 7)
u = state[14*m:].reshape(m, 13)
solver = candidate_module.CandidateInterfaceSolver(
    SimpleNamespace(np=np, scipy=None), r["temperatureK"], r["kc"], r["kd"],
    r["continuousTotalConcentrationMolM3"], r["dispersedTotalConcentrationMolM3"],
    r["phaseConfiguration"])
fluxes = [flux_namespace["evaluate_archived_fluxes"](
    solver, u[j], c[j]/c[j].sum(), d[j]/d[j].sum()) for j in range(m)]
nc = np.asarray([pair[0] for pair in fluxes])
nd = np.asarray([pair[1] for pair in fluxes])
tr = lam * nc * av * area * dz

# Read the frozen nominal dispersion values from the archived execution call.
nominal_call = next(node for node in ast.walk(worker_tree)
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "case"
    and len(node.args) >= 4 and isinstance(node.args[1], ast.Constant) and node.args[1].value == "NOMINAL")
dc, dd = (float(ast.literal_eval(nominal_call.args[i])) for i in (2, 3))
feedc, feedd = np.asarray(r["continuousFeedMolS"]), np.asarray(r["dispersedFeedMolS"])
cc = c/c.sum(axis=1)[:, None] * r["continuousTotalConcentrationMolM3"]
cd = d/d.sum(axis=1)[:, None] * r["dispersedTotalConcentrationMolM3"]
fc, fd = np.zeros((m+1, 7)), np.zeros((m+1, 7))
fc[0], fd[m] = feedc, -feedd
for j in range(1, m):
    fc[j] = (c[j-1]+c[j])/2 - dc*area*(cc[j]-cc[j-1])/dz
    fd[j] = -(d[j-1]+d[j])/2 - dd*area*(cd[j]-cd[j-1])/dz
fc[m], fd[0] = c[m-1], -d[0]
rc, rd = fc[:-1]-fc[1:]-tr, fd[:-1]-fd[1:]+tr

saved_cell = continuation["startingCell1NmpBalance"]
assert abs(float(tr[0, 5])-saved_cell["interphaseTransferMolS"]) <= 1e-20
assert abs(float(rd[0, 5])-saved_cell["residualMolS"]) <= 1e-20
maximum_raw = float(max(np.max(np.abs(rc)), np.max(np.abs(rd))))
assert abs(maximum_raw-continuation["startingGateMetrics"]["rawFvResidualMolS"]) <= 1e-14

def changes(values):
    nonzero = [(j, float(value)) for j, value in enumerate(values) if value != 0.0]
    return [{"betweenCells": [j+1, k+1], "betweenCellCentersZM": [(j+.5)*dz, (k+.5)*dz],
             "intermediateZeroCells": list(range(j+2, k+1))}
            for (j, left), (k, right) in zip(nonzero, nonzero[1:]) if (left < 0) != (right < 0)]

total_transfer = math.fsum(float(v) for v in tr[:, 5])
inlet = float(feedd[5])
outlet = float(d[0, 5])
overall = inlet - outlet + total_transfer
sum_cell_residuals = math.fsum(float(v) for v in rd[:, 5])
assert math.isclose(overall, sum_cell_residuals, abs_tol=1e-20, rel_tol=0)
rows = [{
    "numericalCell": j+1, "cellSpanZMFromContinuousInlet": [j*dz, (j+1)*dz],
    "cellCenterZMFromContinuousInlet": (j+.5)*dz,
    "sourceStagesFromFeedEnd": r["axialLocalContactProfile"][j]["provenance"]["sourceStageFromFeedEnd"],
    "continuousSideNmpFluxMolM2S": float(nc[j, 5]),
    "dispersedSideNmpFluxMolM2S": float(nd[j, 5]),
    "integratedNmpTransferMolS": float(tr[j, 5]),
    "dispersedNmpFlowMolS": float(d[j, 5]),
    "dispersedNmpFvResidualMolS": float(rd[j, 5]),
    "direction": "DISPERSED_TO_CONTINUOUS" if nc[j, 5] < 0 else
                 "CONTINUOUS_TO_DISPERSED" if nc[j, 5] > 0 else "ZERO",
} for j in range(m)]
audit = {
    "sourceSnapshot": str(SOURCE), "sourceResponseSha256": body["resultSha256"],
    "sourceInputSha256": snapshot["inputSha256"],
    "sourceStateSha256": digest(state.tolist()),
    "heightM": h, "lambda": lam,
    "stateQualification": "ARCHIVED_TOLERANCE_ACCEPTED_STATE_NOT_PHYSICALLY_RESOLVED",
    "evaluation": "ARCHIVED_FLUX_EXPRESSIONS_AT_SAVED_BULKS_AND_INTERFACES_NO_SOLVER_RERUN",
    "signConvention": "POSITIVE_NC_REMOVES_FROM_CONTINUOUS_AND_ADDS_TO_DISPERSED",
    "overallDispersedNmp": {
        "sumIntegratedTransferMolS": total_transfer,
        "inletMolS": inlet, "storedOutletMolS": outlet,
        "outletRequiredForExactOverallClosureMolS": inlet+total_transfer,
        "residualInletMinusOutletPlusTransferMolS": overall,
        "sumCellResidualsMolS": sum_cell_residuals,
        "telescopingIdentityDifferenceMolS": overall-sum_cell_residuals,
        "closed": abs(overall) <= 1e-7,
        "nonnegativeOutletConsistentWithFrozenTransfers": inlet+total_transfer >= 0,
    },
    "axialNmpFluxSignChanges": changes(nc[:, 5]),
    "dispersedFilmNmpFluxSignChanges": changes(nd[:, 5]),
    "exactZeroFluxCells": [j+1 for j in range(m) if nc[j, 5] == 0.0],
    "maximumFilmNmpFluxDisagreementMolM2S": float(np.max(np.abs(nc[:, 5]-nd[:, 5]))),
    "maximumReconstructedRawFvResidualMolS": maximum_raw,
    "cells": rows,
    "limits": [
        "Only the archived last-qualified numerical state is audited, not lambda=1.",
        "No interpolation is used to invent between-cell roots or claim sub-cell resolution.",
        "The overall defect is recomputed including the actual nonzero FV residuals.",
        "Local flux contributions are not decomposed in this report.",
        "Negative closure-required outlet is diagnostic and never an accepted physical state.",
    ],
}
output = Path("research-results/job-c-axial-nmp-audit.json")
output.write_text(json.dumps(audit, indent=2, allow_nan=False)+"\n")
print(json.dumps(audit, indent=2, allow_nan=False))