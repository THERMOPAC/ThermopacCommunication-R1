#!/usr/bin/env python3
"""Fit and qualify the research-only native-7C + RK NMP/oil model."""
from __future__ import annotations

import hashlib
import importlib.util
import itertools
import json
import math
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = Path(
    os.environ.get(
        "TASK238_OUTPUT_DIR",
        ROOT / ".agents/outputs/task-238-nmp-oil-interaction-model",
    )
)
PATHS = {
    "dryEvidence": ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
    "wetDevelopmentEvidence": (
        ROOT
        / ".agents/outputs/three-percent-water-7c-tpd-ab/source-daughter-states.json"
    ),
    "nativeModel": (
        ROOT / "server/research/ecr-pre-pilot-seven-component-native/model.py"
    ),
    "frozen12Engine": (
        ROOT
        / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
    ),
    "frozen13Engine": (
        ROOT
        / "server/research/ecr-pre-pilot-seven-component-native-cascade/engine.py"
    ),
    "frozen12Worker": (
        ROOT
        / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-2/worker.py"
    ),
    "frozen13Worker": (
        ROOT
        / "server/ecr-pre-pilot/predictive-nt-seven-component-v1-3/worker.py"
    ),
    "tpdThresholdAuthority": (
        ROOT
        / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json"
    ),
}
MW = (170.3348, 120.194, 142.1971, 202.2506, 405.58, 99.1311, 18.01528)
PARAMETER_COUNT = 48


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_local():
    spec = importlib.util.spec_from_file_location("task238_rk_model", HERE / "model.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def softmax(np, logits):
    values = np.r_[np.asarray(logits, float), 0.0]
    values -= values.max()
    values = np.exp(values)
    return values / values.sum()


def simplex_lattice(np, components: int, denominator: int):
    rows = []

    def visit(left, dimensions, prefix):
        if dimensions == 1:
            rows.append(np.asarray(prefix + [left], float) / denominator)
            return
        for value in range(left + 1):
            visit(left - value, dimensions - 1, prefix + [value])

    visit(denominator, components, [])
    return rows


def main() -> None:
    protocol = json.loads((HERE / "protocol.json").read_text())
    declaration = json.loads((HERE / "evidence.json").read_text())
    frozen_pins = protocol["frozenEngineHashes"]
    actual_frozen = {
        "7C-1.2.0-engine.py": sha(PATHS["frozen12Engine"]),
        "7C-1.3.0-engine.py": sha(PATHS["frozen13Engine"]),
        "7C-1.2.0-worker.py": sha(PATHS["frozen12Worker"]),
        "7C-1.3.0-worker.py": sha(PATHS["frozen13Worker"]),
    }
    if actual_frozen != frozen_pins:
        raise RuntimeError(f"FROZEN_ENGINE_HASH_MISMATCH:{actual_frozen}")
    threshold_protocol = json.loads(PATHS["tpdThresholdAuthority"].read_text())
    threshold_authority = threshold_protocol["numericalAcceptance"]
    if (
        threshold_authority["negativeTpdThreshold"] != -1e-8
        or threshold_authority["postSplitTpdThreshold"] != -1e-8
        or protocol["acceptance"]["negativeTpdThreshold"] != -1e-8
        or protocol["acceptance"]["postSplitTpdThreshold"] != -1e-8
    ):
        raise RuntimeError("TPD_THRESHOLD_AUTHORITY_MISMATCH")

    # The pinned native loader must initialize before an unpinned NumPy/SciPy
    # import. It returns the exact numerical modules used by the production
    # research engine.
    model = load_local()
    temporary, np, scipy, native, native_integrity, runtime = model.load_native()
    from scipy.linalg import null_space
    from scipy.optimize import (
        LinearConstraint,
        differential_evolution,
        least_squares,
        minimize,
    )

    source = json.loads(PATHS["wetDevelopmentEvidence"].read_text())
    dry = json.loads(PATHS["dryEvidence"].read_text())
    names = source["componentOrder"]
    if names != protocol["componentOrder"]:
        raise RuntimeError("COMPONENT_ORDER_MISMATCH")
    construction = source["wetSolventConstruction"]
    if construction["waterWeightPercentOfWetSolvent"] != 3:
        raise RuntimeError("EXACT_THREE_PERCENT_WATER_SOURCE_REQUIRED")
    masses = np.asarray([construction["componentMass"][name] for name in names])
    parent = masses / np.asarray(MW)
    parent /= parent.sum()
    development_stage = source["trials"][0]["stages"][0]
    target_raffinate = np.asarray(
        development_stage["raffinateLeavingMoleFractions"], float
    )
    target_extract = np.asarray(
        development_stage["extractLeavingMoleFractions"], float
    )
    target_direction = target_extract - target_raffinate
    target_beta = float(
        (parent - target_raffinate) @ target_direction
        / (target_direction @ target_direction)
    )
    target_closure = float(
        np.max(
            np.abs(
                parent
                - (
                    (1.0 - target_beta) * target_raffinate
                    + target_beta * target_extract
                )
            )
        )
    )
    if target_closure > protocol["acceptance"]["maximumMaterialClosureResidual"]:
        raise RuntimeError("DEVELOPMENT_TIE_LINE_DOES_NOT_CLOSE_EXACT_PARENT")

    zero_parameters = np.zeros(PARAMETER_COUNT)

    def native_total(composition, temperature_k):
        return model.total(
            np, native, composition, temperature_k, zero_parameters
        )[:2]

    def correction_feature_matrices(composition, temperature_k):
        scalar, ambient_gradient = model.features(np, composition, temperature_k)
        composition = np.asarray(composition, float)
        partial_molar = (
            ambient_gradient
            + scalar[np.newaxis, :]
            - (composition @ ambient_gradient)[np.newaxis, :]
        )
        return scalar, partial_molar

    def dry_composition(row, phase):
        value = np.full(7, 1e-12)
        for index, name in ((0, "SAT"), (1, "MONO"), (5, "NMP")):
            value[index] = float(row[phase].get(name, 0.0))
        return value / value.sum()

    sorted_dry_rows = sorted(
        dry["tieLines"],
        key=lambda row: (
            row["source"],
            row["T_K"],
            row["components"]["SAT"],
            row["components"]["MONO"],
        ),
    )
    training_source_rows = [
        row for index, row in enumerate(sorted_dry_rows) if index % 5 != 0
    ]
    held_source_rows = [
        row for index, row in enumerate(sorted_dry_rows) if index % 5 == 0
    ]

    def prepare_dry_row(row, partition):
        raffinate = dry_composition(row, "raffinate")
        extract = dry_composition(row, "extract")
        temperature_k = float(row["T_K"])
        active = [
            index
            for index in (0, 1, 5)
            if min(raffinate[index], extract[index]) > 1e-9
        ]
        _, native_mu_r = native_total(raffinate, temperature_k)
        _, native_mu_e = native_total(extract, temperature_k)
        _, feature_mu_r = correction_feature_matrices(raffinate, temperature_k)
        _, feature_mu_e = correction_feature_matrices(extract, temperature_k)
        return {
            "partition": partition,
            "nativeResidual": (native_mu_r - native_mu_e)[active],
            "featureResidual": (feature_mu_r - feature_mu_e)[active, :],
        }

    training_rows = [
        prepare_dry_row(row, "DRY_TRAINING") for row in training_source_rows
    ]
    held_rows = [
        prepare_dry_row(row, "DRY_HELD_OUT") for row in held_source_rows
    ]
    dry_matrix = np.vstack([row["featureResidual"] for row in training_rows])
    dry_native = np.concatenate([row["nativeResidual"] for row in training_rows])

    # The water-bearing historical row is admitted only as a development
    # calibration row. Exact chemical-potential equality is imposed as a
    # linear constraint; it is never counted as direct or blind evidence.
    _, wet_native_mu_r = native_total(target_raffinate, protocol["temperatureK"])
    _, wet_native_mu_e = native_total(target_extract, protocol["temperatureK"])
    _, wet_feature_mu_r = correction_feature_matrices(
        target_raffinate, protocol["temperatureK"]
    )
    _, wet_feature_mu_e = correction_feature_matrices(
        target_extract, protocol["temperatureK"]
    )
    wet_matrix = wet_feature_mu_r - wet_feature_mu_e
    wet_native = wet_native_mu_r - wet_native_mu_e
    particular = np.linalg.lstsq(wet_matrix, -wet_native, rcond=1e-12)[0]
    wet_nullspace = null_space(wet_matrix, rcond=1e-12)
    if (
        np.linalg.matrix_rank(wet_matrix) != 7
        or np.max(np.abs(wet_matrix @ particular + wet_native)) > 1e-10
    ):
        raise RuntimeError("WET_DEVELOPMENT_EQUALITY_CONSTRAINT_RANK_FAILURE")

    def tpd_linear_parts(reference, candidate):
        native_g_r, native_mu_r = native_total(reference, protocol["temperatureK"])
        native_g_w, _ = native_total(candidate, protocol["temperatureK"])
        feature_g_r, feature_mu_r = correction_feature_matrices(
            reference, protocol["temperatureK"]
        )
        feature_g_w, _ = correction_feature_matrices(
            candidate, protocol["temperatureK"]
        )
        native_part = float(
            native_g_w - native_g_r - native_mu_r @ (candidate - reference)
        )
        feature_part = (
            feature_g_w
            - feature_g_r
            - feature_mu_r.T @ (candidate - reference)
        )
        return native_part, feature_part

    parent_tpd_constraints = [
        tpd_linear_parts(parent, target_raffinate),
        tpd_linear_parts(parent, target_extract),
    ]
    ridge = float(protocol["fit"]["ridgePenalty"])
    absolute_bound = float(protocol["fit"]["absoluteParameterBound"])

    def unpack_fit(reduced):
        return particular + wet_nullspace @ reduced

    def fit_objective(reduced):
        parameters = unpack_fit(reduced)
        dry_residual = dry_matrix @ parameters + dry_native
        return float(
            np.mean(dry_residual**2) + ridge * np.mean(parameters**2)
        )

    def fit_gradient(reduced):
        parameters = unpack_fit(reduced)
        return 2.0 * wet_nullspace.T @ (
            dry_matrix.T
            @ (dry_matrix @ parameters + dry_native)
            / len(dry_native)
            + ridge * parameters / PARAMETER_COUNT
        )

    fit_constraints = [
        LinearConstraint(
            wet_nullspace,
            -absolute_bound - particular,
            absolute_bound - particular,
        )
    ]
    minimum_parent_reduction = float(
        protocol["fit"]["minimumParentDaughterTpdReduction"]
    )
    for native_part, feature_part in parent_tpd_constraints:
        fit_constraints.append(
            LinearConstraint(
                feature_part @ wet_nullspace,
                -np.inf,
                -minimum_parent_reduction
                - native_part
                - feature_part @ particular,
            )
        )
    fitted = minimize(
        fit_objective,
        np.zeros(wet_nullspace.shape[1]),
        jac=fit_gradient,
        constraints=fit_constraints,
        method="SLSQP",
        options={"ftol": 1e-12, "maxiter": 2000},
    )
    parameters = unpack_fit(fitted.x)
    wet_fit_residual = wet_matrix @ parameters + wet_native
    if (
        not fitted.success
        or np.max(np.abs(parameters)) > absolute_bound + 1e-8
        or np.max(np.abs(wet_fit_residual))
        > protocol["acceptance"]["maximumChemicalPotentialResidual"]
    ):
        raise RuntimeError(f"RK_FIT_FAILED:{fitted.message}")

    def partition_metrics(rows):
        residuals = np.concatenate(
            [
                row["featureResidual"] @ parameters + row["nativeResidual"]
                for row in rows
            ]
        )
        return {
            "rows": len(rows),
            "equations": len(residuals),
            "chemicalPotentialEqualityRms": float(
                np.sqrt(np.mean(residuals**2))
            ),
            "maximumAbsoluteResidual": float(np.max(np.abs(residuals))),
        }

    dry_ceiling = 0.03
    training_metrics = partition_metrics(training_rows)
    held_metrics = partition_metrics(held_rows)
    training_metrics["ceiling"] = dry_ceiling
    held_metrics["ceiling"] = dry_ceiling
    training_metrics["status"] = (
        "PASS"
        if training_metrics["chemicalPotentialEqualityRms"] <= dry_ceiling
        else "FAIL"
    )
    held_metrics["status"] = (
        "PASS"
        if held_metrics["chemicalPotentialEqualityRms"] <= dry_ceiling
        else "FAIL"
    )

    def total(composition):
        return model.total(
            np, native, composition, protocol["temperatureK"], parameters
        )

    def gibbs(composition):
        return total(composition)[0]

    def chemical_potential(composition):
        return total(composition)[1]

    def tpd(reference, candidate):
        return float(
            gibbs(candidate)
            - gibbs(reference)
            - chemical_potential(reference) @ (candidate - reference)
        )

    def derivative_reconstruction(composition):
        composition = np.asarray(composition, float)
        h = 1e-6
        reconstructed = []
        analytical = []
        mu = chemical_potential(composition)
        for index in range(6):
            direction = np.zeros(7)
            direction[index] = 1.0
            direction[6] = -1.0
            reconstructed.append(
                (gibbs(composition + h * direction) - gibbs(composition - h * direction))
                / (2.0 * h)
            )
            analytical.append(mu[index] - mu[6])
        difference = np.asarray(reconstructed) - np.asarray(analytical)
        return {
            "simplexFiniteDifference": reconstructed,
            "analyticChemicalPotentialDifference": analytical,
            "maximumAbsoluteDifference": float(np.max(np.abs(difference))),
        }

    derivative_checks = {
        "parent": derivative_reconstruction(parent),
        "raffinateTarget": derivative_reconstruction(target_raffinate),
        "extractTarget": derivative_reconstruction(target_extract),
    }
    maximum_derivative_difference = max(
        row["maximumAbsoluteDifference"] for row in derivative_checks.values()
    )
    if (
        maximum_derivative_difference
        > protocol["acceptance"]["maximumDerivativeReconstructionDifference"]
    ):
        raise RuntimeError("TOTAL_GIBBS_DERIVATIVE_RECONSTRUCTION_FAILED")

    parent_tpd = {
        "raffinateDevelopmentBranch": tpd(parent, target_raffinate),
        "extractDevelopmentBranch": tpd(parent, target_extract),
    }

    # Route A: constrained minimization over component moles assigned to one
    # phase. Generic and perturbed starts are included with the fitted branch.
    epsilon = 1e-10

    def split_objective(extract_moles):
        beta = float(np.sum(extract_moles))
        if beta <= epsilon or beta >= 1.0 - epsilon:
            return 1e3
        extract = extract_moles / beta
        raffinate = (parent - extract_moles) / (1.0 - beta)
        return float(
            beta * gibbs(extract) + (1.0 - beta) * gibbs(raffinate)
        )

    phase_mole_starts = [
        ("DEVELOPMENT_BRANCH", target_beta * target_extract),
        ("LABEL_REVERSED_BRANCH", (1.0 - target_beta) * target_raffinate),
        ("PERTURBED_BRANCH_90", 0.9 * target_beta * target_extract + 0.1 * target_beta * parent),
        ("PERTURBED_BRANCH_70", 0.7 * target_beta * target_extract + 0.3 * target_beta * parent),
        ("HOMOGENEOUS_25", 0.25 * parent),
        ("HOMOGENEOUS_50", 0.50 * parent),
        ("HOMOGENEOUS_75", 0.75 * parent),
    ]
    gibbs_solutions = []
    bounds = [(epsilon, float(value - epsilon)) for value in parent]
    for label, start in phase_mole_starts:
        solved = minimize(
            split_objective,
            np.clip(start, epsilon, parent - epsilon),
            method="L-BFGS-B",
            bounds=bounds,
            options={
                "ftol": 1e-15,
                "gtol": 1e-10,
                "maxiter": 2000,
                "maxls": 50,
            },
        )
        beta = float(np.sum(solved.x))
        extract = solved.x / beta
        raffinate = (parent - solved.x) / (1.0 - beta)
        if raffinate[5] > extract[5]:
            raffinate, extract, beta = extract, raffinate, 1.0 - beta
        gibbs_solutions.append(
            {
                "seed": label,
                "success": bool(solved.success),
                "objective": float(solved.fun),
                "betaExtract": beta,
                "raffinate": raffinate.tolist(),
                "extract": extract.tolist(),
            }
        )
    separated_gibbs_solutions = [
        row
        for row in gibbs_solutions
        if max(
            np.abs(np.asarray(row["raffinate"]) - np.asarray(row["extract"]))
        )
        > 0.1
    ]
    gibbs_branch = min(separated_gibbs_solutions, key=lambda row: row["objective"])
    gibbs_raffinate = np.asarray(gibbs_branch["raffinate"])
    gibbs_extract = np.asarray(gibbs_branch["extract"])
    gibbs_beta = float(gibbs_branch["betaExtract"])

    # Route B: independently solve common chemical potentials plus material
    # balance in log-ratio coordinates.
    def unpack_branch(values):
        raffinate = softmax(np, values[:6])
        extract = softmax(np, values[6:12])
        beta = 1.0 / (1.0 + np.exp(-values[12]))
        return raffinate, extract, beta

    def branch_residual(values):
        raffinate, extract, beta = unpack_branch(values)
        return np.r_[
            chemical_potential(raffinate) - chemical_potential(extract),
            ((1.0 - beta) * raffinate + beta * extract - parent)[:6],
        ]

    branch_start = np.r_[
        np.log(target_raffinate[:-1] / target_raffinate[-1]),
        np.log(target_extract[:-1] / target_extract[-1]),
        math.log(target_beta / (1.0 - target_beta)),
    ]
    common_tangent_solutions = []
    for offset in (0.0, 0.02, -0.02):
        direction = np.r_[np.ones(6), -np.ones(6), 1.0]
        solved = least_squares(
            branch_residual,
            branch_start + offset * direction,
            xtol=1e-13,
            ftol=1e-13,
            gtol=1e-13,
            max_nfev=3000,
        )
        raffinate, extract, beta = unpack_branch(solved.x)
        if raffinate[5] > extract[5]:
            raffinate, extract, beta = extract, raffinate, 1.0 - beta
        common_tangent_solutions.append(
            {
                "success": bool(solved.success),
                "maximumResidual": float(np.max(np.abs(solved.fun))),
                "objective": float(
                    (1.0 - beta) * gibbs(raffinate) + beta * gibbs(extract)
                ),
                "betaExtract": beta,
                "raffinate": raffinate.tolist(),
                "extract": extract.tolist(),
            }
        )
    common_branch = min(
        common_tangent_solutions,
        key=lambda row: (row["maximumResidual"], row["objective"]),
    )
    branch_raffinate = np.asarray(common_branch["raffinate"])
    branch_extract = np.asarray(common_branch["extract"])
    branch_beta = float(common_branch["betaExtract"])
    material_closure = float(
        np.max(
            np.abs(
                parent
                - (
                    (1.0 - branch_beta) * branch_raffinate
                    + branch_beta * branch_extract
                )
            )
        )
    )
    chemical_potential_residual = float(
        np.max(
            np.abs(
                chemical_potential(branch_raffinate)
                - chemical_potential(branch_extract)
            )
        )
    )
    beta_agreement = abs(gibbs_beta - branch_beta)
    phase_agreement = float(
        max(
            np.max(np.abs(gibbs_raffinate - branch_raffinate)),
            np.max(np.abs(gibbs_extract - branch_extract)),
        )
    )
    gibbs_reduction = float(
        (1.0 - branch_beta) * gibbs(branch_raffinate)
        + branch_beta * gibbs(branch_extract)
        - gibbs(parent)
    )

    former_mono_seed = np.asarray(
        development_stage["persistedPostSplitTpdSearch"]["raffinate"][
            "minimizingComposition"
        ],
        float,
    )

    def tpd_audit(reference, phase_name, other_phase):
        reference = np.asarray(reference, float)
        reference_g = gibbs(reference)
        reference_mu = chemical_potential(reference)

        def objective(candidate):
            candidate = np.asarray(candidate, float)
            return float(
                gibbs(candidate)
                - reference_g
                - reference_mu @ (candidate - reference)
            )

        denominator = int(protocol["search"]["simplexLatticeDenominator"])
        lattice = simplex_lattice(np, 7, denominator)
        lattice_rows = [(objective(row), row) for row in lattice]
        lattice_best = min(lattice_rows, key=lambda row: row[0])
        bound = float(protocol["search"]["globalLogitBound"])
        global_result = differential_evolution(
            lambda values: objective(softmax(np, values)),
            [(-bound, bound)] * 6,
            seed=238,
            popsize=int(protocol["search"]["globalPopulation"]),
            maxiter=int(protocol["search"]["globalIterations"]),
            tol=1e-9,
            polish=True,
            workers=1,
        )
        global_composition = softmax(np, global_result.x)
        face_rows = []
        for omitted in range(7):
            active = [index for index in range(7) if index != omitted]

            def face_composition(values):
                value = np.zeros(7)
                value[active] = softmax(np, values)
                return value

            face_result = differential_evolution(
                lambda values: objective(face_composition(values)),
                [(-bound, bound)] * 5,
                seed=238 + omitted,
                popsize=int(protocol["search"]["facePopulation"]),
                maxiter=int(protocol["search"]["faceIterations"]),
                tol=1e-9,
                polish=True,
                workers=1,
            )
            composition = face_composition(face_result.x)
            face_rows.append(
                {
                    "omittedComponent": names[omitted],
                    "minimum": objective(composition),
                    "composition": composition.tolist(),
                }
            )
        edge_rows = []
        intervals = int(protocol["search"]["edgeGridIntervals"])
        identity = np.eye(7)
        for left, right in itertools.combinations(range(7), 2):
            candidates = [
                identity[left] * fraction + identity[right] * (1.0 - fraction)
                for fraction in np.linspace(0.0, 1.0, intervals + 1)
            ]
            values = [objective(candidate) for candidate in candidates]
            selected = int(np.argmin(values))
            edge_rows.append(
                {
                    "components": [names[left], names[right]],
                    "minimum": float(values[selected]),
                    "composition": candidates[selected].tolist(),
                }
            )
        local_rows = []
        local_seeds = [
            ("REFERENCE", reference),
            ("OTHER_PHASE", other_phase),
            ("PARENT", parent),
            ("FORMER_MONO_BASIN", former_mono_seed),
            ("MONO_DOMINANT", np.asarray([0.01, 0.90, 0.01, 0.01, 0.01, 0.03, 0.03])),
        ]
        for label, seed in local_seeds:
            seed = np.maximum(seed, 1e-12)
            seed /= seed.sum()
            solved = minimize(
                lambda values: objective(softmax(np, values)),
                np.log(seed[:-1] / seed[-1]),
                method="BFGS",
                options={"gtol": 1e-9, "maxiter": 1000},
            )
            composition = softmax(np, solved.x)
            local_rows.append(
                {
                    "seed": label,
                    "minimum": objective(composition),
                    "composition": composition.tolist(),
                    "optimizerSuccess": bool(solved.success),
                }
            )
        candidates = [
            {
                "route": "LATTICE",
                "minimum": float(lattice_best[0]),
                "composition": lattice_best[1].tolist(),
            },
            {
                "route": "GLOBAL_INTERIOR",
                "minimum": float(global_result.fun),
                "composition": global_composition.tolist(),
            },
            *[
                {"route": "FACE", **row}
                for row in face_rows
            ],
            *[
                {"route": "EDGE", **row}
                for row in edge_rows
            ],
            *[
                {"route": "LOCAL", **row}
                for row in local_rows
            ],
        ]
        best = min(candidates, key=lambda row: row["minimum"])
        best_composition = np.asarray(best["composition"])
        h = 1e-6
        finite_difference_simplex_gradient = []
        for index in range(6):
            direction = np.zeros(7)
            direction[index] = 1.0
            direction[6] = -1.0
            finite_difference_simplex_gradient.append(
                (
                    gibbs(reference + h * direction)
                    - gibbs(reference - h * direction)
                )
                / (2.0 * h)
            )
        finite_difference_simplex_gradient = np.asarray(
            finite_difference_simplex_gradient
        )
        finite_difference_replay = float(
            gibbs(best_composition)
            - reference_g
            - finite_difference_simplex_gradient
            @ (best_composition[:-1] - reference[:-1])
        )
        return {
            "phase": phase_name,
            "minimum": float(best["minimum"]),
            "minimizingComposition": best["composition"],
            "minimumRoute": best["route"],
            "verdict": (
                "NO_NEGATIVE_FOUND"
                if best["minimum"]
                >= protocol["acceptance"]["postSplitTpdThreshold"]
                else "NEGATIVE_FOUND"
            ),
            "finiteSearchNotGlobalProof": True,
            "coverage": {
                "simplexLatticeDenominator": denominator,
                "simplexLatticePoints": len(lattice),
                "faceCount": len(face_rows),
                "edgeCount": len(edge_rows),
                "localSeeds": [row["seed"] for row in local_rows],
            },
            "routeMinima": {
                "lattice": float(lattice_best[0]),
                "globalInterior": float(global_result.fun),
                "faces": float(min(row["minimum"] for row in face_rows)),
                "edges": float(min(row["minimum"] for row in edge_rows)),
                "local": float(min(row["minimum"] for row in local_rows)),
            },
            "finiteDifferenceObjectiveReplay": finite_difference_replay,
            "analyticObjectiveReplay": objective(best_composition),
            "objectiveReplayAbsoluteDifference": abs(
                finite_difference_replay - objective(best_composition)
            ),
            "formerMonoSeedRefinement": next(
                row for row in local_rows if row["seed"] == "FORMER_MONO_BASIN"
            ),
        }

    post_split_tpd = {
        "raffinate": tpd_audit(
            branch_raffinate, "raffinate", branch_extract
        ),
        "extract": tpd_audit(
            branch_extract, "extract", branch_raffinate
        ),
    }

    # The historical failure region is declared before this search. The scan
    # covers MONO >= 0.5 with an explicit constrained grid, the persisted false
    # minimizer, and a separate constrained global optimizer.
    mono_floor = float(protocol["search"]["monoRegionFloor"])
    rest_indices = (0, 2, 3, 4, 5, 6)

    def mono_region_composition(values):
        mono_unit = 1.0 / (1.0 + np.exp(-values[0]))
        mono = mono_floor + (1.0 - mono_floor) * mono_unit
        composition = np.zeros(7)
        composition[1] = mono
        composition[list(rest_indices)] = (1.0 - mono) * softmax(np, values[1:])
        return composition

    def mono_region_start(composition):
        composition = np.asarray(composition, float)
        unit = (composition[1] - mono_floor) / (1.0 - mono_floor)
        unit = min(max(unit, 1e-12), 1.0 - 1e-12)
        rest = np.maximum(composition[list(rest_indices)], 1e-12)
        rest /= rest.sum()
        return np.r_[math.log(unit / (1.0 - unit)), np.log(rest[:-1] / rest[-1])]

    mono_levels = (0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99, 0.999999)
    rest_lattice = simplex_lattice(np, 6, 3)
    mono_region_results = {}
    for phase_name, reference in (
        ("raffinate", branch_raffinate),
        ("extract", branch_extract),
    ):
        grid_rows = []
        for mono in mono_levels:
            for rest in rest_lattice:
                composition = np.zeros(7)
                composition[1] = mono
                composition[list(rest_indices)] = (1.0 - mono) * rest
                grid_rows.append((tpd(reference, composition), composition))
        grid_best = min(grid_rows, key=lambda row: row[0])
        global_result = differential_evolution(
            lambda values: tpd(reference, mono_region_composition(values)),
            [(-18.0, 18.0)] * 6,
            seed=511,
            popsize=int(protocol["search"]["monoRegionPopulation"]),
            maxiter=int(protocol["search"]["monoRegionIterations"]),
            tol=1e-9,
            polish=True,
            workers=1,
        )
        global_composition = mono_region_composition(global_result.x)
        local_result = minimize(
            lambda values: tpd(reference, mono_region_composition(values)),
            mono_region_start(former_mono_seed),
            method="BFGS",
            options={"gtol": 1e-9, "maxiter": 1000},
        )
        local_composition = mono_region_composition(local_result.x)
        routes = [
            {
                "route": "CONSTRAINED_GRID",
                "minimum": float(grid_best[0]),
                "composition": grid_best[1].tolist(),
            },
            {
                "route": "CONSTRAINED_GLOBAL",
                "minimum": float(global_result.fun),
                "composition": global_composition.tolist(),
            },
            {
                "route": "HISTORICAL_SEED_LOCAL",
                "minimum": tpd(reference, local_composition),
                "composition": local_composition.tolist(),
            },
            {
                "route": "HISTORICAL_SEED_DIRECT",
                "minimum": tpd(reference, former_mono_seed),
                "composition": former_mono_seed.tolist(),
            },
        ]
        selected = min(routes, key=lambda row: row["minimum"])
        mono_region_results[phase_name] = {
            "minimum": selected["minimum"],
            "minimizingComposition": selected["composition"],
            "minimumRoute": selected["route"],
            "gridPointCount": len(grid_rows),
            "routes": routes,
        }
    mono_minimum = min(
        row["minimum"] for row in mono_region_results.values()
    )

    acceptance = protocol["acceptance"]
    numerical_gate = bool(
        fitted.success
        and parent_tpd["raffinateDevelopmentBranch"]
        < acceptance["negativeTpdThreshold"]
        and parent_tpd["extractDevelopmentBranch"]
        < acceptance["negativeTpdThreshold"]
        and gibbs_reduction < acceptance["negativeTpdThreshold"]
        and 1.0 - branch_beta > acceptance["minimumPhaseAmount"]
        and branch_beta > acceptance["minimumPhaseAmount"]
        and material_closure <= acceptance["maximumMaterialClosureResidual"]
        and chemical_potential_residual
        <= acceptance["maximumChemicalPotentialResidual"]
        and branch_extract[5] - branch_raffinate[5]
        >= acceptance["minimumNmpContrast"]
        and branch_raffinate[0] - branch_extract[0]
        >= acceptance["minimumSatContrast"]
        and beta_agreement <= acceptance["maximumIndependentBetaDifference"]
        and phase_agreement
        <= acceptance["maximumIndependentCompositionDifference"]
        and maximum_derivative_difference
        <= acceptance["maximumDerivativeReconstructionDifference"]
        and all(
            row["minimum"] >= acceptance["postSplitTpdThreshold"]
            for row in post_split_tpd.values()
        )
        and mono_minimum >= acceptance["postSplitTpdThreshold"]
    )
    if not numerical_gate:
        raise RuntimeError("TASK238_RK_NUMERICAL_GATES_FAILED")

    dry_blind_passed = held_metrics["status"] == "PASS"
    blockers = [
        blocker
        for blocked, blocker in (
            (
                not dry_blind_passed,
                "DECLARED_DRY_HELD_OUT_REPRODUCTION_FAILED",
            ),
            (
                not protocol["governance"]["directWaterBearingLleAvailable"],
                "DIRECT_WATER_BEARING_LLE_EVIDENCE_MISSING",
            ),
            (
                not protocol["governance"]["blindWaterBearingLleAvailable"],
                "BLIND_WATER_BEARING_LLE_EVIDENCE_MISSING",
            ),
        )
        if blocked
    ]
    release_eligible = (
        numerical_gate
        and dry_blind_passed
        and protocol["governance"]["directWaterBearingLleAvailable"]
        and protocol["governance"]["blindWaterBearingLleAvailable"]
    )
    if release_eligible:
        raise RuntimeError("TASK238_RESEARCH_ARTIFACT_MUST_REMAIN_FAIL_CLOSED")

    result = {
        "schemaVersion": "TASK_238_NMP_OIL_RK_RESULTS_V2",
        "artifactVersion": protocol["artifactVersion"],
        "scope": {
            "researchOnly": True,
            "productionRoutingChanged": False,
            "defaultChanged": False,
            "frozenFilesModified": False,
        },
        "evidence": {
            "declaration": declaration,
            "dryDeclaredRowCount": len(sorted_dry_rows),
            "waterBearingClassification": declaration[
                "waterBearingDevelopmentTopology"
            ]["classification"],
            "developmentTargetIsDirectQualification": False,
            "developmentTargetIsBlindEvidence": False,
        },
        "thermodynamics": {
            "totalScalarGibbs": "g_native + Delta_g",
            "nativeRetainedInAllCalculations": True,
            "nativeModel": "NATIVE_SEVEN_COMPONENT_CCOSMO_2010",
            "deltaGForm": protocol["model"]["basis"],
            "analyticPartialMolarCorrection": True,
            "derivativeReconstruction": derivative_checks,
            "maximumDerivativeReconstructionDifference": (
                maximum_derivative_difference
            ),
        },
        "fit": {
            "method": (
                "CONSTRAINED_RIDGE_FIT_WITH_EXACT_DEVELOPMENT_TIE_LINE_"
                "CHEMICAL_POTENTIAL_EQUALITY"
            ),
            "basisPairCount": len(model.PAIRS),
            "basisOrders": list(model.ORDERS),
            "parameterCount": len(parameters),
            "parameters": parameters.tolist(),
            "parameterMaximumAbsoluteValue": float(np.max(np.abs(parameters))),
            "parameterL2Norm": float(np.linalg.norm(parameters)),
            "absoluteParameterBound": absolute_bound,
            "ridgePenalty": ridge,
            "optimizerSuccess": bool(fitted.success),
            "optimizerMessage": str(fitted.message),
            "wetDevelopmentChemicalPotentialEqualityMaximumResidual": float(
                np.max(np.abs(wet_fit_residual))
            ),
            "trainingDry": training_metrics,
            "heldOutDry": held_metrics,
        },
        "parent": {
            "temperatureK": protocol["temperatureK"],
            "waterWeightPercentOfWetSolvent": (
                protocol["waterWeightPercentOfWetSolvent"]
            ),
            "sourceMasses": masses.tolist(),
            "molecularWeights": list(MW),
            "composition": parent.tolist(),
            "developmentTopologyClosureResidual": target_closure,
            "daughterTpd": parent_tpd,
            "unstableTowardDistinctNmpOilBranch": True,
        },
        "split": {
            "raffinate": branch_raffinate.tolist(),
            "extract": branch_extract.tolist(),
            "betaExtract": branch_beta,
            "betaRaffinate": 1.0 - branch_beta,
            "positivePhaseAmounts": True,
            "positiveComponentAmounts": bool(
                np.all(branch_raffinate > 0.0) and np.all(branch_extract > 0.0)
            ),
            "oilRichRaffinate": bool(
                branch_raffinate[0] > branch_extract[0]
            ),
            "nmpRichExtract": bool(
                branch_extract[5] > branch_raffinate[5]
            ),
            "materialClosureMaxResidual": material_closure,
            "chemicalPotentialMaxResidual": chemical_potential_residual,
            "gibbsReduction": gibbs_reduction,
            "gibbsMinimization": {
                "selected": gibbs_branch,
                "multistartResults": gibbs_solutions,
            },
            "commonTangent": {
                "selected": common_branch,
                "multistartResults": common_tangent_solutions,
            },
            "independentRouteAgreement": {
                "betaAbsoluteDifference": beta_agreement,
                "maximumPhaseCompositionDifference": phase_agreement,
                "gibbsObjectiveAbsoluteDifference": abs(
                    gibbs_branch["objective"] - common_branch["objective"]
                ),
            },
        },
        "postSplitTpd": post_split_tpd,
        "formerMonoRichBasinAudit": {
            "predeclaredRegion": f"x_MONO >= {mono_floor}",
            "historicalSeed": former_mono_seed.tolist(),
            "phaseResults": mono_region_results,
            "minimum": mono_minimum,
            "negativeMonoRichBasinFound": mono_minimum
            < acceptance["postSplitTpdThreshold"],
            "conclusion": "NO_NEGATIVE_FOUND_IN_DECLARED_FINITE_SEARCH",
            "finiteSearchNotGlobalProof": True,
        },
        "numericalGate": {
            "passed": numerical_gate,
            "thresholdsChanged": False,
            "cascadeSolverChanged": False,
        },
        "engineHashPreservation": {
            "matchesProtocolPins": actual_frozen == frozen_pins,
            "hashes": actual_frozen,
            "preserved": True,
        },
        "releaseGate": {
            "declaredDryHeldOutReproductionPassed": dry_blind_passed,
            "directWaterBearingLleQualificationPassed": False,
            "blindWaterBearingLleQualificationPassed": False,
            "predictiveEligible": False,
            "releaseEligible": release_eligible,
            "status": "FAIL_CLOSED_RESEARCH_ONLY",
            "blockers": blockers,
        },
        "nativeIntegrity": native_integrity,
        "runtime": runtime,
        "pinnedInputHashes": {
            name: sha(path) for name, path in PATHS.items()
        },
    }

    OUT.mkdir(parents=True, exist_ok=True)
    results_path = OUT / "results.json"
    report_path = OUT / "report.md"
    results_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report_path.write_text(
        "# Task 238 NMP/oil interaction model\n\n"
        "**Research-only, separately versioned, not Predictive N_T or release "
        "eligible.**\n\n"
        "The replacement is one thermodynamically integrable scalar model: "
        "`g_total/RT = g_native_7C/RT + delta_g_RK/RT`. Native seven-component "
        "cCOSMO remains in every fit, flash, Gibbs, and TPD evaluation. The "
        "additive Redlich–Kister interaction has 48 bounded coefficients over "
        "eight declared pairs and three polynomial orders.\n\n"
        f"All {len(sorted_dry_rows)} declared dry rows were partitioned before "
        f"fitting ({len(training_rows)} training, {len(held_rows)} held out). "
        f"Training chemical-potential RMS is "
        f"{training_metrics['chemicalPotentialEqualityRms']:.6f}; held-out RMS "
        f"is {held_metrics['chemicalPotentialEqualityRms']:.6f}. The historical "
        "water-bearing N_T=1 row is an explicitly declared development "
        "calibration row, not direct or blind qualification.\n\n"
        "At the exact 3 wt% water parent, the fitted model has negative TPD "
        f"toward both development branches ({parent_tpd['raffinateDevelopmentBranch']:.6e}, "
        f"{parent_tpd['extractDevelopmentBranch']:.6e}) and a two-phase Gibbs "
        f"reduction of {gibbs_reduction:.6e}. Independent phase-mole Gibbs and "
        "common-tangent routes agree with maximum phase-composition difference "
        f"{phase_agreement:.3e} and beta difference {beta_agreement:.3e}. "
        f"Material closure is {material_closure:.3e}; the chemical-potential "
        f"residual is {chemical_potential_residual:.3e}. The raffinate is "
        "oil/SAT-rich and the extract is NMP-rich, with positive phase and "
        "component amounts.\n\n"
        "Full-simplex lattice, interior global, every face, every edge, and "
        "phase-local searches found no negative post-split TPD. A separately "
        "constrained MONO-rich search over x_MONO >= 0.5 included the persisted "
        "historical false-basin seed and found no negative basin. These are "
        "declared finite-search findings, not a mathematical global proof.\n\n"
        "**FAIL CLOSED.** The dry held-out evidence gate remains failed, and "
        "direct plus blind water-bearing LLE evidence are absent. Frozen "
        "7C-1.2.0 and 7C-1.3.0 engines/workers, production routing, cascade "
        "solver, and TPD thresholds are unchanged.\n"
    )
    manifest = {
        "schemaVersion": "TASK_238_PROVENANCE_MANIFEST_V2",
        "artifactFiles": {
            name: sha(HERE / name)
            for name in (
                "protocol.json",
                "evidence.json",
                "model.py",
                "run.py",
                "verify.py",
            )
        },
        "inputs": result["pinnedInputHashes"],
        "outputs": {
            "results.json": sha(results_path),
            "report.md": sha(report_path),
        },
    }
    (OUT / "provenance-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    temporary.cleanup()
    try:
        displayed_output = str(OUT.relative_to(ROOT))
    except ValueError:
        displayed_output = str(OUT)
    print(
        json.dumps(
            {
                "status": "PASS_RESEARCH_ONLY",
                "numericalGatePassed": numerical_gate,
                "releaseEligible": release_eligible,
                "output": displayed_output,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()