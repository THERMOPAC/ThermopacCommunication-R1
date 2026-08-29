#!/usr/bin/env python3
"""Invariant verifier for the COSMO-SAC research artifact."""
import hashlib, json, math, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; p=ROOT/".agents/outputs/ecr-pre-pilot-cosmosac/results.json"
runner=ROOT/"server/research/ecr-pre-pilot-cosmosac/run.py"
subprocess.run([sys.executable,str(runner)],cwd=ROOT,check=True)
r=json.loads(p.read_text()); assert r["finalDecision"] in {"ACCEPT_FOR_QUANTITATIVE_LLE_GATE","REJECT"}
source_profiles=ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles"
source_provenance_path=ROOT/"server/research/ecr-pre-pilot-six-component-thermodynamics/provenance-manifest.json"
source_provenance=json.loads(source_provenance_path.read_text())
artifact_provenance=json.loads((ROOT/"server/research/ecr-pre-pilot-cosmosac/provenance-manifest.json").read_text())
assert artifact_provenance["runnerSha256"]==hashlib.sha256(runner.read_bytes()).hexdigest()
assert r["researchOnly"] is True and r["calibrationRequired"] is True
assert r["pilotValidated"] is False and r["releaseEligible"] is False
assert r["sulfurPrediction"]=="NOT_CALCULABLE"
assert artifact_provenance["researchOnly"] is True
assert artifact_provenance["calibrationRequired"] is True
assert artifact_provenance["pilotValidated"] is False
assert artifact_provenance["releaseEligible"] is False
assert artifact_provenance["sulfurPrediction"]=="NOT_CALCULABLE"
assert r["profileSource"]["directory"]=="server/research/ecr-pre-pilot-six-component-thermodynamics/generated/profiles"
assert r["profileSource"]["restrictedOrVendoredProfileInputsUsed"] is False
assert set(r["profileSource"]["profileSha256ByFamily"])=={"SAT","MONO","DI","POLY","PA","NMP"}
assert r["profileSource"]["complistSha256"]==hashlib.sha256((source_profiles/"complist.txt").read_bytes()).hexdigest()==source_provenance["complistSha256"]
for family,key in source_provenance["componentIdentityKeys"].items():
    actual=hashlib.sha256((source_profiles/"sigma3"/f"{key}.sigma").read_bytes()).hexdigest()
    assert r["profileSource"]["profileSha256ByFamily"][family]==actual==source_provenance["profileSha256ByFamily"][family]
assert artifact_provenance["sixComponentProfileProvenanceSha256"]==hashlib.sha256(source_provenance_path.read_bytes()).hexdigest()
assert artifact_provenance["profileSource"]==r["profileSource"]
assert r["runtime"]["cCOSMOBinarySha256"]==artifact_provenance["runtime"]["cCOSMOBinarySha256"]
runtime_binary=ROOT/r["runtime"]["cCOSMOModulePath"]
assert hashlib.sha256(runtime_binary.read_bytes()).hexdigest()==r["runtime"]["cCOSMOBinarySha256"]
runtime_vendor=(ROOT/r["runtime"]["vendorDirectory"]).resolve()
assert r["runtime"]["numpy"]=="2.1.3" and r["runtime"]["scipy"]=="1.14.1"
assert runtime_binary.resolve().is_relative_to(runtime_vendor)
assert r["model"]["lnGamma"]=="get_lngamma_comb(T,x)+get_lngamma_resid(T,x)"
grid=r["frozenGrid"]
assert grid["temperaturesK"]==[298.15,313.15,323.15,333.15,348.15]
assert grid["compositions"]==[[.45,.12,.10,.06,.07,.20],[.20,.20,.20,.10,.10,.20],[.70,.05,.05,.05,.05,.10],[.10,.05,.05,.05,.05,.70]]
assert grid["caseCount"]==20 and len(grid["cases"])==20
expected_pairs=[(temperature,composition) for temperature in grid["temperaturesK"] for composition in grid["compositions"]]
actual_pairs=[(q["temperatureK"],q["overallComposition"]) for q in grid["cases"]]
assert actual_pairs==expected_pairs
assert len({q["caseId"] for q in grid["cases"]})==20
assert len({q["pinnedInputSha256"] for q in grid["cases"]})==20
for q in grid["cases"]:
    assert len(q["pinnedInputSha256"])==64
    assert q["components"]==["SAT","MONO","DI","POLY","PA","NMP"]
    assert q["phaseBehavior"] in {"TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY"}
    pinned={"temperatureK":q["temperatureK"],"composition":q["overallComposition"],"components":q["components"]}
    expected_hash=hashlib.sha256(json.dumps(pinned,sort_keys=True,separators=(",",":")).encode()).hexdigest()
    assert q["pinnedInputSha256"]==expected_hash
    if q["converged"]:
        for phase in ("RRBO_rich","NMP_rich"):
            x=q[phase]; assert all(math.isfinite(v) and v>=0 for v in x) and abs(sum(x)-1)<1e-8
        assert 0<=q["beta_NMP_rich"]<=1 and q["K_NMPrich_over_RRBO"] and q["selectivityRelativeToSaturate"]
        assert q["singleLiquidComposition"] is None and q["singleLiquidFraction"] is None
        assert q["numericalFailureReasons"]==[]
    elif q["phaseBehavior"]=="PREDICTED_STABLE_SINGLE_PHASE":
        assert q["RRBO_rich"] is None and q["NMP_rich"] is None and q["beta_NMP_rich"] is None
        assert q["K_NMPrich_over_RRBO"] is None and q["selectivityRelativeToSaturate"] is None
        assert abs(sum(q["singleLiquidComposition"])-1)<1e-8 and q["singleLiquidFraction"]==1.0
        assert q["numericalFailureReasons"]==[]
    else:
        assert q["RRBO_rich"] is None and q["NMP_rich"] is None and q["beta_NMP_rich"] is None
        assert q["K_NMPrich_over_RRBO"] is None and q["selectivityRelativeToSaturate"] is None
        assert q["singleLiquidComposition"] is None and q["singleLiquidFraction"] is None
        assert q["numericalFailureReasons"]
    candidate=q["candidateSplitDiagnostics"]
    assert all(math.isfinite(v) for v in candidate["phaseAComposition"]+candidate["phaseBComposition"])
    assert math.isfinite(candidate["isoactivityLogResidual"]) and math.isfinite(candidate["massBalanceMaxResidual"])
    assert q["massBalanceMaxResidual"]<1e-8
    t=q["TPD"]; assert t["gridPointCount"]>0 and len(t["minimizingComposition"])==len(q["components"])
    assert t["verdict"] in {"UNSTABLE_NEGATIVE_TPD","STABLE_NO_NEGATIVE_TPD"}
    assert len(t["refinements"])==4 and isinstance(t["refinementConverged"],bool)
    assert math.isfinite(q["objectiveHomogeneous"]) and math.isfinite(q["objectiveSplit"])
counts={c:sum(q["phaseBehavior"]==c for q in grid["cases"]) for c in ("TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")}
assert r["topologyGate"]["counts"]==counts
assert r["topologyGate"]["passed"]==(counts["TWO_PHASE"]==20)
assert r["topologyGate"]["decision"]==("QUALITATIVE_TOPOLOGY_CONFIRMED" if r["topologyGate"]["passed"] else "QUALITATIVE_TOPOLOGY_FAILED")
assert artifact_provenance["caseInputSha256"]=={q["caseId"]:q["pinnedInputSha256"] for q in grid["cases"]}
assert r["admissionGates"]["quantitativeLle"]["admitted"] is False
assert r["admissionGates"]["sulfurPrediction"]["admitted"] is False
assert (ROOT/".agents/outputs/ecr-pre-pilot-cosmosac/report.md").read_text().rstrip().endswith(r["finalDecision"])
print("verified",p)