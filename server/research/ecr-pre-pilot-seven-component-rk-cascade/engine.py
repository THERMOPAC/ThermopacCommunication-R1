#!/usr/bin/env python3
"""7C-1.4.0 simultaneous cascade using immutable Task-238 thermodynamics."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HISTORICAL_ENGINE = (
    ROOT / "server/research/ecr-pre-pilot-seven-component-simultaneous-cascade/engine.py"
)
MODEL_PATH = ROOT / "server/research/ecr-pre-pilot-seven-component-rk-cascade/model.py"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


historical = _load("frozen_seven_component_1_2_for_1_4", HISTORICAL_ENGINE)
replacement = _load("seven_component_1_4_model", MODEL_PATH)
FAMILIES = historical.FAMILIES
ENGINE_VERSION = "7C-1.4.0"
protocol = historical.protocol
normalize = historical.normalize
lattice = historical.lattice


class SevenComponentEngine(historical.SevenComponentEngine):
    """Unchanged 14*N solver with an explicit MONO-rich false-basin audit."""

    def routine_tpd(self, reference, temperature_k, **kwargs):
        result = super().routine_tpd(reference, temperature_k, **kwargs)
        np, scipy = self.np, self.scipy
        reference = normalize(np, reference)
        reference_mu = self.mu(reference, temperature_k)

        def objective(w):
            w = normalize(np, w)
            return float(w @ (self.mu(w, temperature_k) - reference_mu))

        historical_seed = np.asarray((
            0.0016297769949390418, 0.9378227986135558,
            0.009939119181714848, 0.003764367614353866,
            0.0024240944731290306, 0.019007400853443164,
            0.025412442268864147,
        ))
        seeds = (
            historical_seed,
            np.asarray((0.1, 0.7, 0.04, 0.02, 0.02, 0.1, 0.02)),
            np.asarray((0.2, 0.5, 0.05, 0.03, 0.02, 0.15, 0.05)),
        )
        audits = []
        for seed in seeds:
            def constrained_run():
                return scipy.optimize.minimize(
                    objective, seed, method="SLSQP",
                    bounds=[(1e-12, 1.0)] * 7,
                    constraints=(
                        {"type": "eq", "fun": lambda w: float(np.sum(w) - 1.0)},
                        {"type": "ineq", "fun": lambda w: float(w[1] - 0.5)},
                    ),
                    options={"ftol": 1e-12, "maxiter": 1000},
                )
            solution = constrained_run()
            replay = constrained_run()
            composition = normalize(np, solution.x)
            replay_composition = normalize(np, replay.x)
            audits.append({
                "minimum": objective(composition),
                "composition": composition.tolist(),
                "optimizerSuccess": bool(solution.success),
                "replayOptimizerSuccess": bool(replay.success),
                "replayMinimum": objective(replay_composition),
                "replayMaximumCompositionDifference": float(np.max(
                    np.abs(composition - replay_composition)
                )),
                "region": "x_MONO >= 0.5",
            })
        mono_best = min(audits, key=lambda row: (
            row["minimum"], tuple(row["composition"])
        ))
        threshold = self.gates["postSplitTpdThreshold"]
        required_searches_accepted = all(
            row["optimizerSuccess"]
            and row["replayOptimizerSuccess"]
            and np.isfinite(row["minimum"])
            and np.all(np.isfinite(row["composition"]))
            and abs(float(np.sum(row["composition"])) - 1.0) <= 1e-10
            and row["composition"][1] >= 0.5 - 1e-10
            and row["minimum"] >= threshold
            and row["replayMinimum"] >= threshold
            and abs(row["minimum"] - row["replayMinimum"]) <= 1e-10
            and row["replayMaximumCompositionDifference"] <= 1e-8
            and abs(objective(np.asarray(row["composition"])) - row["minimum"]) <= 1e-10
            for row in audits
        )
        result["explicitMonoRichBasinSearch"] = {
            "region": "x_MONO >= 0.5",
            "seedCount": len(seeds),
            "historicalFalseBasinSeedIncluded": True,
            "minimum": mono_best["minimum"],
            "minimizingComposition": mono_best["composition"],
            "negativeBasinFound": mono_best["minimum"] < self.gates["negativeTpdThreshold"],
            "postSplitTpdThreshold": threshold,
            "allRequiredSearchesAccepted": bool(required_searches_accepted),
            "acceptanceFailure": (
                None if required_searches_accepted
                else "MONO_RICH_SEARCH_UNRESOLVED_OR_NEGATIVE"
            ),
            "searches": audits,
        }
        if mono_best["minimum"] < result["minimum"]:
            result["minimum"] = mono_best["minimum"]
            result["minimizingComposition"] = mono_best["composition"]
            result["classification"] = "EXPLICIT_MONO_RICH_NEGATIVE_TPD"
        return result

    def solve_cascade(self, *args, **kwargs):
        """Make the explicit constrained audit a non-optional stage gate."""
        result = super().solve_cascade(*args, **kwargs)
        stages_accepted = True
        for stage in result["stages"]:
            accepted = all(
                stage["postSplitTpdSearch"][phase]["explicitMonoRichBasinSearch"]
                .get("allRequiredSearchesAccepted") is True
                for phase in ("raffinate", "extract")
            )
            stage["explicitMonoRichBasinAuditAccepted"] = accepted
            stages_accepted = stages_accepted and accepted
        result["explicitMonoRichBasinAuditAccepted"] = stages_accepted
        result["accepted"] = bool(result["accepted"] and stages_accepted)
        return result


def build_engine(temperature_k, water_wt_pct):
    temporary, np, scipy, model, integrity, runtime = replacement.build_model()
    # The exhaustive implementation bundled with 7C-1.1 evaluates a different
    # thermodynamic model, so it is intentionally not used as a fallback.
    engine = SevenComponentEngine(np, scipy, model, exhaustive_tpd=None)
    integrity = {
        **integrity,
        "cascadeSolverParent": "7C-1.2.0",
        "cascadeSolverChanged": False,
        "tpdThresholdsChanged": False,
        "governingWorkflow": "SIMULTANEOUS_COUNTER_CURRENT_14N_EQUATIONS",
        "singleStageIsMatrixMember": True,
        "fallbackPhaseModel": None,
    }
    return temporary, engine, integrity, runtime