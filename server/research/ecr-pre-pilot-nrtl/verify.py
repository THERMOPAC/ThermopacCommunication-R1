#!/usr/bin/env python3
"""Fail-closed verifier for the isolated NRTL artifact."""
from pathlib import Path
import hashlib,json,subprocess,sys
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[2]; OUT=ROOT/".agents/outputs/ecr-pre-pilot-nrtl"
subprocess.run([sys.executable,str(HERE/"run.py")],check=True)
r=json.loads((OUT/"results.json").read_text()); m=json.loads((OUT/"provenance-manifest.json").read_text())
a=json.loads((OUT/"audit.json").read_text())
assert r["sources"]["coto"]["count"]==17 and r["sources"]["multi_t"]["count"]==219
for k in ("coto","multi_t"):
    p=ROOT/r["sources"][k]["path"]; assert hashlib.sha256(p.read_bytes()).hexdigest()==r["sources"][k]["sha256"]
assert r["fitting_declaration"]["alpha"]["value"]==.30 and r["fitting_declaration"]["unsupported_family"]=="Polar Aromatics"
assert len(r["validation"])==236 and r["six_family_diagnostic"]["Polar Aromatics"] is None
assert r["decision"] in ("ACCEPT","ACCEPT_WITH_LIMITATIONS","REJECT")
assert m["parameter_hash"]==r["fit"]["parameters_sha256"]
assert r["fitting_declaration"]["fitted_parameter_count"]==26 and len(r["fit"]["parameters"])==26
assert sum(q["form"]=="a+b/T" for q in r["parameter_mapping"])==6
assert all(q["b_fixed"]==0 for q in r["parameter_mapping"] if q["form"]=="tau@298.15K")
assert r["dependencies"]["path"]=="server/research/ecr-pre-pilot-cosmors/vendor/python"
assert m["numpy"]==r["dependencies"]["numpy"] and m["scipy"]==r["dependencies"]["scipy"]
assert r["fit"]["solver_diagnostics"]["jacobian_shape"][1]==26
md=r["fit"]["solver_diagnostics"]["measurement_only_jacobian"]
assert md["rows"]==r["fit"]["equilibrium_log_activity_residuals"]["train"]["count"]
assert md["columns"]==26 and len(md["singular_values"])==26
assert md["rank"]<=26 and len(md["pseudo_covariance_standard_errors"])==26
assert md["practically_weak_directions"]>0
assert r["fit"]["solver_diagnostics"]["limitations"]["large_uncertainty_flag"] is True
assert r["fit"]["solver_diagnostics"]["estimation_class"].startswith("regularization-constrained")
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
assert r["fiveFamilyCandidateGate"]["topology_pass"] is True
assert r["fiveFamilyCandidateGate"]["composition_rmsd_pass"] is False
cats=("PREDICTED_TWO_PHASE","PREDICTED_STABLE_SINGLE_PHASE","NONCONVERGED_OR_BOUNDARY")
assert sum(r["metrics"]["train"]["categories"].values())==221 and sum(r["metrics"]["holdout"]["categories"].values())==15
for q in r["validation"]:
    assert q["label"] in ("train","holdout")
    analog=q["id"].startswith("analogue-")
    assert q["activeFamilies"]==(["SAT","MONO","NMP"] if analog else ["SAT","MONO","DI","POLY","NMP"])
    assert q["activeMask"]==([True,True,False,False,True] if analog else [True]*5)
    assert q["stabilityLattice"]["denominator"]==(8 if analog else 4)
    assert q["stabilityLattice"]["point_count"]==(45 if analog else 70)
    assert q["stabilityLattice"]["all_points_evaluated"]==q["stabilityLattice"]["point_count"]
    assert q["globalSelection"]["eligibleCandidates"]+q["globalSelection"]["rejectedCandidates"]==q["optimizer_attempts"]
    assert sum(bool(s.get("selectedByGlobalRule")) for s in q["multistartSolutions"])==(1 if q["globalSelection"]["eligibleCandidates"] else 0)
    if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
        assert q["massBalanceMaxResidual"] < 1e-9 and q["isoactivityLogResidual"] < 2e-4
        assert abs(sum(q["RRBO_rich"])-1)<1e-9 and abs(sum(q["NMP_rich"])-1)<1e-9
    elif not q["converged"]: assert q["phaseBehavior"]=="NONCONVERGED_OR_BOUNDARY"
    else: assert q["phaseBehavior"]=="PREDICTED_STABLE_SINGLE_PHASE"
print("verified: isolated regularization-constrained NRTL artifact; decision",r["decision"])