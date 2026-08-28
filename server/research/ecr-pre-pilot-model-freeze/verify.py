#!/usr/bin/env python3
"""Verify the immutable PRE_PILOT_MODEL package without rerunning its fit."""
from pathlib import Path
import hashlib
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = json.loads((HERE / "model-manifest.json").read_text())
artifacts = manifest["artifacts"]
for name, artifact in artifacts.items():
    path = ROOT / artifact["path"]
    assert path.is_file(), f"missing frozen artifact: {name}"
    assert sha256(path) == artifact["sha256"], f"frozen artifact changed: {name}"

hash_payload = "\n".join(
    f'{name}:{artifact["sha256"]}'
    for name, artifact in sorted(artifacts.items())
)
assert hashlib.sha256(hash_payload.encode()).hexdigest() == manifest["modelHash"]

qualification = manifest["qualificationEvidence"]
qualification_path = ROOT / qualification["path"]
assert sha256(qualification_path) == qualification["sha256"]
result = json.loads(qualification_path.read_text())
assert result["decision"] == manifest["disposition"]["qualificationDecision"] == "REJECT"
assert result["governingStatus"] == manifest["disposition"]["qualificationGoverningStatus"] == "FAIL_CLOSED"
assert manifest["disposition"]["operationalDecision"] == "ACCEPT_WITH_LIMITATIONS"
assert manifest["disposition"]["calibrationStatus"] == "CALIBRATION_REQUIRED"
assert manifest["disposition"]["releaseEligibility"] == "BLOCKED"
assert manifest["gates"]["topologyRecallMinimum"] == 0.9
assert manifest["gates"]["tieLineRmsdMaximum"] == 0.03
assert manifest["gates"]["thresholdsChanged"] is False
assert all(not gate["pass"] for gate in result["gates"].values())
assert manifest["limitations"]["DI_POLY"] == "FAIL_CLOSED"
assert manifest["limitations"]["sulfur"] == "FAIL_CLOSED"
assert manifest["limitations"]["governedTheoreticalStages"] == "NOT_ESTABLISHED"
print("verified PRE_PILOT_MODEL", manifest["modelHash"])