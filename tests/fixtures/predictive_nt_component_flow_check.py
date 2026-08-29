import importlib.util
import json
import os
from pathlib import Path

import numpy as np


ENGINE_PATH = (
    Path(__file__).resolve().parents[2]
    / "server"
    / "research"
    / "ecr-pre-pilot-model-freeze"
    / "predictive_nt_cascade.py"
)
SPEC = importlib.util.spec_from_file_location("predictive_nt_cascade", ENGINE_PATH)
ENGINE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGINE)


def deterministic_flash(mixed, _row):
    z = np.asarray(mixed, dtype=float)
    shift = min(0.08 * z[1], 0.20 * z[0])
    liquid = z + np.asarray([shift, -shift, 0.0, 0.0, 0.0])
    extract = z - np.asarray([shift, -shift, 0.0, 0.0, 0.0])
    checks = {
        "converged": True,
        "massBalance": 0.0,
        "minimumTpd": -1.0,
        "tpdPhaseOne": -1.0,
        "tpdPhaseTwo": -1.0,
        "stationarityMaximum": 0.0,
        "kktResidualMaximum": 0.0,
        "candidateCount": 1,
        "stabilityAccepted": True,
        "stationarityAccepted": True,
        "candidateReproductionAccepted": True,
        "overallAccepted": True,
    }
    return liquid, extract, 0.5, checks


ENGINE.flash = deterministic_flash
ENGINE.DAMPING = float(os.environ.get("CASCADE_TEST_DAMPING", ENGINE.DAMPING))
ENGINE.MAX_SWEEPS = int(os.environ.get("CASCADE_TEST_MAX_SWEEPS", ENGINE.MAX_SWEEPS))
feed = np.asarray([0.75, 0.25, 0.0, 0.0, 0.0])
continuation = None
summary = []
for stage_count in range(1, int(os.environ.get("CASCADE_TEST_STAGES", "5")) + 1):
    try:
        trial, continuation = ENGINE.run_trial(
            stage_count,
            feed,
            1.0,
            {},
            np.asarray([226.44, 148.25, 142.1971, 202.2506, 99.1311]),
            {
                "maximumTotalAromatics": 0.25,
                "maximumPolarAromatics": 0.0,
                "minimumSaturates": 0.75,
                "maximumNmp": 0.01,
                "minimumRrboRecovery": 0.90,
            },
            continuation,
        )
    except RuntimeError as error:
        summary.append({"stageCount": stage_count, "error": str(error)})
        break
    all_streams = [
        (stage["raffinateFlowMolarBasis"], stage["raffinateComposition"])
        for stage in trial["stages"]
    ] + [
        (stage["extractFlowMolarBasis"], stage["extractComposition"])
        for stage in trial["stages"]
    ]
    summary.append({
        "stageCount": stage_count,
        "sweeps": trial["sweeps"],
        "balanceAccepted": trial["balanceAccepted"],
        "overallMaximum": trial["overallComponentBalanceMaximum"],
        "localMaximum": max(
            stage["localComponentBalanceMaximum"] for stage in trial["stages"]
        ),
        "bounded": all(
            flow >= 0
            and all(0 <= value <= 1 for value in composition.values())
            for flow, composition in all_streams
        ),
        "initialization": trial["solverDiagnostics"]["initialization"],
    })

print(json.dumps(summary, separators=(",", ":")))