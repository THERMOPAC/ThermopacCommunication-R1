#!/usr/bin/env python3
"""Consistency verifier; normal execution only consumes frozen parameters."""
from pathlib import Path
import hashlib,json,subprocess,sys,math
HERE=Path(__file__).parent;ROOT=HERE.parents[2];OUT=ROOT/".agents/outputs/ecr-pre-pilot-uniquac"
split_bytes={n:(HERE/n).read_bytes() for n in ("frozen-train.json","frozen-holdout.json")}
subprocess.run([sys.executable,str(HERE/"run.py")],check=True)
# Independently force reconstruction from admitted originals after normal
# execution and require canonical byte identity with both checked-in snapshots.
subprocess.run([sys.executable,str(HERE/"run.py"),"--prepare-splits"],check=True)
assert all((HERE/n).read_bytes()==b for n,b in split_bytes.items())
r=json.loads((OUT/"results.json").read_text());s=json.loads((OUT/"solver-isolation.json").read_text());a=json.loads((OUT/"audit.json").read_text())
assert r["split"]["trainCount"]==221 and r["split"]["holdoutCount"]==15 and len(r["validation"])==236
assert r["structuralCoverage"]["allRowsResolvedWithoutFallback"] and r["fit"]["fitCalled"] is False
assert r["independentEquationAudit"]["status"]=="PASS" and s["preHoldoutIsolationStatus"]=="PASS"
assert s["executionEvidence"]["sequence"].index("PRE_HOLDOUT_ISOLATION_PASS")<s["executionEvidence"]["sequence"].index("HOLDOUT_EVALUATED")
assert s["executionEvidence"]["holdoutFlashCalls"]==15 and a["implementationAuditStatus"]=="PASS"
assert hashlib.sha256((HERE/"frozen-parameters.json").read_bytes()).hexdigest()==r["fit"]["frozenArtifactSha256"]
f=json.loads((HERE/"frozen-parameters.json").read_text())
assert s["frozenParameterHash"]==r["fit"]["parameters_sha256"]==f["parameters_sha256"]
assert s["parameterMappingHash"]==f["parameter_mapping_sha256"] and f["structural_provenance_sha256"]==r["structuralCoverage"]["structuralProvenanceSha256"]
expected=["coto-2","coto-9","coto-13","coto-14","coto-15","coto-16","coto-17"]+[f"analogue-{n}" for n in range(212,220)]
assert r["split"]["holdoutIds"]==expected and s["executionEvidence"]["holdoutRowIds"]==expected
ev=s["executionEvidence"];assert set(ev["thermodynamicRowIdsEvaluatedBeforePass"]).isdisjoint(expected)
assert ev["qualificationFlashCalls"]==3 and ev["trainFlashCalls"]==221
assert s["basins"]["competitive_points_refined"]>=s["basins"]["distinct_refined_basins"]>0
assert s["fullBasinAccounting"] and s["noAmbiguousRequiredAuditCase"] and s["independentFinalPhaseChecksPass"]
assert s["syntheticRecovery"]["pass"] and s["syntheticRecovery"]["recovered"]["compositionMaxDelta"]<=s["syntheticRecovery"]["tolerances"]["composition"]
assert s["syntheticRecovery"]["recovered"]["betaDelta"]<=s["syntheticRecovery"]["tolerances"]["beta"]
clogs=[s["clampLog"][k] for k in ("primary","standaloneFinalGate","standaloneAudit")]
assert all(q["activations"]==0 and q["calls"]>0 for q in clogs)
assert len({q["calls"] for q in clogs})==3 and s["clampLog"]["status"]=="PASS"
assert len(r["modelDeclaration"]["parameter_mapping"])==20
assert sum(m["form"]=="a+b/T" for m in r["modelDeclaration"]["parameter_mapping"])==6
stab={x["identity"]:x for x in json.loads((HERE/"structural-provenance.json").read_text())["all_molecules"]}
def verifier_gibbs(q,state):
 active=[("SAT","MONO","DI","POLY","NMP").index(x) for x in q["activeFamilies"]];rr=[0.]*5;qq=[0.]*5
 for i,n in zip(active,q["molecularIdentities"]):rr[i]=stab[n]["r"];qq[i]=stab[n]["q"]
 tau=[[1. if i==j else 0. for j in range(5)] for i in range(5)];k=0
 for m in r["modelDeclaration"]["parameter_mapping"]:
  e=-(f["parameters"][k]+(f["parameters"][k+1]/q["T_K"] if m["form"]=="a+b/T" else 0));k+=2 if m["form"]=="a+b/T" else 1;tau[m["i"]][m["j"]]=math.exp(e)
 def lg(v):
  x=[0.]*5;s=sum(max(v[i],1e-14) for i in active)
  for i in active:x[i]=max(v[i],1e-14)/s
  sr=sum(x[i]*rr[i] for i in active);sq=sum(x[i]*qq[i] for i in active);phi=[0.]*5;th=[0.]*5;ell=[5*(rr[i]-qq[i])-(rr[i]-1) for i in range(5)]
  for i in active:phi[i]=x[i]*rr[i]/sr;th[i]=x[i]*qq[i]/sq
  xl=sum(x[i]*ell[i] for i in active);g=[0.]*5
  for i in active:g[i]=math.log(phi[i]/x[i])+5*qq[i]*math.log(th[i]/phi[i])+ell[i]-phi[i]/x[i]*xl+qq[i]*(1-math.log(sum(th[j]*tau[j][i] for j in active))-sum(th[j]*tau[i][j]/sum(th[n]*tau[n][j] for n in active) for j in active))
  return x,g
 x,gx=lg(state["RRBO_rich"]);y,gy=lg(state["NMP_rich"]);b=state["beta_NMP_rich"]
 return sum((1-b)*x[i]*(math.log(x[i])+gx[i])+b*y[i]*(math.log(y[i])+gy[i]) for i in active)
assert r["gates"]["topology"]["threshold"]==.9 and r["gates"]["compositionRmsd"]["threshold"]==.03 and r["decision"]=="REJECT"
assert r["fit"]["diagnostics"]["measurement_only_jacobian"]["practically_weak_directions"]==9
for q in r["validation"]:
 assert q["stabilityLattice"]["refinement_attempts"]==q["stabilityLattice"]["competitive_lattice_points"]
 sp=q["seedProvenance"];nb=q["stabilityLattice"]["distinct_refined_basins"]
 assert sp["allRefinedBasinsSeeded"] and len(sp["tpdBasinToStartIndex"])==nb
 assert sp["homogeneousCount"]>0 and sp["boundaryCount"]>0 and sp["interiorCount"]>0
 assert len(set(sp["tpdBasinToStartIndex"].values()))==nb
 assert set(sp["tpdBasinToStartIndex"])=={str(i) for i in range(nb)}
 executed=set(sp["executedStartIndices"])
 assert executed==set(range(len(sp["seedIds"])))
 for i in range(nb):
  ix=sp["tpdBasinToStartIndex"][str(i)]
  assert isinstance(ix,int) and 0<=ix<len(sp["seedIds"]) and sp["seedIds"][ix]==f"TPD_BASIN_{i}" and ix in executed
 assert sum(sp["seedIds"][i].startswith("HOMOGENEOUS") for i in executed)==sp["homogeneousCount"]>0
 assert sum(sp["seedIds"][i].startswith("BOUNDARY") for i in executed)==sp["boundaryCount"]>0
 assert sum(sp["seedIds"][i].startswith("INTERIOR") for i in executed)==sp["interiorCount"]>0
 cs=q.get("stationaryClusters",[]);assert all("productionObjective" in c and "independentTotalReducedGibbs" in c and set(c["representativeCanonicalState"])=={"RRBO_rich","NMP_rich","beta_NMP_rich"} for c in cs)
 assert [c["independentTotalReducedGibbs"] for c in cs]==sorted(c["independentTotalReducedGibbs"] for c in cs)
 for c in cs:
  assert abs(c["independentTotalReducedGibbs"]-c["independentChecks"]["totalReducedGibbs"])<1e-12
  assert abs(c["independentTotalReducedGibbs"]-verifier_gibbs(q,c["representativeCanonicalState"]))<1e-11
 for c in q["clusterComparisons"]:
  assert c["materialDistinct"]==(max(c["xDistance"],c["yDistance"])>1e-5 or c["betaDistance"]>1e-6)
  assert c["nearDegenerate"]==(c["independentGibbsGap"]<=1e-8)
 amb=any(c["materialDistinct"] and c["nearDegenerate"] for c in q["clusterComparisons"])
 assert (q["phaseBehavior"]=="AMBIGUOUS_UNRESOLVED")==amb
 if amb:assert q["RRBO_rich"] is None and q["NMP_rich"] is None and q["beta_NMP_rich"] is None
 if q["phaseBehavior"]=="PREDICTED_TWO_PHASE":
  assert q["independentFinalPhaseChecks"]["pass"]
  for ps in q["independentFinalPhaseChecks"]["postSplitTPD"].values():
   assert ps["refinementAttempts"]==ps["competitivePoints"] and ps["minimum"]>=-1e-8
assert sum(r["metrics"]["holdout"]["categories"].values())==15 and sum(r["metrics"]["train"]["categories"].values())==221
assert abs(r["metrics"]["holdout"]["topology_recall"]-sum(q["phaseBehavior"]=="PREDICTED_TWO_PHASE" for q in r["validation"] if q["label"]=="holdout")/15)<1e-15
print("verified UNIQUAC frozen isolated artifact",r["decision"])