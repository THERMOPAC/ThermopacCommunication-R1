#!/usr/bin/env python3
"""Verify the qualified six-molecule project-generated COSMO profile basis."""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-six-component-thermodynamics"
GENERATED = HERE / "generated"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


subprocess.run([sys.executable, str(HERE / "run.py")], check=True)

result = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
manifest = json.loads((HERE / "provenance-manifest.json").read_text(encoding="utf-8"))
generation = json.loads((GENERATED / "generation-manifest.json").read_text(encoding="utf-8"))
protocol = json.loads((HERE / "generation-protocol.json").read_text(encoding="utf-8"))
report = (OUT / "report.md").read_text(encoding="utf-8")

assert result["decision"] == "PROFILE_BASIS_QUALIFIED_FOR_NIST_TOPOLOGY_GATE"
assert result["mission"]["system"] == "SAT+MONO+DI+POLY+PA+NMP"
components = result["mission"]["components"]
assert [component["family"] for component in components] == [
    "SAT", "MONO", "DI", "POLY", "PA", "NMP"
]
assert all(component["formalCharge"] == 0 for component in components)
assert all(component["spinMultiplicity"] == 1 for component in components)
pa = components[4]
assert pa["cas"] == "10081-67-1"
assert pa["inchiKey"] == "UJAWGGOCYUPCPS-UHFFFAOYSA-N"

profile = result["profileQualification"]
assert profile["selectedRouteStatus"] == "QUALIFIED_FOR_NIST_TOPOLOGY_GATE"
assert profile["generatedProfileCount"] == 6
assert profile["exactPaProfilePresent"] is True
assert profile["restrictedProfileUsedAsCalculationInput"] is False
assert set(profile["profileIntegrity"]) == {"SAT", "MONO", "DI", "POLY", "PA", "NMP"}
for family, integrity in profile["profileIntegrity"].items():
    assert len(integrity["sha256"]) == 64
    assert integrity["areaSumSquareAngstrom"] > 0
    assert integrity["volumeCubicAngstrom"] > 0
    assert set(integrity["partitionAreaSquareAngstrom"]) == {"NHB", "OH", "OT"}
    assert all(value >= 0 and math.isfinite(value)
               for value in integrity["partitionAreaSquareAngstrom"].values())

runtime = result["nistRuntimeQualification"]
assert runtime["sourceCommit"] == "1b82456be38026719b16cad4076109bef3fcb309"
assert runtime["loadedProfileCount"] == 6
assert runtime["testPointCount"] == 20
assert runtime["allFinite"] is True
assert runtime["compositionDependent"] is True
assert runtime["bitwiseRepeatableWithinProcess"] is True
assert len(runtime["activityGrid"]) == 20
for point in runtime["activityGrid"]:
    assert len(point["composition"]) == 6
    assert abs(sum(point["composition"]) - 1) < 1e-12
    assert len(point["lnGamma"]) == 6 and len(point["gamma"]) == 6
    assert all(math.isfinite(value) for value in point["lnGamma"] + point["gamma"])

assert generation["restrictedProfileInputs"] == []
assert generation["software"]["rdkitVersion"] == "2023.09.5"
assert generation["software"]["xtbVersion"] == "6.7.1"
assert generation["software"]["cpcmXVersion"] == "1.1.0"
assert protocol["status"] == "EXECUTED_QUALIFIED_PROFILE_BASIS"
assert protocol["runtimeAcceptance"]["executionStatus"] == "PASSED_20_OF_20"

rights = result["rightsQualification"]
assert rights["nistCosmoSacSoftware"]["assessment"] == "MIT_LICENSED_SOFTWARE"
assert rights["quantumGenerationSoftware"]["assessment"] == (
    "OPEN_SOURCE_COMMERCIAL_USE_AND_REDISTRIBUTION_ADMITTED"
)
assert rights["quantumMethod"]["assessment"] == "FROZEN_PROJECT_GENERATION_METHOD"
assert rights["molecularSurfaceFiles"]["assessment"] == (
    "PROJECT_GENERATED_FROM_USER_DIRECTED_STRUCTURES"
)
assert rights["profileConversion"]["assessment"] == (
    "QUALIFIED_FOR_NIST_DELAWARE_SIGMA3_CONTRACT"
)
assert rights["resultingProfileData"]["assessment"] == "PROJECT_GENERATED_DATA_ADMITTED"

assert result["scopeBoundary"] == {
    "phaseTopologyGateRerun": "ENABLED",
    "phaseTopologyValidated": False,
    "thermodynamicsAdmitted": False,
    "reason": "Profile/runtime compatibility is qualified here; LLE topology and quantitative validation are separate downstream gates.",
}
assert result["releaseEligible"] is False
assert manifest["decision"] == result["decision"]
assert manifest["runnerSha256"] == sha256(HERE / "run.py")
assert manifest["generationManifestSha256"] == sha256(GENERATED / "generation-manifest.json")
assert manifest["generationProtocolSha256"] == sha256(HERE / "generation-protocol.json")
assert manifest["licenseEvidenceSha256"] == sha256(HERE / "license-evidence.json")
assert manifest["releaseProvenanceSha256"] == sha256(HERE / "vendor/release-provenance.json")
assert manifest["complistSha256"] == sha256(GENERATED / "profiles/complist.txt")
assert "NIST UD/VT and ThermoSAC profiles were not used" in report
assert "does\nnot itself validate phase topology" in report

print("verified qualified six-molecule COSMO profile basis")