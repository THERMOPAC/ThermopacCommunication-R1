#!/usr/bin/env python3
"""Reproducible research-only decomposition of Project 236's 6C -> 7C change."""
from __future__ import annotations

import hashlib
import importlib.util
import itertools
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/project-236-six-to-seven-diagnostic/evidence.json"
AMENDMENT = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment"
QUALIFICATION = ROOT / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
DATA = ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json"
PROTOCOL = AMENDMENT / "protocol.json"

# Exact immutable Stage-1 fields that define this diagnostic.  The database row
# was saved before this harness was authored; no live-row fallback is allowed.
AUTHORITY = {
    "projectReference": "236",
    "savedAt": "2026-09-03T04:14:20.337Z",
    "immutableHash": "b124bb856068a732f7bf422aea7d752ceb514b301b514fa3ed89cf9416001224",
    "stage1": {
        "operatingTemperatureC": 25,
        "saturatesWt": 85,
        "monoAromaticsWt": 7,
        "diAromaticsWt": 4,
        "polyAromaticsWt": 2,
        "polarAromaticsWt": 2,
        "nmpInFeedWt": 0,
        "nmpPurityWt": 98,
        "nmpWaterWt": 2,
        "solventOilRatio": 0.5,
        "satIdentity": "n-dodecane",
        "monoIdentity": "n-propylbenzene",
    },
}
FAMILIES6 = ("SAT", "MONO", "DI", "POLY", "PA", "NMP")
FAMILIES7 = FAMILIES6 + ("H2O",)
MW = {
    "SAT": 170.3348, "MONO": 120.194, "DI": 142.1971,
    "POLY": 202.2506, "PA": 405.58, "NMP": 99.1311, "H2O": 18.01528,
}
FLOOR = 1e-10
GATES = {
    "negativeTpd": -1e-7,
    "minimumGibbsReduction": 1e-8,
    "maximumIsoactivityResidual": 2e-5,
    "maximumBalanceResidual": 1e-8,
    "minimumSeparation": 1e-4,
    "kktResidual": 2e-5,
}


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


amendment = load_module("project236_amendment", AMENDMENT / "model.py")
qualification = load_module("project236_seven", QUALIFICATION)
np = amendment.np
scipy = amendment.base.scipy


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def digest(value):
    text = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()


def normalize(value):
    x = np.maximum(np.asarray(value, dtype=float), FLOOR)
    return x / x.sum()


def softmax(value):
    y = np.r_[value, 0.0]
    y -= np.max(y)
    e = np.exp(y)
    return e / e.sum()


def ledger(families, masses):
    component_mass = {name: float(masses.get(name, 0.0)) for name in families}
    component_moles = {name: component_mass[name] / MW[name] for name in families}
    total_mass = sum(component_mass.values())
    total_moles = sum(component_moles.values())
    return {
        "componentOrder": list(families),
        "componentMassOn100MassOilBasis": component_mass,
        "componentMolesOn100MassOilBasis": component_moles,
        "totalMass": total_mass,
        "totalMoles": total_moles,
        "massFractions": {name: component_mass[name] / total_mass for name in families},
        "moleFractions": {name: component_moles[name] / total_moles for name in families},
        "massClosureResidual": abs(total_mass - sum(component_mass.values())),
        "moleClosureResidual": abs(total_moles - sum(component_moles.values())),
    }


def lattice(denominator, dimensions):
    for cuts in itertools.combinations(range(denominator + dimensions - 1), dimensions - 1):
        marks = (-1,) + cuts + (denominator + dimensions - 1,)
        yield np.asarray(
            [marks[i + 1] - marks[i] - 1 for i in range(dimensions)], dtype=float
        ) / denominator


def make_engine(families, lngamma):
    n = len(families)

    def mu(x):
        x = normalize(x)
        return np.log(x) + lngamma(x)

    def phase_g(x):
        x = normalize(x)
        return float(x @ mu(x))

    def tpd(reference):
        reference = normalize(reference)
        reference_mu = mu(reference)

        def objective(x):
            x = normalize(x)
            return float(x @ (mu(x) - reference_mu))

        def kkt(x):
            x = normalize(x)
            gradient = mu(x) - reference_mu
            free = x > 10 * FLOOR
            multiplier = float(np.mean(gradient[free]))
            free_residual = float(np.max(np.abs(gradient[free] - multiplier)))
            bound_residual = (
                float(np.max(np.maximum(multiplier - gradient[~free], 0.0)))
                if np.any(~free) else 0.0
            )
            return {
                "activeComponents": [families[i] for i in range(n) if not free[i]],
                "freeStationarityInfinityNorm": free_residual,
                "boundDualFeasibilityInfinityNorm": bound_residual,
                "simplexKktInfinityNorm": max(free_residual, bound_residual),
                "passed": max(free_residual, bound_residual) <= GATES["kktResidual"],
            }

        denominator = 4
        grid = list(lattice(denominator, n))
        coarse = sorted(((objective(x), normalize(x)) for x in grid), key=lambda row: row[0])
        starts = [(f"LATTICE_{i + 1}", row[1]) for i, row in enumerate(coarse[:6])]
        starts.append(("REFERENCE", reference))
        starts.append(("UNIFORM", np.ones(n) / n))
        for i, name in enumerate(families):
            x = np.full(n, 0.05 / (n - 1))
            x[i] = 0.95
            starts.append((f"FAMILY_RICH_{name}", x))
        routes = []
        constraint = {
            "type": "eq", "fun": lambda x: float(x.sum() - 1.0),
            "jac": lambda x: np.ones(n),
        }
        for label, start in starts:
            solution = scipy.optimize.minimize(
                objective, start, method="SLSQP", bounds=[(FLOOR, 1.0)] * n,
                constraints=constraint, options={"ftol": 1e-12, "maxiter": 500},
            )
            x = normalize(solution.x)
            routes.append({
                "method": "SLSQP-simplex", "seed": label,
                "success": bool(solution.success), "objective": objective(x),
                "composition": dict(zip(families, x.tolist())), "kkt": kkt(x),
            })
        accepted_routes = [
            row for row in routes if row["success"] and row["kkt"]["passed"]
        ]
        best = min(accepted_routes or routes, key=lambda row: row["objective"])
        best_x = np.asarray([best["composition"][name] for name in families])
        log_solution = scipy.optimize.minimize(
            lambda y: objective(softmax(y)),
            np.log(best_x[:-1] / best_x[-1]), method="BFGS",
            options={"gtol": 1e-9, "maxiter": 500},
        )
        log_x = softmax(log_solution.x)
        log_route = {
            "method": "BFGS-log-ratio", "seed": "BEST_SIMPLEX",
            "success": bool(log_solution.success or np.max(np.abs(log_solution.jac)) <= 5e-6),
            "objective": objective(log_x),
            "composition": dict(zip(families, log_x.tolist())), "kkt": kkt(log_x),
        }
        routes.append(log_route)
        qualified = [row for row in routes if row["success"] and row["kkt"]["passed"]]
        best = min(qualified or routes, key=lambda row: row["objective"])
        agreement = [
            row for row in qualified if abs(row["objective"] - best["objective"]) <= 2e-7
        ]
        return {
            "objectiveDefinition": "sum_i w_i[(ln(w_i)+lnGamma_i(w))-(ln(z_i)+lnGamma_i(z))]",
            "lattice": {
                "denominator": denominator, "dimension": n - 1,
                "componentCount": n, "pointCount": len(grid),
            },
            "coarseMinimum": float(coarse[0][0]),
            "minimum": float(best["objective"]),
            "minimizingComposition": best["composition"],
            "acceptedRoute": {"method": best["method"], "seed": best["seed"]},
            "acceptedKkt": best["kkt"],
            "independentRouteAgreement": len(agreement) >= 2,
            "routes": routes,
            "classification": (
                "NEGATIVE_TPD_FOUND"
                if best["objective"] < GATES["negativeTpd"]
                else "NO_NEGATIVE_TPD_FOUND"
            ),
        }

    def hessian(reference):
        reference = normalize(reference)
        logits = np.log(reference[:-1] / reference[-1])
        reference_mu = mu(reference)

        def objective(y):
            x = softmax(y)
            return float(x @ (mu(x) - reference_mu))

        tangent = np.empty((n, n - 1))
        for i in range(n):
            for j in range(n - 1):
                tangent[i, j] = reference[i] * ((1.0 if i == j else 0.0) - reference[j])
        rows = []
        for step in (5e-4, 2.5e-4):
            H = np.zeros((n - 1, n - 1))
            J = np.zeros_like(H)
            center = objective(logits)
            for i in range(n - 1):
                di = step * np.eye(n - 1)[i]
                H[i, i] = (objective(logits + di) - 2 * center + objective(logits - di)) / step**2
                for j in range(i):
                    dj = step * np.eye(n - 1)[j]
                    H[i, j] = H[j, i] = (
                        objective(logits + di + dj) - objective(logits + di - dj)
                        - objective(logits - di + dj) + objective(logits - di - dj)
                    ) / (4 * step**2)
            chemical_jacobian = np.zeros((n, n - 1))
            for j in range(n - 1):
                d = step * np.eye(n - 1)[j]
                chemical_jacobian[:, j] = (
                    mu(softmax(logits + d)) - mu(softmax(logits - d))
                ) / (2 * step)
            J = tangent.T @ chemical_jacobian
            J = 0.5 * (J + J.T)
            rows.append({
                "stepLogRatio": step,
                "tpdFiniteDifferenceEigenvalues": np.linalg.eigvalsh(H).tolist(),
                "projectedChemicalPotentialJacobianEigenvalues": np.linalg.eigvalsh(J).tolist(),
                "maximumMatrixDifference": float(np.max(np.abs(H - J))),
            })
        left = np.asarray(rows[0]["tpdFiniteDifferenceEigenvalues"])
        right = np.asarray(rows[1]["tpdFiniteDifferenceEigenvalues"])
        projected = np.asarray(rows[1]["projectedChemicalPotentialJacobianEigenvalues"])
        scale = max(1.0, float(np.max(np.abs(right))))
        return {
            "dimension": n - 1,
            "coordinates": f"{n - 1} independent log mole-fraction ratios",
            "reconstructions": rows,
            "stepSpectrumMaximumRelativeDifference": float(np.max(np.abs(left - right)) / scale),
            "independentDerivativeMaximumRelativeDifference": float(np.max(np.abs(right - projected)) / scale),
            "minimumEigenvalue": float(min(right[0], projected[0])),
        }

    def flash(z, search):
        z = normalize(z)
        homogeneous = phase_g(z)
        candidate = np.asarray([search["minimizingComposition"][name] for name in families])
        starts = [
            0.5 * candidate, 0.25 * candidate, 0.75 * candidate,
            0.5 * normalize(np.arange(1, n + 1)),
        ]
        routes = []

        def objective(ne):
            beta = float(ne.sum())
            if beta <= FLOOR or beta >= 1.0 - FLOOR:
                return 1e6
            return beta * phase_g(ne / beta) + (1.0 - beta) * phase_g((z - ne) / (1.0 - beta))

        for i, start in enumerate(starts):
            start = np.clip(start, FLOOR, z - FLOOR)
            solution = scipy.optimize.minimize(
                objective, start, method="L-BFGS-B",
                bounds=[(FLOOR, float(zi - FLOOR)) for zi in z],
                options={"ftol": 1e-14, "gtol": 1e-9, "maxiter": 1000, "maxls": 40},
            )
            routes.append((solution, {
                "route": f"CONSERVED_AMOUNT_{i + 1}", "success": bool(solution.success),
                "message": str(solution.message), "iterations": int(solution.nit),
                "objective": float(solution.fun),
            }))
        best_solution, best_route = min(routes, key=lambda row: row[0].fun)
        ne = best_solution.x
        beta = float(ne.sum())
        extract = normalize(ne / beta)
        raffinate = normalize((z - ne) / (1.0 - beta))

        def unpack(vector):
            r = softmax(vector[:n - 1])
            e = softmax(vector[n - 1:2 * (n - 1)])
            b = 1.0 / (1.0 + np.exp(-vector[-1]))
            return r, e, b

        def equilibrium_residual(vector):
            r, e, b = unpack(vector)
            return np.r_[mu(r) - mu(e), ((1.0 - b) * r + b * e - z)[:-1]]

        polish_start = np.r_[
            np.log(raffinate[:-1] / raffinate[-1]),
            np.log(extract[:-1] / extract[-1]),
            math.log(beta / (1.0 - beta)),
        ]
        polished = scipy.optimize.least_squares(
            equilibrium_residual, polish_start, xtol=1e-13, ftol=1e-13,
            gtol=1e-13, max_nfev=5000,
        )
        raffinate, extract, beta = unpack(polished.x)
        if raffinate[families.index("NMP")] > extract[families.index("NMP")]:
            raffinate, extract, beta = extract, raffinate, 1.0 - beta
        delta_mu = mu(extract) - mu(raffinate)
        isoactivity = float(np.max(np.abs(delta_mu)))
        balance = float(np.max(np.abs(z - ((1.0 - beta) * raffinate + beta * extract))))
        separation = float(np.max(np.abs(extract - raffinate)))
        polished_ne = beta * extract
        boundary = bool(
            np.any(polished_ne <= 10 * FLOOR)
            or np.any(polished_ne >= z - 10 * FLOOR)
        )
        split_objective = (
            beta * phase_g(extract) + (1.0 - beta) * phase_g(raffinate)
        )
        improvement = homogeneous - split_objective
        successful = [row for _, row in routes if row["success"]]
        route_agreement = bool(
            len(successful) >= 2
            and max(row["objective"] for row in successful)
            - min(row["objective"] for row in successful) <= 2e-7
        )
        accepted = bool(
            search["minimum"] < GATES["negativeTpd"]
            and improvement > GATES["minimumGibbsReduction"]
            and isoactivity <= GATES["maximumIsoactivityResidual"]
            and balance <= GATES["maximumBalanceResidual"]
            and separation >= GATES["minimumSeparation"]
            and not boundary and best_solution.success and polished.success
            and route_agreement
        )
        return {
            "classification": "TWO_PHASE_SPLIT_ACCEPTED" if accepted else (
                "NO_SPLIT_NEGATIVE_TPD_NOT_FOUND"
                if search["minimum"] >= GATES["negativeTpd"]
                else "NO_SPLIT_NUMERICAL_OR_BOUNDARY_REJECTION"
            ),
            "accepted": accepted, "homogeneousObjective": homogeneous,
            "candidateSplitObjectiveBeforePolish": float(best_solution.fun),
            "candidateSplitObjective": split_objective,
            "gibbsReduction": improvement, "phaseFractionExtract": beta,
            "raffinateComposition": dict(zip(families, raffinate.tolist())),
            "extractComposition": dict(zip(families, extract.tolist())),
            "isoactivityTangentResidual": isoactivity,
            "moleBalanceMaximumResidual": balance,
            "maximumCompositionSeparation": separation,
            "boundarySolution": boundary, "independentRouteAgreement": route_agreement,
            "equilibriumPolish": {
                "success": bool(polished.success),
                "message": str(polished.message),
                "functionEvaluations": int(polished.nfev),
                "maximumResidual": float(np.max(np.abs(polished.fun))),
            },
            "selectedRoute": best_route, "routes": [row for _, row in routes],
        }

    return tpd, hessian, flash


def phase_ledger(families, overall, flash_result):
    total = overall["totalMoles"]
    beta = flash_result["phaseFractionExtract"]
    result = {}
    for label, fraction, key in (
        ("raffinate", 1.0 - beta, "raffinateComposition"),
        ("extract", beta, "extractComposition"),
    ):
        x = flash_result[key]
        moles = {name: total * fraction * x[name] for name in families}
        masses = {name: moles[name] * MW[name] for name in families}
        result[label] = {
            "phaseMoles": sum(moles.values()), "phaseMass": sum(masses.values()),
            "componentMoles": moles, "componentMass": masses,
            "moleFractions": x,
            "massFractions": {name: masses[name] / sum(masses.values()) for name in families},
        }
    return result


def main():
    stage1 = AUTHORITY["stage1"]
    if (
        stage1["operatingTemperatureC"] != 25
        or stage1["solventOilRatio"] != 0.5
        or stage1["nmpWaterWt"] != 2
        or sum(stage1[key] for key in (
            "saturatesWt", "monoAromaticsWt", "diAromaticsWt",
            "polyAromaticsWt", "polarAromaticsWt", "nmpInFeedWt",
        )) != 100
    ):
        raise RuntimeError("PROJECT_236_FROZEN_AUTHORITY_MISMATCH")
    temperature_k = 298.15
    dry_mass = {"SAT": 85, "MONO": 7, "DI": 4, "POLY": 2, "PA": 2, "NMP": 50}
    wet_mass = {**dry_mass, "NMP": 49, "H2O": 1}
    ledgers = {
        "A": ledger(FAMILIES6, dry_mass),
        "B": ledger(FAMILIES6, dry_mass),
        "C": ledger(FAMILIES7, wet_mass),
    }

    protocol = json.loads(PROTOCOL.read_text())
    evidence = json.loads(DATA.read_text())
    parameters, fit_partitions = amendment.fit_parameters(evidence["tieLines"], protocol)

    temporary, np7, scipy7, seven_model, seven_integrity, runtime = qualification.build_model()
    try:
        def native7_lngamma(x):
            return seven_model.wet_lngamma(np, temperature_k, x)

        definitions = {
            "A": (
                FAMILIES6,
                lambda x: amendment.total_lngamma(FAMILIES6, temperature_k, x, parameters),
                "FROZEN_6C_CCOSMO_PLUS_NINE_PARAMETER_NMP_LLE_RESIDUAL",
            ),
            "B": (
                FAMILIES6,
                lambda x: amendment.base.lngamma(FAMILIES6, temperature_k, x),
                "NATIVE_BARE_CCOSMO_SIX_PROFILES_H2O_STRUCTURALLY_ABSENT",
            ),
            "C": (
                FAMILIES7, native7_lngamma,
                "ASSEMBLED_6C_RESIDUAL_PRESERVING_SEVEN_COMPONENT_H2O_EXTENSION",
            ),
        }
        cases = {}
        for case_id, (families, lngamma, model_name) in definitions.items():
            overall = ledgers[case_id]
            z = [overall["moleFractions"][name] for name in families]
            tpd_fn, hessian_fn, flash_fn = make_engine(families, lngamma)
            search = tpd_fn(z)
            flash_result = flash_fn(z, search)
            post_split = None
            candidate_phase_ledgers = None
            if flash_result["accepted"]:
                candidate_phase_ledgers = phase_ledger(
                    families, overall, flash_result
                )
                post_split = {}
                for phase, composition_key in (
                    ("raffinate", "raffinateComposition"),
                    ("extract", "extractComposition"),
                ):
                    composition = [
                        flash_result[composition_key][name] for name in families
                    ]
                    post_split[phase] = {
                        "tpd": tpd_fn(composition),
                        "tangentHessian": hessian_fn(composition),
                    }
                post_stable = all(
                    row["tpd"]["minimum"] >= GATES["negativeTpd"]
                    and row["tangentHessian"]["minimumEigenvalue"] >= -1e-6
                    for row in post_split.values()
                )
                flash_result["postSplitStabilityAccepted"] = post_stable
                if not post_stable:
                    flash_result["accepted"] = False
                    flash_result["classification"] = (
                        "NO_ADMISSIBLE_TWO_PHASE_SPLIT_POST_STABILITY_REJECTION"
                    )
            oil_mass = {
                name: dry_mass.get(name, 0.0) if name != "NMP" else 0.0
                for name in families
            }
            solvent_mass = {
                name: overall["componentMassOn100MassOilBasis"][name] - oil_mass[name]
                for name in families
            }
            cases[case_id] = {
                "caseId": case_id, "model": model_name,
                "activeComponents": list(families), "stateSpaceDimension": len(families),
                "temperatureC": 25.0, "temperatureK": temperature_k,
                "solventOilMassRatio": 0.5, "overallLedger": overall,
                "sourceLedgers": {
                    "oilFeed": ledger(families, oil_mass),
                    "freshSolvent": ledger(families, solvent_mass),
                },
                "overallTpd": search, "overallTangentHessian": hessian_fn(z),
                "flash": flash_result,
                "candidatePhaseLedgers": candidate_phase_ledgers,
                "acceptedPhaseLedgers": (
                    candidate_phase_ledgers if flash_result["accepted"] else None
                ),
                "postSplitEvidence": post_split,
            }
    finally:
        temporary.cleanup()

    classifications = {key: value["flash"]["classification"] for key, value in cases.items()}
    result = {
        "schemaVersion": "PROJECT_236_6C_7C_DECOMPOSITION_V1",
        "researchOnly": True, "releaseEligible": False,
        "project": 236, "stage1Authority": AUTHORITY,
        "governedCondition": {
            "temperatureC": 25.0, "temperatureK": temperature_k,
            "solventOilMassRatio": 0.5,
            "wetSolventMassOn100MassOilBasis": 50.0,
            "waterWeightPercentOfWetSolvent": 2.0,
        },
        "matchedNumericalHarness": {
            "algorithm": "full-simplex denominator-4 lattice; matched SLSQP and BFGS TPD routes; four matched conserved-amount L-BFGS-B flash routes",
            "thresholds": GATES,
            "dimensionalDifference": {
                "A": cases["A"]["overallTpd"]["lattice"],
                "B": cases["B"]["overallTpd"]["lattice"],
                "C": cases["C"]["overallTpd"]["lattice"],
                "statement": "A/B are identical five-dimensional simplexes; C is a six-dimensional simplex, so its denominator-4 lattice has a different point count.",
            },
        },
        "scientificIntegrity": {
            "profileSha256ByFamily": seven_integrity["profileSha256ByFamily"],
            "baseSixComponentModelSha256": sha(amendment.BASE_PATH),
            "residualAmendmentModelSha256": sha(AMENDMENT / "model.py"),
            "residualProtocolSha256": sha(PROTOCOL),
            "residualEvidenceSha256": sha(DATA),
            "residualParameterVector": dict(zip(amendment.PARAMETER_NAMES, parameters.tolist())),
            "residualParameterVectorSha256": digest(parameters.tolist()),
            "residualFitDiagnostics": fit_partitions["fitDiagnostics"],
            "sevenComponentQualificationRunnerSha256": sha(QUALIFICATION),
            "sevenComponentIntegrity": seven_integrity,
            "nativeRuntime": runtime,
            "harnessSha256": sha(HERE / "run.py"),
        },
        "cases": cases,
        "classifications": classifications,
        "effectDecomposition": {
            "A_to_B": {
                "changed": "thermodynamic treatment only: remove the fitted nine-parameter NMP-LLE residual amendment while retaining the same six profiles, dry mass/mole ledger, temperature, and numerical harness",
                "waterCausalityAllowed": False,
                "classificationChange": f"{classifications['A']} -> {classifications['B']}",
                "minimumTpdChange": cases["B"]["overallTpd"]["minimum"] - cases["A"]["overallTpd"]["minimum"],
                "gibbsReductionChange": cases["B"]["flash"]["gibbsReduction"] - cases["A"]["flash"]["gibbsReduction"],
            },
            "B_to_C": {
                "changed": "replace 1 mass unit of NMP by 1 mass unit H2O within the fixed 50-unit total solvent charge and expand the state space from six to seven components",
                "waterCausalityAllowedOnlyHere": True,
                "attributionBoundary": "This contrast is the only water-bearing contrast; it jointly includes H2O composition and the unavoidable dimensional/lattice change and does not prove a mechanistic cause.",
                "classificationChange": f"{classifications['B']} -> {classifications['C']}",
                "minimumTpdChange": cases["C"]["overallTpd"]["minimum"] - cases["B"]["overallTpd"]["minimum"],
                "gibbsReductionChange": cases["C"]["flash"]["gibbsReduction"] - cases["B"]["flash"]["gibbsReduction"],
            },
            "prohibitedInference": "No A-to-C difference is attributed to water. Water is never invoked to explain A-to-B.",
        },
    }
    result["canonicalPayloadSha256"] = digest(result)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(json.dumps({
        "output": str(OUT.relative_to(ROOT)),
        "canonicalPayloadSha256": result["canonicalPayloadSha256"],
        "classifications": classifications,
        "minimumTpd": {key: cases[key]["overallTpd"]["minimum"] for key in cases},
    }, sort_keys=True))


if __name__ == "__main__":
    main()