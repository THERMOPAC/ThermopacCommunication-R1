#!/usr/bin/env python3
"""Fail-closed deterministic verifier for heavy-aromatics temperature evidence."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-heavy-aromatics-temperature"
NAMES = ("results.json", "report.md", "provenance.json")

subprocess.run([sys.executable, str(HERE / "run.py")], check=True)
first = {name: (OUT / name).read_bytes() for name in NAMES}
subprocess.run([sys.executable, str(HERE / "run.py")], check=True)
second = {name: (OUT / name).read_bytes() for name in NAMES}
assert first == second

result = json.loads(first["results.json"])
provenance = json.loads(first["provenance.json"])
registry = json.loads((HERE / "evidence-registry.json").read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()

assert result["decision"] == "NOT_ESTABLISHED"
assert result["governingStatus"] == "FAIL_CLOSED"
assert result["evidenceInventory"]["cotoTieLineCount"] == 17
assert result["evidenceInventory"]["directHeavyAromaticTemperatures_K"] == [298.15]
assert result["identifiability"]["designMatrixRank"] == 1
assert result["identifiability"]["requiredRank"] == 2
assert not result["identifiability"]["interceptSlopeSeparatelyIdentifiable"]
assert not result["descriptorTransfer"]["heavyAromaticDefiningFeaturesWereFitted"]
assert result["descriptorTransfer"]["task169Decision"] == "REJECT"
assert result["descriptorTransfer"]["task169HeavyTemperatureGap"]["status"] == "FAIL_CLOSED"
assert result["simulatorIntegration"] == {
    "performed": False,
    "permitted": False,
    "status": "PROHIBITED"
}
assert registry["admissionRule"].startswith("A heavy-aromatic temperature model requires direct NMP")
assert registry["requiredExperiment"]["minimumIdentityCoverage"] == {"DI": 2, "POLY": 2}
assert all(
    Path(ROOT / path).exists() and sha(ROOT / path) == digest
    for path, digest in result["sources"].items()
)
assert provenance["runSha256"] == sha(HERE / "run.py")
assert provenance["resultSha256"] == hashlib.sha256(first["results.json"]).hexdigest()
assert provenance["reportSha256"] == hashlib.sha256(first["report.md"]).hexdigest()
report = first["report.md"].decode()
assert "temperature design matrix has rank" in report and "**1 of 2**" in report
assert "sample preparation" in report
assert "DI/POLY" in report and "temperature transfer remains `FAIL_CLOSED`" in report
print("verified heavy-aromatics temperature transfer", result["decision"])