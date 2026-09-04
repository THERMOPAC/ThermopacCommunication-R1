#!/usr/bin/env python3
"""Diagnostic-only TPD A/B replay on persisted 3 wt% water daughter states.

A: native seven-component cCOSMO.
B: the same native model plus the inherited six-component NMP-LLE residual.

The cascade, its daughter states, and every production acceptance threshold are
read-only.  B uses the persisted production search minima and independently
re-evaluates the TPD objective at each persisted minimizer.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SOURCE = (
    ROOT
    / ".agents/outputs/three-percent-water-7c-tpd-ab/source-daughter-states.json"
)
OUT = ROOT / ".agents/outputs/three-percent-water-7c-tpd-ab/evidence.json"
REPORT = ROOT / ".agents/outputs/three-percent-water-7c-tpd-ab/report.md"
QUALIFICATION_PATH = (
    ROOT
    / "server/research/ecr-pre-pilot-seven-component-h2o-profile/run_qualification.py"
)
CASCADE_PATH = (
    ROOT
    / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
)
FAMILIES = ("SAT", "MONO", "DI", "POLY", "PA", "NMP", "H2O")
EXPECTED_JOB = "cd5d9f6e-1340-4da0-a9a2-1e29d2617258"
EXPECTED_ENGINE_HASH = (
    "2cd41180477347ad5cd7d57b505b2521b944443317652db76ce522b7be44f8ca"
)


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def canonical_sha256(value) -> str:
    payload = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def composition_dict(values) -> dict[str, float]:
    return {name: float(value) for name, value in zip(FAMILIES, values)}


def dominant_family(composition: dict[str, float]) -> str:
    return max(FAMILIES, key=lambda name: composition[name])


def summary_stats(values: list[float]) -> dict[str, float]:
    return {
        "minimum": min(values),
        "maximum": max(values),
        "mean": sum(values) / len(values),
    }


class NativeSevenComponentModel:
    """Expose only native seven-profile cCOSMO activity coefficients."""

    def __init__(self, assembled):
        self.native_seven = assembled.native_seven
        self.cache = {}

    def wet_lngamma(self, np, temperature_k, x7):
        x7 = np.maximum(np.asarray(x7, dtype=float), 1e-12)
        x7 = x7 / x7.sum()
        key = (float(temperature_k), tuple(float(value) for value in x7))
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        calculated = (
            np.asarray(self.native_seven.get_lngamma_comb(temperature_k, x7))
            + np.asarray(self.native_seven.get_lngamma_resid(temperature_k, x7))
        )
        self.cache[key] = calculated
        return calculated


def tpd_value(engine, reference, candidate, temperature_k: float) -> float:
    np = engine.np
    reference = np.maximum(np.asarray(reference, dtype=float), 1e-12)
    reference = reference / reference.sum()
    candidate = np.maximum(np.asarray(candidate, dtype=float), 1e-12)
    candidate = candidate / candidate.sum()
    return float(
        candidate @ (engine.mu(candidate, temperature_k) - engine.mu(reference, temperature_k))
    )


def validate_source(source: dict) -> None:
    if source.get("schemaVersion") != "1.0.0":
        raise RuntimeError("SOURCE_SCHEMA_VERSION_MISMATCH")
    if source.get("sourceJob", {}).get("id") != EXPECTED_JOB:
        raise RuntimeError("SOURCE_JOB_MISMATCH")
    if source["sourceJob"].get("engineHash") != EXPECTED_ENGINE_HASH:
        raise RuntimeError("SOURCE_ENGINE_HASH_MISMATCH")
    if tuple(source.get("componentOrder", ())) != FAMILIES:
        raise RuntimeError("SOURCE_COMPONENT_ORDER_MISMATCH")
    if float(source.get("temperatureK", math.nan)) != 298.15:
        raise RuntimeError("SOURCE_TEMPERATURE_MISMATCH")
    wet = source.get("wetSolventConstruction", {})
    if (
        float(wet.get("waterWeightPercentOfWetSolvent", math.nan)) != 3.0
        or float(wet.get("nmpWeightPercentOfWetSolvent", math.nan)) != 97.0
        or float(wet.get("solventOilMassRatio", math.nan)) != 0.5
    ):
        raise RuntimeError("SOURCE_WET_SOLVENT_BASIS_MISMATCH")
    trials = source.get("trials", [])
    if [int(row["stageCount"]) for row in trials] != list(range(1, 11)):
        raise RuntimeError("SOURCE_TRIAL_SEQUENCE_MISMATCH")
    if sum(len(row.get("stages", [])) for row in trials) != 55:
        raise RuntimeError("SOURCE_STAGE_COUNT_MISMATCH")
    for trial in trials:
        if len(trial["stages"]) != int(trial["stageCount"]):
            raise RuntimeError("SOURCE_TRIAL_STAGE_COUNT_MISMATCH")
        for expected_stage, stage in enumerate(trial["stages"], start=1):
            if int(stage["stageFromFeedEnd"]) != expected_stage:
                raise RuntimeError("SOURCE_STAGE_SEQUENCE_MISMATCH")
            for phase in ("raffinate", "extract"):
                values = stage[f"{phase}LeavingMoleFractions"]
                if len(values) != 7 or not all(math.isfinite(float(x)) for x in values):
                    raise RuntimeError("SOURCE_DAUGHTER_COMPOSITION_INVALID")
                if abs(sum(float(x) for x in values) - 1.0) > 2e-12:
                    raise RuntimeError("SOURCE_DAUGHTER_COMPOSITION_NOT_NORMALIZED")
                persisted = stage["persistedPostSplitTpdSearch"][phase]
                if (
                    not math.isfinite(float(persisted["minimum"]))
                    or len(persisted["minimizingComposition"]) != 7
                ):
                    raise RuntimeError("SOURCE_PERSISTED_TPD_INVALID")


def write_report(evidence: dict) -> None:
    summary = evidence["summary"]
    rows = evidence["daughterStateComparisons"]
    native_reference_l1 = [
        sum(
            abs(
                row["native7c"]["minimizingComposition"][name]
                - row["referenceComposition"][name]
            )
            for name in FAMILIES
        )
        for row in rows
    ]
    native_at_residual_minimum = [
        row["native7c"]["tpdAtResidualModelMinimizer"] for row in rows
    ]
    residual_compositions = [
        row["native7cPlusInherited6cResidual"]["minimizingComposition"]
        for row in rows
    ]
    residual_ranges = {
        name: (
            min(row[name] for row in residual_compositions),
            max(row[name] for row in residual_compositions),
        )
        for name in FAMILIES
    }
    lines = [
        "# 3 wt% water 7C daughter-state TPD A/B replay",
        "",
        "## Scope",
        "",
        f"- Source job: `{evidence['source']['jobId']}`",
        f"- Trials: {evidence['source']['trialCount']} (`N_T = 1…10`)",
        f"- Persisted stages: {evidence['source']['stageCount']}",
        f"- Daughter states: {evidence['source']['daughterStateCount']}",
        "- A: native seven-component cCOSMO only",
        "- B: native seven-component cCOSMO plus inherited six-component residual amendment",
        "- Cascade equations, daughter states, search threshold, and acceptance logic were not changed.",
        "",
        "## Result",
        "",
        f"- Native A negative states: **{summary['nativeNegativeCount']} / 110**",
        f"- Native A stable or near-zero states: **{summary['nativeStableOrNearZeroCount']} / 110**",
        f"- Residual-added B negative states: **{summary['residualAddedNegativeCount']} / 110**",
        (
            "- Maximum absolute difference between independently replayed B objective "
            f"and persisted B minimum: **{summary['residualReplayMaximumAbsoluteDifference']:.3e}**"
        ),
        (
            "- Native A minimum range: "
            f"**{summary['nativeMinimumStats']['minimum']:.6g} to "
            f"{summary['nativeMinimumStats']['maximum']:.6g}**"
        ),
        (
            "- Residual-added B minimum range: "
            f"**{summary['residualAddedMinimumStats']['minimum']:.6g} to "
            f"{summary['residualAddedMinimumStats']['maximum']:.6g}**"
        ),
        (
            "- Native A minimizers reproduce their reference daughter states: "
            f"maximum composition L1 difference **{max(native_reference_l1):.3e}**."
        ),
        (
            "- Under native A, the B minimizers have positive TPD: "
            f"**{min(native_at_residual_minimum):.6g} to "
            f"{max(native_at_residual_minimum):.6g}**."
        ),
        (
            "- Residual-added B minimizers are uniformly MONO-rich: "
            f"**{residual_ranges['MONO'][0]:.6%} to "
            f"{residual_ranges['MONO'][1]:.6%} MONO**."
        ),
        (
            "- Other B-minimizer ranges: "
            f"SAT {residual_ranges['SAT'][0]:.6%}–{residual_ranges['SAT'][1]:.6%}; "
            f"NMP {residual_ranges['NMP'][0]:.6%}–{residual_ranges['NMP'][1]:.6%}; "
            f"H2O {residual_ranges['H2O'][0]:.6%}–{residual_ranges['H2O'][1]:.6%}."
        ),
        (
            "- Mean L1 distance between A and B minimizers: "
            f"**{summary['meanMinimizerL1Distance']:.6f}**."
        ),
        "",
        f"**Diagnostic conclusion:** `{evidence['diagnosticConclusion']}`",
        "",
        "## Per-trial extrema",
        "",
        "| N_T | states | A min | A max | B min | B max |",
        "|---:|---:|---:|---:|---:|---:|",
    ]
    for trial in evidence["trialSummaries"]:
        lines.append(
            f"| {trial['stageCount']} | {trial['daughterStateCount']} | "
            f"{trial['nativeMinimum']:.6g} | {trial['nativeMaximum']:.6g} | "
            f"{trial['residualAddedMinimum']:.6g} | "
            f"{trial['residualAddedMaximum']:.6g} |"
        )
    lines.extend(
        [
            "",
            "The complete state compositions, minima, minimizers, cross-model objective "
            "values, and source hashes are retained in `evidence.json`.",
            "",
        ]
    )
    REPORT.write_text("\n".join(lines))


def main() -> None:
    source = json.loads(SOURCE.read_text())
    validate_source(source)
    qualification = load_module("tpd_ab_qualification", QUALIFICATION_PATH)
    cascade = load_module("tpd_ab_cascade", CASCADE_PATH)
    temporary, np, scipy, assembled, integrity, runtime = qualification.build_model()
    try:
        native = NativeSevenComponentModel(assembled)
        native_exhaustive = qualification.engine(
            np, scipy, native, float(source["temperatureK"]), 3.0
        )[1]
        native_engine = cascade.SevenComponentEngine(
            np, scipy, native, exhaustive_tpd=native_exhaustive
        )
        residual_engine = cascade.SevenComponentEngine(np, scipy, assembled)
        threshold = float(native_engine.gates["negativeTpdThreshold"])
        rows = []
        for trial in source["trials"]:
            nt = int(trial["stageCount"])
            for stage in trial["stages"]:
                stage_number = int(stage["stageFromFeedEnd"])
                for phase in ("raffinate", "extract"):
                    reference = stage[f"{phase}LeavingMoleFractions"]
                    persisted_b = stage["persistedPostSplitTpdSearch"][phase]
                    native_search = native_engine.routine_tpd(
                        reference,
                        float(source["temperatureK"]),
                        refine_best_global_and_local=True,
                    )
                    native_minimizer = composition_dict(
                        native_search["minimizingComposition"]
                    )
                    residual_minimizer = composition_dict(
                        persisted_b["minimizingComposition"]
                    )
                    replayed_b = tpd_value(
                        residual_engine,
                        reference,
                        persisted_b["minimizingComposition"],
                        float(source["temperatureK"]),
                    )
                    rows.append(
                        {
                            "stageCount": nt,
                            "stageFromFeedEnd": stage_number,
                            "phase": phase,
                            "referenceComposition": composition_dict(reference),
                            "native7c": {
                                "minimum": float(native_search["minimum"]),
                                "minimizingComposition": native_minimizer,
                                "dominantMinimizerFamily": dominant_family(
                                    native_minimizer
                                ),
                                "classification": native_search["classification"],
                                "escalationUsed": native_search["escalationUsed"],
                                "tpdAtResidualModelMinimizer": tpd_value(
                                    native_engine,
                                    reference,
                                    persisted_b["minimizingComposition"],
                                    float(source["temperatureK"]),
                                ),
                            },
                            "native7cPlusInherited6cResidual": {
                                "persistedMinimum": float(persisted_b["minimum"]),
                                "replayedObjectiveAtPersistedMinimizer": replayed_b,
                                "replayAbsoluteDifference": abs(
                                    replayed_b - float(persisted_b["minimum"])
                                ),
                                "minimizingComposition": residual_minimizer,
                                "dominantMinimizerFamily": dominant_family(
                                    residual_minimizer
                                ),
                                "tpdAtNativeModelMinimizer": tpd_value(
                                    residual_engine,
                                    reference,
                                    native_search["minimizingComposition"],
                                    float(source["temperatureK"]),
                                ),
                            },
                            "minimizerL1Distance": sum(
                                abs(
                                    native_minimizer[name]
                                    - residual_minimizer[name]
                                )
                                for name in FAMILIES
                            ),
                        }
                    )
        native_minima = [row["native7c"]["minimum"] for row in rows]
        residual_minima = [
            row["native7cPlusInherited6cResidual"]["persistedMinimum"]
            for row in rows
        ]
        replay_differences = [
            row["native7cPlusInherited6cResidual"]["replayAbsoluteDifference"]
            for row in rows
        ]
        native_negative = sum(value < threshold for value in native_minima)
        residual_negative = sum(value < threshold for value in residual_minima)
        native_stable_or_near_zero = sum(value >= threshold for value in native_minima)
        trial_summaries = []
        for nt in range(1, 11):
            selected = [row for row in rows if row["stageCount"] == nt]
            a = [row["native7c"]["minimum"] for row in selected]
            b = [
                row["native7cPlusInherited6cResidual"]["persistedMinimum"]
                for row in selected
            ]
            trial_summaries.append(
                {
                    "stageCount": nt,
                    "daughterStateCount": len(selected),
                    "nativeMinimum": min(a),
                    "nativeMaximum": max(a),
                    "residualAddedMinimum": min(b),
                    "residualAddedMaximum": max(b),
                }
            )
        conclusion = (
            "SAME_INHERITED_6C_RESIDUAL_NEGATIVE_BASIN_PROPAGATED_INTO_WET_7C"
            if native_negative == 0
            and residual_negative == len(rows)
            and max(replay_differences) <= 1e-9
            else "A_B_RESULT_DOES_NOT_SUPPORT_SINGLE_RESIDUAL_PROPAGATION_CONCLUSION"
        )
        evidence = {
            "schemaVersion": "7C_TPD_AB_DIAGNOSTIC_V1",
            "status": "RESEARCH_DIAGNOSTIC_ONLY_NOT_RELEASE_ELIGIBLE",
            "researchOnly": True,
            "releaseEligible": False,
            "source": {
                "jobId": source["sourceJob"]["id"],
                "designId": source["sourceJob"]["designId"],
                "completedAt": source["sourceJob"]["completedAt"],
                "engineHash": source["sourceJob"]["engineHash"],
                "modelHash": source["sourceJob"]["modelHash"],
                "stage1ImmutableHash": source["sourceJob"]["stage1ImmutableHash"],
                "sourceDaughterStatesFile": str(SOURCE.relative_to(ROOT)),
                "sourceDaughterStatesFileSha256": sha256(SOURCE),
                "sourceDaughterStatesCanonicalSha256": canonical_sha256(source),
                "trialCount": len(source["trials"]),
                "stageCount": 55,
                "daughterStateCount": len(rows),
                "temperatureK": source["temperatureK"],
                "componentOrder": list(FAMILIES),
            },
            "modelDefinitions": {
                "A": "NATIVE_SEVEN_COMPONENT_CCOSMO_ONLY",
                "B": "NATIVE_SEVEN_COMPONENT_CCOSMO_PLUS_INHERITED_SIX_COMPONENT_NMP_LLE_RESIDUAL",
                "frozenInputIntegrity": integrity,
                "runtime": runtime,
            },
            "method": {
                "nativeSearch": "7C-1.2.0 denominator-4 routine TPD with unchanged ambiguity escalation",
                "residualAddedSearch": "persisted 7C-1.2.0 production TPD minimum and minimizer",
                "residualAddedReplay": "independent evaluation of the B TPD objective at every persisted minimizer",
                "negativeTpdThreshold": threshold,
                "cascadeSolverModified": False,
                "tpdThresholdModified": False,
            },
            "summary": {
                "nativeNegativeCount": native_negative,
                "nativeStableOrNearZeroCount": native_stable_or_near_zero,
                "residualAddedNegativeCount": residual_negative,
                "nativeMinimumStats": summary_stats(native_minima),
                "residualAddedMinimumStats": summary_stats(residual_minima),
                "residualReplayMaximumAbsoluteDifference": max(replay_differences),
                "meanMinimizerL1Distance": sum(
                    row["minimizerL1Distance"] for row in rows
                )
                / len(rows),
            },
            "diagnosticConclusion": conclusion,
            "trialSummaries": trial_summaries,
            "daughterStateComparisons": rows,
        }
        OUT.write_text(json.dumps(evidence, indent=2, sort_keys=True) + "\n")
        write_report(evidence)
        print(json.dumps(
            {
                "status": evidence["status"],
                "diagnosticConclusion": conclusion,
                **evidence["summary"],
                "evidence": str(OUT.relative_to(ROOT)),
                "report": str(REPORT.relative_to(ROOT)),
            },
            indent=2,
        ))
    finally:
        temporary.cleanup()


if __name__ == "__main__":
    main()