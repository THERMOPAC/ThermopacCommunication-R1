#!/usr/bin/env python3
"""Verify the fail-closed six-component thermodynamics qualification artifact."""

from __future__ import annotations

import json
import hashlib
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-six-component-thermodynamics"

subprocess.run([sys.executable, str(HERE / "run.py")], check=True)

result = json.loads((OUT / "results.json").read_text(encoding="utf-8"))
manifest = json.loads((HERE / "provenance-manifest.json").read_text(encoding="utf-8"))
report = (OUT / "report.md").read_text(encoding="utf-8")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

assert result["mission"]["system"] == "SAT+MONO+DI+POLY+PA+NMP"
assert [component["family"] for component in result["mission"]["components"]] == [
    "SAT",
    "MONO",
    "DI",
    "POLY",
    "PA",
    "NMP",
]
assert result["mission"]["primaryStage1TemperatureK"] == 323.15
assert result["mission"]["paDirectedUniquacTermsArePrimaryObjective"] is False
pa = next(component for component in result["mission"]["components"] if component["family"] == "PA")
assert pa["cas"] == "10081-67-1"
assert pa["pubchemCid"] == 82343
assert pa["inchiKey"] == "UJAWGGOCYUPCPS-UHFFFAOYSA-N"
assert pa["formalCharge"] == 0
assert pa["spinMultiplicity"] == 1
assert pa["identityStatus"] == "IDENTITY_ADMITTED_THERMODYNAMICS_BLOCKED"
assert pa["conformerTreatment"] == "NOT_FROZEN"

nist = result["softwareQualification"]["nistCosmoSac"]
assert nist["status"] == "FROZEN_HISTORICAL_EXECUTABLE_EVIDENCE_NOT_ADMITTED_FOR_PROJECT_CALCULATIONS"
assert nist["compositionDependentActivityCoefficients"] == "HISTORICALLY_EXECUTED"
assert nist["gibbsMixingEnergy"] == "HISTORICALLY_EXECUTED"
assert nist["multicomponentTpdAndFlash"] == "HISTORICALLY_EXECUTED_RESEARCH_IMPLEMENTATION"
assert result["softwareQualification"]["thermoSac"]["status"] == "NOT_ADMITTED"
assert nist["sourceCommit"] == "1b82456be38026719b16cad4076109bef3fcb309"

profile = result["profileQualification"]
assert profile["selectedOpenSourceGenerationRoute"] is None
assert profile["selectedRouteStatus"] == "NOT_QUALIFIED"
assert profile["exactPaProfilePresent"] is False
assert profile["generatedProfiles"] == []
assert profile["nistBundledUdVtProfiles"]["status"] == "NOT_ADMITTED_FOR_PROJECT_CALCULATIONS"
assert profile["nistBundledUdVtProfiles"]["commercialUseAdmitted"] is False
assert profile["nistBundledUdVtProfiles"]["redistributionAdmitted"] is False

gate = result["nonPaBenchmarkGate"]
assert gate["status"] == "FAIL"
assert gate["coto"]["records"] == 17
assert gate["multiTemperature"]["records"] == 219
assert gate["coto"]["predictedTwoPhase"] == 0
assert gate["multiTemperature"]["predictedTwoPhase"] == 0
assert gate["combinedTopologyRecall"] == 0
assert gate["acceptanceGatePassed"] is False

six = result["sixComponentCalculation"]
assert six["status"] == "NOT_CALCULABLE"
assert six["execution"] == "NOT_EXECUTED_AFTER_MANDATORY_NON_PA_GATE_FAILURE"
assert all(value is None for value in six["outputs"]["distributionCoefficients"].values())
for key, value in six["outputs"].items():
    if key != "distributionCoefficients":
        assert value is None

assert result["runtimeRepresentation"]["fittedInteractions"] == []
assert result["runtimeRepresentation"]["paDirectedInteractionCount"] == 0
assert result["sulfur"] == {"status": "NOT_CALCULABLE", "independentOfPa": True}
assert all(value is False for value in result["productionImpact"].values())
assert {blocker["code"] for blocker in result["blockers"]} == {
    "NON_PA_PHASE_TOPOLOGY_NOT_REPRODUCED",
    "OPEN_SOURCE_PROFILE_GENERATION_ROUTE_NOT_QUALIFIED",
    "EXACT_PA_SIGMA_PROFILE_UNAVAILABLE",
}
assert result["decision"] == "STOPPED_NON_PA_TOPOLOGY_GATE_FAILED"
assert manifest["decision"] == result["decision"]
assert manifest["componentIdentityKeys"]["PA"] == "UJAWGGOCYUPCPS-UHFFFAOYSA-N"
assert manifest["runnerSha256"] == sha256(HERE / "run.py")
assert manifest["licenseEvidenceSha256"] == sha256(HERE / "license-evidence.json")
assert result["licenseEvidence"]["sha256"] == sha256(HERE / "license-evidence.json")
assert result["upstreamEvidence"]["integrity"] == manifest["upstreamEvidence"]["integrity"]
assert result["upstreamEvidence"]["integrity"]["sigmaProfileHashMapCanonicalSha256"] == (
    "82aa80150f05bdfe17ae2c64df1af02d74dbbd1c4c215881cdfead6156f441c1"
)
assert result["upstreamEvidence"]["integrity"]["pinnedInputSha256"] == {
    "server/research/ecr-pre-pilot-cosmosac/run.py": "049a18474732c5e30efb442a390fade82d26fdcaff85f76983a9feb79c7505de",
    "server/research/ecr-pre-pilot-cosmosac/verify.py": "53a8f1ddc0d19cdc8a4256876250f5eb6fdf8b4816393c4b06f961335bbaa0b0",
    "server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json": "df65017ef1c8cb0ee33ca5e88111b5295c183e6d12badd4d3c85020f80173b59",
    ".agents/outputs/ecr-pre-pilot-cosmosac/results.json": "efce43eee40cac52c837696e6f918958f2659b1ca88ae4db27ac4e4442acd869",
    ".agents/outputs/ecr-pre-pilot-cosmosac/report.md": "2a6b8c65ffff77caefdcce5e7342d9eb3d55f067af4444a462e8f9315c6ddce2",
    "server/engine-framework/cel/coto2022-nmp-lle.ts": "8253433f5624934b7f9135f223090e8b9e2c5b1cbfaee06c951a3d87b839ea42",
    "server/engine-framework/cel/data/multi-t-nmp-lle.json": "72d16b9544cebb3f5d55def342684fd3414707e9e84b27c558b6a7e6f6409c28",
    "server/research/ecr-pre-pilot-cosmosac/vendor/python/cCOSMO.cpython-312-x86_64-linux-gnu.so": "a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61",
    "server/research/ecr-pre-pilot-pa-anchor/evidence.ts": "bc94349623ff967062907c1e8b46609b1f49f02958b90883bcc73dfc75d2be36",
}
assert "No molecular profiles were generated." in report
assert "No UNIQUAC" in report
assert "Stage 1" in report and "unchanged" in report

print("verified fail-closed six-component thermodynamics qualification")