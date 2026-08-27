#!/usr/bin/env python3
"""Fail-closed verifier for the isolated NRTL artifact."""
from pathlib import Path
import hashlib,json,subprocess,sys
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; OUT=ROOT/".agents/outputs/ecr-pre-pilot-nrtl"
subprocess.run([sys.executable,str(HERE/"run.py")],check=True)
r=json.loads((OUT/"results.json").read_text()); m=json.loads((OUT/"provenance-manifest.json").read_text())
a=json.loads((OUT/"audit.json").read_text())
s=json.loads((OUT/"solver-isolation.json").read_text())
assert r["sources"]["coto"]["count"]==17 and r["sources"]["multi_t"]["count"]==219
for k in ("coto","multi_t"):
    p=ROOT/r["sources"][k]["path"]; assert hashlib.sha256(p.read_bytes()).hexdigest()==r["sources"][k]["sha256"]
assert r["fitting_declaration"]["alpha"]["value"]==.30 and r["fitting_declaration"]["unsupported_family"]=="Polar Aromatics"
assert len(r["validation"])==236 and r["six_family_diagnostic"]["Polar Aromatics"] is None
assert r["decision"] in ("ACCEPT","ACCEPT_WITH_LIMITATIONS","REJECT")
assert m["parameter_hash"]==r["fit"]["parameters_sha256"]
assert r["fitting_declaration"]["fitted_parameter_count"]==26 and len(r["fit"]["parameters"])==26
assert r["fit"]["fitCalled"] is False
assert r["fit"]["execution"].startswith("frozen parameters loaded")
assert r["fit"]["parameters_sha256"]=="ecaf60082eefec144c106f6697cd6650aab69b3b8fa07fb1d62bad5ac9da1d34"
assert r["fit"]["frozenArtifact"]["validated_before_flash"] is True
assert r["fit"]["frozenArtifact"]["parameter_mapping_sha256"]=="9cf48a895d8b9b3999bb08239d9e4153ffab74770b53feb488a7b4c3353cd0c9"
assert s["fitCalled"] is False and s["frozenParameterHash"]==r["fit"]["parameters_sha256"]
assert s["basins"]["competitive_points_refined"]>=s["basins"]["distinct_refined_basins"]>0
assert sum(q["form"]=="a+b/T" for q in r["parameter_mapping"])==6
assert all(q["b_fixed"]==0 for q in r["parameter_mapping"] if q["form"]=="tau@298.15K")
assert r["dependencies"]["path"]=="server/research/ecr-pre-pilot-cosmors/vendor/python"
assert m["numpy"]==r["dependencies"]["numpy"] and m["scipy"]==r["dependencies"]["scipy"]
assert r["fit"]["equilibrium_log_activity_residuals"]["train"]["count"] > 0
assert r["sixFamilyStage2Status"]=="NOT_CALCULABLE"
assert r["governingAdmissionEligible"] is False
assert not all(r["sixFamilyAdmissionDependencies"].values())
assert r["decision"]=="REJECT"
assert r["implementationAudit"]["status"]==a["implementationAuditStatus"]
assert a["frozenParameterHash"]==r["fit"]["parameters_sha256"]
assert set(a["obligations"])=={"independentLngamma","KKT_isoactivity","TPD_and_Gibbs","massBalance","multistartAgreement"}
assert {"coto-2","coto-9","coto-14"}.issubset({x["id"] for x in a["manualReproductions"]})
assert any(x["id"].startswith("analogue-") and abs(x["T_K"]-323.2)<.051 for x in a["manualReproductions"])
for c in a["gammaComparisons"]:
    ds=[abs(x-y) for x,y in zip(c["primarySerialized"],c["independent"])]
    assert all(abs(x-y)<1e-15 for x,y in zip(ds,c["absoluteDifferences"]))
    assert abs(max(ds)-c["maxDifference"])<1e-15
for t in a["acceptedTwoPhaseThermodynamics"]:
    assert t["TPDMinimum"]<0 and t["selectedTwoPhaseReducedGibbs"]<t["homogeneousReducedGibbs"]
    assert abs((t["homogeneousReducedGibbs"]-t["selectedTwoPhaseReducedGibbs"])-t["gibbsDecrease"])<1e-10
for x in a["manualReproductions"]:
    assert len(x["multistartSolutions"])>=4
    assert x["independentMultistart"]["agreement"] is True
    assert x["independentMultistart"]["eligible_stationary_candidates"]>=2
    assert x["independentMultistart"]["reproduced_global_equilibrium_copies"]>=2
    assert x["independentMultistart"]["canonical_output_agreement"] is True
    assert x["independentMultistart"]["materially_distinct_reproduction"] is True
    assert x["independentMultistart"]["maximum_phase_swap_invariant_seed_distance"]>=a["obligations"]["multistartAgreement"]["tolerances"]["seed_state_distance"]
    assert len(x["independentMultistart"]["maximum_distance_start_pair"])==2
    assert x["independentMultistart"]["rejected_stationary_candidates"]>=0
    if x["componentBalances"] is not None:
        assert abs(max(abs(v) for v in x["componentBalances"])-x["componentBalanceMax"])<1e-15
statuses=[v["status"] for v in a["obligations"].values()]
assert a["implementationAuditStatus"]==("PASS" if all(v=="PASS" for v in statuses) else "FAIL")
cats=("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY","AMBIGUOUS_UNRESOLVED")
assert sum(r["metrics"]["train"]["categories"].values())==221 and sum(r["metrics"]["holdout"]["categories"].values())==15
for q in r["validation"]:
    assert q["label"] in ("train","holdout")
    analog=q["id"].startswith("analogue-")
    assert q["activeFamilies"]==(["SAT","MONO","NMP"] if analog else ["SAT","MONO","DI","POLY","NMP"])
    assert q["activeMask"]==([True,True,False,False,True] if analog else [True]*5)
    assert q["stabilityLattice"]["denominator"]==(8 if analog else 4)
    assert q["stabilityLattice"]["point_count"]==(45 if analog else 70)
    assert q["stabilityLattice"]["all_points_evaluated"]==q["stabilityLattice"]["point_count"]
    assert q["stabilityLattice"]["refinement_attempts"]==q["stabilityLattice"]["competitive_lattice_points"]
    assert q["stabilityLattice"]["refinement_successes"]>=q["stabilityLattice"]["distinct_refined_basins"]
    assert q["globalSelection"]["eligibleCandidates"]+q["globalSelection"]["rejectedCandidates"]==q["optimizer_attempts"]
    assert q["stabilityLattice"]["refinement_attempts"]==q["stabilityLattice"]["competitive_lattice_points"]
    assert all("independentTotalReducedGibbs" in c and "admissibilityDiagnostics" in c for c in q["stationaryClusters"])
    expected_selected=1 if q["globalSelection"]["eligibleCandidates"] and q["phaseBehavior"]!="AMBIGUOUS_UNRESOLVED" else 0
    assert sum(bool(s.get("selectedByGlobalRule")) for s in q["multistartSolutions"])==expected_selected
    if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
        assert q["massBalanceMaxResidual"] < 1e-9 and q["isoactivityLogResidual"] < 2e-4
        assert abs(sum(q["RRBO_rich"])-1)<1e-9 and abs(sum(q["NMP_rich"])-1)<1e-9
        assert q["independentFinalPhaseChecks"]["pass"] is True
        for ps in q["independentFinalPhaseChecks"]["postSplitTPD"].values():
            assert ps["minimum"]>=-q["clusterTolerances"]["post_split_tpd"]
            assert ps["latticePointsEvaluated"]==ps["latticePointCount"]
            assert ps["refinementAttempts"]==ps["competitivePoints"]
    elif q["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED":
        assert q["converged"] is False and q["RRBO_rich"] is None and q["NMP_rich"] is None and q["beta_NMP_rich"] is None
    elif not q["converged"]: assert q["phaseBehavior"]=="NONCONVERGED_OR_BOUNDARY"
    else: assert q["phaseBehavior"]=="PREDICTED_STABLE_SINGLE_PHASE"
assert r["expClamp"]["primary"]["calls"]>0 and r["expClamp"]["standaloneFinalGate"]["calls"]>0
assert r["expClamp"]["primary"]["activations"]==0 and r["expClamp"]["standaloneFinalGate"]["activations"]==0
assert r["expClamp"]["status"]=="PASS"
assert s["syntheticRecovery"]["pass"] is True
assert s["syntheticRecovery"]["recovered"]["materiallyDifferentStarts"]>=2
assert s["solverIsolationAuditStatus"]=="PASS"
assert s["overallStatus"]=="PASS"
ev=s["executionEvidence"]
assert s["preHoldoutIsolationStatus"]=="PASS" and s["preHoldoutAuditStatus"]=="PASS"
assert s["qualificationRowIds"]==["coto-1","analogue-2","analogue-205"]
assert set(s["qualificationRowIds"]).isdisjoint(s["holdoutRowIds"])
assert set(ev["dataTouchedBeforePass"])==set(s["qualificationRowIds"])
assert set(ev["dataTouchedBeforePass"]).isdisjoint(ev["holdoutRowIds"])
assert ev["sequence"].index("PRE_HOLDOUT_ISOLATION_PASS") < ev["sequence"].index("HOLDOUT_EVALUATED")
assert ev["qualificationFlashCalls"]==len(s["qualificationRowIds"])==3
assert ev["holdoutEvaluationStartedAfterIsolationPass"] is True and ev["holdoutFlashCalls"]==15
assert s["holdoutComparison"]["status"]=="RUN"
assert s["holdoutComparison"]["baseline"]["meanTieLineRMSD"]==.11417738749864874
assert set(s["holdoutComparison"]["cotoBaseline"])=={"coto-2","coto-9","coto-14"}
print("verified: isolated regularization-constrained NRTL artifact; decision",r["decision"])