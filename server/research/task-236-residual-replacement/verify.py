#!/usr/bin/env python3
"""Independent deterministic verification of the Task 236 record."""
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
OUT = ROOT / ".agents/outputs/task-236-residual-replacement"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    results = json.loads((OUT / "results.json").read_text())
    assert results["decision"]["selectedRoute"] == "7C-1.3.0"
    assert results["decision"]["residualDisposition"] == "SCOPED_OUT_NOT_REFIT"
    assert results["decision"]["cascadeSolverChanged"] is False
    assert results["decision"]["tpdThresholdsChanged"] is False
    assert results["termDiagnosis"]["dominantBlock"] == "MONO_NMP"
    assert results["termDiagnosis"]["allFrozenStatesStabilizedWhenBlockRemoved"] is True
    assert results["termDiagnosis"]["fixedStateCount"] == 57
    assert results["termDiagnosis"]["largestSingleTerm"]["name"] == "A_MONO_NMP_ref"
    assert results["wetSevenComponentQualificationMatrix"][
        "nativeSevenComponent"
    ]["negativeCount"] == 0
    assert results["wetSevenComponentQualificationMatrix"][
        "inheritedResidualBaseline"
    ]["negativeCount"] == 110
    assert results["wetSevenComponentQualificationMatrix"][
        "negativeTpdThreshold"
    ] == -1e-8
    assert results["releaseGate"]["postSplitStabilityPassed"] is True
    assert results["releaseGate"]["lleReproductionGatePassed"] is False
    assert results["releaseGate"]["releaseEligible"] is False
    assert results["releaseGate"]["status"] == "FAIL_CLOSED_NOT_QUALIFIED"
    assert results["engineLineage"]["7C-1.1.0"][
        "preservedHistoricalResidualRoute"
    ]
    assert results["engineLineage"]["7C-1.2.0"][
        "preservedHistoricalResidualRoute"
    ]
    assert results["engineLineage"]["7C-1.3.0"]["residualAmendmentApplied"] is False
    manifest = json.loads((OUT / "provenance-manifest.json").read_text())
    assert manifest["protocolSha256"] == sha(HERE / "protocol.json")
    assert manifest["runnerSha256"] == sha(HERE / "run.py")
    assert manifest["outputs"]["results"] == sha(OUT / "results.json")
    assert manifest["outputs"]["report"] == sha(OUT / "report.md")
    delivered = {
        name: (OUT / name).read_bytes()
        for name in ("results.json", "report.md")
    }
    with tempfile.TemporaryDirectory() as temporary:
        env = dict(os.environ)
        env["TASK236_OUTPUT_DIR"] = temporary
        subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT, env=env, check=True)
        for name, content in delivered.items():
            assert Path(temporary, name).read_bytes() == content
    print("TASK_236_RESIDUAL_REPLACEMENT_VERIFIED")


if __name__ == "__main__":
    main()