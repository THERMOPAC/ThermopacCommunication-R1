#!/usr/bin/env python3
"""Deterministic fail-closed verifier for descriptor-transfer outputs."""
from pathlib import Path
import hashlib, json, subprocess, sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-descriptor-transfer"
REGISTRATION_REFERENCE = HERE / "registration-commit.txt"
names = ("results.json", "provenance.json", "report.md")
assert REGISTRATION_REFERENCE.exists(), "registration reference is required after the protocol freeze commit"
registration_commit = REGISTRATION_REFERENCE.read_text()
assert registration_commit.endswith("\n") and len(registration_commit.strip()) == 40
assert all(c in "0123456789abcdef" for c in registration_commit.strip())
freeze_commit = registration_commit.strip()
assert subprocess.run(["git", "merge-base", "--is-ancestor", freeze_commit, "HEAD"]).returncode == 0, (
    "registration commit must be an ancestor of HEAD")
for frozen_name in (
    "frozen-protocol.json",
    "descriptor-registry.json",
    "frozen-holdouts.json",
    "fit-start.json",
    "run.py",
):
    repo_path = f"server/research/ecr-pre-pilot-descriptor-transfer/{frozen_name}"
    committed = subprocess.run(
        ["git", "show", f"{freeze_commit}:{repo_path}"], check=True, capture_output=True
    ).stdout
    assert committed == (HERE/frozen_name).read_bytes(), (
        f"current {frozen_name} differs from registration commit {freeze_commit}")
checked_in = {name: (OUT/name).read_bytes() for name in names} if all((OUT/name).exists() for name in names) else None
subprocess.run([sys.executable, str(HERE/"run.py")], check=True)
first = {name: (OUT/name).read_bytes() for name in names}
if checked_in is not None:
    assert first == checked_in
r = json.loads(first["results.json"])
p = json.loads(first["provenance.json"])
protocol = json.loads((HERE/"frozen-protocol.json").read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
assert r["integratedIntoSimulator"] is False
assert protocol["freezeClaim"].startswith("Task-local pre-fit protocol declaration ")
assert "no external timestamp" in protocol["freezeClaim"]
assert protocol["sha256Links"]["descriptorRegistry"] == sha(HERE/"descriptor-registry.json")
assert protocol["sha256Links"]["frozenHoldouts"] == sha(HERE/"frozen-holdouts.json")
assert protocol["sha256Links"]["fitStart"] == sha(HERE/"fit-start.json")
assert protocol["sha256Links"]["tieLineSource"] == sha(ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json")
assert protocol["sha256Links"]["qualifiedUniquacImplementation"] == sha(ROOT/"server/research/ecr-pre-pilot-uniquac/run.py")
assert r["sources"]["frozenProtocol"]["sha256"] == sha(HERE/"frozen-protocol.json")
assert r["sources"]["registrationReference"]["freezeCommit"] == registration_commit.strip()
assert protocol["gates"]["topologyRecallMinimum"] == .9 and protocol["gates"]["tieLineRmsdMaximum"] == .03
assert r["leakageChecks"]["status"] == "PASS"
assert r["leakageChecks"]["trainHoldoutIdIntersection"] == []
assert not r["leakageChecks"]["unseenIdentityPresentInTrain"]
assert not r["leakageChecks"]["heldTemperaturePresentInTrain"]
assert r["leakageChecks"]["trainCount"] == 183
assert r["leakageChecks"]["unseenSystemCount"] == 28
assert r["leakageChecks"]["leaveTemperatureOutCount"] == 8
assert r["gates"]["topologyRecall"]["threshold"] == .90
assert r["gates"]["tieLineRmsd"]["threshold"] == .03
for holdout in r["holdouts"].values():
    assert holdout["metrics"]["rows"] == len(holdout["rows"])
    for row in holdout["rows"]:
        assert row["qualificationOutcome"] in ("PASS", "FAIL")
        assert row["tpd"]["latticePoints"] > 0
        assert row["tpd"]["refinementAttempts"] >= row["tpd"]["distinctRefinedBasins"]
        assert row["seedContractPass"]
        if row["phaseBehavior"] == "PREDICTED_TWO_PHASE":
            check = row["independentFinalPhaseChecks"]
            assert check["pass"] and check["massBalanceMax"] < 1e-9
            assert check["isoactivityMax"] < 2e-4 and check["gibbsDecrease"] > 1e-8
            assert all(x["minimum"] >= -1e-8 for x in check["postSplitTPD"].values())
            assert row["qualificationOutcome"] == ("PASS" if row["qualified"] else "FAIL")
        else:
            assert row["qualificationOutcome"] == "FAIL"
            assert row["diagnosticStatus"].startswith("FAIL_")
            assert row["independentFinalPhaseChecks"] is None
    accepted = [x for x in holdout["rows"] if x["compositionRmsd"] is not None]
    sse = sum(x["activeEndpointSquaredError"] for x in accepted)
    count = sum(x["activeEndpointComponentCount"] for x in accepted)
    assert abs(holdout["metrics"]["tieLineRmsd"]-(sse/count)**.5) < 1e-14
assert r["gates"]["thermodynamicQualification"]["pass"] == all(
    x["qualificationOutcome"] == "PASS" for h in r["holdouts"].values() for x in h["rows"])
ad = r["applicabilityDomain"]
assert not ad["trueUnseenSystem"]["allHydrocarbonSystemsSeenInTraining"]
assert ad["trueUnseenSystem"]["descriptorStatus"] == "EXTRAPOLATION"
assert ad["leaveTemperatureOut"]["temperatureInsideCoordinateRange"]
assert ad["leaveTemperatureOut"]["temperatureStatus"] == "INTERPOLATION"
sens = r["uncertainty"]["predictionSensitivity"]
assert sens["sentinelIds"] == protocol["uncertaintyProtocol"]["sentinelIds"]
assert len(sens["minus"]["rows"]) == len(sens["plus"]["rows"]) == 5
assert sens["topologyRecallRange"][0] <= sens["topologyRecallRange"][1]
for key in ("DI_POLY_temperature_transfer", "polar_heteroatom", "sulfur"):
    assert r["dataGaps"][key]["status"] == "FAIL_CLOSED"
assert r["dataGaps"]["simulatorIntegration"]["performed"] is False
assert p["resultSha256"] == hashlib.sha256(first["results.json"]).hexdigest()
assert p["parameterBinary64Sha256"] == r["fit"]["parameterBinary64Sha256"]
print("verified descriptor transfer", r["decision"],
      r["holdouts"]["trueUnseenSystem"]["metrics"],
      r["holdouts"]["leaveTemperatureOut"]["metrics"])