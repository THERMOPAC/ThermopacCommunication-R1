#!/usr/bin/env python3
"""Fail-closed verifier for the repaired NMP sigma3 semantics."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-nmp-sigma3-semantics"
RESULTS = OUT / "results.json"
REPORT = OUT / "report.md"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT, check=True)
first = {path.name: sha256(path) for path in (RESULTS, REPORT)}
subprocess.run([sys.executable, str(HERE / "run.py")], cwd=ROOT, check=True)
second = {path.name: sha256(path) for path in (RESULTS, REPORT)}
assert first == second

result = json.loads(RESULTS.read_text(encoding="utf-8"))
assert result["schemaVersion"] == "2.0.0"
assert result["verdict"] == "NMP_SIGMA3_SEMANTICS_GATE_PASSED"
assert result["researchOnly"] is True
assert result["calibrationRequired"] is True
assert result["pilotValidated"] is False
assert result["releaseEligible"] is False
assert result["sulfurPrediction"] == "NOT_CALCULABLE"
assert result["restrictedProfileInputsUsed"] is False
assert result["signConvention"]["conversion"] == "multiply every raw segment charge density by -1"
assert len(result["signConvention"]["proofChain"]) == 4
assert result["profileSemantics"]["averaging"] == "NIST Hsieh"
assert result["profileSemantics"]["rAvSquaredSquareAngstrom"] == 7.25 / 3.141592653589793
assert result["profileSemantics"]["fDecay"] == 3.57
assert result["profileSemantics"]["gridElectronPerSquareAngstrom"] == {
    "minimum": -0.025,
    "maximum": 0.025,
    "step": 0.001,
    "linearAreaInterpolation": True,
}
assert result["nmp"]["segmentCount"] == 757
assert result["nmp"]["oxygenSegmentCount"] == 68
assert result["nmp"]["oxygenPreProbabilityOtAreaSquareAngstrom"] > 25
assert result["nmp"]["finalOtAreaSquareAngstrom"] > 9
assert abs(
    result["nmp"]["sourceAreaSquareAngstrom"]
    - result["nmp"]["profileAreaSquareAngstrom"]
) <= 1e-6
assert all(result["nmp"]["checks"].values())
assert result["sixComponentGate"]["decision"] == "PROFILE_SEMANTICS_GATE_PASSED"
assert result["sixComponentGate"]["allComponentsPassed"] is True
assert set(result["sixComponentGate"]["surfaceSha256ByFamily"]) == {
    "SAT", "MONO", "DI", "POLY", "PA", "NMP"
}
assert set(result["sixComponentGate"]["profileSha256ByFamily"]) == {
    "SAT", "MONO", "DI", "POLY", "PA", "NMP"
}
assert all(
    len(value) == 64
    for key, value in result["sixComponentGate"].items()
    if key.endswith("Sha256")
)
assert result["benchmarkGate"] == {
    "profileGatePassed": True,
    "measuredLleBenchmark236Cases": "NOT_EXECUTED",
    "eligibleForSeparateFutureExecution": True,
}

report = REPORT.read_text(encoding="utf-8")
assert report.startswith("# NMP sigma3 semantics repair")
assert report.rstrip().endswith("`NMP_SIGMA3_SEMANTICS_GATE_PASSED`")
assert "No UD, VT2005, ThermoSAC" in report
assert "236-case measured-LLE benchmark was not executed" in report
assert "CALIBRATION_REQUIRED" in report

print("NMP sigma3 semantics repair verified")