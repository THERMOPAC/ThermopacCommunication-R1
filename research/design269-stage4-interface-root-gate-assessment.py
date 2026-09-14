#!/usr/bin/env python3
"""Unchanged reproduction/stability-gate assessment of experiment-1 roots.

No optimizer is called here. This is the gate-assessment portion required
before interpreting the two already-completed bounded numerical experiments.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path.cwd()
EXPERIMENTS = ROOT / "research/design269-stage4-interface-root-experiments.json"
OUT = ROOT / "research/design269-stage4-interface-root-gate-assessment.json"
RUNTIME = ROOT / "dist/job-b-interface-runtime"
WORKER = RUNTIME / "server/ecr-pre-pilot/job-b-interface/worker.py"
WORKER_SHA = "70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError("GATE_ASSESSMENT_IMPORT_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def json_default(value):
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    raise TypeError(type(value).__name__)


def compact_tpd(value):
    return {
        "minimum": value["minimum"],
        "classification": value["classification"],
        "allRefinementsAccepted": value["allRefinementsAccepted"],
        "ambiguityTriggered": value["ambiguityTriggered"],
        "escalationUsed": value["escalationUsed"],
        "explicitMonoRichBasinSearch": value["explicitMonoRichBasinSearch"],
    }


def mono_audit(search):
    return search.get("explicitMonoRichBasinSearch", {}).get(
        "allRequiredSearchesAccepted"
    ) is True


def main():
    experiment = json.loads(EXPERIMENTS.read_text())
    if sha(WORKER) != WORKER_SHA or experiment["scope"]["immutableWorkerSha256"] != WORKER_SHA:
        raise RuntimeError("GATE_ASSESSMENT_IMMUTABLE_WORKER_MISMATCH")
    os.environ["JOB_B_INTERFACE_PROTOCOL"] = "ECR_JOB_B_INTERFACE_V1"
    os.environ["JOB_B_INTERFACE_RUNTIME_ROOT"] = str(RUNTIME)
    os.environ["STAGE4_EQUILIBRIUM_ADAPTER_PROTOCOL"] = "ECR_STAGE4_SEVEN_COMPONENT_ADAPTER_V1"
    os.environ["STAGE4_EQUILIBRIUM_ADAPTER_RUNTIME_ROOT"] = str(
        ROOT / "dist/stage4-seven-component-adapter-runtime"
    )
    os.environ["STAGE4_EQUILIBRIUM_BASE_RUNTIME_ROOT"] = str(
        ROOT / "dist/predictive-nt-runtime-7c-1-5"
    )
    worker = load(WORKER, "immutable_job_b_worker_for_gate_assessment")
    request = json.loads((ROOT / "research/design269-stage4-interface-root-diagnosis.json").read_text())["exactJobBRequest"]
    temporary, engine, integrity, runtime = worker.scientific.build_engine(float(request["T"]), 0.0)
    try:
        np, gates = engine.np, engine.gates
        threshold = experiment["sameResidualContract"]["unchangedAcceptanceThresholds"]
        eligible = [
            row for row in experiment["experimentOne"]["results"]
            if row["numericalAcceptedBeforeReproductionAndStability"]
        ]
        if len(eligible) < 2:
            raise RuntimeError("GATE_ASSESSMENT_REPRODUCTION_PAIR_NOT_AVAILABLE")
        ordered = sorted(eligible, key=lambda row: (
            max(
                row["maximumIsoactivityLogResidual"] / threshold["maximumIsoactivityLogResidual"],
                row["maximumScaledFluxEqualityResidual"] / threshold["maximumScaledFluxEqualityResidual"],
            ),
            row["cost"], row["startClass"],
        ))
        primary, reproduction = ordered[0], ordered[1]
        primary_state = np.r_[
            primary["continuousMoleFractions"], primary["dispersedMoleFractions"],
            primary["totalMolarFluxMolM2S"],
        ]
        reproduction_state = np.r_[
            reproduction["continuousMoleFractions"], reproduction["dispersedMoleFractions"],
            reproduction["totalMolarFluxMolM2S"],
        ]
        difference = float(np.max(np.abs(primary_state - reproduction_state) / np.maximum(
            np.maximum(np.abs(primary_state), np.abs(reproduction_state)), 1.0
        )))
        reproduction_pass = difference <= threshold["independentStartReproductionRelativeTolerance"]
        stability = None
        stable = False
        if reproduction_pass:
            xi_c = np.asarray(primary["continuousMoleFractions"])
            xi_d = np.asarray(primary["dispersedMoleFractions"])
            local = {
                "continuous": engine.local_stability(xi_c, float(request["T"])),
                "dispersed": engine.local_stability(xi_d, float(request["T"])),
            }
            post = {
                "continuous": engine.routine_tpd(
                    xi_c, float(request["T"]), refine_best_global_and_local=True
                ),
                "dispersed": engine.routine_tpd(
                    xi_d, float(request["T"]), refine_best_global_and_local=True
                ),
            }
            stable = all(
                local[phase]["minimumEigenvalue"] >= gates["minimumLocalStabilityCurvature"]
                and local[phase]["stepSizeConverged"]
                and post[phase]["minimum"] >= gates["postSplitTpdThreshold"]
                and post[phase]["allRefinementsAccepted"]
                and mono_audit(post[phase])
                for phase in ("continuous", "dispersed")
            )
            stability = {
                "endpointStabilityAccepted": stable,
                "localStability": local,
                "postInterfaceTpd": {phase: compact_tpd(post[phase])
                                     for phase in ("continuous", "dispersed")},
            }
        evidence = {
            "schema": "DESIGN269_STAGE4_INTERFACE_ROOT_UNCHANGED_GATE_ASSESSMENT_V1",
            "scope": {
                "operation": "NO_OPTIMIZATION_REPRODUCTION_AND_ENDPOINT_STABILITY_GATES_ONLY",
                "experimentsEvidenceSha256": sha(EXPERIMENTS),
                "immutableWorkerSha256": sha(WORKER),
                "sameRequestFingerprint": experiment["scope"]["exactBaselineRequestFingerprint"],
                "noColumnOrFlashExecution": True,
            },
            "unchangedThresholds": threshold,
            "eligibleExperimentOneCandidates": eligible,
            "workerOrderingReproductionPair": {
                "primaryStartClass": primary["startClass"],
                "independentReproductionStartClass": reproduction["startClass"],
                "maximumRelativeDifference": difference,
                "threshold": threshold["independentStartReproductionRelativeTolerance"],
                "accepted": reproduction_pass,
            },
            "endpointStabilityAssessment": stability,
            "allUnchangedLocalGatesPassed": bool(reproduction_pass and stable),
            "interpretation": (
                "A candidate has passed all copied unchanged local gates, but this isolated numerical evidence does not change the immutable worker or make a Stage-4 column result."
                if reproduction_pass and stable else
                "No all-gates local acceptance has been established by this assessment."
            ),
            "pinnedRuntime": {"integrity": integrity, "runtime": runtime},
        }
        OUT.write_text(json.dumps(evidence, indent=2, default=json_default, allow_nan=False) + "\n")
        print(json.dumps({
            "written": str(OUT.relative_to(ROOT)),
            "allUnchangedLocalGatesPassed": evidence["allUnchangedLocalGatesPassed"],
        }))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()