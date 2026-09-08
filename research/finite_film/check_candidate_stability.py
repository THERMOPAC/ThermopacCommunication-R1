#!/usr/bin/env python3
"""Isolated, unfloored stability checks for one finite-film interface candidate.

This is research evidence only.  It does not call a film, column, flash, or
continuation solver.  The search layout follows the pinned 7C engine, while
all thermodynamic values are obtained from BoundaryExcessAdapter at the
literal composition rather than through engine.normalize/engine.mu.
"""
from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import math
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import verify_thermo
from boundary_adapter import BoundaryExcessAdapter

FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
CURVATURE_THRESHOLD = -1e-6
TPD_THRESHOLD = -1e-8
LOCAL_STEPS = (5e-4, 2.5e-4)
LATTICE_DENOMINATOR = 4
# This only makes finite optimizer coordinates from a boundary seed.  It is
# never applied in an objective or reported as a thermodynamic composition.
LOGIT_SEED_INTERIORIZATION = 1e-14
MONO_SEEDS = (
    (0.0016297769949390418, 0.9378227986135558, 0.009939119181714848,
     0.003764367614353866, 0.0024240944731290306, 0.019007400853443164,
     0.025412442268864147),
    (0.1, 0.7, 0.04, 0.02, 0.02, 0.1, 0.02),
    (0.2, 0.5, 0.05, 0.03, 0.02, 0.15, 0.05),
)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def digest(value):
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), allow_nan=False
    ).encode()
    return hashlib.sha256(encoded).hexdigest()


def lattice(np):
    for cuts in itertools.combinations(
        range(LATTICE_DENOMINATOR + 7 - 1), 6
    ):
        marks = (-1,) + cuts + (LATTICE_DENOMINATOR + 7 - 1,)
        yield np.asarray(
            [marks[i + 1] - marks[i] - 1 for i in range(7)], dtype=float
        ) / LATTICE_DENOMINATOR


class UnflooredEvaluator:
    """Literal-simplex ideal plus direct-native/RK excess evaluator."""

    def __init__(self, adapter):
        self.adapter = adapter
        self.np = adapter.np
        self.calls = 0
        self.literal_zero_calls = 0

    def simplex(self, value, *, positive=False):
        x = self.np.asarray(value, dtype=float)
        if (
            x.shape != (7,)
            or not self.np.all(self.np.isfinite(x))
            or self.np.any(x < 0.0)
            or abs(float(x.sum()) - 1.0) > 2e-12
            or (positive and self.np.any(x <= 0.0))
        ):
            raise ValueError("UNFLOORED_PHYSICAL_SIMPLEX_REQUIRED")
        return x

    def excess(self, value):
        x = self.simplex(value)
        self.calls += 1
        self.literal_zero_calls += int(self.np.any(x == 0.0))
        return self.adapter.excess(x)

    def mu(self, value):
        x = self.simplex(value, positive=True)
        return self.np.log(x) + self.excess(x)

    def tpd_objective(self, trial, reference_mu):
        """Use lim(x log x)=0; excess is still evaluated at literal zeros."""
        x = self.simplex(trial)
        lngamma = self.excess(x)
        present = x > 0.0
        return float(
            self.np.sum(
                x[present]
                * (
                    self.np.log(x[present])
                    + lngamma[present]
                    - reference_mu[present]
                )
            )
        )


def softmax(np, y):
    full = np.r_[np.asarray(y, dtype=float), 0.0]
    full -= np.max(full)
    exponential = np.exp(full)
    return exponential / exponential.sum()


def seed_logits(np, composition):
    seed = np.asarray(composition, dtype=float)
    adjusted = (1.0 - 7.0 * LOGIT_SEED_INTERIORIZATION) * seed
    adjusted += LOGIT_SEED_INTERIORIZATION
    return np.log(adjusted[:-1] / adjusted[-1])


def reduced_simplex(np, coordinates, dependent_index):
    """Map six physical coordinates to the simplex without normalization."""
    coordinates = np.asarray(coordinates, dtype=float)
    value = np.empty(7, dtype=float)
    value[[i for i in range(7) if i != dependent_index]] = coordinates
    value[dependent_index] = 1.0 - float(coordinates.sum())
    return value


def physical_refinement(evaluator, objective, seed, *, mono_rich=False):
    """SLSQP in six literal mole fractions with an exact dependent fraction.

    Choosing the largest seed component as dependent makes a simplex vertex
    mobile: adding an absent component simultaneously removes material from
    the vertex component.  Invalid finite-difference probes are rejected
    numerically and are never passed to the thermodynamic evaluator.
    """
    np = evaluator.np
    scipy = evaluator.adapter.engine.scipy
    seed = evaluator.simplex(seed)
    dependent = int(np.argmax(seed))
    independent = [i for i in range(7) if i != dependent]
    q0 = seed[independent]

    def composition(q):
        return reduced_simplex(np, q, dependent)

    def reduced_objective(q):
        x = composition(q)
        violation = max(
            0.0, -float(np.min(x)), abs(float(x.sum()) - 1.0) - 2e-12
        )
        if violation:
            return 1e6 + 1e6 * violation
        return objective(x)

    constraints = [{
        "type": "ineq",
        "fun": lambda q: float(1.0 - np.sum(q)),
    }]
    if mono_rich:
        constraints.append({
            "type": "ineq",
            "fun": lambda q: float(composition(q)[1] - 0.5),
        })
    solution = scipy.optimize.minimize(
        reduced_objective,
        q0,
        method="SLSQP",
        bounds=[(0.0, 1.0)] * 6,
        constraints=tuple(constraints),
        options={"ftol": 1e-12, "maxiter": 1000},
    )
    x = composition(solution.x)
    return solution, x, dependent


def physical_directional_kkt(evaluator, objective, composition, *, mono_rich=False):
    """Check all feasible ordered pair-transfer derivatives at one scale."""
    np = evaluator.np
    x = evaluator.simplex(composition)
    step = 1e-7
    center = objective(x)
    rows = []
    for receiver in range(7):
        for donor in range(7):
            if receiver == donor or x[donor] < step:
                continue
            trial = x.copy()
            trial[receiver] += step
            trial[donor] -= step
            if mono_rich and trial[1] < 0.5 - 2e-12:
                continue
            derivative = (objective(trial) - center) / step
            rows.append({
                "receiver": receiver,
                "donor": donor,
                "derivative": float(derivative),
            })
    minimum = min((row["derivative"] for row in rows), default=-math.inf)
    tolerance = 2e-5
    return {
        "method": "all feasible ordered pair transfers e_i-e_j",
        "step": step,
        "directionCount": len(rows),
        "minimumFeasibleDirectionalDerivative": float(minimum),
        "acceptanceTolerance": tolerance,
        "accepted": bool(rows and minimum >= -tolerance),
        "directions": rows,
    }


def local_stability(evaluator, composition, temperature_k):
    """Source-equivalent two-step log-ratio Hessian, without engine floors."""
    np = evaluator.np
    z = evaluator.simplex(composition, positive=True)
    y0 = np.log(z[:-1] / z[-1])
    reference_mu = evaluator.mu(z)

    def value(y):
        return evaluator.tpd_objective(softmax(np, y), reference_mu)

    spectra = []
    for step in LOCAL_STEPS:
        hessian = np.zeros((6, 6))
        center = value(y0)
        eye = np.eye(6)
        for i in range(6):
            di = eye[i] * step
            hessian[i, i] = (
                value(y0 + di) - 2.0 * center + value(y0 - di)
            ) / step**2
            for j in range(i):
                dj = eye[j] * step
                hessian[i, j] = hessian[j, i] = (
                    value(y0 + di + dj)
                    - value(y0 + di - dj)
                    - value(y0 - di + dj)
                    + value(y0 - di - dj)
                ) / (4.0 * step**2)
        spectra.append(np.linalg.eigvalsh(hessian))
    gates = evaluator.adapter.engine.gates
    allowed = gates["hessianEigenvalueAbsoluteTolerance"] + (
        gates["hessianEigenvalueRelativeTolerance"]
        * np.maximum(np.abs(spectra[0]), np.abs(spectra[1]))
    )
    converged = bool(np.all(np.abs(spectra[0] - spectra[1]) <= allowed))
    minimum = float(spectra[1][0])
    return {
        "dimension": 6,
        "coordinate": "six independent log mole-fraction ratios ln(x_i/x_H2O)",
        "steps": list(LOCAL_STEPS),
        "coarseEigenvalues": spectra[0].tolist(),
        "eigenvalues": spectra[1].tolist(),
        "minimumEigenvalue": minimum,
        "stepSizeConverged": converged,
        "threshold": CURVATURE_THRESHOLD,
        "accepted": bool(converged and minimum >= CURVATURE_THRESHOLD),
        "evaluationRoute": "UNFLOORED_DIRECT_NATIVE_PLUS_UNCHANGED_TASK238_RK",
    }


def routine_tpd(evaluator, composition, temperature_k):
    """Pinned routine coverage with literal coarse values and unfloored BFGS."""
    np = evaluator.np
    scipy = evaluator.adapter.engine.scipy
    reference = evaluator.simplex(composition, positive=True)
    reference_mu = evaluator.mu(reference)

    def objective_x(x):
        return evaluator.tpd_objective(x, reference_mu)

    def objective_y(y):
        return objective_x(softmax(np, y))

    grid = list(lattice(np))
    if len(grid) != 210:
        raise RuntimeError("SEVEN_COMPONENT_ROUTINE_LATTICE_INVALID")
    coarse = sorted(
        ((objective_x(x), x) for x in grid),
        key=lambda row: (row[0], tuple(row[1].tolist())),
    )
    global_seeds = [("GLOBAL_SIMPLEX", x) for _, x in coarse[:6]]
    local_seeds = []
    reference_logits = np.log(reference[:-1] / reference[-1])
    for direction in np.eye(6):
        local_seeds.extend((
            ("PHASE_LOCAL_LOG_RATIO_PERTURBATION",
             softmax(np, reference_logits + 1e-3 * direction)),
            ("PHASE_LOCAL_LOG_RATIO_PERTURBATION",
             softmax(np, reference_logits - 1e-3 * direction)),
        ))
    seeds = global_seeds + [("REFERENCE_PHASE", reference)] + local_seeds
    evaluations = [
        {"seedClass": label, "value": objective_x(seed),
         "composition": seed.tolist()}
        for label, seed in seeds
    ]
    # Match refine_best_global_and_local=True: exactly the best member of each
    # named class.  Boundary seeds are interiorized only to obtain finite
    # log-ratio coordinates; every optimizer objective remains unfloored.
    selected = [
        min(
            (row for row in evaluations if row["seedClass"] == label),
            key=lambda row: (row["value"], tuple(row["composition"])),
        )
        for label in (
            "GLOBAL_SIMPLEX", "PHASE_LOCAL_LOG_RATIO_PERTURBATION"
        )
    ]
    refinements = []
    for row in selected:
        seed = np.asarray(row["composition"], dtype=float)
        solution, refined_x, dependent = physical_refinement(
            evaluator, objective_x, seed
        )
        kkt = physical_directional_kkt(
            evaluator, objective_x, refined_x
        )
        moved = float(np.max(np.abs(refined_x - seed)))
        accepted = bool(solution.success and kkt["accepted"])
        refinements.append({
            "seedClass": row["seedClass"],
            "value": objective_x(refined_x),
            "composition": refined_x.tolist(),
            "optimizerSuccess": bool(solution.success),
            "acceptedByPhysicalKktRule": accepted,
            "dependentComponentIndex": dependent,
            "maximumCompositionMovementFromSeed": moved,
            "pureOrBoundarySeedDemonstrablyMobile": bool(
                np.all(seed > 0.0) or moved > 1e-8
            ),
            "physicalDirectionalKkt": kkt,
            "status": int(solution.status),
            "message": str(solution.message),
        })
    best = min(
        evaluations + refinements,
        key=lambda row: (row["value"], tuple(row["composition"])),
    )
    all_refinements = all(
        row["acceptedByPhysicalKktRule"]
        and row["pureOrBoundarySeedDemonstrablyMobile"]
        for row in refinements
    )
    minimum = float(best["value"])
    class_minima = {
        label: min(
            (row["value"] for row in refinements
             if row["seedClass"] == label),
            default=math.inf,
        )
        for label in (
            "GLOBAL_SIMPLEX", "PHASE_LOCAL_LOG_RATIO_PERTURBATION"
        )
    }
    near_threshold = bool(
        minimum < TPD_THRESHOLD / 10.0
        and abs(minimum - TPD_THRESHOLD) <= 2e-7
    )
    disagreement = bool(
        all(math.isfinite(value) for value in class_minima.values())
        and (
            (class_minima["GLOBAL_SIMPLEX"] < TPD_THRESHOLD)
            != (
                class_minima[
                    "PHASE_LOCAL_LOG_RATIO_PERTURBATION"
                ] < TPD_THRESHOLD
            )
        )
    )
    ambiguity = bool(not all_refinements or near_threshold or disagreement)
    return {
        "minimum": minimum,
        "minimizingComposition": best["composition"],
        "gridDenominator": LATTICE_DENOMINATOR,
        "gridPointCount": len(grid),
        "coarseMinimum": float(coarse[0][0]),
        "seedCount": len(seeds),
        "refinementSeedCount": len(selected),
        "includeLocalSeeds": True,
        "refineBestGlobalAndLocal": True,
        "allRefinementsAccepted": all_refinements,
        "threshold": TPD_THRESHOLD,
        "classMinima": class_minima,
        "nearThreshold": near_threshold,
        "classDisagreement": disagreement,
        "ambiguityTriggered": ambiguity,
        "conditionalEscalationUsed": False,
        "conditionalEscalationDisposition": (
            "NOT_REQUIRED" if not ambiguity
            else "FAIL_CLOSED_NO_UNFLOORED_PINNED_EXHAUSTIVE_ENGINE"
        ),
        "classification": (
            "ROUTINE_REFINEMENT_AMBIGUOUS"
            if ambiguity else
            "ROUTINE_NEGATIVE_TPD"
            if minimum < TPD_THRESHOLD else
            "ROUTINE_STABLE"
        ),
        "accepted": bool(
            not ambiguity
            and all_refinements
            and minimum >= TPD_THRESHOLD
        ),
        "optimizerCoordinates": (
            "six literal physical mole fractions plus exact dependent "
            "fraction; no logit seed interiorization"
        ),
        "objectiveCompositionFloor": None,
        "referenceCompositionFloor": None,
        "coarseLatticeLiteralZerosPreserved": True,
        "refinements": refinements,
    }


def mono_rich_search(evaluator, composition, temperature_k):
    """Unfloored counterpart of the pinned three-seed MONO-rich audit."""
    np = evaluator.np
    reference = evaluator.simplex(composition, positive=True)
    reference_mu = evaluator.mu(reference)

    def objective(x):
        return evaluator.tpd_objective(x, reference_mu)

    searches = []
    for seed in MONO_SEEDS:
        def run():
            return physical_refinement(
                evaluator, objective, np.asarray(seed), mono_rich=True
            )

        (solution, x, dependent), (
            replay, replay_x, replay_dependent
        ) = run(), run()
        value, replay_value = objective(x), objective(replay_x)
        kkt = physical_directional_kkt(
            evaluator, objective, x, mono_rich=True
        )
        replay_kkt = physical_directional_kkt(
            evaluator, objective, replay_x, mono_rich=True
        )
        accepted = bool(
            solution.success
            and replay.success
            and kkt["accepted"]
            and replay_kkt["accepted"]
            and np.isfinite(value)
            and np.isfinite(replay_value)
            and x[1] >= 0.5 - 1e-10
            and replay_x[1] >= 0.5 - 1e-10
            and value >= TPD_THRESHOLD
            and replay_value >= TPD_THRESHOLD
            and abs(value - replay_value) <= 1e-10
            and np.max(np.abs(x - replay_x)) <= 1e-8
        )
        searches.append({
            "minimum": float(value),
            "composition": x.tolist(),
            "optimizerSuccess": bool(solution.success),
            "optimizerStatus": int(solution.status),
            "optimizerMessage": str(solution.message),
            "dependentComponentIndex": dependent,
            "physicalDirectionalKkt": kkt,
            "replayMinimum": float(replay_value),
            "replayOptimizerSuccess": bool(replay.success),
            "replayDependentComponentIndex": replay_dependent,
            "replayPhysicalDirectionalKkt": replay_kkt,
            "replayMaximumCompositionDifference": float(
                np.max(np.abs(x - replay_x))
            ),
            "accepted": accepted,
        })
    best = min(searches, key=lambda row: (
        row["minimum"], tuple(row["composition"])
    ))
    all_accepted = all(row["accepted"] for row in searches)
    return {
        "region": "x_MONO >= 0.5",
        "seedCount": len(MONO_SEEDS),
        "historicalFalseBasinSeedIncluded": True,
        "minimum": best["minimum"],
        "minimizingComposition": best["composition"],
        "negativeBasinFound": bool(best["minimum"] < TPD_THRESHOLD),
        "threshold": TPD_THRESHOLD,
        "allRequiredSearchesAccepted": all_accepted,
        "accepted": all_accepted,
        "objectiveCompositionFloor": None,
        "optimizerCoordinates": (
            "six literal physical mole fractions plus exact dependent "
            "fraction with native x_MONO>=0.5 inequality"
        ),
        "literalBoundaryCoverageRetained": True,
        "searches": searches,
    }


def choose_candidate(document, refinement_index):
    if refinement_index is not None:
        row = document["refinements"][refinement_index]
        return row, f"refinements[{refinement_index}]"
    refinements = [
        (index, row) for index, row in enumerate(document.get("refinements", []))
        if row.get("numericalAccepted") is True
    ]
    if refinements:
        index, row = refinements[-1]
        return row, f"refinements[{index}]"
    attempts = [
        (index, row) for index, row in enumerate(document.get("attempts", []))
        if row.get("numericalAccepted") is True
    ]
    if attempts:
        index, row = attempts[-1]
        return row, f"attempts[{index}]"
    raise ValueError("NO_NUMERICALLY_ACCEPTED_INTERFACE_CANDIDATE")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--candidate",
        type=Path,
        default=ROOT / "research-results/finite-film-cell1-physical-v3-attempt.json",
    )
    parser.add_argument("--refinement-index", type=int)
    parser.add_argument(
        "--output",
        type=Path,
        default=(
            ROOT
            / "research-results/finite-film-candidate-stability-corrected-v2.json"
        ),
    )
    args = parser.parse_args()
    started = time.monotonic()
    temporary = None
    report = {
        "schemaVersion": "FINITE_FILM_CANDIDATE_STABILITY_UNFLOORED_V1",
        "scope": "ISOLATED_RESEARCH_CANDIDATE_INTERFACE_STABILITY_ONLY",
        "thresholds": {
            "minimumLocalStabilityCurvature": CURVATURE_THRESHOLD,
            "postSplitTpdThreshold": TPD_THRESHOLD,
        },
        "productionRuns": [],
        "columnContinuationRun": False,
        "feedModified": False,
        "runtimeOrModelSourcesModified": False,
        "qualificationIsTransportCertification": False,
        "qualificationIsFormalGlobalStabilityCertificate": False,
        "supersededLimitedSearchEvidence": {
            "path": "research-results/finite-film-candidate-stability.json",
            "preservedWithoutOverwrite": True,
            "assessment": (
                "LIMITED_SEARCH_INVALID_AS_GLOBAL_PASS: pure-NMP logit "
                "refinement was numerically immobile"
            ),
        },
    }
    try:
        candidate_document = json.loads(args.candidate.read_text())
        candidate, selector = choose_candidate(
            candidate_document, args.refinement_index
        )
        interfaces = {
            "continuous": candidate["interfaceContinuous"],
            "dispersed": candidate["interfaceDispersed"],
        }
        report["candidate"] = {
            "path": str(args.candidate.resolve().relative_to(ROOT)),
            "fileSha256": sha(args.candidate),
            "selector": selector,
            "interfaceSourceSha256": digest(interfaces),
            "interfaces": interfaces,
            "numericalAccepted": candidate.get("numericalAccepted"),
            "sourceDocumentPhysicalAcceptance": candidate_document.get(
                "physicalAcceptance"
            ),
            "sourceDocumentOutcome": candidate_document.get("outcome"),
        }
        _, engine, temporary, lineage = verify_thermo.load_pinned_adapter()
        direct = BoundaryExcessAdapter(engine, 298.15)
        evaluator = UnflooredEvaluator(direct)
        report["lineage"] = {
            **lineage,
            "boundaryAdapterSha256": sha(HERE / "boundary_adapter.py"),
            "verifyThermoSha256": sha(HERE / "verify_thermo.py"),
            "pinnedHistoricalEngineSha256": sha(
                verify_thermo.BASE
                / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
            ),
            "pinnedRkEngineSha256": sha(
                verify_thermo.BASE
                / "server/research/ecr-pre-pilot-seven-component-rk-cascade/engine.py"
            ),
        }
        phases = {}
        for name, value in interfaces.items():
            x = evaluator.simplex(value, positive=True)
            phases[name] = {
                "composition": x.tolist(),
                "minimumFraction": float(x.min()),
                "localCurvature": local_stability(evaluator, x, 298.15),
                "routineTpd": routine_tpd(evaluator, x, 298.15),
                "explicitMonoRichBasinSearch": mono_rich_search(
                    evaluator, x, 298.15
                ),
            }
            phases[name]["accepted"] = all((
                phases[name]["localCurvature"]["accepted"],
                phases[name]["routineTpd"]["accepted"],
                phases[name]["explicitMonoRichBasinSearch"]["accepted"],
            ))
        report["phases"] = phases
        report["evaluationAudit"] = {
            "thermodynamicEvaluationCount": evaluator.calls,
            "literalZeroThermodynamicEvaluationCount": evaluator.literal_zero_calls,
            "engineLocalStabilityCalled": False,
            "engineRoutineTpdCalled": False,
            "engineNormalizeCalled": False,
            "engineMuCalled": False,
            "boundaryAdapterNormalizesOrClips": False,
            "idealBoundaryConvention": "lim(x*log(x),x->0+)=0",
        }
        qualified = all(row["accepted"] for row in phases.values())
        report["qualified"] = qualified
        report["outcome"] = (
            "PASS_BOUNDED_CANDIDATE_SEARCH_NOT_FORMAL_GLOBAL_CERTIFICATE"
            if qualified
            else "BLOCKED_CANDIDATE_INTERFACE_STABILITY"
        )
        report["blockers"] = [] if qualified else [
            f"{phase}:{gate}"
            for phase, row in phases.items()
            for gate, result in (
                ("LOCAL_CURVATURE", row["localCurvature"]),
                ("ROUTINE_TPD", row["routineTpd"]),
                ("EXPLICIT_MONO_RICH_BASIN", row["explicitMonoRichBasinSearch"]),
            )
            if not result["accepted"]
        ]
    except Exception as error:
        report["qualified"] = False
        report["outcome"] = "BLOCKED_CHECKER_ERROR"
        report["blockers"] = [f"{type(error).__name__}: {error}"]
    finally:
        if temporary is not None:
            temporary.cleanup()
    report["elapsedSeconds"] = time.monotonic() - started
    report["checkerSourceSha256"] = sha(__file__)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, indent=2, sort_keys=True, allow_nan=False) + "\n"
    )


if __name__ == "__main__":
    main()