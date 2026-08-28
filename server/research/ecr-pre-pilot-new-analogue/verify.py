#!/usr/bin/env python3
"""Deterministic verifier for the new molecular-pair evidence qualification."""
from pathlib import Path
import hashlib
import json
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-new-analogue"


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run_once():
    completed = subprocess.run(
        ["python3.12", str(HERE / "run.py"), "--resume-fit"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=1800,
    )
    if completed.returncode:
        raise RuntimeError(completed.stderr[-8000:])
    return {
        name: (OUT / name).read_bytes()
        for name in ("results.json", "report.md", "provenance.json")
    }


protocol = json.loads((HERE / "frozen-protocol.json").read_text())
paths = {
    "baselineTieLines": ROOT / "server/engine-framework/cel/data/multi-t-nmp-lle.json",
    "augmentation": HERE / "molecular-pair-augmentation.json",
    "descriptorRegistry": HERE / "descriptor-registry.json",
    "frozenHoldouts": HERE / "frozen-holdouts.json",
    "fitStart": ROOT / "server/research/ecr-pre-pilot-descriptor-transfer/fit-start.json",
    "qualifiedUniquacImplementation": ROOT / "server/research/ecr-pre-pilot-uniquac/run.py",
}
assert protocol["sha256Links"] == {key: sha(path) for key, path in paths.items()}

augmentation = json.loads(paths["augmentation"].read_text())
assert len(augmentation["rows"]) == 31
assert sorted({row[1] for row in augmentation["rows"]}) == [288.15, 298.15, 308.15, 318.15]
assert augmentation["citation"]["doi"] == "10.1021/je050191r"
assert augmentation["citation"]["nistRawSha256"] == "66e2ab090af6d85b28ce83fa94481c30d836666fbdaa5285c09d6813d424de69"
for _, _, xr_sat, xr_mono, xe_sat, xe_mono in augmentation["rows"]:
    assert 0 <= 1 - xr_sat - xr_mono <= 1
    assert 0 <= 1 - xe_sat - xe_mono <= 1

split = json.loads(paths["frozenHoldouts"].read_text())
assert set(split["unseenSystem"]["ids"]).isdisjoint(split["leaveTemperatureOut"]["ids"])
assert split["unseenSystem"]["identities"] == ["n-tetradecane", "n-pentylbenzene"]

first = run_once()
second = run_once()
assert first == second, "repeated resume qualification changed byte output"
result = json.loads(first["results.json"])
assert result["decision"] == "REJECT"
assert result["governingStatus"] == "FAIL_CLOSED"
assert result["evidence"]["baselineRows"] == 219
assert result["evidence"]["addedRows"] == 31
assert result["evidence"]["totalRows"] == 250
structural = result["evidence"]["structuralProvenance"]
assert structural["formula"] == "C10H14"
assert structural["subgroups"] == {"1": 2, "13": 1, "2": 1, "9": 5}
assert structural["ACCH"]["subgroup"] == 13
assert structural["ACCH"]["name"] == "ACCH"
assert structural["ACCH"]["R"] == 0.8121
assert structural["ACCH"]["Q"] == 0.348
assert abs(structural["derivedR"] - (5*0.5313 + 0.8121 + 0.6744 + 2*0.9011)) < 1e-12
assert abs(structural["derivedQ"] - (5*0.4 + 0.348 + 0.54 + 2*0.848)) < 1e-12
assert result["graph"]["before"]["edgeCount"] == 6
assert result["graph"]["after"]["edgeCount"] == 7
assert result["leakageChecks"] == {
    "heldPairPresentInTraining": False,
    "heldTemperaturePresentInTraining": False,
    "status": "PASS",
    "trainHoldoutIdIntersection": [],
}
pair = result["holdouts"]["untouchedMolecularPair"]["metrics"]
temperature = result["holdouts"]["leaveTemperatureOut"]["metrics"]
assert pair["rows"] == 38 and pair["topologyRecall"] < 0.9 and pair["tieLineRmsd"] > 0.03
assert temperature["rows"] == 8 and temperature["topologyRecall"] < 0.9 and temperature["tieLineRmsd"] > 0.03
assert all(not gate["pass"] for gate in result["gates"].values())
assert result["fit"]["identifiability"]["success"]
assert result["fit"]["identifiability"]["rank"] == result["fit"]["identifiability"]["parameterCount"] == 20
assert result["comparison"]["weakDirectionsReduced"]
assert result["comparison"]["extrapolationDistanceReduced"]
assert result["comparison"]["task169"]["practicallyWeakDirections"] == 10
assert result["comparison"]["task171"]["practicallyWeakDirections"] == 9
assert result["comparison"]["task171"]["maximumNearestNormalizedDescriptorDistance"] == 0
assert result["boundaries"] == {
    "DI_POLY": "FAIL_CLOSED",
    "branching": "SCREEN_ONLY",
    "cycloalkane": "FAIL_CLOSED",
    "simulatorIntegrationPerformed": False,
    "sulfur": "FAIL_CLOSED",
}
provenance = json.loads(first["provenance.json"])
assert provenance["resultSha256"] == hashlib.sha256(first["results.json"]).hexdigest()
assert provenance["reportSha256"] == hashlib.sha256(first["report.md"]).hexdigest()
assert provenance["runSha256"] == sha(HERE / "run.py")
print("verified new molecular-pair qualification", result["decision"])