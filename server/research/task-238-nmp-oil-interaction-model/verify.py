#!/usr/bin/env python3
"""Regenerate and byte-compare the separately versioned RK artifact."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/task-238-nmp-oil-interaction-model"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    result = json.loads((OUT / "results.json").read_text())
    assert result["artifactVersion"] == "TASK-238-NMP-OIL-RK-0.2.0"
    assert result["thermodynamics"]["totalScalarGibbs"] == "g_native + Delta_g"
    assert result["thermodynamics"]["nativeRetainedInAllCalculations"] is True
    assert result["thermodynamics"]["analyticPartialMolarCorrection"] is True
    assert (
        result["thermodynamics"]["maximumDerivativeReconstructionDifference"]
        <= 1e-5
    )
    assert result["fit"]["trainingDry"]["rows"] == 175
    assert result["fit"]["heldOutDry"]["rows"] == 44
    assert result["fit"][
        "wetDevelopmentChemicalPotentialEqualityMaximumResidual"
    ] <= 1e-8
    assert all(value < -1e-8 for value in result["parent"]["daughterTpd"].values())
    split = result["split"]
    assert split["gibbsReduction"] < -1e-8
    assert split["positivePhaseAmounts"] is True
    assert split["positiveComponentAmounts"] is True
    assert split["oilRichRaffinate"] is True
    assert split["nmpRichExtract"] is True
    assert split["materialClosureMaxResidual"] <= 1e-10
    assert split["chemicalPotentialMaxResidual"] <= 1e-8
    assert (
        split["independentRouteAgreement"]["betaAbsoluteDifference"] <= 1e-6
    )
    assert (
        split["independentRouteAgreement"][
            "maximumPhaseCompositionDifference"
        ]
        <= 1e-6
    )
    assert all(
        value["minimum"] >= -1e-8
        and value["verdict"] == "NO_NEGATIVE_FOUND"
        and value["finiteSearchNotGlobalProof"] is True
        for value in result["postSplitTpd"].values()
    )
    mono = result["formerMonoRichBasinAudit"]
    assert mono["predeclaredRegion"] == "x_MONO >= 0.5"
    assert mono["negativeMonoRichBasinFound"] is False
    assert mono["conclusion"] == "NO_NEGATIVE_FOUND_IN_DECLARED_FINITE_SEARCH"
    assert mono["finiteSearchNotGlobalProof"] is True
    assert result["numericalGate"]["passed"] is True
    assert result["numericalGate"]["thresholdsChanged"] is False
    assert result["numericalGate"]["cascadeSolverChanged"] is False
    assert result["engineHashPreservation"]["matchesProtocolPins"] is True
    assert result["engineHashPreservation"]["preserved"] is True
    assert result["releaseGate"]["declaredDryHeldOutReproductionPassed"] is False
    assert result["releaseGate"]["releaseEligible"] is False
    assert result["releaseGate"]["predictiveEligible"] is False

    manifest = json.loads((OUT / "provenance-manifest.json").read_text())
    for name in ("protocol.json", "evidence.json", "model.py", "run.py", "verify.py"):
        assert manifest["artifactFiles"][name] == sha(HERE / name)
    assert manifest["outputs"]["results.json"] == sha(OUT / "results.json")
    assert manifest["outputs"]["report.md"] == sha(OUT / "report.md")

    delivered = {
        name: (OUT / name).read_bytes()
        for name in ("results.json", "report.md", "provenance-manifest.json")
    }
    with tempfile.TemporaryDirectory() as directory:
        env = dict(os.environ)
        env["TASK238_OUTPUT_DIR"] = directory
        subprocess.run(
            [sys.executable, str(HERE / "run.py")],
            cwd=ROOT,
            env=env,
            check=True,
        )
        for name, content in delivered.items():
            assert (Path(directory) / name).read_bytes() == content, name
    print("TASK_238_NMP_OIL_RK_MODEL_VERIFIED")


if __name__ == "__main__":
    main()