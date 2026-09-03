#!/usr/bin/env python3
"""Research-only native seven-component COSMO-SAC qualification harness."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import itertools
import json
import math
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-seven-component-h2o-profile"
SIX = HERE.parent / "ecr-pre-pilot-six-component-thermodynamics"
FROZEN = HERE.parent / "ecr-pre-pilot-cosmosac"
VENDOR = FROZEN / "vendor/python"
H2O_KEY = "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
FAMILIES6 = FAMILIES[:6]
AMENDMENT_PATH = HERE.parent / "ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
AMENDMENT_RESULTS = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
MW = {
    "SAT": 170.3348, "MONO": 120.194, "DI": 142.1971,
    "POLY": 202.2506, "PA": 405.58, "NMP": 99.1311, "H2O": 18.01528,
}
FEED_MASS = {"SAT": 85.0, "MONO": 7.0, "DI": 4.0, "POLY": 2.0, "PA": 2.0, "NMP": 0.0, "H2O": 0.0}
WATER_WT_PCT = (0.5, 1.0, 2.0, 3.0)
TEMPERATURE_K = 323.15
SOLVENT_OIL_RATIO = 0.9
FLOOR = 1e-10


class AssembledSevenComponentModel:
    """Native 7C base plus the immutable governed 6C assembled model."""

    def __init__(self, native_six, native_seven, amendment, residual_parameters):
        self.native_six = native_six
        self.native_seven = native_seven
        self.amendment = amendment
        self.residual_parameters = residual_parameters

    def residual_lngamma(self, np, x6, temperature_k):
        """Independent reproduction of the governed nine-parameter equation."""
        x = np.maximum(np.asarray(x6, dtype=float), 1e-12)
        x = x / x.sum()
        tau = (float(temperature_k) - 313.15) / 20.0
        q_features = np.zeros(9)
        gradient_features = np.zeros((6, 9))
        for pair_index, (i, j) in enumerate(((0, 1), (0, 5), (1, 5))):
            for offset, factor in ((0, 1.0), (1, tau)):
                column = 3 * pair_index + offset
                q_features[column] = x[i] * x[j] * factor
                gradient_features[i, column] += x[j] * factor
                gradient_features[j, column] += x[i] * factor
            column = 3 * pair_index + 2
            q_features[column] = x[i] * x[j] * (x[i] - x[j])
            gradient_features[i, column] = 2 * x[i] * x[j] - x[j] ** 2
            gradient_features[j, column] = x[i] ** 2 - 2 * x[i] * x[j]
        degrees = np.asarray([2, 2, 3] * 3)
        return (gradient_features + (1.0 - degrees) * q_features) @ self.residual_parameters

    def inherited_six_lngamma(self, temperature_k, x6):
        """Code-level reproduction of the inherited 6C assembled basis."""
        np = self.amendment.np
        x = np.maximum(np.asarray(x6, dtype=float), 1e-12)
        x = x / x.sum()
        native = (
            np.asarray(self.native_six.get_lngamma_comb(temperature_k, x))
            + np.asarray(self.native_six.get_lngamma_resid(temperature_k, x))
        )
        return native + self.residual_lngamma(np, x, temperature_k)

    def wet_lngamma(self, np, temperature_k, x7):
        """7C base with the established 6C residual chemical potentials only."""
        x7 = normalize(np, x7)
        dry_total = float(np.sum(x7[:6]))
        if dry_total <= 0.0:
            raise ValueError("SEVEN_COMPONENT_DRY_SUBMIXTURE_EMPTY")
        y = x7[:6] / dry_total
        native = (
            np.asarray(self.native_seven.get_lngamma_comb(temperature_k, x7))
            + np.asarray(self.native_seven.get_lngamma_resid(temperature_k, x7))
        )
        residual = self.residual_lngamma(np, y, temperature_k)
        return native + np.r_[residual, 0.0]


def load_frozen_residual(np):
    """Load, validate, and order the nine governed parameters without refitting."""
    spec = importlib.util.spec_from_file_location("governed_nmp_lle_amendment", AMENDMENT_PATH)
    amendment = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(amendment)
    governed = json.loads(AMENDMENT_RESULTS.read_text())
    if governed.get("model", {}).get("identity") != "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL":
        raise RuntimeError("FROZEN_RESIDUAL_MODEL_IDENTITY_MISMATCH")
    if amendment.T_REF_K != 313.15 or amendment.T_SCALE_K != 20.0:
        raise RuntimeError("FROZEN_RESIDUAL_TEMPERATURE_CONVENTION_MISMATCH")
    values = governed["model"]["parameters"]
    if set(values) != set(amendment.PARAMETER_NAMES) or len(values) != 9:
        raise RuntimeError("FROZEN_RESIDUAL_PARAMETER_SET_MISMATCH")
    return amendment, np.asarray([values[name] for name in amendment.PARAMETER_NAMES], float)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def normalize(np, value):
    x = np.maximum(np.asarray(value, dtype=float), FLOOR)
    return x / x.sum()


def lattice(np, denominator: int, n: int):
    for cuts in itertools.combinations(range(denominator + n - 1), n - 1):
        marks = (-1,) + cuts + (denominator + n - 1,)
        yield np.asarray([marks[i + 1] - marks[i] - 1 for i in range(n)], float) / denominator


def build_model():
    """Build an isolated profile tree while pinning every scientific input."""
    six_manifest_path = SIX / "generated/generation-manifest.json"
    h2o_manifest_path = HERE / "generated/generation-manifest.json"
    h2o_verify_path = HERE / "generated/profile-verification.json"
    runtime_check_path = HERE / "generated/seven-component-runtime-compatibility.json"
    six_manifest = json.loads(six_manifest_path.read_text())
    h2o_manifest = json.loads(h2o_manifest_path.read_text())
    runtime_check = json.loads(runtime_check_path.read_text())
    if h2o_manifest.get("status") != "PROFILE_ESTABLISHED_RESEARCH_ONLY":
        raise RuntimeError("H2O_PROFILE_NOT_ESTABLISHED")
    if h2o_manifest.get("lleQualification") != "SEVEN_COMPONENT_LLE_NOT_QUALIFIED":
        raise RuntimeError("H2O_LLE_BOUNDARY_MISSING")
    if sha(h2o_verify_path) != h2o_manifest["profileConversion"]["profileVerificationSha256"]:
        raise RuntimeError("H2O_PROFILE_VERIFICATION_HASH_MISMATCH")
    if runtime_check.get("decision") != "SEVEN_COMPONENT_CCOSMO_RUNTIME_COMPATIBLE":
        raise RuntimeError("SEVEN_COMPONENT_RUNTIME_NOT_ESTABLISHED")
    components = six_manifest["components"]
    keys = [row["inchiKey"] for row in components] + [H2O_KEY]
    temporary = tempfile.TemporaryDirectory(prefix="task222-seven-component-")
    tree = Path(temporary.name)
    sigma = tree / "sigma3"
    sigma.mkdir()
    source_complist = SIX / "generated/profiles/complist.txt"
    lines = source_complist.read_text().splitlines()
    if len(lines) != 7:
        raise RuntimeError("FROZEN_SIX_COMPONENT_COMPLIST_CHANGED")
    profile_hashes = {}
    for row in components:
        source = SIX / "generated/profiles/sigma3" / f"{row['inchiKey']}.sigma"
        if sha(source) != row["profileSha256"]:
            raise RuntimeError("SIX_COMPONENT_PROFILE_HASH_MISMATCH:" + row["family"])
        shutil.copy2(source, sigma / source.name)
        profile_hashes[row["family"]] = sha(source)
    water = HERE / "generated/profiles/sigma3" / f"{H2O_KEY}.sigma"
    if sha(water) != h2o_manifest["component"]["profileSha256"]:
        raise RuntimeError("H2O_PROFILE_HASH_MISMATCH")
    shutil.copy2(water, sigma / water.name)
    profile_hashes["H2O"] = sha(water)
    complist = tree / "complist.txt"
    complist.write_text("\n".join(lines + [f"7 H2O 7732-18-5 WATER O InChI=1S/H2O/h1H2 {H2O_KEY}"]) + "\n")

    sys.path.insert(0, str(VENDOR))
    import cCOSMO  # type: ignore
    import numpy as np  # type: ignore
    import scipy  # type: ignore
    if Path(cCOSMO.__file__).resolve() != (VENDOR / "cCOSMO.cpython-312-x86_64-linux-gnu.so").resolve():
        raise RuntimeError("UNPINNED_CCOSMO_LOADED")
    if np.__version__ != "2.1.3" or scipy.__version__ != "1.14.1":
        raise RuntimeError("UNPINNED_NUMERICAL_RUNTIME_LOADED")
    if not Path(np.__file__).resolve().is_relative_to(VENDOR.resolve()) or not Path(scipy.__file__).resolve().is_relative_to(VENDOR.resolve()):
        raise RuntimeError("NUMERICAL_RUNTIME_OUTSIDE_VENDOR_TREE")
    database = cCOSMO.DelawareProfileDatabase(str(complist), str(sigma))
    for key in keys:
        database.add_profile(key)
    native_six = cCOSMO.COSMO3(keys[:6], database)
    native_seven = cCOSMO.COSMO3(keys, database)
    amendment, residual_parameters = load_frozen_residual(np)
    model = AssembledSevenComponentModel(
        native_six, native_seven, amendment, residual_parameters)
    integrity = {
        "sixGenerationManifestSha256": sha(six_manifest_path),
        "h2oGenerationManifestSha256": sha(h2o_manifest_path),
        "h2oProfileVerificationSha256": sha(h2o_verify_path),
        "sevenComponentRuntimeCompatibilitySha256": sha(runtime_check_path),
        "frozenSixComponentRunnerSha256": sha(FROZEN / "run.py"),
        "frozenSixComponentProvenanceSha256": sha(FROZEN / "provenance-manifest.json"),
        "frozenResidualModelSha256": sha(AMENDMENT_PATH),
        "frozenResidualResultsSha256": sha(AMENDMENT_RESULTS),
        "frozenResidualParameterVectorSha256": digest(residual_parameters.tolist()),
        "profileSha256ByFamily": profile_hashes,
        "isolatedComplistSha256": sha(complist),
    }
    runtime = {
        "vendorDirectory": str(VENDOR.relative_to(ROOT)),
        "cCOSMOBinarySha256": sha(Path(cCOSMO.__file__)),
        "numpy": np.__version__, "scipy": scipy.__version__, "python": sys.version,
    }
    return temporary, np, scipy, model, integrity, runtime


def wet_charge(np, water_wt_pct: float):
    if not 0.0 <= water_wt_pct <= 100.0:
        raise ValueError("WATER_WT_PERCENT_OUT_OF_RANGE")
    oil_mass = sum(FEED_MASS.values())
    wet = oil_mass * SOLVENT_OIL_RATIO
    water = wet * water_wt_pct / 100.0
    dry_nmp = wet - water
    masses = dict(FEED_MASS)
    masses["NMP"] += dry_nmp
    masses["H2O"] += water
    moles = np.asarray([masses[name] / MW[name] for name in FAMILIES], float)
    return moles / moles.sum(), {
        "basis": "total wet-solvent mass divided by RRBO feed mass",
        "rrboFeedMass": oil_mass, "solventOilMassRatio": SOLVENT_OIL_RATIO,
        "totalWetSolventMass": wet, "dryNmpMass": dry_nmp, "waterMass": water,
        "waterWeightPercentOfWetSolvent": water_wt_pct,
        "componentMass": masses, "componentMoles": dict(zip(FAMILIES, moles.tolist())),
        "overallMoleFraction": dict(zip(FAMILIES, (moles / moles.sum()).tolist())),
        "massClosureResidual": abs(wet - dry_nmp - water),
    }


def engine(np, scipy, model, temperature_k, water_wt_pct):
    if not math.isfinite(float(temperature_k)) or temperature_k <= 0.0:
        raise ValueError("SEVEN_COMPONENT_TEMPERATURE_INVALID")
    if (
        not math.isfinite(float(water_wt_pct))
        or float(water_wt_pct) < 0.5
        or float(water_wt_pct) > 3.0
    ):
        raise ValueError("SEVEN_COMPONENT_WATER_OUTSIDE_GOVERNED_RANGE")
    cache = {}

    def lngamma(x):
        x = normalize(np, x)
        key = tuple(x.tolist())
        if key not in cache:
            cache[key] = model.wet_lngamma(np, temperature_k, x)
        return cache[key]

    def mu(x):
        x = normalize(np, x)
        return np.log(x) + lngamma(x)

    def tpd(reference):
        reference = normalize(np, reference)
        reference_mu = mu(reference)

        def objective(x):
            x = normalize(np, x)
            return float(x @ (mu(x) - reference_mu))

        def logits(y):
            y = np.r_[y, 0.0]
            y -= np.max(y)
            e = np.exp(y)
            return e / e.sum()

        def kkt(x):
            x = normalize(np, x)
            gradient = mu(x) - reference_mu
            free = x > 10.0 * FLOOR
            multiplier = float(np.mean(gradient[free]))
            free_residual = float(np.max(np.abs(gradient[free] - multiplier)))
            bound_residual = float(np.max(np.maximum(multiplier - gradient[~free], 0.0))) if np.any(~free) else 0.0
            return {
                "activeSet": [FAMILIES[i] for i in range(7) if not free[i]],
                "freeStationarityInfinityNorm": free_residual,
                "boundDualFeasibilityInfinityNorm": bound_residual,
                "simplexKktInfinityNorm": max(free_residual, bound_residual),
                "passed": max(free_residual, bound_residual) <= 2e-5,
            }

        # Denominator six gives 924 points and includes every face, edge, and
        # vertex.  Starts are then deliberately diversified rather than all
        # being taken from one coarse basin.
        grid = list(lattice(np, 6, 7))
        values = np.asarray([objective(x) for x in grid])
        order = np.argsort(values)
        diverse = []
        for index in order:
            candidate = normalize(np, grid[index])
            if all(float(np.sum(np.abs(candidate - prior))) >= 0.45 for prior in diverse):
                diverse.append(candidate)
            if len(diverse) == 6:
                break
        family_rich = []
        for i in range(7):
            x = np.full(7, 0.05 / 6.0)
            x[i] = 0.95
            family_rich.append(x)
        starts = [("DIVERSE_GRID_" + str(i + 1), x) for i, x in enumerate(diverse)]
        starts += [("REFERENCE", reference), ("UNIFORM", np.ones(7) / 7.0)]
        starts += [("FAMILY_RICH_" + FAMILIES[i], x) for i, x in enumerate(family_rich)]
        # Adaptive points connect each independently selected basin to the
        # reference and uniform compositions at three deterministic scales.
        adaptive = []
        for i, x in enumerate(diverse):
            for target_name, target in (("REFERENCE", reference), ("UNIFORM", np.ones(7)/7.0)):
                for fraction in (0.25, 0.5, 0.75):
                    adaptive.append((f"ADAPTIVE_{i+1}_{target_name}_{fraction}", normalize(
                        np, (1.0-fraction)*x + fraction*target)))
        starts += adaptive
        routes = []
        constraints = {"type": "eq", "fun": lambda x: float(x.sum() - 1.0), "jac": lambda x: np.ones(7)}
        for label, start in starts:
            solution = scipy.optimize.minimize(
                objective, start, method="SLSQP", bounds=[(FLOOR, 1.0)] * 7,
                constraints=constraints, options={"ftol": 1e-12, "maxiter": 500},
            )
            x = normalize(np, solution.x)
            routes.append({"method": "SLSQP-simplex", "seed": label, "success": bool(solution.success),
                           "objective": objective(x), "composition": x.tolist(), **kkt(x)})
        # Explicit active-set searches.  Each six-component face is refined
        # from both a uniform and projected-reference start with the omitted
        # component fixed at FLOOR.  Every binary edge is independently
        # minimized with the other five components fixed at FLOOR.
        face_routes = []
        for omitted in range(7):
            subset = [i for i in range(7) if i != omitted]
            available = 1.0 - FLOOR

            def face_comp(u, subset=subset, omitted=omitted):
                x = np.full(7, FLOOR); x[subset] = u
                return x

            projected = reference[subset] / reference[subset].sum()
            for seed_name, seed in (("UNIFORM", np.ones(6)/6.0), ("PROJECTED_REFERENCE", projected)):
                solution = scipy.optimize.minimize(
                    lambda u: objective(face_comp(u)), available * seed,
                    method="SLSQP", bounds=[(FLOOR, 1.0)] * 6,
                    constraints={"type": "eq", "fun": lambda u: float(u.sum() - available),
                                 "jac": lambda u: np.ones(6)},
                    options={"ftol": 1e-12, "maxiter": 500})
                x = face_comp(solution.x)
                face_routes.append({
                    "method": "SLSQP-active-face", "seed": seed_name,
                    "fixedComponents": [FAMILIES[omitted]], "success": bool(solution.success),
                    "objective": objective(x), "composition": x.tolist(), **kkt(x)})
        edge_routes = []
        available_edge = 1.0 - 7.0 * FLOOR
        for i in range(7):
            for j in range(i + 1, 7):
                def edge_comp(t, i=i, j=j):
                    x = np.full(7, FLOOR)
                    x[i] = FLOOR + available_edge * t
                    x[j] = FLOOR + available_edge * (1.0-t)
                    return x
                solution = scipy.optimize.minimize_scalar(
                    lambda t: objective(edge_comp(t)), bounds=(0.0, 1.0),
                    method="bounded", options={"xatol": 1e-12, "maxiter": 500})
                x = edge_comp(float(solution.x))
                edge_routes.append({
                    "method": "bounded-active-edge", "seed": "EDGE_MIDPOINT",
                    "fixedComponents": [FAMILIES[k] for k in range(7) if k not in (i, j)],
                    "success": bool(solution.success), "objective": objective(x),
                    "composition": x.tolist(), **kkt(x)})
        routes += face_routes + edge_routes
        best_start = np.asarray(min(routes, key=lambda row: row["objective"])["composition"])
        log_solution = scipy.optimize.minimize(
            lambda y: objective(logits(y)), np.log(best_start[:-1] / best_start[-1]),
            method="BFGS", options={"gtol": 1e-9, "maxiter": 500},
        )
        log_x = logits(log_solution.x)
        routes.append({"method": "BFGS-log-ratio", "seed": "BEST_CONSTRAINED",
                       "success": bool(log_solution.success), "objective": objective(log_x),
                       "composition": log_x.tolist(), **kkt(log_x)})
        trust_solution = scipy.optimize.minimize(
            objective, best_start, method="trust-constr",
            bounds=scipy.optimize.Bounds(FLOOR, 1.0),
            constraints=scipy.optimize.LinearConstraint(np.ones((1, 7)), 1.0, 1.0),
            options={"gtol": 1e-9, "xtol": 1e-11, "maxiter": 300},
        )
        trust_x = normalize(np, trust_solution.x)
        routes.append({"method": "trust-constr-simplex", "seed": "BEST_CONSTRAINED",
                       "success": bool(trust_solution.success), "objective": objective(trust_x),
                       "composition": trust_x.tolist(), **kkt(trust_x)})
        qualified = [row for row in routes if row["success"] and row["passed"]]
        accepted = min(qualified or routes, key=lambda row: row["objective"])
        agreeing = [row for row in qualified if abs(row["objective"] - accepted["objective"]) <= 2e-7]
        boundary = bool(accepted["activeSet"])
        return {
            "objectiveDefinition": "sum_i w_i[(ln(w_i)+lnGamma_i(w))-(ln(z_i)+lnGamma_i(z))]",
            "globalExclusionClaimed": False,
            "searchCoverage": {
                "fullSimplexLatticeDenominator": 6, "fullSimplexPointCount": len(grid),
                "diverseGlobalStarts": len(diverse), "familyRichStarts": len(family_rich),
                "adaptiveInteriorStarts": len(adaptive), "explicitFaceRefinements": len(face_routes),
                "explicitEdgeRefinements": len(edge_routes),
            },
            "fullSimplexLatticeDenominator": 6, "fullSimplexPointCount": len(grid),
            "coarseMinimum": float(values.min()), "routes": routes,
            "minimum": accepted["objective"], "minimizingComposition": accepted["composition"],
            "minimumOnBoundary": boundary, "activeSetKkt": {k: accepted[k] for k in (
                "activeSet", "freeStationarityInfinityNorm", "boundDualFeasibilityInfinityNorm",
                "simplexKktInfinityNorm", "passed")},
            "independentRouteAgreement": len({row["method"] for row in agreeing}) >= 2,
            "classification": ("NEGATIVE_BOUNDARY_BASIN_FOUND" if boundary else "NEGATIVE_INTERIOR_BASIN_FOUND")
            if accepted["objective"] < -1e-7 else "NO_NEGATIVE_TPD_FOUND_DENSE_FAIL_CLOSED_SEARCH",
        }

    def hessian(reference):
        reference = normalize(np, reference)
        reference_mu = mu(reference)
        basis = np.vstack([np.eye(6), -np.ones(6)])

        def objective_delta(delta):
            x = reference + basis @ delta
            return float(x @ (mu(x) - reference_mu))

        reconstructions = []
        for h in (2e-4, 1e-4):
            H = np.zeros((6, 6))
            zero = objective_delta(np.zeros(6))
            for i in range(6):
                ei = np.zeros(6); ei[i] = h
                H[i, i] = (objective_delta(ei) - 2 * zero + objective_delta(-ei)) / h**2
                for j in range(i):
                    ej = np.zeros(6); ej[j] = h
                    H[i, j] = H[j, i] = (
                        objective_delta(ei + ej) - objective_delta(ei - ej)
                        - objective_delta(-ei + ej) + objective_delta(-ei - ej)
                    ) / (4 * h**2)
            J = np.zeros((6, 6))
            for j in range(6):
                d = np.zeros(6); d[j] = h
                J[:, j] = (basis.T @ mu(reference + basis @ d)
                            - basis.T @ mu(reference - basis @ d)) / (2 * h)
            J = 0.5 * (J + J.T)
            reconstructions.append({
                "step": h, "tpdFiniteDifferenceEigenvalues": np.linalg.eigvalsh(H).tolist(),
                "projectedChemicalPotentialJacobianEigenvalues": np.linalg.eigvalsh(J).tolist(),
                "matrixMaximumAbsoluteDifference": float(np.max(np.abs(H - J))),
            })
        a, b = reconstructions
        convergence = float(max(abs(np.asarray(a["tpdFiniteDifferenceEigenvalues"]) -
                                    np.asarray(b["tpdFiniteDifferenceEigenvalues"]))))
        scale = max(1.0, float(max(abs(np.asarray(b["tpdFiniteDifferenceEigenvalues"])))))
        convergence_relative = convergence / scale
        derivative_relative = b["matrixMaximumAbsoluteDifference"] / scale
        minimum = float(min(b["tpdFiniteDifferenceEigenvalues"]))
        return {
            "surface": "local TPD after subtraction of the reference tangent plane",
            "coordinates": "six independent simplex tangent directions e_i-e_H2O",
            "reconstructions": reconstructions, "stepSpectrumMaximumDifference": convergence,
            "stepSpectrumMaximumRelativeDifference": convergence_relative,
            "independentDerivativeMaximumRelativeDifference": derivative_relative,
            "minimumEigenvalue": minimum, "locallyStable": minimum >= -1e-5,
            "stepSizeConverged": convergence_relative <= 1e-3,
            "independentDerivativeAgreement": derivative_relative <= 5e-4,
        }

    def flash(z, overall_search=None):
        z = normalize(np, z)
        homogeneous = float(z @ mu(z))
        search = overall_search if overall_search is not None else tpd(z)
        candidate = np.asarray(search["minimizingComposition"])
        starts = [
            ("TPD_HALF_LBFGSB", "L-BFGS-B", 0.5 * candidate),
            ("TPD_QUARTER_LBFGSB", "L-BFGS-B", 0.25 * candidate),
            ("TPD_HALF_SLSQP", "SLSQP", 0.5 * candidate),
            ("TPD_QUARTER_SLSQP", "SLSQP", 0.25 * candidate),
            ("HOMOGENEOUS_HALF_LBFGSB", "L-BFGS-B", 0.5 * z),
            ("DIVERSE_HALF_LBFGSB", "L-BFGS-B",
             0.5 * normalize(np, np.arange(1, 8))),
        ]
        route_results = []
        for route_index, (seed_name, method, start) in enumerate(starts):
            start = np.clip(start, FLOOR, z - FLOOR)

            def total_gibbs(ne):
                beta = float(ne.sum())
                if beta <= FLOOR or beta >= 1.0 - FLOOR:
                    return 1e6
                e = ne / beta
                r = (z - ne) / (1.0 - beta)
                return float(ne @ mu(e) + (z - ne) @ mu(r))

            solution = scipy.optimize.minimize(
                total_gibbs, start, method=method,
                bounds=[(FLOOR, float(value - FLOOR)) for value in z],
                options=(
                    {"ftol": 1e-12, "gtol": 1e-7, "maxiter": 300, "maxls": 30}
                    if method == "L-BFGS-B"
                    else {"ftol": 1e-12, "maxiter": 500}
                ),
            )
            ne = np.asarray(solution.x)
            beta = float(ne.sum())
            finite = bool(np.all(np.isfinite(ne)) and np.isfinite(solution.fun))
            feasible = bool(
                finite and beta > FLOOR and beta < 1.0 - FLOOR
                and np.all(ne >= FLOOR) and np.all(ne <= z - FLOOR)
            )
            extract = normalize(np, ne / beta) if feasible else None
            raffinate = normalize(np, (z - ne) / (1.0 - beta)) if feasible else None
            boundary = bool(
                not feasible
                or np.any(ne <= 10 * FLOOR)
                or np.any(ne >= z - 10 * FLOOR)
            )
            residual = (
                float(np.max(np.abs(
                    (mu(extract) - mu(raffinate))
                    - np.mean(mu(extract) - mu(raffinate))
                )))
                if feasible else float("inf")
            )
            separation = (
                float(np.max(np.abs(extract - raffinate)))
                if feasible else 0.0
            )
            improvement = homogeneous - float(solution.fun)
            closed = bool(
                solution.success and feasible and not boundary
                and separation > 1e-6 and improvement > 1e-8
                and residual <= 2e-5
            )
            if feasible and extract[5] < raffinate[5]:
                extract, raffinate = raffinate, extract
                beta = 1.0 - beta
            evidence = {
                "route": f"CONSERVED_AMOUNT_{route_index+1}",
                "seed": seed_name, "method": method,
                "success": bool(solution.success), "message": str(solution.message),
                "iterations": int(solution.nit), "objective": float(solution.fun),
                "feasible": feasible, "boundarySolution": boundary,
                "materiallySeparated": separation > 1e-6,
                "phaseSeparationInfinityNorm": separation,
                "isoactivityTangentResidual": residual if feasible else None,
                "objectiveImprovement": improvement, "closed": closed,
                "realizedSeed": start.tolist(),
                "phaseFractionExtract": beta if feasible else None,
                "raffinateComposition": raffinate.tolist() if feasible else None,
                "extractComposition": extract.tolist() if feasible else None,
            }
            route_results.append((solution, evidence))

        def unordered_pair_distance(left, right):
            lr, le = (np.asarray(left["raffinateComposition"]),
                      np.asarray(left["extractComposition"]))
            rr, re = (np.asarray(right["raffinateComposition"]),
                      np.asarray(right["extractComposition"]))
            direct = max(float(np.max(np.abs(lr - rr))),
                         float(np.max(np.abs(le - re))))
            swapped = max(float(np.max(np.abs(lr - re))),
                          float(np.max(np.abs(le - rr))))
            return min(direct, swapped)

        closed_routes = [row for _, row in route_results if row["closed"]]
        clusters = []
        for row in sorted(closed_routes, key=lambda item: item["objective"]):
            cluster = next((
                group for group in clusters
                if abs(group[0]["objective"] - row["objective"]) <= 2e-7
                and unordered_pair_distance(group[0], row) <= 2e-5
            ), None)
            if cluster is None:
                clusters.append([row])
            else:
                cluster.append(row)
        reproduced_clusters = [group for group in clusters if len(group) >= 2]
        selected_cluster = min(
            reproduced_clusters,
            key=lambda group: min(row["objective"] for row in group),
            default=None,
        )
        independent_convergence = selected_cluster is not None
        if selected_cluster is not None:
            selected_row = min(selected_cluster, key=lambda row: row["objective"])
            best = next(
                solution for solution, row in route_results
                if row["route"] == selected_row["route"]
            )
        else:
            best, selected_row = min(
                route_results, key=lambda item: item[1]["objective"])

        def chemical_potential_gap(ne):
            beta_local = float(ne.sum())
            extract_local = ne / beta_local
            raffinate_local = (z - ne) / (1.0 - beta_local)
            return mu(extract_local) - mu(raffinate_local)

        polish = scipy.optimize.least_squares(
            chemical_potential_gap,
            np.asarray(best.x),
            bounds=(np.full(7, FLOOR), z - FLOOR),
            xtol=1e-13, ftol=1e-13, gtol=1e-13,
            max_nfev=2000, x_scale="jac",
        )
        polished_ne = np.asarray(polish.x)
        beta = float(polished_ne.sum())
        feasible = bool(
            polish.success and np.all(np.isfinite(polished_ne))
            and beta > FLOOR and beta < 1.0 - FLOOR
            and np.all(polished_ne >= FLOOR)
            and np.all(polished_ne <= z - FLOOR)
        )
        extract = normalize(np, polished_ne / beta) if feasible else None
        raffinate = (
            normalize(np, (z - polished_ne) / (1.0 - beta))
            if feasible else None
        )
        boundary = bool(
            not feasible
            or np.any(polished_ne <= 10 * FLOOR)
            or np.any(polished_ne >= z - 10 * FLOOR)
        )
        full_gap = (
            float(np.max(np.abs(chemical_potential_gap(polished_ne))))
            if feasible else float("inf")
        )
        residual = (
            float(np.max(np.abs(
                chemical_potential_gap(polished_ne)
                - np.mean(chemical_potential_gap(polished_ne))
            )))
            if feasible else float("inf")
        )
        separation = (
            float(np.max(np.abs(extract - raffinate)))
            if feasible else 0.0
        )
        polished_objective = float(total_gibbs(polished_ne)) if feasible else float(best.fun)
        improvement = homogeneous - polished_objective
        polished_closed = bool(
            feasible and not boundary and separation > 1e-6
            and improvement > 1e-8 and residual <= 2e-5
            and full_gap <= 2e-5
        )
        if feasible and extract[5] < raffinate[5]:
            extract, raffinate = raffinate, extract
            beta = 1.0 - beta
        split_reproduced_and_closed = bool(
            independent_convergence and polished_closed
            and search["minimum"] < -1e-7
        )
        post = (
            {"raffinate": tpd(raffinate), "extract": tpd(extract)}
            if split_reproduced_and_closed else None
        )
        post_stable = bool(
            split_reproduced_and_closed
            and all(row["minimum"] >= -1e-7 for row in post.values())
        )
        accepted = bool(split_reproduced_and_closed and post_stable)
        return {
            "phaseBehavior": "TWO_PHASE_RESEARCH_DIAGNOSTIC" if accepted else (
                "NO_SPLIT_FOUND_DENSE_RESEARCH_SEARCH"
                if independent_convergence and search["minimum"] >= -1e-7 else "UNRESOLVED"),
            "optimizerSuccess": bool(best.success), "optimizerMessage": str(best.message),
            "optimizerIterations": int(best.nit), "boundarySolution": boundary,
            "equilibriumPolish": {
                "method": "BOUNDED_CHEMICAL_POTENTIAL_LEAST_SQUARES",
                "success": bool(polish.success),
                "message": str(polish.message),
                "functionEvaluations": int(polish.nfev),
                "fullChemicalPotentialGapInfinityNorm": full_gap,
                "tangentChemicalPotentialGapInfinityNorm": residual,
                "closed": polished_closed,
            },
            "independentRouteConvergence": independent_convergence,
            "reproducedSplitClusterSize": len(selected_cluster or []),
            "reproducedSplitMethods": sorted({
                row["method"] for row in (selected_cluster or [])
            }),
            "competingClosedClusterCount": len(reproduced_clusters),
            "optimizerRoutes": [row for _, row in route_results],
            "overallTpd": search, "homogeneousObjective": homogeneous,
            "splitObjective": polished_objective, "objectiveImprovement": improvement,
            "phaseFractionExtract": beta if accepted else None,
            "raffinateComposition": raffinate.tolist() if accepted else None,
            "extractComposition": extract.tolist() if accepted else None,
            "isoactivityTangentResidual": (
                residual if split_reproduced_and_closed else None
            ),
            "moleBalanceMaximumResidual": (
                float(np.max(np.abs(
                    z - ((1-beta)*raffinate + beta*extract)
                ))) if feasible else None
            ),
            "postSplitTpd": post,
            "postSplitGloballyStable": (
                post_stable if split_reproduced_and_closed else None
            ),
        }
    return flash, tpd, hessian


def run_case(np, scipy, model, water_wt_pct):
    z, conversion = wet_charge(np, water_wt_pct)
    flash, tpd, hessian = engine(
        np, scipy, model, TEMPERATURE_K, water_wt_pct)
    overall_tpd = tpd(z)
    result = {
        "caseId": f"WATER_{water_wt_pct:.1f}_WT_PCT",
        "temperatureK": TEMPERATURE_K, "components": list(FAMILIES),
        "overallComposition": z.tolist(), "wetSolventConversion": conversion,
        "nativeOverallTpd": overall_tpd, "tangentSpaceHessian": hessian(z),
        "standaloneFlash": flash(z, overall_tpd),
    }
    result["pinnedInputSha256"] = digest({
        "temperatureK": TEMPERATURE_K, "components": list(FAMILIES),
        "feedMass": FEED_MASS, "solventOilRatio": SOLVENT_OIL_RATIO,
        "waterWeightPercentOfWetSolvent": water_wt_pct,
    })
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--water-wt-pct", type=float, help="run one standalone governed flash diagnostic")
    parser.add_argument("--output", type=Path, help="standalone diagnostic JSON destination")
    args = parser.parse_args()
    temporary, np, scipy, model, integrity, runtime = build_model()
    try:
        if args.water_wt_pct is not None:
            case = run_case(np, scipy, model, args.water_wt_pct)
            result = {
                "schemaVersion": "1.0.0", "researchOnly": True,
                "designUseBlocked": True, "releaseEligible": False,
                "directWaterBearingLleValidated": False,
                "decision": "RESEARCH_DIAGNOSTIC_ONLY_NOT_QUALIFIED", "case": case,
            }
            text = json.dumps(result, indent=2, sort_keys=True) + "\n"
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(text)
            else:
                print(text, end="")
            return
        cases = [run_case(np, scipy, model, value) for value in WATER_WT_PCT]
    finally:
        temporary.cleanup()
    numerical = all(
        row["tangentSpaceHessian"]["stepSizeConverged"]
        and row["tangentSpaceHessian"]["independentDerivativeAgreement"]
        and math.isfinite(row["nativeOverallTpd"]["minimum"])
        and row["nativeOverallTpd"]["activeSetKkt"]["passed"]
        and row["nativeOverallTpd"]["independentRouteAgreement"]
        and row["standaloneFlash"]["phaseBehavior"] != "UNRESOLVED"
        and row["standaloneFlash"]["independentRouteConvergence"]
        for row in cases
    )
    blockers = ["DIRECT_WATER_BEARING_LLE_VALIDATION_MISSING", "DESIGN_AND_RELEASE_ADMISSION_BLOCKED"]
    if not numerical:
        blockers.insert(0, "SEVEN_COMPONENT_NUMERICAL_QUALIFICATION_FAILED")
    evidence_path = HERE / "evidence-registry.json"
    evidence = json.loads(evidence_path.read_text())
    evidence_qualification = evidence["qualification"]
    if evidence_qualification["decision"] != "FAIL_CLOSED_DIRECT_WATER_BEARING_LLE_EVIDENCE_INSUFFICIENT":
        raise RuntimeError("WATER_EVIDENCE_REGISTRY_DECISION_UNSUPPORTED")
    integrity["waterEvidenceRegistrySha256"] = sha(evidence_path)
    result = {
        "schemaVersion": "1.2.0", "task": 224,
        "title": "Native SAT+MONO+DI+POLY+PA+NMP+H2O COSMO-SAC research qualification",
        "researchOnly": True, "calibrationRequired": True, "pilotValidated": False,
        "directWaterBearingLleValidated": False, "designUseBlocked": True,
        "releaseEligible": False, "predictiveNt": None, "sulfurPrediction": "NOT_CALCULABLE",
        "model": {
            "name": "COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL + H2O_EXTENSION",
            "componentCount": 7,
            "lnGamma": "native 7C cCOSMO + unchanged governed 6C residual mu(y) for first six; zero residual mu for H2O",
            "residualAmendmentUsed": True,
            "sixComponentInheritanceVerification": (
                "code/model-component verification only; H2O=0 is not a "
                "seven-component calculation or production state"
            ),
            "governedWaterWeightPercentRange": {"minimum": 0.5, "maximum": 3.0},
            "h2oResidualCorrection": "UNESTABLISHED_ZERO_BY_EXTENSION_CONTRACT",
        },
        "runtime": runtime, "integrity": integrity,
        "evidenceQualification": evidence_qualification,
        "governedBasis": {"rrboFeedMass": 100.0, "solventOilMassRatio": SOLVENT_OIL_RATIO,
                          "waterWeightPercentRange": [0.5, 3.0],
                          "rule": "water splits fixed total wet-solvent mass; it is not added on top"},
        "cases": cases, "numericalResearchChecksPassed": numerical,
        "blockers": blockers, "qualifiedForDesignOrRelease": False,
        "finalDecision": "RESEARCH_ONLY_BLOCKED_PENDING_DIRECT_WATER_BEARING_LLE_VALIDATION",
    }
    OUT.mkdir(parents=True, exist_ok=True)
    results_path = OUT / "qualification-results.json"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = [
        "# RESEARCH ONLY — seven-component native COSMO-SAC qualification", "",
        "**Blocked from design and release. Direct water-bearing LLE validation has not passed.**", "",
        f"Frozen evidence decision: `{evidence_qualification['decision']}`", "",
        f"Training bibliography sources: `{evidence_qualification['trainingBibliographySourceCount']}`; "
        f"training numeric records: `{evidence_qualification['trainingNumericRecordCount']}`; "
        f"blind numeric records: `{evidence_qualification['blindNumericRecordCount']}`; "
        f"admissible direct water-bearing LLE records: `{evidence_qualification['admissibleDirectWaterBearingLleRecordCount']}`", "",
        "## Evidence acceptance matrix", "",
        "| Requirement | Required | Governed evidence | Status |",
        "|---|---|---|---|",
        f"| Wet-solvent water grid | 0.5, 1.0, 2.0, 3.0 wt% | {evidence_qualification['admissibleDirectWaterBearingLleRecordCount']} closed tie lines | NOT TESTABLE |",
        f"| Temperature transfer | ≥2 admissible temperatures | {evidence_qualification['admissibleTemperatureCount']} temperatures | NOT QUALIFIED |",
        f"| Hydrocarbon-family coverage | SAT, MONO, DI, POLY, PA | {', '.join(evidence_qualification['coveredHydrocarbonFamilies']) or 'none'} | NOT QUALIFIED |",
        f"| Immutable training/blind numeric partitions | both frozen with provenance and closure | training={evidence_qualification['trainingPartitionFrozen']}; blind={evidence_qualification['blindPartitionFrozen']} | NOT ESTABLISHED |",
        f"| Independent blind validation | unchanged gates pass | {evidence_qualification['independentBlindPartitionPassed']} | FAILED CLOSED |", "",
        f"Numerical research checks passed: `{numerical}`", "",
        "| H2O wt% of wet solvent | overall TPD | flash | post-split stable | minimum Hessian eigenvalue |",
        "|---:|---:|---|---|---:|",
    ]
    for row in cases:
        flash = row["standaloneFlash"]
        report.append(
            f"| {row['wetSolventConversion']['waterWeightPercentOfWetSolvent']:.1f} | "
            f"{row['nativeOverallTpd']['minimum']:.8g} | {flash['phaseBehavior']} | "
            f"{flash['postSplitGloballyStable']} | {row['tangentSpaceHessian']['minimumEigenvalue']:.8g} |"
        )
    report += ["", "Blockers:", *["- `" + value + "`" for value in blockers], "",
               result["finalDecision"]]
    report_path = OUT / "qualification-report.md"
    report_path.write_text("\n".join(report) + "\n")
    provenance = {
        "schemaVersion": "1.0.0", "researchOnly": True, "releaseEligible": False,
        "runnerSha256": sha(HERE / "run_qualification.py"),
        "resultsSha256": sha(results_path), "reportSha256": sha(report_path),
        "pinnedInputs": integrity, "caseInputSha256": {
            row["caseId"]: row["pinnedInputSha256"] for row in cases},
        "waterEvidenceRegistrySha256": sha(evidence_path),
    }
    (OUT / "qualification-provenance.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"decision": result["finalDecision"], "cases": len(cases),
                      "numericalResearchChecksPassed": numerical}, sort_keys=True))


if __name__ == "__main__":
    main()