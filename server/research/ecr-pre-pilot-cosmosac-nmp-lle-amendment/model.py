"""Evidence-fitted excess-Gibbs amendment to the pinned COSMO-SAC kernel."""
from __future__ import annotations

import importlib.util
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BASE_PATH = ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py"
_spec = importlib.util.spec_from_file_location("pinned_cosmosac", BASE_PATH)
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

import numpy as np
from scipy.optimize import least_squares, minimize

FAMILIES = tuple(base.FAMILIES)
PAIRS = ((0, 1), (0, 5), (1, 5))  # SAT-MONO, SAT-NMP, MONO-NMP
PARAMETER_NAMES = (
    "A_SAT_MONO_ref", "A_SAT_MONO_temperature", "A_SAT_MONO_asymmetry",
    "A_SAT_NMP_ref", "A_SAT_NMP_temperature", "A_SAT_NMP_asymmetry",
    "A_MONO_NMP_ref", "A_MONO_NMP_temperature", "A_MONO_NMP_asymmetry",
)
T_REF_K = 313.15
T_SCALE_K = 20.0


def normalize(x, floor=1e-12):
    v = np.maximum(np.asarray(x, dtype=float), floor)
    return v / v.sum()


def residual_feature_matrix(x, temperature_k, component_count=6):
    """Linear features for ln(gamma) from q=sum(Aij*x_i*x_j)."""
    x = normalize(x)
    tau = (float(temperature_k) - T_REF_K) / T_SCALE_K
    q_features = np.zeros(9)
    gradient_features = np.zeros((component_count, 9))
    for pair_index, (i, j) in enumerate(PAIRS):
        for offset, factor in ((0, 1.0), (1, tau)):
            column = 3 * pair_index + offset
            q_features[column] = x[i] * x[j] * factor
            gradient_features[i, column] += x[j] * factor
            gradient_features[j, column] += x[i] * factor
        column = 3 * pair_index + 2
        q_features[column] = x[i] * x[j] * (x[i] - x[j])
        gradient_features[i, column] = 2 * x[i] * x[j] - x[j] ** 2
        gradient_features[j, column] = x[i] ** 2 - 2 * x[i] * x[j]
    degrees = np.array([2, 2, 3] * 3)
    return gradient_features + (1.0 - degrees) * q_features


def residual_g_over_rt(x, temperature_k, parameters):
    x = normalize(x)
    tau = (float(temperature_k) - T_REF_K) / T_SCALE_K
    p = np.asarray(parameters, dtype=float)
    return float(
        x[0] * x[1] * (p[0] + p[1] * tau + p[2] * (x[0] - x[1]))
        + x[0] * x[5] * (p[3] + p[4] * tau + p[5] * (x[0] - x[5]))
        + x[1] * x[5] * (p[6] + p[7] * tau + p[8] * (x[1] - x[5]))
    )


def residual_lngamma(x, temperature_k, parameters):
    return residual_feature_matrix(x, temperature_k) @ np.asarray(parameters)


def total_lngamma(names, temperature_k, x, parameters):
    return (
        base.lngamma(names, temperature_k, x)
        + residual_lngamma(x, temperature_k, parameters)
    )


def tangent_stability(names, temperature_k, composition, parameters, protocol):
    """Full simplex-tangent Hessian from two independent derivative routes."""
    composition = normalize(composition)
    dimensions = len(composition) - 1
    logits = np.log(composition[:-1] / composition[-1])
    tangent = np.empty((len(composition), dimensions))
    for i in range(len(composition)):
        for j in range(dimensions):
            tangent[i, j] = composition[i] * (
                (1.0 if i == j else 0.0) - composition[j]
            )
    steps = (1e-3, 5e-4, 2.5e-4)
    reference_mu = (
        np.log(composition)
        + total_lngamma(names, temperature_k, composition, parameters)
    )

    def local_tpd(log_ratio):
        value = base.softmax(log_ratio)
        return float(np.sum(value * (
            np.log(value)
            + total_lngamma(names, temperature_k, value, parameters)
            - reference_mu
        )))

    def free_energy_hessian(step):
        center = local_tpd(logits)
        hessian = np.zeros((dimensions, dimensions))
        for i in range(dimensions):
            di = step * np.eye(dimensions)[i]
            hessian[i, i] = (
                local_tpd(logits + di)
                - 2 * center
                + local_tpd(logits - di)
            ) / step ** 2
            for j in range(i):
                dj = step * np.eye(dimensions)[j]
                value = (
                    local_tpd(logits + di + dj)
                    - local_tpd(logits + di - dj)
                    - local_tpd(logits - di + dj)
                    + local_tpd(logits - di - dj)
                ) / (4 * step ** 2)
                hessian[i, j] = hessian[j, i] = value
        return hessian

    def chemical_potential(value):
        return np.log(value) + total_lngamma(
            names, temperature_k, value, parameters
        )

    def chemical_potential_hessian(step):
        jacobian_times_tangent = np.zeros((len(composition), dimensions))
        for j in range(dimensions):
            delta = step * np.eye(dimensions)[j]
            jacobian_times_tangent[:, j] = (
                chemical_potential(base.softmax(logits + delta))
                - chemical_potential(base.softmax(logits - delta))
            ) / (2 * step)
        projected = tangent.T @ jacobian_times_tangent
        return 0.5 * (projected + projected.T)

    convergence = []
    for step in steps:
        direct = free_energy_hessian(step)
        reconstructed = chemical_potential_hessian(step)
        convergence.append({
            "stepLogRatio": step,
            "freeEnergyDifferenceEigenvalues": np.linalg.eigvalsh(direct).tolist(),
            "chemicalPotentialJacobianEigenvalues": np.linalg.eigvalsh(reconstructed).tolist(),
            "maximumMatrixDifference": float(np.max(np.abs(direct - reconstructed))),
        })
    direct_eigenvalues = np.asarray(
        convergence[-1]["freeEnergyDifferenceEigenvalues"]
    )
    reconstructed_eigenvalues = np.asarray(
        convergence[-1]["chemicalPotentialJacobianEigenvalues"]
    )
    gates = protocol["numericalAcceptance"]
    absolute_tolerance = gates["hessianEigenvalueAbsoluteTolerance"]
    relative_tolerance = gates["hessianEigenvalueRelativeTolerance"]

    def spectra_agree(left, right):
        left = np.asarray(left)
        right = np.asarray(right)
        allowed = absolute_tolerance + relative_tolerance * np.maximum(
            np.abs(left), np.abs(right)
        )
        return bool(np.all(np.abs(left - right) <= allowed))

    previous = convergence[-2]
    direct_step_converged = spectra_agree(
        previous["freeEnergyDifferenceEigenvalues"], direct_eigenvalues
    )
    reconstructed_step_converged = spectra_agree(
        previous["chemicalPotentialJacobianEigenvalues"],
        reconstructed_eigenvalues,
    )
    maximum_modewise_relative_difference = float(np.max(
        np.abs(direct_eigenvalues - reconstructed_eigenvalues)
        / np.maximum(
            absolute_tolerance,
            np.maximum(np.abs(direct_eigenvalues), np.abs(reconstructed_eigenvalues)),
        )
    ))
    return {
        "dimension": dimensions,
        "coordinate": "five independent log mole-fraction ratios ln(x_i/x_6)",
        "tangentBasis": tangent.tolist(),
        "stepSizeConvergence": convergence,
        "selectedStepLogRatio": steps[-1],
        "freeEnergyDifferenceEigenvalues": direct_eigenvalues.tolist(),
        "chemicalPotentialJacobianEigenvalues": reconstructed_eigenvalues.tolist(),
        "minimumEigenvalue": float(min(direct_eigenvalues[0], reconstructed_eigenvalues[0])),
        "maximumModewiseRelativeEigenvalueDifference": maximum_modewise_relative_difference,
        "independentReconstructionsAgree": spectra_agree(
            direct_eigenvalues, reconstructed_eigenvalues
        ),
        "freeEnergyStepSizeConverged": direct_step_converged,
        "chemicalPotentialStepSizeConverged": reconstructed_step_converged,
        "stepSizeConverged": bool(
            direct_step_converged and reconstructed_step_converged
        ),
    }


def _row_equilibrium(parameters, row):
    names = ("SAT", "MONO", "NMP")
    xr3 = normalize([row["raffinate"][n] for n in names])
    xe3 = normalize([row["extract"][n] for n in names])
    # Embed the ternary evidence in the six-family feature definition.
    xr = np.array([xr3[0], xr3[1], 0.0, 0.0, 0.0, xr3[2]])
    xe = np.array([xe3[0], xe3[1], 0.0, 0.0, 0.0, xe3[2]])
    br = base.lngamma(names, row["T_K"], xr3)
    be = base.lngamma(names, row["T_K"], xe3)
    cr = residual_lngamma(xr, row["T_K"], parameters)[[0, 1, 5]]
    ce = residual_lngamma(xe, row["T_K"], parameters)[[0, 1, 5]]
    values = np.log(xr3) + br + cr - np.log(xe3) - be - ce
    return values[np.logical_and(xr3 > 1e-9, xe3 > 1e-9)]


def fit_parameters(rows, protocol):
    partition = protocol["evidencePartition"]
    held_temperature = float(partition["heldOutTemperatureK"])
    held_system = tuple(partition["heldOutMolecularSystem"])
    train, temp_holdout, system_holdout = [], [], []
    for row in rows:
        system = (row["components"]["SAT"], row["components"]["MONO"])
        if system == held_system:
            system_holdout.append(row)
        elif abs(float(row["T_K"]) - held_temperature) < 1e-9:
            temp_holdout.append(row)
        else:
            train.append(row)

    ridge = float(protocol["fit"]["ridgePenalty"])

    def objective(p):
        observed = np.concatenate([_row_equilibrium(p, row) for row in train])
        return np.r_[observed, math.sqrt(ridge) * np.asarray(p)]

    bounds = float(protocol["fit"]["absoluteParameterBound"])
    fit = least_squares(
        objective,
        np.zeros(9),
        bounds=(-bounds, bounds),
        xtol=1e-13,
        ftol=1e-13,
        gtol=1e-13,
        max_nfev=5000,
    )
    if not fit.success:
        raise RuntimeError(f"residual fit did not converge: {fit.message}")
    return fit.x, {
        "training": train,
        "heldOutTemperature": temp_holdout,
        "heldOutMolecularSystem": system_holdout,
        "fitDiagnostics": {
            "success": bool(fit.success),
            "cost": float(fit.cost),
            "optimality": float(fit.optimality),
            "activeMask": fit.active_mask.tolist(),
        },
    }


def validation_metrics(parameters, rows):
    if not rows:
        return {"rows": 0, "activityEqualityRms": None, "compositionRmsd": None}
    activity, composition = [], []
    for row in rows:
        activity.extend(_row_equilibrium(parameters, row).tolist())
        names = ("SAT", "MONO", "NMP")
        xr3 = normalize([row["raffinate"][n] for n in names])
        xe3 = normalize([row["extract"][n] for n in names])
        xr = np.array([xr3[0], xr3[1], 0.0, 0.0, 0.0, xr3[2]])
        br = base.lngamma(names, row["T_K"], xr3)
        cr = residual_lngamma(xr, row["T_K"], parameters)[[0, 1, 5]]
        # At equilibrium y_i is proportional to x_i*gamma_i(x)/gamma_i(y).
        # Solve this implicit relation by fixed point solely for validation.
        y = xe3.copy()
        for _ in range(100):
            y6 = np.array([y[0], y[1], 0.0, 0.0, 0.0, y[2]])
            be = base.lngamma(names, row["T_K"], y)
            ce = residual_lngamma(y6, row["T_K"], parameters)[[0, 1, 5]]
            nxt = normalize(xr3 * np.exp(br + cr - be - ce))
            if max(abs(nxt - y)) < 1e-12:
                break
            y = 0.5 * y + 0.5 * nxt
        composition.extend((y - xe3).tolist())
    return {
        "rows": len(rows),
        "activityEqualityRms": float(np.sqrt(np.mean(np.square(activity)))),
        "compositionRmsd": float(np.sqrt(np.mean(np.square(composition)))),
    }


def tpd_search(
    names, temperature_k, z, parameters, protocol,
    include_local_seeds=True, refine_best_global_and_local=False,
):
    z = normalize(z)
    gz = total_lngamma(names, temperature_k, z, parameters)

    def tpd(w):
        w = normalize(w)
        return float(np.sum(w * (
            np.log(w) + total_lngamma(names, temperature_k, w, parameters)
            - np.log(z) - gz
        )))

    denominator = 4
    grid = []

    def enumerate_simplex(left, dimensions, prefix):
        if dimensions == 1:
            grid.append(normalize(prefix + [left]))
            return
        for count in range(left + 1):
            enumerate_simplex(left - count, dimensions - 1, prefix + [count])

    enumerate_simplex(denominator, len(z), [])
    coarse = sorted(((tpd(w), w) for w in grid), key=lambda item: item[0])
    # Governed deterministic refinements include both remote full-simplex
    # searches and explicit perturbations around the tested phase. Remote
    # lattice seeds alone can miss a negative-curvature basin local to z.
    global_seeds = [w for _, w in coarse[:6]] + [z]
    local_seeds = []
    local_step = 1e-3
    if include_local_seeds:
        logits = np.log(z[:-1] / z[-1])
        for direction in np.eye(len(z) - 1):
            local_seeds.extend([
                base.softmax(logits + local_step * direction),
                base.softmax(logits - local_step * direction),
            ])
    seeds = global_seeds + local_seeds
    seed_evaluations = [
        {
            "seedClass": (
                "GLOBAL_SIMPLEX"
                if index < len(global_seeds) - 1
                else (
                    "REFERENCE_PHASE"
                    if index == len(global_seeds) - 1
                    else "PHASE_LOCAL_LOG_RATIO_PERTURBATION"
                )
            ),
            "value": float(tpd(seed)),
            "composition": seed.tolist(),
        }
        for index, seed in enumerate(seeds)
    ]
    ordered_evaluations = sorted(seed_evaluations, key=lambda item: item["value"])
    refinement_seeds = ordered_evaluations
    if refine_best_global_and_local:
        refinement_seeds = [
            min(
                (item for item in seed_evaluations if item["seedClass"] == seed_class),
                key=lambda item: item["value"],
            )
            for seed_class in (
                "GLOBAL_SIMPLEX",
                "PHASE_LOCAL_LOG_RATIO_PERTURBATION",
            )
        ]
    refined = []
    for seed_evaluation in refinement_seeds:
        seed = np.asarray(seed_evaluation["composition"])
        y0 = np.log(normalize(seed)[:-1] / normalize(seed)[-1])
        sol = minimize(
            lambda y: tpd(base.softmax(y)),
            y0,
            method="BFGS",
            options={"gtol": 1e-8, "maxiter": 500},
        )
        w = base.softmax(sol.x)
        refined.append({
            "seedClass": seed_evaluation["seedClass"],
            "value": float(tpd(w)),
            "composition": w.tolist(),
            "success": bool(sol.success or np.max(np.abs(sol.jac)) <= 5e-6),
            "gradientInfinityNorm": float(np.max(np.abs(sol.jac))),
        })
    best = min(refined + seed_evaluations, key=lambda item: item["value"])
    threshold = protocol["numericalAcceptance"]["negativeTpdThreshold"]
    return {
        "minimum": best["value"],
        "gridDenominator": denominator,
        "gridPointCount": len(grid),
        "coarseMinimum": float(coarse[0][0]),
        "minimizingComposition": best["composition"],
        "verdict": "UNSTABLE_NEGATIVE_TPD" if best["value"] < threshold else "STABLE_NO_NEGATIVE_TPD",
        "seedCount": len(seeds),
        "seedEvaluations": seed_evaluations,
        "refinementSeedCount": len(refinement_seeds),
        "seedScanMinimum": ordered_evaluations[0]["value"],
        "seedClasses": {
            "globalSimplexAndReference": len(global_seeds),
            "phaseLocalLogRatioPerturbations": len(local_seeds),
            "localPerturbationStep": local_step if include_local_seeds else None,
        },
        "allRefinementsAccepted": all(item["success"] for item in refined),
        "refinements": refined,
    }


def flash(names, temperature_k, z, parameters, protocol):
    z = normalize(z)
    eps = 1e-10

    def phase_g(x):
        x = normalize(x)
        return float(np.sum(x * (np.log(x) + total_lngamma(names, temperature_k, x, parameters))))

    homogeneous = phase_g(z)
    tpd = tpd_search(names, temperature_k, z, parameters, protocol)
    w = normalize(tpd["minimizingComposition"])
    starts = [
        np.clip(0.5 * w, eps, z - eps),
        np.clip(0.25 * w, eps, z - eps),
        np.clip(0.75 * w, eps, z - eps),
        np.clip(0.5 * z, eps, z - eps),
    ]

    def objective(ne):
        beta = float(np.sum(ne))
        nr = z - ne
        if beta <= eps or beta >= 1.0 - eps:
            return 1e4
        return beta * phase_g(ne / beta) + (1.0 - beta) * phase_g(nr / (1.0 - beta))

    solutions = []
    for start in starts:
        sol = minimize(
            objective,
            start,
            method="L-BFGS-B",
            bounds=[(eps, float(zi - eps)) for zi in z],
            options={"ftol": 1e-14, "gtol": 1e-9, "maxiter": 1000, "maxls": 40},
        )
        solutions.append(sol)
    best = min(solutions, key=lambda sol: sol.fun)
    ne = best.x
    beta0 = float(np.sum(ne))
    extract0 = normalize(ne / beta0)
    raffinate0 = normalize((z - ne) / (1.0 - beta0))

    def unpack(v):
        r = base.softmax(v[:5])
        e = base.softmax(v[5:10])
        b = 1.0 / (1.0 + np.exp(-v[10]))
        return r, e, b

    def equilibrium_residual(v):
        r, e, b = unpack(v)
        mu_r = np.log(r) + total_lngamma(names, temperature_k, r, parameters)
        mu_e = np.log(e) + total_lngamma(names, temperature_k, e, parameters)
        balance = ((1.0 - b) * r + b * e - z)[:5]
        return np.r_[mu_r - mu_e, balance]

    polish0 = np.r_[
        np.log(raffinate0[:-1] / raffinate0[-1]),
        np.log(extract0[:-1] / extract0[-1]),
        math.log(beta0 / (1.0 - beta0)),
    ]
    polished = least_squares(
        equilibrium_residual, polish0, xtol=1e-13, ftol=1e-13, gtol=1e-13,
        max_nfev=5000,
    )
    raffinate, extract, beta = unpack(polished.x)
    if raffinate[5] > extract[5]:
        raffinate, extract, beta = extract, raffinate, 1.0 - beta
    mu_r = np.log(raffinate) + total_lngamma(names, temperature_k, raffinate, parameters)
    mu_e = np.log(extract) + total_lngamma(names, temperature_k, extract, parameters)
    isoactivity = float(np.max(np.abs(mu_r - mu_e)))
    improvement = homogeneous - float(best.fun)
    balance = float(np.max(np.abs(z - ((1.0 - beta) * raffinate + beta * extract))))
    separation = float(np.max(np.abs(extract - raffinate)))
    post_r = tpd_search(
        names, temperature_k, raffinate, parameters, protocol,
        refine_best_global_and_local=True,
    )
    post_e = tpd_search(
        names, temperature_k, extract, parameters, protocol,
        refine_best_global_and_local=True,
    )
    stability_r = tangent_stability(
        names, temperature_k, raffinate, parameters, protocol
    )
    stability_e = tangent_stability(
        names, temperature_k, extract, parameters, protocol
    )
    gates = protocol["numericalAcceptance"]
    accepted = bool(
        tpd["minimum"] < gates["negativeTpdThreshold"]
        and improvement > gates["minimumGibbsReduction"]
        and isoactivity <= gates["maximumIsoactivityLogResidual"]
        and balance <= gates["maximumMaterialBalanceResidual"]
        and separation >= gates["minimumPhaseCompositionSeparation"]
        and np.all(raffinate > eps) and np.all(extract > eps)
        and post_r["minimum"] >= gates["postSplitTpdThreshold"]
        and post_e["minimum"] >= gates["postSplitTpdThreshold"]
        and stability_r["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
        and stability_e["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
        and stability_r["independentReconstructionsAgree"]
        and stability_e["independentReconstructionsAgree"]
        and stability_r["stepSizeConverged"]
        and stability_e["stepSizeConverged"]
        and tpd["allRefinementsAccepted"]
        and post_r["allRefinementsAccepted"]
        and post_e["allRefinementsAccepted"]
        and best.success and polished.success
    )
    return {
        "accepted": accepted,
        "optimizerSuccess": bool(best.success),
        "optimizerMessage": str(best.message),
        "equilibriumPolishSuccess": bool(polished.success),
        "equilibriumPolishResidual": float(np.max(np.abs(polished.fun))),
        "raffinate": raffinate.tolist(),
        "extract": extract.tolist(),
        "betaExtract": beta,
        "K": (extract / raffinate).tolist(),
        "minimumTpd": tpd["minimum"],
        "tpd": tpd,
        "gibbsReduction": improvement,
        "isoactivityLogResidual": isoactivity,
        "materialBalanceMaxResidual": balance,
        "maximumCompositionSeparation": separation,
        "postSplitTpd": {"raffinate": post_r["minimum"], "extract": post_e["minimum"]},
        "postSplitTpdSearch": {"raffinate": post_r, "extract": post_e},
        "postSplitTangentStability": {
            "raffinate": stability_r,
            "extract": stability_e,
        },
        "phaseDirection": {
            "raffinateSatRicher": bool(raffinate[0] > extract[0]),
            "extractNmpRicher": bool(extract[5] > raffinate[5]),
            "aromaticSelectivityOverSat": {
                names[i]: float((extract[i] / raffinate[i]) / (extract[0] / raffinate[0]))
                for i in range(1, 5)
            },
        },
    }