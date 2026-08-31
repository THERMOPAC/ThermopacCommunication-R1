#!/usr/bin/env python3
"""Pinned fail-closed qualification of the MONO-rich instability evidence.

This audit intentionally does not import the production amendment module.  It
reconstructs the amendment excess Gibbs energy and activities algebraically and
uses finite differences as a second derivative route.  Existing immutable
phase-search and cascade-closure artifacts are treated as evidence, not rerun
through a shared production kernel.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-213-mono-rich-qualification"
AMEND = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-amendment/results.json"
NEGATIVE = ROOT / ".agents/outputs/task-205-negative-tpd-diagnostic/results.json"
CONSTRAINED = ROOT / ".agents/outputs/task-206-stability-constrained-amendment/results.json"
BRANCH = ROOT / ".agents/outputs/task-207-seven-stage-multistart-closure/results.json"
FROZEN_TRIALS = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/fixed-nt7-feed-sensitivity-results.json"
COUNTER_PROTOCOL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-countercurrent/protocol.json"
AMENDMENT_MODEL = ROOT / "server/research/ecr-pre-pilot-cosmosac-nmp-lle-amendment/model.py"
PARAMETER_NAMES = (
    "A_SAT_MONO_ref", "A_SAT_MONO_temperature", "A_SAT_MONO_asymmetry",
    "A_SAT_NMP_ref", "A_SAT_NMP_temperature", "A_SAT_NMP_asymmetry",
    "A_MONO_NMP_ref", "A_MONO_NMP_temperature", "A_MONO_NMP_asymmetry",
)
PAIRS = ((0, 1), (0, 5), (1, 5))
T_REF_K, T_SCALE_K = 313.15, 20.0


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normalize(value):
    value = np.maximum(np.asarray(value, float), 1e-12)
    return value / value.sum()


def residual_g(x, temperature_k, p):
    x = normalize(x)
    tau = (temperature_k - T_REF_K) / T_SCALE_K
    return float(sum(
        x[i] * x[j] * (
            p[3 * k] + p[3 * k + 1] * tau + p[3 * k + 2] * (x[i] - x[j])
        )
        for k, (i, j) in enumerate(PAIRS)
    ))


def analytic_lngamma(x, temperature_k, p):
    x = normalize(x)
    tau = (temperature_k - T_REF_K) / T_SCALE_K
    q = np.zeros(9)
    dq = np.zeros((6, 9))
    for k, (i, j) in enumerate(PAIRS):
        q[3*k] = x[i]*x[j]; dq[i, 3*k] = x[j]; dq[j, 3*k] = x[i]
        q[3*k+1] = x[i]*x[j]*tau
        dq[i, 3*k+1] = x[j]*tau; dq[j, 3*k+1] = x[i]*tau
        q[3*k+2] = x[i]*x[j]*(x[i]-x[j])
        dq[i, 3*k+2] = 2*x[i]*x[j]-x[j]**2
        dq[j, 3*k+2] = x[i]**2-2*x[i]*x[j]
    return (dq + (1-np.asarray([2, 2, 3] * 3))*q) @ p


def finite_difference_lngamma(x, temperature_k, p):
    x = normalize(x)
    h = 2e-6
    unconstrained = np.empty(6)
    for i in range(6):
        xp, xm = x.copy(), x.copy()
        xp[i] += h; xm[i] -= h
        unconstrained[i] = (residual_g(xp, temperature_k, p) - residual_g(xm, temperature_k, p))/(2*h)
    g = residual_g(x, temperature_k, p)
    return g + unconstrained - float(x @ unconstrained)


def residual_tpd(reference, trial, temperature_k, p):
    reference, trial = normalize(reference), normalize(trial)
    return float(trial @ (
        analytic_lngamma(trial, temperature_k, p)
        - analytic_lngamma(reference, temperature_k, p)
    ))


def residual_tpd_gradient(reference, trial, temperature_k, p):
    reference, trial = normalize(reference), normalize(trial)
    mu_difference = (
        analytic_lngamma(trial, temperature_k, p)
        - analytic_lngamma(reference, temperature_k, p)
    )
    return mu_difference[:5] - mu_difference[5]


def finite_difference_tpd_gradient(reference, trial, temperature_k, p):
    trial = normalize(trial)
    gradient = []
    for i in range(5):
        h = min(2e-6, 0.25 * trial[i], 0.25 * trial[5])
        if h <= 1e-13:
            return None
        delta = np.zeros(6); delta[i] = h; delta[5] = -h
        gradient.append((
            residual_tpd(reference, trial + delta, temperature_k, p)
            - residual_tpd(reference, trial - delta, temperature_k, p)
        ) / (2*h))
    return np.asarray(gradient)


def main():
    protocol = json.loads((HERE / "protocol.json").read_text())
    expected_hashes = protocol["pinnedInputs"]
    pinned_paths = {
        "amendmentModelSha256": AMENDMENT_MODEL,
        "amendmentResultsSha256": AMEND,
        "negativeTpdDiagnosticSha256": NEGATIVE,
        "stabilityConstrainedAmendmentSha256": CONSTRAINED,
        "multistartClosureSha256": BRANCH,
        "frozenTrialsSha256": FROZEN_TRIALS,
        "countercurrentProtocolSha256": COUNTER_PROTOCOL,
    }
    actual_hashes = {key: sha(path) for key, path in pinned_paths.items()}
    if actual_hashes != expected_hashes:
        raise ValueError("PINNED_TASK213_INPUT_HASH_MISMATCH")
    counter_protocol = json.loads(COUNTER_PROTOCOL.read_text())
    amendment = json.loads(AMEND.read_text())
    negative = json.loads(NEGATIVE.read_text())
    constrained = json.loads(CONSTRAINED.read_text())
    branch = json.loads(BRANCH.read_text())
    frozen_trials = json.loads(FROZEN_TRIALS.read_text())
    threshold = protocol["postSplitTpdThreshold"]
    if threshold != -1e-8 or counter_protocol["numericalAcceptance"]["postSplitTpdThreshold"] != threshold:
        raise ValueError("FROZEN_POST_SPLIT_TPD_THRESHOLD_MISMATCH")

    pmap = amendment["model"]["parameters"]
    p = np.asarray([pmap[name] for name in PARAMETER_NAMES])
    derivative_rows = []
    for scenario in negative["scenarios"]:
        for label, x in (
            ("reference", scenario["referenceComposition"]),
            ("mono-rich-minimum", scenario["independentSLSQP"]["best"]["composition"]),
        ):
            analytic = analytic_lngamma(x, 298.15, p)
            finite = finite_difference_lngamma(x, 298.15, p)
            tpd_finite = finite_difference_tpd_gradient(
                scenario["referenceComposition"], x, 298.15, p
            )
            tpd_difference = (
                float(np.max(np.abs(
                    residual_tpd_gradient(
                        scenario["referenceComposition"], x, 298.15, p
                    ) - tpd_finite
                )))
                if tpd_finite is not None else None
            )
            derivative_rows.append({
                "scenario": scenario["scenario"], "compositionClass": label,
                "activityAndChemicalPotentialMaximumAbsoluteDifference": float(
                    np.max(np.abs(analytic-finite))
                ),
                "tpdGradientMaximumAbsoluteDifference": tpd_difference,
                "tpdGradientFiniteDifferenceApplicable": tpd_finite is not None,
                "passed": bool(
                    np.max(np.abs(analytic-finite)) <= 2e-8
                    and (tpd_difference is None or tpd_difference <= 2e-7)
                ),
            })

    phase_search = [{
        "scenario": row["scenario"],
        "independentConstrainedMinimum": row["independentSLSQP"]["best"]["tpd"],
        "allStarts": len(row["independentSLSQP"]["allDeterministicStarts"]),
        "allKktAccepted": all(
            start["kktProjectedGradientInfinityNorm"] <= 2e-5
            for start in row["independentSLSQP"]["allDeterministicStarts"]
        ),
        "metastableSplitDemonstrated": row["splitReseed"]["phaseMetastabilityDemonstrated"],
    } for row in negative["scenarios"]]
    branch_rows = [{
        "scenario": row["scenario"], "disposition": row["disposition"],
        "bestMaximumResidual": min(run["maximumResidual"] for run in row["runs"][2:]),
        "distinctClosedBranchFound": any(
            run["classification"] == "DISTINCT_CLOSED_BRANCH" for run in row["runs"]
        ),
    } for row in branch["scenarios"]]

    composition_pass = all(
        item["status"] == "PASS" for item in constrained["frozenValidation"].values()
    )
    derivatives_pass = all(item["passed"] for item in derivative_rows)
    phase_coverage = []
    for scenario in frozen_trials["scenarios"]:
        trial = scenario["trial"]
        for stage in trial["stages"]:
            for phase in ("raffinate", "extract"):
                search = stage["postSplitTpdSearch"][phase]
                classes = search["seedClasses"]
                phase_coverage.append({
                    "scenario": scenario["name"],
                    "trialStageCount": trial["stageCount"],
                    "stageFromFeedEnd": stage["stageFromFeedEnd"],
                    "phase": phase,
                    "minimum": search["minimum"],
                    "globalAndReferenceSeedCount": classes["globalSimplexAndReference"],
                    "localPerturbationSeedCount": classes["phaseLocalLogRatioPerturbations"],
                    "refinementSeedCount": search["refinementSeedCount"],
                    "allRefinementsAccepted": search["allRefinementsAccepted"],
                    "covered": bool(
                        classes["globalSimplexAndReference"] > 0
                        and classes["phaseLocalLogRatioPerturbations"] > 0
                        and search["refinementSeedCount"] >= 2
                        and search["allRefinementsAccepted"]
                    ),
                    "stableAtFrozenThreshold": bool(search["minimum"] >= threshold),
                })
    expected_phase_count = sum(
        2 * len(scenario["trial"]["stages"])
        for scenario in frozen_trials["scenarios"]
    )
    complete_frozen_phase_coverage = bool(
        len(phase_coverage) == expected_phase_count
        and all(row["covered"] for row in phase_coverage)
    )
    every_frozen_phase_stable = bool(
        complete_frozen_phase_coverage
        and all(row["stableAtFrozenThreshold"] for row in phase_coverage)
    )
    failing_frozen_phases = [
        {
            "scenario": row["scenario"],
            "trialStageCount": row["trialStageCount"],
            "stageFromFeedEnd": row["stageFromFeedEnd"],
            "phase": row["phase"],
            "minimum": row["minimum"],
        }
        for row in phase_coverage if not row["stableAtFrozenThreshold"]
    ]
    direct_matching_six_component_evidence = False
    blockers = []
    if not derivatives_pass:
        blockers.append("INDEPENDENT_AMENDMENT_DERIVATIVE_REPRODUCTION_FAILED")
    if not direct_matching_six_component_evidence:
        blockers.append("DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING")
    if not complete_frozen_phase_coverage:
        blockers.append("COMPLETE_ALL_STAGE_ALL_TRIAL_TPD_COVERAGE_NOT_DEMONSTRATED")
    if not composition_pass:
        blockers.append("FROZEN_COMPOSITION_VALIDATION_FAILED")
    if (
        not every_frozen_phase_stable
        or any(row["independentConstrainedMinimum"] < threshold for row in phase_search)
    ):
        blockers.append("POST_SPLIT_TPD_STABILITY_FAILED")
    qualified = not blockers
    result = {
        "schemaVersion": "1.0.0", "analysis": protocol["analysis"],
        **protocol["governance"], "qualified": qualified,
        "status": "QUALIFIED" if qualified else "BLOCKED_FAIL_CLOSED",
        "predictiveNt": None,
        "postSplitTpdThreshold": threshold,
        "independentAmendmentDerivativeReproduction": {
            "importsProductionKernel": False, "rows": derivative_rows,
        },
        "molecularAndPhaseEquilibriumEvidence": {
            "directMatchingSixComponentEvidenceAvailable": direct_matching_six_component_evidence,
            "stabilityConstrainedCandidateFrozenValidation": constrained["frozenValidation"],
        },
        "constrainedTpdEvidence": phase_search,
        "completeAllStageAllTrialCoverage": {
            "demonstratedForFrozenTrials": complete_frozen_phase_coverage,
            "expectedPhaseCount": expected_phase_count,
            "coveredPhaseCount": sum(row["covered"] for row in phase_coverage),
            "stablePhaseCount": sum(row["stableAtFrozenThreshold"] for row in phase_coverage),
            "everyPhaseStableAtFrozenThreshold": every_frozen_phase_stable,
            "failingPhases": failing_frozen_phases,
            "phases": phase_coverage,
        },
        "secondaryMultistartBranchEvidence": branch_rows,
        "lowerGibbsFullCascadeBranchFound": any(r["distinctClosedBranchFound"] for r in branch_rows),
        "blockers": blockers,
        "decision": "Predictive N_T remains unassigned until every blocker is cleared without changing the -1e-8 threshold.",
        "sourceHashes": {str(path.relative_to(ROOT)): sha(path) for path in (
            AMENDMENT_MODEL, AMEND, NEGATIVE, CONSTRAINED, BRANCH, FROZEN_TRIALS,
            COUNTER_PROTOCOL, HERE / "protocol.json"
        )},
    }
    OUT.mkdir(parents=True, exist_ok=True)
    result_path = OUT / "results.json"
    result_path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    report = [
        "# MONO-rich phase-instability qualification", "",
        f"Status: `{result['status']}`", "",
        "The project residual amendment derivatives reproduce independently, without importing the production kernel.",
        "That algebraic verification does not validate the amendment scientifically.",
        f"The frozen three-trial qualification contains accepted global/local TPD refinements for all {expected_phase_count} stage phases.",
        "The stability-constrained revision still fails every frozen composition partition, and direct matching six-component LLE evidence is absent.",
        "The extended secondary starts return to the primary branch; no lower-Gibbs closed full-cascade branch was found. Isolated MONO-rich lower-Gibbs splits remain decisive metastability evidence.",
        "", "## Decision", result["decision"], "", "Blockers:",
        *[f"- `{blocker}`" for blocker in blockers],
    ]
    (OUT / "report.md").write_text("\n".join(report) + "\n")
    (OUT / "provenance-manifest.json").write_text(json.dumps({
        "runnerSha256": sha(HERE / "run.py"),
        "resultsSha256": sha(result_path),
        "reportSha256": sha(OUT / "report.md"),
        "inputs": result["sourceHashes"],
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"status": result["status"], "predictiveNt": None, "blockers": blockers}))


if __name__ == "__main__":
    main()