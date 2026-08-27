#!/usr/bin/env python3
"""Invariant verifier for the genuine openCOSMO-RS artifact."""
import hashlib,json,math,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; HERE=Path(__file__).resolve().parent
subprocess.run([sys.executable,str(HERE/"run.py")],check=True)
r=json.loads((ROOT/".agents/outputs/ecr-pre-pilot-cosmors/results.json").read_text())
assert r["finalDecision"] in {"ACCEPT","ACCEPT_WITH_LIMITATIONS","REJECT"}
assert len(r["benchmark"]["coto"])==17 and len(r["benchmark"]["multiT_supported"])==219 and not r["benchmark"]["multiT_blocked"]
man=json.loads((HERE/"provenance-manifest.json").read_text())
assert man["openCOSMORS_py_commit"]=="3db6614925ded5fc47a77d1e34f4a1975e518a9b"
for n,h in man["openCOSMORS_py_sourceSha256"].items():assert hashlib.sha256((HERE/"vendor/python"/n).read_bytes()).hexdigest()==h
for n,h in man["profileDatabase"]["rawProfileSha256"].items():assert hashlib.sha256((HERE/"vendor/profiles/lvpp-v25"/n).read_bytes()).hexdigest()==h
for group in ("coto","multiT_supported"):
 for q in r["benchmark"][group]:
  assert q["TPD"]["gridPointCount"]>0 and len(q["TPD"]["minimizingComposition"])==len(q["components"])
  assert q["TPD"]["verdict"] in {"UNSTABLE_NEGATIVE_TPD","STABLE_NO_NEGATIVE_TPD"} and q["massBalanceMaxResidual"]<1e-8
  assert math.isfinite(q["objectiveHomogeneous"]) and math.isfinite(q["objectiveSplit"])
  if q["converged"]:
   for p in ("RRBO_rich","NMP_rich"):assert abs(sum(q[p])-1)<1e-8
   assert q["beta_NMP_rich"] is not None and q["K_NMPrich_over_RRBO"] and q["isoactivityLogResidual"]<2e-5
  else:
   assert q["singleLiquidFraction"]==1 and abs(sum(q["singleLiquidComposition"])-1)<1e-8
   assert all(q[x] is None for x in ("RRBO_rich","NMP_rich","beta_NMP_rich","K_NMPrich_over_RRBO","selectivityRelativeToSaturate","isoactivityLogResidual"))
   if not q["optimizerSuccess"] or q["boundarySolution"] or q["TPD"]["refinedMinimum"] < -1e-7:assert q["phaseBehavior"]=="NONCONVERGED_OR_BOUNDARY"
  e=q["componentAbsoluteErrors"]; d=q["outcomeDiagnosticAbsoluteErrors"]
  assert (q["compositionRmsd"] is None if not e else abs(q["compositionRmsd"]-(sum(x*x for x in e)/len(e))**.5)<1e-12)
  assert abs(q["outcomeDiagnosticRmsd"]-(sum(x*x for x in d)/len(d))**.5)<1e-12
for q in r["representatives"]:
 assert q["T_C"] in (25.,50.,75.,100.) or q.get("substitution") in {"BENZOTHIOPHENE","THIOPHENE"}
 if not q["converged"]:assert q["sulfurPartitioning"]["moleDistributionCoefficient"] is None and q["sulfurPartitioning"]["reason"]
assert (ROOT/".agents/outputs/ecr-pre-pilot-cosmors/report.md").read_text().rstrip().endswith(r["finalDecision"])
d=r["dortmundComparison"]["reportedSummary"];assert d["coto"]["rowCount"]==17 and d["coto"]["twoPhaseRows"]==17
assert abs(d["coto"]["compositionRmsd"]-0.09320977738868816)<1e-15
print("verified")