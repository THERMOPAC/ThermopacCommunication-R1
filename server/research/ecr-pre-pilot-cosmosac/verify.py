#!/usr/bin/env python3
"""Invariant verifier for the COSMO-SAC research artifact."""
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]; p=ROOT/".agents/outputs/ecr-pre-pilot-cosmosac/results.json"
r=json.loads(p.read_text()); assert r["finalDecision"] in {"ACCEPT","ACCEPT_WITH_LIMITATIONS","REJECT"}
assert r["model"]["lnGamma"]=="get_lngamma_comb(T,x)+get_lngamma_resid(T,x)"
assert len(r["benchmark"]["coto"])==17
assert len(r["benchmark"]["multiT_supported"])+len(r["benchmark"]["multiT_blocked"])==len(json.loads((ROOT/"server/engine-framework/cel/data/multi-t-nmp-lle.json").read_text())["tieLines"])
for group in ("coto","multiT_supported"):
 for q in r["benchmark"][group]:
  if q["converged"]:
   for phase in ("RRBO_rich","NMP_rich"):
    x=q[phase]; assert all(math.isfinite(v) and v>=0 for v in x) and abs(sum(x)-1)<1e-8
   assert 0<=q["beta_NMP_rich"]<=1 and q["K_NMPrich_over_RRBO"] and q["selectivityRelativeToSaturate"]
  else:
   assert q["RRBO_rich"] is None and q["NMP_rich"] is None and q["beta_NMP_rich"] is None
   assert q["K_NMPrich_over_RRBO"] is None and q["selectivityRelativeToSaturate"] is None
   assert abs(sum(q["singleLiquidComposition"])-1)<1e-8 and q["singleLiquidFraction"]==1.0
  assert q["massBalanceMaxResidual"]<1e-8
  t=q["TPD"]; assert t["gridPointCount"]>0 and len(t["minimizingComposition"])==len(q["components"])
  assert t["verdict"] in {"UNSTABLE_NEGATIVE_TPD","STABLE_NO_NEGATIVE_TPD"}
  assert math.isfinite(q["objectiveHomogeneous"]) and math.isfinite(q["objectiveSplit"])
  e=q["componentAbsoluteErrors"]
  if e: assert abs(q["compositionRmsd"]-(sum(v*v for v in e)/len(e))**.5)<1e-12 and q["maxAbsoluteError"]==max(e)
  d=q["outcomeDiagnosticAbsoluteErrors"]
  assert abs(q["outcomeDiagnosticRmsd"]-(sum(v*v for v in d)/len(d))**.5)<1e-12
  assert q["outcomeDiagnosticMaxAbsoluteError"]==max(d)
for q in r["representatives"]:
 assert q["phaseBehavior"]=="PREDICTED_STABLE_SINGLE_PHASE"
 assert q["sulfurPartitioning"]["moleDistributionCoefficient"] is None
 assert q["sulfurPartitioning"]["sulfurMassRecoveryToNMPrich"] is None
assert r["benchmark"]["cotoMetrics"]["outcomeDiagnosticRMSD"]>0
assert r["benchmark"]["multiTMetrics"]["outcomeDiagnosticRMSD"]>0
assert (ROOT/".agents/outputs/ecr-pre-pilot-cosmosac/report.md").read_text().rstrip().endswith(r["finalDecision"])
print("verified",p)