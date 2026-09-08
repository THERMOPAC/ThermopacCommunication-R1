#!/usr/bin/env python3
"""Strict entry point for one explicitly identified final Lobatto candidate.

No candidate is inferred.  The caller must supply the exact candidate file
hash, exact interface hash, and exact row selector.  The numerical searches
remain bounded research qualification evidence, not a formal global-stability
certificate or transport-model certification.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
import signal
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CORE_PATH = HERE / "check_candidate_stability.py"
ADAPTER_PATH = HERE / "boundary_adapter.py"
LOADER_PATH = HERE / "verify_thermo.py"
SPARSE_V10_SCHEMA = "ISOLATED_SAVED_CELL_1_SPARSE_V10_TERMINAL"
SUPPORTED_SCHEMAS = (SPARSE_V10_SCHEMA,)
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
MONO_INDEX = 1
TPD_THRESHOLD = -1e-8
CURVATURE_THRESHOLD = -1e-6
SCIENTIFIC_BUDGET_SECONDS = 180
V10_WARM_EXPECTED_SHA256 = (
    "81cd9295dea730da37ddca9c9ff87451f85ba70df3f4803c37bd41c2c82bd394"
)


def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sha(path):
    return sha_bytes(Path(path).read_bytes())


def digest(value):
    return sha_bytes(json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode())


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("EXACT_CANDIDATE_MODULE_LOAD_FAILED:" + str(path))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def root_fingerprint(row):
    """Reproduce sparse_collocation_v10.root_fingerprint byte-for-byte."""
    np = __import__("numpy")
    arrays = [
        row["flux"], row["interfaceContinuous"], row["interfaceDispersed"],
        row["continuousProfile"]["bernsteinControls"],
        row["dispersedProfile"]["bernsteinControls"],
    ]
    value = hashlib.sha256()
    for item in arrays:
        array = np.asarray(item, dtype=np.float64)
        value.update(str(array.shape).encode())
        value.update(array.tobytes())
    return value.hexdigest()


def profile_values(record, points):
    """Evaluate serialized piecewise cubic Bernstein controls."""
    np = __import__("numpy")
    mesh = np.asarray(record["mesh"], dtype=float)
    controls = np.asarray(record["bernsteinControls"], dtype=float)
    points = np.asarray(points, dtype=float)
    if (
        mesh.ndim != 1 or controls.shape != (len(mesh) - 1, 4, 7)
        or not np.all(np.diff(mesh) > 0.0)
    ):
        raise ValueError("V10_SERIALIZED_BERNSTEIN_PROFILE_SHAPE_INVALID")
    interval = np.searchsorted(mesh, points, side="right") - 1
    interval = np.clip(interval, 0, len(mesh) - 2)
    t = (
        (points - mesh[interval])
        / (mesh[interval + 1] - mesh[interval])
    )
    selected = controls[interval]
    omt = 1.0 - t
    return (
        omt[:, None] ** 3 * selected[:, 0]
        + 3.0 * omt[:, None] ** 2 * t[:, None] * selected[:, 1]
        + 3.0 * omt[:, None] * t[:, None] ** 2 * selected[:, 2]
        + t[:, None] ** 3 * selected[:, 3]
    )


def accepted_v10_root(row):
    jacobian = row.get("reducedJacobian", {})
    audits = (row.get("continuousAudit", {}), row.get("dispersedAudit", {}))
    return bool(
        row.get("status") == "CONVERGED"
        and row.get("numericalAccepted") is True
        and jacobian.get("fullRank") is True
        and isinstance(jacobian.get("rank"), int)
        and jacobian.get("rank") == jacobian.get("dimension")
        and all(
            audit.get("status") == "NUMERICAL_PROFILE_CHECKS_PASSED"
            and audit.get("allBernsteinControlsNonnegative") is True
            and audit.get("wholeCurveNonnegativeByConvexHull") is True
            and audit.get("literalEndpointsEvaluatedAuthoritatively") is True
            and isinstance(
                audit.get("maximumNormalizationDefect"), (int, float)
            )
            and math.isfinite(audit["maximumNormalizationDefect"])
            and audit["maximumNormalizationDefect"] <= 1e-12
            for audit in audits
        )
    )


def require_source_bindings(document):
    bindings = {
        "gateSha256": ROOT / "research-results/finite-film-boundary-qualification.json",
        "testSha256": ROOT / "research-results/finite-film-sparse-collocation-v10-test-v6.json",
    }
    for key, path in bindings.items():
        if document.get(key) != sha(path):
            raise ValueError("V10_INPUT_BINDING_MISMATCH:" + key)
    warm = (
        ROOT
        / "research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"
    )
    if sha(warm) != V10_WARM_EXPECTED_SHA256:
        raise ValueError("V10_WARM_INPUT_BINDING_MISMATCH")
    snapshots = document.get("executedSourceSnapshots")
    required_names = {
        "attempt_cell1_sparse_v10.py", "sparse_collocation_v10.py",
        "solver.py", "thermo_adapter.py", "exact_cache.py",
        "bernstein_profile_v5.py", "boundary_adapter.py", "verify_thermo.py",
    }
    if not isinstance(snapshots, dict):
        raise ValueError("V10_EXECUTED_SOURCE_BINDINGS_MISSING")
    by_name = {Path(path).name: (path, expected)
               for path, expected in snapshots.items()}
    if set(by_name) != required_names:
        raise ValueError("V10_EXECUTED_SOURCE_BINDING_SET_MISMATCH")
    for name, (relative, expected) in by_name.items():
        path = ROOT / relative
        if not path.is_file() or sha(path) != expected:
            raise ValueError("V10_EXECUTED_SOURCE_BINDING_MISMATCH:" + name)
    return {
        "gateSha256": document["gateSha256"],
        "testSha256": document["testSha256"],
        "executedSourceSnapshots": snapshots,
        "warmInputSha256": V10_WARM_EXPECTED_SHA256,
    }


def admit_exact_candidate(document, selector):
    """Recompute every v10 terminal gate; never infer a row or acceptance."""
    np = __import__("numpy")
    if document.get("schemaVersion") != SPARSE_V10_SCHEMA:
        raise ValueError("UNSUPPORTED_EXACT_CANDIDATE_SCHEMA")
    branches = document.get("branches")
    decision = document.get("qualificationDecision")
    if (
        document.get("outcome")
        != "NUMERICAL_CANDIDATE_FOR_MATCHED_STABILITY"
        or not isinstance(decision, dict)
        or decision.get("qualified") is not True
        or not isinstance(branches, list)
        or len(branches) != 2
        or branches[0].get("start") != "ARCHIVED_17_WARM"
        or branches[1].get("start") != "INDEPENDENT_ORIENTED"
    ):
        raise ValueError("SPARSE_V10_TERMINAL_QUALIFICATION_NOT_MET")
    archived = branches[0].get("levels")
    independent = branches[1].get("levels")
    if (
        not isinstance(archived, list) or len(archived) < 3
        or not isinstance(independent, list) or len(independent) < 3
        or selector != f"branches[0].levels[{len(archived) - 1}]"
    ):
        raise ValueError("SPARSE_V10_EXPLICIT_ARCHIVED_FINAL_SELECTOR_REQUIRED")
    if not all(
        a.get("nodes") < b.get("nodes")
        for levels in (archived, independent)
        for a, b in zip(levels[:-1], levels[1:])
    ):
        raise ValueError("SPARSE_V10_LEVELS_NOT_STRICTLY_INCREASING")
    final_pair = archived[-2:]
    drift_fields = (
        "maximumScaledFluxDriftFromPrevious",
        "maximumInterfaceDriftFromPrevious",
        "maximumCommonCoordinateProfileDriftFromPrevious",
    )
    if not all(
        accepted_v10_root(row)
        and all(
            isinstance(row.get(field), (int, float))
            and math.isfinite(row[field]) and row[field] <= 1e-8
            for field in drift_fields
        )
        for row in final_pair
    ):
        raise ValueError("SPARSE_V10_FINAL_PAIR_GATE_NOT_MET")
    target, reproduced = archived[-1], independent[-1]
    if not accepted_v10_root(reproduced):
        raise ValueError("SPARSE_V10_INDEPENDENT_FINAL_ROOT_NOT_ACCEPTED")
    target_hash = root_fingerprint(target)
    if (
        document.get("candidateHash") != target_hash
        or decision.get("comparisonTargetRootHash") != target_hash
        or decision.get("successiveQualifyingPair")
        != [final_pair[0]["nodes"], final_pair[1]["nodes"]]
        or decision.get("independentFinalQualified") is not True
        or reproduced.get("nodes") != target.get("nodes")
    ):
        raise ValueError("SPARSE_V10_ROOT_FINGERPRINT_OR_DECISION_MISMATCH")
    gc = np.asarray(document["input"]["continuousConductances"], dtype=float)
    gd = np.asarray(document["input"]["dispersedConductances"], dtype=float)
    target_flux = np.asarray(target["flux"], dtype=float)
    reproduced_flux = np.asarray(reproduced["flux"], dtype=float)
    scaled_flux = float(np.max(
        np.abs(reproduced_flux - target_flux) / np.maximum(gc, gd)
    ))
    interface = float(max(
        np.max(np.abs(
            np.asarray(reproduced["interfaceContinuous"])
            - np.asarray(target["interfaceContinuous"])
        )),
        np.max(np.abs(
            np.asarray(reproduced["interfaceDispersed"])
            - np.asarray(target["interfaceDispersed"])
        )),
    ))
    common = np.linspace(0.0, 1.0, 2049)
    profile = float(max(
        np.max(np.abs(
            profile_values(reproduced["continuousProfile"], common)
            - profile_values(target["continuousProfile"], common)
        )),
        np.max(np.abs(
            profile_values(reproduced["dispersedProfile"], common)
            - profile_values(target["dispersedProfile"], common)
        )),
    ))
    if max(scaled_flux, interface, profile) > 1e-8:
        raise ValueError("SPARSE_V10_INDEPENDENT_ROOT_REPRODUCTION_NOT_MET")
    bindings = require_source_bindings(document)
    return target, {
        "schema": SPARSE_V10_SCHEMA,
        "explicitFinalSelector": selector,
        "terminalOutcomeAccepted": True,
        "qualificationDecisionRechecked": True,
        "finalTwoLevels": [row["nodes"] for row in final_pair],
        "allFinalPairDriftsAtOrBelow1e-8": True,
        "allFinalPairRootsNumericalFullRankNormalizedAndProfileAccepted": True,
        "candidateRootFingerprintIncludingBernsteinControls": target_hash,
        "independentFinalRootFingerprintIncludingBernsteinControls": (
            root_fingerprint(reproduced)
        ),
        "independentFinalReproduction": {
            "maximumScaledFluxDifference": scaled_flux,
            "maximumInterfaceDifference": interface,
            "maximumCommonCoordinateProfileDifference": profile,
        },
        "inputAndExecutedSourceBindings": bindings,
    }


def source_paths(core):
    base = core.verify_thermo.BASE
    return {
        "entryPoint": Path(__file__),
        "stabilityCore": CORE_PATH,
        "boundaryAdapter": ADAPTER_PATH,
        "pinnedLoader": LOADER_PATH,
        "pinnedHistoricalEngine": (
            base
            / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
        ),
        "pinnedRkEngine": (
            base
            / "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
        ),
        "pinnedRkModel": (
            base
            / "server/research/ecr-pre-pilot-seven-component-rk-cascade/model.py"
        ),
        "candidateDriverV10": HERE / "attempt_cell1_sparse_v10.py",
        "candidateSolverV10": HERE / "sparse_collocation_v10.py",
        "candidateSolverDependency": HERE / "solver.py",
        "candidateThermoDependency": HERE / "thermo_adapter.py",
        "candidateCacheDependency": HERE / "exact_cache.py",
        "candidateProfileDependency": HERE / "bernstein_profile_v5.py",
    }


def freeze_inputs(output, candidate_path, candidate_bytes, core, document):
    """Copy every executed Python source and exact input before computation."""
    archive = Path(str(output) + ".sources")
    if output.exists() or archive.exists():
        raise FileExistsError("OUTPUT_OR_SOURCE_ARCHIVE_ALREADY_EXISTS")
    archive.mkdir(parents=True)
    files = {}
    for label, path in source_paths(core).items():
        content = path.read_bytes()
        destination = archive / f"{label}-{path.name}"
        destination.write_bytes(content)
        files[label] = {
            "executedPath": str(path.resolve().relative_to(ROOT)),
            "sha256": sha_bytes(content),
            "archivedPath": str(destination.resolve().relative_to(ROOT)),
        }
    candidate_copy = archive / "exact-candidate-input.json"
    candidate_copy.write_bytes(candidate_bytes)
    files["candidateInput"] = {
        "executedPath": str(candidate_path.resolve().relative_to(ROOT)),
        "sha256": sha_bytes(candidate_bytes),
        "archivedPath": str(candidate_copy.resolve().relative_to(ROOT)),
    }
    bound = {
        "boundGateEvidence": (
            ROOT / "research-results/finite-film-boundary-qualification.json"
        ),
        "boundV10TestEvidence": (
            ROOT
            / "research-results/finite-film-sparse-collocation-v10-test-v6.json"
        ),
        "boundWarmInput": (
            ROOT
            / "research-results/finite-film-cell1-lobatto-v6-focused-refinement.json"
        ),
    }
    for index, relative in enumerate(
        sorted(document["executedSourceSnapshots"])
    ):
        bound[f"candidateExecutedSnapshot{index}"] = ROOT / relative
    for label, path in bound.items():
        content = path.read_bytes()
        destination = archive / f"{label}-{path.name}"
        destination.write_bytes(content)
        files[label] = {
            "executedPath": str(path.resolve().relative_to(ROOT)),
            "sha256": sha_bytes(content),
            "archivedPath": str(destination.resolve().relative_to(ROOT)),
        }
    manifest = {
        "schemaVersion": "EXACT_CANDIDATE_EXECUTED_SOURCE_FREEZE_V1",
        "createdBeforeScientificEvaluation": True,
        "files": files,
    }
    manifest_path = archive / "manifest.json"
    manifest_path.write_text(json.dumps(
        manifest, indent=2, sort_keys=True, allow_nan=False
    ) + "\n")
    return archive, manifest, sha(manifest_path)


def additional_cobyla_search(core, evaluator, objective, seed):
    """Optional robustness diagnostic; it never repairs a required SLSQP flag."""
    np = evaluator.np
    scipy = evaluator.adapter.engine.scipy
    seed = evaluator.simplex(seed)
    dependent = max(
        (i for i in range(7) if i != MONO_INDEX),
        key=lambda i: (seed[i], -i),
    )
    independent = [i for i in range(7) if i != dependent]
    q0 = seed[independent]

    def composition(q):
        return core.reduced_simplex(np, q, dependent)

    def value(q):
        x = composition(q)
        if (
            np.any(x < 0.0)
            or x[MONO_INDEX] < 0.5
            or abs(float(x.sum()) - 1.0) > 2e-12
        ):
            violation = (
                float(np.maximum(-x, 0.0).sum())
                + max(0.0, 0.5 - float(x[MONO_INDEX]))
            )
            return 1e6 + 1e6 * violation
        return objective(x)

    constraints = [
        {"type": "ineq", "fun": lambda q, i=i: float(q[i])}
        for i in range(6)
    ] + [
        {"type": "ineq", "fun": lambda q: float(1.0 - np.sum(q))},
        {"type": "ineq", "fun": lambda q: float(
            composition(q)[MONO_INDEX] - 0.5
        )},
    ]

    def run():
        return scipy.optimize.minimize(
            value, q0, method="COBYLA", constraints=constraints,
            options={
                "catol": 1e-10, "tol": 1e-10,
                "maxiter": 3000, "rhobeg": 0.05,
            },
        )

    solution, replay = run(), run()
    x, replay_x = composition(solution.x), composition(replay.x)
    physical = bool(
        np.all(x >= 0.0)
        and abs(float(x.sum()) - 1.0) <= 2e-12
        and x[MONO_INDEX] >= 0.5 - 2e-12
    )
    replay_physical = bool(
        np.all(replay_x >= 0.0)
        and abs(float(replay_x.sum()) - 1.0) <= 2e-12
        and replay_x[MONO_INDEX] >= 0.5 - 2e-12
    )
    kkt = (
        core.physical_directional_kkt(
            evaluator, objective, x, mono_rich=True
        ) if physical else None
    )
    replay_kkt = (
        core.physical_directional_kkt(
            evaluator, objective, replay_x, mono_rich=True
        ) if replay_physical else None
    )
    minimum = float(objective(x)) if physical else math.inf
    replay_minimum = float(objective(replay_x)) if replay_physical else math.inf
    accepted = bool(
        solution.success and replay.success
        and physical and replay_physical
        and kkt["accepted"] and replay_kkt["accepted"]
        and minimum >= TPD_THRESHOLD and replay_minimum >= TPD_THRESHOLD
        and abs(minimum - replay_minimum) <= 1e-10
        and np.max(np.abs(x - replay_x)) <= 1e-8
    )
    return {
        "method": "COBYLA_ADDITIONAL_DIAGNOSTIC",
        "canOverrideRequiredSlsqpFlags": False,
        "dependentComponentIndex": dependent,
        "minimum": minimum if math.isfinite(minimum) else None,
        "composition": x.tolist(),
        "optimizerSuccess": bool(solution.success),
        "optimizerStatus": int(solution.status),
        "optimizerMessage": str(solution.message),
        "physicalDirectionalKkt": kkt,
        "replayMinimum": (
            replay_minimum if math.isfinite(replay_minimum) else None
        ),
        "replayOptimizerSuccess": bool(replay.success),
        "replayPhysicalDirectionalKkt": replay_kkt,
        "replayMaximumCompositionDifference": float(
            np.max(np.abs(x - replay_x))
        ),
        "acceptedAsAdditionalDiagnostic": accepted,
    }


def mono_with_optional_robustness(core, evaluator, composition):
    required = core.mono_rich_search(evaluator, composition, 298.15)
    reference_mu = evaluator.mu(composition)

    def objective(x):
        return evaluator.tpd_objective(x, reference_mu)

    additional = []
    for index, search in enumerate(required["searches"]):
        if not search["accepted"]:
            additional.append({
                "requiredSearchIndex": index,
                "requiredSearchFailurePreserved": True,
                "result": additional_cobyla_search(
                    core, evaluator, objective, core.MONO_SEEDS[index]
                ),
            })
    required["additionalRobustSearches"] = additional
    required["additionalSearchesCanOverrideRequiredFlags"] = False
    required["accepted"] = bool(
        required["allRequiredSearchesAccepted"]
        and required["minimum"] >= TPD_THRESHOLD
    )
    return required


def timeout_handler(_signum, _frame):
    raise TimeoutError("SCIENTIFIC_STABILITY_BUDGET_EXCEEDED_180_SECONDS")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--expected-candidate-sha256", required=True)
    parser.add_argument("--selector", required=True)
    parser.add_argument("--expected-interface-sha256", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    core = load_module("exact_candidate_stability_core", CORE_PATH)
    if tuple(core.FAMILIES) != FAMILIES or FAMILIES[MONO_INDEX] != "MONO":
        raise RuntimeError("COMPONENT_IDENTITY_MISMATCH")
    candidate_bytes = args.candidate.read_bytes()
    if sha_bytes(candidate_bytes) != args.expected_candidate_sha256:
        raise ValueError("EXACT_CANDIDATE_FILE_HASH_MISMATCH")
    document = json.loads(candidate_bytes)
    if document.get("schemaVersion") not in SUPPORTED_SCHEMAS:
        raise ValueError("UNSUPPORTED_EXACT_CANDIDATE_SCHEMA")
    row, admission = admit_exact_candidate(document, args.selector)
    interfaces = {
        "continuous": row["interfaceContinuous"],
        "dispersed": row["interfaceDispersed"],
    }
    interface_hash = digest(interfaces)
    if interface_hash != args.expected_interface_sha256:
        raise ValueError("EXACT_INTERFACE_HASH_MISMATCH")
    archive, manifest, manifest_hash = freeze_inputs(
        args.output, args.candidate, candidate_bytes, core, document
    )

    started = time.monotonic()
    temporary = None
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(SCIENTIFIC_BUDGET_SECONDS)
    report = {
        "schemaVersion": "EXACT_LOBATTO_CANDIDATE_STABILITY_V1",
        "scope": "EXACT_HASHED_FINAL_INTERFACES_ONLY",
        "candidate": {
            "path": str(args.candidate.resolve().relative_to(ROOT)),
            "fileSha256": args.expected_candidate_sha256,
            "selector": args.selector,
            "interfaceSourceSha256": interface_hash,
            "interfaces": interfaces,
            "numericalAccepted": True,
            "upstreamAdmission": admission,
        },
        "componentIdentity": {
            "orderedFamilies": list(FAMILIES), "monoIndex": MONO_INDEX,
        },
        "thresholds": {
            "postSplitTpdThreshold": TPD_THRESHOLD,
            "minimumLocalStabilityCurvature": CURVATURE_THRESHOLD,
        },
        "sourceFreeze": {
            "directory": str(archive.resolve().relative_to(ROOT)),
            "manifestSha256": manifest_hash,
            "createdBeforeScientificEvaluation": True,
            "files": manifest["files"],
        },
        "effectiveResistanceAssumption": (
            "USER_APPROVED_FOR_PRE_PILOT_SIZING_CONDITIONAL_ON_UNCHANGED_"
            "NUMERICAL_AND_STABILITY_GATES"
        ),
        "qualificationIsFormalGlobalStabilityCertificate": False,
        "qualificationIsTransportCertification": False,
        "productionRuns": [],
        "columnContinuationRun": False,
        "realSolverRun": False,
    }
    try:
        _, engine, temporary, lineage = core.verify_thermo.load_pinned_adapter()
        states, audit, archived_flux = core.verify_thermo.archived_state()
        np = engine.np
        input_row = document["input"]
        exact_inputs = (
            ("continuousBulk", states["cell1_continuous"]),
            ("dispersedBulk", states["cell1_dispersed"]),
            ("freshDispersedInlet", states["literal_zero_dry_inlet"]),
            ("continuousConductances", audit["solver"].kcct),
            ("dispersedConductances", audit["solver"].kdct),
        )
        if (
            not all(
                np.array_equal(np.asarray(input_row[key]), expected)
                for key, expected in exact_inputs
            )
            or float(input_row["archivedTotalFluxForReferenceOnly"])
            != float(archived_flux)
        ):
            raise RuntimeError("V10_LITERAL_ARCHIVED_INPUT_BINDING_MISMATCH")
        adapter = core.BoundaryExcessAdapter(engine, 298.15)
        evaluator = core.UnflooredEvaluator(adapter)
        report["lineage"] = lineage
        report["literalArchivedInputBindingRechecked"] = True
        phases = {}
        for name, raw in interfaces.items():
            x = evaluator.simplex(raw, positive=True)
            local = core.local_stability(evaluator, x, 298.15)
            routine = core.routine_tpd(evaluator, x, 298.15)
            mono = mono_with_optional_robustness(core, evaluator, x)
            phases[name] = {
                "composition": x.tolist(),
                "localCurvature": local,
                "routineTpd": routine,
                "explicitMonoRichBasinSearch": mono,
                "accepted": bool(
                    local["stepSizeConverged"]
                    and local["minimumEigenvalue"] >= CURVATURE_THRESHOLD
                    and routine["minimum"] >= TPD_THRESHOLD
                    and routine["allRefinementsAccepted"]
                    and not routine["ambiguityTriggered"]
                    and routine["accepted"]
                    and mono["minimum"] >= TPD_THRESHOLD
                    and mono["allRequiredSearchesAccepted"]
                    and mono["accepted"]
                ),
            }
        report["phases"] = phases
        report["qualified"] = all(x["accepted"] for x in phases.values())
        report["outcome"] = (
            "PASS_EXACT_CANDIDATE_BOUNDED_STABILITY_QUALIFICATION"
            if report["qualified"]
            else "BLOCKED_EXACT_CANDIDATE_STABILITY"
        )
        report["blockers"] = [] if report["qualified"] else [
            name for name, value in phases.items() if not value["accepted"]
        ]
        report["evaluationAudit"] = {
            "thermodynamicEvaluationCount": evaluator.calls,
            "literalZeroThermodynamicEvaluationCount": (
                evaluator.literal_zero_calls
            ),
            "engineFlooringApisCalled": False,
        }
    except Exception as error:
        report["qualified"] = False
        report["outcome"] = "BLOCKED_EXACT_CANDIDATE_CHECKER_ERROR"
        report["blockers"] = [f"{type(error).__name__}: {error}"]
    finally:
        signal.alarm(0)
        if temporary is not None:
            temporary.cleanup()
    report["scientificElapsedSeconds"] = time.monotonic() - started
    report["entryPointSha256"] = sha(__file__)
    args.output.write_text(json.dumps(
        report, indent=2, sort_keys=True, allow_nan=False
    ) + "\n")


if __name__ == "__main__":
    main()