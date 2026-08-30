"""Diagnose closure of the exact seven-stage deterministic secondary starts."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "server/research/ecr-pre-pilot-cosmosac/vendor/python"))
import numpy as np
from scipy.optimize import least_squares
from scipy.optimize._numdiff import approx_derivative

MODEL_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
INPUT = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json"
COUNTERCURRENT_INPUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json"
AMENDMENT_RESULTS = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
OUT = ROOT / ".agents/outputs/task-207-seven-stage-multistart-closure"


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


model = load_module(MODEL_PATH, "task207_model")
P = json.loads((HERE / "protocol.json").read_text())
NT = P["stageCount"]
T = P["temperatureK"]
TOL = P["solverTolerances"]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_problem(record):
    cascade = record["multistartCascade"]
    source_trial = record["multistartCascadeSource"]
    feed = np.asarray(source_trial["boundaryStreams"]["oilFeed"]["componentMoles"], float)
    solvent = np.asarray(source_trial["boundaryStreams"]["freshNmp"]["componentMoles"], float)
    total = float((feed + solvent).sum())
    parameters = np.asarray(record["parameters"], float)
    start = np.asarray(cascade["secondaryStartLogFlows"], float)
    continued_start = np.asarray(cascade["task205FinalLogFlows"], float)
    primary = np.asarray(cascade["primaryLogFlows"], float)
    lo = np.log(P["bounds"]["minimumComponentMoles"])
    hi = np.log(P["bounds"]["maximumMultipleOfTotalFeed"] * total)

    def unpack(v):
        streams = np.exp(np.asarray(v).reshape(NT, 12))
        return streams[:, :6], streams[:, 6:]

    def residual(v):
        rr, ee = unpack(v)
        blocks = []
        for j in range(NT):
            rin = feed if j == 0 else rr[j - 1]
            ein = solvent if j == NT - 1 else ee[j + 1]
            x = rr[j] / rr[j].sum()
            y = ee[j] / ee[j].sum()
            balance = (rin + ein - rr[j] - ee[j]) / total
            iso = (
                np.log(x)
                + model.total_lngamma(model.FAMILIES, T, x, parameters)
                - np.log(y)
                - model.total_lngamma(model.FAMILIES, T, y, parameters)
            )
            blocks.extend(np.r_[balance, iso])
        return np.asarray(blocks)

    pattern = model.base.scipy.sparse.lil_matrix((12 * NT, 12 * NT), dtype=int)
    for j in range(NT):
        rows = slice(12 * j, 12 * (j + 1))
        pattern[rows, 12 * j:12 * (j + 1)] = 1
        if j > 0:
            pattern[rows, 12 * (j - 1):12 * (j - 1) + 6] = 1
        if j < NT - 1:
            pattern[rows, 12 * (j + 1) + 6:12 * (j + 2)] = 1
    return residual, unpack, start, continued_start, primary, lo, hi, pattern.tocsr()


def finite_difference_jacobian(residual, vector):
    return np.asarray(approx_derivative(
        residual, vector, method=P["jacobian"]["finiteDifferenceMethod"],
        rel_step=P["jacobian"]["finiteDifferenceRelativeStep"],
    ))


def jacobian_diagnostic(residual, vector, lo, hi, jac=None):
    if jac is None:
        jac = finite_difference_jacobian(residual, vector)
    singular = np.linalg.svd(jac, compute_uv=False)
    threshold = P["jacobian"]["rankRelativeTolerance"] * singular[0]
    rank = int(np.count_nonzero(singular > threshold))
    row_norm = np.linalg.norm(jac, axis=1)
    column_norm = np.linalg.norm(jac, axis=0)
    balance_rows = np.concatenate([
        np.arange(12 * j, 12 * j + 6) for j in range(NT)
    ])
    iso_rows = np.concatenate([
        np.arange(12 * j + 6, 12 * j + 12) for j in range(NT)
    ])
    distance = P["jacobian"]["activeBoundLogDistance"]
    lower = np.flatnonzero(vector - lo <= distance).tolist()
    upper = np.flatnonzero(hi - vector <= distance).tolist()
    return {
        "shape": list(jac.shape),
        "numericalRank": rank,
        "rankTolerance": float(threshold),
        "rankDeficiency": int(jac.shape[1] - rank),
        "largestSingularValue": float(singular[0]),
        "smallestSingularValue": float(singular[-1]),
        "conditionNumber": float(singular[0] / singular[-1]) if singular[-1] > 0 else None,
        "singularValues": singular.tolist(),
        "scaling": {
            "rowNormMinimum": float(row_norm.min()),
            "rowNormMaximum": float(row_norm.max()),
            "rowNormRatio": float(row_norm.max() / row_norm.min()),
            "balanceRowNormMinimum": float(row_norm[balance_rows].min()),
            "balanceRowNormMaximum": float(row_norm[balance_rows].max()),
            "isoactivityRowNormMinimum": float(row_norm[iso_rows].min()),
            "isoactivityRowNormMaximum": float(row_norm[iso_rows].max()),
            "columnNormMinimum": float(column_norm.min()),
            "columnNormMaximum": float(column_norm.max()),
            "columnNormRatio": float(column_norm.max() / column_norm.min()),
        },
        "activeBounds": {
            "lowerVariableIndices": lower,
            "upperVariableIndices": upper,
            "count": len(lower) + len(upper),
        },
    }


def summarize(label, solution, residual, unpack, primary, strategy):
    f = residual(solution.x)
    rr, ee = unpack(solution.x)
    pr, pe = unpack(primary)
    product_difference = max(
        np.max(np.abs(rr[-1] - pr[-1])) / max(pr[-1].sum(), 1e-30),
        np.max(np.abs(ee[0] - pe[0])) / max(pe[0].sum(), 1e-30),
    )
    maximum = float(np.max(np.abs(f)))
    closed = bool(maximum <= P["equationAcceptanceLimit"])
    if closed and product_difference <= P["branchProductRelativeTolerance"]:
        classification = "PRIMARY_BRANCH"
    elif closed:
        classification = "DISTINCT_CLOSED_BRANCH"
    else:
        classification = "UNCLOSED"
    matrix = f.reshape(NT, 12)
    return {
        "run": label,
        "strategy": strategy,
        "solverSuccess": bool(solution.success),
        "solverStatus": int(solution.status),
        "solverMessage": str(solution.message),
        "functionEvaluations": int(getattr(solution, "nfev", 0)),
        "maximumResidual": maximum,
        "rmsResidual": float(np.sqrt(np.mean(f * f))),
        "scaledComponentBalanceMaximum": float(np.max(np.abs(matrix[:, :6]))),
        "isoactivityMaximum": float(np.max(np.abs(matrix[:, 6:]))),
        "productDifferenceFromPrimary": float(product_difference),
        "closed": closed,
        "classification": classification,
        "logFlowVariables": np.asarray(solution.x).tolist(),
        "byStage": [{
            "stageFromFeedEnd": j + 1,
            "balanceMaximum": float(np.max(np.abs(matrix[j, :6]))),
            "isoactivityMaximum": float(np.max(np.abs(matrix[j, 6:]))),
        } for j in range(NT)],
    }


class Stored:
    def __init__(self, x, message):
        self.x = np.asarray(x)
        self.success = True
        self.status = 0
        self.message = message
        self.nfev = 0


class Inherited(Stored):
    def __init__(self, row):
        super().__init__(row["logFlowVariables"], row["message"])
        self.success = bool(row["solverSuccess"])
        self.status = int(row["status"])
        self.nfev = int(row["nfev"])


def row_equilibrated_newton(residual, start, lo, hi):
    """Damped Newton with row equilibration; acceptance uses raw residuals."""
    vector = np.asarray(start).copy()
    nfev = 0
    trace = []
    final_jacobian = None
    cfg = P["strategies"]["rowEquilibratedDampedNewton"]
    for iteration in range(cfg["maximumIterations"]):
        f = residual(vector)
        nfev += 1
        maximum = float(np.max(np.abs(f)))
        if maximum <= P["equationAcceptanceLimit"]:
            break
        jac = finite_difference_jacobian(residual, vector)
        nfev += 85
        final_jacobian = jac
        row_norm = np.maximum(np.linalg.norm(jac, axis=1), 1e-14)
        scaled_f = f / row_norm
        scaled_jac = jac / row_norm[:, None]
        step, _, rank, singular = np.linalg.lstsq(
            scaled_jac, -scaled_f, rcond=P["jacobian"]["rankRelativeTolerance"]
        )
        objective = float(np.linalg.norm(scaled_f))
        accepted = False
        alpha = 1.0
        for backtrack in range(cfg["maximumBacktracks"]):
            candidate = vector + alpha * step
            if np.any(candidate <= lo) or np.any(candidate >= hi):
                alpha *= 0.5
                continue
            candidate_f = residual(candidate)
            nfev += 1
            candidate_objective = float(np.linalg.norm(candidate_f / row_norm))
            if candidate_objective < objective:
                vector = candidate
                accepted = True
                break
            alpha *= 0.5
        trace.append({
            "iteration": iteration + 1,
            "rawMaximumResidualBefore": maximum,
            "rowEquilibratedL2Before": objective,
            "linearizedRank": int(rank),
            "linearizedConditionNumber": float(singular[0] / singular[-1]),
            "accepted": accepted,
            "stepLength": alpha if accepted else 0.0,
            "backtracks": backtrack if accepted else cfg["maximumBacktracks"],
        })
        if not accepted:
            break
    final_f = residual(vector)
    nfev += 1
    # Structural metrics must describe the exact reported endpoint, not the
    # linearization immediately before the final accepted Newton step.
    final_jacobian = finite_difference_jacobian(residual, vector)
    nfev += 85
    solution = Stored(vector, (
        "raw residual closure reached"
        if np.max(np.abs(final_f)) <= P["equationAcceptanceLimit"]
        else "row-equilibrated damped Newton stopped without raw residual closure"
    ))
    solution.success = bool(np.max(np.abs(final_f)) <= P["equationAcceptanceLimit"])
    solution.status = 1 if solution.success else 0
    solution.nfev = nfev
    return solution, trace, final_jacobian


def diagnose(record):
    residual, unpack, start, continued_start, primary, lo, hi, pattern = make_problem(record)
    runs = []
    runs.append(summarize(
        "persisted-primary", Stored(primary, "immutable primary reconstruction"),
        residual, unpack, primary, "REFERENCE",
    ))
    runs.append(summarize(
        "exact-secondary-start", Stored(start, "exact deterministic start"),
        residual, unpack, primary, "REFERENCE",
    ))
    for inherited in record["multistartCascade"]["runs"][1:]:
        is_dense = "dense-final" in inherited["run"]
        row = summarize(
            f'task-205-{inherited["run"]}',
            Inherited(inherited),
            residual, unpack, primary,
            "INHERITED_DENSE_EXACT_TRUST_REGION" if is_dense
            else "INHERITED_BOUNDED_SPARSE_TRUST_REGION_CONTINUATION",
        )
        row["functionEvaluations"] = int(inherited["nfev"])
        if "cumulativeFunctionEvaluations" in inherited:
            row["cumulativeFunctionEvaluations"] = int(inherited["cumulativeFunctionEvaluations"])
        runs.append(row)
    task205_final = runs[-1]
    jacobians = {
        "task205FinalPoint": jacobian_diagnostic(residual, continued_start, lo, hi),
    }

    newton, newton_trace, newton_jacobian = row_equilibrated_newton(
        residual, continued_start, lo, hi
    )
    newton_row = summarize(
        "row-equilibrated-damped-newton", newton, residual, unpack, primary,
        "BOUNDED_ROW_EQUILIBRATED_DAMPED_NEWTON",
    )
    newton_row["iterationTrace"] = newton_trace
    runs.append(newton_row)
    best = min(runs[2:], key=lambda row: row["maximumResidual"])
    best_vector = np.asarray(best["logFlowVariables"])
    jacobians["bestDiagnosticResult"] = jacobian_diagnostic(
        residual, best_vector, lo, hi,
        newton_jacobian if best["run"] == "row-equilibrated-damped-newton" else None,
    )
    if best["classification"] == "PRIMARY_BRANCH":
        disposition = "REACHED_PRIMARY_BRANCH"
        reason = "At least one unchanged-equation strategy closed and matched the persisted primary boundary products."
    elif best["classification"] == "DISTINCT_CLOSED_BRANCH":
        disposition = "REACHED_DISTINCT_CLOSED_BRANCH"
        reason = "At least one unchanged-equation strategy closed but its boundary products differ from the primary branch."
    else:
        jd = jacobians["bestDiagnosticResult"]
        if jd["rankDeficiency"] or jd["activeBounds"]["count"]:
            disposition = "DIAGNOSED_LOCAL_LINEARIZATION_OBSTRUCTION"
            reason = "All strategies remained unclosed and the final local Jacobian is rank-deficient or constrained by an active bound; this does not prove global infeasibility."
        else:
            disposition = "UNRESOLVED_NUMERICAL_NONCLOSURE"
            reason = "All strategies remained unclosed without a rank or active-bound obstruction; conditioning and scaling are reported but do not prove impossibility."
    return {
        "scenario": record["scenario"],
        "runs": runs,
        "jacobianDiagnostics": jacobians,
        "disposition": disposition,
        "reason": reason,
    }


def main():
    source = json.loads(INPUT.read_text())
    fit = json.loads(AMENDMENT_RESULTS.read_text())
    pmap = fit["model"]["parameters"]
    parameters = [pmap[name] for name in model.PARAMETER_NAMES]
    enriched = []
    for record in source["scenarios"]:
        copy = dict(record)
        cascade = copy["multistartCascade"]
        copy["multistartCascadeSource"] = next(
            scenario["trial"]
            for scenario in json.loads(COUNTERCURRENT_INPUT.read_text())["scenarios"]
            if scenario["name"] == copy["scenario"]
        )
        copy["parameters"] = parameters
        first = cascade["runs"][0]
        cascade["primaryLogFlows"] = first["logFlowVariables"]
        cascade["task205FinalLogFlows"] = cascade["runs"][-1]["logFlowVariables"]
        cascade["secondaryStartLogFlows"] = np.asarray(cascade["runs"][1]["logFlowVariables"]).tolist()
        # Task 205's first continuation result is not the initial vector. Rebuild
        # the exact start from its persisted definition and immutable feed total.
        trial = copy["multistartCascadeSource"]
        total = sum(trial["boundaryStreams"]["oilFeed"]["componentMoles"]) + sum(
            trial["boundaryStreams"]["freshNmp"]["componentMoles"]
        )
        seed_r = np.asarray([.80839275, .04805118, .02223209, .00732792, .00245580, .11154027])
        seed_e = np.asarray([.03166653, .03270623, .01640959, .00607406, .00377994, .90936365])
        base = np.log(np.tile(np.r_[total * (1 - .614761) * seed_r, total * .614761 * seed_e], NT))
        cascade["secondaryStartLogFlows"] = (
            base + np.tile(np.linspace(-.015, .015, 12), NT)
        ).tolist()
        enriched.append(copy)

    outcomes = []
    for record in enriched:
        print(json.dumps({"status": "RUNNING", "scenario": record["scenario"]}), flush=True)
        outcomes.append(diagnose(record))
    results = {
        "schemaVersion": "1.0.0",
        "analysis": P["analysis"],
        "governance": P["governance"],
        "immutableInputSha256": sha(INPUT),
        "countercurrentInputSha256": sha(COUNTERCURRENT_INPUT),
        "amendmentResultsSha256": sha(AMENDMENT_RESULTS),
        "protocolSha256": sha(HERE / "protocol.json"),
        "modelSha256": sha(MODEL_PATH),
        "equations": "Unchanged: per stage, six total-feed-scaled component balances followed by six log-isoactivity equations in log-flow variables.",
        "scenarios": outcomes,
        "synthesis": {
            "dispositions": {row["scenario"]: row["disposition"] for row in outcomes},
            "phaseStabilityRelationship": "NOT_TESTED_NO_CAUSAL_LINK_CLAIMED",
            "officialConclusion": "UNCHANGED",
        },
    }
    OUT.mkdir(parents=True, exist_ok=True)
    result_path = OUT / "results.json"
    result_path.write_text(json.dumps(results, indent=2) + "\n")
    lines = [
        "# Seven-stage multistart closure diagnosis", "",
        "**Research-only; governed equations, limits, and official stage conclusions are unchanged.**", "",
        "| Scenario | Best strategy | max residual | balance max | isoactivity max | product difference | disposition |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for row in outcomes:
        best = min(row["runs"][2:], key=lambda run: run["maximumResidual"])
        lines.append(
            f'| {row["scenario"]} | {best["strategy"]} | {best["maximumResidual"]:.6g} | '
            f'{best["scaledComponentBalanceMaximum"]:.6g} | {best["isoactivityMaximum"]:.6g} | '
            f'{best["productDifferenceFromPrimary"]:.6g} | {row["disposition"]} |'
        )
    lines += ["", "## Structural diagnostics", ""]
    for row in outcomes:
        j = row["jacobianDiagnostics"]["bestDiagnosticResult"]
        lines += [
            f'### {row["scenario"]}',
            f'- Numerical rank: {j["numericalRank"]}/{j["shape"][1]} (relative threshold {P["jacobian"]["rankRelativeTolerance"]:.1e}).',
            f'- Condition number: {j["conditionNumber"]:.6g}.',
            f'- Row-norm ratio: {j["scaling"]["rowNormRatio"]:.6g}; column-norm ratio: {j["scaling"]["columnNormRatio"]:.6g}.',
            f'- Active bounds: {j["activeBounds"]["count"]}.',
            f'- Disposition: **{row["disposition"]}** — {row["reason"]}',
            "",
        ]
    lines += [
        "Sparse continuation, the inherited dense exact trust-region run, and row-equilibrated damped Newton all evaluate the identical residual function.",
        "A rank-deficient endpoint Jacobian or active bound is reported only as a local linearization obstruction, never as proof of global infeasibility; poor conditioning alone is reported without claiming impossibility.",
        "Phase stability is outside this audit and no causal relationship is asserted.",
    ]
    (OUT / "report.md").write_text("\n".join(lines) + "\n")
    manifest = {
        "runnerSha256": sha(HERE / "run.py"),
        "protocolSha256": sha(HERE / "protocol.json"),
        "inputSha256": sha(INPUT),
        "countercurrentInputSha256": sha(COUNTERCURRENT_INPUT),
        "amendmentResultsSha256": sha(AMENDMENT_RESULTS),
        "resultsSha256": sha(result_path),
        "reportSha256": sha(OUT / "report.md"),
    }
    (OUT / "provenance-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"status": "PASS", "dispositions": results["synthesis"]["dispositions"]}))


if __name__ == "__main__":
    main()