#!/usr/bin/env python3
"""Independent invariants and deterministic-reproduction checks for Task 197."""
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-cosmosac-qualification"
RUNNER = HERE / "run.py"
PROTOCOL = HERE / "protocol.json"

# Validate the delivered artifact before invoking the producer.
delivered_results = (OUT / "results.json").read_bytes()
delivered_report = (OUT / "report.md").read_bytes()
delivered_manifest = (OUT / "provenance-manifest.json").read_bytes()
r = json.loads(delivered_results)
p = json.loads(PROTOCOL.read_text())
names = p["componentOrder"]
charge = r["stage1Charge"]
z = [charge["overallMolarComposition"][name] for name in names]
assert all(math.isfinite(v) and v > 0 for v in z)
assert abs(sum(z) - 1.0) < 1e-12

# Reconstruct Stage-1 mass-to-mole conversion independently.
authoritative_mw = {
    "SAT": 170.3348, "MONO": 120.194, "DI": 142.1971,
    "POLY": 202.2506, "PA": 405.58, "NMP": 99.1311,
}
assert charge["molecularWeightsGmol"] == authoritative_mw
masses = dict(p["stage1Basis"]["feedMassPercent"])
masses["NMP"] += 100.0 * p["stage1Basis"]["solventOilMassRatio"]
raw_moles = [masses[name] / authoritative_mw[name] for name in names]
expected_z = [v / sum(raw_moles) for v in raw_moles]
assert max(abs(a - b) for a, b in zip(z, expected_z)) < 1e-14

assert r["activityAtOverallComposition"]["executed"] is True
assert set(r["activityAtOverallComposition"]["lnGamma"]) == set(names)
assert all(math.isfinite(v) for v in r["activityAtOverallComposition"]["lnGamma"].values())
stability = r["phaseStability"]
assert stability["executed"] is True and stability["refinementConverged"] is True
assert stability["minimumTpd"] >= p["numericalAcceptance"]["negativeTpdThreshold"]
assert stability["verdict"] == "STABLE_NO_NEGATIVE_TPD"

flash = r["flash"]
assert flash["attempted"] is True and flash["optimizerConverged"] is True
assert flash["acceptedTwoLiquidSolution"] is False
assert flash["predictedPhaseCount"] == 1
assert flash["phaseBehavior"] == "PREDICTED_STABLE_SINGLE_PHASE"
assert flash["gibbsReduction"] < p["numericalAcceptance"]["minimumGibbsReduction"]
assert flash["materialBalanceMaxResidual"] <= p["numericalAcceptance"]["maximumMaterialBalanceResidual"]
assert flash["numericalFailureReasons"] == []
assert flash["RRBO_rich"] is None and flash["NMP_rich"] is None
assert flash["betaNmpRich"] is None and flash["distributionRatios"] is None

assert r["qualification"]["fullSixComponentQualification"] == "INPUT_NOT_AVAILABLE"
assert r["qualification"]["designPredictionStatus"] == "CALCULATED_RESEARCH_ONLY"
assert r["researchOnly"] and r["calibrationRequired"]
assert not r["pilotValidated"] and not r["releaseEligible"]
assert r["sulfurPrediction"] == "NOT_CALCULABLE"

manifest = json.loads((OUT / "provenance-manifest.json").read_text())
assert manifest["protocolSha256"] == hashlib.sha256(PROTOCOL.read_bytes()).hexdigest()
assert manifest["runnerSha256"] == hashlib.sha256(RUNNER.read_bytes()).hexdigest()
engine_path = ROOT / "server/research/ecr-pre-pilot-cosmosac/run.py"
assert manifest["engineSha256"] == hashlib.sha256(engine_path.read_bytes()).hexdigest()
assert manifest["resultsSha256"] == hashlib.sha256(delivered_results).hexdigest()
assert manifest["reportSha256"] == hashlib.sha256(delivered_report).hexdigest()
profile_provenance = json.loads((
    ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json"
).read_text())
profiles = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles/sigma3"
for name in names:
    key = profile_provenance["componentIdentityKeys"][name]
    actual = hashlib.sha256((profiles / f"{key}.sigma").read_bytes()).hexdigest()
    assert manifest["componentProfileSha256ByFamily"][name] == actual

# Reproduce in isolation; the submitted outputs above must remain untouched.
with tempfile.TemporaryDirectory(prefix="task197-verify-") as temp:
    env = dict(__import__("os").environ)
    env["TASK197_OUTPUT_DIR"] = temp
    subprocess.run([sys.executable, str(RUNNER)], cwd=ROOT, env=env, check=True)
    reproduced_results = Path(temp, "results.json").read_bytes()
    reproduced_report = Path(temp, "report.md").read_bytes()
    reproduced_manifest = json.loads(Path(temp, "provenance-manifest.json").read_text())
    assert reproduced_results == delivered_results
    assert reproduced_report == delivered_report
    assert reproduced_manifest == manifest
print("TASK_197_STAGE1_QUALIFICATION_VERIFIED")