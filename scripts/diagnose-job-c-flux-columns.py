#!/usr/bin/env python3
"""Saved-state experiments only: never imports the worker or advances a solve."""
import ast
import importlib.util
import json
import math
import sys
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "rejection_analysis", Path(__file__).with_name("analyze-job-c-rejection.py"))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)


def pure_helpers(path, np, scipy):
    names = {"coupled_jacobian_sparsity", "coupled_cached_local_equations"}
    tree = ast.parse(path.read_text())
    nodes = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names]
    if {n.name for n in nodes} != names:
        raise a.DiagnosticRefused("MISSING_PURE_HELPERS")
    scope = {}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), scope)
    return scope


def column(np, request, solver, evaluation, cell, lam, u):
    # Stable real derivative, unlike 1-tanh(u)**2 near saturation.
    e = math.exp(-2 * abs(float(u)))
    dn = solver.bound * 4 * e / (1 + e)**2
    _, xc, xd, *_ = evaluation["details"][cell]
    total = sum(request["continuousFeedMolS"]) + sum(request["dispersedFeedMolS"])
    scale = np.minimum([max(c+d, total*1e-7) for c, d in zip(
        request["continuousFeedMolS"], request["dispersedFeedMolS"])], 1.)
    factor = lam * 6 * request["operatingHoldup"] / request["d32M"]
    factor *= math.pi * request["columnDiameterM"]**2 / 4 * 2 / 7
    result = np.zeros(189)
    result[cell*14:cell*14+7] = -factor * xc * dn / scale
    result[cell*14+7:cell*14+14] = factor * xc * dn / scale
    result[98+cell*13+7:98+cell*13+13] = (xc[:6]-xd[:6])*dn/solver.scale[:6]
    return result


def film_cancellation(np, solver, x, cell, step, fp, fm):
    """Reproduce the floating film arithmetic with no thermodynamic calls."""
    from decimal import Decimal as D, localcontext
    flows = x[:98].reshape(2, 7, 7)
    xc = flows[0, cell]/flows[0, cell].sum()
    xd = flows[1, cell]/flows[1, cell].sum()
    u = x[98+13*cell:98+13*(cell+1)]
    ic, id_, _ = solver.transform(u)
    rawc, rawd = solver.kcct*(xc-ic), solver.kdct*(id_-xd)
    jc, jd = rawc-ic*np.sum(rawc), rawd-id_*np.sum(rawd)
    up, um = float(u[12]+step), float(u[12]-step)
    nplus, nminus = solver.bound*np.tanh(up), solver.bound*np.tanh(um)
    ncp, ncm = jc+ic*nplus, jc+ic*nminus
    ndp, ndm = jd+id_*nplus, jd+id_*nminus
    rp, rm = (ncp-ndp)/solver.scale, (ncm-ndm)/solver.scale
    start = 98+13*cell+7
    if not (np.array_equal(rp[:6], fp[start:start+6])
            and np.array_equal(rm[:6], fm[start:start+6])):
        raise a.DiagnosticRefused("FROZEN_FILM_REPLAY_NOT_EXACT")
    entries = []
    with localcontext() as ctx:
        ctx.prec = 70
        for i in range(6):
            # Exact decimal arithmetic on identical binary64 operands shows the
            # derivative before nc/nd rounding and subtraction, not new physics.
            exact_change = (D(float(ic[i]))-D(float(id_[i])))*(
                D(float(nplus))-D(float(nminus)))/D(float(solver.scale[i]))
            entries.append({"component":a.COMPONENTS[i], "row":start+i,
                "ncPlus":float(ncp[i]), "ncMinus":float(ncm[i]),
                "ndPlus":float(ndp[i]), "ndMinus":float(ndm[i]),
                "ncUlp":float(abs(np.spacing(ncp[i]))),
                "ndUlp":float(abs(np.spacing(ndp[i]))),
                "binaryScaledResidualChange":float(rp[i]-rm[i]),
                "preRoundingScaledResidualChange":float(exact_change),
                "binaryDerivative":float((rp[i]-rm[i])/(up-um)),
                "preRoundingDerivative":float(exact_change/(D(up)-D(um)))})
    return {"frozenFilmResidualReplayMaxError":0.,
        "nPlus":float(nplus), "nMinus":float(nminus),
        "nDifference":float(nplus-nminus), "components":entries}


def experiment(args):
    reference = a.read_json(Path(args.reference), "REFERENCE")
    root = Path(args.runtime_root)
    for path, expected in reference["lineage"]["workerFilesSha256"].items():
        if a.sha256_file(root/path) != expected:
            raise a.DiagnosticRefused("SOURCE_HASH_MISMATCH:"+path)
    checkpoint = a.read_json(Path(args.checkpoint), "CHECKPOINT")
    value = a.selected_value(checkpoint, args.selection_id)
    if value["diagnosticCapture"]["captureSha256"] != reference["lineage"]["captureSha256"]:
        raise a.DiagnosticRefused("CAPTURE_MISMATCH")
    request = a.read_json(Path(args.request), "REQUEST")["prepared"]["workerRequest"]
    validator = a.load_module("flux_capture_validator",
        Path(__file__).with_name("replay-job-c-rejection.py"))
    value = validator._find_selected_trial(checkpoint, args.selection_id)
    expected_request_hash = validator.digest(validator.checkpoint_request_payload(request))
    if checkpoint.get("requestSha256") != expected_request_hash:
        raise a.DiagnosticRefused("CHECKPOINT_REQUEST_HASH_MISMATCH")
    _, validated_audits = validator._validate_capture(value, expected_request_hash, root)
    if len(value["coupledAttempts"]) != 1:
        raise a.DiagnosticRefused("EXPECTED_ONE_CAPTURED_ATTEMPT")
    if len({d["stateSha256"] for d in validated_audits}) != 3:
        raise a.DiagnosticRefused("EXPECTED_THREE_CAPTURED_STATES")
    artifact = Path(args.runtime_artifact_root).resolve()
    manifest = a.read_json(artifact/"predictive-nt-runtime-manifest.json", "RUNTIME_MANIFEST")
    for record in manifest["files"]:
        path = artifact/record["path"]
        if path.is_symlink() or a.sha256_file(path) != record["sha256"]:
            raise a.DiagnosticRefused("RUNTIME_FILE_HASH_MISMATCH:"+record["path"])
    sys.path.insert(0, str(artifact/"server/research/ecr-pre-pilot-cosmosac/vendor/python"))
    import numpy as np
    import scipy
    from scipy.optimize._numdiff import _compute_absolute_step, _adjust_scheme_to_bounds, group_columns
    from scipy.optimize import lsq_linear
    engine_path = artifact/"server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
    if a.sha256_file(engine_path) != reference["lineage"]["scientificEngineSha256"]:
        raise a.DiagnosticRefused("ENGINE_HASH_MISMATCH")
    em = a.load_module("flux_diagnostic_engine", engine_path)
    cm = a.load_module("flux_diagnostic_candidate", root/a.WORKER_RELATIVE_PATHS[1])
    helpers = pure_helpers(root/a.WORKER_RELATIVE_PATHS[0], np, scipy)
    mask = helpers["coupled_jacobian_sparsity"](scipy, 7).toarray().astype(bool)
    groups = group_columns(scipy.sparse.csr_matrix(mask))
    temporary, engine, _, runtime = em.build_engine(request["temperatureK"], 0.)
    lam = value["rejectedLambda"]
    if value["heightM"] != 2 or request["compartments"] != 7:
        raise a.DiagnosticRefused("UNSUPPORTED_GEOMETRY")
    try:
        residual = a.exact_residual_factory(np, engine, cm, request, lam)
        caches = [{} for _ in range(7)]
        def local(j, solver, u, xc, xd):
            return helpers["coupled_cached_local_equations"](np, solver, caches[j], u, xc, xd)
        cached = a.exact_residual_factory(np, engine, cm, request, lam, local)
        solvers = [cm.CandidateInterfaceSolver(engine, request["temperatureK"],
            request["kc"], request["kd"], request["continuousTotalConcentrationMolM3"],
            request["dispersedTotalConcentrationMolM3"], request["phaseConfiguration"])
            for _ in range(7)]
        seen = set()
        rows = []
        for d in validated_audits:
            if d["stateSha256"] in seen:
                continue
            seen.add(d["stateSha256"])
            x, J, lo, hi, scales = [np.array(d[k]) for k in
                ("state", "jacobian", "lowerBounds", "upperBounds", "variableScale")]
            ev = residual(x)
            f = ev["residual"]
            if not np.array_equal(f, d["residual"]):
                raise a.DiagnosticRefused("RESIDUAL_REPLAY_NOT_EXACT")
            h = _compute_absolute_step(None, x, f, "3-point")
            h, one_sided = _adjust_scheme_to_bounds(x, h, 1, "2-sided", lo, hi)
            original = a.ruiz_correction(np, J, f, scales)
            replacement = J.copy()
            tests = []
            for cell in (4, 5):
                k = 98+cell*13+12
                analytic = column(np, request, solvers[cell], ev, cell, lam, x[k])
                replacement[:, k] = analytic
                support = mask[:, k]
                color = np.flatnonzero(groups == groups[k])
                if any(np.any(mask[:, k] & mask[:, other]) for other in color if other != k):
                    raise a.DiagnosticRefused("COLOR_SUPPORT_COLLISION")
                if one_sided[k]:
                    raise a.DiagnosticRefused("TARGET_STENCIL_NOT_CENTRAL")
                def probe(step, colored=False, use_cache=False):
                    xp, xm = x.copy(), x.copy()
                    cols = color if colored else np.array([k])
                    offsets = h[cols] if colored else np.array([step])
                    xp[cols] += offsets
                    xm[cols] -= offsets
                    if colored:
                        side = cols[one_sided[cols]]
                        xm[side] = x[side] + h[side]
                        xp[side] = x[side] + 2*h[side]
                    if not (np.all((xp >= lo) & (xp <= hi))
                            and np.all((xm >= lo) & (xm <= hi))):
                        raise a.DiagnosticRefused("PROBE_OUTSIDE_CAPTURED_BOUNDS")
                    evaluate = cached if use_cache else residual
                    fp, fm = evaluate(xp)["residual"], evaluate(xm)["residual"]
                    deriv = (fp-fm)/(xp[k]-xm[k])
                    if colored:
                        deriv = np.where(support, deriv, 0.)
                    return deriv, fp, fm, xp[k]-xm[k]
                default, fp, fm, dx = probe(h[k])
                colored, _, _, _ = probe(h[k], True)
                cache_colored, _, _, _ = probe(h[k], True, True)
                # Repeat after cache warmup, and force exact reevaluation separately.
                repeated, _, _, _ = probe(h[k], True, True)
                sweep = []
                for step in (1e-2, 1e-3, float(h[k]), 1e-5, 1e-6, 1e-7):
                    fd, _, _, _ = probe(step)
                    sweep.append({"absoluteStep": step, "l2": float(np.linalg.norm(fd)),
                        "analyticErrorL2": float(np.linalg.norm(fd-analytic))})
                # Affine-in-n algebra, evaluated at higher precision with logits fixed:
                # isolates subtraction cancellation, not a new thermodynamic model.
                import decimal
                with decimal.localcontext() as ctx:
                    ctx.prec = 70
                    D = decimal.Decimal
                    u = D(float(x[k]))
                    half = D(float(h[k]))
                    def tanh(v):
                        t = (2*v).exp()
                        return (t-1)/(t+1)
                    secant = (tanh(u+half)-tanh(u-half))/(2*half)
                    exact_derivative = 4*(-2*abs(u)).exp()/(1+(-2*abs(u)).exp())**2
                    hp_error = float(abs(secant/exact_derivative-1))
                tests.append({"cell":cell+1, "coordinate":k, "u":float(x[k]),
                    "defaultAbsoluteStep":float(h[k]), "actualDenominator":float(dx),
                    "oneSided":bool(one_sided[k]), "colorCoordinates":color.tolist(),
                    "oneSidedColorCoordinates":color[one_sided[color]].tolist(),
                    "analyticL2":float(np.linalg.norm(analytic)),
                    "capturedL2":float(np.linalg.norm(J[:,k])),
                    "defaultL2":float(np.linalg.norm(default)),
                    "defaultCapturedMaxError":float(np.max(abs(default-J[:,k]))),
                    "coloredIndividualMaxError":float(np.max(abs(colored-default))),
                    "cachedUncachedMaxError":float(np.max(abs(cache_colored-colored))),
                    "cacheRepeatMaxError":float(np.max(abs(repeated-cache_colored))),
                    "outsideMaskIndividualMax":float(np.max(abs(default[~support]))),
                    "changedResidualRows":np.flatnonzero(fp != fm).tolist(),
                    "capturedColumn":J[:,k].tolist(), "analyticColumn":analytic.tolist(),
                    "defaultColumn":default.tolist(),
                    "filmCancellation":film_cancellation(
                        np, solvers[cell], x, cell, h[k], fp, fm),
                    "subtraction": [{"row":int(i), "plus":float(fp[i]), "minus":float(fm[i]),
                        "difference":float(fp[i]-fm[i]), "localUlp":float(abs(np.spacing(fp[i])))}
                        for i in np.flatnonzero((fp != fm) | (analytic != 0))],
                    "highPrecisionAffineSecantRelativeTruncationError":hp_error,
                    "ruizColumnScale":float(original["columnScale"][k]),
                    "ruizWeightedErrorL2":float(np.linalg.norm(
                        original["rowScale"]*(J[:,k]-analytic)*original["columnScale"][k])),
                    "sweep":sweep})
                print(f"state {len(rows)} cell {cell+1} probes complete", flush=True)
            corrected = a.ruiz_correction(np, replacement, f, scales)
            candidates = []
            def assess(name, matrix, delta):
                limit = a.correction_limiter(np, x, delta, lo, hi)
                alpha = min(1., .99*limit["maximumInteriorScale"])
                samples = []
                for multiplier in (1., .5, .25, .125):
                    t = alpha*multiplier
                    trial = x+t*delta
                    if not np.all((trial > lo) & (trial < hi)):
                        raise a.DiagnosticRefused("TRIAL_OUTSIDE_ORIGINAL_BOUNDS")
                    evaluated = residual(trial)
                    metrics_request = {**request, "_diagnosticSolvers":solvers,
                        "_diagnosticState":trial}
                    metrics = a.gate_metrics(np, evaluated, metrics_request)
                    comparisons = {
                        "rawFv":metrics["rawFvResidualMolS"] <= 1e-7,
                        "scaledFv":metrics["scaledFvResidual"] <= 1e-7,
                        "originalJobB":metrics["maximumOriginalJobBGateResidual"] <= 1e-7,
                        "strictPositivity":metrics["minimumFlowMolS"] > 0}
                    samples.append({"stepScale":float(t),
                        "stateSha256":validator.digest(trial.tolist()),
                        "predictedL2":float(np.linalg.norm(f+t*matrix@delta)),
                        "trueResidualL2":float(np.linalg.norm(evaluated["residual"])),
                        "trueResidualInf":float(np.max(abs(evaluated["residual"]))),
                        "metrics":metrics, "unchangedThresholdComparisons":comparisons,
                        "allFourResidualThresholdsPassed":all(comparisons.values()),
                        "scientificAcceptance":"NOT_ASSESSED_DIAGNOSTIC_ONLY"})
                candidates.append({"method":name, "correctionL2":float(np.linalg.norm(delta)),
                    "correction":delta.tolist(), "limiter":limit, "samples":samples})
            assess("CAPTURED_RUIZ", J, original["correction"])
            assess("ANALYTIC_CELLS_5_6_RUIZ", replacement, corrected["correction"])
            bounded_info = []
            for name, matrix in (("CAPTURED", J), ("ANALYTIC_CELLS_5_6", replacement)):
                # Bounded linear subproblem only. No nonlinear solve or continuation.
                # Original residual objective, scaled variables, original box shrunk
                # by 1% solely to keep diagnostic evaluations strictly interior.
                fit = lsq_linear(matrix*scales[None,:], -f,
                    bounds=(.99*(lo-x)/scales, .99*(hi-x)/scales),
                    method="bvls", tol=1e-14, max_iter=300)
                bounded_info.append({"matrix":name, "success":bool(fit.success),
                    "status":int(fit.status), "iterations":int(fit.nit),
                    "optimality":float(fit.optimality)})
                assess(name+"_BOUND_AWARE_LINEAR", matrix, scales*fit.x)
            row = {"stateSha256":d["stateSha256"], "residualReplayMaxError":0.,
                "capturedAuditLineage":{key:d[key] for key in (
                    "location", "residualSha256", "jacobianSha256", "payloadSha256")},
                "baseResidualL2":float(np.linalg.norm(f)), "columns":tests,
                "ranks":{"capturedRaw":original["originalRank"],
                    "capturedRuiz":original["equilibratedRank"],
                    "replacementRaw":corrected["originalRank"],
                    "replacementRuiz":corrected["equilibratedRank"]},
                "boundedLinearStatus":bounded_info, "corrections":candidates}
            rows.append(row)
            Path(args.output+".partial").write_text(json.dumps(rows, indent=2, allow_nan=False))
        report = {"schemaVersion":"JOB_C_OFFLINE_FLUX_COLUMNS_V1",
            "diagnosticOnly":True, "sourceReference":args.reference,
            "selectionId":args.selection_id,
            "referenceFileSha256":a.sha256_file(Path(args.reference)),
            "scientificEngineSha256":a.sha256_file(engine_path),
            "diagnosticSourceSha256":{str(path):a.sha256_file(path) for path in (
                Path(__file__), Path(__file__).with_name("analyze-job-c-rejection.py"),
                Path(__file__).with_name("replay-job-c-rejection.py"))},
            "captureSha256":value["diagnosticCapture"]["captureSha256"],
            "inputFileSha256":a.sha256_file(Path(args.request)),
            "checkpointFileSha256":a.sha256_file(Path(args.checkpoint)),
            "workerFilesSha256":reference["lineage"]["workerFilesSha256"],
            "runtimeManifestSha256":a.sha256_file(artifact/"predictive-nt-runtime-manifest.json"),
            "runtime":runtime, "states":rows, "noWorkerOrContinuationInvoked":True,
            "qualification":"OFFLINE_DIAGNOSTIC_ONLY_NO_DESIGN_PROMOTION"}
        report["reportSha256"] = validator.digest(report)
        return report
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    parser = a.parser()
    parser.add_argument("--reference", default="research-results/job-c-offline-rejection-analysis.json")
    args = parser.parse_args()
    report = experiment(args)
    Path(args.output).write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print("offline diagnostic complete", flush=True)